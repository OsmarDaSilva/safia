/* SAFIA · Asistencia técnica: pedidos con seguimiento (window.SafiaAsistencias)
   Cada pedido de asistencia es un asunto: lo abre el campo (operador, encargado o dueño), lo toma un técnico de Irrigar,
   se conversa ADENTRO del pedido (notas cortas y fotos) y se cierra. Cerrado, la conversación termina: otro problema es otro
   pedido. Irrigar también puede dejar constancia de una asistencia resuelta por teléfono. Todo queda en el historial del pivot.
   Datos: colección `asistencias` (tabla safia_asistencias). Dos clases de registro, cada uno con su id (así dos personas
   escribiendo a la vez no se pisan): { tipo:'pedido', … } y { tipo:'nota', pedidoId, … }. Fotos: depósito `safia`,
   carpeta campo_<id>/asistencia/<pedido>/. Avisos al celular: edge safia-asistencia (acciones pedir y avisar). */
(function () {
  'use strict';
  var CLAVE = 'asistencias';
  var MOTIVOS = { electrica: 'Falla eléctrica', mecanica: 'Falla mecánica (rueda, motorreductor, estructura)', bomba: 'Falla de la bomba', energia: 'Corte de energía (ANDE)', agua: 'Falta de agua en la fuente', mantenimiento: 'Mantenimiento programado', consulta: 'Consulta o ajuste (el pivot anda)', otro: 'Otro motivo' };
  var CANALES = { telefono: 'Por teléfono', whatsapp: 'Por WhatsApp', visita: 'Visita al campo', remoto: 'Remoto (telemetría)' };
  var ROLES = { sistema: 'automático', cliente: 'dueño', encargado: 'encargado', operador: 'operador', propietario: 'Irrigar', admin: 'Irrigar' };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lista(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function leer() { return lista(CLAVE); }
  function guardar(l) { localStorage.setItem(CLAVE, JSON.stringify(l)); }
  function nuevoId(p) { return p + Date.now() + Math.floor(Math.random() * 900 + 100); }
  function ahora() { return new Date().toISOString(); }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function usuario() { var u = (window.SafiaSync && SafiaSync.usuario && SafiaSync.usuario()) || null; if (!u) { try { u = JSON.parse(localStorage.getItem('safia_usuario') || 'null'); } catch (e) {} } return u || { id: 'local', nombre: 'Usuario', rol: 'cliente' }; }
  function esIrrigar() { var r = usuario().rol; return r === 'propietario' || r === 'admin'; }
  function yo() { var u = usuario(); return { id: u.id, nombre: u.nombre || u.email || 'Usuario', rol: u.rol }; }
  function firma(p) { return p ? esc(p.nombre) + ' (' + (ROLES[p.rol] || p.rol || '') + ')' : ''; }
  function equipo(id) { return lista('equipos').filter(function (e) { return String(e.id) === String(id); })[0] || null; }
  function campo(id) { return lista('campos').filter(function (c) { return String(c.id) === String(id); })[0] || null; }
  function cliente(id) { return lista('clientes').filter(function (c) { return String(c.id) === String(id); })[0] || null; }
  function lugar(p) { var e = equipo(p.equipoId) || {}, c = campo(p.campoId || e.campoId) || {}, cl = cliente(c.clienteId) || {}; return { pivot: e.nombre || 'Pivot', campo: c.nombre || '', cliente: cl.nombre || '', clienteId: c.clienteId }; }
  // fechas: "04/10 14:30" y "hace 3 h"
  function fh(iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return String(iso); var p = function (n) { return ('0' + n).slice(-2); }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function fd(f) { return f ? String(f).slice(8, 10) + '/' + String(f).slice(5, 7) : ''; }
  function lapso(a, b) { var m = Math.round((new Date(b || Date.now()) - new Date(a)) / 60000); if (!isFinite(m) || m < 0) return ''; if (m < 60) return m + ' min'; var h = Math.round(m / 60); if (h < 48) return h + ' h'; return Math.round(h / 24) + ' días'; }

  /* ---------- datos ---------- */
  function pedidos() { return leer().filter(function (x) { return x.tipo === 'pedido'; }).sort(function (a, b) { return String(b.creado).localeCompare(String(a.creado)); }); }
  function pedido(id) { return leer().filter(function (x) { return x.tipo === 'pedido' && String(x.id) === String(id); })[0] || null; }
  function notasDe(id) { return leer().filter(function (x) { return x.tipo === 'nota' && String(x.pedidoId) === String(id); }).sort(function (a, b) { return String(a.creado).localeCompare(String(b.creado)); }); }
  /* Repuestos y pendientes: lo que falta mandar o llevar para terminar de resolver (un rulemán, un contactor, un fusible).
     Cada uno es un registro aparte ({ tipo:'pendiente', pedidoId, … }) y sigue vivo aunque el pedido se cierre: se termina
     cuando alguien lo marca como entregado. De ahí sale la lista de pendientes por cliente. */
  var DESTINOS = { enviar: 'Enviar al cliente', llevar: 'Lo lleva el técnico en la próxima visita', cliente: 'Lo compra el cliente' };
  function pendientes(soloAbiertos) { return leer().filter(function (x) { return x.tipo === 'pendiente' && (!soloAbiertos || x.estado !== 'entregado'); }).sort(function (a, b) { return String(a.creado).localeCompare(String(b.creado)); }); }
  function pendientesDe(pedidoId) { return pendientes().filter(function (x) { return String(x.pedidoId) === String(pedidoId); }); }
  function agregarPendientes(pedidoId, texto, destino) {   // uno por renglón
    var p = pedido(pedidoId); if (!p) return [];
    var hechos = String(texto || '').split(/\n+/).map(function (t) { return t.replace(/^[\s\-•*]+/, '').trim(); }).filter(Boolean).map(function (t) {
      return agregar({ id: nuevoId('ap'), tipo: 'pendiente', pedidoId: p.id, equipoId: p.equipoId, campoId: p.campoId, creado: ahora(), autor: yo(), texto: t.slice(0, 200), destino: DESTINOS[destino] ? destino : 'enviar', estado: 'pendiente', resuelto: null });
    });
    if (hechos.length) avisar(p.id, 'nota', 'Repuestos pendientes: ' + hechos.map(function (x) { return x.texto; }).join('; '));
    return hechos;
  }
  function marcarPendiente(id, entregado) {
    var l = leer(), ok = false;
    l.forEach(function (x) { if (x.tipo === 'pendiente' && String(x.id) === String(id)) { x.estado = entregado ? 'entregado' : 'pendiente'; x.resuelto = entregado ? { por: yo(), fecha: ahora() } : null; ok = true; } });
    if (ok) guardar(l); return ok;
  }
  function quitarPendiente(id) { guardar(leer().filter(function (x) { return !(x.tipo === 'pendiente' && String(x.id) === String(id)); })); }
  function abiertoDe(equipoId) { return pedidos().filter(function (p) { return p.estado !== 'cerrado' && String(p.equipoId) === String(equipoId); })[0] || null; }
  function cambiar(id, fn) { var l = leer(), i = -1; l.forEach(function (x, k) { if (x.tipo === 'pedido' && String(x.id) === String(id)) i = k; }); if (i < 0) return null; fn(l[i]); guardar(l); return l[i]; }
  function agregar(reg) { var l = leer(); l.push(reg); guardar(l); return reg; }
  function notaSistema(p, texto) { return agregar({ id: nuevoId('an'), tipo: 'nota', pedidoId: p.id, equipoId: p.equipoId, campoId: p.campoId, creado: ahora(), autor: yo(), texto: texto, sistema: true }); }

  function invocar(accion, extra) {
    var sb = window.safiaSupabase; if (!sb) return Promise.reject(new Error('sin conexión con la nube'));
    var c = extra || {}; c.accion = accion;
    return sb.functions.invoke('safia-asistencia', { body: c }).then(function (r) {
      if (r.error) { var ctx = r.error.context; if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { return j; }, function () { return null; }).then(function (j) { throw new Error((j && j.error) || r.error.message || 'no se pudo conectar'); }); throw new Error(r.error.message || 'no se pudo conectar'); }
      if (r.data && r.data.error) throw new Error(r.data.error);
      return r.data;
    });
  }
  // El aviso al celular sale unos segundos después: primero el registro tiene que subir a la nube. Si falla, no frena nada.
  function avisar(pedidoId, evento, texto, vez) {
    setTimeout(function () {
      invocar('avisar', { pedidoId: pedidoId, evento: evento, texto: texto || '' }).catch(function (e) {
        if ((vez || 1) < 3 && /todavía no está en la nube/.test(e.message)) avisar(pedidoId, evento, texto, (vez || 1) + 1);
      });
    }, (vez || 1) === 1 ? 2500 : 7000);
  }

  // Pedido nuevo. o = { equipoId, motivo, descripcion, fechaProblema, parado, paradaId }
  function crear(o) {
    var e = equipo(o.equipoId) || {};
    var p = { id: nuevoId('as'), tipo: 'pedido', origen: 'pedido', equipoId: o.equipoId, campoId: e.campoId || null, paradaId: o.paradaId || null, creado: ahora(), fechaProblema: o.fechaProblema || hoy(),
      motivo: o.motivo || 'otro', descripcion: String(o.descripcion || '').trim(), parado: !!o.parado, pedidoPor: yo(), estado: 'abierto', tomadoPor: null, tomadoEn: null, visita: null, cierre: null, informe: null };
    return agregar(p);
  }
  // Si el pivot está parado y no hay una parada abierta cargada, se carga (la misma del botón Pivot parado del Operador)
  function cargarParada(p) {
    if (!window.SafiaParte || SafiaParte.paradaAbierta(p.equipoId)) return null;
    var cam = lista('campanas').filter(function (k) { return String(k.equipoId) === String(p.equipoId) && k.estado === 'Activa'; })[0];
    var ev = { id: Date.now(), fecha: p.fechaProblema, equipoId: p.equipoId, campanaId: cam ? cam.id : null, tipo: 'parada', observaciones: p.descripcion, cargadoPor: 'manual', fechaCreacion: ahora(),
      motivo: p.motivo === 'consulta' ? 'otro' : p.motivo, hasta: null, asistencia: true };
    var l = lista('eventos'); l.push(ev); localStorage.setItem('eventos', JSON.stringify(l));
    return ev;
  }
  function tomar(id) { var p = cambiar(id, function (x) { x.tomadoPor = yo(); x.tomadoEn = ahora(); }); if (p) { notaSistema(p, 'Tomó el pedido.'); avisar(id, 'tomado'); } return p; }
  function fijarVisita(id, cuando) { var p = cambiar(id, function (x) { x.visita = cuando || null; if (!x.tomadoPor) { x.tomadoPor = yo(); x.tomadoEn = ahora(); } }); if (p && cuando) { notaSistema(p, 'Visita prevista: ' + fh(cuando) + '.'); avisar(id, 'visita'); } return p; }
  function cerrar(id, texto, informe) {
    var p = cambiar(id, function (x) { x.estado = 'cerrado'; x.cierre = { por: yo(), fecha: ahora(), texto: String(texto || '').trim() }; if (informe) x.informe = informe; });
    if (p) avisar(id, 'cerrado', texto);
    return p;
  }
  // Si quedó un pedido abierto de un pivot parado y después se cargó un riego en ese pivot, el pedido se cierra solo: si se regó,
  // el pivot anda (se arregló por teléfono o vino el técnico y nadie lo cerró). Regla de Osmar, 4-oct-2026, igual que la parada.
  // Vale el riego de un día posterior al problema, o el cargado después del pedido con fecha de ese día en adelante. Una consulta
  // con el pivot andando no se cierra así. El técnico puede completar el informe después.
  function cerrarPorRiego() {
    var l = leer(), riegos = null, n = 0;
    l.forEach(function (p) {
      if (p.tipo !== 'pedido' || p.estado === 'cerrado' || !p.parado) return;
      if (!riegos) riegos = lista('eventos').filter(function (v) { return v.tipo === 'riego' && v.fecha && parseFloat(v.cantidad) > 0; });
      var f0 = String(p.fechaProblema || p.creado).slice(0, 10), r = null;
      riegos.forEach(function (v) {
        if (String(v.equipoId) !== String(p.equipoId)) return;
        var fv = String(v.fecha).slice(0, 10), vale = fv > f0 || (fv === f0 && v.fechaCreacion && String(v.fechaCreacion) > String(p.creado));
        if (vale && (!r || fv < String(r.fecha).slice(0, 10))) r = v;
      });
      if (!r) return;
      p.estado = 'cerrado'; p.cierre = { por: { id: 'safia', nombre: 'SAFIA', rol: 'sistema' }, fecha: ahora(), automatico: true, texto: 'Se cerró solo: el ' + fd(r.fecha) + ' se cargó un riego en este pivot, así que ya está funcionando.' };
      n++;
    });
    if (n) guardar(l);
    return n;
  }
  // Orden de servicio: el comprobante del trabajo (número y foto de la orden firmada). La sube quien cierra, o después.
  function guardarOrden(id, nro, archivo) {
    var p = pedido(id); if (!p) return Promise.reject(new Error('pedido no encontrado'));
    nro = String(nro || '').trim();
    if (!nro && !archivo) return Promise.resolve(p);
    var anotar = function (ruta) { return cambiar(id, function (x) { var o = x.orden || {}; x.orden = { nro: nro || o.nro || '', foto: ruta || o.foto || null, por: yo(), fecha: ahora() }; }); };
    // si la foto no sube (sin señal), el número queda guardado igual
    return (archivo ? subirFoto(p, archivo) : Promise.resolve(null)).then(anotar, function (e) { if (nro) anotar(null); throw e; });
  }
  function guardarInforme(id, informe) { return cambiar(id, function (x) { x.informe = Object.assign({}, x.informe || {}, informe, { por: yo(), fecha: ahora() }); }); }
  // Constancia: asistencia ya resuelta (por teléfono, WhatsApp, visita) que deja anotada Irrigar
  function constancia(o) {
    var e = equipo(o.equipoId) || {}, t = ahora();
    return agregar({ id: nuevoId('as'), tipo: 'pedido', origen: 'constancia', equipoId: o.equipoId, campoId: e.campoId || null, paradaId: null, creado: t, fechaProblema: o.fecha || hoy(), motivo: o.motivo || 'otro', descripcion: String(o.problema || '').trim(), parado: false,
      pedidoPor: yo(), estado: 'cerrado', tomadoPor: yo(), tomadoEn: t, visita: null, cierre: { por: yo(), fecha: t, texto: String(o.solucion || '').trim() },
      informe: { canal: o.canal || 'telefono', causa: String(o.problema || '').trim(), solucion: String(o.solucion || '').trim(), repuestos: String(o.repuestos || '').trim(), por: yo(), fecha: t } });
  }

  /* ---------- fotos ---------- */
  var VIDEO_MAX = 45 * 1048576, ES_VIDEO = /\.(mp4|webm|mov|3gp|m4v)$/i;
  function achicar(archivo) {   // a JPEG de 1280 px como mucho: una foto de celular baja de varios MB a unos 200 KB
    return new Promise(function (ok, mal) {
      var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () { var k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(function (b) { b ? ok(b) : mal(new Error('no se pudo leer la foto')); }, 'image/jpeg', 0.78); };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('ese archivo no es una foto')); };
      img.src = url;
    });
  }
  function subirFoto(p, archivo) {
    var sb = window.safiaSupabase; if (!sb) return Promise.reject(new Error('sin conexión con la nube: la foto no se puede subir'));
    if (!p.campoId) return Promise.reject(new Error('el pivot no tiene campo asignado'));
    var esVideo = /^video\//.test(archivo.type || '');
    if (esVideo && archivo.size > VIDEO_MAX) return Promise.reject(new Error('el video pesa ' + Math.round(archivo.size / 1048576) + ' MB y el tope es ' + Math.round(VIDEO_MAX / 1048576) + ' MB: grabá uno más corto (unos 20 segundos alcanzan)'));
    var ext = esVideo ? ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/x-m4v': 'm4v' }[archivo.type] || 'mp4') : 'jpg';
    return (esVideo ? Promise.resolve(archivo) : achicar(archivo)).then(function (b) {
      var ruta = 'campo_' + p.campoId + '/asistencia/' + p.id + '/' + Date.now() + '.' + ext;
      return sb.storage.from('safia').upload(ruta, b, { upsert: false, contentType: esVideo ? archivo.type : 'image/jpeg' }).then(function (r) { if (r.error) throw new Error(/row-level|policy|Unauthorized/i.test(r.error.message) ? 'la base todavía no deja subir fotos de asistencia (falta correr el SQL)' : r.error.message); return ruta; });
    });
  }
  function nota(id, texto, archivo) {
    var p = pedido(id); if (!p) return Promise.reject(new Error('pedido no encontrado'));
    if (p.estado === 'cerrado') return Promise.reject(new Error('El pedido está cerrado: la conversación terminó.'));
    texto = String(texto || '').trim();
    if (!texto && !archivo) return Promise.reject(new Error('Escribí una nota o elegí una foto.'));
    return (archivo ? subirFoto(p, archivo) : Promise.resolve(null)).then(function (ruta) {
      var n = agregar({ id: nuevoId('an'), tipo: 'nota', pedidoId: p.id, equipoId: p.equipoId, campoId: p.campoId, creado: ahora(), autor: yo(), texto: texto, foto: ruta });
      avisar(p.id, 'nota', texto || (ruta && ES_VIDEO.test(ruta) ? 'Mandó un video' : 'Mandó una foto'));
      return n;
    });
  }

  /* ---------- elegir el archivo: cámara de fotos, cámara de video o galería ----------
     En el celular, "Sacar foto" y "Filmar video" abren la cámara directamente (atributo capture); en una PC abren el
     explorador de archivos. Un solo archivo por vez: elegir otro reemplaza al anterior. */
  var ICO = { foto: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>', video: '<rect x="3" y="6.5" width="12" height="11" rx="2"/><path d="m15 10.5 6-3v9l-6-3z"/>', archivo: '<path d="M20 11.5 12.5 19a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3.1 3.1 0 0 1 4.4 4.4l-7.7 7.7a1.6 1.6 0 0 1-2.3-2.3l7-7"/>' };
  function selector(id, soloFoto) {
    var bt = 'position:relative;width:auto;margin:0;text-transform:none;letter-spacing:0;display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border:1.5px solid #E1E4E7;border-radius:10px;background:#fff;color:#2E3236;font-size:13.5px;font-weight:700;cursor:pointer;overflow:hidden;';
    var boton = function (suf, texto, accept, camara) {
      return '<label style="' + bt + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#178029" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICO[suf] + '</svg>' + texto +
        '<input type="file" data-sel="' + id + '" id="' + id + '_' + suf + '" accept="' + accept + '"' + (camara ? ' capture="environment"' : '') + ' style="position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;"></label>';
    };
    return '<div style="flex:1;min-width:200px;"><div style="display:flex;gap:8px;flex-wrap:wrap;">' + boton('foto', 'Sacar foto', 'image/*', true) + (soloFoto ? '' : boton('video', 'Filmar video', 'video/*', true)) + boton('archivo', 'Elegir archivo', soloFoto ? 'image/*' : 'image/*,video/*', false) + '</div>' +
      '<div id="' + id + '_estado" style="font-size:12.5px;color:#6B7075;margin-top:6px;line-height:1.4;">' + (soloFoto ? '' : 'El video, corto: unos 15 segundos alcanzan.') + '</div></div>';
  }
  function elegido(id) { var f = null; ['foto', 'video', 'archivo'].forEach(function (k) { var e = document.getElementById(id + '_' + k); if (e && e.files && e.files[0]) f = e.files[0]; }); return f; }
  function quitar(id) { ['foto', 'video', 'archivo'].forEach(function (k) { var e = document.getElementById(id + '_' + k); if (e) e.value = ''; }); var est = document.getElementById(id + '_estado'); if (est) est.textContent = ''; }
  if (document.addEventListener) {
    document.addEventListener('change', function (ev) {
      var t = ev.target, id = t && t.getAttribute && t.getAttribute('data-sel'); if (!id) return;
      ['foto', 'video', 'archivo'].forEach(function (k) { var e = document.getElementById(id + '_' + k); if (e && e !== t) e.value = ''; });
      var f = t.files && t.files[0], est = document.getElementById(id + '_estado'); if (!est) return;
      if (!f) { est.textContent = ''; return; }
      var esV = /^video\//.test(f.type || ''), mb = f.size / 1048576, peso = mb >= 1 ? Math.round(mb) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
      est.innerHTML = esV && f.size > VIDEO_MAX ? '<b style="color:#B5371C;">El video pesa ' + Math.round(mb) + ' MB y el tope es ' + Math.round(VIDEO_MAX / 1048576) + ' MB.</b> Filmá uno más corto (unos 15 segundos).'
        : '<b style="color:#178029;">' + (esV ? 'Video listo' : 'Foto lista') + ' para enviar</b> · ' + peso + ' · <a href="#" data-quitar="' + id + '" style="color:#B5371C;font-weight:700;">Quitar</a>';
    });
    document.addEventListener('click', function (ev) { var q = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-quitar'); if (q) { ev.preventDefault(); quitar(q); } }, true);   // en captura: el formulario del Operador frena los clics antes de que lleguen al documento
  }

  /* ---------- lectura para otras pantallas ---------- */
  function volvioAAndar(p) {
    if (p.estado === 'cerrado' || !p.paradaId || !window.SafiaParte) return false;
    var ev = lista('eventos').filter(function (v) { return v.tipo === 'parada' && String(v.id) === String(p.paradaId); })[0];
    return !!(ev && SafiaParte.finDe(ev).hasta);
  }
  function estadoTxt(p) {
    if (p.estado === 'cerrado') return 'Cerrado el ' + fh(p.cierre && p.cierre.fecha);
    if (p.visita) return 'Visita prevista: ' + fh(p.visita) + (p.tomadoPor ? ' · ' + p.tomadoPor.nombre : '');
    if (p.tomadoPor) return 'Lo tomó ' + p.tomadoPor.nombre + ' (Irrigar)';
    return 'Esperando que Irrigar lo tome';
  }
  function tarjetaOperador(equipoId) {
    var p = abiertoDe(equipoId); if (!p) return '';
    var n = notasDe(p.id).filter(function (x) { return !x.sistema; }), ult = n[n.length - 1];
    return '<a href="asistencias.html?p=' + encodeURIComponent(p.id) + '" style="display:block;text-decoration:none;color:inherit;">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#B5371C;">Asistencia técnica pedida</div>' +
      '<div style="font-size:14px;font-weight:700;color:#2E3236;margin-top:2px;">' + esc(estadoTxt(p)) + '</div>' +
      '<div style="font-size:12.5px;color:#6B7075;margin-top:2px;line-height:1.4;">Pedida el ' + fh(p.creado) + ' por ' + esc(p.pedidoPor && p.pedidoPor.nombre) + (ult ? ' · Última nota: ' + esc(ult.autor && ult.autor.nombre) + ': ' + esc(String(ult.texto || 'foto').slice(0, 70)) : '') + '</div>' +
      '<div style="font-size:12.5px;font-weight:700;color:#178029;margin-top:4px;">Ver el pedido, escribir o mandar una foto</div></a>';
  }
  function resumenEquipo(equipoId) {
    var ps = pedidos().filter(function (p) { return String(p.equipoId) === String(equipoId); });
    if (!ps.length) return null;
    return ps.slice(0, 6).map(function (p) { return { pedido_el: String(p.creado).slice(0, 10), motivo: MOTIVOS[p.motivo] || p.motivo, descripcion: p.descripcion || undefined, estado: estadoTxt(p), pedido_por: p.pedidoPor ? p.pedidoPor.nombre : undefined,
      tardo_en_tomarse: p.tomadoEn && p.origen !== 'constancia' ? lapso(p.creado, p.tomadoEn) : undefined, tardo_en_resolverse: p.cierre && p.origen !== 'constancia' ? lapso(p.creado, p.cierre.fecha) : undefined,
      orden_de_servicio: p.orden ? ((p.orden.nro ? 'N.º ' + p.orden.nro : 'sin número') + (p.orden.foto ? ', con foto' : ', sin foto')) : (p.estado === 'cerrado' ? 'no cargada' : undefined), cerrado_solo_al_cargarse_un_riego: p.cierre && p.cierre.automatico ? true : undefined, como_se_resolvio: p.informe && (p.informe.solucion || p.informe.repuestos) ? [p.informe.solucion, p.informe.repuestos ? 'repuestos: ' + p.informe.repuestos : ''].filter(Boolean).join(' · ') || undefined : (p.cierre && p.cierre.texto) || undefined,
      constancia_de_irrigar: p.origen === 'constancia' ? (CANALES[p.informe && p.informe.canal] || 'sí') : undefined, notas: notasDe(p.id).filter(function (n) { return !n.sistema; }).length,
      repuestos_pendientes: pendientesDe(p.id).filter(function (x) { return x.estado !== 'entregado'; }).map(function (x) { return x.texto + ' (' + (DESTINOS[x.destino] || '') + ')'; }) }; });
  }

  /* ---------- pantalla ---------- */
  var cont = null, vista = { modo: 'lista', id: null, filtro: 'abiertos', cliente: '', equipo: '', msg: '' };
  var B = 'padding:10px 14px;border-radius:10px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;';
  var BV = B + 'border:0;background:#22A93A;color:#fff;', BG = B + 'border:1.5px solid #E1E4E7;background:#fff;color:#2E3236;', BR = B + 'border:1.5px solid #E7C4BB;background:#fff;color:#B5371C;';
  var IN = 'width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #E1E4E7;border-radius:10px;font-size:14px;font-family:inherit;background:#fff;color:#2E3236;';
  var LB = 'display:block;font-size:12px;font-weight:700;color:#6B7075;margin:10px 0 4px;';
  function chip(p) {
    var c = p.estado === 'cerrado' ? ['#EEF0F2', '#6B7075', p.origen === 'constancia' ? 'Constancia' : p.cierre && p.cierre.automatico ? 'Cerrado solo (se regó)' : 'Cerrado'] : p.visita ? ['#E7F6EA', '#178029', 'Visita ' + fh(p.visita)] : p.tomadoPor ? ['#E8F1FB', '#1F5FA8', 'Tomado'] : ['#FBECEA', '#B5371C', 'Sin tomar'];
    return '<span style="display:inline-block;padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:700;background:' + c[0] + ';color:' + c[1] + ';white-space:nowrap;">' + esc(c[2]) + '</span>';
  }
  function equiposVisibles() { return lista('equipos').filter(function (e) { return !e.zona && !(window.SafiaBalance && SafiaBalance.esSecano && SafiaBalance.esSecano(e)); }); }
  function opcionesEquipo(sel, clienteId) {
    return equiposVisibles().filter(function (e) { return !clienteId || String((campo(e.campoId) || {}).clienteId) === String(clienteId); }).map(function (e) { var c = campo(e.campoId) || {}, cl = cliente(c.clienteId) || {}; return { id: e.id, t: (esIrrigar() && cl.nombre && !clienteId ? cl.nombre + ' · ' : '') + (c.nombre ? c.nombre + ' · ' : '') + e.nombre + (abiertoDe(e.id) ? ' (pedido abierto)' : '') }; })
      .sort(function (a, b) { return a.t.localeCompare(b.t); }).map(function (o) { return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(sel) ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('');
  }
  function opcionesMotivo(sel) { return Object.keys(MOTIVOS).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(MOTIVOS[k]) + '</option>'; }).join(''); }
  function aviso(t, ok) { return t ? '<div style="margin:10px 0;padding:10px 12px;border-radius:8px;font-size:13.5px;font-weight:600;line-height:1.45;background:' + (ok ? '#E7F6EA' : '#FBECEA') + ';color:' + (ok ? '#178029' : '#B5371C') + ';">' + esc(t) + '</div>' : ''; }
  function ir(modo, id, msg, ok) { if (modo === 'lista' || modo === 'detalle') vista.formCliente = ''; vista.modo = modo; vista.id = id || null; vista.msg = msg || ''; vista.msgOk = !!ok; pintar(); window.scrollTo(0, 0); }

  function htmlLista() {
    var todos = pedidos(), irr = esIrrigar();
    var abiertos = todos.filter(function (p) { return p.estado !== 'cerrado'; });
    var l = todos.filter(function (p) {
      if (vista.filtro === 'abiertos' && p.estado === 'cerrado') return false;
      if (vista.filtro === 'cerrados' && p.estado !== 'cerrado') return false;
      if (vista.equipo && String(p.equipoId) !== String(vista.equipo)) return false;
      if (vista.cliente && String(lugar(p).clienteId) !== String(vista.cliente)) return false;
      return true;
    });
    var cerr = todos.filter(function (p) { return p.estado === 'cerrado' && p.origen !== 'constancia' && p.cierre; });
    var prom = function (f) { var v = cerr.map(f).filter(function (x) { return isFinite(x) && x >= 0; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; };
    var hrs = function (m) { return m == null ? '—' : m < 90 ? Math.round(m) + ' min' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' días'; };
    var tResp = prom(function (p) { return p.tomadoEn ? (new Date(p.tomadoEn) - new Date(p.creado)) / 60000 : NaN; }), tRes = prom(function (p) { return (new Date(p.cierre.fecha) - new Date(p.creado)) / 60000; });
    var kpi = function (v, t, color) { return '<div style="flex:1;min-width:120px;background:#fff;border:1px solid #E1E4E7;border-radius:10px;padding:10px 12px;"><div style="font-size:22px;font-weight:800;color:' + (color || '#2E3236') + ';">' + v + '</div><div style="font-size:12px;color:#6B7075;">' + t + '</div></div>'; };
    var clientesConPedidos = {}; todos.forEach(function (p) { var g = lugar(p); if (g.clienteId) clientesConPedidos[g.clienteId] = g.cliente; });
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<button data-a="nuevo" style="' + BV + '">Pedir asistencia</button>' +
      (irr ? '<button data-a="constancia" style="' + BG + '">Registrar asistencia ya resuelta</button>' : '') + '</div>' +
      aviso(vista.msg, vista.msgOk) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
        kpi(abiertos.length, 'pedidos abiertos', abiertos.length ? '#B5371C' : '#178029') +
        kpi(abiertos.filter(function (p) { return !p.tomadoPor; }).length, 'sin tomar') +
        kpi(hrs(tResp), 'tardó Irrigar en tomarlos (promedio)') + kpi(hrs(tRes), 'tardaron en resolverse (promedio)') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
        ['abiertos', 'cerrados', 'todos', 'pendientes'].map(function (f) { return '<button data-f="' + f + '" style="' + B + 'padding:7px 12px;border:1.5px solid ' + (vista.filtro === f ? '#22A93A;background:#E7F6EA;color:#178029' : '#E1E4E7;background:#fff;color:#41464B') + ';">' + (f === 'abiertos' ? 'Abiertos' : f === 'cerrados' ? 'Historial (cerrados)' : f === 'pendientes' ? 'Repuestos pendientes (' + pendientes(true).length + ')' : 'Todos') + '</button>'; }).join('') +
        (irr && Object.keys(clientesConPedidos).length > 1 ? '<select id="asFCliente" style="' + IN + 'width:auto;padding:7px 10px;"><option value="">Todos los clientes</option>' + Object.keys(clientesConPedidos).map(function (k) { return '<option value="' + esc(k) + '"' + (String(k) === String(vista.cliente) ? ' selected' : '') + '>' + esc(clientesConPedidos[k]) + '</option>'; }).join('') + '</select>' : '') +
        '<select id="asFEquipo" style="' + IN + 'width:auto;max-width:100%;padding:7px 10px;"><option value="">Todos los pivots</option>' + opcionesEquipo(vista.equipo) + '</select></div>';
    if (vista.filtro === 'pendientes') return h + htmlPendientes();
    if (!l.length) return h + '<div style="background:#fff;border:1px dashed #C9CED3;border-radius:10px;padding:22px;text-align:center;color:#6B7075;font-size:14px;line-height:1.5;">' + (vista.filtro === 'abiertos' ? 'No hay pedidos de asistencia abiertos.' : 'No hay pedidos para mostrar.') + '</div>';
    return h + l.map(function (p) {
      var g = lugar(p), n = notasDe(p.id).filter(function (x) { return !x.sistema; }), paradaCerrada = volvioAAndar(p);
      return '<div data-p="' + esc(p.id) + '" style="background:#fff;border:1px solid #E1E4E7;border-left:4px solid ' + (p.estado === 'cerrado' ? '#B9BEC3' : p.tomadoPor ? '#1F5FA8' : '#B5371C') + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div style="font-size:15px;font-weight:800;color:#2E3236;">' + esc(g.pivot) + '<span style="font-weight:500;color:#6B7075;font-size:13px;"> · ' + esc([g.campo, irr ? g.cliente : ''].filter(Boolean).join(' · ')) + '</span></div>' + chip(p) + '</div>' +
        '<div style="font-size:13.5px;color:#41464B;margin-top:4px;line-height:1.45;"><b>' + esc(MOTIVOS[p.motivo] || p.motivo) + '</b>' + (p.descripcion ? ' · ' + esc(p.descripcion.slice(0, 160)) : '') + '</div>' +
        '<div style="font-size:12px;color:#8C9196;margin-top:4px;">' + (p.origen === 'constancia' ? 'Constancia de ' + firma(p.pedidoPor) + ' · ' + fd(p.fechaProblema) : 'Pedido el ' + fh(p.creado) + ' por ' + firma(p.pedidoPor) + (p.estado !== 'cerrado' ? ' · hace ' + lapso(p.creado) : ' · resuelto en ' + lapso(p.creado, p.cierre && p.cierre.fecha))) +
          (n.length ? ' · ' + n.length + (n.length === 1 ? ' nota' : ' notas') : '') + (pendientesDe(p.id).filter(function (x) { return x.estado !== 'entregado'; }).length ? ' · <b style="color:#B5371C;">' + pendientesDe(p.id).filter(function (x) { return x.estado !== 'entregado'; }).length + ' repuesto(s) pendiente(s)</b>' : '') + (p.orden && (p.orden.foto || p.orden.nro) ? ' · <b>con orden de servicio' + (p.orden.nro ? ' N.º ' + esc(p.orden.nro) : '') + '</b>' : '') + (paradaCerrada ? ' · <b style="color:#178029;">el pivot ya volvió a andar</b>' : '') + '</div>' + (irr && p.estado !== 'cerrado' ? '<div style="margin-top:8px;font-size:13px;font-weight:700;color:#178029;">Abrir para responder, cargar la visita o registrar la solución</div>' : '') + '</div>';
    }).join('');
  }

  function htmlNuevo(esConstancia) {
    var irr = esIrrigar(), abiertos = pedidos().filter(function (p) { return p.estado !== 'cerrado'; });
    var clientesF = {}; equiposVisibles().forEach(function (e) { var c = campo(e.campoId) || {}, cl = cliente(c.clienteId); if (cl) clientesF[cl.id] = cl.nombre; });
    var hayClientes = irr && Object.keys(clientesF).length > 1;
    if (hayClientes && !vista.formCliente) vista.formCliente = vista.cliente || (vista.equipo ? (campo((equipo(vista.equipo) || {}).campoId) || {}).clienteId : '') || (esConstancia && abiertos[0] ? lugar(abiertos[0]).clienteId : '') || Object.keys(clientesF).sort(function (a, b) { return clientesF[a].localeCompare(clientesF[b]); })[0];
    var delCliente = equiposVisibles().filter(function (e) { return !hayClientes || String((campo(e.campoId) || {}).clienteId) === String(vista.formCliente); });
    var conPedido = delCliente.filter(function (e) { return abiertoDe(e.id); })[0];
    var pre = (vista.equipo && delCliente.some(function (e) { return String(e.id) === String(vista.equipo); }) ? vista.equipo : null) || (esConstancia && conPedido ? conPedido.id : null) || (delCliente[0] || {}).id;
    if (!equiposVisibles().length) return '<button data-a="volver" style="' + BG + '">Volver</button>' + aviso('No hay pivots cargados para pedir asistencia.');
    var h = '<button data-a="volver" style="' + BG + 'margin-bottom:12px;">Volver a la lista</button>' +
      '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:16px;">' +
      '<div style="font-size:17px;font-weight:800;color:#2E3236;">' + (esConstancia ? 'Registrar una asistencia ya resuelta' : 'Pedir asistencia técnica a Irrigar') + '</div>' +
      '<div style="font-size:13px;color:#6B7075;line-height:1.45;margin-top:4px;">' + (esConstancia ? 'Para dejar constancia de lo que se resolvió por teléfono, por WhatsApp o en una visita. Queda en el historial del pivot, ya cerrado.' : 'A Irrigar le llega el aviso en el momento. Después podés seguir el pedido acá: quién lo tomó, cuándo vienen, y escribir o mandar fotos.') + '</div>' +
      aviso(vista.msg, vista.msgOk) +
      (esConstancia && abiertos.length ? '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#F4F5F6;"><div style="font-size:12px;font-weight:700;color:#6B7075;margin-bottom:6px;">¿Es la solución de un pedido que está abierto? Tocalo y cerralo ahí: ya trae el cliente y el pivot.</div>' + abiertos.slice(0, 8).map(function (p) { var g = lugar(p); return '<button data-p="' + esc(p.id) + '" style="' + BG + 'display:block;width:100%;text-align:left;margin-top:6px;font-weight:600;"><b>' + esc(g.pivot) + '</b> · ' + esc([g.campo, g.cliente].filter(Boolean).join(' · ')) + '<br><span style="font-size:12px;color:#6B7075;">' + esc(MOTIVOS[p.motivo] || '') + ' · pedido el ' + fh(p.creado) + '</span></button>'; }).join('') + '</div>' : '') +
      (hayClientes ? '<label style="' + LB + '">Cliente</label><select id="asCliente" style="' + IN + '">' + Object.keys(clientesF).sort(function (a, b) { return clientesF[a].localeCompare(clientesF[b]); }).map(function (k) { return '<option value="' + esc(k) + '"' + (String(k) === String(vista.formCliente) ? ' selected' : '') + '>' + esc(clientesF[k]) + '</option>'; }).join('') + '</select>' : '') +
      '<label style="' + LB + '">Pivot</label><select id="asEquipo" style="' + IN + '">' + opcionesEquipo(pre, hayClientes ? vista.formCliente : null) + '</select>' +
      (esConstancia ? '<div id="asAvisoAbierto" style="display:' + (abiertoDe(pre) ? 'block' : 'none') + ';margin-top:6px;padding:9px 12px;border-radius:8px;background:#E8F1FB;color:#1F5FA8;font-size:13px;font-weight:600;line-height:1.4;">Este pivot tiene un pedido de asistencia abierto: al guardar, ese pedido queda cerrado con esta solución.</div>' : '') +
      '<label style="' + LB + '">' + (esConstancia ? 'Qué problema era' : 'Qué pasa') + '</label><select id="asMotivo" style="' + IN + '">' + opcionesMotivo('electrica') + '</select>';
    if (esConstancia) h +=
      '<label style="' + LB + '">Fecha</label><input id="asFecha" type="date" value="' + hoy() + '" max="' + hoy() + '" style="' + IN + '">' +
      '<label style="' + LB + '">Cómo se atendió</label><select id="asCanal" style="' + IN + '">' + Object.keys(CANALES).map(function (k) { return '<option value="' + k + '">' + CANALES[k] + '</option>'; }).join('') + '</select>' +
      '<label style="' + LB + '">El problema</label><textarea id="asProblema" rows="2" placeholder="Ejemplo: el pivot no arrancaba, tablero sin tensión de comando" style="' + IN + '"></textarea>' +
      '<label style="' + LB + '">Cómo se solucionó</label><textarea id="asSolucion" rows="2" placeholder="Ejemplo: fusible del tablero quemado, se cambió" style="' + IN + '"></textarea>' +
      '<label style="' + LB + '">Repuestos usados (si hubo)</label><input id="asRepuestos" type="text" placeholder="Ejemplo: 1 fusible 2 A" style="' + IN + '">' +
        '<label style="' + LB + '">Repuestos que faltan o quedan pendientes (uno por renglón)</label><textarea id="asPend" rows="2" placeholder="Ejemplo: rulemán 6306 de la bomba&#10;contactor de la torre 4" style="' + IN + '"></textarea>' +
        '<select id="asPendDestino" style="' + IN + 'margin-top:6px;">' + Object.keys(DESTINOS).map(function (k) { return '<option value="' + k + '">' + DESTINOS[k] + '</option>'; }).join('') + '</select>' +
        '<label style="' + LB + '">Orden de servicio: número (si tiene) y foto de la orden firmada</label><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;"><input id="asOrdenNro" type="text" placeholder="N.º de orden" style="' + IN + 'width:130px;">' + selector('asOrdenFoto', true) + '</div>' +
        '';
    else h +=
      '<label style="' + LB + '">Contá en pocas palabras qué ves</label><textarea id="asDesc" rows="3" placeholder="Ejemplo: se paró en la torre 5, la luz de seguridad está prendida" style="' + IN + '"></textarea>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-size:14px;color:#2E3236;cursor:pointer;"><input type="checkbox" id="asParado" checked style="width:20px;height:20px;flex:none;"> El pivot está parado</label>' +
      '<label style="' + LB + '">Foto o video corto (si ayuda a entender)</label>' + selector('asFoto');
    return h + '<div style="display:flex;gap:8px;margin-top:16px;"><button data-a="' + (esConstancia ? 'guardarConstancia' : 'guardarNuevo') + '" style="' + BV + 'flex:1;">' + (esConstancia ? 'Guardar la constancia' : 'Enviar el pedido a Irrigar') + '</button></div></div>';
  }

  function htmlDetalle() {
    var p = pedido(vista.id); if (!p) return '<button data-a="volver" style="' + BG + '">Volver a la lista</button>' + aviso('Ese pedido no está en este dispositivo todavía. Esperá unos segundos y volvé a abrirlo.');
    var g = lugar(p), irr = esIrrigar(), ns = notasDe(p.id), abierto = p.estado !== 'cerrado', inf = p.informe || {};
    var fila = function (a, b) { return b ? '<div style="display:flex;gap:10px;font-size:13.5px;line-height:1.5;padding:3px 0;"><div style="flex:none;width:120px;color:#8C9196;">' + a + '</div><div style="color:#2E3236;">' + b + '</div></div>' : ''; };
    var paradaCerrada = volvioAAndar(p);
    var h = '<button data-a="volver" style="' + BG + 'margin-bottom:12px;">Volver a la lista</button>' + aviso(vista.msg, vista.msgOk) +
      '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:16px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div><div style="font-size:18px;font-weight:800;color:#2E3236;">' + esc(g.pivot) + '</div><div style="font-size:13px;color:#6B7075;">' + esc([g.campo, g.cliente].filter(Boolean).join(' · ')) + '</div></div>' + chip(p) + '</div>' +
      '<div style="margin-top:10px;">' + fila('Motivo', esc(MOTIVOS[p.motivo] || p.motivo)) + fila('Qué pasa', esc(p.descripcion)) +
        fila(p.origen === 'constancia' ? 'Constancia de' : 'Lo pidió', firma(p.pedidoPor) + ' · ' + fh(p.creado)) +
        (p.origen === 'constancia' ? fila('Fecha', fd(p.fechaProblema)) + fila('Se atendió', esc(CANALES[inf.canal] || '')) : fila('Lo tomó', p.tomadoPor ? esc(p.tomadoPor.nombre) + ' (Irrigar) · ' + fh(p.tomadoEn) + ' · a los ' + lapso(p.creado, p.tomadoEn) : '<span style="color:#B5371C;font-weight:700;">Todavía nadie de Irrigar lo tomó</span>') +
          fila('Visita prevista', p.visita ? '<b>' + fh(p.visita) + '</b>' : '')) +
        (p.cierre ? fila('Cerrado', firma(p.cierre.por) + ' · ' + fh(p.cierre.fecha) + (p.origen !== 'constancia' ? ' · resuelto en ' + lapso(p.creado, p.cierre.fecha) : '')) + fila('Al cerrar', esc(p.cierre.texto)) : '') +
        fila('Causa', esc(inf.causa && inf.causa !== p.descripcion ? inf.causa : '')) + fila('Solución', esc(inf.solucion && (!p.cierre || inf.solucion !== p.cierre.texto) ? inf.solucion : '')) + fila('Repuestos', esc(inf.repuestos)) +
        (p.orden ? fila('Orden de servicio', (p.orden.nro ? 'N.º <b>' + esc(p.orden.nro) + '</b> · ' : '') + 'la subió ' + firma(p.orden.por) + ' · ' + fh(p.orden.fecha) + (p.orden.foto ? '<a data-foto="' + esc(p.orden.foto) + '" target="_blank" rel="noopener" style="display:block;margin-top:6px;font-size:12.5px;color:#178029;font-weight:700;">Cargando foto…</a>' : '')) : (p.estado === 'cerrado' ? fila('Orden de servicio', '<span style="color:#8A5A00;">Sin orden cargada</span>') : '')) +
      '</div>' + (paradaCerrada ? '<div style="margin-top:10px;padding:9px 12px;border-radius:8px;background:#E7F6EA;color:#178029;font-size:13.5px;font-weight:600;">El pivot ya volvió a andar. Si el problema está resuelto, cerrá el pedido.</div>' : '') + '</div>';

    // acciones
    if (abierto) {
      h += '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;margin-bottom:10px;">';
      if (irr) h += '<div style="font-size:12px;font-weight:700;color:#6B7075;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Irrigar</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
        (!p.tomadoPor || String(p.tomadoPor.id) !== String(yo().id) ? '<button data-a="tomar" style="' + BV + '">' + (p.tomadoPor ? 'Tomarlo yo' : 'Tomar el pedido') + '</button>' : '') +
        '<div style="flex:1;min-width:190px;"><label style="' + LB + 'margin-top:0;">Visita prevista (día y hora)</label><input id="asVisita" type="datetime-local" value="' + esc(p.visita || '') + '" style="' + IN + '"></div>' +
        '<button data-a="visita" style="' + BG + '">Guardar la visita</button></div>' +
        '<div style="border-top:1px solid #EEF0F2;margin-top:14px;padding-top:10px;"><div style="font-size:13.5px;font-weight:700;color:#2E3236;">Cerrar con el informe</div>' +
        '<label style="' + LB + '">Qué se encontró</label><input id="asCausa" type="text" placeholder="Ejemplo: fusible del tablero quemado" style="' + IN + '">' +
        '<label style="' + LB + '">Qué se hizo</label><input id="asSolucion" type="text" placeholder="Ejemplo: se cambió el fusible y se probó una vuelta" style="' + IN + '">' +
        '<label style="' + LB + '">Repuestos usados (si hubo)</label><input id="asRepuestos" type="text" style="' + IN + '">' +
        '<label style="' + LB + '">Repuestos que faltan o quedan pendientes (uno por renglón)</label><textarea id="asPend" rows="2" placeholder="Ejemplo: rulemán 6306 de la bomba&#10;contactor de la torre 4" style="' + IN + '"></textarea>' +
        '<select id="asPendDestino" style="' + IN + 'margin-top:6px;">' + Object.keys(DESTINOS).map(function (k) { return '<option value="' + k + '">' + DESTINOS[k] + '</option>'; }).join('') + '</select>' +
        '<label style="' + LB + '">Cómo se atendió</label><select id="asCanal" style="' + IN + '">' + Object.keys(CANALES).map(function (k) { return '<option value="' + k + '"' + (k === 'visita' ? ' selected' : '') + '>' + CANALES[k] + '</option>'; }).join('') + '</select>' +
        '<label style="' + LB + '">Orden de servicio: número (si tiene) y foto de la orden firmada</label><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;"><input id="asOrdenNro" type="text" placeholder="N.º de orden" style="' + IN + 'width:130px;">' + selector('asOrdenFoto', true) + '</div>' +
        '<button data-a="cerrarIrrigar" style="' + BR + 'margin-top:12px;">Cerrar el pedido</button></div>';
      else h += '<div style="font-size:13.5px;font-weight:700;color:#2E3236;">¿Ya está resuelto?</div>' +
        '<label style="' + LB + '">Contá en una línea cómo quedó (opcional)</label><input id="asCierre" type="text" placeholder="Ejemplo: vino el técnico y ya anda" style="' + IN + '">' +
        '<label style="' + LB + '">Orden de servicio: número (si tiene) y foto de la orden firmada</label><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;"><input id="asOrdenNro" type="text" placeholder="N.º de orden" style="' + IN + 'width:130px;">' + selector('asOrdenFoto', true) + '</div>' +
        '<button data-a="cerrarCampo" style="' + BR + 'margin-top:10px;">Cerrar el pedido</button>' +
        '<div style="font-size:12px;color:#8C9196;margin-top:6px;line-height:1.4;">Al cerrar, la conversación de este pedido termina. Si aparece otro problema, se pide una asistencia nueva. Si nadie lo cierra, se cierra solo cuando se cargue el próximo riego de este pivot.</div>';
      h += '</div>';
    } else {
      h += '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;margin-bottom:10px;"><div style="font-size:13.5px;font-weight:700;color:#2E3236;">' + (p.orden && p.orden.foto ? 'Cambiar la orden de servicio' : 'Subir la orden de servicio') + '</div>' +
        '<label style="' + LB + '">Orden de servicio: número (si tiene) y foto de la orden firmada</label><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;"><input id="asOrdenNro" type="text" placeholder="N.º de orden" style="' + IN + 'width:130px;">' + selector('asOrdenFoto', true) + '</div>' +
        '<button data-a="orden" style="' + BG + 'margin-top:10px;">Guardar la orden</button></div>';
      if (irr) h += '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;margin-bottom:10px;"><div style="font-size:13.5px;font-weight:700;color:#2E3236;">Informe técnico (se puede completar después de cerrar)</div>' +
        '<label style="' + LB + '">Qué se encontró</label><input id="asCausa" type="text" value="' + esc(inf.causa || '') + '" style="' + IN + '">' +
        '<label style="' + LB + '">Qué se hizo</label><input id="asSolucion" type="text" value="' + esc(inf.solucion || '') + '" style="' + IN + '">' +
        '<label style="' + LB + '">Repuestos usados</label><input id="asRepuestos" type="text" value="' + esc(inf.repuestos || '') + '" style="' + IN + '">' +
        '<button data-a="informe" style="' + BG + 'margin-top:10px;">Guardar el informe</button></div>';
    }

    // repuestos y pendientes: siguen abiertos aunque el pedido esté cerrado
    var pens = pendientesDe(p.id);
    h += '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;margin-bottom:10px;">' +
      '<div style="font-size:12px;font-weight:700;color:#6B7075;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Repuestos y pendientes</div>' +
      (pens.length ? pens.map(htmlPendiente).join('') : '<div style="font-size:13.5px;color:#8C9196;">Nada pendiente.</div>') +
      '<div style="border-top:1px solid #EEF0F2;margin-top:10px;padding-top:10px;"><textarea id="asPendNuevo" rows="2" placeholder="Qué falta (uno por renglón). Ejemplo: fusible de 20 A del tablero" style="' + IN + '"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;"><select id="asPendNuevoDestino" style="' + IN + 'flex:1;min-width:190px;width:auto;">' + Object.keys(DESTINOS).map(function (k) { return '<option value="' + k + '">' + DESTINOS[k] + '</option>'; }).join('') + '</select><button data-a="pendAgregar" style="' + BG + '">Agregar a pendientes</button></div></div></div>';

    // conversación
    h += '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;">' +
      '<div style="font-size:12px;font-weight:700;color:#6B7075;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Conversación de este pedido</div>';
    h += ns.length ? ns.map(function (n) {
      if (n.sistema) return '<div style="text-align:center;font-size:12px;color:#8C9196;margin:8px 0;">' + esc(n.autor && n.autor.nombre) + ' · ' + esc(n.texto) + ' · ' + fh(n.creado) + '</div>';
      var mia = String(n.autor && n.autor.id) === String(yo().id), deIrr = n.autor && (n.autor.rol === 'propietario' || n.autor.rol === 'admin');
      return '<div style="display:flex;justify-content:' + (mia ? 'flex-end' : 'flex-start') + ';margin:6px 0;"><div style="max-width:86%;background:' + (deIrr ? '#E8F1FB' : '#F1F3F4') + ';border-radius:12px;padding:8px 11px;">' +
        '<div style="font-size:11.5px;font-weight:700;color:' + (deIrr ? '#1F5FA8' : '#41464B') + ';">' + firma(n.autor) + ' · ' + fh(n.creado) + '</div>' +
        (n.texto ? '<div style="font-size:14px;color:#2E3236;line-height:1.45;white-space:pre-wrap;margin-top:2px;">' + esc(n.texto) + '</div>' : '') +
        (n.foto ? '<a data-foto="' + esc(n.foto) + '" target="_blank" rel="noopener" style="display:block;margin-top:6px;font-size:12.5px;color:#178029;font-weight:700;">Cargando foto…</a>' : '') + '</div></div>';
    }).join('') : '<div style="font-size:13.5px;color:#8C9196;">Todavía no hay notas.</div>';
    h += abierto ? '<div style="border-top:1px solid #EEF0F2;margin-top:12px;padding-top:10px;"><textarea id="asNota" rows="2" placeholder="Escribí acá… Abajo podés elegir una foto o un video corto." style="' + IN + '"></textarea>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin-top:8px;">' + selector('asNotaFoto') + '<button data-a="nota" style="' + BV + '">Enviar</button></div></div>'
      : '<div style="border-top:1px solid #EEF0F2;margin-top:12px;padding-top:10px;font-size:13px;color:#6B7075;line-height:1.45;">Pedido cerrado: la conversación terminó. Si hay otro problema en este pivot, se pide una asistencia nueva.</div>';
    return h + '</div>';
  }

  function htmlPendiente(x) {
    var hecho = x.estado === 'entregado';
    return '<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;padding:8px 0;border-top:1px solid #F0F2F4;">' +
      '<div style="min-width:0;"><div style="font-size:14px;font-weight:700;color:' + (hecho ? '#8C9196;text-decoration:line-through' : '#2E3236') + ';">' + esc(x.texto) + '</div>' +
      '<div style="font-size:12px;color:#8C9196;line-height:1.4;">' + esc(DESTINOS[x.destino] || '') + ' · lo anotó ' + firma(x.autor) + ' el ' + fh(x.creado) + (hecho && x.resuelto ? ' · <b style="color:#178029;">entregado</b> ' + fh(x.resuelto.fecha) + ' (' + esc(x.resuelto.por && x.resuelto.por.nombre) + ')' : '') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex:none;">' + (hecho ? '<button data-a="pendVolver" data-id="' + esc(x.id) + '" style="' + BG + 'padding:6px 10px;font-size:12.5px;">Sigue pendiente</button>' : '<button data-a="pendHecho" data-id="' + esc(x.id) + '" style="' + BV + 'padding:6px 10px;font-size:12.5px;">Entregado</button>') +
      (esIrrigar() ? '<button data-a="pendQuitar" data-id="' + esc(x.id) + '" style="' + BR + 'padding:6px 10px;font-size:12.5px;">Quitar</button>' : '') + '</div></div>';
  }
  // La lista de pendientes de todos los pedidos, por cliente y por pivot: para armar el envío o lo que lleva el técnico
  function gruposPendientes() {
    var g = {}, orden = [];
    pendientes(true).forEach(function (x) {
      var lg = lugar(x); if (vista.equipo && String(x.equipoId) !== String(vista.equipo)) return; if (vista.cliente && String(lg.clienteId) !== String(vista.cliente)) return;
      var k = String(lg.clienteId || '') + '|' + lg.cliente; if (!g[k]) { g[k] = { clienteId: lg.clienteId, cliente: lg.cliente || 'Sin cliente', items: [] }; orden.push(k); }
      g[k].items.push({ x: x, lugar: lg });
    });
    return orden.map(function (k) { return g[k]; }).sort(function (a, b) { return a.cliente.localeCompare(b.cliente); });
  }
  function textoPendientes(grupo) {
    var porPivot = {}, ord = [];
    grupo.items.forEach(function (i) { var k = [i.lugar.campo, i.lugar.pivot].filter(Boolean).join(' · '); if (!porPivot[k]) { porPivot[k] = []; ord.push(k); } porPivot[k].push(i.x); });
    return 'Repuestos y pendientes · ' + grupo.cliente + '\n' + ord.map(function (k) { return k + ':\n' + porPivot[k].map(function (x) { return '  - ' + x.texto + ' (' + (DESTINOS[x.destino] || '') + ')'; }).join('\n'); }).join('\n');
  }
  function htmlPendientes() {
    var gs = gruposPendientes();
    if (!gs.length) return '<div style="background:#fff;border:1px dashed #C9CED3;border-radius:10px;padding:22px;text-align:center;color:#6B7075;font-size:14px;line-height:1.5;">No hay repuestos ni pendientes sin entregar.</div>';
    return gs.map(function (g, n) {
      return '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;"><div style="font-size:16px;font-weight:800;color:#2E3236;">' + esc(g.cliente) + ' <span style="font-weight:500;color:#6B7075;font-size:13px;">· ' + g.items.length + (g.items.length === 1 ? ' pendiente' : ' pendientes') + '</span></div>' +
        '<div class="no-imprimir" style="display:flex;gap:6px;"><button data-a="copiar" data-n="' + n + '" style="' + BG + 'padding:7px 11px;font-size:12.5px;">Copiar la lista</button><button data-a="imprimir" style="' + BG + 'padding:7px 11px;font-size:12.5px;">Imprimir</button></div></div>' +
        g.items.map(function (i) { return '<div style="font-size:12px;color:#6B7075;margin-top:8px;font-weight:700;">' + esc([i.lugar.campo, i.lugar.pivot].filter(Boolean).join(' · ')) + ' <a data-p="' + esc(i.x.pedidoId) + '" href="#" style="color:#178029;font-weight:700;">ver el pedido</a></div>' + htmlPendiente(i.x); }).join('') + '</div>';
    }).join('');
  }
  function cargarFotos() {
    var sb = window.safiaSupabase;
    Array.prototype.forEach.call(cont.querySelectorAll('a[data-foto]'), function (a) {
      if (!sb) { a.textContent = 'Foto (sin conexión)'; return; }
      sb.storage.from('safia').createSignedUrl(a.getAttribute('data-foto'), 3600).then(function (r) {
        if (r.error || !r.data) { a.textContent = 'No se pudo abrir la foto'; return; }
        if (ES_VIDEO.test(a.getAttribute('data-foto'))) { var v = document.createElement('video'); v.controls = true; v.preload = 'metadata'; v.playsInline = true; v.src = r.data.signedUrl; v.style.cssText = 'max-width:100%;max-height:320px;border-radius:8px;display:block;margin-top:6px;background:#000;'; a.parentNode.replaceChild(v, a); return; }
        a.href = r.data.signedUrl; a.innerHTML = '<img src="' + esc(r.data.signedUrl) + '" alt="Foto" style="max-width:100%;max-height:260px;border-radius:8px;display:block;">';
      });
    });
  }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function pintar() {
    if (!cont) return;
    cerrarPorRiego();
    cont.innerHTML = vista.modo === 'detalle' ? htmlDetalle() : vista.modo === 'nuevo' ? htmlNuevo(false) : vista.modo === 'constancia' ? htmlNuevo(true) : htmlLista();
    if (vista.modo === 'detalle') cargarFotos();
    vista.msg = '';
  }
  function alClic(ev) {
    var t = ev.target, b = t.closest ? t.closest('[data-a]') : null, f = t.closest ? t.closest('[data-f]') : null, card = t.closest ? t.closest('[data-p]') : null;
    if (f) { vista.filtro = f.getAttribute('data-f'); return pintar(); }
    if (!b) { if (card) { ev.preventDefault(); ir('detalle', card.getAttribute('data-p')); } return; }
    var a = b.getAttribute('data-a'), id = vista.id;
    if (a === 'volver') return ir('lista');
    if (a === 'pendAgregar') { if (!val('asPendNuevo')) { vista.msg = 'Escribí qué falta.'; return pintar(); } var np = agregarPendientes(id, val('asPendNuevo'), val('asPendNuevoDestino')); return ir('detalle', id, np.length + (np.length === 1 ? ' pendiente agregado.' : ' pendientes agregados.'), true); }
    if (a === 'pendHecho' || a === 'pendVolver' || a === 'pendQuitar') {
      var pid = b.getAttribute('data-id');
      if (a === 'pendQuitar') { if (b.getAttribute('data-seguro') !== '1') { b.setAttribute('data-seguro', '1'); b.textContent = '¿Quitar? Tocá de nuevo'; return; } quitarPendiente(pid); } else marcarPendiente(pid, a === 'pendHecho');
      return pintar();
    }
    if (a === 'imprimir') return window.print();
    if (a === 'copiar') {
      var txt = textoPendientes(gruposPendientes()[+b.getAttribute('data-n')]);
      var listo = function () { b.textContent = 'Copiada'; setTimeout(function () { b.textContent = 'Copiar la lista'; }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(listo, function () { window.prompt ? (vista.msg = txt, pintar()) : 0; });
      else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); listo(); } catch (e) {} ta.remove(); }
      return;
    }
    if (a === 'nuevo') return ir('nuevo');
    if (a === 'constancia') return ir('constancia');
    if (a === 'guardarNuevo') {
      var eqId = val('asEquipo'), ya = abiertoDe(eqId);
      if (ya) return ir('detalle', ya.id, 'Ese pivot ya tiene un pedido abierto: seguí la conversación acá. Cuando se cierre, se puede pedir otro.');
      var desc = val('asDesc'); if (!desc) { vista.msg = 'Contá en pocas palabras qué pasa.'; return pintar(); }
      var foto = elegido('asFoto'), parado = document.getElementById('asParado').checked;
      var p = crear({ equipoId: eqId, motivo: val('asMotivo'), descripcion: desc, parado: parado });
      if (parado) { var evp = cargarParada(p); if (evp) cambiar(p.id, function (x) { x.paradaId = evp.id; }); }
      setTimeout(function () { invocar('pedir', { equipoId: eqId, motivo: p.motivo, fecha: p.fechaProblema, nota: desc, pedidoId: p.id, parado: parado }).catch(function () {}); }, 2500);
      if (foto) { b.disabled = true; b.textContent = 'Subiendo…'; return nota(p.id, '', foto).then(function () { ir('detalle', p.id, 'Pedido enviado a Irrigar con el archivo.', true); }, function (e) { ir('detalle', p.id, 'El pedido se envió, pero el archivo no se pudo subir: ' + e.message); }); }
      return ir('detalle', p.id, 'Pedido enviado a Irrigar. Cuando un técnico lo tome te va a llegar el aviso.', true);
    }
    if (a === 'guardarConstancia') {
      if (!val('asProblema') || !val('asSolucion')) { vista.msg = 'Completá el problema y cómo se solucionó.'; return pintar(); }
      var nroK = val('asOrdenNro'), fotoK = elegido('asOrdenFoto'), pendK = val('asPend'), destK = val('asPendDestino');
      var yaAb = abiertoDe(val('asEquipo'));
      if (yaAb) {
        if (!yaAb.tomadoPor) cambiar(yaAb.id, function (x) { x.tomadoPor = yo(); x.tomadoEn = ahora(); });
        cerrar(yaAb.id, val('asSolucion'), { canal: val('asCanal'), causa: val('asProblema'), solucion: val('asSolucion'), repuestos: val('asRepuestos'), por: yo(), fecha: ahora() });
        agregarPendientes(yaAb.id, pendK, destK); vista.filtro = 'cerrados';
        return conOrden(yaAb.id, nroK, fotoK, b, 'Este pivot tenía un pedido abierto: quedó cerrado con esta solución.');
      }
      var c = constancia({ equipoId: val('asEquipo'), motivo: val('asMotivo'), fecha: val('asFecha'), canal: val('asCanal'), problema: val('asProblema'), solucion: val('asSolucion'), repuestos: val('asRepuestos') });
      vista.filtro = 'cerrados'; agregarPendientes(c.id, pendK, destK);
      return conOrden(c.id, nroK, fotoK, b, 'Constancia guardada en el historial del pivot.');
    }
    if (a === 'tomar') { tomar(id); return ir('detalle', id, 'Tomaste el pedido. Al campo le llega el aviso.', true); }
    if (a === 'visita') { var v = val('asVisita'); if (!v) { vista.msg = 'Elegí el día y la hora de la visita.'; return pintar(); } fijarVisita(id, v); return ir('detalle', id, 'Visita guardada. Al campo le llega el aviso.', true); }
    if (a === 'cerrarIrrigar') {
      if (!val('asSolucion')) { vista.msg = 'Para cerrar, escribí qué se hizo.'; return pintar(); }
      var nroI = val('asOrdenNro'), fotoI = elegido('asOrdenFoto'); agregarPendientes(id, val('asPend'), val('asPendDestino'));
      cerrar(id, val('asSolucion'), { canal: val('asCanal'), causa: val('asCausa'), solucion: val('asSolucion'), repuestos: val('asRepuestos'), por: yo(), fecha: ahora() });
      return conOrden(id, nroI, fotoI, b);
    }
    if (a === 'cerrarCampo') { var nroC = val('asOrdenNro'), fotoC = elegido('asOrdenFoto'); cerrar(id, val('asCierre') || 'Resuelto.'); return conOrden(id, nroC, fotoC, b); }
    if (a === 'orden') {
      var nroO = val('asOrdenNro'), fotoO = elegido('asOrdenFoto');
      if (!nroO && !fotoO) { vista.msg = 'Elegí la foto de la orden o escribí su número.'; return pintar(); }
      b.disabled = true; b.textContent = fotoO ? 'Subiendo la orden…' : 'Guardando…';
      return guardarOrden(id, nroO, fotoO).then(function () { ir('detalle', id, 'Orden de servicio guardada.', true); }, function (e) { ir('detalle', id, 'No se pudo subir la orden: ' + e.message); });
    }
    if (a === 'informe') { guardarInforme(id, { causa: val('asCausa'), solucion: val('asSolucion'), repuestos: val('asRepuestos') }); return ir('detalle', id, 'Informe guardado.', true); }
    if (a === 'nota') {
      var arch = elegido('asNotaFoto'); b.disabled = true; b.textContent = arch ? 'Subiendo…' : 'Enviando…';
      return nota(id, val('asNota'), arch).then(function () { ir('detalle', id); }, function (e) { ir('detalle', id, e.message); });
    }
  }
  // después de cerrar: sube la orden si la eligieron. Si la foto falla, el pedido igual queda cerrado y la orden se sube después.
  function conOrden(id, nro, foto, boton, hecho) {
    hecho = hecho || 'Pedido cerrado. Queda en el historial del pivot.';
    if (!nro && !foto) return ir('detalle', id, hecho, true);
    if (boton) { boton.disabled = true; boton.textContent = foto ? 'Subiendo la orden…' : 'Guardando…'; }
    return guardarOrden(id, nro, foto).then(function () { ir('detalle', id, hecho + ' Con la orden de servicio.', true); }, function (e) { ir('detalle', id, hecho + ' Pero la foto de la orden no se pudo subir (' + e.message + '): subila desde acá cuando tengas señal.'); });
  }
  function alCambio(ev) {
    if (ev.target.id === 'asFEquipo') { vista.equipo = ev.target.value; pintar(); }
    if (ev.target.id === 'asCliente') { vista.formCliente = ev.target.value; vista.equipo = ''; pintar(); }
    if (ev.target.id === 'asEquipo') { var avA = document.getElementById('asAvisoAbierto'); if (avA) avA.style.display = abiertoDe(ev.target.value) ? 'block' : 'none'; }
    if (ev.target.id === 'asFCliente') { vista.cliente = ev.target.value; pintar(); }
  }
  function montar(c) {
    cont = c; cont.addEventListener('click', alClic); cont.addEventListener('change', alCambio);
    var q = new URLSearchParams(location.search);
    if (q.get('equipo')) vista.equipo = q.get('equipo');
    if (q.get('p')) { vista.modo = 'detalle'; vista.id = q.get('p'); var pp = pedido(vista.id); if (pp && pp.estado === 'cerrado') vista.filtro = 'cerrados'; }
    else if (q.get('nuevo')) vista.modo = 'nuevo';
    pintar();
    // lo que escribió la otra parte llega con la sincronización: se vuelve a pintar si cambió algo y nadie está escribiendo
    var huella = localStorage.getItem(CLAVE) || '';
    setInterval(function () {
      var h2 = localStorage.getItem(CLAVE) || ''; if (h2 === huella) return; huella = h2;
      var act = document.activeElement, escribiendo = act && cont.contains(act) && /INPUT|TEXTAREA|SELECT/.test(act.tagName) && (act.type === 'file' ? act.files.length : String(act.value || '').length);
      if (!escribiendo) escribiendo = !!(elegido('asNotaFoto') || elegido('asOrdenFoto') || elegido('asFoto') || (document.getElementById('asNota') || {}).value);
      if (!escribiendo) pintar();
    }, 4000);
    if (window.SafiaSync && SafiaSync.refrescar && vista.modo === 'detalle') setInterval(function () { if (!document.hidden && vista.modo === 'detalle') { try { SafiaSync.refrescar(); } catch (e) {} } }, 30000);
  }

  window.SafiaAsistencias = { montar: montar, crear: crear, pedidos: pedidos, pedido: pedido, notasDe: notasDe, abiertoDe: abiertoDe, tomar: tomar, fijarVisita: fijarVisita, nota: nota, cerrar: cerrar, cerrarPorRiego: cerrarPorRiego, guardarOrden: guardarOrden, selector: selector, elegido: elegido, pendientes: pendientes, pendientesDe: pendientesDe, agregarPendientes: agregarPendientes, marcarPendiente: marcarPendiente, constancia: constancia, guardarInforme: guardarInforme,
    tarjetaOperador: tarjetaOperador, resumenEquipo: resumenEquipo, estadoTxt: estadoTxt, MOTIVOS: MOTIVOS };
  // al abrir cualquier pantalla que cargue este módulo (Operador, Asistencia, Asistente), con los datos ya bajados de la nube
  var alArrancar = function () { try { cerrarPorRiego(); } catch (e) {} };
  if (window.SafiaSync && SafiaSync.alListo) SafiaSync.alListo(function () { setTimeout(alArrancar, 1500); }); else setTimeout(alArrancar, 1500);
})();
