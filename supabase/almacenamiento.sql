-- SILAB 3D · Gestor de almacenamiento (pestaña «Almacenamiento» del panel admin)
-- Ejecutar una vez en Supabase › SQL Editor, después de desplegar la función
-- «gestor-almacenamiento» (supabase/functions/gestor-almacenamiento/index.ts).
--
-- Estas funciones solo las puede llamar la función (service_role): el navegador no
-- ve el uso ni puede borrar nada directamente. Las reglas de limpieza se guardan en
-- config_tasadora, clave «almacenamiento» (las edita el panel).

-- 1. Uso: tamaño de la base de datos, de cada tabla y de cada bucket
create or replace function public.almacenamiento_uso()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tablas', coalesce((
      select jsonb_agg(jsonb_build_object('tabla', s.relname, 'bytes', pg_total_relation_size(s.relid), 'filas', s.n_live_tup)
                       order by pg_total_relation_size(s.relid) desc)
      from pg_catalog.pg_stat_user_tables s where s.schemaname = 'public'), '[]'::jsonb),
    'esquemas', coalesce((
      select jsonb_agg(jsonb_build_object('esquema', x.esquema, 'bytes', x.bytes) order by x.bytes desc)
      from (select n.nspname as esquema, sum(pg_total_relation_size(c.oid))::bigint as bytes
            from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r', 'm') and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%'
            group by n.nspname) x), '[]'::jsonb),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b.id, 'publico', b.public, 'objetos', coalesce(o.n, 0), 'bytes', coalesce(o.bytes, 0))
                       order by coalesce(o.bytes, 0) desc)
      from storage.buckets b
      left join (select bucket_id, count(*) as n, sum(coalesce((metadata->>'size')::bigint, 0))::bigint as bytes
                 from storage.objects group by bucket_id) o on o.bucket_id = b.id), '[]'::jsonb)
  );
$$;

-- 2. Archivos de un bucket subidos antes de una fecha
create or replace function public.almacenamiento_antiguos(p_bucket text, p_hasta timestamptz)
returns table (nombre text, bytes bigint, fecha timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.name, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
  from storage.objects o
  where o.bucket_id = p_bucket and o.created_at < p_hasta
  order by o.created_at;
$$;

-- 3. Archivos de un bucket que no aparecen en ninguna tabla de la web (huérfanos),
--    subidos antes de una fecha (así no toca lo que se está subiendo en ese momento)
create or replace function public.almacenamiento_huerfanos(p_bucket text, p_hasta timestamptz)
returns table (nombre text, bytes bigint, fecha timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  t record;
  parte text;
  textos text := '';
begin
  for t in select c.oid::regclass as rel from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('select string_agg(x::text, chr(10)) from %s x', t.rel) into parte;
    textos := textos || chr(10) || coalesce(parte, '');
  end loop;
  return query
    select o.name, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
    from storage.objects o
    where o.bucket_id = p_bucket and o.created_at < p_hasta
      and position(o.name in textos) = 0
      and position(replace(o.name, ' ', '%20') in textos) = 0
    order by o.created_at;
end;
$$;

-- 4. Filas de una tabla anteriores a una fecha: cuenta (p_borrar = false) o borra (true)
--    Solo tablas de esta lista; el resto (productos, galería, configuración…) nunca.
create or replace function public.almacenamiento_filas(p_tabla text, p_columna text, p_hasta timestamptz, p_borrar boolean default false)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  if p_tabla not in ('solicitudes_presupuesto', 'subidas', 'notas', 'keep_alive') then
    raise exception 'Tabla no permitida: %', p_tabla;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = p_tabla and column_name = p_columna
                   and data_type in ('timestamp with time zone', 'timestamp without time zone', 'date')) then
    raise exception 'La tabla % no tiene la columna de fecha %', p_tabla, p_columna;
  end if;
  if p_borrar then
    execute format('with b as (delete from public.%I where %I < $1 returning 1) select count(*) from b', p_tabla, p_columna) into n using p_hasta;
  else
    execute format('select count(*) from public.%I where %I < $1', p_tabla, p_columna) into n using p_hasta;
  end if;
  return n;
end;
$$;

revoke all on function public.almacenamiento_uso() from public, anon, authenticated;
revoke all on function public.almacenamiento_antiguos(text, timestamptz) from public, anon, authenticated;
revoke all on function public.almacenamiento_huerfanos(text, timestamptz) from public, anon, authenticated;
revoke all on function public.almacenamiento_filas(text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.almacenamiento_uso() to service_role;
grant execute on function public.almacenamiento_antiguos(text, timestamptz) to service_role;
grant execute on function public.almacenamiento_huerfanos(text, timestamptz) to service_role;
grant execute on function public.almacenamiento_filas(text, text, timestamptz, boolean) to service_role;

-- 5. Limpieza programada: cada noche aplica las reglas ACTIVAS del panel.
--    Sustituye a «limpiar-solicitudes-diario» (la regla de adjuntos a 6 meses ya viene
--    activa en el panel). Pon la misma PURGE_KEY que tiene el secreto de Supabase.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('gestor-almacenamiento-diario')
where exists (select 1 from cron.job where jobname = 'gestor-almacenamiento-diario');

select cron.schedule(
  'gestor-almacenamiento-diario',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := 'https://yyezkumbjqnushwgqkzf.supabase.co/functions/v1/gestor-almacenamiento',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-purge-key', 'a2eefd434609b86bdc3ac51fb3494d1796cc5d54bd175a048abd76024fa08ec0'),
    body    := '{"accion":"programada"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Cuando compruebes en el panel que la limpieza programada funciona («Últimas limpiezas»),
-- quita la antigua para que no haya dos:
-- select cron.unschedule('limpiar-solicitudes-diario');
