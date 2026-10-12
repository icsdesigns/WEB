/* ============================================================
   SILAB 3D · Panel admin › Visualizador
   Opciones del visualizador 3D de la web (/visualizador/):
   1. Se sube un 3MF y se eligen sus camas (placas); cada cama es una
      opción con su nombre. Se conservan los colores del proyecto.
   2. Cada opción se convierte aquí, en el navegador, a un .s3dv
      (js/visualizador-formato.js) mucho más ligero que el 3MF.
   3. Cada opción lleva sus intervalos de precio (desde N unidades, X € por
      unidad). La web las llama Opción A, B… y sus colores Color A, B…
   4. Nada se publica al momento: «Guardar cambios» pide la contraseña,
      sube los archivos al bucket «visualizador» y guarda la tabla.
   Tabla y almacenamiento: supabase/visualizador.sql.
   abrir({ sb, raiz }) lo llama admin/index.html al abrir la pestaña.
   ============================================================ */
import { abrir3MF } from './visualizador-3mf.js';
import { codificar, decodificar, comoDecodificada } from './visualizador-formato.js';
import { montarVisualizador, letra, tramos } from './visualizador.js';

const BUCKET = 'visualizador';
const AVISO_KB = 4096; // aviso a partir de 4 MB por opción
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kb = (n) => (n >= 1024 ? (n / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.round(n) + ' KB');
const svg = (p) => '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const ICONO = {
  subir: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  candado: svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  ojo: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  arriba: svg('<path d="m6 15 6-6 6 6"/>'),
  abajo: svg('<path d="m6 9 6 6 6-6"/>'),
  papelera: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>'),
  cerrar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  copiar: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  guardar: svg('<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M8 3.5V8h7V3.5M7.5 20.5v-6h9v6"/>')
};
const SQL_AVISO = '<div class="aviso-sql"><p><strong>Falta preparar el visualizador en Supabase.</strong> En Supabase › SQL Editor ejecuta una vez el archivo <code>supabase/visualizador.sql</code> de la carpeta de la web y vuelve a abrir esta pestaña.</p></div>';
const faltaTabla = (e) => /does not exist|PGRST205|schema cache|relation/i.test(((e && e.message) || '') + ((e && e.code) || ''));

let estado = null;

export function abrir(ctx) {
  if (!estado) estado = iniciar(ctx);
  estado.mostrar();
}

function iniciar({ sb, raiz }) {
  let opciones = [];   // { id, nombre, material, modelo, miniatura, colores, origen, kb, visible, nueva?, archivos?, malla? }
  let originales = '';  // copia de lo guardado, para saber si hay cambios
  const borradas = [];  // filas guardadas que se quitan al guardar
  let proyecto = null;  // 3MF abierto: { nombre, p (abrir3MF), camas: [{ n, usar, nombre, url }] }
  let vista = null, vistaId = null, paleta = null, sinTabla = false;
  let grupos = [];       // visualizadores: { slug, nombre, producto, visible, nuevo? }  («general» siempre existe: /visualizador/)
  let grupoActual = 'general', sinGrupos = false, productos = [], gruposOriginales = '';
  let grupoExtra = [];
  const ORIGEN = location.origin;

  raiz.innerHTML = `
    <div class="panel" data-panel-grupos>
      <h2>Dirección y producto <span class="pista">· el visualizador tiene una única dirección y puede vincularse al botón «Solicitar» de un producto</span></h2>
      <div data-grupos></div>
    </div>
    <div class="panel">
      <h2>Añadir modelos desde un 3MF <span class="pista">· cada cama que elijas será una opción del visualizador</span></h2>
      <label class="gal-zona" data-zona>
        <input type="file" accept=".3mf,model/3mf" data-archivo>
        ${ICONO.subir}
        <strong>Arrastra aquí el 3MF o pulsa para elegirlo</strong>
        <span class="pista">Proyectos de Bambu Studio, Orca o PrusaSlicer. Se conservan los colores de cada pieza y la pintura multicolor.</span>
      </label>
      <div data-camas></div>
    </div>
    <div class="panel">
      <h2>Opciones del visualizador <span class="pista" data-cuenta></span></h2>
      <div data-lista><p class="vacio">Cargando…</p></div>
    </div>
    <div class="panel">
      <h2>Vista previa <span class="pista">· así lo verán tus clientes en <a href="/visualizador/" target="_blank" rel="noopener">/visualizador/</a></span></h2>
      <div data-vista><p class="vacio">Añade una opción para verla aquí.</p></div>
    </div>`;
  const q = (s) => raiz.querySelector(s);

  /* ---------- 0. Un solo visualizador: dirección y producto vinculado ---------- */
  // Todas las opciones son de este visualizador. El producto vinculado se guarda en la fila «general» de visualizador_grupos.
  const delGrupo = () => opciones;
  const baseUrl = ORIGEN + location.pathname.replace(/admin\/?(index\.html)?$/, '');
  const URL_PUBLICA = baseUrl + 'llaveros-logo/';
  const grupoSel = () => grupos.find((g) => g.slug === 'general') || grupos[0];
  const firmaGrupos = () => JSON.stringify([grupoSel() && (grupoSel().producto || null)]);
  const hayCambiosGrupos = () => firmaGrupos() !== gruposOriginales;

  function pintarGrupos() {
    const caja = q('[data-grupos]');
    const g = grupoSel();
    caja.innerHTML = `
      <div class="avis-grupo-ficha">
        <label class="avis-campo-et"><span>Producto vinculado <i>(su botón «Solicitar» abrirá el visualizador)</i></span>
          <select data-g="producto" ${sinGrupos ? 'disabled' : ''}>
            <option value="">Ninguno</option>
            ${productos.map((nom) => `<option ${g.producto === nom ? 'selected' : ''}>${esc(nom)}</option>`).join('')}
            ${g.producto && !productos.includes(g.producto) ? `<option selected>${esc(g.producto)}</option>` : ''}
          </select>
          ${sinGrupos ? '<span class="pista">Para vincular un producto ejecuta de nuevo <code>supabase/visualizador.sql</code> (bloque 3).</span>' : ''}</label>
        <div class="avis-campo-et avis-grupo-url"><span>Dirección para compartir</span>
          <div class="avis-url"><code>${esc(URL_PUBLICA.replace(/^https?:\/\//, ''))}</code>
            <button type="button" class="avis-boton avis-boton--suave" data-copiar-url>${ICONO.copiar}<span>Copiar</span></button>
            <a class="avis-boton avis-boton--suave" href="${esc(URL_PUBLICA)}" target="_blank" rel="noopener">Abrir</a></div></div>
      </div>`;
  }
  q('[data-grupos]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-copiar-url]');
    if (!b) return;
    const txt = b.querySelector('span');
    (navigator.clipboard ? navigator.clipboard.writeText(URL_PUBLICA) : Promise.reject()).then(() => { txt.textContent = 'Copiada'; setTimeout(() => { txt.textContent = 'Copiar'; }, 1600); }, () => prompt('Copia la dirección:', URL_PUBLICA));
  });
  q('[data-grupos]').addEventListener('change', (e) => {
    if (e.target.dataset.g === 'producto') { grupoSel().producto = e.target.value || null; pintarBarra(); }
  });

  /* ---------- 1. Leer el 3MF ---------- */
  const zona = q('[data-zona]'), entrada = q('[data-archivo]');
  entrada.addEventListener('change', () => { if (entrada.files[0]) leer(entrada.files[0]); entrada.value = ''; });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('is-encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('is-encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('is-encima'); const f = e.dataTransfer.files[0]; if (f) leer(f); });

  async function leer(file) {
    const camas = q('[data-camas]');
    if (!/\.3mf$/i.test(file.name)) { camas.innerHTML = '<p class="vacio">Solo se admiten archivos .3mf.</p>'; return; }
    camas.innerHTML = '<p class="vacio">Leyendo «' + esc(file.name) + '»…</p>';
    await new Promise((ok) => setTimeout(ok, 30));
    try {
      const fflate = await import('three/addons/libs/fflate.module.js');
      const p = abrir3MF(new Uint8Array(await file.arrayBuffer()), fflate);
      const base = file.name.replace(/\.3mf$/i, '');
      proyecto = {
        nombre: file.name, p,
        camas: p.placas.map((c) => ({
          n: c.n, usar: false, nombre: c.nombre || base + ' · cama ' + c.n,
          url: c.miniatura ? URL.createObjectURL(new Blob([c.miniatura], { type: 'image/png' })) : null
        }))
      };
      if (proyecto.camas.length === 1) proyecto.camas[0].usar = true;
      pintarCamas();
    } catch (err) {
      camas.innerHTML = '<p class="vacio">No se pudo leer el 3MF: ' + esc(err.message) + '</p>';
    }
  }

  function pintarCamas() {
    const camas = q('[data-camas]');
    if (!proyecto) { camas.innerHTML = ''; return; }
    const { p } = proyecto;
    const elegidas = proyecto.camas.filter((c) => c.usar).length;
    camas.innerHTML = `
      <p class="pista avis-pie">«${esc(proyecto.nombre)}» · ${p.placas.length} ${p.placas.length === 1 ? 'cama' : 'camas'} · filamentos:
        ${p.filamentos.map((f) => `<span class="swatch" style="background:${esc(f.hex)}" title="${esc(f.perfil || f.tipo)}"></span>${f.slot}`).join(' ')}</p>
      <div class="avis-camas">${proyecto.camas.map((c, i) => {
        const info = p.placas[i];
        return `<label class="avis-cama${c.usar ? ' is-elegida' : ''}">
          <span class="avis-cama__cab"><input type="checkbox" data-usar="${i}" ${c.usar ? 'checked' : ''}> Cama ${c.n}</span>
          ${c.url ? `<img src="${c.url}" alt="Cama ${c.n}" width="160" height="160">` : '<span class="mini-vacia avis-cama__vacia">3D</span>'}
          <span class="pista">${info.piezas} ${info.piezas === 1 ? 'pieza' : 'piezas'} · ${info.filamentos.map((s) => `<span class="swatch" style="background:${esc(p.filamento(s).hex)}"></span>`).join('')}</span>
          <input type="text" data-nombre="${i}" value="${esc(c.nombre)}" aria-label="Nombre de la opción" placeholder="Nombre de la opción">
        </label>`;
      }).join('')}</div>
      <div class="gal-cola__acciones">
        <button type="button" class="btn" data-anadir ${elegidas ? '' : 'disabled'}>Añadir ${elegidas || ''} ${elegidas === 1 ? 'opción' : 'opciones'}</button>
        <button type="button" class="btn btn-cancelar" data-cancelar>Cancelar</button>
      </div>`;
  }
  q('[data-camas]').addEventListener('change', (e) => {
    const u = e.target.closest('[data-usar]');
    if (u) { proyecto.camas[+u.dataset.usar].usar = u.checked; pintarCamas(); }
  });
  q('[data-camas]').addEventListener('input', (e) => {
    const n = e.target.closest('[data-nombre]');
    if (n) proyecto.camas[+n.dataset.nombre].nombre = n.value;
  });
  q('[data-camas]').addEventListener('click', async (e) => {
    if (e.target.closest('[data-cancelar]')) { proyecto = null; pintarCamas(); return; }
    const b = e.target.closest('[data-anadir]');
    if (!b) return;
    b.disabled = true; b.textContent = 'Preparando…';
    await new Promise((ok) => setTimeout(ok, 30));
    const { p } = proyecto;
    let primera = null;
    try {
      for (const c of proyecto.camas.filter((x) => x.usar)) {
        const malla = p.construir(c.n);
        const datos = await codificar(malla);
        const info = p.placas.find((x) => x.n === c.n);
        const id = crypto.randomUUID();
        const tri = malla.slots.reduce((s, x) => s + x.idx.length / 3, 0);
        opciones.push({
          id, nueva: true, grupo: grupoActual, nombre: (c.nombre || '').trim() || 'Cama ' + c.n,
          material: /petg/i.test(p.filamento(malla.slots[0].slot).tipo) ? 'PETG' : 'PLA',
          modelo: null, miniatura: c.url,
          colores: malla.slots.map((s, n) => ({ slot: s.slot, nombre: 'Color ' + letra(n), hex: s.hex })),
          precios: delGrupo().length ? delGrupo()[0].precios.map((t) => ({ ...t })) : [],
          origen: { archivo: proyecto.nombre, cama: c.n, triangulos: tri },
          kb: Math.round(datos.length / 1024), visible: true,
          archivos: { modelo: datos, miniatura: info.miniatura }, malla: comoDecodificada(malla)
        });
        if (!primera) primera = id;
      }
      proyecto = null;
      pintarCamas();
      vistaId = primera;
      pintarLista();
    } catch (err) {
      b.disabled = false; b.textContent = 'Añadir';
      alert('No se pudo preparar la cama: ' + err.message);
    }
  });

  /* ---------- 2. Opciones (guardadas y nuevas) ---------- */
  async function cargar() {
    const r = await sb.from('visualizador').select('*').order('orden', { ascending: true }).order('creado', { ascending: true });
    if (r.error) {
      sinTabla = faltaTabla(r.error);
      q('[data-lista]').innerHTML = sinTabla ? SQL_AVISO : '<p class="vacio">Error: ' + esc(r.error.message) + '</p>';
      return;
    }
    const rg = await sb.from('visualizador_grupos').select('*').order('orden', { ascending: true }).order('creado', { ascending: true });
    sinGrupos = !!rg.error;
    grupos = sinGrupos ? [] : (rg.data || []).map((g) => ({ slug: g.slug, nombre: g.nombre, producto: g.producto || null, visible: g.visible !== false }));
    grupoExtra = grupos.filter((g) => g.slug !== 'general');   // grupos de pruebas anteriores: se limpian al guardar
    if (!grupos.some((g) => g.slug === 'general')) grupos.unshift({ slug: 'general', nombre: 'Visualizador general', producto: null, visible: true });
    const general = grupos.find((g) => g.slug === 'general');
    if (!general.producto) { const c = grupoExtra.find((g) => g.producto); if (c) general.producto = c.producto; }
    try { const rp = await sb.from('productos').select('nombre').order('nombre', { ascending: true }); productos = rp.error ? [] : (rp.data || []).map((x) => x.nombre).filter(Boolean); } catch (e) { productos = []; }
    opciones = (r.data || []).map((f) => ({ ...f, grupo: f.grupo || 'general', colores: Array.isArray(f.colores) ? f.colores : [], precios: Array.isArray(f.precios) ? f.precios : [] }));
    originales = firma(); gruposOriginales = firmaGrupos();
    pintarGrupos();
    pintarLista();
  }
  const firma = () => JSON.stringify(opciones.filter((o) => !o.nueva).map((o) => [o.id, o.nombre, o.material, o.colores, o.visible, o.precios, o.grupo]));
  const hayCambios = () => hayCambiosGrupos() || borradas.length > 0 || opciones.some((o) => o.nueva) || firma() !== originales ||
    opciones.filter((o) => !o.nueva).some((o, i) => o.orden !== i);

  function pintarLista() {
    const lista = q('[data-lista]');
    const total = opciones.reduce((s, o) => s + (o.kb || 0), 0);
    const lote = delGrupo(), tit = grupoSel() ? grupoSel().nombre : '';
    q('[data-cuenta]').textContent = opciones.length ? '· «' + tit + '»: ' + lote.length + (lote.length === 1 ? ' opción' : ' opciones') + ' · ' + kb(total) + ' en Supabase Storage (plan gratis: 1 GB)' : '';
    if (sinTabla && !opciones.length) { lista.innerHTML = SQL_AVISO; pintarBarra(); pintarVista(); return; }
    if (!lote.length) { lista.innerHTML = '<p class="vacio">Este visualizador aún no tiene opciones. Sube un 3MF arriba y elige sus camas.</p>'; pintarBarra(); pintarVista(); return; }
    lista.innerHTML = (sinTabla ? SQL_AVISO : '') + '<div class="avis-lista">' + lote.map((o, i) => `
      <article class="avis-op${o.nueva ? ' adm-ficha--nueva' : ''}${o.visible ? '' : ' is-oculta'}${o.id === vistaId ? ' is-vista' : ''}" data-i="${opciones.indexOf(o)}">
        <header class="avis-op__cab">
          ${o.miniatura ? `<img class="avis-op__img" src="${esc(o.miniatura)}" alt="" width="64" height="64">` : '<span class="mini-vacia avis-op__img">3D</span>'}
          <div class="avis-op__ident">
            <span class="avis-op__letra" title="Así se llama en la web">Opción ${letra(i)}${o.nueva ? ' <b class="avis-op__marca">Nueva</b>' : ''}</span>
            <div class="avis-op__fila">
              <input type="text" data-campo="nombre" value="${esc(o.nombre)}" aria-label="Nombre interno de la opción (solo lo ves tú)" placeholder="Nombre interno (solo lo ves tú)">
              <select data-campo="material" aria-label="Paleta de colores"><option ${o.material === 'PLA' ? 'selected' : ''}>PLA</option><option ${o.material === 'PETG' ? 'selected' : ''}>PETG</option></select>
            </div>
          </div>
          <div class="avis-op__herr">
            <label class="avis-op__visible" title="${o.visible ? 'Se muestra en la web' : 'Oculta en la web'}"><span class="adm-interruptor"><input type="checkbox" data-campo="visible" ${o.visible ? 'checked' : ''} aria-label="Visible en la web"><span aria-hidden="true"></span></span>Visible</label>
            <span class="avis-op__iconos">
              <button type="button" class="avis-ico" data-ver title="Ver en la vista previa" aria-label="Ver en la vista previa">${ICONO.ojo}</button>
              <button type="button" class="avis-ico" data-mover="-1" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">${ICONO.arriba}</button>
              <button type="button" class="avis-ico" data-mover="1" ${i === lote.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar">${ICONO.abajo}</button>
              <button type="button" class="avis-ico avis-ico--peligro" data-borrar title="Quitar opción" aria-label="Quitar opción">${ICONO.papelera}</button>
            </span>
          </div>
        </header>
        <div class="avis-op__cuerpo">
          <section class="avis-op__bloque">
            <h4 class="avis-op__tit">Colores</h4>
            <ul class="avis-op__colores">${o.colores.map((c, j) => `
              <li class="avis-op__color"><span class="swatch" style="background:${esc(c.hex)}" title="Color del 3MF ${esc(c.hex)}"></span><b>Color ${letra(j)}</b><span class="avis-op__hex">${esc(c.hex)}</span></li>`).join('')}
            </ul>
          </section>
          <section class="avis-op__bloque avis-precios">
            <h4 class="avis-op__tit">Precio por cantidad <span class="pista">cada tramo vale desde las unidades indicadas</span></h4>
            ${o.precios.length ? `<div class="avis-precios__tabla">
              <span class="avis-precios__th">Desde</span><span class="avis-precios__th">Precio / ud.</span><span></span>
              ${o.precios.map((t, k) => `
              <span class="avis-campo"><input type="number" min="1" step="1" inputmode="numeric" data-tramo="${k}" data-c="desde" value="${esc(t.desde)}" aria-label="Unidades mínimas del tramo ${k + 1}"><i>uds.</i></span>
              <span class="avis-campo"><input type="number" min="0" step="0.01" inputmode="decimal" data-tramo="${k}" data-c="unidad" value="${esc(t.unidad)}" placeholder="0,00" aria-label="Precio por unidad del tramo ${k + 1}"><i>€</i></span>
              <button type="button" class="avis-ico avis-ico--peligro" data-quitar-tramo="${k}" title="Quitar tramo" aria-label="Quitar tramo ${k + 1}">${ICONO.cerrar}</button>`).join('')}
            </div>` : '<p class="avis-precios__vacio">Sin tramos: la web muestra «Precio a consultar».</p>'}
            <div class="avis-precios__acciones">
              <button type="button" class="avis-boton" data-nuevo-tramo>${ICONO.mas}Añadir tramo</button>
              ${lote.length > 1 && o.precios.length ? `<button type="button" class="avis-boton avis-boton--suave" data-copiar-precios>${ICONO.copiar}Copiar a las demás opciones</button>` : ''}
            </div>
          </section>
        </div>
        <footer class="avis-op__pie">${o.origen ? esc(o.origen.archivo) + ' · cama ' + esc(o.origen.cama) + ' · ' : ''}${o.kb ? kb(o.kb) : ''}${o.kb > AVISO_KB ? ' · <b>pesada: tardará en cargar en móviles</b>' : ''}</footer>
      </article>`).join('') + '</div>';
    pintarBarra();
    pintarVista();
  }

  const lista = q('[data-lista]');
  lista.addEventListener('input', (e) => {
    const fila = e.target.closest('[data-i]');
    if (!fila) return;
    const o = opciones[+fila.dataset.i];
    if (e.target.dataset.campo === 'nombre') o.nombre = e.target.value;
    if (e.target.dataset.tramo !== undefined) {
      const t = o.precios[+e.target.dataset.tramo];
      t[e.target.dataset.c] = e.target.value === '' ? '' : +e.target.value;
    }
    pintarBarra();
    refrescarVista();
  });
  lista.addEventListener('change', (e) => {
    const fila = e.target.closest('[data-i]');
    if (!fila) return;
    const o = opciones[+fila.dataset.i];
    if (e.target.dataset.campo === 'material') o.material = e.target.value;
    if (e.target.dataset.campo === 'visible') { o.visible = e.target.checked; fila.classList.toggle('is-oculta', !o.visible); pintarBarra(); pintarVista(); return; }
    if (e.target.dataset.tramo !== undefined) { ordenarTramos(o); pintarLista(); return; }
    pintarBarra();
    refrescarVista();
  });
  lista.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-i]');
    if (!fila) return;
    const i = +fila.dataset.i, o = opciones[i];
    if (e.target.closest('[data-nuevo-tramo]')) {
      const u = tramos(o);
      o.precios.push({ desde: u.length ? u[u.length - 1].desde + 10 : 1, unidad: u.length ? u[u.length - 1].unidad : '' });
      pintarLista(); return;
    }
    const qt = e.target.closest('[data-quitar-tramo]');
    if (qt) { o.precios.splice(+qt.dataset.quitarTramo, 1); pintarLista(); return; }
    if (e.target.closest('[data-copiar-precios]')) {
      if (!confirm('¿Copiar estos precios a las demás opciones de este visualizador? Se sustituyen los que tengan.')) return;
      delGrupo(o.grupo).forEach((x) => { if (x !== o) x.precios = o.precios.map((t) => ({ ...t })); });
      pintarLista(); return;
    }
    if (e.target.closest('[data-ver]')) { vistaId = o.id; pintarLista(); q('[data-vista]').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const m = e.target.closest('[data-mover]');
    if (m) {
      const lote = delGrupo(o.grupo), k = lote.indexOf(o) + +m.dataset.mover, otro = lote[k];
      if (otro) { const j = opciones.indexOf(otro); [opciones[i], opciones[j]] = [opciones[j], opciones[i]]; pintarLista(); }
      return;
    }
    if (e.target.closest('[data-borrar]')) {
      if (!confirm('¿Quitar «' + o.nombre + '» del visualizador? Se borra al guardar los cambios.')) return;
      opciones.splice(i, 1);
      if (!o.nueva) borradas.push(o);
      if (vistaId === o.id) vistaId = null;
      pintarLista();
    }
  });

  const ordenarTramos = (o) => { o.precios.sort((a, b) => (+a.desde || 0) - (+b.desde || 0)); };

  /* ---------- 3. Vista previa: el mismo componente que la web ---------- */
  const mallas = new Map();
  function cargarMalla(o) {
    if (o.malla) return Promise.resolve(o.malla);
    if (!mallas.has(o.id)) mallas.set(o.id, fetch(o.modelo).then((r) => { if (!r.ok) throw new Error('No se pudo descargar el modelo (' + r.status + ')'); return r.arrayBuffer(); }).then(decodificar));
    return mallas.get(o.id);
  }
  let espera = null;
  // Cambiar precios o la paleta no recarga el modelo: la vista previa lee las mismas opciones y solo se repinta el panel
  const refrescarVista = () => { clearTimeout(espera); espera = setTimeout(() => { if (vista) vista.refrescar(); else pintarVista(); }, 250); };
  async function pintarVista() {
    const caja = q('[data-vista]');
    const visibles = delGrupo().filter((o) => o.visible);
    if (vista) { vista.destruir(); vista = null; }
    if (!visibles.length) { caja.className = ''; caja.innerHTML = '<p class="vacio">' + (delGrupo().length ? 'Ninguna opción está visible.' : 'Añade una opción para verla aquí.') + '</p>'; return; }
    if (!paleta) paleta = await cargarPaleta();
    caja.innerHTML = '';
    vista = montarVisualizador(caja, {
      opciones: visibles,
      paleta,
      inicial: visibles.some((o) => o.id === vistaId) ? vistaId : visibles[0].id,
      cargar: (op) => cargarMalla(opciones.find((o) => o.id === op.id) || op),
      alElegir: (op) => { vistaId = op.id; raiz.querySelectorAll('.avis-op').forEach((f) => f.classList.toggle('is-vista', opciones[+f.dataset.i] && opciones[+f.dataset.i].id === op.id)); }
    });
  }
  function cargarPaleta() {
    const listo = () => (window.SILAB_FILAMENTOS ? window.SILAB_FILAMENTOS.load().catch(() => ({})) : Promise.resolve({}));
    if (window.SILAB_FILAMENTOS) return listo();
    return new Promise((ok) => {
      const s = document.createElement('script');
      s.src = '/js/filamentos.js';
      s.onload = () => ok(listo()); s.onerror = () => ok({});
      document.head.appendChild(s);
    });
  }

  /* ---------- Guardar con contraseña ---------- */
  const barra = document.createElement('div');
  barra.className = 'adm-guardar';
  barra.hidden = true;
  barra.setAttribute('role', 'region');
  barra.setAttribute('aria-label', 'Cambios sin guardar');
  barra.innerHTML = `
    <span class="adm-guardar__icono">${ICONO.guardar}</span>
    <p class="adm-guardar__texto" aria-live="polite"><b>Cambios sin guardar</b> en el visualizador. Tus clientes no los verán hasta que los guardes.</p>
    <div class="adm-guardar__botones">
      <button type="button" class="btn btn-cancelar" data-descartar>Descartar</button>
      <button type="button" class="btn" data-guardar>Guardar cambios</button>
    </div>`;
  raiz.appendChild(barra);
  function pintarBarra() { barra.hidden = !hayCambios(); }
  barra.querySelector('[data-descartar]').addEventListener('click', () => {
    if (!confirm('¿Descartar los cambios sin guardar del visualizador?')) return;
    borradas.length = 0; vistaId = null; cargar();
  });
  window.addEventListener('beforeunload', (e) => { if (hayCambios()) { e.preventDefault(); e.returnValue = ''; } });

  const dialogo = document.createElement('dialog');
  dialogo.className = 'adm-dialogo';
  dialogo.innerHTML = `
    <form class="adm-dialogo__caja">
      <span class="adm-dialogo__icono">${ICONO.candado}</span>
      <h3>Guardar el visualizador</h3>
      <p class="pista">Se publican las opciones y sus colores en la web. Para confirmarlo, escribe tu contraseña.</p>
      <label class="adm-dialogo__campo"><span>Contraseña del administrador</span>
        <input type="password" name="clave" autocomplete="current-password" required></label>
      <p class="adm-dialogo__error" role="alert" hidden></p>
      <div class="adm-dialogo__botones">
        <button type="submit" class="btn" data-confirmar>Guardar cambios</button>
        <button type="button" class="btn btn-cancelar" data-volver>Seguir editando</button>
      </div>
    </form>`;
  document.body.appendChild(dialogo);
  const form = dialogo.querySelector('form'), errorEl = dialogo.querySelector('.adm-dialogo__error');
  const fallo = (html) => { errorEl.innerHTML = html; errorEl.hidden = false; };
  barra.querySelector('[data-guardar]').addEventListener('click', () => { form.reset(); errorEl.hidden = true; dialogo.showModal(); form.clave.focus(); });
  dialogo.querySelector('[data-volver]').addEventListener('click', () => dialogo.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = dialogo.querySelector('[data-confirmar]');
    boton.disabled = true; errorEl.hidden = true;
    try {
      const { data } = await sb.auth.getUser();
      const email = data && data.user && data.user.email;
      if (!email) return fallo('La sesión ha caducado. Vuelve a entrar en el panel.');
      const { error } = await sb.auth.signInWithPassword({ email, password: form.clave.value });
      if (error) return fallo('La contraseña no es correcta.');
      boton.textContent = 'Guardando…';
      await guardar((t) => { boton.textContent = t; });
      dialogo.close();
      await cargar();
    } catch (err) {
      fallo('No se pudo guardar: ' + esc(err.message || err) + '.' + (faltaTabla(err) || /bucket/i.test(err.message || '') ? '<br>Ejecuta antes <code>supabase/visualizador.sql</code> en Supabase › SQL Editor.' : ''));
    } finally { boton.disabled = false; boton.textContent = 'Guardar cambios'; }
  });

  const rutaDe = (url) => { const m = /\/object\/public\/visualizador\/(.+)$/.exec(url || ''); return m ? decodeURIComponent(m[1]) : null; };
  const paso = (donde, e) => { const x = new Error((e && e.message) + ' [' + donde + ']'); x.code = e && e.code; return x; };
  async function guardar(progreso) {
    for (const [i, o] of opciones.entries()) { // los precios se revisan antes de subir nada
      const nom = 'Opción ' + letra(i) + (o.nombre ? ' (' + o.nombre + ')' : '');
      if (o.precios.some((t) => !(+t.desde >= 1) || t.unidad === '' || !(+t.unidad >= 0))) throw new Error('Revisa los precios de ' + nom + ': cada tramo necesita unidades (1 o más) y un precio.');
      if (new Set(o.precios.map((t) => Math.floor(+t.desde))).size !== o.precios.length) throw new Error('Los precios de ' + nom + ' tienen dos tramos que empiezan en las mismas unidades.');
    }
    const st = sb.storage.from(BUCKET);
    const nuevas = opciones.filter((o) => o.nueva);
    for (let k = 0; k < nuevas.length; k++) {
      const o = nuevas[k];
      progreso('Subiendo ' + (k + 1) + ' de ' + nuevas.length + '…');
      const base = o.id;
      const r1 = await st.upload(base + '.s3dv', new Blob([o.archivos.modelo], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream', cacheControl: '31536000', upsert: false });
      if (r1.error) throw paso('al subir el modelo', r1.error);
      o.modelo = st.getPublicUrl(base + '.s3dv').data.publicUrl;
      if (o.archivos.miniatura) {
        const r2 = await st.upload(base + '.png', new Blob([o.archivos.miniatura], { type: 'image/png' }), { contentType: 'image/png', cacheControl: '31536000', upsert: false });
        if (r2.error) throw paso('al subir la miniatura', r2.error);
        o.miniatura = st.getPublicUrl(base + '.png').data.publicUrl;
      } else o.miniatura = null;
    }
    progreso('Guardando…');
    if (!sinGrupos) {
      const g = grupoSel();
      const rg = await sb.from('visualizador_grupos').upsert([{ slug: 'general', nombre: g.nombre || 'Visualizador general', producto: g.producto || null, visible: true, orden: 0 }]);
      if (rg.error) throw paso('al guardar el producto vinculado (tabla visualizador_grupos)', rg.error);
    }
    const filas = opciones.map((o, i) => ({
      id: o.id, grupo: sinGrupos ? undefined : 'general', nombre: (o.nombre || '').trim() || 'Opción ' + (i + 1), material: o.material, modelo: o.modelo, miniatura: o.miniatura,
      colores: o.colores.map((c, n) => ({ slot: c.slot, nombre: 'Color ' + letra(n), hex: c.hex })),
      precios: tramos(o).map((t) => ({ desde: t.desde, unidad: t.unidad })),
      origen: o.origen || null, kb: o.kb || null, orden: i, visible: !!o.visible
    }));
    if (filas.length) { const r = await sb.from('visualizador').upsert(filas); if (r.error) throw paso('al guardar las opciones (tabla visualizador)', r.error); }
    nuevas.forEach((o) => { o.nueva = false; delete o.archivos; });
    while (borradas.length) {
      const o = borradas[0];
      const r = await sb.from('visualizador').delete().eq('id', o.id);
      if (r.error) throw r.error;
      const rutas = [rutaDe(o.modelo), rutaDe(o.miniatura)].filter(Boolean);
      if (rutas.length) await st.remove(rutas); // si falla, el archivo queda huérfano pero la web ya no lo usa
      borradas.shift();
    }
    if (!sinGrupos && grupoExtra.length) { // los grupos de pruebas anteriores desaparecen: ya solo hay un visualizador
      const r = await sb.from('visualizador_grupos').delete().neq('slug', 'general');
      if (r.error) throw paso('al limpiar grupos anteriores', r.error);
    }
  }

  let cargado = false;
  return {
    mostrar() {
      if (!cargado) { cargado = true; cargar(); }
      else if (vista) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
  };
}
