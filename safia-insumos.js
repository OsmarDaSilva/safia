/* SAFIA — Manejo e insumos por campaña (catálogo compartido)
   -------------------------------------------------------------------
   Cada campaña puede registrar, de forma estructurada y opcional, todo
   lo que se usó: tratamiento de semilla (fungicida, insecticida,
   micronutrientes), inoculación y co-inoculación, fertilización de base,
   cobertura y fertirriego, foliares, fungicidas, insecticidas, herbicidas,
   encalado. Se guarda en campana.insumos = [{ id, categoria, producto,
   dosis, unidad, etapa, fecha, cultivoIdx, obs }]. El motor de casos lo
   resume en "prácticas" (con / sin) para comparar rindes. */
(function () {
  'use strict';

  var CATEGORIAS = [
    { k: 'ts_fungicida',   n: 'Tratamiento de semilla · fungicida',                 grupo: 'Semilla',       practica: 'tratamientoSemilla' },
    { k: 'ts_insecticida', n: 'Tratamiento de semilla · insecticida',               grupo: 'Semilla',       practica: 'tratamientoSemilla' },
    { k: 'ts_micro',       n: 'Tratamiento de semilla · micronutrientes / bioestimulante', grupo: 'Semilla', practica: 'microSemilla' },
    { k: 'inoculante',     n: 'Inoculante (Bradyrhizobium, Azospirillum…)',          grupo: 'Semilla',       practica: 'inoculacion' },
    { k: 'coinoculante',   n: 'Co-inoculante',                                       grupo: 'Semilla',       practica: 'coinoculacion' },
    { k: 'fert_base',      n: 'Fertilización de base (a la siembra)',               grupo: 'Fertilización', practica: 'fertBase' },
    { k: 'fert_cobertura', n: 'Fertilización de cobertura',                          grupo: 'Fertilización', practica: 'fertCobertura' },
    { k: 'fertirriego',    n: 'Fertirriego (por el equipo de riego)',                grupo: 'Fertilización', practica: 'fertirriego' },
    { k: 'foliar_micro',   n: 'Foliar · micronutrientes',                            grupo: 'Foliar',        practica: 'foliares' },
    { k: 'foliar_bio',     n: 'Foliar · bioestimulante / aminoácidos',               grupo: 'Foliar',        practica: 'foliares' },
    { k: 'fungicida',      n: 'Fungicida',                                           grupo: 'Protección',    practica: 'fungicidas' },
    { k: 'insecticida',    n: 'Insecticida',                                         grupo: 'Protección',    practica: 'insecticidas' },
    { k: 'herbicida',      n: 'Herbicida',                                           grupo: 'Protección',    practica: 'herbicidas' },
    { k: 'encalado',       n: 'Encalado / yeso agrícola',                            grupo: 'Suelo',         practica: 'encalado' },
    { k: 'otro',           n: 'Otro',                                                grupo: 'Otro',          practica: null }
  ];
  var UNIDADES = ['kg/ha', 'L/ha', 'g/ha', 'mL/ha', 'mL/kg semilla', 'g/kg semilla', 'dosis/ha', 'kg N/ha', 't/ha', 'unidad/ha'];
  var ETAPAS = ['Presiembra', 'Tratamiento de semilla', 'Siembra', 'Emergencia (VE)', 'V2–V4', 'V5–V8', 'Prefloración', 'Floración (R1–R2)', 'Llenado (R3–R6)', 'Madurez'];
  var PRACTICAS = [
    { k: 'tratamientoSemilla', n: 'Tratamiento de semilla', peso: 0.35 },
    { k: 'inoculacion',        n: 'Inoculación',            peso: 0.35 },
    { k: 'coinoculacion',      n: 'Co-inoculación',         peso: 0.2 },
    { k: 'microSemilla',       n: 'Micronutrientes en semilla', peso: 0.2 },
    { k: 'fertBase',           n: 'Fertilización de base',  peso: 0.3 },
    { k: 'fertCobertura',      n: 'Cobertura',              peso: 0.25 },
    { k: 'fertirriego',        n: 'Fertirriego',            peso: 0.3 },
    { k: 'foliares',           n: 'Foliares',               peso: 0.2 },
    { k: 'fungicidas',         n: 'Fungicidas',             peso: 0.25 },
    { k: 'insecticidas',       n: 'Insecticidas',           peso: 0.2 },
    { k: 'herbicidas',         n: 'Herbicidas',             peso: 0.1 },
    { k: 'encalado',           n: 'Encalado',               peso: 0.3 }
  ];
  var POR_K = {}; CATEGORIAS.forEach(function (c) { POR_K[c.k] = c; });

  function nombreCategoria(k) { return POR_K[k] ? POR_K[k].n : (k || 'Otro'); }

  /* Resumen de manejo de una campaña: cuenta por práctica.
     aplicaciones = eventos tipo 'aplicacion' del Operador dentro del ciclo (sin categoría). */
  function resumen(insumos, aplicaciones, manejoCompleto) {
    insumos = insumos || []; aplicaciones = aplicaciones || [];
    var r = { total: insumos.length, aplicacionesOperador: aplicaciones.length, productos: [], cargado: insumos.length > 0 || !!manejoCompleto || aplicaciones.length > 0 };
    PRACTICAS.forEach(function (p) { r[p.k] = 0; });
    insumos.forEach(function (i) {
      var c = POR_K[i.categoria];
      if (c && c.practica) r[c.practica] = (r[c.practica] || 0) + 1;
      if (i.producto) r.productos.push(i.producto);
    });
    aplicaciones.forEach(function (a) { if (a.producto) r.productos.push(a.producto); });
    return r;
  }
  function tiene(manejo, practica) { return !!(manejo && manejo[practica] > 0); }

  /* Texto corto para tarjetas: "Trat. semilla · Inoculación · 2 fungicidas" */
  function textoCorto(manejo) {
    if (!manejo || !manejo.cargado) return '';
    var partes = [];
    PRACTICAS.forEach(function (p) { var n = manejo[p.k]; if (n > 0) partes.push(n > 1 && /s$/.test(p.n) ? n + ' ' + p.n.toLowerCase() : p.n); });
    if (manejo.aplicacionesOperador) partes.push(manejo.aplicacionesOperador + ' aplic. del Operador');
    return partes.join(' · ') || 'sin insumos (manejo completo)';
  }

  window.SafiaInsumos = { CATEGORIAS: CATEGORIAS, UNIDADES: UNIDADES, ETAPAS: ETAPAS, PRACTICAS: PRACTICAS, nombreCategoria: nombreCategoria, resumen: resumen, tiene: tiene, textoCorto: textoCorto };
})();
