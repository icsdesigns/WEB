// ============================================================
//  Supabase Edge Function:  gestor-almacenamiento
//  Pestaña «Almacenamiento» del panel admin (js/admin-almacenamiento.js).
//
//  Acciones (POST JSON { accion, ... }):
//    uso         Espacio ocupado: base de datos, tablas y buckets de Supabase, y
//                colecciones de Firestore (3DProject). Devuelve también las reglas.
//    bucket      Desglose de un bucket por tipo, carpeta y mes, y sus archivos más grandes.
//    previa      Lo que borrarían las reglas que manda el panel (no borra nada).
//    limpiar     Borra SOLO lo que salió en la vista previa y sigue cumpliendo la regla.
//    programada  La llama pg_cron cada noche con la cabecera x-purge-key: aplica las
//                reglas ACTIVAS guardadas (supabase/almacenamiento.sql, paso 5).
//  uso, previa y limpiar exigen sesión iniciada y, si existe la tabla public.admins, que la cuenta esté en ella.
//
//  Un solo archivo y sin imports: se puede pegar en el editor web de Supabase.
//  Desplegar con «Verify JWT» DESACTIVADO (la función comprueba ella misma la sesión
//  o la PURGE_KEY). Secretos que ya existen: FIREBASE_SERVICE_ACCOUNT, PURGE_KEY.
//  SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PURGE_KEY = Deno.env.get("PURGE_KEY") ?? "";
let CUENTA: { project_id: string; client_email: string; private_key: string } | null = null;
try { CUENTA = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "null"); } catch (_) { CUENTA = null; }

const CLAVE_CONFIG = "almacenamiento";
const DIA = 86_400_000;
const MAX_DOCS = 5000;                  // tope de documentos leídos por colección de Firestore
// Solo estas tablas y colecciones se pueden limpiar (el resto es catálogo o datos de 3DProject)
const TABLAS = ["solicitudes_presupuesto", "subidas", "notas", "keep_alive"];
const COLECCIONES = ["pedidos_web", "feedback"];
// Buckets sin tabla que los use (la biblioteca de figuras se lee listando el bucket): nunca «huérfanos»
const SIN_HUERFANOS = ["figuras", "solicitudes"];
const LIMITES = { db: 500 * 1024 ** 2, storage: 1024 ** 3, firestore: 1024 ** 3, lecturas: 50_000 };   // planes gratuitos

type Regla = { id: string; origen: "storage" | "tabla" | "firestore"; tipo: "antiguedad" | "huerfanos"; destino: string; columna?: string; dias: number; activa: boolean };
type Config = { avisos: { aviso: number; critico: number }; reglas: Regla[]; registro?: unknown[] };
type Elemento = { id: string; bytes: number; fecha: string };

const DEFECTO: Config = {
  avisos: { aviso: 70, critico: 90 },
  reglas: [
    { id: "storage-solicitudes", origen: "storage", tipo: "antiguedad", destino: "solicitudes", dias: 180, activa: true },
    ...["productos", "visualizador", "galeria"].map((b): Regla => ({ id: "huerfanos-" + b, origen: "storage", tipo: "huerfanos", destino: b, dias: 7, activa: false })),
    { id: "tabla-solicitudes_presupuesto", origen: "tabla", tipo: "antiguedad", destino: "solicitudes_presupuesto", columna: "creado", dias: 365, activa: false },
    { id: "firestore-pedidos_web", origen: "firestore", tipo: "antiguedad", destino: "pedidos_web", dias: 365, activa: false },
    { id: "firestore-feedback", origen: "firestore", tipo: "antiguedad", destino: "feedback", dias: 365, activa: false },
  ],
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-purge-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(SUPABASE_URL + path, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(path.split("?")[0] + " → " + r.status + " " + (await r.text()).slice(0, 300));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: Record<string, unknown> = {}) => sb("/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(args) });

// Mismo criterio que public.es_admin(): la cuenta de la sesión tiene que estar en public.admins
async function esAdmin(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + jwt } });
  if (!r.ok) return false;
  const id = (await r.json())?.id;
  if (!id) return false;
  try {
    const filas = await sb("/rest/v1/admins?select=user_id&user_id=eq." + encodeURIComponent(id));
    return Array.isArray(filas) && filas.length > 0;
  } catch (e) {
    // Si aún no existe la tabla admins (bloque A de 1-supabase-seguridad.sql), vale cualquier sesión iniciada,
    // igual que las políticas actuales del panel. Con la tabla creada, solo sus cuentas.
    if (/PGRST205/.test(String((e as Error).message))) return true;
    throw e;
  }
}

/* ---------- Reglas (config_tasadora → almacenamiento) ---------- */
async function leerConfig(): Promise<Config> {
  const filas = await sb("/rest/v1/config_tasadora?select=valor&clave=eq." + CLAVE_CONFIG);
  return completar(filas?.[0]?.valor);
}
// Une lo guardado con los valores por defecto y descarta lo que no tenga sentido
// deno-lint-ignore no-explicit-any
function completar(v: any): Config {
  const guardadas: Regla[] = Array.isArray(v?.reglas) ? v.reglas : [];
  const reglas = [...DEFECTO.reglas.map((d) => ({ ...d, ...(guardadas.find((g) => g.id === d.id) ?? {}) })),
                  ...guardadas.filter((g) => !DEFECTO.reglas.some((d) => d.id === g.id))].filter(valida);
  const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) > 0 && Number(x) <= 100 ? Number(x) : d);
  return { avisos: { aviso: n(v?.avisos?.aviso, 70), critico: n(v?.avisos?.critico, 90) }, reglas, registro: Array.isArray(v?.registro) ? v.registro : [] };
}
function valida(r: Regla) {
  if (!r || typeof r.id !== "string" || !(Number(r.dias) >= 1)) return false;
  if (r.origen === "storage") return (r.tipo === "antiguedad" || (r.tipo === "huerfanos" && !SIN_HUERFANOS.includes(r.destino))) && /^[a-z0-9_-]+$/i.test(r.destino);
  if (r.origen === "tabla") return r.tipo === "antiguedad" && TABLAS.includes(r.destino) && /^[a-z_]+$/.test(r.columna ?? "");
  if (r.origen === "firestore") return r.tipo === "antiguedad" && COLECCIONES.includes(r.destino);
  return false;
}
async function anotar(entrada: Record<string, unknown>) {
  const filas = await sb("/rest/v1/config_tasadora?select=valor&clave=eq." + CLAVE_CONFIG);
  const valor = filas?.[0]?.valor ?? { avisos: DEFECTO.avisos, reglas: DEFECTO.reglas };
  valor.registro = [entrada, ...(Array.isArray(valor.registro) ? valor.registro : [])].slice(0, 20);
  await sb("/rest/v1/config_tasadora", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ clave: CLAVE_CONFIG, valor, actualizado: new Date().toISOString() }) });
}

/* ---------- Firebase (cuenta de servicio → Firestore por REST) ---------- */
let tokenFb: { v: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function tokenFirebase(): Promise<string> {
  if (!CUENTA) throw new Error("Falta el secreto FIREBASE_SERVICE_ACCOUNT");
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
  if (!d.access_token) throw new Error("Token de Firebase: " + (d.error_description ?? d.error ?? r.status));
  tokenFb = { v: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return tokenFb.v;
}
const raizFs = () => `projects/${CUENTA?.project_id}/databases/(default)/documents`;
async function fs(ruta: string, init: RequestInit = {}) {
  const r = await fetch("https://firestore.googleapis.com/v1/" + ruta, {
    ...init, headers: { Authorization: "Bearer " + await tokenFirebase(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error("Firestore " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

// Tamaño de un documento según la fórmula de Firestore (datos; los índices no se incluyen)
const tamTexto = (s: string) => new TextEncoder().encode(s).length + 1;
// deno-lint-ignore no-explicit-any
function tamValor(v: any): number {
  if (!v || typeof v !== "object") return 1;
  if ("stringValue" in v) return tamTexto(v.stringValue);
  if ("bytesValue" in v) return Math.floor(String(v.bytesValue).length * 3 / 4);
  if ("referenceValue" in v) return tamNombre(v.referenceValue);
  if ("geoPointValue" in v) return 16;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).reduce((s: number, x: unknown) => s + tamValor(x), 0);
  if ("mapValue" in v) return tamCampos(v.mapValue.fields);
  if ("integerValue" in v || "doubleValue" in v || "timestampValue" in v) return 8;
  return 1;   // booleanos y null
}
// deno-lint-ignore no-explicit-any
const tamCampos = (f: Record<string, any> = {}) => Object.entries(f).reduce((s, [k, x]) => s + tamTexto(k) + tamValor(x), 0);
const tamNombre = (nombre: string) => nombre.split("/documents/")[1]?.split("/").reduce((s, p) => s + tamTexto(p), 16) ?? 16;
// deno-lint-ignore no-explicit-any
const tamDoc = (d: any) => tamNombre(d.name) + tamCampos(d.fields) + 32;

// Recorre los documentos de una colección (o de todas las que se llamen igual, en cualquier nivel)
// deno-lint-ignore no-explicit-any
async function documentos(coleccion: string, todos = false): Promise<{ docs: any[]; completo: boolean }> {
  // deno-lint-ignore no-explicit-any
  const docs: any[] = [];
  let ultimo: string | null = null;
  while (docs.length < MAX_DOCS) {
    // deno-lint-ignore no-explicit-any
    const q: any = { from: [{ collectionId: coleccion, allDescendants: todos }], orderBy: [{ field: { fieldPath: "__name__" } }], limit: 500 };
    if (ultimo) q.startAt = { values: [{ referenceValue: ultimo }], before: false };
    const r = await fs(raizFs() + ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: q }) });
    // deno-lint-ignore no-explicit-any
    const pagina = (r as any[]).map((x) => x.document).filter(Boolean);
    docs.push(...pagina);
    if (pagina.length < 500) return { docs, completo: true };
    ultimo = pagina[pagina.length - 1].name;
  }
  return { docs, completo: false };
}

async function usoFirestore() {
  if (!CUENTA) return { disponible: false, motivo: "Falta el secreto FIREBASE_SERVICE_ACCOUNT en Supabase." };
  let lecturas = 0;
  const raices: string[] = (await fs(raizFs() + ":listCollectionIds", { method: "POST", body: JSON.stringify({ pageSize: 100 }) })).collectionIds ?? [];
  const colecciones: { coleccion: string; documentos: number; bytes: number; completo: boolean }[] = [];
  const subIds = new Set<string>();
  for (const c of raices) {
    const { docs, completo } = await documentos(c);
    lecturas += Math.max(1, docs.length);
    colecciones.push({ coleccion: c, documentos: docs.length, bytes: docs.reduce((s, d) => s + tamDoc(d), 0), completo });
    // Subcolecciones: se miran en los primeros documentos (también los que solo existen como carpeta)
    const muestra = await fs(raizFs() + "/" + c + "?pageSize=5&showMissing=true&mask.fieldPaths=__name__");
    for (const d of muestra.documents ?? []) {
      const ids = (await fs(d.name + ":listCollectionIds", { method: "POST", body: JSON.stringify({ pageSize: 50 }) })).collectionIds ?? [];
      ids.forEach((id: string) => subIds.add(c + "/" + id));
    }
  }
  for (const par of subIds) {
    const [padre, id] = par.split("/");
    const { docs, completo } = await documentos(id, true);
    const propios = docs.filter((d) => d.name.includes("/documents/" + padre + "/"));
    lecturas += Math.max(1, docs.length);
    colecciones.push({ coleccion: padre + " › " + id, documentos: propios.length, bytes: propios.reduce((s, d) => s + tamDoc(d), 0), completo });
  }
  colecciones.sort((a, b) => b.bytes - a.bytes);
  return { disponible: true, proyecto: CUENTA.project_id, colecciones, bytes: colecciones.reduce((s, c) => s + c.bytes, 0), lecturas };
}

/* ---------- Vista previa y borrado por regla ---------- */
const nombreCorto = (d: { name: string }) => d.name.split("/documents/")[1];
async function candidatos(r: Regla, hasta: string): Promise<{ elementos: Elemento[]; total: number; bytes: number }> {
  if (r.origen === "storage") {
    const filas: { nombre: string; bytes: number; fecha: string }[] =
      await rpc(r.tipo === "huerfanos" ? "almacenamiento_huerfanos" : "almacenamiento_antiguos", { p_bucket: r.destino, p_hasta: hasta });
    const elementos = filas.map((f) => ({ id: f.nombre, bytes: Number(f.bytes), fecha: f.fecha }));
    return { elementos, total: elementos.length, bytes: elementos.reduce((s, e) => s + e.bytes, 0) };
  }
  if (r.origen === "tabla") {
    const total = Number(await rpc("almacenamiento_filas", { p_tabla: r.destino, p_columna: r.columna, p_hasta: hasta, p_borrar: false }));
    return { elementos: [], total, bytes: 0 };
  }
  const { docs } = await documentos(r.destino);
  const elementos = docs.filter((d) => Date.parse(d.createTime) < Date.parse(hasta))
    .map((d) => ({ id: nombreCorto(d), bytes: tamDoc(d), fecha: d.createTime }));
  return { elementos, total: elementos.length, bytes: elementos.reduce((s, e) => s + e.bytes, 0) };
}

// Borra lo pedido que siga cumpliendo la regla (si «ids» es null, todo lo que la cumpla)
async function borrar(r: Regla, hasta: string, ids: string[] | null) {
  if (r.origen === "tabla") {
    const n = Number(await rpc("almacenamiento_filas", { p_tabla: r.destino, p_columna: r.columna, p_hasta: hasta, p_borrar: true }));
    return { borrados: n, bytes: 0 };
  }
  const { elementos } = await candidatos(r, hasta);
  const pedidos = ids ? new Set(ids) : null;
  const lista = pedidos ? elementos.filter((e) => pedidos.has(e.id)) : elementos;
  let borrados = 0, bytes = 0;
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100);
    if (r.origen === "storage") {
      await sb("/storage/v1/object/" + encodeURIComponent(r.destino), { method: "DELETE", body: JSON.stringify({ prefixes: lote.map((e) => e.id) }) });
    } else {
      await fs(raizFs() + ":batchWrite", { method: "POST", body: JSON.stringify({ writes: lote.map((e) => ({ delete: raizFs() + "/" + e.id })) }) });
    }
    borrados += lote.length;
    bytes += lote.reduce((s, e) => s + e.bytes, 0);
  }
  return { borrados, bytes };
}

const corte = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Función sin configurar" }, 500);

  // deno-lint-ignore no-explicit-any
  let d: any;
  try { d = JSON.parse(await req.text() || "{}"); } catch (_) { return json({ error: "JSON no válido" }, 400); }

  try {
    // Limpieza programada (pg_cron): solo las reglas activas guardadas
    if (d.accion === "programada") {
      if (!PURGE_KEY || req.headers.get("x-purge-key") !== PURGE_KEY) return json({ error: "No autorizado" }, 401);
      const cfg = await leerConfig();
      const resultado = [];
      for (const r of cfg.reglas.filter((x) => x.activa)) {
        try { resultado.push({ regla: r.id, ...(await borrar(r, corte(r.dias), null)) }); }
        catch (e) { resultado.push({ regla: r.id, error: String((e as Error).message ?? e) }); }
      }
      await anotar({ fecha: new Date().toISOString(), origen: "programada", resultado });
      return json({ ok: true, resultado });
    }

    if (!(await esAdmin(req))) return json({ error: "Solo un administrador puede usar el gestor de almacenamiento." }, 401);

    if (d.accion === "uso") {
      const [supabase, firestore, config] = await Promise.all([
        rpc("almacenamiento_uso"),
        usoFirestore().catch((e) => ({ disponible: false, motivo: String(e.message ?? e) })),
        leerConfig(),
      ]);
      return json({ supabase, firestore, config, limites: LIMITES, proyecto_supabase: new URL(SUPABASE_URL).hostname.split(".")[0], fecha: new Date().toISOString() });
    }

    if (d.accion === "bucket") {
      const bucket = String(d.bucket ?? "");
      if (!/^[a-z0-9_-]+$/i.test(bucket)) return json({ error: "Bucket no válido" }, 400);
      return json({ desglose: await rpc("almacenamiento_bucket", { p_bucket: bucket }) });
    }

    if (d.accion === "previa") {
      const reglas = (Array.isArray(d.reglas) ? d.reglas : []).filter(valida) as Regla[];
      const previas = [];
      for (const r of reglas) {
        const hasta = corte(r.dias);
        try { previas.push({ regla: r, hasta, ...(await candidatos(r, hasta)) }); }
        catch (e) { previas.push({ regla: r, hasta, error: String((e as Error).message ?? e), elementos: [], total: 0, bytes: 0 }); }
      }
      return json({ previas });
    }

    if (d.accion === "limpiar") {
      const resultado = [];
      for (const s of Array.isArray(d.seleccion) ? d.seleccion : []) {
        const r = s.regla as Regla, hasta = String(s.hasta ?? "");
        if (!valida(r) || !Number.isFinite(Date.parse(hasta)) || Date.parse(hasta) > Date.now() - DIA) { resultado.push({ regla: r?.id, error: "Regla no válida" }); continue; }
        if (r.origen !== "tabla" && !Array.isArray(s.ids)) { resultado.push({ regla: r.id, error: "Falta la vista previa" }); continue; }
        try { resultado.push({ regla: r.id, ...(await borrar(r, hasta, r.origen === "tabla" ? null : s.ids.map(String))) }); }
        catch (e) { resultado.push({ regla: r.id, error: String((e as Error).message ?? e) }); }
      }
      await anotar({ fecha: new Date().toISOString(), origen: "manual", resultado });
      return json({ ok: true, resultado });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error(e);
    const msg = String((e as Error).message ?? e);
    const faltaSql = /almacenamiento_|PGRST202|does not exist/i.test(msg);
    const archivo = /almacenamiento_bucket/.test(msg) ? "supabase/almacenamiento-desglose.sql" : "supabase/almacenamiento.sql";
    return json({ error: faltaSql ? "Falta ejecutar " + archivo + " en Supabase › SQL Editor." : msg }, 500);
  }
});
