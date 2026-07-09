/**
 * dateUtils.js — Datas no fuso LOCAL (Brasil).
 * Nunca usar toISOString() para "hoje": em UTC o dia vira às 21h no Brasil.
 */

/** Data de hoje em YYYY-MM-DD no fuso local. */
export function hojeISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** YYYY-MM-DD → DD/MM/YYYY. */
export function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}
