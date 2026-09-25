/* SAFIA — Motor 8: Meta de rinde (plan tentativo para pasar de X a Y kg/ha)
   -------------------------------------------------------------------
   Toma el caso real del lote (suelo, agua, manejo, rinde), la meta que
   elige el usuario y los que ya cosechan eso en su zona, y arma un
   RECETARIO TENTATIVO ítem por ítem: qué cambiar, cuánto (dosis), cuánto
   cuesta (US$/ha), cuánto podría aportar (rango, orientativo, con fuente)
   y si conviene económicamente (ingreso extra, costo por kg adicional,
   relación con el valor de la tierra). No es una prescripción: es una
   evaluación para ir al agrónomo con números.

   Fuentes de las reglas (además de las de safia-agronomia.js):
   [1] CAPECO/IPTA 2012: rendimiento relativo esperado por categoría de
       P y K (muy baja <55 %, baja 56–80 %, media 81–90 %, alta 90–100 %),
       dosis correctivas y de manutención.
   [2] Manual RS/SC 2016: V% objetivo, NC = (V2 − V1) × CTC / PRNT.
   [3] Embrapa Cerrados (Circ. Téc. 32, 2005; Sousa & Lobato): yeso
       agrícola = 50 × % arcilla (kg/ha) para cultivos anuales cuando en
       20–60 cm hay Ca < 0,5 cmolc/dm³ o saturación de Al > 20 %;
       corrige el perfil y reduce el efecto de los veranillos.
   [7] Embrapa (Matopiba, Agropecuária Oeste): dosis altas de calcáreo +
       yeso en directa elevaron el rinde de soja 20–30 % al mejorar el
       ambiente radicular en profundidad.
   [8] Embrapa Soja: co-inoculación Bradyrhizobium + Azospirillum,
       +5–8 % de rinde promedio; inoculación anual recomendada.
   [9] FAO 56 / Embrapa: necesidad de agua soja 450–700 mm, maíz
       500–800 mm por ciclo según clima; el déficit en floración y
       llenado baja el rinde casi proporcionalmente.
   [10] Embrapa (estudio multianual, 2026): soja sobre braquiaria u otras
        gramíneas tropicales rindió en promedio +15 % (+515 kg/ha).
   [11] Fundação MS: soja después de Brachiaria brizantha Piatã en vez de
        maíz safrinha tardío: +17 %; "8 sacas más por hectárea" en 6
        zafras seguidas; menos nematodos, más estabilidad en seca.
   [12] Embrapa Soja / IDR-Paraná 2024/25: co-inoculación +8,33 % de
        promedio en unidades de referencia (3.916 kg/ha); ensayos previos
        hasta +16 % frente a inocular solo con Bradyrhizobium.
   [13] CESB (Desafio Nacional de Máxima Produtividade): los lotes de más
        de 100 sacas (6.000 kg/ha) comparten fertilidad construida, perfil
        corregido, rotación con gramíneas, calidad de semilla, población
        y stand uniformes, sanidad preventiva y mitigación de estrés.
   [14] CESB Circular Técnica 2: suelo de los lotes de más de 4.200–6.000
        kg/ha (V% 56–68 en 0–20, K 0,25–0,41 cmolc, Ca 3–4,3, Mg 1,3–1,8,
        B 0,7–1,0, Cu 1,3–3,4, Al ≈ 0, MO 3,9–4,5 %); 5 factores: perfil
        sin compactación, Ca y Mg en profundidad, K + B + Cu, sanidad y
        distribución de plantas. CESB 2024/25: promedio auditado 5.740
        kg/ha, irrigado 7.600, récord 8.130; 8 aplicaciones (R1, R3, R5).
   [15] Grassini et al. (UNL): productividad del agua límite 9,9 kg/ha
        por mm de ET para soja y 19,3 para maíz (100 mm no productivos);
        techo de rinde con riego 6.000–7.000 (Nebraska), GYGA Brasil Yp
        4,4–7,1 t/ha; brecha de los regados ~20 %. UNL G1367: soja usa
        508–660 mm por ciclo, 65 % entre R1 y R6, pico 8 mm/día; críticos
        R3–R6. Embrapa: 450–800 mm; atraso de siembra −38 kg/ha/día.
   [16] Embrapa Cerrados (micronutrientes): B 1–2 kg/ha, Zn 6, Cu 1–2, Mn 6
        kg/ha al suelo cada 4–5 años (¼ si el tenor es medio). S < 10
        mg/dm³ (Embrapa 2020) → reponer ≈ 5 kg S por t (Fertilizar).
   [17] Embrapa Soja, Comunicado Técnico 75 (Hungria, Campo, Franchini &
        Loureiro 2001) y Embrapa Cerrados (Mendes, Reis Jr., Hungria, Sousa
        & Campo 2008, PAB): no aplicar N a la soja en ningún estadio.
   [18] IPNI / Fertilizar, Requerimientos nutricionales de los cultivos
        (Archivo Agronómico 3, datos INTA): kg de nutriente exportado por t
        de grano seco (soja N 55 · P 6 · K 19; maíz 15/3/4; trigo 21/4/4;
        girasol 24/7/6; sorgo 20/4/4). Balance de nutrientes al cierre de
        campaña: ver FUNDAMENTOS_NUTRIENTES.md.
   Validación completa en FUNDAMENTOS_META_RINDE.md, FUNDAMENTOS_ALTO_RINDE.md y FUNDAMENTOS_FOLIAR.md. */
(function () {
  'use strict';

  // Techo de rinde de referencia con agua sin límite (kg/ha) y productividad del agua límite (Grassini, UNL) [15]
  var TECHO_REF = { soja: 7600, maiz: 14000, trigo: 6000, girasol: 4000, sorgo: 9000, otro: 6000 };   // soja: CESB irrigado nacional 7.600 (récord secano 8.130); el resto orientativo
  var WP_LIMITE = { soja: { kgMm: 9.9, noProductiva: 70 }, maiz: { kgMm: 19.3, noProductiva: 100 }, otro: { kgMm: 12, noProductiva: 80 } };   // soja/maíz: Grassini (UNL); intercepto de soja y "otro" son estimaciones a calibrar
  var PRECIOS_DEFAULT = {
    granoUSDt: { soja: 400, maiz: 170, trigo: 230, girasol: 400, sorgo: 150, otro: 250 },
    calcareoUSDt: 60,        // puesto y aplicado, PRNT ~80–100 %
    yesoUSDt: 70,
    p2o5USDkg: 1.35,         // MAP ~700 US$/t → 52 % P2O5
    k2oUSDkg: 0.85,          // KCl ~500 US$/t → 60 % K2O
    nUSDkg: 1.10,            // urea ~500 US$/t → 46 % N
    sUSDkg: 0.60,
    tratamientoSemillaUSDha: 25,
    inoculanteUSDha: 8,
    coinoculanteUSDha: 6,
    comoUSDha: 5,
    znUSDha: 8,
    boroUSDkg: 6.0,          // kg de B (bórax/ulexita puesto en el lote)
    znSueloUSDkg: 4.5,       // kg de Zn (sulfato de zinc)
    cuUSDkg: 7.0,            // kg de Cu (sulfato de cobre)
    coberturaUSDha: 45,      // semilla + siembra de la cobertura
    fungicidaUSDapl: 35,
    insecticidaUSDapl: 22,
    foliarUSDapl: 15,
    riegoUSDmm: 1.2,         // energía + operación por mm y por ha
    subsoladoUSDha: 60,
    nivelacionUSDha: 120,    // nivelación / sistematización / terraceo
    aplicacionVoleoUSDha: 12, // pasada de la distribuidora (calcáreo, yeso)
    analisisPerfilUSD: 40,   // muestreo 20–40 y 40–60 cm
    tierraUSDha: 20000
  };
  var AGUA_NECESARIA = { soja: 600, maiz: 650, trigo: 450, girasol: 600, sorgo: 500, otro: 550 }; // mm por ciclo, orientativo [9] (FAO-33: soja 450–700, maíz 500–800, trigo 450–650, girasol 600–1.000, sorgo 450–650)
  var N_POR_T = { maiz: 22, trigo: 26, girasol: 40, sorgo: 22 };   // kg N absorbidos por t de grano (soja: fija N)

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function claveCultivo(c) { var n = norm(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(v); return isNaN(x) ? null : x; }
  function fmt(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function prom(a) { var v = a.filter(function (x) { return x != null && !isNaN(x); }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  // Precios VIGENTES (Datos → Precios, con historial y sincronizados). El viejo 'safia_precios' del navegador ya no se usa.
  function precios(fecha) {
    if (window.SafiaPrecios) return fecha ? SafiaPrecios.en(fecha) : SafiaPrecios.vigentes().precios;
    return JSON.parse(JSON.stringify(PRECIOS_DEFAULT));
  }
  function guardarPrecios(p) { if (window.SafiaPrecios) SafiaPrecios.actualizar(p); }

  /* ---------- los que ya cosechan la meta (o los mejores) en la zona ---------- */
  function benchmark(caso, meta, casos) {
    var mismos = casos.filter(function (c) { return c !== caso && claveCultivo(c.cultivo) === claveCultivo(caso.cultivo) && c.rindeKgHa; });
    function nivel(f, nombre) { var l = mismos.filter(f); return l.length ? { ambito: nombre, casos: l } : null; }
    var local = nivel(function (c) { return caso.localidad && norm(c.localidad) === norm(caso.localidad); }, 'tu localidad');
    var depto = nivel(function (c) { return caso.departamento && norm(c.departamento) === norm(caso.departamento); }, 'tu departamento');
    var pais = nivel(function (c) { return true; }, 'todo el banco de SAFIA');
    var niveles = [local, depto, pais].filter(Boolean);
    var elegido = null;
    for (var i = 0; i < niveles.length; i++) { var top = niveles[i].casos.filter(function (c) { return c.rindeKgHa >= meta; }); if (top.length >= 2) { elegido = { ambito: niveles[i].ambito, casos: top, criterio: 'ya cosechan ' + fmt(meta, 0) + ' kg/ha o más' }; break; } }
    if (!elegido && pais) { var ord = pais.casos.slice().sort(function (a, b) { return b.rindeKgHa - a.rindeKgHa; }); var n = Math.max(1, Math.ceil(ord.length / 4)); elegido = { ambito: 'todo el banco de SAFIA', casos: ord.slice(0, n), criterio: 'son el 25 % que más rinde' }; }
    if (!elegido) return null;
    var cs = elegido.casos;
    var suelo = {};
    ['ph', 'mo', 'p', 'k', 'ca', 'mg', 'cic', 'satBases', 'arcilla'].forEach(function (k) { suelo[k] = prom(cs.map(function (c) { return c.suelo ? c.suelo[k] : null; })); });
    var prac = {};
    if (window.SafiaInsumos) SafiaInsumos.PRACTICAS.forEach(function (p) { var con = cs.filter(function (c) { return c.manejo && c.manejo.cargado; }); if (con.length) prac[p.k] = con.filter(function (c) { return SafiaInsumos.tiene(c.manejo, p.k); }).length / con.length; });
    var rot = cs.filter(function (c) { return c.rotacion && c.rotacion.cargada; });
    return { ambito: elegido.ambito, criterio: elegido.criterio, n: cs.length, rindeProm: prom(cs.map(function (c) { return c.rindeKgHa; })), rindeMax: Math.max.apply(null, cs.map(function (c) { return c.rindeKgHa; })),
      agua: prom(cs.map(function (c) { return c.aguaTotalMM; })), riego: prom(cs.map(function (c) { return c.riegoMM; })), suelo: suelo, practicas: prac,
      cobertura: rot.length ? rot.filter(function (c) { return c.rotacion.conCobertura; }).length / rot.length : null,
      variedades: cs.map(function (c) { return c.variedad; }).filter(Boolean), clientes: cs.map(function (c) { return c.cliente + ' ' + fmt(c.rindeKgHa, 0); }) };
  }

  /* ---------- el plan ---------- */
  function plan(caso, meta, pr, casos, analisisProfundos, opciones) {
    pr = pr || precios(); opciones = opciones || {};
    var cu = claveCultivo(caso.cultivo), perfil = window.SafiaAgro ? SafiaAgro.perfilCultivo(caso.cultivo) : { v: 65, mP: 12, mK: 12, expP: 10, expK: 10 };
    var s = caso.suelo || {}, actual = caso.rindeKgHa, metaT = meta / 1000;
    var bm = benchmark(caso, meta, casos || []);
    var items = [];
    function item(o) {
      o.inversion = o.inversion || 0; o.recurrente = o.recurrente || 0; o.vidaUtil = o.vidaUtil || 4;
      if (o.costo != null && !o.inversion && !o.recurrente) o.recurrente = o.costo;   // compatibilidad
      o.costo = o.inversion + o.recurrente; o.costoCampana = o.inversion / o.vidaUtil + o.recurrente;
      o.alcance = o.alcance || (o.tipo === 'suelo' ? 'lote' : 'cultivo');           // 'lote' beneficia a todos los cultivos del lote
      o.aporteMin = o.aporteMin || 0; o.aporteMax = o.aporteMax || 0; items.push(o);
    }
    var T = window.SafiaAgro ? SafiaAgro.TABLAS : null, F = window.SafiaFertilidad || null;   // tablas RS/SC 2016
    var AR = window.SafiaAgro && SafiaAgro.ALTO_RINDE ? SafiaAgro.ALTO_RINDE : null;
    var metaAlta = AR && ((cu === 'soja' && meta >= 5500) || (cu === 'maiz' && meta >= 10000) || (cu !== 'soja' && cu !== 'maiz' && metaT >= 4));   // el suelo objetivo pasa a ser el de los campeones [14]

    /* 1. Encalado: manual RS/SC (SMP si lo hay; si no, V 75 % para pH 6,0). Los que rinden la meta o el suelo de campeones pueden pedir más V% */
    var v = num(s.satBases), cic = num(s.cic), ph = num(s.ph);
    var cal = F ? F.calcario(s, { sistema: 'directa' }) : null, cal2 = F && F.cerrado ? F.cerrado.calcario(s) : null;
    var segCal = cal2 ? (cal2.necesita ? ' Embrapa 2013 / Fundação MS: sí encalar (' + cal2.motivos.join('; ') + ')' + (cal2.tHa != null ? ', ' + fmt(cal2.tHa, 1) + ' t/ha para V 70 %' : '') + '.' : ' Embrapa 2013 / Fundação MS: no hace falta (pH ≥ 5,8 y V ≥ 60).') : '';
    var vObj = cal && cal.dosisV ? cal.dosisV.vObjetivo : 75;
    var vExtra = Math.max(bm && bm.suelo.satBases ? Math.min(80, Math.round(bm.suelo.satBases)) : 0, metaAlta ? AR.v : 0);   // referencia de los que ya rinden la meta
    if (opciones.calcareoTnHa > 0) {
      item({ k: 'encalado', tipo: 'suelo', nombre: 'Encalado (dosis definida por el usuario)', hoy: v != null ? 'V% ' + fmt(v, 1) + (ph != null ? ' · pH ' + fmt(ph, 1) : '') : 'sin V% en el análisis', objetivo: cal && cal.completa != null ? 'la dosis del manual era ' + fmt(cal.completa, 1) + ' t/ha (' + cal.metodo + ')' : 'según criterio del agrónomo',
        accion: fmt(opciones.calcareoTnHa, 1) + ' t/ha de calcáreo ' + (cal ? cal.tipo : 'calcítico o dolomítico') + ', al voleo sobre el rastrojo apenas cosechado el cultivo anterior, con una pasada de escarificador/subsolador para que penetre; sin arar',
        inversion: opciones.calcareoTnHa * pr.calcareoUSDt + pr.aplicacionVoleoUSDha, vidaUtil: 4, aporteMin: v != null && v < 50 ? 0.10 : (v != null && v < 60 ? 0.05 : 0.02), aporteMax: v != null && v < 50 ? 0.20 : (v != null && v < 60 ? 0.12 : 0.06), fuente: '[2][7] dosis del usuario' });
    } else if (cal && (cal.necesita || (cal2 && cal2.necesita) || (v != null && v < vExtra)) && (cal.completa != null || (cal2 && cal2.tHa != null))) {
      if (cal.completa == null) { cal.completa = cal2.tHa; cal.sugerida = cal2.tHa; cal.metodo = 'saturación de bases a V 70 % (Embrapa/Fundação MS)'; cal.regla = 'en superficie, sin pasar de 5 t/ha por vez'; }
      var nc = cal.sugerida, ap = v == null || v < 50 ? [0.10, 0.20] : (v < 60 ? [0.05, 0.12] : [0.02, 0.06]);
      item({ k: 'encalado', tipo: 'suelo', nombre: 'Encalado', hoy: (v != null ? 'V% ' + fmt(v, 1) : '') + (ph != null ? ' · pH ' + fmt(ph, 1) : '') + (num(s.phSmp) != null ? ' · SMP ' + fmt(num(s.phSmp), 1) : ''), objetivo: 'pH 6,0 (V% ' + vObj + ')' + (bm && bm.suelo.satBases ? ' · los que rinden ≥ meta: ' + fmt(bm.suelo.satBases, 0) : ''),
        accion: fmt(nc, 1) + ' t/ha de calcáreo ' + cal.tipo + ' (PRNT 100 %) por ' + cal.metodo + '; ' + cal.regla + '. Al voleo sobre el rastrojo apenas cosechado el cultivo anterior' + (cal.nota ? '. ' + cal.nota : '') + (cal.motivos.length && !cal.necesita ? '. RS/SC no lo exige (' + cal.motivos.join('; ') + ')' + (cal2 && cal2.necesita ? '' : '; se incluye por la referencia de los que rinden la meta') : '') + segCal,
        inversion: nc * pr.calcareoUSDt + pr.aplicacionVoleoUSDha, vidaUtil: 4, aporteMin: ap[0], aporteMax: ap[1], fuente: '[2][7]' });
    } else if (cal && opciones.preparacionCompleta) {
      item({ k: 'encalado', tipo: 'suelo', nombre: 'Encalado de mantenimiento', hoy: 'V% ' + fmt(v, 1), objetivo: 'sostener pH 6,0', accion: '1,0 t/ha de calcáreo cada 3–4 años para reponer lo que se acidifica con la fertilización nitrogenada y la extracción', inversion: 1.0 * pr.calcareoUSDt + pr.aplicacionVoleoUSDha, vidaUtil: 4, aporteMin: 0.01, aporteMax: 0.03, fuente: '[2]' });
    } else if (cal && v != null) item({ k: 'encalado', tipo: 'suelo', nombre: 'Encalado', hoy: 'V% ' + fmt(v, 1) + (ph != null ? ' · pH ' + fmt(ph, 1) : ''), objetivo: 'pH ≥ 5,5 · V% ≥ 65 · Al < 10 %', accion: 'No hace falta: ' + (cal.motivos.length ? cal.motivos.join('; ') : 'ya está en el objetivo') + '.' + segCal + ' Repetir análisis cada 2 años', fuente: '[2][3]' });
    /* 2. Perfil (yeso) */
    var supLoteHa = num(caso.superficie) || (function () { try { var eq = JSON.parse(localStorage.getItem('equipos') || '[]').find(function (e) { return String(e.id) === String(caso.equipoId); }); return eq && num(eq.superficie) ? num(eq.superficie) : null; } catch (e) { return null; } })() || 100;
    var arc = num(s.arcilla);
    var prof = (analisisProfundos || []).filter(function (a) { return /(20|30|40).*(40|60)/.test(String(a.profundidad || '')); });
    var dosisYeso = arc != null ? Math.round(50 * arc / 100) * 100 : null; // kg/ha, Embrapa: 50 × % arcilla
    if (prof.length) {
      var ult = prof[prof.length - 1], caProf = num(ult.ca);
      if (caProf != null && caProf < 0.5) item({ k: 'yeso', tipo: 'suelo', nombre: 'Yeso agrícola (perfil 20–60 cm)', hoy: 'Ca ' + fmt(caProf, 2) + ' cmolc/dm³ en ' + esc(ult.profundidad), objetivo: 'Ca > 0,5 y Al < 20 % en profundidad', accion: fmt(dosisYeso, 0) + ' kg/ha de yeso (50 × % arcilla), al voleo con el encalado', inversion: dosisYeso / 1000 * pr.yesoUSDt + pr.aplicacionVoleoUSDha, vidaUtil: 5, aporteMin: 0.03, aporteMax: 0.10, fuente: '[3][7]' });
      else item({ k: 'yeso', tipo: 'suelo', nombre: 'Perfil (20–60 cm)', hoy: 'Ca ' + fmt(caProf, 2) + ' en ' + esc(ult.profundidad), objetivo: 'Ca > 0,5 cmolc/dm³', accion: 'El perfil está bien provisto de calcio: no hace falta yeso ahora', fuente: '[3]' });
    } else if (opciones.yeso && dosisYeso) {
      item({ k: 'yeso', tipo: 'suelo', nombre: 'Yeso agrícola (perfil 20–60 cm)', hoy: 'sin análisis en profundidad (incluido por decisión del usuario)', objetivo: 'Ca > 0,5 cmolc/dm³ y Al < 20 % hasta 60 cm', accion: fmt(dosisYeso, 0) + ' kg/ha de yeso (50 × % arcilla, Embrapa), al voleo junto con el calcáreo; confirmar con análisis de 20–40 y 40–60 cm', inversion: dosisYeso / 1000 * pr.yesoUSDt + pr.aplicacionVoleoUSDha + pr.analisisPerfilUSD, vidaUtil: 5, aporteMin: 0.03, aporteMax: 0.10, fuente: '[3][7]' });
    } else {
      item({ k: 'yeso', tipo: 'suelo', nombre: 'Perfil profundo (20–40 y 40–60 cm)', hoy: 'sin análisis en profundidad', objetivo: 'Ca > 0,5 cmolc/dm³ y Al < 20 % hasta 60 cm', accion: 'Muestrear 20–40 y 40–60 cm. Si hay Ca bajo o Al alto: ' + (dosisYeso ? fmt(dosisYeso, 0) + ' kg/ha de yeso (50 × % arcilla)' : 'yeso = 50 × % arcilla kg/ha') + '. Hoy la corrección del perfil se hace con calcáreo + yeso en directa, no solo 0–20 cm', inversion: pr.analisisPerfilUSD / supLoteHa, vidaUtil: 1, aporteMin: 0, aporteMax: 0.08, condicional: true, fuente: '[3][7]' });
    }
    /* 3. Fósforo: clase por arcilla (RS/SC 6.4), corrección 6.1.1 gradual + manutención 6.1.2 por la meta; "construir" más allá del crítico solo para alto rinde */
    var p = num(s.p), iP = F ? F.interpretarP(p, arc) : null;
    if (iP) {
      var cat = iP.clase, pc = iP, kgPorMg = T && T.KG_P2O5_POR_MG ? T.KG_P2O5_POR_MG[iP.claseArcilla] : 25;
      var dP = F.dosisPK(cat, caso.cultivo, metaT, 'p2o5', false, iP.limites[3] ? p / iP.limites[3] : null);
      var pObj = Math.max(pc.critico, bm && bm.suelo.p ? Math.min(pc.critico * 2, bm.suelo.p) : 0, metaAlta ? Math.round(pc.critico * AR.pFactor) : 0);   // alto rinde: 1,4 × crítico (Embrapa CT33)
      if (opciones.construirPK) pObj = Math.max(pObj, Math.round(pc.critico * 1.5));
      var corr = dP.correccion ? F.correccion(cat, 'p2o5').total : 0;                       // corrección del manual (total, gradual 2/3 + 1/3)
      var construir = !corr && p < pObj ? Math.round((pObj - p) * kgPorMg) : 0; if (construir < 10) construir = 0;   // por encima del crítico: costo Cubilla
      var manTotal = dP.manutencion || dP.reposicion || 0;
      var aplicadoP = caso.manejo && caso.manejo.cargado && caso.manejo.npk ? Math.round(caso.manejo.npk.p2o5) : null;
      var manActual = F.dosisPK(cat, caso.cultivo, actual / 1000, 'p2o5').manutencion || F.dosisPK(cat, caso.cultivo, actual / 1000, 'p2o5').reposicion || 0;
      // Gasto ADICIONAL por campaña: si el manejo está cargado, lo que falta sobre lo aplicado; si no, la diferencia de manutención entre la meta y el rinde actual
      var man = aplicadoP != null ? Math.max(0, manTotal - aplicadoP) : Math.max(0, manTotal - manActual);
      var apP = { 'muy bajo': [0.25, 0.45], bajo: [0.10, 0.25], medio: [0.03, 0.10], alto: [0, 0.03], 'muy alto': [0, 0] }[cat];
      var iP2 = F.cerrado ? F.cerrado.interpretarP(p, arc) : null;
      item({ k: 'fosforo', tipo: 'suelo', nombre: 'Fósforo', hoy: fmt(p, 1) + ' mg/dm³ (RS/SC: ' + cat + ', crítico ' + pc.critico + (iP.asumida ? ', arcilla asumida 41–60 %' : '') + (iP2 ? ' · Embrapa/Fundação MS: ' + iP2.clase + ', crítico ' + iP2.critico : '') + ')', objetivo: fmt(pObj, 0) + ' mg/dm³' + (bm && bm.suelo.p ? ' · los que rinden ≥ meta: ' + fmt(bm.suelo.p, 1) : ''),
        accion: (corr ? 'Corregir ' + fmt(corr, 0) + ' kg/ha de P₂O₅ (' + F.correccion(cat, 'p2o5').primero + ' ahora y ' + F.correccion(cat, 'p2o5').segundo + ' en el cultivo siguiente, RS/SC) + ' : (construir ? 'Construir ' + fmt(construir, 0) + ' kg/ha de P₂O₅ para llegar a ' + fmt(pObj, 0) + ' mg/dm³ (' + kgPorMg + ' kg por mg/dm³) + ' : '')) + (cat === 'muy alto' ? 'solo reposición ' : 'manutención ') + fmt(manTotal, 0) + ' kg/ha de P₂O₅ para ' + fmt(meta, 0) + ' kg/ha (RS/SC: ' + F.manutencion(caso.cultivo).p2o5 + ' kg para ' + F.manutencion(caso.cultivo).ref + ' t + ' + F.manutencion(caso.cultivo).base.addP + ' por t extra)' + (aplicadoP != null ? ' — hoy aplicás ' + fmt(aplicadoP, 0) + ': el adicional son ' + fmt(man, 0) + ' kg/ha' : ' — como el manejo no está cargado, se cuenta como adicional solo la diferencia con la manutención del rinde actual: ' + fmt(man, 0) + ' kg/ha'),
        inversion: (corr + construir) * pr.p2o5USDkg, vidaUtil: 4, recurrente: man * pr.p2o5USDkg, aporteMin: apP[0], aporteMax: apP[1], fuente: '[2]' + (construir ? '[1]' : '') });
    }
    /* 4. Potasio: clase por CTC (RS/SC 6.9), corrección 6.1.1 + manutención 6.1.2 */
    var k = num(s.k), iK = F ? F.interpretarK(k, num(s.cic)) : null;
    if (iK) {
      var kmg = iK.valorMg, catK = iK.clase;
      var dK = F.dosisPK(catK, caso.cultivo, metaT, 'k2o', false, iK.limites[3] ? kmg / iK.limites[3] : null);
      var corrK = dK.correccion ? F.correccion(catK, 'k2o').total : 0;
      var construirK = 0;
      if ((opciones.construirPK || metaAlta) && !corrK && kmg < 117) construirK = Math.round((117 - kmg) * 2.4 * 1.2 / 10) * 10; // llevar K a ~117 mg/dm³ = 0,30 cmolc (campeones 0,25–0,41 [14]); ≈ 2 kg K2O por mg/dm³ + 20 % pérdidas
      var manKTotal = dK.manutencion || dK.reposicion || 0;
      var aplicadoK = caso.manejo && caso.manejo.cargado && caso.manejo.npk ? Math.round(caso.manejo.npk.k2o) : null;
      var manKActual = F.dosisPK(catK, caso.cultivo, actual / 1000, 'k2o').manutencion || F.dosisPK(catK, caso.cultivo, actual / 1000, 'k2o').reposicion || 0;
      var manK = aplicadoK != null ? Math.max(0, manKTotal - aplicadoK) : Math.max(0, manKTotal - manKActual);
      var apK = { 'muy bajo': [0.20, 0.45], bajo: [0.10, 0.20], medio: [0.03, 0.10], alto: [0, 0.03], 'muy alto': [0, 0] }[catK];
      var iK2 = F.cerrado ? F.cerrado.interpretarK(k, arc, num(s.cic)) : null;
      item({ k: 'potasio', tipo: 'suelo', nombre: 'Potasio', hoy: fmt(kmg, 0) + ' mg/dm³ (RS/SC: ' + catK + ', crítico ' + iK.critico + ' para CTC ' + iK.ctcTexto + (iK2 ? ' · Embrapa/Fundação MS: ' + iK2.clase + ', crítico ' + iK2.criticoMg : '') + ')', objetivo: '> ' + iK.critico + ' mg/dm³' + (bm && bm.suelo.k ? ' · los que rinden ≥ meta: ' + fmt(bm.suelo.k * 391, 0) : ''),
        accion: (corrK ? 'Corregir ' + fmt(corrK, 0) + ' kg/ha de K₂O (' + F.correccion(catK, 'k2o').primero + ' ahora y ' + F.correccion(catK, 'k2o').segundo + ' en el cultivo siguiente, RS/SC) + ' : (construirK ? 'Construir ' + fmt(construirK, 0) + ' kg/ha de K₂O para llegar a ~117 mg/dm³ + ' : '')) + (catK === 'muy alto' ? 'solo reponer lo exportado: ' : 'manutención ') + fmt(manKTotal, 0) + ' kg/ha de K₂O (KCl al voleo o por fertirriego; RS/SC: ' + F.manutencion(caso.cultivo).k2o + ' kg para ' + F.manutencion(caso.cultivo).ref + ' t + ' + F.manutencion(caso.cultivo).base.addK + ' por t extra)' + (aplicadoK != null ? ' — hoy aplicás ' + fmt(aplicadoK, 0) + ': el adicional son ' + fmt(manK, 0) + ' kg/ha' : ' — adicional sobre la manutención del rinde actual: ' + fmt(manK, 0) + ' kg/ha'),
        inversion: (corrK + construirK) * pr.k2oUSDkg, vidaUtil: 4, recurrente: manK * pr.k2oUSDkg, aporteMin: apK[0], aporteMax: apK[1], fuente: '[2]' + (construirK ? '[14]' : '') });
    }
    /* 4b. Reposición del saldo de la cosecha anterior (balance de nutrientes: lo que el grano se llevó y no se repuso) */
    var sa = opciones.saldoAnterior;
    if (sa && ((sa.p2o5 || 0) > 5 || (sa.k2o || 0) > 5)) {
      var repP = Math.round(sa.p2o5 || 0), repK = Math.round(sa.k2o || 0);
      item({ k: 'reposicion', tipo: 'suelo', nombre: 'Reposición de la cosecha anterior', hoy: 'La campaña anterior (' + (sa.cultivo || '') + ', ' + fmt(sa.rinde, 0) + ' kg/ha) se llevó más ' + (repP && repK ? 'P y K' : (repP ? 'P' : 'K')) + ' de lo que se aplicó', objetivo: 'Volver a dejar el suelo como estaba',
        accion: 'Reponer ' + (repP ? fmt(repP, 0) + ' kg/ha de P₂O₅' : '') + (repP && repK ? ' y ' : '') + (repK ? fmt(repK, 0) + ' kg/ha de K₂O' : '') + ' además de la manutención de esta campaña (saldo negativo del balance de nutrientes de ' + (sa.campana || 'la cosecha anterior') + ')' + (sa.sinCarga ? '. Ojo: esa campaña no tiene fertilizantes cargados; si se aplicó algo, cargalo y el saldo baja' : ''),
        recurrente: repP * pr.p2o5USDkg + repK * pr.k2oUSDkg, aporteMin: 0.02, aporteMax: 0.06, fuente: '[18]' });
    }
    /* 5. Nitrógeno (no soja): RS/SC por materia orgánica, cultivo anterior y rinde esperado (maíz cap. 6.1.14, trigo cap. 6.1.29) */
    if (cu !== 'soja') {
      var mo = num(s.mo), aplicadoN = caso.manejo && caso.manejo.cargado && caso.manejo.npk ? caso.manejo.npk.n : 0;
      var rN = F ? F.nitrogeno(caso.cultivo, mo, caso.cultivoAnterior || (caso.rotacion && caso.rotacion.anterior) || '', metaT) : { n: Math.round(metaT * (N_POR_T[cu] || 20)), regla: 'kg N por t' };
      var dosisN = rN.n, faltaHoy = Math.max(0, dosisN - (aplicadoN || 0));
      var rNActual = F ? F.nitrogeno(caso.cultivo, mo, caso.cultivoAnterior || '', actual / 1000).n : Math.round(actual / 1000 * (N_POR_T[cu] || 20));
      var nAdicional = aplicadoN ? faltaHoy : Math.max(0, dosisN - rNActual);
      item({ k: 'nitrogeno', tipo: 'suelo', nombre: 'Nitrógeno', hoy: (aplicadoN ? fmt(aplicadoN, 0) + ' kg N/ha aplicados' : 'sin N registrado') + (mo != null ? ' · MO ' + fmt(mo, 2) + ' % (' + (F ? F.claseMO(mo) : '') + ')' : ' · MO sin dato (se asume media)') + (rN.antecesor ? ' · antecesor ' + rN.antecesor : ''), objetivo: fmt(dosisN, 0) + ' kg N/ha para ' + fmt(meta, 0) + ' kg/ha (' + rN.regla + ')',
        accion: 'Aplicar ~' + fmt(dosisN, 0) + ' kg N/ha (' + fmt(dosisN / 0.46, 0) + ' kg de urea): 15–20 a la siembra y el resto en cobertura ' + (cu === 'trigo' ? 'entre macollaje y encañazón' : 'V4–V6') + (caso.riegoMM != null ? ' o por fertirriego' : '') + (aplicadoN ? ' — faltan ' + fmt(faltaHoy, 0) + ' kg/ha' : ''), costo: nAdicional * pr.nUSDkg, aporteMin: faltaHoy > 30 ? 0.08 : 0, aporteMax: faltaHoy > 30 ? 0.20 : 0.03, fuente: '[2] ' + (rN.fuente || '') });
    }
    /* 6. Azufre y micronutrientes */
    var tieneS = caso.manejo && caso.manejo.npk && caso.manejo.npk.s > 5;
    var sSuelo = num(s.azufre), bSuelo = num(s.boro), znSuelo = num(s.zinc), cuSuelo = num(s.cobre);
    if (!tieneS && sSuelo != null && sSuelo < 10) item({ k: 'azufre', tipo: 'suelo', nombre: 'Azufre', hoy: fmt(sSuelo, 1) + ' mg/dm³ (' + (sSuelo < 5 ? 'bajo' : 'medio') + ')', objetivo: '≥ 10 mg/dm³ · reponer ≈ 5 kg S por t', accion: fmt(Math.round(metaT * 5), 0) + ' kg S/ha (yeso ' + fmt(Math.round(metaT * 5 * 6.5), 0) + ' kg/ha o sulfato de amonio); el yeso además lleva Ca al subsuelo', costo: Math.round(metaT * 5) * pr.sUSDkg, aporteMin: sSuelo < 5 ? 0.03 : 0.01, aporteMax: sSuelo < 5 ? 0.08 : 0.04, fuente: '[16]' });
    else if (!tieneS && sSuelo == null && (num(s.mo) == null || num(s.mo) < 3)) item({ k: 'azufre', tipo: 'suelo', nombre: 'Azufre', hoy: 'sin fuente de S registrada', objetivo: '20–30 kg S/ha', accion: '25 kg S/ha (yeso 150 kg/ha o sulfato de amonio)', costo: 25 * pr.sUSDkg, aporteMin: 0.02, aporteMax: 0.05, fuente: '[1] RS/SC: S en suelos con MO < 3 %' });
    var C2 = F && F.cerrado ? F.cerrado : null;
    [['boro', 'boro', 'Boro', 'boroUSDkg', 'al suelo (bórax o ulexita, dura 4–5 años) o foliar en floración; no exceder', [0.03, 0.08]], ['zinc', 'zinc_suelo', 'Zinc (suelo)', 'znSueloUSDkg', 'al suelo (sulfato de zinc, dura 4–5 años) o en semilla + foliar', [0.02, 0.06]], ['cobre', 'cobre', 'Cobre', 'cuUSDkg', 'al suelo (sulfato de cobre) o foliar', [0.01, 0.04]], ['manganeso', 'manganeso', 'Manganeso', 'cuUSDkg', 'foliar en V4–R1 o al suelo', [0.01, 0.03]]].forEach(function (d) {
      var val = num(s[d[0]]); if (val == null || !C2) return; var im = C2.interpretarMicro(d[0], val); if (im.clase !== 'bajo' && im.clase !== 'medio') return;
      item({ k: d[1], tipo: 'suelo', nombre: d[2], hoy: fmt(val, 2) + ' mg/dm³ (' + im.clase + ')', objetivo: '≥ ' + fmt(im.limites[1], 2) + ' mg/dm³ (Embrapa 2013)', accion: im.dosis + ' kg/ha ' + d[4] + (im.clase === 'medio' ? ' (dosis de "medio": para alto rinde)' : ''), inversion: im.dosis * (pr[d[3]] || 6) + 6, vidaUtil: 4, aporteMin: im.clase === 'bajo' ? d[5][1] / 2 : d[5][0], aporteMax: im.clase === 'bajo' ? d[5][1] : d[5][0] * 2, fuente: '[16] Embrapa 2013 / Fundação MS Tabelas 21–22' });
    });
    // Nitrógeno en soja: la pregunta que más se hace; la respuesta de Embrapa es no (9 + 15 ensayos) [17]
    if (cu === 'soja') item({ k: 'n_soja', tipo: 'manejo', nombre: 'Nitrógeno en soja', hoy: 'fija su propio N', objetivo: 'no aplicar N en ningún estadio', accion: 'Embrapa Soja y Embrapa Cerrados: 50 kg de N en floración (R1) o en llenado (R5) no aumentaron el rinde en 9 ensayos de PR/MT, y en el Cerrado hubo respuesta en solo 2 de 15 (+154–216 kg/ha) sin retorno económico; el N a la siembra redujo la nodulación 20–86 %. La plata rinde más en inoculación, CoMo y micronutrientes', costo: 0, fuente: '[17]' });
    // Deficiencias vistas en la hoja (último análisis foliar del lote): para mirar, sin costo fijado
    if (opciones.foliar && window.SafiaFoliar) {
      try {
        var lf = SafiaFoliar.interpretar(opciones.foliar), bajosF = lf.filter(function (h) { return h.estado === 'bajo' || h.estado === 'limite'; });
        if (bajosF.length) item({ k: 'foliar', tipo: 'suelo', nombre: 'Hoja: nutrientes por debajo del rango', hoy: bajosF.map(function (h) { return h.n.replace(/\s*\(.*$/, '') + ' ' + fmt(h.valor, h.unidad === 'g/kg' ? 1 : 0) + ' ' + h.unidad; }).join(', ') + ' (muestreo ' + String(opciones.foliar.fecha || '').slice(0, 10) + ')', objetivo: 'todos dentro del rango de Embrapa/Fertilizar', accion: 'La planta no llegó a absorber lo que necesita: ' + (SafiaFoliar.recomendaciones(opciones.foliar, lf, []).filter(function (r) { return r.k !== 'n_ok'; }).map(function (r) { return r.titulo; }).join('; ') || 'ver la lectura foliar en el Banco'), costo: 0, fuente: 'Análisis foliar del lote' });
      } catch (e) { /* sin foliar */ }
    }
    var man = caso.manejo || {};
    if (cu === 'soja' && !(man.cargado && man.microSemilla)) item({ k: 'como', tipo: 'manejo', nombre: 'Cobalto y molibdeno en semilla', hoy: man.cargado ? 'no se usó' : 'no registrado', objetivo: 'CoMo en cada siembra', accion: 'CoMo en el tratamiento de semilla (mejora la fijación de N)', costo: pr.comoUSDha, aporteMin: 0.02, aporteMax: 0.05, fuente: '[8]' });
    if (cu === 'maiz' && !(man.cargado && (man.microSemilla || man.foliares))) item({ k: 'zinc', tipo: 'manejo', nombre: 'Zinc', hoy: man.cargado ? 'sin Zn' : 'no registrado', objetivo: 'Zn en semilla o foliar V4–V6', accion: 'Zinc en semilla o 1 foliar de Zn + B', costo: pr.znUSDha, aporteMin: 0.02, aporteMax: 0.06, fuente: 'Embrapa Milho: Zn es el micro más limitante en suelos ácidos' });
    /* 7. Manejo: inoculación, tratamiento, cobertura, siembra, protección */
    if (cu === 'soja') {
      if (!(man.cargado && man.inoculacion)) item({ k: 'inoculacion', tipo: 'manejo', nombre: 'Inoculación + co-inoculación', hoy: man.cargado ? 'no se usó' : 'no registrado', objetivo: 'Bradyrhizobium + Azospirillum cada siembra', accion: 'Inocular (líquido en el surco o en semilla) y co-inocular', costo: pr.inoculanteUSDha + pr.coinoculanteUSDha, aporteMin: 0.05, aporteMax: 0.15, fuente: '[8][12]' });
      else if (!man.coinoculacion) item({ k: 'coinoculacion', tipo: 'manejo', nombre: 'Co-inoculación', hoy: 'solo Bradyrhizobium', objetivo: '+ Azospirillum brasilense', accion: 'Agregar co-inoculante (líquido en el surco o en semilla)', costo: pr.coinoculanteUSDha, aporteMin: 0.05, aporteMax: 0.10, fuente: '[8][12]' });
    }
    if (!(man.cargado && man.tratamientoSemilla)) item({ k: 'tratamiento', tipo: 'manejo', nombre: 'Tratamiento de semilla', hoy: man.cargado ? 'no se usó' : 'no registrado', objetivo: 'fungicida + insecticida', accion: 'Tratar la semilla (fungicida + insecticida) para stand parejo', costo: pr.tratamientoSemillaUSDha, aporteMin: 0.03, aporteMax: 0.08, fuente: 'Embrapa Soja / BASF PY' });
    var rot = caso.rotacion || {};
    if (rot.cargada && !rot.conCobertura) item({ k: 'cobertura', tipo: 'manejo', nombre: 'Cobertura de invierno', hoy: 'sin cobertura', objetivo: (bm && bm.cobertura != null ? fmt(bm.cobertura * 100, 0) + ' % de los que rinden ≥ meta usan cobertura' : 'brachiaria, avena o mix'), accion: 'Sembrar cobertura después de la cosecha (brachiaria ruziziensis, avena, mix)', recurrente: pr.coberturaUSDha, alcance: 'lote', aporteMin: 0.05, aporteMax: 0.15, fuente: '[10][11] Embrapa +15 %, Fundação MS +17 %' });
    if (opciones.subsolado && !rot.convencional) item({ k: 'subsolado', tipo: 'suelo', nombre: 'Subsolado / descompactación', hoy: rot.subsolado ? 'ya se subsoló' : 'sin dato de compactación', objetivo: 'perfil sin capa compactada (medir con penetrómetro)', accion: 'Una pasada de subsolador a 35–45 cm antes de la cobertura; después no remover más', inversion: pr.subsoladoUSDha, vidaUtil: 3, aporteMin: 0.02, aporteMax: 0.08, fuente: 'Embrapa: compactación en suelos arcillosos con tránsito' });
    if (opciones.nivelacion) item({ k: 'nivelacion', tipo: 'suelo', nombre: 'Nivelación / sistematización', hoy: 'incluida por decisión del usuario', objetivo: 'sin encharcamientos ni erosión; riego parejo', accion: 'Nivelar y sistematizar el lote (terrazas, desagües) una vez', inversion: pr.nivelacionUSDha, vidaUtil: 8, aporteMin: 0.01, aporteMax: 0.05, fuente: 'práctica de campo' });
    if (opciones.otrosUSD > 0) item({ k: 'otros', tipo: 'suelo', nombre: 'Otros trabajos de preparación', hoy: opciones.otrosDetalle || 'indicado por el usuario', objetivo: '—', accion: opciones.otrosDetalle || 'Trabajos adicionales de preparación del lote', inversion: opciones.otrosUSD, vidaUtil: opciones.otrosVida || 5, aporteMin: 0, aporteMax: 0.03, fuente: 'usuario' });
    if (rot.convencional) item({ k: 'directa', tipo: 'manejo', nombre: 'Siembra directa', hoy: 'convencional (rastroneada)', objetivo: 'directa sobre cobertura o rastrojo', accion: 'Pasar a siembra directa; si hay compactación, subsolar una vez y sembrar cobertura', inversion: pr.subsoladoUSDha, vidaUtil: 3, aporteMin: 0.03, aporteMax: 0.08, fuente: 'Manual RS/SC / Embrapa' });
    if (rot.sojaSobreSoja) item({ k: 'rotacion', tipo: 'manejo', nombre: 'Rotación', hoy: 'soja sobre soja', objetivo: 'maíz, trigo o gramínea antes de la soja', accion: 'Rotar: maíz zafriña o cobertura de gramínea entre sojas', costo: 0, aporteMin: 0.05, aporteMax: 0.12, fuente: '[10][11][13] rotación con gramíneas' });
    var nFung = man.cargado ? (man.fungicidas || 0) : null, fungObj = cu === 'soja' ? 2 : 1;
    if (nFung != null && nFung < fungObj) item({ k: 'fungicidas', tipo: 'manejo', nombre: 'Fungicidas', hoy: nFung + ' aplicación(es)', objetivo: fungObj + '+ (' + (cu === 'soja' ? 'roya y mancha' : 'manchas foliares') + ')', accion: 'Sumar ' + (fungObj - nFung) + ' aplicación(es) preventiva(s) en R1–R5', costo: (fungObj - nFung) * pr.fungicidaUSDapl, aporteMin: 0.05, aporteMax: 0.15, fuente: 'Embrapa Soja: la roya sin control pierde hasta 90 %; 2–3 aplicaciones preventivas' });
    /* 8. Agua */
    var agua = caso.aguaTotalMM, necesitaClima = (caso.clima && caso.clima.et0Total) ? Math.round(caso.clima.et0Total * 1.0) : AGUA_NECESARIA[cu];
    var wp = WP_LIMITE[cu] || WP_LIMITE.otro, necesitaMeta = Math.round(meta / wp.kgMm + wp.noProductiva);   // mm de ET que exige la meta con la productividad del agua límite [15]
    var necesita = Math.max(necesitaClima, necesitaMeta);
    if (agua != null) {
      var deficit = Math.max(0, necesita - agua);
      var costoRiego = (caso.riego !== false && deficit > 30) ? Math.round(deficit * pr.riegoUSDmm) : 0;
      if (deficit > 30 && caso.riego !== false) item({ k: 'agua', tipo: 'agua', nombre: 'Agua del ciclo', hoy: fmt(agua, 0) + ' mm (lluvia ' + fmt(caso.lluviaMM || 0, 0) + ' + riego ' + fmt(caso.riegoMM || 0, 0) + ') = ' + fmt(agua > wp.noProductiva ? (agua - wp.noProductiva) * wp.kgMm : 0, 0) + ' kg/ha de techo por agua', objetivo: fmt(necesita, 0) + ' mm (' + fmt(meta, 0) + ' kg/ha ÷ ' + wp.kgMm + ' kg/mm + ' + wp.noProductiva + ' no productivos' + (necesitaClima > necesitaMeta ? '; ET₀ del ciclo ' + fmt(necesitaClima, 0) : '') + ')', accion: 'Completar ~' + fmt(deficit, 0) + ' mm con riego, concentrados entre R1 y R6 (65 % del consumo; críticos R3–R6, pico 8 mm/día). Costo estimado US$ ' + fmt(costoRiego, 0) + '/ha (' + pr.riegoUSDmm + ' US$/mm)', recurrente: costoRiego, aporteMin: clamp(deficit / necesita * 0.6, 0.03, 0.25), aporteMax: clamp(deficit / necesita, 0.05, 0.35), fuente: '[15][9]' });
      else if (deficit > 30) item({ k: 'agua', tipo: 'agua', nombre: 'Agua del ciclo', hoy: fmt(agua, 0) + ' mm en secano', objetivo: fmt(necesita, 0) + ' mm', accion: 'Faltaron ~' + fmt(deficit, 0) + ' mm: es el techo del secano; con riego se cubre', costo: 0, aporteMin: 0, aporteMax: clamp(deficit / necesita, 0.05, 0.30), condicional: true, fuente: '[9]' });
      else item({ k: 'agua', tipo: 'agua', nombre: 'Agua del ciclo', hoy: fmt(agua, 0) + ' mm = techo por agua ' + fmt(Math.max(0, (agua - wp.noProductiva) * wp.kgMm), 0) + ' kg/ha', objetivo: fmt(necesita, 0) + ' mm para ' + fmt(meta, 0) + ' kg/ha', accion: 'Cubierta en volumen. Lo que decide es el momento: sin déficit en R3–R6 (llenado), que concentra el 65 % del consumo', costo: 0, fuente: '[15][9]' });
    }
    /* 8b. Semilla, población y stand (CESB) — informativo */
    item({ k: 'stand', tipo: 'manejo', nombre: 'Calidad de semilla, población y stand', hoy: caso.densidad ? fmt(caso.densidad, 0) + ' plantas/ha' : 'densidad sin dato', objetivo: 'semilla de alto vigor, población recomendada para el material y stand parejo (plantabilidad)', accion: 'Revisar vigor y germinación de la semilla, regular la sembradora (velocidad ≤ 6 km/h, profundidad uniforme) y ajustar la población a la variedad; los lotes de más de 6.000 kg/ha del CESB lo tienen como base', costo: 0, fuente: '[13]' });
    /* 9. Genética (informativo) */
    if (bm && bm.variedades.length) { var vs = {}; bm.variedades.forEach(function (x) { vs[x] = (vs[x] || 0) + 1; }); var topV = Object.keys(vs).sort(function (a, b) { return vs[b] - vs[a]; }).slice(0, 3); item({ k: 'variedad', tipo: 'manejo', nombre: 'Material genético', hoy: caso.variedad || 'sin dato', objetivo: 'los que rinden ≥ meta usan: ' + topV.join(', '), accion: 'Comparar en el ranking de variedades y probar en una franja', costo: 0, fuente: 'banco de casos SAFIA' }); }

    /* Potencial y economía */
    var sumMin = items.reduce(function (a, i) { return a + (i.condicional ? 0 : i.aporteMin); }, 0), sumMax = items.reduce(function (a, i) { return a + i.aporteMax; }, 0);
    var techo = bm ? bm.rindeMax : null, techoRef = TECHO_REF[cu] || TECHO_REF.otro;
    var potMin = Math.round(actual * (1 + Math.min(sumMin, 0.4))), potMax = Math.round(actual * (1 + Math.min(sumMax, 0.5)));
    if (techo && bm.n >= 3) potMax = Math.min(potMax, Math.round(Math.max(techo * 1.15, actual * 1.1)));   // no prometer mucho más que el mejor caso conocido (solo si el banco tiene 3+ casos comparables)
    potMax = Math.min(potMax, techoRef);                                                       // ni más que el techo climático de referencia [15]
    potMin = Math.min(potMin, Math.round(potMax * 0.92));                                       // el piso siempre queda por debajo del techo
    var techoAgua = agua != null ? Math.round(Math.max(0, (agua - wp.noProductiva) * wp.kgMm)) : null;
    if (potMin > potMax) potMin = potMax;
    var costoTotal = items.reduce(function (a, i) { return a + i.costo; }, 0), costoCampana = items.reduce(function (a, i) { return a + i.costoCampana; }, 0);
    var inversionTotal = items.reduce(function (a, i) { return a + i.inversion; }, 0), recurrenteCultivo = items.reduce(function (a, i) { return a + (i.alcance === 'cultivo' ? i.recurrente : 0); }, 0), recurrenteLote = items.reduce(function (a, i) { return a + (i.alcance === 'lote' ? i.recurrente : 0); }, 0);
    var precio = pr.granoUSDt[cu] || pr.granoUSDt.otro;
    var kgExtra = meta - actual, ingresoExtra = kgExtra / 1000 * precio;
    var margen = ingresoExtra - costoCampana, costoPorKg = kgExtra > 0 ? costoCampana / kgExtra : null;
    var pctTierra = pr.tierraUSDha ? costoTotal / pr.tierraUSDha * 100 : null;
    var haEquivalentes = actual > 0 ? kgExtra / actual : null; // cuánta tierra más haría falta para producir lo mismo sin mejorar
    var valorTierraEquiv = haEquivalentes != null ? haEquivalentes * pr.tierraUSDha : null;
    var veredicto = meta <= potMin ? 'alcanzable' : (meta <= potMax ? 'posible' : 'ambiciosa');
    return { cultivo: caso.cultivo, cu: cu, actual: actual, meta: meta, kgExtra: kgExtra, suelo: s, opciones: opciones, gapPct: actual ? kgExtra / actual * 100 : null, items: items, benchmark: bm, potencial: { min: potMin, max: potMax, techoZona: techo, techoReferencia: techoRef, techoAgua: techoAgua, mmNecesarios: necesita, mmMeta: necesitaMeta }, veredicto: veredicto,
      economia: { precio: precio, costoTotal: costoTotal, costoCampana: costoCampana, inversionTotal: inversionTotal, recurrenteCultivo: recurrenteCultivo, recurrenteLote: recurrenteLote, ingresoExtra: ingresoExtra, margen: margen, costoPorKg: costoPorKg, pctTierra: pctTierra, haEquivalentes: haEquivalentes, valorTierraEquiv: valorTierraEquiv, tierra: pr.tierraUSDha, retornoSobreTierra: pr.tierraUSDha ? margen / pr.tierraUSDha * 100 : null } };
  }

  /* ---------- proyección a varios años, con los otros cultivos del lote ---------- */
  // otros: casos cosechados del mismo lote con otro cultivo (el mejor de cada uno). Las mejoras del suelo
  // (alcance 'lote') también los benefician; las de manejo solo al cultivo del plan.
  function proyeccion(pl, otros, pr, anios, metaOtro) {
    anios = anios || 5; pr = pr || precios(); metaOtro = num(metaOtro);
    var e = pl.economia, actual = pl.actual;
    var suelo = pl.items.filter(function (i) { return i.alcance === 'lote' && !i.condicional; }), manejo = pl.items.filter(function (i) { return i.alcance === 'cultivo' && !i.condicional; });
    var mid = function (l) { return l.reduce(function (a, i) { return a + (i.aporteMin + i.aporteMax) / 2; }, 0); };
    var apSuelo = Math.min(mid(suelo), 0.35), apManejo = Math.min(mid(manejo), 0.30);
    var extraPleno = Math.min(pl.meta - actual, Math.round(actual * (apSuelo + apManejo)));   // kg/ha del cultivo del plan en régimen
    var partSuelo = (apSuelo + apManejo) > 0 ? apSuelo / (apSuelo + apManejo) : 0;
    // Los otros cultivos del lote (ej. el maíz en un lote de soja) también rinden más con el suelo mejorado.
    // Sin meta propia: extra = rinde actual × aporte del suelo (máx. 25 %). Con meta propia (metaOtro): extra = meta − actual,
    // y el gasto adicional es la manutención por tonelada extra del manual RS/SC (Tabela 6.1.2) más el N por tonelada.
    var cultivosOtros = (otros || []).map(function (c) {
      var cu = claveCultivo(c.cultivo), precio = pr.granoUSDt[cu] || pr.granoUSDt.otro;
      var conMeta = metaOtro && metaOtro > c.rindeKgHa;
      var extra = conMeta ? Math.round(metaOtro - c.rindeKgHa) : Math.round(c.rindeKgHa * Math.min(apSuelo, 0.25));
      var man = window.SafiaFertilidad ? SafiaFertilidad.manutencion(c.cultivo, 99).base : null;   // addP/addK por t extra
      var perfil = window.SafiaAgro ? SafiaAgro.perfilCultivo(c.cultivo) : { expP: 10, expK: 10 };
      var pT = man ? man.addP : perfil.expP, kT = man ? man.addK : perfil.expK;
      var reposicion = extra / 1000 * (pT * pr.p2o5USDkg + kT * pr.k2oUSDkg + (cu === 'soja' ? 0 : 15) * pr.nUSDkg);   // manutención adicional + N (15 kg/t, RS/SC maíz)
      return { cultivo: c.cultivo, actual: c.rindeKgHa, meta: conMeta ? metaOtro : null, extraPleno: extra, precio: precio, reposicion: reposicion, pctExtra: c.rindeKgHa ? extra / c.rindeKgHa * 100 : null };
    });
    var filas = [], acumulado = 0, payback = null;
    for (var y = 1; y <= anios; y++) {
      var rampa = y === 1 ? 0.5 : 1;                                     // correctivos: medio efecto el 1er año
      var inversion = 0;
      pl.items.forEach(function (i) { if (i.inversion && (y === 1 || (i.vidaUtil > 1 && (y - 1) % i.vidaUtil === 0))) inversion += i.inversion; });
      var extraPlan = Math.round(extraPleno * (partSuelo * rampa + (1 - partSuelo)));
      var ingreso = extraPlan / 1000 * e.precio;
      var recurrente = e.recurrenteCultivo + e.recurrenteLote;
      var otrosFila = cultivosOtros.map(function (o) { var ex = Math.round(o.extraPleno * rampa); recurrente += o.reposicion * rampa; ingreso += ex / 1000 * o.precio; return { cultivo: o.cultivo, extra: ex, usd: ex / 1000 * o.precio }; });
      var flujo = ingreso - recurrente - inversion; acumulado += flujo;
      if (payback == null && acumulado >= 0 && y >= 1 && (inversion > 0 || y > 1 || flujo >= 0)) payback = y;
      filas.push({ anio: y, inversion: inversion, recurrente: recurrente, extraPlan: extraPlan, usdPlan: extraPlan / 1000 * e.precio, otros: otrosFila, ingreso: ingreso, flujo: flujo, acumulado: acumulado });
    }
    var ingresoRegimen = filas[filas.length - 1].ingreso, recurrenteRegimen = filas[filas.length - 1].recurrente;
    var kgTotalActual = actual + cultivosOtros.reduce(function (a, o) { return a + o.actual; }, 0);
    var haTierra = e.inversionTotal && pr.tierraUSDha ? e.inversionTotal / pr.tierraUSDha : 0;           // cuánta tierra compra la misma inversión
    var ingresoTierra = haTierra * (actual / 1000 * e.precio + cultivosOtros.reduce(function (a, o) { return a + o.actual / 1000 * o.precio; }, 0)); // ingreso bruto extra por año comprando esa tierra
    return { anios: anios, filas: filas, extraPleno: extraPleno, apSuelo: apSuelo, apManejo: apManejo, otros: cultivosOtros, payback: payback, acumulado: acumulado, ingresoRegimen: ingresoRegimen, recurrenteRegimen: recurrenteRegimen, inversion: e.inversionTotal, haTierra: haTierra, ingresoTierra: ingresoTierra, kgTotalActual: kgTotalActual };
  }
  function proyeccionHTML(py, pl) {
    var e = pl.economia, otros = py.otros;
    var html = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Inversión o gasto: qué pasa en ' + py.anios + ' años, con los dos cultivos del lote</h3><span class="muted">' + esc(pl.cultivo) + (otros.length ? ' + ' + otros.map(function (o) { return esc(o.cultivo); }).join(' + ') : '') + '</span></div>';
    html += '<div class="statbar" style="margin:0 0 10px;">' +
      '<div class="stat"><div class="sl">Inversión (una vez)</div><div class="sv">US$ ' + fmt(py.inversion, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Gasto adicional por año</div><div class="sv">US$ ' + fmt(py.recurrenteRegimen, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Ingreso extra por año (en régimen)</div><div class="sv green">US$ ' + fmt(py.ingresoRegimen, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Se recupera en</div><div class="sv ' + (py.payback ? 'green' : 'red') + '">' + (py.payback ? 'año ' + py.payback : 'no en ' + py.anios + ' años') + '</div></div>' +
      '<div class="stat"><div class="sl">Acumulado a ' + py.anios + ' años</div><div class="sv ' + (py.acumulado >= 0 ? 'green' : 'red') + '">US$ ' + fmt(py.acumulado, 0) + '/ha</div></div></div>';
    html += '<div style="font-size:13px;line-height:1.6;margin-bottom:8px;">' +
      '<div><b>Inversión inicial</b> = preparar el suelo una sola vez (calcáreo, yeso, subsolado, corrección de P y K); dura 3–5 años y mejora el suelo para <b>todos</b> los cultivos del lote; cuando vence se repone (aparece de nuevo en la tabla). <b>Gasto adicional por año</b> = lo que se agrega cada campaña <b>sobre lo que ya gastás hoy</b> para sostener el rinde más alto: reponer el fósforo y potasio que se llevan los kilos extra (de los dos cultivos) y las prácticas nuevas. Si no se sostiene, el suelo vuelve atrás en 2–3 campañas.</div>' +
      '<div>El primer año los correctivos rinden a la mitad (el calcáreo tarda 6–12 meses); desde el segundo, pleno. En ' + esc(pl.cultivo).toLowerCase() + ' se estima <b>+' + fmt(py.extraPleno, 0) + ' kg/ha</b> en régimen' + (otros.length ? '; en ' + otros.map(function (o) { return esc(o.cultivo).toLowerCase() + ' <b>+' + fmt(o.extraPleno, 0) + ' kg/ha</b> (solo por la mejora del suelo)'; }).join(' y ') : '') + '.</div></div>';
    // el otro cultivo del lote (maíz en un lote de soja): qué gana y qué cuesta sostenerlo
    if (otros.length) html += '<div class="note ok" style="margin:0 0 10px;">' + otros.map(function (o) { return '<div>El <b>' + esc(o.cultivo).toLowerCase() + '</b> del mismo lote pasa de <b>' + fmt(o.actual, 0) + '</b> a <b>' + fmt(o.actual + o.extraPleno, 0) + ' kg/ha</b> (' + (o.meta ? 'la meta que fijaste' : 'solo por el suelo mejorado, +' + fmt(o.pctExtra, 0) + ' %; poné su meta en Opciones del plan si querés otra') + ') = <b>US$ ' + fmt(o.extraPleno / 1000 * o.precio, 0) + '/ha más por campaña</b>, con US$ ' + fmt(o.reposicion, 0) + '/ha más de fertilizante para sostenerlo (grano a US$ ' + fmt(o.precio, 0) + '/t).</div>'; }).join('') + '<div>Los ' + (otros.length + 1) + ' cultivos juntos, en régimen: <b>US$ ' + fmt(py.ingresoRegimen, 0) + '/ha de ingreso extra por año</b> contra US$ ' + fmt(py.recurrenteRegimen, 0) + ' de gasto adicional' + (py.payback ? '; la inversión se paga en ' + py.payback + ' año(s)' : '') + '.</div></div>';
    html += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Año</th><th class="r">Inversión inicial</th><th class="r">Gasto adicional</th><th class="r">Extra ' + esc(pl.cultivo) + '</th>' + otros.map(function (o) { return '<th class="r">Extra ' + esc(o.cultivo) + '</th>'; }).join('') + '<th class="r">Ingreso extra</th><th class="r">Resultado del año</th><th class="r">Acumulado</th></tr></thead><tbody>' +
      py.filas.map(function (f) {
        return '<tr><td><b>Año ' + f.anio + '</b></td><td class="r">' + (f.inversion ? 'US$ ' + fmt(f.inversion, 0) : '<span class="muted">—</span>') + '</td><td class="r">US$ ' + fmt(f.recurrente, 0) + '</td><td class="r">' + fmt(f.extraPlan, 0) + ' kg<div class="sub">US$ ' + fmt(f.usdPlan, 0) + '</div></td>' +
          f.otros.map(function (o) { return '<td class="r">' + fmt(o.extra, 0) + ' kg<div class="sub">US$ ' + fmt(o.usd, 0) + '</div></td>'; }).join('') +
          '<td class="r"><span class="num">US$ ' + fmt(f.ingreso, 0) + '</span></td><td class="r"><span class="badge ' + (f.flujo >= 0 ? 'green' : 'red') + '">' + (f.flujo >= 0 ? '+' : '') + fmt(f.flujo, 0) + '</span></td><td class="r"><b style="color:' + (f.acumulado >= 0 ? '#178029' : '#B3261E') + '">' + (f.acumulado >= 0 ? '+' : '') + fmt(f.acumulado, 0) + '</b></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    html += '<div class="note" style="margin-top:10px;"><b>Contra comprar tierra:</b> con los mismos US$ ' + fmt(py.inversion, 0) + '/ha de inversión se compraría el <b>' + fmt(py.haTierra * 100, 1) + ' %</b> de una hectárea (a US$ ' + fmt(e.tierra, 0) + '/ha), que produciría unos <b>US$ ' + fmt(py.ingresoTierra, 0) + '/ha por año</b> más de ingreso bruto (sin contar sus costos de producción); mejorar el lote deja <b>US$ ' + fmt(py.ingresoRegimen - py.recurrenteRegimen, 0) + '/ha por año</b> netos en régimen. ' + (py.ingresoRegimen - py.recurrenteRegimen > py.ingresoTierra ? 'Con estos números, <b>mejorar el lote rinde más que comprar tierra</b>.' : 'Con estos números, la diferencia es chica: revisar precios y metas.') + ' Todo es orientativo: los kilos extra son estimaciones y los precios cambian.</div>';
    return html + '</div>';
  }

  /* ---------- HTML ---------- */
  function informeHTML(pl) {
    var e = pl.economia, tipoIc = { suelo: 'Suelo', agua: 'Agua', manejo: 'Manejo' };
    var html = '';
    html += '<div class="statbar" style="margin:0 0 10px;">' +
      '<div class="stat"><div class="sl">Hoy</div><div class="sv">' + fmt(pl.actual, 0) + '</div></div>' +
      '<div class="stat"><div class="sl">Meta</div><div class="sv green">' + fmt(pl.meta, 0) + '</div></div>' +
      '<div class="stat"><div class="sl">Potencial con el plan</div><div class="sv">' + fmt(pl.potencial.min, 0) + ' – ' + fmt(pl.potencial.max, 0) + '</div></div>' +
      (pl.potencial.techoZona ? '<div class="stat"><div class="sl">Mejor caso de referencia</div><div class="sv">' + fmt(pl.potencial.techoZona, 0) + '</div></div>' : '') +
      '<div class="stat"><div class="sl">Techo climático (agua sin límite)</div><div class="sv">' + fmt(pl.potencial.techoReferencia, 0) + '</div><div class="ss">CESB irrigado 7.600 (2024/25) · GYGA · UNL [15]</div></div>' +
      (pl.potencial.techoAgua != null ? '<div class="stat"><div class="sl">Techo por el agua que tuvo</div><div class="sv">' + fmt(pl.potencial.techoAgua, 0) + '</div><div class="ss">Grassini: ' + (pl.cu === 'maiz' ? '19,3' : '9,9') + ' kg/ha por mm</div></div>' : '') +
      '<div class="stat"><div class="sl">Inversión (una vez)</div><div class="sv">US$ ' + fmt(e.inversionTotal, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Gasto adicional por campaña</div><div class="sv">US$ ' + fmt(e.recurrenteCultivo + e.recurrenteLote, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Ingreso extra</div><div class="sv green">US$ ' + fmt(e.ingresoExtra, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Margen por campaña</div><div class="sv ' + (e.margen >= 0 ? 'green' : 'red') + '">US$ ' + fmt(e.margen, 0) + '/ha</div></div></div>';
    var ver = { alcanzable: ['ok', 'La meta parece <b>alcanzable</b>: incluso con el aporte mínimo estimado de cada ítem se llega.'], posible: ['ok', 'La meta es <b>posible</b>: entra en el rango estimado, pero depende de que varios ítems respondan.'], ambiciosa: ['warn', 'La meta es <b>ambiciosa</b> para este lote con lo que hoy se puede corregir: el rango estimado llega a ' + fmt(pl.potencial.max, 0) + ' kg/ha. Conviene ir por etapas.'] }[pl.veredicto];
    html += '<div class="note ' + ver[0] + '">' + ver[1] + (pl.benchmark ? ' Referencia: ' + pl.benchmark.n + ' caso(s) en ' + esc(pl.benchmark.ambito) + ' que ' + esc(pl.benchmark.criterio) + ' (promedio ' + fmt(pl.benchmark.rindeProm, 0) + ', máximo ' + fmt(pl.benchmark.rindeMax, 0) + ' kg/ha' + (pl.benchmark.agua ? ', ' + fmt(pl.benchmark.agua, 0) + ' mm de agua' : '') + ').' : ' Todavía no hay otros casos de ' + esc(pl.cultivo) + ' en el banco para usar de referencia.') + '</div>';
    function filaItem(i, modo) {
      var ap = i.aporteMax ? (i.aporteMin ? '+' + fmt(i.aporteMin * 100, 0) + ' a +' + fmt(i.aporteMax * 100, 0) + ' %' : 'hasta +' + fmt(i.aporteMax * 100, 0) + ' %') : '';
      var costo = modo === 'inversion' ? 'US$ ' + fmt(i.inversion, 0) + '/ha una vez · dura ' + i.vidaUtil + ' año' + (i.vidaUtil === 1 ? '' : 's') : (modo === 'gasto' ? 'US$ ' + fmt(i.recurrente, 0) + '/ha por campaña' : 'sin costo');
      return '<div style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,.07);">' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;"><b>' + esc(i.nombre) + '</b><span class="muted" style="font-size:11px;">' + (tipoIc[i.tipo] || '') + (i.condicional ? ' · condicional' : '') + (i.alcance === 'lote' ? ' · todo el lote' : '') + '</span><span style="margin-left:auto;font-size:12px;white-space:nowrap;">' + (ap ? '<b style="color:#178029;">' + ap + '</b> · ' : '') + costo + '</span></div>' +
        '<div style="font-size:13px;margin-top:4px;">' + i.accion + ' <span class="muted" style="font-size:11px;">' + esc(i.fuente || '') + '</span></div>' +
        '<div class="muted" style="font-size:12px;margin-top:3px;">Hoy: ' + i.hoy + ' · Objetivo: ' + i.objetivo + '</div></div>';
    }
    function tablaItems(lista, modo, etiquetaCosto) {
      return '<div style="margin-bottom:6px;">' + lista.map(function (i) { return filaItem(i, modo); }).join('') + '</div>';
    }
    var inv = pl.items.filter(function (i) { return i.inversion > 0; }), gas = pl.items.filter(function (i) { return i.recurrente > 0; }), info = pl.items.filter(function (i) { return !i.inversion && !i.recurrente; });
    var subInv = inv.reduce(function (a, i) { return a + i.inversion; }, 0), subGas = gas.reduce(function (a, i) { return a + i.recurrente; }, 0);
    if (subInv < 250 && pl.opciones && !pl.opciones.preparacionCompleta) html += '<div class="note" style="margin-top:12px;"><b>¿Por qué la inversión es tan baja?</b> Porque este lote ya está corregido para lo que muestra el análisis de 0–20 cm' + (pl.suelo && pl.suelo.satBases != null ? ' (V% ' + fmt(pl.suelo.satBases, 1) : '') + (pl.suelo && pl.suelo.p != null ? ', P ' + fmt(pl.suelo.p, 1) : '') + (pl.suelo && pl.suelo.k != null ? ', K ' + fmt(pl.suelo.k * 391, 0) + ' mg/dm³' : '') + (pl.suelo ? ')' : '') + ': el motor solo pone lo que el análisis justifica. El yeso para el perfil, el subsolado, la nivelación y la construcción de reserva de P y K quedan afuera hasta que haya análisis de 20–60 cm o los marques vos en <b>Opciones del plan</b> (escenario de preparación completa). En un lote nuevo o degradado, esa preparación completa suele costar US$ 500–1.500/ha.</div>';
    html += '<h3 style="font-size:15px;margin:16px 0 4px;">1 · Inversión inicial para preparar el suelo <span class="muted" style="font-weight:500;font-size:12px;">una sola vez · US$ ' + fmt(subInv, 0) + '/ha · dura 3–5 años y sirve para todos los cultivos del lote</span></h3>';
    html += inv.length ? tablaItems(inv, 'inversion', 'US$/ha (una vez)') : '<div class="note">El suelo de este lote no necesita correcciones de fondo: no hay inversión inicial.</div>';
    html += '<h3 style="font-size:15px;margin:16px 0 4px;">2 · Gasto adicional por campaña para sostener el rinde más alto <span class="muted" style="font-weight:500;font-size:12px;">cada campaña · US$ ' + fmt(subGas, 0) + '/ha · solo lo que se agrega sobre lo que ya hacés hoy</span></h3>';
    html += '<div class="muted" style="font-size:12px;margin-bottom:6px;">Un rinde más alto se lleva más fósforo y potasio del suelo: hay que reponerlos cada campaña para no volver atrás. Acá se cuenta solo esa reposición extra y las prácticas que hoy no hacés (inoculación, tratamiento de semilla, fungicidas, cobertura). La fertilización que ya aplicás no se cuenta.</div>';
    html += gas.length ? tablaItems(gas, 'gasto', 'US$/ha por campaña') : '<div class="note">No hay gastos adicionales: las prácticas ya están cubiertas.</div>';
    if (info.length) html += '<h3 style="font-size:15px;margin:16px 0 4px;">3 · Para mirar, sin costo</h3>' + tablaItems(info, 'info', 'US$/ha');
    // Secuencia sugerida: cuándo y cómo se hace cada cosa (sin arar)
    var tiene = function (k) { return pl.items.some(function (i) { return i.k === k && (i.inversion || i.recurrente); }); };
    var pasos = [];
    var post = [];
    if (tiene('encalado')) post.push('calcáreo al voleo');
    if (tiene('yeso')) post.push('yeso al voleo');
    if (tiene('subsolado') || tiene('directa')) post.push('una pasada de escarificador/subsolador a 30–40 cm para que el correctivo penetre y romper la capa compactada');
    else if (post.length) post.push('escarificado leve si hay capa compactada (no arar)');
    if (tiene('nivelacion')) post.push('nivelación / sistematización');
    if (tiene('cobertura')) post.push('siembra de la cobertura (brachiaria, avena o mix) si da tiempo; si no, directo sobre el rastrojo');
    if (post.length) pasos.push('<b>Apenas se cosecha el cultivo anterior</b> (ventana entre cosecha y siembra): ' + post.join(' → ') + '. Todo sobre el rastrojo, sin dar vuelta el suelo: la materia orgánica y la humedad se quedan.');
    var siembra = [];
    if (tiene('tratamiento')) siembra.push('tratamiento de semilla');
    if (tiene('inoculacion') || tiene('coinoculacion')) siembra.push('inoculación (líquida en el surco o en semilla) y co-inoculación');
    if (tiene('como')) siembra.push('CoMo');
    if (tiene('fosforo') || tiene('potasio') || tiene('azufre')) siembra.push('fertilización de base en la línea o al voleo (P, K, S)');
    if (tiene('zinc')) siembra.push('zinc');
    if (siembra.length) pasos.push('<b>A la siembra</b> (' + esc(pl.cultivo).toLowerCase() + '): ' + siembra.join(', ') + '.');
    var ciclo = [];
    if (tiene('nitrogeno')) ciclo.push('nitrógeno en cobertura o por fertirriego (V4–V6)');
    if (tiene('fungicidas')) ciclo.push('fungicidas preventivos en R1–R5');
    if (tiene('agua')) ciclo.push('completar los mm que faltan con riego, concentrados en floración y llenado');
    if (ciclo.length) pasos.push('<b>Durante el ciclo</b>: ' + ciclo.join('; ') + '.');
    pasos.push('<b>Después de la cosecha</b>: el siguiente cultivo (zafriña) entra directo sobre el rastrojo; el calcáreo ya está trabajando a pleno desde el segundo ciclo. Repetir el análisis de suelo a los 2 años y reponer el calcáreo cuando venza (3–4 años).');
    html += '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Cuándo y cómo se hace (sin arar)</h3><span class="muted">secuencia sugerida en siembra directa</span></div><ol style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.6;">' + pasos.map(function (t) { return '<li style="margin-bottom:6px;">' + t + '</li>'; }).join('') + '</ol></div>';

    html += '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>¿Vale la pena?</h3><span class="muted">grano a US$ ' + fmt(e.precio, 0) + '/t · tierra a US$ ' + fmt(e.tierra, 0) + '/ha</span></div>' +
      '<div style="font-size:13px;line-height:1.6;">' +
      '<div>Pasar de <b>' + fmt(pl.actual, 0) + '</b> a <b>' + fmt(pl.meta, 0) + ' kg/ha</b> son <b>' + fmt(pl.kgExtra, 0) + ' kg/ha más</b> (' + fmt(pl.gapPct, 0) + ' %) = <b>US$ ' + fmt(e.ingresoExtra, 0) + '/ha por campaña</b>.</div>' +
      '<div>El plan tiene <b>US$ ' + fmt(e.inversionTotal, 0) + '/ha de inversión</b> (una vez; calcáreo, yeso, subsolado y corrección de P/K duran 3–5 años) y <b>US$ ' + fmt(e.recurrenteCultivo + e.recurrenteLote, 0) + '/ha de gasto adicional por campaña</b> para sostener el rinde (reponer lo que se llevan los kilos extra y las prácticas nuevas); prorrateando la inversión son <b>US$ ' + fmt(e.costoCampana, 0) + '/ha por campaña</b>' + (e.costoPorKg != null ? ' → <b>US$ ' + fmt(e.costoPorKg * 1000, 0) + ' por tonelada adicional</b>' : '') + (e.costoPorKg != null && e.precio ? (e.costoPorKg * 1000 < e.precio ? ', más barato que el precio del grano: <b>conviene</b>.' : ', más caro que el precio del grano: <b>no cierra</b> con estos precios.') : '.') + '</div>' +
      (e.pctTierra != null ? '<div>El costo total del plan equivale al <b>' + fmt(e.pctTierra, 1) + ' %</b> del valor de una hectárea' + (e.retornoSobreTierra != null ? '; el margen extra por campaña es un <b>' + fmt(e.retornoSobreTierra, 1) + ' %</b> anual sobre el valor de la tierra' : '') + '.</div>' : '') +
      (e.haEquivalentes != null ? '<div>Producir esos ' + fmt(pl.kgExtra, 0) + ' kg comprando tierra en vez de mejorar el lote exigiría <b>' + fmt(e.haEquivalentes * 100, 0) + ' % más de superficie</b> (US$ ' + fmt(e.valorTierraEquiv, 0) + ' por cada hectárea actual): mejorar el lote es casi siempre más barato que comprar tierra.</div>' : '') +
      '</div></div>';
    html += '<div class="note warn" style="margin-top:10px;"><b>Esto es una evaluación, no una afirmación.</b> Los aportes son rangos orientativos tomados de ensayos regionales (CAPECO/IPTA, Manual RS/SC, Embrapa, Fundação MS, CESB, INTA; ver <a href="https://github.com/OsmarDaSilva/safia/blob/main/FUNDAMENTOS_META_RINDE.md" target="_blank">fundamentos</a>); en cada lote la respuesta real depende del clima, del perfil del suelo y del manejo. Antes de invertir, revisá el plan con un ingeniero agrónomo y confirmá con análisis de suelo (incluido 20–60 cm) y precios actualizados.</div>';
    return html;
  }

  /* ---------- Caso y plan para UNA campaña (lo usa la Ficha de campaña; el Banco arma lo mismo en su pestaña Meta) ---------- */
  var CAMPOS_PRECIO = [['calcareoUSDt', 'Calcáreo US$/t (puesto y aplicado)'], ['yesoUSDt', 'Yeso US$/t'], ['p2o5USDkg', 'P₂O₅ US$/kg'], ['k2oUSDkg', 'K₂O US$/kg'], ['nUSDkg', 'N US$/kg'], ['sUSDkg', 'S US$/kg'], ['tratamientoSemillaUSDha', 'Tratamiento de semilla US$/ha'], ['inoculanteUSDha', 'Inoculante US$/ha'], ['coinoculanteUSDha', 'Co-inoculante US$/ha'], ['comoUSDha', 'CoMo US$/ha'], ['znUSDha', 'Zinc US$/ha'], ['coberturaUSDha', 'Cobertura de invierno US$/ha'], ['fungicidaUSDapl', 'Fungicida US$/aplicación'], ['insecticidaUSDapl', 'Insecticida US$/aplicación'], ['foliarUSDapl', 'Foliar US$/aplicación'], ['riegoUSDmm', 'Riego US$ por mm'], ['subsoladoUSDha', 'Subsolado US$/ha'], ['nivelacionUSDha', 'Nivelación / sistematización US$/ha'], ['aplicacionVoleoUSDha', 'Aplicación al voleo US$/ha (pasada)'], ['analisisPerfilUSD', 'Análisis de perfil US$ por lote (2 profundidades; se prorratea por ha)'], ['tierraUSDha', 'Valor de la tierra US$/ha']];
  var CLAVES_PROMEDIO = ['ph', 'mo', 'p', 'k', 'ca', 'mg', 'cic', 'satBases', 'arena', 'limo', 'arcilla', 'aluminio', 'satAluminio', 'azufre', 'boro', 'zinc', 'cobre', 'manganeso'];
  function leerLS(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function numL(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function analisisDelCampo(campoId) { var l = leerLS('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campoId); }); var rep = l.filter(function (a) { return !a.enPromedio; }); return rep.length ? rep : l; }
  function promediar(items) { var out = {}; CLAVES_PROMEDIO.forEach(function (k) { var vs = items.map(function (a) { return numL(a[k]); }).filter(function (v) { return v !== null; }); out[k] = vs.length ? Math.round(vs.reduce(function (s, v) { return s + v; }, 0) / vs.length * 100) / 100 : null; }); return out; }
  // Devuelve { caso, casos, prof } o { error }
  function casoParaCampana(campo, campanaId, cultivoIdx) {
    if (!window.SafiaCasos || !campo) return { error: 'Falta el módulo de casos.' };
    var casos = SafiaCasos.armarCasos(), prof = analisisDelCampo(campo.id);
    var camp = leerLS('campanas').find(function (c) { return String(c.id) === String(campanaId); });
    var cu = camp && camp.cultivos ? camp.cultivos[cultivoIdx || 0] : null;
    if (!camp || !cu) return { error: 'No encontré la campaña.' };
    var mios = casos.filter(function (c) { return String(c.campoId) === String(campo.id) && c.rindeKgHa; }).sort(function (a, b) { return b.rindeKgHa - a.rindeKgHa; });
    var caso = null;
    if (numL(cu.rendimientoReal) > 0) caso = casos.find(function (c) { return String(c.id) === String(camp.id) + '-' + (cultivoIdx || 0); }) || null;
    if (!caso) {
      var mismos = mios.filter(function (x) { return String(x.equipoId) === String(camp.equipoId) && claveCultivo(x.cultivo) === claveCultivo(cu.cultivo); }).sort(function (a, b) { return String(b.siembra || '').localeCompare(String(a.siembra || '')); });
      var base = mismos[0] || mios.filter(function (x) { return String(x.equipoId) === String(camp.equipoId); })[0] || mios[0];
      if (!base) return { error: 'Este campo todavía no tiene ninguna campaña cosechada con rinde: la meta se arma a partir de un rinde real. Cargá primero una cosecha (o usá la Referencia para comparar).' };
      caso = Object.assign({}, base, { id: 'nueva_' + camp.id + '_' + (cultivoIdx || 0), campanaId: camp.id, campana: camp.nombre || 'campaña nueva', cultivo: cu.cultivo, variedad: cu.variedad || '', siembra: cu.fechaSiembra || null, cosecha: null, rindeKgHa: base.rindeKgHa, esNueva: true, baseCampana: base.campana, baseCultivo: base.cultivo, manejo: null, clima: null });
    }
    // el plan mira hacia adelante: último análisis del lote (o del campo); si hay varias muestras de la misma fecha, su promedio
    var recientes = prof.filter(function (a) { return String(a.equipoId || '') === String(caso.equipoId || ''); });
    if (!recientes.length) recientes = prof.filter(function (a) { return !a.equipoId; });
    recientes.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    var ultimo = recientes.slice(-1)[0];
    if (ultimo && !ultimo.esPromedio) { var iguales = recientes.filter(function (a) { return String(a.fecha) === String(ultimo.fecha); }); if (iguales.length > 1) ultimo = Object.assign({}, ultimo, promediar(iguales), { esPromedio: true }); }
    if (ultimo && (!caso.suelo || String(ultimo.fecha) >= String(caso.suelo.fecha || ''))) caso = Object.assign({}, caso, { suelo: ultimo });
    return { caso: caso, casos: casos, prof: prof };
  }
  // Arma el plan (y la proyección a 5 años) para esa campaña con las opciones y precios dados
  function planParaCampana(campo, campanaId, cultivoIdx, meta, opciones, pr) {
    var r = casoParaCampana(campo, campanaId, cultivoIdx); if (r.error) return r;
    var c = r.caso; pr = pr || precios(); opciones = opciones || {};
    if (!meta || meta <= c.rindeKgHa) return { error: 'La meta tiene que ser mayor al rinde de partida (' + Math.round(c.rindeKgHa) + ' kg/ha).', caso: c };
    if (window.SafiaFoliar && !opciones.foliar) opciones.foliar = SafiaFoliar.ultimoDelLote(c.equipoId);
    // balance firme de la última cosecha del lote: si quedó saldo negativo y no hay análisis de suelo posterior, el plan lo repone
    if (window.SafiaNutrientes && !opciones.saldoAnterior) opciones.saldoAnterior = SafiaNutrientes.reposicionPendiente(c.equipoId);
    var pl = plan(c, meta, pr, r.casos, r.prof, opciones);
    var otros = {};
    r.casos.filter(function (x) { return String(x.campoId) === String(campo.id) && String(x.equipoId || '') === String(c.equipoId || '') && x.rindeKgHa && claveCultivo(x.cultivo) !== claveCultivo(c.cultivo); })
      .forEach(function (x) { var k = claveCultivo(x.cultivo); if (!otros[k] || x.rindeKgHa > otros[k].rindeKgHa) otros[k] = x; });
    var py = proyeccion(pl, Object.keys(otros).map(function (k) { return otros[k]; }), pr, 5, opciones.metaOtro);
    return { caso: c, pl: pl, py: py, casos: r.casos, prof: r.prof };
  }

  window.SafiaMeta = { CAMPOS_PRECIO: CAMPOS_PRECIO, casoParaCampana: casoParaCampana, planParaCampana: planParaCampana, PRECIOS_DEFAULT: PRECIOS_DEFAULT, precios: precios, guardarPrecios: guardarPrecios, benchmark: benchmark, plan: plan, informeHTML: informeHTML, proyeccion: proyeccion, proyeccionHTML: proyeccionHTML, claveCultivo: claveCultivo };
})();
