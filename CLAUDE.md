# SAFIA (mi-app-riego-safia) — instrucciones para Claude Code

## Sobre Osmar (el dueño)
- Osmar es el dueño del negocio, NO es programador. Explicale todo en
  español simple, sin jerga, y avanzá por partes.
- Entregá las funciones COMPLETAS de una sola vez: cubrí todas las
  pantallas donde aparece el dato y dale UN solo paso de prueba
  (Ctrl+F5) por función. Nada de trabajos a medias.
- Verificá vos mismo todo lo que puedas ANTES de pedirle que pruebe.
  Si algo no lo podés verificar, decíselo explícitamente.

## El proyecto
- Carpeta: C:\Users\osmar\proyectos\mi-app-riego-safia
- SAFIA es una app de gestión de riego agrícola: campos, campañas,
  cultivos, equipos de riego, eventos de riego, clima y predicción,
  con vistas por rol (propietario, encargado, operador).
- Stack actual: páginas HTML estáticas con JavaScript, SIN framework
  (no hay Vite ni React ni build). Se abre index.html directo en el
  navegador.
- Clima: Open-Meteo vía safia-clima.js; hay un proxy serverless para
  Vercel en api/clima.js (flag USAR_PROXY, por defecto false =
  Open-Meteo directo).
- GitHub: https://github.com/OsmarDaSilva/safia (rama main).

## Estado y plan (a agosto 2026)
- HOY todos los datos se guardan solo en localStorage del navegador:
  no hay base de datos, ni login, ni datos compartidos entre aparatos.
- PRÓXIMO PASO decidido por Osmar: conectar SAFIA a Supabase
  (tablas para campos, campañas, cultivos, equipos, eventos, clientes)
  y agregar usuarios con roles (propietario, encargado, operador).
  Al migrar, no perder los datos ya cargados en el navegador
  (backup.html sirve para exportarlos).

## Forma de trabajo
- SQL de Supabase: bloques IDEMPOTENTES ("seguro de correr más de una
  vez") en un solo bloque; Osmar los pega en el SQL Editor del
  dashboard de Supabase. Mostrale después qué debería ver.
- Commits: en español, descriptivos. No hagas deploy ni push salvo que
  Osmar lo pida explícitamente.
- Cuando Osmar reporta "no funciona", lo más común es caché del
  navegador: pedile Ctrl+F5 antes de diagnosticar — pero primero
  verificá vos que el cambio realmente está hecho.
- Proyectos hermanos de referencia: mi-app-agroinvest360 y mi-app-bgp
  (en C:\Users\osmar\proyectos\) — ahí están las convenciones que a
  Osmar le funcionan bien, incluida la integración con Supabase.
