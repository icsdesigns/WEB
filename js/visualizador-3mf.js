/* ============================================================
   SILAB 3D · Visualizador · Lector de proyectos 3MF (panel admin)
   Lee un 3MF de Bambu Studio / Orca / PrusaSlicer y prepara cada
   cama (placa) para el visualizador, conservando sus colores:
   · el filamento (extrusor) de cada objeto y de cada pieza
   · la pintura multicolor (paint_color / mmu_segmentation), que se
     subdivide igual que en el laminador
   Los colores salen de filament_colour del proyecto. Las piezas
   negativas, modificadores y bloqueadores no se dibujan.
   Sin DOM: funciona en el navegador y en Node.
   ============================================================ */

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
// Matriz 3MF «m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32» (vector fila)
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
const attr = (s, n) => { const m = new RegExp('(?:^|\\s)' + n.replace(':', '\\:') + '="([^"]*)"').exec(s); return m ? m[1] : null; };
const decodificar = (t) => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ruta = (p) => '/' + String(p).replace(/^\/+/, '');
const hexValido = (h) => /^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(h || '').trim());
const normalHex = (h) => { h = String(h).trim(); if (h[0] !== '#') h = '#' + h; return h.slice(0, 7).toUpperCase(); };

/* ---------- Pintura multicolor ----------
   Árbol del TriangleSelector (PrusaSlicer / Bambu / Orca) guardado en hexadecimal y leído desde el final.
   Cada nodo: bits 0-1 = lados divididos (0 = hoja); hoja: bits 2-3 = estado (3 → estado = siguiente nibble + 3,
   Bambu encadena 15 para estados altos); nodo dividido: bits 2-3 = lado especial y luego sus hijos en orden inverso.
   Estado 0 = sin pintar (filamento de la pieza); estado n = filamento n. */
function pintar(code, a, b, c, emitir) {
  let i = code.length - 1;
  const nib = () => (i >= 0 ? parseInt(code[i--], 16) || 0 : 0);
  const mitad = (p, q) => (p ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2] : null); // sin vértices: solo estados
  const rec = (v0, v1, v2, prof) => {
    const k = nib(), lados = k & 3;
    if (!lados || prof > 24) {
      let st = k >> 2;
      if (st === 3) { let n = nib(); while (n === 15) { st += 15; n = nib(); } st += n; }
      emitir(st, v0, v1, v2);
      return;
    }
    const e = (k >> 2) % 3, v = [v0, v1, v2];
    const r0 = v[e], r1 = v[(e + 1) % 3], r2 = v[(e + 2) % 3];
    let hijos;
    if (lados === 1) {
      const m12 = mitad(r1, r2);
      hijos = [[r0, r1, m12], [m12, r2, r0]];
    } else if (lados === 2) {
      const m01 = mitad(r0, r1), m20 = mitad(r2, r0);
      hijos = [[r0, m01, m20], [m01, r1, m20], [r1, r2, m20]];
    } else {
      const m01 = mitad(r0, r1), m12 = mitad(r1, r2), m20 = mitad(r2, r0);
      hijos = [[r0, m01, m20], [m01, r1, m12], [m12, r2, m20], [m01, m12, m20]];
    }
    for (let h = hijos.length - 1; h >= 0; h--) rec(hijos[h][0], hijos[h][1], hijos[h][2], prof + 1);
  };
  rec(a, b, c, 0);
}

/* ---------- Acumulador de una malla por filamento ---------- */
class Malla {
  constructor() { this.pos = new Float32Array(3 * 4096); this.idx = new Uint32Array(3 * 4096); this.nv = 0; this.ni = 0; }
  vertice(x, y, z) {
    if (this.nv * 3 + 3 > this.pos.length) { const n = new Float32Array(this.pos.length * 2); n.set(this.pos); this.pos = n; }
    const k = this.nv * 3; this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    return this.nv++;
  }
  triangulo(a, b, c) {
    if (this.ni + 3 > this.idx.length) { const n = new Uint32Array(this.idx.length * 2); n.set(this.idx); this.idx = n; }
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c;
  }
  final() { return { pos: this.pos.slice(0, this.nv * 3), idx: this.idx.slice(0, this.ni) }; }
}

/* Abre el 3MF. unzipSync/strFromU8 vienen de fflate. Devuelve
   { placas: [{ n, nombre, objetos, miniatura (Uint8Array PNG | null), filamentos: [slot…] }],
     filamentos: [{ slot, hex, tipo, perfil }], construir(n) } */
export function abrir3MF(u8, fflate) {
  const archivos = fflate.unzipSync(u8, {
    filter: (f) => /\.model$/i.test(f.name) || /(model_settings|project_settings)\.config$/i.test(f.name) ||
      /Slic3r_PE(_model)?\.config$/i.test(f.name) || /^Metadata\/plate_\d+\.png$/i.test(f.name) || /^Metadata\/thumbnail\.png$/i.test(f.name)
  });
  const modelos = {};
  let ajustes = '', proyecto = '', prusa = '';
  const pngs = {};
  for (const [nombre, datos] of Object.entries(archivos)) {
    if (/\.model$/i.test(nombre)) modelos[ruta(nombre)] = fflate.strFromU8(datos);
    else if (/model_settings\.config$/i.test(nombre)) ajustes = fflate.strFromU8(datos);
    else if (/project_settings\.config$/i.test(nombre)) proyecto = fflate.strFromU8(datos);
    else if (/Slic3r_PE\.config$/i.test(nombre)) prusa = fflate.strFromU8(datos);
    else if (/\.png$/i.test(nombre)) pngs[nombre.replace(/^\/+/, '')] = datos;
  }
  const raiz = Object.keys(modelos).find((k) => /^\/3D\/3dmodel\.model$/i.test(k)) || Object.keys(modelos)[0];
  if (!raiz) throw new Error('El archivo no tiene ningún modelo 3D. ¿Es un 3MF?');

  /* Colores de los filamentos del proyecto */
  let proy = {};
  try { proy = JSON.parse(proyecto) || {}; } catch (e) { /* 3MF sin ajustes de Bambu/Orca */ }
  let colores = Array.isArray(proy.filament_colour) ? proy.filament_colour : [];
  let tipos = Array.isArray(proy.filament_type) ? proy.filament_type : [];
  const perfiles = Array.isArray(proy.filament_settings_id) ? proy.filament_settings_id : [];
  if (!colores.length && prusa) { // PrusaSlicer: ; extruder_colour = #FF0000;#00FF00
    const m = /;\s*(?:extruder_colour|filament_colour)\s*=\s*([^\n]*)/.exec(prusa);
    if (m) colores = m[1].split(';').map((x) => x.trim());
    const t = /;\s*filament_type\s*=\s*([^\n]*)/.exec(prusa);
    if (t) tipos = t[1].split(';').map((x) => x.trim());
  }
  const PREDETERMINADOS = ['#FFFFFF', '#161616', '#BC556D', '#2F6FB5', '#E8B400', '#3C9A5F', '#D9622B', '#7A4BA8'];
  const filamento = (slot) => ({
    slot,
    hex: hexValido(colores[slot - 1]) ? normalHex(colores[slot - 1]) : PREDETERMINADOS[(slot - 1) % PREDETERMINADOS.length],
    tipo: tipos[slot - 1] || tipos[0] || 'PLA',
    perfil: perfiles[slot - 1] || ''
  });

  /* Ajustes de Bambu/Orca por objeto (extrusor, nombre) y por pieza (subtipo, extrusor) en el orden de sus componentes */
  const ajustesObj = new Map();
  for (const ob of ajustes.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const cab = ob[2].split('<part')[0];
    const e = /key="extruder"\s+value="(\d+)"/.exec(cab), nom = /key="name"\s+value="([^"]*)"/.exec(cab);
    const piezas = [...ob[2].matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)].map((x) => {
      const ep = /key="extruder"\s+value="(\d+)"/.exec(x[2]);
      return { sub: attr(x[1], 'subtype'), ext: ep ? +ep[1] : null };
    });
    ajustesObj.set(attr(ob[1], 'id'), { ext: e ? +e[1] : null, nombre: nom ? decodificar(nom[1]) : '', piezas });
  }
  // PrusaSlicer: extrusor y tipo de cada volumen (rango de triángulos de la malla)
  const prusaObj = new Map();
  for (const ob of prusa.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const ext = /key="extruder"\s+value="(\d+)"/.exec(ob[2].split('<volume')[0]);
    const vols = [...ob[2].matchAll(/<volume\b([^>]*)>([\s\S]*?)<\/volume>/g)].map((v) => {
      const ve = /key="extruder"\s+value="(\d+)"/.exec(v[2]), vt = /key="volume_type"\s+value="(\w+)"/.exec(v[2]);
      const mod = /key="modifier"\s+value="1"/.test(v[2]);
      return { desde: +attr(v[1], 'firstid'), hasta: +attr(v[1], 'lastid'), ext: ve ? +ve[1] : null, dibujar: vt ? vt[1] === 'ModelPart' : !mod };
    });
    prusaObj.set(attr(ob[1], 'id'), { ext: ext ? +ext[1] : null, vols });
  }

  /* Objetos de todos los .model (con malla o con componentes) */
  const objetos = new Map();
  const mallas = new Map(); // se leen al construir, solo las que hacen falta
  for (const [r, txt] of Object.entries(modelos)) {
    for (const m of txt.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
      const id = attr(m[1], 'id'), cuerpo = m[2];
      const o = { r, id, cuerpo: cuerpo.includes('<mesh') ? cuerpo : null, comps: [] };
      for (const c of cuerpo.matchAll(/<component\b([^>]*)\/?>/g)) {
        const p = attr(c[1], 'p:path') || attr(c[1], 'path');
        o.comps.push({ clave: (p ? ruta(p) : r) + '#' + attr(c[1], 'objectid'), m: matriz(attr(c[1], 'transform')) });
      }
      objetos.set(r + '#' + id, o);
    }
  }
  const leerMalla = (clave) => {
    if (mallas.has(clave)) return mallas.get(clave);
    const o = objetos.get(clave);
    let res = null;
    if (o && o.cuerpo) {
      const v = [];
      for (const x of o.cuerpo.matchAll(/<vertex\b([^>]*)\/?>/g)) {
        const r = /x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/.exec(x[1]);
        if (r) v.push(+r[1], +r[2], +r[3]); else v.push(+attr(x[1], 'x'), +attr(x[1], 'y'), +attr(x[1], 'z'));
      }
      const t = [], pint = [];
      let hayPintura = false;
      for (const x of o.cuerpo.matchAll(/<triangle\b([^>]*)\/?>/g)) {
        const a = x[1];
        const r = /v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/.exec(a);
        if (r) t.push(+r[1], +r[2], +r[3]); else t.push(+attr(a, 'v1'), +attr(a, 'v2'), +attr(a, 'v3'));
        const pc = /(?:paint_color|mmu_segmentation)="([^"]*)"/.exec(a);
        pint.push(pc && pc[1] ? pc[1] : null);
        if (pc && pc[1]) hayPintura = true;
      }
      res = { verts: Float64Array.from(v), tris: Uint32Array.from(t), pint: hayPintura ? pint : null };
    }
    mallas.set(clave, res);
    return res;
  };

  /* Elementos del build (en orden) y su número de instancia por objeto */
  const build = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(modelos[raiz]);
  const elementos = [];
  const cuenta = new Map();
  if (build) for (const it of build[1].matchAll(/<item\b([^>]*)\/?>/g)) {
    const oid = attr(it[1], 'objectid'), p = attr(it[1], 'p:path');
    const inst = cuenta.get(oid) || 0; cuenta.set(oid, inst + 1);
    elementos.push({ oid, inst, clave: (p ? ruta(p) : raiz) + '#' + oid, m: matriz(attr(it[1], 'transform')), imprimible: attr(it[1], 'printable') !== '0' });
  }

  /* Camas de Bambu/Orca; sin ellas, una sola con todo */
  const placas = [];
  for (const pl of ajustes.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const n = +((/key="plater_id"\s+value="(\d+)"/.exec(pl[1]) || [])[1] || placas.length + 1);
    const nombre = decodificar((/key="plater_name"\s+value="([^"]*)"/.exec(pl[1]) || [])[1] || '');
    const inst = [...pl[1].matchAll(/<model_instance>([\s\S]*?)<\/model_instance>/g)].map((mi) => ({
      oid: (/key="object_id"\s+value="(\d+)"/.exec(mi[1]) || [])[1],
      inst: +((/key="instance_id"\s+value="(\d+)"/.exec(mi[1]) || [])[1] || 0)
    }));
    const els = inst.map((x) => elementos.find((e) => e.oid === x.oid && e.inst === x.inst)).filter((e) => e && e.imprimible);
    placas.push({ n, nombre, els });
  }
  if (!placas.length) placas.push({ n: 1, nombre: '', els: elementos.filter((e) => e.imprimible) });

  /* Recorre los objetos de una cama con sus transformaciones. visita(clave, M, ext, rango) por cada malla dibujable */
  const recorrer = (els, visita) => {
    const rec = (clave, M, ext, prof, ajRaiz) => {
      const o = objetos.get(clave);
      if (!o || prof > 16) return;
      if (o.cuerpo) {
        const po = prof === 0 ? prusaObj.get(o.id) : null;
        if (po && po.vols.length) for (const v of po.vols) { if (v.dibujar) visita(clave, M, v.ext || po.ext || ext, [v.desde, v.hasta]); }
        else visita(clave, M, ext, null);
      }
      o.comps.forEach((c, i) => {
        const pz = ajRaiz && ajRaiz.piezas[i];
        if (pz && pz.sub && pz.sub !== 'normal_part') return; // negativas, modificadores, bloqueadores
        rec(c.clave, componer(c.m, M), (pz && pz.ext) || ext, prof + 1, null);
      });
    };
    for (const e of els) {
      const aj = ajustesObj.get(e.oid);
      const po = prusaObj.get(e.oid);
      rec(e.clave, e.m, (aj && aj.ext) || (po && po.ext) || 1, 0, aj);
    }
  };

  const infoPlacas = placas.filter((p) => p.els.length).map((p) => {
    const usados = new Set(), piezas = { n: 0 };
    recorrer(p.els, (clave, M, ext) => {
      piezas.n++;
      const ms = leerMallaSoloPintura(clave);
      usados.add(ext);
      if (ms) for (const s of ms) usados.add(s === 0 ? ext : s);
    });
    const nombres = [...new Set(p.els.map((e) => (ajustesObj.get(e.oid) || {}).nombre).filter(Boolean))];
    const png = pngs['Metadata/plate_' + p.n + '.png'] || (placas.length === 1 ? pngs['Metadata/thumbnail.png'] : null) || null;
    return { n: p.n, nombre: p.nombre, objetos: nombres, piezas: piezas.n, miniatura: png, filamentos: [...usados].sort((a, b) => a - b), _els: p.els };
  });
  // Estados de pintura presentes en una malla, sin leer sus vértices (para listar los colores de cada cama)
  function leerMallaSoloPintura(clave) {
    const o = objetos.get(clave);
    if (!o || !o.cuerpo || !/(paint_color|mmu_segmentation)="/.test(o.cuerpo)) return null;
    const out = new Set();
    for (const x of o.cuerpo.matchAll(/(?:paint_color|mmu_segmentation)="([^"]+)"/g)) {
      pintar(x[1], null, null, null, (st) => out.add(st));
    }
    return out;
  }

  /* Malla de una cama: { bbox, slots: [{ slot, hex, pos, idx }] } en milímetros, Z hacia arriba */
  function construir(n) {
    const p = infoPlacas.find((x) => x.n === n);
    if (!p) throw new Error('No existe la cama ' + n);
    const porSlot = new Map();
    const malla = (s) => { let m = porSlot.get(s); if (!m) { m = new Malla(); porSlot.set(s, m); } return m; };
    recorrer(p._els, (clave, M, ext, rango) => {
      const g = leerMalla(clave);
      if (!g) return;
      const { verts: v, tris: t, pint } = g;
      const nt = t.length / 3;
      const a0 = rango ? Math.max(0, rango[0]) : 0, a1 = rango ? Math.min(nt - 1, rango[1]) : nt - 1;
      const tx = (k) => {
        const x = v[k * 3], y = v[k * 3 + 1], z = v[k * 3 + 2];
        return [x * M[0] + y * M[3] + z * M[6] + M[9], x * M[1] + y * M[4] + z * M[7] + M[10], x * M[2] + y * M[5] + z * M[8] + M[11]];
      };
      // Si la transformación refleja la pieza, se invierte el sentido de los triángulos
      const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
      const giro = det < 0;
      const mapas = new Map(); // slot → Int32Array vértice original → vértice en la malla del slot
      const indice = (s, k) => {
        let mp = mapas.get(s);
        if (!mp) { mp = new Int32Array(v.length / 3).fill(-1); mapas.set(s, mp); }
        if (mp[k] < 0) { const q = tx(k); mp[k] = malla(s).vertice(q[0], q[1], q[2]); }
        return mp[k];
      };
      for (let i = a0; i <= a1; i++) {
        const A = t[i * 3], B = t[i * 3 + 1], C = t[i * 3 + 2];
        const code = pint && pint[i];
        if (!code) {
          const m = malla(ext), ia = indice(ext, A), ib = indice(ext, B), ic = indice(ext, C);
          if (giro) m.triangulo(ia, ic, ib); else m.triangulo(ia, ib, ic);
          continue;
        }
        pintar(code, tx(A), tx(B), tx(C), (st, p0, p1, p2) => {
          const m = malla(st === 0 ? ext : st);
          const ia = m.vertice(p0[0], p0[1], p0[2]), ib = m.vertice(p1[0], p1[1], p1[2]), ic = m.vertice(p2[0], p2[1], p2[2]);
          if (giro) m.triangulo(ia, ic, ib); else m.triangulo(ia, ib, ic);
        });
      }
    });
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const slots = [...porSlot.entries()].sort((a, b) => a[0] - b[0]).map(([slot, m]) => {
      const f = m.final();
      for (let i = 0; i < f.pos.length; i += 3) for (let c = 0; c < 3; c++) { const x = f.pos[i + c]; if (x < mn[c]) mn[c] = x; if (x > mx[c]) mx[c] = x; }
      return { slot, hex: filamento(slot).hex, pos: f.pos, idx: f.idx };
    }).filter((s) => s.idx.length);
    if (!slots.length) throw new Error('La cama ' + n + ' no tiene piezas que dibujar');
    return { bbox: [...mn, ...mx], slots };
  }

  const usadosTotal = new Set(infoPlacas.flatMap((p) => p.filamentos));
  return {
    placas: infoPlacas.map(({ _els, ...x }) => x),
    filamentos: [...usadosTotal].sort((a, b) => a - b).map(filamento),
    filamento,
    construir
  };
}
