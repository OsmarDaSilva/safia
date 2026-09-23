/* SAFIA — NDVI satelital por lote (Banco Agronómico → pestaña "Vigor satelital")
   -------------------------------------------------------------------
   Muestra cómo viene el cultivo semana a semana según el satélite
   Sentinel-2 (NDVI = vigor de la vegetación, de 0 a 1), lote por lote,
   usando el polígono cargado en Equipos y lotes.
   - Los datos los calcula la edge function `safia-ndvi` (Copernicus Data
     Space, gratis con registro) y quedan guardados en la tabla safia_ndvi:
     se acumulan y no se vuelven a pedir.
   - Superpone las campañas del lote en la misma escala (días desde la
     siembra) para comparar la campaña actual con las mejores: es el
     "consultor en vivo" del plan maestro.
   Depende de window.SafiaBanco (campoActual, leer, toast) y de
   window.safiaSupabase (tabla + función). Sin internet muestra lo guardado. */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var series = {};        // equipoId → [{fecha, ndvi, p10, p90, nubes_pct, pixeles}]
  var iniciado = false, cargandoTabla = false;
  var COLORES = ['#178029', '#2E72C8', '#B8731A', '#8E44AD', '#C0392B', '#16A085', '#7F8C8D'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function n2(v) { return v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','); }

  /* ---------- datos ---------- */
  function clave(equipoId) { return 'ndvi_' + String(equipoId); }
  function leerCache(equipoId) { try { return JSON.parse(localStorage.getItem(clave(equipoId)) || '[]') || []; } catch (e) { return []; } }
  function guardarCache(equipoId, lista) { try { localStorage.setItem(clave(equipoId), JSON.stringify(lista)); } catch (e) { /* sin espacio: se sigue en memoria */ } }
  function fusionar(equipoId, nuevos) {
    var mapa = {};
    (series[equipoId] || []).concat(nuevos || []).forEach(function (s) { if (s && s.fecha && s.ndvi != null) mapa[s.fecha] = s; });
    var lista = Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
    series[equipoId] = lista; guardarCache(equipoId, lista);
    return lista;
  }
  function lotesDelCampo() {
    var campo = B().campoActual(); if (!campo) return [];
    return B().leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
  }
  function loteActual() { var id = $('ndviLote').value; return lotesDelCampo().find(function (e) { return String(e.id) === String(id); }) || null; }
  // Campañas del lote con siembra; cosecha real si la hay, si no la estimada (o +150 días)
  function campanasDelLote(equipoId) {
    var salida = [];
    B().leer('campanas').forEach(function (c) {
      if (String(c.equipoId) !== String(equipoId)) return;
      (c.cultivos || []).forEach(function (cu, i) {
        if (!cu || !cu.fechaSiembra) return;
        var cos = (c.cosechas && c.cosechas[i] && c.cosechas[i].fecha) || (i === 0 && c.cosecha && c.cosecha.fecha) || null;
        var rinde = parseFloat(cu.rendimientoReal) || null;
        salida.push({ id: c.id + '_' + i, nombre: c.nombre || '', cultivo: cu.cultivo || '—', variedad: cu.variedad || '', siembra: cu.fechaSiembra.slice(0, 10), cosecha: cos ? cos.slice(0, 10) : null, cosechaEstimada: cu.fechaCosecha ? cu.fechaCosecha.slice(0, 10) : null, rinde: rinde, abierta: !rinde });
      });
    });
    return salida.sort(function (a, b) { return a.siembra.localeCompare(b.siembra); });
  }
  function finDe(c) { return c.cosecha || c.cosechaEstimada || sumarDias(c.siembra, 150); }

  // Trae lo ya guardado en la tabla (una vez por campo)
  function cargarDeTabla() {
    var campo = B().campoActual(), sb = window.safiaSupabase;
    if (!campo || !sb || cargandoTabla) return Promise.resolve();
    cargandoTabla = true;
    return sb.from('safia_ndvi').select('equipo_id,fecha,ndvi_media,ndvi_p10,ndvi_p50,ndvi_p90,ndvi_min,ndvi_max,nubes_pct,pixeles').eq('campo_id', String(campo.id)).order('fecha').then(function (r) {
      cargandoTabla = false;
      if (r.error) { console.warn('NDVI: no se pudo leer la tabla', r.error.message); return; }
      var porLote = {};
      (r.data || []).forEach(function (f) { (porLote[f.equipo_id] = porLote[f.equipo_id] || []).push({ fecha: f.fecha, ndvi: +f.ndvi_media, p10: f.ndvi_p10 == null ? null : +f.ndvi_p10, p50: f.ndvi_p50 == null ? null : +f.ndvi_p50, p90: f.ndvi_p90 == null ? null : +f.ndvi_p90, min: f.ndvi_min == null ? null : +f.ndvi_min, max: f.ndvi_max == null ? null : +f.ndvi_max, nubes_pct: f.nubes_pct == null ? null : +f.nubes_pct, pixeles: f.pixeles }); });
      Object.keys(porLote).forEach(function (k) { fusionar(k, porLote[k]); });
    }, function () { cargandoTabla = false; });
  }

  /* ---------- pedir al satélite ---------- */
  function traer() {
    var lote = loteActual(), boton = $('btnNdviTraer'), estado = $('ndviEstado');
    if (!lote) { B().toast('Elegí un lote', true); return; }
    if (!lote.poligono || !lote.poligono.partes) { B().toast('Este lote no tiene polígono: cargalo en Equipos y lotes (KML de Google Earth o dibujado en el mapa)', true); return; }
    if (!window.safiaSupabase) { B().toast('Sin conexión: se muestra lo guardado', true); return; }
    var desde = $('ndviDesde').value, hasta = $('ndviHasta').value;
    if (!desde || !hasta || hasta <= desde) { B().toast('Revisá las fechas desde / hasta', true); return; }
    if (diasEntre(desde, hasta) > 400) { B().toast('Pedí hasta 400 días por vez', true); return; }
    boton.disabled = true; boton.textContent = 'Consultando el satélite…';
    estado.textContent = 'Copernicus está calculando el NDVI de ' + lote.nombre + ' (' + diasEntre(desde, hasta) + ' días). Suele tardar entre 10 y 60 segundos.';
    window.safiaSupabase.functions.invoke('safia-ndvi', { body: { equipoId: String(lote.id), campoId: String(B().campoActual().id), partes: lote.poligono.partes, desde: desde, hasta: hasta } })
      .then(function (r) {
        if (r.error) throw r.error;
        var d = r.data || {};
        if (!d.ok) throw new Error(d.error || 'sin datos');
        fusionar(lote.id, d.serie);
        estado.textContent = d.n + ' pasadas del satélite con el lote visible entre ' + fmtF(desde) + ' y ' + fmtF(hasta) + (d.guardados ? ' · guardadas en el banco' : '') + '.';
        B().toast('NDVI actualizado: ' + d.n + ' fechas');
        dibujarTodo();
      })
      .catch(function (e) {
        var explicar = function (msg) { estado.textContent = 'No se pudo consultar el satélite: ' + msg; B().toast('NDVI: ' + msg, true); };
        if (e && e.context && typeof e.context.json === 'function') e.context.json().then(function (j) { explicar((j && (j.error + (j.detalle ? ' · ' + j.detalle : ''))) || e.message); }).catch(function () { explicar(e.message); });
        else explicar((e && e.message) || 'error');
      })
      .finally(function () { boton.disabled = false; boton.textContent = 'Traer del satélite'; });
  }

  /* ---------- gráficos (SVG propio, sin librerías) ---------- */
  function svgSerie(lista, marcas, opciones) {
    opciones = opciones || {};
    var W = 900, H = 260, ml = 44, mr = 16, mt = 18, mb = 36;
    if (!lista.length) return '<div class="muted" style="padding:18px 0;">Todavía no hay datos de satélite para este lote en ese período. Apretá "Traer del satélite".</div>';
    var f0 = lista[0].fecha, f1 = lista[lista.length - 1].fecha;
    if (opciones.desde && opciones.desde < f0) f0 = opciones.desde;
    if (opciones.hasta && opciones.hasta > f1) f1 = opciones.hasta;
    var dias = Math.max(1, diasEntre(f0, f1));
    var x = function (f) { return ml + (W - ml - mr) * diasEntre(f0, f) / dias; };
    var y = function (v) { return mt + (H - mt - mb) * (1 - Math.max(0, Math.min(1, v))); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
    // rejilla
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) { s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E1E4E7" stroke-width="1"/><text x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" font-size="11" fill="#8C9196" text-anchor="end">' + v.toFixed(1).replace('.', ',') + '</text>'; });
    // bandas de referencia
    s += '<rect x="' + ml + '" y="' + y(1) + '" width="' + (W - ml - mr) + '" height="' + (y(0.7) - y(1)) + '" fill="#178029" opacity="0.05"/>';
    s += '<text x="' + (W - mr - 4) + '" y="' + (y(0.7) - 4) + '" font-size="10" fill="#178029" text-anchor="end">canopia plena (&gt; 0,7)</text>';
    // meses
    var d = new Date(f0 + 'T12:00:00'); d.setDate(1);
    while (d.toISOString().slice(0, 10) <= f1) {
      var f = d.toISOString().slice(0, 10);
      if (f >= f0) s += '<line x1="' + x(f) + '" x2="' + x(f) + '" y1="' + mt + '" y2="' + (H - mb) + '" stroke="#EEF0F2"/><text x="' + x(f) + '" y="' + (H - mb + 14) + '" font-size="10" fill="#8C9196" text-anchor="middle">' + d.toLocaleDateString('es-PY', { month: 'short', year: '2-digit' }) + '</text>';
      d.setMonth(d.getMonth() + 1);
    }
    // marcas (siembra / cosecha)
    // marcas: las etiquetas se alternan en altura para que no se pisen, y las del borde derecho se alinean hacia la izquierda
    var visiblesM = (marcas || []).filter(function (m) { return m.fecha >= f0 && m.fecha <= f1; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    visiblesM.forEach(function (m, i) {
      var xm = x(m.fecha), derecha = xm > W - mr - 70;
      s += '<line x1="' + xm + '" x2="' + xm + '" y1="' + mt + '" y2="' + (H - mb) + '" stroke="' + m.color + '" stroke-dasharray="4 3"/>';
      s += '<text x="' + (derecha ? xm - 3 : xm + 3) + '" y="' + (mt + 10 + (i % 2) * 12) + '" font-size="10" fill="' + m.color + '"' + (derecha ? ' text-anchor="end"' : '') + '>' + esc(m.texto) + '</text>';
    });
    // banda p10–p90
    var conBanda = lista.filter(function (p) { return p.p10 != null && p.p90 != null; });
    if (conBanda.length > 1) {
      s += '<path d="M' + conBanda.map(function (p) { return x(p.fecha) + ' ' + y(p.p90); }).join(' L') + ' L' + conBanda.slice().reverse().map(function (p) { return x(p.fecha) + ' ' + y(p.p10); }).join(' L') + ' Z" fill="#178029" opacity="0.12"/>';
    }
    // línea media
    s += '<path d="M' + lista.map(function (p) { return x(p.fecha) + ' ' + y(p.ndvi); }).join(' L') + '" fill="none" stroke="#178029" stroke-width="2.2"/>';
    lista.forEach(function (p) {
      var nublado = p.nubes_pct != null && p.nubes_pct > 40;
      s += '<circle cx="' + x(p.fecha) + '" cy="' + y(p.ndvi) + '" r="' + (nublado ? 3 : 3.5) + '" fill="' + (nublado ? '#fff' : '#178029') + '" stroke="#178029" stroke-width="1.5"><title>' + fmtF(p.fecha) + ' · NDVI ' + n2(p.ndvi) + (p.p10 != null ? ' (' + n2(p.p10) + ' a ' + n2(p.p90) + ' dentro del lote)' : '') + (p.nubes_pct != null ? ' · nubes ' + Math.round(p.nubes_pct) + ' %' : '') + '</title></circle>';
    });
    s += '</svg><div class="muted" style="font-size:11px;">Línea: NDVI promedio del lote. Sombra: del 10 % al 90 % de los píxeles (cuánto varía dentro del lote). Puntos vacíos: pasadas con más del 40 % del lote nublado.</div>';
    return s;
  }

  // Curvas por campaña en "días desde la siembra"
  function svgCampanas(curvas) {
    var W = 900, H = 280, ml = 44, mr = 16, mt = 18, mb = 36;
    var maxD = 10; curvas.forEach(function (c) { c.puntos.forEach(function (p) { if (p.dds > maxD) maxD = p.dds; }); });
    maxD = Math.min(Math.max(maxD, 120), 260);
    var x = function (dd) { return ml + (W - ml - mr) * Math.min(dd, maxD) / maxD; };
    var y = function (v) { return mt + (H - mt - mb) * (1 - Math.max(0, Math.min(1, v))); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) { s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E1E4E7"/><text x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" font-size="11" fill="#8C9196" text-anchor="end">' + v.toFixed(1).replace('.', ',') + '</text>'; });
    for (var dd = 0; dd <= maxD; dd += 20) s += '<text x="' + x(dd) + '" y="' + (H - mb + 14) + '" font-size="10" fill="#8C9196" text-anchor="middle">' + dd + '</text>';
    s += '<text x="' + (W / 2) + '" y="' + (H - 4) + '" font-size="11" fill="#8C9196" text-anchor="middle">días desde la siembra</text>';
    curvas.forEach(function (c) {
      if (c.puntos.length < 2) return;
      s += '<path d="M' + c.puntos.map(function (p) { return x(p.dds) + ' ' + y(p.ndvi); }).join(' L') + '" fill="none" stroke="' + c.color + '" stroke-width="' + (c.abierta ? 3 : 1.8) + '"' + (c.abierta ? '' : ' opacity="0.85"') + '/>';
      c.puntos.forEach(function (p) { s += '<circle cx="' + x(p.dds) + '" cy="' + y(p.ndvi) + '" r="2.5" fill="' + c.color + '"><title>' + esc(c.etiqueta) + ' · día ' + p.dds + ' (' + fmtF(p.fecha) + ') · NDVI ' + n2(p.ndvi) + '</title></circle>'; });
    });
    s += '</svg>';
    return s;
  }

  /* ---------- análisis por campaña ---------- */
  function curvaDe(c, lista) {
    var fin = finDe(c);
    var pts = lista.filter(function (p) { return p.fecha >= c.siembra && p.fecha <= sumarDias(fin, 7) && !(p.nubes_pct > 40); })
      .map(function (p) { return { dds: diasEntre(c.siembra, p.fecha), fecha: p.fecha, ndvi: p.ndvi }; });
    var max = null, diaMax = null, integral = 0, diasPlenos = 0;
    pts.forEach(function (p, i) {
      if (max == null || p.ndvi > max) { max = p.ndvi; diaMax = p.dds; }
      if (i > 0) { var dt = p.dds - pts[i - 1].dds; integral += (p.ndvi + pts[i - 1].ndvi) / 2 * dt; if ((p.ndvi + pts[i - 1].ndvi) / 2 >= 0.7) diasPlenos += dt; }
    });
    return { puntos: pts, max: max, diaMax: diaMax, integral: Math.round(integral), diasPlenos: diasPlenos };
  }
  // NDVI de una curva a un día dado (interpolado), o null
  function ndviEnDia(curva, dd) {
    var p = curva.puntos; if (!p.length) return null;
    for (var i = 0; i < p.length; i++) {
      if (p[i].dds === dd) return p[i].ndvi;
      if (p[i].dds > dd) { if (i === 0) return dd >= p[0].dds - 8 ? p[0].ndvi : null; var a = p[i - 1], b = p[i]; return a.ndvi + (b.ndvi - a.ndvi) * (dd - a.dds) / (b.dds - a.dds); }
    }
    return dd - p[p.length - 1].dds <= 8 ? p[p.length - 1].ndvi : null;
  }
  function pearson(xs, ys) {
    var n = xs.length; if (n < 3) return null;
    var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n, my = ys.reduce(function (a, b) { return a + b; }, 0) / n, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : null;
  }

  function dibujarCampanas(lote, lista) {
    var cont = $('ndviCampanas');
    var camps = campanasDelLote(lote.id);
    if (!camps.length) { cont.innerHTML = '<div class="muted">Este lote no tiene campañas con fecha de siembra. Cargalas en Campañas para comparar el vigor entre años.</div>'; return; }
    var curvas = [], vacias = [];
    camps.forEach(function (c, i) {
      var cv = curvaDe(c, lista);
      var etiqueta = c.cultivo + ' ' + c.siembra.slice(0, 4) + (c.nombre ? ' · ' + c.nombre : '') + (c.rinde ? ' · ' + Math.round(c.rinde).toLocaleString('es-PY') + ' kg/ha' : ' · en curso');
      var item = { campana: c, etiqueta: etiqueta, color: COLORES[i % COLORES.length], abierta: c.abierta, puntos: cv.puntos, max: cv.max, diaMax: cv.diaMax, integral: cv.integral, diasPlenos: cv.diasPlenos };
      if (cv.puntos.length >= 2) curvas.push(item); else vacias.push(item);
    });
    var html = '';
    if (!curvas.length) {
      html += '<div class="muted">Hay ' + camps.length + ' campaña(s) pero todavía no hay NDVI en sus fechas. Pedí el satélite para el período de cada campaña (por ejemplo desde la siembra hasta la cosecha).</div>';
      cont.innerHTML = html; return;
    }
    html += svgCampanas(curvas);
    // leyenda + tabla
    html += '<div class="tablewrap" style="margin-top:8px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>Campaña</th><th class="r">NDVI máx.</th><th class="r">Día del máx.</th><th class="r">Días con canopia plena</th><th class="r">NDVI acumulado</th><th class="r">Rinde (kg/ha)</th></tr></thead><tbody>';
    curvas.forEach(function (c) {
      html += '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + c.color + ';margin-right:6px;"></span>' + esc(c.etiqueta) + '</td><td class="r">' + n2(c.max) + '</td><td class="r">' + (c.diaMax != null ? c.diaMax : '—') + '</td><td class="r">' + c.diasPlenos + '</td><td class="r">' + c.integral + '</td><td class="r">' + (c.campana.rinde ? Math.round(c.campana.rinde).toLocaleString('es-PY') : '—') + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    html += '<div class="muted" style="font-size:11px;margin-top:4px;">NDVI acumulado = área bajo la curva (vigor × días): resume cuánta biomasa verde sostuvo el lote en toda la campaña. Días con canopia plena = días con NDVI ≥ 0,7.</div>';

    // consultor en vivo: la campaña abierta contra la mejor cosechada del mismo cultivo
    var abierta = curvas.find(function (c) { return c.abierta; });
    var cerradas = curvas.filter(function (c) { return !c.abierta && c.campana.rinde; });
    if (abierta && cerradas.length) {
      var mismoCultivo = cerradas.filter(function (c) { return c.campana.cultivo.toLowerCase() === abierta.campana.cultivo.toLowerCase(); });
      var ref = (mismoCultivo.length ? mismoCultivo : cerradas).sort(function (a, b) { return b.campana.rinde - a.campana.rinde; })[0];
      var ult = abierta.puntos[abierta.puntos.length - 1];
      var vRef = ndviEnDia(ref, ult.dds);
      if (vRef != null) {
        var dif = (ult.ndvi - vRef) / vRef * 100;
        var tono = dif <= -12 ? 'atencion' : (dif >= 8 ? 'bien' : 'igual');
        var texto = 'Hoy (día ' + ult.dds + ' desde la siembra, ' + fmtF(ult.fecha) + ') <b>' + esc(abierta.campana.cultivo) + '</b> está en NDVI <b>' + n2(ult.ndvi) + '</b>. En la campaña de referencia (' + esc(ref.etiqueta) + ') a esos mismos días tenía <b>' + n2(vRef) + '</b>: ';
        if (tono === 'atencion') texto += 'viene <b>' + Math.abs(Math.round(dif)) + ' % abajo</b>. Vale la pena revisar en el lote: agua (riego y lluvia del último mes), nutrición (nitrógeno en maíz, fósforo y potasio según el análisis), plagas o enfermedades, y fallas de stand. Si el cultivo está entre floración y llenado, todavía se puede corregir.';
        else if (tono === 'bien') texto += 'viene <b>' + Math.round(dif) + ' % arriba</b>. Buen vigor: mantener el plan de riego y nutrición y cuidar sanidad para sostener la canopia.';
        else texto += 'viene <b>parejo</b> (' + (dif >= 0 ? '+' : '') + Math.round(dif) + ' %). Seguir el plan y volver a mirar en 10 días.';
        var mejorMismoDia = null; cerradas.forEach(function (c) { var v = ndviEnDia(c, ult.dds); if (v != null && (mejorMismoDia == null || v > mejorMismoDia)) mejorMismoDia = v; });
        html += '<div class="note ' + (tono === 'atencion' ? 'warn' : 'info') + '" style="margin-top:12px;"><b>Consultor en vivo.</b> ' + texto + (mejorMismoDia != null && mejorMismoDia !== vRef ? ' (El mejor NDVI histórico del lote a esos días fue ' + n2(mejorMismoDia) + '.)' : '') + '<br><span class="muted" style="font-size:11px;">SAFIA compara e interpreta; el diagnóstico en el lote y la prescripción los hace el agrónomo.</span></div>';
      }
    }
    // relación NDVI acumulado ↔ rinde (si hay historial)
    if (cerradas.length >= 3) {
      var r = pearson(cerradas.map(function (c) { return c.integral; }), cerradas.map(function (c) { return c.campana.rinde; }));
      if (r != null) html += '<div class="muted" style="font-size:12px;margin-top:8px;">En este lote, el NDVI acumulado y el rinde van ' + (r > 0.6 ? 'muy de la mano (r = ' + n2(r) + '): el vigor que ve el satélite anticipa la cosecha.' : (r > 0.3 ? 'parcialmente juntos (r = ' + n2(r) + ').' : 'poco relacionados (r = ' + n2(r) + '): otros factores (agua al final del ciclo, granizo, enfermedades) pesaron más que el vigor promedio.')) + '</div>';
    }
    if (vacias.length) html += '<div class="muted" style="font-size:11px;margin-top:6px;">Sin NDVI todavía: ' + esc(vacias.map(function (v) { return v.etiqueta; }).join(' · ')) + '. Pedí el satélite para esas fechas para sumarlas a la comparación.</div>';
    cont.innerHTML = html;
  }

  function dibujarTodo() {
    var lote = loteActual(); var g = $('ndviGrafico'), res = $('ndviResumen');
    if (!lote) { g.innerHTML = '<div class="muted">Este campo no tiene lotes. Cargalos en Equipos y lotes.</div>'; $('ndviCampanas').innerHTML = ''; res.innerHTML = ''; return; }
    var lista = series[lote.id] || [];
    var desde = $('ndviDesde').value, hasta = $('ndviHasta').value;
    var visibles = lista.filter(function (p) { return (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta); });
    var marcas = [];
    campanasDelLote(lote.id).forEach(function (c, i) { var col = COLORES[i % COLORES.length]; marcas.push({ fecha: c.siembra, color: col, texto: 'siembra ' + c.cultivo }); var fin = c.cosecha; if (fin) marcas.push({ fecha: fin, color: col, texto: 'cosecha' }); });
    g.innerHTML = svgSerie(visibles, marcas, { desde: desde, hasta: hasta });
    if (visibles.length) {
      var ult = visibles[visibles.length - 1], max = visibles.reduce(function (m, p) { return p.ndvi > m.ndvi ? p : m; }, visibles[0]);
      var sinPoli = !lote.poligono;
      res.innerHTML = '<div class="stats" style="margin-top:10px;"><div class="stat"><div class="sl">Última pasada</div><div class="sv">' + n2(ult.ndvi) + '</div><div class="ss">' + fmtF(ult.fecha) + (ult.nubes_pct != null ? ' · nubes ' + Math.round(ult.nubes_pct) + ' %' : '') + '</div></div>' +
        '<div class="stat"><div class="sl">Máximo del período</div><div class="sv">' + n2(max.ndvi) + '</div><div class="ss">' + fmtF(max.fecha) + '</div></div>' +
        '<div class="stat"><div class="sl">Pasadas útiles</div><div class="sv">' + visibles.length + '</div><div class="ss">de ' + lista.length + ' guardadas en total</div></div>' +
        '<div class="stat"><div class="sl">Variación dentro del lote</div><div class="sv">' + (ult.p10 != null ? n2(ult.p10) + ' – ' + n2(ult.p90) : '—') + '</div><div class="ss">10 % a 90 % de los píxeles' + (ult.p10 != null && ult.ndvi > 0.5 && ult.p90 - ult.p10 > 0.25 ? ' · lote desparejo con el cultivo en pie: mirá el mapa de fertilidad' : '') + '</div></div></div>' + (sinPoli ? '<div class="note warn" style="margin-top:8px;">Este lote no tiene polígono: los datos son antiguos. Cargá el contorno para volver a pedir.</div>' : '');
    } else res.innerHTML = '';
    dibujarCampanas(lote, lista);
  }

  /* ---------- pantalla ---------- */
  function llenarLotes() {
    var sel = $('ndviLote'), lotes = lotesDelCampo(), actual = sel.value;
    sel.innerHTML = lotes.length ? lotes.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.poligono ? '' : ' data-sinpoli="1"') + '>' + esc(e.nombre) + (e.tipo === 'secano' ? ' (secano)' : '') + (e.poligono ? ' · ' + (window.SafiaLotes ? SafiaLotes.fmtHa(e.poligono.ha) : e.poligono.ha + ' ha') : ' · sin polígono') + '</option>'; }).join('') : '<option value="">Sin lotes en este campo</option>';
    var preferido = actual || (lotes.find(function (e) { return e.poligono; }) || lotes[0] || {}).id;
    if (preferido) sel.value = String(preferido);
  }
  function fechasPorDefecto() {
    var lote = loteActual(); var hoy = hoyISO();
    var abierta = lote ? campanasDelLote(lote.id).filter(function (c) { return c.abierta; }).slice(-1)[0] : null;
    $('ndviHasta').value = hoy;
    $('ndviDesde').value = abierta ? sumarDias(abierta.siembra, -15) : sumarDias(hoy, -240);
  }
  function activar() {
    if (!B() || !$('panel-ndvi')) return;
    if (!iniciado) {
      iniciado = true;
      $('ndviLote').addEventListener('change', function () { fechasPorDefecto(); dibujarTodo(); });
      $('ndviDesde').addEventListener('change', dibujarTodo);
      $('ndviHasta').addEventListener('change', dibujarTodo);
      $('btnNdviTraer').addEventListener('click', traer);
      $('btnNdviCampana').addEventListener('click', function () {
        var lote = loteActual(); if (!lote) return;
        var camps = campanasDelLote(lote.id); if (!camps.length) { B().toast('Este lote no tiene campañas con siembra', true); return; }
        var c = camps[camps.length - 1];
        $('ndviDesde').value = sumarDias(c.siembra, -15); $('ndviHasta').value = (finDe(c) < hoyISO() ? sumarDias(finDe(c), 10) : hoyISO());
        dibujarTodo();
      });
    }
    llenarLotes();
    lotesDelCampo().forEach(function (e) { if (!series[e.id]) series[e.id] = leerCache(e.id); });
    fechasPorDefecto();
    dibujarTodo();
    cargarDeTabla().then(dibujarTodo);
  }
  function alCambiarCampo() { if (iniciado && $('panel-ndvi').classList.contains('on')) activar(); }

  window.SafiaNDVI = { activar: activar, alCambiarCampo: alCambiarCampo, curvaDe: curvaDe, ndviEnDia: ndviEnDia, _series: function () { return series; }, _fusionar: fusionar };
})();
