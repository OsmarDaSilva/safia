/* SAFIA — Asistente agronómico (el "agrónomo inteligente")
   -------------------------------------------------------------------
   Chat que responde con los datos reales de SAFIA. La IA vive en la función safia-asistente (servidor, con la llave);
   las HERRAMIENTAS se ejecutan acá, en el navegador, sobre los datos que este usuario ya ve con su rol (un cliente: lo
   suyo y los lotes de la zona sin nombres). Así los números los calcula SAFIA, no la IA, y nadie ve lo que no debe.
   Herramientas: buscar_casos, resumen_casos, referencia_zona, info_material, clima_y_riego, interpretar_suelo, mis_campos.
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
    mis_campos: function () {
      var cl = propios('clientes'), cs = casos(), an = propios('analisis_suelo');
      return { campos: propios('campos').map(function (c) {
        var cli = cl.find(function (x) { return String(x.id) === String(c.clienteId); });
        return { campo: c.nombre, cliente: cli ? cli.nombre : null, localidad: c.localidad || null, departamento: c.departamento || null, region: C() ? C().regionNombre(C().region({ departamento: c.departamento, pais: c.pais, lat: num(c.latitud), lon: num(c.longitud) })) : null,
          superficie_ha: num(c.superficie), coordenada: c.latitud && c.longitud ? c.latitud + ', ' + c.longitud : null, tiene_analisis_suelo: an.some(function (a) { return String(a.campoId) === String(c.id); }),
          campanas_cosechadas: cs.filter(function (x) { return String(x.campoId) === String(c.id); }).length, es_proyecto: !!c.proyecto };
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
  var NOMBRES = { buscar_casos: 'Buscando casos en el banco', resumen_casos: 'Comparando casos del banco', referencia_zona: 'Leyendo la referencia de la zona', info_material: 'Buscando la ficha del material', clima_y_riego: 'Calculando clima y riego (unos segundos)', interpretar_suelo: 'Interpretando el suelo', mis_campos: 'Revisando tus campos' };
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
  var SUGERENCIAS = ['¿Qué variedad de soja rindió más con riego en la Región Oriental?', '¿Con cuántos mm de agua se hizo el mejor maíz del banco?', '¿Qué le falta al suelo de mi campo para llegar a 5.000 kg de soja?', '¿Cuánto riego lleva la soja en Mariscal Estigarribia y cuánto rinde en secano?', '¿Cuánto rinden la soja y el maíz con riego y en secano en Boquerón según la referencia?'];
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
  }

  window.SafiaAsistente = { montar: montar, preguntar: preguntar, nueva: nueva, ejecutar: ejecutar, md: md };
})();
