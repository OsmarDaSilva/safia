-- SAFIA · usuarios: registro desde la app, aprobación, alta/baja y rol — seguro de correr más de una vez
-- Flujo: la persona crea su cuenta en login.html (o entra con la cuenta que ya tiene de SIGA/AGROinvest);
-- queda "pendiente"; Irrigar la aprueba desde Sistema → Usuarios, le pone rol y cliente, y puede darla de
-- baja o reactivarla. Irrigar también puede crear el acceso de un cliente directo desde la app (con
-- contraseña temporal) sin tocar el panel de Supabase.
--   rol:    admin (Irrigar, ve y edita todo) · cliente (productor) · operador (encargado de campo)
--   estado: pendiente (esperando aprobación) · activo · baja
create table if not exists public.safia_usuarios (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  nombre         text,
  rol            text not null default 'cliente' check (rol in ('admin', 'cliente', 'operador')),
  cliente_id     text,
  creado_en      timestamptz default now(),
  actualizado_en timestamptz default now()
);
alter table public.safia_usuarios add column if not exists estado text not null default 'pendiente';
alter table public.safia_usuarios add column if not exists solicitud text;      -- lo que escribió al registrarse (establecimiento, cliente)
alter table public.safia_usuarios add column if not exists telefono text;
alter table public.safia_usuarios add column if not exists aprobado_en timestamptz;
alter table public.safia_usuarios drop constraint if exists safia_usuarios_estado_check;
alter table public.safia_usuarios add constraint safia_usuarios_estado_check check (estado in ('pendiente', 'activo', 'baja'));
alter table public.safia_usuarios enable row level security;

-- ¿el que consulta es admin? / ¿está activo? (security definer: no pasan por RLS, evitan la recursión)
create or replace function public.safia_es_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.safia_usuarios where id = auth.uid() and rol = 'admin' and estado = 'activo');
$$;
create or replace function public.safia_activo() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.safia_usuarios where id = auth.uid() and estado = 'activo');
$$;
grant execute on function public.safia_es_admin() to authenticated;
grant execute on function public.safia_activo() to authenticated;

-- políticas de la tabla de usuarios: cada uno ve su fila y puede crearla (queda pendiente); el admin todo
drop policy if exists "safia_usuarios_propio" on public.safia_usuarios;
create policy "safia_usuarios_propio" on public.safia_usuarios
  for select to authenticated using (id = auth.uid());
drop policy if exists "safia_usuarios_alta_propia" on public.safia_usuarios;
create policy "safia_usuarios_alta_propia" on public.safia_usuarios
  for insert to authenticated with check (id = auth.uid() and estado = 'pendiente' and rol <> 'admin');
drop policy if exists "safia_usuarios_admin" on public.safia_usuarios;
create policy "safia_usuarios_admin" on public.safia_usuarios
  for all to authenticated using (public.safia_es_admin()) with check (public.safia_es_admin());

-- al crear una cuenta desde SAFIA (login.html manda app = 'safia'), aparece pendiente
create or replace function public.safia_usuario_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') = 'safia' then
    insert into public.safia_usuarios (id, email, nombre, estado, solicitud, telefono)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)), 'pendiente',
            new.raw_user_meta_data ->> 'solicitud', new.raw_user_meta_data ->> 'telefono')
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists safia_usuario_nuevo on auth.users;
create trigger safia_usuario_nuevo after insert on auth.users
  for each row execute function public.safia_usuario_nuevo();

-- Osmar: admin activo (esto tiene que quedar ANTES de restringir las demás tablas)
insert into public.safia_usuarios (id, email, nombre, rol, estado)
select id, email, 'Osmar', 'admin', 'activo' from auth.users where email = 'osmar@irrigar.com.py'
on conflict (id) do update set nombre = 'Osmar', rol = 'admin', estado = 'activo', actualizado_en = now();

-- Las demás tablas de SAFIA: solo usuarios ACTIVOS (antes: cualquier autenticado).
-- Un usuario pendiente o dado de baja no puede leer ni escribir datos aunque tenga cuenta.
do $$
declare t text;
begin
  foreach t in array array['safia_clientes','safia_campos','safia_equipos','safia_cultivos','safia_campanas','safia_eventos','safia_ciclos','safia_analisis','safia_planes','safia_foliar','safia_clima_estacion','safia_archivos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "safia_autenticados" on public.%I', t);
      execute format('drop policy if exists "safia_activos" on public.%I', t);
      execute format('create policy "safia_activos" on public.%I for all to authenticated using (public.safia_activo()) with check (public.safia_activo())', t);
    end if;
  end loop;
end $$;
drop policy if exists "safia_geo_capas_auth" on public.safia_geo_capas;
drop policy if exists "safia_activos" on public.safia_geo_capas;
create policy "safia_activos" on public.safia_geo_capas for all to authenticated using (public.safia_activo()) with check (public.safia_activo());
drop policy if exists "safia_geo_puntos_auth" on public.safia_geo_puntos;
drop policy if exists "safia_activos" on public.safia_geo_puntos;
create policy "safia_activos" on public.safia_geo_puntos for all to authenticated using (public.safia_activo()) with check (public.safia_activo());
drop policy if exists "safia_ndvi_leer" on public.safia_ndvi;
drop policy if exists "safia_ndvi_escribir" on public.safia_ndvi;
drop policy if exists "safia_ndvi_borrar" on public.safia_ndvi;
drop policy if exists "safia_activos" on public.safia_ndvi;
create policy "safia_activos" on public.safia_ndvi for all to authenticated using (public.safia_activo()) with check (public.safia_activo());

select email, nombre, rol, estado, cliente_id from public.safia_usuarios order by estado, rol, nombre;
