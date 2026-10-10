/* SAFIA — Igualar al mejor (Banco → Meta de rinde)
   -------------------------------------------------------------------
   Un solo camino para el productor:
     1. elegir con quién compararse: el mejor lote de su localidad, departamento o de todo el banco
        (o uno que eligió en el Ranking), del mismo cultivo, la misma finalidad y el mismo régimen de agua;
     2. ver su tierra y su manejo frente a los de ese lote (suelo, variedad, época, agua, prácticas) y por qué rinde más;
     3. el plan con costos para igualarlo (SafiaMeta.plan con opciones.referencia);
     4. si con lo que se puede corregir no se llega: hasta dónde llega este lote, qué no se corrige con insumos,
        y el plan por etapas (correctivos una vez, manejo cada campaña, rotación y cobertura, control).
   Los lotes de otros productores se muestran siempre sin nombre ("Lote de <localidad>"): regla de SAFIA.
   Uso: SafiaIgualar.pintar(contenedor, casoBase, casos, { elegido, alElegir(ref), alIgualar(ref) })
        SafiaIgualar.comparacionHTML(pl) · SafiaIgualar.alcanceHTML(pl, py) · SafiaIgualar.etapasHTML(pl, py) */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || n === '' || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0 }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function clave(c) { return window.SafiaMeta && SafiaMeta.claveCultivo ? SafiaMeta.claveCultivo(c) : norm(c); }
  function grupo(c) { return window.SafiaCasos && SafiaCasos.grupoFinalidad ? SafiaCasos.grupoFinalidad(c.cultivo, c.finalidad) : ''; }
  function fechaCorta(f) { return f ? String(f).slice(8, 10) + '/' + String(f).slice(5, 7) : '—'; }
  function riegoTxt(c) { return c.riego === false ? 'secano' : 'con riego'; }

  // Zafra genérica a partir de la siembra (nunca el nombre que le puso otro productor a su campaña)
  function zafra(c) {
    var f = String(c.siembra || c.cosecha || ''); var y = parseInt(f.slice(0, 4), 10), m = parseInt(f.slice(5, 7), 10);
    if (!y) return c.campana || '—';
    if (m >= 9) return 'Zafra ' + y + '/' + String(y + 1).slice(2);
    if (m <= 3) return 'Zafriña ' + y;
    if (m <= 8) return 'Invierno ' + y;
    return 'Zafra ' + y;
  }
  // Nombre para mostrar: lo propio con su nombre; lo de otros productores, sin nombre
  function etiqueta(c, base) {
    if (base && c.campoId != null && String(c.campoId) === String(base.campoId)) return 'Tu lote' + (c.equipo ? ' ' + c.equipo : '') + (c.riego === false ? ' (secano)' : '');
    if (base && c.clienteId != null && base.clienteId != null && String(c.clienteId) === String(base.clienteId)) return 'Tu campo ' + (c.campo || '');
    if (/^Lote \d+ de /.test(c.campo || '')) return c.campo;   // ya viene anónimo de la nube (datos de la zona)
    return 'Lote de ' + (c.localidad || c.departamento || 'la zona');
  }

  /* ---------- candidatos: mismo cultivo, misma finalidad, otro campo, cosechados ---------- */
  function candidatos(base, casos, f) {
    f = f || {};
    var l = (casos || []).filter(function (c) {
      // otro lote (del mismo campo también vale: el secano propio se compara con el pivot propio)
      var mismoLote = (c.equipoId != null && base.equipoId != null) ? String(c.equipoId) === String(base.equipoId) : String(c.campoId) === String(base.campoId);
      return c && !c.esNueva && num(c.rindeKgHa) > 0 && !mismoLote && clave(c.cultivo) === clave(base.cultivo) && grupo(c) === grupo(base);
    });
    if (f.riego !== 'todos') l = l.filter(function (c) { return (c.riego !== false) === (base.riego !== false); });
    if (f.ambito === 'localidad') l = l.filter(function (c) { return base.localidad && norm(c.localidad) === norm(base.localidad); });
    else if (f.ambito === 'departamento') l = l.filter(function (c) { return base.departamento && norm(c.departamento) === norm(base.departamento); });
    else if (f.ambito === 'region') { var rb = regionDe(base); l = l.filter(function (c) { return rb && regionDe(c) === rb; }); }
    return l.sort(function (a, b) { return b.rindeKgHa - a.rindeKgHa; });
  }
  // Región de Paraguay (SafiaCasos.region): el Chaco se compara con el Chaco y la Oriental con la Oriental
  function regionDe(x) { return window.SafiaCasos && SafiaCasos.region ? SafiaCasos.region(x) : null; }
  function regionTxt(x) { return window.SafiaCasos && SafiaCasos.regionNombre ? SafiaCasos.regionNombre(regionDe(x)) : ''; }
  function ambitoInicial(base, casos, riego) {
    if (candidatos(base, casos, { ambito: 'localidad', riego: riego }).length) return 'localidad';
    if (candidatos(base, casos, { ambito: 'departamento', riego: riego }).length) return 'departamento';
    // aunque no haya lotes en su región, no se sale a buscar a la otra: el que quiera mirar todo el banco lo elige
    if (regionDe(base)) return 'region';
    return 'todo';
  }

  /* ---------- selector "¿A quién querés igualar?" ---------- */
  var estado = { filtros: null, baseId: null };
  function pintar(cont, base, casos, op) {
    op = op || {};
    if (!cont) return;
    if (!base) { cont.innerHTML = ''; return; }
    if (!estado.filtros || estado.baseId !== base.id) { var r0 = 'igual'; estado.filtros = { riego: r0, ambito: ambitoInicial(base, casos, r0) }; estado.baseId = base.id; }
    // si el lote pedido (Ranking o Evolución) no entra en los filtros, se abren los filtros
    if (op.elegido) { var enLista = candidatos(base, casos, estado.filtros).some(function (c) { return String(c.id) === String(op.elegido); }); if (!enLista) estado.filtros = { riego: 'todos', ambito: 'todo' }; }
    var f = estado.filtros, lista = candidatos(base, casos, f);
    var n = function (a, r) { return candidatos(base, casos, { ambito: a, riego: r || f.riego }).length; };
    var regimen = base.riego === false ? 'secano' : 'riego';
    var h = '<div class="card"><div class="card-h"><h3>¿A quién querés igualar?</h3><span class="muted">' + esc(base.cultivo) + ' · ' + esc(window.SafiaCasos ? SafiaCasos.finalidadTexto(base.finalidad).toLowerCase() : '') + ' · tu campaña base: ' + fmt(base.rindeKgHa, 0) + ' kg/ha ' + riegoTxt(base) + '</span></div>' +
      '<div class="muted" style="font-size:12px;margin-bottom:8px;">Lotes reales del banco de SAFIA, del mismo cultivo y la misma finalidad, ordenados por rinde. Elegí uno para copiar su material y su época y ver qué le falta a tu tierra para rendir lo mismo. Los lotes de otros productores se muestran sin nombre.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:8px;">' +
      '<div class="field" style="min-width:220px;"><label>Dónde buscar</label><select data-ig="ambito">' +
      [['localidad', 'Tu localidad' + (base.localidad ? ' (' + base.localidad + ')' : '')], ['departamento', 'Tu departamento' + (base.departamento ? ' (' + base.departamento + ')' : '')]].concat(regionDe(base) ? [['region', 'Tu región (' + regionTxt(base) + ')']] : []).concat([['todo', 'Todo el banco de SAFIA (Chaco y Oriental)']]).map(function (o) { return '<option value="' + o[0] + '"' + (f.ambito === o[0] ? ' selected' : '') + '>' + esc(o[1]) + ' · ' + n(o[0]) + ' lote(s)</option>'; }).join('') + '</select></div>' +
      '<div class="field" style="min-width:220px;"><label>Riego</label><select data-ig="riego"><option value="igual"' + (f.riego === 'igual' ? ' selected' : '') + '>Solo lotes ' + (regimen === 'secano' ? 'de secano' : 'con riego') + ', como el tuyo</option><option value="todos"' + (f.riego === 'todos' ? ' selected' : '') + '>Con riego y de secano</option></select></div>' +
      (lista.length ? '<button type="button" class="btn green" data-ig="mejor">Igualar al mejor (' + fmt(lista[0].rindeKgHa, 0) + ' kg/ha)</button>' : '') + '</div>';
    if (!lista.length) {
      h += '<div class="note">No hay lotes de ' + esc(base.cultivo).toLowerCase() + ' para esta finalidad con estos filtros. ' + (f.ambito !== 'todo' ? 'Probá buscar en todo el banco' + (f.riego === 'igual' ? ' o incluir riego y secano' : '') + '.' : (f.riego === 'igual' ? 'Probá incluir lotes con riego y de secano.' : 'A medida que se cierren campañas en SAFIA van a aparecer acá.')) + '</div></div>';
      cont.innerHTML = h; conectar(cont, base, casos, op, []); return;
    }
    h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th></th><th>#</th><th>Lote</th><th>Campaña</th><th>Material</th><th>Época · siembra</th><th>Riego</th><th class="r">Agua mm</th><th>Suelo</th><th class="r">Rinde kg/ha</th><th class="r">Frente al tuyo</th></tr></thead><tbody>' +
      '<tr><td><input type="radio" name="igRef" value=""' + (!op.elegido ? ' checked' : '') + '></td><td colspan="10" class="muted">Ninguno en particular: el plan se compara con los que ya cosechan la meta en la zona</td></tr>' +
      lista.slice(0, 15).map(function (c, i) {
        var d = c.rindeKgHa - base.rindeKgHa;
        return '<tr><td><input type="radio" name="igRef" value="' + esc(c.id) + '"' + (String(op.elegido) === String(c.id) ? ' checked' : '') + '></td><td>' + (i + 1) + '</td><td><b>' + esc(etiqueta(c, base)) + '</b>' + (c.localidad && f.ambito !== 'localidad' ? '<div class="sub">' + esc(c.localidad) + (c.departamento ? ', ' + esc(c.departamento) : '') + '</div>' : '') + '</td>' +
          '<td>' + esc(zafra(c)) + '</td><td>' + esc(c.variedad || '—') + '</td><td>' + esc(c.epoca || '—') + '<div class="sub">' + fechaCorta(c.siembra) + '</div></td><td>' + riegoTxt(c) + '</td>' +
          '<td class="r">' + fmt(c.aguaTotalMM, 0) + '</td><td>' + (c.suelo ? 'con análisis' : '<span class="muted">sin análisis</span>') + '</td>' +
          '<td class="r"><span class="num">' + fmt(c.rindeKgHa, 0) + '</span></td><td class="r">' + (d > 0 ? '<b style="color:#178029;">+' + fmt(d, 0) + '</b>' : '<span class="muted">' + (d === 0 ? 'igual' : fmt(d, 0)) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      (lista.length > 15 ? '<div class="muted" style="font-size:12px;margin-top:4px;">Se muestran los 15 que más rinden de ' + lista.length + '.</div>' : '') +
      '<div class="muted" style="font-size:12px;margin-top:6px;">Al elegir un lote, la meta pasa a ser su rinde y el plan usa su suelo, su material y su época como referencia. Sin análisis de suelo del lote elegido, la comparación de tierra no se puede hacer (el resto sí).</div></div>';
    cont.innerHTML = h;
    conectar(cont, base, casos, op, lista);
  }
  function conectar(cont, base, casos, op, lista) {
    var sa = cont.querySelector('[data-ig="ambito"]'), sr = cont.querySelector('[data-ig="riego"]'), bm = cont.querySelector('[data-ig="mejor"]');
    if (sa) sa.addEventListener('change', function () { estado.filtros.ambito = sa.value; pintar(cont, base, casos, Object.assign({}, op, { elegido: null })); if (op.alElegir) op.alElegir(null); });
    if (sr) sr.addEventListener('change', function () { estado.filtros.riego = sr.value; pintar(cont, base, casos, Object.assign({}, op, { elegido: null })); if (op.alElegir) op.alElegir(null); });
    if (bm) bm.addEventListener('click', function () { if (op.alIgualar) op.alIgualar(lista[0]); });
    cont.querySelectorAll('input[name="igRef"]').forEach(function (r) {
      r.addEventListener('change', function () { var ref = lista.find(function (c) { return String(c.id) === r.value; }) || null; if (op.alElegir) op.alElegir(ref); });
    });
  }

  /* ---------- tu lote frente al lote elegido ---------- */
  function comparacionHTML(pl) {
    var mio = pl.caso, ref = pl.referencia; if (!mio || !ref) return '';
    var esProy = mio.id === 'prospecto';   // Evaluar proyecto: todavía no sembró
    var filas = [];
    // diferencia = tu lote menos el lote elegido, en la unidad del dato y en % sobre el valor del lote elegido
    function dif(x, y, dec) {
      x = num(x); y = num(y); if (x == null || y == null) return '<span class="muted">—</span>';
      var rd = function (v) { return Number(v.toLocaleString('en-US', { maximumFractionDigits: dec || 0, useGrouping: false })); }; x = rd(x); y = rd(y);   // resta de lo que se ve en pantalla
      var d = x - y, p = y ? d / Math.abs(y) * 100 : null, s = function (v, k) { return (v > 0 ? '+' : '') + fmt(v, k); };
      if (Math.abs(d) < Math.pow(10, -(dec || 0)) / 2) return '<span class="muted">igual</span>';
      return '<b>' + s(d, dec) + '</b>' + (p != null ? '<div class="sub">' + s(p, Math.abs(p) < 10 ? 1 : 0) + ' %</div>' : '');
    }
    function fila(n, a, b, lect, d) { filas.push('<tr><td>' + n + '</td><td class="r">' + a + '</td><td class="r">' + b + '</td><td class="r" style="white-space:nowrap;">' + (d || '') + '</td><td style="white-space:normal;min-width:170px;">' + (lect || '') + '</td></tr>'); }
    var peor = function (t) { return '<span style="color:#B3261E;font-weight:600;">' + t + '</span>'; }, ok = '<span class="muted">ok</span>';
    fila('<b>Rinde</b>', '<b>' + fmt(mio.rindeKgHa, 0) + '</b> kg/ha', '<b>' + fmt(ref.rindeKgHa, 0) + '</b> kg/ha', ref.rindeKgHa > mio.rindeKgHa ? peor('faltan ' + fmt(ref.rindeKgHa - mio.rindeKgHa, 0) + ' kg/ha') : 'ya rendís lo mismo o más', dif(mio.rindeKgHa, ref.rindeKgHa, 0));
    fila('Riego', riegoTxt(mio), riegoTxt(ref), (mio.riego === false) !== (ref.riego === false) ? peor(mio.riego === false ? 'el lote elegido riega y el tuyo no' : 'el lote elegido es de secano') : ok);
    if (esProy) fila('Agua del ciclo (lluvia + riego)', '<span class="muted">con riego, la que pida el cultivo</span>', fmt(ref.aguaTotalMM, 0) + ' mm', '<span class="muted">el riego que lleva cada cultivo está en la tarjeta de clima</span>');
    else fila('Agua del ciclo (lluvia + riego)', fmt(mio.aguaTotalMM, 0) + ' mm', fmt(ref.aguaTotalMM, 0) + ' mm', mio.aguaTotalMM != null && ref.aguaTotalMM != null && mio.aguaTotalMM < ref.aguaTotalMM * 0.9 ? peor(fmt(ref.aguaTotalMM - mio.aguaTotalMM, 0) + ' mm menos') : (mio.aguaTotalMM == null || ref.aguaTotalMM == null ? '<span class="muted">sin dato en uno de los dos</span>' : ok), dif(mio.aguaTotalMM, ref.aguaTotalMM, 0));
    // material: grupo de madurez / ciclo de cada uno y guía de la zona (SafiaMateriales, con fuente)
    var LM = window.SafiaMateriales ? SafiaMateriales.lectura(mio, ref) : null;
    var lectMat = LM ? (/^mismo/.test(LM.corta) || /^<span/.test(LM.corta) ? LM.corta : peor(LM.corta)) : (mio.variedad && ref.variedad && norm(mio.variedad) !== norm(ref.variedad) ? peor('otro material') : (mio.variedad && ref.variedad ? 'mismo material' : '<span class="muted">sin dato</span>'));
    // cada dato debajo de su columna: tu material | el del lote elegido | diferencia de grupo de madurez | lectura
    var linkNivel = function (d) { return d && d.url ? ' · <a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.nivel || 'fuente') + '</a>' : ''; };
    var celdaMat = function (nombre, d) {
      if (!nombre) return '—';
      var sub = '';
      if (LM && LM.cu === 'soja') sub = d ? (d.gm != null ? 'GM ' + fmt(d.gm, 1) : 'GM sin dato') + (d.habito ? ' · ' + d.habito : '') + linkNivel(d) : 'sin dato verificado';
      else if (LM && LM.cu === 'maiz') sub = d ? [d.ciclo, d.gduFlor ? fmt(d.gduFlor, 0) + ' GDU a floración' : ''].filter(Boolean).join(' · ') + linkNivel(d) + (d.senave ? '<div class="sub" style="white-space:normal;">SENAVE PY: ' + esc(d.senave) + '</div>' : '') : 'sin dato verificado';
      return esc(nombre) + (sub ? '<div class="sub" style="white-space:normal;">' + sub + '</div>' : '');
    };
    var difMat = '';
    if (LM && LM.difGM != null && !LM.mismo) difMat = Math.abs(LM.difGM) < 0.05 ? '<span class="muted">igual</span>' : '<b>' + (LM.difGM > 0 ? '+' : '') + Number(LM.difGM).toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '</b><div class="sub">grupo de madurez</div>';
    else if (LM && LM.difGDU != null && !LM.mismo) difMat = '<b>' + (LM.difGDU > 0 ? '+' : '') + fmt(LM.difGDU, 0) + '</b><div class="sub">GDU a floración</div>';
    if (esProy) fila('Material', '<span class="muted">a elegir</span>', celdaMat(ref.variedad, LM && LM.b), '<span class="muted">abajo: qué material conviene para este campo</span>');
    else fila('Material', celdaMat(mio.variedad, LM && LM.a), celdaMat(ref.variedad, LM && LM.b), lectMat + (LM && LM.otraEmpresa ? '<div class="sub">los grados-día de empresas distintas no se comparan</div>' : ''), difMat);
    // sanidad del material (soja), solo si alguno de los dos tiene dato
    if (LM && LM.cu === 'soja' && ((LM.a && LM.a.sanidad) || (LM.b && LM.b.sanidad)) && !LM.mismo) {
      var san = function (d) { return d && d.sanidad ? esc(d.sanidad.charAt(0).toUpperCase() + d.sanidad.slice(1)) : '<span class="muted">sin dato</span>'; };
      filas.push('<tr><td>Sanidad del material</td><td class="r" style="white-space:normal;font-size:12.5px;">' + san(LM.a) + '</td><td class="r" style="white-space:normal;font-size:12.5px;">' + san(LM.b) + '</td><td></td><td style="white-space:normal;"><span class="muted">según la ficha de cada material</span></td></tr>');
    }
    // guía de la zona (INBIO): título en la primera columna y el texto a lo ancho, de izquierda a derecha
    if (LM && LM.zonaHTML) filas.push('<tr><td style="white-space:normal;">Grupo de madurez para tu zona</td><td colspan="4" style="white-space:normal;font-size:12.5px;line-height:1.5;">' + LM.zonaHTML + '</td></tr>');
    fila('Época · fecha de siembra', esc(mio.epoca || '—') + ' · ' + fechaCorta(mio.siembra), esc(ref.epoca || '—') + ' · ' + fechaCorta(ref.siembra), mio.epoca && ref.epoca && norm(mio.epoca) !== norm(ref.epoca) ? peor('otra época') : ok);
    if (!esProy && (mio.densidad || ref.densidad)) fila('Densidad (plantas/ha)', fmt(mio.densidad, 0), fmt(ref.densidad, 0), !(mio.densidad && ref.densidad) ? '<span class="muted">sin dato en uno de los dos</span>' : (Math.abs(mio.densidad - ref.densidad) / ref.densidad > 0.15 ? peor('diferencia de más de 15 %') : ok), dif(mio.densidad, ref.densidad, 0));
    var ra = mio.rotacion || {}, rb = ref.rotacion || {};
    if (esProy && rb.cargada) fila('Antecesor · cobertura', '<span class="muted">a planificar</span>', esc((rb.anterior || '—') + (rb.conCobertura ? ' · con cobertura' : '')), rb.conCobertura ? '<span style="color:#8B6F00;font-weight:600;">el líder venía de cobertura</span>' : '<span class="muted">—</span>');
    else if (ra.cargada || rb.cargada) fila('Antecesor · cobertura', esc((ra.anterior || '—') + (ra.conCobertura ? ' · con cobertura' : '')), esc((rb.anterior || '—') + (rb.conCobertura ? ' · con cobertura' : '')), rb.conCobertura && !ra.conCobertura ? peor('el lote elegido venía de cobertura') : ok);
    if (mio.suelo && ref.suelo && window.SafiaCasos) {
      SafiaCasos.PARAMS_SUELO.forEach(function (p) {
        var a = num(mio.suelo[p.k]), b = num(ref.suelo[p.k]); if (a == null || b == null) return;
        var d = a - b, rel = b ? d / Math.abs(b) : 0, falta = p.k === 'ph' ? d < -0.3 : rel < -0.15;
        // la arcilla no es mejor ni peor: es la textura, que no se corrige (se explica en ¿Llega este lote?)
        var lect = p.k === 'arcilla' ? (Math.abs(d) >= 10 ? '<span style="color:#8B6F00;font-weight:600;">' + (d < 0 ? 'suelo más liviano' : 'suelo más arcilloso') + ' (textura: no se corrige)</span>' : ok) : (falta ? peor('menos que el lote elegido') : ok);
        fila(esc(p.n) + (p.unidad ? ' <span class="sub">' + esc(p.unidad) + '</span>' : ''), fmt(a, p.dec), fmt(b, p.dec), lect, dif(a, b, p.dec));
      });
    } else filas.push('<tr><td>Suelo</td><td colspan="4" class="muted" style="white-space:normal;">' + (!mio.suelo ? 'Tu lote no tiene análisis de suelo cargado.' : 'El lote elegido no tiene análisis de suelo: la tierra no se puede comparar; el plan usa las tablas de alto rinde.') + '</td></tr>');
    // prácticas que hizo el otro lote y el tuyo no (solo si los dos tienen el manejo cargado)
    var prac = [];
    if (window.SafiaInsumos && mio.manejo && ref.manejo && mio.manejo.cargado && ref.manejo.cargado) SafiaInsumos.PRACTICAS.forEach(function (p) { if (SafiaInsumos.tiene(ref.manejo, p.k) && !SafiaInsumos.tiene(mio.manejo, p.k)) prac.push(p.n); });
    var d = window.SafiaAgro ? SafiaAgro.diagnosticarDiferencia(mio, ref, mio.cultivo) : null;
    var fac = d && d.factores ? d.factores.slice(0, 5) : [];
    return '<div class="card" style="margin-bottom:12px;"><div class="card-h"><h3>' + (esProy ? 'Tu campo' : 'Tu lote') + ' frente a ' + esc(etiqueta(ref, mio)) + '</h3><span class="muted">' + esc(zafra(ref)) + ' · ' + esc(ref.variedad || 'material sin dato') + ' · ' + fmt(ref.rindeKgHa, 0) + ' kg/ha ' + riegoTxt(ref) + '</span></div>' +
      '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th></th><th class="r">' + (esProy ? 'Tu campo (proyecto)' : 'Tu lote (' + esc(mio.campana || '') + ')') + '</th><th class="r">Lote elegido</th><th class="r">Diferencia</th><th>Lectura</th></tr></thead><tbody>' + filas.join('') + '</tbody></table></div></div>' +
      (prac.length ? '<div class="note warn" style="margin-top:8px;">El lote elegido hizo y el tuyo no registró: <b>' + prac.map(esc).join(', ') + '</b>.</div>' : '') +
      (fac.length ? '<div style="font-weight:700;margin-top:12px;">Lo que más explica la diferencia, en orden</div><ol style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.5;">' + fac.map(function (x) { var t = String(x.texto || ''), n = String(x.nombre || ''); if (t.indexOf(n + ':') === 0) t = t.slice(n.length + 1).trim(); return '<li style="margin-bottom:4px;"><b>' + esc(n) + ':</b> ' + esc(t) + '</li>'; }).join('') + '</ol>' : '') +
      (window.SafiaMateriales ? SafiaMateriales.ensayosHTML(mio, ref) + SafiaMateriales.notaHTML(mio.cultivo, mio) : '') +
      '</div>';
  }

  /* ---------- hasta dónde llega este lote ---------- */
  function alcanceHTML(pl, py) {
    var mio = pl.caso || {}, ref = pl.referencia, pot = pl.potencial || {};
    var llega = pl.meta <= pot.max;
    var h = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>¿Llega ' + (mio.id === 'prospecto' ? 'este campo' : 'este lote') + ' a ' + fmt(pl.meta, 0) + ' kg/ha?</h3><span class="muted">' + (ref ? 'el rinde del lote elegido' : 'la meta') + ' · ' + (mio.id === 'prospecto' ? 'con riego y manejo promedio ' : 'hoy ') + fmt(pl.actual, 0) + ' kg/ha</span></div>';
    if (llega) {
      h += '<div class="note ok">Sí: con el plan, este lote puede llegar a <b>' + fmt(pot.min, 0) + '–' + fmt(pot.max, 0) + ' kg/ha</b>, y la meta entra en ese rango. ' + (pl.meta > pot.min ? 'Está en la parte alta: depende de que respondan varios ítems del plan a la vez.' : 'Incluso con la respuesta mínima de cada ítem se llega.') + '</div>';
    } else {
      h += '<div class="note warn">Con todo lo que se puede corregir, este lote llega a <b>' + fmt(pot.min, 0) + '–' + fmt(pot.max, 0) + ' kg/ha</b>. Para ' + fmt(pl.meta, 0) + ' kg/ha faltan <b>' + fmt(pl.meta - pot.max, 0) + ' kg/ha</b> que no se cierran con correctivos ni fertilizantes.</div>';
      var causas = [];
      if (ref && mio.riego === false && ref.riego !== false) causas.push('<b>Riego.</b> El lote elegido riega y el tuyo es de secano' + (mio.aguaTotalMM != null && ref.aguaTotalMM != null ? ' (' + fmt(mio.aguaTotalMM, 0) + ' contra ' + fmt(ref.aguaTotalMM, 0) + ' mm en el ciclo)' : '') + '. Esa diferencia solo se cierra regando: se evalúa en <a href="evaluar.html">Evaluar proyecto</a> con el análisis de agua de la fuente.');
      if (pot.techoAgua != null && pot.techoAgua < pl.meta) causas.push('<b>Agua del ciclo.</b> Con el agua que tuvo esta campaña, el techo es <b>' + fmt(pot.techoAgua, 0) + ' kg/ha</b> (productividad del agua de Grassini). ' + (mio.riego === false ? 'En secano, un año más lluvioso o el riego lo suben.' : 'El plan ya suma los milímetros que faltan; si el equipo no llega a esa lámina en floración y llenado, ese es el límite.'));
      if (ref && mio.suelo && ref.suelo && num(mio.suelo.arcilla) != null && num(ref.suelo.arcilla) != null && num(ref.suelo.arcilla) - num(mio.suelo.arcilla) >= 10) causas.push('<b>Textura del suelo.</b> El lote elegido tiene ' + fmt(ref.suelo.arcilla, 0) + ' % de arcilla y el tuyo ' + fmt(mio.suelo.arcilla, 0) + ' %. Un suelo más liviano guarda menos agua y menos nutrientes, y la textura no se cambia: se compensa con riego frecuente, más materia orgánica (cobertura y rastrojo) y fertilización repartida.');
      if (ref && mio.clima && ref.clima) {
        var d35 = (num(mio.clima.diasMayor35) || 0) - (num(ref.clima.diasMayor35) || 0), dT = (num(mio.clima.tempMedia) || 0) - (num(ref.clima.tempMedia) || 0);
        if (d35 >= 3 || Math.abs(dT) >= 1.5) causas.push('<b>Clima del lugar.</b> ' + (d35 >= 3 ? 'Tu ciclo tuvo ' + fmt(mio.clima.diasMayor35, 0) + ' días de 35 °C o más contra ' + fmt(ref.clima.diasMayor35, 0) + ' del lote elegido. ' : '') + (Math.abs(dT) >= 1.5 ? 'Temperatura media ' + fmt(mio.clima.tempMedia, 1) + ' °C contra ' + fmt(ref.clima.tempMedia, 1) + ' °C. ' : '') + 'El clima no se corrige; la fecha de siembra sí puede correr la floración fuera de los días más calurosos.');
      }
      if (pot.techoReferencia && pl.meta > pot.techoReferencia) causas.push('<b>Techo del cultivo.</b> La meta supera el techo climático de referencia (' + fmt(pot.techoReferencia, 0) + ' kg/ha con agua sin límite).');
      if (!causas.length) causas.push('Con los datos cargados no aparece una causa fija (riego, textura o clima). La diferencia puede estar en manejo fino que no está registrado: densidad y stand, sanidad, fecha exacta, fertilización en cobertura. Cargar el manejo de la campaña en Campañas permite compararlo.');
      var gratis = [];
      if (ref && ref.variedad && norm(ref.variedad) !== norm(mio.variedad || '')) gratis.push('sembrar el mismo material (' + esc(ref.variedad) + ')');
      if (ref && ref.epoca && norm(ref.epoca) !== norm(mio.epoca || '')) gratis.push('sembrar en la misma época (' + esc(ref.epoca) + ')');
      h += '<div style="font-weight:700;margin-top:10px;">Lo que no se corrige con insumos</div><ul style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.55;">' + causas.map(function (c) { return '<li style="margin-bottom:5px;">' + c + '</li>'; }).join('') + '</ul>';
      if (gratis.length) h += '<div class="note" style="margin-top:8px;">El cálculo de arriba no cuenta la genética ni la fecha: además del plan, <b>' + gratis.join(' y ') + '</b> no cuesta más y puede cerrar parte de la diferencia. Conviene probarlo primero en una franja del lote.</div>';
      h += '<div class="note info" style="margin-top:8px;"><b>Meta por etapas:</b> primero llevar el lote a <b>' + fmt(pot.max, 0) + ' kg/ha</b> con el plan de abajo; con el análisis de suelo de control (a los 2 años) y las campañas nuevas, SAFIA vuelve a medir la distancia al lote elegido.</div>';
    }
    return h + '</div>';
  }

  /* ---------- plan por etapas ---------- */
  function etapasHTML(pl, py) {
    var mio = pl.caso || {}, items = pl.items || [];
    var inv = items.filter(function (i) { return i.inversion > 0; }), gas = items.filter(function (i) { return i.recurrente > 0; });
    var gratis = items.filter(function (i) { return !i.inversion && !i.recurrente && (i.k === 'variedad' || i.k === 'epoca' || i.k === 'stand' || i.k === 'rotacion'); });
    var li = function (i, costo, texto) { return '<li style="margin-bottom:4px;"><b>' + esc(i.nombre) + '</b>' + (costo ? ' · <span style="white-space:nowrap;">' + costo + '</span>' : '') + '<div class="muted" style="font-size:12px;">' + (texto || i.accion) + '</div></li>'; };
    var usd = function (v) { return v > 0 && v < 1 ? 'menos de US$ 1' : 'US$ ' + fmt(v, 0); };
    var h = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Plan por etapas</h3><span class="muted">qué se hace primero, qué cada campaña y cómo sigue el lote</span></div>';
    // rinde esperado año a año (misma proyección de la tabla de inversión: el primer año los correctivos rinden a la mitad)
    if (py && py.filas && py.filas.length) {
      h += '<div class="statbar" style="margin:0 0 10px;">' + py.filas.slice(0, 3).map(function (f) { return '<div class="stat"><div class="sl">Año ' + f.anio + '</div><div class="sv">' + fmt(pl.actual + f.extraPlan, 0) + '</div><div class="ss">kg/ha esperados</div></div>'; }).join('') +
        '<div class="stat"><div class="sl">Meta</div><div class="sv green">' + fmt(pl.meta, 0) + '</div><div class="ss">' + (pl.referencia ? 'rinde del lote elegido' : 'la que fijaste') + '</div></div></div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:8px;">El primer año los correctivos rinden a la mitad (el calcáreo tarda 6–12 meses en reaccionar); desde el segundo, pleno. Son estimaciones del plan, no una promesa.</div>';
    }
    h += '<ol style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.55;">';
    h += '<li style="margin-bottom:10px;"><b>Etapa 1 · Antes de la próxima siembra (una sola vez)</b>' + (inv.length ? '<ul style="margin:4px 0 0 16px;padding:0;">' + inv.map(function (i) { return li(i, usd(i.inversion) + '/ha · dura ' + i.vidaUtil + ' año' + (i.vidaUtil === 1 ? '' : 's')); }).join('') + '</ul>' : '<div class="muted">El suelo no necesita correcciones de fondo.</div>') + '</li>';
    h += '<li style="margin-bottom:10px;"><b>Etapa 2 · En cada campaña</b>' + (gas.length || gratis.length ? '<ul style="margin:4px 0 0 16px;padding:0;">' + gratis.map(function (i) { return li(i, 'sin costo'); }).join('') + gas.map(function (i) { return li(i, usd(i.recurrente) + '/ha por campaña', i.inversion > 0 ? 'Reponer cada campaña lo que se lleva el rinde más alto (manutención); la corrección de fondo está en la etapa 1.' : null); }).join('') + '</ul>' : '<div class="muted">Sin prácticas nuevas: seguir con el manejo actual.</div>') + '</li>';
    // rotación: el plan guardado del lote o la sugerencia de 3 años (Plan de rotación)
    var rot = null, guardado = false;
    if (window.SafiaRotacion && mio.equipoId) {
      var p = SafiaRotacion.planDelLote ? SafiaRotacion.planDelLote(mio.equipoId) : null;
      if (p && p.temporadas && p.temporadas.length) { rot = p.temporadas; guardado = true; }
      else if (SafiaRotacion.sugerirPlan) { try { rot = SafiaRotacion.sugerirPlan(mio.equipoId, 3); } catch (e) { rot = null; } }
    }
    var tRot = rot && rot.length ? rot.filter(function (t) { return t.cultivo; }).slice(0, 9).map(function (t) { return '<span style="white-space:nowrap;">' + esc(SafiaRotacion.etiqueta ? SafiaRotacion.etiqueta(t) : '') + ': <b>' + esc(t.cultivo) + '</b></span>'; }).join(' · ') : '';
    // el enlace a la pestaña Plan de rotación solo existe en el Banco
    var linkRot = document.querySelector && document.querySelector('.tabs button[data-tab="rotacion"]') ? '<a href="#" data-tab-ir="rotacion">Plan de rotación</a>' : 'el Plan de rotación del Banco (cuando el campo ya sea cliente)';
    h += '<li style="margin-bottom:10px;"><b>Etapa 3 · Rotación y cobertura (próximos 3 años)</b><div>' + (tRot ? (guardado ? 'Plan de rotación guardado del lote: ' : 'Sugerencia (Embrapa / CAPECO, en ' + linkRot + ' se puede ajustar y guardar): ') + tRot : 'Armar la rotación del lote en ' + linkRot + ': gramíneas entre sojas y cobertura en invierno sostienen la materia orgánica y cortan enfermedades.') + '</div></li>';
    h += '<li style="margin-bottom:4px;"><b>Etapa 4 · Control</b><div>Repetir el análisis de suelo a los 2 años (0–20 y 20–40 cm), reponer el calcáreo cuando venza y cerrar cada campaña con su rinde: SAFIA vuelve a comparar el lote con el elegido y ajusta el plan.</div></li>';
    return h + '</ol></div>';
  }

  /* ---------- prospecto (Evaluar proyecto): potencial con riego y cómo llegar al líder ----------
     Un prospecto todavía no cosechó: el punto de partida es "con riego y el manejo promedio de su zona"
     (referencia de la zona con riego, o los casos parecidos con riego). Desde ahí, igual que en la Meta de rinde:
     el líder de su localidad / departamento / banco (mismo cultivo, finalidad y con riego), su tierra frente a la
     del líder, el plan con costos para igualarlo (SafiaMeta.plan con el líder como referencia), hasta dónde llega
     y el plan por etapas. Para ensilaje y pasto (otra unidad) se compara, pero el plan con costos es de grano. */
  function prospectoHTML(o) {
    if (!window.SafiaCasos || !o || !o.cultivo) return '';
    var u = SafiaCasos.unidadDe(o.cultivo, o.finalidad), grano = u.k === 'grano', F = function (v) { return SafiaCasos.enUnidad(v, u); };
    var partida = null, deDonde = '';
    if (o.ref && o.ref.riego) { partida = o.ref.riego; deDonde = 'referencia de la zona con riego' + (o.ref.ambito ? ' (' + o.ref.ambito + ')' : ''); }
    else if (o.pot && o.pot.estimado) { partida = Math.round(o.pot.estimado); deDonde = 'casos parecidos con riego del banco'; }
    var sm = String(o.siembra || '').match(/^\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/), y = new Date().getFullYear();
    var siembraISO = sm ? y + '-' + String(+sm[2]).padStart(2, '0') + '-' + String(+sm[1]).padStart(2, '0') : null;
    var base = { id: 'prospecto', campoId: o.campoId != null ? o.campoId : 'prospecto', equipoId: null, clienteId: o.clienteId != null ? o.clienteId : null, campo: 'Proyecto', campana: 'Proyecto',
      cultivo: o.cultivo, finalidad: o.finalidad, riego: true, pais: o.pais || 'Paraguay', localidad: o.localidad || '', departamento: o.departamento || '', lat: o.lat, lon: o.lon, altitud: o.altitud,
      suelo: o.suelo || null, epoca: o.epoca || null, siembra: siembraISO, variedad: '', rindeKgHa: partida, manejo: null, rotacion: null, clima: null, aguaTotalMM: null };
    var filtros = { riego: 'igual', ambito: ambitoInicial(base, o.casos || [], 'igual') };
    var lista = candidatos(base, o.casos || [], filtros), lider = lista[0] || null;
    var nomAmb = filtros.ambito === 'localidad' ? (o.localidad || 'la localidad') : (filtros.ambito === 'departamento' ? (o.departamento || 'el departamento') : (filtros.ambito === 'region' ? 'la ' + regionTxt(base) : 'todo el banco de SAFIA'));
    var h = '<div class="card" style="margin-bottom:14px;"><div class="card-h"><h3>Potencial con riego y cómo llegar al líder</h3><span class="muted">' + esc(o.cultivo) + ' · ' + esc(SafiaCasos.finalidadTexto(o.finalidad).toLowerCase()) + '</span></div>';
    h += '<div class="statbar" style="margin:0 0 10px;">' +
      '<div class="stat"><div class="sl">Con riego, manejo promedio</div><div class="sv">' + (partida ? F(partida) : '—') + '</div><div class="ss">' + (partida ? u.corto + ' · ' + esc(deDonde) : 'sin referencia con riego ni casos') + '</div></div>' +
      '<div class="stat"><div class="sl">Líder de ' + esc(nomAmb) + '</div><div class="sv green">' + (lider ? F(lider.rindeKgHa) : '—') + '</div><div class="ss">' + (lider ? u.corto + ' · ' + esc(etiqueta(lider, base)) + ' · ' + esc(zafra(lider)) : 'todavía no hay lotes con riego de este cultivo') + '</div></div>' +
      (o.ref && o.ref.secano ? '<div class="stat"><div class="sl">Zona en secano</div><div class="sv">' + F(o.ref.secano) + '</div><div class="ss">' + u.corto + '</div></div>' : '') +
      '<div class="stat"><div class="sl">Sin riego, por falta de agua</div><div class="sv pot-agua" data-cultivo="' + esc(o.cultivo) + '">…</div><div class="ss">rendiría este % del potencial en este clima</div></div></div>';
    if (!lider) return h + '<div class="note">Todavía no hay lotes de ' + esc(o.cultivo).toLowerCase() + ' con riego (misma finalidad) ' + (filtros.ambito === 'region' ? 'en la ' + esc(regionTxt(base)) + '. Los de la otra región no se usan para igualar: otro clima y otro suelo' : 'en el banco de SAFIA para comparar') + '. A medida que se cierren campañas van a aparecer.</div>' + (window.SafiaMateriales ? SafiaMateriales.recomendacionHTML(base, null) : '') + '</div>';
    if (!partida) return h + '<div class="note">Sin referencia de la zona con riego ni casos parecidos, SAFIA no tiene un punto de partida para medir la distancia al líder.</div>' + (window.SafiaMateriales ? SafiaMateriales.recomendacionHTML(base, lider) : '') + '</div>';
    if (lider.rindeKgHa <= partida) {
      h += '<div class="note ok">Con riego y el manejo promedio de la zona ya se llegaría al nivel del líder de ' + esc(nomAmb) + ' (' + F(lider.rindeKgHa) + ' ' + u.corto + '). Lo que sigue es cuidar el suelo y el manejo para sostenerlo.</div>';
      return h + (window.SafiaMateriales ? SafiaMateriales.recomendacionHTML(base, lider) : '') + '</div>';
    }
    // tierra frente a la del líder, plan con costos, hasta dónde llega y etapas
    var pl = null, py = null;
    if (grano && window.SafiaMeta) {
      try { var pr = SafiaMeta.precios(); pl = SafiaMeta.plan(base, lider.rindeKgHa, pr, o.casos || [], [], { referencia: lider }); py = SafiaMeta.proyeccion(pl, [], pr, 5); } catch (e) { pl = null; }
    }
    if (pl) {
      var e = pl.economia;
      h += '<div class="note info" style="margin-bottom:10px;">Para pasar de <b>' + F(partida) + '</b> (con riego, manejo promedio) a <b>' + F(lider.rindeKgHa) + ' ' + u.corto + '</b> como el líder: inversión única de <b>US$ ' + fmt(e.inversionTotal, 0) + '/ha</b> y <b>US$ ' + fmt(e.recurrenteCultivo + e.recurrenteLote, 0) + '/ha</b> más por campaña; con el plan este campo llega a <b>' + F(pl.potencial.min) + '–' + F(pl.potencial.max) + '</b>. El detalle, abajo.</div>';
      h += comparacionHTML(pl);
      h += '<details style="margin-top:4px;"><summary style="cursor:pointer;font-weight:700;font-size:14px;">Plan con costos para igualar al líder</summary><div style="margin-top:8px;">' + SafiaMeta.informeHTML(pl) + '</div></details>';
      h += alcanceHTML(pl, py) + etapasHTML(pl, py);
    } else {
      h += comparacionHTML({ caso: base, referencia: lider });
      if (!grano) h += '<div class="note" style="margin-top:8px;">El plan con costos (correcciones, dosis y margen) está hecho para grano; para ' + esc(SafiaCasos.finalidadTexto(o.finalidad).toLowerCase()) + ' SAFIA compara la tierra y el manejo con el líder, sin armar el plan.</div>';
    }
    return h + (window.SafiaMateriales ? SafiaMateriales.recomendacionHTML(base, lider) : '') + '</div>';
  }

  window.SafiaIgualar = { prospectoHTML: prospectoHTML, candidatos: candidatos, etiqueta: etiqueta, zafra: zafra, pintar: pintar, comparacionHTML: comparacionHTML, alcanceHTML: alcanceHTML, etapasHTML: etapasHTML };
})();
