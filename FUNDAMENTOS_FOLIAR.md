# FUNDAMENTOS — Análisis foliar, clorofilómetro y nitrógeno en soja

Respaldo de `safia-foliar.js` (pestaña "Análisis foliar" del Banco, sección
del informe y el ítem "Hoja" del plan de metas). Fecha: 23-sep-2026.
Fuentes admitidas: Embrapa, INTA/Fertilizar, CAPECO/IPTA, UNL. Todo lo que
está en el motor tiene el número de fuente al lado; lo que no se pudo
verificar está en la sección 6.

---

## 1. Para qué sirve la hoja si ya tenemos el suelo

El análisis de suelo mide lo que hay disponible; el foliar mide lo que la
planta absorbió de verdad. Fertilizar/INTA: "el análisis foliar constituye
una herramienta de gran utilidad en el diagnóstico de la deficiencia de
nutrientes, especialmente los no convencionales" (otros que N y P), y "debe
ser considerado como una herramienta de monitoreo, que permite saber si la
nutrición del cultivo fue adecuada y si se deben planificar cambios en el
sistema de manejo". Con los dos, SAFIA responde la pregunta útil:

| Hoja | Suelo | Lectura de SAFIA |
|---|---|---|
| baja | bajo | confirmado: falta en el suelo; se corrige en el suelo (y foliar para salvar el ciclo si es micronutriente) |
| baja | adecuado | el suelo lo tiene y la planta no lo toma: pH, antagonismos (P–Zn, K–Mg, Ca/Mg), raíz sin explorar, agua |
| adecuada | bajo | la planta compensó por ahora; corregir el suelo antes de subir la meta |
| alta | — | desbalance o toxicidad (Mn y Fe altos en suelos ácidos, bajan al encalar) |

## 2. Rangos de suficiencia que usa el motor

Macronutrientes en g/kg (% × 10), micronutrientes en mg/kg (= ppm).

### Soja, plena floración (R1–R2), 3er trifolio desde el ápice con pecíolo, 30 plantas

| Nutriente | Adecuado (Embrapa Soja 1998; Embrapa 2020; Fertilizar) [1] | Lotes de alto rinde, DRIS, 194 lotes PR (Harger et al., Embrapa) [2] | Lote de 7.963 kg/ha (Flannery, citado por Fertilizar) [3] |
|---|---|---|---|
| N | 45–55 | 50,7–61,4 | 53,3 |
| P | 2,6–5,0 | 2,8–4,2 | 3,6 |
| K | 17–25 | 17,6–24,3 | 21,9 |
| Ca | 3,6–20 | 7,3–10,4 | 10,2 |
| Mg | 2,6–10 | 3,6–4,9 | 3,3 |
| S | 2,1–4,0 | 2,7–4,0 | 2,4 |
| B | 21–55 | 49–55 | 46 |
| Cu | 10–30 | 9–14 | 12 |
| Fe | 51–350 | 137–229 | 144 |
| Mn | 21–100 | 48–108 | 30 |
| Mo | 1–5 | — | — |
| Zn | 21–50 | 25–40 | 48 |

Ojo con la hoja: Harger et al. muestran que los valores cambian según se
analice el trifolio con o sin pecíolo (con pecíolo baja N, P, B, Fe, Mn y
Zn y sube K). SAFIA usa la tabla [1] como rango de suficiencia y la [2]
solo como referencia de "alto rinde".

### Maíz, floración (hoja opuesta y abajo de la espiga, tercio central sin nervadura, al aparecer los estigmas) [4]

N 27–35 · P 2–4 · K 17–35 · Ca 2,5–8 · Mg 1,5–5 · S 1,5–3 g/kg; B 10–25 ·
Cu 6–20 · Fe 30–250 · Mn 20–200 · Mo 0,1–0,2 · Zn 15–100 mg/kg.
Maíz V3–V4, planta entera (Fertilizar) [5]: N 30–50 · P 3–8 · K 20–50 ·
Ca 2,5–16 · Mg 3–8 · S 1,5–4; B 5–25 · Cu 5–25 · Fe 30–300 · Mn 20–160 ·
Zn 20–50.

### Trigo (Embrapa Trigo [6]; Fertilizar [5])

| Estadio | N | P | K | Ca | Mg | S | B | Cu | Fe | Mn | Zn |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Emergencia–macollaje, planta entera [5] | 40–50 | 2–5 | 25–50 | 2–10 | 1,4–10 | 1,5–6,5 | 1,5–40 | 4,5–15 | 30–200 | 20–150 | 18–70 |
| Inicio de alargamiento del tallo [6] | 35–50 | 3–5 | 20–30 | 2–5 | 2–5 | 2–5 | ≥ 6 | ≥ 6 | ≥ 40 | ≥ 40 | ≥ 30 |
| Inicio de espigamiento [6] | 20–30 | 3–5 | 15–30 | 2–5 | 1,5–5 | 1,5–4 | 6–12 | 5–15 | 25–100 | 25–100 | 25–70 |

### Girasol y sorgo (Embrapa 2020 [4])

Girasol, floración: N 33–35 · P 4–7 · K 20–24 · Ca 17–22 · Mg 9–11 ·
S 5–7; B 35–100 · Cu 25–100 · Fe 80–120 · Mn 10–20 · Zn 30–80.
Sorgo, embuchamiento (hoja +4): N 25–35 · P 2–4 · K 14–25 · Ca 2,5–6 ·
Mg 1,5–5 · S 1,5–3; B 4–20 · Cu 5–20 · Fe 65–100 · Mn 10–190 · Zn 15–50.

Estados que devuelve el motor: **bajo** (< 80 % del mínimo), **al límite**
(entre 80 % y el mínimo), **adecuado**, **alto** (> máximo).

## 3. Clorofilómetro (SPAD) como índice de suficiencia de nitrógeno

INTA Balcarce (Sainz Rozas, Reussi Calvo & Barbieri, Ciencia del Suelo
2019) [7]: 14 ensayos de maíz en siembra directa (1995/96–2012/13). El
índice de suficiencia de N (ISN) es el cociente entre el SPAD del lote y el
SPAD de una franja del mismo lote con N sin límite, medido en V6 y V10. La
dosis óptima económica se alcanza con ISN ≈ 0,97–0,98 (ecuación para V10:
ISN = 0,98 + 5·10⁻⁵ · dDOE − 3,9·10⁻⁶ · dDOE², r² 0,68). Fertilizar menciona
el mismo criterio con el 95 % del valor de referencia como umbral práctico.

En SAFIA: ISN ≥ 0,97 sin déficit; 0,95–0,97 al límite (volver a medir);
< 0,95 déficit, cobertura de N si el maíz está antes de V10 o el trigo antes
del encañazón. En soja el SPAD bajo no es motivo para aplicar N (sección 4):
mirar nodulación, Mg, S, Mn o exceso de agua.

## 4. Nitrógeno en soja: lo que dice Embrapa (verificado a pedido de Osmar)

La afirmación "aplicar N en floración o inicio de vaina aumenta el rinde
8–12 %" **no está respaldada por Embrapa**. Lo que Embrapa publicó:

- **Embrapa Soja, Comunicado Técnico 75 (Hungria, Campo, Franchini &
  Loureiro, nov. 2001)** [8]: 9 experimentos en Londrina, Ponta Grossa (PR)
  y Jaciara (MT), en suelos con población establecida de *Bradyrhizobium*,
  cultivares de distinto ciclo, siembra directa y convencional. Tratamientos:
  sin inoculación; sin inoculación + 200 kg N (100 siembra + 100 floración);
  inoculación estándar; inoculación + 30 kg N a la siembra; inoculación + 50
  kg N en pre-floración; inoculación + 50 kg N al inicio del llenado.
  Resultados: 100 kg N a la siembra "reduziu drasticamente a nodulação";
  incluso 30 kg N a la siembra redujo la masa de nódulos entre 44 y 86 %;
  "não foi constatado incremento no rendimento pela aplicação de 50 kg de N
  no pré-florescimento ou no enchimento dos grãos"; el testigo sin N
  fertilizante rindió en promedio 3.200 kg/ha, "confirmando que o processo
  de fixação biológica do N é capaz de garantir todo o N necessário".
- **Embrapa Cerrados (Mendes, Reis Jr., Hungria, Sousa & Campo, Pesquisa
  Agropecuária Brasileira 2008)** [8]: 15 ensayos entre 2000/01 y 2005/06
  con 200 kg N (50 % siembra + 50 % R1), 50 kg de nitrato de amonio o de
  sulfato de amonio en R1 y en R5. Respuesta en solo 2 ensayos (+154 a +216
  kg/ha, 1 a 4,3 sacas), sin retorno económico; 200 kg N redujo la
  nodulación 21–41 %; nitrato y sulfato en R1 también la afectaron.
  Conclusión textual: "a adubação nitrogenada tardia … não se justifica
  economicamente, em nenhum dos sistemas de cultivo".
- **Recomendación oficial de Embrapa** ("Soja: recomendação para a não
  aplicação de fertilizantes nitrogenados", 2008): no hay razón para usar
  N en ningún estadio de la soja en Brasil; reemplazarlo por inoculación.

Por eso SAFIA: (a) no tiene ítem de N para soja en el plan de metas y sí
un ítem informativo "Nitrógeno en soja: no aplicar" con estos ensayos; (b)
cuando la hoja de soja da N bajo, la lectura apunta a la fijación
biológica (nódulos, inoculante, Mo/Co, pH), no al fertilizante.

## 5. Cómo lo aplica SAFIA

1. **Carga**: pestaña "Análisis foliar" del Banco, a mano o leyendo el PDF
   o foto del laboratorio con IA (misma función `safia-leer-analisis`,
   modo `foliar`, que convierte % a g/kg). Campos: fecha, lote, cultivo,
   estadio (con la hoja a muestrear como recordatorio), N, P, K, Ca, Mg,
   S, B, Cu, Fe, Mn, Mo, Zn, SPAD del lote y SPAD de la franja de
   referencia, archivo y observaciones. Colección `analisis_foliar`, tabla
   `safia_foliar` (SQL en `supabase/sql/safia_foliar.sql`).
2. **Lectura**: cada nutriente con estado, rango, lectura y, en soja, la
   columna "Lotes de alto rinde" (alcanzado / falta) y el valor del lote de
   7.963 kg/ha.
3. **Hoja contra suelo**: cruce con el último análisis de suelo del lote
   (tabla de la sección 1), con las causas probables cuando el suelo tiene y
   la planta no toma.
4. **Qué hacer**: recomendaciones por nutriente con la vía (suelo o foliar)
   y las dosis de Embrapa cuando existen (Mn foliar 350 g/ha; B 1–2 kg/ha,
   Zn 6 kg/ha, Cu 1–2 kg/ha al suelo cada 4–5 años; Mo 12–30 g + Co 2–3
   g/ha en semilla).
5. **Informe para el cliente**: sección "Análisis foliar" con la misma
   lectura por lote.
6. **Meta de rinde**: el plan agrega el ítem "Hoja: nutrientes por debajo
   del rango" (sin costo fijado, para mirar) y el ítem "Nitrógeno en
   soja: no aplicar".

## 6. Lo que no tiene fuente sólida y se muestra como orientativo

- Las dosis foliares de B, Zn, Cu y Mg (SAFIA dice "según el agrónomo";
  solo el Mn foliar 350 g/ha está en Embrapa Cerrados).
- El umbral 0,95 del ISN es el práctico de Fertilizar; el ensayo del INTA
  da 0,97–0,98 para la dosis óptima.
- Los rangos de girasol y sorgo vienen de la compilación de Embrapa 2020
  (Raij, Malavolta), no de ensayos regionales.
- La clasificación "bajo / al límite" (80 % del mínimo) es una decisión de
  SAFIA para graduar el aviso, no un umbral publicado.

## 7. Fuentes

1. Embrapa Soja (1998), Tecnologias de Produção de Soja; tabla reproducida
   en Embrapa (2020), *Recomendações de calagem e adubação para o estado
   do Pará*, cap. 5 "Amostragem e diagnose foliar" (Veloso, Botelho, Viégas
   & Rodrigues), Tablas 1–3; y en Fertilizar/INTA, *Soja: nutrición del
   cultivo y fertilización en la región pampeana*, Tabla 3.
2. Harger, N.; Kurihara, C. H.; Oliveira, F. A.; Ralisch, R. *Faixas de
   suficiência para teores foliares de nutrientes em soja, definidas pelo
   uso do método DRIS, para solos de origem basáltica* (Embrapa Alice).
3. Flannery (1989) y Martins (1998), citados por Fertilizar/INTA, Tabla 3.
4. Embrapa (2020), cap. 5, Tablas 2 y 3 (fuentes: Raij 1991, Raij et al.
   1996, Malavolta et al. 1997).
5. Correndo, A.; García, F. (2016). *Métodos de diagnóstico nutricional en
   cultivos extensivos en Argentina*, Fertilizar AC / IPNI, Tabla 2.
6. Embrapa Trigo. *Fertilidade do solo e a cultura do trigo no Brasil*,
   Tablas 10 y 11.
7. Sainz Rozas, H.; Reussi Calvo, N.; Barbieri, P. (2019). *Uso del índice
   de verdor para determinar la dosis óptima económica de nitrógeno en
   maíz*. Ciencia del Suelo 37(2), INTA-FCA Balcarce / CONICET.
8. Hungria, M.; Campo, R. J.; Franchini, J. C.; Loureiro, M. F. (2001).
   *Adubação nitrogenada na cultura da soja*, Embrapa Soja, Comunicado
   Técnico 75. Mendes, I. C.; Reis Jr., F. B.; Hungria, M.; Sousa, D. M. G.;
   Campo, R. J. (2008). *Adubação nitrogenada suplementar tardia em soja
   cultivada em latossolos do Cerrado*, PAB 43(8). Embrapa (2008), *Soja:
   recomendação para a não aplicação de fertilizantes nitrogenados*.
9. Embrapa Cerrados, *Adubação da soja em áreas de Cerrado:
   micronutrientes* (Sousa & Lobato; Galrão).
