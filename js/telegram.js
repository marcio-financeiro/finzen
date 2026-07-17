// FinZen — Notificações Telegram
// Todas as funções são fire-and-forget (nunca quebram o fluxo principal)

import { supabase } from './supabaseClient.js';

const API = '/api/telegram';

async function enviar(mensagem) {
  try {
    const { data: sd } = await supabase.auth.getSession();
    const token = sd?.session?.access_token;
    if (!token) return; // endpoint agora exige autenticação
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ message: mensagem }),
    });
  } catch (_) {}
}

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diaHoje() {
  return new Date().toISOString().split('T')[0];
}

// ── Transação registrada ──────────────────────────────────────────────────────
export async function notificarTransacao({ tipo, descricao, valor, conta }) {
  const emojis = { receita: '💰', despesa: '💸', transferencia: '🔄', cambio: '💱' };
  const emoji  = emojis[tipo] || '📝';
  const sinal  = tipo === 'receita' ? '+' : tipo === 'despesa' ? '-' : '';
  await enviar(
    `${emoji} <b>FinZen · ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}</b>\n` +
    `📝 ${descricao}\n` +
    `💵 R$ ${sinal}${fmt(valor)}\n` +
    `🏦 ${conta}`
  );
}

// ── Contas a vencer nos próximos dias (1× por dia) ───────────────────────────
export async function notificarContasVencendo(alertas) {
  if (!alertas.length) return;
  const chave = `finzen_tg_alertas_${diaHoje()}`;
  if (localStorage.getItem(chave)) return;
  localStorage.setItem(chave, '1');

  const lista = alertas.map(a => {
    const quando = a.dias === 0 ? 'hoje' : `em ${a.dias} dia${a.dias > 1 ? 's' : ''}`;
    return `• ${a.titulo} — R$ ${fmt(a.valor)} (${quando})`;
  }).join('\n');

  await enviar(`📅 <b>FinZen · Vencimentos</b>\n\n${lista}`);
}

// ── Orçamento estourado (1× por categoria/mês) ───────────────────────────────
export async function notificarOrcamentoEstourado({ categoria, gasto, limite, mes }) {
  const chave = `finzen_tg_budget_${categoria}_${mes}`;
  if (localStorage.getItem(chave)) return;
  localStorage.setItem(chave, '1');

  const excesso = ((gasto / limite - 1) * 100).toFixed(0);
  await enviar(
    `🚨 <b>FinZen · Orçamento Estourado</b>\n` +
    `📂 ${categoria}\n` +
    `💸 Gasto: R$ ${fmt(gasto)}\n` +
    `🎯 Limite: R$ ${fmt(limite)}\n` +
    `📈 ${excesso}% acima do limite`
  );
}

// ── Meta atingida (1× por meta) ──────────────────────────────────────────────
export async function notificarMetaAtingida({ id, nome, valor }) {
  const chave = `finzen_tg_meta_${id}`;
  if (localStorage.getItem(chave)) return;
  localStorage.setItem(chave, '1');

  await enviar(
    `🏆 <b>FinZen · Meta Atingida!</b>\n` +
    `🎯 ${nome}\n` +
    `💰 R$ ${fmt(valor)}`
  );
}

// ── Dividendo registrado ─────────────────────────────────────────────────────
export async function notificarDividendo({ ticker, valor }) {
  await enviar(
    `📈 <b>FinZen · Dividendo Recebido</b>\n` +
    `💹 ${ticker}\n` +
    `💰 R$ ${fmt(valor)}`
  );
}

// ── Fatura próxima do vencimento (1× por cartão/mês) ─────────────────────────
export async function notificarFaturaVencendo({ cartao, valor, dias }) {
  const mes   = diaHoje().substring(0, 7);
  const chave = `finzen_tg_fatura_${cartao}_${mes}`;
  if (localStorage.getItem(chave)) return;
  localStorage.setItem(chave, '1');

  const quando = dias === 0 ? 'hoje' : `em ${dias} dia${dias > 1 ? 's' : ''}`;
  await enviar(
    `💳 <b>FinZen · Fatura a Vencer</b>\n` +
    `🏦 ${cartao}\n` +
    `💵 R$ ${fmt(valor)}\n` +
    `📅 Vence ${quando}`
  );
}
