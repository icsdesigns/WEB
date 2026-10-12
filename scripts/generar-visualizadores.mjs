/* SILAB 3D · Genera una carpeta real por cada visualizador: visualizador/<url>/index.html
   (dirección limpia, con código 200, título propio y lista para compartir).
   Lee la tabla «visualizador_grupos» de Supabase (visibles). Las carpetas que este script creó y ya
   no existen en Supabase se borran; las demás no se tocan.
   Uso:  node scripts/generar-visualizadores.mjs [carpeta-del-visualizador]
   (por defecto «new-version/visualizador»; al sustituir la web, «visualizador») */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE = { url: 'https://yyezkumbjqnushwgqkzf.supabase.co', key: 'sb_publishable_S-YCLKYozH7T9DFE1gMtUw_1jWLZnIf' };
const DIR = process.argv[2] || 'new-version/visualizador';
const MARCA = '<!-- generado por scripts/generar-visualizadores.mjs: no editar -->';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const r = await fetch(`${SUPABASE.url}/rest/v1/visualizador_grupos?select=slug,nombre&visible=eq.true&slug=neq.general&order=orden.asc`,
  { headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key } });
if (!r.ok) { console.error('No se pudo leer visualizador_grupos (HTTP ' + r.status + '). ¿Ejecutaste el bloque 3 de supabase/visualizador.sql?'); process.exit(1); }
const grupos = (await r.json()).filter((g) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug) && !['pedido', 'general', 'admin'].includes(g.slug));

const plantilla = await readFile(join(DIR, 'index.html'), 'utf8');
const vivos = new Set(grupos.map((g) => g.slug));

for (const g of grupos) {
  const nombre = esc(g.nombre);
  let html = plantilla
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${nombre} | SILAB 3D Salamanca</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1Elige los colores de «${nombre}» en 3D y haz tu pedido en SILAB 3D, taller de impresión 3D en Salamanca.$2`)
    .replace(/(<link rel="canonical" href="https:\/\/silab3d\.com\/visualizador\/)(")/, `$1${g.slug}/$2`)
    .replace('<head>', '<head>\n  ' + MARCA);
  await mkdir(join(DIR, g.slug), { recursive: true });
  await writeFile(join(DIR, g.slug, 'index.html'), html);
  console.log('✓ /visualizador/' + g.slug + '/');
}

for (const e of await readdir(DIR, { withFileTypes: true })) {
  if (!e.isDirectory() || vivos.has(e.name) || e.name === 'pedido') continue;
  try {
    const f = join(DIR, e.name, 'index.html');
    if ((await readFile(f, 'utf8')).includes(MARCA)) { await rm(join(DIR, e.name), { recursive: true }); console.log('✗ quitada /visualizador/' + e.name + '/'); }
  } catch (_) { /* no es una carpeta generada */ }
}
console.log(grupos.length ? 'Listo.' : 'No hay visualizadores adicionales.');
