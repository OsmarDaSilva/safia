/* ============================================================
   SAFIA · safia-sync.js
   Puente entre la app (localStorage) y Supabase.
   - Exige iniciar sesión (redirige a login.html si no hay sesión).
   - Al abrir una página: baja los datos de Supabase al navegador.
     Si Supabase está vacío y el navegador tiene datos, los sube
     (migración inicial automática).
   - Cada vez que la app guarda (localStorage.setItem) una de las
     colecciones, sube los cambios a Supabase (altas, cambios y bajas).
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
    clima_estacion:  'safia_clima_estacion'
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

  // snapshot: ids que sabemos que existen en Supabase (para detectar bajas)
  function claveSnap(clave) { return 'safia_snap_' + clave; }
  function leerSnap(clave) { return leerLista(setGet(claveSnap(clave))); }
  function guardarSnap(clave, ids) { setOriginal(claveSnap(clave), JSON.stringify(ids)); }

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
      document.getElementById('safiaSalirLink').addEventListener('click', function (ev) {
        ev.preventDefault();
        try { window.localStorage.removeItem('safia_usuario'); } catch (e) {}
        sb.auth.signOut().finally(function () { location.replace('login.html'); });
      });
      if (estadoOk !== null) marcarEstado(estadoOk);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', crear);
    } else { crear(); }
  }

  /* ---------- subir cambios a Supabase ---------- */

  var subidasPendientes = {}; // anti-carrera: última subida por colección

  function subirColeccion(clave, lista) {
    var tabla = TABLAS[clave];
    var conId = lista.filter(function (x) { return x && x.id !== undefined && x.id !== null; });

    // Red de seguridad: si dos elementos tienen el MISMO id, Postgres
    // rechaza el upsert entero ("cannot affect row a second time") y se
    // perdería todo lo que el usuario acaba de cargar. Nos quedamos con
    // el último de cada id y avisamos por consola.
    var porId = {};
    conId.forEach(function (x) { porId[String(x.id)] = x; });
    var unicos = Object.keys(porId).map(function (k) { return porId[k]; });
    if (unicos.length !== conId.length) {
      console.warn('SAFIA sync (' + clave + '): ' + (conId.length - unicos.length) +
        ' elemento(s) con id repetido; se subió el último de cada uno.');
    }

    var ids = unicos.map(function (x) { return String(x.id); });
    var filas = unicos.map(function (x) {
      return { id: String(x.id), datos: x, actualizado_en: new Date().toISOString() };
    });
    var idsAnteriores = leerSnap(clave);
    var borrar = idsAnteriores.filter(function (id) { return ids.indexOf(id) === -1; });

    var marca = Date.now();
    subidasPendientes[clave] = marca;

    var p = filas.length
      ? sb.from(tabla).upsert(filas)
      : Promise.resolve({ error: null });

    p.then(function (r) {
      if (r.error) throw r.error;
      if (borrar.length) return sb.from(tabla).delete().in('id', borrar);
      return { error: null };
    }).then(function (r) {
      if (r && r.error) throw r.error;
      if (subidasPendientes[clave] === marca) guardarSnap(clave, ids);
      marcarEstado(true);
    }).catch(function (e) {
      console.error('SAFIA sync (' + clave + '):', e);
      marcarEstado(false, e && e.message);
    });
  }

  // interceptar los guardados de la app (también los que usan variables como clave)
  Storage.prototype.setItem = function (clave, valor) {
    _setItem.call(this, clave, valor);
    if (this === window.localStorage && TABLAS.hasOwnProperty(clave)) {
      subirColeccion(clave, leerLista(valor));
    }
  };

  /* ---------- bajar datos de Supabase ---------- */

  function sincronizarTodo() {
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
          var remoto = (r.data || []).map(function (f) { return f.datos; });
          remoto.sort(function (a, b) { return (parseFloat(a && a.id) || 0) - (parseFloat(b && b.id) || 0); });
          var local = leerLista(setGet(clave));

          if (remoto.length === 0 && local.length > 0) {
            // Supabase vacío y acá hay datos: primera migración, subimos
            subirColeccion(clave, local);
            return;
          }
          guardarSnap(clave, remoto.map(function (x) { return String(x.id); }));
          if (textoEstable(remoto) !== textoEstable(local)) {
            setOriginal(clave, JSON.stringify(remoto));
            huboCambios = true;
          }
        });
      });
    });

    return cadena.then(function () {
      marcarEstado(true);
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
      console.error('SAFIA sync (bajada):', e);
      marcarEstado(false, e && e.message);
    });
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
    var span = document.getElementById('safiaSyncNombre'); if (span) span.textContent = (u.nombre || '') + (u.email ? ' · ' + correoAUsuario(u.email) : '');
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
    function poner() { document.body.appendChild(d); document.getElementById('safiaEsperaVolver').addEventListener('click', function (ev) { ev.preventDefault(); location.reload(); }); document.getElementById('safiaEsperaSalir').addEventListener('click', function (ev) { ev.preventDefault(); try { window.localStorage.removeItem('safia_usuario'); } catch (e) {} sb.auth.signOut().finally(function () { location.replace('login.html'); }); }); }
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
      if (sesion && !/type=recovery/.test(location.hash) && !/reset=1/.test(location.search)) location.replace('index.html');
      return;
    }
    if (!sesion) { location.replace('login.html'); return; }
    insertarBarra(sesion.user && sesion.user.email);
    cargarUsuario(sesion.user).then(function (u) {
      if (u && u.estado && u.estado !== 'activo') { pantallaEspera(u); marcarEstado(false, 'acceso ' + u.estado); return; }
      sincronizarTodo();
    });
  }).catch(function (e) {
    console.error('SAFIA sync (sesión):', e);
    // si no se puede verificar la sesión (sin internet), seguimos en modo local
  });

})();
