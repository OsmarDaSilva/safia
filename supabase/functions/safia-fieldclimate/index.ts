// SAFIA · Edge Function: safia-fieldclimate (v1)
// Puente con la API de FieldClimate (estaciones METOS de Pessl Instruments). Las claves HMAC de la
// cuenta de Irrigar viven como secrets del proyecto (FIELDCLIMATE_PUBLIC_KEY y FIELDCLIMATE_PRIVATE_KEY);
// el navegador nunca las ve. Acciones:
//   { accion: 'estado' }                                  → si las claves están cargadas
//   { accion: 'estaciones' }                              → lista de estaciones de la cuenta
//   { accion: 'diario', estacion, desde, hasta }          → datos diarios normalizados (lluvia, temperatura, HR, ET0, radiación, viento, humedad de suelo)
// Firma HMAC según la documentación de FieldClimate: SHA-256 de (MÉTODO + RUTA + FECHA-RFC1123 + CLAVE-PÚBLICA) con la clave privada,
// cabeceras Authorization: "hmac PUBLICA:firma" y Date.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const BASE = 'https://api.fieldclimate.com/v2';

async function firmar(mensaje: string, clavePrivada: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(clavePrivada), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(mensaje));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fc(metodo: string, ruta: string, pub: string, priv: string, cuerpo?: unknown) {
  const fecha = new Date().toUTCString();
  const firma = await firmar(metodo + ruta + fecha + pub, priv);
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { Authorization: 'hmac ' + pub + ':' + firma, Date: fecha, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let json: unknown = null; try { json = JSON.parse(texto); } catch (_) { /* texto plano */ }
  return { ok: r.ok, status: r.status, json, texto: texto.slice(0, 400) };
}

type Sensor = { name?: string; code?: number | string; group?: number | string; ch?: number | string; unit?: string; aggr?: Record<string, (number | null)[]> };

function normalizarDiario(resp: unknown) {
  const o = (resp || {}) as { dates?: string[]; data?: Sensor[] | Record<string, Sensor> };
  const fechas = (o.dates || []).map((d) => String(d).slice(0, 10));
  const lista: Sensor[] = Array.isArray(o.data) ? o.data : Object.values(o.data || {});
  const nombre = (s: Sensor) => String(s.name || '').toLowerCase();
  const es = (s: Sensor, re: RegExp, no?: RegExp) => re.test(nombre(s)) && !(no && no.test(nombre(s)));
  const serie = (s: Sensor | undefined, ag: string) => (s && s.aggr && s.aggr[ag]) ? s.aggr[ag] : null;
  const num = (v: unknown) => (v == null || v === '' || isNaN(Number(v))) ? null : Math.round(Number(v) * 100) / 100;

  const lluvia = lista.find((s) => es(s, /precip|rain|lluvia|pluvi|chuva/, /leaf|wet/));
  const tAire = lista.find((s) => es(s, /air temp|hc air|temperatura del aire|temperatura do ar|^temperature$|^temp$/, /soil|suelo|solo|leaf|hoja|dew|wet|bulb|water/))
    || lista.find((s) => es(s, /temp/, /soil|suelo|solo|leaf|hoja|dew|wet|bulb|water/));
  const hr = lista.find((s) => es(s, /relative humidity|humedad relativa|umidade|^hc relative|^rh/));
  const et0 = lista.find((s) => es(s, /et0|eto\b|evapotransp/));
  const rad = lista.find((s) => es(s, /solar radiation|radiaci|radiação|global rad/));
  const viento = lista.find((s) => es(s, /wind speed|velocidad del viento|vento/, /gust|dir/));
  const tSuelo = lista.find((s) => es(s, /soil temp|temperatura del suelo|temperatura do solo/));
  const humSuelo = lista.filter((s) => es(s, /soil moisture|vwc|watermark|humedad.*suelo|umidade.*solo|volumetric/));

  const filas = fechas.map((f, i) => {
    const hs: Record<string, number | null> = {};
    humSuelo.forEach((s) => { const v = serie(s, 'avg'); if (v) hs[(s.name || 'suelo') + (s.ch != null ? ' ch' + s.ch : '')] = num(v[i]); });
    return {
      fecha: f,
      lluvia: num(serie(lluvia, 'sum')?.[i]),
      tmedia: num(serie(tAire, 'avg')?.[i]), tmax: num(serie(tAire, 'max')?.[i]), tmin: num(serie(tAire, 'min')?.[i]),
      hr: num(serie(hr, 'avg')?.[i]),
      et0: num(serie(et0, 'sum')?.[i] ?? serie(et0, 'avg')?.[i]),
      rad: num(serie(rad, 'sum')?.[i] ?? serie(rad, 'avg')?.[i]), radUnidad: rad?.unit || null,
      viento: num(serie(viento, 'avg')?.[i]),
      tsuelo: num(serie(tSuelo, 'avg')?.[i]),
      humSuelo: Object.keys(hs).length ? hs : null,
    };
  });
  return { filas, sensores: lista.map((s) => ({ nombre: s.name, codigo: s.code, grupo: s.group, canal: s.ch, unidad: s.unit, agregados: Object.keys(s.aggr || {}) })) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const pub = Deno.env.get('FIELDCLIMATE_PUBLIC_KEY') || '', priv = Deno.env.get('FIELDCLIMATE_PRIVATE_KEY') || '';
    let cuerpo: { accion?: string; estacion?: string; desde?: string; hasta?: string } = {};
    try { cuerpo = await req.json(); } catch (_) { /* sin cuerpo */ }
    const accion = cuerpo.accion || 'estado';

    if (accion === 'estado') return json({ ok: true, configurada: !!(pub && priv) });
    if (!pub || !priv) return json({ error: 'Faltan las claves de FieldClimate en el servidor (secrets FIELDCLIMATE_PUBLIC_KEY y FIELDCLIMATE_PRIVATE_KEY). Se generan en fieldclimate.com → menú de usuario → API services.' }, 500);

    if (accion === 'estaciones') {
      const r = await fc('GET', '/user/stations', pub, priv);
      if (!r.ok) return json({ error: 'FieldClimate respondió ' + r.status, detalle: r.texto }, 502);
      const lista = (Array.isArray(r.json) ? r.json : []) as Array<{ name?: { original?: string; custom?: string }; position?: { geo?: { coordinates?: number[] } }; dates?: { max_date?: string; min_date?: string }; info?: { device_name?: string; device_id?: number } }>;
      const estaciones = lista.map((s) => ({
        id: s.name?.original || '', nombre: s.name?.custom || s.name?.original || '',
        lat: s.position?.geo?.coordinates?.[1] ?? null, lon: s.position?.geo?.coordinates?.[0] ?? null,
        ultimoDato: s.dates?.max_date || null, primerDato: s.dates?.min_date || null, tipo: s.info?.device_name || null,
      }));
      return json({ ok: true, estaciones });
    }

    if (accion === 'diario') {
      const est = String(cuerpo.estacion || '').trim();
      if (!est) return json({ error: 'Falta la estación' }, 400);
      const desde = Math.floor(new Date((cuerpo.desde || '') + 'T00:00:00Z').getTime() / 1000);
      const hasta = Math.floor(new Date((cuerpo.hasta || '') + 'T23:59:59Z').getTime() / 1000);
      if (!desde || !hasta || hasta < desde) return json({ error: 'Fechas inválidas' }, 400);
      const ruta = '/data/' + encodeURIComponent(est) + '/daily/from/' + desde + '/to/' + hasta;
      const r = await fc('GET', ruta, pub, priv);
      if (!r.ok) return json({ error: 'FieldClimate respondió ' + r.status, detalle: r.texto }, 502);
      const n = normalizarDiario(r.json);
      console.log('fieldclimate diario', est, cuerpo.desde, cuerpo.hasta, n.filas.length, 'días');
      return json({ ok: true, estacion: est, desde: cuerpo.desde, hasta: cuerpo.hasta, filas: n.filas, sensores: n.sensores });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('fieldclimate error', String((e as Error)?.message || e));
    return json({ error: 'Error inesperado', detalle: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
