/* ============================================================
   SILAB 3D · Configura tu proyecto · Tasadora · medidas independientes
   Reescala la malla en los ejes del propio archivo (largo, ancho y alto que ve el
   cliente), busca de nuevo la orientación de impresión y calcula sus rasgos con el
   motor del Presupuesto instantáneo (que no se modifica). Solo se usa cuando las
   tres medidas no guardan la proporción.
   ============================================================ */
import { OPCIONES, prepararMalla, orientaciones, rasgos } from './presupuesto-motor.js?v=20261002g';

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

self.onmessage = ({ data: { pos, f } }) => {
  try {
    const out = new Float32Array(pos.length);
    for (let k = 0; k < pos.length; k += 3) { out[k] = pos[k] * f[0]; out[k + 1] = pos[k + 1] * f[1]; out[k + 2] = pos[k + 2] * f[2]; }
    const m = prepararMalla(out), ori = orientaciones(m), r = {};
    for (const um of new Set(Object.values(OPCIONES.definicion).map((d) => d.umbral))) {
      const x = rasgos(m, ori.auto, um, true);
      delete x.B;
      x.triVoladizo = Int32Array.from(x.triVoladizo);
      x.zonas = zonasVoladizo(out, x.triVoladizo);
      r['auto|' + um] = x;
    }
    self.postMessage({ ok: true, r, u: ori.auto });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
