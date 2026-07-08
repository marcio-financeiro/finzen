// api/recurring-cron.js — Gera lançamentos futuros de transações recorrentes
// Vercel Cron: executa uma vez por dia
// Para cada transação marcada como recorrente (is_recurring=true, recurrence_active=true,
// parent_transaction_id=null → é o "modelo"), garante que existam ocorrências pendentes
// geradas até 6 meses à frente (mesma janela máxima da Tendência de Gastos no Dashboard).
// Idempotente: sempre continua a partir da última data já existente no grupo, então rodar
// de novo no mesmo dia não duplica nada.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

const HORIZONTE_MESES = 6;

function hojeISO() {
  const d = new Date();
  d.setTime(d.getTime() - 3 * 60 * 60 * 1000); // UTC-3 → BRT
  return d.toISOString().split('T')[0];
}

function addDays(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonths(dateISO, months) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(d, last);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function addYears(dateISO, years) {
  return addMonths(dateISO, years * 12);
}

function nextDate(dateISO, frequency) {
  if (frequency === 'semanal') return addDays(dateISO, 7);
  if (frequency === 'anual') return addYears(dateISO, 1);
  return addMonths(dateISO, 1);
}

async function sbFetch(path, options = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders, ...options });
  if (!r.ok) throw new Error(`Supabase ${path} → ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function gerarOcorrencias() {
  const hoje = hojeISO();
  const horizonte = addMonths(hoje, HORIZONTE_MESES);

  const modelos = await sbFetch(
    'transactions?is_recurring=eq.true&recurrence_active=eq.true&parent_transaction_id=is.null' +
    '&select=id,user_id,account_id,category_id,type,amount,description,notes,date,recurrence_frequency,recurrence_until,recurrence_group_id'
  );

  const resultado = { modelos: modelos?.length || 0, geradas: 0, erros: [] };

  for (const modelo of modelos || []) {
    try {
      const groupId = modelo.recurrence_group_id || modelo.id;
      const frequencia = modelo.recurrence_frequency || 'mensal';
      const limite = modelo.recurrence_until && modelo.recurrence_until < horizonte
        ? modelo.recurrence_until
        : horizonte;

      const [ultima] = await sbFetch(
        `transactions?recurrence_group_id=eq.${groupId}&select=date&order=date.desc&limit=1`
      );
      let cursor = ultima?.date || modelo.date;

      const novas = [];
      let guard = 0;
      let next = nextDate(cursor, frequencia);
      while (next <= limite && guard < 60) {
        guard++;
        novas.push({
          user_id: modelo.user_id,
          account_id: modelo.account_id,
          category_id: modelo.category_id,
          type: modelo.type,
          amount: modelo.amount,
          description: modelo.description,
          notes: modelo.notes,
          date: next,
          status: 'pendente',
          is_recurring: false,
          recurrence_group_id: groupId,
          parent_transaction_id: modelo.id,
        });
        next = nextDate(next, frequencia);
      }

      if (novas.length) {
        await sbFetch('transactions', { method: 'POST', body: JSON.stringify(novas) });
        resultado.geradas += novas.length;
      }
    } catch (e) {
      resultado.erros.push({ modeloId: modelo.id, descricao: modelo.description, erro: e.message });
    }
  }

  return resultado;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const resultado = await gerarOcorrencias();
    res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    console.error('recurring-cron:', e.message);
    res.status(200).json({ ok: true, fatal: e.message });
  }
}
