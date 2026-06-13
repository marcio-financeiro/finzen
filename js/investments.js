import { supabase }        from './supabaseClient.js';
import { navigate }        from './router.js';
import { formatCurrency }  from './utils.js';
import { DEFAULT_USD_BRL, formatPercent, formatUSD, getUsdBrlRate, saveUsdBrlRate, toNumber } from './services/financeService.js';

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const el = id => document.getElementById(id);

const userEmail        = el('userEmail');
const btnLogout        = el('btnLogout');
const btnAtualizar     = el('btnAtualizar');
const btnSalvarDolar   = el('btnSalvarDolar');
const dolarReferencia  = el('dolarReferencia');
const ultimaAtualizacao= el('ultimaAtualizacao');
const mensagemCotacao  = el('mensagemCotacao');
const filtroCorretora  = el('filtroCorretora');
const listaInvestimentos = el('listaInvestimentos');

const kpiPatrimonio = el('kpiPatrimonio');
const kpiAplicado   = el('kpiAplicado');
const kpiResultado  = el('kpiResultado');
const kpiUsd        = el('kpiUsd');
const kpiUsdBrl     = el('kpiUsdBrl');

const tickerAtivo    = el('tickerAtivo');
const nomeAtivo      = el('nomeAtivo');
const tipoAtivo      = el('tipoAtivo');
const corretoraAtivo = el('corretoraAtivo');
const quantidadeAtivo= el('quantidadeAtivo');
const precoMedioAtivo= el('precoMedioAtivo');
const moedaAtivo     = el('moedaAtivo');
const cotacaoManual  = el('cotacaoManual');
const btnSalvarAtivo = el('btnSalvarAtivo');
const btnCancelarEdicao = el('btnCancelarEdicao');
const mensagemAtivo  = el('mensagemAtivo');
const formAtivoTitulo= el('formAtivoTitulo');

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
const { data: sessionData } = await supabase.auth.getSession();
if(!sessionData.session){ navigate('../login.html'); }
const user = sessionData.session.user;
userEmail.innerText = user.email;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

// ─────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────
let dolarAtual   = DEFAULT_USD_BRL;
let ativos       = [];
let editandoId   = null;

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────
function msgCotacao(texto, tipo = 'info'){
  mensagemCotacao.className = `message ${tipo}`;
  mensagemCotacao.innerText = texto;
}

function msgAtivo(texto, tipo = 'info'){
  mensagemAtivo.className = `message ${tipo}`;
  mensagemAtivo.innerText = texto;
}

function isBR(tipo){
  return ['acao_br','fii','etf_br'].includes(tipo);
}

function isEUA(tipo){
  return ['acao_eua','etf_eua'].includes(tipo);
}

function isRendaFixa(tipo){
  return tipo === 'renda_fixa';
}

function tipoLabel(tipo){
  const map = {
    acao_br:'Ação BR', fii:'FII', etf_br:'ETF BR',
    etf_eua:'ETF EUA', acao_eua:'Ação EUA', renda_fixa:'Renda Fixa',
    // legados
    acao:'Ação', etf:'ETF', cripto:'Cripto', exterior:'Exterior',
  };
  return map[tipo] || tipo || '-';
}

function fmtMoeda(valor, moeda){
  return moeda === 'USD' ? formatUSD(valor) : formatCurrency(valor, 'BRL');
}

function calcAplicado(a){
  return toNumber(a.quantidade) * toNumber(a.preco_medio);
}

function calcAtual(a){
  const preco = toNumber(a.cotacao_atual || a.preco_medio);
  return toNumber(a.quantidade) * preco;
}

function calcBRL(a, valor){
  return (a.moeda || 'BRL') === 'USD' ? valor * dolarAtual : valor;
}

// ─────────────────────────────────────────────
// BUSCA DE COTAÇÕES
// ─────────────────────────────────────────────

// Ações/FIIs/ETFs brasileiros via brapi.dev
async function fetchCotacaoBR(tickers){
  if(!tickers.length) return {};
  const symbols = tickers.join(',');
  try{
    const res = await fetch(`https://brapi.dev/api/quote/${symbols}?token=anonymous`);
    if(!res.ok) throw new Error('brapi indisponível');
    const json = await res.json();
    const result = {};
    (json.results || []).forEach(item => {
      if(item.symbol && item.regularMarketPrice){
        result[item.symbol.toUpperCase()] = toNumber(item.regularMarketPrice);
      }
    });
    return result;
  }catch(e){
    // Fallback: Yahoo Finance via proxy público
    try{
      const r2 = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${tickers[0]}.SA?interval=1d&range=1d`
      );
      const j2 = await r2.json();
      const price = j2?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if(price) return { [tickers[0].toUpperCase()]: toNumber(price) };
    }catch(_){}
    return {};
  }
}

// Ações/ETFs americanos via Yahoo Finance
async function fetchCotacaoEUA(tickers){
  if(!tickers.length) return {};
  const result = {};
  // Busca um por vez para evitar bloqueio de CORS em múltiplos
  for(const ticker of tickers){
    try{
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { mode:'cors' }
      );
      if(!res.ok) continue;
      const json = await res.json();
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if(price) result[ticker.toUpperCase()] = toNumber(price);
    }catch(_){}
  }
  return result;
}

// Dólar via AwesomeAPI → fallback BCB
async function fetchDolar(){
  try{
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if(!res.ok) throw new Error();
    const json = await res.json();
    const rate = toNumber(json?.USDBRL?.bid);
    if(rate > 0) return rate;
  }catch(_){}

  try{
    const res = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json');
    if(!res.ok) throw new Error();
    const json = await res.json();
    const rate = toNumber(json?.[0]?.valor?.replace(',','.'));
    if(rate > 0) return rate;
  }catch(_){}

  return dolarAtual; // mantém o que estava
}

async function atualizarCotacoes(silencioso = false){
  if(!silencioso){
    btnAtualizar.disabled = true;
    btnAtualizar.innerHTML = '<span class="inv-spinner"></span> Atualizando...';
    msgCotacao('Buscando cotações...', 'info');
  }

  try{
    // 1. Buscar dólar atualizado
    const novoDolar = await fetchDolar();
    if(novoDolar !== dolarAtual){
      dolarAtual = novoDolar;
      dolarReferencia.value = dolarAtual.toFixed(4);
      // salvar no banco silenciosamente
      try{ await saveUsdBrlRate(user.id, dolarAtual); }catch(_){}
    }

    // 2. Separar ativos por grupo
    const tickersBR  = ativos.filter(a => isBR(a.tipo) && !isRendaFixa(a.tipo)).map(a => a.ticker.toUpperCase());
    const tickersEUA = ativos.filter(a => isEUA(a.tipo)).map(a => a.ticker.toUpperCase());

    // 3. Buscar cotações
    const [cotsBR, cotsEUA] = await Promise.all([
      fetchCotacaoBR([...new Set(tickersBR)]),
      fetchCotacaoEUA([...new Set(tickersEUA)]),
    ]);

    const todasCotacoes = { ...cotsBR, ...cotsEUA };

    // 4. Atualizar banco e estado local
    let atualizados = 0;
    const agora = new Date().toISOString();

    for(const ativo of ativos){
      if(isRendaFixa(ativo.tipo)) continue;

      const ticker = ativo.ticker.toUpperCase();
      const novaCot = todasCotacoes[ticker];

      if(!novaCot) continue;

      // Só atualiza se mudou mais de 0.01%
      const atual = toNumber(ativo.cotacao_atual || 0);
      if(atual > 0 && Math.abs(novaCot - atual) / atual < 0.0001) continue;

      await supabase.from('investments')
        .update({ cotacao_atual: novaCot, atualizado_em: agora })
        .eq('id', ativo.id).eq('user_id', user.id);

      ativo.cotacao_atual = novaCot;
      ativo.atualizado_em = agora;
      atualizados++;
    }

    const agora_br = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    ultimaAtualizacao.innerText = `Atualizado às ${agora_br} · ${atualizados} ativo(s)`;

    if(!silencioso){
      msgCotacao(
        atualizados > 0
          ? `${atualizados} cotação(ões) atualizada(s). Dólar: R$ ${dolarAtual.toFixed(4)}`
          : `Cotações sem variação. Dólar: R$ ${dolarAtual.toFixed(4)}`,
        'success'
      );
    }

    renderizarTudo();
  }catch(e){
    if(!silencioso) msgCotacao('Erro ao buscar cotações: '+e.message, 'danger');
  }finally{
    btnAtualizar.disabled = false;
    btnAtualizar.innerHTML = '🔄 Atualizar cotações';
  }
}

// ─────────────────────────────────────────────
// CARREGAR DADOS
// ─────────────────────────────────────────────
async function carregarDolar(){
  try{
    dolarAtual = await getUsdBrlRate(user.id);
  }catch(_){
    dolarAtual = DEFAULT_USD_BRL;
  }
  dolarReferencia.value = dolarAtual;
}

async function carregarCorretoras(){
  const { data } = await supabase.from('accounts')
    .select('id,nome,bank,currency')
    .eq('user_id', user.id).eq('active', true)
    .eq('account_kind','broker')
    .order('nome', { ascending: true });

  const contas = data || [];

  // Filtro
  filtroCorretora.innerHTML = '<option value="">Todas as corretoras</option>' +
    contas.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');

  // Formulário
  corretoraAtivo.innerHTML = '<option value="">Selecione a corretora</option>' +
    contas.map(c =>
      `<option value="${c.nome}" data-currency="${c.currency||'BRL'}">${c.nome} (${c.currency||'BRL'})</option>`
    ).join('');
}

async function carregarAtivos(){
  const { data, error } = await supabase.from('investments')
    .select('*').eq('user_id', user.id).eq('ativo', true)
    .order('corretora', { ascending: true })
    .order('ticker',    { ascending: true });

  if(error) throw error;
  ativos = data || [];
}

// ─────────────────────────────────────────────
// RENDERIZAR
// ─────────────────────────────────────────────
function renderizarTudo(){
  renderizarKPIs();
  renderizarCarteira();
}

function renderizarKPIs(){
  const aplicadoBRL   = ativos.reduce((s,a) => s + calcBRL(a, calcAplicado(a)), 0);
  const patrimonioBRL = ativos.reduce((s,a) => s + calcBRL(a, calcAtual(a)), 0);
  const resultado     = patrimonioBRL - aplicadoBRL;

  const usdTotal = ativos
    .filter(a => (a.moeda||'BRL') === 'USD')
    .reduce((s,a) => s + calcAtual(a), 0);

  kpiPatrimonio.innerText = formatCurrency(patrimonioBRL, 'BRL');
  kpiAplicado.innerText   = formatCurrency(aplicadoBRL,   'BRL');
  kpiResultado.innerText  = formatCurrency(resultado,     'BRL');
  kpiResultado.className  = resultado >= 0 ? 'inv-result-positive' : 'inv-result-negative';
  kpiUsd.innerText        = formatUSD(usdTotal);
  kpiUsdBrl.innerText     = formatCurrency(usdTotal * dolarAtual, 'BRL');
}

function renderizarCarteira(){
  const filtro = filtroCorretora.value;
  const lista  = filtro ? ativos.filter(a => a.corretora === filtro) : ativos;

  if(!lista.length){
    listaInvestimentos.innerHTML = '<p class="muted" style="padding:18px">Nenhum ativo cadastrado.</p>';
    return;
  }

  // Agrupar por corretora
  const grupos = {};
  lista.forEach(a => {
    const c = a.corretora || 'Sem corretora';
    if(!grupos[c]) grupos[c] = [];
    grupos[c].push(a);
  });

  let html = '';

  for(const [corretora, itens] of Object.entries(grupos)){
    const totalCorretora = itens.reduce((s,a) => s + calcBRL(a, calcAtual(a)), 0);

    html += `
      <div class="inv-broker-title" style="padding:0 18px">
        🏦 ${corretora} — ${formatCurrency(totalCorretora,'BRL')}
      </div>
    `;

    // Desktop
    html += `
      <div class="inv-desktop">
        <table class="data-table">
          <thead><tr>
            <th>Ticker</th><th>Nome</th><th>Tipo</th>
            <th>Qtd</th><th>Preço médio</th><th>Cotação</th>
            <th>Aplicado</th><th>Atual</th><th>Resultado</th><th>Ações</th>
          </tr></thead>
          <tbody>
            ${itens.map(a => rowHtml(a)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Mobile
    html += `
      <div class="inv-mobile-list">
        ${itens.map(a => cardHtml(a)).join('')}
      </div>
    `;
  }

  listaInvestimentos.innerHTML = html;

  listaInvestimentos.querySelectorAll('[data-editar]').forEach(btn => {
    btn.addEventListener('click', () => editarAtivo(btn.dataset.editar));
  });
  listaInvestimentos.querySelectorAll('[data-excluir]').forEach(btn => {
    btn.addEventListener('click', () => excluirAtivo(btn.dataset.excluir, btn.dataset.ticker));
  });
}

function rowHtml(a){
  const moeda     = a.moeda || 'BRL';
  const aplicado  = calcAplicado(a);
  const atual     = calcAtual(a);
  const resultado = atual - aplicado;
  const pct       = aplicado ? (resultado / aplicado) * 100 : 0;
  const cotacao   = toNumber(a.cotacao_atual || a.preco_medio);
  const temCotAuto= !isRendaFixa(a.tipo) && a.atualizado_em;

  return `
    <tr>
      <td><strong>${a.ticker||'-'}</strong></td>
      <td>${a.nome||'-'}</td>
      <td>
        ${tipoLabel(a.tipo)}
        <span class="inv-quote-status ${temCotAuto?'auto':'manual'}">
          ${temCotAuto?'auto':'manual'}
        </span>
      </td>
      <td class="money">${toNumber(a.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:6})}</td>
      <td class="money">${fmtMoeda(toNumber(a.preco_medio), moeda)}</td>
      <td class="money">${fmtMoeda(cotacao, moeda)}</td>
      <td class="money">
        ${fmtMoeda(aplicado, moeda)}
        ${moeda==='USD'?`<br><span class="muted">${formatCurrency(calcBRL(a,aplicado),'BRL')}</span>`:''}
      </td>
      <td class="money">
        ${fmtMoeda(atual, moeda)}
        ${moeda==='USD'?`<br><span class="muted">${formatCurrency(calcBRL(a,atual),'BRL')}</span>`:''}
      </td>
      <td class="money ${resultado>=0?'positive':'negative'}">
        ${resultado>=0?'+':''}${fmtMoeda(resultado, moeda)}<br>
        <span style="font-size:11px">${resultado>=0?'+':''}${formatPercent(pct)}</span>
      </td>
      <td>
        <button type="button" class="btn btn-secondary compact" data-editar="${a.id}">Editar</button>
        <button type="button" class="btn btn-danger compact" data-excluir="${a.id}" data-ticker="${a.ticker}">Excluir</button>
      </td>
    </tr>
  `;
}

function cardHtml(a){
  const moeda     = a.moeda || 'BRL';
  const aplicado  = calcAplicado(a);
  const atual     = calcAtual(a);
  const resultado = atual - aplicado;
  const pct       = aplicado ? (resultado / aplicado) * 100 : 0;
  const cotacao   = toNumber(a.cotacao_atual || a.preco_medio);

  return `
    <article class="inv-mobile-card">
      <div class="inv-mobile-card-top">
        <div>
          <div class="inv-ticker">${a.ticker||'-'}</div>
          <div class="inv-nome">${a.nome||'-'} · ${tipoLabel(a.tipo)}</div>
        </div>
        <strong class="${resultado>=0?'positive':'negative'}">
          ${resultado>=0?'+':''}${formatPercent(pct)}
        </strong>
      </div>
      <div class="inv-mobile-grid">
        <div><span>Qtd</span><strong class="money">${toNumber(a.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:6})}</strong></div>
        <div><span>Cotação</span><strong class="money">${fmtMoeda(cotacao,moeda)}</strong></div>
        <div><span>Aplicado</span><strong class="money">${fmtMoeda(aplicado,moeda)}</strong></div>
        <div><span>Atual</span><strong class="money">${fmtMoeda(atual,moeda)}</strong></div>
        <div><span>Resultado</span>
          <strong class="money ${resultado>=0?'positive':'negative'}">
            ${resultado>=0?'+':''}${fmtMoeda(resultado,moeda)}
          </strong>
        </div>
        ${moeda==='USD'?`<div><span>Em BRL</span><strong class="money">${formatCurrency(calcBRL(a,atual),'BRL')}</strong></div>`:''}
      </div>
      <div class="inv-mobile-actions">
        <button type="button" class="btn btn-secondary compact" data-editar="${a.id}">Editar</button>
        <button type="button" class="btn btn-danger compact" data-excluir="${a.id}" data-ticker="${a.ticker}">Excluir</button>
      </div>
    </article>
  `;
}

// ─────────────────────────────────────────────
// SALVAR / EDITAR / EXCLUIR
// ─────────────────────────────────────────────
async function salvarAtivo(){
  const ticker    = tickerAtivo.value.trim().toUpperCase();
  const nome      = nomeAtivo.value.trim();
  const tipo      = tipoAtivo.value;
  const corretora = corretoraAtivo.value;
  const quantidade= toNumber(quantidadeAtivo.value);
  const precoMedio= toNumber(precoMedioAtivo.value);
  const moeda     = moedaAtivo.value || 'BRL';
  const cotManual = cotacaoManual.value ? toNumber(cotacaoManual.value) : null;

  if(!ticker || !tipo || !corretora || !quantidade || !precoMedio){
    msgAtivo('Preencha ticker, tipo, corretora, quantidade e preço médio.','warning');
    return;
  }

  msgAtivo('Salvando...','info');

  try{
    if(editandoId){
      // Edição direta
      const { error } = await supabase.from('investments').update({
        ticker, nome, tipo, corretora, quantidade, preco_medio: precoMedio,
        moeda, cotacao_atual: cotManual,
        atualizado_em: cotManual ? new Date().toISOString() : null,
      }).eq('id', editandoId).eq('user_id', user.id);

      if(error) throw error;
      msgAtivo('Ativo atualizado.','success');
    }else{
      // Verifica se já existe (mesmo ticker + corretora + moeda)
      const { data: existing } = await supabase.from('investments')
        .select('*').eq('user_id', user.id).eq('ativo', true)
        .eq('ticker', ticker).eq('corretora', corretora).eq('moeda', moeda)
        .maybeSingle();

      if(existing){
        // Consolidar pelo preço médio ponderado
        const novaQtd = toNumber(existing.quantidade) + quantidade;
        const novoPM  = ((toNumber(existing.quantidade) * toNumber(existing.preco_medio)) +
                         (quantidade * precoMedio)) / novaQtd;

        const { error } = await supabase.from('investments').update({
          nome: nome || existing.nome,
          tipo, quantidade: novaQtd, preco_medio: novoPM,
          cotacao_atual: cotManual ?? existing.cotacao_atual,
          atualizado_em: cotManual ? new Date().toISOString() : existing.atualizado_em,
        }).eq('id', existing.id).eq('user_id', user.id);

        if(error) throw error;
        msgAtivo('Posição consolidada com preço médio ponderado.','success');
      }else{
        const { error } = await supabase.from('investments').insert({
          user_id: user.id, ticker, nome, tipo, corretora,
          quantidade, preco_medio: precoMedio, moeda,
          cotacao_atual: cotManual,
          atualizado_em: cotManual ? new Date().toISOString() : null,
          exchange_rate: moeda === 'USD' ? dolarAtual : null,
          ativo: true,
        });

        if(error) throw error;
        msgAtivo('Ativo salvo com sucesso.','success');
      }
    }

    limparFormulario();
    await carregarAtivos();
    renderizarTudo();

    // Tenta buscar cotação do novo ativo automaticamente
    if(!cotManual && !isRendaFixa(tipo)){
      setTimeout(() => atualizarCotacoes(true), 800);
    }
  }catch(e){
    msgAtivo('Erro ao salvar: '+e.message,'danger');
  }
}

function editarAtivo(id){
  const a = ativos.find(x => x.id === id);
  if(!a) return;

  editandoId = id;
  tickerAtivo.value    = a.ticker || '';
  nomeAtivo.value      = a.nome || '';
  tipoAtivo.value      = a.tipo || '';
  corretoraAtivo.value = a.corretora || '';
  quantidadeAtivo.value= a.quantidade || '';
  precoMedioAtivo.value= a.preco_medio || '';
  moedaAtivo.value     = a.moeda || 'BRL';
  cotacaoManual.value  = a.cotacao_atual || '';

  formAtivoTitulo.innerText = `Editando: ${a.ticker}`;
  btnSalvarAtivo.innerText  = 'Salvar Alterações';
  btnCancelarEdicao.style.display = '';
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

async function excluirAtivo(id, ticker){
  const ok = confirm(`Excluir ${ticker} da carteira?`);
  if(!ok) return;

  const { error } = await supabase.from('investments')
    .update({ ativo: false }).eq('id', id).eq('user_id', user.id);

  if(error){ msgAtivo('Erro ao excluir: '+error.message,'danger'); return; }

  msgAtivo(`${ticker} removido da carteira.`,'success');
  await carregarAtivos();
  renderizarTudo();
}

function limparFormulario(){
  editandoId = null;
  tickerAtivo.value = '';
  nomeAtivo.value   = '';
  tipoAtivo.value   = '';
  corretoraAtivo.value = '';
  quantidadeAtivo.value = '';
  precoMedioAtivo.value = '';
  moedaAtivo.value  = 'BRL';
  cotacaoManual.value = '';
  formAtivoTitulo.innerText = 'Adicionar Ativo';
  btnSalvarAtivo.innerText  = 'Salvar Ativo';
  btnCancelarEdicao.style.display = 'none';
}

// ─────────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────────
btnAtualizar.addEventListener('click', () => atualizarCotacoes(false));

btnSalvarDolar.addEventListener('click', async () => {
  const val = toNumber(dolarReferencia.value);
  if(val <= 0){ msgCotacao('Informe uma cotação válida.','warning'); return; }
  try{
    await saveUsdBrlRate(user.id, val);
    dolarAtual = val;
    renderizarTudo();
    msgCotacao(`Dólar salvo: R$ ${val.toFixed(4)}`,'success');
  }catch(e){
    msgCotacao('Erro ao salvar dólar: '+e.message,'danger');
  }
});

btnSalvarAtivo.addEventListener('click', salvarAtivo);
btnCancelarEdicao.addEventListener('click', limparFormulario);
filtroCorretora.addEventListener('change', renderizarCarteira);

// Ajusta moeda automaticamente pela corretora
corretoraAtivo.addEventListener('change', () => {
  const opt = corretoraAtivo.options[corretoraAtivo.selectedIndex];
  const currency = opt?.dataset?.currency;
  if(currency) moedaAtivo.value = currency;
});

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────
await carregarDolar();
await carregarCorretoras();
await carregarAtivos();
renderizarTudo();

// Atualiza cotações automaticamente ao abrir
await atualizarCotacoes(true);
