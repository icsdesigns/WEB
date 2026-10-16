// SILAB 3D · Reseñas de Google para la web (sin widgets en la página)
// Añade las reseñas nuevas de la ficha de Google a data/resenas.json y actualiza la nota media y el total.
// Nunca borra las que ya había.
//
// De dónde las lee:
//  - Por defecto, del servicio de datos de Elfsight, que ya sincroniza tu ficha de Google para su widget
//    (no necesita claves ni facturación; solo que la cuenta gratuita de Elfsight siga activa).
//  - Si existe el secreto GOOGLE_PLACES_KEY, de la API oficial de Google (Places API New, pide facturación
//    en Google Cloud y solo da 5 reseñas por consulta).
//
// Uso:  node scripts/resenas-google.mjs [ruta del json]
// Lo ejecuta cada semana .github/workflows/resenas-google.yml
import fs from 'fs';

const RUTA = process.argv[2] || 'data/resenas.json';
const CLAVE = process.env.GOOGLE_PLACES_KEY;

if (!fs.existsSync(RUTA)) { console.log(`No existe ${RUTA} (llega con la web nueva): no se actualiza nada.`); process.exit(0); }
const datos = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
const placeId = datos.lugar.placeId;

// Cada fuente devuelve { nota, total, resenas: [{ id, autor, nota, texto, fecha, url }] }
async function desdeElfsight() {
  const todas = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const url = `https://service-reviews-ultimate.elfsight.com/data/reviews?uris%5B%5D=${placeId}&page_length=100&order=date&page=${pagina}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Elfsight respondió ${r.status}`);
    const lote = (await r.json())?.result?.data || [];
    const nuevasIds = lote.filter((x) => !todas.some((y) => y.id === x.id));
    todas.push(...nuevasIds);
    if (lote.length < 100 || !nuevasIds.length) break;
  }
  if (!todas.length) throw new Error('Elfsight no devolvió reseñas');
  // Elfsight no da la nota ni el total de la ficha (y guarda alguna reseña que Google ya no cuenta), así que
  // se parte de los de Google y solo se suman las reseñas que aparecen por primera vez (con o sin texto).
  const ids = todas.map((x) => String(x.id));
  let { nota, total } = datos.lugar;
  if (Array.isArray(datos.idsElfsight)) {
    const nuevasTodas = todas.filter((x) => !datos.idsElfsight.includes(String(x.id)));
    if (nuevasTodas.length) {
      nota = Math.round((nota * total + nuevasTodas.reduce((s, x) => s + x.rating, 0)) / (total + nuevasTodas.length) * 10) / 10;
      total += nuevasTodas.length;
    }
  }
  datos.idsElfsight = [...new Set([...(datos.idsElfsight || []), ...ids])];
  return {
    nota, total,
    resenas: todas.map((x) => ({
      id: 'elfsight-' + x.id,
      autor: (x.reviewer_name || 'Cliente de Google').trim(),
      nota: x.rating,
      texto: (x.text || '').trim(),
      fecha: new Date(x.published_at * 1000).toISOString().slice(0, 10),
      url: x.url || datos.lugar.url
    }))
  };
}

async function desdeGoogle() {
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=es`, {
    headers: { 'X-Goog-Api-Key': CLAVE, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri' }
  });
  if (!r.ok) throw new Error(`Google respondió ${r.status}: ${await r.text()}`);
  const f = await r.json();
  return {
    nota: f.rating, total: f.userRatingCount,
    resenas: (f.reviews || []).map((g) => ({
      id: g.name,
      autor: (g.authorAttribution?.displayName || 'Cliente de Google').trim(),
      nota: g.rating,
      texto: (g.originalText?.text || g.text?.text || '').trim(),
      fecha: (g.publishTime || '').slice(0, 10),
      url: g.googleMapsUri || g.authorAttribution?.uri || datos.lugar.url
    }))
  };
}

let fuente;
try { fuente = CLAVE ? await desdeGoogle() : await desdeElfsight(); }
catch (e) { console.error('No se pudieron leer las reseñas:', e.message); process.exit(1); }

const antes = datos.lugar.nota + '|' + datos.lugar.total;
if (fuente.nota) datos.lugar.nota = fuente.nota;
if (fuente.total) datos.lugar.total = fuente.total;

// Una reseña es la misma si coincide su id, su autor y día o su autor y comienzo del texto
const clave = (x) => x.autor.toLowerCase() + '|' + x.fecha;
const clave2 = (x) => x.autor.toLowerCase() + '|' + x.texto.slice(0, 40).toLowerCase();
const vistas = new Set(datos.resenas.flatMap((x) => [x.id, clave(x), clave2(x)]));
let nuevas = 0;
for (const x of fuente.resenas) {
  if (!x.texto || vistas.has(x.id) || vistas.has(clave(x)) || vistas.has(clave2(x))) continue;
  datos.resenas.push(x); vistas.add(x.id); nuevas++;
}
datos.resenas.sort((a, b) => b.fecha.localeCompare(a.fecha));
if (nuevas || antes !== datos.lugar.nota + '|' + datos.lugar.total) datos.actualizado = new Date().toISOString().slice(0, 10);

fs.writeFileSync(RUTA, JSON.stringify(datos, null, 2) + '\n');
console.log(`Fuente: ${CLAVE ? 'Google' : 'Elfsight'} · reseñas nuevas: ${nuevas} · nota ${datos.lugar.nota} · total ${datos.lugar.total} · guardadas ${datos.resenas.length}`);
