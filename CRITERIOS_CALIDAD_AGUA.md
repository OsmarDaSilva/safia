# SAFIA — Criterios de calidad del agua de riego

Documento de auditoría del módulo `safia-calidad-agua.js` (Banco → Análisis de agua, Evaluar proyecto, Informe).
Cada regla indica su fuente. Los valores se leyeron en el documento original durante la revisión del 27-sep-2026;
lo que no se pudo verificar en una fuente citable **no se usa**.

## 1. Datos del laboratorio → unidades del cálculo

Se carga cada valor **tal cual el informe**, con su unidad; SAFIA convierte con una regla fija visible en cada línea.

| Unidad del informe | Regla | Destino |
|---|---|---|
| meq/L = mmolc/L = me/L | igual | meq/L |
| mg/L = ppm | ÷ peso equivalente (Na 22,99 · K 39,10 · Ca 20,04 · Mg 12,15 · NH₄ 18,04 · Cl 35,45 · SO₄ 48,03 · CO₃ 30,00 · HCO₃ 61,02 · NO₃ 62,00) | meq/L |
| mmol/L | × cargas (Ca, Mg, SO₄, CO₃ × 2) | meq/L |
| mg/L como CaCO₃ (alcalinidad, carbonatos/bicarbonatos de NOBOLAB, dureza) | ÷ 50,04 | meq/L |
| mg/L como N (N-NH₄, N-NO₃) | ÷ 14,01 | meq/L |
| mg/L como S (S-SO₄) | ÷ 16,03 | meq/L |
| CE en dS/m = mS/cm | × 1000 | µS/cm |
| Boro en µg/L | ÷ 1000 | mg/L |

NOBOLAB informa carbonato y bicarbonato **como CaCO₃**: en el informe 200-853-1, 142,30 + 4,70 = 147,00 = alcalinidad total (CaCO₃).

## 2. Control del análisis
- Balance iónico, Standard Methods 1030 E: diferencia = (Σcat − Σan)/(Σcat + Σan); máximo ±0,2 meq/L (aniones 0–3), ±2 % (3–10), ±5 % (más de 10). Fuente: NDEP 2009 citando SM 1999.
- TDS medido / CE entre 0,54 y 0,96 (Hem 1992, vía NDEP 2009).
- Cationes ≈ CE(µS/cm)/100: solo orientativo (USDA Manual 60, p. 79).

## 3. Lo que se mide (FAO 29, Tabla 1, salvo indicación)
| Parámetro | Sin restricción | Ligera a moderada | Severa |
|---|---|---|---|
| CE (dS/m) | < 0,7 | 0,7–3,0 | > 3,0 |
| Infiltración, RAS con CE | 0–3: > 0,7 · 3–6: > 1,2 · 6–12: > 1,9 · 12–20: > 2,9 · 20–40: > 5,0 | intermedio | 0–3: < 0,2 · 3–6: < 0,3 · 6–12: < 0,5 · 12–20: < 1,3 · 20–40: < 2,9 |
| Na con aspersión (meq/L) | < 3 | > 3 | — |
| Cl con aspersión (meq/L) | < 3 | > 3 | — |
| Na superficie (RAS) / Cl superficie (meq/L) | < 3 / < 4 | 3–9 / 4–10 | > 9 / > 10 (frutales y leñosos, nota 4) |
| Boro (mg/L) | < 0,7 | 0,7–3,0 | > 3,0 |
| HCO₃ con aspersión (meq/L) | < 1,5 | 1,5–8,5 | > 8,5 |
| N-NO₃ (mg/L) | < 5 | 5–30 | > 30 |
| pH | 6,5–8,4 normal | | |

Además:
- Clase Riverside/USSL: USDA Manual 60, Fig. 25 y p. 80–81 (S = 18,87 − 4,44 log C; 31,31 − 6,66 log C; 43,75 − 8,87 log C).
- CSR: < 1,25 seguro · 1,25–2,5 marginal · > 2,5 no apto (USDA Manual 60 p. 81; igual INTA y Embrapa/Almeida 2010).
- Depósitos de cal con aspersión = menor entre (HCO₃+CO₃) y (Ca+Mg): < 2 sin limitación · 2–3 más de 5 mm/h · 3–4 además solo con poca evaporación · > 4 no regar por aspersión (PNW 597, Tabla 14).
- Ca/Mg < 1 o Ca < 15 % de los cationes → evaluación adicional (FAO 29 §5.4).
- Referencia regional INTA (IPG 1999) para riego complementario: RAS aceptable < 5–15 según zona (centro-sur de Córdoba: dudosa desde 5, riesgosa desde 10); alerta de PSI del suelo 5 %.
- Texas A&M EB-1667: RAS 18–26 "en general no apta para uso continuo"; > 26 "en general no apta".

## 4. Cultivos (FAO 29)
- Rinde por sales: Tabla 4 (ECe/ECw al 100/90/75/50 %). Sin números en Tabla 4: girasol (mod. sensible), grama Rhodes (mod. tolerante), buffel (mod. sensible), Tabla 5.
- Agua extra de lavado: LR = ECw / (5·ECe − ECw) (ec. 9), con ECe del 90 % del rinde; con ECw > 1,5 dS/m, la del 100 % (§2.4.2). LR > 0,25–0,30 "puede no ser práctico" (§2.4.3).
- Hoja con aspersión (Tabla 18, día en verano): < 5 meq/L cítricos; 5–10 papa, tomate; 10–20 maíz, sorgo, alfalfa, cebada; > 20 algodón, girasol. **Soja, trigo, poroto, arroz: sin dato en FAO.** Colorado State (Maas 1990) ubica al maíz más sensible (desde 2 meq/L de Na).
- Boro (Tabla 16, tolera sin perder rinde): trigo, cebada, girasol, poroto 0,75–1,0 · papa 1,0–2,0 · maíz 2,0–4,0 · sorgo, alfalfa, tomate 4,0–6,0 · algodón 6,0–15 · naranja 0,5–0,75. **Soja: sin dato.**
- PSI que tolera (Tabla 15): maíz, poroto, cítricos < 15 · sorgo, trigo, arroz, caña, tomate 15–40 · alfalfa, cebada, algodón, bermuda, Rhodes > 40.

## 5. Corrección del agua
- Ácido sulfúrico solo si CSR > 1,25: 90 % del HCO₃ + todo el CO₃ (FAO §5.3; PNW 597 Tabla 15); 49,04 g de ácido puro por meq/L por m³; no bajar de pH 6,5 con aspersión (FAO §5.3). El ácido no cambia la RAS (PNW 597). Muy corrosivo, solo con operadores con experiencia (FAO §3.2.1).
- Yeso: 86 kg de yeso 100 % por meq/L de Ca cada 1000 m³ (FAO §3.2.1, ej. 7; coincide PNW 597, UC, Oklahoma State). Pureza: ÷ pureza (FAO ec. 16). Dosis = calcio mínimo para salir de la franja severa de la Tabla 1, estimando +0,1 dS/m de CE por meq/L (USDA Manual 60 p. 79; convención conservadora: otras fuentes dan hasta 0,19).
- En el agua si hace falta ≤ 4 meq/L y la CE ≤ 1,0 dS/m; si no, al suelo (FAO §3.2.1).
- 100 mm en 1 ha = 1000 m³. Riego anual: el cargado en el formulario; sin dato, 500 mm (supuesto, se avisa).
- Costos: precios vigentes de Datos → Precios (yeso US$/t; ácido sulfúrico 98 % US$/t). Sin precio, solo cantidades.

## 6. Veredicto
**No apta — descartar** si:
1. Clase C3-S4 o C4-S4: USDA Manual 60, S4 "en general no apta, salvo con salinidad baja o media" (se suman como respaldo Texas A&M con RAS > 26 y CSR > 2,5); o
2. Sacar el sodio de la franja severa exige más de 10 t/ha por año de yeso (FAO §3.2.1: "suele no ser económico"), o ni con 60 meq/L de calcio se logra; o
3. Ningún cultivo del proyecto la tolera (rinde < 50 %, lavado > 30 % o boro por encima de su tolerancia).

Si se descarta: buscar otra fuente o diluir (FAO §3.2.2); desalar no es económico para riego (FAO §3.2.1; referencia TWDB 2012: US$ 0,29–0,63/m³ en plantas municipales); ensayo piloto si igual se quiere probar (FAO §1.4).

**Apta con manejo** si hay puntos ligeros a moderados o severos corregibles: plan paso a paso (confirmar análisis, suelo, ácido, yeso, lavado, pivot de noche y con bajantes, boro, cultivos, control anual del PSI).

**Apta** si todo está sin restricción.

## 7. Índices de la planilla (hoja Analisis_Agua), informativos
- SE (4 casos, Palacios y Aceves; INIFAP 2009): < 3 buena · 3–15 condicionada · > 15 no recomendable; por suelo (Doneen 1958): arcilloso 3/5 · limoso 5/10 · arenoso 7/15.
- SP = Cl + ½ SO₄: < 3 · 3–15 · > 15.
- PSP = Na / SE × 100: < 50 % buena · > 50 % condicionada (Valle 1992; sin clase "no recomendable").
- Scott en mg/L (Almeida 2010, Embrapa): > 18 buena · 6–18 tolerable · 1,2–6 mediocre · < 1,2 mala.
- Langelier (Carrier 1965): > 0 tiende a incrustar.

## 8. Límites conocidos
- Las guías de FAO suponen clima semiárido y buen drenaje; con lluvias altas son más estrictas de lo necesario. En cambio, el INTA advierte que Riverside y FAO pueden subestimar el riesgo de aguas bicarbonatadas sódicas en zonas con lluvia.
- No se usa el RAS ajustado (adj RNa de Suarez): FAO 29 acepta tanto la RAS como el adj RNa.
- No se encontró un estudio publicado de aptitud para riego del agua subterránea de Boquerón; el agua profunda del Chaco central es salina (17.000 µS/cm en Filadelfia, 93–108 m; Larroza y Fariña 2005).

## Fuentes
1. FAO Riego y Drenaje 29 Rev. 1 (Ayers y Westcot 1985) — https://www.fao.org/3/t0234e/T0234E00.htm
2. USDA Agriculture Handbook 60, cap. 5 (Richards 1954) — https://www.ars.usda.gov/ARSUserFiles/20360500/hb60_pdf/hb60ch5.pdf
3. Ortiz Vega et al. 2019, Terra Latinoamericana 37(2) — https://www.redalyc.org/journal/573/57363012009/html/ ; INIFAP Folleto 66 (2009) — https://www.compucampo.com/tecnicos/correlacionindicadorescalidadaguaagricola.pdf
4. Almeida 2010, Qualidade da água de irrigação, Embrapa — https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/875385/1/livroqualidadeagua.pdf
5. Carrier (1965), índice de Langelier.
6. NDEP 2009 (Standard Methods 1030 E; Hem 1992) — https://ndep.nv.gov/uploads/documents/2009-cation-anion-balance-guide.pdf
7. Texas A&M EB-1667 (Fipps) — https://gfipps.tamu.edu/files/2021/11/EB-1667-Salinity.pdf
8. PNW 597 (Oregon State, U. Idaho, WSU 2007) — https://pws.byu.edu/https:/brightspotcdn.byu.edu/4b/6f/c34da4954078a51620833c51773d/managing-irrigation-water-quality.pdf
9. TWDB 2012, Cost of Brackish Groundwater Desalination in Texas — https://www.twdb.texas.gov/innovativewater/desal/doc/Cost_of_Desalination_in_Texas_rev.pdf
10. INTA IPG 1999 en Torres Duggan et al. 2017 — https://fertilizar.org.ar/wp-content/uploads/2021/09/17-1.pdf ; INTA EEA San Pedro 2016 — https://repositorio.inta.gob.ar/xmlui/bitstream/handle/20.500.12123/55/INTA_CRBsAsNorte_EEASanPedro_Bernardez_Valenzuela_Calidad_del_agua_con_fines_de_riego_IFRH_2016_paper_22.pdf
11. Colorado State Extension 0.506 — https://www.extension.colostate.edu/docs/pubs/crops/00506.pdf
12. Larroza y Fariña 2005 (Sistema Acuífero Yrendá) — https://cifodes.org/wp-content/uploads/2025/09/17-FernandoLarroza_Caracterizacion-Hidrogeologica-del-SAY.pdf

## Agregado 5-oct-2026 · corrección sin ácido y hoja por cultivo
- **Sin ácido (solo yeso):** Irrigar no inyecta ácido en el pivot. El yeso tiene que cubrir también el bicarbonato en exceso (CSR), que precipita el calcio agregado como carbonato al concentrarse el agua en el suelo (USDA Manual 60 p. 81). Aproximación usada: Ca sin ácido = Ca para salir de la franja severa de la Tabla 1 + CSR. En agua si ≤ 4 meq/L y CE ≤ 1 dS/m (FAO §3.2.1 i); si no, al suelo al voleo (FAO: 5–40 t/ha; > 10 t/ha/año no económico). Controlar con el PSI del suelo cada año.
- **Calcáreo:** FAO 29 Tabla 12 lo lista como enmienda solo para suelos ácidos; no reemplaza al yeso en suelo neutro o alcalino. **Azufre elemental** al suelo libera el calcio del calcáreo propio del suelo (FAO §3.2.1 ii), lento, no va en el agua.
- **Sodio y cloruro en la hoja:** los 3 meq/L de la Tabla 1 son la guía general; el daño por cultivo lo da la Tabla 18 (< 5: almendro, damasco, cítricos, ciruelo; 5–10: vid, pimiento, papa, tomate; 10–20: alfalfa, cebada, maíz, pepino; > 20: coliflor, algodón, remolacha, girasol; FAO §4.3, leído en fao.org/4/t0234e/t0234e05.htm). Si todos los cultivos del proyecto toleran el valor, el ítem queda en verde; los pastos no figuran en la Tabla 18 → "sin dato de FAO" (no se los da por dañados ni por tolerantes). Dato de campo de Irrigar: pasturas regadas 24 h con sol con esta agua, sin quemado.

## Agregado 6-oct-2026 · sin ácido y materia orgánica
- **Ácido sulfúrico fuera del plan** (Osmar: caro y casi sin oferta en Paraguay). Con CSR > 1,25 queda un solo paso "yeso para el sodio y el bicarbonato" (Ca = salir de la franja severa + CSR) y una nota con lo que bajaría el yeso con ácido. Tabla de costos sin la fila del ácido.
- **Materia orgánica y suelo cubierto** (cuando la infiltración no está en verde): FAO 29 §3.2.4 (rastrojos y materia orgánica mejoran la entrada del agua en suelos sódicos y con agua de RAS alta; hacen falta cantidades grandes, estiércol 40–400 t/ha en ensayos) y §3.2.1 (para recuperar suelos sódicos, pasturas y forrajeras tolerantes). Embrapa Soja CT 118 (Franchini et al. 2016, suelo arenoso y clima caliente): en suelos con < 20 % de arcilla el calor acelera la descomposición; la siembra directa baja la temperatura del suelo y la evaporación; 35 °C bajo paja de braquiaria contra 65 °C en suelo desnudo; se conserva 5–10 % del carbono de la paja. Embrapa Milho e Sorgo Circ. 29 (2003): milheto tolera déficit hídrico (< 400 mm) y suelos pobres; desecado en prefloración da paja de baja C/N y descomposición rápida. Recomendación: pastoreo rotativo con descanso, sorgo/milheto como cobertura y siembra directa del pasto sobre la paja (no arar para enterrar).
- Zuri (BRS Zuri): no hay dato publicado de tolerancia al sodio; no se afirma.
- **Corrección 6-oct-2026 (v149):** Osmar quiere las DOS opciones a la vista. Con CSR > 1,25: "Opción A · con ácido sulfúrico y yeso" (ácido FAO §5.3 + yeso para salir de la franja severa, con aviso de que en Paraguay es difícil de conseguir y caro) y "Opción B · sin ácido: solo yeso" (yeso = salir de severa + CSR). Tabla de costos con filas A y B y el total por año de cada una.
- **Cultivos de pastura (6-oct-2026, v150):** el cultivo se reconoce también por la variedad y sin la lista entre paréntesis de la categoría ("Pastura tropical (Brachiaria, Mombaça, Tifton)" + "BRS Zuri" antes se evaluaba como bermuda por la palabra Tifton). *Panicum maximum* (Zuri, Mombaça, Tanzania…) y *Brachiaria/Urochloa* no están en FAO 29 Tablas 4 y 5 (solo *Panicum antidotale*, MT): se muestran "sin dato" con nota. Estudios en la nota (no son regla): Silva et al. 2020, Rev. Ciênc. Agron. 51(1), UFC — Zuri con agua de hasta 3,0 dS/m (NaCl:CaCl2:MgCl2 7:2:1, RAS ≈ 4–10), invernadero, apto para el ganado; Salomón y Samudio, UNA (2013) — germinación con NaCl: Tanzania más tolerante que Mombaça. FAO 29 §2.4.3: salinidad del suelo superficial > 4 dS/m puede frenar la germinación.
- **Embrapa Agroindústria Tropical (Miranda, Ribeiro y Santana, FENACAM 2008, Russas-CE):** Tanzânia y Mombaça regados por aspersión con efluente (Na 4,54 meq/L, RAS 4,46, CE 0,71) y agua de río (Na 3,62, RAS 3,44, CE 0,57): sin diferencia de producción (≈ 3,9–4,8 t MS/ha en 2 cortes de 30 días), suelo franco. Se usa como evidencia de que el Panicum tolera sodio por aspersión arriba de los 3 meq/L de la guía general de FAO (v151). No prueba RAS alta en el suelo.

## Estudios que trae Osmar y cómo se usan (6-oct-2026, v152)

Regla de Osmar: los estudios que trae son para formar mejor el criterio de los análisis y las recomendaciones. Los de Embrapa (o INTA, INBIO-CAPECO, UNL) se usan como regla con su cifra; los universitarios y las revisiones, como respaldo que se cita al lado de la regla, nunca como regla sola.

- **Embrapa CPATSA 1985 (Pereira, Valdivieso y Cordeiro), yeso en suelos con sodio:** clases salino (CEe > 4 dS/m, PST < 15), sódico (PST > 15) y salino-sódico; yeso al suelo (t/ha) = 0,00086 × (PSI actual − PSI buscado) × CIC × profundidad (cm) × 1,25 (Richards 1954). Con la CIC en cmolc/dm³ (por volumen, como informan los laboratorios) la densidad ya está incluida. SAFIA busca PSI 5 % (alerta del INTA) en 0–20 cm. Aplicación: yeso fino, suelo húmedo después de un riego, lavar 50–70 mm, actúa en 10–20 cm, dura 3–4 años, mejor con materia orgánica; opción yeso + ácido sulfúrico al 25 % del sodio. Gramíneas forrajeras toleran el sodio mucho más que las leguminosas (CSSRI 1981, Tablas 7 y 8).
- **Campos nuevos en el análisis de suelo:** sodio intercambiable (cmolc/dm³) y CE del extracto de saturación (dS/m); SAFIA calcula el PSI. La IA (safia-leer-analisis v13) y la planilla Excel/CSV los leen (Na en mg/dm³ ÷ 230; CEe en µS/cm ÷ 1000). En el análisis de agua, el PSI medido manda: menos de 5 % = el yeso es preventivo; 5–15 % = alerta, empezar con el yeso; más de 15 % = suelo sódico, además yeso al suelo con la fórmula, y el suelo ya no se toma como compensación del sodio.
- **Embrapa Gado de Corte, folder BRS Zuri 2014:** con cultivo de pastura, la lectura del suelo (Motor 6) usa V% 45–50, P Mehlich-1 por arcilla para implantar (< 15 % → 18–21; 16–35 → 12–17; 36–60 → 8–11; > 60 → 4–7) y mantener al 80 %, K ≥ 50 mg/dm³, S 30 kg/ha, N ≥ 50 kg/ha al implantar si MO < 1,6 %, 120–150 kg N/ha/año, FTE 40–50 kg/ha, dolomítico si Ca < 1,5 o Mg < 0,5.
- **Embrapa Cerrados (Sousa, Lobato y Rein 2005), yeso para perennes:** 75 × % de arcilla (kg/ha) cuando en 20–40 cm Ca < 0,5, Al > 0,5 o m > 20 %. Llegó citado en la revisión de Martins et al. 2024 (Rev. Multidisc. Nordeste Mineiro, alumnas de grado): la revisión no es fuente; la cifra es de Embrapa. No aplica a Tres Tigre (sin aluminio, calcio alto): ahí el yeso es por el sodio.
- **Universidad Federal de Tocantins 2014 (Andrade et al., Revista Verde):** reemplazar potasio por sodio en el abono del Mombaça bajó altura, clorofila y producción. Respaldo del texto "cuidar el potasio" en Controlar cada año cuando el agua trae sodio.
- **UFC 2020 (Zuri hasta 3 dS/m), UNA 2013 (germinación Tanzania > Mombaça), Embrapa Agroindústria Tropical 2008 (Tanzânia y Mombaça por aspersión con RAS 4,5):** notas del cultivo en la tabla (v150–v151).

## Revisión 7-oct-2026 (v156): correcciones tras la auditoría de los cambios del 5 y 6 de octubre

- La alcalinidad informada en meq/L y la dureza en °f o °dH ahora se convierten a mg/L CaCO3 antes de usarlas (antes se tomaban como mg/L CaCO3 siempre).
- El umbral "severo si CE <" sale de la fila de la Tabla 1 de FAO que corresponde a la RAS (antes estaba fijo en 1,3/2,9).
- "Pastura" sin variedad entra como pastura genérica (nota: cargar la variedad), no desaparece de la tabla de cultivos.
- El suelo se toma como arenoso también por la arcilla medida (≤ 20 %), no solo por el texto del campo.
- Planilla Excel/CSV: la unidad del sodio y la CEe se decide por columna (encabezado o rango de toda la columna), no fila por fila; un Na de 7 mg/dm³ ya no se toma como 7 cmolc.
- El PSI que informa el laboratorio se guarda aunque no haya Na ni CIC (casillero PSI/PST en el formulario); con Na y CIC lo calcula SAFIA y, si difieren más de 2 puntos, queda anotado.
- Opción B (solo yeso) avisa cuando pasa de 10 t/ha por año (FAO: no económico).
