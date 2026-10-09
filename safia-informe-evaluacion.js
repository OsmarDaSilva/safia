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
      window.safiaSupabase.from('safia_ref_produccion').select('localidad,departamento,anio,cultivo,finalidad,epoca_siembra,riego,prod_ton_ha,costo_final_ha,costo_insumos_ha,costo_maquinas_ha,costo_fletes_ha,alquiler_ha,energia_ha,mantenimiento_ha').then(function (r) { refProd = r.data || []; }, function () { refProd = []; }),
      window.safiaSupabase.from('safia_ref_forraje_mensual').select('region,tipo_pastura,forma_producida,anio,ene,feb,mar,abr,may,jun,jul,ago,sep,oct,nov,dic').then(function (r) { refForraje = r.data || []; }, function () { refForraje = []; })
    ]);
  }
  // Clima de los últimos 10 años completos (Open-Meteo, reanálisis ERA5): lluvia y ETo por mes y por año
  var hist = null;
  function cargarClima() {
    var u = ubic(); if (u.lat == null || u.lon == null) { climaEstado = 'sin coordenadas'; return Promise.resolve(); }
    // el mismo módulo que la pantalla Evaluar: mismos datos, mismos números
    if (window.SafiaClimaProyecto) { climaEstado = 'cargando'; return SafiaClimaProyecto.historico(u.lat, u.lon).then(function (h) { hist = h; clima = h.resumen; climaEstado = 'ok'; }).catch(function () { climaEstado = 'sin conexión'; }); }
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
  // misma finalidad y sin mezclar épocas (SafiaCasos.refRegional); los pastos, con la referencia forrajera de la región
  function refCultivo(cultivo, epoca, finalidad) {
    if (!window.SafiaCasos) return null;
    if (SafiaCasos.esPasto(cultivo)) {
      var rf = SafiaCasos.refForrajeAnual(refForraje, ubic().depto, cultivo);
      if (!rf || rf.sinDato) return null;
      return { riego: rf.riego, secano: rf.secano, n: rf.n, forraje: true, ambito: 'región ' + rf.region + ' · ' + rf.tipo + (rf.exacta ? '' : ' (no hay dato propio de ' + cultivo + ')'), nivel: 'region' };
    }
    var a = ambitoRef(); if (!a) return null;
    var rr = SafiaCasos.refRegional(a.filas, cultivo, epoca, finalidad); if (!rr) return null;
    return { riego: rr.riego, secano: rr.secano, n: rr.n, epoca: rr.epoca, ambito: a.nombre, nivel: a.nivel, costoRiego: rr.costoRiego, costoSecano: rr.costoSecano, costosRiego: rr.costosRiego, costosSecano: rr.costosSecano };
  }
  function unidad(c) { return SafiaCasos.unidadDe(c.cultivo, c.finalidad); }
  function U(v, u) { return SafiaCasos.enUnidad(v, u); }
  function finTxt(c) { return SafiaCasos.finalidadTexto(c.finalidad || SafiaCasos.finalidadesPara(c.cultivo)[0]); }
  function potenciales() {
    var u = ubic(), s = suelo(), casos = window.SafiaCasos ? SafiaCasos.armarCasos() : [];
    return cultivos().map(function (c) {
      var p = { lat: u.lat, lon: u.lon, altitud: u.altitud, suelo: tieneSuelo(s) ? s : null, cultivo: c.cultivo, finalidad: c.finalidad || null, epoca: c.epoca || null, siembra: c.siembra || null, objetivoKgHa: num(c.objetivoKgHa), departamento: u.depto || null, localidad: u.localidad || null, pais: u.pais || 'Paraguay' };
      var r = window.SafiaCasos ? SafiaCasos.evaluar(p, casos, { maxCasos: 5, radioKm: 300, riego: true }) : { similares: [], potencial: null };
      return { c: c, p: p, r: r, u: unidad(c), ref: refCultivo(c.cultivo, c.epoca, c.finalidad) };
    });
  }
  function lecturaAgua() {
    var a = agua(); if (!a || !window.SafiaCalidadAgua) return null;
    var s = suelo(), op = { aspersion: true, cultivos: cultivos().map(function (c) { return c.cultivo; }), sueloFino: !!(s && num(s.arcilla) >= 35), textura: SafiaCalidadAgua.texturaDoneen(s), laminaMm: a.laminaAnualMm };
    return { a: a, op: op, L: SafiaCalidadAgua.interpretar(a, op) };
  }
  function lecturaSuelo() {
    var s = suelo(); if (!tieneSuelo(s) || !window.SafiaAgro) return null;
    var c0 = cultivos()[0], cu = c0 ? c0.cultivo : 'Soja', obj = c0 && unidad(c0).k === 'grano' ? num(c0.objetivoKgHa) : null;
    var inter = SafiaAgro.interpretarSuelo(s, cu), recs = SafiaAgro.recomendaciones(s, cu, obj);
    return { s: s, cultivo: cu, inter: inter, recs: recs, limitan: inter.filter(function (i) { return i.estado === 'limita'; }).map(function (i) { return i.n; }) };
  }

  /* ---------- secciones ---------- */
  function cabecera() {
    var u = ubic(), hoy = new Date();
    var marca = config.logo ? '<img class="logo" src="' + config.logo + '" alt="' + esc(config.empresa || '') + '"><div><div class="t1" style="font-size:15px;">' + esc(config.empresa || 'SAFIA') + '</div><div class="t2">EVALUACIÓN DE PROYECTO · SAFIA</div></div>' : LOGO + '<div><div class="t1">SAFIA</div><div class="t2">SMART · AGRO · INTELLIGENCE' + (config.empresa ? ' · ' + esc(config.empresa.toUpperCase()) : '') + '</div></div>';
    return '<div class="cab"><div class="marca">' + marca + '</div><div class="der"><div style="font-size:11px;color:#8C9196;">EVALUACIÓN DE PROYECTO DE RIEGO</div><div><b>' + esc(cliente ? cliente.nombre : '') + '</b></div><div>' + esc(campo ? campo.nombre : '') + '</div><div class="sub">' + esc([u.localidad, u.depto, u.pais].filter(Boolean).join(', ')) + '</div><div class="sub">' + hoy.toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }) + ($('autor').value ? ' · ' + esc($('autor').value) : '') + '</div></div></div>' +
      '<h1 style="margin-top:14px;">Proyecto de riego · ' + esc(campo ? campo.nombre : '') + '</h1><div class="sub">Estrategia: <b>' + esc(ev.nombre || '') + '</b>' + (ev.superficieHa ? ' · ' + fmt(ev.superficieHa, 0) + ' ha a regar' : '') + ' · evaluación del ' + fmtF(String(ev.fechaModificacion || ev.fecha).slice(0, 10)) + '</div>' +
      (ev.notas ? '<div class="note" style="margin-top:8px;"><b>Notas del proyecto:</b> ' + esc(ev.notas) + '</div>' : '');
  }
  function secResumen(P, LA, LS) {
    var aguaK = LA ? LA.L.veredicto.k : null, aguaCol = { ok: '#178029', cuidado: '#B8731A', grave: '#C0392B' }[aguaK] || '#5B6167';
    var kpis = '<div class="kpis">' +
      '<div class="kpi"><div class="sl">Hectáreas a regar</div><div class="sv">' + (ev.superficieHa ? fmt(ev.superficieHa, 0) + ' ha' : '—') + '</div><div class="ss">' + esc(cultivos().map(function (c) { return c.cultivo + ' (' + finTxt(c).toLowerCase() + ')'; }).join(' + ') || 'sin cultivos') + '</div></div>' +
      '<div class="kpi"><div class="sl">Agua de riego</div><div class="sv" style="color:' + aguaCol + ';font-size:14px;">' + (LA ? esc(LA.L.veredicto.titulo.split(':')[0]) : 'Sin análisis') + '</div><div class="ss">' + (LA && LA.L.r.clase ? 'clase ' + esc(LA.L.r.clase.txt) + ' · RAS ' + fmt(LA.L.r.ras, 1) : 'falta el análisis del agua') + '</div></div>' +
      '<div class="kpi"><div class="sl">Suelo</div><div class="sv" style="font-size:14px;">' + (LS ? (LS.limitan.length ? 'Limita: ' + esc(LS.limitan.slice(0, 2).join(', ')) : 'Sin limitantes fuertes') : 'Sin análisis') + '</div><div class="ss">' + (LS ? 'para ' + esc(LS.cultivo.toLowerCase()) : 'falta el análisis de suelo') + '</div></div>' +
      '<div class="kpi"><div class="sl">Déficit hídrico anual</div><div class="sv">' + (clima ? fmt(clima.deficit, 0) + ' mm' : '—') + '</div><div class="ss">' + (clima ? 'ETo ' + fmt(clima.etoAnual, 0) + ' vs lluvia ' + fmt(clima.lluviaAnual, 0) + ' mm (' + clima.desde + '–' + clima.hasta + ')' : (climaEstado === 'cargando' ? 'cargando el clima…' : 'sin clima')) + '</div></div></div>';
    var filas = P.map(function (x) {
      var pot = x.r.potencial ? x.r.potencial.estimado : null, rie = x.ref ? x.ref.riego : null, sec = x.ref ? x.ref.secano : null, con = pot != null ? pot : rie;
      var gana = con != null && sec != null ? con - sec : null;
      var ep = x.c.epoca || (x.ref && x.ref.epoca);
      return '<tr>' + td('<b>' + esc(x.c.cultivo) + '</b><div class="sub">' + esc(finTxt(x.c)) + (ep ? ' · ' + esc(ep) : '') + '</div>') + td(U(num(x.c.objetivoKgHa), x.u) + '<div class="sub">' + x.u.corto + '</div>', 1) +
        td(pot != null ? '<b>' + U(pot, x.u) + '</b><div class="sub">' + x.r.potencial.nCasos + ' caso(s) cercanos</div>' : '<span class="sub">' + (x.r.fueraDeRadio ? 'sin casos a menos de 300 km' : 'sin casos') + '</span>', 1) +
        td(x.ref ? U(rie, x.u) : '<span class="sub">sin referencia</span>', 1) + td(x.ref ? U(sec, x.u) : '—', 1) + td(gana != null ? '<b style="color:#178029;">+' + U(gana, x.u) + '</b><div class="sub">+' + fmt(gana / sec * 100, 0) + ' %</div>' : '—', 1) + '</tr>';
    });
    return '<h2>Resumen ejecutivo</h2>' + veredictoHTML(LA) + kpis + tabla([{ t: 'Cultivo · finalidad', w: 18 }, { t: 'Objetivo', r: 1, w: 13 }, { t: 'Potencial con riego (casos)', r: 1, w: 19 }, { t: 'Zona con riego', r: 1, w: 15 }, { t: 'Zona secano', r: 1, w: 15 }, { t: 'Lo que suma el riego', r: 1, w: 20 }], filas) +
      '<div class="sub" style="margin-top:4px;">' + notaUnidades(P) + ' Cada cultivo se compara con la misma finalidad y la misma época de siembra. Zona: referencia agrícola de SAFIA' + (refAgr(P) ? ' (' + esc(refAgr(P).ambito) + ', ' + (refAgr(P).nivel === 'localidad' ? 'localidad' : 'promedio del departamento') + ')' : '') + (P.some(function (x) { return x.ref && x.ref.forraje; }) ? '; pastos: referencia forrajera de la región' : '') + '. Lo que suma el riego = potencial con riego (o la zona con riego si no hay casos cercanos) menos la zona en secano.</div>' +
      '<h3>Conclusión</h3><ul>' + conclusiones(P, LA, LS).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
  }
  // el mismo veredicto que la pantalla de Evaluar (SafiaEconomiaRiego.veredicto): arriba de todo, antes de los números
  function veredictoHTML(LA) {
    if (!window.SafiaEconomiaRiego || !SafiaEconomiaRiego.veredicto) return '';
    if (!ECO && climaEstado === 'cargando') return '<div class="note">Veredicto: calculando con el clima del campo…</div>';
    var V = SafiaEconomiaRiego.veredicto(ECO, { aguaGrave: !!(LA && LA.L.veredicto.k === 'grave') });
    var col = { si: '#178029', ajustado: '#B8731A', no: '#C0392B', falta: '#5B6167' }[V.k] || '#5B6167';
    return '<div class="note" style="border-left:4px solid ' + col + ';margin:8px 0;"><b style="color:' + col + ';font-size:14px;">Veredicto: ' + esc(V.titulo) + '.</b> ' + V.detalle + '</div>';
  }
  function refAgr(P) { var x = P.find(function (y) { return y.ref && !y.ref.forraje; }); return x ? x.ref : null; }
  // qué unidad usa cada tipo de producción del proyecto
  function notaUnidades(P) {
    var grupos = {}, orden = [];
    P.forEach(function (x) { var g = grupos[x.u.corto]; if (!g) { g = grupos[x.u.corto] = []; orden.push(x.u.corto); } if (g.indexOf(x.u.largo) === -1) g.push(x.u.largo); });
    return orden.length ? 'Unidades: ' + orden.map(function (c) { return c + ' = ' + grupos[c].join(' o '); }).join('; ') + '.' : '';
  }
  var ECO = null;
  function conclusiones(P, LA, LS) {
    var out = [];
    var E = ECO;
    if (E && E.ok && E.ok.length && E.superficieHa > 0) {
      var usdT = function (v) { return 'US$ ' + fmt(v, 0); };
      var txt = '<b>Economía:</b> con ' + fmt(E.superficieHa, 0) + ' ha, con riego el proyecto deja <b>' + usdT(E.anualR) + ' por año</b>' + (E.situacion === 'nuevo' ? '' : ' contra ' + usdT(E.anualS) + ' en secano' + (E.unCultivoSecano ? ' (en el Chaco sin riego se hace un solo cultivo por año: ' + esc(E.secanoCultivo).toLowerCase() + ')' : '') + ' (el riego agrega <b>' + usdT(E.anualAgrega) + '</b>)') + (E.proyecto ? '; la energía del riego cuesta ' + usdT(E.proyecto.energiaR) + ' por año' : '') + '. ';
      if (E.inversionUSD > 0) txt += 'La inversión de <b>' + usdT(E.inversionUSD) + '</b> (' + usdT(E.inversionHa) + ' por ha) ' + (E.recupero != null ? 'se recupera en <b>' + fmt(E.recupero, 1) + ' años</b>' + (E.tir != null ? ', con una tasa interna de retorno de <b>' + fmt(E.tir * 100, 1) + ' %</b> a ' + E.horizonte + ' años' : '') + '.' : 'no se paga con estos números: revisar precios, costos y rindes.');
      else if (E.inversionRefHa && E.anualPaga > 0) txt += 'Con la referencia de Irrigar (' + esc(E.inversionRefHa.txt) + ') se recuperaría en ' + fmt(E.inversionRefHa.min * E.superficieHa / E.anualPaga, 1) + (E.inversionRefHa.max !== E.inversionRefHa.min ? ' a ' + fmt(E.inversionRefHa.max * E.superficieHa / E.anualPaga, 1) : '') + ' años (orientativo: falta la inversión real).';
      out.push(txt);
    }
    if (LA) out.push('<b>Agua:</b> ' + esc(LA.L.veredicto.titulo) + '. ' + esc(LA.L.veredicto.k === 'grave' ? (LA.L.veredicto.motivos || [LA.L.veredicto.detalle])[0] : (LA.L.plan[0] ? LA.L.plan.slice(0, 3).map(function (p) { return p.t; }).join('; ') : '')) + '.');
    else out.push('<b>Agua:</b> falta el análisis del agua de la fuente de riego; es lo primero a resolver antes de invertir.');
    if (LS) out.push('<b>Suelo:</b> ' + (LS.limitan.length ? 'limita ' + esc(LS.limitan.join(', ')) + '. ' : 'sin limitantes fuertes. ') + esc(LS.recs.slice(0, 2).map(function (r) { return r.titulo; }).join('; ')) + '.');
    else out.push('<b>Suelo:</b> falta el análisis de suelo del área del proyecto.');
    if (clima) out.push('<b>Clima:</b> en ' + clima.desde + '–' + clima.hasta + ' llovieron en promedio ' + fmt(clima.lluviaAnual, 0) + ' mm por año (entre ' + fmt(clima.lluviaMin, 0) + ' y ' + fmt(clima.lluviaMax, 0) + ' mm) contra una demanda de ' + fmt(clima.etoAnual, 0) + ' mm; faltan en promedio ' + fmt(clima.deficit, 0) + ' mm por año' + (clima.mesesDeficit.length ? ', con los mayores faltantes en ' + clima.mesesDeficit.slice(0, 4).join(', ').toLowerCase() : '') + '.');
    P.forEach(function (x) {
      var pot = x.r.potencial ? x.r.potencial.estimado : null, rie = x.ref ? x.ref.riego : null, sec = x.ref ? x.ref.secano : null, con = pot != null ? pot : rie;
      var uu = x.u.corto;
      // secano de ESTE campo cuando la zona no lo representa (la economía ya lo decidió con la simulación del campo)
      var ef = ECO && ECO.filas ? ECO.filas.find(function (f) { return !f.error && f.secanoCampo && norm(f.cultivo) === norm(x.c.cultivo); }) : null;
      if (ef && con != null) { out.push('<b>' + esc(x.c.cultivo) + ' para ' + esc(finTxt(x.c).toLowerCase()) + (x.ref && x.ref.epoca ? ' (' + esc(x.ref.epoca) + ')' : '') + ':</b> con riego se espera ' + U(con, x.u) + ' ' + uu + '. La zona da ' + U(ef.kgSzona, x.u) + ' ' + uu + ' en secano, pero con el clima de este campo el perfil casi nunca se carga: se siembra igual todos los años, pero en ' + fmt(ef.fracSinCarga * 100, 0) + ' % de ellos sin el perfil cargado, y el secano de este campo rinde en promedio unos ' + U(ef.kgS, x.u) + ' ' + uu + ' y el riego suma <b>+' + U(con - ef.kgS, x.u) + ' ' + uu + '</b>.' + (LA && LA.L.veredicto.k === 'grave' ? ' Con el agua actual esa producción no se alcanza.' : '')); return; }
      if (con != null && sec != null) out.push('<b>' + esc(x.c.cultivo) + ' para ' + esc(finTxt(x.c).toLowerCase()) + (x.ref && x.ref.epoca ? ' (' + esc(x.ref.epoca) + ')' : '') + ':</b> con riego se espera ' + U(con, x.u) + ' ' + uu + (pot != null ? ' (casos reales cercanos)' : (x.ref && x.ref.forraje ? ' (referencia forrajera)' : ' (zona con riego)')) + ' contra ' + U(sec, x.u) + ' ' + uu + ' en secano: <b>+' + U(con - sec, x.u) + ' ' + uu + '</b>.' + (LA && LA.L.veredicto.k === 'grave' ? ' Con el agua actual esa producción no se alcanza.' : ''));
      else if (con != null) {
        // sin referencia de secano en la zona: lo que rendiría sin riego sale de la simulación del agua de este campo (FAO-33)
        var sim = null;
        try { if (hist && window.SafiaClimaProyecto) sim = SafiaClimaProyecto.riego(hist, { cultivo: x.c.cultivo, epoca: x.c.epoca, siembra: x.c.siembra, suelo: tieneSuelo(suelo()) ? suelo() : null, departamento: (ev.ubicacion && ev.ubicacion.departamento) || ubic().depto || null, lat: hist.lat, lon: hist.lon }); } catch (e) { sim = null; }
        var rel = sim && !sim.error ? sim.rindeRelSecano : null;
        out.push('<b>' + esc(x.c.cultivo) + ' para ' + esc(finTxt(x.c).toLowerCase()) + (x.ref && x.ref.epoca ? ' (' + esc(x.ref.epoca) + ')' : (x.c.epoca ? ' (' + esc(x.c.epoca) + ')' : '')) + ':</b> con riego se espera ' + U(con, x.u) + ' ' + uu + (pot != null ? ' (casos reales cercanos)' : (x.ref && x.ref.forraje ? ' (referencia forrajera)' : ' (zona con riego)')) + '. La base todavía no tiene la referencia de secano de la zona' +
          (rel != null ? '; según el clima de este campo, sin riego rendiría en promedio el ' + fmt(rel * 100, 0) + ' % de eso por falta de agua (' + (sim.kyPropio ? 'FAO-33' : 'FAO-33, Ky 1,0 orientativo') + '), unos ' + U(con * rel, x.u) + ' ' + uu + ': el riego sumaría <b>+' + U(con * (1 - rel), x.u) + ' ' + uu + '</b> (estimado, no medido).' + (sim.secano ? ' En secano se siembra ~' + esc(sim.secano.fechaTipica || '—') + (sim.secano.nSinCarga ? '; en ' + sim.secano.nSinCarga + ' de ' + sim.secano.n + ' años se siembra igual sin el perfil cargado y rinde poco o se pierde' : ', con el perfil cargado') + '.' : '') : ', así que no se estima cuánto suma el riego.') +
          (LA && LA.L.veredicto.k === 'grave' ? ' Con el agua actual esa producción no se alcanza.' : ''));
      }
      else if (sec != null) out.push('<b>' + esc(x.c.cultivo) + ' para ' + esc(finTxt(x.c).toLowerCase()) + ':</b> la zona en secano da ' + U(sec, x.u) + ' ' + uu + '; la base todavía no tiene la referencia con riego ni casos cercanos, así que no se estima cuánto suma el riego.');
      else if (!x.ref && pot == null) out.push('<b>' + esc(x.c.cultivo) + ' para ' + esc(finTxt(x.c).toLowerCase()) + ':</b> la base de SAFIA todavía no tiene referencia de la zona ni casos cercanos para esta finalidad; no se estima un número.');
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
    var riegoH = '';
    if (hist && window.SafiaClimaProyecto) {
      var opcs = cultivos().map(function (c) { return { cultivo: c.cultivo, epoca: c.epoca, siembra: c.siembra, suelo: tieneSuelo(suelo()) ? suelo() : null, departamento: (ev.ubicacion && ev.ubicacion.departamento) || ubic().depto || null, lat: hist.lat, lon: hist.lon }; });
      var lista = opcs.map(function (o) { return SafiaClimaProyecto.riego(hist, o); });
      riegoH = SafiaClimaProyecto.mapaHTML({ lat: hist.lat, lon: hist.lon, lluvia: clima.lluviaAnual, deficit: clima.deficit }).replace(/<button[^>]*>[^<]*<\/button>/g, '') + '<h3>Riego que lleva cada cultivo en este campo</h3>' + SafiaClimaProyecto.riegoHTML(lista, { superficieHa: ev.superficieHa }) + (SafiaClimaProyecto.metodosHTML ? SafiaClimaProyecto.metodosHTML(hist, opcs) : '');
    }
    return h + '<div class="sub" style="margin-top:4px;">Promedio ' + clima.desde + '–' + clima.hasta + ' (' + clima.anios + ' años) con datos diarios: ' + (hist ? esc(hist.fuente) : 'Open-Meteo (reanálisis ERA5)') + '. Déficit = suma de los meses en que la evapotranspiración de referencia supera a la lluvia: es el agua que el riego tiene que aportar en un cultivo de cobertura completa; la necesidad de cada cultivo depende de su ciclo y su coeficiente (FAO-56).</div>' + riegoH;
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
    var h = '<h2>Vecinos regantes y potencial por cultivo</h2>';
    P.forEach(function (x) {
      var r = x.r, pot = r.potencial;
      h += '<div class="seccion"><h3>' + esc(x.c.cultivo) + ' · ' + esc(finTxt(x.c).toLowerCase()) + (x.c.epoca ? ' · ' + esc(x.c.epoca) : '') + (num(x.c.objetivoKgHa) ? ' · objetivo ' + U(num(x.c.objetivoKgHa), x.u) + ' ' + x.u.corto : '') + '</h3>';
      h += '<div class="stats"><div class="stat"><div class="sl">Potencial con riego</div><div class="sv">' + (pot ? U(pot.estimado, x.u) : '—') + '</div><div class="ss">' + (pot ? 'entre ' + U(pot.min, x.u) + ' y ' + U(pot.max, x.u) + ' · ' + pot.nCasos + ' caso(s)' : (r.fueraDeRadio ? 'sin casos a menos de 300 km' + (r.masCercano ? ' (el más cercano a ' + fmt(r.masCercano.km, 0) + ' km)' : '') : 'sin casos en el banco')) + '</div></div>' +
        '<div class="stat"><div class="sl">Zona con riego</div><div class="sv green">' + (x.ref ? U(x.ref.riego, x.u) : '—') + '</div><div class="ss">' + (x.ref ? esc(x.ref.ambito) + (x.ref.forraje ? '' : ' · ' + x.ref.n + ' registros') : 'sin referencia para esta finalidad') + '</div></div>' +
        '<div class="stat"><div class="sl">Zona secano</div><div class="sv">' + (x.ref ? U(x.ref.secano, x.u) : '—') + '</div><div class="ss">' + x.u.corto + (x.ref && x.ref.epoca ? ' · época ' + esc(x.ref.epoca) : '') + '</div></div></div>';
      if (SafiaCasos.notaForraje(x.c.cultivo, x.c.finalidad)) h += '<div class="sub" style="margin:4px 0;">' + SafiaCasos.notaForraje(x.c.cultivo, x.c.finalidad) + '</div>';
      if (pot && pot.nCasos < 3) h += '<div class="note warn">Basado en solo ' + pot.nCasos + ' caso(s): es una orientación, no una predicción.</div>';
      var sim = (r.similares || []).filter(function (t) { return t.caso && t.caso.rindeKgHa != null; }), rindes = sim.map(function (t) { return t.caso.rindeKgHa; });
      if (sim.length && !r.fueraDeRadio) {
        var mejor = Math.max.apply(null, rindes), prom = rindes.reduce(function (a, b) { return a + b; }, 0) / rindes.length, dist = sim.map(function (t) { return t.distanciaKm; }).filter(function (d) { return d != null; });
        h += '<div class="sub">Basado en <b>' + sim.length + ' lote(s) reales con riego</b> de la misma región y la misma época' + (dist.length ? ', a ' + fmt(Math.min.apply(null, dist), 0) + '–' + fmt(Math.max.apply(null, dist), 0) + ' km de este campo' : '') + ': el mejor rindió <b>' + U(mejor, x.u) + ' ' + x.u.corto + '</b> y el promedio ' + U(prom, x.u) + '. Los datos de otros productores no se publican: SAFIA los usa para la comparación y para decir qué hacer en este campo (sección siguiente).</div>';
      } else if (r.fueraDeRadio) h += '<div class="sub">Los lotes con riego de este cultivo están a más de 300 km: no entran en el potencial; manda la referencia de la zona.</div>';
      h += '</div>';
    });
    return h;
  }
  /* ---------- riego simulado de cada cultivo (mismo cálculo que Evaluar) ---------- */
  function simulaciones() {
    if (!hist || !window.SafiaClimaProyecto) return [];
    var u = ubic();
    return cultivos().map(function (c) { try { return SafiaClimaProyecto.riego(hist, { cultivo: c.cultivo, epoca: c.epoca, siembra: c.siembra, suelo: tieneSuelo(suelo()) ? suelo() : null, departamento: u.depto || null, lat: hist.lat, lon: hist.lon }); } catch (e) { return null; } });
  }
  /* ---------- economía del proyecto (SafiaEconomiaRiego, los mismos números que Evaluar) ---------- */
  var INV_REF_HA = { occidental: { min: 5000, max: 6000, txt: 'Chaco: US$ 5.000 a 6.000 por ha (pozos y reservorio con geomembrana)' }, oriental: { min: 3000, max: 3000, txt: 'Oriental: unos US$ 3.000 por ha (agua superficial, casi sin pozos)' } };
  function economia(P, sims) {
    if (!window.SafiaEconomiaRiego || !ev) return null;
    var u = ubic(), reg = window.SafiaCasos && SafiaCasos.region ? SafiaCasos.region({ departamento: u.depto, pais: u.pais, lat: u.lat, lon: u.lon }) : null;
    return SafiaEconomiaRiego.calcular({
      cultivos: P.map(function (x, i) { return { cultivo: x.c.cultivo, finalidad: x.c.finalidad, epoca: x.c.epoca, ref: x.ref, riego: sims[i] || null }; }),
      superficieHa: num(ev.superficieHa), inversionUSD: num(ev.inversionUSD), tasaInteres: ev.interesAnual != null ? num(ev.interesAnual) : 7, inversionPartes: ev.inversionPartes || null, vidaUtil: num(ev.vidaUtil),
      energiaUSDmm: ev.energiaModo === 'base' ? null : num(ev.energiaUSDmm), energiaModo: ev.energiaModo || (ev.energiaUSDmm != null ? 'mm' : 'base'), situacion: ev.situacion, region: reg,
      inversionRefHa: reg && INV_REF_HA[reg] ? Object.assign({ region: reg }, INV_REF_HA[reg]) : null
    });
  }
  /* Lo que el riego gana de más y en cuánto tiempo paga la inversión (pedido de Osmar, 9-oct-2026):
     la cuota es lo que agrega el riego; con el interés del banco, cada año paga el interés y el resto baja la deuda */
  function secPago(E) {
    var h = '<h2 class="salto">Lo que gana el riego y cuánto tarda en pagar la inversión</h2>';
    if (!E || !E.ok || !E.ok.length) return h + '<div class="note">' + (climaEstado === 'cargando' ? 'Calculando con el clima del campo…' : 'Sin la referencia de la zona (rinde y costos con riego) no se puede hacer la cuenta.') + '</div>';
    var U = function (v) { return v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + 'US$ ' + fmt(Math.abs(v), 0); };
    var filas = E.ok.map(function (f) {
      var parte = f.parte < 1 ? '<div class="sub">' + fmt(f.parte * 100, 0) + ' % del área</div>' : '';
      return '<tr>' + td('<b>' + esc(f.cultivo) + '</b>' + (f.epoca ? '<div class="sub">' + esc(f.epoca) + '</div>' : '') + parte) + td(fmt(f.kgR, 0) + ' kg', 1) + td(fmt(f.kgS, 0) + ' kg<div class="sub">' + esc(f.secanoDe) + '</div>', 1) +
        td('<b style="color:#178029;">+' + fmt(f.kgR - f.kgS, 0) + ' kg</b>', 1) + td(U(f.margenR), 1) + td(U(f.margenS), 1) + td('<b style="color:' + (f.agrega >= 0 ? '#178029' : '#C0392B') + ';">' + (f.agrega >= 0 ? '+' : '') + U(f.agrega) + '</b>', 1) + '</tr>';
    });
    h += '<div class="sub" style="margin-bottom:4px;">Por hectárea y por año, con los precios vigentes y los costos de la zona (con riego se suman la energía, el mantenimiento y la reposición de nutrientes de los kilos extra).</div>' +
      tabla([{ t: 'Cultivo', w: 18 }, { t: 'Rinde con riego', r: 1, w: 12 }, { t: 'Rinde secano', r: 1, w: 16 }, { t: 'Kilos de más', r: 1, w: 11 }, { t: 'Margen con riego', r: 1, w: 14 }, { t: 'Margen secano', r: 1, w: 14 }, { t: 'Gana el riego', r: 1, w: 15 }], filas);
    if (E.unCultivoSecano) h += '<div class="sub">En el Chaco, sin riego se hace un solo cultivo por año: el secano del proyecto es ' + esc(E.secanoCultivo).toLowerCase() + ' solo.</div>';
    if (!(E.superficieHa > 0)) return h + '<div class="note">Falta la superficie a regar para pasar a todo el proyecto.</div>';
    var F = E.financiado, inv = E.inversionUSD, ref = false;
    if (!(inv > 0) && E.inversionRefHa) { inv = E.inversionRefHa.max * E.superficieHa; ref = true; F = SafiaEconomiaRiego.financiacion(inv, E.anualPaga, E.tasaInteres != null ? E.tasaInteres : 7); }
    h += '<div class="kpis" style="margin-top:10px;">' +
      '<div class="kpi"><div class="sl">Gana el riego por año</div><div class="sv" style="color:#178029;">' + U(E.anualPaga) + '</div><div class="ss">' + fmt(E.superficieHa, 0) + ' ha · ' + (E.situacion === 'nuevo' ? 'margen completo con riego (campo nuevo)' : 'de más que seguir en secano') + '</div></div>' +
      '<div class="kpi"><div class="sl">Inversión</div><div class="sv">' + (inv > 0 ? U(inv) : '—') + '</div><div class="ss">' + (inv > 0 ? U(inv / E.superficieHa) + ' por ha' + (ref ? ' · referencia de Irrigar' : '') : 'sin cargar') + '</div></div>' +
      '<div class="kpi"><div class="sl">Se paga en</div><div class="sv">' + (F ? (F.imposible ? 'no se paga' : fmt(F.anios, 1) + ' años') : (E.recupero != null ? fmt(E.recupero, 1) + ' años' : '—')) + '</div><div class="ss">' + (F && F.tasa > 0 ? 'financiada al ' + fmt(F.tasa, 1) + ' % anual · sin interés ' + fmt(F.sinInteres, 1) + ' años' : 'sin interés') + '</div></div>' +
      '<div class="kpi"><div class="sl">Tasa de retorno</div><div class="sv">' + (E.tir != null ? fmt(E.tir * 100, 1) + ' %' : '—') + '</div><div class="ss">' + (E.horizonte ? 'a ' + E.horizonte + ' años' : '') + '</div></div></div>';
    if (F && !F.imposible && F.tasa > 0) h += '<h3>Año por año, con el interés del banco</h3>' + SafiaEconomiaRiego.cuadroFinanciacionHTML(F);
    else if (F && F.imposible) h += '<div class="note warn">Financiada al ' + fmt(F.tasa, 1) + ' % anual la deuda no baja: lo que gana el riego (' + U(F.anual) + ' por año) no cubre ni el interés (' + U(F.interesAnual) + '). Hay que bajar la inversión, financiar a menos interés o subir el rinde esperado.</div>';
    return h;
  }
  /* Qué hay que hacer en este campo para llegar a esos rindes: su tierra frente a la de los que más rinden, y las correcciones */
  function secCampo(P, LS) {
    var h = '<h2 class="salto">Qué hay que hacer en este campo para llegar a esos rindes</h2>';
    if (!LS) return h + '<div class="note warn">Falta el análisis de suelo del área del proyecto. Sin él no se puede comparar su tierra con la de los que más rinden ni decir qué corregir antes de la primera campaña.</div>';
    var s = LS.s;
    h += '<div class="stats">' + [['pH', s.ph, 1], ['MO %', s.mo, 2], ['P mg/dm³', s.p, 1], ['K cmolc', s.k, 2], ['Ca cmolc', s.ca, 2], ['Mg cmolc', s.mg, 2], ['CIC', s.cic, 2], ['V %', s.satBases, 1], ['Arcilla %', s.arcilla, 1]].filter(function (x) { return num(x[1]) != null; }).map(function (x) { return '<div class="stat"><div class="sl">' + x[0] + '</div><div class="sv">' + fmt(num(x[1]), x[2]) + '</div></div>'; }).join('') + '</div>' +
      (s.fecha ? '<div class="sub">Análisis del ' + fmtF(s.fecha) + (s.profundidad ? ' · ' + esc(s.profundidad) : '') + '</div>' : '');
    // su tierra frente a la de los que más rinden (SafiaCasos: los mejores lotes con riego de la región, mismo cultivo y época; sin nombres)
    P.forEach(function (x) {
      var comp = (x.r.comparacionSuelo || []).filter(function (c) { return c.mio != null && c.referencia != null; });
      if (!comp.length) return;
      var bajo = comp.filter(function (c) { return c.senal === 'bajo'; }), igual = comp.filter(function (c) { return c.senal === 'igual'; });
      var filas = comp.map(function (c) { var pp = c.param, lect = c.senal === 'bajo' ? '<b style="color:#C0392B;">Por debajo</b>' : (c.senal === 'alto' ? '<span style="color:#1F5FBF;">Por encima</span>' : '<span style="color:#178029;">Similar</span>'); return '<tr>' + td(esc(pp.n) + (pp.unidad ? ' <span class="sub">' + pp.unidad + '</span>' : '')) + td(fmt(c.mio, pp.dec), 1) + td(fmt(c.referencia, pp.dec) + (c.nRef ? '<div class="sub">' + c.nRef + ' lote(s)</div>' : ''), 1) + td(c.diferencia == null ? '—' : (c.diferencia > 0 ? '+' : '') + fmt(c.diferencia, pp.dec), 1) + td(lect) + '</tr>'; });
      h += '<h3>Su tierra frente a la de los que más rinden en ' + esc(x.c.cultivo.toLowerCase()) + '</h3>' +
        '<div class="sub" style="margin-bottom:4px;">' + (bajo.length ? 'Es parecida en ' + igual.length + ' de ' + comp.length + ' parámetros y está <b>por debajo en ' + esc(bajo.map(function (c) { return c.param.n; }).join(', ')) + '</b>: eso es lo primero a corregir.' : 'Es la misma clase de tierra que la de los que más rinden (' + igual.length + ' de ' + comp.length + ' parámetros similares): con riego y el manejo de ellos se llega a esos rindes.') + ' Referencia: los ' + (x.r.referenciaSuelo || []).length + ' lote(s) con riego que más rinden en la región, sin nombres.</div>' +
        tabla([{ t: 'Parámetro', w: 26 }, { t: 'Su tierra', r: 1, w: 16 }, { t: 'Los que más rinden', r: 1, w: 20 }, { t: 'Diferencia', r: 1, w: 16 }, { t: 'Lectura', w: 22 }], filas);
    });
    h += '<h3>Lectura del suelo</h3><div class="interp interp-suelo">' + SafiaAgro.tablaInterpretacion(LS.inter) + '</div>' +
      '<h3>Qué corregir antes de la primera campaña (encalado, yeso, fósforo, potasio, materia orgánica)</h3>' + SafiaAgro.listaRecomendaciones(LS.recs) +
      '<div class="sub" style="margin-top:6px;">Interpretación para ' + esc(LS.cultivo.toLowerCase()) + ' con el Manual RS/SC 2016, Embrapa y CAPECO/IPTA como contraste. La prescripción final la define el ingeniero agrónomo.</div>';
    return h;
  }
  function secEconomia(E) {
    var h = '<h2 class="salto">Economía completa del proyecto</h2>';
    if (!E) return h + '<div class="note">' + (climaEstado === 'cargando' ? 'Calculando con el clima del campo…' : 'Sin datos suficientes para la economía (hace falta la referencia de la zona con costos y el clima del campo).') + '</div>';
    h += '<div class="sub" style="margin-bottom:6px;">Por hectárea y para todo el proyecto, con riego y en secano, con los precios vigentes de SAFIA. ' + (ev.situacion === 'nuevo' ? 'Campo nuevo: la inversión se paga con el margen completo con riego.' : 'El campo hoy produce en secano: la inversión se paga con lo que agrega el riego.') + '</div>';
    h += SafiaEconomiaRiego.html(E).replace('grid-template-columns:repeat(auto-fit,minmax(560px,1fr))', 'grid-template-columns:minmax(0,1fr)');
    var c = ev.energiaModo === 'calc' ? ev.energiaCalc : null;
    if (c) h += '<h3>Cómo se calculó la energía</h3>' + tabla([{ t: 'Dato', w: 60 }, { t: 'Valor', r: 1, w: 40 }], [
      ['Potencia por equipo', fmt(c.kw, 1) + ' kW'], ['Tarifa eléctrica', 'US$ ' + fmt(c.tarifa, 3) + ' por kWh'], ['Lámina del equipo en 24 h', fmt(c.lamina, 1) + ' mm'], ['Hectáreas por equipo', fmt(c.ha, 0) + ' ha'],
      ['Horas de bombeo por día', fmt(c.horas || 24, 0)], ['Tiempo con generador', fmt(c.gen || 0, 0) + ' %' + (c.gen > 0 ? ' · ' + fmt(c.genLh, 0) + ' L/h a US$ ' + fmt(c.gasoil, 2) + ' el litro' : '')],
      ['<b>Energía por mm y por ha</b>', '<b>US$ ' + fmt(num(ev.energiaUSDmm), 3) + '</b>']
    ].map(function (r) { return '<tr>' + td(r[0]) + td(r[1], 1) + '</tr>'; })) + '<div class="sub">Costo por día = horas × [(1 − generador) × kW × tarifa + generador × litros por hora × precio del gasoil]; por mm y por ha = costo por día ÷ (mm por día × hectáreas del equipo).</div>';
    return h;
  }
  /* ---------- cómo llegar al líder de la zona (SafiaIgualar, igual que Evaluar; sin nombres de productores) ---------- */
  function secLider(P, sims) {
    if (!window.SafiaIgualar || !SafiaIgualar.prospectoHTML) return '';
    var casos = window.SafiaCasos ? SafiaCasos.armarCasos() : [], u = ubic(), h = '<h2 class="salto">Cómo llegar al líder de la zona</h2><div class="sub" style="margin-bottom:6px;">Para cada cultivo: el punto de partida con riego, el mejor lote con riego de la misma región (sin nombres), qué lo diferencia y el plan con costos para igualarlo.</div>';
    P.forEach(function (x, i) {
      var b = SafiaIgualar.prospectoHTML(Object.assign({}, x.p, { ref: x.ref, pot: x.r.potencial, casos: casos, campoId: ev.campoId, clienteId: ev.clienteId, localidad: u.localidad, departamento: u.depto, pais: u.pais }));
      var s = sims[i];
      b = b.replace(/<details(?![^>]*\sopen)/g, '<details open')                           // en papel todo abierto
           .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')                               // sin botones (mapa, igualar)
           .replace(/(class="sv pot-agua"[^>]*>)…/, '$1' + (s && !s.error ? fmt(s.rindeRelSecano * 100, 0) + ' %' : '—'));
      h += '<div class="seccion">' + b + '</div>';
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
        var uz = SafiaCasos.unidadDe(p[0], p[1]);
        return '<tr>' + td('<b>' + esc(p[0]) + '</b>') + td(esc(p[1] || '—')) + td(esc(p[2] || '—')) + td(uz.corto) + td(U(sec, uz), 1) + td('<b>' + U(rie, uz) + '</b>', 1) + td(rie != null && sec != null ? '<span style="color:#178029;font-weight:700;">+' + U(rie - sec, uz) + '</span>' : '—', 1) + td(g.length, 1) + td(aa) + '</tr>';
      }).filter(Boolean);
      h += '<div class="sub" style="margin-bottom:4px;">' + (a.nivel === 'localidad' ? 'Localidad ' : 'Departamento ') + '<b>' + esc(a.nombre) + '</b> · producción promedio por finalidad: grano en kg/ha, ensilaje en toneladas de materia verde por ha</div>' +
        tabla([{ t: 'Cultivo', w: 14 }, { t: 'Finalidad', w: 15 }, { t: 'Época', w: 13 }, { t: 'Unidad', w: 9 }, { t: 'Secano', r: 1, w: 10 }, { t: 'Con riego', r: 1, w: 10 }, { t: 'Diferencia', r: 1, w: 10 }, { t: 'Registros', r: 1, w: 9 }, { t: 'Año', w: 10 }], filas);
    }
    // forraje por región (la base de Irrigar: Chaco / Oriental)
    var u = ubic(), chaco = /boquer|alto paraguay|hayes/.test(norm(u.depto)), region = chaco ? 'Occidental/Chaco' : 'Oriental/Centro';
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
      '<div class="note info" style="font-size:11px;"><b>Supuestos y fuentes.</b> Clima: lluvia CHIRPS (satélite + estaciones, comparada con la Dirección de Meteorología) y evapotranspiración Penman-Monteith FAO-56 (Open-Meteo, reanálisis ERA5), datos diarios de los últimos 10 años completos. Secano: siembra con el perfil cargado (Fundación IDEAGRO 2025). Economía: referencia de costos de la zona (base de Irrigar), precios vigentes de SAFIA y la inversión cargada del proyecto. Zona: referencia agrícola y forrajera de SAFIA (base de Irrigar). Potencial: casos reales con riego del banco de SAFIA a menos de 300 km (con menos de 3 casos es orientación). Suelo: Manual de Calagem e Adubação RS/SC 2016, Embrapa, CAPECO/IPTA. Agua: FAO Riego y Drenaje 29, USDA Manual 60, universidades e INTA (detalle en la sección del agua). SAFIA compara e interpreta; la prescripción y la decisión de inversión las toma el productor con su ingeniero agrónomo.</div>';
    if (autor || config.firma) h += '<div class="firma"><div class="bloque">' + (config.firma ? '<img src="' + config.firma + '" alt="firma">' : '<div style="height:40px;"></div>') + '<b>' + esc(autor) + '</b>' + (config.matricula ? '<div class="sub">' + esc(config.matricula) + '</div>' : '') + '<div class="sub">' + esc([config.empresa, config.telefono, config.correo].filter(Boolean).join(' · ')) + '</div></div></div>';
    return h + '<div class="pie"><span>Evaluación preparada con SAFIA con datos reales de la zona y del banco de casos.</span><span>' + esc(config.empresa || 'Irrigar') + ' · SAFIA</span></div>';
  }

  function secciones() { var s = {}; document.querySelectorAll('#secciones input').forEach(function (c) { s[c.dataset.s] = c.checked; }); return s; }
  function armar() {
    var hoja = $('hoja');
    if (!ev) { hoja.innerHTML = '<div class="muted" style="padding:40px;text-align:center;">No hay evaluaciones guardadas. Guardá una en <a href="evaluar.html">Evaluar proyecto</a>.</div>'; return; }
    var s = secciones(), P = potenciales(), LA = lecturaAgua(), LS = lecturaSuelo(), sims = simulaciones(), E = hist ? economia(P, sims) : null;
    ECO = E;
    var html = cabecera();
    // mismo orden que la pantalla de Evaluar (9-oct-2026): veredicto y economía primero, después los vecinos, qué hacer, y el clima y el agua al final
    // orden de venta (Osmar, 9-oct-2026): veredicto → lo que gana el riego y cuánto tarda en pagar → qué hacer en su campo → cómo llegar al líder → el detalle
    if (s.resumen) html += secResumen(P, LA, LS);
    if (s.pago) html += secPago(E);
    if (s.suelo) html += secCampo(P, LS);
    if (s.lider) html += secLider(P, sims);
    if (s.economia) html += secEconomia(E);
    if (s.potencial) html += secPotencial(P);
    if (s.clima) html += secClima();
    if (s.agua) html += secAgua(LA);
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
  function telefonoWa(t) { return window.SafiaTelefono ? SafiaTelefono.wa(t) : String(t || '').replace(/\D/g, ''); }   // regla única en safia-sync.js (respeta el código de país)

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
    $('btnPdf').addEventListener('click', function () {   // nombre del PDF: prospecto · campo · fecha
      var titulo = document.title, partes = ['Evaluación SAFIA', cliente ? (cliente.nombre || cliente.razonSocial || '') : '', campo ? campo.nombre : '', new Date().toISOString().slice(0, 10)];
      document.title = partes.filter(Boolean).join(' - ').replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
      setTimeout(function () { window.print(); setTimeout(function () { document.title = titulo; }, 1500); }, 50);
    });
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
