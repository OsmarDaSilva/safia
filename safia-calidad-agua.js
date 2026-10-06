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

  /* ---------- del informe del laboratorio a las unidades del motor ----------
     Regla fija y a la vista: se carga el número TAL CUAL lo da el laboratorio con
     su unidad, y SAFIA lo pasa a meq/L (iones), µS/cm (CE) y mg/L (boro).
       meq/L = mmolc/L = me/L ........ igual
       mg/L = ppm .................... ÷ peso equivalente del ion (Na 22,99; Ca 20,04; …)
       mmol/L ........................ × cargas del ion (Ca, Mg, SO₄, CO₃: × 2; los demás × 1)
       mg/L como CaCO₃ ............... ÷ 50,04 (alcalinidad, carbonatos, bicarbonatos, dureza)
       mg/L como N (N-NH₄, N-NO₃) .... ÷ 14,01
       mg/L como S (S-SO₄) ........... ÷ 16,03
       CE: dS/m = mS/cm = mmho/cm .... × 1000 → µS/cm;  µmho/cm = µS/cm
       Boro: µg/L = ppb .............. ÷ 1000 → mg/L */
  var UNIDADES = {
    meq: 'meq/L (= mmolc/L)', mg: 'mg/L (= ppm)', mmol: 'mmol/L', caco3: 'mg/L como CaCO₃', n: 'mg/L como N', s: 'mg/L como S',
    uS: 'µS/cm (= µmho/cm)', dS: 'dS/m (= mS/cm)', ug: 'µg/L (= ppb)'
  };
  var CARGAS = { ca: 2, mg: 2, so4: 2, co3: 2 };
  var FILAS = IONES.map(function (x) { return { k: x.k, n: x.n, base: 'meq', destino: 'meq/L' }; })
    .concat([{ k: 'ce', n: 'Conductividad (CE)', base: 'uS', destino: 'µS/cm' }, { k: 'boro', n: 'Boro (B)', base: 'mg', destino: 'mg/L' }]);
  function fila(k) { return FILAS.find(function (f) { return f.k === k; }); }
  function unidadesDe(k) {
    if (k === 'ce') return ['uS', 'dS'];
    if (k === 'boro') return ['mg', 'ug'];
    if (k === 'po4') return ['meq', 'mg'];
    var u = ['mg', 'meq', 'mmol'];
    if (k === 'co3' || k === 'hco3' || k === 'ca' || k === 'mg') u.push('caco3');
    if (k === 'nh4' || k === 'no3') u.push('n');
    if (k === 'so4') u.push('s');
    return u;
  }
  function f2(n, d) { return Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 2 : d }); }
  // Devuelve { valor: en la unidad del motor, regla: texto de la conversión }
  function convertir(k, valor, unidad) {
    var x = num(valor); if (x == null) return { valor: null, regla: '' };
    var r = function (v, t) { return { valor: v == null ? null : Math.round(v * 10000) / 10000, regla: t }; };
    if (k === 'ce') return unidad === 'dS' ? r(x * 1000, '× 1.000') : r(x, 'igual');
    if (k === 'boro') return unidad === 'ug' ? r(x / 1000, '÷ 1.000') : r(x, 'igual');
    var ion = IONES.find(function (i) { return i.k === k; }), carga = CARGAS[k] || 1;
    if (unidad === 'meq') return r(x, 'igual');
    if (unidad === 'mmol') return r(x * carga, carga === 2 ? '× 2 (dos cargas)' : '× 1 (una carga)');
    if (unidad === 'caco3') return r(x / 50.04, '÷ 50,04 (como CaCO₃)');
    if (unidad === 'n') return r(x / 14.01, '÷ 14,01 (como N)');
    if (unidad === 's') return r(x / 16.03, '÷ 16,03 (como S)');
    if (unidad === 'mg') return ion && ion.eq ? r(x / ion.eq, '÷ ' + f2(ion.eq) + ' (peso equivalente)') : r(null, 'en mg/L no entra en el cálculo');
    return r(null, 'unidad no reconocida');
  }
  // Texto de la unidad que devuelve la IA → código
  function codigoUnidad(txt, k) {
    var t = norm(txt).replace(/\s+/g, ' ').replace('µ', 'u').replace('μ', 'u');
    if (!t) return null;
    if (k === 'ce') { if (/ds|ms\/cm|mmho/.test(t)) return 'dS'; if (/us|umho|micro/.test(t)) return 'uS'; return null; }
    if (k === 'boro') { if (/ug|ppb|micro/.test(t)) return 'ug'; if (/mg|ppm|g\/m/.test(t)) return 'mg'; return null; }
    if (/caco3|caco₃/.test(t)) return 'caco3';
    if (/meq|mmolc|me\/l/.test(t)) return 'meq';
    if (/mmol/.test(t)) return 'mmol';
    if (/(mg\/l|ppm)\s*(como\s*)?n$|n-n[oh]/.test(t)) return 'n';
    if (/(mg\/l|ppm)\s*(como\s*)?s$|s-so4/.test(t)) return 's';
    if (/mg|ppm|g\/m/.test(t)) return 'mg';
    return null;
  }
  // Grilla del formulario: una línea por parámetro (valor del laboratorio · unidad · regla · resultado)
  function grillaHTML(p) {
    return '<div class="tablescroll"><table class="tbl" id="' + p + 'Tabla"><thead><tr><th>Parámetro</th><th>Valor del laboratorio</th><th>Unidad del informe</th><th>Conversión</th><th class="r">Para el cálculo</th></tr></thead><tbody>' +
      FILAS.map(function (f) {
        return '<tr><td><b>' + f.n + '</b>' + (f.k === 'ce' ? ' *' : '') + '</td>' +
          '<td><input type="number" id="' + p + 'v_' + f.k + '" step="any" min="0" style="width:120px;"></td>' +
          '<td><select id="' + p + 'u_' + f.k + '" style="min-width:170px;">' + unidadesDe(f.k).map(function (u) { return '<option value="' + u + '">' + UNIDADES[u] + '</option>'; }).join('') + '</select></td>' +
          '<td class="sub" id="' + p + 'r_' + f.k + '" style="white-space:nowrap;"></td>' +
          '<td class="r" id="' + p + 'o_' + f.k + '" style="white-space:nowrap;font-weight:700;"></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="muted" style="font-size:11.5px;margin-top:6px;">Cargá los números <b>tal cual el informe</b> y elegí su unidad: SAFIA los convierte con la regla de cada línea (meq/L para iones, µS/cm para la CE, mg/L para el boro). Revisá que coincidan con el PDF.</div>';
  }
  function actualizarFila(p, k) {
    var v = $(p + 'v_' + k), u = $(p + 'u_' + k); if (!v || !u) return;
    var c = convertir(k, v.value, u.value), f = fila(k);
    $(p + 'r_' + k).textContent = v.value === '' ? '' : c.regla;
    $(p + 'o_' + k).innerHTML = c.valor == null ? (v.value === '' ? '' : '—') : f2(c.valor, k === 'ce' ? 0 : 3) + ' <span class="sub">' + f.destino + '</span>';
  }
  function conectarGrilla(p) {
    var t = $(p + 'Tabla'); if (!t || t.dataset.conectada) return; t.dataset.conectada = '1';
    var al = function (ev) { var id = ev.target && ev.target.id || ''; var m = id.match(new RegExp('^' + p + '[vu]_(.+)$')); if (m) { ev.target.style.borderColor = ''; actualizarFila(p, m[1]); } };
    t.addEventListener('input', al); t.addEventListener('change', al);
  }
  function ponerGrilla(p, a) {
    FILAS.forEach(function (f) {
      var l = a && a.lab && a.lab[f.k], v, u;
      if (l && l.valor != null) { v = l.valor; u = l.unidad; } else { v = a ? num(a[f.k]) : null; u = f.base; }
      var sel = $(p + 'u_' + f.k); if (!sel) return;
      $(p + 'v_' + f.k).value = v == null ? '' : v;
      sel.value = unidadesDe(f.k).indexOf(u) >= 0 ? u : f.base;
      sel.style.borderColor = l && l.dudosa ? '#C0392B' : '';
      actualizarFila(p, f.k);
    });
  }
  function limpiarGrilla(p) {
    FILAS.forEach(function (f) { var sel = $(p + 'u_' + f.k); if (!sel) return; $(p + 'v_' + f.k).value = ''; sel.value = f.k === 'ce' ? 'uS' : 'mg'; sel.style.borderColor = ''; actualizarFila(p, f.k); });
  }
  function leerGrilla(p) {
    var vals = {}, lab = {};
    FILAS.forEach(function (f) {
      var el = $(p + 'v_' + f.k); if (!el) return;
      var v = num(el.value), u = $(p + 'u_' + f.k).value;
      if (v == null) { vals[f.k] = null; return; }
      lab[f.k] = { valor: v, unidad: u }; vals[f.k] = convertir(f.k, v, u).valor;
    });
    return { vals: vals, lab: lab };
  }
  // Lo que devuelve la IA (valor + unidad del informe) → análisis con valores del motor + datos del laboratorio
  var CAMPO_IA = { na: 'sodio', k: 'potasio', ca: 'calcio', mg: 'magnesio', nh4: 'amonio', cl: 'cloruros', so4: 'sulfatos', co3: 'carbonatos', hco3: 'bicarbonatos', no3: 'nitratos', po4: 'fosfatos', ce: 'ce', boro: 'boro' };
  function desdeIA(m) {
    var a = { fecha: m.fecha || null, fuente: m.fuente || null, fuenteNombre: m.muestra || '', laboratorio: m.laboratorio || '', informe: m.informe || '',
      ph: num(m.ph), tds: num(m.tds), temperatura: num(m.temperatura), observaciones: m.observaciones || '' }, lab = {}, dudas = [];
    FILAS.forEach(function (f) {
      var x = m[CAMPO_IA[f.k]], valor, u;
      if (x == null || x === '') { a[f.k] = null; return; }
      if (typeof x === 'object') { valor = num(x.valor); u = codigoUnidad(x.unidad, f.k); }
      else { valor = num(x); u = f.base; }   // formato anterior: ya venía convertido
      if (valor == null) { a[f.k] = null; return; }
      var dudosa = !u || unidadesDe(f.k).indexOf(u) < 0; if (dudosa) { u = f.base; dudas.push(f.n); }
      lab[f.k] = { valor: valor, unidad: u }; if (dudosa) lab[f.k].dudosa = true;
      a[f.k] = convertir(f.k, valor, u).valor;
    });
    a.lab = lab; if (dudas.length) a.unidadesDudosas = dudas;
    // Alcalinidad total (T) y a la fenolftaleína (P), en mg/L como CaCO3: de ahí salen carbonatos y bicarbonatos sin depender de
    // cómo los calculó el laboratorio (Standard Methods 2320 B: con P < T/2, CO3 = 2P y HCO3 = T − 2P, ambos como CaCO3; ÷ 50,04 → meq/L).
    // Caso INYMA 2024/728: informó HCO3 = 64,4 mg/L (105,6 × 0,61) cuando el ion es 105,6 × 1,22 = 128,8; caso LABFIL 49907: informó
    // CO3 y HCO3 como CaCO3 rotulados mg/L. Con la alcalinidad medida los dos quedan bien.
    var lee = function (x) { return x == null ? null : (typeof x === 'object' ? num(x.valor) : num(x)); };
    var T = lee(m.alcalinidad_total), P = lee(m.alcalinidad_p), dureza = lee(m.dureza), notas = [];
    if (T != null && T > 0) {
      a.alcalinidadTotal = T; if (P != null) a.alcalinidadP = P;
      var co3C, hco3C, ohC = 0;
      if (P == null || P <= 0) { co3C = 0; hco3C = T; notas.push('sin alcalinidad P: toda la alcalinidad como bicarbonato'); }
      else if (P < T / 2) { co3C = 2 * P; hco3C = T - 2 * P; }
      else if (P === T / 2) { co3C = T; hco3C = 0; }
      else { co3C = 2 * (T - P); hco3C = 0; ohC = 2 * P - T; notas.push('hay hidróxidos (' + f2(ohC / 50.04) + ' meq/L), pH muy alto'); }
      var antes = (lab.co3 ? f2(lab.co3.valor) + ' ' + (UNIDADES[lab.co3.unidad] || lab.co3.unidad) : '—') + ' / ' + (lab.hco3 ? f2(lab.hco3.valor) + ' ' + (UNIDADES[lab.hco3.unidad] || lab.hco3.unidad) : '—');
      lab.co3 = { valor: Math.round(co3C * 100) / 100, unidad: 'caco3', deAlcalinidad: true }; a.co3 = convertir('co3', co3C, 'caco3').valor;
      lab.hco3 = { valor: Math.round(hco3C * 100) / 100, unidad: 'caco3', deAlcalinidad: true }; a.hco3 = convertir('hco3', hco3C, 'caco3').valor;
      notas.unshift('Carbonatos y bicarbonatos calculados desde la alcalinidad (SM 2320 B): total ' + f2(T) + (P != null ? ' y P ' + f2(P) : '') + ' mg/L CaCO3 → CO3 ' + f2(a.co3) + ' y HCO3 ' + f2(a.hco3) + ' meq/L (el laboratorio informaba ' + antes + ')');
    }
    // Dureza total (mg/L como CaCO3) = Ca + Mg: si el informe no trae calcio ni magnesio por separado, se usa como calcio (la suma)
    if (dureza != null && !tiene(a, 'ca') && !tiene(a, 'mg')) {
      a.dureza = dureza; lab.ca = { valor: dureza, unidad: 'caco3', deDureza: true }; a.ca = convertir('ca', dureza, 'caco3').valor; a.mg = null; a.caMgDeDureza = true;
      notas.push('Calcio + magnesio tomados de la dureza total (' + f2(dureza) + ' mg/L CaCO3 = ' + f2(a.ca) + ' meq/L), porque el informe no los mide por separado');
    } else if (dureza != null) a.dureza = dureza;
    if (notas.length) a.observaciones = (a.observaciones ? a.observaciones + ' · ' : '') + notas.join(' · ');
    return a;
  }

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
    var W = 560, H = 376, x0 = 58, x1 = W - 18, y0 = 32, y1 = H - 46, cMin = 100, cMax = 5000, sMax = 32;
    var X = function (c) { return x0 + (log10(c) - 2) / (log10(cMax) - 2) * (x1 - x0); };
    var Y = function (s) { return y1 - Math.max(0, Math.min(sMax, s)) / sMax * (y1 - y0); };
    var linea = function (f) { var pts = []; for (var c = 100; c <= 5000; c *= 1.12) pts.push(X(c).toFixed(1) + ',' + Y(f(c)).toFixed(1)); pts.push(X(5000).toFixed(1) + ',' + Y(f(5000)).toFixed(1)); return pts.join(' '); };
    var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:560px;height:auto;font-family:system-ui,sans-serif;" role="img" aria-label="Diagrama de clasificación del agua de riego">';
    h += '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="' + (y1 - y0) + '" fill="#FAFBFB" stroke="#C9CED3"/>';
    // la zona de la clase de esta agua va sombreada (verde / ámbar / rojo según la peor de las dos letras)
    var cl = ce != null && ras != null ? claseUSSL(Math.max(cMin, Math.min(cMax, ce)), ras) : null, colorZona = null;
    if (cl) {
      var peor = Math.max(cl.c, cl.s); colorZona = peor >= 4 ? '#C0392B' : (peor === 3 ? '#B8731A' : '#178029');
      var lim = { 1: [100, 250], 2: [250, 750], 3: [750, 2250], 4: [2250, 5000] }[cl.c];
      var fS = { 0: function () { return 0; }, 1: function (c) { return 18.87 - 4.44 * log10(c); }, 2: function (c) { return 31.31 - 6.66 * log10(c); }, 3: function (c) { return 43.75 - 8.87 * log10(c); }, 4: function () { return sMax; } };
      var abajo = fS[cl.s - 1], arriba = fS[cl.s], pts = [], cc;
      for (cc = lim[0]; cc < lim[1]; cc *= 1.05) pts.push(X(cc).toFixed(1) + ',' + Y(abajo(cc)).toFixed(1));
      pts.push(X(lim[1]).toFixed(1) + ',' + Y(abajo(lim[1])).toFixed(1));
      var sup = []; for (cc = lim[0]; cc < lim[1]; cc *= 1.05) sup.push(X(cc).toFixed(1) + ',' + Y(arriba(cc)).toFixed(1));
      sup.push(X(lim[1]).toFixed(1) + ',' + Y(arriba(lim[1])).toFixed(1));
      h += '<polygon points="' + pts.concat(sup.reverse()).join(' ') + '" fill="' + colorZona + '" fill-opacity="0.22" stroke="' + colorZona + '" stroke-width="2"/>';
    }
    [250, 750, 2250].forEach(function (c) { h += '<line x1="' + X(c) + '" y1="' + y0 + '" x2="' + X(c) + '" y2="' + y1 + '" stroke="#8C9196" stroke-width="1"/>'; });
    [function (c) { return 18.87 - 4.44 * log10(c); }, function (c) { return 31.31 - 6.66 * log10(c); }, function (c) { return 43.75 - 8.87 * log10(c); }].forEach(function (f) { h += '<polyline points="' + linea(f) + '" fill="none" stroke="#8C9196" stroke-width="1"/>'; });
    [0, 4, 8, 12, 16, 20, 24, 28, 32].forEach(function (s) { h += '<text x="' + (x0 - 6) + '" y="' + (Y(s) + 4) + '" font-size="10" text-anchor="end" fill="#5B6167">' + s + '</text>'; });
    [100, 250, 750, 2250, 5000].forEach(function (c) { h += '<text x="' + X(c) + '" y="' + (y1 + 14) + '" font-size="10" text-anchor="middle" fill="#5B6167">' + c + '</text>'; });
    var cx = { 1: X(160), 2: X(430), 3: X(1300), 4: X(3400) };
    var sy = function (c, s) { var cc = { 1: 160, 2: 430, 3: 1300, 4: 3400 }[c], l = limitesS(cc), bajo = { 1: 0, 2: l.s12, 3: l.s23, 4: l.s34 }[s], alto = { 1: l.s12, 2: l.s23, 3: l.s34, 4: sMax }[s]; return Y((bajo + Math.min(alto, sMax)) / 2) + 4; };
    var yEtiq = function (c, s) {
      if (!(cl && cl.c === c && cl.s === s && ce != null && ras != null)) return sy(c, s);
      var cc = { 1: 160, 2: 430, 3: 1300, 4: 3400 }[c], l = limitesS(cc), bajo = { 1: 0, 2: l.s12, 3: l.s23, 4: l.s34 }[s], alto = Math.min({ 1: l.s12, 2: l.s23, 3: l.s34, 4: sMax }[s], sMax);
      var yPunto = Y(ras), yA = Y(alto) + 18, yB = Y(bajo) - 16;
      return Math.abs(yPunto - yA) > Math.abs(yPunto - yB) ? yA : yB;
    };
    var xEtiq = function (c, s) {
      if (!(cl && cl.c === c && cl.s === s && ce != null && ras != null)) return cx[c];
      var pxv = X(Math.max(cMin, Math.min(cMax, ce)));
      return Math.abs(cx[c] - pxv) < 34 ? (pxv >= cx[c] ? cx[c] - 30 : cx[c] + 30) : cx[c];
    };
    for (var c = 1; c <= 4; c++) for (var s = 1; s <= 4; s++) { var es = cl && cl.c === c && cl.s === s; h += '<text x="' + xEtiq(c, s) + '" y="' + yEtiq(c, s) + '" font-size="' + (es ? 13 : 10) + '"' + (es ? ' font-weight="800"' : '') + ' text-anchor="middle" fill="' + (es ? colorZona : '#9AA0A6') + '">C' + c + '-S' + s + '</text>'; }
    h += '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="#2E3236">Conductividad eléctrica (µS/cm a 25 °C) · peligro de salinidad</text>';
    h += '<text x="14" y="' + ((y0 + y1) / 2) + '" font-size="11" text-anchor="middle" fill="#2E3236" transform="rotate(-90 14 ' + ((y0 + y1) / 2) + ')">RAS · peligro de sodio</text>';
    if (ce != null && ras != null) {
      var px = X(Math.max(cMin, Math.min(cMax, ce))), py = Y(ras), fuera = ras > sMax || ce > cMax || ce < cMin;
      h += '<line x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + y1 + '" stroke="' + colorZona + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
      h += '<line x1="' + x0 + '" y1="' + py + '" x2="' + px + '" y2="' + py + '" stroke="' + colorZona + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
      h += '<circle cx="' + px + '" cy="' + py + '" r="12" fill="' + colorZona + '" fill-opacity="0.25"/>';
      h += '<circle cx="' + px + '" cy="' + py + '" r="7" fill="' + colorZona + '" stroke="#fff" stroke-width="2"/>';
      // leyenda arriba del gráfico (así no tapa el nombre de la zona)
      h += '<circle cx="' + (x0 + 6) + '" cy="14" r="6" fill="' + colorZona + '" stroke="#fff" stroke-width="1.5"/><rect x="' + (x0 + 18) + '" y="7" width="22" height="14" fill="' + colorZona + '" fill-opacity="0.22" stroke="' + colorZona + '" stroke-width="1.5"/>';
      h += '<text x="' + (x0 + 46) + '" y="18" font-size="11.5" font-weight="700" fill="#2E3236">Esta agua: CE ' + fmt(ce, 0) + ' µS/cm · RAS ' + fmt(ras, 1) + (fuera ? ' (fuera de escala)' : '') + ' → ' + (cl ? cl.txt : '') + '</text>';
    }
    return h + '</svg>';
  }

  /* ---------- cultivos: FAO 29 (Ayers & Westcot 1985), leído en fao.org/3/t0234e ----------
     ece/ecw: Tabla 4 (dS/m al 100 / 90 / 75 / 50 % del rinde).
     hoja: Tabla 18, Na o Cl (meq/L) que causan daño en la hoja con aspersión (grupo <5 → se usa el 3 de la Tabla 1).
     boro: Tabla 16, rango de tolerancia en mg/L [desde, hasta]; hasta = máximo sin pérdida de rinde (nota 2).
     psi: Tabla 15, sodio intercambiable del suelo que tolera ('<15' sensible, '15–40' semitolerante, '>40' tolerante).
     clase: Tabla 5 cuando el cultivo no tiene números en la Tabla 4. null = el cultivo no figura en esa tabla. */
  var CULTIVOS = {
    soja:     { n: 'Soja',        ece: [5.0, 5.5, 6.3, 7.5], ecw: [3.3, 3.7, 4.2, 5.0], hoja: null, boro: null, psi: null },
    maiz:     { n: 'Maíz',        ece: [1.7, 2.5, 3.8, 5.9], ecw: [1.1, 1.7, 2.5, 3.9], hoja: 10, hojaNota: 'Colorado State (Maas 1990) lo ubica más sensible: daño desde 2 meq/L de sodio o 5 de cloruro', boro: [2.0, 4.0], psi: '<15' },
    maizfor:  { n: 'Maíz forrajero', ece: [1.8, 3.2, 5.2, 8.6], ecw: [1.2, 2.1, 3.5, 5.7], hoja: 10, boro: [2.0, 4.0], psi: '<15' },
    trigo:    { n: 'Trigo',       ece: [6.0, 7.4, 9.5, 13],  ecw: [4.0, 4.9, 6.3, 8.7], hoja: null, boro: [0.75, 1.0], psi: '15–40' },
    sorgo:    { n: 'Sorgo',       ece: [6.8, 7.4, 8.4, 9.9], ecw: [4.5, 5.0, 5.6, 6.7], hoja: 10, boro: [4.0, 6.0], psi: '15–40' },
    algodon:  { n: 'Algodón',     ece: [7.7, 9.6, 13, 17],   ecw: [5.1, 6.4, 8.4, 12],  hoja: 20, boro: [6.0, 15.0], psi: '>40' },
    arroz:    { n: 'Arroz',       ece: [3.0, 3.8, 5.1, 7.2], ecw: [2.0, 2.6, 3.4, 4.8], hoja: null, boro: null, psi: '15–40' },
    cana:     { n: 'Caña de azúcar', ece: [1.7, 3.4, 5.9, 10], ecw: [1.1, 2.3, 4.0, 6.8], hoja: null, boro: null, psi: '15–40' },
    alfalfa:  { n: 'Alfalfa',     ece: [2.0, 3.4, 5.4, 8.8], ecw: [1.3, 2.2, 3.6, 5.9], hoja: 10, boro: [4.0, 6.0], psi: '>40' },
    bermuda:  { n: 'Pasto bermuda', ece: [6.9, 8.5, 11, 15], ecw: [4.6, 5.6, 7.2, 9.8], hoja: null, boro: null, psi: '>40' },
    sudan:    { n: 'Pasto sudán', ece: [2.8, 5.1, 8.6, 14],  ecw: [1.9, 3.4, 5.7, 9.6], hoja: null, boro: null, psi: null },
    llloron:  { n: 'Pasto llorón (Eragrostis)', ece: [2.0, 3.2, 5.0, 8.0], ecw: [1.3, 2.1, 3.3, 5.3], hoja: null, boro: null, psi: null },
    cebada:   { n: 'Cebada',      ece: [8.0, 10, 13, 18],    ecw: [5.3, 6.7, 8.7, 12],  hoja: 10, boro: [0.75, 1.0], psi: '>40' },
    poroto:   { n: 'Poroto',      ece: [1.0, 1.5, 2.3, 3.6], ecw: [0.7, 1.0, 1.5, 2.4], hoja: null, boro: [0.75, 1.0], psi: '<15' },
    papa:     { n: 'Papa',        ece: [1.7, 2.5, 3.8, 5.9], ecw: [1.1, 1.7, 2.5, 3.9], hoja: 5, boro: [1.0, 2.0], psi: null },
    tomate:   { n: 'Tomate',      ece: [2.5, 3.5, 5.0, 7.6], ecw: [1.7, 2.3, 3.4, 5.0], hoja: 5, boro: [4.0, 6.0], psi: '15–40' },
    naranja:  { n: 'Naranja',     ece: [1.7, 2.3, 3.3, 4.8], ecw: [1.1, 1.6, 2.2, 3.2], hoja: 3, boro: [0.5, 0.75], psi: '<15' },
    girasol:  { n: 'Girasol',     clase: 'moderadamente sensible', hoja: 20, boro: [0.75, 1.0], psi: null },
    rhodes:   { n: 'Grama Rhodes (Chloris gayana)', clase: 'moderadamente tolerante', hoja: null, boro: null, psi: '>40' },
    buffel:   { n: 'Buffel grass', clase: 'moderadamente sensible', hoja: null, boro: null, psi: null }
  };
  function claveCultivo(c) {
    var n = norm(c);
    if (/^so[jy]a/.test(n)) return 'soja';
    if (/^maiz/.test(n)) return /forraj|silo|ensil/.test(n) ? 'maizfor' : 'maiz';
    if (/^trigo/.test(n)) return 'trigo'; if (/^sorgo/.test(n)) return 'sorgo';
    if (/^algodon/.test(n)) return 'algodon'; if (/^arroz/.test(n)) return 'arroz'; if (/cana/.test(n)) return 'cana'; if (/^alfalfa/.test(n)) return 'alfalfa';
    if (/bermuda|tifton|cynodon/.test(n)) return 'bermuda'; if (/sudan/.test(n)) return 'sudan'; if (/lloron|eragrostis/.test(n)) return 'llloron';
    if (/^cebada/.test(n)) return 'cebada'; if (/^poroto|^frijol|^feijao/.test(n)) return 'poroto';
    if (/^papa/.test(n)) return 'papa'; if (/^tomate/.test(n)) return 'tomate'; if (/naranj|citric/.test(n)) return 'naranja';
    if (/^girasol/.test(n)) return 'girasol'; if (/rhodes|chloris/.test(n)) return 'rhodes'; if (/buffel|cenchrus/.test(n)) return 'buffel';
    return null;
  }
  // Un cultivo frente a esta agua: sales (Tabla 4), lavado (ec. 9), hoja con pivot (Tabla 18), boro (Tabla 16)
  function evaluarCultivo(clave, r, a, aspersion) {
    var cu = CULTIVOS[clave]; if (!cu) return null;
    var o = { clave: clave, n: cu.n, motivos: [], estado: 'ok', clase: cu.clase || null, psi: cu.psi };
    var sube = function (e) { if (e === 'grave' || (e === 'cuidado' && o.estado === 'ok')) o.estado = e; };
    var ecw = r.ecw;
    if (cu.ecw && ecw != null) {
      var w = cu.ecw;
      o.umbralEcw = w[0]; o.umbralEce = cu.ece[0];
      o.potencial = ecw <= w[0] ? '100 %' : (ecw <= w[1] ? '90–100 %' : (ecw <= w[2] ? '75–90 %' : (ecw <= w[3] ? '50–75 %' : 'menos de 50 %')));
      if (ecw > w[3]) { sube('grave'); o.motivos.push('por sales rinde menos de la mitad (FAO Tabla 4)'); }
      else if (ecw > w[0]) { sube('cuidado'); o.motivos.push('por sales rinde ' + o.potencial + ' (FAO Tabla 4)'); }
      // FAO 29 §2.4.2: ECe del 90 % del rinde; con agua de más de 1,5 dS/m, la del 100 %
      var eceObj = ecw > 1.5 ? cu.ece[0] : cu.ece[1], den = 5 * eceObj - ecw;
      o.lr = den > 0 ? ecw / den : null; o.lrBase = ecw > 1.5 ? '100 %' : '90 %';
      if (o.lr == null || o.lr > 0.30) { sube('grave'); o.motivos.push('necesitaría más de 30 % de agua extra de lavado, que FAO considera poco práctico (§2.4.3)'); }
      else if (o.lr > 0.25) { sube('cuidado'); o.motivos.push('necesita ' + fmt(o.lr * 100, 0) + ' % de agua extra de lavado (FAO: más de 25–30 % puede no ser práctico)'); }
    }
    if (aspersion && cu.hoja != null) {
      var mx = Math.max(v(a, 'na'), v(a, 'cl'));
      o.hojaUmbral = cu.hoja;
      o.hojaNota = cu.hojaNota || null;
      if (mx >= cu.hoja) { o.hojaDano = true; sube('cuidado'); o.motivos.push('con ' + fmt(mx, 1) + ' meq/L de ' + (v(a, 'na') >= v(a, 'cl') ? 'sodio' : 'cloruro') + ' la hoja se quema si se riega de día (FAO Tabla 18: daño desde ' + (cu.hoja === 3 ? 'menos de 5' : cu.hoja) + ' meq/L)'); }
    }
    var b = r.boro;
    if (b != null && cu.boro) {
      o.boroRango = cu.boro;
      if (b > cu.boro[1]) { sube('grave'); o.motivos.push('boro ' + fmt(b, 2) + ' mg/L por encima de lo que tolera (' + fmt(cu.boro[0], 2) + '–' + fmt(cu.boro[1], 2) + ', FAO Tabla 16)'); }
      else if (b > cu.boro[0]) { sube('cuidado'); o.motivos.push('boro ' + fmt(b, 2) + ' mg/L en el límite de lo que tolera (' + fmt(cu.boro[0], 2) + '–' + fmt(cu.boro[1], 2) + ')'); }
    }
    return o;
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
  /* ---------- corrección del agua: cuánto ácido y cuánto yeso, y si conviene ----------
     Ácido (FAO 29 §5.3): "agregar ácido sulfúrico al 90 % del equivalente de HCO3"; "un pH no menor de 6,5
       parece seguro para aspersores". El carbonato se neutraliza entero (pasa primero a bicarbonato).
       1 meq/L de H2SO4 = 49,04 g por m³ de ácido puro (peso equivalente 98,08 / 2).
     Yeso (FAO 29 §3.2.1, ejemplo 7): "1 meq/L de calcio = 86 kg de yeso 100 % por 1000 m³ de agua";
       en el agua "es raro disolver más de 1 a 4 meq/L de Ca"; con CE > 1,0 dS/m y RAS alta conviene
       aplicarlo al suelo; al suelo "más de 10 t/ha por año suele no ser económico".
     Meta: sacar el agua de la franja "severa" de infiltración de la Tabla 1 (RAS con CE). Al disolver yeso
       la CE sube: se estima 0,1 dS/m por cada meq/L (USDA Manual 60, p. 79: meq/L ≈ CE × 10). */
  var CA_MAX_AGUA = 4, YESO_KG_POR_MEQ_1000M3 = 86, ACIDO_G_POR_MEQ_M3 = 49.04, YESO_MAX_T_HA_ANO = 10;
  function correccion(a, r, laminaMm) {
    if (r.ras == null || r.ecw == null) return null;
    var na = v(a, 'na'), caMg = v(a, 'ca') + v(a, 'mg'), hco3 = v(a, 'hco3'), co3 = v(a, 'co3');
    var inf0 = infiltracion(r.ras, r.ecw), c = { lamina: laminaMm, m3: laminaMm * 10 };
    // 1) ácido: solo si el bicarbonato le saca el calcio al suelo (CSR > 1,25). Para las manchas blancas en la hoja FAO
    //    lo considera costoso y propio de cultivos de alto valor (§5.3): ahí alcanza con regar de noche.
    c.acidoMeq = r.csr != null && r.csr > 1.25 ? Math.round((0.9 * hco3 + co3) * 100) / 100 : 0;
    c.acidoKgPor100mm = c.acidoMeq * ACIDO_G_POR_MEQ_M3;           // 1000 m³ por cada 100 mm en 1 ha → g/m³ = kg/1000 m³
    c.acidoTAno = c.acidoKgPor100mm * laminaMm / 100 / 1000;
    // 2) calcio necesario para salir de "severa" (y el que haría falta para "sin restricción")
    function calcioPara(estadoMeta) {
      if (inf0 && (inf0.estado === 'ok' || (estadoMeta === 'cuidado' && inf0.estado === 'cuidado'))) return 0;
      for (var d = 0; d <= 60; d += 0.05) {
        var ras = na / Math.sqrt((caMg + d) / 2), ecw = r.ecw + d / 10, e = infiltracion(ras, ecw);
        if (e && (e.estado === 'ok' || (estadoMeta === 'cuidado' && e.estado === 'cuidado'))) return Math.round(d * 100) / 100;
      }
      return null;   // ni con 60 meq/L de calcio
    }
    c.caMeq = calcioPara('cuidado'); c.caMeqSinRestriccion = calcioPara('ok');
    if (c.caMeq != null) {
      c.yesoKgPor100mm = c.caMeq * YESO_KG_POR_MEQ_1000M3;
      c.yesoTAno = c.yesoKgPor100mm * laminaMm / 100 / 1000;
      c.yesoEnAgua = c.caMeq <= CA_MAX_AGUA && r.ecw <= 1.0;
      c.rasCorregida = na / Math.sqrt((caMg + c.caMeq) / 2); c.ecwCorregida = r.ecw + c.caMeq / 10;
    }
    // FAO 29 §3.2.1: más de 10 t/ha por año de yeso suele no ser económico
    c.inviable = c.caMeq == null || c.yesoTAno > YESO_MAX_T_HA_ANO;
    // costo con los precios vigentes que cargó el usuario (Datos → Precios); sin precio, solo cantidades
    var pr = window.SafiaPrecios && SafiaPrecios.vigentes ? SafiaPrecios.vigentes().fila : null;
    c.precioYeso = pr && num(pr.yesoUSDt) != null ? num(pr.yesoUSDt) : null;
    c.precioAcido = pr && num(pr.acidoSulfuricoUSDt) != null ? num(pr.acidoSulfuricoUSDt) : null;
    c.costoYeso = c.precioYeso != null && c.yesoTAno != null ? c.yesoTAno * c.precioYeso : null;
    c.costoAcido = c.precioAcido != null ? c.acidoTAno / 0.98 * c.precioAcido : null;   // ácido comercial 98 %
    // 3) sin ácido (Irrigar no inyecta ácido en el pivot, Osmar 5-oct-2026): el calcio tiene que cubrir también el bicarbonato en
    //    exceso (CSR), que precipita el calcio agregado como carbonato de calcio al concentrarse el agua en el suelo (USDA Manual 60
    //    p. 81, concepto de Eaton). Aproximación: Ca sin ácido = Ca para salir de la franja severa + CSR. Controlar con el PSI del suelo.
    if (c.acidoMeq > 0 && c.caMeq != null) {
      c.caMeqSinAcido = Math.round((c.caMeq + Math.max(r.csr || 0, 0)) * 100) / 100;
      c.yesoSinAcidoKgPor100mm = c.caMeqSinAcido * YESO_KG_POR_MEQ_1000M3;
      c.yesoSinAcidoTAno = c.yesoSinAcidoKgPor100mm * laminaMm / 100 / 1000;
      c.yesoSinAcidoEnAgua = c.caMeqSinAcido <= CA_MAX_AGUA && r.ecw <= 1.0;
      c.costoYesoSinAcido = c.precioYeso != null ? c.yesoSinAcidoTAno * c.precioYeso : null;
    }
    return c;
  }

  function interpretar(a, opciones) {
    opciones = opciones || {};
    var r = calcular(a), aspersion = opciones.aspersion !== false, items = [];
    var laminaDato = num(opciones.laminaMm) != null ? num(opciones.laminaMm) : num(a.laminaAnualMm), lamina = laminaDato != null && laminaDato > 0 ? laminaDato : 500;
    function it(k, n, valor, unidad, estado, texto, fuente) { items.push({ k: k, n: n, valor: valor, unidad: unidad, estado: estado, texto: texto, fuente: fuente }); }
    // 1. Sales (FAO Tabla 1)
    if (r.ecw != null) it('sal', 'Sales totales (CE)', r.ce, 'µS/cm', r.ecw < 0.7 ? 'ok' : (r.ecw <= 3 ? 'cuidado' : 'grave'),
      r.ecw < 0.7 ? 'Menos de 0,7 dS/m: sin restricción por salinidad.' : (r.ecw <= 3 ? fmt(r.ecw, 2) + ' dS/m: restricción ligera a moderada (0,7–3,0); se maneja con agua extra de lavado y cultivos según su tolerancia.' : fmt(r.ecw, 2) + ' dS/m: restricción severa (más de 3,0); solo suelos permeables y cultivos tolerantes, con lavado alto.'), '[1] Tabla 1');
    // 2. Sodio y suelo (FAO Tabla 1: RAS junto con CE)
    var inf = infiltracion(r.ras, r.ecw);
    if (inf) it('inf', 'Sodio para el suelo (RAS con CE)', r.ras, 'RAS', inf.estado, inf.texto + (inf.estado !== 'ok' ? ' Con lluvia después de regar con esta agua el problema es aún mayor (FAO §3.2.2).' : '') + (r.ras > 26 ? ' Texas A&M: con RAS de más de 26 el agua es "en general no apta".' : (r.ras > 18 ? ' Texas A&M: con RAS 18–26 "en general no apta para uso continuo".' : '')), '[1] Tabla 1, §3.2.2; [7]');
    // 3. Clase USSL (USDA Manual 60)
    if (r.clase) it('ussl', 'Clasificación Riverside (USSL)', r.clase.txt, '', r.clase.c === 4 || r.clase.s === 4 ? 'grave' : (r.clase.c === 3 || r.clase.s >= 2 ? 'cuidado' : 'ok'), TEXTO_C[r.clase.c] + ' ' + TEXTO_S[r.clase.s], '[2] p. 80–81');
    // 4. Carbonato de sodio residual (USDA Manual 60, p. 81)
    if (r.csr != null) it('csr', 'Carbonato de sodio residual (CSR)', r.csr, 'meq/L', r.csr < 1.25 ? 'ok' : (r.csr <= 2.5 ? 'cuidado' : 'grave'),
      r.csr < 1.25 ? 'Menos de 1,25 meq/L: probablemente segura.' : (r.csr <= 2.5 ? 'Entre 1,25 y 2,5 meq/L: marginal; el bicarbonato precipita el calcio y deja más libre al sodio.' : 'Más de 2,5 meq/L: no apta sin tratamiento; el bicarbonato precipita el calcio y el sodio pasa a dominar el suelo.'), '[2] p. 81');
    // 5. Sodio y cloruro: con pivot se absorben por la hoja mojada (FAO Tabla 1 y Tabla 18)
    var notaSup = ' (FAO: en riego por superficie rige para frutales y leñosos; los cultivos anuales se evalúan por salinidad, Tablas 4 y 5)';
    if (tiene(a, 'na')) it('na', 'Sodio' + (aspersion ? ' en la hoja (pivot)' : ''), num(a.na), 'meq/L', aspersion ? (num(a.na) > 3 ? 'cuidado' : 'ok') : (r.ras != null && r.ras > 9 ? 'grave' : (r.ras != null && r.ras >= 3 ? 'cuidado' : 'ok')),
      aspersion ? (num(a.na) > 3 ? 'Más de 3 meq/L: restricción ligera a moderada; con tiempo caluroso y seco la hoja mojada absorbe sodio. Qué cultivos se dañan, en la tabla de cultivos (FAO Tabla 18).' : 'Hasta 3 meq/L: sin restricción.') : ((r.ras > 9 ? 'RAS más de 9: severa' : (r.ras >= 3 ? 'RAS 3–9: ligera a moderada' : 'Sin restricción')) + notaSup + '.'), '[1] Tabla 1');
    if (tiene(a, 'cl')) { var cl = num(a.cl); it('cl', 'Cloruros' + (aspersion ? ' en la hoja (pivot)' : ''), cl, 'meq/L', aspersion ? (cl > 3 ? 'cuidado' : 'ok') : (cl < 4 ? 'ok' : (cl <= 10 ? 'cuidado' : 'grave')),
      aspersion ? (cl > 3 ? 'Más de 3 meq/L: restricción ligera a moderada; se absorbe por la hoja mojada (ver cultivos, FAO Tabla 18).' : 'Hasta 3 meq/L: sin restricción.') : ((cl < 4 ? 'Sin restricción' : (cl <= 10 ? '4–10 meq/L: ligera a moderada' : 'Más de 10 meq/L: severa')) + notaSup + '.'), '[1] Tabla 1'); }
    if (r.boro != null) it('b', 'Boro', r.boro, 'mg/L', r.boro < 0.7 ? 'ok' : (r.boro <= 3 ? 'cuidado' : 'grave'),
      r.boro < 0.7 ? 'Menos de 0,7 mg/L: sin restricción.' : (r.boro <= 3 ? '0,7–3,0 mg/L: ligera a moderada; depende del cultivo (tabla de cultivos, FAO Tabla 16).' : 'Más de 3,0 mg/L: severa; solo cultivos tolerantes (FAO Tabla 16).'), '[1] Tabla 1');
    if (tiene(a, 'hco3') && aspersion) { var hc = num(a.hco3); it('hco3', 'Bicarbonato (pivot)', hc, 'meq/L', hc < 1.5 ? 'ok' : (hc <= 8.5 ? 'cuidado' : 'grave'),
      hc < 1.5 ? 'Menos de 1,5 meq/L: sin restricción.' : (hc <= 8.5 ? '1,5–8,5 meq/L: ligera a moderada; deja depósitos blancos en hojas y frutos al secarse.' : 'Más de 8,5 meq/L: severa; depósitos blancos importantes.'), '[1] Tabla 1'); }
    if (aspersion && (tiene(a, 'hco3') || tiene(a, 'co3')) && (tiene(a, 'ca') || tiene(a, 'mg'))) { var ldp = Math.min(v(a, 'hco3') + v(a, 'co3'), v(a, 'ca') + v(a, 'mg'));
      it('ldp', 'Depósitos de cal en la hoja (pivot)', ldp, 'meq/L', ldp < 2 ? 'ok' : (ldp <= 4 ? 'cuidado' : 'grave'), ldp < 2 ? 'Menos de 2 meq/L: sin limitaciones.' : (ldp <= 3 ? '2–3 meq/L: regar con más de 5 mm/h (0,2 pulgadas/h).' : (ldp <= 4 ? '3–4 meq/L: más de 5 mm/h y solo con poca evaporación (de noche o días nublados).' : 'Más de 4 meq/L: no se recomienda regar por aspersión.')) + ' Es el menor entre (bicarbonato + carbonato) y (calcio + magnesio).', '[8] Tabla 14'); }
    if (r.ph != null) it('ph', 'pH', r.ph, '', r.ph >= 6.5 && r.ph <= 8.4 ? 'ok' : 'cuidado', r.ph >= 6.5 && r.ph <= 8.4 ? 'Dentro del rango normal (6,5–8,4).' : 'Fuera del rango normal de FAO (6,5–8,4): revisar el resto del análisis.', '[1] Tabla 1');
    if (r.no3n != null && r.no3n >= 5) it('n', 'Nitrógeno de nitratos (N-NO₃)', r.no3n, 'mg/L', r.no3n <= 30 ? 'cuidado' : 'grave', fmt(r.no3n, 1) + ' mg/L (5–30: ligera a moderada; más de 30: severa, en cultivos sensibles). Aporta ' + fmt(r.no3n, 1) + ' kg de N por ha cada 100 mm: descontarlo de la fertilización.', '[1] Tabla 1');
    // 5b. Referencia regional INTA (IPG 1999): RAS para riego complementario en zonas húmedas, más estricta que FAO
    if (r.ras != null) it('inta', 'Sodio: referencia INTA (riego complementario)', r.ras, 'RAS', r.ras < 5 ? 'ok' : (r.ras <= 15 ? 'cuidado' : 'grave'),
      (r.ras < 5 ? 'Menos de 5: aceptable en todas las zonas del INTA.' : (r.ras <= 15 ? 'Entre 5 y 15: según la zona el INTA la considera aceptable, dudosa o riesgosa (centro-sur de Córdoba, suelos con poca materia orgánica: dudosa desde 5 y riesgosa desde 10; norte de Buenos Aires: dudosa desde 10).' : 'Más de 15: riesgosa en todas las zonas del INTA salvo el sudeste de Buenos Aires (dudosa hasta 20).')) + ' En regiones con lluvias, el INTA advierte que Riverside y FAO pueden subestimar el riesgo de las aguas bicarbonatadas sódicas: vigilar el sodio intercambiable del suelo (PSI; el INTA usa 5 % como alerta).', '[10]');
    // 6. Calcio frente al magnesio (FAO 29 §5.4)
    var caR = v(a, 'ca'), mgR = v(a, 'mg');
    if (tiene(a, 'ca') && tiene(a, 'mg') && r.cationes > 0 && (caR / Math.max(mgR, 1e-9) < 1 || caR / r.cationes < 0.15))
      it('camg', 'Calcio frente al magnesio y al total', caR / r.cationes * 100, '% del total', 'cuidado', (mgR > 0 ? 'Ca/Mg ' + fmt(caR / mgR, 2) + ' y ' : 'Sin magnesio detectado (la relación Ca/Mg no se calcula); ') + 'Ca = ' + fmt(caR / r.cationes * 100, 1) + ' % de los cationes: con Ca/Mg menor que 1 o calcio menor que 15 % del total, FAO pide una evaluación adicional.', '[1] §5.4');

    // cultivos del proyecto
    var claves = (opciones.cultivos || ['Soja', 'Maíz']).map(claveCultivo).filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
    var cultivos = claves.map(function (k) { return evaluarCultivo(k, r, a, aspersion); }).filter(Boolean);
    // Sodio y cloruro en la hoja: los 3 meq/L de la Tabla 1 son la guía general; qué cultivo se daña lo dice la Tabla 18 (los sensibles son
    // frutales). Si todos los cultivos del proyecto toleran este valor según la Tabla 18, queda como dato y no como restricción; si alguno
    // no figura en la tabla (pastos), se dice que no hay dato de FAO en vez de darlo por dañado.
    if (aspersion && claves.length) ['na', 'cl'].forEach(function (k) {
      var itm = items.filter(function (x) { return x.k === k; })[0]; if (!itm || itm.estado !== 'cuidado') return;
      var toleran = claves.filter(function (q) { return CULTIVOS[q].hoja != null && itm.valor < CULTIVOS[q].hoja; }), sinDato = claves.filter(function (q) { return CULTIVOS[q].hoja == null; }), danan = claves.filter(function (q) { return CULTIVOS[q].hoja != null && itm.valor >= CULTIVOS[q].hoja; });
      var nom = function (l) { return l.map(function (q) { return CULTIVOS[q].n.toLowerCase(); }).join(', '); };
      itm.texto += ' Los 3 meq/L son la guía general de FAO, pensada para los cultivos sensibles de la Tabla 18 (almendro, damasco, cítricos, ciruelo: menos de 5 meq/L); maíz, alfalfa y cebada toleran 10–20 y algodón o girasol más de 20. FAO: el daño ocurre sobre todo con temperatura alta, humedad menor que 30 % y viento.' +
        (danan.length ? ' Se dañan: ' + nom(danan) + '.' : '') + (toleran.length ? ' Con este valor no se dañan: ' + nom(toleran) + '.' : '') + (sinDato.length ? ' Sin dato de FAO para ' + nom(sinDato) + ' (no figura en la Tabla 18).' : '');
      if (!danan.length && !sinDato.length) itm.estado = 'ok';
    });
    var cor = correccion(a, r, lamina);

    // controles del propio análisis: Standard Methods 1030 E (balance) y Hem 1992 (TDS/CE)
    var control = [], controlFalla = false;
    if (r.cationes > 0 && r.aniones > 0) {
      var dif = r.cationes - r.aniones, pct = Math.abs(r.balance), sumaAn = r.aniones;
      var tope = sumaAn <= 3 ? null : (sumaAn <= 10 ? 2 : 5), falla = tope == null ? Math.abs(dif) > 0.2 : pct > tope;
      if (falla) { controlFalla = true; control.push('El análisis no pasa el control de calidad de Standard Methods 1030 E: cationes ' + fmt(r.cationes, 2) + ' y aniones ' + fmt(r.aniones, 2) + ' meq/L difieren ' + (tope == null ? fmt(Math.abs(dif), 2) + ' meq/L (máximo 0,2)' : fmt(pct, 1) + ' % (máximo ' + tope + ' % con ' + (sumaAn <= 10 ? '3–10' : 'más de 10') + ' meq/L de aniones)') + '. Pedir al laboratorio que lo revise o lo repita antes de decidir [6].'); }
    }
    if (r.tdsMedido != null && r.ce > 0) { var rt = r.tdsMedido / r.ce; if (rt < 0.54 || rt > 0.96) control.push('El TDS medido (' + fmt(r.tdsMedido, 0) + ' mg/L) dividido la CE da ' + fmt(rt, 2) + ', fuera del rango de aguas naturales (0,54–0,96, Hem 1992): el TDS o la CE pueden estar mal [6].'); }
    if (r.cationesPorCE != null && r.cationes > 0 && Math.abs(r.cationes - r.cationesPorCE) / r.cationesPorCE > 0.3) control.push('Orientativo: por la CE (' + fmt(r.ce, 0) + ' µS/cm) se esperarían unos ' + fmt(r.cationesPorCE, 1) + ' meq/L de cationes y el análisis suma ' + fmt(r.cationes, 1) + ' (USDA Manual 60, p. 79, relación aproximada).');

    // veredicto: descartar / apta con manejo / apta
    var descartes = [];
    if (r.clase && r.clase.s === 4 && r.clase.c >= 3) {
      descartes.push('Clase ' + r.clase.txt + ': el USDA Manual 60 califica el agua S4 como "en general no apta para riego, salvo con salinidad baja o media" [2]');
      if (r.ras > 26) descartes.push('RAS ' + fmt(r.ras, 1) + ': Texas A&M califica el agua con RAS de más de 26 como "en general no apta" [7]');
      if (r.csr != null && r.csr > 2.5) descartes.push('Carbonato de sodio residual ' + fmt(r.csr, 2) + ' meq/L: más de 2,5 es "no apta" (USDA Manual 60; igual en INTA y Embrapa) [2]');
    }
    if (cor && cor.inviable && inf && inf.estado === 'grave') descartes.push(cor.caMeq == null ? 'Ni agregando 60 meq/L de calcio el sodio sale de la franja severa de FAO' : 'Para sacar el sodio de la franja severa haría falta ' + fmt(cor.yesoTAno, 1) + ' t/ha de yeso por año con ' + fmt(lamina, 0) + ' mm; FAO: más de 10 t/ha por año suele no ser económico [1] §3.2.1');
    var noAptos = cultivos.filter(function (c) { return c.estado === 'grave'; }), aptos = cultivos.filter(function (c) { return c.estado !== 'grave'; });
    if (cultivos.length && !aptos.length) descartes.push('Ninguno de los cultivos del proyecto la tolera: ' + noAptos.map(function (c) { return c.n.toLowerCase() + ' (' + c.motivos.filter(function (m) { return true; })[0] + ')'; }).join('; '));
    var alternativos = [];
    var descartePorAgua = (r.clase && r.clase.s === 4 && r.clase.c >= 3) || (cor && cor.inviable && inf && inf.estado === 'grave');
    if (!descartePorAgua && (descartes.length || noAptos.length)) Object.keys(CULTIVOS).forEach(function (k) { if (claves.indexOf(k) >= 0) return; var e = evaluarCultivo(k, r, a, aspersion); if (e && e.estado === 'ok' && e.umbralEcw != null) alternativos.push(e.n); });
    var graves = items.filter(function (x) { return x.estado === 'grave'; }), cuidados = items.filter(function (x) { return x.estado === 'cuidado'; });
    var veredicto;
    if (!items.length) veredicto = { k: 'sin', titulo: 'Faltan datos', detalle: 'Cargá al menos la CE, el sodio, el calcio y el magnesio.' };
    else if (descartes.length) veredicto = { k: 'grave', titulo: 'No apta: descartar como fuente de riego', detalle: descartes.join('. ') + '.', motivos: descartes };
    else if (graves.length || cuidados.length || cultivos.some(function (c) { return c.estado !== 'ok'; })) veredicto = { k: 'cuidado', titulo: 'Apta con manejo: seguir el plan paso a paso', detalle: 'Se puede regar si se aplica el plan de abajo. Puntos a manejar: ' + graves.concat(cuidados).map(function (x) { return x.n; }).join(' · ') + (noAptos.length ? '. No sirve para ' + noAptos.map(function (c) { return c.n.toLowerCase(); }).join(', ') : '') + '.' };
    else veredicto = { k: 'ok', titulo: 'Apta para riego', detalle: 'Sin restricciones según FAO 29 y el USDA Manual 60 para los cultivos del proyecto.' };
    if (controlFalla && veredicto.k !== 'sin') veredicto.detalle += ' Ojo: el análisis no pasa el control de calidad; confirmarlo antes de decidir.';
    var L = { r: r, items: items, cultivos: cultivos, noAptos: noAptos, alternativos: alternativos, control: control, controlFalla: controlFalla, veredicto: veredicto, aspersion: aspersion, correccion: cor, lamina: lamina, laminaSupuesta: laminaDato == null };
    L.plan = plan(L, a);
    L.recomendaciones = L.plan;   // compatibilidad
    return L;
  }

  /* ---------- plan paso a paso (o, si se descarta, qué haría falta y por qué no conviene) ---------- */
  function plan(L, a) {
    var r = L.r, c = L.correccion, est = {}, out = [], descartada = L.veredicto.k === 'grave';
    L.items.forEach(function (i) { est[i.k] = i.estado; });
    var p = function (t, d, f) { out.push({ t: t, d: d, f: f || '' }); };
    var t1 = function (x) { return x == null ? '—' : fmt(x, x < 10 ? 2 : 1); };
    var lam = fmt(L.lamina, 0) + ' mm por año' + (L.laminaSupuesta ? ' (supuesto: cargá el riego previsto)' : '');
    if (L.veredicto.k === 'ok' || L.veredicto.k === 'sin') {
      if (L.veredicto.k === 'ok') p('Controlar una vez por año', 'Repetir el análisis del agua cada año (el pozo puede cambiar) y medir la CE y el sodio intercambiable (PSI) del suelo.', '');
      return out;
    }
    if (L.controlFalla) p('Confirmar el análisis', 'Cationes y aniones no cierran según Standard Methods 1030 E: pedir al laboratorio que lo revise o repetir la muestra antes de invertir.', '[6]');
    if (descartada) p('Buscar otra fuente de agua', 'Con esta agua la recomendación es no regar. FAO: "muchas aguas con RAS alta se abandonan cuando hay otra fuente de mejor calidad"; si existe, mezclarla con esta (diluir) es la única forma económica de bajar las sales. Desalar (ósmosis inversa) no es económico para riego: como referencia, en plantas municipales de Texas cuesta US$ 0,29–0,63 por m³, es decir US$ 290–630 por ha cada 100 mm. Si igual se quiere probar, FAO pide un ensayo piloto a campo antes de un proyecto grande.', '[1] §1.4, §3.2.1, §3.2.2; [8] p. 5; [9]');
    p('Analizar el suelo antes de instalar', 'Pedir CE del extracto de saturación (CEe), sodio intercambiable (PSI), pH y si tiene carbonatos (calcáreo) en 0–20 y 20–40 cm, y confirmar que no haya napa a menos de 2 m: las guías de FAO suponen buen drenaje.', '[1] Tabla 1, supuestos');
    if (c && c.acidoMeq > 0) p((descartada ? 'Haría falta: ' : '') + 'ácido sulfúrico para el bicarbonato',
      'Inyectar ácido en el cabezal hasta neutralizar el 90 % del bicarbonato (y todo el carbonato): ' + t1(c.acidoMeq) + ' meq/L = ' + fmt(c.acidoKgPor100mm, 0) + ' kg de ácido puro por ha cada 100 mm; ' + t1(c.acidoTAno) + ' t/ha con ' + lam + (c.costoAcido != null ? ' (≈ US$ ' + fmt(c.costoAcido, 0) + '/ha por año con ácido al 98 %)' : ' (cargá el precio del ácido sulfúrico en Datos → Precios para ver el costo)') + '. Llevar el agua a pH 6,5 y no menos con pivot (por encima de 6,5 queda bicarbonato sin neutralizar). El ácido no baja el sodio (la RAS queda igual). FAO: es muy corrosivo y peligroso, solo con operadores con experiencia, y en general se justifica en cultivos de alto valor.', '[1] §3.2.1, §5.3; [8] p. 16');
    if (c && c.caMeq > 0) p((descartada ? 'Haría falta: ' : '') + 'calcio (yeso) para el sodio',
      'Subir el calcio ' + t1(c.caMeq) + ' meq/L lleva la RAS de ' + fmt(r.ras, 1) + ' a ' + fmt(c.rasCorregida, 1) + ' y saca al suelo de la franja severa de infiltración: ' + fmt(c.yesoKgPor100mm, 0) + ' kg de yeso puro por ha cada 100 mm; ' + t1(c.yesoTAno) + ' t/ha con ' + lam + (c.costoYeso != null ? ' (≈ US$ ' + fmt(c.costoYeso, 0) + '/ha por año)' : '') + '. Con yeso de menor pureza, dividir por la pureza (70 % → × 1,43). ' +
      (c.yesoEnAgua ? 'Se puede disolver en el agua de riego (FAO: es raro disolver más de 1 a 4 meq/L).' : 'Conviene aplicarlo al suelo: FAO lo prefiere cuando la CE del agua pasa de 1,0 dS/m o hace falta más de 4 meq/L.') +
      (c.acidoMeq > 0 ? ' Primero el ácido: con el bicarbonato presente el calcio precipita y no sirve.' : '') + (c.caMeqSinRestriccion > c.caMeq ? ' Para dejarlo sin ninguna restricción harían falta ' + t1(c.caMeqSinRestriccion) + ' meq/L.' : ''), '[1] §3.2.1, Tabla 1');
    if (c && c.caMeqSinAcido != null) p((descartada ? 'Haría falta: ' : '') + 'sin ácido: solo yeso (el calcáreo no lo reemplaza)',
      'Si inyectar ácido no es viable, el yeso tiene que cubrir también el bicarbonato en exceso (CSR ' + fmt(r.csr, 2) + ' meq/L), que precipita el calcio agregado como carbonato al concentrarse el agua en el suelo: ' + t1(c.caMeqSinAcido) + ' meq/L de calcio = ' + fmt(c.yesoSinAcidoKgPor100mm, 0) + ' kg de yeso puro por ha cada 100 mm; ' + t1(c.yesoSinAcidoTAno) + ' t/ha con ' + lam + (c.costoYesoSinAcido != null ? ' (≈ US$ ' + fmt(c.costoYesoSinAcido, 0) + '/ha por año)' : '') + '. ' +
      (c.yesoSinAcidoEnAgua ? 'Se puede disolver en el agua de riego (FAO: hasta 1 a 4 meq/L) o aplicar al suelo al voleo en una o dos veces por año (FAO: al suelo van de 5 a 40 t/ha según el caso; más de 10 t/ha por año suele no ser económico).' : 'Es más de lo que se disuelve en el agua (FAO: 1 a 4 meq/L): aplicarlo al suelo al voleo, en una o dos veces por año.') +
      ' El calcáreo (carbonato de calcio) NO reemplaza al yeso: FAO lo lista como enmienda solo para suelos ácidos (Tabla 12); en un suelo neutro o alcalino casi no se disuelve y no aporta calcio. El azufre elemental al suelo sí sirve cuando el suelo tiene calcáreo propio: al oxidarse libera ese calcio (FAO §3.2.1 ii), pero es lento y no va en el agua. Lo decide el análisis de suelo (pH y carbonatos). Es una aproximación: medir el sodio intercambiable (PSI) cada año y ajustar la dosis.', '[1] §3.2.1, Tabla 12; [2] p. 81');
    if (c && c.caMeq === 0 && est.inf === 'cuidado') p('Infiltración', (r.ecw < 0.7 ? 'Agua con muy pocas sales: FAO advierte que puede dispersar la superficie del suelo y bajar la infiltración aunque tenga poco sodio. ' : 'Con este sodio y esta salinidad el riesgo de perder infiltración es ligero a moderado. ') + 'Si se ve encharcamiento o costra, el yeso lo corrige' + (c.caMeqSinRestriccion > 0 ? ': ' + fmt(c.caMeqSinRestriccion, 2) + ' meq/L de calcio (' + fmt(c.caMeqSinRestriccion * YESO_KG_POR_MEQ_1000M3, 0) + ' kg de yeso puro por ha cada 100 mm) lo deja sin restricción' : '') + '; en aguas de baja salinidad el yeso en el agua es particularmente efectivo. Mantener cobertura y rastrojo.', '[1] Tabla 1, §3.2.1');
    var lr = L.cultivos.filter(function (x) { return x.lr != null && x.lr > 0.005; });
    if (lr.length && (est.sal !== 'ok' || L.cultivos.some(function (x) { return x.umbralEcw != null && L.r.ecw > x.umbralEcw; }))) p('Agua extra para lavar las sales',
      'Regar por encima de lo que pide el cultivo: ' + lr.map(function (x) { return x.n.toLowerCase() + ' ' + fmt(x.lr * 100, 0) + ' %'; }).join(', ') + ' (FAO ec. 9 con la tolerancia al ' + lr[0].lrBase + ' del rinde; lámina = ET / (1 − LR), ec. 7). La lluvia que infiltra cuenta como lavado; el suelo tiene que drenar.', '[1] §2.4.2');
    var enHoja = L.cultivos.filter(function (x) { return x.hojaDano; });
    if (L.aspersion && (est.na === 'cuidado' || est.cl === 'cuidado' || est.hco3 === 'cuidado' || est.hco3 === 'grave' || enHoja.length)) p('Manejo del pivot para no quemar hojas',
      (enHoja.length ? 'Con esta agua se quema la hoja de ' + enHoja.map(function (x) { return x.n.toLowerCase(); }).join(', ') + ' si se riega de día. ' : '') + L.cultivos.filter(function (x) { return x.hojaNota; }).map(function (x) { return x.n + ': ' + x.hojaNota + '. '; }).join('') + 'FAO: regar de noche (la humedad sube y el viento baja); evitar horas de viento caliente y seco; usar bajantes (drop) que mojen el suelo y no la hoja; gota más grande; mayor tasa de aplicación para mojar la hoja menos tiempo. El ácido no baja el sodio ni el cloruro: esto solo se maneja con horario y emisores.' + (est.hco3 && est.hco3 !== 'ok' && !(c && c.acidoMeq > 0) ? ' El bicarbonato deja manchas blancas sin ser tóxico; acidificar el agua solo para eso es costoso (FAO lo reserva para cultivos de alto valor).' : ''), '[1] §4.3, §5.3');
    var boro = L.cultivos.filter(function (x) { return x.boroRango && L.r.boro > x.boroRango[0]; });
    if (boro.length) p('Boro', 'En el límite o por encima de lo que toleran: ' + boro.map(function (x) { return x.n.toLowerCase() + ' (' + fmt(x.boroRango[0], 2) + '–' + fmt(x.boroRango[1], 2) + ' mg/L)'; }).join(', ') + '. El boro necesita unas 3 veces más agua de lavado que las sales; preferir cultivos tolerantes.', '[1] §4.2, Tabla 16');
    if (L.noAptos.length || L.alternativos.length) p('Cultivos', (L.noAptos.length ? 'No sirve para: ' + L.noAptos.map(function (x) { return x.n.toLowerCase() + ' (' + x.motivos[0] + ')'; }).join('; ') + '. ' : '') + (L.alternativos.length ? 'Por sales toleran esta agua sin perder rinde: ' + L.alternativos.join(', ').toLowerCase() + ' (revisar también sodio y hoja).' : ''), '[1] Tablas 4, 16, 18');
    if (r.lsi != null && r.lsi > 0) p('Equipo', 'Índice de Langelier ' + fmt(r.lsi, 2) + ': el agua tiende a formar costras de carbonato de calcio en caños y aspersores; el ácido también lo controla.', '[5]');
    if (!descartada) p('Controlar cada año', 'Medir la CE (CEe) y el sodio intercambiable (PSI) del suelo después de cada campaña y repetir el análisis del agua. Si el PSI pasa de 5 % (alerta del INTA) o sigue subiendo, reforzar el yeso y el lavado.', '[10]');
    return out;
  }

  /* ---------- índices de la planilla (hoja Analisis_Agua) con sus clases ----------
     SE y SP: < 3 buena, 3–15 condicionada, > 15 no recomendable (Palacios y Aceves; INIFAP 2009; Ortiz Vega et al. 2019).
       SE según el suelo (Doneen 1958): arcilloso 3 / 5, limoso 5 / 10, arenoso 7 / 15.
     PSP: < 50 % buena, > 50 % condicionada (Valle 1992); no tiene clase "no recomendable".
     Scott (en mg/L, Almeida 2010, Embrapa): > 18 buena, 6–18 tolerable, 1,2–6 mediocre, < 1,2 mala. */
  function texturaDoneen(suelo) {
    if (!suelo) return null;
    var ar = num(suelo.arcilla), li = num(suelo.limo), are = num(suelo.arena);
    if (ar != null && ar >= 40) return 'arcilloso'; if (li != null && li >= 50) return 'limoso'; if (are != null && are >= 70) return 'arenoso';
    return null;
  }
  function claseIndices(r, textura) {
    var lim = { arcilloso: [3, 5], limoso: [5, 10], arenoso: [7, 15] }[textura] || [3, 15];
    var c3 = function (x, l) { return x == null ? null : (x < l[0] ? 'buena' : (x <= l[1] ? 'condicionada' : 'no recomendable')); };
    return {
      se: c3(r.se, lim), seLim: lim, seSuelo: textura || null,
      sp: c3(r.sp, [3, 15]),
      psp: r.psp == null ? null : (r.psp < 50 ? 'buena' : 'condicionada'),
      scott: r.scott == null ? null : (r.scott > 18 ? 'buena' : (r.scott >= 6 ? 'tolerable' : (r.scott >= 1.2 ? 'mediocre' : 'mala')))
    };
  }

  /* ---------- HTML de la lectura ---------- */
  var FUENTES = [
    ['[1]', 'FAO, Riego y Drenaje 29 Rev. 1: Calidad del agua para la agricultura (Ayers y Westcot, 1985)', 'https://www.fao.org/3/t0234e/T0234E00.htm'],
    ['[2]', 'USDA, Agriculture Handbook 60, cap. 5: Calidad del agua de riego (Richards, 1954)', 'https://www.ars.usda.gov/ARSUserFiles/20360500/hb60_pdf/hb60ch5.pdf'],
    ['[3]', 'Salinidad efectiva y potencial, PSP: Palacios y Aceves (1970), Doneen (1958); INIFAP Folleto Técnico 66 (2009); Ortiz Vega et al., Terra Latinoamericana 37(2), 2019', 'https://www.redalyc.org/journal/573/57363012009/html/'],
    ['[4]', 'Índice de Scott en mg/L: Almeida, Qualidade da água de irrigação, Embrapa Mandioca e Fruticultura (2010)', 'https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/875385/1/livroqualidadeagua.pdf'],
    ['[5]', 'Índice de saturación de Langelier, fórmula de Carrier (1965)', ''],
    ['[6]', 'Control del análisis: Standard Methods 1030 E y Hem (1992), según NDEP (2009)', 'https://ndep.nv.gov/uploads/documents/2009-cation-anion-balance-guide.pdf'],
    ['[7]', 'Texas A&M AgriLife, EB-1667: Irrigation Water Quality Standards and Salinity Management (Fipps)', 'https://gfipps.tamu.edu/files/2021/11/EB-1667-Salinity.pdf'],
    ['[8]', 'PNW 597: Managing Irrigation Water Quality (Oregon State, U. of Idaho, Washington State, 2007)', 'https://pws.byu.edu/https:/brightspotcdn.byu.edu/4b/6f/c34da4954078a51620833c51773d/managing-irrigation-water-quality.pdf'],
    ['[9]', 'Texas Water Development Board: Cost of Brackish Groundwater Desalination in Texas (2012)', 'https://www.twdb.texas.gov/innovativewater/desal/doc/Cost_of_Desalination_in_Texas_rev.pdf'],
    ['[10]', 'INTA (IPG 1999) en Torres Duggan et al., Informaciones Agronómicas de Hispanoamérica 25 (2017); INTA EEA San Pedro (2016)', 'https://fertilizar.org.ar/wp-content/uploads/2021/09/17-1.pdf'],
    ['[11]', 'Colorado State University Extension, Fact Sheet 0.506: Irrigation Water Quality Criteria', 'https://www.extension.colostate.edu/docs/pubs/crops/00506.pdf']
  ];
  function tarjeta(a, opciones) {
    opciones = opciones || {};
    var L = interpretar(a, opciones), r = L.r, sem = SEM[L.veredicto.k] || SEM.sin, c = L.correccion;
    var h = '<div style="border:1px solid #E1E4E7;border-left:5px solid ' + sem.c + ';border-radius:10px;padding:12px 16px;background:#fff;margin-bottom:12px;">' +
      '<div style="font-size:18px;font-weight:800;color:' + sem.c + ';">' + esc(L.veredicto.titulo) + '</div>' +
      (L.veredicto.motivos ? '<ul style="margin:6px 0 0 18px;padding:0;font-size:13px;color:#41464B;">' + L.veredicto.motivos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (L.controlFalla ? '<div style="font-size:13px;color:#41464B;margin-top:4px;">Ojo: el análisis no pasa el control de calidad; confirmarlo antes de decidir.</div>' : '')
        : '<div style="font-size:13px;color:#41464B;margin-top:4px;">' + esc(L.veredicto.detalle) + '</div>') +
      '<div class="muted" style="font-size:11.5px;margin-top:6px;">' + (L.aspersion ? 'Evaluado para pivot / aspersión (el agua moja la hoja)' : 'Evaluado para riego que no moja la hoja (goteo o superficie)') + ' · cultivos: ' + (L.cultivos.map(function (x) { return x.n; }).join(', ') || '—') + ' · riego ' + fmt(L.lamina, 0) + ' mm por año' + (L.laminaSupuesta ? ' (supuesto)' : '') + '.</div></div>';
    if (L.control.length) h += '<div class="note warn" style="margin-bottom:12px;">' + L.control.map(esc).join('<br>') + '</div>';
    // 1) el plan: lo primero que se lee
    if (L.plan.length) h += '<h3 style="font-size:14px;margin:4px 0 6px;">' + (L.veredicto.k === 'grave' ? 'Por qué se descarta y qué haría falta para usarla igual' : (L.veredicto.k === 'ok' ? 'Buenas prácticas' : 'Plan paso a paso para usar esta agua')) + '</h3><ol style="margin:0 0 12px 18px;padding:0;font-size:13px;line-height:1.55;">' +
      L.plan.map(function (x) { return '<li style="margin-bottom:4px;"><b>' + esc(x.t) + ':</b> ' + esc(x.d) + (x.f ? ' <span class="muted">' + esc(x.f) + '</span>' : '') + '</li>'; }).join('') + '</ol>';
    // 2) lo que se mide
    h += '<div class="tablescroll"><table class="tbl"><thead><tr><th>Lo que se mide</th><th class="r">Valor</th><th></th><th>Qué significa</th></tr></thead><tbody>' + L.items.map(function (i) {
      var s = SEM[i.estado] || SEM.sin, val = typeof i.valor === 'number' ? fmt(i.valor, i.k === 'sal' ? 0 : (i.k === 'b' || i.k === 'csr' || i.k === 'ldp' || i.k === 'ph' ? 2 : 1)) + (i.unidad ? ' <span class="sub">' + esc(i.unidad) + '</span>' : '') : esc(i.valor);
      return '<tr><td><b>' + esc(i.n) + '</b></td><td class="r" style="white-space:nowrap;">' + val + '</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + s.c + ';" title="' + s.t + '"></span></td><td style="font-size:12.5px;white-space:normal;min-width:260px;">' + esc(i.texto) + ' <span class="muted">' + esc(i.fuente) + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
    // 3) diagrama y cultivos
    h += '<div style="display:grid;grid-template-columns:minmax(0,520px) minmax(0,1fr);gap:18px;align-items:start;margin-top:14px;" class="ca-grid">';
    h += '<div><div style="font-weight:700;font-size:13px;margin-bottom:4px;">Diagrama de clasificación (Riverside) · ' + (r.clase ? esc(r.clase.txt) : 'sin datos') + '</div>' + svgDiagrama(r.ce, r.ras) + '<div class="muted" style="font-size:11px;">USDA Handbook 60, Figura 25 [2]</div></div>';
    h += '<div>';
    if (L.cultivos.length) h += '<div style="font-weight:700;font-size:13px;margin-bottom:4px;">Cultivos con esta agua</div><div class="tablescroll"><style>.ca-cult th,.ca-cult td{padding:7px 8px !important;white-space:normal;line-height:1.25;}</style><table class="tbl ca-cult" style="font-size:12px;"><thead><tr><th>Cultivo</th><th class="r">Rinde por sales</th><th class="r">Agua extra</th>' + (L.aspersion ? '<th class="r">Hoja con pivot</th>' : '') + '<th class="r">Boro</th></tr></thead><tbody>' + L.cultivos.map(function (x) {
      var s = SEM[x.estado] || SEM.sin;
      var hoja = x.hojaUmbral == null ? '<span class="sub">sin dato FAO</span>' : (x.hojaDano ? '<b style="color:#B8731A;">se quema de día</b>' : 'sin daño') + '<div class="sub">daño desde ' + (x.hojaUmbral === 3 ? '< 5' : x.hojaUmbral) + ' meq/L</div>';
      var boro = !x.boroRango ? '<span class="sub">sin dato FAO</span>' : fmt(x.boroRango[0], 2) + '–' + fmt(x.boroRango[1], 2) + ' <span class="sub">mg/L</span>';
      return '<tr><td><b style="color:' + s.c + ';">' + esc(x.n) + '</b>' + (x.clase ? '<div class="sub">' + esc(x.clase) + ' (FAO Tabla 5)</div>' : '') + '</td>' +
        '<td class="r">' + (x.potencial ? '<b>' + esc(x.potencial) + '</b><div class="sub">aguanta ' + fmt(x.umbralEcw, 1) + ' dS/m</div>' : '<span class="sub">sin dato</span>') + '</td>' +
        '<td class="r">' + (x.lr != null ? fmt(x.lr * 100, 0) + ' %' : '—') + '</td>' + (L.aspersion ? '<td class="r">' + hoja + '</td>' : '') + '<td class="r">' + boro + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="muted" style="font-size:11px;margin-top:4px;">FAO 29: Tabla 4 (sales), ec. 9 (agua extra de lavado), Tabla 18 (hoja con aspersión, riego de día en verano), Tabla 16 (boro que tolera sin perder rinde) [1].</div>' +
      (L.items.some(function (i) { return i.k === 'inf' && i.estado === 'grave'; }) ? '<div style="font-size:12px;color:#C0392B;margin-top:4px;"><b>Ojo:</b> el rinde por sales no cuenta el sodio. Con este sodio el suelo se sella y el agua no infiltra: el rinde no llega hasta corregirlo.</div>' : '');
    h += '</div></div>';
    // 4) cuánto costaría corregirla
    if (c && (c.acidoMeq > 0 || c.caMeq > 0 || c.caMeq == null)) {
      h += '<h3 style="font-size:14px;margin:14px 0 6px;">Corrección del agua: cantidades' + (c.costoYeso != null || c.costoAcido != null ? ' y costo' : '') + '</h3><div class="tablescroll"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Dosis en el agua</th><th class="r">Cada 100 mm por ha</th><th class="r">Por año (' + fmt(L.lamina, 0) + ' mm)</th><th class="r">Costo por año</th></tr></thead><tbody>' +
        (c.acidoMeq > 0 ? '<tr><td>Ácido sulfúrico (puro) para el bicarbonato</td><td class="r">' + fmt(c.acidoMeq, 2) + ' meq/L</td><td class="r">' + fmt(c.acidoKgPor100mm, 0) + ' kg</td><td class="r">' + fmt(c.acidoTAno, 2) + ' t/ha</td><td class="r">' + (c.costoAcido != null ? 'US$ ' + fmt(c.costoAcido, 0) + '/ha' : '<span class="sub">cargar precio</span>') + '</td></tr>' : '') +
        (c.caMeq == null ? '<tr><td>Yeso para el sodio</td><td class="r" colspan="4">ni con 60 meq/L de calcio sale de la franja severa</td></tr>' : (c.caMeq > 0 ? '<tr><td>Yeso (100 %) para el sodio</td><td class="r">' + fmt(c.caMeq, 2) + ' meq/L de Ca</td><td class="r">' + fmt(c.yesoKgPor100mm, 0) + ' kg</td><td class="r">' + fmt(c.yesoTAno, 2) + ' t/ha</td><td class="r">' + (c.costoYeso != null ? 'US$ ' + fmt(c.costoYeso, 0) + '/ha' : '<span class="sub">cargar precio</span>') + '</td></tr>' : '')) +
        (c.caMeqSinAcido != null ? '<tr><td>Yeso (100 %) sin ácido: cubre el sodio y el bicarbonato (CSR)</td><td class="r">' + fmt(c.caMeqSinAcido, 2) + ' meq/L de Ca</td><td class="r">' + fmt(c.yesoSinAcidoKgPor100mm, 0) + ' kg</td><td class="r">' + fmt(c.yesoSinAcidoTAno, 2) + ' t/ha</td><td class="r">' + (c.costoYesoSinAcido != null ? 'US$ ' + fmt(c.costoYesoSinAcido, 0) + '/ha' : '<span class="sub">cargar precio</span>') + '</td></tr>' : '') +
        '</tbody></table></div><div class="muted" style="font-size:11px;margin-top:4px;">Ácido al 90 % del bicarbonato + el carbonato (FAO §5.3); 49 kg de ácido puro por meq/L cada 1000 m³. Yeso: 86 kg de yeso puro por meq/L de calcio cada 1000 m³ (FAO §3.2.1), para salir de la franja severa de la Tabla 1 (se estima que la CE sube 0,1 dS/m por meq/L, USDA Manual 60 p. 79). 100 mm en 1 ha = 1000 m³. Precios: Datos → Precios.' + (L.laminaSupuesta ? ' Riego por año supuesto en 500 mm: cargá el riego previsto en el formulario del análisis.' : '') + '</div>';
    }
    // 5) índices de la planilla
    var ci = claseIndices(r, opciones.textura || null);
    var fila = function (n, val, u, ref) { return '<tr><td>' + n + '</td><td class="r">' + val + (u ? ' <span class="sub">' + u + '</span>' : '') + '</td><td style="font-size:12px;">' + ref + '</td></tr>'; };
    h += '<h3 style="font-size:14px;margin:14px 0 6px;">Índices de salinidad (hoja Analisis_Agua)</h3><div class="tablescroll"><table class="tbl"><thead><tr><th>Índice</th><th class="r">Valor</th><th>Clase y referencia</th></tr></thead><tbody>' +
      fila('RAS (relación de adsorción de sodio)', fmt(r.ras, 2), '', 'Na / √((Ca+Mg)/2)') +
      fila('Salinidad efectiva (SE)', fmt(r.se, 2), 'meq/L', (ci.se ? '<b>' + ci.se + '</b> (< ' + ci.seLim[0] + ' buena · ' + ci.seLim[0] + '–' + ci.seLim[1] + ' condicionada · > ' + ci.seLim[1] + ' no recomendable' + (ci.seSuelo ? ', suelo ' + ci.seSuelo + ' según Doneen' : '') + ') · ' : '') + esc(r.seCaso || '') + ' [3]') +
      fila('Salinidad potencial (SP)', fmt(r.sp, 2), 'meq/L', (ci.sp ? '<b>' + ci.sp + '</b> (< 3 buena · 3–15 condicionada · > 15 no recomendable) · ' : '') + 'Cl + ½ SO₄ [3]') +
      fila('Porcentaje de sodio posible (PSP)', fmt(r.psp, 1), '%', (ci.psp ? '<b>' + ci.psp + '</b> (< 50 % buena · > 50 % condicionada) · ' : '') + 'Na / SE × 100 [3]') +
      fila('Carbonato de sodio residual (CSR)', fmt(r.csr, 2), 'meq/L', '< 1,25 seguro · 1,25–2,5 marginal · > 2,5 no apto [2] (igual en INTA y Embrapa)') +
      fila('Índice de Scott (K)', fmt(r.scott, 1), '', (ci.scott ? '<b>' + ci.scott + '</b> (> 18 buena · 6–18 tolerable · 1,2–6 mediocre · < 1,2 mala) · ' : '') + esc(r.scottCaso || '') + ', en mg/L [4]') +
      fila('Índice de saturación de Langelier', fmt(r.lsi, 2), '', r.lsi != null ? (r.lsi > 0 ? 'tiende a incrustar carbonato de calcio' : 'tiende a disolver (corrosiva)') + ' · pHs ' + fmt(r.phs, 2) + ' a ' + fmt(r.temperatura, 0) + ' °C [5]' : 'faltan pH, calcio o alcalinidad') +
      fila('Sólidos disueltos (TDS)', fmt(r.tds, 0), 'mg/L', 'estimado CE × 0,64 [1]' + (r.tdsMedido != null ? ' · medido ' + fmt(r.tdsMedido, 0) + ' mg/L' : '')) +
      fila('Suma de cationes / aniones', fmt(r.cationes, 2) + ' / ' + fmt(r.aniones, 2), 'meq/L', r.balance != null ? 'diferencia ' + fmt(Math.abs(r.balance), 1) + ' % (Standard Methods 1030 E: hasta 2 % con 3–10 meq/L de aniones, hasta 5 % con más) [6]' : '') +
      '</tbody></table></div>';
    // 6) datos del laboratorio y conversión
    h += '<div class="tablescroll" style="margin-top:10px;"><table class="tbl"><thead><tr><th>Parámetro</th><th class="r">Informe del laboratorio</th><th>Conversión</th><th class="r">Para el cálculo</th></tr></thead><tbody>' + FILAS.filter(function (f) { return tiene(a, f.k) || (a.lab && a.lab[f.k]); }).map(function (f) {
      var l = a.lab && a.lab[f.k], cv = l ? convertir(f.k, l.valor, l.unidad) : null;
      return '<tr><td>' + f.n + '</td><td class="r">' + (l ? f2(l.valor, 3) + ' <span class="sub">' + esc(UNIDADES[l.unidad] || l.unidad) + '</span>' : '<span class="sub">cargado en ' + f.destino + '</span>') + '</td><td class="sub">' + (cv ? esc(cv.regla) : '') + '</td><td class="r"><b>' + (num(a[f.k]) == null ? '—' : f2(num(a[f.k]), f.k === 'ce' ? 0 : 3)) + '</b> <span class="sub">' + f.destino + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
    // 7) supuestos y fuentes
    h += '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5;"><b>Cómo leer las guías de FAO:</b> suponen clima semiárido, suelo franco arenoso a franco arcilloso con buen drenaje, sin napa a menos de 2 m y al menos 15 % de lavado; con lluvias altas son más estrictas de lo necesario, y "una restricción de uso no significa que el agua no sirva". Cambios de 10–20 % alrededor de un valor guía tienen poca importancia [1, supuestos de la Tabla 1]. La decisión final se valida con el análisis del suelo y, en proyectos grandes con agua en la franja severa, con un ensayo a campo [1, §1.4].<br>' +
      FUENTES.map(function (x) { return x[0] + ' ' + esc(x[1]) + (x[2] ? ' — <a href="' + x[2] + '" target="_blank" rel="noopener">' + esc(x[2].replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a>' : ''); }).join('<br>') + '</div>';
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
  function sueloDelCampo() { var c = B().campoActual(); if (!c) return null; return B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(c.id) && (num(a.arcilla) != null || num(a.arena) != null); }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).pop() || null; }
  function opcionesDe(item) { return { aspersion: esAspersion(item), cultivos: cultivosDelCampo(), sueloFino: sueloFino(), textura: texturaDoneen(sueloDelCampo()), laminaMm: item && item.laminaAnualMm }; }

  /* ---------- formulario ---------- */
  var CAMPOS_IONES = ['na', 'k', 'ca', 'mg', 'nh4', 'cl', 'so4', 'co3', 'hco3', 'no3', 'po4'];
  function abrirForm() { $('formAgua').classList.add('visible'); llenarLotes(); }
  function cerrarForm() {
    $('formAgua').classList.remove('visible'); editandoId = null; muestrasIA = null;
    ['agFecha', 'agFuenteNombre', 'agLab', 'agInforme', 'agPh', 'agTds', 'agTemp', 'agLamina', 'agObs', 'agArchivo'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    limpiarGrilla('ag');
    $('agFuente').value = 'Pozo'; $('agArchivoActual').textContent = ''; $('muestrasAguaIA').innerHTML = '';
    $('tituloFormAgua').textContent = 'Nuevo análisis de agua';
  }
  function llenarLotes() { var s = $('agEquipo'), v0 = s.value; s.innerHTML = '<option value="">Toda la estancia</option>' + lotesDelCampo().map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join(''); s.value = v0; }
  function volcar(a) {
    if (a.fecha) $('agFecha').value = String(a.fecha).slice(0, 10);
    if (a.fuente) { var f = $('agFuente'); if (![].some.call(f.options, function (o) { return o.value === a.fuente; })) f.insertAdjacentHTML('beforeend', '<option>' + esc(a.fuente) + '</option>'); f.value = a.fuente; }
    if (a.fuenteNombre != null) $('agFuenteNombre').value = a.fuenteNombre || '';
    if (a.laboratorio != null) $('agLab').value = a.laboratorio || '';
    if (a.informe != null) $('agInforme').value = a.informe || '';
    ponerGrilla('ag', a);
    [['ph', 'agPh'], ['tds', 'agTds'], ['temperatura', 'agTemp'], ['laminaAnualMm', 'agLamina']].forEach(function (p) { var x = num(a[p[0]]); $(p[1]).value = x == null ? '' : x; });
    if (a.observaciones) $('agObs').value = a.observaciones;
  }
  function leerForm() {
    var g = leerGrilla('ag'), item = { fecha: $('agFecha').value || null, equipoId: $('agEquipo').value || null, fuente: $('agFuente').value, fuenteNombre: $('agFuenteNombre').value.trim(), laboratorio: $('agLab').value.trim(), informe: $('agInforme').value.trim(), observaciones: $('agObs').value.trim() };
    FILAS.forEach(function (f) { item[f.k] = g.vals[f.k] == null ? null : g.vals[f.k]; });
    item.lab = g.lab;
    item.ph = num($('agPh').value); item.tds = num($('agTds').value); item.temperatura = num($('agTemp').value); item.laminaAnualMm = num($('agLamina').value);
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
    var archivo = $('agArchivo').files && $('agArchivo').files[0];
    var pre = archivo && window.safiaSupabase ? window.safiaSupabase.storage.from('safia').upload('campo_' + c.id + '/agua/' + Date.now() + '_' + limpiarNombre(archivo.name), archivo, { upsert: false }).then(function (r) { if (r.error) throw r.error; item.archivoRuta = r.data && r.data.path ? r.data.path : null; item.archivoNombre = archivo.name; }).catch(function (e) { console.error(e); B().toast('El archivo no se pudo subir; el análisis se guarda igual', true); }) : Promise.resolve();
    pre.then(function () { guardarItem(item); B().toast('Análisis de agua guardado'); cerrarForm(); pintar(item.id); });
  }
  function leerConIA() {
    var archivo = $('agArchivo').files && $('agArchivo').files[0], hint = $('leerAguaHint'), boton = $('btnLeerAguaIA');
    if (!archivo) { B().toast('Primero elegí la foto o el PDF del laboratorio', true); return; }
    if (!window.safiaSupabase) { B().toast('Sin conexión a internet', true); return; }
    var cS = B() && B().campoActual ? B().campoActual() : null; if (window.SafiaSuscripcion && cS && !SafiaSuscripcion.puedeCargarCampo(cS.id)) { B().toast('La suscripción de este campo está vencida: podés ver lo cargado, pero para leer y cargar análisis nuevos hay que renovarla con Irrigar.', true); return; }
    var esPdf = /pdf$/i.test(archivo.type) || /\.pdf$/i.test(archivo.name);
    boton.disabled = true; boton.textContent = 'Leyendo…'; hint.textContent = 'Leyendo el análisis de agua con IA, esto tarda unos segundos…';
    (esPdf ? archivoABase64(archivo) : comprimirImagen(archivo, 2000, 0.85)).then(function (b64) {
      return window.safiaSupabase.functions.invoke('safia-leer-analisis', { body: { mime: esPdf ? 'application/pdf' : 'image/jpeg', data_base64: b64, tipo: 'agua' } });
    }).then(function (r) {
      if (r.error) throw r.error;
      var muestras = ((r.data && r.data.muestras) || []).map(desdeIA);
      if (!muestras.length) throw new Error('La IA no encontró valores de análisis de agua en el archivo');
      muestrasIA = muestras; volcar(muestras[0]); mostrarMuestras(muestras);
      var dud = muestras[0].unidadesDudosas;
      hint.textContent = (muestras.length > 1 ? 'El informe tiene ' + muestras.length + ' muestras: elegí cuál revisar y guardá una por una. ' : '') + 'Valores cargados tal cual el laboratorio, con su unidad; SAFIA los convierte en cada línea. Revisalos contra el PDF antes de guardar.' + (dud ? ' Ojo: revisá la unidad de ' + dud.join(', ') + ' (marcada en rojo).' : '');
      B().toast('Análisis de agua leído: revisá los valores');
    }).catch(function (e) {
      console.error(e);
      var explicar = function (msg) { hint.textContent = 'No se pudo leer automáticamente' + (msg ? ': ' + msg : '') + '. Cargá los valores a mano (el archivo igual se guarda).'; B().toast('No se pudo leer con IA' + (msg ? ': ' + msg : ''), true); };
      if (e && e.context && typeof e.context.json === 'function') e.context.json().then(function (j) { explicar((j && (j.error + (j.detalle ? ' · ' + j.detalle : ''))) || e.message); }).catch(function () { explicar(e.message); });
      else explicar((e && e.message) || '');
    }).finally(function () { boton.disabled = false; boton.textContent = 'Leer análisis de agua con IA y completar solo'; });
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
    $('agEquipo').value = a.equipoId ? String(a.equipoId) : '';
    volcar(a);
    $('agArchivoActual').textContent = a.archivoNombre ? 'Actual: ' + a.archivoNombre + ' (subí otro para reemplazar)' : '';
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
    var cont = $('listaAgua'), lect = $('lecturaAgua'), vacio = $('vacioCalidadAgua'); if (!cont) return;
    var l = lista();
    if (!l.length) { cont.innerHTML = ''; lect.innerHTML = ''; vacio.style.display = 'block'; return; }
    vacio.style.display = 'none';
    cont.innerHTML = '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Fecha</th><th>Fuente</th><th>Lote</th><th class="r">CE <span style="text-transform:none;">µS/cm</span></th><th class="r">RAS</th><th class="r">pH</th><th>Clase</th><th>¿Se puede regar?</th><th></th></tr></thead><tbody>' +
      l.slice().reverse().map(function (a) {
        var L = interpretar(a, opcionesDe(a)), s = SEM[L.veredicto.k] || SEM.sin;
        return '<tr data-id="' + esc(a.id) + '"><td>' + fmtF(a.fecha) + '</td><td>' + esc(nombreFuente(a)) + '</td><td>' + esc(nombreLote(a.equipoId)) + '</td><td class="r">' + fmt(num(a.ce), 0) + '</td><td class="r">' + fmt(L.r.ras, 1) + '</td><td class="r">' + fmt(num(a.ph), 2) + '</td><td>' + (L.r.clase ? esc(L.r.clase.txt) : '—') + '</td>' +
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
      $('agGrilla').innerHTML = grillaHTML('ag'); conectarGrilla('ag'); limpiarGrilla('ag');
      $('btnNuevoAgua').addEventListener('click', function () { cerrarForm(); abrirForm(); });
      $('btnCancelarAgua').addEventListener('click', cerrarForm);
      $('btnGuardarAgua').addEventListener('click', guardar);
      $('btnLeerAguaIA').addEventListener('click', leerConIA);
    }
    llenarLotes(); pintar();
  }
  function alCambiarCampo() { if (iniciado) { cerrarForm(); if ($('panel-calidadAgua').classList.contains('on')) activar(); } }
  function ultimoDelCampo(campoId) { var l = B() ? B().leer('analisis_agua').filter(function (a) { return String(a.campoId) === String(campoId); }).sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); }) : []; return l.length ? l[l.length - 1] : null; }

  window.SafiaCalidadAgua = { activar: activar, alCambiarCampo: alCambiarCampo, calcular: calcular, interpretar: interpretar, claseUSSL: claseUSSL, svgDiagrama: svgDiagrama, tarjeta: tarjeta, CULTIVOS: CULTIVOS, IONES: IONES, ultimoDelCampo: ultimoDelCampo, lista: lista, desdeIA: desdeIA, opcionesDe: opcionesDe,
    UNIDADES: UNIDADES, FILAS: FILAS, correccion: correccion, evaluarCultivo: evaluarCultivo, texturaDoneen: texturaDoneen, claseIndices: claseIndices, FUENTES: FUENTES, convertir: convertir, codigoUnidad: codigoUnidad, grillaHTML: grillaHTML, conectarGrilla: conectarGrilla, ponerGrilla: ponerGrilla, limpiarGrilla: limpiarGrilla, leerGrilla: leerGrilla };
})();
