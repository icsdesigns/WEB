/* ============================================================
   SILAB 3D · Galería de trabajos (Valoraciones › Nuestros trabajos)
   Lee de Supabase las fotos que se suben en el panel admin › Galería
   y las muestra en un mosaico con visor a pantalla completa.
   Si aún no hay fotos, la caja se queda para Instagram/Elfsight
   (js/instagram.js y js/elfsight.js esperan a window.silabGaleria).
   ============================================================ */
(function () {
  var caja = document.querySelector('[data-galeria]');
  if (!caja) return;
  var SB = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  var fotos = [];
  window.silabGaleria = fetch(SB.url + '/rest/v1/galeria?select=titulo,material,imagen,miniatura,ancho,alto&visible=eq.true&order=orden.asc,creado.desc', {
    headers: { apikey: SB.key, Authorization: 'Bearer ' + SB.key }
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return false;
      fotos = rows;
      caja.removeAttribute('data-elfsight-lazy');
      caja.removeAttribute('data-instagram');
      caja.className = 'galeria';
      pintar();
      var ultimo = columnas();
      window.addEventListener('resize', function () { if (columnas() !== ultimo) { ultimo = columnas(); pintar(); } });
      return true;
    })
    .catch(function () { return false; });

  /* Mosaico repartido por filas (1.ª foto arriba a la izquierda, 2.ª a su derecha…): el orden del panel se respeta */
  function columnas() { return window.innerWidth <= 480 ? 2 : window.innerWidth <= 860 ? 2 : 3; }
  function pintar() {
    var n = columnas(), cols = [], altos = [];
    for (var c = 0; c < n; c++) { cols.push([]); altos.push(0); }
    fotos.forEach(function (f, i) {
      // Cada foto va a la columna más baja, para que las columnas acaben parejas
      var c = altos.indexOf(Math.min.apply(null, altos));
      cols[c].push(foto(f, i));
      altos[c] += f.ancho && f.alto ? f.alto / f.ancho : 1;
    });
    caja.innerHTML = cols.map(function (c) { return '<div class="galeria__col">' + c.join('') + '</div>'; }).join('');
  }
  function foto(f, i) {
    var pie = [f.titulo, f.material].filter(Boolean).join(' · ');
    return '<button type="button" class="galeria__foto" data-i="' + i + '" aria-label="Ver en grande' + (pie ? ': ' + esc(pie) : '') + '">' +
          '<img src="' + esc(f.miniatura) + '" alt="' + esc(f.titulo || 'Trabajo impreso en 3D por SILAB 3D') + '"' +
            (f.ancho && f.alto ? ' width="' + f.ancho + '" height="' + f.alto + '"' : '') + ' loading="lazy" decoding="async">' +
          (pie ? '<span class="galeria__pie">' + esc(pie) + '</span>' : '') +
        '</button>';
  }

  /* ---------- Visor ---------- */
  var visor = null, actual = 0, x0 = null;
  function crearVisor() {
    visor = document.createElement('div');
    visor.className = 'visor';
    visor.setAttribute('role', 'dialog');
    visor.setAttribute('aria-modal', 'true');
    visor.setAttribute('aria-label', 'Trabajo ampliado');
    visor.innerHTML =
      '<button type="button" class="visor__btn visor__cerrar" aria-label="Cerrar"><svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<button type="button" class="visor__btn visor__ant" aria-label="Anterior"><svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>' +
      '<figure class="visor__figura"><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="visor__btn visor__sig" aria-label="Siguiente"><svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>';
    document.body.appendChild(visor);
    visor.addEventListener('click', function (e) {
      if (e.target.closest('.visor__cerrar') || e.target === visor) cerrar();
      else if (e.target.closest('.visor__ant')) ir(-1);
      else if (e.target.closest('.visor__sig')) ir(1);
    });
    visor.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    visor.addEventListener('touchend', function (e) {
      if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);
    });
  }
  function mostrar(i) {
    actual = (i + fotos.length) % fotos.length;
    var f = fotos[actual];
    var img = visor.querySelector('img');
    img.src = f.imagen; img.alt = f.titulo || 'Trabajo impreso en 3D por SILAB 3D';
    var pie = [f.titulo, f.material].filter(Boolean).join(' · ');
    visor.querySelector('figcaption').innerHTML = (pie ? '<span>' + esc(pie) + '</span>' : '') + '<span class="visor__cuenta">' + (actual + 1) + ' / ' + fotos.length + '</span>';
    // Precarga la siguiente para que el paso sea inmediato
    new Image().src = fotos[(actual + 1) % fotos.length].imagen;
  }
  function ir(d) { mostrar(actual + d); }
  function abrirVisor(i) {
    if (!visor) crearVisor();
    mostrar(i);
    visor.classList.add('is-abierto');
    document.documentElement.style.overflow = 'hidden';
    visor.querySelector('.visor__cerrar').focus();
  }
  function cerrar() {
    visor.classList.remove('is-abierto');
    document.documentElement.style.overflow = '';
    var b = caja.querySelector('[data-i="' + actual + '"]'); if (b) b.focus();
  }
  caja.addEventListener('click', function (e) {
    var b = e.target.closest('.galeria__foto'); if (b) abrirVisor(+b.getAttribute('data-i'));
  });
  document.addEventListener('keydown', function (e) {
    if (!visor || !visor.classList.contains('is-abierto')) return;
    if (e.key === 'Tab') {
      // El foco no sale del visor: circula entre sus tres botones
      var bs = [].slice.call(visor.querySelectorAll('.visor__btn')), k = bs.indexOf(document.activeElement);
      e.preventDefault();
      bs[(k + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
    else if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowLeft') ir(-1);
    else if (e.key === 'ArrowRight') ir(1);
  });
})();
