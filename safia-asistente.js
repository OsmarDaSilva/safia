/* SAFIA — Asistente agronómico (el "agrónomo inteligente")
   -------------------------------------------------------------------
   Chat que responde con los datos reales de SAFIA. La IA vive en la función safia-asistente (servidor, con la llave);
   las HERRAMIENTAS se ejecutan acá, en el navegador, sobre los datos que este usuario ya ve con su rol (un cliente: lo
   suyo y los lotes de la zona sin nombres). Así los números los calcula SAFIA, no la IA, y nadie ve lo que no debe.
   Herramientas: buscar_casos, resumen_casos, referencia_zona, info_material, clima_y_riego, agua_hoy, como_va_campana, interpretar_suelo, mis_campos.
   Uso: SafiaAsistente.montar(elemento). */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function r0(v) { return v == null || isNaN(v) ? null : Math.round(v); }
  function r1(v) { return v == null || isNaN(v) ? null : Math.round(v * 10) / 10; }
  function propios(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  var C = function () { return window.SafiaCasos; };

  /* ---------- datos ---------- */
  var cacheCasos = null, cacheT = 0;
  function casos() { if (!cacheCasos || Date.now() - cacheT > 60000) { cacheCasos = C() ? C().armarCasos() : []; cacheT = Date.now(); } return cacheCasos; }
  function misClientesIds() { var s = {}; propios('clientes').forEach(function (c) { s[String(c.id)] = 1; }); return s; }
  function anio(c) { return parseInt(String(c.cosecha || c.siembra || '').slice(0, 4), 10) || null; }
  var GRUPO = { grano: 'comercial', ensilaje: 'ensilaje', pasto: 'forraje' };
  function mismoCultivo(a, b) {
    if (!b) return true;
    if (C() && C().esPasto(b)) return C().esPasto(a);
    var x = norm(a), y = norm(b); return x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0;
  }
  function filtrar(lista, f) {
    f = f || {};
    var mios = f.solo_mios ? misClientesIds() : null;
    return lista.filter(function (c) {
      if (!mismoCultivo(c.cultivo, f.cultivo)) return false;
      if (f.finalidad && C() && C().grupoFinalidad(c.cultivo, c.finalidad) !== GRUPO[f.finalidad]) return false;
      if (f.epoca && c.epoca !== f.epoca) return false;
      if (f.riego === 'con_riego' && c.riego === false) return false;
      if (f.riego === 'secano' && c.riego !== false) return false;
      if (f.region && C() && C().region(c) !== f.region) return false;
      if (f.departamento && norm(c.departamento).indexOf(norm(f.departamento)) < 0) return false;
      if (f.localidad && norm(c.localidad).indexOf(norm(f.localidad)) < 0 && (!C() || C().normLoc(c.localidad) !== C().normLoc(f.localidad))) return false;
      if (f.variedad && norm(c.variedad).indexOf(norm(f.variedad)) < 0) return false;
      if (f.desde_anio && (anio(c) || 0) < f.desde_anio) return false;
      if (mios && !mios[String(c.clienteId)]) return false;
      return true;
    });
  }
  function etiqueta(c) {
    if (/^Lote \d+ de /.test(c.campo || '')) return c.campo;          // de la zona: ya viene sin nombre
    return [c.cliente, c.campo].filter(Boolean).join(' · ') || ('Lote de ' + (c.localidad || c.departamento || 'la zona'));
  }
  function casoCorto(c) {
    var s = c.suelo, cl = c.clima;
    return {
      id: c.id, quien: etiqueta(c), lote: c.equipo || null, localidad: c.localidad || null, departamento: c.departamento || null,
      region: C() ? C().region(c) : null, campana: c.campana || null, cultivo: c.cultivo, finalidad: c.finalidad, epoca: c.epoca, variedad: c.variedad || null,
      siembra: c.siembra || null, cosecha: c.cosecha || null, dias_ciclo: c.dias, rinde_kg_ha: r0(c.rindeKgHa), objetivo_kg_ha: r0(c.objetivoKgHa), riego: c.riego !== false,
      agua_total_mm: r0(c.aguaTotalMM), lluvia_mm: r0(c.lluviaMM), riego_mm: r0(c.riegoMM), superficie_ha: r1(c.superficie), densidad: c.densidad,
      encalado_t_ha: c.encaladoTnHa, fertilizacion: c.fertilizacion || null, cultivo_anterior: c.cultivoAnterior || null, cobertura: c.cobertura || null, sistema_siembra: c.sistemaSiembra || null,
      suelo: s ? { ph: s.ph, mo: s.mo, p: s.p, k: s.k, ca: s.ca, mg: s.mg, cic: s.cic, sat_bases: s.satBases, arcilla: s.arcilla, fecha: s.fecha } : null,
      clima_ciclo: cl ? { temp_media: cl.tempMedia, dias_mas_35: cl.diasMayor35, grados_dia: cl.gradosDia, eto_mm: cl.et0Total, lluvia_mm: cl.lluviaClima } : null,
      manejo: c.manejo && typeof c.manejo === 'object' ? (c.manejo.texto || c.manejo.resumen || null) : (c.manejo || null)
    };
  }
  function stats(l) {
    var v = l.map(function (c) { return num(c.rindeKgHa); }).filter(function (x) { return x != null; }), a = l.map(function (c) { return num(c.aguaTotalMM); }).filter(function (x) { return x != null; });
    var prom = function (x) { return x.length ? x.reduce(function (p, q) { return p + q; }, 0) / x.length : null; };
    return { casos: l.length, rinde_promedio_kg_ha: r0(prom(v)), rinde_maximo_kg_ha: v.length ? r0(Math.max.apply(null, v)) : null, rinde_minimo_kg_ha: v.length ? r0(Math.min.apply(null, v)) : null, agua_total_promedio_mm: r0(prom(a)), casos_con_agua: a.length };
  }
  var refProd = null;
  function referencias() {
    if (refProd) return Promise.resolve(refProd);
    if (!window.safiaSupabase) return Promise.resolve([]);
    return window.safiaSupabase.from('safia_ref_produccion').select('localidad,departamento,cultivo,finalidad,epoca_siembra,riego,prod_ton_ha,costo_final_ha,costo_insumos_ha,costo_maquinas_ha,costo_fletes_ha,alquiler_ha,energia_ha,mantenimiento_ha')
      .then(function (r) { refProd = r.data || []; return refProd; }, function () { return []; });
  }
  function campoPorNombre(nombre) {
    var cs = propios('campos'); if (!nombre) return null;
    var n = norm(nombre);
    return cs.find(function (c) { return norm(c.nombre) === n; }) || cs.find(function (c) { return norm(c.nombre).indexOf(n) >= 0 || n.indexOf(norm(c.nombre)) >= 0; }) || null;
  }
  function sueloDeCampo(campo) {
    // el análisis más nuevo; si ese día hay varias muestras, el promedio de la parcela que arma SAFIA (esPromedio)
    var l = propios('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campo.id); }).sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || ((b.esPromedio ? 1 : 0) - (a.esPromedio ? 1 : 0)); });
    return l[0] || null;
  }

  /* ---------- campaña en curso (lo que muestra el Banco, sin abrirlo) ---------- */
  // Los módulos del Banco (agua por etapa, satélite, hoja, seguimiento) leen a través de SafiaBanco: acá un puente
  // de solo lectura con el campo de la consulta. guardar no escribe nada: el asistente nunca cambia datos.
  var campoPuente = null;
  function puente(campo) {
    if (!window.SafiaBanco || window.SafiaBanco._asistente) window.SafiaBanco = { _asistente: true, campoActual: function () { return campoPuente; }, leer: propios, guardar: function () {}, toast: function () {}, refrescar: function () {} };
    campoPuente = campo;
  }
  var NOMBRE_ETAPA = { pre: 'antes de sembrar', veg: 'vegetativa', flor: 'floración', llen: 'llenado de grano', mad: 'maduración' };
  var SEMAFORO = { verde: 'bien', ambar: 'atención', rojo: 'problema', gris: 'sin datos suficientes' };
  function dias(a, b) { return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000); }
  function campanaEnCurso(x, hoyK) {
    var e = x.e, c = x.c, cam = x.cam, cu = x.cu, idx = x.idx, siembra = cu.fechaSiembra ? String(cu.fechaSiembra).slice(0, 10) : null;
    puente(c);
    var falta = [];
    var r = { campo: c ? c.nombre : null, lote: e.nombre, superficie_ha: num(cu.superficie) || num(e.superficie), campana: cam.nombre || null, cultivo: cu.cultivo, variedad: cu.variedad || null, finalidad: cu.finalidad || null,
      siembra: siembra, dias_desde_siembra: siembra ? dias(siembra, hoyK) : null, cosecha_estimada: cu.fechaCosecha || null, densidad: cu.densidad || null, cultivo_anterior: cu.cultivoAnterior || null, sistema_siembra: cu.sistemaSiembra || null,
      meta_kg_ha: num(cu.rendimientoObj) };
    if (!siembra) { r.aviso = 'La campaña no tiene fecha de siembra: sin ella no se puede seguir el ciclo.'; return Promise.resolve(r); }
    var tareas = [];

    // 1) Agua por etapa (FAO-56 + FAO-33): cuánto rinde costó la falta de agua hasta hoy y qué viene
    var ag = null;
    if (window.SafiaAgua && c) {
      var ca = SafiaAgua.campanasDelLote(e.id).find(function (k) { return k.id === String(cam.id) + '_' + idx; });
      if (ca) tareas.push(SafiaAgua.calcular(c, e, ca).then(function (res) {
        var reales = res.dias.filter(function (d) { return !d.pronostico; });
        ag = { perdidaPct: res.perdidaPct, etapa: reales.length ? reales[reales.length - 1].etapa : null };
        r.agua = { rinde_perdido_por_agua_hasta_hoy_pct: res.perdidaPct, dias_con_estres: reales.filter(function (d) { return d.ks < 1; }).length, etapa_hoy: NOMBRE_ETAPA[ag.etapa] || ag.etapa,
          por_etapa: res.etapas.filter(function (s) { return s.dias > 0; }).map(function (s) { return { etapa: s.n, dias: s.dias, demanda_mm: s.etc, uso_mm: s.eta, deficit_pct: s.deficitPct, dias_estres: s.diasEstres, lluvia_mm: s.lluvia, riego_mm: s.riego, rinde_perdido_pct: s.perdidaPct }; }),
          episodios_de_falta: (res.episodios || []).map(function (p) { return { desde: p.desde, hasta: p.hasta, dias: p.dias, etapa: NOMBRE_ETAPA[p.etapa] || p.etapa }; }),
          hoy: res.hoy ? { agua_disponible_mm: r0(res.hoy.disponible), capacidad_mm: r0(res.hoy.taw), puede_gastar_antes_de_regar_mm: res.hoy.faltaParaRecarga, en_estres: res.hoy.ks < 1 } : null,
          proximos_7_dias: res.pronostico ? { lluvia_mm: res.pronostico.lluvia, demanda_mm: res.pronostico.etc, llega_al_punto_de_riego: res.pronostico.cruzaRecarga } : null,
          lluvia_de: res.lluviaDeEventos ? 'lluvias cargadas del lote' : 'clima estimado (CHIRPS/Open-Meteo): el lote no tiene lluvias cargadas en la campaña' };
        if (!res.lluviaDeEventos) falta.push('lluvias medidas en el pluviómetro del campo (Operador o Eventos)');
      }, function () { r.agua = { error: 'No se pudo traer el clima para el balance por etapa.' }; }));
    }

    // 2) Vigor satelital: la campaña de hoy contra las cosechadas del mismo lote, a los mismos días desde la siembra
    if (window.SafiaNDVI && c) {
      tareas.push(Promise.resolve(SafiaNDVI.cargarDeTabla()).catch(function () {}).then(function () {
        if (!e.poligono || !e.poligono.partes) { r.satelite = { sin_datos: 'El lote no tiene polígono cargado: sin él no hay NDVI (Equipos y lotes → KML o dibujar).' }; falta.push('el polígono del lote para el satélite'); return; }
        var serie = SafiaNDVI.serieDe(e.id) || [], camps = SafiaNDVI.campanasDelLote(e.id);
        var abierta = camps.find(function (k) { return k.id === String(cam.id) + '_' + idx; });
        var cv = abierta ? SafiaNDVI.curvaDe(abierta, serie) : { puntos: [] }, ult = cv.puntos[cv.puntos.length - 1];
        var ultima = serie.length ? serie[serie.length - 1].fecha : null;
        r.satelite = { pasadas_desde_siembra: cv.puntos.length, ultima_pasada_guardada: ultima, dias_sin_pasada: ultima ? dias(ultima, hoyK) : null };
        if (ultima && dias(ultima, hoyK) > 10) falta.push('traer las pasadas nuevas del satélite (Banco → Vigor satelital → Traer del satélite)');
        if (!ult) { r.satelite.nota = 'Todavía no hay pasadas del satélite desde la siembra.'; return; }
        r.satelite.hoy = { fecha: ult.fecha, dia_desde_siembra: ult.dds, ndvi: r1(ult.ndvi * 100) / 100 };
        if (ult.dds < 20) r.satelite.nota = 'Con menos de 20 días desde la siembra el NDVI es casi todo suelo: todavía no sirve para comparar.';
        r.satelite.mismas_fechas_otras_campanas = camps.filter(function (k) { return !k.abierta && k.rinde && norm(k.cultivo) === norm(cu.cultivo); }).map(function (k) {
          var kc = SafiaNDVI.curvaDe(k, serie), v = SafiaNDVI.ndviEnDia(kc, ult.dds);
          return { campana: k.nombre, siembra: k.siembra, variedad: k.variedad || null, rinde_kg_ha: r0(k.rinde), ndvi_al_mismo_dia: v == null ? null : Math.round(v * 100) / 100, diferencia_hoy_pct: v ? Math.round((ult.ndvi - v) / v * 100) : null, ndvi_maximo: kc.max == null ? null : Math.round(kc.max * 100) / 100, dia_del_maximo: kc.diaMax, dias_canopia_plena: kc.diasPlenos };
        });
      }));
    }

    return Promise.all(tareas).then(function () {
      // 3) Meta viva: ¿la meta guardada sigue alcanzable con lo que ya pasó?
      var u = { campanaId: cam.id, idx: idx, campana: cam, cultivo: cu };
      if (cu.planMeta && window.SafiaSeguimiento) {
        var mv = SafiaSeguimiento.metaViva(u, ag);
        if (mv) r.meta_viva = { meta_kg_ha: mv.meta, parte_de_kg_ha: mv.base, potencial_hoy_kg_ha: { min: mv.min, max: mv.max }, estado: SEMAFORO[mv.k], sabe_que_se_hizo: mv.sabemos, etapa: NOMBRE_ETAPA[mv.etapa] || mv.etapa,
          plan_hecho: mv.hechos + ' de ' + mv.total, descuento_por_agua_pct: mv.agua || 0,
          perdido_por_ventana_pasada: mv.perdidos.map(function (p) { return { item: p.it.nombre, rinde_que_se_pierde_pct: Math.round(p.ap[0] * 100) + '-' + Math.round(p.ap[1] * 100) }; }),
          toca_ahora: mv.ahora.map(function (a) { return { item: a.it.nombre, accion: a.it.accion }; }),
          proximos: mv.futuros.slice(0, 5).map(function (f) { return f.it.nombre; }),
          nutricion: mv.nutri ? mv.nutri.texto : null, metodo: 'plan de la meta (Motor 8): el potencial baja por lo que ya no se puede hacer y por el agua (FAO-33)' };
      } else if (r.meta_kg_ha) r.meta_viva = { nota: 'Hay meta (' + r.meta_kg_ha + ' kg/ha) pero sin plan guardado: armarlo en Banco → Meta de rinde para saber si sigue alcanzable.' };

      // 4) Fertilización e insumos cargados, y el balance de nutrientes contra la meta
      var ins = (cam.insumos || []).filter(function (k) { return k.cultivoIdx == null || k.cultivoIdx === idx; });
      var man = window.SafiaInsumos ? SafiaInsumos.resumen(ins, [], cam.manejoCompleto) : null;
      r.insumos = { cargados: ins.length, manejo_marcado_completo: !!cam.manejoCompleto, productos: ins.slice(0, 20).map(function (k) { return [k.producto || k.categoria, k.dosis ? k.dosis + ' ' + (k.unidad || '') : null, k.etapa || k.metodo || null].filter(Boolean).join(' · '); }), npk_kg_ha: man && man.npk ? man.npk : null };
      if (!ins.length && !cam.manejoCompleto) falta.push('los insumos de la campaña (semilla, fertilización, aplicaciones): Campañas → Manejo e insumos o la ficha');
      var bal = window.SafiaNutrientes ? SafiaNutrientes.balanceCampana(cam, idx) : null;
      if (bal && bal.exportado) r.nutrientes_para_la_meta = { se_lleva_kg_ha: { p2o5: r0(bal.exportado.p2o5), k2o: r0(bal.exportado.k2o) }, aplicado_kg_ha: bal.aplicado ? { p2o5: r0(bal.aplicado.p2o5), k2o: r0(bal.aplicado.k2o) } : null, fuente: 'exportación por tonelada IPNI/INTA' };

      // 5) Hoja / sensor desde la siembra
      if (window.SafiaFoliar) {
        var fol = SafiaFoliar.lista().filter(function (a) { return String(a.equipoId || '') === String(e.id) && String(a.fecha) >= siembra; });
        if (fol.length) { var a = fol[fol.length - 1], li = SafiaFoliar.interpretar(a); r.hoja = { fecha: a.fecha, tipo: a.tipo === 'sensor' ? 'sensor (Dualex/SPAD)' : 'análisis foliar', bajos: li.filter(function (k) { return k.estado === 'bajo' || k.estado === 'limite'; }).map(function (k) { return { nutriente: k.n, valor: k.valor, estado: k.estado, texto: k.texto }; }), fuente: 'rangos Embrapa / Fertilizar' }; }
        else { r.hoja = { nota: 'Sin análisis foliar ni lectura de sensor en esta campaña.' }; var dd = r.dias_desde_siembra; if (dd != null && dd >= 45) falta.push('un análisis foliar en floración (soja: 3er trifolio) o una lectura con Dualex/SPAD'); }
      }

      // 6) Campañas cosechadas del mismo lote y del mismo cultivo (cómo le fue antes y por qué)
      var ant = casos().filter(function (k) { return String(k.equipoId) === String(e.id) && mismoCultivo(k.cultivo, cu.cultivo); }).sort(function (a, b) { return String(b.siembra || '').localeCompare(String(a.siembra || '')); });
      r.campanas_anteriores_del_lote = ant.slice(0, 6).map(function (k) { return { campana: k.campana, variedad: k.variedad || null, siembra: k.siembra, rinde_kg_ha: r0(k.rindeKgHa), lluvia_mm: r0(k.lluviaMM), riego_mm: r0(k.riegoMM), dias_ciclo: k.dias }; });
      var rs = ant.map(function (k) { return num(k.rindeKgHa); }).filter(function (v) { return v; });

      // 7) El mejor lote de la zona: de OTROS productores (no del mismo cliente), mismo cultivo, finalidad, época y régimen de agua, sin nombres
      var ep = C() ? C().epocaDeSiembra(siembra) : null, conRiego = !(window.SafiaBalance && SafiaBalance.esSecano(e));
      var zona = c && C() ? casos().filter(function (k) { return String(k.equipoId) !== String(e.id) && (c.clienteId == null || String(k.clienteId) !== String(c.clienteId)) && mismoCultivo(k.cultivo, cu.cultivo) && (!ep || k.epoca === ep) && (k.riego !== false) === conRiego && C().normLoc(k.localidad) === C().normLoc(c.localidad) && C().grupoFinalidad(k.cultivo, k.finalidad) === C().grupoFinalidad(cu.cultivo, cu.finalidad); }) : [];
      zona.sort(function (a, b) { return b.rindeKgHa - a.rindeKgHa; });
      r.mejores_de_la_zona = { ambito: c ? (c.localidad || c.departamento) : null, epoca: ep, con_riego: conRiego, casos: zona.length, mejores: zona.slice(0, 3).map(function (k) { return { quien: 'Lote de ' + (k.localidad || k.departamento || 'la zona') + ' (sin nombre: regla de SAFIA)', variedad: k.variedad || null, siembra: k.siembra, rinde_kg_ha: r0(k.rindeKgHa), agua_total_mm: r0(k.aguaTotalMM) }; }) };

      // 8) Perspectiva: solo con lo calculado (plan de la meta o historia del lote), nunca inventada
      var persp = { etapa: ag && ag.etapa ? NOMBRE_ETAPA[ag.etapa] : null };
      if (r.meta_viva && r.meta_viva.potencial_hoy_kg_ha) persp.potencial_segun_plan_de_la_meta_kg_ha = r.meta_viva.potencial_hoy_kg_ha;
      if (rs.length) {
        var prom = rs.reduce(function (s, v) { return s + v; }, 0) / rs.length, mej = Math.max.apply(null, rs), fac = ag && ag.perdidaPct ? 1 - ag.perdidaPct / 100 : 1;
        persp.historia_del_lote = { campanas: rs.length, promedio_kg_ha: r0(prom), mejor_kg_ha: r0(mej), con_el_descuento_de_agua_hasta_hoy_kg_ha: { promedio: Math.round(prom * fac / 10) * 10, mejor: Math.round(mej * fac / 10) * 10 } };
      }
      persp.nota = (r.dias_desde_siembra != null && r.dias_desde_siembra < 45 ? 'Faltan casi todas las etapas que definen el rinde (floración y llenado): la perspectiva de hoy es el punto de partida, no una estimación de cosecha. ' : '') + 'Se afina con cada lluvia, riego, pasada del satélite e insumo que se carga.';
      r.perspectiva = persp;
      r.falta_cargar = falta;
      return r;
    });
  }

  /* ---------- herramientas ---------- */
  var HERR = {
    buscar_casos: function (i) {
      var l = filtrar(casos(), i), orden = i.orden || 'mayor_rinde', lim = Math.max(1, Math.min(25, i.limite || 10));
      l = l.slice().sort(function (a, b) { return orden === 'menor_rinde' ? a.rindeKgHa - b.rindeKgHa : (orden === 'mas_reciente' ? String(b.cosecha || b.siembra || '').localeCompare(String(a.cosecha || a.siembra || '')) : b.rindeKgHa - a.rindeKgHa); });
      return { total_que_cumplen: l.length, mostrados: Math.min(lim, l.length), casos: l.slice(0, lim).map(casoCorto), fuente: 'banco de SAFIA: campañas cosechadas reales' };
    },
    resumen_casos: function (i) {
      var l = filtrar(casos(), i), por = i.agrupar_por || 'variedad', g = {};
      var clave = function (c) {
        if (por === 'region') return C() ? (C().regionNombre(C().region(c)) || 'sin región') : '—';
        if (por === 'riego') return c.riego === false ? 'secano' : 'con riego';
        if (por === 'anio') return String(anio(c) || 'sin fecha');
        if (por === 'campo') return etiqueta(c);
        return (c[por] || '').toString().trim() || 'sin dato';
      };
      l.forEach(function (c) { var k = clave(c); (g[k] = g[k] || []).push(c); });
      var grupos = Object.keys(g).map(function (k) { return Object.assign({ grupo: k }, stats(g[k])); }).sort(function (a, b) { return (b.rinde_promedio_kg_ha || 0) - (a.rinde_promedio_kg_ha || 0); });
      return { total_casos: l.length, agrupado_por: por, grupos: grupos.slice(0, 40), fuente: 'banco de SAFIA: campañas cosechadas reales' };
    },
    referencia_zona: function (i) {
      return referencias().then(function (filas) {
        if (!filas.length) return { error: 'No se pudo leer la referencia regional (sin conexión).' };
        var nl = C() ? C().normLoc : norm, amb = null, sub = [];
        if (i.localidad) { sub = filas.filter(function (x) { return nl(x.localidad) === nl(i.localidad); }); if (sub.length) amb = 'localidad ' + i.localidad; }
        if (!sub.length && i.departamento) { sub = filas.filter(function (x) { return norm(x.departamento).indexOf(norm(i.departamento).slice(0, 6)) === 0; }); if (sub.length) amb = 'departamento ' + i.departamento + ' (promedio)'; }
        if (!sub.length) return { error: 'La referencia regional no tiene datos para esa localidad ni departamento.', departamentos_disponibles: Array.from(new Set(filas.map(function (x) { return x.departamento; }))).sort() };
        var fin = i.finalidad === 'ensilaje' ? 'Ensilaje' : (i.finalidad === 'pasto' ? 'Forraje' : 'Granos Comercial');
        var rr = C().refRegional(sub, i.cultivo, i.epoca || null, fin);
        if (!rr) return { error: 'La referencia de ' + amb + ' no tiene ' + i.cultivo + ' para esa finalidad y época.' };
        return { ambito: amb, epoca: rr.epoca || null, registros: rr.n, rinde_con_riego_kg_ha: r0(rr.riego), rinde_secano_kg_ha: r0(rr.secano), costo_con_riego_usd_ha: r0(rr.costoRiego), costo_secano_usd_ha: r0(rr.costoSecano), costos_con_riego: rr.costosRiego || null, costos_secano: rr.costosSecano || null, fuente: 'referencia agrícola regional de Irrigar' };
      });
    },
    info_material: function (i) {
      var M = window.SafiaMateriales; if (!M) return { error: 'Catálogo de materiales no disponible' };
      var d = M.buscar(i.cultivo, i.variedad), en = M.ensayosDe ? M.ensayosDe(i.cultivo, i.variedad) : [];
      return { encontrado: !!d, ficha: d || null, ensayos: (en || []).slice(0, 12).map(function (e) { var s = {}; Object.keys(e.sitio || {}).forEach(function (k) { if (k !== 'filas') s[k] = e.sitio[k]; }); return { ensayo: s, resultado: e.f }; }),
        nota: d ? 'Ficha del catálogo verificado de SAFIA (fuente en la ficha).' : 'No está en el catálogo verificado de SAFIA: no inventar sus datos.' };
    },
    clima_y_riego: function (i) {
      var P = window.SafiaClimaProyecto; if (!P) return { error: 'Módulo de clima no disponible' };
      var campo = i.campo ? campoPorNombre(i.campo) : null, lat = campo ? num(campo.latitud) : num(i.lat), lon = campo ? num(campo.longitud) : num(i.lon);
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '" entre los campos del usuario.', campos: propios('campos').map(function (c) { return c.nombre; }) };
      if (lat == null || lon == null) return { error: 'Falta la coordenada (el campo no tiene latitud y longitud cargadas).' };
      var an = campo ? sueloDeCampo(campo) : null;
      return P.historico(lat, lon).then(function (h) {
        var x = P.riego(h, { cultivo: i.cultivo, siembra: i.siembra || null, suelo: an, departamento: (campo && campo.departamento) || i.departamento || null, lat: lat, lon: lon });
        var R = h.resumen;
        var out = { lugar: campo ? campo.nombre + ' (' + [campo.localidad, campo.departamento].filter(Boolean).join(', ') + ')' : lat + ', ' + lon, periodo: R.desde + '-' + R.hasta,
          lluvia_anual_mm: r0(R.lluviaAnual), lluvia_min_mm: r0(R.lluviaMin), lluvia_max_mm: r0(R.lluviaMax), eto_anual_mm: r0(R.etoAnual), deficit_anual_mm: r0(R.deficit), fuente_clima: h.fuente };
        if (x && !x.error) Object.assign(out, { cultivo: x.cultivo, siembra: x.siembra, dias_ciclo: x.dias, textura_suelo: x.textura + (x.texturaSupuesta ? ' (supuesta: falta análisis con arcilla)' : ''),
          lluvia_en_ciclo_mm: r0(x.lluvia), consumo_cultivo_etc_mm: r0(x.etc), riego_neto_mm: r0(x.riegoNeto), riego_bruto_mm: r0(x.riegoBruto), eficiencia: x.eficiencia, riego_neto_8_de_10_mm: r0(x.riegoNetoP80),
          riego_neto_peor_anio_mm: r0(x.peor.riegoNeto), peor_anio: x.peor.etiqueta, pico_consumo_mm_dia: r1(x.pico7), secano_rinde_relativo_pct: r0(x.rindeRelSecano * 100), secano_peor_anio_pct: r0(x.rindeRelSecanoMin * 100),
          secano_siembra_tipica: x.secano ? x.secano.fechaTipica : null, secano_anios_sin_perfil_cargado: x.secano ? x.secano.nSinCarga + ' de ' + x.secano.n : null,
          metodo: 'balance diario FAO-56 de cada zafra de los 10 años; secano con siembra al cargarse el perfil (IDEAGRO 2025), rinde relativo FAO-33' });
        else if (x && x.error) out.error_cultivo = x.error;
        return out;
      });
    },
    interpretar_suelo: function (i) {
      var A = window.SafiaAgro; if (!A) return { error: 'Motor agronómico no disponible' };
      var campo = i.campo ? campoPorNombre(i.campo) : null, s = campo ? sueloDeCampo(campo) : (i.valores || null);
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: propios('campos').map(function (c) { return c.nombre; }) };
      if (!s) return { error: campo ? 'El campo no tiene análisis de suelo cargado.' : 'Faltan los valores del análisis.' };
      var inter = A.interpretarSuelo(s, i.cultivo), recs = A.recomendaciones(s, i.cultivo, i.rinde_objetivo || null);
      return { analisis: { fecha: s.fecha || null, ph: num(s.ph), mo: num(s.mo), p: num(s.p), k: num(s.k), ca: num(s.ca), mg: num(s.mg), cic: num(s.cic), sat_bases: num(s.satBases), arcilla: num(s.arcilla) },
        lectura: inter.map(function (x) { return { parametro: x.n, valor: x.valor, unidad: x.unidad, categoria: x.categoria, estado: x.estado, texto: x.texto }; }),
        recomendaciones: recs.map(function (r) { return { tema: r.titulo, detalle: r.detalle }; }), fuente: 'Manual de Calagem e Adubação RS/SC 2016 y Embrapa (motor agronómico de SAFIA)' };
    },
    agua_hoy: function (i) {
      // Mismo cálculo que la ficha de agua del Operador: clima de 92 días + pronóstico → SafiaBalance.simular → SafiaFichaAgua.proximoRiego
      var B = window.SafiaBalance, K = window.SafiaClima, FA = window.SafiaFichaAgua;
      if (!B || !K) return { error: 'Módulo de agua no disponible en esta página' };
      var campo = i.campo ? campoPorNombre(i.campo) : null;
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: propios('campos').map(function (c) { return c.nombre; }) };
      var cps = propios('campos'), cams = propios('campanas'), evs = propios('eventos');
      var lista = propios('equipos').filter(function (e) { return (!campo || String(e.campoId) === String(campo.id)) && (!i.lote || norm(e.nombre).indexOf(norm(i.lote)) >= 0); })
        .map(function (e) { return { e: e, c: cps.find(function (x) { return String(x.id) === String(e.campoId); }), cam: cams.find(function (x) { return String(x.equipoId) === String(e.id) && x.estado === 'Activa'; }) }; });
      if (!i.campo && !i.lote) lista = lista.filter(function (x) { return x.cam; });   // sin filtro: solo los lotes en campaña
      if (!lista.length) return { error: (i.lote || i.campo) ? 'No encontré ese lote o pivot.' : 'Ningún lote tiene una campaña activa.', lotes: propios('equipos').map(function (e) { var c = cps.find(function (x) { return String(x.id) === String(e.campoId); }); return (c ? c.nombre + ' · ' : '') + e.nombre; }) };
      var omitidos = lista.length > 8 ? lista.length - 8 : 0; lista = lista.slice(0, 8);
      var hoyK = B.hoyLocal(), climas = {};
      function clima(c) {
        if (!climas[c.id]) climas[c.id] = K.obtenerClima({ lat: c.latitud, lon: c.longitud, daily: 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,precipitation_probability_max', pastDays: 92, forecastDays: 7, cacheKey: 'campo:' + c.id });
        return climas[c.id];
      }
      function uno(x) {
        var e = x.e, c = x.c, cam = x.cam, cu = cam && cam.cultivos && cam.cultivos[0];
        var base = { campo: c ? c.nombre : null, lote: e.nombre, tipo: B.esSecano(e) ? 'secano' : (e.tipo || 'pivote'), campana: cam ? cam.nombre : null, cultivo: cu ? cu.cultivo : null, variedad: cu ? (cu.variedad || null) : null, siembra: cu ? (cu.fechaSiembra || null) : null };
        var mios = evs.filter(function (v) { return String(v.equipoId) === String(e.id) && (v.tipo === 'riego' || v.tipo === 'lluvia'); }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
        var ur = mios.filter(function (v) { return v.tipo === 'riego'; })[0], ul = mios.filter(function (v) { return v.tipo === 'lluvia'; })[0];
        base.ultimo_riego_cargado = ur ? { fecha: B.claveDia(ur.fecha), mm: num(ur.cantidad) } : null;
        base.ultima_lluvia_cargada = ul ? { fecha: B.claveDia(ul.fecha), mm: num(ul.cantidad) } : null;
        if (!c || num(c.latitud) == null || num(c.longitud) == null) return Object.assign(base, { error: 'El campo no tiene coordenada: no se puede traer el clima.' });
        return clima(c).then(function (rc) {
          if (!rc || !rc.datos) return Object.assign(base, { error: 'No se pudo traer el clima (' + ((rc && rc.error && rc.error.tipo) || 'sin datos') + ').' });
          var d = rc.datos.daily, ks = d.time.map(B.claveDia), ih = ks.indexOf(hoyK); if (ih < 0) ih = 0;
          var pron = [];
          for (var j = ih; j < ks.length && j < ih + 7; j++) pron.push({ fecha: ks[j], lluvia_mm: r1(d.precipitation_sum[j] || 0), prob_lluvia_pct: d.precipitation_probability_max ? d.precipitation_probability_max[j] : null, t_max: r0(d.temperature_2m_max && d.temperature_2m_max[j]), t_min: r0(d.temperature_2m_min && d.temperature_2m_min[j]), eto_mm: r1(d.et0_fao_evapotranspiration && d.et0_fao_evapotranspiration[j]) });
          base.pronostico_7_dias = pron;
          base.lluvia_ultimos_7_dias_mm = r0(ks.reduce(function (s, k, j) { return s + (j < ih && j >= ih - 7 ? (d.precipitation_sum[j] || 0) : 0); }, 0));
          if (rc.desactualizado) base.aviso = 'Sin conexión al clima: datos guardados del ' + (rc.fechaCache || 'último día disponible') + '.';
          if (base.tipo === 'secano') return Object.assign(base, { recomendacion: 'Lote de secano: no se riega; el agua es la que llueve.' });
          if (!cu) return Object.assign(base, { recomendacion: 'Sin campaña activa en este lote: no hay cultivo para calcular el balance.' });
          var kcDef = B.obtenerCultivoKc(cu.cultivo);
          var r = B.simular({ campo: c, daily: d, eventos: evs, equipoId: e.id, equipo: e, kcDef: kcDef, fechaSiembra: cu.fechaSiembra, diasFuturo: 4, asumirRiegoRecomendado: false });
          var U = r.umbrales || B.UMBRALES, p = FA ? FA.proximoRiego(r, e) : { titulo: r.recomendacion.regar ? 'Regar hoy: ' + r.recomendacion.mm + ' mm' : 'Sin riego hoy', detalle: '' };
          var tp = r.totalesPasado || {}, ult7 = (r.pasado || []).slice(-7);
          return Object.assign(base, {
            recomendacion: p.titulo, detalle: p.detalle || null,
            agua_util_hoy_pct: r0(r.porcentajeHoy), regar_por_debajo_de_pct: U.CRITICO, estres_por_debajo_de_pct: U.URGENTE,
            agua_disponible_mm: r0(r.aguaDisponibleHoy), reserva_total_raiz_mm: r0(r.tawHoy), falta_para_capacidad_campo_mm: r0(r.deficitHastaCC),
            lamina_sugerida_hoy_mm: r.recomendacion.mm || 0, eficiencia_riego: r.eficiencia,
            dias_desde_siembra: r.etapaHoy.dds, etapa: r.etapaHoy.nombre || null, etapa_critica: !!r.etapaHoy.critica, raiz_cm: r.etapaHoy.zr ? Math.round(r.etapaHoy.zr * 100) : null, kc_hoy: r.etapaHoy.kc,
            consumo_cultivo_ultimos_7_dias_mm: r0(ult7.reduce(function (s, v) { return s + (v.etcDia || 0); }, 0)), riego_cargado_ultimos_7_dias_mm: r0(ult7.reduce(function (s, v) { return s + (v.riegoBruto || 0); }, 0)),
            desde_siembra: { lluvia_mm: r0(tp.lluviaBruta), riego_bruto_mm: r0(tp.riegoBruto), consumo_etc_mm: r0(tp.etc), dias_con_estres: tp.diasEstres || 0 },
            proximos_dias: (r.dias || []).map(function (v) { return { fecha: B.claveDia(v.fecha), agua_util_pct: r0(v.porcentajeAAU), lluvia_mm: r1(v.lluviaBruta), estado: v.estado, lamina_si_toca_mm: v.mmRegar || 0 }; }),
            humedad_medida_con: r.sonda && r.sonda.antiguedadDias <= 2 ? 'sonda de humedad' : (r.fuentes && r.fuentes.estacion ? 'balance con la estación del campo' : 'balance FAO-56 con clima estimado (lluvia CHIRPS corregida, pronóstico Open-Meteo)'),
            suelo: r.suelo && r.suelo.origen, sin_cultivo_en_tabla_fao: !kcDef
          });
        }, function (er) { return Object.assign(base, { error: String((er && er.message) || er) }); });
      }
      return Promise.all(lista.map(function (x) { try { return Promise.resolve(uno(x)); } catch (er) { return Promise.resolve({ lote: x.e.nombre, error: String(er.message || er) }); } })).then(function (lotes) {
        return { hoy: hoyK, lotes: lotes, lotes_no_mostrados: omitidos || undefined,
          fuente: 'ficha de agua de SAFIA: balance diario FAO-56 desde la siembra con los riegos y lluvias cargados, lluvia pasada CHIRPS (o estación/manual) y pronóstico Open-Meteo; el mismo cálculo que ve el Operador',
          importante: 'La humedad es calculada, no medida (salvo sonda). Si no se cargaron los riegos hechos, el suelo aparece más seco de lo real.' };
      });
    },
    como_va_campana: function (i) {
      // "¿Cómo viene mi cosecha?": junta lo que el Banco muestra en varias pestañas, con los mismos motores
      // (meta viva, agua por etapa FAO-56/FAO-33, vigor satelital, foliar, insumos y balance de nutrientes, campañas anteriores del lote, mejor de la zona)
      var campo = i.campo ? campoPorNombre(i.campo) : null;
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: propios('campos').map(function (c) { return c.nombre; }) };
      var cps = propios('campos'), lista = [];
      propios('campanas').forEach(function (cam) {
        if (cam.estado !== 'Activa') return;
        var e = propios('equipos').find(function (x) { return String(x.id) === String(cam.equipoId); }); if (!e) return;
        var c = cps.find(function (x) { return String(x.id) === String(e.campoId); });
        if (campo && (!c || String(c.id) !== String(campo.id))) return;
        if (i.lote && norm(e.nombre).indexOf(norm(i.lote)) < 0) return;
        (cam.cultivos || []).forEach(function (cu, idx) { if (cu && cu.cultivo && !num(cu.rendimientoReal)) lista.push({ e: e, c: c, cam: cam, cu: cu, idx: idx }); });
      });
      if (!lista.length) return { error: 'No hay campañas activas' + (campo ? ' en ' + campo.nombre : '') + (i.lote ? ' para ese lote' : '') + '.' };
      var omitidos = lista.length > 4 ? lista.length - 4 : 0; lista = lista.slice(0, 4);
      var hoyK = window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10);
      var out = [];
      return lista.reduce(function (p, x) { return p.then(function () { return campanaEnCurso(x, hoyK).then(function (r) { out.push(r); }, function (er) { out.push({ lote: x.e.nombre, error: String((er && er.message) || er) }); }); }); }, Promise.resolve())
        .then(function () {
          return { hoy: hoyK, campanas: out, no_mostradas: omitidos || undefined,
            fuentes: 'meta viva y plan de la meta (Motor 8, Banco → Meta de rinde); agua por etapa: balance diario FAO-56 + rinde relativo FAO-33 (Doorenbos & Kassam, Ky por etapa), lluvia CHIRPS corregida o la cargada; vigor: NDVI Sentinel-2 (Copernicus); hoja: rangos Embrapa/Fertilizar; exportación de nutrientes IPNI/INTA; campañas cosechadas reales del banco',
            importante: 'Todo es orientativo y depende de lo cargado: lo que no está cargado (insumos, riegos, lluvias, análisis) SAFIA no lo sabe, y "no cargado" no es "no hecho".' };
        });
    },
    mis_campos: function () {
      var cl = propios('clientes'), cs = casos(), an = propios('analisis_suelo'), eqs = propios('equipos'), cams = propios('campanas');
      return { campos: propios('campos').map(function (c) {
        var cli = cl.find(function (x) { return String(x.id) === String(c.clienteId); });
        return { campo: c.nombre, cliente: cli ? cli.nombre : null, localidad: c.localidad || null, departamento: c.departamento || null, region: C() ? C().regionNombre(C().region({ departamento: c.departamento, pais: c.pais, lat: num(c.latitud), lon: num(c.longitud) })) : null,
          superficie_ha: num(c.superficie), coordenada: c.latitud && c.longitud ? c.latitud + ', ' + c.longitud : null, tiene_analisis_suelo: an.some(function (a) { return String(a.campoId) === String(c.id); }),
          campanas_cosechadas: cs.filter(function (x) { return String(x.campoId) === String(c.id); }).length, es_proyecto: !!c.proyecto,
          lotes: eqs.filter(function (e) { return String(e.campoId) === String(c.id); }).map(function (e) { var k = cams.find(function (x) { return String(x.equipoId) === String(e.id) && x.estado === 'Activa'; }), cu = k && k.cultivos && k.cultivos[0]; return { lote: e.nombre, tipo: e.tipo === 'secano' ? 'secano' : (e.tipo || 'pivote'), campana_activa: k ? [k.nombre, cu && cu.cultivo, cu && cu.variedad, cu && cu.fechaSiembra ? 'siembra ' + cu.fechaSiembra : null].filter(Boolean).join(' · ') : null }; }) };
      }) };
    }
  };
  function ejecutar(nombre, entrada) {
    try {
      var f = HERR[nombre]; if (!f) return Promise.resolve({ error: 'Herramienta desconocida: ' + nombre });
      return Promise.resolve(f(entrada || {})).catch(function (e) { return { error: String((e && e.message) || e) }; });
    } catch (e) { return Promise.resolve({ error: String((e && e.message) || e) }); }
  }

  /* ---------- conversación ---------- */
  var conv = [], ocupado = false;
  function contexto() {
    var u = (window.SafiaSync && SafiaSync.usuario && SafiaSync.usuario()) || {};
    var hoy = new Date();
    return '[Contexto de SAFIA · fecha ' + hoy.toISOString().slice(0, 10) + ' · usuario ' + (u.nombre || '—') + ' (rol ' + (u.rol || '—') + ') · ' + propios('campos').length + ' campo(s) propio(s) · ' + casos().length + ' caso(s) en el banco visibles para este usuario]';
  }
  function llamar() {
    if (!window.safiaSupabase) return Promise.reject(new Error('Sin conexión a SAFIA: iniciá sesión'));
    return window.safiaSupabase.functions.invoke('safia-asistente', { body: { messages: conv } }).then(function (r) {
      if (r.error) {
        var ctx = r.error.context;
        if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { throw new Error((j && j.error) || r.error.message); }, function () { throw new Error(r.error.message); });
        throw new Error(r.error.message || 'Error del asistente');
      }
      if (r.data && r.data.error) throw new Error(r.data.error);
      return r.data;
    });
  }
  var NOMBRES = { buscar_casos: 'Buscando casos en el banco', resumen_casos: 'Comparando casos del banco', referencia_zona: 'Leyendo la referencia de la zona', info_material: 'Buscando la ficha del material', clima_y_riego: 'Calculando clima y riego (unos segundos)', agua_hoy: 'Mirando el agua del suelo y el pronóstico', como_va_campana: 'Revisando la campaña: meta, agua, satélite, hoja e insumos', interpretar_suelo: 'Interpretando el suelo', mis_campos: 'Revisando tus campos' };
  function preguntar(texto, al) {
    if (ocupado || !texto.trim()) return Promise.resolve();
    ocupado = true;
    var fin = function (r) { ocupado = false; al.fin(r); };   // libre apenas responde
    var primero = !conv.length;
    conv.push({ role: 'user', content: [{ type: 'text', text: (primero ? contexto() + '\n\n' : '') + texto.trim() }] });
    al.inicio(texto.trim());
    var vueltas = 0;
    var paso = function () {
      if (++vueltas > 12) { fin({ texto: 'La consulta necesitó demasiados pasos. Probá con una pregunta más concreta.' }); return; }
      return llamar().then(function (r) {
        conv.push({ role: 'assistant', content: r.content });
        var usos = (r.content || []).filter(function (b) { return b.type === 'tool_use'; });
        if (r.stop_reason === 'tool_use' && usos.length) {
          usos.forEach(function (u) { al.paso(NOMBRES[u.name] || u.name, u.input); });
          return Promise.all(usos.map(function (u) { return ejecutar(u.name, u.input).then(function (res) { return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(res), is_error: !!(res && res.error) }; }); }))
            .then(function (resultados) { conv.push({ role: 'user', content: resultados }); return paso(); });
        }
        if (r.stop_reason === 'pause_turn') return paso();
        var texto = (r.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n\n');
        if (r.stop_reason === 'refusal') texto = texto || 'El asistente no pudo responder esta consulta. Probá reformularla.';
        if (r.stop_reason === 'max_tokens') texto += '\n\n_(La respuesta quedó cortada por largo: pedí la parte que falta.)_';
        fin({ texto: texto || '(sin respuesta)' });
      });
    };
    return Promise.resolve().then(paso).catch(function (e) {
      // la pregunta que falló no queda en la conversación (se puede volver a hacer)
      while (conv.length && conv[conv.length - 1].role !== 'user') conv.pop();
      if (conv.length && conv[conv.length - 1].role === 'user') conv.pop();
      fin({ error: String((e && e.message) || e) });
    });
  }
  function nueva() { conv = []; }

  /* ---------- texto con formato simple (negritas, listas, tablas) ---------- */
  function md(t) {
    var lineas = String(t || '').split('\n'), out = [], i = 0;
    var inline = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/_(.+?)_/g, '<i>$1</i>'); };
    while (i < lineas.length) {
      var l = lineas[i];
      if (/^\s*\|/.test(l)) {
        var filas = []; while (i < lineas.length && /^\s*\|/.test(lineas[i])) { filas.push(lineas[i]); i++; }
        var celdas = function (f) { return f.trim().replace(/^\||\|$/g, '').split('|').map(function (x) { return x.trim(); }); };
        var cuerpo = filas.filter(function (f) { return !/^[\s|:-]+$/.test(f); });   // sin la línea separadora |---|---|
        if (cuerpo.length) out.push('<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr>' + celdas(cuerpo[0]).map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + cuerpo.slice(1).map(function (f) { return '<tr>' + celdas(f).map(function (c) { return '<td style="white-space:normal;">' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>');
        continue;
      }
      if (/^\s*#{1,4}\s/.test(l)) { out.push('<div style="font-weight:700;margin:10px 0 4px;">' + inline(l.replace(/^\s*#{1,4}\s/, '')) + '</div>'); i++; continue; }
      if (/^\s*([-*]|\d+[.)])\s/.test(l)) {
        var ord = /^\s*\d/.test(l), items = [];
        while (i < lineas.length && /^\s*([-*]|\d+[.)])\s/.test(lineas[i])) { items.push('<li>' + inline(lineas[i].replace(/^\s*([-*]|\d+[.)])\s/, '')) + '</li>'); i++; }
        out.push((ord ? '<ol' : '<ul') + ' style="margin:4px 0 8px 20px;">' + items.join('') + (ord ? '</ol>' : '</ul>'));
        continue;
      }
      if (!l.trim()) { i++; continue; }
      var par = []; while (i < lineas.length && lineas[i].trim() && !/^\s*(\||#{1,4}\s|[-*]\s|\d+[.)]\s)/.test(lineas[i])) { par.push(lineas[i]); i++; }
      out.push('<p style="margin:0 0 8px;">' + inline(par.join(' ')) + '</p>');
    }
    return out.join('');
  }

  /* ---------- pantalla ---------- */
  var SUGERENCIAS = ['¿Cómo viene mi cosecha?', '¿Tengo que regar hoy? ¿Viene lluvia?', '¿Qué variedad de soja rindió más con riego en la Región Oriental?', '¿Con cuántos mm de agua se hizo el mejor maíz del banco?', '¿Qué le falta al suelo de mi campo para llegar a 5.000 kg de soja?', '¿Cuánto riego lleva la soja en Mariscal Estigarribia y cuánto rinde en secano?', '¿Cuánto rinden la soja y el maíz con riego y en secano en Boquerón según la referencia?'];
  function montar(el) {
    if (!el) return;
    el.innerHTML = '<div id="asHist" style="display:flex;flex-direction:column;gap:12px;"></div>' +
      '<div id="asSug" style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;">' + SUGERENCIAS.map(function (s) { return '<button type="button" class="btn" data-sug style="font-size:12.5px;white-space:normal;text-align:left;">' + esc(s) + '</button>'; }).join('') + '</div>' +
      '<form id="asForm" style="display:flex;gap:8px;align-items:flex-end;margin-top:6px;"><textarea id="asTexto" rows="2" placeholder="Preguntale a SAFIA sobre tus campos, rindes, suelos, variedades, clima o riego…" style="flex:1;font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--bd);border-radius:10px;resize:vertical;"></textarea>' +
      '<button class="btn green" type="submit" id="asEnviar">Preguntar</button><button class="btn" type="button" id="asNueva" title="Empezar una conversación nueva">Nueva</button></form>' +
      '<div class="muted" style="font-size:11px;margin-top:6px;">SAFIA responde con los datos del banco (casos reales, referencia de la zona, clima y motor agronómico) que vos podés ver. Compara e interpreta; la prescripción la decide el ingeniero agrónomo.</div>';
    var hist = el.querySelector('#asHist'), txt = el.querySelector('#asTexto'), btn = el.querySelector('#asEnviar');
    var burbuja = function (html, yo) { var d = document.createElement('div'); d.style.cssText = 'max-width:900px;padding:12px 14px;border-radius:12px;line-height:1.55;font-size:14px;' + (yo ? 'align-self:flex-end;background:#E9F6EC;border:1px solid #CDE9D3;' : 'align-self:stretch;background:#fff;border:1px solid var(--bd);'); d.innerHTML = html; hist.appendChild(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' }); return d; };
    var actual = null;
    var al = {
      inicio: function (t) { el.querySelector('#asSug').style.display = 'none'; burbuja(esc(t), true); actual = burbuja('<div class="as-pasos muted" style="font-size:12px;">Pensando…</div><div class="as-resp"></div>'); btn.disabled = true; btn.textContent = 'Pensando…'; },
      paso: function (n, input) { var p = actual.querySelector('.as-pasos'); if (p.textContent === 'Pensando…') p.textContent = ''; var filtros = input ? Object.keys(input).filter(function (k) { return input[k] !== '' && input[k] != null && typeof input[k] !== 'object'; }).map(function (k) { return input[k]; }).join(' · ') : ''; p.insertAdjacentHTML('beforeend', '<div>• ' + esc(n) + (filtros ? ' <span style="opacity:.8">(' + esc(filtros) + ')</span>' : '') + '</div>'); },
      fin: function (r) {
        var p = actual.querySelector('.as-pasos'); if (p.textContent === 'Pensando…') p.remove(); else p.style.marginBottom = '8px';
        actual.querySelector('.as-resp').innerHTML = r.error ? '<div class="note warn" style="margin:0;">' + esc(r.error) + '</div>' : md(r.texto);
        if (window.SafiaIconos && SafiaIconos.procesar) try { SafiaIconos.procesar(actual); } catch (e) {}
        btn.disabled = false; btn.textContent = 'Preguntar'; actual.scrollIntoView({ block: 'start', behavior: 'smooth' }); txt.focus();
      }
    };
    var enviar = function () { var t = txt.value; if (!t.trim()) return; txt.value = ''; preguntar(t, al); };
    el.querySelector('#asForm').addEventListener('submit', function (e) { e.preventDefault(); enviar(); });
    txt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } });
    el.querySelectorAll('[data-sug]').forEach(function (b) { b.addEventListener('click', function () { txt.value = b.textContent; enviar(); }); });
    el.querySelector('#asNueva').addEventListener('click', function () { nueva(); hist.innerHTML = ''; el.querySelector('#asSug').style.display = 'flex'; txt.focus(); });
    // asistente.html?q=... abre con la pregunta ya hecha (para enlazarla desde otras pantallas)
    try { var q = new URLSearchParams(location.search).get('q'); if (q && q.trim()) { history.replaceState(null, '', location.pathname); txt.value = q.slice(0, 500); setTimeout(enviar, 400); } } catch (e) {}
  }

  window.SafiaAsistente = { montar: montar, preguntar: preguntar, nueva: nueva, ejecutar: ejecutar, md: md };
})();
