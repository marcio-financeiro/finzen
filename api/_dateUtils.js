// api/_dateUtils.js — helpers de data para os crons de resumo por e-mail.
// Arquivos com _ no início não viram endpoint na Vercel.
// Usa fuso America/Sao_Paulo de verdade (Intl), não offset fixo -3h —
// mesmo padrão robusto já usado em api/_aiRateLimit.js.

export function hojeSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function addDays(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Janela de N dias corridos terminando em fimISO (inclusive nos dois extremos).
export function ultimosNDias(fimISO, n) {
  return { inicio: addDays(fimISO, -(n - 1)), fim: fimISO };
}

export function ehUltimoDiaDoMes(dateISO) {
  return addDays(dateISO, 1).endsWith('-01');
}

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export function mesRefLabel(ym) {
  const [ano, mes] = ym.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

export function fmtDataBR(dateISO) {
  const [y, m, d] = dateISO.split('-');
  return `${d}/${m}/${y}`;
}
