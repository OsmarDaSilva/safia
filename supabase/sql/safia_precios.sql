-- SAFIA · precios vigentes con historial (misma forma que las otras colecciones sincronizadas)
-- Seguro de correr más de una vez.
create table if not exists public.safia_precios (
  id              text primary key,
  datos           jsonb not null,
  actualizado_en  timestamptz default now(),
  actualizado_por uuid default auth.uid()
);
alter table public.safia_precios enable row level security;
drop policy if exists "safia_autenticados" on public.safia_precios;
drop policy if exists "safia_activos" on public.safia_precios;
create policy "safia_activos" on public.safia_precios for all to authenticated
  using (public.safia_activo()) with check (public.safia_activo());
