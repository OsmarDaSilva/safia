/* SAFIA — Ciclo del cultivo: cuánto dura y cuándo termina (fecha estimada de cosecha)
   -------------------------------------------------------------------
   Con la variedad o el híbrido y la fecha de siembra, SAFIA propone la fecha de fin de ciclo para que el humano
   intervenga lo mínimo posible (pedido de Osmar, 30-sep-2026). Siempre dice de dónde sale el número:
   1. Ciclo publicado por el obtentor o un distribuidor para ese material (días), de safia-materiales.js.
   2. Soja sin ciclo publicado pero con grupo de madurez (GM): promedio de los materiales del catálogo con GM parecido
      que sí tienen ciclo publicado. Es una estimación y se dice.
   3. Maíz con grados-día a madurez fisiológica publicados (GDU): se suman los grados-día con las temperaturas de
      10 años del lugar (Open-Meteo, reanálisis ERA5). Fórmula de Embrapa Milho e Sorgo (Sistemas de
      Produção 2, "Plantio"): GDU del día = (Tmáx + Tmín)/2 − 10, con Tmáx tope 30 °C y Tmín piso 10 °C.
      https://ainfo.cnptia.embrapa.br/digital/bitstream/item/27037/1/Plantio.pdf
      Eso es la MADUREZ FISIOLÓGICA. Para la fecha de cosecha se suman los días de secado en la planta que aprendió
      SafiaAprende de las cosechas de maíz de la región (Embrapa no publica cuánto tarda: depende del clima y de la secadora).
   Soja en zafriña (siembra de enero a abril): el fotoperíodo corto acorta el ciclo (Embrapa Soja: "quanto mais tardia
      a semeadura, menor o ciclo"; Vaz Bisneta et al., Embrapa Soja/UFG 2012, épocas de semeadura en Goiás). Embrapa no
      publica cuántos días para Paraguay: hasta tener cosechas propias de zafriña se usa la referencia de campo de Irrigar
      (Osmar, 5-oct-2026): soja sembrada del 15/01 al 15/02 se cosecha entre 100 y 115 días como máximo. Las cosechas de
      zafriña se aprenden aparte ("· zafriña" en el nombre): verano y zafriña no se mezclan.
   4. Material sin nada de lo anterior: el ciclo propio que aprendió SafiaAprende (días reales de siembra a cosecha en
      las cosechas del banco), diciendo con cuántas cosechas.
   Lo que no se puede estimar con fuente ni con cosechas propias queda vacío: nunca se inventa un ciclo.
   Uso: SafiaCiclo.estimar({ cultivo, variedad, fechaSiembra, lat, lon }) → Promise<{ dias, fechaFin, metodo, texto, fuente } | null>
        SafiaCiclo.fichaMaterial(cultivo, variedad) → texto corto para mostrar debajo de la variedad */
(function () {
  'use strict';
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d }); }
  function cultivoClave(c) { var n = String(c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return n.indexOf('soj') === 0 ? 'soja' : (n.indexOf('maiz') === 0 ? 'maiz' : n.split(/[\s(\/]/)[0]); }
  function sumarDias(iso, n) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + Math.round(n)); return d.toISOString().slice(0, 10); }
  function fmtF(iso) { var p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  // Soja en zafriña: siembra de enero a abril (la misma época 'Verano/Otoño' de SafiaCasos); se aprende aparte
  var ZAFRINA_SOJA = { min: 100, max: 115, n: 'referencia de campo de Irrigar: soja sembrada del 15/01 al 15/02 se cosecha entre 100 y 115 días como máximo', url: 'https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/929362/1/309s206.pdf' };
  function zafrina(cultivo, fecha) { var m = parseInt(String(fecha || '').slice(5, 7), 10); return cultivoClave(cultivo) === 'soja' && m >= 1 && m <= 4; }
  function nombreAprendido(cultivo, nombre, fecha) { return zafrina(cultivo, fecha) ? nombre + ' · zafriña' : nombre; }
  var EMBRAPA_GDU = { n: 'Embrapa Milho e Sorgo, Sistemas de Produção 2 (Plantio): grados-día con 30 °C y 10 °C como temperaturas de referencia', url: 'https://ainfo.cnptia.embrapa.br/digital/bitstream/item/27037/1/Plantio.pdf' };

  // Nombre corto de la fuente: el dominio de la página o el catálogo PDF (url 'catalogo:archivo.pdf#page=N')
  function fuenteCorta(url) {
    url = String(url || ''); if (!url) return '';
    if (url.indexOf('catalogo:') === 0) { var m = url.slice(9).match(/^([^#]+)(?:#page=(\d+))?/); return 'catálogo ' + (m ? m[1].replace(/[_-]+/g, ' ').replace(/\.pdf$/i, '') + (m[2] ? ', pág. ' + m[2] : '') : url.slice(9)); }
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
  // 'Paraguay (Bayer Paraguay)' → ' (Paraguay, Bayer Paraguay)': sin paréntesis anidados
  function regionTxt(r) { r = String(r || '').trim(); if (!r) return ''; return ' (' + r.replace(/\s*\(([^)]*)\)/g, ', $1').replace(/\)/g, '') + ')'; }
  function material(cultivo, variedad) { return window.SafiaMateriales && variedad ? window.SafiaMateriales.buscar(cultivo, variedad) : null; }

  /* ---------- 1) ciclo publicado ---------- */
  function publicado(d) {
    if (!d || !(num(d.cicloDias) > 0)) return null;
    return { dias: Math.round(num(d.cicloDias)), metodo: 'publicado', confianza: 'alta',
      texto: 'ciclo publicado' + (d.cicloTexto ? ': ' + d.cicloTexto : ': ' + Math.round(num(d.cicloDias)) + ' días') + regionTxt(d.cicloRegion),
      fuente: { n: (d.nivel === 'obtentor' ? 'el obtentor' : d.nivel === 'distribuidor' ? 'un distribuidor' : d.nivel || 'fuente') + (d.url ? ': ' + fuenteCorta(d.url) : ''), url: d.url || '' } };
  }

  /* ---------- 2) soja: por grupo de madurez, con los materiales que sí tienen ciclo publicado ---------- */
  function porGM(d) {
    if (!d || d.gm == null || !window.SafiaMateriales || !window.SafiaMateriales.todos) return null;
    var todos = window.SafiaMateriales.todos('soja').filter(function (m) { return m.gm != null && num(m.cicloDias) > 0; });
    if (todos.length < 3) return null;
    var cerca = todos.filter(function (m) { return Math.abs(m.gm - d.gm) <= 0.3; });
    var usados = cerca.length >= 3 ? cerca : todos, dias;
    if (cerca.length >= 3) dias = usados.reduce(function (s, m) { return s + num(m.cicloDias); }, 0) / usados.length;
    else {
      // recta días = a + b·GM con todos los materiales que tienen ambos datos
      var n = usados.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      usados.forEach(function (m) { var x = m.gm, y = num(m.cicloDias); sx += x; sy += y; sxx += x * x; sxy += x * y; });
      var b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
      dias = a + b * d.gm;
    }
    if (!(dias > 60 && dias < 200)) return null;
    return { dias: Math.round(dias), metodo: 'gm', confianza: 'media',
      texto: 'estimado por el grupo de madurez (GM ' + fmt(d.gm, 1) + '): ' + (cerca.length >= 3 ? 'promedio de ' + cerca.length + ' materiales de GM ' + fmt(d.gm - 0.3, 1) + ' a ' + fmt(d.gm + 0.3, 1) + ' con ciclo publicado' : 'tendencia de ' + usados.length + ' materiales con ciclo publicado'),
      fuente: { n: 'catálogo de materiales de SAFIA (cada uno con su fuente)', url: '' } };
  }

  /* ---------- 3) maíz: grados-día a madurez fisiológica con el clima del lugar ---------- */
  function gduDia(tmax, tmin) { if (tmax == null || tmin == null) return null; var mx = Math.min(30, tmax), mn = Math.max(10, tmin); return Math.max(0, (mx + mn) / 2 - 10); }
  // Temperaturas diarias de los últimos 10 años completos del lugar (Open-Meteo, reanálisis ERA5); se guardan en la sesión
  var _temp = {};
  function temperaturas10(lat, lon) {
    var hasta = new Date().getFullYear() - 1, desde = hasta - 9, k = Number(lat).toFixed(3) + ',' + Number(lon).toFixed(3) + ',' + desde;
    if (_temp[k]) return _temp[k];
    try { var g = sessionStorage.getItem('gdu10_' + k); if (g) { _temp[k] = Promise.resolve(JSON.parse(g)); return _temp[k]; } } catch (e) {}
    var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + desde + '-01-01&end_date=' + hasta + '-12-31&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FAsuncion';
    _temp[k] = fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var d = j && j.daily; if (!d || !d.time) throw new Error('sin datos');
      var h = { desde: desde, hasta: hasta, time: d.time, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min };
      try { sessionStorage.setItem('gdu10_' + k, JSON.stringify(h)); } catch (e) {}
      return h;
    });
    _temp[k].catch(function () { delete _temp[k]; });
    return _temp[k];
  }
  function porGDU(d, fechaSiembra, lat, lon) {
    if (!d || !(num(d.gduMad) > 0) || lat == null || lon == null || !fechaSiembra) return Promise.resolve(null);
    if (num(d.gduBase) != null && Math.abs(num(d.gduBase) - 10) > 0.01) return Promise.resolve(null);   // otra base térmica (Pioneer Argentina usa 8 °C): no se suma con la fórmula de 10 °C
    return temperaturas10(lat, lon).then(function (h) {
      if (!h || !h.time || !h.tmax || !h.tmin) return null;
      var suma = {}, cuenta = {};
      h.time.forEach(function (t, i) { var k = String(t).slice(5, 10), g = gduDia(h.tmax[i], h.tmin[i]); if (g == null) return; suma[k] = (suma[k] || 0) + g; cuenta[k] = (cuenta[k] || 0) + 1; });
      var meta = num(d.gduMad), base = num(d.gduBase) || 10, acum = 0, dia = new Date(String(fechaSiembra).slice(0, 10) + 'T12:00:00'), n = 0;
      while (acum < meta && n < 320) {
        var k = dia.toISOString().slice(5, 10); if (k === '02-29') k = '02-28';
        if (!cuenta[k]) return null;
        acum += suma[k] / cuenta[k]; dia.setDate(dia.getDate() + 1); n++;
      }
      if (acum < meta) return null;
      return { dias: n, metodo: 'gdu', confianza: 'media', gdu: meta,
        texto: 'madurez fisiológica estimada: ' + fmt(meta, 0) + ' grados-día (base ' + fmt(base, 0) + ' °C) sumados desde la siembra con las temperaturas de ' + h.desde + '–' + h.hasta + ' del lugar',
        fuente: { n: 'GDU del material: ' + (d.url ? fuenteCorta(d.url) : 'ficha') + ' · fórmula: ' + EMBRAPA_GDU.n + ' · temperaturas: Open-Meteo (ERA5)', url: EMBRAPA_GDU.url },
        nota: 'La cosecha viene después, cuando el grano seca en la planta.' };
    }).catch(function () { return null; });
  }

  /* ---------- 4) ciclo propio: lo que duró el material en las cosechas del banco ---------- */
  function propio(o, d) {
    if (o.sinAprender || !window.SafiaAprende || !SafiaAprende.cicloPropio) return null;   // al aprender no se usa lo ya aprendido
    var r = SafiaAprende.cicloPropio({ cultivo: o.cultivo, variedad: nombreAprendido(o.cultivo, d && d.nombre ? d.nombre : o.variedad, o.fechaSiembra), lat: o.lat, lon: o.lon }); if (!r) return null;
    return { dias: r.dias, metodo: 'propio', confianza: r.n >= 3 ? 'media' : 'baja', propio: r,
      texto: 'ciclo propio: lo que duró en ' + r.n + (r.n === 1 ? ' cosecha' : ' cosechas') + ' de SAFIA, de siembra a cosecha' + (r.n > 1 ? ' (' + r.min + ' a ' + r.max + ' días)' : '') + '; el obtentor no publica los días',
      fuente: { n: 'Lo que SAFIA aprendió (cosechas del banco)', url: '' } };
  }

  // maíz: madurez fisiológica + días de secado en la planta aprendidos de las cosechas propias = fecha de cosecha
  function conSecado(r, o) {
    if (!r || r.metodo !== 'gdu') return r;
    r.diasMadurez = r.dias;
    var sc = !o.sinAprender && window.SafiaAprende && SafiaAprende.secado ? SafiaAprende.secado({ cultivo: o.cultivo, lat: o.lat, lon: o.lon }) : null;
    if (!sc) { r.nota = 'Es la madurez fisiológica: la cosecha viene después, cuando el grano baja a 18–20 % de humedad (Embrapa). SAFIA va a sumar el secado cuando haya cosechas de maíz de la zona.'; return r; }
    r.secado = sc; r.dias += sc.dias;
    r.texto = 'madurez fisiológica a los ' + r.diasMadurez + ' días (' + r.texto.replace(/^madurez fisiológica estimada: /, '') + ') + ' + sc.dias + ' días de secado en la planta hasta la cosecha, promedio de ' + sc.n + (sc.n === 1 ? ' cosecha' : ' cosechas') + ' de maíz de SAFIA';
    r.nota = ''; return r;
  }

  function estimar(o) {
    o = o || {}; var cu = cultivoClave(o.cultivo), d = material(o.cultivo, o.variedad);
    if (!o.fechaSiembra || !o.variedad) return Promise.resolve(null);
    var p = publicado(d);
    var fin = function (r) {
      if (!r) r = propio(o, d);
      if (!r) return null;
      if (zafrina(o.cultivo, o.fechaSiembra) && r.metodo !== 'propio' && r.dias > ZAFRINA_SOJA.max) {
        r.diasVerano = r.dias; r.dias = ZAFRINA_SOJA.max; r.zafrina = true; r.confianza = 'baja';
        r.texto = 'sembrada en zafriña: el ciclo de verano (' + r.diasVerano + ' días, ' + r.texto + ') se acorta con el día más corto (Embrapa Soja); se usa el máximo de la ' + ZAFRINA_SOJA.n + ', hasta tener cosechas propias de zafriña';
      }
      // lo aprendido de las cosechas propias corrige la estimación (SafiaAprende, nivel 1); al aprender se pide sin corregir
      var ap = !o.sinAprender && r.metodo !== 'propio' && r.metodo !== 'gdu' && window.SafiaAprende ? SafiaAprende.ajusteCiclo({ cultivo: o.cultivo, variedad: nombreAprendido(o.cultivo, (d && d.nombre) || o.variedad, o.fechaSiembra), lat: o.lat, lon: o.lon }) : null;
      if (ap && ap.dias) { r.diasFuente = r.dias; r.dias += ap.dias; r.aprendido = ap; if (r.zafrina) r.texto = r.texto.replace(', hasta tener cosechas propias de zafriña', ''); r.texto += ' · corregido con ' + ap.n + ' cosechas propias (' + (ap.dias > 0 ? '+' : '') + ap.dias + ' días)'; }
      r.fechaFin = sumarDias(o.fechaSiembra, r.dias); r.fechaSiembra = String(o.fechaSiembra).slice(0, 10); r.material = nombreAprendido(o.cultivo, d ? d.nombre : o.variedad, o.fechaSiembra); return r;
    };
    if (!d) return Promise.resolve(fin(null));
    if (p) return Promise.resolve(fin(p));
    if (cu === 'soja') return Promise.resolve(fin(porGM(d)));
    if (cu === 'maiz') return porGDU(d, o.fechaSiembra, num(o.lat), num(o.lon)).then(function (r) { return fin(conSecado(r, o)); });
    return Promise.resolve(fin(null));   // otros cultivos con ficha SENAVE sin ciclo publicado: el ciclo propio aprendido, si lo hay
  }

  /* ---------- texto corto del material para la pantalla de campañas ---------- */
  function fichaMaterial(cultivo, variedad) {
    var cp = variedad && window.SafiaAprende && SafiaAprende.cicloPropio ? SafiaAprende.cicloPropio({ cultivo: cultivo, variedad: variedad }) : null, cpT = cp ? 'ciclo propio en SAFIA: ' + cp.dias + ' días de siembra a cosecha (' + cp.n + (cp.n === 1 ? ' cosecha' : ' cosechas') + ')' : '';
    var d = material(cultivo, variedad); if (!d) return cpT ? cpT.charAt(0).toUpperCase() + cpT.slice(1) + '.' : '';
    var cu = cultivoClave(cultivo), p = [];
    if (d.soloSenave) return 'Sin ficha verificada en SAFIA. ' + (d.nota || d.senave || '') + (cpT ? ' · ' + cpT : '');
    if (cu === 'soja') { if (d.gm != null) p.push('GM ' + fmt(d.gm, 1)); else p.push('GM sin dato verificado'); if (d.habito) p.push(d.habito); }
    if (cu === 'maiz') { if (d.ciclo) p.push(d.ciclo); if (d.gduFlor) p.push(fmt(d.gduFlor, 0) + ' GDU a floración'); if (d.gduMad) p.push(fmt(d.gduMad, 0) + ' a madurez'); }
    if (d.cicloTexto || num(d.cicloDias) > 0) p.push('ciclo ' + (d.cicloTexto || Math.round(num(d.cicloDias)) + ' días') + regionTxt(d.cicloRegion));
    if (cpT && !(num(d.cicloDias) > 0) && !(num(d.gduMad) > 0)) p.push(cpT);
    if (d.densidad) p.push(d.densidad);
    if (d.sanidad) p.push(d.sanidad);
    var fuente = d.nivel ? ' · fuente: ' + d.nivel + (d.url ? ' (' + fuenteCorta(d.url) + ')' : '') : '';
    var reg = d.registro && window.SafiaSenave ? ' · ' + window.SafiaSenave.etiqueta(d.registro) : '';
    return (d.exacto === false ? 'Dato de ' + d.nombre + ': ' : '') + p.join(' · ') + fuente + reg;
  }
  function textoEstimacion(r) {
    if (!r) return '';
    return 'Estimada por SAFIA: ' + r.dias + ' días desde la siembra → ' + fmtF(r.fechaFin) + ' (' + r.texto + ').' + (r.nota ? ' ' + r.nota : '') + ' Podés corregirla.';
  }

  window.SafiaCiclo = { estimar: estimar, zafrina: zafrina, nombreAprendido: nombreAprendido, ZAFRINA_SOJA: ZAFRINA_SOJA, fichaMaterial: fichaMaterial, textoEstimacion: textoEstimacion, gduDia: gduDia, EMBRAPA_GDU: EMBRAPA_GDU };
})();
