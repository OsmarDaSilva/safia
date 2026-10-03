# Fundamentos · Pasturas bajo riego en SAFIA

Qué hace SAFIA con una pastura regada (pastoreo rotativo intensivo, corte) y de dónde salen los números. Versión 1 · 24 de septiembre de 2026.

## 1. Qué cambia respecto de un cultivo anual

| Cultivo anual (soja, maíz) | Pastura |
|---|---|
| Se siembra, tiene etapas (inicial, desarrollo, media, final) y se cosecha una vez | Se implanta una vez y se maneja todo el año; no hay "fin de ciclo" |
| El rinde es kg de grano por hectárea al final | La producción es kg de **materia seca (MS)** por hectárea, por mes, en cada pastoreo o corte |
| La campaña termina con la cosecha | La campaña queda activa mientras la pastura exista; se registran entradas y salidas de animales por piquete |

Por eso en SAFIA una campaña de pastura lleva: sistema (pastoreo rotativo intensivo, rotativo, continuo o corte), cantidad de piquetes, días de ocupación y días de descanso. Los pastoreos se cargan desde el Operador como eventos "pastoreo": entrada de animales (piquete, cabezas, forraje ofrecido en kg MS/ha, altura), salida, o corte.

## 2. Agua: coeficientes usados

Fuente: FAO-56 (Allen, Pereira, Raes y Smith, 1998), *Crop evapotranspiration*.

- **Tabla 12 (Kc)**: pastura bajo pastoreo rotado: Kc ini 0,40 · Kc med 0,85–1,05 · Kc fin 0,85. Alfalfa para heno con el efecto de los cortes promediado: 0,40 · 0,95 · 0,90.
  - En SAFIA la pastura tropical usa un Kc por estación que refleja ese rango con el mosaico de piquetes en distintos estados de rebrote: primavera 0,85 · verano 0,95 · otoño 0,85 · invierno 0,60 (en invierno la gramínea tropical casi no crece, ver punto 3).
- **Tabla 22 (raíz y agotamiento permitido)**: pastura bajo pastoreo: raíz 0,5–1,5 m, p = 0,60. Alfalfa: 1,0–2,0 m, p = 0,55.
  - SAFIA usa raíz efectiva 0,8 m y p = 0,60 para la pastura tropical: el semáforo pide regar cuando queda menos del **40 %** del agua útil (en soja es 50 %).

## 3. Temperatura: la parada de invierno

Las gramíneas forrajeras tropicales (Brachiaria/Urochloa, Panicum/Megathyrsus como Mombaça y Tanzania, Cynodon como Tifton 85) tienen una **temperatura base de crecimiento cercana a 15 °C**: por debajo de esa media el crecimiento es mínimo aunque no falte agua (Embrapa Gado de Corte y Embrapa Pecuária Sudeste; base bibliográfica de Cooper y Tainton 1968 para gramíneas C4). Es la "estacionalidad de producción": el 70–80 % del forraje del año se produce en primavera-verano.

Consecuencia práctica en SAFIA: el Operador muestra la temperatura media de la última semana; si está por debajo de la base, avisa que el riego en esa época **mantiene** la pastura viva pero no la hace producir, y que no conviene forzar el riego. La referencia forrajera de Irrigar muestra lo mismo: en junio-julio la producción regada cae a un tercio de la de verano.

## 4. Manejo del pastoreo rotativo intensivo

Recomendaciones generales de Embrapa para pasturas tropicales regadas y fertilizadas: descanso del piquete de 21 a 35 días en verano (según especie y nitrógeno) y mayor en invierno; ocupación corta (1 a 3 días) para que los animales no vuelvan a comer el rebrote; entrar a la altura de meta de cada especie (por ejemplo Mombaça ~90 cm, Tifton 85 ~25–30 cm) y salir a la altura de residuo. SAFIA no fija esos valores: los carga el usuario en la campaña (días de ocupación y de descanso) y SAFIA avisa cuando un piquete cumplió la ocupación o el descanso.

## 5. Producción y referencia

Cada entrada de animales o corte puede llevar el **forraje ofrecido en kg MS/ha** (medido con regla, plato o estimado). SAFIA suma esos valores por mes y los compara en el Banco Agronómico con la **Referencia forrajera** de Irrigar (base del SIGA, Paraguay 2024: BRS Zuri, Gatton Panic y pasturas varias, Oriental/Centro y Occidental/Chaco, regada y secano). Con eso se ve si el lote produce lo que la zona regada permite.

## 6. Qué no está todavía

- Kc por rebrote de cada piquete (FAO-56 permite calcular el efecto de cada corte individualmente): SAFIA usa el promedio del mosaico, que es lo correcto para el pivote entero.
- Fertilización nitrogenada por pastoreo y meta de rinde de forraje con recetario (como el Motor 8 de granos).
- Carga animal y balance forrajero (oferta vs demanda del rodeo).

## Pasto en kilos y carne producida (3-oct-2026, safia-forraje.js)

Fuentes leídas en el documento original:

- **Altura → kg MS/ha (Panicum):** Jank et al. 2017, Embrapa Gado de Corte, Comunicado Técnico 138 (BRS Quênia), Tabela 10, p. 14. Quênia 3.342 kg MS/ha a 61,8 cm y 3.267 a 52,9 cm; Tanzânia 4.352 a 74,6 cm y 3.581 a 58,7 cm → 54 a 62 kg MS/ha por cm (cálculo masa ÷ altura; no es una ecuación publicada). SAFIA usa 58 como valor orientativo.
- **Altura → kg MS/ha (Brachiaria):** Barioni & Ferreira 2007, Embrapa Cerrados, Boletim de Pesquisa e Desenvolvimento 191, Tabela 2, p. 18: altura = 0,009 × masa − 1,59 (R² 0,71); pendiente 0,008 a 0,014 según el mes → ≈ 111 kg MS/ha por cm (71 a 125).
- **Lado animal:** Martha Jr. et al. 2003, Embrapa Cerrados, Comunicado Técnico 101: UA = 450 kg; consumo 2,2 % del peso vivo; eficiencia de pastoreo 45/50/55/55 % según intensificación (SAFIA usa 55 %); acumulación = (masa pre − masa post anterior) ÷ días.
- **Arroba:** 30 kg de peso vivo (CT 138, p. 14: 860 kg PV/ha = 28,7 @).
- **Referencia de carne en secano:** CT 138, Tabela 8: Mombaça 834 y BRS Quênia 975 kg de peso vivo/ha/año (rotativo, Campo Grande).
- **Calibración en el campo:** Salman 2006, Embrapa Rondônia, "Método do quadrado" (marco 0,5 × 0,5 m; kg MS/ha = kg verde/m² × % MS × 10.000); materia seca en microondas: Oliveira et al. 2015, Embrapa Gado de Leite, Comunicado Técnico 77.

No verificado / no existe: ecuación altura–masa propia de BRS Zuri, Tamani, Massai o Tifton 85 (por eso el factor de tabla es orientativo y la calibración del campo manda); ensayo publicado de kg de carne/ha bajo pivot con pasto tropical; datos de lanzamiento de BRS Zuri (Com. Téc. 163, no se pudo abrir). El crecimiento mensual de referencia (regada y secano) es la base de forraje de Irrigar (tabla safia_ref_forraje_mensual).
