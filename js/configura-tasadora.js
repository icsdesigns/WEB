/* ============================================================
   SILAB 3D · Configura tu proyecto · Tasadora (página 2)
   Con «Archivos de diseño», el cliente sube sus STL / STEP / 3MF y
   ve al momento filamento y tiempo, con el motor del Presupuesto
   instantáneo tal cual (mismo motor).

   Varios archivos (o un 3MF con varias camas): cada archivo o cama es una
   «cama» que se navega con las flechas del visor. Los parámetros de impresión
   (definición, refuerzo, densidad y color) son los mismos para todas; el
   tamaño es de cada cama. El resumen suma las camas.

   Dos modos: «Normal» (definición, refuerzo y densidad Normal, tamaño
   predeterminado y color automático según los archivos) y «Personalizado»
   (definición, refuerzo, densidad, color y medidas a elección).
   Umbrales (por cama): lado más largo > 20 cm, volumen < 4 cm³ o tiempo > 15 h.
   Si se supera alguno, el cliente elige entre dejarlo como está (revisión manual
   del equipo técnico) o el ajuste automático del diagrama «Umbrales_Diagrama de
   flujo» (ver evaluar()). Igual para piezas resistentes y artísticas.
   Las medidas que se muestran y se editan son las de los ejes del propio archivo;
   la orientación de impresión (automática) solo se usa para calcular.
   ============================================================ */
import { OPCIONES, IMPRESORA, estimar, necesitaSoportes, formatoTiempo, rasgosParaServidor, MOTOR_REVISION } from './presupuesto-motor.js?v=20261008a';
import { DEFECTO as CFG_DEFECTO, GRUPOS, GRUPOS_NORMAL, mezclar, opcionesVisibles, cargarConfigTasadora } from './tasadora-config.js?v=20261005a';

// Límites y opciones visibles: los de DEFECTO hasta que llegan los guardados en el panel de administración (config_tasadora)
let cfg = CFG_DEFECTO;
const MAX_SUBIDA_MB = (window.SILAB_SUPABASE && window.SILAB_SUPABASE.maxFileMB) || 50;   // por encima no se adjuntan a la solicitud (Supabase)
// De más a menos: «reducir» es pasar a la siguiente opción de la lista
// y hasta dónde puede bajar cada parámetro en el reajuste (suelo)
const ORDEN = {
  definicion: ['impecable', 'elevada', 'normal'],   // más definición → menos (Normal ya es la más baja)
  densidad: ['compacto', 'normal', 'ligero'],
  pared: ['reforzado', 'normal', 'reducido']
};

const $ = (id) => document.getElementById(id);
const el = {
  caja: $('refTasadora'), visor: $('piVisor'), lienzo: $('piLienzo'), archivo: $('piArchivo'), estado: $('piEstado'), estadoTexto: $('piEstadoTexto'),
  barra: $('piBarra'), nombre: $('piNombre'), pos: $('piPos'), medidas: $('piMedidas'), leyenda: $('piLeyenda'), cambiar: $('piCambiar'), anadir: $('piAnadir'), error: $('piError'),
  ant: $('piAnt'), sig: $('piSig'),
  resultado: $('piResultado'), cifras: $('piCifras'), gramos: $('piGramos'), tiempo: $('piTiempo'), nota: $('piNota'),
  revision: $('piRevision'), revisionTexto: $('piRevisionTexto'),
  opciones: $('piOpciones'), coloresExtra: $('piColoresExtra'), colores: $('piColores'), alturaExtra: $('piAlturaExtra'), dim: [$('piDimX'), $('piDimY'), $('piDimZ')],
  aviso: $('piAviso'), avisoTitulo: $('piAvisoTitulo'), avisoTexto: $('piAvisoTexto'), avisoMalla: $('piAvisoMalla')
};

// Parámetros comunes a todas las camas
const sel = { modo: 'normal', umbral: 'pendiente', definicion: 'normal', pared: 'normal', densidad: 'normal', color: 'mono', altura: 'predeterminada', prop: 'si', ultima: 2 };
// Cada cama: { nombre, placa, pos, u, rasgos, colores, modificadores, mallaNoValida, f: [fx, fy, fz] (factores de medida), nu }
const st = { archivos: [], camas: [], i: 0, modificadores: [], mallaNoValida: false, res: null, anadir: false, mensajeCarga: '' };
const cama = () => st.camas[st.i];

if (el.caja) {
  iniciar();
  // Ajustes del panel de administración (máx. 2,5 s; si falla, siguen los de siempre)
  cargarConfigTasadora().then((c) => { if (c !== CFG_DEFECTO) aplicarConfig(c); });
}

function iniciar() {
  /* ---------- Opciones del cliente: parámetros, tamaño y color (controles segmentados) ---------- */
  pintarControles();
  marcar();
  // Modo de impresión y elección ante los umbrales
  $('piModo').addEventListener('change', (e) => {
    sel.modo = e.target.value;
    st.informe = null;
    if (sel.modo === 'normal') restablecerNormal();
    marcar();
    recalcular(true);
  });
  // «Ajustar»: se abre el panel Personalizado con los parámetros que resultan del reajuste automático;
  // «Dejar como está»: se queda como está y lo revisa el equipo técnico
  $('piUmbral').addEventListener('change', (e) => {
    if (e.target.value === 'ajustar') {
      sel.umbral = 'ajustar';
      const ev = evaluar(), { conf, escalas, revision } = ev;
      // Si el ajuste no es posible (p. ej. una pieza larga y finísima), se queda como está y va a revisión manual
      if (revision) { sel.umbral = 'imposible'; recalcular(true); return; }
      // Se informa de las modificaciones realizadas hasta que el cliente vuelva a tocar algo
      st.informe = ev.ajustes.map((a) => textoAjuste(a, ev));
      Object.assign(sel, { modo: 'personalizado', umbral: 'pendiente', definicion: conf.definicion, pared: conf.pared, densidad: conf.densidad, color: conf.color });
      // Medidas resultantes: el factor de cada eje por la escala del reajuste
      const personalizada = sel.altura === 'personalizada';
      // La escala del reajuste ya incluye la medida uniforme elegida; con medidas independientes se multiplica por eje
      st.camas.forEach((c, k) => { c.f = personalizada && sinProporcion(c) ? c.f.map((v) => v * escalas[k]) : [escalas[k], escalas[k], escalas[k]]; });
      if (!uniforme(cama().f)) sel.prop = 'no';
      sel.altura = st.camas.some((c) => c.f.some((v) => Math.abs(v - 1) > 1e-9)) ? 'personalizada' : 'predeterminada';
      mostrarDims();
      marcar();
    } else sel.umbral = 'dejar';
    recalcular(true);
  });
  el.opciones.addEventListener('change', (e) => {
    const t = e.target;
    if (sel.umbral === 'imposible') sel.umbral = 'pendiente';
    st.informe = null;
    if (t.type === 'radio') {
      sel[t.name.slice(3)] = t.value;
      if (t.name === 'pi-altura' && t.value === 'personalizada') mostrarDims();
      if (t.name === 'pi-altura' && t.value === 'predeterminada') st.camas.forEach((c) => { c.f = [1, 1, 1]; });
      if (t.name === 'pi-prop' && t.value === 'si' && cama() && !uniforme(cama().f)) {   // al volver a proporcional se parte de la última medida editada
        const k = cama().f[sel.ultima]; cama().f = [k, k, k]; mostrarDims();
      }
      marcar();
      recalcular(t.name === 'pi-altura' || t.name === 'pi-definicion');
    } else if (t === el.colores) recalcular(false);
  });
  // Largo, ancho y alto de la cama que se está viendo: proporcionales (las tres cambian juntas) o independientes
  el.dim.forEach((inp, i) => inp.addEventListener('input', () => {
    const c = cama();
    const v = Math.min(1000, parseFloat(String(inp.value).replace(',', '.'))), d = c ? dims0(c) : [0, 0, 0];
    if (!(v > 0) || !d[i]) return;
    sel.ultima = i;
    if (sel.umbral === 'imposible') sel.umbral = 'pendiente';
    st.informe = null;
    if (sel.prop === 'si') { const k = v / d[i]; c.f = [k, k, k]; } else c.f = c.f.map((x, j) => (j === i ? v / d[i] : x));
    mostrarDims(i);
    recalcular(true);
  }));

  /* ---------- Carga (varios archivos a la vez) ---------- */
  el.archivo.addEventListener('change', () => { if (el.archivo.files.length) cargar([...el.archivo.files], st.anadir); el.archivo.value = ''; st.anadir = false; });
  el.cambiar.addEventListener('click', () => { st.anadir = false; el.archivo.click(); });
  el.anadir.addEventListener('click', () => { st.anadir = true; el.archivo.click(); });
  ['dragenter', 'dragover'].forEach((ev) => el.visor.addEventListener(ev, (e) => { e.preventDefault(); el.visor.classList.add('is-arrastrando'); }));
  ['dragleave', 'drop'].forEach((ev) => el.visor.addEventListener(ev, (e) => { e.preventDefault(); el.visor.classList.remove('is-arrastrando'); }));
  el.visor.addEventListener('drop', (e) => { const fs = [...e.dataTransfer.files]; if (fs.length) cargar(fs, false); });

  // Botón de alerta: vuelve a abrir la ventana de ajustar / dejar como está
  $('piAlerta').addEventListener('click', () => { sel.umbral = 'pendiente'; recalcular(false); });

  // Navegación entre camas
  el.ant.addEventListener('click', () => irA(st.i - 1));
  el.sig.addEventListener('click', () => irA(st.i + 1));
  el.visor.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') irA(st.i - 1); else if (e.key === 'ArrowRight') irA(st.i + 1); });

  // El tipo de proyecto (página 1) decide si se reajusta o va a revisión manual
  document.querySelectorAll('input[name="projectPieceType"]').forEach((r) => r.addEventListener('change', () => recalcular(false)));

  window.silabTasadora = {
    archivo: () => st.archivos[0] || null,
    mostrar: () => { equilibrar(); if (visor) { visor.dimensionar(); visor.pintar(); } },
    // Punto de unión con el mensaje de WhatsApp / correo (ver configura-tu-proyecto.js)
    resumen,
    // Funciones extra del panel de administración (js/admin-tasadora.js): añadir archivos generados y quitar camas
    aplicarConfig,
    cargar: (files, anadir = true) => cargar(files, anadir),
    quitarCama,
    camas: () => st.camas.map((c) => c.nombre),
    actual: () => st.i
  };
}

// Controles segmentados de cada grupo, solo con las opciones visibles y los textos configurados en el panel
function pintarControles() {
  for (const fs of el.opciones.querySelectorAll('.pi-opcion')) {
    const g = fs.dataset.grupo;
    fs.querySelectorAll(':scope > .pi-seg').forEach((x) => x.remove());
    const seg = document.createElement('div');
    seg.className = 'pi-seg';
    for (const [clave, o] of opcionesVisibles(OPCIONES, cfg, g)) {
      const l = document.createElement('label');
      const ayuda = g === 'altura' && clave === 'personalizada' && o.ayuda === OPCIONES.altura.personalizada.ayuda ? 'Elige las medidas' : o.ayuda;
      l.innerHTML = '<input type="radio" name="pi-' + g + '" value="' + clave + '"><span><b>' + escHtml(o.rotulo) + '</b><small>' + escHtml(ayuda) + '</small></span>';
      seg.appendChild(l);
    }
    fs.querySelector('legend').after(seg);
  }
}
function escHtml(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Una opción elegida que deja de estar visible pasa al valor Normal (o a la primera visible)
function normalizarOpciones() {
  for (const g of Object.keys(GRUPOS)) {
    const vis = opcionesVisibles(OPCIONES, cfg, g).map(([k]) => k);
    if (vis.includes(sel[g])) continue;
    const normal = GRUPOS_NORMAL.includes(g) ? cfg.normal[g] : null;
    sel[g] = vis.includes(normal) ? normal : vis.includes('predeterminada') ? 'predeterminada' : vis[0];
  }
}
// Ajustes guardados en el panel: se aplican al momento (también los llama el panel de administración)
function aplicarConfig(c) {
  cfg = mezclar(CFG_DEFECTO, c || {});
  pintarControles();
  normalizarOpciones();
  const ayuda = el.caja.querySelector('.pi-carga__ayuda');
  if (ayuda) ayuda.textContent = 'STL, STEP o 3MF · puedes subir varios · hasta ' + cfg.limites.maxMB + ' MB';
  if (sel.modo === 'normal') restablecerNormal();
  marcar();
  if (st.camas.length) recalcular(false);
}

function marcar() {
  for (const [g, v] of Object.entries(sel)) {
    const i = el.caja.querySelector(`input[name="pi-${g}"][value="${v}"]`);
    if (i) i.checked = true;
  }
  el.coloresExtra.hidden = sel.color !== 'multi';
  el.alturaExtra.hidden = sel.altura !== 'personalizada';
  el.opciones.hidden = sel.modo === 'normal';
  $('piModoNota').textContent = sel.modo === 'normal'
    ? 'Definición, refuerzo y densidad Normal, tamaño del archivo y color según el archivo.' : '';
}
// Modo Normal: todo en Normal, tamaño predeterminado y color automático (el de los archivos)
function restablecerNormal() {
  Object.assign(sel, { definicion: cfg.normal.definicion, pared: cfg.normal.pared, densidad: cfg.normal.densidad, altura: 'predeterminada', prop: 'si', color: st.colorAuto || 'mono' });
  st.camas.forEach((c) => { c.f = [1, 1, 1]; });
  el.dim.forEach((i) => { i.value = ''; });
  if (st.coloresAuto) el.colores.value = String(st.coloresAuto);
}

// Medidas de una cama a escala 1 (largo, ancho, alto) y su reparto en los campos
const uniforme = (f) => Math.max(...f) / Math.min(...f) - 1 < 1e-6;
const claveF = (c) => c.f.map((v) => v.toFixed(5)).join(',');
const sinProporcion = (c) => sel.altura === 'personalizada' && !uniforme(c.f);
function dims0(c) { return c.dims; }
function mostrarDims(salvo) {
  const c = cama();
  if (!c) return;
  const d = dims0(c);
  el.dim.forEach((inp, i) => { if (i !== salvo) inp.value = String(Math.round(d[i] * c.f[i] * 10) / 10); });
  // Rótulos: largo = la mayor de las dos medidas horizontales
  const nombres = d[0] >= d[1] ? ['Largo', 'Ancho', 'Alto'] : ['Ancho', 'Largo', 'Alto'];
  el.dim.forEach((i, k) => { i.closest('.pi-dim').firstElementChild.textContent = nombres[k]; });
}

// Ventana emergente simple (p. ej. archivo demasiado grande)
function ventana(titulo, texto) {
  let d = $('piVentana');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'piVentana'; d.className = 'pi-ventana';
    d.innerHTML = '<p class="pi-ventana__titulo"></p><p class="pi-ventana__texto"></p><form method="dialog"><button class="s3d-btn s3d-btn--primary">Entendido</button></form>';
    document.body.appendChild(d);
  }
  d.querySelector('.pi-ventana__titulo').textContent = titulo;
  d.querySelector('.pi-ventana__texto').textContent = texto;
  if (d.showModal) d.showModal(); else alert(titulo + '\n' + texto);
}

function error(msg) { el.error.textContent = msg; el.error.hidden = !msg; }
function estado(msg) { el.estado.hidden = !msg; if (msg) el.estadoTexto.textContent = msg; }

let trabajador = null;
function analizar(buf, ext, nombre) {
  if (trabajador) trabajador.terminate();
  trabajador = new Worker(new URL('./configura-tasadora-analisis.js?v=20261005a', import.meta.url), { type: 'module' });
  return new Promise((ok, ko) => {
    trabajador.onmessage = ({ data }) => {
      if (data.paso) return estado(data.paso);
      trabajador.terminate(); trabajador = null;
      data.ok ? ok(data) : ko(new Error(data.error));
    };
    trabajador.onerror = (e) => { trabajador = null; ko(e); };
    trabajador.postMessage({ buf, ext, nombre }, [buf]);
  });
}

async function cargar(files, anadir) {
  error(''); st.mensajeCarga = ''; st.informe = null;
  const validos = [], rechazos = [], grandes = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace('stp', 'step');
    if (!['stl', '3mf', 'step'].includes(ext)) rechazos.push('«' + file.name + '»: formato no admitido (STL, STEP o 3MF)');
    else if (file.size > cfg.limites.maxMB * 1024 * 1024) grandes.push(file.name);
    else validos.push({ file, ext });
  }
  if (grandes.length) ventana('Archivo demasiado grande', (grandes.length === 1 ? '«' + grandes[0] + '» supera' : 'Estos archivos superan') + ' el tamaño máximo de ' + cfg.limites.maxMB + ' MB' + (grandes.length > 1 ? ': ' + grandes.map((n) => '«' + n + '»').join(', ') : '') + '. Te recomendamos subir archivos simplificados.');
  if (!validos.length) { if (rechazos.length) error(rechazos.join('. ') + '.'); return; }
  if (!anadir) { st.archivos = []; st.camas = []; st.i = 0; if (visor) visor.quitar(); }
  const primera = st.camas.length;
  // Los archivos se adjuntan a la solicitud aunque no se pudieran analizar (los revisaría el equipo)
  for (const v of validos) if (!st.archivos.some((f) => f.name === v.file.name && f.size === v.file.size)) st.archivos.push(v.file);
  document.dispatchEvent(new CustomEvent('silab:tasadora-archivos', { detail: { files: [...st.archivos] } }));
  el.visor.classList.add('tiene-modelo');
  el.barra.hidden = false;
  el.medidas.hidden = true;
  const fallos = [];
  try {
    await cargarVisor();
    for (let k = 0; k < validos.length; k++) {
      const { file, ext } = validos[k];
      estado(validos.length > 1 ? 'Leyendo el archivo ' + (k + 1) + ' de ' + validos.length + '…' : 'Leyendo el modelo…');
      try {
        const res = await analizar(await file.arrayBuffer(), ext, file.name);
        for (const c of res.camas) {
          st.camas.push({ archivo: file, nombre: c.nombre, placa: c.placa, pos: c.pos, u: c.u, rasgos: c.r, dims: c.dims, colores: c.colores, modificadores: c.modificadores, f: [1, 1, 1], nu: null,
            mallaNoValida: !!Object.values(c.r)[0].mallaNoValida });
        }
      } catch (e) { console.error(e); fallos.push(file.name); }
    }
  } finally { estado(''); }
  const sinSubir = st.archivos.filter((f) => f.size > MAX_SUBIDA_MB * 1024 * 1024).map((f) => '«' + f.name + '»');
  if (rechazos.length || fallos.length || sinSubir.length) {
    st.mensajeCarga = [...rechazos, ...fallos.map((n) => 'No hemos podido leer «' + n + '», pero lo adjuntaremos a tu solicitud y lo revisaremos a mano'),
      ...(sinSubir.length ? [(sinSubir.length === 1 ? sinSubir[0] + ' supera' : unir(sinSubir) + ' superan') + ' los ' + MAX_SUBIDA_MB + ' MB: puedes completar la solicitud, pero no se adjunta' + (sinSubir.length === 1 ? '' : 'n') + ' y te lo pediremos por otra vía'] : [])].join('. ') + '.';
    error(st.mensajeCarga);
  }
  if (!st.camas.length) { $('piModo').hidden = true; $('piUmbral').hidden = true; st.res = null; pintarResultado(); return; }
  if (st.camas.length > primera) st.i = primera;
  // Los ajustes propios de un objeto o pieza no avisan (decisión de Iván, 01/10/2026)
  st.modificadores = st.camas.flatMap((c) => (c.modificadores || []).filter((m) => m.tipo !== 'ajuste'));
  st.mallaNoValida = st.camas.some((c) => c.mallaNoValida);
  avisos();
  // Color automático: Multicolor (con los colores detectados) si algún archivo viene pintado; si no, Monocolor
  const maxColores = Math.max(...st.camas.map((c) => c.colores || 0));
  st.colorAuto = maxColores > 1 ? 'multi' : 'mono';
  st.coloresAuto = maxColores > 1 ? Math.min(4, maxColores) : 0;
  if (anadir && sel.modo === 'personalizado') {
    if (st.colorAuto === 'multi' && sel.color !== 'multi') { sel.color = 'multi'; el.colores.value = String(st.coloresAuto); }
    sel.umbral = 'pendiente';
  } else { Object.assign(sel, { modo: 'normal', umbral: 'pendiente' }); restablecerNormal(); }
  $('piModo').hidden = false;
  mostrarDims();
  marcar();
  el.medidas.hidden = false;
  if (visor) visor.quitar();
  recalcular(true);
  if (window.silabEvento) window.silabEvento('configura-tasadora-modelo', { archivos: st.archivos.length, camas: st.camas.length });
}

// Quita una cama (y su archivo si ya no le queda ninguna); sin camas, el visor vuelve a la zona de carga
function quitarCama(n = st.i) {
  const c = st.camas[n];
  if (!c) return;
  st.camas.splice(n, 1);
  if (!st.camas.some((x) => x.archivo === c.archivo)) st.archivos = st.archivos.filter((f) => f !== c.archivo);
  document.dispatchEvent(new CustomEvent('silab:tasadora-archivos', { detail: { files: [...st.archivos] } }));
  if (visor) { visor.quitar(); visor.pintar(); }
  st.modificadores = st.camas.flatMap((x) => (x.modificadores || []).filter((m) => m.tipo !== 'ajuste'));
  st.mallaNoValida = st.camas.some((x) => x.mallaNoValida);
  avisos();
  if (!st.camas.length) {
    st.i = 0; st.res = null; st.mensajeCarga = '';
    el.visor.classList.remove('tiene-modelo');
    el.barra.hidden = true; $('piModo').hidden = true; $('piUmbral').hidden = true; el.opciones.hidden = true; el.leyenda.hidden = true;
    error('');
    pintarResultado();
    return;
  }
  irA(Math.min(n, st.camas.length - 1));
}

function irA(n) {
  if (!st.camas.length) return;
  st.i = (n + st.camas.length) % st.camas.length;
  mostrarDims();
  if (visor) visor.quitar();
  recalcular(true);
}

/* ---------- Avisos (mismos textos que el Presupuesto instantáneo) ---------- */
const FRASES = {
  'negativa|cilindro': ['un cilindro que resta volumen', 'cilindros que restan volumen'],
  'negativa|caja': ['una caja que resta volumen', 'cajas que restan volumen'],
  'negativa|esfera': ['una esfera que resta volumen', 'esferas que restan volumen'],
  'negativa|otra': ['una pieza que resta volumen', 'piezas que restan volumen'],
  modificador: ['un modificador de ajustes', 'modificadores de ajustes'],
  bloqueador: ['un bloqueador de soportes', 'bloqueadores de soportes'],
  forzador: ['un forzador de soportes', 'forzadores de soportes'],
  ajuste: ['ajustes propios en un objeto o pieza', 'objetos o piezas con ajustes propios'],
  rango: ['un rango de altura de capa', 'rangos de altura de capa']
};
function frasesModificadores(mods) {
  const grupos = new Map();
  for (const m of mods) {
    const k = m.tipo === 'negativa' ? 'negativa|' + (m.forma || 'otra') : m.tipo;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  return [...grupos].map(([k, g]) => { const f = FRASES[k] || [k, k]; return g.length === 1 ? f[0] : g.length + ' ' + f[1]; });
}
function unir(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]; }
function avisos() {
  const mods = st.modificadores;
  el.aviso.hidden = !mods.length;
  if (mods.length) {
    el.avisoTitulo.textContent = mods.length === 1 ? 'Tu archivo contiene un modificador' : 'Tus archivos contienen ' + mods.length + ' modificadores';
    el.avisoTexto.innerHTML = 'Hemos detectado ' + unir(frasesModificadores(mods)) + '. Pueden cambiar el resultado: <strong>revisaremos tu presupuesto a mano.</strong>';
  }
  el.avisoMalla.hidden = !st.mallaNoValida;
}

/* ---------- Cálculo con umbrales y reajuste ---------- */
function rasgos(c, definicion = sel.definicion) {
  if (sinProporcion(c) && c.nu && c.nu.key === claveF(c)) return c.nu.r['auto|' + OPCIONES.definicion[definicion].umbral];   // malla ya reescalada por eje
  return c.rasgos['auto|' + OPCIONES.definicion[definicion].umbral];
}
// Escala uniforme del cliente (con medidas independientes la malla ya viene reescalada: 1)
function escalaCliente(c) {
  if (sel.altura !== 'personalizada' || sinProporcion(c)) return 1;
  return c.f[0];
}

/* Medidas independientes: el motor no admite escalas distintas por eje, así que se reescala
   la malla en un trabajador y se vuelven a calcular sus rasgos (unos segundos). */
let trabajadorNU = null, temporizadorNU = null;
function pedirNU(c, encuadrar) {
  clearTimeout(temporizadorNU);
  temporizadorNU = setTimeout(() => {
    const key = claveF(c), f = [...c.f];
    if (trabajadorNU) trabajadorNU.terminate();
    estado('Recalculando con las nuevas medidas…');
    trabajadorNU = new Worker(new URL('./configura-tasadora-worker.js?v=20261005a', import.meta.url), { type: 'module' });
    trabajadorNU.onmessage = ({ data }) => {
      trabajadorNU.terminate(); trabajadorNU = null;
      if (key !== claveF(c)) return;   // llegó tarde: ya hay otra petición en curso
      estado('');
      if (!data.ok) { error('No hemos podido recalcular con esas medidas.'); return; }
      c.nu = { key, r: data.r };
      recalcular(encuadrar);
    };
    trabajadorNU.onerror = () => { trabajadorNU = null; estado(''); error('No hemos podido recalcular con esas medidas.'); };
    trabajadorNU.postMessage({ pos: c.pos.slice(), f });
  }, 350);
}

// Medidas que ve el cliente: las del archivo (sus ejes), con el factor de cada eje y la escala del reajuste
function medidasDe(c, escala) { return c.dims.map((d, i) => d * (sinProporcion(c) ? c.f[i] : 1) * escala); }
function calcular(c, conf, escala) {
  const r = rasgos(c, conf.definicion);
  // Soportes: los detecta el motor (el cliente no los elige aquí)
  const soportes = necesitaSoportes(r, { escala }) ? 'si' : 'no';
  return { r, soportes, est: estimar(r, { ...conf, escala, soportes }), med: medidasDe(c, escala), escala };
}
const lado = (it) => Math.max(...it.med);
const volumenCm3 = (it) => (it.r.mallaNoValida ? Infinity : it.r.volumen * Math.pow(it.escala, 3) / 1000);   // mm³ → cm³
const superaLado = (it) => lado(it) > cfg.limites.ladoMm + 1e-6;
const superaVolumen = (it) => volumenCm3(it) < cfg.limites.volumenMinCm3 - 1e-6;
const superaTiempo = (it) => it.est.segundos > cfg.limites.horas * 3600;
const motivosDe = (it) => [superaLado(it) && 'lado', superaVolumen(it) && 'volumen', superaTiempo(it) && 'tiempo'].filter(Boolean);
const tipoProyecto = () => (document.querySelector('input[name="projectPieceType"]:checked') || {}).value || '';

/* Umbrales (diagrama «Umbrales_Diagrama de flujo», 04/10/2026), para piezas resistentes y artísticas:
   si se supera alguno se pregunta si dejarlo como está (revisión manual) o ajustarlo. El ajuste detecta el umbral
   superado y lo corrige, informa y vuelve a comprobar:
     · lado > 20 cm      → reescalar en proporción hasta que el lado mayor mida 20 cm
     · volumen < 4 cm³   → reescalar en proporción hasta 4 cm³
     · tiempo > 15 h     → bajar el refuerzo hasta Normal; si aún se supera, la definición hasta Normal;
                           si aún, la densidad hasta Ligero (paso a paso)
   Si ya no queda nada que ajustar, o lado y volumen chocan (pieza larga y finísima), va a revisión manual. */
function evaluar() {
  const conf = { definicion: sel.definicion, pared: sel.pared, densidad: sel.densidad, color: sel.color, colores: +el.colores.value };
  const escalas = st.camas.map(escalaCliente);
  let items = st.camas.map((c, k) => calcular(c, conf, escalas[k]));
  const forma = (extra) => {
    items.forEach((it, k) => { const c = st.camas[k]; it.vis = sinProporcion(c) ? c.f.map((v) => v * escalas[k]) : [escalas[k], escalas[k], escalas[k]]; });
    return { conf, escalas, items, totales: totales(items), ajustes: [], revision: false, ...extra };
  };
  const supera = items.map((it, k) => ({ k, lado: lado(it), volumen: volumenCm3(it), segundos: it.est.segundos, motivos: motivosDe(it) })).filter((b) => b.motivos.length);
  if (!supera.length) return forma({});
  if (sel.umbral === 'pendiente') return forma({ revision: true, motivo: 'pendiente', supera });
  if (sel.umbral === 'dejar') return forma({ revision: true, motivo: 'sin-ajustar', supera });
  if (sel.umbral === 'imposible') return forma({ revision: true, motivo: 'no-ajustable', supera });

  const ajustes = [], agrandada = new Set();
  const anota = (a) => { if (!ajustes.includes(a)) ajustes.push(a); };
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    items = st.camas.map((c, k) => calcular(c, conf, escalas[k]));
    const lados = items.map((it, k) => (superaLado(it) ? k : -1)).filter((k) => k >= 0);
    if (lados.length) {
      // Una cama que ya se agrandó por volumen y ahora pasa de 20 cm no tiene arreglo
      if (lados.some((k) => agrandada.has(k))) return forma({ revision: true, motivo: 'no-ajustable', supera });
      lados.forEach((k) => { escalas[k] *= cfg.limites.ladoMm / lado(items[k]); });
      anota('reducido');
      continue;
    }
    const pequenas = items.map((it, k) => (superaVolumen(it) ? k : -1)).filter((k) => k >= 0);
    if (pequenas.length) {
      pequenas.forEach((k) => { escalas[k] *= Math.cbrt(cfg.limites.volumenMinCm3 / volumenCm3(items[k])) * 1.0001; agrandada.add(k); });
      anota('aumentado');
      continue;
    }
    if (items.some(superaTiempo)) {
      const paso = bajar(conf, 'pared', 'normal') || bajar(conf, 'definicion', 'normal') || bajar(conf, 'densidad', 'ligero');
      if (!paso) return forma({ revision: true, motivo: 'no-ajustable', supera });
      anota(paso);
      continue;
    }
    return { ...forma({ supera }), ajustes };
  }
  return forma({ revision: true, motivo: 'no-ajustable', supera });
}
function totales(items) { return { gramos: items.reduce((s, it) => s + it.est.gramos, 0), segundos: items.reduce((s, it) => s + it.est.segundos, 0) }; }
function bajar(conf, g, suelo) {
  const o = ORDEN[g], i = o.indexOf(conf[g]);
  if (i < 0 || i >= o.indexOf(suelo)) return null;
  conf[g] = o[i + 1];
  return g;
}

function recalcular(encuadrar) {
  if (!st.camas.length) return;
  // Las camas con medidas independientes necesitan su malla reescalada (trabajador) antes de calcular
  const pendiente = st.camas.find((c) => sinProporcion(c) && !(c.nu && c.nu.key === claveF(c)));
  if (pendiente) { pedirNU(pendiente, encuadrar); return; }
  error(st.mensajeCarga);
  st.res = evaluar();
  pintarResultado();
  visor.colocar(st.res.items[st.i], cama(), encuadrar);
}

const mm = (v) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 });
const medidasTexto = (m) => `${mm(m[0])} × ${mm(m[1])} × ${mm(m[2])} mm`;
function textoAjuste(a, res) {
  const o = (g) => OPCIONES[g][res.conf[g]];
  const tam = res.items.length > 1 ? ' (' + res.items.map((it) => medidasTexto(it.med)).join('; ') + ')' : ' a ' + medidasTexto(res.items[0].med);
  if (a === 'reducido') return 'tamaño reducido' + tam;
  if (a === 'aumentado') return 'tamaño aumentado' + tam;
  if (a === 'definicion') return 'definición ' + o('definicion').rotulo + ' (' + o('definicion').ayuda + ')';
  if (a === 'densidad') return 'densidad ' + o('densidad').rotulo + ' (' + o('densidad').ayuda + ')';
  if (a === 'pared') return 'refuerzo de pared ' + o('pared').rotulo + ' (' + o('pared').ayuda + ')';
  return a;
}
// Motivo general de la revisión manual (sin cifras)
function motivoGeneral(res, n) {
  const m = new Set((res.supera || []).flatMap((b) => b.motivos));
  const una = n < 2;
  const frases = [
    m.has('lado') && (una ? 'el modelo supera la longitud máxima' : 'hay modelos que superan la longitud máxima'),
    m.has('volumen') && (una ? 'el modelo es demasiado pequeño' : 'hay modelos demasiado pequeños'),
    m.has('tiempo') && (una ? 'el tiempo de producción es excesivo' : 'hay modelos con un tiempo de producción excesivo')
  ].filter(Boolean);
  if (res.motivo === 'no-ajustable') frases.push('no ha sido posible ajustar' + (una ? 'la' : 'las') + ' automáticamente');
  return frases.length ? unir(frases) : '';
}

function pintarResultado() {
  pintarResultadoBase();
  equilibrar();
}
function pintarResultadoBase() {
  const res = st.res, n = st.camas.length;
  // Sin archivos: solo la zona de carga, centrada (sin resumen ni opciones)
  el.caja.classList.toggle('vacia', !n);
  $('piAcciones').hidden = !n;
  // Navegación entre camas y rótulos de la barra
  el.ant.hidden = el.sig.hidden = n < 2;
  el.pos.hidden = n < 2;
  if (n) {
    el.nombre.textContent = cama().nombre; el.nombre.title = cama().nombre;
    el.pos.textContent = (st.i + 1) + ' / ' + n;
  }
  const revision = !!(res && res.revision);
  el.resultado.hidden = !res || revision;
  el.revision.hidden = !res || !revision;
  // Ventana ante los umbrales: dejar como está (revisión manual) o ajuste automático
  const oferta = !!(res && res.supera && (res.motivo === 'pendiente' || res.motivo === 'sin-ajustar'));
  // «Dejar como está» cierra la ventana y la deja minimizada en el botón de alerta, junto a los de archivos
  $('piUmbral').hidden = !(oferta && res.motivo === 'pendiente');
  $('piAlerta').hidden = !(oferta && res.motivo === 'sin-ajustar');
  if (oferta) {
    if (n > 1) {
      // Una sola alerta para todas las camas: cuántas necesitan ajuste y cuáles son (nº de cama)
      const ids = res.supera.map((b) => b.k + 1), k = ids.length;
      $('piUmbralTitulo').textContent = 'Hay camas que superan los límites de impresión';
      $('piUmbralTexto').textContent = (k === 1 ? 'La cama nº ' + ids[0] + ' (de las ' + n + ') necesita' : k + ' de las ' + n + ' camas (nº ' + unir(ids.map(String)) + ') necesitan') + ' un ajuste o la revisión del equipo técnico. Podemos ajustarlas automáticamente, o dejarlo como está y lo revisará el equipo. Te recomendamos subir los archivos conflictivos en un nuevo presupuesto.';
    } else {
      const b = res.supera[0], partes = [];
      // Motivos en general, sin cifras
      if (b.motivos.includes('lado')) partes.push('el modelo supera la longitud máxima');
      if (b.motivos.includes('volumen')) partes.push('el modelo es demasiado pequeño');
      if (b.motivos.includes('tiempo')) partes.push('el tiempo de producción es excesivo');
      $('piUmbralTitulo').textContent = 'Tu diseño supera los límites de impresión';
      $('piUmbralTexto').textContent = 'Con estos parámetros, ' + unir(partes) + '. Podemos ajustarlo automáticamente para obtener el presupuesto al momento, o dejarlo como está y lo revisará el equipo técnico.';
    }
    el.caja.querySelectorAll('input[name="pi-umbral"]').forEach((i) => { i.checked = i.value === sel.umbral; });
  }
  if (!res) {
    el.gramos.textContent = '—'; el.tiempo.textContent = '—';
    el.nota.textContent = '';
    return;
  }
  const it = res.items[st.i];
  el.medidas.textContent = medidasTexto(it.med);
  if (revision) {
    const motivo = motivoGeneral(res, n);
    el.revisionTexto.textContent = res.motivo === 'pendiente'
      ? 'Elige cómo continuar: ajustar el diseño automáticamente o dejarlo como está.'
      : 'Las condiciones actuales del diseño requieren revisión manual del equipo técnico' + (motivo ? ': ' + motivo : '') + '. No te preocupes: recibirás una respuesta lo antes posible, en menos de 24 h.'
        + (Math.max(...it.med) < 5 ? ' Tu pieza mide menos de 5 mm: si el archivo está en centímetros o pulgadas, indica sus medidas reales en «Tamaño» (opciones Personalizado).' : '');
    return;
  }
  el.gramos.textContent = '≈ ' + Number(res.totales.gramos).toLocaleString('es-ES', { maximumFractionDigits: res.totales.gramos < 10 ? 1 : 0 }) + ' g';
  el.tiempo.textContent = '≈ ' + formatoTiempo(res.totales.segundos);
  const cuerpo = Math.max(...it.med) < 5
    ? 'La pieza mide menos de 5 mm: si tu archivo está en centímetros o pulgadas, indica su altura real en «Tamaño».'
    : st.informe && st.informe.length
    ? 'Para obtener el presupuesto al momento hemos ajustado: ' + unir(st.informe) + '.' + ' Si no estás conforme, puedes volver a subir el archivo y continuar: el equipo técnico lo revisará.'
    : res.ajustes.length
    ? 'Para obtener el presupuesto al momento la hemos ajustado: ' + unir(res.ajustes.map((a) => textoAjuste(a, res))) + '.' + ' Si no estás conforme, puedes volver a subir el archivo y continuar: el equipo técnico lo revisará.'
    : 'Estimación orientativa.';
  el.nota.textContent = (n > 1
    ? 'Total de ' + n + ' camas. Esta cama: ' + Number(it.est.gramos).toLocaleString('es-ES', { maximumFractionDigits: it.est.gramos < 10 ? 1 : 0 }) + ' g · ' + formatoTiempo(it.est.segundos) + '. '
    : '') + cuerpo;
}

/* Columnas equilibradas: el resumen (o el aviso de revisión) se coloca en la columna más corta. El cartel oscuro
   nunca se estira: si el resumen va a la derecha, el visor se acorta para igualar las columnas (hasta un mínimo);
   si va a la izquierda, el visor crece. Lo que aún falte lo rellena el último bloque blanco de la derecha.
   En móvil, siempre bajo el visor. */
const VISOR_MIN = 300;
function equilibrar() {
  const col = el.caja.querySelector('.ct-visor-col'), panel = el.caja.querySelector('.pi-panel');
  if (!col || !panel || el.caja.hidden) return;
  if (el.caja.classList.contains('vacia')) { el.visor.style.height = ''; el.visor.style.aspectRatio = ''; col.append(el.resultado, el.revision); return; }
  const S = [el.resultado, el.revision];
  el.caja.classList.add('midiendo');
  el.visor.style.height = ''; el.visor.style.aspectRatio = '';
  panel.querySelectorAll('.crece').forEach((x) => x.classList.remove('crece'));
  let derecha = false;
  const pc = window.matchMedia('(min-width: 681px)').matches;
  if (pc) {
    S.forEach((x) => x.remove());
    derecha = panel.getBoundingClientRect().height < col.getBoundingClientRect().height;
  }
  if (derecha) $('piModo').after(...S); else col.append(...S);
  if (pc && derecha) {
    const sobra = col.getBoundingClientRect().height - panel.getBoundingClientRect().height;
    if (sobra > 0) {
      const h = el.visor.getBoundingClientRect().height;
      el.visor.style.aspectRatio = 'auto';
      el.visor.style.height = Math.max(VISOR_MIN, h - sobra) + 'px';
    }
  }
  const blancos = [...panel.children].filter((x) => !x.hidden && !S.includes(x));
  if (blancos.length) blancos[blancos.length - 1].classList.add('crece');
  el.caja.classList.remove('midiendo');
}
window.addEventListener('resize', () => equilibrar());

function resumen() {
  const res = st.res;
  if (!st.archivos.length) return null;
  const archivos = st.archivos.map((f) => f.name);
  if (!res) return { archivos, archivo: archivos[0], medidas: '', revision: true };
  const medidas = res.items.map((it, k) => (res.items.length > 1 ? st.camas[k].nombre + ': ' : '') + medidasTexto(it.med)).join('\n');
  return {
    archivos, archivo: archivos[0],
    camas: res.items.length,
    medidas,
    gramos: res.revision ? null : Math.round(res.totales.gramos),
    tiempo: res.revision ? null : formatoTiempo(res.totales.segundos),
    ajustes: res.ajustes.map((a) => textoAjuste(a, res)),
    laminado: { definicion: res.conf.definicion, pared: res.conf.pared, densidad: res.conf.densidad, soportes: res.items.map((it) => it.soportes), color: res.conf.color },
    revision: res.revision,
    motivoRevision: res.revision ? res.motivo || null : null,
    modo: sel.modo,
    modificadores: st.modificadores.length > 0,
    mallaNoValida: st.mallaNoValida,
    // Datos por cama para 3DCalc: peso, tiempo y zonas de soporte (para el nivel de post-procesado)
    segundos: Math.round(res.totales.segundos),
    gramosExactos: res.totales.gramos,
    detalle: res.items.map((it, k) => ({ nombre: st.camas[k].nombre, medidas: it.med.map((v) => Math.round(v * 10) / 10),
      gramos: it.est.gramos, segundos: it.est.segundos, soportes: it.soportes, zonas: it.soportes === 'si' ? (it.r.zonas || 0) : 0 })),
    zonasSoporte: res.items.reduce((t, it) => t + (it.soportes === 'si' ? (it.r.zonas || 0) : 0), 0),
    colores: res.conf.color === 'multi' ? +el.colores.value : 1,
    // Precio al momento: la función de Supabase rehace gramos, tiempo y zonas con el motor a partir de estos rasgos y de las
    // opciones finales (las cifras de arriba solo se guardan como «declaradas»; ver supabase/functions/solicitar-presupuesto)
    calculo: res.revision ? null : {
      revision: MOTOR_REVISION,
      conf: { definicion: res.conf.definicion, pared: res.conf.pared, densidad: res.conf.densidad, color: res.conf.color, colores: res.conf.color === 'multi' ? +el.colores.value : 1 },
      camas: res.items.map((it) => ({ r: rasgosParaServidor(it.r), escala: it.escala, med: it.med }))
    }
  };
}

/* ---------- Visor 3D (three.js se carga al subir el primer modelo) ---------- */
let visor = null;
async function cargarVisor() {
  if (visor) return visor;
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const COLOR_PIEZA = new THREE.Color('#D7899C'), COLOR_VOLADIZO = new THREE.Color('#E9A23B');
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
  camara.up.set(0, 0, 1);
  const render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  render.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.lienzo.appendChild(render.domElement);
  const controles = new OrbitControls(camara, render.domElement);
  controles.enableDamping = true; controles.dampingFactor = 0.08;
  escena.add(new THREE.HemisphereLight(0xffffff, 0xe8d6db, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.7); sol.position.set(-1, -1.4, 2.2); escena.add(sol);
  const contraluz = new THREE.DirectionalLight(0xffffff, 0.6); contraluz.position.set(1.5, 1, 0.8); escena.add(contraluz);
  const L = IMPRESORA.cama[0];
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(L, L), new THREE.MeshStandardMaterial({ color: 0xf4eaed, roughness: 1 }));
  placa.position.z = -0.05; escena.add(placa);
  const rejilla = new THREE.GridHelper(L, 16, 0xe2cbd2, 0xebdce1); rejilla.rotation.x = Math.PI / 2; escena.add(rejilla);
  const grupo = new THREE.Group(); escena.add(grupo);

  let pieza = null, pendiente = false;
  const pintar = () => { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; if (controles.update()) pintar(); render.render(escena, camara); }); };
  const dimensionar = () => {
    const w = el.lienzo.clientWidth, h = el.lienzo.clientHeight;
    if (!w || !h) return;
    render.setSize(w, h, false); camara.aspect = w / h; camara.updateProjectionMatrix();
  };
  controles.addEventListener('change', pintar);
  new ResizeObserver(() => { dimensionar(); pintar(); }).observe(el.lienzo);
  dimensionar();

  function colocar(item, c, encuadrar) {
    const r = item.r;
    if (pieza && pieza.userData.cama !== c) quitar();
    if (!pieza) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c.pos.length), 3));
      g.computeVertexNormals();
      pieza = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 }));
      pieza.userData.cama = c;
      grupo.add(pieza);
      encuadrar = true;
    }
    const col = pieza.geometry.attributes.color.array;
    for (let i = 0; i < col.length; i += 3) { col[i] = COLOR_PIEZA.r; col[i + 1] = COLOR_PIEZA.g; col[i + 2] = COLOR_PIEZA.b; }
    const hay = r.triVoladizo.length > 0 && item.soportes === 'si';
    if (hay) for (const t of r.triVoladizo) for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3; col[o] = COLOR_VOLADIZO.r; col[o + 1] = COLOR_VOLADIZO.g; col[o + 2] = COLOR_VOLADIZO.b;
    }
    pieza.geometry.attributes.color.needsUpdate = true;
    el.leyenda.hidden = !hay;

    // Orientación: la del propio archivo (la de impresión solo se usa para calcular)
    pieza.quaternion.identity();
    grupo.scale.set(...item.vis);
    grupo.position.set(0, 0, 0);
    grupo.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(grupo, true);   // exacta: con la caja aproximada la pieza quedaba flotando
    const cc = caja.getCenter(new THREE.Vector3());
    grupo.position.set(-cc.x, -cc.y, -caja.min.z);
    if (encuadrar) {
      const tam = caja.getSize(new THREE.Vector3());
      const radio = Math.max(tam.length() / 2, 2);
      const fov = Math.min(camara.fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * camara.aspect)));
      const dist = radio / Math.sin(THREE.MathUtils.degToRad(fov / 2)) * 1.25;
      const objetivo = new THREE.Vector3(0, 0, tam.z / 2);
      camara.position.copy(objetivo).add(new THREE.Vector3(0.62, -1, 0.62).normalize().multiplyScalar(dist));
      camara.near = dist / 100; camara.far = dist * 20; camara.updateProjectionMatrix();
      controles.target.copy(objetivo);
      controles.update();
    }
    pintar();
  }
  function quitar() { if (pieza) { grupo.remove(pieza); pieza.geometry.dispose(); pieza = null; } }
  visor = { colocar, quitar, pintar, dimensionar };
  return visor;
}
