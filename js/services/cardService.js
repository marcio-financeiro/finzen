/**
 * cardService.js — Lógica compartilhada de faturas de cartão.
 * Fonte única do cálculo de referência de fatura: antes existiam duas
 * implementações divergentes (movements.js considerava vencimento < fechamento,
 * cardPurchases.js não), fazendo a mesma compra cair em faturas diferentes
 * dependendo da tela usada.
 */

/** Referência (YYYY-MM) da fatura de uma compra.
 *  Compra após o dia de fechamento → próxima fatura.
 *  Vencimento antes do fechamento → fatura vence no mês seguinte. */
export function invoiceRef(dateISO, closingDay, dueDay){
  const [y,m,d] = dateISO.split('-').map(Number);
  let date = new Date(y, m-1, 1);
  if(d > Number(closingDay || 1)){
    date = new Date(y, m, 1);
  }
  if(dueDay && Number(dueDay) < Number(closingDay)){
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

/** Soma N meses a uma referência YYYY-MM. */
export function addMonthsRef(ref, months){
  const [y,m] = ref.split('-').map(Number);
  const date = new Date(y, m-1+months, 1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

/** Nome legível de uma referência ("julho de 2026"). */
export function refName(ref){
  if(!ref) return '-';
  const [y,m] = ref.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
}

/** Referência do mês atual (YYYY-MM), no fuso local. */
export function currentMonthRef(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

/** UUID para agrupar parcelas da mesma compra (purchase_group_id). */
export function novoGrupoCompra(){
  return crypto?.randomUUID ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

/**
 * Insere as parcelas de uma compra. Se a coluna purchase_group_id ainda não
 * existir no banco (migration 2026_07_09_purchase_group_id.sql não aplicada),
 * repete o insert sem o campo — nada quebra antes da migration.
 */
export async function inserirParcelasCartao(supabase, registros){
  let { error } = await supabase.from('card_transactions').insert(registros);
  if(error && (error.code === 'PGRST204' || /purchase_group_id/i.test(error.message || ''))){
    const semGrupo = registros.map(({ purchase_group_id, ...resto }) => resto);
    ({ error } = await supabase.from('card_transactions').insert(semGrupo));
  }
  return { error };
}
