/* ============================================================
   SAFIA · safia-sync.js
   Puente entre la app (localStorage) y Supabase.
   - Exige iniciar sesión (redirige a login.html si no hay sesión).
   - Al abrir una página: baja los datos de Supabase al navegador.
     Si Supabase está vacío y el navegador tiene datos, los sube
     (migración inicial automática).
   - Cada vez que la app guarda (localStorage.setItem) una de las
     colecciones, sube SOLO los registros que cambiaron (altas, cambios
     y bajas, uno por uno): dos navegadores abiertos a la vez no se pisan.
   - Al bajar, mezcla: lo que cambió en la nube entra, lo que este
     navegador todavía no subió se conserva y se sube.
   - Si entra otro usuario en el mismo navegador, se limpian los datos
     del anterior antes de bajar los suyos.
   - Clientes y operadores reciben además los "datos de la zona": las
     campañas cosechadas de los demás, sin nombres (safia_datos_zona).
   - Si no hay internet o falla la CDN, la app sigue funcionando
     en modo local como siempre.
   Incluir en el <head> DESPUÉS de supabase-js:
     <script src=".../supabase.min.js"></script>
     <script src="safia-sync.js"></script>
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://btwxhsaarfopyjhmydlw.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_yu9-JQM8-_dr9vIHAdDCuA_NVR2qkrZ';

  // Clientes sin correo: entran con un nombre de usuario; por dentro es usuario@safia.irrigar.com.py (no es una casilla real)
  var DOMINIO_USUARIO = 'safia.irrigar.com.py';
  function usuarioACorreo(texto) {
    var t = String(texto || '').trim().toLowerCase();
    if (!t) return '';
    if (t.indexOf('@') !== -1) return t;
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '');
    return t ? t + '@' + DOMINIO_USUARIO : '';
  }
  function correoAUsuario(email) { var e = String(email || ''); return e.toLowerCase().endsWith('@' + DOMINIO_USUARIO) ? e.slice(0, e.length - DOMINIO_USUARIO.length - 1) : e; }
  function esUsuarioInterno(email) { return String(email || '').toLowerCase().endsWith('@' + DOMINIO_USUARIO); }
  window.SafiaUsuario = { DOMINIO: DOMINIO_USUARIO, aCorreo: usuarioACorreo, aUsuario: correoAUsuario, esInterno: esUsuarioInterno };

  // clave de localStorage -> tabla en Supabase
  var TABLAS = {
    clientes:        'safia_clientes',
    campos:          'safia_campos',
    equipos:         'safia_equipos',
    cultivos_custom: 'safia_cultivos',
    campanas:        'safia_campanas',
    eventos:         'safia_eventos',
    ciclos:          'safia_ciclos',
    analisis_suelo:  'safia_analisis',
    planes_rotacion: 'safia_planes',
    analisis_foliar: 'safia_foliar',
    clima_estacion:  'safia_clima_estacion',
    precios:         'safia_precios'
  };

  var ES_LOGIN = /login(\.html)?$/i.test(location.pathname);

  /* El navegador (Chrome) recuerda lo que se escribió en campos con el mismo
     nombre y lo sugiere en cualquier pantalla: apagamos ese historial en todos
     los campos de texto libre. Las listas propias de SAFIA (datalist) siguen. */
  function apagarHistorialNavegador(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    var sel = 'form, textarea, input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="tel"], input[type="url"], input[type="email"]';
    var nodos = raiz.matches && raiz.matches(sel) ? [raiz] : [];
    nodos = nodos.concat(Array.prototype.slice.call(raiz.querySelectorAll(sel)));
    nodos.forEach(function (n) {
      if (!n.hasAttribute('autocomplete')) n.setAttribute('autocomplete', 'off');
    });
  }
  if (!ES_LOGIN) {
    var arrancarApagado = function () {
      apagarHistorialNavegador(document.body);
      new MutationObserver(function (cambios) {
        cambios.forEach(function (c) {
          Array.prototype.forEach.call(c.addedNodes, function (n) {
            if (n.nodeType === 1) apagarHistorialNavegador(n);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) arrancarApagado();
    else document.addEventListener('DOMContentLoaded', arrancarApagado);
  }

  // Sin supabase-js (sin internet o CDN caída): modo local, sin bloqueo.
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('SAFIA sync: supabase-js no cargó. Trabajando en modo local.');
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  window.safiaSupabase = sb; // disponible para otras páginas (login, futuro)

  /* Cerrar sesión de verdad: primero se borra la sesión de ESTE navegador (no depende del servidor) y
     se avisa al servidor sin esperarlo. Antes, si el aviso al servidor fallaba (red, token vencido),
     supabase-js no borraba la sesión local y "Salir" volvía al Dashboard. */
  function borrarSesionLocal() {
    try { Object.keys(window.localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) window.localStorage.removeItem(k); }); } catch (e) {}
    try { ['safia_usuario', 'safia_ver_como', 'propietario_cliente', 'encargado_campo', 'voz_campo', 'operador_equipo'].forEach(function (k) { window.localStorage.removeItem(k); }); sessionStorage.removeItem('banco_campo'); } catch (e) {}
  }
  function cerrarSesion() {
    var listo = function () { borrarSesionLocal(); location.replace('login.html?salir=1'); };
    var t = setTimeout(listo, 1500);   // el servidor no contesta: igual salimos
    try { sb.auth.signOut({ scope: 'global' }).catch(function () {}).finally(function () { clearTimeout(t); try { sb.auth.signOut({ scope: 'local' }); } catch (e) {} listo(); }); }
    catch (e) { clearTimeout(t); listo(); }
  }
  window.SafiaSync = Object.assign(window.SafiaSync || {}, { cerrarSesion: cerrarSesion, borrarSesionLocal: borrarSesionLocal });

  /* ---------- utilidades ---------- */

  // stringify con claves ordenadas, para comparar sin falsos cambios
  // (jsonb de Postgres reordena las claves de los objetos)
  function textoEstable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(textoEstable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + textoEstable(v[k]);
    }).join(',') + '}';
  }

  function leerLista(texto) {
    try {
      var l = JSON.parse(texto || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }

  // huella corta de un registro (para saber si cambió sin guardar el registro entero)
  function huella(x) { var s = textoEstable(x), h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); }
  // snapshot: { id: huella } de lo que sabemos que está en Supabase (para detectar cambios y bajas registro por registro)
  function claveSnap(clave) { return 'safia_snap_' + clave; }
  function leerSnap(clave) { try { var s = JSON.parse(setGet(claveSnap(clave)) || 'null'); if (Array.isArray(s)) { var o = {}; s.forEach(function (id) { o[String(id)] = ''; }); return o; } return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; } }
  function guardarSnap(clave, snap) { setOriginal(claveSnap(clave), JSON.stringify(snap)); }
  function mapaPorId(lista) { var o = {}; (lista || []).forEach(function (x) { if (x && x.id !== undefined && x.id !== null) o[String(x.id)] = x; }); return o; }

  var _setItem = Storage.prototype.setItem;
  var _getItem = Storage.prototype.getItem;
  function setOriginal(k, v) { _setItem.call(window.localStorage, k, v); }
  function setGet(k) { return _getItem.call(window.localStorage, k); }

  /* ---------- indicador de estado + salir ---------- */

  var estadoOk = null;
  function marcarEstado(ok, detalle) {
    estadoOk = ok;
    var punto = document.getElementById('safiaSyncPunto');
    if (punto) {
      punto.style.background = ok ? '#22A93A' : '#C0392B';
      punto.title = ok ? 'Sincronizado con Supabase'
                       : 'Sin conexión con Supabase — los cambios quedan solo en este navegador' + (detalle ? ' (' + detalle + ')' : '');
    }
  }

  function insertarBarra(email) {
    function crear() {
      if (document.getElementById('safiaSyncBarra')) return;
      var d = document.createElement('div');
      d.id = 'safiaSyncBarra';
      d.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:99999;display:flex;align-items:center;gap:7px;' +
        'background:rgba(46,50,54,.92);color:#dfe3e6;font:500 11px/1 system-ui,sans-serif;' +
        'padding:7px 11px;border-radius:20px;box-shadow:0 4px 14px rgba(0,0,0,.25);';
      d.innerHTML =
        '<span id="safiaSyncPunto" style="width:8px;height:8px;border-radius:50%;background:#999;display:inline-block;"></span>' +
        '<span id="safiaSyncNombre">' + (email || '') + '</span>' +
        '<a href="#" id="safiaSalirLink" style="color:#7fd48f;text-decoration:none;font-weight:700;margin-left:4px;">Salir</a>';
      document.body.appendChild(d);
      document.getElementById('safiaSalirLink').addEventListener('click', function (ev) { ev.preventDefault(); cerrarSesion(); });
      if (estadoOk !== null) marcarEstado(estadoOk);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', crear);
    } else { crear(); }
  }

  /* ---------- subir cambios a Supabase ---------- */

  var subiendo = {};   // por colección: promesa en curso (las subidas de la misma colección van en fila)

  /* Sube SOLO lo que cambió respecto del snapshot: registros nuevos o modificados (upsert uno por uno
     en un solo pedido) y bajas (ids que estaban en la nube y ya no están acá). Lo que no cambió no se toca,
     así otro navegador que editó otro registro no se pisa. Si dos navegadores editan el MISMO registro,
     queda el último que guardó. */
  function subirColeccion(clave, lista) {
    var tabla = TABLAS[clave];
    var porId = mapaPorId(lista);
    var conId = (lista || []).filter(function (x) { return x && x.id !== undefined && x.id !== null; });
    if (Object.keys(porId).length !== conId.length) console.warn('SAFIA sync (' + clave + '): hay ids repetidos; se sube el último de cada uno.');
    var ejecutar = function () {
      var snap = leerSnap(clave), ids = Object.keys(porId), ahora = new Date().toISOString();
      var cambiados = ids.filter(function (id) { return snap[id] === undefined || snap[id] !== huella(porId[id]); });
      var borrar = Object.keys(snap).filter(function (id) { return porId[id] === undefined; });
      if (!cambiados.length && !borrar.length) return Promise.resolve();
      var filas = cambiados.map(function (id) { return { id: id, datos: porId[id], actualizado_en: ahora }; });
      var p = filas.length ? sb.from(tabla).upsert(filas) : Promise.resolve({ error: null });
      return p.then(function (r) {
        if (r.error) throw r.error;
        cambiados.forEach(function (id) { snap[id] = huella(porId[id]); });
        guardarSnap(clave, snap);
        if (borrar.length) return sb.from(tabla).delete().in('id', borrar);
        return { error: null };
      }).then(function (r) {
        if (r && r.error) throw r.error;
        if (borrar.length) { var s2 = leerSnap(clave); borrar.forEach(function (id) { delete s2[id]; }); guardarSnap(clave, s2); }
        marcarEstado(true);
      }).catch(function (e) {
        console.error('SAFIA sync (' + clave + '):', e);
        marcarEstado(false, e && e.message);
      });
    };
    subiendo[clave] = (subiendo[clave] || Promise.resolve()).then(ejecutar, ejecutar);
    return subiendo[clave];
  }

  // interceptar los guardados de la app (también los que usan variables como clave)
  Storage.prototype.setItem = function (clave, valor) {
    _setItem.call(this, clave, valor);
    if (this === window.localStorage && TABLAS.hasOwnProperty(clave)) {
      subirColeccion(clave, leerLista(valor));
    }
  };

  /* ---------- bajar datos de Supabase ---------- */

  /* Mezcla lo local con lo que vino de la nube, registro por registro:
       - registro que está en la nube y acá no cambió desde el snapshot → entra el de la nube
       - registro que acá cambió y todavía no se subió → se conserva (y se sube después)
       - registro que estaba en la nube (snapshot) y ya no está → alguien lo borró: se saca de acá
       - registro nuevo de acá que la nube no tiene → se conserva (y se sube)
     Devuelve { lista, snap, cambio } (cambio = lo local quedó distinto). Pura, para poder probarla. */
  function fusionar(local, remoto, snap) {
    var L = mapaPorId(local), Rm = mapaPorId(remoto), nuevoSnap = {}, salida = [], cambio = false, pendiente = false;
    remoto.forEach(function (r) {
      var id = String(r.id), l = L[id], hr = huella(r);
      if (l !== undefined && snap[id] !== undefined && snap[id] !== huella(l)) { salida.push(l); nuevoSnap[id] = snap[id]; pendiente = true; }   // cambio local sin subir: gana lo local
      else { salida.push(r); nuevoSnap[id] = hr; if (l === undefined || huella(l) !== hr) cambio = true; }
    });
    (local || []).forEach(function (l) {
      if (!l || l.id === undefined || l.id === null) return;
      var id = String(l.id); if (Rm[id] !== undefined) return;
      if (snap[id] !== undefined) { cambio = true; return; }   // estaba en la nube y ya no: borrado por otro
      salida.push(l); pendiente = true;                        // nuevo acá, todavía no subido
    });
    return { lista: salida, snap: nuevoSnap, cambio: cambio, pendiente: pendiente };
  }

  var sincronizando = null;
  function sincronizarTodo(esArranque) {
    if (sincronizando) return sincronizando;
    var claves = Object.keys(TABLAS);
    var huboCambios = false;
    var cadena = Promise.resolve();

    claves.forEach(function (clave) {
      cadena = cadena.then(function () {
        return sb.from(TABLAS[clave]).select('id,datos').then(function (r) {
          if (r.error) {
            // Una tabla nueva que todavía no se creó en Supabase no frena el resto del sync
            if (/does not exist|schema cache|PGRST205|relation/i.test(String(r.error.message || ''))) { console.warn('SAFIA sync: falta la tabla ' + TABLAS[clave] + ' en Supabase (correr su SQL). Se sigue con las demás.'); return; }
            throw r.error;
          }
          var remoto = (r.data || []).map(function (f) { return f.datos; }).filter(function (x) { return x && x.id !== undefined && x.id !== null; });
          remoto.sort(function (a, b) { return (parseFloat(a && a.id) || 0) - (parseFloat(b && b.id) || 0); });
          var local = leerLista(setGet(clave)), snap = leerSnap(clave);

          if (remoto.length === 0 && local.length > 0 && !Object.keys(snap).length) {
            // Nube vacía, acá hay datos y nunca sincronizamos: primera migración, subimos todo
            subirColeccion(clave, local);
            return;
          }
          var f = fusionar(local, remoto, snap);
          guardarSnap(clave, f.snap);
          if (f.cambio) { setOriginal(clave, JSON.stringify(f.lista)); huboCambios = true; }
          if (f.pendiente) subirColeccion(clave, f.lista);
        });
      });
    });

    // Datos anónimos de la zona (clientes y operadores): campañas cosechadas de los demás, sin nombres
    cadena = cadena.then(function () {
      if (!usuarioActual || usuarioActual.rol === 'admin' || usuarioActual.rol === 'propietario') { if (setGet('zona')) { setOriginal('zona', ''); window.localStorage.removeItem('zona'); } return; }
      return sb.rpc('safia_datos_zona').then(function (r) {
        if (r.error) { console.warn('SAFIA sync: datos de la zona no disponibles (' + r.error.message + ')'); return; }
        var nuevo = r.data || {}; delete nuevo.generado;
        var viejo = setGet('zona') || '';
        var txt = JSON.stringify(nuevo);
        if (txt !== viejo) { setOriginal('zona', txt); huboCambios = true; }
      });
    });

    sincronizando = cadena.then(function () {
      sincronizando = null;
      marcarEstado(true);
      if (huboCambios && !esArranque) {
        // Refresco periódico: no recargamos la pantalla (puede haber un formulario a medias); avisamos
        try { window.dispatchEvent(new CustomEvent('safia:datos')); } catch (e) {}
        avisarDatosNuevos();
        return;
      }
      if (huboCambios) {
        // Recargar UNA vez para que la página muestre los datos nuevos.
        // Protección contra bucle: si una diferencia es permanente (ej. un
        // valor que Postgres devuelve distinto), no recargamos más de 3
        // veces seguidas en la misma página; avisamos y seguimos.
        var ultima = parseFloat(sessionStorage.getItem('safia_recarga') || '0');
        var seguidas = parseInt(sessionStorage.getItem('safia_recargas_seguidas') || '0', 10);
        if (Date.now() - ultima > 60000) seguidas = 0; // pasó un minuto: empezamos de nuevo
        if (seguidas >= 3) {
          console.warn('SAFIA sync: los datos locales y los de la nube difieren de forma persistente; no se recarga más para evitar un bucle.');
          sessionStorage.setItem('safia_recargas_seguidas', '0');
        } else if (Date.now() - ultima > 5000) {
          sessionStorage.setItem('safia_recarga', String(Date.now()));
          sessionStorage.setItem('safia_recargas_seguidas', String(seguidas + 1));
          location.reload();
        }
      } else {
        sessionStorage.setItem('safia_recargas_seguidas', '0');
      }
    }).catch(function (e) {
      sincronizando = null;
      console.error('SAFIA sync (bajada):', e);
      marcarEstado(false, e && e.message);
    });
    return sincronizando;
  }

  // Aviso discreto en la pastilla de la cuenta: hay datos nuevos de otro navegador o usuario
  function avisarDatosNuevos() {
    var n = document.getElementById('safiaSyncNombre'); if (!n || document.getElementById('safiaDatosNuevos')) return;
    var a = document.createElement('a'); a.id = 'safiaDatosNuevos'; a.href = '#'; a.textContent = 'Hay datos nuevos · actualizar';
    a.style.cssText = 'color:#ffd36b;font-weight:700;margin-left:6px;text-decoration:underline;';
    a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); location.reload(); });
    n.parentNode.insertBefore(a, n.nextSibling);
  }

  // Refresco periódico y al volver a la pestaña: así dos navegadores se ven los cambios sin recargar a mano
  var INTERVALO_REFRESCO = 90000;
  function programarRefresco() {
    setInterval(function () { if (document.visibilityState === 'visible' && navigator.onLine !== false) sincronizarTodo(false); }, INTERVALO_REFRESCO);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sincronizarTodo(false); });
  }

  // Cambio de usuario en el mismo navegador: los datos del anterior no pueden quedar (ni mezclarse)
  function limpiarSiCambioUsuario(uid) {
    var previo = setGet('safia_sync_uid') || '';
    if (previo && previo === uid) return false;
    if (previo) {
      Object.keys(TABLAS).forEach(function (k) { window.localStorage.removeItem(k); window.localStorage.removeItem(claveSnap(k)); });
      ['zona', 'safia_ver_como', 'propietario_cliente', 'encargado_campo', 'voz_campo', 'operador_equipo', 'informe_meta'].forEach(function (k) { window.localStorage.removeItem(k); });
      try { sessionStorage.removeItem('banco_campo'); } catch (e) {}
      console.warn('SAFIA sync: cambió el usuario; se limpiaron los datos del anterior.');
    }
    setOriginal('safia_sync_uid', uid);
    return !!previo;
  }

  /* ---------- usuario: nombre y rol (tabla safia_usuarios) ---------- */
  // Queda en localStorage 'safia_usuario' = { id, email, nombre, rol, clienteId } para que
  // cualquier pantalla salude por el nombre y, más adelante, filtre por rol.
  var usuarioActual = null;
  try { usuarioActual = JSON.parse(setGet('safia_usuario') || 'null'); } catch (e) { usuarioActual = null; }
  function nombreDesdeCorreo(email) { var n = correoAUsuario(email).split('@')[0].replace(/[._-]+/g, ' ').trim(); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; }
  function publicarUsuario(u) {
    usuarioActual = u; setOriginal('safia_usuario', JSON.stringify(u));
    if (window.SafiaCuenta) { var montarCuenta = function () { SafiaCuenta.montar(u); if (estadoOk !== null) marcarEstado(estadoOk); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarCuenta); else montarCuenta(); }
    var span = document.getElementById('safiaSyncNombre'); if (span && !window.SafiaCuenta) span.textContent = (u.nombre || '') + (u.email ? ' · ' + correoAUsuario(u.email) : '');
    try { window.dispatchEvent(new CustomEvent('safia:usuario', { detail: u })); } catch (e) {}
  }
  // Pantalla de espera: la cuenta existe pero Irrigar todavía no la aprobó (o la dio de baja)
  function pantallaEspera(u) {
    if (document.getElementById('safiaEspera')) return;
    var baja = u.estado === 'baja';
    var d = document.createElement('div'); d.id = 'safiaEspera';
    d.style.cssText = 'position:fixed;inset:0;z-index:99998;background:linear-gradient(160deg,#2E3236 0%,#3A3E41 55%,#178029 140%);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
    d.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:32px 30px;box-shadow:0 18px 60px rgba(10,20,15,.35);color:#41464B;">' +
      '<div style="font-weight:800;font-size:20px;color:#2E3236;margin-bottom:10px;">' + (baja ? 'Tu acceso a SAFIA está dado de baja' : 'Tu acceso está pendiente de aprobación') + '</div>' +
      '<div style="font-size:14px;line-height:1.55;">' + (baja ? 'Si creés que es un error, hablá con Irrigar.' : 'Hola <b>' + String(u.nombre || u.email || '').replace(/</g, '&lt;') + '</b>. Tu cuenta ya existe: falta que Irrigar la apruebe y te asigne tus campos. Te avisamos por WhatsApp o correo cuando esté lista.') + '</div>' +
      '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;"><a href="#" id="safiaEsperaVolver" style="padding:11px 16px;border-radius:10px;background:#22A93A;color:#fff;font-weight:700;text-decoration:none;font-size:14px;">Volver a comprobar</a>' +
      '<a href="#" id="safiaEsperaSalir" style="padding:11px 16px;border-radius:10px;border:1.5px solid #E1E4E7;color:#41464B;font-weight:700;text-decoration:none;font-size:14px;">Salir</a></div>' +
      '<div style="margin-top:14px;font-size:12px;color:#8C9196;">Irrigar · WhatsApp +595 981 000 000 · ' + String(u.email || '').replace(/</g, '&lt;') + '</div></div>';
    function poner() { document.body.appendChild(d); document.getElementById('safiaEsperaVolver').addEventListener('click', function (ev) { ev.preventDefault(); location.reload(); }); document.getElementById('safiaEsperaSalir').addEventListener('click', function (ev) { ev.preventDefault(); cerrarSesion(); }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner();
  }
  function filaAUsuario(f, base) {
    return { id: f.id, email: f.email || base.email, nombre: f.nombre || base.nombre, rol: f.rol || 'cliente', clienteId: f.cliente_id || null, estado: f.estado || 'activo', telefono: f.telefono || null };
  }
  // Devuelve una promesa con el usuario (activo o no). Si no tiene fila en safia_usuarios, la crea pendiente.
  function cargarUsuario(user) {
    if (!user) return Promise.resolve(null);
    var meta = user.user_metadata || {};
    var base = { id: user.id, email: user.email || '', nombre: meta.nombre || nombreDesdeCorreo(user.email), rol: 'cliente', clienteId: null, estado: 'activo' };
    if (!usuarioActual || usuarioActual.id !== user.id) publicarUsuario(base);
    return sb.from('safia_usuarios').select('id,email,nombre,rol,cliente_id,estado,telefono').eq('id', user.id).maybeSingle().then(function (r) {
      if (r.error) { return usuarioActual; }   // tabla vieja o sin tabla: se sigue como hasta ahora
      if (r.data) { var u = filaAUsuario(r.data, base); publicarUsuario(u); return u; }
      // cuenta de otra app del grupo (o creada antes de la tabla): pedido de acceso automático, queda pendiente
      return sb.from('safia_usuarios').insert({ id: user.id, email: base.email, nombre: base.nombre, rol: 'cliente', estado: 'pendiente', solicitud: meta.solicitud || null, telefono: meta.telefono || null }).then(function (ri) {
        var u = Object.assign({}, base, { estado: ri.error ? 'activo' : 'pendiente' }); publicarUsuario(u); return u;
      });
    }).catch(function () { return usuarioActual; });
  }
  function llamarUsuarios(datos) {
    return sb.functions.invoke('safia-usuarios', { body: datos }).then(function (r) {
      if (r.error) {
        // supabase-js no expone el cuerpo del error: lo leemos del contexto si está
        var ctx = r.error && r.error.context;
        if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { throw new Error((j && j.error) || r.error.message || 'Error'); }, function () { throw new Error(r.error.message || 'Error'); });
        throw new Error(r.error.message || 'Error');
      }
      if (r.data && r.data.error) throw new Error(r.data.error);
      return r.data;
    });
  }
  window.SafiaSync = Object.assign(window.SafiaSync || {}, {
    usuario: function () { return usuarioActual; },
    esAdmin: function () { return !!usuarioActual && (usuarioActual.rol === 'admin' || usuarioActual.rol === 'propietario') && (usuarioActual.estado || 'activo') === 'activo'; },
    esPropietario: function () { return !!usuarioActual && usuarioActual.rol === 'propietario' && (usuarioActual.estado || 'activo') === 'activo'; },
    estadoSync: function () { return estadoOk; },
    fusionar: fusionar, huella: huella,
    refrescar: function () { return sincronizarTodo(false); },
    zona: function () { try { return JSON.parse(setGet('zona') || 'null') || null; } catch (e) { return null; } },
    sb: function () { return sb; },
    // administración (solo admin): lista completa y acciones vía la función safia-usuarios
    listarUsuarios: function () { return sb.from('safia_usuarios').select('*').order('estado').order('nombre').then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; }); },
    guardarUsuario: function (id, cambios) { return sb.from('safia_usuarios').update(Object.assign({}, cambios, { actualizado_en: new Date().toISOString() })).eq('id', id).then(function (r) { if (r.error) throw new Error(r.error.message); return true; }); },
    accionUsuario: llamarUsuarios,
    pendientes: function () { return sb.from('safia_usuarios').select('id,email,nombre,solicitud,telefono,creado_en').eq('estado', 'pendiente').then(function (r) { return r.error ? [] : (r.data || []); }); }
  });

  /* ---------- arranque: sesión + sincronización ---------- */

  sb.auth.getSession().then(function (r) {
    var sesion = r && r.data && r.data.session;
    if (ES_LOGIN) {
      if (/salir=1/.test(location.search)) { borrarSesionLocal(); try { sb.auth.signOut({ scope: 'local' }); } catch (e) {} return; }   // vino de "Salir": no rebotar al Dashboard
      if (sesion && !/type=recovery/.test(location.hash) && !/reset=1/.test(location.search)) location.replace('index.html');
      return;
    }
    if (!sesion) { location.replace('login.html'); return; }
    insertarBarra(sesion.user && sesion.user.email);
    limpiarSiCambioUsuario(String(sesion.user && sesion.user.id || ''));
    cargarUsuario(sesion.user).then(function (u) {
      if (u && u.estado && u.estado !== 'activo') { pantallaEspera(u); marcarEstado(false, 'acceso ' + u.estado); return; }
      sincronizarTodo(true).then(programarRefresco);
    });
  }).catch(function (e) {
    console.error('SAFIA sync (sesión):', e);
    // si no se puede verificar la sesión (sin internet), seguimos en modo local
  });

})();
