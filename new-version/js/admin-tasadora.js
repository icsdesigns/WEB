/* ============================================================
   SILAB 3D · Panel de administración · Tasadora
   No es otra tasadora: monta la misma del formulario «Configura tu proyecto»
   (su marcado, sus estilos y js/configura-tasadora.js, que usa el motor del
   Presupuesto instantáneo). Todo se lee de /configura-tu-proyecto/ al abrir la
   pestaña y se coloca dentro del mismo contenedor que en el formulario
   (.quote-wrapper.is-ancho), así la distribución es idéntica y cualquier mejora
   del formulario llega también aquí.

   La pestaña tiene dos pasos:
     1. Probar la tasadora (con el tipo de proyecto y las figuras básicas encima).
     2. Configurarla: una tarjeta por ajuste; al pulsarla se abre su editor.

   Cada función extra es un objeto de la lista EXTRAS:
     { id, titulo, ayuda, icono, lugar: 'prueba' | 'config', resumen?(ctx), pendiente?(ctx), montar(cuerpo, ctx) }
   Para añadir una configuración nueva basta con escribir otro objeto y sumarlo a la lista.
     · ctx.sb        cliente de Supabase con la sesión del panel
     · ctx.tasadora  API de la tasadora (cargar, quitarCama, camas, actual, resumen, aplicarConfig…)
     · ctx.ajustes   ajustes de la tasadora (js/tasadora-config.js): cfg, cambiar(), descartar()…
     · ctx.cambios   cambios pendientes: cada configuración registra { nombre, pendiente(), guardar(), descartar() }
     · ctx.refrescar() vuelve a pintar los resúmenes de las tarjetas, la cabecera y la barra de guardar

   Guardado (decisión de Iván, 05/10/2026): ningún cambio de configuración se guarda al momento.
   Se acumulan y se guardan todos juntos al pulsar «Guardar cambios» o al salir de la pestaña,
   siempre con la contraseña del administrador como confirmación. Probar la tasadora (subir
   archivos, crear o cargar figuras) no es un cambio.
   ============================================================ */

import { vinculacion3dcalc, DEFECTO as DEFECTO_VINC } from './admin-vinculacion.js?v=20261005a';
import { OPCIONES } from './presupuesto-motor.js?v=20261002g';
import { CLAVE, GRUPOS, GRUPOS_NORMAL, DEFECTO, mezclar, opcionesVisibles, SQL as SQL_AJUSTES } from './tasadora-config.js?v=20261005a';

const ORIGEN = '/configura-tu-proyecto/';

/* ---------- Iconos (trazo, como el resto del panel) ---------- */
const svg = (d) => `<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONO = {
  tasadora: svg('<path d="M12 2.8 3.5 7.4v9.2l8.5 4.6 8.5-4.6V7.4z"/><path d="m3.5 7.4 8.5 4.6 8.5-4.6M12 12v9.2"/>'),
  limites: svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>'),
  opciones: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  biblioteca: svg('<path d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="m9 14 3-2.5 3 2.5M12 11.5V17"/>'),
  vinculo: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  cubo: svg('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  cilindro: svg('<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/>'),
  esfera: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12c0 1.8 3.8 3.2 8.5 3.2s8.5-1.4 8.5-3.2"/>'),
  reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
  archivo: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  subir: svg('<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>'),
  quitar: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  candado: svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  guardar: svg('<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M8 3.5V8h7V3.5M7.5 20.5v-6h9v6"/>'),
  externo: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>')
};

/* Monta la pestaña. «doc» es el HTML de ORIGEN ya leído (el import map se inserta antes,
   en admin/index.html, porque tiene que ir antes del primer módulo de la página). */
export async function montar(doc, { sb, raiz }) {
  // Estilos de la tasadora (mismas versiones que el formulario)
  const estilos = [...doc.querySelectorAll('link[rel="stylesheet"]')]
    .map((l) => l.getAttribute('href'))
    .filter((h) => /\/css\/(presupuesto|configura-v2)\.css/.test(h) && !document.querySelector(`link[href="${h}"]`));
  await Promise.all(estilos.map((href) => new Promise((ok) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = ok;
    document.head.appendChild(l);
  })));

  const caja = doc.getElementById('refTasadora');
  const script = doc.querySelector('script[type="module"][src*="configura-tasadora.js"]');
  if (!caja || !script) throw new Error('No se encuentra la tasadora en ' + ORIGEN);

  // Estructura de la pestaña (el selector de tipo de proyecto tiene que existir antes de cargar la tasadora)
  const hueco = raiz.querySelector('[data-tasadora]');
  const pestana = document.createElement('div');
  pestana.className = 'adm-tas';
  pestana.innerHTML = `
    <div class="panel adm-tas__cabecera">
      <div class="adm-tas__intro">
        <span class="adm-tas__sello">${ICONO.tasadora}</span>
        <div>
          <h2>Tasadora</h2>
          <p class="pista">La misma que usan tus clientes en «Configura tu proyecto». Pruébala aquí y ajusta cómo funciona: lo que guardes se aplica a las dos.</p>
        </div>
      </div>
      <ul class="adm-tas__chips" data-chips aria-label="Estado de la tasadora"></ul>
    </div>

    <section class="panel adm-tas__paso" aria-labelledby="admTasPaso1">
      <header class="adm-tas__titulo">
        <span class="adm-tas__num">1</span>
        <div><h3 id="admTasPaso1">Prueba la tasadora</h3><p class="pista">Sube un archivo, crea una figura básica o carga una figura guardada.</p></div>
        <a class="adm-tas__enlace" href="${ORIGEN}" target="_blank" rel="noopener">Ver el formulario ${ICONO.externo}</a>
      </header>
      <div class="adm-tas__barra">
        <div class="adm-tas__grupo">
          <span class="adm-tas__rotulo">Tipo de proyecto</span>
          <div class="pi-seg adm-tipo" role="radiogroup" aria-label="Tipo de proyecto">
            <label><input type="radio" name="projectPieceType" value="artisticas" checked><span><b>Artísticas</b><small>Figuras y decoración</small></span></label>
            <label><input type="radio" name="projectPieceType" value="resistentes"><span><b>Resistentes</b><small>Funcionales</small></span></label>
          </div>
        </div>
        <div class="adm-tas__extras" data-lugar="prueba"></div>
      </div>
      <div class="quote-wrapper is-ancho adm-tas__marco"><div data-hueco></div></div>
    </section>

    <section class="panel adm-tas__paso" aria-labelledby="admTasPaso2">
      <header class="adm-tas__titulo">
        <span class="adm-tas__num">2</span>
        <div><h3 id="admTasPaso2">Configura la tasadora</h3><p class="pista">Elige qué quieres cambiar.</p></div>
      </header>
      <div class="adm-tarjetas" role="tablist" aria-label="Configuración de la tasadora" data-tarjetas></div>
      <div class="adm-tas__editores" data-editores></div>
    </section>`;
  hueco.replaceWith(pestana);

  // Marcado de la tasadora (sin el error de validación, que es del formulario), en el mismo contenedor que allí
  caja.querySelector('#errTasadora')?.remove();
  caja.hidden = false;
  pestana.querySelector('[data-hueco]').replaceWith(document.adoptNode(caja));

  // El mismo módulo (y la misma versión) que carga el formulario
  await import(script.getAttribute('src'));
  const tasadora = window.silabTasadora;
  if (!tasadora || !tasadora.cargar) throw new Error('La tasadora no expone las funciones del panel');

  // Ajustes guardados y estado de la vinculación, en una sola consulta
  const { data: filas, error: errorFilas } = await sb.from('config_tasadora').select('clave, valor');
  const fila = (k) => ((filas || []).find((f) => f.clave === k) || {}).valor;
  const ajustes = crearAjustes(sb, tasadora, fila(CLAVE), errorFilas);
  const ctx = { sb, tasadora, ajustes, vinculacion: fila('vinculacion_3dcalc') || null, figuras: null, refrescar: () => {}, remontar: () => {} };
  ctx.cambios = crearCambios(ctx, pestana);
  ctx.cambios.registrar({
    id: 'ajustes',
    nombre: 'límites y opciones',
    pendiente: () => ajustes.sinGuardar(),
    guardar: () => ajustes.guardar(),
    descartar: () => ajustes.descartar()
  });

  // Paso 1: extras junto a la tasadora
  for (const extra of EXTRAS.filter((x) => x.lugar === 'prueba')) {
    const bloque = document.createElement('div');
    bloque.className = 'adm-tas__grupo';
    bloque.dataset.extra = extra.id;
    bloque.innerHTML = `<span class="adm-tas__rotulo">${extra.titulo}</span><div></div>`;
    pestana.querySelector('[data-lugar="prueba"]').appendChild(bloque);
    extra.montar(bloque.lastElementChild, ctx);
  }

  // Paso 2: una tarjeta por ajuste; el editor se monta la primera vez que se abre
  const tarjetas = pestana.querySelector('[data-tarjetas]'), editores = pestana.querySelector('[data-editores]');
  const config = EXTRAS.filter((x) => x.lugar === 'config');
  const montados = new Set();
  for (const extra of config) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'adm-tarjeta'; b.setAttribute('role', 'tab');
    b.id = 'admTarjeta-' + extra.id; b.dataset.extra = extra.id;
    b.setAttribute('aria-controls', 'admEditor-' + extra.id); b.setAttribute('aria-selected', 'false');
    b.innerHTML = `<span class="adm-tarjeta__icono">${extra.icono}</span><span class="adm-tarjeta__titulo">${extra.titulo}</span><span class="adm-tarjeta__resumen" data-resumen></span>`;
    tarjetas.appendChild(b);
    const ed = document.createElement('div');
    ed.className = 'adm-editor'; ed.id = 'admEditor-' + extra.id; ed.setAttribute('role', 'tabpanel'); ed.hidden = true;
    ed.setAttribute('aria-labelledby', b.id);
    ed.innerHTML = `<div class="adm-editor__cabecera"><span class="adm-editor__icono">${extra.icono}</span><div><h4>${extra.titulo}</h4>${extra.ayuda ? `<p class="pista">${extra.ayuda}</p>` : ''}</div></div><div class="adm-editor__cuerpo"></div>`;
    editores.appendChild(ed);
    b.addEventListener('click', () => abrir(extra.id));
  }
  function abrir(id) {
    for (const extra of config) {
      const activa = extra.id === id;
      const b = tarjetas.querySelector(`[data-extra="${extra.id}"]`), ed = editores.querySelector('#admEditor-' + extra.id);
      b.classList.toggle('activa', activa); b.setAttribute('aria-selected', String(activa));
      ed.hidden = !activa;
      if (activa && !montados.has(extra.id)) { montados.add(extra.id); extra.montar(ed.querySelector('.adm-editor__cuerpo'), ctx); }
    }
  }
  // Vuelve a montar un editor desde cero (al descartar sus cambios); uno sin abrir no hace falta
  ctx.remontar = (id) => {
    if (!montados.has(id)) return;
    const viejo = editores.querySelector('#admEditor-' + id + ' .adm-editor__cuerpo'), nuevo = viejo.cloneNode(false);
    viejo.replaceWith(nuevo);
    config.find((x) => x.id === id).montar(nuevo, ctx);
  };

  // Resúmenes de las tarjetas y chips de la cabecera
  ctx.refrescar = () => {
    for (const extra of config) {
      const r = extra.resumen ? extra.resumen(ctx) : '';
      const b = tarjetas.querySelector(`[data-extra="${extra.id}"]`);
      b.querySelector('[data-resumen]').textContent = r;
      b.classList.toggle('pendiente', !!(extra.pendiente && extra.pendiente(ctx)));
    }
    const l = ajustes.cfg.limites, v = ctx.vinculacion, hay = ctx.cambios.hay();
    const chips = [
      [hay ? 'Cambios sin guardar' : ajustes.guardado ? 'Ajustes guardados' : 'Ajustes de siempre', hay ? 'aviso' : ''],
      [`Límites: ${fmt(l.ladoMm / 10)} cm · ${fmt(l.horas)} h · ${fmt(l.volumenMinCm3)} cm³`, ''],
      [ctx.figuras == null ? 'Figuras guardadas: …' : `${ctx.figuras} ${ctx.figuras === 1 ? 'figura guardada' : 'figuras guardadas'}`, ''],
      [v && v.precio_activo === false ? 'Precio al momento: no' : 'Precio al momento: sí', v && v.precio_activo === false ? 'aviso' : 'ok']
    ];
    pestana.querySelector('[data-chips]').innerHTML = chips.map(([t, tono]) => `<li class="adm-chip${tono ? ' adm-chip--' + tono : ''}">${esc(t)}</li>`).join('');
    ctx.cambios.pintar();
  };
  ajustes.alCambiar = ctx.refrescar;
  ctx.refrescar();
  abrir(config[0].id);
  contarFiguras(ctx);

  tasadora.mostrar();
  return tasadora;
}

/* ============================================================
   Utilidades comunes
   ============================================================ */
const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
const num = (v) => parseFloat(String(v).replace(',', '.'));
const fmt = (v) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const tamano = (b) => b < 1024 * 1024 ? fmt(b / 1024) + ' KB' : fmt(b / 1024 / 1024) + ' MB';
const copia = (o) => JSON.parse(JSON.stringify(o));

// Nombre de archivo que no se repita entre las camas ya cargadas: «Cubo 30 mm.stl», «Cubo 30 mm (2).stl»…
function nombreLibre(base, ext, tasadora) {
  const usados = new Set(tasadora.camas());
  let nombre = base + '.' + ext;
  for (let k = 2; usados.has(nombre); k++) nombre = base + ' (' + k + ').' + ext;
  return nombre;
}

/* ---------- Ajustes de la tasadora (límites, opciones del cliente y modo Normal) ----------
   Se editan aquí y se ven al momento en la tasadora de la pestaña (aplicarConfig); se guardan
   (y los ven los clientes) con «Guardar cambios». */
function crearAjustes(sb, tasadora, guardadoInicial, errorLectura) {
  const a = {
    guardado: guardadoInicial ? mezclar(DEFECTO, guardadoInicial) : null,
    errorLectura,
    cfg: null,
    alCambiar: () => {},
    repintores: new Set(),   // editores abiertos que hay que volver a pintar al descartar
    sinGuardar: () => JSON.stringify(a.cfg) !== JSON.stringify(a.guardado || DEFECTO),
    vistaPrevia: () => typeof tasadora.aplicarConfig === 'function',
    cambiar() {
      if (a.vistaPrevia()) tasadora.aplicarConfig(copia(a.cfg));
      a.alCambiar();
    },
    deSiempre() { a.cfg = copia(DEFECTO); a.cambiar(); },
    descartar() { a.cfg = copia(a.guardado || DEFECTO); a.cambiar(); a.repintores.forEach((f) => f()); },
    async guardar() {
      const { error } = await sb.from('config_tasadora').upsert({ clave: CLAVE, valor: a.cfg, actualizado: new Date().toISOString() });
      if (error) throw Object.assign(error, { sql: SQL_AJUSTES });
      a.guardado = copia(a.cfg);
      a.alCambiar();
    }
  };
  a.cfg = copia(a.guardado || DEFECTO);
  if (a.guardado && a.vistaPrevia()) tasadora.aplicarConfig(copia(a.cfg));
  return a;
}

// Pie común de los editores de ajustes: volver a los valores de siempre (el guardado es común a toda la pestaña)
function pieAjustes(cuerpo, ajustes, repintar) {
  ajustes.repintores.add(repintar);
  const pie = document.createElement('div');
  pie.className = 'adm-editor__pie';
  pie.innerHTML = `
    <p class="pista adm-editor__nota">${ajustes.vistaPrevia()
      ? 'Los cambios se ven al momento en la tasadora de arriba. Tus clientes los verán cuando pulses «Guardar cambios».'
      : 'Tus clientes verán estos ajustes cuando pulses «Guardar cambios».'}</p>
    <div class="adm-editor__botones">
      <button type="button" class="btn btn-cancelar" data-siempre>Valores de siempre</button>
    </div>`;
  cuerpo.appendChild(pie);
  pie.querySelector('[data-siempre]').addEventListener('click', () => { ajustes.deSiempre(); repintar(); });
}

/* ---------- Cambios pendientes: barra «Guardar cambios» y confirmación con la contraseña ---------- */
function crearCambios(ctx, pestana) {
  const fuentes = new Map();
  let saltar = false;
  const c = {
    registrar: (f) => { fuentes.set(f.id, f); },
    pendientes: () => [...fuentes.values()].filter((f) => f.pendiente()),
    hay: () => c.pendientes().length > 0,
    async guardarTodo() { for (const f of c.pendientes()) await f.guardar(); ctx.refrescar(); },
    descartarTodo() { for (const f of c.pendientes()) f.descartar(); ctx.refrescar(); }
  };

  const barra = document.createElement('div');
  barra.className = 'adm-guardar';
  barra.hidden = true;
  barra.setAttribute('role', 'region');
  barra.setAttribute('aria-label', 'Cambios sin guardar');
  barra.innerHTML = `
    <span class="adm-guardar__icono">${ICONO.guardar}</span>
    <p class="adm-guardar__texto" aria-live="polite"></p>
    <div class="adm-guardar__botones">
      <button type="button" class="btn btn-cancelar" data-descartar>Descartar</button>
      <button type="button" class="btn" data-guardar>Guardar cambios</button>
    </div>`;
  pestana.appendChild(barra);
  barra.querySelector('[data-guardar]').addEventListener('click', () => c.pedirClave('guardar'));
  barra.querySelector('[data-descartar]').addEventListener('click', () => {
    if (confirm('¿Descartar los cambios sin guardar de ' + unir(c.pendientes().map((f) => f.nombre)) + '?')) c.descartarTodo();
  });
  c.pintar = () => {
    const p = c.pendientes();
    barra.hidden = !p.length;
    if (p.length) barra.querySelector('.adm-guardar__texto').innerHTML = '<b>Cambios sin guardar</b> en ' + esc(unir(p.map((f) => f.nombre))) + '.';
  };

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
        <button type="submit" class="btn" data-confirmar>Guardar cambios</button>
        <button type="button" class="btn btn-cancelar adm-dialogo__salir" data-salir>Salir sin guardar</button>
        <button type="button" class="btn btn-cancelar" data-volver>Seguir editando</button>
      </div>
    </form>`;
  document.body.appendChild(dialogo);
  const form = dialogo.querySelector('form'), errorEl = dialogo.querySelector('.adm-dialogo__error');
  let resolver = null;
  const cerrar = (r) => { dialogo.close(); const f = resolver; resolver = null; if (f) f(r); };
  const fallo = (html) => { errorEl.innerHTML = html; errorEl.hidden = false; };

  // modo «guardar» (botón) o «salir» (al cambiar de pestaña o cerrar sesión). Devuelve 'guardado' | 'descartado' | 'cancelado'
  c.pedirClave = (modo) => new Promise((ok) => {
    resolver = ok;
    const nombres = unir(c.pendientes().map((f) => f.nombre));
    dialogo.querySelector('[data-titulo]').textContent = modo === 'salir' ? 'Tienes cambios sin guardar' : 'Guardar los cambios';
    dialogo.querySelector('[data-texto]').textContent = (modo === 'salir' ? 'Antes de salir de la tasadora, guarda los cambios en ' : 'Vas a guardar los cambios en ') + nombres + '. Tus clientes los verán al momento. Para confirmarlo, escribe tu contraseña.';
    dialogo.querySelector('[data-salir]').hidden = modo !== 'salir';
    form.reset(); errorEl.hidden = true;
    dialogo.showModal();
    form.clave.focus();
  });
  dialogo.querySelector('[data-volver]').addEventListener('click', () => cerrar('cancelado'));
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar('cancelado'); });
  dialogo.querySelector('[data-salir]').addEventListener('click', () => { c.descartarTodo(); cerrar('descartado'); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = dialogo.querySelector('[data-confirmar]');
    boton.disabled = true; errorEl.hidden = true;
    try {
      const { data } = await ctx.sb.auth.getUser();
      const email = data && data.user && data.user.email;
      if (!email) return fallo('La sesión ha caducado. Vuelve a entrar en el panel.');
      const { error } = await ctx.sb.auth.signInWithPassword({ email, password: form.clave.value });
      if (error) return fallo('La contraseña no es correcta.');
      boton.textContent = 'Guardando…';
      await c.guardarTodo();
      cerrar('guardado');
    } catch (err) {
      fallo('No se pudo guardar: ' + esc(err.message) + '.' + (err.sql ? '<br>Si es la primera vez, prepara Supabase (una sola vez): en SQL Editor pega esto y pulsa Run.<pre class="adm-sql">' + esc(err.sql) + '</pre>' : ''));
    } finally { boton.disabled = false; boton.textContent = 'Guardar cambios'; }
  });

  // Salir de la pestaña (otra pestaña del panel, cerrar sesión o el logo) con cambios: se pide guardar
  const enTasadora = () => !document.getElementById('tab-tasadora').classList.contains('oculto');
  const interceptar = (sel, seguir) => document.addEventListener('click', async (e) => {
    const el = e.target.closest(sel);
    if (!el || saltar || !enTasadora() || !c.hay() || (el.dataset.tab === 'tasadora')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (await c.pedirClave('salir') !== 'cancelado') { saltar = true; seguir(el); saltar = false; }
  }, true);
  interceptar('nav.pestanas button', (el) => el.click());
  interceptar('#btn-salir', (el) => el.click());
  interceptar('.barra a[href]', (el) => { location.href = el.href; });
  window.addEventListener('beforeunload', (e) => { if (c.hay()) { e.preventDefault(); e.returnValue = ''; } });
  return c;
}
const unir = (l) => l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];

/* ---------- Geometría: figuras básicas en STL binario ---------- */
function stl(tris) {
  // Si el volumen con signo sale negativo, las caras miran hacia dentro: se da la vuelta a todas
  let v = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (v < 0) for (let i = 0; i < tris.length; i += 9) for (let k = 0; k < 3; k++) { const t = tris[i + 3 + k]; tris[i + 3 + k] = tris[i + 6 + k]; tris[i + 6 + k] = t; }
  const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50, t = tris.subarray(i * 9, i * 9 + 9);
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], wx = t[6] - t[0], wy = t[7] - t[1], wz = t[8] - t[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, t[k], true);
  }
  return buf;
}
// Malla de una superficie en rejilla (filas × columnas de puntos), cerrada en las columnas
function rejilla(puntos, filas, cols) {
  const out = [];
  const p = (j, i) => puntos[j * cols + (i % cols)];
  for (let j = 0; j < filas - 1; j++) for (let i = 0; i < cols; i++) {
    const a = p(j, i), b = p(j + 1, i), c = p(j + 1, i + 1), d = p(j, i + 1);
    if (a !== d && Math.hypot(a[0] - d[0], a[1] - d[1], a[2] - d[2]) > 1e-9) out.push(...a, ...b, ...d);
    if (b !== c && Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]) > 1e-9) out.push(...b, ...c, ...d);
  }
  return out;
}
const SEG = 128;
const FIGURAS = {
  cubo: {
    rotulo: 'Cubo',
    medidas: [['lado', 'Lado', 30]],
    nombre: (m) => `Cubo ${fmt(m.lado)} mm`,
    malla: ({ lado: L }) => {
      const P = (x, y, z) => [x * L, y * L, z * L], q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
      return [
        ...q(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)), ...q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),
        ...q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)), ...q(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)),
        ...q(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)), ...q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1))
      ];
    }
  },
  cilindro: {
    rotulo: 'Cilindro',
    medidas: [['diametro', 'Ø', 30], ['altura', 'Alto', 40]],
    nombre: (m) => `Cilindro Ø${fmt(m.diametro)} × ${fmt(m.altura)} mm`,
    malla: ({ diametro, altura }) => {
      const r = diametro / 2, pts = [];
      // Perfil: centro de la base → borde inferior → borde superior → centro de la tapa
      for (const [rr, z] of [[0, 0], [r, 0], [r, altura], [0, altura]]) for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * 2 * Math.PI;
        pts.push([rr * Math.cos(a), rr * Math.sin(a), z]);
      }
      return rejilla(pts, 4, SEG);
    }
  },
  esfera: {
    rotulo: 'Esfera',
    medidas: [['diametro', 'Ø', 30]],
    nombre: (m) => `Esfera Ø${fmt(m.diametro)} mm`,
    malla: ({ diametro }) => {
      const r = diametro / 2, filas = SEG / 2 + 1, pts = [];
      for (let j = 0; j < filas; j++) {
        const f = (j / (filas - 1)) * Math.PI;
        for (let i = 0; i < SEG; i++) {
          const a = (i / SEG) * 2 * Math.PI, s = j === 0 || j === filas - 1 ? 0 : Math.sin(f);
          pts.push([r * s * Math.cos(a), r * s * Math.sin(a), r - r * Math.cos(f)]);
        }
      }
      return rejilla(pts, filas, SEG);
    }
  }
};

/* ============================================================
   PASO 1 · Figuras básicas: un cubo, un cilindro o una esfera por cama
   Sin pedir medidas (decisión de Iván, 05/10/2026): se crean con las de FIGURAS y se
   redimensionan después en la propia tasadora («Personalizado» → «Tamaño»).
   ============================================================ */
const figurasBasicas = {
  id: 'figuras-basicas',
  lugar: 'prueba',
  titulo: 'Añadir una figura básica',
  montar(cuerpo, { tasadora }) {
    cuerpo.className = 'adm-figuras';
    cuerpo.innerHTML = Object.entries(FIGURAS).map(([k, f]) => `
      <button type="button" class="adm-figura" data-forma="${k}" title="Añadir un ${f.rotulo.toLowerCase()} en una cama nueva">
        <span class="adm-figura__icono">${ICONO[k]}</span>
        <span class="adm-figura__nombre">${f.rotulo}</span>
        <span class="adm-figura__accion">+ Añadir</span>
      </button>`).join('') + `
      <button type="button" class="adm-quitar" data-quitar disabled>${ICONO.quitar}<span>Quitar la cama que se ve</span></button>
      <p class="pista adm-extra__estado" aria-live="polite"></p>`;
    const quitar = cuerpo.querySelector('[data-quitar]'), estado = cuerpo.querySelector('.adm-extra__estado');
    const refrescar = () => {
      const camas = tasadora.camas();
      quitar.disabled = !camas.length;
      quitar.title = camas.length ? 'Quitar «' + camas[tasadora.actual()] + '»' : 'No hay ninguna cama';
    };
    cuerpo.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-forma]');
      if (!b) return;
      const fig = FIGURAS[b.dataset.forma], m = Object.fromEntries(fig.medidas.map(([k, , def]) => [k, def]));
      const nombre = nombreLibre(fig.rotulo, 'stl', tasadora);
      const archivo = new File([stl(Float32Array.from(fig.malla(m)))], nombre, { type: 'model/stl' });
      estado.textContent = 'Creando «' + nombre + '»…';
      await tasadora.cargar([archivo], true);
      estado.textContent = '';
    });
    quitar.addEventListener('click', () => { tasadora.quitarCama(); });
    // Las camas cambian al cargar archivos, crear figuras o quitar camas; las flechas cambian la actual
    document.addEventListener('silab:tasadora-archivos', () => setTimeout(refrescar));
    document.getElementById('piAnt').addEventListener('click', refrescar);
    document.getElementById('piSig').addEventListener('click', refrescar);
    new MutationObserver(refrescar).observe(document.getElementById('piPos'), { childList: true, characterData: true, subtree: true });
    refrescar();
  }
};

/* ============================================================
   PASO 2 · Límites: cuándo pasa una pieza a ajuste o a revisión manual
   ============================================================ */
const LIMITES = [
  ['ladoMm', 'Lado más largo', 'cm', ICONO.limites, 'Si una cama mide más, se ofrece ajustarla o se revisa a mano.', 10, 1, 100, 0.5],
  ['horas', 'Tiempo de impresión', 'h', ICONO.reloj, 'Si una cama tarda más, se ofrece ajustarla o se revisa a mano.', 1, 1, 200, 0.5],
  ['volumenMinCm3', 'Volumen mínimo', 'cm³', ICONO.cubo, 'Las piezas más pequeñas se revisan a mano.', 1, 0, 1000, 0.5],
  ['maxMB', 'Tamaño máximo de archivo', 'MB', ICONO.archivo, 'Los archivos más grandes no se analizan.', 1, 1, 2000, 1]
];
const limites = {
  id: 'limites',
  lugar: 'config',
  icono: ICONO.limites,
  titulo: 'Límites',
  ayuda: 'Cuándo una pieza se ajusta automáticamente o pasa a revisión del equipo, y qué archivos se admiten.',
  resumen: ({ ajustes }) => { const l = ajustes.cfg.limites; return `${fmt(l.ladoMm / 10)} cm · ${fmt(l.horas)} h · ${fmt(l.volumenMinCm3)} cm³ · ${fmt(l.maxMB)} MB`; },
  pendiente: ({ ajustes }) => JSON.stringify(ajustes.cfg.limites) !== JSON.stringify((ajustes.guardado || DEFECTO).limites),
  montar(cuerpo, { ajustes }) {
    const pintar = () => {
      cuerpo.innerHTML = `<div class="adm-medidores">${LIMITES.map(([k, rot, ud, ic, ayuda, f, min, max, paso]) => `
        <label class="adm-medidor">
          <span class="adm-medidor__icono">${ic}</span>
          <span class="adm-medidor__rotulo">${rot}</span>
          <span class="adm-medidor__valor"><input type="number" data-k="${k}" data-f="${f}" value="${ajustes.cfg.limites[k] / f}" min="${min}" max="${max}" step="${paso}" inputmode="decimal"><span>${ud}</span></span>
          <span class="adm-medidor__ayuda">${ayuda}</span>
          <span class="adm-medidor__defecto">De siempre: ${fmt(DEFECTO.limites[k] / f)} ${ud}</span>
        </label>`).join('')}</div>`;
      pieAjustes(cuerpo, ajustes, pintar);
    };
    cuerpo.addEventListener('input', (e) => {
      const i = e.target.closest('input[data-k]');
      if (!i) return;
      const v = num(i.value);
      if (!(v >= Number(i.min)) || !(v <= Number(i.max))) { i.setAttribute('aria-invalid', 'true'); return; }
      i.removeAttribute('aria-invalid');
      ajustes.cfg.limites[i.dataset.k] = v * Number(i.dataset.f);
      ajustes.cambiar();
    });
    pintar();
  }
};

/* ============================================================
   PASO 2 · Opciones del cliente: qué opciones ve, con qué textos y cuál es el modo Normal
   ============================================================ */
const opcionesCliente = {
  id: 'opciones',
  lugar: 'config',
  icono: ICONO.opciones,
  titulo: 'Opciones del cliente',
  ayuda: 'Qué opciones de impresión puede elegir el cliente en «Personalizado», con qué nombre y qué valores usa el modo «Normal». El cálculo de cada opción no cambia.',
  resumen: ({ ajustes }) => {
    const ocultas = Object.keys(GRUPOS).reduce((s, g) => s + Object.keys(OPCIONES[g]).length - opcionesVisibles(OPCIONES, ajustes.cfg, g).length, 0);
    const n = ajustes.cfg.normal;
    return (ocultas ? ocultas + (ocultas === 1 ? ' opción oculta' : ' opciones ocultas') : 'Todas visibles') + ' · Normal: ' + GRUPOS_NORMAL.map((g) => OPCIONES[g][n[g]].rotulo).join(', ');
  },
  pendiente: ({ ajustes }) => { const g = ajustes.guardado || DEFECTO; return JSON.stringify([ajustes.cfg.opciones, ajustes.cfg.normal]) !== JSON.stringify([g.opciones, g.normal]); },
  montar(cuerpo, { ajustes }) {
    const propia = (g, k) => ((ajustes.cfg.opciones[g] || {})[k]) || {};
    const pintar = () => {
      cuerpo.innerHTML = `<div class="adm-grupos">${Object.entries(GRUPOS).map(([g, titulo]) => `
        <fieldset class="adm-grupo" data-g="${g}">
          <legend>${titulo}</legend>
          <div class="adm-grupo__muestra" aria-hidden="true"></div>
          <div class="adm-grupo__filas">${Object.entries(OPCIONES[g]).map(([k, o]) => {
            const p = propia(g, k), normal = GRUPOS_NORMAL.includes(g);
            return `
            <div class="adm-op" data-k="${k}">
              <label class="adm-interruptor" title="Visible para el cliente"><input type="checkbox" data-campo="visible"${p.visible !== false ? ' checked' : ''}><span aria-hidden="true"></span><span class="sr">Mostrar «${esc(o.rotulo)}»</span></label>
              <input type="text" data-campo="rotulo" value="${esc(p.rotulo || '')}" placeholder="${esc(o.rotulo)}" aria-label="Nombre de «${esc(o.rotulo)}»">
              <input type="text" data-campo="ayuda" value="${esc(p.ayuda || '')}" placeholder="${esc(g === 'altura' && k === 'personalizada' ? 'Elige las medidas' : o.ayuda)}" aria-label="Texto de ayuda de «${esc(o.rotulo)}»">
              ${normal ? `<label class="adm-op__normal" title="Valor del modo Normal"><input type="radio" name="admNormal-${g}" value="${k}"${ajustes.cfg.normal[g] === k ? ' checked' : ''}> Normal</label>` : ''}
            </div>`;
          }).join('')}</div>
        </fieldset>`).join('')}</div>`;
      Object.keys(GRUPOS).forEach(muestra);
      pieAjustes(cuerpo, ajustes, pintar);
    };
    // Vista de cómo lo ve el cliente: el mismo control segmentado de la tasadora
    const muestra = (g) => {
      const caja = cuerpo.querySelector(`.adm-grupo[data-g="${g}"] .adm-grupo__muestra`);
      caja.innerHTML = '<div class="pi-seg">' + opcionesVisibles(OPCIONES, ajustes.cfg, g).map(([k, o]) =>
        `<label><input type="radio" tabindex="-1"${GRUPOS_NORMAL.includes(g) && ajustes.cfg.normal[g] === k ? ' checked' : ''}><span><b>${esc(o.rotulo)}</b><small>${esc(g === 'altura' && k === 'personalizada' && !propia(g, k).ayuda ? 'Elige las medidas' : o.ayuda)}</small></span></label>`).join('') + '</div>';
    };
    cuerpo.addEventListener('change', (e) => leer(e.target));
    cuerpo.addEventListener('input', (e) => { if (e.target.type === 'text') leer(e.target); });
    function leer(t) {
      const fila = t.closest('.adm-op'), grupo = t.closest('.adm-grupo');
      if (!fila || !grupo) return;
      const g = grupo.dataset.g, k = fila.dataset.k;
      if (t.type === 'radio') {
        ajustes.cfg.normal[g] = k;
        // El valor del modo Normal siempre tiene que estar a la vista
        const v = fila.querySelector('[data-campo="visible"]');
        if (!v.checked) { v.checked = true; fijar(g, k, 'visible', true); }
      } else {
        let valor = t.type === 'checkbox' ? t.checked : t.value.trim();
        if (t.dataset.campo === 'visible' && !valor) {
          const visibles = grupo.querySelectorAll('[data-campo="visible"]:checked').length;
          if (!visibles || ajustes.cfg.normal[g] === k) { t.checked = true; valor = true; }
        }
        fijar(g, k, t.dataset.campo, valor);
      }
      muestra(g);
      ajustes.cambiar();
    }
    // Solo se guarda lo que cambia respecto al motor
    function fijar(g, k, campo, valor) {
      const o = ajustes.cfg.opciones, base = OPCIONES[g][k];
      o[g] = o[g] || {}; o[g][k] = o[g][k] || {};
      const p = o[g][k];
      if ((campo === 'visible' && valor) || (campo !== 'visible' && (!valor || valor === base[campo]))) delete p[campo]; else p[campo] = valor;
      if (!Object.keys(p).length) delete o[g][k];
      if (!Object.keys(o[g]).length) delete o[g];
    }
    pintar();
  }
};

/* ============================================================
   PASO 2 · Figuras guardadas (STL, STEP o 3MF)
   Se guardan en el Storage de Supabase, en un bucket privado «figuras» (solo
   el panel, con sesión iniciada, puede verlas, subirlas o borrarlas). Para gastar
   poco del plan gratuito, STL y STEP se comprimen en gzip en el navegador (ocupan
   de 3 a 6 veces menos); el 3MF ya viene comprimido y se guarda tal cual.
   El nombre visible va codificado en el propio nombre del archivo:
   <marca de tiempo>_<nombre en base64url>.<ext>[.gz]
   ============================================================ */
const BUCKET = 'figuras';
const MAX_MB = 50;   // límite por archivo del plan gratuito de Supabase
// Configuración única en Supabase (SQL Editor): crea el bucket privado y da permiso a los usuarios con sesión
const SQL_FIGURAS = `insert into storage.buckets (id, name, public) values ('${BUCKET}', '${BUCKET}', false) on conflict (id) do nothing;
create policy "figuras: ver (admin)" on storage.objects for select to authenticated using (bucket_id = '${BUCKET}');
create policy "figuras: subir (admin)" on storage.objects for insert to authenticated with check (bucket_id = '${BUCKET}');
create policy "figuras: borrar (admin)" on storage.objects for delete to authenticated using (bucket_id = '${BUCKET}');`;
const sinConfigurar = (error) => /bucket not found|row-level security|not authorized|unauthorized/i.test((error && error.message) || '');

const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64 = (t) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
function leerRuta(nombreObjeto) {
  const m = /^(\d+)_([A-Za-z0-9_-]+)\.(stl|step|3mf)(\.gz)?$/.exec(nombreObjeto);
  if (!m) return null;
  let nombre;
  try { nombre = deB64(m[2]); } catch { return null; }
  return { fecha: new Date(+m[1]), nombre, ext: m[3], gz: !!m[4] };
}
const flujo = (blob, t) => new Response(blob.stream().pipeThrough(t)).blob();
async function listarFiguras(sb) {
  const { data, error } = await sb.storage.from(BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  if (error) return { error };
  return { figuras: data.map((o) => ({ ...leerRuta(o.name), ruta: o.name, bytes: (o.metadata && o.metadata.size) || 0 })).filter((f) => f.nombre) };
}
async function contarFiguras(ctx) {
  const { figuras } = await listarFiguras(ctx.sb);
  ctx.figuras = figuras ? figuras.length : 0;
  ctx.refrescar();
}

// Cambios pendientes de las figuras guardadas: subidas (ya comprimidas, en memoria) y borrados
function pendientesFiguras(ctx) {
  if (!ctx.figPend) {
    const p = ctx.figPend = { subidas: [], borrados: new Set(), pintar: () => {}, listar: async () => {} };
    ctx.cambios.registrar({
      id: 'figuras',
      nombre: 'las figuras guardadas',
      pendiente: () => p.subidas.length > 0 || p.borrados.size > 0,
      async guardar() {
        for (const f of [...p.subidas]) {
          const ruta = `${f.fecha.getTime()}_${b64(f.nombre)}.${f.ext}${f.gz ? '.gz' : ''}`;
          const { error } = await ctx.sb.storage.from(BUCKET).upload(ruta, f.blob, { contentType: 'application/octet-stream' });
          if (error) throw Object.assign(error, sinConfigurar(error) ? { sql: SQL_FIGURAS } : {});
          p.subidas.splice(p.subidas.indexOf(f), 1);
        }
        if (p.borrados.size) {
          const { data, error } = await ctx.sb.storage.from(BUCKET).remove([...p.borrados]);
          if (error) throw error;
          if (!data || !data.length) throw Object.assign(new Error('Supabase no ha borrado ninguna figura'), { sql: SQL_FIGURAS });
          p.borrados.clear();
        }
        await p.listar();
      },
      descartar() { p.subidas.length = 0; p.borrados.clear(); p.pintar(); }
    });
  }
  return ctx.figPend;
}

const bibliotecaFiguras = {
  id: 'biblioteca-figuras',
  lugar: 'config',
  icono: ICONO.biblioteca,
  titulo: 'Figuras guardadas',
  ayuda: 'Modelos STL, STEP o 3MF guardados para cargarlos en la tasadora cuando quieras. Cada uno se añade en una cama nueva. Las figuras nuevas y las que borres se guardan con «Guardar cambios».',
  resumen: (ctx) => {
    if (ctx.figuras == null) return 'Contando…';
    const p = ctx.figPend, n = ctx.figuras + (p ? p.subidas.length - p.borrados.size : 0);
    return n ? `${n} ${n === 1 ? 'figura' : 'figuras'}` : 'Ninguna todavía';
  },
  pendiente: (ctx) => !!ctx.figPend && (ctx.figPend.subidas.length > 0 || ctx.figPend.borrados.size > 0),
  montar(cuerpo, ctx) {
    const { sb, tasadora } = ctx;
    const pend = pendientesFiguras(ctx);
    cuerpo.innerHTML = `
      <form class="adm-subida">
        <label class="adm-subida__zona">
          <input type="file" name="archivo" accept=".stl,.step,.stp,.3mf" required>
          <span class="adm-subida__icono">${ICONO.subir}</span>
          <span class="adm-subida__titulo" data-titulo>Arrastra un modelo o <u>búscalo</u></span>
          <span class="pista">STL, STEP o 3MF · hasta ${MAX_MB} MB una vez comprimido</span>
        </label>
        <div class="adm-subida__datos">
          <input type="text" name="nombre" placeholder="Nombre (opcional; si no, el del archivo)" aria-label="Nombre de la figura">
          <button type="submit" class="btn">Añadir a las figuras</button>
        </div>
      </form>
      <p class="pista adm-extra__estado" aria-live="polite"></p>
      <div class="adm-biblioteca__aviso oculto"></div>
      <div class="adm-biblioteca__lista"><p class="vacio">Cargando figuras…</p></div>`;
    const form = cuerpo.querySelector('form'), estado = cuerpo.querySelector('.adm-extra__estado');
    const lista = cuerpo.querySelector('.adm-biblioteca__lista'), aviso = cuerpo.querySelector('.adm-biblioteca__aviso');
    const zona = cuerpo.querySelector('.adm-subida__zona'), titulo = cuerpo.querySelector('[data-titulo]');
    let figuras = [];

    form.archivo.addEventListener('change', () => {
      const f = form.archivo.files[0];
      titulo.textContent = f ? f.name + ' · ' + tamano(f.size) : 'Arrastra un modelo o búscalo';
      zona.classList.toggle('lista', !!f);
    });
    ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, () => zona.classList.add('encima')));
    ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove('encima')));

    const avisoPolitica = () => {
      aviso.innerHTML = '<p class="pista">Falta preparar Supabase para guardar figuras (se hace una sola vez). Entra en Supabase → SQL Editor, pega esto y pulsa Run:</p><pre class="adm-sql"></pre>';
      aviso.querySelector('pre').textContent = SQL_FIGURAS;
      aviso.classList.remove('oculto');
    };

    async function listar() {
      const r = await listarFiguras(sb);
      if (r.error) { if (sinConfigurar(r.error)) avisoPolitica(); figuras = []; pintar(); return; }
      aviso.classList.add('oculto');
      figuras = r.figuras;
      ctx.figuras = figuras.length;
      pintar();
    }
    // Guardadas (las marcadas para borrar, tachadas) y nuevas sin guardar, en una sola rejilla
    function pintar() {
      const todas = [...pend.subidas.map((f, k) => ({ ...f, nueva: k })), ...figuras.map((f) => ({ ...f, borrar: pend.borrados.has(f.ruta) }))];
      ctx.refrescar();
      if (!todas.length) { lista.innerHTML = '<p class="vacio">Todavía no hay figuras guardadas.</p>'; return; }
      const total = figuras.reduce((s, f) => s + f.bytes, 0);
      lista.innerHTML = `<p class="pista adm-biblioteca__total">${figuras.length} ${figuras.length === 1 ? 'figura guardada' : 'figuras guardadas'} · ${tamano(total)} en Supabase (el plan gratuito tiene 1 GB en total)</p>
        <ul class="adm-fichas">${todas.map((f, k) => `
          <li class="adm-ficha${f.nueva != null ? ' adm-ficha--nueva' : ''}${f.borrar ? ' adm-ficha--borrar' : ''}">
            ${f.nueva != null ? '<span class="adm-ficha__marca">Sin guardar</span>' : f.borrar ? '<span class="adm-ficha__marca">Se borrará</span>' : ''}
            <span class="adm-ficha__icono">${ICONO.cubo}<b>${f.ext.toUpperCase()}</b></span>
            <strong class="adm-ficha__nombre" title="${esc(f.nombre)}">${esc(f.nombre)}</strong>
            <span class="pista">${tamano(f.bytes)} · ${f.fecha.toLocaleDateString('es-ES')}</span>
            <span class="adm-ficha__botones">
              ${f.borrar ? `<button type="button" class="btn-mini" data-deshacer="${k}">Deshacer</button>`
                : `<button type="button" class="btn adm-ficha__cargar" data-cargar="${k}">Cargar</button>
                   <button type="button" class="btn-borrar" data-borrar="${k}">${f.nueva != null ? 'Quitar' : 'Borrar'}</button>`}
            </span>
          </li>`).join('')}
        </ul>`;
      lista.todas = todas;
    }
    pend.pintar = pintar;
    pend.listar = listar;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = form.archivo.files[0];
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase().replace('stp', 'step');
      if (!['stl', 'step', '3mf'].includes(ext)) { estado.textContent = 'Formato no admitido: STL, STEP o 3MF.'; return; }
      const nombre = form.nombre.value.trim() || file.name.replace(/\.[^.]+$/, '');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const gz = ext !== '3mf' && typeof CompressionStream === 'function';
        if (gz) estado.textContent = 'Comprimiendo…';
        const blob = gz ? await flujo(file, new CompressionStream('gzip')) : file;
        if (blob.size > MAX_MB * 1024 * 1024) throw new Error('Ocupa ' + tamano(blob.size) + ' y el límite por archivo es de ' + MAX_MB + ' MB');
        pend.subidas.push({ nombre, ext, gz, blob, bytes: blob.size, fecha: new Date() });
        form.reset(); form.archivo.dispatchEvent(new Event('change'));
        estado.textContent = '«' + nombre + '» añadida. Se guardará con «Guardar cambios».';
        pintar();
      } catch (err) {
        estado.textContent = 'No se pudo añadir: ' + err.message;
      } finally { btn.disabled = false; }
    });

    lista.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cargar], [data-borrar], [data-deshacer]');
      if (!b) return;
      const f = lista.todas[+(b.dataset.cargar ?? b.dataset.borrar ?? b.dataset.deshacer)];
      if (b.dataset.deshacer != null) { pend.borrados.delete(f.ruta); pintar(); return; }
      if (b.dataset.borrar != null) {
        if (f.nueva != null) pend.subidas.splice(f.nueva, 1); else pend.borrados.add(f.ruta);
        pintar();
        return;
      }
      // Cargar en la tasadora (no es un cambio): de la memoria si aún no está guardada, si no de Supabase
      b.disabled = true;
      estado.textContent = 'Cargando «' + f.nombre + '»…';
      try {
        let blob = f.blob;
        if (!blob) {
          const { data, error } = await sb.storage.from(BUCKET).download(f.ruta);
          if (error) throw error;
          blob = data;
        }
        if (f.gz) blob = await flujo(blob, new DecompressionStream('gzip'));
        const archivo = new File([blob], nombreLibre(f.nombre, f.ext, tasadora), { type: 'application/octet-stream' });
        estado.textContent = '';
        await tasadora.cargar([archivo], true);
        document.getElementById('piVisor').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        estado.textContent = 'No se pudo cargar: ' + err.message;
      } finally { b.disabled = false; }
    });

    listar();
  }
};

/* ============================================================
   PASO 2 · Vinculación con 3DCalc (js/admin-vinculacion.js, sin cambios)
   Su formulario guarda con upsert en config_tasadora; aquí se le da un cliente de Supabase
   que, en esa tabla, solo apunta el cambio como pendiente. Se aplica con «Guardar cambios».
   ============================================================ */
const vinculacion = {
  ...vinculacion3dcalc,
  lugar: 'config',
  icono: ICONO.vinculo,
  resumen: ({ vinculacion: v }) => (v && v.precio_activo === false ? 'Sin precio al momento' : 'Precio al momento') + ' · ' + ((v && v.empresa) || 'SILAB3D'),
  pendiente: (ctx) => vinculacionPendiente(ctx),
  montar(cuerpo, ctx) {
    const pend = ctx.vincPend || (ctx.vincPend = { fila: null });
    ctx.cambios.registrar({
      id: 'vinculacion',
      nombre: 'la vinculación con 3DCalc',
      pendiente: () => vinculacionPendiente(ctx),
      async guardar() {
        const { error } = await ctx.sb.from('config_tasadora').upsert(pend.fila);
        if (error) throw error;
        ctx.vinculacion = pend.fila.valor;
        pend.fila = null;
      },
      descartar() { pend.fila = null; ctx.remontar('vinculacion-3dcalc'); }
    });
    const sbPendiente = new Proxy(ctx.sb, {
      get(o, k) {
        if (k !== 'from') { const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; }
        return (tabla) => {
          const q = o.from(tabla);
          if (tabla !== 'config_tasadora') return q;
          return new Proxy(q, {
            get(qq, kk) {
              if (kk === 'upsert') return (fila) => { pend.fila = fila; ctx.refrescar(); return Promise.resolve({ data: null, error: null }); };
              const v = qq[kk]; return typeof v === 'function' ? v.bind(qq) : v;
            }
          });
        };
      }
    });
    vinculacion3dcalc.montar(cuerpo, { ...ctx, sb: sbPendiente });
    // Cada cambio se apunta al momento (su botón de guardar se oculta; el guardado es el común de la pestaña)
    let t = null;
    const apuntar = () => { clearTimeout(t); t = setTimeout(() => { const f = cuerpo.querySelector('form.adm-vinc'); if (f) f.requestSubmit(); }, 250); };
    cuerpo.addEventListener('input', apuntar);
    cuerpo.addEventListener('change', apuntar);
    cuerpo.addEventListener('click', (e) => { if (e.target.closest('[data-defecto]')) apuntar(); });
    // Sus mensajes «Guardando…» / «Guardado.» no aplican aquí
    new MutationObserver(() => {
      const est = cuerpo.querySelector('.adm-extra__estado');
      if (est && /^(Guardando…|Guardado\.)$/.test(est.textContent)) est.textContent = '';
    }).observe(cuerpo, { childList: true, subtree: true, characterData: true });
  }
};
function vinculacionPendiente(ctx) {
  const p = ctx.vincPend;
  if (!p || !p.fila) return false;
  return JSON.stringify(p.fila.valor) !== JSON.stringify(mezclar(DEFECTO_VINC, ctx.vinculacion || {}));
}

// Funciones extra de la tasadora del panel, en el orden en que se muestran
const EXTRAS = [figurasBasicas, limites, opcionesCliente, bibliotecaFiguras, vinculacion];
