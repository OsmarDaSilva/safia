/* SAFIA — Informe para el cliente (informe.html)
   -------------------------------------------------------------------
   Arma una hoja imprimible (Guardar como PDF desde el navegador) con
   todo lo que SAFIA sabe del campo o de un lote: resumen, lotes con
   imagen satelital, campañas y rinde contra la zona, agua, suelo con su
   lectura agronómica, vigor satelital (NDVI), plan de rotación y el
   diagnóstico con recomendaciones. Reutiliza los motores de SAFIA:
   SafiaCasos, SafiaAgro, SafiaNDVI, SafiaRotacion, SafiaLotes. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function guardar(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, dec) { if (n === null || n === undefined || n === '' || isNaN(n)) return '—'; return Number(n).toLocaleString('es-PY', { maximumFractionDigits: dec === undefined ? 1 : dec }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function flecha(d, dec) { if (d == null || isNaN(d)) return '<span class="muted">—</span>'; var s = d > 0 ? '+' : ''; return '<span class="' + (d > 0 ? 'evo-mejor' : (d < 0 ? 'evo-peor' : 'muted')) + '">' + s + fmt(d, dec) + '</span>'; }
  function tabla(enc, filas) { var fijo = enc.some(function (e) { return e.w; }); return '<table class="tbl' + (fijo ? ' tbl-fijo' : '') + '"><thead><tr>' + enc.map(function (e) { return '<th' + (e.r ? ' class="r"' : '') + (e.w ? ' style="width:' + e.w + '%"' : '') + '>' + e.t + '</th>'; }).join('') + '</tr></thead><tbody>' + (filas.length ? filas.join('') : '<tr><td colspan="' + enc.length + '" class="muted">Sin datos</td></tr>') + '</tbody></table>'; }
  function td(v, r) { return '<td' + (r ? ' class="r"' : '') + '>' + v + '</td>'; }
  function toast(m, err) { var e = $('estado'); e.textContent = m; e.style.color = err ? '#C0392B' : '#8C9196'; }

  var campoActual = null, equipoSel = '', campanaSel = '', refZona = null, refAmbito = '', config = {};
  // Puente para los módulos del Banco (mismo contrato que banco.html)
  window.SafiaBanco = { campoActual: function () { return campoActual; }, leer: leer, guardar: guardar, toast: toast, refrescar: function () {} };

  var LOGO = '<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg"><path d="M 50 8 Q 12 50 12 80 Q 12 110 50 110 Q 88 110 88 80 Q 88 50 50 8 Z" fill="#22A93A"/><path d="M50 30v70M50 60L32 48M50 78l18-14" stroke="#0F3D14" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';

  /* ---------- datos ---------- */
  function nombreCliente(id) { var c = leer('clientes').find(function (x) { return String(x.id) === String(id); }); return c ? (c.nombre || c.razonSocial || '') : ''; }
  function lotesDelCampo() { return leer('equipos').filter(function (e) { return String(e.campoId) === String(campoActual.id) && (!equipoSel || String(e.id) === String(equipoSel)); }); }
  function analisisRepresentativos(lista) { var r = lista.filter(function (a) { return !a.enPromedio; }); return r.length ? r : lista; }
  function analisisDelLote(equipoId) {
    var todos = analisisRepresentativos(leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campoActual.id); }));
    var del = todos.filter(function (a) { return String(a.equipoId || '') === String(equipoId); });
    var lista = del.length ? del : todos.filter(function (a) { return !a.equipoId; });
    lista.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    return lista;
  }
  // Varias muestras del mismo lote con la misma fecha y sin promedio guardado: se promedian al vuelo (el Banco tiene el botón "Promediar" para dejarlo guardado)
  var CLAVES_SUELO = ['ph', 'mo', 'p', 'k', 'ca', 'mg', 'cic', 'satBases', 'arena', 'limo', 'arcilla', 'aluminio', 'satAluminio', 'azufre', 'boro', 'zinc', 'cobre', 'manganeso'];
  function sueloActual(lista) {
    if (!lista.length) return null;
    var ult = lista[lista.length - 1], mismos = lista.filter(function (a) { return String(a.fecha) === String(ult.fecha); });
    if (mismos.length < 2 || ult.esPromedio) return ult;
    var out = Object.assign({}, ult, { esPromedio: true, nMuestras: mismos.length, promedioAlVuelo: true, muestra: '' });
    CLAVES_SUELO.forEach(function (k) { var vs = mismos.map(function (a) { return a[k] == null || a[k] === '' || isNaN(Number(a[k])) ? null : Number(a[k]); }).filter(function (v) { return v !== null; }); out[k] = vs.length ? Math.round(vs.reduce(function (s, v) { return s + v; }, 0) / vs.length * 100) / 100 : null; });
    return out;
  }
  function casosDelCampo() {
    var todos = SafiaCasos.armarCasos();
    return { todos: todos, mios: todos.filter(function (c) { return String(c.campoId) === String(campoActual.id) && (!equipoSel || String(c.equipoId) === String(equipoSel)) && (!campanaSel || String(c.campanaId) === String(campanaSel)); }).sort(function (a, b) { return String(a.siembra).localeCompare(String(b.siembra)); }) };
  }
  function cargarReferenciaZona() {
    refZona = null; refAmbito = '';
    if (!window.safiaSupabase || !campoActual || (!campoActual.localidad && !campoActual.departamento)) return Promise.resolve();
    return window.safiaSupabase.from('safia_ref_produccion').select('localidad,departamento,cultivo,finalidad,epoca_siembra,riego,prod_ton_ha').then(function (r) {
      if (r.error || !r.data) return;
      var loc = campoActual.localidad, dep = campoActual.departamento;
      var porLoc = loc ? r.data.filter(function (x) { return norm(x.localidad) === norm(loc); }) : [];
      if (porLoc.length) { refZona = porLoc; refAmbito = loc; return; }
      var porDep = dep ? r.data.filter(function (x) { return norm(x.departamento) === norm(dep); }) : [];
      if (porDep.length) { refZona = porDep; refAmbito = dep; }
    }, function () {});
  }
  function refZonaPara(cultivo, riego) {
    if (!refZona) return null;
    var filas = refZona.filter(function (x) { return norm(x.cultivo) === norm(cultivo) && (!x.finalidad || /grano/i.test(x.finalidad)) && (!!x.riego === !!riego); });
    if (!filas.length) filas = refZona.filter(function (x) { return norm(x.cultivo) === norm(cultivo); });
    var v = filas.map(function (x) { return Number(x.prod_ton_ha); }).filter(function (n) { return !isNaN(n); });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length * 1000 : null;
  }

  /* ---------- secciones ---------- */
  function secResumen(cx) {
    var lotes = lotesDelCampo(), ha = 0; lotes.forEach(function (l) { ha += (l.poligono && l.poligono.ha) || parseFloat(l.superficie) || 0; });
    var ult = cx.mios[cx.mios.length - 1];
    var mejorZona = ult ? cx.todos.filter(function (c) { return String(c.campoId) !== String(campoActual.id) && norm(c.cultivo) === norm(ult.cultivo) && ((campoActual.localidad && norm(c.localidad) === norm(campoActual.localidad)) || (campoActual.departamento && norm(c.departamento) === norm(campoActual.departamento))); }).reduce(function (a, b) { return !a || b.rindeKgHa > a.rindeKgHa ? b : a; }, null) : null;
    var refZ = ult ? refZonaPara(ult.cultivo, ult.riego) : null;
    var ndviUlt = null; lotes.forEach(function (l) { var s = window.SafiaNDVI ? SafiaNDVI.serieDe(l.id) : []; if (s && s.length) { var p = s[s.length - 1]; if (!ndviUlt || p.fecha > ndviUlt.fecha) ndviUlt = p; } });
    var analisis = lotes.map(function (l) { return analisisDelLote(l.id).slice(-1)[0]; }).filter(Boolean);
    var limitantes = 0; analisis.forEach(function (a) { if (window.SafiaAgro) SafiaAgro.interpretarSuelo(a, ult ? ult.cultivo : 'Soja').forEach(function (i) { if (i.estado === 'limita') limitantes++; }); });
    var html = '<h2>Resumen</h2><div class="kpis">' +
      '<div class="kpi"><div class="sl">Superficie</div><div class="sv">' + fmt(ha, 1) + ' ha</div><div class="ss">' + lotes.length + ' lote(s)' + (equipoSel ? '' : ' del campo') + '</div></div>' +
      '<div class="kpi"><div class="sl">Última campaña' + (cx.mios.length > 1 ? ' (de ' + cx.mios.length + ' cerradas)' : '') + '</div><div class="sv">' + (ult ? fmt(ult.rindeKgHa, 0) : '—') + '</div><div class="ss">' + (ult ? esc(ult.cultivo) + ' ' + esc(ult.campana) + ' · kg/ha' : 'sin campañas cerradas') + '</div></div>' +
      '<div class="kpi"><div class="sl">Frente a la zona</div><div class="sv">' + (ult && (mejorZona || refZ) ? flecha(ult.rindeKgHa - (mejorZona ? mejorZona.rindeKgHa : refZ), 0) : '—') + '</div><div class="ss">' + (mejorZona ? 'vs mejor de ' + esc(campoActual.localidad || campoActual.departamento) : (refZ ? 'vs promedio ' + esc(refAmbito) : 'sin referencia')) + '</div></div>' +
      '<div class="kpi"><div class="sl">Vigor satelital</div><div class="sv">' + (ndviUlt ? fmt(ndviUlt.ndvi, 2) : '—') + '</div><div class="ss">' + (ndviUlt ? 'NDVI al ' + fmtF(ndviUlt.fecha) : 'sin serie') + '</div></div></div>';
    var puntos = [];
    // todas las campañas cerradas del campo, no solo la última
    if (cx.mios.length > 1) puntos.push('Campañas cerradas en SAFIA (' + cx.mios.length + '): ' + cx.mios.map(function (c) { return '<b>' + esc(c.cultivo) + ' ' + esc(c.campana) + '</b> ' + fmt(c.rindeKgHa, 0) + ' kg/ha'; }).join(' · ') + '.');
    if (ult) puntos.push('La ' + (cx.mios.length > 1 ? 'más reciente' : 'única campaña cerrada') + ' fue <b>' + esc(ult.cultivo) + ' ' + esc(ult.campana) + '</b> con <b>' + fmt(ult.rindeKgHa, 0) + ' kg/ha</b>' + (ult.aguaTotalMM != null ? ', con ' + fmt(ult.aguaTotalMM, 0) + ' mm de agua total (' + fmt(ult.lluviaMM || 0, 0) + ' de lluvia y ' + fmt(ult.riegoMM || 0, 0) + ' de riego)' : '') + '.');
    // cada cultivo cerrado frente a la zona (no solo el último)
    var cultivosVistos = {};
    cx.mios.slice().reverse().forEach(function (c) {
      var kc = norm(c.cultivo); if (cultivosVistos[kc] || (ult && kc === norm(ult.cultivo))) return; cultivosVistos[kc] = true;
      var mz = cx.todos.filter(function (o) { return String(o.campoId) !== String(campoActual.id) && norm(o.cultivo) === kc && ((campoActual.localidad && norm(o.localidad) === norm(campoActual.localidad)) || (campoActual.departamento && norm(o.departamento) === norm(campoActual.departamento))); }).reduce(function (a, b) { return !a || b.rindeKgHa > a.rindeKgHa ? b : a; }, null);
      if (mz) puntos.push(esc(c.cultivo) + ' ' + esc(c.campana) + ' (' + fmt(c.rindeKgHa, 0) + ' kg/ha) frente al mejor de ' + esc(campoActual.localidad || campoActual.departamento) + ' (' + fmt(mz.rindeKgHa, 0) + '): ' + (c.rindeKgHa >= mz.rindeKgHa ? 'este lote es la referencia de la zona.' : 'faltan ' + fmt(mz.rindeKgHa - c.rindeKgHa, 0) + ' kg/ha.'));
    });
    if (ult && mejorZona) puntos.push('El mejor rinde de ' + esc(ult.cultivo) + ' registrado en ' + esc(campoActual.localidad || campoActual.departamento) + ' es <b>' + fmt(mejorZona.rindeKgHa, 0) + ' kg/ha</b>: ' + (ult.rindeKgHa >= mejorZona.rindeKgHa ? 'este lote es la referencia de la zona.' : 'la diferencia es de ' + fmt(mejorZona.rindeKgHa - ult.rindeKgHa, 0) + ' kg/ha; el diagnóstico al final dice qué la explica.'));
    if (analisis.length) puntos.push(limitantes ? 'El suelo tiene <b>' + limitantes + ' parámetro(s) que limitan</b> el rinde según el último análisis (detalle en la sección Suelo).' : 'El último análisis de suelo no muestra parámetros limitantes para el cultivo principal.');
    if (ndviUlt) puntos.push('El satélite ve el lote con NDVI <b>' + fmt(ndviUlt.ndvi, 2) + '</b> al ' + fmtF(ndviUlt.fecha) + (ndviUlt.ndvi >= 0.7 ? ' (canopia plena).' : (ndviUlt.ndvi >= 0.4 ? ' (cultivo en desarrollo).' : ' (suelo con poca cobertura verde).')));
    if (puntos.length) html += '<ul>' + puntos.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>';
    return html;
  }

  function secLotes() {
    var lotes = lotesDelCampo();
    var filas = lotes.map(function (l) {
      var camps = leer('campanas').filter(function (c) { return String(c.equipoId) === String(l.id); }).length;
      return '<tr>' + td('<b>' + esc(l.nombre) + '</b>') + td(esc(SafiaLotes.NOMBRE_TIPO[l.tipo] || l.tipo || '') + (l.marca ? '<div class="sub">' + esc(l.marca) + (l.modelo ? ' ' + esc(String(l.modelo).length > 38 ? String(l.modelo).slice(0, 38) + '…' : l.modelo) : '') + '</div>' : '')) + td(l.superficie ? fmt(l.superficie, 1) : '—', 1) + td(l.poligono ? fmt(l.poligono.ha, 1) : '—', 1) + td(camps, 1) + td(l.gps ? esc(l.gps) : (l.poligono && l.poligono.centro ? l.poligono.centro.lat + ', ' + l.poligono.centro.lon : '—')) + '</tr>';
    });
    var html = '<h2>Lotes</h2>' + tabla([{ t: 'Lote', w: 16 }, { t: 'Tipo / equipo', w: 38 }, { t: 'Ha declaradas', r: 1, w: 10 }, { t: 'Ha según polígono', r: 1, w: 12 }, { t: 'Campañas', r: 1, w: 10 }, { t: 'Ubicación', w: 14 }], filas);
    html += '<div id="imagenesLotes" class="dos" style="margin-top:10px;"></div>';
    return html;
  }
  // Imágenes satelitales (color real) de la última pasada despejada de cada lote con polígono y serie NDVI
  function cargarImagenes() {
    var cont = $('imagenesLotes'); if (!cont || !window.safiaSupabase) return;
    var lotes = lotesDelCampo().filter(function (l) { return l.poligono && l.poligono.partes; });
    lotes.forEach(function (l) {
      var s = (SafiaNDVI.serieDe(l.id) || []).filter(function (p) { return !(p.nubes_pct > 40); });
      if (!s.length) return;
      var ult = s[s.length - 1];
      var desde = new Date(ult.fecha + 'T12:00:00'); desde.setDate(desde.getDate() - 365);
      var pico = s.filter(function (x) { return x.fecha >= desde.toISOString().slice(0, 10); }).reduce(function (a, b) { return !a || b.ndvi > a.ndvi ? b : a; }, null);
      var pedidos = [{ p: ult, titulo: 'Última pasada' }]; if (pico && pico.fecha !== ult.fecha) pedidos.push({ p: pico, titulo: 'Pico de vigor de los últimos 12 meses' });
      pedidos.forEach(function (pd) {
        var p = pd.p, caja = document.createElement('div');
        caja.innerHTML = '<div class="sub">' + esc(l.nombre) + ' · ' + pd.titulo + ' · ' + fmtF(p.fecha) + ' · cargando…</div>';
        cont.appendChild(caja);
        window.safiaSupabase.functions.invoke('safia-ndvi', { body: { tipo: 'imagen', equipoId: String(l.id), partes: l.poligono.partes, fecha: p.fecha, capa: 'ndvi', ancho: 500 } }).then(function (r) {
          var d = r.data || {}; if (r.error || !d.ok) { caja.innerHTML = '<div class="sub">' + esc(l.nombre) + ': sin imagen (' + esc((r.error && r.error.message) || d.error || 'error') + ')</div>'; return; }
          caja.innerHTML = '<div class="sub" style="margin-bottom:3px;"><b>' + esc(l.nombre) + '</b> · ' + pd.titulo + ' · ' + fmtF(p.fecha) + ' · NDVI ' + fmt(p.ndvi, 2) + '</div><img class="sat" src="data:image/png;base64,' + d.png + '" alt="NDVI ' + esc(l.nombre) + '"><div class="sub">Verde oscuro = canopia cerrada; amarillo y marrón = menor vigor o suelo desnudo.</div>';
        }).catch(function (e) { caja.innerHTML = '<div class="sub">' + esc(l.nombre) + ': sin imagen (' + esc(e.message) + ')</div>'; });
      });
    });
  }

  function secCampanas(cx) {
    var filas = cx.mios.map(function (c) {
      var refZ = refZonaPara(c.cultivo, c.riego);
      var mejor = cx.todos.filter(function (x) { return String(x.campoId) !== String(campoActual.id) && norm(x.cultivo) === norm(c.cultivo) && campoActual.localidad && norm(x.localidad) === norm(campoActual.localidad); }).reduce(function (a, b) { return !a || b.rindeKgHa > a.rindeKgHa ? b : a; }, null);
      return '<tr>' + td('<b>' + esc(c.campana) + '</b><div class="sub">' + esc(c.equipo) + (c.riego ? '' : ' · secano') + '</div>') + td(esc(c.cultivo) + '<div class="sub">' + esc(c.variedad || '—') + '</div>') + td('<span style="white-space:nowrap;">' + fmtF(c.siembra) + '</span><div class="sub">' + (c.dias != null ? c.dias + ' días' : '') + '</div>') + td('<span style="white-space:nowrap;">' + fmtF(c.cosecha) + '</span>') +
        td(c.aguaTotalMM != null ? fmt(c.aguaTotalMM, 0) + '<div class="sub">' + fmt(c.lluviaMM || 0, 0) + ' lluvia · ' + fmt(c.riegoMM || 0, 0) + ' riego</div>' : '—', 1) +
        td('<span class="num">' + fmt(c.rindeKgHa, 0) + '</span>' + (c.objetivoKgHa ? '<div class="sub">objetivo ' + fmt(c.objetivoKgHa, 0) + '</div>' : '') + (c.precioUSDt ? '<div class="sub">US$ ' + fmt(c.precioUSDt, 0) + '/t · ' + fmt(c.rindeKgHa * c.precioUSDt / 1000, 0) + ' US$/ha</div>' : ''), 1) +
        td(refZ ? flecha(c.rindeKgHa - refZ, 0) + '<div class="sub">prom. ' + esc(refAmbito) + ' ' + fmt(refZ, 0) + '</div>' : (mejor ? flecha(c.rindeKgHa - mejor.rindeKgHa, 0) + '<div class="sub">mejor local ' + fmt(mejor.rindeKgHa, 0) + '</div>' : '<span class="muted">—</span>'), 1) + '</tr>';
    });
    return '<h2>Campañas y rinde</h2>' + tabla([{ t: 'Campaña', w: 21 }, { t: 'Cultivo', w: 11 }, { t: 'Siembra', w: 13 }, { t: 'Cosecha', w: 13 }, { t: 'Agua mm', r: 1, w: 15 }, { t: 'Rinde kg/ha', r: 1, w: 13 }, { t: 'vs zona', r: 1, w: 14 }], filas) +
      (refZona ? '<div class="sub" style="margin-top:4px;">Referencia de zona: promedio de ' + esc(refAmbito) + ' (base de referencia SAFIA, misma condición de riego cuando hay dato).</div>' : '');
  }

  function secAgua(cx) {
    var porCultivo = {}; cx.mios.forEach(function (c) { (porCultivo[c.cultivo] = porCultivo[c.cultivo] || []).push(c); });
    var filas = [], reglas = [];
    Object.keys(porCultivo).forEach(function (cu) {
      var lista = porCultivo[cu].filter(function (c) { return c.aguaTotalMM != null; }); if (!lista.length) return;
      var mejor = lista.reduce(function (a, b) { return b.rindeKgHa > a.rindeKgHa ? b : a; });
      lista.forEach(function (c) { filas.push('<tr' + (c === mejor ? ' style="background:#E7F6EA;"' : '') + '>' + td(esc(cu)) + td(esc(c.campana)) + td(fmt(c.lluviaMM, 0), 1) + td(fmt(c.riegoMM, 0), 1) + td('<b>' + fmt(c.aguaTotalMM, 0) + '</b>', 1) + td(c.clima ? fmt(c.clima.et0Total, 0) : '—', 1) + td('<b>' + fmt(c.rindeKgHa, 0) + '</b>', 1) + td(c.aguaTotalMM ? fmt(c.rindeKgHa / c.aguaTotalMM, 1) : '—', 1) + '</tr>'); });
      reglas.push('<li><b>' + esc(cu) + ':</b> el mejor rinde (' + fmt(mejor.rindeKgHa, 0) + ' kg/ha, ' + esc(mejor.campana) + ') se logró con ' + fmt(mejor.aguaTotalMM, 0) + ' mm de agua total (' + fmt(mejor.lluviaMM || 0, 0) + ' de lluvia y ' + fmt(mejor.riegoMM || 0, 0) + ' de riego)' + (mejor.clima ? ', con una demanda (ET0) de ' + fmt(mejor.clima.et0Total, 0) + ' mm' : '') + '. En un año seco, la referencia es completar con riego hasta esos ' + fmt(mejor.aguaTotalMM, 0) + ' mm.</li>');
    });
    var sonda = window.SafiaHumedad ? SafiaHumedad.htmlResumen(campoActual.id) : '';
    var balances = window.SafiaAgua ? lotesDelCampo().map(function (l) { var camps = SafiaAgua.campanasDelLote(l.id); var c = camps.find(function (x) { return x.abierta; }) || camps[0]; return c ? '<div class="seccion" id="bal_' + esc(l.id) + '" data-camp="' + esc(c.id) + '"><h3>' + esc(l.nombre) + ' · balance hídrico por etapa · ' + esc(c.cultivo) + ' ' + esc(c.nombre) + '</h3><div class="muted">calculando…</div></div>' : ''; }).join('') : '';
    return '<h2>Agua: lluvia, riego y rinde</h2>' + sonda + balances + tabla([{ t: 'Cultivo', w: 10 }, { t: 'Campaña', w: 22 }, { t: 'Lluvia', r: 1, w: 10 }, { t: 'Riego', r: 1, w: 10 }, { t: 'Total mm', r: 1, w: 12 }, { t: 'ET0 mm', r: 1, w: 12 }, { t: 'Rinde', r: 1, w: 12 }, { t: 'kg por mm', r: 1, w: 12 }], filas) + (reglas.length ? '<div class="note ok"><b>Regla práctica para el riego:</b><ul>' + reglas.join('') + '</ul></div>' : '');
  }

  function secSuelo(cx) {
    var lotes = lotesDelCampo(), html = '<h2>Suelo</h2>', alguno = false;
    var cultivo = cx.mios.length ? cx.mios[cx.mios.length - 1].cultivo : 'Soja';
    lotes.forEach(function (l) {
      var lista = analisisDelLote(l.id); if (!lista.length) return;
      var a = sueloActual(lista); alguno = true;
      html += '<div class="seccion"><h3>' + esc(l.nombre) + ' · análisis del ' + fmtF(a.fecha) + (a.esPromedio ? ' (promedio de ' + a.nMuestras + ' muestras' + (a.promedioAlVuelo ? ' del mismo día' : '') + ')' : (a.equipoId ? '' : ' (todo el campo)')) + (a.profundidad ? ' · ' + esc(a.profundidad) : '') + '</h3>';
      html += '<div class="stats" style="margin-bottom:6px;">' + [['pH', a.ph, 1], ['MO %', a.mo, 2], ['P mg/dm³', a.p, 1], ['K cmolc', a.k, 2], ['Ca cmolc', a.ca, 2], ['Mg cmolc', a.mg, 2], ['CIC', a.cic, 2], ['V %', a.satBases, 1]].map(function (x) { return '<div class="stat"><div class="sl">' + x[0] + '</div><div class="sv">' + fmt(x[1], x[2]) + '</div></div>'; }).join('') + '</div>';
      if (window.SafiaAgro) {
        var interp = SafiaAgro.interpretarSuelo(a, cultivo);
        html += '<div class="interp interp-suelo">' + SafiaAgro.tablaInterpretacion(interp) + '</div>';
        if (lista.length >= 2) {
          var ant = lista[lista.length - 2], cambios = [];
          [['ph', 'pH', 1], ['mo', 'MO', 2], ['p', 'P', 1], ['k', 'K', 2], ['ca', 'Ca', 2], ['mg', 'Mg', 2], ['satBases', 'V%', 1]].forEach(function (p) { if (a[p[0]] != null && ant[p[0]] != null && Math.abs(a[p[0]] - ant[p[0]]) > 0.001) cambios.push(p[1] + ' ' + flecha(a[p[0]] - ant[p[0]], p[2])); });
          if (cambios.length) html += '<div class="sub" style="margin-top:4px;">Cambios desde el análisis del ' + fmtF(ant.fecha) + ': ' + cambios.join(' · ') + '</div>';
        }
      }
      html += '</div>';
    });
    if (!alguno) html += '<div class="note">No hay análisis de suelo cargados' + (equipoSel ? ' para este lote' : '') + '. Con un análisis, SAFIA interpreta cada parámetro (CAPECO/IPTA, Embrapa) y recomienda encalado y fertilización.</div>';
    return html;
  }

  function secFoliar() {
    if (!window.SafiaFoliar) return '';
    var lotes = lotesDelCampo(), html = '<h2>Análisis foliar: lo que absorbió la planta</h2>', alguno = false;
    lotes.forEach(function (l) {
      var a = SafiaFoliar.ultimoDelLote(l.id); if (!a || String(a.equipoId || '') !== String(l.id) && SafiaFoliar.lista().some(function (x) { return x.equipoId; })) return;
      alguno = true;
      var suelo = sueloActual(analisisDelLote(l.id));
      var est = SafiaFoliar.estadiosDe(a.cultivo).find(function (e) { return e.k === a.estadio; });
      html += '<div class="seccion"><h3>' + esc(l.nombre) + ' · ' + esc(a.cultivo || '') + ' · muestreo del ' + fmtF(a.fecha) + (est ? ' · ' + esc(est.n) : '') + (a.laboratorio ? ' · ' + esc(a.laboratorio) : '') + '</h3><div class="interp interp-foliar">' + SafiaFoliar.htmlLectura(a, suelo) + '</div></div>';
    });
    if (!alguno) html += '<div class="note">No hay análisis foliares cargados' + (equipoSel ? ' para este lote' : '') + '. Muestreando la hoja índice en floración, SAFIA compara con los rangos de Embrapa/Fertilizar y cruza con el suelo.</div>';
    return html;
  }
  function secNDVI() {
    if (!window.SafiaNDVI) return '';
    var lotes = lotesDelCampo(), html = '<h2>Vigor satelital (NDVI)</h2>', alguno = false;
    lotes.forEach(function (l) {
      var s = SafiaNDVI.serieDe(l.id) || []; if (!s.length) return; alguno = true;
      var hasta = s[s.length - 1].fecha, desdeD = new Date(hasta + 'T12:00:00'); desdeD.setDate(desdeD.getDate() - 365);
      var desde = desdeD.toISOString().slice(0, 10);
      var cs = campanaSeleccionada();
      if (cs && cs.siembra) { var dI = new Date(cs.siembra + 'T12:00:00'); dI.setDate(dI.getDate() - 15); desde = dI.toISOString().slice(0, 10); var fI = new Date((cs.fin || cs.siembra) + 'T12:00:00'); fI.setDate(fI.getDate() + (cs.fin ? 15 : 160)); var h2 = fI.toISOString().slice(0, 10); if (h2 < hasta) hasta = h2; }
      var vis = s.filter(function (p) { return p.fecha >= desde; });
      var marcas = []; SafiaNDVI.campanasDelLote(l.id).forEach(function (c, i) { marcas.push({ fecha: c.siembra, color: ['#178029', '#2E72C8', '#B8731A', '#8E44AD'][i % 4], texto: 'siembra ' + c.cultivo }); if (c.cosecha) marcas.push({ fecha: c.cosecha, color: ['#178029', '#2E72C8', '#B8731A', '#8E44AD'][i % 4], texto: 'cosecha' }); });
      html += '<div class="seccion"><h3>' + esc(l.nombre) + ' · últimos 12 meses (' + vis.length + ' pasadas del satélite)</h3>' + SafiaNDVI.svgSerie(vis, marcas, { desde: desde, hasta: hasta }) + '<div style="margin-top:6px;" id="ndviCamp_' + esc(l.id) + '">' + SafiaNDVI.htmlCampanas(l, s) + '</div></div>';
    });
    if (!alguno) html += '<div class="note">Todavía no se trajo la serie del satélite para estos lotes (Banco → Vigor satelital → "Traer del satélite").</div>';
    html += '<div class="sub">Fuente: Sentinel-2 (ESA / Copernicus), 10 m por píxel, pasadas nubladas descartadas. NDVI: 0 = suelo desnudo, 1 = canopia cerrada.</div>';
    return html;
  }

  function secRotacion() {
    if (!window.SafiaRotacion) return '';
    var lotes = lotesDelCampo(), html = '<h2>Rotación de cultivos</h2>', alguno = false;
    lotes.forEach(function (l) {
      var hist = SafiaRotacion.historialDelLote(l.id), plan = SafiaRotacion.planDelLote(l.id);
      if (!hist.length && !plan) return; alguno = true;
      html += '<div class="seccion"><h3>' + esc(l.nombre) + '</h3>';
      if (hist.length) html += '<div class="sub" style="margin-bottom:4px;">Historial: ' + hist.slice(-8).map(function (h) { return '<b>' + esc(SafiaRotacion.etiqueta(h.temporada)) + '</b> ' + esc(h.cultivo) + (h.rinde ? ' (' + fmt(h.rinde, 0) + ')' : ''); }).join(' → ') + '</div>';
      if (plan && plan.temporadas && plan.temporadas.length) {
        html += tabla([{ t: 'Temporada', w: 16 }, { t: 'Cultivo / cobertura', w: 22 }, { t: 'Variedad', w: 16 }, { t: 'Objetivo kg/ha', r: 1, w: 14 }, { t: 'Nota', w: 32 }], plan.temporadas.map(function (t) { return '<tr>' + td('<b>' + esc(SafiaRotacion.etiqueta(t)) + '</b>') + td(esc(t.cultivo || '—')) + td(esc(t.variedad || '—')) + td(t.objetivoKgHa ? fmt(t.objetivoKgHa, 0) : '—', 1) + td(esc(t.nota || '')) + '</tr>'; }));
        var sec = hist.map(function (h) { return { temporada: h.temporada, cultivo: h.cultivo, plan: false }; }).concat(plan.temporadas.map(function (t) { return { temporada: t, cultivo: t.cultivo, plan: true }; }));
        var av = SafiaRotacion.avisos(sec), idx = SafiaRotacion.indiceRotacion(sec);
        if (idx) html += '<div class="sub" style="margin-top:4px;">Diversidad del plan: ' + idx.diversidad + ' %' + (idx.cobertura != null ? ' · inviernos cubiertos: ' + idx.cobertura + ' %' : '') + '</div>';
        av.forEach(function (a) { html += '<div class="note ' + (a.tipo === 'alto' ? 'warn' : (a.tipo === 'bien' ? 'ok' : 'info')) + '">' + esc(a.texto) + '</div>'; });
      } else html += '<div class="sub">Sin plan de rotación cargado para este lote.</div>';
      html += '</div>';
    });
    if (!alguno) html += '<div class="note">Sin historial ni plan de rotación cargados.</div>';
    return html;
  }

  function secDiagnostico(cx) {
    if (!window.SafiaAgro) return '';
    var porCultivo = {}; cx.mios.forEach(function (c) { (porCultivo[c.cultivo] = porCultivo[c.cultivo] || []).push(c); });
    var html = '<h2>Diagnóstico agronómico y recomendaciones</h2>';
    var cultivos = Object.keys(porCultivo);
    if (!cultivos.length) return html + '<div class="note">Sin campañas cerradas todavía: el diagnóstico compara la mejor campaña de cada cultivo con la mejor de la zona.</div>';
    cultivos.forEach(function (cu) {
      var mio = porCultivo[cu].reduce(function (a, b) { return b.rindeKgHa > a.rindeKgHa ? b : a; });
      var rp = SafiaAgro.referenciaPara(mio, cx.todos, campoActual), ref = rp.ref;
      var local = cx.todos.filter(function (c) { return String(c.campoId) !== String(campoActual.id) && norm(c.cultivo) === norm(cu) && campoActual.localidad && norm(c.localidad) === norm(campoActual.localidad); });
      html += '<div class="card seccion"><div class="card-h"><h3>' + esc(cu) + ' · ' + esc(mio.campana) + ' · ' + fmt(mio.rindeKgHa, 0) + ' kg/ha' + (ref ? ' · comparado con el mejor lote de ' + esc(rp.ambito || 'la zona') + ' (' + fmt(ref.rindeKgHa, 0) + ' kg/ha)' : (rp.esMejor ? ' · el mejor lote de ' + esc(rp.ambito || 'la zona') + ' (siguiente: ' + fmt(rp.siguiente.rindeKgHa, 0) + ' kg/ha)' : ' · sin otro lote de la zona para comparar')) + '</h3></div>' + SafiaAgro.informeHTML(mio, ref, cu, { esMejor: rp.esMejor, siguiente: rp.siguiente, ambito: rp.ambito, propio: { mejor: mio.rindeKgHa, promedio: porCultivo[cu].reduce(function (t, c) { return t + c.rindeKgHa; }, 0) / porCultivo[cu].length, n: porCultivo[cu].length }, zona: { promedio: refZonaPara(cu, mio.riego), mejor: ref ? ref.rindeKgHa : null, ambito: local.length ? campoActual.localidad : campoActual.departamento } }) + '</div>';
    });
    return html;
  }

  function secMeta(cx) {
    if (!window.SafiaMeta || !window.SafiaAgro) return '';
    // La meta la decide el productor: 1) la meta guardada en la campaña en curso del lote (Banco → Meta o ficha), 2) la meta escrita en la barra del informe, 3) referencia 6.000 (CESB)
    var metaBarra = (function () { var el = document.getElementById('metaInforme'); var v = el ? parseFloat(el.value) : NaN; return v > 0 ? v : null; })();
    function metaGuardadaDelLote(equipoId, cu) {
      var mejor = null;
      leer('campanas').forEach(function (c) { if (String(c.equipoId) !== String(equipoId)) return; (c.cultivos || []).forEach(function (x) { if (!x || SafiaMeta.claveCultivo(x.cultivo) !== cu || x.rendimientoReal) return; var m = (x.planMeta && x.planMeta.kgHa) || parseFloat(x.rendimientoObj); if (m > 0 && (!mejor || String(x.fechaSiembra || '') > String(mejor.siembra || ''))) mejor = { meta: m, campana: c.nombre, siembra: x.fechaSiembra }; }); });
      return mejor;
    }
    var html = '<h2>Camino a la meta: qué le falta al suelo, qué corregir y cuánto cuesta</h2>';
    var porLote = {}; cx.mios.forEach(function (c) { if (c.rindeKgHa) (porLote[c.equipoId || ''] = porLote[c.equipoId || ''] || []).push(c); });
    var ids = Object.keys(porLote);
    if (!ids.length) return html + '<div class="note">Sin campañas cosechadas todavía: el plan parte del rinde real del lote.</div>';
    var prof = analisisRepresentativos(leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campoActual.id); }));
    var pr = SafiaMeta.precios();
    ids.forEach(function (id) {
      var casos = porLote[id];
      var soja = casos.filter(function (c) { return SafiaMeta.claveCultivo(c.cultivo) === 'soja'; });
      var c = (soja.length ? soja : casos).reduce(function (a, b) { return b.rindeKgHa > a.rindeKgHa ? b : a; });
      var cu = SafiaMeta.claveCultivo(c.cultivo);
      var metaRef = cu === 'soja' ? (c.rindeKgHa >= 6000 ? 7000 : 6000) : (cu === 'maiz' ? Math.max(12000, Math.round(c.rindeKgHa * 1.2 / 500) * 500) : Math.round(c.rindeKgHa * 1.2 / 100) * 100);
      var mg = metaGuardadaDelLote(id, cu), meta, origenMeta;
      if (mg && mg.meta > c.rindeKgHa) { meta = mg.meta; origenMeta = 'meta fijada por el productor para ' + esc(mg.campana); }
      else if (metaBarra && metaBarra > c.rindeKgHa) { meta = metaBarra; origenMeta = 'meta elegida para este informe'; }
      else { meta = metaRef; origenMeta = 'objetivo de referencia de los lotes de alto rinde (CESB); podés fijar otra meta en la campaña o en la barra del informe'; }
      var l = leer('equipos').find(function (e) { return String(e.id) === String(id); });
      // El plan mira hacia adelante: usa el análisis más reciente del lote (o del campo), no el que había al cosechar
      var ultimo = sueloActual(analisisDelLote(id));
      if (ultimo && (!c.suelo || String(ultimo.fecha) >= String(c.suelo.fecha || ''))) c = Object.assign({}, c, { suelo: ultimo });
      var opc = {}; if (window.SafiaFoliar) opc.foliar = SafiaFoliar.ultimoDelLote(id);
      var pl; try { pl = SafiaMeta.plan(c, meta, pr, cx.todos, prof, opc); } catch (e) { return; }
      var faltan = c.suelo ? SafiaAgro.interpretarSuelo(c.suelo, c.cultivo).filter(function (i) { return i.alcanzaAlto === false; }) : [];
      html += '<div class="card seccion"><div class="card-h"><h3>' + esc(l ? l.nombre : 'Campo') + ' · ' + esc(c.cultivo) + ' ' + esc(c.campana) + ' · hoy ' + fmt(c.rindeKgHa, 0) + ' kg/ha → meta ' + fmt(meta, 0) + '</h3><span class="muted">' + origenMeta + '</span></div>' +
        (c.suelo ? '<div class="note info" style="margin:6px 0 8px;"><b>Suelo hoy contra el de los lotes de 6–7 t/ha</b> (CESB, Embrapa, UNL): ' + (faltan.length ? 'faltan <b>' + faltan.map(function (i) { return esc(i.n.replace(/\s*\([^)]*\)$/, '')) + ' (' + fmt(i.valor, i.k === 'ph' || i.k === 'p' || i.k === 'satBases' || i.k === 's' || i.k.indexOf('rel') === 0 ? 1 : 2) + ' → ' + esc(i.objetivo) + ')'; }).join(', ') + '</b>. El resto ya está en el rango de alto rinde.' : 'todos los parámetros analizados ya están en el rango de alto rinde.') + '</div>' : '<div class="note warn">Sin análisis de suelo para este lote: el plan solo puede usar agua y manejo.</div>') +
        SafiaMeta.informeHTML(pl) + '</div>';
    });
    html += '<div class="sub" style="margin-top:6px;">Referencias del objetivo 6–7 t/ha: CESB Circular Técnica 2 (lotes de más de 4.200–6.000 kg/ha), Embrapa Cerrados (micronutrientes, Circ. Téc. 33), Universidad de Nebraska-Lincoln (Grassini: 9,9 kg/ha por mm de agua en soja, 19,3 en maíz; EC117), Fertilizar/INTA, CAPECO/IPTA 2012. Detalle en FUNDAMENTOS_ALTO_RINDE.md.</div>';
    return html;
  }

  /* ---------- armado ---------- */
  function secciones() { var s = {}; document.querySelectorAll('#secciones input').forEach(function (c) { s[c.dataset.s] = c.checked; }); return s; }
  function armar() {
    if (!campoActual) { $('hoja').innerHTML = '<div class="muted" style="padding:40px;text-align:center;">Elegí un campo arriba.</div>'; return; }
    var s = secciones(), cx = casosDelCampo();
    var lote = equipoSel ? lotesDelCampo()[0] : null;
    var hoy = new Date();
    var cs = campanaSeleccionada();
    var marca = config.logo ? '<img class="logo" src="' + config.logo + '" alt="' + esc(config.empresa || '') + '"><div><div class="t1" style="font-size:15px;">' + esc(config.empresa || 'SAFIA') + '</div><div class="t2">INFORME AGRONÓMICO · SAFIA</div></div>' : LOGO + '<div><div class="t1">SAFIA</div><div class="t2">SMART · AGRO · INTELLIGENCE' + (config.empresa ? ' · ' + esc(config.empresa.toUpperCase()) : '') + '</div></div>';
    var html = '<div class="cab"><div class="marca">' + marca + '</div>' +
      '<div class="der"><div style="font-size:11px;color:#8C9196;">INFORME AGRONÓMICO</div><div><b>' + esc(nombreCliente(campoActual.clienteId)) + '</b></div><div>' + esc(campoActual.nombre) + (lote ? ' · ' + esc(lote.nombre) : '') + '</div><div class="sub">' + esc([campoActual.localidad, campoActual.departamento, campoActual.pais].filter(Boolean).join(', ')) + '</div><div class="sub">' + hoy.toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }) + ($('autor').value ? ' · ' + esc($('autor').value) : '') + '</div></div></div>';
    html += '<h1 style="margin-top:14px;">' + (lote ? esc(lote.nombre) : esc(campoActual.nombre)) + '</h1><div class="sub">' + (lote ? 'Informe del lote' : 'Informe del campo, ' + lotesDelCampo().length + ' lote(s)') + (cs ? ' · campaña <b>' + esc(cs.nombre) + '</b> (' + esc(cs.cultivo) + ', siembra ' + fmtF(cs.siembra) + ')' : ' · todo el historial') + ' · datos cargados en SAFIA hasta el ' + fmtF(hoy.toISOString().slice(0, 10)) + '</div>';
    if (s.resumen) html += secResumen(cx);
    if (s.lotes) html += secLotes();
    if (s.campanas) html += secCampanas(cx);
    if (s.agua) html += secAgua(cx);
    if (s.suelo) html += secSuelo(cx);
    if (s.foliar) html += secFoliar();
    if (s.ndvi) html += secNDVI();
    if (s.rotacion) html += secRotacion();
    if (s.diagnostico) html += '<div class="salto"></div>' + secDiagnostico(cx);
    if (s.meta) html += '<div class="salto"></div>' + secMeta(cx);
    var autor = $('autor').value.trim() || config.agronomo || '';
    if (autor || config.firma) html += '<div class="firma"><div class="bloque">' + (config.firma ? '<img src="' + config.firma + '" alt="firma">' : '<div style="height:40px;"></div>') + '<b>' + esc(autor) + '</b>' + (config.matricula ? '<div class="sub">' + esc(config.matricula) + '</div>' : '') + '<div class="sub">' + esc([config.empresa, config.telefono, config.correo].filter(Boolean).join(' · ')) + '</div><div class="sub">' + fmtF(hoy.toISOString().slice(0, 10)) + '</div></div></div>';
    html += '<div class="pie"><span>Todos los rindes son peso comercial entregado (≈ 14 % de humedad), el que se vende. SAFIA compara e interpreta con datos reales del lote, la zona y el satélite. La prescripción final (dosis, productos, fechas) la define el ingeniero agrónomo responsable.</span><span>' + esc(config.empresa || 'Irrigar') + ' · SAFIA</span></div>';
    $('hoja').innerHTML = html;
    if (s.lotes) cargarImagenes();
    // balance hídrico por etapa de cada lote (se calcula en segundo plano)
    if (s.agua && window.SafiaAgua) lotesDelCampo().forEach(function (l) { var d = $('bal_' + l.id); if (!d) return; var c = SafiaAgua.campanasDelLote(l.id).find(function (x) { return x.id === d.dataset.camp; }); if (!c) return; SafiaAgua.calcular(campoActual, l, c).then(function (res) { var dd = $('bal_' + l.id); if (dd) dd.innerHTML = '<h3>' + esc(l.nombre) + ' · balance hídrico por etapa · ' + esc(c.cultivo) + ' ' + esc(c.nombre) + '</h3>' + SafiaAgua.htmlResultado(res); }).catch(function (e) { var dd = $('bal_' + l.id); if (dd) dd.innerHTML = ''; }); });
    // tiempo térmico para comparar campañas por estadio (se trae en segundo plano y se redibuja la sección NDVI)
    if (s.ndvi && window.SafiaNDVI && SafiaNDVI.prepararGdd) lotesDelCampo().forEach(function (l) { var serie = SafiaNDVI.serieDe(l.id) || []; if (!serie.length) return; SafiaNDVI.prepararGdd(l).then(function (cambio) { var d = $('ndviCamp_' + l.id); if (cambio && d) d.innerHTML = SafiaNDVI.htmlCampanas(l, serie); }).catch(function () {}); });
    if (window.SafiaIconos && SafiaIconos.procesar) try { SafiaIconos.procesar($('hoja')); } catch (e) {}
    toast('Informe armado. "Guardar como PDF" abre la impresión: elegí "Guardar como PDF" como destino.');
  }

  function llenarSelectores() {
    var campos = leer('campos'), clientes = leer('clientes'), sel = $('selCampo');
    var filas = campos.map(function (c) { var cl = clientes.find(function (x) { return String(x.id) === String(c.clienteId); }); return { id: c.id, txt: (cl ? cl.nombre + ' — ' : '') + c.nombre }; }).sort(function (a, b) { return a.txt.localeCompare(b.txt); });
    sel.innerHTML = filas.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.txt) + '</option>'; }).join('');
    var pedido = null; try { pedido = sessionStorage.getItem('banco_campo'); } catch (e) {}
    if (pedido && filas.some(function (f) { return String(f.id) === String(pedido); })) sel.value = String(pedido);
    campoActual = campos.find(function (c) { return String(c.id) === String(sel.value); }) || null;
    llenarLotes();
  }
  function llenarLotes() {
    var sel = $('selLote'); equipoSel = '';
    var lotes = campoActual ? leer('equipos').filter(function (e) { return String(e.campoId) === String(campoActual.id); }) : [];
    sel.innerHTML = '<option value="">Todos los lotes</option>' + lotes.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join('');
    llenarCampanas();
  }
  function campanasDelCampo() {
    if (!campoActual) return [];
    var ids = leer('equipos').filter(function (e) { return String(e.campoId) === String(campoActual.id) && (!equipoSel || String(e.id) === String(equipoSel)); }).map(function (e) { return String(e.id); });
    return leer('campanas').filter(function (c) { return ids.indexOf(String(c.equipoId)) >= 0; }).map(function (c) {
      var cu = (c.cultivos || [])[0] || {}, cos = (c.cosechas && c.cosechas[0] && c.cosechas[0].fecha) || (c.cosecha && c.cosecha.fecha) || null;
      return { id: c.id, nombre: c.nombre || '', cultivo: (c.cultivos || []).map(function (x) { return x.cultivo; }).filter(Boolean).join(' + ') || '—', siembra: cu.fechaSiembra ? String(cu.fechaSiembra).slice(0, 10) : '', fin: cos ? String(cos).slice(0, 10) : (cu.fechaCosecha ? String(cu.fechaCosecha).slice(0, 10) : null) };
    }).sort(function (a, b) { return b.siembra.localeCompare(a.siembra); });
  }
  function campanaSeleccionada() { return campanaSel ? campanasDelCampo().find(function (c) { return String(c.id) === String(campanaSel); }) || null : null; }
  function llenarCampanas() {
    var sel = $('selCampana'); if (!sel) return; campanaSel = '';
    sel.innerHTML = '<option value="">Todo el historial</option>' + campanasDelCampo().map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + ' · ' + esc(c.cultivo) + (c.siembra ? ' · siembra ' + fmtF(c.siembra) : '') + '</option>'; }).join('');
  }

  /* ---------- logo y firma (config local + copia en la nube: storage safia/config/informe.json) ---------- */
  function leerConfigLocal() { try { return JSON.parse(localStorage.getItem('informe_config') || '{}') || {}; } catch (e) { return {}; } }
  function cargarConfig() {
    config = leerConfigLocal();
    if (!window.safiaSupabase) return Promise.resolve();
    return window.safiaSupabase.storage.from('safia').download('config/informe.json').then(function (r) {
      if (r.error || !r.data) return;
      return r.data.text().then(function (t) { var nube = JSON.parse(t || '{}'); if (nube && (!config.actualizado || (nube.actualizado || '') > config.actualizado)) { config = nube; localStorage.setItem('informe_config', JSON.stringify(config)); } });
    }).catch(function () {});
  }
  function imagenADataURL(archivo, maxLado) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () { var k = Math.min(1, maxLado / Math.max(img.width, img.height)); var cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/png')); };
      img.onerror = rej; img.src = url;
    });
  }
  function pintarConfig() {
    $('cfgEmpresa').value = config.empresa || ''; $('cfgAgronomo').value = config.agronomo || ''; $('cfgMatricula').value = config.matricula || ''; $('cfgTelefono').value = config.telefono || ''; $('cfgCorreo').value = config.correo || '';
    var lp = $('cfgLogoPrev'), fp = $('cfgFirmaPrev'); lp.style.display = config.logo ? '' : 'none'; if (config.logo) lp.src = config.logo; fp.style.display = config.firma ? '' : 'none'; if (config.firma) fp.src = config.firma;
    if (!$('autor').value && config.agronomo) $('autor').value = config.agronomo;
  }
  function guardarConfig() {
    var nueva = { empresa: $('cfgEmpresa').value.trim(), agronomo: $('cfgAgronomo').value.trim(), matricula: $('cfgMatricula').value.trim(), telefono: $('cfgTelefono').value.trim(), correo: $('cfgCorreo').value.trim(), logo: config.logo || null, firma: config.firma || null, actualizado: new Date().toISOString() };
    var fl = $('cfgLogo').files && $('cfgLogo').files[0], ff = $('cfgFirma').files && $('cfgFirma').files[0];
    return Promise.all([fl ? imagenADataURL(fl, 600) : Promise.resolve(nueva.logo), ff ? imagenADataURL(ff, 500) : Promise.resolve(nueva.firma)]).then(function (im) {
      nueva.logo = im[0]; nueva.firma = im[1]; config = nueva;
      localStorage.setItem('informe_config', JSON.stringify(config));
      if (window.safiaSupabase) return window.safiaSupabase.storage.from('safia').upload('config/informe.json', new Blob([JSON.stringify(config)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' }).then(function (r) { if (r.error) console.warn('config informe: no se subió', r.error.message); });
    }).then(function () { pintarConfig(); toast('Logo y firma guardados'); armar(); });
  }

  /* ---------- enviar al cliente: copia del informe en la nube + WhatsApp / correo ---------- */
  var CSS_BASE = '.tbl{width:100%;border-collapse:collapse}.tbl th,.tbl td{padding:5px 7px;border-bottom:1px solid #EEF0F2;text-align:left;vertical-align:top}.tbl th{background:#F2F3F5;color:#41464B;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.tbl .r{text-align:right}.note{border-left:3px solid #E1E4E7;background:#F7F8F9;padding:8px 11px;border-radius:6px;font-size:12px;margin:8px 0}.note.ok{border-left-color:#22A93A;background:#E7F6EA}.note.warn{border-left-color:#B8731A;background:#FBF1DF}.note.info{border-left-color:#2E72C8;background:#E7F0FB}.muted{color:#8C9196}.sub{font-size:10.5px;color:#8C9196}.statbar,.stats{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.stat{border:1px solid #E1E4E7;border-radius:8px;padding:6px 10px;min-width:110px}.stat .sl{font-size:10px;color:#8C9196;text-transform:uppercase}.stat .sv{font-size:15px;font-weight:800;color:#0F3D14}.stat .ss{font-size:10px;color:#8C9196}.sv.green{color:#178029}.sv.red{color:#B3261E}.card{border:1px solid #E1E4E7;border-radius:8px;padding:10px 12px;margin:8px 0}.card-h{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px}.card-h h3{margin:0;font-size:14px}.badge{display:inline-block;padding:2px 8px;border-radius:100px;font-size:11px;font-weight:700}.tablewrap,.tablescroll{overflow:visible}.evo-mejor{color:#178029;font-weight:700}.evo-peor{color:#C0392B;font-weight:700}.num{font-weight:700}';
  function htmlAutonomo() {
    var estilos = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    var titulo = 'Informe agronómico · ' + (campoActual ? campoActual.nombre : '') + ' · ' + nombreCliente(campoActual.clienteId);
    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(titulo) + '</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>:root{--bd:#E1E4E7;--label:#6B6F73;--body:#2E3236;--green:#22A93A;--green-d:#178029;--red:#B3261E;--head:#0F3D14;--radius:10px}*{box-sizing:border-box}body{margin:0;background:#E9EBEE;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#2E3236}' + CSS_BASE + estilos + '.hoja{margin:12px auto}@media(max-width:700px){.hoja{padding:12px;margin:0}.hoja .kpis,.hoja .dos{grid-template-columns:1fr 1fr}}</style></head><body><div class="hoja">' + $('hoja').innerHTML + '</div></body></html>';
  }
  var linkActual = null;
  function publicar() {
    var est = $('envEstado'), lk = $('envLink');
    if (!window.safiaSupabase) { est.textContent = 'Sin conexión: para enviar hace falta internet y la sesión de SAFIA.'; return Promise.resolve(null); }
    est.textContent = 'Publicando el informe en la nube…';
    var ruta = 'informes/campo_' + campoActual.id + '/' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + (equipoSel ? '_lote' + equipoSel : '') + '.html';
    return window.safiaSupabase.storage.from('safia').upload(ruta, new Blob([htmlAutonomo()], { type: 'text/html' }), { upsert: true, contentType: 'text/html' }).then(function (r) {
      if (r.error) throw r.error;
      return window.safiaSupabase.storage.from('safia').createSignedUrl(ruta, 2592000);
    }).then(function (r) {
      if (r.error) throw r.error;
      linkActual = r.data.signedUrl; est.textContent = 'Informe publicado. El link es privado y vale 30 días.';
      lk.innerHTML = '<a href="' + esc(linkActual) + '" target="_blank">' + esc(linkActual.slice(0, 90)) + '…</a>';
      ['btnEnvCopiar', 'btnEnvCorreo', 'btnEnvWhatsapp'].forEach(function (id) { $(id).disabled = false; });
      return linkActual;
    }).catch(function (e) { console.error(e); est.textContent = 'No se pudo publicar: ' + (e.message || e); return null; });
  }
  function mensajeCliente() {
    var cl = leer('clientes').find(function (x) { return String(x.id) === String(campoActual.clienteId); }) || {};
    var nombre = (cl.nombre || '').split(' ')[0], cs = campanaSeleccionada();
    var texto = 'Hola ' + nombre + ', te comparto el informe agronómico de ' + campoActual.nombre + (equipoSel && lotesDelCampo()[0] ? ' (' + lotesDelCampo()[0].nombre + ')' : '') + (cs ? ', campaña ' + cs.nombre : '') + ', preparado con SAFIA:\n' + (linkActual || '') + '\n(el link vale 30 días)\n' + ($('autor').value.trim() || config.agronomo || '') + (config.empresa ? ' · ' + config.empresa : '');
    return { cliente: cl, texto: texto };
  }
  function abrirEnvio() {
    $('envInforme').style.display = ''; $('cfgInforme').style.display = 'none';
    ['btnEnvCopiar', 'btnEnvCorreo', 'btnEnvWhatsapp'].forEach(function (id) { $(id).disabled = true; }); $('envLink').innerHTML = ''; linkActual = null;
    publicar();
  }
  function telefonoWa(t) { var d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.indexOf('595') === 0) return d; if (d.indexOf('0') === 0) return '595' + d.slice(1); return d.length <= 10 ? '595' + d : d; }
  function iniciar() {
    llenarSelectores();
    $('selCampo').addEventListener('change', function () { campoActual = leer('campos').find(function (c) { return String(c.id) === String($('selCampo').value); }) || null; llenarLotes(); preparar(); });
    $('selLote').addEventListener('change', function () { equipoSel = $('selLote').value; llenarCampanas(); armar(); });
    $('selCampana').addEventListener('change', function () { campanaSel = $('selCampana').value; armar(); });
    $('btnActualizar').addEventListener('click', armar);
    $('btnPdf').addEventListener('click', function () { window.print(); });
    $('btnConfig').addEventListener('click', function () { pintarConfig(); $('cfgInforme').style.display = $('cfgInforme').style.display === 'none' ? '' : 'none'; $('envInforme').style.display = 'none'; });
    $('btnCfgCerrar').addEventListener('click', function () { $('cfgInforme').style.display = 'none'; });
    $('btnCfgGuardar').addEventListener('click', function () { guardarConfig().catch(function (e) { toast('No se pudo guardar: ' + e.message, true); }); });
    $('btnCfgQuitar').addEventListener('click', function () { config.logo = null; config.firma = null; $('cfgLogo').value = ''; $('cfgFirma').value = ''; pintarConfig(); });
    $('btnEnviar').addEventListener('click', abrirEnvio);
    $('btnEnvCerrar').addEventListener('click', function () { $('envInforme').style.display = 'none'; });
    $('btnEnvCopiar').addEventListener('click', function () { if (linkActual && navigator.clipboard) navigator.clipboard.writeText(linkActual).then(function () { toast('Link copiado'); }); });
    $('btnEnvWhatsapp').addEventListener('click', function () { var m = mensajeCliente(), tel = telefonoWa(m.cliente.telefono); window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(m.texto), '_blank'); if (!tel) toast('El cliente no tiene teléfono cargado: WhatsApp se abre sin destinatario, elegí el contacto a mano'); });
    $('btnEnvCorreo').addEventListener('click', function () { var m = mensajeCliente(); window.location.href = 'mailto:' + encodeURIComponent(m.cliente.email || '') + '?subject=' + encodeURIComponent('Informe agronómico · ' + campoActual.nombre) + '&body=' + encodeURIComponent(m.texto); if (!m.cliente.email) toast('El cliente no tiene correo cargado: completalo en el correo que se abre'); });
    document.querySelectorAll('#secciones input').forEach(function (c) { c.addEventListener('change', armar); });
    preparar();
  }
  // Trae lo que vive en la nube (referencia de zona, series NDVI) y arma
  function preparar() {
    armar();
    var tareas = [cargarReferenciaZona(), cargarConfig()];
    if (window.SafiaNDVI && window.safiaSupabase) tareas.push(SafiaNDVI.cargarDeTabla());
    Promise.all(tareas).then(armar, armar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 400); }); else setTimeout(iniciar, 400);
})();
