-- ============================================================
-- SAFIA · Suscripciones v3 (30-sep-2026): lotes de secano con suscripción propia
--   Un lote de secano va INCLUIDO si su campo tiene un pivot con suscripción vigente (como antes).
--   Si no (productor sin riego), el lote paga su propia suscripción, igual que un pivot.
-- Seguro de correr más de una vez. Requiere safia_suscripciones.sql (v1) y v2.
-- ============================================================
create or replace function public.safia_equipo_vigente(p_equipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_equipo, '') = '' then true
    when not exists (select 1 from public.safia_equipos where id = p_equipo) then true
    when (select datos->>'tipo' from public.safia_equipos where id = p_equipo) = 'secano'
      then public.safia_campo_vigente((select datos->>'campoId' from public.safia_equipos where id = p_equipo))
           or exists (select 1 from public.safia_suscripciones s where s.id = p_equipo
                      and (public.safia_susc_vence(s.datos) is null or public.safia_susc_vence(s.datos) >= public.safia_hoy()))
    else exists (select 1 from public.safia_suscripciones s where s.id = p_equipo
                 and (public.safia_susc_vence(s.datos) is null or public.safia_susc_vence(s.datos) >= public.safia_hoy()))
  end;
$$;

-- ¿el usuario tiene al menos un lote habilitado? (pivot o secano con suscripción)
create or replace function public.safia_tengo_vigente() returns boolean
language sql stable security definer set search_path = public as $$
  select public.safia_es_admin() or exists (
    select 1 from public.safia_equipos e
    where e.cliente_id = public.safia_mi_cliente() and public.safia_campo_ok(e.campo_ref)
      and public.safia_equipo_vigente(e.id));
$$;

-- Qué deberías ver: cada lote con su estado
select coalesce(cl.datos->>'nombre', e.cliente_id) as cliente, e.datos->>'nombre' as lote, coalesce(e.datos->>'tipo', 'pivote') as tipo,
       coalesce(s.datos->>'vence', case when s.id is null then 'sin suscripción propia' else 'sin fecha (vigente)' end) as vence,
       public.safia_equipo_vigente(e.id) as habilitado
from public.safia_equipos e
left join public.safia_suscripciones s on s.id = e.id
left join public.safia_clientes cl on cl.id = e.cliente_id
order by 1, 3, 2;
