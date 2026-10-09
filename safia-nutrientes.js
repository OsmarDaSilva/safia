/* SAFIA — Balance de nutrientes de la campaña (lo que se lleva el grano vs lo aplicado)
   -------------------------------------------------------------------
   Regla de Osmar (24-sep-2026): la ficha solo carga (fertilizantes y
   dosis); el balance se ve EN VIVO mientras la campaña corre (aplicado
   hasta hoy contra lo que se llevará la meta) y, al cosechar, QUEDA FIRME
   dentro de la campaña (camp.balanceNutrientes[idx]) con el rinde real.
   Ese balance firme es la base de la campaña siguiente y del plan de la
   meta. Si después de esa cosecha se carga un análisis de suelo nuevo del
   lote, el análisis vuelve a ser el punto de partida y el saldo viejo no
   se suma. Todo se ve en un solo lugar: Banco → Sucesión de cultivos.

   Coeficientes: kg de nutriente exportado por tonelada de grano (base
   seca), IPNI/Fertilizar "Requerimientos nutricionales de los cultivos"
   (datos INTA), Tablas 1 y 2 (ver FUNDAMENTOS_NUTRIENTES.md). Coinciden
   con Embrapa y con la manutención de CAPECO 2012 del plan de la meta.
   La soja fija su N del aire: se informa, no se repone (Embrapa CT75). */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function fechaLarga(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function hoy() { if (window.SafiaBalance && SafiaBalance.hoyLocal) return SafiaBalance.hoyLocal(); var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }   // hora local, no UTC
  function clave(c) { var n = norm(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }
  function esPastura(c) { return !!(window.SafiaPasturas && SafiaPasturas.esPastura && SafiaPasturas.esPastura(c)); }

  // kg de nutriente ELEMENTAL exportado por tonelada de grano (base seca). IPNI/Fertilizar Tablas 1 y 2.
  var EXPORT = {
    soja:    { n: 55, p: 6, k: 19, ca: 3,   mg: 4, s: 3, fija: true },
    maiz:    { n: 15, p: 3, k: 4,  ca: 0.2, mg: 2, s: 1 },
    trigo:   { n: 21, p: 4, k: 4,  ca: 0.4, mg: 3, s: 2 },
    sorgo:   { n: 20, p: 4, k: 4,  ca: 0.9, mg: 1, s: 2 },
    girasol: { n: 24, p: 7, k: 6,  ca: 1,   mg: 3, s: 2 },
    otro:    { n: 18, p: 4, k: 5,  ca: 0.5, mg: 2, s: 1.5 }
  };
  var ABSORCION = { soja: { n: 75, p: 7, k: 39, s: 4 }, maiz: { n: 22, p: 4, k: 19, s: 4 }, trigo: { n: 30, p: 5, k: 19, s: 5 }, sorgo: { n: 30, p: 4, k: 21, s: 4 }, girasol: { n: 40, p: 11, k: 29, s: 5 } };
  var P2O5 = 2.29, K2O = 1.2;
  var NOMBRE = { n: 'Nitrógeno (N)', p2o5: 'Fósforo (P₂O₅)', k2o: 'Potasio (K₂O)', s: 'Azufre (S)', ca: 'Calcio (Ca)', mg: 'Magnesio (Mg)' };

  // Kg/ha que se lleva (o llevará) el grano: rinde comercial → base seca
  function exportado(cultivo, rindeKgHa, humedad) {
    var e = EXPORT[clave(cultivo)] || EXPORT.otro, h = num(humedad); if (h == null || h < 5 || h > 30) h = 14;
    var tSeco = (num(rindeKgHa) || 0) / 1000 * (1 - h / 100);
    return { n: tSeco * e.n, p2o5: tSeco * e.p * P2O5, k2o: tSeco * e.k * K2O, s: tSeco * e.s, ca: tSeco * e.ca, mg: tSeco * e.mg, tSeco: tSeco, humedad: h, fija: !!e.fija };
  }
  // Kg/ha aplicados hasta hoy: insumos de fertilización de la ficha + aplicaciones del Operador con % N-P-K dentro del ciclo
  function aplicado(camp, cultivoIdx) {
    var t = { n: 0, p2o5: 0, k2o: 0, s: 0, b: 0, zn: 0, items: 0, detalle: [] };
    if (!camp) return t;
    var ins = (camp.insumos || []).filter(function (i) { return i.cultivoIdx == null || i.cultivoIdx === (cultivoIdx || 0); });
    if (window.SafiaInsumos) ins.forEach(function (i) { var x = SafiaInsumos.npkDe(i); if (!x) return; t.n += x.n; t.p2o5 += x.p2o5; t.k2o += x.k2o; t.s += x.s || 0; t.b += x.b || 0; t.zn += x.zn || 0; t.items++; t.detalle.push((i.producto || i.formula || '') + ' ' + fmt(i.dosis, 0) + ' ' + (i.unidad || '')); });
    var cu = camp.cultivos && camp.cultivos[cultivoIdx || 0], desde = cu && cu.fechaSiembra ? String(cu.fechaSiembra).slice(0, 10) : null, hasta = cu && cu.fechaCosecha ? String(cu.fechaCosecha).slice(0, 10) : null;
    leer('eventos').forEach(function (ev) {
      if (ev.tipo !== 'aplicacion' || String(ev.equipoId) !== String(camp.equipoId)) return;
      var f = String(ev.fecha || '').slice(0, 10); if (desde && f < desde) return; if (hasta && f > hasta) return;
      if (ev.n_kg_ha == null && ev.p_kg_ha == null && ev.k_kg_ha == null) return;
      t.n += num(ev.n_kg_ha) || 0; t.p2o5 += (num(ev.p_kg_ha) || 0) * P2O5; t.k2o += (num(ev.k_kg_ha) || 0) * K2O; t.items++; t.detalle.push((ev.producto || 'aplicación') + ' ' + fmt(ev.dosis, 0) + ' ' + (ev.unidad || ''));
    });
    return t;
  }
  function armar(camp, cultivoIdx, cu, rinde, humedad, enVivo) {
    var ex = exportado(cu.cultivo, rinde, humedad), ap = aplicado(camp, cultivoIdx);
    return { campanaId: camp.id, cultivoIdx: cultivoIdx || 0, equipoId: camp.equipoId, campana: camp.nombre || '', cultivo: cu.cultivo, variedad: cu.variedad || '', rinde: rinde, humedad: ex.humedad, tSeco: ex.tSeco,
      exportado: { n: ex.n, p2o5: ex.p2o5, k2o: ex.k2o, s: ex.s, ca: ex.ca, mg: ex.mg }, aplicado: ap, saldo: { n: ap.n - ex.n, p2o5: ap.p2o5 - ex.p2o5, k2o: ap.k2o - ex.k2o, s: ap.s - ex.s },
      fija: ex.fija, enVivo: !!enVivo, firme: false, fechaCosecha: cu.fechaCosecha ? String(cu.fechaCosecha).slice(0, 10) : null, fechaSiembra: cu.fechaSiembra ? String(cu.fechaSiembra).slice(0, 10) : null };
  }
  /* Al cosechar: calcula con el rinde real y lo deja FIRME dentro de la campaña (quien guarda la campaña es quien llama). */
  function cerrar(camp, cultivoIdx) {
    var cu = camp && camp.cultivos ? camp.cultivos[cultivoIdx || 0] : null, rinde = cu ? num(cu.rendimientoReal) : null;
    if (!cu || !(rinde > 0) || esPastura(cu.cultivo)) return null;
    var co = (camp.cosechas && camp.cosechas[cultivoIdx || 0]) || ((cultivoIdx || 0) === 0 ? camp.cosecha : null) || {};
    var b = armar(camp, cultivoIdx, cu, rinde, co.humedad, false); b.firme = true; b.fechaFirme = hoy();
    camp.balanceNutrientes = camp.balanceNutrientes || {}; camp.balanceNutrientes[cultivoIdx || 0] = b;
    return b;
  }
  /* Balance de una campaña: firme (guardado al cosechar), cosechada sin guardar (campañas viejas: se calcula igual) o en vivo (con meta). null si no hay nada que mostrar. */
  function balanceCampana(camp, cultivoIdx) {
    var i = cultivoIdx || 0, cu = camp && camp.cultivos ? camp.cultivos[i] : null; if (!cu || esPastura(cu.cultivo)) return null;
    if (camp.balanceNutrientes && camp.balanceNutrientes[i]) return camp.balanceNutrientes[i];
    var rinde = num(cu.rendimientoReal);
    if (rinde > 0) { var co = (camp.cosechas && camp.cosechas[i]) || (i === 0 ? camp.cosecha : null) || {}; return armar(camp, i, cu, rinde, co.humedad, false); }
    var meta = num(cu.rendimientoObj); if (!(meta > 0)) return null;
    return armar(camp, i, cu, meta, 14, true);
  }
  // Último balance FIRME (cosechado) del lote, opcionalmente del mismo cultivo
  function ultimoBalanceDelLote(equipoId, cultivo) {
    var lista = [];
    leer('campanas').forEach(function (c) { if (String(c.equipoId) !== String(equipoId)) return; (c.cultivos || []).forEach(function (cu, i) { if (cu && num(cu.rendimientoReal) > 0 && (!cultivo || clave(cu.cultivo) === clave(cultivo))) { var b = balanceCampana(c, i); if (b && !b.enVivo) lista.push({ b: b, f: String(cu.fechaCosecha || cu.fechaSiembra || '') }); } }); });
    if (!lista.length) return null;
    lista.sort(function (a, b) { return b.f.localeCompare(a.f); });
    return lista[0].b;
  }
  // ¿Hay un análisis de suelo del lote (o del campo entero) con fecha posterior a la cosecha? Entonces el análisis manda y el saldo viejo no se suma.
  function analisisPosterior(equipoId, fechaISO) {
    if (!fechaISO) return null;
    var eq = leer('equipos').find(function (e) { return String(e.id) === String(equipoId); }), campoId = eq ? eq.campoId : null;
    var lista = leer('analisis_suelo').filter(function (a) { return a.fecha && String(a.fecha).slice(0, 10) > fechaISO && (String(a.equipoId || '') === String(equipoId) || (!a.equipoId && campoId != null && String(a.campoId) === String(campoId))); });
    lista.sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    return lista[0] || null;
  }
  // Lo que el plan de la meta debe reponer de la cosecha anterior del lote: solo saldo negativo de P y K, y solo si no hay análisis posterior
  function reposicionPendiente(equipoId) {
    var bal = ultimoBalanceDelLote(equipoId); if (!bal) return null;
    var an = analisisPosterior(equipoId, bal.fechaCosecha);
    return { p2o5: an ? 0 : Math.max(0, -bal.saldo.p2o5), k2o: an ? 0 : Math.max(0, -bal.saldo.k2o), cultivo: bal.cultivo, rinde: bal.rinde, campana: bal.campana, sinCarga: !bal.aplicado.items, analisisPosterior: an ? String(an.fecha).slice(0, 10) : null };
  }

  /* ---------- Micronutrientes y azufre: no van por balance (el grano se lleva gramos) sino por el análisis de suelo del lote.
     Umbrales iguales a los del motor agronómico (safia-agronomia.js): Embrapa Cerrados / CESB. ---------- */
  var MICROS = [
    { k: 'boro', n: 'Boro (B)', bajo: 0.30, medio: 0.50, accionBajo: '1,5 kg B/ha al suelo (bórax o ulexita, dura 4–5 años) o foliar en floración', accionMedio: '1,0 kg B/ha (para rindes altos) al suelo o foliar en floración' },
    { k: 'zinc', n: 'Zinc (Zn)', bajo: 0.60, medio: 1.30, accionBajo: '6 kg Zn/ha al suelo (sulfato de zinc ~30 kg/ha, dura 4–5 años) o Zn en semilla + foliar', accionMedio: '5 kg Zn/ha al suelo (para rindes altos) o Zn en semilla + foliar' },
    { k: 'cobre', n: 'Cobre (Cu)', bajo: 0.33, medio: 0.74, accionBajo: '2,5 kg Cu/ha al suelo (sulfato de cobre) o foliar', accionMedio: '1,5 kg Cu/ha (para rindes altos) o foliar' },
    { k: 'manganeso', n: 'Manganeso (Mn)', bajo: 5.0, medio: 10.0, accionBajo: '6 kg Mn/ha al suelo o foliar en V4–R1', accionMedio: '4 kg Mn/ha (para rindes altos) o foliar en V4–R1' },
    { k: 'azufre', n: 'Azufre (S) en el suelo', bajo: 5, medio: 10, accionBajo: 'yeso agrícola 150–200 kg/ha o sulfato de amonio (80 kg S + manutención)', accionMedio: '40 kg S/ha + manutención (≈ 5 kg S por t de soja): yeso o fórmula con S' }
  ];   // Embrapa 2013 (Fundação MS Tabelas 16, 21 y 22): B agua caliente; Cu, Mn, Zn Mehlich-1; S en suelo arcilloso (> 40 %)
  // último análisis de suelo del lote (o del campo entero), el promedio si lo hay
  function analisisDelLote(equipoId) {
    var eq = leer('equipos').find(function (e) { return String(e.id) === String(equipoId); }), campoId = eq ? eq.campoId : null;
    var lista = leer('analisis_suelo').filter(function (a) { return a.fecha && !(a.enPromedio) && (String(a.equipoId || '') === String(equipoId) || (!a.equipoId && campoId != null && String(a.campoId) === String(campoId))); });
    lista.sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || ((b.esPromedio ? 1 : 0) - (a.esPromedio ? 1 : 0)) || ((String(b.equipoId || '') === String(equipoId) ? 1 : 0) - (String(a.equipoId || '') === String(equipoId) ? 1 : 0)); });
    // un análisis solo de sodio o sales (sin P, K, Ca, MO ni micros) no sirve para la fertilidad: se salta al último que sí los tenga
    var conFert = lista.filter(function (a) { return ['p', 'k', 'ca', 'mg', 'mo', 'boro', 'zinc', 'cobre', 'manganeso', 'azufre'].some(function (k) { return num(a[k]) != null; }); }); if (conFert.length) lista = conFert;
    if (!lista.length) return null;
    // varias muestras de la misma fecha sin promedio guardado: se promedian acá (como en Análisis de suelo)
    var f = String(lista[0].fecha), grupo = lista.filter(function (a) { return String(a.fecha) === f && !!a.equipoId === !!lista[0].equipoId; });
    if (grupo.length === 1 || grupo.some(function (a) { return a.esPromedio; })) return grupo.find(function (a) { return a.esPromedio; }) || grupo[0];
    var prom = { fecha: f, equipoId: lista[0].equipoId || null, campoId: lista[0].campoId, esPromedio: true, nMuestras: grupo.length };
    ['boro', 'zinc', 'cobre', 'manganeso', 'azufre', 'ph', 'mo', 'p', 'k', 'ca', 'mg', 'cic', 'satBases', 'arcilla', 'na', 'psi', 'ceExtracto'].forEach(function (k) { var vs = grupo.map(function (a) { return num(a[k]); }).filter(function (v) { return v != null; }); if (vs.length) prom[k] = vs.reduce(function (x, y) { return x + y; }, 0) / vs.length; });
    return prom;
  }
  function htmlMicros(bal) {
    var an = analisisDelLote(bal.equipoId);
    var camp = leer('campanas').find(function (c) { return String(c.id) === String(bal.campanaId); }) || {};
    var aplic = (camp.insumos || []).filter(function (i) { if (i.cultivoIdx != null && i.cultivoIdx !== (bal.cultivoIdx || 0)) return false; if (i.categoria === 'ts_micro' || i.categoria === 'foliar_micro') return true; var g = window.SafiaInsumos ? SafiaInsumos.npkDe(i) : null; return !!(g && (g.b > 0 || g.zn > 0)); })
      .map(function (i) { var g = window.SafiaInsumos ? SafiaInsumos.npkDe(i) : null; return (i.producto || '') + (i.dosis ? ' ' + fmt(i.dosis, 1) + ' ' + (i.unidad || '') : '') + (g && g.b > 0 ? ' = ' + fmt(g.b, 1) + ' kg B/ha' : '') + (g && g.zn > 0 ? ' = ' + fmt(g.zn, 1) + ' kg Zn/ha' : ''); });
    var h = '<div style="margin-top:12px;font-size:12px;font-weight:700;color:#5B6167;text-transform:uppercase;letter-spacing:.3px;">Micronutrientes y azufre del suelo' + (an ? ' · análisis del ' + fechaLarga(an.fecha) + (an.equipoId ? '' : ' (todo el campo)') + (an.nMuestras > 1 ? ', promedio de ' + an.nMuestras + ' muestras' : '') : '') + '</div>';
    if (!an) return h + '<div class="note warn" style="margin-top:6px;">Sin análisis de suelo de este lote: SAFIA no puede saber si faltan boro, zinc, cobre, manganeso o azufre. Cargalo en Banco → Análisis de suelo.</div>';
    var filas = MICROS.map(function (m) {
      var v = num(an[m.k]);
      if (v == null) return '<tr><td>' + m.n + '</td><td class="r muted">no informado</td><td></td><td class="muted" style="font-size:11px;white-space:normal;">El laboratorio no lo midió: pedirlo en el próximo análisis</td></tr>';
      var est = v < m.bajo ? 'bajo' : (v < m.medio ? 'medio' : 'adecuado'), color = est === 'bajo' ? '#B3261E' : (est === 'medio' ? '#B8731A' : '#178029');
      var accion = est === 'bajo' ? m.accionBajo : (est === 'medio' ? m.accionMedio : '');
      return '<tr><td>' + m.n + '</td><td class="r">' + fmt(v, m.k === 'azufre' ? 1 : 2) + ' mg/dm³</td><td style="font-weight:700;color:' + color + ';">' + est + '</td><td style="font-size:11px;white-space:normal;min-width:220px;">' + (accion ? accion + ' <span class="muted">(el plan de la meta lo trae como ítem)</span>' : '<span class="muted">sin acción</span>') + '</td></tr>';
    }).join('');
    h += '<div class="tablewrap" style="margin-top:6px;"><div class="tablescroll"><table class="tbl"><thead><tr><th>Elemento</th><th class="r">En el suelo</th><th>Estado</th><th>Qué hacer</th></tr></thead><tbody>' + filas + '</tbody></table></div></div>';
    h += '<div class="muted" style="font-size:11px;margin-top:4px;">' + (aplic.length ? 'Micronutrientes aplicados en esta campaña: ' + esc(aplic.join(' · ')) + '.' : 'Sin micronutrientes cargados en esta campaña (semilla o foliar).') + ' El grano se lleva estos elementos en gramos por hectárea: lo que manda es el análisis de suelo y el foliar, no el balance. Umbrales y dosis: Embrapa 2013 (Fundação MS, Tabelas 21 y 22).</div>';
    return h;
  }

  /* ---------- HTML (un solo lugar: Banco → Sucesión de cultivos) ---------- */
  function fila(nombre, ex, ap, saldo, nota) {
    var neg = saldo != null && saldo < -1;
    return '<tr><td>' + nombre + '</td><td class="r">' + fmt(ex, 0) + '</td><td class="r">' + (ap == null ? '—' : fmt(ap, 0)) + '</td><td class="r" style="font-weight:700;color:' + (saldo == null ? '#8C9196' : (neg ? '#B3261E' : '#178029')) + ';">' + (saldo == null ? '—' : (saldo > 0 ? '+' : '') + fmt(saldo, 0)) + '</td><td class="muted" style="font-size:11px;white-space:normal;min-width:200px;">' + (nota || '') + '</td></tr>';
  }
  function htmlBalance(bal, titulo) {
    if (!bal) return '';
    var ex = bal.exportado, ap = bal.aplicado, s = bal.saldo, sinCarga = !ap.items, vivo = bal.enVivo;
    var falta = function (saldo, exp) { return saldo < -Math.max(5, exp * 0.1); };
    var estado = vivo ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#E8F1FB;color:#1A5FA8;font-size:11px;font-weight:700;">EN VIVO</span>'
      : (bal.firme ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#E6F4EA;color:#178029;font-size:11px;font-weight:700;">FIRME' + (bal.fechaFirme ? ' · cerrado el ' + fechaLarga(bal.fechaFirme) : '') + '</span>' : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#EEF1F4;color:#4A5157;font-size:11px;font-weight:700;">COSECHADA · calculado con el rinde real</span>');
    var h = '<div class="card" style="margin-top:10px;"><div class="card-h"><h3>' + esc(titulo || '') + esc(bal.cultivo) + (bal.variedad ? ' ' + esc(bal.variedad) : '') + ' · ' + esc(bal.campana) + ' ' + estado + '</h3><span class="muted">' + (vivo ? 'meta ' : 'rinde ') + fmt(bal.rinde) + ' kg/ha</span></div>';
    var colEx = vivo ? 'Se llevará la meta' : 'Se llevó el grano', colAp = vivo ? 'Aplicado hasta hoy' : 'Aplicado';
    h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Nutriente (kg/ha)</th><th class="r">' + colEx + '</th><th class="r">' + colAp + '</th><th class="r">Saldo</th><th></th></tr></thead><tbody>' +
      fila(NOMBRE.n, ex.n, ap.n, bal.fija ? null : s.n, bal.fija ? 'La soja lo fija del aire (Embrapa): no se repone con fertilizante' : (falta(s.n, ex.n) ? (vivo ? 'Falta N para la meta' : 'Faltó N: el rendimiento pudo quedar limitado') : '')) +
      fila(NOMBRE.p2o5, ex.p2o5, ap.p2o5, s.p2o5, falta(s.p2o5, ex.p2o5) ? (vivo ? 'Falta para la meta' : 'Se llevó más de lo aplicado: el suelo perdió reserva') : (s.p2o5 > 10 ? 'Sobra: construye reserva' : '')) +
      fila(NOMBRE.k2o, ex.k2o, ap.k2o, s.k2o, falta(s.k2o, ex.k2o) ? (vivo ? 'Falta para la meta' : 'Se llevó más de lo aplicado: el suelo perdió reserva') : (s.k2o > 10 ? 'Sobra: construye reserva' : '')) +
      fila(NOMBRE.s, ex.s, ap.s, ap.s || ex.s > 2 ? s.s : null, 'Solo el S declarado en la fórmula (ej. "+ 10 S")') +
      fila(NOMBRE.ca, ex.ca, null, null, 'Lo repone el encalado') + fila(NOMBRE.mg, ex.mg, null, null, 'Lo repone el calcáreo dolomítico') +
      '</tbody></table></div></div>';
    h += htmlMicros(bal);
    if (sinCarga) h += '<div class="note warn" style="margin-top:8px;">Sin fertilizantes cargados en esta campaña (ficha, paso 3, o aplicaciones del Operador): el saldo asume cero aplicado.</div>';
    else h += '<div class="muted" style="font-size:11px;margin-top:6px;">Aplicado: ' + esc(ap.detalle.slice(0, 6).join(' · ')) + (ap.detalle.length > 6 ? ' …' : '') + '.</div>';
    if (!vivo) {
      var an = analisisPosterior(bal.equipoId, bal.fechaCosecha);
      if (an) h += '<div class="note info" style="margin-top:8px;">Hay un análisis de suelo del ' + fechaLarga(an.fecha) + ', posterior a esta cosecha: el plan de la próxima campaña parte de ese análisis y no suma este saldo.</div>';
      else if (s.p2o5 < -5 || s.k2o < -5) h += '<div class="note info" style="margin-top:8px;">Este saldo entra al plan de la próxima campaña del lote como "Reposición de la cosecha anterior". Un análisis de suelo nuevo lo reemplaza.</div>';
    }
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Exportación por tonelada de grano según IPNI/Fertilizar (INTA); el rinde es el de silo. P y K como P₂O₅ y K₂O. Entradas por fertilizante contra salidas por grano; no cuenta rastrojo ni pérdidas.</div></div>';
    return h;
  }
  // Banco → Sucesión: en vivo (campañas en curso con meta) + últimas cosechas firmes del campo
  function htmlCampo(campo, max) {
    var vivos = [], firmes = [];
    var equipos = leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
    leer('campanas').forEach(function (c) { var eq = equipos.find(function (e) { return String(e.id) === String(c.equipoId); }); if (!eq) return; (c.cultivos || []).forEach(function (cu, i) { var b = balanceCampana(c, i); if (!b) return; (b.enVivo ? vivos : firmes).push({ b: b, eq: eq, f: String(cu.fechaCosecha || cu.fechaSiembra || '') }); }); });
    if (!vivos.length && !firmes.length) return '';
    firmes.sort(function (a, b) { return b.f.localeCompare(a.f); });
    var h = '';
    if (vivos.length) h += '<div class="section-title" style="margin:14px 0 6px;">Balance de nutrientes en vivo (campañas en curso)</div>' + vivos.map(function (x) { return htmlBalance(x.b, x.eq.nombre + ' · '); }).join('');
    if (firmes.length) h += '<div class="section-title" style="margin:14px 0 6px;">Balance de nutrientes de las últimas cosechas (queda firme al cosechar)</div>' + firmes.slice(0, max || 3).map(function (x) { return htmlBalance(x.b, x.eq.nombre + ' · '); }).join('');
    return h;
  }
  function alCambiarCampo() {
    var el = document.getElementById('nutrientesResumen'), c = window.SafiaBanco && SafiaBanco.campoActual ? SafiaBanco.campoActual() : null;
    if (!el) return; el.innerHTML = c ? htmlCampo(c, 3) : '';
  }

  /* ---------- Disponibilidad para la planta (pedido de Osmar, 9-oct-2026): el balance no es "fertilizante contra extracción".
     Por nutriente: 1) lo que se lleva el grano con el rinde objetivo; 2) lo que aporta el suelo según el último análisis del lote
     (clase del manual RS/SC para P y K; para N la fijación de la soja o la materia orgánica); 3) lo que hace falta aplicar (dosis del
     manual para esa clase: solo manutención si el suelo está "alto", corrección + manutención si está bajo, nada si "muy alto" al doble);
     4) lo aplicado (Manejo e insumos + aplicaciones del Operador) y el % cubierto CONTRA LO QUE HACE FALTA, no contra la extracción.
     Fuentes: manual RS/SC 2016 (CAPECO/IPTA lo adopta) vía SafiaFertilidad; Embrapa CT75 (soja no lleva N); IPNI/INTA (extracción). */
  function disponibilidad(camp, idx, legacy) {
    var F = window.SafiaFertilidad; idx = idx || 0;
    var cu = camp && camp.cultivos && camp.cultivos[idx]; if (!cu || !cu.cultivo) return null;
    var k = clave(cu.cultivo), ex = EXPORT[k] || EXPORT.otro, meta = num(cu.rendimientoObj), metaT = meta ? meta / 1000 : null;
    var an = analisisDelLote(camp.equipoId);
    var ap = { n: 0, p2o5: 0, k2o: 0, items: 0 };
    if (window.SafiaInsumos && camp.insumos && camp.insumos.length) { var t = SafiaInsumos.totalesNPK(camp.insumos.filter(function (it) { return it.cultivoIdx == null || it.cultivoIdx === idx; })); ap.n += t.n; ap.p2o5 += t.p2o5; ap.k2o += t.k2o; ap.items += t.items; }
    (legacy || []).forEach(function (ev) { ap.n += num(ev.n_kg_ha) || 0; ap.p2o5 += (num(ev.p_kg_ha) || 0) * P2O5; ap.k2o += (num(ev.k_kg_ha) || 0) * K2O; ap.items++; });
    var refT = F ? (F.manutencion(cu.cultivo, null).ref) : 3, tUsada = metaT || refT;
    var dem = { n: ex.n * tUsada, p2o5: ex.p * P2O5 * tUsada, k2o: ex.k * K2O * tUsada };
    var filas = [], fuentes = ['IPNI / Fertilizar (datos INTA): kg exportados por tonelada de grano'];
    // N
    var fN = { k: 'n', n: 'Nitrógeno (N)', demanda: dem.n, aplicado: ap.n };
    if (ex.fija) {
      // Verificado el 9-oct-2026 a pedido de Osmar ("todo depende, Embrapa tiene estudios con N en floración"): Embrapa SÍ lo probó, en R1 y R5.
      // Embrapa Soja, Comunicado Técnico 75 (Crispino, Franchini, Campo, Hungria et al., 2001): 9 ensayos en Londrina, Ponta Grossa y Jaciara
      // con 30 kg N a la siembra, 50 kg N en pre-floración y 50 kg N al inicio del llenado: sin aumento de rinde en ninguno (promedio 3.200 kg/ha
      // sin N); conclusión textual: "desnecessária e, portanto, não é recomendada". Embrapa Cerrados + Soja, Mendes et al., PAB 2008: 15 ensayos
      // 2000/01–2005/06 con 50 kg N en R1 y R5 y 200 kg N: respuesta en 2 de 15, +154 a +216 kg/ha en el análisis conjunto, sin ventaja
      // económica; 200 kg N bajó la nodulación 21–41 %. La soja fija 109–250 kg N/ha (70–85 % de lo que acumula); el resto lo da la MO.
      fN.necesita = 0; fN.estado = 'no hace falta';
      fN.suelo = 'La soja toma del aire, con el rizobio, el 70–85 % de su nitrógeno (109–250 kg/ha); el resto lo da la materia orgánica del suelo. Embrapa probó agregar N en floración (R1) y en el llenado (R5): en 9 ensayos de Paraná y Mato Grosso no subió el rinde, y en 15 del Cerrado solo 2 respondieron, con +154 a +216 kg/ha que no pagan el fertilizante, y 200 kg de N bajaron la nodulación 21–41 %. Por eso Embrapa no lo recomienda en ningún estadio. Lo que sí rinde: inocular bien (1 millón de células por semilla) con cobalto y molibdeno. Si igual querés probar N en R1 o R5, cargalo en Manejo e insumos: SAFIA compara las campañas con y sin.';
      fuentes.push('Embrapa Soja, Comunicado Técnico 75 (2001) y Embrapa Cerrados, Mendes et al., PAB 43(8), 2008: N en siembra, R1 y R5 sin ventaja');
    }
    else if (F && an && num(an.mo) != null) { var rN = F.nitrogeno(cu.cultivo, an.mo, cu.cultivoAnterior, tUsada); fN.necesita = rN.n; fN.suelo = 'Materia orgánica ' + fmt(an.mo, 1) + ' % (' + (rN.claseMO || F.claseMO(an.mo)) + ')' + (cu.cultivoAnterior ? ', antecesor ' + cu.cultivoAnterior : '') + ': el manual indica ' + fmt(rN.n, 0) + ' kg N/ha' + (rN.regla ? ' (' + rN.regla + ')' : '') + '. El resto lo pone el suelo al mineralizar la materia orgánica.'; fuentes.push(rN.fuente || 'RS/SC 2016'); }
    else { fN.necesita = dem.n; fN.suelo = an ? 'El análisis no trae materia orgánica: se muestra lo que se lleva el grano.' : 'Sin análisis de suelo del lote: se muestra lo que se lleva el grano. Con el análisis, SAFIA descuenta lo que aporta el suelo.'; }
    filas.push(fN);
    // P y K
    [['p2o5', 'Fósforo (P₂O₅)', 'p', 'arcilla'], ['k2o', 'Potasio (K₂O)', 'k', 'cic']].forEach(function (d) {
      var f = { k: d[0], n: d[1], demanda: dem[d[0]], aplicado: ap[d[0]] };
      var val = an ? num(an[d[2]]) : null;
      if (F && val != null) {
        var i = d[0] === 'p2o5' ? F.interpretarP(val, an.arcilla) : F.interpretarK(val, an.cic);
        var rel = i.limites && i.limites[3] ? (d[0] === 'p2o5' ? val : i.valorMg) / i.limites[3] : null;
        var ds = F.dosisPK(i.clase, cu.cultivo, tUsada, d[0], false, rel);
        f.necesita = ds.total; f.clase = i.clase;
        f.suelo = (d[0] === 'p2o5' ? 'P ' + fmt(val, 1) + ' mg/dm³, clase "' + i.clase + '" (crítico ' + i.critico + ', arcilla ' + i.arcillaTexto + (i.asumida ? ', no medida' : '') + ')' : 'K ' + fmt(i.valorMg, 0) + ' mg/dm³, clase "' + i.clase + '" (crítico ' + i.critico + ', CTC ' + i.ctcTexto + (i.asumida ? ', no informada' : '') + ')') +
          (i.clase === 'alto' || i.clase === 'muy alto' ? ': el suelo cubre lo que pide el cultivo; ' + (ds.total ? 'se aplica solo la ' + ds.regla + ': ' + fmt(ds.total, 0) + ' kg/ha' : 'no hace falta aplicar') + '.' : ': el suelo no alcanza; ' + ds.regla + ' = ' + fmt(ds.total, 0) + ' kg/ha.');
        if (!ds.total) f.estado = 'no hace falta';
      } else { f.necesita = f.demanda; f.suelo = an ? 'El análisis no trae este dato: se muestra lo que se lleva el grano.' : 'Sin análisis de suelo del lote: se muestra lo que se lleva el grano. Con el análisis, SAFIA descuenta lo que aporta el suelo.'; }
      filas.push(f);
    });
    if (F) fuentes.push(F.FUENTE + ' (clases, corrección y manutención; CAPECO/IPTA 2012 lo adopta)');
    filas.forEach(function (f) { f.pct = f.necesita > 0 ? Math.round(f.aplicado / f.necesita * 100) : (f.aplicado > 0 || f.estado === 'no hace falta' ? 100 : 0); f.falta = Math.max(0, (f.necesita || 0) - f.aplicado); });
    return { cultivo: cu.cultivo, variedad: cu.variedad || '', metaT: metaT, tUsada: tUsada, metaSupuesta: !metaT, analisis: an, aplicado: ap, filas: filas, fuentes: fuentes.filter(function (x, i, a) { return a.indexOf(x) === i; }) };
  }
  function htmlDisponibilidad(camp, idx, legacy) {
    var D = disponibilidad(camp, idx, legacy); if (!D) return '<div class="muted">La campaña no tiene cultivo cargado.</div>';
    var color = { n: '#1565C0', p2o5: '#2E7D32', k2o: '#B8731A' };
    var h = '<div style="font-size:13px;color:#5C6166;margin-bottom:10px;">' + esc(D.cultivo) + (D.variedad ? ' (' + esc(D.variedad) + ')' : '') + ' · objetivo ' + (D.metaT ? fmt(D.metaT * 1000, 0) + ' kg/ha' : '<b>sin cargar</b>: se usa la referencia del manual, ' + fmt(D.tUsada * 1000, 0) + ' kg/ha') + '</div>';
    h += '<div style="font-size:12px;border-radius:8px;padding:8px 12px;margin-bottom:12px;background:' + (D.analisis ? '#E7F6EA' : '#FFF6D6') + ';">' + (D.analisis ? 'Suelo: análisis del ' + fechaLarga(D.analisis.fecha) + (D.analisis.nMuestras > 1 ? ' (promedio de ' + D.analisis.nMuestras + ' muestras)' : '') + '. El balance descuenta lo que aporta el suelo.' : 'Sin análisis de suelo del lote: solo se ve lo que se lleva el grano. Cargá el análisis en Banco → Análisis de suelo para saber cuánto aporta el suelo y cuánto hay que aplicar de verdad.') + '</div>';
    D.filas.forEach(function (f) {
      var pct = Math.min(100, f.pct), ok = f.necesita === 0 || f.pct >= 100;
      h += '<div style="border:1px solid #E1E4E7;border-radius:10px;padding:10px 12px;margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:700;"><span style="color:' + color[f.k] + ';">' + f.n + '</span><span>' + (f.necesita === 0 ? 'no hace falta aplicar' : fmt(f.aplicado, 0) + ' aplicado / ' + fmt(f.necesita, 0) + ' kg/ha a aplicar') + '</span></div>' +
        '<div style="height:8px;background:rgba(0,0,0,0.06);border-radius:100px;overflow:hidden;margin:6px 0 4px;"><div style="height:100%;width:' + (f.necesita === 0 ? 100 : pct) + '%;background:' + (ok ? '#178029' : (f.pct >= 50 ? '#B8731A' : '#B3261E')) + ';border-radius:100px;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:#5C6166;"><span>' + (f.necesita === 0 ? (f.k === 'n' ? 'lo cubre la fijación del rizobio (Embrapa)' : 'lo cubre el suelo') : (f.pct >= 100 ? 'cubierto' : f.pct + ' % cubierto · faltan ' + fmt(f.falta, 0) + ' kg/ha')) + '</span><span>se lleva el grano: ' + fmt(f.demanda, 0) + ' kg/ha</span></div>' +
        '<div style="font-size:12px;color:#2E3236;margin-top:6px;"><b>Aporta el suelo:</b> ' + esc(f.suelo) + '</div></div>';
    });
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Fuentes: ' + esc(D.fuentes.join(' · ')) + '. El % cubierto se mide contra lo que hace falta aplicar según el suelo, no contra toda la extracción. La dosis final la define el agrónomo.</div>';
    return h;
  }

  window.SafiaNutrientes = { disponibilidad: disponibilidad, htmlDisponibilidad: htmlDisponibilidad, EXPORT: EXPORT, ABSORCION: ABSORCION, exportado: exportado, aplicado: aplicado, cerrar: cerrar, balanceCampana: balanceCampana, ultimoBalanceDelLote: ultimoBalanceDelLote, analisisPosterior: analisisPosterior, reposicionPendiente: reposicionPendiente, htmlBalance: htmlBalance, htmlCampo: htmlCampo, htmlMicros: htmlMicros, analisisDelLote: analisisDelLote, alCambiarCampo: alCambiarCampo, clave: clave };
})();
