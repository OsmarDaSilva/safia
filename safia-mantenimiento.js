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
  var COL = { ok: '#178029', proximo: '#B8731A', vencido: '#C0392B', gris: '#8C9196' };

  /* ---------- estado ---------- */
  function estado(eq, eventos) {
    eventos = eventos || leer('eventos');
    var evs = eventos.filter(function (e) { return e && String(e.equipoId) === String(eq && eq.id); });
    // horas: la mayor entre lo cargado en Equipos y la última lectura del horímetro
    var horas = num(eq && eq.horasAcumuladas) || 0, fuenteHoras = horas ? 'Equipos y lotes' : null, fechaHoras = null;
    evs.filter(function (e) { return e.tipo === 'horimetro' && num(e.cantidad) != null; }).forEach(function (e) { if (num(e.cantidad) >= horas) { horas = num(e.cantidad); fuenteHoras = 'horímetro'; fechaHoras = String(e.fecha || '').slice(0, 10); } });
    var plan = (eq && eq.planMantenimiento) || [];
    if (!plan.length) return { sinPlan: true, horas: horas, fuenteHoras: fuenteHoras, fechaHoras: fechaHoras, tareas: [], vencidas: [], proximas: [] };
    var tareas = plan.map(function (t) {
      var intervalo = num(t.intervalo) || 0, ultHoras = num(t.ultimasHorasHechas) || 0, ultFecha = t.ultimaFechaHecha || null, ultPor = null;
      evs.filter(function (e) { return e.tipo === 'mantenimiento' && (String(e.tareaId) === String(t.id) || (!e.tareaId && e.tarea === t.tarea)); }).forEach(function (e) {
        var h = num(e.horasEquipo); if (h == null) h = 0;
        if (h >= ultHoras && (!ultFecha || String(e.fecha) >= String(ultFecha))) { ultHoras = h; ultFecha = String(e.fecha || '').slice(0, 10); ultPor = e.cargadoPor || null; }
      });
      var pct = intervalo > 0 ? (horas - ultHoras) / intervalo * 100 : null;
      var est = pct == null ? 'gris' : pct >= 100 ? 'vencido' : pct >= 80 ? 'proximo' : 'ok';
      return { id: t.id, tarea: t.tarea, componente: t.componente || '', intervalo: intervalo, ultHoras: ultHoras, ultFecha: ultFecha, ultPor: ultPor, pct: pct == null ? null : Math.round(pct), estado: est, faltan: intervalo > 0 ? Math.round(intervalo - (horas - ultHoras)) : null };
    });
    return { sinPlan: false, horas: horas, fuenteHoras: fuenteHoras, fechaHoras: fechaHoras, tareas: tareas, vencidas: tareas.filter(function (t) { return t.estado === 'vencido'; }), proximas: tareas.filter(function (t) { return t.estado === 'proximo'; }) };
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
    if (s.sinPlan) h += '<div class="mt-vacio">Este equipo no tiene plan de mantenimiento. Se carga una vez en <a href="mis-equipos.html" style="color:#B8731A;">Equipos y lotes</a> (hay una plantilla para pivots) y después el operador marca acá lo que va haciendo.</div>';
    else {
      var orden = { vencido: 0, proximo: 1, ok: 2, gris: 3 };
      s.tareas.slice().sort(function (a, b) { return orden[a.estado] - orden[b.estado] || (b.pct || 0) - (a.pct || 0); }).forEach(function (t) {
        var col = COL[t.estado] || COL.gris, ancho = t.pct == null ? 0 : Math.min(100, t.pct);
        h += '<div class="mt-tarea"><div class="n"><b>' + esc(t.tarea) + '</b><span>' + (t.componente ? esc(t.componente) + ' · ' : '') + 'cada ' + fmt(t.intervalo, 0) + ' h · ' +
          (t.ultFecha ? 'última ' + fmtF(t.ultFecha) + ' a las ' + fmt(t.ultHoras, 0) + ' h' : (t.ultHoras > 0 ? 'última a las ' + fmt(t.ultHoras, 0) + ' h' : 'nunca registrada')) + (t.faltan != null ? (t.faltan >= 0 ? ' · faltan ' + fmt(t.faltan, 0) + ' h' : ' · pasada por ' + fmt(-t.faltan, 0) + ' h') : '') + '</span></div>' +
          '<div class="mt-barra"><i style="width:' + ancho + '%;background:' + col + '"></i></div><div class="mt-pct" style="color:' + col + '">' + (t.pct == null ? '—' : t.pct + ' %') + '</div>' +
          '<button type="button" class="mt-btn' + (t.estado === 'vencido' || t.estado === 'proximo' ? ' verde' : '') + '" onclick="SafiaMant._hecha(\'' + esc(String(eq.id)) + '\',\'' + esc(String(t.id)) + '\',\'' + id + '\')">Hecho hoy</button></div>';
      });
    }
    return h + '<div class="mt-msg" id="' + id + 'Msg"></div></div>';
  }
  function refrescar(id, eqId) { var d = document.getElementById(id); if (!d) return; var eq = leer('equipos').find(function (e) { return String(e.id) === String(eqId); }); var msg = d.querySelector('.mt-msg') ? d.querySelector('.mt-msg').textContent : ''; d.outerHTML = html(eq); var m2 = document.getElementById(id + 'Msg'); if (m2) m2.textContent = msg; }
  function _horas(eqId, id) { var inp = document.getElementById(id + 'Horas'); var r = registrarHoras(eqId, inp ? inp.value : null); var m = document.getElementById(id + 'Msg'); if (r.error) { if (m) { m.style.color = '#B3261E'; m.textContent = r.error; } return; } refrescar(id, eqId); var m2 = document.getElementById(id + 'Msg'); if (m2) { m2.style.color = '#178029'; m2.textContent = 'Lectura guardada: ' + fmt(r.ok.cantidad, 0) + ' h.'; } }
  function _hecha(eqId, tareaId, id) { var inp = document.getElementById(id + 'Horas'); var r = registrarHecha(eqId, tareaId, inp && inp.value ? inp.value : null); var m = document.getElementById(id + 'Msg'); if (r.error) { if (m) { m.style.color = '#B3261E'; m.textContent = r.error; } return; } refrescar(id, eqId); var m2 = document.getElementById(id + 'Msg'); if (m2) { m2.style.color = '#178029'; m2.textContent = 'Registrado: ' + r.ok.tarea + ' hecho hoy a las ' + fmt(r.ok.horasEquipo, 0) + ' h.'; } }

  window.SafiaMant = { estado: estado, html: html, registrarHoras: registrarHoras, registrarHecha: registrarHecha, _horas: _horas, _hecha: _hecha };
})();
