/* ============================================================
   SILAB 3D · Ventana de novedades (plantilla única)
   Lee data/destacados.json y muestra UN producto destacado:
   - tarjeta en una esquina (escritorio) u hoja baja (móvil), sin tapar la página;
   - aparece a los 8 s o al bajar un 40 % de la página, nunca junto al aviso de términos;
   - una vez por visita; al cerrarla no vuelve en 7 días;
   - rota entre los destacados activos en cada visita.
   ============================================================ */
(function () {
  var KEY_SNOOZE = 'silab_destacado_hasta';
  var KEY_NEXT = 'silab_destacado_siguiente';
  var shown = false;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  try { if (sessionStorage.getItem('silab_destacado_visto')) return; } catch (e) {}
  if (Number(get(KEY_SNOOZE) || 0) > Date.now()) return;

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function active(d) {
    var today = new Date().toISOString().slice(0, 10);
    return (!d.desde || d.desde <= today) && (!d.hasta || d.hasta >= today);
  }

  /* Origen 1: productos marcados como «Novedad» en el panel de admin (Supabase).
     Origen 2 (respaldo): data/destacados.json */
  var SUPABASE = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
  function fromAdmin() {
    return fetch(SUPABASE.url + '/rest/v1/productos?select=nombre,descripcion,imagen&visible=eq.true&destacado=eq.true&order=nombre.asc', {
      headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key }, cache: 'no-store'
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return null;
      return rows.map(function (p) {
        var img = !p.imagen ? '' : /^https?:/.test(p.imagen) ? p.imagen : '/img/' + p.imagen;
        return {
          id: p.nombre, etiqueta: 'Novedad', titulo: p.nombre, texto: p.descripcion || '',
          imagenes: img ? [{ src: img, alt: p.nombre }] : [],
          url: '/new-version/configura-tu-proyecto/?producto=' + encodeURIComponent(p.nombre),
          boton: 'Configura tu proyecto'
        };
      });
    }).catch(function () { return null; });
  }
  function fromJson() {
    return fetch('/new-version/data/destacados.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { return (data && data.destacados || []).filter(active); })
      .catch(function () { return []; });
  }

  fromAdmin().then(function (l) { return l || fromJson(); })
    .then(function (list) {
      if (!list || !list.length) return;
      var i = Number(get(KEY_NEXT) || 0) % list.length;
      set(KEY_NEXT, String(i + 1));
      schedule(list[i]);
    })
    .catch(function () {});

  /* El aviso de términos va primero: mientras esté a la vista o pendiente de salir
     (aún no aceptado ni cerrado en esta página) la novedad espera, para no apilar dos ventanas */
  function noticeOpen() {
    var n = document.getElementById('termsPopup');
    if (!n) return false;
    return n.classList.contains('show') || (!get('silab_terms_accepted') && !n.dataset.cerrado);
  }

  function schedule(item) {
    var timer = setTimeout(tryShow, 8000);
    function onScroll() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0 && window.scrollY / h > 0.4) tryShow();
    }
    function tryShow() {
      if (shown) return;
      if (noticeOpen()) { clearTimeout(timer); timer = setTimeout(tryShow, 4000); return; }
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      render(item);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function render(item) {
    shown = true;
    try { sessionStorage.setItem('silab_destacado_visto', '1'); } catch (e) {}
    var img = (item.imagenes || [])[0];
    var box = document.createElement('aside');
    box.className = 'destacado';
    box.setAttribute('role', 'complementary');
    box.setAttribute('aria-label', 'Novedad');
    box.innerHTML =
      '<button type="button" class="destacado__cerrar" aria-label="Cerrar novedad">' +
        '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      (img ? '<img class="destacado__img" src="' + esc(img.src) + '" alt="' + esc(img.alt) + '" width="120" height="120">' : '') +
      '<div class="destacado__texto">' +
        '<span class="destacado__etiqueta">' + esc(item.etiqueta || 'Novedad') + '</span>' +
        '<p class="destacado__titulo">' + esc(item.titulo) + '</p>' +
        '<p class="destacado__desc">' + esc(item.texto) + '</p>' +
        '<a class="s3d-btn s3d-btn--primary s3d-btn--sm destacado__cta" href="' + esc(item.url) + '">' + esc(item.boton || 'Ver más') + '</a>' +
      '</div>';
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.classList.add('is-in'); });

    function close() {
      set(KEY_SNOOZE, String(Date.now() + 7 * 24 * 3600 * 1000));
      box.classList.remove('is-in');
      setTimeout(function () { box.remove(); }, 300);
    }
    box.querySelector('.destacado__cerrar').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.isConnected) close(); });
    box.querySelector('.destacado__cta').addEventListener('click', function () {
      if (window.silabEvento) window.silabEvento('novedad-clic', { id: item.id });
    });
    if (window.silabEvento) window.silabEvento('novedad-vista', { id: item.id });
  }
})();
