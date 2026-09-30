-- SAFIA · Roles (30-sep-2026). Seguro de correr más de una vez.
--
--   Irrigar (propietario / admin)  : todo. SOLO Irrigar carga, cambia o borra pivots y lotes.
--   Cliente (dueño del campo)      : opera el sistema: campañas, análisis de suelo, agua y foliar, metas,
--                                    plan de rotación, mapas, archivos. No carga pivots.
--   Encargado (gerente del campo)  : lo mismo que el dueño, pero solo en las estancias que tiene asignadas.
--   Operador                       : riego, eventos y campañas (sin cambios en este bloque).
--
-- La suscripción de cada pivot se sigue respetando: la controlan aparte los guardias safia_susc_*.

-- 1) Lo que opera el dueño, ahora también el gerente (encargado) en sus estancias
do $$
declare
  t text;
  cond text := 'safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() '
            || 'and safia_mi_rol() in (''cliente'', ''encargado'') and safia_campo_ok(campo_ref)))';
begin
  foreach t in array array['safia_analisis', 'safia_analisis_agua', 'safia_foliar', 'safia_planes',
                           'safia_archivos', 'safia_geo_capas', 'safia_geo_puntos', 'safia_ndvi'] loop
    execute format('drop policy if exists safia_alta on public.%I', t);
    execute format('create policy safia_alta on public.%I for insert to authenticated with check (%s)', t, cond);
    execute format('drop policy if exists safia_cambio on public.%I', t);
    execute format('create policy safia_cambio on public.%I for update to authenticated using (%s) with check (%s)', t, cond, cond);
    execute format('drop policy if exists safia_baja on public.%I', t);
    execute format('create policy safia_baja on public.%I for delete to authenticated using (%s)', t, cond);
  end loop;

  -- Campañas: borrar, también el gerente (crear y cambiar ya lo tenían dueño, gerente y operador)
  execute 'drop policy if exists safia_baja on public.safia_campanas';
  execute format('create policy safia_baja on public.safia_campanas for delete to authenticated using (%s)', cond);

  -- Campos: el gerente puede corregir datos de sus estancias (altitud, localidad); crear y borrar, no
  execute 'drop policy if exists safia_cambio on public.safia_campos';
  execute format('create policy safia_cambio on public.safia_campos for update to authenticated using (%s) with check (%s)', cond, cond);
end $$;

-- 2) Pivots y lotes (equipos): solo Irrigar
drop policy if exists safia_alta on public.safia_equipos;
create policy safia_alta on public.safia_equipos for insert to authenticated
  with check (safia_activo() and safia_es_admin());
drop policy if exists safia_cambio on public.safia_equipos;
create policy safia_cambio on public.safia_equipos for update to authenticated
  using (safia_activo() and safia_es_admin())
  with check (safia_activo() and safia_es_admin());
drop policy if exists safia_baja on public.safia_equipos;
create policy safia_baja on public.safia_equipos for delete to authenticated
  using (safia_activo() and safia_es_admin());

-- 3) Archivos (PDF de análisis, informes): el gerente también sube, en sus estancias
drop policy if exists safia_archivos_subir on storage.objects;
create policy safia_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'safia' and safia_activo() and (safia_es_admin() or (
    safia_mi_rol() in ('cliente', 'encargado') and name not like 'config/%'
    and safia_cliente_de_ruta(name) = safia_mi_cliente() and safia_campo_ok(safia_campo_de_ruta(name)))));
drop policy if exists safia_archivos_cambiar on storage.objects;
create policy safia_archivos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'safia' and safia_activo() and (safia_es_admin() or (
    safia_mi_rol() in ('cliente', 'encargado') and name not like 'config/%'
    and safia_cliente_de_ruta(name) = safia_mi_cliente() and safia_campo_ok(safia_campo_de_ruta(name)))))
  with check (bucket_id = 'safia' and safia_activo() and (safia_es_admin() or (
    safia_mi_rol() in ('cliente', 'encargado') and name not like 'config/%'
    and safia_cliente_de_ruta(name) = safia_mi_cliente() and safia_campo_ok(safia_campo_de_ruta(name)))));
drop policy if exists safia_archivos_borrar on storage.objects;
create policy safia_archivos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'safia' and safia_activo() and (safia_es_admin() or (
    safia_mi_rol() in ('cliente', 'encargado') and name not like 'config/%'
    and safia_cliente_de_ruta(name) = safia_mi_cliente() and safia_campo_ok(safia_campo_de_ruta(name)))));

-- Comprobación: una fila por tabla. Tiene que mostrar:
--   safia_equipos                      -> gerente_escribe = false, dueno_escribe = false  (solo Irrigar)
--   safia_campos                       -> gerente_escribe = true (solo cambiar)
--   todas las demás                    -> gerente_escribe = true, dueno_escribe = true
select tablename as tabla,
       bool_or(coalesce(with_check, qual) like '%encargado%') as gerente_escribe,
       bool_or(coalesce(with_check, qual) like '%cliente''%')  as dueno_escribe,
       count(*) as reglas_de_escritura
from pg_policies
where schemaname = 'public' and cmd <> 'SELECT'
  and tablename in ('safia_analisis', 'safia_analisis_agua', 'safia_foliar', 'safia_planes', 'safia_archivos',
                    'safia_geo_capas', 'safia_geo_puntos', 'safia_ndvi', 'safia_campanas', 'safia_campos', 'safia_equipos')
group by tablename
order by tablename;
