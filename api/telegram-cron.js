// api/telegram-cron.js — Lembretes de eventos via Telegram
// Vercel Cron: executa uma vez por dia às 11h UTC (08h BRT)
// Envia todos os eventos do dia atual

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

function hoje() {
  const d = new Date();
  d.setTime(d.getTime() - 3 * 60 * 60 * 1000); // UTC-3 → BRT
  return d.toISOString().split('T')[0];
}

function formatarData(dateStr) {
  const [ano, mes, dia] = dateStr.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${dia}/${meses[parseInt(mes) - 1]}/${ano}`;
}

function emojiTipo(tipo) {
  if (tipo === 'saude')       return '🏥';
  if (tipo === 'financeiro')  return '💰';
  if (tipo === 'compromisso') return '🎯';
  if (tipo === 'tarefa')      return '📋';
  if (tipo === 'offshore')    return '⚓';
  if (tipo === 'manutencao')  return '🔧';
  if (tipo === 'documento')   return '📄';
  return '📅';
}

async function getChatId(userId) {
  const r = await fetch(
    `${SB_URL}/rest/v1/telegram_links?user_id=eq.${userId}&select=chat_id`,
    { headers: sbHeaders }
  );
  const data = await r.json();
  return data[0]?.chat_id || null;
}

async function enviar(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
  });
}

async function lembretesDiarios() {
  const data = hoje();
  const r = await fetch(
    `${SB_URL}/rest/v1/calendar_events?data_inicio=eq.${data}&status=eq.pendente&order=hora.asc&select=user_id,titulo,hora,tipo`,
    { headers: sbHeaders }
  );
  const eventos = await r.json();
  if (!Array.isArray(eventos) || !eventos.length) return;

  // Agrupar por usuário
  const porUsuario = {};
  for (const e of eventos) {
    (porUsuario[e.user_id] = porUsuario[e.user_id] || []).push(e);
  }

  for (const [userId, evts] of Object.entries(porUsuario)) {
    const chatId = await getChatId(userId);
    if (!chatId) continue;

    const lista = evts.map(e => {
      const hora = e.hora ? ` às ${e.hora}` : '';
      return `${emojiTipo(e.tipo)} ${e.titulo}${hora}`;
    }).join('\n');

    await enviar(chatId,
      `📅 <b>Sua agenda de hoje (${formatarData(data)})</b>\n\n${lista}`
    );
  }
}

// ── Radar financeiro: fatura × limite + orçamento em risco ──────────────────
function refMes(dataISO) { return dataISO.slice(0, 7); }
const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function radarFinanceiro() {
  const dataHoje = hoje();
  const ref = refMes(dataHoje);
  const diaAtual = Number(dataHoje.slice(8, 10));
  const [ano, mes] = ref.split('-').map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();

  const [rCartoes, rParcelas, rBudgets, rTx] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/credit_cards?ativo=eq.true&limite=gt.0&select=id,user_id,nome,limite`, { headers: sbHeaders }),
    fetch(`${SB_URL}/rest/v1/card_transactions?status=in.(aberta,pendente)&fatura_referencia=eq.${ref}&select=user_id,card_id,valor_parcela`, { headers: sbHeaders }),
    fetch(`${SB_URL}/rest/v1/budgets?mes_referencia=eq.${ref}&select=user_id,valor_planejado,category_id,categories:category_id(nome,icon)`, { headers: sbHeaders }),
    fetch(`${SB_URL}/rest/v1/transactions?type=eq.despesa&status=eq.pago&date=gte.${ref}-01&date=lte.${dataHoje}&select=user_id,category_id,amount`, { headers: sbHeaders }),
  ]);
  const [cartoes, parcelas, budgets, despesas] = await Promise.all(
    [rCartoes, rParcelas, rBudgets, rTx].map(r => r.json())
  );
  if (![cartoes, parcelas, budgets, despesas].every(Array.isArray)) return;

  const alertasPorUsuario = {};
  const add = (userId, texto) => (alertasPorUsuario[userId] = alertasPorUsuario[userId] || []).push(texto);

  // Fatura acima de 80% do limite
  for (const c of cartoes) {
    const usado = parcelas.filter(p => p.card_id === c.id)
      .reduce((s, p) => s + Number(p.valor_parcela || 0), 0);
    const pct = c.limite > 0 ? usado / c.limite * 100 : 0;
    if (pct >= 80) {
      add(c.user_id, `💳 <b>${c.nome}</b>: fatura em R$ ${fmtBRL(usado)} — ${pct.toFixed(0)}% do limite`);
    }
  }

  // Orçamento no ritmo de estourar (projeção linear do gasto até aqui)
  if (diaAtual >= 8) { // projeção só faz sentido com alguns dias de mês
    for (const b of budgets) {
      const planejado = Number(b.valor_planejado || 0);
      if (planejado <= 0) continue;
      const gasto = despesas
        .filter(d => d.user_id === b.user_id && d.category_id === b.category_id)
        .reduce((s, d) => s + Number(d.amount || 0), 0);
      const projetado = gasto / diaAtual * diasNoMes;
      if (gasto < planejado && projetado > planejado * 1.05) {
        const nome = b.categories?.nome || 'Categoria';
        add(b.user_id, `📊 <b>${nome}</b>: no ritmo atual fecha o mês em R$ ${fmtBRL(projetado)} (planejado R$ ${fmtBRL(planejado)})`);
      }
    }
  }

  for (const [userId, alertas] of Object.entries(alertasPorUsuario)) {
    const chatId = await getChatId(userId);
    if (!chatId) continue;
    await enviar(chatId, `🎯 <b>Radar financeiro</b>\n\n${alertas.join('\n')}`);
  }
}

// ── Resumo mensal (dia 1º): fechamento do mês anterior ──────────────────────
async function resumoMensal() {
  const dataHoje = hoje();
  if (Number(dataHoje.slice(8, 10)) !== 1) return;

  const [ano, mes] = dataHoje.slice(0, 7).split('-').map(Number);
  const ant = new Date(ano, mes - 2, 1);
  const refAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}`;
  const fimAnt = new Date(ant.getFullYear(), ant.getMonth() + 1, 0).getDate();

  const r = await fetch(
    `${SB_URL}/rest/v1/transactions?status=eq.pago&date=gte.${refAnt}-01&date=lte.${refAnt}-${String(fimAnt).padStart(2, '0')}&select=user_id,type,amount,categories:category_id(nome,icon)`,
    { headers: sbHeaders }
  );
  const txs = await r.json();
  if (!Array.isArray(txs) || !txs.length) return;

  const porUsuario = {};
  for (const t of txs) (porUsuario[t.user_id] = porUsuario[t.user_id] || []).push(t);

  const nomeMes = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][ant.getMonth()];

  for (const [userId, lista] of Object.entries(porUsuario)) {
    const chatId = await getChatId(userId);
    if (!chatId) continue;

    const receitas = lista.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.amount || 0), 0);
    const despesas = lista.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.amount || 0), 0);
    const resultado = receitas - despesas;

    const porCat = {};
    lista.filter(t => t.type === 'despesa').forEach(t => {
      const nome = t.categories?.nome || 'Sem categoria';
      porCat[nome] = (porCat[nome] || 0) + Number(t.amount || 0);
    });
    const top3 = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([nome, v], i) => `${i + 1}º ${nome} — R$ ${fmtBRL(v)}`).join('\n');

    await enviar(chatId,
      `📆 <b>Fechamento de ${nomeMes}</b>\n\n` +
      `💰 Receitas: R$ ${fmtBRL(receitas)}\n` +
      `💸 Despesas: R$ ${fmtBRL(despesas)}\n` +
      `${resultado >= 0 ? '✅' : '🔴'} Resultado: R$ ${fmtBRL(resultado)}\n\n` +
      (top3 ? `<b>Maiores gastos:</b>\n${top3}` : '')
    );
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Cada bloco é independente — falha em um não derruba os demais
    await lembretesDiarios().catch(e => console.error('lembretes:', e.message));
    await radarFinanceiro().catch(e => console.error('radar:', e.message));
    await resumoMensal().catch(e => console.error('resumo:', e.message));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram-cron:', e.message);
    res.status(200).json({ ok: true });
  }
}
