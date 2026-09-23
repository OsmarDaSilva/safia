/* SAFIA — Análisis foliar (Banco Agronómico → pestaña "Análisis foliar")
   -------------------------------------------------------------------
   El análisis de suelo dice qué hay disponible; la hoja dice qué absorbió
   de verdad la planta. Este módulo carga análisis foliares (a mano o
   leyendo el PDF del laboratorio con IA), los interpreta contra los rangos
   de suficiencia de Embrapa / Fertilizar, los cruza con el último análisis
   de suelo del lote (¿falta en el suelo o la planta no lo toma?) y lee el
   clorofilómetro (SPAD) como índice de suficiencia de nitrógeno.

   Unidades: macronutrientes en g/kg (% × 10), micronutrientes en mg/kg (ppm).

   Fuentes (números entre corchetes en pantalla):
   [1] Embrapa Soja (1998), Tecnologias de Produção de Soja, tabla de
       interpretación foliar reproducida por Embrapa (2020, Recomendações de
       calagem e adubação, cap. 5 Veloso et al.) y por Fertilizar/INTA:
       N 45–55 g/kg, P 2,6–5,0, K 17–25, Ca 3,6–20, Mg 2,6–10, S 2,1–4,0;
       B 21–55 mg/kg, Cu 10–30, Fe 51–350, Mn 21–100, Mo 1–5, Zn 21–50.
       Muestreo: 3er trifolio desarrollado desde el ápice, con pecíolo, en
       plena floración (R2), 30 plantas por lote.
   [2] Harger, Kurihara (Embrapa Agropecuária Oeste), Oliveira (Embrapa
       Soja) & Ralisch: faixas de suficiência por DRIS en 194 lotes de soja
       en siembra directa sobre basalto (PR), trifolio sin pecíolo:
       N 50,7–61,4, P 2,8–4,2, K 17,6–24,3, Ca 7,3–10,4, Mg 3,6–4,9,
       S 2,7–4,0; B 49–55, Cu 9–14, Fe 137–229, Mn 48–108, Zn 25–40.
   [3] Flannery (1989, citado por Fertilizar/INTA): hoja de un lote de
       7.963 kg/ha: N 53,3, P 3,6, K 21,9, Ca 10,2, Mg 3,3, S 2,4; B 46,
       Cu 12, Fe 144, Mn 30, Zn 48. Martins (1998, Cerrados > 3.600 kg/ha):
       N 46,4, P 2,5, K 18,7, Ca 7,9, Mg 3,3, S 2,5; B 51, Cu 8, Mn 35, Zn 45.
   [4] Embrapa (2020), Recomendações de calagem e adubação, cap. 5 (Veloso
       et al., a partir de Raij 1991/1996 y Malavolta 1997): maíz (hoja
       opuesta y abajo de la espiga, tercio central, al aparecer los
       estigmas): N 27–35, P 2–4, K 17–35, Ca 2,5–8, Mg 1,5–5, S 1,5–3;
       B 10–25, Cu 6–20, Fe 30–250, Mn 20–200, Mo 0,1–0,2, Zn 15–100.
       Girasol: N 33–35, P 4–7, K 20–24, Ca 17–22, Mg 9–11, S 5–7; B 35–100,
       Cu 25–100, Fe 80–120, Mn 10–20, Zn 30–80. Sorgo (hoja +4 en
       embuchamiento): N 25–35, P 2–4, K 14–25, Ca 2,5–6, Mg 1,5–5,
       S 1,5–3; B 4–20, Cu 5–20, Fe 65–100, Mn 10–190, Zn 15–50.
   [5] Fertilizar AC / INTA, Correndo & García (2016) "Métodos de
       diagnóstico nutricional en cultivos extensivos en Argentina",
       Tabla 2 (rangos de suficiencia en % y ppm): trigo emergencia–
       macollaje y encañazón–floración, maíz V3–V4 y floración, soja
       floración.
   [6] Embrapa Trigo, "Fertilidade do solo e a cultura do trigo no Brasil",
       Tablas 10 y 11: planta entera al inicio del alargamiento del tallo
       (N 3,5–5,0 %, P 0,3–0,5, K 2,0–3,0, Ca 0,2–0,5, Mg 0,2–0,5,
       S 0,2–0,5; Cu 6, B 6, Zn 30, Fe 40, Mn 40 mg/kg) y al inicio del
       espigamiento (N 2,0–3,0 %, P 0,3–0,5, K 1,5–3,0, Ca 0,2–0,5,
       Mg 0,15–0,5, S 0,15–0,4; Cu 5–15, B 6–12, Zn 25–70, Fe 25–100,
       Mn 25–100, Mo 0,1–0,3).
   [7] INTA Balcarce (Sainz Rozas, Reussi Calvo & Barbieri, Ciencia del
       Suelo 2019): 14 ensayos de maíz en siembra directa; el índice de
       suficiencia de N (ISN = SPAD del lote / SPAD de una franja sin
       limitación de N) en V6–V10 predice la dosis óptima: ISN ≈ 0,97–0,98
       cuando no falta N; por debajo de 0,95 conviene fertilizar.
   [8] Embrapa Soja (Hungria, Campo, Franchini & Loureiro 2001, Comunicado
       Técnico 75) y Embrapa Cerrados (Mendes et al. 2008, PAB): 9 + 15
       ensayos; el N en la siembra (30–100 kg) redujo la nodulación 20–86 %
       y 50 kg de N en R1 o R5 no aumentaron el rinde; en el Cerrado hubo
       respuesta solo en 2 de 15 ensayos (+154–216 kg/ha) sin retorno
       económico. Recomendación oficial: no aplicar N a la soja en ningún
       estadio; inocular bien.
   [9] Embrapa Cerrados (micronutrientes): Mn foliar 350 g/ha; B, Cu, Zn
       al suelo cada 4–5 años (ver safia-agronomia.js [8]).
   Datos: colección `analisis_foliar` (tabla safia_foliar). Depende de
   window.SafiaBanco (Banco e informe). */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var iniciado = false, editandoId = null, muestrasIA = null;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function claveCultivo(c) { var n = norm(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }

  /* ---------- nutrientes y rangos ---------- */
  var NUTRIENTES = [
    { k: 'n',  n: 'Nitrógeno (N)',  u: 'g/kg',  rol: 'proteína, clorofila y crecimiento; en soja lo aporta la fijación biológica' },
    { k: 'p',  n: 'Fósforo (P)',    u: 'g/kg',  rol: 'energía, raíz, floración y llenado' },
    { k: 'k',  n: 'Potasio (K)',    u: 'g/kg',  rol: 'agua en la planta, llenado de grano, sanidad y tolerancia a sequía' },
    { k: 'ca', n: 'Calcio (Ca)',    u: 'g/kg',  rol: 'paredes celulares, raíz y cuaje' },
    { k: 'mg', n: 'Magnesio (Mg)',  u: 'g/kg',  rol: 'centro de la clorofila: sin Mg no hay fotosíntesis' },
    { k: 's',  n: 'Azufre (S)',     u: 'g/kg',  rol: 'proteínas y aceite del grano; fijación de N' },
    { k: 'b',  n: 'Boro (B)',       u: 'mg/kg', rol: 'floración, cuaje, nodulación y crecimiento de puntas' },
    { k: 'cu', n: 'Cobre (Cu)',     u: 'mg/kg', rol: 'lignificación, sanidad y fotosíntesis' },
    { k: 'fe', n: 'Hierro (Fe)',    u: 'mg/kg', rol: 'clorofila y respiración; se bloquea con pH alto' },
    { k: 'mn', n: 'Manganeso (Mn)', u: 'mg/kg', rol: 'fotosíntesis y sanidad; se bloquea con pH alto o glifosato' },
    { k: 'mo', n: 'Molibdeno (Mo)', u: 'mg/kg', rol: 'nitrogenasa del rizobio y nitrato-reductasa' },
    { k: 'zn', n: 'Zinc (Zn)',      u: 'mg/kg', rol: 'hormonas de crecimiento y llenado; antagonismo con P alto' }
  ];
  // Rangos adecuados por cultivo y estadio: [mín, máx] (null = sin dato). Macros g/kg, micros mg/kg.
  var RANGOS = {
    soja: {
      floracion: { n: [45, 55], p: [2.6, 5.0], k: [17, 25], ca: [3.6, 20], mg: [2.6, 10], s: [2.1, 4.0], b: [21, 55], cu: [10, 30], fe: [51, 350], mn: [21, 100], mo: [1, 5], zn: [21, 50], fuente: '[1]',
        altoRinde: { n: [50.7, 61.4], p: [2.8, 4.2], k: [17.6, 24.3], ca: [7.3, 10.4], mg: [3.6, 4.9], s: [2.7, 4.0], b: [49, 55], cu: [9, 14], fe: [137, 229], mn: [48, 108], zn: [25, 40], fuente: '[2]' },
        campeon: { n: 53.3, p: 3.6, k: 21.9, ca: 10.2, mg: 3.3, s: 2.4, b: 46, cu: 12, fe: 144, mn: 30, zn: 48, fuente: '[3]', nota: 'lote de 7.963 kg/ha (Flannery 1989)' } }
    },
    maiz: {
      floracion: { n: [27, 35], p: [2, 4], k: [17, 35], ca: [2.5, 8], mg: [1.5, 5], s: [1.5, 3], b: [10, 25], cu: [6, 20], fe: [30, 250], mn: [20, 200], mo: [0.1, 0.2], zn: [15, 100], fuente: '[4]' },
      v3v4:      { n: [30, 50], p: [3, 8], k: [20, 50], ca: [2.5, 16], mg: [3, 8], s: [1.5, 4], b: [5, 25], cu: [5, 25], fe: [30, 300], mn: [20, 160], mo: [0.1, 2], zn: [20, 50], fuente: '[5]' }
    },
    trigo: {
      macollaje:    { n: [40, 50], p: [2, 5], k: [25, 50], ca: [2, 10], mg: [1.4, 10], s: [1.5, 6.5], b: [1.5, 40], cu: [4.5, 15], fe: [30, 200], mn: [20, 150], mo: [0.1, 2], zn: [18, 70], fuente: '[5]' },
      alongamiento: { n: [35, 50], p: [3, 5], k: [20, 30], ca: [2, 5], mg: [2, 5], s: [2, 5], b: [6, null], cu: [6, null], fe: [40, null], mn: [40, null], mo: [0.3, null], zn: [30, null], fuente: '[6]' },
      espigamiento: { n: [20, 30], p: [3, 5], k: [15, 30], ca: [2, 5], mg: [1.5, 5], s: [1.5, 4], b: [6, 12], cu: [5, 15], fe: [25, 100], mn: [25, 100], mo: [0.1, 0.3], zn: [25, 70], fuente: '[6]' }
    },
    girasol: { floracion: { n: [33, 35], p: [4, 7], k: [20, 24], ca: [17, 22], mg: [9, 11], s: [5, 7], b: [35, 100], cu: [25, 100], fe: [80, 120], mn: [10, 20], zn: [30, 80], fuente: '[4]' } },
    sorgo:   { embuchamiento: { n: [25, 35], p: [2, 4], k: [14, 25], ca: [2.5, 6], mg: [1.5, 5], s: [1.5, 3], b: [4, 20], cu: [5, 20], fe: [65, 100], mn: [10, 190], mo: [0.1, 0.3], zn: [15, 50], fuente: '[4]' } }
  };
  var ESTADIOS = {
    soja:    [{ k: 'floracion', n: 'Plena floración (R1–R2)', hoja: '3er trifolio desarrollado desde el ápice, con pecíolo; 30 plantas por lote, entre 7 y 11 h, sin lluvia en 24 h', fuente: '[1]' }],
    maiz:    [{ k: 'floracion', n: 'Floración (aparición de los estigmas)', hoja: 'hoja opuesta y abajo de la espiga, tercio central sin nervadura; 30 plantas', fuente: '[4]' },
              { k: 'v3v4', n: 'V3–V4 (planta entera)', hoja: 'planta entera cortada al ras; 30 plantas', fuente: '[5]' }],
    trigo:   [{ k: 'macollaje', n: 'Emergencia–macollaje (planta entera)', hoja: 'planta entera; 30 plantas', fuente: '[5]' },
              { k: 'alongamiento', n: 'Inicio de alargamiento del tallo', hoja: 'planta entera; 30 plantas', fuente: '[6]' },
              { k: 'espigamiento', n: 'Inicio de espigamiento', hoja: 'planta entera (o hoja bandera); 30 plantas', fuente: '[6]' }],
    girasol: [{ k: 'floracion', n: 'Inicio de floración', hoja: 'hojas maduras del tercio superior; 30 plantas', fuente: '[4]' }],
    sorgo:   [{ k: 'embuchamiento', n: 'Embuchamiento (9 semanas)', hoja: 'hoja +4 desde el ápice, sin nervadura central; 30 plantas', fuente: '[4]' }],
    otro:    [{ k: 'floracion', n: 'Floración', hoja: 'hoja madura reciente; 30 plantas', fuente: '' }]
  };
  function estadiosDe(cultivo) { return ESTADIOS[claveCultivo(cultivo)] || ESTADIOS.otro; }
  function rangosDe(cultivo, estadio) {
    var cu = claveCultivo(cultivo), r = RANGOS[cu];
    if (!r) return null;
    return r[estadio] || r[Object.keys(r)[0]];
  }

  /* ---------- sensores (Dualex / SPAD): lectura de clorofila, flavonoles y NBI ---------- */
  // Rangos generales de METOS para la clorofila del Dualex (µg/cm²): < 20 pobre, 20–40 moderada, 40–70 óptima; varían por cultivo → el NBI se lee RELATIVO a una referencia [10]
  function interpretarSensor(a) {
    var out = [];
    var chl = num(a.chl), flav = num(a.flav), nbi = num(a.nbi), nbiRef = num(a.nbiRef), anth = num(a.anth);
    if (chl != null) out.push({ k: 'chl', n: 'Clorofila (Dualex)', unidad: 'µg/cm²', valor: chl, rango: [40, 70], estado: chl < 20 ? 'bajo' : (chl < 40 ? 'limite' : (chl <= 70 ? 'ok' : 'alto')), texto: chl < 20 ? 'Pobre (< 20 µg/cm²) según los rangos generales de METOS: la planta tiene poca clorofila (N, Mg, S, Fe o Mn, o estrés).' : (chl < 40 ? 'Moderada (20–40 µg/cm²): por debajo de lo óptimo general de METOS (40–70); confirmar con el NBI relativo.' : (chl <= 70 ? 'Óptima (40–70 µg/cm²).' : 'Muy alta (> 70): posible exceso de N o sombra; no suele ser problema.')), fuente: '[10]', altoRinde: null, campeon: null });
    if (nbi != null) {
      var it = { k: 'nbi', n: 'NBI (clorofila / flavonoles)', unidad: 'índice', valor: nbi, rango: null, estado: 'sin', texto: '', fuente: '[10]', altoRinde: null, campeon: null };
      if (nbiRef != null && nbiRef > 0) { var isn = nbi / nbiRef; it.isn = isn; it.estado = isn >= 0.97 ? 'ok' : (isn >= 0.95 ? 'limite' : 'bajo'); it.texto = 'Relativo a la referencia (' + fmt(nbiRef, 1) + '): ' + fmt(isn, 2) + '. ' + (it.estado === 'ok' ? 'Sin déficit de nitrógeno.' : (it.estado === 'limite' ? 'Al límite (0,95–0,97): volver a medir en 7 días.' : 'Déficit de nitrógeno (< 0,95)' + (claveCultivo(a.cultivo) === 'soja' ? ': en soja no es motivo de fertilizar con N; revisar nodulación, Mg, S y Mn.' : ': cobertura de N si el cultivo está a tiempo (maíz antes de V10, trigo antes del encañazón).'))); }
      else it.texto = 'Sin franja de referencia: METOS no publica umbrales de NBI por cultivo (en vid ≥ 11). Para leerlo, medí también la zona mejor nutrida del lote o compará con la campaña anterior al mismo estadio.';
      out.push(it);
    }
    if (flav != null) out.push({ k: 'flav', n: 'Flavonoles (estrés)', unidad: 'índice', valor: flav, rango: [null, 1.0], estado: flav > 1.0 ? 'alto' : 'ok', texto: flav > 1.0 ? 'Alto (> 1,0): la planta está fabricando protección; señal de estrés (falta de N, sequía, frío, radiación) o de hoja vieja.' : 'Normal (< 1,0 según METOS).', fuente: '[10]', altoRinde: null, campeon: null });
    if (anth != null) out.push({ k: 'anth', n: 'Antocianinas', unidad: 'índice', valor: anth, rango: null, estado: 'sin', texto: 'Suben con frío, sequía o falta de P; sin rango publicado.', fuente: '[10]', altoRinde: null, campeon: null });
    return out;
  }

  /* ---------- interpretación ---------- */
  function interpretar(a) {
    var cu = claveCultivo(a.cultivo), rg = rangosDe(a.cultivo, a.estadio), out = [];
    if (a.tipo === 'sensor' || a.chl != null || a.nbi != null) out = out.concat(interpretarSensor(a));
    NUTRIENTES.forEach(function (nu) {
      var v = num(a[nu.k]); if (v == null) return;
      var r = rg ? rg[nu.k] : null, estado = 'sin', texto = '';
      if (r) {
        if (r[0] != null && v < r[0]) estado = v < r[0] * 0.8 ? 'bajo' : 'limite';
        else if (r[1] != null && v > r[1]) estado = 'alto';
        else estado = 'ok';
      }
      var pct = r && r[0] != null ? Math.round((v / r[0] - 1) * 100) : null;
      if (estado === 'bajo') texto = 'Por debajo del rango (' + fmt(r[0], r[0] < 1 ? 2 : 1) + '–' + (r[1] != null ? fmt(r[1], r[1] < 1 ? 2 : 1) : '…') + '): ' + Math.abs(pct) + ' % menos que el mínimo. Función: ' + nu.rol + '.';
      else if (estado === 'limite') texto = 'Al límite inferior del rango (' + fmt(r[0], r[0] < 1 ? 2 : 1) + '–' + (r[1] != null ? fmt(r[1], r[1] < 1 ? 2 : 1) : '…') + '): la planta cubre justo; con un rinde más alto va a faltar. Función: ' + nu.rol + '.';
      else if (estado === 'alto') texto = 'Por encima del rango (máx. ' + fmt(r[1], r[1] < 1 ? 2 : 1) + ')' + (nu.k === 'mn' || nu.k === 'fe' ? ': típico de suelos ácidos; baja con el encalado. Vigilar toxicidad si hay síntomas.' : (nu.k === 'k' ? ': puede deprimir la absorción de Mg y Ca.' : (nu.k === 'p' ? ': con P muy alto la planta absorbe menos Zn.' : '. No suele ser problema; revisar balance con los demás.')));
      else if (estado === 'ok') texto = 'Dentro del rango adecuado (' + fmt(r[0], r[0] < 1 ? 2 : 1) + '–' + (r[1] != null ? fmt(r[1], r[1] < 1 ? 2 : 1) : '…') + ').';
      else texto = 'Sin rango de referencia para ' + (a.cultivo || 'este cultivo') + ' en ' + (a.estadio || 'este estadio') + '.';
      var alto = null, campeon = null;
      if (cu === 'soja' && rg && rg.altoRinde && rg.altoRinde[nu.k]) { var ar = rg.altoRinde[nu.k]; alto = { rango: ar, alcanza: v >= ar[0] && v <= ar[1], abajo: v < ar[0] }; }
      if (cu === 'soja' && rg && rg.campeon && rg.campeon[nu.k] != null) campeon = rg.campeon[nu.k];
      out.push({ k: nu.k, n: nu.n, unidad: nu.u, valor: v, rango: r, estado: estado, texto: texto, fuente: rg ? rg.fuente : '', altoRinde: alto, campeon: campeon });
    });
    return out;
  }
  function badge(estado) {
    var m = { bajo: ['#B3261E', 'bajo'], limite: ['#B8731A', 'al límite'], ok: ['#178029', 'adecuado'], alto: ['#2E72C8', 'alto'], sin: ['#8C9196', 'sin rango'] }[estado] || ['#8C9196', estado];
    return '<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:11px;font-weight:700;color:#fff;background:' + m[0] + ';">' + m[1] + '</span>';
  }

  /* ---------- cruce con el suelo ---------- */
  var MAPA_SUELO = { p: 'p', k: 'k', ca: 'ca', mg: 'mg', s: 's', b: 'b', zn: 'zn', cu: 'cu', mn: 'mn', chl: null, nbi: null, flav: null, anth: null };
  function cruceConSuelo(lect, suelo, cultivo) {
    if (!suelo || !window.SafiaAgro) return [];
    var ls = SafiaAgro.interpretarSuelo(suelo, cultivo), porK = {}; ls.forEach(function (i) { porK[i.k] = i; });
    var ph = num(suelo.ph), pS = porK.p, kS = porK.k, out = [];
    lect.forEach(function (h) {
      if (h.k === 'chl' || h.k === 'nbi' || h.k === 'flav' || h.k === 'anth') return;   // lecturas del sensor: no se cruzan con el suelo
      var ks = MAPA_SUELO[h.k], s = ks ? porK[ks] : null;
      if (h.k === 'n') {
        if (h.estado === 'bajo' || h.estado === 'limite') out.push({ k: 'n', tipo: 'warn', texto: claveCultivo(cultivo) === 'soja'
          ? 'Nitrógeno bajo en hoja de soja: el problema está en la <b>fijación biológica</b>, no en el suelo. Revisar nódulos (tienen que ser muchos, grandes y rosados por dentro), la calidad e inoculación de la semilla, el pH (< 5,5 frena al rizobio), el Mo y el Co. Embrapa: <b>no aplicar N</b>; reinocular y co-inocular en la próxima siembra [8].'
          : 'Nitrógeno bajo en hoja: el cultivo no tiene N suficiente. Si todavía está antes de V8–V10 (maíz) o del encañazón (trigo), una cobertura de N corrige en el ciclo; confirmar con el clorofilómetro (ISN) [7].' });
        return;
      }
      if (!s) { if (h.estado === 'bajo' || h.estado === 'limite') out.push({ k: h.k, tipo: 'info', texto: esc(h.n) + (h.estado === 'limite' ? ' al límite' : ' bajo') + ' en hoja y <b>sin dato en el análisis de suelo</b>: pedir ese nutriente en el próximo análisis para saber si falta en el suelo o si la planta no lo toma.' }); return; }
      var sueloFalta = s.estado === 'limita' || s.estado === 'atencion' || s.alcanzaAlto === false;
      if (h.estado === 'bajo' || h.estado === 'limite') {
        if (sueloFalta) out.push({ k: h.k, tipo: 'warn', texto: '<b>' + esc(h.n) + (h.estado === 'limite' ? ' al límite' : ' bajo') + ' en la hoja y ' + (s.estado === 'ok' ? 'por debajo del objetivo de alto rinde' : 'bajo') + ' en el suelo (' + fmt(s.valor, 2) + ' ' + esc(s.unidad) + ')</b>: confirmado, falta en el suelo. Se corrige en el suelo para la próxima campaña (ver Análisis de suelo → recomendaciones)' + (h.k === 'b' || h.k === 'mn' || h.k === 'zn' || h.k === 'cu' ? ' y, para salvar este ciclo, una aplicación foliar' : (h.k === 'k' || h.k === 'p' ? '; vía foliar no alcanza para P y K' : '')) + '.' });
        else {
          var causas = [];
          if ((h.k === 'mn' || h.k === 'zn' || h.k === 'b' || h.k === 'cu') && ph != null && ph >= 6.3) causas.push('pH ' + fmt(ph, 1) + ' alto para los micronutrientes (se bloquean en el suelo)');
          if (h.k === 'zn' && pS && pS.categoria && /alta/.test(pS.categoria)) causas.push('fósforo alto en el suelo (antagonismo P–Zn)');
          if ((h.k === 'mg' || h.k === 'ca') && kS && kS.categoria && /alta/.test(kS.categoria)) causas.push('potasio alto en el suelo (antagonismo K–Mg/Ca)');
          if (h.k === 'mg' && porK.rel_camg && porK.rel_camg.valor > 4) causas.push('relación Ca/Mg ' + fmt(porK.rel_camg.valor, 1) + ' (el Ca desplaza al Mg)');
          if (h.k === 'k' && porK.rel_bk && porK.rel_bk.valor > 30) causas.push('relación (Ca+Mg)/K ' + fmt(porK.rel_bk.valor, 0) + ' (deficiencia inducida de K)');
          if (!causas.length) causas.push('raíz que no explora (compactación, capa dura), sequía o exceso de agua en el muestreo, o muestreo fuera de estadio');
          out.push({ k: h.k, tipo: 'warn', texto: '<b>' + esc(h.n) + (h.estado === 'limite' ? ' al límite' : ' bajo') + ' en la hoja pero adecuado en el suelo (' + fmt(s.valor, 2) + ' ' + esc(s.unidad) + ')</b>: el suelo lo tiene y la planta no lo toma. Causas probables: ' + causas.join('; ') + '. Una aplicación foliar corrige el ciclo en curso; la causa se corrige en el suelo.' });
        }
      } else if (h.estado === 'ok' && sueloFalta) out.push({ k: h.k, tipo: 'info', texto: esc(h.n) + ' adecuado en la hoja aunque el suelo está ' + (s.estado === 'ok' ? 'por debajo del objetivo de alto rinde' : 'bajo') + ': la planta compensó por ahora; corregir el suelo para no depender de eso con un rinde más alto.' });
    });
    return out;
  }

  /* ---------- clorofilómetro ---------- */
  function spad(a) {
    var v = num(a.spad), ref = num(a.spadRef); if (v == null) return null;
    var cu = claveCultivo(a.cultivo);
    if (ref == null || ref <= 0) return { valor: v, isn: null, texto: 'SPAD ' + fmt(v, 1) + ' sin franja de referencia: para leerlo como índice de suficiencia hace falta medir también una franja del mismo lote con N sin límite (o la zona más verde) [7].' };
    var isn = v / ref, estado = isn >= 0.97 ? 'ok' : (isn >= 0.95 ? 'limite' : 'bajo');
    var texto = 'ISN = ' + fmt(v, 1) + ' / ' + fmt(ref, 1) + ' = <b>' + fmt(isn, 2) + '</b>. ';
    if (cu === 'soja') texto += estado === 'ok' ? 'Verdor normal.' : 'Menos verde que la referencia: en soja no es señal de fertilizar con N (Embrapa [8]); mirar nodulación, Mg, S, Mn o exceso de agua.';
    else texto += estado === 'ok' ? 'Sin déficit de N: la dosis está cubierta (INTA: dosis óptima con ISN ≈ 0,97–0,98) [7].' : (estado === 'limite' ? 'En el límite (0,95–0,97): probable respuesta pequeña a N; volver a medir en 7 días [7].' : 'Déficit de N (ISN < 0,95): conviene una cobertura de N ahora si el cultivo está antes de V10 (maíz) o del encañazón (trigo) [7].');
    return { valor: v, ref: ref, isn: isn, estado: estado, texto: texto };
  }

  /* ---------- recomendaciones ---------- */
  function recomendaciones(a, lect, cruce) {
    var cu = claveCultivo(a.cultivo), r = [];
    var bajos = lect.filter(function (h) { return h.estado === 'bajo' || h.estado === 'limite'; });
    bajos.forEach(function (h) {
      var c = cruce.find(function (x) { return x.k === h.k; });
      switch (h.k) {
        case 'chl': case 'nbi': if (!bajos.some(function (x) { return x.k === 'n'; })) r.push(cu === 'soja' ? { k: 'nbi', titulo: 'Sensor: poca clorofila o NBI bajo en soja: revisar nodulación, no fertilizar con N', detalle: 'Embrapa: el N no aumenta el rinde de la soja; mirar nódulos, inoculante, Mo/Co, pH, magnesio y azufre, y confirmar con análisis foliar de laboratorio. [8][10]' } : { k: 'nbi', titulo: 'Sensor: NBI por debajo de la referencia: cobertura de N si el cultivo está a tiempo', detalle: 'El NBI del Dualex predice el índice de nutrición nitrogenada mejor que el SPAD; con ISN < 0,95 en V6–V10 (maíz) conviene fertilizar. [7][10]' }); break;
        case 'n': r.push(cu === 'soja' ? { k: 'n', titulo: 'Nitrógeno bajo en soja: revisar nodulación, no fertilizar con N', detalle: 'Embrapa (9 + 15 ensayos): 50 kg de N en R1 o R5 no aumentaron el rinde y el N a la siembra redujo la nodulación 20–86 %. Revisar nódulos, inoculante (≥ 1 millón de células por semilla), Mo + Co en semilla y pH. [8]' } : { k: 'n', titulo: 'Nitrógeno bajo: cobertura de N si todavía es temprano', detalle: 'Maíz antes de V8–V10 o trigo antes del encañazón: urea o UAN según la dosis que falte; confirmar con clorofilómetro (ISN < 0,95). [7]' }); break;
        case 'p': r.push({ k: 'p', titulo: 'Fósforo bajo en hoja: se corrige en el suelo, no vía foliar', detalle: 'Para este ciclo poco se puede hacer; para el próximo, corrección de P según el análisis de suelo (Motor 6) y P en la línea de siembra. Si el suelo es ácido (pH < 5,5), encalar primero: el P se fija en Al y Fe.' }); break;
        case 'k': r.push({ k: 'k', titulo: 'Potasio bajo en hoja: KCl al suelo (la vía foliar no alcanza)', detalle: 'El K es el nutriente que más se lleva el grano en alto rinde. Reponer con KCl al voleo antes de la próxima siembra; si el suelo está bien y la hoja no, mirar (Ca+Mg)/K y sequía.' }); break;
        case 'ca': r.push({ k: 'ca', titulo: 'Calcio bajo: calcáreo o yeso según el análisis de suelo', detalle: 'El Ca no se mueve dentro de la planta: la raíz tiene que encontrarlo. Calcáreo si el V% es bajo; yeso si falta en profundidad.' }); break;
        case 'mg': r.push({ k: 'mg', titulo: 'Magnesio bajo: calcáreo dolomítico y, para este ciclo, sulfato de Mg foliar', detalle: 'Sin Mg baja la fotosíntesis (clorosis entre nervaduras en hojas viejas). Corregir la relación Ca/Mg y K/Mg con dolomítico; una aplicación foliar de sulfato de magnesio alivia el ciclo en curso (dosis con el agrónomo).' }); break;
        case 's': r.push({ k: 's', titulo: 'Azufre bajo: yeso o sulfato de amonio al suelo', detalle: 'La soja exporta ~4,7 kg S/t; en suelos con poca MO o arenosos falta seguido. Yeso agrícola (150–200 kg/ha) o una fuente con S en la base de la próxima siembra.' }); break;
        case 'b': r.push({ k: 'b', titulo: 'Boro bajo: foliar en floración este ciclo y 1–2 kg B/ha al suelo para la próxima', detalle: 'El B hace la floración y el cuaje; en R1–R2 una aplicación foliar todavía llega. Al suelo, bórax o ulexita cada 4–5 años; franja estrecha con la toxicidad, no exceder [9].' }); break;
        case 'zn': r.push({ k: 'zn', titulo: 'Zinc bajo: foliar temprano y 6 kg Zn/ha al suelo para la próxima', detalle: 'En maíz es el micronutriente que más limita. Al suelo, sulfato de zinc cada 4–5 años (¼ si el tenor es medio); en semilla o foliar en V4–V6 [9].' }); break;
        case 'cu': r.push({ k: 'cu', titulo: 'Cobre bajo: foliar y 1–2 kg Cu/ha al suelo', detalle: 'Cu participa en la lignificación y la sanidad; los lotes de alto rinde tienen 9–14 mg/kg en hoja [2][9].' }); break;
        case 'mn': r.push({ k: 'mn', titulo: 'Manganeso bajo: Mn foliar 350 g/ha', detalle: 'Frecuente con pH alto, encalado reciente o después de glifosato. Embrapa: 350 g Mn/ha vía foliar; en suelo ácido no suele faltar [9].' }); break;
        case 'mo': r.push({ k: 'mo', titulo: 'Molibdeno bajo: Mo + Co en semilla en la próxima siembra', detalle: 'Mo 12–30 g/ha + Co 2–3 g/ha en semilla junto con el inoculante; en suelos ácidos el Mo está menos disponible (encalar). Fertilizar: +540 kg/ha en ensayos de Paraná.' }); break;
        case 'fe': r.push({ k: 'fe', titulo: 'Hierro bajo: raro en suelos ácidos; mirar pH alto o exceso de agua', detalle: 'Si el pH es > 6,5 o el lote estuvo anegado, la planta no toma Fe aunque el suelo tenga. Foliar de quelato de Fe solo si hay síntomas.' }); break;
      }
    });
    if (cu === 'soja' && !bajos.some(function (h) { return h.k === 'n'; })) r.push({ k: 'n_ok', titulo: 'Nitrógeno: la fijación biológica está cubriendo', detalle: 'Embrapa: no aplicar N a la soja en ningún estadio; seguir inoculando y co-inoculando cada siembra [8].' });
    return r;
  }

  /* ---------- HTML de lectura ---------- */
  function tablaHTML(lect, cultivo) {
    var cu = claveCultivo(cultivo), conAlto = cu === 'soja';
    var h = '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Nutriente</th><th class="r">Hoja</th><th>Estado</th><th>Rango adecuado</th>' + (conAlto ? '<th>Lotes de alto rinde</th>' : '') + '<th>Lectura</th></tr></thead><tbody>';
    lect.forEach(function (i) {
      var d = i.valor < 1 ? 2 : (i.unidad === 'g/kg' ? 1 : 0);
      var rango = i.rango ? fmt(i.rango[0], i.rango[0] < 1 ? 2 : (i.unidad === 'g/kg' ? 1 : 0)) + (i.rango[1] != null ? '–' + fmt(i.rango[1], i.rango[1] < 1 ? 2 : (i.unidad === 'g/kg' ? 1 : 0)) : ' o más') : '—';
      var alto = '';
      if (conAlto) {
        if (i.altoRinde) alto = fmt(i.altoRinde.rango[0], i.unidad === 'g/kg' ? 1 : 0) + '–' + fmt(i.altoRinde.rango[1], i.unidad === 'g/kg' ? 1 : 0) + '<div class="sub" style="color:' + (i.altoRinde.abajo ? '#B3261E' : '#178029') + ';font-weight:700;">' + (i.altoRinde.abajo ? 'falta' : 'alcanzado') + '</div>';
        if (i.campeon != null) alto += '<div class="sub">7.963 kg/ha: ' + fmt(i.campeon, i.unidad === 'g/kg' ? 1 : 0) + '</div>';
      }
      h += '<tr><td><b>' + esc(i.n) + '</b></td><td class="r"><span class="num">' + fmt(i.valor, d) + '</span><div class="sub">' + esc(i.unidad) + '</div></td><td>' + badge(i.estado) + '</td><td style="font-size:12px;">' + rango + '</td>' + (conAlto ? '<td style="font-size:12px;">' + (alto || '<span class="muted">—</span>') + '</td>' : '') + '<td style="font-size:12px;">' + esc(i.texto) + ' <span class="muted">' + esc(i.fuente) + '</span></td></tr>';
    });
    h += '</tbody></table></div></div>';
    if (conAlto) h += '<div class="muted" style="font-size:11px;margin-top:4px;">Lotes de alto rinde: faixas de suficiência por DRIS en 194 lotes de soja en siembra directa sobre basalto (Embrapa/Emater PR) [2]; el valor "7.963 kg/ha" es la hoja de un lote récord citado por Fertilizar/INTA [3]. Referencia, no receta.</div>';
    return h;
  }
  function htmlLectura(a, suelo) {
    var lect = interpretar(a), cruce = cruceConSuelo(lect, suelo, a.cultivo), recs = recomendaciones(a, lect, cruce), sp = spad(a);
    var est = estadiosDe(a.cultivo).find(function (e) { return e.k === a.estadio; });
    var h = '';
    var bajos = lect.filter(function (i) { return i.estado === 'bajo'; }), lim = lect.filter(function (i) { return i.estado === 'limite'; }), altos = lect.filter(function (i) { return i.estado === 'alto'; });
    h += '<div class="note ' + (bajos.length ? 'warn' : 'info') + '" style="margin-bottom:8px;"><b>Resumen:</b> ' + (lect.length ? (bajos.length ? 'faltan <b>' + bajos.map(function (i) { return i.n.replace(/\s*\(.*$/, ''); }).join(', ') + '</b>' : 'ningún nutriente por debajo del rango') + (lim.length ? '; al límite: ' + lim.map(function (i) { return i.n.replace(/\s*\(.*$/, ''); }).join(', ') : '') + (altos.length ? '; altos: ' + altos.map(function (i) { return i.n.replace(/\s*\(.*$/, ''); }).join(', ') : '') + '.' : 'sin valores cargados.') + (est ? ' <span class="muted">Muestreo de referencia: ' + esc(est.hoja) + ' ' + esc(est.fuente) + '.</span>' : '') + '</div>';
    if (lect.length) h += tablaHTML(lect, a.cultivo);
    if (sp) h += '<div class="note ' + (sp.estado === 'bajo' ? 'warn' : 'info') + '" style="margin-top:8px;"><b>Clorofilómetro (SPAD):</b> ' + sp.texto + '</div>';
    if (cruce.length) h += '<h3 style="font-size:14px;margin:14px 0 6px;">Hoja contra suelo: ¿falta en el suelo o la planta no lo toma?</h3>' + cruce.map(function (c) { return '<div class="note ' + c.tipo + '" style="margin-bottom:6px;">' + c.texto + '</div>'; }).join('');
    else if (!suelo) h += '<div class="muted" style="font-size:12px;margin-top:8px;">Sin análisis de suelo del lote para cruzar: con los dos, SAFIA dice si el nutriente falta en el suelo o si la planta no lo absorbe.</div>';
    if (recs.length) h += '<h3 style="font-size:14px;margin:14px 0 6px;">Qué hacer</h3><ol style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.5;">' + recs.map(function (r) { return '<li style="margin-bottom:6px;"><b>' + esc(r.titulo) + '.</b> ' + esc(r.detalle) + '</li>'; }).join('') + '</ol>';
    h += '<div class="muted" style="font-size:11px;margin-top:8px;">[1] Embrapa Soja 1998 / Embrapa 2020 · [2] Harger, Kurihara, Oliveira & Ralisch (Embrapa) · [3] Flannery 1989 y Martins 1998 citados por Fertilizar/INTA · [4] Embrapa 2020 (Raij, Malavolta) · [5] Fertilizar/INTA, Correndo & García 2016 · [6] Embrapa Trigo · [7] INTA Balcarce, Sainz Rozas et al. 2019 · [8] Embrapa Soja CT 75 (2001) y Mendes et al. 2008 · [9] Embrapa Cerrados · [10] METOS/Pessl, Dualex (rangos generales de clorofila; NBI relativo). SAFIA interpreta; la prescripción la define el agrónomo.</div>';
    return h;
  }

  /* ---------- datos ---------- */
  function lista() { var c = B() && B().campoActual(); return c ? B().leer('analisis_foliar').filter(function (a) { return String(a.campoId) === String(c.id); }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }) : []; }
  function delLote(equipoId) { return lista().filter(function (a) { return String(a.equipoId || '') === String(equipoId || ''); }); }
  function ultimoDelLote(equipoId) { var l = delLote(equipoId); if (!l.length) l = lista().filter(function (a) { return !a.equipoId; }); return l.length ? l[l.length - 1] : null; }
  function guardarItem(item) {
    var todos = B().leer('analisis_foliar').filter(function (a) { return String(a.id) !== String(item.id); });
    todos.push(item); B().guardar('analisis_foliar', todos);
  }
  function borrarItem(id) { B().guardar('analisis_foliar', B().leer('analisis_foliar').filter(function (a) { return String(a.id) !== String(id); })); }
  function sueloParaCruce(equipoId) {
    var c = B().campoActual(); if (!c) return null;
    var todos = B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(c.id); });
    var sueltos = todos.filter(function (a) { return !a.enPromedio; }); if (sueltos.length) todos = sueltos;
    var del = todos.filter(function (a) { return String(a.equipoId || '') === String(equipoId || ''); });
    if (!del.length) del = todos.filter(function (a) { return !a.equipoId; });
    if (!del.length) del = todos;
    del.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    return del.length ? del[del.length - 1] : null;
  }

  /* ---------- UI del Banco ---------- */
  var CAMPOS_FORM = ['fFecha', 'fEquipo', 'fCultivo', 'fEstadio', 'fHoja', 'fLab', 'fN', 'fP', 'fK', 'fCa', 'fMg', 'fS', 'fB', 'fCu', 'fFe', 'fMn', 'fMo', 'fZn', 'fSpad', 'fSpadRef', 'fObs', 'fArchivo'];
  var MAPA_FORM = { n: 'fN', p: 'fP', k: 'fK', ca: 'fCa', mg: 'fMg', s: 'fS', b: 'fB', cu: 'fCu', fe: 'fFe', mn: 'fMn', mo: 'fMo', zn: 'fZn' };
  function lotesDelCampo() { var c = B().campoActual(); return c ? B().leer('equipos').filter(function (e) { return String(e.campoId) === String(c.id); }) : []; }
  function cultivosDelCampo() {
    var c = B().campoActual(), set = {}; ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo'].forEach(function (x) { set[x] = 1; });
    if (c) B().leer('campanas').filter(function (x) { return String(x.campoId) === String(c.id); }).forEach(function (x) { (x.cultivos || []).forEach(function (cu) { if (cu.cultivo) set[cu.cultivo] = 1; }); if (x.cultivo) set[x.cultivo] = 1; });
    return Object.keys(set);
  }
  function llenarSelectores() {
    var se = $('fEquipo'), v = se.value;
    se.innerHTML = '<option value="">Todo el campo</option>' + lotesDelCampo().map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join('');
    if (v) se.value = v;
    var sc = $('fCultivo'), vc = sc.value;
    sc.innerHTML = cultivosDelCampo().map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
    if (vc) sc.value = vc;
    llenarEstadios();
  }
  function llenarEstadios(valor) {
    var s = $('fEstadio'), cu = $('fCultivo').value, v = valor || s.value;
    s.innerHTML = estadiosDe(cu).map(function (e) { return '<option value="' + e.k + '">' + esc(e.n) + '</option>'; }).join('');
    if (v && estadiosDe(cu).some(function (e) { return e.k === v; })) s.value = v;
    var e = estadiosDe(cu).find(function (x) { return x.k === s.value; });
    $('fEstadioHint').textContent = e ? 'Hoja a muestrear: ' + e.hoja + ' ' + e.fuente : '';
  }
  function abrirForm() { $('formFoliar').classList.add('visible'); llenarSelectores(); }
  function cerrarForm() {
    $('formFoliar').classList.remove('visible'); editandoId = null; muestrasIA = null;
    $('tituloFormFoliar').textContent = 'Nuevo análisis foliar';
    CAMPOS_FORM.forEach(function (i) { var el = $(i); if (el && el.tagName !== 'SELECT') el.value = ''; });
    $('fArchivoActual').textContent = ''; var m = $('muestrasFoliarIA'); if (m) m.innerHTML = '';
    $('leerFoliarHint').textContent = 'Subí la foto o PDF del laboratorio y tocá el botón: la IA completa los casilleros (convierte % a g/kg). Revisá antes de guardar.';
  }
  // El laboratorio escribe el estadio como quiere ('R2', 'pleno florescimento', 'V6'…): se lleva a la clave del catálogo
  function mapearEstadio(texto, cultivo) {
    var t = norm(texto), lista = estadiosDe(cultivo);
    if (lista.some(function (e) { return e.k === texto; })) return texto;
    var k = /r[1-3]|flor|pendo|estigma|cabel|embonec/.test(t) ? 'floracion' : (/v[2-5]|planta (entera|inteira)/.test(t) ? 'v3v4' : (/macoll|perfilh|afilh|emerg/.test(t) ? 'macollaje' : (/alarg|along|encan|elonga/.test(t) ? 'alongamiento' : (/espig/.test(t) ? 'espigamiento' : (/embuch|emborrach/.test(t) ? 'embuchamiento' : null)))));
    return k && lista.some(function (e) { return e.k === k; }) ? k : lista[0].k;
  }
  function volcar(a) {
    if (a.fecha) $('fFecha').value = String(a.fecha).slice(0, 10);
    if (a.cultivo) { var sc = $('fCultivo'); if (![].some.call(sc.options, function (o) { return o.value === a.cultivo; })) sc.insertAdjacentHTML('beforeend', '<option value="' + esc(a.cultivo) + '">' + esc(a.cultivo) + '</option>'); sc.value = a.cultivo; }
    llenarEstadios(a.estadio ? mapearEstadio(a.estadio, $('fCultivo').value) : undefined);
    if (a.estadio && a.hoja == null && !estadiosDe($('fCultivo').value).some(function (e) { return e.k === a.estadio; })) a = Object.assign({}, a, { hoja: a.estadio });
    if (a.hoja || a.muestra) $('fHoja').value = [a.muestra, a.hoja].filter(Boolean).join(' · ');
    if (a.laboratorio) $('fLab').value = a.laboratorio;
    Object.keys(MAPA_FORM).forEach(function (k) { var v = num(a[k]); $(MAPA_FORM[k]).value = v == null ? '' : v; });
    if (a.spad != null) $('fSpad').value = a.spad; if (a.spadRef != null) $('fSpadRef').value = a.spadRef;
    if (a.observaciones) $('fObs').value = a.observaciones;
  }
  function leerForm() {
    var item = {
      fecha: $('fFecha').value, equipoId: $('fEquipo').value || null, cultivo: $('fCultivo').value, estadio: $('fEstadio').value, hoja: $('fHoja').value.trim(), laboratorio: $('fLab').value.trim(),
      spad: num($('fSpad').value), spadRef: num($('fSpadRef').value), observaciones: $('fObs').value.trim()
    };
    Object.keys(MAPA_FORM).forEach(function (k) { item[k] = num($(MAPA_FORM[k]).value); });
    return item;
  }
  function limpiarNombre(n) { return String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80); }
  function archivoABase64(archivo) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(archivo); }); }
  function comprimirImagen(archivo, maxLado, calidad) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () { var esc_ = Math.min(1, maxLado / Math.max(img.width, img.height)); var cv = document.createElement('canvas'); cv.width = Math.round(img.width * esc_); cv.height = Math.round(img.height * esc_); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', calidad).split(',')[1]); };
      img.onerror = rej; img.src = url;
    });
  }
  function guardar() {
    var c = B().campoActual(); if (!c) return;
    var item = leerForm();
    if (!item.fecha) { B().toast('Falta la fecha del análisis', true); return; }
    if (!Object.keys(MAPA_FORM).some(function (k) { return item[k] != null; }) && item.spad == null) { B().toast('Cargá al menos un nutriente o el SPAD', true); return; }
    var previo = editandoId ? B().leer('analisis_foliar').find(function (a) { return String(a.id) === String(editandoId); }) : null;
    Object.assign(item, { id: previo ? previo.id : Date.now(), campoId: c.id, fechaCreacion: previo ? previo.fechaCreacion : new Date().toISOString(), archivoRuta: previo ? previo.archivoRuta : null, archivoNombre: previo ? previo.archivoNombre : null });
    var archivo = $('fArchivo').files && $('fArchivo').files[0];
    var pre = archivo && window.safiaSupabase ? window.safiaSupabase.storage.from('safia').upload('campo_' + c.id + '/foliar/' + Date.now() + '_' + limpiarNombre(archivo.name), archivo, { upsert: false }).then(function (r) { if (r.error) throw r.error; item.archivoRuta = r.data && r.data.path ? r.data.path : ('campo_' + c.id + '/foliar/' + limpiarNombre(archivo.name)); item.archivoNombre = archivo.name; }).catch(function (e) { console.error(e); B().toast('El archivo no se pudo subir; el análisis se guarda igual', true); }) : Promise.resolve();
    pre.then(function () { guardarItem(item); B().toast('Análisis foliar guardado'); cerrarForm(); pintar(); });
  }
  function leerConIA() {
    var input = $('fArchivo'), archivo = input.files && input.files[0], hint = $('leerFoliarHint'), boton = $('btnLeerFoliarIA');
    if (!archivo) { B().toast('Primero elegí la foto o el PDF del laboratorio', true); return; }
    if (!window.safiaSupabase) { B().toast('Sin conexión a internet', true); return; }
    var esPdf = /pdf$/i.test(archivo.type) || /\.pdf$/i.test(archivo.name);
    boton.disabled = true; boton.textContent = 'Leyendo…'; hint.textContent = 'Leyendo el análisis foliar con IA, esto tarda unos segundos…';
    (esPdf ? archivoABase64(archivo) : comprimirImagen(archivo, 2000, 0.85)).then(function (b64) {
      return window.safiaSupabase.functions.invoke('safia-leer-analisis', { body: { mime: esPdf ? 'application/pdf' : 'image/jpeg', data_base64: b64, tipo: 'foliar' } });
    }).then(function (r) {
      if (r.error) throw r.error;
      var muestras = (r.data && r.data.muestras) || [];
      if (!muestras.length) throw new Error('La IA no encontró valores de análisis foliar en el archivo');
      muestrasIA = muestras; volcar(muestras[0]); mostrarMuestras(muestras);
      hint.textContent = muestras.length > 1 ? 'El informe tiene ' + muestras.length + ' muestras: elegí cuál revisar y guardá una por una (el mismo archivo queda adjunto).' : 'Valores cargados por IA. Revisalos y corregí si hace falta antes de guardar.';
      B().toast('Análisis foliar leído: revisá los valores');
    }).catch(function (e) {
      console.error(e);
      var explicar = function (msg) { hint.textContent = 'No se pudo leer automáticamente' + (msg ? ': ' + msg : '') + '. Cargá los valores a mano (el archivo igual se guarda).'; B().toast('No se pudo leer con IA' + (msg ? ': ' + msg : ''), true); };
      if (e && e.context && typeof e.context.json === 'function') e.context.json().then(function (j) { explicar((j && (j.error + (j.detalle ? ' · ' + j.detalle : ''))) || e.message); }).catch(function () { explicar(e.message); });
      else explicar((e && e.message) || '');
    }).finally(function () { boton.disabled = false; boton.textContent = 'Leer análisis foliar con IA y completar solo'; });
  }
  function mostrarMuestras(muestras) {
    var cont = $('muestrasFoliarIA'); if (!cont) return;
    if (muestras.length < 2) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<span class="muted" style="font-size:12px;align-self:center;">Muestras del informe:</span>' + muestras.map(function (m, i) { var et = [m.muestra, m.cultivo, m.estadio, m.fecha].filter(Boolean).join(' · ') || ('Muestra ' + (i + 1)); return '<button type="button" class="btn mini" data-i="' + i + '">' + esc(et) + '</button>'; }).join('');
    cont.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { volcar(muestras[+b.dataset.i]); B().toast('Cargada: ' + b.textContent); }); });
  }
  function editar(id) {
    var a = B().leer('analisis_foliar').find(function (x) { return String(x.id) === String(id); }); if (!a) return;
    cerrarForm(); abrirForm(); editandoId = a.id;
    $('tituloFormFoliar').textContent = 'Editar análisis foliar del ' + fmtF(a.fecha);
    $('fEquipo').value = a.equipoId ? String(a.equipoId) : '';
    volcar(a); $('fHoja').value = a.hoja || ''; $('fLab').value = a.laboratorio || ''; $('fObs').value = a.observaciones || '';
    $('fArchivoActual').textContent = a.archivoNombre ? 'Actual: ' + a.archivoNombre + ' (subí otro para reemplazar)' : '';
    $('formFoliar').scrollIntoView({ behavior: 'smooth' });
  }
  function verPdf(id) {
    var a = B().leer('analisis_foliar').find(function (x) { return String(x.id) === String(id); });
    if (!a || !a.archivoRuta || !window.safiaSupabase) return;
    window.safiaSupabase.storage.from('safia').createSignedUrl(a.archivoRuta, 3600).then(function (r) { if (r.data && r.data.signedUrl) window.open(r.data.signedUrl, '_blank'); else B().toast('No se pudo abrir el archivo', true); });
  }
  function nombreLote(id) { var e = lotesDelCampo().find(function (x) { return String(x.id) === String(id); }); return e ? e.nombre : 'Todo el campo'; }
  function pintar() {
    var cont = $('listaFoliar'), lect = $('lecturaFoliar'), vacio = $('vacioFoliar'); if (!cont) return;
    var l = lista();
    if (!l.length) { cont.innerHTML = ''; lect.innerHTML = ''; vacio.style.display = 'block'; return; }
    vacio.style.display = 'none';
    cont.innerHTML = '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Fecha</th><th>Lote</th><th>Cultivo · estadio</th><th class="r">N</th><th class="r">P</th><th class="r">K</th><th class="r">Ca</th><th class="r">Mg</th><th class="r">S</th><th class="r">B</th><th class="r">Mn</th><th class="r">Zn</th><th class="r">SPAD</th><th>Resumen</th><th></th></tr></thead><tbody>' +
      l.slice().reverse().map(function (a) {
        var li = interpretar(a), bajos = li.filter(function (i) { return i.estado === 'bajo' || i.estado === 'limite'; });
        var est = estadiosDe(a.cultivo).find(function (e) { return e.k === a.estadio; });
        var sensor = a.tipo === 'sensor' ? '<div class="sub">Sensor: Chl ' + fmt(a.chl, 1) + (a.nbi != null ? ' · NBI ' + fmt(a.nbi, 1) + (a.nbiRef != null ? ' (rel. ' + fmt(a.nbi / a.nbiRef, 2) + ')' : (a.esReferencia ? ' · referencia' : '')) : '') + ' · ' + (a.lecturas || '') + ' lecturas</div>' : '';
        var celda = function (k, d) { var i = li.find(function (x) { return x.k === k; }); if (!i) return '<td class="r muted">—</td>'; var col = { bajo: '#B3261E', limite: '#B8731A', alto: '#2E72C8' }[i.estado] || 'inherit'; return '<td class="r" style="color:' + col + ';font-weight:' + (i.estado === 'ok' || i.estado === 'sin' ? '400' : '700') + ';">' + fmt(i.valor, d) + '</td>'; };
        return '<tr data-id="' + esc(a.id) + '"><td>' + fmtF(a.fecha) + '</td><td>' + esc(nombreLote(a.equipoId)) + '</td><td>' + esc(a.cultivo || '') + '<div class="sub">' + esc(est ? est.n : (a.estadio || '')) + (a.laboratorio ? ' · ' + esc(a.laboratorio) : '') + '</div>' + sensor + '</td>' +
          celda('n', 1) + celda('p', 1) + celda('k', 1) + celda('ca', 1) + celda('mg', 1) + celda('s', 1) + celda('b', 0) + celda('mn', 0) + celda('zn', 0) + '<td class="r">' + (a.spad != null ? fmt(a.spad, 1) + (a.spadRef != null ? '<div class="sub">ISN ' + fmt(a.spad / a.spadRef, 2) + '</div>' : '') : '—') + '</td>' +
          '<td style="font-size:12px;">' + (bajos.length ? '<span style="color:#B3261E;font-weight:700;">faltan: ' + esc(bajos.map(function (i) { return i.n.replace(/\s*\(.*$/, ''); }).join(', ')) + '</span>' : (li.length ? '<span style="color:#178029;font-weight:700;">todo en rango</span>' : '')) + '</td>' +
          '<td class="r" style="white-space:nowrap;">' + (a.archivoRuta ? '<button type="button" class="btn mini" data-act="pdf" title="Ver archivo">PDF</button> ' : '') + '<button type="button" class="btn mini" data-act="ver">Lectura</button> <button type="button" class="btn mini" data-act="editar">Editar</button> <button type="button" class="btn mini" data-act="borrar" style="color:#B3261E;">Borrar</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    cont.querySelectorAll('button[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('tr').dataset.id;
        if (b.dataset.act === 'editar') editar(id);
        else if (b.dataset.act === 'pdf') verPdf(id);
        else if (b.dataset.act === 'ver') mostrarLectura(id);
        else if (b.dataset.act === 'borrar') { if (b.dataset.confirmado) { borrarItem(id); B().toast('Análisis foliar borrado'); pintar(); } else { b.dataset.confirmado = '1'; b.textContent = '¿Borrar?'; setTimeout(function () { delete b.dataset.confirmado; b.textContent = 'Borrar'; }, 4000); } }
      });
    });
    mostrarLectura(l[l.length - 1].id);
  }
  function mostrarLectura(id) {
    var a = B().leer('analisis_foliar').find(function (x) { return String(x.id) === String(id); }), lect = $('lecturaFoliar'); if (!a || !lect) return;
    var suelo = sueloParaCruce(a.equipoId);
    lect.innerHTML = '<div class="card" style="margin-top:14px;"><div class="card-h"><h3>Lectura del análisis foliar del ' + fmtF(a.fecha) + ' · ' + esc(nombreLote(a.equipoId)) + ' · ' + esc(a.cultivo || '') + '</h3><span class="muted">' + (suelo ? 'cruzado con el análisis de suelo del ' + fmtF(suelo.fecha) : 'sin análisis de suelo para cruzar') + '</span></div>' + htmlLectura(a, suelo) + '</div>';
    if (window.SafiaIconos && SafiaIconos.procesar) try { SafiaIconos.procesar(lect); } catch (e) {}
  }
  function activar() {
    if (!B() || !$('panel-foliar')) return;
    if (!iniciado) {
      iniciado = true;
      $('btnNuevoFoliar').addEventListener('click', function () { cerrarForm(); abrirForm(); });
      $('btnCancelarFoliar').addEventListener('click', cerrarForm);
      $('btnGuardarFoliar').addEventListener('click', guardar);
      $('btnLeerFoliarIA').addEventListener('click', leerConIA);
      $('fCultivo').addEventListener('change', function () { llenarEstadios(); });
      $('fEstadio').addEventListener('change', function () { llenarEstadios(); });
    }
    llenarSelectores(); pintar();
  }
  function alCambiarCampo() { if (iniciado) { cerrarForm(); if ($('panel-foliar').classList.contains('on')) activar(); } }

  window.SafiaFoliar = { activar: activar, alCambiarCampo: alCambiarCampo, interpretar: interpretar, cruceConSuelo: cruceConSuelo, spad: spad, recomendaciones: recomendaciones, htmlLectura: htmlLectura, tablaHTML: tablaHTML, estadiosDe: estadiosDe, rangosDe: rangosDe, ultimoDelLote: ultimoDelLote, lista: lista, RANGOS: RANGOS, NUTRIENTES: NUTRIENTES, claveCultivo: claveCultivo };
})();
