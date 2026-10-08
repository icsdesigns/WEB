// ============================================================
//  Supabase Edge Function:  autorizar-subida
//  «Configura tu proyecto» pide aquí permiso antes de subir cada adjunto al bucket
//  «solicitudes». Si la procedencia (IP) no ha pasado de 2 GB en los últimos 30 días,
//  devuelve un enlace de subida firmado de un solo uso para ese archivo.
//  Así la subida anónima directa al bucket puede quedar cerrada (ver
//  «4. SEGURIDAD/1-supabase-seguridad.sql», bloque D).
//
//  La IP no se guarda tal cual: se guarda su huella (SHA-256 con sal).
//  Desplegar:
//    supabase secrets set IP_SALT=<texto largo inventado>
//    supabase functions deploy autorizar-subida --no-verify-jwt
//  Opcionales: CUOTA_MB (2048), MAX_ARCHIVO_MB (50), DIAS_CUOTA (30)
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IP_SALT = Deno.env.get("IP_SALT") ?? "";
const BUCKET = "solicitudes";
const MB = 1024 * 1024;
const CUOTA = Number(Deno.env.get("CUOTA_MB") ?? "2048") * MB;          // 2 GB por IP
const MAX_ARCHIVO = Number(Deno.env.get("MAX_ARCHIVO_MB") ?? "50") * MB; // igual que el límite del bucket
const DIAS_CUOTA = Number(Deno.env.get("DIAS_CUOTA") ?? "30");
const VENTANA_MS = 10 * 60_000, MAX_ENLACES_VENTANA = 30;              // ráfagas: 30 enlaces cada 10 min

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sb(path: string, init: RequestInit = {}) {
  return fetch(SUPABASE_URL + path, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}
async function huella(ip: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(IP_SALT + "|" + ip));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
// Mismo formato de nombre que la web (lo exige solicitar-presupuesto para firmar los enlaces)
function slug(nombre: string) {
  const i = nombre.lastIndexOf("."), ext = i > 0 ? nombre.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const base = (i > 0 ? nombre.slice(0, i) : nombre).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "archivo";
  return base + (ext ? "." + ext : "");
}
function ruta(nombre: string) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789", v = new Uint32Array(6);
  crypto.getRandomValues(v);
  return Date.now() + "-" + Array.from(v, (x) => abc[x % abc.length]).join("") + "-" + slug(nombre);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !IP_SALT) return json({ error: "Función sin configurar" }, 500);

  let d: { nombre?: unknown; bytes?: unknown; tipo?: unknown };
  try { d = JSON.parse(await req.text()); } catch (_) { return json({ error: "JSON no válido" }, 400); }
  const nombre = String(d.nombre ?? "").slice(0, 200), bytes = Number(d.bytes);
  if (!nombre || !Number.isFinite(bytes) || bytes <= 0) return json({ error: "Archivo no válido" }, 400);
  if (bytes > MAX_ARCHIVO) return json({ error: `El archivo supera el límite de ${MAX_ARCHIVO / MB} MB` }, 413);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";
  const ipHash = await huella(ip);

  // Uso de esta procedencia: tamaño real de lo ya subido y el declarado de lo pendiente (función SQL cuota_subidas)
  const r = await sb("/rest/v1/rpc/cuota_subidas", { method: "POST", body: JSON.stringify({ p_ip: ipHash, p_dias: DIAS_CUOTA, p_ventana_min: VENTANA_MS / 60_000 }) });
  if (!r.ok) { console.error("cuota_subidas:", r.status, await r.text()); return json({ error: "No se pudo comprobar el límite de subida" }, 500); }
  const uso = (await r.json())?.[0] ?? { usados: 0, recientes: 0 };
  if (Number(uso.recientes) >= MAX_ENLACES_VENTANA) return json({ error: "Demasiados archivos seguidos. Espera unos minutos." }, 429);
  if (Number(uso.usados) + bytes > CUOTA) {
    return json({ error: `Has alcanzado el límite de ${Math.round(CUOTA / MB / 1024)} GB de archivos en ${DIAS_CUOTA} días. Escríbenos por WhatsApp y te ayudamos.` }, 429);
  }

  const camino = ruta(nombre);
  const ins = await sb("/rest/v1/subidas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ruta: camino, ip_hash: ipHash, bytes: Math.round(bytes) }) });
  if (!ins.ok) { console.error("subidas:", ins.status, await ins.text()); return json({ error: "No se pudo registrar la subida" }, 500); }

  const s = await sb(`/storage/v1/object/upload/sign/${BUCKET}/${encodeURIComponent(camino)}`, { method: "POST", body: "{}" });
  const firmado = await s.json().catch(() => ({}));
  const token = String(firmado.url ?? firmado.signedURL ?? "").split("token=")[1];
  if (!s.ok || !token) { console.error("Enlace de subida:", s.status, JSON.stringify(firmado)); return json({ error: "No se pudo preparar la subida" }, 500); }

  return json({ ruta: camino, token, restante: CUOTA - Number(uso.usados) - bytes });
});
