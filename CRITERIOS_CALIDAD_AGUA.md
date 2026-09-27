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
