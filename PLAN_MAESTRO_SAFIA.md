# PLAN MAESTRO — SAFIA
## Smart Agro Intelligence · Inteligencia agronómica para riego

> Documento de referencia del proyecto. Ubicar en la raíz del repositorio.
> Toda decisión de producto, diseño y código debe ser coherente con este documento.
> Versión 1.1 — 22 de septiembre de 2026

---

## 1. Visión

SAFIA es un producto de riego que, mientras ayuda a regar, **construye un banco de datos agronómico que aprende**. Cada campaña de cada cliente deja su historia completa —suelo, agua, clima, manejo y resultado— y con esa memoria SAFIA se convierte en **consultor**: le muestra a cada cliente cómo evoluciona, le dice qué está funcionando y qué no, compara contra los mejores de su zona, y estima el potencial de proyectos nuevos.

**Principio rector: el riego es el producto, el banco de datos es el activo.** Cuantos más clientes riegan con SAFIA, mejor analiza, mejor recomienda y mejor vende Irrigar.

**Segundo principio: SAFIA compara, el agrónomo prescribe.** SAFIA muestra señales fundadas en casos reales ("los que más rinden tienen este suelo; el tuyo difiere en esto"). Cuánto encalar, cuánto fertilizar o cuánto regar lo decide el criterio agronómico. Nunca se promete una receta automática.

**Tercer principio: honestidad con los datos.** SAFIA dice siempre en cuántos casos se basa y de dónde sale cada número (medido, cargado a mano o estimado). Con pocos casos avisa que es una orientación, no una predicción.

## 2. Identidad de marca

- **Nombre:** SAFIA — Smart Agro Intelligence
- **Símbolo:** gota / hoja en verde sobre gris oscuro
- **Color primario:** Verde `#22A93A` (oscuro `#178029`, tinte `#E7F6EA`)
- **Gris institucional:** `#3A3E41` (barra lateral)
- **Tipografía:** Plus Jakarta Sans
- **Tono:** español del Paraguay con voseo, simple, sin jerga; pensado para productores, encargados y operadores que no son técnicos en software.

## 3. Usuarios y roles

| Rol | Quién | Qué hace en SAFIA |
|---|---|---|
| **Irrigar (administrador)** | Osmar y su equipo | Carga clientes, campos, equipos; evalúa proyectos nuevos; usa el banco para vender y asesorar |
| **Propietario** | Dueño del campo cliente | Ve su expediente, sus campañas, su evolución y las recomendaciones |
| **Encargado** | Responsable del campo | Carga campañas, cosechas, análisis de suelo, riego del ciclo |
| **Operador** | Quien maneja el pivote | Registra riegos, lluvias y aplicaciones día a día (a mano o por voz) |

Hoy todos entran con usuario y contraseña de Supabase y ven todo. **Pendiente: permisos por rol** (que cada uno vea lo suyo). Debe hacerse **antes** de dar acceso a varias personas a la vez (ver riesgo de sincronización en §10).

## 4. El "caso": la unidad de conocimiento

Todo el motor gira sobre el **caso** = una campaña cosechada con todo lo que la rodea:

| Grupo | Datos | Quién lo carga |
|---|---|---|
| **Ubicación** | localidad, departamento, país, latitud, longitud | Cliente/Irrigar (listas para elegir; punto de Google Maps) |
| | altitud | **Automático** (de las coordenadas) |
| **Suelo** | pH, materia orgánica, P, K, Ca, Mg, CIC, saturación de bases, arena/limo/arcilla, con fecha | Cliente sube foto/PDF del laboratorio → **la IA lo lee** |
| **Equipo** | tipo, marca, modelo, caudal, presión, lámina, torres, bomba… | Cliente sube ficha técnica → **la IA la lee** |
| **Manejo** | cultivo, variedad, época y fecha de siembra, densidad, fertilización, encalado | Cliente, al abrir la campaña |
| **Agua** | riego del ciclo (mm) | Cliente / operador (día a día o total) |
| | lluvia del ciclo (mm), día a día | **Automático** (clima) o real (pluviómetro / estación) |
| **Clima** | temperatura media/máx/mín, días ≥35°, grados-día, ET₀, radiación del ciclo | **Automático** (clima) |
| **Resultado** | rinde real (kg/ha), fecha de cosecha, humedad, producción total | Cliente, al cerrar la campaña |

**Regla de captura:** todo dato agronómico entra **estructurado** (campos tipados, unidades consistentes), nunca como texto libre. Sin eso no hay comparación posible.

**Regla del agua:** el dato **real** (estación, pluviómetro, manual) siempre manda sobre el **estimado** (clima). Cada registro guarda su origen (`manual`, `voz`, `meteo`, `estacion`).

**Regla de la finalidad:** al comparar rindes, siempre dentro de la misma finalidad (grano con grano, ensilaje con ensilaje).

**Regla riego / secano:** un mismo cliente puede tener lotes **con riego** y lotes **de secano** (en Equipos, tipo "Lote de secano"). Los dos se cargan igual (campañas, cosechas, lluvia) y todo análisis muestra el comparativo: cada caso lleva `riego: true/false`, los rankings y la referencia separan riego de secano, y el Banco mide cuánto sumó el riego (mismo cliente, mismo cultivo, misma campaña). Así la base crece año a año, cosecha tras cosecha, con datos reales de las dos condiciones.

## 5. Los cinco motores de análisis

### Motor 1 · Referencia regional — HECHO
Base propia de SAFIA con 948 registros del Paraguay (sembrada desde SIGA): rinde por localidad, cultivo, finalidad y época, **secano vs con riego**. Es la vara de comparación y el argumento de venta de riego ("en Katueté, la soja con riego rinde +72% que en secano").

### Motor 2 · Tu rinde vs tu zona — HECHO
Para cada campaña cosechada del cliente: su rinde contra la referencia regional con riego y secano, y cuántas toneladas de más produjo frente al secano de su zona.

### Motor 3 · Evaluar proyecto nuevo — HECHO
Para un prospecto: se cargan ubicación, cultivos con producción esperada y análisis de suelo. SAFIA busca los **casos reales más parecidos** (similitud por suelo 50 %, distancia 30 %, altitud 10 %, época 10 %), estima el **potencial** por cultivo, dice si el objetivo es alcanzable, y muestra **"tu suelo vs el de los que más rinden"** parámetro por parámetro.

### Motor 4 · Evolución y decisiones del cliente — HECHO
Para el cliente que **ya riega**, campaña tras campaña:
- **Suelo:** ¿mejoró o empeoró? Cada parámetro contra el análisis anterior (ya existe la tabla de evolución; falta el veredicto).
- **Rinde:** ¿mejoró o empeoró? Por cultivo, año contra año, contra su propio promedio y contra el mejor de su localidad.
- **Variedades / materiales:** ranking de rinde por variedad, dentro de cada cultivo.
- **Época de siembra:** rinde según la fecha/época en que sembró.
- **Fertirriego y manejo:** campañas con fertirriego o aplicaciones vs sin, y su rinde.
- **Agua → rinde:** con cuántos mm (lluvia + riego) se alcanzaron los rindes máximos; cuánta agua por kilo produjo. Base para la regla "si el año viene más seco, regá hasta llegar a los mm de tu mejor campaña".
- **Benchmark local:** el mejor productor de su localidad como referencia: qué suelo tiene, cuánta agua usó, qué variedad y época; y qué le falta al cliente para acercarse.

### Motor 6 · Diagnóstico agronómico (por qué y qué hacer) — HECHO
`safia-agronomia.js` (window.SafiaAgro). Interpreta el análisis de suelo con las tablas usadas en Paraguay y explica la diferencia de rinde entre dos casos:
- **Tablas:** P y K Mehlich-1 por clase de arcilla, niveles críticos (P 12/15 mg/dm³, K 75 mg/dm³), dosis correctivas y de manutención (Cubilla & Wendling 2012, CAPECO/IPTA); V% objetivo 65 soja / 70 maíz-trigo y encalado NC = (V2 − V1) × CIC / PRNT (Manual RS/SC 2016, Embrapa); Ca/Mg ideal 3–5 y (Ca+Mg)/K > 36 = deficiencia inducida de K (Oliveira Jr. 2001, Scientia Agricola); pH y disponibilidad (PPI 1997).
- **Por qué:** para cada parámetro calcula una "limitación" 0–1 (distancia al nivel crítico × importancia); lo que limita al cliente y no al de referencia explica la diferencia (ley del mínimo). Suma agua del ciclo vs ET₀, días ≥ 35°, época, fecha, variedad, encalado, fertilización y densidad. Diferencias < 5 % = empate técnico.
- **Qué hacer:** encalado (t/ha y tipo de calcáreo), P₂O₅ correctivo + manutención por tonelada objetivo, K₂O correctivo gradual, materia orgánica. Siempre con la fuente. SAFIA interpreta; el agrónomo prescribe.
- **Dónde:** Banco → Evolución (sección "Diagnóstico agronómico" por cultivo, contra el mejor de la zona), Banco → Análisis de suelo ("Lectura agronómica del último análisis"), Evaluar proyecto ("Lectura agronómica del suelo" del prospecto).

### Rotación y cobertura de invierno — HECHO
Cada cultivo de la campaña registra el **cultivo anterior en el lote** (SAFIA sugiere el de la campaña previa del mismo equipo) y la **cobertura entre cosechas** (avena, brachiaria ruziziensis, maíz + brachiaria "Santa Fe", nabo, centeno, crotalaria, mezcla, pastura) con detalle y manejo (desecada, rolada, pastoreada). El caso lleva `rotacion` (cargada, conCobertura, mismoCultivo, sojaSobreSoja). Banco → Evolución muestra la secuencia por lote con alertas "soja sobre soja", y compara rinde con vs sin cobertura y rotado vs repetido; el diagnóstico agrega los factores cobertura y soja sobre soja.

### Manejo e insumos por campaña — HECHO
`safia-insumos.js` (catálogo) + modal "Manejo e insumos" en Campañas. Cada campaña registra, estructurado y opcional: tratamiento de semilla (fungicida, insecticida, micronutrientes), inoculante y co-inoculante, fertilización de base, cobertura y fertirriego, foliares, fungicidas, insecticidas, herbicidas, encalado; con producto, dosis, unidad, etapa fenológica y fecha. Casilla "manejo completo" para distinguir "no se usó" de "no se cargó". Se puede copiar la lista de otra campaña. El caso del motor lleva `manejo` (conteo por práctica + aplicaciones del Operador); Banco → Evolución compara rinde con vs sin cada práctica dentro del mismo cultivo; el diagnóstico agronómico señala las prácticas que el mejor de la zona hizo y el cliente no.

### Motor 7 · Datos georreferenciados: mapas de rinde y grillas de fertilidad — HECHO (base)
`safia-mapas.js` + pestaña **Mapas georreferenciados** del Banco. Importa CSV/TXT (lat/lon, decimales con coma), GeoJSON, KML y ZIP shapefile (shpjs); detecta columnas (lat, lon, rinde, pH, MO, P, K, Ca, Mg, CIC, V%, arcilla); mapa Leaflet con 5 clases por quintiles; estadísticas (media, mediana, P10–P90, CV) y zonas por tercios; guarda en Supabase (`safia_geo_capas` + `safia_geo_puntos`, hasta 80.000 puntos por mapa); **cruce rinde × suelo**: cada punto de la grilla recibe el rinde promedio de la cosechadora a menos de 150 m; correlación de Pearson por parámetro, rinde en tercio bajo vs alto y contra el umbral agronómico (P crítico, K, pH, V%). "Usar como análisis": el promedio de la grilla entra como análisis de suelo del lote (origen `mapa`) y alimenta los motores 3, 4 y 6.
Próximos pasos: polígonos de lote (dibujar o desde shapefile) para superficie por zona y prescripción variable; capas satelitales (NDVI) por fecha; zonas de manejo estables (varios años de rinde); calibración del análisis por punto vs promedio.

### Motor 5 · Consultor en vivo — FUTURO
Durante la campaña, con estación meteorológica y satélite (NDVI): comparar las condiciones de **hoy** (agua acumulada vs demanda, grados-día, verdor) contra la **campaña modelo** que alcanzó el objetivo, **alineado por etapa del cultivo** (no por fecha del calendario), y alertar a tiempo para corregir (foliar, fertirriego, más riego).

### Asistente IA agronómico — FUTURO
Una IA (como Don Lindomar en SIGA) que responde preguntas en lenguaje natural **sobre los datos del banco**: "¿qué variedad de soja me rindió mejor?", "¿con cuántos mm hice mi mejor maíz?", "¿qué le falta a este suelo comparado con los mejores de Canindeyú?". Regla de oro heredada de SIGA: **todo número sale de los datos, nunca se inventa**.

## 6. Módulos y estado

| Módulo | Estado |
|---|---|
| Datos en la nube (Supabase) + login | ✅ |
| Clientes, campos (con coordenadas y altitud automática), equipos, cultivos | ✅ |
| Campañas con cierre de cosecha (rinde, agua del ciclo, clima del ciclo) | ✅ |
| Eventos día a día (riego, lluvia, aplicaciones; manual, voz, clima) | ✅ |
| Lectura con IA: análisis de suelo y ficha técnica de equipos | ✅ |
| Banco Agronómico por lote: sucesión de cultivos, suelo, agua mes a mes, archivos y mapas de cosecha | ✅ |
| Base de Referencia (948 registros, secano vs riego) | ✅ |
| Comparador "tu rinde vs tu zona" | ✅ |
| Evaluar proyecto (varios cultivos) + Banco de casos exportable | ✅ |
| Clima y predicción 7 días (Open-Meteo) | ✅ |
| Evolución y decisiones del cliente (Motor 4) | ✅ |
| Rankings de producción (nacional, departamental, local, variedades, épocas, productores) | ✅ |
| Finalidad, variedad con lista, encalado y fertilización en la campaña; cosecha por cultivo | ✅ |
| Catálogo de cultivos compartido (funciona en cualquier navegador) | ✅ |
| Historial anterior a SAFIA (ciclos manuales) alimenta el motor | ✅ |
| Permisos por rol | ⬜ |
| Sincronización por registro (no por colección) | ⬜ antes de roles |
| Publicación en Vercel (uso desde celular) | ⬜ |
| Estación meteorológica e imágenes satelitales | ⬜ |
| Consultor en vivo (Motor 5) | ⬜ |
| Asistente IA agronómico | ⬜ |
| Geocodificar las 43 localidades de la referencia (comparar por cercanía también contra la base regional) | ⬜ |
| Reemplazar alert()/confirm() nativos por avisos en pantalla (56 + 9 lugares) | ⬜ |
| Comparación de ids uniforme (mismoId) en todas las pantallas | ⬜ |
| Menú lateral estándar en clima.html y prediccion.html | ⬜ |

## 7. Reglas de negocio clave

1. **Real manda sobre estimado** (agua, clima).
2. **Grano con grano, ensilaje con ensilaje** (finalidad).
3. **SAFIA compara, el agrónomo prescribe.**
4. **Decir siempre cuántos casos respaldan** una estimación; con menos de 3, avisar que es orientación.
5. **Todo dato tiene origen** (medido / cargado / estimado) y se muestra.
6. **Nada se borra en silencio**: los cierres se pueden corregir; la sincronización no debe pisar cambios ajenos.
7. **El cliente es dueño de su expediente**; Irrigar usa el agregado (casos anonimizables) para asesorar y vender.

## 8. Arquitectura técnica

- **Front:** páginas HTML estáticas + JavaScript, sin framework ni build. Se abren desde archivo o servidor estático. Tema compartido `safia-theme.css`.
- **Datos:** localStorage como caché local; `safia-sync.js` sincroniza cada colección con Supabase (proyecto `btwxhsaarfopyjhmydlw`, el mismo de AGROinvest360; **distinto** del de SIGA). Tablas `safia_*` con formato `(id, datos jsonb)`; referencia en `safia_ref_produccion`, `safia_ref_forraje_*`; archivos en el bucket privado `safia`.
- **Motor:** `safia-casos.js` — arma los casos, trae el clima del ciclo, evalúa por similitud, listas de ubicación.
- **IA:** edge functions en Supabase (Deno) que llaman a Claude vía Anthropic (`ANTHROPIC_API_KEY` en los secrets del proyecto): `safia-leer-analisis`, `safia-leer-ficha-equipo`. Patrón repetible para cualquier documento.
- **Clima:** Open-Meteo (pronóstico, histórico diario, elevación, geocodificación). Sin llave.
- **Repositorio:** GitHub `OsmarDaSilva/safia`, rama `main`.

## 9. Modelo de negocio (para Irrigar)

- **Venta de riego:** el banco de casos y la referencia regional son el argumento (potencial estimado con casos reales de la zona).
- **Retención:** el cliente que ve su evolución y recibe orientación no se va.
- **Servicio:** asesoría agronómica basada en datos (Motor 4 y 5) como valor agregado del equipo vendido; potencialmente suscripción.
- **Red:** cada cliente nuevo mejora el análisis de todos.

## 10. Riesgos principales

- **Pocos casos al inicio:** el motor es tan bueno como la cantidad de casos. Mitigación: mostrar siempre el N, cargar clientes existentes con su historia, arrancar por referencia regional.
- **Sincronización por colección:** dos personas cargando a la vez pueden pisarse (el último que guarda gana). Mitigación: sync por registro con marca de tiempo **antes** de habilitar roles.
- **Calidad de carga:** nombres de localidad o variedad inconsistentes rompen las comparaciones. Mitigación: listas para elegir, normalización de acentos, lectura por IA.
- **Dependencia de la llave de IA:** si vence, la lectura automática cae (no el resto). Mitigación: la llave válida vive en `mi-app-agroinvest360/.env`; Supabase no la muestra una vez guardada.

## 11. Próximos pasos

1. Cargar 4–6 clientes completos (Irrigar) para darle fuerza estadística al banco.
3. Sincronización por registro → permisos por rol → acceso a encargados y operadores.
4. Publicar en Vercel para uso desde el celular.
5. Estación meteorológica y satélite → Motor 5.
6. Asistente IA agronómico sobre el banco.
