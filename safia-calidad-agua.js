/* SAFIA — Calidad del agua de riego (Banco Agronómico → pestaña "Análisis de agua")
   -------------------------------------------------------------------
   Carga análisis de agua (a mano o leyendo el PDF del laboratorio con IA), calcula los
   índices de la hoja "Analisis_Agua" de la planilla de Irrigar (Indices Salinidad para
   calcular RAS.xlsx) con las fórmulas CORREGIDAS y verificadas, grafica el diagrama de
   clasificación (Riverside / USSL) y dice si se puede regar, con cuidados o no, y qué hacer.

   Unidades: iones en meq/L, CE en µS/cm a 25 °C, boro en mg/L.

   Fuentes (números entre corchetes en pantalla):
   [1] FAO Riego y Drenaje 29 Rev.1 (Ayers & Westcot 1985), "Water quality for agriculture":
       Tabla 1 (guía de interpretación: salinidad ECw < 0,7 / 0,7–3,0 / > 3,0 dS/m; infiltración
       por RAS y ECw; Na y Cl en aspersión > 3 meq/L; Cl superficie 4 / 10; boro 0,7 / 3,0 mg/L;
       NO3-N 5 / 30 mg/L; HCO3 en aspersión 1,5 / 8,5 meq/L; pH normal 6,5–8,4);
       sección 2.4.2, ecuación 9: fracción de lavado LR = ECw / (5 ECe − ECw);
       Tabla 4: tolerancia de cultivos (ECe y ECw al 100, 90, 75 y 50 % del rinde).
   [2] USDA Agriculture Handbook 60 (Richards 1954): p. 79, curvas del diagrama
       S = 43,75 − 8,87 log C; S = 31,31 − 6,66 log C; S = 18,87 − 4,44 log C (C en µS/cm);
       p. 80, Figura 25 (clases C1–C4: 250 / 750 / 2250 µS/cm); p. 80–81, descripción de
       clases y uso de yeso; p. 81, carbonato de sodio residual (< 1,25 seguro; 1,25–2,5
       dudoso; > 2,5 no apto).
   [3] Salinidad efectiva (Doneen 1959), salinidad potencial (Doneen 1961) y porcentaje de
       sodio posible (Palacios y Aceves 1970): fórmulas y condiciones según "Ojeando la
       agenda" nº 35 (2015) y Universidad Tecnológica de la Mixteca, Temas (2002), que citan a
       Valle (1992): SE < 3 meq/L buena; SP < 3 meq/L buena; PSP < 50 % buena, > 50 % condicionada.
   [4] Índice de Scott (coeficiente alcalimétrico): concentraciones en mg/L; K > 18 buena,
       6–18 tolerable (Revista Mexicana de Ciencias Agrícolas / SciELO 2013).
   [5] Índice de saturación de Langelier con la fórmula de Carrier (1965), a la temperatura del
       agua (25 °C si no se carga): pHs = (9,3 + A + B) − (C + D).
   Datos: colección `analisis_agua` (tabla safia_analisis_agua). Depende de window.SafiaBanco. */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var iniciado = false, editandoId = null, muestrasIA = null;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function log10(x) { return Math.log(x) / Math.LN10; }

  /* ---------- iones: meq/L ↔ mg/L (peso equivalente) ---------- */
  var IONES = [
    { k: 'na',   n: 'Sodio (Na⁺)',            eq: 22.99, tipo: 'cat' },
    { k: 'k',    n: 'Potasio (K⁺)',           eq: 39.10, tipo: 'cat' },
    { k: 'ca',   n: 'Calcio (Ca²⁺)',          eq: 20.04, tipo: 'cat' },
    { k: 'mg',   n: 'Magnesio (Mg²⁺)',        eq: 12.15, tipo: 'cat' },
    { k: 'nh4',  n: 'Amonio (NH₄⁺)',          eq: 18.04, tipo: 'cat' },
    { k: 'cl',   n: 'Cloruros (Cl⁻)',         eq: 35.45, tipo: 'an' },
    { k: 'so4',  n: 'Sulfatos (SO₄²⁻)',       eq: 48.03, tipo: 'an' },
    { k: 'co3',  n: 'Carbonatos (CO₃²⁻)',     eq: 30.00, tipo: 'an' },
    { k: 'hco3', n: 'Bicarbonatos (HCO₃⁻)',   eq: 61.02, tipo: 'an' },
    { k: 'no3',  n: 'Nitratos (NO₃⁻)',        eq: 62.00, tipo: 'an' },
    { k: 'po4',  n: 'Fosfatos',               eq: null,  tipo: 'an' }
  ];
  function v(a, k) { var x = num(a && a[k]); return x == null ? 0 : x; }
  function tiene(a, k) { return num(a && a[k]) != null; }

  /* ---------- cálculo de índices (hoja Analisis_Agua, corregida) ---------- */
  function calcular(a) {
    var r = {}, ce = num(a.ce), ecw = ce != null ? ce / 1000 : null;   // dS/m
    r.ce = ce; r.ecw = ecw; r.ph = num(a.ph); r.boro = num(a.boro);
    r.cationes = v(a, 'na') + v(a, 'k') + v(a, 'ca') + v(a, 'mg') + v(a, 'nh4');
    r.aniones = v(a, 'cl') + v(a, 'so4') + v(a, 'co3') + v(a, 'hco3') + v(a, 'no3') + v(a, 'po4');
    r.balance = r.cationes + r.aniones > 0 ? (r.cationes - r.aniones) / (r.cationes + r.aniones) * 100 : null;
    r.cationesPorCE = ce != null ? ce / 100 : null;   // [2] p. 79: cationes (meq/L) ≈ CE (µS/cm) / 100
    r.tds = ce != null ? ce * 0.64 : null;            // [1] 1 dS/m ≈ 640 mg/L
    r.tdsMedido = num(a.tds);
    var caMg = v(a, 'ca') + v(a, 'mg');
    r.ras = tiene(a, 'na') && caMg > 0 ? v(a, 'na') / Math.sqrt(caMg / 2) : null;   // RAS = Na / √((Ca+Mg)/2)
    r.csr = (tiene(a, 'co3') || tiene(a, 'hco3')) && (tiene(a, 'ca') || tiene(a, 'mg')) ? (v(a, 'co3') + v(a, 'hco3')) - caMg : null;   // CSR = (CO3+HCO3) − (Ca+Mg)
    // Salinidad efectiva [3]: se usa UNA fórmula según la condición (la planilla calculaba las 4 y usaba siempre la cuarta)
    var alc = v(a, 'co3') + v(a, 'hco3'), alcSO4 = alc + v(a, 'so4'), ca = v(a, 'ca');
    if (r.cationes > 0) {
      if (ca > alcSO4) { r.se = r.cationes - alcSO4; r.seCaso = 'Ca > CO₃+HCO₃+SO₄ → SE = cationes − (CO₃+HCO₃+SO₄)'; }
      else if (ca > alc) { r.se = r.cationes - ca; r.seCaso = 'Ca < CO₃+HCO₃+SO₄ pero Ca > CO₃+HCO₃ → SE = cationes − Ca'; }
      else if (caMg > alc) { r.se = r.cationes - alc; r.seCaso = 'Ca < CO₃+HCO₃ pero Ca+Mg > CO₃+HCO₃ → SE = cationes − (CO₃+HCO₃)'; }
      else { r.se = r.cationes - caMg; r.seCaso = 'Ca+Mg < CO₃+HCO₃ → SE = cationes − (Ca+Mg)'; }
    } else r.se = null;
    r.sp = tiene(a, 'cl') || tiene(a, 'so4') ? v(a, 'cl') + v(a, 'so4') / 2 : null;   // SP = Cl + ½ SO4 (la planilla no dividía el SO4)
    r.psp = r.se > 0 && tiene(a, 'na') ? v(a, 'na') / r.se * 100 : null;             // PSP = Na / SE × 100
    // Índice de Scott [4] en mg/L (la planilla lo calculaba en meq/L: daba ~35 veces más alto)
    if (tiene(a, 'na') && tiene(a, 'cl')) {
      var naM = v(a, 'na') * 22.99, clM = v(a, 'cl') * 35.45, so4M = v(a, 'so4') * 48.03;
      if (naM - 0.65 * clM <= 0) { r.scott = clM > 0 ? 2040 / clM : null; r.scottCaso = 'Na − 0,65 Cl ≤ 0 → K = 2040 / Cl'; }
      else if (naM - 0.65 * clM - 0.48 * so4M <= 0) { r.scott = 6620 / (naM + 2.6 * clM); r.scottCaso = '0 < Na − 0,65 Cl < 0,48 SO₄ → K = 6620 / (Na + 2,6 Cl)'; }
      else { r.scott = 662 / (naM - 0.32 * clM - 0.43 * so4M); r.scottCaso = 'Na − 0,65 Cl − 0,48 SO₄ > 0 → K = 662 / (Na − 0,32 Cl − 0,43 SO₄)'; }
    } else r.scott = null;
    // Langelier con Carrier [5] (la planilla sumaba meq/L y daba un pHc imposible)
    var t = num(a.temperatura); if (t == null) t = 25;
    var tdsL = r.tdsMedido != null ? r.tdsMedido : r.tds;
    if (r.ph != null && tdsL > 0 && ca > 0 && alc > 0) {
      var A = (log10(tdsL) - 1) / 10, Bt = -13.12 * log10(t + 273.15) + 34.55, C = log10(ca * 50) - 0.4, D = log10(alc * 50);
      r.phs = (9.3 + A + Bt) - (C + D); r.lsi = r.ph - r.phs; r.temperatura = t;
    } else { r.phs = null; r.lsi = null; }
    r.no3n = tiene(a, 'no3') ? v(a, 'no3') * 14.007 : null;   // mg/L de N-NO3
    r.clase = claseUSSL(ce, r.ras);
    return r;
  }

  /* ---------- diagrama Riverside / USSL [2] ---------- */
  function limitesS(ce) { var L = log10(Math.max(ce, 1)); return { s12: 18.87 - 4.44 * L, s23: 31.31 - 6.66 * L, s34: 43.75 - 8.87 * L }; }
  function claseUSSL(ce, ras) {
    if (ce == null || ras == null) return null;
    var c = ce <= 250 ? 1 : (ce <= 750 ? 2 : (ce <= 2250 ? 3 : 4));
    var l = limitesS(ce), s = ras <= l.s12 ? 1 : (ras <= l.s23 ? 2 : (ras <= l.s34 ? 3 : 4));
    return { c: c, s: s, txt: 'C' + c + '-S' + s, limites: l };
  }
  var TEXTO_C = {
    1: 'C1 · salinidad baja: sirve para la mayoría de los cultivos y suelos; poca probabilidad de salinizar.',
    2: 'C2 · salinidad media: sirve si hay un lavado moderado; cultivos de tolerancia moderada sin prácticas especiales.',
    3: 'C3 · salinidad alta: no en suelos de drenaje restringido; aun con buen drenaje hace falta manejo especial y cultivos de buena tolerancia.',
    4: 'C4 · salinidad muy alta: no apta en condiciones normales; solo con suelos permeables, drenaje adecuado, lavado abundante y cultivos muy tolerantes.'
  };
  var TEXTO_S = {
    1: 'S1 · sodio bajo: sirve en casi todos los suelos con poco peligro de acumular sodio intercambiable.',
    2: 'S2 · sodio medio: peligro apreciable en suelos de textura fina con alta CIC, sobre todo con poco lavado, salvo que haya yeso en el suelo; sirve en suelos gruesos u orgánicos de buena permeabilidad.',
    3: 'S3 · sodio alto: puede acumular sodio dañino en la mayoría de los suelos; exige manejo especial (buen drenaje, lavado alto, materia orgánica) y enmiendas.',
    4: 'S4 · sodio muy alto: en general no apta para riego, salvo con salinidad baja o media donde el calcio del suelo o el yeso lo hagan viable.'
  };
  function svgDiagrama(ce, ras) {
    var W = 560, H = 360, x0 = 58, x1 = W - 18, y0 = 16, y1 = H - 46, cMin = 100, cMax = 5000, sMax = 32;
    var X = function (c) { return x0 + (log10(c) - 2) / (log10(cMax) - 2) * (x1 - x0); };
    var Y = function (s) { return y1 - Math.max(0, Math.min(sMax, s)) / sMax * (y1 - y0); };
    var linea = function (f) { var pts = []; for (var c = 100; c <= 5000; c *= 1.12) pts.push(X(c).toFixed(1) + ',' + Y(f(c)).toFixed(1)); pts.push(X(5000).toFixed(1) + ',' + Y(f(5000)).toFixed(1)); return pts.join(' '); };
    var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:560px;height:auto;font-family:system-ui,sans-serif;" role="img" aria-label="Diagrama de clasificación del agua de riego">';
    h += '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="' + (y1 - y0) + '" fill="#FAFBFB" stroke="#C9CED3"/>';
    [250, 750, 2250].forEach(function (c) { h += '<line x1="' + X(c) + '" y1="' + y0 + '" x2="' + X(c) + '" y2="' + y1 + '" stroke="#8C9196" stroke-width="1"/>'; });
    [function (c) { return 18.87 - 4.44 * log10(c); }, function (c) { return 31.31 - 6.66 * log10(c); }, function (c) { return 43.75 - 8.87 * log10(c); }].forEach(function (f) { h += '<polyline points="' + linea(f) + '" fill="none" stroke="#8C9196" stroke-width="1"/>'; });
    [0, 4, 8, 12, 16, 20, 24, 28, 32].forEach(function (s) { h += '<text x="' + (x0 - 6) + '" y="' + (Y(s) + 4) + '" font-size="10" text-anchor="end" fill="#5B6167">' + s + '</text>'; });
    [100, 250, 750, 2250, 5000].forEach(function (c) { h += '<text x="' + X(c) + '" y="' + (y1 + 14) + '" font-size="10" text-anchor="middle" fill="#5B6167">' + c + '</text>'; });
    var cx = { 1: X(160), 2: X(430), 3: X(1300), 4: X(3400) };
    var sy = function (c, s) { var cc = { 1: 160, 2: 430, 3: 1300, 4: 3400 }[c], l = limitesS(cc), bajo = { 1: 0, 2: l.s12, 3: l.s23, 4: l.s34 }[s], alto = { 1: l.s12, 2: l.s23, 3: l.s34, 4: sMax }[s]; return Y((bajo + Math.min(alto, sMax)) / 2) + 4; };
    for (var c = 1; c <= 4; c++) for (var s = 1; s <= 4; s++) h += '<text x="' + cx[c] + '" y="' + sy(c, s) + '" font-size="10" text-anchor="middle" fill="#9AA0A6">C' + c + '-S' + s + '</text>';
    h += '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="#2E3236">Conductividad eléctrica (µS/cm a 25 °C) · peligro de salinidad</text>';
    h += '<text x="14" y="' + ((y0 + y1) / 2) + '" font-size="11" text-anchor="middle" fill="#2E3236" transform="rotate(-90 14 ' + ((y0 + y1) / 2) + ')">RAS · peligro de sodio</text>';
    if (ce != null && ras != null) {
      var px = X(Math.max(cMin, Math.min(cMax, ce))), py = Y(ras), fuera = ras > sMax || ce > cMax || ce < cMin;
      h += '<circle cx="' + px + '" cy="' + py + '" r="7" fill="#C0392B" stroke="#fff" stroke-width="2"/>';
      var derecha = px > (x0 + x1) / 2, ty = py < y0 + 24 ? py + 20 : py - 12;
      h += '<text x="' + (px + (derecha ? -12 : 12)) + '" y="' + ty + '" font-size="11.5" font-weight="700" text-anchor="' + (derecha ? 'end' : 'start') + '" fill="#2E3236" stroke="#FAFBFB" stroke-width="3" paint-order="stroke">Esta agua: CE ' + fmt(ce, 0) + ' · RAS ' + fmt(ras, 1) + (fuera ? ' (fuera de escala)' : '') + '</text>';
    }
    return h + '</svg>';
  }

  /* ---------- tolerancia de cultivos (FAO 29 Tabla 4) [1] ---------- */
  // [ECe 100 %, 90 %, 75 %, 50 %], [ECw 100 %, 90 %, 75 %, 50 %] en dS/m
  var CULTIVOS = {
    soja:     { n: 'Soja',        ece: [5.0, 5.5, 6.3, 7.5], ecw: [3.3, 3.7, 4.2, 5.0] },
    maiz:     { n: 'Maíz',        ece: [1.7, 2.5, 3.8, 5.9], ecw: [1.1, 1.7, 2.5, 3.9] },
    trigo:    { n: 'Trigo',       ece: [6.0, 7.4, 9.5, 13],  ecw: [4.0, 4.9, 6.3, 8.7] },
    sorgo:    { n: 'Sorgo',       ece: [6.8, 7.4, 8.4, 9.9], ecw: [4.5, 5.0, 5.6, 6.7] },
    algodon:  { n: 'Algodón',     ece: [7.7, 9.6, 13, 17],   ecw: [5.1, 6.4, 8.4, 12] },
    arroz:    { n: 'Arroz',       ece: [3.0, 3.8, 5.1, 7.2], ecw: [2.0, 2.6, 3.4, 4.8] },
    cana:     { n: 'Caña de azúcar', ece: [1.7, 3.4, 5.9, 10], ecw: [1.1, 2.3, 4.0, 6.8] },
    alfalfa:  { n: 'Alfalfa',     ece: [2.0, 3.4, 5.4, 8.8], ecw: [1.3, 2.2, 3.6, 5.9] },
    bermuda:  { n: 'Pasto bermuda', ece: [6.9, 8.5, 11, 15], ecw: [4.6, 5.6, 7.2, 9.8] },
    cebada:   { n: 'Cebada',      ece: [8.0, 10, 13, 18],    ecw: [5.3, 6.7, 8.7, 12] },
    poroto:   { n: 'Poroto',      ece: [1.0, 1.5, 2.3, 3.6], ecw: [0.7, 1.0, 1.5, 2.4] },
    papa:     { n: 'Papa',        ece: [1.7, 2.5, 3.8, 5.9], ecw: [1.1, 1.7, 2.5, 3.9] },
    tomate:   { n: 'Tomate',      ece: [2.5, 3.5, 5.0, 7.6], ecw: [1.7, 2.3, 3.4, 5.0] },
    naranja:  { n: 'Naranja',     ece: [1.7, 2.3, 3.3, 4.8], ecw: [1.1, 1.6, 2.2, 3.2] }
  };
  function claveCultivo(c) {
    var n = norm(c);
    if (/^so[jy]a/.test(n)) return 'soja'; if (/^maiz/.test(n)) return 'maiz'; if (/^trigo/.test(n)) return 'trigo'; if (/^sorgo/.test(n)) return 'sorgo';
    if (/^algodon/.test(n)) return 'algodon'; if (/^arroz/.test(n)) return 'arroz'; if (/cana/.test(n)) return 'cana'; if (/^alfalfa/.test(n)) return 'alfalfa';
    if (/bermuda|tifton|cynodon/.test(n)) return 'bermuda'; if (/^cebada/.test(n)) return 'cebada'; if (/^poroto|^frijol|^feijao/.test(n)) return 'poroto';
    if (/^papa/.test(n)) return 'papa'; if (/^tomate/.test(n)) return 'tomate'; if (/naranj|citric/.test(n)) return 'naranja';
    return null;
  }
  function evaluarCultivo(clave, ecw) {
    var cu = CULTIVOS[clave]; if (!cu || ecw == null) return null;
    var w = cu.ecw, pot = ecw <= w[0] ? '100 %' : (ecw <= w[1] ? '90–100 %' : (ecw <= w[2] ? '75–90 %' : (ecw <= w[3] ? '50–75 %' : 'menos de 50 %')));
    var estado = ecw <= w[0] ? 'ok' : (ecw <= w[3] ? 'cuidado' : 'grave');
    var den = 5 * cu.ece[0] - ecw, lr = den > 0 ? ecw / den : null;   // [1] ec. 9
    return { clave: clave, n: cu.n, umbralEcw: w[0], umbralEce: cu.ece[0], potencial: pot, estado: estado, lr: lr };
  }

  /* ---------- interpretación ---------- */
  var SEM = { ok: { c: '#178029', t: 'sin problema' }, cuidado: { c: '#B8731A', t: 'con cuidados' }, grave: { c: '#C0392B', t: 'grave' }, sin: { c: '#8C9196', t: 'sin dato' } };
  function infiltracion(ras, ecw) {   // [1] Tabla 1
    if (ras == null || ecw == null) return null;
    if (ras >= 40) return { estado: 'grave', texto: 'RAS de ' + fmt(ras, 1) + ' (más de 40, por encima de la tabla FAO): el sodio va a sellar el suelo y el agua no va a infiltrar.' };
    var filas = [[3, 0.7, 0.2], [6, 1.2, 0.3], [12, 1.9, 0.5], [20, 2.9, 1.3], [40, 5.0, 2.9]], f = filas.find(function (x) { return ras < x[0]; });
    var rango = { 3: '0–3', 6: '3–6', 12: '6–12', 20: '12–20', 40: '20–40' }[f[0]];
    if (ecw > f[1]) return { estado: 'ok', texto: 'Con RAS ' + rango + ' y CE de ' + fmt(ecw, 2) + ' dS/m no hay problema de infiltración (FAO: sin restricción si CE > ' + fmt(f[1], 1) + ').' };
    if (ecw >= f[2]) return { estado: 'cuidado', texto: 'Con RAS ' + rango + ' y CE de ' + fmt(ecw, 2) + ' dS/m hay riesgo ligero a moderado de que el suelo pierda infiltración (FAO: entre ' + fmt(f[2], 1) + ' y ' + fmt(f[1], 1) + ').' };
    return { estado: 'grave', texto: 'Con RAS ' + rango + ' y CE de solo ' + fmt(ecw, 2) + ' dS/m el sodio va a sellar el suelo: problema severo de infiltración (FAO: severo si CE < ' + fmt(f[2], 1) + ').' };
  }
  function interpretar(a, opciones) {
    opciones = opciones || {};
    var r = calcular(a), aspersion = opciones.aspersion !== false, items = [];
    function it(k, n, valor, unidad, estado, texto, fuente) { items.push({ k: k, n: n, valor: valor, unidad: unidad, estado: estado, texto: texto, fuente: fuente }); }
    // 1. Sales
    if (r.ecw != null) it('sal', 'Sales totales (CE)', r.ce, 'µS/cm', r.ecw < 0.7 ? 'ok' : (r.ecw <= 3 ? 'cuidado' : 'grave'),
      r.ecw < 0.7 ? 'Agua poco salada: sin restricción por salinidad.' : (r.ecw <= 3 ? 'Agua medianamente salada (' + fmt(r.ecw, 2) + ' dS/m): restricción ligera a moderada; hay que lavar y elegir cultivos según su tolerancia.' : 'Agua muy salada (' + fmt(r.ecw, 2) + ' dS/m): restricción severa; solo cultivos tolerantes, con lavado y drenaje.'), '[1]');
    // 2. Sodio y suelo (infiltración: RAS junto con CE)
    var inf = infiltracion(r.ras, r.ecw);
    if (inf) it('inf', 'Sodio para el suelo (RAS con CE)', r.ras, 'RAS', inf.estado, inf.texto, '[1]');
    // 3. Clase USSL
    if (r.clase) it('ussl', 'Clasificación Riverside (USSL)', r.clase.txt, '', r.clase.c === 4 || r.clase.s === 4 ? 'grave' : (r.clase.c === 3 || r.clase.s >= 2 ? 'cuidado' : 'ok'), TEXTO_C[r.clase.c] + ' ' + TEXTO_S[r.clase.s], '[2]');
    // 4. Carbonato de sodio residual
    if (r.csr != null) it('csr', 'Carbonato de sodio residual (CSR)', r.csr, 'meq/L', r.csr < 1.25 ? 'ok' : (r.csr <= 2.5 ? 'cuidado' : 'grave'),
      r.csr < 1.25 ? 'Probablemente segura.' : (r.csr <= 2.5 ? 'Dudosa: el bicarbonato precipita el calcio y deja al sodio más libre.' : 'No apta para riego sin tratamiento: el bicarbonato le saca el calcio al suelo y el sodio queda dominando.'), '[2]');
    // 5. Toxicidad por aspersión (pivot): Na y Cl mojan la hoja
    if (tiene(a, 'na')) it('na', 'Sodio en la hoja' + (aspersion ? ' (aspersión)' : ''), num(a.na), 'meq/L', aspersion ? (num(a.na) > 3 ? 'cuidado' : 'ok') : (r.ras != null && r.ras > 9 ? 'grave' : (r.ras != null && r.ras >= 3 ? 'cuidado' : 'ok')),
      aspersion ? (num(a.na) > 3 ? 'Más de 3 meq/L: con pivot puede quemar hojas en cultivos sensibles (se absorbe por la hoja mojada).' : 'Menos de 3 meq/L: sin riesgo foliar.') : (r.ras > 9 ? 'RAS > 9 en riego por superficie/goteo: toxicidad severa en cultivos sensibles.' : (r.ras >= 3 ? 'RAS 3–9: toxicidad ligera a moderada en cultivos sensibles.' : 'Sin toxicidad por sodio.')), '[1]');
    if (tiene(a, 'cl')) { var cl = num(a.cl); it('cl', 'Cloruros' + (aspersion ? ' (aspersión)' : ''), cl, 'meq/L', aspersion ? (cl > 3 ? 'cuidado' : 'ok') : (cl < 4 ? 'ok' : (cl <= 10 ? 'cuidado' : 'grave')),
      aspersion ? (cl > 3 ? 'Más de 3 meq/L: con pivot puede quemar hojas; regar de noche o con poco viento.' : 'Menos de 3 meq/L: sin riesgo foliar.') : (cl < 4 ? 'Sin problema.' : (cl <= 10 ? 'Ligero a moderado para cultivos sensibles.' : 'Severo: quema raíces y hojas en la mayoría de los cultivos.')), '[1]'); }
    if (r.boro != null) it('b', 'Boro', r.boro, 'mg/L', r.boro < 0.7 ? 'ok' : (r.boro <= 3 ? 'cuidado' : 'grave'),
      r.boro < 0.7 ? 'Sin problema.' : (r.boro <= 3 ? 'Ligero a moderado: los cultivos sensibles al boro pierden rinde.' : 'Severo: tóxico para la mayoría de los cultivos.'), '[1]');
    if (tiene(a, 'hco3') && aspersion) { var hc = num(a.hco3); it('hco3', 'Bicarbonato (aspersión)', hc, 'meq/L', hc < 1.5 ? 'ok' : (hc <= 8.5 ? 'cuidado' : 'grave'),
      hc < 1.5 ? 'Sin problema.' : (hc <= 8.5 ? 'Ligero a moderado: deja manchas blancas en hojas y frutos al secarse.' : 'Severo: depósitos blancos importantes en hojas y frutos.'), '[1]'); }
    if (r.ph != null) it('ph', 'pH', r.ph, '', r.ph >= 6.5 && r.ph <= 8.4 ? 'ok' : 'cuidado', r.ph >= 6.5 && r.ph <= 8.4 ? 'Dentro del rango normal (6,5–8,4).' : 'Fuera del rango normal (6,5–8,4): suele indicar un problema de calidad (sodio, bicarbonato o contaminación); revisar.', '[1]');
    if (r.no3n != null && r.no3n >= 5) it('n', 'Nitrógeno nítrico (N-NO₃)', r.no3n, 'mg/L', r.no3n <= 30 ? 'cuidado' : 'grave', 'El agua aporta nitrógeno (' + fmt(r.no3n, 1) + ' mg/L = ' + fmt(r.no3n, 1) + ' kg de N por ha cada 100 mm): descontarlo de la fertilización; en exceso atrasa la madurez.', '[1]');
    // cultivos
    var claves = (opciones.cultivos || ['Soja', 'Maíz']).map(claveCultivo).filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
    var cultivos = claves.map(function (k) { return evaluarCultivo(k, r.ecw); }).filter(Boolean);
    // controles del propio análisis
    var control = [];
    if (r.balance != null && Math.abs(r.balance) > 10) control.push('El análisis no cuadra: los cationes (' + fmt(r.cationes, 2) + ' meq/L) y los aniones (' + fmt(r.aniones, 2) + ' meq/L) difieren ' + fmt(Math.abs(r.balance), 0) + ' % (deberían ser casi iguales). Pedir al laboratorio que lo revise antes de decidir.');
    else if (r.balance != null && Math.abs(r.balance) > 5) control.push('Diferencia moderada entre cationes y aniones (' + fmt(Math.abs(r.balance), 0) + ' %): aceptable, pero conviene confirmarlo.');
    if (r.cationesPorCE != null && r.cationes > 0 && Math.abs(r.cationes - r.cationesPorCE) / r.cationesPorCE > 0.3) control.push('La CE (' + fmt(r.ce, 0) + ' µS/cm) indica unos ' + fmt(r.cationesPorCE, 1) + ' meq/L de cationes, pero el análisis suma ' + fmt(r.cationes, 1) + ' meq/L [2, p. 79]: una de las dos mediciones puede estar mal.');
    // veredicto
    var graves = items.filter(function (x) { return x.estado === 'grave'; }), cuidados = items.filter(function (x) { return x.estado === 'cuidado'; });
    cultivos.forEach(function (c) { if (c.estado === 'grave') graves.push({ n: c.n + ': rinde < 50 % con esta agua' }); else if (c.estado === 'cuidado') cuidados.push({ n: c.n + ': pierde rinde (' + c.potencial + ')' }); });
    var veredicto = graves.length ? { k: 'grave', titulo: 'No regar sin resolver antes', detalle: 'Problemas graves: ' + graves.map(function (x) { return x.n; }).join(', ') + '.' }
      : (cuidados.length ? { k: 'cuidado', titulo: 'Se puede regar con cuidados', detalle: 'Cuidar: ' + cuidados.map(function (x) { return x.n; }).join(', ') + '.' }
        : { k: 'ok', titulo: 'Se puede regar normal', detalle: 'Sin restricciones según FAO 29 y el diagrama de Riverside.' });
    if (!items.length) veredicto = { k: 'sin', titulo: 'Faltan datos', detalle: 'Cargá al menos la CE, el sodio, el calcio y el magnesio.' };
    return { r: r, items: items, cultivos: cultivos, control: control, veredicto: veredicto, aspersion: aspersion, recomendaciones: recomendaciones(r, items, cultivos, opciones) };
  }
  function recomendaciones(r, items, cultivos, opciones) {
    var out = [], est = {}; items.forEach(function (i) { est[i.k] = i.estado; });
    var s = r.clase ? r.clase.s : null, c = r.clase ? r.clase.c : null;
    if (est.inf === 'grave' || est.inf === 'cuidado' || s >= 3 || (s === 2 && opciones.sueloFino)) {
      var alAgua = r.clase && ((c === 1 && s >= 3) || (c === 2 && s === 4));
      out.push({ t: 'Sodio: calcio al suelo o al agua', d: (alAgua ? 'En aguas ' + r.clase.txt + ' el sodio se corrige agregando yeso al agua de riego' : 'Aplicar yeso al suelo en forma periódica') + ' [2, p. 81]. La dosis se calcula con el sodio intercambiable (PSI) y la CIC del suelo: pedir PSI al laboratorio. Mantener cobertura y materia orgánica, que protegen la estructura.' });
    }
    if (est.csr === 'grave' || est.csr === 'cuidado') out.push({ t: 'Bicarbonato: acidificar o yeso', d: 'Con CSR de ' + fmt(r.csr, 2) + ' meq/L el bicarbonato precipita el calcio del suelo y el sodio queda dominando [2, p. 81]. Se corrige inyectando ácido en el cabezal (bajar el pH del agua a 6,0–6,5 neutraliza el bicarbonato) o con yeso.' });
    var lr = cultivos.filter(function (x) { return x.lr != null; });
    if (est.sal === 'cuidado' || est.sal === 'grave' || cultivos.some(function (x) { return x.estado !== 'ok'; })) out.push({ t: 'Sales: agua extra para lavar', d: 'Aplicar por encima de la demanda del cultivo: ' + lr.map(function (x) { return x.n.toLowerCase() + ' ' + fmt(x.lr * 100, 1) + ' %'; }).join(', ') + ' (fracción de lavado FAO 29 ec. 9) [1]. El suelo tiene que drenar: verificar que no haya capa impermeable ni napa alta.' });
    if (c >= 3) out.push({ t: 'Drenaje y cultivos tolerantes', d: 'Con agua ' + (c === 4 ? 'C4' : 'C3') + ' solo en suelos con buen drenaje y con cultivos de buena tolerancia a sales [2, p. 80–81]; medir la CE del suelo (CEe) antes y después de cada campaña.' });
    if (est.na === 'cuidado' || est.cl === 'cuidado' || est.hco3 === 'cuidado' || est.hco3 === 'grave') out.push({ t: 'Pivot: no mojar hojas en horas de calor', d: 'El sodio, el cloruro y el bicarbonato dañan o manchan la hoja mojada [1]. Regar de noche o con poco viento, evitar paradas largas del pivot y preferir emisores bajos (LEPA o mangueras de arrastre) que mojan menos el follaje.' });
    if (est.b === 'cuidado' || est.b === 'grave') out.push({ t: 'Boro: elegir cultivos tolerantes', d: 'Con ' + fmt(r.boro, 2) + ' mg/L de boro los cultivos sensibles pierden rinde [1]; el boro no se lava tan fácil como otras sales.' });
    if (r.lsi != null && r.lsi > 0.3) out.push({ t: 'Incrustaciones en el equipo', d: 'Índice de Langelier de ' + fmt(r.lsi, 2) + ': el agua tiende a formar costras de carbonato de calcio en caños, aspersores y goteros [5]. Se controla acidificando el agua.' });
    out.push({ t: 'Completar con el suelo', d: 'El agua es la mitad de la decisión: pedir al laboratorio la CE del extracto de saturación (CEe) y el porcentaje de sodio intercambiable (PSI) del suelo antes de instalar el riego, y repetirlos cada año.' });
    return out;
  }

  /* ---------- HTML de la lectura ---------- */
  function tarjeta(a, opciones) {
    var L = interpretar(a, opciones), r = L.r, sem = SEM[L.veredicto.k] || SEM.sin;
    var h = '<div style="border:1px solid #E1E4E7;border-left:5px solid ' + sem.c + ';border-radius:10px;padding:12px 16px;background:#fff;margin-bottom:12px;">' +
      '<div style="font-size:18px;font-weight:800;color:' + sem.c + ';">' + esc(L.veredicto.titulo) + '</div><div style="font-size:13px;color:#41464B;margin-top:4px;">' + esc(L.veredicto.detalle) + '</div>' +
      '<div class="muted" style="font-size:11.5px;margin-top:6px;">' + (L.aspersion ? 'Evaluado para pivot / aspersión (el agua moja la hoja).' : 'Evaluado para riego que no moja la hoja (goteo o superficie).') + '</div></div>';
    if (L.control.length) h += '<div class="note warn" style="margin-bottom:12px;">' + L.control.map(esc).join('<br>') + '</div>';
    // 1) lo que se mide: a todo el ancho
    h += '<div class="tablescroll"><table class="tbl"><thead><tr><th>Lo que se mide</th><th class="r">Valor</th><th></th><th>Qué significa</th></tr></thead><tbody>' + L.items.map(function (i) {
      var s = SEM[i.estado] || SEM.sin, val = typeof i.valor === 'number' ? fmt(i.valor, i.k === 'sal' ? 0 : (i.k === 'b' || i.k === 'csr' ? 2 : 1)) + (i.unidad ? ' <span class="sub">' + esc(i.unidad) + '</span>' : '') : esc(i.valor);
      return '<tr><td><b>' + esc(i.n) + '</b></td><td class="r" style="white-space:nowrap;">' + val + '</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + s.c + ';" title="' + s.t + '"></span></td><td style="font-size:12.5px;white-space:normal;min-width:260px;">' + esc(i.texto) + ' <span class="muted">' + i.fuente + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
    // 2) diagrama y cultivos, lado a lado (en celular, uno abajo del otro)
    h += '<div style="display:grid;grid-template-columns:minmax(0,520px) minmax(0,1fr);gap:18px;align-items:start;margin-top:14px;" class="ca-grid">';
    h += '<div><div style="font-weight:700;font-size:13px;margin-bottom:4px;">Diagrama de clasificación (Riverside) · ' + (r.clase ? esc(r.clase.txt) : 'sin datos') + '</div>' + svgDiagrama(r.ce, r.ras) + '<div class="muted" style="font-size:11px;">USDA Handbook 60, Figura 25 [2]</div></div>';
    h += '<div>';
    if (L.cultivos.length) h += '<div style="font-weight:700;font-size:13px;margin-bottom:4px;">Cultivos con esta agua</div><div class="tablescroll"><table class="tbl"><thead><tr><th>Cultivo</th><th class="r">Aguanta sin perder</th><th class="r">Rinde</th><th class="r">Lavado</th></tr></thead><tbody>' + L.cultivos.map(function (c) {
      var s = SEM[c.estado]; return '<tr><td><b>' + esc(c.n) + '</b></td><td class="r">' + fmt(c.umbralEcw, 1) + ' dS/m<div class="sub">agua · suelo ' + fmt(c.umbralEce, 1) + '</div></td><td class="r" style="color:' + s.c + ';font-weight:700;">' + esc(c.potencial) + '</td><td class="r">' + (c.lr != null ? fmt(c.lr * 100, 1) + ' %' : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="muted" style="font-size:11px;margin-top:4px;">FAO 29, Tabla 4 y ecuación 9 [1]. Agua extra = % sobre la lámina que pide el cultivo, para llevar las sales debajo de las raíces.</div>';
    h += '</div></div>';
    if (L.recomendaciones.length) h += '<h3 style="font-size:14px;margin:14px 0 6px;">Qué hacer</h3><ol style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.55;">' + L.recomendaciones.map(function (x) { return '<li><b>' + esc(x.t) + ':</b> ' + esc(x.d) + '</li>'; }).join('') + '</ol>';
    // índices de la planilla
    var fila = function (n, val, u, ref) { return '<tr><td>' + n + '</td><td class="r">' + val + (u ? ' <span class="sub">' + u + '</span>' : '') + '</td><td style="font-size:12px;">' + ref + '</td></tr>'; };
    h += '<h3 style="font-size:14px;margin:14px 0 6px;">Índices de salinidad (hoja Analisis_Agua)</h3><div class="tablescroll"><table class="tbl"><thead><tr><th>Índice</th><th class="r">Valor</th><th>Referencia</th></tr></thead><tbody>' +
      fila('RAS (relación de adsorción de sodio)', fmt(r.ras, 2), '', 'Na / √((Ca+Mg)/2)') +
      fila('Salinidad efectiva (SE)', fmt(r.se, 2), 'meq/L', (r.se != null ? (r.se < 3 ? 'buena' : 'condicionada') + ' · ' : '') + esc(r.seCaso || '') + ' [3]') +
      fila('Salinidad potencial (SP)', fmt(r.sp, 2), 'meq/L', (r.sp != null ? (r.sp < 3 ? 'buena' : 'condicionada') + ' · ' : '') + 'Cl + ½ SO₄ [3]') +
      fila('Porcentaje de sodio posible (PSP)', fmt(r.psp, 1), '%', (r.psp != null ? (r.psp < 50 ? 'buena' : 'condicionada') + ' · ' : '') + 'Na / SE × 100 [3]') +
      fila('Carbonato de sodio residual (CSR)', fmt(r.csr, 2), 'meq/L', '< 1,25 seguro · 1,25–2,5 dudoso · > 2,5 no apto [2]') +
      fila('Índice de Scott (K)', fmt(r.scott, 1), '', (r.scott != null ? (r.scott > 18 ? 'buena' : (r.scott >= 6 ? 'tolerable' : 'mediocre a mala')) + ' · ' : '') + esc(r.scottCaso || '') + ', en mg/L [4]') +
      fila('Índice de saturación de Langelier', fmt(r.lsi, 2), '', r.lsi != null ? (r.lsi > 0 ? 'tiende a incrustar carbonato de calcio' : 'tiende a disolver (corrosiva)') + ' · pHs ' + fmt(r.phs, 2) + ' a ' + fmt(r.temperatura, 0) + ' °C [5]' : 'faltan pH, calcio o alcalinidad') +
      fila('Sólidos disueltos (TDS)', fmt(r.tds, 0), 'mg/L', 'CE × 0,64 [1]' + (r.tdsMedido != null ? ' · medido ' + fmt(r.tdsMedido, 0) + ' mg/L' : '')) +
      fila('Suma de cationes / aniones', fmt(r.cationes, 2) + ' / ' + fmt(r.aniones, 2), 'meq/L', r.balance != null ? 'diferencia ' + fmt(Math.abs(r.balance), 1) + ' % (hasta 5 % es normal)' : '') +
      '</tbody></table></div>';
    h += '<div class="tablescroll" style="margin-top:10px;"><table class="tbl"><thead><tr><th>Ion</th><th class="r">meq/L</th><th class="r">mg/L</th></tr></thead><tbody>' + IONES.filter(function (x) { return tiene(a, x.k); }).map(function (x) { return '<tr><td>' + x.n + '</td><td class="r">' + fmt(num(a[x.k]), 2) + '</td><td class="r">' + (x.eq ? fmt(num(a[x.k]) * x.eq, 1) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    h += '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5;">[1] FAO Riego y Drenaje 29 (Ayers &amp; Westcot 1985): Tabla 1, sección 2.4.2 ec. 9, Tabla 4. [2] USDA Agriculture Handbook 60 (Richards 1954), p. 79–81 y Figura 25. [3] Doneen (1959, 1961); Palacios y Aceves (1970); Valle (1992). [4] Índice de Scott en mg/L. [5] Langelier, fórmula de Carrier (1965).</div>';
    return h;
  }

  /* ---------- datos ---------- */
  function lista() { var c = B() && B().campoActual(); return c ? B().leer('analisis_agua').filter(function (a) { return String(a.campoId) === String(c.id); }).sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); }) : []; }
  function guardarItem(item) { var todos = B().leer('analisis_agua').filter(function (a) { return String(a.id) !== String(item.id); }); todos.push(item); B().guardar('analisis_agua', todos); }
  function borrarItem(id) { B().guardar('analisis_agua', B().leer('analisis_agua').filter(function (a) { return String(a.id) !== String(id); })); }
  function lotesDelCampo() { var c = B().campoActual(); return c ? B().leer('equipos').filter(function (e) { return String(e.campoId) === String(c.id); }) : []; }
  function cultivosDelCampo() {
    var c = B().campoActual(), set = {};
    if (c) { var eqs = lotesDelCampo().map(function (e) { return String(e.id); }); B().leer('campanas').filter(function (x) { return eqs.indexOf(String(x.equipoId)) >= 0 || String(x.campoId) === String(c.id); }).forEach(function (x) { (x.cultivos || []).forEach(function (cu) { if (cu && cu.cultivo) set[cu.cultivo] = 1; }); }); }
    var l = Object.keys(set); if (!l.length) l = ['Soja', 'Maíz']; return l;
  }
  function esAspersion(item) {
    var eqs = lotesDelCampo(), e = item && item.equipoId ? eqs.find(function (x) { return String(x.id) === String(item.equipoId); }) : null;
    var tipos = (e ? [e] : eqs).map(function (x) { return x.tipo; });
    if (!tipos.length) return true;   // sin equipos cargados: se evalúa para pivot (lo más exigente para la hoja)
    return tipos.some(function (t) { return /pivote|aspersion|canon/.test(t || ''); });
  }
  function sueloFino() {   // textura fina: el S2 ya pesa
    var c = B().campoActual(); if (!c) return false;
    if (/arcill/.test(c.tipoSuelo || '')) return true;
    var an = B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(c.id) && num(a.arcilla) != null; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).pop();
    return an ? num(an.arcilla) >= 35 : false;
  }
  function opcionesDe(item) { return { aspersion: esAspersion(item), cultivos: cultivosDelCampo(), sueloFino: sueloFino() }; }

  /* ---------- formulario ---------- */
  var CAMPOS_IONES = ['na', 'k', 'ca', 'mg', 'nh4', 'cl', 'so4', 'co3', 'hco3', 'no3', 'po4'];
  function abrirForm() { $('formAgua').classList.add('visible'); llenarLotes(); }
  function cerrarForm() {
    $('formAgua').classList.remove('visible'); editandoId = null; muestrasIA = null;
    ['aFecha', 'aFuenteNombre', 'aLab', 'aInforme', 'aPh', 'aCe', 'aBoro', 'aTds', 'aTemp', 'aObs', 'aArchivo'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    CAMPOS_IONES.forEach(function (k) { $('aIon_' + k).value = ''; });
    $('aFuente').value = 'Pozo'; $('aUnidad').value = 'meq'; $('aArchivoActual').textContent = ''; $('muestrasAguaIA').innerHTML = '';
    $('tituloFormAgua').textContent = 'Nuevo análisis de agua';
  }
  function llenarLotes() { var s = $('aEquipo'), v0 = s.value; s.innerHTML = '<option value="">Toda la estancia</option>' + lotesDelCampo().map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join(''); s.value = v0; }
  function volcar(a) {
    if (a.fecha) $('aFecha').value = String(a.fecha).slice(0, 10);
    if (a.fuente) { var f = $('aFuente'); if (![].some.call(f.options, function (o) { return o.value === a.fuente; })) f.insertAdjacentHTML('beforeend', '<option>' + esc(a.fuente) + '</option>'); f.value = a.fuente; }
    if (a.fuenteNombre != null) $('aFuenteNombre').value = a.fuenteNombre || '';
    if (a.laboratorio != null) $('aLab').value = a.laboratorio || '';
    if (a.informe != null) $('aInforme').value = a.informe || '';
    $('aUnidad').value = 'meq';
    CAMPOS_IONES.forEach(function (k) { var x = num(a[k]); $('aIon_' + k).value = x == null ? '' : x; });
    [['ph', 'aPh'], ['ce', 'aCe'], ['boro', 'aBoro'], ['tds', 'aTds'], ['temperatura', 'aTemp']].forEach(function (p) { var x = num(a[p[0]]); $(p[1]).value = x == null ? '' : x; });
    if (a.observaciones) $('aObs').value = a.observaciones;
  }
  function leerForm() {
    var enMg = $('aUnidad').value === 'mg', item = { fecha: $('aFecha').value || null, equipoId: $('aEquipo').value || null, fuente: $('aFuente').value, fuenteNombre: $('aFuenteNombre').value.trim(), laboratorio: $('aLab').value.trim(), informe: $('aInforme').value.trim(), observaciones: $('aObs').value.trim() };
    CAMPOS_IONES.forEach(function (k) { var x = num($('aIon_' + k).value), ion = IONES.find(function (i) { return i.k === k; }); item[k] = x == null ? null : (enMg && ion.eq ? Math.round(x / ion.eq * 10000) / 10000 : x); });
    item.ph = num($('aPh').value); item.ce = num($('aCe').value); item.boro = num($('aBoro').value); item.tds = num($('aTds').value); item.temperatura = num($('aTemp').value);
    return item;
  }
  function limpiarNombre(n) { return String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80); }
  function archivoABase64(archivo) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(archivo); }); }
  function comprimirImagen(archivo, maxLado, calidad) {
    return new Promise(function (res, rej) { var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () { var e = Math.min(1, maxLado / Math.max(img.width, img.height)); var cv = document.createElement('canvas'); cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', calidad).split(',')[1]); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('imagen')); }; img.src = url; });
  }
  function guardar() {
    var c = B().campoActual(); if (!c) return;
    var item = leerForm();
    if (!item.fecha) { B().toast('Falta la fecha del análisis', true); return; }
    if (item.ce == null && item.na == null) { B().toast('Cargá al menos la CE y el sodio', true); return; }
    var previo = editandoId ? B().leer('analisis_agua').find(function (a) { return String(a.id) === String(editandoId); }) : null;
    Object.assign(item, { id: previo ? previo.id : Date.now(), campoId: c.id, fechaCreacion: previo ? previo.fechaCreacion : new Date().toISOString(), archivoRuta: previo ? previo.archivoRuta : null, archivoNombre: previo ? previo.archivoNombre : null });
    var archivo = $('aArchivo').files && $('aArchivo').files[0];
    var pre = archivo && window.safiaSupabase ? window.safiaSupabase.storage.from('safia').upload('campo_' + c.id + '/agua/' + Date.now() + '_' + limpiarNombre(archivo.name), archivo, { upsert: false }).then(function (r) { if (r.error) throw r.error; item.archivoRuta = r.data && r.data.path ? r.data.path : null; item.archivoNombre = archivo.name; }).catch(function (e) { console.error(e); B().toast('El archivo no se pudo subir; el análisis se guarda igual', true); }) : Promise.resolve();
    pre.then(function () { guardarItem(item); B().toast('Análisis de agua guardado'); cerrarForm(); pintar(item.id); });
  }
  function leerConIA() {
    var archivo = $('aArchivo').files && $('aArchivo').files[0], hint = $('leerAguaHint'), boton = $('btnLeerAguaIA');
    if (!archivo) { B().toast('Primero elegí la foto o el PDF del laboratorio', true); return; }
    if (!window.safiaSupabase) { B().toast('Sin conexión a internet', true); return; }
    var esPdf = /pdf$/i.test(archivo.type) || /\.pdf$/i.test(archivo.name);
    boton.disabled = true; boton.textContent = 'Leyendo…'; hint.textContent = 'Leyendo el análisis de agua con IA, esto tarda unos segundos…';
    (esPdf ? archivoABase64(archivo) : comprimirImagen(archivo, 2000, 0.85)).then(function (b64) {
      return window.safiaSupabase.functions.invoke('safia-leer-analisis', { body: { mime: esPdf ? 'application/pdf' : 'image/jpeg', data_base64: b64, tipo: 'agua' } });
    }).then(function (r) {
      if (r.error) throw r.error;
      var muestras = ((r.data && r.data.muestras) || []).map(desdeIA);
      if (!muestras.length) throw new Error('La IA no encontró valores de análisis de agua en el archivo');
      muestrasIA = muestras; volcar(muestras[0]); mostrarMuestras(muestras);
      hint.textContent = muestras.length > 1 ? 'El informe tiene ' + muestras.length + ' muestras: elegí cuál revisar y guardá una por una.' : 'Valores cargados por IA (en meq/L). Revisalos y corregí si hace falta antes de guardar.';
      B().toast('Análisis de agua leído: revisá los valores');
    }).catch(function (e) {
      console.error(e);
      var explicar = function (msg) { hint.textContent = 'No se pudo leer automáticamente' + (msg ? ': ' + msg : '') + '. Cargá los valores a mano (el archivo igual se guarda).'; B().toast('No se pudo leer con IA' + (msg ? ': ' + msg : ''), true); };
      if (e && e.context && typeof e.context.json === 'function') e.context.json().then(function (j) { explicar((j && (j.error + (j.detalle ? ' · ' + j.detalle : ''))) || e.message); }).catch(function () { explicar(e.message); });
      else explicar((e && e.message) || '');
    }).finally(function () { boton.disabled = false; boton.textContent = 'Leer análisis de agua con IA y completar solo'; });
  }
  function desdeIA(m) {
    return { fecha: m.fecha || null, fuente: m.fuente || null, fuenteNombre: m.muestra || '', laboratorio: m.laboratorio || '', informe: m.informe || '',
      na: num(m.sodio), k: num(m.potasio), ca: num(m.calcio), mg: num(m.magnesio), nh4: num(m.amonio), cl: num(m.cloruros), so4: num(m.sulfatos), co3: num(m.carbonatos), hco3: num(m.bicarbonatos), no3: num(m.nitratos), po4: num(m.fosfatos),
      ph: num(m.ph), ce: num(m.ce), boro: num(m.boro), tds: num(m.tds), temperatura: num(m.temperatura), observaciones: m.observaciones || '' };
  }
  function mostrarMuestras(muestras) {
    var cont = $('muestrasAguaIA'); if (!cont) return;
    if (muestras.length < 2) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<span class="muted" style="font-size:12px;align-self:center;">Muestras del informe:</span>' + muestras.map(function (m, i) { var et = [m.fuenteNombre, m.fecha].filter(Boolean).join(' · ') || ('Muestra ' + (i + 1)); return '<button type="button" class="btn mini" data-i="' + i + '">' + esc(et) + '</button>'; }).join('');
    cont.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { volcar(muestras[+b.dataset.i]); B().toast('Cargada: ' + b.textContent); }); });
  }
  function editar(id) {
    var a = B().leer('analisis_agua').find(function (x) { return String(x.id) === String(id); }); if (!a) return;
    cerrarForm(); abrirForm(); editandoId = a.id;
    $('tituloFormAgua').textContent = 'Editar análisis de agua del ' + fmtF(a.fecha);
    $('aEquipo').value = a.equipoId ? String(a.equipoId) : '';
    volcar(a);
    $('aArchivoActual').textContent = a.archivoNombre ? 'Actual: ' + a.archivoNombre + ' (subí otro para reemplazar)' : '';
    $('formAgua').scrollIntoView({ behavior: 'smooth' });
  }
  function verPdf(id) {
    var a = B().leer('analisis_agua').find(function (x) { return String(x.id) === String(id); });
    if (!a || !a.archivoRuta || !window.safiaSupabase) return;
    window.safiaSupabase.storage.from('safia').createSignedUrl(a.archivoRuta, 3600).then(function (r) { if (r.data && r.data.signedUrl) window.open(r.data.signedUrl, '_blank'); else B().toast('No se pudo abrir el archivo', true); });
  }
  function nombreFuente(a) { var f = a.fuente || '', n = a.fuenteNombre || ''; return n && norm(n).indexOf(norm(f)) === 0 ? n : [f, n].filter(Boolean).join(' · '); }
  function nombreLote(id) { var e = lotesDelCampo().find(function (x) { return String(x.id) === String(id); }); return e ? e.nombre : 'Toda la estancia'; }
  function pintar(mostrarId) {
    var cont = $('listaAgua'), lect = $('lecturaAgua'), vacio = $('vacioAgua'); if (!cont) return;
    var l = lista();
    if (!l.length) { cont.innerHTML = ''; lect.innerHTML = ''; vacio.style.display = 'block'; return; }
    vacio.style.display = 'none';
    cont.innerHTML = '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Fecha</th><th>Fuente</th><th>Lote</th><th class="r">CE µS/cm</th><th class="r">RAS</th><th class="r">pH</th><th>Clase</th><th>¿Se puede regar?</th><th></th></tr></thead><tbody>' +
      l.slice().reverse().map(function (a) {
        var L = interpretar(a, opcionesDe(a)), s = SEM[L.veredicto.k] || SEM.sin;
        return '<tr data-id="' + esc(a.id) + '"><td>' + fmtF(a.fecha) + '</td><td>' + esc(nombreFuente(a)) + '</td><td>' + esc(nombreLote(a.equipoId)) + '</td><td class="r">' + fmt(num(a.ce), 0) + '</td><td class="r">' + fmt(L.r.ras, 1) + '</td><td class="r">' + fmt(num(a.ph), 1) + '</td><td>' + (L.r.clase ? esc(L.r.clase.txt) : '—') + '</td>' +
          '<td style="color:' + s.c + ';font-weight:700;font-size:12.5px;">' + esc(L.veredicto.titulo) + '</td>' +
          '<td class="r" style="white-space:nowrap;">' + (a.archivoRuta ? '<button type="button" class="btn mini" data-act="pdf">PDF</button> ' : '') + '<button type="button" class="btn mini" data-act="ver">Lectura</button> <button type="button" class="btn mini" data-act="editar">Editar</button> <button type="button" class="btn mini" data-act="borrar" style="color:#B3261E;">Borrar</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    cont.querySelectorAll('button[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('tr').dataset.id;
        if (b.dataset.act === 'editar') editar(id);
        else if (b.dataset.act === 'pdf') verPdf(id);
        else if (b.dataset.act === 'ver') mostrarLectura(id);
        else if (b.dataset.act === 'borrar') { if (b.dataset.confirmado) { borrarItem(id); B().toast('Análisis de agua borrado'); pintar(); } else { b.dataset.confirmado = '1'; b.textContent = '¿Borrar?'; setTimeout(function () { delete b.dataset.confirmado; b.textContent = 'Borrar'; }, 4000); } }
      });
    });
    mostrarLectura(mostrarId && l.some(function (a) { return String(a.id) === String(mostrarId); }) ? mostrarId : l[l.length - 1].id);
  }
  function mostrarLectura(id) {
    var a = B().leer('analisis_agua').find(function (x) { return String(x.id) === String(id); }), lect = $('lecturaAgua'); if (!a || !lect) return;
    lect.innerHTML = '<div class="card" style="margin-top:14px;"><div class="card-h"><h3>Calidad del agua de riego · ' + esc(nombreFuente(a)) + ' · ' + fmtF(a.fecha) + '</h3><span class="muted">' + esc([a.laboratorio, a.informe].filter(Boolean).join(' · ')) + '</span></div>' + tarjeta(a, opcionesDe(a)) + '</div>';
  }
  function activar() {
    if (!B() || !$('panel-calidadAgua')) return;
    if (!iniciado) {
      iniciado = true;
      $('btnNuevoAgua').addEventListener('click', function () { cerrarForm(); abrirForm(); });
      $('btnCancelarAgua').addEventListener('click', cerrarForm);
      $('btnGuardarAgua').addEventListener('click', guardar);
      $('btnLeerAguaIA').addEventListener('click', leerConIA);
    }
    llenarLotes(); pintar();
  }
  function alCambiarCampo() { if (iniciado) { cerrarForm(); if ($('panel-calidadAgua').classList.contains('on')) activar(); } }
  function ultimoDelCampo(campoId) { var l = B() ? B().leer('analisis_agua').filter(function (a) { return String(a.campoId) === String(campoId); }).sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); }) : []; return l.length ? l[l.length - 1] : null; }

  window.SafiaCalidadAgua = { activar: activar, alCambiarCampo: alCambiarCampo, calcular: calcular, interpretar: interpretar, claseUSSL: claseUSSL, svgDiagrama: svgDiagrama, tarjeta: tarjeta, CULTIVOS: CULTIVOS, IONES: IONES, ultimoDelCampo: ultimoDelCampo, lista: lista };
})();
