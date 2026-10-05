// SAFIA · Edge Function: safia-asistencia — pedido de asistencia técnica a Irrigar cuando un pivot se para
// Acciones (POST { accion, ... }), todas con sesión de SAFIA (verify_jwt = true):
//   soporte          → el número de WhatsApp de soporte de Irrigar (para armar el enlace en el celular del operador)
//   soporte_guardar  → (solo Irrigar) guarda ese número                       { whatsapp }
//   pedir            → avisa al celular de los usuarios de Irrigar que tienen los avisos activados   { equipoId, motivo, fecha, nota, pedidoId }
//   avisar           → novedad de un pedido (tomado, visita, nota, cerrado, asignado): avisa a la otra parte   { pedidoId, evento, texto }
// v3 (5-oct-2026): rol técnico. La oficina (propietario/admin) asigna cada pedido a un técnico con su orden en la ruta:
//   al técnico le llega "Visita asignada" y al campo "Irrigar asignó a …". Lo que escribe el campo le llega al técnico asignado.
// El número y las llaves del envío viven en safia_avisos_config (solo servidor). El envío es el mismo de safia-avisos.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const SITIO = 'https://safia-beige.vercel.app';
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* <PUSH> Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) con WebCrypto, sin librerías — igual que en safia-avisos */
const enc = new TextEncoder();
function b64u(buf) { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function deB64u(t) { const x = String(t).replace(/-/g, '+').replace(/_/g, '/'); const s = atob(x + '='.repeat((4 - x.length % 4) % 4)); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
function unir(...partes) { const o = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let k = 0; partes.forEach((p) => { o.set(p, k); k += p.length; }); return o; }
async function hkdf(salt, ikm, info, bytes) { const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8)); }
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
const MOTIVOS: Record<string, string> = { electrica: 'falla eléctrica', mecanica: 'falla mecánica', bomba: 'falla de la bomba', energia: 'corte de energía (ANDE)', agua: 'falta de agua en la fuente', mantenimiento: 'mantenimiento programado', consulta: 'consulta o ajuste', otro: 'otro motivo' };
const ROLES: Record<string, string> = { cliente: 'dueño', encargado: 'encargado', operador: 'operador', propietario: 'Irrigar', admin: 'Irrigar', tecnico: 'técnico de Irrigar' };
const OFICINA = ['propietario', 'admin'];

async function enviarA(admin: Cualquiera, ids: string[], mensaje: Cualquiera, equipoId: string) {
  const disp = ids.length ? await admin.from('safia_avisos_dispositivos').select('*').in('usuario_id', ids) : { data: [] as Cualquiera[] };
  const dispositivos: Cualquiera[] = disp.data || [];
  const vap = dispositivos.length ? await admin.from('safia_avisos_config').select('valor').eq('clave', 'vapid').maybeSingle() : { data: null };
  let enviados = 0; const alcanzados = new Set<string>(), fallos: string[] = [];
  if (vap.data && vap.data.valor) {
    for (const d of dispositivos) {
      const r = await enviarPush(d, mensaje, vap.data.valor, SITIO);
      if (r.ok) { enviados++; alcanzados.add(d.usuario_id); await admin.from('safia_avisos_dispositivos').update({ ultimo_ok: new Date().toISOString(), fallos: 0 }).eq('id', d.id); }
      else if (r.baja) await admin.from('safia_avisos_dispositivos').delete().eq('id', d.id);
      else fallos.push(r.status + ' ' + r.detalle);
    }
  }
  // queda anotado para todos (lo ven en "Últimos avisos"), aunque no tengan el celular activado
  if (ids.length) {
    const hoy = hoyPY();
    const l = await admin.from('safia_avisos_log').upsert(ids.map((id: string) => ({ fecha: hoy, usuario_id: id, equipo_id: equipoId, tipo: 'asistencia', titulo: mensaje.titulo, cuerpo: mensaje.cuerpo, enviados: alcanzados.has(id) ? 1 : 0 })), { onConflict: 'fecha,usuario_id,equipo_id,tipo' });
    if (l.error) console.error('asistencia: no se pudo anotar', l.error.message);
  }
  console.log('asistencia:', mensaje.titulo, '· enviados', enviados, 'de', dispositivos.length, '· fallos', fallos.length);
  return { enviados, tecnicos: alcanzados.size };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    let cuerpo: Cualquiera = {}; try { cuerpo = await req.json(); } catch { /* sin cuerpo */ }
    const accion = String(cuerpo.accion || '');

    const auth = req.headers.get('Authorization') || '';
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: eU } = await comoUsuario.auth.getUser();
    if (eU || !u || !u.user) return json({ error: 'Hay que iniciar sesión en SAFIA' }, 401);
    const yo = await admin.from('safia_usuarios').select('id,nombre,rol,estado,cliente_id,campos').eq('id', u.user.id).maybeSingle();
    if (!yo.data || yo.data.estado !== 'activo') return json({ error: 'Tu usuario no está activo en SAFIA' }, 403);
    const esOficina = OFICINA.includes(yo.data.rol), esTecnico = yo.data.rol === 'tecnico', esIrrigar = esOficina || esTecnico;

    const cfg = await admin.from('safia_avisos_config').select('valor').eq('clave', 'soporte').maybeSingle();
    if (cfg.error) return json({ error: 'Falta preparar la base de los avisos: hay que correr el SQL safia_avisos.sql' }, 500);
    const whatsapp = String((cfg.data && cfg.data.valor && cfg.data.valor.whatsapp) || '');

    if (accion === 'soporte') return json({ ok: true, whatsapp });

    if (accion === 'soporte_guardar') {
      if (!esOficina) return json({ error: 'Solo la oficina de Irrigar puede cambiar el número de soporte' }, 403);
      const n = String(cuerpo.whatsapp || '').replace(/\D/g, '');
      if (n && (n.length < 10 || n.length > 15)) return json({ error: 'El número tiene que ir completo, con el código del país. Ejemplo de Paraguay: 595 981 123456' }, 400);
      const g = await admin.from('safia_avisos_config').upsert({ clave: 'soporte', valor: { whatsapp: n }, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' });
      if (g.error) return json({ error: g.error.message }, 500);
      return json({ ok: true, whatsapp: n });
    }

    if (accion === 'pedir') {
      const equipoId = String(cuerpo.equipoId || '');
      if (!equipoId) return json({ error: 'Falta el pivot' }, 400);
      const eq = await admin.from('safia_equipos').select('id,datos,cliente_id').eq('id', equipoId).maybeSingle();
      if (eq.error || !eq.data) return json({ error: 'Ese pivot todavía no está en la nube. Esperá unos segundos y volvé a intentar.' }, 404);
      const campoId = eq.data.datos && eq.data.datos.campoId;
      const delCliente = String(eq.data.cliente_id || '') === String(yo.data.cliente_id || '');
      const campos: string[] = (yo.data.campos || []).map(String);
      const deSuEstancia = yo.data.rol === 'cliente' || !campos.length || campos.includes(String(campoId));   // (el técnico entra como Irrigar)
      if (!esIrrigar && !(delCliente && deSuEstancia)) return json({ error: 'Ese pivot no es de tu estancia' }, 403);

      const [campoR, clienteR] = await Promise.all([
        campoId == null ? Promise.resolve({ data: null }) : admin.from('safia_campos').select('id,datos').eq('id', String(campoId)).maybeSingle(),
        eq.data.cliente_id ? admin.from('safia_clientes').select('id,datos').eq('id', String(eq.data.cliente_id)).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const pivot = String((eq.data.datos && eq.data.datos.nombre) || 'Pivot'), campo = String((campoR.data && campoR.data.datos && campoR.data.datos.nombre) || ''), cliente = String((clienteR.data && clienteR.data.datos && clienteR.data.datos.nombre) || '');
      const motivo = MOTIVOS[String(cuerpo.motivo || '')] || 'motivo sin indicar';
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(cuerpo.fecha || '')) ? String(cuerpo.fecha) : hoyPY();
      const nota = String(cuerpo.nota || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const parado = cuerpo.parado !== false;
      const titulo = (parado ? 'Pivot parado: ' : 'Asistencia pedida: ') + pivot + (cliente ? ' · ' + cliente : '');
      const texto = [campo, (parado ? 'Parado desde el ' + fecha.slice(8, 10) + '/' + fecha.slice(5, 7) + ' por ' : 'Motivo: ') + motivo + '.', nota ? 'Nota: ' + nota + '.' : '', 'Pide asistencia ' + (yo.data.nombre || 'un usuario') + ' (' + (ROLES[yo.data.rol] || yo.data.rol) + ').'].filter(Boolean).join(' ');

      // el pedido nuevo le llega a la oficina, que decide qué técnico va
      const irr = await admin.from('safia_usuarios').select('id,nombre').in('rol', OFICINA).eq('estado', 'activo');
      const ids = (irr.data || []).map((x: Cualquiera) => x.id).filter((id: string) => id !== yo.data.id);
      const pedidoId = String(cuerpo.pedidoId || '');
      const r = await enviarA(admin, ids, { titulo, cuerpo: texto, url: pedidoId ? 'asistencias.html?p=' + encodeURIComponent(pedidoId) : 'operador.html?equipo=' + encodeURIComponent(equipoId), tag: 'safia-asistencia-' + equipoId }, equipoId);
      return json({ ok: true, ...r, whatsapp });
    }
    if (accion === 'avisar') {
      const pid = String(cuerpo.pedidoId || '');
      if (!pid) return json({ error: 'Falta el pedido' }, 400);
      const f = await admin.from('safia_asistencias').select('id,datos,cliente_id,campo_ref').eq('id', pid).maybeSingle();
      if (f.error) return json({ error: 'Falta preparar la base de asistencia: hay que correr el SQL safia_asistencias.sql' }, 500);
      if (!f.data) return json({ error: 'Ese pedido todavía no está en la nube. Esperá unos segundos y volvé a intentar.' }, 404);
      const p: Cualquiera = f.data.datos || {};
      const campos: string[] = (yo.data.campos || []).map(String);
      const mio = String(f.data.cliente_id || '') === String(yo.data.cliente_id || '') && (yo.data.rol === 'cliente' || !campos.length || campos.includes(String(f.data.campo_ref)));
      if (!esIrrigar && !mio) return json({ error: 'Ese pedido no es de tu estancia' }, 403);
      const eq = await admin.from('safia_equipos').select('datos').eq('id', String(p.equipoId || '')).maybeSingle();
      const pivot = String((eq.data && eq.data.datos && eq.data.datos.nombre) || 'Pivot');

      // a quién: la gente de la estancia, la oficina y el técnico asignado, según quién escribe y qué pasó
      const evento = String(cuerpo.evento || '');
      const delCampo = async () => {
        if (!f.data.cliente_id) return [] as string[];
        const us = await admin.from('safia_usuarios').select('id,rol,campos').eq('cliente_id', f.data.cliente_id).eq('estado', 'activo').in('rol', ['cliente', 'encargado', 'operador']);
        return (us.data || []).filter((x: Cualquiera) => x.rol === 'cliente' || !(x.campos || []).length || (x.campos || []).map(String).includes(String(f.data.campo_ref))).map((x: Cualquiera) => x.id as string);
      };
      const deOficina = async () => { const o = await admin.from('safia_usuarios').select('id').in('rol', OFICINA).eq('estado', 'activo'); return (o.data || []).map((x: Cualquiera) => x.id as string); };
      const asignado = p.asignado && p.asignado.id ? String(p.asignado.id) : '';
      const tomo = p.tomadoPor && p.tomadoPor.id ? String(p.tomadoPor.id) : '';
      const sinMi = (l: string[]) => Array.from(new Set(l)).filter((id) => id && id !== yo.data.id);
      const quien = (yo.data.nombre || 'Un usuario') + (esIrrigar ? ' (Irrigar)' : ' (' + (ROLES[yo.data.rol] || yo.data.rol) + ')');
      const txt = String(cuerpo.texto || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const v = String(p.visita || ''), visita = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(8, 10) + '/' + v.slice(5, 7) + ' a las ' + v.slice(11, 16) : v;
      const url = 'asistencias.html?p=' + encodeURIComponent(pid), tag = 'safia-asistencia-' + pid, eqId = String(p.equipoId || '');

      if (evento === 'asignado') {
        if (!esOficina) return json({ error: 'Solo la oficina de Irrigar asigna técnicos' }, 403);
        if (!asignado) return json({ error: 'El pedido no tiene técnico asignado' }, 400);
        const [campoR, clienteR, tecR] = await Promise.all([
          f.data.campo_ref ? admin.from('safia_campos').select('datos').eq('id', String(f.data.campo_ref)).maybeSingle() : Promise.resolve({ data: null }),
          f.data.cliente_id ? admin.from('safia_clientes').select('datos').eq('id', String(f.data.cliente_id)).maybeSingle() : Promise.resolve({ data: null }),
          admin.from('safia_usuarios').select('id,nombre,rol,estado').eq('id', asignado).maybeSingle(),
        ]);
        if (!tecR.data || tecR.data.estado !== 'activo' || !['tecnico', ...OFICINA].includes(tecR.data.rol)) return json({ error: 'Ese técnico no está activo en SAFIA' }, 400);
        const campo = String((campoR.data && campoR.data.datos && campoR.data.datos.nombre) || ''), cliente = String((clienteR.data && clienteR.data.datos && clienteR.data.datos.nombre) || '');
        const motivo = MOTIVOS[String(p.motivo || '')] || 'asistencia';
        const orden = Number(p.ordenRuta) > 0 ? Number(p.ordenRuta) + '.º en tu ruta. ' : '';
        const aTec = await enviarA(admin, sinMi([asignado]), { titulo: 'Visita asignada: ' + pivot + (cliente ? ' · ' + cliente : ''), cuerpo: orden + [campo, motivo + (p.descripcion ? ': ' + String(p.descripcion).slice(0, 90) : '') + '.', 'Asignó ' + (yo.data.nombre || 'la oficina') + '.'].filter(Boolean).join(' '), url, tag }, eqId);
        const aCampo = await enviarA(admin, sinMi(await delCampo()), { titulo: 'Irrigar asignó un técnico · ' + pivot, cuerpo: String(tecR.data.nombre || 'Un técnico') + ' va a atender tu pedido de asistencia.', url, tag }, eqId);
        return json({ ok: true, enviados: aTec.enviados + aCampo.enviados, tecnico: aTec.enviados > 0 });
      }

      let ids: string[] = [];
      if (esIrrigar) {
        ids = await delCampo();
        // si escribe el técnico, la oficina se entera de que lo tomó, de la visita y del cierre; si escribe la oficina, el técnico asignado
        if (esTecnico && ['tomado', 'visita', 'cerrado'].includes(evento)) ids = ids.concat(await deOficina());
        if (esOficina && asignado) ids.push(asignado);
      } else {
        // escribe el campo: al técnico asignado (o al que lo tomó); si nadie, a la oficina. El cierre también a la oficina.
        ids = asignado ? [asignado] : tomo ? [tomo] : await deOficina();
        if (evento === 'cerrado' && (asignado || tomo)) ids = ids.concat(await deOficina());
      }
      ids = sinMi(ids);

      const m = evento === 'tomado' ? { titulo: 'Irrigar tomó tu pedido · ' + pivot, cuerpo: quien + ' tomó el pedido de asistencia.' }
        : evento === 'visita' ? { titulo: 'Visita de Irrigar: ' + visita, cuerpo: pivot + '. ' + quien + ' cargó la visita prevista.' }
        : evento === 'cerrado' ? { titulo: 'Asistencia cerrada · ' + pivot, cuerpo: quien + ' cerró el pedido.' + (txt ? ' ' + txt : '') }
        : evento === 'nota' ? { titulo: 'Asistencia · ' + pivot, cuerpo: quien + ': ' + (txt || 'mandó una nota') }
        : null;
      if (!m) return json({ error: 'Novedad desconocida' }, 400);
      const r = await enviarA(admin, ids, { ...m, url, tag }, eqId);
      return json({ ok: true, ...r });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('asistencia: error', String((e as Error)?.message || e));
    return json({ error: String((e as Error)?.message || 'Error inesperado').slice(0, 300) }, 500);
  }
});
