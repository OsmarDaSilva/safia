-- ============================================================================
-- SAFIA · Encargados y estancias asignadas (candado por campo, además del de cliente)
-- ----------------------------------------------------------------------------
-- Seguro de correr más de una vez. Qué hace:
--   1. Nuevo rol "encargado" (supervisa una o varias estancias del cliente).
--   2. Cada usuario puede tener una lista de estancias (campos). Si un operador o
--      encargado tiene estancias asignadas, ve y carga SOLO esas; si no tiene
--      ninguna asignada, ve todas las de su cliente (como hasta ahora).
--      El cliente (dueño), el propietario y los administradores no cambian.
--   3. Cada tabla de datos lleva campo_ref (la estancia del registro), completado
--      solo por el mismo trigger que ya completa cliente_id.
--   4. Las reglas de lectura y escritura suman la condición de estancia.
--      Encargado y operador escriben lo mismo: eventos, ciclos y clima de estación.
--   5. Archivos del depósito: el operador o encargado ve solo los de sus estancias.
-- ============================================================================

-- 1) rol encargado + estancias asignadas ---------------------------------------
alter table public.safia_usuarios add column if not exists campos text[];
alter table public.safia_usuarios drop constraint if exists safia_usuarios_rol_check;
alter table public.safia_usuarios add constraint safia_usuarios_rol_check
  check (rol in ('propietario', 'admin', 'cliente', 'encargado', 'operador'));

-- 2) mis estancias y "¿puedo ver esta estancia?" -------------------------------
create or replace function public.safia_mis_campos() returns text[]
language sql stable security definer set search_path = public as $$
  select campos from public.safia_usuarios where id = auth.uid() and estado = 'activo';
$$;
create or replace function public.safia_campo_ok(p_campo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.safia_es_admin() then true
    when public.safia_mi_rol() in ('operador', 'encargado') and coalesce(cardinality(public.safia_mis_campos()), 0) > 0
      then p_campo is null or p_campo = any(public.safia_mis_campos())
    else true
  end;
$$;
grant execute on function public.safia_mis_campos() to authenticated;
grant execute on function public.safia_campo_ok(text) to authenticated;

-- 3) columna campo_ref en todas las tablas que tienen el trigger ---------------
do $$
declare t text;
begin
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_campanas','safia_eventos','safia_ciclos',
                           'safia_analisis','safia_planes','safia_foliar','safia_clima_estacion','safia_cultivos','safia_precios',
                           'safia_archivos','safia_geo_capas','safia_geo_puntos','safia_ndvi'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists campo_ref text', t);
    execute format('create index if not exists %I on public.%I (campo_ref)', t || '_campo_ref_idx', t);
  end loop;
end $$;

create or replace function public.safia_campo_de_equipo(p_equipo text) returns text
language sql stable security definer set search_path = public as $$
  select nullif(e.datos->>'campoId', '') from public.safia_equipos e where e.id = p_equipo;
$$;
create or replace function public.safia_campo_de_campana(p_campana text) returns text
language sql stable security definer set search_path = public as $$
  select public.safia_campo_de_equipo(c.datos->>'equipoId') from public.safia_campanas c where c.id = p_campana;
$$;
create or replace function public.safia_campo_de_ruta(p_ruta text) returns text
language sql immutable as $$
  select (regexp_match(coalesce(p_ruta, ''), '(?:^|/)campo_([0-9]+)/'))[1];
$$;
grant execute on function public.safia_campo_de_ruta(text) to authenticated;

-- 4) el trigger de dueño ahora completa también la estancia --------------------
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
  -- estancia
  if TG_TABLE_NAME = 'safia_campos' then
    k := NEW.id::text;
  elsif TG_TABLE_NAME = 'safia_equipos' then
    k := nullif(d->>'campoId', '');
  elsif TG_TABLE_NAME in ('safia_campanas', 'safia_eventos') then
    k := public.safia_campo_de_equipo(d->>'equipoId');
    if k is null and (d->>'campanaId') is not null then k := public.safia_campo_de_campana(d->>'campanaId'); end if;
  elsif TG_TABLE_NAME in ('safia_ciclos', 'safia_analisis', 'safia_planes', 'safia_foliar', 'safia_clima_estacion') then
    k := coalesce(nullif(d->>'campoId', ''), public.safia_campo_de_equipo(d->>'equipoId'));
  elsif TG_TABLE_NAME in ('safia_archivos', 'safia_geo_capas', 'safia_ndvi') then
    k := coalesce(nullif(j->>'campo_id', ''), public.safia_campo_de_equipo(j->>'equipo_id'));
  elsif TG_TABLE_NAME = 'safia_geo_puntos' then
    select g.campo_ref into k from public.safia_geo_capas g where g.id::text = j->>'capa_id';
  end if;
  NEW.campo_ref := k;
  if j ? 'actualizado_por' and auth.uid() is not null then NEW.actualizado_por := auth.uid(); end if;
  return NEW;
end $$;

-- 5) reglas: cliente + estancia -----------------------------------------------
do $$
declare t text; escritura text;
begin
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_campanas','safia_eventos','safia_ciclos',
                           'safia_analisis','safia_planes','safia_foliar','safia_clima_estacion',
                           'safia_archivos','safia_geo_capas','safia_geo_puntos','safia_ndvi'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "safia_ver" on public.%I', t);
    execute format('drop policy if exists "safia_alta" on public.%I', t);
    execute format('drop policy if exists "safia_cambio" on public.%I', t);
    execute format('drop policy if exists "safia_baja" on public.%I', t);
    if t in ('safia_eventos', 'safia_ciclos', 'safia_clima_estacion') then
      escritura := 'public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() in (''cliente'', ''encargado'', ''operador'') and public.safia_campo_ok(campo_ref)))';
    else
      escritura := 'public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_mi_rol() = ''cliente''))';
    end if;
    execute format('create policy "safia_ver" on public.%I for select to authenticated using (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_campo_ok(campo_ref))))', t);
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

-- 6) archivos del depósito: además del cliente, la estancia ----------------------
drop policy if exists "safia_archivos_ver" on storage.objects;
create policy "safia_archivos_ver" on storage.objects for select to authenticated
  using (bucket_id = 'safia' and public.safia_activo() and (
    public.safia_es_admin()
    or name like 'config/%'
    or (public.safia_cliente_de_ruta(name) = public.safia_mi_cliente() and public.safia_campo_ok(public.safia_campo_de_ruta(name)))));

-- 7) completar la estancia en lo que ya existe ------------------------------------
select public.safia_recalcular_clientes();

-- 8) control: registros sin estancia (clientes, cultivos y precios no llevan; el resto debería dar 0)
select 'campos' t, count(*) filter (where campo_ref is null) sin_estancia, count(*) total from public.safia_campos
union all select 'equipos', count(*) filter (where campo_ref is null), count(*) from public.safia_equipos
union all select 'campanas', count(*) filter (where campo_ref is null), count(*) from public.safia_campanas
union all select 'eventos', count(*) filter (where campo_ref is null), count(*) from public.safia_eventos
union all select 'analisis', count(*) filter (where campo_ref is null), count(*) from public.safia_analisis
union all select 'ciclos', count(*) filter (where campo_ref is null), count(*) from public.safia_ciclos
order by 1;
