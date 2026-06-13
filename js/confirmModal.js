/**
 * Substitui confirm() nativo por modal visual.
 * Uso: await confirmarExclusao('Excluir conta "Nubank"?', 'warning')
 * Retorna Promise<boolean>
 */
export function confirmarExclusao(mensagem, subtexto = ''){
  return new Promise(resolve => {
    // Remover modal anterior se existir
    document.getElementById('finzen-confirm-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'finzen-confirm-modal';
    modal.innerHTML = `
      <div class="fcm-backdrop"></div>
      <div class="fcm-box" role="dialog" aria-modal="true">
        <div class="fcm-icon">🗑️</div>
        <p class="fcm-msg">${mensagem}</p>
        ${subtexto ? `<p class="fcm-sub">${subtexto}</p>` : ''}
        <div class="fcm-actions">
          <button class="btn btn-secondary" id="fcm-cancelar">Cancelar</button>
          <button class="btn btn-danger" id="fcm-confirmar">Excluir</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #finzen-confirm-modal .fcm-backdrop{
        position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;
        animation:fcmFadeIn .15s ease;
      }
      #finzen-confirm-modal .fcm-box{
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        z-index:9999;background:var(--surface,#1a1d2e);border:1px solid var(--border,#2a2d3e);
        border-radius:18px;padding:28px 24px;max-width:360px;width:90%;
        box-shadow:0 16px 48px rgba(0,0,0,.45);
        animation:fcmSlideIn .18s ease;
        text-align:center;
      }
      #finzen-confirm-modal .fcm-icon{ font-size:36px;margin-bottom:12px; }
      #finzen-confirm-modal .fcm-msg{
        font-weight:700;font-size:15px;margin:0 0 6px;color:var(--text,#e2e4f0);
      }
      #finzen-confirm-modal .fcm-sub{
        font-size:12px;color:var(--muted,#8b90a8);margin:0 0 20px;line-height:1.5;
      }
      #finzen-confirm-modal .fcm-actions{
        display:flex;gap:10px;justify-content:center;margin-top:20px;
      }
      @keyframes fcmFadeIn{ from{opacity:0} to{opacity:1} }
      @keyframes fcmSlideIn{ from{opacity:0;transform:translate(-50%,-46%)} to{opacity:1;transform:translate(-50%,-50%)} }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    function fechar(resultado){
      modal.remove();
      style.remove();
      resolve(resultado);
    }

    document.getElementById('fcm-confirmar').addEventListener('click', () => fechar(true));
    document.getElementById('fcm-cancelar').addEventListener('click',  () => fechar(false));
    modal.querySelector('.fcm-backdrop').addEventListener('click',      () => fechar(false));

    document.addEventListener('keydown', function esc(e){
      if(e.key === 'Escape'){ fechar(false); document.removeEventListener('keydown', esc); }
    });
  });
}
