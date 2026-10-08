/* ============================================================
   SILAB 3D · Tasadora · Ajustes editables desde /admin/
   (pestaña Tasadora → Configuración). Los leen el formulario «Configura tu
   proyecto» y el panel, así los dos funcionan siempre igual.
   Se guardan en Supabase: tabla config_tasadora, clave «tasadora».
   Sin tabla, sin conexión o sin guardar nada se usan los de DEFECTO, que
   son los valores de siempre. El motor de cálculo no se toca: aquí solo hay
   límites, qué opciones ve el cliente (y con qué textos) y el modo Normal.
   ============================================================ */

export const CLAVE = 'tasadora';
// Grupos de opciones del cliente, en el orden del formulario
export const GRUPOS = {
  definicion: 'Definición de la pieza',
  pared: 'Refuerzo de pared',
  densidad: 'Densidad',
  color: 'Color',
  altura: 'Tamaño'
};
// Grupos cuyo valor fija el modo «Normal»
export const GRUPOS_NORMAL = ['definicion', 'pared', 'densidad'];

export const DEFECTO = {
  limites: { ladoMm: 200, horas: 15, volumenMinCm3: 4, maxMB: 250 },
  normal: { definicion: 'normal', pared: 'normal', densidad: 'normal' },
  // Solo lo que cambia respecto al motor: { grupo: { opción: { visible, rotulo, ayuda } } }
  opciones: {}
};

export function mezclar(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? mezclar(base[k], v) : v;
  return out;
}

/* Opciones de un grupo tal como las ve el cliente: [[clave, { rotulo, ayuda }], …] solo las visibles.
   «OPCIONES» es el objeto del motor (presupuesto-motor.js). Si se ocultaran todas, se muestran todas. */
export function opcionesVisibles(OPCIONES, cfg, grupo) {
  const propias = (cfg && cfg.opciones && cfg.opciones[grupo]) || {};
  const todas = Object.entries(OPCIONES[grupo]).map(([k, o]) => {
    const p = propias[k] || {};
    return [k, { ...o, rotulo: p.rotulo || o.rotulo, ayuda: p.ayuda || o.ayuda, visible: p.visible !== false }];
  });
  const visibles = todas.filter(([, o]) => o.visible);
  return visibles.length ? visibles : todas;
}

/* Lee los ajustes guardados (lectura pública de la fila «tasadora»). Nunca falla: ante cualquier
   problema devuelve DEFECTO. Por defecto usa el proyecto de window.SILAB_SUPABASE. */
export async function cargarConfigTasadora(supabase = window.SILAB_SUPABASE || {}, esperaMs = 2500) {
  if (!supabase.url || !supabase.anonKey) return DEFECTO;
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), esperaMs);
    const r = await fetch(`${supabase.url}/rest/v1/config_tasadora?clave=eq.${CLAVE}&select=valor`, {
      headers: { apikey: supabase.anonKey, Authorization: 'Bearer ' + supabase.anonKey }, signal: ctrl.signal
    });
    clearTimeout(t);
    if (!r.ok) return DEFECTO;
    const filas = await r.json();
    return filas && filas[0] && filas[0].valor ? mezclar(DEFECTO, filas[0].valor) : DEFECTO;
  } catch (e) {
    return DEFECTO;
  }
}

// Una sola vez en Supabase (SQL Editor): tabla (si aún no existe) y lectura pública solo de esta fila
export const SQL = `create table if not exists public.config_tasadora (
  clave text primary key, valor jsonb not null, actualizado timestamptz not null default now());
alter table public.config_tasadora enable row level security;
do $$ begin
  create policy "config_tasadora: admin" on public.config_tasadora for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "config_tasadora: la web lee los ajustes de la tasadora" on public.config_tasadora for select to anon using (clave = '${CLAVE}');
exception when duplicate_object then null; end $$;`;
