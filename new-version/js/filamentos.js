/* ============================================================
   SILAB 3D · Colores de filamento
   Lee la tabla «filamentos» de Supabase en vivo; si no responde,
   usa data/filamentos.json (copia que actualiza GitHub cada hora).
   Uso: SILAB_FILAMENTOS.load().then(function (d) { d.pla, d.petg })
   Cada color: { name, hex, colores, fondo, premium, marble, silk }
   «hex» puede traer 1 color (sólido), 2 (degradado) o 4 (multicolor)
   separados por coma: «hex» es el primero y «fondo» el CSS de la muestra.
   ============================================================ */
(function () {
  var SUPABASE = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
  var cache = null;

  function fromSupabase() {
    return fetch(SUPABASE.url + '/rest/v1/filamentos?select=material,nombre,hex&visible=eq.true&order=nombre.asc', {
      headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key },
      cache: 'no-store'
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) return null;
        var out = { pla: [], petg: [] };
        rows.forEach(function (r) {
          var m = String(r.material || '').toUpperCase();
          var key = m.indexOf('PLA') === 0 ? 'pla' : (m.indexOf('PETG') === 0 ? 'petg' : null);
          if (key) out[key].push(color(r.nombre, r.hex, m === 'PLA PREMIUM'));
        });
        return out;
      }).catch(function () { return null; });
  }

  function fromRepo() {
    return fetch('/data/filamentos.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var list = json && Array.isArray(json.filamentos) ? json.filamentos : [];
        if (!list.length) return null;
        var out = { pla: [], petg: [] };
        list.forEach(function (m) {
          var n = String(m.nombre || '').toUpperCase();
          var key = n === 'PLA' ? 'pla' : (n === 'PETG' ? 'petg' : null);
          if (!key) return;
          (m.colores || []).forEach(function (c) { out[key].push(color(c.nombre, c.hex, c.premium)); });
        });
        return out;
      }).catch(function () { return null; });
  }

  function color(name, hex, premium) {
    var lista = (Array.isArray(hex) ? hex : String(hex || '').split(',')).map(function (h) {
      h = String(h || '').trim().toLowerCase();
      return h && h.charAt(0) !== '#' ? '#' + h : h;
    }).filter(Boolean);
    if (!lista.length) lista = ['#cccccc'];
    var n = String(name || 'Color');
    var marble = /(marble|marmol|mármol)/i.test(n);
    var silk = /(silk|seda)/i.test(n);
    return { name: n, hex: lista[0], colores: lista, fondo: fondo(lista), premium: Boolean(premium) || marble || silk, marble: marble, silk: silk };
  }
  // Sólido · degradado (2) · multicolor por sectores (3 o más)
  function fondo(lista) {
    if (lista.length === 1) return lista[0];
    if (lista.length === 2) return 'linear-gradient(135deg, ' + lista.join(', ') + ')';
    var paso = 100 / lista.length;
    // Cada cuarto se funde tenuemente con el siguiente (4 % a cada lado de la unión)
    var costura = 'color-mix(in srgb, ' + lista[lista.length - 1] + ', ' + lista[0] + ')';
    return 'conic-gradient(' + costura + ' 0%, ' + lista.map(function (c, i) { return c + ' ' + (i * paso + 4) + '% ' + ((i + 1) * paso - 4) + '%'; }).join(', ') + ', ' + costura + ' 100%)';
  }

  // Neutros primero (de claro a oscuro) y después la rueda de color, empezando en rosas y rojos
  function key(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
    if ([r, g, b].some(isNaN)) return [2, 0, 0];
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    if (s < 0.15 || d < 0.08) return [0, 0, 1 - l];
    return [1, (h + 30) % 360, 1 - l];
  }
  function sort(list) {
    return list.sort(function (a, b) {
      var ka = key(a.hex), kb = key(b.hex);
      return (ka[0] - kb[0]) || (ka[1] - kb[1]) || (ka[2] - kb[2]);
    });
  }

  window.SILAB_FILAMENTOS = {
    load: function () {
      if (!cache) {
        cache = fromSupabase().then(function (d) { return d || fromRepo(); }).then(function (d) {
          if (!d) return { pla: [], petg: [] };
          sort(d.pla); sort(d.petg);
          return d;
        });
      }
      return cache;
    }
  };
})();
