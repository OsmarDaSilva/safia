-- ============================================================================
-- SAFIA · Rol "técnico de Irrigar" (pedido de Osmar, 5-oct-2026)
-- Seguro de correr más de una vez.
--   · Nuevo rol 'tecnico': entra solo a Asistencia técnica. Ve los pedidos de todos los clientes, los toma,
--     escribe, sube fotos y la orden de servicio, y los cierra. No borra pedidos ni ve el resto de SAFIA.
--   · Para mostrar cliente, estancia y pivot de cada pedido, ve (sin poder cambiar) clientes, estancias y pivots.
--   · La oficina (propietario y administradores) sigue con todo y es la que asigna qué técnico va a cada pedido.
-- ============================================================================

-- 1. el rol nuevo
alter table public.safia_usuarios drop constraint if exists safia_usuarios_rol_check;
alter table public.safia_usuarios add constraint safia_usuarios_rol_check
  check (rol = any (array['propietario', 'admin', 'cliente', 'encargado', 'operador', 'tecnico']));

-- el técnico atiende a todos los clientes: nunca queda atado a uno (si tuviera cliente, vería también los datos de ese cliente)
update public.safia_usuarios set cliente_id = null, campos = null where rol = 'tecnico' and cliente_id is not null;
alter table public.safia_usuarios drop constraint if exists safia_usuarios_tecnico_sin_cliente;
alter table public.safia_usuarios add constraint safia_usuarios_tecnico_sin_cliente check (rol <> 'tecnico' or cliente_id is null);

create or replace function public.safia_es_tecnico()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.safia_usuarios where id = auth.uid() and rol = 'tecnico' and estado = 'activo');
$$;

-- 2. pedidos de asistencia: el técnico ve, carga y cambia (no borra)
drop policy if exists safia_tecnico_ver on public.safia_asistencias;
drop policy if exists safia_tecnico_alta on public.safia_asistencias;
drop policy if exists safia_tecnico_cambio on public.safia_asistencias;
create policy safia_tecnico_ver on public.safia_asistencias for select to authenticated using (public.safia_es_tecnico());
create policy safia_tecnico_alta on public.safia_asistencias for insert to authenticated with check (public.safia_es_tecnico());
create policy safia_tecnico_cambio on public.safia_asistencias for update to authenticated using (public.safia_es_tecnico()) with check (public.safia_es_tecnico());

-- 3. clientes, estancias y pivots: el técnico solo los ve
drop policy if exists safia_tecnico_ver on public.safia_clientes;
drop policy if exists safia_tecnico_ver on public.safia_campos;
drop policy if exists safia_tecnico_ver on public.safia_equipos;
create policy safia_tecnico_ver on public.safia_clientes for select to authenticated using (public.safia_es_tecnico());
create policy safia_tecnico_ver on public.safia_campos for select to authenticated using (public.safia_es_tecnico());
create policy safia_tecnico_ver on public.safia_equipos for select to authenticated using (public.safia_es_tecnico());

-- 4. fotos, videos y órdenes de servicio de los pedidos: el técnico las sube y las ve (solo la carpeta de asistencia)
drop policy if exists safia_asistencia_fotos_tecnico_subir on storage.objects;
drop policy if exists safia_asistencia_fotos_tecnico_ver on storage.objects;
create policy safia_asistencia_fotos_tecnico_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'safia' and public.safia_es_tecnico() and name ~ '^campo_[0-9]+/asistencia/');
create policy safia_asistencia_fotos_tecnico_ver on storage.objects for select to authenticated
  using (bucket_id = 'safia' and public.safia_es_tecnico() and name ~ '^campo_[0-9]+/asistencia/');

select 'Rol técnico listo' as resultado,
  (select count(*) from pg_policies where policyname like 'safia_tecnico_ver' or policyname like 'safia_tecnico_alta' or policyname like 'safia_tecnico_cambio') as reglas_tablas,
  (select count(*) from pg_policies where policyname like 'safia_asistencia_fotos_tecnico%') as reglas_fotos,
  (select count(*) from public.safia_usuarios where rol = 'tecnico') as tecnicos;
