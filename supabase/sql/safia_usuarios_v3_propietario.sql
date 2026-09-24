-- SAFIA · rol PROPIETARIO (super usuario) — seguro de correr más de una vez
-- propietario: Osmar (dueño). Sin límites: ve y edita todo, y es el único que puede nombrar
--              administradores y otros propietarios, o tocar la cuenta de un propietario.
-- admin:       funcionarios de Irrigar (soporte): administran usuarios y clientes, ven todo,
--              pero no pueden modificar a un propietario ni crear admins/propietarios.
-- cliente / operador: igual que antes.
alter table public.safia_usuarios drop constraint if exists safia_usuarios_rol_check;
alter table public.safia_usuarios add constraint safia_usuarios_rol_check check (rol in ('propietario', 'admin', 'cliente', 'operador'));

create or replace function public.safia_es_propietario() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.safia_usuarios where id = auth.uid() and rol = 'propietario' and estado = 'activo');
$$;
grant execute on function public.safia_es_propietario() to authenticated;

-- "admin" a efectos de permisos = admin o propietario
create or replace function public.safia_es_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.safia_usuarios where id = auth.uid() and rol in ('admin', 'propietario') and estado = 'activo');
$$;

-- un admin común no puede tocar la fila de un propietario ni volver propietario/admin a nadie: eso solo el propietario
drop policy if exists "safia_usuarios_admin" on public.safia_usuarios;
create policy "safia_usuarios_admin" on public.safia_usuarios
  for all to authenticated
  using (public.safia_es_propietario() or (public.safia_es_admin() and rol not in ('propietario')))
  with check (public.safia_es_propietario() or (public.safia_es_admin() and rol not in ('propietario', 'admin')));

-- Osmar es el propietario
update public.safia_usuarios set rol = 'propietario', estado = 'activo', nombre = coalesce(nombre, 'Osmar'), actualizado_en = now()
where email = 'osmar@irrigar.com.py';

select email, nombre, rol, estado, cliente_id from public.safia_usuarios order by rol, nombre;
