// SAFIA · Edge Function: safia-usuarios (v1)
// Lo que un administrador de SAFIA puede hacer con las cuentas SIN entrar al panel de Supabase.
// Usa la clave de servicio del proyecto (la inyecta Supabase en el servidor; el navegador nunca la ve).
// El que llama tiene que estar logueado y ser admin activo en public.safia_usuarios.
//   { accion: 'crear', email, password, nombre, rol, clienteId, telefono } → crea la cuenta (o aprueba la que ya existía con ese correo)
//   { accion: 'aprobar', id, rol, clienteId, nombre }                     → pendiente → activo
//   { accion: 'baja', id }                                                → activo → baja (y la cuenta queda bloqueada para entrar)
//   { accion: 'reactivar', id }                                           → baja → activo
//   { accion: 'clave', id, password }                                     → nueva contraseña
//   { accion: 'quitar', id }                                              → saca la fila de SAFIA (la cuenta sigue existiendo para otras apps)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ROLES = ['admin', 'cliente', 'operador'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Falta la sesión' }, 401);

    // quién llama
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: eU } = await comoUsuario.auth.getUser();
    if (eU || !u?.user) return json({ error: 'Sesión inválida' }, 401);
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: fila } = await admin.from('safia_usuarios').select('rol,estado').eq('id', u.user.id).maybeSingle();
    if (!fila || fila.rol !== 'admin' || fila.estado !== 'activo') return json({ error: 'Solo un administrador de SAFIA puede hacer esto' }, 403);

    const c = await req.json().catch(() => ({}));
    const accion = String(c.accion || '');
    const ahora = new Date().toISOString();

    if (accion === 'crear') {
      const email = String(c.email || '').trim().toLowerCase();
      const password = String(c.password || '');
      const nombre = String(c.nombre || '').trim() || email.split('@')[0];
      const rol = ROLES.includes(c.rol) ? c.rol : 'cliente';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Correo inválido' }, 400);
      if (password.length < 6) return json({ error: 'La contraseña tiene que tener al menos 6 caracteres' }, 400);
      let id: string | null = null, existia = false;
      const r = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre, app: 'safia' } });
      if (r.error) {
        // ya tiene cuenta (SIGA / AGROinvest u otra): la buscamos y la damos de alta en SAFIA con esa misma contraseña
        const msg = String(r.error.message || '').toLowerCase();
        if (!/already|exists|registered/.test(msg)) return json({ error: 'No se pudo crear la cuenta: ' + r.error.message }, 400);
        let pagina = 1;
        while (!id && pagina <= 20) {
          const l = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
          if (l.error) return json({ error: 'No se pudo buscar la cuenta: ' + l.error.message }, 500);
          const enc = (l.data.users || []).find((x) => String(x.email || '').toLowerCase() === email);
          if (enc) id = enc.id;
          if (!l.data.users || l.data.users.length < 200) break;
          pagina++;
        }
        if (!id) return json({ error: 'Ese correo ya tiene cuenta pero no se pudo ubicar' }, 500);
        existia = true;
        if (c.cambiarClave) await admin.auth.admin.updateUserById(id, { password, ban_duration: 'none' });
        else await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
      } else id = r.data.user.id;
      const { error: eF } = await admin.from('safia_usuarios').upsert({ id, email, nombre, rol, estado: 'activo', cliente_id: c.clienteId ? String(c.clienteId) : null, telefono: c.telefono ? String(c.telefono) : null, aprobado_en: ahora, actualizado_en: ahora });
      if (eF) return json({ error: 'La cuenta se creó pero no se pudo guardar el perfil: ' + eF.message }, 500);
      return json({ ok: true, id, existia });
    }

    const id = String(c.id || '');
    if (!id) return json({ error: 'Falta el usuario' }, 400);
    if (id === u.user.id && (accion === 'baja' || accion === 'quitar')) return json({ error: 'No podés darte de baja a vos mismo' }, 400);

    if (accion === 'aprobar') {
      const rol = ROLES.includes(c.rol) ? c.rol : 'cliente';
      const cambios: Record<string, unknown> = { estado: 'activo', rol, cliente_id: c.clienteId ? String(c.clienteId) : null, aprobado_en: ahora, actualizado_en: ahora };
      if (c.nombre) cambios.nombre = String(c.nombre).trim();
      const { error } = await admin.from('safia_usuarios').update(cambios).eq('id', id);
      if (error) return json({ error: error.message }, 500);
      await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
      return json({ ok: true });
    }
    if (accion === 'baja') {
      const { error } = await admin.from('safia_usuarios').update({ estado: 'baja', actualizado_en: ahora }).eq('id', id);
      if (error) return json({ error: error.message }, 500);
      // bloquea la entrada a SAFIA; si la persona usa la misma cuenta en otra app del grupo, avisar antes de dar de baja
      if (c.bloquearCuenta !== false) await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
      return json({ ok: true });
    }
    if (accion === 'reactivar') {
      const { error } = await admin.from('safia_usuarios').update({ estado: 'activo', actualizado_en: ahora }).eq('id', id);
      if (error) return json({ error: error.message }, 500);
      await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
      return json({ ok: true });
    }
    if (accion === 'clave') {
      const password = String(c.password || '');
      if (password.length < 6) return json({ error: 'La contraseña tiene que tener al menos 6 caracteres' }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (accion === 'quitar') {
      const { error } = await admin.from('safia_usuarios').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('safia-usuarios error', String((e as Error)?.message || e));
    return json({ error: 'Error inesperado', detalle: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
