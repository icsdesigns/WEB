-- SILAB 3D · Galería de trabajos realizados (pestaña «Galería» del panel admin → Valoraciones)
-- Ejecutar una vez en Supabase › SQL Editor.

-- 1. Tabla
create table if not exists public.galeria (
  id         uuid primary key default gen_random_uuid(),
  titulo     text,
  material   text,
  imagen     text not null,          -- WebP grande (máx. 1600 px)
  miniatura  text not null,          -- WebP para la rejilla (máx. 640 px)
  ancho      int,
  alto       int,
  orden      int not null default 0,
  visible    boolean not null default true,
  creado     timestamptz not null default now()
);

alter table public.galeria enable row level security;

-- La web pública solo ve las fotos visibles; el panel (sesión iniciada) lo gestiona todo
drop policy if exists "galeria lectura publica" on public.galeria;
create policy "galeria lectura publica" on public.galeria
  for select using (visible = true);

drop policy if exists "galeria gestion admin" on public.galeria;
create policy "galeria gestion admin" on public.galeria
  for all to authenticated using (true) with check (true);

-- 2. Almacenamiento de las fotos (público para leer, solo el panel sube y borra)
insert into storage.buckets (id, name, public)
values ('galeria', 'galeria', true)
on conflict (id) do update set public = true;

drop policy if exists "galeria fotos subir" on storage.objects;
create policy "galeria fotos subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'galeria');

drop policy if exists "galeria fotos borrar" on storage.objects;
create policy "galeria fotos borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'galeria');
