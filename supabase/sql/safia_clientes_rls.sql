-- ============================================================================
-- SAFIA · Candado por cliente (RLS) + datos anónimos de la zona
-- ----------------------------------------------------------------------------
-- Seguro de correr más de una vez. Qué hace:
--   1. Cada tabla de datos lleva una columna cliente_id (dueño del registro).
--   2. Un trigger la completa solo, siguiendo la cadena
--        cliente → campo (clienteId) → equipo (campoId) → campaña / eventos (equipoId)
--        análisis, planes, foliar, clima: por campoId o equipoId
--        archivos, capas geo, NDVI: por campo_id; puntos geo: por su capa.
--   3. Políticas: propietario y admin ven y escriben TODO; el cliente y sus
--      operadores ven solo lo de su cliente; el operador solo escribe eventos,
--      ciclos y clima de estación. Cultivos y precios son compartidos (precios
--      los escribe solo Irrigar).
--   4. safia_datos_zona(): devuelve, sin nombres ni ubicación exacta, las
--      campañas cosechadas de los OTROS clientes (lote, cultivo, rinde, agua,
--      suelo) para rankings y comparaciones por zona y país.
--   5. safia_recalcular_clientes(): vuelve a completar cliente_id en todas las
--      filas (se corre al final; un admin puede volver a llamarla cuando quiera).
-- ============================================================================

-- 1) columna cliente_id en todas las tablas de datos --------------------------
do $$
declare t text;
begin
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_campanas','safia_eventos','safia_ciclos',
                           'safia_analisis','safia_planes','safia_foliar','safia_clima_estacion','safia_cultivos','safia_precios',
                           'safia_archivos','safia_geo_capas','safia_geo_puntos','safia_ndvi'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists cliente_id text', t);
    execute format('create index if not exists %I on public.%I (cliente_id)', t || '_cliente_idx', t);
  end loop;
end $$;

-- 2) quién soy ---------------------------------------------------------------
create or replace function public.safia_mi_cliente() returns text
language sql stable security definer set search_path = public as $$
  select cliente_id from public.safia_usuarios where id = auth.uid() and estado = 'activo';
$$;
create or replace function public.safia_mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.safia_usuarios where id = auth.uid() and estado = 'activo';
$$;
grant execute on function public.safia_mi_cliente() to authenticated;
grant execute on function public.safia_mi_rol() to authenticated;

-- 3) cadena de dueño ---------------------------------------------------------
create or replace function public.safia_cliente_de_campo(p_campo text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(c.cliente_id, nullif(c.datos->>'clienteId', '')) from public.safia_campos c where c.id = p_campo;
$$;
create or replace function public.safia_cliente_de_equipo(p_equipo text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(e.cliente_id, public.safia_cliente_de_campo(e.datos->>'campoId')) from public.safia_equipos e where e.id = p_equipo;
$$;
create or replace function public.safia_cliente_de_campana(p_campana text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(c.cliente_id, public.safia_cliente_de_equipo(c.datos->>'equipoId')) from public.safia_campanas c where c.id = p_campana;
$$;

-- 4) trigger: completa cliente_id según la tabla -----------------------------
create or replace function public.safia_asignar_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d jsonb; c text;
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
  elsif TG_TABLE_NAME in ('safia_ciclos', 'safia_analisis', 'safia_planes', 'safia_foliar', 'safia_clima_estacion') then
    c := coalesce(public.safia_cliente_de_campo(d->>'campoId'), public.safia_cliente_de_equipo(d->>'equipoId'));
  elsif TG_TABLE_NAME in ('safia_cultivos', 'safia_precios') then
    c := null;   -- compartidos entre todos
  elsif TG_TABLE_NAME in ('safia_archivos', 'safia_geo_capas', 'safia_ndvi') then
    c := coalesce(public.safia_cliente_de_campo(j->>'campo_id'), public.safia_cliente_de_equipo(j->>'equipo_id'));
  elsif TG_TABLE_NAME = 'safia_geo_puntos' then
    select g.cliente_id into c from public.safia_geo_capas g where g.id::text = j->>'capa_id';
  end if;
  if c is null and TG_TABLE_NAME not in ('safia_cultivos', 'safia_precios') then c := NEW.cliente_id; end if;
  NEW.cliente_id := c;
  if j ? 'actualizado_por' and auth.uid() is not null then NEW.actualizado_por := auth.uid(); end if;
  return NEW;
end $$;

do $$
declare t text;
begin
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_campanas','safia_eventos','safia_ciclos',
                           'safia_analisis','safia_planes','safia_foliar','safia_clima_estacion','safia_cultivos','safia_precios',
                           'safia_archivos','safia_geo_capas','safia_geo_puntos','safia_ndvi'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists safia_cliente_trg on public.%I', t);
    execute format('create trigger safia_cliente_trg before insert or update on public.%I for each row execute function public.safia_asignar_cliente()', t);
  end loop;
end $$;

-- 5) recalcular dueños de todo lo que ya existe (en orden de la cadena) -------
create or replace function public.safia_recalcular_clientes() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; n bigint; r jsonb := '{}'::jsonb;
begin
  if not public.safia_es_admin() and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Solo un administrador de SAFIA puede recalcular';
  end if;
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_campanas','safia_eventos','safia_ciclos',
                           'safia_analisis','safia_planes','safia_foliar','safia_clima_estacion','safia_cultivos','safia_precios',
                           'safia_archivos','safia_geo_capas','safia_ndvi','safia_geo_puntos'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('update public.%I set cliente_id = cliente_id', t);
    get diagnostics n = row_count;
    r := r || jsonb_build_object(t, n);
  end loop;
  return r;
end $$;
grant execute on function public.safia_recalcular_clientes() to authenticated;

-- 6) políticas ---------------------------------------------------------------
-- Tablas por cliente: ver = admin o mi cliente; escribir = admin o cliente dueño;
-- operador: escribe solo eventos, ciclos y clima de estación.
do $$
declare t text; escritura text;
begin
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_campanas','safia_eventos','safia_ciclos',
                           'safia_analisis','safia_planes','safia_foliar','safia_clima_estacion',
                           'safia_archivos','safia_geo_capas','safia_geo_puntos','safia_ndvi'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "safia_activos" on public.%I', t);
    execute format('drop policy if exists "safia_ver" on public.%I', t);
    execute format('drop policy if exists "safia_alta" on public.%I', t);
    execute format('drop policy if exists "safia_cambio" on public.%I', t);
    execute format('drop policy if exists "safia_baja" on public.%I', t);
    if t in ('safia_eventos', 'safia_ciclos', 'safia_clima_estacion') then
      escritura := 'public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() in (''cliente'', ''operador'')))';
    elsif t = 'safia_clientes' then
      -- el cliente puede corregir su propia ficha, pero no crear ni borrar clientes
      escritura := 'public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = ''cliente''))';
    else
      escritura := 'public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = ''cliente''))';
    end if;
    execute format('create policy "safia_ver" on public.%I for select to authenticated using (public.safia_activo() and (public.safia_es_admin() or cliente_id = public.safia_mi_cliente()))', t);
    if t = 'safia_clientes' then
      execute format('create policy "safia_alta" on public.%I for insert to authenticated with check (public.safia_activo() and public.safia_es_admin())', t);
      execute format('create policy "safia_baja" on public.%I for delete to authenticated using (public.safia_activo() and public.safia_es_admin())', t);
    else
      execute format('create policy "safia_alta" on public.%I for insert to authenticated with check (%s)', t, escritura);
      execute format('create policy "safia_baja" on public.%I for delete to authenticated using (%s)', t, escritura);
    end if;
    execute format('create policy "safia_cambio" on public.%I for update to authenticated using (%s) with check (%s)', t, escritura, escritura);
  end loop;
end $$;

-- Compartidas: cultivos (todos los activos leen y escriben), precios (todos leen, Irrigar escribe)
do $$
begin
  if to_regclass('public.safia_cultivos') is not null then
    alter table public.safia_cultivos enable row level security;
    drop policy if exists "safia_activos" on public.safia_cultivos;
    drop policy if exists "safia_ver" on public.safia_cultivos;
    drop policy if exists "safia_escribir" on public.safia_cultivos;
    create policy "safia_ver" on public.safia_cultivos for select to authenticated using (public.safia_activo());
    create policy "safia_escribir" on public.safia_cultivos for all to authenticated using (public.safia_activo()) with check (public.safia_activo());
  end if;
  if to_regclass('public.safia_precios') is not null then
    alter table public.safia_precios enable row level security;
    drop policy if exists "safia_activos" on public.safia_precios;
    drop policy if exists "safia_ver" on public.safia_precios;
    drop policy if exists "safia_escribir" on public.safia_precios;
    create policy "safia_ver" on public.safia_precios for select to authenticated using (public.safia_activo());
    create policy "safia_escribir" on public.safia_precios for all to authenticated using (public.safia_es_admin()) with check (public.safia_es_admin());
  end if;
end $$;

-- 7) datos anónimos de la zona (para clientes y operadores) -------------------
-- Campañas cosechadas de los OTROS clientes. Sin nombres, sin GPS, sin precios,
-- sin observaciones. Los lotes se llaman "Lote 1 de Katueté", "Lote 2 de Katueté"…
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
    'campanas', coalesce((select jsonb_agg(((camp.datos - 'observaciones' - 'notas' - 'archivos') #- '{cosecha,precioUSDt}') || '{"zona":true}'::jsonb) from camp), '[]'::jsonb),
    'analisis_suelo', coalesce((select jsonb_agg((a.datos - 'archivoNombre' - 'archivoRuta' - 'observaciones' - 'laboratorio' - 'muestra') || '{"zona":true}'::jsonb)
                          from public.safia_analisis a where a.datos->>'campoId' in (select id from ca) or a.datos->>'equipoId' in (select id from eq)), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'equipoId', ev.datos->'equipoId', 'tipo', ev.datos->>'tipo', 'fecha', ev.datos->>'fecha',
                          'cantidad', ev.datos->'cantidad', 'unidad', ev.datos->>'unidad', 'zona', true))
                          from public.safia_eventos ev where ev.datos->>'tipo' in ('riego', 'lluvia') and ev.datos->>'equipoId' in (select id from eq)), '[]'::jsonb),
    'ciclos', coalesce((select jsonb_agg((ci.datos - 'observaciones') || '{"zona":true}'::jsonb) from ci), '[]'::jsonb),
    'generado', now()
  );
$$;
grant execute on function public.safia_datos_zona() to authenticated;

-- 8) completar cliente_id en lo que ya existe --------------------------------
select public.safia_recalcular_clientes();

-- 9) control: cuántas filas quedaron sin dueño (deberían ser 0 salvo cultivos y precios)
select 'campos' t, count(*) filter (where cliente_id is null) sin_dueno, count(*) total from public.safia_campos
union all select 'equipos', count(*) filter (where cliente_id is null), count(*) from public.safia_equipos
union all select 'campanas', count(*) filter (where cliente_id is null), count(*) from public.safia_campanas
union all select 'eventos', count(*) filter (where cliente_id is null), count(*) from public.safia_eventos
union all select 'analisis', count(*) filter (where cliente_id is null), count(*) from public.safia_analisis
union all select 'planes', count(*) filter (where cliente_id is null), count(*) from public.safia_planes
union all select 'ndvi', count(*) filter (where cliente_id is null), count(*) from public.safia_ndvi
order by 1;
