/* ============================================================
   SILAB 3D · Reseñas de Google propias (sin widgets de terceros)
   Lee data/resenas.json (lo actualiza cada semana la acción
   «Reseñas de Google») y lo pinta en cada [data-resenas]:
     - Panel destacado: nota media de Google + una cita grande que
       va rotando (data-destacadas="8" → cuántas rotan).
     - data-lista="6"  → además, tarjetas con más opiniones debajo
     - data-mas        → botón «Ver más opiniones» (de 6 en 6)
   Inspiración: citas destacadas de Apple y Notion y la nota
   agregada de G2 o TripAdvisor, con el oscuro y frambuesa del hero.
   ============================================================ */
(function () {
  var cajas = document.querySelectorAll('[data-resenas]');
  if (!cajas.length) return;

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  // Solo enlaces https (los datos vienen de fuera: Elfsight/Google)
  function url(u) { return /^https:\/\//i.test(String(u || '')) ? esc(u) : '#'; }
  function estrellas(n) { var s = ''; for (var i = 1; i <= 5; i++) s += i <= Math.round(n) ? '★' : '☆'; return s; }
  function hace(iso) {
    var dias = Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5);
    if (isNaN(dias)) return '';
    if (dias < 1) return 'hoy';
    if (dias < 7) return 'hace ' + dias + (dias === 1 ? ' día' : ' días');
    if (dias < 31) { var s = Math.floor(dias / 7); return 'hace ' + s + (s === 1 ? ' semana' : ' semanas'); }
    if (dias < 365) { var m = Math.floor(dias / 30.4); return 'hace ' + m + (m === 1 ? ' mes' : ' meses'); }
    var a = Math.floor(dias / 365); return 'hace ' + a + (a === 1 ? ' año' : ' años');
  }
  function nombre(n) { n = (n || '').trim(); if (n === n.toUpperCase()) n = n.toLowerCase(); return n.replace(/(^|\s)\p{Ll}/gu, function (c) { return c.toUpperCase(); }); }
  // Avatar con la inicial en uno de 5 tonos de la marca, siempre el mismo para cada persona
  function tono(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return h % 5; }
  function avatar(quien) { return '<span class="resena-avatar resena-avatar--' + tono(quien) + '" aria-hidden="true">' + esc(quien.charAt(0) || '?') + '</span>'; }
  var G = '<svg class="g-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>';

  /* ---------- Tarjeta sencilla (lista de Valoraciones) ---------- */
  function tarjeta(r) {
    var largo = r.texto.length > 170, quien = nombre(r.autor);
    return '<article class="resena">' +
      '<span class="resena__estrellas" role="img" aria-label="' + r.nota + ' de 5 estrellas">' + estrellas(r.nota) + '</span>' +
      '<p class="resena__texto' + (largo ? ' is-corto' : '') + '">' + esc(r.texto) + '</p>' +
      (largo ? '<button type="button" class="resena__leer" aria-expanded="false">Leer más</button>' : '') +
      '<div class="resena__autor">' + avatar(quien) +
        '<span class="resena__quien"><a href="' + url(r.url) + '" target="_blank" rel="noopener" title="Ver la reseña en Google">' + esc(quien) + '</a>' +
        '<small>' + esc(hace(r.fecha)) + '</small></span>' +
      '</div>' +
    '</article>';
  }

  /* ---------- Panel destacado ---------- */
  function panel(d, citas) {
    var nota = String(d.lugar.nota).replace('.', ','); if (nota.indexOf(',') < 0) nota += ',0';
    return '<div class="opi">' +
      '<div class="opi__nota">' +
        '<span class="opi__fuente">' + G + 'Reseñas de Google</span>' +
        '<span class="opi__cifra">' + esc(nota) + '</span>' +
        '<span class="opi__estrellas" role="img" aria-label="' + esc(nota) + ' de 5 estrellas">' + estrellas(d.lugar.nota) + '</span>' +
        '<span class="opi__total">' + esc(d.lugar.total) + ' clientes nos han valorado</span>' +
        '<a class="opi__enlace" href="' + url(d.lugar.url) + '" target="_blank" rel="noopener">Ver todas en Google<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' +
      '</div>' +
      '<div class="opi__citas">' +
        '<figure class="opi__cita" aria-live="off"></figure>' +
        (citas.length > 1 ?
          '<div class="opi__nav">' +
            '<button type="button" class="opi__btn" data-paso="-1" aria-label="Opinión anterior"><svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>' +
            '<span class="opi__puntos">' + citas.map(function (_, i) { return '<button type="button" class="opi__punto" data-i="' + i + '" aria-label="Opinión ' + (i + 1) + '"></button>'; }).join('') + '</span>' +
            '<button type="button" class="opi__btn" data-paso="1" aria-label="Opinión siguiente"><svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>' +
            '<button type="button" class="opi__btn opi__pausa" aria-pressed="false" aria-label="Pausar el cambio automático"><svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg></button>' +
          '</div>' : '') +
      '</div>' +
    '</div>';
  }
  function cita(r) {
    var quien = nombre(r.autor);
    return '<blockquote class="opi__texto"><p>' + esc(r.texto) + '</p></blockquote>' +
      '<figcaption class="opi__autor">' + avatar(quien) +
        '<span><a href="' + url(r.url) + '" target="_blank" rel="noopener" title="Ver la reseña en Google">' + esc(quien) + '</a>' +
        '<small><span aria-hidden="true">' + estrellas(r.nota) + '</span> · ' + esc(hace(r.fecha)) + '</small></span>' +
      '</figcaption>';
  }

  function montarPanel(caja, citas) {
    var fig = caja.querySelector('.opi__cita'), actual = 0, parado = false, pausado = false;
    function mostrar(i, manual) {
      actual = (i + citas.length) % citas.length;
      // Solo se anuncia a los lectores de pantalla cuando la persona cambia de opinión, no en el avance automático
      fig.setAttribute('aria-live', manual ? 'polite' : 'off');
      fig.classList.remove('is-in');
      fig.innerHTML = cita(citas[actual]);
      void fig.offsetWidth; fig.classList.add('is-in');
      caja.querySelectorAll('.opi__punto').forEach(function (p, k) { p.setAttribute('aria-current', k === actual ? 'true' : 'false'); });
    }
    // Altura fija: se reserva la de la opinión más larga para que el panel no salte al rotar
    function reservar() {
      fig.style.minHeight = '';
      var max = 0;
      citas.forEach(function (c) { fig.innerHTML = cita(c); max = Math.max(max, fig.offsetHeight); });
      fig.style.minHeight = max + 'px';
      fig.innerHTML = cita(citas[actual]);
    }
    reservar();
    mostrar(0);
    var tr = null;
    window.addEventListener('resize', function () { clearTimeout(tr); tr = setTimeout(reservar, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reservar);
    caja.addEventListener('click', function (e) {
      var b = e.target.closest('[data-paso]'), p = e.target.closest('.opi__punto'), z = e.target.closest('.opi__pausa');
      if (b) mostrar(actual + +b.getAttribute('data-paso'), true);
      if (p) mostrar(+p.getAttribute('data-i'), true);
      if (z) {
        pausado = !pausado;
        z.setAttribute('aria-pressed', pausado ? 'true' : 'false');
        z.setAttribute('aria-label', pausado ? 'Reanudar el cambio automático' : 'Pausar el cambio automático');
        z.innerHTML = pausado ? '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>' : '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
      }
    });
    // Deslizar con el dedo
    var x0 = null;
    fig.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    fig.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) mostrar(actual + (dx < 0 ? 1 : -1), true); });
    // Avance automático cada 7 s (no en móvil ni con «reducir movimiento»); se para con el ratón, el foco o el botón de pausa
    var pausa = caja.querySelector('.opi__pausa');
    if (citas.length < 2 || (window.matchMedia && (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 480px)').matches))) { if (pausa) pausa.remove(); return; }
    var opi = caja.querySelector('.opi');
    opi.addEventListener('mouseenter', function () { parado = true; });
    opi.addEventListener('mouseleave', function () { parado = false; });
    opi.addEventListener('focusin', function () { parado = true; });
    opi.addEventListener('focusout', function (e) { if (!opi.contains(e.relatedTarget)) parado = false; });
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(opi);
    setInterval(function () { if (visible && !parado && !pausado && !document.hidden) mostrar(actual + 1, false); }, 7000);
  }

  fetch('/data/resenas.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.resenas || !d.resenas.length) return;
      var lista = d.resenas.filter(function (r) { return r.texto && r.nota >= 4; })
        .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
      // Para la cita grande, opiniones con sustancia pero que se lean de un vistazo
      var buenas = lista.filter(function (r) { return r.texto.length >= 50 && r.texto.length <= 240; });
      cajas.forEach(function (caja) {
        var citas = buenas.slice(0, parseInt(caja.getAttribute('data-destacadas'), 10) || 8);
        if (!citas.length) citas = lista.slice(0, 1);
        var n = parseInt(caja.getAttribute('data-lista'), 10) || 0;
        // La lista de debajo no repite las opiniones que ya rotan en el panel
        var resto = lista.filter(function (r) { return citas.indexOf(r) < 0; });
        caja.innerHTML = panel(d, citas) +
          (n ? '<div class="resenas__lista">' + resto.slice(0, n).map(tarjeta).join('') + '</div>' : '') +
          (n && caja.hasAttribute('data-mas') && resto.length > n ? '<div class="resenas__mas"><button type="button" class="s3d-btn s3d-btn--ghost">Ver más opiniones</button></div>' : '');
        montarPanel(caja, citas);
        var vistas = n, mas = caja.querySelector('.resenas__mas button');
        if (mas) mas.addEventListener('click', function () {
          var listaEl = caja.querySelector('.resenas__lista'), antes = listaEl.children.length;
          listaEl.insertAdjacentHTML('beforeend', resto.slice(vistas, vistas + 6).map(tarjeta).join(''));
          vistas += 6;
          if (vistas >= resto.length) {
            // El botón desaparece: el foco pasa a la primera opinión nueva para no perderse
            var nueva = listaEl.children[antes] && listaEl.children[antes].querySelector('a, button');
            if (nueva) nueva.focus();
            mas.parentNode.remove();
          }
        });
        caja.addEventListener('click', function (e) {
          var b = e.target.closest('.resena__leer'); if (!b) return;
          var abierto = b.previousElementSibling.classList.toggle('is-corto') === false;
          b.textContent = abierto ? 'Leer menos' : 'Leer más';
          b.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
      });
    })
    .catch(function () {});
})();
