/* ============================================================
   SILAB 3D · Panel de administración · Vinculación con 3DCalc
   Paneles desplegables con los valores con los que «Solicitar presupuesto»
   (Configura tu proyecto) crea el pedido en 3DCalc y calcula su precio.
   Se guardan en Supabase (tabla config_tasadora, clave «vinculacion_3dcalc»)
   y los lee la función solicitar-presupuesto. Los valores por defecto son los
   mismos que los de la función (CONFIG_DEFECTO).
   ============================================================ */

const CLAVE = 'vinculacion_3dcalc';
export const DEFECTO = {
  precio_activo: true,
  empresa: 'SILAB3D',
  impresora: '',
  unidades: 1,
  filamento: { resistentes: 'PETG', artisticas: 'PLA' },
  diseno: 'No necesario',
  probabilidad_error: 'Media (50%)',
  urgencia_flexible: 'Normal',
  urgentes_con_precio: false,
  gasto_misc: 1,
  postproc_modo: 'Total',
  postproc_tramos: { limpio_max: 20, sencillo_max: 300 },
  produccion: { activar: true, tests: 1, dificultad: 'Compleja' }
};
const ERRORES = ['Exenta (0%)', 'Mínima (10%)', 'Baja (25%)', 'Media (50%)', 'Alta (100%)', 'Muy Alta (150%)', 'Crítica (200%)'];
const DISENOS = ['No necesario', 'Búsqueda de modelos', 'Básica (solo slicer)', 'Media (Fusion <1h)', 'Alta (Fusion >1h / Artístico)'];
export const SQL = `create table if not exists public.config_tasadora (
  clave text primary key, valor jsonb not null, actualizado timestamptz not null default now());
alter table public.config_tasadora enable row level security;
create policy "config_tasadora: admin" on public.config_tasadora for all to authenticated using (true) with check (true);`;

const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
const opciones = (lista, v) => lista.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
function mezclar(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? mezclar(base[k], v) : v;
  return out;
}

export const vinculacion3dcalc = {
  id: 'vinculacion-3dcalc',
  titulo: 'Vinculación con 3DCalc',
  ayuda: 'Valores con los que «Solicitar presupuesto» crea el pedido en 3DCalc y calcula el precio que ve el cliente. Los cambios se aplican en un minuto como mucho.',
  montar(cuerpo, { sb }) {
    cuerpo.innerHTML = '<p class="pista">Cargando…</p>';
    let c = DEFECTO;

    const pintar = () => {
      cuerpo.innerHTML = `
      <form class="adm-vinc">
        <details class="adm-vinc__panel" open>
          <summary>General</summary>
          <label class="adm-vinc__fila"><input type="checkbox" name="precio_activo"${c.precio_activo ? ' checked' : ''}> Mostrar al cliente el precio al momento (si no, todo pasa a revisión del equipo)</label>
          <label class="adm-vinc__fila">Empresa del pedido <input name="empresa" value="${esc(c.empresa)}"></label>
          <label class="adm-vinc__fila">Impresora predeterminada <input name="impresora" value="${esc(c.impresora)}" placeholder="Vacío: la primera de 3DCalc"></label>
          <label class="adm-vinc__fila">Unidades <input type="number" name="unidades" min="1" step="1" value="${esc(c.unidades)}" style="width:80px"></label>
        </details>
        <details class="adm-vinc__panel">
          <summary>Información del proyecto y filamento</summary>
          <p class="pista">Cliente, contacto, fecha y descripción (= nombre del proyecto) salen del formulario. Tipo: resistente = Técnico, artístico = Artístico.</p>
          <label class="adm-vinc__fila">Filamento para piezas resistentes <input name="filamento.resistentes" value="${esc(c.filamento.resistentes)}"></label>
          <label class="adm-vinc__fila">Filamento para piezas artísticas <input name="filamento.artisticas" value="${esc(c.filamento.artisticas)}"></label>
          <p class="pista">El nombre debe coincidir con un tipo de filamento de 3DCalc. El color es el elegido en el formulario, si lo hay; peso y tiempo, los de la tasadora.</p>
        </details>
        <details class="adm-vinc__panel">
          <summary>Parámetros complementarios</summary>
          <label class="adm-vinc__fila">Diseño <select name="diseno">${opciones(DISENOS, c.diseno)}</select></label>
          <label class="adm-vinc__fila">Probabilidad de error <select name="probabilidad_error">${opciones(ERRORES, c.probabilidad_error)}</select></label>
          <label class="adm-vinc__fila">Urgencia (plazo flexible) <select name="urgencia_flexible">${opciones(['Normal', 'Urgente'], c.urgencia_flexible)}</select></label>
          <label class="adm-vinc__fila"><input type="checkbox" name="urgentes_con_precio"${c.urgentes_con_precio ? ' checked' : ''}> Dar precio al momento también con plazo urgente (si no, lo valora el equipo)</label>
          <label class="adm-vinc__fila">Gastos extra <input type="number" name="gasto_misc" min="0" step="0.01" value="${esc(c.gasto_misc)}" style="width:90px"> €</label>
          <label class="adm-vinc__fila"><input type="checkbox" name="postproc_por_unidad"${c.postproc_modo === 'Por unidad' ? ' checked' : ''}> Post-procesado «por unidad»</label>
        </details>
        <details class="adm-vinc__panel">
          <summary>Post-procesado según las zonas de soporte</summary>
          <p class="pista">Zonas = partes separadas de la pieza que necesitan soporte (las cuenta la tasadora). Calibración: archivo limpio 2, sencillo 121, medio 495.</p>
          <label class="adm-vinc__fila">Limpio hasta <input type="number" name="postproc_tramos.limpio_max" min="0" step="1" value="${esc(c.postproc_tramos.limpio_max)}" style="width:90px"> zonas</label>
          <label class="adm-vinc__fila">Sencillo hasta <input type="number" name="postproc_tramos.sencillo_max" min="0" step="1" value="${esc(c.postproc_tramos.sencillo_max)}" style="width:90px"> zonas (por encima, medio)</label>
        </details>
        <details class="adm-vinc__panel">
          <summary>Tiempo de producción</summary>
          <label class="adm-vinc__fila"><input type="checkbox" name="produccion.activar"${c.produccion.activar ? ' checked' : ''}> Activar y rellenar el tiempo de producción</label>
          <label class="adm-vinc__fila">Tests <input type="number" name="produccion.tests" min="0" step="1" value="${esc(c.produccion.tests)}" style="width:80px"></label>
          <label class="adm-vinc__fila">Dificultad de los tests <select name="produccion.dificultad">${opciones(['Sencilla', 'Compleja'], c.produccion.dificultad)}</select></label>
        </details>
        <div class="fila"><button type="submit" class="btn">Guardar la vinculación</button><button type="button" class="btn btn-cancelar" data-defecto>Valores por defecto</button></div>
        <p class="pista adm-extra__estado" aria-live="polite"></p>
      </form>`;
      const form = cuerpo.querySelector('form'), estado = cuerpo.querySelector('.adm-extra__estado');
      cuerpo.querySelector('[data-defecto]').addEventListener('click', () => { c = DEFECTO; pintar(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = structuredClone(c);
        for (const el of form.elements) {
          if (!el.name || el.name === 'postproc_por_unidad') continue;
          const [a, b] = el.name.split('.');
          const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value.trim();
          if (b) v[a][b] = val; else v[a] = val;
        }
        v.postproc_modo = form.postproc_por_unidad.checked ? 'Por unidad' : 'Total';
        estado.textContent = 'Guardando…';
        const { error } = await sb.from('config_tasadora').upsert({ clave: CLAVE, valor: v, actualizado: new Date().toISOString() });
        if (error) { estado.innerHTML = 'No se pudo guardar: ' + esc(error.message) + '. Si la tabla aún no existe, ejecuta en Supabase (SQL Editor):<pre style="white-space:pre-wrap">' + esc(SQL) + '</pre>'; return; }
        c = v; estado.textContent = 'Guardado.';
      });
    };

    sb.from('config_tasadora').select('valor').eq('clave', CLAVE).maybeSingle().then(({ data, error }) => {
      if (!error && data && data.valor) c = mezclar(DEFECTO, data.valor);
      pintar();
      if (error) cuerpo.querySelector('.adm-extra__estado').innerHTML = 'Aún no hay tabla de configuración en Supabase; se muestran los valores por defecto. Para crearla, ejecuta en el SQL Editor:<pre style="white-space:pre-wrap">' + esc(SQL) + '</pre>';
    });
  }
};
