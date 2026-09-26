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
       [L] Lindsay (Zimmatic), "8 Pre-Season Center Pivot Maintenance Tips to Reduce Downtime".
       [F] Placa y manual del fabricante del equipo (bomba, motor, corner): el intervalo lo completa el usuario. */
  var TEMPORADA = 182, ANIO = 365;
  var FUENTE_V = 'Valley, manual del dueño del pivot central 7000/8000/8120', FUENTE_L = 'Lindsay (Zimmatic), mantenimiento de pretemporada', FUENTE_F = 'placa y manual del fabricante';
  function catalogoPara(eq) {
    var dt = (eq && eq.datosTecnicos) || {}, marca = String((eq && (eq.marca || dt.marca)) || '').toLowerCase();
    var esLindsay = /lindsay|zimmatic/.test(marca), esValley = /valley|valmont/.test(marca);
    var tieneCorner = !!(dt.corner && String(dt.corner).toLowerCase() !== 'no' && String(dt.corner) !== '0') || /corner/i.test(String(eq && eq.nombre || ''));
    var tieneCanon = !!(dt.canonFinal || dt.canon || dt.endgun) || true;   // casi todos los pivots de la zona tienen cañón final; si no tiene, se borra la tarea
    var c = [];
    // Centro del pivote
    if (esValley) c.push({ k: 'swivel', componente: 'Centro del pivote', tarea: 'Engrasar el swivel del pivote', cada: { vueltas: 6 }, detalle: 'Cada 5 a 7 vueltas, grasa de litio resistente al agua.', fuente: FUENTE_V + ', pág. 70' });
    else c.push({ k: 'swivel', componente: 'Centro del pivote', tarea: 'Engrasar los puntos del pivote central', cada: { horas: 1000, dias: TEMPORADA }, detalle: esLindsay ? 'Una vez por temporada o cada 1.000 h, lo que ocurra primero. Medio pomo en la posición actual y el otro medio con el pivot a 180°.' : 'Lindsay: una vez por temporada o cada 1.000 h. Valley: el swivel cada 5 a 7 vueltas. Confirmar con el manual de la marca.', fuente: esLindsay ? FUENTE_L : FUENTE_L + ' / ' + FUENTE_V + ', pág. 70' });
    c.push({ k: 'colector', componente: 'Centro del pivote', tarea: 'Revisar drenaje de la base del colector (anillos)', cada: { dias: TEMPORADA }, detalle: 'Pre y post temporada.', fuente: FUENTE_V + ', pág. 93' });
    c.push({ k: 'contactores', componente: 'Centro del pivote', tarea: 'Revisar contactores del pivote (arco, picaduras)', cada: { dias: TEMPORADA }, detalle: 'Con el seccionador apagado. Contactos quemados o picados indican baja tensión.', fuente: FUENTE_V + ', pág. 93' });
    c.push({ k: 'anclaje', componente: 'Centro del pivote', tarea: 'Revisar anclajes y cables de puesta a tierra', cada: { dias: TEMPORADA }, detalle: 'Pernos de anclaje o cadenas; ajustar o limpiar la tierra.', fuente: FUENTE_V + ', pág. 93' });
    // Torres (unidades de tracción)
    c.push({ k: 'aceite_ruedas', componente: 'Torres', tarea: 'Cambiar aceite de las reductoras de rueda', cada: { horas: 3000, dias: 3 * ANIO }, detalle: 'Primer cambio después de la primera temporada; después cada 3 años o 3.000 h, lo que ocurra primero. Unos 3,7 L por reductora.', fuente: FUENTE_V + ', pág. 64 y 66' });
    c.push({ k: 'drenar_ruedas', componente: 'Torres', tarea: 'Drenar condensación de reductoras de rueda y completar nivel', cada: { dias: TEMPORADA }, detalle: 'Al final de cada temporada; revisar retenes y juntas.', fuente: FUENTE_V + ', pág. 64 y 94' + (esLindsay ? ' · ' + FUENTE_L : '') });
    c.push({ k: 'aceite_central', componente: 'Torres', tarea: 'Cambiar aceite del motorreductor central de cada torre', cada: { dias: TEMPORADA }, detalle: 'Después de cada temporada. Unos 1,3 L por motorreductor.', fuente: FUENTE_V + ', pág. 65 y 67' });
    c.push({ k: 'neumaticos', componente: 'Torres', tarea: 'Revisar presión de neumáticos', cada: { dias: 90 }, detalle: 'Pretemporada, primera pasada y mitad de temporada.', fuente: FUENTE_V + ', pág. 93–94' + (esLindsay ? ' · ' + FUENTE_L : '') });
    c.push({ k: 'tuercas', componente: 'Torres', tarea: 'Torque de tuercas de ruedas (169 N·m)', cada: { dias: ANIO }, detalle: 'Anual, en pretemporada.', fuente: FUENTE_V + ', pág. 68 y 94' });
    c.push({ k: 'cardanes', componente: 'Torres', tarea: 'Revisar cardanes y protectores del eje', cada: { dias: ANIO }, detalle: 'Reponer protectores dañados.', fuente: FUENTE_V + ', pág. 94' });
    c.push({ k: 'junta_flex', componente: 'Torres', tarea: 'Revisar mangueras de junta flexible', cada: { dias: TEMPORADA }, detalle: 'Ajustar abrazaderas o reemplazar si pierden.', fuente: FUENTE_V + ', pág. 94' });
    // Estructura y alineación
    c.push({ k: 'estructura', componente: 'Estructura', tarea: 'Revisar pernos, bridas y cables de los tramos', cada: { dias: TEMPORADA }, detalle: 'Ajustar pernos, bridas con pérdidas y cables de tramo.', fuente: FUENTE_V + ', pág. 92' });
    c.push({ k: 'alineacion', componente: 'Estructura', tarea: 'Alinear y probar interruptores de seguridad', cada: { dias: ANIO }, detalle: 'Anual; lo hace el distribuidor.', fuente: FUENTE_V + ', pág. 94' });
    // Aspersores
    c.push({ k: 'presion', componente: 'Aspersores', tarea: 'Verificar presión contra la carta de aspersores', cada: { dias: 90 }, detalle: 'Pretemporada, primera pasada y mitad de temporada.', fuente: FUENTE_V + ', pág. 93' });
    c.push({ k: 'boquillas', componente: 'Aspersores', tarea: 'Revisar boquillas tapadas, faltantes o gastadas', cada: { dias: 90 }, detalle: 'Limpiar las tapadas; reponer las gastadas.', fuente: FUENTE_V + ', pág. 93' + (esLindsay ? ' · ' + FUENTE_L : '') });
    c.push({ k: 'lavado', componente: 'Aspersores', tarea: 'Lavar la máquina (abrir tapones de los tramos)', cada: { dias: TEMPORADA }, detalle: 'Pre y post temporada.', fuente: FUENTE_V + ', pág. 93' });
    // Cañón final y voladizo
    if (tieneCanon) {
      c.push({ k: 'canon', componente: 'Cañón final', tarea: 'Revisar rodamiento y freno del cañón final', cada: { dias: TEMPORADA }, detalle: 'Si el pivot no tiene cañón, borrar esta tarea.', fuente: FUENTE_V + ', pág. 94' });
      c.push({ k: 'trampa_arena', componente: 'Cañón final', tarea: 'Revisar y limpiar la trampa de arena', cada: { dias: TEMPORADA }, detalle: 'Según necesidad.', fuente: FUENTE_V + ', pág. 94' });
    }
    // Corner: sin manual público; el intervalo lo completa el distribuidor
    if (tieneCorner) {
      c.push({ k: 'corner_engrase', componente: 'Corner', tarea: 'Engrasar la articulación y el eje del corner', cada: {}, detalle: 'Completar el intervalo con el manual del corner de la marca.', fuente: FUENTE_F });
      c.push({ k: 'corner_reductora', componente: 'Corner', tarea: 'Aceite de la reductora de la torre de dirección del corner', cada: {}, detalle: 'Completar con el manual del corner.', fuente: FUENTE_F });
    }
    // Bomba y motor: dependen del fabricante
    c.push({ k: 'bomba_aceite', componente: 'Bomba', tarea: 'Cambiar aceite o lubricante de la bomba', cada: {}, detalle: 'Completar con la placa y el manual de la bomba.', fuente: FUENTE_F });
    c.push({ k: 'bomba_engrase', componente: 'Bomba', tarea: 'Engrasar rodamientos de la bomba', cada: {}, detalle: 'Completar con el manual de la bomba.', fuente: FUENTE_F });
    c.push({ k: 'motor', componente: 'Motor', tarea: 'Mantenimiento del motor de la bomba (aceite o rodamientos)', cada: {}, detalle: 'Eléctrico: relubricación según placa. Diésel: cambio de aceite según su manual.', fuente: FUENTE_F });
    return c;
  }
  // Plan listo para guardar en el equipo, a partir del catálogo
  function planDesdeCatalogo(eq) {
    var ahora = hoy();
    return catalogoPara(eq).map(function (t, i) { return { id: Date.now() + i + Math.random(), k: t.k, componente: t.componente, tarea: t.tarea, cada: t.cada, intervalo: t.cada.horas || null, detalle: t.detalle, fuente: t.fuente, creado: ahora, ultimasHorasHechas: 0, ultimaFechaHecha: null, historial: [] }; });
  }
  // Suma al plan existente las tareas del catálogo que faltan (por k o por nombre), sin tocar las que ya tienen historial
  function completarPlan(eq) {
    var actual = (eq.planMantenimiento || []).slice(), nuevas = planDesdeCatalogo(eq), agregadas = 0;
    nuevas.forEach(function (n) { var ya = actual.find(function (t) { return (t.k && t.k === n.k) || String(t.tarea || '').toLowerCase() === n.tarea.toLowerCase(); }); if (ya) { if (!ya.cada && !(ya.historial && ya.historial.length)) { ya.cada = n.cada; ya.detalle = n.detalle; ya.fuente = n.fuente; ya.k = n.k; } return; } actual.push(n); agregadas++; });
    return { plan: actual, agregadas: agregadas };
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
