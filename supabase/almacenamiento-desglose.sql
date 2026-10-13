-- SILAB 3D · Gestor de almacenamiento › desglose de un bucket
-- Ejecutar una vez en Supabase › SQL Editor (después de supabase/almacenamiento.sql).
-- Lo usa la función gestor-almacenamiento (acción «bucket»); solo la puede llamar service_role.

create or replace function public.almacenamiento_bucket(p_bucket text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with o as (
    select name,
           coalesce((metadata->>'size')::bigint, 0) as bytes,
           coalesce(nullif(metadata->>'mimetype', ''), 'desconocido') as mime,
           case when name ~ '\.[A-Za-z0-9]{1,8}$' then lower(substring(name from '\.([A-Za-z0-9]{1,8})$')) else 'sin extensión' end as ext,
           case when position('/' in name) > 0 then split_part(name, '/', 1) else '(raíz)' end as carpeta,
           created_at
    from storage.objects where bucket_id = p_bucket
  )
  select jsonb_build_object(
    'objetos', (select count(*) from o),
    'bytes', (select coalesce(sum(bytes), 0) from o),
    'primero', (select min(created_at) from o),
    'ultimo', (select max(created_at) from o),
    'por_tipo', coalesce((select jsonb_agg(x order by x.bytes desc) from (
        select ext as clave, count(*) as n, sum(bytes)::bigint as bytes from o group by ext order by sum(bytes) desc limit 12) x), '[]'::jsonb),
    'por_carpeta', coalesce((select jsonb_agg(x order by x.bytes desc) from (
        select carpeta as clave, count(*) as n, sum(bytes)::bigint as bytes from o group by carpeta order by sum(bytes) desc limit 12) x), '[]'::jsonb),
    'por_mes', coalesce((select jsonb_agg(x order by x.clave) from (
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as clave, count(*) as n, sum(bytes)::bigint as bytes
        from o where created_at > now() - interval '12 months' group by 1) x), '[]'::jsonb),
    'mayores', coalesce((select jsonb_agg(x order by x.bytes desc) from (
        select name as nombre, bytes, created_at as fecha from o order by bytes desc limit 10) x), '[]'::jsonb)
  );
$$;

revoke all on function public.almacenamiento_bucket(text) from public, anon, authenticated;
grant execute on function public.almacenamiento_bucket(text) to service_role;
