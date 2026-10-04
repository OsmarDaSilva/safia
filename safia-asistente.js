/* SAFIA — Asistente agronómico (el "agrónomo inteligente")
   -------------------------------------------------------------------
   Chat que responde con los datos reales de SAFIA. La IA vive en la función safia-asistente (servidor, con la llave);
   las HERRAMIENTAS se ejecutan acá, en el navegador, sobre los datos que este usuario ya ve con su rol (un cliente: lo
   suyo y los lotes de la zona sin nombres). Así los números los calcula SAFIA, no la IA, y nadie ve lo que no debe.
   Herramientas: buscar_casos, resumen_casos, referencia_zona, info_material, clima_y_riego, agua_hoy, como_va_campana, interpretar_suelo, mis_campos,
   mi_lote, mantenimiento, riegos_y_lluvias, historial_suelo, comparar_con_lider, agua_de_riego, plan_rotacion, energia_y_agua, parte_seguimiento.
   Uso: SafiaAsistente.montar(elemento). */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function r0(v) { return v == null || isNaN(v) ? null : Math.round(v); }
  function r1(v) { return v == null || isNaN(v) ? null : Math.round(v * 10) / 10; }
  function propios(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return conSuscripcion(k, Array.isArray(l) ? l : []); } catch (e) { return []; } }
  // Suscripción por pivot: el asistente analiza solo los pivots vigentes (los vencidos se ven en sus pantallas, pero no se analizan)
  function conSuscripcion(k, l) {
    var S = window.SafiaSuscripcion; if (!S || !S.activa() || S.soyIrrigar()) return l;
    if (k === 'equipos') return l.filter(function (e) { return S.estado(e.id).vigente; });
    if (k === 'campos') return l.filter(function (c) { return S.campoVigente(c.id); });
    if (k === 'campanas' || k === 'eventos' || k === 'analisis_foliar' || k === 'planes_rotacion') return l.filter(function (r) { return r.equipoId == null || r.equipoId === '' || S.estado(r.equipoId).vigente; });
    if (k === 'analisis_suelo' || k === 'analisis_agua') return l.filter(function (r) { return r.equipoId != null && r.equipoId !== '' ? S.estado(r.equipoId).vigente : S.campoVigente(r.campoId); });
    return l;
  }
  function pivotsVencidos() { var S = window.SafiaSuscripcion; if (!S || !S.activa() || S.soyIrrigar()) return []; try { return (JSON.parse(localStorage.getItem('equipos') || '[]') || []).filter(function (e) { return !S.estado(e.id).vigente; }).map(function (e) { return e.nombre; }); } catch (e) { return []; } }
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
      if (f.hasta_anio && (anio(c) || 9999) > f.hasta_anio) return false;
      if (f.anio && anio(c) !== f.anio) return false;
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
  // El usuario nombra el campo por su nombre O por el del cliente ("Ganadera Angelita" es el cliente; su campo es "Estancia Primavera")
  var DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function diaSemana(f) { var d = new Date(String(f).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? null : DIAS_SEM[d.getDay()]; }
  function nombreClienteDe(c) { var cl = propios('clientes').find(function (x) { return String(x.id) === String(c.clienteId); }); return cl ? (cl.nombre || cl.razonSocial || '') : ''; }
  function camposPorNombre(nombre) {
    var cs = propios('campos'); if (!nombre) return [];
    var n = norm(nombre), toca = function (t) { t = norm(t); return !!t && (t.indexOf(n) >= 0 || n.indexOf(t) >= 0); };
    var exacto = cs.filter(function (c) { return norm(c.nombre) === n; }); if (exacto.length) return exacto;
    var porCampo = cs.filter(function (c) { return toca(c.nombre); }); if (porCampo.length) return porCampo;
    return cs.filter(function (c) { return toca(nombreClienteDe(c)); });
  }
  function campoPorNombre(nombre) { return camposPorNombre(nombre)[0] || null; }
  function listaCampos() { return propios('campos').map(function (c) { var cl = nombreClienteDe(c); return c.nombre + (cl ? ' (cliente ' + cl + ')' : ''); }); }
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
          hoy: res.hoy ? { agua_disponible_mm: r0(res.hoy.disponible), capacidad_mm: r0(res.hoy.taw), puede_gastar_antes_de_arrancar_el_pivot_mm: res.hoy.faltaParaRecarga, puede_gastar_antes_del_estres_mm: res.hoy.faltaParaEstres, vuelta_del_pivot_dias: res.hoy.vueltaDias, en_estres: res.hoy.ks < 1 } : null,
          proximos_7_dias: res.pronostico ? { lluvia_mm: res.pronostico.lluvia, demanda_mm: res.pronostico.etc, llega_al_punto_de_arranque_del_pivot: res.pronostico.cruzaRecarga } : null,
          lluvia_de: res.lluviaDeEventos ? 'lluvias cargadas del lote' : 'clima estimado (CHIRPS/Open-Meteo): el lote no tiene lluvias cargadas en la campaña',
          consumo_segun_satelite: res.satelite ? { pasadas: res.satelite.pasadas, ultima: res.satelite.ultima.fecha, cobertura_pct: res.satelite.ultima.coberturaPct, kc_satelite: res.satelite.ultima.kcSatelite, kc_curva_fao: res.satelite.ultima.kcFao } : 'curva FAO (todavía sin pasadas del satélite desde el día 20)' };
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

  // Lotes (pivots o de secano) del usuario, filtrados por campo y nombre del lote
  function esSecanoLote(e) { return window.SafiaBalance && SafiaBalance.esSecano ? !!SafiaBalance.esSecano(e) : !!(e && e.tipo === 'secano'); }
  function lotesDe(i) {
    var campo = i && i.campo ? campoPorNombre(i.campo) : null;
    if (i && i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
    var cps = propios('campos');
    var l = propios('equipos').filter(function (e) { return (!campo || String(e.campoId) === String(campo.id)) && (!i || !i.lote || norm(e.nombre).indexOf(norm(i.lote)) >= 0); })
      .map(function (e) { return { e: e, c: cps.find(function (x) { return String(x.id) === String(e.campoId); }) }; });
    if (!l.length) return { error: i && (i.lote || i.campo) ? 'No encontré ese lote o pivot.' : 'El usuario no tiene lotes cargados.', lotes: propios('equipos').map(function (e) { var c = cps.find(function (x) { return String(x.id) === String(e.campoId); }); return (c ? c.nombre + ' · ' : '') + e.nombre; }) };
    return { lista: l };
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
        if (por === 'mes_siembra') { var ms = parseInt(String(c.siembra || '').slice(5, 7), 10); return ms ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][ms - 1] : 'sin fecha'; }
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
        registro_senave: d && d.registro ? d.registro : (window.SafiaSenave ? window.SafiaSenave.buscar(i.cultivo, i.variedad) : null),
        nota: d ? (d.soloSenave ? 'No está en el catálogo verificado de SAFIA, pero sí en el Registro Nacional de Cultivares de SENAVE (Paraguay): lo inscripto es lo que figura en la ficha; el grupo de madurez no lo publica SENAVE, no inventarlo.' : 'Ficha del catálogo verificado de SAFIA (fuente en la ficha).') : 'No está en el catálogo verificado de SAFIA' + (window.SafiaSenave && window.SafiaSenave.disponible() ? ' ni en el Registro Nacional de Cultivares de SENAVE (boletín de agosto 2026)' : '') + ': no inventar sus datos.' };
    },
    clima_y_riego: function (i) {
      var P = window.SafiaClimaProyecto; if (!P) return { error: 'Módulo de clima no disponible' };
      var campo = i.campo ? campoPorNombre(i.campo) : null, lat = campo ? num(campo.latitud) : num(i.lat), lon = campo ? num(campo.longitud) : num(i.lon);
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '" entre los campos del usuario.', campos: listaCampos() };
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
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
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
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
      var cps = propios('campos'), cams = propios('campanas'), evs = propios('eventos');
      var lista = propios('equipos').filter(function (e) { return (!campo || String(e.campoId) === String(campo.id)) && (!i.lote || norm(e.nombre).indexOf(norm(i.lote)) >= 0); })
        .map(function (e) { return { e: e, c: cps.find(function (x) { return String(x.id) === String(e.campoId); }), cam: cams.find(function (x) { return String(x.equipoId) === String(e.id) && x.estado === 'Activa'; }) }; });
      if (!i.campo && !i.lote) lista = lista.filter(function (x) { return x.cam; });   // sin filtro: solo los lotes en campaña
      if (!lista.length) return { error: (i.lote || i.campo) ? 'No encontré ese lote o pivot.' : 'Ningún lote tiene una campaña activa.', lotes: propios('equipos').map(function (e) { var c = cps.find(function (x) { return String(x.id) === String(e.campoId); }); return (c ? c.nombre + ' · ' : '') + e.nombre; }) };
      var omitidos = lista.length > 8 ? lista.length - 8 : 0; lista = lista.slice(0, 8);
      var hoyK = B.hoyLocal(), climas = {};
      function clima(c) {
        if (!climas[c.id]) climas[c.id] = K.obtenerClima({ lat: c.latitud, lon: c.longitud, daily: 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,precipitation_probability_max', pastDays: B.pastDaysDesde ? B.pastDaysDesde(c.id) : 92, forecastDays: 16, cacheKey: 'campo:' + c.id });
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
        // ventana para pulverizar (pronóstico por hora, límites de Embrapa Soja): hoy y los dos días siguientes
        var pPulv = window.SafiaPulverizar ? SafiaPulverizar.ventanas(num(c.latitud), num(c.longitud)).then(function (R) { if (!R) return; var tr = function (l) { return l.map(function (x) { return x[0] + ' a ' + x[1] + ' h'; }); };
          base.ventana_para_pulverizar = { ahora: R.ahora ? { estado: R.ahora.estado === 'verde' ? 'se puede' : R.ahora.estado === 'amarillo' ? 'con cuidado' : 'no pulverizar', motivos: R.ahora.motivos, temperatura: R.ahora.temp, humedad_pct: R.ahora.hr, delta_t: R.ahora.deltaT, viento_km_h_a_2m: R.ahora.viento, rafagas_km_h_a_2m: R.ahora.rafaga } : null,
            dias: R.dias.slice(0, 3).map(function (d) { return { fecha: d.fecha, dia_de_la_semana: diaSemana(d.fecha), horas_ideales: tr(d.ideal), horas_con_cuidado: tr(d.cuidado) }; }), limites: SafiaPulverizar.FUENTE + '; entre 6,5 y 13 km/h o con ráfagas de más de 13, con cuidado (13 = máximo de la guía de EE.UU.; INTA acepta hasta 15); Delta T ideal 2 a 8, nunca más de 10 (INTA Oliveros); es pronóstico: medir en el lote antes de salir; la espera entre aplicación y lluvia la dice la etiqueta del producto' }; }).catch(function () {}) : Promise.resolve();
        return pPulv.then(function () { return clima(c); }).then(function (rc) {
          if (!rc || !rc.datos) return Object.assign(base, { error: 'No se pudo traer el clima (' + ((rc && rc.error && rc.error.tipo) || 'sin datos') + ').' });
          var d = rc.datos.daily, ks = d.time.map(B.claveDia), ih = ks.indexOf(hoyK); if (ih < 0) ih = 0;
          var pron = [];
          for (var j = ih; j < ks.length && j < ih + 7; j++) pron.push({ fecha: ks[j], dia_de_la_semana: diaSemana(ks[j]), lluvia_mm: r1(d.precipitation_sum[j] || 0), prob_lluvia_pct: d.precipitation_probability_max ? d.precipitation_probability_max[j] : null, t_max: r0(d.temperature_2m_max && d.temperature_2m_max[j]), t_min: r0(d.temperature_2m_min && d.temperature_2m_min[j]), eto_mm: r1(d.et0_fao_evapotranspiration && d.et0_fao_evapotranspiration[j]) });
          base.pronostico_7_dias = pron;
          base.lluvia_ultimos_7_dias_mm = r0(ks.reduce(function (s, k, j) { return s + (j < ih && j >= ih - 7 ? (d.precipitation_sum[j] || 0) : 0); }, 0));
          if (rc.desactualizado) base.aviso = 'Sin conexión al clima: datos guardados del ' + (rc.fechaCache || 'último día disponible') + '.';
          var sec = base.tipo === 'secano';
          if (sec && !cu) return Object.assign(base, { recomendacion: 'Lote de secano sin campaña activa: no hay cultivo para calcular el balance.' });
          if (!cu) return Object.assign(base, { recomendacion: 'Sin campaña activa en este lote: no hay cultivo para calcular el balance.' });
          var kcDef = B.obtenerCultivoKc(cu.cultivo);
          var r = B.simular({ campo: c, daily: d, eventos: evs, equipoId: e.id, equipo: e, kcDef: kcDef, fechaSiembra: cu.fechaSiembra, fechaCosecha: cu.fechaCosecha, diasFuturo: 5, asumirRiegoRecomendado: false });
          var U = r.umbrales || B.UMBRALES, p = FA ? FA.proximoRiego(r, e) : { titulo: r.recomendacion.regar ? 'Regar hoy: ' + r.recomendacion.mm + ' mm' : 'Sin riego hoy', detalle: '' };
          var tp = r.totalesPasado || {}, ult7 = (r.pasado || []).slice(-7);
          return Object.assign(base, {
            recomendacion: sec ? (r.recomendacion.enEstres ? 'Lote de secano en estrés: no se riega, depende de la lluvia.' : 'Lote de secano: no se riega; se sigue el agua del suelo y la lluvia.') : p.titulo, detalle: sec ? null : (p.detalle || null),
            agua_util_hoy_pct: r0(r.porcentajeHoy), arrancar_el_pivot_por_debajo_de_pct: sec ? null : U.CRITICO, estres_por_debajo_de_pct: U.URGENTE, en_estres_hoy: !!r.recomendacion.enEstres, esperar_la_lluvia: !sec && r.recomendacion.esperarLluvia ? { lluvia_hoy_y_manana_mm: r.recomendacion.esperarLluvia.mm, hoy_mm: r.recomendacion.esperarLluvia.mmHoy, manana_mm: r.recomendacion.esperarLluvia.mmManana, riego_que_reemplaza_mm: r.recomendacion.esperarLluvia.mmRiego, regla: 'aunque esté en estrés, si la lluvia de hoy y mañana cubre lo que había que regar (mínimo 15 mm) se espera; si mañana a la noche no llovió, se riega' } : null,
            pivot: !sec && r.recomendacion.pivot ? { arrancar_el: r.recomendacion.pivot.arrancarEl, entra_en_estres_sin_riego_el: r.recomendacion.pivot.venceEl, dias_hasta_estres: r.recomendacion.pivot.diasHastaEstres, horizonte_dias: r.recomendacion.pivot.horizonteDias,
              vuelta_dias: r.recomendacion.pivot.vueltaDias, lamina_vuelta_mm: r.recomendacion.pivot.laminaVuelta, vuelta_supuesta_sin_datos_del_equipo: r.recomendacion.pivot.vueltaSupuesta, capacidad_neta_mm_dia: r.recomendacion.pivot.capacidadNeta,
              consumo_maximo_7_dias_mm: r.recomendacion.pivot.consumoMax7, equipo_no_alcanza_la_demanda: r.recomendacion.pivot.noAlcanza,
              regla: 'se prende antes del estrés: arranque = estrés + consumo del cultivo durante la vuelta, nunca por debajo del 75 % de agua útil, y el estrés empieza en el 50 % (SDSU Extension: no pasar del 50 % de agotamiento desde floración) (la lluvia prevista no se resta del margen: ya entra en la proyección del suelo y corre la fecha de arranque; como FieldNET Advisor: Start = Due By − Refill Time)' } : null,
            agua_disponible_mm: r0(r.aguaDisponibleHoy), reserva_total_raiz_mm: r0(r.tawHoy), falta_para_capacidad_campo_mm: r0(r.deficitHastaCC),
            pastura_en_kilos: (window.SafiaForraje && window.SafiaPasturas && SafiaPasturas.esPastura(cu.cultivo)) ? (function (R) { return { factor_altura_a_kg: R.factor ? R.factor.texto : null, pasto_promedio_kg_ms_ha: R.pasto.kgHaPromedio, piquetes_medidos: R.pasto.medidos, pasto_sobre_altura_de_salida_t: R.pasto.comestibleKg != null ? Math.round(R.pasto.comestibleKg / 100) / 10 : null, dias_de_comida_para_el_lote: R.diasPasto, crecimiento_kg_ms_ha_dia: R.tasa ? R.tasa.kgDia : null, crecimiento_origen: R.tasa ? R.tasa.origen : null, carga_real_ua_ha: R.uaReal != null ? Math.round(R.uaReal * 10) / 10 : null, carga_que_aguanta_ua_ha: R.uaCapacidad != null ? Math.round(R.uaCapacidad * 10) / 10 : null, lote: R.lote, carne: R.carne.periodos && R.carne.periodos.length ? { ganancia_diaria_kg: R.carne.gmdUltimo, kg_peso_vivo_ha: R.carne.kgHa, dias: R.carne.dias, proyeccion_kg_ha_anio: R.carne.kgHaAnio, arrobas_ha_anio: R.carne.arrobasHaAnio } : 'faltan dos pesadas del lote', referencia_secano_kg_ha_anio: SafiaForraje.REF_CARNE.secanoMin + ' a ' + SafiaForraje.REF_CARNE.secanoMax + ' (Embrapa CT 138)', reglas: '1 UA = 450 kg; consumo 2,2 % del peso vivo; eficiencia de pastoreo 55 % (Embrapa Cerrados CT 101); 1 arroba = 30 kg de peso vivo. El factor de tabla es orientativo: la calibración con corte de muestra manda.' }; })(SafiaForraje.resumen(e, cu, c)) : undefined,
            lamina_sugerida_hoy_mm: sec ? null : (r.recomendacion.mm || 0), eficiencia_riego: sec ? null : r.eficiencia,
            como_regarlo: !sec && r.recomendacion.mm && B.consejoLamina ? (function (c) { return { vueltas: c.n, mm_por_vuelta: c.lamina, velocidad_pct: c.velocidadPct, horas_por_vuelta: c.horasVuelta, calor_hoy: c.calor, t_max_hoy: c.tMax, punta: c.punta ? { horario: c.punta.desde + ' a ' + c.punta.hasta + ' h', kwh_punta_veces_mas_caro: c.punta.relacion, alcanza_regando_solo_fuera_de_punta: c.punta.alcanza, capacidad_sin_punta_mm_dia: c.punta.capacidadSinPunta || null } : null, regla: c.nota }; })(B.consejoLamina(r, e, r.recomendacion.mm)) : null,
            dias_desde_siembra: r.etapaHoy.dds, etapa: r.etapaHoy.nombre || null, etapa_critica: !!r.etapaHoy.critica, raiz_cm: r.etapaHoy.zr ? Math.round(r.etapaHoy.zr * 100) : null, kc_hoy: r.etapaHoy.kc,
            consumo_cultivo_ultimos_7_dias_mm: r0(ult7.reduce(function (s, v) { return s + (v.etcDia || 0); }, 0)), riego_cargado_ultimos_7_dias_mm: r0(ult7.reduce(function (s, v) { return s + (v.riegoBruto || 0); }, 0)),
            desde_siembra: { lluvia_mm: r0(tp.lluviaBruta), riego_bruto_mm: r0(tp.riegoBruto), consumo_etc_mm: r0(tp.etc), dias_con_estres: tp.diasEstres || 0 },
            proximos_dias: (r.dias || []).map(function (v) { return sec ? { fecha: B.claveDia(v.fecha), agua_util_pct: r0(v.porcentajeAAU), lluvia_mm: r1(v.lluviaBruta) } : { fecha: B.claveDia(v.fecha), agua_util_pct: r0(v.porcentajeAAU), lluvia_mm: r1(v.lluviaBruta), estado: v.estado, lamina_si_toca_mm: v.mmRegar || 0 }; }),
            humedad_medida_con: r.sonda && r.sonda.antiguedadDias <= 2 ? 'sonda de humedad' : (r.fuentes && r.fuentes.estacion ? 'balance con la estación del campo' : 'balance FAO-56 con clima estimado (lluvia CHIRPS corregida, pronóstico Open-Meteo de 16 días)'),
            proximos_7_dias_acumulado: r.pronostico ? { consumo_cultivo_mm: r.pronostico.semana.consumoMM, lluvia_prevista_mm: r.pronostico.semana.lluviaMM, balance_mm: r.pronostico.semana.balanceMM } : null,
            pronostico_completo_acumulado: r.pronostico ? { dias: r.pronostico.total.dias, consumo_cultivo_mm: r.pronostico.total.consumoMM, lluvia_prevista_mm: r.pronostico.total.lluviaMM } : null,
            consumo_segun_satelite: r.satelite ? { ultima_pasada: r.satelite.ultima.fecha, dia_desde_siembra: r.satelite.ultima.dds, cobertura_pct: r.satelite.ultima.coberturaPct, kc_satelite: r.satelite.ultima.kcSatelite, kc_curva_fao: r.satelite.ultima.kcFao, factor_hoy: r.satelite.factorHoy, metodo: 'NDVI Sentinel-2 → cobertura → Kc (Allen et al. 2005, FAO-56 dual)' } : 'sin pasadas del satélite desde el día 20 de la siembra: se usa la curva FAO',
            suelo: r.suelo && r.suelo.origen, sin_cultivo_en_tabla_fao: !kcDef
          });
        }, function (er) { return Object.assign(base, { error: String((er && er.message) || er) }); });
      }
      var pSat = B.prepararSatelite ? Promise.resolve(B.prepararSatelite(lista.map(function (x) { return x.e; }))).catch(function () {}) : Promise.resolve();   // consumo real según el satélite
      return pSat.then(function () { return Promise.all(lista.map(function (x) { try { return Promise.resolve(uno(x)); } catch (er) { return Promise.resolve({ lote: x.e.nombre, error: String(er.message || er) }); } })); }).then(function (lotes) {
        return { hoy: hoyK, lotes: lotes, lotes_no_mostrados: omitidos || undefined,
          fuente: 'ficha de agua de SAFIA: balance diario FAO-56 desde el día de la siembra con los riegos cargados; la lluvia entra sola (estación del campo si hay, después el pluviómetro cargado y, si no, el satélite CHIRPS) y el pronóstico es de Open-Meteo; el mismo cálculo que ve el Operador',
          reglas: 'El estrés empieza en el 50 % de agua útil y el pivot se arranca desde el 75 % (más arriba si la vuelta es larga o el consumo es alto). "No regar: viene lluvia" = se esperan 15 mm o más en los próximos 5 días. "En estrés, pero viene lluvia: esperar" = el cultivo ya está en estrés, pero la lluvia de hoy y mañana cubre lo que había que regar (mínimo 15 mm); si es poca lluvia o viene más tarde, la orden sigue siendo regar ya. En secano no hay arranque: solo se avisa el estrés. Lámina mínima de día (criterio de Irrigar): de 9 a 18 h nunca menos de 10 mm por vuelta (las láminas chicas se evaporan y queman hojas); con más de 30 °C de día entre 10 y 14 mm; de noche puede ser menor. Energía: en Paraguay la ANDE tiene dos precios; el horario de punta (caro) es de lunes a sábado de 18 a 22 h y los domingos no hay punta (Resolución ANDE P/Nº 49888 de 2024): conviene no regar en esas horas salvo que el equipo no alcance la demanda del cultivo (como_regarlo.punta lo dice).',
          importante: 'La humedad es calculada, no medida (salvo sonda). Si no se cargaron los riegos hechos, el suelo aparece más seco de lo real.' };
      });
    },
    como_va_campana: function (i) {
      // "¿Cómo viene mi cosecha?": junta lo que el Banco muestra en varias pestañas, con los mismos motores
      // (meta viva, agua por etapa FAO-56/FAO-33, vigor satelital, foliar, insumos y balance de nutrientes, campañas anteriores del lote, mejor de la zona)
      var campo = i.campo ? campoPorNombre(i.campo) : null;
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
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
      var pSat = window.SafiaBalance && SafiaBalance.prepararSatelite ? Promise.resolve(SafiaBalance.prepararSatelite(lista.map(function (x) { return x.e; }))).catch(function () {}) : Promise.resolve();   // pasadas nuevas del satélite
      return lista.reduce(function (p, x) { return p.then(function () { return campanaEnCurso(x, hoyK).then(function (r) { out.push(r); }, function (er) { out.push({ lote: x.e.nombre, error: String((er && er.message) || er) }); }); }); }, pSat)
        .then(function () {
          return { hoy: hoyK, campanas: out, no_mostradas: omitidos || undefined,
            fuentes: 'meta viva y plan de la meta (Motor 8, Banco → Meta de rinde); agua por etapa: balance diario FAO-56 + rinde relativo FAO-33 (Doorenbos & Kassam, Ky por etapa), lluvia CHIRPS corregida o la cargada; vigor: NDVI Sentinel-2 (Copernicus); hoja: rangos Embrapa/Fertilizar; exportación de nutrientes IPNI/INTA; campañas cosechadas reales del banco',
            importante: 'Todo es orientativo y depende de lo cargado: lo que no está cargado (insumos, riegos, lluvias, análisis) SAFIA no lo sabe, y "no cargado" no es "no hecho".' };
        });
    },
    mi_lote: function (i) {
      // Todo de un pivot o lote del usuario: el equipo, la campaña de hoy y la historia completa (rinde, meta, agua, satélite, nutrientes)
      var ls = lotesDe(i); if (ls.error) return ls;
      var cams = propios('campanas'), cs = casos();
      puente(ls.lista[0].c);
      var serieOk = window.SafiaNDVI && SafiaNDVI.cargarDeTabla ? Promise.resolve(SafiaNDVI.cargarDeTabla()).catch(function () {}) : Promise.resolve();
      return serieOk.then(function () {
        var omit = ls.lista.length > 6 ? ls.lista.length - 6 : 0;
        return { lotes: ls.lista.slice(0, 6).map(function (x) {
          var e = x.e, c = x.c, dt = e.datosTecnicos || {}, tec = {};
          puente(c);   // el satélite y los nutrientes leen el campo por el puente del Banco
          Object.keys(dt).forEach(function (k) { var v = dt[k]; if (v !== '' && v != null && typeof v !== 'object') tec[k] = v; });
          var serie = window.SafiaNDVI && SafiaNDVI.serieDe ? (SafiaNDVI.serieDe(e.id) || []) : [], ndviCamps = window.SafiaNDVI && SafiaNDVI.campanasDelLote ? SafiaNDVI.campanasDelLote(e.id) : [];
          var historia = [];
          cams.filter(function (k) { return String(k.equipoId) === String(e.id); }).forEach(function (k) {
            (k.cultivos || []).forEach(function (cu, idx) {
              if (!cu || !cu.cultivo) return;
              var caso = cs.find(function (z) { return String(z.equipoId) === String(e.id) && z.campana === k.nombre && norm(z.cultivo) === norm(cu.cultivo); });
              var rinde = num(cu.rendimientoReal), meta = num(cu.rendimientoObj);
              var h = { campana: k.nombre || null, estado: k.estado || null, cultivo: cu.cultivo, variedad: cu.variedad || null, finalidad: cu.finalidad || null, siembra: cu.fechaSiembra || null, cosecha: cu.fechaCosecha || null,
                densidad: cu.densidad || null, cultivo_anterior: cu.cultivoAnterior || null, rinde_kg_ha: r0(rinde), meta_kg_ha: r0(meta), meta_cumplida_pct: rinde && meta ? Math.round(rinde / meta * 100) : null,
                lluvia_mm: caso ? r0(caso.lluviaMM) : null, riego_mm: caso ? r0(caso.riegoMM) : null, dias_ciclo: caso ? caso.dias : null,
                insumos_cargados: (k.insumos || []).filter(function (s) { return s.cultivoIdx == null || s.cultivoIdx === idx; }).length };
              var bal = window.SafiaNutrientes ? SafiaNutrientes.balanceCampana(k, idx) : null;
              if (bal && bal.exportado) h.nutrientes = { tipo: bal.enVivo ? 'en vivo, contra la meta' : (bal.firme ? 'firme (guardado al cosechar)' : 'calculado con el rinde real'),
                se_lleva_kg_ha: { n: r0(bal.exportado.n), p2o5: r0(bal.exportado.p2o5), k2o: r0(bal.exportado.k2o), s: r0(bal.exportado.s) },
                aplicado_kg_ha: bal.aplicado ? { n: r0(bal.aplicado.n), p2o5: r0(bal.aplicado.p2o5), k2o: r0(bal.aplicado.k2o), s: r0(bal.aplicado.s) } : null,
                saldo_kg_ha: bal.saldo ? { p2o5: r0(bal.saldo.p2o5), k2o: r0(bal.saldo.k2o), s: r0(bal.saldo.s) } : null };
              var nc = ndviCamps.find(function (z) { return z.id === String(k.id) + '_' + idx; });
              if (nc && serie.length) { var cv = SafiaNDVI.curvaDe(nc, serie); if (cv.puntos.length) h.satelite = { pasadas: cv.puntos.length, ndvi_maximo: cv.max == null ? null : Math.round(cv.max * 100) / 100, dia_del_maximo: cv.diaMax, dias_canopia_plena: cv.diasPlenos }; }
              if (cu.planMeta) h.plan_meta = { meta_kg_ha: cu.planMeta.kgHa, parte_de_kg_ha: cu.planMeta.base, potencial_kg_ha: cu.planMeta.potencial || null, items: (cu.planMeta.items || []).map(function (t) { return t.nombre + (t.hecho ? ' (hecho)' : ' (pendiente)'); }) };
              historia.push(h);
            });
          });
          historia.sort(function (a, b) { return String(b.siembra || '').localeCompare(String(a.siembra || '')); });
          var porCultivo = {};
          historia.filter(function (h) { return h.rinde_kg_ha; }).forEach(function (h) { (porCultivo[h.cultivo] = porCultivo[h.cultivo] || []).push(h.rinde_kg_ha); });
          var mant = window.SafiaMant && !esSecanoLote(e) ? SafiaMant.estado(e) : null;
          // Pastura en piquetes: estado de cada piquete (regla y satélite) y qué sectores no se riegan hoy
          var pastura = null, campPast = cams.filter(function (k) { return String(k.equipoId) === String(e.id) && k.estado === 'Activa'; }).map(function (k) { return (k.cultivos || [])[0]; }).filter(function (cu) { return cu && window.SafiaPasturas && SafiaPasturas.esPastura(cu.cultivo); })[0];
          if (campPast && window.SafiaPasturas && SafiaPasturas.estadoPiquetes) {
            var stP = SafiaPasturas.estadoPiquetes(e.id, campPast), refP = stP.ref, sat = window.SafiaPiquetes ? SafiaPiquetes.serieGuardada(e.id) : { pasadas: [] }, ultP = sat.pasadas[sat.pasadas.length - 1] || null;
            var regP = window.SafiaPiquetes ? SafiaPiquetes.regresion(SafiaPiquetes.pares(e)) : null, sinR = window.SafiaPiquetes ? SafiaPiquetes.sectoresSinRiego(e, campPast, 3) : null;
            pastura = { especie: campPast.variedad || campPast.cultivo, piquetes: (window.SafiaPiquetes && SafiaPiquetes.total && SafiaPiquetes.total(e, campPast)) || parseInt(campPast.piquetes, 10) || null, modelo_de_piquetes: (function () { var gp = window.SafiaPiquetes ? SafiaPiquetes.sectores(e, campPast) : null; return gp ? SafiaPiquetes.describir(gp) : null; })(), dias_descanso_meta: num(campPast.diasDescanso), sistema: campPast.sistemaPastoreo || null,
              meta_altura_cm: refP ? { entrada: refP.entrada, salida: refP.salida, fuente: refP.fuente } : 'sin variedad reconocida: cargar Zuri, Mombaça, Tanzania, Marandu, Xaraés… en la campaña',
              piquete_ocupado: stP.ocupado, piquetes_a_punto: stP.listos,
              piquetes_detalle: stP.piquetes.map(function (p) { var v = ultP && ultP.por[p.piquete]; return { piquete: p.piquete, estado: p.estado, altura_regla_cm: p.altura, fecha_lectura: p.fechaLectura, crecimiento_cm_dia: p.crecimiento, dias_descanso: p.diasDescanso, ndvi: v ? v.ndvi : null, altura_estimada_satelite_cm: regP && v ? regP.estimar(v.ndvi) : null }; }),
              satelite: ultP ? { fecha: ultP.fecha, pasadas_guardadas: sat.pasadas.length, calibracion_altura: regP ? { lecturas: regP.n, r2: regP.r2 } : 'todavía sin 3 lecturas de regla cerca de una pasada' } : 'sin imagen por piquete todavía',
              riego_separado_del_pastoreo: sinR && sinR.ocupado ? { no_regar_piquetes: sinR.piquetes, saltar_grados_desde_norte: sinR.texto || sinR.grados, tampoco_se_riegan_por_compartir_angulo: sinR.comparten && sinR.comparten.length ? sinR.comparten : undefined, regla: 'no regar el piquete ocupado ni los 3 siguientes (Manual Irrigar 9.1)' } : 'sin entrada de animales cargada',
              fuente: 'alturas Embrapa Gado de Corte (Régua de Manejo de Pastagens); manejo Manual de pastura irrigada Irrigar 2025; lecturas de regla y pastoreos cargados en el Operador; NDVI Sentinel-2 por porción del pivot' };
          }
          return { campo: c ? c.nombre : null, lote: e.nombre, pastura: pastura || undefined, tipo: esSecanoLote(e) ? 'secano' : (e.tipo || 'pivote'), superficie_ha: num(e.superficie), marca: e.marca || null, modelo: e.modelo || null,
            datos_tecnicos: Object.keys(tec).length ? tec : null, nota_datos_tecnicos: 'lamina100 = mm que aplica el pivot a velocidad 100 %; vuelta100 = horas por vuelta a 100 %; capacidad = mm/día que puede aplicar',
            poligono_cargado: !!(e.poligono && e.poligono.partes), horas_pivot: mant ? mant.horas : null,
            mantenimiento: mant ? (mant.sinPlan ? 'sin plan de mantenimiento cargado' : { vencidas: mant.vencidas.length, proximas: mant.proximas.length }) : null,
            campana_activa: historia.filter(function (h) { return h.estado === 'Activa' && !h.rinde_kg_ha; })[0] || null,
            campanas_anteriores: historia.filter(function (h) { return !(h.estado === 'Activa' && !h.rinde_kg_ha); }).slice(0, 12),
            rinde_por_cultivo: Object.keys(porCultivo).map(function (k) { var v = porCultivo[k]; return { cultivo: k, campanas: v.length, promedio_kg_ha: r0(v.reduce(function (s, x) { return s + x; }, 0) / v.length), mejor_kg_ha: Math.max.apply(null, v), peor_kg_ha: Math.min.apply(null, v) }; }) };
        }), lotes_no_mostrados: omit || undefined, fuente: 'campañas, equipos e insumos cargados en SAFIA; NDVI Sentinel-2; exportación de nutrientes IPNI/INTA' };
      });
    },
    mantenimiento: function (i) {
      var M = window.SafiaMant; if (!M) return { error: 'Módulo de mantenimiento no disponible' };
      var ls = lotesDe(i); if (ls.error) return ls;
      var evs = propios('eventos');
      var EST = { ok: 'al día', proximo: 'próxima', vencido: 'vencida', completar: 'falta el intervalo', gris: 'sin datos' };
      return { hoy: window.SafiaBalance ? SafiaBalance.hoyLocal() : null, equipos: ls.lista.filter(function (x) { return !esSecanoLote(x.e); }).map(function (x) {
        var s = M.estado(x.e, evs), cont = {};
        Object.keys(s.contadores || {}).forEach(function (k) { var v = s.contadores[k]; cont[(M.CONTADORES && M.CONTADORES[k]) || k] = { horas: r0(v.horas), fecha_lectura: v.fecha, lectura_propia: v.propio }; });
        var t = function (z) { return { tarea: z.tarea, componente: z.componente || null, cada: z.cadaTxt || null, estado: EST[z.estado] || z.estado, avance_pct: z.pct, cuanto_falta: z.faltaTxt, ultima_vez: z.ultFecha ? z.ultFecha + (z.ultHoras ? ' a las ' + r0(z.ultHoras) + ' h' : '') : null, detalle: z.detalle || null, fuente: z.fuente || null }; };
        var ult = evs.filter(function (v) { return String(v.equipoId) === String(x.e.id) && v.tipo === 'mantenimiento'; }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }).slice(0, 8)
          .map(function (v) { return { fecha: String(v.fecha || '').slice(0, 10), tarea: v.tarea || null, horas: num(v.horasEquipo), cargado_por: v.cargadoPor || null }; });
        return { campo: x.c ? x.c.nombre : null, equipo: x.e.nombre, marca: x.e.marca || null, horimetros: cont, plan_cargado: !s.sinPlan,
          vencidas: (s.vencidas || []).map(t), proximas: (s.proximas || []).map(t), al_dia: (s.tareas || []).filter(function (z) { return z.estado === 'ok'; }).map(function (z) { return z.tarea; }),
          falta_intervalo: (s.completar || []).map(function (z) { return z.tarea; }), ultimos_registros: ult };
      }), fuente: 'plan de mantenimiento del equipo (catálogo del fabricante: Lindsay/Valley/Zimmatic y bombas por modelo) + horímetros y tareas cargadas por el operador' };
    },
    riegos_y_lluvias: function (i) {
      // Lo cargado en el campo: riegos, lluvias del pluviómetro, aplicaciones, pastoreos, horímetros; totales por mes
      var ls = lotesDe(i); if (ls.error) return ls;
      var ids = {}; ls.lista.forEach(function (x) { ids[String(x.e.id)] = x; });
      var tipos = i.tipo && i.tipo !== 'todos' ? [i.tipo] : null;
      var hoyK = window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10);
      var desde = i.desde || null, hasta = i.hasta || hoyK;
      if (!desde) {
        // por defecto: desde la siembra de la campaña activa más vieja de los lotes elegidos; si no hay, los últimos 90 días
        var sie = propios('campanas').filter(function (k) { return ids[String(k.equipoId)] && k.estado === 'Activa'; }).map(function (k) { return k.cultivos && k.cultivos[0] && k.cultivos[0].fechaSiembra; }).filter(Boolean).sort()[0];
        desde = sie ? String(sie).slice(0, 10) : null;
      }
      if (!desde) { var d0 = new Date(hoyK + 'T12:00:00'); d0.setDate(d0.getDate() - 90); desde = d0.toISOString().slice(0, 10); }
      var evs = propios('eventos').filter(function (v) { var f = String(v.fecha || '').slice(0, 10); return ids[String(v.equipoId)] && f >= desde && f <= hasta && (!tipos || tipos.indexOf(v.tipo) >= 0); })
        .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
      var lim = Math.max(5, Math.min(60, i.limite || 30));
      // Lluvia automática por campo (clima de SAFIA, corregido con el satélite CHIRPS): la misma que usa el balance y que Eventos muestra como "Clima · automática"
      var K = window.SafiaClima, autos = {}, autosHoy = {}, quiereLluvia = !tipos || tipos.indexOf('lluvia') >= 0;
      var diasAtras = Math.min(400, Math.max(1, Math.round((new Date(hoyK + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000) + 1));
      var pedidos = [];
      if (K && quiereLluvia) ls.lista.forEach(function (x) {
        var c = x.c; if (!c || autos[c.id] !== undefined || num(c.latitud) == null || num(c.longitud) == null) return;
        autos[c.id] = null;
        pedidos.push(Promise.resolve(K.obtenerClima({ lat: num(c.latitud), lon: num(c.longitud), daily: 'precipitation_sum', pastDays: diasAtras, forecastDays: 1, cacheKey: 'lluvia-asistente:' + c.id })).then(function (rc) {
          var d = rc && rc.datos && rc.datos.daily; if (!d || !d.time) return;
          var o = {}; d.time.forEach(function (f, j) { var k = String(f).slice(0, 10), mm = d.precipitation_sum[j]; if (mm == null) return; if (k === hoyK) autosHoy[c.id] = mm; else if (k >= desde && k <= hasta && k < hoyK) o[k] = mm; });
          autos[c.id] = o;
        }, function () {}));
      });
      return Promise.all(pedidos).then(function () {
      return { desde: desde, hasta: hasta, lotes: ls.lista.map(function (x) {
        var mios = evs.filter(function (v) { return String(v.equipoId) === String(x.e.id); }), mes = {}, tot = {};
        mios.forEach(function (v) {
          var m = String(v.fecha).slice(0, 7), q = num(v.cantidad) || 0;
          if (v.tipo === 'riego' || v.tipo === 'lluvia') { mes[m] = mes[m] || { mes: m, lluvia_mm: 0, riego_mm: 0, lluvias: 0, riegos: 0 }; mes[m][v.tipo + '_mm'] += q; mes[m][v.tipo === 'riego' ? 'riegos' : 'lluvias']++; }
          tot[v.tipo] = tot[v.tipo] || { n: 0, mm: 0 }; tot[v.tipo].n++; if (v.tipo === 'riego' || v.tipo === 'lluvia') tot[v.tipo].mm += q;
        });
        var t = {}; Object.keys(tot).forEach(function (k) { t[k] = (k === 'riego' || k === 'lluvia') ? { registros: tot[k].n, total_mm: r0(tot[k].mm) } : { registros: tot[k].n }; });
        // lluvia del período: en los días con lluvia cargada manda lo cargado; en los demás, la automática (desde 1 mm, como en Eventos)
        var auto = x.c ? autos[x.c.id] : null, lluviaPeriodo = null;
        if (auto) {
          var carg = {}; mios.forEach(function (v) { if (v.tipo === 'lluvia') { var f = String(v.fecha).slice(0, 10); carg[f] = (carg[f] || 0) + (num(v.cantidad) || 0); } });
          var dias = {}, pm = {}, tp = 0, ta = 0;
          Object.keys(carg).forEach(function (f) { dias[f] = { mm: carg[f], fuente: 'pluviómetro cargado' }; });
          Object.keys(auto).forEach(function (f) { if (!dias[f] && auto[f] > 0) dias[f] = { mm: auto[f], fuente: 'automática' }; });
          Object.keys(dias).forEach(function (f) { var m = f.slice(0, 7), z = dias[f]; pm[m] = pm[m] || { mes: m, total_mm: 0, pluviometro_mm: 0, automatica_mm: 0, dias_con_lluvia: 0 }; pm[m].total_mm += z.mm; pm[m][z.fuente === 'automática' ? 'automatica_mm' : 'pluviometro_mm'] += z.mm; if (z.mm >= 1) pm[m].dias_con_lluvia++; if (z.fuente === 'automática') ta += z.mm; else tp += z.mm; });
          lluviaPeriodo = { total_mm: r0(tp + ta), del_pluviometro_cargado_mm: r0(tp), automatica_mm: r0(ta), dias_con_lluvia: Object.keys(dias).filter(function (f) { return dias[f].mm >= 1; }).length,
            pronostico_para_hoy_mm: hasta >= hoyK && x.c && autosHoy[x.c.id] != null ? r1(autosHoy[x.c.id]) : undefined,
            por_mes: Object.keys(pm).sort().map(function (k) { var z = pm[k]; return { mes: z.mes, total_mm: r0(z.total_mm), pluviometro_mm: r0(z.pluviometro_mm), automatica_mm: r0(z.automatica_mm), dias_con_lluvia: z.dias_con_lluvia }; }),
            dias_de_mas_lluvia: Object.keys(dias).sort(function (a, b) { return dias[b].mm - dias[a].mm; }).slice(0, 5).map(function (f) { return { fecha: f, mm: r1(dias[f].mm), fuente: dias[f].fuente }; }),
            como_se_arma: 'Día por día: si hay lluvia cargada del pluviómetro en este lote manda esa; si no, la automática del clima de SAFIA (satélite CHIRPS). Cuenta lo llovido hasta ayer; lo de hoy es pronóstico y va aparte (pronostico_para_hoy_mm). Día con lluvia = 1 mm o más. Es la misma lluvia que usa el balance de agua y que Eventos muestra como "Clima · automática".' };
        } else if (quiereLluvia) lluviaPeriodo = { nota: x.c && (num(x.c.latitud) == null || num(x.c.longitud) == null) ? 'El campo no tiene coordenada: no se puede traer la lluvia automática. La coordenada se carga en Campos (el dueño del campo o Irrigar).' : 'No se pudo traer la lluvia automática ahora; abajo está solo lo cargado.' };
        return { campo: x.c ? x.c.nombre : null, lote: x.e.nombre, lluvia_del_periodo: lluviaPeriodo, cargado_totales: t,
          cargado_por_mes: Object.keys(mes).sort().map(function (k) { var z = mes[k]; return { mes: z.mes, lluvia_mm: r0(z.lluvia_mm), lluvias: z.lluvias, riego_mm: r0(z.riego_mm), riegos: z.riegos }; }),
          registros: mios.slice(-lim).map(function (v) { return { fecha: String(v.fecha).slice(0, 10), tipo: v.tipo, cantidad: num(v.cantidad), unidad: v.unidad || (v.tipo === 'riego' || v.tipo === 'lluvia' ? 'mm' : null), producto: v.producto || v.tarea || null, dosis: v.dosis || null, cargado_por: v.cargadoPor || null }; }) };
      }), importante: 'Para "¿cuánto llovió?" usá lluvia_del_periodo (incluye la lluvia automática: no hace falta que nadie la cargue). cargado_totales, cargado_por_mes y registros son solo lo que se CARGÓ en SAFIA (Operador, Eventos, voz, estación): el riego que no se cargó no aparece.' };
      });
    },
    historial_suelo: function (i) {
      var A = window.SafiaAgro, campo = i.campo ? campoPorNombre(i.campo) : null;
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
      var cps = campo ? [campo] : propios('campos'), eqs = propios('equipos');
      return { campos: cps.map(function (c) {
        var l = propios('analisis_suelo').filter(function (a) { return String(a.campoId) === String(c.id); });
        var fechas = {}; l.forEach(function (a) { var f = String(a.fecha || 'sin fecha').slice(0, 10); (fechas[f] = fechas[f] || []).push(a); });
        var serie = Object.keys(fechas).sort().map(function (f) {
          var g = fechas[f], p = g.filter(function (a) { return a.esPromedio; })[0], s = p || g[0], eq = s.equipoId ? eqs.find(function (e) { return String(e.id) === String(s.equipoId); }) : null;
          var o = { fecha: f, muestras: g.length, es_promedio: !!p, lote: eq ? eq.nombre : null, ph: num(s.ph), mo: num(s.mo), p: num(s.p), k: num(s.k), ca: num(s.ca), mg: num(s.mg), al: num(s.al), cic: num(s.cic), sat_bases: num(s.satBases), arcilla: num(s.arcilla), s: num(s.s), b: num(s.b), zn: num(s.zn), cu: num(s.cu), mn: num(s.mn) };
          Object.keys(o).forEach(function (k) { if (o[k] == null) delete o[k]; });
          if (A && i.cultivo) o.lectura = A.interpretarSuelo(s, i.cultivo).filter(function (x) { return x.valor != null; }).map(function (x) { return x.n + ': ' + x.categoria; }).join(' · ');
          // variabilidad entre las muestras del mismo día (zonas del lote que piden manejo distinto)
          var ind = g.filter(function (a) { return !a.esPromedio; });
          if (ind.length >= 2) { o.rango_entre_muestras = {}; ['ph', 'mo', 'p', 'k', 'ca', 'mg', 'satBases'].forEach(function (k) { var v = ind.map(function (a) { return num(a[k]); }).filter(function (x) { return x != null; }); if (v.length >= 2) o.rango_entre_muestras[k === 'satBases' ? 'sat_bases' : k] = { min: Math.min.apply(null, v), max: Math.max.apply(null, v) }; }); }
          return o;
        });
        var cambio = null;
        if (serie.length >= 2) { var a = serie[0], b = serie[serie.length - 1]; cambio = { periodo: a.fecha + ' → ' + b.fecha }; ['ph', 'mo', 'p', 'k', 'ca', 'mg', 'cic', 'sat_bases'].forEach(function (k) { if (a[k] != null && b[k] != null) cambio[k] = { de: a[k], a: b[k], diferencia: Math.round((b[k] - a[k]) * 100) / 100 }; }); }
        return { campo: c.nombre, analisis: serie, cambio_entre_el_primero_y_el_ultimo: cambio };
      }), fuente: 'análisis de suelo cargados (Banco → Suelo); lectura con el manual RS/SC 2016 y Embrapa' };
    },
    comparar_con_lider: function (i) {
      // El suelo y el manejo del usuario contra el lote que más rindió (y el cuarto de arriba) en su localidad, departamento, región o el país.
      // Los lotes de otros productores llegan sin nombre (safia_datos_zona): acá se nombran por su lugar.
      if (!C()) return { error: 'Banco de casos no disponible' };
      var campo = i.campo ? campoPorNombre(i.campo) : propios('campos')[0];
      if (!campo) return { error: i.campo ? 'No encontré el campo "' + i.campo + '".' : 'El usuario no tiene campos.', campos: listaCampos() };
      var mio = sueloDeCampo(campo), A = window.SafiaAgro, ambito = i.ambito || 'todos';
      var eqsCampo = propios('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
      var conRiego = i.riego === 'secano' ? false : (i.riego === 'con_riego' ? true : (!eqsCampo.length || eqsCampo.some(function (e) { return !esSecanoLote(e); })));
      var reg = C().region({ departamento: campo.departamento, pais: campo.pais, lat: num(campo.latitud), lon: num(campo.longitud) });
      var grupo = i.finalidad ? GRUPO[i.finalidad] : (C().esPasto(i.cultivo) ? 'forraje' : 'comercial');
      var todos = casos().filter(function (k) {
        return mismoCultivo(k.cultivo, i.cultivo) && C().grupoFinalidad(k.cultivo, k.finalidad) === grupo && (!i.epoca || k.epoca === i.epoca) && (k.riego !== false) === conRiego
          && num(k.rindeKgHa) > 0 && (!i.anio || anio(k) === i.anio) && (!i.desde_anio || (anio(k) || 0) >= i.desde_anio);
      });
      var dentro = function (k, amb) {
        if (amb === 'localidad') return C().normLoc(k.localidad) === C().normLoc(campo.localidad);
        if (amb === 'departamento') return norm(k.departamento) === norm(campo.departamento);
        if (amb === 'region') return C().region(k) === reg;
        return norm(k.pais || 'Paraguay') === norm(campo.pais || 'Paraguay');
      };
      var PARS = ['ph', 'mo', 'p', 'k', 'ca', 'mg', 'cic', 'satBases', 'arcilla'], NOM = { satBases: 'sat_bases' };
      var sueloCorto = function (s) { if (!s) return null; var o = {}; PARS.forEach(function (p) { var v = num(s[p]); if (v != null) o[NOM[p] || p] = v; }); return Object.keys(o).length ? o : null; };
      var lectura = function (s) { return A && s ? A.interpretarSuelo(s, i.cultivo).filter(function (x) { return x.valor != null; }).map(function (x) { return x.n + ' ' + (typeof x.valor === 'number' ? Math.round(x.valor * 100) / 100 : x.valor) + ': ' + x.categoria; }).join(' · ') : null; };
      var ambitos = ambito === 'todos' ? ['localidad', 'departamento', 'region', 'pais'] : [ambito];
      var nombreAmb = { localidad: campo.localidad || '—', departamento: campo.departamento || '—', region: C().regionNombre(reg) || '—', pais: campo.pais || 'Paraguay' };
      var mios = casos().filter(function (k) { return String(k.campoId) === String(campo.id) && mismoCultivo(k.cultivo, i.cultivo) && C().grupoFinalidad(k.cultivo, k.finalidad) === grupo && num(k.rindeKgHa) > 0; }).map(function (k) { return num(k.rindeKgHa); });
      var ms = sueloCorto(mio), vistos = {};
      var fichaCaso = function (k, propio) { var ks = sueloCorto(k.suelo), npk = k.manejo && k.manejo.npk && k.manejo.npk.items ? k.manejo.npk : null; return { quien: propio ? 'tu propio lote (' + (k.equipo || campo.nombre) + ')' : 'el mejor lote de ' + (k.localidad || k.departamento || 'la zona') + ' (sin nombre: regla de SAFIA)',
        campana: k.campana || null, variedad: k.variedad || null, epoca: k.epoca, siembra: k.siembra, rinde_kg_ha: r0(k.rindeKgHa), agua_total_mm: r0(k.aguaTotalMM), riego_mm: r0(k.riegoMM), densidad: k.densidad || null, cultivo_anterior: k.cultivoAnterior || null, cobertura: k.cobertura || null, sistema_siembra: k.sistemaSiembra || null,
        fertilizacion_kg_ha: npk || 'sin insumos cargados', suelo: ks, suelo_lectura: propio ? 'es tu suelo (arriba)' : lectura(k.suelo) }; };
      var contra = function (k) { var ls = sueloCorto(k.suelo); if (!ls || !ms) return null; var d = {}; Object.keys(ms).forEach(function (p) { if (ls[p] != null) d[p] = { mio: ms[p], otro: ls[p], diferencia: Math.round((ms[p] - ls[p]) * 100) / 100 }; }); return d; };
      return { campo: campo.nombre, cultivo: i.cultivo, con_riego: conRiego, mi_suelo: ms ? Object.assign({ fecha: mio.fecha || null }, ms) : null, mi_suelo_lectura: lectura(mio),
        sin_mi_suelo: ms ? undefined : 'El campo no tiene análisis de suelo cargado: se compara solo el rinde y el manejo.',
        mi_rinde: mios.length ? { campanas: mios.length, promedio_kg_ha: r0(mios.reduce(function (s, v) { return s + v; }, 0) / mios.length), mejor_kg_ha: r0(Math.max.apply(null, mios)) } : null,
        comparaciones: ambitos.map(function (amb) {
          var l = todos.filter(function (k) { return dentro(k, amb); }).sort(function (a, b) { return b.rindeKgHa - a.rindeKgHa; });
          if (!l.length) return { ambito: amb, lugar: nombreAmb[amb], casos: 0, nota: 'No hay campañas cosechadas de ' + i.cultivo + (conRiego ? ' con riego' : ' en secano') + ' en este ámbito.' };
          var lider = l[0], esMio = String(lider.campoId) === String(campo.id), q = l.slice(0, Math.max(1, Math.ceil(l.length / 4))), conSuelo = q.filter(function (k) { return k.suelo; });
          var clave = lider.id + '|' + l.length;
          if (vistos[clave]) return { ambito: amb, lugar: nombreAmb[amb], casos: l.length, igual_que: vistos[clave] + ' (mismos casos y mismo líder)' };
          vistos[clave] = amb;
          var otro = esMio ? l.filter(function (k) { return String(k.clienteId) !== String(campo.clienteId); })[0] : null;
          var prom = {}; PARS.forEach(function (p) { var v = conSuelo.map(function (k) { return num(k.suelo[p]); }).filter(function (x) { return x != null; }); if (v.length) prom[NOM[p] || p] = Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length * 100) / 100; });
          var regL = C().region(lider), fl = fichaCaso(lider, esMio);
          if (amb === 'pais' && regL && reg && regL !== reg) fl.otra_region = 'es de la ' + C().regionNombre(regL) + ': otro clima y otro suelo, comparar con cuidado';
          return { ambito: amb, lugar: nombreAmb[amb], casos: l.length, promedio_del_ambito_kg_ha: r0(l.reduce(function (s, k) { return s + k.rindeKgHa; }, 0) / l.length),
            lider: fl, lider_es_el_usuario: esMio || undefined,
            mi_suelo_contra_el_lider: esMio ? undefined : contra(lider), sin_suelo_del_lider: !esMio && !lider.suelo ? 'El lote líder no tiene análisis de suelo cargado.' : undefined,
            mejor_de_otro_productor: otro ? Object.assign(fichaCaso(otro, false), { mi_suelo_contra_este: contra(otro) }) : undefined,
            cuarto_de_arriba: { casos: q.length, con_suelo: conSuelo.length, rinde_promedio_kg_ha: r0(q.reduce(function (s, k) { return s + k.rindeKgHa; }, 0) / q.length), suelo_promedio: Object.keys(prom).length ? prom : null,
              variedades: Array.from(new Set(q.map(function (k) { return k.variedad; }).filter(Boolean))).slice(0, 8) } };
        }),
        fuente: 'campañas cosechadas reales del banco de SAFIA (los lotes de otros productores sin nombre) y sus análisis de suelo; lectura con el manual RS/SC 2016 y Embrapa',
        importante: 'El fósforo se compara dentro de la misma clase de arcilla (en suelos arcillosos el mismo P vale más). Un suelo mejor no explica todo el rinde: también cuentan variedad, fecha de siembra, agua y manejo.' };
    },
    agua_de_riego: function (i) {
      // Calidad del agua de riego: el mismo motor del Banco → Análisis de agua (FAO 29, USDA Manual 60)
      var Q = window.SafiaCalidadAgua; if (!Q) return { error: 'Módulo de análisis de agua no disponible en esta página' };
      var campo = i.campo ? campoPorNombre(i.campo) : null;
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
      var cps = campo ? [campo] : propios('campos');
      return { campos: cps.map(function (c) {
        puente(c);
        var l = propios('analisis_agua').filter(function (a) { return String(a.campoId) === String(c.id); }).sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); });
        if (!l.length) return { campo: c.nombre, analisis_cargados: 0, nota: 'Sin análisis de agua de riego cargado. Lo cargan el dueño o el gerente en Banco → Análisis de agua (se puede subir el PDF del laboratorio).' };
        var a = l[l.length - 1], L = Q.interpretar(a, Q.opcionesDe(a)), r = L.r || {};
        return { campo: c.nombre, analisis_cargados: l.length, fechas: l.map(function (x) { return String(x.fecha || 'sin fecha').slice(0, 10); }),
          ultimo: { fecha: a.fecha ? String(a.fecha).slice(0, 10) : null, fuente_del_agua: a.fuenteNombre || a.fuente || null, laboratorio: a.laboratorio || null,
            veredicto: L.veredicto ? L.veredicto.titulo : null, detalle: L.veredicto ? L.veredicto.detalle : null,
            ce_uS_cm: r1(r.ce), ph: r1(r.ph), ras: r1(r.ras), clase_riverside: r.clase ? r.clase.txt : null, carbonato_sodio_residual_meq_l: r1(r.csr), boro_mg_l: r.boro != null ? Math.round(r.boro * 100) / 100 : null,
            lectura: (L.items || []).map(function (x) { return { parametro: x.n, valor: typeof x.valor === 'number' ? Math.round(x.valor * 100) / 100 : x.valor, unidad: x.unidad || null, estado: x.estado === 'ok' ? 'bien' : (x.estado === 'cuidado' ? 'con cuidado' : 'grave'), explicacion: x.texto, fuente: x.fuente || null }; }),
            por_cultivo: (L.cultivos || []).map(function (x) { return { cultivo: x.n, estado: x.estado === 'ok' ? 'sirve' : (x.estado === 'cuidado' ? 'sirve con manejo' : 'no sirve'), motivos: x.motivos || [] }; }),
            control_de_calidad: (L.control || []).length ? L.control : 'el análisis cierra (cationes y aniones)', evaluado_para: L.aspersion ? 'riego por aspersión (pivot)' : 'riego sin mojar la hoja' } };
      }), fuente: 'Banco → Análisis de agua de SAFIA: FAO Riego y Drenaje 29 (Ayers y Westcot 1985) y USDA Handbook 60 (diagrama Riverside)' };
    },
    parte_seguimiento: function (i) {
      // El parte de seguimiento (pantalla Seguimiento): luces por pivot, orden de riego, agua de la campaña, paradas del equipo y lo que falta cargar
      var P = window.SafiaParte; if (!P) return { error: 'Módulo de seguimiento no disponible en esta página' };
      var L = lotesDe(i); if (L.error) return L;
      var camps = propios('campanas'), TXT = { verde: 'bien', ambar: 'atención', rojo: 'urgente', gris: 'sin datos' }, fd = function (f) { return f ? String(f).slice(0, 10) : null; };
      var parada = function (q) { return { desde: fd(q.fecha), hasta: q.hasta ? fd(q.hasta) : 'sigue parado', motivo: P.motivoTxt(q), cerrada_sola_al_volver_a_regar: !!q.cerradaPorRiego, pidio_asistencia_a_irrigar: !!q.asistencia, nota: q.observaciones || undefined }; };
      var todos = L.lista.filter(function (x) { return x.c && !x.e.zona; }), lista = todos.slice(0, 8), salida = [], p = Promise.resolve();
      lista.forEach(function (x) {
        var cam = camps.find(function (k) { return String(k.equipoId) === String(x.e.id) && k.estado === 'Activa' && k.cultivos && k.cultivos[0]; }) || null;
        p = p.then(function () { return P.armar({ e: x.e, c: x.c, cam: cam, cu: cam ? cam.cultivos[0] : null }); }).then(function (D) {
          var o = { campo: x.c.nombre, cliente: nombreClienteDe(x.c) || undefined, lote: x.e.nombre };
          var abierta = P.paradaAbierta(x.e.id);
          if (D.sinCampana) { o.estado = 'sin campaña activa'; o.parado_ahora = abierta ? parada(abierta) : null; salida.push(o); return; }
          o.cultivo = cam.cultivos[0].cultivo; o.dias_desde_siembra = D.dds; o.es_pastura = D.pastura || undefined; o.secano = D.secano || undefined;
          if (D.luces) o.luces = { meta: TXT[D.luces.meta], agua: TXT[D.luces.agua], equipo: TXT[D.luces.equipo], datos: TXT[D.luces.datos] };
          if (D.prox) o.riego_hoy = { orden: D.prox.titulo, detalle: D.prox.detalle };
          if (D.agua) o.agua_de_la_campana = { riego_mm: D.agua.riego, lluvia_mm: D.agua.lluvia, dias_con_estres: D.agua.diasEstres, rinde_perdido_por_agua_pct: D.agua.perdidaPct, etapa: D.agua.etapa || undefined,
            episodios_de_estres: (D.agua.episodios || []).map(function (ep) { var cr = P.cruzar(ep, D.paradas || [], D.hoy); return { desde: ep.desde, hasta: ep.hasta, dias: ep.dias, etapa: ep.etapa, explicado_por_parada_del_pivot: cr ? (cr.cubre >= 0.6 ? 'sí, coincide con una parada' : 'solo en parte (' + Math.round(cr.cubre * 100) + ' % de los días)') : 'no: no hay parada cargada en esos días' }; }) };
          if (!D.secano) o.equipo = { parado_ahora: abierta ? parada(abierta) : null, paradas_de_la_campana: (D.paradas || []).map(parada),
            mantenimiento: D.mant ? (D.mant.sinPlan ? 'sin plan cargado' : { tareas_vencidas: D.mant.vencidas.length, tareas_proximas: D.mant.proximas.length }) : undefined };
          if (D.forraje && D.forraje.uaReal != null) o.pastura = { carga_real_UA: D.forraje.uaReal, capacidad_UA: D.forraje.uaCapacidad };
          o.falta_cargar = D.falta && D.falta.length ? D.falta : 'nada';
          if (D.errores && D.errores.length) o.no_se_pudo_calcular = D.errores;
          salida.push(o);
        }, function (er) { salida.push({ campo: x.c.nombre, lote: x.e.nombre, error: String(er && er.message || er).slice(0, 120) }); });
      });
      return p.then(function () { return { pivots: salida, lotes_no_revisados: todos.length > lista.length ? todos.slice(lista.length).map(function (x) { return x.c.nombre + ' · ' + x.e.nombre; }) : undefined,
        soporte_whatsapp_cargado: !!(window.SafiaAsistencia && SafiaAsistencia.numero()),
        fuente: 'Pantalla Seguimiento de SAFIA (el parte): junta la ficha de agua del Operador, el balance de agua por etapa, la meta viva, el mantenimiento y las paradas del pivot',
        reglas: 'Luces: meta, agua, equipo y datos (bien, atención, urgente o sin datos). Una parada sin fecha de fin se cierra sola el día del primer riego cargado después (si se regó, el pivot anda); un riego del mismo día no la cierra. Un episodio de estrés se explica por una parada solo si la parada cubre esos días. Al marcar Pivot parado en el Operador se puede pedir asistencia técnica a Irrigar: les llega un aviso al celular a los de Irrigar y, si Irrigar cargó su número de soporte, se ofrece el WhatsApp con el mensaje ya escrito.',
        importante: 'Si nadie marcó la parada, SAFIA no puede saber que el pivot estuvo roto: el estrés figura como falta de riego. El detalle de la meta (qué se perdió y qué toca ahora) está en como_va_campana; el riego del día con el pronóstico, en agua_hoy.' }; });
    },
    energia_y_agua: function (i) {
      // Facturas de energía, reparto por pivot e informe de agua de la campaña: el mismo cálculo de Banco → Energía y agua
      var EN = window.SafiaEnergia; if (!EN) return { error: 'Módulo de energía no disponible en esta página' };
      var campo = i.campo ? campoPorNombre(i.campo) : null;
      if (i.campo && !campo) return { error: 'No encontré el campo "' + i.campo + '".', campos: listaCampos() };
      // con nombre: todos los campos de ese nombre o de ese cliente; sin nombre: primero los campos que tienen facturas cargadas
      var conFact = {}; propios('facturas_energia').forEach(function (f) { conFact[String(f.campoId)] = 1; });
      var todos = i.campo ? camposPorNombre(i.campo) : propios('campos').slice().sort(function (a, b) { return (conFact[String(b.id)] || 0) - (conFact[String(a.id)] || 0); });
      var cps = todos.slice(0, 4), salida = [], p = Promise.resolve();
      cps.forEach(function (c) { p = p.then(function () { puente(c); return EN.paraAsistente(c, i.lote); }).then(function (r) { r.cliente = nombreClienteDe(c) || null; salida.push(r); }); });
      return p.then(function () { return { campos: salida, campos_no_revisados: todos.length > cps.length ? todos.slice(cps.length).map(function (c) { return c.nombre + (conFact[String(c.id)] ? ' (tiene facturas)' : ' (sin facturas)'); }) : undefined,
        fuente: 'Banco → Energía y agua de SAFIA: facturas de energía cargadas por el cliente (leídas de la factura) y balance diario FAO-56 de cada campaña',
        reglas: 'El total de cada factura se reparte entre los pivots del medidor según mm regados × hectáreas en el período de la factura. Riego necesario = lo que hacía falta para que el cultivo no pasara sed con la lluvia real; aprovechamiento = necesario ÷ aplicado. El exceso de potencia reservada es un recargo por pasarse de la potencia contratada (no es energía): se corrige con la ANDE. La reactiva se baja con un banco de capacitores (consultarlo con el electricista). SAFIA muestra lo que dice la factura; qué contratar lo define el cliente.',
        importante: 'El riego que no se cargó no existe para SAFIA: sin riegos cargados en el período no hay reparto. Cada factura guarda su moneda y el cambio de su período.' }; });
    },
    plan_rotacion: function (i) {
      // Rotación por lote: lo que se sembró de verdad, el plan guardado (Banco → Plan de rotación) y los avisos de la rotación
      var Ro = window.SafiaRotacion; if (!Ro) return { error: 'Módulo de rotación no disponible en esta página' };
      var ls = lotesDe(i); if (ls.error) return ls;
      return { lotes: ls.lista.slice(0, 8).map(function (x) {
        puente(x.c);
        var hist = Ro.historialDelLote(x.e.id), plan = Ro.planDelLote(x.e.id), temps = plan && plan.temporadas ? plan.temporadas.filter(function (t) { return t && t.cultivo; }) : [];
        var sugerido = !temps.length; if (sugerido) { try { temps = (Ro.sugerirPlan(x.e.id, 3) || []).filter(function (t) { return t && t.cultivo; }); } catch (e) { temps = []; } }
        var sec = hist.map(function (h) { return { temporada: h.temporada, cultivo: h.cultivo, plan: false }; }).concat(temps.map(function (t) { return { temporada: { epoca: t.epoca, anio: t.anio }, cultivo: t.cultivo, plan: true }; }));
        var av = [], idx = null; try { av = Ro.avisos(sec); idx = Ro.indiceRotacion(sec); } catch (e) {}
        return { campo: x.c ? x.c.nombre : null, lote: x.e.nombre, tipo: esSecanoLote(x.e) ? 'secano' : (x.e.tipo || 'pivote'),
          sembrado_hasta_hoy: hist.slice(-9).map(function (h) { return { temporada: Ro.etiqueta(h.temporada), cultivo: h.cultivo, variedad: h.variedad || null, siembra: h.siembra, cosecha: h.cosecha, rinde_kg_ha: r0(h.rinde) }; }),
          plan_guardado: !sugerido, plan: temps.map(function (t) { return { temporada: Ro.etiqueta({ epoca: t.epoca, anio: t.anio }), cultivo: t.cultivo, objetivo_kg_ha: num(t.objetivoKgHa), nota: t.nota || null }; }),
          nota_plan: sugerido ? 'Este lote no tiene plan guardado: lo de arriba es la rotación SUGERIDA por SAFIA para 3 años (soja–maíz con cobertura de invierno). El dueño o el gerente la ajustan y guardan en Banco → Plan de rotación.' : null,
          avisos: av.map(function (z) { return { temporada: z.temporada || null, gravedad: z.tipo === 'alto' ? 'importante' : (z.tipo === 'bien' ? 'buena práctica' : 'a revisar'), texto: String(z.texto).replace(/\s*\[\d+\]/g, '') }; }),
          indice: idx ? { diversidad_pct: idx.diversidad, inviernos_cubiertos_pct: idx.cobertura } : null };
      }), lotes_no_mostrados: ls.lista.length > 8 ? ls.lista.length - 8 : undefined, fuente: 'Banco → Plan de rotación de SAFIA: temporadas verano, zafriña e invierno; reglas de rotación de Embrapa y CAPECO' };
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
    return '[Contexto de SAFIA · fecha ' + (window.SafiaBalance && SafiaBalance.hoyLocal ? SafiaBalance.hoyLocal() : (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })()) + ' (hoy es ' + DIAS_SEM[new Date().getDay()] + ') · usuario ' + (u.nombre || '—') + ' (rol ' + (u.rol || '—') + ') · ' + propios('campos').length + ' campo(s) propio(s) · ' + casos().length + ' caso(s) en el banco visibles para este usuario' + (pivotsVencidos().length ? ' · lotes con la suscripción VENCIDA (no se analizan; si pregunta por ellos, decile que renueve con Irrigar): ' + pivotsVencidos().join(', ') : '') + ']';
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
  var NOMBRES = { buscar_casos: 'Buscando casos en el banco', resumen_casos: 'Comparando casos del banco', referencia_zona: 'Leyendo la referencia de la zona', info_material: 'Buscando la ficha del material', clima_y_riego: 'Calculando clima y riego (unos segundos)', agua_hoy: 'Mirando el agua del suelo y el pronóstico', como_va_campana: 'Revisando la campaña: meta, agua, satélite, hoja e insumos', interpretar_suelo: 'Interpretando el suelo', mis_campos: 'Revisando tus campos', mi_lote: 'Revisando el lote y su historia', mantenimiento: 'Revisando el mantenimiento del equipo', riegos_y_lluvias: 'Sumando riegos y lluvias', historial_suelo: 'Revisando los análisis de suelo', comparar_con_lider: 'Comparando con el mejor lote de la zona', agua_de_riego: 'Revisando el análisis del agua de riego', plan_rotacion: 'Revisando la rotación del lote', energia_y_agua: 'Revisando las facturas de energía y el agua de la campaña', parte_seguimiento: 'Armando el parte de seguimiento de cada pivot' };
  function preguntar(texto, al) {
    if (ocupado || !texto.trim()) return Promise.resolve();
    // sin ningún pivot con suscripción vigente no se consulta a la IA (no se gasta)
    if (window.SafiaSuscripcion && !SafiaSuscripcion.algunaVigente()) { al.inicio(texto.trim()); al.fin({ error: 'Tu suscripción de SAFIA está vencida: el Asistente funciona con al menos un pivot vigente. Para renovar, hablá con Irrigar.' }); return Promise.resolve(); }
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
  var SUGERENCIAS = ['¿Cómo viene mi cosecha?', '¿Tengo que regar hoy? ¿Viene lluvia?', 'Contame todo de mi pivot: rindes, metas y nutrientes', '¿Qué variedades de soja rindieron más este año?', '¿Cómo está mi suelo contra el mejor lote de mi departamento?', '¿Cuánto regué y cuánto llovió desde la siembra?', '¿Qué mantenimiento tiene pendiente mi pivot?', '¿El agua de mi pozo sirve para regar?', '¿Qué me conviene sembrar después de este cultivo?', '¿Qué le falta al suelo de mi campo para llegar a 5.000 kg de soja?'];
  function montar(el) {
    if (!el) return;
    el.innerHTML = '<div id="asHist" style="display:flex;flex-direction:column;gap:12px;"></div>' +
      '<div id="asSug" style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;">' + SUGERENCIAS.map(function (s) { return '<button type="button" class="btn" data-sug style="font-size:12.5px;white-space:normal;text-align:left;">' + esc(s) + '</button>'; }).join('') + '</div>' +
      '<form id="asForm" style="display:flex;gap:8px;align-items:flex-end;margin-top:6px;"><textarea id="asTexto" rows="2" placeholder="Preguntale a SAFIA sobre tus campos, rindes, suelos, variedades, clima o riego…" style="flex:1;font:inherit;font-size:14px;padding:10px 12px;border:1px solid var(--bd);border-radius:10px;resize:vertical;"></textarea>' +
      '<button class="btn green" type="submit" id="asEnviar">Preguntar</button><button class="btn" type="button" id="asNueva" title="Empezar una conversación nueva">Nueva</button></form>' +
      '<div class="muted" style="font-size:11px;margin-top:6px;">SAFIA responde con los datos del banco (casos reales, referencia de la zona, clima y motor agronómico) que vos podés ver. Compara e interpreta; la prescripción la decide el ingeniero agrónomo.' + (window.SafiaSync && SafiaSync.esAdmin && SafiaSync.esAdmin() ? '' : ' La misma pregunta se responde hasta 2 veces por día.<span id="asCupo"></span>') + '</div>';
    var hist = el.querySelector('#asHist'), txt = el.querySelector('#asTexto'), btn = el.querySelector('#asEnviar');
    var burbuja = function (html, yo) { var d = document.createElement('div'); d.style.cssText = 'max-width:900px;padding:12px 14px;border-radius:12px;line-height:1.55;font-size:14px;' + (yo ? 'align-self:flex-end;background:#E9F6EC;border:1px solid #CDE9D3;' : 'align-self:stretch;background:#fff;border:1px solid var(--bd);'); d.innerHTML = html; hist.appendChild(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' }); return d; };
    // Bolsa de preguntas del mes del cliente (100 por cada pivot con suscripción vigente); Irrigar no tiene cupo
    var pintarCupo = function () {
      var s = el.querySelector('#asCupo'); if (!s || !window.safiaSupabase || !window.safiaSupabase.rpc) return;
      Promise.resolve(window.safiaSupabase.rpc('safia_asistente_cupos')).then(function (r) {
        var c = r && !r.error && Array.isArray(r.data) ? r.data[0] : null; if (!c || c.cupo == null) return;
        var f = String(c.renueva || '').split('-');
        s.textContent = ' Preguntas de este mes: ' + c.usadas + ' de ' + c.cupo + ' usadas' + (f.length === 3 ? ' (se renuevan el ' + (+f[2]) + '/' + (+f[1]) + ')' : '') + '.';
      }, function () {});
    };
    pintarCupo();
    var actual = null;
    var al = {
      inicio: function (t) { el.querySelector('#asSug').style.display = 'none'; burbuja(esc(t), true); actual = burbuja('<div class="as-pasos muted" style="font-size:12px;">Pensando…</div><div class="as-resp"></div>'); btn.disabled = true; btn.textContent = 'Pensando…'; },
      paso: function (n, input) { var p = actual.querySelector('.as-pasos'); if (p.textContent === 'Pensando…') p.textContent = ''; var filtros = input ? Object.keys(input).filter(function (k) { return input[k] !== '' && input[k] != null && typeof input[k] !== 'object'; }).map(function (k) { return input[k]; }).join(' · ') : ''; p.insertAdjacentHTML('beforeend', '<div>• ' + esc(n) + (filtros ? ' <span style="opacity:.8">(' + esc(filtros) + ')</span>' : '') + '</div>'); },
      fin: function (r) {
        var p = actual.querySelector('.as-pasos'); if (p.textContent === 'Pensando…') p.remove(); else p.style.marginBottom = '8px';
        actual.querySelector('.as-resp').innerHTML = r.error ? '<div class="note warn" style="margin:0;">' + esc(r.error) + '</div>' : md(r.texto);
        if (window.SafiaIconos && SafiaIconos.procesar) try { SafiaIconos.procesar(actual); } catch (e) {}
        btn.disabled = false; btn.textContent = 'Preguntar'; actual.scrollIntoView({ block: 'start', behavior: 'smooth' }); txt.focus();
        pintarCupo();
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
