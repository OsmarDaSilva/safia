/* SAFIA · Fertirriego por el pivot (window.SafiaFertirriego)
   -------------------------------------------------------------------------------------------------
   1) CARGA: el operador pone los kilos de producto (materia prima) por hectárea y SAFIA saca los kilos de nutriente por
      la fórmula del producto: 100 kg/ha de Urea 46-00-00 = 46 kg de N por hectárea. Se guarda como un evento
      `aplicacion` con `metodo: 'fertirriego'`, así entra solo en el balance de nutrientes y en la meta.
   2) LA CUENTA DEL TANQUE: kilos para toda la vuelta (dosis × hectáreas) y a cuántos litros por hora inyectar
      (litros de solución ÷ horas que tarda la vuelta). Es aritmética: el pivot gira parejo, la inyección va pareja.
   3) EL PLAN DE NITRÓGENO DEL MAÍZ, por la meta de rinde y la textura del suelo.
      FUENTE: Coelho, A. M. "Nutrição e Adubação do Milho". Embrapa Milho e Sorgo, Circular Técnica 78, dic. 2006.
        · Tabela 6 (p. 6): N en cobertura según el rinde esperado: 4–6 t/ha → 60 kg; 6–8 t/ha → 100 kg; más de 8 t/ha → 140 kg.
        · Tabela 4 (p. 6): reparto por textura y hojas. Suelo arcilloso o medio: hasta 120 kg, todo junto a las 6–7 hojas;
          más de 120 kg, mitad a las 3–4 hojas y mitad a las 6–7. Suelo arenoso (< 15 % de arcilla): hasta 120 kg, mitad y
          mitad; más de 120 kg, 40 % y 60 %. Nota 2: con riego por aspersión, el N por el agua da más flexibilidad para
          repartir (también a las 8–10 y 10–12 hojas). A la siembra, 30 kg de N/ha.
        · p. 5: la aplicación única rinde igual que repartida en suelos medios y arcillosos con 60 a 120 kg; conviene repartir
          más con dosis altas (120 a 200 kg), suelo arenoso o lluvias intensas. La fase de mayor exigencia: 30 a 35 días de la siembra.
        · p. 8: el potasio se aplica como máximo hasta los 30 días de la siembra; si el suelo es arenoso o son más de
          60 kg de K₂O, mitad a la siembra y mitad con la cobertura de N.
      Para la soja Embrapa no recomienda nitrógeno mineral (ver safia-foliar / safia-meta). Para otros cultivos SAFIA
      registra y suma lo aplicado, pero no arma plan por etapa: no hay tabla verificada cargada. Nada se pone de memoria.
   La dosis final la define el ingeniero agrónomo. */
(function () {
  'use strict';
  var FUENTE = 'Embrapa Milho e Sorgo, Circular Técnica 78 (Coelho, 2006)';
  var P_A_P2O5 = 2.2914, K_A_K2O = 1.2046;
  // Fórmula (N-P₂O₅-K₂O) de los solubles más usados, cuando el nombre no la trae escrita. Es la de la etiqueta del producto.
  var PRODUCTOS = [
    { n: 'Urea 46-00-00', re: /urea/i, g: [46, 0, 0] },
    { n: 'UAN 32-00-00', re: /\buan\b|uran/i, g: [32, 0, 0] },
    { n: 'Nitrato de amonio 33-00-00', re: /nitrato de am/i, g: [33, 0, 0] },
    { n: 'Sulfato de amonio 21-00-00', re: /sulfato de am/i, g: [21, 0, 0] },
    { n: 'Nitrato de calcio 15-00-00', re: /nitrato de calcio/i, g: [15, 0, 0] },
    { n: 'Nitrato de potasio 13-00-46', re: /nitrato de pot/i, g: [13, 0, 46] },
    { n: 'MAP purificado 12-61-00', re: /\bmap\b/i, g: [12, 61, 0] },
    { n: 'MKP fosfato monopotásico 00-52-34', re: /\bmkp\b|monopot/i, g: [0, 52, 34] },
    { n: 'Cloruro de potasio soluble 00-00-60', re: /cloruro de pot|\bkcl\b/i, g: [0, 0, 60] },
    { n: 'Sulfato de potasio soluble 00-00-50', re: /sulfato de pot/i, g: [0, 0, 50] }
  ];
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lista(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function fmt(n, d) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dia(f) { return String(f || '').slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }

  /* ---------- de producto a nutriente ---------- */
  // Devuelve { n, p2o5, k2o } en % de la fórmula escrita ("46-00-00") o, si no hay, del producto conocido
  function grado(texto) {
    var t = String(texto || '');
    var m = t.match(/(\d{1,2}(?:[.,]\d)?)\s*-\s*(\d{1,2}(?:[.,]\d)?)\s*-\s*(\d{1,2}(?:[.,]\d)?)/);
    if (m) return { n: num(m[1]), p2o5: num(m[2]), k2o: num(m[3]) };
    for (var i = 0; i < PRODUCTOS.length; i++) if (PRODUCTOS[i].re.test(t)) return { n: PRODUCTOS[i].g[0], p2o5: PRODUCTOS[i].g[1], k2o: PRODUCTOS[i].g[2] };
    return null;
  }
  // kg/ha de producto → kg/ha de N, P₂O₅ y K₂O
  function nutrientes(producto, kgHa) {
    var g = grado(producto), d = num(kgHa); if (!g || d == null) return null;
    return { n: d * g.n / 100, p2o5: d * g.p2o5 / 100, k2o: d * g.k2o / 100, grado: g };
  }
  function textoNutrientes(nu) {
    if (!nu) return '';
    var p = []; if (nu.n > 0) p.push(fmt(nu.n, nu.n < 10 ? 1 : 0) + ' kg de N'); if (nu.p2o5 > 0) p.push(fmt(nu.p2o5, nu.p2o5 < 10 ? 1 : 0) + ' kg de P₂O₅'); if (nu.k2o > 0) p.push(fmt(nu.k2o, nu.k2o < 10 ? 1 : 0) + ' kg de K₂O');
    return p.join(' + ');
  }
  function hectareas(eq, cultivo) { return num(cultivo && cultivo.superficie) || num(eq && eq.superficie) || num(eq && eq.areaHa) || num(eq && eq.poligono && eq.poligono.ha) || null; }
  // Horas de la vuelta para una lámina, con la ficha técnica del pivot (lámina y horas al 100 %): más lámina = más despacio
  function horasVuelta(eq, mm) { var d = (eq && eq.datosTecnicos) || {}, l100 = num(d.lamina100), v100 = num(d.vuelta100), l = num(mm); return l100 > 0 && v100 > 0 && l > 0 ? v100 * l / l100 : null; }

  /* ---------- lo aplicado en la campaña ---------- */
  function aplicado(eq, camp, cultivo) {
    var desde = cultivo && cultivo.fechaSiembra ? dia(cultivo.fechaSiembra) : null, hasta = cultivo && cultivo.fechaCosecha ? dia(cultivo.fechaCosecha) : '9999';
    var t = { siembra: { n: 0, p2o5: 0, k2o: 0 }, cobertura: { n: 0, p2o5: 0, k2o: 0 }, fertirriego: { n: 0, p2o5: 0, k2o: 0 }, veces: [], hayCarga: false };
    var suma = function (o, nu) { o.n += nu.n || 0; o.p2o5 += nu.p2o5 || 0; o.k2o += nu.k2o || 0; };
    // eventos del Operador (Aplicación con % N-P-K, o Fertirriego)
    lista('eventos').forEach(function (ev) {
      if (ev.tipo !== 'aplicacion' || String(ev.equipoId) !== String(eq && eq.id)) return;
      if (ev.n_kg_ha == null && ev.p_kg_ha == null && ev.k_kg_ha == null) return;
      var f = dia(ev.fecha); if (desde && (f < desde || f > hasta)) return;
      var nu = { n: num(ev.n_kg_ha) || 0, p2o5: ev.p2o5_kg_ha != null ? num(ev.p2o5_kg_ha) || 0 : (num(ev.p_kg_ha) || 0) * P_A_P2O5, k2o: ev.k2o_kg_ha != null ? num(ev.k2o_kg_ha) || 0 : (num(ev.k_kg_ha) || 0) * K_A_K2O };
      t.hayCarga = true;
      if (ev.metodo === 'fertirriego') { suma(t.fertirriego, nu); t.veces.push({ fecha: f, producto: ev.producto, dosis: num(ev.dosis), nutrientes: nu, dds: desde ? diasEntre(desde, f) : null }); }
      else suma(t.cobertura, nu);
    });
    // insumos de la ficha de la campaña (Manejo e insumos)
    ((camp && camp.insumos) || []).forEach(function (i) {
      if (['fert_base', 'fert_cobertura', 'fertirriego'].indexOf(i.categoria) < 0) return;
      var kg = num(i.dosis); if (kg == null) return; if (i.unidad === 't/ha') kg *= 1000;
      var nu = nutrientes(i.formula || i.producto, kg); if (!nu) return;
      t.hayCarga = true;
      suma(i.categoria === 'fert_base' ? t.siembra : i.categoria === 'fertirriego' ? t.fertirriego : t.cobertura, nu);
      if (i.categoria === 'fertirriego') t.veces.push({ fecha: i.fecha ? dia(i.fecha) : null, producto: i.producto, dosis: kg, nutrientes: nu, dds: desde && i.fecha ? diasEntre(desde, i.fecha) : null, deLaFicha: true });
    });
    t.veces.sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); });
    t.nDespuesDeSiembra = t.cobertura.n + t.fertirriego.n;
    return t;
  }

  /* ---------- plan de N del maíz (Embrapa, Circular Técnica 78) ---------- */
  function esMaiz(cultivo) { return /ma[ií]z|milho/i.test(String(cultivo && cultivo.cultivo || '')) && !/ensil|silaje|forraj/i.test(String(cultivo && cultivo.finalidad || '')); }
  function arcillaDe(campo) {
    var a = null, f = '';
    lista('analisis_suelo').forEach(function (x) { if (String(x.campoId) !== String(campo && campo.id)) return; var v = num(x.arcilla); if (v != null && v > 0 && String(x.fecha || '') >= f) { a = v; f = String(x.fecha || ''); } });
    if (a != null) return { pct: a, origen: 'análisis de suelo' };
    var t = String((campo && (campo.tipoSuelo || campo.suelo)) || '');
    if (/aren/i.test(t)) return { pct: 10, origen: 'tipo de suelo del campo (arenoso)' };
    if (/arcill|argil/i.test(t)) return { pct: 45, origen: 'tipo de suelo del campo (arcilloso)' };
    if (/franc|medi/i.test(t)) return { pct: 25, origen: 'tipo de suelo del campo (medio)' };
    return null;
  }
  function planMaiz(eq, campo, camp, cultivo) {
    var meta = num(cultivo && cultivo.rendimientoObj), dds = cultivo && cultivo.fechaSiembra ? diasEntre(cultivo.fechaSiembra, hoy()) : null;
    var P = { cultivo: 'Maíz', fuente: FUENTE, dds: dds, falta: [], notas: [] };
    if (!meta) { P.falta.push('la meta de rinde de la campaña (con la meta sale cuánto nitrógeno lleva)'); return P; }
    var t = meta / 1000;
    P.metaT = t;
    P.nCobertura = t > 8 ? 140 : t > 6 ? 100 : 60;   // Tabela 6
    if (t < 4) P.notas.push('La tabla de Embrapa empieza en 4 t/ha: para ' + fmt(t, 1) + ' t/ha se toma la dosis más baja.');
    P.nSiembra = 30;                                  // Tabela 4, nota
    var ar = arcillaDe(campo);
    P.textura = !ar ? 'media' : ar.pct < 15 ? 'arenosa' : ar.pct <= 35 ? 'media' : 'arcillosa';
    P.texturaOrigen = ar ? ar.origen + ' (' + fmt(ar.pct, 0) + ' % de arcilla)' : null;
    if (!ar) { P.falta.push('el % de arcilla del suelo (análisis de suelo): mientras tanto se toma textura media'); }
    var alta = P.nCobertura > 120, arenosa = P.textura === 'arenosa';
    // Tabela 4
    P.pasos = !arenosa && !alta ? [{ hojas: '6 a 7 hojas', pct: 100, kg: P.nCobertura, dias: '30 a 35 días de la siembra' }]
      : [{ hojas: '3 a 4 hojas', pct: arenosa && alta ? 40 : 50, kg: P.nCobertura * (arenosa && alta ? 0.4 : 0.5) }, { hojas: '6 a 7 hojas', pct: arenosa && alta ? 60 : 50, kg: P.nCobertura * (arenosa && alta ? 0.6 : 0.5), dias: '30 a 35 días de la siembra' }];
    P.notas.push('Por el pivot el nitrógeno se puede repartir en más aplicaciones (también a las 8–10 y 10–12 hojas). Conviene repartir más con dosis altas, suelo arenoso o lluvias fuertes.');
    P.notas.push('Potasio: va a la siembra. Si falta, por el pivot solo hasta los 30 días de la siembra' + (dds != null ? (dds <= 30 ? ' (hoy van ' + dds + ': todavía se puede).' : ' (hoy van ' + dds + ': ya pasó).') : '.'));
    var ap = aplicado(eq, camp, cultivo);
    P.aplicado = ap; P.nHecho = ap.nDespuesDeSiembra; P.nFalta = Math.max(0, P.nCobertura - P.nHecho);
    if (!ap.siembra.n && !ap.hayCarga) P.notas.push('No hay fertilizantes cargados en la campaña: se cuenta como si no se hubiera aplicado nada.');
    // qué toca ahora, por días desde la siembra (la única etapa con días en la fuente es la de 6–7 hojas: 30 a 35 días)
    if (dds != null) {
      if (P.nFalta <= 0) P.ahora = 'El nitrógeno en cobertura del plan ya está aplicado.';
      else if (dds < 12) P.ahora = 'Todavía es temprano: la primera aplicación va cuando el maíz tenga ' + P.pasos[0].hojas + '.';
      else if (dds <= 40) P.ahora = P.pasos.length === 1 ? 'Es el momento de la aplicación: a las 6–7 hojas (30 a 35 días de la siembra). Contá las hojas en el lote.' : 'Estás en la ventana de las aplicaciones (3–4 y 6–7 hojas). Contá las hojas en el lote: faltan ' + fmt(P.nFalta, 0) + ' kg de N/ha.';
      else P.ahora = 'Pasaron ' + dds + ' días de la siembra y faltan ' + fmt(P.nFalta, 0) + ' kg de N/ha del plan. Por el pivot todavía se puede aplicar hasta las 10–12 hojas; después, consultalo con el agrónomo.';
    }
    return P;
  }

  /* ---------- tarjeta del Operador ---------- */
  function htmlTarjeta(eq, campo, camp, cultivo) {
    if (!eq || !camp || !cultivo) return '';
    var maiz = esMaiz(cultivo), ap = aplicado(eq, camp, cultivo), fila = function (a, b) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:13.5px;"><span style="color:#6B7075;">' + a + '</span><b style="color:#2E3236;text-align:right;">' + b + '</b></div>'; };
    if (!maiz && !ap.veces.length) return '';
    var h = '';
    if (maiz) {
      var P = planMaiz(eq, campo, camp, cultivo);
      h += '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6B7075;">Nitrógeno del maíz · plan</div>';
      if (!P.pasos) h += '<div style="font-size:13.5px;color:#8A5A00;margin-top:4px;">Falta ' + esc(P.falta[0]) + '.</div>';
      else {
        h += '<div style="font-size:15px;font-weight:800;color:#2E3236;margin-top:2px;">' + fmt(P.nCobertura, 0) + ' kg de N/ha en cobertura <span style="font-weight:500;font-size:12.5px;color:#6B7075;">para ' + fmt(P.metaT, 1) + ' t/ha · suelo de textura ' + P.textura + '</span></div>' +
          '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;"><tbody>' +
          '<tr><td style="padding:5px 0;border-top:1px solid #EEF0F2;color:#6B7075;">A la siembra</td><td style="padding:5px 0;border-top:1px solid #EEF0F2;text-align:right;"><b>' + P.nSiembra + ' kg N/ha</b></td></tr>' +
          P.pasos.map(function (s) { return '<tr><td style="padding:5px 0;border-top:1px solid #EEF0F2;color:#6B7075;">Con ' + s.hojas + (s.dias ? ' <span style="color:#8C9196;">(' + s.dias + ')</span>' : '') + '</td><td style="padding:5px 0;border-top:1px solid #EEF0F2;text-align:right;"><b>' + fmt(s.kg, 0) + ' kg N/ha</b> <span style="color:#8C9196;">(' + s.pct + ' %)</span><br><span style="font-size:12px;color:#8C9196;">= ' + fmt(s.kg / 0.46, 0) + ' kg/ha de urea</span></td></tr>'; }).join('') + '</tbody></table>' +
          '<div style="margin-top:8px;">' + fila('Aplicado después de la siembra', fmt(P.nHecho, 0) + ' kg N/ha') + fila('Falta del plan', '<span style="color:' + (P.nFalta > 0 ? '#B5371C' : '#178029') + ';">' + fmt(P.nFalta, 0) + ' kg N/ha' + (P.nFalta > 0 ? ' = ' + fmt(P.nFalta / 0.46, 0) + ' kg/ha de urea' : '') + '</span>') + '</div>' +
          (P.ahora ? '<div style="margin-top:8px;padding:9px 12px;border-radius:8px;background:' + (P.nFalta > 0 && P.dds >= 12 ? '#FDF3E3;color:#8A5A00' : '#E7F6EA;color:#178029') + ';font-size:13.5px;font-weight:600;line-height:1.4;">' + esc(P.ahora) + '</div>' : '') +
          '<ul style="margin:8px 0 0 18px;padding:0;font-size:12.5px;color:#6B7075;line-height:1.45;">' + P.notas.concat(P.falta.map(function (x) { return 'Falta cargar ' + x + '.'; })).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      }
    }
    if (ap.veces.length) {
      h += '<div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6B7075;margin-top:' + (maiz ? '12px' : '0') + ';">Fertirriegos de esta campaña</div>' +
        ap.veces.map(function (v) { return '<div style="font-size:13px;padding:4px 0;border-top:1px solid #F0F2F4;"><b>' + (v.fecha ? v.fecha.slice(8, 10) + '/' + v.fecha.slice(5, 7) : 'sin fecha') + '</b>' + (v.dds != null ? ' <span style="color:#8C9196;">(día ' + v.dds + ')</span>' : '') + ' · ' + fmt(v.dosis, 0) + ' kg/ha de ' + esc(v.producto || 'producto') + ' = <b>' + textoNutrientes(v.nutrientes) + '</b>/ha</div>'; }).join('') +
        '<div style="font-size:13px;font-weight:700;color:#2E3236;padding-top:5px;border-top:1px solid #E1E4E7;">Total por el pivot: ' + (textoNutrientes(ap.fertirriego) || '0') + ' por hectárea</div>';
    }
    return '<details' + (maiz ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px;font-weight:800;color:#2E3236;list-style-position:inside;">Fertirriego: ' + (maiz ? 'plan de nitrógeno y lo aplicado' : 'lo aplicado por el pivot') + '</summary><div style="margin-top:8px;">' + h +
      (maiz ? '<div style="font-size:11.5px;color:#8C9196;margin-top:8px;line-height:1.4;">Fuente: ' + FUENTE + ', tablas 4 y 6. SAFIA orienta; la dosis final la define el ingeniero agrónomo.</div>' : '') + '</div></details>';
  }

  /* ---------- formulario de carga ---------- */
  // op = { equipo, campo, campana, cultivo, alGuardar(evento, riego) }
  function abrir(op) {
    var eq = op.equipo; if (!eq) return;
    var ha = hectareas(eq, op.cultivo), d = document.getElementById('safiaFertiModal'); if (d) d.remove();
    d = document.createElement('div'); d.id = 'safiaFertiModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:99980;background:rgba(20,25,30,.55);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:inherit;';
    var IN = 'width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #E1E4E7;border-radius:10px;font-size:15px;font-family:inherit;background:#fff;color:#2E3236;', LB = 'display:block;font-size:12px;font-weight:700;color:#6B7075;margin:12px 0 4px;';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
      '<div style="font-size:18px;font-weight:800;color:#2E3236;">Fertirriego por el pivot</div>' +
      '<div style="font-size:13px;color:#6B7075;line-height:1.45;margin-top:4px;">Cargá los <b>kilos de producto</b> (la materia prima). SAFIA saca los kilos de nutriente por la fórmula.</div>' +
      '<label style="' + LB + '">Fecha</label><input id="ftFecha" type="date" value="' + hoy() + '" max="' + hoy() + '" style="' + IN + '">' +
      '<label style="' + LB + '">Producto (con su fórmula N-P-K)</label><input id="ftProducto" list="ftLista" placeholder="Ejemplo: Urea 46-00-00" autocomplete="off" style="' + IN + '"><datalist id="ftLista">' + PRODUCTOS.map(function (p) { return '<option value="' + esc(p.n) + '">'; }).join('') + '</datalist>' +
      '<div style="display:flex;gap:8px;"><div style="flex:1;"><label style="' + LB + '">Kilos de producto</label><input id="ftDosis" type="number" inputmode="decimal" step="0.1" min="0" placeholder="100" style="' + IN + '"></div>' +
        '<div style="flex:1;"><label style="' + LB + '">Son…</label><select id="ftModo" style="' + IN + '"><option value="ha">kg por hectárea</option><option value="total">kg en toda la vuelta</option></select></div></div>' +
      (ha ? '' : '<label style="' + LB + '">Hectáreas del pivot</label><input id="ftHa" type="number" inputmode="decimal" step="0.1" min="0" style="' + IN + '">') +
      '<div id="ftResultado" style="margin-top:12px;padding:11px 13px;border-radius:10px;background:#F4F5F6;font-size:14px;line-height:1.5;color:#41464B;">Elegí el producto y poné los kilos.</div>' +
      '<details style="margin-top:12px;"><summary style="cursor:pointer;font-size:13.5px;font-weight:700;color:#2E3236;">La cuenta del tanque y el riego de esa vuelta (opcional)</summary>' +
        '<label style="' + LB + '">Lámina de esa vuelta (mm)</label><input id="ftLamina" type="number" inputmode="decimal" step="0.1" min="0" placeholder="Ejemplo: 10" style="' + IN + '">' +
        '<label style="display:flex;gap:10px;align-items:center;margin-top:8px;font-size:13.5px;color:#2E3236;cursor:pointer;"><input type="checkbox" id="ftRiego" style="width:20px;height:20px;flex:none;"> Cargar también ese riego (si todavía no lo cargaste)</label>' +
        '<div style="display:flex;gap:8px;"><div style="flex:1;"><label style="' + LB + '">Litros de solución en el tanque</label><input id="ftLitros" type="number" inputmode="decimal" step="1" min="0" style="' + IN + '"></div>' +
        '<div style="flex:1;"><label style="' + LB + '">Horas que tarda la vuelta</label><input id="ftHoras" type="number" inputmode="decimal" step="0.1" min="0" style="' + IN + '"></div></div>' +
        '<div id="ftTanque" style="margin-top:8px;font-size:13px;color:#6B7075;line-height:1.45;"></div></details>' +
      '<label style="' + LB + '">Observaciones (opcional)</label><textarea id="ftObs" rows="2" style="' + IN + '"></textarea>' +
      '<div id="ftMsg" style="display:none;margin-top:10px;padding:9px 12px;border-radius:8px;background:#FBECEA;color:#B5371C;font-size:13.5px;font-weight:600;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;"><button id="ftCancelar" style="flex:1;padding:13px;border-radius:10px;border:1.5px solid #E1E4E7;background:#fff;color:#41464B;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;">Cancelar</button>' +
      '<button id="ftGuardar" style="flex:2;padding:13px;border-radius:10px;border:0;background:#22A93A;color:#fff;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;">Guardar</button></div></div>';
    document.body.appendChild(d);
    var $ = function (id) { return document.getElementById(id); }, horasTocadas = false;
    function leer() {
      var area = ha || num(($('ftHa') || {}).value), kg = num($('ftDosis').value), modo = $('ftModo').value;
      var kgHa = kg == null ? null : modo === 'total' ? (area ? kg / area : null) : kg;
      return { producto: $('ftProducto').value.trim(), area: area, kgHa: kgHa, kgTotal: kgHa != null && area ? kgHa * area : (modo === 'total' ? kg : null), nu: nutrientes($('ftProducto').value, kgHa), lamina: num($('ftLamina').value), litros: num($('ftLitros').value), horas: num($('ftHoras').value) };
    }
    function pintar() {
      var L = leer(), r = $('ftResultado');
      if (!horasTocadas) { var hv = horasVuelta(eq, L.lamina); if (hv) $('ftHoras').value = Math.round(hv * 10) / 10; L.horas = num($('ftHoras').value); }
      if (!L.producto || L.kgHa == null) { r.style.background = '#F4F5F6'; r.innerHTML = $('ftModo').value === 'total' && !L.area ? 'Para pasar los kilos de toda la vuelta a kilos por hectárea hacen falta las hectáreas del pivot.' : 'Elegí el producto y poné los kilos.'; }
      else if (!L.nu) { r.style.background = '#FDF3E3'; r.innerHTML = '<b>' + fmt(L.kgHa, 0) + ' kg/ha de ' + esc(L.producto) + '.</b><br>No reconozco la fórmula: escribila en el nombre, por ejemplo "20-05-20", para que SAFIA saque los kilos de nutriente.'; }
      else { r.style.background = '#E7F6EA'; r.innerHTML = '<b>' + fmt(L.kgHa, L.kgHa < 10 ? 1 : 0) + ' kg/ha de ' + esc(L.producto) + '</b> (fórmula ' + [L.nu.grado.n, L.nu.grado.p2o5, L.nu.grado.k2o].map(function (x) { return ('0' + fmt(x, 0)).slice(-2); }).join('-') + ')<br>= <b style="font-size:16px;color:#178029;">' + (textoNutrientes(L.nu) || 'sin N, P ni K') + '</b> por hectárea' + (L.area ? '<br><span style="font-size:12.5px;color:#41464B;">Para las ' + fmt(L.area, L.area % 1 ? 1 : 0) + ' ha de la vuelta: <b>' + fmt(L.kgTotal, 0) + ' kg de producto</b>.</span>' : ''); }
      var t = $('ftTanque');
      t.innerHTML = L.litros > 0 && L.horas > 0 ? '<b style="color:#2E3236;">Inyectar a ' + fmt(L.litros / L.horas, L.litros / L.horas < 10 ? 1 : 0) + ' litros por hora</b> (' + fmt(L.litros / L.horas / 60, 2) + ' L/min): ' + fmt(L.litros, 0) + ' L en las ' + fmt(L.horas, 1) + ' h de la vuelta, parejo de principio a fin.' + (L.kgTotal ? ' Concentración: ' + fmt(L.kgTotal / L.litros * 1000, 0) + ' g de producto por litro.' : '')
        : 'Con los litros de solución y las horas de la vuelta SAFIA dice a cuántos litros por hora poner la inyectora. La inyección va pareja durante toda la vuelta.';
    }
    ['ftProducto', 'ftDosis', 'ftModo', 'ftHa', 'ftLamina', 'ftLitros'].forEach(function (id) { var e = $(id); if (e) { e.addEventListener('input', pintar); e.addEventListener('change', pintar); } });
    $('ftHoras').addEventListener('input', function () { horasTocadas = true; pintar(); });
    $('ftCancelar').addEventListener('click', function () { d.remove(); });
    $('ftGuardar').addEventListener('click', function () {
      var L = leer(), msg = function (t) { var m = $('ftMsg'); m.textContent = t; m.style.display = 'block'; };
      if (!L.producto) return msg('Escribí o elegí el producto.');
      if (L.kgHa == null || L.kgHa <= 0) return msg($('ftModo').value === 'total' && !L.area ? 'Faltan las hectáreas del pivot para saber los kilos por hectárea.' : 'Poné los kilos de producto.');
      if ($('ftRiego').checked && !(L.lamina > 0)) return msg('Para cargar el riego hace falta la lámina de esa vuelta en mm.');
      var fecha = $('ftFecha').value || hoy(), nu = L.nu, t = Date.now(), ahora = new Date().toISOString();
      var ev = { id: t, fecha: fecha, equipoId: eq.id, campanaId: op.campana ? op.campana.id : null, tipo: 'aplicacion', metodo: 'fertirriego', producto: L.producto, dosis: Math.round(L.kgHa * 100) / 100, unidad: 'kg/ha',
        observaciones: $('ftObs').value.trim(), cargadoPor: 'manual', fechaCreacion: ahora };
      if (L.kgTotal) ev.kgTotal = Math.round(L.kgTotal); if (L.lamina > 0) ev.laminaMm = L.lamina; if (L.litros > 0) ev.litrosSolucion = L.litros; if (L.horas > 0) ev.horasVuelta = L.horas;
      if (nu) {   // mismo formato que la Aplicación del Operador (P y K elementales) + los óxidos tal como se leen de la fórmula
        ev.formula = [nu.grado.n, nu.grado.p2o5, nu.grado.k2o].join('-'); ev.n_pct = nu.grado.n; ev.p_pct = Math.round(nu.grado.p2o5 / P_A_P2O5 * 100) / 100; ev.k_pct = Math.round(nu.grado.k2o / K_A_K2O * 100) / 100;
        ev.n_kg_ha = Math.round(nu.n * 100) / 100; ev.p_kg_ha = Math.round(nu.p2o5 / P_A_P2O5 * 100) / 100; ev.k_kg_ha = Math.round(nu.k2o / K_A_K2O * 100) / 100;
        ev.p2o5_kg_ha = Math.round(nu.p2o5 * 100) / 100; ev.k2o_kg_ha = Math.round(nu.k2o * 100) / 100;
      }
      var l = lista('eventos'), riego = null; l.push(ev);
      if ($('ftRiego').checked) { riego = { id: t + 1, fecha: fecha, equipoId: eq.id, campanaId: ev.campanaId, tipo: 'riego', cantidad: L.lamina, observaciones: 'Riego con fertirriego', cargadoPor: 'manual', fechaCreacion: ahora }; l.push(riego); }
      localStorage.setItem('eventos', JSON.stringify(l));
      d.remove();
      if (op.alGuardar) op.alGuardar(ev, riego, nu);
    });
    setTimeout(function () { try { $('ftProducto').focus(); } catch (e) {} }, 50);
  }

  /* ---------- para el parte y el Asistente ---------- */
  function resumen(eq, campo, camp, cultivo) {
    if (!eq || !camp || !cultivo) return null;
    var ap = aplicado(eq, camp, cultivo), r = { fertirriegos: ap.veces.map(function (v) { return { fecha: v.fecha, dia_desde_siembra: v.dds, producto: v.producto, kg_de_producto_por_ha: v.dosis, nutrientes_por_ha: textoNutrientes(v.nutrientes) }; }), total_por_el_pivot_por_ha: textoNutrientes(ap.fertirriego) || 'nada' };
    if (esMaiz(cultivo)) { var P = planMaiz(eq, campo, camp, cultivo); r.plan_de_nitrogeno_del_maiz = P.pasos ? { n_en_cobertura_kg_ha: P.nCobertura, para_meta_t_ha: P.metaT, textura: P.textura, a_la_siembra_kg_ha: P.nSiembra, aplicaciones: P.pasos.map(function (s) { return s.hojas + ': ' + Math.round(s.kg) + ' kg N/ha (' + s.pct + ' %)' + (s.dias ? ', ' + s.dias : ''); }), aplicado_despues_de_siembra_kg_ha: Math.round(P.nHecho), falta_kg_ha: Math.round(P.nFalta), que_toca_ahora: P.ahora, notas: P.notas, fuente: FUENTE + ', tablas 4 y 6' } : { falta: P.falta }; }
    else r.plan = 'SAFIA arma el plan de nitrógeno por etapa solo para maíz grano (tabla de Embrapa verificada). En soja Embrapa no recomienda nitrógeno mineral. Para otros cultivos registra y suma lo aplicado; la dosis la define el agrónomo.';
    return r;
  }

  window.SafiaFertirriego = { abrir: abrir, htmlTarjeta: htmlTarjeta, grado: grado, nutrientes: nutrientes, textoNutrientes: textoNutrientes, aplicado: aplicado, planMaiz: planMaiz, esMaiz: esMaiz, horasVuelta: horasVuelta, resumen: resumen, PRODUCTOS: PRODUCTOS, FUENTE: FUENTE };
})();
