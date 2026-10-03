-- ============================================================================
-- SAFIA · Facturas de energía (ANDE) para repartir el gasto entre los pivots
-- ----------------------------------------------------------------------------
-- Seguro de correr más de una vez. Qué hace:
--   1. Tabla safia_facturas_energia, con la misma forma que las demás colecciones.
--   2. El trigger de dueño la conoce: completa cliente_id y la estancia (campo_ref)
--      por el campoId de la factura.
--   3. Mismas reglas que los análisis de agua: cada cliente ve lo suyo (el encargado y
--      el operador, solo sus estancias); cargan el cliente, el encargado e Irrigar.
-- ============================================================================

create table if not exists public.safia_facturas_energia (
  id text primary key,
  datos jsonb not null,
  actualizado_en timestamptz default now(),
  actualizado_por uuid default auth.uid(),
  cliente_id text,
  campo_ref text
);
create index if not exists safia_facturas_energia_cliente_idx on public.safia_facturas_energia (cliente_id);
create index if not exists safia_facturas_energia_campo_ref_idx on public.safia_facturas_energia (campo_ref);

-- el trigger de dueño ahora conoce también las facturas de energía
create or replace function public.safia_asignar_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d jsonb; c text; k text;
begin
  j := to_jsonb(NEW);
  d := case when j ? 'datos' then j->'datos' else '{}'::jsonb end;
  if TG_TABLE_NAME = 'safia_clientes' then
    c := NEW.id::text;
  elsif TG_TABLE_NAME = 'safia_campos' then
    c := nullif(d->>'clienteId', '');
  elsif TG_TABLE_NAME = 'safia_equipos' then
    c := public.safia_cliente_de_campo(d->>'campoId');
  elsif TG_TABLE_NAME in ('safia_campanas', 'safia_eventos') then
    c := public.safia_cliente_de_equipo(d->>'equipoId');
    if c is null and (d->>'campanaId') is not null then c := public.safia_cliente_de_campana(d->>'campanaId'); end if;
  elsif TG_TABLE_NAME in ('safia_ciclos', 'safia_analisis', 'safia_analisis_agua', 'safia_facturas_energia', 'safia_planes', 'safia_foliar', 'safia_clima_estacion') then
    c := coalesce(public.safia_cliente_de_campo(d->>'campoId'), public.safia_cliente_de_equipo(d->>'equipoId'));
  elsif TG_TABLE_NAME = 'safia_evaluaciones' then
    c := coalesce(public.safia_cliente_de_campo(d->>'campoId'), nullif(d->>'clienteId', ''));
  elsif TG_TABLE_NAME in ('safia_cultivos', 'safia_precios') then
    c := null;
  elsif TG_TABLE_NAME in ('safia_archivos', 'safia_geo_capas', 'safia_ndvi') then
    c := coalesce(public.safia_cliente_de_campo(j->>'campo_id'), public.safia_cliente_de_equipo(j->>'equipo_id'));
  elsif TG_TABLE_NAME = 'safia_geo_puntos' then
    select g.cliente_id into c from public.safia_geo_capas g where g.id::text = j->>'capa_id';
  end if;
  if c is null and TG_TABLE_NAME not in ('safia_cultivos', 'safia_precios') then c := NEW.cliente_id; end if;
  NEW.cliente_id := c;
  if TG_TABLE_NAME = 'safia_campos' then
    k := NEW.id::text;
  elsif TG_TABLE_NAME = 'safia_equipos' then
    k := nullif(d->>'campoId', '');
  elsif TG_TABLE_NAME in ('safia_campanas', 'safia_eventos') then
    k := public.safia_campo_de_equipo(d->>'equipoId');
    if k is null and (d->>'campanaId') is not null then k := public.safia_campo_de_campana(d->>'campanaId'); end if;
  elsif TG_TABLE_NAME in ('safia_ciclos', 'safia_analisis', 'safia_analisis_agua', 'safia_facturas_energia', 'safia_planes', 'safia_foliar', 'safia_clima_estacion') then
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

drop trigger if exists safia_cliente_trg on public.safia_facturas_energia;
create trigger safia_cliente_trg before insert or update on public.safia_facturas_energia
  for each row execute function public.safia_asignar_cliente();

alter table public.safia_facturas_energia enable row level security;
drop policy if exists safia_ver on public.safia_facturas_energia;
drop policy if exists safia_alta on public.safia_facturas_energia;
drop policy if exists safia_cambio on public.safia_facturas_energia;
drop policy if exists safia_baja on public.safia_facturas_energia;
create policy safia_ver on public.safia_facturas_energia for select to authenticated
  using (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_campo_ok(campo_ref))));
create policy safia_alta on public.safia_facturas_energia for insert to authenticated
  with check (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_mi_rol() = any (array['cliente', 'encargado']) and safia_campo_ok(campo_ref))));
create policy safia_cambio on public.safia_facturas_energia for update to authenticated
  using (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_mi_rol() = any (array['cliente', 'encargado']) and safia_campo_ok(campo_ref))))
  with check (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_mi_rol() = any (array['cliente', 'encargado']) and safia_campo_ok(campo_ref))));
create policy safia_baja on public.safia_facturas_energia for delete to authenticated
  using (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_mi_rol() = any (array['cliente', 'encargado']) and safia_campo_ok(campo_ref))));
grant select, insert, update, delete on public.safia_facturas_energia to authenticated;

select 'Facturas de energía listas' as resultado,
  (select count(*) from pg_policies where tablename = 'safia_facturas_energia') as reglas,
  (select count(*) from public.safia_facturas_energia) as facturas;
