-- ============================================================================
-- SAFIA · Asistencia técnica: pedidos con su conversación, fotos e historial
-- ----------------------------------------------------------------------------
-- Seguro de correr más de una vez. Qué hace:
--   1. Tabla safia_asistencias, con la misma forma que las demás colecciones
--      (guarda los pedidos y las notas de cada pedido).
--   2. Completa sola el cliente y la estancia de cada registro por su pivot.
--   3. Reglas: cada cliente ve y carga lo suyo (el encargado y el operador,
--      solo en sus estancias); Irrigar ve todo; solo Irrigar puede borrar.
--   4. Fotos: el operador, el encargado y el dueño pueden subir fotos a la
--      carpeta de asistencia de sus campos (antes el operador no subía archivos).
-- Requiere haber corrido antes safia_clientes_rls.sql y safia_storage_rls.sql.
-- ============================================================================

create table if not exists public.safia_asistencias (
  id text primary key,
  datos jsonb not null,
  actualizado_en timestamptz default now(),
  actualizado_por uuid default auth.uid(),
  cliente_id text,
  campo_ref text
);
create index if not exists safia_asistencias_cliente_idx on public.safia_asistencias (cliente_id);
create index if not exists safia_asistencias_campo_ref_idx on public.safia_asistencias (campo_ref);
create index if not exists safia_asistencias_pedido_idx on public.safia_asistencias ((datos->>'pedidoId'));

-- dueño de cada registro: sale del pivot (o del campo) que trae el propio registro
create or replace function public.safia_asistencias_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb; c text; k text;
begin
  d := coalesce(NEW.datos, '{}'::jsonb);
  c := coalesce(public.safia_cliente_de_equipo(d->>'equipoId'), public.safia_cliente_de_campo(d->>'campoId'));
  k := coalesce(public.safia_campo_de_equipo(d->>'equipoId'), nullif(d->>'campoId', ''));
  NEW.cliente_id := coalesce(c, NEW.cliente_id);
  NEW.campo_ref := coalesce(k, NEW.campo_ref);
  if auth.uid() is not null then NEW.actualizado_por := auth.uid(); end if;
  return NEW;
end $$;

drop trigger if exists safia_cliente_trg on public.safia_asistencias;
create trigger safia_cliente_trg before insert or update on public.safia_asistencias
  for each row execute function public.safia_asistencias_cliente();

alter table public.safia_asistencias enable row level security;
drop policy if exists safia_ver on public.safia_asistencias;
drop policy if exists safia_alta on public.safia_asistencias;
drop policy if exists safia_cambio on public.safia_asistencias;
drop policy if exists safia_baja on public.safia_asistencias;
create policy safia_ver on public.safia_asistencias for select to authenticated
  using (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_campo_ok(campo_ref))));
create policy safia_alta on public.safia_asistencias for insert to authenticated
  with check (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_campo_ok(campo_ref))));
create policy safia_cambio on public.safia_asistencias for update to authenticated
  using (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_campo_ok(campo_ref))))
  with check (safia_activo() and (safia_es_admin() or (cliente_id = safia_mi_cliente() and safia_campo_ok(campo_ref))));
create policy safia_baja on public.safia_asistencias for delete to authenticated
  using (safia_activo() and safia_es_admin());
grant select, insert, update, delete on public.safia_asistencias to authenticated;

-- fotos de asistencia: las sube cualquier usuario activo del cliente, en la carpeta de asistencia de sus campos
drop policy if exists "safia_asistencia_fotos_subir" on storage.objects;
create policy "safia_asistencia_fotos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'safia' and public.safia_activo()
    and name ~ '^campo_[0-9]+/asistencia/'
    and public.safia_cliente_de_ruta(name) = public.safia_mi_cliente());

select 'Asistencia técnica lista' as resultado,
  (select count(*) from pg_policies where tablename = 'safia_asistencias') as reglas,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname = 'safia_asistencia_fotos_subir') as regla_fotos,
  (select count(*) from public.safia_asistencias) as registros;
