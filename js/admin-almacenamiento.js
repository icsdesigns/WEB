/* ============================================================
   SILAB 3D · Panel admin › Almacenamiento
   1. Espacio ocupado en Supabase (base de datos y buckets) y en Firestore
      (3DProject), con barras frente al límite del plan gratuito y avisos.
   2. Reglas de limpieza (por antigüedad o archivos sin usar), guardadas en
      config_tasadora › almacenamiento. Las activas se aplican cada noche.
   3. «Vista previa» enseña lo que se borraría; «Limpiar ahora» borra solo lo
      marcado de esa vista previa, con la contraseña del administrador.
   El navegador no puede leer el uso real: todo pasa por la Edge Function
   gestor-almacenamiento (supabase/functions/) y supabase/almacenamiento.sql.
   abrir({ sb, raiz }) lo llama admin/index.html al abrir la pestaña.
   ============================================================ */
const FUNCION = 'gestor-almacenamiento';
const CLAVE = 'almacenamiento';
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (p) => '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const ICONO = {
  db: svg('<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>'),
  archivos: svg('<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>'),
  fuego: svg('<path d="M12 21.5c-4 0-7-2.8-7-6.6 0-3.3 2.2-5.4 3.6-7.6.4 1.6 1.3 2.7 2.4 3.2C11 7 12.5 4.4 15 2.5c-.3 3 1 4.8 2.4 6.6 1.1 1.4 1.6 3 1.6 4.8 0 4.4-3 7.6-7 7.6z"/>'),
  candado: svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  recargar: svg('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),
  ojo: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  papelera: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>'),
  externo: svg('<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>')
};
// Nombres para Iván (los ids técnicos van debajo en pequeño)
const NOMBRES = {
  solicitudes: 'Adjuntos de clientes', productos: 'Fotos de productos', figuras: 'Figuras de la tasadora',
  visualizador: 'Modelos del visualizador', galeria: 'Fotos de la galería',
  solicitudes_presupuesto: 'Solicitudes de presupuesto', pedidos_web: 'Pedidos de la web (3DCalc)', feedback: 'Opiniones de 3DProject'
};
const nombre = (id) => NOMBRES[id] || id;
// Qué guarda cada bucket (para el desglose)
const DESCRIPCIONES = {
  solicitudes: 'Archivos que adjuntan los clientes en «Configura tu proyecto» (modelos 3D, fotos, planos). Privado; se borran a los 6 meses.',
  productos: 'Fotos del catálogo de productos que subes desde la pestaña Productos.',
  figuras: 'Biblioteca de figuras de la tasadora (pestaña Tasadora). Ninguna tabla las referencia: no se limpian como «sin usar».',
  visualizador: 'Modelos ligeros (.s3dv) del visualizador 3D de llaveros, uno por opción.',
  galeria: 'Fotos de «Nuestros trabajos» en dos tamaños: grande y miniatura (WebP).'
};
const bytes = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? Math.round(n) : n.toFixed(1)).toString().replace('.', ',') + ' ' + u[i];
};
const miles = (n) => Number(n || 0).toLocaleString('es-ES');
const fecha = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (v, max) => (max ? Math.min(100, (v / max) * 100) : 0);

const PASOS_DESPLIEGUE = `<ol class="alm-pasos">
  <li>En Supabase › Edge Functions › <b>Deploy a new function</b> › <b>Via Editor</b>, llámala <code>gestor-almacenamiento</code> y pega el archivo <code>supabase/functions/gestor-almacenamiento/index.ts</code>.</li>
  <li>En los ajustes de la función, desactiva <b>Verify JWT</b> (la función comprueba ella misma que eres administrador).</li>
  <li>En SQL Editor ejecuta <code>supabase/almacenamiento.sql</code>, cambiando antes <code>XYZXYZ</code> por tu PURGE_KEY.</li>
</ol>`;

let estado = null;

export async function abrir({ sb, raiz }) {
  if (estado && estado.raiz === raiz) return estado.cargar();
  estado = crear(sb, raiz);
  return estado.cargar();
}

function crear(sb, raiz) {
  let datos = null;        // respuesta de «uso»
  let reglas = [];         // reglas en edición
  let avisos = { aviso: 70, critico: 90 };
  let guardadas = '';      // JSON de lo guardado, para saber si hay cambios
  let previa = null;       // última vista previa

  raiz.innerHTML = `
    <div class="panel alm-panel">
      <div class="alm-cabecera">
        <div class="alm-cabecera__texto">
          <h2>Espacio ocupado</h2>
          <p class="pista">Supabase (web) y Firestore (3DProject) frente al límite de sus planes gratuitos. <span data-fecha></span></p>
        </div>
        <div class="alm-cabecera__acciones">
          <span data-enlaces class="alm-enlaces"></span>
          <button type="button" class="btn btn-cancelar alm-btn" data-actualizar title="Volver a medir">${ICONO.recargar}<span>Actualizar</span></button>
        </div>
      </div>
      <div data-uso><p class="vacio">Midiendo el espacio…</p></div>
    </div>
    <div class="panel alm-panel" data-panel-reglas hidden>
      <div class="alm-cabecera__texto">
        <h2>Reglas de limpieza</h2>
        <p class="pista">Las activas se aplican solas cada noche. Para borrar a mano, primero la vista previa.</p>
      </div>
      <div data-reglas></div>
      <div class="alm-acciones">
        <button type="button" class="btn btn-cancelar alm-btn" data-previa>${ICONO.ojo}<span>Vista previa</span></button>
        <button type="button" class="btn alm-btn" data-guardar disabled>${ICONO.candado}<span>Guardar reglas</span></button>
      </div>
      <div data-resultado-previa></div>
    </div>
    <div class="panel alm-panel" data-panel-registro hidden>
      <div class="alm-cabecera__texto"><h2>Últimas limpiezas</h2><p class="pista">Las 20 más recientes, programadas o a mano.</p></div>
      <div data-registro></div>
    </div>`;
  const $ = (s) => raiz.querySelector(s);
  $('[data-actualizar]').addEventListener('click', () => { Object.keys(desgloses).forEach((k) => delete desgloses[k]); abierto = null; cargar(); });

  async function llamar(body) {
    const { data, error } = await sb.functions.invoke(FUNCION, { body });
    if (error) {
      let msg = error.message || String(error);
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) { /* sin cuerpo */ }
      const e = new Error(msg); e.sinFuncion = /Failed to send|FunctionsFetchError|not found|404/i.test(msg + ' ' + error.name); throw e;
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  /* ---------- 1. Uso ---------- */
  async function cargar() {
    const btn = $('[data-actualizar]');
    btn.disabled = true;
    if (!datos) $('[data-uso]').innerHTML = '<p class="vacio">Midiendo el espacio…</p>';
    try {
      datos = await llamar({ accion: 'uso' });
      const cfg = datos.config || {};
      if (!guardadas || !hayCambios()) {
        reglas = (cfg.reglas || []).map((r) => ({ ...r }));
        avisos = { ...(cfg.avisos || avisos) };
        guardadas = firma();
      }
      pintarUso();
      pintarReglas();
      pintarRegistro(cfg.registro || []);
    } catch (err) {
      $('[data-uso]').innerHTML = `<div class="alm-error"><p><strong>No se pudo medir el espacio.</strong> ${esc(err.message)}</p>
        ${err.sinFuncion || /almacenamiento\.sql/.test(err.message) ? '<p>Para activar esta pestaña:</p>' + PASOS_DESPLIEGUE : ''}</div>`;
    } finally { btn.disabled = false; }
  }

  function nivel(p) { return p >= avisos.critico ? 'critico' : p >= avisos.aviso ? 'aviso' : 'ok'; }
  const ESTADO = { ok: 'Con margen', aviso: 'Revisar pronto', critico: 'Casi lleno' };
  function medidor(icono, titulo, usado, limite, nota) {
    const p = pct(usado, limite), n = nivel(p);
    return `<li class="alm-card alm-card--${n}">
      <div class="alm-card__cab"><span class="alm-card__icono">${icono}</span><h3 class="alm-card__titulo">${titulo}</h3></div>
      <p class="alm-card__pct">${p < 1 && usado > 0 ? '<1' : Math.round(p)}<span>%</span></p>
      <div class="alm-barra" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}" aria-label="${esc(titulo)}: ${Math.round(p)} % usado">
        <span style="width:${Math.max(p, 1).toFixed(1)}%"></span>
        <i style="left:${avisos.aviso}%" title="Aviso al ${avisos.aviso} %"></i><i style="left:${avisos.critico}%" title="Crítico al ${avisos.critico} %"></i>
      </div>
      <p class="alm-card__valor"><b>${bytes(usado)}</b> de ${bytes(limite)}</p>
      <p class="alm-chip alm-chip--${n}">${ESTADO[n]}</p>
      ${nota ? `<p class="pista alm-card__nota">${nota}</p>` : ''}
    </li>`;
  }
  // Lista con barra proporcional (tablas, colecciones y desglose)
  function barras(filas, { etiqueta, sub, dato, max }) {
    const tope = max || Math.max(1, ...filas.map((f) => Number(f.bytes)));
    return `<ul class="alm-barras">${filas.map((f) => `<li>
        <span class="alm-barras__nombre">${esc(etiqueta(f))}${sub && sub(f) ? `<small>${esc(sub(f))}</small>` : ''}</span><span class="alm-barras__dato">${dato(f)}</span>
        <span class="alm-barras__barra"><span style="width:${Math.max(1, (Number(f.bytes) / tope) * 100).toFixed(1)}%"></span></span></li>`).join('')}</ul>`;
  }

  function pintarUso() {
    const { supabase: s, firestore: f, limites: L, proyecto_supabase: ps } = datos;
    const buckets = (s.buckets || []).slice().sort((a, b) => b.bytes - a.bytes);
    const storage = buckets.reduce((t, b) => t + Number(b.bytes), 0);
    $('[data-fecha]').textContent = 'Medido el ' + fechaHora(datos.fecha) + '.';
    $('[data-enlaces]').innerHTML = `
      <a href="https://supabase.com/dashboard/org/_/usage?projectRef=${encodeURIComponent(ps)}" target="_blank" rel="noopener">Supabase ${ICONO.externo}</a>
      ${f.disponible ? `<a href="https://console.firebase.google.com/project/${encodeURIComponent(f.proyecto)}/usage" target="_blank" rel="noopener">Firebase ${ICONO.externo}</a>` : ''}`;

    const avisosLista = [];
    const p1 = pct(s.db_bytes, L.db), p2 = pct(storage, L.storage), p3 = f.disponible ? pct(f.bytes, L.firestore) : 0;
    [['La base de datos de Supabase', p1], ['Los archivos de Supabase', p2], ['Firestore', p3]].forEach(([q, p]) => {
      if (p >= avisos.critico) avisosLista.push(`<li class="alm-aviso alm-aviso--critico"><b>${q}</b>: al ${Math.round(p)} %. Revisa las reglas de limpieza o el plan.</li>`);
      else if (p >= avisos.aviso) avisosLista.push(`<li class="alm-aviso"><b>${q}</b>: al ${Math.round(p)} %, por encima del aviso del ${avisos.aviso} %.</li>`);
    });

    // Reparto de los archivos: barra apilada por bucket + una ficha por bucket (abre el desglose)
    const color = (i) => `var(--alm-c${i % 6})`;
    const libre = Math.max(0, L.storage - storage);
    const reparto = buckets.length ? `
      <div class="alm-reparto" role="img" aria-label="Reparto de ${bytes(storage)} entre ${buckets.length} buckets; quedan ${bytes(libre)} libres">
        ${buckets.map((b, i) => `<span style="flex-grow:${Number(b.bytes) || 0};background:${color(i)}" title="${esc(nombre(b.bucket))}: ${bytes(b.bytes)}"></span>`).join('')}
        <span class="alm-reparto__libre" style="flex-grow:${libre}" title="Libre: ${bytes(libre)}"></span>
      </div>
      <p class="pista alm-reparto__pie">${bytes(storage)} usados de ${bytes(L.storage)} · ${bytes(libre)} libres</p>
      <ul class="alm-buckets">${buckets.map((b, i) => `<li>
        <button type="button" class="alm-bucket" data-bucket="${esc(b.bucket)}" aria-expanded="false">
          <span class="alm-bucket__punto" style="background:${color(i)}"></span>
          <span class="alm-bucket__nombre"><b>${esc(nombre(b.bucket))}</b><small>${esc(b.bucket)} · ${b.publico ? 'público' : 'privado'}</small></span>
          <span class="alm-bucket__datos"><b>${bytes(b.bytes)}</b><small>${miles(b.objetos)} ${b.objetos == 1 ? 'archivo' : 'archivos'} · ${storage ? Math.round((b.bytes / storage) * 100) : 0} %</small></span>
          <span class="alm-bucket__ver">Ver desglose</span>
        </button></li>`).join('')}</ul>` : '<p class="pista">No hay buckets.</p>';

    const tablas = (s.tablas || []).slice(0, 8);
    const otros = (s.esquemas || []).filter((e) => e.esquema !== 'public').map((e) => `${esc(e.esquema)} ${bytes(e.bytes)}`).join(' · ');
    const bloqueTablas = `<section class="alm-bloque">
        <h3>Tablas más grandes <span class="pista">base de datos</span></h3>
        ${tablas.length ? barras(tablas, { etiqueta: (t) => nombre(t.tabla), sub: (t) => (NOMBRES[t.tabla] ? t.tabla : ''), dato: (t) => `${bytes(t.bytes)}<small>${miles(t.filas)} filas</small>` }) : '<p class="pista">No hay tablas.</p>'}
        ${otros ? `<p class="pista alm-nota">Sistema de Supabase: ${otros}.</p>` : ''}
      </section>`;
    const bloqueFs = f.disponible ? `<section class="alm-bloque">
        <h3>Colecciones <span class="pista">Firestore · estimado</span></h3>
        ${(f.colecciones || []).length ? barras(f.colecciones, { etiqueta: (c) => nombre(c.coleccion), sub: (c) => (NOMBRES[c.coleccion] ? c.coleccion : ''), dato: (c) => `${bytes(c.bytes)}<small>${miles(c.documentos)}${c.completo ? '' : '+'} docs</small>` }) : '<p class="pista">No hay colecciones.</p>'}
        <p class="pista alm-nota">Medirlo ha gastado ${miles(f.lecturas)} de las ${miles(L.lecturas)} lecturas gratuitas de hoy.</p>
      </section>` : '';

    $('[data-uso]').innerHTML = `
      ${avisosLista.length ? `<ul class="alm-avisos">${avisosLista.join('')}</ul>` : ''}
      <ul class="alm-cards">
        ${medidor(ICONO.db, 'Base de datos', s.db_bytes, L.db, 'Supabase · tablas, índices y sistema')}
        ${medidor(ICONO.archivos, 'Archivos', storage, L.storage, 'Supabase Storage · todos los buckets')}
        ${f.disponible ? medidor(ICONO.fuego, 'Firestore', f.bytes, L.firestore, '3DProject · estimado, sin índices')
          : `<li class="alm-card alm-card--nd"><div class="alm-card__cab"><span class="alm-card__icono">${ICONO.fuego}</span><h3 class="alm-card__titulo">Firestore</h3></div>
             <p class="pista">No se pudo leer: ${esc(f.motivo)}</p></li>`}
      </ul>
      <section class="alm-seccion">
        <h3 class="alm-seccion__titulo">Reparto de los archivos <span class="pista">Pulsa un bucket para ver qué guarda.</span></h3>
        ${reparto}
        <div data-desglose></div>
      </section>
      <div class="alm-bloques">${bloqueTablas}${bloqueFs}</div>
      <p class="alm-info">${ICONO.info}<span>La transferencia (egress), las lecturas y escrituras diarias de Firebase y el tamaño de los índices de Firestore no se pueden leer con las API gratuitas. Están en el panel de cada proveedor (enlaces de arriba).</span></p>`;

    // Si había un desglose abierto, se vuelve a mostrar
    if (abierto && desgloses[abierto]) {
      const b = raiz.querySelector(`[data-bucket="${CSS.escape(abierto)}"]`);
      if (b) { b.setAttribute('aria-expanded', 'true'); pintarDesglose(abierto, desgloses[abierto]); } else abierto = null;
    }
  }

  /* ---------- 1b. Desglose de un bucket ---------- */
  const desgloses = {};    // caché por bucket hasta pulsar «Actualizar»
  let abierto = null;
  raiz.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bucket]');
    if (!b) return;
    const id = b.dataset.bucket, cont = $('[data-desglose]');
    raiz.querySelectorAll('[data-bucket]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
    if (abierto === id) { abierto = null; cont.innerHTML = ''; return; }
    abierto = id; b.setAttribute('aria-expanded', 'true');
    cont.innerHTML = '<p class="vacio">Leyendo el bucket…</p>';
    try {
      if (!desgloses[id]) desgloses[id] = (await llamar({ accion: 'bucket', bucket: id })).desglose;
      if (abierto === id) pintarDesglose(id, desgloses[id]);
    } catch (err) {
      if (abierto === id) cont.innerHTML = `<div class="alm-error"><p>${esc(err.message)}</p></div>`;
    }
  });
  function lista(titulo, filas, etiqueta) {
    return `<section class="alm-bloque alm-bloque--mini"><h4>${titulo}</h4>${filas.length
      ? barras(filas, { etiqueta, dato: (f) => `${bytes(f.bytes)}<small>${miles(f.n)} ${f.n == 1 ? 'archivo' : 'archivos'}</small>` })
      : '<p class="pista">Sin datos.</p>'}</section>`;
  }
  function pintarDesglose(id, d) {
    const cont = $('[data-desglose]');
    const mes = (k) => new Date(k + '-01T12:00:00').toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
    cont.innerHTML = `<div class="alm-desglose">
      <div class="alm-desglose__cab">
        <h3>${esc(nombre(id))} <span class="pista">${esc(id)}</span></h3>
        ${DESCRIPCIONES[id] ? `<p class="pista">${DESCRIPCIONES[id]}</p>` : ''}
        <p class="alm-desglose__resumen">${miles(d.objetos)} archivos · ${bytes(d.bytes)}${d.objetos ? ` · media ${bytes(Math.round(d.bytes / d.objetos))}` : ''}${d.primero ? ` · del ${fecha(d.primero)} al ${fecha(d.ultimo)}` : ''}</p>
      </div>
      ${d.objetos ? `<div class="alm-desglose__rejilla">
        ${lista('Por tipo de archivo', d.por_tipo, (f) => (f.clave === 'sin extensión' ? f.clave : '.' + f.clave))}
        ${lista('Por carpeta', d.por_carpeta, (f) => f.clave)}
        ${lista('Subido por mes (último año)', d.por_mes, (f) => mes(f.clave))}
        <section class="alm-bloque alm-bloque--mini"><h4>Los más grandes</h4><ul class="alm-previa__elementos alm-mayores">${d.mayores.map((m) =>
          `<li><span>${esc(m.nombre)}</span><small>${bytes(m.bytes)} · ${fecha(m.fecha)}</small></li>`).join('')}</ul></section>
      </div>` : '<p class="pista">El bucket está vacío.</p>'}
    </div>`;
  }

  /* ---------- 2. Reglas ---------- */
  const firma = () => JSON.stringify({ reglas, avisos });
  const hayCambios = () => firma() !== guardadas;
  const unidad = (r, n) => (r.origen === 'storage' ? 'archivo' : r.origen === 'tabla' ? 'fila' : 'documento') + (n === 1 ? '' : 's');
  function describir(r) {
    if (r.origen === 'storage' && r.tipo === 'huerfanos') return { titulo: nombre(r.destino), sub: `${r.destino} · archivos que no usa ninguna tabla`, antes: 'Borrar si tienen más de', despues: 'días' };
    if (r.origen === 'storage') return { titulo: nombre(r.destino), sub: `${r.destino} · por antigüedad`, antes: 'Borrar si tienen más de', despues: 'días' };
    if (r.origen === 'tabla') return { titulo: nombre(r.destino), sub: `${r.destino} · por fecha (${r.columna})`, antes: 'Borrar si tienen más de', despues: 'días' };
    return { titulo: nombre(r.destino), sub: `${r.destino} · por fecha de creación`, antes: 'Borrar si tienen más de', despues: 'días' };
  }
  function pintarReglas() {
    $('[data-panel-reglas]').hidden = false;
    const GRUPOS = [['storage', 'Archivos · Supabase Storage', ICONO.archivos], ['tabla', 'Base de datos · Supabase', ICONO.db], ['firestore', 'Firestore · 3DProject', ICONO.fuego]];
    $('[data-reglas]').innerHTML = GRUPOS.map(([origen, titulo, icono]) => {
      const filas = reglas.map((r, i) => [r, i]).filter(([r]) => r.origen === origen);
      if (!filas.length) return '';
      return `<section class="alm-grupo"><h3 class="alm-grupo__titulo">${icono}<span>${titulo}</span></h3><ul class="alm-reglas">${filas.map(([r, i]) => {
        const d = describir(r);
        return `<li class="alm-regla${r.activa ? ' activa' : ''}">
          <label class="adm-interruptor" title="Activar o desactivar"><input type="checkbox" data-i="${i}" data-campo="activa"${r.activa ? ' checked' : ''} aria-label="Regla activa: ${esc(d.titulo)}"><span aria-hidden="true"></span></label>
          <div class="alm-regla__texto"><b>${esc(d.titulo)}</b><small>${esc(d.sub)}</small></div>
          <label class="alm-regla__dias"><span>${d.antes}</span>
            <span class="alm-regla__n"><input type="number" min="1" max="3650" step="1" inputmode="numeric" value="${r.dias}" data-i="${i}" data-campo="dias"> ${d.despues}</span></label>
        </li>`; }).join('')}</ul></section>`;
    }).join('') + `
      <section class="alm-grupo"><h3 class="alm-grupo__titulo">${ICONO.info}<span>Avisos de espacio</span></h3>
        <div class="alm-umbrales">
          <label><span class="alm-chip alm-chip--aviso">Revisar pronto</span> desde el <input type="number" min="1" max="100" value="${avisos.aviso}" data-aviso="aviso"> %</label>
          <label><span class="alm-chip alm-chip--critico">Casi lleno</span> desde el <input type="number" min="1" max="100" value="${avisos.critico}" data-aviso="critico"> %</label>
        </div></section>`;
    actualizarBotones();
  }
  raiz.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.campo === 'dias') reglas[t.dataset.i].dias = Math.max(1, Math.round(Number(t.value) || 1));
    else if (t.dataset.campo === 'activa') { reglas[t.dataset.i].activa = t.checked; t.closest('.alm-regla').classList.toggle('activa', t.checked); }
    else if (t.dataset.aviso) { avisos[t.dataset.aviso] = Math.min(100, Math.max(1, Number(t.value) || 1)); if (datos) pintarUso(); }
    else return;
    previa = null; $('[data-resultado-previa]').innerHTML = '';
    actualizarBotones();
  });
  function actualizarBotones() { $('[data-guardar]').disabled = !hayCambios(); }

  /* ---------- 3. Vista previa ---------- */
  $('[data-previa]').addEventListener('click', async () => {
    const btn = $('[data-previa]'), cont = $('[data-resultado-previa]');
    btn.disabled = true;
    cont.innerHTML = '<p class="vacio">Buscando lo que se borraría…</p>';
    try {
      previa = (await llamar({ accion: 'previa', reglas })).previas;
      pintarPrevia();
    } catch (err) { cont.innerHTML = `<div class="alm-error"><p>${esc(err.message)}</p></div>`; }
    finally { btn.disabled = false; }
  });
  function pintarPrevia() {
    const cont = $('[data-resultado-previa]');
    const conAlgo = previa.filter((p) => p.total > 0);
    cont.innerHTML = `<div class="alm-previa">
      <h3>Vista previa <span class="pista">Lo que se borraría hoy con estas reglas (activas o no). Marca lo que quieras limpiar ahora.</span></h3>
      <ul class="alm-previa__lista">${previa.map((p, i) => {
        const d = describir(p.regla);
        const info = p.error ? `<span class="alm-previa__error">${esc(p.error)}</span>`
          : p.total ? `${miles(p.total)} ${unidad(p.regla, p.total)}${p.bytes ? ' · ' + bytes(p.bytes) : ''} · anteriores al ${fecha(p.hasta)}`
          : 'Nada que borrar';
        const muestra = (p.elementos || []).slice(0, 50).map((e) => `<li><span>${esc(e.id)}</span><small>${bytes(e.bytes)} · ${fecha(e.fecha)}</small></li>`).join('');
        return `<li class="alm-previa__item${p.total ? '' : ' vacia'}">
          <label class="alm-previa__marca"><input type="checkbox" data-p="${i}"${p.total && !p.error ? (p.regla.activa ? ' checked' : '') : ' disabled'}>
            <span><b>${esc(d.titulo)}</b><small>${info}</small></span></label>
          ${muestra ? `<details><summary>Ver ${p.elementos.length > 50 ? 'los 50 primeros' : 'la lista'}</summary><ul class="alm-previa__elementos">${muestra}</ul></details>` : ''}
        </li>`; }).join('')}</ul>
      ${conAlgo.length ? `<button type="button" class="btn alm-btn alm-btn--peligro" data-limpiar>${ICONO.papelera}<span>Limpiar ahora</span></button>` : ''}
    </div>`;
    const b = cont.querySelector('[data-limpiar]');
    if (b) b.addEventListener('click', () => {
      const sel = seleccion();
      if (!sel.length) return alert('Marca al menos una regla de la vista previa.');
      abrirDialogo('limpiar', sel);
    });
  }
  function seleccion() {
    return [...raiz.querySelectorAll('[data-p]:checked')].map((c) => previa[c.dataset.p]);
  }

  /* ---------- Confirmación con la contraseña ---------- */
  const dialogo = document.createElement('dialog');
  dialogo.className = 'adm-dialogo';
  dialogo.innerHTML = `
    <form class="adm-dialogo__caja">
      <span class="adm-dialogo__icono">${ICONO.candado}</span>
      <h3 data-titulo></h3>
      <p class="pista" data-texto></p>
      <label class="adm-dialogo__campo"><span>Contraseña del administrador</span>
        <input type="password" name="clave" autocomplete="current-password" required></label>
      <p class="adm-dialogo__error" role="alert" hidden></p>
      <div class="adm-dialogo__botones">
        <button type="submit" class="btn" data-confirmar></button>
        <button type="button" class="btn btn-cancelar" data-volver>Cancelar</button>
      </div>
    </form>`;
  document.body.appendChild(dialogo);
  const form = dialogo.querySelector('form'), errorEl = dialogo.querySelector('.adm-dialogo__error');
  const fallo = (html) => { errorEl.innerHTML = html; errorEl.hidden = false; };
  let modo = null, pendiente = null;
  dialogo.querySelector('[data-volver]').addEventListener('click', () => dialogo.close());

  function abrirDialogo(m, sel) {
    modo = m; pendiente = sel;
    const conf = dialogo.querySelector('[data-confirmar]');
    if (m === 'guardar') {
      dialogo.querySelector('[data-titulo]').textContent = 'Guardar las reglas';
      const activas = reglas.filter((r) => r.activa).length;
      dialogo.querySelector('[data-texto]').textContent = `Quedarán ${activas} ${activas === 1 ? 'regla activa' : 'reglas activas'}, que se aplicarán cada noche sin preguntar. Para confirmarlo, escribe tu contraseña.`;
      conf.textContent = 'Guardar reglas'; conf.classList.remove('alm-btn--peligro');
    } else {
      const n = sel.reduce((t, p) => t + p.total, 0), b = sel.reduce((t, p) => t + p.bytes, 0);
      dialogo.querySelector('[data-titulo]').textContent = 'Limpiar ahora';
      dialogo.querySelector('[data-texto]').textContent = `Se borrarán para siempre ${miles(n)} elementos${b ? ' (' + bytes(b) + ')' : ''} de: ${sel.map((p) => describir(p.regla).titulo).join(', ')}. No se puede deshacer. Para confirmarlo, escribe tu contraseña.`;
      conf.textContent = 'Borrar'; conf.classList.add('alm-btn--peligro');
    }
    form.reset(); errorEl.hidden = true; dialogo.showModal(); form.clave.focus();
  }
  $('[data-guardar]').addEventListener('click', () => abrirDialogo('guardar'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = dialogo.querySelector('[data-confirmar]'), texto = boton.textContent;
    boton.disabled = true; errorEl.hidden = true;
    try {
      const { data } = await sb.auth.getUser();
      const email = data && data.user && data.user.email;
      if (!email) return fallo('La sesión ha caducado. Vuelve a entrar en el panel.');
      const { error } = await sb.auth.signInWithPassword({ email, password: form.clave.value });
      if (error) return fallo('La contraseña no es correcta.');
      if (modo === 'guardar') {
        boton.textContent = 'Guardando…';
        const actual = (datos && datos.config) || {};
        const { error: e2 } = await sb.from('config_tasadora').upsert({ clave: CLAVE, valor: { avisos, reglas, registro: actual.registro || [] }, actualizado: new Date().toISOString() });
        if (e2) throw e2;
        guardadas = firma(); actualizarBotones();
        dialogo.close();
        await cargar();
      } else {
        boton.textContent = 'Borrando…';
        const r = await llamar({ accion: 'limpiar', seleccion: pendiente.map((p) => ({ regla: p.regla, hasta: p.hasta, ids: p.regla.origen === 'tabla' ? undefined : p.elementos.map((x) => x.id) })) });
        dialogo.close();
        const errores = r.resultado.filter((x) => x.error);
        const total = r.resultado.reduce((t, x) => t + (x.borrados || 0), 0);
        $('[data-resultado-previa]').innerHTML = `<div class="${errores.length ? 'alm-error' : 'alm-ok'}"><p><strong>${miles(total)} elementos borrados.</strong>${errores.map((x) => ' ' + esc(x.regla) + ': ' + esc(x.error)).join('')}</p></div>`;
        previa = null;
        await cargar();
      }
    } catch (err) {
      fallo('No se pudo completar: ' + esc(err.message || err));
    } finally { boton.disabled = false; boton.textContent = texto; }
  });

  /* ---------- Registro ---------- */
  function pintarRegistro(registro) {
    $('[data-panel-registro]').hidden = !registro.length;
    $('[data-registro]').innerHTML = `<ul class="alm-registro">${registro.map((r) => {
      const res = r.resultado || [];
      const n = res.reduce((t, x) => t + (x.borrados || 0), 0), b = res.reduce((t, x) => t + (x.bytes || 0), 0);
      const err = res.filter((x) => x.error);
      return `<li><b>${fechaHora(r.fecha)}</b> <span class="alm-etiqueta">${r.origen === 'manual' ? 'A mano' : 'Programada'}</span>
        <span>${miles(n)} borrados${b ? ' · ' + bytes(b) : ''}${err.length ? ` · <span class="alm-previa__error">${err.length} con error</span>` : ''}</span></li>`; }).join('')}</ul>`;
  }

  return { raiz, cargar };
}
