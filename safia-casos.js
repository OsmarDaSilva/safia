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

  function leer(clave) {
    try { var l = JSON.parse(localStorage.getItem(clave) || '[]'); return Array.isArray(l) ? l : []; }
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
          rindeKgHa: rinde,
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
        clima: ci.clima || null,
        suelo: suelo ? { fecha: suelo.fecha, ph: num(suelo.ph), mo: num(suelo.mo), p: num(suelo.p), k: num(suelo.k), ca: num(suelo.ca), mg: num(suelo.mg), cic: num(suelo.cic), satBases: num(suelo.satBases), arena: num(suelo.arena), limo: num(suelo.limo), arcilla: num(suelo.arcilla) } : null,
        tieneCoordenadas: !!(campo && num(campo.latitud) != null && num(campo.longitud) != null)
      });
    });

    return casos;
  }

  /* ---------- clima del ciclo (Open-Meteo, histórico) ---------- */
  function climaDelCiclo(lat, lon, desde, hasta) {
    if (lat == null || lon == null || !desde || !hasta) return Promise.resolve(null);
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
        n++; sMed += tm; sMax += tx; sMin += tn;
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
      loc = String(loc || '').trim();
      var d = nombreDepto(dep);
      if (!loc) return;
      var k = norm(d) + '|' + norm(loc);
      if (!pares[k] || /[áéíóúñ]/i.test(loc)) pares[k] = { localidad: loc, departamento: d };
    }

    leer('campos').forEach(function (c) {
      if (norm(c.pais || 'Paraguay') === norm(pais)) agregar(c.localidad, c.departamento);
    });

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
    climaDelCiclo: climaDelCiclo,
    evaluar: evaluar,
    distanciaKm: distanciaKm,
    epocaDeSiembra: epocaDeSiembra,
    PARAMS_SUELO: PARAMS_SUELO
  };
})();
