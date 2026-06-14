/**
 * anomalyAI.js
 * Detecção de anomalias financeiras e assinaturas fantasmas com Claude AI
 * Analisa padrões de gastos, recorrências e variações incomuns
 */

import { supabase } from './supabaseClient.js';

// ── Coleta dados para análise de anomalias ────────────────────────────────
export async function coletarDadosAnomalias(userId) {
  const hoje = new Date();

  // Últimos 6 meses para análise de padrões
  const meses = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const mes6Atras = new Date(hoje.getFullYear(), hoje.getMonth()-6, 1).toISOString().split('T')[0];
  const hojeISO   = hoje.toISOString().split('T')[0];
  const mesAtual  = meses[0];

  const [
    { data: txHistorico },
    { data: cardHistorico },
    { data: recorrentes },
    { data: cardRecorrentes },
  ] = await Promise.all([
    // Histórico de transações 6 meses
    supabase.from('transactions')
      .select('type,amount,date,description,category_id,categories:category_id(nome,icon),status')
      .eq('user_id', userId)
      .gte('date', mes6Atras)
      .lte('date', hojeISO)
      .eq('status', 'pago')
      .order('date', { ascending: false }),

    // Histórico de compras no cartão 6 meses
    supabase.from('card_transactions')
      .select('valor_parcela,valor_total,descricao,fatura_referencia,category_id,categories:category_id(nome,icon),credit_cards:card_id(nome)')
      .eq('user_id', userId)
      .in('fatura_referencia', meses),

    // Transações recorrentes cadastradas
    supabase.from('transactions')
      .select('description,amount,type,recurrence_frequency,date')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .eq('recurrence_active', true),

    // Compras recorrentes no cartão (mesmo nome repetido)
    supabase.from('card_transactions')
      .select('descricao,valor_parcela,fatura_referencia,category_id,categories:category_id(nome)')
      .eq('user_id', userId)
      .in('fatura_referencia', meses.slice(0, 3)),
  ]);

  const tx = txHistorico || [];
  const cardTx = cardHistorico || [];

  // ── Gastos por categoria por mês ─────────────────────────────────────
  const gastosPorCategoriaMes = {};
  tx.filter(t => t.type === 'despesa').forEach(t => {
    const mes = t.date?.slice(0, 7);
    const cat = t.categories?.nome || 'Sem categoria';
    if (!mes) return;
    if (!gastosPorCategoriaMes[cat]) gastosPorCategoriaMes[cat] = {};
    gastosPorCategoriaMes[cat][mes] = (gastosPorCategoriaMes[cat][mes] || 0) + Number(t.amount || 0);
  });
  cardTx.forEach(t => {
    const cat = t.categories?.nome || 'Sem categoria';
    const mes = t.fatura_referencia;
    if (!mes) return;
    if (!gastosPorCategoriaMes[cat]) gastosPorCategoriaMes[cat] = {};
    gastosPorCategoriaMes[cat][mes] = (gastosPorCategoriaMes[cat][mes] || 0) + Number(t.valor_parcela || 0);
  });

  // ── Detectar assinaturas no cartão (mesmo nome em 2+ meses) ──────────
  const frequenciaCartao = {};
  cardTx.forEach(t => {
    const nome = (t.descricao || '').trim().toLowerCase();
    if (!nome) return;
    if (!frequenciaCartao[nome]) frequenciaCartao[nome] = { meses: new Set(), valor: Number(t.valor_parcela || 0), descricao: t.descricao, categoria: t.categories?.nome };
    frequenciaCartao[nome].meses.add(t.fatura_referencia);
  });

  const assinaturasDetectadas = Object.values(frequenciaCartao)
    .filter(a => a.meses.size >= 2)
    .map(a => ({
      descricao: a.descricao,
      categoria: a.categoria || 'Sem categoria',
      valor: a.valor,
      mesesAtivo: a.meses.size,
    }))
    .sort((a, b) => b.valor - a.valor);

  // ── Anomalias por categoria (variação > 50% vs média) ────────────────
  const anomalias = [];
  Object.entries(gastosPorCategoriaMes).forEach(([cat, porMes]) => {
    const mesesComDados = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0]));
    if (mesesComDados.length < 2) return;

    const historico = mesesComDados.slice(0, -1); // todos menos o mais recente
    const atual = mesesComDados[mesesComDados.length - 1];
    if (!atual || atual[0] !== mesAtual) return;

    const media = historico.reduce((s, [, v]) => s + v, 0) / historico.length;
    const variacao = media > 0 ? ((atual[1] - media) / media) * 100 : 0;

    if (Math.abs(variacao) >= 40 && media > 50) {
      anomalias.push({
        categoria: cat,
        valorAtual: atual[1],
        mediaHistorica: media,
        variacaoPercent: variacao,
        tipo: variacao > 0 ? 'alta' : 'baixa',
      });
    }
  });

  anomalias.sort((a, b) => Math.abs(b.variacaoPercent) - Math.abs(a.variacaoPercent));

  // ── Recorrentes que não apareceram esse mês ───────────────────────────
  const txMesAtual = tx.filter(t => t.date?.startsWith(mesAtual)).map(t => t.description?.toLowerCase());
  const recorrentesSumidos = (recorrentes || []).filter(r => {
    const nome = r.description?.toLowerCase() || '';
    return !txMesAtual.some(t => t?.includes(nome.slice(0, 10)));
  });

  return {
    mesAtual,
    mesesAnalisados: meses.length,
    totalTransacoes: tx.length + cardTx.length,
    assinaturasDetectadas: assinaturasDetectadas.slice(0, 15),
    anomaliasCategorias: anomalias.slice(0, 8),
    recorrentesSumidos: recorrentesSumidos.slice(0, 5).map(r => ({
      descricao: r.description,
      valor: Number(r.amount || 0),
      tipo: r.type,
      frequencia: r.recurrence_frequency,
    })),
    gastosPorCategoriaMes,
  };
}

// ── Chama IA via Vercel Function ──────────────────────────────────────────
export async function analisarAnomalias(dados, onChunk, onDone) {
  const fmt = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const prompt = `Você é o FinZen AI, especialista em finanças pessoais brasileiras.
Analise os dados abaixo e identifique anomalias, gastos suspeitos e assinaturas fantasmas.

## Período analisado: ${dados.mesesAnalisados} meses (até ${dados.mesAtual})
Total de transações analisadas: ${dados.totalTransacoes}

## Assinaturas/Recorrências detectadas no cartão
${dados.assinaturasDetectadas.length
  ? dados.assinaturasDetectadas.map(a =>
      `- ${a.descricao} (${a.categoria}): ${fmt(a.valor)}/mês · ativo há ${a.mesesAtivo} mês(es)`
    ).join('\n')
  : '- Nenhuma assinatura recorrente detectada no cartão'}

## Anomalias por categoria (variação vs média histórica)
${dados.anomaliasCategorias.length
  ? dados.anomaliasCategorias.map(a =>
      `- ${a.categoria}: ${fmt(a.valorAtual)} este mês vs média de ${fmt(a.mediaHistorica)} (${a.variacaoPercent > 0 ? '+' : ''}${a.variacaoPercent.toFixed(0)}%)`
    ).join('\n')
  : '- Nenhuma variação anômala detectada'}

## Recorrentes cadastrados que não apareceram este mês
${dados.recorrentesSumidos.length
  ? dados.recorrentesSumidos.map(r =>
      `- ${r.descricao}: ${fmt(r.valor)} (${r.frequencia})`
    ).join('\n')
  : '- Todos os recorrentes apareceram normalmente'}

## Sua tarefa

Gere uma análise em **3 seções**, em português brasileiro, direta e acionável:

### 👻 Assinaturas Fantasmas
Identifique assinaturas que o usuário pode ter esquecido ou que parecem desnecessárias. Seja específico: mencione nome, valor e quantos meses está ativo. Se nenhuma suspeita, diga que está tudo sob controle.

### 📊 Anomalias de Gastos
Explique as variações mais relevantes nas categorias. Diga se é preocupante ou esperado. Use valores reais em R$.

### ✅ Ações Recomendadas
Liste de 2 a 3 ações concretas: cancelar X, revisar Y, investigar Z. Seja específico com nomes e valores.

Tom: direto, sem alarmismo desnecessário. Foque no que realmente merece atenção.`;

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
