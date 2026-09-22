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

  // clave de localStorage -> tabla en Supabase
  var TABLAS = {
    clientes:        'safia_clientes',
    campos:          'safia_campos',
    equipos:         'safia_equipos',
    cultivos_custom: 'safia_cultivos',
    campanas:        'safia_campanas',
    eventos:         'safia_eventos',
    ciclos:          'safia_ciclos',
    analisis_suelo:  'safia_analisis'
  };

  var ES_LOGIN = /login(\.html)?$/i.test(location.pathname);

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
        '<span>' + (email || '') + '</span>' +
        '<a href="#" id="safiaSalirLink" style="color:#7fd48f;text-decoration:none;font-weight:700;margin-left:4px;">Salir</a>';
      document.body.appendChild(d);
      document.getElementById('safiaSalirLink').addEventListener('click', function (ev) {
        ev.preventDefault();
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
          if (r.error) throw r.error;
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

  /* ---------- arranque: sesión + sincronización ---------- */

  sb.auth.getSession().then(function (r) {
    var sesion = r && r.data && r.data.session;
    if (ES_LOGIN) {
      if (sesion) location.replace('index.html');
      return;
    }
    if (!sesion) { location.replace('login.html'); return; }
    insertarBarra(sesion.user && sesion.user.email);
    sincronizarTodo();
  }).catch(function (e) {
    console.error('SAFIA sync (sesión):', e);
    // si no se puede verificar la sesión (sin internet), seguimos en modo local
  });

})();
