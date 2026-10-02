-- SAFIA · Avisos al celular (notificaciones de la app). Seguro de correr más de una vez.
-- Crea: la configuración (llaves del envío y secreto del reloj, solo servidor), los celulares suscritos,
-- el registro de avisos enviados (para no repetir) y el reloj diario de las 6:00 de Paraguay.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Configuración: solo la lee el servidor (sin reglas = nadie desde el navegador)
create table if not exists public.safia_avisos_config (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);
alter table public.safia_avisos_config enable row level security;

-- 2) Celulares que activaron los avisos (uno por dispositivo y usuario)
create table if not exists public.safia_avisos_dispositivos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  creado_en timestamptz not null default now(),
  ultimo_ok timestamptz,
  fallos int not null default 0
);
create index if not exists safia_avisos_dispositivos_usuario on public.safia_avisos_dispositivos (usuario_id);
alter table public.safia_avisos_dispositivos enable row level security;

-- 3) Registro de avisos: uno por día, usuario, pivot y tipo (así no se repite)
create table if not exists public.safia_avisos_log (
  id bigint generated always as identity primary key,
  fecha date not null,
  usuario_id uuid not null,
  equipo_id text not null,
  tipo text not null,
  titulo text,
  cuerpo text,
  enviados int not null default 0,
  creado_en timestamptz not null default now(),
  unique (fecha, usuario_id, equipo_id, tipo)
);
create index if not exists safia_avisos_log_usuario on public.safia_avisos_log (usuario_id, id desc);
alter table public.safia_avisos_log enable row level security;

-- 4) Secreto del reloj: se genera acá adentro y nunca se muestra
insert into public.safia_avisos_config (clave, valor)
values ('cron', jsonb_build_object('secreto', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (clave) do nothing;

-- 5) Reloj: todos los días a las 9:00 UTC = 6:00 de Paraguay
do $$
begin
  if exists (select 1 from cron.job where jobname = 'safia-avisos-diario') then
    perform cron.unschedule('safia-avisos-diario');
  end if;
end $$;

select cron.schedule('safia-avisos-diario', '0 9 * * *', $cron$
  select net.http_post(
    url := 'https://btwxhsaarfopyjhmydlw.supabase.co/functions/v1/safia-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-safia-cron', (select valor->>'secreto' from public.safia_avisos_config where clave = 'cron')),
    body := jsonb_build_object('accion', 'diario'),
    timeout_milliseconds := 30000
  );
$cron$);

-- Qué deberías ver: una fila con el reloj "0 9 * * *" activo, 0 celulares y el secreto cargado
select j.jobname as reloj, j.schedule as horario, j.active as activo,
       (select count(*) from public.safia_avisos_dispositivos) as celulares,
       (select count(*) from public.safia_avisos_config where clave = 'cron') as secreto_cargado
from cron.job j where j.jobname = 'safia-avisos-diario';
