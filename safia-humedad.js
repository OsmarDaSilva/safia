/* SAFIA — Humedad de suelo (sondas de la estación METOS u otra)
   -------------------------------------------------------------------
   La estación del campo (FieldClimate) trae la humedad de suelo de cada
   profundidad de la sonda y SAFIA la guarda día por día en `clima_estacion`
   (campo humSuelo = { "nombre del sensor chN": valor }). Este módulo:
   - muestra la curva por profundidad y el promedio de la zona de raíces;
   - deja configurar por campo la capacidad de campo (CC), el punto de
     marchitez permanente (PMP), el agotamiento permitido y qué sensores
     forman la zona de raíces (campo.sonda = {...});
   - calcula el estado (saturado / bien / cerca de la recarga / hay que
     regar) y los días que faltan para la recarga con el ritmo de secado
     de los últimos días;
   - da el aviso del consultor en vivo y un resumen para el informe.

   Fuentes:
   [1] FAO-56 (Allen et al. 1998), Tabla 19: humedad volumétrica a
       capacidad de campo y punto de marchitez por textura: arenoso
       0,07–0,17 / 0,02–0,07; franco arenoso 0,11–0,19 / 0,03–0,10;
       franco 0,20–0,30 / 0,07–0,17; franco arcilloso 0,23–0,32 /
       0,09–0,15 (aprox.); arcilloso 0,32–0,40 / 0,20–0,24. Fracción
       agotable sin estrés (p) para soja 0,50 y maíz 0,55 (Tabla 22).
   [2] UNL G1367 "Irrigating Soybean": agotamiento permitido 50 % del agua
       disponible; regar antes de que la zona de raíces (0–60/90 cm) baje
       de ese umbral, sobre todo entre R3 y R6.
   [3] Sensores de tensión (Watermark, kPa): 0–10 saturado, 10–30 cerca de
       capacidad de campo, 30–60 zona de riego habitual en suelos medios,
       > 60–100 estrés (guías de UNL/Irrometer; el umbral se ajusta por
       textura). Cuanto MÁS alto el kPa, MÁS seco.
   Depende de window.SafiaBanco y de SafiaSensores.climaDeEstacion. */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var iniciado = false;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function hoyISO() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }   // hoy en hora local (Paraguay), no UTC

  // Capacidad de campo y punto de marchitez orientativos por textura (FAO-56 Tabla 19, en % volumétrico) [1]
  // Texturas: la misma tabla que el motor de agua (safia-balance.js); la copia local queda solo de respaldo
  var TEXTURAS = (window.SafiaBalance && SafiaBalance.TEXTURAS) ? SafiaBalance.TEXTURAS.map(function (t) { return { k: t.k, n: t.nombreLargo, cc: t.cc, pmp: t.pmp }; }) : [
    { k: 'arenoso', n: 'Arenoso (< 15 % arcilla, mucha arena)', cc: 12, pmp: 4 },
    { k: 'franco_arenoso', n: 'Franco arenoso (15–20 % arcilla)', cc: 15, pmp: 6 },
    { k: 'franco', n: 'Franco (20–30 % arcilla)', cc: 25, pmp: 12 },
    { k: 'franco_arcilloso', n: 'Franco arcilloso (30–40 % arcilla)', cc: 28, pmp: 13 },
    { k: 'arcilloso', n: 'Arcilloso (> 40 % arcilla)', cc: 36, pmp: 22 }
  ];
  function texturaPorArcilla(arc) { if (arc == null) return null; return arc < 15 ? TEXTURAS[0] : (arc < 20 ? TEXTURAS[1] : (arc < 30 ? TEXTURAS[2] : (arc < 40 ? TEXTURAS[3] : TEXTURAS[4]))); }
  var AGOTAMIENTO = { soja: 50, maiz: 55, trigo: 55, girasol: 45, sorgo: 55, otro: 50 };   // % del agua disponible que se puede agotar sin estrés (FAO-56 Tabla 22, redondeado) [1][2]

  /* ---------- datos ---------- */
  function campo() { return B() && B().campoActual ? B().campoActual() : null; }
  function filas(campoId, desde, hasta) {
    if (!window.SafiaSensores) return [];
    return SafiaSensores.climaDeEstacion(campoId, desde, hasta).filter(function (r) { return r.humSuelo && Object.keys(r.humSuelo).length; });
  }
  function sensoresDe(fs) { var s = {}; fs.forEach(function (r) { Object.keys(r.humSuelo).forEach(function (k) { if (r.humSuelo[k] != null) s[k] = 1; }); }); return Object.keys(s).sort(ordenProfundidad); }
  function profundidadDe(nombre) { var m = String(nombre).match(/(\d{1,3})\s*(cm|mm)?/); if (!m) return null; var v = parseInt(m[1], 10); return m[2] === 'mm' ? v / 10 : v; }
  function ordenProfundidad(a, b) { var pa = profundidadDe(a), pb = profundidadDe(b); if (pa != null && pb != null) return pa - pb; return String(a).localeCompare(String(b)); }
  function config(c) {
    var s = (c && c.sonda) || {};
    return { unidad: s.unidad || 'vwc', cc: num(s.cc), pmp: num(s.pmp), agotamiento: num(s.agotamiento) != null ? num(s.agotamiento) : 50, kpaRiego: num(s.kpaRiego) != null ? num(s.kpaRiego) : 50, sensores: Array.isArray(s.sensores) ? s.sensores : null };
  }
  function guardarConfig(c, cfg) {
    var campos = B().leer('campos'), i = campos.findIndex(function (x) { return String(x.id) === String(c.id); });
    if (i < 0) return;
    campos[i].sonda = cfg; B().guardar('campos', campos);
    if (B().campoActual()) B().campoActual().sonda = cfg;
  }
  // Promedio de la zona de raíces por fecha (sensores elegidos o todos)
  function serieZona(fs, sensores) {
    return fs.map(function (r) { var vs = sensores.map(function (k) { return r.humSuelo[k]; }).filter(function (v) { return v != null; }); return { fecha: r.fecha, valor: vs.length ? vs.reduce(function (a, b) { return a + b; }, 0) / vs.length : null, lluvia: r.lluvia }; }).filter(function (p) { return p.valor != null; });
  }
  // Umbral de recarga: CC − p × (CC − PMP) en %vol; en kPa es el valor configurado (más alto = más seco)
  function umbrales(cfg) {
    if (cfg.unidad === 'kpa') return { recarga: cfg.kpaRiego, saturado: 10, cc: 20 };
    if (cfg.cc == null || cfg.pmp == null) return null;
    return { cc: cfg.cc, pmp: cfg.pmp, recarga: Math.round((cfg.cc - cfg.agotamiento / 100 * (cfg.cc - cfg.pmp)) * 10) / 10, saturado: Math.round(cfg.cc * 1.08 * 10) / 10 };
  }
  // Estado y días hasta la recarga con el ritmo de secado de los últimos 5 días sin lluvia
  function estado(campoId, cfgIn) {
    var c = campo(), cfg = cfgIn || config(c && String(c.id) === String(campoId) ? c : (B().leer('campos').find(function (x) { return String(x.id) === String(campoId); }) || {}));
    var fs = filas(campoId); if (!fs.length) return null;
    var sens = cfg.sensores && cfg.sensores.length ? cfg.sensores : sensoresDe(fs);
    var z = serieZona(fs, sens); if (!z.length) return null;
    var ult = z[z.length - 1], u = umbrales(cfg), kpa = cfg.unidad === 'kpa';
    var res = { fecha: ult.fecha, valor: ult.valor, unidad: kpa ? 'kPa' : '% vol', sensores: sens, umbrales: u, antiguedadDias: diasEntre(ult.fecha, hoyISO()), porSensor: sens.map(function (k) { var r = fs[fs.length - 1]; return { k: k, prof: profundidadDe(k), valor: r.humSuelo[k] }; }) };
    // ritmo de secado: últimos 5 puntos sin lluvia significativa
    var rec = z.slice(-6).filter(function (p) { return !(p.lluvia > 2); });
    if (rec.length >= 3) { var a = rec[0], b = rec[rec.length - 1], d = diasEntre(a.fecha, b.fecha); res.ritmo = d > 0 ? Math.round((b.valor - a.valor) / d * 100) / 100 : null; }
    if (!u) { res.k = 'sin_config'; res.texto = 'Hay lecturas de la sonda, pero falta configurar la capacidad de campo y el punto de marchitez del lote (Banco → Humedad de suelo → Configuración) para saber cuándo regar.'; return res; }
    var pct = null;
    if (!kpa) {
      pct = Math.round((ult.valor - u.pmp) / (u.cc - u.pmp) * 100);   // % del agua disponible que queda
      res.aguaDisponiblePct = pct;
      if (ult.valor > u.saturado) { res.k = 'saturado'; res.texto = 'Suelo saturado (' + fmt(ult.valor, 1) + ' % vol, por encima de la capacidad de campo ' + fmt(u.cc, 1) + '): no regar; el exceso lava nitratos y asfixia raíces.'; }
      else if (ult.valor <= u.recarga) { res.k = 'regar'; res.texto = 'Por debajo del punto de recarga (' + fmt(ult.valor, 1) + ' vs ' + fmt(u.recarga, 1) + ' % vol): queda ' + pct + ' % del agua disponible. Hay que regar ahora' + (res.ritmo != null && res.ritmo < 0 ? '; el suelo pierde ' + fmt(-res.ritmo, 2) + ' puntos por día' : '') + '.'; }
      else {
        var dias = res.ritmo != null && res.ritmo < 0 ? Math.floor((ult.valor - u.recarga) / -res.ritmo) : null; res.diasHastaRecarga = dias;
        if (dias != null && dias <= 3) { res.k = 'cerca'; res.texto = 'Cerca de la recarga: al ritmo de secado actual (' + fmt(-res.ritmo, 2) + ' puntos por día) el lote llega al punto de recarga en ~' + dias + ' día(s). Programar el riego.'; }
        else { res.k = 'bien'; res.texto = 'Agua disponible ' + pct + ' % (' + fmt(ult.valor, 1) + ' % vol entre PMP ' + fmt(u.pmp, 1) + ' y CC ' + fmt(u.cc, 1) + ')' + (dias != null ? '; al ritmo actual faltan ~' + dias + ' días para la recarga.' : '.'); }
      }
    } else {
      if (ult.valor <= u.saturado) { res.k = 'saturado'; res.texto = 'Suelo saturado (' + fmt(ult.valor, 0) + ' kPa, ≤ 10): no regar.'; }
      else if (ult.valor >= u.recarga) { res.k = 'regar'; res.texto = 'Tensión ' + fmt(ult.valor, 0) + ' kPa, por encima del umbral de riego (' + fmt(u.recarga, 0) + '): hay que regar ahora.'; }
      else {
        var diasK = res.ritmo != null && res.ritmo > 0 ? Math.floor((u.recarga - ult.valor) / res.ritmo) : null; res.diasHastaRecarga = diasK;
        if (diasK != null && diasK <= 3) { res.k = 'cerca'; res.texto = 'Cerca del umbral de riego: al ritmo actual (+' + fmt(res.ritmo, 1) + ' kPa por día) se llega en ~' + diasK + ' día(s).'; }
        else { res.k = 'bien'; res.texto = 'Tensión ' + fmt(ult.valor, 0) + ' kPa, dentro de la zona cómoda (umbral ' + fmt(u.recarga, 0) + ')' + (diasK != null ? '; faltan ~' + diasK + ' días para el umbral.' : '.'); }
      }
    }
    if (res.antiguedadDias > 2) res.texto += ' Ojo: la última lectura es del ' + fmtF(ult.fecha) + '; traé la estación para actualizar.';
    return res;
  }
  var COLOR_ESTADO = { saturado: '#2E72C8', bien: '#178029', cerca: '#B8731A', regar: '#B3261E', sin_config: '#8C9196' };
  var NOMBRE_ESTADO = { saturado: 'Saturado', bien: 'Bien', cerca: 'Cerca de la recarga', regar: 'Regar', sin_config: 'Sin configurar' };

  /* ---------- gráfico ---------- */
  var COLORES = ['#2E72C8', '#178029', '#B8731A', '#8E44AD', '#C0392B', '#16A085'];
  function svg(fs, sens, cfg) {
    var W = 900, H = 280, ml = 44, mr = 16, mt = 18, mb = 34;
    if (!fs.length) return '<div class="muted" style="padding:16px 0;">Sin lecturas de sonda en este período.</div>';
    var f0 = fs[0].fecha, f1 = fs[fs.length - 1].fecha, dias = Math.max(1, diasEntre(f0, f1));
    var todos = []; fs.forEach(function (r) { sens.forEach(function (k) { if (r.humSuelo[k] != null) todos.push(r.humSuelo[k]); }); });
    var u = umbrales(cfg), kpa = cfg.unidad === 'kpa';
    var vMin = Math.min.apply(null, todos), vMax = Math.max.apply(null, todos);
    if (u) { vMin = Math.min(vMin, kpa ? 0 : u.pmp); vMax = Math.max(vMax, kpa ? u.recarga * 1.2 : u.saturado); }
    vMin = Math.floor(vMin * 0.95); vMax = Math.ceil(vMax * 1.05); if (vMax <= vMin) vMax = vMin + 1;
    var x = function (f) { return ml + (W - ml - mr) * diasEntre(f0, f) / dias; };
    var y = function (v) { return mt + (H - mt - mb) * (1 - (v - vMin) / (vMax - vMin)); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
    // bandas
    if (u && !kpa) {
      s += '<rect x="' + ml + '" y="' + y(vMax) + '" width="' + (W - ml - mr) + '" height="' + Math.max(0, y(u.saturado) - y(vMax)) + '" fill="#2E72C8" opacity="0.07"/>';
      s += '<rect x="' + ml + '" y="' + y(u.saturado) + '" width="' + (W - ml - mr) + '" height="' + Math.max(0, y(u.recarga) - y(u.saturado)) + '" fill="#178029" opacity="0.07"/>';
      s += '<rect x="' + ml + '" y="' + y(u.recarga) + '" width="' + (W - ml - mr) + '" height="' + Math.max(0, y(vMin) - y(u.recarga)) + '" fill="#B3261E" opacity="0.07"/>';
      [['CC ' + fmt(u.cc, 0), u.cc, '#2E72C8'], ['recarga ' + fmt(u.recarga, 0), u.recarga, '#B3261E'], ['PMP ' + fmt(u.pmp, 0), u.pmp, '#8C9196']].forEach(function (l) { s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(l[1]) + '" y2="' + y(l[1]) + '" stroke="' + l[2] + '" stroke-dasharray="5 4"/><text x="' + (W - mr - 4) + '" y="' + (y(l[1]) - 4) + '" font-size="10" fill="' + l[2] + '" text-anchor="end">' + l[0] + '</text>'; });
    } else if (u && kpa) {
      s += '<rect x="' + ml + '" y="' + y(vMax) + '" width="' + (W - ml - mr) + '" height="' + Math.max(0, y(u.recarga) - y(vMax)) + '" fill="#B3261E" opacity="0.07"/>';
      s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(u.recarga) + '" y2="' + y(u.recarga) + '" stroke="#B3261E" stroke-dasharray="5 4"/><text x="' + (W - mr - 4) + '" y="' + (y(u.recarga) - 4) + '" font-size="10" fill="#B3261E" text-anchor="end">umbral de riego ' + fmt(u.recarga, 0) + ' kPa</text>';
    }
    // rejilla y
    var paso = (vMax - vMin) / 5; for (var i = 0; i <= 5; i++) { var v = vMin + paso * i; s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E1E4E7"/><text x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" font-size="11" fill="#8C9196" text-anchor="end">' + fmt(v, 0) + '</text>'; }
    // meses
    var d = new Date(f0 + 'T12:00:00'); d.setDate(1);
    while (d.toISOString().slice(0, 10) <= f1) { var f = d.toISOString().slice(0, 10); if (f >= f0) s += '<line x1="' + x(f) + '" x2="' + x(f) + '" y1="' + mt + '" y2="' + (H - mb) + '" stroke="#EEF0F2"/><text x="' + x(f) + '" y="' + (H - mb + 14) + '" font-size="10" fill="#8C9196" text-anchor="middle">' + d.toLocaleDateString('es-PY', { month: 'short', year: '2-digit' }) + '</text>'; d.setMonth(d.getMonth() + 1); }
    // lluvia (barras abajo)
    var maxLl = Math.max.apply(null, fs.map(function (r) { return r.lluvia || 0; }).concat([1]));
    fs.forEach(function (r) { if (r.lluvia > 0) { var h = Math.min(50, 50 * r.lluvia / maxLl); s += '<rect x="' + (x(r.fecha) - 1.5) + '" y="' + (H - mb - h) + '" width="3" height="' + h + '" fill="#2E72C8" opacity="0.35"><title>' + fmtF(r.fecha) + ' · lluvia ' + fmt(r.lluvia, 1) + ' mm</title></rect>'; } });
    // líneas por sensor
    sens.forEach(function (k, i) {
      var pts = fs.filter(function (r) { return r.humSuelo[k] != null; }); if (pts.length < 2) return;
      s += '<path d="M' + pts.map(function (r) { return x(r.fecha) + ' ' + y(r.humSuelo[k]); }).join(' L') + '" fill="none" stroke="' + COLORES[i % COLORES.length] + '" stroke-width="1.8"/>';
      pts.forEach(function (r) { s += '<circle cx="' + x(r.fecha) + '" cy="' + y(r.humSuelo[k]) + '" r="1.8" fill="' + COLORES[i % COLORES.length] + '"><title>' + esc(k) + ' · ' + fmtF(r.fecha) + ' · ' + fmt(r.humSuelo[k], 1) + '</title></circle>'; });
    });
    // promedio zona de raíces
    var z = serieZona(fs, sens); if (z.length > 1 && sens.length > 1) s += '<path d="M' + z.map(function (p) { return x(p.fecha) + ' ' + y(p.valor); }).join(' L') + '" fill="none" stroke="#0F3D14" stroke-width="3" opacity="0.9"/>';
    s += '<text x="' + (W / 2) + '" y="' + (H - 2) + '" font-size="11" fill="#8C9196" text-anchor="middle">' + (kpa ? 'tensión de agua del suelo (kPa; más alto = más seco)' : 'humedad volumétrica (% vol)') + ' · barras: lluvia</text>';
    s += '</svg><div class="muted" style="font-size:11px;">' + sens.map(function (k, i) { return '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + COLORES[i % COLORES.length] + ';margin:0 4px 0 8px;"></span>' + esc(k); }).join('') + (sens.length > 1 ? '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#0F3D14;margin:0 4px 0 8px;"></span>promedio zona de raíces' : '') + '</div>';
    return s;
  }

  /* ---------- HTML ---------- */
  function htmlEstado(e) {
    if (!e) return '';
    return '<div class="note ' + (e.k === 'regar' || e.k === 'cerca' ? 'warn' : 'info') + '" style="border-left-color:' + (COLOR_ESTADO[e.k] || '#8C9196') + ';"><b>Consultor en vivo · humedad de suelo: ' + esc(NOMBRE_ESTADO[e.k] || e.k) + '.</b> ' + esc(e.texto) + '</div>';
  }
  // Resumen para el informe del cliente
  function htmlResumen(campoId) {
    var e = estado(campoId); if (!e) return '';
    var h = '<h3>Humedad de suelo medida por la sonda (última lectura ' + fmtF(e.fecha) + ')</h3><div class="stats" style="margin-bottom:6px;">' +
      '<div class="stat"><div class="sl">Zona de raíces</div><div class="sv" style="color:' + (COLOR_ESTADO[e.k] || 'inherit') + ';">' + fmt(e.valor, e.unidad === 'kPa' ? 0 : 1) + ' ' + esc(e.unidad) + '</div><div class="ss">' + esc(NOMBRE_ESTADO[e.k] || '') + '</div></div>' +
      (e.aguaDisponiblePct != null ? '<div class="stat"><div class="sl">Agua disponible</div><div class="sv">' + e.aguaDisponiblePct + ' %</div><div class="ss">recarga al ' + (100 - (e.umbrales ? Math.round((e.umbrales.cc - e.umbrales.recarga) / (e.umbrales.cc - e.umbrales.pmp) * 100) : 50)) + ' %</div></div>' : '') +
      (e.diasHastaRecarga != null ? '<div class="stat"><div class="sl">Días hasta la recarga</div><div class="sv">' + e.diasHastaRecarga + '</div></div>' : '') +
      e.porSensor.map(function (s) { return '<div class="stat"><div class="sl">' + esc(s.k) + '</div><div class="sv">' + fmt(s.valor, 1) + '</div></div>'; }).join('') + '</div>' + htmlEstado(e);
    return h;
  }
  function pintar() {
    var c = campo(), cont = $('humContenido'); if (!cont) return;
    if (!c) { cont.innerHTML = '<div class="muted">Elegí un campo.</div>'; return; }
    if (!c.estacionId) { cont.innerHTML = '<div class="note info">Este campo no tiene estación meteorológica asignada. Cuando el cliente tenga una estación METOS con sonda de humedad, asignala en <b>Campos → Estación meteorológica</b>: SAFIA trae las lecturas de cada profundidad con "Traer de la estación" (pestaña Agua) y acá muestra cuándo regar.</div>'; return; }
    var cfg = config(c), dias = +($('humDias') ? $('humDias').value : 60) || 60;
    var todas = filas(c.id), fs = todas.filter(function (r) { return r.fecha >= sumarDias(hoyISO(), -dias); });
    if (!todas.length) { cont.innerHTML = '<div class="note info">La estación ' + esc(c.estacionNombre || c.estacionId) + ' todavía no trajo lecturas de sonda de humedad. Tocá "Traer de la estación" en la pestaña Agua; si la estación no tiene sonda, acá no va a aparecer nada.</div>'; return; }
    if (!fs.length) fs = todas.slice(-30);
    var sensTodos = sensoresDe(todas), sens = cfg.sensores && cfg.sensores.length ? cfg.sensores.filter(function (k) { return sensTodos.indexOf(k) >= 0; }) : sensTodos;
    if (!sens.length) sens = sensTodos;
    var e = estado(c.id, Object.assign({}, cfg, { sensores: sens }));
    var html = htmlEstado(e);
    html += '<div class="stats" style="margin:10px 0;">' + (e ? '<div class="stat"><div class="sl">Zona de raíces hoy</div><div class="sv" style="color:' + (COLOR_ESTADO[e.k] || 'inherit') + ';">' + fmt(e.valor, e.unidad === 'kPa' ? 0 : 1) + ' ' + esc(e.unidad) + '</div><div class="ss">' + fmtF(e.fecha) + '</div></div>' + (e.aguaDisponiblePct != null ? '<div class="stat"><div class="sl">Agua disponible</div><div class="sv">' + e.aguaDisponiblePct + ' %</div><div class="ss">del total entre PMP y CC</div></div>' : '') + (e.diasHastaRecarga != null ? '<div class="stat"><div class="sl">Días hasta la recarga</div><div class="sv">' + e.diasHastaRecarga + '</div><div class="ss">al ritmo de secado actual</div></div>' : '') + (e.ritmo != null ? '<div class="stat"><div class="sl">Ritmo</div><div class="sv">' + (e.ritmo > 0 ? '+' : '') + fmt(e.ritmo, 2) + '</div><div class="ss">por día, sin lluvia</div></div>' : '') : '') + '</div>';
    html += svg(fs, sens, cfg);
    // configuración
    var arc = ultimaArcilla(c.id), tex = texturaPorArcilla(arc);
    var ultAn = B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(c.id) && a.arcilla != null && !a.enPromedio; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).pop();
    var ta = ultAn && window.SafiaBalance && SafiaBalance.texturaPorAnalisis ? SafiaBalance.texturaPorAnalisis(ultAn) : null;
    if (ta) tex = { k: ta.t.k, n: ta.t.nombreLargo, cc: ta.t.cc, pmp: ta.t.pmp };
    html += '<div class="card" style="margin-top:14px;"><div class="card-h"><h3>Configuración de la sonda de este campo</h3><span class="muted">CC = capacidad de campo · PMP = punto de marchitez · FAO-56 [1], UNL [2]</span></div><div class="form-grid">' +
      '<div class="field"><label>Unidad de la sonda</label><select id="humUnidad"><option value="vwc"' + (cfg.unidad === 'vwc' ? ' selected' : '') + '>Humedad volumétrica (% vol) — sondas capacitivas</option><option value="kpa"' + (cfg.unidad === 'kpa' ? ' selected' : '') + '>Tensión (kPa) — Watermark</option></select></div>' +
      '<div class="field"><label>Capacidad de campo (% vol)</label><input type="number" id="humCC" step="0.5" value="' + (cfg.cc != null ? cfg.cc : '') + '"><span class="hint">' + (tex ? 'Por textura (' + fmt(arc, 0) + ' % arcilla → ' + tex.n.split(' (')[0] + '): CC ' + tex.cc + ' · PMP ' + tex.pmp + ' [1]. ' : '') + 'Mejor: el valor que marca la sonda 1–2 días después de una lluvia grande.</span></div>' +
      '<div class="field"><label>Punto de marchitez (% vol)</label><input type="number" id="humPMP" step="0.5" value="' + (cfg.pmp != null ? cfg.pmp : '') + '"></div>' +
      '<div class="field"><label>Agotamiento permitido (%)</label><input type="number" id="humAgot" step="5" min="20" max="80" value="' + cfg.agotamiento + '"><span class="hint">Soja 50, maíz 55, girasol 45 (FAO-56 / UNL) [1][2]</span></div>' +
      '<div class="field"><label>Umbral de riego en kPa (si la sonda es Watermark)</label><input type="number" id="humKpa" step="5" value="' + cfg.kpaRiego + '"><span class="hint">30–60 kPa en suelos medios; más alto en arcillosos [3]</span></div>' +
      '<div class="field full"><label>Sensores que forman la zona de raíces</label><div style="display:flex;gap:10px;flex-wrap:wrap;">' + sensTodos.map(function (k) { return '<label style="display:flex;gap:5px;align-items:center;text-transform:none;letter-spacing:0;font-weight:500;"><input type="checkbox" class="humSens" value="' + esc(k) + '"' + (sens.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(k) + '</label>'; }).join('') + '</div><span class="hint">Dejá marcadas las profundidades donde están las raíces del cultivo (soja y maíz: hasta 60 cm); el promedio de esas es el que decide.</span></div>' +
      '</div><div class="form-actions">' + (tex ? '<button class="btn" id="btnHumTextura">Usar CC y PMP por textura (' + tex.cc + ' / ' + tex.pmp + ')</button>' : '') + '<span class="spacer" style="flex:1"></span><button class="btn green" id="btnHumGuardar">Guardar configuración</button></div></div>';
    html += '<div class="muted" style="font-size:11px;margin-top:8px;">[1] FAO-56 Tabla 19 (CC y PMP por textura) y Tabla 22 (fracción agotable) · [2] UNL G1367, Irrigating Soybean (agotamiento 50 %, críticos R3–R6) · [3] Guías UNL/Irrometer para sensores de tensión. La sonda mide donde está clavada: si el lote es desparejo, conviene más de una.</div>';
    cont.innerHTML = html;
    if ($('btnHumTextura')) $('btnHumTextura').addEventListener('click', function () { $('humCC').value = tex.cc; $('humPMP').value = tex.pmp; });
    $('btnHumGuardar').addEventListener('click', function () {
      var nueva = { unidad: $('humUnidad').value, cc: num($('humCC').value), pmp: num($('humPMP').value), agotamiento: num($('humAgot').value) != null ? num($('humAgot').value) : 50, kpaRiego: num($('humKpa').value) != null ? num($('humKpa').value) : 50, sensores: Array.prototype.map.call(cont.querySelectorAll('.humSens:checked'), function (x) { return x.value; }) };
      if (nueva.unidad === 'vwc' && nueva.cc != null && nueva.pmp != null && nueva.pmp >= nueva.cc) { B().toast('El punto de marchitez tiene que ser menor que la capacidad de campo', true); return; }
      guardarConfig(c, nueva); B().toast('Configuración de la sonda guardada'); pintar();
    });
  }
  function ultimaArcilla(campoId) {
    var l = B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campoId) && a.arcilla != null && !a.enPromedio; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    return l.length ? num(l[l.length - 1].arcilla) : null;
  }
  function activar() {
    if (!B() || !$('panel-humedad')) return;
    if (!iniciado) { iniciado = true; if ($('humDias')) $('humDias').addEventListener('change', pintar); }
    pintar();
  }
  function alCambiarCampo() { if (iniciado && $('panel-humedad').classList.contains('on')) pintar(); }

  window.SafiaHumedad = { activar: activar, alCambiarCampo: alCambiarCampo, estado: estado, htmlResumen: htmlResumen, htmlEstado: htmlEstado, config: config, umbrales: umbrales, TEXTURAS: TEXTURAS, texturaPorArcilla: texturaPorArcilla, AGOTAMIENTO: AGOTAMIENTO };
})();
