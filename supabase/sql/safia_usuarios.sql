-- SAFIA · perfiles de usuario (nombre y rol) — seguro de correr más de una vez
-- Cada usuario de Authentication → Users tiene una fila acá con su nombre para
-- saludarlo y su rol para los permisos que vienen después.
--   admin    : Irrigar (ve y edita todo)
--   cliente  : productor (verá solo sus campos; cliente_id = id del cliente en safia_clientes)
--   operador : encargado de campo (cargará eventos de los lotes de su cliente)
create table if not exists public.safia_usuarios (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  nombre         text,
  rol            text not null default 'cliente' check (rol in ('admin', 'cliente', 'operador')),
  cliente_id     text,
  creado_en      timestamptz default now(),
  actualizado_en timestamptz default now()
);
alter table public.safia_usuarios enable row level security;

-- ¿el usuario que consulta es admin? (security definer: no pasa por RLS, evita la recursión)
create or replace function public.safia_es_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.safia_usuarios where id = auth.uid() and rol = 'admin');
$$;
grant execute on function public.safia_es_admin() to authenticated;

-- cada uno lee su propia fila; el admin lee y edita todas
drop policy if exists "safia_usuarios_propio" on public.safia_usuarios;
create policy "safia_usuarios_propio" on public.safia_usuarios
  for select to authenticated using (id = auth.uid());
drop policy if exists "safia_usuarios_admin" on public.safia_usuarios;
create policy "safia_usuarios_admin" on public.safia_usuarios
  for all to authenticated using (public.safia_es_admin()) with check (public.safia_es_admin());

-- cuando se crea un usuario nuevo en Authentication, aparece solo acá
create or replace function public.safia_usuario_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.safia_usuarios (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists safia_usuario_nuevo on auth.users;
create trigger safia_usuario_nuevo after insert on auth.users
  for each row execute function public.safia_usuario_nuevo();

-- los usuarios que ya existen
insert into public.safia_usuarios (id, email, nombre)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- Osmar es admin (por correo)
update public.safia_usuarios set nombre = 'Osmar', rol = 'admin', actualizado_en = now()
where email = 'osmar@irrigar.com.py';

-- Para ponerle nombre y rol a otro usuario, después:
-- update public.safia_usuarios set nombre = 'Anderson Pereira', rol = 'cliente', cliente_id = '1790165999249' where email = 'correo@del.cliente';

select email, nombre, rol, cliente_id from public.safia_usuarios order by rol, nombre;
