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
  ] = await Promise.all([
    supabase.from('accounts')
      .select('nome,saldo_atual,currency')
      .eq('user_id', userId).eq('active', true),

    supabase.from('transactions')
      .select('type,amount,status,date,categories:category_id(nome)')
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
  };
}

// ── Chama Claude AI via Vercel Function (sem CORS) ───────────────────────
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
    .replace(/^### (.+)$/gm, '<h4 class="cfai-h4">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul class="cfai-ul">${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p class="cfai-p">')
    .replace(/\n/g, '<br>')
    .replace(/^(?!<)(.+)/, '<p class="cfai-p">$1');
}
