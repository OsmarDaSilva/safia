// SAFIA · Edge Function: safia-avisos — avisos al celular (notificaciones push de la app instalada)
// Acciones (POST { accion, ... }):
//   clave        → llave pública para suscribir el celular (se crea sola la primera vez)
//   suscribir    → guarda este celular para el usuario que está adentro   { suscripcion, dispositivo }
//   desuscribir  → lo quita                                              { endpoint }
//   estado       → cuántos celulares tiene el usuario y sus últimos avisos
//   probar       → manda un aviso de prueba a los celulares del usuario
//   vista        → (solo Irrigar) qué se avisaría hoy, sin enviar nada
//   diario       → (reloj de la base con su secreto, o Irrigar a mano) calcula y envía los avisos del día
// Seguridad: se despliega con verify_jwt = false porque el reloj de la base no tiene sesión; cada acción valida acá
// adentro: usuario activo de SAFIA (auth.getUser) o el secreto del reloj (tabla safia_avisos_config, solo servidor).
// El cálculo lo hace https://safia-beige.vercel.app/api/avisos con el mismo motor de las pantallas.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-safia-cron', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const SITIO = 'https://safia-beige.vercel.app';
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* <PUSH> Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) con WebCrypto, sin librerías */
const enc = new TextEncoder();
function b64u(buf) { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function deB64u(t) { const x = String(t).replace(/-/g, '+').replace(/_/g, '/'); const s = atob(x + '='.repeat((4 - x.length % 4) % 4)); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
function unir(...partes) { const o = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let k = 0; partes.forEach((p) => { o.set(p, k); k += p.length; }); return o; }
async function hkdf(salt, ikm, info, bytes) { const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8)); }
async function generarVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { publica: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), privada: await crypto.subtle.exportKey('jwk', kp.privateKey) };
}
async function cabeceraVapid(endpoint, vapid, contacto) {
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto })));
  const key = await crypto.subtle.importKey('jwk', vapid.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(h + '.' + c));
  return 'vapid t=' + h + '.' + c + '.' + b64u(firma) + ', k=' + vapid.publica;
}
async function cifrar(texto, p256dh, auth) {
  const uaPub = deB64u(p256dh), secreto = deB64u(auth);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, par.privateKey, 256));
  const ikm = await hkdf(secreto, ecdh, unir(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const clave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, clave, unir(enc.encode(texto), new Uint8Array([2]))));
  const cab = new Uint8Array(21); cab.set(salt, 0); new DataView(cab.buffer).setUint32(16, 4096); cab[20] = asPub.length;
  return unir(cab, asPub, cifrado);
}
async function enviarPush(disp, mensaje, vapid, contacto) {
  try {
    const cuerpo = await cifrar(JSON.stringify(mensaje), disp.p256dh, disp.auth);
    const r = await fetch(disp.endpoint, { method: 'POST', headers: { Authorization: await cabeceraVapid(disp.endpoint, vapid, contacto), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'high' }, body: cuerpo });
    const ok = r.status >= 200 && r.status < 300;
    return { ok, status: r.status, baja: r.status === 404 || r.status === 410, detalle: ok ? '' : (await r.text()).slice(0, 200) };
  } catch (e) { return { ok: false, status: 0, baja: false, detalle: String(e && e.message || e).slice(0, 200) }; }
}
/* </PUSH> */

// deno-lint-ignore no-explicit-any
type Cualquiera = any;
const hoyPY = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);   // Paraguay = UTC-3 todo el año
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const fechaCorta = (f: string) => f.slice(8, 10) + '/' + f.slice(5, 7);

async function todas(admin: Cualquiera, tabla: string, armar: (q: Cualquiera) => Cualquiera, columnas = 'id,datos,cliente_id') {
  const out: Cualquiera[] = [];
  for (let desde = 0; desde < 20000; desde += 1000) {
    const r = await armar(admin.from(tabla).select(columnas)).range(desde, desde + 999);
    if (r.error) { if (/does not exist|schema cache|PGRST205/i.test(r.error.message || '')) return out; throw new Error(tabla + ': ' + r.error.message); }
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}
const aDatos = (filas: Cualquiera[]) => filas.map((f) => (f.datos && typeof f.datos === 'object' ? (f.datos.id == null ? { ...f.datos, id: f.id } : f.datos) : null)).filter(Boolean);

async function vapidDe(admin: Cualquiera) {
  const r = await admin.from('safia_avisos_config').select('valor').eq('clave', 'vapid').maybeSingle();
  if (r.error) throw new Error('Falta preparar la base de los avisos: hay que correr el SQL safia_avisos.sql');
  if (r.data) return r.data.valor;
  const v = await generarVapid();
  const ins = await admin.from('safia_avisos_config').insert({ clave: 'vapid', valor: v });
  if (ins.error) { const otra = await admin.from('safia_avisos_config').select('valor').eq('clave', 'vapid').maybeSingle(); if (otra.data) return otra.data.valor; throw new Error(ins.error.message); }
  return v;
}

// Envía un mensaje a todos los celulares de un usuario; limpia los que el servicio da de baja
async function aUsuario(admin: Cualquiera, dispositivos: Cualquiera[], usuarioId: string, mensaje: Cualquiera, vapid: Cualquiera) {
  const suyos = dispositivos.filter((d) => d.usuario_id === usuarioId);
  let enviados = 0; const fallos: string[] = [];
  for (const d of suyos) {
    const r = await enviarPush(d, mensaje, vapid, SITIO);
    if (r.ok) { enviados++; await admin.from('safia_avisos_dispositivos').update({ ultimo_ok: new Date().toISOString(), fallos: 0 }).eq('id', d.id); }
    else if (r.baja) { await admin.from('safia_avisos_dispositivos').delete().eq('id', d.id); fallos.push('celular dado de baja'); }
    else { await admin.from('safia_avisos_dispositivos').update({ fallos: (d.fallos || 0) + 1 }).eq('id', d.id); fallos.push(r.status + ' ' + r.detalle); }
  }
  return { dispositivos: suyos.length, enviados, fallos };
}

const ROLES_DE: Record<string, string[]> = { arrancar: ['operador', 'encargado'], rotar: ['operador', 'encargado'], estres: ['operador', 'encargado', 'cliente'], mantenimiento: ['encargado', 'cliente'] };

async function ejecutar(admin: Cualquiera, enviar: boolean) {
  const hoy = hoyPY();
  const [suscF, equiposF, clientesF, usuariosR, dispR] = await Promise.all([
    todas(admin, 'safia_suscripciones', (q) => q), todas(admin, 'safia_equipos', (q) => q), todas(admin, 'safia_clientes', (q) => q, 'id,datos'),
    admin.from('safia_usuarios').select('id,nombre,rol,cliente_id,campos,estado').eq('estado', 'activo'),
    admin.from('safia_avisos_dispositivos').select('*'),
  ]);
  if (dispR.error) throw new Error('Falta preparar la base de los avisos: hay que correr el SQL safia_avisos.sql');
  const usuarios: Cualquiera[] = usuariosR.data || [], dispositivos: Cualquiera[] = dispR.data || [];
  const conCelular = new Set(dispositivos.map((d) => d.usuario_id));
  const nombreCliente = (id: string) => { const c = clientesF.find((x) => String(x.id) === String(id)); return c && c.datos ? c.datos.nombre : ''; };
  const vigentes = new Set<string>();
  suscF.forEach((s) => { const v = s.datos && s.datos.vence; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) || String(v) >= hoy) vigentes.add(String((s.datos && s.datos.equipoId) || s.id)); });

  const pendientes: Cualquiera[] = [];   // { usuario, equipoId, tipo, titulo, cuerpo, url }
  const detalle: Cualquiera[] = [];
  const porCliente: Record<string, Cualquiera[]> = {};
  equiposF.forEach((e) => { if (e.cliente_id && vigentes.has(String(e.id))) (porCliente[e.cliente_id] = porCliente[e.cliente_id] || []).push(e); });

  for (const clienteId of Object.keys(porCliente)) {
    const gente = usuarios.filter((u) => String(u.cliente_id) === clienteId && ['cliente', 'encargado', 'operador'].includes(u.rol));
    const info: Cualquiera = { cliente: nombreCliente(clienteId), pivots: [] };
    detalle.push(info);
    if (enviar && !gente.some((u) => conCelular.has(u.id))) { info.salteado = 'ningún usuario de este cliente activó los avisos'; continue; }
    const ids = porCliente[clienteId].map((e) => String(e.id));
    const desde = new Date(Date.now() - 800 * 86400000).toISOString().slice(0, 10);
    const [campos, equipos, campanas, eventos, analisis, estacion, cultivos, ndvi] = await Promise.all([
      todas(admin, 'safia_campos', (q) => q.eq('cliente_id', clienteId)), todas(admin, 'safia_equipos', (q) => q.eq('cliente_id', clienteId)),
      todas(admin, 'safia_campanas', (q) => q.eq('cliente_id', clienteId)), todas(admin, 'safia_eventos', (q) => q.eq('cliente_id', clienteId).gte('datos->>fecha', desde)),
      todas(admin, 'safia_analisis', (q) => q.eq('cliente_id', clienteId)), todas(admin, 'safia_clima_estacion', (q) => q.eq('cliente_id', clienteId)),
      todas(admin, 'safia_cultivos', (q) => q, 'id,datos'),
      todas(admin, 'safia_ndvi', (q) => q.in('equipo_id', ids).gte('fecha', new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10)).order('fecha'), 'equipo_id,fecha,ndvi_media,ndvi_p10,ndvi_p50,ndvi_p90,nubes_pct,pixeles'),
    ]);
    const ndviPor: Record<string, Cualquiera[]> = {};
    ndvi.forEach((f) => { (ndviPor[f.equipo_id] = ndviPor[f.equipo_id] || []).push({ fecha: f.fecha, ndvi: +f.ndvi_media, p10: f.ndvi_p10, p50: f.ndvi_p50, p90: f.ndvi_p90, nubes_pct: f.nubes_pct == null ? null : +f.nubes_pct, pixeles: f.pixeles }); });
    let calc: Cualquiera;
    try {
      const ctl = new AbortController(); const reloj = setTimeout(() => ctl.abort(), 58000);
      const r = await fetch(SITIO + '/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ equipos: ids, datos: { campos: aDatos(campos), equipos: aDatos(equipos), campanas: aDatos(campanas), eventos: aDatos(eventos), analisis_suelo: aDatos(analisis), clima_estacion: aDatos(estacion), cultivos_custom: aDatos(cultivos), ndvi: ndviPor } }) });
      clearTimeout(reloj);
      calc = await r.json(); if (!r.ok || !calc.ok) throw new Error(calc.error || ('respuesta ' + r.status));
    } catch (e) { info.error = 'No se pudo calcular: ' + String((e as Error).message || e).slice(0, 200); continue; }

    for (const res of calc.resultados as Cualquiera[]) {
      const deCampo = gente.filter((u) => u.rol === 'cliente' || !u.campos || !u.campos.length || u.campos.map(String).includes(String(res.campoId)));
      const hayOperativos = deCampo.some((u) => u.rol === 'operador' || u.rol === 'encargado');
      const fila: Cualquiera = { pivot: res.nombre, campo: res.campo, estado: res.estado, error: res.error, avisos: [] };
      info.pivots.push(fila);
      for (const a of (res.avisos || [])) {
        // sin operador ni encargado en esa estancia, lo operativo le llega al dueño
        const roles = hayOperativos ? (ROLES_DE[a.tipo] || []) : ['cliente'];
        const para = deCampo.filter((u) => roles.includes(u.rol));
        fila.avisos.push({ tipo: a.tipo, titulo: a.titulo, cuerpo: a.cuerpo, para: para.map((u) => u.nombre + ' (' + u.rol + (conCelular.has(u.id) ? '' : ', sin avisos activados') + ')') });
        para.forEach((u) => pendientes.push({ usuario: u, equipoId: String(res.equipoId), tipo: a.tipo, titulo: a.titulo, cuerpo: a.cuerpo, url: 'operador.html?equipo=' + encodeURIComponent(res.equipoId) }));
      }
    }
  }

  // Suscripciones por vencer → Irrigar (a 30, 15, 7, 3, 1 y 0 días)
  const irrigar = usuarios.filter((u) => u.rol === 'propietario' || u.rol === 'admin');
  const porVencer: Cualquiera[] = [];
  suscF.forEach((s) => {
    const v = s.datos && s.datos.vence; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return;
    const d = diasEntre(hoy, String(v)); if (![30, 15, 7, 3, 1, 0].includes(d)) return;
    const eq = equiposF.find((e) => String(e.id) === String((s.datos && s.datos.equipoId) || s.id)); if (!eq) return;
    const titulo = 'Suscripción por vencer: ' + ((eq.datos && eq.datos.nombre) || 'pivot') + (eq.cliente_id ? ' · ' + nombreCliente(eq.cliente_id) : '');
    const cuerpo = (s.datos.plan === 'Prueba' ? 'La prueba gratis vence' : 'Vence') + ' el ' + fechaCorta(String(v)) + (d === 0 ? ' (hoy).' : d === 1 ? ' (mañana).' : ' (faltan ' + d + ' días).');
    porVencer.push({ titulo, cuerpo });
    irrigar.forEach((u) => pendientes.push({ usuario: u, equipoId: String(eq.id), tipo: 'suscripcion', titulo, cuerpo, url: 'suscripciones.html' }));
  });

  if (!enviar) return { ok: true, hoy, modo: 'vista', clientes: detalle, suscripciones: porVencer, celulares: dispositivos.length };

  // Una sola vez por día, usuario, pivot y tipo; el mantenimiento, una vez por semana
  const semana = new Date(Date.now() - 6 * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
  const viejos = await admin.from('safia_avisos_log').select('usuario_id,equipo_id,tipo,fecha').eq('tipo', 'mantenimiento').gte('fecha', semana);
  const yaMant = new Set((viejos.data || []).map((l: Cualquiera) => l.usuario_id + '|' + l.equipo_id));
  const aGuardar = pendientes.filter((p) => conCelular.has(p.usuario.id) && !(p.tipo === 'mantenimiento' && yaMant.has(p.usuario.id + '|' + p.equipoId)))
    .map((p) => ({ fecha: hoy, usuario_id: p.usuario.id, equipo_id: p.equipoId, tipo: p.tipo, titulo: p.titulo, cuerpo: p.cuerpo }));
  let nuevos: Cualquiera[] = [];
  if (aGuardar.length) {
    const ins = await admin.from('safia_avisos_log').upsert(aGuardar, { onConflict: 'fecha,usuario_id,equipo_id,tipo', ignoreDuplicates: true }).select('id,usuario_id,equipo_id,tipo');
    if (ins.error) throw new Error('No se pudo anotar los avisos: ' + ins.error.message);
    nuevos = ins.data || [];
  }
  const vapid = nuevos.length ? await vapidDe(admin) : null;
  let enviados = 0; const fallos: string[] = [];
  const porUsuario: Record<string, Cualquiera[]> = {};
  nuevos.forEach((n) => { const p = pendientes.find((x) => x.usuario.id === n.usuario_id && x.equipoId === n.equipo_id && x.tipo === n.tipo); if (p) (porUsuario[n.usuario_id] = porUsuario[n.usuario_id] || []).push({ ...p, logId: n.id }); });
  for (const uid of Object.keys(porUsuario)) {
    const lista = porUsuario[uid];
    // más de 3 avisos para la misma persona: uno solo que los resume
    const mensajes = lista.length > 3
      ? [{ titulo: 'SAFIA: ' + lista.length + ' avisos de hoy', cuerpo: lista.slice(0, 4).map((p) => p.titulo).join(' · ') + (lista.length > 4 ? ' y ' + (lista.length - 4) + ' más' : ''), url: lista[0].tipo === 'suscripcion' ? 'suscripciones.html' : 'encargado.html', tag: 'safia-resumen-' + hoy, ids: lista.map((p) => p.logId) }]
      : lista.map((p) => ({ titulo: p.titulo, cuerpo: p.cuerpo, url: p.url, tag: 'safia-' + p.equipoId + '-' + p.tipo, ids: [p.logId] }));
    for (const m of mensajes) {
      const r = await aUsuario(admin, dispositivos, uid, { titulo: m.titulo, cuerpo: m.cuerpo, url: m.url, tag: m.tag }, vapid);
      enviados += r.enviados; fallos.push(...r.fallos);
      if (r.enviados) await admin.from('safia_avisos_log').update({ enviados: r.enviados }).in('id', m.ids);
    }
  }
  console.log('avisos:', hoy, 'calculados', pendientes.length, 'nuevos', nuevos.length, 'enviados', enviados, 'fallos', fallos.length);
  return { ok: true, hoy, modo: 'diario', calculados: pendientes.length, nuevos: nuevos.length, enviados, fallos, clientes: detalle, suscripciones: porVencer };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    let cuerpo: Cualquiera = {}; try { cuerpo = await req.json(); } catch { /* sin cuerpo */ }
    const accion = String(cuerpo.accion || '');

    // --- reloj de la base: trae su secreto ---
    const secreto = req.headers.get('x-safia-cron');
    if (secreto) {
      const c = await admin.from('safia_avisos_config').select('valor').eq('clave', 'cron').maybeSingle();
      if (!c.data || !c.data.valor || c.data.valor.secreto !== secreto) return json({ error: 'No autorizado' }, 401);
      if (accion !== 'diario') return json({ error: 'Acción no permitida para el reloj' }, 400);
      const tarea = ejecutar(admin, true).catch((e) => console.error('avisos diario:', String(e && e.message || e)));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime; if (rt && rt.waitUntil) { rt.waitUntil(tarea); return json({ ok: true, enMarcha: true }, 202); }
      await tarea; return json({ ok: true });
    }

    // --- personas: sesión de SAFIA ---
    const auth = req.headers.get('Authorization') || '';
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: eU } = await comoUsuario.auth.getUser();
    if (eU || !u || !u.user) return json({ error: 'Hay que iniciar sesión en SAFIA' }, 401);
    const yo = await admin.from('safia_usuarios').select('id,nombre,rol,estado').eq('id', u.user.id).maybeSingle();
    if (!yo.data || yo.data.estado !== 'activo') return json({ error: 'Tu usuario no está activo en SAFIA' }, 403);
    const esIrrigar = yo.data.rol === 'propietario' || yo.data.rol === 'admin';

    if (accion === 'clave') return json({ ok: true, publica: (await vapidDe(admin)).publica });
    if (accion === 'suscribir') {
      const s = cuerpo.suscripcion || {}, k = s.keys || {};
      if (!/^https:\/\//.test(String(s.endpoint || '')) || !k.p256dh || !k.auth) return json({ error: 'El celular no entregó una suscripción válida' }, 400);
      const r = await admin.from('safia_avisos_dispositivos').upsert({ usuario_id: yo.data.id, endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth, dispositivo: String(cuerpo.dispositivo || '').slice(0, 120), fallos: 0 }, { onConflict: 'endpoint' });
      if (r.error) return json({ error: /does not exist|schema cache/i.test(r.error.message) ? 'Falta preparar la base de los avisos: hay que correr el SQL safia_avisos.sql' : r.error.message }, 500);
      return json({ ok: true });
    }
    if (accion === 'desuscribir') { await admin.from('safia_avisos_dispositivos').delete().eq('endpoint', String(cuerpo.endpoint || '')).eq('usuario_id', yo.data.id); return json({ ok: true }); }
    if (accion === 'estado') {
      const d = await admin.from('safia_avisos_dispositivos').select('id,dispositivo,creado_en,ultimo_ok,endpoint').eq('usuario_id', yo.data.id);
      if (d.error) return json({ ok: true, sinBase: true, dispositivos: [], ultimos: [] });
      const l = await admin.from('safia_avisos_log').select('fecha,titulo,cuerpo,enviados').eq('usuario_id', yo.data.id).order('id', { ascending: false }).limit(8);
      return json({ ok: true, dispositivos: (d.data || []).map((x: Cualquiera) => ({ dispositivo: x.dispositivo, desde: x.creado_en, ultimo_ok: x.ultimo_ok, endpoint: x.endpoint })), ultimos: l.data || [] });
    }
    if (accion === 'probar') {
      const d = await admin.from('safia_avisos_dispositivos').select('*').eq('usuario_id', yo.data.id);
      if (d.error) return json({ error: 'Falta preparar la base de los avisos: hay que correr el SQL safia_avisos.sql' }, 500);
      if (!d.data || !d.data.length) return json({ error: 'Este usuario todavía no activó los avisos en ningún celular' }, 400);
      const r = await aUsuario(admin, d.data, yo.data.id, { titulo: 'SAFIA: aviso de prueba', cuerpo: 'Los avisos al celular están activados, ' + (yo.data.nombre || '') + '. Así te va a avisar SAFIA cuando haya que arrancar el pivot.', url: './', tag: 'safia-prueba' }, await vapidDe(admin));
      return json({ ok: r.enviados > 0, ...r });
    }
    if (accion === 'vista' || accion === 'diario') {
      if (!esIrrigar) return json({ error: 'Solo Irrigar puede ver o enviar los avisos de todos' }, 403);
      return json(await ejecutar(admin, accion === 'diario'));
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('avisos: error', String((e as Error)?.message || e));
    return json({ error: String((e as Error)?.message || 'Error inesperado').slice(0, 300) }, 500);
  }
});
