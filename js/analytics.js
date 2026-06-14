/**
 * analytics.js
 * Página de Analytics — gráficos interativos com Chart.js
 * Lê dados reais do Supabase
 */

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;
document.getElementById('userEmail').innerText = user.email;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

const el  = id => document.getElementById(id);
const fmt = v  => formatCurrency(v, 'BRL');

// ── Instâncias dos gráficos ───────────────────────────
const charts = {};

// ── Paleta de cores ───────────────────────────────────
const CORES = [
  '#4b84f3','#22c55e','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#10b981','#e11d48','#6366f1',
  '#84cc16','#ec4899','#14b8a6','#fb923c','#a855f7'
];

function rgba(hex, a = 1) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Utilitários de data ───────────────────────────────
function ultimos6Meses() {
  const meses = [];
  const hoje  = new Date();
  for(let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return meses;
}

function nomeMes(anoMes) {
  const [a, m] = anoMes.split('-');
  return new Date(a, m-1, 1).toLocaleString('pt-BR', { month:'short', year:'2-digit' });
}

// ── Destruir gráfico antes de recriar ────────────────
function destroyChart(id) {
  if(charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ── Carregar dados e renderizar ───────────────────────
async function carregar() {
  el('loadingOverlay').style.display = 'flex';

  try {
    const meses   = ultimos6Meses();
    const inicio  = meses[0] + '-01';
    const hoje    = new Date();
    const fim     = hoje.toISOString().split('T')[0];
    const mes3Atras = (() => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth()-5, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    })();

    const [
      { data: txHistorico },
      { data: cardTx },
      { data: contas },
      { data: investimentos },
      { data: txPatrimonio },
    ] = await Promise.all([
      supabase.from('transactions')
        .select('type,amount,date,status,categories:category_id(nome,icon)')
        .eq('user_id', user.id)
        .gte('date', inicio).lte('date', fim)
        .eq('status','pago'),

      supabase.from('card_transactions')
        .select('valor_parcela,fatura_referencia,categories:category_id(nome,icon)')
        .eq('user_id', user.id)
        .in('fatura_referencia', meses),

      supabase.from('accounts')
        .select('saldo_atual,currency,nome')
        .eq('user_id', user.id).eq('active', true),

      supabase.from('investments')
        .select('tipo,quantidade,preco_medio,cotacao_atual')
        .eq('user_id', user.id)
        .eq('ativo', true),

      // Patrimônio: calcula dinamicamente por mês
      supabase.from('transactions')
        .select('type,amount,date,status')
        .eq('user_id', user.id)
        .gte('date', inicio).lte('date', fim)
        .eq('status','pago'),
    ]);

    const tx     = txHistorico || [];
    const cartao = cardTx     || [];

    // ── Dados por mês ─────────────────────────────────
    const porMes = {};
    meses.forEach(m => { porMes[m] = { receitas:0, despesas:0 }; });

    tx.forEach(t => {
      const m = t.date?.slice(0,7);
      if(!porMes[m]) return;
      if(t.type==='receita') porMes[m].receitas  += Number(t.amount||0);
      if(t.type==='despesa') porMes[m].despesas  += Number(t.amount||0);
    });
    cartao.forEach(t => {
      const m = t.fatura_referencia;
      if(!porMes[m]) return;
      porMes[m].despesas += Number(t.valor_parcela||0);
    });

    const labels    = meses.map(nomeMes);
    const receitas  = meses.map(m => porMes[m].receitas);
    const despesas  = meses.map(m => porMes[m].despesas);
    const poupanca  = meses.map(m => {
      const r = porMes[m].receitas;
      const d = porMes[m].despesas;
      return r > 0 ? ((r-d)/r*100) : 0;
    });

    // ── Dados por categoria (mês atual) ───────────────
    const mesAtual = meses[meses.length-1];
    const catGastos = {};

    tx.filter(t => t.date?.startsWith(mesAtual) && t.type==='despesa').forEach(t => {
      const cat = t.categories?.nome || 'Outros';
      catGastos[cat] = (catGastos[cat]||0) + Number(t.amount||0);
    });
    cartao.filter(t => t.fatura_referencia===mesAtual).forEach(t => {
      const cat = t.categories?.nome || 'Outros';
      catGastos[cat] = (catGastos[cat]||0) + Number(t.valor_parcela||0);
    });

    const catOrdenadas = Object.entries(catGastos).sort((a,b)=>b[1]-a[1]);

    // ── Dados de investimentos por classe ─────────────
    const invClasse = {};
    (investimentos||[]).forEach(i => {
      const classe    = i.tipo || 'Outros';
      const qtd       = Number(i.quantidade||0);
      const cotacao   = Number(i.cotacao_atual||i.preco_medio||0);
      const valorAtual = qtd * cotacao;
      invClasse[classe] = (invClasse[classe]||0) + valorAtual;
    });

    // ── Patrimônio histórico — calculado dinamicamente ──
    // Parte do saldo atual e subtrai/soma as transações mês a mês ao contrário
    const saldoAtualBRL = (contas||[])
      .filter(c => c.currency === 'BRL')
      .reduce((s,c) => s + Number(c.saldo_atual||0), 0);
    const totalInvestAtual = Object.values(invClasse).reduce((s,v)=>s+v,0);

    // Acumula fluxo por mês (receitas - despesas)
    const fluxoPorMes = {};
    meses.forEach(m => { fluxoPorMes[m] = 0; });
    (txPatrimonio||[]).forEach(t => {
      const m = t.date?.slice(0,7);
      if(!fluxoPorMes.hasOwnProperty(m)) return;
      if(t.type==='receita') fluxoPorMes[m] += Number(t.amount||0);
      if(t.type==='despesa') fluxoPorMes[m] -= Number(t.amount||0);
    });
    // Inclui cartão
    cartao.forEach(t => {
      const m = t.fatura_referencia;
      if(!fluxoPorMes.hasOwnProperty(m)) return;
      fluxoPorMes[m] -= Number(t.valor_parcela||0);
    });

    // Reconstrói patrimônio retroativamente a partir do saldo atual
    const patrimonioBase = saldoAtualBRL + totalInvestAtual;
    const patrimonioMeses = [...meses].reverse().reduce((acc, mes, i) => {
      if(i === 0) {
        acc[mes] = patrimonioBase;
      } else {
        const anterior = [...meses].reverse()[i-1];
        acc[mes] = acc[anterior] - fluxoPorMes[anterior];
      }
      return acc;
    }, {});

    const patrimHistorico = meses.map(m => ({
      mes_referencia: m,
      patrimonio_liquido: patrimonioMeses[m] || 0,
    }));

    // ── KPIs ──────────────────────────────────────────
    const totalReceitas = receitas.reduce((s,v)=>s+v,0);
    const totalDespesas = despesas.reduce((s,v)=>s+v,0);
    const saldoContas   = (contas||[]).filter(c=>c.currency==='BRL').reduce((s,c)=>s+Number(c.saldo_atual||0),0);
    const totalInvest   = Object.values(invClasse).reduce((s,v)=>s+v,0);
    const mediaPoupanca = poupanca.filter(v=>v>0).reduce((s,v,_,a)=>s+v/a.length,0);
    const maiorGasto    = catOrdenadas[0];

    el('kpiReceitas').textContent   = fmt(totalReceitas);
    el('kpiDespesas').textContent   = fmt(totalDespesas);
    el('kpiSaldo').textContent      = fmt(saldoContas);
    el('kpiInvest').textContent     = fmt(totalInvest);
    el('kpiPoupanca').textContent   = mediaPoupanca.toFixed(1) + '%';
    el('kpiMaiorGasto').textContent = maiorGasto ? `${maiorGasto[0]}: ${fmt(maiorGasto[1])}` : '-';

    // ── Gráfico 1: Receitas vs Despesas ───────────────
    destroyChart('chartRecDes');
    charts['chartRecDes'] = new Chart(el('chartRecDes'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Receitas',
            data: receitas,
            backgroundColor: rgba('#22c55e', .8),
            borderColor: '#22c55e',
            borderWidth: 1,
            borderRadius: 6,
          },
          {
            label: 'Despesas',
            data: despesas,
            backgroundColor: rgba('#ef4444', .8),
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 6,
          },
        ]
      },
      options: chartOptions('Receitas vs Despesas (6 meses)', true)
    });

    // ── Gráfico 2: Saldo mensal ───────────────────────
    const saldos = meses.map(m => porMes[m].receitas - porMes[m].despesas);
    destroyChart('chartSaldo');
    charts['chartSaldo'] = new Chart(el('chartSaldo'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo do mês',
          data: saldos,
          borderColor: '#4b84f3',
          backgroundColor: rgba('#4b84f3', .12),
          borderWidth: 2.5,
          pointBackgroundColor: saldos.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
          pointRadius: 5,
          tension: .35,
          fill: true,
        }]
      },
      options: chartOptions('Saldo Mensal (receitas − despesas)')
    });

    // ── Gráfico 3: Taxa de poupança ───────────────────
    destroyChart('chartPoupanca');
    charts['chartPoupanca'] = new Chart(el('chartPoupanca'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Taxa de poupança (%)',
          data: poupanca.map(v => Number(v.toFixed(1))),
          borderColor: '#8b5cf6',
          backgroundColor: rgba('#8b5cf6', .1),
          borderWidth: 2.5,
          pointRadius: 5,
          tension: .35,
          fill: true,
        }]
      },
      options: {
        ...chartOptions('Taxa de Poupança Mensal (%)'),
        scales: {
          y: {
            ticks: { color:'#94a3b8', callback: v => v+'%' },
            grid:  { color:'rgba(255,255,255,.06)' },
          },
          x: { ticks:{ color:'#94a3b8' }, grid:{ color:'rgba(255,255,255,.06)' } }
        }
      }
    });

    // ── Gráfico 4: Gastos por categoria (donut) ───────
    destroyChart('chartCategorias');
    charts['chartCategorias'] = new Chart(el('chartCategorias'), {
      type: 'doughnut',
      data: {
        labels: catOrdenadas.map(([k])=>k),
        datasets: [{
          data: catOrdenadas.map(([,v])=>v),
          backgroundColor: CORES.slice(0, catOrdenadas.length),
          borderWidth: 2,
          borderColor: '#181c27',
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color:'#94a3b8', font:{ size:12 }, padding: 12, boxWidth: 14 }
          },
          title: {
            display: true,
            text: `Gastos por Categoria — ${nomeMes(mesAtual)}`,
            color: '#e8eaf0',
            font: { size: 14, weight: 'bold' },
            padding: { bottom: 16 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${((ctx.raw/catOrdenadas.reduce((s,[,v])=>s+v,0))*100).toFixed(1)}%)`
            }
          }
        }
      }
    });

    // ── Gráfico 5: Investimentos por classe (donut) ───
    const invEntries = Object.entries(invClasse).sort((a,b)=>b[1]-a[1]);
    destroyChart('chartInvestimentos');
    charts['chartInvestimentos'] = new Chart(el('chartInvestimentos'), {
      type: 'doughnut',
      data: {
        labels: invEntries.map(([k])=>k),
        datasets: [{
          data: invEntries.map(([,v])=>v),
          backgroundColor: CORES.slice(0, invEntries.length).reverse(),
          borderWidth: 2,
          borderColor: '#181c27',
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color:'#94a3b8', font:{ size:12 }, padding:12, boxWidth:14 }
          },
          title: {
            display: true,
            text: 'Carteira por Classe de Ativo',
            color: '#e8eaf0',
            font: { size:14, weight:'bold' },
            padding: { bottom:16 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}`
            }
          }
        }
      }
    });

    // ── Gráfico 6: Patrimônio histórico ───────────────
    destroyChart('chartPatrimonio');
    charts['chartPatrimonio'] = new Chart(el('chartPatrimonio'), {
      type: 'line',
      data: {
        labels: patrimHistorico.map(h => nomeMes(h.mes_referencia)),
        datasets: [
          {
            label: 'Patrimônio estimado',
            data: patrimHistorico.map(h => Number(h.patrimonio_liquido||0)),
            borderColor: '#22c55e',
            backgroundColor: rgba('#22c55e', .1),
            borderWidth: 2.5,
            pointRadius: 5,
            tension: .35,
            fill: true,
          },
        ]
      },
      options: chartOptions('Evolução Patrimonial Estimada (6 meses)')
    });
    el('semPatrimonio').style.display = 'none';

    // ── Tabela top categorias ─────────────────────────
    el('tabelaCategorias').innerHTML = catOrdenadas.slice(0,8).map(([cat, val], i) => {
      const pct = catOrdenadas.reduce((s,[,v])=>s+v,0);
      const p   = pct > 0 ? (val/pct*100).toFixed(1) : 0;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="width:22px;height:22px;border-radius:50%;background:${CORES[i]};display:inline-block;flex-shrink:0"></span>
          <span style="flex:1;font-size:13px">${cat}</span>
          <span style="font-size:13px;font-weight:700">${fmt(val)}</span>
          <span style="font-size:11px;color:var(--muted);width:36px;text-align:right">${p}%</span>
        </div>`;
    }).join('');

  } catch(err) {
    console.error('Erro ao carregar analytics:', err);
  } finally {
    el('loadingOverlay').style.display = 'none';
  }
}

// ── Opções padrão dos gráficos ────────────────────────
function chartOptions(titulo, currency = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color:'#94a3b8', font:{ size:12 } } },
      title: {
        display: true,
        text: titulo,
        color: '#e8eaf0',
        font: { size:14, weight:'bold' },
        padding: { bottom:16 }
      },
      tooltip: {
        callbacks: {
          label: ctx => currency !== false
            ? ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
            : ` ${ctx.dataset.label}: ${ctx.raw}`
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: '#94a3b8',
          callback: v => currency !== false ? fmt(v) : v
        },
        grid: { color:'rgba(255,255,255,.06)' }
      },
      x: {
        ticks: { color:'#94a3b8' },
        grid:  { color:'rgba(255,255,255,.06)' }
      }
    }
  };
}

// ── Inicializar ───────────────────────────────────────
carregar();
