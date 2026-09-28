/* SAFIA — Clima y riego de un proyecto (Evaluar proyecto e informe de evaluación)
   -------------------------------------------------------------------
   1. Clima del campo por coordenada: lluvia, evapotranspiración de referencia (ETo) y temperaturas diarias de los
      últimos 10 años completos (Open-Meteo, reanálisis ERA5). Resumen anual y mensual, año más seco y más lluvioso.
   2. Riego que lleva cada cultivo del proyecto: simula el ciclo DÍA POR DÍA en cada zafra de esos 10 años con el
      motor de agua de SAFIA (SafiaBalance, FAO-56: Kc por etapa, raíz que crece, agua disponible por textura del
      suelo, agotamiento permitido p). Dos corridas por zafra:
        - con riego: cuando el agotamiento pasa el agua fácilmente disponible (RAW) se repone hasta capacidad de campo
          → riego neto; bruto = neto ÷ eficiencia del equipo (pivot 85 %, la misma de toda la app);
        - sin riego (secano): la misma zafra sin regar → cuánta agua le faltó al cultivo y cuánto rinde perdería
          (FAO-33: 1 − Ya/Ym = Ky × (1 − ETa/ETc), Ky total del cultivo).
      Pico de consumo = el mayor promedio de 7 días de ETc de todas las zafras: define el caudal que tiene que dar la fuente.
   Arranque de cada zafra: la mitad del agua fácilmente disponible ya consumida (mismo criterio que SafiaBalance.simular).
   No modela escurrimiento (FAO-56 lo desprecia en terreno plano bajo riego) ni aporte de napa.
   Uso: SafiaClimaProyecto.historico(lat, lon) → Promise(hist) · riego(hist, opciones) · caudal(...) · tarjetaHTML(...) */
(function () {
  'use strict';
  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d }); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  var B = function () { return window.SafiaBalance; };

  /* ---------- 1. clima histórico ---------- */
  var cache = {};
  function historico(lat, lon) {
    lat = num(lat); lon = num(lon);
    if (lat == null || lon == null) return Promise.reject(new Error('sin coordenadas'));
    var hasta = new Date().getFullYear() - 1, desde = hasta - 9, k = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + desde;
    if (cache[k]) return cache[k];
    try { var s = sessionStorage.getItem('clima10_' + k); if (s) { var h0 = JSON.parse(s); cache[k] = Promise.resolve(h0); return cache[k]; } } catch (e) {}
    var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + desde + '-01-01&end_date=' + hasta + '-12-31&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min&timezone=America%2FAsuncion';
    cache[k] = fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var d = j && j.daily; if (!d || !d.time) throw new Error('sin datos');
      var h = { lat: lat, lon: lon, desde: desde, hasta: hasta, fuente: 'Open-Meteo, reanálisis ERA5', time: d.time, lluvia: d.precipitation_sum, et0: d.et0_fao_evapotranspiration, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min };
      h.resumen = resumir(h);
      try { sessionStorage.setItem('clima10_' + k, JSON.stringify(h)); } catch (e) {}
      return h;
    });
    cache[k].catch(function () { delete cache[k]; });
    return cache[k];
  }
  function resumir(h) {
    var porAnio = {}, mes = MESES.map(function () { return { p: 0, e: 0, tx: 0, tn: 0, n: 0 }; });
    h.time.forEach(function (t, i) {
      var y = +t.slice(0, 4), mi = +t.slice(5, 7) - 1, p = h.lluvia[i], e = h.et0[i];
      if (!porAnio[y]) porAnio[y] = { p: 0, e: 0, meses: MESES.map(function () { return { p: 0, e: 0 }; }) };
      if (p != null) { porAnio[y].p += p; porAnio[y].meses[mi].p += p; mes[mi].p += p; }
      if (e != null) { porAnio[y].e += e; porAnio[y].meses[mi].e += e; mes[mi].e += e; }
      if (h.tmax[i] != null) { mes[mi].tx += h.tmax[i]; mes[mi].tn += h.tmin[i]; mes[mi].n++; }
    });
    var anios = Object.keys(porAnio).map(Number).sort(), N = anios.length;
    var meses = mes.map(function (m, i) { return { mes: MESES[i], lluvia: m.p / N, eto: m.e / N, tmax: m.n ? m.tx / m.n : null, tmin: m.n ? m.tn / m.n : null }; });
    // déficit climático de cada año = suma de los meses en que la ETo supera a la lluvia
    var deficits = anios.map(function (y) { return porAnio[y].meses.reduce(function (s, m) { return s + Math.max(0, m.e - m.p); }, 0); });
    var lluvias = anios.map(function (y) { return porAnio[y].p; });
    return { desde: h.desde, hasta: h.hasta, anios: N, meses: meses, porAnio: anios.map(function (y, i) { return { anio: y, lluvia: porAnio[y].p, eto: porAnio[y].e, deficit: deficits[i] }; }),
      lluviaAnual: lluvias.reduce(function (a, b) { return a + b; }, 0) / N, lluviaMin: Math.min.apply(null, lluvias), lluviaMax: Math.max.apply(null, lluvias),
      anioSeco: anios[lluvias.indexOf(Math.min.apply(null, lluvias))], anioLluvioso: anios[lluvias.indexOf(Math.max.apply(null, lluvias))],
      etoAnual: anios.reduce(function (s, y) { return s + porAnio[y].e; }, 0) / N,
      deficit: deficits.reduce(function (a, b) { return a + b; }, 0) / N, deficitMax: Math.max.apply(null, deficits),
      mesesDeficit: meses.filter(function (m) { return m.eto > m.lluvia; }).sort(function (a, b) { return (b.eto - b.lluvia) - (a.eto - a.lluvia); }).map(function (m) { return m.mes; }) };
  }
  function graficoSVG(res) {
    var W = 640, H = 200, x0 = 40, x1 = W - 10, y0 = 12, y1 = H - 26, max = Math.max.apply(null, res.meses.map(function (m) { return Math.max(m.lluvia, m.eto); })) * 1.1;
    var cw = (x1 - x0) / 12, Y = function (v) { return y1 - v / max * (y1 - y0); };
    var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var v = max * f; h += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#EEF0F2"/><text x="' + (x0 - 4) + '" y="' + (Y(v) + 3) + '" font-size="9" text-anchor="end" fill="#8C9196">' + Math.round(v) + '</text>'; });
    res.meses.forEach(function (m, i) { var xc = x0 + cw * i + cw / 2; h += '<rect x="' + (xc - cw * 0.3) + '" y="' + Y(m.lluvia) + '" width="' + (cw * 0.6) + '" height="' + (y1 - Y(m.lluvia)) + '" fill="#6FA8DC" rx="2"/><text x="' + xc + '" y="' + (y1 + 12) + '" font-size="9.5" text-anchor="middle" fill="#5B6167">' + m.mes + '</text>'; });
    h += '<polyline fill="none" stroke="#D08A1E" stroke-width="2.2" points="' + res.meses.map(function (m, i) { return (x0 + cw * i + cw / 2).toFixed(1) + ',' + Y(m.eto).toFixed(1); }).join(' ') + '"/>';
    res.meses.forEach(function (m, i) { h += '<circle cx="' + (x0 + cw * i + cw / 2) + '" cy="' + Y(m.eto) + '" r="2.6" fill="#D08A1E"/>'; });
    return h + '<text x="' + x0 + '" y="' + (H - 2) + '" font-size="9.5" fill="#5B6167">mm por mes · barras azules: lluvia promedio · línea naranja: evapotranspiración de referencia (ETo)</text></svg>';
  }

  /* ---------- 2. riego por cultivo ---------- */
  // Fecha de siembra por época cuando no se indica otra (día/mes)
  var SIEMBRA_EPOCA = { 'primavera/verano': '01/10', 'verano/otono': '10/02', 'otono/invierno': '15/05' };
  function siembraPorDefecto(cultivo, epoca) {
    var e = SIEMBRA_EPOCA[norm(epoca)]; if (e) return e;
    return /trigo|avena|cebada|canola|nabo/.test(norm(cultivo)) ? '15/05' : '01/10';
  }
  function parseDM(s) { var m = String(s || '').match(/^\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*$/); if (!m) return null; var d = +m[1], mo = +m[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return { d: d, m: mo }; }
  function textura(suelo) {
    var b = B(); if (!b) return null;
    // texturaPorAnalisis devuelve { t, clase } (triángulo USDA con arena, limo y arcilla; si falta el limo, solo por arcilla)
    var ta = suelo ? b.texturaPorAnalisis(suelo) : null;
    if (ta && ta.t) return { t: ta.t, clase: ta.clase, supuesto: false };
    return { t: b.texturaPorClave('franco'), supuesto: true };
  }
  function riego(hist, o) {
    var b = B(); if (!b || !hist) return null;
    o = o || {};
    var kcDef = b.obtenerCultivoKc(o.cultivo), nc = norm(o.cultivo);
    // nombres del proyecto que en el catálogo FAO de SAFIA tienen otro nombre
    if (!kcDef && /alfalfa/.test(nc)) kcDef = b.obtenerCultivoKc('Alfalfa');
    if (!kcDef && ((window.SafiaCasos && SafiaCasos.esPasto && SafiaCasos.esPasto(o.cultivo)) || /pastura|pasto|brachiaria|zuri|gatton|tifton|mombaca|marandu|panicum/.test(nc))) kcDef = b.obtenerCultivoKc('Pastura tropical (Brachiaria, Mombaça, Tifton)');
    if (!kcDef && /poroto|frijol|feijao/.test(nc)) kcDef = b.obtenerCultivoKc('Frijol/Poroto');
    if (!kcDef) return { cultivo: o.cultivo, error: 'SAFIA no tiene el Kc de ' + o.cultivo + ' en el catálogo FAO: no se puede calcular su riego' };
    var cu = b.claveCultivo(o.cultivo), tx = textura(o.suelo), theta = Math.max(0.02, (tx.t.cc - tx.t.pmp) / 100);
    var efic = o.eficiencia || b.EFICIENCIA_RIEGO.pivote, kyPropio = !!b.KY[cu], ky = (b.KY[cu] || b.KY.otro).total;
    var perenne = kcDef.tipo === 'perenne';
    var dm = parseDM(o.siembra) || parseDM(siembraPorDefecto(o.cultivo, o.epoca));
    var idx = {}; hist.time.forEach(function (t, i) { idx[t] = i; });
    var largo = perenne ? 365 : (+kcDef.L_ini + +kcDef.L_des + +kcDef.L_med + +kcDef.L_fin);
    var zafras = [];
    for (var y = hist.desde; y <= hist.hasta; y++) {
      var ini = perenne ? y + '-01-01' : y + '-' + String(dm.m).padStart(2, '0') + '-' + String(dm.d).padStart(2, '0');
      var i0 = idx[ini]; if (i0 == null || i0 + largo > hist.time.length) continue;   // la zafra tiene que entrar completa en los 10 años
      var drR = null, drS = null, riegoNeto = 0, lluvia = 0, etc = 0, etaS = 0, nR = 0, etcs = [], lluviaEf = 0, porMes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (var d = 0; d < largo; d++) {
        var i = i0 + d, et0 = hist.et0[i] || 0, ll = hist.lluvia[i] || 0, fecha = hist.time[i];
        var opts = {}; if (perenne) { var kp = b.calcularKc(kcDef, fecha); opts = { kcFijo: kp.kc, etapa: 'per', zrMax: kcDef.zr, p: kcDef.p }; }
        var prm = b.parametrosDia(cu, kcDef, perenne ? null : d, theta, et0, opts);
        if (drR == null) { drR = 0.5 * prm.raw; drS = 0.5 * prm.raw; }
        // con riego: si el agotamiento pasó el agua fácil, se repone hasta capacidad de campo
        var aplicar = 0; if (drR > prm.raw) { aplicar = drR; riegoNeto += aplicar; nR++; porMes[+fecha.slice(5, 7) - 1] += aplicar; }
        var r1 = b.pasoDia(drR, prm, ll + aplicar); drR = r1.dr;
        var r2 = b.pasoDia(drS, prm, ll); drS = r2.dr; etaS += r2.eta;
        lluvia += ll; etc += prm.etc; etcs.push(prm.etc); lluviaEf += Math.max(0, ll - r2.dp);
      }
      var pico7 = 0; for (var j = 0; j + 7 <= etcs.length; j++) { var s7 = 0; for (var k = 0; k < 7; k++) s7 += etcs[j + k]; pico7 = Math.max(pico7, s7 / 7); }
      var rel = etc > 0 ? Math.max(0, 1 - ky * (1 - etaS / etc)) : 1;
      zafras.push({ anio: y, etiqueta: perenne ? String(y) : (dm.m >= 7 ? y + '/' + String(y + 1).slice(2) : String(y)), inicio: ini, lluvia: lluvia, lluviaEfectiva: lluviaEf, etc: etc, riegoNeto: riegoNeto, riegoBruto: riegoNeto / efic, riegos: nR, faltaSecano: etc - etaS, rindeRelSecano: rel, pico7: pico7, porMesNeto: porMes });
    }
    if (!zafras.length) return { error: 'no hay zafras completas en los 10 años de clima' };
    var prom = function (k) { return zafras.reduce(function (a, z) { return a + z[k]; }, 0) / zafras.length; };
    var peor = zafras.reduce(function (a, z) { return z.riegoNeto > a.riegoNeto ? z : a; });
    var ord = zafras.map(function (z) { return z.riegoNeto; }).sort(function (a, b2) { return a - b2; });
    var p80 = ord[Math.min(ord.length - 1, Math.ceil(0.8 * ord.length) - 1)];   // 8 de cada 10 zafras necesitan esto o menos
    return { cultivo: o.cultivo, epoca: o.epoca || null, siembra: String(dm.d).padStart(2, '0') + '/' + String(dm.m).padStart(2, '0'), perenne: perenne, dias: largo, textura: tx.t.nombre, texturaSupuesta: tx.supuesto, eficiencia: efic, ky: ky, kyPropio: kyPropio,
      zafras: zafras, n: zafras.length, lluvia: prom('lluvia'), lluviaEfectiva: prom('lluviaEfectiva'), etc: prom('etc'), riegoNeto: prom('riegoNeto'), riegoBruto: prom('riegoBruto'), riegoNetoP80: p80, riegoBrutoP80: p80 / efic,
      peor: peor, pico7: Math.max.apply(null, zafras.map(function (z) { return z.pico7; })), rindeRelSecano: prom('rindeRelSecano'), rindeRelSecanoMin: Math.min.apply(null, zafras.map(function (z) { return z.rindeRelSecano; })),
      // riego bruto promedio de cada mes calendario (mm), para prever el agua mes a mes
      porMesBruto: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return zafras.reduce(function (a, z) { return a + z.porMesNeto[i]; }, 0) / zafras.length / efic; }) };
  }
  // Caudal para cubrir el pico: 1 mm sobre 1 ha = 10 m³
  function caudal(picoMmDia, ha, horas, efic) { if (!(picoMmDia > 0) || !(ha > 0)) return null; horas = horas || 20; efic = efic || 0.85; return picoMmDia / efic * 10 * ha / horas; }
  function haConCaudal(m3h, picoMmDia, horas, efic) { if (!(m3h > 0) || !(picoMmDia > 0)) return null; horas = horas || 20; efic = efic || 0.85; return m3h * horas * efic / (picoMmDia * 10); }

  /* ---------- 3. HTML ---------- */
  function climaHTML(hist) {
    var r = hist.resumen;
    return '<div class="statbar" style="margin:0 0 10px;">' +
      '<div class="stat"><div class="sl">Lluvia anual</div><div class="sv">' + fmt(r.lluviaAnual, 0) + ' mm</div><div class="ss">de ' + fmt(r.lluviaMin, 0) + ' (' + r.anioSeco + ') a ' + fmt(r.lluviaMax, 0) + ' (' + r.anioLluvioso + ')</div></div>' +
      '<div class="stat"><div class="sl">Demanda del ambiente (ETo)</div><div class="sv">' + fmt(r.etoAnual, 0) + ' mm</div><div class="ss">por año</div></div>' +
      '<div class="stat"><div class="sl">Déficit hídrico</div><div class="sv red">' + fmt(r.deficit, 0) + ' mm</div><div class="ss">promedio · máximo ' + fmt(r.deficitMax, 0) + ' mm</div></div>' +
      '<div class="stat"><div class="sl">Meses con más falta</div><div class="sv" style="font-size:15px;">' + esc(r.mesesDeficit.slice(0, 4).join(', ') || '—') + '</div></div></div>' +
      graficoSVG(r) +
      '<div class="muted" style="font-size:11px;margin-top:4px;">' + r.anios + ' años completos (' + r.desde + '–' + r.hasta + ') en la coordenada del campo (' + fmt(hist.lat, 4) + ', ' + fmt(hist.lon, 4) + '), datos diarios de ' + esc(hist.fuente) + '. Déficit = suma de los meses en que la ETo supera a la lluvia.</div>';
  }
  function riegoHTML(lista, op) {
    op = op || {};
    var ok = lista.filter(function (x) { return x && !x.error; });
    var h = '';
    if (!ok.length) return '<div class="note">' + esc((lista[0] && lista[0].error) || 'Sin cultivos para simular.') + '</div>';
    h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Cultivo · siembra</th><th class="r">Lluvia en el ciclo</th><th class="r">Consumo del cultivo (ETc)</th><th class="r">Riego neto</th><th class="r">Riego bruto</th><th class="r">Pico de consumo</th><th class="r">Sin riego rendiría</th></tr></thead><tbody>' +
      ok.map(function (x) {
        return '<tr><td><b>' + esc(x.cultivo) + '</b><div class="sub">' + (x.perenne ? 'todo el año' : 'siembra ' + esc(x.siembra) + ' · ' + x.dias + ' días') + ' · ' + x.n + ' ' + (x.perenne ? 'años' : 'zafras') + '</div></td>' +
          '<td class="r">' + fmt(x.lluvia, 0) + ' mm</td><td class="r">' + fmt(x.etc, 0) + ' mm</td>' +
          '<td class="r"><b>' + fmt(x.riegoNeto, 0) + ' mm</b><div class="sub">8 de cada 10: hasta ' + fmt(x.riegoNetoP80, 0) + ' · peor ' + fmt(x.peor.riegoNeto, 0) + ' (' + esc(x.peor.etiqueta) + ')</div></td>' +
          '<td class="r"><b>' + fmt(x.riegoBruto, 0) + ' mm</b><div class="sub">eficiencia ' + fmt(x.eficiencia * 100, 0) + ' %</div></td>' +
          '<td class="r">' + fmt(x.pico7, 1) + ' mm/día<div class="sub">promedio de 7 días</div></td>' +
          '<td class="r" style="white-space:normal;"><b style="color:' + (x.rindeRelSecano < 0.8 ? '#B3261E' : '#8B6F00') + ';">' + fmt(x.rindeRelSecano * 100, 0) + ' %</b><div class="sub">del potencial · peor zafra ' + fmt(x.rindeRelSecanoMin * 100, 0) + ' %</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    // volúmenes de agua a prever para la superficie del proyecto (1 mm sobre 1 ha = 10 m³); el diseño de pozos y reservorio es del proyecto
    var ha = num(op.superficieHa), M = function (mm) { return ha > 0 ? fmt(mm * 10 * ha, 0) + ' m³' : fmt(mm, 0) + ' mm'; };
    h += '<div style="font-weight:700;margin-top:14px;">Agua a prever' + (ha > 0 ? ' para ' + fmt(ha, 0) + ' ha' : '') + '</div>';
    if (!(ha > 0)) h += '<div class="muted" style="font-size:12px;margin:2px 0 4px;">Cargá la superficie a regar (paso 0) para verlo en metros cúbicos; mientras tanto va en mm (1 mm sobre 1 ha = 10 m³).</div>';
    h += '<div class="tablewrap" style="margin-top:6px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>Cultivo</th><th class="r">Por ciclo, promedio</th><th class="r">8 de cada 10 zafras</th><th class="r">Zafra más seca</th><th class="r">Día de más consumo</th></tr></thead><tbody>' +
      ok.map(function (x) { return '<tr><td><b>' + esc(x.cultivo) + '</b></td><td class="r"><b>' + M(x.riegoBruto) + '</b></td><td class="r">' + M(x.riegoBrutoP80) + '</td><td class="r">' + M(x.peor.riegoBruto) + '<div class="sub">' + esc(x.peor.etiqueta) + '</div></td><td class="r">' + M(x.pico7 / x.eficiencia) + '<div class="sub">por día (' + fmt(x.pico7, 1) + ' mm de consumo)</div></td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    // mes por mes (riego bruto promedio), para planificar la reserva de agua
    var usados = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(function (i) { return ok.some(function (x) { return x.porMesBruto[i] >= 0.5; }); });
    if (usados.length) {
      var tot = function (i) { return ok.reduce(function (a, x) { return a + x.porMesBruto[i]; }, 0); };
      h += '<div style="font-weight:600;font-size:13px;margin-top:10px;">Mes por mes (promedio de las zafras)</div><div class="tablewrap" style="margin-top:6px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>Cultivo</th>' + usados.map(function (i) { return '<th class="r">' + MESES[i] + '</th>'; }).join('') + '</tr></thead><tbody>' +
        ok.map(function (x) { return '<tr><td>' + esc(x.cultivo) + '</td>' + usados.map(function (i) { return '<td class="r">' + (x.porMesBruto[i] >= 0.5 ? M(x.porMesBruto[i]) : '<span class="muted">—</span>') + '</td>'; }).join('') + '</tr>'; }).join('') +
        (ok.length > 1 ? '<tr><td><b>Todos</b><div class="sub">si van en la misma superficie</div></td>' + usados.map(function (i) { return '<td class="r"><b>' + M(tot(i)) + '</b></td>'; }).join('') + '</tr>' : '') +
        '</tbody></table></div></div>';
    }
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Agua bruta que tiene que salir del equipo (eficiencia ' + fmt(ok[0].eficiencia * 100, 0) + ' %). Cuántos pozos, qué caudal y qué reservorio hacen falta para tener esa agua cuando se la necesita lo resuelve el proyecto de riego.</div>';
    // detalle por zafra
    h += ok.map(function (x) {
      return '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Zafra por zafra: ' + esc(x.cultivo) + '</summary><div class="tablewrap" style="margin-top:6px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>' + (x.perenne ? 'Año' : 'Zafra') + '</th><th class="r">Lluvia</th><th class="r">ETc</th><th class="r">Riego neto</th><th class="r">Riego bruto</th><th class="r">Sin riego rendiría</th></tr></thead><tbody>' +
        x.zafras.map(function (z) { return '<tr><td>' + esc(z.etiqueta) + '<div class="sub">desde ' + esc(z.inicio.split('-').reverse().join('/')) + '</div></td><td class="r">' + fmt(z.lluvia, 0) + '</td><td class="r">' + fmt(z.etc, 0) + '</td><td class="r"><b>' + fmt(z.riegoNeto, 0) + '</b></td><td class="r">' + fmt(z.riegoBruto, 0) + '</td><td class="r">' + fmt(z.rindeRelSecano * 100, 0) + ' %</td></tr>'; }).join('') +
        '</tbody></table></div></div></details>';
    }).join('');
    var kyGen = ok.filter(function (x) { return !x.kyPropio; });
    if (kyGen.length) h += '<div class="muted" style="font-size:11px;margin-top:6px;">' + kyGen.map(function (x) { return esc(x.cultivo); }).join(', ') + ': FAO-33 no publica un factor de respuesta del rinde al agua (Ky) para este cultivo; "sin riego rendiría" usa Ky 1,0 (la producción baja en la misma proporción que el agua que le falta). Tomalo como orientación.</div>';
    var sinKc = lista.filter(function (x) { return x && x.error; });
    if (sinKc.length) h += '<div class="note" style="margin-top:8px;">' + sinKc.map(function (x) { return esc(x.error); }).join('<br>') + '.</div>';
    var supuesto = ok.some(function (x) { return x.texturaSupuesta; });
    h += '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5;">Simulación día por día de cada zafra con el clima real de la coordenada (FAO-56: Kc por etapa del catálogo FAO de SAFIA, raíz que crece, agua disponible del suelo ' + (supuesto ? '<b>franco supuesto (falta el análisis con arcilla)</b>' : esc(ok[0].textura.toLowerCase()) + ' según el análisis') + ', riego cuando se consume el agua fácilmente disponible). Riego neto = lo que tiene que llegar al suelo; bruto = neto ÷ eficiencia del equipo. "Sin riego rendiría" = rinde relativo por falta de agua en secano (FAO-33, Ky del cultivo); no incluye otras pérdidas. No incluye escurrimiento ni napa. El pico define el caudal: 1 mm sobre 1 ha son 10 m³.</div>';
    return h;
  }
  // Riego anual bruto de todo el proyecto (para el cálculo de yeso y ácido del análisis de agua)
  function laminaAnualProyecto(lista) {
    var ok = (lista || []).filter(function (x) { return x && !x.error; });
    return ok.length ? Math.round(ok.reduce(function (a, x) { return a + x.riegoBruto; }, 0)) : null;
  }

  /* ---------- 4. mapa de lluvias y déficit de Paraguay (grilla ERA5 guardada en safia-clima-py.js) ----------
     Dibujo propio (SVG con la imagen interpolada adentro): se ve igual en pantalla y en el PDF. Entre los puntos
     de la grilla (cada ~100 km) el color se interpola por distancia (IDW); el campo muestra su valor exacto. */
  var CIUDADES = [['Asunción', -25.28, -57.63], ['Ciudad del Este', -25.51, -54.61], ['Encarnación', -27.33, -55.87], ['Concepción', -23.41, -57.43], ['Pedro Juan Caballero', -22.55, -55.73], ['Filadelfia', -22.35, -60.03], ['Salto del Guairá', -24.06, -54.31], ['Coronel Oviedo', -25.45, -56.44], ['Fuerte Olimpo', -21.04, -57.87]];
  var ESCALAS = {
    lluvia: { titulo: 'Lluvia anual (mm)', cortes: [700, 900, 1100, 1300, 1500, 1700], colores: ['#C9A26B', '#E3CF94', '#EEF0C2', '#BFE3C8', '#7FC4D6', '#3F8FC4', '#1F5E9E'] },
    deficit: { titulo: 'Déficit: agua que falta por año (mm)', cortes: [200, 400, 600, 800, 1000], colores: ['#DCEFD6', '#F4EDB0', '#F2CF87', '#EBA565', '#D96F4B', '#B23A2E'] }
  };
  function colorDe(esc, v) { var i = 0; while (i < esc.cortes.length && v >= esc.cortes[i]) i++; return esc.colores[i]; }
  function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function idw(puntos, capa, lat, lon) {
    var s = 0, w = 0;
    for (var i = 0; i < puntos.length; i++) { var p = puntos[i], d2 = (p.lat - lat) * (p.lat - lat) + (p.lon - lon) * (p.lon - lon); if (d2 < 1e-6) return p[capa]; var wi = 1 / d2; s += wi * p[capa]; w += wi; }
    return s / w;
  }
  function mapaSVG(capa, campo) {
    var G = window.SAFIA_CLIMA_PY; if (!G || !G.puntos || !G.puntos.length) return '<div class="note">El mapa de lluvias todavía no está cargado.</div>';
    capa = ESCALAS[capa] ? capa : 'lluvia'; var E = ESCALAS[capa];
    var lon0 = -62.8, lon1 = -54.1, lat0 = -27.75, lat1 = -19.15, k = Math.cos(23.5 * Math.PI / 180), W = 560, H = Math.round(W * (lat1 - lat0) / ((lon1 - lon0) * k));
    var X = function (lo) { return (lo - lon0) / (lon1 - lon0) * W; }, Y = function (la) { return (lat1 - la) / (lat1 - lat0) * H; };
    // imagen interpolada (canvas → PNG) recortada al contorno de Paraguay
    var img = '';
    try {
      var cw = 280, ch = Math.round(cw * H / W), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d'), data = ctx.createImageData(cw, ch);
      for (var py = 0; py < ch; py++) for (var px = 0; px < cw; px++) {
        var lo = lon0 + (px + 0.5) / cw * (lon1 - lon0), la = lat1 - (py + 0.5) / ch * (lat1 - lat0), rgb = hexRGB(colorDe(E, idw(G.puntos, capa, la, lo))), o = (py * cw + px) * 4;
        data.data[o] = rgb[0]; data.data[o + 1] = rgb[1]; data.data[o + 2] = rgb[2]; data.data[o + 3] = 255;
      }
      ctx.putImageData(data, 0, 0); img = cv.toDataURL('image/png');
    } catch (e) { img = ''; }
    var poly = G.contorno.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ');
    var id = 'pyclip' + Math.floor(Math.random() * 1e6);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:620px;height:auto;font-family:inherit;background:#F7F8F9;border-radius:10px;">' +
      '<defs><clipPath id="' + id + '"><polygon points="' + poly + '"/></clipPath></defs>' +
      (img ? '<image href="' + img + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none" clip-path="url(#' + id + ')" style="image-rendering:auto;"/>' : '') +
      '<polygon points="' + poly + '" fill="none" stroke="#3A3F44" stroke-width="1.4"/>' +
      '<line x1="' + X(-62.8) + '" y1="' + Y(-25) + '" x2="' + X(-54.1) + '" y2="' + Y(-25) + '" stroke="#C0392B" stroke-width="1.6" stroke-dasharray="7 5"/><text x="' + (X(-62.6)) + '" y="' + (Y(-25) - 5) + '" font-size="11" fill="#C0392B" font-weight="700">Paralelo 25</text>';
    CIUDADES.forEach(function (c) { s += '<circle cx="' + X(c[2]).toFixed(1) + '" cy="' + Y(c[1]).toFixed(1) + '" r="2.6" fill="#1B1F23"/><text x="' + (X(c[2]) + 4).toFixed(1) + '" y="' + (Y(c[1]) + 3.5).toFixed(1) + '" font-size="10" fill="#1B1F23" stroke="#fff" stroke-width="2.5" paint-order="stroke">' + esc(c[0]) + '</text>'; });
    if (campo && campo.lat != null && campo.lon != null) {
      var cx = X(campo.lon), cy = Y(campo.lat);
      s += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="7" fill="#22A93A" stroke="#fff" stroke-width="2.5"/><text x="' + (cx + 10).toFixed(1) + '" y="' + (cy + 4).toFixed(1) + '" font-size="12" font-weight="700" fill="#0F3D14" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(campo[capa] != null ? 'Tu campo · ' + fmt(campo[capa], 0) + ' mm' : 'Tu campo') + '</text>';
    }
    // leyenda
    var lx = 12, ly = H - 16 - 18 * E.colores.length;
    s += '<rect x="' + (lx - 6) + '" y="' + (ly - 22) + '" width="178" height="' + (18 * E.colores.length + 30) + '" rx="8" fill="#fff" fill-opacity=".92"/><text x="' + lx + '" y="' + (ly - 7) + '" font-size="11" font-weight="700" fill="#1B1F23">' + esc(E.titulo) + '</text>';
    E.colores.forEach(function (col, i) {
      var txt = i === 0 ? 'menos de ' + fmt(E.cortes[0], 0) : (i === E.colores.length - 1 ? 'más de ' + fmt(E.cortes[i - 1], 0) : fmt(E.cortes[i - 1], 0) + ' a ' + fmt(E.cortes[i], 0));
      s += '<rect x="' + lx + '" y="' + (ly + i * 18) + '" width="16" height="12" fill="' + col + '" stroke="#999" stroke-width=".5"/><text x="' + (lx + 22) + '" y="' + (ly + i * 18 + 10) + '" font-size="10.5" fill="#1B1F23">' + txt + '</text>';
    });
    return s + '</svg>';
  }
  function mapaHTML(campo) {
    var G = window.SAFIA_CLIMA_PY; if (!G) return '';
    var uid = 'mpy' + Math.floor(Math.random() * 1e6);
    return '<div class="mapa-py" id="' + uid + '" style="margin-top:12px;"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;"><b style="font-size:14px;">Lluvia y déficit en Paraguay</b>' +
      '<button type="button" class="btn" style="padding:3px 10px;font-size:12px;" data-mapa-capa="lluvia" data-mapa-id="' + uid + '">Lluvia anual</button><button type="button" class="btn" style="padding:3px 10px;font-size:12px;" data-mapa-capa="deficit" data-mapa-id="' + uid + '">Déficit</button></div>' +
      '<div class="mapa-py-svg" data-lat="' + (campo && campo.lat != null ? campo.lat : '') + '" data-lon="' + (campo && campo.lon != null ? campo.lon : '') + '" data-lluvia="' + (campo && campo.lluvia != null ? Math.round(campo.lluvia) : '') + '" data-deficit="' + (campo && campo.deficit != null ? Math.round(campo.deficit) : '') + '">' + mapaSVG('lluvia', campo) + '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:4px;">Promedio ' + esc(G.periodo) + ' en ' + G.puntos.length + ' puntos de Paraguay (uno cada ~100 km), ' + esc(G.fuente) + ', la misma fuente que el clima de cada campo. Entre los puntos el color se interpola: sirve para ver la franja, el número exacto del campo es el de arriba. Déficit = suma de los meses en que la evapotranspiración supera a la lluvia.</div></div>';
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-mapa-capa]') : null; if (!b) return;
    var cont = document.getElementById(b.getAttribute('data-mapa-id')); if (!cont) return;
    var box = cont.querySelector('.mapa-py-svg'), lat = num(box.getAttribute('data-lat')), lon = num(box.getAttribute('data-lon'));
    box.innerHTML = mapaSVG(b.getAttribute('data-mapa-capa'), lat != null && lon != null ? { lat: lat, lon: lon, lluvia: num(box.getAttribute('data-lluvia')), deficit: num(box.getAttribute('data-deficit')) } : null);
  });

  window.SafiaClimaProyecto = { mapaSVG: mapaSVG, mapaHTML: mapaHTML, historico: historico, resumir: resumir, graficoSVG: graficoSVG, riego: riego, caudal: caudal, haConCaudal: haConCaudal, siembraPorDefecto: siembraPorDefecto, climaHTML: climaHTML, riegoHTML: riegoHTML, laminaAnualProyecto: laminaAnualProyecto };
})();
