/* ============================================================
   SILAB 3D · Visualizador · Formato .s3dv (modelo de una opción)
   El panel admin convierte cada cama del 3MF en un archivo pequeño
   que la web descarga y dibuja al momento:
     gzip( "S3DV" · versión u32 · largo u32 · JSON · bloques )
   JSON = { bbox: [x0,y0,z0,x1,y1,z1] (mm), slots: [{ slot, hex, trozos: [[vértices, triángulos]…] }] }
   Cada trozo (≤ 65 535 vértices): posiciones Uint16 cuantizadas en la
   caja (precisión < 0,005 mm en una cama entera) guardadas como
   diferencia con el vértice anterior, e índices Uint16 guardados como
   «último vértice nuevo − índice» (casi siempre 0 o pequeño). Cada
   bloque va en dos planos (bytes altos y luego bajos) para que gzip
   lo comprima mucho más. Bloques alineados a 4 bytes. Sin DOM.
   ============================================================ */

const MAGIA = 0x56443353; // «S3DV» en little-endian
const VERSION = 1;
const MAXV = 65535;
const al4 = (n) => (n + 3) & ~3;

async function comprimir(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function descomprimir(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8; // ya descomprimido (servidor con Content-Encoding)
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Uint16Array → bytes altos seguidos de bytes bajos (y al revés)
function planos(u) {
  const out = new Uint8Array(u.length * 2), n = u.length;
  for (let i = 0; i < n; i++) { out[i] = u[i] >> 8; out[n + i] = u[i] & 255; }
  return out;
}
function desplanar(b, n) {
  const u = new Uint16Array(n);
  for (let i = 0; i < n; i++) u[i] = (b[i] << 8) | b[n + i];
  return u;
}

// Parte una malla indexada (Uint32) en trozos de ≤ 65 535 vértices
function trocear(pos, idx) {
  const nv = pos.length / 3, mapa = new Int32Array(nv), sello = new Int32Array(nv).fill(-1);
  const trozos = [];
  let t = 0;
  while (t < idx.length) {
    const vs = [], ix = [];
    const id = trozos.length;
    for (; t < idx.length; t += 3) {
      let nuevos = 0;
      for (let k = 0; k < 3; k++) if (sello[idx[t + k]] !== id) nuevos++;
      if (vs.length / 3 + nuevos > MAXV) break;
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        if (sello[v] !== id) { sello[v] = id; mapa[v] = vs.length / 3; vs.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
        ix.push(mapa[v]);
      }
    }
    trozos.push({ pos: vs, idx: ix });
  }
  return trozos;
}

/* malla = { bbox, slots: [{ slot, hex, pos: Float32Array, idx: Uint32Array }] } → Uint8Array (gzip) */
export async function codificar(malla) {
  const b = malla.bbox, esc = [0, 1, 2].map((c) => (b[c + 3] - b[c]) || 1);
  const cab = { bbox: b, slots: [] }, bloques = [];
  for (const s of malla.slots) {
    const ts = trocear(s.pos, s.idx);
    cab.slots.push({ slot: s.slot, hex: s.hex, trozos: ts.map((x) => [x.pos.length / 3, x.idx.length / 3]) });
    for (const x of ts) {
      const q = new Uint16Array(x.pos.length);
      let ant = [0, 0, 0];
      for (let i = 0; i < x.pos.length; i++) {
        const v = Math.round(((x.pos[i] - b[i % 3]) / esc[i % 3]) * 65535);
        q[i] = (v - ant[i % 3]) & 0xffff; ant[i % 3] = v;
      }
      const ix = new Uint16Array(x.idx.length);
      let h = 0;
      for (let i = 0; i < ix.length; i++) { ix[i] = (h - x.idx[i]) & 0xffff; if (x.idx[i] === h) h++; }
      bloques.push(planos(q), planos(ix));
    }
  }
  const json = new TextEncoder().encode(JSON.stringify(cab));
  let total = 12 + al4(json.length);
  for (const q of bloques) total += al4(q.length);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIA, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, json.length, true);
  out.set(json, 12);
  let o = 12 + al4(json.length);
  for (const q of bloques) { out.set(q, o); o += al4(q.length); }
  return comprimir(out);
}

/* ArrayBuffer del .s3dv → { bbox, slots: [{ slot, hex, trozos: [{ pos: Float32Array, idx: Uint16Array }] }] } */
export async function decodificar(buf) {
  const u8 = await descomprimir(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== MAGIA) throw new Error('El archivo del modelo no es válido');
  if (dv.getUint32(4, true) > VERSION) throw new Error('El modelo es de una versión más nueva del visualizador');
  const nj = dv.getUint32(8, true);
  const cab = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + nj)));
  const b = cab.bbox, esc = [0, 1, 2].map((c) => ((b[c + 3] - b[c]) || 1) / 65535);
  let o = u8.byteOffset + 12 + al4(nj);
  const leer = (n) => { const r = desplanar(new Uint8Array(u8.buffer, o, n * 2), n); o += al4(n * 2); return r; };
  const slots = cab.slots.map((s) => ({
    slot: s.slot, hex: s.hex,
    trozos: s.trozos.map(([nv, nt]) => {
      const q = leer(nv * 3), idx = leer(nt * 3), pos = new Float32Array(nv * 3);
      const ant = [0, 0, 0];
      for (let i = 0; i < q.length; i++) { const c = i % 3; ant[c] = (ant[c] + q[i]) & 0xffff; pos[i] = b[c] + ant[c] * esc[c]; }
      let h = 0;
      for (let i = 0; i < idx.length; i++) { const v = (h - idx[i]) & 0xffff; idx[i] = v; if (v === h) h++; }
      return { pos, idx };
    })
  }));
  return { bbox: b, slots };
}

// Malla recién construida (sin pasar por archivo) con el mismo aspecto que la decodificada, para la vista previa del panel
export function comoDecodificada(malla) {
  return { bbox: malla.bbox, slots: malla.slots.map((s) => ({ slot: s.slot, hex: s.hex, trozos: trocear(s.pos, s.idx).map((x) => ({ pos: Float32Array.from(x.pos), idx: Uint16Array.from(x.idx) })) })) };
}
