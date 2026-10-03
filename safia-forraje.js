/* SAFIA — Pasto en kilos y carne producida (pasturas bajo riego)
   -------------------------------------------------------------------
   Convierte lo que ya se carga (altura con regla, entradas y salidas,
   cabezas) en los números que venden el pivot:
   - kg de materia seca por hectárea (kg MS/ha) de cada piquete;
   - crecimiento del pasto (kg MS/ha/día) medido entre lecturas;
   - carga que el pasto aguanta contra la carga real (UA/ha);
   - carne producida: ganancia diaria, kg de peso vivo/ha y arrobas/ha/año,
     con las pesadas del lote (evento 'pesada').

   Fuentes (leídas en el documento original, 3-oct-2026):
   [1] Jank et al. 2017, Embrapa Gado de Corte, Comunicado Técnico 138 (BRS Quênia), Tabela 10 p. 14: masa total
       pre-pastoreo y altura — Quênia 3.342 kg MS/ha a 61,8 cm y 3.267 a 52,9 cm; Tanzânia 4.352 a 74,6 cm y 3.581 a
       58,7 cm → 54 a 62 kg MS/ha por cm (cálculo masa ÷ altura; NO es una ecuación publicada). Tabela 8: producción
       animal en secano rotativo, Campo Grande: Quênia 975 y Mombaça 834 kg de peso vivo/ha/año; carga 5,1 y 5,0 UA/ha
       en lluvias, 1,9 en seca. p. 14: 860 kg PV/ha = 28,7 @ (30 kg de peso vivo por arroba).
   [2] Barioni & Ferreira 2007, Embrapa Cerrados, Boletim de Pesquisa e Desenvolvimento 191, Tabela 2 p. 18:
       altura (cm) = 0,009 × masa − 1,59 (R² 0,71; Marandu, decumbens y Xaraés; masa total al ras); la pendiente va
       de 0,008 a 0,014 según el mes → ≈ 111 kg MS/ha por cm (71 a 125).
   [3] Martha Jr. et al. 2003, Embrapa Cerrados, Comunicado Técnico 101: UA = 450 kg de peso vivo (Tabela 4);
       consumo 2,2 % del peso vivo (p. 7); eficiencia de pastoreo 45/50/55/55 % según intensificación (Tabela 5);
       acumulación = (masa pre − masa post anterior) ÷ días; oferta 6–9 kg MS/100 kg PV en intensivo.
   [4] Salman 2006, Embrapa Rondônia, "Método do quadrado": marco 0,5 × 0,5 m, 10 a 30 muestras,
       kg MS/ha = kg verde por m² × % MS × 10.000. Materia seca en microondas: Oliveira et al. 2015, Embrapa Gado de
       Leite, Comunicado Técnico 77.
   Embrapa no publica ecuación altura–masa para BRS Zuri, Tamani, Massai ni Tifton: el factor de tabla es ORIENTATIVO
   y la calibración del campo (evento 'calibracion') manda. La relación cambia con la época: recalibrar por estación.
   No hay ensayo publicado de kg de carne/ha bajo pivot con pasto tropical: el dato del cliente es la referencia. */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function dia(f) { return String(f || '').slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }
  function sumar(f, n) { var d = new Date(dia(f) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function fmtF(f) { var p = dia(f).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  var UA_KG = 450, CONSUMO_PCT = 2.2, EFICIENCIA = 0.55, KG_ARROBA = 30;
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var FACTORES = [
    { re: /mombaca|momba|zuri|tanzan|quenia|kenia|massai|tamani|panicum|megathyrsus|gatton|coloniao|aruana/, grupo: 'Panicum', kgCm: 58, min: 54, max: 62,
      fuente: 'Embrapa Gado de Corte, Comunicado Técnico 138 (2017), Tabela 10: BRS Quênia y Tanzânia, masa total ÷ altura' },
    { re: /brachiaria|braquiaria|urochloa|marandu|brizant|xara|mg-?5|piata|paiaguas|ipypora|decumbens|basilisk|humidicola|tupi/, grupo: 'Brachiaria', kgCm: 111, min: 71, max: 125,
      fuente: 'Embrapa Cerrados, Boletim de Pesquisa 191 (2007), Tabela 2: Marandu, decumbens y Xaraés, masa total al ras' }
  ];
  var REF_CARNE = { secanoMin: 834, secanoMax: 975, fuente: 'Embrapa Gado de Corte, Comunicado Técnico 138, Tabela 8: Mombaça 834 y BRS Quênia 975 kg de peso vivo/ha/año en secano rotativo (Campo Grande)' };

  function eventos(equipoId, tipo) {
    return leer('eventos').filter(function (e) { return e.tipo === tipo && String(e.equipoId) === String(equipoId) && e.fecha; }).sort(function (a, b) { return dia(a.fecha).localeCompare(dia(b.fecha)) || (a.id || 0) - (b.id || 0); });
  }
  function equipoDe(id) { return leer('equipos').find(function (e) { return String(e.id) === String(id); }) || null; }

  /* ---------- 1. factor altura → kg MS/ha ---------- */
  function calibraciones(equipoId) { return eventos(equipoId, 'calibracion').filter(function (e) { return e.alturaCm > 0 && e.kgMsHa > 0; }); }
  // kg MS/ha de un corte de muestra (método del cuadrado, Embrapa Rondônia 2006)
  function kgMsDeCorte(pesoVerdeG, marcos, ladoM, msPct) {
    var area = (marcos || 0) * (ladoM || 0) * (ladoM || 0);
    if (!(pesoVerdeG > 0) || !(area > 0) || !(msPct > 0)) return null;
    return Math.round(pesoVerdeG / 1000 / area * (msPct / 100) * 10000);
  }
  function factorDe(equipoId, cultivo) {
    var c = cultivo || {}, cal = calibraciones(equipoId), h = hoy();
    var rec = cal.filter(function (e) { return diasEntre(e.fecha, h) <= 180; }); if (!rec.length) rec = cal.slice(-3);
    if (rec.length) {
      var sk = 0, sc = 0; rec.forEach(function (e) { sk += +e.kgMsHa; sc += +e.alturaCm; });
      var ult = rec[rec.length - 1], viejo = diasEntre(ult.fecha, h) > 120;
      return { kgCm: Math.round(sk / sc * 10) / 10, origen: 'calibrado', n: rec.length, fecha: ult.fecha, viejo: viejo,
        texto: 'calibrado en el campo con ' + rec.length + ' corte' + (rec.length > 1 ? 's' : '') + ' de muestra (último ' + fmtF(ult.fecha) + ')' + (viejo ? '; ya tiene más de 4 meses: conviene recalibrar, cambia con la época' : '') };
    }
    var n = norm((c.variedad || '') + ' ' + (c.cultivo || '')), mejor = null, pos = Infinity;
    FACTORES.forEach(function (f) { var m = n.match(f.re); if (m && m.index < pos) { pos = m.index; mejor = f; } });
    if (!mejor) return null;
    return { kgCm: mejor.kgCm, min: mejor.min, max: mejor.max, origen: 'tabla', grupo: mejor.grupo, fuente: mejor.fuente,
      texto: 'orientativo: ' + mejor.kgCm + ' kg MS/ha por cm (' + mejor.min + ' a ' + mejor.max + '), ' + mejor.fuente + '. No es propio de esta pastura: calibralo con un corte de muestra' };
  }

  /* ---------- 2. superficie y pasto por piquete ---------- */
  function geometria(equipo, cultivo) {
    var g = window.SafiaPiquetes && equipo ? SafiaPiquetes.sectores(equipo, cultivo) : null, porPiq = {}, tot = 0;
    if (g && g.lista) g.lista.forEach(function (s) { if (s.ha > 0) { porPiq[String(s.piquete)] = s.ha; tot += s.ha; } });
    var sup = num(equipo && equipo.superficie);
    if (!(tot > 0)) tot = sup || 0;
    return { ha: Math.round(tot * 100) / 100, porPiquete: porPiq };
  }
  function pastoPorPiquete(equipo, cultivo) {
    var st = SafiaPasturas.estadoPiquetes(equipo.id, cultivo), f = factorDe(equipo.id, cultivo), geo = geometria(equipo, cultivo), ref = st.ref;
    var n = st.piquetes.length || 1, haDef = geo.ha ? geo.ha / n : null;
    var lista = st.piquetes.map(function (p) {
      var ha = geo.porPiquete[p.piquete] || haDef, kg = p.altura && f ? Math.round(p.altura * f.kgCm) : null;
      var com = (kg != null && ref) ? Math.max(0, p.altura - ref.salida) * f.kgCm : null;   // kg MS/ha por encima de la altura de salida
      return { piquete: p.piquete, estado: p.estado, color: p.color, altura: p.altura, fecha: p.fechaLectura, ha: ha, kgHa: kg, comestibleHa: com, comestibleKg: com != null && ha ? com * ha : null };
    });
    var med = lista.filter(function (x) { return x.kgHa != null; }), sKg = 0, sHa = 0, sCom = 0;
    med.forEach(function (x) { var h = x.ha || 1; sKg += x.kgHa * h; sHa += h; sCom += x.comestibleKg || 0; });
    return { lista: lista, medidos: med.length, total: lista.length, factor: f, ref: ref, ha: geo.ha,
      kgHaPromedio: sHa ? Math.round(sKg / sHa) : null, comestibleKg: med.length ? Math.round(sCom) : null,
      kgEntrada: ref && f ? Math.round(ref.entrada * f.kgCm) : null, kgSalida: ref && f ? Math.round(ref.salida * f.kgCm) : null };
  }

  /* ---------- 3. crecimiento medido (kg MS/ha/día) ----------
     Entre dos alturas del mismo piquete sin animales adentro: (altura 2 − altura 1) ÷ días × factor
     (Comunicado Técnico 101: acumulación = (masa pre − masa post anterior) ÷ días). */
  function crecimiento(equipoId, cultivo) {
    var f = factorDe(equipoId, cultivo), out = { porMes: {}, ult30: null, factor: f };
    if (!f) return out;
    var evs = leer('eventos').filter(function (e) { return (e.tipo === 'lectura' || e.tipo === 'pastoreo') && String(e.equipoId) === String(equipoId) && e.fecha && e.piquete != null; })
      .sort(function (a, b) { return dia(a.fecha).localeCompare(dia(b.fecha)) || (a.id || 0) - (b.id || 0); });
    var porPiq = {}; evs.forEach(function (e) { (porPiq[String(e.piquete)] = porPiq[String(e.piquete)] || []).push(e); });
    var h = hoy(), d30 = sumar(h, -30), s30 = 0, n30 = 0;
    function tramo(a, b) {
      var dd = diasEntre(a.fecha, b.fecha); if (!(dd > 0) || dd > 60) return;
      var kgDia = (b.alt - a.alt) / dd * f.kgCm;
      for (var k = 0; k < dd; k++) {
        var fd = sumar(a.fecha, k), m = fd.slice(0, 7), o = out.porMes[m] = out.porMes[m] || { suma: 0, dias: 0 };
        o.suma += kgDia; o.dias++;
        if (fd >= d30) { s30 += kgDia; n30++; }
      }
    }
    Object.keys(porPiq).forEach(function (p) {
      var prev = null, ocupado = false;
      porPiq[p].forEach(function (e) {
        var alt = num(e.alturaCm), pt = alt > 0 ? { fecha: dia(e.fecha), alt: alt } : null;
        if (e.tipo === 'lectura') { if (pt && prev && !ocupado) tramo(prev, pt); if (pt && !ocupado) prev = pt; return; }
        if (e.accion === 'entrada') { if (pt && prev && !ocupado) tramo(prev, pt); ocupado = true; prev = null; return; }
        ocupado = false; prev = pt;   // salida o corte: arranca el rebrote
      });
    });
    Object.keys(out.porMes).forEach(function (m) { var o = out.porMes[m]; o.kgDia = Math.max(0, Math.round(o.suma / o.dias)); });
    if (n30 >= 10) out.ult30 = { kgDia: Math.max(0, Math.round(s30 / n30)), dias: n30, cmDia: Math.round(s30 / n30 / f.kgCm * 10) / 10 };
    return out;
  }

  /* ---------- 4. animales: lote, carga y carne ---------- */
  function pesadas(equipoId) { return eventos(equipoId, 'pesada').filter(function (e) { return e.pesoKg > 0; }); }
  function loteActual(equipoId) {
    var ps = pesadas(equipoId), ult = ps[ps.length - 1] || null;
    var ent = eventos(equipoId, 'pastoreo').filter(function (e) { return e.accion === 'entrada' && e.cabezas > 0; }).slice(-1)[0] || null;
    if (ult && ult.motivo === 'salida') return { cabezas: null, pesoKg: null, fecha: ult.fecha, salio: true };
    var cab = ult && ult.cabezas > 0 ? +ult.cabezas : null;
    if (ent && (!ult || dia(ent.fecha) > dia(ult.fecha) || !cab)) cab = +ent.cabezas;
    return { cabezas: cab, pesoKg: ult ? +ult.pesoKg : null, fecha: ult ? ult.fecha : null };
  }
  // Carne producida con las pesadas de los últimos 'dias' días. Entre dos pesadas seguidas del mismo lote:
  // (peso 2 − peso 1) × cabezas. Una pesada de 'ingreso' arranca un lote nuevo (no se compara con la anterior).
  function carne(equipoId, ha, dias) {
    var desde = sumar(hoy(), -(dias || 365)), ps = pesadas(equipoId).filter(function (e) { return dia(e.fecha) >= desde; });
    var kg = 0, dd = 0, periodos = [];
    for (var i = 1; i < ps.length; i++) {
      var a = ps[i - 1], b = ps[i]; if (b.motivo === 'ingreso' || a.motivo === 'salida') continue;
      var d = diasEntre(a.fecha, b.fecha); if (!(d > 0)) continue;
      var cab = Math.min(+a.cabezas || +b.cabezas || 0, +b.cabezas || +a.cabezas || 0), gmd = (b.pesoKg - a.pesoKg) / d;
      var k = (b.pesoKg - a.pesoKg) * cab; kg += k; dd += d;
      periodos.push({ desde: a.fecha, hasta: b.fecha, dias: d, cabezas: cab, gmd: Math.round(gmd * 1000) / 1000, kg: Math.round(k) });
    }
    if (!periodos.length) return { periodos: [], pesadas: ps.length };
    var ult = periodos[periodos.length - 1], kgHa = ha > 0 ? kg / ha : null, anual = kgHa != null && dd > 0 ? kgHa / dd * 365 : null;
    var sg = 0, sd = 0; periodos.forEach(function (p) { sg += p.gmd * p.dias; sd += p.dias; });
    return { periodos: periodos, pesadas: ps.length, dias: dd, kg: Math.round(kg), kgHa: kgHa != null ? Math.round(kgHa) : null, gmd: Math.round(sg / sd * 1000) / 1000, gmdUltimo: ult.gmd,
      kgHaAnio: anual != null ? Math.round(anual) : null, arrobasHaAnio: anual != null ? Math.round(anual / KG_ARROBA * 10) / 10 : null, corto: dd < 60 };
  }
  function uaHaDe(kgMsHaDia) { return kgMsHaDia * EFICIENCIA / (CONSUMO_PCT / 100) / UA_KG; }

  /* ---------- 5. referencia de Irrigar por mes y carga ---------- */
  function refCache() { try { var c = JSON.parse(localStorage.getItem('ref_forraje') || 'null'); return (c && c.filas) || []; } catch (e) { return []; } }
  function diasDelMes(anio, m) { return new Date(anio, m, 0).getDate(); }
  function cargaMensual(equipo, cultivo, campo, filasRef) {
    var filas = filasRef && filasRef.length ? filasRef : refCache(), region = SafiaPasturas.regionDe(campo || {});
    var rR = SafiaPasturas.referenciaPara(filas, region, cultivo, 'regada'), rS = SafiaPasturas.referenciaPara(filas, region, cultivo, 'secano');
    var cr = crecimiento(equipo.id, cultivo), anio = +hoy().slice(0, 4), out = [];
    for (var m = 1; m <= 12; m++) {
      var dm = diasDelMes(anio, m), k = MESES[m - 1], med = cr.porMes[anio + '-' + String(m).padStart(2, '0')];
      var reg = rR && rR[k] != null ? rR[k] / dm : null, sec = rS && rS[k] != null ? rS[k] / dm : null, md = med && med.dias >= 10 ? med.kgDia : null;
      out.push({ mes: m, regada: reg, secano: sec, medido: md, uaRegada: reg != null ? uaHaDe(reg) : null, uaSecano: sec != null ? uaHaDe(sec) : null, uaMedido: md != null ? uaHaDe(md) : null });
    }
    return { meses: out, region: region, tipoRef: rR ? rR.tipo_pastura : null, anio: anio };
  }
  function resumen(equipo, cultivo, campo, filasRef) {
    var pp = pastoPorPiquete(equipo, cultivo), cr = crecimiento(equipo.id, cultivo), lote = loteActual(equipo.id), cm = cargaMensual(equipo, cultivo, campo, filasRef);
    var mesHoy = cm.meses[+hoy().slice(5, 7) - 1], ha = pp.ha;
    var tasa = cr.ult30 ? { kgDia: cr.ult30.kgDia, origen: 'medido', dias: cr.ult30.dias, cmDia: cr.ult30.cmDia } : (mesHoy && mesHoy.regada != null ? { kgDia: Math.round(mesHoy.regada), origen: 'referencia' } : null);
    var uaReal = lote.cabezas && lote.pesoKg && ha ? lote.cabezas * lote.pesoKg / UA_KG / ha : null;
    var uaCap = tasa ? uaHaDe(tasa.kgDia) : null, cabCap = uaCap != null && lote.pesoKg && ha ? Math.floor(uaCap * UA_KG * ha / lote.pesoKg) : null;
    var consumoDia = lote.cabezas && lote.pesoKg ? lote.cabezas * lote.pesoKg * CONSUMO_PCT / 100 : null;
    var diasPasto = consumoDia && pp.comestibleKg != null && pp.medidos ? Math.round(pp.comestibleKg / consumoDia) : null;
    return { pasto: pp, crecimiento: cr, tasa: tasa, lote: lote, ha: ha, uaReal: uaReal, uaCapacidad: uaCap, cabezasCapacidad: cabCap, consumoDia: consumoDia, diasPasto: diasPasto,
      carne: carne(equipo.id, ha, 365), mensual: cm, mesHoy: mesHoy, factor: pp.factor };
  }

  /* ---------- 6. dibujo: pasto por piquete, de mayor a menor ---------- */
  function svgPiquetes(pp) {
    var d = pp.lista.filter(function (x) { return x.kgHa != null; }).sort(function (a, b) { return b.kgHa - a.kgHa; });
    if (d.length < 2) return '';
    var W = 520, H = 150, x0 = 38, y0 = 14, y1 = 118, max = Math.max.apply(null, d.map(function (x) { return x.kgHa; }).concat([pp.kgEntrada || 0])) * 1.08;
    var paso = (W - x0 - 8) / d.length, bw = Math.max(4, Math.min(26, paso - 3)), y = function (v) { return y1 - (v / max) * (y1 - y0); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:640px;height:auto;display:block;" role="img" aria-label="Pasto por piquete en kg de materia seca por hectárea">';
    [0, 0.5, 1].forEach(function (t) { var v = Math.round(max * t / 100) * 100; s += '<line x1="' + x0 + '" x2="' + (W - 6) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#EEF0F2"/><text x="' + (x0 - 4) + '" y="' + (y(v) + 3) + '" font-size="8" fill="#8C9196" text-anchor="end">' + fmt(v) + '</text>'; });
    d.forEach(function (x, i) {
      var bx = x0 + i * paso + (paso - bw) / 2;
      s += '<rect x="' + bx.toFixed(1) + '" y="' + y(x.kgHa).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y1 - y(x.kgHa)).toFixed(1) + '" rx="2" fill="' + x.color + '"><title>Piquete ' + esc(x.piquete) + ': ' + fmt(x.kgHa) + ' kg MS/ha (' + x.altura + ' cm, ' + fmtF(x.fecha) + ')</title></rect>';
      if (d.length <= 34) s += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (y1 + 10) + '" font-size="' + (d.length > 20 ? 7 : 8) + '" fill="#3A3E41" text-anchor="middle">' + esc(x.piquete) + '</text>';
    });
    [[pp.kgEntrada, '#178029', 'entrada'], [pp.kgSalida, '#B5371C', 'salida']].forEach(function (l) {
      if (!l[0]) return;
      s += '<line x1="' + x0 + '" x2="' + (W - 6) + '" y1="' + y(l[0]) + '" y2="' + y(l[0]) + '" stroke="' + l[1] + '" stroke-dasharray="4 3" stroke-width="1"/><text x="' + (W - 8) + '" y="' + (y(l[0]) - 3) + '" font-size="8" fill="' + l[1] + '" text-anchor="end">' + l[2] + ' ' + fmt(l[0]) + '</text>';
    });
    return s + '<text x="' + x0 + '" y="' + (H - 6) + '" font-size="8" fill="#8C9196">Piquetes ordenados del que tiene más pasto al que tiene menos · kg MS/ha</text></svg>';
  }

  /* ---------- 7. panel para Operador, Encargado y Banco ---------- */
  function tarjeta(t, v, sub, color) {
    return '<div style="flex:1 1 150px;min-width:140px;border:1px solid #E1E4E7;border-left:4px solid ' + color + ';border-radius:8px;padding:8px 10px;background:#fff;"><div style="font-size:11px;color:#8C9196;text-transform:uppercase;letter-spacing:.04em;">' + t + '</div><div style="font-size:15px;font-weight:700;color:#2E3236;margin-top:2px;">' + v + '</div><div style="font-size:11px;color:#3A3E41;margin-top:2px;line-height:1.35;">' + sub + '</div></div>';
  }
  function htmlPanel(equipo, cultivo, o) {
    o = o || {};
    if (!equipo || !window.SafiaPasturas) return '';
    var R = resumen(equipo, cultivo, o.campo, o.filasRef), pp = R.pasto, f = R.factor, mh = R.mesHoy, mesN = NOMBRE_MES[+hoy().slice(5, 7) - 1].toLowerCase();
    if (!f) return '<div style="font-size:12px;color:#8C9196;">Para pasar la altura a kilos de pasto, cargá la variedad de la pastura en la campaña o hacé un corte de muestra (Calibrar).</div>';
    // pasto
    var t1 = tarjeta('Pasto disponible', pp.kgHaPromedio != null ? fmt(pp.kgHaPromedio) + ' kg MS/ha' : 'Sin lecturas',
      pp.kgHaPromedio != null ? 'promedio de ' + pp.medidos + ' de ' + pp.total + ' piquetes medidos' + (pp.comestibleKg != null ? ' · <b>' + fmt(pp.comestibleKg / 1000, 1) + ' t</b> por encima de la altura de salida en los piquetes medidos' + (R.diasPasto != null ? ' = <b>' + R.diasPasto + ' días</b> de comida para el lote' : '') : '') : 'medí la altura con el botón Altura del pasto', '#178029');
    // crecimiento
    var comp = mh && mh.regada != null ? 'Referencia de ' + mesN + ': regada ' + fmt(mh.regada) + (mh.secano != null ? ' · secano ' + fmt(mh.secano) : '') + ' kg MS/ha/día' : '';
    var t2 = tarjeta('Crecimiento', R.tasa ? fmt(R.tasa.kgDia) + ' kg MS/ha/día' : '—',
      R.tasa ? (R.tasa.origen === 'medido' ? 'medido con la regla en los últimos 30 días (' + String(R.tasa.cmDia).replace('.', ',') + ' cm/día). ' + comp : 'referencia de Irrigar para ' + mesN + ' con riego (todavía faltan lecturas para medirlo)' + (mh && mh.secano != null ? ' · secano ' + fmt(mh.secano) : '')) : 'faltan lecturas de altura', R.tasa && R.tasa.origen === 'medido' ? '#178029' : '#8C9196');
    // carga
    var colC = '#2E72C8', subC;
    if (R.uaReal != null && R.uaCapacidad != null) {
      var rel = R.uaReal / R.uaCapacidad;
      colC = rel > 1.1 ? '#B5371C' : rel < 0.7 ? '#B8731A' : '#178029';
      subC = 'el pasto aguanta <b>' + fmt(R.uaCapacidad, 1) + ' UA/ha</b>' + (R.cabezasCapacidad != null ? ' (unas ' + fmt(R.cabezasCapacidad) + ' cabezas de ' + fmt(R.lote.pesoKg) + ' kg)' : '') + (rel > 1.1 ? ' · <b style="color:#B5371C;">hay más animales que pasto: sacar o suplementar</b>' : rel < 0.7 ? ' · <b style="color:#8a5713;">sobra pasto: se pueden sumar animales</b>' : ' · carga ajustada');
    } else if (R.uaCapacidad != null) subC = 'el pasto aguanta <b>' + fmt(R.uaCapacidad, 1) + ' UA/ha</b>' + (R.ha ? ' = ' + fmt(R.uaCapacidad * UA_KG * R.ha) + ' kg de peso vivo en las ' + fmt(R.ha, 1) + ' ha' : '') + '. Cargá una <b>Pesada</b> (cabezas y peso) para comparar con la carga real';
    else subC = 'faltan datos';
    var t3 = tarjeta('Carga', R.uaReal != null ? fmt(R.uaReal, 1) + ' UA/ha hoy' : (R.lote.cabezas ? fmt(R.lote.cabezas) + ' cabezas, sin peso' : 'Sin pesada'), subC + (R.lote.cabezas && R.lote.pesoKg ? ' · ' + fmt(R.lote.cabezas) + ' cab. de ' + fmt(R.lote.pesoKg) + ' kg (' + fmtF(R.lote.fecha) + ')' : ''), colC);
    // carne
    var c = R.carne, t4;
    if (c.periodos && c.periodos.length) {
      var raro = c.gmdUltimo > 1.5 || c.gmdUltimo < -0.3, varios = c.periodos.length > 1;
      t4 = tarjeta('Carne producida', fmt(c.gmd, 2) + ' kg/animal/día',
        '<b>' + fmt(c.kgHa) + ' kg de peso vivo/ha</b> en ' + c.dias + ' días' + (varios ? ' (' + c.periodos.length + ' tramos; el último ' + fmt(c.gmdUltimo, 2) + ' kg/día)' : '') + '. A este ritmo serían <b>' + fmt(c.kgHaAnio) + ' kg/ha/año</b> (' + fmt(c.arrobasHaAnio, 1) + ' @/ha/año)' + (c.corto ? ': todavía son pocos días, tomarlo como orientación' : '') + '. Secano bien manejado: ' + REF_CARNE.secanoMin + ' a ' + REF_CARNE.secanoMax + ' kg/ha/año (Embrapa)' + (raro ? '. <b style="color:#8a5713;">La última pesada da ' + fmt(c.gmdUltimo, 2) + ' kg/día: revisarla (balanza, ayuno, pocos días entre pesadas)</b>' : ''), raro ? '#B8731A' : '#178029');
    }
    else t4 = tarjeta('Carne producida', c.pesadas === 1 ? 'Falta la 2.ª pesada' : 'Sin pesadas', 'con dos pesadas del lote SAFIA calcula la ganancia diaria, los kg de carne por hectárea y las arrobas por hectárea por año', '#8C9196');
    var h = '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + t1 + t2 + t3 + t4 + '</div>';
    if (!o.compacto) h += '<div style="margin-top:8px;">' + svgPiquetes(pp) + '</div>';
    // carga mes a mes
    var cm = R.mensual, hayRef = cm.meses.some(function (m) { return m.regada != null; });
    if (hayRef) {
      var mesAct = +hoy().slice(5, 7), filas = cm.meses.map(function (m) {
        return '<tr' + (m.mes === mesAct ? ' style="background:#E7F6EA;"' : '') + '><td style="padding:3px 6px;">' + NOMBRE_MES[m.mes - 1].slice(0, 3) + '</td><td style="padding:3px 6px;text-align:right;">' + (m.regada != null ? fmt(m.regada) : '—') + '</td><td style="padding:3px 6px;text-align:right;font-weight:700;">' + (m.uaRegada != null ? fmt(m.uaRegada, 1) : '—') + '</td><td style="padding:3px 6px;text-align:right;color:#8C9196;">' + (m.secano != null ? fmt(m.secano) : '—') + '</td><td style="padding:3px 6px;text-align:right;color:#8C9196;">' + (m.uaSecano != null ? fmt(m.uaSecano, 1) : '—') + '</td><td style="padding:3px 6px;text-align:right;color:#178029;">' + (m.medido != null ? fmt(m.medido) + ' → <b>' + fmt(m.uaMedido, 1) + '</b>' : '—') + '</td></tr>';
      }).join('');
      var pr = function (k) { var v = cm.meses.map(function (m) { return m[k]; }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; };
      var uR = pr('uaRegada'), uS = pr('uaSecano');
      h += '<details style="margin-top:8px;"' + (o.abierto ? ' open' : '') + '><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#2E3236;">Carga que aguanta cada mes <span style="font-weight:500;color:#8C9196;">· promedio del año: ' + fmt(uR, 1) + ' UA/ha con riego' + (uS != null ? ' contra ' + fmt(uS, 1) + ' en secano' : '') + '</span></summary>' +
        '<div style="overflow-x:auto;margin-top:6px;"><table style="border-collapse:collapse;font-size:12px;min-width:420px;"><thead><tr style="color:#8C9196;text-align:right;"><th style="padding:3px 6px;text-align:left;">Mes</th><th style="padding:3px 6px;">Con riego<br>kg MS/ha/día</th><th style="padding:3px 6px;">UA/ha</th><th style="padding:3px 6px;">Secano<br>kg MS/ha/día</th><th style="padding:3px 6px;">UA/ha</th><th style="padding:3px 6px;">Medido en este pivot<br>kg MS/ha/día → UA/ha</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
        '<div style="font-size:11px;color:#8C9196;margin-top:4px;line-height:1.4;">Crecimiento de referencia: base de forraje de Irrigar para ' + esc(cm.region) + (cm.tipoRef ? ' (' + esc(cm.tipoRef) + ')' : '') + '. Carga = crecimiento × ' + Math.round(EFICIENCIA * 100) + ' % que el animal llega a comer ÷ consumo de ' + String(CONSUMO_PCT).replace('.', ',') + ' % del peso vivo por día; 1 UA = ' + UA_KG + ' kg (Embrapa Cerrados, Comunicado Técnico 101).</div></details>';
    }
    h += '<div style="font-size:11px;color:#8C9196;margin-top:6px;line-height:1.4;">Altura → kilos: ' + esc(f.texto) + '.' + (o.onCalibrar ? ' <a href="#" onclick="' + o.onCalibrar + ';return false;" style="color:#1565C0;font-weight:700;text-decoration:none;">Calibrar con corte de muestra</a>' : '') + '</div>';
    return h;
  }

  window.SafiaForraje = { UA_KG: UA_KG, CONSUMO_PCT: CONSUMO_PCT, EFICIENCIA: EFICIENCIA, KG_ARROBA: KG_ARROBA, FACTORES: FACTORES, REF_CARNE: REF_CARNE,
    factorDe: factorDe, kgMsDeCorte: kgMsDeCorte, calibraciones: calibraciones, pastoPorPiquete: pastoPorPiquete, crecimiento: crecimiento, pesadas: pesadas, loteActual: loteActual,
    carne: carne, uaHaDe: uaHaDe, cargaMensual: cargaMensual, resumen: resumen, svgPiquetes: svgPiquetes, htmlPanel: htmlPanel, equipoDe: equipoDe };
})();
