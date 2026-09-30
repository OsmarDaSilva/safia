-- SAFIA · Asistente IA: cupo mensual de preguntas por cliente (30-sep-2026).
-- Seguro de correr más de una vez. Va DESPUÉS de safia_asistente_limite.sql (la misma pregunta, 2 veces por día).
--
-- Reglas (definidas por Osmar):
--   · Cada pivot con suscripción vigente suma 100 preguntas por mes; un pivot en PRUEBA gratis suma 30. Un lote de secano
--     con suscripción propia suma igual que un pivot.
--   · Las preguntas de todos los pivots del cliente van a una sola bolsa, compartida entre el dueño, el gerente y los operadores.
--   · Cualquier pregunta al Asistente descuenta 1, sea del tema que sea. No descuenta la pregunta repetida que se frena
--     (3ª vez en el día) ni el intento en que la IA no llegó a responder.
--   · El mes es el mes calendario con hora de Paraguay: el día 1 la bolsa se vuelve a llenar. Lo que sobra no se acumula.
--   · Irrigar puede sumar preguntas extra a un cliente para el mes en curso. Irrigar no tiene cupo.

-- 1) Cada respuesta queda anotada con el cliente (para sumar la bolsa del mes)
alter table public.safia_asistente_uso add column if not exists cliente_id text;
create index if not exists safia_asistente_uso_cliente_dia on public.safia_asistente_uso (cliente_id, dia);

-- 2) Preguntas extra del mes, por cliente (las carga Irrigar)
create table if not exists public.safia_asistente_extra (
  cliente_id      text        not null,
  mes             date        not null,   -- primer día del mes
  extra           integer     not null default 0,
  nota            text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  primary key (cliente_id, mes)
);
alter table public.safia_asistente_extra enable row level security;
drop policy if exists safia_extra_ver on public.safia_asistente_extra;
create policy safia_extra_ver on public.safia_asistente_extra for select to authenticated
  using (safia_activo() and (safia_es_admin() or cliente_id = safia_mi_cliente()));

-- 3) La bolsa de un cliente en el mes en curso (uso interno de las funciones de abajo)
create or replace function public.safia_asistente_cupo(p_cliente text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_por_lote integer := 100;   -- pivot con suscripción plena
  v_prueba   integer := 30;    -- pivot en prueba gratis
  v_mes      date := date_trunc('month', now() at time zone 'America/Asuncion')::date;
  v_lotes    integer;
  v_plenos   integer;
  v_pruebas  integer;
  v_base     integer;
  v_extra    integer;
  v_usadas   integer;
begin
  select count(*), count(*) filter (where coalesce(s.datos->>'plan', '') <> 'Prueba'), count(*) filter (where coalesce(s.datos->>'plan', '') = 'Prueba')
    into v_lotes, v_plenos, v_pruebas
    from public.safia_equipos e
    join public.safia_suscripciones s on s.id = e.id
   where e.cliente_id = p_cliente
     and (public.safia_susc_vence(s.datos) is null or public.safia_susc_vence(s.datos) >= public.safia_hoy());
  v_base := v_plenos * v_por_lote + v_pruebas * v_prueba;
  select coalesce((select x.extra from public.safia_asistente_extra x where x.cliente_id = p_cliente and x.mes = v_mes), 0) into v_extra;
  select coalesce(sum(u.veces), 0) into v_usadas from public.safia_asistente_uso u where u.cliente_id = p_cliente and u.dia >= v_mes;
  return jsonb_build_object(
    'cliente_id', p_cliente, 'lotes', v_lotes, 'lotes_plenos', v_plenos, 'lotes_prueba', v_pruebas, 'por_lote', v_por_lote, 'por_prueba', v_prueba, 'extra', v_extra,
    'cupo', v_base + v_extra, 'usadas', v_usadas,
    'quedan', greatest(v_base + v_extra - v_usadas, 0),
    'mes', to_char(v_mes, 'YYYY-MM'), 'renueva', to_char((v_mes + interval '1 month')::date, 'YYYY-MM-DD'));
end $$;
revoke all on function public.safia_asistente_cupo(text) from public, anon, authenticated;

-- 4) ¿Puede hacer esta pregunta? Primero la misma pregunta (2 por día), después la bolsa del mes.
--    (reemplaza a la versión de un solo parámetro)
drop function if exists public.safia_asistente_consultar(text);
create or replace function public.safia_asistente_consultar(p_clave text, p_repetible boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_rol     text := public.safia_mi_rol();
  v_cliente text := public.safia_mi_cliente();
  v_dia     date := (now() at time zone 'America/Asuncion')::date;
  v_lim     integer := 2;
  v_veces   integer := 0;
  v_resp    text;
  v_hora    timestamptz;
  c         jsonb;
  v_meses   text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  v_prox    text;
begin
  if auth.uid() is null or v_rol is null or v_rol in ('propietario', 'admin') then
    return jsonb_build_object('permitido', true, 'exento', true, 'limite', v_lim);
  end if;

  -- la misma pregunta, como máximo 2 veces por día
  if coalesce(p_repetible, true) then
    select u.veces, u.respuesta, u.actualizado_en into v_veces, v_resp, v_hora
      from public.safia_asistente_uso u
     where u.usuario_id = auth.uid() and u.dia = v_dia and u.clave = p_clave;
    v_veces := coalesce(v_veces, 0);
    if v_veces >= v_lim then
      return jsonb_build_object('permitido', false, 'exento', false, 'motivo', 'repetida', 'veces', v_veces, 'limite', v_lim,
        'respuesta', v_resp, 'hora', to_char(v_hora at time zone 'America/Asuncion', 'HH24:MI'));
    end if;
  end if;

  -- la bolsa del mes del cliente
  if v_cliente is not null then
    c := public.safia_asistente_cupo(v_cliente);
    if (c->>'usadas')::integer >= (c->>'cupo')::integer then
      v_prox := v_meses[extract(month from (c->>'renueva')::date)::integer];
      return jsonb_build_object('permitido', false, 'exento', false, 'motivo', 'cupo', 'limite', v_lim,
        'cupo', (c->>'cupo')::integer, 'usadas', (c->>'usadas')::integer, 'quedan', 0, 'renueva', c->>'renueva',
        'mensaje', case when (c->>'cupo')::integer = 0
          then 'El Asistente funciona con al menos un pivot con suscripción vigente. Para habilitarlo, hablá con Irrigar.'
          else 'Ya se usaron las ' || (c->>'cupo') || ' preguntas de este mes del Asistente (' || (c->>'por_lote') || ' por cada pivot con suscripción vigente' || case when (c->>'lotes_prueba')::integer > 0 then ' y ' || (c->>'por_prueba') || ' por pivot en prueba' else '' end || ', entre todos los usuarios del cliente). El 1 de ' || v_prox || ' se renuevan. Mientras tanto SAFIA sigue funcionando igual: la recomendación de riego está en la pantalla Operador. Si necesitás más preguntas este mes, hablá con Irrigar.' end);
    end if;
    return jsonb_build_object('permitido', true, 'exento', false, 'veces', v_veces, 'limite', v_lim,
      'cupo', (c->>'cupo')::integer, 'usadas', (c->>'usadas')::integer, 'quedan', (c->>'quedan')::integer, 'renueva', c->>'renueva');
  end if;
  return jsonb_build_object('permitido', true, 'exento', false, 'veces', v_veces, 'limite', v_lim);
end $$;

-- 5) Anota una respuesta dada: suma 1 a la pregunta de hoy, guarda la respuesta y a qué cliente se le descuenta
create or replace function public.safia_asistente_registrar(p_clave text, p_pregunta text, p_respuesta text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dia   date := (now() at time zone 'America/Asuncion')::date;
  v_veces integer;
begin
  if auth.uid() is null or coalesce(p_clave, '') = '' then return 0; end if;
  insert into public.safia_asistente_uso (usuario_id, dia, clave, pregunta, veces, respuesta, actualizado_en, cliente_id)
  values (auth.uid(), v_dia, p_clave, left(p_pregunta, 500), 1, left(p_respuesta, 20000), now(), public.safia_mi_cliente())
  on conflict (usuario_id, dia, clave) do update
     set veces = public.safia_asistente_uso.veces + 1,
         pregunta = excluded.pregunta,
         respuesta = excluded.respuesta,
         cliente_id = excluded.cliente_id,
         actualizado_en = now()
  returning veces into v_veces;
  -- limpieza: no se guardan más de 60 días
  delete from public.safia_asistente_uso where usuario_id = auth.uid() and dia < v_dia - 60;
  return v_veces;
end $$;

-- 6) Cómo viene la bolsa: Irrigar ve todos los clientes con lotes; los demás, solo la de su cliente
create or replace function public.safia_asistente_cupos()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_cliente text := public.safia_mi_cliente();
begin
  if not public.safia_activo() then return '[]'::jsonb; end if;
  if public.safia_es_admin() then
    return coalesce((select jsonb_agg(public.safia_asistente_cupo(k.cliente_id) order by k.cliente_id)
                       from (select distinct e.cliente_id from public.safia_equipos e where e.cliente_id is not null) k), '[]'::jsonb);
  end if;
  if v_cliente is null then return '[]'::jsonb; end if;
  return jsonb_build_array(public.safia_asistente_cupo(v_cliente));
end $$;

-- 7) Irrigar fija las preguntas extra de un cliente para el mes en curso (0 = sin extra)
create or replace function public.safia_asistente_poner_extra(p_cliente text, p_extra integer, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_mes date := date_trunc('month', now() at time zone 'America/Asuncion')::date;
begin
  if not (public.safia_activo() and public.safia_es_admin()) then raise exception 'Solo Irrigar puede sumar preguntas extra'; end if;
  if coalesce(p_cliente, '') = '' then raise exception 'Falta el cliente'; end if;
  insert into public.safia_asistente_extra (cliente_id, mes, extra, nota, actualizado_en, actualizado_por)
  values (p_cliente, v_mes, greatest(coalesce(p_extra, 0), 0), p_nota, now(), auth.uid())
  on conflict (cliente_id, mes) do update set extra = excluded.extra, nota = excluded.nota, actualizado_en = now(), actualizado_por = auth.uid();
  return public.safia_asistente_cupo(p_cliente);
end $$;

revoke all on function public.safia_asistente_consultar(text, boolean) from public, anon;
revoke all on function public.safia_asistente_registrar(text, text, text) from public, anon;
revoke all on function public.safia_asistente_cupos() from public, anon;
revoke all on function public.safia_asistente_poner_extra(text, integer, text) from public, anon;
grant execute on function public.safia_asistente_consultar(text, boolean) to authenticated;
grant execute on function public.safia_asistente_registrar(text, text, text) to authenticated;
grant execute on function public.safia_asistente_cupos() to authenticated;
grant execute on function public.safia_asistente_poner_extra(text, integer, text) to authenticated;

-- Comprobación: una fila por cliente con pivots. "pivots_plenos" tienen suscripción vigente (100 c/u), "pivots_prueba" están
-- en prueba gratis (30 c/u); "cupo_del_mes" = la suma (+ extra) y "usadas" las preguntas respondidas este mes.
select c.datos->>'nombre' as cliente,
       (k.j->>'lotes_plenos')::integer as pivots_plenos,
       (k.j->>'lotes_prueba')::integer as pivots_prueba,
       (k.j->>'cupo')::integer   as cupo_del_mes,
       (k.j->>'usadas')::integer as usadas,
       (k.j->>'quedan')::integer as quedan
from (select distinct e.cliente_id from public.safia_equipos e where e.cliente_id is not null) d
cross join lateral (select public.safia_asistente_cupo(d.cliente_id) as j) k
left join public.safia_clientes c on c.id = d.cliente_id
order by 1;
