-- SAFIA · Asistente IA: la misma pregunta, como máximo 2 veces por día (30-sep-2026).
-- Seguro de correr más de una vez.
--
-- Vale para el operador, el encargado (gerente) y el dueño del campo (rol cliente). Irrigar no tiene límite.
-- El día se cuenta con la hora de Paraguay. Se cuenta cada respuesta que el Asistente terminó de dar;
-- a la tercera vez ya no se consulta a la IA: se le muestra la respuesta que recibió ese día.
-- La función safia-asistente (v8) es la que pregunta acá antes de gastar.

create table if not exists public.safia_asistente_uso (
  usuario_id     uuid        not null,
  dia            date        not null,
  clave          text        not null,   -- huella de la pregunta (sin acentos, signos ni palabras de relleno)
  pregunta       text,
  veces          integer     not null default 0,
  respuesta      text,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, dia, clave)
);
alter table public.safia_asistente_uso enable row level security;

-- Se escribe solo por las funciones de abajo. Ver: cada uno lo suyo; Irrigar, todo (para saber cuánto se usa).
drop policy if exists safia_uso_ver on public.safia_asistente_uso;
create policy safia_uso_ver on public.safia_asistente_uso for select to authenticated
  using (safia_activo() and (safia_es_admin() or usuario_id = auth.uid()));

-- ¿Puede hacer esta pregunta hoy? Devuelve cuántas veces la hizo y la última respuesta del día.
create or replace function public.safia_asistente_consultar(p_clave text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_rol  text := public.safia_mi_rol();
  v_dia  date := (now() at time zone 'America/Asuncion')::date;
  v_lim  integer := 2;
  r      record;
begin
  if auth.uid() is null or v_rol is null or v_rol in ('propietario', 'admin') then
    return jsonb_build_object('permitido', true, 'exento', true, 'limite', v_lim);
  end if;
  select u.veces, u.respuesta, u.actualizado_en into r
    from public.safia_asistente_uso u
   where u.usuario_id = auth.uid() and u.dia = v_dia and u.clave = p_clave;
  return jsonb_build_object(
    'permitido', coalesce(r.veces, 0) < v_lim,
    'exento', false,
    'veces', coalesce(r.veces, 0),
    'limite', v_lim,
    'respuesta', r.respuesta,
    'hora', to_char(r.actualizado_en at time zone 'America/Asuncion', 'HH24:MI'));
end $$;

-- Anota una respuesta dada (suma 1 a la pregunta de hoy y guarda la respuesta). Devuelve cuántas van.
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
  insert into public.safia_asistente_uso (usuario_id, dia, clave, pregunta, veces, respuesta, actualizado_en)
  values (auth.uid(), v_dia, p_clave, left(p_pregunta, 500), 1, left(p_respuesta, 20000), now())
  on conflict (usuario_id, dia, clave) do update
     set veces = public.safia_asistente_uso.veces + 1,
         pregunta = excluded.pregunta,
         respuesta = excluded.respuesta,
         actualizado_en = now()
  returning veces into v_veces;
  -- limpieza: no se guardan más de 60 días
  delete from public.safia_asistente_uso where usuario_id = auth.uid() and dia < v_dia - 60;
  return v_veces;
end $$;

revoke all on function public.safia_asistente_consultar(text) from public, anon;
revoke all on function public.safia_asistente_registrar(text, text, text) from public, anon;
grant execute on function public.safia_asistente_consultar(text) to authenticated;
grant execute on function public.safia_asistente_registrar(text, text, text) to authenticated;

-- Comprobación: tiene que mostrar una fila con tabla = true, consultar = true, registrar = true, limite_por_dia = 2
select to_regclass('public.safia_asistente_uso') is not null as tabla,
       to_regprocedure('public.safia_asistente_consultar(text)') is not null as consultar,
       to_regprocedure('public.safia_asistente_registrar(text,text,text)') is not null as registrar,
       2 as limite_por_dia;
