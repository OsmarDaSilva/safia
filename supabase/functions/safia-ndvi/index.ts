// SAFIA · Edge Function: safia-ndvi
// Serie de NDVI (vigor del cultivo) de un lote a partir de Sentinel-2, usando la
// Statistical API de Copernicus Data Space Ecosystem (gratis con registro).
// Entrada: { equipoId, campoId, partes, desde, hasta }  (partes = polígono del lote, puntos [lat, lon])
// Salida:  { ok, serie: [{ fecha, ndvi, p10, p50, p90, min, max, nubes_pct, pixeles }], n, guardados }
// Secrets necesarios (Supabase → Edge Functions → Secrets): CDSE_CLIENT_ID y CDSE_CLIENT_SECRET
// (se crean en https://shapps.dataspace.copernicus.eu/dashboard → User settings → OAuth clients).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

// NDVI = (B08 − B04) / (B08 + B04). Se excluyen nubes, sombras, cirros y nieve con la capa SCL
// (Scene Classification: 0 sin dato, 1 saturado, 3 sombra de nube, 8-9 nubes, 10 cirros, 11 nieve).
const EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: [{ bands: ['B04', 'B08', 'SCL', 'dataMask'] }],
           output: [{ id: 'ndvi', bands: 1, sampleType: 'FLOAT32' }, { id: 'dataMask', bands: 1 }] };
}
function evaluatePixel(s) {
  var nube = (s.SCL === 0 || s.SCL === 1 || s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11);
  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 0.000001);
  return { ndvi: [ndvi], dataMask: [(s.dataMask === 1 && !nube) ? 1 : 0] };
}`;

let tokenCache: { valor: string; vence: number } | null = null;

async function token(id: string, secreto: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.vence - 60_000) return tokenCache.valor;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secreto }),
  });
  if (!r.ok) throw new Error('Copernicus no aceptó las credenciales (' + r.status + '): revisá CDSE_CLIENT_ID / CDSE_CLIENT_SECRET');
  const j = await r.json();
  tokenCache = { valor: j.access_token, vence: Date.now() + (j.expires_in || 600) * 1000 };
  return tokenCache.valor;
}

// partes [[exterior, hueco...], ...] con [lat, lon] → GeoJSON (lon, lat), anillos cerrados
function geometria(partes: number[][][][]) {
  const cerrar = (an: number[][]) => { const c = an.map((p) => [p[1], p[0]]); if (c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1])) c.push(c[0]); return c; };
  const polis = partes.map((anillos) => anillos.map(cerrar));
  return polis.length === 1 ? { type: 'Polygon', coordinates: polis[0] } : { type: 'MultiPolygon', coordinates: polis };
}

function fechaISO(f: string, fin: boolean) { return f.slice(0, 10) + (fin ? 'T23:59:59Z' : 'T00:00:00Z'); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const id = Deno.env.get('CDSE_CLIENT_ID'), secreto = Deno.env.get('CDSE_CLIENT_SECRET');
    if (!id || !secreto) return json({ error: 'Faltan las credenciales de Copernicus en el servidor (CDSE_CLIENT_ID y CDSE_CLIENT_SECRET). Hay que cargarlas en Supabase → Edge Functions → Secrets.' }, 500);

    let cuerpo: { equipoId?: string | number; campoId?: string | number; partes?: number[][][][]; desde?: string; hasta?: string; guardar?: boolean };
    try { cuerpo = await req.json(); } catch { return json({ error: 'Pedido inválido' }, 400); }
    const { equipoId, campoId, partes, desde, hasta } = cuerpo;
    if (!partes || !partes.length || !partes[0][0] || partes[0][0].length < 3) return json({ error: 'El lote no tiene polígono: cargalo en Equipos y lotes' }, 400);
    if (!desde || !hasta) return json({ error: 'Faltan las fechas desde / hasta' }, 400);
    const dias = (new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000;
    if (dias < 1 || dias > 400) return json({ error: 'El rango tiene que ser de 1 a 400 días' }, 400);

    const tk = await token(id, secreto);
    const pedido = {
      input: {
        bounds: { geometry: geometria(partes), properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC', maxCloudCoverage: 90 } }],
      },
      aggregation: {
        timeRange: { from: fechaISO(desde, false), to: fechaISO(hasta, true) },
        aggregationInterval: { of: 'P1D' },
        lastIntervalBehavior: 'SHORTEN',
        evalscript: EVALSCRIPT,
        resx: 0.0001, resy: 0.0001,   // ≈ 10 m en grados (EPSG:4326)
      },
      calculations: { default: { statistics: { default: { percentiles: { k: [10, 50, 90] } } } } },
    };
    console.log('ndvi: pidiendo', equipoId, desde, '→', hasta);
    const r = await fetch(STATS_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
    if (!r.ok) {
      const t = await r.text();
      console.error('ndvi: Statistical API', r.status, t.slice(0, 500));
      return json({ error: 'Copernicus no pudo calcular el NDVI (' + r.status + ')', detalle: t.slice(0, 300) }, 502);
    }
    const j = await r.json();
    const serie: Array<Record<string, unknown>> = [];
    for (const it of (j.data || [])) {
      const st = it?.outputs?.ndvi?.bands?.B0?.stats; if (!st) continue;
      const total = Number(st.sampleCount || 0), sinDato = Number(st.noDataCount || 0), validos = total - sinDato;
      if (!total || validos <= 0 || !isFinite(Number(st.mean))) continue;
      const pct = st.percentiles || it.outputs.ndvi.bands.B0.percentiles || {};   // la API los devuelve dentro de stats
      const nubes = Math.round(sinDato / total * 1000) / 10;
      if (nubes > 70) continue;   // con más del 70 % del lote tapado la media no representa al lote
      const r2 = (v: unknown) => (v === null || v === undefined || !isFinite(Number(v))) ? null : Math.round(Number(v) * 1000) / 1000;
      serie.push({ fecha: String(it.interval.from).slice(0, 10), ndvi: r2(st.mean), p10: r2(pct['10.0'] ?? pct['10']), p50: r2(pct['50.0'] ?? pct['50']), p90: r2(pct['90.0'] ?? pct['90']), min: r2(st.min), max: r2(st.max), nubes_pct: nubes, pixeles: validos });
    }
    serie.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    // Guardar en la tabla safia_ndvi (acumula historial; una fila por lote y fecha)
    let guardados = 0;
    const url = Deno.env.get('SUPABASE_URL'), srv = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (cuerpo.guardar !== false && url && srv && equipoId && serie.length) {
      const filas = serie.map((s) => ({ equipo_id: String(equipoId), campo_id: campoId != null ? String(campoId) : null, fecha: s.fecha, ndvi_media: s.ndvi, ndvi_p10: s.p10, ndvi_p50: s.p50, ndvi_p90: s.p90, ndvi_min: s.min, ndvi_max: s.max, nubes_pct: s.nubes_pct, pixeles: s.pixeles, fuente: 'sentinel-2-l2a' }));
      const g = await fetch(url + '/rest/v1/safia_ndvi?on_conflict=equipo_id,fecha', {
        method: 'POST',
        headers: { apikey: srv, Authorization: 'Bearer ' + srv, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(filas),
      });
      if (g.ok) guardados = filas.length; else console.error('ndvi: no se pudo guardar', g.status, (await g.text()).slice(0, 300));
    }
    console.log('ndvi: ok', serie.length, 'fechas, guardadas', guardados);
    return json({ ok: true, serie, n: serie.length, guardados });
  } catch (e) {
    console.error('ndvi: error', String((e as Error)?.message || e));
    return json({ error: String((e as Error)?.message || 'Error inesperado').slice(0, 300) }, 500);
  }
});
