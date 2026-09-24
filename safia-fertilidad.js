/* SAFIA — Fertilidad del suelo según el Manual de Calagem e Adubação para os
   Estados do RS e de SC (SBCS / Núcleo Regional Sul, 11ª ed., 2016).
   -------------------------------------------------------------------
   Decisión de Osmar (24-sep-2026): las clases de P y K, las dosis y el
   encalado siguen este manual (por arcilla y por CTC a pH 7), no CAPECO.
   Todas las tablas están copiadas del texto del manual (ver
   FUNDAMENTOS_FERTILIDAD_RSSC.md con página y número de tabla). Los
   micronutrientes siguen Embrapa Cerrados (mismo extractor Mehlich-1 que
   los laboratorios de la región); la tabla RS/SC 6.12 se guarda como
   contraste. Este módulo es puro: no toca la pantalla ni localStorage. */
(function () {
  'use strict';
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; }
  function r1(x) { return Math.round(x * 10) / 10; }
  var K_MG_POR_CMOL = 391;   // 1 cmolc/dm³ de K = 391 mg/dm³

  /* ---------- Tabela 6.1: clases de arcilla, materia orgánica y CTC pH 7 ---------- */
  function claseArcilla(arc) { arc = num(arc); if (arc == null) return null; return arc > 60 ? 1 : (arc > 40 ? 2 : (arc > 20 ? 3 : 4)); }
  var NOMBRE_ARCILLA = { 1: '> 60 %', 2: '41–60 %', 3: '21–40 %', 4: '≤ 20 %' };
  var CLASE_ARCILLA_ASUMIDA = 2;   // sin textura en el análisis: suelos arcillosos de la Región Oriental (basalto); se avisa
  function claseCTC(cic) { cic = num(cic); if (cic == null) return null; return cic <= 7.5 ? 0 : (cic <= 15 ? 1 : (cic <= 30 ? 2 : 3)); }
  var NOMBRE_CTC = ['baja (≤ 7,5)', 'media (7,6–15)', 'alta (15,1–30)', 'muy alta (> 30)'];
  function claseMO(mo) { mo = num(mo); if (mo == null) return null; return mo <= 2.5 ? 'bajo' : (mo <= 5 ? 'medio' : 'alto'); }

  /* ---------- Tabela 6.4: P Mehlich-1 para cultivos de granos (Grupo 2), por clase de arcilla ----------
     Límites superiores de Muy bajo · Bajo · Medio · Alto; por encima = Muy alto. Nivel crítico = límite de "Medio". */
  var P_LIM = { 1: [3, 6, 9, 18], 2: [4, 8, 12, 24], 3: [6, 12, 18, 36], 4: [10, 20, 30, 60] };
  /* ---------- Tabela 6.9: K Mehlich-1 (mg/dm³) para granos, por clase de CTC ---------- */
  var K_LIM = [[20, 40, 60, 120], [30, 60, 90, 180], [40, 80, 120, 240], [45, 90, 135, 270]];
  var CLASES = ['muy bajo', 'bajo', 'medio', 'alto', 'muy alto'];
  function clase5(valor, lim) { if (valor == null) return null; for (var i = 0; i < 4; i++) if (valor <= lim[i]) return CLASES[i]; return CLASES[4]; }
  function interpretarP(p, arcilla) {
    p = num(p); if (p == null) return null;
    var cl = claseArcilla(arcilla), asumida = cl == null; if (asumida) cl = CLASE_ARCILLA_ASUMIDA;
    var lim = P_LIM[cl];
    return { valor: p, clase: clase5(p, lim), critico: lim[2], limites: lim, claseArcilla: cl, arcillaTexto: NOMBRE_ARCILLA[cl], asumida: asumida, fuente: 'RS/SC 2016 Tabela 6.4' };
  }
  function interpretarK(kCmolc, cic, kMg) {
    var kmg = kMg != null ? num(kMg) : (num(kCmolc) != null ? num(kCmolc) * K_MG_POR_CMOL : null); if (kmg == null) return null;
    var cc = claseCTC(cic), asumida = cc == null; if (asumida) cc = 1;   // sin CTC: clase media (7,6–15), la más común; se avisa
    var lim = K_LIM[cc];
    return { valorMg: kmg, valorCmolc: kmg / K_MG_POR_CMOL, clase: clase5(kmg, lim), critico: lim[2], limites: lim, claseCTC: cc, ctcTexto: NOMBRE_CTC[cc], asumida: asumida, fuente: 'RS/SC 2016 Tabela 6.9' };
  }
  /* ---------- Tabela 6.11: Ca, Mg (cmolc/dm³) y S (mg/dm³); leguminosas: S crítico 10 ---------- */
  function clase3(v, lim) { v = num(v); if (v == null) return null; return v < lim[0] ? 'bajo' : (v <= lim[1] ? 'medio' : 'alto'); }
  function interpretarCa(ca) { return clase3(ca, [2.0, 4.0]); }
  function interpretarMg(mg) { return clase3(mg, [0.5, 1.0]); }
  function interpretarS(s, leguminosa) { s = num(s); if (s == null) return null; if (leguminosa) return s < 5 ? 'bajo' : (s <= 10 ? 'medio' : 'alto'); return clase3(s, [2.0, 5.0]); }
  /* ---------- Tabela 6.12 (RS/SC, solo contraste; SAFIA usa Embrapa Cerrados para micros) ---------- */
  var MICROS_RSSC = { cobre: [0.2, 0.4], zinc: [0.2, 0.5], boro: [0.1, 0.3], manganeso: [2.5, 5.0] };

  /* ---------- Tabela 6.1.1: corrección total (kg/ha) y Tabela 6.1.4: gradual 2/3 + 1/3 ---------- */
  var CORRECCION = { 'muy bajo': { p2o5: 160, k2o: 120 }, bajo: { p2o5: 80, k2o: 60 }, medio: { p2o5: 40, k2o: 30 }, alto: { p2o5: 0, k2o: 0 }, 'muy alto': { p2o5: 0, k2o: 0 } };
  function correccion(clase, nutriente) {
    var total = CORRECCION[clase] ? CORRECCION[clase][nutriente] : 0;
    if (!total) return { total: 0, primero: 0, segundo: 0, gradual: false };
    if (clase === 'medio') return { total: total, primero: total, segundo: 0, gradual: false };
    return { total: total, primero: Math.round(total * 2 / 3), segundo: Math.round(total / 3), gradual: true };
  }
  /* ---------- Tabela 6.1.2: manutención por rinde de referencia + adicional por t extra ---------- */
  var MANUTENCION = {
    soja:    { ref: 3, p2o5: 45, k2o: 75, addP: 15, addK: 25 },
    maiz:    { ref: 6, p2o5: 90, k2o: 60, addP: 15, addK: 10 },
    trigo:   { ref: 3, p2o5: 45, k2o: 30, addP: 15, addK: 10 },
    girasol: { ref: 2, p2o5: 30, k2o: 30, addP: 15, addK: 15 },
    sorgo:   { ref: 4, p2o5: 60, k2o: 40, addP: 15, addK: 10 },
    otro:    { ref: 3, p2o5: 45, k2o: 45, addP: 15, addK: 15 }
  };
  function manutencion(cultivo, metaT) {
    var m = MANUTENCION[clave(cultivo)] || MANUTENCION.otro, extra = Math.max(0, (num(metaT) || m.ref) - m.ref);
    return { p2o5: Math.round(m.p2o5 + extra * m.addP), k2o: Math.round(m.k2o + extra * m.addK), ref: m.ref, base: m, extraT: extra };
  }
  /* ---------- Tabela 6.1.3: exportación en el grano (kg por t) — reposición cuando el suelo está "muy alto" ---------- */
  var EXPORTACION = { soja: { n: 60, p2o5: 14, k2o: 20 }, maiz: { n: 16, p2o5: 8, k2o: 6 }, trigo: { n: 22, p2o5: 10, k2o: 6 }, girasol: { n: 25, p2o5: 14, k2o: 6 }, sorgo: { n: 15, p2o5: 8, k2o: 4 }, otro: { n: 20, p2o5: 10, k2o: 8 } };
  function exportacion(cultivo) { return EXPORTACION[clave(cultivo)] || EXPORTACION.otro; }
  /* Dosis de P o K para la campaña (Tabela 6.1.4): clase del suelo × cultivo × meta. nutriente = 'p2o5' | 'k2o' */
  function dosisPK(clase, cultivo, metaT, nutriente, segundoCultivo, valorRelativoMuyAlto) {
    var man = manutencion(cultivo, metaT)[nutriente], corr = correccion(clase, nutriente), exp = exportacion(cultivo)[nutriente] * (num(metaT) || 0);
    if (clase === 'muy alto') {
      var nada = valorRelativoMuyAlto != null && valorRelativoMuyAlto > 2;   // más del doble del límite de "muy alto": no aplicar
      return { correccion: 0, manutencion: 0, reposicion: nada ? 0 : Math.round(exp), total: nada ? 0 : Math.round(exp), regla: nada ? 'no aplicar (más del doble del nivel "muy alto")' : 'reposición de lo exportado (hasta la manutención, a criterio del técnico)' };
    }
    if (clase === 'alto') return { correccion: 0, manutencion: man, reposicion: 0, total: man, regla: 'manutención' };
    var c = segundoCultivo ? corr.segundo : corr.primero;
    return { correccion: c, manutencion: man, reposicion: 0, total: c + man, regla: (corr.gradual ? (segundoCultivo ? '1/3' : '2/3') + ' de la corrección (' + corr.total + ' kg/ha) + manutención' : 'corrección (' + corr.total + ' kg/ha) + manutención') };
  }
  /* ---------- Nitrógeno (capítulos 6.1.14 maíz y trigo): por MO y cultivo anterior, + adicional por t ---------- */
  var N_MAIZ = { bajo: { leguminosa: 70, consorcio: 80, graminea: 90 }, medio: { leguminosa: 50, consorcio: 60, graminea: 70 }, alto: { leguminosa: 40, consorcio: 40, graminea: 50 } };
  var N_TRIGO = { bajo: { leguminosa: 60, graminea: 80 }, medio: { leguminosa: 40, graminea: 60 }, alto: { leguminosa: 20, graminea: 20 } };
  function tipoAntecesor(cultivoAnterior) { var n = String(cultivoAnterior || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (/soja|soya|poroto|frijol|feijao|alfalfa|trebol|vicia|ervilha|leguminosa|mucuna|crotalaria/.test(n)) return 'leguminosa'; if (/nabo|consorc|mix|barbecho|pousio|descanso/.test(n)) return 'consorcio'; if (!n) return null; return 'graminea'; }
  function nitrogeno(cultivo, mo, cultivoAnterior, metaT) {
    var cu = clave(cultivo), cm = claseMO(mo) || 'medio', ant = tipoAntecesor(cultivoAnterior) || 'graminea', t = num(metaT);
    if (cu === 'soja') return { n: 0, regla: 'la soja no lleva N (fija del aire)', fuente: 'RS/SC 2016 · Embrapa CT75' };
    if (cu === 'maiz') { var b = N_MAIZ[cm][ant]; var extra = t && t > 6 ? Math.round((t - 6) * 15) : 0; return { n: b + extra, base: b, extra: extra, claseMO: cm, antecesor: ant, regla: 'MO ' + cm + ' × antecesor ' + ant + (extra ? ' + 15 kg N por t sobre 6 t/ha' : ''), fuente: 'RS/SC 2016 cap. 6.1.14' }; }
    if (cu === 'trigo') { var a2 = ant === 'leguminosa' ? 'leguminosa' : 'graminea', b2 = N_TRIGO[cm][a2]; var e2 = t && t > 3 ? Math.round((t - 3) * (a2 === 'leguminosa' ? 20 : 30)) : 0; return { n: b2 + e2, base: b2, extra: e2, claseMO: cm, antecesor: a2, regla: 'MO ' + cm + ' × antecesor ' + a2 + (e2 ? ' + ' + (a2 === 'leguminosa' ? 20 : 30) + ' kg N por t sobre 3 t/ha' : ''), fuente: 'RS/SC 2016 cap. 6.1.29' }; }
    var g = { girasol: 25, sorgo: 20, otro: 20 }[cu] || 20;   // orientativo por t, cuando el manual no tiene tabla usada acá
    return { n: Math.round(g * (t || 3)), regla: g + ' kg N por t (orientativo)', fuente: 'RS/SC 2016 Tabela 6.1.3 (exportación)' };
  }

  /* ---------- Encalado ----------
     Tabela 5.2: t/ha de calcáreo (PRNT 100 %) para llevar el pH en agua de 0–20 cm a 5,5 · 6,0 · 6,5 según el índice SMP. */
  var SMP = { 4.4: [15.0, 21.0, 29.0], 4.5: [12.5, 17.3, 24.0], 4.6: [10.9, 15.1, 20.0], 4.7: [9.6, 13.3, 17.5], 4.8: [8.5, 11.9, 15.7], 4.9: [7.7, 10.7, 14.2], 5.0: [6.6, 9.9, 13.3], 5.1: [6.0, 9.1, 12.3], 5.2: [5.3, 8.3, 11.3], 5.3: [4.8, 7.5, 10.4], 5.4: [4.2, 6.8, 9.5], 5.5: [3.7, 6.1, 8.6], 5.6: [3.2, 5.4, 7.8], 5.7: [2.8, 4.8, 7.0], 5.8: [2.3, 4.2, 6.3], 5.9: [2.0, 3.7, 5.6], 6.0: [1.6, 3.2, 4.9], 6.1: [1.3, 2.7, 4.3], 6.2: [1.0, 2.2, 3.7], 6.3: [0.8, 1.8, 3.1], 6.4: [0.6, 1.4, 2.6], 6.5: [0.4, 1.1, 2.1], 6.6: [0.2, 0.8, 1.6], 6.7: [0, 0.5, 1.2], 6.8: [0, 0.3, 0.8], 6.9: [0, 0.2, 0.5], 7.0: [0, 0, 0.2], 7.1: [0, 0, 0] };
  function dosisSMP(smp, phRef) {
    smp = num(smp); if (smp == null) return null;
    var k = Math.min(7.1, Math.max(4.4, Math.round(smp * 10) / 10)), fila = SMP[k.toFixed(1)] || SMP[k];
    if (!fila) return null;
    var i = phRef === 5.5 ? 0 : (phRef === 6.5 ? 2 : 1);
    return { tHa: fila[i], smp: k, phRef: phRef || 6.0, fuente: 'RS/SC 2016 Tabela 5.2' };
  }
  /* Método de la saturación de bases (cap. 5.2.1): pH 5,5 = V 65 %, 6,0 = V 75 %, 6,5 = V 85 %; −5 puntos si CTC < 7,5 y +5 si CTC > 15.
     NC (t/ha, PRNT 100 %) = (V1 − V2) / 100 × CTC pH 7 */
  function vObjetivo(phRef, cic) { var v = phRef === 5.5 ? 65 : (phRef === 6.5 ? 85 : 75); cic = num(cic); if (cic != null && cic < 7.5) v -= 5; else if (cic != null && cic > 15) v += 5; return v; }
  function dosisV(v, cic, phRef) { v = num(v); cic = num(cic); if (v == null || cic == null) return null; var v1 = vObjetivo(phRef || 6.0, cic); return { tHa: r1(Math.max(0, (v1 - v) / 100 * cic)), vObjetivo: v1, phRef: phRef || 6.0, fuente: 'RS/SC 2016 cap. 5.2.1' }; }
  /* Decisión y dosis para granos (Tabela 5.3 y texto 5.2.2). sistema: 'convencional' | 'implantacion' (arranca la directa) | 'directa' (consolidada).
     Muestra 0–20 cm en convencional/implantación (dosis completa, incorporada); en directa consolidada el manual muestrea 0–10 cm y aplica ¼ de la dosis SMP
     a pH 6,0 en superficie; con muestra 0–20 cm se informa la dosis completa y se avisa. Superficie: máximo 5 t/ha por vez. */
  function calcario(s, opts) {
    opts = opts || {}; s = s || {};
    var ph = num(s.ph), smp = num(s.phSmp), v = num(s.satBases), cic = num(s.cic), m = num(s.satAluminio), al = num(s.aluminio), ca = num(s.ca), mg = num(s.mg);
    if (m == null && al != null && ca != null && mg != null && num(s.k) != null) m = al / (ca + mg + num(s.k) + al) * 100;
    var sistema = opts.sistema || 'directa', prof = String(s.profundidad || '0-20'), esta010 = /0\s*[-–a]\s*10\b/.test(prof) && !/20/.test(prof);
    var dSMP = dosisSMP(smp, 6.0), dV = dosisV(v, cic, 6.0), motivos = [], necesita = false;
    if (ph != null && ph < 5.5) { necesita = true; motivos.push('pH ' + ph.toFixed(1) + ' por debajo de 5,5'); }
    if (m != null && m >= 10) { necesita = true; motivos.push('saturación de Al ' + m.toFixed(1) + ' % (≥ 10)'); }
    if (v != null && v < 65 && !(ph != null && ph >= 5.5 && m != null && m < 10 && sistema === 'directa')) { if (!necesita) motivos.push('V% ' + v.toFixed(1) + ' por debajo de 65'); necesita = necesita || (ph == null); }
    var exento = sistema === 'directa' && v != null && v >= 65 && (m == null || m < 10);
    if (exento) { necesita = false; motivos = ['V% ≥ 65 y saturación de Al < 10 %: el manual no indica calcáreo en directa consolidada']; }
    var completa = dSMP ? dSMP.tHa : (dV ? dV.tHa : null), metodo = dSMP ? 'índice SMP (Tabela 5.2)' : (dV ? 'saturación de bases (V% ' + dV.vObjetivo + ' para pH 6,0)' : null);
    var sugerida = completa, regla = '';
    if (completa != null) {
      if (sistema === 'directa') { if (esta010 && dSMP) { sugerida = r1(dSMP.tHa / 4); regla = '¼ de la dosis SMP a pH 6,0, en superficie (directa consolidada, muestra 0–10 cm)'; } else { sugerida = Math.min(completa, 5); regla = 'dosis para 0–20 cm en superficie, sin pasar de 5 t/ha por vez' + (completa > 5 ? ' (el resto en la campaña siguiente)' : '') + '; en directa consolidada el manual muestrea 0–10 cm y aplica ¼ de la dosis SMP'; } }
      else if (sistema === 'implantacion') { if (smp != null && smp > 5.5 && opts.superficie) { sugerida = r1(completa / 2); regla = '½ de la dosis SMP a pH 6,0 en superficie al arrancar la directa (SMP > 5,5)'; } else regla = 'dosis completa incorporada en 0–20 cm antes de arrancar la directa'; }
      else regla = 'dosis completa incorporada en 0–20 cm (sistema convencional)';
    }
    var tipo = (mg != null && mg <= 1.0) || (ca != null && mg != null && mg > 0 && ca / mg > 5) ? 'dolomítico' : 'calcítico o dolomítico';
    var noAplicarCaMg = ca != null && mg != null && ca >= 4.0 && mg >= 1.0 && !(ph != null && ph < 5.5);
    return { necesita: necesita && !noAplicarCaMg, exento: exento || noAplicarCaMg, motivos: noAplicarCaMg && !necesita ? ['Ca ≥ 4,0 y Mg ≥ 1,0 cmolc/dm³ con pH ≥ 5,5: no aplicar (Tabela 5.3, nota 8)'] : motivos,
      dosisSMP: dSMP, dosisSMP55: dosisSMP(smp, 5.5), dosisV: dV, completa: completa, sugerida: sugerida, metodo: metodo, regla: regla, tipo: tipo, sistema: sistema, m: m,
      nota: (dSMP && dV && Math.abs(dSMP.tHa - dV.tHa) >= 0.5) ? 'SMP y V% difieren (' + dSMP.tHa + ' vs ' + dV.tHa + ' t/ha): el manual prefiere SMP para el primer encalado; para reaplicaciones vale cualquiera de los dos' : (!dSMP && dV ? 'sin índice SMP en el análisis: dosis por saturación de bases; pedir el SMP al laboratorio para el primer encalado' : ''),
      fuente: 'RS/SC 2016 cap. 5.2, Tabelas 5.2 y 5.3' };
  }

  /* ---------- Chequeo de consistencia del análisis (lo primero que mira un especialista) ----------
     SB = Ca + Mg + K (+ Na) · CTC pH 7 = SB + H+Al · V% = SB / CTC × 100 · m% = Al / (SB + Al) × 100 */
  function consistencia(a) {
    a = a || {}; var ca = num(a.ca), mg = num(a.mg), k = num(a.k), na = num(a.na) || 0, hal = num(a.hAl), cic = num(a.cic), v = num(a.satBases), al = num(a.aluminio), m = num(a.satAluminio);
    var out = { avisos: [], ok: true };
    if (ca == null || mg == null || k == null) return out;
    out.sb = r1(ca + mg + k + na) ;
    if (hal != null) { out.cicCalc = r1(out.sb + hal); if (cic != null && Math.abs(out.cicCalc - cic) > 0.3) { out.avisos.push('CIC del laboratorio ' + cic + ' ≠ SB + H+Al = ' + out.cicCalc + ' cmolc/dm³'); out.ok = false; } }
    var T = cic != null ? cic : out.cicCalc;
    if (T) { out.vCalc = r1(out.sb / T * 100); if (v != null && Math.abs(out.vCalc - v) > 3) { out.avisos.push('V% del laboratorio ' + v + ' ≠ SB / CTC = ' + out.vCalc + ' %'); out.ok = false; } }
    if (al != null) { out.mCalc = r1(al / (out.sb + al) * 100); if (m != null && Math.abs(out.mCalc - m) > 2) { out.avisos.push('m% del laboratorio ' + m + ' ≠ Al / (SB + Al) = ' + out.mCalc + ' %'); out.ok = false; } }
    if (v != null && v > 100) { out.avisos.push('V% mayor que 100: dato mal leído'); out.ok = false; }
    return out;
  }

  function clave(c) { var n = String(c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }
  function esLeguminosa(c) { return clave(c) === 'soja'; }

  window.SafiaFertilidad = { FUENTE: 'Manual de Calagem e Adubação para os Estados do RS e de SC, SBCS-NRS 2016', K_MG_POR_CMOL: K_MG_POR_CMOL, P_LIM: P_LIM, K_LIM: K_LIM, CLASES: CLASES, CORRECCION: CORRECCION, MANUTENCION: MANUTENCION, EXPORTACION: EXPORTACION, MICROS_RSSC: MICROS_RSSC, SMP: SMP, NOMBRE_ARCILLA: NOMBRE_ARCILLA, NOMBRE_CTC: NOMBRE_CTC,
    claseArcilla: claseArcilla, claseCTC: claseCTC, claseMO: claseMO, interpretarP: interpretarP, interpretarK: interpretarK, interpretarCa: interpretarCa, interpretarMg: interpretarMg, interpretarS: interpretarS, correccion: correccion, manutencion: manutencion, exportacion: exportacion, dosisPK: dosisPK, nitrogeno: nitrogeno, tipoAntecesor: tipoAntecesor,
    dosisSMP: dosisSMP, dosisV: dosisV, vObjetivo: vObjetivo, calcario: calcario, consistencia: consistencia, clave: clave, esLeguminosa: esLeguminosa };
})();
