/* SAFIA — Manual operativo del riego (Operador, Encargado, Propietario)
   -------------------------------------------------------------------
   Un botón "Cómo funciona el riego" en la cabecera abre un manual corto y didáctico:
   qué mide SAFIA, las 5 franjas (los mismos nombres que FieldNET), por qué el pivot se
   prende antes del estrés, de dónde sale el cálculo, qué significa cada mensaje y la
   rutina de cada rol. Solo explica: no calcula nada ni cambia datos.
   Uso: SafiaManualRiego.montar({ rol: 'operador' | 'encargado' | 'propietario', en: '.topbar-derecha' }) */
(function () {
  'use strict';
  var COL = { estres: '#C0392B', bajo: '#C58F00', optimo: '#178029', alto: '#2BA9D6', exceso: '#2E72C8' };
  var ICO = {
    libro: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/>',
    cerrar: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function svg(p, t) { return '<svg viewBox="0 0 24 24" width="' + (t || 18) + '" height="' + (t || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  function chip(c, t) { return '<span class="mr-chip" style="background:' + c + '1f;color:' + c + ';border-color:' + c + '55;">' + t + '</span>'; }

  // Dibujo didáctico: el agua del suelo baja día a día; el pivot se prende en "arrancar" para que el último sector no llegue a "estrés"
  function dibujo() {
    var AMA = '#FFCA1A';
    var W = 640, H = 210, x0 = 44, x1 = 620, yv = function (p) { return 18 + (100 - p) / 100 * 150; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mr-svg" role="img" aria-label="Cómo baja el agua del suelo y cuándo arrancar el pivot">';
    [[0, 50, COL.estres], [50, 75, AMA], [75, 90, COL.optimo], [90, 100, COL.alto]].forEach(function (b) { s += '<rect x="' + x0 + '" y="' + yv(b[1]) + '" width="' + (x1 - x0) + '" height="' + (yv(b[0]) - yv(b[1])) + '" fill="' + b[2] + '" opacity="0.09"/>'; });
    [[100, 'capacidad de campo (lleno)', COL.exceso], [75, 'arrancar el pivot', COL.bajo], [50, 'estrés: se pierde rinde', COL.estres]].forEach(function (l) {
      s += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + yv(l[0]) + '" y2="' + yv(l[0]) + '" stroke="' + l[2] + '" stroke-dasharray="5 4"/><text x="' + (x0 + 6) + '" y="' + (yv(l[0]) - 4) + '" font-size="11" fill="' + l[2] + '">' + l[1] + ' · ' + l[0] + ' %</text>';
    });
    // curva: sin riego (punteada) y con el pivot prendido a tiempo (sólida)
    var dias = 9, xd = function (d) { return x0 + 20 + d / dias * (x1 - x0 - 40); }, sin = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50], con = [95, 90, 85, 80, 75, 76, 78, 82, 87, 92];
    s += '<path d="M' + sin.map(function (p, d) { return xd(d).toFixed(0) + ' ' + yv(p).toFixed(0); }).join(' L') + '" fill="none" stroke="' + COL.estres + '" stroke-width="2" stroke-dasharray="5 4"/>';
    s += '<path d="M' + con.map(function (p, d) { return xd(d).toFixed(0) + ' ' + yv(p).toFixed(0); }).join(' L') + '" fill="none" stroke="' + COL.exceso + '" stroke-width="2.6"/>';
    s += '<circle cx="' + xd(4) + '" cy="' + yv(75) + '" r="5" fill="#fff" stroke="#2E3236" stroke-width="2"/><text x="' + xd(4) + '" y="' + (yv(75) + 22) + '" font-size="11" text-anchor="middle" fill="#2E3236" font-weight="700">se prende el pivot</text>';
    s += '<line x1="' + xd(4) + '" x2="' + xd(8.6) + '" y1="' + (H - 18) + '" y2="' + (H - 18) + '" stroke="#2E3236" stroke-width="1.4" marker-end="url(#mrF)"/><text x="' + ((xd(4) + xd(8.6)) / 2) + '" y="' + (H - 24) + '" font-size="11" text-anchor="middle" fill="#2E3236">la vuelta del pivot tarda ~4,6 días</text>';
    s += '<text x="' + xd(7.4) + '" y="' + yv(27) + '" font-size="11" text-anchor="middle" fill="' + COL.estres + '">sin riego, llega al estrés el día 9</text>';   // debajo de la curva, para que no la pise
    s += '<defs><marker id="mrF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#2E3236"/></marker></defs></svg>';
    return s + '<div class="mr-pie">Ejemplo: soja en desarrollo. Línea azul: el primer sector que moja el pivot. Línea roja punteada: el último sector del círculo, que sigue bajando hasta que le llega el agua; con el pivot prendido al 75 % la recibe justo antes del estrés. Si se espera un día más, entra en estrés antes de que le llegue el agua.</div>';
  }

  var RUTINA = {
    operador: ['<b>Cada mañana</b>, abrí <b>Operador</b>, elegí el pivot y leé el mensaje grande de la ficha de agua. Ese es el trabajo del día.',
      '<b>Cargá cada riego</b> apenas termina la vuelta: fecha y milímetros aplicados (botón Riego). Si no se carga, SAFIA cree que el suelo está más seco y va a pedir riego de más.',
      '<b>Cargá la lluvia del pluviómetro</b> del campo (botón Lluvia): la medida en el lugar manda sobre la del satélite. Si no hay pluviómetro, no hace falta cargar nada: SAFIA usa sola la del satélite (se ve en Eventos como "Clima · automática").',
      '<b>Horímetro</b> del pivot y de la bomba, para el mantenimiento.',
      '<b>Una vez por semana</b>, sacá tierra con la pala a 20–30 cm. Si no coincide con lo que dice SAFIA (por ejemplo, SAFIA dice 40 % y el suelo está húmedo), avisale al encargado: seguramente falta cargar un riego o una lluvia.'],
    encargado: ['<b>Tabla de lotes:</b> ya viene ordenada por urgencia. Mirá la columna <b>Agua útil</b>: primero atendé los rojos (estrés), después los amarillos (bajo: arrancar el pivot).',
      '<b>Planificá la semana</b> con las fechas <b>"Arrancar el"</b> de cada pivot: si varios arrancan el mismo día y comparten bomba o energía, adelantá el que tenga la vuelta más larga.',
      '<b>"El equipo no alcanza la demanda"</b>: ese pivot tiene que girar sin parar en floración y llenado. Si igual no alcanza, se revisa la lámina, el caudal o se prioriza ese lote.',
      '<b>Controlá la carga:</b> que cada operador cargue riegos y lluvias todos los días (columna Última carga). Sin carga, la ficha de agua pierde precisión.',
      '<b>Consultá al Asistente IA</b> "¿Tengo que regar hoy?" o "¿Cómo viene mi cosecha?": junta todo sin buscar pantalla por pantalla.'],
    propietario: ['<b>Vista de todos los campos:</b> el color de cada pivot resume su estado (rojo = en estrés, amarillo = arrancar el pivot, verde = bien, azul = no regar porque viene lluvia).',
      '<b>Qué mirar:</b> que no haya rojos. Un rojo significa rinde que ya se está perdiendo; el Banco (Agua por etapa) dice cuánto.',
      '<b>Equipos que no alcanzan:</b> si un pivot aparece seguido con "el equipo no alcanza la demanda", es una decisión de inversión (más caudal, más lámina o menos superficie por equipo).',
      '<b>Asistente IA:</b> preguntá "¿Cómo viene mi cosecha?" para tener agua, satélite, nutrición y meta en una sola respuesta.']
  };

  function contenido(rol) {
    var h = '';
    h += '<h3>1. La idea</h3><p>SAFIA lleva la cuenta del agua del suelo como una <b>cuenta de banco</b>: entra la lluvia y el riego, sale lo que consume el cultivo. El número grande, <b>% de agua útil</b>, dice cuánto queda en la zona de las raíces: 100 % es lleno (capacidad de campo) y 0 % es seco (punto de marchitez). La cuenta <b>arranca el día de la siembra</b> que se cargó en la campaña y sigue todos los días hasta hoy.</p>';
    h += '<h3>2. Las 5 franjas (los mismos nombres que FieldNET)</h3><table class="mr-t"><tbody>' +
      '<tr><td>' + chip(COL.exceso, 'Exceso') + '</td><td>Llovió o se regó de más: el agua se va por debajo de las raíces y se lleva nutrientes.</td><td>No regar.</td></tr>' +
      '<tr><td>' + chip(COL.alto, 'Alto') + '</td><td>Casi lleno. Poco lugar para guardar una lluvia.</td><td>No regar; si viene lluvia, aprovecharla.</td></tr>' +
      '<tr><td>' + chip(COL.optimo, 'Óptimo') + '</td><td>El cultivo toma agua sin esfuerzo.</td><td>Mirar la fecha de arranque.</td></tr>' +
      '<tr><td>' + chip(COL.bajo, 'Bajo: arrancar el pivot') + '</td><td>Todavía no hay estrés, pero si no se prende ahora, el último sector llega al estrés antes de que le llegue el agua.</td><td><b>Prender el pivot.</b></td></tr>' +
      '<tr><td>' + chip(COL.estres, 'Estrés') + '</td><td>La planta cierra estomas y se pierde rinde (más en floración y llenado).</td><td><b>Regar ya.</b></td></tr>' +
      '</tbody></table>';
    h += '<h3>3. Por qué el pivot se prende antes del estrés</h3><p>Un pivot no moja todo el lote a la vez: tarda días en dar la vuelta. SAFIA calcula para cada pivot <b>cuánto va a consumir el cultivo mientras el pivot da la vuelta</b> y lo suma al punto de estrés. Así sale la raya <b>"arrancar el pivot"</b>. Es la misma idea de FieldNET Advisor: <i>arrancar = cuándo vence − lo que tarda la vuelta</i>.</p>' + dibujo() +
      '<p class="mr-nota">La idea es <b>mantener el agua en el verde</b>: el pivot se prende apenas el suelo baja del <b>75 %</b> (nunca más abajo), así el agua le llega al último sector antes de que entre en estrés. El estrés (rojo) empieza en el <b>50 %</b>: desde la floración la soja no debe gastar más de la mitad del agua útil (SDSU Extension). Con mucho consumo y vueltas largas la raya de arranque sube sola por encima del 75 %, y en pico aparece "mantener el pivot girando".</p>' +
      '<p class="mr-nota">La raya de arranque se mueve sola: sube cuando hace calor y el cultivo consume mucho, y sube si el pivot es lento. La lluvia del pronóstico no baja la raya (por si no llega): corre la fecha de arranque para más adelante y, si es mucha, aparece "No regar: viene lluvia".</p>';
    h += '<h3>4. De dónde sale el cálculo</h3><div class="mr-g">' +
      '<div><b>Clima</b>La lluvia entra sola, sin cargar nada: primero la <b>estación del campo</b> si hay, después el <b>pluviómetro cargado</b> y, si no hay ninguno, el <b>satélite (CHIRPS)</b>. Evaporación del día (Penman-Monteith FAO-56) y pronóstico de 16 días.</div>' +
      '<div><b>Cultivo</b>Cuánto consume según su etapa (curva FAO-56), <b>corregido con el satélite</b> Sentinel-2: si el cultivo cubre menos o más de lo normal, consume menos o más.</div>' +
      '<div><b>Suelo</b>Cuánta agua guarda, según el análisis de suelo (arcilla) o el tipo de suelo del campo. La raíz crece con los días y aprovecha más perfil. Con sonda de humedad, manda lo medido.</div>' +
      '<div><b>Equipo</b>Capacidad del pivot (mm por día), eficiencia (85 %: de cada 100 mm que tira el pivot, 85 llegan a la raíz) y los riegos cargados. Con eso sale cuánto tarda la vuelta.</div></div>';
    h += '<h3>5. Qué significa cada mensaje</h3><table class="mr-t"><tbody>' +
      '<tr><td><b>No regar: viene lluvia</b></td><td>Se esperan 15 mm o más en los próximos 5 días (igual en todas las pantallas). Volver a mirar después de la lluvia.</td></tr>' +
      '<tr><td><b>Arrancar el pivot hoy: X mm</b></td><td>Llegó a la raya de arranque. Prenderlo hoy con esa lámina: es la que tiene que <b>aplicar el pivot</b> (ya incluye la eficiencia).</td></tr>' +
      '<tr><td><b>Arrancar el pivot el (día)</b></td><td>Todavía no, pero ese día toca. Sirve para planificar la semana.</td></tr>' +
      '<tr><td><b>Sin riego entra en estrés el (día)</b></td><td>La fecha límite si nadie riega (como el "vence el" de FieldNET).</td></tr>' +
      '<tr><td><b>Mantener el pivot girando</b></td><td>El cultivo consume más de lo que el pivot puede poner por día: no pararlo.</td></tr>' +
      '<tr><td><b>Regar ya: el cultivo está en estrés</b></td><td>Ya se está perdiendo rinde. Regar aunque se anuncie lluvia.</td></tr>' +
      '<tr><td><b>Lote de secano</b></td><td>No se riega: SAFIA sigue la lluvia y avisa el estrés (por debajo del 50 %). El balance completo está en el Banco → Agua.</td></tr>' +
      '</tbody></table>';
    h += '<h3>6. Qué te toca a vos (' + (rol === 'encargado' ? 'Encargado' : rol === 'propietario' ? 'Propietario' : 'Operador') + ')</h3><ol class="mr-ol">' + (RUTINA[rol] || RUTINA.operador).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>';
    h += '<h3>7. Lo que hay que saber</h3><ul class="mr-ol"><li>Es un <b>cálculo</b>, no una medición: una sonda de humedad lo reemplaza cuando existe.</li><li>El <b>riego</b> que no se carga no existe para SAFIA: sin riegos cargados el suelo aparece más seco de lo real. La lluvia entra sola por el satélite, pero el pluviómetro del campo es más preciso.</li><li><b>Lámina mínima de día</b> (criterio de Irrigar): de 9 a 18 h el pivot no aplica menos de <b>10 mm</b> por vuelta. Las láminas chicas (3 a 5 mm) se evaporan antes de entrar al suelo y queman hojas, más con el cultivo chico. Con más de 30 °C, de día entre <b>10 y 14 mm</b>. De noche (18 a 9 h) la lámina puede ser menor. Se puede regar de día y de noche: lo que cambia es la lámina (la velocidad) de las pasadas de día. SAFIA lo traduce a vueltas y % de velocidad con los datos del equipo.</li><li><b>Horario de punta de la ANDE</b>: de 17 a 22 h la energía es más cara (en Paraguay hay dos precios: punta y el resto del día). Conviene parar el pivot en esas horas: quedan 19 horas de riego por día. Si el cultivo está en pico de consumo y el equipo no alcanza con 19 horas, SAFIA avisa que hay que regar también en punta: primero el cultivo, después la factura.</li><li>La decisión final es del productor y del agrónomo; SAFIA avisa a tiempo y muestra el porqué.</li></ul>';
    h += '<div class="mr-fuentes">Fuentes: FAO-56 (Allen et al. 1998) y FAO-56 dual (Allen et al. 2005); Rhoads & Yonts, National Corn Handbook NCH-20, "Irrigation Scheduling for Corn" (con pivot, arrancar cuando va la mitad del agotamiento permitido, porque la vuelta tarda días); Hay, Kjaersgaard y Trooien (2013), "Soybean Irrigation", cap. 49 de iGrow Soybeans: Best Management Practices, SDSU Extension (soja: no pasar del 50 % de agotamiento desde floración; ejemplo con pivot de 4 días por vuelta y 85 % de eficiencia); Lindsay FieldNET Advisor (folletos 2017 y 2024).</div>';
    return h;
  }

  var CSS = '.mr-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;border:1px solid #CDE9D3;background:#E9F6EC;color:#0F5A1C;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}.mr-btn:hover{background:#DCF0E1}' +
    '.mr-fondo{position:fixed;inset:0;background:rgba(20,24,28,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}' +
    '.mr-panel{background:#fff;color:#2E3236;border-radius:14px;max-width:780px;width:100%;padding:20px 24px 24px;box-shadow:0 18px 50px rgba(0,0,0,.25);line-height:1.55;font-size:14px}' +
    '.mr-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #E6E8EA;padding-bottom:10px;margin-bottom:6px}.mr-cab h2{margin:0;font-size:19px;color:#0F3D14}.mr-x{border:0;background:#F2F3F4;border-radius:8px;padding:6px;cursor:pointer;color:#2E3236}' +
    '.mr-panel h3{font-size:15px;margin:18px 0 6px;color:#178029}.mr-panel p{margin:6px 0}.mr-t{width:100%;border-collapse:collapse;font-size:13px}.mr-t td{padding:7px 6px;border-bottom:1px solid #EEF0F1;vertical-align:top}.mr-t td:first-child{white-space:nowrap;width:1%}' +
    '.mr-chip{display:inline-block;border:1px solid;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700}.mr-svg{width:100%;height:auto;display:block;margin:8px 0 2px;background:#FAFBFB;border-radius:10px}.mr-pie,.mr-nota{font-size:12px;color:#5B6167}' +
    '.mr-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mr-g div{background:#F7F8F9;border-radius:10px;padding:9px 11px;font-size:13px}.mr-g div>b:first-child{display:block;color:#0F3D14;margin-bottom:2px}.mr-ol{margin:6px 0 0 18px;padding:0}.mr-ol li{margin:5px 0}' +
    '.mr-fuentes{font-size:11px;color:#8C9196;margin-top:16px;border-top:1px solid #EEF0F1;padding-top:8px}@media(max-width:620px){.mr-g{grid-template-columns:1fr}.mr-panel{padding:16px}.mr-t td:first-child{white-space:normal}}';
  function estilos() { if (document.getElementById('safiaManualRiegoCss')) return; var st = document.createElement('style'); st.id = 'safiaManualRiegoCss'; st.textContent = CSS; document.head.appendChild(st); }

  function abrir(rol) {
    estilos();
    var f = document.createElement('div'); f.className = 'mr-fondo'; f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true'); f.setAttribute('aria-label', 'Cómo funciona el riego');
    f.innerHTML = '<div class="mr-panel"><div class="mr-cab"><h2>Cómo funciona el riego en SAFIA</h2><button type="button" class="mr-x" aria-label="Cerrar">' + svg(ICO.cerrar, 20) + '</button></div>' + contenido(rol) + '</div>';
    var cerrar = function () { f.remove(); document.removeEventListener('keydown', esc); }, esc = function (e) { if (e.key === 'Escape') cerrar(); };
    f.addEventListener('click', function (e) { if (e.target === f) cerrar(); });
    f.querySelector('.mr-x').addEventListener('click', cerrar);
    document.addEventListener('keydown', esc);
    document.body.appendChild(f);
  }
  function montar(op) {
    op = op || {}; estilos();
    var donde = typeof op.en === 'string' ? document.querySelector(op.en) : op.en;
    if (!donde) return null;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'mr-btn'; b.innerHTML = svg(ICO.libro, 16) + 'Cómo funciona el riego';
    b.addEventListener('click', function () { abrir(op.rol || 'operador'); });
    donde.insertBefore(b, donde.firstChild);
    return b;
  }
  window.SafiaManualRiego = { montar: montar, abrir: abrir, contenido: contenido };
})();
