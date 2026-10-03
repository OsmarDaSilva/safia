/* SAFIA — Lluvia diaria: de qué fuente sale
   -------------------------------------------------------------------
   Regla (decisión de Osmar, 29-sep-2026): usar la fuente que mejor mide. Comparado contra lo MEDIDO por la
   Dirección de Meteorología (DMH, anuarios 2021–2025, 19 estaciones, 83 años-estación completos):
     - Chaco:    CHIRPS error medio 11 % · Open-Meteo (reanálisis ERA5) 26 % (ERA5 pone de más: +23 a +26 % en
                 Mcal. Estigarribia, Pozo Colorado y Gral. Bruguéz)
     - Oriental: CHIRPS 10,7 % · ERA5 14,1 %; CHIRPS gana en 45 de 67 años-estación
   → CHIRPS (satélite + estaciones, 0,05°, dominio público, vía ClimateSERV de NASA/USAID SERVIR) en todo el país.
   CHIRPS sale con ~4 semanas de atraso: los días recientes y el pronóstico siguen de Open-Meteo.
   Siempre manda lo medido en el campo: estación propia (Metos) o lluvia cargada a mano (eso lo resuelve cada motor).

   Caché en el navegador por celda de 0,05° y por mes: un mes completo de CHIRPS no cambia, se pide una sola vez.
   Uso:
     SafiaLluvia.corregirSerie(lat, lon, fechas[], lluvias[])  → { lluvia[], nChirps } al instante, solo con lo guardado,
                                                                  y pide en segundo plano lo que falta (la próxima vez ya está)
     SafiaLluvia.diaria(lat, lon, desde, hasta)               → Promise { fechas[], lluvia[], nChirps, nOpenMeteo, fuente }
     SafiaLluvia.total(lat, lon, desde, hasta)                → Promise { mm, fuente, nChirps, dias } */
(function () {
  'use strict';
  var CS = 'https://climateserv.servirglobal.net/api/';
  var PREF = 'safia_chirps1:';
  var DIA = 864e5;

  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function celda(v) { return (Math.round(v * 20) / 20).toFixed(2); }          // grilla de CHIRPS: 0,05°
  function clave(lat, lon, mes) { return PREF + celda(lat) + ',' + celda(lon) + ':' + mes; }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function hoyISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasDelMes(mes) { var p = mes.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function meses(desde, hasta) {
    var out = [], y = +desde.slice(0, 4), m = +desde.slice(5, 7), yh = +hasta.slice(0, 4), mh = +hasta.slice(5, 7);
    while (y < yh || (y === yh && m <= mh)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  // Un mes guardado sirve si está completo (no cambia más) o si se consultó hace menos de un día (mes que CHIRPS todavía no terminó de publicar)
  function mesGuardado(lat, lon, mes) {
    var c = leer(clave(lat, lon, mes));
    if (!c) return null;
    if (c.completo || (Date.now() - (c.ts || 0)) < DIA) return c;
    return null;
  }

  var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function pedir(lat, lon, desde, hasta) {
    var dd = 0.025, geo = JSON.stringify({ type: 'Polygon', coordinates: [[[lon - dd, lat - dd], [lon + dd, lat - dd], [lon + dd, lat + dd], [lon - dd, lat + dd], [lon - dd, lat - dd]]] });
    var f = function (s) { return s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4); };
    var q = 'datatype=0&begintime=' + f(desde) + '&endtime=' + f(hasta) + '&intervaltype=0&operationtype=5&geometry=' + encodeURIComponent(geo);
    return fetch(CS + 'submitDataRequest/?' + q).then(function (r) { return r.json(); }).then(function (a) {
      var id = a && a[0]; if (!id) throw new Error('CHIRPS sin id');
      var n = 0;
      var mirar = function () { return fetch(CS + 'getDataRequestProgress/?id=' + id).then(function (r) { return r.json(); }).then(function (p) { if ((p && p[0]) >= 100) return true; if (++n > 48) throw new Error('CHIRPS tardó demasiado'); return espera(2500).then(mirar); }); };
      return mirar().then(function () { return fetch(CS + 'getDataFromRequest/?id=' + id).then(function (r) { return r.json(); }); });
    }).then(function (j) {
      var out = {};
      (j && j.data || []).forEach(function (x) { var v = x.value && x.value.avg; if (v == null || v < 0) return; var p = String(x.date).split('/'); out[p[2] + '-' + p[0] + '-' + p[1]] = Math.round(v * 10) / 10; });
      return out;
    });
  }

  var enVuelo = {};
  // Trae de CHIRPS los meses que faltan en la caché (un solo pedido) y los guarda mes por mes
  function completar(lat, lon, desde, hasta) {
    var tope = iso(new Date(Date.now() - DIA)); if (hasta > tope) hasta = tope;
    if (desde > hasta) return Promise.resolve(0);
    var faltan = meses(desde, hasta).filter(function (m) { return !mesGuardado(lat, lon, m); });
    if (!faltan.length) return Promise.resolve(0);
    var d0 = faltan[0] + '-01', d1 = faltan[faltan.length - 1] + '-' + String(diasDelMes(faltan[faltan.length - 1])).padStart(2, '0');
    if (d1 > tope) d1 = tope;
    var k = celda(lat) + ',' + celda(lon) + '|' + d0 + '|' + d1;
    if (enVuelo[k]) return enVuelo[k];
    enVuelo[k] = pedir(lat, lon, d0, d1).then(function (datos) {
      faltan.forEach(function (m) {
        var d = {}, n = 0; Object.keys(datos).forEach(function (f) { if (f.slice(0, 7) === m) { d[f] = datos[f]; n++; } });
        guardar(clave(lat, lon, m), { d: d, completo: n >= diasDelMes(m), ts: Date.now() });
      });
      return faltan.length;
    });
    enVuelo[k].then(function () { delete enVuelo[k]; }, function () { delete enVuelo[k]; });
    return enVuelo[k];
  }
  function deCache(lat, lon, fecha) {
    var c = mesGuardado(lat, lon, fecha.slice(0, 7));
    return c && c.d && c.d[fecha] != null ? c.d[fecha] : null;
  }

  // Reemplaza la lluvia de Open-Meteo por la de CHIRPS en los días que ya están guardados. No espera: lo que falta se pide
  // en segundo plano y queda para la próxima vez (así las pantallas de todos los días no se hacen lentas).
  function corregirSerie(lat, lon, fechas, lluvias) {
    lat = num(lat); lon = num(lon);
    var out = (lluvias || []).slice(), n = 0, fuentes = (fechas || []).map(function () { return null; });
    if (lat == null || lon == null || !fechas || !fechas.length || typeof localStorage === 'undefined') return { lluvia: out, nChirps: 0, fuentes: fuentes };
    fechas.forEach(function (f, i) { var v = deCache(lat, lon, f); if (v != null) { out[i] = v; n++; fuentes[i] = 'chirps'; } });
    var hoy = hoyISO(), pasadas = fechas.filter(function (f) { return f < hoy; });
    if (pasadas.length) completar(lat, lon, pasadas[0], pasadas[pasadas.length - 1]).catch(function () {});
    return { lluvia: out, nChirps: n, fuentes: fuentes };
  }

  // Serie diaria completa esperando a CHIRPS (para totales de campañas, clima del ciclo, cargar lluvias al historial)
  function diaria(lat, lon, desde, hasta) {
    lat = num(lat); lon = num(lon);
    if (lat == null || lon == null || !desde || !hasta) return Promise.reject(new Error('faltan datos'));
    var om = fetch('https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + desde + '&end_date=' + hasta + '&daily=precipitation_sum&timezone=auto')
      .then(function (r) { return r.json(); }).catch(function () { return null; });
    var ch = completar(lat, lon, desde, hasta).catch(function () { return null; });
    return Promise.all([om, ch]).then(function (rs) {
      var d = rs[0] && rs[0].daily, fechas = [], lluvia = [], origen = [], nC = 0, nO = 0;
      for (var t = new Date(desde + 'T12:00:00Z'); iso(t) <= hasta; t = new Date(t.getTime() + DIA)) fechas.push(iso(t));
      var porOm = {}; if (d && d.time) d.time.forEach(function (f, i) { porOm[f] = d.precipitation_sum[i]; });
      fechas.forEach(function (f) {
        var v = deCache(lat, lon, f);
        if (v != null) { lluvia.push(v); origen.push('chirps'); nC++; }
        else if (porOm[f] != null) { lluvia.push(porOm[f]); origen.push('open-meteo'); nO++; }
        else { lluvia.push(null); origen.push(null); }
      });
      if (!nC && !nO) throw new Error('sin datos de lluvia');
      return { fechas: fechas, lluvia: lluvia, origen: origen, nChirps: nC, nOpenMeteo: nO, fuente: fuenteTexto(nC, nO) };
    });
  }
  function total(lat, lon, desde, hasta) {
    return diaria(lat, lon, desde, hasta).then(function (s) {
      var v = s.lluvia.filter(function (x) { return x != null; });
      return { mm: Math.round(v.reduce(function (a, b) { return a + b; }, 0) * 10) / 10, dias: v.length, diasConLluvia: v.filter(function (x) { return x > 0; }).length, nChirps: s.nChirps, nOpenMeteo: s.nOpenMeteo, fuente: s.fuente, lluviaFuente: s.nChirps && !s.nOpenMeteo ? 'chirps' : (s.nChirps ? 'chirps+open-meteo' : 'open-meteo') };
    });
  }
  function fuenteTexto(nC, nO) {
    if (nC && !nO) return 'CHIRPS (satélite + estaciones)';
    if (nC) return 'CHIRPS (satélite + estaciones) y Open-Meteo en los ' + nO + ' días más recientes';
    return 'Open-Meteo';
  }
  var NOTA = 'Lluvia: CHIRPS (satélite + estaciones), la fuente que mejor coincide con lo medido por la Dirección de Meteorología en el Chaco y en la Oriental; sale con unas 4 semanas de atraso, así que los días recientes y el pronóstico vienen de Open-Meteo. La estación del campo o la lluvia cargada a mano siempre mandan.';

  window.SafiaLluvia = { corregirSerie: corregirSerie, diaria: diaria, total: total, completar: completar, fuenteTexto: fuenteTexto, NOTA: NOTA };
})();
