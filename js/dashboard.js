import { supabase } from './supabaseClient.js';
import { initAssistantBar } from './assistantBar.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { notificarContasVencendo, notificarFaturaVencendo } from './telegram.js';

// ── Auth ──────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }

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

// Paleta de cores para pizza
const CORES = ['#f59e0b','#22c55e','#f59e0b','#ef4444','#7c5cfc','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6'];

// ── Navegação de mês — card "Previsão de Saldo do Mês" ─
const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PREVISAO_MIN_OFFSET = -12; // até 12 meses no passado
const PREVISAO_MAX_OFFSET = 6;   // até 6 meses no futuro
let previsaoOffset = 0;
let previsaoCarregando = false;
let previsaoBase = null;        // dados do mês atual, calculados em carregarDashboard()
let previsaoSaldoFimAtual = 0;  // saldo previsto fim do mês atual (ponto de partida p/ meses futuros)
let previsaoReceitasRec = 0;    // receitas fixas/mês (igual ao card Receita Líquida Recorrente)
let previsaoDespesasRec = 0;    // despesas fixas/mês

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
    ] = await Promise.all([
      supabase.from('accounts').select('id,nome,currency,saldo_atual,color').eq('user_id',user.id).eq('active',true),                                                                                          // contas
      supabase.from('transactions').select('type,amount,status,date,category_id,categories:category_id(nome,icon,cor)').eq('user_id',user.id).gte('date',inicio).lte('date',fim),                              // transacoesMes
      supabase.from('card_transactions').select('valor_parcela,fatura_referencia,status,card_id,category_id').eq('user_id',user.id).in('status',['aberta','pendente']).eq('fatura_referencia',ref),                         // parcelasMes
      supabase.from('transactions').select('id,description,amount,date,type,status').eq('user_id',user.id).eq('status','pendente').gte('date',hoje().toISOString().split('T')[0]).lte('date', (() => { const d=new Date(hoje()); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; })()).order('date',{ascending:true}).limit(5), // transacoesPendentes
      supabase.from('budgets').select('*,categories:category_id(nome,icon)').eq('user_id',user.id).eq('mes_referencia',ref),                                                                                   // orcamentos
      supabase.from('goals').select('*').eq('user_id',user.id).eq('ativo',true).order('data_alvo',{ascending:true}).limit(5),                                                                                  // metas
      supabase.from('transactions').select('type,amount,recurrence_frequency').eq('user_id',user.id).eq('is_recurring',true).eq('recurrence_active',true),                                                     // recorrentes
      supabase.from('transactions').select('id,type,amount,description,date,status,created_at,accounts:account_id(nome,currency),categories:category_id(nome,icon)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(8), // ultimosLanc
      supabase.from('categories').select('id,nome,icon,cor').eq('user_id',user.id),                                                                                                                            // categorias
      supabase.from('transactions').select('type,amount,date,status').eq('user_id',user.id).eq('status','pendente').gte('date',hoje().toISOString().split('T')[0]).lte('date',ultimoDiaMes()),                 // pendentesRestantesMes
      supabase.from('credit_cards').select('id,nome,vencimento_dia').eq('user_id',user.id).eq('ativo',true),                                                                                                   // cartoes
      supabase.from('card_transactions').select('id,descricao,valor_total,data_compra,status,created_at,credit_cards:card_id(nome),categories:category_id(nome,icon)').eq('user_id',user.id).eq('parcela_atual',1).order('created_at',{ascending:false}).limit(8), // ultimosCartao
      supabase.from('transactions').select('type,amount,status').eq('user_id',user.id).eq('status','pago').gte('date',primeiroDiaMesAnterior()).lte('date',ultimoDiaMesAnterior()),  // txMesAnterior
    ]);

    // ── KPIs ─────────────────────────────────────────
    const totalSaldo = (contas||[]).filter(c=>(c.currency||'BRL')==='BRL').reduce((s,c)=>s+Number(c.saldo_atual||0),0);
    const tx = transacoesMes||[];
    const pagas = tx.filter(t=>t.status==='pago');
    const receitas = pagas.filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
    const despesas = pagas.filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
    const resultado = receitas - despesas;
    const totalFaturas = (parcelasMes||[]).reduce((s,p)=>s+Number(p.valor_parcela||0),0);

    el('kpiSaldo').innerText     = fmt(totalSaldo);
    el('kpiReceitas').innerText  = fmt(receitas);
    el('kpiDespesas').innerText  = fmt(despesas);
    el('kpiResultado').innerText = fmt(resultado);
    el('kpiFaturas').innerText   = fmt(totalFaturas);
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

    // ── Alertas + Próximas faturas (Stage 2) ─────────
    renderAlertas(transacoesPendentes||[]);
    renderFaturas(cartoes||[], parcelasMes||[]);

    // ── Pizza de despesas ─────────────────────────────
    renderPizza(pagas.filter(t=>t.type==='despesa'));

    // ── Saúde do orçamento ───────────────────────────
    renderOrcamento(orcamentos||[], pagas.filter(t=>t.type==='despesa'), parcelasMes||[]);

    // ── Metas ────────────────────────────────────────
    renderMetas(metas||[]);

    // ── Receita líquida recorrente ───────────────────
    renderReceitaLiquida(recorrentes||[]);

    // ── Previsão de saldo do mês ────────────────────
    previsaoBase = { saldoAtual: totalSaldo, receitasPagas: receitas, despesasPagas: despesas, txPendentes: pendentesRestantesMes||[], faturasCartao: totalFaturas };
    renderPrevisao(totalSaldo, receitas, despesas, pendentesRestantesMes||[], totalFaturas);

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

  // Notificações Telegram (fire-and-forget)
  if(alertas.length) notificarContasVencendo(alertas).catch(()=>{});

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

    const refMes = `${ano}-${String(mes).padStart(2,'0')}`;
    const total  = parcelasMes.filter(p=>p.card_id===cartao.id).reduce((s,p)=>s+Number(p.valor_parcela||0),0);

    faturas.push({ nome: cartao.nome, diaVenc: diaV, dataVenc, total, dias });
  });

  // Notificações Telegram
  faturas.forEach(f => {
    if(f.dias <= 7 && f.total > 0)
      notificarFaturaVencendo({ cartao: f.nome, valor: f.total, dias: f.dias }).catch(()=>{});
  });

  if(!faturas.length){
    el('blocoFaturas').innerHTML = '<p class="muted" style="font-size:13px">Nenhum cartão ativo cadastrado.</p>';
    return;
  }

  el('blocoFaturas').innerHTML = faturas.sort((a,b)=>a.dias-b.dias).map(f => {
    const pillClass = f.dias === 0 ? 'urgente' : f.total === 0 ? 'pago' : 'pendente';
    const pillLabel = f.dias === 0 ? 'Vence hoje' : f.total === 0 ? 'Sem lançamentos' : 'Pendente';
    return `<div class="invoice-row">
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
function renderPizza(despesasMes){
  if(!despesasMes.length){
    el('blocoPizza').innerHTML = '<p class="muted" style="font-size:13px">Nenhuma despesa registrada este mês.</p>';
    return;
  }

  // Agrupar por categoria
  const grupos = {};
  despesasMes.forEach(t => {
    const nome = t.categories?.nome || 'Sem categoria';
    const icon = t.categories?.icon || '';
    const cor  = t.categories?.cor;
    if(!grupos[nome]) grupos[nome] = { nome, icon, cor, total: 0 };
    grupos[nome].total += Number(t.amount||0);
  });

  const items = Object.values(grupos).sort((a,b)=>b.total-a.total).slice(0,8);
  const total = items.reduce((s,i)=>s+i.total,0);

  // SVG donut
  const R=60, cx=70, cy=70, stroke=22;
  const circ = 2*Math.PI*R;
  let offset = 0;
  const segmentos = items.map((item,i) => {
    const pct = item.total/total;
    const dash = pct*circ;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${R}"
      fill="none" stroke="${item.cor||CORES[i%CORES.length]}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ-dash}"
      stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    item._cor = item.cor||CORES[i%CORES.length];
    return seg;
  });

  const svg = `<svg class="pizza-svg" width="140" height="140" viewBox="0 0 140 140">
    ${segmentos.join('')}
    <text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--muted)" font-size="10" font-weight="700">TOTAL</text>
    <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="800">${fmt(total)}</text>
  </svg>`;

  const legenda = items.map(item => {
    const pct = (item.total/total*100).toFixed(1);
    return `<div class="pizza-item">
      <span class="pizza-dot" style="background:${item._cor}"></span>
      <span class="pizza-label">${item.icon} ${item.nome}</span>
      <span class="pizza-pct">${pct}%</span>
    </div>`;
  }).join('');

  el('blocoPizza').innerHTML = `<div class="pizza-wrap">${svg}<div class="pizza-legend">${legenda}</div></div>`;
}

// ── Orçamento ─────────────────────────────────────────
function renderOrcamento(orcamentos, despesasMes, parcelasMes){
  if(!orcamentos.length){
    el('blocoOrcamento').innerHTML = `<p class="muted" style="font-size:13px">
      Nenhum orçamento configurado para este mês.
      <a href="./budgets.html" style="color:var(--accent);margin-left:4px">Configurar →</a>
    </p>`;
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
    el('blocoMetas').innerHTML = `<p class="muted" style="font-size:13px">
      Nenhuma meta ativa.
      <a href="./goals.html" style="color:var(--accent);margin-left:4px">Criar →</a>
    </p>`;
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
    el('blocoReceitaLiquida').innerHTML = '<p class="muted" style="font-size:13px">Nenhuma receita ou despesa recorrente cadastrada.</p>';
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

// ── Previsão saldo do mês ─────────────────────────────
function renderPrevisao(saldoAtual, receitasPagas, despesasPagas, txPendentes, faturasCartao){
  // Saldo inicial = saldo atual - resultado já registrado no mês
  const resultadoAtual = receitasPagas - despesasPagas;
  const saldoInicial   = saldoAtual - resultadoAtual;

  // Pendentes restantes no mês (receitas e despesas) + faturas de cartão abertas
  const receitasPend  = txPendentes.filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
  const despesasPend  = txPendentes.filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
  const faturas       = Number(faturasCartao||0);
  const saldoPrevisto = saldoAtual + receitasPend - despesasPend - faturas;
  previsaoSaldoFimAtual = saldoPrevisto;

  const diff = saldoPrevisto - saldoInicial;

  // Linha do tempo: inicial → atual → previsto
  const pontos3 = [saldoInicial, saldoAtual, saldoPrevisto];
  const minV = Math.min(...pontos3);
  const maxV = Math.max(...pontos3);
  const range = maxV - minV || 1;
  const W=500, H=56, pad=6;

  const xs = [pad, W/2, W-pad];
  const pts = pontos3.map((v,i) => {
    const x = xs[i];
    const y = H - pad - ((v-minV)/range)*(H-pad*2);
    return `${x},${y}`;
  }).join(' ');

  const corLinha = saldoPrevisto >= saldoInicial ? '#22c55e' : '#ef4444';
  const corAtual = saldoAtual >= 0 ? '#f59e0b' : '#ef4444';

  // Posição Y do ponto atual para o círculo
  const yAtual = H - pad - ((saldoAtual-minV)/range)*(H-pad*2);

  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:56px;display:block;margin:12px 0;">
    <polyline points="${pts}" fill="none" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <line x1="${pad}" y1="${H-pad-((saldoInicial-minV)/range)*(H-pad*2)}" x2="${W/2}" y2="${yAtual}"
      stroke="${corLinha}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${xs[0]}" cy="${H-pad-((saldoInicial-minV)/range)*(H-pad*2)}" r="5" fill="var(--surface)" stroke="#f59e0b" stroke-width="2"/>
    <circle cx="${xs[1]}" cy="${yAtual}" r="6" fill="${corAtual}" stroke="var(--surface)" stroke-width="2"/>
    <circle cx="${xs[2]}" cy="${H-pad-((saldoPrevisto-minV)/range)*(H-pad*2)}" r="5" fill="var(--surface)" stroke="${corLinha}" stroke-width="2" stroke-dasharray="3 2"/>
  </svg>`;

  el('blocoPrevisao').innerHTML = `
    <div class="previsao-grid">
      <div class="previsao-kpi">
        <span>Início do mês</span>
        <strong class="${saldoInicial>=0?'positive':'negative'}">${fmt(saldoInicial)}</strong>
      </div>
      <div class="previsao-kpi">
        <span>Saldo atual</span>
        <strong class="${saldoAtual>=0?'positive':'negative'}" style="font-size:17px">${fmt(saldoAtual)}</strong>
      </div>
      <div class="previsao-kpi">
        <span>Previsto fim do mês</span>
        <strong class="${saldoPrevisto>=saldoInicial?'positive':'negative'}">${fmt(saldoPrevisto)}</strong>
      </div>
    </div>
    ${svg}
    <p class="muted" style="font-size:11px;text-align:center">
      ${receitasPend>0?`+${fmt(receitasPend)} a receber `:''}${despesasPend>0?`−${fmt(despesasPend)} a pagar `:''}${faturas>0?`−${fmt(faturas)} faturas cartão`:''}
    </p>
  `;
}

// ── Navegação do card "Previsão de Saldo do Mês" ──────
function atualizarNavPrevisao(offset, carregando){
  el('previsaoMesLabel').textContent = mesComOffset(offset).label;
  el('btnPrevisaoAnterior').classList.toggle('is-disabled', carregando || offset <= PREVISAO_MIN_OFFSET);
  el('btnPrevisaoProximo').classList.toggle('is-disabled', carregando || offset >= PREVISAO_MAX_OFFSET);
}

async function carregarPrevisaoMes(offset){
  if(previsaoCarregando) return;
  if(offset === 0 && !previsaoBase) return; // mês atual ainda não carregou

  previsaoCarregando = true;
  atualizarNavPrevisao(offset, true);

  if(offset === 0){
    renderPrevisao(previsaoBase.saldoAtual, previsaoBase.receitasPagas, previsaoBase.despesasPagas, previsaoBase.txPendentes, previsaoBase.faturasCartao);
  } else {
    el('blocoPrevisao').innerHTML = '<p class="muted" style="font-size:13px;text-align:center;padding:20px 0">Carregando...</p>';
    if(offset < 0){
      await carregarPrevisaoPassado(offset);
    } else {
      await carregarPrevisaoFuturo(offset);
    }
  }

  previsaoCarregando = false;
  atualizarNavPrevisao(offset, false);
}

// Mês passado: dados reais (já fechados) — sem projeção
async function carregarPrevisaoPassado(offset){
  try {
    const { inicio, fim, ref } = mesComOffset(offset);
    const [
      { data: txMes },
      { data: parcelasMes },
    ] = await Promise.all([
      supabase.from('transactions').select('type,amount,status').eq('user_id',user.id).eq('status','pago').gte('date',inicio).lte('date',fim),
      supabase.from('card_transactions').select('valor_parcela').eq('user_id',user.id).eq('fatura_referencia',ref),
    ]);
    const receitas   = (txMes||[]).filter(t=>t.type==='receita').reduce((s,t)=>s+Number(t.amount||0),0);
    const despesasTx = (txMes||[]).filter(t=>t.type==='despesa').reduce((s,t)=>s+Number(t.amount||0),0);
    const faturas    = (parcelasMes||[]).reduce((s,p)=>s+Number(p.valor_parcela||0),0);
    const despesas   = despesasTx + faturas;
    renderPrevisaoPassado(receitas, despesas);
  } catch(err) {
    console.error('[Dashboard:Passado]', err);
    el('blocoPrevisao').innerHTML = '<p class="block-loading">Erro ao carregar dados do mês.</p>';
  }
}

function renderPrevisaoPassado(receitas, despesas){
  const resultado = receitas - despesas;
  el('blocoPrevisao').innerHTML = `
    <div class="previsao-grid">
      <div class="previsao-kpi">
        <span>Receitas do mês</span>
        <strong class="positive">${fmt(receitas)}</strong>
      </div>
      <div class="previsao-kpi">
        <span>Despesas do mês</span>
        <strong class="negative">${fmt(despesas)}</strong>
      </div>
      <div class="previsao-kpi">
        <span>Resultado do mês</span>
        <strong class="${resultado>=0?'positive':'negative'}" style="font-size:17px">${fmt(resultado)}</strong>
      </div>
    </div>
    <p class="muted" style="font-size:11px;text-align:center;margin-top:10px">
      📅 Mês encerrado — valores já realizados (receitas, despesas e faturas de cartão pagas).
    </p>
  `;
}

// Mês futuro: previsão encadeada a partir do saldo previsto do mês atual
async function carregarPrevisaoFuturo(offset){
  try {
    const inicioRange = mesComOffset(1).inicio;
    const refInicial  = mesComOffset(1).ref;
    const { fim: fimRange, ref: refAlvo } = mesComOffset(offset);

    const [
      { data: parcelasFuturas },
      { data: pendentesFuturos },
    ] = await Promise.all([
      supabase.from('card_transactions').select('valor_parcela,fatura_referencia').eq('user_id',user.id).in('status',['aberta','pendente']).gte('fatura_referencia',refInicial).lte('fatura_referencia',refAlvo),
      supabase.from('transactions').select('type,amount,date').eq('user_id',user.id).eq('status','pendente').gte('date',inicioRange).lte('date',fimRange),
    ]);

    const faturasPorMes = {};
    (parcelasFuturas||[]).forEach(p => {
      faturasPorMes[p.fatura_referencia] = (faturasPorMes[p.fatura_referencia]||0) + Number(p.valor_parcela||0);
    });

    const pendentesPorMes = {};
    (pendentesFuturos||[]).forEach(t => {
      const refMes = String(t.date).slice(0,7);
      if(!pendentesPorMes[refMes]) pendentesPorMes[refMes] = { receita:0, despesa:0 };
      pendentesPorMes[refMes][t.type] = (pendentesPorMes[refMes][t.type]||0) + Number(t.amount||0);
    });

    let saldoFim = previsaoSaldoFimAtual;
    let saldoInicio = saldoFim;
    for(let i=1; i<=offset; i++){
      const { ref } = mesComOffset(i);
      const receitasPrev = previsaoReceitasRec + (pendentesPorMes[ref]?.receita||0);
      const despesasPrev = previsaoDespesasRec + (pendentesPorMes[ref]?.despesa||0) + (faturasPorMes[ref]||0);
      saldoInicio = saldoFim;
      saldoFim    = saldoInicio + receitasPrev - despesasPrev;
    }

    renderPrevisaoFuturo(saldoInicio, saldoFim);
  } catch(err) {
    console.error('[Dashboard:Futuro]', err);
    el('blocoPrevisao').innerHTML = '<p class="block-loading">Erro ao calcular previsão.</p>';
  }
}

function renderPrevisaoFuturo(saldoInicio, saldoFim){
  const pontos = [saldoInicio, saldoFim];
  const minV = Math.min(...pontos);
  const maxV = Math.max(...pontos);
  const range = maxV - minV || 1;
  const W=500, H=56, pad=6;
  const xs = [pad, W-pad];
  const corLinha = saldoFim >= saldoInicio ? '#22c55e' : '#ef4444';
  const yInicio = H - pad - ((saldoInicio-minV)/range)*(H-pad*2);
  const yFim    = H - pad - ((saldoFim-minV)/range)*(H-pad*2);

  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:56px;display:block;margin:12px 0;">
    <line x1="${xs[0]}" y1="${yInicio}" x2="${xs[1]}" y2="${yFim}"
      stroke="${corLinha}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 5"/>
    <circle cx="${xs[0]}" cy="${yInicio}" r="5" fill="var(--surface)" stroke="${corLinha}" stroke-width="2" stroke-dasharray="3 2"/>
    <circle cx="${xs[1]}" cy="${yFim}" r="5" fill="var(--surface)" stroke="${corLinha}" stroke-width="2" stroke-dasharray="3 2"/>
  </svg>`;

  el('blocoPrevisao').innerHTML = `
    <div class="previsao-grid" style="grid-template-columns:1fr 1fr">
      <div class="previsao-kpi">
        <span>Início previsto</span>
        <strong class="${saldoInicio>=0?'positive':'negative'}">${fmt(saldoInicio)}</strong>
      </div>
      <div class="previsao-kpi">
        <span>Previsto fim do mês</span>
        <strong class="${saldoFim>=saldoInicio?'positive':'negative'}">${fmt(saldoFim)}</strong>
      </div>
    </div>
    ${svg}
    <p class="previsao-disclaimer">📊 Previsão — baseada em receitas/despesas fixas e parcelas de cartão já agendadas. Os valores reais podem variar.</p>
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
    el('ultimosLancamentos').innerHTML = '<p class="muted" style="padding:16px;font-size:13px">Nenhum lançamento cadastrado.</p>';
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

  // 1. Taxa de poupança (25 pts)
  const taxaPoupanca = receitas > 0 ? ((receitas - despesas) / receitas * 100) : 0;
  const ptsPoupanca = taxaPoupanca >= 20 ? 25
    : taxaPoupanca >= 10 ? 18
    : taxaPoupanca >= 5  ? 10
    : taxaPoupanca > 0   ? 5
    : 0;
  itens.push({
    label: 'Taxa de poupança',
    pts: ptsPoupanca,
    max: 25,
    icon: taxaPoupanca >= 20 ? '✅' : taxaPoupanca >= 10 ? '🟡' : '🔴',
    detalhe: `${taxaPoupanca.toFixed(1)}% do salário`,
  });

  // 2. Reserva de emergência (25 pts)
  // Meta: 6x as despesas mensais
  const despesasMensaisRec = recorrentes.filter(r=>r.type==='despesa').reduce((s,r)=>s+Number(r.amount||0),0);
  const despesasRef = despesasMensaisRec > 0 ? despesasMensaisRec : despesas;
  const reservaIdeal = despesasRef * 6;
  const pctReserva   = reservaIdeal > 0 ? Math.min(totalSaldo / reservaIdeal * 100, 100) : 0;
  const ptsReserva   = pctReserva >= 100 ? 25 : pctReserva >= 50 ? 15 : pctReserva >= 25 ? 8 : pctReserva > 0 ? 3 : 0;
  itens.push({
    label: 'Reserva de emergência',
    pts: ptsReserva,
    max: 25,
    icon: pctReserva >= 100 ? '✅' : pctReserva >= 50 ? '🟡' : '🔴',
    detalhe: `${pctReserva.toFixed(0)}% da meta (6x despesas)`,
  });

  // 3. Uso do limite do cartão (20 pts)
  const limiteTotal  = cartaoLimites.reduce((s,c) => s + Number(c.limite||0), 0);
  const pctCartao    = limiteTotal > 0 ? (totalFaturas / limiteTotal * 100) : 0;
  const ptsCartao    = pctCartao <= 20 ? 20 : pctCartao <= 40 ? 14 : pctCartao <= 70 ? 7 : pctCartao <= 90 ? 3 : 0;
  itens.push({
    label: 'Uso do cartão de crédito',
    pts: ptsCartao,
    max: 20,
    icon: pctCartao <= 20 ? '✅' : pctCartao <= 40 ? '🟡' : '🔴',
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
    icon: ptsInvest >= 15 ? '✅' : ptsInvest >= 5 ? '🟡' : '🔴',
    detalhe: totalInvest > 0 ? `${classes.size} classe${classes.size !== 1 ? 's' : ''} de ativo` : 'Sem investimentos',
  });

  // 5. Metas ativas (10 pts)
  const metasAtivas = metas.filter(m => Number(m.valor_atual||0) > 0);
  const ptsMetas = metasAtivas.length >= 2 ? 10 : metasAtivas.length === 1 ? 6 : metas.length > 0 ? 2 : 0;
  itens.push({
    label: 'Metas financeiras',
    pts: ptsMetas,
    max: 10,
    icon: ptsMetas >= 6 ? '✅' : ptsMetas >= 2 ? '🟡' : '🔴',
    detalhe: `${metasAtivas.length} meta${metasAtivas.length !== 1 ? 's' : ''} com aporte`,
  });

  // ── Score total ────────────────────────────────────
  const score = itens.reduce((s,i) => s + i.pts, 0);
  const corScore = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f59e0b' : '#ef4444';
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

  el('scoreItens').innerHTML = itens.map(item => `
    <div class="score-item">
      <span style="font-size:13px">${item.icon}</span>
      <span class="score-item-label">${item.label}<br>
        <span style="font-size:10px;color:var(--muted)">${item.detalhe}</span>
      </span>
      <div class="score-item-bar-wrap">
        <div class="score-item-bar" style="width:${(item.pts/item.max*100).toFixed(0)}%;background:${
          item.pts/item.max >= .8 ? '#22c55e' : item.pts/item.max >= .5 ? '#f59e0b' : '#ef4444'
        }"></div>
      </div>
      <span class="score-item-pts" style="color:${
        item.pts/item.max >= .8 ? '#22c55e' : item.pts/item.max >= .5 ? '#f59e0b' : '#ef4444'
      }">${item.pts}/${item.max}</span>
    </div>
  `).join('');

  el('blocoScore').style.display = 'flex';
}

// ── Listeners de navegação — Previsão de Saldo do Mês ─
el('btnPrevisaoAnterior').addEventListener('click', () => {
  if(previsaoOffset <= PREVISAO_MIN_OFFSET) return;
  previsaoOffset -= 1;
  carregarPrevisaoMes(previsaoOffset);
});
el('btnPrevisaoProximo').addEventListener('click', () => {
  if(previsaoOffset >= PREVISAO_MAX_OFFSET) return;
  previsaoOffset += 1;
  carregarPrevisaoMes(previsaoOffset);
});
atualizarNavPrevisao(previsaoOffset, false);

carregarDashboard();
initAssistantBar(user.id).catch(() => {});

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') carregarDashboard();
});
