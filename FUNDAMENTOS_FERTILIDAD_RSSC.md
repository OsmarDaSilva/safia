# Fundamentos · Fertilidad del suelo según el Manual RS/SC 2016

Decisión de Osmar (24 de septiembre de 2026): el motor agronómico de SAFIA sigue el **Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina** (Sociedade Brasileira de Ciência do Solo, Núcleo Regional Sul, 11ª edición, 2016; 376 páginas), con las clases por arcilla y por CTC. CAPECO/IPTA 2012 queda solo como contraste local. Los micronutrientes siguen Embrapa Cerrados porque usan el mismo extractor (Mehlich-1) que los laboratorios de la región; la tabla RS/SC 6.12 se guarda como contraste.

Todas las tablas de abajo están copiadas del texto del manual (archivo `manual-rssc-2016.pdf`, extraído con pdf-parse). Viven en `safia-fertilidad.js` (`window.SafiaFertilidad`), módulo puro que usan `safia-agronomia.js` (interpretación y recomendaciones), `safia-meta.js` (plan de la meta) y el Banco (chequeo de consistencia).

## 1. Clases del suelo (Tabela 6.1, p. 92)

| Arcilla | Clase | Materia orgánica | Clase | CTC pH 7 (cmolc/dm³) | Clase |
|---|---|---|---|---|---|
| > 60 % | 1 | ≤ 2,5 % | bajo | ≤ 7,5 | baja |
| 41–60 % | 2 | 2,6–5,0 % | medio | 7,6–15,0 | media |
| 21–40 % | 3 | > 5,0 % | alto | 15,1–30,0 | alta |
| ≤ 20 % | 4 | | | > 30,0 | muy alta |

Si el laboratorio no midió la arcilla, SAFIA asume clase 2 (41–60 %, suelos arcillosos de la Región Oriental) y lo dice en pantalla.

## 2. Fósforo Mehlich-1 para cultivos de granos (Tabela 6.4, p. 94, Grupo 2)

Límites superiores de cada clase en mg/dm³; el nivel crítico es el límite de "medio" (~90 % del rinde relativo).

| Clase | Arcilla 1 (> 60) | 2 (41–60) | 3 (21–40) | 4 (≤ 20) |
|---|---|---|---|---|
| Muy bajo | ≤ 3,0 | ≤ 4,0 | ≤ 6,0 | ≤ 10,0 |
| Bajo | 3,1–6,0 | 4,1–8,0 | 6,1–12,0 | 10,1–20,0 |
| Medio | 6,1–9,0 | 8,1–12,0 | 12,1–18,0 | 20,1–30,0 |
| Alto | 9,1–18,0 | 12,1–24,0 | 18,1–36,0 | 30,1–60,0 |
| Muy alto | > 18 | > 24 | > 36 | > 60 |

Vale para Mehlich-1. Si el análisis vino por Mehlich-3: P(M1) = P(M3) / (2 − 0,02 × arcilla). Resina o Bray no se interpretan con esta tabla: SAFIA lo avisa cuando el informe declara el extractor.

## 3. Potasio Mehlich-1 para granos, por CTC pH 7 (Tabela 6.9, p. 96, Grupo 2)

| Clase | CTC ≤ 7,5 | 7,6–15 | 15,1–30 | > 30 |
|---|---|---|---|---|
| Muy bajo | ≤ 20 | ≤ 30 | ≤ 40 | ≤ 45 |
| Bajo | 21–40 | 31–60 | 41–80 | 46–90 |
| Medio | 41–60 | 61–90 | 81–120 | 91–135 |
| Alto | 61–120 | 91–180 | 121–240 | 136–270 |
| Muy alto | > 120 | > 180 | > 240 | > 270 |

En mg/dm³; 1 cmolc/dm³ = 391 mg/dm³. Mehlich-3: K(M1) = K(M3) × 0,83.

## 4. Calcio, magnesio y azufre (Tabela 6.11, p. 97)

| Clase | Ca (cmolc/dm³) | Mg (cmolc/dm³) | S (mg/dm³) |
|---|---|---|---|
| Bajo | < 2,0 | < 0,5 | < 2,0 |
| Medio | 2,0–4,0 | 0,5–1,0 | 2,0–5,0 |
| Alto | > 4,0 | > 1,0 | > 5,0 |

Para leguminosas (soja), arroz irrigado, brásicas y liliáceas el crítico de S es el doble: 10 mg/dm³.

## 5. Micronutrientes (Tabela 6.12, p. 98; solo contraste)

| Clase | Cu | Zn | B | Mn |
|---|---|---|---|---|
| Bajo | < 0,2 | < 0,2 | < 0,1 | < 2,5 |
| Medio | 0,2–0,4 | 0,2–0,5 | 0,1–0,3 | 2,5–5,0 |
| Alto | > 0,4 | > 0,5 | > 0,3 | > 5,0 |

SAFIA usa para micronutrientes los umbrales de Embrapa Cerrados (B 0,3/0,5; Zn 1,0/1,5; Cu 0,5/0,8; Mn 2), más exigentes y calibrados en oxisoles con Mehlich-1, que es el caso de la región.

## 6. Corrección, manutención y reposición de P y K

**Corrección total** (Tabela 6.1.1, p. 105), kg/ha: muy bajo 160 P₂O₅ / 120 K₂O; bajo 80 / 60; medio 40 / 30. **Gradual** (Tabela 6.1.4, p. 105): en muy bajo y bajo, 2/3 en el primer cultivo y 1/3 en el segundo, siempre más la manutención; en medio, toda la corrección en el primer cultivo. En alto solo manutención. En muy alto, reposición de lo exportado o nada si el valor supera el doble del límite de "muy alto".

**Manutención** (Tabela 6.1.2, p. 106), por rinde de referencia, más adicional por tonelada extra:

| Cultivo | Rinde ref. (t/ha) | P₂O₅ | K₂O | + P₂O₅ por t | + K₂O por t |
|---|---|---|---|---|---|
| Soja | 3 | 45 | 75 | 15 | 25 |
| Maíz | 6 | 90 | 60 | 15 | 10 |
| Trigo | 3 | 45 | 30 | 15 | 10 |
| Girasol | 2 | 30 | 30 | 15 | 15 |
| Sorgo | 4 | 60 | 40 | 15 | 10 |

**Exportación en el grano** (Tabela 6.1.3, p. 107), kg por tonelada: soja N 60 · P₂O₅ 14 · K₂O 20; maíz 16 / 8 / 6; trigo 22 / 10 / 6; girasol 25 / 14 / 6; sorgo 15 / 8 / 4.

## 7. Nitrógeno

**Maíz** (cap. 6.1.14, p. 125), kg N/ha (siembra + cobertura) según materia orgánica y cultivo anterior:

| MO | Tras leguminosa | Tras consorcio o barbecho | Tras gramínea |
|---|---|---|---|
| ≤ 2,5 % | 70 | 80 | 90 |
| 2,6–5,0 % | 50 | 60 | 70 |
| > 5,0 % | ≤ 40 | ≤ 40 | ≤ 50 |

Para rindes esperados de más de 6 t/ha, 15 kg N/ha más por tonelada adicional.

**Trigo** (cap. 6.1.29, p. 133): MO ≤ 2,5 %: 60 tras leguminosa, 80 tras gramínea; 2,6–5,0 %: 40 / 60; > 5 %: ≤ 20. Para más de 3 t/ha, 20 kg N/ha (tras leguminosa) o 30 (tras gramínea) por tonelada adicional. 15–20 kg a la siembra y el resto entre macollaje y encañazón.

**Soja:** no lleva N (Embrapa CT75).

## 8. Encalado (capítulo 5, pp. 70–75)

**Índice SMP** (Tabela 5.2, p. 71): t/ha de calcáreo PRNT 100 % para llevar el pH en agua de 0–20 cm a 5,5 / 6,0 / 6,5. Ejemplos: SMP 5,0 → 6,6 / 9,9 / 13,3; SMP 5,5 → 3,7 / 6,1 / 8,6; SMP 6,0 → 1,6 / 3,2 / 4,9; SMP 6,5 → 0,4 / 1,1 / 2,1; SMP ≥ 7,1 → 0. La tabla completa (4,4 a 7,1) está en `safia-fertilidad.js`.

**Saturación de bases** (cap. 5.2.1): pH 5,5 = V 65 %, pH 6,0 = V 75 %, pH 6,5 = V 85 %; unos 5 puntos menos con CTC < 7,5 y 5 más con CTC > 15. NC (t/ha) = (V1 − V2) / 100 × CTC pH 7. El manual prefiere el SMP para el primer encalado; para reaplicaciones vale cualquiera de los dos.

**Decisión para granos** (Tabela 5.3 y texto 5.2.2): pH de referencia 6,0; se indica calcáreo cuando el pH es menor que 5,5. En siembra directa consolidada se muestrea 0–10 cm, no se aplica si V ≥ 65 % y saturación de Al < 10 %, y la dosis es ¼ de la que indica el SMP para pH 6,0, en superficie. Al arrancar la directa con aplicación superficial (SMP > 5,5): ½ de la dosis. Convencional o implantación: dosis completa incorporada en 0–20 cm. En superficie no más de 5 t/ha por vez. No aplicar si Ca ≥ 4,0 y Mg ≥ 1,0 cmolc/dm³ (nota 8). Con Mg ≤ 1,0 o Ca/Mg > 5, calcáreo dolomítico.

Con muestra 0–20 cm en directa (lo habitual en Paraguay), SAFIA informa la dosis completa para esa capa, la limita a 5 t/ha por aplicación y aclara la regla del ¼ para muestras 0–10 cm.

## 9. Chequeo de consistencia del análisis

Lo primero que hace un especialista: SB = Ca + Mg + K (+ Na); CTC pH 7 = SB + H+Al; V% = SB / CTC × 100; m% = Al / (SB + Al) × 100. Al guardar un análisis (a mano o leído con IA) SAFIA recalcula y avisa si el V% difiere más de 3 puntos, la CTC más de 0,3 cmolc/dm³ o el m% más de 2 puntos. Verificado con las 7 muestras de BIOSOLLO (05/08/2026) de Anderson Pereira: todas cierran.

## 10. Lo que se dejó de usar

Las clases de P (crítico 12/15 por dos clases de arcilla), de K (crítico único 75 mg/dm³) y las dosis correctivas de CAPECO/IPTA 2012, y el objetivo V% 65/70 por cultivo. Se conserva de Cubilla (2005) solo el costo de subir 1 mg/dm³ de P (25 kg P₂O₅/ha en suelos arcillosos, 15 en medios), usado únicamente para "construir" P por encima del crítico en planes de alto rinde.
