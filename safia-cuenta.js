/* SAFIA — Menú de la cuenta (abajo a la derecha, en todas las pantallas)
   -------------------------------------------------------------------
   Un solo lugar para lo de la sesión: quién soy y con qué rol, "Ver como
   cliente" (propietario/admin: SAFIA se pone en el contexto de ese
   productor en todas las pantallas y avisa con una franja arriba),
   "Cambiar mi contraseña", "Usuarios" (propietario/admin) y "Salir".
   Lo monta safia-sync.js cuando conoce al usuario (SafiaCuenta.montar).
   "Ver como" no cambia permisos: solo preselecciona el cliente / su
   primer campo y lote en Propietario, Encargado, Operador, Voz, Banco e
   Informe (las claves que esas pantallas ya recuerdan).
   Menú y permisos por rol (aplicarRol): propietario y admin ven todo;
   el cliente no ve las pantallas de Irrigar (Clientes, Usuarios, Evaluar,
   Precios, Copia de seguridad) y su cliente queda fijo en los selectores;
   el operador solo ve Operador, Eventos, Encargado, Cargar por voz, Clima
   y Predicción. El candado de verdad está en la base (RLS por cliente);
   esto es solo para que cada uno vea su menú. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  var ROL = { propietario: 'Propietario', admin: 'Administrador', cliente: 'Cliente', operador: 'Operador' };
  // Significado del nombre (un solo lugar para cambiarlo): cada palabra empieza con una letra de SAFIA
  // Definido por Osmar (24-sep-2026): Smart Agricultural Farm Intelligence Assistant
  var SIGNIFICADO = window.SAFIA_SIGNIFICADO || ['Smart', 'Agricultural', 'Farm', 'Intelligence', 'Assistant'];
  var TRADUCCION = 'Asistente inteligente para la gestión del campo';
  var LEMA = 'Smart Agro Intelligence';
  window.SafiaMarca = { significado: SIGNIFICADO, traduccion: TRADUCCION, lema: LEMA, frase: function () { return SIGNIFICADO.join(' '); } };
  var usuario = null, abierto = false;

  /* ---------- menú y permisos por rol ---------- */
  var PAGINAS_IRRIGAR = ['mis-clientes.html', 'usuarios.html', 'evaluar.html', 'backup.html', 'precios.html'];
  var PAGINAS_OPERADOR = ['operador.html', 'eventos.html', 'encargado.html', 'voz.html', 'clima.html', 'prediccion.html'];
  function paginaActual() { return (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html'; }
  function fueraDeRol(rol, pag) {
    if (rol === 'operador') return PAGINAS_OPERADOR.indexOf(pag) < 0;
    if (rol === 'cliente') return PAGINAS_IRRIGAR.indexOf(pag) >= 0;
    return false;
  }
  function aplicarRol(u, confirmado) {
    if (!u || esAlto(u)) return;
    var rol = u.rol, pag = paginaActual();
    // Redirigir solo con el usuario confirmado por la nube (el guardado en el navegador puede estar viejo)
    if (confirmado && fueraDeRol(rol, pag)) { location.replace(rol === 'operador' ? 'operador.html' : 'index.html'); return; }
    var aplicar = function () {
      document.querySelectorAll('aside a[href], nav a[href], .sidebar a[href]').forEach(function (a) {
        var h = (a.getAttribute('href') || '').split(/[?#]/)[0].toLowerCase();
        if (!/\.html$/.test(h)) return;
        if (fueraDeRol(rol, h)) a.style.display = 'none';
      });
      // grupos del menú que quedaron sin enlaces visibles
      document.querySelectorAll('.sidebar-grupo, .nav-title, .grupo').forEach(function (g) {
        var n = g.nextElementSibling, alguno = false;
        while (n && !n.classList.contains('sidebar-grupo') && !n.classList.contains('nav-title') && !n.classList.contains('grupo') && !n.classList.contains('sidebar-footer')) {
          if (n.tagName === 'A' ? n.style.display !== 'none' : !!n.querySelector('a[href]:not([style*="display: none"])')) alguno = true;
          n = n.nextElementSibling;
        }
        if (!alguno) g.style.display = 'none';
      });
      document.querySelectorAll('nav.nav').forEach(function (nv) { if (!nv.querySelector('a[href]:not([style*="display: none"])')) nv.style.display = 'none'; });
      // cliente: su propio cliente queda elegido en los selectores de cliente
      // (las pantallas llenan los selectores un rato después de cargar: se reintenta unas veces)
      if (rol === 'cliente' && u.clienteId) {
        var fijar = function () {
          var falta = false;
          ['cliente', 'filtroCliente', 'selCliente', 'propietarioCliente', 'fCliente', 'cliente_id'].forEach(function (id) {
            var s = document.getElementById(id); if (!s || s.tagName !== 'SELECT' || s.value) return;
            s.value = String(u.clienteId);
            if (s.value) { try { s.dispatchEvent(new Event('change')); } catch (e) {} } else falta = true;
          });
          return falta;
        };
        [0, 300, 1000, 2500].forEach(function (ms) { setTimeout(fijar, ms); });
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar); else aplicar();
  }
  // Lo antes posible, con el usuario que quedó guardado en el navegador (solo esconde el menú; no redirige)
  try { aplicarRol(JSON.parse(localStorage.getItem('safia_usuario') || 'null'), false); } catch (e) {}

  function verComoActual() { try { return JSON.parse(localStorage.getItem('safia_ver_como') || 'null'); } catch (e) { return null; } }
  function esAlto(u) { return !!u && (u.rol === 'propietario' || u.rol === 'admin') && (u.estado || 'activo') === 'activo'; }

  // Pone todas las pantallas en el contexto del cliente elegido
  function verComo(clienteId) {
    var cli = leer('clientes').find(function (c) { return String(c.id) === String(clienteId); });
    if (!cli) return;
    var campos = leer('campos').filter(function (c) { return String(c.clienteId) === String(cli.id); });
    var equipos = leer('equipos').filter(function (e) { return campos.some(function (c) { return String(c.id) === String(e.campoId); }); });
    try {
      localStorage.setItem('safia_ver_como', JSON.stringify({ id: cli.id, nombre: cli.nombre }));
      localStorage.setItem('propietario_cliente', String(cli.id));
      if (campos[0]) { localStorage.setItem('encargado_campo', String(campos[0].id)); localStorage.setItem('voz_campo', String(campos[0].id)); sessionStorage.setItem('banco_campo', String(campos[0].id)); }
      else { localStorage.removeItem('encargado_campo'); localStorage.removeItem('voz_campo'); sessionStorage.removeItem('banco_campo'); }
      if (equipos[0]) localStorage.setItem('operador_equipo', String(equipos[0].id)); else localStorage.removeItem('operador_equipo');
    } catch (e) {}
    location.reload();
  }
  function salirVerComo() {
    try { ['safia_ver_como', 'propietario_cliente', 'encargado_campo', 'voz_campo', 'operador_equipo'].forEach(function (k) { localStorage.removeItem(k); }); sessionStorage.removeItem('banco_campo'); } catch (e) {}
    location.reload();
  }

  function franja() {
    var vc = verComoActual(); var f = $('safiaVerComo');
    if (!vc) { if (f) f.remove(); return; }
    if (!f) { f = document.createElement('div'); f.id = 'safiaVerComo'; document.body.appendChild(f); }
    f.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99990;background:#B8731A;color:#fff;font:600 12px/1.3 system-ui,sans-serif;padding:6px 14px;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.2);';
    f.innerHTML = '<span>Estás viendo SAFIA como <b>' + esc(vc.nombre) + '</b> (sus campos y lotes quedan preseleccionados en todas las pantallas)</span><a href="#" id="safiaVerComoSalir" style="color:#fff;text-decoration:underline;font-weight:700;">Volver a mi vista</a>';
    $('safiaVerComoSalir').addEventListener('click', function (ev) { ev.preventDefault(); salirVerComo(); });
    document.body.style.paddingTop = '30px';
  }

  function cerrarMenu() { abierto = false; var m = $('safiaCuentaMenu'); if (m) m.style.display = 'none'; }
  function abrirMenu() {
    abierto = true; var m = $('safiaCuentaMenu'); if (!m) return;
    var alto = esAlto(usuario), vc = verComoActual();
    var clientes = leer('clientes').slice().sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
    var h = '<div style="padding:10px 12px 8px;border-bottom:1px solid #e1e4e7;"><div style="font-weight:800;color:#2E3236;font-size:14px;">' + esc(usuario.nombre || '') + '</div><div style="font-size:11px;color:#8C9196;">' + esc(window.SafiaUsuario ? SafiaUsuario.aUsuario(usuario.email || '') : (usuario.email || '')) + ' · ' + (ROL[usuario.rol] || usuario.rol || '') + '</div></div>';
    if (alto) {
      h += '<div style="padding:8px 12px;border-bottom:1px solid #e1e4e7;"><div style="font-size:11px;font-weight:700;color:#8C9196;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Ver como cliente</div>' +
        '<select id="safiaVerComoSel" style="width:100%;padding:7px 8px;border:1px solid #e1e4e7;border-radius:8px;font:500 13px system-ui,sans-serif;color:#2E3236;background:#fff;"><option value="">— Mi vista (todo) —</option>' +
        clientes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (vc && String(vc.id) === String(c.id) ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join('') + '</select>' +
        '<div style="font-size:11px;color:#8C9196;margin-top:4px;">Para cargar o revisar lo de un productor con sus pantallas ya en su campo.</div></div>';
    }
    h += '<a href="#" id="safiaCuentaClave" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;">Cambiar mi contraseña</a>';
    if (alto) h += '<a href="usuarios.html" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Usuarios y accesos</a>';
    if (usuario.rol === 'propietario') h += '<a href="backup.html" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Copia de seguridad (.json)</a>';
    h += '<a href="#" id="safiaCuentaAcerca" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Qué significa SAFIA</a>';
    h += '<a href="#" id="safiaCuentaSalir" style="display:block;padding:9px 12px;color:#C0392B;text-decoration:none;font-size:13px;font-weight:700;border-top:1px solid #f0f2f4;">Salir</a>';
    m.innerHTML = h; m.style.display = 'block';
    var sel = $('safiaVerComoSel'); if (sel) sel.addEventListener('change', function () { if (sel.value) verComo(sel.value); else salirVerComo(); });
    $('safiaCuentaClave').addEventListener('click', function (ev) { ev.preventDefault(); cerrarMenu(); modalClave(); });
    $('safiaCuentaSalir').addEventListener('click', function (ev) { ev.preventDefault(); salir(); });
    $('safiaCuentaAcerca').addEventListener('click', function (ev) { ev.preventDefault(); cerrarMenu(); modalAcerca(); });
  }
  function salir() {
    try { ['safia_usuario', 'safia_ver_como', 'propietario_cliente', 'encargado_campo', 'voz_campo', 'operador_equipo'].forEach(function (k) { localStorage.removeItem(k); }); sessionStorage.removeItem('banco_campo'); } catch (e) {}
    if (window.SafiaSync && SafiaSync.cerrarSesion) { SafiaSync.cerrarSesion(); return; }
    var sb = window.safiaSupabase;
    try { Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); }); } catch (e) {}
    if (sb && sb.auth) sb.auth.signOut().catch(function () {}).finally(function () { location.replace('login.html?salir=1'); }); else location.replace('login.html?salir=1');
  }

  function modalClave() {
    var d = $('safiaClaveModal'); if (d) d.remove();
    d = document.createElement('div'); d.id = 'safiaClaveModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(20,25,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:22px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="font-size:17px;font-weight:800;color:#2E3236;margin-bottom:12px;">Cambiar mi contraseña</div>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#8C9196;text-transform:uppercase;margin-bottom:5px;">Contraseña nueva (mínimo 6)</label><input type="password" id="safiaClave1" style="width:100%;padding:10px 12px;border:1.5px solid #e1e4e7;border-radius:10px;font-size:15px;margin-bottom:10px;box-sizing:border-box;">' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#8C9196;text-transform:uppercase;margin-bottom:5px;">Repetila</label><input type="password" id="safiaClave2" style="width:100%;padding:10px 12px;border:1.5px solid #e1e4e7;border-radius:10px;font-size:15px;margin-bottom:10px;box-sizing:border-box;">' +
      '<div id="safiaClaveMsg" style="display:none;font-size:13px;font-weight:600;padding:9px 12px;border-radius:8px;margin-bottom:10px;"></div>' +
      '<div style="display:flex;gap:8px;"><button id="safiaClaveOk" style="flex:1;padding:11px;border:0;border-radius:10px;background:#22A93A;color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Guardar</button><button id="safiaClaveNo" style="padding:11px 14px;border:1.5px solid #e1e4e7;border-radius:10px;background:#fff;font-weight:700;font-size:14px;cursor:pointer;">Cancelar</button></div></div>';
    document.body.appendChild(d);
    var msg = function (t, ok) { var m = $('safiaClaveMsg'); m.textContent = t; m.style.display = 'block'; m.style.background = ok ? '#E7F6EA' : '#FBECEA'; m.style.color = ok ? '#178029' : '#C0392B'; };
    $('safiaClaveNo').addEventListener('click', function () { d.remove(); });
    $('safiaClaveOk').addEventListener('click', function () {
      var p1 = $('safiaClave1').value, p2 = $('safiaClave2').value;
      if (p1.length < 6) { msg('Mínimo 6 caracteres.'); return; }
      if (p1 !== p2) { msg('Las dos contraseñas no coinciden.'); return; }
      var sb = window.safiaSupabase; if (!sb) { msg('Sin conexión con la nube.'); return; }
      $('safiaClaveOk').disabled = true;
      sb.auth.updateUser({ password: p1 }).then(function (r) { $('safiaClaveOk').disabled = false; if (r.error) { msg('No se pudo: ' + r.error.message); return; } msg('Contraseña cambiada.', true); setTimeout(function () { d.remove(); }, 1200); }).catch(function () { $('safiaClaveOk').disabled = false; msg('No se pudo conectar.'); });
    });
    setTimeout(function () { $('safiaClave1').focus(); }, 30);
  }

  // Ventana "Qué significa SAFIA"
  function modalAcerca() {
    var d = $('safiaAcercaModal'); if (d) d.remove();
    d = document.createElement('div'); d.id = 'safiaAcercaModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(20,25,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;';
    var letras = SIGNIFICADO.map(function (p) { return '<div style="display:flex;align-items:baseline;gap:10px;"><span style="font-weight:800;font-size:22px;color:#22A93A;width:22px;">' + esc(p.charAt(0)) + '</span><span style="font-size:15px;color:#2E3236;">' + esc(p) + '</span></div>'; }).join('');
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;"><div style="width:44px;height:44px;border-radius:12px;background:#22A93A;display:flex;align-items:center;justify-content:center;color:#fff;"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z"/></svg></div><div><div style="font-weight:800;font-size:22px;color:#2E3236;letter-spacing:.3px;">SAFIA</div><div style="font-size:9px;letter-spacing:1.6px;color:#8C9196;">' + esc(LEMA.toUpperCase().split(' ').join(' · ')) + '</div></div></div>' +
      '<div style="display:grid;gap:6px;margin-bottom:8px;">' + letras + '</div>' +
      '<div style="font-size:13px;color:#8C9196;margin-bottom:14px;">' + esc(TRADUCCION) + '</div>' +
      '<div style="font-size:13px;color:#41464B;line-height:1.55;">SAFIA acompaña el riego de cada lote y, mientras riega, arma el expediente agronómico del campo: suelo, agua, clima, cultivo y cosecha. Con eso compara cada campaña con las mejores de la zona y dice qué falta para rendir más. Un producto de <b>Irrigar</b>.</div>' +
      '<div style="margin-top:16px;display:flex;justify-content:flex-end;"><button id="safiaAcercaCerrar" style="padding:10px 16px;border:0;border-radius:10px;background:#22A93A;color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Cerrar</button></div></div>';
    document.body.appendChild(d);
    $('safiaAcercaCerrar').addEventListener('click', function () { d.remove(); });
    d.addEventListener('click', function (ev) { if (ev.target === d) d.remove(); });
  }

  /* Bloque del usuario al pie del menú lateral (los dos estilos de página): inicial, nombre, rol y el botón
     "Cerrar sesión" a la vista, como en el SIGA. El menú de la cuenta (abajo a la derecha) sigue para lo demás. */
  function bloqueUsuario(u) {
    if (!u) return;
    var poner = function () {
      var pie = document.querySelector('.sidebar-footer, .side-foot'); if (!pie) return;
      var b = $('safiaUsuarioSidebar');
      if (!b) { b = document.createElement('div'); b.id = 'safiaUsuarioSidebar'; pie.parentNode.insertBefore(b, pie); }
      // mismo color que los enlaces del menú (así queda bien en el menú claro y en el oscuro, y aunque el tema se aplique después)
      var lado = pie.closest('aside') || pie.parentNode, enlace = lado.querySelector('a[href]'), col = enlace ? getComputedStyle(enlace).color : '#2E3236', fondo = (getComputedStyle(lado).backgroundColor.match(/d+/g) || [255, 255, 255]).map(Number), oscuro = (0.299 * fondo[0] + 0.587 * fondo[1] + 0.114 * fondo[2]) < 140, sub = oscuro ? '#9AA0A6' : '#8C9196', linea = oscuro ? 'rgba(255,255,255,.12)' : 'rgba(212,162,76,.25)';
      b.style.cssText = 'margin:18px 10px 4px;padding:12px 0 0;border-top:1px solid ' + linea + ';';
      b.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
        '<div style="width:34px;height:34px;border-radius:50%;background:#22A93A;color:#fff;display:flex;align-items:center;justify-content:center;font:800 14px system-ui,sans-serif;flex:none;">' + esc(String(u.nombre || u.email || '?').trim().charAt(0).toUpperCase()) + '</div>' +
        '<div style="min-width:0;"><div style="font:700 13px/1.2 system-ui,sans-serif;color:' + col + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(u.nombre || '') + '</div>' +
        '<div style="font:500 11px/1.3 system-ui,sans-serif;color:' + sub + ';">' + (ROL[u.rol] || u.rol || '') + '</div></div></div>' +
        '<button type="button" id="safiaCerrarSesion" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 10px;border:1px solid ' + (oscuro ? 'rgba(255,255,255,.18)' : '#E1E4E7') + ';border-radius:9px;background:transparent;color:' + col + ';font:700 12.5px system-ui,sans-serif;cursor:pointer;">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Cerrar sesión</button>';
      $('safiaCerrarSesion').addEventListener('click', function (ev) { ev.preventDefault(); var btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Cerrando…'; salir(); });
    };
    // se dibuja de nuevo al cargar y un momento después: algunas pantallas aplican el tema del menú tarde
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner();
    window.addEventListener('load', poner); setTimeout(poner, 900);
  }
  try { bloqueUsuario(JSON.parse(localStorage.getItem('safia_usuario') || 'null')); } catch (e) {}

  function montar(u) {
    usuario = u || usuario; if (!usuario) return;
    aplicarRol(usuario, true);
    bloqueUsuario(usuario);
    var pill = $('safiaSyncBarra');
    if (!pill) {
      pill = document.createElement('div'); pill.id = 'safiaSyncBarra';
      pill.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:99999;display:flex;align-items:center;gap:8px;background:rgba(46,50,54,.94);color:#dfe3e6;font:500 11px/1 system-ui,sans-serif;padding:7px 12px;border-radius:20px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none;';
      document.body.appendChild(pill);
    }
    pill.innerHTML = '<span id="safiaSyncPunto" style="width:8px;height:8px;border-radius:50%;background:#999;display:inline-block;flex:none;"></span>' +
      '<span id="safiaSyncNombre">' + esc(usuario.nombre || '') + ' · ' + (ROL[usuario.rol] || usuario.rol || '') + '</span>' +
      '<span style="color:#7fd48f;font-weight:700;">▴</span>';
    if (window.SafiaSync && SafiaSync.estadoSync) { var e = SafiaSync.estadoSync(); if (e !== null) { var p = $('safiaSyncPunto'); p.style.background = e ? '#22A93A' : '#C0392B'; } }
    var menu = $('safiaCuentaMenu');
    if (!menu) {
      menu = document.createElement('div'); menu.id = 'safiaCuentaMenu';
      menu.style.cssText = 'position:fixed;bottom:46px;right:10px;z-index:99999;width:270px;background:#fff;border:1px solid #e1e4e7;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;font-family:system-ui,sans-serif;overflow:hidden;';
      document.body.appendChild(menu);
      document.addEventListener('click', function (ev) { if (abierto && !menu.contains(ev.target) && !pill.contains(ev.target)) cerrarMenu(); });
    }
    pill.onclick = function () { abierto ? cerrarMenu() : abrirMenu(); };
    franja();
  }

  window.SafiaCuenta = { acerca: modalAcerca, montar: montar, aplicarRol: aplicarRol, fueraDeRol: fueraDeRol, verComo: verComo, salirVerComo: salirVerComo, verComoActual: verComoActual, cambiarClave: modalClave, salir: salir };
})();
