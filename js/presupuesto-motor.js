/* ============================================================
   SILAB 3D · Motor del Presupuesto instantáneo
   Estima gramos de filamento y tiempo de impresión a partir de la
   malla (triángulos) sin laminar, con las variables del cliente:
   orientación, definición, refuerzo de pared, densidad, soportes,
   color y altura.

   Módulo puro (sin DOM ni three.js): lo usa la página y también el
   script de calibración en Node, así que lo que se calibra es
   exactamente lo que se publica.

   Modelo físico:
     paredes   = n_paredes · ancho_línea · Σ área·|sen θ|   (con tope suave en secciones
                 estrechas: las paredes no pueden pasar del volumen de la pieza)
     pieles    = Σ área_arriba·espesor_sup + Σ área_abajo·espesor_inf
     relleno   = (volumen − paredes − pieles) · densidad
     soportes  = Σ área_voladizo·|cos θ|·altura_libre (con trazado de rayos), con respuesta
                 cóncava (los soportes de árbol pequeños pesan más que su volumen proyectado)
     tiempo    = Σ términos físicos (paredes, pieles, relleno, soportes) + capas + islas por capa,
                 con suelo de 8 s por capa y techo de velocidad mínima de laminado
   Los coeficientes K se ajustan contra laminados reales
   (ver CALIBRACION en el plan) y se guardan en COEF.
   ============================================================ */

/* Perfiles de la impresora de referencia: Bambu Lab A1, boquilla 0.4,
   PLA genérico. Preset base de SILAB (decisión de Iván, 30/09/2026):
   «0.12mm High Quality @BBL A1» para las tres definiciones; solo cambia
   la altura de capa (y perímetros, relleno y soportes según el cliente). */
export const IMPRESORA = {
  nombre: 'Bambu Lab A1 0.4',
  cama: [256, 256, 256],
  densidadPLA: 1.24,          // g/cm³
  caudalMax: 12,              // mm³/s (Generic PLA @BBL A1)
  preparacion: 260,           // s · rutina de inicio (nivelado, limpieza)
  cambioFilamento: 54,        // s · carga 25 + descarga 29 (AMS lite)
  purgaPorCambio: 300         // mm³ · media de la matriz de purgado
};

export const OPCIONES = {
  orientacion: {
    auto:        { rotulo: 'Auto',        ayuda: 'Posición recomendada' },
    alternativa: { rotulo: 'Alternativa', ayuda: 'Segunda posición recomendada' }
  },
  definicion: {
    impecable: { rotulo: 'Impecable', ayuda: '0,08 mm', lh: 0.08, capasSup: 5, capasInf: 5, espSup: 0.6, umbral: 20,
                 vel: { pared: 60, paredInt: 150, relleno: 180, solido: 180, soporte: 150 } },
    elevada:   { rotulo: 'Elevada',   ayuda: '0,12 mm', lh: 0.12, capasSup: 5, capasInf: 5, espSup: 0.6, umbral: 20,
                 vel: { pared: 60, paredInt: 150, relleno: 180, solido: 180, soporte: 150 } },
    normal:    { rotulo: 'Normal',    ayuda: '0,20 mm', lh: 0.20, capasSup: 5, capasInf: 5, espSup: 0.6, umbral: 20,
                 vel: { pared: 60, paredInt: 150, relleno: 180, solido: 180, soporte: 150 } }
  },
  pared: {
    reducido:  { rotulo: 'Reducido',  ayuda: '2 perímetros', n: 2 },
    normal:    { rotulo: 'Normal',    ayuda: '3 perímetros', n: 3 },
    reforzado: { rotulo: 'Reforzado', ayuda: '4 perímetros', n: 4 }
  },
  densidad: {
    ligero:   { rotulo: 'Ligero',   ayuda: '10 % de relleno', d: 0.10 },
    normal:   { rotulo: 'Normal',   ayuda: '20 % de relleno', d: 0.20 },
    compacto: { rotulo: 'Compacto', ayuda: '75 % de relleno', d: 0.75 }
  },
  soportes: {
    si: { rotulo: 'Sí', ayuda: 'Con voladizos' },
    no: { rotulo: 'No', ayuda: 'Sin voladizos' }
  },
  color: {
    mono:  { rotulo: 'Monocolor',  ayuda: '1 color por pieza' },
    multi: { rotulo: 'Multicolor', ayuda: 'Varios colores' }
  },
  altura: {
    predeterminada: { rotulo: 'Predeterminada', ayuda: 'La del archivo' },
    personalizada:  { rotulo: 'Personalizada',  ayuda: 'Escala uniforme' }
  }
};

/* Coeficientes de calibración. Sustituidos por el ajuste contra la
   base de datos de laminados (calibrar.mjs escribe estos valores). */
export const COEF = {
  version: '2026-10-01 · 1035 laminados de 20 piezas (Bambu Studio, A1 0.4, preset 0.12mm High Quality, orientación auto)',
  g: { pared: 1.0108, piel: 0.8551, relleno: 0.9186, soporte: 0.0172, interfaz: 0.2715, raiz: 37.1948, fijo: 0.0947 },
  t: { fijo: 57.8219, pared: 1.3319, piel: 0.7052, soporte: 3.5922, capa: 1.0648, isla: 1.1495, islaP: 0.112 },
  tRelleno: { ligero: 1.3387, normal: 2.528, compacto: 4.8164 },
  tDefinicion: { impecable: 1.0838, elevada: 1.1135, normal: 1.1166 },
  // multicolor: ajustado (validar_multicolor.mjs AJUSTE=1) con 270 pares multicolor/monocolor de 5 piezas laminadas (1, 3, 5, 7, 9);
  // respaldo sin pintura: mediana por pieza de cambios / ((colores − 1) · capas) y de purga por cambio
  multicolor: { purga: 0.818, torre: 0.001, segCambio: 58.2, segPurga: 0.132, segCapa: 0.35, respaldoMm3: 255, fraccionCapas: 0.33, colores: 2 },
  error: { gramos: 0.0299, tiempo: 0.0937, gramos90: 0.0929, tiempo90: 0.2244, confianza: 0.9126, n: 1035, modelos: 20 }
};

const LW_PARED = 0.44, LW_RELLENO = 0.45, LW_PIEL = 0.42;
const CAPA_MIN_S = 8;       // s · tiempo mínimo por capa (enfriamiento: slow_down_layer_time del perfil)
const VEL_MIN = 13;         // mm/s · velocidad media mínima de laminado: techo de tiempo en piezas muy finas
const PUENTE_MM = 5;        // mm · techos casi planos con menos hueco debajo se puentean (sin soporte)
const SOP_ALTO_MIN = 1;     // mm · hueco libre mínimo para que haya soporte bajo un voladizo
const VEL_CAPA_MIN = 20;    // mm/s · velocidad mínima de laminado al frenar una capa corta (slow_down_min_speed del perfil)
export const TIEMPO_LIM = { capaMin: CAPA_MIN_S, velMin: VEL_MIN, velCapaMin: VEL_CAPA_MIN };   // los usa la calibración

/* ---------- Malla ----------
   pos: Float32Array con 9 valores por triángulo (sin índices). */
export function prepararMalla(pos) {
  const n = (pos.length / 9) | 0;
  const nrm = new Float32Array(n * 3), area = new Float32Array(n);
  let vol = 0, areaTotal = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    const cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    const a = l / 2;
    if (l > 0) { nx /= l; ny /= l; nz /= l; }
    nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;
    area[i] = a; areaTotal += a;
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    for (let k = 0; k < 9; k++) { const c = k % 3, v = pos[o + k]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
  }
  // Normales hacia dentro (malla invertida): se corrige el signo
  if (vol < 0) { for (let i = 0; i < nrm.length; i++) nrm[i] = -nrm[i]; vol = -vol; }
  return { pos, n, nrm, area, volumen: vol, areaTotal, min, max };
}

/* Base ortonormal con z' = arriba (u) */
function base(u) {
  const t = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let x = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
  const lx = Math.hypot(...x); x = x.map(v => v / lx);
  const y = [u[1] * x[2] - u[2] * x[1], u[2] * x[0] - u[0] * x[2], u[0] * x[1] - u[1] * x[0]];
  return { x, y, z: u };
}

/* Rasgos geométricos de la pieza con 'arriba' = u.
   umbralVoladizo: ángulo (desde la horizontal) por debajo del cual una
   cara que mira hacia abajo necesita soporte. */
export function rasgos(m, u, umbralVoladizo = 30, conRayos = false, paso = 1) {
  const { pos, n, nrm, area } = m;
  const B = base(u);
  // Una cara con pendiente α (desde la horizontal) tiene nz = −cos α;
  // necesita soporte si α < umbral  ⇔  nz < −cos(umbral)
  const cosU = Math.cos(umbralVoladizo * Math.PI / 180);
  let zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k < pos.length; k += (k % 9 === 6 ? 3 + (paso - 1) * 9 : 3)) {
    const z = pos[k] * u[0] + pos[k + 1] * u[1] + pos[k + 2] * u[2];
    const x = pos[k] * B.x[0] + pos[k + 1] * B.x[1] + pos[k + 2] * B.x[2];
    const y = pos[k] * B.y[0] + pos[k + 1] * B.y[1] + pos[k + 2] * B.y[2];
    if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  // cruces: Σ altura de cada cara lateral = nº de tramos de perímetro × capa;
  // mide lo «detallada» que es la pieza (más tramos = más aceleraciones y viajes)
  let aLat = 0, aArriba = 0, aAbajo = 0, aBase = 0, aVol = 0, aTecho = 0, volSopCota = 0, cruces = 0;
  const vol = [];
  for (let i = 0; i < n; i += paso) {
    const c = nrm[i * 3] * u[0] + nrm[i * 3 + 1] * u[1] + nrm[i * 3 + 2] * u[2];
    const a = area[i] * paso;
    const o = i * 9;
    const z0 = pos[o] * u[0] + pos[o + 1] * u[1] + pos[o + 2] * u[2];
    const z1 = pos[o + 3] * u[0] + pos[o + 4] * u[1] + pos[o + 5] * u[2];
    const z2 = pos[o + 6] * u[0] + pos[o + 7] * u[1] + pos[o + 8] * u[2];
    aLat += a * Math.sqrt(Math.max(0, 1 - c * c));
    if (c > -0.98 && c < 0.98) cruces += (Math.max(z0, z1, z2) - Math.min(z0, z1, z2)) * paso;
    if (c > 0) aArriba += a * c;
    else if (c < 0) {
      aAbajo += -a * c;
      const zc = (z0 + z1 + z2) / 3 - zmin;
      if (Math.max(z0, z1, z2) - zmin < 0.1 && c < -0.98) aBase += a;
      else if (c < -cosU && zc > 0.3) { aVol += -a * c; if (c < -0.9986) aTecho += -a * c; volSopCota += -a * c * zc; vol.push(i); }
    }
  }
  // volSop/aVol: voladizo bruto. volSopE/aSopE: solo lo que Bambu llega a soportar (hueco libre ≥ 1 mm y,
  // en techos casi planos, ≥ 5 mm: por debajo se puentean)
  let volSop = volSopCota, volSopE = volSopCota, aSopE = aVol;
  const PR = conRayos ? proyectar(m, u, B, zmin) : null;
  if (conRayos && vol.length) {
    const h = alturasLibres(m, u, B, zmin, PR);
    volSop = 0; volSopE = 0; aSopE = 0;
    for (const i of vol) {
      const c = -(nrm[i * 3] * u[0] + nrm[i * 3 + 1] * u[1] + nrm[i * 3 + 2] * u[2]);
      const hi = Number.isNaN(h[i]) ? 0 : h[i];
      volSop += area[i] * c * hi;
      if ((c > 0.9986 && hi < PUENTE_MM) || hi < SOP_ALTO_MIN) continue;
      volSopE += area[i] * c * hi; aSopE += area[i] * c;
    }
  }
  const cortes = conRayos ? contornosPorCapa(m, u, B, zmin, zmax - zmin, PR) : null;
  const bucles = cortes ? cortes.bucles : 1;
  // 3MF pintado: cambios de color por altura de capa (una por definición)
  // Malla vacía o sin vértices válidos: medidas nulas (evita −Infinity y NaN aguas abajo)
  if (!(zmax >= zmin)) { zmin = zmax = xmin = xmax = ymin = ymax = 0; }
  const pintura = conRayos && m.mascara ? cambiosColor(m, u, [...new Set(Object.values(OPCIONES.definicion).map((d) => d.lh))]) : null;
  return {
    bucles, cortes, pintura, u, B,
    // Malla no válida (volumen mayor que la caja o no positivo: carcasas solapadas, normales invertidas): la página puede avisar
    mallaNoValida: !(m.volumen > 0) || m.volumen > 1.02 * (zmax - zmin) * (xmax - xmin) * (ymax - ymin), zmin, alto: zmax - zmin, ancho: xmax - xmin, fondo: ymax - ymin,
    volumen: m.volumen, cruces, aLat, aArriba, aAbajo, aBase, aVol, aTecho, volSop, volSopE, aSopE, volSopCota, triVoladizo: vol
  };
}

/* Contornos por capa: se corta la malla con 12 planos horizontales (a mitad de cada
   franja de altura) y se cuentan los bucles cerrados de cada corte (islas y huecos).
   Mide lo «fragmentada» que es la pieza: cada bucle exige su propio viaje, retracción
   y arranque en el laminador. Los bucles de menos de 2 mm (fisuras de la malla en las
   caras inclinadas) se ignoran. Devuelve la media de bucles por capa. */
const PLANOS_CORTE = 12, BUCLE_MIN = 2;
/* Vértices en la base de la orientación (x, y y altura sobre zmin), en Float32. Los comparten los contornos y las
   alturas libres, que antes los calculaban por separado. */
function proyectar(m, u, B, zmin) {
  const { pos, n } = m, nv = n * 3, X = new Float32Array(nv), Y = new Float32Array(nv), Z = new Float32Array(nv);
  for (let v = 0, k = 0; v < nv; v++, k += 3) {
    const a = pos[k], b = pos[k + 1], c = pos[k + 2];
    X[v] = a * B.x[0] + b * B.x[1] + c * B.x[2]; Y[v] = a * B.y[0] + b * B.y[1] + c * B.y[2]; Z[v] = a * u[0] + b * u[1] + c * u[2] - zmin;
  }
  return { X, Y, Z };
}
function contornosPorCapa(m, u, B, zmin, alto, PR) {
  const { n } = m;
  if (!(alto > 0) || !(n > 0)) return { bucles: 1, P: [1], A: [1], B: [1] };
  const { X, Y, Z } = PR || proyectar(m, u, B, zmin);
  let suma = 0;
  const CP = [], CA = [], CB = [];
  const { nrm } = m;
  // Una sola pasada por la malla: cada triángulo deja su segmento en los planos que cruza (antes, 12 pasadas).
  // Los segmentos de cada plano quedan en el mismo orden que antes (por triángulo), así que el resultado es idéntico.
  const zs = new Float64Array(PLANOS_CORTE), seg = [], cuenta = new Int32Array(PLANOS_CORTE), hz = alto / PLANOS_CORTE;
  for (let s = 0; s < PLANOS_CORTE; s++) { zs[s] = alto * (s + 0.5) / PLANOS_CORTE + 1e-4; seg.push(new Float64Array(4096)); }
  for (let i = 0; i < n; i++) {
    const a = i * 3, z0 = Z[a], z1 = Z[a + 1], z2 = Z[a + 2];
    const lo = z0 < z1 ? (z0 < z2 ? z0 : z2) : (z1 < z2 ? z1 : z2), hi = z0 > z1 ? (z0 > z2 ? z0 : z2) : (z1 > z2 ? z1 : z2);
    const s0 = Math.max(0, Math.floor(lo / hz - 0.5) - 1), s1 = Math.min(PLANOS_CORTE - 1, Math.ceil(hi / hz - 0.5) + 1);
    for (let s = s0; s <= s1; s++) {
      const z = zs[s];
      const za = z0 - z, zb = z1 - z, zc = z2 - z;
      if ((za > 0 && zb > 0 && zc > 0) || (za < 0 && zb < 0 && zc < 0)) continue;
      let q = 0, p0x = 0, p0y = 0, p1x = 0, p1y = 0;
      for (let e = 0; e < 3; e++) {
        let P = a + e, Q = a + (e + 1) % 3;
        if ((Z[P] > z) === (Z[Q] > z)) continue;
        if (Z[P] > Z[Q] || (Z[P] === Z[Q] && X[P] > X[Q])) { const t = P; P = Q; Q = t; }  // mismo orden en las dos caras de la arista
        const t = (z - Z[P]) / (Z[Q] - Z[P]), px = X[P] + t * (X[Q] - X[P]), py = Y[P] + t * (Y[Q] - Y[P]);
        if (q === 0) { p0x = px; p0y = py; } else { p1x = px; p1y = py; }
        q++;
      }
      if (q !== 2) continue;
      let sx = seg[s], ns = cuenta[s];
      if ((ns + 1) * 4 > sx.length) { const t = new Float64Array(sx.length * 2); t.set(sx); seg[s] = sx = t; }
      // orientación: la normal exterior queda a la derecha del sentido de recorrido (área firmada > 0 en contornos exteriores)
      const nx = nrm[i * 3] * B.x[0] + nrm[i * 3 + 1] * B.x[1] + nrm[i * 3 + 2] * B.x[2], ny = nrm[i * 3] * B.y[0] + nrm[i * 3 + 1] * B.y[1] + nrm[i * 3 + 2] * B.y[2];
      if ((p1y - p0y) * nx - (p1x - p0x) * ny < 0) { sx[ns * 4] = p1x; sx[ns * 4 + 1] = p1y; sx[ns * 4 + 2] = p0x; sx[ns * 4 + 3] = p0y; }
      else { sx[ns * 4] = p0x; sx[ns * 4 + 1] = p0y; sx[ns * 4 + 2] = p1x; sx[ns * 4 + 3] = p1y; }
      cuenta[s] = ns + 1;
    }
  }
  for (let s = 0; s < PLANOS_CORTE; s++) {
    const sx = seg[s], ns = cuenta[s];
    // Unión de segmentos que comparten extremo (1 µm): cada componente es un bucle
    // Tabla hash propia (direccionamiento abierto sobre arrays tipados) con la misma clave que antes: en mallas de
    // millones de triángulos un Map con cientos de miles de claves numéricas tardaba segundos por plano.
    const padre = new Int32Array(ns), largo = new Float64Array(ns);
    let cap = 16; while (cap < ns * 4) cap *= 2;
    const mask = cap - 1, CLAVE = new Float64Array(cap), VAL = new Int32Array(cap).fill(-1);
    for (let i = 0; i < ns; i++) padre[i] = i;
    const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
    for (let i = 0; i < ns; i++) {
      largo[i] = Math.hypot(sx[i * 4 + 2] - sx[i * 4], sx[i * 4 + 3] - sx[i * 4 + 1]);
      for (let e = 0; e < 2; e++) {
        const kx = Math.round(sx[i * 4 + e * 2] * 1000), ky = Math.round(sx[i * 4 + e * 2 + 1] * 1000), k = kx * 4194304 + ky;
        let h = (Math.imul(kx | 0, 0x9E3779B1) ^ Math.imul(ky | 0, 0x85EBCA77)) & mask;
        while (VAL[h] >= 0 && CLAVE[h] !== k) h = (h + 1) & mask;
        if (VAL[h] < 0) { CLAVE[h] = k; VAL[h] = i; } else { const j = VAL[h], a = raiz(i), b = raiz(j); if (a !== b) padre[a] = b; }
      }
    }
    const perim = new Float64Array(ns), areaB = new Float64Array(ns);
    for (let i = 0; i < ns; i++) { const q = raiz(i); perim[q] += largo[i]; areaB[q] += 0.5 * (sx[i * 4] * sx[i * 4 + 3] - sx[i * 4 + 2] * sx[i * 4 + 1]); }
    let pS = 0, aS = 0, bS = 0;
    for (let i = 0; i < ns; i++) if (padre[i] === i && perim[i] >= BUCLE_MIN) { suma++; bS++; pS += perim[i]; aS += areaB[i]; }
    CP.push(pS); CA.push(Math.max(0, aS)); CB.push(bS);
  }
  return { bucles: suma / PLANOS_CORTE, P: CP, A: CA, B: CB };
}

/* Cambios de color de un 3MF pintado (mascara: bit e = el triángulo se imprime con el extrusor e), con la regla
   de Bambu Studio medida en sus laminados (slice_info.config > layer_filament_lists y filament_sequence.json):
   · cada capa se corta por su plano medio (la primera capa mide 0,2 mm; las demás, lh);
   · un color está en la capa si su corte mide al menos 1 mm (las caras horizontales cuentan área / 0,4 mm):
     los restos de pintura de menos de un trazo no provocan cambio;
   · dentro de la capa los colores se ordenan para purgar lo mínimo según la matriz de purga del proyecto
     (todas las permutaciones hasta 5 colores; con más, el vecino más cercano), empezando por el color con que
     acabó la capa anterior si sigue presente: hay un cambio por cada color extra de la capa y uno más si el
     último color de la capa anterior no está.
   Las tres alturas de capa se miden en una sola pasada por la malla.
   Devuelve, por altura de capa: { cambios, flush (mm³ purgados, matriz × flush_multiplier; null sin matriz),
   capas, capasMulti, colores }. */
const MC_TRAZO = 0.4, MC_MIN = 1, MC_PERM = 5;
export function cambiosColor(m, u, alturas) {
  const lista = Array.isArray(alturas) ? alturas : [alturas];
  const { pos, mascara, matrizPurga } = m, n = mascara.length;
  // Colores presentes (bit → índice compacto)
  let union = 0;
  for (let i = 0; i < n; i++) union |= mascara[i];
  const ext = [];
  for (let b = 0; b < 32; b++) if (union >>> b & 1) ext.push(b);
  const K = ext.length, idx = new Int8Array(32).fill(-1);
  ext.forEach((b, k) => { idx[b] = k; });
  let zmin = Infinity, zmax = -Infinity;
  const Z = new Float32Array(n * 3);
  for (let i = 0, o = 0; i < n * 3; i++, o += 3) { const z = pos[o] * u[0] + pos[o + 1] * u[1] + pos[o + 2] * u[2]; Z[i] = z; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  const alto = zmax - zmin;
  const capasDe = (lh) => Math.max(1, Math.round((alto - 0.2) / lh) + 1);
  const med = lista.map((lh) => new Float32Array(capasDe(lh) * K));
  const Ls = lista.map(capasDe);
  for (let i = 0; i < n; i++) {
    const mk = mascara[i];
    if (!mk) continue;
    const o = i * 9, q = i * 3;
    // vértices ordenados por altura: v0 (abajo), v1, v2 (arriba)
    let a = 0, b = 1, c = 2;
    if (Z[q + a] > Z[q + b]) { const t = a; a = b; b = t; }
    if (Z[q + b] > Z[q + c]) { const t = b; b = c; c = t; }
    if (Z[q + a] > Z[q + b]) { const t = a; a = b; b = t; }
    const za = Z[q + a] - zmin, zb = Z[q + b] - zmin, zc = Z[q + c] - zmin;
    const ax = pos[o + a * 3], ay = pos[o + a * 3 + 1], az = pos[o + a * 3 + 2];
    const bx = pos[o + b * 3], by = pos[o + b * 3 + 1], bz = pos[o + b * 3 + 2];
    const cx = pos[o + c * 3], cy = pos[o + c * 3 + 1], cz = pos[o + c * 3 + 2];
    const horizontal = zc - za < 1e-4;
    let areaH = 0;
    if (horizontal) { const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; areaH = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz) / MC_TRAZO; }
    for (let h = 0; h < lista.length; h++) {
      const lh = lista[h], L = Ls[h], M = med[h];
      if (horizontal) {
        const l = Math.min(L - 1, Math.max(0, Math.floor((za - 0.2) / lh + 1 - 1e-9)));
        for (let mm = mk; mm; mm &= mm - 1) M[l * K + idx[31 - Math.clz32(mm & -mm)]] += areaH;
        continue;
      }
      // capas cuyo plano medio (0,1 en la primera; 0,2 + (l − 0,5)·lh en las demás) corta el triángulo
      const l0 = Math.max(za <= 0.1 ? 0 : 1, Math.ceil((za - 0.2) / lh + 0.5 - 1e-9)), l1 = Math.min(L - 1, zc < 0.1 ? -1 : Math.floor((zc - 0.2) / lh + 0.5 + 1e-9));
      for (let l = l0; l <= l1; l++) {
        const z = l === 0 ? 0.1 : 0.2 + (l - 0.5) * lh;
        if (z < za || z > zc) continue;
        // corte con la arista larga v0–v2 y con la corta (v0–v1 por debajo de v1, v1–v2 por encima)
        const t = (z - za) / (zc - za), px = ax + t * (cx - ax), py = ay + t * (cy - ay), pz = az + t * (cz - az);
        let qx, qy, qz;
        if (z < zb) { const s = zb - za > 0 ? (z - za) / (zb - za) : 0; qx = ax + s * (bx - ax); qy = ay + s * (by - ay); qz = az + s * (bz - az); }
        else { const s = zc - zb > 0 ? (z - zb) / (zc - zb) : 0; qx = bx + s * (cx - bx); qy = by + s * (cy - by); qz = bz + s * (cz - bz); }
        const dx = px - qx, dy = py - qy, dz = pz - qz, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        for (let mm = mk; mm; mm &= mm - 1) M[l * K + idx[31 - Math.clz32(mm & -mm)]] += len;
      }
    }
  }
  // Purga entre extrusores (mm³): matriz del proyecto × flush_multiplier
  const mat = matrizPurga, mult = mat && mat.mult > 0 ? mat.mult : 1;
  const F = (x, y) => { const e = ext[x], f = ext[y]; return mat && e >= 1 && f >= 1 && e <= mat.n && f <= mat.n ? mat.v[(e - 1) * mat.n + (f - 1)] * mult : 0; };
  const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  const memo = new Map();
  // Mejor orden de los colores de una capa (máscara compacta) empezando tras «prev»: { c: cambios, f: purga, u: último }
  const recorrer = (prev, mask) => {
    const key = mask * 64 + prev + 1;
    let r = memo.get(key);
    if (r) return r;
    const cols = [];
    for (let k = 0; k < K; k++) if (mask >>> k & 1) cols.push(k);
    if (cols.length <= MC_PERM) {
      for (const p of perms(cols)) {
        let c = 0, f = 0, ant = prev;
        for (const e of p) { if (ant >= 0 && ant !== e) { c++; f += F(ant, e); } ant = e; }
        if (!r || f < r.f - 1e-9 || (Math.abs(f - r.f) < 1e-9 && c < r.c)) r = { c, f, u: p[p.length - 1] };
      }
    } else {   // muchos colores: el siguiente es siempre el que menos purga
      const resto = new Set(cols);
      let c = 0, f = 0, ant = prev;
      if (ant >= 0 && resto.has(ant)) resto.delete(ant); else if (ant < 0) { ant = cols[0]; resto.delete(ant); }
      while (resto.size) { let mejor = -1, fm = Infinity; for (const e of resto) { const v = F(ant, e); if (v < fm) { fm = v; mejor = e; } } c++; f += fm; resto.delete(mejor); ant = mejor; }
      r = { c, f, u: ant };
    }
    memo.set(key, r);
    return r;
  };
  const res = {};
  lista.forEach((lh, h) => {
    const L = Ls[h], M = med[h];
    let cambios = 0, flush = 0, prev = -1, capasMulti = 0, usados = 0;
    for (let l = 0; l < L; l++) {
      let mask = 0, k = 0;
      for (let e = 0; e < K; e++) if (M[l * K + e] >= MC_MIN) { mask |= 1 << e; k++; }
      if (!mask) continue;
      if (k > 1) capasMulti++;
      usados |= mask;
      const r = recorrer(prev, mask);
      cambios += r.c; flush += r.f; prev = r.u;
    }
    let colores = 0; for (let v = usados; v; v &= v - 1) colores++;
    res[lh] = { cambios, flush: mat ? flush : null, capas: L, capasMulti, colores };
  });
  return Array.isArray(alturas) ? res : res[lista[0]];
}

/* Altura libre bajo cada voladizo: rayo vertical hacia abajo contra las
   caras que miran hacia arriba (rejilla XY para acelerar). Se calcula una
   vez por orientación para todas las caras con pendiente < 45° y la usan
   los tres umbrales. En mallas grandes se muestrea y cada muestra
   representa a sus vecinas en la lista. */
const cacheAlturas = new WeakMap();
function alturasLibres(m, u, B, zmin, PR) {
  let porU = cacheAlturas.get(m);
  if (!porU) cacheAlturas.set(m, porU = new Map());
  const clave = u.join(',');
  if (!porU.has(clave)) porU.set(clave, calcularAlturas(m, u, B, zmin, PR));
  return porU.get(clave);
}
function calcularAlturas(m, u, B, zmin, PR) {
  const { n, nrm } = m;
  const h = new Float32Array(n).fill(NaN);
  const { X, Y, Z } = PR || proyectar(m, u, B, zmin);
  const vol = [], arriba = [];
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const c = nrm[i * 3] * u[0] + nrm[i * 3 + 1] * u[1] + nrm[i * 3 + 2] * u[2];
    if (c < -0.7) vol.push(i);
    else if (c > 0.05) {
      arriba.push(i);
      for (let v = i * 3; v < i * 3 + 3; v++) { if (X[v] < gx0) gx0 = X[v]; if (X[v] > gx1) gx1 = X[v]; if (Y[v] < gy0) gy0 = Y[v]; if (Y[v] > gy1) gy1 = Y[v]; }
    }
  }
  if (!vol.length) return h;
  // Rejilla XY en formato compacto (recuento + desplazamientos)
  const celdas = Math.max(8, Math.min(256, Math.round(Math.sqrt(arriba.length / 2))));
  const cw = Math.max((gx1 - gx0) / celdas, 1e-3), ch = Math.max((gy1 - gy0) / celdas, 1e-3);
  const rango = (i) => {
    const v = i * 3;
    return [Math.max(0, Math.floor((Math.min(X[v], X[v + 1], X[v + 2]) - gx0) / cw)), Math.min(celdas - 1, Math.floor((Math.max(X[v], X[v + 1], X[v + 2]) - gx0) / cw)),
            Math.max(0, Math.floor((Math.min(Y[v], Y[v + 1], Y[v + 2]) - gy0) / ch)), Math.min(celdas - 1, Math.floor((Math.max(Y[v], Y[v + 1], Y[v + 2]) - gy0) / ch))];
  };
  const cuenta = new Int32Array(celdas * celdas + 1);
  for (const i of arriba) { const [i0, i1, j0, j1] = rango(i); for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) cuenta[a * celdas + b + 1]++; }
  for (let k = 1; k < cuenta.length; k++) cuenta[k] += cuenta[k - 1];
  const lista = new Int32Array(cuenta[cuenta.length - 1]), lleno = cuenta.slice(0, -1);
  for (const i of arriba) { const [i0, i1, j0, j1] = rango(i); for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) lista[lleno[a * celdas + b]++] = i; }

  const paso = Math.max(1, Math.ceil(vol.length / 20000));
  for (let s = 0; s < vol.length; s += paso) {
    const v0 = vol[s] * 3;
    const px = (X[v0] + X[v0 + 1] + X[v0 + 2]) / 3, py = (Y[v0] + Y[v0 + 1] + Y[v0 + 2]) / 3, pz = (Z[v0] + Z[v0 + 1] + Z[v0 + 2]) / 3;
    let suelo = 0;
    const ci = Math.floor((px - gx0) / cw), cj = Math.floor((py - gy0) / ch);
    if (ci >= 0 && cj >= 0 && ci < celdas && cj < celdas) {
      const cel = ci * celdas + cj;
      for (let q = cuenta[cel]; q < cuenta[cel + 1]; q++) {
        const a = lista[q] * 3, b = a + 1, d = a + 2;
        const det = (Y[b] - Y[d]) * (X[a] - X[d]) + (X[d] - X[b]) * (Y[a] - Y[d]);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((Y[b] - Y[d]) * (px - X[d]) + (X[d] - X[b]) * (py - Y[d])) / det;
        const l2 = ((Y[d] - Y[a]) * (px - X[d]) + (X[a] - X[d]) * (py - Y[d])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const z = l1 * Z[a] + l2 * Z[b] + l3 * Z[d];
        if (z < pz - 0.2 && z > suelo) suelo = z;
      }
    }
    const libre = Math.max(0, pz - suelo);
    for (let k = s; k < Math.min(s + paso, vol.length); k++) h[vol[k]] = libre;
  }
  return h;
}

/* ---------- Orientación ----------
   Mismo criterio que la orientación automática de los laminadores
   (Tweaker-3 → Bambu Studio / OrcaSlicer, reimplementado aquí): se prueba una
   lista corta de posiciones y se queda la de menor «inimprimibilidad».
   Candidatas («arriba» u):
     · la posición original del archivo;
     · 18 direcciones fijas: los 6 ejes y las 12 diagonales a 45°;
     · apoyar en la cama los grupos de caras paralelas de más área;
     · apoyar las caras mayores de la envolvente convexa (posiciones estables
       de piezas sin caras planas: figuras sobre los pies, etc.).
   Coste de cada u:
     coste = K · (a·voladizo + 1 + b·escalones) / (1 + c·contorno + d·apoyo + e·apoyoEnvolvente)
             + castigo si apenas apoya
     voladizo  área que mira hacia abajo con menos de 20° de pendiente (sin la 1.ª capa;
               20° es el umbral de soporte de los perfiles 0,12 mm de Bambu de referencia)
     apoyo     área en contacto con la cama (caras en los primeros 0,1–0,2 mm), contorno = 4·√apoyo
     escalones caras casi horizontales (1,4°–14°) por encima de la 1.ª capa: dejan escalera visible
     apoyoEnvolvente  base de la envolvente convexa (estabilidad)
   Auto = menor coste (la posición original solo gana si empata, como en Bambu:
   darle más margen empeora la coincidencia con Bambu en las piezas de prueba);
   Alternativa = la mejor que no se parezca a la primera (> 30° de diferencia y
   no simétrica). Pesos de Bambu Studio: con ellos coincide en las 119 piezas
   de prueba; retocarlos solo lo empeora. */
export const ORIENTACION = {
  K: 20, voladizo: 0.1, escalones: 0.001, contorno: 0.5, apoyo: 2.5, envolvente: 0.1,
  sinApoyo: 100, apoyoMin: 0.1, pendiente: 20, capa: 0.2, grupos: 10, gruposEnvolvente: 14,
  original: 0     // margen (fracción del coste) para preferir la posición original; 0 = solo en empate
};

/* Envolvente convexa 3D (quickhull incremental).
   P: Float64Array con x,y,z por punto. Devuelve las caras (índices a, b, c, normal
   hacia fuera y área) y los puntos usados, o null si son degenerados. Los puntos
   casi coplanares que enredan el horizonte se descartan (la envolvente solo se
   usa para proponer apoyos y medir su base; no necesita ser exacta al micrómetro).
   oraculo (opcional): al terminar, recibe las caras vivas y puede devolver puntos
   nuevos que sobresalen [x, y, z, cara, …]; se añaden y se sigue construyendo. */
export function envolvente(P, oraculo) {
  let np = (P.length / 3) | 0;
  if (np < 4) return null;
  let mx = 0; for (let i = 0; i < P.length; i++) { const v = Math.abs(P[i]); if (v > mx) mx = v; }
  const tol = Math.max(mx, 1e-9) * 1e-6;
  const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1], Z = (i) => P[i * 3 + 2];
  // Tetraedro inicial: extremos más separados en un eje, el más lejano a esa recta y el más lejano a ese plano
  const ext = [0, 0, 0, 0, 0, 0];
  for (let i = 1; i < np; i++) for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; if (v < P[ext[k] * 3 + k]) ext[k] = i; if (v > P[ext[k + 3] * 3 + k]) ext[k + 3] = i; }
  let i0 = 0, i1 = 0, best = -1;
  for (let k = 0; k < 3; k++) { const d = P[ext[k + 3] * 3 + k] - P[ext[k] * 3 + k]; if (d > best) { best = d; i0 = ext[k]; i1 = ext[k + 3]; } }
  if (best <= tol) return null;
  const ux = X(i1) - X(i0), uy = Y(i1) - Y(i0), uz = Z(i1) - Z(i0), ul = ux * ux + uy * uy + uz * uz;
  let i2 = -1; best = tol * tol;
  for (let i = 0; i < np; i++) {
    const wx = X(i) - X(i0), wy = Y(i) - Y(i0), wz = Z(i) - Z(i0);
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx, d = (cx * cx + cy * cy + cz * cz) / ul;
    if (d > best) { best = d; i2 = i; }
  }
  if (i2 < 0) return null;
  const vx = X(i2) - X(i0), vy = Y(i2) - Y(i0), vz = Z(i2) - Z(i0);
  let px = uy * vz - uz * vy, py = uz * vx - ux * vz, pz = ux * vy - uy * vx; const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
  let i3 = -1; best = tol;
  for (let i = 0; i < np; i++) { const d = Math.abs((X(i) - X(i0)) * px + (Y(i) - Y(i0)) * py + (Z(i) - Z(i0)) * pz); if (d > best) { best = d; i3 = i; } }
  if (i3 < 0) return null;

  // Caras: vértices A,B,C · plano FN (normal y término independiente) · vecinas N (aristas A→B, B→C, C→A)
  let cap = 1024, nf = 0, gen = 0;
  let A = new Int32Array(cap), B = new Int32Array(cap), C = new Int32Array(cap), N = new Int32Array(cap * 3);
  let FN = new Float64Array(cap * 4), vivo = new Uint8Array(cap), marca = new Int32Array(cap);
  const fuera = [];
  const ampliar = (T, k) => { const t = new T.constructor(cap * k); t.set(T); return t; };
  const nueva = (a, b, c) => {
    if (nf >= cap) { cap *= 2; A = ampliar(A, 1); B = ampliar(B, 1); C = ampliar(C, 1); N = ampliar(N, 3); FN = ampliar(FN, 4); vivo = ampliar(vivo, 1); marca = ampliar(marca, 1); }
    const f = nf++;
    A[f] = a; B[f] = b; C[f] = c; vivo[f] = 1; fuera[f] = null; marca[f] = 0;
    const e1x = X(b) - X(a), e1y = Y(b) - Y(a), e1z = Z(b) - Z(a), e2x = X(c) - X(a), e2y = Y(c) - Y(a), e2z = Z(c) - Z(a);
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    FN[f * 4] = nx; FN[f * 4 + 1] = ny; FN[f * 4 + 2] = nz;
    FN[f * 4 + 3] = -(nx * (X(a) + X(b) + X(c)) + ny * (Y(a) + Y(b) + Y(c)) + nz * (Z(a) + Z(b) + Z(c))) / 3;
    return f;
  };
  const dist = (f, i) => FN[f * 4] * X(i) + FN[f * 4 + 1] * Y(i) + FN[f * 4 + 2] * Z(i) + FN[f * 4 + 3];
  const lado = (X(i3) - X(i0)) * px + (Y(i3) - Y(i0)) * py + (Z(i3) - Z(i0)) * pz;
  const tetra = lado < 0 ? [[i0, i1, i2], [i0, i3, i1], [i1, i3, i2], [i2, i3, i0]] : [[i0, i2, i1], [i0, i1, i3], [i1, i2, i3], [i2, i0, i3]];
  for (const [a, b, c] of tetra) nueva(a, b, c);
  const arista = new Map();
  for (let f = 0; f < 4; f++) { const v = [A[f], B[f], C[f]]; for (let e = 0; e < 3; e++) arista.set(v[e] + ',' + v[(e + 1) % 3], f); }
  for (let f = 0; f < 4; f++) { const v = [A[f], B[f], C[f]]; for (let e = 0; e < 3; e++) N[f * 3 + e] = arista.get(v[(e + 1) % 3] + ',' + v[e]); }
  // Cada punto exterior se asigna a la cara que más lo ve
  const asignar = (i, caras) => {
    let fm = -1, dm = tol;
    for (const f of caras) { const d = dist(f, i); if (d > dm) { dm = d; fm = f; } }
    if (fm >= 0) (fuera[fm] || (fuera[fm] = [])).push(i);
  };
  for (let i = 0; i < np; i++) if (i !== i0 && i !== i1 && i !== i2 && i !== i3) asignar(i, [0, 1, 2, 3]);
  const pila = [0, 1, 2, 3].filter(f => fuera[f]);
  const vis = [], hz = [], sig = new Map();
  // Caras visibles desde el ojo (recorrido por vecinas) y horizonte, que debe ser un único ciclo
  const visibles = (f0, ojo, tv) => {
    gen++; vis.length = 0; hz.length = 0; sig.clear();
    vis.push(f0); marca[f0] = gen;
    for (let q = 0; q < vis.length; q++) {
      const f = vis[q];
      for (let e = 0; e < 3; e++) {
        const g = N[f * 3 + e];
        if (marca[g] === gen || marca[g] === -gen) continue;
        if (dist(g, ojo) > tv) { marca[g] = gen; vis.push(g); } else marca[g] = -gen;
      }
    }
    for (const f of vis) {
      const v0 = A[f], v1 = B[f], v2 = C[f];
      for (let e = 0; e < 3; e++) {
        const g = N[f * 3 + e];
        if (marca[g] === gen) continue;
        const a = e === 0 ? v0 : e === 1 ? v1 : v2, b = e === 0 ? v1 : e === 1 ? v2 : v0;
        const eg = A[g] === b && B[g] === a ? 0 : B[g] === b && C[g] === a ? 1 : C[g] === b && A[g] === a ? 2 : -1;
        if (eg < 0 || sig.has(a)) return false;
        sig.set(a, b); hz.push(a, b, g, eg);
      }
    }
    const na = hz.length / 4;
    if (na < 3) return false;
    let v = hz[0], pasos = 0;
    do { v = sig.get(v); pasos++; } while (v !== undefined && v !== hz[0] && pasos <= na);
    return v === hz[0] && pasos === na;
  };
  let vueltas = 0;
  const procesar = () => { while (pila.length && ++vueltas < 8 * np + 1000) {
    const f0 = pila.pop();
    const lst = fuera[f0];
    if (!vivo[f0] || !lst || !lst.length) continue;
    let k0 = 0, dmax = -Infinity;
    for (let k = 0; k < lst.length; k++) { const d = dist(f0, lst[k]); if (d > dmax) { dmax = d; k0 = k; } }
    const ojo = lst[k0];
    let ok = false;
    for (const tv of [tol, tol * 10, tol * 100]) { if (tv >= dmax) break; if (visibles(f0, ojo, tv)) { ok = true; break; } }
    if (!ok) { lst[k0] = lst[lst.length - 1]; lst.pop(); pila.push(f0); continue; }
    const huerfanos = [];
    for (const f of vis) { vivo[f] = 0; if (fuera[f]) { for (const i of fuera[f]) if (i !== ojo) huerfanos.push(i); fuera[f] = null; } }
    // Abanico de caras nuevas (a, b, ojo) sobre el horizonte
    const porInicio = new Map(), nuevas = [];
    for (let k = 0; k < hz.length; k += 4) {
      const f = nueva(hz[k], hz[k + 1], ojo);
      N[f * 3] = hz[k + 2]; N[hz[k + 2] * 3 + hz[k + 3]] = f;
      porInicio.set(hz[k], f); nuevas.push(f);
    }
    for (const f of nuevas) { const g = porInicio.get(B[f]); N[f * 3 + 1] = g; N[g * 3 + 2] = f; }
    for (const i of huerfanos) asignar(i, nuevas);
    for (const f of nuevas) if (fuera[f]) pila.push(f);
  } };
  procesar();
  if (oraculo) for (let ronda = 0; ronda < 4; ronda++) {
    const vivas = [];
    for (let f = 0; f < nf; f++) if (vivo[f]) vivas.push(f);
    const area = (f) => { const a = A[f], b = B[f], c = C[f]; const e1x = X(b) - X(a), e1y = Y(b) - Y(a), e1z = Z(b) - Z(a), e2x = X(c) - X(a), e2y = Y(c) - Y(a), e2z = Z(c) - Z(a); return Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) / 2; };
    const nuevos = oraculo(vivas, FN, area, tol);
    if (!nuevos.length) break;
    const P2 = new Float64Array(P.length + nuevos.length / 4 * 3);
    P2.set(P);
    const ids = [];
    for (let q = 0; q < nuevos.length; q += 4) { const i = np++; P2[i * 3] = nuevos[q]; P2[i * 3 + 1] = nuevos[q + 1]; P2[i * 3 + 2] = nuevos[q + 2]; ids.push(i, nuevos[q + 3]); }
    P = P2;
    for (let q = 0; q < ids.length; q += 2) { const i = ids[q], f = ids[q + 1]; if (vivo[f] && dist(f, i) > tol) { (fuera[f] || (fuera[f] = [])).push(i); pila.push(f); } }
    procesar();
  }
  const caras = [];
  for (let f = 0; f < nf; f++) if (vivo[f]) caras.push(f);
  const m = caras.length;
  const H = { P, n: m, a: new Int32Array(m), b: new Int32Array(m), c: new Int32Array(m), nrm: new Float64Array(m * 3), area: new Float64Array(m) };
  caras.forEach((f, k) => {
    const a = A[f], b = B[f], c = C[f];
    H.a[k] = a; H.b[k] = b; H.c[k] = c;
    const e1x = X(b) - X(a), e1y = Y(b) - Y(a), e1z = Z(b) - Z(a), e2x = X(c) - X(a), e2y = Y(c) - Y(a), e2z = Z(c) - Z(a);
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, l = Math.hypot(nx, ny, nz);
    H.area[k] = l / 2;
    if (l > 0) { H.nrm[k * 3] = nx / l; H.nrm[k * 3 + 1] = ny / l; H.nrm[k * 3 + 2] = nz / l; }
  });
  return H;
}

/* Rejilla de ~64³ celdas sobre los vértices (una sola vez por pieza):
   · lista de vértices y caja ajustada de cada celda, para encontrar el punto
     más bajo, las caras de la primera capa o el vértice más saliente de cada
     orientación sin recorrer toda la malla;
   · puntos para la envolvente: en mallas pequeñas todos los vértices; en las
     grandes, el vértice más alejado del centro en cada celda (los extremos son
     los que forman la envolvente). */
function rejillaOrientacion(m) {
  const { pos } = m, nv = (pos.length / 3) | 0;
  const G = 64, [x0, y0, z0] = m.min, [x1, y1, z1] = m.max;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const h = Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-6) / G * 1.0001, ih = 1 / h;
  const gx = Math.floor((x1 - x0) / h) + 1, gy = Math.floor((y1 - y0) / h) + 1, gz = Math.floor((z1 - z0) / h) + 1;
  const celda = new Int32Array(nv), cuenta = new Int32Array(gx * gy * gz + 1);
  for (let v = 0, k = 0; v < nv; v++, k += 3) {
    const c = ((pos[k] - x0) * ih | 0) + gx * (((pos[k + 1] - y0) * ih | 0) + gy * ((pos[k + 2] - z0) * ih | 0)); // coordenadas ≥ mínimo: |0 = suelo
    celda[v] = c; cuenta[c + 1]++;
  }
  // Celdas ocupadas (compactas) y lista de vértices de cada una
  let nc = 0;
  const idx = new Int32Array(gx * gy * gz);
  for (let c = 0; c < idx.length; c++) idx[c] = cuenta[c + 1] ? nc++ : -1;
  const ini = new Int32Array(nc + 1);
  for (let c = 0; c < idx.length; c++) if (idx[c] >= 0) ini[idx[c] + 1] = cuenta[c + 1];
  for (let j = 0; j < nc; j++) ini[j + 1] += ini[j];
  const lleno = ini.slice(0, nc), vert = new Int32Array(nv);
  for (let v = 0; v < nv; v++) vert[lleno[idx[celda[v]]]++] = v;
  // Caja ajustada de cada celda y su vértice más alejado del centro
  const todos = pos.length <= 90000;
  const caja = new Float64Array(nc * 6), PH = todos ? Float64Array.from(pos) : new Float64Array(nc * 3);
  for (let j = 0; j < nc; j++) {
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity, dm = -1, km = 0;
    for (let q = ini[j]; q < ini[j + 1]; q++) {
      const k = vert[q] * 3, x = pos[k], y = pos[k + 1], z = pos[k + 2];
      if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; if (z < az) az = z; if (z > bz) bz = z;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz);
      if (d > dm) { dm = d; km = k; }
    }
    caja[j * 6] = ax; caja[j * 6 + 1] = ay; caja[j * 6 + 2] = az; caja[j * 6 + 3] = bx; caja[j * 6 + 4] = by; caja[j * 6 + 5] = bz;
    if (!todos) { PH[j * 3] = pos[km]; PH[j * 3 + 1] = pos[km + 1]; PH[j * 3 + 2] = pos[km + 2]; }
  }
  return { nc, caja, ini, vert, todos, PH };
}

/* Vértice más saliente en la dirección n: cota de cada celda con su caja
   ajustada; solo se recorren las celdas cuya cota supera al mejor encontrado. */
function masSaliente(m, R, nx, ny, nz, cota) {
  const { pos } = m, { nc, caja, ini, vert } = R;
  let jb = 0, cb = -Infinity;
  for (let j = 0, o = 0; j < nc; j++, o += 6) {
    const c = (nx > 0 ? caja[o + 3] : caja[o]) * nx + (ny > 0 ? caja[o + 4] : caja[o + 1]) * ny + (nz > 0 ? caja[o + 5] : caja[o + 2]) * nz;
    cota[j] = c; if (c > cb) { cb = c; jb = j; }
  }
  let mejor = -Infinity, km = -1;
  const recorre = (j) => { for (let q = ini[j]; q < ini[j + 1]; q++) { const k = vert[q] * 3, d = pos[k] * nx + pos[k + 1] * ny + pos[k + 2] * nz; if (d > mejor) { mejor = d; km = k; } } };
  recorre(jb);
  for (let j = 0; j < nc; j++) if (j !== jb && cota[j] > mejor) recorre(j);
  return [km, mejor];
}

/* Envolvente de la malla. Se construye la de la muestra y después se comprueban
   sus caras mayores: si algún vértice sobresale del plano de una cara, se añade
   el más saliente y se sigue construyendo (como en quickhull, pero preguntando a
   la rejilla). Así las caras grandes, que son las que proponen apoyos y miden la
   base, quedan exactas. Las piezas casi convexas (jarrones: miles de caras,
   ninguna grande) se quedan con la de la muestra. */
function envolventeMalla(m, R) {
  if (R.todos) { const H = envolvente(R.PH); return { H, PH: R.PH }; }
  const { pos } = m, cota = new Float64Array(R.nc), buenas = new Set(), usados = new Set();
  const oraculo = (vivas, FN, area, tol) => {
    if (vivas.length > 3000) return [];
    const orden = vivas.map(f => [f, area(f)]).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const out = [];
    for (const [f] of orden) {
      if (buenas.has(f)) continue;
      const [k, dm] = masSaliente(m, R, FN[f * 4], FN[f * 4 + 1], FN[f * 4 + 2], cota);
      if (dm + FN[f * 4 + 3] > tol && !usados.has(k)) { usados.add(k); out.push(pos[k], pos[k + 1], pos[k + 2], f); }
      else buenas.add(f);
    }
    return out;
  };
  const H = envolvente(R.PH, oraculo);
  return { H, PH: H ? H.P : R.PH };
}

/* Normales de los grupos de caras paralelas (normal cuantizada a 0,001) con
   más área; se devuelve la normal de la mayor cara de cada grupo. Con el mapa de
   normales se agrupa celda a celda (tabla pequeña, en caché) y se deja de buscar
   cuando las celdas que quedan suman menos que el último grupo elegido. */
function gruposParalelos(nrm, area, n, cuantos, MN) {
  let orden, ini, maxc = n;
  if (MN) {
    nrm = MN.ns; area = MN.as;
    orden = Array.from({ length: MN.nc }, (_, c) => c).filter(c => MN.suma[c] > 0).sort((a, b) => MN.suma[b] - MN.suma[a]);
    ini = MN.ini; maxc = 0;
    for (const c of orden) maxc = Math.max(maxc, ini[c + 1] - ini[c]);
  } else { orden = [0]; ini = [0, n]; }
  let tam = 16; while (tam < maxc * 2) tam *= 2;
  const k1 = new Int32Array(tam), k2 = new Int16Array(tam), suma = new Float64Array(tam), mayor = new Int32Array(tam), sello = new Int32Array(tam), usados = new Int32Array(maxc);
  const q = (v) => v * 1000 + 1001 | 0; // suelo(v·1000) + 1001
  const top = [];
  let s = 0;
  for (const c of orden) {
    if (top.length === cuantos && MN && MN.suma[c] <= top[cuantos - 1].s) break;
    const cnt = ini[c + 1] - ini[c];
    let t = 16; while (t < cnt * 2) t *= 2;
    const mask = t - 1;
    s++;
    let nu = 0;
    for (let p = ini[c]; p < ini[c + 1]; p++) {
      const i = p, a = area[i];
      if (!(a > 0)) continue;
      const a1 = q(nrm[i * 3]) * 2003 + q(nrm[i * 3 + 1]), kz = q(nrm[i * 3 + 2]);
      let h = (Math.imul(a1, 0x9E3779B1) ^ Math.imul(kz, 0x85EBCA77)) & mask;
      while (sello[h] === s && (k1[h] !== a1 || k2[h] !== kz)) h = (h + 1) & mask;
      if (sello[h] !== s) { sello[h] = s; k1[h] = a1; k2[h] = kz; suma[h] = a; mayor[h] = i; usados[nu++] = h; }
      else { suma[h] += a; if (a > area[mayor[h]]) mayor[h] = i; }
    }
    for (let k = 0; k < nu; k++) {
      const h = usados[k];
      if (top.length < cuantos || suma[h] > top[top.length - 1].s) {
        if (top.length === cuantos) top.pop();
        let p = top.length; top.push(null);
        while (p > 0 && top[p - 1].s < suma[h]) { top[p] = top[p - 1]; p--; }
        top[p] = { s: suma[h], i: mayor[h] };
      }
    }
  }
  return top.map(g => [nrm[g.i * 3], nrm[g.i * 3 + 1], nrm[g.i * 3 + 2]]);
}

/* Mapa de normales: las caras se agrupan en celdas de un cubo de direcciones
   (6 × 24 × 24), con su área total y el cono que abarcan sus normales. Para cada
   orientación, las celdas que caen enteras dentro o fuera de una condición
   (voladizo, escalones) se suman de golpe; solo se recorren cara a cara las que
   cortan el límite. Mismo resultado que recorrer todas las caras, mucho más rápido. */
function mapaNormales(m, S = 24) {
  const { n, nrm, area } = m, nc = 6 * S * S;
  const celda = new Int32Array(n), cuenta = new Int32Array(nc + 1);
  for (let i = 0; i < n; i++) {
    // normal cuantizada a 0,001 (como en los grupos): suelo(v) = (v + 1001 | 0) − 1001 para v > −1001
    const x = ((nrm[i * 3] * 1000 + 1001 | 0) - 1000.5) / 1000, y = ((nrm[i * 3 + 1] * 1000 + 1001 | 0) - 1000.5) / 1000, z = ((nrm[i * 3 + 2] * 1000 + 1001 | 0) - 1000.5) / 1000;
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let f, s1, s2, d;
    if (ax >= ay && ax >= az) { f = x > 0 ? 0 : 1; d = ax; s1 = y; s2 = z; }
    else if (ay >= az) { f = y > 0 ? 2 : 3; d = ay; s1 = x; s2 = z; }
    else { f = z > 0 ? 4 : 5; d = az; s1 = x; s2 = y; }
    let c = 0;
    if (d > 0) c = f * S * S + Math.min(S - 1, (s1 / d + 1) * 0.5 * S | 0) * S + Math.min(S - 1, (s2 / d + 1) * 0.5 * S | 0);
    celda[i] = c; cuenta[c + 1]++;
  }
  for (let c = 0; c < nc; c++) cuenta[c + 1] += cuenta[c];
  // normales y áreas copiadas en el orden de las celdas: cada celda se recorre seguida en memoria
  const ini = cuenta, lleno = ini.slice(0, nc), ns = new Float32Array(n * 3), as = new Float32Array(n);
  for (let i = 0; i < n; i++) { const q = lleno[celda[i]]++; ns[q * 3] = nrm[i * 3]; ns[q * 3 + 1] = nrm[i * 3 + 1]; ns[q * 3 + 2] = nrm[i * 3 + 2]; as[q] = area[i]; }
  const suma = new Float64Array(nc), dir = new Float64Array(nc * 3), radio = new Float64Array(nc);
  for (let c = 0; c < nc; c++) {
    let sx = 0, sy = 0, sz = 0, sa = 0;
    for (let q = ini[c]; q < ini[c + 1]; q++) { const a = as[q]; sa += a; sx += ns[q * 3] * a; sy += ns[q * 3 + 1] * a; sz += ns[q * 3 + 2] * a; }
    suma[c] = sa;
    const l = Math.hypot(sx, sy, sz);
    if (!(l > 0)) { radio[c] = Math.PI; continue; }
    sx /= l; sy /= l; sz /= l; dir[c * 3] = sx; dir[c * 3 + 1] = sy; dir[c * 3 + 2] = sz;
    let cmin = 1;
    for (let q = ini[c]; q < ini[c + 1]; q++) {
      const x = ns[q * 3], y = ns[q * 3 + 1], z = ns[q * 3 + 2];
      if (x === 0 && y === 0 && z === 0) continue;
      const k = x * sx + y * sy + z * sz; if (k < cmin) cmin = k;
    }
    radio[c] = Math.acos(Math.max(-1, Math.min(1, cmin))) + 1e-6;
  }
  return { nc, ini, ns, as, suma, dir, radio };
}

/* Términos del coste con «arriba» = u. El voladizo y los escalones dependen solo
   de las normales (una pasada); lo que depende de la altura (punto más bajo,
   caras de la primera capa) se busca solo en las celdas más bajas de la rejilla. */
function terminosOrientacion(m, u, R, MN, H, P, sello, marca) {
  const { pos, n, nrm, area } = m;
  const ux = u[0], uy = u[1], uz = u[2];
  const asc = -Math.cos(P.pendiente * Math.PI / 180);
  // 1) Normales: voladizo y escalones de toda la pieza
  //    (escalones: 0,97 < |c| < 0,999, con c = normal·u)
  let vol = 0, esc = 0;
  const e = 1e-7;
  for (let j = 0; j < MN.nc; j++) {
    const sa = MN.suma[j];
    if (!(sa > 0)) continue;
    const th = Math.acos(Math.max(-1, Math.min(1, MN.dir[j * 3] * ux + MN.dir[j * 3 + 1] * uy + MN.dir[j * 3 + 2] * uz))), r = MN.radio[j];
    const cmax = th - r <= 0 ? 1 : Math.cos(th - r), cmin = th + r >= Math.PI ? -1 : Math.cos(th + r);
    const vTodo = cmax < asc - e, vNada = cmin > asc + e;
    const eTodo = (cmin > 0.97 + e && cmax < 0.999 - e) || (cmin > -0.999 + e && cmax < -0.97 - e);
    const eNada = cmax < -0.999 - e || cmin > 0.999 + e || (cmin > -0.97 + e && cmax < 0.97 - e);
    if (vTodo) vol += sa;
    if (eTodo) esc += sa;
    if ((vTodo || vNada) && (eTodo || eNada)) continue;
    const ns = MN.ns, as = MN.as;
    for (let q = MN.ini[j]; q < MN.ini[j + 1]; q++) {
      const c = ns[q * 3] * ux + ns[q * 3 + 1] * uy + ns[q * 3 + 2] * uz;
      if (!vTodo && !vNada && c < asc) vol += as[q];
      if (!eTodo && !eNada) { const ca = c < 0 ? -c : c; if (ca > 0.97 && ca < 0.999) esc += as[q]; }
    }
  }
  // 2) Punto más bajo: cota superior con los puntos de la envolvente (son vértices)
  //    y búsqueda exacta en las celdas cuya caja queda por debajo
  const PH = R.PH, cj = R.caja;
  let zs = Infinity;
  for (let k = 0; k < PH.length; k += 3) { const z = PH[k] * ux + PH[k + 1] * uy + PH[k + 2] * uz; if (z < zs) zs = z; }
  const lim = zs + P.capa + 1e-6;
  const bajos = [];
  let zmin = zs;
  for (let j = 0, o = 0; j < R.nc; j++, o += 6) {
    if ((ux > 0 ? cj[o] : cj[o + 3]) * ux + (uy > 0 ? cj[o + 1] : cj[o + 4]) * uy + (uz > 0 ? cj[o + 2] : cj[o + 5]) * uz > lim) continue;
    for (let q = R.ini[j]; q < R.ini[j + 1]; q++) {
      const v = R.vert[q], k = v * 3, z = pos[k] * ux + pos[k + 1] * uy + pos[k + 2] * uz;
      if (z < lim) { if (z < zmin) zmin = z; const t = (v / 3) | 0; if (marca[t] !== sello) { marca[t] = sello; bajos.push(t); } }
    }
  }
  // 3) Caras de la primera capa: apoyo y correcciones de voladizo/escalones
  const z1 = zmin + P.capa - 1e-4, z2 = zmin + P.capa / 2 - 1e-4, zl = zmin + P.capa;
  let b1 = 0, b2 = 0;
  for (const t of bajos) {
    const o = t * 9;
    const za = pos[o] * ux + pos[o + 1] * uy + pos[o + 2] * uz, zb = pos[o + 3] * ux + pos[o + 4] * uy + pos[o + 5] * uz, zc = pos[o + 6] * ux + pos[o + 7] * uy + pos[o + 8] * uz;
    const zx = za > zb ? (za > zc ? za : zc) : (zb > zc ? zb : zc);
    const a = area[t], c = nrm[t * 3] * ux + nrm[t * 3 + 1] * uy + nrm[t * 3 + 2] * uz, ca = c < 0 ? -c : c;
    if (zx < z1) { b1 += a; if (zx < z2) { b2 += a; if (c < asc) vol -= a; } }
    if (zx <= zl && ca > 0.97 && ca < 0.999) esc -= a;
  }
  const apoyo = 0.5 * b1 + b2;
  // 4) Base de la envolvente (medida desde su propio punto más bajo)
  let bh = 0;
  if (H) {
    const limH = zs + P.capa - 1e-4;
    for (let f = 0; f < H.n; f++) {
      const a = H.a[f] * 3, b = H.b[f] * 3, c = H.c[f] * 3;
      if (PH[a] * ux + PH[a + 1] * uy + PH[a + 2] * uz < limH && PH[b] * ux + PH[b + 1] * uy + PH[b + 2] * uz < limH && PH[c] * ux + PH[c + 1] * uy + PH[c + 2] * uz < limH) bh += H.area[f];
    }
  }
  vol = Math.max(0, vol); esc = Math.max(0, esc);
  const coste = P.K * (P.voladizo * vol + 1 + P.escalones * esc) / (1 + P.contorno * 4 * Math.sqrt(apoyo) + P.apoyo * apoyo + P.envolvente * bh)
              + (apoyo < P.apoyoMin ? P.sinApoyo : 0);
  return { coste, voladizo: vol, apoyo, apoyoEnvolvente: bh, escalones: esc };
}

// Altura y ¿cabe en la cama? (medidas con los puntos de la envolvente)
function medidasOrientacion(PH, u) {
  const B = base(u);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < PH.length; k += 3) {
    const x = PH[k] * B.x[0] + PH[k + 1] * B.x[1] + PH[k + 2] * B.x[2], y = PH[k] * B.y[0] + PH[k + 1] * B.y[1] + PH[k + 2] * B.y[2], z = PH[k] * u[0] + PH[k + 1] * u[1] + PH[k + 2] * u[2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const a = x1 - x0, f = y1 - y0;
  return { alto: z1 - z0, cabe: z1 - z0 <= IMPRESORA.cama[2] && Math.max(a, f) <= IMPRESORA.cama[0] * 1.414 && Math.min(a, f) <= IMPRESORA.cama[1] };
}

export function orientaciones(m, opciones = {}) {
  const P = Object.assign({}, ORIENTACION, opciones);
  if (!(m.n > 0) || ![...m.min, ...m.max].every(Number.isFinite)) return { auto: [0, 0, 1], alternativa: [0, 0, -1], lista: [] };
  const R = rejillaOrientacion(m), MN = mapaNormales(m);
  const { H, PH } = envolventeMalla(m, R);
  R.PH = PH;
  const s = Math.SQRT1_2;
  const fijas = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
    [s, s, 0], [s, -s, 0], [-s, s, 0], [-s, -s, 0], [s, 0, s], [-s, 0, s], [0, s, s], [0, -s, s], [s, 0, -s], [-s, 0, -s], [0, s, -s], [0, -s, -s]];
  const cand = [[0, 0, 1]];
  for (const g of gruposParalelos(m.nrm, m.area, m.n, P.grupos, MN)) cand.push([-g[0], -g[1], -g[2]]); // la cara mira abajo → arriba = −normal
  if (H) for (const g of gruposParalelos(H.nrm, H.area, H.n, P.gruposEnvolvente)) cand.push([-g[0], -g[1], -g[2]]);
  cand.push(...fijas);
  const unicas = [];
  for (const c of cand) {
    const l = Math.hypot(c[0], c[1], c[2]);
    if (!(l > 0.5)) continue;
    const u = [c[0] / l, c[1] / l, c[2] / l];
    if (!unicas.some(o => o[0] * u[0] + o[1] * u[1] + o[2] * u[2] > 1 - 1e-7)) unicas.push(u);
  }
  const marca = new Int32Array(m.n);
  let sello = 0;
  const lista = unicas.map(u => {
    const r = terminosOrientacion(m, u, R, MN, H, P, ++sello, marca);
    const { alto, cabe } = medidasOrientacion(PH, u);
    r.alto = alto;
    return { u, coste: r.coste + (cabe ? 0 : 1e6), r };
  }).sort((a, b) => a.coste - b.coste);
  // En empate (o casi, según P.original) se respeta la posición en que viene el archivo
  const original = lista.find(o => o.u[2] > 1 - 1e-7);
  const auto = original && original.coste <= lista[0].coste * (1 + P.original) + 1e-4 ? original : lista[0];
  // Alternativa: otra posición de verdad (> 30°) que no sea el simétrico de la primera
  // (misma altura y mismo soporte darían la misma estimación). La altura se compara
  // con lo ya medido; solo si coincide se miden los voladizos con rasgos() (muestreado).
  const paso = Math.max(1, Math.ceil(m.n / 150000)), cache = new Map();
  const rs = (o) => { if (!cache.has(o)) cache.set(o, rasgos(m, o.u, 30, false, paso)); return cache.get(o); };
  const parecida = (o) => {
    if (Math.abs(o.r.alto - auto.r.alto) >= 0.02 * auto.r.alto + 0.5) return false;
    const a = rs(o), b = rs(auto);
    return Math.abs(a.volSopCota - b.volSopCota) < 0.05 * b.volSopCota + 50 || Math.abs(a.aVol - b.aVol) < 0.1 * b.aVol + 1;
  };
  const girada = (o) => o !== auto && o.u[0] * auto.u[0] + o.u[1] * auto.u[1] + o.u[2] * auto.u[2] < Math.cos(Math.PI / 6);
  const alternativa = lista.find(o => girada(o) && !parecida(o)) || lista.find(girada) || lista.find(o => o !== auto) || auto;
  return { auto: auto.u, alternativa: alternativa.u, lista };
}


/* Tiempo en segundos con el modelo por capas (lo usan estimar() y la calibración). parts viene de estimar().x.parts. */
export function tiempoCapas(p, T, kRelleno, kDef) {
  const { capas, nP, lh } = p, c = p.cortes;
  const n = c ? c.P.length : 0;
  if (!n) {   // sin cortes: modelo global con un único suelo
    const isl = p.bucles * capas * p.islasEsc;
    const t = kDef * (T.fijo + T.pared * p.tPared + T.piel * p.tPiel + kRelleno * p.tRelleno + T.soporte * p.tSop + T.capa * capas + T.isla * isl + T.islaP * isl * nP);
    return Math.max(t, CAPA_MIN_S * capas);
  }
  let sP = 0, sA = 0;
  for (let i = 0; i < n; i++) { sP += c.P[i]; sA += c.A[i]; }
  let tot = 0;
  for (let i = 0; i < n; i++) {
    const w = sP > 0 ? c.P[i] / sP * n : 1, a = sA > 0 ? c.A[i] / sA * n : 1, b = c.B[i] * p.islasEsc;
    const ovh = kDef * (T.capa + T.isla * b + T.islaP * b * nP);
    const lin = kDef * (T.fijo / capas + T.pared * p.tPared / capas * w + T.piel * p.tPiel / capas * a + kRelleno * p.tRelleno / capas * a + T.soporte * p.tSop / capas) + ovh;
    const ext = (p.vPared * w + (p.vPiel + p.vRelleno) * a) / capas / (LW_RELLENO * lh);
    tot += Math.max(lin, Math.min(CAPA_MIN_S, ext / VEL_CAPA_MIN + ovh));
  }
  return tot * capas / n;
}

/* ---------- Estimación ----------
   r: rasgos() de la orientación elegida (con rayos).
   sel: { definicion, pared, densidad, soportes, color, colores, escala } */
export function estimar(r, sel, coef = COEF) {
  const P = OPCIONES.definicion[sel.definicion];
  const nP = OPCIONES.pared[sel.pared].n;
  const dens = OPCIONES.densidad[sel.densidad].d;
  const s = sel.escala || 1, s2 = s * s, s3 = s2 * s;
  const lh = P.lh;
  const alto = r.alto * s;
  const capas = Math.max(1, Math.round((alto - 0.2) / lh) + 1);

  // Malla no válida: el volumen no representa la pieza; se acota a un 30 % de la caja para que la estimación no se dispare
  const V0 = (r.mallaNoValida ? 0.3 * r.alto * r.ancho * r.fondo : r.volumen) * s3;
  const V = Number.isFinite(V0) && V0 > 0 ? V0 : 0;   // malla vacía o degenerada: resultado seguro (sin NaN)
  const eSup = Math.max(P.capasSup * lh, P.espSup), eInf = P.capasInf * lh;
  // Paredes: tope suave. En secciones estrechas (anchura media < 2·paredes) las paredes ocupan
  // toda la pieza y no quedan pieles ni relleno propios; g(r) = r/√(1+r²) vale r si r es pequeño
  // y tiende a 1 (la pieza entera) cuando r = paredes/volumen crece.
  const vPared0 = nP * LW_PARED * r.aLat * s2, rW = vPared0 / Math.max(V, 1e-9);
  let vPared = V * rW / Math.sqrt(1 + rW * rW);
  let vPiel = (r.aArriba * eSup + r.aAbajo * eInf) * s2;
  const casco = vPared + vPiel;
  if (casco > V) { const f = V / casco; vPared *= f; vPiel *= f; }
  const vRelleno = Math.max(0, V - vPared - vPiel) * dens;
  // Soportes: solo lo que Bambu llega a soportar (ver rasgos) y respuesta cóncava: el soporte
  // en árbol pequeño pesa mucho más que su volumen proyectado (tronco mínimo + interfaz), y el
  // grande es hueco y pesa mucho menos. Término √vSop además del lineal.
  const conSop = sel.soportes === 'si';
  const vSop = conSop ? r.volSopE * s3 : 0;
  const aInt = conSop ? r.aSopE * s2 : 0;

  const K = coef.g, T = coef.t, ρ = IMPRESORA.densidadPLA / 1000;
  const vSopTot = K.soporte * vSop + K.interfaz * aInt + K.raiz * Math.sqrt(vSop);   // mm³ de soporte
  let gramos = ρ * (K.pared * vPared + K.piel * vPiel + K.relleno * vRelleno + vSopTot) + K.fijo;

  // Tiempo físico por rasgo: volumen / caudal real (limitado por el caudal máximo)
  const q = (v, lw) => Math.min(IMPRESORA.caudalMax, v * lw * lh);
  const qPared = 1 / (1 / nP / q(P.vel.pared, LW_PARED) + (nP - 1) / nP / q(P.vel.paredInt, LW_PARED)); // media armónica
  const tPared = vPared / qPared;
  const tPiel = vPiel / q(P.vel.solido, LW_PIEL);
  const tRelleno = vRelleno / q(P.vel.relleno, LW_RELLENO);
  const tSop = vSopTot / q(P.vel.soporte, LW_PIEL);
  // Islas: bucles de contorno por capa (media de 12 cortes). Cada uno cuesta un viaje con retracción
  // y el arranque de sus paredes, que es lo que domina en piezas planas y finas (palmeras, texto).
  // Tope: en entrenamiento el máximo fue 7.718 (bucles × capas). Por encima el término apenas crece:
  // en piezas altas (jarrones) el laminador agrupa y la extrapolación lineal se disparaba (+176 %).
  const islasBrutas = (r.bucles || 1) * capas;
  const ISLAS_TOPE = 8000;
  const islasCapas = islasBrutas <= ISLAS_TOPE ? islasBrutas : ISLAS_TOPE + 0.05 * (islasBrutas - ISLAS_TOPE);
  const kDef = (coef.tDefinicion && coef.tDefinicion[sel.definicion]) || 1;
  // El gyroid del preset HQ frena más cuanto más denso: un coeficiente de tiempo por densidad
  const kRelleno = (coef.tRelleno && coef.tRelleno[sel.densidad]) ?? T.relleno ?? 1;
  // Tiempo por capa. La malla se corta a 12 alturas (r.cortes: perímetro, área y bucles de cada corte); cada corte
  // representa a capas/12 capas. El laminador alarga las capas que duran menos de 8 s (enfriamiento) pero no las frena
  // por debajo de 20 mm/s, así que el suelo de cada capa es min(8 s, recorrido de la capa a 20 mm/s + viajes).
  const lext = (vPared + vPiel + vRelleno) / (LW_RELLENO * lh);   // mm de línea extruida
  const parts = { capas, nP, lh, vPared, vPiel, vRelleno, tPared, tPiel, tRelleno, tSop, lext, islasEsc: islasCapas / Math.max(islasBrutas, 1e-9), cortes: r.cortes || null, bucles: r.bucles || 1 };
  let segundos = tiempoCapas(parts, T, kRelleno, kDef);
  // Techo: el laminador no baja de ~14 mm/s de media: una pieza muy fina no tarda más que su recorrido a esa velocidad.
  segundos = Math.min(lext / VEL_MIN, segundos);

  // Multicolor (regla de Bambu, ver cambiosColor). Con un 3MF pintado (r.pintura) los cambios y la purga salen de la
  // pintura de cada capa y de la matriz de purga del proyecto; sin matriz, cada cambio purga M.respaldoMm3. Sin pintura
  // (STL, STEP o 3MF de un solo color) se estiman por capas y número de colores elegido (poco fiable).
  //   gramos  += M.purga · ρ · purga(mm³) + M.torre · capas
  //   segundos += M.segCambio · cambios + M.segPurga · purga(mm³) + M.segCapa · capas
  let cambios = 0, gPurga = 0, purga = 0;
  if (sel.color === 'multi') {
    const M = coef.multicolor;
    const pint = r.pintura && r.pintura[lh];
    if (pint && pint.colores >= 2) {
      const f = capas / pint.capas;   // la pintura se midió a escala 1
      cambios = Math.round(pint.cambios * f);
      purga = (pint.flush !== null && pint.flush !== undefined && pint.cambios > 0 && pint.flush > 0 ? pint.flush : pint.cambios * M.respaldoMm3) * f;
    } else {
      const nCol = Math.max(2, sel.colores || M.colores);
      cambios = Math.round((nCol - 1) * capas * M.fraccionCapas);
      purga = cambios * M.respaldoMm3;
    }
    gPurga = M.purga * ρ * purga + M.torre * capas;
    gramos += gPurga;
    segundos += M.segCambio * cambios + M.segPurga * purga + M.segCapa * capas;
  }

  return {
    gramos, segundos, capas, alto,
    medidas: [r.ancho * s, r.fondo * s, alto],
    desglose: {
      gramos: { paredes: ρ * K.pared * vPared, pieles: ρ * K.piel * vPiel, relleno: ρ * K.relleno * vRelleno,
                soportes: ρ * vSopTot, purga: gPurga },
      cambios, purgaMm3: purga
    },
    // Regresores para la calibración
    x: { parts, vPared, vPiel, vRelleno, vSop, aInt, raiz: Math.sqrt(vSop), tPared, tPiel, tRelleno, tSop, capas, islasCapas, nP, lext }
  };
}

/* Voladizos que necesitan soporte en esta orientación (Sí/No).
   Ajustado a lo que hace Bambu Studio (soporte en árbol automático, umbral 20°)
   en 119 piezas de SILAB: basta medio mm² de cara inclinada en voladizo
   (3°–20° desde la horizontal). Los techos casi planos (< 3°) se imprimen como
   puente y solo cuentan al 5 %. Acierta el 97,5 % (94,7 % en piezas de prueba). */
export function necesitaSoportes(r, sel) {
  const s = sel.escala || 1;
  const inclinado = (r.aVol - (r.aTecho || 0)) * s * s;
  const techo = (r.aTecho || 0) * s * s;
  return inclinado + 0.05 * techo > 0.5;
}

export function formatoTiempo(seg) {
  const m = Math.max(1, Math.round(seg / 60));
  const h = Math.floor(m / 60), r = m % 60;
  if (h >= 48) { const d = Math.floor(h / 24), hr = h % 24; return d + ' d' + (hr ? ' ' + hr + ' h' : ''); }
  return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min';
}

/* ============================================================
   Verificación en el servidor (precio al momento)
   El navegador envía solo los rasgos geométricos de cada cama (rasgosParaServidor) y las opciones elegidas; la
   función de Supabase «solicitar-presupuesto» vuelve a calcular gramos, tiempo y zonas de soporte con este mismo motor
   (verificarCalculo). Así el precio no depende de ninguna cifra de gramos o tiempo que mande el cliente.
   Una copia exacta de este archivo vive en supabase/functions/_shared/ (node supabase/sincronizar-motor.mjs).
   Si cambia CUALQUIER fórmula o coeficiente de este archivo: subir MOTOR_REVISION, ejecutar ese script y redesplegar la
   función. Mientras la web y la función tengan revisiones distintas, la función no da precio al momento (lo revisa el equipo).
   ============================================================ */
export const MOTOR_REVISION = '2026-10-08a';

const R_ESCALARES = ['alto', 'ancho', 'fondo', 'volumen', 'aLat', 'aArriba', 'aAbajo', 'aVol', 'aTecho', 'volSopE', 'aSopE', 'bucles'];
const R_LH = ['0.08', '0.12', '0.2'];   // claves de r.pintura (altura de capa de cada definición)

/* Rasgos de una cama listos para enviar (JSON): solo lo que usan estimar() y necesitaSoportes(), sin las mallas */
export function rasgosParaServidor(r) {
  const w = {};
  for (const k of R_ESCALARES) w[k] = Number(r[k]) || 0;
  w.mallaNoValida = !!r.mallaNoValida;
  w.zonas = Number(r.zonas) || 0;
  w.cortes = r.cortes ? { P: Array.from(r.cortes.P, Number), A: Array.from(r.cortes.A, Number), B: Array.from(r.cortes.B, Number) } : null;
  w.pintura = r.pintura
    ? Object.fromEntries(Object.entries(r.pintura).map(([lh, p]) => [lh, { cambios: p.cambios, flush: p.flush ?? null, capas: p.capas, capasMulti: p.capasMulti, colores: p.colores }]))
    : null;
  return w;
}

const esNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
/* Rasgos recibidos → objeto limpio (o null si algo no es válido). Nada de lo recibido llega a estimar() sin pasar por aquí. */
function sanearRasgos(w) {
  if (!w || typeof w !== 'object') return null;
  const r = {};
  for (const k of R_ESCALARES) {
    const [min, max] = k === 'volumen' ? [-1e12, 1e12] : k === 'bucles' ? [0, 1e6] : k === 'alto' || k === 'ancho' || k === 'fondo' ? [0, 1e5] : [0, 1e11];
    if (!esNum(w[k], min, max)) return null;
    r[k] = w[k];
  }
  if (typeof w.mallaNoValida !== 'boolean' || !esNum(w.zonas, 0, 1e5) || !Number.isInteger(w.zonas)) return null;
  r.mallaNoValida = w.mallaNoValida; r.zonas = w.zonas;
  if (w.cortes === null || w.cortes === undefined) return null;   // la tasadora de la web siempre los calcula: sin ellos se usaría otro modelo de tiempo
  {
    const { P, A, B } = w.cortes || {};
    const ok = [P, A, B].every((a) => Array.isArray(a) && a.length >= 1 && a.length <= 64 && a.length === (P || []).length && a.every((v) => esNum(v, 0, 1e12)));
    if (!ok) return null;
    r.cortes = { P: [...P], A: [...A], B: [...B] };
  }
  if (w.pintura === null || w.pintura === undefined) r.pintura = null;
  else {
    if (typeof w.pintura !== 'object') return null;
    r.pintura = {};
    for (const lh of R_LH) {
      const p = w.pintura[lh];
      if (p === undefined) continue;
      if (!p || !esNum(p.cambios, 0, 1e7) || !esNum(p.capas, 0, 1e6) || !esNum(p.capasMulti, 0, 1e6) || !esNum(p.colores, 0, 32) || !(p.flush === null || esNum(p.flush, 0, 1e12))) return null;
      r.pintura[lh] = { cambios: p.cambios, flush: p.flush, capas: p.capas, capasMulti: p.capasMulti, colores: p.colores };
    }
  }
  return r;
}

/* Identidades geométricas que cumple cualquier malla cerrada (comprobadas en las 69 piezas de calibración, con margen):
     · alto · aArriba ≥ volumen                       (el volumen no supera la altura por el área proyectada)
     · aLat ≥ 2·√π · volumen / √aArriba               (perímetro de cada corte ≥ el de un círculo de su área)
     · aAbajo ≈ aArriba                               (superficie cerrada: lo proyectado hacia arriba y hacia abajo coincide)
     · alto · media(áreas de los cortes) ≈ volumen    y    alto · media(perímetros) ≈ aLat
     · media(bucles de los cortes) = bucles, y al menos 1 bucle por corte
   Un envío que las incumple no viene de la tasadora de la web. Devuelve la lista de las que falla. */
function incoherencias(r) {
  const f = [];
  const V = r.volumen, cp = r.cortes;
  if (!(V > 0)) return ['volumen'];
  if (r.alto * r.aArriba < 0.97 * V) f.push('volumen-area');
  if (r.aLat < 0.9 * 2 * Math.sqrt(Math.PI) * V / Math.sqrt(Math.max(r.aArriba, 1e-9))) f.push('perimetro');
  if (!(r.aAbajo >= 0.9 * r.aArriba && r.aAbajo <= 1.1 * r.aArriba)) f.push('cierre');
  if (!cp) f.push('cortes');
  else {
    const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const eA = r.alto * media(cp.A) / V, eP = r.alto * media(cp.P) / Math.max(r.aLat, 1e-9);
    if (!(eA >= 0.75 && eA <= 1.7)) f.push('cortes-area');
    if (!(eP >= 0.8 && eP <= 1.35)) f.push('cortes-perimetro');
    if (Math.abs(media(cp.B) - r.bucles) > 1e-6 * Math.max(1, r.bucles) || cp.B.some((v) => v < 1) || r.bucles < 1) f.push('bucles');
  }
  return f;
}

/* Rehace el cálculo de la tasadora a partir de lo que envía el navegador.
   calc = { revision, conf: { definicion, pared, densidad, color, colores }, camas: [{ r, escala, med: [x, y, z] }] }
   limites = { ladoMm, horas, volumenMinCm3 } (los de config_tasadora; por defecto los de la web)
   Devuelve { ok: false, motivo, detalle? } si los datos no son válidos o no son coherentes (no hay precio al momento) o
   { ok: true, revision, motivos, gramos, segundos, zonas, mallaNoValida, camas: [{ gramos, segundos, soportes, zonas, lado, volumenCm3 }] }
   donde «revision» indica que alguna cama supera un umbral (lado, volumen o tiempo), tiene la malla no válida o un volumen
   sospechosamente bajo, con las opciones y la escala finales. */
export function verificarCalculo(calc, limites = {}) {
  const no = (motivo) => ({ ok: false, motivo });
  const L = { ladoMm: 200, horas: 15, volumenMinCm3: 4, ...limites };
  if (!calc || typeof calc !== 'object') return no('sin-calculo');
  if (calc.revision !== MOTOR_REVISION) return no('motor-desfasado');
  const c = calc.conf;
  if (!c || typeof c !== 'object') return no('opciones');
  const conf = { definicion: c.definicion, pared: c.pared, densidad: c.densidad, color: c.color, colores: Math.round(Number(c.colores)) };
  for (const g of ['definicion', 'pared', 'densidad']) if (typeof conf[g] !== 'string' || !Object.hasOwn(OPCIONES[g], conf[g])) return no('opciones');
  if (conf.color !== 'mono' && conf.color !== 'multi') return no('opciones');
  if (conf.color === 'multi' && !(conf.colores >= 2 && conf.colores <= 8)) return no('opciones');
  if (conf.color === 'mono') conf.colores = 1;
  if (!Array.isArray(calc.camas) || !calc.camas.length || calc.camas.length > 30) return no('camas');
  const camas = [], motivos = new Set();
  let gramos = 0, segundos = 0, zonas = 0, mallaNoValida = false;
  for (const k of calc.camas) {
    const r = sanearRasgos(k && k.r), escala = k && k.escala;
    if (!r) return no('rasgos');
    if (!esNum(escala, 1e-3, 100)) return no('escala');
    if (!Array.isArray(k.med) || k.med.length !== 3 || !k.med.every((v) => esNum(v, 1e-6, 1e5))) return no('medidas');
    // Las medidas que declara el cliente deben ser compatibles con la caja de impresión de los rasgos (giro rígido: entre 1/√3 y √3)
    const lado = Math.max(...k.med), ladoImpresion = Math.max(r.ancho, r.fondo, r.alto) * escala;
    if (!(ladoImpresion > 0) || lado * 1.02 < ladoImpresion / Math.sqrt(3) || lado > ladoImpresion * Math.sqrt(3) * 1.02) return no('medidas');
    const soportes = necesitaSoportes(r, { escala }) ? 'si' : 'no';
    // Malla no válida: la web avisa y lo revisa el equipo (no hay precio al momento). Si no, tiene que ser coherente
    if (r.mallaNoValida) motivos.add('malla');
    else {
      const f = incoherencias(r);
      if (soportes === 'si' && r.zonas < 1) f.push('zonas');
      if (f.length) return { ok: false, motivo: 'incoherente', detalle: f };
      // Un volumen de menos del 1 % de su caja no es de una pieza normal (la más hueca de las 69 de calibración: 2,7 %): lo mira una persona
      if (r.volumen < 0.01 * r.alto * r.ancho * r.fondo) motivos.add('volumen-bajo');
    }
    const est = estimar(r, { ...conf, escala, soportes });
    if (!Number.isFinite(est.gramos) || !Number.isFinite(est.segundos)) return no('calculo');
    const volumenCm3 = r.mallaNoValida ? Infinity : r.volumen * Math.pow(escala, 3) / 1000;
    if (lado > L.ladoMm + 1e-6) motivos.add('lado');
    if (volumenCm3 < L.volumenMinCm3 - 1e-6) motivos.add('volumen');
    if (est.segundos > L.horas * 3600) motivos.add('tiempo');
    const z = soportes === 'si' ? r.zonas : 0;
    gramos += est.gramos; segundos += est.segundos; zonas += z; mallaNoValida = mallaNoValida || r.mallaNoValida;
    camas.push({ gramos: est.gramos, segundos: est.segundos, soportes, zonas: z, lado, volumenCm3 });
  }
  return { ok: true, revision: motivos.size > 0, motivos: [...motivos], gramos, segundos, zonas, mallaNoValida, camas };
}
