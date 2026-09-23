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
   ------------------------------------------------------------------- */
(function () {
  'use strict';

  var K_MG_POR_CMOL = 391;   // 1 cmolc/dm³ de K = 391 mg/dm³

  /* ---------- objetivos por cultivo ---------- */
  var CULTIVOS = {
    soja:    { n: 'Soja',    v: 65, phMin: 5.5, phOpt: [6.0, 6.5], mP: 15,   mK: 25,  expP: 12, expK: 20 },
    maiz:    { n: 'Maíz',    v: 70, phMin: 5.5, phOpt: [5.8, 6.5], mP: 10,   mK: 7.5, expP: 8,  expK: 6 },
    trigo:   { n: 'Trigo',   v: 70, phMin: 5.5, phOpt: [5.8, 6.5], mP: 12.5, mK: 7.5, expP: 10, expK: 6 },
    girasol: { n: 'Girasol', v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 19,   mK: 15,  expP: 15, expK: 12 },
    otro:    { n: 'Cultivo', v: 65, phMin: 5.5, phOpt: [5.8, 6.5], mP: 12,   mK: 12,  expP: 10, expK: 10 }
  };
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function perfilCultivo(nombre) {
    var n = norm(nombre);
    if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return CULTIVOS.soja;
    if (n.indexOf('maiz') === 0) return CULTIVOS.maiz;
    if (n.indexOf('trigo') === 0) return CULTIVOS.trigo;
    if (n.indexOf('girasol') === 0) return CULTIVOS.girasol;
    return CULTIVOS.otro;
  }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(v); return isNaN(x) ? null : x; }
  function fmt(v, d) { return v == null ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* ---------- clases de P y K (Cubilla & Wendling 2012, Mehlich-1) ---------- */
  function claseArcilla(arcilla) { return (arcilla != null && arcilla <= 40) ? 2 : 1; } // >60 % usa clase 1
  var P_CLASES = {
    1: { limites: [4, 8, 12, 24], critico: 12, kgPorMg: 25, correctiva: { 'muy baja': 200, baja: 100, media: 25 } },
    2: { limites: [5, 10, 15, 30], critico: 15, kgPorMg: 15, correctiva: { 'muy baja': 150, baja: 75, media: 15 } }
  };
  var K_CLASE = { limites: [25, 50, 75, 150], critico: 75, correctiva: { 'muy baja': 310, baja: 190, media: 60 } };
  function categoria5(valor, limites) {
    if (valor == null) return 'sin dato';
    if (valor <= limites[0]) return 'muy baja';
    if (valor <= limites[1]) return 'baja';
    if (valor <= limites[2]) return 'media';
    if (valor <= limites[3]) return 'alta';
    return 'muy alta';
  }

  /* ---------- interpretación de un análisis ----------
     suelo: { ph, mo, p, k(cmolc), ca, mg, cic, satBases, arcilla }
     Devuelve lista de parámetros con categoría, limitación 0..1 y texto. */
  function interpretarSuelo(suelo, cultivo) {
    var cu = perfilCultivo(cultivo);
    var s = suelo || {};
    var ph = num(s.ph), mo = num(s.mo), p = num(s.p), k = num(s.k), ca = num(s.ca), mg = num(s.mg), cic = num(s.cic), v = num(s.satBases), arc = num(s.arcilla);
    var kmg = k == null ? null : k * K_MG_POR_CMOL;
    var cl = claseArcilla(arc), pc = P_CLASES[cl];
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
    // Fósforo
    if (p != null) {
      var catP = categoria5(p, pc.limites), limP = p < pc.critico ? clamp((pc.critico - p) / pc.critico, 0.15, 1) : 0;
      var estP = limP >= 0.4 ? 'limita' : (limP > 0 ? 'atencion' : (catP === 'muy alta' ? 'reserva' : 'ok'));
      out.push({ k: 'p', n: 'Fósforo (P Mehlich-1)', valor: p, unidad: 'mg/dm³', categoria: catP, estado: estP, limitacion: limP * 1.0, peso: 1.0,
        texto: 'Categoría "' + catP + '" para suelo clase ' + cl + ' (' + (cl === 1 ? 'más de 40 %' : '21–40 %') + ' de arcilla); nivel crítico ' + pc.critico + ' mg/dm³.' + (limP ? ' Por debajo del crítico hay respuesta probable a la fertilización fosfatada.' : (catP === 'muy alta' ? ' Muy alta = reserva (más del doble del crítico): alcanza con reponer lo exportado o solo arranque; con P tan alto conviene vigilar el zinc.' : ' Alcanza con la manutención (reponer lo exportado).')), fuente: '[1]' });
    }
    // Potasio
    if (kmg != null) {
      var catK = categoria5(kmg, K_CLASE.limites), limK = kmg < K_CLASE.critico ? clamp((K_CLASE.critico - kmg) / K_CLASE.critico, 0.15, 1) : 0;
      var kPct = (cic && cic > 0) ? k / cic * 100 : null;                 // % de la CIC ocupado por K (ideal 3–5 %)
      var rBKk = (ca != null && mg != null && k > 0) ? (ca + mg) / k : null;
      var excesoK = (kPct != null && kPct > 6) || (rBKk != null && rBKk < 8); // solo es "exceso" si desequilibra frente a Ca y Mg
      var estK = limK >= 0.4 ? 'limita' : (limK > 0 ? 'atencion' : (excesoK ? 'exceso' : (catK === 'muy alta' ? 'reserva' : 'ok')));
      var txtK;
      if (limK) txtK = 'Categoría "' + catK + '"; nivel crítico 75 mg/dm³ (0,19 cmolc/dm³). Falta K: afecta llenado de grano y tolerancia a sequía.';
      else if (excesoK) txtK = 'Muy alto y desbalanceado: ocupa ' + fmt(kPct, 1) + ' % de la CIC' + (rBKk != null ? ' y (Ca+Mg)/K es ' + fmt(rBKk, 0) : '') + '. Tanto K frente a Ca y Mg puede frenar la absorción de magnesio; no aplicar K y revisar Mg.';
      else if (catK === 'muy alta') txtK = 'Muy alta = reserva, no exceso: está por encima del crítico 75 (CAPECO), de 180 (Manual RS/SC para CIC 7,6–15) y del umbral argentino 145–204 mg/kg (INTA/Fertilizar)' + (kPct != null ? '; ocupa ' + fmt(kPct, 1) + ' % de la CIC (ideal 3–5 %)' : '') + '. No se espera respuesta a fertilizar con K: alcanza con reponer lo que exporta el grano.';
      else txtK = 'Categoría "' + catK + '"; nivel crítico 75 mg/dm³ (0,19 cmolc/dm³). Cubierto; reponer lo que exporta la cosecha.';
      out.push({ k: 'k', n: 'Potasio (K)', valor: k, unidad: 'cmolc/dm³ (' + fmt(kmg, 0) + ' mg/dm³)', categoria: catK, estado: estK, limitacion: limK * 0.8, peso: 0.8, texto: txtK, fuente: catK === 'muy alta' ? '[1][2][6]' : '[1]' });
    }
    // Calcio y magnesio
    if (ca != null) {
      var limCa = ca < 2 ? clamp((2 - ca) / 2, 0.2, 1) : (ca < 4 ? 0.15 : 0);
      out.push({ k: 'ca', n: 'Calcio (Ca)', valor: ca, unidad: 'cmolc/dm³', categoria: ca < 2 ? 'baja' : (ca < 4 ? 'media' : 'alta'), estado: limCa >= 0.2 ? 'limita' : (limCa ? 'atencion' : 'ok'), limitacion: limCa * 0.6, peso: 0.6,
        texto: ca < 2 ? 'Bajo: el calcio construye raíz y paredes celulares; se repone con calcáreo.' : (ca < 4 ? 'Medio.' : 'Bien provisto.'), fuente: '[3]' });
    }
    if (mg != null) {
      var limMg = mg < 0.5 ? clamp((0.5 - mg) / 0.5, 0.3, 1) : (mg < 1.0 ? 0.2 : 0);
      out.push({ k: 'mg', n: 'Magnesio (Mg)', valor: mg, unidad: 'cmolc/dm³', categoria: mg < 0.5 ? 'baja' : (mg < 1.0 ? 'media' : 'alta'), estado: limMg >= 0.3 ? 'limita' : (limMg ? 'atencion' : 'ok'), limitacion: limMg * 0.6, peso: 0.6,
        texto: mg < 0.5 ? 'Bajo: el magnesio es el centro de la clorofila; usar calcáreo dolomítico.' : (mg < 1.0 ? 'Medio: preferir calcáreo dolomítico al encalar.' : 'Bien provisto.'), fuente: '[3]' });
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
    var kmg = k == null ? null : k * K_MG_POR_CMOL, cl = claseArcilla(arc), pc = P_CLASES[cl];
    var tOb = rindeObjetivoKgHa ? rindeObjetivoKgHa / 1000 : null;
    var r = [];

    // Encalado por saturación de bases: NC (t/ha) = (V2 − V1) × CIC / PRNT
    if (v != null && cic != null) {
      var nc = (cu.v - v) * cic / 100;           // PRNT 100 %
      var hace = nc > 0.3 || (ph != null && ph < cu.phMin);
      if (hace) {
        var ncMostrar = Math.max(nc, 0.5);
        var tipo = (mg != null && (mg < 1.0 || (ca != null && ca / mg > 5))) ? 'dolomítico (aporta Mg)' : 'calcítico o dolomítico';
        r.push({ k: 'encalado', titulo: 'Encalar ' + fmt(ncMostrar, 1) + ' t/ha de calcáreo ' + tipo + ' (PRNT 100 %)',
          detalle: 'Para llevar V% de ' + fmt(v, 1) + ' a ' + cu.v + '% (objetivo ' + cu.n.toLowerCase() + '): NC = (' + cu.v + ' − ' + fmt(v, 1) + ') × ' + fmt(cic, 2) + ' / 100 = ' + fmt(nc, 2) + ' t/ha. Con calcáreo de PRNT menor, dividir por PRNT/100 (ej. PRNT 80 % → ' + fmt(ncMostrar / 0.8, 1) + ' t/ha). En siembra directa se aplica en superficie, sin incorporar; efecto pleno en 6–12 meses; volver a analizar a los 2 años.' + (ph != null && ph < cu.phMin ? ' Además el pH ' + fmt(ph, 1) + ' está por debajo de 5,5.' : ''), fuente: '[1][2][3]' });
      } else {
        r.push({ k: 'encalado', titulo: 'No hace falta encalar ahora', detalle: 'V% ' + fmt(v, 1) + ' ya está en el objetivo de ' + cu.v + '%' + (ph != null ? ' y el pH ' + fmt(ph, 1) + ' es adecuado' : '') + '. Repetir el análisis cada 2 años para mantenerlo.', fuente: '[2]' });
      }
    } else if (ph != null && ph < cu.phMin) {
      r.push({ k: 'encalado', titulo: 'Encalar (pH ' + fmt(ph, 1) + ' por debajo de 5,5)', detalle: 'Para calcular la dosis hacen falta CIC y saturación de bases en el análisis. Referencia para la Región Oriental: 1,5 a 2,6 t/ha de calcáreo (Fatecha, 2004).', fuente: '[1]' });
    }

    // Fósforo
    if (p != null) {
      var catP = categoria5(p, pc.limites), corr = 0;
      if (p < pc.critico) corr = Math.round((pc.critico - p) * pc.kgPorMg);
      var man = tOb ? Math.round(tOb * cu.mP) : null;
      if (corr > 0) {
        r.push({ k: 'fosforo', titulo: 'Fósforo: corregir con ' + fmt(corr, 0) + ' kg/ha de P₂O₅' + (man ? ' + manutención ' + fmt(man, 0) + ' kg/ha por cultivo' : ''),
          detalle: 'P ' + fmt(p, 1) + ' mg/dm³ (' + catP + ') contra un crítico de ' + pc.critico + ' para suelo clase ' + cl + '. Cada mg/dm³ que se quiere subir cuesta ' + pc.kgPorMg + ' kg/ha de P₂O₅ (Cubilla 2005). Se puede hacer gradual en 3 cultivos (tabla ' + (cl === 1 ? '7' : '8') + ' de CAPECO 2012).' + (ph != null && ph < 6 ? ' Encalar primero: con pH bajo, parte del P aplicado se fija en Al y Fe.' : ''), fuente: '[1]' });
      } else if (catP === 'muy alta') {
        var repP = tOb ? Math.round(tOb * cu.expP) : null;
        r.push({ k: 'fosforo', titulo: 'Fósforo: reserva muy alta, solo reposición' + (repP ? ' (' + fmt(repP, 0) + ' kg/ha de P₂O₅)' : '') + ' o arranque',
          detalle: 'P ' + fmt(p, 1) + ' mg/dm³, más del doble del crítico ' + pc.critico + '. CAPECO 2012: con "muy alta" la fertilización puede ser solo de arranque; reponer ' + cu.expP + ' kg de P₂O₅ por tonelada exportada y vigilar zinc.', fuente: '[1]' });
      } else {
        r.push({ k: 'fosforo', titulo: 'Fósforo: solo manutención' + (man ? ' (' + fmt(man, 0) + ' kg/ha de P₂O₅ para ' + fmt(rindeObjetivoKgHa, 0) + ' kg/ha)' : ''),
          detalle: 'P ' + fmt(p, 1) + ' mg/dm³ está en categoría "' + catP + '" (por encima del crítico ' + pc.critico + '). Reponer lo que exporta el grano: ' + cu.expP + ' kg de P₂O₅ por tonelada × 1,25 de pérdidas.', fuente: '[1]' });
      }
    }
    // Potasio
    if (kmg != null) {
      var catK = categoria5(kmg, K_CLASE.limites), corrK = K_CLASE.correctiva[catK] || 0;
      var manK = tOb ? Math.round(tOb * cu.mK) : null;
      if (corrK > 0) {
        r.push({ k: 'potasio', titulo: 'Potasio: corregir con ' + fmt(corrK, 0) + ' kg/ha de K₂O en 3 cultivos' + (manK ? ' + manutención ' + fmt(manK, 0) + ' kg/ha' : ''),
          detalle: 'K ' + fmt(kmg, 0) + ' mg/dm³ (' + catK + ') contra un crítico de 75. Dosis correctiva gradual de la tabla 9 de CAPECO 2012.', fuente: '[1]' });
      } else if (catK === 'muy alta') {
        var repK = tOb ? Math.round(tOb * cu.expK) : null;
        r.push({ k: 'potasio', titulo: 'Potasio: reserva muy alta, solo reposición de lo exportado' + (repK ? ' (' + fmt(repK, 0) + ' kg/ha de K₂O) o arranque' : ' o arranque'),
          detalle: 'K ' + fmt(kmg, 0) + ' mg/dm³ (más del doble del crítico 75). CAPECO 2012: en categoría "muy alta" la fertilización puede ser solo de arranque o dispensarse y destinar el dinero a lo que sí limita; a lo sumo reponer los ' + cu.expK + ' kg de K₂O por tonelada que se lleva el grano. Volver a analizar en 2 años.', fuente: '[1][2][6]' });
      } else {
        r.push({ k: 'potasio', titulo: 'Potasio: solo manutención' + (manK ? ' (' + fmt(manK, 0) + ' kg/ha de K₂O)' : ''),
          detalle: 'K ' + fmt(kmg, 0) + ' mg/dm³ (' + catK + '), por encima del crítico 75. Reponer ' + cu.expK + ' kg de K₂O por tonelada exportada × 1,25.', fuente: '[1]' });
      }
    }
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
    return '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Parámetro</th><th class="r">Valor</th><th>Categoría</th><th>Lectura</th></tr></thead><tbody>' +
      lista.map(function (i) {
        var dec = i.k === 'ph' || i.k === 'p' || i.k === 'satBases' || i.k === 'arcilla' || i.k.indexOf('rel') === 0 ? 1 : 2;
        return '<tr><td><b>' + esc(i.n) + '</b></td><td class="r"><span class="num">' + fmt(i.valor, dec) + '</span>' + (i.unidad ? '<div class="sub">' + esc(i.unidad) + '</div>' : '') + '</td><td>' + badgeEstado(i.estado) + '<div class="sub">' + esc(i.categoria) + '</div></td><td style="font-size:12px;">' + esc(i.texto) + ' <span class="muted">' + esc(i.fuente) + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function listaRecomendaciones(recs) {
    if (!recs.length) return '';
    return '<div style="display:grid;gap:8px;margin-top:8px;">' + recs.map(function (r) {
      return '<div style="border:1px solid #E1E4E7;border-left:4px solid #22A93A;border-radius:8px;padding:10px 12px;background:#fff;"><div style="font-weight:700;">' + esc(r.titulo) + '</div><div style="font-size:12px;color:#555;margin-top:3px;">' + esc(r.detalle) + ' <span class="muted">' + esc(r.fuente) + '</span></div></div>';
    }).join('') + '</div>';
  }
  function informeHTML(mio, ref, cultivo, opciones) {
    opciones = opciones || {};
    var d = diagnosticarDiferencia(mio, ref, cultivo);
    var html = '';
    // 1) Veredicto
    if (ref && d.dif != null) {
      var quien = ref.cliente ? esc(ref.cliente) : 'el otro lote';
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
      var objetivo = opciones.objetivoKgHa || (ref && ref.rindeKgHa) || (mio && mio.rindeKgHa) || null;
      var recs = recomendaciones(mio.suelo, d.cultivo, objetivo);
      html += '<div style="font-weight:700;margin-top:14px;">Qué hacer para ' + (ref && d.dif < 0 ? 'igualar a ' + esc(ref.cliente || 'la referencia') : 'sostener y subir el rinde') + (objetivo ? ' <span class="muted" style="font-weight:500;">(objetivo ' + fmt(objetivo, 0) + ' kg/ha)</span>' : '') + '</div>' + listaRecomendaciones(recs);
    } else {
      html += '<div class="note">Este lote no tiene análisis de suelo cargado: sin eso SAFIA no puede decir qué le falta al suelo. Cargalo en la pestaña <b>Análisis de suelo</b> (foto o PDF, lo lee la IA).</div>';
    }
    html += '<div class="muted" style="font-size:11px;margin-top:10px;">Fuentes: [1] Cubilla & Wendling 2012, CAPECO/IPTA (P y K Mehlich-1, dosis, encalado) · [2] Manual RS/SC 2016 · [3] Embrapa · [4] Oliveira Jr. et al. 2001, Scientia Agricola · [5] PPI 1997 · [6] INTA/Fertilizar (umbral de K 145–204 mg/kg). SAFIA interpreta y compara; la prescripción la define el agrónomo con el análisis completo (Al, S, micronutrientes).</div>';
    return html;
  }

  window.SafiaAgro = {
    interpretarSuelo: interpretarSuelo,
    recomendaciones: recomendaciones,
    diagnosticarDiferencia: diagnosticarDiferencia,
    informeHTML: informeHTML,
    tablaInterpretacion: tablaInterpretacion,
    listaRecomendaciones: listaRecomendaciones,
    perfilCultivo: perfilCultivo,
    TABLAS: { P_CLASES: P_CLASES, K_CLASE: K_CLASE, CULTIVOS: CULTIVOS }
  };
})();
