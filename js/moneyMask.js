import { toNumber } from './services/financeService.js';

export function attachMoneyMask(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    if (!digits) { input.value = ''; return; }
    const value = parseInt(digits, 10) / 100;
    input.value = value.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

export function readMoneyValue(input, fallback = 0) {
  return toNumber(input?.value, fallback);
}

export function setMoneyValue(input, value) {
  if (!input) return;
  const n = toNumber(value, 0);
  input.value = n === 0 ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
