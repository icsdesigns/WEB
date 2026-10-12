/* ============================================================
   SILAB 3D · Página /visualizador/
   Lee las opciones de Supabase (tabla «visualizador», pestaña
   Visualizador del panel); data/visualizador.json es un respaldo opcional. Paleta: colores de filamento del
   catálogo (js/filamentos.js). ?opcion=<id> abre esa opción y
   ?embed=1 deja solo el componente para incrustarlo con un iframe.
   ============================================================ */
import { montarVisualizador, CLAVE_PEDIDO } from './visualizador.js';
import { decodificar } from './visualizador-formato.js';

const SUPABASE = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
const params = new URLSearchParams(location.search);
// Visualizador de esta página: /visualizador/<url>/ (carpeta generada o 404 de respaldo) o ?v=<url>; sin nada, «general»
const SLUG = (() => {
  const m = /\/visualizador\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(location.pathname);
  return (m && m[1] !== 'pedido' ? m[1] : params.get('v') || 'general').toLowerCase().replace(/[^a-z0-9-]/g, '');
})();
if (params.get('embed') === '1') document.body.classList.add('vis-embed');

async function deSupabase() {
  // «precios» y «grupo» son columnas añadidas después: si aún no existen en Supabase, se lee sin ellas
  const variantes = [['id,nombre,material,modelo,miniatura,colores,precios', '&grupo=eq.' + SLUG], ['id,nombre,material,modelo,miniatura,colores,precios', ''], ['id,nombre,material,modelo,miniatura,colores', '']];
  for (const [cols, filtro] of variantes) {
    if (!filtro && SLUG !== 'general') return null; // sin la columna «grupo» solo existe el visualizador general
    try {
      const r = await fetch(SUPABASE.url + '/rest/v1/visualizador?select=' + cols + filtro + '&visible=eq.true&order=orden.asc,creado.asc', {
        headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key }, cache: 'no-store'
      });
      const filas = r.ok ? await r.json() : null;
      if (Array.isArray(filas) && filas.length) return filas;
      if (r.ok) return null; // tabla vacía
    } catch (e) { return null; }
  }
  return null;
}
async function deRespaldo() {
  if (SLUG !== 'general') return [];
  try {
    const r = await fetch('/new-version/data/visualizador.json', { cache: 'no-cache' });
    const j = r.ok ? await r.json() : null;
    return j && Array.isArray(j.opciones) ? j.opciones : [];
  } catch (e) { return []; }
}
// Nombre del visualizador (tabla «visualizador_grupos»); sin ella, el título genérico
async function deGrupo() {
  try {
    const r = await fetch(SUPABASE.url + '/rest/v1/visualizador_grupos?select=slug,nombre&slug=eq.' + SLUG, { headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key }, cache: 'no-store' });
    const f = r.ok ? await r.json() : null;
    return Array.isArray(f) && f[0] ? f[0] : null;
  } catch (e) { return null; }
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
const [opciones, pal, grupo] = await Promise.all([deSupabase().then((x) => x || deRespaldo()), paleta(), SLUG === 'general' ? null : deGrupo()]);
if (grupo && grupo.nombre) {
  document.title = grupo.nombre + ' · Elige tus colores · SILAB 3D';
  const h = document.getElementById('page-title');
  if (h && !document.body.classList.contains('vis-embed')) h.innerHTML = esc(grupo.nombre) + ' <em>· tus colores</em>';
}
if (!opciones.length) {
  raiz.innerHTML = '<p class="vis-vacio">Este visualizador no está disponible por ahora. <a href="/new-version/productos/">Ver productos</a></p>';
  throw new Error('visualizador sin opciones');
}
montarVisualizador(raiz, {
  opciones,
  paleta: pal || {},
  inicial: params.get('opcion') || (restaurar() || {}).id,
  pedido: '/new-version/visualizador/pedido/' + (params.get('embed') === '1' ? '?embed=1' : ''),
  restaurar: restaurar(),
  cargar: async (op) => {
    const r = await fetch(op.modelo);
    if (!r.ok) throw new Error('No se pudo descargar el modelo (' + r.status + ').');
    return decodificar(await r.arrayBuffer());
  }
});
