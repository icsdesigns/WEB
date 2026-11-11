/* ============================================================
   SILAB 3D · Página /visualizador/
   Lee las opciones de Supabase (tabla «visualizador», pestaña
   Visualizador del panel). Cada producto del catálogo tiene el suyo:
   ?p=<producto> (columna «grupo»; sin ?p= se usa el antiguo «general»).
   Solo se muestra si está habilitado (visualizador_grupos.visible).
   Paleta: colores de filamento del
   catálogo (js/filamentos.js). ?opcion=<id> abre esa opción y
   ?embed=1 deja solo el componente para incrustarlo con un iframe.
   ============================================================ */
import { montarVisualizador, CLAVE_PEDIDO } from './visualizador.js?v=20261018';
import { decodificar } from './visualizador-formato.js';

const SUPABASE = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
const params = new URLSearchParams(location.search);
if (params.get('embed') === '1') document.body.classList.add('vis-embed');

const grupo = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.get('p') || '') ? params.get('p') : 'general';
const cab = { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key };

// El visualizador del producto solo existe si está habilitado (la política de Supabase solo deja leer los habilitados)
async function habilitado() {
  try {
    const r = await fetch(SUPABASE.url + '/rest/v1/visualizador_grupos?select=slug,producto&visible=eq.true&slug=eq.' + grupo, { headers: cab, cache: 'no-store' });
    const filas = r.ok ? await r.json() : null;
    return Array.isArray(filas) && filas[0] ? filas[0] : null;
  } catch (e) { return null; }
}

async function deSupabase() {
  // «precios» es una columna añadida después: si aún no existe en Supabase, se lee sin ella
  for (const cols of ['id,nombre,material,modelo,miniatura,colores,precios', 'id,nombre,material,modelo,miniatura,colores']) {
    try {
      const r = await fetch(SUPABASE.url + '/rest/v1/visualizador?select=' + cols + '&visible=eq.true&grupo=eq.' + grupo + '&order=orden.asc,creado.asc', {
        headers: cab, cache: 'no-store'
      });
      const filas = r.ok ? await r.json() : null;
      if (Array.isArray(filas) && filas.length) return filas;
      if (r.ok) return null; // tabla vacía
    } catch (e) { return null; }
  }
  return null;
}
const paleta = () => (window.SILAB_FILAMENTOS ? window.SILAB_FILAMENTOS.load().catch(() => null) : Promise.resolve(null));

// Vuelta desde el formulario de pedido (?volver=1): se recupera la elección guardada
function restaurar() {
  if (params.get('volver') !== '1') return null;
  try {
    const d = JSON.parse(sessionStorage.getItem(CLAVE_PEDIDO) || 'null');
    if (!d) return null;
    const colores = {};
    (d.colores || []).forEach((c) => { colores[c.slot] = c.hex; });
    return { id: d.id, colores, cantidad: d.unidades };
  } catch (e) { return null; }
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const raiz = document.querySelector('[data-visualizador]');
const [info, opciones, pal] = await Promise.all([habilitado(), deSupabase().then((x) => x || []), paleta()]);
if (info && info.producto) document.title = info.producto + ': elige tus colores | SILAB 3D Salamanca';
if (!info) opciones.length = 0;
if (!opciones.length) {
  raiz.innerHTML = '<p class="vis-vacio">Este visualizador no está disponible por ahora. <a href="/productos/">Ver productos</a></p>';
  throw new Error('visualizador sin opciones');
}
montarVisualizador(raiz, {
  opciones,
  paleta: pal || {},
  inicial: params.get('opcion') || (restaurar() || {}).id,
  pedido: '/visualizador/pedido/' + (params.get('embed') === '1' ? '?embed=1' : ''),
  restaurar: restaurar(),
  cargar: async (op) => {
    const r = await fetch(op.modelo);
    if (!r.ok) throw new Error('No se pudo descargar el modelo (' + r.status + ').');
    return decodificar(await r.arrayBuffer());
  }
});
