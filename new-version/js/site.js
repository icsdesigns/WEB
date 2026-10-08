/* ============================================================
   SILAB 3D · Comportamiento común de la cabecera y el menú móvil.
   Las páginas que aún no se han rediseñado mantienen su propio
   script en línea; las nuevas cargan este archivo.
   ============================================================ */
(function () {
  var header = document.getElementById('navbar');
  var toggle = document.getElementById('hamburgerMenu');
  var menu = document.getElementById('mobileMenu');
  var overlay = document.getElementById('menuOverlay');

  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 20); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* «Contacto» lleva a la franja de contacto de la propia página si la tiene,
     y se resalta mientras esa franja está en pantalla. */
  var contacto = document.getElementById('contacto');
  var enlacesContacto = document.querySelectorAll('.site-nav__link[href="/#contacto"], .site-menu__link[href="/#contacto"]');
  if (contacto && enlacesContacto.length) {
    enlacesContacto.forEach(function (a) { a.setAttribute('href', '#contacto'); });
    var actual = document.querySelectorAll('.site-nav__link[aria-current="page"]');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var dentro = entries[0].isIntersecting;
        enlacesContacto.forEach(function (a) { a.classList.toggle('is-section', dentro); });
        actual.forEach(function (a) { a.classList.toggle('is-dimmed', dentro); });
      }, { rootMargin: '-45% 0px -45% 0px' }).observe(contacto);
    }
  }

  if (!toggle || !menu) return;

  function setOpen(open) {
    menu.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    if (overlay) overlay.classList.toggle('show', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  toggle.addEventListener('click', function () { setOpen(!menu.classList.contains('open')); });
  if (overlay) overlay.addEventListener('click', function () { setOpen(false); });
  menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) { setOpen(false); toggle.focus(); }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) { if (e.matches) setOpen(false); });
})();
