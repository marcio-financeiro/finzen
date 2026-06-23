import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { getCotacoes } from './quoteCache.js';
import { getUsdBrlRate } from './services/financeService.js';

const userEmail = document.getElementById('userEmail');
const btnLogout = document.getElementById('btnLogout');

const patrimonioTotal = document.getElementById('patrimonioTotal');
const totalAlvo = document.getElementById('totalAlvo');
const classeDefasada = document.getElementById('classeDefasada');

const classeAlvo = document.getElementById('classeAlvo');
const percentualAlvo = document.getElementById('percentualAlvo');
const btnSalvarAlvo = document.getElementById('btnSalvarAlvo');
const btnCriarPadrao = document.getElementById('btnCriarPadrao');

const valorAporte = document.getElementById('valorAporte');
const btnCalcularAporte = document.getElementById('btnCalcularAporte');
const sugestaoAporte = document.getElementById('sugestaoAporte');

const tabelaAlocacao = document.getElementById('tabelaAlocacao');
const mensagemAlocacao = document.getElementById('mensagemAlocacao');

let user = null;
let investimentos = [];
let alvos = [];
let linhasAlocacao = [];
let dolarAtual = 1;
let cotacoes = {};

const classes = {
  acao:       'Ações BR',
  fii:        'FIIs',
  etf:        'ETFs BR',
  acao_eua:   'Ações EUA',
  etf_eua:    'ETFs EUA',
  renda_fixa: 'Renda Fixa',
  cripto:     'Cripto',
};

function tipoToClasse(tipo){
  if(tipo === 'acao_br' || tipo === 'acao') return 'acao';
  if(tipo === 'fii')                        return 'fii';
  if(tipo === 'etf_br' || tipo === 'etf')   return 'etf';
  if(tipo === 'acao_eua')                   return 'acao_eua';
  if(tipo === 'etf_eua')                    return 'etf_eua';
  if(tipo === 'renda_fixa')                 return 'renda_fixa';
  if(tipo === 'cripto')                     return 'cripto';
  return null;
}

function mostrarMensagem(texto, tipo = 'info'){
  mensagemAlocacao.className = `message ${tipo}`;
  mensagemAlocacao.innerText = texto;
}

function formatarPercentual(valor){
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }) + '%';
}

const { data } = await supabase.auth.getSession();

if(!data.session){
  navigate('../login.html'); throw new Error('unauthenticated');
}

user = data.session.user;

btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  navigate('../login.html');
});

btnSalvarAlvo.addEventListener('click', salvarAlvo);
btnCriarPadrao.addEventListener('click', criarPadrao);
btnCalcularAporte.addEventListener('click', calcularSugestaoAporte);

async function iniciar(){
  mostrarMensagem('Carregando alocação...');
  await Promise.all([carregarInvestimentos(), carregarAlvos()]);
  await carregarCotacoes();
  calcularAlocacao();
  mostrarMensagem('');
}

async function carregarCotacoes(){
  const tickers = investimentos.map(i => i.ticker).filter(Boolean);
  try {
    dolarAtual = (await getUsdBrlRate(user.id)) || 1;
  } catch(_) {}
  if(!tickers.length) return;
  try {
    cotacoes = await getCotacoes(tickers, false);
  } catch(_) {}
}

async function carregarInvestimentos(){
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', user.id)
    .eq('ativo', true);

  if(error){
    mostrarMensagem('Erro ao carregar investimentos: ' + error.message, 'danger');
    return;
  }

  investimentos = data || [];
}

async function carregarAlvos(){
  const { data, error } = await supabase
    .from('user_settings')
    .select('setting_key, setting_value')
    .eq('user_id', user.id)
    .like('setting_key', 'inv_peso_classe_%');

  if(error){
    mostrarMensagem('Erro ao carregar alvos: ' + error.message, 'danger');
    return;
  }

  // Mapeia setting_key → chave interna da classe
  const keyToClasse = {};
  Object.entries(classes).forEach(([key, nome]) => {
    keyToClasse[`inv_peso_classe_${nome.replace(/\s/g, '_')}`] = key;
  });

  alvos = [];
  (data || []).forEach(r => {
    const classe = keyToClasse[r.setting_key];
    if(!classe) return;
    const val = JSON.parse(r.setting_value || '{}');
    alvos.push({ classe, percentual_alvo: Number(val.ideal || 0) });
  });
}

async function salvarAlvo(){
  mostrarMensagem('Salvando alvo...');

  const classe = classeAlvo.value;
  const percentual = Number(percentualAlvo.value || 0);

  if(!classe || percentual <= 0){
    mostrarMensagem('Preencha classe e percentual alvo.', 'warning');
    return;
  }

  const nome = classes[classe];
  const settingKey = `inv_peso_classe_${nome.replace(/\s/g, '_')}`;

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      setting_key: settingKey,
      setting_value: JSON.stringify({ ideal: percentual }),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,setting_key' });

  if(error){
    mostrarMensagem('Erro ao salvar alvo: ' + error.message, 'danger');
    return;
  }

  classeAlvo.value = '';
  percentualAlvo.value = '';

  mostrarMensagem('Alvo salvo com sucesso.', 'success');

  await carregarAlvos();
  calcularAlocacao();
}

async function criarPadrao(){
  mostrarMensagem('Criando alocação padrão...');

  const padrao = [
    { classe:'acao',       percentual_alvo:30 },
    { classe:'fii',        percentual_alvo:25 },
    { classe:'acao_eua',   percentual_alvo:15 },
    { classe:'etf_eua',    percentual_alvo:10 },
    { classe:'etf',        percentual_alvo:10 },
    { classe:'renda_fixa', percentual_alvo:10 }
  ];

  for(const item of padrao){
    const nome = classes[item.classe];
    const settingKey = `inv_peso_classe_${nome.replace(/\s/g, '_')}`;
    await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        setting_key: settingKey,
        setting_value: JSON.stringify({ ideal: item.percentual_alvo }),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,setting_key' });
  }

  mostrarMensagem('Alocação padrão criada.', 'success');

  await carregarAlvos();
  calcularAlocacao();
}

function calcularAlocacao(){
  const patrimonioPorClasse = {};

  Object.keys(classes).forEach(classe => {
    patrimonioPorClasse[classe] = 0;
  });

  investimentos.forEach(item => {
    const classe = tipoToClasse(item.tipo);
    if(!classe) return;
    const quantidade = Number(item.quantidade || 0);
    const cotacao = Number(cotacoes[item.ticker] || item.cotacao_atual || item.preco_medio || 0);
    const valorBRL = (item.moeda || 'BRL') === 'USD'
      ? quantidade * cotacao * dolarAtual
      : quantidade * cotacao;
    patrimonioPorClasse[classe] = (patrimonioPorClasse[classe] || 0) + valorBRL;
  });

  const totalPatrimonio = Object.values(patrimonioPorClasse).reduce((soma, valor) => soma + valor, 0);
  const somaAlvos = alvos.reduce((soma, alvo) => soma + Number(alvo.percentual_alvo || 0), 0);

  linhasAlocacao = Object.keys(classes).map(classe => {
    const valorAtual = patrimonioPorClasse[classe] || 0;
    const percentualAtual = totalPatrimonio > 0 ? (valorAtual / totalPatrimonio) * 100 : 0;
    const alvo = alvos.find(item => item.classe === classe);
    const percentualIdeal = alvo ? Number(alvo.percentual_alvo || 0) : 0;
    const diferenca = percentualAtual - percentualIdeal;
    const valorIdeal = totalPatrimonio * (percentualIdeal / 100);
    const faltaValor = Math.max(valorIdeal - valorAtual, 0);

    return {
      classe,
      nome:classes[classe],
      valorAtual,
      percentualAtual,
      percentualIdeal,
      diferenca,
      valorIdeal,
      faltaValor
    };
  });

  patrimonioTotal.innerText = formatCurrency(totalPatrimonio, 'BRL');
  totalAlvo.innerText = formatarPercentual(somaAlvos);

  const maisDefasada = [...linhasAlocacao]
    .filter(item => item.percentualIdeal > 0)
    .sort((a,b) => a.diferenca - b.diferenca)[0];

  classeDefasada.innerText = maisDefasada
    ? maisDefasada.nome
    : '-';

  renderizarDonuts();
  renderizarTabela();
}

const CORES_CLASSES = {
  acao:       '#f59e0b',
  fii:        '#22c55e',
  etf:        '#6366f1',
  acao_eua:   '#f97316',
  etf_eua:    '#ec4899',
  renda_fixa: '#06b6d4',
  cripto:     '#ef4444',
};

function renderizarDonuts(){
  const container = document.getElementById('donutsAlocacao');
  if(!container) return;

  const itens = linhasAlocacao.filter(i => i.percentualAtual > 0 || i.percentualIdeal > 0);
  if(!itens.length){
    container.innerHTML = '<p class="muted" style="font-size:13px">Defina a alocação alvo para visualizar o gráfico.</p>';
    return;
  }

  const R = 55, cx = 65, cy = 65, sw = 20, circ = 2 * Math.PI * R;

  function buildDonut(valorKey, label){
    const total = itens.reduce((s, i) => s + i[valorKey], 0);
    if(!total){
      return `<div style="text-align:center">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${sw}"/>
          <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--muted)" font-size="10">0%</text>
        </svg>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${label}</div>
      </div>`;
    }
    let offset = 0;
    const segs = itens.filter(i => i[valorKey] > 0).map(i => {
      const cor = CORES_CLASSES[i.classe] || '#94a3b8';
      const dash = (i[valorKey] / total) * circ;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${cor}" stroke-width="${sw}"
        stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += dash;
      return seg;
    });
    return `<div style="text-align:center">
      <svg width="130" height="130" viewBox="0 0 130 130">
        ${segs.join('')}
        <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="800">${label}</text>
      </svg>
    </div>`;
  }

  const legenda = itens.map(i => {
    const cor = CORES_CLASSES[i.classe] || '#94a3b8';
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
      <span style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0"></span>
      <span style="flex:1">${i.nome}</span>
      <span style="color:var(--muted);font-size:11px;min-width:36px;text-align:right">${formatarPercentual(i.percentualAtual)}</span>
      <span style="color:var(--accent);font-size:11px;font-weight:700;min-width:36px;text-align:right">${formatarPercentual(i.percentualIdeal)}</span>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
      ${buildDonut('percentualAtual','Real')}
      ${buildDonut('percentualIdeal','Ideal')}
      <div style="flex:1;min-width:160px">
        <div style="display:flex;justify-content:flex-end;gap:16px;margin-bottom:8px;font-size:11px">
          <span style="color:var(--muted)">Real</span>
          <span style="color:var(--accent);font-weight:700">Ideal</span>
        </div>
        ${legenda}
      </div>
    </div>
  `;
}

function renderizarTabela(){
  if(!linhasAlocacao.length){
    tabelaAlocacao.innerHTML = '<p class="muted">Nenhum dado de alocação encontrado.</p>';
    return;
  }

  tabelaAlocacao.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Classe</th>
          <th>Valor Atual</th>
          <th>% Atual</th>
          <th>% Ideal</th>
          <th>Diferença</th>
          <th>Valor Ideal</th>
          <th>Falta</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${linhasAlocacao.map(item => {
          const status = item.diferenca >= 2
            ? { texto:'acima', classe:'danger' }
            : item.diferenca <= -2
              ? { texto:'abaixo', classe:'success' }
              : { texto:'ok', classe:'neutral' };

          return `
            <tr>
              <td>${item.nome}</td>
              <td class="money">${formatCurrency(item.valorAtual, 'BRL')}</td>
              <td>${formatarPercentual(item.percentualAtual)}</td>
              <td>${formatarPercentual(item.percentualIdeal)}</td>
              <td class="${item.diferenca < 0 ? 'positive' : 'negative'}">
                ${formatarPercentual(item.diferenca)}
              </td>
              <td class="money">${formatCurrency(item.valorIdeal, 'BRL')}</td>
              <td class="money">${formatCurrency(item.faltaValor, 'BRL')}</td>
              <td><span class="badge ${status.classe}">${status.texto}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function calcularSugestaoAporte(){
  const aporte = Number(valorAporte.value || 0);

  if(aporte <= 0){
    sugestaoAporte.innerHTML = '<p class="muted">Informe um valor de aporte.</p>';
    return;
  }

  const classesDefasadas = linhasAlocacao
    .filter(item => item.percentualIdeal > 0 && item.faltaValor > 0)
    .sort((a,b) => b.faltaValor - a.faltaValor);

  if(!classesDefasadas.length){
    sugestaoAporte.innerHTML = '<p class="muted">Carteira próxima da alocação alvo.</p>';
    return;
  }

  const totalFaltante = classesDefasadas.reduce((soma, item) => soma + item.faltaValor, 0);

  sugestaoAporte.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Classe</th>
          <th>Falta para o ideal</th>
          <th>Sugestão de aporte</th>
        </tr>
      </thead>
      <tbody>
        ${classesDefasadas.map(item => {
          const sugestao = totalFaltante > 0
            ? aporte * (item.faltaValor / totalFaltante)
            : 0;

          return `
            <tr>
              <td>${item.nome}</td>
              <td class="money">${formatCurrency(item.faltaValor, 'BRL')}</td>
              <td class="money positive">${formatCurrency(sugestao, 'BRL')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

iniciar();
