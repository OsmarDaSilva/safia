/* SAFIA — Crear acceso a SAFIA (ventana compartida)
   -------------------------------------------------------------------
   La usan Clientes (al guardar un cliente nuevo con correo, y el botón
   "Crear acceso" de cada fila) y Sistema → Usuarios (+ Crear acceso).
   Llama a la función safia-usuarios (acción 'crear') vía SafiaSync y al
   terminar muestra el correo y la contraseña temporal con el mensaje
   listo para WhatsApp. Solo funciona para administradores.
   Uso: SafiaAccesos.abrir({ nombre, email, telefono, clienteId, rol }, { onDone: fn }) */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function generarClave() { var s = 'abcdefghjkmnpqrstuvwxyz23456789', p = ''; for (var i = 0; i < 4; i++) p += s.charAt(Math.floor(Math.random() * s.length)); return 'safia-' + p + Math.floor(10 + Math.random() * 89); }
  function opcionesClientes(sel) { return '<option value="">— Ninguno (Irrigar) —</option>' + leer('clientes').slice().sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); }).map(function (c) { return '<option value="' + esc(c.id) + '"' + (String(sel || '') === String(c.id) ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join(''); }
  function nombreCliente(id) { var c = leer('clientes').find(function (x) { return String(x.id) === String(id); }); return c ? c.nombre : ''; }
  var ROL = { propietario: 'Propietario', admin: 'Administrador', cliente: 'Cliente', operador: 'Operador' };

  function aviso(texto, err) {
    var a = $('accAviso'); if (!a) return;
    a.textContent = texto; a.className = 'note ' + (err ? 'danger' : 'ok'); a.style.display = texto ? '' : 'none';
  }

  function asegurarModal() {
    if ($('modalAcceso')) return;
    var d = document.createElement('div');
    d.className = 'modal-overlay'; d.id = 'modalAcceso';
    d.innerHTML =
      '<div class="modal" style="max-width:560px;">' +
      '<div class="modal-titulo" id="accTitulo">Crear acceso a SAFIA</div>' +
      '<div id="accForm">' +
      '<div id="accIntro" class="note info" style="display:none;"></div>' +
      '<div class="form-grid">' +
      '<div class="field full"><label>Nombre y apellido</label><input type="text" id="accNombre" placeholder="Ej: Anderson Pereira"></div>' +
      '<div class="field"><label>Correo o nombre de usuario (con esto entra)</label><input type="text" id="accEmail" placeholder="correo@ejemplo.com o, si no tiene correo, un usuario: anderson" autocomplete="off"><div class="muted" id="accEmailAyuda" style="font-size:11px;margin-top:4px;"></div></div>' +
      '<div class="field"><label>WhatsApp</label><input type="tel" id="accTelefono" placeholder="+595 981 234567"></div>' +
      '<div class="field"><label>Rol</label><select id="accRol"><option value="cliente">Cliente (productor)</option><option value="operador">Operador (encargado de campo)</option><option value="admin">Administrador (Irrigar)</option></select></div>' +
      '<div class="field"><label>Cliente al que pertenece</label><select id="accCliente"></select></div>' +
      '<div class="field full"><label>Contraseña temporal (se la pasás vos; la puede cambiar con "Olvidé mi contraseña")</label><div style="display:flex;gap:8px;"><input type="text" id="accPass" style="font-family:ui-monospace,Menlo,Consolas,monospace;"><button class="btn" type="button" id="accGenerar" style="white-space:nowrap;">Generar</button></div></div>' +
      '</div>' +
      '<div id="accAviso" class="note" style="display:none;margin-top:8px;"></div>' +
      '<div class="muted" style="font-size:11px;margin-top:6px;">Si el correo ya tiene cuenta en otra app del grupo (SIGA, AGROinvest360) no se crea otra: se le da acceso a SAFIA con la contraseña que ya usa.</div>' +
      '<div class="modal-actions"><button class="btn green" id="accCrear">Crear acceso</button><button class="btn" id="accCancelar">Ahora no</button></div>' +
      '</div>' +
      '<div id="accListo" style="display:none;">' +
      '<div class="note ok">Acceso creado. Pasale estos datos al cliente.</div>' +
      '<div id="accCred" style="background:var(--bg,#F2F3F5);border:1px dashed var(--bd,#E1E4E7);border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.7;margin:10px 0;"></div>' +
      '<div class="modal-actions"><a class="btn green" id="accWhatsApp" target="_blank" rel="noopener">Enviar por WhatsApp</a><button class="btn" id="accCopiar">Copiar</button><button class="btn" id="accCerrar">Cerrar</button></div>' +
      '</div></div>';
    document.body.appendChild(d);
    $('accGenerar').addEventListener('click', function () { $('accPass').value = generarClave(); });
    $('accEmail').addEventListener('input', ayudaUsuario);
    $('accCancelar').addEventListener('click', cerrar);
    $('accCerrar').addEventListener('click', function () { cerrar(); if (estado.onDone) estado.onDone(estado.resultado); });
    $('accCrear').addEventListener('click', crear);
    $('accCopiar').addEventListener('click', function () { var t = $('accCred').dataset.texto || ''; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { aviso2('Copiado'); }, function () { aviso2('No se pudo copiar: seleccioná el texto'); }); });
  }
  function ayudaUsuario() {
    var v = $('accEmail').value.trim(), a = $('accEmailAyuda'); if (!a) return;
    if (!v) { a.textContent = ''; return; }
    if (v.indexOf('@') !== -1) { a.textContent = 'Entra con este correo. Puede recuperar la contraseña con "Olvidé mi contraseña".'; return; }
    var u = window.SafiaUsuario ? SafiaUsuario.aUsuario(SafiaUsuario.aCorreo(v)) : v;
    a.textContent = 'Sin correo: entra escribiendo el usuario "' + u + '" y su contraseña. Si la olvida, se la cambiás vos desde Usuarios.';
  }
  function aviso2(t) { var el = document.getElementById('toast'); if (el) { el.textContent = t; el.className = 'toast visible ok'; setTimeout(function () { el.className = 'toast'; }, 3000); } }
  var estado = { onDone: null, resultado: null };
  function cerrar() { var m = $('modalAcceso'); if (m) m.classList.remove('visible'); }

  function abrir(pre, opts) {
    pre = pre || {}; opts = opts || {};
    asegurarModal();
    estado.onDone = opts.onDone || null; estado.resultado = null;
    $('accForm').style.display = ''; $('accListo').style.display = 'none'; aviso('');
    $('accTitulo').textContent = opts.titulo || ('Crear acceso a SAFIA' + (pre.nombre ? ' para ' + pre.nombre : ''));
    var intro = $('accIntro'); if (opts.intro) { intro.textContent = opts.intro; intro.style.display = ''; } else intro.style.display = 'none';
    $('accNombre').value = pre.nombre || ''; $('accEmail').value = pre.email || ''; $('accTelefono').value = pre.telefono || '';
    ayudaUsuario();
    var selRol = $('accRol'), soyProp = window.SafiaSync && SafiaSync.esPropietario && SafiaSync.esPropietario();
    selRol.innerHTML = '<option value="cliente">Cliente (productor)</option><option value="operador">Operador (encargado de campo)</option>' + (soyProp ? '<option value="admin">Administrador (Irrigar, soporte)</option><option value="propietario">Propietario (sin límites)</option>' : '');
    $('accRol').value = pre.rol || 'cliente'; $('accCliente').innerHTML = opcionesClientes(pre.clienteId || ''); $('accPass').value = generarClave();
    if (!window.SafiaSync || !SafiaSync.esAdmin || !SafiaSync.esAdmin()) aviso('Solo un administrador de SAFIA puede crear accesos.', true);
    $('modalAcceso').classList.add('visible');
    setTimeout(function () { (pre.email ? $('accPass') : $('accEmail')).focus(); }, 50);
  }

  function crear() {
    var escrito = $('accEmail').value.trim(), interno = escrito.indexOf('@') === -1;
    var datos = { accion: 'crear', nombre: $('accNombre').value.trim(), email: window.SafiaUsuario ? SafiaUsuario.aCorreo(escrito) : escrito.toLowerCase(), telefono: $('accTelefono').value.trim(), rol: $('accRol').value, clienteId: $('accCliente').value || null, password: $('accPass').value.trim() };
    if (!datos.nombre) { aviso('Poné el nombre.', true); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) { aviso(interno ? 'Poné un correo o un nombre de usuario (letras y números).' : 'El correo no es válido.', true); return; }
    var usuarioMostrar = interno ? SafiaUsuario.aUsuario(datos.email) : datos.email;
    if (datos.password.length < 6) { aviso('La contraseña tiene que tener al menos 6 caracteres.', true); return; }
    if (!window.SafiaSync || !SafiaSync.accionUsuario) { aviso('Sin conexión con la nube.', true); return; }
    var b = $('accCrear'); b.disabled = true; b.textContent = 'Creando…'; aviso('');
    SafiaSync.accionUsuario(datos).then(function (r) {
      b.disabled = false; b.textContent = 'Crear acceso';
      var url = location.origin === 'null' || /^file:/.test(location.href) ? 'https://safia.vercel.app/login.html' : location.origin + location.pathname.replace(/[^\/]*$/, '') + 'login.html';
      var texto = r.existia
        ? 'Hola ' + datos.nombre + ', ya tenés acceso a SAFIA.\nEntrá en ' + url + ' con tu ' + (interno ? 'usuario ' : 'correo ') + usuarioMostrar + ' y la misma contraseña que usás en las otras apps del grupo.' + (interno ? '' : ' Si no la recordás, tocá "Olvidé mi contraseña".')
        : 'Hola ' + datos.nombre + ', te creamos el acceso a SAFIA.\nEntrá en ' + url + '\n' + (interno ? 'Usuario: ' : 'Correo: ') + usuarioMostrar + '\nContraseña: ' + datos.password + (interno ? '\nSi la olvidás, avisá a Irrigar y te damos una nueva.' : '\nPodés cambiarla con "Olvidé mi contraseña".');
      $('accCred').innerHTML = (r.existia ? 'Ese correo ya tenía cuenta en el grupo: quedó <b>activo en SAFIA</b> con su contraseña de siempre.<br>' : 'Contraseña temporal: <b style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;">' + esc(datos.password) + '</b><br>') +
        (interno ? 'Usuario: <b>' : 'Correo: <b>') + esc(usuarioMostrar) + '</b><br>Rol: ' + ROL[datos.rol] + (datos.clienteId ? ' · ' + esc(nombreCliente(datos.clienteId)) : '');
      $('accCred').dataset.texto = texto;
      var tel = datos.telefono.replace(/[^0-9]/g, ''); if (tel.indexOf('0') === 0) tel = '595' + tel.slice(1); else if (tel && tel.indexOf('595') !== 0) tel = '595' + tel;
      $('accWhatsApp').href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(texto);
      estado.resultado = Object.assign({}, r, datos);
      $('accForm').style.display = 'none'; $('accListo').style.display = '';
    }).catch(function (e) { b.disabled = false; b.textContent = 'Crear acceso'; aviso(e.message || 'No se pudo crear el acceso.', true); });
  }

  window.SafiaAccesos = { abrir: abrir, cerrar: cerrar, generarClave: generarClave };
})();
