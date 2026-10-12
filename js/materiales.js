/* ============================================================
   SILAB 3D · Materiales
   - Pinta los colores de PLA y PETG (Supabase en vivo, con respaldo).
   - Al pulsar un color: jarrón 3D en ese color y colores que combinan.
   - Pestañas de material que siguen el scroll.
   ============================================================ */
(function () {
  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var data = { pla: [], petg: [] };

  /* ---------- Tarjetas de color ---------- */
  function swatchStyle(c) {
    return c.marble
      ? "background-image:url('/img/marble-texture.webp');background-size:cover;background-position:center"
      : c.colores && c.colores.length > 1 ? 'background:' + c.fondo : 'background-color:' + c.hex;
  }
  function card(c, mat) {
    var cls = 'swatch' + (c.silk ? ' swatch--silk' : '') + (!c.marble && hsl(c.hex).l > 86 ? ' swatch--light' : '');
    return '<button type="button" class="card color-card" data-mat="' + mat + '" data-name="' + esc(c.name) + '" data-hex="' + esc(c.hex) + '" title="Ver ' + esc(c.name) + ' en 3D">' +
      '<span class="' + cls + '" style="' + swatchStyle(c) + '"></span>' +
      '<h3>' + esc(mainName(c.name)) + '</h3>' +
      '</button>';
  }
  // «Silk Light Gold (Dorado)» → «Silk Light Gold» en la tarjeta; el nombre completo sale en la ventana 3D
  function mainName(n) { return String(n).replace(/\s*\([^)]*\)\s*$/, ''); }
  function render() {
    ['pla', 'petg'].forEach(function (mat) {
      var grid = document.querySelector('[data-grid="' + mat + '"]');
      if (grid) grid.innerHTML = data[mat].map(function (c) { return card(c, mat); }).join('');
    });
    fitNames();
  }

  /* Nombres alineados: si alguno ocupa dos líneas, la rejilla reserva dos para todos */
  function fitNames() {
    document.querySelectorAll('.color-grid').forEach(function (g) {
      g.classList.remove('names-2');
      var two = Array.prototype.some.call(g.querySelectorAll('.color-card h3'), function (h) {
        return h.getBoundingClientRect().height > parseFloat(getComputedStyle(h).lineHeight) * 1.5;
      });
      g.classList.toggle('names-2', two);
    });
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitNames, 150); });
  fitNames();

  /* ---------- Combinaciones ---------- */
  function hsl(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
      h *= 60;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }
  function score(a, b) {
    var x = hsl(a), y = hsl(b);
    var dh = Math.abs(x.h - y.h); if (dh > 180) dh = 360 - dh;
    var dl = Math.abs(x.l - y.l);
    var hs = (dh >= 120 && dh <= 180) ? 100 : (dh >= 90 && dh < 120) ? 85 : (dh >= 30 && dh <= 60) ? 80 : Math.max(0, 50 - Math.abs(dh - 45));
    var ls = (dl >= 20 && dl <= 60) ? 30 : dl > 60 ? 15 : 0;
    return hs + ls + Math.min(20, Math.abs(x.s - y.s) / 3);
  }
  function matches(hex, mat) {
    return data[mat].filter(function (c) { return c.hex !== hex && !c.premium; })
      .map(function (c) { return { c: c, s: score(hex, c.hex) }; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 3).map(function (m) { return m.c; });
  }

  /* ---------- Ventana del color ---------- */
  var modal = document.getElementById('colorModal');
  var viewer = document.getElementById('modalModelViewer');
  var lastFocus = null;
  function linear(hex) {
    return [1, 3, 5].map(function (i) { return Math.pow(parseInt(hex.substr(i, 2), 16) / 255, 2.2); });
  }
  function paintViewer(hex) {
    if (!viewer) return;
    var apply = function () {
      if (viewer.model && viewer.model.materials[0]) {
        var rgb = linear(hex);
        viewer.model.materials[0].pbrMetallicRoughness.setBaseColorFactor([rgb[0], rgb[1], rgb[2], 1]);
      }
    };
    if (viewer.model) apply(); else viewer.addEventListener('load', apply, { once: true });
  }
  /* El visor 3D (≈ 900 KB) solo se descarga cuando hace falta: al acercarse a un color o al abrir la ventana */
  var mvCargado = false;
  function cargarVisor() {
    if (mvCargado) return; mvCargado = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js';
    document.head.appendChild(s);
  }
  document.addEventListener('pointerover', function (e) { if (e.target.closest && e.target.closest('.color-card')) cargarVisor(); }, { passive: true });
  document.addEventListener('focusin', function (e) { if (e.target.closest && e.target.closest('.color-card')) cargarVisor(); });
  function open(name, hex, mat) {
    if (!modal) return;
    cargarVisor();
    var c = data[mat].filter(function (x) { return x.hex === hex && x.name === name; })[0] || { name: name, hex: hex };
    document.getElementById('modalColorName').textContent = name;
    document.getElementById('modalMaterialChip').textContent = mat === 'pla' ? 'PLA' : 'PETG';
    document.getElementById('modalBanner').style.setProperty('--tint', hex);
    paintViewer(hex);
    var list = matches(hex, mat);
    var grid = document.getElementById('modalMatchingColors');
    grid.innerHTML = list.map(function (m) {
      return '<button type="button" class="match" data-mat="' + mat + '" data-name="' + esc(m.name) + '" data-hex="' + esc(m.hex) + '">' +
        '<span class="swatch swatch--sm" style="' + swatchStyle(m) + '"></span><span>' + esc(mainName(m.name)) + '</span></button>';
    }).join('');
    if (!modal.classList.contains('active')) {
      lastFocus = document.activeElement;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      modal.querySelector('.color-modal-close').focus();
    }
    void c;
  }
  function close() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.color-card, .match');
    if (b) { open(b.dataset.name, b.dataset.hex, b.dataset.mat); return; }
    if (modal && modal.classList.contains('active') && (e.target === modal || e.target.closest('.color-modal-close'))) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) close();
  });

  /* ---------- Pestañas que siguen el scroll ---------- */
  var tabs = document.querySelectorAll('.mat-tab');
  var ids = ['pla', 'petg', 'elegir'];
  function spy() {
    var line = window.innerHeight * 0.35, current = 'pla';
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= line) current = id;
    });
    tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.target === current); });
  }
  window.addEventListener('scroll', spy, { passive: true });

  /* ---------- Carga ---------- */
  if (window.SILAB_FILAMENTOS) {
    window.SILAB_FILAMENTOS.load().then(function (d) { data = d; render(); });
  }
})();
