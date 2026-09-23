-- SAFIA · tabla de NDVI satelital por lote (Sentinel-2 vía Copernicus Data Space)
-- Seguro de correr más de una vez.
create table if not exists public.safia_ndvi (
  id          bigserial primary key,
  equipo_id   text not null,
  campo_id    text,
  fecha       date not null,
  ndvi_media  numeric(6,3),
  ndvi_p10    numeric(6,3),
  ndvi_p50    numeric(6,3),
  ndvi_p90    numeric(6,3),
  ndvi_min    numeric(6,3),
  ndvi_max    numeric(6,3),
  nubes_pct   numeric(5,1),
  pixeles     integer,
  fuente      text default 'sentinel-2-l2a',
  creado      timestamptz default now(),
  unique (equipo_id, fecha)
);
create index if not exists safia_ndvi_campo_idx on public.safia_ndvi (campo_id, fecha);

alter table public.safia_ndvi enable row level security;
drop policy if exists "safia_ndvi_leer" on public.safia_ndvi;
create policy "safia_ndvi_leer" on public.safia_ndvi for select to authenticated using (true);
drop policy if exists "safia_ndvi_escribir" on public.safia_ndvi;
create policy "safia_ndvi_escribir" on public.safia_ndvi for insert to authenticated with check (true);
drop policy if exists "safia_ndvi_borrar" on public.safia_ndvi;
create policy "safia_ndvi_borrar" on public.safia_ndvi for delete to authenticated using (true);
