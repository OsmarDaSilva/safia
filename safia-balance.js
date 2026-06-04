/* =====================================================================
   SAFIA · Motor de balance hídrico (FAO-56) — FUENTE ÚNICA DE VERDAD
   ---------------------------------------------------------------------
   Reemplaza las fórmulas divergentes que vivían en clima, prediccion,
   index, operador, encargado y propietario. Toda página que calcule
   balance o recomendación de riego DEBE usar SafiaBalance.simular().

   Modelo: simulación de la humedad del suelo día por día.
     humedadMM += lluviaEfectiva + riegoEfectivo − ETc
     drenaje = max(0, humedadMM − CC)   (drenaje profundo, NO se cuenta)
     humedadMM = min(humedadMM, CC)     (tope a capacidad de campo)
     humedadMM = max(humedadMM, PMP)    (nunca por debajo de marchitez)

   Lluvia: UNA sola fuente por día (NO se suman). Prioridad:
     1) estación meteo del campo (hook futuro),
     2) evento manual cargado ese día (pisa, incluso si es 0),
     3) Open-Meteo (observado en días pasados / pronóstico en futuros).

   Riego: los eventos se guardan en mm BRUTOS (lo que aplicó el equipo).
   La eficiencia se aplica UNA sola vez acá: riegoEfectivo = bruto × efic.
   ===================================================================== */
(function (root) {
  'use strict';

  // ---- Definición ÚNICA de suelos (consolidada de prediccion/index) ----
  // coefLluvia: fracción de la lluvia que queda disponible (resto = escorrentía).
  // CC: capacidad de campo (mm) · PMP: punto de marchitez (mm) · AAU: agua útil (mm).
  var TIPOS_SUELO = {
    arenoso:         { nombre: 'Arenoso',         emoji: '🏖️', CC: 40,  PMP: 18, AAU: 22, coefLluvia: 0.95 },
    franco_arenoso:  { nombre: 'Franco arenoso',  emoji: '🌾', CC: 65,  PMP: 30, AAU: 35, coefLluvia: 0.90 },
    franco:          { nombre: 'Franco',          emoji: '🌱', CC: 90,  PMP: 40, AAU: 50, coefLluvia: 0.85 },
    franco_arcilloso:{ nombre: 'Franco arcilloso',emoji: '🟫', CC: 105, PMP: 55, AAU: 50, coefLluvia: 0.75 },
    arcilloso:       { nombre: 'Arcilloso',       emoji: '🧱', CC: 110, PMP: 70, AAU: 40, coefLluvia: 0.65 }
  };

  // Suelo por defecto cuando el campo no tiene tipoSuelo clasificado.
  var SUELO_FALLBACK = 'franco';

  // Umbrales agronómicos universales (% de agua útil aprovechable, AAU).
  var UMBRALES = {
    CRITICO: 50,   // por debajo → hay que regar
    ATENCION: 70   // alerta amarilla
  };

  // Eficiencia de riego por tipo de equipo (consolidada de operador/encargado).
  var EFICIENCIA_RIEGO = {
    pivote:         0.85,
    goteo:          0.92,
    microaspersion: 0.88,
    aspersion:      0.78,
    canon:          0.70,
    superficie:     0.50,
    otro:           0.80
  };

  // Devuelve el suelo del campo (acepta string tipo o un objeto campo).
  function obtenerSuelo(campoOrTipo) {
    var tipo = SUELO_FALLBACK;
    if (typeof campoOrTipo === 'string') {
      if (TIPOS_SUELO[campoOrTipo]) tipo = campoOrTipo;
    } else if (campoOrTipo && campoOrTipo.tipoSuelo && TIPOS_SUELO[campoOrTipo.tipoSuelo]) {
      tipo = campoOrTipo.tipoSuelo;
    }
    var s = TIPOS_SUELO[tipo];
    return {
      tipo: tipo, nombre: s.nombre, emoji: s.emoji,
      CC: s.CC, PMP: s.PMP, AAU: s.AAU, coefLluvia: s.coefLluvia,
      // true si se usó el fallback por falta de clasificación
      esFallback: !(campoOrTipo && (typeof campoOrTipo === 'string'
        ? TIPOS_SUELO[campoOrTipo]
        : campoOrTipo.tipoSuelo && TIPOS_SUELO[campoOrTipo.tipoSuelo]))
    };
  }

  // Eficiencia del equipo: usa la cargada (%) si existe, si no la tabla por tipo.
  function getEficienciaEquipo(equipo) {
    if (!equipo) return 0.80;
    if (equipo.eficiencia && parseFloat(equipo.eficiencia) > 0) {
      return parseFloat(equipo.eficiencia) / 100;
    }
    return EFICIENCIA_RIEGO[equipo.tipo] || 0.80;
  }

  // Devuelve un aviso (HTML) cuando el suelo se resolvió por FALLBACK a "franco"
  // (campo sin tipo de suelo clasificado). Devuelve '' si el suelo está clasificado.
  //   opts.plain   → solo el texto interno (sin contenedor con estilos)
  //   opts.compact → versión chica para celdas de tabla
  //   opts.link    → false para no enlazar a mis-campos.html (default: enlaza)
  function notaFallbackSuelo(suelo, opts) {
    opts = opts || {};
    if (!suelo || !suelo.esFallback) return '';
    var clasificar = (opts.link === false)
      ? 'Clasificá el suelo'
      : '<a href="mis-campos.html" style="color:#8a5713;font-weight:700;">Clasificá el suelo</a>';
    if (opts.compact) {
      return '<div style="margin-top:4px;font-size:10px;color:#8a5713;line-height:1.3;">' +
        "⚠️ Sin tipo de suelo — se usa 'franco'. " + clasificar + '</div>';
    }
    var inner = "⚠️ Este campo no tiene tipo de suelo clasificado — se usa 'franco' por defecto. " +
      clasificar + ' para un cálculo más preciso.';
    if (opts.plain) return inner;
    return '<div style="margin-top:8px;padding:8px 12px;background:rgba(184,115,26,0.10);' +
      'border-left:3px solid #B8731A;border-radius:6px;font-size:12px;color:#8a5713;' +
      'font-weight:500;line-height:1.4;">' + inner + '</div>';
  }

  // Kc según etapa fenológica (FAO-56) o estacional para perennes.
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

    var fechaSi = new Date(fechaSiembra);
    var fechaCalc = new Date(fechaCalculo);
    var dias = Math.floor((fechaCalc - fechaSi) / 86400000);
    var kc_ini = kcDef.kc_ini, kc_med = kcDef.kc_med, kc_fin = kcDef.kc_fin;
    var L_ini = kcDef.L_ini, L_des = kcDef.L_des, L_med = kcDef.L_med, L_fin = kcDef.L_fin;
    var totalDias = L_ini + L_des + L_med + L_fin;

    if (dias < 0) return { kc: 0, etapa: 'Pre-siembra' };
    if (dias <= L_ini) return { kc: kc_ini, etapa: 'Inicial' };
    if (dias <= L_ini + L_des) {
      var p1 = (dias - L_ini) / L_des;
      return { kc: kc_ini + p1 * (kc_med - kc_ini), etapa: 'Desarrollo' };
    }
    if (dias <= L_ini + L_des + L_med) return { kc: kc_med, etapa: 'Media' };
    if (dias <= totalDias) {
      var p2 = (dias - L_ini - L_des - L_med) / L_fin;
      return { kc: kc_med + p2 * (kc_fin - kc_med), etapa: 'Final' };
    }
    return { kc: kc_fin, etapa: 'Post-cosecha' };
  }

  // Busca la definición de cultivo (FAO o custom) en localStorage por nombre.
  function obtenerCultivoKc(nombreCultivo) {
    if (typeof localStorage === 'undefined') return null;
    var fao = JSON.parse(localStorage.getItem('cultivos_fao') || '[]');
    var custom = JSON.parse(localStorage.getItem('cultivos_custom') || '[]');
    var c = fao.find(function (x) { return x.nombre === nombreCultivo; });
    if (c) return Object.assign({}, c, { fuente: 'FAO' });
    c = custom.find(function (x) { return x.nombre === nombreCultivo; });
    if (c) return Object.assign({}, c, { fuente: 'CUSTOM' });
    return null;
  }

  // Normaliza cualquier fecha a 'YYYY-MM-DD' (clave de día).
  // Importante: un string que YA viene 'YYYY-MM-DD...' se trunca literal,
  // sin pasar por new Date() — así evitamos el corrimiento de día por UTC
  // en zonas horarias negativas (Paraguay UTC-3/-4). Open-Meteo y los
  // eventos guardan fechas como string local, igual que comparan las páginas.
  function claveDia(fecha) {
    if (typeof fecha === 'string') {
      var m0 = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m0) return m0[1] + '-' + m0[2] + '-' + m0[3];
      fecha = new Date(fecha);
    }
    var d = (fecha instanceof Date) ? fecha : new Date(fecha);
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + dd;
  }

  // Agrupa eventos (lluvia/riego) de UN equipo por día → mm BRUTOS sumados.
  // Devuelve { lluvia: {clave: mm}, riego: {clave: mm} }.
  function indexarEventos(eventos, equipoId) {
    var idxLluvia = {}, idxRiego = {};
    (eventos || []).forEach(function (e) {
      if (equipoId != null && e.equipoId !== equipoId) return;
      if (e.tipo !== 'lluvia' && e.tipo !== 'riego') return;
      var k = claveDia(e.fecha);
      var mm = parseFloat(e.cantidad) || 0;
      if (e.tipo === 'lluvia') idxLluvia[k] = (idxLluvia[k] || 0) + mm;
      else idxRiego[k] = (idxRiego[k] || 0) + mm;
    });
    return { lluvia: idxLluvia, riego: idxRiego };
  }

  // Resuelve la lluvia de UN día eligiendo UNA fuente (NO suma fuentes).
  //   1) estación → 2) manual (pisa, incluso 0) → 3) Open-Meteo.
  function resolverLluviaDia(clave, meteoMM, idxLluviaManual, lluviaEstacion) {
    if (lluviaEstacion && Object.prototype.hasOwnProperty.call(lluviaEstacion, clave)) {
      return { mm: lluviaEstacion[clave] || 0, fuente: 'estacion' };
    }
    if (idxLluviaManual && Object.prototype.hasOwnProperty.call(idxLluviaManual, clave)) {
      return { mm: idxLluviaManual[clave] || 0, fuente: 'manual' };
    }
    return { mm: meteoMM || 0, fuente: 'meteo' };
  }

  /* ---------------------------------------------------------------------
     simular(opts) — NÚCLEO. Simula humedad del suelo día por día.

     opts:
       campo | tipoSuelo   — fuente del suelo (objeto campo o string tipo)
       daily               — objeto Open-Meteo daily { time[], precipitation_sum[],
                             et0_fao_evapotranspiration[], ... } (arrays alineados)
       eventos             — array completo de localStorage 'eventos'
       equipoId            — para filtrar eventos del equipo
       equipo              — para la eficiencia de riego
       kcDef, fechaSiembra — para ETc (si faltan, Kc = 1 = ETo de referencia)
       hoy                 — Date opcional (default: hoy real; para tests)
       diasPasado          — días pasados a simular para estimar humedad actual (14)
       diasFuturo          — días desde hoy a proyectar, incl. hoy (7)
       humedadInicialFrac  — humedad inicial como fracción de CC (0.8)
       lluviaEstacionPorFecha — hook estación: { 'YYYY-MM-DD': mm }
       asumirRiegoRecomendado — si true, la trayectoria futura asume que se
                             riega cuando entra en crítico (default true)

     Devuelve un objeto con humedad actual, recomendación, arrays día a día
     y totales del período. Ver README al pie de la función.
  --------------------------------------------------------------------- */
  function simular(opts) {
    opts = opts || {};
    var daily = opts.daily;
    if (!daily || !daily.time || !daily.time.length) {
      throw new Error('SafiaBalance.simular: falta daily (Open-Meteo) con arrays');
    }

    var suelo = obtenerSuelo(opts.campo || opts.tipoSuelo);
    var eficiencia = (typeof opts.eficiencia === 'number')
      ? opts.eficiencia
      : getEficienciaEquipo(opts.equipo);

    var diasPasado = (opts.diasPasado != null) ? opts.diasPasado : 14;
    var diasFuturo = (opts.diasFuturo != null) ? opts.diasFuturo : 7;
    var fracIni = (opts.humedadInicialFrac != null) ? opts.humedadInicialFrac : 0.8;
    var asumirRiego = (opts.asumirRiegoRecomendado !== false);
    var estacion = opts.lluviaEstacionPorFecha || null;

    var idx = indexarEventos(opts.eventos, opts.equipoId);

    var hoy = opts.hoy ? new Date(opts.hoy) : new Date();
    hoy.setHours(0, 0, 0, 0);
    var claveHoy = claveDia(hoy);

    // Índice de HOY dentro del array daily.time
    var indiceHoy = -1;
    for (var t = 0; t < daily.time.length; t++) {
      if (claveDia(daily.time[t]) === claveHoy) { indiceHoy = t; break; }
    }
    if (indiceHoy < 0) {
      // Fallback: asumir que hay 'diasPasado' días previos antes de hoy.
      indiceHoy = Math.min(diasPasado, daily.time.length - 1);
    }

    function etcDe(i, fechaDia) {
      var eto = (daily.et0_fao_evapotranspiration && daily.et0_fao_evapotranspiration[i]) || 0;
      var k = calcularKc(opts.kcDef, fechaDia, opts.fechaSiembra);
      return { eto: eto, kc: k.kc, etapa: k.etapa, etc: eto * k.kc };
    }

    function clampHumedad(h) {
      var drenaje = Math.max(0, h - suelo.CC);
      h = Math.min(h, suelo.CC);
      h = Math.max(suelo.PMP, h);
      return { h: h, drenaje: drenaje };
    }

    // --- Estado inicial + simulación del PASADO (estima humedad de hoy) ---
    var humedadMM = suelo.CC * fracIni;
    var c0 = clampHumedad(humedadMM); humedadMM = c0.h;

    var totalesPasado = { lluviaBruta: 0, lluviaEfectiva: 0, riegoBruto: 0, riegoEfectivo: 0, etc: 0, drenaje: 0 };

    var inicio = Math.max(0, indiceHoy - diasPasado);
    for (var i = inicio; i < indiceHoy; i++) {
      var fechaP = new Date(daily.time[i]);
      var kP = claveDia(daily.time[i]);
      var lluviaP = resolverLluviaDia(kP, daily.precipitation_sum && daily.precipitation_sum[i], idx.lluvia, estacion);
      var lluviaEfP = lluviaP.mm * suelo.coefLluvia;
      var riegoBrutoP = idx.riego[kP] || 0;
      var riegoEfP = riegoBrutoP * eficiencia;
      var eP = etcDe(i, fechaP);

      humedadMM += lluviaEfP + riegoEfP - eP.etc;
      var cP = clampHumedad(humedadMM); humedadMM = cP.h;

      totalesPasado.lluviaBruta += lluviaP.mm;
      totalesPasado.lluviaEfectiva += lluviaEfP;
      totalesPasado.riegoBruto += riegoBrutoP;
      totalesPasado.riegoEfectivo += riegoEfP;
      totalesPasado.etc += eP.etc;
      totalesPasado.drenaje += cP.drenaje;
    }

    var humedadHoyMM = humedadMM;

    // --- Simulación del FUTURO (hoy + próximos días) ---
    var dias = [];
    var totales = { lluviaBruta: 0, lluviaEfectiva: 0, riegoBruto: 0, riegoEfectivo: 0, etc: 0, drenaje: 0 };

    for (var j = indiceHoy; j < indiceHoy + diasFuturo && j < daily.time.length; j++) {
      var fechaD = new Date(daily.time[j]);
      var kD = claveDia(daily.time[j]);
      var esHoy = (j === indiceHoy);
      var humedadInicio = humedadMM;

      var lluvia = resolverLluviaDia(kD, daily.precipitation_sum && daily.precipitation_sum[j], idx.lluvia, estacion);
      var lluviaEf = lluvia.mm * suelo.coefLluvia;
      var riegoBruto = idx.riego[kD] || 0;        // riego ya cargado para ese día
      var riegoEf = riegoBruto * eficiencia;
      var e = etcDe(j, fechaD);

      humedadMM += lluviaEf + riegoEf - e.etc;
      var c = clampHumedad(humedadMM); humedadMM = c.h;

      var aguaDisponible = humedadMM - suelo.PMP;
      var porcentajeAAU = (aguaDisponible / suelo.AAU) * 100;

      // Recomendación del día
      var estado, mmRegar = 0;
      if (lluvia.mm >= 10) {
        estado = 'lluvia';
      } else if (porcentajeAAU < UMBRALES.CRITICO) {
        estado = 'regar';
        mmRegar = Math.ceil((suelo.CC - humedadMM) / 5) * 5;
        mmRegar = Math.max(15, Math.min(35, mmRegar));
        if (asumirRiego) {
          // La trayectoria futura asume que se sigue la recomendación.
          humedadMM += mmRegar * eficiencia;
          var c2 = clampHumedad(humedadMM); humedadMM = c2.h;
          c.drenaje += c2.drenaje;
        }
      } else if (porcentajeAAU < UMBRALES.ATENCION) {
        estado = 'atencion';
      } else {
        estado = 'ok';
      }

      totales.lluviaBruta += lluvia.mm;
      totales.lluviaEfectiva += lluviaEf;
      totales.riegoBruto += riegoBruto;
      totales.riegoEfectivo += riegoEf;
      totales.etc += e.etc;
      totales.drenaje += c.drenaje;

      dias.push({
        fecha: daily.time[j],
        fechaObj: fechaD,
        esHoy: esHoy,
        esFuturo: j > indiceHoy,
        humedadInicio: humedadInicio,
        humedadFin: humedadMM,
        aguaDisponible: aguaDisponible,
        porcentajeAAU: porcentajeAAU,
        lluviaBruta: lluvia.mm,
        lluviaEfectiva: lluviaEf,
        fuenteLluvia: lluvia.fuente,
        riegoBruto: riegoBruto,
        riegoEfectivo: riegoEf,
        etoDia: e.eto,
        kc: e.kc,
        etapa: e.etapa,
        etcDia: e.etc,
        drenaje: c.drenaje,
        estado: estado,
        mmRegar: mmRegar,
        probLluvia: daily.precipitation_probability_max ? daily.precipitation_probability_max[j] : null,
        tMax: daily.temperature_2m_max ? daily.temperature_2m_max[j] : null,
        tMin: daily.temperature_2m_min ? daily.temperature_2m_min[j] : null,
        weatherCode: daily.weather_code ? daily.weather_code[j] : null
      });
    }

    // Recomendación global (basada en HOY)
    var hoyData = dias[0] || null;
    var aguaHoy = humedadHoyMM - suelo.PMP;
    var pctHoy = (aguaHoy / suelo.AAU) * 100;
    var deficitHastaCC = Math.max(0, suelo.CC - humedadHoyMM);
    var mmRegarHoy = 0, regar = false, estadoHoy = 'ok';
    var lluviaProxima = totales.lluviaBruta; // lluvia prevista en la ventana futura
    if (pctHoy < UMBRALES.CRITICO) {
      regar = true; estadoHoy = 'regar';
      mmRegarHoy = Math.max(15, Math.min(35, Math.ceil(deficitHastaCC / 5) * 5));
    } else if (pctHoy < UMBRALES.ATENCION) {
      estadoHoy = 'atencion';
    }

    return {
      suelo: suelo,
      eficiencia: eficiencia,
      indiceHoy: indiceHoy,
      umbralCriticoPct: UMBRALES.CRITICO,
      umbralAtencionPct: UMBRALES.ATENCION,

      // Estado de HOY
      humedadHoyMM: humedadHoyMM,
      aguaDisponibleHoy: aguaHoy,
      porcentajeHoy: pctHoy,
      deficitHastaCC: deficitHastaCC,

      // Recomendación
      recomendacion: { regar: regar, mm: mmRegarHoy, estado: estadoHoy, lluviaProxima: lluviaProxima },

      // Detalle
      dias: dias,
      totales: totales,
      totalesPasado: totalesPasado
    };
  }

  var SafiaBalance = {
    TIPOS_SUELO: TIPOS_SUELO,
    SUELO_FALLBACK: SUELO_FALLBACK,
    UMBRALES: UMBRALES,
    EFICIENCIA_RIEGO: EFICIENCIA_RIEGO,
    obtenerSuelo: obtenerSuelo,
    notaFallbackSuelo: notaFallbackSuelo,
    getEficienciaEquipo: getEficienciaEquipo,
    calcularKc: calcularKc,
    obtenerCultivoKc: obtenerCultivoKc,
    indexarEventos: indexarEventos,
    resolverLluviaDia: resolverLluviaDia,
    claveDia: claveDia,
    simular: simular,
    version: '1.0.0'
  };

  // Exponer como global (navegador) y como módulo (node/tests).
  root.SafiaBalance = SafiaBalance;
  if (typeof module !== 'undefined' && module.exports) module.exports = SafiaBalance;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
