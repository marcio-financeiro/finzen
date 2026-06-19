/**
 * eventBus.js — Sistema central de ações para o FinZen
 *
 * Problema que resolve: HTML gerado dinamicamente (innerHTML) usa
 * onclick="window.algumaFuncao()" para funcionar. Isso obriga cada módulo
 * a "pendurar" funções no objeto window global. Com 5+ módulos fazendo
 * isso, dois podem por acidente usar o mesmo nome de função e um
 * sobrescreve o outro silenciosamente — bug muito difícil de rastrear.
 *
 * Solução: delegação de eventos. Em vez de:
 *   <button onclick="window.abrirModal()">
 * usa-se:
 *   <button data-action="abrirModal">
 *
 * Um único listener no documento captura o clique, lê o data-action,
 * e dispara a função registrada — sem nunca tocar no window.
 *
 * Também suporta input e change (ex: campos numéricos que recalculam
 * em tempo real, selects, checkboxes):
 *   <input data-action-input="simular">
 *   <select data-action-change="toggleProduto">
 *
 * Uso em qualquer módulo:
 *   import { registrarAcao } from './eventBus.js';
 *   registrarAcao('abrirModal', () => { ... });
 *   registrarAcao('excluirItem', (el) => { const id = el.dataset.id; ... });
 *
 * No HTML gerado:
 *   <button data-action="excluirItem" data-id="${item.id}">Excluir</button>
 *
 * Múltiplos data-attributes funcionam normalmente — a função recebe o
 * elemento clicado e pode ler qualquer data-* dele.
 */

const _acoes = new Map();
let _inicializado = false;

/**
 * Registra uma ação pelo nome. Se o nome já existir, avisa no console
 * (em vez de sobrescrever silenciosamente como acontecia com window.*).
 */
export function registrarAcao(nome, handler) {
  if (_acoes.has(nome)) {
    console.warn(`[eventBus] Ação "${nome}" já registrada — sobrescrevendo. Verifique conflito de nomes entre módulos.`);
  }
  _acoes.set(nome, handler);
}

/**
 * Remove uma ação registrada (útil ao trocar de página em SPA-like flows).
 */
export function removerAcao(nome) {
  _acoes.delete(nome);
}

function disparar(attr, evento) {
  const el = evento.target.closest(`[${attr}]`);
  if (!el) return;

  const nome = el.getAttribute(attr);
  const handler = _acoes.get(nome);

  if (!handler) {
    console.warn(`[eventBus] Nenhuma ação registrada para "${nome}"`);
    return;
  }

  handler(el, evento);
}

/**
 * Inicializa os listeners globais. Chamado automaticamente na primeira
 * importação deste módulo — não precisa chamar manualmente.
 */
function init() {
  if (_inicializado) return;
  _inicializado = true;

  document.addEventListener('click',  (e) => disparar('data-action', e));
  document.addEventListener('input',  (e) => disparar('data-action-input', e));
  document.addEventListener('change', (e) => disparar('data-action-change', e));
}

init();
