-- ============================================================
-- SAFIA · Suscripción anual por pivot (29-sep-2026)
-- Cada pivot (área de riego) tiene su suscripción con fecha de vencimiento.
--   - Vigente: se carga y se analiza todo, como siempre.
--   - Vencida: el cliente VE lo que ya tenía, pero la base no acepta nada NUEVO en ese pivot
--     (campañas, riegos, lluvias, análisis de suelo/agua/foliar, metas, satélite, mapas, estación).
--   - Lote de secano: sin costo mientras el campo tenga al menos un pivot vigente.
--   - Solo Irrigar (propietario/admin) crea o cambia suscripciones.
--   - Vence = fecha (AAAA-MM-DD). Sin fecha = vigente hasta que Irrigar cargue la fecha.
-- Seguro de correr más de una vez.
-- ============================================================

-- 1) Tabla (mismo formato que las demás de SAFIA: id + datos, para que la sincronización la baje sola)
create table if not exists public.safia_suscripciones (
  id text primary key,                -- = id del pivot (equipo)
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz default now(),
  actualizado_por uuid,
  cliente_id text,
  campo_ref text
);
alter table public.safia_suscripciones enable row level security;

-- cliente y campo salen del pivot (para que cada cliente vea solo las suyas)
create or replace function public.safia_susc_asignar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  NEW.cliente_id := public.safia_cliente_de_equipo(coalesce(nullif(NEW.datos->>'equipoId', ''), NEW.id));
  NEW.campo_ref  := public.safia_campo_de_equipo(coalesce(nullif(NEW.datos->>'equipoId', ''), NEW.id));
  if auth.uid() is not null then NEW.actualizado_por := auth.uid(); end if;
  return NEW;
end $$;
drop trigger if exists safia_cliente_trg on public.safia_suscripciones;
create trigger safia_cliente_trg before insert or update on public.safia_suscripciones
  for each row execute function public.safia_susc_asignar();

drop policy if exists safia_ver on public.safia_suscripciones;
create policy safia_ver on public.safia_suscripciones for select
  using (public.safia_activo() and (public.safia_es_admin() or (cliente_id = public.safia_mi_cliente() and public.safia_campo_ok(campo_ref))));
drop policy if exists safia_escribir on public.safia_suscripciones;
create policy safia_escribir on public.safia_suscripciones for all
  using (public.safia_activo() and public.safia_es_admin())
  with check (public.safia_activo() and public.safia_es_admin());

-- 2) ¿Está vigente?
create or replace function public.safia_hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Asuncion')::date $$;

create or replace function public.safia_susc_vence(d jsonb) returns date
language sql immutable as $$
  select case when coalesce(d->>'vence', '') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'vence')::date end
$$;

-- un campo está habilitado si tiene al menos un pivot con suscripción vigente
create or replace function public.safia_campo_vigente(p_campo text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_campo, '') = '' or exists (
    select 1 from public.safia_equipos e join public.safia_suscripciones s on s.id = e.id
    where e.datos->>'campoId' = p_campo and coalesce(e.datos->>'tipo', '') <> 'secano'
      and (public.safia_susc_vence(s.datos) is null or public.safia_susc_vence(s.datos) >= public.safia_hoy()));
$$;

-- un pivot está habilitado si su suscripción está vigente; un lote de secano, si su campo tiene un pivot vigente
create or replace function public.safia_equipo_vigente(p_equipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_equipo, '') = '' then true
    when not exists (select 1 from public.safia_equipos where id = p_equipo) then true
    when (select datos->>'tipo' from public.safia_equipos where id = p_equipo) = 'secano'
      then public.safia_campo_vigente((select datos->>'campoId' from public.safia_equipos where id = p_equipo))
    else exists (select 1 from public.safia_suscripciones s where s.id = p_equipo
                 and (public.safia_susc_vence(s.datos) is null or public.safia_susc_vence(s.datos) >= public.safia_hoy()))
  end;
$$;

-- ¿el usuario tiene al menos un pivot vigente? (lo usan el Asistente y la lectura con IA antes de gastar)
create or replace function public.safia_tengo_vigente() returns boolean
language sql stable security definer set search_path = public as $$
  select public.safia_es_admin() or exists (
    select 1 from public.safia_equipos e
    where e.cliente_id = public.safia_mi_cliente() and public.safia_campo_ok(e.campo_ref)
      and coalesce(e.datos->>'tipo', '') <> 'secano' and public.safia_equipo_vigente(e.id));
$$;
grant execute on function public.safia_tengo_vigente() to authenticated;

-- 3) Guardia: nada NUEVO en un pivot vencido (Irrigar sí puede, para corregir)
create or replace function public.safia_susc_guardia() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d jsonb; eq text; ca text; ok boolean;
begin
  if public.safia_es_admin() then return NEW; end if;
  j := to_jsonb(NEW);
  -- volver a guardar lo mismo no es "nuevo"
  if TG_OP = 'UPDATE' and (j - 'actualizado_en' - 'actualizado_por') = (to_jsonb(OLD) - 'actualizado_en' - 'actualizado_por') then return NEW; end if;
  d := case when j ? 'datos' then coalesce(j->'datos', '{}'::jsonb) else '{}'::jsonb end;
  eq := coalesce(nullif(d->>'equipoId', ''), nullif(j->>'equipo_id', ''));
  if eq is null and nullif(d->>'campanaId', '') is not null then
    select c.datos->>'equipoId' into eq from public.safia_campanas c where c.id = d->>'campanaId';
  end if;
  if eq is not null then
    ok := public.safia_equipo_vigente(eq);
  else
    ca := coalesce(nullif(d->>'campoId', ''), nullif(j->>'campo_id', ''), nullif(j->>'campo_ref', ''));
    ok := public.safia_campo_vigente(ca);
  end if;
  if not ok then
    raise exception 'SAFIA_SUSCRIPCION_VENCIDA: %', coalesce(eq, ca) using errcode = '42501',
      hint = 'La suscripción de este pivot está vencida: renovar con Irrigar.';
  end if;
  return NEW;
end $$;

do $$
declare t text;
begin
  foreach t in array array['safia_analisis', 'safia_analisis_agua', 'safia_archivos', 'safia_campanas', 'safia_ciclos',
                           'safia_clima_estacion', 'safia_eventos', 'safia_foliar', 'safia_geo_capas', 'safia_ndvi', 'safia_planes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists safia_susc_trg on public.%I', t);
      -- el nombre va después de safia_cliente_trg: corre cuando ya se sabe el campo
      execute format('create trigger safia_susc_trg before insert or update on public.%I for each row execute function public.safia_susc_guardia()', t);
    end if;
  end loop;
end $$;

-- 4) Los pivots que ya existen arrancan VIGENTES, sin fecha, hasta que Irrigar cargue su vencimiento real
insert into public.safia_suscripciones (id, datos)
select e.id, jsonb_build_object('id', e.id, 'equipoId', e.id, 'vence', null, 'plan', 'Anual',
       'notas', 'Vigente sin fecha: cargar el vencimiento real', 'creado', to_char(public.safia_hoy(), 'YYYY-MM-DD'))
from public.safia_equipos e
where coalesce(e.datos->>'tipo', '') <> 'secano'
on conflict (id) do nothing;

-- Qué deberías ver: la lista de pivots con su suscripción
select coalesce(cl.datos->>'nombre', s.cliente_id) as cliente, e.datos->>'nombre' as pivot,
       coalesce(s.datos->>'vence', 'sin fecha (vigente)') as vence, public.safia_equipo_vigente(s.id) as vigente
from public.safia_suscripciones s
join public.safia_equipos e on e.id = s.id
left join public.safia_clientes cl on cl.id = s.cliente_id
order by 1, 2;
