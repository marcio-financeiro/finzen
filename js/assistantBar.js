/**
 * assistantBar.js — Faixa proativa do assistente FinZen
 *
 * Injeta no topo do dashboard uma faixa com insights gerados pela IA,
 * rolando como um ticker. Busca dados do Supabase localmente e envia
 * apenas o resumo para api/assistant.js — sem expor dados brutos.
 *
 * Cache: 6 horas em localStorage (não precisa chamar IA a cada abertura)
 */

import { supabase }       from './supabaseClient.js';
import { FINZEN_SECRET }  from './apiClient.js';

const CACHE_KEY  = 'finzen_assistant_bar_v1';
const CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 horas

// ── Cache ─────────────────────────────────────────────────────────────────────
function lerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch(_){ return null; }
}
function salvarCache(insights) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ insights, ts: Date.now() })); } catch(_){}
}
function cacheValido(c) { return c && (Date.now() - c.ts) < CACHE_TTL; }

// ── Coletar contexto mínimo do Supabase ───────────────────────────────────────
async function coletarContexto(userId) {
  const hoje     = new Date();
  const hojeISO  = hoje.toISOString().split('T')[0];
  const em7      = new Date(hoje.getTime() + 7 * 864e5).toISOString().split('T')[0];
  const ref      = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const inicio   = `${ref}-01`;

  const [
    { data: contas },
    { data: txMes },
    { data: faturas },
    { data: pendentes },
    { data: ciclos },
    { data: eventos },
    { data: metas },
  ] = await Promise.all([
    supabase.from('accounts').select('saldo_atual,currency').eq('user_id', userId).eq('active', true),
    supabase.from('transactions').select('type,amount,status').eq('user_id', userId).gte('date', inicio).lte('date', hojeISO),
    supabase.from('card_transactions').select('valor_parcela').eq('user_id', userId).eq('status', 'aberta').eq('fatura_referencia', ref),
    supabase.from('transactions').select('id').eq('user_id', userId).eq('status', 'pendente').gte('date', hojeISO).lte('date', em7),
    supabase.from('offshore_cycles').select('data_embarque,data_desembarque').eq('user_id', userId).order('data_embarque', { ascending: false }).limit(3),
    supabase.from('calendar_events').select('titulo,data_inicio').eq('user_id', userId).gte('data_inicio', hojeISO).lte('data_inicio', em7).order('data_inicio').limit(5),
    supabase.from('goals').select('nome,valor_atual,valor_alvo').eq('user_id', userId).eq('ativo', true).limit(3),
  ]);

  // Calcular saldo BRL
  const saldo = (contas||[]).filter(c => (c.currency||'BRL')==='BRL').reduce((s,c)=>s+Number(c.saldo_atual||0),0);

  // Receitas e despesas pagas no mês
  const pagas    = (txMes||[]).filter(t => t.status === 'pago');
  const receitas = pagas.filter(t => t.type === 'receita').reduce((s,t)=>s+Number(t.amount||0),0);
  const despesas = pagas.filter(t => t.type === 'despesa').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalFaturas = (faturas||[]).reduce((s,f)=>s+Number(f.valor_parcela||0),0);
  const previsao = saldo - totalFaturas;

  // Próximo embarque
  const futuros = (ciclos||[]).filter(c => c.data_embarque > hojeISO).sort((a,b)=>a.data_embarque.localeCompare(b.data_embarque));
  const proximoCiclo = futuros[0];
  const diasEmbarque = proximoCiclo
    ? Math.ceil((new Date(proximoCiclo.data_embarque) - hoje) / 864e5)
    : null;

  const ultimoDesembarque = (ciclos||[]).find(c => c.data_desembarque && c.data_desembarque <= hojeISO)?.data_desembarque || null;

  return {
    saldo:               saldo.toFixed(2),
    receitas:            receitas.toFixed(2),
    despesas:            despesas.toFixed(2),
    faturas:             totalFaturas.toFixed(2),
    previsao:            previsao.toFixed(2),
    pendentes:           (pendentes||[]).length,
    proximoEmbarque:     proximoCiclo?.data_embarque || null,
    diasEmbarque,
    ultimoDesembarque,
    eventosCalendario:   (eventos||[]).map(e => ({ titulo: e.titulo, data: e.data_inicio })),
    metas:               (metas||[]).map(m => ({
      nome: m.nome,
      percentual: m.valor_alvo > 0 ? Math.round((m.valor_atual/m.valor_alvo)*100) : 0,
    })),
  };
}

// ── Buscar insights da IA ─────────────────────────────────────────────────────
async function buscarInsights(userId) {
  // Tentar cache primeiro
  const cached = lerCache();
  if (cacheValido(cached)) return cached.insights;

  try {
    const contexto = await coletarContexto(userId);

    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-finzen-secret': FINZEN_SECRET,
      },
      body: JSON.stringify({ contexto }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { insights } = await res.json();

    if (insights?.length) {
      salvarCache(insights);
      return insights;
    }
  } catch (_) {}

  // Fallback: insights locais sem IA
  return await insightsFallback(userId);
}

// ── Fallback local sem IA ─────────────────────────────────────────────────────
async function insightsFallback(userId) {
  const hoje    = new Date();
  const hojeISO = hoje.toISOString().split('T')[0];
  const ref     = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

  const [{ data: faturas }, { data: ciclos }, { data: pendentes }] = await Promise.all([
    supabase.from('card_transactions').select('valor_parcela,credit_cards:card_id(nome,vencimento_dia)').eq('user_id', userId).eq('status', 'aberta').eq('fatura_referencia', ref),
    supabase.from('offshore_cycles').select('data_embarque').eq('user_id', userId).gt('data_embarque', hojeISO).order('data_embarque').limit(1),
    supabase.from('transactions').select('id').eq('user_id', userId).eq('status', 'pendente').gte('date', hojeISO).lte('date', new Date(hoje.getTime()+7*864e5).toISOString().split('T')[0]),
  ]);

  const insights = [];

  const totalFat = (faturas||[]).reduce((s,f)=>s+Number(f.valor_parcela||0),0);
  if (totalFat > 0) insights.push(`💳 Fatura do mês: R$ ${totalFat.toLocaleString('pt-BR',{minimumFractionDigits:2})}`);

  const prox = ciclos?.[0];
  if (prox) {
    const dias = Math.ceil((new Date(prox.data_embarque) - hoje) / 864e5);
    insights.push(`🛢️ Embarque em ${dias} dia${dias !== 1 ? 's' : ''} — ${prox.data_embarque}`);
  }

  if ((pendentes||[]).length > 0) insights.push(`📄 ${pendentes.length} lançamento(s) pendente(s) esta semana`);

  if (!insights.length) insights.push('✅ Tudo em ordem por hoje');

  return insights;
}

// ── Renderizar faixa ──────────────────────────────────────────────────────────
function renderBar(insights) {
  const bar = document.getElementById('assistantBar');
  if (!bar) return;

  const textos = insights.length ? insights : ['✅ Tudo em ordem por hoje'];

  // Duplicar para scroll contínuo suave
  const items = [...textos, ...textos]
    .map(t => `<span class="ab-item">${t}</span>`)
    .join('');

  bar.innerHTML = `
    <div class="ab-label">✦ ASSISTENTE</div>
    <div class="ab-ticker-wrap">
      <div class="ab-track">${items}</div>
    </div>
  `;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initAssistantBar(userId) {
  const bar = document.getElementById('assistantBar');
  if (!bar) return;

  // Estado inicial de carregamento
  bar.innerHTML = `
    <div class="ab-label">✦ ASSISTENTE</div>
    <div class="ab-ticker-wrap">
      <span class="ab-item ab-loading">Carregando insights…</span>
    </div>
  `;

  const insights = await buscarInsights(userId);
  renderBar(insights);
}
