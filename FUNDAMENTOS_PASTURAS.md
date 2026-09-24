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
