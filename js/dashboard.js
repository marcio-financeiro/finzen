import { supabase } from './supabaseClient.js';
import { initAssistantBar } from './assistantBar.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { emailService } from './emailService.js';
import { getUsdBrlRate, convertToBRL } from './services/financeService.js';

// ── Auth ──────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); throw new Error('unauthenticated'); }

// ── Redirecionar mobile para modo simples ─────────────
const isMobile = window.innerWidth < 768;
const modoAvancado = localStorage.getItem('finzen_modo_avancado') === 'true';
if(isMobile && !modoAvancado){ navigate('./mobile.html'); }

const user = sessionData.session.user;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

// ── Utilitários ───────────────────────────────────────
const el = id => document.getElementById(id);
const fmt = (v, c='BRL') => formatCurrency(v, c);

function hoje(){ return new Date(); }
function primeiroDiaMes(){ const d=hoje(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function ultimoDiaMes(){
  const d=hoje();
  const ultimo = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth()+1).padStart(2,'0')}-${String(ultimo.getDate()).padStart(2,'0')}`;
}
function primeiroDiaMesAnterior(){
  const d=hoje();
  const p = new Date(d.getFullYear(), d.getMonth()-1, 1);
  return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-01`;
}
function ultimoDiaMesAnterior(){
  const d=hoje();
  const u = new Date(d.getFullYear(), d.getMonth(), 0);
  return `${u.getFullYear()}-${String(u.getMonth()+1).padStart(2,'0')}-${String(u.getDate()).padStart(2,'0')}`;
}
function refMesAtual(){
  const d=hoje();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function formatData(iso){
  if(!iso) return '-';
  const [y,m,d]=iso.split('-'); return `${d}/${m}`;
}
function diasAte(iso){
  if(!iso) return null;
  const diff = new Date(iso+'T00:00:00') - new Date(hoje().toISOString().split('T')[0]+'T00:00:00');
  return Math.round(diff/(1000*60*60*24));
}
function aplicarClasse(el, valor){
  el.classList.remove('positive','negative');
  el.classList.add(valor>=0?'positive':'negative');
}

// Paleta categórica validada (8 tons distintos sob visão de cor e no fundo escuro do app)
const CORES = ['#3987e5','#199e70','#c98500','#008300','#9085e9','#e66767','#d55181','#d95926'];

// Cor fixa por categoria (hash do nome) quando ela não tem cor própria cadastrada —
// evita que a cor mude de mês a mês só porque o ranking de gastos mudou
function corParaCategoria(nome){
  let hash = 0;
  for(let i=0;i<nome.length;i++){ hash = (hash*31 + nome.charCodeAt(i)) >>> 0; }
  return CORES[hash % CORES.length];
}

// ── Navegação de janela — card "Tendência de Gastos" ──
const MESES_NOMES  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABREV  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TENDENCIA_MESES    = 5;   // meses exibidos na janela (barras)
const TENDENCIA_MIN_BASE = -12; // início da janela não pode passar de 12 meses atrás
const TENDENCIA_MAX_BASE = 6 - (TENDENCIA_MESES - 1); // fim da janela não pode passar de 6 meses à frente
let previsaoBaseOffset = -1;    // início da janela: 1 mês atrás até 3 meses à frente
let previsaoCarregando = false;
let previsaoReceitasRec = 0;    // receitas fixas/mês (igual ao card Receita Líquida Recorrente)
let previsaoDespesasRec = 0;    // despesas fixas/mês
let saldoContaAtual = 0;        // saldo real das contas agora — base pra acumular a Tendência de Gastos
let dolarAtual = 5.15;          // cotação USD/BRL — contas em dólar (ex: Nomad) convertem por este valor

// Soma o valor de uma transação já convertido pra BRL, conforme a moeda da conta
function valorBRL(t){ return convertToBRL(t.amount, t.accounts?.currency || 'BRL', dolarAtual); }

function mesComOffset(offset){
  const d = hoje();
  const base = new Date(d.getFullYear(), d.getMonth()+offset, 1);
  const ultimo = new Date(base.getFullYear(), base.getMonth()+1, 0);
  return {
    inicio: `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-01`,
    fim: `${ultimo.getFullYear()}-${String(ultimo.getMonth()+1).padStart(2,'0')}-${String(ultimo.getDate()).padStart(2,'0')}`,
    ref: `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}`,
    label: `${MESES_NOMES[base.getMonth()]} ${base.getFullYear()}`,
  };
}

// ── Carregamento paralelo ─────────────────────────────
async function carregarDashboard(){
  try {
    const inicio = primeiroDiaMes();
    const fim    = ultimoDiaMes();
    const ref    = refMesAtual();
    const nextD  = new Date(hoje().getFullYear(), hoje().getMonth()+1, 1);
    const refProximo = `${nextD.getFullYear()}-${String(nextD.getMonth()+1).padStart(2,'0')}`;

    try { dolarAtual = await getUsdBrlRate(user.id); } catch(_) {}

    const [
      { data: contas },
      { data: transacoesMes },
      { data: parcelasMes },
      { data: transacoesPendentes },
      { data: orcamentos },
      { data: metas },
      { data: recorrentes },
      { data: ultimosLanc },
      { data: categorias },
      { data: pendentesRestantesMes },
      { data: cartoes },
      { data: ultimosCartao },
      { data: txMesAnterior },
      { data: parcelasMesAll },
    ] = await Promise.all([
      supabase.from('accounts').select('id,nome,currency,saldo_atual,color').eq('user_id',user.id).eq('active',true),                                                                                                          // contas
      supabase.from('transactions').select('type,amount,status,date,category_id,accounts:account_id(currency),categories:category_id(nome,icon,cor)').eq('user_id',user.id).gte('date',inicio).lte('date',fim),                  // transacoesMes
      supabase.from('card_transactions').select('valor_parcela,fatura_referencia,status,card_id,category_id').eq('user_id',user.id).in('status',['aberta','pendente']).in('fatura_referencia',[ref,refProximo]),               // parcelasMes (atual+próximo, abertas)
      supabase.from('transactions').select('id,description,amount,date,type,status').eq('user_id',user.id).eq('status','pendente').gte('date',hoje().toISOString().split('T')[0]).lte('date', (() => { const d=new Date(hoje()); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; })()).order('date',{ascending:true}).limit(5), // transacoesPendentes
      supabase.from('budgets').select('*,categories:category_id(nome,icon)').eq('user_id',user.id).eq('mes_referencia',ref),                                                                                                   // orcamentos
      supabase.from('goals').select('*').eq('user_id',user.id).eq('ativo',true).order('data_alvo',{ascending:true}).limit(5),                                                                                                  // metas
      supabase.from('transactions').select('type,amount,recurrence_frequency,accounts:account_id(currency)').eq('user_id',user.id).eq('is_recurring',true).eq('recurrence_active',true),                                        // recorrentes
      supabase.from('transactions').select('id,type,amount,description,date,status,created_at,accounts:account_id(nome,currency),categories:category_id(nome,icon)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(8), // ultimosLanc
      supabase.from('categories').select('id,nome,icon,cor').eq('user_id',user.id),                                                                                                                                            // categorias
      supabase.from('transactions').select('type,amount,date,status').eq('user_id',user.id).eq('status','pendente').gte('date',hoje().toISOString().split('T')[0]).lte('date',ultimoDiaMes()),                                 // pendentesRestantesMes
      supabase.from('credit_cards').select('id,nome,vencimento_dia').eq('user_id',user.id).eq('ativo',true),                                                                                                                   // cartoes
      supabase.from('card_transactions').select('id,descricao,valor_total,data_compra,status,created_at,credit_cards:card_id(nome),categories:category_id(nome,icon)').eq('user_id',user.id).eq('parcela_atual',1).order('created_at',{ascending:false}).limit(8), // ultimosCartao
      supabase.from('transactions').select('type,amount,status,accounts:account_id(currency)').eq('user_id',user.id).eq('status','pago').gte('date',primeiroDiaMesAnterior()).lte('date',ultimoDiaMesAnterior()),                // txMesAnterior
      supabase.from('card_transactions').select('valor_parcela,category_id,categories:category_id(nome,icon,cor)').eq('user_id',user.id).eq('fatura_referencia',ref),                                                            // parcelasMesAll (todos status, para orçamento + pizza)
    ]);

    // ── KPIs ─────────────────────────────────────────
    // Converte para BRL na origem — contas em dólar (ex: Nomad) não ficam de fora
    // nem entram misturadas sem conversão nos totais abaixo.
    (transacoesMes||[]).forEach(t => { t.amount = valorBRL(t); });
    (txMesAnterior||[]).forEach(t => { t.amount = valorBRL(t); });
    (recorrentes||[]).forEach(t => { t.amount = valorBRL(t); });

    const totalSaldo = (contas||[]).reduce((s,c)=>s+convertToBRL(c.saldo_atual, c.currency||'BRL', dolarAtual),0);
    saldoContaAtual = totalSaldo;
    const tx = transacoesMes||[];
    const pagas = tx.filter(t=>t.status==='pago');
    const receitas = pagas.filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
    const despesas = pagas.filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
    const resultado = receitas - despesas;
    const totalFaturas = (parcelasMes||[]).filter(p=>p.fatura_referencia===ref).reduce((s,p)=>s+Number(p.valor_parcela||0),0);

    el('kpiSaldo').innerText     = fmt(totalSaldo);
    el('kpiReceitas').innerText  = fmt(receitas);
    el('kpiDespesas').innerText  = fmt(despesas);
    el('kpiResultado').innerText = fmt(resultado);
    el('kpiFaturas').innerText   = fmt(totalFaturas);
    ['kpiSaldo','kpiReceitas','kpiDespesas','kpiResultado','kpiFaturas'].forEach(id => el(id).classList.remove('kpi-loading'));
    aplicarClasse(el('kpiResultado'), resultado);

    // ── Ring cards (Stage 2) ─────────────────────────
    const recAnt  = (txMesAnterior||[]).filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
    const despAnt = (txMesAnterior||[]).filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
    const despesasRec = (recorrentes||[]).filter(r=>r.type==='despesa').reduce((s,r)=>s+Number(r.amount||0),0);
    const refEmerg = despesasRec > 0 ? despesasRec : (despesas > 0 ? despesas : 1);

    atualizarRing('ringSaldo','ringSaldoPct','deltaSaldo',
      Math.min(totalSaldo / (refEmerg * 6) * 100, 100), null, null);
    atualizarRing('ringReceitas','ringReceitasPct','deltaReceitas',
      Math.min(receitas / Math.max(receitas + despesas, 1) * 100, 100),
      receitas, recAnt);
    atualizarRing('ringDespesas','ringDespesasPct','deltaDespesas',
      Math.min(despesas / Math.max(receitas, 1) * 100, 100),
      despesas, despAnt);

    // ── Saldo das contas ──────────────────────────────
    renderContas(contas||[]);

    // ── Alertas + Próximas faturas (Stage 2) ─────────
    renderAlertas(transacoesPendentes||[]);
    renderFaturas(cartoes||[], parcelasMes||[]);

    // ── Pizza de despesas ─────────────────────────────
    // Desmembra "Fatura de Cartão" nas categorias reais dos itens do cartão (mesmo critério do Orçamento: fatura_referencia do mês)
    const catFatura = (categorias||[]).find(c => c.nome.trim().toLowerCase() === 'fatura de cartão');
    const despesasSemFatura = pagas.filter(t => t.type==='despesa' && t.category_id !== catFatura?.id);
    renderPizza(despesasSemFatura, parcelasMesAll||[]);

    // ── Saúde do orçamento (herda do mês anterior se este mês ainda não tem nada configurado) ──
    let orcamentosEfetivos = orcamentos||[];
    let orcamentoMesHerdado = null;
    if(!orcamentosEfetivos.length){
      const { data: orcAnteriores } = await supabase.from('budgets')
        .select('*,categories:category_id(nome,icon),mes_referencia')
        .eq('user_id',user.id).lt('mes_referencia',ref)
        .order('mes_referencia',{ascending:false}).limit(50);
      if(orcAnteriores?.length){
        orcamentoMesHerdado = orcAnteriores[0].mes_referencia;
        orcamentosEfetivos  = orcAnteriores.filter(o=>o.mes_referencia===orcamentoMesHerdado);
      }
    }
    renderOrcamento(orcamentosEfetivos, pagas.filter(t=>t.type==='despesa'), parcelasMesAll||[], orcamentoMesHerdado);

    // ── Metas ────────────────────────────────────────
    renderMetas(metas||[]);

    // ── Receita líquida recorrente ───────────────────
    renderReceitaLiquida(recorrentes||[]);

    // ── Tendência de gastos (comprometido x variável x projetado) ──
    carregarTendencia(previsaoBaseOffset);

    // ── Últimos lançamentos ──────────────────────────
    renderUltimos(ultimosLanc||[], ultimosCartao||[]);

    // ── Score de Saúde Financeira ────────────────────
    // Buscar investimentos para o score (query separada para não travar o dashboard)
    const { data: investimentos } = await supabase
      .from('investments')
      .select('tipo,quantidade,preco_medio,cotacao_atual')
      .eq('user_id', user.id).eq('ativo', true);

    const { data: cartaoLimites } = await supabase
      .from('credit_cards')
      .select('limite,nome')
      .eq('user_id', user.id).eq('ativo', true);

    renderScore({
      totalSaldo,
      receitas,
      despesas,
      totalFaturas,
      investimentos:  investimentos  || [],
      cartaoLimites:  cartaoLimites  || [],
      metas:          metas          || [],
      recorrentes:    recorrentes    || [],
    });
  } catch(err) {
    console.error('[Dashboard]', err);
    ['kpiSaldo','kpiReceitas','kpiDespesas','kpiResultado','kpiFaturas'].forEach(id => el(id)?.classList.remove('kpi-loading'));
  }
}

// ── Ring helper ───────────────────────────────────────
function atualizarRing(ringId, pctId, deltaId, pct, valorAtual, valorAnt) {
  const ringEl = document.getElementById(ringId);
  const pctEl  = document.getElementById(pctId);
  const delEl  = document.getElementById(deltaId);
  const p = Math.max(0, Math.round(pct));
  if (ringEl) ringEl.style.setProperty('--pct', p);
  if (pctEl)  pctEl.textContent = p + '%';
  if (delEl && valorAtual !== null && valorAnt !== null) {
    if (valorAnt === 0) {
      delEl.className = 'delta neu';
      delEl.textContent = '—';
    } else {
      const diff = ((valorAtual - valorAnt) / valorAnt) * 100;
      const cls  = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neu';
      const icon = diff > 0
        ? `<svg style="width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><use href="#db-arrow-up-right"/></svg>`
        : `<svg style="width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><use href="#db-arrow-down-right"/></svg>`;
      delEl.className = `delta ${cls}`;
      delEl.innerHTML = `${icon} ${Math.abs(diff).toFixed(1)}% vs mês ant.`;
    }
  } else if (delEl) {
    delEl.className = 'delta neu';
    delEl.textContent = '—';
  }
}

// ── Saldo das contas ──────────────────────────────────
function renderContas(contas) {
  const wrap = document.getElementById('blocoContasWrap');
  const body = document.getElementById('blocoContas');
  if (!wrap || !body || !contas.length) return;

  const EMOJI = (c) => {
    const t = (c.tipo||'').toLowerCase();
    if (t.includes('poupan'))  return '🏦';
    if (t.includes('invest'))  return '💰';
    if (t.includes('digital')) return '💜';
    if (t.includes('corret') || t.includes('broker')) return '📈';
    if (t.includes('carteira')) return '👛';
    return '🏦';
  };

  const contasBRL = contas.filter(c => (c.currency||'BRL') === 'BRL');
  const contasUSD = contas.filter(c => c.currency === 'USD');

  const renderGrupo = (lista, moeda) => lista.map(c => {
    const saldo = Number(c.saldo_atual || 0);
    const cor   = saldo < 0 ? 'var(--color-expense)' : saldo === 0 ? 'var(--muted)' : 'var(--text)';
    const icon  = c.color ? `<span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block;margin-right:6px;flex-shrink:0"></span>` : `<span style="margin-right:6px">${EMOJI(c)}</span>`;
    const val   = moeda === 'USD'
      ? `US$ ${Math.abs(saldo).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`
      : fmt(saldo);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer"
        onclick="location.href='./account-statement.html?conta=${c.id}'">
        <span style="display:flex;align-items:center;font-size:13px;font-weight:600">${icon}${c.nome}</span>
        <span style="font-size:13px;font-weight:800;color:${cor}">${val}</span>
      </div>`;
  }).join('');

  body.innerHTML = renderGrupo(contasBRL, 'BRL') + renderGrupo(contasUSD, 'USD');
  body.lastElementChild?.style.setProperty('border-bottom','none');
  wrap.style.display = 'block';
}

// ── Alertas (Stage 2 — somente transações pendentes) ─
function renderAlertas(pendentes){
  const alertas = [];

  // Despesas pendentes nos próximos 7 dias
  pendentes.forEach(p => {
    const dias = diasAte(p.date);
    if(dias !== null && dias >= 0 && dias <= 7){
      alertas.push({
        tipo: 'despesa',
        titulo: p.description || 'Despesa',
        subtitulo: `Lançamento pendente · ${formatData(p.date)}`,
        valor: Number(p.amount || 0),
        dias,
      });
    }
  });

  // Ordenar por urgência
  alertas.sort((a, b) => a.dias - b.dias);

  if(!alertas.length){
    el('blocoAlertas').innerHTML = `
      <div class="alert-row success">
        <svg class="alert-icon"><use href="#db-check-circle"/></svg>
        <div class="alert-body"><p>Tudo em dia!</p><span>Nenhuma despesa pendente nos próximos 7 dias</span></div>
      </div>`;
    return;
  }

  el('blocoAlertas').innerHTML = alertas.map(a => {
    const label = a.dias === 0 ? 'hoje' : a.dias === 1 ? 'amanhã' : `em ${a.dias} dias`;
    const tipo  = a.dias === 0 ? 'danger' : a.dias <= 2 ? 'warning' : 'info';
    const icon  = a.dias === 0 ? 'db-x-circle' : a.dias <= 2 ? 'db-alert-triangle' : 'db-info-circle';
    return `<div class="alert-row ${tipo}">
      <svg class="alert-icon"><use href="#${icon}"/></svg>
      <div class="alert-body">
        <p>${a.titulo}</p>
        <span>${a.subtitulo} · Vence ${label}</span>
      </div>
      <span class="alert-valor">−${fmt(a.valor)}</span>
    </div>`;
  }).join('');
}

// ── Próximas faturas (Stage 2) ────────────────────────
function renderFaturas(cartoes, parcelasMes){
  const d   = hoje();
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const faturas = [];

  cartoes.forEach(cartao => {
    if(!cartao.vencimento_dia) return;
    let anoV = ano, mesV = mes, diaV = cartao.vencimento_dia;
    if(diaV < d.getDate()){ mesV++; if(mesV>12){mesV=1;anoV++;} }
    const dataVenc = `${anoV}-${String(mesV).padStart(2,'0')}-${String(diaV).padStart(2,'0')}`;
    const dias = diasAte(dataVenc);
    if(dias === null || dias < 0) return;

    const targetRef = `${anoV}-${String(mesV).padStart(2,'0')}`;
    const total  = parcelasMes.filter(p=>p.card_id===cartao.id && p.fatura_referencia===targetRef).reduce((s,p)=>s+Number(p.valor_parcela||0),0);

    faturas.push({ id: cartao.id, nome: cartao.nome, diaVenc: diaV, dataVenc, total, dias });
  });

  if(!faturas.length){
    el('blocoFaturas').innerHTML = `
      <div style="text-align:center;padding:24px 16px">
        <div style="font-size:36px;margin-bottom:8px">💳</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Nenhum cartão cadastrado.</p>
        <a href="./cards.html" class="btn btn-secondary compact" style="font-size:12px">Adicionar cartão</a>
      </div>`;
    return;
  }

  el('blocoFaturas').innerHTML = faturas.sort((a,b)=>a.dias-b.dias).map(f => {
    const pillClass = f.dias === 0 ? 'urgente' : f.total === 0 ? 'pago' : 'pendente';
    const pillLabel = f.dias === 0 ? 'Vence hoje' : f.total === 0 ? 'Sem lançamentos' : 'Pendente';
    return `<div class="invoice-row" style="cursor:pointer" onclick="location.href='./card-bills.html?cartao=${f.id}'">
      <div class="invoice-icon">
        <svg><use href="#db-credit-card"/></svg>
      </div>
      <div class="invoice-meta">
        <b>${f.nome}</b>
        <span>Vence dia ${f.diaVenc} · ${formatData(f.dataVenc)}</span>
      </div>
      <div class="invoice-amount">
        <b>${f.total > 0 ? fmt(f.total) : '—'}</b>
        <span class="invoice-pill ${pillClass}">${pillLabel}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Pizza ─────────────────────────────────────────────
function renderPizza(despesasMes, parcelasCartaoMes){
  if(!despesasMes.length && !(parcelasCartaoMes||[]).length){
    el('blocoPizza').innerHTML = `
      <div style="text-align:center;padding:24px 16px">
        <div style="font-size:36px;margin-bottom:8px">📊</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Nenhuma despesa registrada este mês.</p>
        <a href="./movements.html?tipo=despesa" class="btn btn-secondary compact" style="font-size:12px">Lançar despesa</a>
      </div>`;
    return;
  }

  // Agrupar por categoria (transações normais + itens de fatura de cartão, desmembrados por categoria real)
  const grupos = {};
  despesasMes.forEach(t => {
    const nome = t.categories?.nome || 'Sem categoria';
    const icon = t.categories?.icon || '';
    const cor  = t.categories?.cor;
    if(!grupos[nome]) grupos[nome] = { nome, icon, cor, categoryId: t.category_id, total: 0 };
    grupos[nome].total += Number(t.amount||0);
  });
  (parcelasCartaoMes||[]).forEach(p => {
    const nome = p.categories?.nome || 'Sem categoria';
    const icon = p.categories?.icon || '';
    const cor  = p.categories?.cor;
    if(!grupos[nome]) grupos[nome] = { nome, icon, cor, categoryId: p.category_id, total: 0 };
    grupos[nome].total += Number(p.valor_parcela||0);
  });

  const items = Object.values(grupos).sort((a,b)=>b.total-a.total).slice(0,8);
  const total = items.reduce((s,i)=>s+i.total,0);

  // Barra por categoria — cor customizada da categoria ou, na falta dela,
  // cor fixa derivada do nome (não muda de mês a mês conforme o ranking)
  const linhas = items.map(item => {
    const pct = total>0 ? (item.total/total*100) : 0;
    const cor = item.cor || corParaCategoria(item.nome);
    const conteudo = `
      <div class="categoria-row">
        <span class="categoria-label">${item.icon} ${item.nome}</span>
        <span class="categoria-valor">${fmt(item.total)} <span class="categoria-pct">(${pct.toFixed(1)}%)</span></span>
      </div>
      <div class="categoria-bar-wrap">
        <div class="categoria-bar" style="width:${pct}%;background:${cor}"></div>
      </div>`;
    return item.categoryId
      ? `<a class="categoria-item categoria-item-link" href="./movements.html?categoria=${item.categoryId}">${conteudo}</a>`
      : `<div class="categoria-item">${conteudo}</div>`;
  }).join('');

  el('blocoPizza').innerHTML = `
    <div class="categoria-total"><span>TOTAL</span><strong>${fmt(total)}</strong></div>
    ${linhas}`;
}

// ── Orçamento ─────────────────────────────────────────
function renderOrcamento(orcamentos, despesasMes, parcelasMes, mesHerdado){
  if(!orcamentos.length){
    el('blocoOrcamento').innerHTML = `
      <div style="text-align:center;padding:24px 16px">
        <div style="font-size:36px;margin-bottom:8px">📊</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Nenhum orçamento configurado ainda.</p>
        <a href="./budgets.html" class="btn btn-secondary compact" style="font-size:12px">Configurar orçamento</a>
      </div>`;
    return;
  }

  // Gastos reais por category_id (transações + cartão)
  const gastos = {};
  despesasMes.forEach(t => {
    if(t.category_id) gastos[t.category_id] = (gastos[t.category_id]||0) + Number(t.amount||0);
  });
  (parcelasMes||[]).forEach(t => {
    if(t.category_id) gastos[t.category_id] = (gastos[t.category_id]||0) + Number(t.valor_parcela||0);
  });

  let html = '';
  if(mesHerdado){
    const [ay,am] = mesHerdado.split('-');
    html += `<p class="muted" style="font-size:11px;margin:0 0 10px">↻ Herdado de ${MESES_ABREV[Number(am)-1]}/${ay.slice(2)} — <a href="./budgets.html">configure este mês</a> para personalizar.</p>`;
  }
  orcamentos.forEach(orc => {
    const planejado = Number(orc.valor_planejado||0);
    const gasto = gastos[orc.category_id]||0;
    const pct = planejado>0 ? Math.min(gasto/planejado*100,200) : 0;
    const pctDisplay = planejado>0 ? (gasto/planejado*100).toFixed(0) : 0;
    const classe = pct>=100?'over':pct>=80?'warn':'';
    const icon = orc.categories?.icon||'';
    const nome = orc.categories?.nome||'Categoria';

    html += `<div class="orcamento-item">
      <div class="orcamento-row">
        <span class="orcamento-label">${icon} ${nome}</span>
        <span class="muted" style="font-size:11px">${fmt(gasto)} / ${fmt(planejado)} (${pctDisplay}%)</span>
      </div>
      <div class="orcamento-bar-wrap">
        <div class="orcamento-bar ${classe}" style="width:${Math.min(pct,100)}%"></div>
      </div>
    </div>`;
  });

  el('blocoOrcamento').innerHTML = html;
}

// ── Metas ─────────────────────────────────────────────
function renderMetas(metas){
  if(!metas.length){
    el('blocoMetas').innerHTML = `
      <div style="text-align:center;padding:24px 16px">
        <div style="font-size:36px;margin-bottom:8px">🎯</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Nenhuma meta ativa.</p>
        <a href="./goals.html" class="btn btn-secondary compact" style="font-size:12px">Criar primeira meta</a>
      </div>`;
    return;
  }

  const cores = ['#f59e0b','#22c55e','#10b981','#3b82f6','#ef4444'];
  let html = '';

  metas.forEach((meta,i) => {
    const atual = Number(meta.valor_atual||0);
    const alvo  = Number(meta.valor_alvo||0);
    const pct   = alvo>0 ? Math.min(atual/alvo*100,100) : 0;
    const falta = Math.max(alvo-atual, 0);
    const cor   = meta.cor||cores[i%cores.length];
    const dias  = meta.data_alvo ? diasAte(meta.data_alvo) : null;
    const prazo = dias!==null ? (dias<0?'<span class="negative" style="font-size:10px">vencida</span>':`<span class="muted" style="font-size:10px">${dias}d restantes</span>`) : '';

    html += `<div class="meta-item">
      <div class="meta-row">
        <span class="meta-label">${meta.nome} ${prazo}</span>
        <span class="muted" style="font-size:11px">${pct.toFixed(0)}% · falta ${fmt(falta)}</span>
      </div>
      <div class="meta-bar-wrap">
        <div class="meta-bar" style="width:${pct}%;background:${cor}"></div>
      </div>
    </div>`;
  });

  el('blocoMetas').innerHTML = html;
}

// ── Receita líquida recorrente ────────────────────────
function renderReceitaLiquida(recorrentes){
  const receitasRec = recorrentes.filter(r=>r.type==='receita').reduce((s,r)=>s+Number(r.amount||0),0);
  const despesasRec = recorrentes.filter(r=>r.type==='despesa').reduce((s,r)=>s+Number(r.amount||0),0);
  previsaoReceitasRec = receitasRec;
  previsaoDespesasRec = despesasRec;
  const liquida = receitasRec - despesasRec;
  const pctDespesas = receitasRec>0 ? (despesasRec/receitasRec*100).toFixed(0) : 0;

  if(!recorrentes.length){
    el('blocoReceitaLiquida').innerHTML = `
      <div style="text-align:center;padding:24px 16px">
        <div style="font-size:36px;margin-bottom:8px">💼</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Nenhuma transação recorrente cadastrada.</p>
        <a href="./movements.html" class="btn btn-secondary compact" style="font-size:12px">Adicionar recorrência</a>
      </div>`;
    return;
  }

  el('blocoReceitaLiquida').innerHTML = `
    <div class="rl-row">
      <span class="muted">Receitas fixas/mês</span>
      <span class="positive" style="font-family:var(--font-mono)">${fmt(receitasRec)}</span>
    </div>
    <div class="rl-row">
      <span class="muted">Despesas fixas/mês</span>
      <span class="negative" style="font-family:var(--font-mono)">-${fmt(despesasRec)}</span>
    </div>
    <div class="rl-row">
      <span class="muted">Comprometimento</span>
      <span style="font-family:var(--font-mono);color:${pctDespesas>80?'var(--danger)':pctDespesas>60?'var(--warning,#f59e0b)':'var(--success)'}">${pctDespesas}%</span>
    </div>
    <div class="rl-total">
      <span>Sobra fixa/mês</span>
      <span class="${liquida>=0?'positive':'negative'}" style="font-family:var(--font-mono)">${fmt(liquida)}</span>
    </div>
  `;
}

// ── Tendência de gastos (5 meses: passado/atual reais + futuro projetado) ──
function fmtBarra(v){ return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }

function atualizarNavTendencia(baseOffset, carregando){
  const primeiro = mesComOffset(baseOffset);
  const ultimo   = mesComOffset(baseOffset + TENDENCIA_MESES - 1);
  const mPrimeiro = Number(primeiro.ref.split('-')[1]) - 1;
  const [anoUltimo, mUltimoStr] = ultimo.ref.split('-');
  el('previsaoMesLabel').textContent = `${MESES_ABREV[mPrimeiro]}–${MESES_ABREV[Number(mUltimoStr)-1]}/${anoUltimo.slice(2)}`;
  el('btnPrevisaoAnterior').classList.toggle('is-disabled', carregando || baseOffset <= TENDENCIA_MIN_BASE);
  el('btnPrevisaoProximo').classList.toggle('is-disabled', carregando || baseOffset >= TENDENCIA_MAX_BASE);
}

async function carregarTendencia(baseOffset){
  if(previsaoCarregando) return;
  previsaoCarregando = true;
  atualizarNavTendencia(baseOffset, true);

  try {
    const meses    = Array.from({length:TENDENCIA_MESES}, (_,i) => ({ offset: baseOffset+i, ...mesComOffset(baseOffset+i) }));
    const passados = meses.filter(m => m.offset <= 0);
    // Mês atual entra na consulta de pendentes também — precisa do que ainda falta
    // acontecer neste mês pra acumular o saldo corretamente a partir de agora.
    const futuros  = meses.filter(m => m.offset >= 0);
    const refs     = meses.map(m => m.ref);

    const [{ data: parcelas }, { data: despesasReais }, { data: futurasReais }] = await Promise.all([
      supabase.from('card_transactions').select('valor_parcela,fatura_referencia').eq('user_id',user.id).in('fatura_referencia', refs),
      passados.length
        ? supabase.from('transactions').select('amount,date,accounts:account_id(currency)').eq('user_id',user.id).eq('status','pago').eq('type','despesa').gte('date',passados[0].inicio).lte('date',passados[passados.length-1].fim)
        : Promise.resolve({ data: [] }),
      // Mês atual em diante: usa os lançamentos ainda pendentes (recorrentes já gerados
      // + qualquer outro) em vez de uma média fixa repetida — reflete o que está
      // realmente previsto em cada mês.
      futuros.length
        ? supabase.from('transactions').select('type,amount,date,accounts:account_id(currency)').eq('user_id',user.id).eq('status','pendente').gte('date',futuros[0].inicio).lte('date',futuros[futuros.length-1].fim)
        : Promise.resolve({ data: [] }),
    ]);

    const parcelasPorMes = {};
    (parcelas||[]).forEach(p => { parcelasPorMes[p.fatura_referencia] = (parcelasPorMes[p.fatura_referencia]||0) + Number(p.valor_parcela||0); });

    const despesasPorMes = {};
    (despesasReais||[]).forEach(t => {
      const ref = String(t.date).slice(0,7);
      despesasPorMes[ref] = (despesasPorMes[ref]||0) + valorBRL(t);
    });

    const despesasFuturasPorMes = {};
    const receitasFuturasPorMes = {};
    (futurasReais||[]).forEach(t => {
      const ref  = String(t.date).slice(0,7);
      const alvo = t.type==='despesa' ? despesasFuturasPorMes : receitasFuturasPorMes;
      alvo[ref]  = (alvo[ref]||0) + valorBRL(t);
    });

    // Comprometido = despesas fixas/mês (recorrentes) + parcelas de cartão do mês.
    // Passado: limitado ao total real gasto no mês; o restante é "Variável".
    // Atual em diante: soma os lançamentos ainda pendentes daquele mês específico +
    // parcelas de cartão — não há "Variável" ainda por não ter acontecido.
    // "Livre" continua sendo a sobra daquele mês isolado (pra não distorcer a escala
    // das barras). saldoProjetado é o acumulado de verdade — parte do saldo atual das
    // contas e soma o resultado líquido mês a mês, igual ao Saldo Livre Estimado de
    // Movimentações, só que projetado adiante — mostrado como texto abaixo do gráfico.
    let saldoAcumulado = saldoContaAtual;
    const dados = meses.map(m => {
      const parcelasMes = parcelasPorMes[m.ref] || 0;
      if(m.offset < 0){
        const fixoAprox     = previsaoDespesasRec + parcelasMes;
        const total         = (despesasPorMes[m.ref]||0) + parcelasMes;
        const comprometido  = Math.min(fixoAprox, total);
        const variavel      = Math.max(total - comprometido, 0);
        return { ...m, comprometido, variavel, livre:0, total, projetado:false, saldoProjetado:null };
      }
      if(m.offset === 0){
        const fixoAprox     = previsaoDespesasRec + parcelasMes;
        const total         = (despesasPorMes[m.ref]||0) + parcelasMes;
        const comprometido  = Math.min(fixoAprox, total);
        const variavel      = Math.max(total - comprometido, 0);
        const pendReceita   = receitasFuturasPorMes[m.ref] || 0;
        const pendDespesa   = despesasFuturasPorMes[m.ref] || 0;
        // Mesmo cálculo do Saldo Livre Estimado (Movimentações): saldo real das
        // contas + o que ainda falta entrar/sair até o fim do mês.
        saldoAcumulado += pendReceita - pendDespesa;
        const livre = Math.max(saldoAcumulado, 0);
        return { ...m, comprometido, variavel, livre, total, projetado:false, saldoProjetado:saldoAcumulado };
      }
      const comprometido = (despesasFuturasPorMes[m.ref]||0) + parcelasMes;
      const receitasMes  = receitasFuturasPorMes[m.ref] || 0;
      const livre         = Math.max(receitasMes - comprometido, 0);
      saldoAcumulado += receitasMes - comprometido;
      return { ...m, comprometido, variavel: 0, livre, total: comprometido, projetado:true, saldoProjetado:saldoAcumulado };
    });

    renderTendencia(dados);
  } catch(err) {
    console.error('[Dashboard:Tendencia]', err);
    el('blocoPrevisao').innerHTML = '<p class="block-loading">Erro ao carregar tendência de gastos.</p>';
  }

  previsaoCarregando = false;
  atualizarNavTendencia(baseOffset, false);
}

function renderTendencia(dados){
  const W = 500, H = 150;
  const barAreaTop = 16, barAreaBottom = 118;
  const barAreaHeight = barAreaBottom - barAreaTop;
  const colW = W / dados.length;
  const barW = colW * 0.46;

  // Detecta mês fora de escala (ex: mês de importação inicial de dados) e evita
  // que ele esmague a visualização dos demais — escala pelo 2º maior valor e
  // corta visualmente a barra do outlier, mantendo o rótulo com o valor real.
  const totaisDesc = dados.map(d => d.total).sort((a,b) => b-a);
  const [maior, segundoMaior] = totaisDesc;
  const outlier  = segundoMaior > 0 && maior > segundoMaior * 1.8;
  const maxTotal = Math.max(outlier ? segundoMaior : maior, previsaoReceitasRec, 1);
  const escalaY  = v => barAreaBottom - (Math.min(v, maxTotal) / maxTotal) * barAreaHeight;

  const barras = dados.map((d,i) => {
    const x             = i*colW + (colW-barW)/2;
    const estourou      = d.total > maxTotal;
    const fatorCorte    = estourou ? maxTotal / d.total : 1;
    const hComprometido = (d.comprometido/maxTotal)*barAreaHeight*fatorCorte;
    const hVariavel     = (d.variavel/maxTotal)*barAreaHeight*fatorCorte;
    const hLivre        = ((d.livre||0)/maxTotal)*barAreaHeight;
    const yComprometido = barAreaBottom - hComprometido;
    const yVariavel     = yComprometido - hVariavel;
    const yGasto        = hVariavel > 0 ? yVariavel : yComprometido;
    const yLivre        = yGasto - hLivre;
    const yTopo         = hLivre > 0 ? yLivre : yGasto;
    const destaque      = d.offset === 0;
    const fillComprometido = d.projetado ? 'url(#tendHatch)' : 'var(--accent)';
    const mesAbrev      = MESES_ABREV[Number(d.ref.split('-')[1])-1];

    return `
      <rect x="${x}" y="${yComprometido}" width="${barW}" height="${hComprometido}" fill="${fillComprometido}" rx="3"/>
      ${!d.projetado && hVariavel>0 ? `<rect x="${x}" y="${yVariavel}" width="${barW}" height="${hVariavel}" fill="var(--danger)" rx="3"/>` : ''}
      ${hLivre>0 ? `<rect x="${x}" y="${yLivre}" width="${barW}" height="${hLivre}" fill="var(--success)" opacity=".5" rx="3"/>` : ''}
      ${estourou ? `<line x1="${x}" y1="${barAreaTop}" x2="${x+barW}" y2="${barAreaTop}" stroke="var(--bg-root)" stroke-width="2.5" stroke-dasharray="3 2"/>` : ''}
      ${destaque ? `<rect x="${x-2.5}" y="${yTopo-2.5}" width="${barW+5}" height="${barAreaBottom-yTopo+5}" fill="none" stroke="var(--accent)" stroke-width="1.5" rx="5"/>` : ''}
      <text x="${x+barW/2}" y="${yGasto-8}" text-anchor="middle" font-size="10" font-weight="700" fill="${destaque?'var(--accent)':'var(--muted)'}">${d.projetado?'~':''}${fmtBarra(d.total)}</text>
      <text x="${x+barW/2}" y="${barAreaBottom+16}" text-anchor="middle" font-size="10" font-weight="${destaque?800:600}" fill="${destaque?'var(--accent)':'var(--muted)'}">${mesAbrev}${destaque?' •':''}</text>
    `;
  }).join('');

  const pontosLinha = dados.map((d,i) => `${i*colW+colW/2},${escalaY(d.total)}`);
  const idxAtual  = dados.findIndex(d => d.offset===0);
  const linhaReal = pontosLinha.slice(0, idxAtual+1).join(' ');
  const linhaProj = pontosLinha.slice(idxAtual).join(' ');

  const marcadores = dados.map((d,i) => {
    const cx = i*colW+colW/2, cy = escalaY(d.total);
    if(d.offset===0) return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    if(d.projetado)  return `<circle cx="${cx}" cy="${cy}" r="3" fill="var(--surface)" stroke="var(--muted)" stroke-width="1.5"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="3" fill="var(--muted)"/>`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="tendencia-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="tendHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="var(--accent)" opacity=".22"/>
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" stroke-width="2" opacity=".45"/>
      </pattern>
    </defs>
    <polyline points="${linhaReal}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>
    <polyline points="${linhaProj}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>
    ${barras}
    ${marcadores}
  </svg>`;

  const atual = dados.find(d => d.offset===0);
  const pctComprometido = previsaoReceitasRec>0
    ? Math.round((atual?.comprometido||0)/previsaoReceitasRec*100)
    : (atual && atual.total>0 ? Math.round(atual.comprometido/atual.total*100) : 0);
  const corPct = pctComprometido>80 ? 'var(--danger)' : pctComprometido>60 ? 'var(--warning)' : 'var(--success)';
  const insightTxt = previsaoReceitasRec>0
    ? `Já são <strong style="color:${corPct}">${pctComprometido}%</strong> da receita provisionada (${fmt(previsaoReceitasRec)}) comprometidos este mês.`
    : `Já são <strong style="color:${corPct}">${pctComprometido}%</strong> comprometidos este mês.`;

  const primeiro = dados[0], ultimo = dados[dados.length-1];
  const subiu = ultimo.total >= primeiro.total;
  const mesInicial = MESES_ABREV[Number(primeiro.ref.split('-')[1])-1];
  const mesFinal    = MESES_ABREV[Number(ultimo.ref.split('-')[1])-1];
  const tendenciaTxt = primeiro.total>0
    ? `Projeção ${subiu?'sobe':'cai'} de ${fmt(primeiro.total)} (${mesInicial}) para ${fmt(ultimo.total)} (${mesFinal}).`
    : '';

  // Saldo real acumulado (parte do saldo atual das contas, soma o resultado líquido
  // mês a mês) — mesmo raciocínio do Saldo Livre Estimado de Movimentações, projetado
  // até o último mês da janela.
  const saldoTxt = ultimo.saldoProjetado !== null
    ? `Saldo projetado até ${mesFinal}: <strong style="color:${ultimo.saldoProjetado>=0?'var(--success)':'var(--danger)'}">${fmt(ultimo.saldoProjetado)}</strong>`
    : '';

  el('blocoPrevisao').innerHTML = `
    ${svg}
    <div class="tendencia-legend">
      <span><i style="background:var(--accent)"></i> Comprometido</span>
      <span><i style="background:var(--danger)"></i> Variável</span>
      ${previsaoReceitasRec>0 ? `<span><i style="background:var(--success);opacity:.5"></i> Livre</span>` : ''}
      <span><i class="hatch"></i> Projetado</span>
    </div>
    <div class="tendencia-insight">
      <p>${insightTxt}</p>
      ${tendenciaTxt ? `<p class="muted">${tendenciaTxt}</p>` : ''}
      ${saldoTxt ? `<p class="muted">${saldoTxt}</p>` : ''}
    </div>
  `;
}

// ── Últimos lançamentos ───────────────────────────────
function renderUltimos(lancamentos, cartaoLanc){
  const cartaoNorm = (cartaoLanc||[]).map(c => ({
    type: 'despesa',
    amount: c.valor_total,
    description: c.descricao,
    date: c.data_compra,
    status: c.status,
    created_at: c.created_at,
    accounts: { nome: '💳 ' + (c.credit_cards?.nome || 'Cartão'), currency: 'BRL' },
    categories: c.categories,
  }));

  const todos = [...(lancamentos||[]), ...cartaoNorm]
    .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    .slice(0, 8);

  if(!todos.length){
    el('ultimosLancamentos').innerHTML = `
      <div style="text-align:center;padding:28px 16px">
        <div style="font-size:36px;margin-bottom:8px">💸</div>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px">Nenhum lançamento cadastrado ainda.</p>
        <a href="./movements.html" class="btn btn-primary compact" style="font-size:12px">Registrar primeiro lançamento</a>
      </div>`;
    return;
  }

  el('ultimosLancamentos').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Data</th><th>Tipo</th><th>Descrição</th>
        <th>Conta / Cartão</th><th>Categoria</th><th>Valor</th>
      </tr></thead>
      <tbody>
        ${todos.map(item => `
          <tr>
            <td style="white-space:nowrap">${item.date?.split('-').reverse().join('/')}</td>
            <td><span class="badge ${item.type==='receita'?'success':'danger'}">${item.type}</span></td>
            <td>${item.description||'-'}</td>
            <td>${item.accounts?.nome||'-'}</td>
            <td>${item.categories?.icon||''} ${item.categories?.nome||'-'}</td>
            <td class="money ${item.type==='receita'?'positive':'negative'}">
              ${item.type==='receita'?'+':'-'}${fmt(item.amount, item.accounts?.currency||'BRL')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Score de Saúde Financeira ─────────────────────────
function renderScore({ totalSaldo, receitas, despesas, totalFaturas, investimentos, cartaoLimites, metas, recorrentes }){

  // ── Critérios e pontuação (total = 100) ───────────
  const itens = [];

  // 1. Taxa de poupança (25 pts) — inclui faturas de cartão como despesa real
  const despesasTotal = despesas + totalFaturas;
  const taxaPoupanca = receitas > 0 ? ((receitas - despesasTotal) / receitas * 100) : 0;
  const ptsPoupanca = taxaPoupanca >= 20 ? 25
    : taxaPoupanca >= 10 ? 18
    : taxaPoupanca >= 5  ? 10
    : taxaPoupanca > 0   ? 5
    : 0;
  itens.push({
    label: 'Taxa de poupança',
    pts: ptsPoupanca,
    max: 25,
    cor: taxaPoupanca >= 20 ? 'success' : taxaPoupanca >= 10 ? 'warning' : 'danger',
    detalhe: `${taxaPoupanca.toFixed(1)}% do salário`,
  });

  // 2. Reserva de emergência (25 pts)
  // Meta: 6x as despesas mensais (inclui faturas de cartão)
  const despesasMensaisRec = recorrentes.filter(r=>r.type==='despesa').reduce((s,r)=>s+Number(r.amount||0),0);
  const despesasRef = despesasMensaisRec > 0 ? despesasMensaisRec : (despesasTotal > 0 ? despesasTotal : 0);
  const reservaIdeal = despesasRef * 6;
  const pctReserva   = reservaIdeal > 0 ? Math.min(totalSaldo / reservaIdeal * 100, 100) : 0;
  const ptsReserva   = pctReserva >= 100 ? 25 : pctReserva >= 50 ? 15 : pctReserva >= 25 ? 8 : pctReserva > 0 ? 3 : 0;
  itens.push({
    label: 'Reserva de emergência',
    pts: ptsReserva,
    max: 25,
    cor: pctReserva >= 100 ? 'success' : pctReserva >= 50 ? 'warning' : 'danger',
    detalhe: `${pctReserva.toFixed(0)}% da meta (6x despesas)`,
  });

  // 3. Uso do limite do cartão (20 pts)
  const limiteTotal  = cartaoLimites.reduce((s,c) => s + Number(c.limite||0), 0);
  const pctCartao    = limiteTotal > 0 ? (totalFaturas / limiteTotal * 100) : 0;
  // sem limite cadastrado → 0 pts (não penalizar mas também não bonificar)
  const ptsCartao    = limiteTotal === 0 ? 0 : pctCartao <= 20 ? 20 : pctCartao <= 40 ? 14 : pctCartao <= 70 ? 7 : pctCartao <= 90 ? 3 : 0;
  itens.push({
    label: 'Uso do cartão de crédito',
    pts: ptsCartao,
    max: 20,
    cor: limiteTotal === 0 ? 'neutral' : pctCartao <= 20 ? 'success' : pctCartao <= 40 ? 'warning' : 'danger',
    detalhe: limiteTotal > 0 ? `${pctCartao.toFixed(0)}% do limite usado` : 'Sem limite cadastrado',
  });

  // 4. Diversificação de investimentos (20 pts)
  const classes = new Set(investimentos.map(i => i.tipo));
  const totalInvest = investimentos.reduce((s,i) => s + (Number(i.quantidade||0) * Number(i.cotacao_atual||i.preco_medio||0)), 0);
  const ptsInvest = totalInvest <= 0 ? 0 : classes.size >= 4 ? 20 : classes.size >= 3 ? 15 : classes.size >= 2 ? 10 : 5;
  itens.push({
    label: 'Diversificação de investimentos',
    pts: ptsInvest,
    max: 20,
    cor: ptsInvest >= 15 ? 'success' : ptsInvest >= 5 ? 'warning' : 'danger',
    detalhe: totalInvest > 0 ? `${classes.size} classe${classes.size !== 1 ? 's' : ''} de ativo` : 'Sem investimentos',
  });

  // 5. Metas ativas (10 pts)
  const metasAtivas = metas.filter(m => Number(m.valor_atual||0) > 0);
  const ptsMetas = metasAtivas.length >= 2 ? 10 : metasAtivas.length === 1 ? 6 : metas.length > 0 ? 2 : 0;
  itens.push({
    label: 'Metas financeiras',
    pts: ptsMetas,
    max: 10,
    cor: ptsMetas >= 6 ? 'success' : ptsMetas >= 2 ? 'warning' : 'danger',
    detalhe: `${metasAtivas.length} meta${metasAtivas.length !== 1 ? 's' : ''} com aporte`,
  });

  // ── Score total ────────────────────────────────────
  const score = itens.reduce((s,i) => s + i.pts, 0);
  const corScore = score >= 80 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';
  const labelScore = score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : 'Atenção';

  // ── Atualizar DOM ──────────────────────────────────
  const circunferencia = 2 * Math.PI * 46; // ~289
  const offset = circunferencia - (score / 100) * circunferencia;

  el('scoreNum').textContent   = score;
  el('scoreNum').style.color   = corScore;
  el('scoreLabel').textContent = labelScore;
  el('scoreLabel').style.color = corScore;
  el('scoreCircle').style.stroke = corScore;
  setTimeout(() => {
    el('scoreCircle').style.strokeDashoffset = offset;
  }, 100);

  const corVar = cor => cor === 'success' ? 'var(--success)' : cor === 'warning' ? 'var(--warning)' : cor === 'danger' ? 'var(--danger)' : 'var(--muted)';

  el('scoreItens').innerHTML = itens.map(item => `
    <div class="score-item">
      <span class="color-dot" style="background:${corVar(item.cor)};border-color:${corVar(item.cor)}"></span>
      <span class="score-item-label">${item.label}<br>
        <span style="font-size:10px;color:var(--muted)">${item.detalhe}</span>
      </span>
      <div class="score-item-bar-wrap">
        <div class="score-item-bar" style="width:${(item.pts/item.max*100).toFixed(0)}%;background:${corVar(item.cor)}"></div>
      </div>
      <span class="score-item-pts" style="color:${corVar(item.cor)}">${item.pts}/${item.max}</span>
    </div>
  `).join('');

  el('blocoScore').style.display = 'flex';
}

// ── Listeners de navegação — Tendência de Gastos ──────
el('btnPrevisaoAnterior').addEventListener('click', () => {
  if(previsaoBaseOffset <= TENDENCIA_MIN_BASE) return;
  previsaoBaseOffset -= 1;
  carregarTendencia(previsaoBaseOffset);
});
el('btnPrevisaoProximo').addEventListener('click', () => {
  if(previsaoBaseOffset >= TENDENCIA_MAX_BASE) return;
  previsaoBaseOffset += 1;
  carregarTendencia(previsaoBaseOffset);
});

carregarDashboard();
initAssistantBar(user.id).catch(() => {});
emailService.agendarLembretes(user.id, supabase).catch(() => {});

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') carregarDashboard();
});
