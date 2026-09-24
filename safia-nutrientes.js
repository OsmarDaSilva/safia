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
  function hoy() { return window.SafiaBalance && SafiaBalance.hoyLocal ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
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
    var t = { n: 0, p2o5: 0, k2o: 0, s: 0, items: 0, detalle: [] };
    if (!camp) return t;
    var ins = (camp.insumos || []).filter(function (i) { return i.cultivoIdx == null || i.cultivoIdx === (cultivoIdx || 0); });
    if (window.SafiaInsumos) ins.forEach(function (i) { var x = SafiaInsumos.npkDe(i); if (!x) return; t.n += x.n; t.p2o5 += x.p2o5; t.k2o += x.k2o; t.s += x.s || 0; t.items++; t.detalle.push((i.producto || i.formula || '') + ' ' + fmt(i.dosis, 0) + ' ' + (i.unidad || '')); });
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
    { k: 'boro', n: 'Boro (B)', bajo: 0.3, medio: 0.5, accionBajo: '1–2 kg B/ha al suelo (bórax o ulexita, dura 4–5 años) o foliar en floración', accionMedio: '0,5 kg B/ha al suelo o foliar en floración (para rindes altos)' },
    { k: 'zinc', n: 'Zinc (Zn)', bajo: 1.0, medio: 1.5, accionBajo: '6 kg Zn/ha al suelo (sulfato de zinc ~30 kg/ha, dura 4–5 años) o Zn en semilla + foliar', accionMedio: '1,5 kg Zn/ha al suelo o Zn en semilla + foliar (para rindes altos)' },
    { k: 'cobre', n: 'Cobre (Cu)', bajo: 0.5, medio: 0.8, accionBajo: '1–2 kg Cu/ha al suelo (sulfato de cobre) o foliar', accionMedio: '1 kg Cu/ha o foliar (para rindes altos)' },
    { k: 'manganeso', n: 'Manganeso (Mn)', bajo: 2.0, medio: 2.0, accionBajo: 'foliar de Mn en V4–R1 (frecuente con pH alto o encalado en exceso)', accionMedio: '' },
    { k: 'azufre', n: 'Azufre (S) en el suelo', bajo: 5, medio: 10, accionBajo: 'yeso agrícola 150–200 kg/ha o sulfato de amonio', accionMedio: '≈ 5 kg S por tonelada de meta (yeso o fórmula con S)' }
  ];
  // último análisis de suelo del lote (o del campo entero), el promedio si lo hay
  function analisisDelLote(equipoId) {
    var eq = leer('equipos').find(function (e) { return String(e.id) === String(equipoId); }), campoId = eq ? eq.campoId : null;
    var lista = leer('analisis_suelo').filter(function (a) { return a.fecha && !(a.enPromedio) && (String(a.equipoId || '') === String(equipoId) || (!a.equipoId && campoId != null && String(a.campoId) === String(campoId))); });
    lista.sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || ((b.esPromedio ? 1 : 0) - (a.esPromedio ? 1 : 0)) || ((String(b.equipoId || '') === String(equipoId) ? 1 : 0) - (String(a.equipoId || '') === String(equipoId) ? 1 : 0)); });
    if (!lista.length) return null;
    // varias muestras de la misma fecha sin promedio guardado: se promedian acá (como en Análisis de suelo)
    var f = String(lista[0].fecha), grupo = lista.filter(function (a) { return String(a.fecha) === f && !!a.equipoId === !!lista[0].equipoId; });
    if (grupo.length === 1 || grupo.some(function (a) { return a.esPromedio; })) return grupo.find(function (a) { return a.esPromedio; }) || grupo[0];
    var prom = { fecha: f, equipoId: lista[0].equipoId || null, campoId: lista[0].campoId, esPromedio: true, nMuestras: grupo.length };
    ['boro', 'zinc', 'cobre', 'manganeso', 'azufre'].forEach(function (k) { var vs = grupo.map(function (a) { return num(a[k]); }).filter(function (v) { return v != null; }); if (vs.length) prom[k] = vs.reduce(function (x, y) { return x + y; }, 0) / vs.length; });
    return prom;
  }
  function htmlMicros(bal) {
    var an = analisisDelLote(bal.equipoId);
    var camp = leer('campanas').find(function (c) { return String(c.id) === String(bal.campanaId); }) || {};
    var aplic = (camp.insumos || []).filter(function (i) { return (i.categoria === 'ts_micro' || i.categoria === 'foliar_micro') && (i.cultivoIdx == null || i.cultivoIdx === (bal.cultivoIdx || 0)); }).map(function (i) { return (i.producto || '') + (i.dosis ? ' ' + fmt(i.dosis, 1) + ' ' + (i.unidad || '') : ''); });
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
    h += '<div class="muted" style="font-size:11px;margin-top:4px;">' + (aplic.length ? 'Micronutrientes aplicados en esta campaña: ' + esc(aplic.join(' · ')) + '.' : 'Sin micronutrientes cargados en esta campaña (semilla o foliar).') + ' El grano se lleva estos elementos en gramos por hectárea: lo que manda es el análisis de suelo y el foliar, no el balance.</div>';
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
      : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#E6F4EA;color:#178029;font-size:11px;font-weight:700;">FIRME' + (bal.fechaFirme ? ' · cerrado el ' + fechaLarga(bal.fechaFirme) : '') + '</span>';
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
    h += '<div class="muted" style="font-size:11px;margin-top:6px;">Exportación por tonelada de grano según IPNI/Fertilizar (INTA), que se expresa a 0 % de humedad: SAFIA descuenta la humedad de cosecha (14 % si no se cargó) antes de calcular; el rinde que ves es el tuyo, en silo. P y K como P₂O₅ y K₂O. Entradas por fertilizante contra salidas por grano; no cuenta rastrojo ni pérdidas.</div></div>';
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

  window.SafiaNutrientes = { EXPORT: EXPORT, ABSORCION: ABSORCION, exportado: exportado, aplicado: aplicado, cerrar: cerrar, balanceCampana: balanceCampana, ultimoBalanceDelLote: ultimoBalanceDelLote, analisisPosterior: analisisPosterior, reposicionPendiente: reposicionPendiente, htmlBalance: htmlBalance, htmlCampo: htmlCampo, htmlMicros: htmlMicros, analisisDelLote: analisisDelLote, alCambiarCampo: alCambiarCampo, clave: clave };
})();
