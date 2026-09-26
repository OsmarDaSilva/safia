/* ============================================================
   SAFIA · safia-mantenimiento.js
   Un solo lugar para saber cómo está el mantenimiento de un equipo y
   para que el OPERADOR o el ENCARGADO registren desde el campo:
     - la lectura del horímetro ("el pivot marca 1.240 h")
     - una tarea del plan hecha hoy ("engrasé el pivote central")
   Por qué eventos: el plan de mantenimiento vive en el equipo
   (Equipos y lotes, lo carga Irrigar o el cliente), pero el operador
   solo puede escribir eventos, no equipos. Entonces lo que hace el
   operador queda como eventos del lote:
     { tipo: 'horimetro',     equipoId, fecha, cantidad: horas }
     { tipo: 'mantenimiento', equipoId, fecha, tareaId, tarea, componente, horasEquipo, observaciones }
   y el estado se calcula juntando el plan con esos eventos.
   Uso:
     SafiaMant.estado(equipo)            → { sinPlan, horas, fuenteHoras, tareas[], vencidas[], proximas[] }
     SafiaMant.html(equipo, { compacta })→ tarjeta con horímetro, tareas y botones "Hecho hoy"
     SafiaMant.registrarHoras / registrarHecha
   ============================================================ */
(function () {
  'use strict';
  function leer(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d }); }
  function hoy() { return window.SafiaBalance && SafiaBalance.hoyLocal ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function fmtF(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function quien() { try { var u = JSON.parse(localStorage.getItem('safia_usuario') || 'null'); return u && u.nombre ? u.nombre : 'manual'; } catch (e) { return 'manual'; } }
  var COL = { ok: '#178029', proximo: '#B8731A', vencido: '#C0392B', gris: '#8C9196', completar: '#8C9196' };

  /* ---------- catálogo recomendado para pivot central ----------
     Frecuencia "cada": { horas, vueltas, dias } → vence con lo que ocurra primero.
     "Por temporada" = 182 días: en Paraguay el pivot trabaja dos cultivos por año (soja + maíz). Se puede editar en Equipos.
     Fuentes (sin inventar números):
       [V] Valley, Center Pivot 7000/8000/8120 Series Owner's Manual: reductoras de rueda pág. 64 y 66, motorreductor central
           pág. 65 y 67, cubos remolcables pág. 68, swivel del pivote pág. 70, cronograma pre/post temporada pág. 92–95.
       [LP] Lindsay (Zimmatic), Programa Anual de Mantenimiento Recomendado (se usa tambien para marcas no Valley).
       Bombas: IMBIL BEW (manual ES), KSB Meganorm A2742.8P, HIGRA anfibias REV22; Helibombas no publica intervalos.
       [F] Placa y manual del fabricante del equipo (bomba, motor, corner): el intervalo lo completa el usuario. */
  var TEMPORADA = 182, ANIO = 365;
  var FUENTE_V = 'Valley, manual del dueño del pivot central 7000/8000/8120', FUENTE_F = 'placa y manual del fabricante';
  var FUENTE_LP = 'Lindsay (Zimmatic), Programa Anual de Mantenimiento Recomendado (LI-GEN PARTS MAINT SCHED, 2010)';
  var FUENTE_IMBIL = 'IMBIL, Manual de instalación, operación y mantenimiento bomba BEW (supervisión periódica, pág. 13; mantenimiento del mancal)';
  var FUENTE_KSB = 'KSB, Manual de servicio Meganorm A2742.8P (supervisión 10.3; intervalos de lubricación 11.2)';
  var FUENTE_HIGRA = 'HIGRA, Manual técnico de bombas anfibias REV22 (2.5.1 fluido interno del motor)';
  function catalogoPara(eq) {
    var dt = (eq && eq.datosTecnicos) || {}, marca = String((eq && (eq.marca || dt.marca)) || '').toLowerCase();
    var esValley = /valley|valmont/.test(marca);
    var tieneCorner = !!(dt.corner && !/^(no|0|false)$/i.test(String(dt.corner).trim()));
    var c = esValley ? catalogoValley() : catalogoLindsay();
    c.push({ k: 'canon', componente: 'Cañón final', tarea: 'Revisar rodamiento y freno del cañón final', cada: { dias: TEMPORADA }, detalle: 'Si el pivot no tiene cañón, borrar esta tarea.', fuente: FUENTE_V + ', pág. 94' });
    if (tieneCorner) {
      c.push({ k: 'corner_engrase', componente: 'Corner', tarea: 'Engrasar la articulación y el eje del corner', cada: {}, detalle: 'Completar el intervalo con el manual del corner de la marca.', fuente: FUENTE_F });
      c.push({ k: 'corner_reductora', componente: 'Corner', tarea: 'Aceite de la reductora de la torre de dirección del corner', cada: {}, detalle: 'Completar con el manual del corner.', fuente: FUENTE_F });
    }
    return c.concat(catalogoBomba(dt));
  }
  // Pivots Lindsay/Zimmatic (y cualquier otra marca: los distribuidores Zimmatic atienden cualquier pivot)
  function catalogoLindsay() {
    var A = ANIO, T = TEMPORADA, F = FUENTE_LP;
    return [
      { k: 'swivel', componente: 'Centro del pivote', tarea: 'Engrasar el punto pivote', cada: { horas: 1000, dias: A }, detalle: 'Una vez al año o cada 1.000 h, lo que ocurra primero.', fuente: F },
      { k: 'brazo_alineacion', componente: 'Centro del pivote', tarea: 'Engrasar el brazo de alineación', cada: { dias: T }, detalle: 'Antes de cada temporada de riego.', fuente: F },
      { k: 'colector', componente: 'Centro del pivote', tarea: 'Revisar el anillo colector (polvo o corrosión)', cada: { dias: A }, detalle: 'Al inicio de la temporada de riego.', fuente: F },
      { k: 'panel', componente: 'Centro del pivote', tarea: 'Revisar el panel principal (ratones o nidos de insectos)', cada: { dias: A }, detalle: 'Eliminarlos si hay.', fuente: F },
      { k: 'tierra', componente: 'Centro del pivote', tarea: 'Revisar el cable de cobre desnudo #6 de puesta a tierra', cada: { dias: A }, detalle: 'Asegurar buena conexión a tierra.', fuente: F },
      { k: 'sellos', componente: 'Torres', tarea: 'Inspeccionar sellos de motores y diferenciales', cada: { dias: A }, detalle: 'Buscar desgaste o fugas.', fuente: F },
      { k: 'nivel_aceite', componente: 'Torres', tarea: 'Verificar nivel de aceite de diferenciales y cajas de motores centrales', cada: { dias: A }, detalle: '', fuente: F },
      { k: 'aceite_ruedas', componente: 'Torres', tarea: 'Cambiar aceite de diferenciales y cajas de motores centrales', cada: { horas: 4000, dias: 4 * A }, detalle: 'Cada 4.000 h o 4 años, lo que ocurra primero.', fuente: F },
      { k: 'drenar_ruedas', componente: 'Torres', tarea: 'Drenar agua condensada o aceite contaminado de diferenciales y caja del motor central', cada: { dias: A }, detalle: '', fuente: F },
      { k: 'neumaticos', componente: 'Torres', tarea: 'Verificar presión de llantas según tabla', cada: { dias: A }, detalle: 'Nunca menos de 16 PSI.', fuente: F },
      { k: 'cables_motores', componente: 'Torres', tarea: 'Revisar los cables que llegan a los motores', cada: { dias: A }, detalle: '', fuente: F },
      { k: 'cajas_torre', componente: 'Torres', tarea: 'Revisar cajas de control de torre y sus protectores', cada: { dias: A }, detalle: 'Mantener los pasadores puestos para un sello adecuado.', fuente: F },
      { k: 'tuercas', componente: 'Estructura', tarea: 'Verificar que no falten tuercas o tornillos', cada: { dias: T }, detalle: 'Dos veces al año.', fuente: F },
      { k: 'estructura', componente: 'Estructura', tarea: 'Apretar tornillos y tuercas flojos de torres y tramos', cada: { dias: A }, detalle: 'Verificar la tensión de tornillos y tuercas.', fuente: F },
      { k: 'cable_tramo', componente: 'Estructura', tarea: 'Revisar que el cable eléctrico sobre el tramo esté bien asegurado', cada: { dias: A }, detalle: '', fuente: F },
      { k: 'boquillas', componente: 'Aspersores', tarea: 'Revisar el paquete de aspersión', cada: { dias: A }, detalle: 'Aspersores o reguladores deteriorados o faltantes.', fuente: F },
      { k: 'trampa_arena', componente: 'Aspersores', tarea: 'Retirar la trampa de arena de la última torre y enjuagar el pivote', cada: { dias: T }, detalle: 'Al final y al principio de la temporada, por varios minutos.', fuente: F },
      { k: 'drenado_final', componente: 'Estructura', tarea: 'Drenar todo el equipo, incluida la tubería del elevador', cada: { dias: A }, detalle: 'Al final de la temporada de riego. Estacionar el sistema en terreno plano o calle de servicio.', fuente: F }
    ];
  }
  // Pivots Valley: manual del dueño 7000/8000/8120
  function catalogoValley() {
    var A = ANIO, T = TEMPORADA;
    return [
      { k: 'swivel', componente: 'Centro del pivote', tarea: 'Engrasar el swivel del pivote', cada: { vueltas: 6 }, detalle: 'Cada 5 a 7 vueltas, grasa de litio resistente al agua.', fuente: FUENTE_V + ', pág. 70' },
      { k: 'colector', componente: 'Centro del pivote', tarea: 'Revisar drenaje de la base del colector (anillos)', cada: { dias: T }, detalle: 'Pre y post temporada.', fuente: FUENTE_V + ', pág. 93' },
      { k: 'contactores', componente: 'Centro del pivote', tarea: 'Revisar contactores del pivote (arco, picaduras)', cada: { dias: T }, detalle: 'Con el seccionador apagado.', fuente: FUENTE_V + ', pág. 93' },
      { k: 'aceite_ruedas', componente: 'Torres', tarea: 'Cambiar aceite de las reductoras de rueda', cada: { horas: 3000, dias: 3 * A }, detalle: 'Primer cambio tras la primera temporada; después cada 3 años o 3.000 h. Unos 3,7 L por reductora.', fuente: FUENTE_V + ', pág. 64 y 66' },
      { k: 'drenar_ruedas', componente: 'Torres', tarea: 'Drenar condensación de reductoras de rueda y completar nivel', cada: { dias: T }, detalle: 'Al final de cada temporada.', fuente: FUENTE_V + ', pág. 64' },
      { k: 'aceite_central', componente: 'Torres', tarea: 'Cambiar aceite del motorreductor central de cada torre', cada: { dias: T }, detalle: 'Después de cada temporada. Unos 1,3 L.', fuente: FUENTE_V + ', pág. 65 y 67' },
      { k: 'neumaticos', componente: 'Torres', tarea: 'Revisar presión de neumáticos', cada: { dias: 90 }, detalle: 'Pretemporada, primera pasada y mitad de temporada.', fuente: FUENTE_V + ', pág. 93–94' },
      { k: 'tuercas', componente: 'Torres', tarea: 'Torque de tuercas de ruedas (169 N·m)', cada: { dias: A }, detalle: 'Anual, en pretemporada.', fuente: FUENTE_V + ', pág. 68 y 94' },
      { k: 'estructura', componente: 'Estructura', tarea: 'Revisar pernos, bridas y cables de los tramos', cada: { dias: T }, detalle: '', fuente: FUENTE_V + ', pág. 92' },
      { k: 'alineacion', componente: 'Estructura', tarea: 'Alinear y probar interruptores de seguridad', cada: { dias: A }, detalle: 'Lo hace el distribuidor.', fuente: FUENTE_V + ', pág. 94' },
      { k: 'boquillas', componente: 'Aspersores', tarea: 'Revisar boquillas tapadas, faltantes o gastadas', cada: { dias: 90 }, detalle: '', fuente: FUENTE_V + ', pág. 93' },
      { k: 'trampa_arena', componente: 'Aspersores', tarea: 'Revisar y limpiar la trampa de arena; lavar la máquina', cada: { dias: T }, detalle: 'Pre y post temporada.', fuente: FUENTE_V + ', pág. 93–94' }
    ];
  }
  // Bomba según marca y modelo cargados en la ficha del pivot
  function catalogoBomba(dt) {
    var marca = String(dt['bomba-marca'] || '').toLowerCase(), modelo = String(dt['bomba-modelo'] || '').toLowerCase(), todo = marca + ' ' + modelo, A = ANIO;
    var motor = { k: 'motor', componente: 'Motor', tarea: 'Mantenimiento del motor de la bomba (rodamientos o aceite)', cada: {}, detalle: 'Eléctrico: relubricación según la placa del motor. Diésel: cambio de aceite según su manual.', fuente: FUENTE_F };
    if (/imbil/.test(todo) && /bew/.test(todo)) return [
      { k: 'bomba_semanal', componente: 'Bomba', tarea: 'Revisión semanal: vibraciones, ruidos, goteo de empaquetadura, presión de succión y punto de operación', cada: { dias: 7 }, detalle: 'Goteo de la empaquetadura entre 10 y 20 cm³ por minuto. Revisar también el volumen de grasa, la corriente del motor y la tensión de la red.', fuente: FUENTE_IMBIL },
      { k: 'bomba_temp', componente: 'Bomba', tarea: 'Temperatura de los mancales', cada: { dias: 30 }, detalle: 'Mensual. No debe superar 45 °C por encima de la temperatura ambiente.', fuente: FUENTE_IMBIL },
      { k: 'bomba_engrase', componente: 'Bomba', tarea: 'Relubricar los mancales con grasa de litio', cada: { dias: 90 }, detalle: 'Cada 3 meses (Shell Alvania R2, Mobil Grease 77, Lubrax GM A2 u otra de la tabla). Lavar los mancales cada 2 años.', fuente: FUENTE_IMBIL },
      { k: 'bomba_semestral', componente: 'Bomba', tarea: 'Alineación moto-bomba, tornillos de fijación, acoplamiento y dispositivo de caudal mínimo', cada: { dias: 182 }, detalle: 'Semestral. Cambiar la empaquetadura si el aprieta-empaquetadura ya se ajustó más de 8 mm y sigue perdiendo.', fuente: FUENTE_IMBIL },
      { k: 'bomba_lavado', componente: 'Bomba', tarea: 'Lavar los mancales y renovar la grasa', cada: { dias: 2 * A }, detalle: 'Cada 2 años.', fuente: FUENTE_IMBIL },
      { k: 'bomba_anual', componente: 'Bomba', tarea: 'Desmontar e inspeccionar la bomba', cada: { dias: A }, detalle: 'Mancales, rodamientos, retenes, o-rings, juntas, rotores, carcasa y acoplamiento. Con agua limpia y buenas condiciones puede ser cada 2 años. Torque de tirantes BEW 150: 35 kgf·m.', fuente: FUENTE_IMBIL },
      motor
    ];
    if (/ksb/.test(todo) && /meganorm/.test(todo)) return [
      { k: 'bomba_semanal', componente: 'Bomba', tarea: 'Revisión semanal: punto de operación, presión de succión, vibraciones, ruidos, nivel de aceite y gaxetas', cada: { dias: 7 }, detalle: 'Incluye corriente del motor y tensión de la red.', fuente: FUENTE_KSB },
      { k: 'bomba_temp', componente: 'Bomba', tarea: 'Temperatura de los mancales', cada: { dias: 30 }, detalle: 'Mensual; revisar también el intervalo de cambio de aceite.', fuente: FUENTE_KSB },
      { k: 'bomba_aceite', componente: 'Bomba', tarea: 'Cambiar aceite del soporte de mancales', cada: { horas: 8000, dias: A }, detalle: 'Primer cambio a las 200–300 h y el segundo a las 1.500–2.000 h; después cada 8.000 h o una vez al año, lo primero. Lavar los mancales cada 2 años como máximo.', fuente: FUENTE_KSB },
      { k: 'bomba_semestral', componente: 'Bomba', tarea: 'Tornillos de fijación, alineación, acoplamiento, gaxetas y sello mecánico', cada: { dias: 182 }, detalle: 'Semestral.', fuente: FUENTE_KSB },
      { k: 'bomba_anual', componente: 'Bomba', tarea: 'Desmontar e inspeccionar la bomba', cada: { dias: A }, detalle: 'Mancales, retenes, juntas, o-rings, rotores, cuerpo espiral y acoplamiento.', fuente: FUENTE_KSB },
      motor
    ];
    if (/higra/.test(todo)) return [
      { k: 'bomba_preventivo', componente: 'Bomba', tarea: 'Mantenimiento preventivo de la bomba anfibia', cada: { dias: 2 * A }, detalle: 'Con agua de menos de 2 % de sólidos, después de 24 meses de operación; antes si baja el caudal o la presión. El motor va lleno de agua limpia: verificar el nivel por el filtro ecualizador al instalar o reinstalar.', fuente: FUENTE_HIGRA }
    ];
    var nombre = dt['bomba-marca'] ? dt['bomba-marca'] + (dt['bomba-modelo'] ? ' ' + dt['bomba-modelo'] : '') : 'la bomba';
    var detalleMarca = /helibomba|heli/.test(todo) ? 'Helibombas no publica intervalos: completar con el manual del modelo.' : /imbil|ksb/.test(todo) ? 'Cargá el modelo de la bomba en la ficha del pivot (por ejemplo BEW 150/3 o Meganorm) para usar el plan del fabricante.' : 'Completar con la placa y el manual de ' + nombre + '.';
    return [
      { k: 'bomba_engrase', componente: 'Bomba', tarea: 'Lubricar los rodamientos de ' + nombre, cada: {}, detalle: detalleMarca, fuente: FUENTE_F },
      { k: 'bomba_anual', componente: 'Bomba', tarea: 'Revisión de ' + nombre + ' (sello o empaquetadura, alineación, vibraciones)', cada: {}, detalle: detalleMarca, fuente: FUENTE_F },
      motor
    ];
  }
  // Plan listo para guardar en el equipo, a partir del catálogo
  function planDesdeCatalogo(eq) {
    var ahora = hoy(), base = eq ? estado(Object.assign({}, eq, { planMantenimiento: [] })).horas : 0;   // cuenta desde las horas de hoy, no desde 0
    return catalogoPara(eq).map(function (t, i) { return { id: Date.now() + i + Math.random(), k: t.k, componente: t.componente, tarea: t.tarea, cada: t.cada, intervalo: t.cada.horas || null, detalle: t.detalle, fuente: t.fuente, creado: ahora, ultimasHorasHechas: base, ultimaFechaHecha: null, historial: [] }; });
  }
  // Suma al plan existente las tareas del catálogo que faltan (por k o por nombre), sin tocar las que ya tienen historial
  function completarPlan(eq) {
    var nuevas = planDesdeCatalogo(eq), claves = nuevas.map(function (n) { return n.k; }), quitadas = 0;
    // tareas del catálogo anterior que no son de esta marca o bomba: se sacan si nunca se registraron
    var evs = leer('eventos').filter(function (e) { return e && e.tipo === 'mantenimiento' && String(e.equipoId) === String(eq.id); });
    function sinHistorial(t) { return !(t.historial && t.historial.length) && !t.ultimaFechaHecha && !evs.some(function (e) { return String(e.tareaId) === String(t.id); }); }
    var actual = (eq.planMantenimiento || []).filter(function (t) { var sinHist = sinHistorial(t); if (t.k && claves.indexOf(t.k) < 0 && sinHist) { quitadas++; return false; } return true; }), agregadas = 0;
    nuevas.forEach(function (n) { var ya = actual.find(function (t) { return (t.k && t.k === n.k) || String(t.tarea || '').toLowerCase() === n.tarea.toLowerCase(); }); if (ya) { if (!ya.cada && !(ya.historial && ya.historial.length)) { ya.cada = n.cada; ya.detalle = n.detalle; ya.fuente = n.fuente; ya.k = n.k; } return; } actual.push(n); agregadas++; });
    // las del catálogo sin historial se actualizan al texto y frecuencia de la marca
    actual.forEach(function (t) { var n = nuevas.find(function (x) { return x.k && x.k === t.k; }); if (n && sinHistorial(t)) { t.tarea = n.tarea; t.componente = n.componente; t.cada = n.cada; t.intervalo = n.intervalo; t.detalle = n.detalle; t.fuente = n.fuente; } });
    return { plan: actual, agregadas: agregadas, quitadas: quitadas };
  }
  function textoCada(cada, intervalo) {
    cada = cada || (intervalo ? { horas: intervalo } : {});
    var p = []; if (cada.horas) p.push(fmt(cada.horas, 0) + ' h'); if (cada.vueltas) p.push(fmt(cada.vueltas, 0) + ' vueltas');
    if (cada.dias) p.push(cada.dias === TEMPORADA ? 'cada temporada' : cada.dias === ANIO ? 'una vez al año' : cada.dias % ANIO === 0 ? 'cada ' + (cada.dias / ANIO) + ' años' : 'cada ' + cada.dias + ' días');
    if (!p.length) return 'intervalo a completar';
    return (cada.horas || cada.vueltas ? 'cada ' : '') + p.join(' o ') + (p.length > 1 ? ', lo primero' : '');
  }

  /* ---------- estado ---------- */
  function estado(eq, eventos) {
    eventos = eventos || leer('eventos');
    var evs = eventos.filter(function (e) { return e && String(e.equipoId) === String(eq && eq.id); });
    // horas: la mayor entre lo cargado en Equipos y la última lectura del horímetro
    var horas = num(eq && eq.horasAcumuladas) || 0, fuenteHoras = horas ? 'Equipos y lotes' : null, fechaHoras = null;
    evs.filter(function (e) { return e.tipo === 'horimetro' && num(e.cantidad) != null; }).forEach(function (e) { if (num(e.cantidad) >= horas) { horas = num(e.cantidad); fuenteHoras = 'horímetro'; fechaHoras = String(e.fecha || '').slice(0, 10); } });
    var plan = (eq && eq.planMantenimiento) || [];
    if (!plan.length) return { sinPlan: true, horas: horas, fuenteHoras: fuenteHoras, fechaHoras: fechaHoras, tareas: [], vencidas: [], proximas: [] };
    var dt = (eq && eq.datosTecnicos) || {}, horasPorVuelta = num(dt.vuelta100);
    var tareas = plan.map(function (t) {
      var cada = t.cada || (num(t.intervalo) ? { horas: num(t.intervalo) } : {});
      var intervalo = num(cada.horas) || 0, ultHoras = num(t.ultimasHorasHechas) || 0, ultFecha = t.ultimaFechaHecha || null, ultPor = null;
      if (!ultHoras && !ultFecha && !(t.historial && t.historial.length) && t.creado) { var primera = evs.filter(function (e) { return e.tipo === 'horimetro' && num(e.cantidad) != null && String(e.fecha || '').slice(0, 10) >= String(t.creado).slice(0, 10); }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); })[0]; if (primera) ultHoras = num(primera.cantidad) - (primera.desde && String(primera.desde).slice(0, 10) >= String(t.creado).slice(0, 10) ? (num(primera.horasPeriodo) || 0) : 0); }
      evs.filter(function (e) { return e.tipo === 'mantenimiento' && (String(e.tareaId) === String(t.id) || (!e.tareaId && e.tarea === t.tarea)); }).forEach(function (e) {
        var h = num(e.horasEquipo); if (h == null) h = 0;
        if (h >= ultHoras && (!ultFecha || String(e.fecha) >= String(ultFecha))) { ultHoras = h; ultFecha = String(e.fecha || '').slice(0, 10); ultPor = e.cargadoPor || null; }
      });
      // porcentaje por cada criterio; manda el más alto (lo que vence primero)
      var pcts = [], faltaTxt = null;
      if (intervalo > 0) { var ph = (horas - ultHoras) / intervalo * 100; pcts.push(ph); faltaTxt = intervalo - (horas - ultHoras) >= 0 ? 'faltan ' + fmt(intervalo - (horas - ultHoras), 0) + ' h' : 'pasada por ' + fmt((horas - ultHoras) - intervalo, 0) + ' h'; }
      var sinVueltas = false;
      if (num(cada.vueltas)) { if (horasPorVuelta) { var hv = cada.vueltas * horasPorVuelta; pcts.push((horas - ultHoras) / hv * 100); } else sinVueltas = true; }
      if (num(cada.dias)) { var desde = ultFecha || t.creado || null; if (desde) { var dd = Math.round((new Date(hoy() + 'T12:00:00') - new Date(String(desde).slice(0, 10) + 'T12:00:00')) / 86400000); var pd = dd / cada.dias * 100; pcts.push(pd); if (!faltaTxt || pd >= Math.max.apply(null, pcts)) faltaTxt = cada.dias - dd >= 0 ? 'faltan ' + (cada.dias - dd) + ' días' : 'pasada por ' + (dd - cada.dias) + ' días'; } }
      var completar = !intervalo && !num(cada.vueltas) && !num(cada.dias);
      var pct = pcts.length ? Math.max.apply(null, pcts) : null;
      var est = completar ? 'completar' : pct == null ? 'gris' : pct >= 100 ? 'vencido' : pct >= 80 ? 'proximo' : 'ok';
      return { id: t.id, k: t.k || null, tarea: t.tarea, componente: t.componente || '', intervalo: intervalo, cada: cada, cadaTxt: textoCada(cada), detalle: t.detalle || '', fuente: t.fuente || '', ultHoras: ultHoras, ultFecha: ultFecha, ultPor: ultPor, pct: pct == null ? null : Math.round(pct), estado: est, faltaTxt: faltaTxt, sinVueltas: sinVueltas, faltan: intervalo > 0 ? Math.round(intervalo - (horas - ultHoras)) : null };
    });
    return { sinPlan: false, horas: horas, fuenteHoras: fuenteHoras, fechaHoras: fechaHoras, tareas: tareas, completar: tareas.filter(function (t) { return t.estado === 'completar'; }), vencidas: tareas.filter(function (t) { return t.estado === 'vencido'; }), proximas: tareas.filter(function (t) { return t.estado === 'proximo'; }) };
  }

  /* ---------- registrar (como eventos: el operador puede) ---------- */
  function guardarEvento(ev) {
    var eventos = leer('eventos'); eventos.push(ev); localStorage.setItem('eventos', JSON.stringify(eventos));
    try { window.dispatchEvent(new CustomEvent('safia:mantenimiento', { detail: ev })); } catch (e) {}
    return ev;
  }
  function registrarHoras(eqId, horas, fecha) {
    horas = num(horas); if (horas == null || horas < 0) return { error: 'Poné las horas que marca el horímetro.' };
    return { ok: guardarEvento({ id: Date.now(), equipoId: isNaN(parseInt(eqId)) ? eqId : parseInt(eqId), tipo: 'horimetro', fecha: fecha || hoy(), cantidad: horas, unidad: 'h', cargadoPor: quien(), fechaCreacion: new Date().toISOString() }) };
  }
  function registrarHecha(eqId, tareaId, horasEquipo, fecha, obs) {
    var eq = leer('equipos').find(function (e) { return String(e.id) === String(eqId); }); if (!eq) return { error: 'No encontré el equipo.' };
    var t = (eq.planMantenimiento || []).find(function (x) { return String(x.id) === String(tareaId); }); if (!t) return { error: 'No encontré la tarea.' };
    var h = num(horasEquipo); if (h == null) h = estado(eq).horas;
    return { ok: guardarEvento({ id: Date.now(), equipoId: eq.id, tipo: 'mantenimiento', fecha: fecha || hoy(), tareaId: t.id, tarea: t.tarea, componente: t.componente || '', horasEquipo: h, observaciones: obs || '', cargadoPor: quien(), fechaCreacion: new Date().toISOString() }) };
  }

  /* ---------- tarjeta ---------- */
  var CSS = '.mt-titulo{font-size:11.5px;font-weight:800;color:#178029;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px}' +
    '.mt-horas{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:#2E3236;margin-bottom:8px}.mt-horas b{font-size:16px}.mt-horas input{width:90px;padding:6px 8px;border:1.5px solid #E1E4E7;border-radius:8px;font:inherit;font-size:13px}' +
    '.mt-btn{padding:6px 10px;border:1px solid #E1E4E7;border-radius:8px;background:#fff;color:#2E3236;font:700 12px system-ui,sans-serif;cursor:pointer}.mt-btn.verde{background:#22A93A;border-color:#22A93A;color:#fff}' +
    '.mt-tarea{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #F0F2F4;font-size:12.5px}.mt-tarea:first-of-type{border-top:0}.mt-tarea .n{flex:1;min-width:0}.mt-tarea .n b{display:block}.mt-tarea .n span{font-size:11px;color:#8C9196}' +
    '.mt-barra{width:70px;height:6px;border-radius:3px;background:#EEF0F2;overflow:hidden;flex:none}.mt-barra i{display:block;height:100%}.mt-pct{width:44px;text-align:right;font-weight:700;font-size:12px;flex:none}' +
    '.mt-vacio{font-size:12px;color:#8C9196}.mt-msg{font-size:12px;margin-top:6px;color:#178029}';
  function estilos() { if (document.getElementById('safiaMantCss')) return; var st = document.createElement('style'); st.id = 'safiaMantCss'; st.textContent = CSS; document.head.appendChild(st); }
  function html(eq, opciones) {
    opciones = opciones || {}; estilos(); if (!eq) return '';
    var s = estado(eq), id = 'mt' + String(eq.id).replace(/[^a-z0-9]/gi, '');
    var h = '<div class="mt" id="' + id + '"><div class="mt-titulo"><span>Mantenimiento del equipo</span>' + (opciones.enlaceEquipos !== false ? '<a href="mis-equipos.html" style="font-size:11px;color:#B8731A;text-decoration:none;font-weight:700;">Plan en Equipos →</a>' : '') + '</div>';
    h += '<div class="mt-horas"><span>Horímetro: <b>' + fmt(s.horas, 0) + ' h</b></span>' + (s.fechaHoras ? '<span style="color:#8C9196;font-size:11px;">leído el ' + fmtF(s.fechaHoras) + '</span>' : '') +
      '<input type="number" step="1" min="0" placeholder="horas hoy" id="' + id + 'Horas"><button type="button" class="mt-btn" onclick="SafiaMant._horas(\'' + esc(String(eq.id)) + '\',\'' + id + '\')">Cargar lectura</button></div>';
    if (s.sinPlan) h += '<div class="mt-vacio">Este equipo no tiene plan de mantenimiento. Se carga una vez en <a href="mis-equipos.html" style="color:#B8731A;">Equipos y lotes → Mantenimiento</a> con el plan recomendado (Valley / Lindsay) y después el operador marca acá lo que va haciendo.</div>';
    else if (s.completar.length) h += '<div class="mt-vacio" style="margin-bottom:6px;">' + s.completar.length + ' tarea' + (s.completar.length > 1 ? 's' : '') + ' sin intervalo (bomba, motor o corner): se completa' + (s.completar.length > 1 ? 'n' : '') + ' en Equipos con la placa o el manual del fabricante.</div>';
    else {
      var orden = { vencido: 0, proximo: 1, ok: 2, gris: 3, completar: 4 };
      s.tareas.slice().sort(function (a, b) { return orden[a.estado] - orden[b.estado] || (b.pct || 0) - (a.pct || 0); }).forEach(function (t) {
        var col = COL[t.estado] || COL.gris, ancho = t.pct == null ? 0 : Math.min(100, t.pct);
        h += '<div class="mt-tarea"><div class="n" title="' + esc((t.detalle ? t.detalle + ' ' : '') + (t.fuente ? 'Fuente: ' + t.fuente : '')) + '"><b>' + esc(t.tarea) + '</b><span>' + (t.componente ? esc(t.componente) + ' · ' : '') + esc(t.cadaTxt) + ' · ' +
          (t.ultFecha ? 'última ' + fmtF(t.ultFecha) + (t.ultHoras ? ' a las ' + fmt(t.ultHoras, 0) + ' h' : '') : (t.ultHoras > 0 ? 'última a las ' + fmt(t.ultHoras, 0) + ' h' : 'nunca registrada')) + (t.faltaTxt ? ' · ' + t.faltaTxt : '') + (t.sinVueltas ? ' · falta la hora por vuelta del pivot' : '') + '</span></div>' +
          '<div class="mt-barra"><i style="width:' + ancho + '%;background:' + col + '"></i></div><div class="mt-pct" style="color:' + col + '">' + (t.estado === 'completar' ? '' : t.pct == null ? '—' : t.pct + ' %') + '</div>' +
          '<button type="button" class="mt-btn' + (t.estado === 'vencido' || t.estado === 'proximo' ? ' verde' : '') + '" onclick="SafiaMant._hecha(\'' + esc(String(eq.id)) + '\',\'' + esc(String(t.id)) + '\',\'' + id + '\')">Hecho hoy</button></div>';
      });
    }
    return h + '<div class="mt-msg" id="' + id + 'Msg"></div></div>';
  }
  function refrescar(id, eqId) { var d = document.getElementById(id); if (!d) return; var eq = leer('equipos').find(function (e) { return String(e.id) === String(eqId); }); var msg = d.querySelector('.mt-msg') ? d.querySelector('.mt-msg').textContent : ''; d.outerHTML = html(eq); var m2 = document.getElementById(id + 'Msg'); if (m2) m2.textContent = msg; }
  function _horas(eqId, id) { var inp = document.getElementById(id + 'Horas'); var r = registrarHoras(eqId, inp ? inp.value : null); var m = document.getElementById(id + 'Msg'); if (r.error) { if (m) { m.style.color = '#B3261E'; m.textContent = r.error; } return; } refrescar(id, eqId); var m2 = document.getElementById(id + 'Msg'); if (m2) { m2.style.color = '#178029'; m2.textContent = 'Lectura guardada: ' + fmt(r.ok.cantidad, 0) + ' h.'; } }
  function _hecha(eqId, tareaId, id) { var inp = document.getElementById(id + 'Horas'); var r = registrarHecha(eqId, tareaId, inp && inp.value ? inp.value : null); var m = document.getElementById(id + 'Msg'); if (r.error) { if (m) { m.style.color = '#B3261E'; m.textContent = r.error; } return; } refrescar(id, eqId); var m2 = document.getElementById(id + 'Msg'); if (m2) { m2.style.color = '#178029'; m2.textContent = 'Registrado: ' + r.ok.tarea + ' hecho hoy a las ' + fmt(r.ok.horasEquipo, 0) + ' h.'; } }

  window.SafiaMant = { catalogoPara: catalogoPara, planDesdeCatalogo: planDesdeCatalogo, completarPlan: completarPlan, textoCada: textoCada, TEMPORADA: TEMPORADA, estado: estado, html: html, registrarHoras: registrarHoras, registrarHecha: registrarHecha, _horas: _horas, _hecha: _hecha };
})();
