/**
 * motion.js — Contagem animada e entrada escalonada, reaproveitadas em todas
 * as páginas com KPIs (mesmo padrão criado originalmente para o dashboard).
 * Sempre respeita prefers-reduced-motion.
 */

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Anima um número de 0 até o valor final (curva ease-out, ~650ms).
 * `formatar` recebe o valor intermediário e devolve o texto a exibir
 * (normalmente formatCurrency). Se o sistema pedir menos movimento,
 * mostra o valor final direto, sem animação.
 */
export function animarValor(elx, valorFinal, formatar){
  if(!elx) return;
  if(reduceMotion){ elx.innerText = formatar(valorFinal); return; }
  const dur = 650;
  let start = null;
  function passo(ts){
    if(start === null) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    elx.innerText = formatar(valorFinal * eased);
    if(p < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

/**
 * Aplica um atraso escalonado nos elementos que casam com `seletor`
 * (em ordem de documento), reaproveitando a animação fadeInUp que cada
 * um já tem via CSS — só distribui a entrada em sequência visual.
 */
export function aplicarEntradaEscalonada(seletor){
  if(reduceMotion) return;
  document.querySelectorAll(seletor).forEach((elx, i) => {
    elx.style.animationDelay = `${Math.min(i * 35, 320)}ms`;
  });
}
