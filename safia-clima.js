/* =====================================================================
   SAFIA · Cliente de clima Open-Meteo — FUENTE ÚNICA DE CONEXIÓN
   ---------------------------------------------------------------------
   Centraliza TODA la conexión a api.open-meteo.com para que las 6 páginas
   (clima, prediccion, index, operador, encargado, propietario) usen el
   mismo fetch con: timeout, reintento con backoff, caché del último clima
   bueno por ubicación, dedup de llamadas en vuelo y errores HONESTOS y
   diferenciados (sin internet / servidor caído 502-503 / sin datos).

   Uso:
     const r = await SafiaClima.obtenerClima({
       lat: campo.latitud, lon: campo.longitud,
       current: 'temperature_2m',
       daily: 'precipitation_sum,et0_fao_evapotranspiration',
       pastDays: 7, forecastDays: 7,
       cacheKey: 'campo:' + campo.id
     });
     if (r.datos) {
       usar(r.datos);                       // puede venir de caché
       if (r.desactualizado) mostrarBanner(SafiaClima.etiquetaCache(r.fechaCache));
     } else {
       mostrarError(SafiaClima.mensajeError(r.error));  // honesto por tipo
     }

   r = {
     datos: <json Open-Meteo> | null,
     fuente: 'red' | 'cache' | null,
     desactualizado: boolean,        // true si datos vienen de caché
     fechaCache: number | null,      // timestamp (ms) del clima cacheado
     error: null | { tipo, status, mensaje }   // tipo: sin_internet|servidor|sin_datos|config
   }
   ===================================================================== */
(function (root) {
  'use strict';

  var BASE = 'https://api.open-meteo.com/v1/forecast';
  var PREFIJO_CACHE = 'safia_clima:';     // localStorage
  var memCache = {};                       // { url: { ts, datos } } caché en memoria (sesión)
  var enVuelo = {};                        // { url: Promise } dedup de llamadas concurrentes

  var DEFAULTS = {
    timezone: 'auto',
    pastDays: 0,
    forecastDays: 7,
    timeoutMs: 8000,     // corta un pedido colgado
    reintentos: 3,       // intentos totales contra la red
    backoffMs: 600,      // pausa base entre reintentos (crece por intento)
    memTTLms: 120000     // 2 min: reusa la respuesta en memoria sin volver a pedir
  };

  // ---- utilidades -------------------------------------------------------
  function ahora() { return Date.now(); }
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Acepta coma decimal y separadores mezclados ("-24,27" → -24.27).
  function parseCoord(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v == null) return NaN;
    var m = String(v).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function construirURL(o) {
    var p = [];
    p.push('latitude=' + o.lat);
    p.push('longitude=' + o.lon);
    if (o.current) p.push('current=' + encodeURIComponent(o.current));
    if (o.hourly) p.push('hourly=' + encodeURIComponent(o.hourly));
    if (o.daily) p.push('daily=' + encodeURIComponent(o.daily));
    p.push('past_days=' + o.pastDays);
    p.push('forecast_days=' + o.forecastDays);
    p.push('timezone=' + encodeURIComponent(o.timezone));
    return BASE + '?' + p.join('&');
  }

  function fetchConTimeout(url, timeoutMs) {
    if (typeof AbortController === 'undefined') return fetch(url);
    var ctrl = new AbortController();
    var id = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    var pedido = fetch(url, { signal: ctrl.signal });
    // limpiar el timer pase lo que pase
    if (pedido && typeof pedido.finally === 'function') {
      return pedido.finally(function () { clearTimeout(id); });
    }
    return pedido.then(
      function (r) { clearTimeout(id); return r; },
      function (e) { clearTimeout(id); throw e; }
    );
  }

  // Reintentable: 429 (rate-limit), 5xx (incluye 502/503/504), timeout y red.
  function esRetryableStatus(status) {
    return status === 429 || (status >= 500 && status <= 599);
  }

  // ---- caché persistente (localStorage) --------------------------------
  function guardarCache(cacheKey, datos) {
    if (!cacheKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PREFIJO_CACHE + cacheKey, JSON.stringify({ ts: ahora(), datos: datos }));
    } catch (_) { /* cuota llena u otro: ignorar, la caché es best-effort */ }
  }

  function leerCache(cacheKey) {
    if (!cacheKey || typeof localStorage === 'undefined') return null;
    try {
      var raw = localStorage.getItem(PREFIJO_CACHE + cacheKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && obj.datos) return obj;
    } catch (_) {}
    return null;
  }

  // ---- núcleo: intenta la red con reintentos -----------------------------
  // Resuelve { datos } en éxito, o { error: {tipo, status} } si agota intentos.
  async function intentarRed(url, o) {
    var ultimoTipo = 'sin_datos', ultimoStatus = null;

    for (var intento = 0; intento < o.reintentos; intento++) {
      try {
        var resp = await fetchConTimeout(url, o.timeoutMs);

        if (resp.ok) {
          var json = await resp.json();
          // Open-Meteo devuelve {error:true, reason:'...'} con HTTP 200 en algunos fallos.
          if (json && json.error === true) {
            ultimoTipo = 'servidor'; ultimoStatus = null;
            // reintentar
          } else {
            return { datos: json };
          }
        } else {
          ultimoStatus = resp.status;
          if (esRetryableStatus(resp.status)) {
            ultimoTipo = 'servidor';       // 502/503/504/429 → reintentar
          } else {
            // 4xx no recuperable (400 coords malas, 404, etc.): no reintentar
            return { error: { tipo: (resp.status >= 400 && resp.status < 500) ? 'sin_datos' : 'servidor', status: resp.status } };
          }
        }
      } catch (e) {
        // AbortError = timeout (servidor lento/colgado); TypeError = red caída.
        if (e && e.name === 'AbortError') ultimoTipo = 'servidor';
        else ultimoTipo = 'sin_internet';
      }

      if (intento < o.reintentos - 1) {
        await dormir(o.backoffMs * (intento + 1));   // backoff lineal: 600, 1200, ...
      }
    }
    return { error: { tipo: ultimoTipo, status: ultimoStatus } };
  }

  function resultado(datos, fuente, error, desactualizado, fechaCache) {
    return {
      datos: datos || null,
      fuente: fuente || null,
      desactualizado: !!desactualizado,
      fechaCache: fechaCache != null ? fechaCache : null,
      error: error || null
    };
  }

  // ---- API pública -----------------------------------------------------
  async function obtenerClima(opts) {
    opts = opts || {};
    var o = {
      lat: parseCoord(opts.lat),
      lon: parseCoord(opts.lon),
      current: opts.current || null,
      hourly: opts.hourly || null,
      daily: opts.daily || null,
      pastDays: opts.pastDays != null ? opts.pastDays : DEFAULTS.pastDays,
      forecastDays: opts.forecastDays != null ? opts.forecastDays : DEFAULTS.forecastDays,
      timezone: opts.timezone || DEFAULTS.timezone,
      timeoutMs: opts.timeoutMs != null ? opts.timeoutMs : DEFAULTS.timeoutMs,
      reintentos: opts.reintentos != null ? opts.reintentos : DEFAULTS.reintentos,
      backoffMs: opts.backoffMs != null ? opts.backoffMs : DEFAULTS.backoffMs,
      memTTLms: opts.memTTLms != null ? opts.memTTLms : DEFAULTS.memTTLms,
      cacheKey: opts.cacheKey || null
    };

    // Coordenadas inválidas → ni siquiera intentamos (no es problema de red).
    if (!isFinite(o.lat) || !isFinite(o.lon)) {
      return resultado(null, null, { tipo: 'config', status: null });
    }

    var url = construirURL(o);
    // clave de caché por defecto: las coords (si no se pasó una explícita)
    var cacheKey = o.cacheKey || (o.lat + ',' + o.lon);

    // 1) memoria fresca (evita repedir lo mismo en re-renders / equipos del mismo campo)
    var mem = memCache[url];
    if (mem && (ahora() - mem.ts) < o.memTTLms) {
      return resultado(mem.datos, 'red', null, false);
    }

    // 2) dedup de llamadas concurrentes idénticas (fan-out por equipo).
    //    enVuelo guarda la promesa del objeto-resultado ({datos}|{error}),
    //    que NUNCA rechaza, así no hay unhandled rejections.
    if (enVuelo[url]) {
      var compartido = await enVuelo[url];
      if (compartido && compartido.datos) {
        return resultado(compartido.datos, 'red', null, false);
      }
      // la compartida falló: respaldo de caché sin re-pedir a la red
      var cc = leerCache(cacheKey);
      if (cc) return resultado(cc.datos, 'cache', null, true, cc.ts);
      return resultado(null, null, (compartido && compartido.error) || { tipo: 'sin_datos', status: null });
    }

    var promesaRed = intentarRed(url, o);   // resuelve {datos}|{error}, nunca rechaza
    enVuelo[url] = promesaRed;

    var res;
    try { res = await promesaRed; }
    finally { delete enVuelo[url]; }

    if (res.datos) {
      memCache[url] = { ts: ahora(), datos: res.datos };
      guardarCache(cacheKey, res.datos);
      return resultado(res.datos, 'red', null, false);
    }

    // 3) falló la red tras los reintentos → respaldo: último clima bueno cacheado
    var c = leerCache(cacheKey);
    if (c) {
      return resultado(c.datos, 'cache', null, true, c.ts);
    }

    // 4) sin red y sin caché → error honesto
    return resultado(null, null, res.error || { tipo: 'sin_datos', status: null });
  }

  // Mensaje honesto y diferenciado según el tipo de error.
  function mensajeError(error) {
    var tipo = (error && error.tipo) || 'sin_datos';
    switch (tipo) {
      case 'sin_internet':
        return 'Sin conexión a internet. Revisá tu red e intentá de nuevo.';
      case 'servidor':
        return 'El servicio de clima (Open-Meteo) no responde ahora (error del servidor' +
               (error && error.status ? ' ' + error.status : '') + '). Volvé a intentar en unos minutos.';
      case 'config':
        return 'Coordenadas inválidas. Revisá el GPS del campo (ej: -24.27, -56.22).';
      default:
        return 'No se pudieron obtener los datos del clima. Probá de nuevo.';
    }
  }

  // Etiqueta para mostrar cuando se usa caché: "Datos del 03/06 14:20 — no se pudo actualizar".
  function etiquetaCache(ts) {
    var f;
    try {
      var d = new Date(ts);
      f = d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }) + ' ' +
          d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { f = ''; }
    return 'Datos del ' + f + ' — no se pudo actualizar';
  }

  // Muestra/actualiza/oculta un banner sticky arriba de la página cuando el
  // clima viene de caché (no se pudo actualizar). Agnóstico de página: si
  // fechaCache es falsy, retira el banner. No requiere tocar el HTML de cada
  // página. Devuelve el elemento (o null).
  function avisoCache(fechaCache) {
    if (typeof document === 'undefined' || !document.body) return null;
    var id = 'safia-aviso-cache';
    var el = document.getElementById(id);
    if (!fechaCache) { if (el && el.parentNode) el.parentNode.removeChild(el); return null; }
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:sticky;top:0;z-index:9999;background:#B8731A;color:#fff;' +
        'font-family:inherit;font-size:13px;font-weight:600;text-align:center;padding:8px 14px;' +
        'line-height:1.3;box-shadow:0 2px 6px rgba(0,0,0,0.15);';
      document.body.insertBefore(el, document.body.firstChild);
    }
    el.textContent = '⚠️ ' + etiquetaCache(fechaCache);
    return el;
  }

  // Limpia las cachés en memoria (para tests).
  function _resetMemoria() { memCache = {}; enVuelo = {}; }

  var SafiaClima = {
    obtenerClima: obtenerClima,
    mensajeError: mensajeError,
    etiquetaCache: etiquetaCache,
    avisoCache: avisoCache,
    parseCoord: parseCoord,
    construirURL: construirURL,
    _resetMemoria: _resetMemoria,
    PREFIJO_CACHE: PREFIJO_CACHE,
    version: '1.0.0'
  };

  root.SafiaClima = SafiaClima;
  if (typeof module !== 'undefined' && module.exports) module.exports = SafiaClima;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
