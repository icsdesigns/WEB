/* ============================================================
   SILAB 3D · Carrusel de pedidos (portada › Opiniones)
   Muestra las últimas fotos del panel admin › Galería. Si no hay
   fotos, la caja se queda oculta. Avanza solo cada 4 s y se para
   al pasar el ratón, tocarlo o con «reducir movimiento».
   ============================================================ */
(function () {
  var caja = document.querySelector('[data-carrusel]');
  if (!caja) return;
  var pista = caja.querySelector('.carrusel__pista');
  var SB = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  fetch(SB.url + '/rest/v1/galeria?select=titulo,material,miniatura&visible=eq.true&order=orden.asc,creado.desc&limit=12', {
    headers: { apikey: SB.key, Authorization: 'Bearer ' + SB.key }
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (fotos) {
      if (!Array.isArray(fotos) || fotos.length < 3) return; // con menos de 3 fotos no luce: se queda oculto
      pista.innerHTML = fotos.map(function (f) {
        var pie = [f.titulo, f.material].filter(Boolean).join(' · ');
        return '<a class="carrusel__foto" href="/new-version/valoraciones/#trabajos">' +
          '<img src="' + esc(f.miniatura) + '" alt="' + esc(f.titulo || 'Pedido impreso en 3D por SILAB 3D') + '" width="640" height="640" loading="lazy" decoding="async">' +
          (pie ? '<span>' + esc(pie) + '</span>' : '') + '</a>';
      }).join('');
      caja.hidden = false;
      ajustar();
      window.addEventListener('resize', ajustar);
      iniciar();
    })
    .catch(function () {});

  // Si todas las fotos caben, se centran y las flechas sobran
  function ajustar() { caja.classList.toggle('is-cabe', pista.scrollWidth <= pista.clientWidth + 2); }
  function paso() { var f = pista.querySelector('.carrusel__foto'); return f ? f.getBoundingClientRect().width + 14 : 300; }
  function mover(d) {
    var fin = pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 4;
    if (d > 0 && fin) pista.scrollTo({ left: 0, behavior: 'smooth' });
    else pista.scrollBy({ left: d * paso(), behavior: 'smooth' });
  }
  function iniciar() {
    caja.querySelector('.carrusel__btn--ant').addEventListener('click', function () { mover(-1); });
    caja.querySelector('.carrusel__btn--sig').addEventListener('click', function () { mover(1); });
    // Sin avance automático con «reducir movimiento» ni en móvil (ahí se desliza con el dedo)
    if (window.matchMedia && (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 560px)').matches)) return;
    var parado = false, t = null;
    function parar() { parado = true; }
    caja.addEventListener('mouseenter', parar);
    caja.addEventListener('mouseleave', function () { parado = false; });
    caja.addEventListener('focusin', parar);
    caja.addEventListener('focusout', function (e) { if (!caja.contains(e.relatedTarget)) parado = false; });
    pista.addEventListener('touchstart', parar, { passive: true });
    // Solo avanza mientras el carrusel está a la vista
    var visible = false;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(caja);
    else visible = true;
    t = setInterval(function () { if (visible && !parado && !document.hidden && !caja.classList.contains('is-cabe')) mover(1); }, 4000);
  }
})();
