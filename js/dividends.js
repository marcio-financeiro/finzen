import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const totalMes = document.getElementById('totalMes');
const totalAno = document.getElementById('totalAno');
const dividendosMes = document.getElementById('dividendosMes');
const jcpMes = document.getElementById('jcpMes');
const fiiMes = document.getElementById('fiiMes');
const impostoAno = document.getElementById('impostoAno');

const anoFiltro = document.getElementById('anoFiltro');
const tipoFiltro = document.getElementById('tipoFiltro');
const ativoFiltro = document.getElementById('ativoFiltro');
const btnFiltrar = document.getElementById('btnFiltrar');

const mensagemDividendos = document.getElementById('mensagemDividendos');
const listaDividendos = document.getElementById('listaDividendos');

let user = null;
let ativos = [];

function mostrarMensagem(texto, tipo = 'info'){
  mensagemDividendos.className = `message ${tipo}`;
  mensagemDividendos.innerText = texto;
}

function anoAtual(){
  return new Date().getFullYear();
}

function mesAtualISO(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function tipoLabel(tipo){
  if(tipo === 'dividendo') return 'Dividendo';
  if(tipo === 'jcp') return 'JCP';
  if(tipo === 'rendimento_fii') return 'Rendimento FII';
  return tipo || '-';
}

function classeTipo(tipo){
  if(tipo === 'dividendo') return 'success';
  if(tipo === 'jcp') return 'info';
  if(tipo === 'rendimento_fii') return 'success';
  return 'neutral';
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html'); throw new Error('unauthenticated');
}

user = data.session.user;
anoFiltro.value = anoAtual();

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnFiltrar.addEventListener('click', carregarDividendos);

async function iniciar(){
  mostrarMensagem('Carregando proventos...');
  await carregarAtivos();
  await carregarDividendos();
  mostrarMensagem('');
}

async function carregarAtivos(){
  const { data, error } = await supabase
    .from('investments')
    .select('id,ticker,nome')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .order('ticker', { ascending:true });

  if(error){
    mostrarMensagem('Erro ao carregar ativos: ' + error.message, 'danger');
    return;
  }

  ativos = data || [];

  ativoFiltro.innerHTML = `
    <option value="">Todos os ativos</option>
    ${ativos.map(ativo => `
      <option value="${ativo.id}">
        ${ativo.ticker} ${ativo.nome ? '- ' + ativo.nome : ''}
      </option>
    `).join('')}
  `;
}

async function carregarDividendos(){
  const ano = Number(anoFiltro.value || anoAtual());
  const inicioAno = `${ano}-01-01`;
  const fimAno = `${ano}-12-31`;

  let query = supabase
    .from('dividends')
    .select(`
      id,
      tipo,
      ticker,
      valor_total,
      valor_por_cota,
      quantidade_cotas,
      data_pagamento,
      observacao,
      investment_id
    `)
    .eq('user_id', user.id)
    .gte('data_pagamento', inicioAno)
    .lte('data_pagamento', fimAno)
    .order('data_pagamento', { ascending:false });

  if(tipoFiltro.value){
    query = query.eq('tipo', tipoFiltro.value);
  }

  if(ativoFiltro.value){
    query = query.eq('investment_id', ativoFiltro.value);
  }

  const { data, error } = await query;

  if(error){
    listaDividendos.innerHTML = '<p class="muted">Erro ao carregar proventos.</p>';
    mostrarMensagem('Erro ao listar: ' + error.message, 'danger');
    return;
  }

  const proventos = data || [];

  renderizarResumo(proventos);
  renderizarPizza(proventos);
  renderizarTabela(proventos);
}

function renderizarResumo(proventos){
  const mesAtual = mesAtualISO();

  const totalAnoValor = proventos.reduce((soma, item) => {
    return soma + Number(item.valor_total || 0);
  }, 0);

  const totalMesValor = proventos
    .filter(item => item.data_pagamento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_total || 0), 0);

  const dividendosMesValor = proventos
    .filter(item => item.tipo === 'dividendo' && item.data_pagamento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_total || 0), 0);

  const jcpMesValor = proventos
    .filter(item => item.tipo === 'jcp' && item.data_pagamento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_total || 0), 0);

  const fiiMesValor = proventos
    .filter(item => item.tipo === 'rendimento_fii' && item.data_pagamento?.startsWith(mesAtual))
    .reduce((soma, item) => soma + Number(item.valor_total || 0), 0);

  totalMes.innerText = formatCurrency(totalMesValor, 'BRL');
  totalAno.innerText = formatCurrency(totalAnoValor, 'BRL');
  dividendosMes.innerText = formatCurrency(dividendosMesValor, 'BRL');
  jcpMes.innerText = formatCurrency(jcpMesValor, 'BRL');
  fiiMes.innerText = formatCurrency(fiiMesValor, 'BRL');
  impostoAno.innerText = formatCurrency(0, 'BRL');
}

function renderizarTabela(proventos){
  if(!proventos.length){
    listaDividendos.innerHTML = '<p class="muted">Nenhum provento encontrado.</p>';
    return;
  }

  listaDividendos.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Ativo</th>
          <th>Tipo</th>
          <th>Valor Total</th>
          <th>Observação</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${proventos.map(item => {
          const total = Number(item.valor_total || 0);

          return `
            <tr>
              <td>${formatarData(item.data_pagamento)}</td>
              <td><strong>${item.ticker || '-'}</strong></td>
              <td><span class="badge ${classeTipo(item.tipo)}">${tipoLabel(item.tipo)}</span></td>
              <td class="money positive">${formatCurrency(total, 'BRL')}</td>
              <td>${item.observacao || '-'}</td>
              <td><button class="btn compact" onclick="window.excluirProvento('${item.id}')" style="padding:4px 8px;font-size:12px;color:var(--danger);background:transparent;border:1px solid var(--danger);margin:0" title="Excluir">🗑️</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ── Distribuição por ativo (donut SVG) ───────────────
const CORES_PIZZA = ['#f59e0b','#22c55e','#6366f1','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#8b5cf6','#94a3b8'];

function renderizarPizza(proventos) {
  const container = document.getElementById('pizzaProventos');
  if (!container) return;

  if (!proventos.length) {
    container.innerHTML = '<p class="muted" style="font-size:13px">Nenhum provento no período.</p>';
    return;
  }

  const grupos = {};
  proventos.forEach(item => {
    const ticker = item.ticker || 'Desconhecido';
    const valor = Number(item.valor_total || 0);
    if (!grupos[ticker]) grupos[ticker] = { ticker, total: 0 };
    grupos[ticker].total += valor;
  });

  const ordenados = Object.values(grupos).sort((a, b) => b.total - a.total);
  const top8 = ordenados.slice(0, 8);
  const resto = ordenados.slice(8);

  const items = [...top8];
  if (resto.length) {
    const totalOutros = resto.reduce((s, i) => s + i.total, 0);
    items.push({ ticker: 'Outros', total: totalOutros });
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  if (!total) {
    container.innerHTML = '<p class="muted" style="font-size:13px">Nenhum provento no período.</p>';
    return;
  }

  const R = 55, cx = 65, cy = 65, stroke = 20, circ = 2 * Math.PI * R;
  let offset = 0;
  const segs = items.map((item, i) => {
    item._cor = item.ticker === 'Outros' ? CORES_PIZZA[9] : CORES_PIZZA[i];
    const dash = (item.total / total) * circ;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${item._cor}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    return seg;
  });

  container.innerHTML = `
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <svg width="130" height="130" viewBox="0 0 130 130" style="flex-shrink:0">
        ${segs.join('')}
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--text)" font-size="10" font-weight="800">${formatCurrency(total, 'BRL')}</text>
      </svg>
      <div style="flex:1;min-width:120px">
        ${items.map(item => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px">
            <span style="width:10px;height:10px;border-radius:50%;background:${item._cor};flex-shrink:0"></span>
            <span style="flex:1">${item.ticker}</span>
            <span style="color:var(--muted);font-size:11px;font-weight:700">${(item.total / total * 100).toFixed(1)}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

window.excluirProvento = async function(id) {
  if(!confirm('Excluir este provento?\n\nIsso vai excluir o registro de dividendo, a movimentação correspondente e estornar o saldo da conta.')) return;

  // Buscar dividendo para obter transaction_id e demais dados
  const { data: div } = await supabase.from('dividends')
    .select('id, transaction_id, account_id, ticker, data_pagamento, tipo')
    .eq('id', id).eq('user_id', user.id).single();

  if (!div) { alert('Registro não encontrado.'); return; }

  let txId = div.transaction_id;

  // Para registros antigos sem transaction_id: busca pela descrição + data + conta
  if (!txId && div.account_id) {
    const { data: txs } = await supabase.from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('account_id', div.account_id)
      .eq('date', div.data_pagamento)
      .ilike('description', `Dividendo ${div.ticker}%`);
    if (txs && txs.length === 1) txId = txs[0].id;
  }

  // Estornar saldo e excluir a transação
  if (txId) {
    const { data: tx } = await supabase.from('transactions')
      .select('id, amount, account_id, status')
      .eq('id', txId).eq('user_id', user.id).single();

    if (tx && tx.status === 'pago' && tx.account_id) {
      const { data: acc } = await supabase.from('accounts')
        .select('saldo_atual').eq('id', tx.account_id).single();
      if (acc) {
        await supabase.from('accounts')
          .update({ saldo_atual: Number(acc.saldo_atual) - Number(tx.amount) })
          .eq('id', tx.account_id).eq('user_id', user.id);
      }
    }

    await supabase.from('transactions').delete().eq('id', txId).eq('user_id', user.id);
  }

  // Excluir o dividendo
  const { error } = await supabase.from('dividends').delete().eq('id', id).eq('user_id', user.id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }

  await carregarDividendos();
};

iniciar();
