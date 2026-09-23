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
       llenado baja el rinde casi proporcionalmente. */
(function () {
  'use strict';

  var PRECIOS_DEFAULT = {
    granoUSDt: { soja: 350, maiz: 170, trigo: 230, girasol: 400, sorgo: 150, otro: 250 },
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
    coberturaUSDha: 45,      // semilla + siembra de la cobertura
    fungicidaUSDapl: 35,
    insecticidaUSDapl: 22,
    foliarUSDapl: 15,
    riegoUSDmm: 1.2,         // energía + operación por mm y por ha
    subsoladoUSDha: 45,
    analisisPerfilUSD: 40,   // muestreo 20–40 y 40–60 cm
    tierraUSDha: 20000
  };
  var AGUA_NECESARIA = { soja: 600, maiz: 650, trigo: 450, girasol: 550, sorgo: 500, otro: 550 }; // mm por ciclo, orientativo [9]
  var N_POR_T = { maiz: 22, trigo: 26, girasol: 40, sorgo: 22 };   // kg N absorbidos por t de grano (soja: fija N)

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function claveCultivo(c) { var n = norm(c); if (n.indexOf('soja') === 0 || n.indexOf('soya') === 0) return 'soja'; if (n.indexOf('maiz') === 0) return 'maiz'; if (n.indexOf('trigo') === 0) return 'trigo'; if (n.indexOf('girasol') === 0) return 'girasol'; if (n.indexOf('sorgo') === 0) return 'sorgo'; return 'otro'; }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(v); return isNaN(x) ? null : x; }
  function fmt(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function prom(a) { var v = a.filter(function (x) { return x != null && !isNaN(x); }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function precios() {
    var p = JSON.parse(JSON.stringify(PRECIOS_DEFAULT));
    try { var g = JSON.parse(localStorage.getItem('safia_precios') || '{}'); Object.keys(g).forEach(function (k) { if (k === 'granoUSDt') Object.assign(p.granoUSDt, g.granoUSDt || {}); else if (g[k] != null && g[k] !== '') p[k] = parseFloat(g[k]); }); } catch (e) {}
    return p;
  }
  function guardarPrecios(p) { try { localStorage.setItem('safia_precios', JSON.stringify(p)); } catch (e) {} }

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
  function plan(caso, meta, pr, casos, analisisProfundos) {
    pr = pr || precios();
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
    var T = window.SafiaAgro ? SafiaAgro.TABLAS : null;

    /* 1. Encalado (V%) */
    var v = num(s.satBases), cic = num(s.cic), ph = num(s.ph);
    if (v != null && cic != null) {
      var vObj = Math.max(perfil.v, bm && bm.suelo.satBases ? Math.min(75, Math.round(bm.suelo.satBases)) : 0);
      var nc = (vObj - v) * cic / 100;
      if (nc > 0.3) {
        var ap = v < 50 ? [0.10, 0.20] : (v < 60 ? [0.05, 0.12] : [0.02, 0.06]);
        item({ k: 'encalado', tipo: 'suelo', nombre: 'Encalado', hoy: 'V% ' + fmt(v, 1) + (ph != null ? ' · pH ' + fmt(ph, 1) : ''), objetivo: 'V% ' + vObj + (bm && bm.suelo.satBases ? ' (los que rinden ≥ meta: ' + fmt(bm.suelo.satBases, 0) + ')' : ''),
          accion: fmt(nc, 1) + ' t/ha de calcáreo ' + ((num(s.mg) != null && num(s.mg) < 1.0) ? 'dolomítico' : 'calcítico o dolomítico') + ' (PRNT 100 %), en superficie en directa; efecto pleno en 6–12 meses',
          inversion: nc * pr.calcareoUSDt, vidaUtil: 4, aporteMin: ap[0], aporteMax: ap[1], fuente: '[2][7]' });
      } else item({ k: 'encalado', tipo: 'suelo', nombre: 'Encalado', hoy: 'V% ' + fmt(v, 1), objetivo: 'V% ' + vObj, accion: 'No hace falta: ya está en el objetivo. Repetir análisis cada 2 años', fuente: '[2]' });
    }
    /* 2. Perfil (yeso) */
    var arc = num(s.arcilla);
    var prof = (analisisProfundos || []).filter(function (a) { return /(20|30|40).*(40|60)/.test(String(a.profundidad || '')); });
    var dosisYeso = arc != null ? Math.round(50 * arc / 100) * 100 : null; // kg/ha, Embrapa: 50 × % arcilla
    if (prof.length) {
      var ult = prof[prof.length - 1], caProf = num(ult.ca);
      if (caProf != null && caProf < 0.5) item({ k: 'yeso', tipo: 'suelo', nombre: 'Yeso agrícola (perfil 20–60 cm)', hoy: 'Ca ' + fmt(caProf, 2) + ' cmolc/dm³ en ' + esc(ult.profundidad), objetivo: 'Ca > 0,5 y Al < 20 % en profundidad', accion: fmt(dosisYeso, 0) + ' kg/ha de yeso (50 × % arcilla), al voleo con el encalado', inversion: dosisYeso / 1000 * pr.yesoUSDt, vidaUtil: 5, aporteMin: 0.03, aporteMax: 0.10, fuente: '[3][7]' });
      else item({ k: 'yeso', tipo: 'suelo', nombre: 'Perfil (20–60 cm)', hoy: 'Ca ' + fmt(caProf, 2) + ' en ' + esc(ult.profundidad), objetivo: 'Ca > 0,5 cmolc/dm³', accion: 'El perfil está bien provisto de calcio: no hace falta yeso ahora', fuente: '[3]' });
    } else {
      item({ k: 'yeso', tipo: 'suelo', nombre: 'Perfil profundo (20–40 y 40–60 cm)', hoy: 'sin análisis en profundidad', objetivo: 'Ca > 0,5 cmolc/dm³ y Al < 20 % hasta 60 cm', accion: 'Muestrear 20–40 y 40–60 cm. Si hay Ca bajo o Al alto: ' + (dosisYeso ? fmt(dosisYeso, 0) + ' kg/ha de yeso (50 × % arcilla)' : 'yeso = 50 × % arcilla kg/ha') + '. Hoy la corrección del perfil se hace con calcáreo + yeso en directa, no solo 0–20 cm', inversion: pr.analisisPerfilUSD, vidaUtil: 1, aporteMin: 0, aporteMax: 0.08, condicional: true, fuente: '[3][7]' });
    }
    /* 3. Fósforo */
    var p = num(s.p);
    if (p != null && T) {
      var cl = (arc != null && arc <= 40) ? 2 : 1, pc = T.P_CLASES[cl];
      var cat = p <= pc.limites[0] ? 'muy baja' : (p <= pc.limites[1] ? 'baja' : (p <= pc.limites[2] ? 'media' : (p <= pc.limites[3] ? 'alta' : 'muy alta')));
      var pObj = Math.max(pc.critico, bm && bm.suelo.p ? Math.min(pc.critico * 2, bm.suelo.p) : 0);
      var corr = p < pObj ? Math.round((pObj - p) * pc.kgPorMg) : 0; if (corr < 10) corr = 0;
      var manTotal = cat === 'muy alta' ? Math.round(metaT * perfil.expP) : Math.round(metaT * perfil.mP);
      var aplicadoP = caso.manejo && caso.manejo.cargado && caso.manejo.npk ? Math.round(caso.manejo.npk.p2o5) : null;
      var man = aplicadoP != null ? Math.max(0, manTotal - aplicadoP) : manTotal;
      var apP = { 'muy baja': [0.25, 0.45], baja: [0.10, 0.25], media: [0.03, 0.10], alta: [0, 0.03], 'muy alta': [0, 0] }[cat];
      item({ k: 'fosforo', tipo: 'suelo', nombre: 'Fósforo', hoy: fmt(p, 1) + ' mg/dm³ (' + cat + ')', objetivo: fmt(pObj, 0) + ' mg/dm³' + (bm && bm.suelo.p ? ' · los que rinden ≥ meta: ' + fmt(bm.suelo.p, 1) : ''),
        accion: (corr ? 'Corregir ' + fmt(corr, 0) + ' kg/ha de P₂O₅ (' + pc.kgPorMg + ' kg por mg/dm³, gradual en 3 cultivos) + ' : '') + 'manutención ' + fmt(manTotal, 0) + ' kg/ha de P₂O₅ para ' + fmt(meta, 0) + ' kg/ha (' + (cat === 'muy alta' ? 'solo reposición' : perfil.mP + ' kg/t × 1,25') + ')' + (aplicadoP != null ? ' — hoy aplicás ' + fmt(aplicadoP, 0) + ', faltan ' + fmt(man, 0) : ' — se cobra completo porque el manejo no está cargado; descontá lo que ya aplicás'),
        inversion: corr * pr.p2o5USDkg, vidaUtil: 4, recurrente: man * pr.p2o5USDkg, aporteMin: apP[0], aporteMax: apP[1], fuente: '[1]' });
    }
    /* 4. Potasio */
    var k = num(s.k);
    if (k != null && T) {
      var kmg = k * 391, K = T.K_CLASE;
      var catK = kmg <= K.limites[0] ? 'muy baja' : (kmg <= K.limites[1] ? 'baja' : (kmg <= K.limites[2] ? 'media' : (kmg <= K.limites[3] ? 'alta' : 'muy alta')));
      var corrK = K.correctiva[catK] || 0;
      var manKTotal = catK === 'muy alta' ? Math.round(metaT * perfil.expK) : Math.round(metaT * perfil.mK);
      var aplicadoK = caso.manejo && caso.manejo.cargado && caso.manejo.npk ? Math.round(caso.manejo.npk.k2o) : null;
      var manK = aplicadoK != null ? Math.max(0, manKTotal - aplicadoK) : manKTotal;
      var apK = { 'muy baja': [0.20, 0.45], baja: [0.10, 0.20], media: [0.03, 0.10], alta: [0, 0.03], 'muy alta': [0, 0] }[catK];
      item({ k: 'potasio', tipo: 'suelo', nombre: 'Potasio', hoy: fmt(kmg, 0) + ' mg/dm³ (' + catK + ')', objetivo: '> 75 mg/dm³' + (bm && bm.suelo.k ? ' · los que rinden ≥ meta: ' + fmt(bm.suelo.k * 391, 0) : ''),
        accion: (corrK ? 'Corregir ' + fmt(corrK, 0) + ' kg/ha de K₂O en 3 cultivos + ' : '') + (catK === 'muy alta' ? 'solo reponer lo exportado: ' : 'manutención ') + fmt(manKTotal, 0) + ' kg/ha de K₂O (KCl al voleo o por fertirriego)' + (aplicadoK != null ? ' — hoy aplicás ' + fmt(aplicadoK, 0) + ', faltan ' + fmt(manK, 0) : ' — se cobra completo porque el manejo no está cargado; descontá lo que ya aplicás'),
        inversion: corrK * pr.k2oUSDkg, vidaUtil: 4, recurrente: manK * pr.k2oUSDkg, aporteMin: apK[0], aporteMax: apK[1], fuente: '[1]' });
    }
    /* 5. Nitrógeno (no soja) */
    if (N_POR_T[cu]) {
      var mo = num(s.mo), aplicadoN = caso.manejo && caso.manejo.npk ? caso.manejo.npk.n : 0;
      var necesidad = metaT * N_POR_T[cu], aporteMO = mo != null ? mo * 20 : 40, dosisN = Math.max(0, Math.round(necesidad - aporteMO));
      var faltaHoy = Math.max(0, necesidad - aporteMO - (aplicadoN || 0));
      item({ k: 'nitrogeno', tipo: 'suelo', nombre: 'Nitrógeno', hoy: (aplicadoN ? fmt(aplicadoN, 0) + ' kg N/ha aplicados' : 'sin N registrado') + (mo != null ? ' · MO ' + fmt(mo, 2) + ' % aporta ~' + fmt(aporteMO, 0) + ' kg N' : ''), objetivo: fmt(necesidad, 0) + ' kg N/ha absorbidos para ' + fmt(meta, 0) + ' kg/ha',
        accion: 'Aplicar ~' + fmt(dosisN, 0) + ' kg N/ha (' + fmt(dosisN / 0.46, 0) + ' kg de urea) partido: base + cobertura V4–V6' + (caso.riegoMM != null ? ' o por fertirriego' : ''), costo: dosisN * pr.nUSDkg, aporteMin: faltaHoy > 30 ? 0.08 : 0, aporteMax: faltaHoy > 30 ? 0.20 : 0.03, fuente: '[1] N por tonelada: Embrapa/IPNI' });
    }
    /* 6. Azufre y micronutrientes */
    var tieneS = caso.manejo && caso.manejo.npk && caso.manejo.npk.s > 5;
    if (!tieneS && (num(s.mo) == null || num(s.mo) < 3)) item({ k: 'azufre', tipo: 'suelo', nombre: 'Azufre', hoy: 'sin fuente de S registrada', objetivo: '20–30 kg S/ha', accion: '25 kg S/ha (yeso 150 kg/ha o sulfato de amonio)', costo: 25 * pr.sUSDkg, aporteMin: 0.02, aporteMax: 0.05, fuente: '[1] RS/SC: S en suelos con MO < 3 %' });
    var man = caso.manejo || {};
    if (cu === 'soja' && !(man.cargado && man.microSemilla)) item({ k: 'como', tipo: 'manejo', nombre: 'Cobalto y molibdeno en semilla', hoy: man.cargado ? 'no se usó' : 'no registrado', objetivo: 'CoMo en cada siembra', accion: 'CoMo en el tratamiento de semilla (mejora la fijación de N)', costo: pr.comoUSDha, aporteMin: 0.02, aporteMax: 0.05, fuente: '[8]' });
    if (cu === 'maiz' && !(man.cargado && (man.microSemilla || man.foliares))) item({ k: 'zinc', tipo: 'manejo', nombre: 'Zinc', hoy: man.cargado ? 'sin Zn' : 'no registrado', objetivo: 'Zn en semilla o foliar V4–V6', accion: 'Zinc en semilla o 1 foliar de Zn + B', costo: pr.znUSDha, aporteMin: 0.02, aporteMax: 0.06, fuente: 'Embrapa Milho: Zn es el micro más limitante en suelos ácidos' });
    /* 7. Manejo: inoculación, tratamiento, cobertura, siembra, protección */
    if (cu === 'soja') {
      if (!(man.cargado && man.inoculacion)) item({ k: 'inoculacion', tipo: 'manejo', nombre: 'Inoculación + co-inoculación', hoy: man.cargado ? 'no se usó' : 'no registrado', objetivo: 'Bradyrhizobium + Azospirillum cada siembra', accion: 'Inocular (líquido en el surco o en semilla) y co-inocular', costo: pr.inoculanteUSDha + pr.coinoculanteUSDha, aporteMin: 0.05, aporteMax: 0.15, fuente: '[8]' });
      else if (!man.coinoculacion) item({ k: 'coinoculacion', tipo: 'manejo', nombre: 'Co-inoculación', hoy: 'solo Bradyrhizobium', objetivo: '+ Azospirillum brasilense', accion: 'Agregar co-inoculante', costo: pr.coinoculanteUSDha, aporteMin: 0.03, aporteMax: 0.08, fuente: '[8]' });
    }
    if (!(man.cargado && man.tratamientoSemilla)) item({ k: 'tratamiento', tipo: 'manejo', nombre: 'Tratamiento de semilla', hoy: man.cargado ? 'no se usó' : 'no registrado', objetivo: 'fungicida + insecticida', accion: 'Tratar la semilla (fungicida + insecticida) para stand parejo', costo: pr.tratamientoSemillaUSDha, aporteMin: 0.03, aporteMax: 0.08, fuente: 'Embrapa Soja / BASF PY' });
    var rot = caso.rotacion || {};
    if (rot.cargada && !rot.conCobertura) item({ k: 'cobertura', tipo: 'manejo', nombre: 'Cobertura de invierno', hoy: 'sin cobertura', objetivo: (bm && bm.cobertura != null ? fmt(bm.cobertura * 100, 0) + ' % de los que rinden ≥ meta usan cobertura' : 'brachiaria, avena o mix'), accion: 'Sembrar cobertura después de la cosecha (brachiaria ruziziensis, avena, mix)', recurrente: pr.coberturaUSDha, alcance: 'lote', aporteMin: 0.03, aporteMax: 0.08, fuente: 'Embrapa (Santa Fe / ILP): MO, malezas, agua' });
    if (rot.convencional) item({ k: 'directa', tipo: 'manejo', nombre: 'Siembra directa', hoy: 'convencional (rastroneada)', objetivo: 'directa sobre cobertura o rastrojo', accion: 'Pasar a siembra directa; si hay compactación, subsolar una vez y sembrar cobertura', inversion: pr.subsoladoUSDha, vidaUtil: 3, aporteMin: 0.03, aporteMax: 0.08, fuente: 'Manual RS/SC / Embrapa' });
    if (rot.sojaSobreSoja) item({ k: 'rotacion', tipo: 'manejo', nombre: 'Rotación', hoy: 'soja sobre soja', objetivo: 'maíz, trigo o gramínea antes de la soja', accion: 'Rotar: maíz zafriña o cobertura de gramínea entre sojas', costo: 0, aporteMin: 0.05, aporteMax: 0.12, fuente: 'Embrapa Soja: rotación con gramíneas' });
    var nFung = man.cargado ? (man.fungicidas || 0) : null, fungObj = cu === 'soja' ? 2 : 1;
    if (nFung != null && nFung < fungObj) item({ k: 'fungicidas', tipo: 'manejo', nombre: 'Fungicidas', hoy: nFung + ' aplicación(es)', objetivo: fungObj + '+ (' + (cu === 'soja' ? 'roya y mancha' : 'manchas foliares') + ')', accion: 'Sumar ' + (fungObj - nFung) + ' aplicación(es) preventiva(s) en R1–R5', costo: (fungObj - nFung) * pr.fungicidaUSDapl, aporteMin: 0.05, aporteMax: 0.15, fuente: 'Embrapa Soja (ensayos de roya)' });
    /* 8. Agua */
    var agua = caso.aguaTotalMM, necesita = (caso.clima && caso.clima.et0Total) ? Math.round(caso.clima.et0Total * 1.0) : AGUA_NECESARIA[cu];
    if (agua != null) {
      var deficit = Math.max(0, necesita - agua);
      if (deficit > 30 && caso.riego !== false) item({ k: 'agua', tipo: 'agua', nombre: 'Agua del ciclo', hoy: fmt(agua, 0) + ' mm (lluvia ' + fmt(caso.lluviaMM || 0, 0) + ' + riego ' + fmt(caso.riegoMM || 0, 0) + ')', objetivo: fmt(necesita, 0) + ' mm' + (caso.clima && caso.clima.et0Total ? ' (ET₀ del ciclo)' : ' (referencia ' + caso.cultivo + ')') + (bm && bm.agua ? ' · los que rinden ≥ meta: ' + fmt(bm.agua, 0) : ''), accion: 'Completar ~' + fmt(deficit, 0) + ' mm con riego, concentrados en floración y llenado', costo: deficit * pr.riegoUSDmm, aporteMin: clamp(deficit / necesita * 0.5, 0.02, 0.15), aporteMax: clamp(deficit / necesita * 1.0, 0.05, 0.30), fuente: '[9]' });
      else if (deficit > 30) item({ k: 'agua', tipo: 'agua', nombre: 'Agua del ciclo', hoy: fmt(agua, 0) + ' mm en secano', objetivo: fmt(necesita, 0) + ' mm', accion: 'Faltaron ~' + fmt(deficit, 0) + ' mm: es el techo del secano; con riego se cubre', costo: 0, aporteMin: 0, aporteMax: clamp(deficit / necesita, 0.05, 0.30), condicional: true, fuente: '[9]' });
      else item({ k: 'agua', tipo: 'agua', nombre: 'Agua del ciclo', hoy: fmt(agua, 0) + ' mm', objetivo: fmt(necesita, 0) + ' mm', accion: 'Cubierta. Cuidar el momento: sin déficit en floración y llenado', costo: 0, fuente: '[9]' });
    }
    /* 9. Genética (informativo) */
    if (bm && bm.variedades.length) { var vs = {}; bm.variedades.forEach(function (x) { vs[x] = (vs[x] || 0) + 1; }); var topV = Object.keys(vs).sort(function (a, b) { return vs[b] - vs[a]; }).slice(0, 3); item({ k: 'variedad', tipo: 'manejo', nombre: 'Material genético', hoy: caso.variedad || 'sin dato', objetivo: 'los que rinden ≥ meta usan: ' + topV.join(', '), accion: 'Comparar en el ranking de variedades y probar en una franja', costo: 0, fuente: 'banco de casos SAFIA' }); }

    /* Potencial y economía */
    var sumMin = items.reduce(function (a, i) { return a + (i.condicional ? 0 : i.aporteMin); }, 0), sumMax = items.reduce(function (a, i) { return a + i.aporteMax; }, 0);
    var techo = bm ? bm.rindeMax : null;
    var potMin = Math.round(actual * (1 + Math.min(sumMin, 0.4))), potMax = Math.round(actual * (1 + Math.min(sumMax, 0.5)));
    if (techo) potMax = Math.min(potMax, Math.round(Math.max(techo * 1.15, actual * 1.1)));   // no prometer mucho más que el mejor caso conocido
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
    return { cultivo: caso.cultivo, cu: cu, actual: actual, meta: meta, kgExtra: kgExtra, gapPct: actual ? kgExtra / actual * 100 : null, items: items, benchmark: bm, potencial: { min: potMin, max: potMax, techoZona: techo }, veredicto: veredicto,
      economia: { precio: precio, costoTotal: costoTotal, costoCampana: costoCampana, inversionTotal: inversionTotal, recurrenteCultivo: recurrenteCultivo, recurrenteLote: recurrenteLote, ingresoExtra: ingresoExtra, margen: margen, costoPorKg: costoPorKg, pctTierra: pctTierra, haEquivalentes: haEquivalentes, valorTierraEquiv: valorTierraEquiv, tierra: pr.tierraUSDha, retornoSobreTierra: pr.tierraUSDha ? margen / pr.tierraUSDha * 100 : null } };
  }

  /* ---------- proyección a varios años, con los otros cultivos del lote ---------- */
  // otros: casos cosechados del mismo lote con otro cultivo (el mejor de cada uno). Las mejoras del suelo
  // (alcance 'lote') también los benefician; las de manejo solo al cultivo del plan.
  function proyeccion(pl, otros, pr, anios) {
    anios = anios || 5; pr = pr || precios();
    var e = pl.economia, actual = pl.actual;
    var suelo = pl.items.filter(function (i) { return i.alcance === 'lote' && !i.condicional; }), manejo = pl.items.filter(function (i) { return i.alcance === 'cultivo' && !i.condicional; });
    var mid = function (l) { return l.reduce(function (a, i) { return a + (i.aporteMin + i.aporteMax) / 2; }, 0); };
    var apSuelo = Math.min(mid(suelo), 0.35), apManejo = Math.min(mid(manejo), 0.30);
    var extraPleno = Math.min(pl.meta - actual, Math.round(actual * (apSuelo + apManejo)));   // kg/ha del cultivo del plan en régimen
    var partSuelo = (apSuelo + apManejo) > 0 ? apSuelo / (apSuelo + apManejo) : 0;
    var cultivosOtros = (otros || []).map(function (c) {
      var cu = claveCultivo(c.cultivo), precio = pr.granoUSDt[cu] || pr.granoUSDt.otro;
      var extra = Math.round(c.rindeKgHa * Math.min(apSuelo, 0.25));                          // solo mejoras del suelo
      var perfil = window.SafiaAgro ? SafiaAgro.perfilCultivo(c.cultivo) : { expP: 10, expK: 10 };
      var reposicion = extra / 1000 * (perfil.expP * pr.p2o5USDkg + perfil.expK * pr.k2oUSDkg + (N_POR_T[cu] || 0) * pr.nUSDkg); // reponer lo que se lleva el extra
      return { cultivo: c.cultivo, actual: c.rindeKgHa, extraPleno: extra, precio: precio, reposicion: reposicion };
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
      '<div class="stat"><div class="sl">Gasto recurrente por año</div><div class="sv">US$ ' + fmt(py.recurrenteRegimen, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Ingreso extra por año (en régimen)</div><div class="sv green">US$ ' + fmt(py.ingresoRegimen, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Se recupera en</div><div class="sv ' + (py.payback ? 'green' : 'red') + '">' + (py.payback ? 'año ' + py.payback : 'no en ' + py.anios + ' años') + '</div></div>' +
      '<div class="stat"><div class="sl">Acumulado a ' + py.anios + ' años</div><div class="sv ' + (py.acumulado >= 0 ? 'green' : 'red') + '">US$ ' + fmt(py.acumulado, 0) + '/ha</div></div></div>';
    html += '<div style="font-size:13px;line-height:1.6;margin-bottom:8px;">' +
      '<div><b>Inversión</b> = lo que se hace una vez y dura varios años (calcáreo 4, yeso 5, subsolado 3, corrección de P y K 4) y mejora el suelo para <b>todos</b> los cultivos del lote. <b>Gasto</b> = lo que se repite cada campaña (manutención de P y K, tratamiento de semilla, inoculación, fungicidas, cobertura, agua).</div>' +
      '<div>El primer año los correctivos rinden a la mitad (el calcáreo tarda 6–12 meses); desde el segundo, pleno. En ' + esc(pl.cultivo).toLowerCase() + ' se estima <b>+' + fmt(py.extraPleno, 0) + ' kg/ha</b> en régimen' + (otros.length ? '; en ' + otros.map(function (o) { return esc(o.cultivo).toLowerCase() + ' <b>+' + fmt(o.extraPleno, 0) + ' kg/ha</b> (solo por la mejora del suelo)'; }).join(' y ') : '') + '.</div></div>';
    html += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Año</th><th class="r">Inversión</th><th class="r">Gasto recurrente</th><th class="r">Extra ' + esc(pl.cultivo) + '</th>' + otros.map(function (o) { return '<th class="r">Extra ' + esc(o.cultivo) + '</th>'; }).join('') + '<th class="r">Ingreso extra</th><th class="r">Resultado del año</th><th class="r">Acumulado</th></tr></thead><tbody>' +
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
      '<div class="stat"><div class="sl">Inversión (una vez)</div><div class="sv">US$ ' + fmt(e.inversionTotal, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Gasto por campaña</div><div class="sv">US$ ' + fmt(e.recurrenteCultivo + e.recurrenteLote, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Ingreso extra</div><div class="sv green">US$ ' + fmt(e.ingresoExtra, 0) + '/ha</div></div>' +
      '<div class="stat"><div class="sl">Margen por campaña</div><div class="sv ' + (e.margen >= 0 ? 'green' : 'red') + '">US$ ' + fmt(e.margen, 0) + '/ha</div></div></div>';
    var ver = { alcanzable: ['ok', 'La meta parece <b>alcanzable</b>: incluso con el aporte mínimo estimado de cada ítem se llega.'], posible: ['ok', 'La meta es <b>posible</b>: entra en el rango estimado, pero depende de que varios ítems respondan.'], ambiciosa: ['warn', 'La meta es <b>ambiciosa</b> para este lote con lo que hoy se puede corregir: el rango estimado llega a ' + fmt(pl.potencial.max, 0) + ' kg/ha. Conviene ir por etapas.'] }[pl.veredicto];
    html += '<div class="note ' + ver[0] + '">' + ver[1] + (pl.benchmark ? ' Referencia: ' + pl.benchmark.n + ' caso(s) en ' + esc(pl.benchmark.ambito) + ' que ' + esc(pl.benchmark.criterio) + ' (promedio ' + fmt(pl.benchmark.rindeProm, 0) + ', máximo ' + fmt(pl.benchmark.rindeMax, 0) + ' kg/ha' + (pl.benchmark.agua ? ', ' + fmt(pl.benchmark.agua, 0) + ' mm de agua' : '') + ').' : ' Todavía no hay otros casos de ' + esc(pl.cultivo) + ' en el banco para usar de referencia.') + '</div>';
    html += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Ítem</th><th>Hoy</th><th>Objetivo</th><th>Qué hacer (dosis / acción)</th><th class="r">US$/ha</th><th class="r">Aporte estimado</th></tr></thead><tbody>' +
      pl.items.map(function (i) {
        var ap = i.aporteMax ? (i.aporteMin ? '+' + fmt(i.aporteMin * 100, 0) + ' a +' + fmt(i.aporteMax * 100, 0) + ' %' : 'hasta +' + fmt(i.aporteMax * 100, 0) + ' %') : '<span class="muted">—</span>';
        return '<tr><td><b>' + esc(i.nombre) + '</b><div class="sub">' + (tipoIc[i.tipo] || '') + (i.condicional ? ' · condicional' : '') + '</div></td><td style="font-size:12px;">' + i.hoy + '</td><td style="font-size:12px;">' + i.objetivo + '</td><td style="font-size:12px;">' + i.accion + ' <span class="muted">' + esc(i.fuente || '') + '</span></td>' +
          '<td class="r">' + (i.costo ? '<span class="num">' + fmt(i.costo, 0) + '</span>' + (i.costoCampana !== i.costo ? '<div class="sub">' + fmt(i.costoCampana, 0) + '/campaña</div>' : '') : '<span class="muted">0</span>') + '</td><td class="r">' + ap + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    html += '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>¿Vale la pena?</h3><span class="muted">grano a US$ ' + fmt(e.precio, 0) + '/t · tierra a US$ ' + fmt(e.tierra, 0) + '/ha</span></div>' +
      '<div style="font-size:13px;line-height:1.6;">' +
      '<div>Pasar de <b>' + fmt(pl.actual, 0) + '</b> a <b>' + fmt(pl.meta, 0) + ' kg/ha</b> son <b>' + fmt(pl.kgExtra, 0) + ' kg/ha más</b> (' + fmt(pl.gapPct, 0) + ' %) = <b>US$ ' + fmt(e.ingresoExtra, 0) + '/ha por campaña</b>.</div>' +
      '<div>El plan tiene <b>US$ ' + fmt(e.inversionTotal, 0) + '/ha de inversión</b> (una vez; calcáreo, yeso, subsolado y corrección de P/K duran 3–5 años) y <b>US$ ' + fmt(e.recurrenteCultivo + e.recurrenteLote, 0) + '/ha de gasto por campaña</b>; prorrateando la inversión son <b>US$ ' + fmt(e.costoCampana, 0) + '/ha por campaña</b>' + (e.costoPorKg != null ? ' → <b>US$ ' + fmt(e.costoPorKg * 1000, 0) + ' por tonelada adicional</b>' : '') + (e.costoPorKg != null && e.precio ? (e.costoPorKg * 1000 < e.precio ? ', más barato que el precio del grano: <b>conviene</b>.' : ', más caro que el precio del grano: <b>no cierra</b> con estos precios.') : '.') + '</div>' +
      (e.pctTierra != null ? '<div>El costo total del plan equivale al <b>' + fmt(e.pctTierra, 1) + ' %</b> del valor de una hectárea' + (e.retornoSobreTierra != null ? '; el margen extra por campaña es un <b>' + fmt(e.retornoSobreTierra, 1) + ' %</b> anual sobre el valor de la tierra' : '') + '.</div>' : '') +
      (e.haEquivalentes != null ? '<div>Producir esos ' + fmt(pl.kgExtra, 0) + ' kg comprando tierra en vez de mejorar el lote exigiría <b>' + fmt(e.haEquivalentes * 100, 0) + ' % más de superficie</b> (US$ ' + fmt(e.valorTierraEquiv, 0) + ' por cada hectárea actual): mejorar el lote es casi siempre más barato que comprar tierra.</div>' : '') +
      '</div></div>';
    html += '<div class="note warn" style="margin-top:10px;"><b>Esto es una evaluación, no una afirmación.</b> Los aportes son rangos orientativos tomados de ensayos regionales (CAPECO/IPTA, Manual RS/SC, Embrapa, INTA); en cada lote la respuesta real depende del clima, del perfil del suelo y del manejo. Antes de invertir, revisá el plan con un ingeniero agrónomo y confirmá con análisis de suelo (incluido 20–60 cm) y precios actualizados.</div>';
    return html;
  }

  window.SafiaMeta = { PRECIOS_DEFAULT: PRECIOS_DEFAULT, precios: precios, guardarPrecios: guardarPrecios, benchmark: benchmark, plan: plan, informeHTML: informeHTML, proyeccion: proyeccion, proyeccionHTML: proyeccionHTML, claveCultivo: claveCultivo };
})();
