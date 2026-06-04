/* =====================================================================
   SAFIA · Proxy serverless (Vercel) hacia Open-Meteo
   ---------------------------------------------------------------------
   Por qué: desde la red de los usuarios (Paraguay) api.open-meteo.com
   devuelve 502 / es inalcanzable de forma intermitente. Desde un
   datacenter (Vercel, EE.UU./Europa) sí se llega bien. La app le pide el
   clima a NUESTRO Vercel (mismo origen → sin CORS) y Vercel se lo pide a
   Open-Meteo y devuelve el JSON tal cual.

   Proxy delgado y genérico: reenvía los query params soportados, hace el
   fetch del lado servidor y devuelve la respuesta de Open-Meteo. Si
   Open-Meteo falla (5xx / timeout / red), responde un error claro
   (NO inventa datos) para que el cliente lo maneje.

   Formato: función serverless de Node de Vercel (export default handler).
   Vercel detecta automáticamente la carpeta /api — no hace falta vercel.json.
   ===================================================================== */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

// Whitelist de parámetros que reenviamos (proxy acotado, no abierto).
const PARAMS_PERMITIDOS = [
  'latitude', 'longitude',
  'current', 'hourly', 'daily',
  'past_days', 'forecast_days',
  'timezone', 'models', 'cell_selection',
  'temperature_unit', 'wind_speed_unit', 'precipitation_unit',
  'start_date', 'end_date'
];

export default async function handler(req, res) {
  // Solo lectura.
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ error: true, reason: 'Método no permitido' });
    return;
  }

  // Construir la querystring a partir de los params recibidos (whitelist).
  const entrada = req.query || {};
  const params = new URLSearchParams();
  for (const clave of PARAMS_PERMITIDOS) {
    const v = entrada[clave];
    if (v == null || v === '') continue;
    params.set(clave, Array.isArray(v) ? v.join(',') : String(v));
  }

  if (!params.get('latitude') || !params.get('longitude')) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(400).json({ error: true, reason: 'Faltan latitude/longitude' });
    return;
  }

  const url = OPEN_METEO + '?' + params.toString();

  // Timeout del lado servidor para no colgar la función.
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 9000);

  try {
    const upstream = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!upstream.ok) {
      // No inventamos datos: propagamos un error claro.
      // 5xx de Open-Meteo → 502 (Bad Gateway) hacia el cliente.
      const status = upstream.status >= 500 ? 502 : upstream.status;
      let reason = 'Open-Meteo respondió ' + upstream.status;
      try { const j = await upstream.json(); if (j && j.reason) reason = j.reason; } catch (_) {}
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).json({ error: true, reason, upstreamStatus: upstream.status });
      return;
    }

    const data = await upstream.json();

    // Open-Meteo a veces devuelve {error:true, reason} con HTTP 200.
    if (data && data.error) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(502).json({ error: true, reason: data.reason || 'Open-Meteo error' });
      return;
    }

    // Caché de borde (CDN de Vercel): 10 min fresco + 5 min revalidando.
    // El pronóstico no cambia minuto a minuto → reduce llamadas y rate-limit.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (e) {
    // AbortError = timeout; otro = fallo de red del servidor hacia Open-Meteo.
    const esTimeout = e && e.name === 'AbortError';
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({
      error: true,
      reason: 'No se pudo contactar a Open-Meteo (' + (esTimeout ? 'timeout' : (e && e.message) || 'error de red') + ')'
    });
  } finally {
    clearTimeout(id);
  }
}
