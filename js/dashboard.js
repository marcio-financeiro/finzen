import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }
const user = sessionData.session.user;
document.getElementById('userEmail').innerText = user.email;
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
const CORES = ['#4b84f3','#22c55e','#f59e0b','#ef4444','#7c5cfc','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6'];

// ── Carregamento paralelo ─────────────────────────────
async function carregarDashboard(){
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
  ] = await Promise.all([
    supabase.from('accounts').select('id,nome,currency,saldo_atual,color').eq('user_id',user.id).eq('active',true),                                                                                          // contas
    supabase.from('transactions').select('type,amount,status,date,category_id,categories:category_id(nome,icon,cor)').eq('user_id',user.id).gte('date',inicio).lte('date',fim),                              // transacoesMes
    supabase.from('card_transactions').select('valor_parcela,fatura_referencia,status,card_id,category_id').eq('user_id',user.id).eq('status','aberta').eq('fatura_referencia',ref),                                     // parcelasMes
    supabase.from('transactions').select('id,description,amount,date,type,status').eq('user_id',user.id).eq('status','pendente').gte('date',hoje().toISOString().split('T')[0]).lte('date', (() => { const d=new Date(hoje()); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; })()).order('date',{ascending:true}).limit(5), // transacoesPendentes
    supabase.from('budgets').select('*,categories:category_id(nome,icon)').eq('user_id',user.id).eq('mes_referencia',ref),                                                                                   // orcamentos
    supabase.from('goals').select('*').eq('user_id',user.id).eq('ativo',true).order('data_alvo',{ascending:true}).limit(5),                                                                                  // metas
    supabase.from('transactions').select('type,amount,recurrence_frequency').eq('user_id',user.id).eq('is_recurring',true).eq('recurrence_active',true),                                                     // recorrentes
    supabase.from('transactions').select('id,type,amount,description,date,status,accounts:account_id(nome,currency),categories:category_id(nome,icon)').eq('user_id',user.id).order('date',{ascending:false}).order('created_at',{ascending:false}).limit(8), // ultimosLanc
    supabase.from('categories').select('id,nome,icon,cor').eq('user_id',user.id),                                                                                                                            // categorias
    supabase.from('transactions').select('type,amount,date,status').eq('user_id',user.id).eq('status','pendente').gte('date',hoje().toISOString().split('T')[0]).lte('date',ultimoDiaMes()),                 // pendentesRestantesMes
    supabase.from('credit_cards').select('id,nome,vencimento_dia').eq('user_id',user.id).eq('ativo',true),                                                                                                   // cartoes
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

  // ── Alertas de vencimento ─────────────────────────
  renderAlertas(transacoesPendentes||[], cartoes||[], parcelasMes||[]);

  // ── Pizza de despesas ─────────────────────────────
  renderPizza(pagas.filter(t=>t.type==='despesa'));

  // ── Saúde do orçamento ───────────────────────────
  renderOrcamento(orcamentos||[], pagas.filter(t=>t.type==='despesa'));

  // ── Metas ────────────────────────────────────────
  renderMetas(metas||[]);

  // ── Receita líquida recorrente ───────────────────
  renderReceitaLiquida(recorrentes||[]);

  // ── Previsão de saldo do mês ────────────────────
  renderPrevisao(totalSaldo, receitas, despesas, pendentesRestantesMes||[], totalFaturas);

  // ── Últimos lançamentos ──────────────────────────
  renderUltimos(ultimosLanc||[]);
}

// ── Alertas ───────────────────────────────────────────
function renderAlertas(pendentes, cartoes, parcelasMes){
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

  // Faturas de cartão — calcular data de vencimento do mês atual
  const d = hoje();
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;

  cartoes.forEach(cartao => {
    if(!cartao.vencimento_dia) return;

    // Calcular data de vencimento deste mês
    let anoVenc = ano;
    let mesVenc = mes;
    let diaVenc = cartao.vencimento_dia;

    // Se o dia já passou esse mês, o próximo vencimento é no mês seguinte
    if(diaVenc < d.getDate()){
      mesVenc = mes + 1;
      if(mesVenc > 12){ mesVenc = 1; anoVenc++; }
    }

    const dataVenc = `${anoVenc}-${String(mesVenc).padStart(2,'0')}-${String(diaVenc).padStart(2,'0')}`;
    const dias = diasAte(dataVenc);

    if(dias === null || dias < 0 || dias > 14) return;

    // Calcular total da fatura (parcelas abertas do mês de referência)
    const ref = `${ano}-${String(mes).padStart(2,'0')}`;
    const totalFatura = parcelasMes
      .filter(p => p.card_id === cartao.id)
      .reduce((s, p) => s + Number(p.valor_parcela || 0), 0);

    if(totalFatura <= 0) return;

    alertas.push({
      tipo: 'fatura',
      titulo: `Fatura ${cartao.nome}`,
      subtitulo: `Vence dia ${diaVenc} · ${formatData(dataVenc)}`,
      valor: totalFatura,
      dias,
    });
  });

  // Ordenar por urgência
  alertas.sort((a, b) => a.dias - b.dias);

  if(!alertas.length){
    el('blocoAlertas').innerHTML = '<p class="muted" style="font-size:13px">✅ Nenhum vencimento nos próximos 7 dias.</p>';
    return;
  }

  el('blocoAlertas').innerHTML = alertas.map(a => {
    const urgencia = a.dias === 0 ? '🔴' : a.dias <= 2 ? '🟡' : '🟢';
    const label    = a.dias === 0 ? 'hoje' : a.dias === 1 ? 'amanhã' : `em ${a.dias} dias`;
    const icone    = a.tipo === 'fatura' ? '💳' : '📄';
    return `<div class="alerta-item">
      <span class="alerta-icon">${urgencia}</span>
      <div class="alerta-info">
        <strong>${icone} ${a.titulo}</strong>
        <small>Vence ${label} · ${a.subtitulo}</small>
      </div>
      <span class="alerta-valor negative">-${fmt(a.valor)}</span>
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
function renderOrcamento(orcamentos, despesasMes){
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

  const cores = ['#4b84f3','#22c55e','#7c5cfc','#f59e0b','#ef4444'];
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
  const corAtual = saldoAtual >= 0 ? '#4b84f3' : '#ef4444';

  // Posição Y do ponto atual para o círculo
  const yAtual = H - pad - ((saldoAtual-minV)/range)*(H-pad*2);

  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:56px;display:block;margin:12px 0;">
    <polyline points="${pts}" fill="none" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <line x1="${pad}" y1="${H-pad-((saldoInicial-minV)/range)*(H-pad*2)}" x2="${W/2}" y2="${yAtual}"
      stroke="${corLinha}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${xs[0]}" cy="${H-pad-((saldoInicial-minV)/range)*(H-pad*2)}" r="5" fill="var(--surface)" stroke="#4b84f3" stroke-width="2"/>
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

// ── Últimos lançamentos ───────────────────────────────
function renderUltimos(lancamentos){
  if(!lancamentos.length){
    el('ultimosLancamentos').innerHTML = '<p class="muted" style="padding:16px;font-size:13px">Nenhum lançamento cadastrado.</p>';
    return;
  }

  el('ultimosLancamentos').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Data</th><th>Tipo</th><th>Descrição</th>
        <th>Conta</th><th>Categoria</th><th>Valor</th>
      </tr></thead>
      <tbody>
        ${lancamentos.map(item => `
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

carregarDashboard();
