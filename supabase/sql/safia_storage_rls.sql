-- ============================================================================
-- SAFIA · Candado del depósito de archivos (bucket "safia")
-- ----------------------------------------------------------------------------
-- Seguro de correr más de una vez. Reemplaza la regla vieja (cualquier usuario
-- autenticado veía y borraba todo) por:
--   - propietario y admin: todo
--   - cliente y su operador: ven solo los archivos de sus campos
--     (rutas campo_<id>/... e informes/campo_<id>/...)
--   - cliente: sube y borra en sus campos; el operador no toca archivos
--   - config/... (plantilla del informe): la leen todos los activos, la escribe Irrigar
-- Requiere haber corrido antes safia_clientes_rls.sql (usa safia_cliente_de_campo,
-- safia_mi_cliente, safia_mi_rol, safia_activo, safia_es_admin).
-- ============================================================================

-- dueño de un archivo por su ruta
create or replace function public.safia_cliente_de_ruta(p_ruta text) returns text
language sql stable security definer set search_path = public as $$
  select public.safia_cliente_de_campo((regexp_match(coalesce(p_ruta, ''), '(?:^|/)campo_([0-9]+)/'))[1]);
$$;
grant execute on function public.safia_cliente_de_ruta(text) to authenticated;

drop policy if exists "safia_storage_autenticados" on storage.objects;
drop policy if exists "safia_archivos_ver" on storage.objects;
drop policy if exists "safia_archivos_subir" on storage.objects;
drop policy if exists "safia_archivos_cambiar" on storage.objects;
drop policy if exists "safia_archivos_borrar" on storage.objects;

create policy "safia_archivos_ver" on storage.objects for select to authenticated
  using (bucket_id = 'safia' and public.safia_activo() and (
    public.safia_es_admin()
    or name like 'config/%'
    or public.safia_cliente_de_ruta(name) = public.safia_mi_cliente()));

create policy "safia_archivos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'safia' and public.safia_activo() and (
    public.safia_es_admin()
    or (public.safia_mi_rol() = 'cliente' and name not like 'config/%' and public.safia_cliente_de_ruta(name) = public.safia_mi_cliente())));

create policy "safia_archivos_cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'safia' and public.safia_activo() and (
    public.safia_es_admin()
    or (public.safia_mi_rol() = 'cliente' and name not like 'config/%' and public.safia_cliente_de_ruta(name) = public.safia_mi_cliente())))
  with check (bucket_id = 'safia' and public.safia_activo() and (
    public.safia_es_admin()
    or (public.safia_mi_rol() = 'cliente' and name not like 'config/%' and public.safia_cliente_de_ruta(name) = public.safia_mi_cliente())));

create policy "safia_archivos_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'safia' and public.safia_activo() and (
    public.safia_es_admin()
    or (public.safia_mi_rol() = 'cliente' and name not like 'config/%' and public.safia_cliente_de_ruta(name) = public.safia_mi_cliente())));

-- control: cada archivo con su dueño (ninguno debería quedar sin dueño salvo config/)
select name, public.safia_cliente_de_ruta(name) as cliente_id
from storage.objects where bucket_id = 'safia' order by name;
