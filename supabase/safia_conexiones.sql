-- ============================================================
-- SAFIA · Conexiones con equipos (30-sep-2026): llaves de FieldClimate (Metos) cargadas desde la pantalla Conexiones
--   Las llaves se guardan acá y SOLO las lee la función del servidor (safia-fieldclimate, con la clave de servicio).
--   El navegador no puede leer esta tabla: tiene la seguridad por filas activada y NINGUNA política.
--   id = 'general' (cuenta de Irrigar) o el id del cliente dueño de la cuenta de FieldClimate.
-- Seguro de correr más de una vez.
-- ============================================================
create table if not exists public.safia_conexiones (
  id text not null,
  proveedor text not null default 'fieldclimate',
  publica text not null,
  privada text not null,
  estaciones integer,
  probado_en timestamptz,
  actualizado_en timestamptz default now(),
  actualizado_por uuid,
  primary key (id, proveedor)
);
alter table public.safia_conexiones enable row level security;
revoke all on public.safia_conexiones from anon, authenticated;

-- Qué deberías ver: la tabla creada, con la seguridad activada y sin políticas (nadie la lee desde el navegador)
select c.relname as tabla, c.relrowsecurity as seguridad_por_filas,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas,
       has_table_privilege('authenticated', 'public.safia_conexiones', 'select') as un_usuario_puede_leerla
from pg_class c where c.oid = 'public.safia_conexiones'::regclass;
