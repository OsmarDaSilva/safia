/* SAFIA — Parte de seguimiento (seguimiento.html)
   -------------------------------------------------------------------
   Un solo parte por cliente, con todos sus pivots, para decidir: ¿seguimos dentro de la meta?, ¿qué ya no se puede
   recuperar?, ¿cómo venimos de agua y cuánto falta regar?, ¿qué toca ahora?, ¿qué falta cargar? No calcula nada nuevo
   salvo el riego que falta: junta lo que ya calculan los motores de SAFIA, con el mismo resultado que sus pantallas:
   - meta viva (SafiaSeguimiento.metaViva): potencial de hoy, lo perdido por ventana pasada, lo que toca ahora;
   - agua por etapa (SafiaAgua.calcular, FAO-56 + FAO-33): riego y lluvia del ciclo, episodios de estrés y rinde perdido;
   - riego del día (SafiaBalance.simular + SafiaFichaAgua.proximoRiego + consejoLamina): la misma orden del Operador;
   - mantenimiento (SafiaMant.estado), pasto y carne (SafiaForraje.resumen), ventana para pulverizar (SafiaPulverizar),
     energía de la campaña (SafiaEnergia.energiaDeCampana).
   Lo nuevo:
   - Pivot parado: evento 'parada' { fecha (desde), hasta, motivo } cargado por el operador. El parte cruza cada
     episodio de falta de agua con las paradas para decir el motivo (equipo parado) o que no hay motivo cargado.
   - Riego que falta hasta la cosecha: el mismo balance (SafiaAgua.balance) corrido desde hoy hasta el fin del ciclo con
     el clima de cada uno de los últimos 10 años (SafiaClimaProyecto.historico: lluvia CHIRPS y ET0 Penman-Monteith),
     regando cada vez que el suelo llega al punto de estrés. Se informa la mediana y el rango de 8 de cada 10 años.
     Es una estimación con el clima histórico, no un pronóstico.
   No se muestra una "probabilidad de llegar a la meta" (sería un número inventado): se muestra cuánto de la meta sigue
   siendo alcanzable hoy y qué se llevó el resto (decisión conversada con Osmar, 3-oct-2026). */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function dia(f) { return String(f || '').slice(0, 10); }
  function fmtF(f) { var p = dia(f).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function sumar(f, n) { var d = new Date(dia(f) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dias(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function rol() { var u = (window.SafiaSync && SafiaSync.usuario && SafiaSync.usuario()) || {}; return u.rol || ''; }
  function conTiempo(p, ms) { return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('tardó demasiado')); }, ms); })]); }

  var ETAPA = { pre: 'antes de sembrar', ini: 'inicial', veg: 'vegetativa', des: 'desarrollo', flor: 'floración', llen: 'llenado de grano', mad: 'maduración' };
  var MOTIVOS = { electrica: 'falla eléctrica', mecanica: 'falla mecánica', energia: 'corte de energía (ANDE)', bomba: 'falla de la bomba', agua: 'falta de agua en la fuente', mantenimiento: 'mantenimiento programado', otro: 'otro motivo' };
  var COL = { verde: '#22A93A', ambar: '#E0A316', rojo: '#D5432F', gris: '#B9BEC3' };

  // Los módulos del Banco leen por SafiaBanco: puente de solo lectura (el parte nunca cambia datos)
  var campoPuente = null;
  function puente(campo) { if (!window.SafiaBanco || window.SafiaBanco._parte) window.SafiaBanco = { _parte: true, campoActual: function () { return campoPuente; }, leer: leer, guardar: function () {}, toast: function () {}, refrescar: function () {} }; campoPuente = campo; }

  /* ---------- pivots del cliente ---------- */
  function clientesConPivots() {
    var campos = leer('campos'), eqs = leer('equipos').filter(function (e) { return !e.zona; });
    return leer('clientes').filter(function (cl) { return campos.some(function (c) { return String(c.clienteId) === String(cl.id) && eqs.some(function (e) { return String(e.campoId) === String(c.id); }); }); })
      .sort(function (a, b) { return String(a.nombre || '').localeCompare(String(b.nombre || '')); });
  }
  function pivotsDe(clienteId) {
    var campos = leer('campos').filter(function (c) { return String(c.clienteId) === String(clienteId); }), camps = leer('campanas'), out = [];
    campos.forEach(function (c) { leer('equipos').filter(function (e) { return !e.zona && String(e.campoId) === String(c.id); }).forEach(function (e) {
      var cam = camps.find(function (k) { return String(k.equipoId) === String(e.id) && k.estado === 'Activa' && k.cultivos && k.cultivos[0]; }) || null;
      out.push({ c: c, e: e, cam: cam, cu: cam ? cam.cultivos[0] : null });
    }); });
    return out;
  }

  /* ---------- paradas del pivot ---------- */
  // Una parada sin fecha de fin se da por terminada el día del primer riego cargado DESPUÉS de la parada: si se regó, el pivot ya
  // anda (Osmar, 4-oct-2026: pocos operadores van a avisar que volvió a andar). No se guarda: se deduce cada vez, así vale para los
  // riegos cargados desde cualquier pantalla (Operador, voz, Eventos, importación). Un riego del mismo día solo la cierra si se cargó después de marcar la parada.
  function finDe(p, todos) {
    if (p.hasta) return { hasta: dia(p.hasta), porRiego: false };
    var ini = dia(p.fecha), f = null;
    (todos || leer('eventos')).forEach(function (v) { if (v.tipo === 'riego' && String(v.equipoId) === String(p.equipoId) && v.fecha && (dia(v.fecha) > ini || (dia(v.fecha) === ini && v.fechaCreacion && p.fechaCreacion && String(v.fechaCreacion) > String(p.fechaCreacion))) && (num(v.cantidad) || 0) > 0 && (!f || dia(v.fecha) < f)) f = dia(v.fecha); });
    return { hasta: f, porRiego: !!f };
  }
  function paradasDe(equipoId, desde) {
    var todos = leer('eventos');
    return todos.filter(function (v) { return v.tipo === 'parada' && String(v.equipoId) === String(equipoId) && v.fecha; })
      .map(function (v) { var f = finDe(v, todos); return f.porRiego ? Object.assign({}, v, { hasta: f.hasta, cerradaPorRiego: true }) : v; })
      .filter(function (v) { return !desde || !v.hasta || dia(v.hasta) >= desde; })
      .sort(function (a, b) { return dia(a.fecha).localeCompare(dia(b.fecha)); });
  }
  function paradaAbierta(equipoId) { var l = paradasDe(equipoId).filter(function (p) { return !p.hasta; }); return l[l.length - 1] || null; }
  function motivoTxt(p) { return MOTIVOS[p.motivo] || p.motivo || 'motivo sin cargar'; }
  // ¿Un episodio de falta de agua coincide con el pivot parado?
  // Devuelve las paradas que tocan el episodio (o los 7 días anteriores: el suelo tarda en secarse) y qué parte del episodio cubren.
  function cruzar(epi, paradas, h) {
    var solape = function (a0, a1, b0, b1) { var i = a0 > b0 ? a0 : b0, f = a1 < b1 ? a1 : b1; return f >= i ? dias(i, f) + 1 : 0; };
    var m = [], dentro = 0;
    paradas.forEach(function (p) { var ini = dia(p.fecha), fin = p.hasta ? dia(p.hasta) : h; if (solape(ini, fin, sumar(epi.desde, -7), dia(epi.hasta)) > 0) { m.push(p); dentro += solape(ini, fin, dia(epi.desde), dia(epi.hasta)); } });
    return m.length ? { paradas: m, cubre: Math.min(1, dentro / Math.max(1, epi.dias)) } : null;
  }

  /* ---------- riego que falta hasta la cosecha ---------- */
  function finDeCiclo(ca, cultivo) {
    if (ca.cosecha) return ca.cosecha; if (ca.cosechaEstimada) return ca.cosechaEstimada;
    var f = window.SafiaBalance ? SafiaBalance.obtenerCultivoKc(cultivo) : null; if (!f) return null;
    return sumar(ca.siembra, (+f.L_ini || 20) + (+f.L_des || 30) + (+f.L_med || 60) + (+f.L_fin || 25));
  }
  function riegoRestante(res, ca, hist) {
    var h = hoy(), fin = finDeCiclo(ca, ca.cultivo); if (!fin || fin <= h || !hist || !hist.time) return null;
    var pasado = res.dias.filter(function (d) { return !d.pronostico; }).map(function (d) { return { fecha: d.fecha, et0: d.et0, lluvia: d.lluvia || 0, riego: d.riegoRepartido ? 0 : (d.riego || 0) }; });
    if (!pasado.length) return null;
    var op = { riegoDeclarado: 99999, eficiencia: res.eficiencia, lamina: 10 };
    var rA = SafiaAgua.balance(pasado, ca.cultivo, res.suelo, op).riegoRepartido;
    var idx = {}; hist.time.forEach(function (t, i) { idx[t] = i; });
    var anioHoy = +h.slice(0, 4), vals = [];
    for (var y = hist.desde; y <= hist.hasta; y++) {
      var fut = [], ok = true;
      for (var f = sumar(h, 1); f <= fin; f = sumar(f, 1)) {
        var clave = (y + (+f.slice(0, 4) - anioHoy)) + f.slice(4), i = idx[clave];
        if (i == null && f.slice(5) === '02-29') i = idx[(y + (+f.slice(0, 4) - anioHoy)) + '-02-28'];
        if (i == null || hist.et0[i] == null) { ok = false; break; }
        fut.push({ fecha: f, et0: hist.et0[i], lluvia: hist.lluvia[i] || 0, riego: 0 });
      }
      if (!ok || !fut.length) continue;
      vals.push(Math.max(0, SafiaAgua.balance(pasado.concat(fut), ca.cultivo, res.suelo, op).riegoRepartido - rA));
    }
    if (vals.length < 5) return null;
    vals.sort(function (a, b) { return a - b; });
    var q = function (p) { return vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))]; };
    return { mm: Math.round(q(0.5)), min: Math.round(q(0.1)), max: Math.round(q(0.9)), anios: vals.length, hasta: fin, diasFaltan: dias(h, fin), fuente: hist.lluviaFuente === 'chirps' ? 'lluvia CHIRPS y ET0 de los últimos ' + vals.length + ' años' : 'clima ERA5 de los últimos ' + vals.length + ' años' };
  }

  /* ---------- armar el parte de un pivot ---------- */
  function armar(x) {
    var e = x.e, c = x.c, cam = x.cam, cu = x.cu, h = hoy(), secano = window.SafiaBalance && SafiaBalance.esSecano(e);
    var D = { x: x, hoy: h, secano: secano, falta: [], errores: [], pastura: !!(cu && window.SafiaPasturas && SafiaPasturas.esPastura(cu.cultivo)) };
    if (!cam) { D.sinCampana = true; return Promise.resolve(D); }
    puente(c);
    D.siembra = cu.fechaSiembra ? dia(cu.fechaSiembra) : null; D.dds = D.siembra ? dias(D.siembra, h) : null;
    if (!D.siembra) { D.falta.push('la fecha de siembra de la campaña (sin ella no hay balance de agua)'); return Promise.resolve(D); }
    var coords = SafiaBalance.coordenadasLote(e, c);
    if (!coords) { D.falta.push('la coordenada del campo o el polígono del lote (sin eso no hay clima)'); }
    var tareas = [];

    // 1. riego del día: la misma orden del Operador
    if (coords) tareas.push(SafiaClima.obtenerClima({ lat: coords.lat, lon: coords.lon, daily: 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min', pastDays: SafiaBalance.pastDaysDesde(c.id, e.id), forecastDays: 16, cacheKey: coords.cacheKey || ('campo:' + c.id) }).then(function (rc) {
      if (!rc || !rc.datos) { D.errores.push('clima'); return; }
      var kc = SafiaBalance.obtenerCultivoKc(cu.cultivo) || leer('cultivos_custom').find(function (k) { return k.nombre === cu.cultivo; }) || null;
      var r = SafiaBalance.simular({ campo: c, daily: rc.datos.daily, eventos: leer('eventos'), equipoId: e.id, equipo: e, kcDef: kc, fechaSiembra: cu.fechaSiembra, fechaCosecha: cu.fechaCosecha || null, diasFuturo: 5, asumirRiegoRecomendado: false });
      D.r = r; D.prox = window.SafiaFichaAgua ? SafiaFichaAgua.proximoRiego(r, e) : null;
      if (r.suelo && r.suelo.esFallback) D.falta.push('el tipo de suelo o un análisis con % de arcilla (hoy se usa franco por defecto)');
    }).catch(function () { D.errores.push('clima'); }));

    // 2. agua por etapa: riego, lluvia, estrés y rinde perdido
    // (en pasturas no: el balance por etapa es para cultivos con siembra y cosecha; ahí se usa el balance diario del Operador)
    if (coords && window.SafiaAgua && !D.pastura) {
      var ca = SafiaAgua.campanasDelLote(e.id).find(function (k) { return k.id === String(cam.id) + '_0'; });
      if (ca) tareas.push(SafiaAgua.calcular(c, e, ca).then(function (res) {
        var reales = res.dias.filter(function (d) { return !d.pronostico; }), s = function (k) { return Math.round(reales.reduce(function (a, d) { return a + (d[k] || 0); }, 0)); };
        D.res = res; D.ca = ca;
        D.agua = { riego: Math.round(reales.reduce(function (a, d) { return a + (d.riegoRepartido ? 0 : (d.riego || 0)); }, 0)), lluvia: s('lluvia'), etc: s('etc'), eta: s('eta'), diasEstres: reales.filter(function (d) { return d.ks < 1; }).length, perdidaPct: res.perdidaPct || 0,
          etapa: reales.length ? reales[reales.length - 1].etapa : null, episodios: (res.episodios || []).filter(function (p) { return p.dias >= 2; }), lluviaCargada: !!res.lluviaDeEventos };
        D.ag = { perdidaPct: res.perdidaPct, etapa: D.agua.etapa };
      }).catch(function () { D.errores.push('agua'); }));
    }
    // 3. ventana para pulverizar de hoy
    if (coords && window.SafiaPulverizar && !D.pastura) tareas.push(SafiaPulverizar.ventanas(coords.lat, coords.lon).then(function (R) { D.pulv = R; }).catch(function () {}));

    return Promise.all(tareas).then(function () {
      // 4. meta viva
      if (cu.planMeta && window.SafiaSeguimiento) { try { D.mv = SafiaSeguimiento.metaViva({ campanaId: cam.id, idx: 0, campana: cam, cultivo: cu }, D.ag || null); } catch (er) { D.errores.push('meta'); } }
      D.meta = num(cu.rendimientoObj);
      if (!D.pastura && !cu.planMeta) D.falta.push(D.meta ? 'el plan de la meta (Banco → Meta de rinde): hay meta pero sin plan no se sabe si sigue alcanzable' : 'la meta de rinde de la campaña (Banco → Meta de rinde)');
      // 5. mantenimiento y paradas
      try { if (window.SafiaMant && !secano) D.mant = SafiaMant.estado(e); } catch (er) {}
      if (D.mant && D.mant.sinPlan) D.falta.push('el plan de mantenimiento del equipo (lo carga Irrigar)');
      D.paradas = secano ? [] : paradasDe(e.id, D.siembra); D.parado = secano ? null : paradaAbierta(e.id);
      // 6. pastura
      if (D.pastura && window.SafiaForraje) { try { D.forraje = SafiaForraje.resumen(e, cu, c); if (!D.forraje.pasto.medidos) D.falta.push('lecturas de altura del pasto (Operador → Altura del pasto)'); if (!(D.forraje.carne.periodos || []).length) D.falta.push('dos pesadas del lote para saber los kilos de carne (Operador → Pesada)'); } catch (er) { D.errores.push('pasto'); } }
      // 7. energía de la campaña (no para el operador)
      if (!secano && rol() !== 'operador' && window.SafiaEnergia) { try { D.energia = SafiaEnergia.energiaDeCampana(c, e, D.siembra, h); } catch (er) {} }
      // 8. datos que faltan
      if (!e.poligono || !e.poligono.partes) D.falta.push('el polígono del lote (sin él no hay satélite ni clima del lote)');
      if (!secano && D.dds > 20 && ((D.agua && D.agua.riego === 0) || (D.pastura && D.r && D.r.totalesPasado && !(D.r.totalesPasado.riegoBruto > 0)))) D.falta.push('los riegos hechos (si se regó y no se cargó, el suelo figura más seco de lo real)');
      if (!secano && !(num((e.datosTecnicos || {}).lamina100) > 0)) D.falta.push('la lámina y las horas por vuelta del pivot (ficha técnica, la carga Irrigar)');
      D.luces = luces(D);
      return D;
    });
  }
  function luces(D) {
    var L = {}, rec = D.r ? D.r.recomendacion : null, a = D.agua;
    if (D.pastura) { var F = D.forraje; L.meta = !F || F.uaReal == null || F.uaCapacidad == null ? 'gris' : (F.uaReal / F.uaCapacidad > 1.1 ? 'rojo' : F.uaReal / F.uaCapacidad < 0.7 ? 'ambar' : 'verde'); }
    else L.meta = D.mv ? (D.mv.k || 'gris') : 'gris';
    L.agua = !D.r ? 'gris' : (rec.enEstres && !rec.esperarLluvia) || (a && a.perdidaPct >= 5) ? 'rojo' : (rec.regar || rec.esperarLluvia || (a && a.perdidaPct > 0)) ? 'ambar' : 'verde';
    L.equipo = D.secano ? 'gris' : D.parado || (D.mant && D.mant.vencidas && D.mant.vencidas.length) ? 'rojo' : D.mant && D.mant.proximas && D.mant.proximas.length ? 'ambar' : D.mant && D.mant.sinPlan ? 'gris' : 'verde';
    L.datos = D.falta.length >= 3 ? 'rojo' : D.falta.length ? 'ambar' : 'verde';
    return L;
  }

  /* ---------- HTML ---------- */
  function luz(k, t) { return '<span title="' + esc(t || '') + '" style="display:inline-block;width:13px;height:13px;border-radius:50%;background:' + COL[k || 'gris'] + ';"></span>'; }
  function bloque(titulo, cuerpo, color) { return '<div style="border:1px solid #E1E4E7;border-left:4px solid ' + (color || '#B9BEC3') + ';border-radius:8px;padding:9px 12px;margin-top:8px;background:#fff;page-break-inside:avoid;"><div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6B7075;">' + titulo + '</div><div style="font-size:13.5px;line-height:1.5;margin-top:3px;">' + cuerpo + '</div></div>'; }
  function origen(t) { return ' <span style="font-size:11px;color:#8C9196;">(' + t + ')</span>'; }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : null; }

  function htmlMeta(D) {
    var mv = D.mv;
    if (!mv) return bloque('La meta', D.meta ? 'Meta de <b>' + fmt(D.meta) + ' kg/ha</b>, pero sin plan guardado: SAFIA no puede decir si sigue alcanzable. Armalo en Banco → Meta de rinde.' : 'Esta campaña no tiene meta de rinde cargada.', COL.gris);
    var pmin = pct(mv.min, mv.meta), pmax = pct(mv.max, mv.meta), enMeta = mv.max >= mv.meta;
    var t = 'Meta <b>' + fmt(mv.meta) + ' kg/ha</b>. Hoy el potencial es de <b>' + fmt(mv.min) + ' a ' + fmt(mv.max) + ' kg/ha</b>: ' + (enMeta ? '<b style="color:#178029;">la meta sigue al alcance</b>' : 'se puede llegar a entre <b>' + pmin + ' y ' + pmax + ' %</b> de la meta') + '.';
    var comp = [];
    if (mv.agua > 0) comp.push('la falta de agua ya descontó ' + fmt(mv.agua, 1) + ' %');
    if (mv.perdidos && mv.perdidos.length) comp.push(mv.perdidos.length + (mv.perdidos.length === 1 ? ' tarea del plan ya pasó de época' : ' tareas del plan ya pasaron de época'));
    t += '<br>Plan de la meta: <b>' + mv.hechos + ' de ' + mv.total + '</b> tareas hechas' + (comp.length ? '; ' + comp.join(' y ') : '') + '.' + (mv.sabemos ? '' : ' <span style="color:#8a5713;">Faltan insumos cargados: el potencial puede estar subestimado.</span>');
    if (mv.nutri && mv.nutri.texto) t += '<br>' + esc(mv.nutri.texto);
    return bloque('La meta', t + origen('plan de la meta y balance de agua de SAFIA'), COL[mv.k] || COL.gris);
  }
  function htmlPerdido(D) {
    var mv = D.mv; if (!mv || !mv.perdidos || !mv.perdidos.length) return '';
    return bloque('Lo que ya no se puede recuperar', '<ul style="margin:2px 0 0 18px;padding:0;">' + mv.perdidos.map(function (p) { return '<li><b>' + esc(p.it.nombre) + '</b>: pasó su época; cuesta entre ' + Math.round(p.ap[0] * 100) + ' y ' + Math.round(p.ap[1] * 100) + ' % del rinde. Ya no vale la pena aplicarlo en esta campaña.</li>'; }).join('') + '</ul>', COL.rojo);
  }
  function htmlAgua(D, id) {
    var a = D.agua; if (D.secano && a) return bloque('El agua (secano)', 'Llovieron <b>' + fmt(a.lluvia) + ' mm</b> desde la siembra; el cultivo consumió ' + fmt(a.eta) + ' de los ' + fmt(a.etc) + ' mm que pedía. ' + (a.diasEstres ? '<b>' + a.diasEstres + ' días con estrés</b>: costaron ' + fmt(a.perdidaPct, 1) + ' % del rinde.' : 'Sin días de estrés.'), a.perdidaPct >= 5 ? COL.rojo : a.diasEstres ? COL.ambar : COL.verde);
    if (!a) return bloque('El agua', 'No se pudo calcular el balance de agua de la campaña' + (D.errores.length ? ' (sin clima)' : '') + '.', COL.gris);
    var t = 'Desde la siembra se regaron <b>' + fmt(a.riego) + ' mm</b>' + origen('riegos cargados') + ' y llovieron <b>' + fmt(a.lluvia) + ' mm</b>' + origen(a.lluviaCargada ? 'pluviómetro y satélite' : 'satélite') + '. El cultivo consumió ' + fmt(a.eta) + ' de los ' + fmt(a.etc) + ' mm que pedía.';
    if (a.diasEstres) {
      t += '<br><b style="color:#B5371C;">' + a.diasEstres + ' días con estrés</b>: ya costaron <b>' + fmt(a.perdidaPct, 1) + ' % del rinde</b>.';
      if (a.episodios.length) t += '<ul style="margin:3px 0 0 18px;padding:0;">' + a.episodios.slice(-5).map(function (p) {
        var cr = cruzar(p, D.paradas || [], D.hoy);
        return '<li>Del ' + fmtF(p.desde) + ' al ' + fmtF(p.hasta) + ' (' + p.dias + ' días, en ' + (ETAPA[p.etapa] || p.etapa) + '): ' + (cr ? (function () { var lista = cr.paradas.map(function (q) { return esc(motivoTxt(q)) + ' (del ' + fmtF(q.fecha) + (q.hasta ? ' al ' + fmtF(q.hasta) + (q.cerradaPorRiego ? ', cuando se volvió a regar' : '') : ' hasta hoy') + ')'; }).join(' y ');
          return cr.cubre >= 0.6 ? 'coincide con el <b>pivot parado</b> por ' + lista + '.' : 'el <b>pivot estuvo parado</b> por ' + lista + ', pero eso explica solo una parte: <span style="color:#8a5713;">el resto de los días no hay parada cargada (faltó regar a tiempo, o se regó y no se cargó).</span>'; })() : '<span style="color:#8a5713;">no hay un pivot parado cargado en esas fechas: faltó regar a tiempo, o se regó y no se cargó.</span>') + '</li>'; }).join('') + '</ul>';
    } else t += '<br><b style="color:#178029;">Sin días de estrés</b>: no se perdió rinde por agua.';
    t += '<div id="' + id + '" style="margin-top:4px;color:#3A3E41;">Calculando cuánto falta regar hasta la cosecha…</div>';
    var en = D.energia; if (en && en.gs != null && window.SafiaEnergia) t += '<div style="margin-top:4px;">Energía del riego en lo que va de la campaña: <b>' + SafiaEnergia.plata(en.gs, en.moneda) + '</b> (' + fmt(en.kwh) + ' kWh)' + (en.cobertura != null && en.cobertura < 0.98 ? ', con facturas que cubren el ' + Math.round(en.cobertura * 100) + ' % del riego' : '') + '.</div>';
    return bloque('El agua', t, a.perdidaPct >= 5 ? COL.rojo : a.diasEstres ? COL.ambar : COL.verde);
  }
  // Pasturas: el agua de los últimos meses según el balance diario del Operador (no hay ciclo ni cosecha)
  function htmlAguaPastura(D) {
    var r = D.r, t = r && r.totalesPasado; if (!t) return '';
    var n = (r.pasado || []).length, est = t.diasEstres || 0;
    return bloque('El agua', 'En los últimos ' + n + ' días se regaron <b>' + fmt(t.riegoBruto) + ' mm</b>' + origen('riegos cargados') + ' y llovieron <b>' + fmt(t.lluviaBruta) + ' mm</b>. La pastura consumió ' + fmt(t.eta) + ' de los ' + fmt(t.etc) + ' mm que pedía.<br>' +
      (est ? '<b style="color:#B5371C;">' + est + ' días con estrés</b>: con sed la pastura crece menos, aunque no se "pierde" como un grano.' : '<b style="color:#178029;">Sin días de estrés.</b>') + (!(t.riegoBruto > 0) && est ? ' <span style="color:#8a5713;">No hay riegos cargados: si se regó y no se anotó, el suelo está mejor de lo que figura.</span>' : ''), est > 10 ? COL.rojo : est ? COL.ambar : COL.verde);
  }
  function htmlPasto(D) {
    var F = D.forraje; if (!F) return '';
    var p = F.pasto, c = F.carne, t = p.kgHaPromedio != null ? 'Pasto disponible: <b>' + fmt(p.kgHaPromedio) + ' kg MS/ha</b> (' + p.medidos + ' de ' + p.total + ' piquetes medidos)' + (F.diasPasto != null ? ', comida para <b>' + F.diasPasto + ' días</b>' : '') + '.' : 'Sin lecturas de altura: no se puede saber cuánto pasto hay.';
    if (F.tasa) t += '<br>Crece <b>' + fmt(F.tasa.kgDia) + ' kg MS/ha por día</b>' + origen(F.tasa.origen === 'medido' ? 'medido con la regla' : 'referencia de Irrigar, faltan lecturas') + '.';
    if (F.uaReal != null && F.uaCapacidad != null) { var rel = F.uaReal / F.uaCapacidad; t += '<br>Carga: <b>' + fmt(F.uaReal, 1) + ' UA/ha</b>; el pasto aguanta ' + fmt(F.uaCapacidad, 1) + '. ' + (rel > 1.1 ? '<b style="color:#B5371C;">Hay más animales que pasto: sacar o suplementar.</b>' : rel < 0.7 ? '<b style="color:#8a5713;">Sobra pasto: se pueden sumar animales.</b>' : 'Carga ajustada.'); }
    if (c.periodos && c.periodos.length) t += '<br>Carne: <b>' + fmt(c.gmd, 2) + ' kg por animal por día</b>; ' + fmt(c.kgHa) + ' kg de peso vivo/ha en ' + c.dias + ' días (a este ritmo, ' + fmt(c.kgHaAnio) + ' kg/ha/año).';
    return bloque('El pasto y la carne', t + origen(F.factor ? (F.factor.origen === 'calibrado' ? 'kilos calibrados en el campo' : 'kilos con factor orientativo de Embrapa') : ''), COL[D.luces.meta]);
  }
  function htmlAhora(D) {
    var it = [], p = D.prox, rec = D.r ? D.r.recomendacion : null;
    if (D.parado) it.push('<b style="color:#B5371C;">El pivot figura PARADO desde el ' + fmtF(D.parado.fecha) + '</b> por ' + esc(motivoTxt(D.parado)) + '. Cuando vuelva a andar, cargarlo en Operador → Pivot parado.');
    if (p && !D.secano) { var cl = rec && rec.regar && !rec.esperarLluvia && SafiaBalance.consejoLamina ? SafiaBalance.consejoLamina(D.r, D.x.e, rec.mm) : null; it.push('<b>Riego: ' + esc(p.titulo) + '.</b>' + (cl && cl.texto ? ' Hacerlo en ' + esc(cl.texto) + '. ' + esc(cl.notaCorta) : '') + ' Agua útil hoy: ' + fmt(D.r.porcentajeHoy) + ' %.'); }
    if (D.mv && D.mv.ahora) D.mv.ahora.forEach(function (a) { it.push('<b>' + esc(a.it.nombre) + '</b>' + (a.it.accion ? ': ' + esc(a.it.accion) : '')); });
    if (D.mant && D.mant.vencidas && D.mant.vencidas.length) it.push('<b style="color:#B5371C;">Mantenimiento vencido:</b> ' + esc(D.mant.vencidas.slice(0, 4).map(function (t) { return t.tarea; }).join('; ')) + (D.mant.vencidas.length > 4 ? ' y ' + (D.mant.vencidas.length - 4) + ' más' : '') + '.');
    if (D.pulv && D.pulv.dias && D.pulv.dias[0]) { var d0 = D.pulv.dias[0], tr = function (l) { return l.map(function (z) { return z[0] + ' a ' + z[1] + ' h'; }).join(' y '); }; it.push('Pulverizar hoy: ' + (d0.ideal.length ? '<b>ventana ideal de ' + tr(d0.ideal) + '</b>' : d0.cuidado.length ? 'solo con cuidado, de ' + tr(d0.cuidado) : 'sin ventana') + '.'); }
    if (D.pastura && window.SafiaPasturas) { try { var st = SafiaPasturas.estadoPiquetes(D.x.e.id, D.x.cu); if (st.ocupado) it.push('Animales en el piquete <b>' + esc(st.ocupado) + '</b>' + (st.listos.length ? '; a punto: ' + esc(st.listos.filter(function (q) { return q !== st.ocupado; }).slice(0, 3).join(', ')) : '') + '.'); } catch (er) {} }
    var fut = D.mv && D.mv.futuros && D.mv.futuros.length ? '<div style="margin-top:4px;color:#3A3E41;">Lo que viene: ' + esc(D.mv.futuros.slice(0, 4).map(function (f) { return f.it.nombre; }).join(' · ')) + '.</div>' : '';
    if (!it.length) return bloque('Lo que toca ahora', 'Nada pendiente para hoy.' + fut, COL.verde);
    return bloque('Lo que toca ahora', '<ul style="margin:2px 0 0 18px;padding:0;">' + it.map(function (x) { return '<li style="margin:2px 0;">' + x + '</li>'; }).join('') + '</ul>' + fut, COL.ambar);
  }
  function htmlFalta(D) {
    if (!D.falta.length) return '';
    return bloque('Lo que falta cargar para que el parte sea más preciso', '<ul style="margin:2px 0 0 18px;padding:0;">' + D.falta.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>', COL.gris);
  }
  function htmlPivot(D, n) {
    var x = D.x, cab = '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;"><h3 style="margin:0;font-size:17px;">' + esc(x.e.nombre) + ' <span style="font-weight:500;color:#6B7075;font-size:13px;">· ' + esc(x.c.nombre) + '</span></h3>';
    if (D.sinCampana) return '<div class="card" style="margin-bottom:12px;page-break-inside:avoid;">' + cab + '</div><div class="muted" style="margin-top:4px;">Sin campaña activa en este lote.</div></div>';
    var etapa = D.agua && D.agua.etapa ? ETAPA[D.agua.etapa] || D.agua.etapa : null;
    cab += '<span style="font-size:13px;color:#3A3E41;">' + esc(x.cu.cultivo) + (x.cu.variedad ? ' ' + esc(x.cu.variedad) : '') + (D.dds != null ? ' · día ' + D.dds : '') + (etapa && !D.pastura ? ' · ' + etapa : '') + (D.secano ? ' · secano' : '') + '</span></div>';
    var cuerpo = D.pastura ? htmlPasto(D) + htmlAhora(D) + htmlAguaPastura(D) : htmlMeta(D) + htmlPerdido(D) + htmlAgua(D, 'rest_' + n) + htmlAhora(D);
    return '<div class="card" style="margin-bottom:12px;">' + cab + cuerpo + htmlFalta(D) + '</div>';
  }
  function htmlResumen(Ds) {
    var td = function (t, centro) { return '<td style="padding:6px;border-top:1px solid #EEF0F2;vertical-align:top;' + (centro ? 'text-align:center;' : '') + '">' + t + '</td>'; };
    var th = function (t, centro) { return '<th style="padding:4px 6px;' + (centro ? 'text-align:center;' : '') + '">' + t + '</th>'; };
    var filas = Ds.map(function (D) {
      if (D.sinCampana) return '<tr>' + td('<b>' + esc(D.x.e.nombre) + '</b>') + '<td colspan="6" style="padding:6px;border-top:1px solid #EEF0F2;color:#8C9196;">sin campaña activa</td></tr>';
      var L = D.luces, mv = D.mv, a = D.agua;
      var linea = D.pastura ? (D.forraje && D.forraje.pasto.kgHaPromedio != null ? fmt(D.forraje.pasto.kgHaPromedio) + ' kg MS/ha' : 'sin lecturas') : mv ? (mv.max >= mv.meta ? 'en meta' : pct(mv.min, mv.meta) + '–' + pct(mv.max, mv.meta) + ' % de la meta') : 'sin plan de meta';
      return '<tr>' + td('<b>' + esc(D.x.e.nombre) + '</b><div style="font-size:11px;color:#8C9196;">' + esc(D.x.cu.cultivo) + (D.dds != null ? ' · día ' + D.dds : '') + '</div>') + td(luz(L.meta), 1) + td(linea) + td(luz(L.agua), 1) +
        td((D.r ? fmt(D.r.porcentajeHoy) + ' % · ' + (D.prox ? esc(D.prox.titulo) : '') : '—') + (a && a.perdidaPct > 0 ? '<div style="font-size:11px;color:#B5371C;">ya se perdió ' + fmt(a.perdidaPct, 1) + ' % por agua</div>' : '')) + td(luz(L.equipo), 1) + td(luz(L.datos), 1) + '</tr>';
    }).join('');
    return '<div class="card" style="margin-bottom:12px;"><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px;"><thead><tr style="text-align:left;color:#8C9196;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">' +
      th('Pivot') + th('Meta', 1) + th('') + th('Agua', 1) + th('Hoy') + th('Equipo', 1) + th('Datos', 1) + '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<div style="font-size:11px;color:#8C9196;margin-top:6px;">' + luz('verde') + ' bien &nbsp; ' + luz('ambar') + ' atención &nbsp; ' + luz('rojo') + ' problema &nbsp; ' + luz('gris') + ' sin datos · Meta: lo que sigue alcanzable · Agua: estrés y riego de hoy · Equipo: parado o mantenimiento vencido · Datos: lo que falta cargar</div></div>';
  }

  /* ---------- pantalla ---------- */
  function pintar(cont, clienteId) {
    var lista = pivotsDe(clienteId), cli = leer('clientes').find(function (k) { return String(k.id) === String(clienteId); });
    var out = cont.querySelector('#parteCuerpo');
    if (!lista.length) { out.innerHTML = '<div class="card"><div class="muted">Este cliente no tiene pivots ni lotes cargados.</div></div>'; return; }
    out.innerHTML = '<div class="card"><div class="muted">Armando el parte de ' + lista.length + ' lote' + (lista.length === 1 ? '' : 's') + ': clima, balance de agua, meta y equipo…</div></div>';
    var Ds = [], cadena = Promise.resolve();
    lista.sort(function (a, b) { return (b.cam ? 1 : 0) - (a.cam ? 1 : 0) || String(a.e.nombre).localeCompare(String(b.e.nombre)); });
    lista.forEach(function (x) { cadena = cadena.then(function () { return armar(x).catch(function (er) { console.error(er); return { x: x, falta: [], errores: ['general'], sinCampana: !x.cam, luces: {} }; }).then(function (D) { Ds.push(D); }); }); });
    cadena.then(function () {
      var h = hoy(), fecha = new Date(h + 'T12:00:00').toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      out.innerHTML = '<div style="font-size:13px;color:#3A3E41;margin-bottom:8px;"><b>' + esc(cli ? cli.nombre : '') + '</b> · parte del ' + fecha + ' · ' + Ds.filter(function (D) { return !D.sinCampana; }).length + ' lote(s) en campaña</div>' +
        htmlResumen(Ds) + Ds.map(function (D, n) { return htmlPivot(D, n); }).join('') +
        '<div class="muted" style="font-size:11px;line-height:1.5;">Este parte junta lo que SAFIA ya calcula en cada pantalla: la orden de riego del Operador, el balance de agua por etapa (FAO-56 y FAO-33), el plan de la meta y el mantenimiento. La humedad es calculada, no medida, salvo que haya sonda: el riego que no se cargó no existe para SAFIA. El riego que falta es una estimación con el clima de los últimos 10 años, no un pronóstico. SAFIA muestra y compara; la decisión es del productor y de su agrónomo.</div>';
      // riego que falta: en segundo plano (el clima de 10 años puede tardar)
      Ds.forEach(function (D, n) {
        var el = document.getElementById('rest_' + n); if (!el) return;
        if (D.secano || !D.res || !D.ca || !window.SafiaClimaProyecto) { el.textContent = ''; return; }
        var co = SafiaBalance.coordenadasLote(D.x.e, D.x.c);
        conTiempo(SafiaClimaProyecto.historico(co.lat, co.lon), 90000).then(function (hist) {
          var R = riegoRestante(D.res, D.ca, hist), e2 = document.getElementById('rest_' + n); if (!e2) return;
          e2.innerHTML = R ? 'Hasta la cosecha (' + fmtF(R.hasta) + ', faltan ' + R.diasFaltan + ' días) quedan por regar <b>unos ' + fmt(R.mm) + ' mm</b>, entre ' + fmt(R.min) + ' y ' + fmt(R.max) + ' según el año' + origen('estimado con ' + R.fuente) + '.' : '';
        }).catch(function () { var e3 = document.getElementById('rest_' + n); if (e3) e3.innerHTML = '<span class="muted">No se pudo estimar el riego que falta (el clima de 10 años no respondió).</span>'; });
      });
    });
  }
  function montar(cont) {
    var cls = clientesConPivots(), guard = null; try { guard = sessionStorage.getItem('parte_cliente'); } catch (e) {}
    // llegó desde un aviso del celular (?equipo=…): se abre en el cliente de ese pivot
    try { var qe = new URLSearchParams(location.search).get('equipo'); if (qe) { var eqA = leer('equipos').find(function (x) { return String(x.id) === String(qe); }), caA = eqA && leer('campos').find(function (x) { return String(x.id) === String(eqA.campoId); }); if (caA && caA.clienteId != null) guard = caA.clienteId; } } catch (e) {}
    if (!cls.length) { cont.innerHTML = '<div class="card"><div class="muted">Todavía no hay clientes con pivots cargados.</div></div>'; return; }
    var actual = cls.find(function (k) { return String(k.id) === String(guard); }) || cls.find(function (k) { return pivotsDe(k.id).some(function (p) { return p.cam; }); }) || cls[0];
    cont.innerHTML = '<div class="parte-barra" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">' +
      (cls.length > 1 ? '<select id="parteCliente" style="padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;max-width:100%;">' + cls.map(function (k) { return '<option value="' + esc(k.id) + '"' + (k === actual ? ' selected' : '') + '>' + esc(k.nombre) + '</option>'; }).join('') + '</select>' : '') +
      '<button class="btn" id="parteActualizar">Actualizar</button><button class="btn green" id="parteImprimir">Imprimir</button></div><div id="parteCuerpo"></div>';
    var sel = cont.querySelector('#parteCliente'), ir = function () { var id = sel ? sel.value : actual.id; try { sessionStorage.setItem('parte_cliente', String(id)); } catch (e) {} pintar(cont, id); };
    if (sel) sel.addEventListener('change', ir);
    cont.querySelector('#parteActualizar').addEventListener('click', ir);
    cont.querySelector('#parteImprimir').addEventListener('click', function () { window.print(); });
    ir();
  }
  window.SafiaParte = { montar: montar, armar: armar, pivotsDe: pivotsDe, riegoRestante: riegoRestante, paradasDe: paradasDe, paradaAbierta: paradaAbierta, finDe: finDe, MOTIVOS: MOTIVOS, motivoTxt: motivoTxt, cruzar: cruzar };
})();
