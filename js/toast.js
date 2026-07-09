/**
 * toast.js — Notificação flutuante global (sucesso/erro/aviso).
 * Substitui o feedback via .message inline, que ficava fora da viewport
 * após submit em páginas longas.
 */

let container = null;

function ensureContainer(){
  if(container) return container;
  container = document.createElement('div');
  container.id = 'fz-toasts';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(92vw,420px)';
  document.body.appendChild(container);
  return container;
}

const CORES = {
  success:'var(--success, #3f8f63)',
  danger:'var(--danger, #cf6a55)',
  warning:'var(--warning, #c08a3e)',
  info:'var(--info, #3b82f6)',
};

export function toast(texto, tipo = 'success', ms = 3200){
  const wrap = ensureContainer();
  const el = document.createElement('div');
  el.style.cssText = `background:var(--surface,#12151c);color:var(--text,#e8e4d8);border:1px solid var(--border,#232732);border-left:3px solid ${CORES[tipo]||CORES.info};border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:100%;opacity:0;transition:opacity .2s ease,transform .2s ease;transform:translateY(6px)`;
  el.textContent = texto;
  wrap.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, ms);
}

/**
 * Envolve um handler de clique de botão de salvar: desabilita o botão
 * durante o await (evita duplo clique = lançamento duplicado).
 */
export function comTrava(btn, fn){
  return async (...args) => {
    if(btn?.disabled) return;
    if(btn) btn.disabled = true;
    try{ return await fn(...args); }
    finally{ if(btn) btn.disabled = false; }
  };
}
