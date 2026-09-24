/* SAFIA — Seguimiento de la meta de rinde durante la campaña
   -------------------------------------------------------------------
   El plan de "Meta de rinde" se guarda en la campaña (campañas → cultivo:
   rendimientoObj = meta, planMeta = { kgHa, base, fecha, items[] }) y desde
   ahí SAFIA lo sigue mientras el cultivo crece:
   - Suelo y manejo: lista de ítems del plan para tildar a medida que se
     hacen (encalado, P, K, boro, inoculación…), con fecha.
   - Agua: balance hídrico por etapa de esta campaña (SafiaAgua): rinde
     perdido hasta hoy y aviso del consultor de agua.
   - Planta: vigor satelital contra la mejor campaña del lote al mismo
     estadio (SafiaNDVI, consultor en vivo).
   - Nutrición: último análisis foliar o de sensor desde la siembra.
   - Semáforo general y, al cosechar, meta vs rinde real.
   Depende de window.SafiaBanco (campoActual, leer, guardar, toast). */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function hoyISO() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }   // hoy en hora local (Paraguay), no UTC
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  // caso.id = '<campanaId>-<i>' (cosechada) o 'nueva_<campanaId>_<i>' (nueva)
  function ubicar(caso) {
    if (!caso) return null;
    var m = String(caso.id).match(/^nueva_(.+)_(\d+)$/) || String(caso.id).match(/^(.+)-(\d+)$/);
    if (!m) return null;
    var camp = B().leer('campanas').find(function (c) { return String(c.id) === String(m[1]); });
    if (!camp || !camp.cultivos || !camp.cultivos[+m[2]]) return null;
    return { campanaId: camp.id, idx: +m[2], campana: camp, cultivo: camp.cultivos[+m[2]] };
  }
  function planDe(caso) { var u = ubicar(caso); return u && u.cultivo.planMeta ? { u: u, plan: u.cultivo.planMeta } : null; }
  function guardarCampana(u, fn) {
    var todas = B().leer('campanas'), i = todas.findIndex(function (c) { return String(c.id) === String(u.campanaId); });
    if (i < 0) return false;
    fn(todas[i].cultivos[u.idx], todas[i]);
    todas[i].fechaModificacion = new Date().toISOString();
    B().guardar('campanas', todas); return true;
  }
  // Guarda la meta y el plan (ítems con costo o acción) en la campaña
  function guardarMeta(caso, meta, pl) {
    var u = ubicar(caso); if (!u) { B().toast('No encontré la campaña para guardar la meta', true); return false; }
    var previo = u.cultivo.planMeta || {};
    var hechos = {}; (previo.items || []).forEach(function (it) { if (it.hecho) hechos[it.k] = it; });
    var items = pl.items.filter(function (i) { return (i.inversion || i.recurrente || i.tipo === 'manejo') && i.k !== 'n_soja'; }).map(function (i) {
      return { k: i.k, nombre: i.nombre, tipo: i.tipo, accion: String(i.accion || '').slice(0, 220), objetivo: String(i.objetivo || '').slice(0, 120), costo: Math.round((i.inversion || 0) + (i.recurrente || 0)), hecho: !!(hechos[i.k] && hechos[i.k].hecho), fechaHecho: hechos[i.k] ? hechos[i.k].fechaHecho || null : null };
    });
    var ok = guardarCampana(u, function (cu) {
      cu.rendimientoObj = meta;
      cu.planMeta = { kgHa: meta, base: caso.rindeKgHa, baseCampana: caso.baseCampana || caso.campana, fecha: previo.fecha || hoyISO(), actualizado: hoyISO(), potencial: pl.potencial ? { min: pl.potencial.min, max: pl.potencial.max } : null, inversion: pl.economia ? Math.round(pl.economia.inversionTotal) : null, recurrente: pl.economia ? Math.round(pl.economia.recurrenteCultivo + pl.economia.recurrenteLote) : null, items: items };
    });
    return ok;
  }
  function marcar(caso, k, hecho) {
    var u = ubicar(caso); if (!u || !u.cultivo.planMeta) return;
    guardarCampana(u, function (cu) { var it = (cu.planMeta.items || []).find(function (x) { return x.k === k; }); if (it) { it.hecho = !!hecho; it.fechaHecho = hecho ? hoyISO() : null; } });
  }
  function quitarMeta(caso) { var u = ubicar(caso); if (!u) return; guardarCampana(u, function (cu) { delete cu.planMeta; }); }

  /* ---------- indicadores en vivo ---------- */
  function lote(caso) { return B().leer('equipos').find(function (e) { return String(e.id) === String(caso.equipoId); }) || null; }
  function campoDe() { return B().campoActual(); }
  function notaDe(html) { var d = document.createElement('div'); d.innerHTML = html; var n = d.querySelector('.note'); return n ? n.innerHTML : ''; }
  function indicadorAgua(caso, u) {
    if (!window.SafiaAgua || !u.cultivo.fechaSiembra) return Promise.resolve(null);
    var l = lote(caso); if (!l) return Promise.resolve(null);
    var camp = SafiaAgua.campanasDelLote(l.id).find(function (c) { return c.id === String(u.campanaId) + '_' + u.idx; });
    if (!camp) return Promise.resolve(null);
    return SafiaAgua.calcular(campoDe(), l, camp).then(function (res) {
      var hasta = res.dias.filter(function (d) { return !d.pronostico; });
      return { perdidaPct: res.perdidaPct, estresDias: hasta.filter(function (d) { return d.ks < 1; }).length, dias: hasta.length, hoy: res.hoy, pronostico: res.pronostico, etapa: hasta.length ? hasta[hasta.length - 1].etapa : null, k: res.perdidaPct >= 8 ? 'rojo' : (res.perdidaPct >= 3 || (res.hoy && (res.hoy.ks < 1 || (res.pronostico && res.pronostico.cruzaRecarga))) ? 'ambar' : 'verde') };
    }).catch(function () { return null; });
  }
  function indicadorPlanta(caso, u) {
    if (!window.SafiaNDVI || !u.cultivo.fechaSiembra) return { k: 'gris', texto: 'Sin fecha de siembra o sin módulo satelital.' };
    var l = lote(caso); if (!l) return { k: 'gris', texto: '' };
    var serie = SafiaNDVI.serieDe(l.id) || [];
    var desde = String(u.cultivo.fechaSiembra).slice(0, 10), puntos = serie.filter(function (p) { return p.fecha >= desde && !(p.nubes_pct > 40); });
    if (!puntos.length) return { k: 'gris', texto: 'Todavía no hay pasadas del satélite desde la siembra (Vigor satelital → Traer del satélite).' };
    var ult = puntos[puntos.length - 1], nota = notaDe(SafiaNDVI.htmlCampanas(l, serie));
    var k = /abajo/.test(nota) ? 'rojo' : (/arriba/.test(nota) ? 'verde' : (/parejo/.test(nota) ? 'verde' : 'ambar'));
    return { k: k, ndvi: ult.ndvi, fecha: ult.fecha, texto: nota ? nota.replace(/<br>.*$/s, '') : ('Última pasada ' + fmtF(ult.fecha) + ': NDVI ' + fmt(ult.ndvi, 2) + '. Sin campaña de referencia cosechada del mismo cultivo para comparar.') };
  }
  function indicadorNutricion(caso, u) {
    if (!window.SafiaFoliar) return null;
    var desde = String(u.cultivo.fechaSiembra || '').slice(0, 10);
    var l = SafiaFoliar.lista().filter(function (a) { return String(a.equipoId || '') === String(caso.equipoId || '') && (!desde || String(a.fecha) >= desde); });
    if (!l.length) return { k: 'gris', texto: 'Sin análisis foliar ni lectura de sensor desde la siembra. Muestrear en floración (soja: 3er trifolio) o medir con el Dualex.' };
    var a = l[l.length - 1], li = SafiaFoliar.interpretar(a), bajos = li.filter(function (i) { return i.estado === 'bajo' || i.estado === 'limite'; });
    return { k: bajos.some(function (i) { return i.estado === 'bajo'; }) ? 'rojo' : (bajos.length ? 'ambar' : 'verde'), fecha: a.fecha, texto: (a.tipo === 'sensor' ? 'Sensor ' : 'Hoja ') + fmtF(a.fecha) + ': ' + (bajos.length ? 'faltan ' + bajos.map(function (i) { return i.n.replace(/\s*\(.*$/, ''); }).join(', ') : 'todo dentro del rango') + '.' };
  }
  var COLOR = { verde: '#178029', ambar: '#B8731A', rojo: '#B3261E', gris: '#8C9196' };
  var NOMBRE_ETAPA = { veg: 'vegetativa', flor: 'floración', llen: 'llenado', mad: 'maduración' };
  function semaforo(k, t) { return '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + (COLOR[k] || COLOR.gris) + ';margin-right:6px;vertical-align:-1px;"></span><b>' + esc(t) + '</b>'; }

  /* ---------- HTML del seguimiento ---------- */
  function html(caso, cont) {
    var pm = planDe(caso); if (!pm) { cont.innerHTML = ''; return; }
    var u = pm.u, plan = pm.plan, real = num(u.cultivo.rendimientoReal);
    var items = plan.items || [], hechos = items.filter(function (i) { return i.hecho; }).length, pctH = items.length ? Math.round(hechos / items.length * 100) : 0;
    var h = '<div class="card" style="margin-top:14px;" id="segCard"><div class="card-h"><h3>Seguimiento de la meta: ' + esc(caso.cultivo) + ' ' + esc(u.campana.nombre || '') + ' → ' + fmt(plan.kgHa) + ' kg/ha</h3><span class="muted">guardada el ' + fmtF(plan.fecha) + ' · parte de ' + fmt(plan.base) + ' kg/ha (' + esc(plan.baseCampana || '') + ')</span></div>';
    if (real) {
      var pct = Math.round(real / plan.kgHa * 100);
      h += '<div class="note ' + (pct >= 100 ? 'ok' : (pct >= 90 ? 'info' : 'warn')) + '"><b>Campaña cosechada: ' + fmt(real) + ' kg/ha contra una meta de ' + fmt(plan.kgHa) + ' (' + pct + ' %)</b>' + (pct >= 100 ? '. Meta cumplida.' : '. Faltaron ' + fmt(plan.kgHa - real) + ' kg/ha; abajo queda qué se hizo y qué no del plan, y los indicadores de la campaña para entender por qué.') + '</div>';
    }
    h += '<div class="statbar" style="margin:8px 0;"><div class="stat"><div class="sl">Meta</div><div class="sv green">' + fmt(plan.kgHa) + '</div><div class="ss">kg/ha</div></div><div class="stat"><div class="sl">Plan hecho</div><div class="sv">' + hechos + ' / ' + items.length + '</div><div class="ss">' + pctH + ' % de los ítems</div></div>' + (plan.potencial ? '<div class="stat"><div class="sl">Potencial del plan</div><div class="sv">' + fmt(plan.potencial.min) + ' – ' + fmt(plan.potencial.max) + '</div></div>' : '') + (plan.inversion != null ? '<div class="stat"><div class="sl">Inversión + gasto</div><div class="sv">US$ ' + fmt(plan.inversion) + ' + ' + fmt(plan.recurrente) + '</div><div class="ss">por ha</div></div>' : '') + '</div>';
    h += '<div id="segIndicadores"><div class="muted">Calculando agua, planta y nutrición…</div></div>';
    h += '<h3 style="font-size:14px;margin:14px 0 6px;">Qué hay que hacer (tildá lo que ya se hizo)</h3><div>' +
      items.map(function (i) { return '<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 6px;border-bottom:1px solid rgba(0,0,0,.07);cursor:pointer;' + (i.hecho ? 'background:#E7F6EA;' : '') + '"><input type="checkbox" class="segChk" data-k="' + esc(i.k) + '"' + (i.hecho ? ' checked' : '') + ' style="margin-top:3px;"><div style="flex:1;min-width:0;"><div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;"><b>' + esc(i.nombre) + '</b><span class="muted" style="font-size:11px;">' + esc(i.tipo || '') + '</span><span style="margin-left:auto;font-size:12px;white-space:nowrap;">' + (i.costo ? 'US$ ' + fmt(i.costo) + '/ha' : 'sin costo') + (i.fechaHecho ? ' · hecho el ' + fmtF(i.fechaHecho) : '') + '</span></div><div style="font-size:13px;margin-top:3px;">' + esc(i.accion) + '</div><div class="muted" style="font-size:12px;margin-top:2px;">Objetivo: ' + esc(i.objetivo) + '</div></div></label>'; }).join('') + '</div>';
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Los ítems salen del plan guardado; si recalculás y volvés a guardar, se actualizan y lo tildado se conserva. Cuando cargues los insumos reales en Campañas → Manejo e insumos, la comparación es contra lo que efectivamente se aplicó.</div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;"><button class="btn" id="btnSegQuitar">Quitar la meta de esta campaña</button></div></div>';
    cont.innerHTML = h;
    cont.querySelectorAll('.segChk').forEach(function (c) { c.addEventListener('change', function () { marcar(caso, c.dataset.k, c.checked); html(caso, cont); }); });
    $('btnSegQuitar').addEventListener('click', function () { if ($('btnSegQuitar').dataset.c) { quitarMeta(caso); B().toast('Meta quitada de la campaña'); html(caso, cont); } else { $('btnSegQuitar').dataset.c = '1'; $('btnSegQuitar').textContent = '¿Seguro? Tocá de nuevo para quitar'; } });
    // indicadores en vivo
    var pl = indicadorPlanta(caso, u), nu = indicadorNutricion(caso, u);
    indicadorAgua(caso, u).then(function (ag) {
      var ind = $('segIndicadores'); if (!ind) return;
      var suelo = { k: pctH >= 80 ? 'verde' : (pctH >= 40 ? 'ambar' : (items.length ? 'rojo' : 'gris')), texto: items.length ? hechos + ' de ' + items.length + ' ítems del plan hechos (' + pctH + ' %).' : 'El plan no tiene ítems.' };
      var general = [suelo, ag, pl, nu].filter(function (x) { return x && x.k !== 'gris'; });
      var kG = general.some(function (x) { return x.k === 'rojo'; }) ? 'rojo' : (general.some(function (x) { return x.k === 'ambar'; }) ? 'ambar' : (general.length ? 'verde' : 'gris'));
      var txtG = kG === 'verde' ? 'La campaña viene en línea con la meta.' : (kG === 'ambar' ? 'Hay puntos para atender esta semana.' : (kG === 'rojo' ? 'Hay algo que ya está costando rinde: mirá los indicadores en rojo.' : 'Todavía faltan datos de la campaña (satélite, agua, hoja).'));
      var filas = [
        ['Suelo y manejo', suelo],
        ['Agua', ag ? { k: ag.k, texto: (ag.dias ? ag.dias + ' días desde la siembra' + (ag.etapa ? ' (' + NOMBRE_ETAPA[ag.etapa] + ')' : '') + ' · rinde perdido por agua hasta hoy ' + fmt(ag.perdidaPct, 1) + ' % · ' + ag.estresDias + ' día(s) con estrés. ' : '') + (ag.hoy ? (ag.hoy.ks < 1 ? 'Hoy el cultivo está en estrés: regar ' + fmt(ag.hoy.dr) + ' mm.' : 'Hoy hay ' + fmt(ag.hoy.disponible) + ' mm disponibles; faltan ' + fmt(ag.hoy.faltaParaRecarga) + ' mm para la recarga' + (ag.pronostico && ag.pronostico.cruzaRecarga ? ' y con el pronóstico se llega el ' + fmtF(ag.pronostico.cruzaRecarga) + ': programar el riego.' : '.')) : '') } : { k: 'gris', texto: 'Sin fecha de siembra o sin datos de clima todavía.' }],
        ['Planta (satélite)', pl],
        ['Nutrición (hoja / sensor)', nu || { k: 'gris', texto: '' }]
      ];
      ind.innerHTML = '<div class="note ' + (kG === 'rojo' || kG === 'ambar' ? 'warn' : 'info') + '" style="border-left-color:' + COLOR[kG] + ';">' + semaforo(kG, 'Estado general') + ' · ' + esc(txtG) + '</div>' +
        '<div>' + filas.map(function (f) { return '<div style="padding:8px 6px;border-bottom:1px solid rgba(0,0,0,.07);"><div>' + semaforo(f[1].k, f[0]) + '</div><div style="font-size:12.5px;margin-top:3px;">' + (f[1].texto || '') + '</div></div>'; }).join('') + '</div>';
    });
  }

  window.SafiaSeguimiento = { ubicar: ubicar, planDe: planDe, guardarMeta: guardarMeta, marcar: marcar, quitarMeta: quitarMeta, html: html };
})();
