/* ============================================================
   SILAB 3D · Configura tu proyecto · Tasadora · análisis en segundo plano
   Lee un archivo (STL, STEP o 3MF) y analiza cada cama con el motor del Presupuesto
   instantáneo (que no se modifica). Un 3MF de Bambu/Orca con varias camas se divide en
   una cama por placa (según el reparto de objetos de Metadata/model_settings.config);
   STL y STEP, y los 3MF de una sola placa, dan una única cama.
   La lectura de archivos es la del trabajador del Presupuesto instantáneo.
   ============================================================ */
import * as fflate from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/fflate.module.js';
import { leer3MF, archivoNecesario3MF } from './presupuesto-3mf.js?v=20261002f';
import { OPCIONES, prepararMalla, orientaciones, rasgos } from './presupuesto-motor.js?v=20261002g';

const OCCT = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
let occt = null;

function leerSTL(buf) {
  const dv = new DataView(buf);
  const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (84 + n * 50 === buf.byteLength) {
    const out = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
    return out;
  }
  const txt = new TextDecoder().decode(buf), v = [];
  for (const m of txt.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
  return Float32Array.from(v);
}

/* Descompresión nativa (DecompressionStream) de los archivos del 3MF que hacen falta; null si no se puede (se usa fflate) */
async function descomprimir3MF(u8) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) return null;
    let n = dv.getUint16(e + 10, true), cd = dv.getUint32(e + 16, true);
    if (n === 0xffff || cd === 0xffffffff) {   // ZIP64
      const l = e - 20;
      if (l < 0 || dv.getUint32(l, true) !== 0x07064b50) return null;
      const z = Number(dv.getBigUint64(l + 8, true));
      n = Number(dv.getBigUint64(z + 32, true)); cd = Number(dv.getBigUint64(z + 48, true));
    }
    const dec = new TextDecoder(), tareas = [];
    for (let k = 0, p = cd; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) return null;
      const metodo = dv.getUint16(p + 10, true), ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
      let tam = dv.getUint32(p + 20, true), off = dv.getUint32(p + 42, true);
      const nombre = dec.decode(u8.subarray(p + 46, p + 46 + ln));
      if (tam === 0xffffffff || off === 0xffffffff) {
        for (let x = p + 46 + ln; x + 4 <= p + 46 + ln + lx;) {
          const id = dv.getUint16(x, true), lon = dv.getUint16(x + 2, true);
          if (id === 1) {
            let q = x + 4;
            if (dv.getUint32(p + 24, true) === 0xffffffff) q += 8;
            if (tam === 0xffffffff) { tam = Number(dv.getBigUint64(q, true)); q += 8; }
            if (off === 0xffffffff) off = Number(dv.getBigUint64(q, true));
          }
          x += 4 + lon;
        }
      }
      p += 46 + ln + lx + lc;
      if (!archivoNecesario3MF(nombre)) continue;
      if (dv.getUint32(off, true) !== 0x04034b50) return null;
      const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), datos = u8.subarray(ini, ini + tam);
      if (metodo === 0) tareas.push(Promise.resolve([nombre, datos]));
      else if (metodo === 8) tareas.push(new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then((b) => [nombre, new Uint8Array(b)]));
      else return null;
    }
    const archivos = Object.fromEntries(await Promise.all(tareas));
    return { unzipSync: (_, { filter } = {}) => Object.fromEntries(Object.entries(archivos).filter(([name]) => !filter || filter({ name }))), strFromU8: fflate.strFromU8 };
  } catch (e) { return null; }
}

async function leerSTEP(buf) {
  if (!occt) {
    const js = await fetch(OCCT + 'occt-import-js.js').then((r) => r.text());
    (0, eval)(js + '\n;self.occtimportjs = occtimportjs;');
    occt = await self.occtimportjs({ locateFile: (f) => OCCT + f });
  }
  const res = occt.ReadStepFile(new Uint8Array(buf), null);
  if (!res.success) throw new Error('STEP');
  let total = 0;
  for (const m of res.meshes) total += m.index.array.length * 3;
  const out = new Float32Array(total);
  let o = 0;
  for (const m of res.meshes) {
    const p = m.attributes.position.array, idx = m.index.array;
    for (let i = 0; i < idx.length; i++, o += 3) { out[o] = p[idx[i] * 3]; out[o + 1] = p[idx[i] * 3 + 1]; out[o + 2] = p[idx[i] * 3 + 2]; }
  }
  return out;
}

/* Camas de un 3MF de Bambu/Orca: cada <plate> de model_settings.config lista sus objetos (object_id).
   Devuelve [{ n, nombre, ids }] solo con las camas que tienen objetos. */
function detectarPlacas(zip, u8) {
  const cfg = Object.entries(zip.unzipSync(u8, { filter: (f) => /model_settings\.config$/i.test(f.name) })).map(([, d]) => zip.strFromU8(d)).join('\n');
  const placas = [];
  for (const m of cfg.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const ids = new Set([...m[1].matchAll(/key="object_id"\s+value="(\d+)"/g)].map((x) => x[1]));
    if (!ids.size) continue;
    const n = (/key="plater_id"\s+value="(\d+)"/.exec(m[1]) || [])[1];
    const nombre = (/key="plater_name"\s+value="([^"]+)"/.exec(m[1]) || [])[1] || '';
    placas.push({ n: n ? +n : placas.length + 1, nombre, ids });
  }
  return placas;
}
/* Mismo zip, pero con solo los objetos de una cama en <build> */
function soloCama(zip, ids) {
  return {
    unzipSync: (...a) => zip.unzipSync(...a),
    strFromU8: (d) => {
      const t = zip.strFromU8(d);
      return /<build\b/.test(t) ? t.replace(/<item\b[^>]*objectid="(\d+)"[^>]*>/g, (m, id) => (ids.has(id) ? m : '')) : t;
    }
  };
}

/* Zonas de soporte: grupos de caras en voladizo conectadas entre sí (comparten algún vértice). Cada zona es un
   soporte que hay que retirar y una marca que limpiar: con ellas se elige el nivel de post-procesado. */
function zonasVoladizo(pos, tris) {
  const padre = new Int32Array(tris.length).map((_, i) => i);
  const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const visto = new Map();
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3, clave = pos[o].toFixed(3) + ',' + pos[o + 1].toFixed(3) + ',' + pos[o + 2].toFixed(3);
      const j = visto.get(clave);
      if (j === undefined) visto.set(clave, i); else { const a = raiz(i), b = raiz(j); if (a !== b) padre[a] = b; }
    }
  });
  let n = 0; for (let i = 0; i < tris.length; i++) if (raiz(i) === i) n++;
  return n;
}

function analizarCama(nombre, placa, leido) {
  const { pos, colores = 1, mascara = null, matrizPurga = null, modificadores = [] } = leido;
  if (!pos || pos.length < 9) throw new Error('vacío');
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error('coordenadas no válidas');
  const m = prepararMalla(pos);
  m.mascara = mascara; m.matrizPurga = matrizPurga;
  const ori = orientaciones(m);
  const r = {};
  for (const um of new Set(Object.values(OPCIONES.definicion).map((d) => d.umbral))) {
    const x = rasgos(m, ori.auto, um, true);
    delete x.B;
    x.triVoladizo = Int32Array.from(x.triVoladizo);
    x.zonas = zonasVoladizo(pos, x.triVoladizo);
    r['auto|' + um] = x;
  }
  // Medidas en los ejes del propio archivo (las que ve el cliente); la orientación de impresión (u) solo se usa para calcular
  const dims = [0, 1, 2].map((k) => m.max[k] - m.min[k]);
  return { nombre, placa, pos, colores, modificadores, u: ori.auto, r, dims };
}

self.onmessage = async ({ data: { buf, ext, nombre } }) => {
  try {
    const camas = [];
    if (ext === 'stl' || ext === 'step') {
      if (ext === 'step') self.postMessage({ paso: 'Convirtiendo el STEP…' });
      self.postMessage({ paso: 'Analizando el modelo…' });
      camas.push(analizarCama(nombre, null, { pos: ext === 'stl' ? leerSTL(buf) : await leerSTEP(buf) }));
    } else {
      const u8 = new Uint8Array(buf), zip = (await descomprimir3MF(u8)) || fflate;
      let placas = [];
      try { placas = detectarPlacas(zip, u8); } catch (e) { placas = []; }
      if (placas.length < 2) {
        self.postMessage({ paso: 'Analizando el modelo…' });
        camas.push(analizarCama(nombre, null, leer3MF(u8, zip)));
      } else {
        for (let i = 0; i < placas.length; i++) {
          self.postMessage({ paso: 'Analizando la cama ' + (i + 1) + ' de ' + placas.length + '…' });
          const p = placas[i];
          let leido;
          try { leido = leer3MF(u8, soloCama(zip, p.ids)); } catch (e) { continue; }
          if (!leido.pos || leido.pos.length < 9) continue;
          camas.push(analizarCama(nombre + ' · ' + (p.nombre || 'cama ' + p.n), p.n, leido));
        }
        if (!camas.length) throw new Error('vacío');
      }
    }
    self.postMessage({ ok: true, camas }, camas.map((c) => c.pos.buffer));
  } catch (e) {
    self.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
