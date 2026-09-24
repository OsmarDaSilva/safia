/* SAFIA — Ficha de campaña y planilla Excel
   -------------------------------------------------------------------
   Una campaña se carga por UNA sola vía a la vez, pero siempre termina
   en el mismo lugar (la campaña del lote, en `campanas`):
   - ficha.html: un solo formulario con todos los pasos (dónde, siembra,
     insumos, riego, cosecha) y un botón "Guardar y cargar";
   - planilla Excel por cliente: la genera SAFIA con los lotes de ese
     cliente y los catálogos como listas desplegables (nadie escribe
     nombres de lote), el cliente la llena y se sube con vista previa.
   Identidad de una campaña: lote + cultivo + fecha de siembra. Si ya
   existe se actualiza (se completan datos, se agrega la cosecha); si no,
   se crea. Así una misma planilla se puede subir dos veces sin duplicar.
   Excel: ExcelJS (cdnjs) para escribir listas desplegables y leer. */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(/\./g, function (m, i, s) { return /,\d{1,2}$/.test(s) ? '' : m; }).replace(',', '.')); return isNaN(n) ? null : n; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function fechaISO(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) { if (isNaN(v)) return ''; return v.getUTCFullYear() + '-' + String(v.getUTCMonth() + 1).padStart(2, '0') + '-' + String(v.getUTCDate()).padStart(2, '0'); }
    var s = String(v).trim(), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    return '';
  }
  var FINALIDADES = ['Granos Comercial', 'Semilla', 'Ensilaje', 'Granos Húmedos', 'Forraje'];
  var DESTINOS = [{ k: 'cooperativa', n: 'Cooperativa / Acopio' }, { k: 'silo_propio', n: 'Silo propio' }, { k: 'venta_directa', n: 'Venta directa' }, { k: 'otro', n: 'Otro' }];
  function ins() { return window.SafiaInsumos || { COBERTURAS: [], MANEJO_COBERTURA: [], SISTEMAS_SIEMBRA: [], CONSORCIOS: [], LABORES_ENTRE: [], SECCIONES: [], CATEGORIAS: [], UNIDADES: {}, METODOS: [], ETAPAS: [] }; }
  function esPastura(c) { return !!(window.SafiaPasturas && SafiaPasturas.esPastura(c)); }
  function porNombreOClave(lista, v) { var n = norm(v); if (!n) return ''; var x = lista.find(function (o) { return norm(o.k) === n; }) || lista.find(function (o) { return norm(o.n) === n; }) || lista.find(function (o) { return o.n && norm(o.n).indexOf(n) === 0; }); return x ? x.k : ''; }
  function cultivosCatalogo() { var fao = leer('cultivos_fao'); if (!fao.length && window.TABLA_FAO) fao = window.TABLA_FAO; return fao.map(function (c) { return c.nombre; }).concat(leer('cultivos_custom').map(function (c) { return c.nombre; })); }
  function cultivoCanonico(v) { var n = norm(v), lista = cultivosCatalogo(); return lista.find(function (c) { return norm(c) === n; }) || lista.find(function (c) { return norm(c).split(/[\s(]/)[0] === n.split(/[\s(]/)[0]; }) || String(v || '').trim(); }

  /* ---------- lotes de un cliente (con su etiqueta única) ---------- */
  function lotesDe(clienteId) {
    var campos = leer('campos').filter(function (c) { return String(c.clienteId) === String(clienteId); });
    var out = [];
    leer('equipos').forEach(function (e) { var ca = campos.find(function (c) { return String(c.id) === String(e.campoId); }); if (ca) out.push({ id: e.id, nombre: e.nombre, campoId: ca.id, campo: ca.nombre, tipo: e.tipo, etiqueta: ca.nombre + ' · ' + e.nombre, superficie: e.superficie }); });
    return out.sort(function (a, b) { return a.etiqueta.localeCompare(b.etiqueta); });
  }
  function nombreZafra(fechaSiembra, cultivo) {
    var f = fechaISO(fechaSiembra); if (!f) return '';
    var y = parseInt(f.slice(0, 4), 10), m = parseInt(f.slice(5, 7), 10);
    if (esPastura(cultivo)) return 'Pastura ' + y;
    return m >= 7 ? 'Zafra ' + y + '/' + String(y + 1).slice(2) : 'Zafra ' + y;
  }

  /* ---------- validar y guardar una ficha ---------- */
  // f: { equipoId, nombre, cultivo, variedad, finalidad, fechaSiembra, superficie, densidad, cultivoAnterior, cobertura, coberturaManejo,
  //      sistemaSiembra, consorcio, labores[], encaladoTnHa, fertilizacion, rendimientoObj, observaciones,
  //      sistemaPastoreo, piquetes, diasOcupacion, diasDescanso,
  //      insumos: [{seccion, categoria, producto, dosis, unidad, metodo, forma, etapa, fecha}],
  //      cosecha: { fecha, produccionKg, superficie, humedad, destino, riegoMM, lluviaMM, observaciones } }
  function validar(f) {
    var errores = [], avisos = [];
    var eq = leer('equipos').find(function (e) { return String(e.id) === String(f.equipoId); });
    if (!eq) errores.push('Falta el lote (o no existe en SAFIA).');
    if (!f.cultivo) errores.push('Falta el cultivo.');
    var fs = fechaISO(f.fechaSiembra); if (!fs) errores.push('Falta la fecha de siembra (o no es una fecha válida).');
    var pastura = esPastura(f.cultivo);
    if (f.cosecha && (f.cosecha.fecha || f.cosecha.produccionKg)) {
      var fc = fechaISO(f.cosecha.fecha);
      if (!fc) errores.push('La cosecha no tiene fecha válida.');
      else if (fs && fc < fs) errores.push('La cosecha (' + fc + ') es anterior a la siembra (' + fs + ').');
      if (!(num(f.cosecha.produccionKg) > 0)) errores.push('La cosecha no tiene producción total en kg.');
      if (!(num(f.cosecha.superficie) > 0 || num(f.superficie) > 0 || (eq && num(eq.superficie) > 0))) errores.push('La cosecha necesita la superficie cosechada (ha).');
    }
    if (fs && fs > hoy() && !pastura) avisos.push('La siembra está en el futuro: queda como campaña planificada.');
    if (!f.superficie && eq && eq.superficie) avisos.push('Sin superficie: se usa la del lote (' + eq.superficie + ' ha).');
    return { ok: !errores.length, errores: errores, avisos: avisos };
  }
  function buscarCampana(campanas, f) {
    var fs = fechaISO(f.fechaSiembra), cu = norm(cultivoCanonico(f.cultivo));
    for (var i = 0; i < campanas.length; i++) {
      var c = campanas[i]; if (String(c.equipoId) !== String(f.equipoId) || !c.cultivos) continue;
      for (var j = 0; j < c.cultivos.length; j++) { var x = c.cultivos[j]; if (x && norm(cultivoCanonico(x.cultivo)) === cu && fechaISO(x.fechaSiembra) === fs) return { idx: i, cultivoIdx: j }; }
    }
    return null;
  }
  function guardar(f) {
    var v = validar(f); if (!v.ok) return { ok: false, errores: v.errores };
    var campanas = leer('campanas'), eq = leer('equipos').find(function (e) { return String(e.id) === String(f.equipoId); });
    var fs = fechaISO(f.fechaSiembra), cultivo = cultivoCanonico(f.cultivo), pastura = esPastura(cultivo);
    var enc = buscarCampana(campanas, f), ahora = new Date().toISOString(), accion;
    var cu = {
      cultivo: cultivo, variedad: String(f.variedad || '').trim().replace(/\s+/g, ' '), superficie: num(f.superficie) != null ? String(num(f.superficie)) : (eq && eq.superficie ? String(eq.superficie) : ''),
      fechaSiembra: fs, fechaCosecha: fechaISO(f.fechaCosechaEstimada) || '', densidad: num(f.densidad) != null ? String(num(f.densidad)) : '', espaciamiento: f.espaciamiento || '',
      rendimientoObj: num(f.rendimientoObj) != null ? String(num(f.rendimientoObj)) : '', finalidad: pastura ? 'Forraje' : (FINALIDADES.indexOf(f.finalidad) >= 0 ? f.finalidad : 'Granos Comercial'),
      encaladoTnHa: num(f.encaladoTnHa) != null ? String(num(f.encaladoTnHa)) : '', fertilizacion: String(f.fertilizacion || '').trim(), cultivoAnterior: String(f.cultivoAnterior || '').trim(),
      cobertura: porNombreOClave(ins().COBERTURAS, f.cobertura) || (f.cobertura || ''), coberturaDetalle: String(f.coberturaDetalle || '').trim(), coberturaManejo: porNombreOClave(ins().MANEJO_COBERTURA, f.coberturaManejo),
      sistemaSiembra: porNombreOClave(ins().SISTEMAS_SIEMBRA, f.sistemaSiembra), consorcio: porNombreOClave(ins().CONSORCIOS, f.consorcio), consorcioDetalle: String(f.consorcioDetalle || '').trim(),
      labores: laboresDesde(f.labores), cultivoAnteriorAuto: false, rendimientoReal: '',
      sistemaPastoreo: pastura ? (porNombreOClave(window.SafiaPasturas ? SafiaPasturas.SISTEMAS : [], f.sistemaPastoreo) || f.sistemaPastoreo || '') : '', piquetes: pastura ? (f.piquetes || '') : '', diasOcupacion: pastura ? (f.diasOcupacion || '') : '', diasDescanso: pastura ? (f.diasDescanso || '') : ''
    };
    var camp, cIdx;
    if (enc) {
      camp = campanas[enc.idx]; cIdx = enc.cultivoIdx; accion = 'actualizada';
      var previo = camp.cultivos[cIdx] || {};
      // completar sin borrar: lo nuevo pisa solo si viene con valor
      Object.keys(cu).forEach(function (k) { var nuevo = cu[k]; if (Array.isArray(nuevo) ? nuevo.length : (nuevo !== '' && nuevo != null)) previo[k] = nuevo; else if (previo[k] == null) previo[k] = nuevo; });
      camp.cultivos[cIdx] = previo;
      if (f.nombre) camp.nombre = f.nombre;
      camp.fechaModificacion = ahora;
    } else {
      camp = { id: Date.now(), nombre: f.nombre || nombreZafra(fs, cultivo), equipoId: eq.id, estado: 'Activa', cultivos: [cu], insumos: [], fechaCreacion: ahora, origen: f.origen || 'ficha' };
      campanas.push(camp); cIdx = 0; accion = 'creada';
    }
    if (f.observaciones) camp.observaciones = String(f.observaciones).trim();
    if (f.manejoCompleto != null) camp.manejoCompleto = !!f.manejoCompleto;   // 'no se cargó' ≠ 'no se hizo': con la marca, el diagnóstico puede decir qué falta
    // ficha existente editada en pantalla: la lista del formulario reemplaza a la de la campaña (lo que se quitó, se borra)
    if (f.reemplazarInsumos && enc) camp.insumos = (camp.insumos || []).filter(function (i) { return i.cultivoIdx != null && i.cultivoIdx !== cIdx; });
    // insumos (sin duplicar: misma categoría + producto + fecha)
    (f.insumos || []).forEach(function (it, k) {
      if (!it || !(it.producto || it.categoria)) return;
      var seccion = porNombreOClave(ins().SECCIONES, it.seccion) || it.seccion || 'ciclo';
      var cat = ins().CATEGORIAS.find(function (c) { return c.seccion === seccion && (norm(c.k) === norm(it.categoria) || norm(c.n) === norm(it.categoria) || (it.categoria && norm(c.n).indexOf(norm(it.categoria)) === 0)); });
      var item = { id: Date.now() + k + Math.floor(Math.random() * 1000), seccion: seccion, categoria: cat ? cat.k : (it.categoria || (seccion === 'semilla' ? 'ts_otro' : 'otro')), producto: String(it.producto || '').trim(), formula: seccion === 'fertilizacion' ? String(it.producto || '').trim() : undefined,
        dosis: num(it.dosis), unidad: it.unidad || ((ins().UNIDADES[seccion] || [])[0] || ''), metodo: seccion === 'fertilizacion' ? (porNombreOClave(ins().METODOS, it.metodo) || it.metodo || '') : undefined, forma: seccion === 'semilla' ? (it.forma || 'semilla') : undefined,
        etapa: seccion === 'semilla' ? 'Tratamiento de semilla' : (it.etapa || ''), fecha: fechaISO(it.fecha) || null, cultivoIdx: camp.cultivos.length > 1 ? cIdx : null };
      camp.insumos = camp.insumos || [];
      var dup = camp.insumos.some(function (x) { return x.categoria === item.categoria && norm(x.producto) === norm(item.producto) && (x.fecha || null) === (item.fecha || null); });
      if (!dup) camp.insumos.push(item);
    });
    // cosecha (solo cultivos con cosecha; las pasturas no)
    var co = f.cosecha;
    if (!pastura && co && fechaISO(co.fecha) && num(co.produccionKg) > 0) {
      var sup = num(co.superficie) || num(camp.cultivos[cIdx].superficie) || (eq && num(eq.superficie)) || 0, prod = num(co.produccionKg);
      var cosecha = { fecha: fechaISO(co.fecha), superficie: sup, produccionKg: prod, humedad: num(co.humedad) || 14, rendimientoNeto: sup > 0 ? Math.round(prod / sup) : 0, destino: porNombreOClave(DESTINOS, co.destino) || 'cooperativa', observaciones: String(co.observaciones || '').trim(),
        riegoMM: num(co.riegoMM), lluviaMM: num(co.lluviaMM), lluviaAuto: false, fechaRegistro: ahora };
      camp.cosechas = camp.cosechas || {}; camp.cosechas[cIdx] = cosecha;
      if (cIdx === 0 || !camp.cosecha) camp.cosecha = cosecha;
      camp.cultivos[cIdx].rendimientoReal = cosecha.rendimientoNeto; camp.cultivos[cIdx].fechaCosecha = cosecha.fecha;
      if (window.SafiaNutrientes) SafiaNutrientes.cerrar(camp, cIdx);   // el balance de nutrientes queda firme con el rinde real
      if ((camp.cultivos || []).every(function (x) { return x.rendimientoReal; })) { camp.estado = 'Cerrada'; if (!camp.fechaCierre) camp.fechaCierre = ahora; }
    }
    localStorage.setItem('campanas', JSON.stringify(campanas));
    return { ok: true, accion: accion, campanaId: camp.id, cultivoIdx: cIdx, nombre: camp.nombre, cerrada: camp.estado === 'Cerrada', avisos: v.avisos, campoId: eq.campoId, tieneMeta: !!camp.cultivos[cIdx].rendimientoObj && !camp.cultivos[cIdx].rendimientoReal };
  }
  function laboresDesde(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    var L = ins().LABORES_ENTRE, out = [];
    String(v || '').split(/[,;\/]+/).forEach(function (t) { var n = norm(t); if (!n) return; var l = L.find(function (x) { return norm(x.k) === n || norm(x.n) === n || norm(x.n).indexOf(n) === 0 || n.indexOf(norm(x.k)) === 0; }); if (l && out.indexOf(l.k) === -1) out.push(l.k); });
    return out;
  }
  // Ficha a partir de una campaña existente (para completar o corregir)
  function desdeCampana(camp, cultivoIdx) {
    var cu = (camp.cultivos || [])[cultivoIdx || 0] || {}, co = (camp.cosechas && camp.cosechas[cultivoIdx || 0]) || ((cultivoIdx || 0) === 0 ? camp.cosecha : null) || {};
    return { campanaId: camp.id, campoId: (leer('equipos').find(function (e) { return String(e.id) === String(camp.equipoId); }) || {}).campoId, manejoCompleto: !!camp.manejoCompleto, equipoId: camp.equipoId, nombre: camp.nombre || '', cultivo: cu.cultivo || '', variedad: cu.variedad || '', finalidad: cu.finalidad || 'Granos Comercial', fechaSiembra: cu.fechaSiembra || '', fechaCosechaEstimada: cu.fechaCosecha && !cu.rendimientoReal ? cu.fechaCosecha : '', superficie: cu.superficie || '', densidad: cu.densidad || '', cultivoAnterior: cu.cultivoAnterior || '', cobertura: cu.cobertura || '', coberturaManejo: cu.coberturaManejo || '', sistemaSiembra: cu.sistemaSiembra || '', consorcio: cu.consorcio || '', labores: cu.labores || [], encaladoTnHa: cu.encaladoTnHa || '', fertilizacion: cu.fertilizacion || '', rendimientoObj: cu.rendimientoObj || '', observaciones: camp.observaciones || '',
      sistemaPastoreo: cu.sistemaPastoreo || '', piquetes: cu.piquetes || '', diasOcupacion: cu.diasOcupacion || '', diasDescanso: cu.diasDescanso || '',
      insumos: (camp.insumos || []).filter(function (i) { return i.cultivoIdx == null || i.cultivoIdx === (cultivoIdx || 0); }),
      cosecha: co && co.fecha ? { fecha: co.fecha, produccionKg: co.produccionKg, superficie: co.superficie, humedad: co.humedad, destino: co.destino, riegoMM: co.riegoMM, lluviaMM: co.lluviaMM, observaciones: co.observaciones } : {} };
  }

  /* ---------- planilla Excel por cliente ---------- */
  var COLS = [
    { k: 'lote', t: 'Lote', ayuda: 'Elegí de la lista (campo · lote)', w: 34, lista: 'lotes' },
    { k: 'loteId', t: 'Código del lote (no tocar)', ayuda: 'Se completa solo', w: 16, formula: true },
    { k: 'nombre', t: 'Nombre de la campaña', ayuda: 'Ej: Zafra 2026/27 (si queda vacío, SAFIA lo pone)', w: 20 },
    { k: 'cultivo', t: 'Cultivo', ayuda: 'Elegí de la lista', w: 26, lista: 'cultivos' },
    { k: 'variedad', t: 'Variedad / híbrido', ayuda: 'Texto libre', w: 20 },
    { k: 'finalidad', t: 'Finalidad', ayuda: 'Grano, semilla, ensilaje, forraje', w: 18, lista: 'finalidades' },
    { k: 'fechaSiembra', t: 'Fecha de siembra', ayuda: 'dd/mm/aaaa (obligatoria)', w: 16, fecha: true },
    { k: 'superficie', t: 'Superficie (ha)', ayuda: 'Número', w: 14 },
    { k: 'densidad', t: 'Densidad (plantas/ha)', ayuda: 'Número (opcional)', w: 18 },
    { k: 'cultivoAnterior', t: 'Cultivo anterior', ayuda: 'Qué había antes en el lote', w: 18 },
    { k: 'cobertura', t: 'Cobertura previa', ayuda: 'Elegí de la lista', w: 30, lista: 'coberturas' },
    { k: 'coberturaManejo', t: 'Manejo de la cobertura', ayuda: 'Elegí de la lista', w: 22, lista: 'manejoCob' },
    { k: 'sistemaSiembra', t: 'Sistema de siembra', ayuda: 'Elegí de la lista', w: 34, lista: 'sistemas' },
    { k: 'consorcio', t: 'Consorcio', ayuda: 'Elegí de la lista', w: 34, lista: 'consorcios' },
    { k: 'labores', t: 'Labores antes de sembrar', ayuda: 'Separadas por coma: subsolado, encalado, yeso, rastroneada, nivelación, desecación, abono orgánico, escarificado', w: 34 },
    { k: 'encaladoTnHa', t: 'Encalado (t/ha)', ayuda: 'Número (opcional)', w: 14 },
    { k: 'fertilizacion', t: 'Nota de fertilización', ayuda: 'Solo texto (no suma N-P-K): la fórmula y la dosis van en la hoja Insumos', w: 30 },
    { k: 'rendimientoObj', t: 'Meta de rinde (kg/ha)', ayuda: 'Número (opcional)', w: 18 },
    { k: 'cosechaFecha', t: 'Fecha de cosecha', ayuda: 'dd/mm/aaaa (solo si ya cosechó)', w: 16, fecha: true },
    { k: 'cosechaKg', t: 'Producción total (kg)', ayuda: 'Kilos totales del lote', w: 18 },
    { k: 'cosechaSup', t: 'Superficie cosechada (ha)', ayuda: 'Si es distinta a la sembrada', w: 20 },
    { k: 'cosechaHumedad', t: 'Humedad (%)', ayuda: 'Ej: 14', w: 12 },
    { k: 'cosechaDestino', t: 'Destino', ayuda: 'Elegí de la lista', w: 20, lista: 'destinos' },
    { k: 'riegoMM', t: 'Riego total del ciclo (mm)', ayuda: 'Solo si no cargó los riegos en el Operador', w: 20 },
    { k: 'lluviaMM', t: 'Lluvia total del ciclo (mm)', ayuda: 'Opcional', w: 20 },
    { k: 'observaciones', t: 'Observaciones', ayuda: 'Texto libre', w: 30 },
    { k: 'sistemaPastoreo', t: 'Pastura: sistema', ayuda: 'Solo pasturas', w: 30, lista: 'sistemasPastoreo' },
    { k: 'piquetes', t: 'Pastura: piquetes', ayuda: 'Cantidad', w: 14 },
    { k: 'diasOcupacion', t: 'Pastura: días de ocupación', ayuda: 'Por piquete', w: 18 },
    { k: 'diasDescanso', t: 'Pastura: días de descanso', ayuda: 'Por piquete', w: 18 }
  ];
  var COLS_INS = [
    { k: 'lote', t: 'Lote', ayuda: 'Elegí de la lista', w: 34, lista: 'lotes' },
    { k: 'loteId', t: 'Código del lote (no tocar)', ayuda: 'Se completa solo', w: 16, formula: true },
    { k: 'cultivo', t: 'Cultivo', ayuda: 'El mismo de la hoja Campañas', w: 26, lista: 'cultivos' },
    { k: 'fechaSiembra', t: 'Fecha de siembra', ayuda: 'La misma de la hoja Campañas', w: 16, fecha: true },
    { k: 'seccion', t: 'Sección', ayuda: 'Semilla, fertilización o durante el ciclo', w: 24, lista: 'secciones' },
    { k: 'categoria', t: 'Categoría', ayuda: 'Elegí de la lista', w: 36, lista: 'categorias' },
    { k: 'producto', t: 'Producto o fórmula', ayuda: 'Ej: Urea, 04-30-10, Fox Xpro', w: 24 },
    { k: 'dosis', t: 'Dosis', ayuda: 'Número', w: 10 },
    { k: 'unidad', t: 'Unidad', ayuda: 'kg/ha, L/ha, mL/kg semilla…', w: 16, lista: 'unidades' },
    { k: 'metodo', t: 'Método (fertilización)', ayuda: 'Elegí de la lista', w: 30, lista: 'metodos' },
    { k: 'etapa', t: 'Etapa', ayuda: 'Elegí de la lista', w: 20, lista: 'etapas' },
    { k: 'fecha', t: 'Fecha de aplicación', ayuda: 'dd/mm/aaaa', w: 16, fecha: true }
  ];
  function letra(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  function listas(clienteId) {
    var I = ins();
    return {
      lotes: lotesDe(clienteId).map(function (l) { return [l.etiqueta, String(l.id)]; }),
      cultivos: cultivosCatalogo().map(function (c) { return [c]; }),
      finalidades: FINALIDADES.map(function (f) { return [f]; }),
      coberturas: I.COBERTURAS.filter(function (c) { return c.k; }).map(function (c) { return [c.n]; }),
      manejoCob: I.MANEJO_COBERTURA.filter(function (c) { return c.k; }).map(function (c) { return [c.n]; }),
      sistemas: I.SISTEMAS_SIEMBRA.filter(function (c) { return c.k; }).map(function (c) { return [c.n]; }),
      consorcios: I.CONSORCIOS.map(function (c) { return [c.n]; }),
      destinos: DESTINOS.map(function (d) { return [d.n]; }),
      sistemasPastoreo: (window.SafiaPasturas ? SafiaPasturas.SISTEMAS : []).map(function (s) { return [s.n]; }),
      secciones: I.SECCIONES.map(function (s) { return [s.n]; }),
      categorias: I.CATEGORIAS.map(function (c) { return [c.n]; }),
      unidades: [].concat(I.UNIDADES.fertilizacion || [], I.UNIDADES.ciclo || [], I.UNIDADES.semilla || []).filter(function (u, i, a) { return a.indexOf(u) === i; }).map(function (u) { return [u]; }),
      metodos: I.METODOS.map(function (m) { return [m.n]; }),
      etapas: (I.ETAPAS || []).map(function (e) { return [e]; })
    };
  }
  function plantilla(clienteId) {
    if (!window.ExcelJS) return Promise.reject(new Error('No se cargó la librería de Excel (sin internet).'));
    var cli = leer('clientes').find(function (c) { return String(c.id) === String(clienteId); });
    if (!cli) return Promise.reject(new Error('Elegí el cliente.'));
    var L = listas(clienteId);
    if (!L.lotes.length) return Promise.reject(new Error('Ese cliente no tiene lotes cargados. Cargá primero sus campos y lotes.'));
    var wb = new ExcelJS.Workbook(); wb.creator = 'SAFIA';
    var hojaL = wb.addWorksheet('Listas'); hojaL.state = 'hidden';
    var col = 1, rangos = {};
    Object.keys(L).forEach(function (k) {
      var vals = L[k]; var c1 = letra(col);
      vals.forEach(function (v, i) { hojaL.getCell(c1 + (i + 1)).value = v[0]; if (v[1] != null) hojaL.getCell(letra(col + 1) + (i + 1)).value = v[1]; });
      rangos[k] = { col: c1, colId: letra(col + 1), n: vals.length };
      col += 3;
    });
    function armarHoja(nombre, cols, filas) {
      var ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 2 }] });
      cols.forEach(function (c, i) {
        var cel = ws.getCell(1, i + 1); cel.value = c.t; cel.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF178029' } }; cel.alignment = { wrapText: true, vertical: 'middle' };
        var ay = ws.getCell(2, i + 1); ay.value = c.ayuda; ay.font = { italic: true, size: 9, color: { argb: 'FF8C9196' } }; ay.alignment = { wrapText: true, vertical: 'top' };
        ws.getColumn(i + 1).width = c.w || 16;
        if (c.formula) ws.getColumn(i + 1).font = { color: { argb: 'FF8C9196' }, size: 9 };
        for (var r = 3; r <= 3 + filas; r++) {
          var cell = ws.getCell(r, i + 1);
          if (c.lista && rangos[c.lista] && rangos[c.lista].n) cell.dataValidation = { type: 'list', allowBlank: true, showErrorMessage: true, errorTitle: 'SAFIA', error: 'Elegí un valor de la lista', formulae: ['Listas!$' + rangos[c.lista].col + '$1:$' + rangos[c.lista].col + '$' + rangos[c.lista].n] };
          if (c.fecha) { cell.numFmt = 'dd/mm/yyyy'; cell.dataValidation = { type: 'date', allowBlank: true, showErrorMessage: true, errorTitle: 'SAFIA', error: 'Escribí una fecha dd/mm/aaaa', operator: 'greaterThan', formulae: [new Date(2000, 0, 1)] }; }
          if (c.formula) cell.value = { formula: 'IFERROR(VLOOKUP(' + letra(i) + r + ',Listas!$' + rangos.lotes.col + '$1:$' + rangos.lotes.colId + '$' + rangos.lotes.n + ',2,FALSE),"")' };
        }
      });
      ws.getRow(1).height = 32; ws.getRow(2).height = 40;
      return ws;
    }
    armarHoja('Campañas', COLS, 200);
    armarHoja('Insumos', COLS_INS, 400);
    var info = wb.addWorksheet('Cómo usar');
    [['Planilla de campañas SAFIA · ' + cli.nombre], [''], ['1. Hoja "Campañas": una fila por lote y cultivo. Elegí el lote de la lista (no lo escribas); el código se completa solo.'], ['2. Fecha de siembra obligatoria. La cosecha se completa cuando exista (fecha, kilos totales, humedad, destino).'], ['3. Hoja "Insumos": una fila por producto (semilla, fertilización, ciclo), con el mismo lote, cultivo y fecha de siembra de la campaña.'], ['4. Los riegos y lluvias del día a día se cargan en la app (Operador); acá solo va el total del ciclo si no se cargaron.'], ['5. Subí la planilla en SAFIA → Ficha de campaña → Subir planilla. SAFIA muestra qué va a crear o actualizar antes de guardar.'], ['6. Si falta un lote en la lista, avisá a Irrigar para que lo cargue y bajá la planilla de nuevo.'], [''], ['Generada el ' + hoy() + ' · lotes de ' + cli.nombre + ': ' + L.lotes.map(function (l) { return l[0]; }).join(' | ')]].forEach(function (f) { info.addRow(f); });
    info.getColumn(1).width = 120; info.getCell('A1').font = { bold: true, size: 14 };
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'SAFIA_planilla_' + norm(cli.nombre).replace(/[^a-z0-9]+/g, '_') + '_' + hoy() + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return a.download;
    });
  }

  /* ---------- leer una planilla ---------- */
  function valorCelda(c) {
    var v = c && c.value;
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') { if (v.result != null) return v.result; if (v.richText) return v.richText.map(function (t) { return t.text; }).join(''); if (v.text) return v.text; return ''; }
    return v;
  }
  function filasDe(ws, cols) {
    var out = [];
    if (!ws) return out;
    ws.eachRow(function (row, n) {
      if (n <= 2) return;
      var o = { _fila: n }, vacia = true;
      cols.forEach(function (c, i) { var v = valorCelda(row.getCell(i + 1)); if (v !== '' && v != null) vacia = false; o[c.k] = v; });
      if (!vacia) out.push(o);
    });
    return out;
  }
  function loteDesde(fila, clienteId) {
    var lotes = lotesDe(clienteId), id = String(fila.loteId || '').trim();
    var l = id ? lotes.find(function (x) { return String(x.id) === id; }) : null;
    if (!l && fila.lote) { var n = norm(fila.lote); l = lotes.find(function (x) { return norm(x.etiqueta) === n; }) || lotes.find(function (x) { return norm(x.nombre) === n; }) || lotes.find(function (x) { return n.indexOf(norm(x.nombre)) !== -1; }); }
    return l || null;
  }
  // Devuelve { fichas: [{ficha, fila, lote, validacion, existente}], errores: [texto] }
  function leerPlanilla(archivo, clienteId) {
    if (!window.ExcelJS) return Promise.reject(new Error('No se cargó la librería de Excel (sin internet).'));
    return archivo.arrayBuffer().then(function (buf) { var wb = new ExcelJS.Workbook(); return wb.xlsx.load(buf); }).then(function (wb) {
      var hc = wb.getWorksheet('Campañas'), hi = wb.getWorksheet('Insumos');
      if (!hc) throw new Error('La planilla no tiene la hoja "Campañas". Usá la planilla que genera SAFIA.');
      var filas = filasDe(hc, COLS), insumos = filasDe(hi, COLS_INS), campanas = leer('campanas'), errores = [], fichas = [];
      filas.forEach(function (r) {
        var lote = loteDesde(r, clienteId);
        if (!lote) { errores.push('Fila ' + r._fila + ': el lote "' + (r.lote || '') + '" no existe para este cliente. Cargalo en SAFIA y bajá la planilla de nuevo.'); return; }
        var fs = fechaISO(r.fechaSiembra);
        var f = { origen: 'planilla', equipoId: lote.id, nombre: String(r.nombre || '').trim(), cultivo: r.cultivo, variedad: r.variedad, finalidad: r.finalidad, fechaSiembra: fs, superficie: r.superficie, densidad: r.densidad, cultivoAnterior: r.cultivoAnterior, cobertura: r.cobertura, coberturaManejo: r.coberturaManejo, sistemaSiembra: r.sistemaSiembra, consorcio: r.consorcio, labores: r.labores, encaladoTnHa: r.encaladoTnHa, fertilizacion: r.fertilizacion, rendimientoObj: r.rendimientoObj, observaciones: r.observaciones,
          sistemaPastoreo: r.sistemaPastoreo, piquetes: r.piquetes, diasOcupacion: r.diasOcupacion, diasDescanso: r.diasDescanso,
          cosecha: { fecha: fechaISO(r.cosechaFecha), produccionKg: r.cosechaKg, superficie: r.cosechaSup, humedad: r.cosechaHumedad, destino: r.cosechaDestino, riegoMM: r.riegoMM, lluviaMM: r.lluviaMM },
          insumos: insumos.filter(function (i) { var li = loteDesde(i, clienteId); return li && li.id === lote.id && norm(cultivoCanonico(i.cultivo)) === norm(cultivoCanonico(r.cultivo)) && fechaISO(i.fechaSiembra) === fs; }).map(function (i) { return { seccion: i.seccion, categoria: i.categoria, producto: i.producto, dosis: i.dosis, unidad: i.unidad, metodo: i.metodo, etapa: i.etapa, fecha: fechaISO(i.fecha) }; }) };
        var val = validar(f), enc = buscarCampana(campanas, f);
        fichas.push({ ficha: f, fila: r._fila, lote: lote, validacion: val, existente: enc ? campanas[enc.idx] : null });
      });
      insumos.forEach(function (i) { var li = loteDesde(i, clienteId); if (!li) errores.push('Insumos, fila ' + i._fila + ': lote "' + (i.lote || '') + '" no existe.'); else if (!filas.some(function (r) { var lr = loteDesde(r, clienteId); return lr && lr.id === li.id && norm(cultivoCanonico(r.cultivo)) === norm(cultivoCanonico(i.cultivo)) && fechaISO(r.fechaSiembra) === fechaISO(i.fechaSiembra); })) errores.push('Insumos, fila ' + i._fila + ': no coincide con ninguna campaña de la hoja Campañas (mismo lote, cultivo y fecha de siembra).'); });
      return { fichas: fichas, errores: errores, totalFilas: filas.length, totalInsumos: insumos.length };
    });
  }

  window.SafiaFicha = { FINALIDADES: FINALIDADES, DESTINOS: DESTINOS, COLS: COLS, lotesDe: lotesDe, nombreZafra: nombreZafra, validar: validar, guardar: guardar, desdeCampana: desdeCampana, buscarCampana: buscarCampana, plantilla: plantilla, leerPlanilla: leerPlanilla, fechaISO: fechaISO, cultivosCatalogo: cultivosCatalogo, esPastura: esPastura };
})();
