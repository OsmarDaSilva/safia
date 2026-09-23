-- SAFIA · clima diario medido por estaciones meteorológicas (METOS / FieldClimate u otras)
-- Misma forma que las otras colecciones sincronizadas. Seguro de correr más de una vez.
create table if not exists public.safia_clima_estacion (
  id              text primary key,
  datos           jsonb not null,
  actualizado_en  timestamptz default now(),
  actualizado_por uuid default auth.uid()
);
alter table public.safia_clima_estacion enable row level security;
drop policy if exists "safia_autenticados" on public.safia_clima_estacion;
create policy "safia_autenticados" on public.safia_clima_estacion for all to authenticated using (true) with check (true);
