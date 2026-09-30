-- SAFIA · Campañas: el operador y el encargado también pueden cargar y corregir campañas
-- (30-sep-2026). Seguro de correr más de una vez.
--
-- Antes: solo el dueño del campo (rol cliente) e Irrigar podían crear o cambiar una campaña.
-- Ahora: también el encargado y el operador, pero SOLO en los campos que tienen asignados
--        (safia_campo_ok) y solo de su propio cliente. Borrar sigue siendo del dueño y de Irrigar.
-- La suscripción del pivot se sigue respetando (la controla aparte el guardia safia_susc_trg).

drop policy if exists safia_alta on public.safia_campanas;
create policy safia_alta on public.safia_campanas for insert to authenticated
  with check (
    safia_activo() and (
      safia_es_admin()
      or (cliente_id = safia_mi_cliente()
          and safia_mi_rol() in ('cliente', 'encargado', 'operador')
          and safia_campo_ok(campo_ref))
    )
  );

drop policy if exists safia_cambio on public.safia_campanas;
create policy safia_cambio on public.safia_campanas for update to authenticated
  using (
    safia_activo() and (
      safia_es_admin()
      or (cliente_id = safia_mi_cliente()
          and safia_mi_rol() in ('cliente', 'encargado', 'operador')
          and safia_campo_ok(campo_ref))
    )
  )
  with check (
    safia_activo() and (
      safia_es_admin()
      or (cliente_id = safia_mi_cliente()
          and safia_mi_rol() in ('cliente', 'encargado', 'operador')
          and safia_campo_ok(campo_ref))
    )
  );

-- Comprobación: tiene que mostrar 4 filas; "alta" y "cambio" con operador_y_encargado = true,
-- "baja" (borrar) con false.
select policyname as regla,
       cmd as accion,
       coalesce(with_check, qual) like '%operador%' as operador_y_encargado
from pg_policies
where schemaname = 'public' and tablename = 'safia_campanas'
order by policyname;
