/* ============================================================
   SILAB 3D · Panel admin › Galería
   Fotos de trabajos realizados que se muestran en Valoraciones
   (js/galeria.js). Cada foto se convierte en el navegador a WebP
   en dos tamaños: 1600 px (visor) y 640 px (rejilla), buscando la
   mejor calidad dentro de un peso máximo. Tabla y almacenamiento:
   supabase/galeria.sql. Usa sb, $ y esc del script del panel.
   ============================================================ */
(function () {
  var BUCKET = 'galeria';
  var TAMANOS = {
    grande: { lado: 1600, maxKB: 260, calidades: [0.86, 0.82, 0.78, 0.74, 0.70] },
    mini:   { lado: 640,  maxKB: 70,  calidades: [0.82, 0.78, 0.74, 0.70, 0.66] }
  };
  var fotos = [];
  var cola = [];
  var cargada = false;

  window.abrirGaleria = function () { if (!cargada) { cargada = true; cargar(); } };

  /* ---------- Conversión: mejor calidad al menor peso ---------- */
  async function abrir(file) {
    // createImageBitmap respeta la orientación de la cámara (EXIF)
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
    }
    return await new Promise(function (ok, mal) {
      var i = new Image();
      i.onload = function () { ok(i); };
      i.onerror = function () { mal(new Error('El navegador no puede abrir este formato')); };
      i.src = URL.createObjectURL(file);
    });
  }
  // Reduce a la mitad por pasos hasta acercarse al tamaño final: más nítido que un solo salto
  function escalar(img, lado) {
    var w = img.width, h = img.height;
    var k = Math.min(1, lado / Math.max(w, h));
    var fw = Math.round(w * k), fh = Math.round(h * k);
    var origen = img, ow = w, oh = h;
    while (ow / 2 >= fw && oh / 2 >= fh) {
      var c = document.createElement('canvas');
      c.width = Math.round(ow / 2); c.height = Math.round(oh / 2);
      var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      x.drawImage(origen, 0, 0, c.width, c.height);
      origen = c; ow = c.width; oh = c.height;
    }
    var fin = document.createElement('canvas');
    fin.width = fw; fin.height = fh;
    var ctx = fin.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(origen, 0, 0, fw, fh);
    return fin;
  }
  function blob(canvas, tipo, q) { return new Promise(function (ok) { canvas.toBlob(ok, tipo, q); }); }
  async function codificar(canvas, t) {
    var tipo = 'image/webp', b = null;
    for (var i = 0; i < t.calidades.length; i++) {
      b = await blob(canvas, tipo, t.calidades[i]);
      if (b && b.type !== 'image/webp') { tipo = 'image/jpeg'; b = await blob(canvas, tipo, t.calidades[i]); } // navegadores sin WebP
      if (b && b.size <= t.maxKB * 1024) break;
    }
    if (!b) throw new Error('No se pudo convertir la imagen');
    return b;
  }
  async function convertir(file) {
    var img = await abrir(file);
    var grande = escalar(img, TAMANOS.grande.lado);
    var mini = escalar(grande, TAMANOS.mini.lado);
    var r = { grande: await codificar(grande, TAMANOS.grande), mini: await codificar(mini, TAMANOS.mini), ancho: grande.width, alto: grande.height };
    if (img.close) img.close();
    return r;
  }

  /* ---------- Cola de subida ---------- */
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1024) + ' KB'; }
  function titulo(nombre) { return nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  function anadir(files) {
    [].forEach.call(files, function (f) {
      if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) return;
      var item = { file: f, titulo: titulo(f.name), material: '', estado: 'Convirtiendo…', url: URL.createObjectURL(f) };
      cola.push(item);
      convertir(f).then(function (r) {
        item.res = r;
        item.estado = kb(f.size) + ' → ' + kb(r.grande.size) + ' (' + r.ancho + '×' + r.alto + ') + miniatura ' + kb(r.mini.size);
        pintarCola();
      }).catch(function (e) { item.error = e.message; item.estado = e.message; pintarCola(); });
    });
    pintarCola();
  }

  function pintarCola() {
    var c = $('gal-cola');
    if (!cola.length) { c.innerHTML = ''; return; }
    var listas = cola.filter(function (x) { return x.res; }).length;
    c.innerHTML = '<div class="gal-cola">' + cola.map(function (x, i) {
      return '<div class="gal-cola__item' + (x.error ? ' is-error' : '') + '">' +
        '<img src="' + x.url + '" alt="">' +
        '<div class="gal-cola__campos">' +
          '<input type="text" aria-label="Título" data-i="' + i + '" data-campo="titulo" value="' + esc(x.titulo) + '" placeholder="Título (opcional)">' +
          '<select aria-label="Material" data-i="' + i + '" data-campo="material"><option value="">Material…</option><option' + (x.material === 'PLA' ? ' selected' : '') + '>PLA</option><option' + (x.material === 'PETG' ? ' selected' : '') + '>PETG</option></select>' +
          '<span class="pista">' + esc(x.estado) + '</span>' +
        '</div>' +
        '<button type="button" class="btn-borrar" data-quitar="' + i + '">Quitar</button>' +
      '</div>';
    }).join('') + '</div>' +
    '<div class="gal-cola__acciones"><button type="button" class="btn" id="gal-subir"' + (listas ? '' : ' disabled') + '>Publicar ' + listas + (listas === 1 ? ' foto' : ' fotos') + '</button>' +
    '<button type="button" class="btn btn-cancelar" id="gal-vaciar">Cancelar</button></div>';
  }

  async function subir() {
    var btn = $('gal-subir'); btn.disabled = true; btn.textContent = 'Subiendo…';
    var minOrden = fotos.reduce(function (m, f) { return Math.min(m, f.orden || 0); }, 0);
    var pendientes = cola.filter(function (x) { return x.res; });
    for (var i = 0; i < pendientes.length; i++) {
      var x = pendientes[i];
      try {
        var ext = x.res.grande.type === 'image/webp' ? 'webp' : 'jpg';
        var base = (x.titulo || 'trabajo').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) + '-' + Date.now();
        var r1 = await sb.storage.from(BUCKET).upload(base + '.' + ext, x.res.grande, { contentType: x.res.grande.type, cacheControl: '31536000' });
        if (r1.error) throw r1.error;
        var r2 = await sb.storage.from(BUCKET).upload(base + '-640.' + ext, x.res.mini, { contentType: x.res.mini.type, cacheControl: '31536000' });
        if (r2.error) throw r2.error;
        var r3 = await sb.from('galeria').insert({
          titulo: x.titulo || null, material: x.material || null,
          imagen: sb.storage.from(BUCKET).getPublicUrl(base + '.' + ext).data.publicUrl,
          miniatura: sb.storage.from(BUCKET).getPublicUrl(base + '-640.' + ext).data.publicUrl,
          ancho: x.res.ancho, alto: x.res.alto, orden: minOrden - 1 - i, visible: true
        });
        if (r3.error) throw r3.error;
        cola.splice(cola.indexOf(x), 1);
      } catch (e) { x.estado = 'Error al subir: ' + (e.message || e); x.error = true; }
    }
    pintarCola();
    cargar();
  }

  /* ---------- Fotos publicadas ---------- */
  var SQL_AVISO = '<div class="aviso-sql"><p><strong>Falta preparar la galería en Supabase.</strong> En Supabase › SQL Editor ejecuta una vez el archivo <code>supabase/galeria.sql</code> de la carpeta de la web y vuelve a abrir esta pestaña.</p></div>';

  async function cargar() {
    var r = await sb.from('galeria').select('*').order('orden', { ascending: true }).order('creado', { ascending: false });
    if (r.error) {
      var falta = /does not exist|PGRST205|schema cache/i.test((r.error.message || '') + (r.error.code || ''));
      $('gal-lista').innerHTML = falta ? SQL_AVISO : '<p class="vacio">Error: ' + esc(r.error.message) + '</p>';
      return;
    }
    fotos = r.data || [];
    pintarLista();
  }

  function pintarLista() {
    var vis = fotos.filter(function (f) { return f.visible; }).length;
    $('gal-cuenta').textContent = '· ' + fotos.length + ' fotos, ' + vis + ' visibles en la web';
    if (!fotos.length) { $('gal-lista').innerHTML = '<p class="vacio">Aún no hay fotos. Sube las primeras arriba.</p>'; return; }
    $('gal-lista').innerHTML = '<div class="gal-rejilla">' + fotos.map(function (f, i) {
      return '<div class="gal-foto' + (f.visible ? '' : ' is-oculta') + '" data-id="' + f.id + '">' +
        '<a href="' + esc(f.imagen) + '" target="_blank" rel="noopener" aria-label="Ver foto en grande"><img src="' + esc(f.miniatura) + '" alt="" loading="lazy"></a>' +
        '<input type="text" aria-label="Título" data-id="' + f.id + '" data-campo="titulo" value="' + esc(f.titulo || '') + '" placeholder="Título (opcional)">' +
        '<div class="gal-foto__fila">' +
          '<select aria-label="Material" data-id="' + f.id + '" data-campo="material"><option value="">Material</option><option' + (f.material === 'PLA' ? ' selected' : '') + '>PLA</option><option' + (f.material === 'PETG' ? ' selected' : '') + '>PETG</option></select>' +
          '<label class="campo-inline"><input type="checkbox" data-id="' + f.id + '" data-campo="visible"' + (f.visible ? ' checked' : '') + '> Visible</label>' +
        '</div>' +
        '<div class="gal-foto__fila">' +
          '<button type="button" class="btn btn-cancelar" data-mover="-1" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Mover antes">↑</button>' +
          '<button type="button" class="btn btn-cancelar" data-mover="1" data-i="' + i + '"' + (i === fotos.length - 1 ? ' disabled' : '') + ' title="Mover después">↓</button>' +
          '<button type="button" class="btn-borrar" data-borrar="' + f.id + '">Borrar</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  async function guardar(id, campos) {
    var r = await sb.from('galeria').update(campos).eq('id', id);
    if (r.error) alert('Error al guardar: ' + r.error.message);
    var f = fotos.find(function (x) { return x.id === id; });
    if (f) Object.assign(f, campos);
    pintarLista();
  }

  async function mover(i, d) {
    var j = i + d; if (j < 0 || j >= fotos.length) return;
    var t = fotos[i]; fotos[i] = fotos[j]; fotos[j] = t;
    // Se renumera todo para que el orden quede limpio
    await Promise.all(fotos.map(function (f, k) { f.orden = k; return sb.from('galeria').update({ orden: k }).eq('id', f.id); }));
    pintarLista();
  }

  function rutaDe(url) { var m = '/storage/v1/object/public/' + BUCKET + '/'; var i = (url || '').indexOf(m); return i < 0 ? null : decodeURIComponent(url.slice(i + m.length)); }

  async function borrar(id) {
    var f = fotos.find(function (x) { return x.id === id; });
    if (!f || !confirm('¿Borrar esta foto de la galería?')) return;
    var r = await sb.from('galeria').delete().eq('id', id);
    if (r.error) { alert('Error: ' + r.error.message); return; }
    try { await sb.storage.from(BUCKET).remove([rutaDe(f.imagen), rutaDe(f.miniatura)].filter(Boolean)); } catch (e) {}
    cargar();
  }

  /* ---------- Eventos ---------- */
  var zona = $('gal-zona');
  $('gal-archivos').addEventListener('change', function (e) { anadir(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { zona.addEventListener(t, function (e) { e.preventDefault(); zona.classList.add('is-encima'); }); });
  ['dragleave', 'drop'].forEach(function (t) { zona.addEventListener(t, function (e) { e.preventDefault(); zona.classList.remove('is-encima'); }); });
  zona.addEventListener('drop', function (e) { anadir(e.dataTransfer.files); });

  $('gal-cola').addEventListener('input', function (e) {
    var i = e.target.getAttribute('data-i'); if (i == null) return;
    cola[+i][e.target.getAttribute('data-campo')] = e.target.value;
  });
  $('gal-cola').addEventListener('click', function (e) {
    var q = e.target.getAttribute('data-quitar');
    if (q != null) { cola.splice(+q, 1); pintarCola(); }
    if (e.target.id === 'gal-subir') subir();
    if (e.target.id === 'gal-vaciar') { cola = []; pintarCola(); }
  });
  $('gal-lista').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-id'), campo = e.target.getAttribute('data-campo');
    if (!id || !campo) return;
    var v = campo === 'visible' ? e.target.checked : (e.target.value.trim() || null);
    var c = {}; c[campo] = v; guardar(id, c);
  });
  $('gal-lista').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-mover')) mover(+b.getAttribute('data-i'), +b.getAttribute('data-mover'));
    if (b.hasAttribute('data-borrar')) borrar(b.getAttribute('data-borrar'));
  });
})();
