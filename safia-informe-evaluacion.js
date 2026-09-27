/* SAFIA — Informe de evaluación de proyecto de riego (informe-evaluacion.html)
   -------------------------------------------------------------------
   Hoja A4 imprimible (Guardar como PDF) para el prospecto o el inversor, a partir de una
   evaluación guardada en Evaluar proyecto: resumen ejecutivo, ubicación y clima de los
   últimos 10 años (Open-Meteo, lluvia vs ETo y déficit), suelo (SafiaAgro), agua de riego
   (SafiaCalidadAgua), potencial por cultivo (casos parecidos SIN nombres de otros
   productores + referencia regional), la zona (referencia agrícola y forrajera de SAFIA)
   y conclusiones. Mismo logo, firma y envío que el informe del cliente (config/informe.json). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, dec) { if (n === null || n === undefined || n === '' || isNaN(n)) return '—'; return Number(n).toLocaleString('es-PY', { maximumFractionDigits: dec === undefined ? 1 : dec }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function toast(m, err) { var e = $('estado'); e.textContent = m; e.style.color = err ? '#C0392B' : '#8C9196'; }
  function tabla(enc, filas) { return '<table class="tbl"><thead><tr>' + enc.map(function (e) { return '<th' + (e.r ? ' class="r"' : '') + (e.w ? ' style="width:' + e.w + '%"' : '') + '>' + e.t + '</th>'; }).join('') + '</tr></thead><tbody>' + (filas.length ? filas.join('') : '<tr><td colspan="' + enc.length + '" class="muted">Sin datos</td></tr>') + '</tbody></table>'; }
  function td(v, r) { return '<td' + (r ? ' class="r"' : '') + '>' + v + '</td>'; }
  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var LOGO = '<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg"><path d="M 50 8 Q 12 50 12 80 Q 12 110 50 110 Q 88 110 88 80 Q 88 50 50 8 Z" fill="#22A93A"/><path d="M50 30v70M50 60L32 48M50 78l18-14" stroke="#0F3D14" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';

  var ev = null, campo = null, cliente = null, config = {}, refProd = null, refForraje = null, clima = null, climaEstado = 'pendiente';

  /* ---------- datos de la evaluación ---------- */
  function evaluaciones() { return leer('evaluaciones').slice().sort(function (a, b) { return String(b.fechaModificacion || b.fecha).localeCompare(String(a.fechaModificacion || a.fecha)); }); }
  function elegir(id) {
    ev = evaluaciones().find(function (e) { return String(e.id) === String(id); }) || null;
    campo = ev ? leer('campos').find(function (c) { return String(c.id) === String(ev.campoId); }) || null : null;
    cliente = ev ? leer('clientes').find(function (c) { return String(c.id) === String(ev.clienteId); }) || null : null;
    clima = null; climaEstado = 'pendiente';
  }
  function ubic() { var u = (ev && ev.ubicacion) || {}; return { lat: u.lat != null ? u.lat : num(campo && campo.latitud), lon: u.lon != null ? u.lon : num(campo && campo.longitud), altitud: u.altitud != null ? u.altitud : num(campo && campo.altitud), localidad: u.localidad || (campo && campo.localidad) || '', depto: u.departamento || (campo && campo.departamento) || '', pais: u.pais || (campo && campo.pais) || 'Paraguay' }; }
  function suelo() { var a = ev && ev.analisisId ? leer('analisis_suelo').find(function (x) { return String(x.id) === String(ev.analisisId); }) : null; return a || (ev && ev.suelo) || null; }
  function agua() { var a = ev && ev.aguaId ? leer('analisis_agua').find(function (x) { return String(x.id) === String(ev.aguaId); }) : null; return a || (ev && ev.agua) || null; }
  function cultivos() { return ((ev && ev.cultivos) || []).filter(function (c) { return c && c.cultivo; }); }
  function tieneSuelo(s) { return s && ['ph', 'p', 'k', 'ca', 'mg', 'arcilla', 'mo'].some(function (k) { return num(s[k]) != null; }); }

  /* ---------- nube: referencia agrícola y forrajera, clima de 10 años ---------- */
  function cargarReferencias() {
    if (!window.safiaSupabase) return Promise.resolve();
    return Promise.all([
      window.safiaSupabase.from('safia_ref_produccion').select('localidad,departamento,anio,cultivo,finalidad,epoca_siembra,riego,prod_ton_ha').then(function (r) { refProd = r.data || []; }, function () { refProd = []; }),
      window.safiaSupabase.from('safia_ref_forraje_mensual').select('region,tipo_pastura,forma_producida,anio,ene,feb,mar,abr,may,jun,jul,ago,sep,oct,nov,dic').then(function (r) { refForraje = r.data || []; }, function () { refForraje = []; })
    ]);
  }
  // Clima de los últimos 10 años completos (Open-Meteo, reanálisis ERA5): lluvia y ETo por mes y por año
  function cargarClima() {
    var u = ubic(); if (u.lat == null || u.lon == null) { climaEstado = 'sin coordenadas'; return Promise.resolve(); }
    var hasta = new Date().getFullYear() - 1, desde = hasta - 9;
    var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + u.lat + '&longitude=' + u.lon + '&start_date=' + desde + '-01-01&end_date=' + hasta + '-12-31&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min&timezone=auto';
    climaEstado = 'cargando';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var d = j && j.daily; if (!d || !d.time) { climaEstado = 'sin datos'; return; }
      var porAnio = {}, mes = MESES.map(function () { return { p: 0, e: 0, tx: 0, tn: 0, n: 0 }; });
      d.time.forEach(function (t, i) {
        var y = +t.slice(0, 4), mi = +t.slice(5, 7) - 1, p = d.precipitation_sum[i], e = d.et0_fao_evapotranspiration[i];
        if (!porAnio[y]) porAnio[y] = { p: 0, e: 0, meses: MESES.map(function () { return { p: 0, e: 0 }; }) };
        if (p != null) { porAnio[y].p += p; porAnio[y].meses[mi].p += p; mes[mi].p += p; }
        if (e != null) { porAnio[y].e += e; porAnio[y].meses[mi].e += e; mes[mi].e += e; }
        if (d.temperature_2m_max[i] != null) { mes[mi].tx += d.temperature_2m_max[i]; mes[mi].tn += d.temperature_2m_min[i]; mes[mi].n++; }
      });
      var anios = Object.keys(porAnio).map(Number).sort(), N = anios.length;
      var meses = mes.map(function (m, i) { return { mes: MESES[i], lluvia: m.p / N, eto: m.e / N, tmax: m.n ? m.tx / m.n : null, tmin: m.n ? m.tn / m.n : null }; });
      // déficit climático de cada año = suma de los meses en que la ETo supera a la lluvia
      var deficits = anios.map(function (y) { return porAnio[y].meses.reduce(function (s, m) { return s + Math.max(0, m.e - m.p); }, 0); });
      var lluvias = anios.map(function (y) { return porAnio[y].p; });
      clima = { desde: desde, hasta: hasta, anios: N, meses: meses,
        lluviaAnual: lluvias.reduce(function (a, b) { return a + b; }, 0) / N, lluviaMin: Math.min.apply(null, lluvias), lluviaMax: Math.max.apply(null, lluvias),
        anioSeco: anios[lluvias.indexOf(Math.min.apply(null, lluvias))], anioLluvioso: anios[lluvias.indexOf(Math.max.apply(null, lluvias))],
        etoAnual: anios.reduce(function (s, y) { return s + porAnio[y].e; }, 0) / N,
        deficit: deficits.reduce(function (a, b) { return a + b; }, 0) / N, deficitMax: Math.max.apply(null, deficits),
        mesesDeficit: meses.filter(function (m) { return m.eto > m.lluvia; }).sort(function (a, b) { return (b.eto - b.lluvia) - (a.eto - a.lluvia); }).map(function (m) { return m.mes; }) };
      climaEstado = 'ok';
    }).catch(function () { climaEstado = 'sin conexión'; });
  }

  /* ---------- cálculos ---------- */
  function ambitoRef() {
    var u = ubic(); if (!refProd || !refProd.length) return null;
    var nl = (window.SafiaCasos && SafiaCasos.normLoc) || norm;
    var loc = u.localidad ? refProd.filter(function (x) { return nl(x.localidad) === nl(u.localidad); }) : [];
    if (loc.length) return { filas: loc, nombre: u.localidad, nivel: 'localidad' };
    var dep = u.depto ? refProd.filter(function (x) { return norm(x.departamento) === norm(u.depto); }) : [];
    if (dep.length) return { filas: dep, nombre: u.depto, nivel: 'departamento' };
    return null;
  }
  function promedio(l) { var v = l.map(function (x) { return Number(x.prod_ton_ha); }).filter(function (n) { return !isNaN(n) && n > 0; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length * 1000 : null; }
  // grano comercial y sin mezclar épocas (SafiaCasos.refRegional)
  function refCultivo(cultivo, epoca) {
    var a = ambitoRef(); if (!a || !window.SafiaCasos) return null;
    var rr = SafiaCasos.refRegional(a.filas, cultivo, epoca); if (!rr) return null;
    return { riego: rr.riego, secano: rr.secano, n: rr.n, epoca: rr.epoca, ambito: a.nombre, nivel: a.nivel };
  }
  function potenciales() {
    var u = ubic(), s = suelo(), casos = window.SafiaCasos ? SafiaCasos.armarCasos() : [];
    return cultivos().map(function (c) {
      var p = { lat: u.lat, lon: u.lon, altitud: u.altitud, suelo: tieneSuelo(s) ? s : null, cultivo: c.cultivo, epoca: c.epoca || null, objetivoKgHa: num(c.objetivoKgHa) };
      var r = window.SafiaCasos ? SafiaCasos.evaluar(p, casos, { maxCasos: 5, radioKm: 300, riego: true }) : { similares: [], potencial: null };
      return { c: c, p: p, r: r, ref: refCultivo(c.cultivo, c.epoca) };
    });
  }
  function lecturaAgua() {
    var a = agua(); if (!a || !window.SafiaCalidadAgua) return null;
    var s = suelo(), op = { aspersion: true, cultivos: cultivos().map(function (c) { return c.cultivo; }), sueloFino: !!(s && num(s.arcilla) >= 35), textura: SafiaCalidadAgua.texturaDoneen(s), laminaMm: a.laminaAnualMm };
    return { a: a, op: op, L: SafiaCalidadAgua.interpretar(a, op) };
  }
  function lecturaSuelo() {
    var s = suelo(); if (!tieneSuelo(s) || !window.SafiaAgro) return null;
    var cu = cultivos()[0] ? cultivos()[0].cultivo : 'Soja', obj = cultivos()[0] ? num(cultivos()[0].objetivoKgHa) : null;
    var inter = SafiaAgro.interpretarSuelo(s, cu), recs = SafiaAgro.recomendaciones(s, cu, obj);
    return { s: s, cultivo: cu, inter: inter, recs: recs, limitan: inter.filter(function (i) { return i.estado === 'limita'; }).map(function (i) { return i.n; }) };
  }

  /* ---------- secciones ---------- */
  function cabecera() {
    var u = ubic(), hoy = new Date();
    var marca = config.logo ? '<img class="logo" src="' + config.logo + '" alt="' + esc(config.empresa || '') + '"><div><div class="t1" style="font-size:15px;">' + esc(config.empresa || 'SAFIA') + '</div><div class="t2">EVALUACIÓN DE PROYECTO · SAFIA</div></div>' : LOGO + '<div><div class="t1">SAFIA</div><div class="t2">SMART · AGRO · INTELLIGENCE' + (config.empresa ? ' · ' + esc(config.empresa.toUpperCase()) : '') + '</div></div>';
    return '<div class="cab"><div class="marca">' + marca + '</div><div class="der"><div style="font-size:11px;color:#8C9196;">EVALUACIÓN DE PROYECTO DE RIEGO</div><div><b>' + esc(cliente ? cliente.nombre : '') + '</b></div><div>' + esc(campo ? campo.nombre : '') + '</div><div class="sub">' + esc([u.localidad, u.depto, u.pais].filter(Boolean).join(', ')) + '</div><div class="sub">' + hoy.toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }) + ($('autor').value ? ' · ' + esc($('autor').value) : '') + '</div></div></div>' +
      '<h1 style="margin-top:14px;">Proyecto de riego · ' + esc(campo ? campo.nombre : '') + '</h1><div class="sub">Estrategia: <b>' + esc(ev.nombre || '') + '</b>' + (ev.superficieHa ? ' · ' + fmt(ev.superficieHa, 0) + ' ha' : '') + ' · evaluación del ' + fmtF(String(ev.fechaModificacion || ev.fecha).slice(0, 10)) + '</div>' +
      (ev.notas ? '<div class="note" style="margin-top:8px;"><b>Notas del proyecto:</b> ' + esc(ev.notas) + '</div>' : '');
  }
  function secResumen(P, LA, LS) {
    var aguaK = LA ? LA.L.veredicto.k : null, aguaCol = { ok: '#178029', cuidado: '#B8731A', grave: '#C0392B' }[aguaK] || '#5B6167';
    var kpis = '<div class="kpis">' +
      '<div class="kpi"><div class="sl">Superficie</div><div class="sv">' + (ev.superficieHa ? fmt(ev.superficieHa, 0) + ' ha' : '—') + '</div><div class="ss">' + esc(cultivos().map(function (c) { return c.cultivo; }).join(' + ') || 'sin cultivos') + '</div></div>' +
      '<div class="kpi"><div class="sl">Agua de riego</div><div class="sv" style="color:' + aguaCol + ';font-size:14px;">' + (LA ? esc(LA.L.veredicto.titulo.split(':')[0]) : 'Sin análisis') + '</div><div class="ss">' + (LA && LA.L.r.clase ? 'clase ' + esc(LA.L.r.clase.txt) + ' · RAS ' + fmt(LA.L.r.ras, 1) : 'falta el análisis del agua') + '</div></div>' +
      '<div class="kpi"><div class="sl">Suelo</div><div class="sv" style="font-size:14px;">' + (LS ? (LS.limitan.length ? 'Limita: ' + esc(LS.limitan.slice(0, 2).join(', ')) : 'Sin limitantes fuertes') : 'Sin análisis') + '</div><div class="ss">' + (LS ? 'para ' + esc(LS.cultivo.toLowerCase()) : 'falta el análisis de suelo') + '</div></div>' +
      '<div class="kpi"><div class="sl">Déficit hídrico anual</div><div class="sv">' + (clima ? fmt(clima.deficit, 0) + ' mm' : '—') + '</div><div class="ss">' + (clima ? 'ETo ' + fmt(clima.etoAnual, 0) + ' vs lluvia ' + fmt(clima.lluviaAnual, 0) + ' mm (' + clima.desde + '–' + clima.hasta + ')' : (climaEstado === 'cargando' ? 'cargando el clima…' : 'sin clima')) + '</div></div></div>';
    var filas = P.map(function (x) {
      var pot = x.r.potencial ? x.r.potencial.estimado : null, rie = x.ref ? x.ref.riego : null, sec = x.ref ? x.ref.secano : null, con = pot != null ? pot : rie;
      var gana = con != null && sec != null ? con - sec : null;
      return '<tr>' + td('<b>' + esc(x.c.cultivo) + '</b>' + ((x.c.epoca || (x.ref && x.ref.epoca)) ? '<div class="sub">' + esc(x.c.epoca || x.ref.epoca) + '</div>' : '')) + td(fmt(num(x.c.objetivoKgHa), 0), 1) +
        td(pot != null ? '<b>' + fmt(pot, 0) + '</b><div class="sub">' + x.r.potencial.nCasos + ' caso(s) cercanos</div>' : '<span class="sub">' + (x.r.fueraDeRadio ? 'sin casos a menos de 300 km' : 'sin casos') + '</span>', 1) +
        td(fmt(rie, 0), 1) + td(fmt(sec, 0), 1) + td(gana != null ? '<b style="color:#178029;">+' + fmt(gana, 0) + '</b><div class="sub">+' + fmt(gana / sec * 100, 0) + ' %</div>' : '—', 1) + '</tr>';
    });
    return '<h2>Resumen ejecutivo</h2>' + kpis + tabla([{ t: 'Cultivo', w: 18 }, { t: 'Objetivo kg/ha', r: 1, w: 13 }, { t: 'Potencial con riego (casos)', r: 1, w: 19 }, { t: 'Zona con riego', r: 1, w: 15 }, { t: 'Zona secano', r: 1, w: 15 }, { t: 'Lo que suma el riego', r: 1, w: 20 }], filas) +
      '<div class="sub" style="margin-top:4px;">Kilos de grano comercial en silo por hectárea, comparando la misma época de siembra. Zona: referencia agrícola de SAFIA' + (P[0] && P[0].ref ? ' (' + esc(P[0].ref.ambito) + ', ' + (P[0].ref.nivel === 'localidad' ? 'localidad' : 'promedio del departamento') + ')' : '') + '. Lo que suma el riego = potencial con riego (o la zona con riego si no hay casos cercanos) menos la zona en secano.</div>' +
      '<h3>Conclusión</h3><ul>' + conclusiones(P, LA, LS).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
  }
  function conclusiones(P, LA, LS) {
    var out = [];
    if (LA) out.push('<b>Agua:</b> ' + esc(LA.L.veredicto.titulo) + '. ' + esc(LA.L.veredicto.k === 'grave' ? (LA.L.veredicto.motivos || [LA.L.veredicto.detalle])[0] : (LA.L.plan[0] ? LA.L.plan.slice(0, 3).map(function (p) { return p.t; }).join('; ') : '')) + '.');
    else out.push('<b>Agua:</b> falta el análisis del agua de la fuente de riego; es lo primero a resolver antes de invertir.');
    if (LS) out.push('<b>Suelo:</b> ' + (LS.limitan.length ? 'limita ' + esc(LS.limitan.join(', ')) + '. ' : 'sin limitantes fuertes. ') + esc(LS.recs.slice(0, 2).map(function (r) { return r.titulo; }).join('; ')) + '.');
    else out.push('<b>Suelo:</b> falta el análisis de suelo del área del proyecto.');
    if (clima) out.push('<b>Clima:</b> en ' + clima.desde + '–' + clima.hasta + ' llovieron en promedio ' + fmt(clima.lluviaAnual, 0) + ' mm por año (entre ' + fmt(clima.lluviaMin, 0) + ' y ' + fmt(clima.lluviaMax, 0) + ' mm) contra una demanda de ' + fmt(clima.etoAnual, 0) + ' mm; faltan en promedio ' + fmt(clima.deficit, 0) + ' mm por año' + (clima.mesesDeficit.length ? ', con los mayores faltantes en ' + clima.mesesDeficit.slice(0, 4).join(', ').toLowerCase() : '') + '.');
    P.forEach(function (x) {
      var pot = x.r.potencial ? x.r.potencial.estimado : null, rie = x.ref ? x.ref.riego : null, sec = x.ref ? x.ref.secano : null, con = pot != null ? pot : rie;
      if (con != null && sec != null) out.push('<b>' + esc(x.c.cultivo) + (x.ref && x.ref.epoca ? ' (' + esc(x.ref.epoca) + ')' : '') + ':</b> con riego se espera ' + fmt(con, 0) + ' kg/ha' + (pot != null ? ' (casos reales cercanos)' : ' (zona con riego)') + ' contra ' + fmt(sec, 0) + ' kg/ha en secano: <b>+' + fmt(con - sec, 0) + ' kg/ha</b>.' + (LA && LA.L.veredicto.k === 'grave' ? ' Con el agua actual ese rinde no se alcanza.' : ''));
    });
    return out;
  }
  function graficoClima() {
    var W = 640, H = 200, x0 = 40, x1 = W - 10, y0 = 12, y1 = H - 26, max = Math.max.apply(null, clima.meses.map(function (m) { return Math.max(m.lluvia, m.eto); })) * 1.1;
    var cw = (x1 - x0) / 12, Y = function (v) { return y1 - v / max * (y1 - y0); };
    var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var v = max * f; h += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#EEF0F2"/><text x="' + (x0 - 4) + '" y="' + (Y(v) + 3) + '" font-size="9" text-anchor="end" fill="#8C9196">' + Math.round(v) + '</text>'; });
    clima.meses.forEach(function (m, i) { var xc = x0 + cw * i + cw / 2; h += '<rect x="' + (xc - cw * 0.3) + '" y="' + Y(m.lluvia) + '" width="' + (cw * 0.6) + '" height="' + (y1 - Y(m.lluvia)) + '" fill="#6FA8DC" rx="2"/><text x="' + xc + '" y="' + (y1 + 12) + '" font-size="9.5" text-anchor="middle" fill="#5B6167">' + m.mes + '</text>'; });
    h += '<polyline fill="none" stroke="#D08A1E" stroke-width="2.2" points="' + clima.meses.map(function (m, i) { return (x0 + cw * i + cw / 2).toFixed(1) + ',' + Y(m.eto).toFixed(1); }).join(' ') + '"/>';
    clima.meses.forEach(function (m, i) { h += '<circle cx="' + (x0 + cw * i + cw / 2) + '" cy="' + Y(m.eto) + '" r="2.6" fill="#D08A1E"/>'; });
    return h + '<text x="' + x0 + '" y="' + (H - 2) + '" font-size="9.5" fill="#5B6167">mm por mes · barras azules: lluvia promedio · línea naranja: evapotranspiración de referencia (ETo)</text></svg>';
  }
  function secClima() {
    var u = ubic();
    var h = '<h2>Ubicación y clima de la zona</h2><div class="stats">' +
      '<div class="stat"><div class="sl">Ubicación</div><div class="sv" style="font-size:13px;">' + esc([u.localidad, u.depto].filter(Boolean).join(', ') || '—') + '</div><div class="ss">' + (u.lat != null ? fmt(u.lat, 5) + ', ' + fmt(u.lon, 5) : 'sin coordenadas') + '</div></div>' +
      '<div class="stat"><div class="sl">Altitud</div><div class="sv">' + (u.altitud != null ? fmt(u.altitud, 0) + ' m' : '—') + '</div></div>' +
      (clima ? '<div class="stat"><div class="sl">Lluvia anual</div><div class="sv">' + fmt(clima.lluviaAnual, 0) + ' mm</div><div class="ss">' + fmt(clima.lluviaMin, 0) + ' (' + clima.anioSeco + ') a ' + fmt(clima.lluviaMax, 0) + ' (' + clima.anioLluvioso + ')</div></div>' +
        '<div class="stat"><div class="sl">Demanda (ETo)</div><div class="sv">' + fmt(clima.etoAnual, 0) + ' mm</div><div class="ss">por año</div></div>' +
        '<div class="stat"><div class="sl">Déficit hídrico</div><div class="sv red">' + fmt(clima.deficit, 0) + ' mm</div><div class="ss">promedio · máximo ' + fmt(clima.deficitMax, 0) + ' mm</div></div>' : '') + '</div>';
    if (!clima) return h + '<div class="note">' + (climaEstado === 'cargando' ? 'Cargando el clima de los últimos 10 años…' : 'No se pudo traer el clima histórico (' + esc(climaEstado) + ').') + '</div>';
    h += graficoClima();
    h += tabla([{ t: 'Mes' }].concat(clima.meses.map(function (m) { return { t: m.mes, r: 1 }; })), [
      '<tr>' + td('<b>Lluvia</b>') + clima.meses.map(function (m) { return td(fmt(m.lluvia, 0), 1); }).join('') + '</tr>',
      '<tr>' + td('<b>ETo</b>') + clima.meses.map(function (m) { return td(fmt(m.eto, 0), 1); }).join('') + '</tr>',
      '<tr>' + td('<b>Falta</b>') + clima.meses.map(function (m) { var d = m.eto - m.lluvia; return td(d > 0 ? '<span style="color:#C0392B;font-weight:700;">' + fmt(d, 0) + '</span>' : '—', 1); }).join('') + '</tr>',
      '<tr>' + td('<b>T máx / mín</b>') + clima.meses.map(function (m) { return td(fmt(m.tmax, 0) + '/' + fmt(m.tmin, 0), 1); }).join('') + '</tr>']);
    return h + '<div class="sub" style="margin-top:4px;">Promedio ' + clima.desde + '–' + clima.hasta + ' (' + clima.anios + ' años) con datos diarios de Open-Meteo (reanálisis ERA5). Déficit = suma de los meses en que la evapotranspiración de referencia supera a la lluvia: es el agua que el riego tiene que aportar en un cultivo de cobertura completa; la necesidad de cada cultivo depende de su ciclo y su coeficiente (FAO-56).</div>';
  }
  function secSuelo(LS) {
    if (!LS) return '<h2>Suelo</h2><div class="note warn">Falta el análisis de suelo del área del proyecto. Sin él no se puede decir qué le falta al suelo ni cuánto corregir antes de la primera campaña.</div>';
    var s = LS.s;
    return '<h2>Suelo</h2><div class="stats">' + [['pH', s.ph, 1], ['MO %', s.mo, 2], ['P mg/dm³', s.p, 1], ['K cmolc', s.k, 2], ['Ca cmolc', s.ca, 2], ['Mg cmolc', s.mg, 2], ['CIC', s.cic, 2], ['V %', s.satBases, 1], ['Arcilla %', s.arcilla, 1]].filter(function (x) { return num(x[1]) != null; }).map(function (x) { return '<div class="stat"><div class="sl">' + x[0] + '</div><div class="sv">' + fmt(num(x[1]), x[2]) + '</div></div>'; }).join('') + '</div>' +
      (s.fecha ? '<div class="sub">Análisis del ' + fmtF(s.fecha) + (s.profundidad ? ' · ' + esc(s.profundidad) : '') + '</div>' : '') +
      '<div class="interp interp-suelo">' + SafiaAgro.tablaInterpretacion(LS.inter) + '</div>' +
      '<h3>Qué hacer antes de la primera campaña</h3>' + SafiaAgro.listaRecomendaciones(LS.recs) +
      '<div class="sub" style="margin-top:6px;">Interpretación para ' + esc(LS.cultivo.toLowerCase()) + ' con el Manual RS/SC 2016, Embrapa y CAPECO/IPTA como contraste. La prescripción final la define el ingeniero agrónomo.</div>';
  }
  function secAgua(LA) {
    if (!LA) return '<h2>Agua de riego</h2><div class="note warn">Falta el análisis del agua de la fuente de riego (pozo, río o tajamar). Es lo primero a resolver: un agua salina o sódica puede hacer inviable el proyecto.</div>';
    var a = LA.a;
    return '<h2>Agua de riego</h2><div class="sub" style="margin-bottom:6px;">' + esc([a.fuente, a.fuenteNombre].filter(Boolean).join(' · ') || 'Fuente') + (a.fecha ? ' · análisis del ' + fmtF(a.fecha) : '') + (a.laboratorio ? ' · ' + esc(a.laboratorio) : '') + '</div>' + SafiaCalidadAgua.tarjeta(a, LA.op);
  }
  function secPotencial(P) {
    var h = '<h2>Potencial productivo por cultivo</h2>';
    P.forEach(function (x) {
      var r = x.r, pot = r.potencial;
      h += '<div class="seccion"><h3>' + esc(x.c.cultivo) + (x.c.epoca ? ' · ' + esc(x.c.epoca) : '') + (num(x.c.objetivoKgHa) ? ' · objetivo ' + fmt(num(x.c.objetivoKgHa), 0) + ' kg/ha' : '') + '</h3>';
      h += '<div class="stats"><div class="stat"><div class="sl">Potencial con riego</div><div class="sv">' + (pot ? fmt(pot.estimado, 0) : '—') + '</div><div class="ss">' + (pot ? 'entre ' + fmt(pot.min, 0) + ' y ' + fmt(pot.max, 0) + ' · ' + pot.nCasos + ' caso(s)' : (r.fueraDeRadio ? 'sin casos a menos de 300 km' + (r.masCercano ? ' (el más cercano a ' + fmt(r.masCercano.km, 0) + ' km)' : '') : 'sin casos en el banco')) + '</div></div>' +
        '<div class="stat"><div class="sl">Zona con riego</div><div class="sv green">' + fmt(x.ref && x.ref.riego, 0) + '</div><div class="ss">' + (x.ref ? esc(x.ref.ambito) + ' · ' + x.ref.n + ' registros' : 'sin referencia') + '</div></div>' +
        '<div class="stat"><div class="sl">Zona secano</div><div class="sv">' + fmt(x.ref && x.ref.secano, 0) + '</div><div class="ss">kg/ha' + (x.ref && x.ref.epoca ? ' · época ' + esc(x.ref.epoca) : '') + '</div></div></div>';
      if (pot && pot.nCasos < 3) h += '<div class="note warn">Basado en solo ' + pot.nCasos + ' caso(s): es una orientación, no una predicción.</div>';
      var filas = (r.similares || []).map(function (t, i) { var c = t.caso; return '<tr>' + td('Caso ' + (i + 1)) + td(esc(c.localidad || c.departamento || '—')) + td(t.distanciaKm == null ? '—' : fmt(t.distanciaKm, 0) + ' km', 1) + td(esc(c.campana || '—')) + td(esc(c.variedad || '—')) + td('<b>' + fmt(c.rindeKgHa, 0) + '</b>', 1) + td(c.aguaTotalMM == null ? '—' : fmt(c.aguaTotalMM, 0), 1) + td(t.similitud + ' %', 1) + '</tr>'; });
      if (filas.length) h += tabla([{ t: 'Caso', w: 9 }, { t: 'Localidad', w: 18 }, { t: 'Distancia', r: 1, w: 11 }, { t: 'Campaña', w: 12 }, { t: 'Variedad', w: 16 }, { t: 'Rinde kg/ha', r: 1, w: 12 }, { t: 'Agua mm', r: 1, w: 10 }, { t: 'Parecido', r: 1, w: 12 }], filas) +
        '<div class="sub">Casos reales con riego del banco de SAFIA, sin nombres de productores. Parecido = suelo, distancia, altitud y época.' + (r.fueraDeRadio ? ' <b>Ninguno está a menos de 300 km: se muestran solo como información y no entran en el potencial.</b>' : '') + '</div>';
      h += '</div>';
    });
    return h;
  }
  function secZona() {
    var a = ambitoRef(), h = '<h2>La zona: referencia agrícola y forrajera</h2>';
    if (!a) h += '<div class="note">No hay registros de la referencia agrícola para esta localidad ni su departamento.</div>';
    else {
      var grupos = {};
      a.filas.forEach(function (x) { var k = x.cultivo + '|' + (x.finalidad || '') + '|' + (x.epoca_siembra || ''); (grupos[k] = grupos[k] || []).push(x); });
      var filas = Object.keys(grupos).sort().map(function (k) {
        var g = grupos[k], p = k.split('|'), rie = promedio(g.filter(function (x) { return x.riego; })), sec = promedio(g.filter(function (x) { return !x.riego; }));
        if (rie == null && sec == null) return null;
        var anios = g.map(function (x) { return x.anio; }).filter(Boolean), aa = anios.length ? Math.min.apply(null, anios) + (Math.max.apply(null, anios) !== Math.min.apply(null, anios) ? '–' + Math.max.apply(null, anios) : '') : '—';
        return '<tr>' + td('<b>' + esc(p[0]) + '</b>') + td(esc(p[1] || '—')) + td(esc(p[2] || '—')) + td(fmt(sec, 0), 1) + td('<b>' + fmt(rie, 0) + '</b>', 1) + td(rie != null && sec != null ? '<span style="color:#178029;font-weight:700;">+' + fmt(rie - sec, 0) + '</span>' : '—', 1) + td(g.length, 1) + td(aa) + '</tr>';
      }).filter(Boolean);
      h += '<div class="sub" style="margin-bottom:4px;">' + (a.nivel === 'localidad' ? 'Localidad ' : 'Departamento ') + '<b>' + esc(a.nombre) + '</b> · rinde promedio en kg/ha (ensilaje y granos húmedos en su propia unidad de la base)</div>' +
        tabla([{ t: 'Cultivo', w: 16 }, { t: 'Finalidad', w: 17 }, { t: 'Época', w: 14 }, { t: 'Secano', r: 1, w: 11 }, { t: 'Con riego', r: 1, w: 11 }, { t: 'Diferencia', r: 1, w: 11 }, { t: 'Registros', r: 1, w: 9 }, { t: 'Año', w: 11 }], filas);
    }
    // forraje por región (la base de Irrigar: Chaco / Oriental)
    var u = ubic(), chaco = /boqueron|alto paraguay|presidente hayes/.test(norm(u.depto)), region = chaco ? 'Occidental/Chaco' : 'Oriental/Centro';
    var kg = function (v) { return v == null ? 0 : Number(v) / 100; }, M = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var fr = (refForraje || []).filter(function (x) { return x.region === region; }), tipos = {};
    fr.forEach(function (x) { (tipos[x.tipo_pastura] = tipos[x.tipo_pastura] || {})[/rega/i.test(x.forma_producida || '') ? 'riego' : 'secano'] = x; });
    var filasF = Object.keys(tipos).sort().map(function (t) {
      var s = tipos[t].secano, r = tipos[t].riego, ts = s ? M.reduce(function (a, m) { return a + kg(s[m]); }, 0) : null, tr = r ? M.reduce(function (a, m) { return a + kg(r[m]); }, 0) : null;
      var minS = s ? Math.min.apply(null, M.map(function (m) { return kg(s[m]); })) : null, minR = r ? Math.min.apply(null, M.map(function (m) { return kg(r[m]); })) : null;
      return '<tr>' + td('<b>' + esc(t) + '</b>') + td(fmt(ts, 0), 1) + td('<b>' + fmt(tr, 0) + '</b>', 1) + td(ts && tr ? '<span style="color:#178029;font-weight:700;">×' + fmt(tr / ts, 1) + '</span>' : '—', 1) + td(fmt(minS, 0) + ' / ' + fmt(minR, 0), 1) + '</tr>';
    });
    if (filasF.length) h += '<h3>Producción de pasto (materia seca) · región ' + esc(region) + '</h3>' + tabla([{ t: 'Pastura', w: 26 }, { t: 'Secano kg MS/ha/año', r: 1, w: 18 }, { t: 'Con riego kg MS/ha/año', r: 1, w: 20 }, { t: 'Con riego rinde', r: 1, w: 14 }, { t: 'Mes más flojo secano / riego', r: 1, w: 22 }], filasF) +
      '<div class="sub">Base forrajera de Irrigar' + (fr[0] && fr[0].anio ? ' (' + fr[0].anio + ')' : '') + '. El pasto regado sostiene la producción en los meses secos, que es cuando falta comida en secano.</div>';
    return h;
  }
  function secCierre() {
    var pasos = ['Confirmar el análisis del agua (y repetirlo si no pasa el control de calidad) y analizar el suelo en 0–20 y 20–40 cm, con sodio intercambiable si el agua tiene sodio.', 'Definir la superficie, la fuente de agua y su caudal, y el equipo (pivot, lámina y energía).', 'Corregir el suelo según las recomendaciones antes de la primera campaña.', 'Con el agua en la franja severa, hacer un lote piloto antes del proyecto completo (FAO 29, §1.4).', 'Una vez en marcha, SAFIA sigue el proyecto: balance de agua diario, satélite, análisis y cosecha, y compara con el potencial de este informe.'];
    var autor = $('autor').value.trim() || config.agronomo || '';
    var h = '<h2>Próximos pasos</h2><ol>' + pasos.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>' +
      '<div class="note info" style="font-size:11px;"><b>Supuestos y fuentes.</b> Clima: Open-Meteo, reanálisis ERA5, datos diarios de los últimos 10 años completos. Zona: referencia agrícola y forrajera de SAFIA (base de Irrigar). Potencial: casos reales con riego del banco de SAFIA a menos de 300 km (con menos de 3 casos es orientación). Suelo: Manual de Calagem e Adubação RS/SC 2016, Embrapa, CAPECO/IPTA. Agua: FAO Riego y Drenaje 29, USDA Manual 60, universidades e INTA (detalle en la sección del agua). SAFIA compara e interpreta; la prescripción y la decisión de inversión las toma el productor con su ingeniero agrónomo.</div>';
    if (autor || config.firma) h += '<div class="firma"><div class="bloque">' + (config.firma ? '<img src="' + config.firma + '" alt="firma">' : '<div style="height:40px;"></div>') + '<b>' + esc(autor) + '</b>' + (config.matricula ? '<div class="sub">' + esc(config.matricula) + '</div>' : '') + '<div class="sub">' + esc([config.empresa, config.telefono, config.correo].filter(Boolean).join(' · ')) + '</div></div></div>';
    return h + '<div class="pie"><span>Kilos de grano en silo por hectárea. Evaluación preparada con SAFIA con datos reales de la zona y del banco de casos.</span><span>' + esc(config.empresa || 'Irrigar') + ' · SAFIA</span></div>';
  }

  function secciones() { var s = {}; document.querySelectorAll('#secciones input').forEach(function (c) { s[c.dataset.s] = c.checked; }); return s; }
  function armar() {
    var hoja = $('hoja');
    if (!ev) { hoja.innerHTML = '<div class="muted" style="padding:40px;text-align:center;">No hay evaluaciones guardadas. Guardá una en <a href="evaluar.html">Evaluar proyecto</a>.</div>'; return; }
    var s = secciones(), P = potenciales(), LA = lecturaAgua(), LS = lecturaSuelo();
    var html = cabecera();
    if (s.resumen) html += secResumen(P, LA, LS);
    if (s.clima) html += secClima();
    if (s.suelo) html += secSuelo(LS);
    if (s.agua) html += secAgua(LA);
    if (s.potencial) html += secPotencial(P);
    if (s.zona) html += secZona();
    html += secCierre();
    hoja.innerHTML = html;
    if (window.SafiaIconos && SafiaIconos.procesar) try { SafiaIconos.procesar(hoja); } catch (e) {}
    toast('Informe armado. "Guardar como PDF" abre la impresión: elegí "Guardar como PDF" como destino.');
  }

  /* ---------- logo, firma y envío (misma configuración que el informe del cliente) ---------- */
  function leerConfigLocal() { try { return JSON.parse(localStorage.getItem('informe_config') || '{}') || {}; } catch (e) { return {}; } }
  function cargarConfig() {
    config = leerConfigLocal();
    if (!window.safiaSupabase) return Promise.resolve();
    return window.safiaSupabase.storage.from('safia').download('config/informe.json').then(function (r) {
      if (r.error || !r.data) return;
      return r.data.text().then(function (t) { var nube = JSON.parse(t || '{}'); if (nube && (!config.actualizado || (nube.actualizado || '') > config.actualizado)) { config = nube; localStorage.setItem('informe_config', JSON.stringify(config)); } });
    }).catch(function () {});
  }
  function htmlAutonomo() {
    var estilos = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc('Evaluación de proyecto · ' + (campo ? campo.nombre : '')) + '</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>:root{--bd:#E1E4E7;--label:#6B6F73;--body:#2E3236}*{box-sizing:border-box}body{margin:0;background:#E9EBEE;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#2E3236}' + estilos + '.hoja{margin:12px auto}@media(max-width:700px){.hoja{padding:12px;margin:0}.hoja .kpis,.hoja .dos{grid-template-columns:1fr 1fr}}</style></head><body><div class="hoja">' + $('hoja').innerHTML + '</div></body></html>';
  }
  var linkActual = null;
  function publicar() {
    var est = $('envEstado'), lk = $('envLink');
    if (!window.safiaSupabase || !campo) { est.textContent = 'Sin conexión: para enviar hace falta internet y la sesión de SAFIA.'; return; }
    est.textContent = 'Publicando el informe en la nube…';
    var ruta = 'informes/campo_' + campo.id + '/evaluacion_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.html';
    window.safiaSupabase.storage.from('safia').upload(ruta, new Blob([htmlAutonomo()], { type: 'text/html' }), { upsert: true, contentType: 'text/html' }).then(function (r) {
      if (r.error) throw r.error; return window.safiaSupabase.storage.from('safia').createSignedUrl(ruta, 2592000);
    }).then(function (r) {
      if (r.error) throw r.error;
      linkActual = r.data.signedUrl; est.textContent = 'Informe publicado. El link es privado y vale 30 días.';
      lk.innerHTML = '<a href="' + esc(linkActual) + '" target="_blank">' + esc(linkActual.slice(0, 90)) + '…</a>';
      ['btnEnvCopiar', 'btnEnvCorreo', 'btnEnvWhatsapp'].forEach(function (id) { $(id).disabled = false; });
    }).catch(function (e) { est.textContent = 'No se pudo publicar: ' + (e.message || e); });
  }
  function mensaje() {
    var nombre = (cliente && cliente.nombre || '').split(' ')[0];
    return 'Hola ' + nombre + ', te comparto la evaluación del proyecto de riego de ' + (campo ? campo.nombre : '') + ', preparada con SAFIA:\n' + (linkActual || '') + '\n(el link vale 30 días)\n' + ($('autor').value.trim() || config.agronomo || '') + (config.empresa ? ' · ' + config.empresa : '');
  }
  function telefonoWa(t) { var d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.indexOf('595') === 0) return d; if (d.indexOf('0') === 0) return '595' + d.slice(1); return d.length <= 10 ? '595' + d : d; }

  /* ---------- selectores ---------- */
  function llenarSelector(elegido) {
    var cl = leer('clientes'), cs = leer('campos'), sel = $('selEval');
    sel.innerHTML = evaluaciones().map(function (e) {
      var c = cl.find(function (x) { return String(x.id) === String(e.clienteId); }) || {}, p = cs.find(function (x) { return String(x.id) === String(e.campoId); }) || {};
      return '<option value="' + esc(e.id) + '">' + esc((c.nombre || '—') + ' · ' + (p.nombre || '—') + ' · ' + (e.nombre || 'Estrategia')) + '</option>';
    }).join('') || '<option value="">Sin evaluaciones guardadas</option>';
    if (elegido && [].some.call(sel.options, function (o) { return o.value === String(elegido); })) sel.value = String(elegido);
  }
  function preparar() {
    elegir($('selEval').value); armar();
    Promise.all([cargarReferencias(), cargarConfig(), cargarClima()]).then(armar);
    if (!$('autor').value && config.agronomo) $('autor').value = config.agronomo;
  }
  function iniciar() {
    var q = new URLSearchParams(location.search).get('evaluacion');
    var guardado = null; try { guardado = sessionStorage.getItem('informe_evaluacion'); } catch (e) {}
    llenarSelector(q || guardado);
    $('selEval').addEventListener('change', function () { try { sessionStorage.setItem('informe_evaluacion', $('selEval').value); } catch (e) {} preparar(); });
    $('btnActualizar').addEventListener('click', armar);
    $('autor').addEventListener('change', armar);
    $('btnPdf').addEventListener('click', function () { window.print(); });
    document.querySelectorAll('#secciones input').forEach(function (c) { c.addEventListener('change', armar); });
    $('btnEnviar').addEventListener('click', function () { $('envInforme').style.display = ''; ['btnEnvCopiar', 'btnEnvCorreo', 'btnEnvWhatsapp'].forEach(function (id) { $(id).disabled = true; }); $('envLink').innerHTML = ''; linkActual = null; publicar(); });
    $('btnEnvCerrar').addEventListener('click', function () { $('envInforme').style.display = 'none'; });
    $('btnEnvCopiar').addEventListener('click', function () { if (linkActual && navigator.clipboard) navigator.clipboard.writeText(linkActual).then(function () { toast('Link copiado'); }); });
    $('btnEnvWhatsapp').addEventListener('click', function () { var tel = telefonoWa(cliente && cliente.telefono); window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje()), '_blank'); if (!tel) toast('El prospecto no tiene teléfono cargado: elegí el contacto en WhatsApp'); });
    $('btnEnvCorreo').addEventListener('click', function () { window.location.href = 'mailto:' + encodeURIComponent((cliente && cliente.email) || '') + '?subject=' + encodeURIComponent('Evaluación de proyecto de riego · ' + (campo ? campo.nombre : '')) + '&body=' + encodeURIComponent(mensaje()); });
    preparar();
    window.addEventListener('safia:datos', function () { llenarSelector($('selEval').value); });
  }
  window.SafiaInformeEvaluacion = { armar: armar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
