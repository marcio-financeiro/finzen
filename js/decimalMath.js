/**
 * decimalMath.js — Matemática financeira precisa para o FinZen
 *
 * JavaScript usa float de 64 bits, que não representa decimais exatamente:
 * 0.1 + 0.2 === 0.30000000000000004
 *
 * Em cálculos isolados isso não importa (a exibição já corta para 2 casas).
 * O risco real é em CÁLCULOS ENCADEADOS — balanceamento, rebalanceamento de
 * carteira, conversão de moeda multiplicada por quantidade — onde o erro
 * de ponto flutuante se acumula a cada operação e pode resultar em
 * sugestões de compra erradas por alguns centavos a alguns reais.
 *
 * Esta camada usa Decimal.js (carregado via CDN no HTML) para os cálculos
 * financeiros que envolvem MÚLTIPLAS operações em sequência. Cálculos
 * simples de exibição continuam usando Number nativo — não há necessidade
 * de trocar tudo, só os pontos de risco real.
 *
 * Uso:
 *   import { D, somaSegura, multSegura, diferencaSegura } from './decimalMath.js';
 */

// Decimal.js é carregado via <script> no HTML antes deste módulo.
// Fallback gracioso: se não carregar (ex: sem internet), cai para Number nativo.
const DecimalLib = (typeof window !== 'undefined' && window.Decimal) ? window.Decimal : null;

/**
 * Cria um Decimal a partir de um número ou string.
 * Se Decimal.js não estiver disponível, retorna um wrapper compatível
 * que opera com Number nativo (degradação graciosa).
 */
export function D(value) {
  const n = Number(value) || 0;
  if (DecimalLib) return new DecimalLib(n);

  // Fallback: objeto com a mesma interface mínima usada neste arquivo
  return {
    _v: n,
    plus(o)  { return D(this._v + toNum(o)); },
    minus(o) { return D(this._v - toNum(o)); },
    times(o) { return D(this._v * toNum(o)); },
    div(o)   { return D(toNum(o) === 0 ? 0 : this._v / toNum(o)); },
    toNumber() { return this._v; },
  };
}

function toNum(o) {
  return (o && typeof o.toNumber === 'function') ? o.toNumber() : Number(o) || 0;
}

/**
 * Soma uma lista de valores com precisão decimal.
 * Substitui: array.reduce((s,x) => s + x, 0)
 */
export function somaSegura(valores) {
  return valores.reduce((acc, v) => acc.plus(v), D(0)).toNumber();
}

/**
 * Multiplica dois valores com precisão decimal.
 * Substitui: a * b
 */
export function multSegura(a, b) {
  return D(a).times(b).toNumber();
}

/**
 * Diferença entre dois valores com precisão decimal.
 * Substitui: a - b
 */
export function diferencaSegura(a, b) {
  return D(a).minus(b).toNumber();
}

/**
 * Divisão segura — protege contra divisão por zero.
 * Substitui: a / b
 */
export function divSegura(a, b) {
  if (Number(b) === 0) return 0;
  return D(a).div(b).toNumber();
}

/**
 * Calcula percentual de um valor sobre um total, com precisão decimal.
 * Ex: percentualDe(150, 1000) → 15 (15%)
 */
export function percentualDe(valor, total) {
  if (Number(total) === 0) return 0;
  return D(valor).div(total).times(100).toNumber();
}

/**
 * Calcula o valor correspondente a um percentual de um total.
 * Ex: valorDoPercentual(15, 1000) → 150
 */
export function valorDoPercentual(percentual, total) {
  return D(total).times(percentual).div(100).toNumber();
}
