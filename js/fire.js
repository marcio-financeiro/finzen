/**
 * fire.js
 * Simulador FIRE — Financial Independence, Retire Early
 * Lê dados reais do Supabase para pré-preencher o simulador
 */

import { supabase }       from './supabaseClient.js';
import { navigate }       from './router.js';
import { formatCurrency } from './utils.js';

// ── Auth ──────────────────────────────────────────────
const { data: sd } = await supabase.auth.getSession();
if(!sd.session){ navigate('../login.html'); }
const user = sd.session.user;
document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabase.auth.signOut(); navigate('../login.html');
});

const el  = id => document.getElementById(id);
const fmt = v  => formatCurrency(v, 'BRL');
const fmtM = v => {
  if(v >= 1e6) return `R$ ${(v/1e6).toFixed(1)}M`;
  if(v >= 1e3) return `R$ ${(v/1e3).toFixed(0)}K`;
  return fmt(v);
};

// ── Tipos FIRE ────────────────────────────────────────
const TIPOS_FIRE = {
  regular: {
    label: '🔥 Regular FIRE',
    hint: 'Independência financeira total com padrão de vida atual',
    multiplicador: 25,
    taxa: 0.04,
  },
  lean: {
    label: '🥗 Lean FIRE',
    hint: 'Vida simples e frugal — menos patrimônio necessário',
    multiplicador: 20,
    taxa: 0.05,
  },
  fat: {
    label: '💰 Fat FIRE',
    hint: 'Independência com alto padrão de vida e margem de segurança',
    multiplicador: 33,
    taxa: 0.03,
  },
  barista: {
    label: '☕ Barista FIRE',
    hint: 'Semi-aposentadoria — trabalho leve para complementar a renda',
    multiplicador: 15,
    taxa: 0.05,
  },
};

let tipoAtual = 'regular';
let chartInstance = null;

// ── Selecionar tipo FIRE ──────────────────────────────
window.selecionarTipo = function(btn) {
  document.querySelectorAll('.fire-tipo-btn').forEach(b => b.classList.remove('ativo'));
  btn.classList.add('ativo');
  tipoAtual = btn.dataset.tipo;
  el('hintTipo').textContent = TIPOS_FIRE[tipoAtual].hint;
  calcular();
};

// ── Atualizar label do slider ─────────────────────────
window.atualizarLabel = function() {
  el('labelRentabilidade').textContent = el('rentabilidade').value + '%';
};

// ── Carregar dados reais do Supabase ──────────────────
async function carregarDados() {
  const hoje   = new Date();
  const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth()-2).padStart(2,'0') || '01'}-01`;
  const fim    = hoje.toISOString().split('T')[0];
  const mes3   = new Date(hoje.getFullYear(), hoje.getMonth()-3, 1).toISOString().split('T')[0];

  const [
    { data: contas },
    { data: investimentos },
    { data: recorrentes },
    { data: txHistorico },
  ] = await Promise.all([
    supabase.from('accounts').select('saldo_atual,currency').eq('user_id', user.id).eq('active', true),
    supabase.from('investments').select('quantidade,preco_medio,cotacao_atual').eq('user_id', user.id).eq('ativo', true),
    supabase.from('transactions').select('type,amount').eq('user_id', user.id).eq('is_recurring', true).eq('recurrence_active', true),
    supabase.from('transactions').select('type,amount,date').eq('user_id', user.id).eq('status','pago').gte('date', mes3).lte('date', fim),
  ]);

  // Patrimônio total (contas BRL + investimentos)
  const saldoBRL = (contas||[]).filter(c => (c.currency||'BRL')==='BRL').reduce((s,c) => s+Number(c.saldo_atual||0), 0);
  const totalInvest = (investimentos||[]).reduce((s,i) => {
    const qtd = Number(i.quantidade||0);
    const cot = Number(i.cotacao_atual||i.preco_medio||0);
    return s + qtd * cot;
  }, 0);
  const patrimonioTotal = saldoBRL + totalInvest;

  // Média de aporte (poupança) dos últimos 3 meses
  const porMes = {};
  (txHistorico||[]).forEach(t => {
    const m = t.date?.slice(0,7);
    if(!m) return;
    if(!porMes[m]) porMes[m] = { rec:0, desp:0 };
    if(t.type==='receita') porMes[m].rec  += Number(t.amount||0);
    if(t.type==='despesa') porMes[m].desp += Number(t.amount||0);
  });
  const saldosMensais = Object.values(porMes).map(m => Math.max(m.rec - m.desp, 0));
  const mediaAporte = saldosMensais.length
    ? Math.round(saldosMensais.reduce((s,v)=>s+v,0) / saldosMensais.length)
    : 0;

  // Gastos fixos mensais
  const despesasRec = (recorrentes||[]).filter(r=>r.type==='despesa').reduce((s,r)=>s+Number(r.amount||0),0);
  const gastosMensais = despesasRec > 0 ? Math.round(despesasRec) : 0;

  // Preencher inputs
  el('patrimonioAtual').value = Math.round(patrimonioTotal);
  el('aporteMensal').value    = mediaAporte;
  el('gastosMensais').value   = gastosMensais > 0 ? gastosMensais : '';

  el('hintPatrimonio').textContent = `Contas (${fmt(saldoBRL)}) + Investimentos (${fmt(totalInvest)})`;
  el('hintAporte').textContent     = `Média dos últimos 3 meses: ${fmt(mediaAporte)}/mês`;

  calcular();
}

// ── Cálculo FIRE ──────────────────────────────────────
window.calcular = function() {
  const patrimonio   = Number(el('patrimonioAtual').value || 0);
  const aporte       = Number(el('aporteMensal').value    || 0);
  const gastos       = Number(el('gastosMensais').value   || 0);
  const rentAnual    = Number(el('rentabilidade').value   || 6) / 100;
  const idade        = Number(el('idadeAtual').value      || 30);
  const tipo         = TIPOS_FIRE[tipoAtual];

  if(!gastos || !patrimonio && !aporte) return;

  const metaPatrimonio = gastos * 12 * tipo.multiplicador;
  const falta          = Math.max(metaPatrimonio - patrimonio, 0);
  const rentMensal     = rentAnual / 12;

  // Já atingiu a IF?
  if(patrimonio >= metaPatrimonio) {
    el('fireResultado').classList.remove('show');
    el('fireBadge').classList.add('show');
    el('fireBadgeMsg').textContent = `Seu patrimônio de ${fmt(patrimonio)} já é suficiente para gerar ${fmt(gastos)}/mês pelo resto da vida!`;
    el('fireKpis').style.display = 'grid';
    el('kpiMeta').textContent  = fmtM(metaPatrimonio);
    el('kpiFalta').textContent = 'R$ 0';
    el('kpiFalta').className   = 'positive';
    el('kpiIdade').textContent = `${idade} anos`;
    el('kpiRegra').textContent = `${(patrimonio / (gastos * 12) * 100).toFixed(1)}%`;
    renderGrafico(patrimonio, aporte, rentMensal, metaPatrimonio, 0, idade);
    renderInsights(patrimonio, aporte, gastos, metaPatrimonio, 0, idade, rentAnual);
    return;
  }

  el('fireBadge').classList.remove('show');

  // Calcular meses até atingir a meta
  // FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r => resolver para n
  let meses = 0;
  let patrimonioSim = patrimonio;
  const MAX_ANOS = 100;

  if(aporte <= 0 && rentMensal <= 0) {
    el('fireResultado').classList.remove('show');
    return;
  }

  while(patrimonioSim < metaPatrimonio && meses < MAX_ANOS * 12) {
    patrimonioSim = patrimonioSim * (1 + rentMensal) + aporte;
    meses++;
  }

  if(meses >= MAX_ANOS * 12) {
    el('fireResultado').classList.add('show');
    el('fireAnos').textContent = '> 100 anos';
    el('fireSub').textContent  = 'Aumente o aporte ou reduza os gastos desejados.';
    el('fireKpis').style.display = 'none';
    return;
  }

  const anos       = Math.floor(meses / 12);
  const mesesResto = meses % 12;
  const idadeIF    = idade + anos;
  const anoIF      = new Date().getFullYear() + anos;

  // Exibir resultado
  el('fireResultado').classList.add('show');
  el('fireAnos').textContent = anos === 0
    ? `${mesesResto} meses`
    : mesesResto === 0
    ? `${anos} anos`
    : `${anos} anos e ${mesesResto} meses`;
  el('fireSub').textContent = `Você terá ${idadeIF} anos em ${anoIF} • Meta: ${fmtM(metaPatrimonio)}`;

  // KPIs
  el('fireKpis').style.display = 'grid';
  el('kpiMeta').textContent  = fmtM(metaPatrimonio);
  el('kpiFalta').textContent = fmtM(falta);
  el('kpiFalta').className   = 'negative';
  el('kpiIdade').textContent = `${idadeIF} anos`;
  el('kpiRegra').textContent = `${((patrimonio / metaPatrimonio) * 100).toFixed(0)}%`;

  // Gráfico e insights
  renderGrafico(patrimonio, aporte, rentMensal, metaPatrimonio, meses, idade);
  renderInsights(patrimonio, aporte, gastos, metaPatrimonio, meses, idadeIF, rentAnual);
};

// ── Gráfico de projeção ───────────────────────────────
function renderGrafico(patrimonioInicial, aporte, rentMensal, meta, totalMeses, idadeInicial) {
  const anos    = Math.min(Math.ceil(totalMeses / 12) + 5, 60);
  const labels  = [];
  const semAporte  = [];
  const comAporte  = [];

  let pSem = patrimonioInicial;
  let pCom = patrimonioInicial;

  for(let a = 0; a <= anos; a++) {
    labels.push(`${idadeInicial + a} anos`);
    semAporte.push(Math.round(pSem));
    comAporte.push(Math.round(pCom));

    for(let m = 0; m < 12; m++) {
      pSem = pSem * (1 + rentMensal);
      pCom = pCom * (1 + rentMensal) + aporte;
    }
  }

  if(chartInstance) { chartInstance.destroy(); }

  chartInstance = new Chart(el('chartFire'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Com aportes',
          data: comAporte,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,.08)',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: .4,
          fill: true,
        },
        {
          label: 'Só rendimentos',
          data: semAporte,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(79,132,243,.05)',
          borderWidth: 1.5,
          borderDash: [4,4],
          pointRadius: 0,
          tension: .4,
          fill: true,
        },
        {
          label: 'Meta FIRE',
          data: Array(labels.length).fill(meta),
          borderColor: '#f59e0b',
          borderWidth: 1.5,
          borderDash: [6,3],
          pointRadius: 0,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels: { color:'#94a3b8', font:{ size:12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtM(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          ticks: { color:'#94a3b8', callback: v => fmtM(v) },
          grid:  { color:'rgba(255,255,255,.05)' }
        },
        x: {
          ticks: { color:'#94a3b8', maxTicksLimit: 10 },
          grid:  { color:'rgba(255,255,255,.05)' }
        }
      }
    }
  });
}

// ── Insights personalizados ───────────────────────────
function renderInsights(patrimonio, aporte, gastos, meta, meses, idadeIF, rentAnual) {
  const insights = [];
  const taxaPoupanca = gastos > 0 ? (aporte / (aporte + gastos) * 100) : 0;
  const anos = Math.floor(meses / 12);

  // Insight 1: Taxa de poupança
  if(taxaPoupanca >= 50) {
    insights.push({ cor:'verde', texto:`🚀 Taxa de poupança de <strong>${taxaPoupanca.toFixed(0)}%</strong> — você está no caminho da aceleração máxima. Poucas pessoas chegam a esse nível!` });
  } else if(taxaPoupanca >= 30) {
    insights.push({ cor:'azul', texto:`✅ Taxa de poupança de <strong>${taxaPoupanca.toFixed(0)}%</strong> — excelente! Com essa disciplina, a IF está bem dentro do horizonte.` });
  } else if(taxaPoupanca >= 15) {
    insights.push({ cor:'amarelo', texto:`🟡 Taxa de poupança de <strong>${taxaPoupanca.toFixed(0)}%</strong>. Aumentar para 30%+ aceleraria significativamente sua IF.` });
  } else {
    insights.push({ cor:'vermelho', texto:`⚠️ Taxa de poupança de <strong>${taxaPoupanca.toFixed(0)}%</strong> — aumentar o aporte mensal é o fator mais importante para antecipar a IF.` });
  }

  // Insight 2: Impacto do aumento de aporte
  if(aporte > 0) {
    const aporteExtra = aporte * 1.2;
    let mesesExtra = 0;
    let p = patrimonio;
    while(p < meta && mesesExtra < 1200) {
      p = p * (1 + rentAnual/12) + aporteExtra;
      mesesExtra++;
    }
    const economizados = meses - mesesExtra;
    if(economizados > 6) {
      insights.push({ cor:'azul', texto:`💡 Aumentar o aporte em apenas <strong>20% (${fmt(aporte * 0.2)}/mês)</strong> anteciparia sua IF em <strong>${Math.floor(economizados/12)} anos e ${economizados%12} meses</strong>.` });
    }
  }

  // Insight 3: Rentabilidade
  if(rentAnual <= 0.05) {
    insights.push({ cor:'amarelo', texto:`📈 Com rentabilidade de <strong>${(rentAnual*100).toFixed(0)}%</strong>, considere diversificar em renda variável para potencializar os rendimentos.` });
  } else if(rentAnual >= 0.10) {
    insights.push({ cor:'verde', texto:`🎯 Rentabilidade de <strong>${(rentAnual*100).toFixed(0)}%</strong> ao ano é agressiva — certifique-se de ter diversificação adequada para sustentar esse retorno.` });
  }

  // Insight 4: Idade na IF
  if(idadeIF < 40) {
    insights.push({ cor:'verde', texto:`🏆 IF aos <strong>${idadeIF} anos</strong> — isso é FIRE extremo! Você terá décadas pela frente para aproveitar.` });
  } else if(idadeIF < 50) {
    insights.push({ cor:'azul', texto:`✨ IF aos <strong>${idadeIF} anos</strong> — muito antes da aposentadoria tradicional. Excelente planejamento!` });
  } else if(idadeIF < 60) {
    insights.push({ cor:'amarelo', texto:`⏰ IF aos <strong>${idadeIF} anos</strong> — ainda antes da aposentadoria convencional. Aumentar aportes pode antecipar esse prazo.` });
  } else {
    insights.push({ cor:'vermelho', texto:`🔴 IF aos <strong>${idadeIF} anos</strong> — próximo à aposentadoria tradicional. Rever gastos e aumentar aportes pode fazer grande diferença.` });
  }

  // Insight 5: Patrimônio atual vs meta
  const pct = (patrimonio / meta * 100).toFixed(0);
  if(pct > 0) {
    insights.push({ cor:'azul', texto:`📊 Você já tem <strong>${pct}% da meta</strong> acumulada (${fmtM(patrimonio)} de ${fmtM(meta)}). Cada real investido agora tem maior impacto pelo efeito dos juros compostos.` });
  }

  el('fireInsights').innerHTML = insights.map(i =>
    `<div class="fire-insight ${i.cor}">${i.texto}</div>`
  ).join('');
}

// ── Inicializar ───────────────────────────────────────
await carregarDados();
