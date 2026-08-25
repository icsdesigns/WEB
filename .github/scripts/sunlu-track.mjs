// Sunlu stock watch — captura filamentos con envío a Europa y registra cambios.
// GitHub Actions (node 20+). Sin dependencias.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://store.sunlu.com/products.json';
// El catalogo base de Shopify cotiza en la moneda de la tienda (USD). Pidiendo el
// mercado espanol se reciben los precios tal y como los ve el comprador europeo
// (EUR, con el redondeo del propio Shopify), que son los que muestra 3DStock.
const MARKET = 'ES';
const CURRENCY = 'EUR';
const OUTDIR = path.join('3dproject', 'data', 'sunlu');
const LATEST = path.join(OUTDIR, 'latest.json');
const CHANGES = path.join(OUTDIR, 'changes.json');
const PRICES = path.join(OUTDIR, 'prices.json');
const MAX_CHANGES = 4000;
const RETENTION_MS = 183 * 864e5; // ~6 meses

async function fetchAll() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const url = BASE + '?limit=250&page=' + page + '&country=' + MARKET;
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (SunluStockWatch; +https://silab3d.com)' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + url);
    const json = await res.json();
    const arr = json.products || [];
    out.push(...arr);
    if (arr.length < 250) break;
    await new Promise(r => setTimeout(r, 800));
  }
  return out;
}

// Un producto es filamento si su tipo contiene "filament" O lleva la etiqueta "3D Printer filament".
// (Muchos filamentos de Sunlu tienen type "3D Printers", así que el tipo solo no basta.)
function isFilament(p) {
  const ty = String(p.product_type || '').toLowerCase();
  const tg = (p.tags || []).map(String).join(' | ').toLowerCase();
  if (!(/filament/.test(ty) || tg.indexOf('3d printer filament') >= 0)) return false;
  const ti = String(p.title || '').toLowerCase();
  if (/\b(australia|usa|us|canada|au|ca)\s*only\b/.test(ti) && !/europe/.test(ti)) return false;
  return true;
}

function euVariants(p) {
  const opts = p.options || [];
  let idx = -1;
  for (let i = 0; i < opts.length; i++) {
    const vals = (opts[i].values || []).map(String);
    if (/ship/i.test(String(opts[i].name || '')) || vals.some(v => /ship to/i.test(v))) { idx = i; break; }
  }
  if (idx < 0) {
    for (let i = 0; i < opts.length; i++) { if ((opts[i].values || []).some(v => /europe/i.test(String(v)))) { idx = i; break; } }
    if (idx < 0) return p.variants || []; // sin opción de región: incluir todas
  }
  const key = 'option' + (idx + 1);
  return (p.variants || []).filter(v => /europe/i.test(String(v[key] || '')));
}

function cleanVt(t) { return String(t || '').replace(/ship to europe\s*\/?\s*/i, '').replace(/^\s*\/\s*/, '').trim() || 'Único'; }

function snapshot(products) {
  const items = [];
  for (const p of products) {
    if (!isFilament(p)) continue;
    const vs = euVariants(p);
    if (!vs.length) continue;
    const img = (p.images && p.images[0] && p.images[0].src) || '';
    items.push({
      id: p.id, handle: p.handle, title: p.title, img,
      variants: vs.map(v => ({
        id: v.id, sku: v.sku || '', vt: cleanVt(v.title),
        price: String(v.price || ''), cap: String(v.compare_at_price || ''),
        av: !!v.available
      }))
    });
  }
  items.sort((a, b) => a.id - b.id);
  return items;
}

function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; } }

function diff(prevProducts, nextProducts, ts) {
  const ev = [];
  const pv = new Map();
  for (const p of prevProducts) for (const v of p.variants) pv.set(String(v.id), { p, v });
  const seen = new Set();
  for (const p of nextProducts) {
    for (const v of p.variants) {
      const k = String(v.id); seen.add(k);
      const old = pv.get(k);
      const base = { ts, pid: p.id, vid: v.id, product: p.title, variant: v.vt, sku: v.sku, price: v.price };
      if (!old) { ev.push({ ...base, type: 'nuevo' }); continue; }
      if (!old.v.av && v.av) ev.push({ ...base, type: 'repuesto' });
      else if (old.v.av && !v.av) ev.push({ ...base, type: 'agotado' });
      if (String(old.v.price) !== String(v.price)) ev.push({ ...base, type: 'precio', from: String(old.v.price), to: String(v.price) });
    }
  }
  for (const [k, old] of pv) {
    if (!seen.has(k)) ev.push({ ts, pid: old.p.id, vid: old.v.id, product: old.p.title, variant: old.v.vt, sku: old.v.sku, price: old.v.price, type: 'retirado' });
  }
  return ev;
}

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const products = snapshot(await fetchAll());
  if (!products.length) throw new Error('0 filamentos capturados: aborto para no vaciar el snapshot.');
  const prev = readJson(LATEST, null);
  const ts = Date.now();
  let changes = readJson(CHANGES, []);
  if (!Array.isArray(changes)) changes = [];
  if (prev && Array.isArray(prev.products) && prev.products.length) {
    const ev = diff(prev.products, products, ts);
    if (ev.length) changes = ev.concat(changes);
    console.log('Cambios detectados:', ev.length);
  } else {
    console.log('Primera captura: sin diff.');
  }
  // Retención: solo los últimos 30 días (y tope de seguridad)
  changes = changes.filter(c => (ts - (c.ts || 0)) <= RETENTION_MS).slice(0, MAX_CHANGES);
  // Media de precios: acumula una muestra por captura y la incrusta en cada variante
  let stats = readJson(PRICES, {});
  if (!stats || typeof stats !== 'object') stats = {};
  for (const p of products) for (const v of p.variants) {
    const n = Number(String(v.price).replace(',', '.'));
    if (!isNaN(n) && n > 0) {
      const st = stats[String(v.id)] || { s: 0, n: 0 };
      st.s += n; st.n += 1; stats[String(v.id)] = st;
      v.avg = Math.round((st.s / st.n) * 100) / 100;
    }
  }
  fs.writeFileSync(PRICES, JSON.stringify(stats), 'utf8');
  fs.writeFileSync(LATEST, JSON.stringify({ fetched_at: new Date(ts).toISOString(), currency: CURRENCY, market: MARKET, products }), 'utf8');
  fs.writeFileSync(CHANGES, JSON.stringify(changes), 'utf8');
  const nv = products.reduce((a, p) => a + p.variants.length, 0);
  console.log('Snapshot OK:', products.length, 'productos /', nv, 'variantes EU. Registro:', changes.length, 'eventos (≤6 meses).');
}

main().catch(e => { console.error(e); process.exit(1); });
