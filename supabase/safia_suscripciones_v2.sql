-- ============================================================
-- SAFIA · Suscripciones v2 + privacidad de la zona (30-sep-2026)
--   1) Vencida = tampoco se BORRA nada (decisión de Osmar): guardia before delete en las mismas 11 tablas.
--   2) Datos anónimos de la zona (safia_datos_zona): las cosechas por cultivo (cosechas[i]) también salen
--      sin precio de venta, observaciones ni notas (antes solo se limpiaba el formato viejo `cosecha`).
-- Seguro de correr más de una vez. Requiere haber corrido safia_suscripciones.sql.
-- ============================================================

-- 1) Guardia de borrado
create or replace function public.safia_susc_guardia_del() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d jsonb; eq text; ca text; ok boolean;
begin
  if public.safia_es_admin() then return OLD; end if;
  j := to_jsonb(OLD);
  d := case when j ? 'datos' then coalesce(j->'datos', '{}'::jsonb) else '{}'::jsonb end;
  eq := coalesce(nullif(d->>'equipoId', ''), nullif(j->>'equipo_id', ''));
  if eq is null and nullif(d->>'campanaId', '') is not null then
    select c.datos->>'equipoId' into eq from public.safia_campanas c where c.id = d->>'campanaId';
  end if;
  if eq is not null then ok := public.safia_equipo_vigente(eq);
  else
    ca := coalesce(nullif(d->>'campoId', ''), nullif(j->>'campo_id', ''), nullif(j->>'campo_ref', ''));
    ok := public.safia_campo_vigente(ca);
  end if;
  if not ok then
    raise exception 'SAFIA_SUSCRIPCION_VENCIDA: %', coalesce(eq, ca) using errcode = '42501',
      hint = 'La suscripción de este pivot está vencida: no se puede borrar nada hasta renovarla con Irrigar.';
  end if;
  return OLD;
end $$;

do $$
declare t text;
begin
  foreach t in array array['safia_analisis', 'safia_analisis_agua', 'safia_archivos', 'safia_campanas', 'safia_ciclos',
                           'safia_clima_estacion', 'safia_eventos', 'safia_foliar', 'safia_geo_capas', 'safia_ndvi', 'safia_planes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists safia_susc_del_trg on public.%I', t);
      execute format('create trigger safia_susc_del_trg before delete on public.%I for each row execute function public.safia_susc_guardia_del()', t);
    end if;
  end loop;
end $$;

-- 2) Privacidad: limpiar precio, observaciones y notas de `cosecha` y de cada `cosechas[i]`
create or replace function public.safia_campana_anonima(d jsonb) returns jsonb
language sql immutable as $$
  select (
    (d - 'observaciones' - 'notas' - 'archivos' - 'cosecha' - 'cosechas')
    || case when d ? 'cosecha' and jsonb_typeof(d->'cosecha') = 'object'
            then jsonb_build_object('cosecha', (d->'cosecha') - 'precioUSDt' - 'observaciones' - 'notas' - 'archivos') else '{}'::jsonb end
    || case when d ? 'cosechas' and jsonb_typeof(d->'cosechas') = 'object'
            then jsonb_build_object('cosechas', coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'object' then v - 'precioUSDt' - 'observaciones' - 'notas' - 'archivos' else v end)
                                                          from jsonb_each(d->'cosechas') as x(k, v)), '{}'::jsonb))
            when d ? 'cosechas' and jsonb_typeof(d->'cosechas') = 'array'
            then jsonb_build_object('cosechas', coalesce((select jsonb_agg(case when jsonb_typeof(v) = 'object' then v - 'precioUSDt' - 'observaciones' - 'notas' - 'archivos' else v end)
                                                          from jsonb_array_elements(d->'cosechas') as x(v)), '[]'::jsonb))
            else '{}'::jsonb end
  );
$$;

create or replace function public.safia_datos_zona() returns jsonb
language sql stable security definer set search_path = public as $$
  with camp as (
    select c.id, c.datos from public.safia_campanas c
    where public.safia_activo() and c.cliente_id is not null and c.cliente_id is distinct from public.safia_mi_cliente()
      and exists (select 1 from jsonb_array_elements(coalesce(c.datos->'cultivos', '[]'::jsonb)) cu
                  where coalesce(nullif(regexp_replace(cu->>'rendimientoReal', '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
  ),
  eq as (select e.id, e.datos from public.safia_equipos e where e.id in (select datos->>'equipoId' from camp)),
  ca as (
    select f.id, f.datos,
           'Lote ' || row_number() over (partition by coalesce(f.datos->>'localidad', f.datos->>'departamento', '') order by f.id) ||
           ' de ' || coalesce(nullif(f.datos->>'localidad', ''), nullif(f.datos->>'departamento', ''), 'la zona') as nombre
    from public.safia_campos f where f.id in (select datos->>'campoId' from eq)
  ),
  ci as (select x.id, x.datos from public.safia_ciclos x where x.cliente_id is not null and x.cliente_id is distinct from public.safia_mi_cliente()
                                                          and x.datos->>'campoId' in (select id from ca))
  select jsonb_build_object(
    'campos', coalesce((select jsonb_agg(jsonb_build_object('id', ca.id, 'nombre', ca.nombre, 'localidad', ca.datos->>'localidad', 'departamento', ca.datos->>'departamento',
                          'pais', ca.datos->>'pais', 'altitud', ca.datos->'altitud', 'tipoSuelo', ca.datos->>'tipoSuelo', 'zona', true)) from ca), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(jsonb_build_object('id', eq.id, 'campoId', eq.datos->'campoId', 'tipo', eq.datos->>'tipo', 'nombre', 'Lote',
                          'superficie', eq.datos->'superficie', 'zona', true)) from eq), '[]'::jsonb),
    'campanas', coalesce((select jsonb_agg(public.safia_campana_anonima(camp.datos) || '{"zona":true}'::jsonb) from camp), '[]'::jsonb),
    'analisis_suelo', coalesce((select jsonb_agg((a.datos - 'archivoNombre' - 'archivoRuta' - 'observaciones' - 'laboratorio' - 'muestra') || '{"zona":true}'::jsonb)
                          from public.safia_analisis a where a.datos->>'campoId' in (select id from ca) or a.datos->>'equipoId' in (select id from eq)), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'equipoId', ev.datos->'equipoId', 'tipo', ev.datos->>'tipo', 'fecha', ev.datos->>'fecha',
                          'cantidad', ev.datos->'cantidad', 'unidad', ev.datos->>'unidad', 'zona', true))
                          from public.safia_eventos ev where ev.datos->>'tipo' in ('riego', 'lluvia') and ev.datos->>'equipoId' in (select id from eq)), '[]'::jsonb),
    'ciclos', coalesce((select jsonb_agg((ci.datos - 'observaciones' - 'notas') || '{"zona":true}'::jsonb) from ci), '[]'::jsonb),
    'generado', now()
  );
$$;

-- Qué deberías ver: 11 guardias de borrado y ninguna campaña de la zona con precio u observaciones
select (select count(*) from pg_trigger where tgname = 'safia_susc_del_trg') as guardias_borrado,
       (select count(*) from jsonb_array_elements(public.safia_datos_zona()->'campanas') c
         where c::text like '%precioUSDt%' or c::text like '%observaciones%') as campanas_con_datos_privados;
