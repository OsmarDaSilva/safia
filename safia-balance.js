/* =====================================================================
   SAFIA · Motor de agua (FAO-56) — FUENTE ÚNICA DE VERDAD
   ---------------------------------------------------------------------
   Una sola física para toda la app. La usan:
     - Operación (index, operador, encargado, propietario, clima,
       predicción) con SafiaBalance.simular(): estado de HOY y semáforo.
     - Banco → Agua (safia-agua.js): la misma física día por día desde la
       siembra, con la respuesta del rinde por etapa (FAO-33).
     - Banco → Humedad de suelo (safia-humedad.js): mismas texturas.

   Método (FAO-56, Allen et al. 1998, cap. 6–8):
     ETc = Kc × ET0, con Kc por etapa (inicial, desarrollo, media, final)
       y las duraciones del catálogo FAO de SAFIA (safia-cultivos-fao.js).
     Agua total disponible TAW = 1000 × (θCC − θPMP) × Zr. La raíz crece
       de 0,25 m hasta Zr máx. durante las etapas inicial y de desarrollo.
     Agua fácilmente disponible RAW = p × TAW, con p de la Tabla 22
       ajustado por la demanda: p = p_tabla + 0,04 × (5 − ETc).
     Agotamiento diario: Dr,i = Dr,i−1 − lluvia − riego neto + ETa.
       Si Dr > RAW el cultivo sufre: Ks = (TAW − Dr) / ((1 − p) × TAW),
       ETa = Ks × ETc. Lo que sobra por encima de capacidad de campo
       percola (DP). Escurrimiento: FAO-56 lo desprecia en terreno plano
       bajo riego; no se modela y se dice en pantalla.
     Riego: los eventos se guardan en mm BRUTOS (lo que aplicó el equipo);
       el riego neto = bruto × eficiencia del equipo, aplicada UNA vez acá.
   Suelo (θCC y θPMP en % volumétrico), en este orden:
     1) configuración de la sonda del campo (campo.sonda, unidad vwc),
     2) textura por el % de arcilla del último análisis de suelo del campo
        (FAO-56 Tabla 19),
     3) el tipo de suelo cargado en Campos (misma tabla),
     4) franco por defecto (25 / 12 % vol) — se avisa.
   Datos diarios: lluvia y ET0 medidas por la estación del campo
     (clima_estacion) mandan sobre Open-Meteo; un evento de lluvia cargado
     a mano pisa el estimado de ese día. Si la estación tiene sonda de
     humedad configurada, la lectura medida reemplaza al modelo ese día.
   Umbral de riego: regar cuando Dr > RAW, es decir cuando queda menos del
     (1 − p) × 100 % del agua disponible (soja 50 %, maíz 45 %; UNL G1367:
     soja 50 % de agotamiento permitido, raíces activas 0–60 cm).
   ===================================================================== */
(function (root) {
  'use strict';

  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function leerLS(k) { if (typeof localStorage === 'undefined') return []; try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }

  // ---- Suelo: humedad volumétrica a capacidad de campo y marchitez por textura (FAO-56 Tabla 19) ----
  var TEXTURAS = [
    { k: 'arenoso',          nombre: 'Arenoso',          nombreLargo: 'Arenoso (< 15 % arcilla, mucha arena)', cc: 12, pmp: 4,  emoji: '🏖️' },
    { k: 'franco_arenoso',   nombre: 'Franco arenoso',   nombreLargo: 'Franco arenoso (15–20 % arcilla)',      cc: 15, pmp: 6,  emoji: '🌾' },
    { k: 'franco',           nombre: 'Franco',           nombreLargo: 'Franco (20–30 % arcilla)',              cc: 25, pmp: 12, emoji: '🌱' },
    { k: 'franco_arcilloso', nombre: 'Franco arcilloso', nombreLargo: 'Franco arcilloso (30–40 % arcilla)',    cc: 28, pmp: 13, emoji: '🟫' },
    { k: 'arcilloso',        nombre: 'Arcilloso',        nombreLargo: 'Arcilloso (> 40 % arcilla)',            cc: 36, pmp: 22, emoji: '🧱' },
    // Limosos (típicos del Chaco Central y de los aluviones del Pilcomayo). Punto medio de FAO-56 Tabla 19, igual que los de arriba.
    { k: 'franco_limoso',         nombre: 'Franco limoso',         nombreLargo: 'Franco limoso (limo 50–80 %, arcilla < 27 %)',        cc: 29, pmp: 15, emoji: '' },
    { k: 'limoso',                nombre: 'Limoso',                nombreLargo: 'Limoso (limo ≥ 80 %, arcilla < 12 %)',               cc: 32, pmp: 17, emoji: '' },
    { k: 'franco_arcillo_limoso', nombre: 'Franco arcillo limoso', nombreLargo: 'Franco arcillo limoso (arcilla 27–40 %, arena < 20 %)', cc: 34, pmp: 21, emoji: '' },
    { k: 'arcillo_limoso',        nombre: 'Arcillo limoso',        nombreLargo: 'Arcillo limoso (arcilla ≥ 40 %, limo ≥ 40 %)',       cc: 36, pmp: 23, emoji: '' }
  ];
  /* Clase textural por el triángulo del USDA (Soil Survey Manual) con arena, limo y arcilla del análisis.
     Las clases sin fila propia en FAO-56 Tabla 19 van a la más cercana: franco arenoso y areno franco → franco_arenoso,
     franco arcillo arenoso y franco arcilloso → franco_arcilloso, arcillo arenoso → arcilloso. Devuelve null si falta el limo. */
  function claseUSDA(arena, limo, arcilla) {
    var S = num(arena), L = num(limo), C = num(arcilla);
    if (C == null) return null;
    if (L == null && S != null) L = 100 - S - C;
    if (S == null && L != null) S = 100 - L - C;
    if (L == null || S == null || S < 0 || L < 0) return null;
    if (S > 85 && L + 1.5 * C < 15) return 'arena';
    if (S >= 70 && S <= 91 && L + 1.5 * C >= 15 && L + 2 * C < 30) return 'areno_franco';
    if ((C >= 7 && C < 20 && S > 52 && L + 2 * C >= 30) || (C < 7 && L < 50 && L + 2 * C >= 30)) return 'franco_arenoso';
    if (C >= 7 && C < 27 && L >= 28 && L < 50 && S <= 52) return 'franco';
    if ((L >= 50 && C >= 12 && C < 27) || (L >= 50 && L < 80 && C < 12)) return 'franco_limoso';
    if (L >= 80 && C < 12) return 'limo';
    if (C >= 20 && C < 35 && L < 28 && S > 45) return 'franco_arcillo_arenoso';
    if (C >= 27 && C < 40 && S > 20 && S <= 45) return 'franco_arcilloso';
    if (C >= 27 && C < 40 && S <= 20) return 'franco_arcillo_limoso';
    if (C >= 35 && S > 45) return 'arcillo_arenoso';
    if (C >= 40 && L >= 40) return 'arcillo_limoso';
    if (C >= 40) return 'arcilla';
    return 'franco';
  }
  var USDA_A_SAFIA = { arena: 'arenoso', areno_franco: 'franco_arenoso', franco_arenoso: 'franco_arenoso', franco: 'franco', franco_limoso: 'franco_limoso', limo: 'limoso',
    franco_arcillo_arenoso: 'franco_arcilloso', franco_arcilloso: 'franco_arcilloso', franco_arcillo_limoso: 'franco_arcillo_limoso', arcillo_arenoso: 'arcilloso', arcillo_limoso: 'arcillo_limoso', arcilla: 'arcilloso' };
  var NOMBRE_USDA = { arena: 'arena', areno_franco: 'areno franco', franco_arenoso: 'franco arenoso', franco: 'franco', franco_limoso: 'franco limoso', limo: 'limo',
    franco_arcillo_arenoso: 'franco arcillo arenoso', franco_arcilloso: 'franco arcilloso', franco_arcillo_limoso: 'franco arcillo limoso', arcillo_arenoso: 'arcillo arenoso', arcillo_limoso: 'arcillo limoso', arcilla: 'arcilla' };
  function texturaPorClave(k) { for (var i = 0; i < TEXTURAS.length; i++) if (TEXTURAS[i].k === k) return TEXTURAS[i]; return null; }
  // Textura de un análisis: con arena/limo/arcilla usa el triángulo USDA (reconoce los limosos); solo con arcilla, como antes
  function texturaPorAnalisis(a) {
    if (!a) return null;
    var p = a.parametros || {}, arena = a.arena != null ? a.arena : p.arena, limo = a.limo != null ? a.limo : p.limo, arcilla = a.arcilla != null ? a.arcilla : p.arcilla;
    var clase = claseUSDA(arena, limo, arcilla);
    if (clase) { var t = texturaPorClave(USDA_A_SAFIA[clase]); if (t) return { t: t, clase: NOMBRE_USDA[clase], arcilla: num(arcilla), limo: num(limo) != null ? num(limo) : 100 - num(arena) - num(arcilla) }; }
    var tc = texturaPorArcilla(num(arcilla)); return tc ? { t: tc, clase: null, arcilla: num(arcilla), limo: null } : null;
  }
  function texturaPorArcilla(arc) { if (arc == null || isNaN(arc)) return null; return arc < 15 ? TEXTURAS[0] : (arc < 20 ? TEXTURAS[1] : (arc < 30 ? TEXTURAS[2] : (arc < 40 ? TEXTURAS[3] : TEXTURAS[4]))); }
  var SUELO_FALLBACK = 'franco';
  var ZR_REF = 0.6;   // m; profundidad de referencia para expresar CC/PMP en mm cuando no hay cultivo (UNL: 0–60 cm)

  // Compatibilidad: tabla por tipo con CC/PMP/AAU en mm para 0,6 m de raíz.
  var TIPOS_SUELO = {};
  TEXTURAS.forEach(function (t) {
    TIPOS_SUELO[t.k] = { nombre: t.nombre, emoji: t.emoji, cc: t.cc, pmp: t.pmp, CC: Math.round(t.cc * 10 * ZR_REF), PMP: Math.round(t.pmp * 10 * ZR_REF), AAU: Math.round((t.cc - t.pmp) * 10 * ZR_REF), coefLluvia: 1 };
  });

  // ---- Cultivo: respuesta del rinde, agotamiento permitido y raíz (con fuente) ----
  var KY = {   // FAO-33 (Doorenbos & Kassam 1979) Tabla 24
    soja:    { veg: 0.2,  flor: 0.8,  llen: 1.0,  mad: 0.0, total: 0.85 },
    maiz:    { veg: 0.4,  flor: 1.5,  llen: 0.5,  mad: 0.2, total: 1.25 },
    trigo:   { veg: 0.2,  flor: 0.6,  llen: 0.5,  mad: 0.0, total: 1.15 },
    girasol: { veg: 0.25, flor: 0.5,  llen: 1.0,  mad: 0.8, total: 0.95 },
    sorgo:   { veg: 0.2,  flor: 0.55, llen: 0.45, mad: 0.2, total: 0.9 },
    otro:    { veg: 0.3,  flor: 0.8,  llen: 0.7,  mad: 0.2, total: 1.0 }
  };
  // Dónde está el lote, para el clima y el balance: primero el centro de su polígono, después el GPS del equipo y
  // recién al final el punto del campo (dos pivots de la misma estancia pueden estar a kilómetros; regla de Osmar 30-sep-2026).
  function coordenadasLote(equipo, campo) {
    var ok = function (la, lo) { return la != null && lo != null && !isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0); };
    var n = function (v) { var x = v == null || v === '' ? NaN : parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };
    if (equipo && equipo.poligono && equipo.poligono.centro) { var la = n(equipo.poligono.centro.lat), lo = n(equipo.poligono.centro.lon); if (ok(la, lo)) return { lat: la, lon: lo, origen: 'poligono', cacheKey: 'lote:' + equipo.id }; }
    if (equipo && equipo.gps) { var m = String(equipo.gps).match(/-?\d+(?:[.,]\d+)?/g); if (m && m.length >= 2) { var la2 = n(m[0]), lo2 = n(m[1]); if (ok(la2, lo2)) return { lat: la2, lon: lo2, origen: 'gps', cacheKey: 'lote:' + equipo.id }; } }
    if (campo) { var la3 = n(campo.latitud), lo3 = n(campo.longitud); if (ok(la3, lo3)) return { lat: la3, lon: lo3, origen: 'campo', cacheKey: 'campo:' + campo.id }; }
    return null;
  }
  var P_TABLA = { soja: 0.5, maiz: 0.55, trigo: 0.55, girasol: 0.45, sorgo: 0.55, pastura: 0.6, otro: 0.5 };   // FAO-56 Tabla 22 (pastura bajo pastoreo 0,60)
  var ZR_MAX = { soja: 0.6, maiz: 1.0, trigo: 1.0, girasol: 0.8, sorgo: 1.0, pastura: 0.8, otro: 0.8 };        // m; límite inferior de FAO-56 Tabla 22 (riego); UNL 0–60 cm en soja; pastura 0,5–1,5
  var ETAPAS = [{ k: 'veg', n: 'Vegetativa' }, { k: 'flor', n: 'Floración' }, { k: 'llen', n: 'Llenado (formación del rinde)' }, { k: 'mad', n: 'Maduración' }];
  var NOMBRE_ETAPA = { pre: 'Pre-siembra', veg: 'Vegetativa', flor: 'Floración', llen: 'Llenado', mad: 'Maduración', per: 'Perenne', sin: 'Sin cultivo' };

  function normNombre(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function claveCultivo(c) { var n = normNombre(c); if (/pastura|pasto\b|brachiaria|braquiaria|mombaca|tifton|alfalfa|panicum|cynodon|forraj/.test(n)) return 'pastura'; if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }

  // Umbrales por defecto (soja): % del agua disponible que queda. Cada simulación devuelve los suyos según el cultivo (r.umbrales).
  var UMBRALES = { URGENTE: 50, CRITICO: 75, ATENCION: 85 };   // respaldo si una simulación no trae los suyos: estrés 50 %, arrancar el pivot 75 %
  function umbralesDe(cu) { var c = Math.round(100 * (1 - (P_TABLA[cu] || 0.5))); return { CRITICO: c, ATENCION: c + 20, URGENTE: c - 15 }; }

  /* ---------- Punto de arranque del pivot (margen de seguridad) ----------
     Un pivot tarda días en dar la vuelta. Si se prende recién cuando el suelo llega al punto de estrés (RAW),
     el último sector queda en estrés hasta que le llega el agua. Por eso se arranca cuando lo que falta para el
     estrés es igual a lo que el cultivo va a gastar mientras el pivot da la vuelta:
       arranque (agotamiento) = RAW − ETc de los días de la vuelta
       (la lluvia prevista NO se resta del margen: ya entra en la proyección del suelo y corre la fecha de arranque;
        restarla dos veces dejaría al cultivo sin margen si la lluvia no llega)
       días de vuelta = lámina bruta de la vuelta ÷ capacidad del equipo (mm/24 h, ficha del equipo).
     Fuentes: Rhoads & Yonts, National Corn Handbook NCH-20 (Iowa State Univ./USDA, 1991): con pivots, si el agua
     llega al agotamiento permitido, parte del lote sufre estrés antes de terminar el ciclo de riego; arrancar antes
     (a la mitad del agotamiento permitido) y, en regiones semiáridas, mantenerse adelante de la demanda del cultivo.
     Lindsay FieldNET Advisor (folleto 2017): Start Next Irrigation = Next Irrigation Due By − Next Irrigation Refill
     Time; líneas capacidad de campo, recarga, seguridad y agotamiento crítico; días hasta el estrés.
     Sin datos del equipo se supone una vuelta de 3 días (el ejemplo de Hay, Kjaersgaard y Trooien 2013, "Soybean Irrigation", cap. 49 de
     iGrow Soybeans, SDSU Extension, usa 4 días por vuelta, 1 pulgada bruta y 85 % de eficiencia; verificado contra el PDF el 30-sep-2026). */
  var VUELTA_SUPUESTA_DIAS = 3;

  /* ---------- Consumo del cultivo según el satélite (como FieldNET Advisor 2024: "remote sensing ... actual crop water use") ----------
     La curva FAO de Kc supone un cultivo que crece "normal". El satélite muestra cuánto cubre de verdad (granizo, sequía,
     enfermedad, stand pobre, siembra atrasada) y se corrige el consumo:
       1) cobertura fc desde el NDVI de Sentinel-2, escalado lineal entre suelo desnudo y cobertura plena
          (Gutman & Ignatov 1998), con los extremos del propio lote (percentiles 5 y 95 de su serie; si no alcanza, 0,15 y 0,90);
       2) Kcb desde fc y altura del cultivo: Allen, Pereira, Smith, Raes & Wright 2005, J. Irrig. Drain. Eng. 131(1),
          Ec. 11 invertida:  Kcb = Kc_min + (Kc_max − Kc_min) · fc^(1/(1+0,5·h)),  Kc_min 0,15, Kc_max 1,2 (clima estándar);
          h = altura máxima FAO-56 Tabla 12; el Kc del satélite nunca baja del Kc inicial ni pasa el Kc medio de la tabla;
       3) factor = Kc satélite ÷ Kc FAO de ese día (entre 0,6 y 1,15), aplicado a la curva FAO: entre pasadas se interpola;
          después de la última vale 15 días y se diluye hasta 30; antes del día 20 no se usa (el NDVI es casi todo suelo). */
  var ALTURA_CULTIVO = { soja: 0.75, maiz: 2.0, trigo: 1.0, girasol: 2.0, sorgo: 1.5, pastura: 0.3, otro: 1.0 };
  var KC_MIN_SAT = 0.15, KC_MAX_SAT = 1.2;
  function ndviGuardado(equipoId) {
    if (equipoId == null) return [];
    return leerLS('ndvi_' + String(equipoId)).filter(function (p) { return p && p.fecha && p.ndvi != null && isFinite(+p.ndvi) && !(p.nubes_pct > 40); })
      .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  }
  function extremosNdvi(serie) {
    var v = serie.map(function (p) { return +p.ndvi; }).filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; }), s = 0.15, c = 0.90, propio = false;
    if (v.length >= 20) { var lo = v[Math.floor(v.length * 0.05)], hi = v[Math.floor(v.length * 0.95)]; if (hi - lo >= 0.4) { s = Math.max(0.05, Math.min(0.25, lo)); c = Math.max(0.7, Math.min(0.95, hi)); propio = true; } }
    return { suelo: s, pleno: c, propio: propio };
  }
  function kcbSatelite(ndvi, cu, ext) {
    var fc = Math.max(0, Math.min(0.99, (ndvi - ext.suelo) / (ext.pleno - ext.suelo))), h = ALTURA_CULTIVO[cu] || 1;
    return { fc: fc, kcb: KC_MIN_SAT + (KC_MAX_SAT - KC_MIN_SAT) * Math.pow(fc, 1 / (1 + 0.5 * h)) };
  }
  function factoresSatelite(serie, siembra, kcDef, cu, claves) {
    if (!serie || !serie.length || !siembra || !kcDef) return null;
    var ext = extremosNdvi(serie), ki = +kcDef.kc_ini || 0.4, km = +kcDef.kc_med || 1.15, fin = kcYEtapa(kcDef, 0).fin;
    var pts = [];
    serie.forEach(function (p) {
      var k = claveDia(p.fecha), d = diasEntre(siembra, k);
      if (d < 20 || d > fin) return;
      var kf = kcYEtapa(kcDef, d).kc, s = kcbSatelite(+p.ndvi, cu, ext), ks = Math.min(km, Math.max(ki, s.kcb));
      pts.push({ k: k, dds: d, ndvi: +p.ndvi, fc: s.fc, kcSat: ks, kcFao: kf, r: Math.max(0.6, Math.min(1.15, ks / kf)) });
    });
    if (!pts.length) return null;
    var porDia = {};
    (claves || []).forEach(function (k) {
      if (diasEntre(siembra, k) < 20) return;
      var prev = null, next = null;
      for (var i = 0; i < pts.length; i++) { if (pts[i].k <= k) prev = pts[i]; else { next = pts[i]; break; } }
      var r = null;
      if (prev && next) r = prev.r + (next.r - prev.r) * diasEntre(prev.k, k) / Math.max(1, diasEntre(prev.k, next.k));
      else if (prev) { var desde = diasEntre(prev.k, k); r = desde <= 15 ? prev.r : (desde >= 30 ? 1 : prev.r + (1 - prev.r) * (desde - 15) / 15); }
      else if (next && diasEntre(k, next.k) <= 15) r = next.r;
      if (r != null && Math.abs(r - 1) > 0.005) porDia[k] = Math.round(r * 1000) / 1000;
    });
    var u = pts[pts.length - 1];
    return { porDia: porDia, pasadas: pts.length, extremos: ext,
      ultima: { fecha: u.k, dds: u.dds, ndvi: Math.round(u.ndvi * 100) / 100, coberturaPct: Math.round(u.fc * 100), kcSatelite: Math.round(u.kcSat * 100) / 100, kcFao: u.kcFao, factor: Math.round(u.r * 100) / 100 } };
  }

  // Trae las pasadas guardadas (tabla safia_ndvi) y, si la última tiene más de 4 días, pide las nuevas al satélite
  // (función safia-ndvi, una vez por día y por lote). No bloquea: si tarda, la página sigue con lo que ya tenía.
  function mezclarNdvi(equipoId, filas) {
    var k = 'ndvi_' + String(equipoId), mapa = {};
    leerLS(k).concat(filas || []).forEach(function (s) { if (s && s.fecha && s.ndvi != null) mapa[String(s.fecha).slice(0, 10)] = s; });
    try { localStorage.setItem(k, JSON.stringify(Object.keys(mapa).sort().map(function (f) { return mapa[f]; }))); } catch (e) {}
  }
  function conTiempo(pr, ms) { return Promise.race([pr, new Promise(function (res) { setTimeout(res, ms); })]); }
  function prepararSatelite(equipos, opciones) {
    opciones = opciones || {};
    var sb = root.safiaSupabase, lista = (equipos || []).filter(function (e) { return e && e.id != null; });
    if (!sb || !lista.length) return Promise.resolve();
    var hoy = hoyLocal(), ids = lista.map(function (e) { return String(e.id); });
    var leer = Promise.resolve(sb.from('safia_ndvi').select('equipo_id,fecha,ndvi_media,ndvi_p10,ndvi_p50,ndvi_p90,nubes_pct,pixeles').in('equipo_id', ids).gte('fecha', sumarDias(hoy, -420)).order('fecha'))
      .then(function (r) {
        if (!r || r.error || !r.data) return;
        var por = {}; r.data.forEach(function (f) { (por[f.equipo_id] = por[f.equipo_id] || []).push({ fecha: f.fecha, ndvi: +f.ndvi_media, p10: f.ndvi_p10, p50: f.ndvi_p50, p90: f.ndvi_p90, nubes_pct: f.nubes_pct == null ? null : +f.nubes_pct, pixeles: f.pixeles }); });
        Object.keys(por).forEach(function (id) { mezclarNdvi(id, por[id]); });
      }).catch(function () {});
    var pedir = leer.then(function () {
      if (opciones.sinPedir) return;
      return Promise.all(lista.map(function (e) {
        if (!e.poligono || !e.poligono.partes || !e.campoId) return null;
        if (root.SafiaSuscripcion && !root.SafiaSuscripcion.puedeCargar(e.id)) return null;   // suscripción vencida: sin pasadas nuevas
        var serie = leerLS('ndvi_' + String(e.id)), ult = serie.length ? String(serie[serie.length - 1].fecha).slice(0, 10) : null, marca = 'ndvi_pedido_' + String(e.id);
        if (ult && diasEntre(ult, hoy) <= 4) return null;
        try { if (localStorage.getItem(marca) === hoy) return null; localStorage.setItem(marca, hoy); } catch (x) { return null; }
        var desde = ult ? sumarDias(ult, 1) : sumarDias(hoy, -150);
        return Promise.resolve(sb.functions.invoke('safia-ndvi', { body: { equipoId: String(e.id), campoId: String(e.campoId), partes: e.poligono.partes, desde: desde, hasta: hoy } }))
          .then(function (r) { var d = r && r.data; if (d && d.ok && d.serie) mezclarNdvi(e.id, d.serie); }).catch(function () {});
      }));
    });
    // Estación meteorológica del campo (Metos/FieldClimate): trae lo medido (lluvia, ET0 del día, sonda) cada 3 horas como
    // mucho. Con esos datos el balance usa la ET0 y la lluvia MEDIDAS en el campo en lugar de las estimadas (estacionDelCampo).
    var est = root.SafiaSensores && root.SafiaSensores.sincronizarCampo ? root.SafiaSensores : null, pEst = Promise.resolve();
    if (est && !opciones.sinEstacion) {
      var idsCampo = {}; lista.forEach(function (e) { if (e.campoId != null) idsCampo[String(e.campoId)] = 1; });
      var ahora = Date.now();
      pEst = Promise.all(leerLS('campos').filter(function (c) { return c && c.estacionId && idsCampo[String(c.id)]; }).map(function (c) {
        var m = 'estacion_sync_' + String(c.id), prev = 0;
        try { prev = +(localStorage.getItem(m) || 0); if (ahora - prev < 3 * 3600 * 1000) return null; localStorage.setItem(m, String(ahora)); } catch (x) { return null; }
        return Promise.resolve(est.sincronizarCampo(c)).catch(function () { try { localStorage.setItem(m, String(prev)); } catch (y) {} });
      }));
    }
    return conTiempo(Promise.all([opciones.esperarSatelite ? pedir : leer, pEst]), opciones.esperaMs || 8000);
  }
  function capacidadBruta(eq) {
    var dt = (eq && eq.datosTecnicos) || {}, c = num(dt.capacidad);
    if (c > 0) return c;
    var l = num(dt.lamina100), h = num(dt.vuelta100);
    return (l > 0 && h > 0) ? l / h * 24 : null;
  }
  function laminaVuelta(raw, ef) { return Math.max(10, Math.min(35, Math.ceil(raw / (ef > 0 ? ef : 1) / 5) * 5)); }
  // Lámina mínima de DÍA (criterio operativo de Irrigar, Osmar 3-oct-2026): entre las 9 y las 18 h el pivot no aplica láminas chicas
  // (3 a 5 mm): se evaporan antes de entrar al suelo y queman hojas, más todavía con el cultivo chico. De día nunca menos de 10 mm por
  // vuelta; con más de 30 °C, de día entre 10 y 14 mm. De noche (18 a 9 h) la lámina puede ser menor. Regar las 24 h está bien: lo que
  // cambia es la lámina (y por eso la velocidad) de las pasadas de día. Con lamina100/vuelta100 del equipo se traduce a % de velocidad.
  var LAMINA_MIN_DIA = 10, LAMINA_MAX_CALOR = 14, T_CALOR = 30, LAMINA_MAX_VUELTA = 35;
  // Horario de punta de la ANDE: Resolución P/Nº 49888 del 26-nov-2024 (modifica los numerales 3.4 y 3.5 del Pliego de Tarifas Nº 21):
  // punta de carga de lunes a sábado, de 18 a 22 horas; fuera de punta de lunes a sábado de 0 a 18 y de 22 a 24 horas, y los domingos
  // todo el día. (Antes eran 18–22 en verano y 17–21 en invierno; con el horario único quedó 18–22.) Leída el 3-oct-2026:
  // https://www.ande.gov.py/docs/tarifas/RP49888%20-%20Modificacion%20del%20Pliego%20N%2021%20-%20ID88556715_firmado.pdf
  // En la factura de Ganadera Angelita (jul-2025) el kWh costó 332 Gs en punta contra 145 fuera de punta. Si el campo tiene facturas
  // cargadas, se muestra la relación real de su factura. Los clientes del grupo 731/732 pueden contratar punta de 19 a 22 h (4.11.1).
  var PUNTA_DESDE = 18, PUNTA_HASTA = 22, HORAS_SIN_PUNTA = 24 - (PUNTA_HASTA - PUNTA_DESDE);
  function relacionPunta(equipo) {
    try {
      var fs = JSON.parse(localStorage.getItem('facturas_energia') || '[]').filter(function (f) { return equipo && String(f.campoId) === String(equipo.campoId) && +f.kwhPunta > 0 && +f.kwhFueraPunta > 0 && +f.importeEnergiaPunta > 0 && +f.importeEnergiaFueraPunta > 0; })
        .sort(function (a, b) { return String(b.hasta || '').localeCompare(String(a.hasta || '')); });
      if (!fs.length) return null;
      var rel = (fs[0].importeEnergiaPunta / fs[0].kwhPunta) / (fs[0].importeEnergiaFueraPunta / fs[0].kwhFueraPunta);
      return rel > 1.05 ? Math.round(rel * 10) / 10 : null;
    } catch (e) { return null; }
  }
  function consejoLamina(r, equipo, mm) {
    var dt = (equipo && equipo.datosTecnicos) || {}, lam100 = num(dt.lamina100), h100 = num(dt.vuelta100);
    var dias = (r && r.dias) || [], hoy = null, tMax = null;
    dias.forEach(function (d) { if (d.esHoy) hoy = d; });
    if (hoy && hoy.tMax != null) tMax = +hoy.tMax;
    else dias.filter(function (d) { return d.esFuturo; }).slice(0, 2).forEach(function (d) { if (d.tMax != null && (tMax == null || +d.tMax > tMax)) tMax = +d.tMax; });
    var calor = tMax != null && tMax >= T_CALOR, dds = r && r.etapaHoy ? r.etapaHoy.dds : null, joven = dds != null && dds <= 30;
    var out = { laminaMin: LAMINA_MIN_DIA, laminaMaxCalor: LAMINA_MAX_CALOR, tMax: tMax, calor: calor, joven: joven, n: null, lamina: null, velocidadPct: null, horasVuelta: null, horasTotal: null, texto: '', nota: '', notaCorta: '' };
    mm = +mm || 0;
    if (mm > 0) {
      var tope = calor ? LAMINA_MAX_CALOR : LAMINA_MAX_VUELTA, n = Math.max(1, Math.ceil(mm / tope)), L = Math.max(LAMINA_MIN_DIA, Math.ceil(mm / n));
      out.n = n; out.lamina = L;
      if (lam100 > 0) { var vel = Math.max(1, Math.min(100, Math.round(lam100 / L * 100))); out.velocidadPct = vel; if (h100 > 0) { out.horasVuelta = Math.round(h100 * 100 / vel); out.horasTotal = out.horasVuelta * n; } }
      out.texto = n + ' vuelta' + (n > 1 ? 's' : '') + ' de ' + L + ' mm' + (out.velocidadPct != null ? ' (velocidad ' + out.velocidadPct + ' %' + (out.horasVuelta ? ' ≈ ' + out.horasVuelta + ' h' + (n > 1 ? ' cada una' : '') : '') + ')' : '');
    }
    var t = tMax != null ? ' (hoy ' + Math.round(tMax) + ' °C)' : '';
    // energía: fuera del horario de punta el kWh es más barato; cuánto alcanza el equipo regando solo en las horas baratas
    var rel = relacionPunta(equipo), pvP = r && r.recomendacion ? r.recomendacion.pivot : null, punta = { desde: PUNTA_DESDE, hasta: PUNTA_HASTA, horasBaratas: HORAS_SIN_PUNTA, relacion: rel, alcanza: null, diasVuelta: null };
    var cuanto = rel ? 'el kWh cuesta ' + String(rel).replace('.', ',') + ' veces más (según tu última factura)' : 'el kWh es más caro';
    if (out.horasVuelta) punta.diasVuelta = Math.round(out.horasVuelta / HORAS_SIN_PUNTA * 10) / 10;
    if (pvP && pvP.capacidadNeta > 0 && pvP.consumoMax7 != null) { punta.capacidadSinPunta = Math.round(pvP.capacidadNeta * HORAS_SIN_PUNTA / 24 * 10) / 10; punta.alcanza = pvP.consumoMax7 <= punta.capacidadSinPunta; }
    punta.nota = 'Energía: evitar regar de ' + PUNTA_DESDE + ' a ' + PUNTA_HASTA + ' h de lunes a sábado, que es el horario de punta de la ANDE y ' + cuanto + ' (los domingos no hay punta). ' +
      (punta.alcanza === false ? 'Ojo: con el consumo de estos días (' + String(pvP.consumoMax7).replace('.', ',') + ' mm/día) el equipo no alcanza regando solo fuera de punta (' + String(punta.capacidadSinPunta).replace('.', ',') + ' mm/día): en estos días hay que regar también en punta para no entrar en estrés.' :
        'Parando esas ' + (PUNTA_HASTA - PUNTA_DESDE) + ' horas quedan ' + HORAS_SIN_PUNTA + ' h de riego por día' + (punta.diasVuelta && out.horasVuelta > HORAS_SIN_PUNTA ? ': la vuelta de ' + out.horasVuelta + ' h lleva ' + String(punta.diasVuelta).replace('.', ',') + ' días' : '') + (punta.alcanza ? ', y el equipo alcanza la demanda del cultivo' : '') + '.');
    punta.notaCorta = punta.alcanza === false ? 'Con este consumo hay que regar también en punta (' + PUNTA_DESDE + ' a ' + PUNTA_HASTA + ' h).' : 'Evitar regar de ' + PUNTA_DESDE + ' a ' + PUNTA_HASTA + ' h de lunes a sábado (energía más cara).';
    out.punta = punta;
    out.notaCorta = 'De día no menos de ' + LAMINA_MIN_DIA + ' mm por vuelta' + (calor ? ', con calor' + t + ' entre 10 y 14 mm' : '') + '; de noche puede ser menor. ' + punta.notaCorta;
    out.nota = 'De día (9 a 18 h) no regar menos de ' + LAMINA_MIN_DIA + ' mm por vuelta: las láminas chicas se evaporan antes de entrar al suelo y queman hojas' + (joven ? ', y el cultivo todavía es chico' : '') + '. ' +
      (calor ? 'Hoy hace calor (' + Math.round(tMax) + ' °C): de día regar entre 10 y 14 mm. ' : 'Con más de ' + T_CALOR + ' °C, de día entre 10 y 14 mm. ') +
      'De noche (18 a 9 h) la lámina puede ser menor. Se puede regar de día y de noche: lo que cambia es la lámina de las pasadas de día. ' + punta.nota;
    return out;
  }
  // mm que el cultivo gasta, neto de la lluvia prevista, durante 'dias' desde la posición i de las listas
  function gastoEnVuelta(etcs, lluvias, i, dias) {
    var n = Math.max(1, Math.ceil(dias)), s = 0;
    for (var k = 0; k < n; k++) { var j = Math.min(i + k, etcs.length - 1), f = (k === n - 1 && dias % 1 > 0) ? dias % 1 : 1; s += f * ((etcs[j] || 0) - (lluvias[j] || 0)); }
    return Math.max(0, s);
  }
  // Umbrales de MANEJO del riego (decisión de Osmar, 29-sep-2026, comparando con FieldNET Advisor: amarillo 58→45 %):
  //  - estrés para decidir el riego: nunca por debajo del 50 % de agua útil (agotamiento máx. 50 %; hasta el 30-sep era 45 %). La FAO deja gastar
  //    más cuando el consumo es bajo (p = p_tabla + 0,04·(5 − ETc)); para regar se usa el límite más prudente.
  //    La física del cultivo (Ks y pérdida de rinde FAO-33) sigue con el p de la FAO: esto cambia el manejo, no el cálculo del rinde.
  //  - arranque del pivot (Osmar: "mantener el agua en el verde"): nunca por debajo del 75 % de agua útil (70 % hasta el 30-sep); si el
  //    consumo durante la vuelta lo pide, más arriba (estrés + consumo de la vuelta; 100 % en pico = mantener girando).
  //    Así el pivot se prende al salir del verde y el último sector queda por encima del 60 % en la vuelta.
  // 30-sep-2026 (Osmar, tras verificar la fuente): estrés desde el 50 % de agua útil y arranque del pivot desde el 75 %.
  //   SDSU Extension (Hay, Kjaersgaard y Trooien 2013, cap. 49 de iGrow Soybeans): el agotamiento no debe pasar del 50 %
  //   después de que empieza la floración. Antes (29-sep) eran 45 % y 70 %.
  var P_MAX_MANEJO = 0.50, ARRANQUE_MIN_PCT = 75, BANDA_MIN_ARRANQUE = 15;
  function umbralManejo(taw, p, gasto) {
    var estres = Math.max(Math.round((1 - P_MAX_MANEJO) * 100), Math.round((1 - p) * 100));
    var minArr = Math.min(100, Math.max(ARRANQUE_MIN_PCT, estres + BANDA_MIN_ARRANQUE));
    var drE = taw * (1 - estres / 100), drA = Math.max(0, Math.min(drE - (gasto || 0), taw * (1 - minArr / 100)));
    return { estresPct: estres, drEstres: drE, drArranque: drA, arranquePct: Math.min(100, Math.round(taw > 0 ? (1 - drA / taw) * 100 : estres)) };
  }
  // Agotamiento (mm) al que hay que prender el pivot en el día i
  function arranquePivot(raw, ef, capB, etcs, lluvias, i) {
    var lam = laminaVuelta(raw, ef), dias = capB > 0 ? lam / capB : VUELTA_SUPUESTA_DIAS, g = gastoEnVuelta(etcs, lluvias, i, dias);
    return { dr: Math.max(0, raw - g), dias: dias, lamina: lam, gasto: g, supuesto: !(capB > 0) };
  }

  // Eficiencia de riego por tipo de equipo.
  var EFICIENCIA_RIEGO = { pivote: 0.85, goteo: 0.92, microaspersion: 0.88, aspersion: 0.78, canon: 0.70, superficie: 0.50, secano: 0, otro: 0.80 };
  function getEficienciaEquipo(equipo) {
    if (!equipo) return 0.80;
    if (equipo.tipo === 'secano') return 0;
    if (equipo.eficiencia && parseFloat(equipo.eficiencia) > 0) return parseFloat(equipo.eficiencia) / 100;
    return EFICIENCIA_RIEGO[equipo.tipo] || 0.80;
  }
  function esSecano(eq) { return !!eq && eq.tipo === 'secano'; }

  /* ---------- Suelo del campo: sonda → análisis (arcilla) → tipo → franco ---------- */
  function arcillaDe(a) { if (!a) return null; var v = num(a.arcilla); if (v == null && a.parametros) v = num(a.parametros.arcilla); return v; }
  function sueloDe(campo) {
    var base = { tipo: null, nombre: 'Franco', emoji: '🌱', esFallback: false };
    if (campo && typeof campo === 'object') {
      var s = campo.sonda;
      if (s && num(s.cc) != null && num(s.pmp) != null && (s.unidad || 'vwc') === 'vwc' && num(s.cc) > num(s.pmp)) {
        var tS = campo.tipoSuelo && texturaPorClave(campo.tipoSuelo);
        return Object.assign(base, { cc: num(s.cc), pmp: num(s.pmp), fuente: 'sonda', origen: 'configuración de la sonda del campo', tipo: tS ? tS.k : null, nombre: tS ? tS.nombre + ' (sonda)' : 'según la sonda', emoji: tS ? tS.emoji : '🌱' });
      }
      var an = leerLS('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campo.id) && !a.enPromedio && arcillaDe(a) != null; }).sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); });
      if (an.length) {
        var ta = texturaPorAnalisis(an[an.length - 1]);
        if (ta) { var t = ta.t, arc = ta.arcilla; return Object.assign(base, { cc: t.cc, pmp: t.pmp, fuente: 'analisis', origen: 'textura del análisis (' + (ta.clase ? ta.clase + ': ' + Math.round(arc) + ' % arcilla, ' + Math.round(ta.limo) + ' % limo, triángulo USDA' : Math.round(arc) + ' % arcilla') + '; FAO-56 Tabla 19)', tipo: t.k, nombre: t.nombre, emoji: t.emoji, arcilla: arc }); }
      }
      if (campo.tipoSuelo && texturaPorClave(campo.tipoSuelo)) {
        var tt = texturaPorClave(campo.tipoSuelo);
        return Object.assign(base, { cc: tt.cc, pmp: tt.pmp, fuente: 'tipo', origen: 'tipo de suelo cargado en Campos (' + tt.nombre.toLowerCase() + ', FAO-56 Tabla 19)', tipo: tt.k, nombre: tt.nombre, emoji: tt.emoji });
      }
    } else if (typeof campo === 'string' && texturaPorClave(campo)) {
      var tk = texturaPorClave(campo);
      return Object.assign(base, { cc: tk.cc, pmp: tk.pmp, fuente: 'tipo', origen: 'tipo de suelo (' + tk.nombre.toLowerCase() + ', FAO-56 Tabla 19)', tipo: tk.k, nombre: tk.nombre, emoji: tk.emoji });
    }
    var f = texturaPorClave(SUELO_FALLBACK);
    return Object.assign(base, { cc: f.cc, pmp: f.pmp, fuente: 'defecto', origen: 'franco por defecto (FAO-56 Tabla 19): el campo no tiene sonda, análisis con arcilla ni tipo de suelo', tipo: f.k, nombre: f.nombre, emoji: f.emoji, esFallback: true });
  }
  // Compatibilidad: shape viejo con CC/PMP/AAU en mm (raíz de referencia 0,6 m).
  function obtenerSuelo(campoOrTipo, zr) {
    var s = sueloDe(campoOrTipo), z = zr || ZR_REF;
    s.CC = Math.round(s.cc * 10 * z); s.PMP = Math.round(s.pmp * 10 * z); s.AAU = Math.round((s.cc - s.pmp) * 10 * z); s.coefLluvia = 1; s.zr = z;
    return s;
  }

  // Aviso (HTML) cuando el suelo se resolvió por defecto (sin sonda, análisis ni tipo).
  function notaFallbackSuelo(suelo, opts) {
    opts = opts || {};
    if (!suelo || !suelo.esFallback) return '';
    var clasificar = (opts.link === false) ? 'Cargá el tipo de suelo o un análisis con % de arcilla' : '<a href="mis-campos.html" style="color:#8a5713;font-weight:700;">Cargá el tipo de suelo</a> o un análisis con % de arcilla';
    if (opts.compact) return '<div style="margin-top:4px;font-size:10px;color:#8a5713;line-height:1.3;">Sin suelo clasificado: se usa franco. ' + clasificar + '</div>';
    var inner = 'Este campo no tiene sonda, análisis con arcilla ni tipo de suelo: se usa franco por defecto. ' + clasificar + ' para un cálculo más preciso.';
    if (opts.plain) return inner;
    return '<div style="margin-top:8px;padding:8px 12px;background:rgba(184,115,26,0.10);border-left:3px solid #B8731A;border-radius:6px;font-size:12px;color:#8a5713;font-weight:500;line-height:1.4;">' + inner + '</div>';
  }

  /* ---------- Cultivo: Kc y etapa ---------- */
  var FAO_DEFECTO = { kc_ini: 0.4, kc_med: 1.15, kc_fin: 0.5, L_ini: 20, L_des: 30, L_med: 60, L_fin: 25 };
  // Kc y etapa fenológica (FAO-33) según los días desde la siembra
  function kcYEtapa(f, dds) {
    f = f || FAO_DEFECTO;
    var Li = +f.L_ini || 20, Ld = +f.L_des || 30, Lm = +f.L_med || 60, Lf = +f.L_fin || 25;
    var ki = +f.kc_ini || 0.4, km = +f.kc_med || 1.15, kf = +f.kc_fin || 0.5, kc, etapa;
    if (dds < 0) { kc = ki; etapa = 'pre'; }
    else if (dds < Li) { kc = ki; etapa = 'veg'; }
    else if (dds < Li + Ld) { kc = ki + (km - ki) * (dds - Li) / Ld; etapa = 'veg'; }
    else if (dds < Li + Ld + Lm) { kc = km; etapa = (dds - Li - Ld) < Lm * 0.4 ? 'flor' : 'llen'; }
    else if (dds < Li + Ld + Lm + Lf) { kc = km + (kf - km) * (dds - Li - Ld - Lm) / Lf; etapa = 'mad'; }
    else { kc = kf; etapa = 'mad'; }
    return { kc: Math.round(kc * 100) / 100, etapa: etapa, nombre: NOMBRE_ETAPA[etapa], fin: Li + Ld + Lm + Lf, crecimientoRaiz: Li + Ld };
  }
  // Kc con nombres de etapa "viejos" (Inicial/Desarrollo/Media/Final) — compatibilidad con Predicción y Clima
  function calcularKc(kcDef, fechaCalculo, fechaSiembra) {
    if (!kcDef) return { kc: 1.0, etapa: 'Sin cultivo' };
    if (kcDef.tipo === 'perenne') {
      var mes = new Date(fechaCalculo).getMonth() + 1;
      if ([9, 10, 11].indexOf(mes) >= 0) return { kc: kcDef.kc_pri, etapa: 'Primavera' };
      if ([12, 1, 2].indexOf(mes) >= 0)  return { kc: kcDef.kc_ver, etapa: 'Verano' };
      if ([3, 4, 5].indexOf(mes) >= 0)   return { kc: kcDef.kc_oto, etapa: 'Otoño' };
      return { kc: kcDef.kc_inv, etapa: 'Invierno' };
    }
    if (!fechaSiembra) return { kc: 1.0, etapa: 'Sin siembra' };
    var dias = diasEntre(claveDia(fechaSiembra), claveDia(fechaCalculo));
    var Li = +kcDef.L_ini || 20, Ld = +kcDef.L_des || 30, Lm = +kcDef.L_med || 60, Lf = +kcDef.L_fin || 25;
    var k = kcYEtapa(kcDef, dias);
    var etapa = dias < 0 ? 'Pre-siembra' : dias <= Li ? 'Inicial' : dias <= Li + Ld ? 'Desarrollo' : dias <= Li + Ld + Lm ? 'Media' : dias <= Li + Ld + Lm + Lf ? 'Final' : 'Post-cosecha';
    return { kc: k.kc, etapa: etapa, etapaFAO: k.etapa, dds: dias };
  }
  // Fecha de HOY en hora local (Paraguay), no UTC
  function hoyLocal() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fechaLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function obtenerCultivoKc(nombreCultivo) {
    var fao = leerLS('cultivos_fao'), custom = leerLS('cultivos_custom');
    if (!fao.length && root.TABLA_FAO) fao = root.TABLA_FAO;
    var n = normNombre(nombreCultivo);
    var exacto = function (x) { return normNombre(x.nombre) === n; }, prefijo = function (x) { var m = normNombre(x.nombre); return m && (n.indexOf(m) === 0 || m.indexOf(n) === 0); };
    var c = fao.find(exacto) || custom.find(exacto) || fao.find(prefijo) || custom.find(prefijo);
    if (c) return Object.assign({}, c, { fuente: fao.indexOf(c) >= 0 ? 'FAO' : 'CUSTOM' });
    return null;
  }

  // Normaliza cualquier fecha a 'YYYY-MM-DD' sin pasar por UTC cuando ya viene como texto.
  function claveDia(fecha) {
    if (typeof fecha === 'string') {
      var m0 = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m0) return m0[1] + '-' + m0[2] + '-' + m0[3];
      fecha = new Date(fecha);
    }
    var d = (fecha instanceof Date) ? fecha : new Date(fecha);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return claveDia(d); }

  // Agrupa eventos (lluvia/riego) de UN equipo por día → mm BRUTOS sumados.
  function indexarEventos(eventos, equipoId) {
    var idxLluvia = {}, idxRiego = {};
    (eventos || []).forEach(function (e) {
      if (equipoId != null && String(e.equipoId) !== String(equipoId)) return;
      if (e.tipo !== 'lluvia' && e.tipo !== 'riego') return;
      var k = claveDia(e.fecha), mm = parseFloat(e.cantidad) || 0;
      if (e.tipo === 'lluvia') idxLluvia[k] = (idxLluvia[k] || 0) + mm; else idxRiego[k] = (idxRiego[k] || 0) + mm;
    });
    return { lluvia: idxLluvia, riego: idxRiego };
  }

  // Estación meteorológica del campo (METOS/FieldClimate u otra): lluvia, ET0 y humedad de suelo medidas (clima_estacion)
  function estacionDelCampo(campo) {
    if (!campo || !campo.estacionId) return null;
    var filas = leerLS('clima_estacion').filter(function (f) { return String(f.campoId) === String(campo.id) && f.fecha; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    if (!filas.length) return null;
    var lluvia = {}, et0 = {}, hum = {}, cfg = campo.sonda || {}, sens = Array.isArray(cfg.sensores) && cfg.sensores.length ? cfg.sensores : null;
    var sondaOk = (cfg.unidad || 'vwc') === 'vwc' && num(cfg.cc) != null && num(cfg.pmp) != null;
    filas.forEach(function (f) {
      var k = claveDia(f.fecha);
      if (f.lluvia != null) lluvia[k] = f.lluvia;
      if (f.et0 != null) et0[k] = f.et0;
      if (sondaOk && f.humSuelo) { var ks = sens || Object.keys(f.humSuelo), vs = ks.map(function (s) { return num(f.humSuelo[s]); }).filter(function (v) { return v != null; }); if (vs.length) hum[k] = vs.reduce(function (a, b) { return a + b; }, 0) / vs.length; }
    });
    return { lluvia: lluvia, et0: et0, humedad: hum, sondaOk: sondaOk, dias: filas.length, hasta: claveDia(filas[filas.length - 1].fecha) };
  }

  // Resuelve la lluvia de UN día eligiendo UNA fuente: 1) estación → 2) manual (pisa, incluso 0) → 3) Open-Meteo.
  function resolverLluviaDia(clave, meteoMM, idxLluviaManual, lluviaEstacion, fuenteMeteo) {
    if (lluviaEstacion && Object.prototype.hasOwnProperty.call(lluviaEstacion, clave)) return { mm: lluviaEstacion[clave] || 0, fuente: 'estacion' };
    if (idxLluviaManual && Object.prototype.hasOwnProperty.call(idxLluviaManual, clave)) return { mm: idxLluviaManual[clave] || 0, fuente: 'manual' };
    return { mm: meteoMM || 0, fuente: fuenteMeteo || 'meteo' };   // 'chirps' (satélite), 'modelo' (días sin satélite) o 'pronostico' (hoy y adelante)
  }

  /* ---------- Núcleo compartido: parámetros del día y paso diario ---------- */
  // Parámetros FAO-56 del día: Kc, etapa, raíz, TAW, p ajustado, RAW, ETc.
  //   cu: clave del cultivo · f: definición FAO · dds: días desde la siembra (null = sin cultivo) · theta: (θCC − θPMP)/100 · et0: mm
  function parametrosDia(cu, f, dds, theta, et0, opts) {
    opts = opts || {};
    var zrMax = opts.zrMax || ZR_MAX[cu] || ZR_MAX.otro, pTab = opts.p || P_TABLA[cu] || 0.5, ke;
    if (opts.kcFijo != null) ke = { kc: opts.kcFijo, etapa: opts.etapa || 'per', nombre: NOMBRE_ETAPA[opts.etapa || 'per'], crecimientoRaiz: 0 };
    else if (dds == null) ke = { kc: 1.0, etapa: 'sin', nombre: NOMBRE_ETAPA.sin, crecimientoRaiz: 0 };
    else ke = kcYEtapa(f, dds);
    var zr = (dds != null && dds >= 0 && ke.crecimientoRaiz > 0 && dds < ke.crecimientoRaiz) ? 0.25 + (zrMax - 0.25) * dds / ke.crecimientoRaiz : (dds != null && dds < 0 ? 0.25 : zrMax);
    // factorKc: ajuste por satélite (consumo real del cultivo según su cobertura; ver factoresSatelite)
    var fk = opts.factorKc > 0 ? opts.factorKc : 1, kcIni = f && +f.kc_ini ? +f.kc_ini : 0.4;
    var kc = Math.round(Math.max(ke.kc * fk, Math.min(ke.kc, kcIni)) * 100) / 100;   // nunca debajo del Kc inicial (evaporación del suelo)
    var taw = 1000 * theta * zr, etc = kc * (et0 || 0);
    var p = Math.max(0.1, Math.min(0.8, pTab + 0.04 * (5 - etc)));
    return { kc: kc, kcFao: ke.kc, factorKc: fk, etapa: ke.etapa, nombreEtapa: ke.nombre, zr: zr, taw: taw, p: p, raw: p * taw, etc: etc, ky: (KY[cu] || KY.otro)[ke.etapa] || 0 };
  }
  // Paso diario del balance de agotamiento: dr (mm al inicio del día), aguaNeta = lluvia + riego neto (mm).
  function pasoDia(dr, prm, aguaNeta) {
    var ks = dr > prm.raw ? Math.max(0, (prm.taw - dr) / ((1 - prm.p) * prm.taw)) : 1, eta = ks * prm.etc;
    var drFin = dr - (aguaNeta || 0) + eta, dp = 0;
    if (drFin < 0) { dp = -drFin; drFin = 0; }
    if (drFin > prm.taw) drFin = prm.taw;
    return { dr: drFin, ks: ks, eta: eta, dp: dp };
  }

  /* ---------------------------------------------------------------------
     simular(opts) — estado de HOY y proyección, para Operación.
       campo | tipoSuelo   — suelo (objeto campo o clave de textura)
       daily               — Open-Meteo daily { time[], precipitation_sum[], et0_fao_evapotranspiration[], ... }
       eventos, equipoId   — eventos (lluvia/riego) del lote
       equipo              — eficiencia de riego (secano = 0)
       kcDef, fechaSiembra — cultivo; sin ellos Kc = 1 y raíz de referencia
       hoy                 — Date o 'YYYY-MM-DD' (tests)
       diasFuturo          — días desde hoy a proyectar, incl. hoy (7)
       diasPasado          — opcional: cuántos días de pasado usar (default: todos los del daily, desde la siembra si está)
       asumirRiegoRecomendado — la trayectoria futura asume que se riega cuando entra en "regar" (default true)
       lluviaEstacionPorFecha / et0EstacionPorFecha — hooks para tests
     La simulación arranca en la siembra (si está dentro del daily) con la
     mitad del agua fácil consumida; si no, en el primer día disponible.
  --------------------------------------------------------------------- */
  function simular(opts) {
    opts = opts || {};
    var daily = opts.daily;
    if (!daily || !daily.time || !daily.time.length) throw new Error('SafiaBalance.simular: falta daily (Open-Meteo) con arrays');

    var suelo = sueloDe(opts.campo || opts.tipoSuelo);
    var theta = Math.max(0.02, (suelo.cc - suelo.pmp) / 100);
    var eficiencia = (typeof opts.eficiencia === 'number') ? opts.eficiencia : getEficienciaEquipo(opts.equipo);
    var kcDef = opts.kcDef || null, perenne = !!(kcDef && kcDef.tipo === 'perenne');
    var siembra = (!perenne && opts.fechaSiembra) ? claveDia(opts.fechaSiembra) : null;
    // Ciclo real del material: si la campaña tiene fecha de fin de ciclo (la publica el obtentor o la estimó SafiaCiclo), las cuatro
    // etapas FAO-56 se estiran o acortan en proporción (FAO-56, cap. 6: las duraciones de la tabla 11 se ajustan a la variedad y al lugar).
    // Solo si el ciclo es razonable (60–220 días) y no se aparta más de un 35 % del de la tabla, para no seguir una fecha mal cargada.
    var cicloAjustado = null;
    if (kcDef && !perenne && siembra && opts.fechaCosecha) {
      var cicloReal = diasEntre(siembra, claveDia(opts.fechaCosecha)), finTabla = kcYEtapa(kcDef, 0).fin;
      if (cicloReal >= 60 && cicloReal <= 220 && finTabla > 0 && Math.abs(cicloReal / finTabla - 1) <= 0.35) {
        var fe = cicloReal / finTabla;
        kcDef = Object.assign({}, kcDef, { L_ini: Math.round((+kcDef.L_ini || 20) * fe), L_des: Math.round((+kcDef.L_des || 30) * fe), L_med: Math.round((+kcDef.L_med || 60) * fe), L_fin: Math.round((+kcDef.L_fin || 25) * fe) });
        cicloAjustado = { dias: cicloReal, tabla: finTabla };
      }
    }
    var cu = claveCultivo(kcDef ? kcDef.nombre : opts.cultivo);
    var conCultivo = perenne || (kcDef && siembra);
    var diasFuturo = (opts.diasFuturo != null) ? opts.diasFuturo : 7;
    var asumirRiego = (opts.asumirRiegoRecomendado !== false);
    var estacionCampo = opts.lluviaEstacionPorFecha ? null : estacionDelCampo(opts.campo);
    var estacion = opts.lluviaEstacionPorFecha || (estacionCampo ? estacionCampo.lluvia : null);
    var et0Estacion = opts.et0EstacionPorFecha || (estacionCampo ? estacionCampo.et0 : null);
    var humedadSonda = (estacionCampo && estacionCampo.sondaOk) ? estacionCampo.humedad : null;
    var idx = indexarEventos(opts.eventos, opts.equipoId);

    var claveHoy = opts.hoy ? claveDia(opts.hoy) : hoyLocal();
    var claves = daily.time.map(claveDia);
    var indiceHoy = claves.indexOf(claveHoy);
    if (indiceHoy < 0) { indiceHoy = 0; for (var t = 0; t < claves.length; t++) if (claves[t] <= claveHoy) indiceHoy = t; }

    // Arranque: en la siembra si está dentro de los datos; si no, en el primer día disponible (o diasPasado atrás)
    var inicio = 0;
    if (siembra && claves.indexOf(siembra) >= 0) inicio = claves.indexOf(siembra);
    else if (opts.diasPasado != null) inicio = Math.max(0, indiceHoy - opts.diasPasado);
    if (inicio > indiceHoy) inicio = indiceHoy;
    var desdeSiembra = siembra && claves.indexOf(siembra) >= 0;
    // Satélite: corrige el consumo con la cobertura real del lote (opts.ndviSerie o lo guardado del equipo; opts.usarSatelite === false lo apaga)
    var sat = (!perenne && conCultivo && opts.usarSatelite !== false) ? factoresSatelite(opts.ndviSerie || (opts.equipo ? ndviGuardado(opts.equipo.id) : (opts.equipoId != null ? ndviGuardado(opts.equipoId) : [])), siembra, kcDef, cu, claves) : null;

    function prmDe(i) {
      var k = claves[i], eto = (daily.et0_fao_evapotranspiration && daily.et0_fao_evapotranspiration[i]) || 0, fuenteEt0 = 'meteo';
      if (et0Estacion && et0Estacion[k] != null) { eto = et0Estacion[k]; fuenteEt0 = 'estacion'; }
      var prm;
      if (perenne) { var kk = calcularKc(kcDef, k + 'T12:00:00'); prm = parametrosDia(cu, null, null, theta, eto, { kcFijo: kk.kc, etapa: 'per', zrMax: opts.zrMax || (+kcDef.zr || null), p: (+kcDef.p || null) }); prm.etapaLegacy = kk.etapa; prm.dds = null; }
      else if (conCultivo) { var dds = diasEntre(siembra, k); prm = parametrosDia(cu, kcDef, dds, theta, eto, { zrMax: opts.zrMax, factorKc: sat ? sat.porDia[k] : null }); prm.dds = dds; prm.etapaLegacy = calcularKc(kcDef, k + 'T12:00:00', siembra).etapa; }
      else { prm = parametrosDia('otro', null, null, theta, eto, { zrMax: opts.zrMax || ZR_REF }); prm.dds = null; prm.etapaLegacy = kcDef ? 'Sin siembra' : 'Sin cultivo'; }
      prm.et0 = eto; prm.fuenteEt0 = fuenteEt0;
      return prm;
    }

    var totalesPasado = { lluviaBruta: 0, lluviaEfectiva: 0, riegoBruto: 0, riegoEfectivo: 0, etc: 0, eta: 0, drenaje: 0, diasEstres: 0 };
    var totales = { lluviaBruta: 0, lluviaEfectiva: 0, riegoBruto: 0, riegoEfectivo: 0, etc: 0, eta: 0, drenaje: 0 };
    var fuentes = { estacion: 0, meteo: 0, pronostico: 0, sonda: 0, manual: 0 };
    var dias = [], pasado = [], dr = null, ultimaSonda = null, drHoyInicio = 0, umbr = umbralesDe(conCultivo ? cu : 'otro');
    // Consumo y lluvia prevista de hoy en adelante (para el punto de arranque del pivot y la proyección sin riego)
    var capB = eficiencia > 0 ? capacidadBruta(opts.equipo) : null, etcF = [], llF = [], prmF = [];
    for (var q = 0; q < claves.length; q++) {
      if (q < indiceHoy) { etcF.push(0); llF.push(0); prmF.push(null); continue; }
      var pq = prmDe(q); prmF.push(pq); etcF.push(pq.etc);
      llF.push(resolverLluviaDia(claves[q], daily.precipitation_sum && daily.precipitation_sum[q], idx.lluvia, estacion, daily.lluvia_fuente && daily.lluvia_fuente[q]).mm);
    }
    // El margen es el consumo durante la vuelta, SIN restar la lluvia prevista: la lluvia ya entra en la proyección del suelo
    // (corre la fecha de arranque); restarla también del margen la contaría dos veces y dejaría sin margen si no llueve.
    var sinLluvia = etcF.map(function () { return 0; });
    function arranqueEn(i2, prm2) {
      var e0 = Math.round((1 - prm2.p) * 100);
      if (!(eficiencia > 0)) { var m0 = umbralManejo(prm2.taw, prm2.p, 0); return { dr: m0.drEstres, drEstres: m0.drEstres, estresPct: m0.estresPct, arranquePct: m0.estresPct, dias: null, lamina: null, gasto: 0, supuesto: false }; }   // secano: sin pivot, solo el estrés (piso 45 %)
      var a = arranquePivot(prm2.raw, eficiencia, capB, etcF, sinLluvia, i2), m = umbralManejo(prm2.taw, prm2.p, a.gasto);
      return Object.assign(a, { dr: m.drArranque, drEstres: m.drEstres, estresPct: m.estresPct, arranquePct: m.arranquePct });
    }

    for (var i = inicio; i < claves.length && i < indiceHoy + diasFuturo; i++) {
      var k = claves[i], prm = prmDe(i), esPasado = i < indiceHoy, esHoy = i === indiceHoy;
      if (dr == null) dr = (opts.humedadInicialFrac != null) ? Math.max(0, (1 - opts.humedadInicialFrac) * prm.taw) : 0.5 * prm.raw;
      dr = Math.min(dr, prm.taw);
      var drInicio = dr;
      var lluvia = resolverLluviaDia(k, daily.precipitation_sum && daily.precipitation_sum[i], idx.lluvia, estacion, daily.lluvia_fuente && daily.lluvia_fuente[i]);
      var riegoBruto = idx.riego[k] || 0, riegoEf = riegoBruto * eficiencia;
      if (esHoy) drHoyInicio = dr;
      var paso = pasoDia(dr, prm, lluvia.mm + riegoEf);
      dr = paso.dr;
      var fuenteHum = 'modelo';
      if (humedadSonda && humedadSonda[k] != null && (esPasado || esHoy)) {
        // lectura medida: el agotamiento del día es el medido (θCC − θ) × Zr
        dr = Math.max(0, Math.min(prm.taw, (suelo.cc - humedadSonda[k]) / 100 * prm.zr * 1000)); fuenteHum = 'sonda'; ultimaSonda = { fecha: k, valor: humedadSonda[k], dr: dr }; fuentes.sonda++; if (esHoy) { drHoyInicio = dr; drInicio = dr; }
      }
      if (esPasado || esHoy) { if (lluvia.fuente === 'estacion' || prm.fuenteEt0 === 'estacion') fuentes.estacion++; else fuentes.meteo++; if (lluvia.fuente === 'manual') fuentes.manual++; } else fuentes.pronostico++;

      if (esPasado) {
        totalesPasado.lluviaBruta += lluvia.mm; totalesPasado.lluviaEfectiva += lluvia.mm; totalesPasado.riegoBruto += riegoBruto; totalesPasado.riegoEfectivo += riegoEf;
        totalesPasado.etc += prm.etc; totalesPasado.eta += paso.eta; totalesPasado.drenaje += paso.dp; if (paso.ks < 1) totalesPasado.diasEstres++;
        pasado.push({ fecha: k, lluviaBruta: lluvia.mm, lluviaEfectiva: lluvia.mm, fuenteLluvia: lluvia.fuente, riegoBruto: riegoBruto, riegoEfectivo: riegoEf, etoDia: prm.et0, etcDia: prm.etc, etaDia: paso.eta, ks: paso.ks, kc: prm.kc, etapaFAO: prm.etapa, porcentajeAAU: prm.taw > 0 ? (prm.taw - dr) / prm.taw * 100 : 0, drenaje: paso.dp, fuenteHumedad: fuenteHum });
        continue;
      }

      // Día de hoy o futuro: estado y recomendación. El estado del día es el agua al EMPEZAR el día (lo que hay antes de que el
      // cultivo consuma): así coincide con porcentajeHoy (la aguja), con estadoHoy y con la proyección arrancarEl/venceEl.
      // (Antes se usaba el fin del día y la Predicción marcaba 'arrancar' un día antes que la ficha.)
      var disponible = prm.taw - drInicio, pct = prm.taw > 0 ? disponible / prm.taw * 100 : 0;
      var arrDia = conCultivo ? arranqueEn(i, prm) : { dr: prm.raw, estresPct: Math.round((1 - prm.p) * 100), arranquePct: Math.round((1 - prm.p) * 100) };
      var estresDia = arrDia.estresPct, critico = Math.max(estresDia, arrDia.arranquePct);
      var estado, mmRegar = 0, mmRegarTotal = 0, drenajeDia = paso.dp;
      if (lluvia.mm >= 10) estado = 'lluvia';
      else if (drInicio > arrDia.dr) {
        estado = 'regar';
        if (eficiencia > 0) { mmRegarTotal = Math.ceil(drInicio / eficiencia / 5) * 5; mmRegar = Math.max(10, Math.min(35, mmRegarTotal)); }
        // si se asume que se riega ese día, el riego entra en el balance del día (junto con la lluvia y el riego cargado)
        if (asumirRiego && mmRegar > 0) { paso = pasoDia(drInicio, prm, lluvia.mm + riegoEf + mmRegar * eficiencia); dr = paso.dr; drenajeDia = paso.dp; }
      } else if (pct < critico + 10) estado = 'atencion';
      else estado = 'ok';
      var umbDia = conCultivo ? { URGENTE: estresDia, CRITICO: critico, ATENCION: Math.min(100, critico + 10), ESTRES: estresDia, ARRANQUE: eficiencia > 0 ? critico : null, secano: !(eficiencia > 0) } : umbr;

      totales.lluviaBruta += lluvia.mm; totales.lluviaEfectiva += lluvia.mm; totales.riegoBruto += riegoBruto; totales.riegoEfectivo += riegoEf; totales.etc += prm.etc; totales.eta += paso.eta; totales.drenaje += drenajeDia;
      var pmpMM = suelo.pmp / 100 * prm.zr * 1000;
      dias.push({
        fecha: daily.time[i], fechaObj: new Date(k + 'T12:00:00'), esHoy: esHoy, esFuturo: i > indiceHoy,
        humedadInicio: pmpMM + (prm.taw - drInicio), humedadFin: pmpMM + (prm.taw - dr),
        aguaDisponible: disponible, porcentajeAAU: pct, porcentajeFin: prm.taw > 0 ? (prm.taw - dr) / prm.taw * 100 : 0, drInicio: drInicio, dr: dr, taw: prm.taw, raw: prm.raw, zr: prm.zr, p: prm.p, umbralCriticoPct: critico, umbralEstresPct: estresDia, umbrales: umbDia, drArranque: arrDia.dr,
        lluviaBruta: lluvia.mm, lluviaEfectiva: lluvia.mm, fuenteLluvia: lluvia.fuente, riegoBruto: riegoBruto, riegoEfectivo: riegoEf,
        etoDia: prm.et0, fuenteEt0: prm.fuenteEt0, kc: prm.kc, etapa: prm.etapaLegacy, etapaFAO: prm.etapa, nombreEtapa: prm.nombreEtapa, dds: prm.dds, ky: prm.ky,
        etcDia: prm.etc, etaDia: paso.eta, ks: paso.ks, estres: paso.ks < 1, drenaje: drenajeDia, estado: estado, mmRegar: mmRegar, mmRegarTotal: mmRegarTotal, fuenteHumedad: fuenteHum,
        probLluvia: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null,
        tMax: daily.temperature_2m_max ? daily.temperature_2m_max[i] : null, tMin: daily.temperature_2m_min ? daily.temperature_2m_min[i] : null,
        weatherCode: daily.weather_code ? daily.weather_code[i] : null
      });
    }

    // Estado de HOY = al empezar el día (lo que dejó la simulación del pasado, o la sonda si midió hoy)
    var prmHoy = prmDe(indiceHoy), drHoy = Math.min(prmHoy.taw, drHoyInicio);
    var tawHoy = prmHoy.taw, aguaHoy = Math.max(0, tawHoy - drHoy), pctHoy = tawHoy > 0 ? aguaHoy / tawHoy * 100 : 0;
    var pmpHoy = suelo.pmp / 100 * prmHoy.zr * 1000;
    // Hoy: se prende el pivot al llegar al punto de arranque (no al de estrés); ver arranquePivot
    var arrHoy = conCultivo ? arranqueEn(indiceHoy, prmHoy) : { dr: prmHoy.raw, drEstres: prmHoy.raw, estresPct: Math.round((1 - prmHoy.p) * 100), arranquePct: Math.round((1 - prmHoy.p) * 100), dias: null, supuesto: false };
    var estresHoy = arrHoy.estresPct, arranqueHoy = Math.max(estresHoy, arrHoy.arranquePct);
    var estadoHoy = 'ok', regar = false, mmHoy = 0, mmTotalHoy = 0;
    if (drHoy > arrHoy.dr) { regar = true; estadoHoy = 'regar'; if (eficiencia > 0) { mmTotalHoy = Math.ceil(drHoy / eficiencia / 5) * 5; mmHoy = Math.max(10, Math.min(35, mmTotalHoy)); } }
    else if (pctHoy < arranqueHoy + 10) estadoHoy = 'atencion';
    // Esperar la lluvia (decisión de Osmar, 3-oct-2026): aunque el cultivo esté en estrés, si la lluvia prevista para HOY y MAÑANA
    // alcanza para reemplazar el riego (al menos lo que se iba a regar, y nunca menos de 15 mm), no se riega: se espera. Si es poca
    // lluvia o viene más tarde, no vale la pena esperar y la orden sigue siendo regar. Antes (29-sep) el estrés nunca esperaba la lluvia.
    var LLUVIA_ESPERA_MIN = 15, llHoy = llF[indiceHoy] || 0, llMan = llF[indiceHoy + 1] || 0;
    var esperarLluvia = (regar && eficiencia > 0 && (llHoy + llMan) >= Math.max(LLUVIA_ESPERA_MIN, mmHoy)) ? { mm: Math.round(llHoy + llMan), mmHoy: Math.round(llHoy), mmManana: Math.round(llMan), mmRiego: mmHoy } : null;
    var ksHoy = drHoy > prmHoy.raw ? Math.max(0, (tawHoy - drHoy) / ((1 - prmHoy.p) * tawHoy)) : 1;
    if (conCultivo) umbr = { URGENTE: estresHoy, CRITICO: arranqueHoy, ATENCION: Math.min(100, arranqueHoy + 10), ESTRES: estresHoy, ARRANQUE: eficiencia > 0 ? arranqueHoy : null, secano: !(eficiencia > 0) };   // secano: CRITICO = estrés (no hay pivot que arrancar)

    // Proyección SIN riego nuevo (como FieldNET): cuándo hay que arrancar y cuándo "vence" (entra en estrés)
    var arrancarEl = null, venceEl = null, dP = drHoy, etcMax = 0;
    for (var j = indiceHoy; j < claves.length; j++) {
      var pj = prmF[j] || prmDe(j); dP = Math.min(dP, pj.taw);
      var aj = conCultivo ? arranqueEn(j, pj) : { dr: pj.raw, drEstres: pj.raw };
      if (conCultivo && arrancarEl == null && dP > aj.dr) arrancarEl = claves[j];
      if (venceEl == null && dP > aj.drEstres) venceEl = claves[j];
      if (j < indiceHoy + 7) etcMax = Math.max(etcMax, pj.etc);
      dP = pasoDia(dP, pj, llF[j] + (idx.riego[claves[j]] || 0) * eficiencia).dr;
    }
    var capNeta = capB ? capB * eficiencia : null;
    var pivot = (conCultivo && eficiencia > 0) ? {
      arrancarEl: arrancarEl, venceEl: venceEl, diasHastaEstres: venceEl ? diasEntre(claveHoy, venceEl) : null, horizonteDias: claves.length - indiceHoy,
      vueltaDias: arrHoy.dias != null ? Math.round(arrHoy.dias * 10) / 10 : null, laminaVuelta: arrHoy.lamina || null, vueltaSupuesta: !!arrHoy.supuesto,
      capacidadBruta: capB ? Math.round(capB * 10) / 10 : null, capacidadNeta: capNeta ? Math.round(capNeta * 10) / 10 : null,
      consumoMax7: Math.round(etcMax * 10) / 10, noAlcanza: !!(capNeta && etcMax > capNeta),
      arranquePct: arranqueHoy, estresPct: estresHoy, gastoEnVueltaMM: Math.round((arrHoy.gasto || 0) * 10) / 10
    } : null;

    // Pasturas: temperatura media de los últimos 7 días (si el daily trae temperaturas) para avisar la parada invernal
    var pasturaInfo = null;
    if (kcDef && (kcDef.pastura || cu === 'pastura') && daily.temperature_2m_max && daily.temperature_2m_min) {
      var tm = [], t0 = Math.max(0, indiceHoy - 7);
      for (var q = t0; q < indiceHoy; q++) { var a = daily.temperature_2m_max[q], b = daily.temperature_2m_min[q]; if (a != null && b != null) tm.push((a + b) / 2); }
      var tempBase = +kcDef.tempBase || 15;
      pasturaInfo = { tempMedia7: tm.length ? Math.round(tm.reduce(function (s, v) { return s + v; }, 0) / tm.length * 10) / 10 : null, tempBase: tempBase, crecimiento: tm.length ? (tm.reduce(function (s, v) { return s + v; }, 0) / tm.length < tempBase ? 'minimo' : 'normal') : null };
    }
    var sueloOut = Object.assign({}, suelo, { CC: Math.round(suelo.cc / 100 * prmHoy.zr * 1000), PMP: Math.round(pmpHoy), AAU: Math.round(tawHoy), zr: prmHoy.zr, coefLluvia: 1 });
    // de dónde salió la lluvia de los últimos 30 días (para decirlo en la ficha y en el aviso)
    var fl = { chirps: 0, power: 0, modelo: 0, manual: 0, estacion: 0, mmModelo: 0, ultimoChirps: null, ultimoSatelite: null }, ult30 = pasado.slice(-30);
    ult30.forEach(function (d) { var f = d.fuenteLluvia === 'meteo' ? 'modelo' : d.fuenteLluvia; if (fl[f] != null) fl[f]++; if (f === 'modelo') fl.mmModelo += d.lluviaBruta || 0; if (f === 'chirps') fl.ultimoChirps = d.fecha; if (f === 'chirps' || f === 'power') fl.ultimoSatelite = d.fecha; });
    fl.mmModelo = Math.round(fl.mmModelo); fl.dias = ult30.length;
    return {
      lluviaFuentes: fl,
      suelo: sueloOut, eficiencia: eficiencia, indiceHoy: indiceHoy, cultivo: cu, desdeSiembra: !!desdeSiembra, diasSimulados: indiceHoy - inicio,
      cicloAjustado: cicloAjustado,   // { dias, tabla } si las etapas FAO se ajustaron al fin de ciclo de la campaña
      umbrales: umbr, umbralCriticoPct: umbr.CRITICO, umbralAtencionPct: umbr.ATENCION,
      humedadHoyMM: pmpHoy + aguaHoy, aguaDisponibleHoy: aguaHoy, porcentajeHoy: pctHoy, deficitHastaCC: drHoy, tawHoy: tawHoy, rawHoy: prmHoy.raw, ksHoy: ksHoy,
      etapaHoy: { k: prmHoy.etapa, nombre: prmHoy.nombreEtapa, dds: prmHoy.dds, ky: prmHoy.ky, kc: prmHoy.kc, zr: prmHoy.zr, critica: prmHoy.etapa === 'flor' || prmHoy.etapa === 'llen' },
      sonda: ultimaSonda ? Object.assign({}, ultimaSonda, { antiguedadDias: diasEntre(ultimaSonda.fecha, claveHoy) }) : null,
      pastura: pasturaInfo,
      fuentes: fuentes,
      recomendacion: { regar: regar, mm: mmHoy, mmTotal: mmTotalHoy, estado: estadoHoy, lluviaProxima: totales.lluviaBruta, enEstres: drHoy > (arrHoy.drEstres != null ? arrHoy.drEstres : prmHoy.raw), esperarLluvia: esperarLluvia, pivot: pivot },
      // Como WaterTrend de FieldNET: consumo del cultivo y lluvia prevista acumulados (7 días y todo el pronóstico)
      pronostico: (function () {
        var s = function (n) { var e = 0, l = 0, d = 0; for (var j = indiceHoy; j < claves.length && j < indiceHoy + n; j++) { e += etcF[j] || 0; l += llF[j] || 0; d++; } return { dias: d, consumoMM: Math.round(e), lluviaMM: Math.round(l), balanceMM: Math.round(l - e) }; };
        return { semana: s(7), total: s(claves.length) };
      })(),
      satelite: sat ? { ultima: sat.ultima, pasadas: sat.pasadas, factorHoy: sat.porDia[claveHoy] || 1, extremosDelLote: sat.extremos.propio } : null,
      dias: dias, pasado: pasado, totales: totales, totalesPasado: totalesPasado
    };
  }

  // Días de historia a pedir al clima para un campo: desde la siembra más vieja de sus campañas activas (+2), mínimo 92, máximo 400.
  // Con menos, el balance arrancaba 92 días atrás con la reserva a medias en vez de en la siembra (maíz, sorgo, girasol).
  function pastDaysDesde(campoId, equipoId) {
    var hoy = hoyLocal(), max = 0;
    var eqs = leerLS('equipos').filter(function (e) { return e && (equipoId != null ? String(e.id) === String(equipoId) : String(e.campoId) === String(campoId)); });
    var ids = {}; eqs.forEach(function (e) { ids[String(e.id)] = 1; });
    leerLS('campanas').forEach(function (c) {
      if (!c || !ids[String(c.equipoId)] || c.estado !== 'Activa') return;
      (c.cultivos || []).forEach(function (cu) { if (cu && cu.fechaSiembra) { var d = diasEntre(claveDia(cu.fechaSiembra), hoy); if (d > max) max = d; } });
    });
    return Math.max(92, Math.min(400, max + 2));
  }

  var SafiaBalance = {
    pastDaysDesde: pastDaysDesde, coordenadasLote: coordenadasLote,
    TEXTURAS: TEXTURAS, TIPOS_SUELO: TIPOS_SUELO, SUELO_FALLBACK: SUELO_FALLBACK, ZR_REF: ZR_REF,
    KY: KY, P_TABLA: P_TABLA, ZR_MAX: ZR_MAX, ETAPAS: ETAPAS, NOMBRE_ETAPA: NOMBRE_ETAPA,
    UMBRALES: UMBRALES, umbralesDe: umbralesDe, EFICIENCIA_RIEGO: EFICIENCIA_RIEGO,
    texturaPorArcilla: texturaPorArcilla, texturaPorClave: texturaPorClave, texturaPorAnalisis: texturaPorAnalisis, claseUSDA: claseUSDA, sueloDe: sueloDe, obtenerSuelo: obtenerSuelo, notaFallbackSuelo: notaFallbackSuelo,
    getEficienciaEquipo: getEficienciaEquipo, esSecano: esSecano,
    claveCultivo: claveCultivo, kcYEtapa: kcYEtapa, calcularKc: calcularKc, obtenerCultivoKc: obtenerCultivoKc,
    parametrosDia: parametrosDia, pasoDia: pasoDia,
    hoyLocal: hoyLocal, fechaLocal: fechaLocal, claveDia: claveDia, sumarDias: sumarDias, diasEntre: diasEntre,
    indexarEventos: indexarEventos, resolverLluviaDia: resolverLluviaDia, estacionDelCampo: estacionDelCampo,
    simular: simular,
    capacidadBruta: capacidadBruta, laminaVuelta: laminaVuelta, consejoLamina: consejoLamina, PUNTA_DESDE: PUNTA_DESDE, PUNTA_HASTA: PUNTA_HASTA, relacionPunta: relacionPunta, LAMINA_MIN_DIA: LAMINA_MIN_DIA, LAMINA_MAX_CALOR: LAMINA_MAX_CALOR, T_CALOR: T_CALOR, gastoEnVuelta: gastoEnVuelta, arranquePivot: arranquePivot, VUELTA_SUPUESTA_DIAS: VUELTA_SUPUESTA_DIAS,
    umbralManejo: umbralManejo, P_MAX_MANEJO: P_MAX_MANEJO, BANDA_MIN_ARRANQUE: BANDA_MIN_ARRANQUE, ARRANQUE_MIN_PCT: ARRANQUE_MIN_PCT,
    ndviGuardado: ndviGuardado, factoresSatelite: factoresSatelite, kcbSatelite: kcbSatelite, extremosNdvi: extremosNdvi, prepararSatelite: prepararSatelite, ALTURA_CULTIVO: ALTURA_CULTIVO,
    version: '2.3.0'
  };

  root.SafiaBalance = SafiaBalance;
  if (typeof module !== 'undefined' && module.exports) module.exports = SafiaBalance;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
