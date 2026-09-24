# Fundamentos · Balance de nutrientes de la campaña

Qué calcula SAFIA al cerrar una campaña con cosecha y de dónde salen los números. Versión 1 · 24 de septiembre de 2026.

## 1. Qué es el balance

Con el **rinde real** se calcula cuánto nutriente se llevaron los granos (exportación), se compara con lo **aplicado** en la campaña (insumos de la ficha y aplicaciones del Operador) y queda un **saldo** por nutriente:

- saldo negativo: el suelo perdió reserva; hay que reponerla en la próxima campaña además de lo que se llevará la meta;
- saldo positivo: se construyó reserva.

Ese saldo entra al plan de la meta de la campaña siguiente como ítem "Reposición de la cosecha anterior", sumado a la corrección del suelo por análisis (fósforo, potasio, encalado) que el plan ya calcula.

## 2. Coeficientes de exportación (kg por tonelada de grano, base seca)

Fuente: IPNI / Fertilizar, *Requerimientos nutricionales de los cultivos* (Archivo Agronómico n.º 3), Tablas 1 (cereales) y 2 (oleaginosas), con datos de INTA Balcarce, INTA Pergamino y bibliografía argentina. Valores elementales; SAFIA los muestra como P₂O₅ (× 2,29) y K₂O (× 1,2).

| Cultivo | N | P | K | Ca | Mg | S | P₂O₅ | K₂O |
|---|---|---|---|---|---|---|---|---|
| Soja | 55 | 6 | 19 | 3 | 4 | 3 | 13,7 | 22,8 |
| Maíz | 15 | 3 | 4 | 0,2 | 2 | 1 | 6,9 | 4,8 |
| Trigo | 21 | 4 | 4 | 0,4 | 3 | 2 | 9,2 | 4,8 |
| Sorgo | 20 | 4 | 4 | 0,9 | 1 | 2 | 9,2 | 4,8 |
| Girasol | 24 | 7 | 6 | 1 | 3 | 2 | 16,0 | 7,2 |

Absorción total (grano + rastrojo), solo como referencia: soja N 75 · P 7 · K 39; maíz N 22 · P 4 · K 19; trigo N 30 · P 5 · K 19; girasol N 40 · P 11 · K 29. La diferencia con lo exportado vuelve al suelo con el rastrojo.

Comprobación cruzada: Embrapa Soja (2013) informa para la soja una exportación de N 51 · P₂O₅ 10 · K₂O 20 · Ca 3 · Mg 2 · S 5 kg/t y un requerimiento total de N 83 · P₂O₅ 15 · K₂O 38 kg/t; Embrapa (Documentos 288, 2023) para maíz grano N 12,4 · P 4,0 · K 3,5 kg/t y trigo N 33 · P 4,6 · K 7,6 kg/t. Los órdenes de magnitud coinciden con la tabla usada, y con la manutención de P y K por tonelada de CAPECO 2012 que ya usa el plan de la meta.

## 3. Reglas que aplica SAFIA

- **Base seca:** el rinde comercial se convierte con la humedad de la cosecha (13–14 % si no se cargó) antes de multiplicar por el coeficiente.
- **Nitrógeno en soja:** se informa lo exportado, pero no se cuenta como deuda de fertilizante: la soja lo fija del aire (Embrapa CT75, Hungria 2001) y no se recomienda aplicar N.
- **Azufre:** solo se descuenta el S que viene declarado en la fórmula del fertilizante (ejemplo "+ 10 S"); el aplicado en yeso entra por el ítem de encalado/yeso del plan.
- **Calcio y magnesio:** se informa lo exportado; la reposición es el encalado (calcítico o dolomítico), que el plan calcula por saturación de bases.
- **Aplicado:** suma los insumos de fertilización de la ficha (fórmula × dosis, ver safia-insumos.js) y las aplicaciones del Operador con porcentaje de N-P-K dentro del ciclo (el Operador guarda P y K elementales; se convierten a óxidos).
- **Sin fertilizantes cargados:** el balance lo avisa; el saldo asume cero aplicado hasta que se carguen.

## 4. Límites

Es un balance de entradas por fertilizante y salidas por grano. No mide el rastrojo que vuelve, las pérdidas (lixiviación, volatilización, fijación) ni los aportes del suelo. Sirve para no descapitalizar el lote campaña tras campaña, no para reemplazar el análisis de suelo, que sigue mandando en el plan.
