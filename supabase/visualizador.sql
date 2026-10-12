-- SILAB 3D · Visualizador 3D (pestaña «Visualizador» del panel admin → página /visualizador/)
-- Ejecutar una vez en Supabase › SQL Editor.

-- 1. Tabla: una fila por opción (una cama de un 3MF)
create table if not exists public.visualizador (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  material    text not null default 'PLA',      -- paleta que ve el cliente: PLA o PETG
  modelo      text not null,                    -- URL pública del .s3dv (malla comprimida de la cama)
  miniatura   text,                             -- URL pública de la miniatura PNG de la cama
  precios     jsonb not null default '[]',      -- [{ desde, precio }] tramos cantidad-precio por unidad
  colores     jsonb not null default '[]',      -- [{ slot, nombre, hex }] filamentos del 3MF
  origen      jsonb,                            -- { archivo, cama, triangulos }
  kb          int,                              -- peso del modelo en Storage
  orden       int not null default 0,
  visible     boolean not null default true,
  creado      timestamptz not null default now()
);

alter table public.visualizador enable row level security;

-- La web pública solo ve las opciones visibles; el panel (sesión iniciada) lo gestiona todo
drop policy if exists "visualizador lectura publica" on public.visualizador;
create policy "visualizador lectura publica" on public.visualizador
  for select using (visible = true);

drop policy if exists "visualizador gestion admin" on public.visualizador;
create policy "visualizador gestion admin" on public.visualizador
  for all to authenticated using (true) with check (true);

-- 2. Almacenamiento de los modelos y miniaturas (público para leer, solo el panel sube y borra)
insert into storage.buckets (id, name, public)
values ('visualizador', 'visualizador', true)
on conflict (id) do update set public = true;

drop policy if exists "visualizador archivos subir" on storage.objects;
create policy "visualizador archivos subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'visualizador');

drop policy if exists "visualizador archivos borrar" on storage.objects;
create policy "visualizador archivos borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'visualizador');

-- Si ya aplicaste el bloque A del informe de seguridad (políticas «solo admin»),
-- añade también aquí la misma condición de administrador a las tres políticas «to authenticated».

-- Si ya ejecutaste la primera versión, añade la columna de precios:
alter table public.visualizador add column if not exists precios jsonb not null default '[]';

-- 3. Varios visualizadores (cada uno con su URL /visualizador/<url>/ y, si quieres, vinculado a un producto)
alter table public.visualizador add column if not exists grupo text not null default 'general';

create table if not exists public.visualizador_grupos (
  slug      text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- la parte final de la URL
  nombre    text not null,
  producto  text,                          -- nombre del producto cuyo botón «Solicitar» abre este visualizador
  orden     int not null default 0,
  visible   boolean not null default true,
  creado    timestamptz not null default now()
);

alter table public.visualizador_grupos enable row level security;

drop policy if exists "visualizador_grupos lectura publica" on public.visualizador_grupos;
create policy "visualizador_grupos lectura publica" on public.visualizador_grupos
  for select using (visible = true);

drop policy if exists "visualizador_grupos gestion admin" on public.visualizador_grupos;
create policy "visualizador_grupos gestion admin" on public.visualizador_grupos
  for all to authenticated using (true) with check (true);

-- El visualizador que ya existe pasa a llamarse «general» (URL /visualizador/)
insert into public.visualizador_grupos (slug, nombre) values ('general', 'Visualizador general')
on conflict (slug) do nothing;

-- 4. Permisos de lectura y actualización de los archivos (por si al guardar sale
--    «new row violates row-level security policy» al subir un modelo)
drop policy if exists "visualizador archivos leer" on storage.objects;
create policy "visualizador archivos leer" on storage.objects
  for select to authenticated using (bucket_id = 'visualizador');

drop policy if exists "visualizador archivos actualizar" on storage.objects;
create policy "visualizador archivos actualizar" on storage.objects
  for update to authenticated using (bucket_id = 'visualizador') with check (bucket_id = 'visualizador');
