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
  function L(k) { if (window.SafiaBanco && SafiaBanco.leer) return SafiaBanco.leer(k); try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
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
    var camp = L('campanas').find(function (c) { return String(c.id) === String(m[1]); });
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
      return { k: i.k, nombre: i.nombre, tipo: i.tipo, accion: String(i.accion || '').slice(0, 220), objetivo: String(i.objetivo || '').slice(0, 120), costo: Math.round((i.inversion || 0) + (i.recurrente || 0)), aporteMin: i.aporteMin || 0, aporteMax: i.aporteMax || 0, hecho: !!(hechos[i.k] && hechos[i.k].hecho), fechaHecho: hechos[i.k] ? hechos[i.k].fechaHecho || null : null };
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
  /* ---------- META VIVA: ¿la meta guardada sigue alcanzable con lo que ya pasó? ----------
     Cada ítem del plan tiene una ventana (hasta cuándo se puede hacer). Si la ventana pasó y no
     se hizo (tildado o detectado en los insumos cargados), su aporte se descuenta del potencial.
     La falta de agua descuenta lo que ya calculó el motor FAO-33 por etapa. */
  var VENTANA = { pre: ['encalado', 'yeso', 'subsolado', 'nivelacion', 'directa', 'cobertura', 'rotacion', 'variedad', 'reposicion', 'zinc_suelo', 'cobre', 'boro', 'otros'], siembra: ['fosforo', 'potasio', 'azufre', 'inoculacion', 'coinoculacion', 'como', 'tratamiento', 'stand', 'zinc'], veg: ['nitrogeno'], repro: ['fungicidas', 'foliar', 'agua'] };
  var NOMBRE_VENTANA = { pre: 'antes de sembrar', siembra: 'a la siembra (hasta 10 días)', veg: 'en vegetativo', repro: 'en floración y llenado' };
  var APORTE_DEF = { encalado: [0.05, 0.12], yeso: [0.03, 0.10], fosforo: [0.05, 0.15], potasio: [0.05, 0.15], reposicion: [0.02, 0.06], nitrogeno: [0.05, 0.15], azufre: [0.02, 0.06], boro: [0.03, 0.08], zinc_suelo: [0.02, 0.06], cobre: [0.01, 0.04], como: [0.02, 0.05], zinc: [0.02, 0.06], inoculacion: [0.05, 0.15], coinoculacion: [0.05, 0.10], tratamiento: [0.03, 0.08], cobertura: [0.05, 0.15], subsolado: [0.02, 0.08], nivelacion: [0.01, 0.05], otros: [0, 0.03], directa: [0.03, 0.08], fungicidas: [0.05, 0.15] };
  function ventanaDe(k) { for (var v in VENTANA) if (VENTANA[v].indexOf(k) >= 0) return v; return 'repro'; }
  function aporteDe(it) { if (it.aporteMax) return [it.aporteMin || 0, it.aporteMax]; return APORTE_DEF[it.k] || [0, 0]; }
  function diasDesde(f) { if (!f) return null; return Math.round((new Date(hoyISO() + 'T12:00:00') - new Date(String(f).slice(0, 10) + 'T12:00:00')) / 86400000); }
  // etapa de hoy: la del motor de agua si está; si no, por días desde la siembra
  function etapaHoy(dds, ag) { if (ag && ag.etapa) return ag.etapa; if (dds == null || dds < 0) return 'pre'; return dds <= 45 ? 'veg' : (dds <= 75 ? 'flor' : (dds <= 110 ? 'llen' : 'mad')); }
  // ventana pasada / abierta ahora según la etapa de hoy
  function estadoVentana(v, etapa, dds) {
    var orden = { pre: 0, veg: 1, flor: 2, llen: 3, mad: 4 }[etapa] || 0;
    if (v === 'pre') return orden > 0 ? 'pasada' : 'ahora';
    if (v === 'siembra') return orden === 0 ? 'futura' : (dds != null && dds > 10 ? 'pasada' : 'ahora');
    if (v === 'veg') return orden === 0 ? 'futura' : (orden === 1 ? 'ahora' : 'pasada');
    return orden < 2 ? 'futura' : (orden === 4 ? 'pasada' : 'ahora');   // repro
  }
  // lo hecho que se detecta solo por los insumos cargados (ficha / Campañas / Operador)
  function hechoPorInsumos(k, manejo, bal, cu) {
    if (!manejo) return false;
    var t = function (p) { return manejo[p] > 0; };
    switch (k) {
      case 'fungicidas': return t('fungicidas');
      case 'inoculacion': return t('inoculacion') || t('inoculacionSurco');
      case 'coinoculacion': return t('coinoculacion');
      case 'tratamiento': return t('tratamientoSemilla');
      case 'como': case 'zinc': return t('microSemilla') || t('foliares');
      case 'foliar': return t('foliares');
      case 'encalado': case 'yeso': return t('encalado');
      case 'nitrogeno': return !!(manejo.npk && manejo.npk.n >= 20);
      case 'fosforo': case 'reposicion': return !!(bal && bal.aplicado.p2o5 >= bal.exportado.p2o5 * 0.9);
      case 'potasio': return !!(bal && bal.aplicado.k2o >= bal.exportado.k2o * 0.9);
      case 'directa': return /directa/i.test(String(cu && cu.sistemaSiembra || ''));
      default: return false;
    }
  }
  function metaViva(u, ag) {
    var plan = u.cultivo.planMeta; if (!plan || !plan.kgHa) return null;
    var cu = u.cultivo, camp = u.campana, meta = plan.kgHa, base = plan.base || meta, pot = plan.potencial || { min: base, max: base };
    var dds = diasDesde(cu.fechaSiembra), etapa = etapaHoy(dds, ag);
    var ins = (camp.insumos || []).filter(function (i) { return i.cultivoIdx == null || i.cultivoIdx === u.idx; });
    var manejo = window.SafiaInsumos ? SafiaInsumos.resumen(ins, [], camp.manejoCompleto) : null;
    var bal = window.SafiaNutrientes ? SafiaNutrientes.balanceCampana(camp, u.idx) : null;
    var perdidos = [], ahora = [], futuros = [], hechos = 0, items = plan.items || [], perdMin = 0, perdMax = 0;
    var sabemos = !!((manejo && manejo.cargado) || items.some(function (it) { return it.hecho; }));   // "no cargado" no es "no hecho"
    items.forEach(function (it) {
      var auto = !it.hecho && hechoPorInsumos(it.k, manejo, bal, cu), hecho = it.hecho || auto;
      it._auto = !!auto;
      if (hecho) { hechos++; return; }
      var v = ventanaDe(it.k), st = estadoVentana(v, etapa, dds), ap = aporteDe(it);
      if (st === 'pasada') { if (ap[1] > 0 && sabemos) { perdidos.push({ it: it, ap: ap, v: v }); perdMin += ap[0]; perdMax += ap[1]; } }
      else if (st === 'ahora') ahora.push({ it: it, v: v }); else futuros.push({ it: it, v: v });
    });
    var max = pot.max - base * perdMin, min = pot.min - base * perdMax;   // optimista: lo perdido aportaba lo mínimo; pesimista: lo máximo
    var agua = ag && ag.perdidaPct > 0 ? ag.perdidaPct : 0;
    if (agua) { min *= (1 - agua / 100); max *= (1 - agua / 100); }
    if (min > max) min = max;
    min = Math.round(min / 10) * 10; max = Math.round(max / 10) * 10;
    var k = !sabemos ? 'gris' : (meta <= min ? 'verde' : (meta <= max ? 'ambar' : 'rojo'));
    var nutri = null;
    if (bal && bal.enVivo) {
      var faltaP = bal.exportado.p2o5 - bal.aplicado.p2o5, faltaK = bal.exportado.k2o - bal.aplicado.k2o;
      if (bal.aplicado.items && (faltaP > 10 || faltaK > 10)) nutri = { k: etapa === 'veg' || etapa === 'pre' ? 'ambar' : 'rojo', texto: 'La fertilización cargada no cubre lo que se llevará la meta: faltan ' + (faltaP > 10 ? fmt(faltaP) + ' kg/ha de P₂O₅' : '') + (faltaP > 10 && faltaK > 10 ? ' y ' : '') + (faltaK > 10 ? fmt(faltaK) + ' kg/ha de K₂O' : '') + (etapa === 'veg' || etapa === 'pre' ? '. Todavía se puede completar en cobertura o por fertirriego.' : '. Ya pasó el momento de aplicar: queda para la próxima campaña.') };
      else if (bal.aplicado.items) nutri = { k: 'verde', texto: 'La fertilización cargada cubre lo que se llevará la meta (P₂O₅ ' + fmt(bal.aplicado.p2o5) + ' de ' + fmt(bal.exportado.p2o5) + ' · K₂O ' + fmt(bal.aplicado.k2o) + ' de ' + fmt(bal.exportado.k2o) + ' kg/ha).' };
      else nutri = { k: 'gris', texto: 'Sin fertilizantes cargados en la campaña: cargalos en la ficha (paso 3) para saber si alcanzan para la meta.' };
    }
    return { meta: meta, base: base, min: min, max: max, k: k, sabemos: sabemos, etapa: etapa, dds: dds, agua: agua, perdidos: perdidos, ahora: ahora, futuros: futuros, hechos: hechos, total: items.length, nutri: nutri };
  }
  function htmlMetaViva(mv) {
    if (!mv) return '';
    var titulo = mv.k === 'gris' ? 'Meta de ' + fmt(mv.meta) + ' kg/ha: SAFIA todavía no sabe qué se hizo' : (mv.k === 'verde' ? 'La meta de ' + fmt(mv.meta) + ' kg/ha sigue alcanzable' : (mv.k === 'ambar' ? 'La meta de ' + fmt(mv.meta) + ' kg/ha todavía es posible, pero depende de lo que falta' : 'La meta de ' + fmt(mv.meta) + ' kg/ha ya no se alcanza con lo estimado'));
    var h = '<div class="note ' + (mv.k === 'verde' ? 'ok' : (mv.k === 'gris' ? 'info' : 'warn')) + '" style="border-left-color:' + COLOR[mv.k] + ';margin:8px 0;">' + semaforo(mv.k, titulo) +
      '<div style="font-size:12.5px;margin-top:4px;">Potencial hoy: <b>' + fmt(mv.min) + ' – ' + fmt(mv.max) + ' kg/ha</b> · ' + (mv.dds != null && mv.dds >= 0 ? 'día ' + mv.dds + ' desde la siembra (' + (NOMBRE_ETAPA[mv.etapa] || mv.etapa) + ')' : 'todavía sin sembrar') + ' · plan hecho ' + mv.hechos + ' de ' + mv.total + '.</div>';
    var causas = [];
    if (!mv.sabemos) h += '<div style="font-size:12.5px;margin-top:6px;">No hay insumos cargados ni ítems tildados en esta campaña. Cargá lo aplicado en la ficha (paso 3) o tildá abajo lo que ya se hizo, y la meta viva empieza a orientar.</div>';
    if (mv.agua) causas.push('Falta de agua: −' + fmt(mv.agua, 1) + ' % (FAO-33, por etapa).');
    mv.perdidos.forEach(function (p) { causas.push(esc(p.it.nombre) + ': no se hizo ' + NOMBRE_VENTANA[p.v] + ' y ya pasó la ventana (se pierde ' + fmt(p.ap[0] * 100) + ' a ' + fmt(p.ap[1] * 100) + ' %).'); });
    if (mv.nutri && mv.nutri.k === 'rojo') causas.push(mv.nutri.texto);
    if (causas.length) h += '<div style="font-size:12.5px;margin-top:6px;"><b>Qué está costando rinde:</b><ul style="margin:4px 0 0 18px;padding:0;">' + causas.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul></div>';
    var hacer = mv.ahora.map(function (a) { return '<li><b>' + esc(a.it.nombre) + '</b> (' + NOMBRE_VENTANA[a.v] + '): ' + esc(a.it.accion) + '</li>'; });
    if (mv.nutri && mv.nutri.k === 'ambar') hacer.push('<li>' + mv.nutri.texto + '</li>');
    if (hacer.length) h += '<div style="font-size:12.5px;margin-top:6px;"><b>Qué toca ahora:</b><ul style="margin:4px 0 0 18px;padding:0;">' + hacer.join('') + '</ul></div>';
    else if (mv.futuros.length) h += '<div style="font-size:12.5px;margin-top:6px;"><b>Próximo:</b> ' + mv.futuros.slice(0, 3).map(function (f) { return esc(f.it.nombre) + ' (' + NOMBRE_VENTANA[f.v] + ')'; }).join(' · ') + '.</div>';
    if (mv.nutri && mv.nutri.k !== 'rojo' && mv.nutri.k !== 'ambar') h += '<div class="muted" style="font-size:12px;margin-top:6px;">' + mv.nutri.texto + '</div>';
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Lo hecho se toma de lo que tildás y de los insumos cargados (ficha, Campañas, Operador). Estimación orientativa, no prescripción.</div></div>';
    return h;
  }
  // Resumen corto para el Dashboard (sin motor de agua): { k, texto }
  function resumenMetaViva(camp, idx) {
    var cu = camp && camp.cultivos ? camp.cultivos[idx || 0] : null; if (!cu || !cu.planMeta || cu.rendimientoReal) return null;
    var mv = metaViva({ campanaId: camp.id, idx: idx || 0, campana: camp, cultivo: cu }, null); if (!mv) return null;
    return { k: mv.k, min: mv.min, max: mv.max, texto: (mv.k === 'verde' ? 'sigue alcanzable' : (mv.k === 'ambar' ? 'todavía posible' : 'ya no se alcanza')) + ' · potencial ' + fmt(mv.min) + '–' + fmt(mv.max) + (mv.ahora.length ? ' · ahora: ' + mv.ahora.slice(0, 2).map(function (a) { return a.it.nombre; }).join(', ') : '') };
  }
  var COLOR = { verde: '#178029', ambar: '#B8731A', rojo: '#B3261E', gris: '#8C9196' };
  var NOMBRE_ETAPA = { veg: 'vegetativa', flor: 'floración', llen: 'llenado', mad: 'maduración' };
  function semaforo(k, t) { return '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + (COLOR[k] || COLOR.gris) + ';margin-right:6px;vertical-align:-1px;"></span><b>' + esc(t) + '</b>'; }

  /* ---------- HTML del seguimiento ---------- */
  function html(caso, cont) {
    var pm = planDe(caso); if (!pm) { cont.innerHTML = ''; return; }
    var u = pm.u, plan = pm.plan, real = num(u.cultivo.rendimientoReal);
    var items = plan.items || [];
    if (!real) metaViva(u, null);   // marca _auto en los ítems detectados por los insumos cargados
    var hechos = items.filter(function (i) { return i.hecho || i._auto; }).length, pctH = items.length ? Math.round(hechos / items.length * 100) : 0;
    var h = '<div class="card" style="margin-top:14px;" id="segCard"><div class="card-h"><h3>Seguimiento de la meta: ' + esc(caso.cultivo) + ' ' + esc(u.campana.nombre || '') + ' → ' + fmt(plan.kgHa) + ' kg/ha</h3><span class="muted">guardada el ' + fmtF(plan.fecha) + ' · parte de ' + fmt(plan.base) + ' kg/ha (' + esc(plan.baseCampana || '') + ')</span></div>';
    if (real) {
      var pct = Math.round(real / plan.kgHa * 100);
      h += '<div class="note ' + (pct >= 100 ? 'ok' : (pct >= 90 ? 'info' : 'warn')) + '"><b>Campaña cosechada: ' + fmt(real) + ' kg/ha contra una meta de ' + fmt(plan.kgHa) + ' (' + pct + ' %)</b>' + (pct >= 100 ? '. Meta cumplida.' : '. Faltaron ' + fmt(plan.kgHa - real) + ' kg/ha; abajo queda qué se hizo y qué no del plan, y los indicadores de la campaña para entender por qué.') + '</div>';
    }
    h += '<div class="statbar" style="margin:8px 0;"><div class="stat"><div class="sl">Meta</div><div class="sv green">' + fmt(plan.kgHa) + '</div><div class="ss">kg/ha</div></div><div class="stat"><div class="sl">Plan hecho</div><div class="sv">' + hechos + ' / ' + items.length + '</div><div class="ss">' + pctH + ' % de los ítems</div></div>' + (plan.potencial ? '<div class="stat"><div class="sl">Potencial del plan</div><div class="sv">' + fmt(plan.potencial.min) + ' – ' + fmt(plan.potencial.max) + '</div></div>' : '') + (plan.inversion != null ? '<div class="stat"><div class="sl">Inversión + gasto</div><div class="sv">US$ ' + fmt(plan.inversion) + ' + ' + fmt(plan.recurrente) + '</div><div class="ss">por ha</div></div>' : '') + '</div>';
    h += '<div id="segMetaViva"></div><div id="segIndicadores"><div class="muted">Calculando agua, planta y nutrición…</div></div>';
    h += '<h3 style="font-size:14px;margin:14px 0 6px;">Qué hay que hacer (tildá lo que ya se hizo)</h3><div>' +
      items.map(function (i) { return '<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 6px;border-bottom:1px solid rgba(0,0,0,.07);cursor:pointer;' + (i.hecho || i._auto ? 'background:#E7F6EA;' : '') + '"><input type="checkbox" class="segChk" data-k="' + esc(i.k) + '"' + (i.hecho || i._auto ? ' checked' : '') + (i._auto && !i.hecho ? ' disabled title="Detectado en los insumos cargados"' : '') + ' style="margin-top:3px;"><div style="flex:1;min-width:0;"><div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;"><b>' + esc(i.nombre) + '</b><span class="muted" style="font-size:11px;">' + esc(i.tipo || '') + '</span><span style="margin-left:auto;font-size:12px;white-space:nowrap;">' + (i.costo ? 'US$ ' + fmt(i.costo) + '/ha' : 'sin costo') + (i.fechaHecho ? ' · hecho el ' + fmtF(i.fechaHecho) : (i._auto && !i.hecho ? ' · cargado en insumos' : '')) + '</span></div><div style="font-size:13px;margin-top:3px;">' + esc(i.accion) + '</div><div class="muted" style="font-size:12px;margin-top:2px;">Objetivo: ' + esc(i.objetivo) + '</div></div></label>'; }).join('') + '</div>';
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Los ítems salen del plan guardado; si recalculás y volvés a guardar, se actualizan y lo tildado se conserva. Cuando cargues los insumos reales en Campañas → Manejo e insumos, la comparación es contra lo que efectivamente se aplicó.</div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;"><button class="btn" id="btnSegQuitar">Quitar la meta de esta campaña</button></div></div>';
    cont.innerHTML = h;
    cont.querySelectorAll('.segChk').forEach(function (c) { c.addEventListener('change', function () { marcar(caso, c.dataset.k, c.checked); html(caso, cont); }); });
    $('btnSegQuitar').addEventListener('click', function () { if ($('btnSegQuitar').dataset.c) { quitarMeta(caso); B().toast('Meta quitada de la campaña'); html(caso, cont); } else { $('btnSegQuitar').dataset.c = '1'; $('btnSegQuitar').textContent = '¿Seguro? Tocá de nuevo para quitar'; } });
    // indicadores en vivo
    var pl = indicadorPlanta(caso, u), nu = indicadorNutricion(caso, u);
    indicadorAgua(caso, u).then(function (ag) {
      var ind = $('segIndicadores'); if (!ind) return;
      if (!real) { var mv = metaViva(u, ag), mvEl = $('segMetaViva'); if (mvEl) mvEl.innerHTML = htmlMetaViva(mv); }
      var suelo = { k: pctH >= 80 ? 'verde' : (pctH >= 40 ? 'ambar' : (items.length ? 'rojo' : 'gris')), texto: items.length ? hechos + ' de ' + items.length + ' ítems del plan hechos (' + pctH + ' %).' : 'El plan no tiene ítems.' };
      var general = [suelo, ag, pl, nu].filter(function (x) { return x && x.k !== 'gris'; });
      var kG = general.some(function (x) { return x.k === 'rojo'; }) ? 'rojo' : (general.some(function (x) { return x.k === 'ambar'; }) ? 'ambar' : (general.length ? 'verde' : 'gris'));
      var txtG = kG === 'verde' ? 'La campaña viene en línea con la meta.' : (kG === 'ambar' ? 'Hay puntos para atender esta semana.' : (kG === 'rojo' ? 'Hay algo que ya está costando rinde: mirá los indicadores en rojo.' : 'Todavía faltan datos de la campaña (satélite, agua, hoja).'));
      var filas = [
        ['Suelo y manejo', suelo],
        ['Agua', ag ? { k: ag.k, texto: (ag.dias ? ag.dias + ' días desde la siembra' + (ag.etapa ? ' (' + NOMBRE_ETAPA[ag.etapa] + ')' : '') + ' · rinde perdido por agua hasta hoy ' + fmt(ag.perdidaPct, 1) + ' % · ' + ag.estresDias + ' día(s) con estrés. ' : '') + (ag.hoy ? (ag.hoy.ks < 1 ? 'Hoy el cultivo está en estrés: regar ' + fmt(ag.hoy.dr) + ' mm.' : 'Hoy hay ' + fmt(ag.hoy.disponible) + ' mm disponibles; puede gastar ' + fmt(ag.hoy.faltaParaRecarga) + ' mm más antes del punto de riego' + (ag.pronostico && ag.pronostico.cruzaRecarga ? ', y con el pronóstico se llega el ' + fmtF(ag.pronostico.cruzaRecarga) + ': programar el riego.' : ': no hace falta regar hoy.')) : '') } : { k: 'gris', texto: 'Sin fecha de siembra o sin datos de clima todavía.' }],
        ['Planta (satélite)', pl],
        ['Nutrición (hoja / sensor)', nu || { k: 'gris', texto: '' }]
      ];
      ind.innerHTML = '<div class="note ' + (kG === 'rojo' || kG === 'ambar' ? 'warn' : 'info') + '" style="border-left-color:' + COLOR[kG] + ';">' + semaforo(kG, 'Estado general') + ' · ' + esc(txtG) + '</div>' +
        '<div>' + filas.map(function (f) { return '<div style="padding:8px 6px;border-bottom:1px solid rgba(0,0,0,.07);"><div>' + semaforo(f[1].k, f[0]) + '</div><div style="font-size:12.5px;margin-top:3px;">' + (f[1].texto || '') + '</div></div>'; }).join('') + '</div>';
    });
  }

  window.SafiaSeguimiento = { ubicar: ubicar, planDe: planDe, guardarMeta: guardarMeta, marcar: marcar, quitarMeta: quitarMeta, html: html, metaViva: metaViva, htmlMetaViva: htmlMetaViva, resumenMetaViva: resumenMetaViva };
})();
