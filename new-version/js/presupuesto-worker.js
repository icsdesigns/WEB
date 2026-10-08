/* ============================================================
   SILAB 3D · Presupuesto instantáneo · trabajo en segundo plano
   Lee el archivo (STL, 3MF o STEP) y analiza la malla sin bloquear
   la página: orientación Auto (y Alternativa, solo si se pide) y sus
   rasgos para los umbrales de voladizo (uno por definición).
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

/* Descompresión nativa (DecompressionStream) de los archivos del 3MF que hacen falta: en un 3MF grande (100 MB de XML)
   es varias veces más rápida que fflate en JavaScript. Devuelve un objeto con la misma forma que fflate (unzipSync,
   strFromU8) para leer3MF, o null si el navegador no la tiene o el zip no se entiende (entonces se usa fflate). */
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
      if (tam === 0xffffffff || off === 0xffffffff) {   // tamaños ZIP64 en el campo extra 0x0001
        for (let x = p + 46 + ln; x + 4 <= p + 46 + ln + lx;) {
          const id = dv.getUint16(x, true), lon = dv.getUint16(x + 2, true);
          if (id === 1) {
            let q = x + 4;
            if (dv.getUint32(p + 24, true) === 0xffffffff) q += 8;   // tamaño sin comprimir
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

self.onmessage = async ({ data: { buf, ext, alternativa } }) => {
  try {
    let pos, colores = 1, mascara = null, matrizPurga = null, modificadores = [];
    if (ext === 'stl') pos = leerSTL(buf);
    else if (ext === '3mf') { const u8 = new Uint8Array(buf); ({ pos, colores, mascara, matrizPurga, modificadores } = leer3MF(u8, (await descomprimir3MF(u8)) || fflate)); }
    else { self.postMessage({ paso: 'Convirtiendo el STEP…' }); pos = await leerSTEP(buf); }
    if (!pos || pos.length < 9) throw new Error('vacío');
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error('coordenadas no válidas');
    self.postMessage({ paso: 'Analizando el modelo…' });
    const m = prepararMalla(pos);
    // 3MF pintado: color de cada triángulo y purga del proyecto, para contar los cambios por capa
    m.mascara = mascara; m.matrizPurga = matrizPurga;
    const ori = orientaciones(m);
    const umbrales = [...new Set(Object.values(OPCIONES.definicion).map((d) => d.umbral))];
    const r = {};
    // La página usa siempre la orientación Auto (el grupo «Orientación» está oculto): la alternativa solo se analiza si se
    // pide (alternativa: true); así no se gasta casi la mitad del análisis en una orientación que no se muestra.
    for (const clave of alternativa ? ['auto', 'alternativa'] : ['auto']) for (const um of umbrales) {
      const x = rasgos(m, ori[clave], um, true);
      delete x.B;
      x.triVoladizo = Int32Array.from(x.triVoladizo);
      r[clave + '|' + um] = x;
    }
    self.postMessage({ ok: true, pos, colores, modificadores, u: { auto: ori.auto, alternativa: ori.alternativa }, r, volumen: m.volumen }, [pos.buffer]);
  } catch (e) {
    self.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
