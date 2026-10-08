/* SAFIA — Qué pedir al laboratorio (Banco → pestaña "Pedido al laboratorio")
   -------------------------------------------------------------------
   Lista, para mandar al cliente, de TODO lo que el laboratorio tiene que
   medir en el agua de riego y en el suelo para que SAFIA pueda decir si el
   agua va a salar o sodificar el suelo, calcular la RAS, el CSR, el PSI, el
   yeso (al agua o al suelo), el lavado, el encalado y la fertilización.
   Además mira lo que YA está cargado en el campo y marca lo que falta.
   Sale impreso (PDF) o como texto para WhatsApp.

   Fuentes de la lista:
   [1] FAO, Riego y Drenaje 29 (Ayers y Westcot 1985), Tabla 1: determinaciones
       necesarias para evaluar el agua (CE, Ca, Mg, Na, CO3, HCO3, Cl, SO4, B,
       NO3-N, NH4-N, PO4-P, K, pH, RAS) y §1.4 (muestreo representativo).
   [2] USDA Agriculture Handbook 60 (Richards 1954): clasificación C-S, CSR,
       extracto de saturación (CEe), PSI, necesidad de yeso.
   [3] Embrapa CPATSA (Pereira, Valdivieso y Cordeiro 1985): suelo salino
       CEe > 4 dS/m, sódico PST > 15 %, yeso al suelo por PST y CTC.
   [4] INTA (IPG 1999, en Torres Duggan et al. 2017): PSI 5 % como alerta.
   [5] Manual de Adubação e Calagem RS/SC 2016 y CAPECO/IPTA (Cubilla y
       Wendling 2012): fertilidad por Mehlich-1, CTC pH 7, V %, SMP.
   [6] Embrapa Cerrados (Sousa, Lobato y Rein 2005): yeso por la capa de
       20–40 cm (Ca, Al, m %, arcilla).
   [7] Standard Methods 1030 E: control del análisis por balance de iones. */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; }

  /* ---------- lo que hay que pedir ---------- */
  // k: campo guardado en SAFIA (para ver si falta); n: nombre; u: unidad en que pedirlo; para: qué hace SAFIA con el dato; nivel: 1 obligatorio, 2 recomendado, 3 opcional
  var AGUA = [
    { k: 'ce', n: 'Conductividad eléctrica (CE) a 25 °C', u: 'µS/cm o dS/m', para: 'Salinidad del agua, clase C de Riverside, riesgo de infiltración junto con la RAS y cuánta agua extra hace falta para lavar las sales.', nivel: 1 },
    { k: 'ph', n: 'pH', u: '—', para: 'Carbonatos, tendencia a incrustar los aspersores (Langelier) y si conviene acidificar.', nivel: 1 },
    { k: 'na', n: 'Sodio (Na⁺)', u: 'mg/L o meq/L', para: 'RAS (relación de adsorción de sodio), clase S de Riverside y daño en la hoja con pivot.', nivel: 1 },
    { k: 'ca', n: 'Calcio (Ca²⁺)', u: 'mg/L o meq/L', para: 'RAS, carbonato de sodio residual (CSR) y cuánto yeso hace falta.', nivel: 1 },
    { k: 'mg', n: 'Magnesio (Mg²⁺)', u: 'mg/L o meq/L', para: 'RAS y CSR. Si el laboratorio solo da la dureza total, SAFIA la usa como calcio + magnesio, pero pierde precisión.', nivel: 1 },
    { k: 'k', n: 'Potasio (K⁺)', u: 'mg/L', para: 'Control del análisis (los cationes tienen que igualar a los aniones).', nivel: 2 },
    { k: 'cl', n: 'Cloruro (Cl⁻)', u: 'mg/L o meq/L', para: 'Toxicidad en la hoja (pivot) y en la raíz según el cultivo.', nivel: 1 },
    { k: 'so4', n: 'Sulfato (SO₄²⁻)', u: 'mg/L o meq/L (decir si es como S o como SO₄)', para: 'Balance de iones y salinidad efectiva.', nivel: 1 },
    { k: 'hco3', n: 'Carbonatos (CO₃²⁻) y bicarbonatos (HCO₃⁻)', u: 'mg/L del ion, o alcalinidad total y a la fenolftaleína como CaCO₃ (pedir que aclaren cuál)', para: 'CSR, cuánto ácido o cuánto yeso extra hace falta e incrustaciones. Es el dato que más se confunde entre laboratorios.', nivel: 1 },
    { k: 'no3', n: 'Nitratos (NO₃⁻)', u: 'mg/L (decir si es como N o como NO₃)', para: 'Nitrógeno que aporta el agua.', nivel: 2 },
    { k: 'boro', n: 'Boro (B)', u: 'mg/L', para: 'Toxicidad por boro según el cultivo (FAO Tabla 16).', nivel: 1 },
    { k: 'tdsMedido', n: 'Sólidos disueltos totales (TDS o residuo seco)', u: 'mg/L', para: 'Control: TDS ÷ CE tiene que dar entre 0,54 y 0,96.', nivel: 2 },
    { k: 'dureza', n: 'Dureza total', u: 'mg/L CaCO₃', para: 'Control de calcio + magnesio.', nivel: 2 },
    { k: null, n: 'Hierro y manganeso', u: 'mg/L', para: 'Obstrucción y manchas en los aspersores.', nivel: 3 },
    { k: null, n: 'Que el laboratorio informe también RAS, CSR y clase Riverside, y el balance de iones (cationes ≈ aniones, ± 5 %)', u: '—', para: 'SAFIA los recalcula y los compara: si no cierran, el análisis se repite antes de decidir.', nivel: 2 }
  ];
  var SUELO_FERT = [
    { k: 'ph', n: 'pH en agua', u: '—', para: 'Encalado, disponibilidad de nutrientes, aluminio.', nivel: 1 },
    { k: 'mo', n: 'Materia orgánica', u: '%', para: 'Nitrógeno que aporta el suelo, agua que guarda, CIC.', nivel: 1 },
    { k: 'p', n: 'Fósforo disponible', u: 'mg/dm³, con el extractor (Mehlich-1 o Bray)', para: 'Dosis de P por clase de arcilla (CAPECO, RS/SC, Embrapa).', nivel: 1 },
    { k: 'k', n: 'Potasio intercambiable', u: 'cmolc/dm³ o mg/dm³', para: 'Dosis de K; con agua con sodio, el potasio pesa más.', nivel: 1 },
    { k: 'ca', n: 'Calcio intercambiable', u: 'cmolc/dm³', para: 'Encalado, Ca/Mg, si el suelo compensa el sodio del agua (USDA).', nivel: 1 },
    { k: 'mg', n: 'Magnesio intercambiable', u: 'cmolc/dm³', para: 'Dolomítico o calcítico, Ca/Mg.', nivel: 1 },
    { k: 'aluminio', n: 'Aluminio intercambiable (Al³⁺) y saturación de aluminio (m %)', u: 'cmolc/dm³ y %', para: 'Toxicidad y prioridad del encalado; yeso para el subsuelo.', nivel: 1 },
    { k: 'hAl', n: 'Acidez potencial (H + Al) e índice SMP', u: 'cmolc/dm³ y —', para: 'Dosis de calcáreo por el método SMP (RS/SC).', nivel: 2 },
    { k: 'cic', n: 'CIC (CTC) a pH 7', u: 'cmolc/dm³', para: 'Clases de K, PSI (sodio ÷ CIC) y kilos de yeso al suelo.', nivel: 1 },
    { k: 'satBases', n: 'Saturación de bases (V %)', u: '%', para: 'Encalado por saturación de bases (Embrapa).', nivel: 1 },
    { k: 'azufre', n: 'Azufre (S-SO₄)', u: 'mg/dm³', para: 'Dosis de azufre; yeso como fuente.', nivel: 1 },
    { k: 'boro', n: 'Boro, zinc, cobre, manganeso', u: 'mg/dm³', para: 'Micronutrientes (Embrapa 2013).', nivel: 2 },
    { k: 'arcilla', n: 'Textura: arena, limo y arcilla', u: '%', para: 'Clases de P, yeso para perennes (75 × % arcilla), agua útil, infiltración.', nivel: 1 }
  ];
  var SUELO_SAL = [
    { k: 'na', n: 'Sodio intercambiable (Na⁺)', u: 'cmolc/dm³', para: 'PSI = Na ÷ CIC × 100: dice si el sodio del agua se está acumulando.', nivel: 1 },
    { k: 'psi', n: 'PSI o PST (porcentaje de sodio intercambiable)', u: '%', para: 'Menos de 5 % tranquilo (INTA), 5–15 alerta, más de 15 suelo sódico (Embrapa CPATSA): define si el yeso es preventivo o corrección y cuántas toneladas.', nivel: 1 },
    { k: 'ceExtracto', n: 'CE del extracto de saturación (CEe)', u: 'dS/m (pasta saturada; NO la CE 1:2,5 ni 1:5)', para: 'Suelo salino si pasa de 4 dS/m: cuánta agua extra hace falta para lavar.', nivel: 1 },
    { k: null, n: 'pH de la pasta saturada', u: '—', para: 'Más de 8,5 acompaña al suelo sódico.', nivel: 2 },
    { k: null, n: 'Carbonatos del suelo (CaCO₃)', u: '%', para: 'Si el suelo tiene calcáreo propio, el azufre elemental sirve como fuente de calcio; si no, solo el yeso.', nivel: 2 },
    { k: null, n: 'Densidad aparente', u: 'g/cm³', para: 'Afina los kilos de yeso por hectárea.', nivel: 3 },
    { k: null, n: 'Necesidad de yeso (método Schoonover)', u: 't/ha', para: 'Segunda opinión del laboratorio para la dosis de yeso al suelo.', nivel: 3 }
  ];
  var NIVEL = { 1: 'Obligatorio', 2: 'Recomendado', 3: 'Opcional' };

  /* ---------- qué le falta a este campo ---------- */
  function ultimoCon(lista, claves) {
    var l = lista.filter(function (a) { return claves.some(function (k) { return num(a[k]) != null; }); });
    l.sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); });
    return l.length ? l[l.length - 1] : null;
  }
  function faltantes(filas, a) { return filas.filter(function (f) { return f.k && f.nivel === 1 && num(a[f.k]) == null; }); }
  function estado(campo) {
    var suelos = B().leer('analisis_suelo').filter(function (a) { return String(a.campoId) === String(campo.id); });
    var aguas = B().leer('analisis_agua').filter(function (a) { return String(a.campoId) === String(campo.id); });
    var sf = ultimoCon(suelos, ['p', 'ca', 'k', 'mo']), ss = ultimoCon(suelos, ['na', 'psi', 'ceExtracto']), ag = ultimoCon(aguas, ['ce', 'na', 'ca']);
    var carb = ag && (num(ag.co3) != null || num(ag.hco3) != null);
    return {
      suelo: sf, sueloFalta: sf ? faltantes(SUELO_FERT, sf) : SUELO_FERT.filter(function (f) { return f.nivel === 1; }),
      sodio: ss, sodioFalta: ss ? SUELO_SAL.filter(function (f) { return f.k && f.nivel === 1 && num(ss[f.k]) == null && !(f.k === 'na' && num(ss.psi) != null) && !(f.k === 'psi' && num(ss.na) != null && num(ss.cic) != null); }) : SUELO_SAL.filter(function (f) { return f.nivel === 1; }),
      agua: ag, aguaFalta: ag ? faltantes(AGUA, ag).filter(function (f) { return !(f.k === 'hco3' && carb); }) : AGUA.filter(function (f) { return f.nivel === 1; })
    };
  }

  /* ---------- texto para WhatsApp ---------- */
  function lista(filas, nivelMax) { return filas.filter(function (f) { return f.nivel <= nivelMax; }).map(function (f) { return '- ' + f.n + (f.u && f.u !== '—' ? ' (' + f.u + ')' : ''); }).join('\n'); }
  function textoWhatsApp(campo, E) {
    var cli = B().leer('clientes').find(function (c) { return String(c.id) === String(campo.clienteId); });
    var faltaS = E.sueloFalta.concat(E.sodioFalta).map(function (f) { return f.n; }), faltaA = E.aguaFalta.map(function (f) { return f.n; });
    return ['*Análisis para el riego · ' + campo.nombre + (cli ? ' · ' + (cli.nombre || cli.razonSocial || '') : '') + '*',
      'Esto es lo que hay que pedirle al laboratorio para que SAFIA pueda decir si el agua va a salar o sodificar el suelo y qué corregir.',
      '',
      '*AGUA DE RIEGO* (del pozo, río o tajamar; una muestra por fuente)',
      lista(AGUA, 2),
      'Muestra: con la bomba andando 30 minutos; botella plástica limpia de 1 litro enjuagada con la misma agua, llena hasta el borde y tapada; rotular pozo, fecha y hora; al laboratorio en 24–48 h, fresca. Pedir que los carbonatos y bicarbonatos vengan como mg/L del ion o como alcalinidad en CaCO3, pero que lo aclaren.',
      '',
      '*SUELO · fertilidad* (0–20 cm y 20–40 cm, por separado)',
      lista(SUELO_FERT, 2),
      '',
      '*SUELO · sales y sodio* (obligatorio cuando se riega con agua con sodio o antes de instalar el riego)',
      lista(SUELO_SAL, 2),
      'Muestra: 15 a 20 pinchazos en zigzag por parcela homogénea (un pivot), mezclados, 500 g por profundidad; en campos regados, una muestra del lote regado y otra de un lugar sin regar al lado; después de la cosecha y antes de corregir; el mismo laboratorio cada año.',
      '',
      (E.suelo || E.sodio || E.agua) ? '*Lo que le falta a ' + campo.nombre + ' según lo cargado en SAFIA*' + (faltaS.length ? '\nSuelo: ' + faltaS.join(', ') + '.' : '\nSuelo: completo.') + (faltaA.length ? '\nAgua: ' + faltaA.join(', ') + '.' : '\nAgua: completo.') : '*' + campo.nombre + ' todavía no tiene análisis cargados en SAFIA: pedir el completo.*',
      '', 'Generado por SAFIA · Irrigar'].join('\n');
  }

  /* ---------- HTML ---------- */
  function tabla(filas, a) {
    return '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Qué pedir</th><th>En qué unidad</th><th>Para qué lo usa SAFIA</th><th>Nivel</th>' + (a ? '<th>En este campo</th>' : '') + '</tr></thead><tbody>' +
      filas.map(function (f) {
        var tiene = a && f.k ? num(a[f.k]) != null : null;
        return '<tr><td><b>' + esc(f.n) + '</b></td><td style="font-size:12px;">' + esc(f.u) + '</td><td style="font-size:12px;">' + esc(f.para) + '</td><td><span class="badge ' + (f.nivel === 1 ? 'red' : (f.nivel === 2 ? 'green' : 'gray')) + '">' + NIVEL[f.nivel] + '</span></td>' +
          (a ? '<td>' + (tiene === null ? '<span class="muted">—</span>' : (tiene ? '<span style="color:#178029;font-weight:700;">cargado</span>' : (f.nivel === 1 ? '<span style="color:#B3261E;font-weight:700;">falta</span>' : '<span class="muted">falta</span>'))) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function html(campo) {
    var E = estado(campo), cli = B().leer('clientes').find(function (c) { return String(c.id) === String(campo.clienteId); });
    var f = function (d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : ''; };
    var resumen = (E.suelo || E.sodio || E.agua)
      ? '<div class="note ' + (E.sueloFalta.length + E.sodioFalta.length + E.aguaFalta.length ? 'warn' : 'ok') + '"><b>Lo que le falta a ' + esc(campo.nombre) + ' según lo cargado en SAFIA:</b><ul style="margin:6px 0 0 18px;">' +
        '<li>Suelo, fertilidad' + (E.suelo ? ' (último análisis ' + f(E.suelo.fecha) + ')' : ' (sin análisis)') + ': ' + (E.sueloFalta.length ? esc(E.sueloFalta.map(function (x) { return x.n; }).join(', ')) : 'completo') + '.</li>' +
        '<li>Suelo, sales y sodio' + (E.sodio ? ' (último ' + f(E.sodio.fecha) + ')' : ' (nunca se midió)') + ': ' + (E.sodioFalta.length ? esc(E.sodioFalta.map(function (x) { return x.n; }).join(', ')) : 'completo') + '.</li>' +
        '<li>Agua de riego' + (E.agua ? ' (último ' + f(E.agua.fecha) + ')' : ' (sin análisis)') + ': ' + (E.aguaFalta.length ? esc(E.aguaFalta.map(function (x) { return x.n; }).join(', ')) : 'completo') + '.</li></ul></div>'
      : '<div class="note warn"><b>' + esc(campo.nombre) + ' todavía no tiene análisis cargados en SAFIA:</b> pedir el completo de agua y de suelo.</div>';
    return '<div class="card" id="pedidoLabHoja"><div class="card-h"><h3>Qué pedir al laboratorio · ' + esc(campo.nombre) + (cli ? ' · ' + esc(cli.nombre || cli.razonSocial || '') : '') + '</h3>' +
      '<span class="rowact" style="gap:8px;"><button type="button" class="btn mini" id="pedidoLabCopiar">Copiar texto para WhatsApp</button><button type="button" class="btn mini green" id="pedidoLabImprimir">Imprimir / PDF</button></span></div>' +
      '<div class="formsub" style="margin-bottom:10px;">Con estos datos SAFIA calcula la RAS, el CSR, la clase Riverside, el PSI del suelo, el yeso (al agua o al suelo), el lavado de sales, el encalado y la fertilización. Lo que no se mide, no se puede corregir con criterio. Esta lista se le manda al cliente para que la pida tal cual.</div>' +
      resumen +
      '<h4 style="margin:14px 0 6px;">1. Agua de riego</h4><div class="muted" style="font-size:12px;margin-bottom:6px;">Una muestra por fuente (pozo, río, tajamar). Una vez por año y siempre antes de instalar el riego: el pozo cambia con el uso.</div>' + tabla(AGUA, E.agua) +
      '<div class="sub" style="margin-top:6px;"><b>Cómo tomar la muestra:</b> con la bomba andando al menos 30 minutos; botella plástica limpia de 1 litro, enjuagada tres veces con la misma agua, llena hasta el borde (sin aire) y tapada; rotular pozo, fecha, hora y profundidad del pozo; fresca y al laboratorio en 24–48 horas. Pedir que carbonatos y bicarbonatos vengan como mg/L del ion o como alcalinidad total y a la fenolftaleína en CaCO₃, y que lo aclaren: es el dato que más errores trae.</div>' +
      '<h4 style="margin:14px 0 6px;">2. Suelo · fertilidad</h4><div class="muted" style="font-size:12px;margin-bottom:6px;">Dos profundidades por separado: 0–20 cm (fertilidad y encalado) y 20–40 cm (yeso para el subsuelo y raíz).</div>' + tabla(SUELO_FERT, E.suelo) +
      '<h4 style="margin:14px 0 6px;">3. Suelo · sales y sodio</h4><div class="muted" style="font-size:12px;margin-bottom:6px;">Obligatorio cuando se riega con agua con sodio o bicarbonato, y antes de instalar un riego nuevo. Es lo que dice si el agua está sodificando el suelo y si el yeso es preventivo o corrección.</div>' + tabla(SUELO_SAL, E.sodio) +
      '<div class="sub" style="margin-top:6px;"><b>Cómo tomar la muestra:</b> 15 a 20 pinchazos en zigzag por parcela homogénea (un pivot es una parcela), mezclados en un balde limpio, 500 g por profundidad; en campos regados, una muestra en el lote regado y otra en un lugar sin regar al lado: la diferencia es lo que dejó el riego; después de la cosecha y antes de encalar o aplicar yeso; el mismo laboratorio todos los años para poder comparar.</div>' +
      '<div class="muted" style="font-size:11px;margin-top:12px;">Fuentes: FAO 29 Tabla 1 y §1.4 (determinaciones del agua y muestreo); USDA Manual 60 (clases C-S, CSR, extracto de saturación, PSI, yeso); Embrapa CPATSA 1985 (salino CEe > 4, sódico PST > 15); INTA (PSI 5 % alerta); Manual RS/SC 2016 y CAPECO/IPTA 2012 (fertilidad); Embrapa Cerrados 2005 (yeso por 20–40 cm); Standard Methods 1030 E (balance de iones).</div></div>';
  }

  function imprimir() {
    var h = $('pedidoLabHoja'); if (!h) return;
    var w = window.open('', '_blank'); if (!w) { B().toast('El navegador bloqueó la ventana de impresión', true); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(['Qué pedir al laboratorio', (function () { var c = B().leer('clientes').find(function (x) { return String(x.id) === String((B().campoActual() || {}).clienteId); }); return c ? (c.nombre || c.razonSocial || '') : ''; })(), (B().campoActual() || {}).nombre, new Date().toISOString().slice(0, 10)].filter(Boolean).join(' - ').replace(/[\/:*?"<>|]+/g, ' ')) + '</title><style>body{font-family:Arial,sans-serif;color:#2E3236;margin:18px;font-size:12.5px;}h3{margin:0 0 8px;}h4{margin:14px 0 6px;}table{width:100%;border-collapse:collapse;margin:6px 0;}th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #D5D9DD;vertical-align:top;font-size:11.5px;}th{font-size:10.5px;text-transform:uppercase;color:#8C9196;}.badge{display:inline-block;padding:2px 7px;border:1px solid #D5D9DD;border-radius:999px;font-size:10.5px;}.note{border:1px solid #E1E4E7;border-left:4px solid #B8731A;padding:8px 10px;margin:8px 0;}.rowact,.card-h button{display:none;}.muted,.sub{color:#5C6166;}.formsub{color:#5C6166;margin-bottom:8px;}@page{margin:14mm;}</style></head><body>' + h.innerHTML + '<div style="margin-top:14px;color:#8C9196;font-size:11px;">Generado por SAFIA · Irrigar · ' + new Date().toLocaleDateString('es-PY') + '</div></body></html>');
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 400);
  }
  function copiar(campo) {
    var t = textoWhatsApp(campo, estado(campo));
    var listo = function () { B().toast('Texto copiado: pegalo en WhatsApp o en un correo'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(listo, function () { respaldo(t); listo(); });
    else { respaldo(t); listo(); }
  }
  function respaldo(t) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); }

  function activar() {
    var cont = $('pedidoLabCont'); if (!cont) return;
    var campo = B() && B().campoActual ? B().campoActual() : null;
    if (!campo) { cont.innerHTML = '<div class="muted">Elegí un campo.</div>'; return; }
    cont.innerHTML = html(campo);
    $('pedidoLabImprimir').addEventListener('click', imprimir);
    $('pedidoLabCopiar').addEventListener('click', function () { copiar(campo); });
  }
  function alCambiarCampo() { var p = $('panel-pedidoLab'); if (p && p.classList.contains('on')) activar(); }

  window.SafiaPedidoLab = { activar: activar, alCambiarCampo: alCambiarCampo, estado: estado, textoWhatsApp: textoWhatsApp, html: html, AGUA: AGUA, SUELO_FERT: SUELO_FERT, SUELO_SAL: SUELO_SAL };
})();
