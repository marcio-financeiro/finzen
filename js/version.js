/**
 * FinZen — Controle Central de Versão de Assets
 *
 * Altere apenas o número abaixo quando houver atualização de JS ou CSS.
 * Todos os HTMLs carregam este arquivo primeiro e a versão é aplicada
 * automaticamente em todos os <link> e <script> da página.
 *
 * Como incrementar: 1101 → 1102 → 1103 ...
 */
const ASSET_VERSION = '1103';

(function () {
  // Aplica ?v= em todos os link[rel=stylesheet] e script[src] que apontam
  // para arquivos do próprio projeto (css/ ou js/)
  function aplicarVersao() {
    // CSS
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => {
      const href = el.getAttribute('href');
      if (!href || (!href.includes('/css/') && !href.includes('./css/'))) return;
      el.setAttribute('href', href.replace(/\?v=[^&]*/, '') + '?v=' + ASSET_VERSION);
    });

    // JS (somente os que ainda não foram carregados — altera o atributo src
    // antes do browser fazer o fetch; funciona pois este script é síncrono)
    document.querySelectorAll('script[src]').forEach(el => {
      const src = el.getAttribute('src');
      if (!src || (!src.includes('/js/') && !src.includes('./js/'))) return;
      if (src.includes('version.js')) return; // não mexe em si mesmo
      el.setAttribute('src', src.replace(/\?v=[^&]*/, '') + '?v=' + ASSET_VERSION);
    });
  }

  // Roda imediatamente (este script é síncrono e vai no <head> antes dos outros)
  aplicarVersao();
})();
