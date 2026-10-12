/* ============================================================
   SILAB 3D · Widgets de Elfsight (reseñas de Google e Instagram)
   - Carga su script solo cuando un widget está cerca de la pantalla,
     para no ralentizar la carga de la página.
   - El sello «Free … Widget» no se toca: si se quita, Elfsight oculta
     el widget entero (comprobado el 28/09/2026). Se quita desde su panel.
   - Respaldo: si el widget no llega a pintarse (bloqueadores de anuncios,
     sin conexión con Elfsight…), el hueco se sustituye por un resumen
     propio en vez de quedarse en blanco. data-elfsight-lazy="reseñas"
     muestra la nota de Google; cualquier otro valor oculta el recuadro.
   ============================================================ */
(function () {
  var widgets = document.querySelectorAll('[data-elfsight-lazy]');
  if (!widgets.length) return;

  var ESPERA = 9000; // ms que se dan al widget para pintarse tras cargar el script

  function pintado(w) { return w.getBoundingClientRect().height > 100 && w.querySelector('[class*="elfsight-app"] *'); }

  function respaldo(w) {
    if (w.dataset.respaldo || pintado(w)) return;
    w.dataset.respaldo = '1';
    if (w.getAttribute('data-elfsight-lazy') === 'reseñas') {
      w.innerHTML =
        '<a class="elfsight-respaldo" href="https://g.page/r/CeOgqq_pEuu5EBM" target="_blank" rel="noopener">' +
          '<span class="elfsight-respaldo__nota">5,0</span>' +
          '<span class="elfsight-respaldo__meta">' +
            '<span class="elfsight-respaldo__estrellas" aria-hidden="true">★★★★★</span>' +
            '<span>27 opiniones en Google</span>' +
          '</span>' +
        '</a>';
    } else {
      w.hidden = true;
    }
  }

  /* ---------- Carga bajo demanda ---------- */
  var loaded = false;
  function load() {
    if (loaded || document.querySelector('script[src*="elfsightcdn.com/platform.js"]')) return;
    loaded = true;
    var s = document.createElement('script');
    s.src = 'https://elfsightcdn.com/platform.js';
    s.async = true;
    s.onerror = function () { widgets.forEach(respaldo); };
    s.onload = function () { setTimeout(function () { widgets.forEach(respaldo); }, ESPERA); };
    document.body.appendChild(s);
  }
  function vigilar() {
    widgets = [].filter.call(widgets, function (w) { return w.hasAttribute('data-elfsight-lazy'); });
    if (!widgets.length) return;
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { load(); io.disconnect(); }
    }, { rootMargin: '600px 0px' });
    widgets.forEach(function (w) { io.observe(w); });
  }
  /* Si la página tiene Instagram propio (js/instagram.js), primero se mira si hay fotos */
  if (window.silabInstagram) window.silabInstagram.then(vigilar, vigilar); else vigilar();
})();
