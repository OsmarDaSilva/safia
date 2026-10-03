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
        'En Operador, abajo, están los <b>Últimos eventos</b>: la <b>×</b> borra uno.',
        'Para cambiar la fecha, el lote o una observación, abrí <b>Eventos</b> en el menú y tocá el evento.' ] },
      { t: 'Campañas', p: [
        'En <b>Campañas</b> podés crear una campaña nueva y cargarle datos; lo que no podés es borrar.',
        'Si falta un análisis, una meta o un plan de rotación, pedíselo al encargado o al dueño.' ] },
      { t: 'Avisos en el celular', p: [
        'Abrí SAFIA en el celular y tocá <b>tu nombre</b> (abajo en el menú).',
        'Entrá en <b>Avisos al celular</b> y tocá <b>Activar en este dispositivo</b>. Aceptá el permiso que pide el teléfono.',
        'En <b>iPhone</b> primero hay que instalar SAFIA: botón Compartir y después "Agregar a inicio". Abrila desde ese ícono y recién ahí activá los avisos.' ] },
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
      { t: 'Abrir una campaña', p: [
        'Abrí <b>Campañas</b> y tocá <b>+ Crear nueva campaña</b>. O usá <b>Ficha de campaña</b>, que tiene todo en un solo formulario.',
        'Elegí el lote, el cultivo, la variedad y la <b>fecha de siembra</b>. SAFIA completa sola la fecha estimada de fin de ciclo.',
        'Guardá. Desde ese día SAFIA lleva la cuenta del agua de ese lote.' ],
        n: 'Sin fecha de siembra no hay balance de agua ni recomendación de riego.' },
      { t: 'Cargar el manejo y los insumos', p: [
        'En la campaña tocá <b>Manejo e insumos</b>.',
        'Cargá fertilizantes, semillas, encalado y aplicaciones con su dosis.',
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
        '<b>Vigor satelital</b> (Banco): cómo viene el cultivo visto desde el satélite, comparado con las campañas anteriores del mismo lote.' ] },
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
        'Activá los <b>avisos en tu celular</b>: tocá tu nombre en el menú, <b>Avisos al celular</b>, <b>Activar en este dispositivo</b>. Te llega el parte de riego de cada pivot y el mantenimiento vencido.',
        'El <b>Asistente IA</b> responde con tus datos: "¿por qué pago tanto de energía?", "¿regué de más?", "¿qué tiene el mejor lote de mi zona que yo no tengo?".' ] },
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
