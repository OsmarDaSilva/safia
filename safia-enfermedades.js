/* SAFIA · Clima favorable a enfermedades, y qué tiene que ver el riego (window.SafiaEnfermedades)
   -------------------------------------------------------------------------------------------------
   Hoy: ROYA ASIÁTICA DE LA SOJA. No dice que haya roya en el lote: dice si el clima permitió (o va a permitir) la
   infección, que es cuando conviene recorrer el lote. La aplicación la decide el ingeniero agrónomo.

   FUENTES (leídas, no de memoria):
   [1] Godoy, C. V. et al. "Ferrugem-asiática da soja: bases para o manejo da doença e estratégias antirresistência".
       Embrapa Soja, Documentos 428, 2020.
       · p. 10: la infección necesita agua libre sobre la hoja: como mínimo 6 horas de mojado con temperatura entre
         15 y 25 °C, y más de 8 horas en los extremos (10 °C o 27 °C). La lluvia favorece las epidemias. El período
         latente (de la infección a los primeros esporos) es de 6 días a 26 °C y llega a 12–16 días a 15 °C.
       · p. 9: los síntomas pueden aparecer en cualquier etapa, pero la mayor incidencia es desde que el cultivo cierra el
         surco (más humedad, y la sombra protege a los esporos del sol). Antes del cierre solo aparece cuando hay mucho
         inóculo a la siembra: soja sobre soja, o un lote vecino más adelantado.
       · p. 12: el vacío sanitario atrasa las primeras apariciones y baja la chance de roya en las etapas iniciales.
   [2] Embrapa Instrumentação (P. Cruvinel; plataforma de predicción de roya, 2026): el período de hoja mojada se toma
       como las horas con humedad relativa mayor a 90 % (visto en la nota de prensa de la plataforma, no en el artículo).
   [3] Embrapa Hortaliças, "Irrigação": el riego por aspersión, sobre todo con alta frecuencia, favorece la humedad alta
       en el canopeo y las enfermedades de hoja, y lava los productos aplicados.

   QUÉ ES CRITERIO DE SAFIA (no está publicado así, y se dice en pantalla):
   · La hoja mojada no se mide: se estima con el pronóstico por hora (lluvia, o humedad relativa de 90 % o más).
   · Cada día se mira la tanda de mojado más larga entre las 18 h del día anterior y las 18 h de ese día (la noche y su mañana).
   · El aviso sobre el horario del riego sale de la misma regla de las 6 horas: si la noche ya trae 3 a 5 horas de hoja
     mojada, un riego al atardecer puede completar las 6. No es una recomendación publicada: es aritmética sobre [1].
   · SOJA CHICA: antes de los 30 días de la siembra SAFIA no avisa por roya aunque el clima sea húmedo. El número (30 días)
     es de Osmar (4-oct-2026: "una soja recién plantada, a partir de unos 20 a 30 días recién estaría con riesgo");
     Embrapa no da días, dice "desde el cierre del surco" [1, p. 9].
   Otras enfermedades (moho blanco, manchas del maíz) NO están: no hay umbral verificado cargado. */
(function () {
  'use strict';
  var FUENTE = 'Embrapa Soja, Documentos 428 (Godoy et al., 2020)';
  var DIAS_SOJA_CHICA = 30;
  var U = { hrMojado: 90, horasMin: 6, tOptMin: 15, tOptMax: 25, horasExtremo: 8, tMin: 10, tMax: 27, casiDesde: 3 };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n, d) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function esSoja(c) { return /soja|soya/i.test(String(c || '')); }
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function ahoraLocal() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':00'; }
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function nombreDia(f, hoy) { return f === hoy ? 'hoy' : f === sumarDias(hoy, 1) ? 'mañana' : f === sumarDias(hoy, -1) ? 'ayer' : DIAS[new Date(f + 'T12:00:00').getDay()] + ' ' + f.slice(8, 10) + '/' + f.slice(5, 7); }

  // ¿Esa tanda de hoja mojada alcanza para infectar? [1] p. 10
  function favorable(horas, temp) {
    if (temp == null) return false;
    if (horas >= U.horasMin && temp >= U.tOptMin && temp <= U.tOptMax) return true;
    if (horas > U.horasExtremo && temp >= U.tMin && temp <= U.tMax) return true;
    return false;
  }
  // hourly = { time[], temperature_2m[], relative_humidity_2m[], precipitation[] } en hora local
  function analizar(hourly, ahoraISO, riegos) {
    var t = hourly.time || [], hoy = String(ahoraISO).slice(0, 10), H = t.map(function (f, i) {
      var hr = hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null, ll = hourly.precipitation ? (hourly.precipitation[i] || 0) : 0;
      return { t: f, temp: hourly.temperature_2m ? hourly.temperature_2m[i] : null, hr: hr, lluvia: ll, mojada: ll > 0 || (hr != null && hr >= U.hrMojado) };
    });
    var fechas = {}; H.forEach(function (h) { fechas[h.t.slice(0, 10)] = 1; });
    var regado = {}; (riegos || []).forEach(function (f) { regado[String(f).slice(0, 10)] = 1; });
    var dias = Object.keys(fechas).sort().map(function (f) {
      var desde = sumarDias(f, -1) + 'T18:00', hasta = f + 'T18:00', v = H.filter(function (h) { return h.t >= desde && h.t < hasta; });
      if (v.length < 18) return null;   // ventana incompleta (borde del pronóstico)
      var mejor = null, act = null;
      v.forEach(function (h, i) {
        if (h.mojada) { if (!act) act = { ini: h.t, n: 0, st: 0, nt: 0, lluvia: 0 }; act.n++; if (h.temp != null) { act.st += h.temp; act.nt++; } act.lluvia += h.lluvia; act.fin = h.t; }
        if (!h.mojada || i === v.length - 1) { if (act && (!mejor || act.n > mejor.n)) mejor = act; if (!h.mojada) act = null; }
      });
      var horas = mejor ? mejor.n : 0, temp = mejor && mejor.nt ? mejor.st / mejor.nt : null, fav = favorable(horas, temp);
      return { fecha: f, nombre: nombreDia(f, hoy), pasado: f < hoy, horas: horas, temp: temp, desde: mejor ? mejor.ini.slice(11, 16) : null, hasta: mejor ? mejor.fin.slice(11, 16) : null, lluvia: mejor ? mejor.lluvia : 0,
        favorable: fav, casi: !fav && horas >= U.casiDesde && temp != null && temp >= U.tMin && temp <= U.tMax, regado: !!(regado[f] || regado[sumarDias(f, -1)]) };
    }).filter(Boolean);
    var pas = dias.filter(function (d) { return d.pasado; }), fut = dias.filter(function (d) { return !d.pasado; });
    var favP = pas.filter(function (d) { return d.favorable; }).length, favF = fut.filter(function (d) { return d.favorable; }).length;
    return { hoy: hoy, dias: dias, pasados: pas, proximos: fut, favorablesPasados: favP, favorablesProximos: favF,
      nivel: favF >= 3 ? 'alto' : favF >= 1 || favP >= 2 ? 'medio' : 'bajo', casiProximos: fut.filter(function (d) { return d.casi; }) };
  }
  var memoria = {};
  // op = { equipoId, pastDays, forecastDays }
  function riesgoRoya(lat, lon, op) {
    op = op || {};
    var k = (+lat).toFixed(2) + ',' + (+lon).toFixed(2), m = memoria[k];
    var riegos = op.equipoId == null ? [] : (function () { try { return (JSON.parse(localStorage.getItem('eventos') || '[]') || []).filter(function (v) { return v.tipo === 'riego' && String(v.equipoId) === String(op.equipoId) && parseFloat(v.cantidad) > 0; }).map(function (v) { return v.fecha; }); } catch (e) { return []; } })();
    if (m && Date.now() - m.ts < 30 * 60000) return Promise.resolve(analizar(m.hourly, ahoraLocal(), riegos));
    if (!window.SafiaClima) return Promise.resolve(null);
    return SafiaClima.obtenerClima({ lat: lat, lon: lon, hourly: 'temperature_2m,relative_humidity_2m,precipitation', pastDays: 4, forecastDays: 6, cacheKey: 'roya:' + k }).then(function (r) {
      var h = r && r.datos && r.datos.hourly; if (!h || !h.time || !h.time.length) return null;
      memoria[k] = { ts: Date.now(), hourly: h };
      return analizar(h, ahoraLocal(), riegos);
    }).catch(function () { return null; });
  }

  function titulo(R) {
    if (R.nivel === 'alto') return 'Clima muy favorable a la roya: ' + R.favorablesProximos + ' de los próximos ' + R.proximos.length + ' días';
    if (R.favorablesProximos) return 'Clima favorable a la roya ' + R.proximos.filter(function (d) { return d.favorable; }).map(function (d) { return d.nombre; }).join(' y ');
    if (R.favorablesPasados >= 2) return 'Hubo ' + R.favorablesPasados + ' días favorables a la roya; los próximos, no';
    return 'Clima poco favorable a la roya en los próximos días';
  }
  /* ¿Ya cerró el surco? Lo dice el satélite (idea de Osmar, 4-oct-2026). Se miran las pasadas limpias desde la siembra:
     · alguna con NDVI de 0,60 o más (desde el día 20; antes el verde puede ser maleza o el cultivo anterior) → la soja casi
       cerró: se avisa por roya de ahí en adelante, aunque después el NDVI baje al madurar;
     · la última pasada es reciente (12 días o menos) y está por debajo de 0,60 → surco abierto: no se avisa;
     · no hay pasada reciente (nublado, que es justo cuando la roya importa) → se usa el día 30 desde la siembra.
     El 0,60 es un criterio de SAFIA, mirado en la soja 2025/26 del Pivot-1 de Anderson Pereira (NDVI 0,30 el día 29,
     0,60 el día 46, 0,73 el día 49, 0,92 el día 64). No está publicado como umbral de cierre del surco. */
  var NDVI_CIERRE = 0.6, NDVI_DESDE_DIA = 20, PASADA_VIEJA = 12;
  function hoyK() { return ahoraLocal().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000); }
  function etapa(op) {
    if (!op || op.dds == null) return { avisar: true, motivo: 'sin_siembra' };
    var h = hoyK(), siembra = op.siembra ? String(op.siembra).slice(0, 10) : sumarDias(h, -op.dds), serie = [];
    try { if (op.equipoId != null && window.SafiaBalance && SafiaBalance.ndviGuardado) serie = SafiaBalance.ndviGuardado(op.equipoId); } catch (e) { serie = []; }
    var pts = serie.filter(function (p) { var f = String(p.fecha).slice(0, 10); return f <= h && diasEntre(siembra, f) >= NDVI_DESDE_DIA; });
    var cerro = pts.filter(function (p) { return +p.ndvi >= NDVI_CIERRE; })[0];
    if (cerro) return { avisar: true, motivo: 'ndvi', ndvi: +cerro.ndvi, fecha: String(cerro.fecha).slice(0, 10), dia: diasEntre(siembra, cerro.fecha) };
    var ult = pts[pts.length - 1];
    if (ult && diasEntre(ult.fecha, h) <= PASADA_VIEJA) return { avisar: false, motivo: 'ndvi', ndvi: +ult.ndvi, fecha: String(ult.fecha).slice(0, 10), dia: diasEntre(siembra, ult.fecha) };
    return { avisar: op.dds >= DIAS_SOJA_CHICA, motivo: 'dias', sinPasada: op.dds >= NDVI_DESDE_DIA };
  }
  function fcorta(f) { return f.slice(8, 10) + '/' + f.slice(5, 7); }
  function chica(op) { return !etapa(op).avisar; }
  function textoChica(op) {
    var e = etapa(op), exc = 'La excepción: soja sembrada sobre soja, o con un lote vecino más adelantado que ya tenga roya. En ese caso, recorré el lote igual.';
    if (e.motivo === 'ndvi') return ['El satélite muestra la soja todavía abierta: NDVI ' + fmt(e.ndvi, 2) + ' el ' + fcorta(e.fecha) + ' (día ' + e.dia + ' desde la siembra). La roya aparece sobre todo desde que el cultivo cierra el surco: recién ahí hay humedad y sombra para que el hongo prospere. SAFIA empieza a avisar cuando el satélite muestre el surco casi cerrado (NDVI de ' + fmt(NDVI_CIERRE, 2) + ' o más).', exc];
    return ['La soja todavía es chica (día ' + op.dds + ' desde la siembra). La roya aparece sobre todo desde que el cultivo cierra el surco: recién ahí hay humedad y sombra para que el hongo prospere. SAFIA empieza a avisar cuando el satélite muestre el surco casi cerrado' + (e.sinPasada ? '; como no hay una pasada limpia en los últimos ' + PASADA_VIEJA + ' días, avisa desde el día ' + DIAS_SOJA_CHICA + '.' : ' o, si está nublado y no hay imagen, desde el día ' + DIAS_SOJA_CHICA + '.'), exc];
  }
  function notaEtapa(op) {
    var e = etapa(op);
    if (e.motivo === 'ndvi' && e.avisar) return 'El satélite mostró el surco casi cerrado el ' + fcorta(e.fecha) + ' (NDVI ' + fmt(e.ndvi, 2) + ', día ' + e.dia + ').';
    if (e.motivo === 'dias' && e.avisar) return 'No hay una pasada limpia del satélite en los últimos ' + PASADA_VIEJA + ' días: se avisa por los ' + op.dds + ' días desde la siembra.';
    return '';
  }
  function consejo(R, op) {
    if (chica(op)) return textoChica(op);
    var c = [];
    if (R.favorablesPasados) c.push('En los últimos días hubo ' + R.favorablesPasados + (R.favorablesPasados === 1 ? ' noche favorable' : ' noches favorables') + ' a la infección. Si había esporas, las manchas aparecen entre 6 y 16 días después: recorré el lote y revisá las hojas.');
    if (R.favorablesProximos) c.push('Vienen días con 6 horas o más de hoja mojada. Avisale al agrónomo: es cuando se decide la aplicación.');
    if (R.casiProximos.length) c.push((R.casiProximos.length === 1 ? 'La noche de ' + R.casiProximos[0].nombre + ' trae' : 'Hay ' + R.casiProximos.length + ' noches que traen') + ' entre 3 y 5 horas de hoja mojada. Un riego al atardecer puede completar las 6 horas: si hay que regar, mejor de madrugada o de mañana, para que la hoja se seque de día.');
    if (!c.length) c.push('Sin noches largas de hoja mojada a la vista. Igual conviene recorrer el lote una vez por semana.');
    return c;
  }
  var COL = { alto: ['#FBECEA', '#B5371C'], medio: ['#FDF3E3', '#8A5A00'], bajo: ['#E7F6EA', '#178029'] };
  function html(R, op) {
    if (!R) return '';
    if (chica(op)) return '<details><summary style="cursor:pointer;list-style-position:inside;font-size:14px;font-weight:800;color:#2E3236;">Roya de la soja: <span style="padding:2px 9px;border-radius:99px;font-size:12px;background:#EEF0F2;color:#6B7075;">' + (etapa(op).motivo === 'ndvi' ? 'surco todavía abierto, sin riesgo' : 'soja chica, todavía sin riesgo') + '</span></summary><div style="margin-top:8px;">' + textoChica(op).map(function (x) { return '<div style="font-size:13.5px;color:#2E3236;line-height:1.45;margin-bottom:6px;">' + esc(x) + '</div>'; }).join('') + '<div style="font-size:11.5px;color:#8C9196;margin-top:6px;line-height:1.45;">' + FUENTE + ', p. 9 y 12. El cierre del surco se mira con el satélite (NDVI de ' + fmt(NDVI_CIERRE, 2) + ' o más, criterio de SAFIA); sin imagen, el día ' + DIAS_SOJA_CHICA + ' (criterio de Irrigar).</div></div></details>';
    var c = COL[R.nivel], chip = function (d) { return '<span style="display:inline-block;min-width:92px;text-align:center;padding:2px 8px;border-radius:99px;font-size:11.5px;font-weight:700;background:' + (d.favorable ? '#FBECEA;color:#B5371C' : d.casi ? '#FDF3E3;color:#8A5A00' : '#EEF0F2;color:#6B7075') + ';">' + (d.favorable ? 'Favorable' : d.casi ? 'Casi' : 'No') + '</span>'; };
    var fila = function (d) { return '<tr><td style="padding:5px 6px 5px 0;border-top:1px solid #F0F2F4;white-space:nowrap;">' + esc(d.nombre) + (d.regado ? ' <span title="Se cargó un riego ese día o el anterior" style="color:#2E72C8;font-weight:700;">· riego</span>' : '') + '</td><td style="padding:5px 6px;border-top:1px solid #F0F2F4;">' + chip(d) + '</td><td style="padding:5px 0;border-top:1px solid #F0F2F4;text-align:right;color:#41464B;">' + (d.horas ? d.horas + ' h mojada' + (d.temp != null ? ' a ' + fmt(d.temp, 0) + ' °C' : '') + (d.lluvia > 0 ? ' · lluvia' : '') : 'hoja seca') + '</td></tr>'; };
    return '<details' + (op && op.abierto ? ' open' : '') + '><summary style="cursor:pointer;list-style-position:inside;font-size:14px;font-weight:800;color:#2E3236;">Roya de la soja: <span style="padding:2px 9px;border-radius:99px;font-size:12px;background:' + c[0] + ';color:' + c[1] + ';">' + esc(titulo(R)) + '</span></summary>' +
      '<div style="margin-top:8px;">' + (notaEtapa(op) ? '<div style="font-size:12.5px;color:#6B7075;line-height:1.45;margin-bottom:6px;">' + esc(notaEtapa(op)) + '</div>' : '') + consejo(R, op).map(function (x) { return '<div style="font-size:13.5px;color:#2E3236;line-height:1.45;margin-bottom:6px;">' + esc(x) + '</div>'; }).join('') +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;"><tbody>' + R.pasados.slice(-3).concat(R.proximos).map(fila).join('') + '</tbody></table>' +
      '<div style="font-size:11.5px;color:#8C9196;margin-top:8px;line-height:1.45;">No dice que haya roya: dice si el clima permite la infección. La roya necesita 6 horas o más de hoja mojada con 15 a 25 °C; con más de 27 °C durante el mojado, no cuenta (' + FUENTE + '). La hoja mojada se estima con el pronóstico (lluvia, o humedad de 90 % o más); no es una medición. El aviso sobre el horario del riego es un criterio de SAFIA a partir de esa regla. La aplicación la decide el ingeniero agrónomo.</div></div></details>';
  }
  // Pinta la tarjeta (solo soja). Devuelve la promesa con el resultado o null.
  function pintar(idCaja, lat, lon, op) {
    var c = document.getElementById(idCaja); op = op || {};
    if (!c) return Promise.resolve(null);
    if (!esSoja(op.cultivo) || lat == null || lon == null) { c.innerHTML = ''; c.style.display = 'none'; return Promise.resolve(null); }
    return riesgoRoya(lat, lon, op).then(function (R) { var h = html(R, op); c.innerHTML = h; c.style.display = h ? 'block' : 'none'; return R; });
  }
  function resumen(R, op) {
    if (!R) return null;
    if (chica(op)) return { enfermedad: 'roya asiática de la soja', lectura: (etapa(op).motivo === 'ndvi' ? 'el satélite muestra el surco todavía abierto (NDVI ' + fmt(etapa(op).ndvi, 2) + ')' : 'soja chica (día ' + op.dds + ')') + ': todavía sin riesgo de roya; SAFIA avisa cuando el satélite muestre el surco casi cerrado (NDVI ' + fmt(NDVI_CIERRE, 2) + ' o más) o, sin imagen, desde el día ' + DIAS_SOJA_CHICA, que_hacer: textoChica(op), fuente: FUENTE + ', p. 9 y 12 (la mayor incidencia es desde el cierre del surco; antes solo con mucho inóculo: soja sobre soja o lote vecino más adelantado). El día ' + DIAS_SOJA_CHICA + ' es un criterio de Irrigar.' };
    return { enfermedad: 'roya asiática de la soja', etapa_del_cultivo: notaEtapa(op) || undefined, lectura: titulo(R), dias_favorables_ultimos: R.favorablesPasados, dias_favorables_proximos: R.favorablesProximos,
      dia_por_dia: R.pasados.slice(-3).concat(R.proximos).map(function (d) { return d.nombre + ': ' + (d.favorable ? 'FAVORABLE' : d.casi ? 'casi' : 'no') + (d.horas ? ' (' + d.horas + ' h de hoja mojada' + (d.temp != null ? ' a ' + Math.round(d.temp) + ' °C' : '') + ')' : '') + (d.regado ? ', con riego cargado' : ''); }),
      que_hacer: consejo(R, op), fuente: FUENTE + ', p. 9 y 10: 6 h o más de hoja mojada con 15 a 25 °C; más de 8 h en los extremos (10 o 27 °C)',
      importante: 'No indica que haya roya en el lote: indica si el clima permite la infección. La hoja mojada es una estimación con el pronóstico (lluvia, o humedad relativa de 90 % o más). El aviso sobre el horario del riego es un criterio de SAFIA, no una recomendación publicada. SAFIA solo cubre la roya de la soja; para otras enfermedades no hay umbral cargado. La aplicación la decide el ingeniero agrónomo.' };
  }
  window.SafiaEnfermedades = { analizar: analizar, favorable: favorable, riesgoRoya: riesgoRoya, html: html, pintar: pintar, resumen: resumen, esSoja: esSoja, chica: chica, etapa: etapa, NDVI_CIERRE: NDVI_CIERRE, DIAS_SOJA_CHICA: DIAS_SOJA_CHICA, UMBRALES: U, FUENTE: FUENTE };
})();
