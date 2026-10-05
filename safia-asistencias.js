/* SAFIA · Asistencia técnica: pedidos con seguimiento (window.SafiaAsistencias)
   Cada pedido de asistencia es un asunto: lo abre el campo (operador, encargado o dueño), lo toma un técnico de Irrigar,
   se conversa ADENTRO del pedido (notas cortas y fotos) y se cierra. Cerrado, la conversación termina: otro problema es otro
   pedido. Irrigar también puede dejar constancia de una asistencia resuelta por teléfono. Todo queda en el historial del pivot.
   Datos: colección `asistencias` (tabla safia_asistencias). Dos clases de registro, cada uno con su id (así dos personas
   escribiendo a la vez no se pisan): { tipo:'pedido', … } y { tipo:'nota', pedidoId, … }. Fotos: depósito `safia`,
   carpeta campo_<id>/asistencia/<pedido>/. Avisos al celular: edge safia-asistencia (acciones pedir y avisar).
   Técnicos (5-oct-2026): la oficina (propietario/admin) asigna cada pedido a un técnico con su orden en la ruta; el técnico
   (rol 'tecnico') entra solo acá, ve "Mis visitas" en orden con "Cómo llegar", y si está sin señal lo que escribe queda en el
   celular y sube solo, igual que los avisos, cuando vuelve la señal. La oficina le manda la ruta también por WhatsApp. */
(function () {
  'use strict';
  var CLAVE = 'asistencias';
  var MOTIVOS = { electrica: 'Falla eléctrica', mecanica: 'Falla mecánica (rueda, motorreductor, estructura)', bomba: 'Falla de la bomba', energia: 'Corte de energía (ANDE)', agua: 'Falta de agua en la fuente', mantenimiento: 'Mantenimiento programado', consulta: 'Consulta o ajuste (el pivot anda)', otro: 'Otro motivo' };
  var CANALES = { telefono: 'Por teléfono', whatsapp: 'Por WhatsApp', visita: 'Visita al campo', remoto: 'Remoto (telemetría)' };
  var ROLES = { sistema: 'automático', cliente: 'dueño', encargado: 'encargado', operador: 'operador', propietario: 'Irrigar', admin: 'Irrigar', tecnico: 'técnico de Irrigar' };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lista(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function leer() { return lista(CLAVE); }
  function guardar(l) { localStorage.setItem(CLAVE, JSON.stringify(l)); }
  function nuevoId(p) { return p + Date.now() + Math.floor(Math.random() * 900 + 100); }
  function ahora() { return new Date().toISOString(); }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function usuario() { var u = (window.SafiaSync && SafiaSync.usuario && SafiaSync.usuario()) || null; if (!u) { try { u = JSON.parse(localStorage.getItem('safia_usuario') || 'null'); } catch (e) {} } return u || { id: 'local', nombre: 'Usuario', rol: 'cliente' }; }
  function esOficina() { var r = usuario().rol; return r === 'propietario' || r === 'admin'; }
  function esTecnico() { return usuario().rol === 'tecnico'; }
  function esIrrigar() { return esOficina() || esTecnico(); }
  function rolIrrigar(r) { return r === 'propietario' || r === 'admin' || r === 'tecnico'; }
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
  var COLA = 'safia_avisos_cola';
  function cola() { try { var l = JSON.parse(localStorage.getItem(COLA) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function encolar(a) { var l = cola(); l.push(a); try { localStorage.setItem(COLA, JSON.stringify(l.slice(-40))); } catch (e) {} }
  function sinSenal(e) { return navigator.onLine === false || /Failed to fetch|NetworkError|sin conexión|Load failed|network/i.test(String(e && e.message || e)); }
  function avisar(pedidoId, evento, texto, vez) {
    if (navigator.onLine === false) return encolar({ pedidoId: pedidoId, evento: evento, texto: texto || '' });   // sin señal: sale cuando vuelve
    setTimeout(function () {
      invocar('avisar', { pedidoId: pedidoId, evento: evento, texto: texto || '' }).catch(function (e) {
        if (sinSenal(e) || ((vez || 1) >= 3 && /todavía no está en la nube/.test(e.message))) return encolar({ pedidoId: pedidoId, evento: evento, texto: texto || '' });
        if ((vez || 1) < 3 && /todavía no está en la nube/.test(e.message)) avisar(pedidoId, evento, texto, (vez || 1) + 1);
      });
    }, (vez || 1) === 1 ? 2500 : 7000);
  }
  // al volver la señal: primero sube lo cargado (sync) y después salen los avisos que quedaron en cola
  function vaciarCola() {
    var l = cola(); if (!l.length || navigator.onLine === false) return;
    localStorage.setItem(COLA, '[]');
    l.forEach(function (a, i) { setTimeout(function () { avisar(a.pedidoId, a.evento, a.texto, 2); }, 9000 + i * 1500); });
  }
  window.addEventListener('online', vaciarCola);

  // Pedido nuevo. o = { equipoId, motivo, descripcion, fechaProblema, parado, paradaId }
  function crear(o) {
    var e = equipo(o.equipoId) || {};
    var p = { id: nuevoId('as'), tipo: 'pedido', origen: 'pedido', equipoId: e.id != null ? e.id : o.equipoId, campoId: e.campoId || null, paradaId: o.paradaId || null, creado: ahora(), fechaProblema: o.fechaProblema || hoy(),
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
  function tomar(id) { var p = cambiar(id, function (x) { x.tomadoPor = yo(); x.tomadoEn = ahora(); if (esIrrigar()) { x.asignado = yo(); x.asignadoEn = ahora(); } }); if (p) { notaSistema(p, 'Tomó el pedido.'); avisar(id, 'tomado'); } return p; }
  // Técnicos que la oficina puede asignar (técnicos primero; también la gente de la oficina que sale a campo). Se guardan en el
  // celular para poder asignar aunque se corte la conexión.
  var TEC = 'safia_tecnicos';
  function tecnicos() { try { var l = JSON.parse(localStorage.getItem(TEC) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function tecnico(id) { return tecnicos().filter(function (t) { return String(t.id) === String(id); })[0] || null; }
  function traerTecnicos() {
    var sb = window.safiaSupabase; if (!sb || !esOficina()) return Promise.resolve(tecnicos());
    return Promise.resolve(sb.from('safia_usuarios').select('id,nombre,email,telefono,rol,estado').in('rol', ['tecnico', 'admin', 'propietario']).eq('estado', 'activo')).then(function (r) {
      if (r && r.data) { var l = r.data.map(function (u) { return { id: u.id, nombre: u.nombre || String(u.email || '').split('@')[0], telefono: u.telefono || '', rol: u.rol }; })
        .sort(function (a, b) { return (a.rol === 'tecnico' ? 0 : 1) - (b.rol === 'tecnico' ? 0 : 1) || String(a.nombre).localeCompare(String(b.nombre)); });
        try { localStorage.setItem(TEC, JSON.stringify(l)); } catch (e) {} }
      return tecnicos();
    }, function () { return tecnicos(); });
  }
  // Pedidos abiertos de un técnico, en el orden que le puso la oficina (sin orden: por visita y después por antigüedad)
  function rutaDe(tecId) {
    return pedidos().filter(function (p) { return p.estado !== 'cerrado' && p.asignado && String(p.asignado.id) === String(tecId); }).sort(function (a, b) {
      var oa = a.ordenRuta > 0 ? a.ordenRuta : 999, ob = b.ordenRuta > 0 ? b.ordenRuta : 999; if (oa !== ob) return oa - ob;
      return String(a.visita || '9999').localeCompare(String(b.visita || '9999')) || String(a.creado).localeCompare(String(b.creado)); });
  }
  function asignar(id, tec, orden) {
    var t = { id: tec.id, nombre: tec.nombre, rol: tec.rol || 'tecnico' };
    var p = cambiar(id, function (x) { x.asignado = t; x.ordenRuta = orden > 0 ? Math.round(orden) : null; x.asignadoEn = ahora(); x.asignadoPor = yo(); x.tomadoPor = t; if (!x.tomadoEn) x.tomadoEn = ahora(); });
    if (p) { notaSistema(p, 'Asignado a ' + t.nombre + (p.ordenRuta ? ' (' + p.ordenRuta + '.º en su ruta)' : '') + '.'); avisar(id, 'asignado'); }
    return p;
  }
  // Cómo llegar: el centro del pivot dibujado o, si no hay, la ubicación de la estancia (Google Maps)
  function coordsDe(p) {
    var e = equipo(p.equipoId) || {}, c = campo(p.campoId || e.campoId) || {}, ce = e.poligono && e.poligono.centro;
    var lat = ce ? +ce.lat : parseFloat(String(c.latitud || '').replace(',', '.')), lon = ce ? +ce.lon : parseFloat(String(c.longitud || '').replace(',', '.'));
    return isFinite(lat) && isFinite(lon) && Math.abs(lat) > 0.01 ? { lat: lat, lon: lon } : null;
  }
  function mapaUrl(p) { var k = coordsDe(p); return k ? 'https://www.google.com/maps/dir/?api=1&destination=' + k.lat.toFixed(6) + ',' + k.lon.toFixed(6) : ''; }
  // WhatsApp al técnico: el número como lo cargaron (0981…, +595…) pasado a 595…
  function telWa(t) { var d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.indexOf('00') === 0) d = d.slice(2); if (d.charAt(0) === '0') d = '595' + d.slice(1); else if (d.length === 9 && d.charAt(0) === '9') d = '595' + d; return d.length >= 10 ? d : ''; }
  function textoPedidoRuta(p, n) {
    var g = lugar(p), m = mapaUrl(p);
    return (n ? n + '. ' : '') + g.pivot + [g.campo, g.cliente].filter(Boolean).map(function (x) { return ' · ' + x; }).join('') + '\n   ' + (MOTIVOS[p.motivo] || p.motivo) + (p.descripcion ? ': ' + p.descripcion.slice(0, 100) : '') +
      (p.visita ? '\n   Visita: ' + fh(p.visita) : '') + (m ? '\n   Cómo llegar: ' + m : '') + '\n   Pedido: ' + location.origin + '/asistencias.html?p=' + encodeURIComponent(p.id);
  }
  function textoRuta(tecId) { var t = tecnico(tecId) || {}, l = rutaDe(tecId); return 'SAFIA · Visitas asignadas a ' + (t.nombre || 'vos') + ' (' + l.length + ')\n\n' + l.map(function (p, i) { return textoPedidoRuta(p, p.ordenRuta > 0 ? p.ordenRuta : i + 1); }).join('\n\n'); }
  function waUrl(tel, texto) { var n = telWa(tel); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(texto) : ''; }
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
  // Corregir el motivo o la descripción. Irrigar siempre; el campo, mientras el pedido está abierto.
  function editar(id, motivo, descripcion, fecha) {
    return cambiar(id, function (x) { if (MOTIVOS[motivo]) x.motivo = motivo; x.descripcion = String(descripcion || '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) x.fechaProblema = fecha; x.editado = { por: yo(), fecha: ahora() }; });
  }
  // Reabrir un pedido que se cerró por error (o que se cerró solo y el problema sigue). Vuelve la conversación. Un pedido abierto por pivot.
  function reabrir(id) {
    var p = pedido(id); if (!p || p.estado !== 'cerrado') return null;
    var otro = abiertoDe(p.equipoId); if (otro) return { error: 'Ese pivot ya tiene otro pedido abierto: cerrá ese primero o seguí la conversación ahí.' };
    p = cambiar(id, function (x) { x.estado = 'abierto'; x.cierreAnterior = x.cierre; x.cierre = null; x.reabierto = ahora(); x.origen = 'pedido'; });
    notaSistema(p, 'Reabrió el pedido.'); avisar(id, 'nota', 'Reabrió el pedido');
    return p;
  }
  // Borrar un pedido con todo lo suyo (notas, pendientes y archivos). Solo Irrigar: la base no deja borrar a nadie más.
  function borrar(id) {
    var l = leer(), rutas = [];
    l.forEach(function (x) { if (String(x.id) === String(id) && x.orden && x.orden.foto) rutas.push(x.orden.foto); if (x.tipo === 'nota' && String(x.pedidoId) === String(id) && x.foto) rutas.push(x.foto); });
    guardar(l.filter(function (x) { return !(String(x.id) === String(id) && x.tipo === 'pedido') && String(x.pedidoId) !== String(id); }));
    var sb = window.safiaSupabase; if (sb && rutas.length) { try { sb.storage.from('safia').remove(rutas).then(function () {}, function () {}); } catch (e) {} }
    return true;
  }
  function paradaDe(p) { return p && p.paradaId ? lista('eventos').filter(function (v) { return v.tipo === 'parada' && String(v.id) === String(p.paradaId); })[0] || null : null; }
  function borrarParada(p) { var ev = paradaDe(p); if (!ev) return false; localStorage.setItem('eventos', JSON.stringify(lista('eventos').filter(function (v) { return String(v.id) !== String(ev.id); }))); return true; }
  function diaLocal(iso) { var d = new Date(iso); return isNaN(d) ? String(iso).slice(0, 10) : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function cerrarPorRiego() {
    var l = leer(), riegos = null, n = 0;
    l.forEach(function (p) {
      if (p.tipo !== 'pedido' || p.estado === 'cerrado' || !p.parado) return;
      if (!riegos) riegos = lista('eventos').filter(function (v) { return v.tipo === 'riego' && v.fecha && parseFloat(v.cantidad) > 0; });
      var desde = p.reabierto || p.creado, f0 = p.reabierto ? diaLocal(p.reabierto) : String(p.fechaProblema || p.creado).slice(0, 10), r = null;
      riegos.forEach(function (v) {
        if (String(v.equipoId) !== String(p.equipoId)) return;
        var fv = String(v.fecha).slice(0, 10), vale = fv > f0 || (fv === f0 && v.fechaCreacion && String(v.fechaCreacion) > String(desde));
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
    return agregar({ id: nuevoId('as'), tipo: 'pedido', origen: 'constancia', equipoId: e.id != null ? e.id : o.equipoId, campoId: e.campoId || null, paradaId: null, creado: t, fechaProblema: o.fecha || hoy(), motivo: o.motivo || 'otro', descripcion: String(o.problema || '').trim(), parado: false,
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
     explorador de archivos. Se pueden sumar varios (foto y video) antes de enviar. */
  var ICO = { foto: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>', video: '<rect x="3" y="6.5" width="12" height="11" rx="2"/><path d="m15 10.5 6-3v9l-6-3z"/>', archivo: '<path d="M20 11.5 12.5 19a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3.1 3.1 0 0 1 4.4 4.4l-7.7 7.7a1.6 1.6 0 0 1-2.3-2.3l7-7"/>' };
  function selector(id, soloFoto) {
    SEL[id] = [];
    var bt = 'position:relative;width:auto;margin:0;text-transform:none;letter-spacing:0;display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border:1.5px solid #E1E4E7;border-radius:10px;background:#fff;color:#2E3236;font-size:13.5px;font-weight:700;cursor:pointer;overflow:hidden;';
    var boton = function (suf, texto, accept, camara) {
      return '<label style="' + bt + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#178029" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICO[suf] + '</svg>' + texto +
        '<input type="file" data-sel="' + id + '" id="' + id + '_' + suf + '" accept="' + accept + '"' + (camara ? ' capture="environment"' : '') + ' style="position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;"></label>';
    };
    return '<div style="flex:1;min-width:200px;"><div style="display:flex;gap:8px;flex-wrap:wrap;">' + boton('foto', 'Sacar foto', 'image/*', true) + (soloFoto ? '' : boton('video', 'Filmar video', 'video/*', true)) + boton('archivo', 'Elegir archivo', soloFoto ? 'image/*' : 'image/*,video/*', false) + '</div>' +
      '<div id="' + id + '_estado" style="font-size:12.5px;color:#6B7075;margin-top:6px;line-height:1.4;">' + (soloFoto ? '' : 'El video, corto: unos 15 segundos alcanzan.') + '</div></div>';
  }
  // Lo elegido queda en memoria, por selector: así se puede mandar una foto Y un video (o varias fotos) en el mismo envío.
  // La orden de servicio (selector sin botón de video) lleva una sola foto: elegir otra la reemplaza.
  var SEL = {}, SEL_MAX = 5;
  function elegidos(id) { return (SEL[id] || []).slice(); }
  function elegido(id) { return (SEL[id] || [])[0] || null; }
  function pintarElegidos(id, aviso) {
    var est = document.getElementById(id + '_estado'); if (!est) return;
    var l = SEL[id] || [];
    est.innerHTML = (aviso ? '<div style="color:#B5371C;font-weight:700;">' + aviso + '</div>' : '') + (l.length ? l.map(function (f, i) {
      var esV = /^video\//.test(f.type || ''), mb = f.size / 1048576, peso = mb >= 1 ? Math.round(mb) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
      return '<div><b style="color:#178029;">' + (esV ? 'Video' : 'Foto') + ' ' + (l.length > 1 ? (i + 1) + ' ' : '') + 'para enviar</b> · ' + peso + ' · <a href="#" data-quitar="' + id + '" data-i="' + i + '" style="color:#B5371C;font-weight:700;">Quitar</a></div>';
    }).join('') + (document.getElementById(id + '_video') && l.length < SEL_MAX ? '<div>Podés sumar otra foto o un video con los mismos botones.</div>' : '') : (aviso ? '' : (document.getElementById(id + '_video') ? 'El video, corto: unos 15 segundos alcanzan.' : '')));
  }
  function quitar(id, i) { if (i == null) SEL[id] = []; else (SEL[id] || []).splice(i, 1); pintarElegidos(id); }
  if (document.addEventListener) {
    document.addEventListener('change', function (ev) {
      var t = ev.target, id = t && t.getAttribute && t.getAttribute('data-sel'); if (!id) return;
      var f = t.files && t.files[0]; t.value = ''; if (!f) return;
      var varios = !!document.getElementById(id + '_video'), l = SEL[id] = SEL[id] || [];
      if (/^video\//.test(f.type || '') && f.size > VIDEO_MAX) return pintarElegidos(id, 'Ese video pesa ' + Math.round(f.size / 1048576) + ' MB y el tope es ' + Math.round(VIDEO_MAX / 1048576) + ' MB. Filmá uno más corto (unos 15 segundos).');
      if (!varios) SEL[id] = [f]; else if (l.length >= SEL_MAX) return pintarElegidos(id, 'Hasta ' + SEL_MAX + ' archivos por envío.'); else l.push(f);
      pintarElegidos(id);
    }, true);
    document.addEventListener('click', function (ev) { var q = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-quitar'); if (q) { ev.preventDefault(); quitar(q, +ev.target.getAttribute('data-i')); } }, true);   // en captura: el formulario del Operador frena los clics antes de que lleguen al documento
  }
  // Varias fotos o videos: una nota por archivo (la primera lleva el texto). Si alguno falla, sigue con los demás y avisa cuántos faltaron.
  function notaVarios(id, texto, archivos) {
    archivos = archivos || [];
    if (!archivos.length) return nota(id, texto, null);
    var fallos = [], p = Promise.resolve();
    archivos.forEach(function (f, i) { p = p.then(function () { return nota(id, i === 0 ? texto : '', f).catch(function (e) { fallos.push(e.message); if (i === 0 && String(texto || '').trim()) return nota(id, texto, null).catch(function () {}); }); }); });
    return p.then(function () { if (fallos.length) throw new Error((fallos.length === archivos.length ? 'no se pudo subir' : 'no se pudieron subir ' + fallos.length + ' de ' + archivos.length + ' archivos') + ' (' + fallos[0] + ')'); });
  }

  /* ---------- lectura para otras pantallas ---------- */
  function volvioAAndar(p) {
    if (p.estado === 'cerrado' || !p.paradaId || !window.SafiaParte) return false;
    var ev = lista('eventos').filter(function (v) { return v.tipo === 'parada' && String(v.id) === String(p.paradaId); })[0];
    return !!(ev && SafiaParte.finDe(ev).hasta);
  }
  function estadoTxt(p) {
    if (p.estado === 'cerrado') return 'Cerrado el ' + fh(p.cierre && p.cierre.fecha);
    if (p.asignado && !p.visita) return 'Lo atiende ' + p.asignado.nombre + ' (Irrigar)';
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
      tecnico_asignado: p.asignado ? p.asignado.nombre + (p.ordenRuta ? ' (' + p.ordenRuta + '.º en su ruta)' : '') : undefined,
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
    var c = p.estado === 'cerrado' ? ['#EEF0F2', '#6B7075', p.origen === 'constancia' ? 'Constancia' : p.cierre && p.cierre.automatico ? 'Cerrado solo (se regó)' : 'Cerrado'] : p.visita ? ['#E7F6EA', '#178029', 'Visita ' + fh(p.visita)] : p.asignado ? ['#E8F1FB', '#1F5FA8', 'Asignado' + (p.ordenRuta ? ' · ' + p.ordenRuta + '.º' : '')] : p.tomadoPor ? ['#E8F1FB', '#1F5FA8', 'Tomado'] : ['#FBECEA', '#B5371C', esIrrigar() ? 'Sin asignar' : 'Sin tomar'];
    return '<span style="display:inline-block;padding:3px 9px;border-radius:99px;font-size:11.5px;font-weight:700;background:' + c[0] + ';color:' + c[1] + ';white-space:nowrap;">' + esc(c[2]) + '</span>';
  }
  function equiposVisibles() { return lista('equipos').filter(function (e) { return !e.zona && !(window.SafiaBalance && SafiaBalance.esSecano && SafiaBalance.esSecano(e)); }); }
  function opcionesEquipo(sel, clienteId) {
    return equiposVisibles().filter(function (e) { return !clienteId || String((campo(e.campoId) || {}).clienteId) === String(clienteId); }).map(function (e) { var c = campo(e.campoId) || {}, cl = cliente(c.clienteId) || {}; return { id: e.id, t: (esIrrigar() && cl.nombre && !clienteId ? cl.nombre + ' · ' : '') + (c.nombre ? c.nombre + ' · ' : '') + e.nombre + (abiertoDe(e.id) ? ' (pedido abierto)' : '') }; })
      .sort(function (a, b) { return a.t.localeCompare(b.t); }).map(function (o) { return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(sel) ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('');
  }
  function opcionesMotivo(sel) { return Object.keys(MOTIVOS).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(MOTIVOS[k]) + '</option>'; }).join(''); }
  function aviso(t, ok) { return t ? '<div style="margin:10px 0;padding:10px 12px;border-radius:8px;font-size:13.5px;font-weight:600;line-height:1.45;background:' + (ok ? '#E7F6EA' : '#FBECEA') + ';color:' + (ok ? '#178029' : '#B5371C') + ';">' + esc(t) + '</div>' : ''; }
  function sinSenalHtml() { return navigator.onLine === false ? '<div style="margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#FFF4DC;color:#8A5A00;font-size:13px;font-weight:600;line-height:1.45;">Sin señal: lo que escribas o cierres queda guardado en el celular y se manda solo cuando vuelva la señal. Las fotos y la orden de servicio necesitan señal.</div>' : ''; }
  function mapaHtml(p, chico) { var m = mapaUrl(p); return m ? '<a href="' + esc(m) + '" target="_blank" rel="noopener" style="display:inline-block;' + (chico ? 'margin-top:8px;padding:6px 10px;font-size:12.5px;' : 'padding:8px 12px;font-size:13px;') + 'border-radius:8px;border:1.5px solid #CFE3D2;background:#F2FAF3;color:#178029;font-weight:700;text-decoration:none;">Cómo llegar</a>' : ''; }
  function ir(modo, id, msg, ok) { vista.editando = false; vista.borrando = false; if (modo === 'lista' || modo === 'detalle') vista.formCliente = ''; vista.modo = modo; vista.id = id || null; vista.msg = msg || ''; vista.msgOk = !!ok; pintar(); window.scrollTo(0, 0); }

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
      (esTecnico() ? '' : '<button data-a="nuevo" style="' + BV + '">Pedir asistencia</button>') +
      (irr ? '<button data-a="constancia" style="' + BG + '">Registrar asistencia ya resuelta</button>' : '') + '</div>' +
      aviso(vista.msg, vista.msgOk) + sinSenalHtml() +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
        kpi(abiertos.length, 'pedidos abiertos', abiertos.length ? '#B5371C' : '#178029') +
        kpi(abiertos.filter(function (p) { return !p.tomadoPor; }).length, irr ? 'sin asignar' : 'sin tomar', irr && abiertos.some(function (p) { return !p.tomadoPor; }) ? '#B5371C' : null) +
        kpi(hrs(tResp), 'tardó Irrigar en tomarlos (promedio)') + kpi(hrs(tRes), 'tardaron en resolverse (promedio)') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
        (esTecnico() ? ['mias', 'abiertos', 'cerrados', 'pendientes'] : esOficina() ? ['abiertos', 'ruta', 'cerrados', 'todos', 'pendientes'] : ['abiertos', 'cerrados', 'todos', 'pendientes']).map(function (f) { return '<button data-f="' + f + '" style="' + B + 'padding:7px 12px;border:1.5px solid ' + (vista.filtro === f ? '#22A93A;background:#E7F6EA;color:#178029' : '#E1E4E7;background:#fff;color:#41464B') + ';">' + (f === 'mias' ? 'Mis visitas (' + rutaDe(yo().id).length + ')' : f === 'ruta' ? 'Por técnico' : f === 'abiertos' ? 'Abiertos' : f === 'cerrados' ? 'Historial (cerrados)' : f === 'pendientes' ? 'Repuestos pendientes (' + pendientes(true).length + ')' : 'Todos') + '</button>'; }).join('') +
        (irr && Object.keys(clientesConPedidos).length > 1 ? '<select id="asFCliente" style="' + IN + 'width:auto;padding:7px 10px;"><option value="">Todos los clientes</option>' + Object.keys(clientesConPedidos).map(function (k) { return '<option value="' + esc(k) + '"' + (String(k) === String(vista.cliente) ? ' selected' : '') + '>' + esc(clientesConPedidos[k]) + '</option>'; }).join('') + '</select>' : '') +
        '<select id="asFEquipo" style="' + IN + 'width:auto;max-width:100%;padding:7px 10px;"><option value="">Todos los pivots</option>' + opcionesEquipo(vista.equipo) + '</select></div>';
    if (vista.filtro === 'pendientes') return h + htmlPendientes();
    if (vista.filtro === 'ruta') return h + htmlRuta();
    if (vista.filtro === 'mias') { l = rutaDe(yo().id); if (!l.length) return h + '<div style="background:#fff;border:1px dashed #C9CED3;border-radius:10px;padding:22px;text-align:center;color:#6B7075;font-size:14px;line-height:1.5;">No tenés visitas asignadas. Cuando la oficina te asigne una, te llega el aviso y aparece acá, en orden.</div>'; }
    if (!l.length) return h + '<div style="background:#fff;border:1px dashed #C9CED3;border-radius:10px;padding:22px;text-align:center;color:#6B7075;font-size:14px;line-height:1.5;">' + (vista.filtro === 'abiertos' ? 'No hay pedidos de asistencia abiertos.' : 'No hay pedidos para mostrar.') + '</div>';
    return h + l.map(function (p, i) {
      var g = lugar(p), n = notasDe(p.id).filter(function (x) { return !x.sistema; }), paradaCerrada = volvioAAndar(p);
      return '<div data-p="' + esc(p.id) + '" style="background:#fff;border:1px solid #E1E4E7;border-left:4px solid ' + (p.estado === 'cerrado' ? '#B9BEC3' : p.tomadoPor ? '#1F5FA8' : '#B5371C') + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div style="font-size:15px;font-weight:800;color:#2E3236;">' + esc(g.pivot) + '<span style="font-weight:500;color:#6B7075;font-size:13px;"> · ' + esc([g.campo, irr ? g.cliente : ''].filter(Boolean).join(' · ')) + '</span></div>' + chip(p) + '</div>' +
        '<div style="font-size:13.5px;color:#41464B;margin-top:4px;line-height:1.45;"><b>' + esc(MOTIVOS[p.motivo] || p.motivo) + '</b>' + (p.descripcion ? ' · ' + esc(p.descripcion.slice(0, 160)) : '') + '</div>' +
        '<div style="font-size:12px;color:#8C9196;margin-top:4px;">' + (p.origen === 'constancia' ? 'Constancia de ' + firma(p.pedidoPor) + ' · ' + fd(p.fechaProblema) : 'Pedido el ' + fh(p.creado) + ' por ' + firma(p.pedidoPor) + (p.estado !== 'cerrado' ? ' · hace ' + lapso(p.creado) : ' · resuelto en ' + lapso(p.creado, p.cierre && p.cierre.fecha))) +
          (n.length ? ' · ' + n.length + (n.length === 1 ? ' nota' : ' notas') : '') + (pendientesDe(p.id).filter(function (x) { return x.estado !== 'entregado'; }).length ? ' · <b style="color:#B5371C;">' + pendientesDe(p.id).filter(function (x) { return x.estado !== 'entregado'; }).length + ' repuesto(s) pendiente(s)</b>' : '') + (p.orden && (p.orden.foto || p.orden.nro) ? ' · <b>con orden de servicio' + (p.orden.nro ? ' N.º ' + esc(p.orden.nro) : '') + '</b>' : '') + (paradaCerrada ? ' · <b style="color:#178029;">el pivot ya volvió a andar</b>' : '') + '</div>' +
        (p.asignado && p.estado !== 'cerrado' ? '<div style="font-size:12.5px;color:#1F5FA8;font-weight:700;margin-top:4px;">' + (vista.filtro === 'mias' ? (p.ordenRuta > 0 ? p.ordenRuta : i + 1) + '.º en tu ruta' : 'Técnico: ' + esc(p.asignado.nombre) + (p.ordenRuta ? ' · ' + p.ordenRuta + '.º en su ruta' : '')) + (p.visita ? ' · visita ' + fh(p.visita) : '') + '</div>' : '') +
        (irr && p.estado !== 'cerrado' ? mapaHtml(p, true) : '') + (irr && p.estado !== 'cerrado' ? '<div style="margin-top:8px;font-size:13px;font-weight:700;color:#178029;">Abrir para responder, cargar la visita o registrar la solución</div>' : '') + '</div>';
    }).join('');
  }

  // Oficina: la ruta de cada técnico, en orden, con el botón para mandársela por WhatsApp
  function htmlRuta() {
    var abiertos = pedidos().filter(function (p) { return p.estado !== 'cerrado'; }), sin = abiertos.filter(function (p) { return !p.asignado; });
    var ids = tecnicos().map(function (t) { return String(t.id); }); abiertos.forEach(function (p) { if (p.asignado && ids.indexOf(String(p.asignado.id)) < 0) ids.push(String(p.asignado.id)); });
    var fila = function (p, n) { var g = lugar(p); return '<div data-p="' + esc(p.id) + '" style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid #F0F2F4;cursor:pointer;"><div style="flex:none;width:28px;height:28px;border-radius:99px;background:' + (n ? '#E8F1FB;color:#1F5FA8' : '#FBECEA;color:#B5371C') + ';font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;">' + (n || '!') + '</div>' +
      '<div style="min-width:0;flex:1;"><div style="font-size:14px;font-weight:700;color:#2E3236;">' + esc(g.pivot) + ' <span style="font-weight:500;color:#6B7075;font-size:12.5px;">· ' + esc([g.campo, g.cliente].filter(Boolean).join(' · ')) + '</span></div><div style="font-size:12.5px;color:#41464B;">' + esc(MOTIVOS[p.motivo] || p.motivo) + ' · pedido hace ' + lapso(p.creado) + (p.visita ? ' · <b>visita ' + fh(p.visita) + '</b>' : '') + (p.parado ? ' · <b style="color:#B5371C;">parado</b>' : '') + '</div></div>' + mapaHtml(p, true) + '</div>'; };
    var h = '<div style="background:#fff;border:1px solid #E1E4E7;border-left:4px solid #B5371C;border-radius:12px;padding:12px 14px;margin-bottom:10px;"><div style="font-size:15px;font-weight:800;color:#2E3236;">Sin asignar <span style="font-weight:500;color:#6B7075;font-size:13px;">· ' + sin.length + '</span></div>' +
      (sin.length ? sin.map(function (p) { return fila(p, 0); }).join('') + '<div style="font-size:12px;color:#8C9196;margin-top:6px;">Tocá un pedido para elegir el técnico y su orden en la ruta.</div>' : '<div style="font-size:13px;color:#8C9196;margin-top:4px;">Todos los pedidos abiertos tienen técnico.</div>') + '</div>';
    if (!tecnicos().length) h += aviso('Todavía no hay técnicos cargados. En Usuarios, creá un acceso con el rol "Técnico de Irrigar" y su teléfono.');
    return h + ids.map(function (id) {
      var t = tecnico(id) || {}, l = rutaDe(id), nombre = t.nombre || ((l[0] || {}).asignado || {}).nombre || 'Técnico', wa = l.length && t.telefono ? waUrl(t.telefono, textoRuta(id)) : '';
      if (!l.length && t.rol && t.rol !== 'tecnico') return '';   // la gente de la oficina aparece solo si tiene algo asignado
      return '<div style="background:#fff;border:1px solid #E1E4E7;border-left:4px solid #1F5FA8;border-radius:12px;padding:12px 14px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;"><div style="font-size:15px;font-weight:800;color:#2E3236;">' + esc(nombre) + ' <span style="font-weight:500;color:#6B7075;font-size:13px;">· ' + (l.length ? l.length + (l.length === 1 ? ' visita' : ' visitas') : 'libre') + (t.telefono ? ' · ' + esc(t.telefono) : '') + '</span></div>' +
        (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener" style="' + BG + 'padding:7px 11px;font-size:12.5px;text-decoration:none;">Mandar la ruta por WhatsApp</a>' : l.length && !t.telefono ? '<span style="font-size:12px;color:#8C9196;">Sin teléfono cargado en Usuarios</span>' : '') + '</div>' +
        l.map(function (p, i) { return fila(p, p.ordenRuta > 0 ? p.ordenRuta : i + 1); }).join('') + '</div>';
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
    var h = '<button data-a="volver" style="' + BG + 'margin-bottom:12px;">Volver a la lista</button>' + aviso(vista.msg, vista.msgOk) + sinSenalHtml() +
      '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:16px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div><div style="font-size:18px;font-weight:800;color:#2E3236;">' + esc(g.pivot) + '</div><div style="font-size:13px;color:#6B7075;">' + esc([g.campo, g.cliente].filter(Boolean).join(' · ')) + '</div>' + (irr && abierto ? '<div style="margin-top:6px;">' + mapaHtml(p) + '</div>' : '') + '</div>' + chip(p) + '</div>' +
      '<div style="margin-top:10px;">' + fila('Motivo', esc(MOTIVOS[p.motivo] || p.motivo)) + fila('Qué pasa', esc(p.descripcion)) +
        fila(p.origen === 'constancia' ? 'Constancia de' : 'Lo pidió', firma(p.pedidoPor) + ' · ' + fh(p.creado)) +
        (p.origen === 'constancia' ? fila('Fecha', fd(p.fechaProblema)) + fila('Se atendió', esc(CANALES[inf.canal] || '')) : fila('Lo tomó', p.tomadoPor ? esc(p.tomadoPor.nombre) + (p.tomadoPor.rol === 'tecnico' ? ' (técnico de Irrigar)' : ' (Irrigar)') + ' · ' + fh(p.tomadoEn) + ' · a los ' + lapso(p.creado, p.tomadoEn) : '<span style="color:#B5371C;font-weight:700;">Todavía nadie de Irrigar lo tomó</span>') +
          fila('Técnico', p.asignado ? '<b>' + esc(p.asignado.nombre) + '</b>' + (p.ordenRuta ? ' · ' + p.ordenRuta + '.º en su ruta' : '') + (p.asignadoPor ? ' · lo asignó ' + esc(p.asignadoPor.nombre) + ' ' + fh(p.asignadoEn) : '') : '') +
          fila('Visita prevista', p.visita ? '<b>' + fh(p.visita) + '</b>' : '')) +
        (p.cierre ? fila('Cerrado', firma(p.cierre.por) + ' · ' + fh(p.cierre.fecha) + (p.origen !== 'constancia' ? ' · resuelto en ' + lapso(p.creado, p.cierre.fecha) : '')) + fila('Al cerrar', esc(p.cierre.texto)) : '') +
        fila('Causa', esc(inf.causa && inf.causa !== p.descripcion ? inf.causa : '')) + fila('Solución', esc(inf.solucion && (!p.cierre || inf.solucion !== p.cierre.texto) ? inf.solucion : '')) + fila('Repuestos', esc(inf.repuestos)) +
        (p.orden ? fila('Orden de servicio', (p.orden.nro ? 'N.º <b>' + esc(p.orden.nro) + '</b> · ' : '') + 'la subió ' + firma(p.orden.por) + ' · ' + fh(p.orden.fecha) + (p.orden.foto ? '<a data-foto="' + esc(p.orden.foto) + '" target="_blank" rel="noopener" style="display:block;margin-top:6px;font-size:12.5px;color:#178029;font-weight:700;">Cargando foto…</a>' : '')) : (p.estado === 'cerrado' ? fila('Orden de servicio', '<span style="color:#8A5A00;">Sin orden cargada</span>') : '')) +
      '</div>' + (paradaCerrada ? '<div style="margin-top:10px;padding:9px 12px;border-radius:8px;background:#E7F6EA;color:#178029;font-size:13.5px;font-weight:600;">El pivot ya volvió a andar. Si el problema está resuelto, cerrá el pedido.</div>' : '') +
      (p.editado ? '<div style="font-size:12px;color:#8C9196;margin-top:8px;">Corregido por ' + firma(p.editado.por) + ' el ' + fh(p.editado.fecha) + '</div>' : '') +
      (vista.borrando ? (function () { var ev = paradaDe(p), fin = ev && window.SafiaParte ? SafiaParte.finDe(ev).hasta : (ev && ev.hasta);
          return '<div style="border-top:1px solid #EEF0F2;margin-top:12px;padding:12px;border-radius:10px;background:#FBECEA;">' +
            '<div style="font-size:14px;font-weight:700;color:#B5371C;">¿Borrar también la parada del pivot?</div>' +
            '<div style="font-size:13px;color:#41464B;line-height:1.45;margin-top:4px;">Con este pedido se cargó una parada del pivot: desde el ' + fd(ev.fecha) + ' por ' + esc(window.SafiaParte ? SafiaParte.motivoTxt(ev) : (ev.motivo || '')) + (fin ? ', cerrada el ' + fd(fin) : ', <b>todavía abierta</b> (el pivot figura parado)') + '. Si fue una prueba o un error, borrala también; si el pivot estuvo parado de verdad, dejala.</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button data-a="borrarTodo" style="' + BR + '">Borrar el pedido y la parada</button><button data-a="borrarSolo" style="' + BG + '">Borrar solo el pedido</button><button data-a="borrarCancelar" style="' + BG + '">Cancelar</button></div></div>'; })() : '') +
      (vista.editando ? '<div style="border-top:1px solid #EEF0F2;margin-top:12px;padding-top:10px;"><div style="font-size:13.5px;font-weight:700;color:#2E3236;">Corregir el pedido</div>' +
          '<label style="' + LB + '">Motivo</label><select id="asEdMotivo" style="' + IN + '">' + opcionesMotivo(p.motivo) + '</select>' +
          '<label style="' + LB + '">Qué pasa</label><textarea id="asEdDesc" rows="3" style="' + IN + '">' + esc(p.descripcion || '') + '</textarea>' +
          '<label style="' + LB + '">Fecha del problema</label><input id="asEdFecha" type="date" value="' + esc(String(p.fechaProblema || '').slice(0, 10)) + '" max="' + hoy() + '" style="' + IN + '">' +
          '<div style="display:flex;gap:8px;margin-top:10px;"><button data-a="edGuardar" style="' + BV + '">Guardar</button><button data-a="edCancelar" style="' + BG + '">Cancelar</button></div></div>'
        : '<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #EEF0F2;margin-top:12px;padding-top:10px;">' +
          (irr || abierto ? '<button data-a="edAbrir" style="' + BG + 'padding:7px 11px;font-size:12.5px;">Editar</button>' : '') +
          (!abierto ? '<button data-a="reabrir" style="' + BG + 'padding:7px 11px;font-size:12.5px;">Reabrir el pedido</button>' : '') +
          (esOficina() ? '<button data-a="borrar" style="' + BR + 'padding:7px 11px;font-size:12.5px;margin-left:auto;">Borrar</button>' : '') + '</div>') + '</div>';

    // acciones
    if (abierto) {
      h += '<div style="background:#fff;border:1px solid #E1E4E7;border-radius:12px;padding:14px 16px;margin-bottom:10px;">';
      if (irr) h += '<div style="font-size:12px;font-weight:700;color:#6B7075;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Irrigar</div>' +
        (esOficina() ? (function () {
          var ts = tecnicos(), sel = p.asignado ? String(p.asignado.id) : (ts[0] ? String(ts[0].id) : ''), sig = sel ? rutaDe(sel).filter(function (x) { return String(x.id) !== String(p.id); }).length + 1 : 1, t = p.asignado ? tecnico(p.asignado.id) : null;
          var wa = p.asignado && t && t.telefono ? waUrl(t.telefono, 'SAFIA · Visita asignada\n\n' + textoPedidoRuta(p, p.ordenRuta)) : '';
          return '<div style="padding:10px 12px;border-radius:10px;background:#F4F7FB;margin-bottom:12px;"><div style="font-size:13.5px;font-weight:700;color:#2E3236;">' + (p.asignado ? 'Técnico asignado: ' + esc(p.asignado.nombre) : 'Asignar un técnico') + '</div>' +
            (ts.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px;"><div style="flex:1;min-width:170px;"><label style="' + LB + 'margin-top:0;">Técnico</label><select id="asTec" style="' + IN + '">' + ts.map(function (x) { return '<option value="' + esc(x.id) + '"' + (String(x.id) === sel ? ' selected' : '') + '>' + esc(x.nombre) + (x.rol === 'tecnico' ? '' : ' (oficina)') + ' · ' + rutaDe(x.id).length + ' en ruta</option>'; }).join('') + '</select></div>' +
              '<div style="width:110px;"><label style="' + LB + 'margin-top:0;">Orden en su ruta</label><input id="asOrden" type="number" min="1" step="1" value="' + (p.ordenRuta || sig) + '" style="' + IN + '"></div>' +
              '<button data-a="asignar" style="' + BV + '">' + (p.asignado ? 'Cambiar' : 'Asignar') + '</button></div>' +
              '<div style="font-size:12px;color:#6B7075;margin-top:6px;line-height:1.4;">Al técnico le llega el aviso con el orden y cómo llegar; al campo, que ya tiene técnico. 1 = va primero.</div>' +
              (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;' + BG + 'padding:7px 11px;font-size:12.5px;text-decoration:none;">Mandarle este pedido por WhatsApp</a>' : p.asignado && t && !t.telefono ? '<div style="font-size:12px;color:#8C9196;margin-top:6px;">Para mandárselo por WhatsApp, cargale el teléfono en Usuarios.</div>' : '')
            : '<div style="font-size:13px;color:#6B7075;margin-top:4px;line-height:1.45;">Todavía no hay técnicos cargados. En Usuarios, creá un acceso con el rol "Técnico de Irrigar" y su teléfono.</div>') + '</div>';
        })() : '') +
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
      else h += (function () {
          var wa = window.SafiaAsistencia && SafiaAsistencia.enlace ? SafiaAsistencia.enlace({ equipoId: p.equipoId, motivo: p.motivo, fecha: p.fechaProblema, observaciones: p.descripcion, parado: p.parado, pedidoId: p.id }) : '';
          return wa ? '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #EEF0F2;"><a href="' + esc(wa) + '" target="_blank" rel="noopener" style="' + BV + 'display:inline-block;text-decoration:none;">Avisar también por WhatsApp</a><div style="font-size:12px;color:#8C9196;margin-top:6px;line-height:1.4;">Abre WhatsApp con el mensaje ya escrito para el soporte de Irrigar.</div></div>' : '';
        })() + '<div style="font-size:13.5px;font-weight:700;color:#2E3236;">¿Ya está resuelto?</div>' +
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
      var mia = String(n.autor && n.autor.id) === String(yo().id), deIrr = n.autor && rolIrrigar(n.autor.rol);
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
      (esOficina() ? '<button data-a="pendQuitar" data-id="' + esc(x.id) + '" style="' + BR + 'padding:6px 10px;font-size:12.5px;">Quitar</button>' : '') + '</div></div>';
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
        if (ES_VIDEO.test(a.getAttribute('data-foto'))) { var v = document.createElement('video'); v.controls = true; v.preload = 'metadata'; v.playsInline = true; v.src = r.data.signedUrl; v.style.cssText = 'max-width:100%;max-height:320px;border-radius:8px;display:block;margin-top:6px;background:#000;'; a.parentNode.insertBefore(v, a); a.href = r.data.signedUrl; a.textContent = 'Abrir o descargar el video'; return; }
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
    if (ev.target.closest && ev.target.closest('a[target="_blank"]')) return;   // Cómo llegar y WhatsApp abren aparte, sin abrir el pedido
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
      var fotos = elegidos('asFoto'), parado = document.getElementById('asParado').checked;
      var p = crear({ equipoId: eqId, motivo: val('asMotivo'), descripcion: desc, parado: parado });
      if (parado) { var evp = cargarParada(p); if (evp) cambiar(p.id, function (x) { x.paradaId = evp.id; }); }
      var avisarIrrigar = function () {
        var ev = { equipoId: eqId, motivo: p.motivo, fecha: p.fechaProblema, observaciones: desc, parado: parado, guardado: 'El pedido ya quedó guardado' + (parado ? ' y el pivot figura parado.' : '.'), enElPedido: true };
        if (window.SafiaAsistencia && SafiaAsistencia.pedir) setTimeout(function () { SafiaAsistencia.pedir(ev, p); }, 1500);   // avisa a Irrigar y ofrece el WhatsApp
        else setTimeout(function () { invocar('pedir', { equipoId: eqId, motivo: p.motivo, fecha: p.fechaProblema, nota: desc, pedidoId: p.id, parado: parado }).catch(function () {}); }, 2500);
      };
      avisarIrrigar();
      if (fotos.length) { b.disabled = true; b.textContent = 'Subiendo…'; return notaVarios(p.id, '', fotos).then(function () { ir('detalle', p.id, 'Pedido enviado a Irrigar con ' + (fotos.length === 1 ? 'el archivo.' : 'los ' + fotos.length + ' archivos.'), true); }, function (e) { ir('detalle', p.id, 'El pedido se envió, pero ' + e.message + '. Subilo de nuevo desde acá.'); }); }
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
    if (a === 'edAbrir') { vista.editando = true; return pintar(); }
    if (a === 'edCancelar') { vista.editando = false; return pintar(); }
    if (a === 'edGuardar') { if (!val('asEdDesc')) { vista.msg = 'Escribí qué pasa.'; return pintar(); } editar(id, val('asEdMotivo'), val('asEdDesc'), val('asEdFecha')); vista.editando = false; return ir('detalle', id, 'Pedido corregido.', true); }
    if (a === 'reabrir') {
      if (b.getAttribute('data-seguro') !== '1') { b.setAttribute('data-seguro', '1'); b.textContent = '¿Reabrir? Tocá de nuevo'; return; }
      var rr = reabrir(id); if (rr && rr.error) return ir('detalle', id, rr.error);
      vista.filtro = 'abiertos'; return ir('detalle', id, 'Pedido reabierto: se puede volver a escribir y cerrar.', true);
    }
    if (a === 'borrarCancelar') { vista.borrando = false; return pintar(); }
    if (a === 'borrarTodo' || a === 'borrarSolo') {
      var conParada = a === 'borrarTodo' && borrarParada(pedido(id)); borrar(id);
      return ir('lista', null, conParada ? 'Pedido y parada del pivot borrados.' : 'Pedido borrado.', true);
    }
    if (a === 'borrar') {
      if (paradaDe(pedido(id))) { vista.borrando = true; return pintar(); }   // tiene una parada cargada con él: se pregunta qué hacer con ella
      if (b.getAttribute('data-seguro') !== '1') { b.setAttribute('data-seguro', '1'); b.textContent = '¿Borrar con sus notas, fotos y pendientes? Tocá de nuevo'; return; }
      borrar(id); return ir('lista', null, 'Pedido borrado.', true);
    }
    if (a === 'asignar') {
      var tec = tecnico(val('asTec')); if (!tec) { vista.msg = 'Elegí el técnico.'; return pintar(); }
      asignar(id, tec, parseInt(val('asOrden'), 10));
      return ir('detalle', id, 'Asignado a ' + tec.nombre + '. Le llega el aviso' + (tec.telefono ? '; si está sin señal, mandale también el WhatsApp de abajo.' : '.'), true);
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
      var archs = elegidos('asNotaFoto'); b.disabled = true; b.textContent = archs.length ? 'Subiendo…' : 'Enviando…';
      return notaVarios(id, val('asNota'), archs).then(function () { ir('detalle', id); }, function (e) { ir('detalle', id, e.message); });
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
    if (esTecnico()) vista.filtro = 'mias';   // el técnico arranca en sus visitas, en orden
    if (q.get('p')) { vista.modo = 'detalle'; vista.id = q.get('p'); var pp = pedido(vista.id); if (pp && pp.estado === 'cerrado') vista.filtro = 'cerrados'; }
    else if (q.get('nuevo')) vista.modo = 'nuevo';
    pintar();
    if (esOficina()) traerTecnicos().then(function () { if (vista.modo === 'detalle' || vista.filtro === 'ruta') pintar(); });
    window.addEventListener('online', function () { pintar(); }); window.addEventListener('offline', function () { pintar(); });
    // lo que escribió la otra parte llega con la sincronización: se vuelve a pintar si cambió algo y nadie está escribiendo
    var huella = localStorage.getItem(CLAVE) || '';
    setInterval(function () {
      var h2 = localStorage.getItem(CLAVE) || ''; if (h2 === huella) return; huella = h2;
      var act = document.activeElement, escribiendo = act && cont.contains(act) && /INPUT|TEXTAREA|SELECT/.test(act.tagName) && (act.type === 'file' ? act.files.length : String(act.value || '').length);
      if (!escribiendo) escribiendo = !!(elegido('asNotaFoto') || elegido('asOrdenFoto') || elegido('asFoto') || (document.getElementById('asNota') || {}).value) || !!vista.editando || !!vista.borrando;
      if (!escribiendo) pintar();
    }, 4000);
    if (window.SafiaSync && SafiaSync.refrescar && vista.modo === 'detalle') setInterval(function () { if (!document.hidden && vista.modo === 'detalle') { try { SafiaSync.refrescar(); } catch (e) {} } }, 30000);
  }

  window.SafiaAsistencias = { montar: montar, crear: crear, pedidos: pedidos, pedido: pedido, notasDe: notasDe, abiertoDe: abiertoDe, tomar: tomar, asignar: asignar, rutaDe: rutaDe, tecnicos: tecnicos, traerTecnicos: traerTecnicos, mapaUrl: mapaUrl, telWa: telWa, fijarVisita: fijarVisita, nota: nota, cerrar: cerrar, cerrarPorRiego: cerrarPorRiego, repararEquipos: repararEquipos, editar: editar, reabrir: reabrir, borrar: borrar, guardarOrden: guardarOrden, selector: selector, elegido: elegido, elegidos: elegidos, notaVarios: notaVarios, pendientes: pendientes, pendientesDe: pendientesDe, agregarPendientes: agregarPendientes, marcarPendiente: marcarPendiente, constancia: constancia, guardarInforme: guardarInforme,
    tarjetaOperador: tarjetaOperador, resumenEquipo: resumenEquipo, estadoTxt: estadoTxt, MOTIVOS: MOTIVOS };
  // al abrir cualquier pantalla que cargue este módulo (Operador, Asistencia, Asistente), con los datos ya bajados de la nube
  function repararEquipos() {
    var real = {}; lista('equipos').forEach(function (e) { real[String(e.id)] = e.id; });
    var arreglar = function (clave, filtro) {
      var l = lista(clave), n = 0;
      l.forEach(function (x) { if (x && filtro(x) && typeof x.equipoId === 'string' && real[x.equipoId] !== undefined && typeof real[x.equipoId] !== 'string') { x.equipoId = real[x.equipoId]; n++; } });
      if (n) localStorage.setItem(clave, JSON.stringify(l));
      return n;
    };
    return arreglar('eventos', function (x) { return x.tipo === 'parada'; }) + arreglar(CLAVE, function () { return true; });
  }
  var alArrancar = function () { try { repararEquipos(); } catch (e) {} try { cerrarPorRiego(); } catch (e) {} try { vaciarCola(); } catch (e) {} };
  if (window.SafiaSync && SafiaSync.alListo) SafiaSync.alListo(function () { setTimeout(alArrancar, 1500); }); else setTimeout(alArrancar, 1500);
})();
