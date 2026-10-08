/* ============================================================
   SILAB 3D · Home
   - Muestras de color leídas de data/filamentos.json (se actualiza
     solo con la sincronización de GitHub).
   - Reseñas de Google (Elfsight) cargadas solo al acercarse a la sección.
   - Las tarjetas de categoría abren /productos/ con su filtro.
   ============================================================ */
(function () {
  /* ---------- Filtro de categoría al ir a /productos/ ---------- */
  document.querySelectorAll('[data-filter]').forEach(function (card) {
    card.addEventListener('click', function () {
      try { sessionStorage.setItem('filterCategory', card.getAttribute('data-filter')); } catch (e) {}
    });
  });

  /* ---------- Número de colores disponibles en cada material ---------- */
  // Supabase en vivo, con data/filamentos.json como respaldo (js/filamentos.js)
  if (window.SILAB_FILAMENTOS) {
    window.SILAB_FILAMENTOS.load().then(function (d) {
      ['pla', 'petg'].forEach(function (m) {
        var el = document.querySelector('[data-colores="' + m + '"]');
        var n = (d[m] || []).length;
        if (el && n) el.textContent = 'Ver ' + (n === 1 ? 'su color' : 'sus ' + n + ' colores');
      });
    });
  }

  /* Las reseñas de Google (Elfsight) las carga js/elfsight.js */
})();
