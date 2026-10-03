/* SAFIA — Ventana para pulverizar
   -------------------------------------------------------------------
   Con el pronóstico hora por hora del lote dice cuándo conviene pulverizar hoy y en los dos días siguientes.

   Límites (Embrapa Soja y Unicentro, "Tecnologia de Aplicação de Pesticidas", Maciel, Gazziero, Theisen, Bridi y
   Adegas; condiciones óptimas citadas por O Presente Rural, "Quando a pulverização ultrapassa o alvo"):
     viento entre 3,2 y 6,5 km/h · humedad relativa mínima 55 % · temperatura menor a 30 °C.
     "Fora dessas faixas, aumentam os riscos de evaporação, deslocamento lateral e deposição inadequada."
   Hasta 10 km/h de viento es el tope de uso corriente en el sector (no es de la publicación de Embrapa): SAFIA lo
   marca "con cuidado", nunca como ideal.
   Viento: el pronóstico lo da a 10 m de altura; se pasa a 2 m (la altura del botalón y del anemómetro de mano) con
   FAO-56, ecuación 47: u2 = u10 × 4,87 ÷ ln(67,8 × 10 − 5,42) = u10 × 0,748.
   Lluvia: una hora con lluvia prevista no sirve; si llueve en las 2 horas siguientes se avisa (cuánto hay que
   esperar entre la aplicación y la lluvia depende del producto: lo dice la etiqueta).
   Es un pronóstico (Open-Meteo), no una medición: antes de salir, medir en el lote con termohigrómetro y anemómetro. */
(function () {
  'use strict';
  var LIM = { tempMax: 30, hrMin: 55, vientoMin: 3.2, vientoIdeal: 6.5, vientoMax: 10, lluviaHora: 0.2, lluviaCerca: 0.5, horasLluvia: 2 };
  var U2 = 4.87 / Math.log(67.8 * 10 - 5.42);
  var FUENTE = 'Embrapa Soja y Unicentro, "Tecnologia de Aplicação de Pesticidas": viento de 3,2 a 6,5 km/h, humedad mínima de 55 % y temperatura menor a 30 °C';
  var COL = { verde: '#22A93A', amarillo: '#F2B01E', rojo: '#D5432F', pasado: '#E1E4E7' };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }

  // Estado de una hora: verde (ideal), amarillo (con cuidado) o rojo (no pulverizar), con el motivo
  function evaluarHora(h, lluviaDespues) {
    var no = [], ojo = [];
    if (h.lluvia >= LIM.lluviaHora) no.push('lluvia');
    if (h.temp != null && h.temp >= LIM.tempMax) no.push('calor (' + n(h.temp) + ' °C)');
    if (h.hr != null && h.hr < LIM.hrMin) no.push('aire seco (' + n(h.hr) + ' %)');
    if (h.viento != null && h.viento > LIM.vientoMax) no.push('viento fuerte (' + n(h.viento) + ' km/h)');
    if (h.viento != null && h.viento < LIM.vientoMin) ojo.push('aire quieto (' + n(h.viento, 1) + ' km/h): las gotas finas quedan flotando');
    if (h.viento != null && h.viento > LIM.vientoIdeal && h.viento <= LIM.vientoMax) ojo.push('viento de ' + n(h.viento) + ' km/h: gota más gruesa y botalón bajo');
    if (lluviaDespues >= LIM.lluviaCerca) ojo.push('lluvia en las ' + LIM.horasLluvia + ' horas siguientes');
    return no.length ? { estado: 'rojo', motivos: no } : ojo.length ? { estado: 'amarillo', motivos: ojo } : { estado: 'verde', motivos: [] };
  }
  function analizar(hourly, ahoraISO) {
    var t = hourly.time || [], horas = t.map(function (f, i) {
      return { t: f, dia: f.slice(0, 10), hora: +f.slice(11, 13), temp: hourly.temperature_2m ? hourly.temperature_2m[i] : null, hr: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
        viento: hourly.wind_speed_10m && hourly.wind_speed_10m[i] != null ? Math.round(hourly.wind_speed_10m[i] * U2 * 10) / 10 : null, lluvia: hourly.precipitation ? (hourly.precipitation[i] || 0) : 0,
        prob: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null };
    });
    horas.forEach(function (h, i) { var d = 0; for (var k = 1; k <= LIM.horasLluvia; k++) if (horas[i + k]) d += horas[i + k].lluvia; var e = evaluarHora(h, d); h.estado = e.estado; h.motivos = e.motivos; h.pasada = h.t < ahoraISO; });
    var dias = []; horas.forEach(function (h) { var d = dias[dias.length - 1]; if (!d || d.fecha !== h.dia) { d = { fecha: h.dia, horas: [] }; dias.push(d); } d.horas.push(h); });
    dias.forEach(function (d) {
      var tramos = function (estado) { var out = [], ini = null; d.horas.forEach(function (h, i) { var ok = h.estado === estado && !h.pasada; if (ok && ini == null) ini = h.hora; if ((!ok || i === d.horas.length - 1) && ini != null) { var fin = ok ? h.hora + 1 : h.hora; if (fin - ini >= 2) out.push([ini, fin]); ini = null; } }); return out; };
      d.ideal = tramos('verde'); d.cuidado = tramos('amarillo');
    });
    var ahora = horas.filter(function (h) { return !h.pasada; })[0] || null;
    return { horas: horas, dias: dias, ahora: ahora };
  }
  function tramosTxt(l) { return l.map(function (x) { return x[0] + ' a ' + (x[1] === 24 ? '24' : x[1]) + ' h'; }).join(' y '); }
  function nombreDia(fecha, i) { if (i === 0) return 'Hoy'; if (i === 1) return 'Mañana'; var d = new Date(fecha + 'T12:00:00'); return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()] + ' ' + fecha.slice(8, 10) + '/' + fecha.slice(5, 7); }
  function resumenDia(d) { return d.ideal.length ? tramosTxt(d.ideal) : d.cuidado.length ? 'solo con cuidado: ' + tramosTxt(d.cuidado) : 'sin ventana'; }
  function ahoraTxt(a) {
    if (!a) return '';
    var datos = n(a.temp) + ' °C, ' + n(a.hr) + ' % de humedad, viento ' + n(a.viento, 1) + ' km/h';
    return a.estado === 'verde' ? '<b style="color:#178029;">Ahora se puede pulverizar</b> (' + datos + ').' : a.estado === 'amarillo' ? '<b style="color:#8a5713;">Ahora, con cuidado</b> (' + datos + '): ' + esc(a.motivos.join('; ')) + '.' : '<b style="color:#B5371C;">Ahora no pulverizar</b> (' + datos + '): ' + esc(a.motivos.join(', ')) + '.';
  }
  function html(R, opciones) {
    opciones = opciones || {};
    var dias = R.dias.slice(0, 3), hoy = dias[0];
    var tira = function (d, i) {
      return '<div style="margin-top:8px;"><div style="font-size:12px;font-weight:600;color:#2E3236;">' + nombreDia(d.fecha, i) + ' <span style="font-weight:500;color:' + (d.ideal.length ? '#178029' : d.cuidado.length ? '#8a5713' : '#B5371C') + ';">· ' + resumenDia(d) + '</span></div>' +
        '<div style="display:flex;gap:1px;margin-top:3px;">' + d.horas.map(function (h) { return '<div title="' + h.hora + ' h: ' + n(h.temp) + ' °C, ' + n(h.hr) + ' %, viento ' + n(h.viento, 1) + ' km/h' + (h.lluvia >= LIM.lluviaHora ? ', lluvia ' + n(h.lluvia, 1) + ' mm' : '') + (h.motivos.length ? ' · ' + esc(h.motivos.join('; ')) : ' · ideal') + '" style="flex:1 1 0;height:16px;border-radius:2px;background:' + COL[h.estado] + ';opacity:' + (h.pasada ? 0.3 : 1) + ';"></div>'; }).join('') + '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#8C9196;margin-top:1px;"><span>0</span><span>6</span><span>12</span><span>18</span><span>24 h</span></div></div>';
    };
    var cuerpo = '<div style="font-size:13px;line-height:1.45;">' + ahoraTxt(R.ahora) + '</div>' + dias.map(tira).join('') +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:#3A3E41;margin-top:6px;"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + COL.verde + ';"></i> ideal</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + COL.amarillo + ';"></i> con cuidado</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + COL.rojo + ';"></i> no pulverizar</span></div>' +
      '<div style="font-size:11px;color:#8C9196;line-height:1.4;margin-top:6px;">' + FUENTE + '. Hasta 10 km/h va "con cuidado". Viento del pronóstico pasado a 2 m de altura (FAO-56). Cuánto esperar entre la aplicación y la lluvia depende del producto: lo dice la etiqueta. Es un pronóstico: antes de salir, medir en el lote.</div>';
    if (opciones.sinPliegue) return cuerpo;
    return '<details style="margin-top:10px;border-top:1px solid #EEF0F2;padding-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:700;color:#2E3236;">Ventana para pulverizar <span style="font-weight:500;color:' + (hoy && hoy.ideal.length ? '#178029' : hoy && hoy.cuidado.length ? '#8a5713' : '#B5371C') + ';">· hoy ' + (hoy ? resumenDia(hoy) : 'sin datos') + '</span></summary><div style="margin-top:6px;">' + cuerpo + '</div></details>';
  }
  function ahoraLocal() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':00'; }
  var memoria = {};
  // Pronóstico por hora del lote (3 días). Devuelve null si no hay clima.
  function ventanas(lat, lon) {
    var k = (+lat).toFixed(3) + ',' + (+lon).toFixed(3), m = memoria[k];
    if (m && Date.now() - m.ts < 30 * 60000) return Promise.resolve(analizar(m.hourly, ahoraLocal()));
    if (!window.SafiaClima) return Promise.resolve(null);
    return SafiaClima.obtenerClima({ lat: lat, lon: lon, hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,precipitation_probability', pastDays: 0, forecastDays: 3, cacheKey: 'pulv:' + k }).then(function (r) {
      var h = r && r.datos && r.datos.hourly; if (!h || !h.time || !h.time.length) return null;
      memoria[k] = { ts: Date.now(), hourly: h };
      return analizar(h, ahoraLocal());
    }).catch(function () { return null; });
  }
  // Pinta la ventana dentro de un contenedor
  function pintar(idContenedor, lat, lon, opciones) {
    var el = document.getElementById(idContenedor); if (!el) return Promise.resolve(null);
    return ventanas(lat, lon).then(function (R) { var e2 = document.getElementById(idContenedor); if (e2) e2.innerHTML = R ? html(R, opciones) : ''; return R; });
  }
  // Una línea para el formulario de aplicación: cómo está ahora y cuándo es la próxima ventana
  function lineaAhora(R) {
    if (!R) return '';
    var prox = ''; if (R.ahora && R.ahora.estado !== 'verde') { for (var i = 0; i < R.dias.length && !prox; i++) if (R.dias[i].ideal.length) prox = ' Próxima ventana ideal: ' + nombreDia(R.dias[i].fecha, i).toLowerCase() + ' de ' + tramosTxt([R.dias[i].ideal[0]]) + '.'; }
    return ahoraTxt(R.ahora) + prox;
  }
  window.SafiaPulverizar = { LIMITES: LIM, FUENTE: FUENTE, evaluarHora: evaluarHora, analizar: analizar, ventanas: ventanas, html: html, pintar: pintar, lineaAhora: lineaAhora };
})();
