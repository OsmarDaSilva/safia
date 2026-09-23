/* SAFIA — Motor de agua por etapa (balance hídrico diario FAO-56 + respuesta del rinde FAO-33)
   -------------------------------------------------------------------
   Para cada campaña de un lote reconstruye, día por día, cuánta agua tenía
   el suelo en la zona de raíces y cuánto pudo transpirar el cultivo, y con
   eso dice en qué etapa faltó agua y cuánto rinde costó.

   Método (FAO-56, Allen et al. 1998, cap. 6–8):
   - ETc = Kc × ET0. Kc por etapa (inicial, desarrollo, media, final) con la
     duración de cada etapa del catálogo FAO de SAFIA (safia-cultivos-fao.js).
   - Agua total disponible TAW = 1000 × (θCC − θPMP) × Zr; la raíz crece de
     0,25 m a Zr máx. durante las etapas inicial y de desarrollo.
   - Agua fácilmente disponible RAW = p × TAW, con p de la Tabla 22 ajustado
     por la demanda: p = p_tabla + 0,04 × (5 − ETc).
   - Balance diario del agotamiento: Dr,i = Dr,i−1 − lluvia − riego + ETa.
     Si Dr > RAW el cultivo sufre: Ks = (TAW − Dr) / ((1 − p) × TAW) y
     ETa = Ks × ETc. El exceso por encima de capacidad de campo percola.
     (Escurrimiento no modelado; se dice en pantalla.)
   Respuesta del rinde (FAO-33, Doorenbos & Kassam 1979, Tabla 24):
     1 − Ya/Ym = Ky × (1 − ETa/ETc) por etapa; entre etapas se multiplica.
     Ky: soja vegetativa 0,2 · floración 0,8 · llenado 1,0 · total 0,85;
     maíz 0,4 · 1,5 · 0,5 · maduración 0,2 · total 1,25; trigo 0,2 · 0,6 ·
     0,5 · total 1,15; girasol 0,25 · 0,5 · 1,0 · 0,8 · total 0,95;
     sorgo 0,2 · 0,55 · 0,45 · 0,2 · total 0,9.
   UNL G1367 (soja bajo riego): agotamiento permitido 50 %, raíces activas
   0–60 cm, etapas críticas R3–R6 (llenado).
   Datos: ET0 y lluvia diarias de la estación del campo (clima_estacion) si
   la hay; si no, Open-Meteo (archivo + pronóstico); la lluvia y el riego
   cargados como eventos del lote mandan sobre el estimado. Suelo: CC y
   PMP de la configuración de la sonda del campo, o por textura (arcilla
   del análisis, FAO-56 Tabla 19), o franco por defecto (25 / 12 % vol).
   Depende de window.SafiaBanco. */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var iniciado = false;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function clave(c) { var n = norm(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }

  /* ---------- constantes con fuente ---------- */
  var KY = {   // FAO-33 Tabla 24
    soja:    { veg: 0.2,  flor: 0.8,  llen: 1.0,  mad: 0.0, total: 0.85 },
    maiz:    { veg: 0.4,  flor: 1.5,  llen: 0.5,  mad: 0.2, total: 1.25 },
    trigo:   { veg: 0.2,  flor: 0.6,  llen: 0.5,  mad: 0.0, total: 1.15 },
    girasol: { veg: 0.25, flor: 0.5,  llen: 1.0,  mad: 0.8, total: 0.95 },
    sorgo:   { veg: 0.2,  flor: 0.55, llen: 0.45, mad: 0.2, total: 0.9 },
    otro:    { veg: 0.3,  flor: 0.8,  llen: 0.7,  mad: 0.2, total: 1.0 }
  };
  var P_TABLA = { soja: 0.5, maiz: 0.55, trigo: 0.55, girasol: 0.45, sorgo: 0.55, otro: 0.5 };          // FAO-56 Tabla 22
  var ZR_MAX = { soja: 0.6, maiz: 1.0, trigo: 1.0, girasol: 0.8, sorgo: 1.0, otro: 0.8 };               // m; límite inferior de FAO-56 Tabla 22 (riego), UNL 0–60 cm en soja
  var ETAPAS = [{ k: 'veg', n: 'Vegetativa' }, { k: 'flor', n: 'Floración' }, { k: 'llen', n: 'Llenado (formación del rinde)' }, { k: 'mad', n: 'Maduración' }];
  var SUELO_DEFECTO = { cc: 25, pmp: 12, origen: 'franco por defecto (FAO-56 Tabla 19)' };

  function fao(cultivo) {
    var lista = []; try { lista = JSON.parse(localStorage.getItem('cultivos_fao') || '[]'); } catch (e) {}
    if (!lista.length && window.TABLA_FAO) lista = window.TABLA_FAO;
    var n = norm(cultivo);
    return lista.find(function (c) { return norm(c.nombre) === n; }) || lista.find(function (c) { return n.indexOf(norm(c.nombre)) === 0 || norm(c.nombre).indexOf(n) === 0; }) || { nombre: cultivo, kc_ini: 0.4, kc_med: 1.15, kc_fin: 0.5, L_ini: 20, L_des: 30, L_med: 60, L_fin: 25 };
  }
  // Kc y etapa fenológica (FAO-33) según los días desde la siembra
  function kcYEtapa(f, dds) {
    var Li = +f.L_ini || 20, Ld = +f.L_des || 30, Lm = +f.L_med || 60, Lf = +f.L_fin || 25;
    var kc, etapa;
    if (dds < Li) { kc = +f.kc_ini; etapa = 'veg'; }
    else if (dds < Li + Ld) { kc = +f.kc_ini + (+f.kc_med - +f.kc_ini) * (dds - Li) / Ld; etapa = 'veg'; }
    else if (dds < Li + Ld + Lm) { kc = +f.kc_med; etapa = (dds - Li - Ld) < Lm * 0.4 ? 'flor' : 'llen'; }
    else if (dds < Li + Ld + Lm + Lf) { kc = +f.kc_med + (+f.kc_fin - +f.kc_med) * (dds - Li - Ld - Lm) / Lf; etapa = 'mad'; }
    else { kc = +f.kc_fin; etapa = 'mad'; }
    return { kc: Math.round(kc * 100) / 100, etapa: etapa, fin: Li + Ld + Lm + Lf, crecimientoRaiz: Li + Ld };
  }

  /* ---------- datos diarios ---------- */
  function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function cacheSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function coordsDe(campo, lote) {
    var lat = null, lon = null;
    if (lote && lote.poligono && lote.poligono.centro) { lat = num(lote.poligono.centro.lat); lon = num(lote.poligono.centro.lon); }
    if (lat == null && campo) { lat = num(campo.latitud); lon = num(campo.longitud); }
    return lat == null || lon == null ? null : { lat: lat, lon: lon };
  }
  // ET0 + lluvia + temperatura por día: Open-Meteo (archivo hasta hace 6 días, pronóstico para los últimos y próximos 7)
  function meteoDiario(co, desde, hasta) {
    var hoy = hoyISO(), k = 'meteo_' + co.lat.toFixed(3) + '_' + co.lon.toFixed(3) + '|' + desde + '|' + hasta;
    var c = cacheGet(k); if (c && (hasta < sumarDias(hoy, -6) || c.traidoEn === hoy)) return Promise.resolve(c.filas);
    var finArch = hasta < sumarDias(hoy, -6) ? hasta : sumarDias(hoy, -6), pedidos = [];
    if (finArch >= desde) pedidos.push(fetch('https://archive-api.open-meteo.com/v1/archive?latitude=' + co.lat + '&longitude=' + co.lon + '&start_date=' + desde + '&end_date=' + finArch + '&daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_mean&timezone=auto').then(function (r) { return r.json(); }).catch(function () { return null; }));
    if (hasta > finArch) pedidos.push(fetch('https://api.open-meteo.com/v1/forecast?latitude=' + co.lat + '&longitude=' + co.lon + '&daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_mean&past_days=10&forecast_days=7&timezone=auto').then(function (r) { return r.json(); }).catch(function () { return null; }));
    return Promise.all(pedidos).then(function (rs) {
      var por = {};
      rs.forEach(function (j) { var d = j && j.daily; if (!d || !d.time) return; d.time.forEach(function (f, i) { if (f < desde || f > sumarDias(hasta, 7)) return; if (!por[f]) por[f] = { fecha: f }; if (por[f].et0 == null && d.et0_fao_evapotranspiration) por[f].et0 = d.et0_fao_evapotranspiration[i]; if (por[f].lluvia == null && d.precipitation_sum) por[f].lluvia = d.precipitation_sum[i]; if (por[f].tmedia == null && d.temperature_2m_mean) por[f].tmedia = d.temperature_2m_mean[i]; }); });
      var filas = Object.keys(por).sort().map(function (f) { return por[f]; });
      cacheSet(k, { traidoEn: hoy, filas: filas });
      return filas;
    });
  }
  // Serie diaria final para el balance: estación > Open-Meteo; lluvia y riego de los eventos del lote
  function datosDiarios(campo, lote, desde, hasta) {
    var est = (window.SafiaSensores && campo && campo.estacionId) ? SafiaSensores.climaDeEstacion(campo.id, desde, hasta) : [];
    var porEst = {}; est.forEach(function (r) { porEst[r.fecha] = r; });
    var co = coordsDe(campo, lote);
    var faltan = diasEntre(desde, hasta) + 1 - est.filter(function (r) { return r.et0 != null; }).length;
    var meteo = (faltan > 0 && co) ? meteoDiario(co, desde, hasta) : Promise.resolve([]);
    return meteo.then(function (om) {
      var porOm = {}; om.forEach(function (r) { porOm[r.fecha] = r; });
      var evs = B().leer('eventos').filter(function (e) { return String(e.equipoId) === String(lote.id) && (e.tipo === 'lluvia' || e.tipo === 'riego') && e.fecha; });
      var llEv = {}, riEv = {}, hayLluviaEv = false;
      evs.forEach(function (e) { var f = String(e.fecha).slice(0, 10); if (f < desde || f > sumarDias(hasta, 7)) return; var mm = num(e.cantidad) || 0; if (e.tipo === 'lluvia') { llEv[f] = (llEv[f] || 0) + mm; hayLluviaEv = true; } else riEv[f] = (riEv[f] || 0) + mm; });
      var filas = [], fuentes = { estacion: 0, openMeteo: 0, pronostico: 0 }, hoy = hoyISO();
      for (var f = desde; f <= hasta; f = sumarDias(f, 1)) {
        var e = porEst[f], o = porOm[f];
        var et0 = e && e.et0 != null ? e.et0 : (o ? o.et0 : null);
        var lluvia = hayLluviaEv ? (llEv[f] || 0) : (e && e.lluvia != null ? e.lluvia : (o && o.lluvia != null ? o.lluvia : 0));
        if (e && e.et0 != null) fuentes.estacion++; else if (o && o.et0 != null) { if (f > hoy) fuentes.pronostico++; else fuentes.openMeteo++; }
        filas.push({ fecha: f, et0: et0, lluvia: lluvia, riego: riEv[f] || 0, tmedia: e && e.tmedia != null ? e.tmedia : (o ? o.tmedia : null), pronostico: f > hoy });
      }
      return { filas: filas, fuentes: fuentes, lluviaDeEventos: hayLluviaEv };
    });
  }
  function sueloDe(campo) {
    var s = campo && campo.sonda;
    if (s && num(s.cc) != null && num(s.pmp) != null && (s.unidad || 'vwc') === 'vwc') return { cc: num(s.cc), pmp: num(s.pmp), origen: 'configuración de la sonda del campo' };
    var an = B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campo.id) && num(a.arcilla) != null && !a.enPromedio; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    if (an.length && window.SafiaHumedad) { var t = SafiaHumedad.texturaPorArcilla(num(an[an.length - 1].arcilla)); if (t) return { cc: t.cc, pmp: t.pmp, origen: 'textura del análisis (' + fmt(num(an[an.length - 1].arcilla), 0) + ' % arcilla, FAO-56 Tabla 19)' }; }
    return SUELO_DEFECTO;
  }

  /* ---------- balance ---------- */
  function balance(filas, cultivo, suelo, opciones) {
    opciones = opciones || {};
    var cu = clave(cultivo), f = fao(cultivo), ky = KY[cu] || KY.otro, pTab = P_TABLA[cu] || 0.5, zrMax = opciones.zrMax || ZR_MAX[cu] || 0.8;
    var theta = Math.max(0.02, (suelo.cc - suelo.pmp) / 100);
    var dias = [], dr = null, etap = {}; ETAPAS.forEach(function (e) { etap[e.k] = { k: e.k, n: e.n, dias: 0, etc: 0, eta: 0, diasEstres: 0, lluvia: 0, riego: 0 }; });
    var episodios = [], epi = null, riegoRestante = opciones.riegoDeclarado > 0 ? opciones.riegoDeclarado : 0, lamina = opciones.lamina || 20, riegoRepartido = 0;
    filas.forEach(function (r, i) {
      var ke = kcYEtapa(f, i), zr = i < ke.crecimientoRaiz ? 0.25 + (zrMax - 0.25) * i / ke.crecimientoRaiz : zrMax;
      var taw = 1000 * theta * zr, et0 = r.et0 != null ? r.et0 : 0, etc = ke.kc * et0;
      var p = Math.max(0.1, Math.min(0.8, pTab + 0.04 * (5 - etc))), raw = p * taw;
      if (dr == null) dr = Math.min(taw, raw * (opciones.agotamientoInicial != null ? opciones.agotamientoInicial : 0.5));   // arranca con la mitad del agua fácilmente disponible ya consumida
      dr = Math.min(taw, dr);   // la raíz creció: el agotamiento no puede superar la reserva
      if (riegoRestante > 0 && dr > raw && !r.pronostico && !r.riego) { var apl = Math.min(lamina, riegoRestante); r = Object.assign({}, r, { riego: apl, riegoRepartido: true }); riegoRestante -= apl; riegoRepartido += apl; }
      var ks = dr > raw ? Math.max(0, (taw - dr) / ((1 - p) * taw)) : 1, eta = ks * etc;
      var drFin = dr - r.lluvia - r.riego + eta, dp = 0;
      if (drFin < 0) { dp = -drFin; drFin = 0; }
      if (drFin > taw) drFin = taw;
      var d = { fecha: r.fecha, dds: i, etapa: ke.etapa, kc: ke.kc, et0: et0, etc: Math.round(etc * 100) / 100, eta: Math.round(eta * 100) / 100, ks: Math.round(ks * 100) / 100, dr: Math.round(drFin * 10) / 10, taw: Math.round(taw), raw: Math.round(raw), disponible: Math.round((taw - drFin) * 10) / 10, lluvia: r.lluvia, riego: r.riego, riegoRepartido: !!r.riegoRepartido, dp: Math.round(dp * 10) / 10, pronostico: !!r.pronostico };
      dias.push(d);
      var s = etap[ke.etapa]; s.dias++; s.etc += etc; s.eta += eta; s.lluvia += r.lluvia; s.riego += r.riego; if (ks < 1) s.diasEstres++;
      if (ks < 1 && !r.pronostico) { if (!epi) { epi = { desde: r.fecha, hasta: r.fecha, dias: 1, etapa: ke.etapa, faltaMM: Math.round(dr - raw), ksMin: ks }; episodios.push(epi); } else { epi.hasta = r.fecha; epi.dias++; epi.ksMin = Math.min(epi.ksMin, ks); } }
      else epi = null;
      dr = drFin;
    });
    var factor = 1, etapas = ETAPAS.map(function (e) {
      var s = etap[e.k], deficit = s.etc > 0 ? Math.max(0, 1 - s.eta / s.etc) : 0, perd = Math.min(0.95, (ky[e.k] || 0) * deficit);
      factor *= (1 - perd);
      return { k: e.k, n: e.n, dias: s.dias, etc: Math.round(s.etc), eta: Math.round(s.eta), deficitPct: Math.round(deficit * 100), ky: ky[e.k], perdidaPct: Math.round(perd * 1000) / 10, diasEstres: s.diasEstres, lluvia: Math.round(s.lluvia), riego: Math.round(s.riego) };
    });
    return { cultivo: cultivo, cu: cu, fao: f, suelo: suelo, ky: ky, dias: dias, etapas: etapas, riegoRepartido: Math.round(riegoRepartido), riegoDeclarado: opciones.riegoDeclarado || 0, relacionRinde: Math.round(factor * 1000) / 1000, perdidaPct: Math.round((1 - factor) * 1000) / 10, episodios: episodios,
      totales: { etc: Math.round(dias.reduce(function (a, d) { return a + d.etc; }, 0)), eta: Math.round(dias.reduce(function (a, d) { return a + d.eta; }, 0)), lluvia: Math.round(dias.reduce(function (a, d) { return a + d.lluvia; }, 0)), riego: Math.round(dias.reduce(function (a, d) { return a + d.riego; }, 0)), percolado: Math.round(dias.reduce(function (a, d) { return a + d.dp; }, 0)) } };
  }
  // Campañas del lote (una por cultivo de cada campaña)
  function campanasDelLote(equipoId) {
    var salida = [];
    B().leer('campanas').forEach(function (c) {
      if (String(c.equipoId) !== String(equipoId)) return;
      (c.cultivos || []).forEach(function (cu, i) {
        if (!cu || !cu.fechaSiembra) return;
        var cos = (c.cosechas && c.cosechas[i] && c.cosechas[i].fecha) || (i === 0 && c.cosecha && c.cosecha.fecha) || null;
        var cosObj = (c.cosechas && c.cosechas[i]) || (i === 0 ? c.cosecha : null) || {};
        salida.push({ id: c.id + '_' + i, nombre: c.nombre || '', cultivo: cu.cultivo || '—', siembra: String(cu.fechaSiembra).slice(0, 10), cosecha: cos ? String(cos).slice(0, 10) : null, cosechaEstimada: cu.fechaCosecha ? String(cu.fechaCosecha).slice(0, 10) : null, rinde: num(cu.rendimientoReal), riegoDeclarado: num(cosObj.riegoMM), lluviaDeclarada: num(cosObj.lluviaMM), abierta: !cos });
      });
    });
    return salida.sort(function (a, b) { return b.siembra.localeCompare(a.siembra); });
  }
  function finDe(c) { var f = fao(c.cultivo); return c.cosecha || c.cosechaEstimada || sumarDias(c.siembra, (+f.L_ini || 20) + (+f.L_des || 30) + (+f.L_med || 60) + (+f.L_fin || 25)); }
  // Calcula el balance de una campaña del lote; si está en curso, incluye 7 días de pronóstico
  function calcular(campo, lote, camp) {
    var hoy = hoyISO(), fin = finDe(camp), hasta = camp.abierta ? (fin > sumarDias(hoy, 7) ? sumarDias(hoy, 7) : fin) : fin;
    return datosDiarios(campo, lote, camp.siembra, hasta).then(function (d) {
      var hayRiegoEv = d.filas.some(function (x) { return x.riego > 0; });
      var res = balance(d.filas, camp.cultivo, sueloDe(campo), { riegoDeclarado: !hayRiegoEv && camp.riegoDeclarado > 0 ? camp.riegoDeclarado : 0 });
      res.campana = camp; res.fuentes = d.fuentes; res.lluviaDeEventos = d.lluviaDeEventos; res.lote = lote;
      if (camp.abierta && fin >= hoy) {
        var reales = res.dias.filter(function (x) { return !x.pronostico; }), ult = reales[reales.length - 1];
        var futuros = res.dias.filter(function (x) { return x.pronostico; }), cruce = futuros.find(function (x) { return x.dr > x.raw; });
        res.hoy = ult ? { fecha: ult.fecha, dds: ult.dds, etapa: ult.etapa, disponible: ult.disponible, dr: ult.dr, raw: ult.raw, taw: ult.taw, ks: ult.ks, faltaParaRecarga: Math.round(ult.raw - ult.dr) } : null;
        res.pronostico = { dias: futuros.length, lluvia: Math.round(futuros.reduce(function (a, x) { return a + x.lluvia; }, 0)), etc: Math.round(futuros.reduce(function (a, x) { return a + x.etc; }, 0)), cruzaRecarga: cruce ? cruce.fecha : null, mmParaLlegarACC: ult ? Math.round(ult.dr) : null };
      }
      return res;
    });
  }

  /* ---------- HTML ---------- */
  var NOMBRE_ETAPA = { veg: 'Vegetativa', flor: 'Floración', llen: 'Llenado', mad: 'Maduración' };
  function svg(res) {
    var W = 900, H = 260, ml = 44, mr = 16, mt = 16, mb = 34, ds = res.dias; if (ds.length < 2) return '';
    var maxV = Math.max.apply(null, ds.map(function (d) { return d.taw; })) * 1.05, f0 = ds[0].fecha, f1 = ds[ds.length - 1].fecha, n = Math.max(1, diasEntre(f0, f1));
    var x = function (f) { return ml + (W - ml - mr) * diasEntre(f0, f) / n; }, y = function (v) { return mt + (H - mt - mb) * (1 - Math.max(0, Math.min(maxV, v)) / maxV); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
    // fondo por etapa
    var ini = 0; for (var i = 1; i <= ds.length; i++) { if (i === ds.length || ds[i].etapa !== ds[ini].etapa) { var col = { veg: '#178029', flor: '#B8731A', llen: '#B3261E', mad: '#8C9196' }[ds[ini].etapa]; s += '<rect x="' + x(ds[ini].fecha) + '" y="' + mt + '" width="' + (x(ds[i - 1].fecha) - x(ds[ini].fecha)) + '" height="' + (H - mt - mb) + '" fill="' + col + '" opacity="0.05"/><text x="' + ((x(ds[ini].fecha) + x(ds[i - 1].fecha)) / 2) + '" y="' + (mt + 11) + '" font-size="10" fill="' + col + '" text-anchor="middle">' + NOMBRE_ETAPA[ds[ini].etapa] + '</text>'; ini = i; } }
    // TAW y umbral RAW (agua fácilmente disponible = TAW − RAW)
    s += '<path d="M' + ds.map(function (d) { return x(d.fecha) + ' ' + y(d.taw); }).join(' L') + '" fill="none" stroke="#2E72C8" stroke-dasharray="4 3"/>';
    s += '<path d="M' + ds.map(function (d) { return x(d.fecha) + ' ' + y(d.taw - d.raw); }).join(' L') + '" fill="none" stroke="#B3261E" stroke-dasharray="4 3"/>';
    s += '<text x="' + (W - mr - 4) + '" y="' + (y(ds[ds.length - 1].taw) - 4) + '" font-size="10" fill="#2E72C8" text-anchor="end">capacidad de campo (TAW)</text>';
    s += '<text x="' + (W - mr - 4) + '" y="' + (y(ds[ds.length - 1].taw - ds[ds.length - 1].raw) + 12) + '" font-size="10" fill="#B3261E" text-anchor="end">punto de recarga</text>';
    // lluvia y riego
    var maxP = Math.max.apply(null, ds.map(function (d) { return Math.max(d.lluvia, d.riego); }).concat([1]));
    ds.forEach(function (d) { if (d.lluvia > 0) { var h = Math.min(60, 60 * d.lluvia / maxP); s += '<rect x="' + (x(d.fecha) - 1.5) + '" y="' + (H - mb - h) + '" width="3" height="' + h + '" fill="#2E72C8" opacity="0.35"><title>' + fmtF(d.fecha) + ' lluvia ' + fmt(d.lluvia, 1) + ' mm</title></rect>'; } if (d.riego > 0) { var h2 = Math.min(60, 60 * d.riego / maxP); s += '<rect x="' + (x(d.fecha) + 1.5) + '" y="' + (H - mb - h2) + '" width="3" height="' + h2 + '" fill="#178029" opacity="0.6"><title>' + fmtF(d.fecha) + ' riego ' + fmt(d.riego, 1) + ' mm</title></rect>'; } });
    // agua disponible
    var reales = ds.filter(function (d) { return !d.pronostico; }), fut = ds.filter(function (d) { return d.pronostico; });
    s += '<path d="M' + reales.map(function (d) { return x(d.fecha) + ' ' + y(d.disponible); }).join(' L') + '" fill="none" stroke="#0F3D14" stroke-width="2.2"/>';
    if (fut.length) s += '<path d="M' + [reales[reales.length - 1]].concat(fut).map(function (d) { return x(d.fecha) + ' ' + y(d.disponible); }).join(' L') + '" fill="none" stroke="#0F3D14" stroke-width="2" stroke-dasharray="3 3" opacity="0.7"/>';
    ds.forEach(function (d) { if (d.ks < 1 && !d.pronostico) s += '<circle cx="' + x(d.fecha) + '" cy="' + y(d.disponible) + '" r="2.5" fill="#B3261E"><title>' + fmtF(d.fecha) + ' · estrés (Ks ' + fmt(d.ks, 2) + ') · ' + NOMBRE_ETAPA[d.etapa] + '</title></circle>'; });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (q) { var v = maxV * q; s += '<text x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" font-size="10" fill="#8C9196" text-anchor="end">' + fmt(v, 0) + '</text>'; });
    s += '<text x="' + (W / 2) + '" y="' + (H - 4) + '" font-size="11" fill="#8C9196" text-anchor="middle">agua disponible en la zona de raíces (mm) · barras: lluvia (azul) y riego (verde) · puntos rojos: días con estrés</text></svg>';
    return s;
  }
  function htmlResultado(res) {
    var c = res.campana, h = '';
    var rindeSin = c.rinde && res.relacionRinde > 0 ? Math.round(c.rinde / res.relacionRinde) : null;
    h += '<div class="statbar" style="margin:0 0 8px;">' +
      '<div class="stat"><div class="sl">Demanda del cultivo (ETc)</div><div class="sv">' + fmt(res.totales.etc) + ' mm</div></div>' +
      '<div class="stat"><div class="sl">Lo que pudo usar (ETa)</div><div class="sv">' + fmt(res.totales.eta) + ' mm</div></div>' +
      '<div class="stat"><div class="sl">Lluvia + riego</div><div class="sv">' + fmt(res.totales.lluvia) + ' + ' + fmt(res.totales.riego) + '</div><div class="ss">percolado ' + fmt(res.totales.percolado) + ' mm</div></div>' +
      '<div class="stat"><div class="sl">Rinde perdido por falta de agua</div><div class="sv ' + (res.perdidaPct >= 10 ? 'red' : (res.perdidaPct >= 3 ? '' : 'green')) + '">' + fmt(res.perdidaPct, 1) + ' %</div><div class="ss">FAO-33, por etapa</div></div>' +
      (c.rinde ? '<div class="stat"><div class="sl">Rinde real → sin estrés hídrico</div><div class="sv">' + fmt(c.rinde) + ' → ' + fmt(rindeSin) + '</div><div class="ss">kg/ha, estimado</div></div>' : '') + '</div>';
    if (res.hoy) {
      var hoy = res.hoy, pr = res.pronostico, tono = hoy.ks < 1 ? 'warn' : (hoy.faltaParaRecarga <= 10 || pr.cruzaRecarga ? 'warn' : 'info');
      h += '<div class="note ' + tono + '"><b>Consultor en vivo · agua.</b> Hoy (' + fmtF(hoy.fecha) + ', día ' + hoy.dds + ', ' + NOMBRE_ETAPA[hoy.etapa].toLowerCase() + ') la zona de raíces tiene <b>' + fmt(hoy.disponible) + ' mm</b> disponibles de ' + fmt(hoy.taw) + '; ' +
        (hoy.ks < 1 ? 'el cultivo <b>ya está en estrés</b> (Ks ' + fmt(hoy.ks, 2) + '): regar hoy ' + fmt(hoy.dr) + ' mm para volver a capacidad de campo.' : 'faltan <b>' + fmt(hoy.faltaParaRecarga) + ' mm</b> para el punto de recarga.') +
        ' Próximos ' + pr.dias + ' días: demanda ' + fmt(pr.etc) + ' mm, lluvia prevista ' + fmt(pr.lluvia) + ' mm' + (pr.cruzaRecarga ? ' → <b>llega al punto de recarga el ' + fmtF(pr.cruzaRecarga) + '</b>: programar el riego antes' + (hoy.etapa === 'flor' || hoy.etapa === 'llen' ? ' (etapa crítica: cada día de déficit pesa ' + (res.ky[hoy.etapa] || 0) + ' de Ky)' : '') + '.' : ' → sin llegar al punto de recarga.') + '</div>';
    }
    h += svg(res);
    h += '<div class="tablewrap" style="margin-top:8px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>Etapa</th><th class="r">Días</th><th class="r">Demanda ETc</th><th class="r">Usó ETa</th><th class="r">Déficit</th><th class="r">Días con estrés</th><th class="r">Lluvia + riego</th><th class="r">Ky</th><th class="r">Rinde perdido</th></tr></thead><tbody>' +
      res.etapas.filter(function (e) { return e.dias > 0; }).map(function (e) { return '<tr><td><b>' + esc(e.n) + '</b></td><td class="r">' + e.dias + '</td><td class="r">' + fmt(e.etc) + '</td><td class="r">' + fmt(e.eta) + '</td><td class="r" style="' + (e.deficitPct >= 20 ? 'color:#B3261E;font-weight:700;' : '') + '">' + e.deficitPct + ' %</td><td class="r">' + e.diasEstres + '</td><td class="r">' + fmt(e.lluvia) + ' + ' + fmt(e.riego) + '</td><td class="r">' + e.ky + '</td><td class="r" style="' + (e.perdidaPct >= 5 ? 'color:#B3261E;font-weight:700;' : '') + '">' + fmt(e.perdidaPct, 1) + ' %</td></tr>'; }).join('') + '</tbody></table></div></div>';
    if (res.riegoRepartido > 0) h += '<div class="note info" style="margin-top:8px;">La cosecha declara <b>' + fmt(res.riegoDeclarado) + ' mm de riego</b> pero el lote no tiene riegos cargados por fecha: el balance los repartió en láminas de 20 mm en los días en que el suelo llegó al punto de recarga (' + fmt(res.riegoRepartido) + ' mm usados). Cargando los riegos en Eventos con su fecha, el balance usa los reales.</div>';
    if (res.episodios.length) h += '<div style="margin-top:8px;font-size:13px;"><b>Cuándo faltó agua:</b> ' + res.episodios.map(function (e) { return fmtF(e.desde) + (e.dias > 1 ? ' al ' + fmtF(e.hasta) + ' (' + e.dias + ' días)' : '') + ' en ' + NOMBRE_ETAPA[e.etapa].toLowerCase() + (e.faltaMM > 0 ? ', hacían falta ~' + fmt(e.faltaMM) + ' mm al empezar' : ''); }).join(' · ') + '.</div>';
    else h += '<div style="margin-top:8px;font-size:13px;color:#178029;"><b>Sin días de estrés hídrico</b> en toda la campaña según el balance.</div>';
    h += '<div class="muted" style="font-size:11px;margin-top:8px;">Suelo: CC ' + fmt(res.suelo.cc) + ' % · PMP ' + fmt(res.suelo.pmp) + ' % (' + esc(res.suelo.origen) + ') · raíz hasta ' + fmt((ZR_MAX[res.cu] || 0.8) * 100) + ' cm · datos: ' + (res.fuentes.estacion ? res.fuentes.estacion + ' días de estación' : '') + (res.fuentes.openMeteo ? (res.fuentes.estacion ? ', ' : '') + res.fuentes.openMeteo + ' días de Open-Meteo' : '') + (res.fuentes.pronostico ? ', ' + res.fuentes.pronostico + ' de pronóstico' : '') + ' · lluvia ' + (res.lluviaDeEventos ? 'de los eventos del lote' : 'estimada del clima') + ' · riego de los eventos del lote. Método FAO-56 (balance diario, Kc por etapa, agotamiento permitido ' + Math.round((P_TABLA[res.cu] || 0.5) * 100) + ' %) y FAO-33 (Ky por etapa); sin escurrimiento ni napa; arranca con la mitad del agua fácil consumida. Es una estimación para decidir, no una medición: la sonda de humedad la reemplaza cuando existe.</div>';
    return h;
  }

  /* ---------- UI (Banco → Agua) ---------- */
  function lotesDelCampo() { var c = B().campoActual(); return c ? B().leer('equipos').filter(function (e) { return String(e.campoId) === String(c.id); }) : []; }
  function llenar() {
    var sl = $('balLote'), sc = $('balCampana'); if (!sl) return;
    var lotes = lotesDelCampo(), v = sl.value;
    sl.innerHTML = lotes.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join('');
    if (v && lotes.some(function (e) { return String(e.id) === v; })) sl.value = v;
    llenarCampanas();
  }
  function llenarCampanas() {
    var sl = $('balLote'), sc = $('balCampana'); if (!sc) return;
    var camps = campanasDelLote(sl.value);
    sc.innerHTML = camps.length ? camps.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.cultivo) + ' · ' + esc(c.nombre) + ' · siembra ' + fmtF(c.siembra) + (c.rinde ? ' · ' + fmt(c.rinde) + ' kg/ha' : ' · en curso') + '</option>'; }).join('') : '<option value="">— sin campañas con siembra —</option>';
  }
  function correr() {
    var campo = B().campoActual(), lote = lotesDelCampo().find(function (e) { return String(e.id) === $('balLote').value; }), camp = campanasDelLote($('balLote').value).find(function (c) { return c.id === $('balCampana').value; });
    var out = $('balResultado'); if (!campo || !lote || !camp) { B().toast('Elegí lote y campaña', true); return; }
    out.innerHTML = '<div class="muted">Calculando el balance día por día…</div>';
    calcular(campo, lote, camp).then(function (res) { out.innerHTML = htmlResultado(res); }).catch(function (e) { console.error(e); out.innerHTML = '<div class="note warn">No se pudo calcular: ' + esc(e.message) + '</div>'; });
  }
  function activar() {
    if (!B() || !$('balLote')) return;
    if (!iniciado) { iniciado = true; $('balLote').addEventListener('change', llenarCampanas); $('btnBalance').addEventListener('click', correr); }
    llenar();
  }
  function alCambiarCampo() { if (iniciado) { llenar(); if ($('balResultado')) $('balResultado').innerHTML = ''; } }

  window.SafiaAgua = { activar: activar, alCambiarCampo: alCambiarCampo, calcular: calcular, balance: balance, htmlResultado: htmlResultado, campanasDelLote: campanasDelLote, kcYEtapa: kcYEtapa, KY: KY, P_TABLA: P_TABLA, ZR_MAX: ZR_MAX, sueloDe: sueloDe };
})();
