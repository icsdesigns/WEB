/* ============================================================
   SILAB 3D · Formulario «Hacer pedido» del visualizador
   (/visualizador/pedido/). Muestra lo elegido en el visualizador
   (diseño, colores, unidades y total), pide el boceto o
   archivo, el plazo y los datos de contacto, y envía el pedido a la
   misma función de Supabase que «Configura tu proyecto»
   (solicitar-presupuesto): guarda la solicitud con su localizador,
   avisa a SILAB 3D y deja el pedido para 3DCalc. Los adjuntos se
   suben como allí (autorizar-subida + bucket «solicitudes»).
   La elección llega por sessionStorage (visualizador.js, CLAVE_PEDIDO).
   ============================================================ */
(function () {
  'use strict';
  var CLAVE = 'silab3d-pedido-visualizador';
  var CONF = window.SILAB_SUPABASE || {};
  var sbClient = (window.supabase && CONF.url && CONF.anonKey) ? window.supabase.createClient(CONF.url, CONF.anonKey) : null;
  var MAX_BYTES = (Number(CONF.maxFileMB) || 50) * 1024 * 1024;
  var EXT = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'stl', 'step', 'stp', '3mf'];
  var $ = function (id) { return document.getElementById(id); };
  var euros = function (n) { return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

  var params = new URLSearchParams(location.search);
  if (params.get('embed') === '1') document.body.classList.add('vis-embed');

  var form = $('pedidoForm'), vacio = $('pedidoVacio');
  var datos = null;
  try { datos = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); } catch (e) { datos = null; }

  // Enlace de vuelta al visualizador con la elección hecha
  function urlVisor() {
    var base = '/visualizador/', q = new URLSearchParams();
    if (datos && datos.id) q.set('opcion', datos.id);
    q.set('volver', '1');
    if (params.get('embed') === '1') q.set('embed', '1');
    return base + '?' + q.toString();
  }
  document.querySelectorAll('[data-volver-visor]').forEach(function (a) { a.href = datos ? urlVisor() : '/visualizador/' + (params.get('embed') === '1' ? '?embed=1' : ''); });

  if (!datos || !Array.isArray(datos.colores)) { vacio.hidden = false; return; }
  form.hidden = false;

  /* ---------- Resumen de lo elegido ---------- */
  var tituloOpcion = 'Opción ' + datos.letra;
  $('vpResumenTit').textContent = tituloOpcion;
  if (datos.miniatura) { var img = $('pedidoImg'); img.src = datos.miniatura; img.hidden = false; }
  $('pedidoColores').innerHTML = datos.colores.map(function (c) {
    return '<li><span class="vp-chip" style="--m:' + esc(c.hex) + '"></span><span><b>Color ' + esc(c.letra) + '</b> · ' + esc(c.nombre || c.hex) + '</span></li>';
  }).join('');
  $('pedidoUds').textContent = datos.unidades + (datos.unidades === 1 ? ' unidad' : ' unidades') + (datos.unidad != null ? ' · ' + euros(datos.unidad) + ' por unidad' : '');
  if (datos.total != null) { $('pedidoPrecio').hidden = false; $('pedidoTotal').textContent = euros(datos.total); }

  /* ---------- Archivos ---------- */
  var archivos = [], seq = 0;
  var lista = $('pedidoLista'), errArchivos = $('errArchivos');
  var ext = function (n) { var i = String(n).lastIndexOf('.'); return i >= 0 ? String(n).slice(i + 1).toLowerCase() : ''; };
  var kb = function (b) { return b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; };
  function errorArchivo(t) { errArchivos.textContent = t; errArchivos.classList.add('show'); }
  function pintarArchivos() {
    lista.innerHTML = archivos.map(function (a) {
      var estado = { uploading: 'Subiendo…', done: '✓ Subido', error: '✕ Error' }[a.estado] || 'Se enviará con el pedido';
      return '<div class="reference-file"><span class="reference-file-icon">' + (/^image\//.test(a.file.type) ? '🖼️' : '🧊') + '</span>' +
        '<div class="reference-file-info"><div class="reference-file-name" title="' + esc(a.file.name) + '">' + esc(a.file.name) + '</div>' +
        '<div class="reference-file-sub"><span class="reference-file-meta">' + kb(a.file.size) + '</span><span class="reference-file-status ' + a.estado + '">' + estado + '</span></div></div>' +
        '<button type="button" class="reference-file-remove" data-quitar="' + a.id + '" aria-label="Quitar archivo">✕</button></div>';
    }).join('');
    var total = archivos.reduce(function (s, a) { return s + a.file.size; }, 0);
    $('pedidoTotalArchivos').textContent = archivos.length ? archivos.length + (archivos.length === 1 ? ' archivo' : ' archivos') + ' · ' + kb(total) : 'Ningún archivo seleccionado';
  }
  function anadir(files) {
    errArchivos.classList.remove('show');
    Array.prototype.forEach.call(files || [], function (f) {
      if (EXT.indexOf(ext(f.name)) < 0) { errorArchivo('“' + f.name + '” no es un formato admitido (PNG, JPG, SVG, STL, STEP o 3MF).'); return; }
      if (f.size > MAX_BYTES) { errorArchivo('“' + f.name + '” supera el límite de ' + (CONF.maxFileMB || 50) + ' MB.'); return; }
      if (archivos.some(function (a) { return a.file.name === f.name && a.file.size === f.size; })) return;
      if (archivos.length >= 10) { errorArchivo('Puedes adjuntar hasta 10 archivos. Si necesitas más, envíanoslos por WhatsApp con tu localizador.'); return; }
      archivos.push({ id: 'a' + (++seq), file: f, estado: 'pending', ruta: null });
    });
    pintarArchivos();
  }
  $('pedidoArchivos').addEventListener('change', function (e) { anadir(e.target.files); e.target.value = ''; });
  var drop = $('pedidoDrop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('dragover'); }); });
  ['dragleave', 'dragend', 'drop'].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove('dragover'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer) anadir(e.dataTransfer.files); });
  lista.addEventListener('click', function (e) {
    var b = e.target.closest('[data-quitar]');
    if (b) { archivos = archivos.filter(function (a) { return a.id !== b.getAttribute('data-quitar'); }); pintarArchivos(); }
  });

  function slug(nombre) {
    var e = ext(nombre), base = e ? nombre.slice(0, nombre.length - e.length - 1) : nombre;
    base = String(base).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo';
    return base + (e ? '.' + e : '');
  }
  // Mismo método que «Configura tu proyecto»: permiso de subida (límite mensual) y envío a Storage; sin la función, subida directa
  async function subir(a) {
    if (!sbClient) { a.estado = 'error'; a.motivo = 'sin conexión con el almacenamiento'; return; }
    a.estado = 'uploading'; pintarArchivos();
    try {
      var bucket = CONF.bucket || 'solicitudes';
      var opc = { cacheControl: '3600', upsert: false, contentType: a.file.type || 'application/octet-stream' };
      var ruta = null, up = null;
      if (CONF.autorizarSubida) {
        var permiso = null;
        try {
          var rp = await fetch(CONF.autorizarSubida, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CONF.anonKey, apikey: CONF.anonKey },
            body: JSON.stringify({ nombre: a.file.name, bytes: a.file.size, tipo: a.file.type || '' })
          });
          permiso = { ok: rp.ok, status: rp.status, datos: await rp.json().catch(function () { return {}; }) };
        } catch (e) { permiso = null; }
        if (permiso && !permiso.ok && permiso.status !== 404) { a.motivo = permiso.datos.error || ('HTTP ' + permiso.status); throw new Error(a.motivo); }
        if (permiso && permiso.ok) { ruta = permiso.datos.ruta; up = await sbClient.storage.from(bucket).uploadToSignedUrl(ruta, permiso.datos.token, a.file, opc); }
      }
      if (!up) {
        ruta = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + slug(a.file.name);
        up = await sbClient.storage.from(bucket).upload(ruta, a.file, opc);
      }
      if (up.error) throw up.error;
      a.ruta = ruta; a.estado = 'done';
    } catch (err) {
      a.estado = 'error'; a.motivo = a.motivo || (err && err.message) || '';
      console.error('Subida del adjunto:', err);
    }
    pintarArchivos();
  }

  /* ---------- Plazo ---------- */
  var opcionesPlazo = Array.prototype.map.call(document.querySelectorAll('input[name="pedidoPlazo"]'), function (r) { return r.closest('.plazo-option'); });
  var grupoFecha = $('pedidoFechaGrupo'), campoFecha = $('pedidoFecha');
  var minFecha = new Date(); minFecha.setHours(0, 0, 0, 0); minFecha.setDate(minFecha.getDate() + 2);   // a partir de 2 días, como en el formulario
  campoFecha.min = minFecha.getFullYear() + '-' + String(minFecha.getMonth() + 1).padStart(2, '0') + '-' + String(minFecha.getDate()).padStart(2, '0');
  var plazo = function () { var c = document.querySelector('input[name="pedidoPlazo"]:checked'); return c ? c.value : null; };
  opcionesPlazo.forEach(function (o) {
    o.querySelector('input').addEventListener('change', function () {
      opcionesPlazo.forEach(function (x) { x.classList.toggle('selected', x.querySelector('input').checked); });
      $('errPlazo').classList.remove('show');
      var urgente = plazo() === 'urgente';
      grupoFecha.hidden = !urgente; campoFecha.required = urgente;
      if (!urgente) { campoFecha.value = ''; campoFecha.classList.remove('input-error'); $('errFecha').classList.remove('show'); }
    });
  });
  campoFecha.addEventListener('input', function () { campoFecha.classList.remove('input-error'); $('errFecha').classList.remove('show'); });
  var fechaTexto = function () { var p = campoFecha.value.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };

  /* ---------- Entrega ---------- */
  var entrega = function () { var c = document.querySelector('input[name="pedidoEntrega"]:checked'); return c ? c.value : null; };
  var grupoDir = $('pedidoDireccionGrupo'), campoDir = $('pedidoDireccion');
  grupoDir.style.display = 'none';   // solo se muestra con «Envío»
  Array.prototype.forEach.call(document.querySelectorAll('input[name="pedidoEntrega"]'), function (r) {
    r.addEventListener('change', function () {
      Array.prototype.forEach.call(document.querySelectorAll('input[name="pedidoEntrega"]'), function (x) { x.closest('.plazo-option').classList.toggle('selected', x.checked); });
      $('errEntrega').classList.remove('show');
      var envio = entrega() === 'envio';
      grupoDir.hidden = !envio; grupoDir.style.display = envio ? '' : 'none'; campoDir.required = envio;
      if (!envio) { campoDir.value = ''; campoDir.classList.remove('input-error'); $('errDireccion').classList.remove('show'); }
    });
  });
  campoDir.addEventListener('input', function () { campoDir.classList.remove('input-error'); $('errDireccion').classList.remove('show'); });

  /* ---------- Envío ---------- */
  var nombre = $('pedidoNombre'), telefono = $('pedidoTelefono');
  [[nombre, 'errNombre'], [telefono, 'errTelefono']].forEach(function (p) { p[0].addEventListener('input', function () { p[0].classList.remove('input-error'); $(p[1]).classList.remove('show'); }); });
  function marcar(campo, errId, ok) { campo.classList.toggle('input-error', !ok); $(errId).classList.toggle('show', !ok); return ok; }
  function validar() {
    var okPlazo = !!plazo(); $('errPlazo').classList.toggle('show', !okPlazo);
    var okFecha = plazo() !== 'urgente' || (!!campoFecha.value && campoFecha.checkValidity()); if (plazo() === 'urgente') marcar(campoFecha, 'errFecha', okFecha);
    var okArch = archivos.length > 0; $('errArchivos').textContent = okArch ? '' : 'Adjunta el boceto o archivo de diseño: es obligatorio para personalizar tu producto.'; $('errArchivos').classList.toggle('show', !okArch);
    var okEnt = !!entrega(); $('errEntrega').classList.toggle('show', !okEnt);
    var okDir = entrega() !== 'envio' || marcar(campoDir, 'errDireccion', campoDir.value.trim() !== '');
    var okNom = marcar(nombre, 'errNombre', nombre.value.trim() !== '');
    var okTel = marcar(telefono, 'errTelefono', telefono.value.trim() !== '' && telefono.checkValidity());
    var primero = !okArch ? $('pedidoDrop') : !okPlazo ? document.querySelector('.plazo-selector') : !okFecha ? campoFecha : !okEnt ? document.querySelectorAll('.plazo-selector')[1] : !okDir ? campoDir : !okNom ? nombre : !okTel ? telefono : null;
    if (primero) { primero.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (primero.focus && (primero.tagName === 'INPUT' || primero.tagName === 'TEXTAREA')) primero.focus({ preventScroll: true }); }
    return !primero;
  }

  function resumenColores() { return datos.colores.map(function (c) { return 'Color ' + c.letra + ': ' + (c.nombre || c.hex); }); }
  // Mismos nombres que en «Configura tu proyecto» (catálogo de la web; «(PETG)» en PETG) para que 3DCalc los preseleccione
  function coloresWeb() {
    var petg = /petg/i.test(datos.material), nombres = [];
    datos.colores.forEach(function (c) {
      if (!c.nombre) return;
      var n = petg ? c.nombre + ' (PETG)' : c.nombre;
      if (nombres.indexOf(n) < 0) nombres.push(n);
    });
    return { resumen: nombres.length ? nombres.join(', ') : 'Indeterminado', grupos: [petg ? 'petg' : 'pla'], colores: nombres };
  }
  // Enlace directo al archivo: la función de Supabase lo cambia por uno firmado cuando puede; si no, el correo lleva este
  function urlPublica(ruta) { try { return sbClient.storage.from(CONF.bucket || 'solicitudes').getPublicUrl(ruta).data.publicUrl; } catch (e) { return ''; } }
  function construirPedido(rutas) {
    var textoPlazo = plazo() === 'urgente' ? 'Urgente' + (fechaTexto() ? ' (fecha necesaria: ' + fechaTexto() + ')' : '') : 'Flexible';
    var desc = ['Pedido desde el visualizador 3D.', 'Diseño: ' + tituloOpcion, 'Colores: ' + resumenColores().join('; '),
      'Unidades: ' + datos.unidades,
      entrega() === 'envio' ? 'Entrega: ENVÍO a: ' + campoDir.value.trim().replace(/\s*\n\s*/g, ', ') : 'Entrega: EN MANO (recogida en Salamanca)',
      datos.unidad != null ? 'Precio mostrado en la web: ' + euros(datos.unidad) + ' por unidad · total ' + euros(datos.total) + ' (envío no incluido). Lo calcula la web: importe definitivo para el cliente.' : 'Sin precio configurado para este diseño.'].join('\n');
    var tipo = /petg/i.test(datos.material) ? 'resistentes' : 'artisticas';
    return {
      fecha: new Date().toISOString(),
      cliente: { nombre: nombre.value.trim(), telefono: telefono.value.trim() },
      proyecto: { nombre: 'Pedido visualizador · ' + tituloOpcion + ' × ' + datos.unidades, descripcion: desc, tipo: tipo, tipoTexto: 'Pedido del visualizador 3D (' + datos.material + ')' },
      archivos: { opcion: rutas.length ? 'otros' : 'ninguno', opcionTexto: rutas.length ? 'Archivos adjuntos con el pedido' : 'Sin archivos adjuntos', urls: rutas.map(urlPublica).filter(Boolean), rutas: rutas, medidas: null },
      tasadora: null,
      colores: coloresWeb(),
      plazo: { tipo: plazo(), texto: textoPlazo, fecha: campoFecha.value || null },
      pedido_visualizador: { entrega: entrega(), direccion: entrega() === 'envio' ? campoDir.value.trim() : null, opcion: datos.id, letra: datos.letra, material: datos.material, unidades: datos.unidades, precio_unidad: datos.unidad, total: datos.total,
        colores: datos.colores.map(function (c) { return { letra: c.letra, hex: c.hex, original: c.original, nombre: c.nombre || null }; }) }
    };
  }
  var solicitudEnviada = null;
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (solicitudEnviada || !validar()) return;
    var boton = $('pedidoEnviarBoton'), err = $('errEnviar');
    err.classList.remove('show'); boton.disabled = true;
    try {
      var pendientes = archivos.filter(function (a) { return a.estado !== 'done'; });
      if (pendientes.length) { boton.textContent = 'Subiendo archivos…'; await Promise.all(pendientes.map(subir)); }
      var sinSubir = archivos.filter(function (a) { return a.estado === 'error'; });
      if (!archivos.some(function (x) { return x.estado === 'done'; })) { err.textContent = 'No hemos podido subir tu archivo de diseño, y es obligatorio. Inténtalo de nuevo o escríbenos por WhatsApp.'; err.classList.add('show'); boton.disabled = false; boton.textContent = 'Enviar pedido'; return; }
      boton.textContent = 'Enviando…';
      var pedido = construirPedido(archivos.filter(function (a) { return a.estado === 'done' && a.ruta; }).map(function (a) { return a.ruta; }));
      var r = await fetch(CONF.solicitudes, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CONF.anonKey, apikey: CONF.anonKey },
        body: JSON.stringify(pedido)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      solicitudEnviada = await r.json();
      mostrarEnviado(solicitudEnviada, pedido, sinSubir);
      try { sessionStorage.removeItem(CLAVE); } catch (x) { /* nada */ }
      if (window.silabEvento) window.silabEvento('pedido-visualizador', { opcion: datos.letra, unidades: datos.unidades });
    } catch (ex) {
      console.error('Pedido:', ex);
      err.textContent = 'No hemos podido enviar el pedido. Inténtalo de nuevo o escríbenos por WhatsApp.';
      err.classList.add('show');
    } finally {
      boton.disabled = false; boton.textContent = 'Enviar pedido';
    }
  });

  function mostrarEnviado(res, pedido, sinSubir) {
    $('pedidoLocalizador').textContent = res.localizador;
    var texto = 'Hemos recibido tu pedido. Te confirmaremos el plazo en menos de 24 horas laborables. Guarda tu localizador para cualquier consulta.';
    if (sinSubir.length) texto += ' No hemos podido subir ' + sinSubir.map(function (a) { return '«' + a.file.name + '»'; }).join(', ') + (sinSubir[0].motivo ? ' (' + sinSubir[0].motivo.replace(/\.\s*$/, '') + ')' : '') + ': mándanoslo por WhatsApp con tu localizador.';
    $('pedidoEnviadoTexto').textContent = texto;
    var frase = '¡Hola! Soy ' + pedido.cliente.nombre + '. Os escribo por mi pedido ' + res.localizador + '.';
    $('pedidoWhatsApp').href = 'https://wa.me/34644070487?text=' + encodeURIComponent(frase);
    $('pedidoEmail').href = 'https://mail.google.com/mail/?view=cm&fs=1&to=silab3d@gmail.com&su=' + encodeURIComponent('Pedido ' + res.localizador) + '&body=' + encodeURIComponent(frase);
    $('pedidoEnviarCaja').hidden = true;
    $('pedidoContacto').hidden = false; $('pedidoContacto').classList.add('active');
    $('pedidoContacto').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Copia del resumen al email del cliente (la envía la función de Supabase, como en «Configura tu proyecto»)
  var copiaBoton = $('pedidoCopiaEnviar');
  copiaBoton.addEventListener('click', async function () {
    var campo = $('pedidoCopiaEmail'), est = $('pedidoCopiaEstado'), email = campo.value.trim();
    if (!email || !campo.checkValidity()) { campo.reportValidity(); return; }
    if (!solicitudEnviada) return;
    copiaBoton.disabled = true; est.className = 'ct-copia__estado'; est.textContent = 'Enviando…';
    try {
      var r = await fetch(CONF.solicitudes, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CONF.anonKey, apikey: CONF.anonKey },
        body: JSON.stringify({ accion: 'copia', localizador: solicitudEnviada.localizador, email: email })
      });
      var res = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(res.error || ('HTTP ' + r.status));
      est.textContent = 'Listo: te hemos enviado una copia a ' + email + '. Si no la ves, revisa la carpeta de spam.'; est.classList.add('ok');
    } catch (ex) {
      est.textContent = 'No hemos podido enviar la copia (' + ex.message + '). Inténtalo de nuevo más tarde.'; est.classList.add('error');
    } finally { copiaBoton.disabled = false; }
  });
})();
