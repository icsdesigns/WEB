/* ============================================================
   SILAB 3D · Últimas publicaciones de Instagram (sin widgets)
   Lee data/instagram.json, que genera cada semana la acción
   «Instagram» (scripts/instagram.mjs) con las fotos ya guardadas
   en /img/instagram/. Mientras ese archivo no tenga publicaciones,
   se deja el widget de Elfsight que haya en la caja.
     data-instagram="9" → cuántas publicaciones se muestran
   ============================================================ */
(function () {
  var cajas = document.querySelectorAll('[data-instagram]');
  if (!cajas.length) { if (window.silabGaleria) window.silabInstagram = window.silabGaleria; return; }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function url(u) { return /^https:\/\//i.test(String(u || '')) ? esc(u) : '#'; }   // solo enlaces https

  /* js/elfsight.js espera a esta promesa: true = hay fotos propias y Elfsight no se carga */
  /* La galería propia (js/galeria.js) tiene prioridad: si hay fotos, Instagram no se pinta */
  window.silabInstagram = (window.silabGaleria || Promise.resolve(false))
    .then(function (hayGaleria) { return hayGaleria ? 'galeria' : fetch('/data/instagram.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }); })
    .then(function (d) {
      if (d === 'galeria') return true;
      if (!d || !d.publicaciones || !d.publicaciones.length) return false;
      cajas.forEach(function (caja) {
        var n = parseInt(caja.getAttribute('data-instagram'), 10) || 9;
        caja.removeAttribute('data-elfsight-lazy'); // ya no hace falta cargar Elfsight aquí
        caja.className = 'ig-rejilla';
        caja.innerHTML = d.publicaciones.slice(0, n).map(function (p) {
          return '<a class="ig-foto" href="' + url(p.url) + '" target="_blank" rel="noopener">' +
            '<img src="' + url(p.img) + '" alt="' + esc(p.texto ? p.texto.slice(0, 120) : 'Publicación de @silab3d en Instagram') + '" width="400" height="400" loading="lazy" decoding="async">' +
            (p.tipo === 'VIDEO' ? '<span class="ig-foto__video" aria-hidden="true">▶</span>' : '') +
          '</a>';
        }).join('');
      });
      return true;
    })
    .catch(function () { return false; });
})();
