-- SILAB 3D · Ajuste «Orden aleatorio» de la galería (pestaña Galería del panel admin)
-- Ejecutar una vez en Supabase › SQL Editor.

create table if not exists public.ajustes_web (
  clave       text primary key,
  valor       jsonb not null,
  actualizado timestamptz not null default now()
);

alter table public.ajustes_web enable row level security;

-- Los ajustes no son secretos: la web pública los lee; solo el panel (sesión iniciada) los cambia
drop policy if exists "ajustes lectura publica" on public.ajustes_web;
create policy "ajustes lectura publica" on public.ajustes_web
  for select using (true);

drop policy if exists "ajustes gestion admin" on public.ajustes_web;
create policy "ajustes gestion admin" on public.ajustes_web
  for all to authenticated using (true) with check (true);

insert into public.ajustes_web (clave, valor) values ('galeria_aleatoria', 'false'::jsonb)
on conflict (clave) do nothing;
