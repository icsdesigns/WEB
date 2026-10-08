/* ============================================================
   SILAB 3D · Analítica de tráfico
   Proveedor: Umami (sin cookies, cumple el RGPD sin banner de
   consentimiento, plan gratuito). Para activarla, crea el sitio en
   https://cloud.umami.is y pega aquí su «Website ID».
   Mientras el ID esté vacío no se carga nada ni se envía ningún dato.

   Además de las visitas, mide las acciones que importan al negocio:
   - contacto-whatsapp / contacto-email / contacto-instagram
   - presupuesto-clic (botones que llevan al configurador)
   - configurador-paso (paso 1 a 4 del formulario de presupuesto)
   - producto-solicitar (con el nombre del producto)
   - color-3d (color abierto en Materiales)
   - novedad-vista / novedad-clic (ventana de novedades)
   ============================================================ */
(function () {
  var CONFIG = {
    websiteId: '',                                   // ← pega aquí el Website ID de Umami
    script: 'https://cloud.umami.is/script.js',
    dominios: 'silab3d.com,www.silab3d.com'          // no cuenta las visitas en local
  };

  var cola = [];
  window.silabEvento = function (nombre, datos) {
    if (!CONFIG.websiteId) return;
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(nombre, datos || {});
    else cola.push([nombre, datos]);
  };
  if (!CONFIG.websiteId) return;

  var s = document.createElement('script');
  s.defer = true;
  s.src = CONFIG.script;
  s.setAttribute('data-website-id', CONFIG.websiteId);
  s.setAttribute('data-domains', CONFIG.dominios);
  s.onload = function () {
    cola.splice(0).forEach(function (e) { window.silabEvento(e[0], e[1]); });
  };
  document.head.appendChild(s);

  /* ---------- Clics en enlaces clave ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href], button');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var donde = location.pathname;
    if (/wa\.me|api\.whatsapp\.com/.test(href)) window.silabEvento('contacto-whatsapp', { pagina: donde });
    else if (/^mailto:|mail\.google\.com/.test(href)) window.silabEvento('contacto-email', { pagina: donde });
    else if (/instagram\.com|ig\.me/.test(href)) window.silabEvento('contacto-instagram', { pagina: donde });
    else if (/\/configura-tu-proyecto\//.test(href)) window.silabEvento('presupuesto-clic', { pagina: donde, texto: (a.textContent || '').trim().slice(0, 40) });
    else if (a.matches('.btn-comprar, .btn-action')) window.silabEvento('producto-solicitar', { producto: a.getAttribute('data-product') || '' });
    else if (a.matches('.color-card')) window.silabEvento('color-3d', { color: a.getAttribute('data-name') || '' });
  }, true);

  /* ---------- Pasos del configurador de presupuesto ---------- */
  var intentos = 0;
  (function engancharPasos() {
    if (typeof window.setStep === 'function' && !window.setStep.__silab) {
      var original = window.setStep;
      window.setStep = function (n) {
        window.silabEvento('configurador-paso', { paso: n });
        return original.apply(this, arguments);
      };
      window.setStep.__silab = true;
    } else if (intentos++ < 20 && /configura-tu-proyecto/.test(location.pathname)) {
      setTimeout(engancharPasos, 250);
    }
  })();
})();
