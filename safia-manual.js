/* SAFIA — Manual por rol (Operador, Encargado, Propietario)
   -------------------------------------------------------------------
   Un botón "Manual" en la cabecera de las pantallas Operador, Encargado y Propietario abre el manual de ese rol:
   cómo se hace cada cosa, en pasos cortos, con los mismos nombres de botones y menús que se ven en pantalla.
   El Encargado ve también el manual del Operador; el Propietario (dueño del campo) ve los tres.
   Solo explica: no calcula ni cambia nada. El detalle del riego está en "Cómo funciona el riego" (safia-manual-riego.js).
   Al cambiar una pantalla o un botón, actualizar acá el paso que lo nombra.
   Uso: SafiaManual.montar({ rol: 'operador' | 'encargado' | 'propietario', en: '.topbar-derecha' }) */
(function () {
  'use strict';
  var NOMBRE = { operador: 'Operador', encargado: 'Encargado', propietario: 'Propietario' };
  var VE = { operador: ['operador'], encargado: ['encargado', 'operador'], propietario: ['propietario', 'encargado', 'operador'] };
  var INTRO = {
    operador: 'Sos quien está en el campo todos los días. SAFIA te dice cuándo regar y vos le contás lo que pasó: riegos, lluvia, aplicaciones, horas del equipo y, si hay pastura, alturas y movimientos de animales. Todo se carga desde la pantalla <b>Operador</b>.',
    encargado: 'Sos el gerente del campo: además de lo que hace el operador, abrís y cerrás las campañas, subís los análisis y las facturas, y mirás que no quede nada pendiente. Trabajás en las estancias que Irrigar te asignó.',
    propietario: 'Sos el dueño. No hace falta que cargues nada: SAFIA te muestra cómo está cada pivot, cómo viene la campaña, cuánto se gasta y qué conviene corregir. Si querés, también podés hacer todo lo que hace el encargado.'
  };
  /* Cada sección: t = título, p = pasos (lista numerada), n = nota al pie (opcional) */
  var MANUAL = {
    operador: [
      { t: 'Tu rutina de cada mañana', p: [
        'Mirá el <b>aviso del celular</b>: llega uno por pivot y dice cuánta agua tiene el suelo, si viene lluvia y qué hacer (arrancar el pivot hoy, arrancarlo tal día, o no regar).',
        'Abrí <b>Operador</b> y elegí el pivot en <b>Equipo de hoy</b>.',
        'Mirá la tarjeta <b>Agua en el suelo</b>: la aguja y el mensaje de abajo son la orden del día.',
        'Cargá lo que pasó desde la última vez: riegos, lluvia del pluviómetro, aplicaciones y horas del equipo.',
        'Si el pivot tiene pastura: medí la altura, mové los animales si toca y cargá el movimiento.' ],
        n: 'Si no cargás los riegos que hiciste, SAFIA cree que el suelo está más seco de lo que está y te va a pedir regar de más.' },
      { t: 'Cargar un riego', p: [
        'En Operador tocá <b>Riego</b>.',
        'Poné los <b>milímetros</b> que aplicó el pivot en esa vuelta.',
        'Revisá la <b>fecha</b> (viene la de hoy; cambiála si el riego fue otro día).',
        'Tocá <b>Guardar</b>. La aguja del agua se actualiza sola.' ] },
      { t: 'Cuánto y cómo regar', p: [
        'La tarjeta del agua dice cuántos mm hacen falta y cómo darlos: cuántas <b>vueltas</b>, a qué <b>velocidad</b> (%) y cuántas <b>horas</b> tarda cada una.',
        '<b>De día (9 a 18 h) nunca menos de 10 mm por vuelta</b>: las láminas chicas se evaporan y queman hojas. Con más de 30 °C, entre 10 y 14 mm.',
        '<b>De 18 a 22 h, de lunes a sábado, es el horario caro de la ANDE</b>: conviene parar el pivot, salvo que SAFIA avise que el equipo no alcanza.',
        'De noche (después de las 22 h) la lámina puede ser más chica.',
        'Si SAFIA dice <b>"En estrés, pero viene lluvia: esperar"</b>, no riegues hoy: la lluvia de hoy y mañana cubre lo que había que regar. Si mañana a la noche no llovió, regá.' ],
        n: 'El porqué de cada franja de color y de cada mensaje está en el botón "Cómo funciona el riego".' },
      { t: 'Cargar la lluvia', p: [
        'La lluvia <b>entra sola</b> por el satélite: no hace falta cargarla.',
        'Si en el campo hay <b>pluviómetro</b>, cargá lo que marcó: tocá <b>Lluvia</b>, poné los mm y <b>Guardar</b>. Lo tuyo manda sobre el satélite.',
        'Si SAFIA muestra lluvia para hoy y <b>en el campo no llovió</b>, tocá <b>Lluvia</b> y después <b>"Hoy no llovió acá (0 mm)"</b>.' ] },
      { t: 'Cargar una aplicación (pulverización o fertilizante)', p: [
        'Antes de salir, mirá la tarjeta <b>Ventana para pulverizar</b> (debajo de los botones): verde es ideal, amarillo con cuidado, rojo no pulverizar. Tocando una hora ves temperatura, humedad, viento y ráfagas.',
        'Cuando termines, tocá <b>Aplicación</b>.',
        'Elegí el <b>producto del catálogo</b> o escribí el nombre, y poné la <b>dosis</b> con su unidad.',
        'Tocá <b>Guardar</b>.' ],
        n: 'La ventana es un pronóstico: antes de pulverizar medí en el lote con termohigrómetro y anemómetro.' },
      { t: 'Roya de la soja: cuándo recorrer el lote', p: [
        'Con soja en campaña, debajo de los botones aparece el pliegue <b>Roya de la soja</b>. Dice si el clima permite la infección: verde, poco favorable; amarillo o rojo, favorable.',
        'La roya necesita <b>6 horas o más de hoja mojada</b> con 15 a 25 °C. SAFIA lo estima con el pronóstico, noche por noche.',
        'Si dice <b>Favorable</b>, recorré el lote y avisale al agrónomo. No quiere decir que haya roya: quiere decir que, si hay esporas, pueden infectar.',
        'Si una noche dice <b>Casi</b> (3 a 5 horas de hoja mojada), no riegues al atardecer: el riego puede completar las 6 horas. Mejor de madrugada o de mañana.' ],
        n: 'Es una estimación con el pronóstico, no una medición. La aplicación la decide el ingeniero agrónomo. SAFIA solo cubre la roya de la soja.' },
      { t: 'Fertirriego (fertilizante por el pivot)', p: [
        'En Operador tocá <b>Fertirriego</b>.',
        'Elegí el <b>producto</b> con su fórmula (por ejemplo, Urea 46-00-00) y poné los <b>kilos de producto</b>: por hectárea, o los de toda la vuelta.',
        'SAFIA muestra al instante los kilos de nutriente: <b>100 kg/ha de urea = 46 kg de N por hectárea</b>, y cuántos kilos de producto lleva la vuelta entera.',
        'Si querés, abrí <b>La cuenta del tanque</b>: con los litros de solución y las horas de la vuelta te dice a cuántos <b>litros por hora</b> poner la inyectora. Ahí también podés cargar el riego de esa vuelta.',
        'Tocá <b>Guardar</b>. Entra solo en el balance de nutrientes de la campaña.',
        'En maíz, la tarjeta <b>Fertirriego</b> muestra el plan de nitrógeno por etapa (cuántas hojas), lo aplicado y lo que falta.' ],
        n: 'El plan de nitrógeno sale de la tabla de Embrapa para maíz. En soja no se aplica nitrógeno. La dosis final la define el agrónomo.' },
      { t: 'Si el pivot se para', p: [
        'Tocá <b>Pivot parado · Asistencia</b>, poné la fecha en que se paró y elegí el motivo (falla eléctrica, mecánica, bomba, corte de energía, falta de agua).',
        'Dejá marcado <b>Pedir asistencia técnica a Irrigar</b> si necesitás que vengan, y contá en las observaciones qué ves.',
        'Si ayuda, tocá <b>Sacar foto</b> o <b>Filmar video</b> (abren la cámara del celular). Podés mandar varias fotos y un video corto juntos.',
        'Tocá <b>Guardar</b>: a los técnicos de Irrigar les llega el aviso con el pivot, la estancia y el motivo. Si aparece el botón verde <b>Avisar también por WhatsApp</b>, tocalo y después tocá Enviar: el mensaje ya va escrito.',
        'Si solo querés anotar una parada que ya pasó y no necesitás técnico, <b>desmarcá</b> el pedido de asistencia: ahí aparece la fecha en que volvió a andar.',
        'Cuando vuelva a andar, tocá el mismo botón, que ahora dice <b>Volvió a andar</b>, y poné la fecha. Si te olvidás, SAFIA la cierra sola cuando cargues el próximo riego.',
        'Sirve para que el parte de seguimiento explique por qué faltó agua esos días: una cosa es que se rompió el equipo y otra que no se regó a tiempo.' ] },
      { t: 'Asistencia técnica de Irrigar', p: [
        'Mientras haya un pedido abierto, en todas las pantallas aparece arriba a la derecha un aviso azul con su estado (quién lo tomó, la visita prevista). Tocalo para abrir el pedido.',
        'Cada pedido de asistencia es un asunto aparte. Se ve en <b>Asistencia técnica</b> (menú): quién de Irrigar lo tomó, cuándo vienen y la conversación de ese pedido.',
        'Para pedir: en Operador con <b>Pivot parado · Asistencia</b> (ver arriba), o en Asistencia técnica con <b>Pedir asistencia</b> (también sirve para una consulta con el pivot andando).',
        'Dentro del pedido podés <b>escribir</b> y mandar <b>fotos o videos cortos</b> (unos 15 segundos) con los botones <b>Sacar foto</b>, <b>Filmar video</b> y <b>Elegir archivo</b>. El técnico te contesta ahí mismo y te llega el aviso al celular (por ejemplo, la visita prevista).',
        'Al cerrar podés subir la <b>foto de la orden de servicio</b> firmada y su número: queda guardada en el pedido como comprobante. Si te olvidás, se puede subir después, con el pedido ya cerrado.',
        'Cuando el problema está resuelto, el pedido se <b>cierra</b> (lo cierra el técnico con su informe, o vos). Cerrado, esa conversación termina: si aparece otro problema, se pide una asistencia nueva. Si nadie lo cierra, se cierra solo cuando cargues el próximo riego de ese pivot.',
        'Si un pedido se cerró por error, abrilo y tocá <b>Reabrir el pedido</b>. Con <b>Editar</b> se corrige el motivo o la descripción mientras está abierto. Borrar un pedido solo lo puede hacer Irrigar; si el pedido cargó una parada del pivot, pregunta si se borra también.',
        'En <b>Repuestos y pendientes</b> de cada pedido se anota lo que falta para terminar (un rulemán, un contactor, un fusible) y quién lo trae. Cuando llega, tocá <b>Entregado</b>. Sigue en la lista aunque el pedido esté cerrado.',
        'En <b>Historial (cerrados)</b> queda todo lo que se atendió en cada pivot: qué falló, qué se hizo, qué repuestos se usaron y cuánto se tardó.' ] },
      { t: 'Horas del equipo y mantenimiento', p: [
        'En la tarjeta de <b>mantenimiento</b> cargá lo que marca el horímetro del pivot, de la bomba y del cañón, y tocá <b>Cargar lectura</b>.',
        'SAFIA marca las tareas <b>vencidas</b> y las <b>próximas</b> según esas horas.',
        'Cuando hagas una tarea (engrasar, cambiar aceite), tocá <b>Hecho hoy</b> en esa tarea.' ] },
      { t: 'Pasturas: altura, animales y pesadas', p: [
        '<b>Altura del pasto</b>: recorré el piquete, medí con la regla en 10 lugares y cargá las medidas. SAFIA saca el promedio y lo pinta de color: verde es a punto para entrar.',
        '<b>Pastoreo</b>: cargá cada <b>entrada</b> y cada <b>salida</b> de animales, con el número de piquete, las cabezas y la altura del pasto.',
        'Mirá las tarjetas <b>Pastura hoy</b>: en qué piquete están los animales, cuál es el próximo y qué sector <b>no hay que regar</b> (el ocupado y los 3 siguientes).',
        '<b>Pesada</b>: cuando pesen el lote, cargá las cabezas y el peso promedio. Marcá si es el ingreso del lote, una pesada de control o la salida. Con dos pesadas SAFIA calcula la ganancia diaria y los kilos de carne por hectárea.',
        '<b>Calibrar con corte de muestra</b> (una vez por estación): cortá el pasto de 10 marcos, pesalo y secá 100 g en el microondas. Así los kilos de pasto son los de tu campo.' ],
        n: 'La regla manda: entrar a la altura de entrada y sacar a la altura de salida. Ni afeitar el pasto ni dejarlo pasar.' },
      { t: 'Cargar hablando', p: [
        'En el menú abrí <b>Cargar por voz</b>.',
        'Tocá el micrófono y decí, por ejemplo: "regué 12 milímetros en el pivot 1" o "llovieron 20 milímetros".',
        'Revisá lo que entendió y confirmá. Funciona en español y en portugués.' ] },
      { t: 'Corregir o borrar algo que cargaste', p: [
        'En Operador, abajo, están los <b>últimos eventos</b>: la <b>×</b> de cada uno lo borra (pide tocar otra vez para confirmar).',
        'Para cambiar la fecha, el lote, la cantidad o una observación, abrí <b>Eventos</b> en el menú. En cada fila, a la derecha, el <b>lápiz</b> edita y el <b>tacho</b> borra (tocalo dos veces).',
        'Lo que dice <b>auto</b> (lluvia del satélite o de la estación) no se borra: si en el campo llovió otra cosa, cargá la del pluviómetro y manda la tuya.' ] },
      { t: 'Campañas', p: [
        'En <b>Campañas</b> podés crear una campaña nueva y cargarle datos; lo que no podés es borrar.',
        'Si falta un análisis, una meta o un plan de rotación, pedíselo al encargado o al dueño.' ] },
      { t: 'Avisos en el celular', p: [
        'Abrí SAFIA en el celular y tocá <b>tu nombre</b> (abajo en el menú).',
        'Entrá en <b>Avisos al celular</b> y tocá <b>Activar en este dispositivo</b>. Aceptá el permiso que pide el teléfono. Con <b>Enviar aviso de prueba</b> comprobás que llega.',
        'En <b>iPhone</b> primero hay que instalar SAFIA: botón Compartir y después "Agregar a inicio". Abrila desde ese ícono y recién ahí activá los avisos.',
        'Te llega cada mañana el riego de cada pivot y, cuando hay un pedido de asistencia, cada respuesta del técnico.',
        'Al tocar el aviso del riego se abre Operador en ese pivot, listo para cargar. Al tocar uno de asistencia se abre el pedido.' ],
        n: 'Hay que activarlos en cada celular. Si cambiás de teléfono o borrás SAFIA, activalos de nuevo.' },
      { t: 'Preguntarle al Asistente', p: [
        'En el menú abrí <b>Asistente IA</b>.',
        'Escribí como le hablarías a un agrónomo: "¿riego hoy?", "¿cuánto llovió este mes?", "¿qué mantenimiento tengo vencido?".',
        'Responde con los datos reales de tus pivots. Si falta algo, te dice qué falta y quién lo carga.' ] }
    ],
    encargado: [
      { t: 'Qué mirar primero: "Para hoy"', p: [
        'Abrí <b>Encargado</b>. Arriba está la lista <b>Para hoy</b>.',
        'En rojo: pivots que hay que <b>regar hoy</b> y <b>mantenimiento vencido</b>.',
        'En amarillo: mantenimiento próximo y <b>cosechas sin cargar</b>.',
        'En gris: lotes en campaña que llevan <b>más de 7 días sin ninguna carga</b>. Avisale al operador.',
        'Tocando cualquier renglón vas directo a ese pivot.' ] },
      { t: 'El parte de seguimiento', p: [
        'En el menú abrí <b>Seguimiento</b>. Arriba hay una fila por pivot con cuatro luces: meta, agua, equipo y datos.',
        'Debajo, cada pivot dice: cuánto de la <b>meta</b> sigue alcanzable, lo que <b>ya no se puede recuperar</b>, cómo viene el <b>agua</b> (riego, estrés, rinde perdido y cuánto falta regar), lo que <b>toca ahora</b> y lo que <b>falta cargar</b>.',
        'Si faltó agua, dice en qué fechas y si coincide con el pivot parado.',
        'Con <b>Imprimir</b> lo llevás a la reunión con el dueño.',
        'Al tocar el aviso de la mañana en el celular se abre directo este parte.' ],
        n: 'El parte junta lo que SAFIA ya calcula en las otras pantallas. Es tan bueno como lo que se cargó: riegos, insumos y paradas.' },
      { t: 'Asistencia técnica de Irrigar', p: [
        'En <b>Asistencia técnica</b> (menú) están los pedidos a Irrigar de tus pivots: quién lo tomó, la visita prevista y la conversación de cada pedido, con notas y fotos.',
        'Podés pedir asistencia desde ahí con <b>Pedir asistencia</b>, o el operador desde <b>Pivot parado · Asistencia</b>. Te llega el aviso al celular cuando el técnico contesta.',
        'Mientras haya un pedido abierto, en todas las pantallas aparece un aviso arriba a la derecha y un número al lado de Asistencia técnica en el menú.',
        'Al cerrar, subí la <b>foto de la orden de servicio</b> firmada con su número: es el comprobante. Si quedó para después, se sube con el pedido ya cerrado.',
        'Pestaña <b>Repuestos pendientes</b>: lo que falta enviar o llevar en todos tus pivots. Cuando llega, tocá <b>Entregado</b>. Con <b>Copiar la lista</b> la pegás en un WhatsApp.',
        'Si un pedido se cerró por error, <b>Reabrir el pedido</b>. Si se cerró solo porque se cargó un riego, el técnico igual puede completar el informe.',
        'Cuando se resuelve, el pedido se cierra y esa conversación termina; otro problema es otro pedido. En <b>Historial (cerrados)</b> queda qué falló en cada pivot, qué se hizo, qué repuestos se usaron y cuánto se tardó en atender y en resolver.' ] },
      { t: 'Abrir una campaña', p: [
        'Abrí <b>Campañas</b> y tocá <b>+ Crear nueva campaña</b>. O usá <b>Ficha de campaña</b>, que tiene todo en un solo formulario.',
        'Elegí el lote, el cultivo, la variedad y la <b>fecha de siembra</b>. SAFIA completa sola la fecha estimada de fin de ciclo.',
        'Guardá. Desde ese día SAFIA lleva la cuenta del agua de ese lote.' ],
        n: 'Sin fecha de siembra no hay balance de agua ni recomendación de riego.' },
      { t: 'Cargar el manejo y los insumos', p: [
        'En la campaña tocá <b>Manejo e insumos</b>.',
        'Cargá fertilizantes, semillas, encalado y aplicaciones con su dosis.',
        'El <b>fertirriego</b> lo carga el operador desde su botón (kilos de producto → kilos de nutriente). En maíz, la tarjeta Fertirriego del Operador muestra el plan de nitrógeno por etapa y lo que falta.',
        'Con eso SAFIA calcula el balance de nutrientes y compara con lo que pide la meta.' ] },
      { t: 'Cerrar la cosecha', p: [
        'En la campaña tocá <b>Registrar cosecha</b>.',
        'Cargá la fecha, la superficie cosechada, la producción y la humedad.',
        'Tocá <b>Confirmar y cerrar campaña</b>.',
        'Se abre solo el <b>informe de agua de la campaña</b>: cuánto se regó contra lo que hacía falta, los días de estrés y el gasto de energía. Se puede imprimir.' ] },
      { t: 'Subir un análisis de suelo, de agua o foliar', p: [
        'Abrí <b>Banco Agronómico</b> y elegí el campo.',
        'Entrá en la pestaña que corresponda (<b>Análisis de suelo</b>, <b>Análisis de agua</b> o <b>Análisis foliar</b>) y tocá <b>+ Agregar</b>.',
        'Subí el PDF, la foto o la planilla del laboratorio y tocá <b>Leer el archivo y completar solo</b>.',
        '<b>Revisá los valores contra el papel</b> y guardá.' ],
        n: 'SAFIA interpreta el análisis y dice qué limita el rinde y qué conviene corregir. La dosis final la define el agrónomo.' },
      { t: 'Subir la factura de energía de cada mes', p: [
        'En el Banco entrá en la pestaña <b>Energía y agua</b> y tocá <b>+ Subir factura de energía</b>.',
        'Elegí la foto o el PDF y tocá <b>Leer la factura con IA y completar solo</b>. Revisá los números.',
        'Marcá los <b>pivots que alimenta ese medidor</b> y poné el <b>cambio del período</b> si la factura está en guaraníes o reales.',
        'Guardá. SAFIA reparte el gasto entre los pivots según lo que regó cada uno y avisa si hay exceso de potencia o energía reactiva.' ],
        n: 'El reparto usa los riegos cargados. Si en ese mes no se cargaron riegos, no hay con qué repartir.' },
      { t: 'Meta de rinde, rotación y satélite', p: [
        '<b>Meta de rinde</b> (Banco): elegí la campaña y la meta. SAFIA arma el plan, lo que cuesta y, durante la campaña, dice si la meta sigue siendo alcanzable.',
        '<b>Plan de rotación</b> (Banco): qué sembrar en cada temporada de los próximos años, con avisos si se repite un cultivo.',
        '<b>Vigor satelital</b> (Banco): cómo viene el cultivo visto desde el satélite, comparado con las campañas anteriores del mismo lote.',
        '<b>Uniformidad del pivot</b> (Banco, dentro de Vigor satelital): tocá <b>Revisar la uniformidad de este pivot</b>. SAFIA busca franjas circulares en el vigor, sobre todo cuando el cultivo está madurando: una franja que se secó antes (pico tapado) o que sigue verde (boquilla más grande). Dice a qué distancia del centro y en qué tramo ir a mirar.' ] },
      { t: 'El informe para el dueño', p: [
        'En el Banco tocá <b>Informe para el cliente (PDF)</b>.',
        'Elegí el campo y, si querés, un lote o una campaña. Destildá las secciones que no hagan falta.',
        'Tocá guardar como PDF: se abre la impresión y elegís "Guardar como PDF".' ] },
      { t: 'Quién carga qué', p: [
        '<b>Irrigar</b>: los pivots y lotes, su ficha técnica, el plan de mantenimiento, la suscripción y los usuarios.',
        '<b>Dueño y encargado</b>: campañas, cosecha, insumos, análisis, facturas, metas y rotación.',
        '<b>Operador</b>: riegos, lluvia del pluviómetro, aplicaciones, horas del equipo, mantenimiento hecho y lo de pasturas.' ],
        n: 'Si falta un pivot, un lote o un usuario, o alguien olvidó la contraseña, pedíselo a Irrigar.' }
    ],
    propietario: [
      { t: 'Qué mirar cada semana', p: [
        'Abrí <b>Propietario</b>: es tu tablero.',
        'En el <b>Resumen ejecutivo</b> ves las campañas activas, el estado del riego de cada pivot, lo que llovió y lo que se regó en los últimos 30 días.',
        'Mirá el <b>mantenimiento</b>: qué está vencido y qué está por vencer.',
        'Si un pivot aparece en estrés o sin cargas hace días, hablá con el encargado.' ] },
      { t: 'El parte de seguimiento: todo en una pantalla', p: [
        'En el menú abrí <b>Seguimiento</b>: es el resumen de todos tus pivots para decidir.',
        'Las luces de arriba dicen en diez segundos cuál pivot pide atención.',
        'En cada pivot ves cuánto de la <b>meta</b> sigue alcanzable y qué se llevó el resto, cuánto rinde se perdió por <b>agua</b> y por qué, cuánto <b>falta regar</b> hasta la cosecha y qué hay que hacer ahora.',
        'Se puede imprimir.' ],
        n: 'SAFIA no muestra una probabilidad de llegar a la meta: muestra cuánto sigue siendo alcanzable con lo que ya pasó. El riego que falta es una estimación con el clima de los últimos 10 años.' },
      { t: 'Asistencia técnica de Irrigar', p: [
        'En <b>Asistencia técnica</b> (menú) están los pedidos a Irrigar de tus pivots: quién lo tomó, la visita prevista y la conversación de cada pedido, con notas y fotos.',
        'Arriba ves cuántos pedidos hay abiertos y cuánto tardaron en tomarse y en resolverse. No hace falta que hagas nada: es para que sepas cómo te están atendiendo.',
        'Mientras haya un pedido abierto, en todas las pantallas aparece un aviso arriba a la derecha con su estado.',
        'En <b>Repuestos pendientes</b> ves lo que falta mandar o comprar, y quién lo trae (Irrigar, el técnico o vos).',
        'Cada pedido cerrado guarda la <b>orden de servicio</b> (número y foto) como comprobante del trabajo.',
        'Cuando se resuelve, el pedido se cierra y esa conversación termina; otro problema es otro pedido. En <b>Historial (cerrados)</b> queda qué falló en cada pivot, qué se hizo, qué repuestos se usaron y cuánto se tardó en atender y en resolver.' ] },
      { t: 'Cómo viene la campaña', p: [
        'En <b>Banco Agronómico → Meta de rinde</b> ves si la meta sigue siendo alcanzable, qué se hizo, qué se perdió y qué se puede hacer todavía.',
        'En <b>Vigor satelital</b> ves el cultivo desde el satélite contra las campañas anteriores.',
        'O preguntale al <b>Asistente IA</b>: "¿cómo viene mi soja?".' ] },
      { t: 'Compararte con los mejores de la zona', p: [
        'En el Banco, <b>Meta de rinde</b> muestra qué tienen distinto los lotes que más rinden en tu zona: suelo, variedad, fecha de siembra y agua.',
        'En <b>Rankings</b> ves dónde quedó cada lote, por cultivo y por región.',
        'Los lotes de otros productores aparecen <b>sin nombre</b>, y los tuyos también para ellos.' ] },
      { t: 'Energía y costos', p: [
        'En el Banco, pestaña <b>Energía y agua</b>, están las facturas cargadas, cuánto le toca a cada pivot y cuánto cuesta cada milímetro regado.',
        'Arriba a la derecha elegís en qué moneda verlo: dólares, guaraníes o reales.',
        'Prestá atención a dos avisos: <b>exceso de potencia reservada</b> (se corrige con la ANDE) y <b>energía reactiva</b> (se baja con capacitores).',
        'Al cerrar cada cosecha queda el <b>informe de agua de la campaña</b>, con el gasto de energía por hectárea y por tonelada.' ] },
      { t: 'El informe en PDF', p: [
        'En Propietario o en el Banco tocá <b>Informe completo del cliente (PDF)</b>.',
        'Trae lotes, campañas y rindes, agua, energía, suelo, satélite, rotación, pasturas y el diagnóstico con lo que conviene corregir.' ] },
      { t: 'Pasturas bajo riego', p: [
        'En Operador, el bloque <b>Pasto en kilos y carne</b> muestra el pasto disponible, cuánto crece por día, la carga que aguanta el pivot contra la que tiene, y los kilos de carne producidos.',
        'El pliegue <b>Carga que aguanta cada mes</b> compara con riego y en secano.',
        'Para que haya kilos de carne, el lote tiene que estar pesado al menos dos veces.' ] },
      { t: 'Tu gente y sus accesos', p: [
        'Los usuarios (encargados y operadores) los crea <b>Irrigar</b>. Decinos nombre, celular y en qué estancias trabaja cada uno.',
        'El operador solo ve y carga en las estancias que tiene asignadas; el encargado, lo mismo, con todo lo de gestión.',
        'Si alguien olvidó la contraseña, se la cambia Irrigar.' ] },
      { t: 'Avisos y Asistente', p: [
        'Al tocar el aviso de la mañana se abre el <b>parte de seguimiento</b>, con todos tus pivots.',
        'Activá los <b>avisos en tu celular</b>: tocá tu nombre en el menú, <b>Avisos al celular</b>, <b>Activar en este dispositivo</b>. Te llega el parte de riego de cada pivot, el mantenimiento vencido y las respuestas de Irrigar a tus pedidos de asistencia.',
        'El <b>Asistente IA</b> responde con tus datos: "¿por qué pago tanto de energía?", "¿regué de más?", "¿qué tiene el mejor lote de mi zona que yo no tengo?", "¿qué repuestos faltan?".' ] },
      { t: 'La suscripción', p: [
        'Cada pivot tiene su suscripción anual.',
        'Si vence, seguís viendo todo lo cargado, pero en ese pivot no se puede cargar nada nuevo hasta renovarla con Irrigar.' ] }
    ]
  };

  var CSS = '.mn-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;border:1px solid #D5D9DD;background:#fff;color:#2E3236;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;margin-right:6px}.mn-btn:hover{background:#F2F3F4}' +
    '.mn-fondo{position:fixed;inset:0;background:rgba(20,24,28,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}' +
    '.mn-panel{background:#fff;color:#2E3236;border-radius:14px;max-width:760px;width:100%;padding:20px 24px 24px;box-shadow:0 18px 50px rgba(0,0,0,.25);line-height:1.5;font-size:14px}' +
    '.mn-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #E6E8EA;padding-bottom:10px;margin-bottom:10px}.mn-cab h2{margin:0;font-size:19px;color:#0F3D14}' +
    '.mn-ac{display:flex;gap:6px;align-items:center}.mn-x{border:1px solid #D5D9DD;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;color:#2E3236;font:inherit;font-size:13px;font-weight:600}' +
    '.mn-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.mn-tab{border:1px solid #D5D9DD;background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:#3A3E41}.mn-tab.on{background:#22A93A;border-color:#22A93A;color:#fff}' +
    '.mn-intro{background:#E7F6EA;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:10px}' +
    '.mn-sec{border:1px solid #E6E8EA;border-radius:10px;margin:6px 0;background:#fff}.mn-sec summary{cursor:pointer;padding:10px 12px;font-weight:700;font-size:14.5px;color:#2E3236;list-style-position:inside}.mn-sec[open] summary{color:#178029;border-bottom:1px solid #EEF0F1}' +
    '.mn-sec ol{margin:8px 0 10px 34px;padding:0}.mn-sec li{margin:6px 12px 6px 0}.mn-nota{margin:0 12px 10px;padding:7px 10px;background:#FBF1DF;border-radius:8px;font-size:12.5px;color:#6B4A12}' +
    '.mn-pie{font-size:12px;color:#8C9196;margin-top:12px}@media(max-width:620px){.mn-panel{padding:14px}.mn-cab h2{font-size:17px}}';
  var ICO_LIBRO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H11v17H5.5A2.5 2.5 0 0 0 3 22.5z"/><path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H13v17h5.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>';
  function estilos() { if (document.getElementById('safiaManualCss')) return; var st = document.createElement('style'); st.id = 'safiaManualCss'; st.textContent = CSS; document.head.appendChild(st); }
  function cuerpo(rol, abierto) {
    return '<div class="mn-intro">' + INTRO[rol] + '</div>' + MANUAL[rol].map(function (s, i) {
      return '<details class="mn-sec"' + (abierto || i === 0 ? ' open' : '') + '><summary>' + s.t + '</summary><ol>' + s.p.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>' + (s.n ? '<div class="mn-nota">' + s.n + '</div>' : '') + '</details>';
    }).join('');
  }
  function imprimir(rol) {
    var w = window.open('', '_blank'); if (!w) return;
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>SAFIA · Manual del ' + NOMBRE[rol] + '</title><style>body{font-family:"Plus Jakarta Sans",Arial,sans-serif;color:#2E3236;margin:22px;font-size:13px;line-height:1.45}h1{font-size:20px;margin:4px 0 10px;color:#0F3D14}.mn-intro{background:#E7F6EA;border-radius:8px;padding:9px 11px;margin-bottom:10px}.mn-sec{margin:10px 0;page-break-inside:avoid}.mn-sec summary{font-weight:700;font-size:14.5px;color:#178029;list-style:none;border-bottom:1px solid #D5D9DD;padding-bottom:3px}.mn-sec summary::-webkit-details-marker{display:none}ol{margin:6px 0 6px 22px;padding:0}li{margin:4px 0}.mn-nota{background:#FBF1DF;border-radius:6px;padding:6px 9px;font-size:12px;color:#6B4A12}.pie{font-size:11px;color:#8C9196;margin-top:14px}@media print{body{margin:12mm}}</style></head><body>' +
      '<div style="font-size:11px;color:#178029;font-weight:700;letter-spacing:.06em;">SAFIA · IRRIGAR S.A.</div><h1>Manual del ' + NOMBRE[rol] + '</h1>' + cuerpo(rol, true) + '<div class="pie">SAFIA avisa y muestra el porqué; la decisión final es del productor y de su agrónomo. Impreso el ' + new Date().toLocaleDateString('es-PY') + '.</div></body></html>');
    w.document.close(); setTimeout(function () { w.print(); }, 300);
  }
  function abrir(rolUsuario, rolVer) {
    estilos();
    var roles = VE[rolUsuario] || VE.operador, rol = roles.indexOf(rolVer) >= 0 ? rolVer : roles[0];
    var viejo = document.getElementById('safiaManual'); if (viejo) viejo.remove();
    var f = document.createElement('div'); f.className = 'mn-fondo'; f.id = 'safiaManual';
    f.innerHTML = '<div class="mn-panel" role="dialog" aria-label="Manual de SAFIA"><div class="mn-cab"><h2>Manual del ' + NOMBRE[rol] + '</h2><div class="mn-ac"><button type="button" class="mn-x" data-mn="imp">Imprimir</button><button type="button" class="mn-x" data-mn="x">Cerrar</button></div></div>' +
      (roles.length > 1 ? '<div class="mn-tabs">' + roles.map(function (r) { return '<button type="button" class="mn-tab' + (r === rol ? ' on' : '') + '" data-rol="' + r + '">' + NOMBRE[r] + '</button>'; }).join('') + '</div>' : '') +
      cuerpo(rol, false) +
      '<div class="mn-pie">' + (window.SafiaManualRiego ? '<a href="#" data-mn="riego" style="color:#1565C0;font-weight:700;text-decoration:none;">Cómo funciona el riego</a> explica las franjas del agua y cada mensaje. ' : '') + 'SAFIA avisa y muestra el porqué; la decisión final es del productor y de su agrónomo.</div></div>';
    document.body.appendChild(f);
    var cerrar = function () { f.remove(); document.removeEventListener('keydown', tecla); }, tecla = function (e) { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    f.addEventListener('click', function (e) {
      if (e.target === f) return cerrar();
      var b = e.target.closest ? e.target.closest('[data-mn],[data-rol]') : null; if (!b) return;
      if (b.dataset.rol) return abrir(rolUsuario, b.dataset.rol);
      if (b.dataset.mn === 'x') return cerrar();
      if (b.dataset.mn === 'imp') return imprimir(rol);
      if (b.dataset.mn === 'riego') { e.preventDefault(); cerrar(); SafiaManualRiego.abrir(rol); }
    });
  }
  function montar(op) {
    op = op || {}; estilos();
    var donde = typeof op.en === 'string' ? document.querySelector(op.en) : op.en; if (!donde) return null;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'mn-btn'; b.innerHTML = ICO_LIBRO + 'Manual';
    b.addEventListener('click', function () { abrir(op.rol || 'operador'); });
    donde.insertBefore(b, donde.firstChild);
    return b;
  }
  window.SafiaManual = { montar: montar, abrir: abrir, MANUAL: MANUAL };
})();
