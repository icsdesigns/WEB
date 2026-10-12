/* ============================================================
   SILAB 3D · Visualizador 3D con colores configurables
   montarVisualizador(raiz, ajustes) dibuja el componente completo:
   selector de opciones (Opción A, B…), escena 3D (three.js) con tres
   vistas, y panel lateral con los colores (Color A, B…), las unidades
   y el precio por tramos. Lo usan la página /visualizador/ y la vista
   previa del panel admin (js/admin-visualizador.js).
   ajustes = {
     opciones: [{ id, material, miniatura, colores: [{ slot, hex }],
                  precios: [{ desde, unidad }] }],   (precio por unidad desde N unidades)
     cargar(opcion) → Promise<malla decodificada> (js/visualizador-formato.js),
     paleta: { pla: [{ name, hex, fondo }], petg: [...] }   (js/filamentos.js)
     inicial: id de la opción a mostrar primero,
     pedido: URL del formulario de pedido (sin ella no hay botón «Hacer pedido»),
     restaurar: { id, colores: { slot: hex }, cantidad } para volver desde el formulario con la elección hecha
   }
   «Hacer pedido» guarda la elección en sessionStorage (CLAVE_PEDIDO) y abre el formulario.
   Los nombres «Opción A» y «Color A» salen del orden, igual en todos los diseños.
   three.js llega por el import map de la página (mismo que la tasadora).
   ============================================================ */

let THREE = null, OrbitControls = null, RoomEnvironment = null;
async function cargarThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normal = (h) => String(h || '').trim().toLowerCase().replace(/^#?/, '#').slice(0, 7);
export const CLAVE_PEDIDO = 'silab3d-pedido-visualizador';
export const letra = (i) => String.fromCharCode(65 + (i % 26));
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const ICONO = {
  flecha: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  wa: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.3A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  menos: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  mas: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  // Vistas: giro, desde arriba, de frente
  giro: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/></svg>',
  superior: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><circle cx="12" cy="12" r="3.2"/></svg>',
  frontal: '<svg class="s3d-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5h14"/><rect x="7" y="6" width="10" height="9" rx="2"/></svg>'
};
const VISTAS = [
  { id: 'defecto', nombre: 'Predeterminada', icono: ICONO.giro, dir: [0.18, -1, 0.95] },
  { id: 'superior', nombre: 'Superior', icono: ICONO.superior, dir: [0, -0.05, 1] },
  { id: 'frontal', nombre: 'Frontal', icono: ICONO.frontal, dir: [0, -1, 0.26] }
];

/* ---------- Tramos de precio ---------- */
export function tramos(op) {
  return (Array.isArray(op && op.precios) ? op.precios : [])
    .map((t) => ({ desde: Math.max(1, Math.floor(+t.desde)), unidad: +t.unidad }))
    .filter((t) => Number.isFinite(t.desde) && Number.isFinite(t.unidad) && t.unidad >= 0)
    .sort((a, b) => a.desde - b.desde);
}
export function precioPara(op, cantidad) {
  const t = tramos(op);
  if (!t.length) return null;
  let actual = t[0];
  for (const x of t) if (cantidad >= x.desde) actual = x;
  const siguiente = t.find((x) => x.desde > cantidad && x.unidad < actual.unidad) || null;
  return { unidad: actual.unidad, total: Math.round(actual.unidad * cantidad * 100) / 100, siguiente };
}

/* ---------- Escena ---------- */
export async function crearVisor(contenedor) {
  await cargarThree();
  const lienzo = document.createElement('canvas');
  lienzo.className = 'vis__lienzo';
  contenedor.prepend(lienzo);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    lienzo.remove();
    throw new Error('Tu navegador no puede mostrar modelos 3D (WebGL desactivado).');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  escena.environmentIntensity = 0.6;
  const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
  camara.up.set(0, 0, 1); // los 3MF tienen Z hacia arriba
  const sol = new THREE.DirectionalLight(0xffffff, 1.3);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.radius = 6;
  sol.shadow.bias = -0.0004;
  escena.add(sol, sol.target, new THREE.HemisphereLight(0xffffff, 0xd9c6cc, 0.5));
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.3 }));
  suelo.receiveShadow = true;
  escena.add(suelo);

  const controles = new OrbitControls(camara, lienzo);
  controles.enableDamping = true;
  controles.dampingFactor = 0.09;
  controles.screenSpacePanning = true;
  controles.maxPolarAngle = Math.PI * 0.62; // un poco por debajo del suelo como mucho
  controles.autoRotateSpeed = 1.6;           // ≈ una vuelta cada 37 s

  const sinMovimiento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let grupo = null, materiales = new Map(), pendiente = true, vivo = true, enPantalla = true;
  let radio = 1, vistaId = 'defecto', animacion = null, reanudar = null;
  const pintar = () => { pendiente = true; };
  controles.addEventListener('change', pintar);

  // En la vista predeterminada el modelo gira solo. Si la persona lo toca, se para y vuelve a girar a los 5 s
  const girar = (si) => { controles.autoRotate = !!si && !sinMovimiento && vistaId === 'defecto'; pintar(); };
  controles.addEventListener('start', () => { animacion = null; clearTimeout(reanudar); girar(false); });
  controles.addEventListener('end', () => { clearTimeout(reanudar); reanudar = setTimeout(() => girar(true), 5000); });

  const medir = () => {
    const w = contenedor.clientWidth || 1, h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    pintar();
  };
  const ro = new ResizeObserver(medir);
  ro.observe(contenedor);
  medir();
  // Sin gastar batería cuando la escena no se ve
  const io = new IntersectionObserver((es) => { enPantalla = es[es.length - 1].isIntersecting; if (enPantalla) pintar(); });
  io.observe(contenedor);

  const bucle = (t) => {
    if (!vivo) return;
    requestAnimationFrame(bucle);
    if (!enPantalla) return;
    if (animacion) {
      const k = Math.min(1, (t - animacion.t0) / animacion.dur), e = 1 - Math.pow(1 - k, 3);
      camara.position.lerpVectors(animacion.desde, animacion.hasta, e);
      if (k >= 1) { animacion = null; girar(true); }
      pintar();
    }
    if (controles.update()) pendiente = true;
    if (pendiente && grupo) { renderer.render(escena, camara); pendiente = false; }
  };
  requestAnimationFrame(bucle);

  function liberar() {
    if (!grupo) return;
    escena.remove(grupo);
    grupo.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    materiales.forEach((m) => m.dispose());
    materiales = new Map();
    grupo = null;
  }

  // Posición de la cámara para una vista: siempre mirando al centro del modelo, a la distancia que lo encuadra
  function posicionVista(id) {
    const v = VISTAS.find((x) => x.id === id) || VISTAS[0];
    const d = radio / Math.sin((camara.fov * Math.PI) / 360) * 0.86;
    return new THREE.Vector3(...v.dir).normalize().multiplyScalar(d).add(controles.target);
  }
  function limites() {
    const d = radio / Math.sin((camara.fov * Math.PI) / 360) * 0.86;
    camara.near = d / 100; camara.far = d * 20;
    camara.updateProjectionMatrix();
    controles.minDistance = radio * 0.6;
    controles.maxDistance = d * 3;
  }

  return {
    // malla = { bbox, slots: [{ slot, trozos: [{ pos, idx }] }] }; colores = { slot: hex }
    mostrar(malla, colores) {
      liberar();
      grupo = new THREE.Group();
      const b = malla.bbox;
      const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, z0 = b[2];
      const alto = b[5] - b[2];
      for (const s of malla.slots) {
        const mat = new THREE.MeshStandardMaterial({ color: colores[s.slot] || s.hex || '#cccccc', roughness: 0.62, metalness: 0, flatShading: true });
        materiales.set(s.slot, mat);
        for (const t of s.trozos) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
          g.setIndex(new THREE.BufferAttribute(t.idx, 1));
          g.computeBoundingSphere();
          const m = new THREE.Mesh(g, mat);
          m.castShadow = true; m.receiveShadow = true;
          m.userData.slot = s.slot;
          grupo.add(m);
        }
      }
      grupo.position.set(-cx, -cy, -z0);
      escena.add(grupo);
      radio = Math.max(Math.hypot(b[3] - b[0], b[4] - b[1], alto) / 2, 1);
      controles.target.set(0, 0, alto / 2);
      // Sombra: luz desde arriba a la izquierda, cámara de sombra ajustada al modelo
      sol.position.set(-radio * 1.2, -radio * 1.6, radio * 3 + alto);
      sol.target.position.set(0, 0, 0);
      const sc = sol.shadow.camera;
      sc.left = sc.bottom = -radio * 1.6; sc.right = sc.top = radio * 1.6;
      sc.near = 0.1; sc.far = radio * 8 + alto * 2;
      sc.updateProjectionMatrix();
      suelo.scale.set(radio * 8, radio * 8, 1);
      suelo.position.set(0, 0, 0);
      limites();
      this.vista('defecto', false);
    },
    // Cambia de vista con un movimiento suave. «defecto» vuelve a girar solo
    vista(id, animar = true) {
      vistaId = id;
      clearTimeout(reanudar);
      controles.autoRotate = false;
      controles.target.set(0, 0, controles.target.z);
      const hasta = posicionVista(id);
      if (animar && !sinMovimiento) animacion = { t0: performance.now(), dur: 650, desde: camara.position.clone(), hasta };
      else { animacion = null; camara.position.copy(hasta); girar(true); }
      controles.update();
      pintar();
    },
    color(slot, hex) { const m = materiales.get(slot); if (m) { m.color.set(hex); pintar(); } },
    // Color (slot) bajo un punto de la pantalla, o null
    slotEn(x, y) {
      if (!grupo) return null;
      const r = lienzo.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camara);
      const hit = ray.intersectObject(grupo, true)[0];
      return hit ? hit.object.userData.slot : null;
    },
    lienzo,
    destruir() { vivo = false; clearTimeout(reanudar); ro.disconnect(); io.disconnect(); liberar(); controles.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); lienzo.remove(); }
  };
}

/* ---------- Componente completo ---------- */
export function montarVisualizador(raiz, ajustes) {
  const opciones = ajustes.opciones || [];
  raiz.classList.add('vis');
  raiz.innerHTML = `
    <div class="vis__opciones" role="radiogroup" aria-label="Elige el diseño" ${opciones.length < 2 ? 'hidden' : ''}></div>
    <div class="vis__cuerpo">
      <div class="vis__visor">
        <div class="vis__escena">
          <div class="vis__estado" role="status"><span class="vis__spinner" aria-hidden="true"></span><span data-texto>Cargando el modelo…</span></div>
          <div class="vis__vistas">
            <button type="button" class="vis__vistas-btn" aria-haspopup="true" aria-expanded="false" aria-label="Cambiar la vista del modelo" title="Vista del modelo">
              <span data-vista-icono>${VISTAS[0].icono}</span><span class="vis__vistas-nom" data-vista-nombre>${VISTAS[0].nombre}</span>${ICONO.flecha}
            </button>
            <div class="vis__vistas-menu" role="radiogroup" aria-label="Vista del modelo" hidden>${VISTAS.map((v, i) => `
              <button type="button" class="vis__vista" role="radio" aria-checked="${i === 0}" data-vista="${v.id}">${v.icono}<span>${v.nombre}</span></button>`).join('')}
            </div>
          </div>
        </div>
        <p class="vis__pista">Arrastra para girar · rueda o pellizca para acercar · toca una pieza para cambiar su color</p>
      </div>
      <aside class="vis__panel" aria-label="Configura tu pedido">
        <section class="vis__bloque" aria-labelledby="vis-t-color">
          <h3 class="vis__titulo" id="vis-t-color">Colores</h3>
          <p class="vis__sub">Elige un color para cada parte. Son los filamentos que tenemos en el taller.</p>
          <div class="vis__colores" data-colores></div>
          <button type="button" class="vis__restaurar" data-restaurar>Restaurar colores originales</button>
        </section>
        <section class="vis__bloque" aria-labelledby="vis-t-uds">
          <h3 class="vis__titulo" id="vis-t-uds">Unidades</h3>
          <div class="vis__cant">
            <button type="button" class="vis__cant-b" data-cant="-1" aria-label="Una unidad menos">${ICONO.menos}</button>
            <input type="number" class="vis__cant-n" data-unidades inputmode="numeric" min="1" max="9999" step="1" value="1" aria-labelledby="vis-t-uds">
            <button type="button" class="vis__cant-b" data-cant="1" aria-label="Una unidad más">${ICONO.mas}</button>
          </div>
        </section>
        <section class="vis__bloque vis__precio" data-precio aria-live="polite"></section>
        ${ajustes.pedido ? `<a class="s3d-btn s3d-btn--primary vis__pedido" data-pedido href="${esc(ajustes.pedido)}">Hacer pedido</a>` : ''}
      </aside>
    </div>`;
  const $ = (s) => raiz.querySelector(s);
  const escenaEl = $('.vis__escena'), estado = $('.vis__estado'), lista = $('[data-colores]');
  const campoUds = $('[data-unidades]'), cajaPrecio = $('[data-precio]');
  const cache = new Map();
  let visor = null, actual = null, elegidos = {}, abierto = null, turno = 0, cantidad = 1;

  const indiceDe = (op) => opciones.indexOf(op);
  const paletaDe = (op) => {
    const p = ajustes.paleta || {};
    const l = /petg/i.test(op.material || '') ? p.petg : p.pla;
    return (l && l.length ? l : (p.pla || [])).slice();
  };
  const nombreColor = (op, hex) => {
    const c = paletaDe(op).find((x) => normal(x.hex) === normal(hex));
    return c ? c.name : null;
  };
  const minimo = (op) => { const t = tramos(op); return t.length ? t[0].desde : 1; };
  const mostrarEstado = (txt, error) => {
    estado.hidden = !txt;
    estado.classList.toggle('is-error', !!error);
    if (txt) estado.querySelector('[data-texto]').textContent = txt;
  };

  // Selector de diseños: Opción A, B…
  const barra = $('.vis__opciones');
  barra.innerHTML = opciones.map((o, i) => `
    <button type="button" class="vis__opcion" role="radio" aria-checked="false" data-id="${esc(o.id)}">
      ${o.miniatura ? `<img src="${esc(o.miniatura)}" alt="" loading="lazy" width="56" height="56">` : '<span class="vis__opcion-hueco" aria-hidden="true"></span>'}
      <span>Opción ${letra(i)}</span>
    </button>`).join('');
  barra.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) elegir(b.dataset.id); });
  barra.addEventListener('keydown', (e) => {
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
    const i = opciones.findIndex((o) => o.id === (actual && actual.id));
    const j = (i + (/Right|Down/.test(e.key) ? 1 : -1) + opciones.length) % opciones.length;
    e.preventDefault(); elegir(opciones[j].id); barra.querySelector(`[data-id="${CSS.escape(opciones[j].id)}"]`).focus();
  });

  // Vistas: predeterminada (gira sola), superior y frontal
  const botonesVista = [...raiz.querySelectorAll('[data-vista]')];
  const cajaVistas = $('.vis__vistas'), btnVistas = $('.vis__vistas-btn'), menuVistas = $('.vis__vistas-menu');
  const abrirVistas = (abrir) => { menuVistas.hidden = !abrir; btnVistas.setAttribute('aria-expanded', String(abrir)); };
  btnVistas.addEventListener('click', () => abrirVistas(menuVistas.hidden));
  document.addEventListener('pointerdown', (e) => { if (!menuVistas.hidden && !cajaVistas.contains(e.target)) abrirVistas(false); });
  cajaVistas.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menuVistas.hidden) { abrirVistas(false); btnVistas.focus(); } });
  menuVistas.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]');
    if (!b) return;
    botonesVista.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    const v = VISTAS.find((x) => x.id === b.dataset.vista);
    if (v) { $('[data-vista-icono]').innerHTML = v.icono; $('[data-vista-nombre]').textContent = v.nombre; }
    abrirVistas(false);
    btnVistas.focus();
    if (visor) visor.vista(b.dataset.vista);
  });

  function pintarColores() {
    const op = actual;
    if (!op) { lista.innerHTML = ''; return; }
    $('#vis-t-color').textContent = op.colores.length > 1 ? 'Colores' : 'Color';
    const pal = paletaDe(op);
    lista.innerHTML = op.colores.map((c, n) => {
      const hex = elegidos[c.slot] || c.hex;
      const nom = nombreColor(op, hex) || (normal(hex) === normal(c.hex) ? 'Color original' : 'Color elegido');
      const orig = pal.some((x) => normal(x.hex) === normal(c.hex)) ? '' :
        `<button type="button" class="vis__muestra${normal(hex) === normal(c.hex) ? ' is-activa' : ''}" data-slot="${c.slot}" data-hex="${esc(c.hex)}" style="--m:${esc(c.hex)}" title="Color original" aria-label="Color original" aria-pressed="${normal(hex) === normal(c.hex)}"></button>`;
      return `
      <div class="vis__color${abierto === c.slot ? ' is-abierto' : ''}">
        <button type="button" class="vis__color-cab" data-abrir="${c.slot}" aria-expanded="${abierto === c.slot}">
          <span class="vis__chip" style="--m:${esc(hex)}"></span>
          <span class="vis__color-txt"><b>Color ${letra(n)}</b><span>${esc(nom)}</span></span>
          ${ICONO.flecha}
        </button>
        <div class="vis__paleta" ${abierto === c.slot ? '' : 'hidden'}>
          ${orig}${pal.map((x) => `<button type="button" class="vis__muestra${normal(x.hex) === normal(hex) ? ' is-activa' : ''}" data-slot="${c.slot}" data-hex="${esc(x.hex)}" style="--m:${esc(x.fondo || x.hex)}" title="${esc(x.name)}" aria-label="${esc(x.name)}" aria-pressed="${normal(x.hex) === normal(hex)}"></button>`).join('')}
        </div>
      </div>`;
    }).join('');
    $('[data-restaurar]').hidden = !op.colores.some((c) => elegidos[c.slot] && normal(elegidos[c.slot]) !== normal(c.hex));
  }

  function pintarPrecio() {
    const op = actual;
    if (!op) { cajaPrecio.innerHTML = ''; return; }
    const min = minimo(op);
    if (cantidad < min) cantidad = min;
    if (document.activeElement !== campoUds) campoUds.value = String(cantidad);
    campoUds.min = String(min);
    const p = precioPara(op, cantidad);
    if (!p) {
      cajaPrecio.innerHTML = '<p class="vis__precio-aviso">Precio a consultar: escríbenos y te lo confirmamos.</p>';
    } else {
      cajaPrecio.innerHTML = `
        <div class="vis__precio-fila"><span>Precio por unidad</span><b>${euros.format(p.unidad)}</b></div>
        <div class="vis__precio-total"><span>Total · ${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}</span><b>${euros.format(p.total)}</b></div>
        <p class="vis__precio-nota">Envío no incluido</p>
        ${p.siguiente ? `<p class="vis__precio-sig">Desde ${p.siguiente.desde} unidades baja a ${euros.format(p.siguiente.unidad)} cada una.</p>` : ''}
        ${min > 1 ? `<p class="vis__precio-nota">Pedido mínimo: ${min} unidades.</p>` : ''}`;
    }
  }
  /* Amortigua los cambios de tamaño: al abrir una paleta, cambiar de opción o actualizar el precio, la altura del panel
     (de la que depende la del visor) pasa de la anterior a la nueva con una transición en vez de saltar. */
  const panelEl = $('.vis__panel');
  const sinMovimiento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  let finAnim = null;
  const suave = (fn) => {
    if (!panelEl.isConnected || (sinMovimiento && sinMovimiento.matches)) return fn();
    const antes = panelEl.offsetHeight;
    clearTimeout(finAnim);
    panelEl.style.transition = 'none'; panelEl.style.height = '';
    fn();
    const despues = panelEl.offsetHeight;
    if (!antes || Math.abs(despues - antes) < 2) { panelEl.style.overflow = ''; return; }
    panelEl.style.height = antes + 'px'; panelEl.style.overflow = 'hidden';
    void panelEl.offsetHeight; // fija la altura de partida antes de animar
    panelEl.style.transition = 'height .38s cubic-bezier(.22,.7,.2,1)';
    panelEl.style.height = despues + 'px';
    finAnim = setTimeout(() => { panelEl.style.transition = ''; panelEl.style.height = ''; panelEl.style.overflow = ''; }, 420);
  };
  const _colores = pintarColores, _precio = pintarPrecio;
  pintarColores = () => suave(_colores);
  pintarPrecio = () => suave(_precio);
  const pintarTodo = () => { pintarColores(); pintarPrecio(); };

  lista.addEventListener('click', (e) => {
    const m = e.target.closest('[data-hex]');
    if (m) {
      const slot = +m.dataset.slot;
      elegidos[slot] = m.dataset.hex;
      if (visor) visor.color(slot, m.dataset.hex);
      pintarTodo();
      const f = lista.querySelector(`[data-slot="${slot}"][data-hex="${CSS.escape(m.dataset.hex)}"]`);
      if (f) f.focus();
      return;
    }
    const a = e.target.closest('[data-abrir]');
    if (a) { const s = +a.dataset.abrir; abierto = abierto === s ? null : s; pintarColores(); const b = lista.querySelector(`[data-abrir="${s}"]`); if (b) b.focus(); }
  });
  $('[data-restaurar]').addEventListener('click', () => {
    elegidos = {};
    if (actual && visor) actual.colores.forEach((c) => visor.color(c.slot, c.hex));
    pintarTodo();
  });

  // Unidades: botones ± y escritura directa (el precio se recalcula al momento)
  const fijar = (n) => {
    const min = actual ? minimo(actual) : 1;
    cantidad = Math.min(9999, Math.max(min, Math.floor(+n) || min));
    pintarPrecio();
  };
  raiz.querySelectorAll('[data-cant]').forEach((b) => b.addEventListener('click', () => fijar(cantidad + +b.dataset.cant)));
  campoUds.addEventListener('input', () => {
    const n = Math.floor(+campoUds.value);
    if (n >= 1 && n <= 9999) { cantidad = Math.max(n, 1); pintarPrecio(); }
  });
  campoUds.addEventListener('change', () => { fijar(campoUds.value); campoUds.value = String(cantidad); });
  campoUds.addEventListener('blur', () => { campoUds.value = String(cantidad); fijar(cantidad); });

  // «Hacer pedido»: guarda lo elegido para que el formulario lo muestre y lo envíe junto al pedido
  const botonPedido = $('[data-pedido]');
  if (botonPedido) botonPedido.addEventListener('click', () => {
    if (!actual) return;
    const p = precioPara(actual, cantidad);
    const i = Math.max(0, indiceDe(actual));
    const datos = {
      id: actual.id, letra: letra(i), material: actual.material || 'PLA', miniatura: actual.miniatura || null,
      colores: actual.colores.map((c, n) => { const hex = elegidos[c.slot] || c.hex; return { slot: c.slot, letra: letra(n), hex, original: c.hex, nombre: nombreColor(actual, hex) || '' }; }),
      unidades: cantidad, unidad: p ? p.unidad : null, total: p ? p.total : null,
      volver: location.pathname + location.search
    };
    try { sessionStorage.setItem(CLAVE_PEDIDO, JSON.stringify(datos)); } catch (e) { /* sin almacenamiento: el formulario pedirá volver */ }
  });

  // Toque o clic (sin arrastrar) sobre una pieza: abre su color
  let toque = null;
  escenaEl.addEventListener('pointerdown', (e) => { toque = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  escenaEl.addEventListener('pointerup', (e) => {
    if (!toque || !visor || e.target.closest('.vis__vistas') || Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > 6 || Date.now() - toque.t > 500) return;
    const s = visor.slotEn(e.clientX, e.clientY);
    if (s == null || !actual || !actual.colores.some((c) => c.slot === s)) return;
    abierto = s; pintarColores();
    const b = lista.querySelector(`[data-abrir="${s}"]`);
    if (b) { b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); b.classList.add('is-destacado'); setTimeout(() => b.classList.remove('is-destacado'), 900); }
  });

  async function elegir(id) {
    const op = opciones.find((o) => o.id === id) || opciones[0];
    if (!op) { mostrarEstado('Todavía no hay modelos para mostrar.'); return; }
    const mio = ++turno;
    const cambia = !actual || actual.id !== op.id;
    actual = op; elegidos = {}; abierto = op.colores.length === 1 ? op.colores[0].slot : null;
    if (cambia) cantidad = minimo(op);
    const rs = ajustes.restaurar && ajustes.restaurar.id === op.id ? ajustes.restaurar : null;
    if (rs) { // vuelta desde el formulario: se recupera lo elegido (una sola vez)
      ajustes.restaurar = null;
      op.colores.forEach((c) => { if (rs.colores && rs.colores[c.slot] && normal(rs.colores[c.slot]) !== normal(c.hex)) elegidos[c.slot] = rs.colores[c.slot]; });
      cantidad = Math.min(9999, Math.max(minimo(op), Math.floor(+rs.cantidad) || minimo(op)));
    }
    barra.querySelectorAll('[data-id]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === op.id)));
    botonesVista.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.vista === 'defecto')));
    pintarTodo();
    mostrarEstado('Cargando el modelo…');
    try {
      if (!visor) visor = await crearVisor(escenaEl);
      if (!cache.has(op.id)) cache.set(op.id, ajustes.cargar(op).catch((err) => { cache.delete(op.id); throw err; }));
      const malla = await cache.get(op.id);
      if (mio !== turno) return;
      const cols = {};
      op.colores.forEach((c) => { cols[c.slot] = elegidos[c.slot] || c.hex; });
      visor.mostrar(malla, cols);
      mostrarEstado('');
      if (ajustes.alElegir) ajustes.alElegir(op);
    } catch (err) {
      if (mio === turno) mostrarEstado(err.message || 'No se pudo cargar el modelo.', true);
    }
  }

  const inicial = opciones.find((o) => o.id === ajustes.inicial) || opciones[0];
  if (inicial) elegir(inicial.id); else mostrarEstado('Todavía no hay modelos para mostrar.');

  return {
    elegir,
    colores: () => ({ ...elegidos }),
    cantidad: () => cantidad,
    // El panel admin cambia precios o paleta de una opción ya mostrada: se repinta sin recargar el modelo
    refrescar() { pintarTodo(); },
    destruir() { turno++; if (visor) visor.destruir(); visor = null; raiz.innerHTML = ''; }
  };
}
