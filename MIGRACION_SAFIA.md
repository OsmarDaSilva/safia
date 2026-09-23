# Cómo separar SAFIA de AGROINVEST360 (cuando haga falta)

SAFIA vive hoy dentro del proyecto Supabase **AGROINVEST360**
(`btwxhsaarfopyjhmydlw`), pero está aislada: todo lo suyo lleva el prefijo
`safia_` / `safia-`, y la conexión está en **un solo archivo**. Separarla a
un proyecto propio lleva una tarde y no toca nada de AGROinvest.

## 1. Inventario de lo que es de SAFIA (sep-2026)

| Qué | Dónde | Cómo se identifica |
|---|---|---|
| Tablas de datos | Supabase → Table Editor | `safia_clientes`, `safia_campos`, `safia_equipos`, `safia_cultivos`, `safia_campanas`, `safia_eventos`, `safia_ciclos`, `safia_analisis`, `safia_archivos`, `safia_geo_capas`, `safia_geo_puntos` |
| Tablas de referencia | Supabase | `safia_ref_produccion` (948 filas copiadas de SIGA), `safia_ref_forraje_mensual`, `safia_ref_forraje_balance` |
| Archivos (PDF, fotos, mapas) | Supabase → Storage | bucket privado **`safia`** |
| Funciones de IA | Supabase → Edge Functions | `safia-leer-analisis`, `safia-leer-ficha-equipo` (código en `supabase/functions/` de este repo) |
| Secreto | Supabase → Edge Functions → Secrets | `ANTHROPIC_API_KEY` (la misma llave de Anthropic sirve en el proyecto nuevo) |
| Usuarios | Supabase → Authentication | hoy solo `osmar@irrigar.com.py` (se comparte con AGROinvest) |
| Conexión del front | este repo | `safia-sync.js` líneas 19-20: `SUPABASE_URL` y `SUPABASE_KEY` (única referencia en todo SAFIA) |

Nada de SAFIA depende de tablas de AGROinvest, y nada de AGROinvest lee
tablas `safia_*`.

## 2. Procedimiento (en orden)

1. **Crear el proyecto nuevo** en Supabase (ej. "SAFIA"), misma región.
2. **Crear las tablas**: en el proyecto viejo, SQL Editor →
   `select 'safia'` … lo más simple es correr en el proyecto nuevo los mismos
   bloques SQL con los que se crearon (están en el historial de conversación
   y en `supabase/` del repo); o exportar el esquema desde el viejo con
   `pg_dump --schema-only -t 'public.safia_*'`.
3. **Copiar los datos**: Table Editor → cada tabla `safia_*` → **Export CSV**,
   y en el proyecto nuevo **Import CSV**. Son pocas filas (las más grandes:
   `safia_ref_produccion` 948, `safia_eventos` unos cientos, `safia_geo_puntos`
   miles). Alternativa técnica: `pg_dump --data-only -t 'public.safia_*'` y
   `psql` al nuevo.
4. **Copiar el bucket `safia`**: crear el bucket privado `safia` en el nuevo y
   subir los archivos (Storage → Download / Upload, o con la CLI de Supabase).
   Las rutas (`campo_<id>/...`) quedan iguales, así los registros de
   `safia_archivos` y `safia_analisis` siguen apuntando bien.
5. **Desplegar las funciones**: `supabase functions deploy safia-leer-analisis` (también `safia-leer-ficha-equipo` y `safia-ndvi`)
6. **NDVI satelital**: correr `supabase/sql/safia_ndvi.sql` en el SQL Editor; crear una cuenta gratis en https://dataspace.copernicus.eu → Dashboard → User settings → OAuth clients → Create; cargar `CDSE_CLIENT_ID` y `CDSE_CLIENT_SECRET` en Edge Functions → Secrets del proyecto nuevo.
   y `safia-leer-ficha-equipo` contra el proyecto nuevo, y cargar el secreto
   `ANTHROPIC_API_KEY` en Edge Functions → Secrets (Osmar lo pega; nunca va
   en el código).
6. **Usuarios**: crear los usuarios en Authentication del nuevo (o invitarlos);
   las contraseñas no se copian, cada uno la vuelve a poner con
   "recuperar contraseña".
7. **Apuntar SAFIA al nuevo**: cambiar `SUPABASE_URL` y `SUPABASE_KEY` en
   `safia-sync.js` (la publishable key del proyecto nuevo, en Project
   Settings → API). Commit, push, Ctrl+F5.
8. **Verificar**: entrar, ver clientes/campos/campañas, abrir un PDF del Banco,
   leer un análisis con IA, cargar un mapa. Recién después borrar las tablas
   `safia_*` y el bucket del proyecto viejo (opcional; no molestan).

## 3. Reglas para que siga siendo fácil separarlo

- Toda tabla, bucket o función nueva de SAFIA lleva el prefijo `safia_` / `safia-`.
- La URL y la llave de Supabase se leen **solo** de `safia-sync.js`.
- SAFIA no hace joins ni lecturas de tablas de AGROinvest; si necesita datos
  de SIGA, se **copian** a una tabla `safia_ref_*` (como se hizo con
  Produccion_Agricola).
