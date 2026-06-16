import { confirmarExclusao } from './confirmModal.js';
import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';
import { DEFAULT_USD_BRL, formatPercent, formatUSD, getUsdBrlRate, saveUsdBrlRate, toNumber } from './services/financeService.js';

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }
const user = sessionData.session.user;
document.getElementById('userEmail').innerText = user.email;
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
  });
});

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────
function hojeISO(){ return new Date().toISOString().split('T')[0]; }
function fmtData(d){ if(!d) return '-'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; }
function fmtMoeda(v,m){ return m==='USD'?formatUSD(v):formatCurrency(v,'BRL'); }
function calcAplicado(a){ return toNumber(a.quantidade)*toNumber(a.preco_medio); }
function calcAtual(a){ return toNumber(a.quantidade)*toNumber(a.cotacao_atual||a.preco_medio); }
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
async function fetchCotacoes(tickersBR, tickersEUA, comDolar=true){
  try{
    const todos = [...new Set([...tickersBR, ...tickersEUA])];
    const params = new URLSearchParams();
    if(todos.length) params.set('tickers', todos.join(','));
    if(comDolar) params.set('dolar', 'true');

    const r = await fetch(`/api/quotes?${params}`);
    if(!r.ok) throw new Error('Erro no proxy de cotações');
    return await r.json();
  }catch(_){ return {}; }
}

async function fetchDolar(){
  try{
    const j = await fetch('/api/quotes?dolar=true').then(r=>r.json());
    return j['USD-BRL'] || dolarAtual;
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

    console.log('[FinZen] tickBR:', tickBR);
    console.log('[FinZen] tickEUA:', tickEUA);
    console.log('[FinZen] total ativos:', ativos.length);

    const cots = await fetchCotacoes(tickBR, tickEUA, true);
    console.log('[FinZen] cotações retornadas:', cots);

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
      console.log(`[FinZen] ${a.ticker} → cotação: ${nova}`);
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
    console.error('[FinZen] Erro cotações:', e);
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
  const aplicBRL  = ativos.reduce((s,a)=>s+calcBRL(a,calcAplicado(a)),0);
  const patrimBRL = ativos.reduce((s,a)=>s+calcBRL(a,calcAtual(a)),0);
  const resultado = patrimBRL-aplicBRL;
  const pct       = aplicBRL?resultado/aplicBRL*100:0;
  const usdTotal  = ativos.filter(a=>(a.moeda||'BRL')==='USD').reduce((s,a)=>s+calcAtual(a),0);

  el('kpiPatrimonio').innerText=formatCurrency(patrimBRL,'BRL');
  el('kpiAplicado').innerText=formatCurrency(aplicBRL,'BRL');
  el('kpiResultado').innerText=formatCurrency(resultado,'BRL');
  el('kpiResultado').className=resultado>=0?'positive':'negative';
  el('kpiResultadoPct').innerText=(resultado>=0?'+':'')+formatPercent(pct);
  el('kpiUsd').innerText=formatUSD(usdTotal);
  el('kpiUsdBrl').innerText=formatCurrency(usdTotal*dolarAtual,'BRL');
}

// ─────────────────────────────────────────────
// CARTEIRA (aba 1)
// ─────────────────────────────────────────────
function renderizarCarteira(){
  const filtro = el('filtroCorretora').value;
  const lista  = filtro ? ativos.filter(a=>a.corretora===filtro||
    corretoras.find(c=>c.id===a.corretora_id)?.nome===filtro) : ativos;

  const patrimTotal = lista.reduce((s,a)=>s+calcBRL(a,calcAtual(a)),0);

  // Agrupar por classe
  const classes={};
  lista.forEach(a=>{
    const k=classeKey(a.tipo);
    if(!classes[k]) classes[k]={ativos:[],total:0};
    classes[k].ativos.push(a);
    classes[k].total+=calcBRL(a,calcAtual(a));
  });

  if(!lista.length){ el('listaCarteira').innerHTML='<p class="muted">Nenhum ativo cadastrado.</p>'; return; }

  let html='';
  for(const [classe,grupo] of Object.entries(classes)){
    const pctReal = patrimTotal?grupo.total/patrimTotal*100:0;
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
        <th>P. Médio</th><th>Cotação</th>
        <th>Aplicado</th><th>Atual</th><th>Resultado</th>
        <th>% Classe</th><th>% Ideal</th><th>Comprar?</th><th>Ações</th>
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
        <td class="money">${fmtMoeda(toNumber(a.preco_medio),m)}</td>
        <td class="money">${fmtMoeda(toNumber(a.cotacao_atual||a.preco_medio),m)}
          ${a.atualizado_em?"<span style=\"font-size:9px;color:var(--success)\"> u2713auto</span>":""}
          <button class="btn compact" data-cot-manual="${a.id}" data-ticker="${a.ticker}" data-moeda="${m}" style="font-size:10px;padding:2px 6px;margin-left:4px;background:rgba(79,132,243,.12);border-color:rgba(79,132,243,.3)">u270fufe0f</button>
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
          <button class="btn btn-secondary compact" data-editar="${a.id}">Editar</button>
          <button class="btn btn-danger compact" data-excluir="${a.id}" data-ticker="${a.ticker}">Excluir</button>
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
          <button class="btn btn-secondary compact" data-editar="${a.id}">Editar</button>
          <button class="btn btn-danger compact" data-excluir="${a.id}" data-ticker="${a.ticker}">Excluir</button>
        </div>
      </div>`;
    });
    html+=`</div>`; // inv-mobile-list
    html+=`</div>`; // inv-class-body
  }

  el('listaCarteira').innerHTML=html;

  el('listaCarteira').querySelectorAll('[data-editar]').forEach(b=>b.addEventListener('click',()=>editarAtivo(b.dataset.editar)));
  el('listaCarteira').querySelectorAll('[data-excluir]').forEach(b=>b.addEventListener('click',()=>excluirAtivo(b.dataset.excluir,b.dataset.ticker)));
  el('listaCarteira').querySelectorAll('[data-cot-manual]').forEach(b=>b.addEventListener('click',()=>atualizarCotacaoManual(b.dataset.cotManual,b.dataset.ticker,b.dataset.moeda)));
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
  console.log('[FinZen] calcularBalanceamento chamado, pesos:', JSON.stringify(pesos));
  const aporte=toNumber(el('balValorAporte').value);
  if(!aporte){ msg('mensagemBal','Informe o valor do aporte.','warning'); return; }

  const patrimAtual=ativos.reduce((s,a)=>s+calcBRL(a,calcAtual(a)),0);
  const novoTotal  =patrimAtual+aporte;

  const sugestoes=[];

  // ─── Para cada classe com % ideal definido ───────────────────────────────
  TODAS_CLASSES.forEach(classe=>{
    const ck=`inv_peso_classe_${classe.replace(/\s/g,'_')}`;
    const cideal=toNumber((pesos[ck]||{}).ideal||0);
    if(!cideal) return; // classe sem % ideal → ignorar

    // Valor que a classe deveria ter no total pós-aporte
    const valorIdealClasse=novoTotal*(cideal/100);

    // Ativos pertencentes a esta classe
    const ativosClasse=ativos.filter(a=>classeKey(a.tipo)===classe);

    // ── Classe sem nenhum ativo cadastrado ──────────────────────────────────
    if(!ativosClasse.length){
      const valorAtualClasse=0;
      const diferencaClasse=valorIdealClasse-valorAtualClasse;
      if(diferencaClasse>0){
        sugestoes.push({
          ticker:'—', nome:`Cadastre um ativo em ${classe}`, tipo:classe,
          classe, pideal:cideal, pidealLabel:`${cideal}% da carteira`,
          valorIdeal:valorIdealClasse, valorAtual:0, diferenca:diferencaClasse,
          cotacao:'—', qtdSugerida:0, valorSugerido:diferencaClasse,
          moeda:'BRL', semAtivo:true,
        });
      }
      return;
    }

    // ── Classe com ativos ────────────────────────────────────────────────────
    // Valor atual total da classe
    const valorAtualClasse=ativosClasse.reduce((s,a)=>s+calcBRL(a,calcAtual(a)),0);
    const diferencaClasse=valorIdealClasse-valorAtualClasse;

    // Verificar se algum ativo tem % individual dentro da classe
    const ativosComPeso=ativosClasse.filter(a=>toNumber((pesos[`inv_peso_${a.ticker}`]||{}).ideal||0)>0);
    const somaPesosIndividuais=ativosComPeso.reduce((s,a)=>s+toNumber((pesos[`inv_peso_${a.ticker}`]||{}).ideal||0),0);

    ativosClasse.forEach(a=>{
      const pk=`inv_peso_${a.ticker}`;
      const pidealAtivo=toNumber((pesos[pk]||{}).ideal||0);

      // Fração deste ativo dentro da classe:
      // — Se tem peso individual → usa o peso individual / soma dos pesos da classe
      // — Se nenhum ativo tem peso → divide igualmente
      let fracaoAtivo;
      if(somaPesosIndividuais>0){
        fracaoAtivo = pidealAtivo>0 ? pidealAtivo/somaPesosIndividuais : 0;
      } else {
        fracaoAtivo = 1/ativosClasse.length;
      }

      // Se ativo sem peso individual quando outros têm → não alocar nele
      if(fracaoAtivo===0) return;

      // Valor ideal deste ativo = fração × valor ideal da classe
      const valorIdealAtivo=valorIdealClasse*fracaoAtivo;
      const valorAtualAtivo=calcBRL(a,calcAtual(a));
      const diferenca=valorIdealAtivo-valorAtualAtivo;

      const cotacao=toNumber(a.cotacao_atual||a.preco_medio);
      const moeda  =a.moeda||'BRL';
      const cotBRL =moeda==='USD'?cotacao*dolarAtual:cotacao;
      const qtdSugerida=cotBRL>0?Math.floor(diferenca/cotBRL):0;

      if(diferenca>0 && (qtdSugerida>0 || moeda==='BRL')){
        sugestoes.push({
          ticker:a.ticker, nome:a.nome||'', tipo:tipoLabel(a.tipo),
          classe,
          pideal:cideal,
          pidealLabel: pidealAtivo>0
            ? `${pidealAtivo}% na classe (${cideal}% carteira)`
            : `${(fracaoAtivo*100).toFixed(0)}% na classe (${cideal}% carteira)`,
          valorIdeal:valorIdealAtivo, valorAtual:valorAtualAtivo, diferenca,
          cotacao:fmtMoeda(cotacao,moeda), qtdSugerida,
          valorSugerido: moeda==='BRL' && cotBRL<=0 ? diferenca : qtdSugerida*cotBRL,
          moeda, semAtivo:false,
        });
      }
    });
  });

  sugestoes.sort((a,b)=>b.diferenca-a.diferenca);

  const totalSugerido=sugestoes.reduce((s,x)=>s+x.valorSugerido,0);
  const sobra=aporte-totalSugerido;

  if(!sugestoes.length){
    el('balResultado').innerHTML='<p class="muted" style="margin-top:16px">Nenhuma classe com % ideal definido. Defina os pesos acima e clique em "Salvar pesos".</p>';
    return;
  }

  el('balResultado').innerHTML=`
    <div class="bal-sugestao">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div><strong>Sugestão de aporte: ${formatCurrency(aporte,'BRL')}</strong></div>
        <div class="muted" style="font-size:12px;">Sobra: ${formatCurrency(Math.max(sobra,0),'BRL')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 90px 80px 100px;gap:8px;
        font-size:11px;font-weight:800;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--border);">
        <span>Ativo</span><span>Alocação ideal</span><span>Falta</span><span>Qtd</span><span>Valor</span>
      </div>
      ${sugestoes.map(s=>s.semAtivo?`
        <div class="bal-sugestao-item" style="display:grid;grid-template-columns:1fr 1fr 90px 80px 100px;gap:8px;
          opacity:.75;background:rgba(255,200,0,.04);border-radius:6px;padding:6px 0;margin-top:4px;">
          <span><strong>${s.tipo}</strong> <span class="muted" style="font-size:11px">⚠️ sem ativo</span></span>
          <span style="font-size:11px;color:var(--muted)">${s.pidealLabel}</span>
          <span class="positive">+${formatCurrency(s.diferenca,'BRL')}</span>
          <span class="muted">—</span>
          <span class="money">${formatCurrency(s.valorSugerido,'BRL')}</span>
        </div>
      `:`
        <div class="bal-sugestao-item" style="display:grid;grid-template-columns:1fr 1fr 90px 80px 100px;gap:8px;
          padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);">
          <span>
            <strong>${s.ticker}</strong>
            <span class="muted" style="font-size:11px;display:block;">${s.tipo}</span>
          </span>
          <span style="font-size:11px;color:var(--muted);line-height:1.4;">${s.pidealLabel}</span>
          <span class="positive" style="font-size:12px;">+${formatCurrency(s.diferenca,'BRL')}</span>
          <span><strong>${s.qtdSugerida}</strong> <span class="muted" style="font-size:10px">cotas</span></span>
          <span class="money positive">${formatCurrency(s.valorSugerido,'BRL')}</span>
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
function renderizarTudo(){
  renderizarKPIs();
  renderizarCarteira();
  renderIndicadores();
}

// ─────────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────────
el('btnAtualizar').addEventListener('click',()=>atualizarCotacoes(false));
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
el('btnSalvarPesos')?.addEventListener('click',salvarPesos);
el('btnCalcularBal')?.addEventListener('click',calcularBalanceamento);

el('dataAtivo').value=hojeISO();
el('divData').value=hojeISO();

// ─────────────────────────────────────────────
// ── Cotação manual ────────────────────────────────────
async function atualizarCotacaoManual(id, ticker, moeda) {
  const ativo = ativos.find(a => a.id === id);
  if(!ativo) return;

  const cotAtual = toNumber(ativo.cotacao_atual || ativo.preco_medio);
  const simbolo  = moeda === 'USD' ? 'US$ ' : 'R$ ';
  const nova = prompt(`💹 ${ticker} — Cotação atual: ${simbolo}${cotAtual.toLocaleString('pt-BR',{minimumFractionDigits:2})}\n\nInforme a nova cotação:`);

  if(nova === null || nova.trim() === '') return;
  const novaNum = parseFloat(nova.replace(',','.'));
  if(isNaN(novaNum) || novaNum <= 0) { alert('Valor inválido.'); return; }

  const agora = new Date().toISOString();
  const { error } = await supabase.from('investments')
    .update({ cotacao_atual: novaNum, atualizado_em: agora })
    .eq('id', id).eq('user_id', user.id);

  if(error) { alert('Erro ao salvar: ' + error.message); return; }
  ativo.cotacao_atual = novaNum;
  ativo.atualizado_em = agora;
  msg('mensagemCotacao', `✏️ ${ticker} atualizado manualmente: ${simbolo}${novaNum.toLocaleString('pt-BR',{minimumFractionDigits:2})}`, 'success');
  renderizarTudo();
}

// ── Indicadores de rentabilidade da carteira ──────────
async function renderIndicadores() {
  const container = el('blocoIndicadores');
  if(!container) return;

  let cdiAnual = 0, ipcaAnual = 0;

  // CDI e IPCA via BrasilAPI
  try {
    const r = await fetch('https://brasilapi.com.br/api/taxas/v1');
    if(r.ok) {
      const taxas = await r.json();
      const cdi  = taxas.find(t => t.nome === 'CDI');
      const ipca = taxas.find(t => t.nome === 'IPCA');
      if(cdi?.valor)  cdiAnual  = cdi.valor;
      if(ipca?.valor) ipcaAnual = ipca.valor;
    }
  } catch(_) {}

  // Rentabilidade da carteira
  // Tudo convertido para BRL para comparação correta
  const totalAplicado = ativos.filter(a=>!isRF(a.tipo)).reduce((s,a)=>s+calcBRL(a,calcAplicado(a)),0);
  const totalAtual    = ativos.filter(a=>!isRF(a.tipo)).reduce((s,a)=>s+calcBRL(a,calcAtual(a)),0);
  const rentCarteira  = totalAplicado > 0 ? (totalAtual - totalAplicado) / totalAplicado * 100 : 0;
  const ganho         = totalAtual - totalAplicado;

  // Por classe
  const classes = {};
  ativos.filter(a=>!isRF(a.tipo)).forEach(a => {
    const c = a.tipo || 'Outros';
    if(!classes[c]) classes[c] = { aplic:0, atual:0 };
    classes[c].aplic += calcBRL(a, calcAplicado(a));
    classes[c].atual += calcBRL(a, calcAtual(a));
  });

  const cor    = v => v >= 0 ? '#22c55e' : '#ef4444';
  const fmtPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  function badge(carteira, indicador, label) {
    if(!indicador) return '';
    const diff = carteira - indicador;
    const c    = diff >= 0 ? '#22c55e' : '#ef4444';
    return `<div style="font-size:11px;color:${c};font-weight:700">${diff >= 0 ? '✅' : '⚠️'} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}% vs ${label}</div>`;
  }

  container.innerHTML = `
    <!-- Carteira principal -->
    <div style="background:linear-gradient(135deg,rgba(79,132,243,.12),rgba(34,197,94,.08));border:1px solid rgba(79,132,243,.25);border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px">📈 Sua Carteira (desde o início)</div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:34px;font-weight:900;color:${cor(rentCarteira)};line-height:1">${fmtPct(rentCarteira)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${ganho >= 0 ? '+' : ''}${formatCurrency(ganho,'BRL')} sobre ${formatCurrency(totalAplicado,'BRL')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;text-align:right">
          ${badge(rentCarteira, cdiAnual,  'CDI')}
          ${badge(rentCarteira, ipcaAnual, 'IPCA')}
        </div>
      </div>
    </div>

    <!-- Indicadores de mercado -->
    <div style="font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Indicadores de mercado</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;font-weight:700">💰 CDI a.a.</div>
        <div style="font-size:18px;font-weight:900;color:#f59e0b">${cdiAnual ? fmtPct(cdiAnual) : '--'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;font-weight:700">📊 IPCA a.a.</div>
        <div style="font-size:18px;font-weight:900;color:#8b5cf6">${ipcaAnual ? fmtPct(ipcaAnual) : '--'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
      </div>
    </div>

    <!-- Por classe -->
    <div style="font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Por classe de ativo</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${Object.entries(classes).sort((a,b)=>{
        const rA=a[1].aplic>0?(a[1].atual-a[1].aplic)/a[1].aplic*100:0;
        const rB=b[1].aplic>0?(b[1].atual-b[1].aplic)/b[1].aplic*100:0;
        return rB-rA;
      }).map(([classe,v])=>{
        const rent=v.aplic>0?(v.atual-v.aplic)/v.aplic*100:0;
        const pct=totalAtual>0?v.atual/totalAtual*100:0;
        return `
          <div style="padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">
              <span style="flex:1;font-size:13px;font-weight:700">${tipoLabel(classe)}</span>
              <span style="font-size:11px;color:var(--muted)">${pct.toFixed(1)}%</span>
              <span style="font-size:15px;font-weight:900;color:${cor(rent)}">${fmtPct(rent)}</span>
            </div>
            <div style="height:4px;background:var(--border);border-radius:99px;overflow:hidden">
              <div style="height:4px;width:${Math.min(Math.abs(rent)/Math.max(Math.abs(rentCarteira),1)*100,100).toFixed(0)}%;background:${cor(rent)};border-radius:99px"></div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// INICIALIZAÇÃO
// ─────────────────────────────────────────────
await carregarDolar();
await carregarCorretoras();
await carregarAtivos();
await carregarPesos();
renderizarTudo();
await atualizarCotacoes(true);
