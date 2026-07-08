/**
 * Vyn — Controle Central de Versão de Assets
 *
 * Altere apenas o número abaixo quando houver atualização de JS ou CSS.
 * Todos os HTMLs carregam este arquivo primeiro e a versão é aplicada
 * automaticamente em todos os <link> e <script> da página.
 *
 * Como incrementar: 1201 → 1202 → 1203 ...
 */
const ASSET_VERSION = '1218';

(function () {
  // Aplica ?v= em todos os link[rel=stylesheet] e script[src] que apontam
  // para arquivos do próprio projeto (css/ ou js/)
  function aplicarVersao() {
    // CSS — muda href para forçar re-fetch com versão atual
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => {
      const href = el.getAttribute('href');
      if (!href || (!href.includes('/css/') && !href.includes('./css/'))) return;
      el.setAttribute('href', href.replace(/\?v=[^&]*/, '') + '?v=' + ASSET_VERSION);
    });
    // JS: não versionado aqui — servidor já serve com Cache-Control: no-store
  }

  // Roda imediatamente (este script é síncrono e vai no <head> antes dos outros)
  aplicarVersao();

  // Bloqueia pinch-zoom (gesturestart/change/end são eventos proprietários do
  // WebKit — só assim dá pra impedir o zoom de página inteira no Safari iOS,
  // que ignora touch-action/user-scalable por acessibilidade) e double-tap-zoom.
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });

  let ultimoToque = 0;
  document.addEventListener('touchend', e => {
    const agora = Date.now();
    if (agora - ultimoToque <= 300) e.preventDefault();
    ultimoToque = agora;
  }, { passive: false });
})();
