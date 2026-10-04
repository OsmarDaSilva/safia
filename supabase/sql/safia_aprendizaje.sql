-- ============================================================================
-- SAFIA · Lo que SAFIA aprendió (tabla safia_aprendizaje)
-- Seguro de correr más de una vez.
--   · Un solo registro con lo aprendido de las cosechas del banco: correcciones del ciclo de cada material,
--     cierre del surco de la soja, rango de la meta, modelo de rinde y recomendaciones. Sin nombres de clientes.
--   · Lo leen todos los usuarios activos (los motores lo usan); lo escribe solo Irrigar, que ve todo el banco.
-- ============================================================================
create table if not exists public.safia_aprendizaje (
  id text primary key,
  datos jsonb not null,
  actualizado_en timestamptz default now(),
  actualizado_por uuid default auth.uid()
);

alter table public.safia_aprendizaje enable row level security;
drop policy if exists safia_ver on public.safia_aprendizaje;
drop policy if exists safia_alta on public.safia_aprendizaje;
drop policy if exists safia_cambio on public.safia_aprendizaje;
drop policy if exists safia_baja on public.safia_aprendizaje;
create policy safia_ver on public.safia_aprendizaje for select to authenticated using (safia_activo());
create policy safia_alta on public.safia_aprendizaje for insert to authenticated with check (safia_activo() and safia_es_admin());
create policy safia_cambio on public.safia_aprendizaje for update to authenticated using (safia_activo() and safia_es_admin()) with check (safia_activo() and safia_es_admin());
create policy safia_baja on public.safia_aprendizaje for delete to authenticated using (safia_activo() and safia_es_admin());
grant select, insert, update, delete on public.safia_aprendizaje to authenticated;

select 'Lo que SAFIA aprendió: lista' as resultado,
  (select count(*) from pg_policies where tablename = 'safia_aprendizaje') as reglas,
  (select count(*) from public.safia_aprendizaje) as registros;
