/* SAFIA — Manejo e insumos por campaña (catálogo compartido)
   -------------------------------------------------------------------
   Cada campaña registra, estructurado y opcional, todo lo que se usó,
   en tres momentos:
     1. Tratamiento de semilla: cobalto-molibdeno, inoculante,
        co-inoculante, insecticida, fungicida, micronutrientes,
        bioestimulante (dosis por kg de semilla).
     2. Fertilización: fórmula o producto (04-30-10, KCl, urea, MAP…),
        kg/ha, CÓMO se aplicó (sembradora en línea, voleo presiembra,
        voleo en cobertura, tasa variable según mapa, fertirriego) y
        cuándo. SAFIA calcula los kg/ha de N, P2O5 y K2O aplicados.
     3. Durante el ciclo: foliares (micronutrientes, bioestimulantes),
        fungicidas, insecticidas, herbicidas, con etapa fenológica.
   Se guarda en campana.insumos = [{ id, seccion, categoria, producto,
   formula, dosis, unidad, metodo, etapa, fecha, cultivoIdx, obs }].
   El motor de casos lo resume en "prácticas" (con / sin). */
(function () {
  'use strict';

  var SECCIONES = [
    { k: 'semilla', n: 'Tratamiento de semilla', sub: 'Todo lo que se le puso a la semilla antes de sembrar' },
    { k: 'fertilizacion', n: 'Fertilización', sub: 'Base a la siembra, voleo, cobertura, tasa variable y fertirriego' },
    { k: 'ciclo', n: 'Durante el ciclo', sub: 'Foliares, fungicidas, insecticidas, herbicidas' }
  ];
  var CATEGORIAS = [
    // 1. Semilla
    { k: 'ts_como',        seccion: 'semilla', n: 'Cobalto y molibdeno (CoMo)',        practica: 'microSemilla' },
    { k: 'inoculante',     seccion: 'semilla', n: 'Inoculante (Bradyrhizobium, Azospirillum…)', practica: 'inoculacion' },
    { k: 'coinoculante',   seccion: 'semilla', n: 'Co-inoculante',                     practica: 'coinoculacion' },
    { k: 'ts_insecticida', seccion: 'semilla', n: 'Insecticida de semilla',            practica: 'tratamientoSemilla' },
    { k: 'ts_fungicida',   seccion: 'semilla', n: 'Fungicida de semilla',              practica: 'tratamientoSemilla' },
    { k: 'ts_micro',       seccion: 'semilla', n: 'Micronutrientes (Zn, Mn, B…)',       practica: 'microSemilla' },
    { k: 'ts_bio',         seccion: 'semilla', n: 'Bioestimulante / aminoácidos / polímero', practica: 'bioSemilla' },
    { k: 'ts_otro',        seccion: 'semilla', n: 'Otro en semilla',                   practica: null },
    // 2. Fertilización
    { k: 'fert_base',      seccion: 'fertilizacion', n: 'Base (presiembra o siembra)', practica: 'fertBase' },
    { k: 'fert_cobertura', seccion: 'fertilizacion', n: 'Cobertura (durante el ciclo)', practica: 'fertCobertura' },
    { k: 'fertirriego',    seccion: 'fertilizacion', n: 'Fertirriego (por el equipo de riego)', practica: 'fertirriego' },
    { k: 'encalado',       seccion: 'fertilizacion', n: 'Encalado / yeso agrícola',    practica: 'encalado' },
    // 3. Ciclo
    { k: 'foliar_micro',   seccion: 'ciclo', n: 'Foliar · micronutrientes',           practica: 'foliares' },
    { k: 'foliar_bio',     seccion: 'ciclo', n: 'Foliar · bioestimulante / aminoácidos', practica: 'foliares' },
    { k: 'fungicida',      seccion: 'ciclo', n: 'Fungicida',                          practica: 'fungicidas' },
    { k: 'insecticida',    seccion: 'ciclo', n: 'Insecticida',                        practica: 'insecticidas' },
    { k: 'herbicida',      seccion: 'ciclo', n: 'Herbicida',                          practica: 'herbicidas' },
    { k: 'otro',           seccion: 'ciclo', n: 'Otro',                               practica: null }
  ];
  var METODOS = [
    { k: 'sembradora',       n: 'Sembradora (en la línea)' },
    { k: 'voleo_presiembra', n: 'Al voleo antes de sembrar' },
    { k: 'voleo_cobertura',  n: 'Al voleo en cobertura' },
    { k: 'tasa_variable',    n: 'Tasa variable según mapa de fertilidad' },
    { k: 'fertirriego',      n: 'Fertirriego por el pivot' },
    { k: 'incorporado',      n: 'Incorporado con labranza' },
    { k: 'otro',             n: 'Otro' }
  ];
  // Cómo se aplica lo de la sección semilla: hoy el inoculante muchas veces va líquido al surco por la sembradora.
  var FORMAS_SEMILLA = [
    { k: 'semilla', n: 'Mezclado con la semilla' },
    { k: 'surco',   n: 'Líquido en el surco (sembradora con tanque)' },
    { k: 'industrial', n: 'Semilla tratada de fábrica (industrial)' }
  ];
  var UNIDADES = {
    semilla: ['mL/kg semilla', 'g/kg semilla', 'mL/100 kg semilla', 'g/100 kg semilla', 'dosis/bolsa', 'mL/ha (surco)', 'L/ha (surco)', 'dosis/ha (surco)'],
    fertilizacion: ['kg/ha', 't/ha', 'L/ha'],
    ciclo: ['L/ha', 'kg/ha', 'mL/ha', 'g/ha', 'dosis/ha']
  };
  var ETAPAS = ['Presiembra', 'Siembra', 'Emergencia (VE)', 'V2–V4', 'V5–V8', 'Prefloración', 'Floración (R1–R2)', 'Llenado (R3–R6)', 'Madurez'];
  var PRACTICAS = [
    { k: 'tratamientoSemilla', n: 'Tratamiento de semilla (fungicida/insecticida)', peso: 0.35 },
    { k: 'inoculacion',        n: 'Inoculación',                 peso: 0.35 },
    { k: 'inoculacionSurco',   n: 'Inoculación líquida en el surco', peso: 0.25 },
    { k: 'coinoculacion',      n: 'Co-inoculación',              peso: 0.2 },
    { k: 'microSemilla',       n: 'CoMo / micronutrientes en semilla', peso: 0.2 },
    { k: 'bioSemilla',         n: 'Bioestimulante en semilla',   peso: 0.15 },
    { k: 'fertBase',           n: 'Fertilización de base',       peso: 0.3 },
    { k: 'fertCobertura',      n: 'Cobertura',                   peso: 0.25 },
    { k: 'fertirriego',        n: 'Fertirriego',                 peso: 0.3 },
    { k: 'tasaVariable',       n: 'Fertilización a tasa variable', peso: 0.3 },
    { k: 'foliares',           n: 'Foliares',                    peso: 0.2 },
    { k: 'fungicidas',         n: 'Fungicidas',                  peso: 0.25 },
    { k: 'insecticidas',       n: 'Insecticidas',                peso: 0.2 },
    { k: 'herbicidas',         n: 'Herbicidas',                  peso: 0.1 },
    { k: 'encalado',           n: 'Encalado',                    peso: 0.3 }
  ];
  // Fertilizantes comunes: % de N, P2O5, K2O (y S). Fuente: fichas técnicas habituales.
  var FERTILIZANTES = [
    { re: /^urea/i,                        n: 46, p: 0,  k: 0,  s: 0 },
    { re: /(sulfato de amonio|SAM\b)/i,    n: 21, p: 0,  k: 0,  s: 24 },
    { re: /(nitrato de amonio)/i,          n: 33, p: 0,  k: 0,  s: 0 },
    { re: /(^MAP\b|fosfato monoam)/i,      n: 11, p: 52, k: 0,  s: 0 },
    { re: /(^DAP\b|fosfato diam)/i,        n: 18, p: 46, k: 0,  s: 0 },
    { re: /(^SSP\b|super ?fosfato simple)/i, n: 0, p: 18, k: 0, s: 12 },
    { re: /(^TSP\b|super ?fosfato triple)/i, n: 0, p: 46, k: 0, s: 0 },
    { re: /(^KCl\b|cloruro de potasio|muriato)/i, n: 0, p: 0, k: 60, s: 0 },
    { re: /(sulfato de potasio|SOP\b)/i,   n: 0,  p: 0,  k: 50, s: 18 },
    { re: /(sulpomag|sulfato de potasio y magnesio)/i, n: 0, p: 0, k: 22, s: 22 },
    { re: /(yeso|gypsum)/i,                n: 0,  p: 0,  k: 0,  s: 17 },
    { re: /(calc[aá]reo|cal agr|dolom)/i,   n: 0,  p: 0,  k: 0,  s: 0 }
  ];
  // Rotación y cobertura de invierno (antes de este cultivo). En Paraguay/Brasil son 2 cultivos comerciales
  // al año; la cobertura entre cosechas (avena, brachiaria, Santa Fe) sube la MO, frena malezas y guarda agua.
  // Cobertura = la ESPECIE que quedó en el lote entre cosechas (no es una técnica de siembra).
  var COBERTURAS = [
    { k: '',           n: 'Sin dato' },
    { k: 'ninguna',    n: 'Ninguna: entró directo sobre el rastrojo (no dio tiempo o no se sembró)' },
    { k: 'avena',      n: 'Avena negra o blanca' },
    { k: 'brachiaria', n: 'Brachiaria ruziziensis' },
    { k: 'brizantha',  n: 'Brachiaria brizantha (Marandu, Piatã, Xaraés)' },
    { k: 'milheto',    n: 'Milheto (mijo perla)' },
    { k: 'sorgo_forr', n: 'Sorgo forrajero' },
    { k: 'nabo',       n: 'Nabo forrajero' },
    { k: 'centeno',    n: 'Centeno / triticale' },
    { k: 'crotalaria', n: 'Crotalaria' },
    { k: 'mucuna',     n: 'Mucuna / leguminosa de cobertura' },
    { k: 'mezcla',     n: 'Mezcla de coberturas (mix de especies)' },
    { k: 'pastura',    n: 'Pastura (integración agricultura-ganadería)' },
    { k: 'otra',       n: 'Otra' }
  ];
  // Consorcio = el cultivo se siembra JUNTO con una forrajera (técnica). Sistema Santa Fe (Embrapa):
  // maíz (o sorgo) + brachiaria en la misma siembra o al fertilizar en cobertura; da grano + paja + pasto.
  var CONSORCIOS = [
    { k: '',          n: 'Sin consorcio (cultivo solo)' },
    { k: 'santa_fe',  n: 'Sistema Santa Fe: maíz/sorgo + brachiaria ruziziensis' },
    { k: 'santa_fe_briz', n: 'Santa Fe con brachiaria brizantha' },
    { k: 'ilp',       n: 'Integración lavoura-pecuária (forrajera para pastoreo)' },
    { k: 'otro',      n: 'Otro consorcio (indicar en detalle)' }
  ];
  // Labores entre la cosecha anterior y esta siembra (lo que se hace "al sacar el maíz": encalar, subsolar…)
  var LABORES_ENTRE = [
    { k: 'subsolado',   n: 'Subsolado / descompactación' },
    { k: 'escarificado', n: 'Escarificado' },
    { k: 'encalado',    n: 'Encalado (t/ha en el campo de arriba)' },
    { k: 'yeso',        n: 'Yeso agrícola' },
    { k: 'rastroneada', n: 'Rastroneada / rastra' },
    { k: 'nivelacion',  n: 'Nivelación / terraceo' },
    { k: 'desecacion',  n: 'Desecación química (barbecho químico)' },
    { k: 'abono_organico', n: 'Abono orgánico / cama de pollo / estiércol' }
  ];
  var LAB_POR_K = {}; LABORES_ENTRE.forEach(function (l) { LAB_POR_K[l.k] = l; });
  function nombreLabor(k) { return LAB_POR_K[k] ? LAB_POR_K[k].n : (k || ''); }
  // Sistema de siembra: sobre qué se sembró.
  var SISTEMAS_SIEMBRA = [
    { k: '',                   n: 'Sin dato' },
    { k: 'directa_cobertura',  n: 'Siembra directa sobre cobertura (desecada o rolada)' },
    { k: 'directa_rastrojo',   n: 'Siembra directa sobre rastrojo del cultivo anterior' },
    { k: 'minima',             n: 'Labranza mínima / escarificado' },
    { k: 'convencional',       n: 'Convencional: rastroneada / arada' },
    { k: 'otro',               n: 'Otro' }
  ];
  var MANEJO_COBERTURA = [
    { k: '',         n: '—' },
    { k: 'quimica',  n: 'Desecada con herbicida' },
    { k: 'rolo',     n: 'Rolo-faca / rolada' },
    { k: 'pastoreo', n: 'Pastoreada' },
    { k: 'incorporada', n: 'Incorporada' }
  ];
  var ANTECESORES_EXTRA = ['Barbecho', 'Pastura', 'Campo nuevo (desmonte)', 'Cobertura de invierno'];
  var COB_POR_K = {}; COBERTURAS.forEach(function (c) { COB_POR_K[c.k] = c; });
  var CONS_POR_K = {}; CONSORCIOS.forEach(function (c) { CONS_POR_K[c.k] = c; });
  var SIS_POR_K = {}; SISTEMAS_SIEMBRA.forEach(function (c) { SIS_POR_K[c.k] = c; });
  function nombreConsorcio(k) { return CONS_POR_K[k] ? CONS_POR_K[k].n : (k || ''); }
  function nombreSistema(k) { return SIS_POR_K[k] ? SIS_POR_K[k].n : (k || ''); }
  var MCOB_POR_K = {}; MANEJO_COBERTURA.forEach(function (c) { MCOB_POR_K[c.k] = c; });
  function nombreCobertura(k) { return COB_POR_K[k] ? COB_POR_K[k].n : (k || 'Sin dato'); }
  function nombreManejoCobertura(k) { return MCOB_POR_K[k] ? MCOB_POR_K[k].n : (k || ''); }
  function normCultivo(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  /* Resumen de rotación de un cultivo: { cargada, conCobertura, cobertura, sojaSobreSoja, mismoCultivo, anterior } */
  function rotacion(cultivo, cultivoAnterior, cobertura, consorcio, sistema, labores) {
    labores = Array.isArray(labores) ? labores : [];
    // Datos viejos: "santa_fe" cargado como cobertura = brachiaria como cobertura + consorcio Santa Fe
    if (cobertura === 'santa_fe') { cobertura = 'brachiaria'; consorcio = consorcio || 'santa_fe'; }
    var cu = normCultivo(cultivo), an = normCultivo(cultivoAnterior);
    var cargada = !!(an || cobertura || sistema);
    var conCob = !!cobertura && cobertura !== 'ninguna';
    var mismo = !!(cu && an && cu.split(' ')[0] === an.split(' ')[0]);
    return { cargada: cargada, conCobertura: conCob, cobertura: cobertura || '', anterior: cultivoAnterior || '', mismoCultivo: mismo, sojaSobreSoja: mismo && cu.indexOf('soja') === 0,
      consorcio: consorcio || '', consorcioSantaFe: /^santa_fe/.test(consorcio || ''), sistema: sistema || '', siembraDirecta: /^directa/.test(sistema || ''), convencional: sistema === 'convencional',
      labores: labores, subsolado: labores.indexOf('subsolado') !== -1 || labores.indexOf('escarificado') !== -1, encaladoEntre: labores.indexOf('encalado') !== -1, yeso: labores.indexOf('yeso') !== -1 };
  }

  var POR_K = {}; CATEGORIAS.forEach(function (c) { POR_K[c.k] = c; });
  var METODO_POR_K = {}; METODOS.forEach(function (m) { METODO_POR_K[m.k] = m; });
  var FORMA_POR_K = {}; FORMAS_SEMILLA.forEach(function (f) { FORMA_POR_K[f.k] = f; });
  function nombreForma(k) { return FORMA_POR_K[k] ? FORMA_POR_K[k].n : (k || ''); }

  function nombreCategoria(k) { return POR_K[k] ? POR_K[k].n : (k || 'Otro'); }
  function nombreMetodo(k) { return METODO_POR_K[k] ? METODO_POR_K[k].n : (k || ''); }
  function seccionDe(categoria) { return POR_K[categoria] ? POR_K[categoria].seccion : 'ciclo'; }

  /* Grado NPK de un fertilizante: por fórmula "04-30-10" (o "4-30-10", "04-30-10+5S") o por nombre conocido. */
  function gradoDe(texto) {
    var t = String(texto || '').trim();
    var m = t.match(/(\d{1,2}(?:[.,]\d)?)\s*-\s*(\d{1,2}(?:[.,]\d)?)\s*-\s*(\d{1,2}(?:[.,]\d)?)/);
    if (m) return { n: parseFloat(m[1].replace(',', '.')), p: parseFloat(m[2].replace(',', '.')), k: parseFloat(m[3].replace(',', '.')), s: (t.match(/\+\s*(\d+)\s*S/i) ? parseFloat(RegExp.$1) : 0), origen: 'fórmula' };
    for (var i = 0; i < FERTILIZANTES.length; i++) if (FERTILIZANTES[i].re.test(t)) return { n: FERTILIZANTES[i].n, p: FERTILIZANTES[i].p, k: FERTILIZANTES[i].k, s: FERTILIZANTES[i].s, origen: 'producto' };
    return null;
  }
  /* kg/ha de N, P2O5, K2O que aporta un insumo de fertilización */
  function npkDe(insumo) {
    if (!insumo || seccionDe(insumo.categoria) !== 'fertilizacion') return null;
    var g = gradoDe(insumo.formula || insumo.producto); if (!g) return null;
    var dosis = parseFloat(insumo.dosis); if (isNaN(dosis)) return null;
    var kg = insumo.unidad === 't/ha' ? dosis * 1000 : dosis;   // L/ha se toma como kg/ha (densidad ~1)
    return { n: kg * g.n / 100, p2o5: kg * g.p / 100, k2o: kg * g.k / 100, s: kg * (g.s || 0) / 100, grado: g };
  }
  function totalesNPK(insumos) {
    var t = { n: 0, p2o5: 0, k2o: 0, s: 0, items: 0 };
    (insumos || []).forEach(function (i) { var x = npkDe(i); if (!x) return; t.n += x.n; t.p2o5 += x.p2o5; t.k2o += x.k2o; t.s += x.s; t.items++; });
    return t;
  }

  /* Resumen de manejo de una campaña: cuenta por práctica.
     aplicaciones = eventos tipo 'aplicacion' del Operador dentro del ciclo (sin categoría). */
  function resumen(insumos, aplicaciones, manejoCompleto) {
    insumos = insumos || []; aplicaciones = aplicaciones || [];
    var r = { total: insumos.length, aplicacionesOperador: aplicaciones.length, productos: [], cargado: insumos.length > 0 || !!manejoCompleto || aplicaciones.length > 0 };
    PRACTICAS.forEach(function (p) { r[p.k] = 0; });
    insumos.forEach(function (i) {
      var c = POR_K[i.categoria];
      if (c && c.practica) r[c.practica] = (r[c.practica] || 0) + 1;
      if (i.metodo === 'tasa_variable') r.tasaVariable = (r.tasaVariable || 0) + 1;
      if ((i.categoria === 'inoculante' || i.categoria === 'coinoculante') && i.forma === 'surco') r.inoculacionSurco = (r.inoculacionSurco || 0) + 1;
      if (i.producto || i.formula) r.productos.push(i.producto || i.formula);
    });
    aplicaciones.forEach(function (a) { if (a.producto) r.productos.push(a.producto); });
    r.npk = totalesNPK(insumos);
    return r;
  }
  function tiene(manejo, practica) { return !!(manejo && manejo[practica] > 0); }

  /* Texto corto para tarjetas: "Trat. semilla · Inoculación · 2 fungicidas" */
  function textoCorto(manejo) {
    if (!manejo || !manejo.cargado) return '';
    var partes = [];
    PRACTICAS.forEach(function (p) { var n = manejo[p.k]; if (n > 0) partes.push(n > 1 && /s$/.test(p.n) ? n + ' ' + p.n.toLowerCase() : p.n); });
    if (manejo.npk && manejo.npk.items) partes.push('N ' + Math.round(manejo.npk.n) + ' · P₂O₅ ' + Math.round(manejo.npk.p2o5) + ' · K₂O ' + Math.round(manejo.npk.k2o) + ' kg/ha');
    if (manejo.aplicacionesOperador) partes.push(manejo.aplicacionesOperador + ' aplic. del Operador');
    return partes.join(' · ') || 'sin insumos (manejo completo)';
  }

  window.SafiaInsumos = { LABORES_ENTRE: LABORES_ENTRE, nombreLabor: nombreLabor, CONSORCIOS: CONSORCIOS, SISTEMAS_SIEMBRA: SISTEMAS_SIEMBRA, nombreConsorcio: nombreConsorcio, nombreSistema: nombreSistema, COBERTURAS: COBERTURAS, MANEJO_COBERTURA: MANEJO_COBERTURA, ANTECESORES_EXTRA: ANTECESORES_EXTRA, nombreCobertura: nombreCobertura, nombreManejoCobertura: nombreManejoCobertura, rotacion: rotacion, SECCIONES: SECCIONES, CATEGORIAS: CATEGORIAS, METODOS: METODOS, FORMAS_SEMILLA: FORMAS_SEMILLA, nombreForma: nombreForma, UNIDADES: UNIDADES, ETAPAS: ETAPAS, PRACTICAS: PRACTICAS, FERTILIZANTES: FERTILIZANTES,
    nombreCategoria: nombreCategoria, nombreMetodo: nombreMetodo, seccionDe: seccionDe, gradoDe: gradoDe, npkDe: npkDe, totalesNPK: totalesNPK, resumen: resumen, tiene: tiene, textoCorto: textoCorto };
})();
