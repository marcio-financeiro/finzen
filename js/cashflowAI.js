/**
 * cashflowAI.js
 * Previsão inteligente de fluxo de caixa com Claude AI
 * Analisa dados reais do Supabase e gera alertas preditivos
 */

import { supabase } from './supabaseClient.js';
import { formatCurrency } from './utils.js';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// ── Coleta contexto financeiro do usuário ─────────────────────────────────
export async function coletarContexto(userId) {
  const hoje = new Date();
  const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const primeiroDia = `${anoMes}-01`;
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().split('T')[0];
  const hojeISO = hoje.toISOString().split('T')[0];

  // Data 3 meses atrás para histórico
  const mes3Atras = new Date(hoje.getFullYear(), hoje.getMonth()-3, 1).toISOString().split('T')[0];

  const [
    { data: contas },
    { data: transacoesMes },
    { data: pendentes },
    { data: parcelasMes },
    { data: recorrentes },
    { data: historico3m },
    { data: orcamentos },
    { data: cartaoMes },
  ] = await Promise.all([
    supabase.from('accounts')
      .select('nome,saldo_atual,currency')
      .eq('user_id', userId).eq('active', true),

    supabase.from('transactions')
      .select('type,amount,status,date,categories:category_id(nome,icon)')
      .eq('user_id', userId)
      .gte('date', primeiroDia).lte('date', ultimoDia),

    supabase.from('transactions')
      .select('type,amount,date,description')
      .eq('user_id', userId)
      .eq('status', 'pendente')
      .gte('date', hojeISO).lte('date', ultimoDia),

    supabase.from('card_transactions')
      .select('valor_parcela,card_id,credit_cards:card_id(nome,vencimento_dia)')
      .eq('user_id', userId)
      .eq('status', 'aberta')
      .eq('fatura_referencia', anoMes),

    supabase.from('transactions')
      .select('type,amount,recurrence_frequency,description')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .eq('recurrence_active', true),

    supabase.from('transactions')
      .select('type,amount,date,status')
      .eq('user_id', userId)
      .gte('date', mes3Atras).lte('date', primeiroDia)
      .eq('status', 'pago'),

    supabase.from('budgets')
      .select('valor_planejado,categories:category_id(nome)')
      .eq('user_id', userId)
      .eq('mes_referencia', anoMes),

    // Despesas do cartão de crédito do mês, agrupadas por categoria
    supabase.from('card_transactions')
      .select('valor_parcela,descricao,categories:category_id(nome,icon)')
      .eq('user_id', userId)
      .eq('fatura_referencia', anoMes),
  ]);

  const pagas = (transacoesMes||[]).filter(t => t.status === 'pago');
  const receitasMes = pagas.filter(t => t.type === 'receita').reduce((s,t) => s+Number(t.amount||0), 0);
  const despesasMes = pagas.filter(t => t.type === 'despesa').reduce((s,t) => s+Number(t.amount||0), 0);
  const saldoTotal  = (contas||[]).filter(c => (c.currency||'BRL')==='BRL').reduce((s,c) => s+Number(c.saldo_atual||0), 0);
  const totalFaturas = (parcelasMes||[]).reduce((s,p) => s+Number(p.valor_parcela||0), 0);

  // Receitas e despesas pendentes até fim do mês
  const receitasPend  = (pendentes||[]).filter(t => t.type==='receita').reduce((s,t) => s+Number(t.amount||0), 0);
  const despesasPend  = (pendentes||[]).filter(t => t.type==='despesa').reduce((s,t) => s+Number(t.amount||0), 0);
  const saldoPrevisto = saldoTotal + receitasPend - despesasPend - totalFaturas;

  // Histórico mensal dos últimos 3 meses
  const porMes = {};
  (historico3m||[]).forEach(t => {
    const m = t.date?.slice(0,7);
    if(!m) return;
    if(!porMes[m]) porMes[m] = { receitas:0, despesas:0 };
    if(t.type==='receita') porMes[m].receitas += Number(t.amount||0);
    if(t.type==='despesa') porMes[m].despesas += Number(t.amount||0);
  });

  // Dias restantes no mês
  const diasRestantes = Math.ceil((new Date(ultimoDia+'T23:59:59') - hoje) / (1000*60*60*24));
  const diasPassados  = hoje.getDate() - 1;
  const totalDiasMes  = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate();

  return {
    hoje: hojeISO,
    diasRestantes,
    diasPassados,
    totalDiasMes,
    mesReferencia: anoMes,
    saldoAtual: saldoTotal,
    saldoPrevisto,
    receitasMes,
    despesasMes,
    receitasPendentes: receitasPend,
    despesasPendentes: despesasPend,
    totalFaturas,
    taxaPoupancaMes: receitasMes > 0 ? ((receitasMes - despesasMes) / receitasMes * 100).toFixed(1) : 0,
    lancamentosPendentes: (pendentes||[]).slice(0,10).map(p => ({
      descricao: p.description,
      tipo: p.type,
      valor: Number(p.amount||0),
      data: p.date,
    })),
    recorrentes: (recorrentes||[]).slice(0,10).map(r => ({
      descricao: r.description,
      tipo: r.type,
      valor: Number(r.amount||0),
      frequencia: r.recurrence_frequency,
    })),
    historico3Meses: Object.entries(porMes).map(([mes, v]) => ({
      mes,
      receitas: v.receitas,
      despesas: v.despesas,
      saldo: v.receitas - v.despesas,
    })).sort((a,b) => a.mes.localeCompare(b.mes)),
    orcamentos: (orcamentos||[]).map(o => ({
      categoria: o.categories?.nome || 'Geral',
      planejado: Number(o.valor_planejado||0),
    })),
    gastosPorCategoria: (() => {
      const grupos = {};
      // Despesas de movimentações normais
      (transacoesMes||[]).filter(t => t.status==='pago' && t.type==='despesa').forEach(t => {
        const cat   = t.categories?.nome || 'Sem categoria';
        const icone = t.categories?.icon || '';
        if(!grupos[cat]) grupos[cat] = { categoria: cat, icone, total: 0 };
        grupos[cat].total += Number(t.amount||0);
      });
      // Despesas do cartão de crédito (card_transactions)
      (cartaoMes||[]).forEach(t => {
        const cat   = t.categories?.nome || 'Cartão s/ categoria';
        const icone = t.categories?.icon || '💳';
        if(!grupos[cat]) grupos[cat] = { categoria: cat, icone, total: 0 };
        grupos[cat].total += Number(t.valor_parcela||0);
      });
      return Object.values(grupos).sort((a,b) => b.total - a.total).slice(0,12);
    })(),
    totalCartaoMes: (cartaoMes||[]).reduce((s,t) => s+Number(t.valor_parcela||0), 0),
  };
}

// ── Coleta contexto de investimentos do usuário ───────────────────────────
export async function coletarContextoInvestimentos(userId) {
  const hoje = new Date();
  const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const anoAtual = hoje.getFullYear().toString();
  const mes6Atras = new Date(hoje.getFullYear(), hoje.getMonth()-6, 1).toISOString().split('T')[0];

  const [
    { data: ativos },
    { data: dividendosMes },
    { data: dividendosAno },
    { data: metas },
  ] = await Promise.all([
    supabase.from('investments')
      .select('ticker,nome,tipo,quantidade,preco_medio,cotacao_atual,moeda,tese_entrada,gatilho_saida,convicao,ind_pl,ind_roe,ind_dy,ind_pl_auto,ind_roe_auto,ind_dy_auto')
      .eq('user_id', userId)
      .eq('ativo', true)
      .order('tipo'),

    supabase.from('dividends')
      .select('ticker,valor_total,tipo,data_pagamento,investments:investment_id(ticker,nome)')
      .eq('user_id', userId)
      .gte('data_pagamento', `${anoMes}-01`)
      .lte('data_pagamento', `${anoMes}-31`),

    supabase.from('dividends')
      .select('valor_total,data_pagamento')
      .eq('user_id', userId)
      .gte('data_pagamento', `${anoAtual}-01-01`),

    supabase.from('goals')
      .select('nome,valor_alvo,valor_atual,data_alvo')
      .eq('user_id', userId)
      .eq('ativo', true)
      .limit(5),
  ]);

  // Calcular totais por classe
  const porClasse = {};
  let totalAplicado = 0;
  let totalAtual = 0;

  (ativos||[]).forEach(a => {
    const qtd    = Number(a.quantidade || 0);
    const pm     = Number(a.preco_medio || 0);
    const cot    = Number(a.cotacao_atual || a.preco_medio || 0);
    const aplic  = qtd * pm;
    const atual  = qtd * cot;
    const classe = {
      acao_br:'Ações BR', acao:'Ações BR', fii:'FIIs',
      etf_br:'ETFs BR', etf:'ETFs BR', acao_eua:'Ações EUA',
      etf_eua:'ETFs EUA', renda_fixa:'Renda Fixa', cripto:'Cripto',
    }[a.tipo] || 'Outros';

    if (!porClasse[classe]) porClasse[classe] = { aplicado:0, atual:0 };
    porClasse[classe].aplicado += aplic;
    porClasse[classe].atual    += atual;
    totalAplicado += aplic;
    totalAtual    += atual;
  });

  const resultado = totalAtual - totalAplicado;
  const rentabilidade = totalAplicado > 0 ? (resultado / totalAplicado * 100).toFixed(2) : 0;

  const divMes = (dividendosMes||[]).reduce((s,d) => s + Number(d.valor_total||0), 0);
  const divAno = (dividendosAno||[]).reduce((s,d) => s + Number(d.valor_total||0), 0);
  const yieldAno = totalAtual > 0 ? (divAno / totalAtual * 100).toFixed(2) : 0;

  // Ativos com tese registrada
  const ativosComTese = (ativos||[]).filter(a => a.tese_entrada || a.convicao);

  // Top 5 ativos por valor atual
  const top5 = [...(ativos||[])]
    .map(a => ({
      ticker : a.ticker,
      nome   : a.nome || '',
      tipo   : a.tipo,
      aplic  : Number(a.quantidade||0) * Number(a.preco_medio||0),
      atual  : Number(a.quantidade||0) * Number(a.cotacao_atual||a.preco_medio||0),
      pl     : a.ind_pl_auto ?? a.ind_pl ?? null,
      roe    : a.ind_roe_auto ?? a.ind_roe ?? null,
      dy     : a.ind_dy_auto ?? a.ind_dy ?? null,
      tese   : a.tese_entrada || null,
      gatilho: a.gatilho_saida || null,
      convicao: a.convicao || null,
    }))
    .sort((a,b) => b.atual - a.atual)
    .slice(0, 8);

  return {
    totalAtivos    : (ativos||[]).length,
    totalAplicado,
    totalAtual,
    resultado,
    rentabilidade,
    divMes,
    divAno,
    yieldAno,
    porClasse      : Object.entries(porClasse).map(([classe, v]) => ({
      classe,
      aplicado : v.aplicado,
      atual    : v.atual,
      pct      : totalAtual > 0 ? (v.atual / totalAtual * 100).toFixed(1) : 0,
      resultado: v.atual - v.aplicado,
    })).sort((a,b) => b.atual - a.atual),
    top5,
    ativosComTese  : ativosComTese.length,
    metas          : (metas||[]).map(m => ({
      nome      : m.nome,
      alvo      : Number(m.valor_alvo||0),
      atual     : Number(m.valor_atual||0),
      pct       : m.valor_alvo > 0 ? (m.valor_atual / m.valor_alvo * 100).toFixed(0) : 0,
      prazo     : m.data_alvo,
    })),
  };
}


export async function analisarComIA(contexto, onChunk, onDone) {
  const fmt = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

  const prompt = `Você é o FinZen AI, especialista em finanças pessoais brasileiras.
Analise os dados financeiros abaixo e gere uma análise preditiva de fluxo de caixa.

## Dados do usuário — ${contexto.mesReferencia}

- Hoje: ${contexto.hoje} (dia ${contexto.diasPassados+1} de ${contexto.totalDiasMes}, faltam ${contexto.diasRestantes} dias)
- Saldo atual em contas: ${fmt(contexto.saldoAtual)}
- Saldo previsto fim do mês: ${fmt(contexto.saldoPrevisto)}
- Receitas pagas no mês: ${fmt(contexto.receitasMes)}
- Despesas pagas no mês: ${fmt(contexto.despesasMes)}
- Taxa de poupança atual: ${contexto.taxaPoupancaMes}%
- Faturas de cartão em aberto: ${fmt(contexto.totalFaturas)}
- Receitas pendentes até fim do mês: ${fmt(contexto.receitasPendentes)}
- Despesas pendentes até fim do mês: ${fmt(contexto.despesasPendentes)}

### Lançamentos pendentes
${contexto.lancamentosPendentes.length
  ? contexto.lancamentosPendentes.map(p => `- [${p.tipo}] ${p.descricao}: ${fmt(p.valor)} em ${p.data}`).join('\n')
  : '- Nenhum lançamento pendente'}

### Receitas e despesas recorrentes
${contexto.recorrentes.length
  ? contexto.recorrentes.map(r => `- [${r.tipo}] ${r.descricao}: ${fmt(r.valor)} (${r.frequencia})`).join('\n')
  : '- Nenhum lançamento recorrente'}

### Histórico últimos 3 meses
${contexto.historico3Meses.map(h => `- ${h.mes}: receitas ${fmt(h.receitas)}, despesas ${fmt(h.despesas)}, saldo ${fmt(h.saldo)}`).join('\n')}

### Orçamentos configurados
${contexto.orcamentos.length
  ? contexto.orcamentos.map(o => `- ${o.categoria}: planejado ${fmt(o.planejado)}`).join('\n')
  : '- Sem orçamentos configurados'}

## Sua tarefa

Gere uma análise em **3 seções obrigatórias**, em português brasileiro, curta e direta:

### 🔮 Previsão do mês
Em 2-3 frases, diga se o mês vai fechar positivo ou negativo, baseado nos dados reais. Se negativo, diga em quantos dias aproximadamente o saldo pode ficar crítico.

### ⚠️ Alertas prioritários
Liste de 2 a 4 alertas concretos com base nos dados. Use emojis. Seja específico com valores.

### 💡 Recomendações
Liste de 2 a 3 ações práticas e específicas que o usuário pode tomar agora. Baseie-se nos dados reais, não em conselhos genéricos.

Seja objetivo, use valores em R$, e não repita dados óbvios. Tom: direto e útil, como um consultor financeiro experiente.`;

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) throw new Error(`Erro ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let textoCompleto = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop();

    for (const linha of linhas) {
      if (!linha.startsWith('data: ')) continue;
      const raw = linha.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const json = JSON.parse(raw);
        const delta = json?.delta?.text || '';
        if (delta) {
          textoCompleto += delta;
          onChunk(delta);
        }
      } catch(_) {}
    }
  }

  onDone(textoCompleto);
}

// ── Renderiza markdown simples ────────────────────────────────────────────
export function renderMd(text) {
  return text
    .replace(/^---+$/gm, '')
    .replace(/^# (.+)$/gm, '<h4 class="cfai-h4">$1</h4>')
    .replace(/^## (.+)$/gm, '<h4 class="cfai-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h4 class="cfai-h4">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul class="cfai-ul">${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p class="cfai-p">')
    .replace(/\n/g, '<br>')
    .replace(/^(?!<)(.+)/, '<p class="cfai-p">$1');
}
