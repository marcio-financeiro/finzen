// api/_financeSummary.js — agregação financeira server-side (semanal/mensal)
// pros crons de resumo por e-mail. Arquivos com _ no início não viram
// endpoint na Vercel.
//
// Replica (não importa — js/reports.js roda no browser com sessão de
// usuário + RLS, aqui é service_role + fetch cru) as mesmas fórmulas de
// js/reports.js: KPIs, top categorias, orçamento vs realizado e insights.
// Diferenças documentadas: resumo semanal não inclui card_transactions
// (fatura_referencia é mensal, não mapeia 1:1 numa janela de 7 dias) nem
// conversão de câmbio (assume BRL — simplificação pra manter o e-mail leve).

import { mesRefLabel } from './_dateUtils.js';

async function sbFetch(SB_URL, sbHeaders, path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Supabase ${path} → ${r.status}: ${texto}`);
  return texto ? JSON.parse(texto) : [];
}

function somaPorTipo(tx, tipo) {
  return tx.filter(t => t.type === tipo).reduce((s, t) => s + Number(t.amount || 0), 0);
}

function topCategorias(tx, cardTx, n = 3) {
  const mapa = {};
  tx.filter(t => t.type === 'despesa').forEach(t => {
    const nome = t.categories?.nome || 'Outros';
    mapa[nome] = (mapa[nome] || 0) + Number(t.amount || 0);
  });
  cardTx.forEach(t => {
    const nome = t.categories?.nome || 'Cartão';
    mapa[nome] = (mapa[nome] || 0) + Number(t.valor_parcela || 0);
  });
  return Object.entries(mapa)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n);
}

// ── Resumo semanal (últimos N dias corridos) ──────────────────────────────
export async function resumoSemanal(userId, { inicio, fim }, sbHeaders, SB_URL) {
  const tx = await sbFetch(
    SB_URL, sbHeaders,
    `transactions?user_id=eq.${userId}&date=gte.${inicio}&date=lte.${fim}&status=eq.pago` +
    '&select=type,amount,category_id,categories:category_id(nome)'
  );

  const receitas  = somaPorTipo(tx, 'receita');
  const despesas  = somaPorTipo(tx, 'despesa');
  const resultado = receitas - despesas;
  const top3 = topCategorias(tx, []);

  return { receitas, despesas, resultado, top3 };
}

// ── Resumo mensal (mês fechado + insights) ────────────────────────────────
export async function resumoMensal(userId, { ano, mes }, sbHeaders, SB_URL) {
  const mesRef  = `${ano}-${String(mes).padStart(2, '0')}`;
  const inicio  = `${mesRef}-01`;
  const fim     = new Date(ano, mes, 0).toISOString().split('T')[0]; // último dia do mês
  const dataAnt = new Date(ano, mes - 2, 1); // mês-1 (mes é 1-based)
  const mesAnt  = `${dataAnt.getFullYear()}-${String(dataAnt.getMonth() + 1).padStart(2, '0')}`;
  const fimAnt  = new Date(ano, mes - 1, 0).toISOString().split('T')[0]; // último dia do mês anterior

  const [tx, cardTx, txAnt, budgets, patrimonioHist] = await Promise.all([
    sbFetch(SB_URL, sbHeaders,
      `transactions?user_id=eq.${userId}&date=gte.${inicio}&date=lte.${fim}&status=eq.pago` +
      '&select=type,amount,category_id,categories:category_id(nome)'),
    sbFetch(SB_URL, sbHeaders,
      `card_transactions?user_id=eq.${userId}&fatura_referencia=eq.${mesRef}` +
      '&select=valor_parcela,category_id,categories:category_id(nome)'),
    sbFetch(SB_URL, sbHeaders,
      `transactions?user_id=eq.${userId}&date=gte.${mesAnt}-01&date=lte.${fimAnt}&status=eq.pago&type=eq.receita` +
      '&select=type,amount'),
    sbFetch(SB_URL, sbHeaders,
      `budgets?user_id=eq.${userId}&mes_referencia=eq.${mesRef}` +
      '&select=valor_planejado,category_id,categories:category_id(nome)'),
    sbFetch(SB_URL, sbHeaders,
      `patrimony_history?user_id=eq.${userId}&select=reference_month,net_worth&order=reference_month.asc`),
  ]);

  const receitas  = somaPorTipo(tx, 'receita');
  const despTx    = somaPorTipo(tx, 'despesa');
  const despCard  = cardTx.reduce((s, t) => s + Number(t.valor_parcela || 0), 0);
  const despesas  = despTx + despCard;
  const resultado = receitas - despesas;
  const poupPct   = receitas > 0 ? (resultado / receitas) * 100 : 0;

  const recAnt = somaPorTipo(txAnt, 'receita');

  const top3 = topCategorias(tx, cardTx);

  const patrimonioMes = patrimonioHist.find(h => h.reference_month?.startsWith(mesRef))?.net_worth ?? null;
  const patrimonioAnt = patrimonioHist.find(h => h.reference_month?.startsWith(mesAnt))?.net_worth ?? null;
  const varPatrimPct = (patrimonioMes !== null && patrimonioAnt !== null && patrimonioAnt !== 0)
    ? ((patrimonioMes - patrimonioAnt) / Math.abs(patrimonioAnt)) * 100
    : null;

  // Orçamento vs realizado
  const gastosPorCategoria = {};
  tx.filter(t => t.type === 'despesa').forEach(t => {
    if (t.category_id) gastosPorCategoria[t.category_id] = (gastosPorCategoria[t.category_id] || 0) + Number(t.amount || 0);
  });
  cardTx.forEach(t => {
    if (t.category_id) gastosPorCategoria[t.category_id] = (gastosPorCategoria[t.category_id] || 0) + Number(t.valor_parcela || 0);
  });
  const orcamentoEstourados = budgets.filter(b => (gastosPorCategoria[b.category_id] || 0) > Number(b.valor_planejado || 0)).length;

  // Insights (texto, mesmo conteúdo de renderInsights() em js/reports.js)
  const insights = [];
  if (top3.length > 0) {
    insights.push(`Maior gasto do mês: ${top3[0].nome} (${fmtBRL(top3[0].valor)})`);
  }
  insights.push(resultado >= 0
    ? `Resultado positivo: economia de ${fmtBRL(resultado)} (${poupPct.toFixed(1)}% da receita)`
    : `Resultado negativo: gastos superaram receitas em ${fmtBRL(Math.abs(resultado))}`);
  if (recAnt > 0) {
    const varRec = ((receitas - recAnt) / recAnt) * 100;
    insights.push(`Receita vs ${mesRefLabel(mesAnt)}: ${varRec >= 0 ? '↑' : '↓'} ${Math.abs(varRec).toFixed(1)}%`);
  }
  if (varPatrimPct !== null) {
    insights.push(`Patrimônio ${varPatrimPct >= 0 ? 'cresceu' : 'caiu'} ${Math.abs(varPatrimPct).toFixed(2)}% em relação a ${mesRefLabel(mesAnt)}`);
  }
  if (budgets.length > 0) {
    insights.push(orcamentoEstourados > 0
      ? `${orcamentoEstourados} categoria${orcamentoEstourados > 1 ? 's' : ''} acima do orçamento planejado`
      : 'Todas as categorias dentro do orçamento planejado');
  }

  return {
    mesRef, receitas, despesas, resultado, poupPct, top3,
    patrimonioMes, varPatrimPct, orcamentoEstourados, budgetsCount: budgets.length,
    insights,
  };
}

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export { fmtBRL };
