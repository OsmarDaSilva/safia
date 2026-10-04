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
  var ROL = { propietario: 'Propietario', admin: 'Administrador', cliente: 'Cliente', encargado: 'Encargado', operador: 'Operador' };
  // Significado del nombre (un solo lugar para cambiarlo): cada palabra empieza con una letra de SAFIA
  // Definido por Osmar (24-sep-2026): Smart Agricultural Farm Intelligence Assistant
  var SIGNIFICADO = window.SAFIA_SIGNIFICADO || ['Smart', 'Agricultural', 'Farm', 'Intelligence', 'Assistant'];
  var TRADUCCION = 'Asistente inteligente para la gestión del campo';
  var LEMA = 'Smart Agro Intelligence';
  window.SafiaMarca = { significado: SIGNIFICADO, traduccion: TRADUCCION, lema: LEMA, frase: function () { return SIGNIFICADO.join(' '); } };
  var usuario = null, abierto = false;

  /* ---------- menú y permisos por rol ---------- */
  var PAGINAS_IRRIGAR = ['mis-clientes.html', 'usuarios.html', 'evaluar.html', 'informe-evaluacion.html', 'backup.html', 'precios.html', 'suscripciones.html', 'conexiones.html'];
  var PAGINAS_OPERADOR = ['operador.html', 'eventos.html', 'encargado.html', 'voz.html', 'clima.html', 'prediccion.html', 'asistente.html', 'mis-campanas.html', 'seguimiento.html'];   // Campañas desde el 30-sep-2026 (la base deja cargar y cambiar, no borrar)
  var PAGINAS_ESTRUCTURA = ['mis-equipos.html'];   // pivots y lotes: solo Irrigar (30-sep-2026; la base tampoco deja a nadie más)
  function paginaActual() { return (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html'; }
  function fueraDeRol(rol, pag) {
    if (rol === 'operador') return PAGINAS_OPERADOR.indexOf(pag) < 0;
    // dueño (cliente) y gerente (encargado) operan todo menos lo de Irrigar; los pivots y lotes los carga Irrigar
    if (rol === 'cliente') return PAGINAS_IRRIGAR.indexOf(pag) >= 0 || PAGINAS_ESTRUCTURA.indexOf(pag) >= 0;
    if (rol === 'encargado') return PAGINAS_IRRIGAR.indexOf(pag) >= 0 || PAGINAS_ESTRUCTURA.indexOf(pag) >= 0 || pag === 'mis-campos.html';   // las estancias se las asigna Irrigar
    return false;
  }
  function aplicarRol(u, confirmado) {
    if (!u || esAlto(u)) return;
    var rol = u.rol, pag = paginaActual();
    // Redirigir solo con el usuario confirmado por la nube (el guardado en el navegador puede estar viejo)
    if (confirmado && fueraDeRol(rol, pag)) { location.replace(rol === 'operador' ? 'operador.html' : rol === 'encargado' ? 'encargado.html' : 'index.html'); return; }
    // el gerente sigue entrando por su pantalla de Encargado (el Dashboard le queda en el menú)
    if (confirmado && rol === 'encargado' && pag === 'index.html' && /login(\.html)?(\?|#|$)/i.test(document.referrer || '')) { location.replace('encargado.html'); return; }
    // Enlaces a pantallas que el rol no abre: los del menú y los que son un botón ("Cargar →") se esconden;
    // los que están dentro de una frase quedan como texto, sin enlace, para que la frase se siga leyendo.
    var ocultarFuera = function (raiz) {
      if (!raiz || !raiz.querySelectorAll) return;
      raiz.querySelectorAll('a[href]').forEach(function (a) {
        var h = (a.getAttribute('href') || '').split(/[?#]/)[0].toLowerCase();
        if (!/\.html$/.test(h) || !fueraDeRol(rol, h)) return;
        var boton = (a.closest && a.closest('aside, nav, .sidebar')) || /→/.test(a.textContent || '') || /(^|\s)(btn|card-link|estado-chip|alerta-link|sidebar-link)(\s|$)/.test(a.className || '');
        if (boton) { a.style.display = 'none'; return; }
        a.removeAttribute('href'); a.style.color = 'inherit'; a.style.textDecoration = 'none'; a.style.cursor = 'text';
      });
    };
    var aplicar = function () {
      ocultarFuera(document);
      // también los enlaces del cuerpo de la página que se dibujan después (listas, avisos)
      if (window.MutationObserver && document.body && !aplicarRol.observando) {
        aplicarRol.observando = true;
        new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) ocultarFuera(n.parentNode || n); }); }); }).observe(document.body, { childList: true, subtree: true });
      }
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
      if ((rol === 'cliente' || rol === 'encargado') && u.clienteId) {
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
    h += '<a href="#" id="safiaCuentaAvisos" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Avisos al celular</a>';
    if (alto) h += '<a href="usuarios.html" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Usuarios y accesos</a>';
    if (usuario.rol === 'propietario') h += '<a href="backup.html" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Copia de seguridad (.json)</a>';
    h += '<a href="#" id="safiaCuentaAcerca" style="display:block;padding:9px 12px;color:#2E3236;text-decoration:none;font-size:13px;border-top:1px solid #f0f2f4;">Qué significa SAFIA</a>';
    h += '<a href="#" id="safiaCuentaSalir" style="display:block;padding:9px 12px;color:#C0392B;text-decoration:none;font-size:13px;font-weight:700;border-top:1px solid #f0f2f4;">Salir</a>';
    m.innerHTML = h; m.style.display = 'block';
    var sel = $('safiaVerComoSel'); if (sel) sel.addEventListener('change', function () { if (sel.value) verComo(sel.value); else salirVerComo(); });
    $('safiaCuentaClave').addEventListener('click', function (ev) { ev.preventDefault(); cerrarMenu(); modalClave(); });
    $('safiaCuentaAvisos').addEventListener('click', function (ev) { ev.preventDefault(); cerrarMenu(); modalAvisos(); });
    $('safiaCuentaSalir').addEventListener('click', function (ev) { ev.preventDefault(); salir(); });
    $('safiaCuentaAcerca').addEventListener('click', function (ev) { ev.preventDefault(); cerrarMenu(); modalAcerca(); });
  }
  function salir() {
    try { ['safia_usuario', 'safia_ver_como', 'propietario_cliente', 'encargado_campo', 'voz_campo', 'operador_equipo'].forEach(function (k) { localStorage.removeItem(k); }); sessionStorage.removeItem('banco_campo'); } catch (e) {}
    if (!salir._avisosListo) { salir._avisosListo = true; var seguir = function () { salir(); }; Promise.race([AV.desactivar().catch(function () {}), new Promise(function (r) { setTimeout(r, 1500); })]).then(seguir, seguir); return; }
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
      var lado = pie.closest('aside') || pie.parentNode, enlace = lado.querySelector('a[href]'), col = enlace ? getComputedStyle(enlace).color : '#2E3236', fondo = (getComputedStyle(lado).backgroundColor.match(/\d+/g) || [255, 255, 255]).map(Number), oscuro = (0.299 * fondo[0] + 0.587 * fondo[1] + 0.114 * fondo[2]) < 140, sub = oscuro ? '#9AA0A6' : '#8C9196', linea = oscuro ? 'rgba(255,255,255,.12)' : 'rgba(212,162,76,.25)';
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
    suscripcionEnPantalla(usuario);
    avisosEnPantalla(usuario);
  }

  /* ---------- Suscripciones por pivot: enlace del menú (Irrigar) y aviso arriba de la pantalla ---------- */
  var ICO_SUSC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/></svg>';
  var ICO_CONX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></svg>';
  // Enlaces del menú que solo ve Irrigar (Suscripciones, Conexiones): se insertan después de Usuarios copiando su formato
  function enlaceIrrigar(despuesDe, href, texto, ico) {
    if (despuesDe.parentNode.querySelector('a[href="' + href + '"]')) return despuesDe.parentNode.querySelector('a[href="' + href + '"]');
    var n = despuesDe.cloneNode(true); n.setAttribute('href', href); n.classList.remove('active'); n.classList.remove('activo');
    if (paginaActual().replace(/\.html$/, '') === href.replace(/\.html$/, '')) n.classList.add(despuesDe.classList.contains('sidebar-link') ? 'activo' : 'active');
    var svg = n.querySelector('svg'); if (svg) { var cls = svg.getAttribute('class'); svg.outerHTML = cls ? ico.replace('<svg ', '<svg class="' + cls + '" ') : ico; }
    var spans = n.querySelectorAll('span'), etiqueta = null;
    for (var i = spans.length - 1; i >= 0; i--) { if (!spans[i].querySelector('svg') && !spans[i].className) { etiqueta = spans[i]; break; } }
    if (etiqueta) etiqueta.textContent = texto;
    else { for (var j = n.childNodes.length - 1; j >= 0; j--) { if (n.childNodes[j].nodeType === 3 && n.childNodes[j].textContent.trim()) { n.childNodes[j].textContent = texto; break; } } }
    despuesDe.parentNode.insertBefore(n, despuesDe.nextSibling);
    return n;
  }
  function enlaceSuscripciones(u) {
    if (!u || !esAlto(u)) return;
    var poner = function () {
      document.querySelectorAll('aside a[href="usuarios.html"], nav a[href="usuarios.html"], .sidebar a[href="usuarios.html"]').forEach(function (a) {
        var s = enlaceIrrigar(a, 'suscripciones.html', 'Suscripciones', ICO_SUSC);
        enlaceIrrigar(s, 'conexiones.html', 'Conexiones', ICO_CONX);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner();
  }
  // Aviso: pivots vencidos, sin suscripción o que vencen en 30 días (el cliente, en todas sus pantallas; Irrigar, en el Inicio)
  function avisoSuscripcion(u) {
    var S = window.SafiaSuscripcion; if (!u || !S || !S.activa()) return;
    var alto = esAlto(u), pag = paginaActual().replace(/\.html$/, '') || 'index';
    if (alto && pag !== 'index') return;
    if (pag === 'suscripciones' || pag === 'login') return;
    var hoyK = S.hoy(), cerrado = null; try { cerrado = localStorage.getItem('safia_susc_aviso'); } catch (e) {}
    var av = S.avisos(); if (!av.length) { var v0 = $('safiaSuscAviso'); if (v0) v0.remove(); return; }
    var vencidos = av.filter(function (x) { return !x.estado.vigente; }), porVencer = av.filter(function (x) { return x.estado.vigente; });
    // el aviso de 'por vencer' se puede cerrar por el día; el de vencido vuelve en cada pantalla
    if (!vencidos.length && cerrado === hoyK) return;
    var campos = leer('campos'), nombre = function (x) { var c = campos.find(function (k) { return String(k.id) === String(x.equipo.campoId); }); return esc((c ? c.nombre + ' · ' : '') + (x.equipo.nombre || 'pivot')); };
    var linea = function (x) { var e = x.estado, r = S.registro(x.equipo.id) || {}, pr = r.plan === 'Prueba'; return '<b>' + nombre(x) + '</b>: ' + (e.sinSuscripcion ? 'sin suscripción' : !e.vigente ? (pr ? 'la prueba gratis terminó el ' : 'vencida el ') + S.fecha(e.vence) : (pr ? 'prueba gratis hasta el ' : 'vence el ') + S.fecha(e.vence) + (e.dias === 0 ? ' (hoy)' : ' (en ' + e.dias + ' día' + (e.dias === 1 ? '' : 's') + ')')); };
    var rojo = vencidos.length > 0, d = $('safiaSuscAviso');
    if (!d) { d = document.createElement('div'); d.id = 'safiaSuscAviso'; }
    d.style.cssText = 'margin:0 0 14px;padding:12px 14px;border-radius:12px;font:500 13px/1.5 system-ui,sans-serif;display:flex;gap:12px;align-items:flex-start;' + (rojo ? 'background:#FDECEA;border:1px solid #F5C2BC;color:#7A1F16;' : 'background:#FFF6E0;border:1px solid #F1D48A;color:#6B4A00;');
    var titulo = alto ? 'Suscripciones de clientes' : (rojo ? 'Suscripción vencida' : 'Tu suscripción vence pronto');
    var texto = alto ? 'Revisá y renová en Suscripciones.' : (rojo ? 'En esos pivots podés ver todo lo cargado, pero no cargar datos nuevos, análisis, metas ni comparativos. Para renovar, hablá con Irrigar.' : 'Para no cortar el seguimiento, renovala con Irrigar antes de esa fecha.');
    d.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-top:1px;"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M12 14v2"/></svg>' +
      '<div style="flex:1;"><div style="font-weight:800;margin-bottom:2px;">' + titulo + '</div>' + vencidos.concat(porVencer).slice(0, 6).map(linea).join('<br>') + (av.length > 6 ? '<br>y ' + (av.length - 6) + ' más' : '') +
      '<div style="margin-top:4px;">' + texto + (alto ? ' <a href="suscripciones.html" style="color:inherit;font-weight:700;">Ir a Suscripciones</a>' : '') + '</div></div>' +
      (rojo && !alto ? '' : '<a href="#" id="safiaSuscCerrar" style="color:inherit;font-weight:700;text-decoration:none;flex:none;">Cerrar</a>');
    if (!d.parentNode) {
      var main = document.querySelector('main.main, main, .enc-wrap, .contenedor, .contenido, .content');
      if (main) main.insertBefore(d, main.firstChild); else document.body.insertBefore(d, document.body.firstChild);
    }
    var x = $('safiaSuscCerrar'); if (x) x.addEventListener('click', function (ev) { ev.preventDefault(); try { localStorage.setItem('safia_susc_aviso', hoyK); } catch (e) {} d.remove(); });
  }
  function suscripcionEnPantalla(u) {
    enlaceSuscripciones(u);
    var ir = function () { avisoSuscripcion(u); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ir); else ir();
    setTimeout(ir, 1200);   // después de la primera bajada de la nube
  }
  try { var uGuardado = JSON.parse(localStorage.getItem('safia_usuario') || 'null'); if (uGuardado) enlaceSuscripciones(uGuardado); } catch (e) {}

  /* ---------- Avisos al celular (notificaciones de la app; edge safia-avisos) ----------
     El celular se suscribe una vez (permiso del navegador) y queda guardado para ese usuario. Cada mañana el servidor
     calcula el riego, la rotación de piquetes y el mantenimiento con el mismo motor de las pantallas y avisa. */
  function b64u(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function deB64u(t) { var x = String(t).replace(/-/g, '+').replace(/_/g, '/'); var s = atob(x + new Array((4 - x.length % 4) % 4 + 1).join('=')); var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function hoyK() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function esteCelular() { var ua = navigator.userAgent || ''; var so = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'PC Windows' : /mac os/i.test(ua) ? 'Mac' : 'Otro'; var nav = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : ''; return so + (nav ? ' · ' + nav : ''); }
  var AV = {
    soportado: function () { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (location.protocol === 'https:' || location.hostname === 'localhost'); },
    esIOS: /iphone|ipad|ipod/i.test(navigator.userAgent || ''),
    instalada: function () { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; },
    invocar: function (accion, extra) {
      var sb = window.safiaSupabase; if (!sb) return Promise.reject(new Error('Sin conexión con la nube.'));
      var cuerpo = extra || {}; cuerpo.accion = accion;
      return sb.functions.invoke('safia-avisos', { body: cuerpo }).then(function (r) {
        if (r.error) {
          var ctx = r.error.context;
          if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { return j; }, function () { return null; }).then(function (j) { throw new Error((j && j.error) || r.error.message || 'No se pudo conectar'); });
          throw new Error(r.error.message || 'No se pudo conectar');
        }
        if (r.data && r.data.error) throw new Error(r.data.error);
        return r.data;
      });
    },
    suscripcion: function () { if (!AV.soportado()) return Promise.resolve(null); return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }); },
    activar: function () {
      if (!AV.soportado()) return Promise.reject(new Error('Este navegador no permite avisos. En iPhone hay que instalar SAFIA primero (Compartir → Agregar a inicio).'));
      return Notification.requestPermission().then(function (p) {
        if (p !== 'granted') throw new Error(p === 'denied' ? 'Las notificaciones de SAFIA están bloqueadas en este dispositivo: hay que permitirlas en los ajustes del navegador (candado de la barra de dirección → Notificaciones) y volver a tocar Activar.' : 'No se dio el permiso para avisar.');
        return Promise.all([navigator.serviceWorker.ready, AV.invocar('clave')]);
      }).then(function (x) {
        var reg = x[0], publica = x[1].publica;
        return reg.pushManager.getSubscription().then(function (s) {
          var misma = s && s.options && s.options.applicationServerKey && b64u(new Uint8Array(s.options.applicationServerKey)) === publica;
          if (s && !misma) return s.unsubscribe().then(function () { return null; });   // suscripción de otra llave: se renueva
          return s;
        }).then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(publica) }); });
      }).then(function (s) {
        return AV.invocar('suscribir', { suscripcion: s.toJSON(), dispositivo: esteCelular() }).then(function () { try { localStorage.setItem('safia_avisos_sync', hoyK()); } catch (e) {} return s; });
      });
    },
    desactivar: function () {
      return AV.suscripcion().then(function (s) {
        if (!s) return null;
        var ep = s.endpoint;
        return AV.invocar('desuscribir', { endpoint: ep }).catch(function () {}).then(function () { return s.unsubscribe(); });
      });
    }
  };
  function modalAvisos() {
    var d = $('safiaAvisosModal'); if (d) d.remove();
    d = document.createElement('div'); d.id = 'safiaAvisosModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(20,25,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;';
    var alto = esAlto(usuario), rol = usuario && usuario.rol;
    var queLlega = alto ? 'Como Irrigar te llegan los pedidos de asistencia (cuando un cliente marca un pivot parado) en el momento, y las suscripciones que están por vencer (a 30, 15, 7, 3 y 1 día).' :
      rol === 'operador' ? 'Cada mañana te llega el estado de cada pivot: cuánta agua útil tiene, si viene lluvia y qué hacer (no regar, arrancar tal día, arrancar hoy o regar ya). También cuándo toca rotar los animales de piquete.' :
      rol === 'encargado' ? 'Cada mañana te llega el estado de cada pivot: cuánta agua útil tiene, si viene lluvia y qué hacer (no regar, arrancar tal día, arrancar hoy o regar ya). También cuándo toca rotar los animales y cuándo hay mantenimiento vencido.' :
      'Cada mañana te llega el estado de cada pivot: cuánta agua útil tiene, si viene lluvia y qué hacer (no regar, arrancar tal día, arrancar hoy o regar ya). También el mantenimiento vencido.';
    var btn = 'padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:22px;max-width:460px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="font-size:17px;font-weight:800;color:#2E3236;margin-bottom:6px;">Avisos al celular</div>' +
      '<div style="font-size:13px;color:#41464B;line-height:1.5;margin-bottom:10px;">SAFIA calcula todas las mañanas a las 6 y manda la notificación a este dispositivo, aunque la app esté cerrada. ' + queLlega + '</div>' +
      '<div id="safiaAvEstado" style="font-size:13px;padding:9px 12px;border-radius:8px;background:#F4F5F6;color:#41464B;margin-bottom:10px;">Revisando…</div>' +
      '<div id="safiaAvMsg" style="display:none;font-size:13px;font-weight:600;padding:9px 12px;border-radius:8px;margin-bottom:10px;line-height:1.45;"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button id="safiaAvActivar" style="' + btn + 'border:0;background:#22A93A;color:#fff;">Activar en este dispositivo</button>' +
        '<button id="safiaAvProbar" style="' + btn + 'border:1.5px solid #e1e4e7;background:#fff;color:#2E3236;display:none;">Enviar aviso de prueba</button>' +
        '<button id="safiaAvQuitar" style="' + btn + 'border:1.5px solid #e1e4e7;background:#fff;color:#C0392B;display:none;">Desactivar acá</button>' +
        '<button id="safiaAvCerrar" style="' + btn + 'border:1.5px solid #e1e4e7;background:#fff;color:#41464B;margin-left:auto;">Cerrar</button>' +
      '</div>' +
      '<div id="safiaAvUltimos" style="margin-top:12px;"></div>' +
      (alto ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e1e4e7;"><div style="font-size:11px;font-weight:700;color:#8C9196;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Irrigar · todos los clientes</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="safiaAvVista" style="' + btn + 'border:1.5px solid #e1e4e7;background:#fff;color:#2E3236;">Ver qué se avisaría hoy</button><button id="safiaAvEnviar" style="' + btn + 'border:1.5px solid #e1e4e7;background:#fff;color:#2E3236;">Enviar los avisos de hoy ahora</button></div>' +
        '<div id="safiaAvVistaRes" style="margin-top:10px;font-size:12px;color:#41464B;line-height:1.5;"></div></div>' +
        '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e1e4e7;"><div style="font-size:11px;font-weight:700;color:#8C9196;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Irrigar · WhatsApp de soporte</div>' +
        '<div style="font-size:12px;color:#41464B;line-height:1.45;margin-bottom:8px;">Cuando un cliente marca un pivot parado y pide asistencia, SAFIA le abre el WhatsApp hacia este número con el mensaje ya escrito. Va completo, con el código del país (Paraguay: 595 y el número sin el 0).</div>' +
        '<div style="display:flex;gap:8px;"><input id="safiaSopNum" type="tel" inputmode="numeric" placeholder="595 981 123456" style="flex:1;min-width:0;padding:10px 12px;border:1.5px solid #e1e4e7;border-radius:10px;font-size:14px;"><button id="safiaSopGuardar" style="' + btn + 'border:0;background:#22A93A;color:#fff;">Guardar</button></div>' +
        '<div id="safiaSopMsg" style="margin-top:6px;font-size:12px;color:#8C9196;line-height:1.4;">Consultando…</div></div>' : '') +
      '</div>';
    document.body.appendChild(d);
    var msg = function (t, ok) { var m = $('safiaAvMsg'); if (!t) { m.style.display = 'none'; return; } m.textContent = t; m.style.display = 'block'; m.style.background = ok ? '#E7F6EA' : '#FBECEA'; m.style.color = ok ? '#178029' : '#C0392B'; };
    var ocupar = function (b, texto) { var antes = b.textContent; b.disabled = true; b.textContent = texto; return function () { b.disabled = false; b.textContent = antes; }; };
    function pintar() {
      var est = $('safiaAvEstado'); if (!est) return;
      if (!AV.soportado()) {
        est.innerHTML = AV.esIOS && !AV.instalada() ? '<b>En iPhone, primero instalá SAFIA:</b> tocá Compartir y después "Agregar a inicio". Abrí SAFIA desde ese ícono y volvé a esta ventana para activar los avisos.' : 'Este navegador no permite avisos. Usá Chrome o Edge (Android o PC), o SAFIA instalada en iPhone.';
        $('safiaAvActivar').style.display = 'none'; return;
      }
      Promise.all([AV.suscripcion(), AV.invocar('estado').catch(function (e) { return { error: e.message }; })]).then(function (x) {
        var s = x[0], e = x[1] || {};
        if (!$('safiaAvEstado')) return;
        var lista = e.dispositivos || [], aca = !!(s && lista.some(function (k) { return k.endpoint === s.endpoint; }));
        if (e.sinBase) est.innerHTML = 'Falta preparar la base de los avisos (el bloque SQL que corre Irrigar una sola vez).';
        else if (e.error) est.textContent = 'No se pudo consultar el estado: ' + e.error;
        else est.innerHTML = (aca ? '<b style="color:#178029;">Activados en este dispositivo.</b>' : (Notification.permission === 'denied' ? '<b style="color:#C0392B;">Las notificaciones están bloqueadas en este dispositivo.</b> Permitilas en los ajustes del navegador.' : '<b>Todavía no activados en este dispositivo.</b>')) +
          (lista.length ? ' Tu usuario tiene avisos en ' + lista.length + ' dispositivo' + (lista.length === 1 ? '' : 's') + ': ' + lista.map(function (k) { return esc(k.dispositivo || 'dispositivo'); }).join(', ') + '.' : '');
        $('safiaAvActivar').style.display = aca ? 'none' : ''; $('safiaAvQuitar').style.display = aca ? '' : 'none'; $('safiaAvProbar').style.display = lista.length ? '' : 'none';
        var ult = e.ultimos || [];
        $('safiaAvUltimos').innerHTML = ult.length ? '<div style="font-size:11px;font-weight:700;color:#8C9196;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Últimos avisos</div>' + ult.map(function (a) { return '<div style="font-size:12px;color:#41464B;padding:5px 0;border-top:1px solid #f0f2f4;"><b>' + esc(String(a.fecha).slice(8, 10) + '/' + String(a.fecha).slice(5, 7)) + ' · ' + esc(a.titulo) + '</b><br>' + esc(a.cuerpo) + '</div>'; }).join('') : '';
      });
    }
    $('safiaAvCerrar').addEventListener('click', function () { d.remove(); });
    $('safiaAvActivar').addEventListener('click', function () { var fin = ocupar(this, 'Activando…'); msg(''); AV.activar().then(function () { msg('Listo: este dispositivo va a recibir los avisos. Probá con "Enviar aviso de prueba".', true); var b = $('safiaAvisoInvita'); if (b) b.remove(); }, function (e) { msg(e.message); }).then(function () { fin(); pintar(); }); });
    $('safiaAvQuitar').addEventListener('click', function () { var fin = ocupar(this, 'Quitando…'); msg(''); AV.desactivar().then(function () { msg('Este dispositivo ya no recibe avisos.', true); }, function (e) { msg(e.message); }).then(function () { fin(); pintar(); }); });
    $('safiaAvProbar').addEventListener('click', function () { var fin = ocupar(this, 'Enviando…'); msg(''); AV.invocar('probar').then(function (r) { msg(r.enviados ? 'Enviado a ' + r.enviados + ' dispositivo' + (r.enviados === 1 ? '' : 's') + '. Tiene que aparecer en unos segundos.' : 'No se pudo entregar: ' + ((r.fallos || []).join('; ') || 'sin detalle'), !!r.enviados); }, function (e) { msg(e.message); }).then(function () { fin(); pintar(); }); });
    if (alto) {
      var sop = function (accion, extra) { var c = extra || {}; c.accion = accion; return window.safiaSupabase.functions.invoke('safia-asistencia', { body: c }).then(function (r) { if (r.error) { var ctx = r.error.context; if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { return j; }, function () { return null; }).then(function (j) { throw new Error((j && j.error) || r.error.message); }); throw new Error(r.error.message); } if (r.data && r.data.error) throw new Error(r.data.error); return r.data; }); };
      var sopMsg = function (t, color) { var m = $('safiaSopMsg'); if (m) { m.textContent = t; m.style.color = color || '#8C9196'; } };
      var sopVer = function (n) { if ($('safiaSopNum')) $('safiaSopNum').value = n || ''; try { localStorage.setItem('safia_soporte_wa', n || ''); } catch (e) {} sopMsg(n ? 'Número guardado: +' + n + '. Los pedidos de asistencia ofrecen el WhatsApp a este número.' : 'Todavía no hay número cargado: los pedidos de asistencia llegan solo como aviso de la app.', n ? '#178029' : '#8C9196'); };
      if (window.safiaSupabase) sop('soporte').then(function (r) { sopVer(r.whatsapp); }, function (e) { sopMsg('No se pudo consultar: ' + e.message, '#C0392B'); }); else sopMsg('Sin conexión con la nube.', '#C0392B');
      $('safiaSopGuardar').addEventListener('click', function () { var fin = ocupar(this, 'Guardando…'); sop('soporte_guardar', { whatsapp: $('safiaSopNum').value }).then(function (r) { sopVer(r.whatsapp); }, function (e) { sopMsg(e.message, '#C0392B'); }).then(fin); });
      var mostrar = function (r) {
        var h = '<b>' + (r.modo === 'diario' ? 'Enviados ' + r.enviados + ' avisos (' + r.nuevos + ' nuevos de ' + r.calculados + ' calculados; lo ya avisado hoy no se repite).' : 'Vista del ' + String(r.hoy).slice(8, 10) + '/' + String(r.hoy).slice(5, 7) + ' · ' + r.celulares + ' dispositivo(s) con avisos activados. No se envió nada.') + '</b>';
        (r.clientes || []).forEach(function (c) {
          h += '<div style="margin-top:8px;font-weight:700;color:#2E3236;">' + esc(c.cliente || 'Cliente') + '</div>' + (c.salteado ? '<div style="color:#8C9196;">' + esc(c.salteado) + '</div>' : '') + (c.error ? '<div style="color:#C0392B;">' + esc(c.error) + '</div>' : '');
          (c.pivots || []).forEach(function (p) {
            var e = p.estado || {};
            h += '<div style="padding:4px 0;border-top:1px solid #f0f2f4;"><b>' + esc(p.pivot) + '</b> · ' + esc(p.error ? 'error: ' + p.error : e.sinCampana ? 'sin campaña activa' : e.secano ? 'secano' : e.sinCoordenadas ? 'sin coordenadas' : e.sinClima ? 'sin clima al día: no se avisa' : ((e.pct != null ? 'agua útil ' + e.pct + ' % · ' : '') + (e.recomendacion || ''))) +
              (p.avisos || []).map(function (a) { return '<div style="margin:3px 0 0 10px;"><span style="color:#178029;font-weight:700;">' + esc(a.titulo) + '</span><br>' + esc(a.cuerpo) + '<br><span style="color:#8C9196;">Para: ' + esc((a.para || []).join(', ') || 'nadie (no hay usuarios de ese rol)') + '</span></div>'; }).join('') + '</div>';
          });
        });
        if ((r.suscripciones || []).length) h += '<div style="margin-top:8px;font-weight:700;color:#2E3236;">Suscripciones</div>' + r.suscripciones.map(function (s) { return '<div>' + esc(s.titulo) + ' · ' + esc(s.cuerpo) + '</div>'; }).join('');
        if ((r.fallos || []).length) h += '<div style="margin-top:8px;color:#C0392B;">Fallos: ' + esc(r.fallos.join('; ')) + '</div>';
        $('safiaAvVistaRes').innerHTML = h;
      };
      $('safiaAvVista').addEventListener('click', function () { var fin = ocupar(this, 'Calculando…'); $('safiaAvVistaRes').textContent = 'Calculando el riego de cada pivot (tarda unos segundos)…'; AV.invocar('vista').then(mostrar, function (e) { $('safiaAvVistaRes').textContent = 'No se pudo: ' + e.message; }).then(fin); });
      $('safiaAvEnviar').addEventListener('click', function () { var b = this; if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Enviar a los celulares? Tocá de nuevo'; setTimeout(function () { b.dataset.seguro = ''; b.textContent = 'Enviar los avisos de hoy ahora'; }, 4000); return; } b.dataset.seguro = ''; b.textContent = 'Enviar los avisos de hoy ahora'; var fin = ocupar(b, 'Enviando…'); AV.invocar('diario').then(mostrar, function (e) { $('safiaAvVistaRes').textContent = 'No se pudo: ' + e.message; }).then(fin); });
    }
    pintar();
  }
  // Una vez por día, el celular confirma su suscripción (queda a nombre del usuario que está adentro). Y una invitación corta, una sola vez.
  function avisosEnPantalla(u) {
    if (!u || !AV.soportado() || !window.safiaSupabase) return;
    var ir = function () {
      if (Notification.permission === 'granted') {
        var ya = null; try { ya = localStorage.getItem('safia_avisos_sync'); } catch (e) {}
        if (ya === hoyK()) return;
        AV.suscripcion().then(function (s) { if (!s) return; return AV.invocar('suscribir', { suscripcion: s.toJSON(), dispositivo: esteCelular() }).then(function () { try { localStorage.setItem('safia_avisos_sync', hoyK()); } catch (e) {} }); }).catch(function () {});
        return;
      }
      if (Notification.permission !== 'default' || ['operador', 'encargado', 'cliente'].indexOf(u.rol) < 0) return;
      var visto = null; try { visto = localStorage.getItem('safia_avisos_invita'); } catch (e) {}
      if (visto || $('safiaAvisoInvita') || paginaActual() === 'login.html') return;
      var b = document.createElement('div'); b.id = 'safiaAvisoInvita';
      b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99990;max-width:520px;margin:0 auto;background:#2E3236;color:#fff;border-radius:12px;padding:12px 14px;font:500 13px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
      b.innerHTML = '<span style="flex:1 1 220px;">SAFIA te puede mandar cada mañana al celular cómo está el agua de cada pivot, si viene lluvia y si hay que regar.</span><button id="safiaAvisoSi" style="padding:8px 12px;border:0;border-radius:8px;background:#22A93A;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">Activar avisos</button><button id="safiaAvisoNo" style="padding:8px 10px;border:0;border-radius:8px;background:transparent;color:#C9CDD1;font-weight:600;font-size:13px;cursor:pointer;">Ahora no</button>';
      document.body.appendChild(b);
      var cerrar = function () { try { localStorage.setItem('safia_avisos_invita', hoyK()); } catch (e) {} b.remove(); };
      $('safiaAvisoNo').addEventListener('click', cerrar);
      $('safiaAvisoSi').addEventListener('click', function () { cerrar(); modalAvisos(); setTimeout(function () { var a = $('safiaAvActivar'); if (a && a.style.display !== 'none') a.click(); }, 400); });
    };
    setTimeout(ir, 2500);
  }

  /* ---------- Coordenadas: un solo lector para toda SAFIA ----------
     Acepta decimales ("-24.338704, -54.86421", como Google Maps) y grados-minutos-segundos
     ("-24° 20' 19.236\" , -54° 51' 51.146\"" como Lindsay SmartSuite, o 24°20'19.2"S 54°51'51.1"W como Google Earth).
     Devuelve { lat, lon, formato, texto } con decimales de 6 cifras, o null. */
  function leerCoordenadas(texto) {
    var t = String(texto == null ? '' : texto).trim(); if (!t) return null;
    var n = function (x) { return parseFloat(String(x).replace(',', '.')); };
    var red = function (v) { return Math.round(v * 1e6) / 1e6; };
    var ok = function (la, lo) { return !isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0); };
    if (/[°º]/.test(t)) {
      var re = /([NSEWO])?\s*(-?\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’´]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|”|'')\s*)?([NSEWO])?/gi, m, vals = [];
      while ((m = re.exec(t)) && vals.length < 2) {
        var g = n(m[2]), neg = g < 0 || /^-/.test(m[2]), h = (m[5] || m[1] || '').toUpperCase();
        var v = Math.abs(g) + (m[3] ? n(m[3]) / 60 : 0) + (m[4] ? n(m[4]) / 3600 : 0);
        if (neg || h === 'S' || h === 'W' || h === 'O') v = -v;
        vals.push(v);
      }
      if (vals.length === 2 && ok(vals[0], vals[1])) { var la = red(vals[0]), lo = red(vals[1]); return { lat: la, lon: lo, formato: 'gms', texto: la + ', ' + lo }; }
      return null;
    }
    if (t.indexOf('.') < 0 && /-?\d+,\d+\s*[;\s]\s*-?\d+,\d+/.test(t)) t = t.replace(/(\d),(\d)/g, '$1.$2');   // coma decimal: "-24,3387; -54,8642"
    var nums = t.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) return null;
    var a = n(nums[0]), b = n(nums[1]);
    return ok(a, b) ? { lat: a, lon: b, formato: 'decimal', texto: a + ', ' + b } : null;
  }
  function kmEntre(a, b) { var R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  window.SafiaCoord = { leer: leerCoordenadas, km: kmEntre };

  window.SafiaCuenta = { avisos: modalAvisos, acerca: modalAcerca, montar: montar, aplicarRol: aplicarRol, fueraDeRol: fueraDeRol, verComo: verComo, salirVerComo: salirVerComo, verComoActual: verComoActual, cambiarClave: modalClave, salir: salir };
})();
