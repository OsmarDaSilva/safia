-- ============================================================================
-- SAFIA · Análisis de agua de riego (calidad del agua: RAS, salinidad, clase USSL)
-- ----------------------------------------------------------------------------
-- Seguro de correr más de una vez. Qué hace:
--   1. Tabla safia_analisis_agua, con la misma forma que las demás colecciones.
--   2. El trigger de dueño la conoce: completa cliente_id y la estancia (campo_ref)
--      por el campoId del análisis.
--   3. Mismas reglas que los análisis de suelo: cada cliente ve lo suyo (el
--      operador y el encargado, solo sus estancias); escribe el cliente dueño y Irrigar.
-- ============================================================================

create table if not exists public.safia_analisis_agua (
  id text primary key,
  datos jsonb not null,
  actualizado_en timestamptz default now(),
  actualizado_por uuid default auth.uid(),
  cliente_id text,
  campo_ref text
);
create index if not exists safia_analisis_agua_cliente_idx on public.safia_analisis_agua (cliente_id);
create index if not exists safia_analisis_agua_campo_ref_idx on public.safia_analisis_agua (campo_ref);

-- el trigger de dueño ahora conoce también los análisis de agua
create or replace function public.safia_asignar_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d jsonb; c text; k text;
begin
  j := to_jsonb(NEW);
  d := case when j ? 'datos' then j->'datos' else '{}'::jsonb end;
  -- cliente
  if TG_TABLE_NAME = 'safia_clientes' then
    c := NEW.id::text;
  elsif TG_TABLE_NAME = 'safia_campos' then
    c := nullif(d->>'clienteId', '');
  elsif TG_TABLE_NAME = 'safia_equipos' then
    c := public.safia_cliente_de_campo(d->>'campoId');
  elsif TG_TABLE_NAME in ('safia_campanas', 'safia_eventos') then
    c := public.safia_cliente_de_equipo(d->>'equipoId');
    if c is null and (d->>'campanaId') is not null then c := public.safia_cliente_de_campana(d->>'campanaId'); end if;
  elsif TG_TABLE_NAME in ('safia_ciclos', 'safia_analisis', 'safia_analisis_agua', 'safia_planes', 'safia_foliar', 'safia_clima_estacion') then
    c := coalesce(public.safia_cliente_de_campo(d->>'campoId'), public.safia_cliente_de_equipo(d->>'equipoId'));
  elsif TG_TABLE_NAME = 'safia_evaluaciones' then
    c := coalesce(public.safia_cliente_de_campo(d->>'campoId'), nullif(d->>'clienteId', ''));
  elsif TG_TABLE_NAME in ('safia_cultivos', 'safia_precios') then
    c := null;   -- compartidos entre todos
  elsif TG_TABLE_NAME in ('safia_archivos', 'safia_geo_capas', 'safia_ndvi') then
    c := coalesce(public.safia_cliente_de_campo(j->>'campo_id'), public.safia_cliente_de_equipo(j->>'equipo_id'));
  elsif TG_TABLE_NAME = 'safia_geo_puntos' then
    select g.cliente_id into c from public.safia_geo_capas g where g.id::text = j->>'capa_id';
  end if;
  if c is null and TG_TABLE_NAME not in ('safia_cultivos', 'safia_precios') then c := NEW.cliente_id; end if;
  NEW.cliente_id := c;
  -- estancia
  if TG_TABLE_NAME = 'safia_campos' then
    k := NEW.id::text;
  elsif TG_TABLE_NAME = 'safia_equipos' then
    k := nullif(d->>'campoId', '');
  elsif TG_TABLE_NAME in ('safia_campanas', 'safia_eventos') then
    k := public.safia_campo_de_equipo(d->>'equipoId');
    if k is null and (d->>'campanaId') is not null then k := public.safia_campo_de_campana(d->>'campanaId'); end if;
  elsif TG_TABLE_NAME in ('safia_ciclos', 'safia_analisis', 'safia_analisis_agua', 'safia_planes', 'safia_foliar', 'safia_clima_estacion') then
    k := coalesce(nullif(d->>'campoId', ''), public.safia_campo_de_equipo(d->>'equipoId'));
  elsif TG_TABLE_NAME = 'safia_evaluaciones' then
    k := nullif(d->>'campoId', '');
  elsif TG_TABLE_NAME in ('safia_archivos', 'safia_geo_capas', 'safia_ndvi') then
    k := coalesce(nullif(j->>'campo_id', ''), public.safia_campo_de_equipo(j->>'equipo_id'));
  elsif TG_TABLE_NAME = 'safia_geo_puntos' then
    select g.campo_ref into k from public.safia_geo_capas g where g.id::text = j->>'capa_id';
  end if;
  NEW.campo_ref := k;
  if j ? 'actualizado_por' and auth.uid() is not null then NEW.actualizado_por := auth.uid(); end if;
  return NEW;
end $$;

drop trigger if exists safia_cliente_trg on public.safia_analisis_agua;
create trigger safia_cliente_trg before insert or update on public.safia_analisis_agua
  for each row execute function public.safia_asignar_cliente();

-- reglas: como los análisis de suelo
alter table public.safia_analisis_agua enable row level security;
drop policy if exists "safia_ver" on public.safia_analisis_agua;
drop policy if exists "safia_alta" on public.safia_analisis_agua;
drop policy if exists "safia_cambio" on public.safia_analisis_agua;
drop policy if exists "safia_baja" on public.safia_analisis_agua;
create policy "safia_ver" on public.safia_analisis_agua for select to authenticated
  using (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_campo_ok(campo_ref))));
create policy "safia_alta" on public.safia_analisis_agua for insert to authenticated
  with check (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = 'cliente')));
create policy "safia_cambio" on public.safia_analisis_agua for update to authenticated
  using (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = 'cliente')))
  with check (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = 'cliente')));
create policy "safia_baja" on public.safia_analisis_agua for delete to authenticated
  using (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = 'cliente')));

-- control: la tabla existe y tiene sus 4 reglas
select 'safia_analisis_agua' tabla,
       (select count(*) from public.safia_analisis_agua) filas,
       (select count(*) from pg_policies where tablename = 'safia_analisis_agua') reglas;
