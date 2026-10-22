/* ============================================================
   SILAB 3D · Galería de trabajos (Valoraciones › Nuestros trabajos)
   Lee de Supabase las fotos que se suben en el panel admin › Galería
   y las muestra en un carrusel continuo con visor a pantalla completa.
   Si aún no hay fotos, la caja se queda para Instagram/Elfsight
   (js/instagram.js y js/elfsight.js esperan a window.silabGaleria).
   ============================================================ */
(function () {
  var caja = document.querySelector('[data-galeria]');
  if (!caja) return;
  var SB = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  var fotos = [];
  var cab = { headers: { apikey: SB.key, Authorization: 'Bearer ' + SB.key } };
  // Ajuste del panel (Galería › Orden aleatorio); si no existe o falla, se respeta el orden del panel
  var aleatorio = fetch(SB.url + '/rest/v1/ajustes_web?select=valor&clave=eq.galeria_aleatoria', cab)
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (a) { return !!(a && a[0] && a[0].valor === true); })
    .catch(function () { return false; });
  function barajar(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  window.silabGaleria = Promise.all([
    fetch(SB.url + '/rest/v1/galeria?select=titulo,material,imagen,miniatura,ancho,alto&visible=eq.true&order=orden.asc,creado.desc', cab)
      .then(function (r) { return r.ok ? r.json() : []; }),
    aleatorio
  ])
    .then(function (res) {
      var rows = res[0];
      // Con menos de 3 fotos el carrusel no luce: la caja se queda para Instagram/Elfsight
      if (!Array.isArray(rows) || rows.length < 3) return false;
      fotos = res[1] ? barajar(rows.slice()) : rows;
      caja.removeAttribute('data-elfsight-lazy');
      caja.removeAttribute('data-instagram');
      caja.className = 'galeria';
      montar();
      return true;
    })
    .catch(function () { return false; });

  function foto(f, i, copia) {
    var pie = [f.titulo, f.material].filter(Boolean).join(' · ');
    // Proporción de la foto, acotada para que ninguna quede como una tira
    var r = f.ancho && f.alto ? Math.min(1.6, Math.max(0.65, f.ancho / f.alto)) : 1;
    return '<button type="button" class="galeria__foto" data-i="' + i + '" style="--r:' + r.toFixed(3) + '"' +
            (copia ? ' tabindex="-1" aria-hidden="true"' : ' aria-label="Ver en grande' + (pie ? ': ' + esc(pie) : '') + '"') + '>' +
          '<img src="' + esc(f.miniatura) + '" alt="' + (copia ? '' : esc(f.titulo || 'Trabajo impreso en 3D por SILAB 3D')) + '" loading="lazy" decoding="async" draggable="false">' +
          (pie ? '<span class="galeria__pie">' + esc(pie) + '</span>' : '') +
        '</button>';
  }

  /* ---------- Carrusel continuo ----------
     La tira de fotos se repite las veces necesarias y se desplaza sola, en bucle y sin saltos.
     Se para con el ratón encima, al tocarla o con el foco dentro; también se puede arrastrar.
     Con «reducir movimiento» no se mueve: queda una tira que se desliza a mano. */
  var VEL = 38;                         // px por segundo
  var pista, ancho = 0, anchoCaja = 0, x = 0, parado = 0, visible = true, ultimo = 0, quieto = false;
  function montar() {
    quieto = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    caja.innerHTML = '<div class="galeria__ventana"' + (quieto ? ' tabindex="0" aria-label="Nuestros trabajos"' : '') + '><div class="galeria__pista"></div></div>';
    pista = caja.querySelector('.galeria__pista');
    if (quieto) { caja.classList.add('is-quieto'); pista.innerHTML = fotos.map(function (f, i) { return foto(f, i); }).join(''); return; }
    repetir();
    // Solo se rehace si cambia el ancho (en móvil la barra del navegador dispara resize al hacer scroll)
    window.addEventListener('resize', function () {
      if (caja.clientWidth === anchoCaja) return;
      var a = ancho; repetir(); x = a ? x / a * ancho : 0; ajustar(); pintar();
    });
    // El ancho de cada foto sale de su altura y su proporción (--r): no cambia cuando carga la imagen
    var dentro = function () { parado |= 1; }, fuera = function () { parado &= ~1; };
    caja.addEventListener('mouseenter', dentro);
    caja.addEventListener('mouseleave', fuera);
    // Solo para con foco de teclado: tras un clic o un toque el botón conserva el foco y no debe dejarlo parado
    caja.addEventListener('focusin', function (e) {
      var tecla = true; try { tecla = e.target.matches(':focus-visible'); } catch (_) {}
      if (tecla) { parado |= 2; verFoco(e.target); }
    });
    caja.addEventListener('focusout', function (e) { if (!caja.contains(e.relatedTarget)) parado &= ~2; });
    arrastre();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(caja);
    requestAnimationFrame(paso);
  }
  // Una vuelta de fotos tiene que cubrir al menos el ancho de la ventana; luego se duplica para el bucle
  function repetir() {
    var una = fotos.map(function (f, i) { return foto(f, i, false); }).join('');
    var otra = fotos.map(function (f, i) { return foto(f, i, true); }).join('');
    pista.innerHTML = una;
    var vuelta = pista.scrollWidth + gap(), ventana = caja.clientWidth, veces = Math.max(1, Math.ceil(ventana / vuelta));
    // Solo la primera vuelta es accesible; el resto son copias ocultas al lector de pantalla y al tabulador
    var html = una; for (var k = 1; k < veces * 2; k++) html += otra;
    pista.innerHTML = html;
    ancho = vuelta * veces;
    anchoCaja = ventana;
    pintar();
  }
  function gap() { return parseFloat(getComputedStyle(pista).columnGap) || 0; }
  function pintar() { pista.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,0,0)'; }
  function ajustar() { x = ((x % ancho) + ancho) % ancho; }
  function paso(t) {
    var dt = ultimo ? Math.min(t - ultimo, 64) : 0; ultimo = t;
    if (!parado && visible && !document.hidden) { x += VEL * dt / 1000; ajustar(); pintar(); }
    requestAnimationFrame(paso);
  }
  // Con el teclado, la foto enfocada se trae a la vista
  function verFoco(el) {
    var b = el.closest && el.closest('.galeria__foto'); if (!b) return;
    var v = caja.getBoundingClientRect(), r = b.getBoundingClientRect();
    if (r.left < v.left + 8) x -= v.left + 8 - r.left;
    else if (r.right > v.right - 8) x += r.right - (v.right - 8);
    else return;
    ajustar(); pintar();
  }
  // Arrastrar con el ratón o el dedo; un arrastre no abre el visor
  var arrastrado = false;
  function arrastre() {
    var x0 = null, y0 = 0, xIni = 0, id = null, horizontal = null;
    caja.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; xIni = x; id = e.pointerId; horizontal = null; arrastrado = false; parado |= 4;
    });
    caja.addEventListener('pointermove', function (e) {
      if (x0 == null || e.pointerId !== id) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (horizontal == null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (horizontal) { arrastrado = true; caja.classList.add('is-arrastrando'); try { caja.setPointerCapture(id); } catch (_) {} }
      }
      if (horizontal) { x = xIni - dx; ajustar(); pintar(); }
    });
    function soltar(e) {
      if (x0 == null || e.pointerId !== id) return;
      x0 = null; caja.classList.remove('is-arrastrando');
      // Tras tocar con el dedo, espera un poco antes de seguir solo
      if (e.pointerType === 'mouse') parado &= ~4;
      else setTimeout(function () { if (x0 == null) parado &= ~4; }, 1800);
    }
    caja.addEventListener('pointerup', soltar);
    caja.addEventListener('pointercancel', soltar);
    caja.addEventListener('click', function (e) { if (arrastrado) { e.stopImmediatePropagation(); e.preventDefault(); arrastrado = false; } }, true);
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
