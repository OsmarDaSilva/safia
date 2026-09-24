/* SAFIA — Equipos y sensores conectados
   -------------------------------------------------------------------
   Capa única para que los datos de los equipos entren a SAFIA sin cargarlos
   a mano. Cada fuente tiene un "adaptador" que convierte lo que entrega el
   equipo al formato de SAFIA; agregar un equipo nuevo es agregar un
   adaptador, sin tocar el resto.

   1) ESTACIÓN METEOROLÓGICA (METOS / FieldClimate, Pessl Instruments)
      - El campo guarda `estacionId` (el ID de la estación en FieldClimate).
      - La edge function `safia-fieldclimate` habla con la API (claves HMAC
        de la cuenta de Irrigar como secrets del servidor).
      - `sincronizarCampo(campo)` trae el diario (lluvia, temperatura, HR,
        ET0, radiación, viento, humedad de suelo) → colección
        `clima_estacion` (tabla safia_clima_estacion) y, para cada lote del
        campo, eventos de lluvia con cargadoPor = 'estacion' (el dato manual
        se respeta; el estimado del clima se reemplaza).
      - El clima del ciclo (safia-casos) y el tiempo térmico del NDVI usan
        la estación cuando cubre el período; si no, Open-Meteo.
   2) PINZA FOLIAR (Dualex de METOS: clorofila µg/cm², flavonoles, antocianinas,
      NBI = Chl/Flav; con GPS) y cualquier otro sensor foliar (SPAD, etc.)
      - El equipo entrega un CSV/TXT por USB ("DX aaaammdd.csv"): 4 líneas
        de metadatos, encabezado (groupe, mesure, fecha, hora, lat, lon,
        lado, Chl, Flav, Anth, NBI, …), bloques "#Groupe" y bytes nulos.
        `leerTexto` lo limpia y reconoce las columnas por nombre; sirve
        para otros sensores con columnas parecidas (spad, chl, nbi…).
      - `agrupar` promedia por grupo (= zona medida), `asignarLote` ubica
        cada grupo en el lote por GPS (punto en polígono) y
        `guardarGrupos` crea análisis foliares tipo 'sensor' (chl, flav,
        anth, nbi, spad, n, desvío, puntos) que safia-foliar interpreta.
   3) ESCÁNER DE SUELO / MAPAS (fertilidad, compactación, conductividad)
      - Entran por Mapas georreferenciados (Motor 7): CSV, GeoJSON, KML o
        shapefile con más parámetros reconocidos (N mineral, S, B, Zn, Cu,
        Mn, Al, conductividad eléctrica, compactación/resistencia a la
        penetración, humedad, arena, limo). Ver safia-mapas.js.
   Depende de window.SafiaBanco (Banco) o de leer/guardar de localStorage
   (Campos). */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  function leer(k) { if (B() && B().leer) return B().leer(k); try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function guardar(k, l) { if (B() && B().guardar) B().guardar(k, l); else localStorage.setItem(k, JSON.stringify(l)); }
  function toast(m, err) { if (B() && B().toast) B().toast(m, err); else if (err) alert(m); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v == null || v === '') return null; var s = String(v).trim(); if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function hoyISO() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }   // hoy en hora local (Paraguay), no UTC
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

  var FUENTES = [
    { k: 'fieldclimate', n: 'Estación meteorológica METOS (FieldClimate)', tipo: 'estacion', estado: 'listo' },
    { k: 'dualex', n: 'Pinza foliar Dualex (METOS): clorofila, flavonoles, NBI', tipo: 'foliar', estado: 'listo (formato a confirmar con archivo real)' },
    { k: 'spad', n: 'Clorofilómetro SPAD u otro sensor foliar (CSV)', tipo: 'foliar', estado: 'listo' },
    { k: 'escaner_suelo', n: 'Escáner de suelo / mapas de fertilidad y compactación', tipo: 'mapa', estado: 'listo (Mapas georreferenciados)' }
  ];

  /* ============================ ESTACIÓN (FieldClimate) ============================ */
  function invocar(cuerpo) {
    if (!window.safiaSupabase) return Promise.reject(new Error('Sin conexión a internet'));
    return window.safiaSupabase.functions.invoke('safia-fieldclimate', { body: cuerpo }).then(function (r) {
      if (r.error) {
        if (r.error.context && typeof r.error.context.json === 'function') return r.error.context.json().then(function (j) { throw new Error((j && j.error) ? j.error + (j.detalle ? ' · ' + j.detalle : '') : r.error.message); }, function () { throw r.error; });
        throw r.error;
      }
      if (r.data && r.data.error) throw new Error(r.data.error + (r.data.detalle ? ' · ' + r.data.detalle : ''));
      return r.data;
    });
  }
  function estadoEstacion() { return invocar({ accion: 'estado' }); }
  function estaciones() { return invocar({ accion: 'estaciones' }).then(function (d) { return d.estaciones || []; }); }
  function diario(estacionId, desde, hasta) { return invocar({ accion: 'diario', estacion: estacionId, desde: desde, hasta: hasta }).then(function (d) { return d.filas || []; }); }

  function climaDeEstacion(campoId, desde, hasta) {
    return leer('clima_estacion').filter(function (r) { return String(r.campoId) === String(campoId) && (!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta); }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
  }
  function cobertura(campoId, desde, hasta) {
    if (!desde || !hasta) return 0;
    var n = diasEntre(desde, hasta) + 1; if (n <= 0) return 0;
    var filas = climaDeEstacion(campoId, desde, hasta).filter(function (r) { return r.tmedia != null || r.lluvia != null; });
    return filas.length / n;
  }
  // Trae el diario de la estación del campo y lo guarda; devuelve un resumen. `desde` opcional (por defecto sigue desde el último dato o 400 días atrás).
  function sincronizarCampo(campo, opciones) {
    opciones = opciones || {};
    if (!campo || !campo.estacionId) return Promise.reject(new Error('Este campo no tiene estación asignada (Campos → Estación meteorológica)'));
    var previas = climaDeEstacion(campo.id), ultima = previas.length ? previas[previas.length - 1].fecha : null;
    var desde = opciones.desde || (ultima ? sumarDias(ultima, -2) : sumarDias(hoyISO(), -400)), hasta = opciones.hasta || hoyISO();
    if (desde > hasta) desde = hasta;
    return diario(campo.estacionId, desde, hasta).then(function (filas) {
      var todas = leer('clima_estacion'), idx = {}; todas.forEach(function (r, i) { idx[String(r.campoId) + '|' + r.fecha] = i; });
      var nuevas = 0, actualizadas = 0;
      filas.forEach(function (f) {
        if (!f.fecha) return;
        var item = Object.assign({}, f, { id: String(campo.id) + '|' + f.fecha, campoId: campo.id, estacionId: campo.estacionId, fuente: 'fieldclimate', traidoEn: new Date().toISOString() });
        var k = String(campo.id) + '|' + f.fecha;
        if (idx[k] != null) { todas[idx[k]] = item; actualizadas++; } else { todas.push(item); idx[k] = todas.length - 1; nuevas++; }
      });
      guardar('clima_estacion', todas);
      var lluvias = lluviaAEventos(campo, filas);
      return { desde: desde, hasta: hasta, dias: filas.length, nuevas: nuevas, actualizadas: actualizadas, lluvia: lluvias, mmTotal: Math.round(filas.reduce(function (a, f) { return a + (f.lluvia || 0); }, 0)) };
    });
  }
  // Lluvia medida → eventos de lluvia de cada lote del campo. Respeta lo cargado a mano o por voz; reemplaza el estimado del clima ('meteo').
  function lluviaAEventos(campo, filas) {
    var equipos = leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
    if (!equipos.length) return { creados: 0, reemplazados: 0, respetados: 0 };
    var eventos = leer('eventos'), ids = {}; eventos.forEach(function (e) { ids[Number(e.id)] = 1; });
    var prox = Date.now(); function nuevoId() { while (ids[prox]) prox++; ids[prox] = 1; return prox++; }
    var creados = 0, reemplazados = 0, respetados = 0;
    equipos.forEach(function (eq) {
      var porFecha = {};
      eventos.forEach(function (e, i) { if (e.tipo === 'lluvia' && String(e.equipoId) === String(eq.id)) porFecha[String(e.fecha).slice(0, 10)] = i; });
      filas.forEach(function (f) {
        if (f.lluvia == null) return;
        var i = porFecha[f.fecha];
        if (i != null) {
          var ev = eventos[i];
          if (ev.cargadoPor === 'meteo' || ev.cargadoPor === 'estacion') {
            if (f.lluvia > 0) { if (ev.cantidad !== f.lluvia || ev.cargadoPor !== 'estacion') { ev.cantidad = f.lluvia; ev.cargadoPor = 'estacion'; ev.observaciones = 'Medido por la estación ' + campo.estacionId; reemplazados++; } }
            else { eventos.splice(i, 1); reemplazados++; eventos.forEach(function (e2, j) { if (e2.tipo === 'lluvia' && String(e2.equipoId) === String(eq.id)) porFecha[String(e2.fecha).slice(0, 10)] = j; }); }
          } else respetados++;
          return;
        }
        if (f.lluvia <= 0) return;
        eventos.push({ id: nuevoId(), fecha: f.fecha, equipoId: eq.id, tipo: 'lluvia', cantidad: f.lluvia, unidad: 'mm', cargadoPor: 'estacion', observaciones: 'Medido por la estación ' + campo.estacionId, fechaCreacion: new Date().toISOString() });
        porFecha[f.fecha] = eventos.length - 1; creados++;
      });
    });
    if (creados || reemplazados) guardar('eventos', eventos);
    return { creados: creados, reemplazados: reemplazados, respetados: respetados };
  }
  // Resumen del ciclo con el mismo formato que SafiaCasos.climaDelCiclo (para usarlo en su lugar cuando la estación cubre el período)
  function resumenCiclo(campoId, desde, hasta) {
    var filas = climaDeEstacion(campoId, desde, hasta);
    if (!filas.length) return null;
    var n = 0, sMed = 0, sMax = 0, sMin = 0, dias35 = 0, gdd = 0, et0 = 0, nEt0 = 0, rad = 0, lluvia = 0, diasLluvia = 0, maxAbs = null, minAbs = null;
    filas.forEach(function (f) {
      var tm = f.tmedia != null ? f.tmedia : (f.tmax != null && f.tmin != null ? (f.tmax + f.tmin) / 2 : null);
      if (tm == null) return;
      n++; sMed += tm; sMax += f.tmax != null ? f.tmax : tm; sMin += f.tmin != null ? f.tmin : tm;
      if (f.tmax != null && (maxAbs == null || f.tmax > maxAbs)) maxAbs = f.tmax;
      if (f.tmin != null && (minAbs == null || f.tmin < minAbs)) minAbs = f.tmin;
      if (f.tmax >= 35) dias35++;
      gdd += Math.max(10, Math.min(30, tm)) - 10;
      if (f.et0 != null) { et0 += f.et0; nEt0++; }
      if (f.rad != null) rad += f.rad;
      if (f.lluvia != null) { lluvia += f.lluvia; if (f.lluvia > 0) diasLluvia++; }
    });
    if (!n) return null;
    var r1 = function (v) { return v == null ? null : Math.round(v * 10) / 10; };
    return { desde: desde, hasta: hasta, dias: n, tempMedia: r1(sMed / n), tempMaxMedia: r1(sMax / n), tempMinMedia: r1(sMin / n), tempMaxAbs: r1(maxAbs), tempMinAbs: r1(minAbs), diasMayor35: dias35, gradosDia: Math.round(gdd), et0Total: nEt0 ? Math.round(et0) : null, radiacionTotal: Math.round(rad), lluviaClima: r1(lluvia), diasLluviaClima: diasLluvia, fuente: 'Estación ' + (filas[0].estacionId || ''), traidoEn: new Date().toISOString() };
  }
  // Temperatura media diaria de la estación (para el tiempo térmico del NDVI): { fecha: tmedia }
  function temperaturasEstacion(campoId, desde, hasta) {
    var out = {}; climaDeEstacion(campoId, desde, hasta).forEach(function (f) { var tm = f.tmedia != null ? f.tmedia : (f.tmax != null && f.tmin != null ? (f.tmax + f.tmin) / 2 : null); if (tm != null) out[f.fecha] = tm; }); return out;
  }

  /* ============================ SENSORES FOLIARES (Dualex y otros) ============================ */
  var COLS = [
    { k: 'grupo', re: /^(groupe|group|grp|zona|zone|parcela|plot|lote)$/i },
    { k: 'medicion', re: /^(mesure|measure|measurement|mes|n|num|nro|id)$/i },
    { k: 'fecha', re: /(date|jj\/mm|dd\/mm|fecha|data)/i },
    { k: 'hora', re: /^(time|heure|hora|hh:mm)/i },
    { k: 'lat', re: /^(lat|latitude|latitud|y)$/i },
    { k: 'lon', re: /^(lon|long|longitude|longitud|lng|x)$/i },
    { k: 'lado', re: /^(side|face|cote|côté|lado|sup_inf)$/i },
    { k: 'chl', re: /^(chl|chlorophyll|clorofila|chl_?index)/i },
    { k: 'flav', re: /^(flav|flavonol)/i },
    { k: 'anth', re: /^(anth|anthocyan|antocian)/i },
    { k: 'nbi', re: /^(nbi|nitrogen balance)/i },
    { k: 'spad', re: /^(spad|spad_?value|clorofila_spad)/i },
    { k: 'calidadGps', re: /^(qual_sat|gps_quality|sat)/i },
    { k: 'calibracion', re: /^(etal|calib)/i }
  ];
  function partirLinea(l, delim) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < l.length; i++) { var c = l[i]; if (c === '"') { q = !q; continue; } if (c === delim && !q) { out.push(cur); cur = ''; continue; } cur += c; }
    out.push(cur); return out.map(function (x) { return x.trim(); });
  }
  function fechaISO(s) {
    if (!s) return null; s = String(s).trim();
    var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/); if (m) { var a = m[3].length === 2 ? '20' + m[3] : m[3]; return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    return null;
  }
  // Lee el texto del archivo del Dualex (o de otro sensor con columnas parecidas) → { fuente, columnas, mapeo, lecturas }
  function leerTexto(texto, nombreArchivo) {
    var t = String(texto).replace(/\u0000/g, '').replace(/\r/g, '');
    var lineas = t.split('\n').map(function (l) { return l.replace(/^﻿/, ''); });
    var iCab = -1;
    for (var i = 0; i < Math.min(lineas.length, 40); i++) { var l = lineas[i]; if (/^\s*#/.test(l)) continue; if (/chl|spad|nbi/i.test(l) && /[;,\t]/.test(l)) { iCab = i; break; } }
    if (iCab < 0) throw new Error('No encontré la fila de encabezado (tiene que tener columnas como Chl, Flav, NBI o SPAD).');
    var cab = lineas[iCab];
    var delim = [';', '\t', ','].map(function (d) { return { d: d, n: cab.split(d).length }; }).sort(function (a, b) { return b.n - a.n; })[0].d;
    var columnas = partirLinea(cab, delim).map(function (c, i) { return c || ('col' + (i + 1)); });
    var mapeo = {};
    COLS.forEach(function (cd) { columnas.forEach(function (c) { if (!mapeo[cd.k] && cd.re.test(c.replace(/\s+/g, ' ').trim())) mapeo[cd.k] = c; }); });
    if (!mapeo.chl && !mapeo.spad && !mapeo.nbi) throw new Error('El archivo no tiene columnas de clorofila (Chl / SPAD) ni de NBI.');
    var lecturas = [], grupoActual = null;
    for (var j = iCab + 1; j < lineas.length; j++) {
      var ln = lineas[j]; if (!ln.trim()) continue;
      if (/^\s*#/.test(ln)) { var mg = ln.match(/#\s*group?e?\s*[:=]?\s*(\d+)/i); if (mg) grupoActual = mg[1]; continue; }
      var p = partirLinea(ln, delim); if (p.length < 2) continue;
      var f = {}; columnas.forEach(function (c, k) { f[c] = p[k]; });
      var lec = { grupo: mapeo.grupo ? String(f[mapeo.grupo] || '').trim() || grupoActual : grupoActual, medicion: mapeo.medicion ? f[mapeo.medicion] : null, fecha: mapeo.fecha ? fechaISO(f[mapeo.fecha]) : null, hora: mapeo.hora ? f[mapeo.hora] : null,
        lat: mapeo.lat ? num(f[mapeo.lat]) : null, lon: mapeo.lon ? num(f[mapeo.lon]) : null, lado: mapeo.lado ? String(f[mapeo.lado] || '').toLowerCase() : null,
        chl: mapeo.chl ? num(f[mapeo.chl]) : null, flav: mapeo.flav ? num(f[mapeo.flav]) : null, anth: mapeo.anth ? num(f[mapeo.anth]) : null, nbi: mapeo.nbi ? num(f[mapeo.nbi]) : null, spad: mapeo.spad ? num(f[mapeo.spad]) : null };
      if (lec.lat != null && (Math.abs(lec.lat) > 90 || lec.lat === 0)) lec.lat = null;
      if (lec.lon != null && (Math.abs(lec.lon) > 180 || lec.lon === 0)) lec.lon = null;
      if (lec.chl == null && lec.nbi == null && lec.spad == null) continue;
      if (lec.nbi == null && lec.chl != null && lec.flav) lec.nbi = Math.round(lec.chl / lec.flav * 100) / 100;
      lecturas.push(lec);
    }
    var fuente = /dualex|^dx/i.test(nombreArchivo || '') || (mapeo.flav && mapeo.nbi) ? 'dualex' : (mapeo.spad ? 'spad' : 'sensor');
    // Dualex: se recomienda usar solo la cara superior; si el archivo trae ambas, se quedan las "sup" (o todas si no se distingue)
    var sup = lecturas.filter(function (l) { return l.lado && /sup|ad|upper|haut/.test(l.lado); });
    if (sup.length && sup.length < lecturas.length) lecturas = sup;
    return { fuente: fuente, delimitador: delim, columnas: columnas, mapeo: mapeo, lecturas: lecturas, fecha: (lecturas.find(function (l) { return l.fecha; }) || {}).fecha || null };
  }
  function estad(vals) { var v = vals.filter(function (x) { return x != null && isFinite(x); }); if (!v.length) return null; var m = v.reduce(function (a, b) { return a + b; }, 0) / v.length; var sd = Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / v.length); return { n: v.length, media: Math.round(m * 100) / 100, sd: Math.round(sd * 100) / 100, min: Math.min.apply(null, v), max: Math.max.apply(null, v) }; }
  // Promedia por grupo (zona medida). Si el archivo no trae grupos, todo es un grupo.
  function agrupar(lecturas) {
    var g = {};
    lecturas.forEach(function (l) { var k = l.grupo != null && l.grupo !== '' ? String(l.grupo) : '1'; (g[k] = g[k] || []).push(l); });
    return Object.keys(g).sort(function (a, b) { return (+a || 0) - (+b || 0) || a.localeCompare(b); }).map(function (k) {
      var ls = g[k], con = ls.filter(function (l) { return l.lat != null && l.lon != null; });
      var lat = con.length ? con.reduce(function (a, l) { return a + l.lat; }, 0) / con.length : null, lon = con.length ? con.reduce(function (a, l) { return a + l.lon; }, 0) / con.length : null;
      return { grupo: k, n: ls.length, fecha: (ls.find(function (l) { return l.fecha; }) || {}).fecha || null, lat: lat, lon: lon, conGps: con.length,
        chl: estad(ls.map(function (l) { return l.chl; })), flav: estad(ls.map(function (l) { return l.flav; })), anth: estad(ls.map(function (l) { return l.anth; })), nbi: estad(ls.map(function (l) { return l.nbi; })), spad: estad(ls.map(function (l) { return l.spad; })),
        puntos: ls.map(function (l) { return { lat: l.lat, lon: l.lon, chl: l.chl, nbi: l.nbi, spad: l.spad }; }) };
    });
  }
  // Punto en polígono (ray casting). anillo = [[lat, lon], ...]
  function dentroDeAnillo(lat, lon, anillo) {
    var dentro = false;
    for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      var yi = anillo[i][0], xi = anillo[i][1], yj = anillo[j][0], xj = anillo[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) dentro = !dentro;
    }
    return dentro;
  }
  function loteEnPunto(lat, lon, lotes) {
    if (lat == null || lon == null) return null;
    for (var i = 0; i < lotes.length; i++) { var p = lotes[i].poligono; if (!p || !p.partes) continue; for (var k = 0; k < p.partes.length; k++) { var anillo = p.partes[k]; if (Array.isArray(anillo[0]) && Array.isArray(anillo[0][0])) anillo = anillo[0]; if (dentroDeAnillo(lat, lon, anillo)) return lotes[i]; } }
    return null;
  }
  function asignarLotes(grupos, lotes) { grupos.forEach(function (g) { var l = loteEnPunto(g.lat, g.lon, lotes); g.equipoId = l ? l.id : null; g.loteNombre = l ? l.nombre : null; }); return grupos; }
  // Crea un análisis foliar tipo 'sensor' por grupo. meta: { campoId, cultivo, estadio, fecha, fuente, archivoNombre, referencia (grupo de referencia para el NBI relativo) }
  function guardarGrupos(grupos, meta) {
    var todos = leer('analisis_foliar'), base = Date.now(), creados = [];
    var ref = meta.referencia != null ? grupos.find(function (g) { return String(g.grupo) === String(meta.referencia); }) : null;
    var nbiRef = ref && ref.nbi ? ref.nbi.media : null, spadRef = ref && ref.spad ? ref.spad.media : null;
    grupos.forEach(function (g, i) {
      if (!g.incluir && g.incluir !== undefined) return;
      var item = { id: base + i, campoId: meta.campoId, equipoId: g.equipoId || null, tipo: 'sensor', sensor: meta.fuente || 'dualex', cultivo: meta.cultivo || '', estadio: meta.estadio || '', fecha: g.fecha || meta.fecha || hoyISO(),
        hoja: 'Sensor ' + (meta.fuente === 'spad' ? 'SPAD' : 'Dualex') + ' · grupo ' + g.grupo + (g.loteNombre ? ' · ' + g.loteNombre : ''), laboratorio: meta.fuente === 'spad' ? 'SPAD' : 'Dualex (METOS)', grupo: g.grupo, lecturas: g.n,
        chl: g.chl ? g.chl.media : null, chlSd: g.chl ? g.chl.sd : null, flav: g.flav ? g.flav.media : null, anth: g.anth ? g.anth.media : null, nbi: g.nbi ? g.nbi.media : null, nbiSd: g.nbi ? g.nbi.sd : null,
        nbiRef: nbiRef != null && String(g.grupo) !== String(meta.referencia) ? nbiRef : null, spad: g.spad ? g.spad.media : null, spadRef: spadRef != null && String(g.grupo) !== String(meta.referencia) ? spadRef : null,
        esReferencia: ref ? String(g.grupo) === String(meta.referencia) : false, lat: g.lat, lon: g.lon, puntos: g.puntos.slice(0, 500), archivoNombre: meta.archivoNombre || null,
        observaciones: 'Importado del archivo ' + (meta.archivoNombre || '') + ' · ' + g.n + ' lecturas' + (g.conGps ? ' con GPS' : ''), fechaCreacion: new Date().toISOString() };
      todos.push(item); creados.push(item);
    });
    guardar('analisis_foliar', todos);
    return creados;
  }

  /* ---------- UI en el Banco → Análisis foliar: "Importar archivo del sensor" ---------- */
  var lecturaActual = null;
  function activarFoliar() {
    var btn = $('btnImportarSensor'), input = $('archivoSensor'); if (!btn || btn.dataset.listo) return;
    btn.dataset.listo = '1';
    btn.addEventListener('click', function () { input.value = ''; input.click(); });
    input.addEventListener('change', function () { var f = input.files && input.files[0]; if (f) importarArchivo(f); });
    var usb = $('btnLeerUSB');
    if (usb) usb.addEventListener('click', leerCarpetaUSB);
  }

  /* ---------- lectura directa del equipo conectado por USB (File System Access API: Chrome / Edge de escritorio) ----------
     El Dualex se conecta como una unidad de almacenamiento con un archivo por día ("DX aaaammdd.csv"). SAFIA pide la carpeta,
     lista los archivos del sensor, marca los que ya se importaron (mismo nombre en analisis_foliar) y trae los nuevos. */
  var RE_ARCHIVO_SENSOR = /^(dx.*|.*dualex.*|.*spad.*|.*(chl|nbi).*)\.(csv|txt|tsv)$/i;
  function leerCarpetaUSB() {
    if (typeof window.showDirectoryPicker !== 'function') { toast('Este navegador no permite leer carpetas directamente. Usá Chrome o Edge en la computadora, o "Importar archivo" eligiendo el archivo del equipo.', true); return; }
    window.showDirectoryPicker({ mode: 'read' }).then(function (dir) { return explorarCarpeta(dir); }).then(function (archivos) {
      if (!archivos.length) { toast('En esa carpeta no hay archivos del sensor (se buscan DX*.csv, *.txt o *.csv con Chl/NBI). Elegí la carpeta raíz del Dualex.', true); return; }
      pintarUSB(archivos);
    }).catch(function (e) { if (e && e.name === 'AbortError') return; console.error(e); toast('No se pudo leer la carpeta: ' + (e && e.message ? e.message : e), true); });
  }
  // Recorre la carpeta (y una subcarpeta de nivel) buscando archivos del sensor → [{ nombre, ruta, fecha, tamano, handle, importado }]
  function explorarCarpeta(dir, prefijo, nivel) {
    prefijo = prefijo || ''; nivel = nivel || 0;
    var salida = [], subs = [];
    var ya = {}; leer('analisis_foliar').forEach(function (a) { if (a.archivoNombre) ya[String(a.archivoNombre).toLowerCase()] = 1; });
    function recorrer(it) {
      return it.next().then(function (r) {
        if (r.done) return;
        var par = r.value, nombre = par[0], h = par[1];
        if (h.kind === 'file' && RE_ARCHIVO_SENSOR.test(nombre)) salida.push({ nombre: nombre, ruta: prefijo + nombre, fecha: fechaDeNombre(nombre), handle: h, importado: !!ya[nombre.toLowerCase()] });
        else if (h.kind === 'directory' && nivel < 1 && !/^(\.|system|\$)/i.test(nombre)) subs.push(h);
        return recorrer(it);
      });
    }
    return recorrer(dir.entries()).then(function () {
      var cadena = Promise.resolve();
      subs.forEach(function (s) { cadena = cadena.then(function () { return explorarCarpeta(s, prefijo + s.name + '/', nivel + 1).then(function (l) { salida = salida.concat(l); }); }); });
      return cadena;
    }).then(function () {
      return Promise.all(salida.map(function (a) { return a.handle.getFile().then(function (f) { a.tamano = f.size; a.modificado = f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : null; if (!a.fecha) a.fecha = a.modificado; return a; }); }));
    }).then(function (l) { return l.sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || a.nombre.localeCompare(b.nombre); }); });
  }
  function fechaDeNombre(n) { var m = String(n).match(/(20\d{2})[-_ ]?(\d{2})[-_ ]?(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : null; }
  function pintarUSB(archivos) {
    var cont = $('usbLista'); if (!cont) return;
    var nuevos = archivos.filter(function (a) { return !a.importado; });
    var html = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Archivos en el equipo</h3><span class="muted">' + archivos.length + ' archivo(s) del sensor · ' + nuevos.length + ' sin importar</span></div>';
    html += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th></th><th>Archivo</th><th>Fecha</th><th class="r">Tamaño</th><th>Estado</th></tr></thead><tbody>' +
      archivos.map(function (a, i) { return '<tr><td><input type="checkbox" class="usbSel" data-i="' + i + '"' + (a.importado ? '' : ' checked') + '></td><td><b>' + esc(a.ruta) + '</b></td><td>' + (a.fecha ? esc(a.fecha.split('-').reverse().join('/')) : '—') + '</td><td class="r">' + (a.tamano != null ? Math.round(a.tamano / 1024) + ' KB' : '—') + '</td><td>' + (a.importado ? '<span class="muted">ya importado</span>' : '<span style="color:#178029;font-weight:700;">nuevo</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    html += '<div class="form-grid" style="margin-top:8px;"><div class="field"><label>Cultivo (para todos los archivos elegidos)</label><select id="usbCultivo">' + ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo'].map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div><div class="field"><label>Estadio</label><select id="usbEstadio"></select></div><div class="field"><label>Grupo de referencia</label><select id="usbRef"><option value="">sin referencia</option><option value="1">grupo 1 de cada archivo</option><option value="max">el grupo con mayor NBI de cada archivo</option></select><span class="hint">Si en cada salida medís primero la franja bien nutrida, elegí "grupo 1".</span></div></div>';
    html += '<div class="muted" style="font-size:12px;margin:6px 0;">Un solo archivo elegido abre la vista previa para revisar grupo por grupo; varios se importan de una vez con el lote asignado por GPS (los grupos sin GPS quedan como "Todo el campo" y se editan después).</div>';
    html += '<div class="form-actions"><button class="btn" id="btnUsbCancelar">Cerrar</button><span class="spacer" style="flex:1"></span><button class="btn green" id="btnUsbImportar">Importar los elegidos</button></div></div>';
    cont.innerHTML = html;
    var sc = $('usbCultivo'), se = $('usbEstadio');
    function llenarEst() { var est = window.SafiaFoliar ? SafiaFoliar.estadiosDe(sc.value) : [{ k: 'floracion', n: 'Floración' }]; se.innerHTML = est.map(function (e) { return '<option value="' + e.k + '">' + esc(e.n) + '</option>'; }).join(''); }
    llenarEst(); sc.addEventListener('change', llenarEst);
    $('btnUsbCancelar').addEventListener('click', function () { cont.innerHTML = ''; });
    $('btnUsbImportar').addEventListener('click', function () {
      var elegidos = Array.prototype.map.call(cont.querySelectorAll('.usbSel:checked'), function (c) { return archivos[+c.dataset.i]; });
      if (!elegidos.length) { toast('Elegí al menos un archivo', true); return; }
      if (elegidos.length === 1) { elegidos[0].handle.getFile().then(function (f) { cont.innerHTML = ''; importarArchivo(f); }); return; }
      importarVarios(elegidos, { cultivo: sc.value, estadio: se.value, referencia: $('usbRef').value }).then(function (r) {
        toast(r.archivos + ' archivo(s) importados: ' + r.analisis + ' análisis foliares del sensor' + (r.errores.length ? ' · con errores en: ' + r.errores.join(', ') : ''), !!r.errores.length);
        cont.innerHTML = ''; if (window.SafiaFoliar && SafiaFoliar.activar) SafiaFoliar.activar();
      });
    });
  }
  // Importa varios archivos seguidos con la misma configuración (lote por GPS; referencia por regla)
  function importarVarios(archivos, meta) {
    var campo = B().campoActual(), lotes = leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
    var res = { archivos: 0, analisis: 0, errores: [] }, cadena = Promise.resolve();
    archivos.forEach(function (a) {
      cadena = cadena.then(function () { return a.handle.getFile(); }).then(function (f) { return f.text(); }).then(function (texto) {
        var lect = leerTexto(texto, a.nombre), grupos = asignarLotes(agrupar(lect.lecturas), lotes);
        var ref = null;
        if (meta.referencia === '1' && grupos.length > 1) ref = grupos[0].grupo;
        else if (meta.referencia === 'max' && grupos.length > 1) ref = grupos.filter(function (g) { return g.nbi; }).sort(function (x, y) { return y.nbi.media - x.nbi.media; })[0].grupo;
        var creados = guardarGrupos(grupos, { campoId: campo.id, cultivo: meta.cultivo, estadio: meta.estadio, fecha: lect.fecha || a.fecha, fuente: lect.fuente, archivoNombre: a.nombre, referencia: ref });
        res.archivos++; res.analisis += creados.length;
      }).catch(function (e) { console.error(a.nombre, e); res.errores.push(a.nombre); });
    });
    return cadena.then(function () { return res; });
  }
  function importarArchivo(archivo) {
    var cont = $('sensorImportado'), campo = B().campoActual(); if (!cont || !campo) return;
    archivo.text().then(function (texto) {
      var lect = leerTexto(texto, archivo.name);
      var lotes = leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
      var grupos = asignarLotes(agrupar(lect.lecturas), lotes);
      lecturaActual = { lect: lect, grupos: grupos, archivo: archivo.name, lotes: lotes };
      pintarImportado();
    }).catch(function (e) { console.error(e); toast('No se pudo leer el archivo: ' + e.message, true); });
  }
  function pintarImportado() {
    var cont = $('sensorImportado'), d = lecturaActual; if (!cont || !d) return;
    var cultivos = (window.SafiaFoliar ? ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo'] : ['Soja']);
    var conGps = d.grupos.some(function (g) { return g.conGps; });
    var html = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Archivo del sensor: ' + esc(d.archivo) + '</h3><span class="muted">' + esc(d.lect.fuente === 'dualex' ? 'Dualex (METOS)' : (d.lect.fuente === 'spad' ? 'SPAD' : 'sensor foliar')) + ' · ' + d.lect.lecturas.length + ' lecturas en ' + d.grupos.length + ' grupo(s)' + (conGps ? ' · con GPS' : ' · sin GPS (asigná el lote a mano)') + '</span></div>';
    html += '<div class="form-grid" style="margin-bottom:8px;"><div class="field"><label>Cultivo</label><select id="sensCultivo">' + cultivos.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div><div class="field"><label>Estadio</label><select id="sensEstadio"></select></div><div class="field"><label>Fecha (si el archivo no la trae)</label><input type="date" id="sensFecha" value="' + esc(d.lect.fecha || hoyISO()) + '"></div></div>';
    html += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Grupo</th><th class="r">Lecturas</th><th>Lote</th><th class="r">Clorofila µg/cm²</th><th class="r">Flavonoles</th><th class="r">NBI</th><th class="r">SPAD</th><th>Referencia</th><th>Incluir</th></tr></thead><tbody>' +
      d.grupos.map(function (g, i) {
        return '<tr><td><b>' + esc(g.grupo) + '</b>' + (g.fecha ? '<div class="sub">' + esc(g.fecha) + '</div>' : '') + '</td><td class="r">' + g.n + '</td><td><select class="sensLote" data-i="' + i + '"><option value="">Todo el campo</option>' + d.lotes.map(function (l) { return '<option value="' + esc(l.id) + '"' + (String(l.id) === String(g.equipoId) ? ' selected' : '') + '>' + esc(l.nombre) + '</option>'; }).join('') + '</select></td>' +
          '<td class="r">' + (g.chl ? fmt(g.chl.media, 1) + '<div class="sub">± ' + fmt(g.chl.sd, 1) + '</div>' : '—') + '</td><td class="r">' + (g.flav ? fmt(g.flav.media, 2) : '—') + '</td><td class="r">' + (g.nbi ? fmt(g.nbi.media, 1) + '<div class="sub">± ' + fmt(g.nbi.sd, 1) + '</div>' : '—') + '</td><td class="r">' + (g.spad ? fmt(g.spad.media, 1) : '—') + '</td>' +
          '<td><input type="radio" name="sensRef" value="' + esc(g.grupo) + '"' + (i === 0 && d.grupos.length > 1 ? ' checked' : '') + '></td><td><input type="checkbox" class="sensInc" data-i="' + i + '" checked></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    html += '<div class="muted" style="font-size:12px;margin:6px 0;">Referencia: el grupo medido en la franja bien nutrida (o la zona más verde) del lote; los demás grupos se leen contra él (NBI relativo, como el índice de suficiencia del INTA). Si no hay franja, dejá sin referencia' + (d.grupos.length > 1 ? '' : ' (un solo grupo: se lee con los rangos de METOS)') + '.</div>';
    html += '<div class="form-actions"><label style="display:flex;gap:6px;align-items:center;font-size:12px;"><input type="checkbox" id="sensSinRef"> sin grupo de referencia</label><span class="spacer" style="flex:1"></span><button class="btn" id="btnSensCancelar">Cancelar</button><button class="btn green" id="btnSensGuardar">Guardar como análisis foliares</button></div></div>';
    cont.innerHTML = html;
    var se = $('sensEstadio'), sc = $('sensCultivo');
    function llenarEst() { var est = window.SafiaFoliar ? SafiaFoliar.estadiosDe(sc.value) : [{ k: 'floracion', n: 'Floración' }]; se.innerHTML = est.map(function (e) { return '<option value="' + e.k + '">' + esc(e.n) + '</option>'; }).join(''); }
    llenarEst(); sc.addEventListener('change', llenarEst);
    cont.querySelectorAll('.sensLote').forEach(function (s) { s.addEventListener('change', function () { var g = d.grupos[+s.dataset.i]; g.equipoId = s.value || null; var l = d.lotes.find(function (x) { return String(x.id) === s.value; }); g.loteNombre = l ? l.nombre : null; }); });
    cont.querySelectorAll('.sensInc').forEach(function (c) { c.addEventListener('change', function () { d.grupos[+c.dataset.i].incluir = c.checked; }); });
    $('btnSensCancelar').addEventListener('click', function () { lecturaActual = null; cont.innerHTML = ''; });
    $('btnSensGuardar').addEventListener('click', function () {
      var campo = B().campoActual(); if (!campo) return;
      var sinRef = $('sensSinRef').checked, refEl = cont.querySelector('input[name="sensRef"]:checked');
      var creados = guardarGrupos(d.grupos, { campoId: campo.id, cultivo: sc.value, estadio: se.value, fecha: $('sensFecha').value, fuente: d.lect.fuente, archivoNombre: d.archivo, referencia: sinRef || !refEl ? null : refEl.value });
      toast(creados.length + ' análisis foliar(es) del sensor guardados');
      lecturaActual = null; cont.innerHTML = '';
      if (window.SafiaFoliar && SafiaFoliar.activar) SafiaFoliar.activar();
    });
  }

  /* ---------- UI en el Banco → Agua: "Traer de la estación" ---------- */
  function activarAgua() {
    var btn = $('btnAguaEstacion'), info = $('aguaEstacionInfo'), campo = B() && B().campoActual(); if (!btn) return;
    if (!campo || !campo.estacionId) { btn.style.display = 'none'; if (info) info.textContent = ''; return; }
    btn.style.display = '';
    var filas = climaDeEstacion(campo.id);
    if (info) info.textContent = 'Estación ' + (campo.estacionNombre || campo.estacionId) + (filas.length ? ' · datos hasta el ' + filas[filas.length - 1].fecha.split('-').reverse().join('/') : ' · sin datos traídos todavía');
    if (!btn.dataset.listo) {
      btn.dataset.listo = '1';
      btn.addEventListener('click', function () {
        var c = B().campoActual(); if (!c) return;
        btn.disabled = true; btn.textContent = 'Trayendo…';
        sincronizarCampo(c).then(function (r) {
          toast('Estación: ' + r.dias + ' días traídos (' + r.mmTotal + ' mm de lluvia); lluvias en los lotes: ' + r.lluvia.creados + ' nuevas, ' + r.lluvia.reemplazados + ' actualizadas, ' + r.lluvia.respetados + ' cargadas a mano respetadas');
          if (B().refrescarAgua) B().refrescarAgua(); activarAgua(); if (window.SafiaHumedad) SafiaHumedad.alCambiarCampo();
        }).catch(function (e) { console.error(e); toast('No se pudo traer la estación: ' + e.message, true); }).finally(function () { btn.disabled = false; btn.textContent = 'Traer de la estación'; });
      });
    }
  }

  window.SafiaSensores = { FUENTES: FUENTES, estadoEstacion: estadoEstacion, estaciones: estaciones, diario: diario, sincronizarCampo: sincronizarCampo, climaDeEstacion: climaDeEstacion, cobertura: cobertura, resumenCiclo: resumenCiclo, temperaturasEstacion: temperaturasEstacion,
    leerTexto: leerTexto, agrupar: agrupar, explorarCarpeta: explorarCarpeta, importarVarios: importarVarios, pintarUSB: pintarUSB, asignarLotes: asignarLotes, loteEnPunto: loteEnPunto, dentroDeAnillo: dentroDeAnillo, guardarGrupos: guardarGrupos, activarFoliar: activarFoliar, activarAgua: activarAgua };
})();
