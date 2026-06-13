export function formatCurrency(value, currency = 'BRL'){
  return Number(value || 0).toLocaleString(
    'pt-BR',
    { style:'currency', currency }
  );
}
