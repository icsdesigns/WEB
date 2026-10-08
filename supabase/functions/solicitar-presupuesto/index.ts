// ============================================================
//  Supabase Edge Function:  solicitar-presupuesto
//  «Solicitar presupuesto» de Configura tu proyecto (página 4).
//
//  1. Genera el localizador (#S3D- + 6 caracteres) y guarda la solicitud completa
//     en la tabla solicitudes_presupuesto.
//  2. Si la tasadora dio una estimación sin revisión manual, calcula el precio con
//     la fórmula de 3DCalc leyendo sus tarifas de Firebase (nunca salen al navegador).
//     Los gramos, el tiempo y las zonas de soporte NO se toman de lo que envía el navegador: la función
//     rehace el cálculo con el motor de la tasadora (_shared/presupuesto-motor.js, copia de la web) a partir
//     de los rasgos geométricos de cada cama, así que el precio no se puede alterar desde el cliente.
//     Si el motor de la web y el de la función son de revisiones distintas, no hay precio al momento.
//  3. Responde a la web al momento ({ localizador, precio }) y, después, deja el
//     pedido en Firebase (pedidos_web/{localizador}) para que 3DCalc lo autoguarde y
//     envía el aviso por email a SILAB3D (Resend).
//
//  Secretos (Edge Functions → Secrets):
//    RESEND_API_KEY            clave de Resend (re_…)
//    FIREBASE_SERVICE_ACCOUNT  JSON completo de la cuenta de servicio de Firebase
//    FIREBASE_UID              UID de tu usuario de 3DProject (Firebase → Authentication)
//  Opcionales: DEST_EMAIL (silab3d@gmail.com), FROM_EMAIL ("SILAB 3D <onboarding@resend.dev>")
//  SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
//
//  Configuración de la vinculación: tabla config_tasadora, clave «vinculacion_3dcalc»
//  (se edita en el panel de administración). Si falta, se usan los valores de CONFIG_DEFECTO.
// ============================================================

import { verificarCalculo, MOTOR_REVISION, formatoTiempo } from "../_shared/presupuesto-motor.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DEST_EMAIL = Deno.env.get("DEST_EMAIL") ?? "silab3d@gmail.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "SILAB 3D <onboarding@resend.dev>";
const FIREBASE_UID = Deno.env.get("FIREBASE_UID") ?? "";
let CUENTA: { project_id: string; client_email: string; private_key: string } | null = null;
try { CUENTA = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "null"); } catch (_) { CUENTA = null; }

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ---------- Configuración de la vinculación (panel de administración) ---------- */
const CONFIG_DEFECTO = {
  empresa: "SILAB3D",
  impresora: "",                                   // vacío: la primera impresora de 3DCalc
  unidades: 1,
  filamento: { resistentes: "PETG", artisticas: "PLA" },
  diseno: "No necesario",
  probabilidad_error: "Media (50%)",
  urgencia_flexible: "Normal",
  urgentes_con_precio: false,                      // urgentes: sin precio al momento (los valora el equipo)
  gasto_misc: 1,
  postproc_modo: "Total",                          // casilla «por unidad» sin marcar
  postproc_tramos: { limpio_max: 20, sencillo_max: 300 },   // zonas de soporte
  produccion: { activar: true, tests: 1, dificultad: "Compleja" },
  precio_activo: true,                             // interruptor general del precio al momento
};
type Config = typeof CONFIG_DEFECTO;

async function sb(path: string, init: RequestInit = {}) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}
let cacheConfig: { t: number; v: Config } | null = null;
async function leerConfig(): Promise<Config> {
  if (cacheConfig && Date.now() - cacheConfig.t < 60_000) return cacheConfig.v;
  let v = CONFIG_DEFECTO;
  try {
    const r = await sb("config_tasadora?clave=eq.vinculacion_3dcalc&select=valor");
    const filas = await r.json();
    if (Array.isArray(filas) && filas[0]?.valor) v = mezclar(CONFIG_DEFECTO, filas[0].valor);
  } catch (_) { /* valores por defecto */ }
  cacheConfig = { t: Date.now(), v };
  return v;
}
function mezclar<T>(base: T, extra: unknown): T {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return (extra ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, val] of Object.entries(extra as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? mezclar(b, val) : val;
  }
  return out as T;
}

/* ---------- Límites de la tasadora (config_tasadora, clave «tasadora»: los mismos que aplica la web) ---------- */
const LIMITES_DEFECTO = { ladoMm: 200, horas: 15, volumenMinCm3: 4 };
let cacheLimites: { t: number; v: typeof LIMITES_DEFECTO } | null = null;
async function leerLimites(): Promise<typeof LIMITES_DEFECTO> {
  if (cacheLimites && Date.now() - cacheLimites.t < 60_000) return cacheLimites.v;
  let v = LIMITES_DEFECTO;
  try {
    const r = await sb("config_tasadora?clave=eq.tasadora&select=valor");
    const l = (await r.json())?.[0]?.valor?.limites;
    if (l && typeof l === "object") {
      const f = (x: unknown, d: number) => (typeof x === "number" && isFinite(x) && x > 0 ? x : d);
      v = { ladoMm: f(l.ladoMm, v.ladoMm), horas: f(l.horas, v.horas), volumenMinCm3: f(l.volumenMinCm3, v.volumenMinCm3) };
    }
  } catch (_) { /* valores por defecto */ }
  cacheLimites = { t: Date.now(), v };
  return v;
}

/* ---------- Límites (la función es pública) ---------- */
const MAX_BYTES = 128 * 1024;                // el formulario completo ocupa unos pocos KB; cada cama de la tasadora suma ~1,5 KB de rasgos (hasta 30 camas)
const VENTANA_MS = 10 * 60_000, MAX_POR_IP = 8, MAX_POR_TELEFONO = 5;   // por cada 10 minutos
const porIp = new Map<string, number[]>();   // memoria de la instancia (orientativo)
function dentroDeLimite(ip: string) {
  const ahora = Date.now(), lista = (porIp.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  lista.push(ahora); porIp.set(ip, lista);
  return lista.length <= MAX_POR_IP;
}
async function recientesDelTelefono(tel: string) {
  try {
    const desde = new Date(Date.now() - VENTANA_MS).toISOString();
    const r = await sb("solicitudes_presupuesto?select=localizador&cliente_telefono=eq." + encodeURIComponent(tel) + "&creado=gte." + encodeURIComponent(desde), { headers: { Prefer: "count=exact", Range: "0-0" } });
    const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
    return isFinite(total) ? total : 0;
  } catch (_) { return 0; }
}

/* ---------- Localizador ---------- */
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function localizador() {
  const v = new Uint32Array(6); crypto.getRandomValues(v);
  return "#S3D-" + Array.from(v, (x) => ABC[x % ABC.length]).join("");
}

/* ---------- Firebase (cuenta de servicio → Firestore por REST) ---------- */
let tokenFb: { v: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function tokenFirebase(): Promise<string> {
  if (!CUENTA) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT");
  if (tokenFb && tokenFb.exp > Date.now() + 60_000) return tokenFb.v;
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify({ iss: CUENTA.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 }));
  const pem = CUENTA.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(cab + "." + cuerpo));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + cab + "." + cuerpo + "." + b64url(firma),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token de Firebase: " + JSON.stringify(d));
  tokenFb = { v: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return tokenFb.v;
}
const fsUrl = (ruta: string) => `https://firestore.googleapis.com/v1/projects/${CUENTA?.project_id}/databases/(default)/documents/${ruta}`;
// Valores de Firestore ⇄ JS
// deno-lint-ignore no-explicit-any
function deFs(v: any): unknown {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(deFs);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, deFs(x)]));
  return null;
}
// deno-lint-ignore no-explicit-any
function aFs(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, aFs(x)])) } };
}
// Estado de 3DCalc (users/{uid}/appState/3dcalc → data), con caché corta para responder al momento
let cacheEstado: { t: number; v: Record<string, unknown> } | null = null;
async function estado3dcalc(): Promise<Record<string, unknown>> {
  if (cacheEstado && Date.now() - cacheEstado.t < 120_000) return cacheEstado.v;
  if (!FIREBASE_UID) throw new Error("Falta FIREBASE_UID");
  const r = await fetch(fsUrl(`users/${FIREBASE_UID}/appState/3dcalc`), { headers: { Authorization: "Bearer " + await tokenFirebase() } });
  if (!r.ok) throw new Error("Firestore " + r.status);
  const doc = await r.json();
  let data = deFs(doc.fields?.data) as Record<string, unknown> | string | null;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (_) { data = null; } }
  if (!data || typeof data !== "object") throw new Error("Estado de 3DCalc vacío");
  cacheEstado = { t: Date.now(), v: data as Record<string, unknown> };
  return cacheEstado.v;
}
async function guardarPedidoWeb(id: string, pedido: Record<string, unknown>) {
  const r = await fetch(fsUrl("pedidos_web/" + encodeURIComponent(id)), {
    method: "PATCH", headers: { Authorization: "Bearer " + await tokenFirebase(), "Content-Type": "application/json" },
    body: JSON.stringify({ fields: aFs(pedido).mapValue.fields }),
  });
  if (!r.ok) throw new Error("pedidos_web " + r.status + " " + await r.text());
}

/* ---------- Precio con la fórmula de 3DCalc (copia de _compute, pedido de 1 unidad, sin accesorios) ----------
   Si cambia la fórmula en 3dproject/apps/3dcalc/3dcalc.html (compute/_compute, tarifas, cajón),
   hay que actualizar esta copia. */
const num = (v: unknown) => { const n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };
const round4 = (v: number) => Math.round(num(v) * 10000) / 10000;
const roundMoney = (v: number) => Math.round(Math.max(0, num(v)) * 100) / 100;
const roundUpToNickel = (v: number) => { const a = Math.max(0, num(v)); return Math.ceil((a + Number.EPSILON) / 0.05) * 0.05; };
const PROBABILIDAD_ERROR: Record<string, number> = { "Exenta (0%)": 0, "Mínima (10%)": 0.1, "Baja (25%)": 0.25, "Media (50%)": 0.5, "Alta (100%)": 1, "Muy Alta (150%)": 1.5, "Crítica (200%)": 2 };
const MARKUP = 2.3;   // «Normal (230%)»
const DISENO_BASE = [{ id: "d0", name: "No necesario", price: 0, sin: 1 }, { id: "d1", name: "Búsqueda de modelos", price: 3.75, sin: 1 }, { id: "d2", name: "Básica (solo slicer)", price: 2.25 }, { id: "d3", name: "Media (Fusion <1h)", price: 7.5 }, { id: "d4", name: "Alta (Fusion >1h / Artístico)", price: 15 }];
const POST_BASE = [{ id: "p0", name: "Limpio (pocos soportes sin lijado)", price: 0 }, { id: "p1", name: "Sencillo (pocos soportes con lijado)", price: 5 }, { id: "p2", name: "Medio (lijado + ensamblado / soportes comprometidos)", price: 10 }, { id: "p3", name: "Avanzado (lijado/ensamblado/soportes comprometidos + pintura)", price: 20 }];
const CAJON_TASA: Record<string, { bajo: number; alto: number }> = { "Técnico": { bajo: 0.05, alto: 0.05 }, "Artístico": { bajo: 0.15, alto: 0.075 } };
const CAJON_TRAMO = 50, CAJON_TASA_SIN_DISENO = 0.05;
// deno-lint-ignore no-explicit-any
function niveles(base: any[], ov: Record<string, any> = {}) {
  return base.map((b) => {
    const o = ov[b.id] ?? {}, L = { ...b };
    if (o.name != null && String(o.name).trim() !== "") L.name = String(o.name).trim();
    if (o.price != null && o.price !== "" && isFinite(Number(o.price))) L.price = Math.max(0, Number(o.price));
    return L;
  });
}
// deno-lint-ignore no-explicit-any
function calcularPrecio(S: any, c: { impresora: string; filamento: string; peso_g: number; tiempo_h: number; postproc_id: string; diseno: string; probabilidad_error: string; gasto_misc: number; tipo_proyecto: string }) {
  const g = S.global_config ?? {};
  const printers = S.printers ?? [], tipos = S.filament_types ?? [];
  const printer = printers.find((p: { name: string }) => p.name === c.impresora) ?? printers[0] ?? {};
  const ft = tipos.find((f: { name: string }) => f.name === c.filamento);
  const pricekg = ft ? num(ft.price_per_kg) : 0;
  const errorRate = PROBABILIDAD_ERROR[c.probabilidad_error] ?? 0.25;
  const horas = num(c.tiempo_h), peso = num(c.peso_g);
  const filamento = round4(peso * pricekg / 1000);
  const electricidad = round4(horas * num(printer.energy_consumption_kwh) * num(g.energy_cost_kwh));
  const dis = niveles(DISENO_BASE, g.tarifas?.dis), post = niveles(POST_BASE, g.tarifas?.post);
  const nivelDis = dis.find((l) => l.name === c.diseno || DISENO_BASE.find((b) => b.id === l.id)?.name === c.diseno) ?? dis[0];
  const nivelPost = post.find((l) => l.id === c.postproc_id) ?? post[0];
  const diseno = round4(roundMoney(nivelDis.price));
  const postproc = roundMoney(nivelPost.price);   // modo «Total»: sin factor por unidad
  const dh = num(printer.depreciation_time_h);
  const deterioro = round4(horas * (dh > 0 ? (num(printer.price_eur) + num(printer.service_costs_life_eur)) / dh : 0));
  const gastoMisc = round4(Math.max(0, num(c.gasto_misc)));
  const bruto = filamento + electricidad + deterioro;
  const resto = diseno + postproc + gastoMisc;
  const bloqueA = bruto * MARKUP + bruto * errorRate + resto;
  const cajonBase = Math.max(0, bloqueA - gastoMisc);
  const tf = CAJON_TASA[c.tipo_proyecto] ?? CAJON_TASA["Técnico"];
  const cajonPct = nivelDis.sin ? CAJON_TASA_SIN_DISENO : (cajonBase < CAJON_TRAMO ? tf.bajo : tf.alto);
  const cajonTasa = roundMoney(cajonBase * cajonPct);
  const total = bloqueA + cajonTasa;   // sin recargo de urgencia ni accesorios
  const precio = roundUpToNickel(Math.max(total, num(g.precio_minimo)));
  return { precio: Math.round(precio * 100) / 100, impresora: printer.name ?? c.impresora, postprocesado: nivelPost.name, diseno: nivelDis.name, desglose: { filamento, electricidad, deterioro, diseno, postproc, gastoMisc, bloqueA: roundMoney(bloqueA), cajonTasa } };
}
function nivelPostproc(zonas: number, cfg: Config) {
  const t = cfg.postproc_tramos;
  return zonas <= num(t.limpio_max) ? "p0" : zonas <= num(t.sencillo_max) ? "p1" : "p2";
}

/* ---------- Verificación de la tasadora ----------
   El navegador manda en tasadora.calculo los rasgos geométricos de cada cama y las opciones elegidas. Aquí se rehace el
   cálculo con el motor y se SUSTITUYEN en d.tasadora los gramos, el tiempo y las zonas de soporte por los de la función
   (lo que declaró el navegador queda en tasadora.declarado, para detectar diferencias). Si los datos faltan, no son válidos
   o no son coherentes con una malla real, la solicitud queda en revisión manual y se anota el motivo. */
type Verificacion = {
  ok: boolean; motivo?: string; detalle?: string[]; revision?: boolean; motivos?: string[];
  gramos: number; segundos: number; zonas: number; mallaNoValida?: boolean;
  camas?: { gramos: number; segundos: number; soportes: string; zonas: number; lado: number; volumenCm3: number }[];
};
const MOTIVOS_VERIFICACION: Record<string, string> = {
  "sin-calculo": "sin datos de cálculo", "motor-desfasado": "motor de la tasadora desactualizado en la web o en la función",
  opciones: "opciones no válidas", camas: "número de camas no válido", rasgos: "datos de la pieza no válidos", escala: "escala no válida",
  medidas: "medidas incoherentes con la pieza", incoherente: "datos geométricos incoherentes", calculo: "cálculo no válido",
  lado: "supera la longitud máxima", volumen: "volumen demasiado pequeño", tiempo: "tiempo de producción excesivo", malla: "malla no válida",
  "volumen-bajo": "volumen sospechosamente bajo para su caja",
};
// deno-lint-ignore no-explicit-any
async function verificarTasadora(t: any): Promise<Verificacion> {
  const declarado = { gramos: t.gramosExactos ?? null, segundos: t.segundos ?? null, zonasSoporte: t.zonasSoporte ?? null, revision: !!t.revision };
  let v: Verificacion;
  try { v = verificarCalculo(t.calculo, await leerLimites()) as unknown as Verificacion; }
  catch (e) { console.error("verificarCalculo:", e); v = { ok: false, motivo: "calculo", gramos: 0, segundos: 0, zonas: 0 }; }
  t.declarado = declarado;
  t.verificacion = { ok: v.ok, motor: MOTOR_REVISION, ...(v.ok ? {} : { motivo: v.motivo, detalle: v.detalle ?? null }) };
  if (!v.ok) {
    // Sin datos fiables: nada de cifras del navegador y a revisión manual
    t.revision = true; t.motivoRevision = t.motivoRevision || MOTIVOS_VERIFICACION[v.motivo ?? ""] || "no se pudo verificar el cálculo";
    t.gramos = null; t.tiempo = null; t.gramosExactos = 0; t.segundos = 0; t.zonasSoporte = 0;
    if (v.motivo === "incoherente" || v.motivo === "rasgos" || v.motivo === "medidas") console.warn("Solicitud con datos de cálculo sospechosos:", v.motivo, v.detalle ?? "");
    return v;
  }
  const revision = !!t.revision || !!v.revision;
  if (v.revision && !t.revision) t.motivoRevision = (v.motivos ?? []).map((m) => MOTIVOS_VERIFICACION[m] ?? m).join(", ");
  t.revision = revision;
  t.gramosExactos = v.gramos; t.segundos = Math.round(v.segundos); t.zonasSoporte = v.zonas;
  t.gramos = revision ? null : Math.round(v.gramos); t.tiempo = revision ? null : formatoTiempo(v.segundos);
  t.mallaNoValida = !!v.mallaNoValida;
  // Por cama: las cifras de la función
  if (Array.isArray(t.detalle) && Array.isArray(v.camas) && t.detalle.length === v.camas.length) {
    // deno-lint-ignore no-explicit-any
    t.detalle = t.detalle.map((c: any, i: number) => ({ ...c, gramos: v.camas![i].gramos, segundos: v.camas![i].segundos, soportes: v.camas![i].soportes, zonas: v.camas![i].zonas }));
  }
  // Diferencias grandes con lo que declaró el navegador: se anotan en el registro (pueden ser un fallo o una manipulación)
  if (declarado.gramos != null && Math.abs(Number(declarado.gramos) - v.gramos) > 0.02 * Math.max(1, v.gramos)) console.warn("Gramos declarados distintos de los verificados:", declarado.gramos, v.gramos);
  if (declarado.segundos != null && Math.abs(Number(declarado.segundos) - v.segundos) > 0.02 * Math.max(1, v.segundos)) console.warn("Tiempo declarado distinto del verificado:", declarado.segundos, v.segundos);
  return v;
}

/* ---------- Emails (a SILAB3D y copia al cliente) ----------
   HTML con tablas y estilos en línea, que es lo único que respetan todos los clientes de correo. */
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const LOGO = "https://silab3d.com/img/SILAB3D_v3_horizontal_negro-compressed.png";
const C = { marca: "#BC556D", marcaOscura: "#8E3B50", tinta: "#221C1F", gris: "#6B5560", linea: "#EFE3E7", fondo: "#F7F1F3", suave: "#FBEFF2" };
const FUENTE = "font-family:Outfit,'Segoe UI',Arial,sans-serif";
const fila = (k: string, v: string) =>
  `<tr><td style="padding:10px 0;border-top:1px solid ${C.linea};color:${C.gris};font-size:13px;width:38%;vertical-align:top">${esc(k)}</td>` +
  `<td style="padding:10px 0;border-top:1px solid ${C.linea};color:${C.tinta};font-size:14px;vertical-align:top">${v}</td></tr>`;
const seccion = (titulo: string, filas: string) => !filas ? "" :
  `<tr><td style="padding:22px 28px 4px"><div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.marcaOscura};margin-bottom:6px">${esc(titulo)}</div>` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${filas}</table></td></tr>`;
const boton = (texto: string, href: string, claro = false) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;${claro ? `background:#fff;color:${C.marcaOscura};border:1px solid ${C.marca}` : `background:${C.marca};color:#fff`}">${esc(texto)}</a>`;
function marco(preencabezado: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${C.fondo};${FUENTE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid ${C.linea}">
<tr><td style="padding:22px 28px 18px;border-bottom:1px solid ${C.linea}"><img src="${LOGO}" alt="SILAB 3D" width="150" style="display:block;width:150px;height:auto;border:0"></td></tr>
${cuerpo}
<tr><td style="padding:22px 28px;background:${C.suave};color:${C.gris};font-size:12px;line-height:1.6;text-align:center">
SILAB 3D · Impresión 3D en Salamanca<br><a href="https://silab3d.com" style="color:${C.marcaOscura}">silab3d.com</a> · <a href="https://wa.me/34644070487" style="color:${C.marcaOscura}">644 07 04 87</a> · <a href="mailto:silab3d@gmail.com" style="color:${C.marcaOscura}">silab3d@gmail.com</a>
</td></tr></table></td></tr></table></body></html>`;
}
// Cabecera con el localizador y, si lo hay, el precio
function cabecera(titulo: string, subtitulo: string, loc: string, precio: number | null, notaSinPrecio: string) {
  return `<tr><td style="padding:28px 28px 6px">
<div style="font-size:24px;font-weight:700;color:${C.tinta};line-height:1.25">${titulo}</div>
<div style="margin-top:8px;font-size:15px;line-height:1.55;color:${C.gris}">${subtitulo}</div></td></tr>
<tr><td style="padding:16px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0">
<tr><td style="padding:16px 18px;background:${C.suave};border-radius:14px 0 0 14px;border:1px solid #E3C3CC;border-right:0;vertical-align:middle">
<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.marcaOscura}">Localizador</div>
<div style="margin-top:4px;font:700 22px/1.2 'IBM Plex Mono',Consolas,monospace;color:${C.tinta};letter-spacing:.03em">${esc(loc)}</div></td>
<td style="padding:16px 18px;background:${precio != null ? C.tinta : C.suave};border-radius:0 14px 14px 0;border:1px solid ${precio != null ? C.tinta : "#E3C3CC"};text-align:right;vertical-align:middle">
${precio != null
    ? `<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#CDBFC4">Precio</div><div style="margin-top:4px;font-size:24px;font-weight:700;color:#fff">${eur(precio)}</div><div style="margin-top:4px;font-size:11px;line-height:1.4;color:#CDBFC4">IVA incluido · envío aparte</div>`
    : `<div style="font-size:13px;line-height:1.45;color:${C.marcaOscura};font-weight:600">${esc(notaSinPrecio)}</div>`}
</td></tr></table></td></tr>`;
}
// deno-lint-ignore no-explicit-any
function seccionesPedido(d: any, interno: boolean) {
  const t = d.tasadora, lam = t?.laminado ?? {};
  const nombres = (d.archivos?.urls ?? []).length
    ? (d.archivos.urls as string[]).map((u) => interno ? `<a href="${esc(u)}" style="color:${C.marcaOscura}">${esc(decodeURIComponent(u.split("?")[0].split("/").pop() ?? u))}</a>` : esc(decodeURIComponent(u.split("?")[0].split("/").pop() ?? u).replace(/^\d+-[a-z0-9]+-/, ""))).join("<br>")
    : t?.archivos?.length ? esc(t.archivos.join(", ")) : "";
  const may = (v: unknown) => { const x = String(v ?? ""); return x ? x[0].toUpperCase() + x.slice(1) : ""; };
  const textoLam = t ? [`Definición ${esc(may(lam.definicion))}`, `refuerzo ${esc(may(lam.pared))}`, `densidad ${esc(may(lam.densidad))}`, lam.color === "multi" ? `multicolor (${esc(t.colores)} colores)` : "monocolor"].join(" · ") : "";
  return seccion(interno ? "Proyecto" : "Tu proyecto",
      fila("Nombre", esc(d.proyecto?.nombre)) +
      fila("Descripción", esc(d.proyecto?.descripcion).replace(/\n/g, "<br>")) +
      fila("Tipo", esc(d.proyecto?.tipoTexto)) +
      fila("Archivos de referencia", esc(d.archivos?.opcionTexto)) +
      (nombres ? fila("Archivos", nombres) : "") +
      (d.archivos?.medidas ? fila("Medidas indicadas", esc(d.archivos.medidas)) : "")) +
    (t ? seccion("Presupuesto instantáneo",
      fila("Medidas", esc(t.medidas).replace(/\n/g, "<br>")) +
      (t.camas > 1 ? fila("Camas de impresión", esc(t.camas)) : "") +
      fila("Impresión", textoLam) +
      (!t.revision ? fila("Estimación", esc(`${t.gramos} g de filamento · ${t.tiempo} de impresión`)) : "") +
      (t.ajustes?.length ? fila("Ajustes automáticos", esc(t.ajustes.join("; "))) : "") +
      (interno ? fila("Zonas de soporte", esc(t.zonasSoporte ?? 0)) : "") +
      (interno && t.revision ? fila("Revisión manual", `<strong style="color:${C.marcaOscura}">Sí</strong>${t.motivoRevision ? " · " + esc(t.motivoRevision) : ""}`) : "") +
      (interno && t.modificadores ? fila("Aviso", "El archivo contiene modificadores") : "") +
      (interno && t.mallaNoValida ? fila("Aviso", "Posible error en la malla") : "")) : "") +
    seccion("Colores y plazo", fila("Colores", esc(d.colores?.resumen)) + fila("Plazo", esc(d.plazo?.texto)));
}
// Aviso a SILAB3D: todo el formulario, con accesos rápidos para contestar al cliente
// deno-lint-ignore no-explicit-any
function emailSilab(d: any, loc: string, precio: number | null, motivo: string) {
  const tel = String(d.cliente?.telefono ?? "").replace(/[^\d+]/g, "");
  const telWa = tel.startsWith("+") ? tel.slice(1) : tel.length === 9 ? "34" + tel : tel;
  const frase = `¡Hola ${d.cliente?.nombre ?? ""}! Te escribimos de SILAB 3D por tu presupuesto ${loc}.`;
  const cuerpo = cabecera("Nueva solicitud de presupuesto", `${esc(d.cliente?.nombre)} ha pedido presupuesto para «${esc(d.proyecto?.nombre)}».`, loc, precio,
      "Pendiente de revisión" + (motivo ? ": " + motivo : "")) +
    `<tr><td style="padding:16px 28px 0;text-align:center">${boton("WhatsApp al cliente", `https://wa.me/${telWa}?text=${encodeURIComponent(frase)}`)}${boton("Llamar", "tel:" + tel, true)}</td></tr>` +
    seccion("Cliente",
      fila("Nombre", esc(d.cliente?.nombre)) +
      fila("Teléfono", `<a href="tel:${esc(tel)}" style="color:${C.marcaOscura}">${esc(d.cliente?.telefono)}</a>`) +
      (d.cliente?.email ? fila("Email", `<a href="mailto:${esc(d.cliente.email)}" style="color:${C.marcaOscura}">${esc(d.cliente.email)}</a>`) : "") +
      fila("Fecha", esc(new Date(d.fecha ?? Date.now()).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" })))) +
    seccionesPedido(d, true) + `<tr><td style="padding:12px"></td></tr>`;
  return marco(`${loc} · ${d.cliente?.nombre ?? ""} · ${precio != null ? eur(precio) : "Pendiente de revisión"}`, cuerpo);
}
// Copia para el cliente: resumen claro, precio si lo hay y cómo contactar
// deno-lint-ignore no-explicit-any
function emailCliente(d: any, loc: string, precio: number | null) {
  const frase = `¡Hola! Soy ${d.cliente?.nombre ?? ""}. Os escribo por mi presupuesto ${loc}.`;
  const cuerpo = cabecera(`¡Hola, ${esc(d.cliente?.nombre)}!`,
      precio != null
        ? "Gracias por confiar en SILAB 3D. Este es el resumen de tu presupuesto. Guarda el localizador para cualquier consulta sobre tu pedido."
        : "Gracias por confiar en SILAB 3D. Hemos recibido tu solicitud: nuestro equipo técnico la está revisando y te responderá en menos de 24 horas laborables.",
      loc, precio, "En revisión por el equipo técnico") +
    seccionesPedido(d, false) +
    `<tr><td style="padding:26px 28px 6px;text-align:center"><div style="font-size:15px;color:${C.tinta};font-weight:600;margin-bottom:8px">¿Quieres hablar con nosotros?</div>
${boton("Escribir por WhatsApp", `https://wa.me/34644070487?text=${encodeURIComponent(frase)}`)}${boton("Enviar un email", `mailto:silab3d@gmail.com?subject=${encodeURIComponent("Presupuesto " + loc)}&body=${encodeURIComponent(frase)}`, true)}</td></tr>
<tr><td style="padding:10px 28px 24px;color:${C.gris};font-size:12px;line-height:1.5;text-align:center">${precio != null ? "Precio estimado a partir de tu archivo de diseño. Lo confirmaremos al preparar tu pedido." : ""}</td></tr>`;
  return marco(precio != null ? `Tu presupuesto ${loc}: ${eur(precio)}` : `Hemos recibido tu solicitud ${loc}`, cuerpo);
}
async function enviarEmail(para: string, html: string, asunto: string, responderA?: string) {
  if (!RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [para], subject: asunto, html, ...(responderA ? { reply_to: responderA } : {}) }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " " + await r.text());
}

/* ---------- Archivos adjuntos (bucket «solicitudes», privado) ----------
   La web sube los archivos al enviar y manda sus rutas; aquí se cambian por enlaces firmados que caducan
   a los mismos días que la limpieza automática (limpiar-solicitudes). Solo se firman nombres con el formato
   que genera la web (sin carpetas), para que nadie pueda pedir enlaces de otros archivos del bucket. */
const BUCKET_SOLICITUDES = "solicitudes";
const DIAS_ENLACE = Number(Deno.env.get("DIAS_RETENCION") ?? "15");
const RUTA_VALIDA = /^\d{13}-[a-z0-9]{1,8}-[a-z0-9.-]{1,80}$/;
async function enlacesFirmados(rutas: unknown): Promise<string[] | null> {
  if (!Array.isArray(rutas) || !rutas.length) return null;
  const validas = rutas.map(String).filter((r) => RUTA_VALIDA.test(r)).slice(0, 30);
  if (!validas.length) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_SOLICITUDES}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: DIAS_ENLACE * 86400, paths: validas }),
    });
    if (!r.ok) throw new Error("Storage " + r.status + " " + await r.text());
    const filas = await r.json() as { signedURL?: string; error?: string | null }[];
    const urls = filas.filter((f) => f.signedURL && !f.error).map((f) => SUPABASE_URL + "/storage/v1" + f.signedURL);
    return urls.length ? urls : null;
  } catch (e) { console.error("Enlaces firmados:", e); return null; }
}

/* ---------- Copia al cliente (accion: "copia", { localizador, email }) ----------
   Solo para solicitudes de las últimas 24 h y como mucho 3 copias por solicitud. */
// deno-lint-ignore no-explicit-any
async function enviarCopia(d: any) {
  const email = String(d.email ?? "").trim(), loc = String(d.localizador ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return json({ error: "Email no válido" }, 400);
  if (!/^#S3D-[A-Z0-9]{6}$/.test(loc)) return json({ error: "Localizador no válido" }, 400);
  const r = await sb("solicitudes_presupuesto?select=precio,creado,datos&localizador=eq." + encodeURIComponent(loc));
  const fila = (await r.json().catch(() => []))[0];
  if (!fila) return json({ error: "No encontramos esa solicitud" }, 404);
  if (Date.now() - new Date(fila.creado).getTime() > 24 * 3600_000) return json({ error: "La solicitud es de hace más de 24 horas" }, 403);
  const datos = fila.datos ?? {}, copias = Number(datos.copias_enviadas ?? 0);
  if (copias >= 3) return json({ error: "Ya hemos enviado varias copias de esta solicitud" }, 429);
  const precio = fila.precio == null ? null : Number(fila.precio);
  try {
    await enviarEmail(email, emailCliente(datos, loc, precio), (precio != null ? "Tu presupuesto " : "Tu solicitud de presupuesto ") + loc + " · SILAB 3D", DEST_EMAIL);
  } catch (e) { console.error("Copia al cliente:", e); return json({ error: "No se pudo enviar el email" }, 502); }
  datos.cliente = { ...(datos.cliente ?? {}), email };
  datos.copias_enviadas = copias + 1;
  await sb("solicitudes_presupuesto?localizador=eq." + encodeURIComponent(loc), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ datos }) });
  return json({ ok: true });
}

/* ---------- Función ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  // La función es pública: tamaño máximo del envío y frecuencia por IP y por teléfono
  const texto = await req.text();
  if (texto.length > MAX_BYTES) return json({ error: "Solicitud demasiado grande" }, 413);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (!dentroDeLimite(ip)) return json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos." }, 429);
  // deno-lint-ignore no-explicit-any
  let d: any;
  try { d = JSON.parse(texto); } catch (_) { return json({ error: "JSON no válido" }, 400); }
  if (d?.accion === "copia") return enviarCopia(d);
  if (!d?.cliente?.nombre || !d?.cliente?.telefono) return json({ error: "Faltan nombre o teléfono" }, 400);
  if (await recientesDelTelefono(String(d.cliente.telefono)) >= MAX_POR_TELEFONO) return json({ error: "Ya hemos recibido varias solicitudes de este teléfono. Espera unos minutos." }, 429);
  delete d.localizador;   // lo asigna el servidor
  // Enlaces de los adjuntos: firmados a partir de las rutas (con el bucket privado, los públicos no abren)
  if (d.archivos && typeof d.archivos === "object") {
    const firmados = await enlacesFirmados(d.archivos.rutas);
    if (firmados) d.archivos.urls = firmados;
    else d.archivos.urls = (Array.isArray(d.archivos.urls) ? d.archivos.urls : []).map(String).filter((u: string) => u.startsWith(SUPABASE_URL + "/storage/v1/object/")).slice(0, 30);
  }

  const cfg = await leerConfig();
  const urgente = d.plazo?.tipo === "urgente";
  // Gramos, tiempo y zonas de soporte: los recalcula la función con el motor (lo que diga el navegador solo se guarda como «declarado»)
  const verif = d.tasadora && typeof d.tasadora === "object" ? await verificarTasadora(d.tasadora) : null;
  const t = d.tasadora;
  const conPrecio = !!(cfg.precio_activo && d.archivos?.opcion === "diseno" && t && verif?.ok && !t.revision && verif.gramos > 0 && verif.segundos > 0 && (!urgente || cfg.urgentes_con_precio));
  const tipo3dcalc = d.proyecto?.tipo === "resistentes" ? "Técnico" : "Artístico";

  // Precio de 3DCalc (si falla, se sigue sin precio: lo revisa el equipo)
  let calculo: ReturnType<typeof calcularPrecio> | null = null, errorPrecio = "";
  if (conPrecio) {
    try {
      const S = await estado3dcalc();
      calculo = calcularPrecio(S, {
        impresora: cfg.impresora, filamento: cfg.filamento[d.proyecto?.tipo as "resistentes" | "artisticas"] ?? "PLA",
        peso_g: Math.round(verif!.gramos * 100) / 100, tiempo_h: Math.round(verif!.segundos / 36) / 100,
        postproc_id: nivelPostproc(num(t.zonasSoporte), cfg), diseno: cfg.diseno, probabilidad_error: cfg.probabilidad_error,
        gasto_misc: num(cfg.gasto_misc), tipo_proyecto: tipo3dcalc,
      });
    } catch (e) { errorPrecio = String((e as Error).message ?? e); console.error("Precio 3DCalc:", e); }
  }
  const precio = calculo ? calculo.precio : null;
  const motivo = precio != null ? "" : !t ? "sin archivo de diseño en la tasadora" : t.revision ? "revisión manual (" + (t.motivoRevision ?? "") + ")" : urgente ? "plazo urgente" : errorPrecio ? "no se pudo calcular el precio" : "";

  // Guardar con un localizador único
  let loc = "";
  for (let i = 0; i < 6 && !loc; i++) {
    const cand = localizador();
    const r = await sb("solicitudes_presupuesto", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ localizador: cand, cliente_nombre: d.cliente.nombre, cliente_telefono: d.cliente.telefono, proyecto_nombre: d.proyecto?.nombre ?? null,
        tipo: d.proyecto?.tipo ?? null, revision: precio == null, precio, datos: { ...d, precio, calculo, motivo } }),
    });
    if (r.ok) loc = cand;
    else if (r.status !== 409) { console.error("Supabase:", r.status, await r.text()); return json({ error: "No se pudo guardar la solicitud" }, 500); }
  }
  if (!loc) return json({ error: "No se pudo generar el localizador" }, 500);

  // Después de responder: pedido para 3DCalc y aviso por email
  const tareas = (async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      await guardarPedidoWeb(loc.replace("#", ""), {
        localizador: loc, creado: new Date().toISOString(), importado: false, instantaneo: precio != null, precio_web: precio,
        // Campos del pedido en 3DCalc (mismos nombres que su calc_state)
        empresa: cfg.empresa, cliente: d.cliente.nombre, contacto: d.cliente.telefono, cliente_email: "",
        descripcion: d.proyecto?.nombre ?? "", tipo_proyecto: tipo3dcalc, fecha: hoy,
        impresora: calculo?.impresora ?? cfg.impresora, cantidad: cfg.unidades, cant_modo: "div",
        filamento_tipo: cfg.filamento[d.proyecto?.tipo as "resistentes" | "artisticas"] ?? "PLA",
        filamento_color: (d.colores?.colores ?? []).join(", ") || "",
        is_multimaterial: false, peso_g: t ? Math.round(num(t.gramosExactos) * 100) / 100 : null, tiempo_h: t ? Math.round(num(t.segundos) / 36) / 100 : null,
        diseno_modelado: cfg.diseno, postproc_modo: cfg.postproc_modo,
        // Nivel de post-procesado por zonas aunque no haya precio (3DCalc resuelve el nombre con sus alias)
        postprocesado: calculo?.postprocesado ?? (t ? (POST_BASE.find((l) => l.id === nivelPostproc(num(t.zonasSoporte), cfg)) ?? POST_BASE[0]).name : null),
        probabilidad_error: cfg.probabilidad_error, markup: "Normal (230%)", urgencia_nivel: urgente ? "Urgente" : cfg.urgencia_flexible,
        gasto_misc: num(cfg.gasto_misc), prod_on: !!cfg.produccion.activar, prod_tests: cfg.produccion.tests, prod_dificultad: cfg.produccion.dificultad,
        // Todo el formulario, por si 3DCalc quiere mostrar más
        formulario: JSON.parse(JSON.stringify(d)),
      });
    } catch (e) { console.error("Firebase:", e); }
    try {
      await enviarEmail(DEST_EMAIL, emailSilab(d, loc, precio, motivo), `Nuevo presupuesto ${loc} · ${d.proyecto?.nombre ?? "Proyecto"} · ${precio != null ? precio.toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "Revisión"}`);
    } catch (e) { console.error("Email:", e); }
  })();
  // @ts-ignore EdgeRuntime existe en Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tareas); else await tareas;

  return json({ localizador: loc, precio });
});
