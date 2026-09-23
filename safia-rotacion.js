/* SAFIA — Plan de rotación (Banco Agronómico → pestaña "Plan de rotación")
   -------------------------------------------------------------------
   Planifica 1 a 3 años por lote: qué se siembra en cada temporada
   (verano, zafriña, invierno) con objetivo de rinde, y compara el plan
   contra las campañas reales a medida que se cargan (cumplido / cambiado).
   Avisa cuando el plan rompe las reglas de rotación de la siembra directa.

   Reglas y fuentes (números entre corchetes en los avisos):
   [1] Embrapa Soja, "Rotação de culturas": no repetir la misma especie en
       la misma área en un intervalo menor a un año; la sucesión continua
       soja-trigo o soja-maíz zafriña degrada el suelo y favorece plagas,
       enfermedades y malezas; la rotación bien hecha rinde ~10 % más.
   [2] CAPECO / FEPASIDIAS / INBIO (Paraguay): la base de la siembra
       directa es el suelo siempre cubierto; el maíz es el principal
       cultivo de rotación; trigo, canola, girasol, avena y coberturas
       (avena negra, nabo forrajero, lupino, mezclas) completan el sistema.
   [3] Embrapa Girassol: no repetir girasol en el mismo lote antes de 4
       años (Sclerotinia, podredumbre blanca); la canola comparte el mismo
       hongo: intervalo de 3 años y no sucederse con girasol.
   [4] Embrapa (ILPF / Sistema Santa Fe): brachiaria como cobertura antes
       de la soja mejora la estructura del suelo y el rinde (+15 %).
   Datos: colección `planes_rotacion` (un plan por lote), sincronizada en
   Supabase (tabla safia_planes). Depende de window.SafiaBanco. */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var iniciado = false;

  /* ---------- catálogos ---------- */
  var EPOCAS = [
    { k: 'verano',   n: 'Verano',   meses: [9, 10, 11, 12], siembra: 'sep–dic', cosecha: 'ene–mar' },
    { k: 'zafrina',  n: 'Zafriña',  meses: [1, 2, 3],       siembra: 'ene–mar', cosecha: 'may–jul' },
    { k: 'invierno', n: 'Invierno', meses: [4, 5, 6, 7, 8], siembra: 'abr–jun', cosecha: 'ago–oct' }
  ];
  var RENTA = {
    verano:   ['Soja', 'Maíz', 'Girasol', 'Sorgo', 'Poroto', 'Arroz', 'Algodón', 'Mandioca', 'Caña de azúcar'],
    zafrina:  ['Maíz', 'Girasol', 'Sorgo', 'Poroto', 'Soja'],
    invierno: ['Trigo', 'Canola', 'Avena (grano)', 'Cebada', 'Girasol', 'Maíz']
  };
  var COBERTURAS = [
    ['Avena negra', 'invierno'], ['Avena negra + nabo forrajero', 'invierno'], ['Nabo forrajero', 'invierno'], ['Nabo + lupino', 'invierno'],
    ['Centeno / triticale', 'invierno'], ['Brachiaria ruziziensis', 'todas'], ['Brachiaria brizantha', 'todas'], ['Milheto', 'todas'],
    ['Sorgo forrajero', 'todas'], ['Crotalaria', 'todas'], ['Mucuna', 'todas'], ['Mezcla de coberturas', 'todas'], ['Pastura (integración)', 'todas']
  ];
  var DESCANSO = 'Descanso / rastrojo';
  var LEGUMINOSAS = ['soja', 'poroto', 'crotalaria', 'mucuna', 'lupino'];
  var GRAMINEAS = ['maiz', 'trigo', 'sorgo', 'avena', 'cebada', 'centeno', 'triticale', 'arroz', 'brachiaria', 'milheto', 'pastura', 'cana'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function especie(cultivo) {
    var n = norm(cultivo);
    if (!n || n.indexOf('descanso') === 0 || n.indexOf('barbecho') === 0 || n.indexOf('rastrojo') === 0) return 'descanso';
    var claves = ['soja', 'maiz', 'trigo', 'girasol', 'sorgo', 'canola', 'avena', 'cebada', 'poroto', 'arroz', 'algodon', 'mandioca', 'cana', 'brachiaria', 'brizantha', 'milheto', 'nabo', 'centeno', 'triticale', 'crotalaria', 'mucuna', 'lupino', 'pastura', 'mezcla'];
    for (var i = 0; i < claves.length; i++) if (n.indexOf(claves[i]) >= 0) return claves[i] === 'brizantha' ? 'brachiaria' : claves[i];
    return n.split(/[\s(/+]/)[0];
  }
  function esCobertura(cultivo) { var n = norm(cultivo); return COBERTURAS.some(function (c) { return norm(c[0]) === n; }) || /cobertura|forrajer|brachiaria|milheto|nabo|crotalaria|mucuna|pastura|mezcla/.test(n); }
  function familia(cultivo) { var e = especie(cultivo); if (LEGUMINOSAS.indexOf(e) >= 0) return 'leguminosa'; if (GRAMINEAS.indexOf(e) >= 0) return 'graminea'; return 'otra'; }
  function fmtKg(v) { return v == null || v === '' ? '—' : Math.round(v).toLocaleString('es-PY'); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }

  /* ---------- temporadas ---------- */
  // Una fecha de siembra cae en una temporada: verano = siembra sep–dic del año Y ("Verano Y/Y+1");
  // zafriña = siembra ene–mar del año Y; invierno = siembra abr–ago del año Y.
  function temporadaDe(fechaSiembra) {
    var f = String(fechaSiembra || '').slice(0, 10); if (f.length < 7) return null;
    var y = +f.slice(0, 4), m = +f.slice(5, 7);
    if (m >= 9) return { epoca: 'verano', anio: y };
    if (m <= 3) return { epoca: 'zafrina', anio: y };
    return { epoca: 'invierno', anio: y };
  }
  function etiqueta(t) { return t.epoca === 'verano' ? 'Verano ' + t.anio + '/' + String(t.anio + 1).slice(2) : (t.epoca === 'zafrina' ? 'Zafriña ' + t.anio : 'Invierno ' + t.anio); }
  function orden(t) { return t.epoca === 'verano' ? t.anio * 3 + 0 : (t.epoca === 'zafrina' ? (t.anio - 1) * 3 + 1 : (t.anio - 1) * 3 + 2); }
  function siguiente(t) { return t.epoca === 'verano' ? { epoca: 'zafrina', anio: t.anio + 1 } : (t.epoca === 'zafrina' ? { epoca: 'invierno', anio: t.anio } : { epoca: 'verano', anio: t.anio }); }
  function temporadaActual() { var d = new Date(); return temporadaDe(d.toISOString().slice(0, 10)); }
  function mismaTemp(a, b) { return a && b && a.epoca === b.epoca && a.anio === b.anio; }

  /* ---------- historial real del lote ---------- */
  function historialDelLote(equipoId) {
    var salida = [];
    B().leer('campanas').forEach(function (c) {
      if (String(c.equipoId) !== String(equipoId)) return;
      (c.cultivos || []).forEach(function (cu, i) {
        if (!cu || !cu.fechaSiembra) return;
        var t = temporadaDe(cu.fechaSiembra); if (!t) return;
        var cos = (c.cosechas && c.cosechas[i] && c.cosechas[i].fecha) || (i === 0 && c.cosecha && c.cosecha.fecha) || null;
        salida.push({ temporada: t, cultivo: cu.cultivo || '—', siembra: cu.fechaSiembra.slice(0, 10), cosecha: cos ? cos.slice(0, 10) : null, rinde: parseFloat(cu.rendimientoReal) || null, cobertura: cu.cobertura || '', origen: 'campaña' });
      });
    });
    B().leer('ciclos').forEach(function (ci) {
      if (String(ci.equipoId || '') !== String(equipoId) || !ci.fechaSiembra) return;
      var t = temporadaDe(ci.fechaSiembra); if (!t) return;
      salida.push({ temporada: t, cultivo: ci.cultivo || '—', siembra: ci.fechaSiembra.slice(0, 10), cosecha: ci.fechaCosecha || null, rinde: parseFloat(ci.rindeKgHa) || null, cobertura: ci.cobertura || '', origen: 'histórico' });
    });
    return salida.sort(function (a, b) { return orden(a.temporada) - orden(b.temporada) || a.siembra.localeCompare(b.siembra); });
  }

  /* ---------- plan (datos) ---------- */
  function planDelLote(equipoId) {
    return B().leer('planes_rotacion').find(function (p) { return String(p.equipoId) === String(equipoId); }) || null;
  }
  function guardarPlan(plan) {
    var lista = B().leer('planes_rotacion').filter(function (p) { return String(p.equipoId) !== String(plan.equipoId); });
    plan.modificado = new Date().toISOString();
    lista.push(plan);
    B().guardar('planes_rotacion', lista);
  }
  // Temporadas del plan: desde la siguiente a la última real (o la actual) hasta N años
  function temporadasNuevas(equipoId, anios) {
    var hist = historialDelLote(equipoId);
    var desde = hist.length ? siguiente(hist[hist.length - 1].temporada) : temporadaActual();
    var hoy = temporadaActual();
    if (orden(desde) < orden(hoy)) desde = hoy;
    var out = [], t = desde;
    for (var i = 0; i < anios * 3; i++) { out.push({ epoca: t.epoca, anio: t.anio, cultivo: '', objetivoKgHa: null, nota: '' }); t = siguiente(t); }
    return out;
  }
  // Sugerencia de rotación de 3 años para la Región Oriental [1][2][4]
  function sugerir(equipoId, temporadas, lote) {
    var hist = historialDelLote(equipoId);
    // cuántos veranos seguidos de soja trae el lote (para no proponer un tercero)
    var racha = 0;
    hist.filter(function (h) { return h.temporada.epoca === 'verano'; }).forEach(function (h) { racha = especie(h.cultivo) === 'soja' ? racha + 1 : 0; });
    var ultimo = hist.length ? especie(hist[hist.length - 1].cultivo) : '';
    var anioPlan = 0, veranoCultivo = '';
    temporadas.forEach(function (t, i) {
      if (t.epoca === 'verano') {
        anioPlan++;
        // soja salvo que ya vengan 2 veranos de soja seguidos (o el lote termina en soja recién sembrada): entonces maíz de primera
        var maiz = racha >= 2 || (i === 0 && ultimo === 'soja');
        veranoCultivo = maiz ? 'Maíz' : 'Soja';
        racha = maiz ? 0 : racha + 1;
        t.cultivo = veranoCultivo;
      } else if (t.epoca === 'zafrina') {
        // tras soja: maíz zafriña (año 1) o libre para trigo (año 2); tras maíz de primera: girasol o descanso
        if (veranoCultivo === 'Maíz') t.cultivo = anioPlan % 2 === 0 ? DESCANSO : 'Girasol';
        else t.cultivo = anioPlan % 2 === 0 ? DESCANSO : 'Maíz';
        if (i === 0 && ultimo === 'soja') t.cultivo = 'Maíz';
      } else {
        // invierno: trigo el año que la zafriña quedó libre; si no, cobertura (brachiaria cada 3 años antes de la soja)
        var prevZaf = temporadas[i - 1] && temporadas[i - 1].epoca === 'zafrina' ? temporadas[i - 1].cultivo : '';
        t.cultivo = prevZaf === DESCANSO ? 'Trigo' : (anioPlan % 3 === 0 ? 'Brachiaria ruziziensis' : 'Avena negra + nabo forrajero');
      }
      t.objetivoKgHa = objetivoSugerido(equipoId, t.cultivo);
    });
    return temporadas;
  }
  // Objetivo: el mejor de las últimas 3 campañas de ese cultivo en el lote
  function objetivoSugerido(equipoId, cultivo) {
    if (!cultivo || esCobertura(cultivo) || cultivo === DESCANSO) return null;
    var e = especie(cultivo);
    var r = historialDelLote(equipoId).filter(function (h) { return especie(h.cultivo) === e && h.rinde; }).slice(-3).map(function (h) { return h.rinde; });
    return r.length ? Math.round(Math.max.apply(null, r) / 100) * 100 : null;
  }

  /* ---------- estado contra lo real ---------- */
  function estadoDe(t, hist) {
    var reales = hist.filter(function (h) { return mismaTemp(h.temporada, t); });
    var hoy = temporadaActual();
    if (!reales.length) return orden(t) < orden(hoy) ? { k: 'sin', txt: 'Sin registro' } : (mismaTemp(t, hoy) ? { k: 'curso', txt: 'En curso (sin campaña cargada)' } : { k: 'plan', txt: 'Planificado' });
    var r = reales[reales.length - 1];
    if (!t.cultivo || t.cultivo === DESCANSO) return { k: 'cambio', txt: 'Se sembró ' + r.cultivo + (r.rinde ? ' · ' + fmtKg(r.rinde) + ' kg/ha' : ''), real: r };
    if (especie(r.cultivo) === especie(t.cultivo)) {
      var dif = (r.rinde && t.objetivoKgHa) ? Math.round((r.rinde - t.objetivoKgHa) / t.objetivoKgHa * 100) : null;
      return { k: r.rinde ? 'ok' : 'curso', txt: r.rinde ? 'Cumplido · ' + fmtKg(r.rinde) + ' kg/ha' + (dif != null ? ' (' + (dif >= 0 ? '+' : '') + dif + ' % vs objetivo)' : '') : 'En curso · sembrado ' + fmtF(r.siembra), real: r };
    }
    return { k: 'cambio', txt: 'Cambiado: se sembró ' + r.cultivo + (r.rinde ? ' · ' + fmtKg(r.rinde) + ' kg/ha' : ''), real: r };
  }

  /* ---------- reglas de rotación ---------- */
  // secuencia = historial real + plan, como lista ordenada de {temporada, cultivo}
  function avisos(secuencia) {
    var out = [];
    var s = secuencia.filter(function (x) { return x.cultivo; });
    function agregar(tipo, texto, t) { out.push({ tipo: tipo, texto: texto, temporada: t ? etiqueta(t) : '' }); }
    for (var i = 1; i < s.length; i++) {
      var a = s[i - 1], b = s[i], ea = especie(a.cultivo), eb = especie(b.cultivo);
      if (!b.plan) continue;   // solo se avisa sobre lo planificado
      // misma especie en temporadas consecutivas
      if (eb !== 'descanso' && ea === eb && !esCobertura(b.cultivo)) agregar('alto', b.cultivo + ' sobre ' + a.cultivo + ' en temporadas seguidas: la misma especie no debería repetirse en el lote en menos de un año; se acumulan enfermedades, plagas y malezas específicas [1].', b.temporada);
      // dos leguminosas de renta seguidas
      if (familia(a.cultivo) === 'leguminosa' && familia(b.cultivo) === 'leguminosa' && !esCobertura(b.cultivo) && eb !== 'descanso' && ea !== eb) agregar('medio', 'Dos leguminosas seguidas (' + a.cultivo + ' → ' + b.cultivo + '): conviene alternar con una gramínea (maíz, sorgo, trigo) que deje más rastrojo [1].', b.temporada);
    }
    // veranos de soja seguidos
    var veranos = s.filter(function (x) { return x.temporada.epoca === 'verano'; });
    for (var v = 0; v < veranos.length; v++) {
      if (!veranos[v].plan) continue;
      var seg = 0; for (var k = v; k >= 0 && especie(veranos[k].cultivo) === 'soja'; k--) seg++;
      if (seg >= 3) agregar('medio', etiqueta(veranos[v].temporada) + ': tercer verano seguido con soja. Aunque haya maíz zafriña entre medio, un verano con maíz de primera, girasol o sorgo cada 3 años corta el ciclo de enfermedades y rinde más (~10 %) [1][2].', veranos[v].temporada);
    }
    // inviernos sin cobertura ni cultivo, dos seguidos
    var inv = s.filter(function (x) { return x.temporada.epoca === 'invierno'; });
    for (var j = 1; j < inv.length; j++) {
      if (!inv[j].plan) continue;
      if (especie(inv[j].cultivo) === 'descanso' && especie(inv[j - 1].cultivo) === 'descanso') agregar('medio', etiqueta(inv[j].temporada) + ': segundo invierno sin cobertura ni cultivo. En siembra directa el suelo tiene que estar siempre cubierto: avena negra, nabo, lupino o una mezcla [2].', inv[j].temporada);
    }
    // girasol y canola: intervalo mínimo (Sclerotinia)
    ['girasol', 'canola'].forEach(function (e) {
      var min = e === 'girasol' ? 4 : 3;
      var ap = s.filter(function (x) { return especie(x.cultivo) === e || (e === 'canola' && especie(x.cultivo) === 'girasol') || (e === 'girasol' && especie(x.cultivo) === 'canola'); });
      for (var q = 1; q < ap.length; q++) {
        if (!ap[q].plan) continue;
        var anios = (orden(ap[q].temporada) - orden(ap[q - 1].temporada)) / 3;
        if (anios < min) agregar('alto', etiqueta(ap[q].temporada) + ': ' + ap[q].cultivo + ' vuelve al lote a los ' + Math.round(anios * 10) / 10 + ' años de ' + ap[q - 1].cultivo + '. Girasol y canola comparten la podredumbre blanca (Sclerotinia): esperar ' + min + ' años [3].', ap[q].temporada);
      }
    });
    // positivo: brachiaria antes de soja
    for (var p = 1; p < s.length; p++) {
      if (s[p].plan && especie(s[p].cultivo) === 'soja' && especie(s[p - 1].cultivo) === 'brachiaria') agregar('bien', etiqueta(s[p].temporada) + ': soja sobre brachiaria. Buena decisión: la brachiaria mejora la estructura del suelo y la soja siguiente rinde más (Embrapa: hasta +15 %) [4].', s[p].temporada);
    }
    return out;
  }
  function indiceRotacion(secuencia) {
    var s = secuencia.filter(function (x) { return x.cultivo && x.plan; });
    if (!s.length) return null;
    var distintos = 0, cubiertos = 0, inv = 0, total = 0;
    for (var i = 0; i < secuencia.length; i++) {
      var x = secuencia[i]; if (!x.plan || !x.cultivo) continue;
      total++;
      var prev = null; for (var k = i - 1; k >= 0; k--) { if (secuencia[k].cultivo && especie(secuencia[k].cultivo) !== 'descanso') { prev = secuencia[k]; break; } }
      if (!prev || especie(prev.cultivo) !== especie(x.cultivo)) distintos++;
      if (x.temporada.epoca === 'invierno') { inv++; if (especie(x.cultivo) !== 'descanso') cubiertos++; }
    }
    return { diversidad: Math.round(distintos / total * 100), cobertura: inv ? Math.round(cubiertos / inv * 100) : null };
  }

  /* ---------- pantalla ---------- */
  var planActual = null;   // copia editable
  function lotesDelCampo() { var c = B().campoActual(); return c ? B().leer('equipos').filter(function (e) { return String(e.campoId) === String(c.id); }) : []; }
  function loteActual() { var id = $('rotLote').value; return lotesDelCampo().find(function (e) { return String(e.id) === String(id); }) || null; }
  function opcionesCultivo(epoca, valor) {
    var g = function (titulo, lista) { return '<optgroup label="' + titulo + '">' + lista.map(function (c) { return '<option value="' + esc(c) + '"' + (c === valor ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</optgroup>'; };
    var renta = RENTA[epoca] || [];
    var otrosRenta = [].concat(RENTA.verano, RENTA.zafrina, RENTA.invierno).filter(function (c, i, a) { return a.indexOf(c) === i && renta.indexOf(c) < 0; });
    var cob = COBERTURAS.filter(function (c) { return c[1] === 'todas' || c[1] === epoca; }).map(function (c) { return c[0]; });
    var extra = (valor && renta.indexOf(valor) < 0 && otrosRenta.indexOf(valor) < 0 && cob.indexOf(valor) < 0 && valor !== DESCANSO) ? '<option value="' + esc(valor) + '" selected>' + esc(valor) + '</option>' : '';
    return '<option value="">— elegir —</option>' + extra + g('Cultivos de renta (' + (EPOCAS.find(function (e) { return e.k === epoca; }) || {}).n + ')', renta) + g('Coberturas', cob) + '<optgroup label="Sin cultivo"><option value="' + DESCANSO + '"' + (valor === DESCANSO ? ' selected' : '') + '>' + DESCANSO + '</option></optgroup>' + g('Otros cultivos', otrosRenta);
  }
  function pintar() {
    var lote = loteActual(), cont = $('rotContenido');
    if (!lote) { cont.innerHTML = '<div class="muted">Este campo no tiene lotes. Cargalos en Equipos y lotes.</div>'; return; }
    var hist = historialDelLote(lote.id);
    var guardado = planDelLote(lote.id);
    if (!planActual || String(planActual.equipoId) !== String(lote.id)) planActual = guardado ? JSON.parse(JSON.stringify(guardado)) : { id: Date.now(), campoId: B().campoActual().id, equipoId: lote.id, temporadas: temporadasNuevas(lote.id, 3), creado: new Date().toISOString() };
    var html = '';
    // historial
    html += '<div class="muted" style="font-size:12px;margin-bottom:6px;">Lo que ya pasó en el lote (campañas e historial cargados):</div>';
    html += hist.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">' + hist.slice(-9).map(function (h) {
      return '<span style="border:1px solid #E1E4E7;border-radius:8px;padding:4px 8px;font-size:12px;background:#fff;"><b>' + esc(etiqueta(h.temporada)) + '</b> · ' + esc(h.cultivo) + (h.rinde ? ' · ' + fmtKg(h.rinde) + ' kg/ha' : ' · en curso') + (h.cobertura && h.cobertura !== 'ninguna' ? ' · cob. ' + esc(h.cobertura) : '') + '</span>';
    }).join('') + '</div>' : '<div class="note info" style="margin-bottom:12px;">Todavía no hay campañas cargadas en este lote: el plan arranca en la temporada actual. Cuando cargues campañas, SAFIA marca solo cada temporada como cumplida o cambiada.</div>';
    // tabla del plan
    html += '<div class="tablewrap"><div class="tablescroll"><table class="tbl" id="rotTabla"><thead><tr><th>Temporada</th><th>Cultivo o cobertura</th><th class="r">Objetivo (kg/ha)</th><th>Nota</th><th>Estado</th><th></th></tr></thead><tbody>';
    planActual.temporadas.forEach(function (t, i) {
      var e = estadoDe(t, hist);
      var color = { ok: '#178029', curso: '#2E72C8', cambio: '#B8731A', sin: '#8C9196', plan: '#6B6356' }[e.k];
      var ep = EPOCAS.find(function (x) { return x.k === t.epoca; });
      html += '<tr data-i="' + i + '"><td><b>' + esc(etiqueta(t)) + '</b><div class="muted" style="font-size:11px;">siembra ' + ep.siembra + ' · cosecha ' + ep.cosecha + '</div></td>' +
        '<td><select class="rotCultivo" data-i="' + i + '" style="min-width:230px;">' + opcionesCultivo(t.epoca, t.cultivo) + '</select></td>' +
        '<td class="r"><input type="number" class="rotObjetivo" data-i="' + i + '" value="' + (t.objetivoKgHa || '') + '" step="100" min="0" style="width:110px;text-align:right;"' + (esCobertura(t.cultivo) || t.cultivo === DESCANSO ? ' disabled placeholder="—"' : ' placeholder="kg/ha"') + '></td>' +
        '<td><input type="text" class="rotNota" data-i="' + i + '" value="' + esc(t.nota || '') + '" placeholder="Variedad, fecha, riego…" style="min-width:180px;"></td>' +
        '<td style="color:' + color + ';font-size:12px;font-weight:600;">' + esc(e.txt) + '</td>' +
        '<td class="r"><span class="rowact"><button class="del rotQuitar" data-i="' + i + '" title="Quitar temporada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button></span></td></tr>';
    });
    html += '</tbody></table></div></div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="btn" id="btnRotSugerir">Sugerir rotación (3 años)</button><button class="btn" id="btnRotAnio">+ Agregar un año</button><button class="btn green" id="btnRotGuardar">Guardar plan</button><button class="btn" onclick="window.print()">Imprimir</button><span class="muted" id="rotEstado" style="align-self:center;font-size:12px;">' + (guardado ? 'Guardado ' + fmtF(guardado.modificado || guardado.creado) : 'Sin guardar') + '</span></div>';
    // avisos
    var secuencia = hist.map(function (h) { return { temporada: h.temporada, cultivo: h.cultivo, plan: false }; }).concat(planActual.temporadas.map(function (t) { return { temporada: t, cultivo: t.cultivo, plan: true }; }));
    var av = avisos(secuencia), idx = indiceRotacion(secuencia);
    html += '<h3 style="font-size:15px;margin:18px 0 8px;">Revisión de la rotación</h3>';
    if (idx) html += '<div class="stats" style="margin-bottom:10px;"><div class="stat"><div class="sl">Diversidad</div><div class="sv">' + idx.diversidad + ' %</div><div class="ss">temporadas con especie distinta a la anterior</div></div>' + (idx.cobertura != null ? '<div class="stat"><div class="sl">Inviernos cubiertos</div><div class="sv">' + idx.cobertura + ' %</div><div class="ss">con cultivo o cobertura</div></div>' : '') + '</div>';
    if (!av.length) html += '<div class="note info">' + (planActual.temporadas.some(function (t) { return t.cultivo; }) ? 'El plan respeta las reglas básicas de rotación: sin especie repetida en temporadas seguidas, inviernos cubiertos y girasol/canola con intervalo suficiente.' : 'Elegí los cultivos de cada temporada (o "Sugerir rotación") y SAFIA revisa el plan.') + '</div>';
    av.forEach(function (a) {
      var cls = a.tipo === 'alto' ? 'warn' : (a.tipo === 'bien' ? 'info' : 'warn');
      html += '<div class="note ' + cls + '" style="margin-bottom:6px;' + (a.tipo === 'bien' ? 'border-left-color:#178029;background:#EAF5EC;color:#1e4d25;' : (a.tipo === 'medio' ? 'opacity:.92;' : '')) + '">' + (a.tipo === 'alto' ? '<b>Atención.</b> ' : (a.tipo === 'bien' ? '<b>Bien.</b> ' : '<b>Sugerencia.</b> ')) + esc(a.texto) + '</div>';
    });
    html += '<div class="muted" style="font-size:11px;margin-top:8px;">[1] Embrapa Soja, Rotação de culturas · [2] CAPECO, FEPASIDIAS e INBIO (siembra directa en Paraguay) · [3] Embrapa Girassol · [4] Embrapa ILPF / Sistema Santa Fe. SAFIA revisa el plan; la decisión final es del productor con su agrónomo.</div>';
    cont.innerHTML = html;
    // eventos
    cont.querySelectorAll('.rotCultivo').forEach(function (s) { s.addEventListener('change', function () { var t = planActual.temporadas[+s.dataset.i]; t.cultivo = s.value; if (esCobertura(t.cultivo) || t.cultivo === DESCANSO) t.objetivoKgHa = null; else if (!t.objetivoKgHa) t.objetivoKgHa = objetivoSugerido(lote.id, t.cultivo); pintar(); }); });
    cont.querySelectorAll('.rotObjetivo').forEach(function (s) { s.addEventListener('change', function () { planActual.temporadas[+s.dataset.i].objetivoKgHa = s.value ? +s.value : null; }); });
    cont.querySelectorAll('.rotNota').forEach(function (s) { s.addEventListener('change', function () { planActual.temporadas[+s.dataset.i].nota = s.value.trim(); }); });
    cont.querySelectorAll('.rotQuitar').forEach(function (b) { b.addEventListener('click', function () { planActual.temporadas.splice(+b.dataset.i, 1); pintar(); }); });
    $('btnRotSugerir').addEventListener('click', function () { if (!planActual.temporadas.length) planActual.temporadas = temporadasNuevas(lote.id, 3); sugerir(lote.id, planActual.temporadas, lote); pintar(); B().toast('Rotación sugerida para 3 años: revisala y ajustá lo que quieras'); });
    $('btnRotAnio').addEventListener('click', function () { var ult = planActual.temporadas[planActual.temporadas.length - 1]; var t = ult ? siguiente(ult) : temporadaActual(); for (var i = 0; i < 3; i++) { planActual.temporadas.push({ epoca: t.epoca, anio: t.anio, cultivo: '', objetivoKgHa: null, nota: '' }); t = siguiente(t); } pintar(); });
    $('btnRotGuardar').addEventListener('click', function () { guardarPlan(planActual); B().toast('Plan de rotación guardado'); pintar(); });
  }
  function llenarLotes() {
    var sel = $('rotLote'), lotes = lotesDelCampo(), v = sel.value;
    sel.innerHTML = lotes.length ? lotes.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + (e.tipo === 'secano' ? ' (secano)' : '') + '</option>'; }).join('') : '<option value="">Sin lotes</option>';
    if (v && lotes.some(function (e) { return String(e.id) === v; })) sel.value = v;
  }
  function activar() {
    if (!B() || !$('panel-rotacion')) return;
    if (!iniciado) { iniciado = true; $('rotLote').addEventListener('change', function () { planActual = null; pintar(); }); }
    llenarLotes(); planActual = null; pintar();
  }
  function alCambiarCampo() { planActual = null; if (iniciado && $('panel-rotacion').classList.contains('on')) activar(); }

  window.SafiaRotacion = { activar: activar, alCambiarCampo: alCambiarCampo, temporadaDe: temporadaDe, etiqueta: etiqueta, avisos: avisos, especie: especie, historialDelLote: historialDelLote, _plan: function () { return planActual; } };
})();
