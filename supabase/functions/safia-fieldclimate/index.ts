// SAFIA · Edge Function: safia-fieldclimate (v2: llaves por cliente cargadas desde la pantalla Conexiones, con permisos)
// Puente con la API de FieldClimate (estaciones y sondas METOS de Pessl Instruments).
// Las llaves HMAC se cargan desde SAFIA (Conexiones, solo Irrigar) y viven en la tabla safia_conexiones, que el navegador
// no puede leer (sin políticas: solo esta función, con la clave de servicio). Orden al buscar las llaves de un campo:
//   1) las del cliente dueño del campo  2) la cuenta general de Irrigar  3) los secrets del proyecto (compatibilidad v1).
// Nunca se devuelven ni se escriben en el registro: el navegador solo ve los últimos 4 caracteres de la llave pública.
// Acciones:
//   { accion: 'estado', campoId? | clienteId? }        → si hay llaves para ese campo/cliente y de dónde salen
//   { accion: 'resumen' }                              → (Irrigar) conexiones cargadas, sin llaves
//   { accion: 'guardar', destino, publica, privada }   → (Irrigar) prueba las llaves contra FieldClimate y las guarda; destino = 'general' o id de cliente
//   { accion: 'quitar', destino }                      → (Irrigar) borra las llaves
//   { accion: 'estaciones', clienteId? }               → estaciones de la cuenta (Irrigar: la del cliente o la general; cliente: la suya)
//   { accion: 'diario', estacion, desde, hasta, campoId } → datos diarios normalizados de la estación ASIGNADA a un campo que el usuario puede ver
// Firma HMAC según la documentación de FieldClimate: SHA-256 de (MÉTODO + RUTA + FECHA-RFC1123 + CLAVE-PÚBLICA) con la clave privada,
// cabeceras Authorization: "hmac PUBLICA:firma" y Date.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const BASE = 'https://api.fieldclimate.com/v2';
const PROVEEDOR = 'fieldclimate';

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
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Falta la sesión' }, 401);

    // quién llama (sesión verificada contra Supabase Auth) y su fila de SAFIA
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: eU } = await comoUsuario.auth.getUser();
    if (eU || !u?.user) return json({ error: 'Sesión inválida' }, 401);
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: yo } = await admin.from('safia_usuarios').select('rol,estado,cliente_id,campos').eq('id', u.user.id).maybeSingle();
    if (!yo || yo.estado !== 'activo') return json({ error: 'Tu cuenta de SAFIA no está activa' }, 403);
    const esIrrigar = yo.rol === 'propietario' || yo.rol === 'admin';
    const miCliente = yo.cliente_id != null ? String(yo.cliente_id) : null;
    const misCampos: string[] = Array.isArray(yo.campos) ? yo.campos.map(String) : [];

    let cuerpo: Record<string, unknown> = {};
    try { cuerpo = await req.json(); } catch (_) { /* sin cuerpo */ }
    const accion = String(cuerpo.accion || 'estado');

    // Llaves para un cliente: las suyas → la cuenta general de Irrigar → los secrets del proyecto (v1)
    async function llavesDe(clienteId: string | null): Promise<{ pub: string; priv: string; origen: string } | null> {
      const ids = (clienteId ? [clienteId] : []).concat(['general']);
      for (const id of ids) {
        const r = await admin.from('safia_conexiones').select('publica,privada').eq('id', id).eq('proveedor', PROVEEDOR).maybeSingle();
        if (r.error) break;   // la tabla todavía no existe (SQL sin correr): se sigue con los secrets
        if (r.data && r.data.publica && r.data.privada) return { pub: r.data.publica, priv: r.data.privada, origen: id === 'general' ? 'general' : 'cliente' };
      }
      const pub = Deno.env.get('FIELDCLIMATE_PUBLIC_KEY') || '', priv = Deno.env.get('FIELDCLIMATE_PRIVATE_KEY') || '';
      return pub && priv ? { pub, priv, origen: 'secrets' } : null;
    }
    // Campo que el usuario puede ver (Irrigar: todos; cliente: los suyos; operador/encargado: sus estancias)
    async function campoVisible(campoId: string) {
      const { data: c } = await admin.from('safia_campos').select('id,datos,cliente_id').eq('id', campoId).maybeSingle();
      if (!c) return null;
      if (esIrrigar) return c;
      if (!miCliente || String(c.cliente_id) !== miCliente) return null;
      if ((yo!.rol === 'operador' || yo!.rol === 'encargado') && misCampos.length && !misCampos.includes(String(c.id))) return null;
      return c;
    }
    const SIN_LLAVES = 'No hay llaves de FieldClimate cargadas para este cliente. Irrigar las carga en SAFIA → Conexiones (se generan en fieldclimate.com → menú de usuario → API services).';

    if (accion === 'estado') {
      let cliente = miCliente;
      if (cuerpo.campoId) { const c = await campoVisible(String(cuerpo.campoId)); if (!c) return json({ error: 'Ese campo no es tuyo' }, 403); cliente = c.cliente_id != null ? String(c.cliente_id) : null; }
      else if (esIrrigar) cliente = cuerpo.clienteId ? String(cuerpo.clienteId) : null;
      const ll = await llavesDe(cliente);
      return json({ ok: true, configurada: !!ll, origen: ll ? ll.origen : null });
    }

    if (accion === 'resumen') {
      if (!esIrrigar) return json({ error: 'Solo Irrigar puede ver las conexiones' }, 403);
      const r = await admin.from('safia_conexiones').select('id,proveedor,publica,estaciones,probado_en,actualizado_en').eq('proveedor', PROVEEDOR);
      if (r.error) return json({ ok: true, tabla: false, conexiones: [], secrets: !!(Deno.env.get('FIELDCLIMATE_PUBLIC_KEY') && Deno.env.get('FIELDCLIMATE_PRIVATE_KEY')) });
      return json({ ok: true, tabla: true, secrets: !!(Deno.env.get('FIELDCLIMATE_PUBLIC_KEY') && Deno.env.get('FIELDCLIMATE_PRIVATE_KEY')),
        conexiones: (r.data || []).map((x) => ({ id: x.id, publicaFin: String(x.publica || '').slice(-4), estaciones: x.estaciones, probadoEn: x.probado_en, actualizadoEn: x.actualizado_en })) });
    }

    if (accion === 'guardar') {
      if (!esIrrigar) return json({ error: 'Solo Irrigar puede cargar llaves' }, 403);
      const destino = String(cuerpo.destino || '').trim(), pub = String(cuerpo.publica || '').trim(), priv = String(cuerpo.privada || '').trim();
      if (!destino) return json({ error: 'Falta a quién pertenece la conexión' }, 400);
      if (pub.length < 8 || priv.length < 8 || /\s/.test(pub) || /\s/.test(priv)) return json({ error: 'Las llaves no parecen válidas: pegá la pública y la privada completas, sin espacios.' }, 400);
      if (destino !== 'general') { const { data: cl } = await admin.from('safia_clientes').select('id').eq('id', destino).maybeSingle(); if (!cl) return json({ error: 'No existe ese cliente' }, 400); }
      // se prueban ANTES de guardar: si FieldClimate no las acepta, no se guardan
      const p = await fc('GET', '/user/stations', pub, priv);
      if (!p.ok) return json({ error: p.status === 401 || p.status === 403 ? 'FieldClimate no aceptó las llaves (revisá que sean la pública y la privada de la misma cuenta y que estén activas).' : 'FieldClimate respondió ' + p.status + ': probá de nuevo en un momento.' }, 400);
      const n = Array.isArray(p.json) ? p.json.length : 0;
      const up = await admin.from('safia_conexiones').upsert({ id: destino, proveedor: PROVEEDOR, publica: pub, privada: priv, estaciones: n, probado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(), actualizado_por: u.user.id }, { onConflict: 'id,proveedor' });
      if (up.error) return json({ error: /does not exist|schema cache|relation/i.test(up.error.message) ? 'Falta crear la tabla de conexiones: corré el SQL safia_conexiones.sql en Supabase.' : 'No se pudo guardar: ' + up.error.message }, 500);
      console.log('fieldclimate: llaves guardadas para', destino, '·', n, 'estaciones');
      return json({ ok: true, destino, estaciones: n });
    }

    if (accion === 'quitar') {
      if (!esIrrigar) return json({ error: 'Solo Irrigar puede quitar llaves' }, 403);
      const destino = String(cuerpo.destino || '').trim(); if (!destino) return json({ error: 'Falta la conexión' }, 400);
      const d = await admin.from('safia_conexiones').delete().eq('id', destino).eq('proveedor', PROVEEDOR);
      if (d.error) return json({ error: 'No se pudo quitar: ' + d.error.message }, 500);
      return json({ ok: true, destino });
    }

    if (accion === 'estaciones') {
      let cliente: string | null;
      if (esIrrigar) cliente = cuerpo.clienteId ? String(cuerpo.clienteId) : null;
      else if (yo.rol === 'cliente') cliente = miCliente;
      else return json({ error: 'Solo Irrigar o el dueño del campo pueden ver la lista de estaciones' }, 403);
      const ll = await llavesDe(cliente); if (!ll) return json({ error: SIN_LLAVES }, 500);
      const r = await fc('GET', '/user/stations', ll.pub, ll.priv);
      if (!r.ok) return json({ error: 'FieldClimate respondió ' + r.status, detalle: r.texto }, 502);
      const lista = (Array.isArray(r.json) ? r.json : []) as Array<{ name?: { original?: string; custom?: string }; position?: { geo?: { coordinates?: number[] } }; dates?: { max_date?: string; min_date?: string }; info?: { device_name?: string } }>;
      const estaciones = lista.map((s) => ({
        id: s.name?.original || '', nombre: s.name?.custom || s.name?.original || '',
        lat: s.position?.geo?.coordinates?.[1] ?? null, lon: s.position?.geo?.coordinates?.[0] ?? null,
        ultimoDato: s.dates?.max_date || null, primerDato: s.dates?.min_date || null, tipo: s.info?.device_name || null,
      }));
      return json({ ok: true, estaciones, origen: ll.origen });
    }

    if (accion === 'diario') {
      const est = String(cuerpo.estacion || '').trim();
      if (!est) return json({ error: 'Falta la estación' }, 400);
      // La estación tiene que ser la ASIGNADA a un campo que el usuario puede ver (antes cualquiera podía pedir cualquier estación)
      let campo: { id: string; datos: Record<string, unknown>; cliente_id: string | null } | null = null;
      if (cuerpo.campoId) campo = await campoVisible(String(cuerpo.campoId));
      else {   // navegadores con la versión anterior (no mandan el campo): se busca el campo por la estación
        let q = admin.from('safia_campos').select('id,datos,cliente_id').eq('datos->>estacionId', est);
        if (!esIrrigar) q = q.eq('cliente_id', miCliente || '—');
        const { data: l } = await q.limit(1); campo = l && l[0] ? l[0] : null;
      }
      if (!campo) return json({ error: 'Esa estación no está asignada a un campo tuyo' }, 403);
      if (!esIrrigar && String((campo.datos || {}).estacionId || '') !== est) return json({ error: 'Esa estación no es la del campo' }, 403);
      const ll = await llavesDe(campo.cliente_id != null ? String(campo.cliente_id) : null); if (!ll) return json({ error: SIN_LLAVES }, 500);
      const desde = Math.floor(new Date(String(cuerpo.desde || '') + 'T00:00:00Z').getTime() / 1000);
      const hasta = Math.floor(new Date(String(cuerpo.hasta || '') + 'T23:59:59Z').getTime() / 1000);
      if (!desde || !hasta || hasta < desde) return json({ error: 'Fechas inválidas' }, 400);
      const ruta = '/data/' + encodeURIComponent(est) + '/daily/from/' + desde + '/to/' + hasta;
      const r = await fc('GET', ruta, ll.pub, ll.priv);
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
