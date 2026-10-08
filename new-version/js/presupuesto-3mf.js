/* ============================================================
   SILAB 3D · Lector de 3MF para el Presupuesto instantáneo
   Admite los 3MF de Bambu Studio, Orca, PrusaSlicer y MakerWorld:
   objetos en archivos separados (extensión de producción, p:path),
   componentes anidados con transformaciones y piezas pintadas por
   colores (paint_color). Devuelve los triángulos ya colocados, el color
   (extrusor) de cada uno y la matriz de purga del proyecto. Las piezas
   «negativas» (huecos) restan volumen y los modificadores no se cuentan.
   ============================================================ */

// Matriz 3MF «m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32» (vector fila)
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function matriz(txt) {
  if (!txt) return IDENT;
  const v = txt.trim().split(/\s+/).map(Number);
  return v.length === 12 && v.every(Number.isFinite) ? v : IDENT;
}
// a después de b: p·A·B
function componer(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    a[9] * b[0] + a[10] * b[3] + a[11] * b[6] + b[9], a[9] * b[1] + a[10] * b[4] + a[11] * b[7] + b[10], a[9] * b[2] + a[10] * b[5] + a[11] * b[8] + b[11]
  ];
}
const attr = (s, n) => { const m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(s); return m ? m[1] : null; };

// Extrusores (estados, 1 = filamento 1…) presentes en un paint_color: árbol del TriangleSelector de Bambu/Orca,
// que se lee desde el final de la cadena hexadecimal. El estado 0 es «sin pintar» (usa el extrusor de la pieza).
function estadosPintura(code) {
  const out = new Set();
  let i = code.length - 1;
  const nib = () => (i >= 0 ? parseInt(code[i--], 16) : 0);
  const rec = () => {
    const c = nib(), split = c & 3;
    if (split) { for (let k = 0; k <= split; k++) rec(); return; }
    let st = c >> 2;
    if (st === 3) { let n = nib(); st = 3; while (n === 15) { st += 15; n = nib(); } st += n; }
    out.add(st);
  };
  while (i >= 0) rec();
  return out;
}
// Ajustes de laminado que, puestos por objeto o por pieza, cambian el resultado (Bambu/Orca y PrusaSlicer)
const AJUSTES = {
  layer_height: 'altura de capa', wall_loops: 'paredes', perimeters: 'paredes',
  top_shell_layers: 'capas superiores', bottom_shell_layers: 'capas inferiores', top_solid_layers: 'capas superiores', bottom_solid_layers: 'capas inferiores',
  sparse_infill_density: 'relleno', fill_density: 'relleno', sparse_infill_pattern: 'patrón de relleno', fill_pattern: 'patrón de relleno',
  enable_support: 'soportes', support_material: 'soportes', support_type: 'tipo de soporte', support_threshold_angle: 'ángulo de soporte',
  raft_layers: 'balsa', fuzzy_skin: 'piel rugosa'
};
const decodificar = (t) => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Pares <metadata key="…" value="…"/> (también con type="object|volume") que son ajustes relevantes y difieren del proyecto
function ajustesDe(txt, proy) {
  const out = new Set();
  for (const m of txt.matchAll(/<metadata\b([^>]*)\/?>/g)) {
    const k = attr(m[1], 'key'), v = attr(m[1], 'value');
    if (!k || v === null || !AJUSTES[k]) continue;
    const b = proy[k];
    if (b !== undefined && String(Array.isArray(b) ? b[0] : b) === v) continue;
    out.add(AJUSTES[k]);
  }
  return [...out];
}
// Forma aproximada de una malla (o de un rango de triángulos): volumen frente al de su caja alineada con los ejes de la malla.
// Caja ≈ 1, cilindro ≈ 0,785, esfera ≈ 0,52. Si no encaja en ninguna, «otra».
function formaDe(o, desde, hasta) {
  if (!o || !o.verts || !o.tris) return 'otra';
  const v = o.verts, t = o.tris, nt = t.length / 3, a = desde || 0, b = Math.min(hasta === undefined || !Number.isFinite(hasta) ? nt - 1 : hasta, nt - 1);
  if (b - a < 3) return 'otra';
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let vol = 0;
  for (let i = a; i <= b; i++) {
    const p = t[i * 3] * 3, q = t[i * 3 + 1] * 3, r = t[i * 3 + 2] * 3;
    vol += v[p] * (v[q + 1] * v[r + 2] - v[r + 1] * v[q + 2]) - v[p + 1] * (v[q] * v[r + 2] - v[r] * v[q + 2]) + v[p + 2] * (v[q] * v[r + 1] - v[r] * v[q + 1]);
    for (const k of [p, q, r]) for (let c = 0; c < 3; c++) { if (v[k + c] < mn[c]) mn[c] = v[k + c]; if (v[k + c] > mx[c]) mx[c] = v[k + c]; }
  }
  const caja = (mx[0] - mn[0]) * (mx[1] - mn[1]) * (mx[2] - mn[2]);
  if (!(caja > 0)) return 'otra';
  const rel = Math.abs(vol) / 6 / caja;
  return rel > 0.9 && rel < 1.05 ? 'caja' : rel > 0.7 && rel < 0.83 ? 'cilindro' : rel > 0.46 && rel < 0.58 ? 'esfera' : 'otra';
}
const TIPOS_PIEZA = { negative_part: 'negativa', modifier_part: 'modificador', modifier: 'modificador', support_blocker: 'bloqueador', support_enforcer: 'forzador' };
const TIPOS_PE = { NegativeVolume: 'negativa', ParameterModifier: 'modificador', SupportBlocker: 'bloqueador', SupportEnforcer: 'forzador' };
const bitsDe = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };

// Archivos del 3MF que lee leer3MF (el worker los descomprime antes con el descompresor nativo del navegador)
export const archivoNecesario3MF = (nombre) => /\.model$/i.test(nombre) || /model_settings\.config$/i.test(nombre) || /project_settings\.config$/i.test(nombre) || /layer_config_ranges\.xml$/i.test(nombre) || /Slic3r_PE_model\.config$/i.test(nombre);

/* Devuelve { pos, colores, mascara, matrizPurga }
     pos          triángulos ya colocados (9 valores por triángulo)
     colores      nº de colores del archivo (0/1 = monocolor)
     mascara      Uint32Array, un valor por triángulo: bit e = el triángulo se imprime con el extrusor e
                  (pintura del triángulo, o extrusor de su pieza/objeto). null si solo hay un color.
     matrizPurga  { n, v, mult } flush_volumes_matrix del proyecto (mm³ por cambio entre filamentos) y flush_multiplier
                  (Bambu purga v × mult), o null
     modificadores [{ tipo, objeto, pieza, detalle, forma }] de los objetos imprimibles. tipo: negativa | modificador | bloqueador |
                  forzador | ajuste (ajustes propios del objeto o de la pieza) | rango (ajustes por rango de altura);
                  forma: cilindro | caja | esfera | otra (solo en partes con malla propia) */
export function leer3MF(u8, fflate) {
  const archivos = fflate.unzipSync(u8, { filter: (f) => archivoNecesario3MF(f.name) });
  const modelos = {};
  let ajustes = '', proyecto = '', rangos = '', prusa = '';
  for (const [nombre, datos] of Object.entries(archivos)) {
    if (/\.model$/i.test(nombre)) modelos['/' + nombre.replace(/^\/+/, '')] = fflate.strFromU8(datos);
    else if (/project_settings\.config$/i.test(nombre)) proyecto = fflate.strFromU8(datos);
    else if (/layer_config_ranges\.xml$/i.test(nombre)) rangos = fflate.strFromU8(datos);
    else if (/Slic3r_PE_model\.config$/i.test(nombre)) prusa = fflate.strFromU8(datos);
    else ajustes = fflate.strFromU8(datos);
  }
  const rutas = Object.keys(modelos);
  const raiz = rutas.find((k) => /^\/3D\/3dmodel\.model$/i.test(k)) || rutas[0];
  if (!raiz) throw new Error('3MF sin modelo');

  // Ajustes de Bambu/Orca por objeto: extrusor del objeto y, por pieza (en el orden de sus componentes), su subtipo
  // (normal_part, negative_part, modifier, support_blocker…) y su extrusor. Las negativas (huecos) restan volumen;
  // los modificadores y bloqueadores de soporte no se imprimen.
  let proy = {};
  try { proy = JSON.parse(proyecto) || {}; } catch (e) { /* sin ajustes de proyecto */ }
  const ajustesObj = new Map();
  for (const ob of ajustes.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const cab = ob[2].split('<part')[0];
    const e = /key="extruder"\s+value="(\d+)"/.exec(cab);
    const piezas = [...ob[2].matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)].map((x) => {
      const ep = /key="extruder"\s+value="(\d+)"/.exec(x[2]);
      const nm = /key="name"\s+value="([^"]*)"/.exec(x[2]);
      return { sub: attr(x[1], 'subtype'), ext: ep ? +ep[1] : null, nombre: nm ? decodificar(nm[1]) : '', props: ajustesDe(x[2], proy) };
    });
    const nom = /key="name"\s+value="([^"]*)"/.exec(cab);
    ajustesObj.set(attr(ob[1], 'id'), { ext: e ? +e[1] : null, piezas, nombre: nom ? decodificar(nom[1]) : '', props: ajustesDe(cab, proy) });
  }

  const objetos = new Map();
  let pintados = 0, conMaterial = 0;
  for (const [ruta, txt] of Object.entries(modelos)) {
    for (const m of txt.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
      const id = attr(m[1], 'id');
      const cuerpo = m[2];
      const o = { verts: null, tris: null, pint: null, comps: [], ajustes: ruta === raiz ? ajustesObj.get(id) : null };
      if (cuerpo.includes('<vertices')) {
        const v = [];
        for (const x of cuerpo.matchAll(/<vertex\b([^>]*)\/?>/g)) {
          const a = x[1];
          const r = /x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/.exec(a);
          if (r) v.push(+r[1], +r[2], +r[3]); else v.push(+attr(a, 'x'), +attr(a, 'y'), +attr(a, 'z'));
        }
        const t = [], pint = [];
        for (const x of cuerpo.matchAll(/<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"([^>]*)>/g)) {
          t.push(+x[1], +x[2], +x[3]);
          const pc = x[4] && /paint_color="([^"]*)"/.exec(x[4]);
          pint.push(pc ? pc[1] : null);
          if (x[4]) { if (pc) pintados++; else if (/\bp1="/.test(x[4])) conMaterial++; }
        }
        o.verts = Float64Array.from(v); o.tris = Uint32Array.from(t); o.pint = pint;
      }
      for (const c of cuerpo.matchAll(/<component\b([^>]*)\/?>/g)) {
        const a = c[1];
        const p = attr(a, 'p:path') || attr(a, 'path');
        o.comps.push({ clave: (p ? '/' + p.replace(/^\/+/, '') : ruta) + '#' + attr(a, 'objectid'), m: matriz(attr(a, 'transform')) });
      }
      objetos.set(ruta + '#' + id, o);
    }
  }

  const partes = [], masks = [], cachePint = new Map();
  let total = 0, union = 0;
  const colocar = (clave, M, prof, modo, ext) => {
    const o = objetos.get(clave);
    if (!o || prof > 16 || modo === 'ignorar') return;
    if (o.verts) {
      const { verts: v, tris: t } = o, out = new Float32Array(t.length * 3), mk = new Uint32Array(t.length / 3);
      // pieza negativa: se invierte el sentido de los triángulos y su volumen resta
      const giro = modo === 'negativo';
      for (let ii = 0; ii < t.length; ii++) {
        const i = giro && ii % 3 === 1 ? ii + 1 : giro && ii % 3 === 2 ? ii - 1 : ii;
        const k = t[ii] * 3, x = v[k], y = v[k + 1], z = v[k + 2];
        out[i * 3] = x * M[0] + y * M[3] + z * M[6] + M[9];
        out[i * 3 + 1] = x * M[1] + y * M[4] + z * M[7] + M[10];
        out[i * 3 + 2] = x * M[2] + y * M[5] + z * M[8] + M[11];
      }
      if (!giro) for (let j = 0; j < mk.length; j++) {
        const pc = o.pint[j];
        let m = 0;
        if (!pc) m = 1 << Math.min(ext, 31);
        else {
          let s = cachePint.get(pc);
          if (!s) { s = estadosPintura(pc); cachePint.set(pc, s); }
          for (const st of s) m |= 1 << Math.min(st === 0 ? ext : st, 31);
        }
        mk[j] = m; union |= m;
      }
      partes.push(out); masks.push(mk); total += out.length;
    }
    o.comps.forEach((c, n) => {
      const pz = o.ajustes && o.ajustes.piezas[n];
      const st = pz && pz.sub;
      colocar(c.clave, componer(c.m, M), prof + 1, modo === 'normal' ? (st === 'negative_part' ? 'negativo' : st && st !== 'normal_part' ? 'ignorar' : 'normal') : modo, (pz && pz.ext) || ext);
    });
  };
  const build = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(modelos[raiz]);
  if (build) for (const it of build[1].matchAll(/<item\b([^>]*)\/?>/g)) {
    if (attr(it[1], 'printable') === '0') continue;
    const p = attr(it[1], 'p:path'), oid = attr(it[1], 'objectid');
    const ao = ajustesObj.get(oid);
    colocar((p ? '/' + p.replace(/^\/+/, '') : raiz) + '#' + oid, matriz(attr(it[1], 'transform')), 0, 'normal', (ao && ao.ext) || 1);
  }

  // Modificadores de los objetos imprimibles (cada objeto cuenta una vez, aunque se repita en la placa)
  const modificadores = [];
  const lista = (t) => [...new Set(t)].join(', ');
  if (build) {
    const vistos = new Set();
    for (const it of build[1].matchAll(/<item\b([^>]*)\/?>/g)) {
      if (attr(it[1], 'printable') === '0') continue;
      const p = attr(it[1], 'p:path'), oid = attr(it[1], 'objectid'), clave = (p ? '/' + p.replace(/^\/+/, '') : raiz) + '#' + oid;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const o = objetos.get(clave), ao = ajustesObj.get(oid) || { piezas: [], props: [], nombre: '' };
      if (!o) continue;
      if (ao.props.length) modificadores.push({ tipo: 'ajuste', objeto: ao.nombre, pieza: '', detalle: lista(ao.props), forma: null });
      ao.piezas.forEach((pz, n) => {
        const hijo = o.comps[n] && objetos.get(o.comps[n].clave);
        const tipo = TIPOS_PIEZA[pz.sub];
        if (tipo) modificadores.push({ tipo, objeto: ao.nombre, pieza: pz.nombre, detalle: lista(pz.props), forma: hijo ? formaDe(hijo) : 'otra' });
        else if (pz.props.length) modificadores.push({ tipo: 'ajuste', objeto: ao.nombre, pieza: pz.nombre, detalle: lista(pz.props), forma: null });
      });
      // PrusaSlicer: volúmenes dentro de una malla única (rango de triángulos) y ajustes por objeto o por volumen
      const po = prusa && new RegExp('<object\\b[^>]*\\bid="' + oid + '"[^>]*>([\\s\\S]*?)</object>').exec(prusa);
      if (po) {
        const ap = ajustesDe(po[1].replace(/<volume\b[\s\S]*?<\/volume>/g, ''), proy);
        if (ap.length) modificadores.push({ tipo: 'ajuste', objeto: ao.nombre, pieza: '', detalle: lista(ap), forma: null });
        for (const vol of po[1].matchAll(/<volume\b([^>]*)>([\s\S]*?)<\/volume>/g)) {
          const vt = /key="volume_type"\s+value="(\w+)"/.exec(vol[2]), nm = /key="name"\s+value="([^"]*)"/.exec(vol[2]);
          const tipo = vt ? TIPOS_PE[vt[1]] : /key="modifier"\s+value="1"/.test(vol[2]) ? 'modificador' : null;
          const pieza = nm ? decodificar(nm[1]) : '', pp = ajustesDe(vol[2], proy);
          if (tipo) modificadores.push({ tipo, objeto: ao.nombre, pieza, detalle: lista(pp), forma: formaDe(o, +attr(vol[1], 'firstid'), +attr(vol[1], 'lastid')) });
          else if (pp.length) modificadores.push({ tipo: 'ajuste', objeto: ao.nombre, pieza, detalle: lista(pp), forma: null });
        }
      }
    }
  }
  // Ajustes por rango de altura (Bambu/Orca): <object id="…"><range min max>…
  for (const ob of rangos.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const ao = ajustesObj.get(attr(ob[1], 'id')), n = (ob[2].match(/<range\b/g) || []).length;
    if (n) modificadores.push({ tipo: 'rango', objeto: ao ? ao.nombre : '', pieza: '', detalle: n + (n > 1 ? ' rangos de altura' : ' rango de altura'), forma: null });
  }

  const pos = new Float32Array(total), mask = new Uint32Array(total / 9);
  let o = 0, q = 0;
  for (let i = 0; i < partes.length; i++) { pos.set(partes[i], o); o += partes[i].length; mask.set(masks[i], q); q += masks[i].length; }
  const extrusores = new Set([...ajustes.matchAll(/key="extruder"\s+value="(\d+)"/g)].map((x) => x[1]).filter((x) => x !== '0'));
  const enMascara = bitsDe(union);
  const colores = enMascara >= 2 ? enMascara : pintados || conMaterial ? Math.max(2, extrusores.size) : extrusores.size;
  let matrizPurga = null;
  try {
    const v = (proy.flush_volumes_matrix || []).map(Number);
    const n = Math.round(Math.sqrt(v.length));
    const fm = Number(Array.isArray(proy.flush_multiplier) ? proy.flush_multiplier[0] : proy.flush_multiplier);
    if (n >= 2 && n * n === v.length && v.every(Number.isFinite)) matrizPurga = { n, v, mult: fm > 0 ? fm : 1 };
  } catch (e) { /* sin matriz de purga: se usa el valor de respaldo */ }
  return { pos, colores, mascara: enMascara >= 2 ? mask : null, matrizPurga, modificadores };
}
