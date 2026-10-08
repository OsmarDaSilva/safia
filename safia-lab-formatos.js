/* SAFIA — Formatos de laboratorio (lo que SAFIA aprende de cada laboratorio)
   -------------------------------------------------------------------
   Cada laboratorio informa distinto: nombres, unidades, columnas de más o de menos (H en % de la CTC, CTC
   efetiva, alcalinidad como CaCO3, Na en mg/dm³…). SAFIA guarda, por laboratorio y por tipo de análisis
   (suelo / agua / foliar), lo que vio en cada lectura y lo que el usuario corrigió a mano después, y se lo
   pasa a la IA en la lectura siguiente para que suba todo bien de entrada.
   Vive en la colección `aprendizaje` (tabla safia_aprendizaje, registro id 'lab_formatos'): la escriben
   propietario y admin de Irrigar (la base no deja a nadie más) y la leen todos.
   Pedido de Osmar (8-oct-2026): "son varios laboratorios y cada uno tiene diferentes campos; SAFIA debe
   ir almacenando campos para que el día que se sube de un laboratorio sepa subir correctamente todo". */
(function () {
  'use strict';
  var ID = 'lab_formatos', COL = 'aprendizaje';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/laborat[oó]rios?|laboratory|labs?\b|s\.?a\.?|ltda\.?|s\.?r\.?l\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function lista() { try { var l = JSON.parse(localStorage.getItem(COL) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function datos() { var l = lista(); for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === ID) return l[i]; return null; }
  function puedeEscribir() { try { var u = (window.SafiaSync && SafiaSync.usuario && SafiaSync.usuario()) || JSON.parse(localStorage.getItem('safia_usuario') || 'null'); return !!u && (u.rol === 'propietario' || u.rol === 'admin'); } catch (e) { return false; } }
  function guardar(F) {
    if (!puedeEscribir()) return false;
    F.fecha = new Date().toISOString();
    var l = lista().filter(function (x) { return !x || x.id !== ID; }); l.push(F);
    localStorage.setItem(COL, JSON.stringify(l)); return true;
  }
  function claveLab(nombre) { var n = norm(nombre); return n.length >= 3 ? n : ''; }
  function labDe(F, nombre, crear) {
    var k = claveLab(nombre); if (!k) return null;
    F.labs = F.labs || {};
    if (!F.labs[k] && crear) F.labs[k] = { nombre: String(nombre).trim(), lecturas: 0, tipos: {}, reglas: [], correcciones: [] };
    return F.labs[k] || null;
  }

  /* ---------- después de cada lectura: qué campos trajo y cómo se llamaban ---------- */
  // muestras: lo que devolvió la IA (con `laboratorio` y, desde la edge v14, `etiquetas` {clave: 'nombre y unidad tal cual el informe'})
  function registrar(tipo, muestras) {
    try {
      var F = datos() || { id: ID, labs: {} }, cambio = false;
      (muestras || []).forEach(function (m) {
        if (!m || !m.laboratorio) return;
        var L = labDe(F, m.laboratorio, true); if (!L) return;
        var T = L.tipos[tipo] = L.tipos[tipo] || { campos: {}, sinValor: [], observaciones: [] };
        Object.keys(m).forEach(function (k) {
          if (['laboratorio', 'etiquetas', 'observaciones', 'muestra', 'fecha'].indexOf(k) >= 0) return;
          var v = m[k], tiene = v != null && v !== '' && !(typeof v === 'object' && v && v.valor == null);
          if (tiene) { var et = (m.etiquetas && m.etiquetas[k]) || (v && typeof v === 'object' && v.unidad ? 'unidad ' + v.unidad : ''); if (et && T.campos[k] !== et) { T.campos[k] = et; cambio = true; } else if (!T.campos[k]) { T.campos[k] = ''; cambio = true; } }
        });
        if (m.observaciones) { var o = String(m.observaciones).slice(0, 240); if (T.observaciones.indexOf(o) < 0) { T.observaciones = T.observaciones.concat([o]).slice(-3); cambio = true; } }
        L.lecturas = (L.lecturas || 0) + 1; L.ultima = new Date().toISOString().slice(0, 10); cambio = true;
      });
      if (cambio) guardar(F);
    } catch (e) { /* la memoria de laboratorios nunca frena una lectura */ }
  }
  /* ---------- lo que el usuario corrigió a mano antes de guardar: la señal más valiosa ---------- */
  // cambios: [{ clave, ia, usuario }] (solo los que cambiaron)
  function corregir(tipo, laboratorio, cambios) {
    try {
      if (!laboratorio || !cambios || !cambios.length) return;
      var F = datos() || { id: ID, labs: {} }, L = labDe(F, laboratorio, true); if (!L) return;
      cambios.forEach(function (c) { L.correcciones.push({ tipo: tipo, clave: c.clave, ia: c.ia, usuario: c.usuario, fecha: new Date().toISOString().slice(0, 10) }); });
      L.correcciones = L.correcciones.slice(-30);
      guardar(F);
    } catch (e) { /* idem */ }
  }
  function reglaAMano(laboratorio, texto) {
    var F = datos() || { id: ID, labs: {} }, L = labDe(F, laboratorio, true); if (!L) return false;
    var t = String(texto || '').trim(); if (!t) return false;
    if (L.reglas.indexOf(t) < 0) L.reglas.push(t);
    return guardar(F);
  }
  function borrarRegla(laboratorio, i) { var F = datos(); var L = F && labDe(F, laboratorio); if (!L) return false; L.reglas.splice(i, 1); return guardar(F); }

  /* ---------- lo que se le manda a la IA antes de leer ---------- */
  function contexto(tipo) {
    var F = datos(); if (!F || !F.labs) return '';
    var partes = Object.keys(F.labs).map(function (k) {
      var L = F.labs[k], T = L.tipos && L.tipos[tipo], lineas = [];
      if (T && Object.keys(T.campos).length) lineas.push('trae: ' + Object.keys(T.campos).map(function (c) { return c + (T.campos[c] ? ' = "' + T.campos[c] + '"' : ''); }).join('; '));
      var corr = (L.correcciones || []).filter(function (c) { return c.tipo === tipo; }).slice(-8);
      if (corr.length) lineas.push('el usuario corrigió: ' + corr.map(function (c) { return c.clave + ' de ' + c.ia + ' a ' + c.usuario; }).join('; ') + ' (revisá ese dato con más cuidado)');
      if (L.reglas && L.reglas.length) lineas.push('reglas: ' + L.reglas.join(' | '));
      return lineas.length ? '- ' + L.nombre + ' (' + (L.lecturas || 0) + ' lecturas): ' + lineas.join('. ') : '';
    }).filter(Boolean);
    return partes.join('\n').slice(0, 6000);
  }

  /* ---------- pantalla (Lo que SAFIA aprendió) ---------- */
  var TIPO = { suelo: 'Suelo', agua: 'Agua', foliar: 'Hoja' };
  function html() {
    var F = datos(), labs = F && F.labs ? Object.keys(F.labs).map(function (k) { return F.labs[k]; }).sort(function (a, b) { return (b.lecturas || 0) - (a.lecturas || 0); }) : [];
    var h = '<div class="card" style="margin-top:14px;"><div class="card-h"><h3>Formatos de laboratorio que SAFIA ya conoce</h3><span class="muted">' + labs.length + ' laboratorio' + (labs.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="muted" style="font-size:12.5px;margin-bottom:8px;">Cada vez que se lee un informe, SAFIA anota qué campos trae ese laboratorio y cómo los llama; y cada vez que alguien corrige un valor a mano antes de guardar, anota la corrección. Todo eso se le pasa a la IA en la lectura siguiente. Las reglas a mano las escribe Irrigar (por ejemplo: "la columna H es acidez potencial en % de la CTC").</div>';
    if (!labs.length) h += '<div class="muted">Todavía no hay lecturas con laboratorio identificado.</div>';
    labs.forEach(function (L) {
      var k = claveLab(L.nombre);
      h += '<div style="border:1px solid #E1E4E7;border-radius:8px;padding:10px 12px;margin-top:8px;"><div style="font-weight:700;">' + esc(L.nombre) + ' <span class="muted" style="font-weight:400;">· ' + (L.lecturas || 0) + ' lectura' + (L.lecturas === 1 ? '' : 's') + (L.ultima ? ' · última ' + L.ultima.split('-').reverse().join('/') : '') + '</span></div>';
      Object.keys(L.tipos || {}).forEach(function (t) {
        var T = L.tipos[t], cs = Object.keys(T.campos || {});
        h += '<div style="font-size:12px;margin-top:4px;"><b>' + (TIPO[t] || t) + ':</b> ' + (cs.length ? cs.map(function (c) { return '<span class="badge gray" title="' + esc(T.campos[c]) + '">' + esc(c) + (T.campos[c] ? ' <span style="font-weight:400;">= ' + esc(T.campos[c]) + '</span>' : '') + '</span>'; }).join(' ') : '<span class="muted">sin campos</span>') + '</div>';
      });
      var corr = L.correcciones || [];
      if (corr.length) h += '<div style="font-size:12px;margin-top:4px;"><b>Correcciones a mano:</b> ' + corr.slice(-8).map(function (c) { return esc(c.clave) + ' ' + esc(c.ia) + ' → ' + esc(c.usuario) + ' (' + (TIPO[c.tipo] || c.tipo) + ', ' + String(c.fecha || '').split('-').reverse().join('/') + ')'; }).join('; ') + '</div>';
      if (L.reglas && L.reglas.length) h += '<div style="font-size:12px;margin-top:4px;"><b>Reglas:</b><ul style="margin:2px 0 0 18px;">' + L.reglas.map(function (r, i) { return '<li>' + esc(r) + (puedeEscribir() ? ' <button type="button" class="btn mini" data-lab="' + esc(k) + '" data-regla="' + i + '" style="padding:1px 6px;font-size:10.5px;">quitar</button>' : '') + '</li>'; }).join('') + '</ul></div>';
      if (puedeEscribir()) h += '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><input type="text" class="lab-regla" data-lab="' + esc(k) + '" placeholder="Regla a mano para este laboratorio (ej.: la columna H es acidez potencial en % de la CTC)" style="flex:1;min-width:240px;font-size:12px;"><button type="button" class="btn mini green lab-regla-ok" data-lab="' + esc(k) + '">Guardar regla</button></div>';
      h += '</div>';
    });
    return h + '</div>';
  }
  function montar(cont) {
    if (!cont) return;
    var pintar = function () {
      cont.innerHTML = html();
      cont.querySelectorAll('.lab-regla-ok').forEach(function (b) { b.addEventListener('click', function () { var inp = cont.querySelector('.lab-regla[data-lab="' + b.dataset.lab + '"]'); var F = datos(); var L = F && F.labs && F.labs[b.dataset.lab]; if (L && inp && reglaAMano(L.nombre, inp.value)) pintar(); }); });
      cont.querySelectorAll('button[data-regla]').forEach(function (b) { b.addEventListener('click', function () { var F = datos(); var L = F && F.labs && F.labs[b.dataset.lab]; if (L && borrarRegla(L.nombre, +b.dataset.regla)) pintar(); }); });
    };
    pintar();
    window.addEventListener('safia:datos', pintar);
  }

  /* ---------- valores que se deducen de otros (para que no queden casilleros vacíos) ---------- */
  // Suelo: H+Al = CTC pH 7 − (Ca + Mg + K) cuando el laboratorio no lo da en cmolc/dm³ (algunos informan "H" en % de la CTC)
  function completarSuelo(m) {
    if (!m) return m;
    var n = function (v) { var x = parseFloat(v); return isNaN(x) ? null : x; };
    var cic = n(m.cic), ca = n(m.calcio != null ? m.calcio : m.ca), mg = n(m.magnesio != null ? m.magnesio : m.mg), k = n(m.potasio != null ? m.potasio : m.k);
    var hal = n(m.h_al != null ? m.h_al : m.hAl);
    if (hal == null && cic != null && ca != null && mg != null && k != null && cic > ca + mg + k) {
      var v = Math.round((cic - ca - mg - k) * 100) / 100;
      if ('hAl' in m || m.ca != null) m.hAl = v; else m.h_al = v;
      m.observaciones = (m.observaciones ? m.observaciones + ' · ' : '') + 'H+Al ' + v + ' cmolc/dm³ calculado por SAFIA como CTC pH 7 − (Ca + Mg + K)';
    }
    return m;
  }

  window.SafiaLabFormatos = { registrar: registrar, corregir: corregir, contexto: contexto, html: html, montar: montar, completarSuelo: completarSuelo, datos: datos, reglaAMano: reglaAMano, claveLab: claveLab };
})();
