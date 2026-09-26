/* ============================================================
   SAFIA · safia-fieldnet.js
   Importar el riego de Lindsay FieldNET (informe de riego exportado
   a CSV desde FieldNET → Informes) mientras no esté la conexión
   automática por API.

   El informe de FieldNET trae, por pivot, el TOTAL de un período
   (horas de funcionamiento, área, volumen, caudal y lámina en mm).
   Por eso:
     - Si el período cubre el ciclo de UNA campaña ya cosechada, esa
       lámina pasa a ser el riego del ciclo de la campaña (el que usan
       el Banco, el informe, los rankings y la comparación con la zona).
     - Si el período cae en una campaña en curso, NO se inventan riegos
       diarios (el balance de agua necesita la fecha de cada riego):
       se muestra FieldNET contra lo cargado en SAFIA para ver si falta
       cargar algo.
     - Si el período abarca varias campañas, se muestra la comparación
       y se pide exportar un informe por campaña.
   Cada pivot de FieldNET queda enlazado a su lote (equipo.fieldnetNombre)
   para que la próxima vez se reconozca solo.
   Uso: SafiaFieldnet.abrir()   (botón en Campañas)
   ============================================================ */
(function () {
  'use strict';

  function leer(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function fmt(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sumarDias(f, n) { var d = new Date(String(f).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dias(a, b) { return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000); }

  /* ---------- leer el CSV ---------- */
  function partirLinea(l, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < l.length; i++) {
      var ch = l[i];
      if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }
  // Columnas por palabras clave (español o inglés). Si viene en pulgadas o acres, se convierte.
  var COLS = [
    ['equipo', /nombre del equipo|equipment name|^equipo$|^equipment$|^name$/],
    ['grupo', /grupo|group/],
    ['metodo', /metodo|method/],
    ['horas', /horas|hours/],
    ['area', /area/],
    ['volumen', /volumen|volume/],
    ['caudal', /caudal|flow/],
    ['lamina', /profundidad|depth|lamina/]
  ];
  function parsear(texto, nombreArchivo) {
    texto = String(texto || '').replace(/^﻿/, '');
    var lineas = texto.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lineas.length < 2) return { error: 'El archivo no tiene filas de datos.' };
    var sep = (lineas[0].split(';').length > lineas[0].split(',').length) ? ';' : ',';
    var cab = partirLinea(lineas[0], sep), idx = {}, unidades = {};
    cab.forEach(function (h, i) {
      var n = norm(h);
      for (var k = 0; k < COLS.length; k++) { if (idx[COLS[k][0]] == null && COLS[k][1].test(n)) { idx[COLS[k][0]] = i; unidades[COLS[k][0]] = h; break; } }
    });
    if (idx.equipo == null || idx.lamina == null) return { error: 'No reconozco este archivo: le faltan las columnas "Nombre del equipo" y "Profundidad (mm)". Exportalo desde FieldNET → Informes → informe de riego.' };
    var numero = function (s) { if (s == null || s === '') return null; var t = String(s).replace(/\s/g, ''); t = sep === ';' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''); var v = parseFloat(t); return isNaN(v) ? null : v; };
    var enPulgadas = /\(in\)|inch|pulg/i.test(unidades.lamina || ''), enAcres = /\(ac\)|acre/i.test(unidades.area || '');
    var filas = lineas.slice(1).map(function (l) {
      var c = partirLinea(l, sep), mm = numero(c[idx.lamina]), area = idx.area != null ? numero(c[idx.area]) : null;
      if (enPulgadas && mm != null) mm = mm * 25.4;
      if (enAcres && area != null) area = area * 0.404686;
      return { equipo: c[idx.equipo] || '', grupo: idx.grupo != null ? c[idx.grupo] : '', metodo: idx.metodo != null ? c[idx.metodo] : '', horas: idx.horas != null ? numero(c[idx.horas]) : null,
               areaHa: area, volumenM3: idx.volumen != null ? numero(c[idx.volumen]) : null, caudalLs: idx.caudal != null ? numero(c[idx.caudal]) : null, mm: mm };
    }).filter(function (f) { return f.equipo && f.mm != null; });
    var m = String(nombreArchivo || '').match(/from-(\d{4}-\d{2}-\d{2})-to-(\d{4}-\d{2}-\d{2})/i) || String(nombreArchivo || '').match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
    return { filas: filas, desde: m ? m[1] : null, hasta: m ? m[2] : null };
  }

  /* ---------- qué lote es cada pivot ---------- */
  function lotesConNombre() {
    var campos = leer('campos'), clientes = leer('clientes');
    return leer('equipos').filter(function (e) { return !e.zona; }).map(function (e) {
      var campo = campos.find(function (c) { return String(c.id) === String(e.campoId); }), cli = campo && clientes.find(function (c) { return String(c.id) === String(campo.clienteId); });
      return { eq: e, etiqueta: e.nombre + (campo ? ' · ' + campo.nombre : '') + (cli ? ' · ' + cli.nombre : '') };
    });
  }
  function adivinarLote(fila, lotes) {
    var n = norm(fila.equipo);
    var por = lotes.find(function (l) { return l.eq.fieldnetNombre && norm(l.eq.fieldnetNombre) === n; });
    if (por) return { lote: por, como: 'enlazado antes' };
    por = lotes.find(function (l) { return norm(l.eq.nombre) === n; });
    if (por) return { lote: por, como: 'mismo nombre' };
    // misma superficie (±3 %) y que el nombre comparta alguna palabra con el campo o el cliente
    if (fila.areaHa) {
      var cand = lotes.filter(function (l) { var s = parseFloat(l.eq.superficie); return s > 0 && Math.abs(s - fila.areaHa) / s <= 0.03; });
      var palabras = n.split(' ').filter(function (p) { return p.length > 3; });
      var conPalabra = cand.filter(function (l) { var t = norm(l.etiqueta); return palabras.some(function (p) { return t.indexOf(p) >= 0; }); });
      if (conPalabra.length === 1) return { lote: conPalabra[0], como: 'misma superficie (' + fmt(fila.areaHa, 0) + ' ha) y nombre' };
      if (cand.length === 1) return { lote: cand[0], como: 'misma superficie (' + fmt(fila.areaHa, 0) + ' ha)' };
    }
    return null;
  }

  /* ---------- cruzar el período con las campañas del lote ---------- */
  function ciclosDelLote(eqId) {
    var out = [];
    leer('campanas').forEach(function (c) {
      if (String(c.equipoId) !== String(eqId)) return;
      (c.cultivos || []).forEach(function (cu, i) {
        if (!cu || !cu.fechaSiembra) return;
        var cos = (c.cosechas && c.cosechas[i]) || (i === 0 ? c.cosecha : null) || null;
        var cosechada = parseFloat(cu.rendimientoReal) > 0;
        var fin = String((cos && cos.fecha) || cu.fechaCosecha || '').slice(0, 10) || null;
        out.push({ c: c, i: i, cu: cu, cos: cos, cosechada: cosechada, siembra: String(cu.fechaSiembra).slice(0, 10), fin: cosechada ? fin : (fin && fin < hoy() ? fin : hoy()), finPrevisto: fin });
      });
    });
    return out.sort(function (a, b) { return a.siembra.localeCompare(b.siembra); });
  }
  function riegoEventos(eqId, desde, hasta) {
    return leer('eventos').filter(function (e) { var f = String(e.fecha || '').slice(0, 10); return String(e.equipoId) === String(eqId) && e.tipo === 'riego' && f >= desde && f <= hasta; })
      .reduce(function (s, e) { return s + (parseFloat(e.cantidad) || 0); }, 0);
  }
  function analizar(fila, eqId, desde, hasta) {
    var ciclos = ciclosDelLote(eqId).filter(function (k) { return k.siembra <= hasta && (k.fin || hoy()) >= desde; });
    var partes = ciclos.map(function (k) {
      var dentro = k.siembra >= sumarDias(desde, -3) && (k.fin || hoy()) <= sumarDias(hasta, 3);
      var mmSafia = k.cos && k.cos.riegoMM != null && k.cosechada ? parseFloat(k.cos.riegoMM) : riegoEventos(eqId, k.siembra > desde ? k.siembra : desde, (k.fin || hoy()) < hasta ? (k.fin || hoy()) : hasta);
      return { k: k, dentro: dentro, mmSafia: mmSafia, fuenteSafia: k.cos && k.cos.riegoMM != null && k.cosechada ? 'total de la cosecha' : 'eventos cargados' };
    });
    var totalSafia = partes.reduce(function (s, p) { return s + (p.mmSafia || 0); }, 0);
    var caso = 'sin-campana';
    if (ciclos.length === 1) {
      var k = ciclos[0];
      var cubre = desde <= sumarDias(k.siembra, 5) && hasta >= sumarDias(k.fin, -5);
      if (k.cosechada && cubre) caso = 'ciclo-cerrado';
      else if (!k.cosechada) caso = 'en-curso';
      else caso = 'parcial';
    } else if (ciclos.length > 1) caso = 'varias';
    return { partes: partes, totalSafia: totalSafia, caso: caso, diferencia: fila.mm - totalSafia };
  }

  /* ---------- aplicar: el riego del ciclo de una campaña cosechada ---------- */
  function aplicar(fila, eqId, desde, hasta, nombreArchivo) {
    var campanas = leer('campanas'), ciclos = ciclosDelLote(eqId).filter(function (k) { return k.siembra <= hasta && (k.fin || hoy()) >= desde; });
    if (ciclos.length !== 1) return { error: 'El período no corresponde a una sola campaña.' };
    var k = ciclos[0], idx = campanas.findIndex(function (c) { return String(c.id) === String(k.c.id); });
    if (idx < 0) return { error: 'No encontré la campaña.' };
    var camp = campanas[idx], mm = Math.round(fila.mm * 10) / 10;
    var fuente = { origen: 'fieldnet', desde: desde, hasta: hasta, mm: mm, horas: fila.horas, volumenM3: fila.volumenM3, caudalLs: fila.caudalLs, areaHa: fila.areaHa, metodo: fila.metodo || null, equipoFieldnet: fila.equipo, archivo: nombreArchivo || null, importado: new Date().toISOString() };
    camp.cosechas = camp.cosechas || {};
    var cos = camp.cosechas[k.i] || (k.i === 0 ? camp.cosecha : null) || {};
    var anterior = cos.riegoMM;
    cos = Object.assign({}, cos, { riegoMM: mm, riegoFuente: fuente });
    camp.cosechas[k.i] = cos;
    if (k.i === 0) camp.cosecha = Object.assign({}, camp.cosecha || {}, { riegoMM: mm, riegoFuente: fuente });
    camp.fechaModificacion = new Date().toISOString();
    localStorage.setItem('campanas', JSON.stringify(campanas));
    return { ok: true, campana: camp.nombre, cultivo: k.cu.cultivo, anterior: anterior, mm: mm };
  }
  function recordarEnlace(eqId, nombreFieldnet) {
    var equipos = leer('equipos'), e = equipos.find(function (x) { return String(x.id) === String(eqId); });
    if (!e || e.fieldnetNombre === nombreFieldnet) return;
    e.fieldnetNombre = nombreFieldnet; e.fechaModificacion = new Date().toISOString();
    localStorage.setItem('equipos', JSON.stringify(equipos));
  }

  /* ---------- ventana ---------- */
  var estado = null;
  function $(id) { return document.getElementById(id); }
  function cerrar() { var d = $('fnModal'); if (d) d.remove(); estado = null; }
  function abrir() {
    cerrar();
    var d = document.createElement('div'); d.id = 'fnModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(20,25,30,.55);display:flex;align-items:flex-start;justify-content:center;padding:30px 16px;overflow:auto;font-family:inherit;';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3);color:#2E3236;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;"><div><div style="font-size:18px;font-weight:800;">Importar riego de FieldNET</div>' +
      '<div style="font-size:12.5px;color:#6B7075;margin-top:4px;line-height:1.5;">En FieldNET: el pivot → <b>Informes</b> → informe de riego → elegí las fechas → exportar CSV. Para cargar el riego de una campaña, exportá <b>de la fecha de siembra a la de cosecha</b>.</div></div>' +
      '<button type="button" id="fnCerrar" style="border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#8C9196;">×</button></div>' +
      '<div style="margin-top:14px;"><input type="file" id="fnArchivo" accept=".csv,text/csv" style="font-size:13px;"></div>' +
      '<div id="fnCuerpo" style="margin-top:14px;"></div></div>';
    document.body.appendChild(d);
    $('fnCerrar').addEventListener('click', cerrar);
    d.addEventListener('click', function (ev) { if (ev.target === d) cerrar(); });
    $('fnArchivo').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { cargarTexto(String(r.result || ''), f.name); };
      r.readAsText(f, 'utf-8');
    });
  }
  function cargarTexto(texto, nombre) {
    var p = parsear(texto, nombre);
    if (p.error) { $('fnCuerpo').innerHTML = aviso('warn', esc(p.error)); return; }
    if (!p.filas.length) { $('fnCuerpo').innerHTML = aviso('warn', 'El archivo no trae ningún pivot con lámina aplicada.'); return; }
    var lotes = lotesConNombre();
    estado = { nombre: nombre, desde: p.desde || '', hasta: p.hasta || '', filas: p.filas.map(function (f) { var g = adivinarLote(f, lotes); return { f: f, eqId: g ? String(g.lote.eq.id) : '', como: g ? g.como : '' }; }), lotes: lotes };
    pintar();
  }
  function aviso(tipo, html) {
    var c = { ok: ['#E7F6EA', '#178029'], warn: ['#FDF3E4', '#8a5713'], info: ['#EEF4FB', '#1F5A96'], err: ['#FBECEA', '#B3261E'] }[tipo] || ['#F4F5F6', '#41464B'];
    return '<div style="background:' + c[0] + ';color:' + c[1] + ';border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin-top:8px;">' + html + '</div>';
  }
  function pintar() {
    var s = estado; if (!s) return;
    var h = '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;font-size:12px;">' +
      '<label>Desde<br><input type="date" id="fnDesde" value="' + esc(s.desde) + '" style="padding:6px 8px;border:1px solid #E1E4E7;border-radius:8px;"></label>' +
      '<label>Hasta<br><input type="date" id="fnHasta" value="' + esc(s.hasta) + '" style="padding:6px 8px;border:1px solid #E1E4E7;border-radius:8px;"></label>' +
      '<div style="color:#8C9196;padding-bottom:6px;">' + (s.desde && s.hasta ? 'Fechas tomadas del nombre del archivo.' : 'Poné las fechas del informe.') + '</div></div>';
    if (!s.desde || !s.hasta) { $('fnCuerpo').innerHTML = h + aviso('warn', 'Faltan las fechas del informe.'); enganchar(); return; }
    s.filas.forEach(function (x, n) {
      var f = x.f;
      h += '<div style="border:1px solid #E1E4E7;border-radius:12px;padding:12px 14px;margin-top:12px;">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><div><div style="font-weight:800;font-size:14px;">' + esc(f.equipo) + '</div>' +
        '<div style="font-size:12px;color:#6B7075;">' + fmtF(s.desde) + ' al ' + fmtF(s.hasta) + ' · ' + (f.horas != null ? fmt(f.horas, 1) + ' h de marcha · ' : '') + (f.areaHa != null ? fmt(f.areaHa, 1) + ' ha · ' : '') + (f.volumenM3 != null ? fmt(f.volumenM3, 0) + ' m³ · ' : '') + (f.caudalLs != null ? fmt(f.caudalLs, 1) + ' L/s' : '') + '</div>' +
        (/hour/i.test(f.metodo || '') ? '<div style="font-size:11.5px;color:#8C9196;">Calculado por FieldNET con horas de marcha × caudal (no con caudalímetro).</div>' : '') + '</div>' +
        '<div style="text-align:right;"><div style="font-size:22px;font-weight:800;color:#1F5A96;">' + fmt(f.mm, 1) + ' mm</div><div style="font-size:11px;color:#8C9196;">lámina de FieldNET</div></div></div>' +
        '<div style="margin-top:8px;font-size:12.5px;">Lote en SAFIA: <select data-n="' + n + '" class="fnLote" style="padding:6px 8px;border:1px solid #E1E4E7;border-radius:8px;max-width:100%;"><option value="">— elegir —</option>' +
        s.lotes.map(function (l) { return '<option value="' + esc(l.eq.id) + '"' + (String(l.eq.id) === x.eqId ? ' selected' : '') + '>' + esc(l.etiqueta) + '</option>'; }).join('') + '</select>' +
        (x.como ? ' <span style="color:#8C9196;font-size:11.5px;">(' + esc(x.como) + ')</span>' : '') + '</div>';
      if (x.eqId) h += resultado(x, n);
      h += '</div>';
    });
    $('fnCuerpo').innerHTML = h;
    enganchar();
  }
  // Horas de funcionamiento del informe → horímetro del pivot (para el mantenimiento). No se suma dos veces el mismo período.
  function horasYaSumadas(eqId, desde, hasta) {
    return leer('eventos').filter(function (e) { return String(e.equipoId) === String(eqId) && e.tipo === 'horimetro' && e.origen === 'fieldnet' && e.desde && e.hasta; })
      .find(function (e) { return !(String(e.hasta) < desde || String(e.desde) > hasta); }) || null;
  }
  function bloqueHoras(x, n) {
    var s = estado; if (x.f.horas == null || !window.SafiaMant || !x.eqId) return '';
    var ya = horasYaSumadas(x.eqId, s.desde, s.hasta);
    if (ya) return aviso('info', 'Las horas de un período que se cruza con este (' + fmtF(ya.desde) + ' al ' + fmtF(ya.hasta) + ') ya se sumaron al horímetro del pivot.');
    var eq = leer('equipos').find(function (e) { return String(e.id) === String(x.eqId); }); var actual = eq ? SafiaMant.estado(eq).horas : 0;
    return '<div style="margin-top:8px;font-size:12.5px;">Mantenimiento: el pivot marcó <b>' + fmt(x.f.horas, 1) + ' h de funcionamiento</b> en este período. Horímetro en SAFIA: ' + fmt(actual, 0) + ' h. ' +
      '<button type="button" class="fnHoras" data-n="' + n + '" style="margin-left:4px;padding:6px 10px;border:1px solid #E1E4E7;border-radius:8px;background:#fff;font-weight:700;font-size:12px;cursor:pointer;">Sumar al horímetro (' + fmt(actual + x.f.horas, 0) + ' h)</button></div>';
  }
  function resultado(x, n) {
    var s = estado, a = analizar(x.f, x.eqId, s.desde, s.hasta), h = '';
    if (!a.partes.length) return aviso('warn', 'Este lote no tiene campañas entre esas fechas en SAFIA.');
    h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px;"><tr style="color:#8C9196;text-align:left;"><th style="padding:4px 6px;font-weight:600;">Campaña en SAFIA</th><th style="padding:4px 6px;font-weight:600;">Ciclo</th><th style="padding:4px 6px;font-weight:600;text-align:right;">Riego en SAFIA</th></tr>' +
      a.partes.map(function (p) { return '<tr style="border-top:1px solid #F0F2F4;"><td style="padding:5px 6px;"><b>' + esc(p.k.cu.cultivo) + '</b> · ' + esc(p.k.c.nombre || '') + (p.k.cosechada ? '' : ' <span style="color:#178029;">(en curso)</span>') + '</td><td style="padding:5px 6px;white-space:nowrap;">' + fmtF(p.k.siembra) + ' al ' + fmtF(p.k.cosechada ? p.k.fin : p.k.finPrevisto) + '</td><td style="padding:5px 6px;text-align:right;white-space:nowrap;">' + fmt(p.mmSafia, 1) + ' mm <span style="color:#8C9196;font-size:11px;">' + esc(p.fuenteSafia) + '</span></td></tr>'; }).join('') +
      '<tr style="border-top:1px solid #E1E4E7;font-weight:700;"><td style="padding:5px 6px;" colspan="2">Total en SAFIA · FieldNET</td><td style="padding:5px 6px;text-align:right;white-space:nowrap;">' + fmt(a.totalSafia, 1) + ' · ' + fmt(x.f.mm, 1) + ' mm</td></tr></table>';
    var dif = a.diferencia, pct = a.totalSafia > 0 ? Math.abs(dif) / a.totalSafia * 100 : null;
    var dicho = Math.abs(dif) < 0.5 ? 'coinciden' : (dif > 0 ? 'FieldNET registra ' + fmt(dif, 1) + ' mm más' : 'SAFIA tiene ' + fmt(-dif, 1) + ' mm más') + (pct != null ? ' (' + fmt(pct, 0) + ' %)' : '');
    h += bloqueHoras(x, n);
    if (a.caso === 'ciclo-cerrado') {
      var p = a.partes[0];
      h += aviso('ok', 'El informe cubre el ciclo completo de <b>' + esc(p.k.cu.cultivo) + ' · ' + esc(p.k.c.nombre || '') + '</b>: ' + dicho + '. Si usás el dato de FieldNET, queda como el riego del ciclo de esa campaña (lo usan el Banco, el informe y los rankings).') +
        '<div style="margin-top:8px;"><button type="button" class="fnAplicar" data-n="' + n + '" style="padding:9px 14px;border:0;border-radius:9px;background:#22A93A;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">Usar ' + fmt(x.f.mm, 1) + ' mm como riego del ciclo</button></div>';
    } else if (a.caso === 'en-curso') {
      h += aviso('info', 'La campaña está en curso: ' + dicho + '. ' + (dif > 2 ? 'Puede que falten riegos por cargar en SAFIA. ' : '') + 'SAFIA no convierte este total en riegos diarios porque el balance de agua necesita la fecha de cada riego: cargalos por día en el Operador (o por voz) hasta que esté la conexión automática con FieldNET.');
    } else if (a.caso === 'varias') {
      h += aviso('warn', 'El período abarca ' + a.partes.length + ' campañas: ' + dicho + '. Un total no se puede repartir entre campañas. Para cargar el riego de cada una, exportá desde FieldNET un informe por campaña, de la siembra a la cosecha.');
    } else if (a.caso === 'parcial') {
      h += aviso('warn', 'El informe cubre solo una parte del ciclo de esa campaña (' + fmtF(a.partes[0].k.siembra) + ' al ' + fmtF(a.partes[0].k.fin) + '): ' + dicho + '. Exportalo de la siembra a la cosecha para usarlo como riego del ciclo.');
    }
    return h;
  }
  function enganchar() {
    var s = estado;
    var d1 = $('fnDesde'), d2 = $('fnHasta');
    if (d1) d1.addEventListener('change', function () { s.desde = d1.value; pintar(); });
    if (d2) d2.addEventListener('change', function () { s.hasta = d2.value; pintar(); });
    Array.prototype.forEach.call(document.querySelectorAll('.fnLote'), function (sel) {
      sel.addEventListener('change', function () { var x = s.filas[+sel.dataset.n]; x.eqId = sel.value; x.como = sel.value ? 'elegido' : ''; if (sel.value) recordarEnlace(sel.value, x.f.equipo); pintar(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.fnHoras'), function (b) {
      b.addEventListener('click', function () {
        var x = s.filas[+b.dataset.n], eq = leer('equipos').find(function (e) { return String(e.id) === String(x.eqId); }); if (!eq) return;
        var total = SafiaMant.estado(eq).horas + x.f.horas;
        var eventos = leer('eventos');
        eventos.push({ id: Date.now(), equipoId: eq.id, tipo: 'horimetro', fecha: s.hasta, cantidad: Math.round(total * 10) / 10, unidad: 'h', origen: 'fieldnet', desde: s.desde, hasta: s.hasta, horasPeriodo: x.f.horas, archivo: s.nombre || null, cargadoPor: 'fieldnet', fechaCreacion: new Date().toISOString() });
        localStorage.setItem('eventos', JSON.stringify(eventos));
        recordarEnlace(x.eqId, x.f.equipo);
        b.outerHTML = aviso('ok', 'Horímetro del pivot: ' + fmt(total, 0) + ' h (se sumaron ' + fmt(x.f.horas, 1) + ' h de FieldNET). El mantenimiento se recalcula con esas horas.');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.fnAplicar'), function (b) {
      b.addEventListener('click', function () {
        var x = s.filas[+b.dataset.n], r = aplicar(x.f, x.eqId, s.desde, s.hasta, s.nombre);
        if (r.error) { b.insertAdjacentHTML('afterend', aviso('err', esc(r.error))); return; }
        recordarEnlace(x.eqId, x.f.equipo);
        b.outerHTML = aviso('ok', 'Listo: <b>' + esc(r.cultivo) + ' · ' + esc(r.campana) + '</b> queda con ' + fmt(r.mm, 1) + ' mm de riego del ciclo (FieldNET)' + (r.anterior != null && r.anterior !== '' ? ', antes tenía ' + fmt(parseFloat(r.anterior), 1) + ' mm' : '') + '.');
        try { window.dispatchEvent(new CustomEvent('safia:fieldnet', { detail: r })); } catch (e) {}
      });
    });
  }

  window.SafiaFieldnet = { abrir: abrir, parsear: parsear, adivinarLote: adivinarLote, analizar: analizar, aplicar: aplicar, cargarTexto: cargarTexto };
})();
