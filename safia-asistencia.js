/* SAFIA · Pedido de asistencia técnica a Irrigar (window.SafiaAsistencia)
   Cuando alguien marca "Pivot parado" y pide asistencia:
   1) la edge safia-asistencia avisa al celular de los usuarios de Irrigar que tienen los avisos activados;
   2) si Irrigar cargó su número de soporte, se ofrece el WhatsApp con el mensaje ya escrito (el operador solo toca Enviar).
   El número se guarda en este dispositivo para que el WhatsApp funcione también sin señal de datos en SAFIA. */
(function () {
  'use strict';
  var CLAVE = 'safia_soporte_wa';
  var MOTIVOS = { electrica: 'falla eléctrica', mecanica: 'falla mecánica', bomba: 'falla de la bomba', energia: 'corte de energía (ANDE)', agua: 'falta de agua en la fuente', mantenimiento: 'mantenimiento programado', consulta: 'consulta o ajuste', otro: 'otro motivo' };
  var SIN_PEDIDO = { energia: 1, agua: 1, mantenimiento: 1 };   // motivos que no son una rotura: el pedido no va marcado de entrada
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function fc(f) { return String(f).slice(8, 10) + '/' + String(f).slice(5, 7); }

  function invocar(accion, extra) {
    var sb = window.safiaSupabase; if (!sb) return Promise.reject(new Error('sin conexión con la nube'));
    var cuerpo = extra || {}; cuerpo.accion = accion;
    return sb.functions.invoke('safia-asistencia', { body: cuerpo }).then(function (r) {
      if (r.error) {
        var ctx = r.error.context;
        if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { return j; }, function () { return null; }).then(function (j) { throw new Error((j && j.error) || r.error.message || 'no se pudo conectar'); });
        throw new Error(r.error.message || 'no se pudo conectar');
      }
      if (r.data && r.data.error) throw new Error(r.data.error);
      return r.data;
    });
  }
  function numero() { try { return String(localStorage.getItem(CLAVE) || '').replace(/\D/g, ''); } catch (e) { return ''; } }
  function recordar(n) { try { localStorage.setItem(CLAVE, String(n || '')); } catch (e) {} }
  function refrescar() { return invocar('soporte').then(function (r) { recordar(r.whatsapp); return r.whatsapp || ''; }); }
  function guardar(n) { return invocar('soporte_guardar', { whatsapp: n }).then(function (r) { recordar(r.whatsapp); return r.whatsapp || ''; }); }

  // El mensaje que va por WhatsApp: quién, dónde, qué pivot, desde cuándo y por qué
  function mensaje(ev) {
    var eq = leer('equipos').filter(function (e) { return String(e.id) === String(ev.equipoId); })[0] || {};
    var campo = leer('campos').filter(function (c) { return String(c.id) === String(eq.campoId); })[0] || {};
    var cliente = leer('clientes').filter(function (c) { return String(c.id) === String(campo.clienteId); })[0] || {};
    var u = null; try { u = JSON.parse(localStorage.getItem('safia_usuario') || 'null'); } catch (e) {}
    var centro = eq.poligono && eq.poligono.centro, lat = centro ? centro.lat : campo.latitud, lon = centro ? centro.lon : campo.longitud;
    var l = ['SAFIA · Pedido de asistencia técnica'];
    if (cliente.nombre) l.push('Cliente: ' + cliente.nombre);
    if (campo.nombre) l.push('Estancia: ' + campo.nombre);
    l.push('Equipo: ' + (eq.nombre || 'pivot'));
    l.push(ev.parado === false ? 'Consulta (el pivot anda): ' + (MOTIVOS[ev.motivo] || 'consulta o ajuste') : 'Parado desde el ' + fc(ev.fecha) + ' por ' + (MOTIVOS[ev.motivo] || 'motivo sin indicar'));
    if (ev.observaciones) l.push('Nota: ' + ev.observaciones);
    if (isFinite(parseFloat(lat)) && isFinite(parseFloat(lon))) l.push('Ubicación: https://maps.google.com/?q=' + (+lat).toFixed(5) + ',' + (+lon).toFixed(5));
    if (u && u.nombre) l.push('Avisa: ' + u.nombre);
    if (ev.pedidoId) l.push('Ver y asignar técnico en SAFIA: ' + location.origin + '/asistencias.html?p=' + encodeURIComponent(ev.pedidoId));
    return l.join('\n');
  }
  function enlace(ev) { var n = numero(); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(mensaje(ev)) : ''; }

  // Ventana que aparece después de guardar la parada: avisa a Irrigar y ofrece el WhatsApp
  function pedir(ev, pedido) {
    if (pedido && !ev.pedidoId) ev.pedidoId = pedido.id;   // el WhatsApp lleva el enlace al pedido
    var d = document.getElementById('safiaAsisModal'); if (d) d.remove();
    d = document.createElement('div'); d.id = 'safiaAsisModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(20,25,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;';
    var btn = 'display:block;width:100%;box-sizing:border-box;text-align:center;padding:13px 14px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:22px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="font-size:17px;font-weight:800;color:#2E3236;margin-bottom:6px;">Asistencia técnica de Irrigar</div>' +
      '<div style="font-size:13px;color:#41464B;line-height:1.5;margin-bottom:12px;">' + (ev.guardado || 'La parada ya quedó guardada.') + '</div>' +
      '<div id="safiaAsisEstado" style="font-size:13px;line-height:1.45;padding:10px 12px;border-radius:8px;background:#F4F5F6;color:#41464B;margin-bottom:12px;">Avisando a los técnicos de Irrigar…</div>' +
      (pedido && !ev.enElPedido ? '<a href="asistencias.html?p=' + encodeURIComponent(pedido.id) + '" style="' + btn + 'border:1.5px solid #22A93A;background:#fff;color:#178029;margin-bottom:8px;">Ver el pedido, escribir o mandar foto o video</a>' : '') +
      '<div id="safiaAsisAdjunto" style="display:none;font-size:13px;font-weight:600;color:#6B7075;margin-bottom:8px;line-height:1.4;"></div>' +
      '<div id="safiaAsisWa"></div>' +
      '<button id="safiaAsisCerrar" style="' + btn + 'border:1.5px solid #e1e4e7;background:#fff;color:#41464B;margin-top:8px;">Cerrar</button></div>';
    document.body.appendChild(d);
    document.getElementById('safiaAsisCerrar').addEventListener('click', function () { d.remove(); });
    function pintarWa() {
      var caja = document.getElementById('safiaAsisWa'); if (!caja) return;
      var href = enlace(ev);
      caja.innerHTML = href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener" style="' + btn + 'border:0;background:#22A93A;color:#fff;">Avisar también por WhatsApp</a><div style="font-size:12px;color:#8C9196;line-height:1.4;margin-top:6px;">Se abre WhatsApp con el mensaje ya escrito para el soporte de Irrigar. Solo falta tocar Enviar.</div>' : '';
    }
    pintarWa();
    function estado(t, ok) { var e = document.getElementById('safiaAsisEstado'); if (!e) return; e.textContent = t; e.style.background = ok ? '#E7F6EA' : '#FDF3E3'; e.style.color = ok ? '#178029' : '#8A5A00'; }
    function intentar(vez) {
      invocar('pedir', { equipoId: ev.equipoId, motivo: ev.motivo, fecha: String(ev.fecha).slice(0, 10), nota: ev.observaciones || '', pedidoId: pedido ? pedido.id : '', parado: ev.parado !== false }).then(function (r) {
        recordar(r.whatsapp); pintarWa();
        if (r.enviados) estado('Aviso enviado al celular de ' + r.tecnicos + (r.tecnicos === 1 ? ' persona' : ' personas') + ' de Irrigar.', true);
        else estado('El pedido quedó anotado para Irrigar, pero en este momento nadie de Irrigar tiene los avisos activados en su celular.' + (numero() ? ' Mandalo por WhatsApp con el botón de abajo.' : ' Llamá a Irrigar para avisar.'), false);
      }, function (e) {
        // el pivot recién cargado puede tardar unos segundos en subir a la nube: un segundo intento
        if (vez < 2 && /todavía no está en la nube/.test(e.message)) return setTimeout(function () { intentar(vez + 1); }, 6000);
        estado('No se pudo avisar por la app (' + e.message + ').' + (numero() ? ' Mandalo por WhatsApp con el botón de abajo.' : ' Llamá a Irrigar para avisar.'), false);
      });
    }
    intentar(1);
  }

  window.SafiaAsistencia = { pedir: pedir, mensaje: mensaje, enlace: enlace, numero: numero, refrescar: refrescar, guardar: guardar, MOTIVOS: MOTIVOS, pedirDeEntrada: function (motivo) { return !SIN_PEDIDO[motivo]; } };
  // el número se trae una vez por día, en segundo plano
  try {
    var hoy = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(CLAVE + '_dia') !== hoy) setTimeout(function () { if (!window.safiaSupabase) return; refrescar().then(function () { try { localStorage.setItem(CLAVE + '_dia', hoy); } catch (e) {} }, function () {}); }, 4000);
  } catch (e) {}
})();
