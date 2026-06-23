import { confirmarExclusao } from './confirmModal.js';
import { D, somaSegura, multSegura, diferencaSegura, divSegura, valorDoPercentual, percentualDe } from './decimalMath.js';
import { registrarAcao } from './eventBus.js';
import { getCotacoes, getDolar, limparCache } from './quoteCache.js';
import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';
import { DEFAULT_USD_BRL, formatPercent, formatUSD, getUsdBrlRate, saveUsdBrlRate, toNumber } from './services/financeService.js';
import { FINZEN_SECRET }  from './apiClient.js';

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }
const user = sessionData.session.user;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let dolarAtual  = DEFAULT_USD_BRL;
let ativos      = [];   // investments table
let corretoras  = [];   // broker accounts
let todasContas = [];   // all active accounts
let pesos       = {};   // { ticker: { classeIdeal, ativoIdeal } }
let editandoId  = null;

const el = id => document.getElementById(id);

// ─────────────────────────────────────────────
// ABAS
// ─────────────────────────────────────────────
document.querySelectorAll('.inv-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inv-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.inv-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    el('tab-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'dividendos') carregarDividendos();
    if(btn.dataset.tab === 'balancear')  renderizarBalancear();
    if(btn.dataset.tab === 'aportar')    carregarTransacoes();
    if(btn.dataset.tab === 'comite')     restaurarAnalise();
  });
});

// ─────────────────────────────────────────────
// COMITÊ DE INVESTIMENTOS
// ─────────────────────────────────────────────
function restaurarAnalise() {
  const msgEl = el('comiteMensagem');
  const resEl = el('comiteResultado');
  if (resEl.innerHTML) return; // já tem conteúdo na sessão atual

  try {
    const salvo = JSON.parse(localStorage.getItem('finzen_comite_analise') || 'null');
    if (!salvo) return;
    const quando = new Date(salvo.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    msgEl.className = 'message info';
    msgEl.innerText = `Última análise: ${quando} · ${salvo.ativos} ativos — clique em "Gerar análise" para atualizar`;
    resEl.innerHTML = salvo.html;
  } catch (_) {}
}
function montarPayloadCarteira() {
  const patrimonio_total = somaSegura(ativos.map(a => calcBRL(a, calcAtual(a))));
  const total_brl_brl    = somaSegura(ativos.filter(a => (a.moeda||'BRL') === 'BRL').map(a => calcAtual(a)));
  const total_brl_usd    = somaSegura(ativos.filter(a => (a.moeda||'BRL') === 'USD').map(a => calcAtual(a) * dolarAtual));

  // Distribuição por classe
  const dist_classe = {};
  ativos.forEach(a => {
    const cl = classeKey(a.tipo);
    const vl = calcBRL(a, calcAtual(a));
    if (!dist_classe[cl]) dist_classe[cl] = { valor: 0, pct: 0 };
    dist_classe[cl].valor += vl;
  });
  Object.keys(dist_classe).forEach(k => {
    dist_classe[k].pct = patrimonio_total > 0 ? (dist_classe[k].valor / patrimonio_total) * 100 : 0;
  });

  const ativosPayload = ativos.map(a => {
    const valApl = calcBRL(a, calcAplicado(a));
    const valAtl = calcBRL(a, calcAtual(a));
    const rent   = valApl > 0 ? ((valAtl - valApl) / valApl) * 100 : 0;
    const peso   = patrimonio_total > 0 ? (valAtl / patrimonio_total) * 100 : 0;
    return {
      ticker:         a.ticker,
      nome:           a.nome || tipoLabel(a.tipo),
      tipo:           a.tipo,
      classe:         classeKey(a.tipo),
      moeda:          a.moeda || 'BRL',
      quantidade:     toNumber(a.quantidade),
      preco_medio:    toNumber(a.preco_medio).toFixed(2),
      cotacao_atual:  toNumber(a.cotacao_atual || a.preco_medio).toFixed(2),
      valor_atual_brl: valAtl.toFixed(0),
      peso_pct:       peso.toFixed(1),
      rent_pct:       rent.toFixed(1),
    };
  }).sort((a, b) => parseFloat(b.peso_pct) - parseFloat(a.peso_pct));

  return { dolar: dolarAtual.toFixed(4), patrimonio_total, total_brl_brl, total_brl_usd, ativos: ativosPayload, dist_classe };
}

function mdParaHtml(md) {
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  const lines = md.split('\n');
  let html = '';
  let inUl    = false;
  let inOl    = false;
  let inTable = false;
  let tHead   = true;

  const closeList  = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
  const closeTable = () => { if (inTable) { html += '</tbody></table>'; inTable = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // ── H2
    if (/^## /.test(line)) {
      closeList(); closeTable();
      html += `<h2>${inline(line.slice(3))}</h2>`;
      continue;
    }
    // ── H3
    if (/^### /.test(line)) {
      closeList(); closeTable();
      html += `<h3>${inline(line.slice(4))}</h3>`;
      continue;
    }
    // ── Tabela
    if (/^\|.+\|/.test(line)) {
      closeList();
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^[-: ]+$/.test(c))) {
        html += '</thead><tbody>'; tHead = false; continue;
      }
      if (!inTable) { html += '<table><thead>'; inTable = true; tHead = true; }
      const tag = tHead ? 'th' : 'td';
      html += `<tr>${cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`;
      continue;
    }
    if (inTable && !/^\|/.test(line)) closeTable();

    // ── Lista não-ordenada
    if (/^[\-\*] /.test(line)) {
      closeTable();
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    // ── Lista ordenada
    if (/^\d+\. /.test(line)) {
      closeTable();
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${inline(line.replace(/^\d+\. /, ''))}</li>`;
      continue;
    }

    // ── Linha vazia
    if (line.trim() === '') { closeList(); closeTable(); continue; }

    // ── Parágrafo
    closeList(); closeTable();
    html += `<p>${inline(line)}</p>`;
  }
  closeList(); closeTable();
  return html;
}

async function gerarAnaliseComite() {
  const btnGerar = el('btnGerarAnalise');
  const msgEl    = el('comiteMensagem');
  const resEl    = el('comiteResultado');

  if (!ativos.length) {
    msgEl.className = 'message warning';
    msgEl.innerText = 'Nenhum ativo cadastrado na carteira.';
    return;
  }

  btnGerar.disabled = true;
  btnGerar.innerHTML = '<span class="inv-spinner"></span> Analisando...';
  msgEl.className = 'message info';
  msgEl.innerText = 'Claude Sonnet está analisando sua carteira — pode levar ~30s...';
  resEl.innerHTML = '';

  try {
    const carteira = montarPayloadCarteira();
    const r = await fetch('/api/portfolio-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-finzen-secret': FINZEN_SECRET,
      },
      body: JSON.stringify({ carteira }),
    });

    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || `Erro ${r.status}`);
    }

    const { analise } = await r.json();

    msgEl.className = 'message success';
    msgEl.innerText = `Análise gerada em ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${ativos.length} ativos`;

    const htmlAnalise = `<div class="comite-output">${mdParaHtml(analise)}</div>`;
    resEl.innerHTML = htmlAnalise;

    localStorage.setItem('finzen_comite_analise', JSON.stringify({
      html: htmlAnalise,
      ts: Date.now(),
      ativos: ativos.length,
    }));

  } catch (e) {
    msgEl.className = 'message danger';
    msgEl.innerText = 'Erro: ' + e.message;
  } finally {
    btnGerar.disabled = false;
    btnGerar.innerHTML = '🧠 Gerar análise';
  }
}

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────
function hojeISO(){ return new Date().toISOString().split('T')[0]; }
function fmtData(d){ if(!d) return '-'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; }
function fmtMoeda(v,m){ return m==='USD'?formatUSD(v):formatCurrency(v,'BRL'); }
function calcAplicado(a){ return multSegura(toNumber(a.quantidade),toNumber(a.preco_medio)); }
function calcAtual(a){ return multSegura(toNumber(a.quantidade),toNumber(a.cotacao_atual||a.preco_medio)); }
function calcBRL(a,v){ return (a.moeda||'BRL')==='USD'?v*dolarAtual:v; }
function isBR(t){ return ['acao_br','fii','etf_br'].includes(t); }
function isEUA(t){ return ['acao_eua','etf_eua'].includes(t); }
function isRF(t){ return t==='renda_fixa'; }
function tipoLabel(t){
  return {acao_br:'Ação BR',fii:'FII',etf_br:'ETF BR',acao_eua:'Ação EUA',
    etf_eua:'ETF EUA',renda_fixa:'Renda Fixa',acao:'Ação',etf:'ETF',exterior:'Exterior'}[t]||t||'-';
}
function classeKey(t){
  if(t==='fii') return 'FIIs';
  if(t==='acao_br' || t==='acao') return 'Ações BR';
  if(t==='etf_br' || t==='etf') return 'ETFs BR';
  if(t==='acao_eua') return 'Ações EUA';
  if(t==='etf_eua') return 'ETFs EUA';
  if(t==='renda_fixa') return 'Renda Fixa';
  if(t==='cripto') return 'Cripto';
  return 'Outros';
}
function msg(elId,texto,tipo='info'){
  const e=el(elId); if(!e) return;
  e.className=`message ${tipo}`; e.innerText=texto;
}

// ─────────────────────────────────────────────
// COTAÇÕES — via Vercel Function proxy (resolve CORS)
// ─────────────────────────────────────────────
async function fetchCotacoes(tickersBR, tickersEUA, comDolar=true, forcar=false){
  try{
    const todos = [...new Set([...tickersBR, ...tickersEUA])];
    return await getCotacoes(todos, comDolar, forcar);
  }catch(_){ return {}; }
}

async function fetchDolar(){
  try{
    return (await getDolar()) || dolarAtual;
  }catch(_){ return dolarAtual; }
}

async function atualizarCotacoes(silencioso=false){
  if(!silencioso){
    el('btnAtualizar').disabled=true;
    el('btnAtualizar').innerHTML='<span class="inv-spinner"></span> Atualizando...';
    msg('mensagemCotacao','Buscando cotações...','info');
  }
  try{
    const tickBR  = ativos.filter(a=>isBR(a.tipo)).map(a=>a.ticker.toUpperCase());
    const tickEUA = ativos.filter(a=>isEUA(a.tipo)).map(a=>a.ticker.toUpperCase());
    const cots = await fetchCotacoes(tickBR, tickEUA, true);

    // Dólar
    const novoDolar = cots['USD-BRL'] || dolarAtual;
    if(Math.abs(novoDolar-dolarAtual)>0.001){
      dolarAtual=novoDolar;
      el('dolarReferencia').value=dolarAtual.toFixed(4);
      try{ await saveUsdBrlRate(user.id,dolarAtual); }catch(_){}
    }

    let n=0; const agora=new Date().toISOString();
    for(const a of ativos){
      if(isRF(a.tipo)) continue;
      const nova = cots[a.ticker.toUpperCase()];
      if(!nova) continue;
      const atual=toNumber(a.cotacao_atual||0);
      if(atual>0&&Math.abs(nova-atual)/atual<0.0001) continue;
      await supabase.from('investments').update({cotacao_atual:nova,atualizado_em:agora})
        .eq('id',a.id).eq('user_id',user.id);
      a.cotacao_atual=nova; a.atualizado_em=agora; n++;
    }

    const hr=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    el('ultimaAtualizacao').innerText=`Atualizado ${hr} · ${n} ativo(s)`;
    if(!silencioso) msg('mensagemCotacao',`${n} cotação(ões) atualizada(s). USD/BRL: ${dolarAtual.toFixed(4)}`,'success');
    renderizarTudo();
  }catch(e){
    if(!silencioso) msg('mensagemCotacao','Erro: '+e.message,'danger');
  }finally{
    el('btnAtualizar').disabled=false;
    el('btnAtualizar').innerHTML='🔄 Atualizar cotações';
  }
}

// ─────────────────────────────────────────────
// CARREGAR DADOS
// ─────────────────────────────────────────────
async function carregarDolar(){
  try{ dolarAtual=await getUsdBrlRate(user.id); }catch(_){}
  el('dolarReferencia').value=dolarAtual;
}

async function carregarCorretoras(){
  const {data}=await supabase.from('accounts').select('id,nome,bank,currency,saldo_atual')
    .eq('user_id',user.id).eq('active',true).eq('account_kind','broker')
    .order('nome',{ascending:true});
  corretoras=data||[];

  // Se nenhuma corretora com account_kind='broker', mostra todas as contas
  if(!corretoras.length){
    const {data:all}=await supabase.from('accounts').select('id,nome,bank,currency,saldo_atual')
      .eq('user_id',user.id).eq('active',true)
      .order('nome',{ascending:true});
    corretoras=all||[];
  }

  const {data:d2}=await supabase.from('accounts').select('id,nome,bank,currency,saldo_atual')
    .eq('user_id',user.id).eq('active',true).order('nome',{ascending:true});
  todasContas=d2||[];

  // Filtro carteira
  el('filtroCorretora').innerHTML='<option value="">Todas as corretoras</option>'+
    corretoras.map(c=>`<option value="${c.nome}">${c.nome}</option>`).join('');

  // Select aporte
  el('corretoraAtivo').innerHTML='<option value="">Selecione a corretora</option>'+
    corretoras.map(c=>`<option value="${c.id}" data-currency="${c.currency||'BRL'}" data-nome="${c.nome}">
      ${c.nome} — saldo: ${formatCurrency(c.saldo_atual||0,c.currency||'BRL')}</option>`).join('');

  // Select dividendo conta destino
  el('divConta').innerHTML='<option value="">Selecione a conta</option>'+
    todasContas.map(c=>`<option value="${c.id}">${c.nome} (${formatCurrency(c.saldo_atual||0,c.currency||'BRL')})</option>`).join('');
}

async function carregarAtivos(){
  const {data,error}=await supabase.from('investments').select('*')
    .eq('user_id',user.id).eq('ativo',true)
    .order('corretora',{ascending:true}).order('ticker',{ascending:true});
  if(error) throw error;
  ativos=data||[];

  // Preencher select de ativos nos dividendos
  el('divAtivo').innerHTML='<option value="">Selecione o ativo</option>'+
    ativos.map(a=>`<option value="${a.id}" data-qty="${a.quantidade}">${a.ticker} — ${a.nome||''}</option>`).join('');
}

async function carregarPesos(){
  const {data}=await supabase.from('user_settings')
    .select('setting_key,setting_value').eq('user_id',user.id)
    .like('setting_key','inv_peso_%');
  pesos={};
  (data||[]).forEach(r=>{ pesos[r.setting_key]=JSON.parse(r.setting_value||'{}'); });
}

// ─────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────
function renderizarKPIs(){
  const aplicBRL  = somaSegura(ativos.map(a=>calcBRL(a,calcAplicado(a))));
  const patrimBRL = somaSegura(ativos.map(a=>calcBRL(a,calcAtual(a))));
  const resultado = patrimBRL-aplicBRL;
  const pct       = aplicBRL?resultado/aplicBRL*100:0;

  el('kpiAplicado').innerText=formatCurrency(aplicBRL,'BRL');
  el('kpiPatrimonio').innerText=formatCurrency(patrimBRL,'BRL');
  el('kpiResultado').innerText=formatCurrency(resultado,'BRL');
  el('kpiResultado').className=resultado>=0?'positive':'negative';
  el('kpiResultadoPct').innerText=(resultado>=0?'+':'')+formatPercent(pct);
}

// ─────────────────────────────────────────────
// KPI DIVIDENDOS (total acumulado)
// ─────────────────────────────────────────────
async function carregarTotalDividendos(){
  const {data}=await supabase.from('dividends').select('valor_total').eq('user_id',user.id);
  const total=(data||[]).reduce((s,d)=>s+toNumber(d.valor_total),0);
  el('kpiDividendos').innerText=formatCurrency(total,'BRL');
}

// ─────────────────────────────────────────────
// CAGR
// ─────────────────────────────────────────────
async function calcCAGR(aplicBRL, patrimBRL){
  if(aplicBRL<=0||patrimBRL<=0) return null;
  const {data}=await supabase
    .from('investment_transactions')
    .select('data')
    .eq('user_id',user.id)
    .order('data',{ascending:true})
    .limit(1);
  if(!data?.length) return null;
  const primeira=new Date(data[0].data);
  const anos=(Date.now()-primeira.getTime())/(365.25*24*60*60*1000);
  if(anos<0.08) return null;
  return Math.pow(patrimBRL/aplicBRL,1/anos)-1;
}

// ─────────────────────────────────────────────
// CARD VARIAÇÃO + RENTABILIDADE
// ─────────────────────────────────────────────
async function renderizarDesempenho(){
  const aplicBRL  = somaSegura(ativos.map(a=>calcBRL(a,calcAplicado(a))));
  const patrimBRL = somaSegura(ativos.map(a=>calcBRL(a,calcAtual(a))));
  const resultado = patrimBRL-aplicBRL;
  const varPct    = aplicBRL>0?resultado/aplicBRL*100:0;

  // Variação
  const seta = resultado>0?'↑':resultado<0?'↓':'';
  const cor   = resultado>0?'var(--success)':resultado<0?'var(--danger)':'var(--muted)';
  el('desempenhoVarPct').innerHTML=
    `<span style="color:${cor}">${resultado>=0?'+':''}${formatPercent(varPct)} ${seta}</span>`;
  el('desempenhoVarBrl').innerText=formatCurrency(resultado,'BRL');

  // CAGR
  const cagr=await calcCAGR(aplicBRL,patrimBRL);
  if(cagr===null){
    el('desempenhoCAGR').innerHTML='<span style="color:var(--muted)">—</span>';
  } else {
    const cor2=cagr>=0?'var(--success)':'var(--danger)';
    const seta2=cagr>=0?'↗':'↘';
    el('desempenhoCAGR').innerHTML=
      `<span style="color:${cor2}">${cagr>=0?'+':''}${formatPercent(cagr*100)} ${seta2}</span>`;
  }
}

// ─────────────────────────────────────────────
// TABELA RENTABILIDADE MENSAL
// ─────────────────────────────────────────────
async function renderizarTabelaRentabilidade(){
  const cont=el('tabelaRentabilidade');
  const {data,error}=await supabase
    .from('patrimony_history')
    .select('reference_month,investments_total')
    .eq('user_id',user.id)
    .order('reference_month',{ascending:true});

  if(error||!data?.length){
    cont.innerHTML='<p class="muted">Nenhum histórico disponível. Salve um snapshot mensal para ver a evolução.</p>';
    return;
  }

  // Mapa 'YYYY-MM' → valor
  const map={};
  data.forEach(r=>{ map[r.reference_month.substring(0,7)]=toNumber(r.investments_total); });
  const allKeys=Object.keys(map).sort();

  // Retorno mês a mês (compara com mês calendário anterior)
  const returns={};
  allKeys.forEach((key,i)=>{
    if(i===0){ returns[key]=null; return; }
    const prevKey=allKeys[i-1];
    const [py,pm]=prevKey.split('-').map(Number);
    const [cy,cm]=key.split('-').map(Number);
    const isPriorMonth=(cy*12+cm)===(py*12+pm+1);
    if(!isPriorMonth||map[prevKey]<=0){ returns[key]=null; return; }
    returns[key]=(map[key]-map[prevKey])/map[prevKey];
  });

  // Fator acumulado correndo
  let runFactor=1;
  const accumFactors={};
  allKeys.forEach(key=>{
    if(returns[key]!==null&&returns[key]!==undefined) runFactor*=(1+returns[key]);
    accumFactors[key]=runFactor-1;
  });

  const years=[...new Set(allKeys.map(k=>k.substring(0,4)))].sort();
  const mLabels=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const fmtPct=v=>(v>=0?'+':'')+formatPercent(v*100);
  const pctCell=(v,bold=false)=>{
    if(v===null||v===undefined) return `<td class="pct-dash"${bold?' style="font-weight:700"':''}>—</td>`;
    return `<td class="${v>=0?'pct-pos':'pct-neg'}"${bold?' style="font-weight:700"':''}>${fmtPct(v)}</td>`;
  };

  let html=`<table class="data-table rent-table">
  <thead><tr>
    <th>Ano</th>
    ${mLabels.map(m=>`<th>${m}</th>`).join('')}
    <th>Ret. anual</th><th>Acumulado</th>
  </tr></thead><tbody>`;

  years.forEach(year=>{
    // Produto encadeado dos meses com retorno no ano
    let yearFactor=1; let hasYear=false;
    for(let m=1;m<=12;m++){
      const k=`${year}-${String(m).padStart(2,'0')}`;
      if(returns[k]!==null&&returns[k]!==undefined){ yearFactor*=(1+returns[k]); hasYear=true; }
    }
    const yearRet=hasYear?yearFactor-1:null;

    // Último mês do ano com dado para acumulado
    let lastKey=null;
    for(let m=12;m>=1;m--){
      const k=`${year}-${String(m).padStart(2,'0')}`;
      if(map[k]!==undefined){ lastKey=k; break; }
    }
    const accum=lastKey?accumFactors[lastKey]:null;

    html+=`<tr><td><strong>${year}</strong></td>`;
    for(let m=1;m<=12;m++){
      const k=`${year}-${String(m).padStart(2,'0')}`;
      html+=pctCell(returns[k]);
    }
    html+=pctCell(yearRet,true);
    html+=pctCell(accum,true);
    html+=`</tr>`;
  });

  html+=`</tbody></table>`;
  cont.innerHTML=html;
}

// ─────────────────────────────────────────────
// CARTEIRA (aba 1)
// ─────────────────────────────────────────────
function renderizarCarteira(){
  const filtro = el('filtroCorretora').value;
  const lista  = filtro ? ativos.filter(a=>a.corretora===filtro||
    corretoras.find(c=>c.id===a.corretora_id)?.nome===filtro) : ativos;

  const patrimTotal = somaSegura(lista.map(a=>calcBRL(a,calcAtual(a))));

  // Agrupar por classe
  const classes={};
  lista.forEach(a=>{
    const k=classeKey(a.tipo);
    if(!classes[k]) classes[k]={ativos:[],total:0};
    classes[k].ativos.push(a);
    classes[k].total=D(classes[k].total).plus(calcBRL(a,calcAtual(a))).toNumber();
  });

  if(!lista.length){ el('listaCarteira').innerHTML='<p class="muted">Nenhum ativo cadastrado.</p>'; return; }

  let html='';
  for(const [classe,grupo] of Object.entries(classes)){
    const pctReal = patrimTotal?percentualDe(grupo.total,patrimTotal):0;
    const pesoChave = `inv_peso_classe_${classe.replace(/\s/g,'_')}`;
    const pesoObj   = pesos[pesoChave]||{};
    const pctIdeal  = toNumber(pesoObj.ideal||0);
    const over      = pctIdeal>0 && pctReal>pctIdeal*1.05;

    const colId = `col-carteira-${classe.replace(/\s/g,'_')}`;
    html+=`
      <div class="inv-class-header inv-collapsible" onclick="document.getElementById('${colId}').classList.toggle('collapsed')">
        <span>📁 ${classe} — ${formatCurrency(grupo.total,'BRL')}</span>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="inv-class-pct">
            <span>Real: <strong>${formatPercent(pctReal)}</strong></span>
            ${pctIdeal?`<span>Ideal: <strong>${formatPercent(pctIdeal)}</strong></span>`:''}
          </div>
          <span class="inv-collapse-icon">▾</span>
        </div>
      </div>
      ${pctIdeal?`<div class="inv-pct-bar-wrap"><div class="inv-pct-bar${over?' over':''}" style="width:${Math.min(pctReal/pctIdeal*100,200)}%"></div></div>`:''}
      <div id="${colId}" class="inv-class-body collapsed">
    `;

    // Tabela desktop
    html+=`<div class="inv-desktop-table"><table class="data-table">
      <thead><tr>
        <th>Ticker</th><th>Nome</th><th>Qtd</th>
        <th>Cotação</th>
        <th>Aplicado</th><th>Atual</th><th>Resultado</th>
        <th>%&nbsp;Classe</th><th>%&nbsp;Ideal</th><th>Comprar?</th><th>Ações</th>
      </tr></thead><tbody>`;

    grupo.ativos.forEach(a=>{
      const m       = a.moeda||'BRL';
      const aplic   = calcAplicado(a);
      const atual   = calcAtual(a);
      const res     = atual-aplic;
      const pct     = aplic?res/aplic*100:0;
      // % dentro da classe (não da carteira total)
      const pctCart = grupo.total?calcBRL(a,atual)/grupo.total*100:0;
      const pk      = `inv_peso_${a.ticker}`;
      const pideal  = toNumber((pesos[pk]||{}).ideal||0);
      const diff    = pideal-pctCart;
      const comprar = pideal>0?(diff>1?'sim':diff<-1?'vender':'ok'):'';

      html+=`<tr>
        <td><strong>${a.ticker}</strong></td>
        <td>${a.nome||'-'}</td>
        <td class="money">${toNumber(a.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:6})}</td>
        <td class="money">${fmtMoeda(toNumber(a.cotacao_atual||a.preco_medio),m)}
          ${a.atualizado_em?'<span style="font-size:9px;color:var(--success)"> ✓auto</span>':''}
        </td>
        <td class="money">${fmtMoeda(aplic,m)}${m==='USD'?`<br><small class="muted">${formatCurrency(calcBRL(a,aplic),'BRL')}</small>`:''}
        </td>
        <td class="money">${fmtMoeda(atual,m)}${m==='USD'?`<br><small class="muted">${formatCurrency(calcBRL(a,atual),'BRL')}</small>`:''}
        </td>
        <td class="money ${res>=0?'positive':'negative'}">
          ${res>=0?'+':''}${fmtMoeda(res,m)}<br>
          <small>${res>=0?'+':''}${formatPercent(pct)}</small>
        </td>
        <td>${formatPercent(pctCart)}</td>
        <td>${pideal?formatPercent(pideal):'-'}</td>
        <td>${comprar==='sim'?'<span class="badge-comprar">✅ Sim</span>':comprar==='vender'?'<span class="badge-vender">⬇ Reduzir</span>':comprar==='ok'?'<span class="badge-nao">— Ok</span>':'-'}</td>
        <td>
          <div class="inv-acoes-wrap">
            <button class="btn btn-secondary compact inv-acoes-btn" data-menu="${a.id}" title="Ações">⋯</button>
            <div class="inv-acoes-menu" id="menu-${a.id}">
              <button data-editar="${a.id}">✏️ Editar</button>
              <button data-action="abrirCotacaoManual" data-cot-manual="${a.id}" data-ticker="${a.ticker}">💲 Cotação manual</button>
              <button data-action="abrirDiarioTese" data-tese="${a.id}" data-ticker="${a.ticker}">📓 Diário de tese</button>
              ${isBR(a.tipo)?`<button data-action="abrirFicha" data-ticker="${a.ticker}">📊 Fundamentalistas</button>`:''}
              <button data-excluir="${a.id}" data-ticker="${a.ticker}" style="color:var(--danger)">🗑️ Excluir</button>
            </div>
          </div>
        </td>
      </tr>`;
    });
    html+=`</tbody></table></div>`;

    // Cards mobile
    html+=`<div class="inv-mobile-list">`;
    grupo.ativos.forEach(a=>{
      const m=a.moeda||'BRL';
      const aplic=calcAplicado(a); const atual=calcAtual(a);
      const res=atual-aplic; const pct=aplic?res/aplic*100:0;
      html+=`<div class="inv-mobile-card">
        <div class="inv-mobile-top">
          <div><div class="inv-ticker">${a.ticker}</div><div class="inv-nome">${a.nome||tipoLabel(a.tipo)}</div></div>
          <strong class="${res>=0?'positive':'negative'}">${res>=0?'+':''}${formatPercent(pct)}</strong>
        </div>
        <div class="inv-mobile-grid">
          <div><span>Qtd</span><strong>${toNumber(a.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:4})}</strong></div>
          <div><span>Cotação</span><strong class="money">${fmtMoeda(toNumber(a.cotacao_atual||a.preco_medio),m)}</strong></div>
          <div><span>Aplicado</span><strong class="money">${fmtMoeda(aplic,m)}</strong></div>
          <div><span>Atual</span><strong class="money">${fmtMoeda(atual,m)}</strong></div>
          <div><span>Resultado</span><strong class="money ${res>=0?'positive':'negative'}">${res>=0?'+':''}${fmtMoeda(res,m)}</strong></div>
          ${m==='USD'?`<div><span>Em BRL</span><strong class="money">${formatCurrency(calcBRL(a,atual),'BRL')}</strong></div>`:''}
        </div>
        <div class="inv-mobile-actions">
          <button class="btn btn-secondary compact" data-editar="${a.id}">✏️ Editar</button>
          <button class="btn btn-secondary compact" data-action="abrirCotacaoManual" data-cot-manual="${a.id}" data-ticker="${a.ticker}">💲 Cotação</button>
          <button class="btn btn-secondary compact" data-action="abrirDiarioTese" data-tese="${a.id}" data-ticker="${a.ticker}">📓 Tese</button>
          ${isBR(a.tipo)?`<button class="btn btn-secondary compact" data-action="abrirFicha" data-ticker="${a.ticker}">📊 Ficha</button>`:''}
          <button class="btn btn-danger compact" data-excluir="${a.id}" data-ticker="${a.ticker}">🗑️</button>
        </div>
      </div>`;
    });
    html+=`</div>`; // inv-mobile-list
    html+=`</div>`; // inv-class-body
  }

  el('listaCarteira').innerHTML=html;

  el('listaCarteira').querySelectorAll('[data-editar]').forEach(b=>b.addEventListener('click',()=>editarAtivo(b.dataset.editar)));
  el('listaCarteira').querySelectorAll('[data-excluir]').forEach(b=>b.addEventListener('click',()=>excluirAtivo(b.dataset.excluir,b.dataset.ticker)));
  // Menu dropdown
  el('listaCarteira').querySelectorAll('.inv-acoes-btn').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.menu;
      const menu = document.getElementById('menu-' + id);
      // Fecha todos os outros
      document.querySelectorAll('.inv-acoes-menu.open').forEach(m => { if(m !== menu) m.classList.remove('open'); });
      menu?.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.inv-acoes-menu.open').forEach(m => m.classList.remove('open'));
  });
  // abrirCotacaoManual e abrirDiarioTese agora são tratados pelo eventBus via data-action
}

// ─────────────────────────────────────────────
// APORTAR (aba 2)
// ─────────────────────────────────────────────
async function salvarAtivo(){
  const ticker    = el('tickerAtivo').value.trim().toUpperCase();
  const nome      = el('nomeAtivo').value.trim();
  const tipo      = el('tipoAtivo').value;
  const contaId   = el('corretoraAtivo').value;
  const operacao  = el('operacaoAtivo').value;
  const qtd       = toNumber(el('quantidadeAtivo').value);
  let   preco     = toNumber(el('precoAtivo').value);
  const moeda     = el('moedaAtivo').value||'BRL';
  const data      = el('dataAtivo').value||hojeISO();
  const obs       = el('obsAtivo').value.trim();
  const totalInf  = toNumber(el('valorTotalAtivo').value);

  // Se não informou preço mas informou total, calcula
  if(!preco && totalInf && qtd){
    preco = totalInf / qtd;
    el('precoAtivo').value = preco.toFixed(6);
  }

  const valorTotal = totalInf || (qtd * preco);

  if(!ticker||!tipo||!contaId||!qtd||(!preco&&!totalInf)){
    msg('mensagemAtivo','Preencha ticker, tipo, corretora, quantidade e preço ou valor total.','warning'); return;
  }

  const conta = todasContas.find(c=>c.id===contaId)||corretoras.find(c=>c.id===contaId);
  if(!conta){ msg('mensagemAtivo','Conta não encontrada.','danger'); return; }

  // Verificar saldo
  if(operacao==='compra'&&toNumber(conta.saldo_atual)<valorTotal){
    msg('mensagemAtivo',`Saldo insuficiente na conta (${formatCurrency(conta.saldo_atual||0,moeda)}).`,'warning'); return;
  }

  msg('mensagemAtivo','Salvando...','info');

  try{
    if(editandoId){
      // Edição simples do ativo
      const {error}=await supabase.from('investments').update({
        ticker,nome,tipo,moeda,
        quantidade:qtd,preco_medio:preco,
        cotacao_atual:preco,
      }).eq('id',editandoId).eq('user_id',user.id);
      if(error) throw error;
      msg('mensagemAtivo','Ativo atualizado.','success');
      limparFormAtivo();
    }else{
      // Registrar transação
      await supabase.from('investment_transactions').insert({
        user_id:user.id, ticker, tipo_ativo:tipo,
        tipo_movimento:operacao, quantidade:qtd,
        preco_unitario:preco, valor_total:valorTotal,
        moeda, account_id:contaId,
        exchange_rate:moeda==='USD'?dolarAtual:null,
        data_movimento:data, observacao:obs,
      });

      // Atualizar/criar posição
      const {data:existing}=await supabase.from('investments').select('*')
        .eq('user_id',user.id).eq('ativo',true).eq('ticker',ticker).eq('moeda',moeda).maybeSingle();

      if(operacao==='compra'){
        if(existing){
          const novaQtd = toNumber(existing.quantidade)+qtd;
          const novoPM  = (toNumber(existing.quantidade)*toNumber(existing.preco_medio)+qtd*preco)/novaQtd;
          await supabase.from('investments').update({
            nome:nome||existing.nome, tipo, quantidade:novaQtd, preco_medio:novoPM,
          }).eq('id',existing.id).eq('user_id',user.id);
        }else{
          await supabase.from('investments').insert({
            user_id:user.id,ticker,nome,tipo,moeda,
            quantidade:qtd,preco_medio:preco,cotacao_atual:preco,
            corretora:conta.nome,exchange_rate:moeda==='USD'?dolarAtual:null,ativo:true,
          });
        }
      }else{
        // Venda — reduz posição
        if(existing){
          const novaQtd=toNumber(existing.quantidade)-qtd;
          if(novaQtd<=0){
            await supabase.from('investments').update({ativo:false}).eq('id',existing.id).eq('user_id',user.id);
          }else{
            await supabase.from('investments').update({quantidade:novaQtd}).eq('id',existing.id).eq('user_id',user.id);
          }
        }
      }

      // Debitar/creditar conta
      const novoSaldo = operacao==='compra'
        ? toNumber(conta.saldo_atual)-valorTotal
        : toNumber(conta.saldo_atual)+valorTotal;

      await supabase.from('accounts').update({saldo_atual:novoSaldo}).eq('id',contaId).eq('user_id',user.id);

      // Registrar em transactions para aparecer no dashboard
      await supabase.from('transactions').insert({
        user_id:user.id, account_id:contaId,
        type: operacao==='compra'?'despesa':'receita',
        amount:valorTotal,
        description:`${operacao==='compra'?'Compra':'Venda'} ${ticker} (${qtd}x ${fmtMoeda(preco,moeda)})`,
        date:data, status:'pago',
        notes:obs||`${tipoLabel(tipo)} via ${conta.nome}`,
      });

      msg('mensagemAtivo',`${operacao==='compra'?'Compra':'Venda'} de ${ticker} registrada. Saldo debitado da conta.`,'success');
      limparFormAtivo();
    }

    await carregarAtivos();
    await carregarCorretoras();
    renderizarTudo();
    carregarTransacoes();
  }catch(e){
    msg('mensagemAtivo','Erro: '+e.message,'danger');
  }
}

function editarAtivo(id){
  const a=ativos.find(x=>x.id===id); if(!a) return;
  editandoId=id;

  // Muda para aba aportar
  document.querySelectorAll('.inv-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.inv-tab-content').forEach(c=>c.classList.remove('active'));
  document.querySelector('[data-tab="aportar"]').classList.add('active');
  el('tab-aportar').classList.add('active');

  el('tickerAtivo').value=a.ticker||'';
  el('nomeAtivo').value=a.nome||'';
  el('tipoAtivo').value=a.tipo||'';
  el('quantidadeAtivo').value=a.quantidade||'';
  el('precoAtivo').value=a.preco_medio||'';
  el('moedaAtivo').value=a.moeda||'BRL';
  el('btnSalvarAtivo').innerText='Salvar Alterações';
  el('btnCancelarEdicao').style.display='';
  window.scrollTo({top:0,behavior:'smooth'});
}

async function excluirAtivo(id,ticker){
  if(!await confirmarExclusao(`Excluir <strong>${ticker}</strong> da carteira?`)) return;
  const {error}=await supabase.from('investments').update({ativo:false}).eq('id',id).eq('user_id',user.id);
  if(error){ msg('mensagemAtivo','Erro: '+error.message,'danger'); return; }
  msg('mensagemAtivo',`${ticker} removido.`,'success');
  await carregarAtivos(); renderizarTudo();
}

function limparFormAtivo(){
  editandoId=null;
  ['tickerAtivo','nomeAtivo','quantidadeAtivo','precoAtivo','valorTotalAtivo','obsAtivo'].forEach(id=>{
    const e=el(id); if(e) e.value='';
  });
  el('tipoAtivo').value='';
  el('corretoraAtivo').value='';
  el('operacaoAtivo').value='compra';
  el('moedaAtivo').value='BRL';
  el('dataAtivo').value=hojeISO();
  el('btnSalvarAtivo').innerText='Salvar Aporte';
  el('btnCancelarEdicao').style.display='none';
}

async function carregarTransacoes(){
  const {data,error}=await supabase.from('investment_transactions')
    .select('*').eq('user_id',user.id)
    .order('data_movimento',{ascending:false}).limit(30);

  const lista=el('listaTransacoes');
  if(error||!data?.length){
    lista.innerHTML='<p class="muted" style="padding:12px">Nenhuma transação registrada.</p>'; return;
  }

  lista.innerHTML=`<table class="data-table">
    <thead><tr><th>Data</th><th>Ticker</th><th>Operação</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
    <tbody>${data.map(t=>`<tr>
      <td>${fmtData(t.data_movimento)}</td>
      <td><strong>${t.ticker}</strong></td>
      <td><span class="badge ${t.tipo_movimento==='compra'?'success':'danger'}">${t.tipo_movimento}</span></td>
      <td class="money">${toNumber(t.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:6})}</td>
      <td class="money">${fmtMoeda(toNumber(t.preco_unitario),t.moeda||'BRL')}</td>
      <td class="money">${fmtMoeda(toNumber(t.valor_total),t.moeda||'BRL')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ─────────────────────────────────────────────
// DIVIDENDOS (aba 3)
// ─────────────────────────────────────────────
async function carregarDividendos(){
  const ano=el('filtroAnoDiv')?.value||new Date().getFullYear();

  // KPIs
  const {data:divData}=await supabase.from('dividends').select('*').eq('user_id',user.id);
  const todos=divData||[];
  const agora=new Date();
  const mesAtual=`${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

  const divMes=todos.filter(d=>d.data_pagamento?.startsWith(mesAtual)).reduce((s,d)=>s+toNumber(d.valor_total),0);
  const divAno=todos.filter(d=>d.data_pagamento?.startsWith(String(ano))).reduce((s,d)=>s+toNumber(d.valor_total),0);
  const divTot=todos.reduce((s,d)=>s+toNumber(d.valor_total),0);

  el('divMes').innerText=formatCurrency(divMes,'BRL');
  el('divAno').innerText=formatCurrency(divAno,'BRL');
  el('divTotal').innerText=formatCurrency(divTot,'BRL');

  // Lista
  const {data,error}=await supabase.from('dividends').select('*')
    .eq('user_id',user.id).order('data_pagamento',{ascending:false}).limit(50);

  const lista=el('listaDividendos');
  if(error||!data?.length){
    lista.innerHTML='<p class="muted" style="padding:12px">Nenhum provento registrado.</p>'; return;
  }

  lista.innerHTML=`<table class="data-table">
    <thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th>Valor/cota</th><th>Qtd cotas</th><th>Total</th><th>Conta</th></tr></thead>
    <tbody>${data.map(d=>{
      const a=ativos.find(x=>x.id===d.investment_id);
      const c=todasContas.find(x=>x.id===d.account_id);
      return `<tr>
        <td>${fmtData(d.data_pagamento)}</td>
        <td><strong>${d.ticker||a?.ticker||'-'}</strong></td>
        <td><span class="badge neutral">${d.tipo||'-'}</span></td>
        <td class="money">${formatCurrency(toNumber(d.valor_por_cota),'BRL')}</td>
        <td class="money">${toNumber(d.quantidade_cotas).toLocaleString('pt-BR',{maximumFractionDigits:4})}</td>
        <td class="money positive">+${formatCurrency(toNumber(d.valor_total),'BRL')}</td>
        <td>${c?.nome||'-'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function salvarDividendo(){
  const ativoId  = el('divAtivo').value;
  const tipo     = el('divTipo').value;
  const valCota  = toNumber(el('divValorCota').value);
  const qtdCotas = toNumber(el('divQtdCotas').value);
  const moedaDiv = el('divMoeda')?.value || 'BRL';
  const valTotalMoeda = toNumber(el('divValorTotal').value)||(valCota*qtdCotas);
  const contaId  = el('divConta').value;
  const dataPag  = el('divData').value||hojeISO();
  const obs      = el('divObs').value.trim();

  if(!ativoId||!tipo||(!valCota&&!valTotalMoeda)||!contaId){
    msg('mensagemDiv','Preencha ativo, tipo, valor e conta.','warning'); return;
  }

  const ativo=ativos.find(a=>a.id===ativoId);
  const conta=todasContas.find(c=>c.id===contaId);
  if(!ativo||!conta){ msg('mensagemDiv','Ativo ou conta não encontrados.','danger'); return; }

  // Calcular valor total em moeda original e em BRL
  const totalMoedaOriginal = valTotalMoeda||(valCota*toNumber(ativo.quantidade));
  const totalBRL = moedaDiv === 'USD' ? totalMoedaOriginal * dolarAtual : totalMoedaOriginal;

  // Valor por cota em BRL (para salvar no banco)
  const qtd = qtdCotas || toNumber(ativo.quantidade);
  const valCotaBRL = qtd > 0 ? totalBRL / qtd : 0;

  msg('mensagemDiv','Registrando...','info');
  try{
    // Inserir dividendo
    const {error:e1}=await supabase.from('dividends').insert({
      user_id:user.id, investment_id:ativoId, ticker:ativo.ticker,
      tipo, valor_por_cota:valCotaBRL, quantidade_cotas:qtd,
      valor_total:totalBRL, account_id:contaId, data_pagamento:dataPag,
      observacao:obs || (moedaDiv==='USD' ? `USD ${totalMoedaOriginal.toFixed(2)} × ${dolarAtual.toFixed(4)}` : ''),
    });
    if(e1) throw e1;

    // Creditar na conta (sempre em BRL)
    const novoSaldo=toNumber(conta.saldo_atual)+totalBRL;
    await supabase.from('accounts').update({saldo_atual:novoSaldo}).eq('id',contaId).eq('user_id',user.id);

    // Registrar como receita nas transações
    await supabase.from('transactions').insert({
      user_id:user.id, account_id:contaId,
      type:'receita', amount:totalBRL,
      description:`Dividendo ${ativo.ticker} (${tipo})`,
      date:dataPag, status:'pago',
      notes:obs||`Provento de ${ativo.ticker}${moedaDiv==='USD'?` • USD ${totalMoedaOriginal.toFixed(2)} × ${dolarAtual.toFixed(4)}`:''}`,
    });

    const msgFinal = moedaDiv === 'USD'
      ? `Dividendo de USD ${totalMoedaOriginal.toFixed(2)} → ${formatCurrency(totalBRL,'BRL')} registrado.`
      : `Dividendo de ${formatCurrency(totalBRL,'BRL')} registrado e creditado na conta.`;

    msg('mensagemDiv', msgFinal, 'success');

    // Limpar
    ['divValorCota','divQtdCotas','divValorTotal','divObs'].forEach(id=>{ const e=el(id); if(e) e.value=''; });
    el('divAtivo').value=''; el('divData').value=hojeISO();
    if(el('divMoeda')) el('divMoeda').value='BRL';
    atualizarConversaoDiv();

    await carregarCorretoras();
    carregarDividendos();
  }catch(e){
    msg('mensagemDiv','Erro: '+e.message,'danger');
  }
}

// ─────────────────────────────────────────────
// BALANCEAR (aba 4)
// ─────────────────────────────────────────────
// Todas as classes possíveis no sistema
const TODAS_CLASSES = [
  'Ações BR','FIIs','ETFs BR','Ações EUA','ETFs EUA','Renda Fixa','Cripto','Outros'
];

function renderizarBalancear(){
  const porClasse={};
  // Inicializar todas as classes (mesmo sem ativos)
  TODAS_CLASSES.forEach(k=>{ porClasse[k]=[]; });
  ativos.forEach(a=>{
    const k=classeKey(a.tipo);
    if(!porClasse[k]) porClasse[k]=[];
    porClasse[k].push(a);
  });

  let html='';
  for(const [classe,lista] of Object.entries(porClasse)){
    const ck=`inv_peso_classe_${classe.replace(/\s/g,'_')}`;
    const cideal=toNumber((pesos[ck]||{}).ideal||0);
    const colId=`col-bal-${classe.replace(/\s/g,'_')}`;
    const temAtivos=lista.length>0;

    html+=`<div class="bal-classe-row inv-collapsible" onclick="document.getElementById('${colId}').classList.toggle('collapsed')">
      <span><strong>📁 ${classe}</strong>${!temAtivos?'<small class="muted" style="margin-left:8px">sem ativos</small>':''}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="margin:0;color:var(--muted);font-size:12px;">% ideal</label>
        <input type="number" class="bal-classe-input" data-classe="${ck}"
          style="width:70px;padding:6px 8px;font-size:13px;" value="${cideal||''}" placeholder="0" min="0" max="100" step="0.1"
          inputmode="decimal" onclick="event.stopPropagation()">
        <span class="inv-collapse-icon">▾</span>
      </div>
    </div>`;

    html+=`<div id="${colId}" class="inv-class-body collapsed" style="padding:0 4px;">`;
    if(temAtivos){
      lista.forEach(a=>{
        const pk=`inv_peso_${a.ticker}`;
        const pideal=toNumber((pesos[pk]||{}).ideal||0);
        html+=`<div class="bal-row">
          <span><strong>${a.ticker}</strong> <small class="muted">${a.nome||tipoLabel(a.tipo)}</small></span>
          <span>${formatCurrency(calcBRL(a,calcAtual(a)),'BRL')}</span>
          <span class="muted" style="font-size:12px;">% na classe</span>
          <input type="number" class="bal-ativo-input" data-ticker="${pk}"
            value="${pideal||''}" placeholder="0" min="0" max="100" step="0.1" inputmode="decimal">
          <span></span>
        </div>`;
      });
    } else {
      html+=`<p class="muted" style="padding:8px 4px;font-size:13px;">Nenhum ativo nesta classe. Defina o % ideal acima para incluir na sugestão de aporte.</p>`;
    }
    html+=`</div>`;
  }

  el('balClasses').innerHTML=html;
}

async function salvarPesos(){
  const inputs=[...document.querySelectorAll('.bal-classe-input,.bal-ativo-input')];
  msg('mensagemBal','Salvando pesos...','info');
  try{
    for(const inp of inputs){
      const key=inp.dataset.classe||inp.dataset.ticker;
      const val=toNumber(inp.value);
      await supabase.from('user_settings').upsert({
        user_id:user.id, setting_key:key,
        setting_value:JSON.stringify({ideal:val}),
        updated_at:new Date().toISOString(),
      },{onConflict:'user_id,setting_key'});
      pesos[key]={ideal:val};
    }
    msg('mensagemBal','Pesos salvos com sucesso.','success');
    renderizarCarteira(); // atualiza badges
  }catch(e){
    msg('mensagemBal','Erro ao salvar: '+e.message,'danger');
  }
}

function calcularBalanceamento(){
  const aporte=toNumber(el('balValorAporte').value);
  if(!aporte){ msg('mensagemBal','Informe o valor do aporte.','warning'); return; }

  const patrimAtual=somaSegura(ativos.map(a=>calcBRL(a,calcAtual(a))));
  const novoTotal  =patrimAtual+aporte; // soma simples de 2 valores — risco de float desprezível aqui

  // Sugestões por ativo (incluindo classes sem ativos com % ideal definido)
  const sugestoes=[];

  // Sugestões baseadas em ativos individuais
  ativos.forEach(a=>{
    const pk=`inv_peso_${a.ticker}`;
    const pideal=toNumber((pesos[pk]||{}).ideal||0);
    if(!pideal) return;

    // Cálculo encadeado: % de um total grande, multiplicado por cotação em USD/BRL.
    // Aqui o erro de float pode se acumular — usar Decimal.js.
    const valorIdeal  =valorDoPercentual(pideal, novoTotal);
    const valorAtual  =calcBRL(a,calcAtual(a));
    const diferenca   =diferencaSegura(valorIdeal, valorAtual);
    const cotacao     =toNumber(a.cotacao_atual||a.preco_medio);
    const moeda       =a.moeda||'BRL';
    const cotBRL      =moeda==='USD'?multSegura(cotacao,dolarAtual):cotacao;
    const qtdSugerida =cotBRL>0?Math.floor(divSegura(diferenca,cotBRL)):0;

    if(diferenca>0&&qtdSugerida>0){
      sugestoes.push({
        ticker:a.ticker, nome:a.nome||'', tipo:tipoLabel(a.tipo),
        pideal, valorIdeal, valorAtual, diferenca,
        cotacao:fmtMoeda(cotacao,moeda), qtdSugerida,
        valorSugerido:multSegura(qtdSugerida,cotBRL), moeda,
      });
    }
  });

  // Sugestões baseadas em classes sem ativos mas com % ideal definido
  TODAS_CLASSES.forEach(classe=>{
    const ck=`inv_peso_classe_${classe.replace(/\s/g,'_')}`;
    const cideal=toNumber((pesos[ck]||{}).ideal||0);
    if(!cideal) return;
    // Verificar se a classe tem ativos — se tiver, já foi coberta acima
    const temAtivos=ativos.some(a=>classeKey(a.tipo)===classe);
    if(temAtivos) return;
    const valorIdeal=valorDoPercentual(cideal,novoTotal);
    if(valorIdeal>0){
      sugestoes.push({
        ticker:'—', nome:`Sem ativo cadastrado em ${classe}`, tipo:classe,
        pideal:cideal, valorIdeal, valorAtual:0, diferenca:valorIdeal,
        cotacao:'—', qtdSugerida:0,
        valorSugerido:valorIdeal, moeda:'BRL', semAtivo:true,
      });
    }
  });

  sugestoes.sort((a,b)=>b.diferenca-a.diferenca);

  const totalSugerido=sugestoes.reduce((s,x)=>s+x.valorSugerido,0);
  const sobra=aporte-totalSugerido;

  if(!sugestoes.length){
    el('balResultado').innerHTML='<p class="muted" style="margin-top:16px">Carteira já está balanceada ou nenhum ativo tem % ideal definido.</p>';
    return;
  }

  el('balResultado').innerHTML=`
    <div class="bal-sugestao">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div><strong>Sugestão de aporte: ${formatCurrency(aporte,'BRL')}</strong></div>
        <div class="muted" style="font-size:12px;">Sobra: ${formatCurrency(sobra,'BRL')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 80px 100px 80px 100px;gap:8px;
        font-size:11px;font-weight:800;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--border);">
        <span>Ativo</span><span>% Ideal</span><span>Falta</span><span>Qtd</span><span>Valor</span>
      </div>
      ${sugestoes.map(s=>s.semAtivo?`
        <div class="bal-sugestao-item" style="display:grid;grid-template-columns:1fr 80px 100px 80px 100px;gap:8px;opacity:.75;background:var(--surface-2,rgba(255,200,0,.04));border-radius:6px;padding:4px 0;">
          <span><strong>${s.tipo}</strong> <span class="muted" style="font-size:11px">⚠️ sem ativo cadastrado</span></span>
          <span>${formatPercent(s.pideal)}</span>
          <span class="positive">+${formatCurrency(s.diferenca,'BRL')}</span>
          <span class="muted">—</span>
          <span class="money">${formatCurrency(s.valorSugerido,'BRL')}</span>
        </div>
      `:`
        <div class="bal-sugestao-item" style="display:grid;grid-template-columns:1fr 80px 100px 80px 100px;gap:8px;">
          <span><strong>${s.ticker}</strong> <span class="muted" style="font-size:11px">${s.tipo}</span></span>
          <span>${formatPercent(s.pideal)}</span>
          <span class="positive">+${formatCurrency(s.diferenca,'BRL')}</span>
          <span><strong>${s.qtdSugerida}</strong> cotas</span>
          <span class="money">${formatCurrency(s.valorSugerido,'BRL')}</span>
        </div>
      `).join('')}
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);
        display:flex;justify-content:space-between;font-weight:800;">
        <span>Total a aportar</span>
        <span class="money positive">${formatCurrency(totalSugerido,'BRL')}</span>
      </div>
    </div>
  `;
  msg('mensagemBal','','info');
}

// ─────────────────────────────────────────────
// RENDER TUDO
// ─────────────────────────────────────────────
async function renderizarTudo(){
  renderizarKPIs();
  renderizarCarteira();
  await renderizarDesempenho();
}

// ─────────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────────
el('btnAtualizar').addEventListener('click',()=>{
  limparCache();
  atualizarCotacoes(false);
});
el('btnSalvarDolar').addEventListener('click',async()=>{
  const v=toNumber(el('dolarReferencia').value);
  if(v<=0){ msg('mensagemCotacao','Informe uma cotação válida.','warning'); return; }
  await saveUsdBrlRate(user.id,v); dolarAtual=v; renderizarTudo();
  msg('mensagemCotacao',`Dólar salvo: R$ ${v.toFixed(4)}`,'success');
});
el('filtroCorretora').addEventListener('change',renderizarCarteira);

// Aporte — calcular valor total
// Cálculo bidirecional: preço ↔ total
function recalcFromPrice(){
  const q=toNumber(el('quantidadeAtivo').value);
  const p=toNumber(el('precoAtivo').value);
  if(q&&p) el('valorTotalAtivo').value=(q*p).toFixed(2);
}
function recalcFromTotal(){
  const q=toNumber(el('quantidadeAtivo').value);
  const t=toNumber(el('valorTotalAtivo').value);
  if(q&&t) el('precoAtivo').value=(t/q).toFixed(6);
}
el('quantidadeAtivo').addEventListener('input',recalcFromPrice);
el('precoAtivo').addEventListener('input',recalcFromPrice);
el('valorTotalAtivo').addEventListener('input',recalcFromTotal);

// Ajuste de moeda pela corretora
el('corretoraAtivo').addEventListener('change',()=>{
  const opt=el('corretoraAtivo').options[el('corretoraAtivo').selectedIndex];
  if(opt?.dataset?.currency) el('moedaAtivo').value=opt.dataset.currency;
});

el('btnSalvarAtivo').addEventListener('click',salvarAtivo);
el('btnCancelarEdicao').addEventListener('click',limparFormAtivo);

// Auto-preencher dados ao informar ticker já cadastrado
el('tickerAtivo').addEventListener('blur', ()=>{
  if(editandoId) return; // não interferir em edição
  const ticker = el('tickerAtivo').value.trim().toUpperCase();
  if(!ticker) return;
  const existente = ativos.find(a=>a.ticker.toUpperCase()===ticker);
  if(!existente) return;
  // Preencher nome e tipo se ainda estiverem vazios
  if(!el('nomeAtivo').value) el('nomeAtivo').value = existente.nome||'';
  if(!el('tipoAtivo').value) el('tipoAtivo').value = existente.tipo||'';
  if(!el('moedaAtivo').value || el('moedaAtivo').value==='BRL') el('moedaAtivo').value = existente.moeda||'BRL';
  // Selecionar corretora usada anteriormente
  if(!el('corretoraAtivo').value && existente.corretora_id){
    el('corretoraAtivo').value = existente.corretora_id;
  }
  msg('mensagemAtivo',`Ativo ${ticker} já cadastrado — dados preenchidos automaticamente.`,'info');
});

// Dividendos — preencher quantidade automaticamente
el('divAtivo').addEventListener('change',()=>{
  const opt=el('divAtivo').options[el('divAtivo').selectedIndex];
  if(opt?.dataset?.qty) el('divQtdCotas').value=opt.dataset.qty;
  // Sugerir moeda baseada no ativo selecionado
  const ativo = ativos.find(a=>a.id===el('divAtivo').value);
  if(ativo && el('divMoeda')) el('divMoeda').value = ativo.moeda||'BRL';
  atualizarConversaoDiv();
});
el('divValorCota').addEventListener('input',()=>{
  const v=toNumber(el('divValorCota').value);
  const q=toNumber(el('divQtdCotas').value);
  if(v&&q) el('divValorTotal').value=(v*q).toFixed(6);
  atualizarConversaoDiv();
});
el('divValorTotal').addEventListener('input', atualizarConversaoDiv);
if(el('divMoeda')) el('divMoeda').addEventListener('change', atualizarConversaoDiv);

function atualizarConversaoDiv(){
  const moeda   = el('divMoeda')?.value || 'BRL';
  const total   = toNumber(el('divValorTotal').value);
  const label   = el('labelDivTotal');
  const preview = el('divConversao');
  if(!label || !preview) return;

  if(moeda === 'USD'){
    label.textContent = 'Valor total recebido (USD)';
    if(total > 0){
      const brl = total * dolarAtual;
      preview.style.display = 'block';
      preview.textContent = `≈ ${formatCurrency(brl,'BRL')} (USD/BRL: ${dolarAtual.toFixed(4)})`;
    } else {
      preview.style.display = 'none';
    }
  } else {
    label.textContent = 'Valor total recebido (BRL)';
    preview.style.display = 'none';
  }
}
el('btnSalvarDiv').addEventListener('click',salvarDividendo);

// Filtro ano dividendos
const anoAtual=new Date().getFullYear();
const selAno=el('filtroAnoDiv');
if(selAno){
  for(let y=anoAtual;y>=anoAtual-5;y--){
    selAno.innerHTML+=`<option value="${y}">${y}</option>`;
  }
  selAno.addEventListener('change',carregarDividendos);
}

// Balancear
el('btnSalvarPesos').addEventListener('click',salvarPesos);
el('btnCalcularBal').addEventListener('click',calcularBalanceamento);
el('btnGerarAnalise').addEventListener('click', gerarAnaliseComite);

el('dataAtivo').value=hojeISO();
el('divData').value=hojeISO();


// ─────────────────────────────────────────────
// COTAÇÃO MANUAL
// ─────────────────────────────────────────────
registrarAcao('abrirCotacaoManual', (el) => {
  const id     = el.dataset.cotManual;
  const ticker = el.dataset.ticker;
  const atual  = ativos.find(a => a.id == id)?.cotacao_atual || '';
  const val    = prompt(`Informe a cotação manual para ${ticker}:`, atual);
  if (val === null) return; // cancelado
  const nova = toNumber(val);
  if (nova <= 0) { alert('Cotação inválida.'); return; }
  const agora = new Date().toISOString();
  supabase.from('investments')
    .update({ cotacao_atual: nova, atualizado_em: agora })
    .eq('id', id)
    .eq('user_id', user.id)
    .then(({ error }) => {
      if (error) { alert('Erro ao salvar cotação.'); return; }
      const a = ativos.find(a => a.id == id);
      if (a) { a.cotacao_atual = nova; a.atualizado_em = agora; }
      renderizarTudo();
      msg('mensagemCotacao', `Cotação de ${ticker} atualizada manualmente: ${nova}`, 'success');
    });
});

// ─────────────────────────────────────────────
// DIÁRIO DE TESE (painel lateral simplificado)
// ─────────────────────────────────────────────
registrarAcao('abrirDiarioTese', async (el) => {
  const id     = el.dataset.tese;
  const ticker = el.dataset.ticker;
  // Busca tese existente
  const { data: tese } = await supabase
    .from('investments')
    .select('tese_entrada, gatilho_saida, convicao, notas')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  // Cria modal inline
  let modal = document.getElementById('modalTese');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalTese';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;
      padding:16px;
    `;
    document.body.appendChild(modal);
  }

  const d = tese || {};
  modal.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;
      padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="margin:0;font-size:16px;">📓 Diário de Tese — ${ticker}</h2>
        <button onclick="document.getElementById('modalTese').remove()"
          style="background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">TESE DE ENTRADA</label>
          <textarea id="teseTese" rows="3" style="width:100%;background:var(--surface-2);border:1px solid var(--border);
            border-radius:8px;padding:10px;color:var(--text);font-family:inherit;font-size:13px;resize:vertical"
            placeholder="Por que comprou este ativo?">${d.tese_entrada||''}</textarea>
        </div>
        <div>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">GATILHO DE SAÍDA</label>
          <textarea id="teseGatilho" rows="2" style="width:100%;background:var(--surface-2);border:1px solid var(--border);
            border-radius:8px;padding:10px;color:var(--text);font-family:inherit;font-size:13px;resize:vertical"
            placeholder="Quando venderia este ativo?">${d.gatilho_saida||''}</textarea>
        </div>
        <div>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">CONVICÇÃO</label>
          <select id="teseConvicao" style="width:100%;background:var(--surface-2);border:1px solid var(--border);
            border-radius:8px;padding:10px;color:var(--text);font-size:13px">
            <option value="">— Selecione —</option>
            <option value="alta" ${d.convicao==='alta'?'selected':''}>🟢 Alta</option>
            <option value="media" ${d.convicao==='media'?'selected':''}>🟡 Média</option>
            <option value="baixa" ${d.convicao==='baixa'?'selected':''}>🔴 Baixa</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600">NOTAS</label>
          <textarea id="teseNotas" rows="3" style="width:100%;background:var(--surface-2);border:1px solid var(--border);
            border-radius:8px;padding:10px;color:var(--text);font-family:inherit;font-size:13px;resize:vertical"
            placeholder="Observações adicionais...">${d.notas||''}</textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          <button onclick="document.getElementById('modalTese').remove()"
            class="btn btn-secondary">Cancelar</button>
          <button data-action="salvarTese" data-tese="${id}" data-ticker="${ticker}"
            class="btn btn-primary">💾 Salvar</button>
        </div>
      </div>
    </div>
  `;
});

registrarAcao('salvarTese', async (el) => {
  const id     = el.dataset.tese;
  const ticker = el.dataset.ticker;
  const tese     = document.getElementById('teseTese')?.value || '';
  const gatilho  = document.getElementById('teseGatilho')?.value || '';
  const convicao = document.getElementById('teseConvicao')?.value || '';
  const notas    = document.getElementById('teseNotas')?.value || '';

  const { error } = await supabase
    .from('investments')
    .update({ tese_entrada: tese, gatilho_saida: gatilho, convicao, notas })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) { alert('Erro ao salvar tese.'); return; }
  document.getElementById('modalTese')?.remove();
  msg('mensagemCotacao', `Tese de ${ticker} salva com sucesso.`, 'success');
});

// ─────────────────────────────────────────────
// FICHA FUNDAMENTALISTA
// ─────────────────────────────────────────────
registrarAcao('abrirFicha', async (el) => {
  const ticker = el.dataset.ticker?.toUpperCase();

  let modal = document.getElementById('modalFicha');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalFicha';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);
  }

  const fechar = `<button onclick="document.getElementById('modalFicha').remove()" style="background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer;flex-shrink:0">×</button>`;
  const wrap   = (html) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">${html}</div>`;
  const header = (sub='') => `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px"><div><h2 style="margin:0;font-size:18px;font-weight:800">📊 ${ticker}</h2>${sub}</div>${fechar}</div>`;

  modal.innerHTML = wrap(header() + '<p class="muted" style="font-size:13px">Carregando...</p>');

  try {
    const res   = await fetch(`/api/quotes?tickers=${ticker}&fundamental=true`);
    const dados = await res.json();
    const preco = dados[ticker];
    const f     = dados[`${ticker}_fund`] || {};

    function kv(label, value) {
      return `<div style="background:var(--surface-2);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:2px">${label}</div>
        <div style="font-size:14px;font-weight:700">${value ?? '<span class="muted">—</span>'}</div>
      </div>`;
    }
    function pct(v)  { return v != null ? Number(v).toFixed(2) + '%'  : null; }
    function mult(v) { return v != null ? Number(v).toFixed(2) + 'x'  : null; }
    function brl(v)  { return v != null ? formatCurrency(Number(v), 'BRL') : null; }
    function cap(v)  {
      if (!v) return null;
      if (v >= 1e12) return 'R$ ' + (v/1e12).toFixed(2) + 'T';
      if (v >= 1e9)  return 'R$ ' + (v/1e9).toFixed(2) + 'B';
      return 'R$ ' + (v/1e6).toFixed(1) + 'M';
    }

    const varPct    = f.varPct ?? 0;
    const varClass  = varPct >= 0 ? 'positive' : 'negative';
    const varSinal  = varPct >= 0 ? '+' : '';
    const nomeSub   = f.nome ? `<p style="margin:2px 0;font-size:12px;color:var(--muted)">${f.nome}</p>` : '';
    const setorSub  = f.setor ? `<p style="margin:0;font-size:11px;color:var(--muted)">${f.setor}</p>` : '';

    modal.innerHTML = wrap(`
      ${header(nomeSub + setorSub)}
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <span style="font-size:22px;font-weight:800">${brl(preco) ?? '—'}</span>
        <span class="${varClass}" style="font-size:14px;font-weight:700">${varSinal}${pct(f.varPct) ?? '—'}</span>
      </div>

      <p style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.08em;margin:0 0 10px">AVALIAÇÃO</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
        ${kv('P/L',          mult(f.pl))}
        ${kv('P/VP',         mult(f.pvp))}
        ${kv('DY',           pct(f.dy))}
        ${kv('ROE',          pct(f.roe))}
        ${kv('LPA',          brl(f.lpa))}
        ${kv('VPA',          brl(f.vpa))}
        ${kv('Marg. Líq.',   pct(f.margemLiquida))}
      </div>

      <p style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.08em;margin:0 0 10px">MERCADO</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
        ${kv('Cap. Mercado', cap(f.marketCap))}
        ${kv('Vol. Médio 3M', f.volumeMedio ? (f.volumeMedio/1e6).toFixed(1)+'M' : null)}
        ${kv('Máx 52 sem.',  brl(f.maxAnual))}
        ${kv('Mín 52 sem.',  brl(f.minAnual))}
      </div>

      <div style="text-align:center">
        <button onclick="document.getElementById('modalFicha').remove()" class="btn btn-secondary">Fechar</button>
      </div>
    `);
  } catch(e) {
    modal.innerHTML = wrap(header() + `<p class="muted" style="font-size:13px">Erro ao carregar dados: ${e.message}</p>`);
  }
});

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────
await carregarDolar();
await carregarCorretoras();
await carregarAtivos();
await carregarPesos();
renderizarTudo();
await carregarTotalDividendos();
await renderizarTabelaRentabilidade();
await atualizarCotacoes(true);
