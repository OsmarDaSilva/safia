/* SAFIA — Motor de diagnóstico agronómico (Motor 6)
   -------------------------------------------------------------------
   Interpreta el análisis de suelo con las tablas usadas en Paraguay,
   explica POR QUÉ un lote rinde más o menos que otro y dice QUÉ HACER
   (encalado, fósforo, potasio, materia orgánica), siempre con la
   fuente. SAFIA compara e interpreta; la prescripción final es del
   agrónomo.

   Fuentes cargadas en las tablas:
   [1] Cubilla, M. & Wendling, A. (2012). Recomendaciones de fertilización
       para soja, trigo, maíz y girasol bajo el sistema de siembra directa
       en el Paraguay. CAPECO / IPTA / RENALAS. (P y K Mehlich-1 por clase
       de arcilla, niveles críticos, dosis correctivas y de manutención,
       criterios de encalado, MO para N).
   [2] Manual de Adubação e Calagem para RS/SC (SBCS-NRS, 2016), base del
       sistema paraguayo: encalar si pH(agua) ≤ 5,5, V% < 65 o Al > 10%;
       V% objetivo 65 (soja) / 70 (maíz, trigo); clases de CIC y MO.
   [3] Embrapa (2020). Interpretação dos resultados da análise do solo
       (Ca+Mg, Mg, Al). Embrapa Cerrados (Sousa & Lobato): calagem por V%.
   [4] Oliveira Jr. et al. (2001) Scientia Agricola 58(2): relación
       (Ca+Mg)/K > 36 en el suelo = deficiencia inducida de K en soja;
       rango adecuado 20–30. Relación Ca/Mg ideal 3–5 (Embrapa soja 3,5).
   [6] INTA / Fertilizar AC (Orcellet et al. 2022–2025): umbral de respuesta
       a potasio en la región pampeana y litoral argentino 145–204 mg/kg de
       K intercambiable; por encima la probabilidad de respuesta es baja.
   [5] PPI (1997) Manual Internacional de Fertilidad del Suelo: máxima
       disponibilidad de nutrientes entre pH 5,5 y 7,0; fósforo máximo
       entre 6,0 y 6,5; fijación de P por Al y Fe en suelos ácidos;
       rizobio de la soja trabaja mejor a pH 6,0–6,2.
   [7] CESB, Circular Técnica 2 "Fatores decisivos para se obter
       produtividade de soja acima de 4.200 kg/ha" (47 lotes, GO/MG/MT/PR/
       RS/SP, análisis hasta 1 m): los lotes de más de 70 sacas tenían en
       0–20 cm V% 56–68 (70 en 0–10), MO 3,9–4,5 %, K 0,25–0,41 cmolc, Ca
       3,0–4,3, Mg 1,3–1,8, Ca/Mg 2,2–2,5, (Ca+Mg)/K 16–18, B 0,7–1,0
       mg/dm³, Cu 1,3–3,4, Mn 2,4–4,7, Al ≈ 0 (m% 0–2,7); en 20–40 cm Ca
       1,6–2,8 y Mg 0,75–1,2; V% 35–57 en 40–100 cm; resistencia < 1,7 MPa
       hasta 30 cm; 62 % encaló en los últimos 3 años. Cinco factores
       explican el 88,9 %: perfil sin compactación, Ca y Mg en
       profundidad, K + B + Cu, sanidad y distribución de plantas.
   [8] Embrapa Cerrados (Sousa & Lobato; Galrão) "Adubação da soja em
       áreas de Cerrado: micronutrientes": rangos adecuados en suelo,
       Mehlich-1: B (agua caliente) 0,3–0,6 mg/dm³, Cu 0,5–1,2, Mn 2–8,
       Zn 1,0–1,6 (en Mato Grosso el crítico de Zn subió a 2,5 y el de Cu
       a 1,6–2,4). Dosis correctivas al suelo para 4–5 años: B 1 kg/ha,
       Cu 1–2 kg/ha, Zn 6 kg/ha, Mn 6 kg/ha (¼ de la dosis si el tenor
       es medio); Mo 12–30 g/ha + Co 2–3 g/ha en semilla. Clases de S
       (fosfato de calcio) < 5 bajo, 5–10 medio, > 10 alto: Embrapa 2020 [3].
   [9] Universidad de Nebraska-Lincoln, EC117 (2023, maíz) y G1367 (soja,
       riego): crítico de P Bray-1 15 ppm para maíz después de soja (20
       maíz sobre maíz, sin respuesta arriba de 20), K₂O = 125 − K ppm,
       encalar con pH ≤ 5,5; cal también en el subsuelo si pH < 5,5.
   [10] Fertilizar AC / INTA "Soja: nutrición y fertilización en la
       región pampeana": P Bray crítico 12–13 ppm, respuesta probable
       hasta 18; +57 kg/ha de rinde por ppm de P bajo riego; K crítico
       100–150 ppm (EE.UU.) / 80–120 (RS/SC); S con respuesta en suelos
       degradados o de baja MO; B, Zn y Cu bajos en varias zonas; Mo 12–25
       g/ha + Co 1–5 g/ha en semilla (+540 kg/ha en Paraná).
   [11] Embrapa Cerrados, Circ. Téc. 33 (Sousa, Lobato & Rein): para el
       90 % del rinde potencial (cultivos de mayor valor o RIEGO) el
       nivel crítico de P se multiplica por 1,4.
   [12] Nicolodi et al. (2008): la soja empieza a perder rinde con más de
       3 mmolc/dm³ de Al y 5 % de saturación de Al; Ribeiro (1999): 20 %
       como límite tolerable. CESB: campeones con Al ≈ 0 en 0–20 cm.
   ------------------------------------------------------------------- */
(function () {
  'use strict';

  var K_MG_POR_CMOL = 391;   // 1 cmolc/dm³ de K = 391 mg/dm³
  var F = function () { return window.SafiaFertilidad; };   // tablas del Manual RS/SC 2016 (safia-fertilidad.js): P por arcilla, K por CTC, dosis, encalado

  /* ---------- objetivos por cultivo ---------- */
  var CULTIVOS = {
    // v: saturación de bases por debajo de la cual el manual RS/SC indica calcáreo en directa (65 %); la dosis apunta a pH 6,0 (V 75 %).
    // expP/expK: kg de P₂O₅ y K₂O que se lleva cada tonelada de grano (RS/SC Tabela 6.1.3). mP/mK: manutención adicional por t extra (Tabela 6.1.2).
    soja:    { n: 'Soja',    v: 65, phMin: 5.5, phOpt: [6.0, 6.5], mP: 15, mK: 25, expP: 14, expK: 20 },
    maiz:    { n: 'Maíz',    v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 15, mK: 10, expP: 8,  expK: 6 },
    trigo:   { n: 'Trigo',   v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 15, mK: 10, expP: 10, expK: 6 },
    girasol: { n: 'Girasol', v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 15, mK: 15, expP: 14, expK: 6 },
    sorgo:   { n: 'Sorgo',   v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 15, mK: 10, expP: 8,  expK: 4 },
    otro:    { n: 'Cultivo', v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 15, mK: 15, expP: 10, expK: 8 }
  };
  // Suelo objetivo para 6.000–7.000 kg/ha de soja (y maíz de alto rinde), 0–20 cm: lo que tenían los lotes
  // de más de 4.200–6.000 kg/ha auditados por CESB [7] acotado por los rangos de Embrapa [8][11] y UNL [9].
  var ALTO_RINDE = {
    ph: [6.0, 6.5], v: 65, mo: 3.0, pFactor: 1.4, k: 0.30, ca: 3.0, mg: 1.3, caMg: [2, 4], bk: [10, 30],   // V% 65 en 0–20 cm (CESB 56–68; el 70 % es en 0–10 cm)
    b: 0.5, zn: 1.3, cu: 0.8, mn: 5.0, s: 10, al: 0.3, m: 5,   // micros: "alto" de Embrapa 2013 (Tabela 21) salvo Cu (CESB 1,3–3,4 → 0,8 objetivo)
    profundo: { ca: 1.6, mg: 0.75, v: 40, m: 20 }   // 20–40 cm (CESB) y criterio de yeso (Embrapa)
  };
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function perfilCultivo(nombre) {
    var n = norm(nombre);
    if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return CULTIVOS.soja;
    if (n.indexOf('maiz') === 0) return CULTIVOS.maiz;
    if (n.indexOf('trigo') === 0) return CULTIVOS.trigo;
    if (n.indexOf('girasol') === 0) return CULTIVOS.girasol;
    if (n.indexOf('sorgo') === 0) return CULTIVOS.sorgo;
    return CULTIVOS.otro;
  }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(v); return isNaN(x) ? null : x; }
  function fmt(v, d) { return v == null ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* ---------- Clases de P (por arcilla) y K (por CTC): Manual RS/SC 2016 vía SafiaFertilidad.
     Lo único que se conserva de Cubilla (2005) es cuánto P₂O₅ cuesta subir 1 mg/dm³ de P Mehlich-1 en 0–20 cm,
     usado solo para "construir" P por encima del crítico (alto rinde): ≈ 25 kg en suelos arcillosos, 15 en medios. ---------- */
  var KG_P2O5_POR_MG = { 1: 25, 2: 25, 3: 15, 4: 15 };

  /* ---------- interpretación de un análisis ----------
     suelo: { ph, mo, p, k(cmolc), ca, mg, cic, satBases, arcilla }
     Devuelve lista de parámetros con categoría, limitación 0..1 y texto. */
  function interpretarSuelo(suelo, cultivo) {
    var cu = perfilCultivo(cultivo);
    var s = suelo || {};
    var ph = num(s.ph), mo = num(s.mo), p = num(s.p), k = num(s.k), ca = num(s.ca), mg = num(s.mg), cic = num(s.cic), v = num(s.satBases), arc = num(s.arcilla);
    var kmg = k == null ? null : k * K_MG_POR_CMOL;
    var iP = F() ? F().interpretarP(p, arc) : null, iK = F() ? F().interpretarK(k, cic) : null;
    var C = F() ? F().cerrado : null, iP2 = C ? C.interpretarP(p, arc) : null, iK2 = C ? C.interpretarK(k, arc, cic) : null;
    var pc = iP ? { critico: iP.critico, limites: iP.limites, kgPorMg: KG_P2O5_POR_MG[iP.claseArcilla] } : { critico: 12, limites: [4, 8, 12, 24], kgPorMg: 25 };   // crítico y límites de P para los objetivos de alto rinde
    var out = [];

    // pH
    if (ph != null) {
      var lim = 0, est = 'ok', txt;
      if (ph < cu.phMin) { lim = clamp((cu.phMin - ph) / 1.0, 0.3, 1); est = 'limita'; txt = 'Ácido (' + fmt(ph, 1) + '): por debajo de 5,5 aumenta el aluminio tóxico y la fijación del fósforo por Al y Fe; los nutrientes están menos disponibles.'; }
      else if (ph < cu.phOpt[0]) { lim = 0.2; est = 'atencion'; txt = 'Aceptable (' + fmt(ph, 1) + '), pero por debajo del óptimo ' + fmt(cu.phOpt[0], 1) + '–' + fmt(cu.phOpt[1], 1) + ': el fósforo rinde más entre 6,0 y 6,5' + (cu === CULTIVOS.soja ? ' y el rizobio de la soja trabaja mejor a 6,0–6,2' : '') + '.'; }
      else if (ph <= 7.0) { txt = 'En el rango de máxima disponibilidad de nutrientes (5,5–7,0).'; }
      else { lim = 0.3; est = 'exceso'; txt = 'Alto (' + fmt(ph, 1) + '): por encima de 7 bajan micronutrientes (Zn, Mn, Fe, B).'; }
      out.push({ k: 'ph', n: 'pH', valor: ph, unidad: '', categoria: est === 'limita' ? 'baja' : (est === 'atencion' ? 'media' : 'adecuada'), estado: est, limitacion: lim * 1.0, peso: 1.0, texto: txt, fuente: '[1][5]' });
    }
    // Saturación de bases
    if (v != null) {
      var dV = cu.v - v, limV = clamp(dV / 30, 0, 1), estV = dV > 10 ? 'limita' : (dV > 3 ? 'atencion' : 'ok');
      out.push({ k: 'satBases', n: 'Saturación de bases (V%)', valor: v, unidad: '%', categoria: estV === 'ok' ? 'adecuada' : (estV === 'atencion' ? 'media' : 'baja'), estado: estV, limitacion: limV * 0.9, peso: 0.9,
        texto: estV === 'ok' ? (dV > 0 ? 'V% ' + fmt(v, 1) + ', a ' + fmt(dV, 1) + ' puntos del objetivo ' + cu.v + '% para ' + cu.n.toLowerCase() + ': prácticamente en meta.' : 'V% ' + fmt(v, 1) + ' alcanza el objetivo de ' + cu.v + '% para ' + cu.n.toLowerCase() + '.') : 'V% ' + fmt(v, 1) + ' está ' + fmt(dV, 1) + ' puntos por debajo del objetivo (' + cu.v + '% para ' + cu.n.toLowerCase() + '): faltan bases (Ca, Mg, K) en el complejo de cambio; se corrige con encalado.', fuente: '[2][3]' });
    }
    // Fósforo: Mehlich-1 por clase de arcilla (RS/SC Tabela 6.4, cultivos de granos)
    if (iP) {
      var catP = iP.clase, limP = p < iP.critico ? clamp((iP.critico - p) / iP.critico, 0.15, 1) : 0;
      var estP = limP >= 0.4 ? 'limita' : (limP > 0 ? 'atencion' : (catP === 'muy alto' ? 'reserva' : 'ok'));
      out.push({ k: 'p', n: 'Fósforo (P Mehlich-1)', valor: p, unidad: 'mg/dm³', categoria: catP, estado: estP, limitacion: limP * 1.0, peso: 1.0,
        texto: 'Nivel "' + catP + '" para arcilla ' + iP.arcillaTexto + (iP.asumida ? ' (arcilla NO medida: se asume 41–60 %; pedir textura al laboratorio)' : '') + '; nivel crítico ' + iP.critico + ' mg/dm³ (límite de "medio", ~90 % del rinde relativo).' + (iP2 ? ' Segunda opinión Embrapa 2013 (Fundação MS): "' + iP2.clase + '", crítico ' + iP2.critico + ' para arcilla ' + iP2.arcillaTexto + (iP2.clase !== catP ? '. LAS DOS REFERENCIAS NO COINCIDEN: RS/SC (suelos del sur de Brasil) es más exigente en P que Embrapa Cerrado; para oxisoles del Cerrado y del este paraguayo la de Embrapa suele ajustar mejor; pedir textura y decidir con el agrónomo' : ' (coinciden)') + '.' : '') + (limP ? ' Por debajo del crítico hay respuesta a la corrección: ' + (F().correccion(catP, 'p2o5').total) + ' kg/ha de P₂O₅ además de la manutención.' : (catP === 'muy alto' ? ' Reserva muy alta: solo reposición de lo que exporta el grano, o nada si supera el doble del límite.' : ' Cubierto: manutención según el rinde esperado.')), fuente: '[2]', objetivo: '> ' + iP.critico + ' mg/dm³ (alto rinde: ' + Math.round(iP.critico * ALTO_RINDE.pFactor) + ')' });
    }
    // Potasio: Mehlich-1 por clase de CTC pH 7 (RS/SC Tabela 6.9)
    if (iK) {
      var catK = iK.clase, limK = kmg < iK.critico ? clamp((iK.critico - kmg) / iK.critico, 0.15, 1) : 0;
      var kPct = (cic && cic > 0) ? k / cic * 100 : null;                 // % de la CIC ocupado por K (ideal 3–5 %)
      var rBKk = (ca != null && mg != null && k > 0) ? (ca + mg) / k : null;
      var excesoK = (kPct != null && kPct > 6) || (rBKk != null && rBKk < 8); // solo es "exceso" si desequilibra frente a Ca y Mg
      var estK = limK >= 0.4 ? 'limita' : (limK > 0 ? 'atencion' : (excesoK ? 'exceso' : (catK === 'muy alto' ? 'reserva' : 'ok')));
      var txtK = 'Nivel "' + catK + '" para CTC ' + iK.ctcTexto + (iK.asumida ? ' (CTC no informada: se asume media)' : '') + '; nivel crítico ' + iK.critico + ' mg/dm³ (' + fmt(iK.critico / K_MG_POR_CMOL, 2) + ' cmolc/dm³).' + (iK2 ? ' Segunda opinión Embrapa 2013 (Fundação MS, por arcilla ' + iK2.arcillaTexto + '): "' + iK2.clase + '", crítico ' + iK2.criticoMg + ' mg/dm³' + (iK2.pctCTC != null ? ', ocupa ' + fmt(iK2.pctCTC, 1) + ' % de la CTC (ideal 4 %)' : '') + (iK2.clase !== catK && !(catK === 'muy bajo' && iK2.clase === 'bajo') && !(catK === 'muy alto' && iK2.clase === 'alto') ? '. Las dos referencias no coinciden' : '') + '.' : '');
      if (limK) txtK += ' Falta K: afecta el llenado de grano y la tolerancia a la sequía; corrección ' + F().correccion(catK, 'k2o').total + ' kg/ha de K₂O además de la manutención.';
      else if (excesoK) txtK += ' Muy alto y desbalanceado: ocupa ' + fmt(kPct, 1) + ' % de la CIC' + (rBKk != null ? ' y (Ca+Mg)/K es ' + fmt(rBKk, 0) : '') + '. Tanto K frente a Ca y Mg puede frenar la absorción de magnesio; no aplicar K y revisar Mg.';
      else if (catK === 'muy alto') txtK += ' Reserva, no exceso' + (kPct != null ? ' (ocupa ' + fmt(kPct, 1) + ' % de la CIC)' : '') + ': solo reponer lo exportado o no aplicar si supera el doble del límite. Volver a analizar en 2 años.';
      else txtK += ' Cubierto: manutención según el rinde esperado.';
      out.push({ k: 'k', n: 'Potasio (K)', valor: k, unidad: 'cmolc/dm³ (' + fmt(kmg, 0) + ' mg/dm³)', categoria: catK, estado: estK, limitacion: limK * 0.8, peso: 0.8, texto: txtK, fuente: catK === 'muy alto' ? '[2][6]' : '[2]', objetivo: '> ' + iK.critico + ' mg/dm³ (alto rinde: ~117)' });
    }
    // Calcio y magnesio
    if (ca != null) {
      var limCa = ca < 2 ? clamp((2 - ca) / 2, 0.2, 1) : (ca < 4 ? 0.15 : 0);
      out.push({ k: 'ca', n: 'Calcio (Ca)', valor: ca, unidad: 'cmolc/dm³', categoria: ca < 2 ? 'baja' : (ca < 4 ? 'media' : 'alta'), estado: limCa >= 0.2 ? 'limita' : (limCa ? 'atencion' : 'ok'), limitacion: limCa * 0.6, peso: 0.6,
        texto: ca < 2 ? 'Bajo: el calcio construye raíz y paredes celulares; se repone con calcáreo.' : (ca < 4 ? 'Medio.' : 'Bien provisto.'), fuente: '[2]' });
    }
    if (mg != null) {
      var limMg = mg < 0.5 ? clamp((0.5 - mg) / 0.5, 0.3, 1) : (mg < 1.0 ? 0.2 : 0);
      out.push({ k: 'mg', n: 'Magnesio (Mg)', valor: mg, unidad: 'cmolc/dm³', categoria: mg < 0.5 ? 'baja' : (mg < 1.0 ? 'media' : 'alta'), estado: limMg >= 0.3 ? 'limita' : (limMg ? 'atencion' : 'ok'), limitacion: limMg * 0.6, peso: 0.6,
        texto: mg < 0.5 ? 'Bajo: el magnesio es el centro de la clorofila; usar calcáreo dolomítico.' : (mg < 1.0 ? 'Medio: preferir calcáreo dolomítico al encalar.' : 'Bien provisto.'), fuente: '[2]' });
    }
    // Relaciones entre bases
    if (ca != null && mg != null && mg > 0) {
      var rCaMg = ca / mg, limR = 0, txtR;
      if (rCaMg > 8) { limR = 0.5; txtR = 'Ca/Mg ' + fmt(rCaMg, 1) + ': mucho calcio frente al magnesio, la planta absorbe menos Mg y K. Corregir con dolomítico.'; }
      else if (rCaMg > 5) { limR = 0.25; txtR = 'Ca/Mg ' + fmt(rCaMg, 1) + ': por encima del ideal 3–5; al encalar usar dolomítico.'; }
      else if (rCaMg < 2) { limR = 0.25; txtR = 'Ca/Mg ' + fmt(rCaMg, 1) + ': por debajo de 2, falta calcio relativo; al encalar usar calcítico.'; }
      else txtR = 'Ca/Mg ' + fmt(rCaMg, 1) + ': equilibrada (ideal 3–5).';
      out.push({ k: 'rel_camg', n: 'Relación Ca/Mg', valor: rCaMg, unidad: '', categoria: limR ? 'desequilibrada' : 'adecuada', estado: limR >= 0.5 ? 'limita' : (limR ? 'atencion' : 'ok'), limitacion: limR * 0.5, peso: 0.5, texto: txtR, fuente: '[4]' });
    }
    if (ca != null && mg != null && k != null && k > 0) {
      var rBK = (ca + mg) / k, limB = 0, txtB;
      if (rBK > 36) { limB = 0.6; txtB = '(Ca+Mg)/K ' + fmt(rBK, 0) + ': por encima de 36 el potasio queda "tapado" por calcio y magnesio y la soja muestra deficiencia de K aunque el análisis parezca normal. Reforzar K.'; }
      else if (rBK > 30) { limB = 0.25; txtB = '(Ca+Mg)/K ' + fmt(rBK, 0) + ': algo alta (ideal 20–30); vigilar el potasio.'; }
      else if (rBK < 10) { limB = 0.15; txtB = '(Ca+Mg)/K ' + fmt(rBK, 0) + ': potasio relativamente alto frente a Ca y Mg; no falta K.'; }
      else txtB = '(Ca+Mg)/K ' + fmt(rBK, 0) + ': dentro del rango sin problemas (10–30).';
      out.push({ k: 'rel_bk', n: 'Relación (Ca+Mg)/K', valor: rBK, unidad: '', categoria: limB >= 0.6 ? 'desequilibrada' : 'adecuada', estado: limB >= 0.6 ? 'limita' : (limB ? 'atencion' : 'ok'), limitacion: limB * 0.5, peso: 0.5, texto: txtB, fuente: '[4]' });
    }
    // Materia orgánica
    if (mo != null) {
      var limMo = mo < 2 ? clamp((2 - mo) / 2, 0.3, 1) : (mo < 3 ? 0.15 : 0);
      out.push({ k: 'mo', n: 'Materia orgánica', valor: mo, unidad: '%', categoria: mo < 2 ? 'baja' : (mo < 3 ? 'media' : 'alta'), estado: limMo >= 0.3 ? 'limita' : (limMo ? 'atencion' : 'ok'), limitacion: limMo * 0.5, peso: 0.5,
        texto: mo < 2 ? 'Baja: menos nitrógeno mineralizable, menos retención de agua y de nutrientes (CIC). Se recupera con rastrojo, rotación con gramíneas y cobertura.' : (mo < 3 ? 'Media: sigue sumando rastrojo y rotación; cada 1 % de MO más son ~20 kg/ha de N por año y más agua guardada.' : 'Alta: buen reservorio de N y agua.'), fuente: '[1][2]' });
    }
    // CIC
    if (cic != null) {
      out.push({ k: 'cic', n: 'CIC', valor: cic, unidad: 'cmolc/dm³', categoria: cic <= 5 ? 'baja' : (cic <= 15 ? 'media' : 'alta'), estado: cic <= 5 ? 'atencion' : 'ok', limitacion: cic <= 5 ? 0.15 : 0, peso: 0.3,
        texto: cic <= 5 ? 'Baja capacidad de retener nutrientes: fertilizar en dosis partidas y subir la materia orgánica.' : (cic <= 15 ? 'Media: retiene bien los nutrientes; el encalado por V% es eficiente.' : 'Alta: mucha capacidad de reserva; el encalado necesita más calcáreo por punto de V%.'), fuente: '[2]' });
    }
    // Aluminio intercambiable y saturación de aluminio (m%)
    var al = num(s.aluminio), m = num(s.satAluminio);
    if (m == null && al != null && ca != null && mg != null && k != null && (ca + mg + k + al) > 0) m = al / (ca + mg + k + al) * 100;
    if (al != null || m != null) {
      var limAl = 0, estAl = 'ok', txtAl;
      if ((m != null && m > 20) || (al != null && al > 1.0)) { limAl = clamp(((m || 0) - 20) / 30 + 0.5, 0.5, 1); estAl = 'limita'; txtAl = 'Aluminio tóxico: ' + (m != null ? 'saturación ' + fmt(m, 1) + ' %' : 'Al ' + fmt(al, 2) + ' cmolc/dm³') + '. Por encima de 20 % de saturación las raíces de la soja se frenan y no exploran el perfil; encalar es prioritario.'; }
      else if ((m != null && m > 5) || (al != null && al > 0.3)) { limAl = 0.25; estAl = 'atencion'; txtAl = 'Hay aluminio: ' + (m != null ? 'saturación ' + fmt(m, 1) + ' %' : 'Al ' + fmt(al, 2) + ' cmolc/dm³') + '. La soja empieza a perder rinde desde 5 % de saturación (0,3 cmolc); los lotes de más de 6.000 kg/ha tienen Al cero en 0–20 cm. El encalado lo neutraliza.'; }
      else txtAl = 'Sin aluminio tóxico (' + (m != null ? 'saturación ' + fmt(m, 1) + ' %' : 'Al ' + fmt(al, 2) + ' cmolc/dm³') + '): como en los lotes de alto rinde.';
      out.push({ k: 'al', n: 'Aluminio (Al / saturación m%)', valor: m != null ? m : al, unidad: m != null ? '%' : 'cmolc/dm³', categoria: estAl === 'limita' ? 'tóxico' : (estAl === 'atencion' ? 'presente' : 'ausente'), estado: estAl, limitacion: limAl * 0.9, peso: 0.9, texto: txtAl, fuente: '[7][12]', objetivo: 'Al 0 · m% < 5' });
    }
    // Azufre (RS/SC Tabela 6.11: bajo < 2, medio 2–5, alto > 5; leguminosas como la soja: crítico 10)
    var sS = num(s.azufre);
    if (sS != null) {
      var legS = cu === CULTIVOS.soja, catS = F() ? F().interpretarS(sS, legS) : (sS < 5 ? 'bajo' : (sS < 10 ? 'medio' : 'alto')), iS2 = C ? C.interpretarS(sS, arc, cu.n) : null;
      var limS = catS === 'bajo' ? 0.5 : (catS === 'medio' ? 0.15 : 0);
      out.push({ k: 's', n: 'Azufre (S-SO₄)', valor: sS, unidad: 'mg/dm³', categoria: catS, estado: limS >= 0.3 ? 'limita' : (limS ? 'atencion' : 'ok'), limitacion: limS * 0.5, peso: 0.5,
        texto: catS === 'bajo' ? 'Bajo' + (legS ? ' (< 5; la soja, leguminosa, exige el doble: crítico 10)' : ' (< 2)') + ': el azufre es parte de las proteínas y del aceite del grano; responde a yeso o sulfato.' : (catS === 'medio' ? 'Medio' + (legS ? ' (5–10)' : ' (2–5)') + ': conviene reponer lo que se lleva el grano; la capa de 10–20 cm suele tener más S que la de 0–10.' : 'Adecuado.') + (iS2 ? ' Embrapa 2013 (Fundação MS, suelo ' + (iS2.arcilloso ? 'arcilloso' : 'arenoso') + '): "' + iS2.clase + '"' + (iS2.clase !== 'alto' ? ', aplicar ' + iS2.dosis + ' kg S/ha (' + (iS2.clase === 'bajo' ? '80' : '40') + ' + manutención)' : '') + '.' : ''), fuente: '[2][3]', objetivo: legS ? '> 10 mg/dm³' : '> 5 mg/dm³' });
    }
    // Micronutrientes: Embrapa 2013 (Fundação MS Tabela 21: B agua caliente; Cu, Mn, Zn Mehlich-1) y dosis de la Tabela 22
    var MICRO_TXT = {
      boro: { n: 'Boro (B)', k: 'b', peso: 0.7, que: 'hace la floración, el cuaje y la nodulación; su falta aborta flores y vainas', como: 'al suelo (bórax o ulexita, dura 4–5 años) o foliar en floración; franja estrecha con la toxicidad, no exceder' },
      zinc: { n: 'Zinc (Zn)', k: 'zn', peso: 0.6, que: 'regula el crecimiento y el llenado; en suelos ácidos y en maíz es el micro que más limita', como: 'al suelo (sulfato de zinc, dura 4–5 años) o en semilla + foliar' },
      cobre: { n: 'Cobre (Cu)', k: 'cu', peso: 0.4, que: 'participa en la lignificación y la sanidad', como: 'al suelo (sulfato de cobre) o foliar' },
      manganeso: { n: 'Manganeso (Mn)', k: 'mn', peso: 0.3, que: 'baja con pH alto o encalado en exceso', como: 'foliar en V4–R1 o al suelo' }
    };
    ['boro', 'zinc', 'cobre', 'manganeso'].forEach(function (kk) {
      var val = num(s[kk]); if (val == null || !C) return;
      var im = C.interpretarMicro(kk, val), t = MICRO_TXT[kk], objAlto = ALTO_RINDE[{ boro: 'b', zinc: 'zn', cobre: 'cu', manganeso: 'mn' }[kk]];
      var lim = im.clase === 'bajo' ? 0.5 : (im.clase === 'medio' ? 0.15 : 0);
      if (kk === 'zinc' && im.clase === 'bajo') lim = clamp((im.limites[0] - val) / im.limites[0] + 0.3, 0.3, 0.7);
      var pAltoZn = kk === 'zinc' && p != null && p > (iP ? iP.limites[3] : Infinity);
      out.push({ k: t.k, n: t.n, valor: val, unidad: 'mg/dm³', categoria: im.clase === 'bajo' ? 'baja' : (im.clase === 'medio' ? 'media' : (im.clase === 'muy alto' ? 'muy alta' : 'alta')), estado: lim >= 0.3 ? 'limita' : (lim ? 'atencion' : (im.clase === 'muy alto' ? 'exceso' : 'ok')), limitacion: lim * t.peso * (pAltoZn ? 1.2 : 1), peso: t.peso,
        texto: (im.clase === 'bajo' ? 'Bajo (< ' + fmt(im.limites[0], 2) + '): ' + t.que + '. Aplicar ' + fmt(im.dosis, 1) + ' kg/ha ' + t.como + '.' : (im.clase === 'medio' ? 'Medio (' + fmt(im.limites[0], 2) + '–' + fmt(im.limites[1], 2) + '): cubierto para rindes normales; para alto rinde ' + fmt(im.dosis, 1) + ' kg/ha ' + t.como + '.' : (im.clase === 'muy alto' ? 'Muy alto (> ' + im.limites[2] + '): no aplicar; vigilar toxicidad.' : 'Adecuado (≥ ' + fmt(im.limites[1], 2) + ').'))) + (pAltoZn ? ' El P muy alto del suelo antagoniza con el Zn.' : '') + (kk === 'manganeso' && im.clase === 'alto' && val > 20 ? ' Alto: normal en suelos ácidos; baja al encalar.' : ''),
        fuente: '[3][8]', objetivo: '≥ ' + fmt(im.limites[1], 2) + ' mg/dm³' + (objAlto && objAlto > im.limites[1] ? ' (alto rinde ' + fmt(objAlto, 2) + ')' : '') });
    });
    // Objetivo de alto rinde (6–7 t/ha) para los parámetros clásicos y si el lote lo alcanza
    var OBJ = { ph: '6,0–6,5', satBases: '≥ ' + ALTO_RINDE.v + ' % en 0–20 cm (70 en 0–10)', p: '≥ ' + Math.round((iP ? iP.critico : 12) * ALTO_RINDE.pFactor) + ' mg/dm³ (1,4 × crítico, riego)', k: '≥ 0,30 cmolc (117 mg/dm³)', ca: '≥ 3,0 cmolc', mg: '≥ 1,3 cmolc', rel_camg: '2–4', rel_bk: '10–30', mo: '≥ 3 %', cic: '—', arcilla: '—' };
    out.forEach(function (i) {
      if (i.objetivo === undefined) i.objetivo = OBJ[i.k] || '—';
      var v0 = i.valor;
      if (i.k === 'ph') i.alcanzaAlto = v0 >= ALTO_RINDE.ph[0] && v0 <= ALTO_RINDE.ph[1];
      else if (i.k === 'satBases') i.alcanzaAlto = v0 >= ALTO_RINDE.v;
      else if (i.k === 'p') i.alcanzaAlto = v0 >= pc.critico * ALTO_RINDE.pFactor;
      else if (i.k === 'k') i.alcanzaAlto = v0 >= ALTO_RINDE.k;
      else if (i.k === 'ca') i.alcanzaAlto = v0 >= ALTO_RINDE.ca;
      else if (i.k === 'mg') i.alcanzaAlto = v0 >= ALTO_RINDE.mg;
      else if (i.k === 'rel_camg') i.alcanzaAlto = v0 >= ALTO_RINDE.caMg[0] && v0 <= ALTO_RINDE.caMg[1];
      else if (i.k === 'rel_bk') i.alcanzaAlto = v0 >= ALTO_RINDE.bk[0] && v0 <= ALTO_RINDE.bk[1];
      else if (i.k === 'mo') i.alcanzaAlto = v0 >= ALTO_RINDE.mo;
      else if (i.k === 'al') i.alcanzaAlto = i.estado === 'ok';
      else if (i.k === 's') i.alcanzaAlto = v0 >= ALTO_RINDE.s;
      else if (i.k === 'b') i.alcanzaAlto = v0 >= ALTO_RINDE.b;
      else if (i.k === 'zn') i.alcanzaAlto = v0 >= ALTO_RINDE.zn;
      else if (i.k === 'cu') i.alcanzaAlto = v0 >= ALTO_RINDE.cu;
      else if (i.k === 'mn') i.alcanzaAlto = v0 >= 2 ? true : false;   // el exceso de Mn (Mehlich-1 en suelos ácidos) no es "falta": baja al encalar
      else i.alcanzaAlto = null;
    });
    if (arc == null) out.push({ k: 'arcilla', n: 'Arcilla', valor: null, unidad: '%', categoria: 'no medida', estado: 'atencion', limitacion: 0, peso: 0, texto: 'El laboratorio no midió la textura. Las clases de fósforo dependen de la arcilla: se asume 41–60 % (suelos arcillosos de la Región Oriental). Pedir arcilla en el próximo análisis.', fuente: '[2]' });
    if (arc != null && arc < 21) { var pi = out.find(function (i) { return i.k === 'p'; }); if (pi) pi.texto += ' Aviso: CAPECO calibró las clases con 21–60 % de arcilla; con ' + fmt(arc, 0) + ' % se usa la clase 2 por extensión.'; }
    if (arc != null) {
      out.push({ k: 'arcilla', n: 'Arcilla', valor: arc, unidad: '%', categoria: arc > 60 ? 'muy arcilloso' : (arc > 40 ? 'arcilloso' : (arc > 20 ? 'franco' : 'arenoso')), estado: 'ok', limitacion: 0, peso: 0,
        texto: arc > 40 ? 'Suelo pesado: fija más fósforo (por eso el crítico de P es 12 y no 15) y guarda más agua; con riego responde muy bien.' : 'Suelo liviano: menos fijación de P pero menos agua guardada; el riego es más determinante.', fuente: '[1]' });
    }
    return out;
  }

  /* ---------- recomendaciones (qué hacer) ---------- */
  function recomendaciones(suelo, cultivo, rindeObjetivoKgHa) {
    var cu = perfilCultivo(cultivo), s = suelo || {};
    var ph = num(s.ph), p = num(s.p), k = num(s.k), mg = num(s.mg), ca = num(s.ca), cic = num(s.cic), v = num(s.satBases), arc = num(s.arcilla), mo = num(s.mo);
    var kmg = k == null ? null : k * K_MG_POR_CMOL;
    var iP = F() ? F().interpretarP(p, arc) : null, iK = F() ? F().interpretarK(k, cic) : null, pc = iP ? { critico: iP.critico, kgPorMg: KG_P2O5_POR_MG[iP.claseArcilla] } : null;
    var tOb = rindeObjetivoKgHa ? rindeObjetivoKgHa / 1000 : null;
    var r = [];

    // Encalado según el manual RS/SC (Tabelas 5.2 y 5.3): índice SMP si lo hay, si no saturación de bases (V 75 % para pH 6,0)
    if (F()) {
      var cal = F().calcario(s, { sistema: 'directa' }), cal2 = F().cerrado.calcario(s);
      var seg = cal2.necesita ? ' Segunda opinión Embrapa 2013 (Fundação MS): SÍ encalar (' + cal2.motivos.join('; ') + ')' + (cal2.tHa != null ? ', ' + fmt(cal2.tHa, 1) + ' t/ha para llevar V% a ' + cal2.vObjetivo : '') + '.' : ' Segunda opinión Embrapa 2013 (Fundação MS): no encalar (pH ≥ 5,8, V ≥ 60, sin Al).';
      if (!cal.necesita && cal2.necesita) {
        r.push({ k: 'encalado', titulo: 'Encalado: las referencias difieren' + (cal2.tHa != null ? ' — Embrapa/Fundação MS indica ' + fmt(cal2.tHa, 1) + ' t/ha' : ''), detalle: 'RS/SC no lo exige (' + (cal.motivos.length ? cal.motivos.join('; ') : 'pH ≥ 5,5 y V ≥ 65') + ').' + seg + (cal.completa != null ? ' Con el criterio RS/SC, llegar a pH 6,0 costaría ' + fmt(cal.completa, 1) + ' t/ha por ' + cal.metodo + '.' : '') + ' En oxisoles del Cerrado y del este paraguayo el criterio de Embrapa (pH < 5,8 o V < 60) suele ser el que usan los asesores; decidir con el agrónomo.', fuente: '[2][3]' });
      } else if (cal.necesita && cal.sugerida != null) {
        r.push({ k: 'encalado', titulo: 'Encalar ' + fmt(cal.sugerida, 1) + ' t/ha de calcáreo ' + cal.tipo + ' (PRNT 100 %)',
          detalle: 'Motivo: ' + cal.motivos.join('; ') + '. Dosis por ' + cal.metodo + ': ' + fmt(cal.completa, 1) + ' t/ha para llevar el pH de 0–20 cm a 6,0' + (cal.dosisSMP55 ? ' (a 5,5: ' + fmt(cal.dosisSMP55.tHa, 1) + ')' : '') + '. ' + cal.regla + '. Con PRNT menor, dividir por PRNT/100 (ej. 80 % → ' + fmt(cal.sugerida / 0.8, 1) + ' t/ha).' + (cal.nota ? ' ' + cal.nota + '.' : '') + seg, fuente: '[2][3]' });
      } else if (cal.necesita) {
        r.push({ k: 'encalado', titulo: 'Encalar (' + cal.motivos.join('; ') + ')', detalle: 'Para calcular la dosis hacen falta el índice SMP o la CIC y la saturación de bases en el análisis.', fuente: '[2]' });
      } else {
        r.push({ k: 'encalado', titulo: 'No hace falta encalar ahora', detalle: (cal.motivos.length ? cal.motivos.join('; ') + '. ' : '') + (cal.completa != null ? 'Referencia: llevar el pH a 6,0 costaría ' + fmt(cal.completa, 1) + ' t/ha por ' + cal.metodo + '. ' : '') + 'Repetir el análisis cada 2 años.' + seg, fuente: '[2][3]' });
      }
    }
    // Fósforo: corrección (Tabela 6.1.1, gradual 2/3 + 1/3) + manutención por rinde esperado (Tabela 6.1.2) o reposición (6.1.3)
    if (iP) {
      var catP = iP.clase, dP = F().dosisPK(catP, cu.n, tOb || F().manutencion(cu.n).ref, 'p2o5', false, iP.limites[3] ? p / iP.limites[3] : null);
      var iP2r = F().cerrado.interpretarP(p, arc);
      var base = 'P ' + fmt(p, 1) + ' mg/dm³ ("' + catP + '", crítico ' + iP.critico + ' para arcilla ' + iP.arcillaTexto + (iP.asumida ? ', asumida' : '') + '). Embrapa 2013 / Fundação MS: "' + iP2r.clase + '" (crítico ' + iP2r.critico + ')' + (iP2r.correccionTotal ? ', correctiva total ' + iP2r.correccionTotal + ' kg/ha de P₂O₅ incorporada o gradual ' + iP2r.correccionGradual + ' kg/ha por año en el surco durante 4–5 zafras' : ', sin corrección: solo reposición') + (iP2r.clase !== catP ? '. Las dos referencias no coinciden: la dosis de abajo es RS/SC; la de Embrapa suele ajustar mejor en oxisoles' : '') + '.';
      if (dP.correccion) r.push({ k: 'fosforo', titulo: 'Fósforo: ' + fmt(dP.total, 0) + ' kg/ha de P₂O₅ este cultivo (' + dP.regla + ')', detalle: base + ' Corrección total ' + F().correccion(catP, 'p2o5').total + ' kg/ha' + (F().correccion(catP, 'p2o5').gradual ? ' repartida 2/3 ahora y 1/3 en el cultivo siguiente' : ' de una vez') + ', más manutención ' + fmt(dP.manutencion, 0) + ' kg/ha para ' + fmt((tOb || F().manutencion(cu.n).ref) * 1000, 0) + ' kg/ha de ' + cu.n.toLowerCase() + '.' + (ph != null && ph < 5.5 ? ' Encalar primero: con pH bajo el P se fija.' : ''), fuente: '[2]' });
      else if (catP === 'muy alto') r.push({ k: 'fosforo', titulo: 'Fósforo: reserva muy alta, ' + (dP.total ? 'solo reposición (' + fmt(dP.total, 0) + ' kg/ha de P₂O₅)' : 'no aplicar'), detalle: base + ' ' + dP.regla + '. Reponer ' + F().exportacion(cu.n).p2o5 + ' kg de P₂O₅ por tonelada exportada; volver a analizar en 2 años.', fuente: '[2]' });
      else r.push({ k: 'fosforo', titulo: 'Fósforo: manutención ' + fmt(dP.total, 0) + ' kg/ha de P₂O₅', detalle: base + ' Cubierto: manutención de ' + F().manutencion(cu.n).p2o5 + ' kg/ha para ' + F().manutencion(cu.n).ref + ' t/ha más ' + F().manutencion(cu.n).base.addP + ' kg por tonelada adicional.', fuente: '[2]' });
    }
    // Potasio: idem, clases por CTC (Tabela 6.9)
    if (iK) {
      var catK = iK.clase, dK = F().dosisPK(catK, cu.n, tOb || F().manutencion(cu.n).ref, 'k2o', false, iK.limites[3] ? kmg / iK.limites[3] : null);
      var iK2r = F().cerrado.interpretarK(k, arc, cic);
      var baseK = 'K ' + fmt(kmg, 0) + ' mg/dm³ ("' + catK + '", crítico ' + iK.critico + ' para CTC ' + iK.ctcTexto + '). Embrapa 2013 / Fundação MS (arcilla ' + iK2r.arcillaTexto + '): "' + iK2r.clase + '" (crítico ' + iK2r.criticoMg + ')' + (iK2r.correccion ? ', correctiva ' + iK2r.correccion + ' kg/ha de K₂O total o repartida en 3–5 años' : ', sin corrección: reponer lo exportado') + '.';
      if (dK.correccion) r.push({ k: 'potasio', titulo: 'Potasio: ' + fmt(dK.total, 0) + ' kg/ha de K₂O este cultivo (' + dK.regla + ')', detalle: baseK + ' Corrección total ' + F().correccion(catK, 'k2o').total + ' kg/ha' + (F().correccion(catK, 'k2o').gradual ? ' repartida 2/3 ahora y 1/3 en el cultivo siguiente' : ' de una vez') + ', más manutención ' + fmt(dK.manutencion, 0) + ' kg/ha.', fuente: '[2]' });
      else if (catK === 'muy alto') r.push({ k: 'potasio', titulo: 'Potasio: reserva muy alta, ' + (dK.total ? 'solo reposición (' + fmt(dK.total, 0) + ' kg/ha de K₂O)' : 'no aplicar'), detalle: baseK + ' ' + dK.regla + '. Volver a analizar en 2 años.', fuente: '[2]' });
      else r.push({ k: 'potasio', titulo: 'Potasio: manutención ' + fmt(dK.total, 0) + ' kg/ha de K₂O', detalle: baseK + ' Cubierto: manutención de ' + F().manutencion(cu.n).k2o + ' kg/ha para ' + F().manutencion(cu.n).ref + ' t/ha más ' + F().manutencion(cu.n).base.addK + ' kg por tonelada adicional.', fuente: '[2]' });
    }
    // Construcción del suelo de alto rinde (6–7 t/ha): lo que falta entre "adecuado" y lo que tienen los campeones
    if (v != null && cic != null && v < ALTO_RINDE.v && ALTO_RINDE.v > cu.v) {
      var ncAlto = (ALTO_RINDE.v - v) * cic / 100, ncBase = Math.max(0, (cu.v - v) * cic / 100);
      if (ncAlto - ncBase >= 0.2) r.push({ k: 'encalado_alto', titulo: 'Para 6–7 t/ha: llevar V% de ' + fmt(v, 1) + ' a ' + ALTO_RINDE.v + ' (' + fmt(ncAlto, 1) + ' t/ha de calcáreo' + ((mg != null && mg < ALTO_RINDE.mg) ? ' dolomítico' : '') + ' en total' + (ncBase > 0.3 ? ', ' + fmt(ncAlto - ncBase, 1) + ' más que la dosis básica' : '') + ')',
        detalle: (v >= cu.v ? 'V% ' + fmt(v, 1) + ' alcanza el objetivo normal (' + cu.v + '), pero l' : 'L') + 'os lotes de más de 4.200–6.000 kg/ha tienen 56–68 % de saturación de bases en 0–20 cm y 70 % en 0–10 cm, con aluminio cero. NC = (' + ALTO_RINDE.v + ' − ' + fmt(v, 1) + ') × ' + fmt(cic, 2) + ' / 100 = ' + fmt(ncAlto, 1) + ' t/ha (PRNT 100 %). Al voleo sobre el rastrojo, sin arar; repetir cada 2 años como hacen los campeones (62 % encaló en los últimos 3 años).', fuente: '[7][2]' });
    }
    if (pc && p != null && p >= pc.critico && p < pc.critico * ALTO_RINDE.pFactor) {
      var pAlto = Math.round(pc.critico * ALTO_RINDE.pFactor), corrAlto = Math.round((pAlto - p) * pc.kgPorMg);
      if (corrAlto >= 10) r.push({ k: 'fosforo_alto', titulo: 'Para 6–7 t/ha: construir P de ' + fmt(p, 1) + ' a ' + pAlto + ' mg/dm³ (' + fmt(corrAlto, 0) + ' kg/ha de P₂O₅ extra)',
        detalle: 'Con riego o alto valor, Embrapa recomienda el 90 % del potencial: crítico × 1,4 = ' + pAlto + '. Cada mg/dm³ cuesta ' + pc.kgPorMg + ' kg/ha de P₂O₅; se puede hacer en 2–3 cultivos sumándolo a la manutención.', fuente: '[11][1]' });
    }
    if (iK && kmg != null && kmg >= iK.critico && k < ALTO_RINDE.k) {
      var corrKAlto = Math.round((ALTO_RINDE.k - k) * K_MG_POR_CMOL * 2.4 * 1.2 / 10) * 10;   // 1 mg/dm³ ≈ 2 kg K/ha en 0–20 cm × 1,2 (K→K₂O) + 20 % de pérdidas
      r.push({ k: 'potasio_alto', titulo: 'Para 6–7 t/ha: llevar K de ' + fmt(kmg, 0) + ' a ~117 mg/dm³ (0,30 cmolc) con ~' + fmt(corrKAlto, 0) + ' kg/ha de K₂O extra',
        detalle: 'Cubierto para rindes normales (crítico ' + iK.critico + '), pero los lotes de más de 4.200–6.000 kg/ha tienen 0,25–0,41 cmolc (98–160 mg/dm³) y el potasio fue uno de los 5 factores decisivos. Sumar a la manutención en 2–3 cultivos; el K se absorbe sobre todo entre V7 y R5.', fuente: '[7][1]' });
    }
    if (mg != null && mg >= 1.0 && mg < ALTO_RINDE.mg) r.push({ k: 'mg_alto', titulo: 'Para 6–7 t/ha: magnesio ' + fmt(mg, 2) + ' → ≥ 1,3 cmolc con calcáreo dolomítico', detalle: 'Los campeones tienen 1,3–1,8 en 0–20 cm y 0,75–1,2 en 20–40. El Mg reduce 100 veces más que el Ca la toxicidad del aluminio y es el centro de la clorofila. Usar dolomítico en el próximo encalado.', fuente: '[7][3]' });
    // Aluminio
    var alR = num(s.aluminio), mR = num(s.satAluminio);
    if ((mR != null && mR > 5) || (alR != null && alR > 0.3)) r.push({ k: 'aluminio', titulo: 'Aluminio ' + (mR != null ? 'con saturación ' + fmt(mR, 1) + ' %' : fmt(alR, 2) + ' cmolc/dm³') + ': neutralizarlo con el encalado' + ((mR != null && mR > 20) ? ' (prioridad 1)' : ''),
      detalle: 'La soja pierde rinde desde 5 % de saturación de Al; arriba de 20 % las raíces no exploran el perfil. El calcáreo lo neutraliza en 0–20 cm; para el subsuelo (20–60 cm) el yeso (50 × % arcilla kg/ha) baja el Al y sube el Ca. Los lotes de más de 6.000 kg/ha tienen Al cero.', fuente: '[7][12][3]' });
    // Azufre (RS/SC + Embrapa 2013) y micronutrientes (Embrapa 2013 Tabelas 21 y 22)
    var sR = num(s.azufre);
    if (sR != null && F()) {
      var iS2r = F().cerrado.interpretarS(sR, arc, cu.n, tOb), legR = cu === CULTIVOS.soja, catSR = F().interpretarS(sR, legR);
      if (catSR !== 'alto' || iS2r.clase !== 'alto') r.push({ k: 'azufre', titulo: 'Azufre ' + fmt(sR, 1) + ' mg/dm³: aplicar ' + fmt(iS2r.dosis, 0) + ' kg S/ha (yeso ' + fmt(Math.round(iS2r.dosis * 6.5 / 10) * 10, 0) + ' kg/ha o sulfato de amonio)', detalle: 'RS/SC: "' + catSR + '"' + (legR ? ' (la soja exige el doble: crítico 10)' : '') + '. Embrapa 2013 / Fundação MS (suelo ' + (iS2r.arcilloso ? 'arcilloso' : 'arenoso') + '): "' + iS2r.clase + '" → ' + (iS2r.clase === 'bajo' ? '80' : (iS2r.clase === 'medio' ? '40' : '0')) + ' + manutención ' + iS2r.manutencion + ' kg S/ha (5,2 kg S por t de soja; 1,1 por t de maíz). Con fuentes concentradas de P (MAP, SFT) el S se vuelve limitante: el yeso o el superfosfato simple lo aportan.', fuente: '[2][3]' });
    }
    ['boro', 'zinc', 'cobre', 'manganeso'].forEach(function (kk) {
      var val = num(s[kk]); if (val == null || !F()) return;
      var im = F().cerrado.interpretarMicro(kk, val), t = { boro: ['boro', 'Boro', 'bórax o ulexita al suelo (4–5 años) o foliar en floración; no exceder'], zinc: ['zinc', 'Zinc', 'sulfato de zinc al suelo (4–5 años) o en semilla + foliar'], cobre: ['cobre', 'Cobre', 'sulfato de cobre al suelo o foliar'], manganeso: ['manganeso', 'Manganeso', 'foliar en V4–R1 o al suelo'] }[kk];
      if (im.clase === 'bajo' || im.clase === 'medio') r.push({ k: t[0], titulo: t[1] + ' ' + fmt(val, 2) + ' mg/dm³ ("' + im.clase + '"): ' + fmt(im.dosis, 1) + ' kg/ha, ' + t[2], detalle: 'Embrapa 2013 / Fundação MS Tabelas 21 y 22: bajo < ' + fmt(im.limites[0], 2) + ', medio ' + fmt(im.limites[0], 2) + '–' + fmt(im.limites[1], 2) + ', alto ≥ ' + fmt(im.limites[1], 2) + ' mg/dm³; dosis bajo/medio/alto = ' + F().cerrado.MICROS[kk].dosis.map(function (x) { return fmt(x, 1); }).join(' / ') + ' kg/ha' + (im.clase === 'medio' ? ' (en "medio" la dosis es para alto rinde; con rindes normales se puede omitir)' : '') + '.', fuente: '[3][8]' });
    });
    // Cobalto y molibdeno cuando el pH es ácido (el Mo se vuelve menos disponible)
    if (ph != null && ph < 5.8 && cu === CULTIVOS.soja) r.push({ k: 'como', titulo: 'Cobalto + molibdeno en la semilla (pH ' + fmt(ph, 1) + ')', detalle: 'En suelos ácidos el molibdeno está menos disponible y es la pieza central de la nitrogenasa del rizobio. Mo 12–25 g/ha + Co 1–5 g/ha en semilla junto con el inoculante: +540 kg/ha en ensayos de Paraná.', fuente: '[10]' });
    // Materia orgánica
    if (mo != null && mo < 3) {
      r.push({ k: 'mo', titulo: 'Materia orgánica ' + fmt(mo, 2) + ' %: seguir construyéndola', detalle: 'Rotación con gramíneas (maíz, trigo, avena, brachiaria), cobertura permanente, no quemar rastrojo. En riego, una cobertura de invierno aprovecha el agua y suma carbono.', fuente: '[1][2]' });
    }
    return r;
  }

  /* ---------- por qué rinde más o menos: mio vs ref (casos del motor) ---------- */
  function diagnosticarDiferencia(mio, ref, cultivo) {
    var cu = perfilCultivo(cultivo || (mio && mio.cultivo));
    var factores = [];
    var dif = (mio && ref && mio.rindeKgHa != null && ref.rindeKgHa != null) ? mio.rindeKgHa - ref.rindeKgHa : null;
    var pct = (dif != null && ref.rindeKgHa) ? dif / ref.rindeKgHa * 100 : null;

    var intMio = mio && mio.suelo ? interpretarSuelo(mio.suelo, cu.n) : [];
    var intRef = ref && ref.suelo ? interpretarSuelo(ref.suelo, cu.n) : [];
    var refPor = {}; intRef.forEach(function (i) { refPor[i.k] = i; });

    // Suelo: lo que limita al mío y NO limita al de referencia explica la diferencia
    var mioGana = dif != null && dif > 0;
    function decDe(k) { return (k === 'ph' || k === 'p' || k === 'satBases' || k.indexOf('rel') === 0) ? 1 : 2; }
    intMio.forEach(function (i) {
      if (!i.limitacion || i.limitacion < 0.1) return;
      var r = refPor[i.k];
      var ventaja = r ? (i.limitacion - r.limitacion) : i.limitacion * 0.7;
      factores.push({ tipo: 'suelo', k: i.k, nombre: i.n, peso: Math.max(ventaja, 0.05) * i.peso, limitaMio: i.limitacion, limitaRef: r ? r.limitacion : null,
        texto: i.n + ': ' + fmt(i.valor, decDe(i.k)) + (r ? ' vs ' + fmt(r.valor, decDe(i.k)) + ' del otro lote' : '') + '. ' + i.texto });
    });

    // Agua
    if (mio && ref && mio.aguaTotalMM != null && ref.aguaTotalMM != null && ref.aguaTotalMM > 0) {
      var dA = (mio.aguaTotalMM - ref.aguaTotalMM) / ref.aguaTotalMM;
      var et0 = (mio.clima && mio.clima.et0Total) || null;
      if (dA < -0.10 && mioGana) factores.push({ tipo: 'agua', k: 'agua', nombre: 'Agua del ciclo', peso: 0.1, texto: 'Con ' + fmt(-dA * 100, 0) + ' % menos agua (' + fmt(mio.aguaTotalMM, 0) + ' vs ' + fmt(ref.aguaTotalMM, 0) + ' mm) rendiste más: mejor eficiencia del agua.' + (et0 ? ' Tu ET₀ del ciclo fue ' + fmt(et0, 0) + ' mm' + (mio.aguaTotalMM < et0 ? ': quedaste por debajo de la demanda, hay margen para más rinde completando con riego.' : ': demanda cubierta.') : '') });
      else if (dA < -0.10) factores.push({ tipo: 'agua', k: 'agua', nombre: 'Agua del ciclo', peso: clamp(-dA, 0, 1) * 1.0, texto: 'Recibiste ' + fmt(mio.aguaTotalMM, 0) + ' mm (lluvia + riego) contra ' + fmt(ref.aguaTotalMM, 0) + ' mm del otro lote: ' + fmt(-dA * 100, 0) + ' % menos agua.' + (et0 ? ' Tu ET₀ del ciclo fue ' + fmt(et0, 0) + ' mm: ' + (mio.aguaTotalMM < et0 ? 'quedaste por debajo de la demanda; completar con riego.' : 'cubriste la demanda.') : '') });
      else if (dA > 0.10) factores.push({ tipo: 'agua', k: 'agua', nombre: 'Agua del ciclo', peso: 0.05, texto: 'Tuviste más agua (' + fmt(mio.aguaTotalMM, 0) + ' vs ' + fmt(ref.aguaTotalMM, 0) + ' mm): el agua no explica un rinde menor; mirar suelo y manejo.' });
    }
    // Clima
    if (mio && ref && mio.clima && ref.clima) {
      var d35 = (mio.clima.diasMayor35 || 0) - (ref.clima.diasMayor35 || 0);
      if (d35 >= 3) factores.push({ tipo: 'clima', k: 'calor', nombre: 'Estrés por calor', peso: clamp(d35 / 15, 0.1, 0.8), texto: fmt(mio.clima.diasMayor35, 0) + ' días con máxima ≥ 35° contra ' + fmt(ref.clima.diasMayor35, 0) + ' del otro ciclo: el calor en floración y llenado baja el rinde aunque no falte agua.' });
      var dT = (num(mio.clima.tempMedia) || 0) - (num(ref.clima.tempMedia) || 0);
      if (Math.abs(dT) >= 1.5) factores.push({ tipo: 'clima', k: 'temp', nombre: 'Temperatura media', peso: 0.2, texto: 'Temperatura media del ciclo ' + fmt(mio.clima.tempMedia, 1) + '° vs ' + fmt(ref.clima.tempMedia, 1) + '°: ' + (dT > 0 ? 'ciclo más caluroso, más corto y con más demanda de agua.' : 'ciclo más fresco y largo.') });
    }
    // Manejo
    if (mio && ref) {
      if (mio.variedad && ref.variedad && norm(mio.variedad) !== norm(ref.variedad)) factores.push({ tipo: 'manejo', k: 'variedad', nombre: 'Material', peso: 0.25, texto: 'Variedades distintas (' + mio.variedad + ' vs ' + ref.variedad + '): parte de la diferencia puede ser genética. Comparar en el ranking de variedades.' });
      if (mio.epoca && ref.epoca && norm(mio.epoca) !== norm(ref.epoca)) factores.push({ tipo: 'manejo', k: 'epoca', nombre: 'Época de siembra', peso: 0.3, texto: 'Épocas distintas (' + mio.epoca + ' vs ' + ref.epoca + '): la fecha cambia la radiación y el calor que recibe el cultivo en floración.' });
      if (mio.siembra && ref.siembra) {
        var dd = Math.round((new Date(mio.siembra) - new Date(ref.siembra)) / 86400000);
        if (Math.abs(dd) >= 15 && !(mio.epoca && ref.epoca && norm(mio.epoca) !== norm(ref.epoca))) factores.push({ tipo: 'manejo', k: 'fecha', nombre: 'Fecha de siembra', peso: clamp(Math.abs(dd) / 60, 0.1, 0.4), texto: 'Sembraste ' + Math.abs(dd) + ' días ' + (dd > 0 ? 'después' : 'antes') + ' que el otro lote.' });
      }
      var encM = num(mio.encaladoTnHa), encR = num(ref.encaladoTnHa);
      if (encR != null && encR > 0 && (encM == null || encM === 0)) factores.push({ tipo: 'manejo', k: 'encalado', nombre: 'Encalado', peso: 0.35, texto: 'El otro lote encaló ' + fmt(encR, 1) + ' t/ha en esa campaña y este no.' });
      // Rotación y cobertura de invierno
      if (mio.rotacion && ref.rotacion) {
        if (mio.rotacion.cargada && ref.rotacion.cargada) {
          if (ref.rotacion.conCobertura && !mio.rotacion.conCobertura) factores.push({ tipo: 'manejo', k: 'cobertura', nombre: 'Cobertura de invierno', peso: 0.35, texto: 'El otro lote venía de una cobertura (' + (window.SafiaInsumos ? SafiaInsumos.nombreCobertura(ref.rotacion.cobertura).toLowerCase() : ref.rotacion.cobertura) + ') y este ' + (mio.rotacion.cobertura === 'ninguna' ? 'no tuvo cobertura' : 'no la registró') + '. La cobertura suma materia orgánica, frena malezas y guarda agua para el cultivo siguiente.' });
          if (mio.rotacion.sojaSobreSoja && !ref.rotacion.sojaSobreSoja) factores.push({ tipo: 'manejo', k: 'sojasoja', nombre: 'Soja sobre soja', peso: 0.3, texto: 'Este lote sembró soja sobre soja; el otro venía de ' + (ref.rotacion.anterior || 'otro cultivo') + '. Repetir la misma oleaginosa acumula enfermedades y plagas del suelo y baja el rinde: rotar con maíz, trigo o una gramínea de cobertura.' });
          else if (mio.rotacion.mismoCultivo && !ref.rotacion.mismoCultivo) factores.push({ tipo: 'manejo', k: 'mismocultivo', nombre: 'Mismo cultivo seguido', peso: 0.2, texto: 'Este lote repitió ' + mio.cultivo + ' sobre ' + mio.rotacion.anterior + '; el otro rotó (' + (ref.rotacion.anterior || 'otro cultivo') + ' antes).' });
          if (ref.rotacion.siembraDirecta && mio.rotacion.convencional) factores.push({ tipo: 'manejo', k: 'sistema', nombre: 'Sistema de siembra', peso: 0.3, texto: 'El otro lote sembró en directa sobre cobertura o rastrojo; este rastroneó (convencional). Remover el suelo pierde humedad y materia orgánica y rompe la estructura; en siembra directa el agua se conserva mejor.' });
          if (ref.rotacion.subsolado && !mio.rotacion.subsolado) factores.push({ tipo: 'manejo', k: 'subsolado', nombre: 'Subsolado / descompactación', peso: 0.2, texto: 'El otro lote subsoló antes de sembrar y este no. En suelos arcillosos con tránsito de maquinaria, la compactación frena raíces y agua; conviene medir con penetrómetro antes de decidir.' });
          if (ref.rotacion.consorcioSantaFe && !mio.rotacion.consorcioSantaFe && mio.cultivo && /ma[ií]z|sorgo/i.test(mio.cultivo)) factores.push({ tipo: 'manejo', k: 'santafe', nombre: 'Sistema Santa Fe', peso: 0.15, texto: 'El otro lote sembró el ' + mio.cultivo.toLowerCase() + ' consorciado con brachiaria (Santa Fe): deja paja y raíces para la siembra directa siguiente y pasto para el invierno.' });
        } else if (!mio.rotacion.cargada && ref.rotacion.cargada) {
          factores.push({ tipo: 'manejo', k: 'rot_sin', nombre: 'Antecesor y cobertura sin cargar', peso: 0.1, texto: 'El otro lote tiene cargado qué había antes (' + (ref.rotacion.anterior || '') + (ref.rotacion.conCobertura ? ', con cobertura' : '') + '); esta campaña no. Cargalo en Campañas → "Antecesor y cobertura".' });
        }
      }
      // Manejo e insumos: prácticas que el otro lote hizo y este no (solo si los dos tienen el manejo cargado)
      if (window.SafiaInsumos && mio.manejo && ref.manejo) {
        if (mio.manejo.cargado && ref.manejo.cargado) {
          SafiaInsumos.PRACTICAS.forEach(function (p) {
            var a = SafiaInsumos.tiene(mio.manejo, p.k), b = SafiaInsumos.tiene(ref.manejo, p.k);
            if (b && !a) {
              var txt = 'El otro lote hizo «' + p.n + '»' + (ref.manejo[p.k] > 1 ? ' (' + ref.manejo[p.k] + ' aplicaciones)' : '') + ' y este no lo registró.';
              if (p.k === 'inoculacionSurco' && SafiaInsumos.tiene(mio.manejo, 'inoculacion')) txt = 'El otro lote inoculó con líquido en el surco de siembra (sembradora con tanque); este mezcló el inoculante con la semilla. En el surco el rizobio llega más protegido del sol y de los fungicidas de la semilla.';
              factores.push({ tipo: 'manejo', k: 'ins_' + p.k, nombre: p.n, peso: p.peso, texto: txt });
            }
            else if (a && b && ref.manejo[p.k] > mio.manejo[p.k] + 1) factores.push({ tipo: 'manejo', k: 'ins_' + p.k, nombre: p.n, peso: p.peso * 0.5, texto: p.n + ': ' + ref.manejo[p.k] + ' aplicaciones en el otro lote contra ' + mio.manejo[p.k] + ' acá.' });
          });
        } else if (!mio.manejo.cargado && ref.manejo.cargado) {
          factores.push({ tipo: 'manejo', k: 'ins_sin', nombre: 'Manejo e insumos sin cargar', peso: 0.15, texto: 'El otro lote tiene cargado su manejo (' + SafiaInsumos.textoCorto(ref.manejo) + '); esta campaña no. Cargalo en Campañas → "Manejo e insumos" para comparar tratamiento de semilla, inoculación, fertilización y protección.' });
        }
      } else if (ref.fertilizacion && !mio.fertilizacion) factores.push({ tipo: 'manejo', k: 'fert', nombre: 'Fertilización', peso: 0.2, texto: 'El otro lote registró fertilización ("' + ref.fertilizacion + '") y este no tiene registro: cargala para poder comparar.' });
      var dM = num(mio.densidad), dR = num(ref.densidad);
      if (dM != null && dR != null && dR > 0 && Math.abs(dM - dR) / dR > 0.15) factores.push({ tipo: 'manejo', k: 'densidad', nombre: 'Densidad de siembra', peso: 0.15, texto: 'Densidad ' + fmt(dM, 0) + ' vs ' + fmt(dR, 0) + ' plantas/ha.' });
    }

    factores.sort(function (a, b) { return b.peso - a.peso; });
    var limitantes = intMio.filter(function (i) { return i.limitacion > 0; }).sort(function (a, b) { return b.limitacion * b.peso - a.limitacion * a.peso; });
    return { dif: dif, pct: pct, empate: pct != null && Math.abs(pct) < 5, factores: factores, limitantes: limitantes, interpretacionMio: intMio, interpretacionRef: intRef, cultivo: cu.n };
  }

  /* ---------- informe en HTML para el Banco (por qué + qué hacer) ---------- */
  function badgeEstado(e) {
    var m = { limita: ['🔻 limita', '#B3261E', '#FDECEA'], atencion: ['⚠️ atención', '#8B6F00', '#FFF6D6'], ok: ['✔ ok', '#178029', '#E7F6EA'], reserva: ['✔ reserva alta', '#1565C0', '#E3F2FD'], exceso: ['▲ exceso', '#8B6F00', '#FFF6D6'] }[e] || ['—', '#666', '#eee'];
    return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:' + m[1] + ';background:' + m[2] + ';">' + m[0] + '</span>';
  }
  function tablaInterpretacion(lista) {
    if (!lista.length) return '<div class="muted">Sin análisis de suelo cargado.</div>';
    return '<div class="tablewrap"><div class="tablescroll"><table class="tbl tbl-interp"><thead><tr><th>Parámetro</th><th class="r">Valor</th><th>Categoría</th><th>Objetivo 6–7 t/ha</th><th>Lectura</th></tr></thead><tbody>' +
      lista.map(function (i) {
        var dec = i.k === 'ph' || i.k === 'p' || i.k === 'satBases' || i.k === 'arcilla' || i.k === 's' || i.k === 'al' || i.k.indexOf('rel') === 0 ? 1 : 2;
        var obj = i.objetivo && i.objetivo !== '—' ? '<div style="font-size:12px;">' + esc(i.objetivo) + '</div>' + (i.alcanzaAlto === true ? '<div class="sub" style="color:#178029;font-weight:700;">alcanzado</div>' : (i.alcanzaAlto === false ? '<div class="sub" style="color:#B3261E;font-weight:700;">falta</div>' : '')) : '<span class="muted">—</span>';
        return '<tr><td><b>' + esc(i.n) + '</b></td><td class="r"><span class="num">' + fmt(i.valor, dec) + '</span>' + (i.unidad ? '<div class="sub">' + esc(i.unidad) + '</div>' : '') + '</td><td>' + badgeEstado(i.estado) + '<div class="sub">' + esc(i.categoria) + '</div></td><td>' + obj + '</td><td style="font-size:12px;">' + esc(i.texto) + ' <span class="muted">' + esc(i.fuente) + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<div class="muted" style="font-size:11px;margin-top:4px;">Objetivo 6–7 t/ha: suelo de los lotes de más de 4.200–6.000 kg/ha auditados por CESB [7], acotado por Embrapa [8][11] y UNL [9]. Es referencia, no receta.</div>';
  }
  function listaRecomendaciones(recs) {
    if (!recs.length) return '';
    return '<div style="display:grid;gap:8px;margin-top:8px;">' + recs.map(function (r) {
      return '<div style="border:1px solid #E1E4E7;border-left:4px solid #22A93A;border-radius:8px;padding:10px 12px;background:#fff;"><div style="font-weight:700;">' + esc(r.titulo) + '</div><div style="font-size:12px;color:#555;margin-top:3px;">' + esc(r.detalle) + ' <span class="muted">' + esc(r.fuente) + '</span></div></div>';
    }).join('') + '</div>';
  }
  /* Con quién se compara un lote: el mejor de la localidad que rinda MÁS; si el lote ya es el mejor ahí, se sube al departamento
     y después a toda la base SAFIA. Si nadie rinde más, el lote es la referencia (esMejor) y se informa el "siguiente" sin nombres. */
  function referenciaPara(mio, candidatos, campo) {
    var ajenos = (candidatos || []).filter(function (c) { return String(c.campoId) !== String(campo.id) && norm(c.cultivo) === norm(mio.cultivo) && c.rindeKgHa; });
    var mejorDe = function (l) { return l.length ? l.reduce(function (a, b) { return b.rindeKgHa > a.rindeKgHa ? b : a; }) : null; };
    var local = ajenos.filter(function (c) { return campo.localidad && norm(c.localidad) === norm(campo.localidad); });
    var depto = ajenos.filter(function (c) { return campo.departamento && norm(c.departamento) === norm(campo.departamento); });
    var niveles = [[local, campo.localidad], [depto, campo.departamento], [ajenos, 'toda la base SAFIA']];
    for (var i = 0; i < niveles.length; i++) { var m = mejorDe(niveles[i][0]); if (m && m.rindeKgHa > mio.rindeKgHa) return { ref: m, ambito: niveles[i][1], esMejor: false, siguiente: null, hayOtros: ajenos.length > 0 }; }
    var sig = mejorDe(local) || mejorDe(depto) || mejorDe(ajenos);
    return { ref: null, ambito: local.length ? campo.localidad : (depto.length ? campo.departamento : 'toda la base SAFIA'), esMejor: !!sig, siguiente: sig, hayOtros: ajenos.length > 0 };
  }
  function informeHTML(mio, ref, cultivo, opciones) {
    opciones = opciones || {};
    var d = diagnosticarDiferencia(mio, ref, cultivo);
    var html = '';
    // 0) Este lote es el que más rinde: no hay diferencia que explicar; se mira el suelo de los lotes de 6.000–7.000
    if (!ref && opciones.esMejor && opciones.siguiente) {
      html += '<div class="note ok"><b>Este lote es el mejor registrado en SAFIA para ' + esc(cultivo).toLowerCase() + ' en ' + esc(opciones.ambito || 'la zona') + '</b>: rindió ' + fmt(mio.rindeKgHa - opciones.siguiente.rindeKgHa, 0) + ' kg/ha más que el siguiente (' + fmt(opciones.siguiente.rindeKgHa, 0) + ' kg/ha). No hay otro lote con quien explicar una diferencia; la comparación que sigue es contra el suelo de los lotes de 6.000–7.000 kg/ha (columna "Objetivo 6–7 t/ha") y el plan es para sostener y superar lo logrado.</div>';
    }
    // 1) Veredicto
    if (ref && d.dif != null) {
      var quien = 'el mejor lote de ' + esc(ref.localidad || ref.departamento || 'la zona');   // nunca el nombre de otro productor
      if (d.empate) html += '<div class="note ok">Diferencia de <b>' + (d.dif >= 0 ? '+' : '') + fmt(d.dif, 0) + ' kg/ha (' + (d.pct >= 0 ? '+' : '') + fmt(d.pct, 1) + ' %)</b> frente a ' + quien + ': es un <b>empate técnico</b> (menos de 5 %), dentro de la variación normal de una campaña. Aun así, abajo está lo que puede darte los próximos kilos.</div>';
      else if (d.dif < 0) html += '<div class="note warn">Rendiste <b>' + fmt(-d.dif, 0) + ' kg/ha menos (' + fmt(d.pct, 1) + ' %)</b> que ' + quien + '. Factores que más explican la diferencia, en orden de peso:</div>';
      else html += '<div class="note ok">Rendiste <b>' + fmt(d.dif, 0) + ' kg/ha más (+' + fmt(d.pct, 1) + ' %)</b> que ' + quien + '. Lo que igual conviene mirar para sostenerlo:</div>';
    }
    // 2) Factores ordenados
    if (d.factores.length) {
      var iconos = { suelo: '🧪', agua: '💧', clima: '🌡️', manejo: '🧑‍🌾' };
      html += '<ol style="margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.5;">' + d.factores.slice(0, 6).map(function (f, i) {
        var tag = i === 0 ? ' <span style="font-size:11px;font-weight:700;color:' + (d.dif != null && d.dif < 0 && !d.empate ? '#B3261E' : '#8B6F00') + ';">' + (d.dif != null && d.dif < 0 && !d.empate ? '← el más determinante' : '← lo primero a mirar') + '</span>' : '';
        return '<li style="margin-bottom:6px;"><b>' + (iconos[f.tipo] || '') + ' ' + esc(f.nombre) + '</b>' + tag + '<div style="color:#444;">' + esc(f.texto) + '</div></li>';
      }).join('') + '</ol>';
    } else if (ref) {
      html += '<div class="note">Con los datos cargados no aparece ningún factor claro que explique la diferencia: el suelo no limita, y el agua y el clima son parecidos. Mirá manejo fino (fecha, densidad, sanidad, fertilización en cobertura) y cargá esos datos en la campaña para que SAFIA los compare.</div>';
    }
    // 3) Lo que te limita hoy (Liebig)
    if (mio && mio.suelo) {
      html += '<div style="font-weight:700;margin-top:14px;">Lectura del análisis de suelo de este lote' + (mio.suelo.fecha ? ' <span class="muted" style="font-weight:500;">(' + esc(String(mio.suelo.fecha).slice(0, 10)) + ')</span>' : '') + '</div>';
      html += tablaInterpretacion(d.interpretacionMio);
      // objetivo: la meta pedida; si no, la referencia solo cuando rinde MÁS que este lote; si no, sostener el rinde propio (nunca un objetivo menor al logrado)
      var supera = ref && mio && ref.rindeKgHa > mio.rindeKgHa;
      var objetivo = opciones.objetivoKgHa || (supera ? ref.rindeKgHa : null) || (mio && mio.rindeKgHa) || null;
      var recs = recomendaciones(mio.suelo, d.cultivo, objetivo);
      var pr = opciones.propio || null, zn = opciones.zona || null;
      var titulo = opciones.objetivoKgHa ? 'Qué hacer para llegar a la meta de ' + fmt(objetivo, 0) + ' kg/ha' : (supera ? 'Qué hacer para igualar al mejor lote de ' + esc(ref.localidad || ref.departamento || 'la zona') + ' (' + fmt(objetivo, 0) + ' kg/ha)' : 'Qué hacer para mantener o superar tus ' + fmt(objetivo, 0) + ' kg/ha');
      var lado = [];
      if (pr && pr.n > 1) lado.push('tu promedio en ' + esc(d.cultivo).toLowerCase() + ': ' + fmt(pr.promedio, 0) + ' kg/ha en ' + pr.n + ' campañas (mejor ' + fmt(pr.mejor, 0) + ')');
      if (zn && (zn.promedio || zn.mejor)) lado.push('zona ' + esc(zn.ambito || '') + ': ' + (zn.promedio ? 'promedio ' + fmt(zn.promedio, 0) : '') + (zn.promedio && zn.mejor ? ' · ' : '') + (zn.mejor ? 'mejor lote ' + fmt(zn.mejor, 0) : '') + ' kg/ha');
      html += '<div style="font-weight:700;margin-top:14px;">' + titulo + '</div>' + (lado.length ? '<div class="muted" style="font-size:12px;margin:2px 0 6px;">' + lado.join(' · ') + ' · kilos en silo</div>' : '') + listaRecomendaciones(recs);
    } else {
      html += '<div class="note">Este lote no tiene análisis de suelo cargado: sin eso SAFIA no puede decir qué le falta al suelo. Cargalo en la pestaña <b>Análisis de suelo</b> (foto o PDF, lo lee la IA).</div>';
    }
    html += '<div class="muted" style="font-size:11px;margin-top:10px;">Fuentes: [2] Manual de Calagem e Adubação RS/SC, SBCS-NRS 2016 (clases de P por arcilla y de K por CTC, Ca/Mg/S, corrección, manutención, exportación, N, calcáreo por SMP y V%) · [3] Embrapa 2013 (Cerrado) tal como lo publica Fundação MS, Tecnologia e Produção Soja 2018/2019 (P y K por arcilla, S, micronutrientes Tabelas 21–22, calcáreo pH < 5,8 o V < 60): segunda opinión · [1] Cubilla & Wendling 2012, CAPECO/IPTA (solo contraste local y costo de construir P) · [3] Embrapa · [4] Oliveira Jr. et al. 2001, Scientia Agricola · [5] PPI 1997 · [6] INTA/Fertilizar · [7] CESB Circular Técnica 2 (lotes > 4.200–6.000 kg/ha) · [8] Embrapa Cerrados (micronutrientes) · [9] UNL EC117 · [10] Fertilizar/INTA · [11] Embrapa CT33 · [12] Nicolodi 2008. SAFIA interpreta y compara; la prescripción la define el agrónomo con el análisis completo (Al, S, micronutrientes).</div>';
    return html;
  }

  window.SafiaAgro = {
    ALTO_RINDE: ALTO_RINDE,
    interpretarSuelo: interpretarSuelo,
    recomendaciones: recomendaciones,
    diagnosticarDiferencia: diagnosticarDiferencia,
    informeHTML: informeHTML,
    tablaInterpretacion: tablaInterpretacion,
    referenciaPara: referenciaPara,
    listaRecomendaciones: listaRecomendaciones,
    perfilCultivo: perfilCultivo,
    TABLAS: { CULTIVOS: CULTIVOS, KG_P2O5_POR_MG: KG_P2O5_POR_MG }
  };
})();
