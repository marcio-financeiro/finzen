/**
 * dateUtils.js — Datas no fuso LOCAL (Brasil).
 * Nunca usar toISOString() para "hoje": em UTC o dia vira às 21h no Brasil.
 */

/** Qualquer Date em YYYY-MM-DD no fuso local (nunca usar toISOString() p/ isso). */
export function dataLocalISO(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Data de hoje em YYYY-MM-DD no fuso local. */
export function hojeISO(){
  return dataLocalISO(new Date());
}

/** YYYY-MM-DD → DD/MM/YYYY. */
export function formatarData(dataISO){
  if(!dataISO) return '-';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}
