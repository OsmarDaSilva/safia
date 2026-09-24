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
    { k: 'arcilloso',        nombre: 'Arcilloso',        nombreLargo: 'Arcilloso (> 40 % arcilla)',            cc: 36, pmp: 22, emoji: '🧱' }
  ];
  function texturaPorClave(k) { for (var i = 0; i < TEXTURAS.length; i++) if (TEXTURAS[i].k === k) return TEXTURAS[i]; return null; }
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
  var P_TABLA = { soja: 0.5, maiz: 0.55, trigo: 0.55, girasol: 0.45, sorgo: 0.55, otro: 0.5 };   // FAO-56 Tabla 22
  var ZR_MAX = { soja: 0.6, maiz: 1.0, trigo: 1.0, girasol: 0.8, sorgo: 1.0, otro: 0.8 };        // m; límite inferior de FAO-56 Tabla 22 (riego); UNL 0–60 cm en soja
  var ETAPAS = [{ k: 'veg', n: 'Vegetativa' }, { k: 'flor', n: 'Floración' }, { k: 'llen', n: 'Llenado (formación del rinde)' }, { k: 'mad', n: 'Maduración' }];
  var NOMBRE_ETAPA = { pre: 'Pre-siembra', veg: 'Vegetativa', flor: 'Floración', llen: 'Llenado', mad: 'Maduración', per: 'Perenne', sin: 'Sin cultivo' };

  function normNombre(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function claveCultivo(c) { var n = normNombre(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }

  // Umbrales por defecto (soja): % del agua disponible que queda. Cada simulación devuelve los suyos según el cultivo (r.umbrales).
  var UMBRALES = { URGENTE: 35, CRITICO: 50, ATENCION: 70 };
  function umbralesDe(cu) { var c = Math.round(100 * (1 - (P_TABLA[cu] || 0.5))); return { CRITICO: c, ATENCION: c + 20, URGENTE: c - 15 }; }

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
        var arc = arcillaDe(an[an.length - 1]), t = texturaPorArcilla(arc);
        if (t) return Object.assign(base, { cc: t.cc, pmp: t.pmp, fuente: 'analisis', origen: 'textura del análisis (' + Math.round(arc) + ' % arcilla, FAO-56 Tabla 19)', tipo: t.k, nombre: t.nombre, emoji: t.emoji, arcilla: arc });
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
  function resolverLluviaDia(clave, meteoMM, idxLluviaManual, lluviaEstacion) {
    if (lluviaEstacion && Object.prototype.hasOwnProperty.call(lluviaEstacion, clave)) return { mm: lluviaEstacion[clave] || 0, fuente: 'estacion' };
    if (idxLluviaManual && Object.prototype.hasOwnProperty.call(idxLluviaManual, clave)) return { mm: idxLluviaManual[clave] || 0, fuente: 'manual' };
    return { mm: meteoMM || 0, fuente: 'meteo' };
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
    var taw = 1000 * theta * zr, etc = ke.kc * (et0 || 0);
    var p = Math.max(0.1, Math.min(0.8, pTab + 0.04 * (5 - etc)));
    return { kc: ke.kc, etapa: ke.etapa, nombreEtapa: ke.nombre, zr: zr, taw: taw, p: p, raw: p * taw, etc: etc, ky: (KY[cu] || KY.otro)[ke.etapa] || 0 };
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

    function prmDe(i) {
      var k = claves[i], eto = (daily.et0_fao_evapotranspiration && daily.et0_fao_evapotranspiration[i]) || 0, fuenteEt0 = 'meteo';
      if (et0Estacion && et0Estacion[k] != null) { eto = et0Estacion[k]; fuenteEt0 = 'estacion'; }
      var prm;
      if (perenne) { var kk = calcularKc(kcDef, k + 'T12:00:00'); prm = parametrosDia('otro', null, null, theta, eto, { kcFijo: kk.kc, etapa: 'per', zrMax: opts.zrMax }); prm.etapaLegacy = kk.etapa; prm.dds = null; }
      else if (conCultivo) { var dds = diasEntre(siembra, k); prm = parametrosDia(cu, kcDef, dds, theta, eto, { zrMax: opts.zrMax }); prm.dds = dds; prm.etapaLegacy = calcularKc(kcDef, k + 'T12:00:00', siembra).etapa; }
      else { prm = parametrosDia('otro', null, null, theta, eto, { zrMax: opts.zrMax || ZR_REF }); prm.dds = null; prm.etapaLegacy = kcDef ? 'Sin siembra' : 'Sin cultivo'; }
      prm.et0 = eto; prm.fuenteEt0 = fuenteEt0;
      return prm;
    }

    var totalesPasado = { lluviaBruta: 0, lluviaEfectiva: 0, riegoBruto: 0, riegoEfectivo: 0, etc: 0, eta: 0, drenaje: 0, diasEstres: 0 };
    var totales = { lluviaBruta: 0, lluviaEfectiva: 0, riegoBruto: 0, riegoEfectivo: 0, etc: 0, eta: 0, drenaje: 0 };
    var fuentes = { estacion: 0, meteo: 0, pronostico: 0, sonda: 0, manual: 0 };
    var dias = [], pasado = [], dr = null, ultimaSonda = null, drHoyInicio = 0, umbr = umbralesDe(conCultivo && !perenne ? cu : 'otro');

    for (var i = inicio; i < claves.length && i < indiceHoy + diasFuturo; i++) {
      var k = claves[i], prm = prmDe(i), esPasado = i < indiceHoy, esHoy = i === indiceHoy;
      if (dr == null) dr = (opts.humedadInicialFrac != null) ? Math.max(0, (1 - opts.humedadInicialFrac) * prm.taw) : 0.5 * prm.raw;
      dr = Math.min(dr, prm.taw);
      var drInicio = dr;
      var lluvia = resolverLluviaDia(k, daily.precipitation_sum && daily.precipitation_sum[i], idx.lluvia, estacion);
      var riegoBruto = idx.riego[k] || 0, riegoEf = riegoBruto * eficiencia;
      if (esHoy) drHoyInicio = dr;
      var paso = pasoDia(dr, prm, lluvia.mm + riegoEf);
      dr = paso.dr;
      var fuenteHum = 'modelo';
      if (humedadSonda && humedadSonda[k] != null && (esPasado || esHoy)) {
        // lectura medida: el agotamiento del día es el medido (θCC − θ) × Zr
        dr = Math.max(0, Math.min(prm.taw, (suelo.cc - humedadSonda[k]) / 100 * prm.zr * 1000)); fuenteHum = 'sonda'; ultimaSonda = { fecha: k, valor: humedadSonda[k], dr: dr }; fuentes.sonda++; if (esHoy) drHoyInicio = dr;
      }
      if (esPasado || esHoy) { if (lluvia.fuente === 'estacion' || prm.fuenteEt0 === 'estacion') fuentes.estacion++; else fuentes.meteo++; if (lluvia.fuente === 'manual') fuentes.manual++; } else fuentes.pronostico++;

      if (esPasado) {
        totalesPasado.lluviaBruta += lluvia.mm; totalesPasado.lluviaEfectiva += lluvia.mm; totalesPasado.riegoBruto += riegoBruto; totalesPasado.riegoEfectivo += riegoEf;
        totalesPasado.etc += prm.etc; totalesPasado.eta += paso.eta; totalesPasado.drenaje += paso.dp; if (paso.ks < 1) totalesPasado.diasEstres++;
        pasado.push({ fecha: k, lluviaBruta: lluvia.mm, lluviaEfectiva: lluvia.mm, fuenteLluvia: lluvia.fuente, riegoBruto: riegoBruto, riegoEfectivo: riegoEf, etoDia: prm.et0, etcDia: prm.etc, etaDia: paso.eta, ks: paso.ks, kc: prm.kc, etapaFAO: prm.etapa, porcentajeAAU: prm.taw > 0 ? (prm.taw - dr) / prm.taw * 100 : 0, drenaje: paso.dp, fuenteHumedad: fuenteHum });
        continue;
      }

      // Día de hoy o futuro: estado y recomendación
      var disponible = prm.taw - dr, pct = prm.taw > 0 ? disponible / prm.taw * 100 : 0, critico = Math.round((1 - prm.p) * 100);
      var estado, mmRegar = 0, mmRegarTotal = 0, drenajeDia = paso.dp;
      if (lluvia.mm >= 10) estado = 'lluvia';
      else if (dr > prm.raw) {
        estado = 'regar';
        if (eficiencia > 0) { mmRegarTotal = Math.ceil(dr / eficiencia / 5) * 5; mmRegar = Math.max(10, Math.min(35, mmRegarTotal)); }
        if (asumirRiego && mmRegar > 0) { var p2 = pasoDia(dr, Object.assign({}, prm, { etc: 0 }), mmRegar * eficiencia); dr = p2.dr; drenajeDia += p2.dp; }
      } else if (pct < critico + 20) estado = 'atencion';
      else estado = 'ok';

      totales.lluviaBruta += lluvia.mm; totales.lluviaEfectiva += lluvia.mm; totales.riegoBruto += riegoBruto; totales.riegoEfectivo += riegoEf; totales.etc += prm.etc; totales.eta += paso.eta; totales.drenaje += drenajeDia;
      var pmpMM = suelo.pmp / 100 * prm.zr * 1000;
      dias.push({
        fecha: daily.time[i], fechaObj: new Date(k + 'T12:00:00'), esHoy: esHoy, esFuturo: i > indiceHoy,
        humedadInicio: pmpMM + (prm.taw - drInicio), humedadFin: pmpMM + (prm.taw - dr),
        aguaDisponible: disponible, porcentajeAAU: pct, dr: dr, taw: prm.taw, raw: prm.raw, zr: prm.zr, p: prm.p, umbralCriticoPct: critico,
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
    var estadoHoy = 'ok', regar = false, mmHoy = 0, mmTotalHoy = 0, criticoHoy = Math.round((1 - prmHoy.p) * 100);
    if (drHoy > prmHoy.raw) { regar = true; estadoHoy = 'regar'; if (eficiencia > 0) { mmTotalHoy = Math.ceil(drHoy / eficiencia / 5) * 5; mmHoy = Math.max(10, Math.min(35, mmTotalHoy)); } }
    else if (pctHoy < criticoHoy + 20) estadoHoy = 'atencion';
    var ksHoy = drHoy > prmHoy.raw ? Math.max(0, (tawHoy - drHoy) / ((1 - prmHoy.p) * tawHoy)) : 1;

    var sueloOut = Object.assign({}, suelo, { CC: Math.round(suelo.cc / 100 * prmHoy.zr * 1000), PMP: Math.round(pmpHoy), AAU: Math.round(tawHoy), zr: prmHoy.zr, coefLluvia: 1 });
    return {
      suelo: sueloOut, eficiencia: eficiencia, indiceHoy: indiceHoy, cultivo: cu, desdeSiembra: !!desdeSiembra, diasSimulados: indiceHoy - inicio,
      umbrales: umbr, umbralCriticoPct: umbr.CRITICO, umbralAtencionPct: umbr.ATENCION,
      humedadHoyMM: pmpHoy + aguaHoy, aguaDisponibleHoy: aguaHoy, porcentajeHoy: pctHoy, deficitHastaCC: drHoy, tawHoy: tawHoy, rawHoy: prmHoy.raw, ksHoy: ksHoy,
      etapaHoy: { k: prmHoy.etapa, nombre: prmHoy.nombreEtapa, dds: prmHoy.dds, ky: prmHoy.ky, kc: prmHoy.kc, zr: prmHoy.zr, critica: prmHoy.etapa === 'flor' || prmHoy.etapa === 'llen' },
      sonda: ultimaSonda ? Object.assign({}, ultimaSonda, { antiguedadDias: diasEntre(ultimaSonda.fecha, claveHoy) }) : null,
      fuentes: fuentes,
      recomendacion: { regar: regar, mm: mmHoy, mmTotal: mmTotalHoy, estado: estadoHoy, lluviaProxima: totales.lluviaBruta },
      dias: dias, pasado: pasado, totales: totales, totalesPasado: totalesPasado
    };
  }

  var SafiaBalance = {
    TEXTURAS: TEXTURAS, TIPOS_SUELO: TIPOS_SUELO, SUELO_FALLBACK: SUELO_FALLBACK, ZR_REF: ZR_REF,
    KY: KY, P_TABLA: P_TABLA, ZR_MAX: ZR_MAX, ETAPAS: ETAPAS, NOMBRE_ETAPA: NOMBRE_ETAPA,
    UMBRALES: UMBRALES, umbralesDe: umbralesDe, EFICIENCIA_RIEGO: EFICIENCIA_RIEGO,
    texturaPorArcilla: texturaPorArcilla, texturaPorClave: texturaPorClave, sueloDe: sueloDe, obtenerSuelo: obtenerSuelo, notaFallbackSuelo: notaFallbackSuelo,
    getEficienciaEquipo: getEficienciaEquipo, esSecano: esSecano,
    claveCultivo: claveCultivo, kcYEtapa: kcYEtapa, calcularKc: calcularKc, obtenerCultivoKc: obtenerCultivoKc,
    parametrosDia: parametrosDia, pasoDia: pasoDia,
    hoyLocal: hoyLocal, fechaLocal: fechaLocal, claveDia: claveDia, sumarDias: sumarDias, diasEntre: diasEntre,
    indexarEventos: indexarEventos, resolverLluviaDia: resolverLluviaDia, estacionDelCampo: estacionDelCampo,
    simular: simular,
    version: '2.0.0'
  };

  root.SafiaBalance = SafiaBalance;
  if (typeof module !== 'undefined' && module.exports) module.exports = SafiaBalance;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
