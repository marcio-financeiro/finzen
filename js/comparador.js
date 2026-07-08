/**
 * comparador.js
 * Comparador de investimentos com simulação de rendimento
 * Compara Poupança, CDB, LCI/LCA, Tesouro Direto, Ações, FIIs e produtos customizados
 */

import { supabase } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';
import { registrarAcao }  from './eventBus.js';
import { attachMoneyMask, readMoneyValue, setMoneyValue } from './moneyMask.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); throw new Error('unauthenticated'); }
const user = sd.session.user;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

const el  = id => document.getElementById(id);
attachMoneyMask(el('valorInicial'));
setMoneyValue(el('valorInicial'), 10000);
const fmt = v  => formatCurrency(v, 'BRL');
const fmtM = v => {
  if(v >= 1e6) return `R$ ${(v/1e6).toFixed(2)}M`;
  if(v >= 1e3) return `R$ ${(v/1e3).toFixed(1)}K`;
  return fmt(v);
};

// ── Estado ────────────────────────────────────────────
let anosSimulacao = 5;
let chartInstance = null;
let cdiAtual = 10.5; // fallback

// ── Produtos padrão ───────────────────────────────────
// taxa: função que recebe o CDI e retorna a taxa anual em decimal
const PRODUTOS_PADRAO = [
  {
    id: 'poupanca',
    nome: 'Poupança',
    cor: '#94a3b8',
    ativo: true,
    ir: false,
    iof: false,
    descricao: 'Isento de IR',
    taxaFn: (cdi) => {
      // Poupança = 70% da Selic quando Selic > 8.5%, senão 0.5%/mês + TR
      const selic = cdi * 1.02;
      return selic > 8.5 ? selic * 0.70 / 100 : 6.17 / 100;
    },
  },
  {
    id: 'cdb_100',
    nome: 'CDB 100% CDI',
    cor: '#f59e0b',
    ativo: true,
    ir: true,
    iof: false,
    descricao: 'IR regressivo',
    taxaFn: (cdi) => cdi / 100,
  },
  {
    id: 'cdb_110',
    nome: 'CDB 110% CDI',
    cor: '#6366f1',
    ativo: true,
    ir: true,
    iof: false,
    descricao: 'IR regressivo',
    taxaFn: (cdi) => cdi * 1.10 / 100,
  },
  {
    id: 'cdb_120',
    nome: 'CDB 120% CDI',
    cor: '#8b5cf6',
    ativo: false,
    ir: true,
    iof: false,
    descricao: 'IR regressivo',
    taxaFn: (cdi) => cdi * 1.20 / 100,
  },
  {
    id: 'lci_90',
    nome: 'LCI/LCA 90% CDI',
    cor: '#22c55e',
    ativo: true,
    ir: false,
    iof: false,
    descricao: 'Isento de IR',
    taxaFn: (cdi) => cdi * 0.90 / 100,
  },
  {
    id: 'lci_95',
    nome: 'LCI/LCA 95% CDI',
    cor: '#16a34a',
    ativo: false,
    ir: false,
    iof: false,
    descricao: 'Isento de IR',
    taxaFn: (cdi) => cdi * 0.95 / 100,
  },
  {
    id: 'tesouro_selic',
    nome: 'Tesouro Selic',
    cor: '#f59e0b',
    ativo: true,
    ir: true,
    iof: false,
    descricao: 'IR regressivo + taxa B3 0.2%',
    taxaFn: (cdi) => cdi / 100 - 0.002,
  },
  {
    id: 'tesouro_ipca',
    nome: 'Tesouro IPCA+ 5%',
    cor: '#ef4444',
    ativo: false,
    ir: true,
    iof: false,
    descricao: 'IPCA + 5% a.a. (IR regressivo)',
    taxaFn: (_cdi, ipca) => ipca / 100 + 0.05,
  },
  {
    id: 'acoes',
    nome: 'Ações (média histórica)',
    cor: '#f97316',
    ativo: false,
    ir: true,
    iof: false,
    descricao: 'IR 15% no lucro (estimativa 12% a.a.)',
    taxaFn: () => 0.12,
    irFixo: 0.15,
  },
  {
    id: 'fii',
    nome: 'FIIs (média histórica)',
    cor: '#06b6d4',
    ativo: false,
    ir: false,
    iof: false,
    descricao: 'Dividendos isentos (estimativa 10% a.a.)',
    taxaFn: () => 0.10,
  },
];

// Produtos customizados adicionados pelo usuário
let produtosCustom = [];

// ── Alíquota IR regressiva ────────────────────────────
function aliquotaIR(anos) {
  if(anos <= 0.5)  return 0.225;
  if(anos <= 1)    return 0.20;
  if(anos <= 2)    return 0.175;
  return 0.15;
}

// ── Calcular valor final de um produto ───────────────
function calcularProduto(produto, valorInicial, aporteMensal, anos, cdi, ipca) {
  const taxaAnual = produto.taxaFn(cdi, ipca);
  const taxaMensal = Math.pow(1 + taxaAnual, 1/12) - 1;
  const meses = anos * 12;

  // Simular mês a mês (para calcular IR correto com aportes)
  let saldo = valorInicial;
  const historico = [valorInicial];

  for(let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + taxaMensal) + aporteMensal;
    if(m % 12 === 0) historico.push(saldo);
  }

  const valorBruto = saldo;
  const totalAportado = valorInicial + aporteMensal * meses;
  const rendimentoBruto = Math.max(valorBruto - totalAportado, 0);

  // Imposto
  let imposto = 0;
  if(produto.ir) {
    const aliq = produto.irFixo || aliquotaIR(anos);
    imposto = rendimentoBruto * aliq;
  }

  const valorLiquido = valorBruto - imposto;
  const rendimentoLiquido = valorLiquido - totalAportado;

  // Valor real (descontado inflação)
  const fatorInflacao = Math.pow(1 + ipca/100, anos);
  const valorReal = valorLiquido / fatorInflacao;

  return {
    taxaAnual: taxaAnual * 100,
    valorBruto,
    imposto,
    valorLiquido,
    rendimentoLiquido,
    valorReal,
    historico, // por ano
    totalAportado,
  };
}

// ── Simular todos os produtos ─────────────────────────
function simular() {
  const valorInicial = readMoneyValue(el('valorInicial'));
  const aporteMensal = Number(el('aporteMensal').value || 0);
  const ipca         = Number(el('ipca').value || 4.5);

  if(valorInicial <= 0 && aporteMensal <= 0) return;

  const todosProdutos = [
    ...PRODUTOS_PADRAO.filter(p => p.ativo),
    ...produtosCustom,
  ];

  if(!todosProdutos.length) return;

  // Calcular resultados
  const resultados = todosProdutos.map(p => ({
    produto: p,
    resultado: calcularProduto(p, valorInicial, aporteMensal, anosSimulacao, cdiAtual, ipca),
  }));

  // Ordenar por valor líquido (melhor primeiro)
  resultados.sort((a,b) => b.resultado.valorLiquido - a.resultado.valorLiquido);
  const melhorId = resultados[0]?.produto.id;

  // Atualizar tabela
  el('tabelaResultados').innerHTML = resultados.map(({ produto, resultado }) => {
    const melhor = produto.id === melhorId;
    return `
      <tr class="${melhor ? 'melhor' : ''}">
        <td>
          <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${produto.cor};margin-right:6px"></span>
          <strong>${produto.nome}</strong>
          ${melhor ? '<span class="badge-melhor"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5"/></svg>Melhor</span>' : ''}
          <br><span style="font-size:11px;color:var(--muted)">${produto.descricao||''}</span>
        </td>
        <td style="font-weight:700">${resultado.taxaAnual.toFixed(2)}%</td>
        <td class="money">${fmtM(resultado.valorBruto)}</td>
        <td class="money negative">${resultado.imposto > 0 ? '-'+fmtM(resultado.imposto) : '—'}</td>
        <td class="money positive" style="font-weight:800">${fmtM(resultado.valorLiquido)}</td>
        <td class="money positive">${fmtM(resultado.rendimentoLiquido)}</td>
        <td class="money" style="color:#94a3b8">${fmtM(resultado.valorReal)}</td>
      </tr>
    `;
  }).join('');

  // Atualizar gráfico
  renderGrafico(resultados, anosSimulacao);
}

// Ponto de entrada via digitação nos campos (data-action-input="simular")
registrarAcao('simular', () => simular());

// ── Gráfico de evolução ───────────────────────────────
function renderGrafico(resultados, anos) {
  const labels = Array.from({ length: anos + 1 }, (_, i) => `Ano ${i}`);

  if(chartInstance) chartInstance.destroy();

  chartInstance = new Chart(el('chartComparador'), {
    type: 'line',
    data: {
      labels,
      datasets: resultados.map(({ produto, resultado }) => ({
        label: produto.nome,
        data: resultado.historico,
        borderColor: produto.cor,
        backgroundColor: 'transparent',
        borderWidth: produto.id === resultados[0]?.produto.id ? 3 : 1.5,
        pointRadius: 0,
        tension: .4,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 10 } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtM(ctx.raw)}` }
        }
      },
      scales: {
        y: {
          ticks: { color: '#94a3b8', callback: v => fmtM(v) },
          grid:  { color: 'rgba(255,255,255,.05)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid:  { color: 'rgba(255,255,255,.05)' }
        }
      }
    }
  });
}

// ── Selecionar período ────────────────────────────────
registrarAcao('selecionarPeriodo', (btn) => {
  document.querySelectorAll('.comp-periodo-btn').forEach(b => b.classList.remove('ativo'));
  btn.classList.add('ativo');
  anosSimulacao = parseInt(btn.dataset.anos);
  simular();
});

// ── Renderizar lista de produtos ──────────────────────
function renderProdutos() {
  const todos = [
    ...PRODUTOS_PADRAO,
    ...produtosCustom,
  ];

  el('listaProdutos').innerHTML = todos.map(p => `
    <div class="comp-produto">
      <input type="checkbox" id="chk_${p.id}" ${p.ativo ? 'checked' : ''}
        data-action-change="toggleProduto" data-produto-id="${p.id}">
      <span class="comp-produto-cor" style="background:${p.cor}"></span>
      <span class="comp-produto-nome">${p.nome}</span>
      <span class="comp-produto-taxa">${p.taxaAnual ? p.taxaAnual.toFixed(1)+'%' : ''}</span>
      ${p.custom ? `<button data-action="removerCustom" data-produto-id="${p.id}" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 4px">×</button>` : ''}
    </div>
  `).join('');
}

registrarAcao('toggleProduto', (el) => {
  const id = el.dataset.produtoId;
  const p = PRODUTOS_PADRAO.find(x => x.id === id) || produtosCustom.find(x => x.id === id);
  if(p) p.ativo = !p.ativo;
  simular();
});

// ── Produto customizado ───────────────────────────────
const CORES_EXTRA = ['#ec4899','#84cc16','#14b8a6','#a855f7','#fb923c'];

registrarAcao('adicionarCustom', () => {
  const nome = el('customNome').value.trim();
  const taxa  = parseFloat(el('customTaxa').value);
  if(!nome || isNaN(taxa) || taxa <= 0) return;

  const id  = 'custom_' + Date.now();
  const cor = CORES_EXTRA[produtosCustom.length % CORES_EXTRA.length];
  const taxaDecimal = taxa / 100;

  produtosCustom.push({
    id, nome, cor, ativo: true,
    ir: false, iof: false,
    descricao: `${taxa.toFixed(2)}% a.a. (sem IR)`,
    taxaAnual: taxa,
    taxaFn: () => taxaDecimal,
    custom: true,
  });

  el('customNome').value = '';
  el('customTaxa').value = '';
  renderProdutos();
  simular();
});

registrarAcao('removerCustom', (el) => {
  const id = el.dataset.produtoId;
  produtosCustom = produtosCustom.filter(p => p.id !== id);
  renderProdutos();
  simular();
});

// ── Buscar CDI atual (AwesomeAPI) ─────────────────────
async function buscarCDI() {
  try {
    // Tenta buscar taxa CDI da API do Banco Central
    const resp = await fetch('https://brasilapi.com.br/api/taxas/v1');
    if(resp.ok) {
      const taxas = await resp.json();
      const cdi = taxas.find(t => t.nome === 'CDI');
      if(cdi?.valor) {
        cdiAtual = cdi.valor;
        el('infoCDI').textContent = `CDI atual: ${cdi.valor.toFixed(2)}% a.a. (BrasilAPI)`;
        simular();
        return;
      }
    }
  } catch(_) {}
  // Fallback
  el('infoCDI').textContent = `CDI estimado: ${cdiAtual}% a.a. (ajuste se necessário)`;
}

// ── Inicializar ───────────────────────────────────────
renderProdutos();
await buscarCDI();
simular();
