/* SAFIA — Balance de nutrientes de una campaña (extracción por el grano vs aplicado)
   -------------------------------------------------------------------
   Cierra el ciclo plan → seguimiento → cosecha → balance → plan siguiente:
   con el rinde real calcula cuánto N, P, K, S, Ca y Mg se llevaron los
   granos, lo compara con lo aplicado en la campaña (insumos de la ficha y
   aplicaciones del Operador) y deja el saldo por nutriente. Ese saldo
   entra al plan de la meta de la campaña siguiente como "reposición".

   Coeficientes: kg de nutriente exportado por tonelada de grano (base
   seca), tabla IPNI/Fertilizar "Requerimientos nutricionales de los
   cultivos" (datos INTA Balcarce, Pergamino y bibliografía argentina),
   Tablas 1 y 2 (ver FUNDAMENTOS_NUTRIENTES.md). Coinciden con Embrapa
   (soja: N 51–55 · P₂O₅ 10–14 · K₂O 20–23 kg/t) y con la manutención de
   CAPECO 2012 que ya usa el plan de la meta.
   El rinde comercial (13–14 % de humedad) se pasa a base seca antes de
   multiplicar. La soja fija su N del aire: el N exportado se informa pero
   NO se repone con fertilizante (Embrapa CT75). */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function clave(c) { var n = norm(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }

  // kg de nutriente ELEMENTAL exportado por tonelada de grano (base seca). IPNI/Fertilizar Tablas 1 y 2.
  var EXPORT = {
    soja:    { n: 55, p: 6, k: 19, ca: 3,   mg: 4, s: 3, fija: true },
    maiz:    { n: 15, p: 3, k: 4,  ca: 0.2, mg: 2, s: 1 },
    trigo:   { n: 21, p: 4, k: 4,  ca: 0.4, mg: 3, s: 2 },
    sorgo:   { n: 20, p: 4, k: 4,  ca: 0.9, mg: 1, s: 2 },
    girasol: { n: 24, p: 7, k: 6,  ca: 1,   mg: 3, s: 2 },
    otro:    { n: 18, p: 4, k: 5,  ca: 0.5, mg: 2, s: 1.5 }
  };
  // absorción total (grano + rastrojo), solo informativa
  var ABSORCION = { soja: { n: 75, p: 7, k: 39, s: 4 }, maiz: { n: 22, p: 4, k: 19, s: 4 }, trigo: { n: 30, p: 5, k: 19, s: 5 }, sorgo: { n: 30, p: 4, k: 21, s: 4 }, girasol: { n: 40, p: 11, k: 29, s: 5 } };
  var P2O5 = 2.29, K2O = 1.2;   // P → P₂O₅ · K → K₂O
  var NOMBRE = { n: 'Nitrógeno (N)', p2o5: 'Fósforo (P₂O₅)', k2o: 'Potasio (K₂O)', s: 'Azufre (S)', ca: 'Calcio (Ca)', mg: 'Magnesio (Mg)' };

  // Kg/ha exportados por el grano de una campaña (rinde comercial → base seca)
  function exportado(cultivo, rindeKgHa, humedad) {
    var e = EXPORT[clave(cultivo)] || EXPORT.otro, h = num(humedad); if (h == null || h < 5 || h > 30) h = 14;
    var tSeco = (num(rindeKgHa) || 0) / 1000 * (1 - h / 100);
    return { n: tSeco * e.n, p2o5: tSeco * e.p * P2O5, k2o: tSeco * e.k * K2O, s: tSeco * e.s, ca: tSeco * e.ca, mg: tSeco * e.mg, tSeco: tSeco, humedad: h, fija: !!e.fija, coef: e };
  }
  // Kg/ha aplicados en la campaña: insumos de fertilización (fórmula × dosis) + aplicaciones del Operador con % N-P-K
  function aplicado(camp, cultivoIdx) {
    var t = { n: 0, p2o5: 0, k2o: 0, s: 0, items: 0, detalle: [] };
    if (!camp) return t;
    var ins = (camp.insumos || []).filter(function (i) { return i.cultivoIdx == null || i.cultivoIdx === (cultivoIdx || 0); });
    if (window.SafiaInsumos) ins.forEach(function (i) { var x = SafiaInsumos.npkDe(i); if (!x) return; t.n += x.n; t.p2o5 += x.p2o5; t.k2o += x.k2o; t.s += x.s || 0; t.items++; t.detalle.push((i.producto || i.formula || '') + ' ' + fmt(i.dosis, 0) + ' ' + (i.unidad || '')); });
    var cu = camp.cultivos && camp.cultivos[cultivoIdx || 0], desde = cu && cu.fechaSiembra ? String(cu.fechaSiembra).slice(0, 10) : null, hasta = cu && cu.fechaCosecha ? String(cu.fechaCosecha).slice(0, 10) : null;
    leer('eventos').forEach(function (ev) {
      if (ev.tipo !== 'aplicacion' || String(ev.equipoId) !== String(camp.equipoId)) return;
      var f = String(ev.fecha || '').slice(0, 10); if (desde && f < desde) return; if (hasta && f > hasta) return;
      if (ev.n_kg_ha == null && ev.p_kg_ha == null && ev.k_kg_ha == null) return;
      // el Operador guarda P y K elementales (% P, % K del catálogo)
      t.n += num(ev.n_kg_ha) || 0; t.p2o5 += (num(ev.p_kg_ha) || 0) * P2O5; t.k2o += (num(ev.k_kg_ha) || 0) * K2O; t.items++; t.detalle.push((ev.producto || 'aplicación') + ' ' + fmt(ev.dosis, 0) + ' ' + (ev.unidad || ''));
    });
    return t;
  }
  // Balance completo de una campaña cosechada: { exportado, aplicado, saldo, rinde, cultivo, ... } o null si no hay rinde
  function balanceCampana(camp, cultivoIdx) {
    var cu = camp && camp.cultivos ? camp.cultivos[cultivoIdx || 0] : null;
    var rinde = cu ? num(cu.rendimientoReal) : null; if (!cu || !(rinde > 0)) return null;
    var co = (camp.cosechas && camp.cosechas[cultivoIdx || 0]) || ((cultivoIdx || 0) === 0 ? camp.cosecha : null) || {};
    var ex = exportado(cu.cultivo, rinde, co.humedad), ap = aplicado(camp, cultivoIdx);
    var saldo = { n: ap.n - ex.n, p2o5: ap.p2o5 - ex.p2o5, k2o: ap.k2o - ex.k2o, s: ap.s - ex.s };
    return { campanaId: camp.id, campana: camp.nombre || '', cultivo: cu.cultivo, variedad: cu.variedad || '', rinde: rinde, humedad: ex.humedad, tSeco: ex.tSeco, exportado: ex, aplicado: ap, saldo: saldo, fija: ex.fija, manejoCompleto: !!camp.manejoCompleto };
  }
  // Última campaña cosechada del lote (opcionalmente del mismo cultivo) con su balance
  function ultimoBalanceDelLote(equipoId, cultivo) {
    var lista = [];
    leer('campanas').forEach(function (c) { if (String(c.equipoId) !== String(equipoId)) return; (c.cultivos || []).forEach(function (cu, i) { if (cu && num(cu.rendimientoReal) > 0 && (!cultivo || clave(cu.cultivo) === clave(cultivo))) lista.push({ c: c, i: i, f: String(cu.fechaCosecha || cu.fechaSiembra || '') }); }); });
    if (!lista.length) return null;
    lista.sort(function (a, b) { return b.f.localeCompare(a.f); });
    return balanceCampana(lista[0].c, lista[0].i);
  }
  // Reposición para la campaña siguiente: lo que faltó reponer (saldo negativo) + lo que se llevará la meta
  function reposicionPara(bal, cultivoSiguiente, metaKgHa) {
    var ex = exportado(cultivoSiguiente, metaKgHa || 0, 14);
    var deuda = bal ? { n: Math.max(0, -bal.saldo.n), p2o5: Math.max(0, -bal.saldo.p2o5), k2o: Math.max(0, -bal.saldo.k2o), s: Math.max(0, -bal.saldo.s) } : { n: 0, p2o5: 0, k2o: 0, s: 0 };
    if (bal && bal.fija) deuda.n = 0;   // la soja fijó su N: no es deuda de fertilizante
    return { deuda: deuda, meta: ex, total: { p2o5: deuda.p2o5 + ex.p2o5, k2o: deuda.k2o + ex.k2o, s: deuda.s + ex.s, n: (ex.fija ? 0 : ex.n) + deuda.n } };
  }

  /* ---------- HTML ---------- */
  function fila(nombre, ex, ap, saldo, nota) {
    var neg = saldo != null && saldo < -1;
    return '<tr><td>' + nombre + '</td><td class="r">' + fmt(ex, 0) + '</td><td class="r">' + (ap == null ? '—' : fmt(ap, 0)) + '</td><td class="r" style="font-weight:700;color:' + (saldo == null ? '#8C9196' : (neg ? '#B3261E' : '#178029')) + ';">' + (saldo == null ? '—' : (saldo > 0 ? '+' : '') + fmt(saldo, 0)) + '</td><td class="muted" style="font-size:11px;">' + (nota || '') + '</td></tr>';
  }
  function htmlBalance(bal, opts) {
    opts = opts || {};
    if (!bal) return '<div class="muted" style="font-size:13px;">Sin cosecha todavía: el balance se calcula con el rinde real.</div>';
    var ex = bal.exportado, ap = bal.aplicado, s = bal.saldo, sinCarga = !ap.items;
    var falta = function (saldo, exp) { return saldo < -Math.max(5, exp * 0.1); };   // significativo: más del 10 % de lo exportado (mínimo 5 kg/ha)
    var h = '<div class="card" style="margin-top:10px;"><div class="card-h"><h3>Balance de nutrientes · ' + esc(bal.cultivo) + (bal.variedad ? ' ' + esc(bal.variedad) : '') + ' · ' + esc(bal.campana) + '</h3><span class="muted">' + fmt(bal.rinde) + ' kg/ha · ' + fmt(bal.tSeco, 2) + ' t/ha de grano seco (' + fmt(bal.humedad, 0) + ' % humedad)</span></div>';
    h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Nutriente</th><th class="r">Se llevó el grano (kg/ha)</th><th class="r">Aplicado (kg/ha)</th><th class="r">Saldo</th><th></th></tr></thead><tbody>' +
      fila(NOMBRE.n, ex.n, ap.n, bal.fija ? null : s.n, bal.fija ? 'La soja lo fija del aire (Embrapa): no se repone con fertilizante' : (falta(s.n, ex.n) ? 'Faltó N: el rendimiento pudo quedar limitado (el suelo aportó el resto)' : '')) +
      fila(NOMBRE.p2o5, ex.p2o5, ap.p2o5, s.p2o5, falta(s.p2o5, ex.p2o5) ? 'Se llevó más de lo aplicado: el suelo perdió reserva' : (s.p2o5 > 10 ? 'Sobró: construye reserva en el suelo' : '')) +
      fila(NOMBRE.k2o, ex.k2o, ap.k2o, s.k2o, falta(s.k2o, ex.k2o) ? 'Se llevó más de lo aplicado: el suelo perdió reserva' : (s.k2o > 10 ? 'Sobró: construye reserva' : '')) +
      fila(NOMBRE.s, ex.s, ap.s, ap.s || ex.s > 2 ? s.s : null, 'Solo cuenta el S declarado en la fórmula (ej. "+ 10 S")') +
      fila(NOMBRE.ca, ex.ca, null, null, 'Lo repone el encalado') + fila(NOMBRE.mg, ex.mg, null, null, 'Lo repone el calcáreo dolomítico') +
      '</tbody></table></div></div>';
    if (sinCarga) h += '<div class="note warn" style="margin-top:8px;">No hay fertilizantes cargados en esta campaña (insumos de la ficha o aplicaciones del Operador): el saldo asume que no se aplicó nada. Cargá lo aplicado para que el balance sea real.</div>';
    else if (!bal.manejoCompleto) h += '<div class="muted" style="font-size:11px;margin-top:6px;">Aplicado según ' + ap.items + ' producto(s) cargado(s): ' + esc(ap.detalle.slice(0, 6).join(' · ')) + (ap.detalle.length > 6 ? ' …' : '') + '. Si falta algo, cargalo en la ficha (paso 3).</div>';
    if (opts.metaSiguiente) {
      var r = reposicionPara(bal, opts.cultivoSiguiente || bal.cultivo, opts.metaSiguiente);
      h += '<div class="note info" style="margin-top:8px;"><b>Si la próxima campaña en este lote es ' + esc(opts.cultivoSiguiente || bal.cultivo) + ' a ' + fmt(opts.metaSiguiente) + ' kg/ha' + (opts.metaNota ? ' (' + opts.metaNota + ')' : '') + ':</b> el grano se llevará ~' + fmt(r.meta.p2o5, 0) + ' kg/ha de P₂O₅ y ' + fmt(r.meta.k2o, 0) + ' de K₂O' + (r.meta.fija ? '' : ' y ' + fmt(r.meta.n, 0) + ' de N') +
        (r.deuda.p2o5 > 1 || r.deuda.k2o > 1 ? '; más lo que faltó reponer de esta cosecha (' + fmt(r.deuda.p2o5, 0) + ' P₂O₅ · ' + fmt(r.deuda.k2o, 0) + ' K₂O). Total a reponer: <b>' + fmt(r.total.p2o5, 0) + ' kg/ha de P₂O₅ y ' + fmt(r.total.k2o, 0) + ' de K₂O</b>' : '. Con lo aplicado esta campaña se cubrió lo extraído: la próxima repone solo lo que se lleve la meta') +
        '. Al planificar la próxima campaña, el plan de la meta lo incluye junto con la corrección del suelo por análisis.</div>';
    }
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Coeficientes de exportación por tonelada de grano seco: IPNI/Fertilizar (INTA); P y K expresados como P₂O₅ y K₂O. Es un balance de lo que salió con el grano contra lo que entró con el fertilizante; no mide lo que quedó en el rastrojo ni las pérdidas.</div></div>';
    return h;
  }
  // Banco → Sucesión: balances de las últimas campañas cosechadas del campo
  function htmlCampo(campo, max) {
    var lista = [];
    var equipos = leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
    leer('campanas').forEach(function (c) { var eq = equipos.find(function (e) { return String(e.id) === String(c.equipoId); }); if (!eq) return; (c.cultivos || []).forEach(function (cu, i) { var b = balanceCampana(c, i); if (b) lista.push({ b: b, eq: eq, f: String(cu.fechaCosecha || cu.fechaSiembra || '') }); }); });
    if (!lista.length) return '';
    lista.sort(function (a, b) { return b.f.localeCompare(a.f); });
    return '<div class="section-title" style="margin:14px 0 6px;">Balance de nutrientes de las últimas cosechas</div>' + lista.slice(0, max || 3).map(function (x) { return htmlBalance(x.b).replace('<h3>Balance de nutrientes · ', '<h3>' + esc(x.eq.nombre) + ' · '); }).join('');
  }
  function alCambiarCampo() {
    var el = document.getElementById('nutrientesResumen'), c = window.SafiaBanco && SafiaBanco.campoActual ? SafiaBanco.campoActual() : null;
    if (!el) return; el.innerHTML = c ? htmlCampo(c, 3) : '';
  }

  window.SafiaNutrientes = { EXPORT: EXPORT, ABSORCION: ABSORCION, exportado: exportado, aplicado: aplicado, balanceCampana: balanceCampana, ultimoBalanceDelLote: ultimoBalanceDelLote, reposicionPara: reposicionPara, htmlBalance: htmlBalance, htmlCampo: htmlCampo, alCambiarCampo: alCambiarCampo, clave: clave };
})();
