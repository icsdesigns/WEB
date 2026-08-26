// ============================================================
//  Supabase Edge Function:  enviar-solicitud
//  Envía un email a SILAB con los datos de la solicitud de
//  presupuesto y los enlaces de los archivos subidos a Storage.
//
//  Desplegar:
//    supabase functions deploy enviar-solicitud --no-verify-jwt
//  Secret necesario (clave de Resend, gratis en https://resend.com):
//    supabase secrets set RESEND_API_KEY=tu_clave_de_resend
//  Opcionales:
//    supabase secrets set DEST_EMAIL=silab3d@gmail.com
//    supabase secrets set FROM_EMAIL="SILAB 3D <onboarding@resend.dev>"
// ============================================================

const DEST_EMAIL = Deno.env.get("DEST_EMAIL") ?? "silab3d@gmail.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "SILAB 3D <onboarding@resend.dev>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let p: Record<string, unknown> = {};
  try {
    p = await req.json();
  } catch (_) {
    // cuerpo vacío o no-JSON
  }

  const archivos = Array.isArray(p.archivos) ? (p.archivos as string[]) : [];
  const archivosHtml = archivos.length
    ? "<ul>" + archivos.map((u) => `<li><a href="${esc(u)}">${esc(u)}</a></li>`).join("") + "</ul>"
    : "<em>Sin archivos adjuntos</em>";

  const html = `
    <h2>Nueva solicitud de presupuesto — SILAB 3D</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      <tr><td><strong>Nombre</strong></td><td>${esc(p.nombre)}</td></tr>
      <tr><td><strong>Contacto</strong></td><td>${esc(p.contacto)}</td></tr>
      <tr><td><strong>Proyecto</strong></td><td>${esc(p.proyecto)}</td></tr>
      <tr><td><strong>Descripción</strong></td><td>${esc(p.descripcion)}</td></tr>
      <tr><td><strong>Medidas</strong></td><td>${esc(p.medidas)}</td></tr>
      <tr><td><strong>Plazo deseado</strong></td><td>${esc(p.plazo)}</td></tr>
      <tr><td><strong>Tipo de proyecto</strong></td><td>${esc(p.tipoPieza)}</td></tr>
      <tr><td><strong>Colores</strong></td><td>${esc(p.colores)}</td></tr>
      <tr><td><strong>Referencia</strong></td><td>${esc(p.referencia)}</td></tr>
    </table>
    <h3>Archivos</h3>
    ${archivosHtml}
  `;

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY no configurada" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const replyTo = typeof p.contacto === "string" && p.contacto.includes("@") ? p.contacto : undefined;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [DEST_EMAIL],
      reply_to: replyTo,
      subject: `Nueva solicitud · ${String(p.proyecto ?? "Proyecto")}`,
      html,
    }),
  });

  const data = await r.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: r.ok, resend: data }), {
    status: r.ok ? 200 : 502,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
