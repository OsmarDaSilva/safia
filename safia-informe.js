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
  function tabla(enc, filas) { return '<table class="tbl"><thead><tr>' + enc.map(function (e) { return '<th' + (e.r ? ' class="r"' : '') + '>' + e.t + '</th>'; }).join('') + '</tr></thead><tbody>' + (filas.length ? filas.join('') : '<tr><td colspan="' + enc.length + '" class="muted">Sin datos</td></tr>') + '</tbody></table>'; }
  function td(v, r) { return '<td' + (r ? ' class="r"' : '') + '>' + v + '</td>'; }
  function toast(m, err) { var e = $('estado'); e.textContent = m; e.style.color = err ? '#C0392B' : '#8C9196'; }

  var campoActual = null, equipoSel = '', refZona = null, refAmbito = '';
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
    return { todos: todos, mios: todos.filter(function (c) { return String(c.campoId) === String(campoActual.id) && (!equipoSel || String(c.equipoId) === String(equipoSel)); }).sort(function (a, b) { return String(a.siembra).localeCompare(String(b.siembra)); }) };
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
      '<div class="kpi"><div class="sl">Última campaña</div><div class="sv">' + (ult ? fmt(ult.rindeKgHa, 0) : '—') + '</div><div class="ss">' + (ult ? esc(ult.cultivo) + ' ' + esc(ult.campana) + ' · kg/ha' : 'sin campañas cerradas') + '</div></div>' +
      '<div class="kpi"><div class="sl">Frente a la zona</div><div class="sv">' + (ult && (mejorZona || refZ) ? flecha(ult.rindeKgHa - (mejorZona ? mejorZona.rindeKgHa : refZ), 0) : '—') + '</div><div class="ss">' + (mejorZona ? 'vs mejor de ' + esc(campoActual.localidad || campoActual.departamento) : (refZ ? 'vs promedio ' + esc(refAmbito) : 'sin referencia')) + '</div></div>' +
      '<div class="kpi"><div class="sl">Vigor satelital</div><div class="sv">' + (ndviUlt ? fmt(ndviUlt.ndvi, 2) : '—') + '</div><div class="ss">' + (ndviUlt ? 'NDVI al ' + fmtF(ndviUlt.fecha) : 'sin serie') + '</div></div></div>';
    var puntos = [];
    if (ult) puntos.push('La última campaña cerrada fue <b>' + esc(ult.cultivo) + ' ' + esc(ult.campana) + '</b> con <b>' + fmt(ult.rindeKgHa, 0) + ' kg/ha</b>' + (ult.aguaTotalMM != null ? ', con ' + fmt(ult.aguaTotalMM, 0) + ' mm de agua total (' + fmt(ult.lluviaMM || 0, 0) + ' de lluvia y ' + fmt(ult.riegoMM || 0, 0) + ' de riego)' : '') + '.');
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
    var html = '<h2>Lotes</h2>' + tabla([{ t: 'Lote' }, { t: 'Tipo / equipo' }, { t: 'Ha declaradas', r: 1 }, { t: 'Ha según polígono', r: 1 }, { t: 'Campañas', r: 1 }, { t: 'Ubicación' }], filas);
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
      return '<tr>' + td('<b>' + esc(c.campana) + '</b><div class="sub">' + esc(c.equipo) + (c.riego ? '' : ' · secano') + '</div>') + td(esc(c.cultivo) + '<div class="sub">' + esc(c.variedad || '—') + '</div>') + td(fmtF(c.siembra) + '<div class="sub">' + (c.dias != null ? c.dias + ' días' : '') + '</div>') + td(fmtF(c.cosecha)) +
        td(c.aguaTotalMM != null ? fmt(c.aguaTotalMM, 0) + '<div class="sub">' + fmt(c.lluviaMM || 0, 0) + ' lluvia · ' + fmt(c.riegoMM || 0, 0) + ' riego</div>' : '—', 1) +
        td('<span class="num">' + fmt(c.rindeKgHa, 0) + '</span>' + (c.objetivoKgHa ? '<div class="sub">objetivo ' + fmt(c.objetivoKgHa, 0) + '</div>' : ''), 1) +
        td(refZ ? flecha(c.rindeKgHa - refZ, 0) + '<div class="sub">prom. ' + esc(refAmbito) + ' ' + fmt(refZ, 0) + '</div>' : (mejor ? flecha(c.rindeKgHa - mejor.rindeKgHa, 0) + '<div class="sub">mejor local ' + fmt(mejor.rindeKgHa, 0) + '</div>' : '<span class="muted">—</span>'), 1) + '</tr>';
    });
    return '<h2>Campañas y rinde</h2>' + tabla([{ t: 'Campaña' }, { t: 'Cultivo' }, { t: 'Siembra' }, { t: 'Cosecha' }, { t: 'Agua mm', r: 1 }, { t: 'Rinde kg/ha', r: 1 }, { t: 'vs zona', r: 1 }], filas) +
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
    return '<h2>Agua: lluvia, riego y rinde</h2>' + sonda + tabla([{ t: 'Cultivo' }, { t: 'Campaña' }, { t: 'Lluvia', r: 1 }, { t: 'Riego', r: 1 }, { t: 'Total mm', r: 1 }, { t: 'ET0 mm', r: 1 }, { t: 'Rinde', r: 1 }, { t: 'kg por mm', r: 1 }], filas) + (reglas.length ? '<div class="note ok"><b>Regla práctica para el riego:</b><ul>' + reglas.join('') + '</ul></div>' : '');
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
        html += '<div class="interp">' + SafiaAgro.tablaInterpretacion(interp) + '</div>';
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
      html += '<div class="seccion"><h3>' + esc(l.nombre) + ' · ' + esc(a.cultivo || '') + ' · muestreo del ' + fmtF(a.fecha) + (est ? ' · ' + esc(est.n) : '') + (a.laboratorio ? ' · ' + esc(a.laboratorio) : '') + '</h3><div class="interp">' + SafiaFoliar.htmlLectura(a, suelo) + '</div></div>';
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
        html += tabla([{ t: 'Temporada' }, { t: 'Cultivo / cobertura' }, { t: 'Variedad' }, { t: 'Objetivo kg/ha', r: 1 }, { t: 'Nota' }], plan.temporadas.map(function (t) { return '<tr>' + td('<b>' + esc(SafiaRotacion.etiqueta(t)) + '</b>') + td(esc(t.cultivo || '—')) + td(esc(t.variedad || '—')) + td(t.objetivoKgHa ? fmt(t.objetivoKgHa, 0) : '—', 1) + td(esc(t.nota || '')) + '</tr>'; }));
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
      var cand = cx.todos.filter(function (c) { return String(c.campoId) !== String(campoActual.id) && norm(c.cultivo) === norm(cu); });
      var local = cand.filter(function (c) { return campoActual.localidad && norm(c.localidad) === norm(campoActual.localidad); });
      var pool = local.length ? local : cand.filter(function (c) { return campoActual.departamento && norm(c.departamento) === norm(campoActual.departamento); });
      var ref = pool.length ? pool.reduce(function (a, b) { return b.rindeKgHa > a.rindeKgHa ? b : a; }) : null;
      html += '<div class="card seccion"><div class="card-h"><h3>' + esc(cu) + ' · ' + esc(mio.campana) + ' · ' + fmt(mio.rindeKgHa, 0) + ' kg/ha' + (ref ? ' · comparado con ' + esc(ref.cliente) + ' (' + fmt(ref.rindeKgHa, 0) + ' kg/ha)' : ' · sin otro lote de la zona para comparar') + '</h3></div>' + SafiaAgro.informeHTML(mio, ref, cu) + '</div>';
    });
    return html;
  }

  function secMeta(cx) {
    if (!window.SafiaMeta || !window.SafiaAgro) return '';
    var html = '<h2>Camino a 6.000 kg/ha: qué le falta al suelo, qué corregir y cuánto cuesta</h2>';
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
      var meta = cu === 'soja' ? (c.rindeKgHa >= 6000 ? 7000 : 6000) : (cu === 'maiz' ? Math.max(12000, Math.round(c.rindeKgHa * 1.2 / 500) * 500) : Math.round(c.rindeKgHa * 1.2 / 100) * 100);
      var l = leer('equipos').find(function (e) { return String(e.id) === String(id); });
      // El plan mira hacia adelante: usa el análisis más reciente del lote (o del campo), no el que había al cosechar
      var ultimo = sueloActual(analisisDelLote(id));
      if (ultimo && (!c.suelo || String(ultimo.fecha) >= String(c.suelo.fecha || ''))) c = Object.assign({}, c, { suelo: ultimo });
      var opc = {}; if (window.SafiaFoliar) opc.foliar = SafiaFoliar.ultimoDelLote(id);
      var pl; try { pl = SafiaMeta.plan(c, meta, pr, cx.todos, prof, opc); } catch (e) { return; }
      var faltan = c.suelo ? SafiaAgro.interpretarSuelo(c.suelo, c.cultivo).filter(function (i) { return i.alcanzaAlto === false; }) : [];
      html += '<div class="card seccion"><div class="card-h"><h3>' + esc(l ? l.nombre : 'Campo') + ' · ' + esc(c.cultivo) + ' ' + esc(c.campana) + ' · hoy ' + fmt(c.rindeKgHa, 0) + ' kg/ha → meta ' + fmt(meta, 0) + '</h3></div>' +
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
    var html = '<div class="cab"><div class="marca">' + LOGO + '<div><div class="t1">SAFIA</div><div class="t2">SMART · AGRO · INTELLIGENCE</div></div></div>' +
      '<div class="der"><div style="font-size:11px;color:#8C9196;">INFORME AGRONÓMICO</div><div><b>' + esc(nombreCliente(campoActual.clienteId)) + '</b></div><div>' + esc(campoActual.nombre) + (lote ? ' · ' + esc(lote.nombre) : '') + '</div><div class="sub">' + esc([campoActual.localidad, campoActual.departamento, campoActual.pais].filter(Boolean).join(', ')) + '</div><div class="sub">' + hoy.toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }) + ($('autor').value ? ' · ' + esc($('autor').value) : '') + '</div></div></div>';
    html += '<h1 style="margin-top:14px;">' + (lote ? esc(lote.nombre) : esc(campoActual.nombre)) + '</h1><div class="sub">' + (lote ? 'Informe del lote' : 'Informe del campo, ' + lotesDelCampo().length + ' lote(s)') + ' · datos cargados en SAFIA hasta el ' + fmtF(hoy.toISOString().slice(0, 10)) + '</div>';
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
    html += '<div class="pie"><span>SAFIA compara e interpreta con datos reales del lote, la zona y el satélite. La prescripción final (dosis, productos, fechas) la define el ingeniero agrónomo responsable.</span><span>Irrigar · SAFIA</span></div>';
    $('hoja').innerHTML = html;
    if (s.lotes) cargarImagenes();
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
  }
  function iniciar() {
    llenarSelectores();
    $('selCampo').addEventListener('change', function () { campoActual = leer('campos').find(function (c) { return String(c.id) === String($('selCampo').value); }) || null; llenarLotes(); preparar(); });
    $('selLote').addEventListener('change', function () { equipoSel = $('selLote').value; armar(); });
    $('btnActualizar').addEventListener('click', armar);
    $('btnPdf').addEventListener('click', function () { window.print(); });
    document.querySelectorAll('#secciones input').forEach(function (c) { c.addEventListener('change', armar); });
    preparar();
  }
  // Trae lo que vive en la nube (referencia de zona, series NDVI) y arma
  function preparar() {
    armar();
    var tareas = [cargarReferenciaZona()];
    if (window.SafiaNDVI && window.safiaSupabase) tareas.push(SafiaNDVI.cargarDeTabla());
    Promise.all(tareas).then(armar, armar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 400); }); else setTimeout(iniciar, 400);
})();
