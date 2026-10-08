/* SAFIA · Lo que SAFIA aprende de sus propias cosechas (window.SafiaAprende)
   -------------------------------------------------------------------------------------------------
   No es un servicio de afuera ni se paga: son cálculos propios sobre las cosechas del banco. Irrigar (que ve todo el banco)
   corre el aprendizaje en "Lo que SAFIA aprendió" y publica el resultado en la tabla safia_aprendizaje (un solo registro,
   sin nombres de clientes); todos los usuarios lo leen y los motores lo usan.

   NIVEL 1 · corregir los números de partida con lo propio (mezcla con la fuente: con pocos casos casi no se mueve)
     · Ciclo de cada variedad: días reales de siembra a cosecha contra lo que estimaba SafiaCiclo → SafiaCiclo.estimar
       suma la corrección. ajuste = suma de diferencias / (casos + 3).
     · Maíz con grados-día: los grados-día dan la MADUREZ FISIOLÓGICA, no la cosecha. Embrapa (Sistema de Produção 1,
       Colheita e pós-colheita): se puede cosechar desde la madurez, pero normalmente se empieza con 18–20 % de humedad,
       según secadora, riesgo y precio; los días de secado en la planta no están publicados. SAFIA los aprende: días
       reales de cosecha menos días a madurez, promedio de las cosechas de maíz de la región → SafiaCiclo los suma.
     · Ciclo propio de los materiales sin ciclo publicado (ni días, ni grados-día): promedio de los días reales de
       siembra a cosecha → SafiaCiclo.estimar lo usa como estimación, diciendo con cuántas cosechas.
     · Cierre del surco de la soja: días hasta que el satélite mostró NDVI 0,60 → la tarjeta de la roya lo usa cuando
       no hay imagen reciente (en vez del día 30 fijo). valor = (suma + 3 × 30) / (casos + 3).
     · Rango alcanzable de la meta: cosecha real contra el centro del rango que anunciaba la meta viva (bitácora de
       acierto) → la meta viva multiplica su rango. factor = (suma de cocientes + 3) / (campañas + 3).
   NIVEL 2 · modelo de rinde por cultivo y riego: regresión con encogimiento (ridge) sobre agua del ciclo, fecha de
     siembra y suelo, solo con 15 casos o más y 5 por variable. Se publica solo si, probado dejando cada caso afuera,
     acierta mejor que el promedio. Si no, dice cuántos casos faltan.
   NIVEL 3 · recomendaciones que aprenden: de cada ítem del plan de la meta y de cada práctica de manejo, cuánto rindieron
     las campañas que lo hicieron contra las que no. Es una asociación, no una prueba de causa: se dice siempre.
   Reglas: siempre se muestra con cuántos casos; Chaco y Oriental por separado cuando se sabe la región; riego y secano por
   separado en el modelo; solo grano (no forraje ni ensilaje). */
(function () {
  'use strict';
  var K = 3, MIN = { ciclo: 2, propio: 1, secado: 1, cierre: 2, meta: 3, modelo: 15, rec: 3 }, NDVI_CIERRE = 0.6, DIAS_CIERRE_BASE = 30, ID = 'parametros';
  function lista(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function cultivoK(c) { var s = norm(c); return /soja|soya/.test(s) ? 'soja' : /maiz|milho/.test(s) ? 'maiz' : /trigo/.test(s) ? 'trigo' : s; }
  function dia(f) { return String(f || '').slice(0, 10); }
  function dias(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n, d) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function regionDe(x) { try { return window.SafiaCasos && SafiaCasos.region ? SafiaCasos.region(x) : null; } catch (e) { return null; } }
  function clave(cultivo, variedad, region) { return cultivoK(cultivo) + '|' + norm(variedad) + '|' + (region || ''); }
  // nombre de la ficha del material ("Pioner 3322" y "P3322 PWU" son el mismo): así se juntan las cosechas del mismo híbrido
  function material(cultivo, variedad) { var suf = '', mz = String(variedad || '').match(/^(.*) · zafriña$/); if (mz) { variedad = mz[1]; suf = ' · zafriña'; } return materialBase(cultivo, variedad) + suf; }
  function materialBase(cultivo, variedad) { try { var d = variedad && window.SafiaMateriales ? SafiaMateriales.buscar(cultivo, variedad) : null; return d && d.nombre ? d.nombre : variedad; } catch (e) { return variedad; } }

  /* ================= LEER lo aprendido (lo usan los motores) ================= */
  function datos() { var l = lista('aprendizaje'); for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === ID) return l[i]; return null; }
  // busca primero con la región y, si no hay casos suficientes, el mismo material en todas las regiones
  function buscar(tabla, cultivo, variedad, region, min) {
    var P = datos(); if (!P || !P[tabla]) return null;
    var a = region ? P[tabla][clave(cultivo, variedad, region)] : null, b = P[tabla][clave(cultivo, variedad, '')];
    return a && a.n >= min ? a : b && b.n >= min ? b : null;
  }
  // Nivel 1 · corrección del ciclo de una variedad (días a sumar a la estimación de SafiaCiclo)
  function ajusteCiclo(o) { var r = buscar('ciclos', o.cultivo, material(o.cultivo, o.variedad), o.region || regionDe(o), MIN.ciclo); return r ? { dias: Math.round(r.ajuste), n: r.n, region: r.region } : null; }
  // Nivel 1 · días de secado del maíz en la planta, de la madurez fisiológica a la cosecha (todas las cosechas de maíz de la región)
  function secado(o) { var P = datos(); if (!P || !P.secado) return null; var reg = o.region || regionDe(o), k = cultivoK(o.cultivo), a = reg ? P.secado[k + '|' + reg] : null, b = P.secado[k + '|'];
    var r = a && a.n >= MIN.secado ? a : b && b.n >= MIN.secado ? b : null; return r ? { dias: Math.round(r.media), n: r.n, region: r.region, min: Math.min.apply(null, r.valores), max: Math.max.apply(null, r.valores) } : null; }
  // Nivel 1 · ciclo propio de un material sin ciclo publicado: días promedio de siembra a cosecha en las cosechas del banco
  function cicloPropio(o) { var r = buscar('propios', o.cultivo, material(o.cultivo, o.variedad), o.region || regionDe(o), MIN.propio); return r ? { dias: Math.round(r.media), n: r.n, region: r.region, min: Math.min.apply(null, r.valores), max: Math.max.apply(null, r.valores) } : null; }
  // Nivel 1 · días hasta el cierre del surco de la soja (NDVI 0,60) para usar sin imagen reciente
  function diasCierre(cultivo, variedad, region) {
    var r = buscar('cierre', cultivo, variedad, region, MIN.cierre) || buscar('cierre', cultivo, '', region, MIN.cierre);
    return r ? { dias: Math.round(r.valor), n: r.n, deLaVariedad: !!(variedad && r.variedad) } : null;
  }
  // Nivel 1 · factor para el rango alcanzable de la meta viva
  function factorMeta(cultivo, region) {
    var P = datos(); if (!P || !P.meta) return null;
    var a = region ? P.meta[cultivoK(cultivo) + '|' + region] : null, b = P.meta[cultivoK(cultivo) + '|'];
    var r = a && a.n >= MIN.meta ? a : b && b.n >= MIN.meta ? b : null;
    return r ? { f: r.factor, n: r.n } : null;
  }
  // Nivel 2 · rinde que predice el modelo para un caso { cultivo, riego, aguaTotalMM, siembra, suelo:{...} }
  function predecir(c) {
    var P = datos(); if (!P || !P.modelos) return null;
    var M = P.modelos[cultivoK(c.cultivo) + '|' + (c.riego === false ? 'secano' : 'riego')]; if (!M || !M.ok) return null;
    var x = filaDe(c, M.variables); if (!x) return { falta: M.variables.filter(function (v, i) { return valorDe(c, v) == null; }).map(nombreVar) };
    var y = M.b0; M.variables.forEach(function (v, i) { y += M.coef[i] * (x[i] - M.media[i]) / M.desvio[i]; });
    return { kg: Math.round(y / 10) * 10, error: Math.round(M.errorLoo / 10) * 10, n: M.n };
  }
  // Nivel 3 · lo que dice el banco de un ítem del plan de la meta o de una práctica
  function evidencia(k, cultivo) {
    var P = datos(); if (!P) return null;
    var r = (P.recomendaciones && P.recomendaciones[cultivoK(cultivo) + '|' + k]) || (P.practicas && P.practicas[cultivoK(cultivo) + '|' + k]);
    return r && r.nCon >= MIN.rec && r.nSin >= MIN.rec ? r : null;
  }

  /* ================= APRENDER (Irrigar) ================= */
  var VARS = ['agua', 'siembra', 'arcilla', 'p', 'k', 'v'];
  function nombreVar(v) { return { agua: 'agua del ciclo (lluvia + riego)', siembra: 'fecha de siembra', arcilla: 'arcilla del suelo', p: 'fósforo del suelo', k: 'potasio del suelo', v: 'saturación de bases (V %)' }[v] || v; }
  function unidadVar(v) { return { agua: ['por cada 100 mm', 100], siembra: ['por cada 10 días más tarde', 10], arcilla: ['por cada 10 puntos de arcilla', 10], p: ['por cada 10 mg/dm³ de P', 10], k: ['por cada 0,1 cmolc/dm³ de K', 0.1], v: ['por cada 10 puntos de V %', 10] }[v]; }
  function valorDe(c, v) {
    if (v === 'agua') return num(c.aguaTotalMM);
    if (v === 'siembra') { if (!c.siembra) return null; var f = dia(c.siembra), y = +f.slice(0, 4), m = +f.slice(5, 7), ini = (m >= 7 ? y : y - 1) + '-07-01'; return dias(ini, f); }   // días desde el 1 de julio de la temporada
    var s = c.suelo || {}; return num({ arcilla: s.arcilla, p: s.p, k: s.k, v: s.satBases }[v]);
  }
  function filaDe(c, vars) { var x = vars.map(function (v) { return valorDe(c, v); }); return x.some(function (v) { return v == null; }) ? null : x; }
  // ridge sobre variables estandarizadas: (XᵀX + λI) β = Xᵀy
  function ridge(X, y, lambda) {
    var p = X[0].length, A = [], b = [];
    for (var i = 0; i < p; i++) { A.push(new Array(p).fill(0)); b.push(0); }
    X.forEach(function (fila, r) { for (var i = 0; i < p; i++) { b[i] += fila[i] * y[r]; for (var j = 0; j < p; j++) A[i][j] += fila[i] * fila[j]; } });
    for (var d = 0; d < p; d++) A[d][d] += lambda;
    for (var c = 0; c < p; c++) {   // eliminación de Gauss
      var piv = c; for (var r2 = c + 1; r2 < p; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[piv][c])) piv = r2;
      var t = A[c]; A[c] = A[piv]; A[piv] = t; var tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (var r3 = c + 1; r3 < p; r3++) { var f = A[r3][c] / A[c][c]; for (var j2 = c; j2 < p; j2++) A[r3][j2] -= f * A[c][j2]; b[r3] -= f * b[c]; }
    }
    var x = new Array(p).fill(0); for (var i2 = p - 1; i2 >= 0; i2--) { var s = b[i2]; for (var j3 = i2 + 1; j3 < p; j3++) s -= A[i2][j3] * x[j3]; x[i2] = s / A[i2][i2]; }
    return x;
  }
  function ajustar(casos, vars) {
    var filas = casos.map(function (c) { return { x: filaDe(c, vars), y: c.rindeKgHa }; }).filter(function (f) { return f.x; });
    var n = filas.length, media = vars.map(function (v, i) { return filas.reduce(function (s, f) { return s + f.x[i]; }, 0) / n; });
    var desvio = vars.map(function (v, i) { var s = Math.sqrt(filas.reduce(function (a, f) { return a + Math.pow(f.x[i] - media[i], 2); }, 0) / Math.max(1, n - 1)); return s > 0 ? s : 1; });
    var Z = function (fs) { return fs.map(function (f) { return f.x.map(function (v, i) { return (v - media[i]) / desvio[i]; }); }); };
    var fit = function (fs) { var ym = fs.reduce(function (s, f) { return s + f.y; }, 0) / fs.length; var beta = ridge(Z(fs), fs.map(function (f) { return f.y - ym; }), 1); return beta ? { b0: ym, beta: beta } : null; };
    var todo = fit(filas); if (!todo) return null;
    // prueba dejando cada caso afuera, contra predecir el promedio de los demás
    var e2 = 0, e2b = 0;
    filas.forEach(function (f, i) {
      var resto = filas.filter(function (x, j) { return j !== i; }), m = fit(resto); if (!m) return;
      var z = f.x.map(function (v, k) { return (v - media[k]) / desvio[k]; }), pred = m.b0 + z.reduce(function (s, v, k) { return s + v * m.beta[k]; }, 0);
      var prom = resto.reduce(function (s, x) { return s + x.y; }, 0) / resto.length;
      e2 += Math.pow(f.y - pred, 2); e2b += Math.pow(f.y - prom, 2);
    });
    var loo = Math.sqrt(e2 / n), base = Math.sqrt(e2b / n);
    return { n: n, variables: vars, media: media, desvio: desvio, b0: todo.b0, coef: todo.beta, errorLoo: loo, errorPromedio: base, mejora: base > 0 ? 1 - loo / base : 0,
      porUnidad: vars.map(function (v, i) { var u = unidadVar(v); return { variable: v, nombre: nombreVar(v), unidad: u[0], kg: todo.beta[i] / desvio[i] * u[1] }; }) };
  }

  // la cosecha suma en su región y en "todas las regiones"; sin región conocida, solo una vez (antes se contaba doble)
  function regionesDe(c) { return c._region ? [c._region, ''] : ['']; }
  function aprender(avisar) {
    avisar = avisar || function () {};
    if (!window.SafiaCasos) return Promise.reject(new Error('falta el módulo de casos'));
    var todos = SafiaCasos.armarCasos(), grano = todos.filter(function (c) { return c.rindeKgHa > 0 && c.cultivo && SafiaCasos.grupoFinalidad(c.cultivo, c.finalidad) === 'comercial'; });
    grano.forEach(function (c) { c._region = regionDe(c); });
    var P = { id: ID, fecha: new Date().toISOString(), casos: grano.length, ciclos: {}, propios: {}, secado: {}, madurez: {}, cierre: {}, meta: {}, modelos: {}, recomendaciones: {}, practicas: {}, faltan: {} };
    var sumar = function (tabla, k, extra) { var o = tabla[k] || (tabla[k] = { n: 0, suma: 0, valores: [] }); o.n++; o.suma += extra.v; o.valores.push(Math.round(extra.v)); Object.keys(extra).forEach(function (q) { if (q !== 'v') o[q] = extra[q]; }); };

    /* --- 1a. ciclo de cada variedad: real contra lo que estimaba SafiaCiclo --- */
    var conCiclo = grano.filter(function (c) { return c.variedad && c.siembra && c.cosecha && c.dias > 40 && c.dias < 250; }), cadena = Promise.resolve(), sinFicha = 0;
    conCiclo.forEach(function (c, i) {
      cadena = cadena.then(function () {
        avisar('Comparando ciclos reales (' + (i + 1) + ' de ' + conCiclo.length + ')…');
        if (!window.SafiaCiclo) return;
        return SafiaCiclo.estimar({ cultivo: c.cultivo, variedad: c.variedad, fechaSiembra: c.siembra, lat: c.lat, lon: c.lon, sinAprender: true }).then(function (r) {
          var mat = material(c.cultivo, c.variedad); if (SafiaCiclo.nombreAprendido) mat = SafiaCiclo.nombreAprendido(c.cultivo, mat, c.siembra);   // la soja de zafriña se aprende aparte
          if (!r || !r.dias) {   // sin ciclo publicado: lo que duró de verdad pasa a ser el ciclo propio del material
            sinFicha++;
            regionesDe(c).forEach(function (reg) { sumar(P.propios, clave(c.cultivo, mat, reg), { v: c.dias, cultivo: c.cultivo, variedad: mat, region: reg }); });
            return;
          }
          if (r.metodo === 'gdu') {   // maíz: los grados-día dan la madurez; lo que sigue hasta la cosecha es secado en la planta
            var sec = c.dias - r.dias; if (sec < 0 || sec > 90) return;   // fechas mal cargadas
            regionesDe(c).forEach(function (reg) {
              sumar(P.secado, cultivoK(c.cultivo) + '|' + (reg || ''), { v: sec, cultivo: c.cultivo, region: reg || '' });
              var m = P.madurez[clave(c.cultivo, r.material || mat, reg)] || (P.madurez[clave(c.cultivo, r.material || mat, reg)] = { n: 0, madurez: 0, real: 0, cultivo: c.cultivo, variedad: r.material || mat, region: reg || '', gdu: r.gdu });
              m.n++; m.madurez += r.dias; m.real += c.dias;
            });
            return;
          }
          var dif = c.dias - r.dias; if (Math.abs(dif) > 60) return;   // fechas mal cargadas
          regionesDe(c).forEach(function (reg) { sumar(P.ciclos, clave(c.cultivo, r.material || mat, reg), { v: dif, cultivo: c.cultivo, variedad: r.material || mat, region: reg, estimado: r.dias }); });
        }).catch(function () {});
      });
    });
    return cadena.then(function () {
      Object.keys(P.ciclos).forEach(function (k) { var o = P.ciclos[k]; o.ajuste = o.suma / (o.n + K); o.difMedia = o.suma / o.n; });
      Object.keys(P.propios).forEach(function (k) { var o = P.propios[k]; o.media = o.suma / o.n; });
      Object.keys(P.secado).forEach(function (k) { var o = P.secado[k]; o.media = o.suma / o.n; });
      Object.keys(P.madurez).forEach(function (k) { var o = P.madurez[k]; o.madurez /= o.n; o.real /= o.n; });
      P.faltan.cicloSinFicha = sinFicha;

      /* --- 1b. cierre del surco de la soja (NDVI 0,60) --- */
      avisar('Buscando el cierre del surco en el satélite…');
      var soja = grano.filter(function (c) { return cultivoK(c.cultivo) === 'soja' && c.equipoId != null && c.siembra; });
      var ids = soja.map(function (c) { return String(c.equipoId); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var sb = window.safiaSupabase;
      var traer = sb && ids.length ? Promise.resolve(sb.from('safia_ndvi').select('equipo_id,fecha,ndvi_media,nubes_pct').in('equipo_id', ids).order('fecha')).then(function (r) { return r && r.data ? r.data : []; }, function () { return []; }) : Promise.resolve([]);
      return traer.then(function (filas) {
        soja.forEach(function (c) {
          var fin = c.cosecha ? dia(c.cosecha) : null;
          var s = filas.filter(function (f) { return String(f.equipo_id) === String(c.equipoId) && dia(f.fecha) >= dia(c.siembra) && (!fin || dia(f.fecha) <= fin) && !(+f.nubes_pct > 40) && dias(c.siembra, f.fecha) >= 20; });
          var i = -1; for (var j = 0; j < s.length; j++) if (+s[j].ndvi_media >= NDVI_CIERRE) { i = j; break; }
          if (i < 0) return;
          var d1 = dias(c.siembra, s[i].fecha), d = d1;
          if (i > 0) { var a = s[i - 1], d0 = dias(c.siembra, a.fecha); if (d1 - d0 > 12) return; d = d0 + (NDVI_CIERRE - +a.ndvi_media) / (+s[i].ndvi_media - +a.ndvi_media) * (d1 - d0); }   // entre dos pasadas: se interpola
          else if (d1 > 30) return;   // la primera pasada ya estaba cerrada y es tardía: no se sabe cuándo cerró
          regionesDe(c).forEach(function (reg) {
            sumar(P.cierre, clave('soja', c.variedad, reg), { v: d, cultivo: 'soja', variedad: c.variedad || '', region: reg });
            sumar(P.cierre, clave('soja', '', reg), { v: d, cultivo: 'soja', variedad: '', region: reg });
          });
        });
        Object.keys(P.cierre).forEach(function (k) { var o = P.cierre[k]; o.valor = (o.suma + K * DIAS_CIERRE_BASE) / (o.n + K); o.media = o.suma / o.n; });

        /* --- 1c. rango de la meta: cosecha real contra el centro del rango anunciado --- */
        avisar('Comparando la meta con lo cosechado…');
        var camps = lista('campanas'), eqs = lista('equipos'), campos = lista('campos');
        camps.forEach(function (camp) {
          (camp.cultivos || []).forEach(function (cu) {
            var real = num(cu.rendimientoReal), b = (cu.bitacora || []).filter(function (r) { return r.sabe !== false && (r.min0 || r.min) && (r.max0 || r.max); });
            if (!real || !b.length) return;
            var cocs = b.map(function (r) { return real / (((r.min0 || r.min) + (r.max0 || r.max)) / 2); }), coc = cocs.reduce(function (s, x) { return s + x; }, 0) / cocs.length;
            var eq = eqs.filter(function (e) { return String(e.id) === String(camp.equipoId); })[0], cp = eq ? campos.filter(function (x) { return String(x.id) === String(eq.campoId); })[0] : null;
            var reg = cp ? regionDe({ departamento: cp.departamento, lat: cp.latitud, lon: cp.longitud }) : null;
            [reg, ''].forEach(function (rg) { var k = cultivoK(cu.cultivo) + '|' + (rg || ''); sumar(P.meta, k, { v: coc, cultivo: cu.cultivo, region: rg || '' }); });
          });
        });
        Object.keys(P.meta).forEach(function (k) { var o = P.meta[k]; o.factor = (o.suma + K) / (o.n + K); o.media = o.suma / o.n; });

        /* --- 2. modelo de rinde por cultivo y riego --- */
        avisar('Armando el modelo de rinde…');
        ['soja', 'maiz', 'trigo'].forEach(function (cu) { ['riego', 'secano'].forEach(function (rg) {
          var g = grano.filter(function (c) { return cultivoK(c.cultivo) === cu && (rg === 'riego') === (c.riego !== false); }), k = cu + '|' + rg;
          if (!g.length) return;
          var vars = VARS.filter(function (v) { return g.filter(function (c) { return valorDe(c, v) != null; }).length >= g.length * 0.8; });
          var util = g.filter(function (c) { return filaDe(c, vars); }).length, necesita = Math.max(MIN.modelo, 5 * Math.max(1, vars.length));
          if (!vars.length || util < necesita) { P.modelos[k] = { ok: false, n: util, necesita: necesita, variables: vars, motivo: !vars.length ? 'faltan datos de agua, fecha de siembra o suelo en la mayoría de los casos' : 'hacen falta ' + necesita + ' cosechas con esos datos y hay ' + util }; return; }
          var M = ajustar(g, vars);
          if (!M) { P.modelos[k] = { ok: false, n: util, necesita: necesita, variables: vars, motivo: 'los datos no alcanzan para separar el efecto de cada variable' }; return; }
          M.ok = M.mejora > 0.1; if (!M.ok) M.motivo = 'probado caso por caso, no acierta mejor que el promedio del grupo (todavía): hacen falta más cosechas y más variadas';
          P.modelos[k] = M;
        }); });

        /* --- 3. recomendaciones y prácticas: con contra sin --- */
        avisar('Comparando lo recomendado con lo cosechado…');
        camps.forEach(function (camp) {
          (camp.cultivos || []).forEach(function (cu) {
            var real = num(cu.rendimientoReal), plan = cu.planMeta, meta = plan && num(plan.kgHa);
            if (!real || !meta || !(plan.items || []).length) return;
            plan.items.forEach(function (it) {
              var k = cultivoK(cu.cultivo) + '|' + it.k, o = P.recomendaciones[k] || (P.recomendaciones[k] = { nombre: it.nombre, con: [], sin: [] });
              (it.hecho ? o.con : o.sin).push(real / meta);
            });
          });
        });
        // prácticas de manejo: rinde contra el promedio de su grupo (mismo cultivo, región y riego), solo con el manejo cargado
        var grupos = {}; grano.forEach(function (c) { var k = cultivoK(c.cultivo) + '|' + (c._region || '') + '|' + (c.riego !== false); (grupos[k] = grupos[k] || []).push(c.rindeKgHa); });
        if (window.SafiaInsumos) grano.forEach(function (c) {
          if (!c.manejo || !c.manejo.cargado) return;
          var g = grupos[cultivoK(c.cultivo) + '|' + (c._region || '') + '|' + (c.riego !== false)]; if (!g || g.length < 3) return;
          var prom = g.reduce(function (s, x) { return s + x; }, 0) / g.length;
          SafiaInsumos.PRACTICAS.forEach(function (p) { var k = cultivoK(c.cultivo) + '|' + p.k, o = P.practicas[k] || (P.practicas[k] = { nombre: p.n, con: [], sin: [] }); (SafiaInsumos.tiene(c.manejo, p.k) ? o.con : o.sin).push(c.rindeKgHa / prom); });
        });
        [P.recomendaciones, P.practicas].forEach(function (T) { Object.keys(T).forEach(function (k) { var o = T[k], m = function (l) { return l.length ? l.reduce(function (s, x) { return s + x; }, 0) / l.length : null; }; o.nCon = o.con.length; o.nSin = o.sin.length; o.mediaCon = m(o.con); o.mediaSin = m(o.sin); delete o.con; delete o.sin; }); });
        P.resumen = { soja: grano.filter(function (c) { return cultivoK(c.cultivo) === 'soja'; }).length, maiz: grano.filter(function (c) { return cultivoK(c.cultivo) === 'maiz'; }).length, conBitacora: Object.keys(P.meta).length };
        return P;
      });
    });
  }
  function publicar(P) { var otros = lista('aprendizaje').filter(function (x) { return x && x.id && x.id !== ID; }); localStorage.setItem('aprendizaje', JSON.stringify(otros.concat([P]))); return P; }   // conserva lab_formatos y lo que venga

  /* ================= PANTALLA ================= */
  function esIrrigar() { try { var u = (window.SafiaSync && SafiaSync.usuario && SafiaSync.usuario()) || JSON.parse(localStorage.getItem('safia_usuario') || 'null'); return !!u && (u.rol === 'propietario' || u.rol === 'admin'); } catch (e) { return false; } }
  function regNombre(r) { return r === 'occidental' ? 'Chaco' : r === 'oriental' ? 'Oriental' : 'todas las regiones'; }
  function tarjeta(titulo, sub, cuerpo) { return '<div class="card" style="margin-bottom:14px;"><div class="card-h"><h3>' + titulo + '</h3><span class="muted">' + sub + '</span></div>' + cuerpo + '</div>'; }
  function tabla(cab, filas) { return '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr>' + cab.map(function (c, i) { return '<th' + (i ? ' class="r"' : '') + '>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + filas.join('') + '</tbody></table></div></div>'; }
  function vacio(t) { return '<div class="muted" style="font-size:13px;line-height:1.5;padding:6px 0;">' + t + '</div>'; }
  function html(P) {
    if (!P) return tarjeta('Todavía no aprendió nada', '', vacio(esIrrigar() ? 'Tocá <b>Aprender con todas las cosechas</b>: SAFIA recorre el banco y publica lo aprendido para todos.' : 'Irrigar todavía no corrió el aprendizaje.'));
    var h = '<div class="muted" style="font-size:12.5px;margin-bottom:10px;">Aprendido el ' + new Date(P.fecha).toLocaleDateString('es-PY') + ' con ' + P.casos + ' cosechas de grano del banco (' + P.resumen.soja + ' de soja, ' + P.resumen.maiz + ' de maíz). Los nombres de los clientes no se guardan.</div>';
    // nivel 1
    // la fila 'todas las regiones' solo si suma cosechas de más de una región (si no, repite la misma fila)
    var sinRepetir = function (lista) { return lista.filter(function (o) { return o.region || !lista.some(function (x) { return x !== o && x.region && x.cultivo === o.cultivo && x.variedad === o.variedad && x.n === o.n; }); }); };
    var cic = sinRepetir(Object.keys(P.ciclos).map(function (k) { return P.ciclos[k]; }).filter(function (o) { return o.variedad; })).sort(function (a, b) { return b.n - a.n; });
    var n1 = cic.length ? tabla(['Material y región', 'Estimado', 'Real (promedio)', 'Cosechas', 'SAFIA corrige'], cic.slice(0, 30).map(function (o) { return '<tr><td><b>' + esc(o.variedad) + '</b> <span class="muted">· ' + esc(o.cultivo) + ' · ' + regNombre(o.region) + '</span></td><td class="r">' + fmt(o.estimado) + ' días</td><td class="r">' + fmt(o.estimado + o.difMedia) + ' días</td><td class="r">' + o.n + '</td><td class="r"><b>' + (o.n >= MIN.ciclo ? (o.ajuste >= 0 ? '+' : '') + fmt(o.ajuste) + ' días' : 'todavía no') + '</b></td></tr>'; }))
      : vacio('Ninguna cosecha tiene variedad, fecha de siembra y de cosecha, y ficha del material para comparar.');
    var mad = sinRepetir(Object.keys(P.madurez || {}).map(function (k) { return P.madurez[k]; })).sort(function (a, b) { return b.n - a.n; });
    var sec = Object.keys(P.secado || {}).map(function (k) { return P.secado[k]; }).filter(function (o) { return o.region || !Object.keys(P.secado).some(function (k) { return P.secado[k].region && P.secado[k].n === o.n; }); });
    var n1m = mad.length ? '<div style="font-weight:700;margin:4px 0;">Maíz: madurez por grados-día y secado en la planta</div>' + tabla(['Material y región', 'Madurez (grados-día)', 'Cosecha real', 'Secado en la planta', 'Cosechas'], mad.slice(0, 30).map(function (o) { return '<tr><td><b>' + esc(o.variedad) + '</b> <span class="muted">· ' + regNombre(o.region) + '</span></td><td class="r">' + fmt(o.madurez) + ' días</td><td class="r">' + fmt(o.real) + ' días</td><td class="r"><b>' + fmt(o.real - o.madurez) + ' días</b></td><td class="r">' + o.n + '</td></tr>'; })) +
      '<div class="muted" style="font-size:12px;margin:4px 0 12px;line-height:1.45;">Los grados-día del obtentor marcan la <b>madurez fisiológica</b> (el grano ya no engorda), no la cosecha. Embrapa: se puede cosechar desde ahí, pero normalmente se espera a que el grano baje a 18–20 % de humedad, según secadora, riesgo y precio; cuántos días tarda no está publicado. ' +
      (sec.length ? 'SAFIA usa el secado de las cosechas propias: ' + sec.map(function (o) { return '<b>' + fmt(o.media) + ' días</b> en ' + (o.region ? 'la región ' + regNombre(o.region) : 'todas las regiones') + ' (' + o.n + (o.n === 1 ? ' cosecha' : ' cosechas') + (o.n > 1 ? ', de ' + fmt(Math.min.apply(null, o.valores)) + ' a ' + fmt(Math.max.apply(null, o.valores)) : '') + ')'; }).join(' · ') + '. La fecha de cosecha de Campañas y Ficha es madurez + secado.' : '') + '</div>' : '';
    var pro = sinRepetir(Object.keys(P.propios || {}).map(function (k) { return P.propios[k]; }).filter(function (o) { return o.variedad; })).sort(function (a, b) { return b.n - a.n; });
    var n1p = pro.length ? '<div style="font-weight:700;margin:4px 0;">Materiales sin ciclo publicado: ciclo propio</div>' + tabla(['Material y región', 'Cosechas', 'Rango real', 'SAFIA usa'], pro.slice(0, 30).map(function (o) { return '<tr><td><b>' + esc(String(o.variedad).replace(/\s*\(=[^)]*\)/, '')) + '</b> <span class="muted">· ' + esc(o.cultivo) + ' · ' + regNombre(o.region) + '</span></td><td class="r">' + o.n + '</td><td class="r">' + (o.n > 1 ? fmt(Math.min.apply(null, o.valores)) + '–' + fmt(Math.max.apply(null, o.valores)) + ' días' : '—') + '</td><td class="r"><b>' + fmt(o.media) + ' días</b></td></tr>'; })) +
      '<div class="muted" style="font-size:12px;margin:4px 0 12px;">El obtentor no publica los días ni los grados-día de estos materiales: para la fecha de fin de ciclo de Campañas y Ficha, SAFIA usa lo que duraron en las cosechas del banco y dice con cuántas. Con una sola cosecha es un primer dato.</div>' : '';
    var cie = Object.keys(P.cierre).map(function (k) { return P.cierre[k]; }).sort(function (a, b) { return b.n - a.n; });
    var n1b = cie.length ? tabla(['Soja', 'Campañas', 'Cerró en promedio', 'SAFIA usa'], cie.slice(0, 12).map(function (o) { return '<tr><td>' + (o.variedad ? '<b>' + esc(o.variedad) + '</b>' : 'todas las variedades') + ' <span class="muted">· ' + regNombre(o.region) + '</span></td><td class="r">' + o.n + '</td><td class="r">día ' + fmt(o.media) + '</td><td class="r"><b>' + (o.n >= MIN.cierre ? 'día ' + fmt(o.valor) : 'todavía día 30') + '</b></td></tr>'; }))
      : vacio('Ninguna campaña de soja cerrada tiene pasadas del satélite que muestren el cierre del surco.');
    var met = Object.keys(P.meta).map(function (k) { return P.meta[k]; });
    var n1c = met.length ? tabla(['Cultivo y región', 'Campañas', 'Cosechado / anunciado', 'Factor que usa'], met.map(function (o) { return '<tr><td>' + esc(o.cultivo) + ' <span class="muted">· ' + regNombre(o.region) + '</span></td><td class="r">' + o.n + '</td><td class="r">' + fmt(o.media * 100) + ' %</td><td class="r"><b>' + (o.n >= MIN.meta ? '× ' + fmt(o.factor, 2) : 'todavía no') + '</b></td></tr>'; }))
      : vacio('Todavía no hay campañas cosechadas con la bitácora de pronósticos (empezó el 4 de octubre de 2026).');
    h += tarjeta('Nivel 1 · Números de partida corregidos', 'SAFIA empieza con Embrapa y la ficha del material, y los corrige con las cosechas',
      '<div style="font-weight:700;margin:4px 0;">Ciclo de cada material (siembra a cosecha)</div>' + n1 + '<div class="muted" style="font-size:12px;margin:4px 0 12px;">Con ' + MIN.ciclo + ' cosechas o más, la fecha de fin de ciclo de Campañas y Ficha suma la corrección. Con pocas cosechas se mueve poco: la corrección es la suma de diferencias dividida por las cosechas más 3.' + (P.faltan.cicloSinFicha && !pro.length ? ' ' + P.faltan.cicloSinFicha + ' cosechas no se pudieron comparar porque el material no tiene ficha en SAFIA.' : '') + '</div>' + n1m + n1p +
      '<div style="font-weight:700;margin:4px 0;">Cierre del surco de la soja (satélite, NDVI 0,60)</div>' + n1b + '<div class="muted" style="font-size:12px;margin:4px 0 12px;">La tarjeta de la roya usa este día cuando no hay una imagen reciente del satélite, en vez del día 30 fijo.</div>' +
      '<div style="font-weight:700;margin:4px 0;">Rango alcanzable de la meta</div>' + n1c + '<div class="muted" style="font-size:12px;margin-top:4px;">Con ' + MIN.meta + ' campañas o más, la meta viva multiplica su rango por este factor.</div>');
    // nivel 2
    var mods = Object.keys(P.modelos).map(function (k) { var M = P.modelos[k]; M._k = k; return M; });
    var n2 = mods.length ? mods.map(function (M) {
      var t = M._k.split('|'), tit = (t[0] === 'maiz' ? 'Maíz' : t[0] === 'soja' ? 'Soja' : 'Trigo') + (t[1] === 'riego' ? ' con riego' : ' en secano');
      if (!M.ok) return '<div style="padding:7px 0;border-top:1px solid #F0F2F4;font-size:13.5px;"><b>' + tit + '</b>: todavía no. ' + esc(M.motivo || '') + '.</div>';
      return '<div style="padding:7px 0;border-top:1px solid #F0F2F4;font-size:13.5px;"><b>' + tit + '</b>: ' + M.n + ' cosechas. Acierta con un error de ±' + fmt(M.errorLoo) + ' kg/ha (el promedio del grupo erraba ±' + fmt(M.errorPromedio) + ').<div class="muted" style="font-size:12.5px;margin-top:3px;">Qué pesa: ' + M.porUnidad.map(function (u) { return esc(u.nombre) + ' ' + (u.kg >= 0 ? '+' : '') + fmt(u.kg) + ' kg/ha ' + esc(u.unidad); }).join(' · ') + '</div></div>';
    }).join('') : vacio('No hay cosechas de grano para armar un modelo.');
    h += tarjeta('Nivel 2 · Modelo de rinde', 'cuánto pesa el agua, la fecha de siembra y el suelo en el rinde, por cultivo y riego',
      n2 + '<div class="muted" style="font-size:12px;margin-top:6px;line-height:1.45;">Se arma solo con ' + MIN.modelo + ' cosechas o más (y 5 por cada variable), separado por cultivo y por riego o secano. Se prueba dejando cada cosecha afuera: si no acierta mejor que el promedio, no se usa. Es una relación en los datos del banco, no una ley agronómica.</div>');
    // nivel 3
    var fila3 = function (o) { var ok = o.nCon >= MIN.rec && o.nSin >= MIN.rec, dif = ok ? (o.mediaCon - o.mediaSin) * 100 : null; return '<tr><td>' + esc(o.nombre) + '</td><td class="r">' + o.nCon + ' / ' + o.nSin + '</td><td class="r">' + (o.mediaCon != null ? fmt(o.mediaCon * 100) + ' %' : '—') + '</td><td class="r">' + (o.mediaSin != null ? fmt(o.mediaSin * 100) + ' %' : '—') + '</td><td class="r"><b>' + (ok ? (dif >= 0 ? '+' : '') + fmt(dif) + ' puntos' : 'faltan casos') + '</b></td></tr>'; };
    var recs = Object.keys(P.recomendaciones).map(function (k) { return P.recomendaciones[k]; }), prac = Object.keys(P.practicas).map(function (k) { var o = P.practicas[k]; o._c = k.split('|')[0]; return o; }).filter(function (o) { return o.nCon + o.nSin > 0; });
    h += tarjeta('Nivel 3 · Recomendaciones que aprenden', 'lo que rindieron las campañas que hicieron cada cosa contra las que no',
      '<div style="font-weight:700;margin:4px 0;">Ítems del plan de la meta (rinde / meta)</div>' + (recs.length ? tabla(['Ítem', 'Hecho / no', 'Con', 'Sin', 'Diferencia'], recs.map(fila3)) : vacio('Todavía no hay campañas cosechadas con plan de meta.')) +
      '<div style="font-weight:700;margin:12px 0 4px;">Prácticas de manejo (rinde / promedio de su grupo)</div>' + (prac.length ? tabla(['Práctica', 'Con / sin', 'Con', 'Sin', 'Diferencia'], prac.map(function (o) { o.nombre = o.nombre + ' (' + o._c + ')'; return o; }).map(fila3)) : vacio('Todavía no hay cosechas con el manejo cargado completo.')) +
      '<div class="muted" style="font-size:12px;margin-top:6px;line-height:1.45;">Hace falta ' + MIN.rec + ' campañas con y ' + MIN.rec + ' sin. Es una asociación, no una prueba de causa: el que hizo una práctica puede haber hecho también otras cosas distintas. La prescripción la define el ingeniero agrónomo.</div>');
    return h;
  }
  function montar(cont) {
    var pintar = function () { cont.querySelector('#aprCuerpo').innerHTML = html(datos()); };
    cont.innerHTML = (esIrrigar() ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;"><button class="btn green" id="aprCorrer">Aprender con todas las cosechas</button><span class="muted" id="aprEstado" style="font-size:12.5px;"></span></div>' : '') + '<div id="aprCuerpo"></div><div id="aprLabs"></div>';
    pintar();
    if (window.SafiaLabFormatos) SafiaLabFormatos.montar(cont.querySelector('#aprLabs'));
    var b = cont.querySelector('#aprCorrer'); if (!b) return;
    var correr = function () {
      b.disabled = true; var est = cont.querySelector('#aprEstado');
      aprender(function (t) { est.textContent = t; }).then(function (P) { publicar(P); est.textContent = 'Listo: lo aprendido ya lo usan los motores de todos los usuarios.'; pintar(); }, function (e) { est.textContent = 'No se pudo: ' + ((e && e.message) || 'error'); }).then(function () { b.disabled = false; });
    };
    b.addEventListener('click', correr);
    var P = datos(); if (!P || Date.now() - new Date(P.fecha).getTime() > 7 * 86400000) correr();   // una vez por semana se vuelve a aprender solo
  }
  // para el Asistente: lo aprendido que toca a una campaña
  function paraCampana(cu, campo, equipo) {
    if (!cu) return null;
    var reg = campo ? regionDe({ departamento: campo.departamento, lat: campo.latitud, lon: campo.longitud }) : null, o = {};
    var vAp = window.SafiaCiclo && SafiaCiclo.nombreAprendido ? SafiaCiclo.nombreAprendido(cu.cultivo, cu.variedad, cu.fechaSiembra) : cu.variedad;
    var c = ajusteCiclo({ cultivo: cu.cultivo, variedad: vAp, region: reg }); if (c) o.ciclo = 'el ciclo de ' + cu.variedad + ' sale ' + (c.dias >= 0 ? c.dias + ' días más largo' : -c.dias + ' días más corto') + ' que lo estimado, según ' + c.n + ' cosechas propias';
    var cp = !c ? cicloPropio({ cultivo: cu.cultivo, variedad: vAp, region: reg }) : null; if (cp) o.ciclo = cu.variedad + ' no tiene ciclo publicado por el obtentor: en las cosechas de SAFIA duró ' + cp.dias + ' días de siembra a cosecha (' + cp.n + (cp.n === 1 ? ' cosecha' : ' cosechas') + ')';
    if (cultivoK(cu.cultivo) === 'maiz') { var sc = secado({ cultivo: cu.cultivo, region: reg }); if (sc) o.secado_del_maiz = 'después de la madurez fisiológica, el maíz quedó en promedio ' + sc.dias + ' días secándose en la planta hasta la cosecha (' + sc.n + (sc.n === 1 ? ' cosecha' : ' cosechas') + ' de SAFIA); la fecha de cosecha estimada ya lo suma'; }
    if (cultivoK(cu.cultivo) === 'soja') { var d = diasCierre('soja', cu.variedad, reg); if (d) o.cierre_del_surco = 'cierra cerca del día ' + d.dias + ' según ' + d.n + ' campañas propias'; }
    var f = factorMeta(cu.cultivo, reg); if (f) o.rango_de_la_meta = 'se cosechó en promedio el ' + Math.round((f.f) * 100) + ' % del centro del rango que anunciaba la meta (' + f.n + ' campañas): el rango se ajusta por eso';
    return Object.keys(o).length ? o : null;
  }
  window.SafiaAprende = { aprender: aprender, publicar: publicar, datos: datos, ajusteCiclo: ajusteCiclo, cicloPropio: cicloPropio, secado: secado, diasCierre: diasCierre, factorMeta: factorMeta, predecir: predecir, evidencia: evidencia, montar: montar, html: html, paraCampana: paraCampana, ridge: ridge, ajustar: ajustar, MIN: MIN };
})();
