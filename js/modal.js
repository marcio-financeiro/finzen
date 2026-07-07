/**
 * Modal padrão do app — substitui implementações bespoke de overlay/modal
 * espalhadas em cada página (Fase 2 sub-fase 4). Usa as classes .fz-modal-*
 * (css/components.css). Generaliza o padrão já usado em confirmModal.js.
 */

let seq = 0;

function closeModal(overlay, resolve, value){
  overlay.remove();
  if(resolve) resolve(value);
}

/**
 * Modal de escolha (título + mensagem + botões de ação).
 * Retorna Promise<string|null> com o value da opção escolhida, ou null se cancelado/fechado.
 */
export function showChoice({ title, message, options = [], narrow = true }){
  return new Promise(resolve => {
    const id = `fz-modal-${++seq}`;
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'fz-modal-overlay';
    overlay.innerHTML = `
      <div class="fz-modal-box${narrow ? ' fz-modal-narrow' : ''}">
        <div class="fz-modal-header">
          <div><h2>${title}</h2>${message ? `<p>${message}</p>` : ''}</div>
        </div>
        <div class="fz-modal-actions">
          ${options.map(o => `
            <button type="button" class="btn ${o.danger ? 'btn-danger' : o.primary ? 'btn-primary' : 'btn-secondary'}"
              data-choice="${o.value}">${o.label}</button>
          `).join('')}
          <button type="button" class="btn btn-secondary" data-choice="cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-choice');
        closeModal(overlay, resolve, v === 'cancel' ? null : v);
      });
    });
    overlay.addEventListener('click', e => {
      if(e.target === overlay) closeModal(overlay, resolve, null);
    });
    document.addEventListener('keydown', function esc(e){
      if(e.key === 'Escape'){ closeModal(overlay, resolve, null); document.removeEventListener('keydown', esc); }
    });
  });
}

/**
 * Modal de detalhe (título + subtítulo + lista de itens + total). Sem Promise —
 * é só exibição, fecha no X ou clique fora. Retorna a função de fechar.
 */
export function showDetail({ title, subtitle, items = [], total, totalClass = '', formatTotal }){
  const id = `fz-modal-${++seq}`;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'fz-modal-overlay';
  const empty = !items || !items.length;

  overlay.innerHTML = `
    <div class="fz-modal-box">
      <div class="fz-modal-header">
        <div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
        <button type="button" class="fz-modal-close" aria-label="Fechar">×</button>
      </div>
      <div class="fz-modal-body">
        ${empty ? '<p class="muted" style="padding:10px">Nenhum item encontrado.</p>'
          : items.map(item => `
            <div class="fz-modal-item">
              <div>
                <strong>${item.title}</strong>
                <span>${item.subtitle || ''}</span>
              </div>
              <strong class="money ${item.valueClass || ''}">${item.valueText}</strong>
            </div>
          `).join('')}
      </div>
      ${total !== undefined ? `
        <div class="fz-modal-total">
          <span>Total</span>
          <span class="money ${totalClass}">${formatTotal ? formatTotal(total) : total}</span>
        </div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.fz-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  return close;
}
