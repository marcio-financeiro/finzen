/**
 * Vyn — Controle Central de Versão de Assets
 *
 * Altere apenas o número abaixo quando houver atualização de JS ou CSS.
 * Todos os HTMLs carregam este arquivo primeiro e a versão é aplicada
 * automaticamente em todos os <link> e <script> da página.
 *
 * Como incrementar: 1201 → 1202 → 1203 ...
 */
const ASSET_VERSION = '1216';

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
})();
