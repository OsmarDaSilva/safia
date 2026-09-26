/* ============================================================
   SAFIA · safia-casos.js — motor de casos y comparación
   ------------------------------------------------------------
   Un "caso" = una campaña cosechada con todo lo que la rodea:
     suelo (último análisis del campo) + agua (lluvia + riego) +
     clima del ciclo (temperatura, grados-día, ET0) + manejo
     (cultivo, variedad, época, densidad) + ubicación (lat, lon,
     altitud) → resultado (kg/ha).

   Expone window.SafiaCasos con:
     armarCasos()                      → lista de casos desde localStorage
     climaDelCiclo(lat, lon, desde, hasta) → Promise con resumen climático
     evaluar(prospecto, casos, opc)    → casos similares + potencial + suelo
     distanciaKm(a, b)                 → km entre dos puntos
     epocaDeSiembra(fecha)             → 'Primavera/Verano' | ...
   ============================================================ */
(function () {
  'use strict';

  // Datos anónimos de la zona (clientes y operadores): campañas cosechadas de los demás productores, sin nombres,
  // que la nube entrega ya filtradas (safia_datos_zona). Se suman a lo propio SOLO para armar casos de comparación.
  function zona() { try { return JSON.parse(localStorage.getItem('zona') || 'null') || {}; } catch (e) { return {}; } }
  function leer(clave) {
    try { var l = JSON.parse(localStorage.getItem(clave) || '[]'); l = Array.isArray(l) ? l : []; var z = zona()[clave]; return Array.isArray(z) && z.length ? l.concat(z) : l; }
    catch (e) { return []; }
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function norm(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

  function epocaDeSiembra(fecha) {
    var mes = parseInt(String(fecha || '').slice(5, 7), 10);
    if (!mes) return null;
    if (mes >= 9 && mes <= 12) return 'Primavera/Verano';
    if (mes >= 1 && mes <= 4) return 'Verano/Otoño';
    return 'Otoño/Invierno';
  }

  function distanciaKm(a, b) {
    if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
    var R = 6371, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /* Parámetros de suelo que usamos para comparar, con el "rango típico"
     que usamos para normalizar diferencias (una diferencia igual al rango
     cuenta como "totalmente distinto"). */
  var PARAMS_SUELO = [
    { k: 'ph',       n: 'pH',                  rango: 1.5, dec: 1, unidad: '' },
    { k: 'mo',       n: 'Materia orgánica',    rango: 2.5, dec: 2, unidad: '%' },
    { k: 'p',        n: 'Fósforo (P)',         rango: 25,  dec: 1, unidad: 'ppm' },
    { k: 'k',        n: 'Potasio (K)',         rango: 0.5, dec: 2, unidad: 'cmolc/dm³' },
    { k: 'ca',       n: 'Calcio (Ca)',         rango: 5,   dec: 2, unidad: 'cmolc/dm³' },
    { k: 'mg',       n: 'Magnesio (Mg)',       rango: 1.5, dec: 2, unidad: 'cmolc/dm³' },
    { k: 'cic',      n: 'CIC',                 rango: 8,   dec: 2, unidad: 'cmolc/dm³' },
    { k: 'satBases', n: 'Saturación de bases', rango: 40,  dec: 1, unidad: '%' },
    { k: 'arcilla',  n: 'Arcilla',             rango: 30,  dec: 1, unidad: '%' }
  ];

  /* Último análisis de suelo del campo con fecha hasta la cosecha
     (si no hay ninguno anterior, el más reciente que exista). */
  function sueloDelCampo(campoId, hastaFecha, equipoId) {
    var todos = leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campoId); });
    // Las muestras que forman parte de un promedio no cuentan por separado: las representa el promedio
    var sueltos = todos.filter(function (a) { return !a.enPromedio; }); if (sueltos.length) todos = sueltos;
    if (!todos.length) return null;
    // Prioridad: análisis del mismo lote/equipo; si no hay, los de "todo el campo"; si no, cualquiera del campo.
    var delLote = equipoId ? todos.filter(function (a) { return String(a.equipoId || '') === String(equipoId); }) : [];
    var generales = todos.filter(function (a) { return !a.equipoId; });
    // Primero el que ya existía a la fecha de cosecha (del lote, si no del campo);
    // si ninguno es anterior, el más viejo disponible del lote o del campo.
    function orden(l) { return l.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }); }
    function previoA(l) { if (!hastaFecha) return orden(l).slice(-1)[0] || null; var pr = orden(l).filter(function (a) { return String(a.fecha) <= String(hastaFecha); }); return pr.length ? pr.slice(-1)[0] : null; }
    return previoA(delLote) || previoA(generales) || (delLote.length ? orden(delLote)[0] : null) || (generales.length ? orden(generales)[0] : null) || orden(todos)[0];
  }

  /* Aplicaciones del Operador (eventos tipo 'aplicacion') del equipo dentro del ciclo. */
  function aplicacionesDeEventos(equipoId, desde, hasta) {
    return leer('eventos').filter(function (ev) {
      if (ev.tipo !== 'aplicacion' || String(ev.equipoId) !== String(equipoId)) return false;
      var f = String(ev.fecha || '').slice(0, 10);
      return (!desde || f >= desde) && (!hasta || f <= hasta);
    });
  }

  /* Suma de eventos del equipo entre dos fechas, por tipo. */
  function aguaDeEventos(equipoId, desde, hasta) {
    var r = { lluvia: 0, riego: 0, nLluvia: 0, nRiego: 0 };
    leer('eventos').forEach(function (ev) {
      if (String(ev.equipoId) !== String(equipoId)) return;
      var f = String(ev.fecha || '').slice(0, 10);
      if (desde && f < desde) return;
      if (hasta && f > hasta) return;
      var mm = num(ev.cantidad) || 0;
      if (ev.tipo === 'lluvia') { r.lluvia += mm; r.nLluvia++; }
      if (ev.tipo === 'riego') { r.riego += mm; r.nRiego++; }
    });
    return r;
  }

  /* ---------- armar los casos ---------- */
  function armarCasos() {
    var clientes = leer('clientes'), campos = leer('campos'), equipos = leer('equipos');
    var casos = [];

    leer('campanas').forEach(function (c) {
      var equipo = equipos.find(function (e) { return String(e.id) === String(c.equipoId); });
      var campo = equipo ? campos.find(function (x) { return String(x.id) === String(equipo.campoId); }) : null;
      var cliente = campo ? clientes.find(function (x) { return String(x.id) === String(campo.clienteId); }) : null;

      (c.cultivos || []).forEach(function (cu, i) {
        var rinde = num(cu.rendimientoReal);
        if (!rinde || rinde <= 0) return; // solo campañas cosechadas

        var siembra = cu.fechaSiembra || null;
        var cosecha = cu.fechaCosecha || ((c.cosechas && c.cosechas[i] && c.cosechas[i].fecha)) || (i === 0 && c.cosecha && c.cosecha.fecha) || null;
        var dias = (siembra && cosecha) ? Math.round((new Date(cosecha) - new Date(siembra)) / 86400000) : null;
        if (dias != null && dias < 0) dias = null;   // fechas al revés (año mal cargado): no se usan

        // Cosecha de ESTE cultivo (campañas mixtas guardan una por cultivo);
        // para campañas viejas, la cosecha única de la campaña vale para el primero.
        var cos = (c.cosechas && c.cosechas[i]) || (i === 0 ? c.cosecha : null) || null;
        // Agua: el total cargado en la cosecha manda; si no, la suma de eventos del ciclo.
        var deEventos = aguaDeEventos(c.equipoId, siembra, cosecha);
        var lluvia = (cos && cos.lluviaMM != null) ? num(cos.lluviaMM) : (deEventos.nLluvia ? deEventos.lluvia : null);
        var riego  = (cos && cos.riegoMM  != null) ? num(cos.riegoMM)  : (deEventos.nRiego  ? deEventos.riego  : null);

        var suelo = campo ? sueloDelCampo(campo.id, cosecha, c.equipoId) : null;

        casos.push({
          id: String(c.id) + '-' + i,
          campanaId: c.id,
          campana: c.nombre || '',
          cliente: cliente ? (cliente.nombre || '') : '',
          clienteId: cliente ? cliente.id : null,
          campo: campo ? (campo.nombre || '') : '',
          campoId: campo ? campo.id : null,
          equipo: equipo ? (equipo.nombre || '') : '',
          equipoId: c.equipoId,
          // Un "equipo" de tipo secano es un lote sin riego del mismo cliente: sirve para comparar.
          riego: !(equipo && equipo.tipo === 'secano'),
          pais: campo ? (campo.pais || 'Paraguay') : 'Paraguay',
          localidad: campo ? (campo.localidad || '') : '',
          departamento: campo ? (campo.departamento || '') : '',
          lat: campo ? num(campo.latitud) : null,
          lon: campo ? num(campo.longitud) : null,
          altitud: campo ? num(campo.altitud) : null,
          tipoSuelo: campo ? (campo.tipoSuelo || '') : '',
          cultivo: cu.cultivo || '',
          variedad: cu.variedad || '',
          finalidad: cu.finalidad || 'Granos Comercial',
          epoca: epocaDeSiembra(siembra),
          siembra: siembra, cosecha: cosecha, dias: dias,
          superficie: num(cu.superficie),
          densidad: num(cu.densidad),
          encaladoTnHa: num(cu.encaladoTnHa),
          fertilizacion: cu.fertilizacion || '',
          cultivoAnterior: cu.cultivoAnterior || '', cobertura: cu.cobertura || '', coberturaDetalle: cu.coberturaDetalle || '',
          sistemaSiembra: cu.sistemaSiembra || '', consorcio: cu.consorcio || '',
          labores: cu.labores || [],
          rotacion: window.SafiaInsumos ? SafiaInsumos.rotacion(cu.cultivo, cu.cultivoAnterior, cu.cobertura, cu.consorcio, cu.sistemaSiembra, cu.labores) : null,
          insumos: (c.insumos || []).filter(function (it) { return it.cultivoIdx == null || it.cultivoIdx === i; }),
          manejo: window.SafiaInsumos ? SafiaInsumos.resumen((c.insumos || []).filter(function (it) { return it.cultivoIdx == null || it.cultivoIdx === i; }), aplicacionesDeEventos(c.equipoId, siembra, cosecha), c.manejoCompleto) : null,
          rindeKgHa: rinde,
          precioUSDt: (function () { var co = (c.cosechas && c.cosechas[i]) || (i === 0 ? c.cosecha : null); return co && co.precioUSDt != null ? num(co.precioUSDt) : null; })(),   // precio de venta congelado con la cosecha
          objetivoKgHa: num(cu.rendimientoObj),
          lluviaMM: lluvia, riegoMM: riego,
          aguaTotalMM: (lluvia != null || riego != null) ? (lluvia || 0) + (riego || 0) : null,
          clima: c.clima || null,          // resumen climático del ciclo (si ya se trajo)
          suelo: suelo ? {
            fecha: suelo.fecha, ph: num(suelo.ph), mo: num(suelo.mo), p: num(suelo.p), k: num(suelo.k),
            ca: num(suelo.ca), mg: num(suelo.mg), cic: num(suelo.cic), satBases: num(suelo.satBases),
            arena: num(suelo.arena), limo: num(suelo.limo), arcilla: num(suelo.arcilla)
          } : null,
          tieneCoordenadas: !!(campo && num(campo.latitud) != null && num(campo.longitud) != null)
        });
      });
    });
    // Historial anterior a SAFIA: ciclos cargados a mano en el Banco Agronómico
    // (campañas viejas del cliente). También son casos: valen igual que las
    // campañas cerradas en la app, con origen 'historial'.
    leer('ciclos').forEach(function (ci) {
      var rinde = num(ci.rindeKgHa);
      if (!rinde || rinde <= 0) return;
      var campo = campos.find(function (x) { return String(x.id) === String(ci.campoId); });
      var cliente = campo ? clientes.find(function (x) { return String(x.id) === String(campo.clienteId); }) : null;
      var siembra = ci.fechaSiembra || null, cosecha = ci.fechaCosecha || null;
      var lluvia = num(ci.mmLluvia), riego = num(ci.mmRiego);
      var suelo = campo ? sueloDelCampo(campo.id, cosecha) : null;
      casos.push({
        id: 'hist-' + String(ci.id), campanaId: null, origen: 'historial',
        campana: 'Historial ' + String(siembra || '').slice(0, 4),
        cliente: cliente ? (cliente.nombre || '') : '', clienteId: cliente ? cliente.id : null,
        campo: campo ? (campo.nombre || '') : '', campoId: campo ? campo.id : null,
        equipo: '', equipoId: null,
        // conRiego explícito ('si'/'no'); si falta, 0 mm de riego cargados = secano, sin dato = con riego.
        riego: ci.conRiego === 'no' ? false : (ci.conRiego === 'si' ? true : num(ci.mmRiego) !== 0),
        pais: campo ? (campo.pais || 'Paraguay') : 'Paraguay',
        localidad: campo ? (campo.localidad || '') : '', departamento: campo ? (campo.departamento || '') : '',
        lat: campo ? num(campo.latitud) : null, lon: campo ? num(campo.longitud) : null, altitud: campo ? num(campo.altitud) : null,
        tipoSuelo: campo ? (campo.tipoSuelo || '') : '',
        cultivo: ci.cultivo || '', variedad: ci.variedad || '', finalidad: ci.finalidad || 'Granos Comercial', epoca: epocaDeSiembra(siembra),
        siembra: siembra, cosecha: cosecha,
        dias: (siembra && cosecha) ? Math.round((new Date(cosecha) - new Date(siembra)) / 86400000) : null,
        superficie: null, densidad: null,
        rindeKgHa: rinde, objetivoKgHa: null,
        lluviaMM: lluvia, riegoMM: riego,
        aguaTotalMM: (lluvia != null || riego != null) ? (lluvia || 0) + (riego || 0) : null,
        encaladoTnHa: num(ci.encaladoTnHa), fertilizacion: ci.fertilizacion || '',
        cultivoAnterior: ci.cultivoAnterior || '', cobertura: ci.cobertura || '', coberturaDetalle: '',
        sistemaSiembra: ci.sistemaSiembra || '', consorcio: ci.consorcio || '',
        rotacion: window.SafiaInsumos ? SafiaInsumos.rotacion(ci.cultivo, ci.cultivoAnterior, ci.cobertura, ci.consorcio, ci.sistemaSiembra) : null,
        insumos: [], manejo: window.SafiaInsumos ? SafiaInsumos.resumen([], [], false) : null,
        clima: ci.clima || null,
        suelo: suelo ? { fecha: suelo.fecha, ph: num(suelo.ph), mo: num(suelo.mo), p: num(suelo.p), k: num(suelo.k), ca: num(suelo.ca), mg: num(suelo.mg), cic: num(suelo.cic), satBases: num(suelo.satBases), arena: num(suelo.arena), limo: num(suelo.limo), arcilla: num(suelo.arcilla) } : null,
        tieneCoordenadas: !!(campo && num(campo.latitud) != null && num(campo.longitud) != null)
      });
    });

    return casos;
  }

  /* ---------- clima del ciclo (Open-Meteo, histórico) ---------- */
  function climaDelCiclo(lat, lon, desde, hasta, campoId) {
    if (!desde || !hasta) return Promise.resolve(null);
    // Estación meteorológica del campo (METOS/FieldClimate u otra): si cubre al menos el 90 % de los días del ciclo, manda sobre el estimado
    if (campoId != null && window.SafiaSensores && SafiaSensores.cobertura(campoId, desde, hasta) >= 0.9) { var re = SafiaSensores.resumenCiclo(campoId, desde, hasta); if (re) return Promise.resolve(re); }
    if (lat == null || lon == null) return Promise.resolve(null);
    var url = 'https://archive-api.open-meteo.com/v1/archive'
      + '?latitude=' + lat + '&longitude=' + lon
      + '&start_date=' + desde + '&end_date=' + hasta
      + '&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,shortwave_radiation_sum'
      + '&timezone=auto';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var d = j && j.daily;
      if (!d || !d.time || !d.time.length) return null;
      var n = 0, sMed = 0, sMax = 0, sMin = 0, dias35 = 0, gdd = 0, et0 = 0, rad = 0, lluvia = 0, diasLluvia = 0;
      var maxAbs = null, minAbs = null;
      d.time.forEach(function (_, i) {
        var tm = d.temperature_2m_mean[i], tx = d.temperature_2m_max[i], tn = d.temperature_2m_min[i];
        if (tm == null) return;
        n++; sMed += tm; sMax += (tx != null ? tx : tm); sMin += (tn != null ? tn : tm);
        if (maxAbs == null || tx > maxAbs) maxAbs = tx;
        if (minAbs == null || tn < minAbs) minAbs = tn;
        if (tx >= 35) dias35++;
        // Grados-día base 10 °C, con tope de 30 °C (lo usual para soja y maíz)
        var tEf = Math.max(10, Math.min(30, tm));
        gdd += tEf - 10;
        var e = d.et0_fao_evapotranspiration ? d.et0_fao_evapotranspiration[i] : null;
        if (e != null) et0 += e;
        var rr = d.shortwave_radiation_sum ? d.shortwave_radiation_sum[i] : null;
        if (rr != null) rad += rr;
        var p = d.precipitation_sum ? d.precipitation_sum[i] : null;
        if (p != null) { lluvia += p; if (p > 0) diasLluvia++; }
      });
      if (!n) return null;
      var r1 = function (v) { return Math.round(v * 10) / 10; };
      return {
        desde: desde, hasta: hasta, dias: n,
        tempMedia: r1(sMed / n), tempMaxMedia: r1(sMax / n), tempMinMedia: r1(sMin / n),
        tempMaxAbs: r1(maxAbs), tempMinAbs: r1(minAbs), diasMayor35: dias35,
        gradosDia: Math.round(gdd), et0Total: Math.round(et0), radiacionTotal: Math.round(rad),
        lluviaClima: r1(lluvia), diasLluviaClima: diasLluvia,
        fuente: 'Open-Meteo', traidoEn: new Date().toISOString()
      };
    }).catch(function () { return null; });
  }

  /* ---------- comparación ---------- */

  // Similitud de suelo 0..1 entre el prospecto y un caso (solo con los parámetros que ambos tienen).
  function similitudSuelo(sueloA, sueloB) {
    if (!sueloA || !sueloB) return { valor: null, n: 0 };
    var suma = 0, n = 0;
    PARAMS_SUELO.forEach(function (p) {
      var a = sueloA[p.k], b = sueloB[p.k];
      if (a == null || b == null) return;
      suma += 1 - Math.min(1, Math.abs(a - b) / p.rango); n++;
    });
    return { valor: n ? suma / n : null, n: n };
  }

  /* prospecto = { lat, lon, altitud, cultivo, epoca, suelo:{ph,mo,...}, objetivoKgHa }
     opciones  = { maxCasos: 5, radioKm: 300 } */
  function evaluar(prospecto, casos, opciones) {
    opciones = opciones || {};
    var maxCasos = opciones.maxCasos || 5;
    var radioKm = opciones.radioKm || 300;

    var candidatos = casos.filter(function (c) {
      if (prospecto.cultivo && norm(c.cultivo) !== norm(prospecto.cultivo)) return false;
      // opciones.riego: true = solo casos con riego, false = solo secano, sin definir = todos
      if (opciones.riego === true && c.riego === false) return false;
      if (opciones.riego === false && c.riego !== false) return false;
      return true;
    });

    var puntuados = candidatos.map(function (c) {
      var dKm = distanciaKm(prospecto, c);
      var sDist = dKm == null ? null : Math.max(0, 1 - dKm / radioKm);
      var sAlt = (prospecto.altitud != null && c.altitud != null) ? Math.max(0, 1 - Math.abs(prospecto.altitud - c.altitud) / 400) : null;
      var ss = similitudSuelo(prospecto.suelo, c.suelo);
      var sEpoca = (prospecto.epoca && c.epoca) ? (norm(prospecto.epoca) === norm(c.epoca) ? 1 : 0.4) : null;

      // Pesos: suelo 0.5, distancia 0.3, altitud 0.1, época 0.1 — se redistribuyen si falta un dato.
      var partes = [
        { s: ss.valor, w: 0.5 }, { s: sDist, w: 0.3 }, { s: sAlt, w: 0.1 }, { s: sEpoca, w: 0.1 }
      ].filter(function (p) { return p.s != null; });
      var wTot = partes.reduce(function (a, p) { return a + p.w; }, 0);
      var score = wTot ? partes.reduce(function (a, p) { return a + p.s * p.w; }, 0) / wTot : 0;

      return {
        caso: c, distanciaKm: dKm == null ? null : Math.round(dKm),
        similitud: Math.round(score * 100), similitudSuelo: ss.valor == null ? null : Math.round(ss.valor * 100),
        paramsComparados: ss.n
      };
    }).sort(function (a, b) { return b.similitud - a.similitud; });

    var top = puntuados.slice(0, maxCasos);

    // Potencial: promedio ponderado por similitud² de los casos más parecidos, y su rango.
    var potencial = null;
    if (top.length) {
      var sw = 0, sv = 0, min = null, max = null;
      top.forEach(function (t) {
        var w = Math.pow(Math.max(t.similitud, 1) / 100, 2);
        sw += w; sv += w * t.caso.rindeKgHa;
        if (min == null || t.caso.rindeKgHa < min) min = t.caso.rindeKgHa;
        if (max == null || t.caso.rindeKgHa > max) max = t.caso.rindeKgHa;
      });
      potencial = { estimado: Math.round(sv / sw), min: min, max: max, nCasos: top.length };
    }

    // Suelo de referencia: los casos más parecidos que MÁS rinden (mitad superior, mínimo 1),
    // o los que superan el objetivo si se cargó uno.
    var referencia = top.filter(function (t) { return t.caso.suelo; });
    if (prospecto.objetivoKgHa) {
      var sobreObjetivo = referencia.filter(function (t) { return t.caso.rindeKgHa >= prospecto.objetivoKgHa; });
      if (sobreObjetivo.length) referencia = sobreObjetivo;
    }
    referencia.sort(function (a, b) { return b.caso.rindeKgHa - a.caso.rindeKgHa; });
    referencia = referencia.slice(0, Math.max(1, Math.ceil(referencia.length / 2)));

    var comparacionSuelo = PARAMS_SUELO.map(function (p) {
      var vals = referencia.map(function (t) { return t.caso.suelo[p.k]; }).filter(function (v) { return v != null; });
      var prom = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
      var mio = prospecto.suelo ? prospecto.suelo[p.k] : null;
      var senal = null, diff = null;
      if (prom != null && mio != null) {
        diff = mio - prom;
        var rel = prom !== 0 ? diff / Math.abs(prom) : 0;
        if (p.k === 'ph') senal = Math.abs(diff) <= 0.3 ? 'igual' : (diff < 0 ? 'bajo' : 'alto');
        else if (p.k === 'arcilla') senal = Math.abs(rel) <= 0.25 ? 'igual' : (diff < 0 ? 'bajo' : 'alto');
        else senal = rel < -0.15 ? 'bajo' : (rel > 0.15 ? 'alto' : 'igual');
      }
      return { param: p, mio: mio, referencia: prom, nRef: vals.length, diferencia: diff, senal: senal };
    });

    return {
      similares: top,
      totalCandidatos: candidatos.length,
      potencial: potencial,
      referenciaSuelo: referencia.map(function (t) { return t.caso; }),
      comparacionSuelo: comparacionSuelo
    };
  }

  /* ---------- listas de ubicación para elegir (no escribir de cero) ----------
     Junta los departamentos y localidades de la base de referencia
     (safia_ref_produccion) con los de los campos ya cargados.
     Devuelve Promise<{ departamentos: [..], localidades: [{localidad, departamento}] }> */
  /* Listas oficiales de departamentos/provincias/estados por país. */
  var DIVISIONES_PAIS = {
    'Paraguay': ['Alto Paraguay', 'Alto Paraná', 'Amambay', 'Asunción', 'Boquerón', 'Caaguazú', 'Caazapá', 'Canindeyú',
      'Central', 'Concepción', 'Cordillera', 'Guairá', 'Itapúa', 'Misiones', 'Ñeembucú', 'Paraguarí', 'Presidente Hayes', 'San Pedro'],
    'Brasil': ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão',
      'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro',
      'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'],
    'Argentina': ['Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad de Buenos Aires', 'Córdoba', 'Corrientes', 'Entre Ríos',
      'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis',
      'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'],
    'Bolivia': ['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija'],
    'Uruguay': ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado',
      'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres']
  };
  // Nombres mal escritos en la base de referencia → nombre oficial
  var ALIAS_DEPTO = { 'coordillera': 'Cordillera', 'nuembucu': 'Ñeembucú', 'neembucu': 'Ñeembucú', 'parana': 'Paraná' };

  /* Distritos oficiales de Paraguay por departamento (263, Wikipedia "Anexo:Municipios de Paraguay", sep-2026)
     + localidades productivas del Chaco que no son distrito, verificadas en OpenStreetMap / Open-Meteo. */
  var DISTRITOS_PY = {"Alto Paraguay":["Bahía Negra","Capitán Carmelo Peralta","Fuerte Olimpo","Puerto Casado"],"Alto Paraná":["Ciudad del Este","Doctor Juan León Mallorquín","Doctor Raúl Peña","Domingo Martínez de Irala","Hernandarias","Iruña","Itakyry","Juan Emiliano O'Leary","Los Cedrales","Mbaracayú","Minga Guazú","Minga Porá","Naranjal","Ñacunday","Presidente Franco","San Alberto","San Cristóbal","Santa Fe del Paraná","Santa Rita","Santa Rosa del Monday","Tavapy","Yguazú"],"Amambay":["Bella Vista Norte","Capitán Bado","Cerro Corá","Karapaí","Pedro Juan Caballero","Zanja Pytá"],"Asunción":["Asunción"],"Boquerón":["Boquerón","Filadelfia","Loma Plata","Mariscal José Félix Estigarribia"],"Caaguazú":["Caaguazú","Carayaó","Coronel Oviedo","Doctor Cecilio Báez","Doctor Juan Eulogio Estigarribia","Doctor Juan Manuel Frutos","José Domingo Ocampos","La Pastora","Mariscal Francisco Solano López","Nueva Londres","Nueva Toledo","Raúl Arsenio Oviedo","Regimiento de Infantería Tres Corrales","Repatriación","San Joaquín","San José de los Arroyos","Santa Rosa del Mbutuy","Simón Bolívar","Tembiaporá","Tres de Febrero","Vaquería","Yhú"],"Caazapá":["Abaí","Buena Vista","Caazapá","Doctor Moisés Santiago Bertoni","Fulgencio Yegros","General Higinio Morínigo","Maciel","San Juan Nepomuceno","Tavaí","Tres de Mayo","Yuty"],"Canindeyú":["Corpus Christi","Curuguaty","General Francisco Caballero Álvarez","Itanará","Katueté","La Paloma del Espíritu Santo","Laurel","Maracaná","Nueva Esperanza","Puerto Adela","Saltos del Guairá","Villa Ygatimí","Yasy Cañy","Yby Pytá","Ybyrarobaná","Ypejhú"],"Central":["Areguá","Capiatá","Fernando de la Mora","Guarambaré","Itá","Itauguá","Julián Augusto Saldívar","Lambaré","Limpio","Luque","Mariano Roque Alonso","Nueva Italia","Ñemby","San Antonio","San Lorenzo","Villa Elisa","Villeta","Ypacaraí","Ypané"],"Concepción":["Arroyito","Azotey","Belén","Concepción","Horqueta","Itacuá","Loreto","Paso Barreto","Paso Horqueta","San Alfredo","San Carlos del Apa","San Lázaro","Sargento José Félix López","Yby Yaú"],"Cordillera":["Altos","Arroyos y Esteros","Atyrá","Caacupé","Caraguatay","Emboscada","Eusebio Ayala","Isla Pucú","Itacurubí de la Cordillera","Juan de Mena","Loma Grande","Mbocayaty del Yhaguy","Nueva Colombia","Piribebuy","Primero de Marzo","San Bernardino","San José Obrero","Santa Elena","Tobatí","Valenzuela"],"Guairá":["Borja","Capitán Mauricio José Troche","Coronel Martínez","Doctor Botrell","Félix Pérez Cardozo","General Eugenio Alejandrino Garay","Independencia","Itapé","Iturbe","José A. Fassardi","Mbocayaty del Guairá","Natalicio Talavera","Ñumí","Paso Yobái","San Salvador","Tebicuary","Villarrica","Yataity del Guairá"],"Itapúa":["Alto Verá","Bella Vista","Cambyretá","Capitán Meza","Capitán Miranda","Carlos Antonio López","Carmen del Paraná","Coronel José Félix Bogado","Edelira","Encarnación","Fram","General Artigas","General Delgado","Hohenau","Itapúa Poty","Jesús de Tavarangüé","José Leandro Oviedo","La Paz","Mayor Julio Dionisio Otaño","Natalio","Nueva Alborada","Obligado","Pirapó","San Cosme y Damián","San Juan del Paraná","San Pedro del Paraná","San Rafael del Paraná","Tomás Romero Pereira","Trinidad","Yatytay"],"Misiones":["Ayolas","San Ignacio Guazú","San Juan Bautista","San Miguel","San Patricio","Santa María de Fe","Santa Rosa de Lima","Santiago","Villa Florida","Yabebyry"],"Ñeembucú":["Alberdi","Cerrito","Desmochados","General José Eduvigis Díaz","Guazú Cuá","Humaitá","Isla Umbú","Laureles","Mayor José Martínez","Paso de Patria","Pilar","San Juan Bautista de Ñeembucú","Tacuaras","Villa Franca","Villa Oliva","Villalbín"],"Paraguarí":["Acahay","Caapucú","Carapeguá","Escobar","General Bernardino Caballero","La Colmena","María Antonia","Mbuyapey","Paraguarí","Pirayú","Quiindy","Quyquyhó","San Roque González de Santa Cruz","Sapucai","Tebicuarymí","Yaguarón","Ybycuí","Ybytymí"],"Presidente Hayes":["Benjamín Aceval","Campo Aceval","General José María Bruguez","José Falcón","Nanawa","Nueva Asunción","Puerto Pinasco","Teniente Esteban Martínez","Teniente Primero Manuel Irala Fernández","Villa Hayes"],"San Pedro":["Antequera","Capiibary","Choré","General Elizardo Aquino","General Isidoro Resquín","Guayaibí","Itacurubí del Rosario","Liberación","Lima","Nueva Germania","San José del Rosario","San Estanislao","San Pablo","San Pedro de Ycuamandiyú","San Vicente Pancholo","Santa Rosa del Aguaray","Tacuatí","Unión","Veinticinco de Diciembre","Villa del Rosario","Yataity del Norte","Yrybucuá"]};
  var LOCALIDADES_EXTRA_PY = {"Boquerón":["Neuland","La Patria","Mayor Infante Rivarola","Capitán Joel Estigarribia","Teniente Montanía","Fortín Toledo","Pedro P. Peña"],"Presidente Hayes":["Pozo Colorado","Río Verde","Cruce Pioneros","Chaco'i"],"Alto Paraguay":["Toro Pampa","Agua Dulce"]};

  var _cacheUbic = {};
  function listasUbicacion(pais) {
    pais = String(pais || 'Paraguay').trim();
    if (_cacheUbic[pais]) return Promise.resolve(_cacheUbic[pais]);

    var oficiales = DIVISIONES_PAIS[pais] || [];
    var deps = {};           // clave normalizada -> nombre para mostrar
    oficiales.forEach(function (d) { deps[norm(d)] = d; });

    function nombreDepto(dep) {
      dep = String(dep || '').trim();
      if (!dep) return '';
      var k = norm(dep);
      if (ALIAS_DEPTO[k]) k = norm(ALIAS_DEPTO[k]);
      if (deps[k]) return deps[k];                 // ya existe (oficial o cargado): usamos ese nombre
      var bonito = ALIAS_DEPTO[norm(dep)] || dep;
      deps[k] = bonito;
      return bonito;
    }

    var pares = {};          // "dep|loc" normalizado -> {localidad, departamento}
    function agregar(loc, dep) {
      loc = nombreLocalidad(loc);
      var d = nombreDepto(dep);
      if (!loc) return;
      var k = norm(d) + '|' + norm(loc);
      if (!pares[k] || /[áéíóúñ]/i.test(loc)) pares[k] = { localidad: loc, departamento: d };
    }

    leer('campos').forEach(function (c) {
      if (norm(c.pais || 'Paraguay') === norm(pais)) agregar(c.localidad, c.departamento);
    });
    if (norm(pais) === 'paraguay') {
      Object.keys(DISTRITOS_PY).forEach(function (d) { DISTRITOS_PY[d].forEach(function (l) { agregar(l, d); }); });
      Object.keys(LOCALIDADES_EXTRA_PY).forEach(function (d) { LOCALIDADES_EXTRA_PY[d].forEach(function (l) { agregar(l, d); }); });
    }

    var pedido = window.safiaSupabase
      ? window.safiaSupabase.from('safia_ref_produccion').select('pais,localidad,departamento')
          .then(function (r) {
            (r.data || []).forEach(function (x) { if (norm(x.pais || 'Paraguay') === norm(pais)) agregar(x.localidad, x.departamento); });
          }).catch(function () {})
      : Promise.resolve();

    return pedido.then(function () {
      var localidades = Object.keys(pares).map(function (k) { return pares[k]; })
        .sort(function (a, b) { return a.localidad.localeCompare(b.localidad); });
      _cacheUbic[pais] = {
        departamentos: Object.keys(deps).map(function (k) { return deps[k]; }).sort(function (a, b) { return a.localeCompare(b); }),
        localidades: localidades
      };
      return _cacheUbic[pais];
    });
  }

  /* ---------- buscar coordenadas de una localidad ----------
     1) Corrige abreviaturas y errores de escritura de la base de referencia ("M. Infante Rivarola",
        "Estigaribia", "Tte.", "Gral."…). 2) Busca en Open-Meteo (GeoNames). 3) Si no aparece en el
        departamento elegido, busca en OpenStreetMap (Nominatim), que cubre mucho mejor el Chaco.
     Nunca devuelve un resultado de otro departamento cuando hay departamento cargado (antes, "Mariscal
     Estigarribia" de Boquerón caía en el barrio homónimo de Asunción).
     Devuelve una promesa con [{ name, admin1, latitude, longitude, fuente }] (el mejor primero). */
  var COD_PAIS_GEO = { Paraguay: 'PY', Brasil: 'BR', Argentina: 'AR', Bolivia: 'BO', Uruguay: 'UY' };
  var ALIAS_LOCALIDAD = {
    'm. infante rivarola': 'Mayor Infante Rivarola', 'm infante rivarola': 'Mayor Infante Rivarola', 'infante rivarola': 'Mayor Infante Rivarola',
    'mariscal estigaribia': 'Mariscal Estigarribia', 'mcal. estigarribia': 'Mariscal Estigarribia', 'mcal estigarribia': 'Mariscal Estigarribia',
    'joel estigaribia': 'Capitán Joel Estigarribia', 'joel estigarribia': 'Capitán Joel Estigarribia', 'cap. joel estigarribia': 'Capitán Joel Estigarribia',
    'mariscal jose felix estigarribia': 'Mariscal Estigarribia', 'mcal. jose felix estigarribia': 'Mariscal Estigarribia',
    'tte. irala fernandez': 'Teniente 1° Manuel Irala Fernández', 'irala fernandez': 'Teniente 1° Manuel Irala Fernández', 'teniente irala fernandez': 'Teniente 1° Manuel Irala Fernández'
  };
  function variantesLocalidad(loc) {
    var base = String(loc || '').trim(), k = norm(base).replace(/\s+/g, ' ');
    var v = [];
    if (ALIAS_LOCALIDAD[k]) v.push(ALIAS_LOCALIDAD[k]);
    // distritos cuyo nombre es igual al del departamento: se buscan por el nombre del pueblo cabecera
    var CABECERA = { 'boqueron': 'Neuland' };
    if (CABECERA[k]) v.unshift(CABECERA[k]);
    var exp = base.replace(/\bTte\.?\s*1(ro|°)?\.?\s*/i, 'Teniente Primero ').replace(/\bTte\.?\s+/i, 'Teniente ').replace(/\bGral\.?\s+/i, 'General ')
      .replace(/\bCnel\.?\s+/i, 'Coronel ').replace(/\bMcal\.?\s+/i, 'Mariscal ').replace(/\bPto\.?\s+/i, 'Puerto ').replace(/\bCol\.?\s+/i, 'Colonia ')
      .replace(/\bSta\.?\s+/i, 'Santa ').replace(/\bSto\.?\s+/i, 'Santo ').replace(/\bEstigaribia\b/i, 'Estigarribia');
    v.push(exp, base);
    var sinPref = exp.replace(/^(Colonia|Puerto|Cruce)\s+/i, '');
    if (sinPref !== exp) v.push(sinPref);
    if (/Teniente Primero/i.test(exp)) v.push(exp.replace(/Teniente Primero/i, 'Teniente 1°'));
    var sinTitulo = exp.replace(/^(Capitán|Capitan|Teniente Primero|Teniente|Mayor|General|Coronel|Doctor|Mariscal|Sargento)\s+/i, '');
    if (sinTitulo !== exp && sinTitulo.split(' ').length > 1) v.push(sinTitulo);
    return v.filter(function (x, i) { return x && v.indexOf(x) === i; });
  }
  function nombreLocalidad(loc) { var s = String(loc || '').trim(), k = norm(s).replace(/\s+/g, ' '); return (typeof ALIAS_LOCALIDAD !== 'undefined' && ALIAS_LOCALIDAD[k]) || s; }
  function normLoc(loc) { return norm(nombreLocalidad(loc)); }
  function deptoCoincide(texto, depto) {
    if (!depto) return true;
    var d = norm(depto).replace(/^departamento (de )?/, ''), t = norm(texto);
    return !!d && (t.indexOf(d) !== -1 || (d.length > 3 && d.indexOf(t.replace(/^departamento (de )?/, '')) !== -1 && t.length > 3));
  }
  var TIPOS_LUGAR = ['city', 'town', 'village', 'hamlet', 'locality', 'suburb', 'municipality', 'isolated_dwelling', 'neighbourhood', 'quarter', 'county', 'district'];
  function geoOpenMeteo(nombre, depto, pais) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(nombre) + '&count=10&language=es' + (COD_PAIS_GEO[pais] ? '&countryCode=' + COD_PAIS_GEO[pais] : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      return (j.results || []).filter(function (x) { return deptoCoincide(x.admin1 || '', depto); })
        .map(function (x) { return { name: x.name, admin1: x.admin1 || '', latitude: x.latitude, longitude: x.longitude, fuente: 'Open-Meteo' }; });
    }).catch(function () { return []; });
  }
  function geoOSM(q, depto, pais) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=es&q=' + encodeURIComponent(q) + (COD_PAIS_GEO[pais] ? '&countrycodes=' + COD_PAIS_GEO[pais].toLowerCase() : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (lista) {
      var buenos = (lista || []).filter(function (x) { return TIPOS_LUGAR.indexOf(x.addresstype) !== -1 && deptoCoincide(x.display_name || '', depto); });
      var sede = false;
      if (!buenos.length) {   // el pueblo no está como lugar: la sede del distrito (juzgado de paz o municipalidad) sirve de punto aproximado
        var clave = norm(q.split(',')[0]).replace(/^(capitan|teniente|mayor|general|coronel|mariscal)s+/, '');
        buenos = (lista || []).filter(function (x) { var n = norm(x.name || ''); return /juzgado|municipalidad/.test(n) && n.indexOf(clave) !== -1 && deptoCoincide(x.display_name || '', depto); });
        sede = buenos.length > 0;
      }
      return buenos.map(function (x) {
          var a = x.address || {};
          return { name: sede ? q.split(',')[0].trim() + ' (sede del distrito)' : (x.name || String(x.display_name || '').split(',')[0]), admin1: a.state || a.region || '', latitude: +(+x.lat).toFixed(5), longitude: +(+x.lon).toFixed(5), fuente: 'OpenStreetMap' };
        });
    }).catch(function () { return []; });
  }
  function buscarLocalidad(loc, depto, pais) {
    pais = pais || 'Paraguay';
    var vars = variantesLocalidad(loc), res = [];
    var cadena = Promise.resolve();
    vars.forEach(function (v) { cadena = cadena.then(function () { if (res.length) return; return geoOpenMeteo(v, depto, pais).then(function (r) { res = res.concat(r); }); }); });
    // OpenStreetMap: de a una consulta por vez (su regla de uso es máximo una por segundo)
    vars.forEach(function (v, i) {
      cadena = cadena.then(function () {
        if (res.length) return;
        var espera = i ? new Promise(function (ok) { setTimeout(ok, 1100); }) : Promise.resolve();
        return espera.then(function () { return geoOSM(depto ? v + ', ' + depto : v, depto, pais); }).then(function (r) { res = res.concat(r); });
      });
    });
    return cadena.then(function () {
      var vistos = {};
      return res.filter(function (x) { var k = x.latitude.toFixed(2) + ',' + x.longitude.toFixed(2); if (vistos[k]) return false; vistos[k] = 1; return true; });
    });
  }

  /* Conecta los inputs de departamento y localidad a listas para elegir,
     según el país (input/select opcional). Al elegir una localidad
     conocida, completa su departamento. Si cambia el país, se rearman. */
  function conectarListasUbicacion(inputDepto, inputLocalidad, inputPais) {
    var dlD = document.createElement('datalist'); dlD.id = inputDepto.id + '_lista';
    var dlL = document.createElement('datalist'); dlL.id = inputLocalidad.id + '_lista';
    document.body.appendChild(dlD); document.body.appendChild(dlL);
    inputDepto.setAttribute('list', dlD.id); inputLocalidad.setAttribute('list', dlL.id);
    inputDepto.setAttribute('autocomplete', 'off'); inputLocalidad.setAttribute('autocomplete', 'off');

    var u = { departamentos: [], localidades: [] };

    function pintarDeptos() {
      dlD.innerHTML = u.departamentos.map(function (d) { return '<option value="' + d.replace(/"/g, '&quot;') + '">'; }).join('');
    }
    function pintarLocalidades() {
      var d = norm(inputDepto.value);
      var lista = d ? u.localidades.filter(function (l) { return norm(l.departamento) === d; }) : u.localidades;
      if (!lista.length) lista = u.localidades;
      dlL.innerHTML = lista.map(function (l) {
        return '<option value="' + l.localidad.replace(/"/g, '&quot;') + '">' + (d ? '' : l.departamento) + '</option>';
      }).join('');
    }
    function cargar() {
      var pais = inputPais ? (inputPais.value || 'Paraguay') : 'Paraguay';
      return listasUbicacion(pais).then(function (r) { u = r; pintarDeptos(); pintarLocalidades(); return r; });
    }

    inputDepto.addEventListener('input', pintarLocalidades);
    inputLocalidad.addEventListener('change', function () {
      var l = u.localidades.find(function (x) { return norm(x.localidad) === norm(inputLocalidad.value); });
      if (l && l.departamento && !inputDepto.value.trim()) { inputDepto.value = l.departamento; pintarLocalidades(); }
    });
    if (inputPais) inputPais.addEventListener('change', cargar);
    return cargar();
  }

  window.SafiaCasos = {
    armarCasos: armarCasos,
    listasUbicacion: listasUbicacion,
    conectarListasUbicacion: conectarListasUbicacion,
    buscarLocalidad: buscarLocalidad,
    normLoc: normLoc,
    nombreLocalidad: nombreLocalidad,
    climaDelCiclo: climaDelCiclo,
    evaluar: evaluar,
    distanciaKm: distanciaKm,
    epocaDeSiembra: epocaDeSiembra,
    PARAMS_SUELO: PARAMS_SUELO
  };
})();
