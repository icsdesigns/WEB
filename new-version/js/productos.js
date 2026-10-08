/* ============================================================
   SILAB 3D · Productos
   - Filtros por categoría (también el que llega desde la home).
   - Botones «Solicitar» → configurador con el producto ya indicado.
   - Ventana de bibliotecas 3D.
   - Catálogo dinámico desde Supabase (solo lectura). Si no responde,
     se quedan las tarjetas estáticas de la página.
   ============================================================ */
(function () {
  var grid = document.querySelector('.products-grid');
  var filters = document.querySelector('.filters');
  if (!grid || !filters) return;

  /* ---------- Nombres alineados entre tarjetas ---------- */
  function fitNames() {
    grid.classList.remove('names-2');
    var two = Array.prototype.some.call(grid.querySelectorAll('.product-card:not(.hidden) h3'), function (h) {
      return h.getBoundingClientRect().height > parseFloat(getComputedStyle(h).lineHeight) * 1.5;
    });
    grid.classList.toggle('names-2', two);
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitNames, 150); });

  /* ---------- Filtros (delegados: sirven tras recargar el catálogo) ---------- */
  function applyFilter(value) {
    filters.querySelectorAll('.filter-btn').forEach(function (b) {
      var on = b.dataset.filter === value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    grid.querySelectorAll('.product-card').forEach(function (card) {
      var show = value === 'all' || card.dataset.category === value;
      card.classList.toggle('hidden', !show);
      card.classList.remove('is-shown');
      if (show) { void card.offsetWidth; card.classList.add('is-shown'); }
    });
    fitNames();
  }
  filters.addEventListener('click', function (e) {
    var b = e.target.closest('.filter-btn');
    if (b) applyFilter(b.dataset.filter);
  });
  /* En móvil la barra se desliza: se quita el difuminado al llegar al final */
  function markEnd() { filters.classList.toggle('is-end', filters.scrollLeft + filters.clientWidth >= filters.scrollWidth - 4); }
  filters.addEventListener('scroll', markEnd, { passive: true });
  window.addEventListener('resize', markEnd);
  markEnd();

  var initial = 'all';
  try {
    var saved = sessionStorage.getItem('filterCategory');
    if (saved) { sessionStorage.removeItem('filterCategory'); initial = saved; }
  } catch (e) {}
  if (initial !== 'all' && filters.querySelector('[data-filter="' + initial + '"]')) applyFilter(initial);
  else fitNames();

  /* ---------- Botones de las tarjetas ---------- */
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.btn-comprar, .btn-action');
    if (b) {
      var url = b.getAttribute('data-config-url');
      window.location.href = url || '/configura-tu-proyecto/?producto=' + encodeURIComponent(b.getAttribute('data-product') || '');
      return;
    }
    if (e.target.closest('.btn-explorar, #btnExplorarBibliotecas')) openLibrary();
  });

  /* ---------- Ventana de bibliotecas 3D ---------- */
  var modal = document.getElementById('libraryModal');
  var lastFocus = null;
  function openLibrary() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    var c = modal.querySelector('[data-close-modal]');
    if (c) c.focus();
  }
  function closeLibrary() {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('[data-open-library]').forEach(function (b) { b.addEventListener('click', openLibrary); });
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-close-modal]')) closeLibrary();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeLibrary();
    });
  }

  /* ---------- Catálogo dinámico (Supabase) ---------- */
  var SUPABASE = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
  var LABELS = { llaveros: 'Llaveros', decoracion: 'Decoración', figuras: 'Figuras', ilustracion: 'Ilustraciones', eventos: 'Eventos', medida: 'Diseños a medida' };
  function label(cat) { return LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' ')); }
  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Las fotos del catálogo están reencuadradas en /img/productos/; si un producto nuevo
     aún no tiene versión reencuadrada, se usa la original de /img/. */
  function imgUrl(img) { return !img ? '' : /^https?:/.test(img) ? img : '/img/productos/' + img; }
  grid.addEventListener('error', function (e) {
    var el = e.target;
    var m = el.tagName === 'IMG' && !el.dataset.fallback && el.getAttribute('src').match(/^\/img\/productos\/(.+)$/);
    if (m) { el.dataset.fallback = '1'; el.src = '/img/' + m[1]; }
  }, true);
  function api(route) {
    return fetch(SUPABASE.url + '/rest/v1/' + route, {
      headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key },
      cache: 'no-store'
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  api('productos?select=nombre,categoria,descripcion,imagen&visible=eq.true&order=nombre.asc')
    .then(function (productos) {
      if (!Array.isArray(productos) || !productos.length) return;
      return api('categorias?select=nombre&order=nombre.asc').catch(function () { return []; }).then(function (cats) {
        var used = productos.map(function (p) { return p.categoria; }).filter(Boolean)
          .filter(function (c, i, a) { return a.indexOf(c) === i; });
        var list = cats.length ? cats.map(function (c) { return c.nombre; }).filter(function (c) { return used.indexOf(c) > -1; }) : used;
        var active = filters.querySelector('.filter-btn.active');
        var current = active ? active.dataset.filter : 'all';

        filters.innerHTML = '<button type="button" class="filter-btn active" data-filter="all">Todos</button>' +
          list.map(function (c) { return '<button type="button" class="filter-btn" data-filter="' + esc(c) + '">' + esc(label(c)) + '</button>'; }).join('');

        grid.innerHTML = productos.map(function (p) {
          var explorar = p.nombre === 'Figura con diseño predefinido';
          var img = imgUrl(p.imagen);
          var btn = explorar
            ? '<button type="button" class="btn-explorar" id="btnExplorarBibliotecas">Explorar</button>'
            : '<button type="button" class="btn-comprar" data-product="' + esc(p.nombre) + '" data-category="' + esc(p.categoria || '') + '">Solicitar</button>';
          return '<div class="product-card" data-category="' + esc(p.categoria || '') + '">' +
            '<div class="product-image">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(p.nombre) + '" width="240" height="240" loading="lazy" decoding="async">' : '') + '</div>' +
            '<h3>' + esc(p.nombre) + '</h3>' +
            '<p>' + esc(p.descripcion || '') + '</p>' +
            '<div class="product-footer">' + btn + '</div></div>';
        }).join('');

        applyFilter(filters.querySelector('[data-filter="' + current + '"]') ? current : 'all');
        markEnd();
      });
    })
    .catch(function () { /* sin conexión: se mantiene el catálogo estático */ });
})();
