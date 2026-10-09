/* SAFIA — Economía del riego (Evaluar proyecto)
   -------------------------------------------------------------------
   La cuenta COMPLETA por hectárea de cada cultivo de grano, con riego y en secano, y la diferencia:
     ingreso = rinde × precio vigente (Datos → Precios)
     costos  = insumos + maquinaria + fletes + alquiler (si hay) + energía y mantenimiento del riego
               — de la referencia agrícola de la zona (base de Irrigar), misma finalidad y época —
             + reposición de lo que se llevan los kilos extra del riego: P₂O₅ y K₂O por tonelada adicional
               (manual RS/SC 2016, Tabela 6.1.2, vía SafiaFertilidad) y N en gramíneas (15 kg por t, el mismo
               criterio de la Meta de rinde). La base usa los mismos insumos con y sin riego: sin esta reposición
               el riego saldría "gratis" en fertilizante.
     margen  = ingreso − costos.
   Secano: el de la zona; si la zona no lo tiene, el rinde se estima con la simulación del clima del campo
   (FAO-33) y los costos son los de riego sin energía ni mantenimiento. Año seco = la peor zafra de los 10 años.
   Energía: la de la base, o los mm que pide el cultivo en ese campo × US$ por mm si se carga.
   La inversión se paga con lo que AGREGA el riego si hoy el campo produce en secano, o con el margen completo
   con riego si es un campo nuevo (lo elige el usuario). Inversión por proyecto (decisión de Osmar, 28-sep-2026): monto total
   o por partes (equipos, pozos, reservorio, eléctrica, obras). Todo el proyecto por año con la energía aparte (29-sep-2026).
   Chaco (Región Occidental): sin riego se hace UN solo cultivo por año (soja, maíz, algodón, sésamo, poroto…), no doble
   zafra como en la Oriental (Osmar, 29-sep-2026). Con riego entran todos los cultivos del proyecto; el secano se compara
   con el mejor de ellos hecho solo en el año.
   Solo grano: para ensilaje, fardos y pastoreo SAFIA no tiene precio de venta; se dice. */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d }); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  var N_POR_T = 15;   // kg de N por tonelada extra en gramíneas (mismo criterio que SafiaMeta.proyeccion, RS/SC maíz)

  // Tasa interna de retorno de un flujo [-inversión, f1, f2, …] (bisección); null si no hay cambio de signo
  function tir(flujos) {
    var vpn = function (r) { return flujos.reduce(function (a, f, t) { return a + f / Math.pow(1 + r, t); }, 0); };
    var lo = -0.99, hi = 10; if (vpn(lo) * vpn(hi) > 0) return null;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (vpn(lo) * vpn(m) <= 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  var PARTES_INV = [['equipo', 'Equipos de riego'], ['pozos', 'Pozos y bombas'], ['reservorio', 'Reservorio o tajamar'], ['electrica', 'Parte eléctrica'], ['obras', 'Obras y otros']];
  var CONCEPTOS = [['propio', 'Costo de producción propio (todo incluido)'], ['insumos', 'Insumos'], ['maquinas', 'Maquinaria'], ['fletes', 'Fletes'], ['alquiler', 'Alquiler'], ['energia', 'Energía del riego'], ['mant', 'Mantenimiento del riego'], ['reposicion', 'Reposición de lo que se llevan los kilos extra']];

  function calcular(o) {
    o = o || {};
    var pr = o.precios || (window.SafiaMeta ? SafiaMeta.precios() : { granoUSDt: {} });
    var clave = function (c) { return window.SafiaMeta && SafiaMeta.claveCultivo ? SafiaMeta.claveCultivo(c) : norm(c); };
    var ha = num(o.superficieHa), inv = num(o.inversionUSD), vida = num(o.vidaUtil), eMm = num(o.energiaUSDmm), nuevo = o.situacion === 'nuevo';
    var filas = (o.cultivos || []).map(function (c) {
      var u = window.SafiaCasos ? SafiaCasos.unidadDe(c.cultivo, c.finalidad) : { k: 'grano' };
      var f = { cultivo: c.cultivo, finalidad: c.finalidad, epoca: c.epoca || (c.ref && c.ref.epoca) || null };
      if (u.k !== 'grano') { f.error = 'sin precio de venta en SAFIA para ' + (window.SafiaCasos ? SafiaCasos.finalidadTexto(c.finalidad).toLowerCase() : 'esta finalidad') + ': no entra en la cuenta'; return f; }
      var ref = c.ref || {}, sim = c.riego && !c.riego.error ? c.riego : null;
      if (!ref.riego) { f.error = 'la referencia de la zona no tiene ' + c.cultivo.toLowerCase() + ' con riego para esta finalidad'; return f; }
      if (!ref.costosRiego) { f.error = 'la referencia de la zona no tiene los costos de producción con riego'; return f; }
      f.precio = pr.granoUSDt[clave(c.cultivo)] || pr.granoUSDt.otro || null;
      if (!f.precio) { f.error = 'sin precio vigente del grano'; return f; }
      // rindes
      f.kgR = ref.riego;
      // Si en ESTE campo el perfil no se carga la mitad de los años o más (se siembra igual y rinde poco o se pierde),
      // manda el campo: el promedio de la zona (del departamento) viene de lugares con más lluvia y no lo representa.
      var fracSinCarga = sim && sim.secano && sim.secano.n ? (sim.secano.nSinCarga || 0) / sim.secano.n : null;
      // los números del propio productor mandan (calculadora de Irrigar: "tu propiedad" vs "promedio región" vs "con irrigación")
      var act = c.actual || {};
      if (ref.secano != null) f.kgSzona = ref.secano;
      if (act.rinde > 0) { f.kgS = Math.round(act.rinde); f.propio = true; f.secanoDe = 'su propio promedio en secano' + (ref.secano ? ' (la zona da ' + fmt(ref.secano, 0) + ' kg)' : ''); }
      else if (ref.secano && fracSinCarga != null && fracSinCarga >= 0.5) {
        f.kgS = Math.round(ref.riego * sim.rindeRelSecano); f.secanoCampo = true; f.kgSzona = ref.secano; f.fracSinCarga = fracSinCarga;
        f.secanoDe = 'con el clima de este campo: en ' + sim.secano.nSinCarga + ' de ' + sim.secano.n + ' años se siembra sin el perfil cargado y rinde poco o se pierde; la zona da ' + fmt(ref.secano, 0) + ' kg pero no representa este campo';
      }
      else if (ref.secano) { f.kgS = ref.secano; f.secanoDe = 'zona en secano'; }
      else if (sim) {
        f.kgS = Math.round(ref.riego * sim.rindeRelSecano); f.secanoDe = 'estimado con el clima del campo (FAO-33)';
        // se siembra todos los años; los que el perfil no se carga rinden poco o se pierden (el costo corre igual)
        if (sim.secano && sim.secano.nSinCarga) f.secanoDe += '; en ' + sim.secano.nSinCarga + ' de ' + sim.secano.n + ' años se siembra sin el perfil cargado y rinde poco o se pierde';
      }
      else { f.error = 'sin dato de secano en la zona ni simulación del clima'; return f; }
      f.kgSseco = sim ? Math.round(ref.riego * sim.rindeRelSecanoMin) : null;
      f.secoNoSembro = !!(sim && sim.zafras && sim.zafras.some(function (z) { return z.secanoSembro === false; }));
      // costos con riego (base) y energía por mm si se cargó
      var cr = ref.costosRiego, cR = { insumos: cr.insumos || 0, maquinas: cr.maquinas || 0, fletes: cr.fletes || 0, alquiler: cr.alquiler || 0, energia: cr.energia || 0, mant: cr.mant || 0 };
      if (eMm != null && sim) { cR.energia = sim.riegoBruto * eMm; f.energiaDe = fmt(sim.riegoBruto, 0) + ' mm × US$ ' + fmt(eMm, 2); }
      // reposición de lo que exportan los kilos extra (RS/SC Tabela 6.1.2 + N en gramíneas)
      var extraT = Math.max(0, f.kgR - f.kgS) / 1000, man = window.SafiaFertilidad ? SafiaFertilidad.manutencion(c.cultivo, 99).base : null;
      var esSoja = clave(c.cultivo) === 'soja';
      cR.reposicion = man ? extraT * (man.addP * (pr.p2o5USDkg || 0) + man.addK * (pr.k2oUSDkg || 0) + (esSoja ? 0 : N_POR_T * (pr.nUSDkg || 0))) : 0;
      f.reposicionDe = man ? fmt(extraT, 1) + ' t extra × (' + man.addP + ' kg P₂O₅ + ' + man.addK + ' kg K₂O' + (esSoja ? '' : ' + ' + N_POR_T + ' kg N') + ' por t)' : '';
      // costos en secano: los de la zona; si no hay, los de riego sin energía ni mantenimiento
      var cs = ref.costosSecano, cS = cs ? { insumos: cs.insumos || 0, maquinas: cs.maquinas || 0, fletes: cs.fletes || 0, alquiler: cs.alquiler || 0, energia: 0, mant: 0, reposicion: 0 } : { insumos: cR.insumos, maquinas: cR.maquinas, fletes: cR.fletes, alquiler: cR.alquiler, energia: 0, mant: 0, reposicion: 0 };
      f.costosSecanoDe = cs ? 'zona en secano' : 'los de riego sin la energía ni el mantenimiento';
      var total0 = function (x) { return CONCEPTOS.reduce(function (a, k) { return a + (x[k[0]] || 0); }, 0); };
      f.totalSzona = total0(cS);   // costo en secano de la zona, para comparar con el propio
      if (act.costo > 0) { cR = { propio: act.costo, energia: cR.energia, mant: cR.mant, reposicion: cR.reposicion }; cS = { propio: act.costo }; f.costoPropio = true; f.costosSecanoDe = 'su propio costo (US$ ' + fmt(act.costo, 0) + ' por ha); con riego se suman la energía, el mantenimiento y la reposición'; }
      // margen de la zona en secano (promedio región), para la comparación en tres columnas
      if (f.kgSzona != null) { f.ingZona = f.kgSzona / 1000 * f.precio; f.margenZona = f.ingZona - f.totalSzona; }
      var total = function (x) { return CONCEPTOS.reduce(function (a, k) { return a + (x[k[0]] || 0); }, 0); };
      f.cR = cR; f.cS = cS; f.totalR = total(cR); f.totalS = total(cS);
      f.ingR = f.kgR / 1000 * f.precio; f.ingS = f.kgS / 1000 * f.precio;
      f.margenR = f.ingR - f.totalR; f.margenS = f.ingS - f.totalS; f.agrega = f.margenR - f.margenS;
      // secano estimado con años sin sembrar: el costo solo corre en los años que se siembra
      if (f.fracSembro != null && f.fracSembro < 1) { f.margenS = f.ingS - f.totalS * f.fracSembro; f.agrega = f.margenR - f.margenS; }
      if (f.kgSseco != null) { f.ingSseco = f.kgSseco / 1000 * f.precio; f.margenSseco = f.secoNoSembro ? 0 : f.ingSseco - f.totalS; f.agregaSeco = f.margenR - f.margenSseco; }
      return f;
    });
    var ok = filas.filter(function (f) { return !f.error; });
    // Cultivos de épocas distintas se suman (van uno detrás del otro en la misma superficie: soja de verano + maíz zafriña);
    // los de la MISMA época no pueden ir juntos en la misma tierra el mismo año: se reparten el área en partes iguales.
    var porEpoca = {}; ok.forEach(function (f) { var k = norm(f.epoca || 'sin época'); (porEpoca[k] = porEpoca[k] || []).push(f); });
    ok.forEach(function (f) { f.parte = 1 / porEpoca[norm(f.epoca || 'sin época')].length; });
    var compartidas = Object.keys(porEpoca).filter(function (k) { return porEpoca[k].length > 1; }).map(function (k) { return porEpoca[k]; });
    var sum = function (k) { return ok.reduce(function (a, f) { return a + (f[k] != null ? f[k] : 0) * f.parte; }, 0); };
    var r = { filas: filas, ok: ok, superficieHa: ha, inversionUSD: inv, vidaUtil: vida, energiaUSDmm: eMm, situacion: nuevo ? 'nuevo' : 'secano',
      margenR: sum('margenR'), margenS: sum('margenS'), agrega: sum('agrega'), agregaSeco: ok.some(function (f) { return f.agregaSeco != null; }) ? ok.reduce(function (a, f) { return a + (f.agregaSeco != null ? f.agregaSeco : f.agrega) * f.parte; }, 0) : null, compartidas: compartidas, nEpocas: Object.keys(porEpoca).length };
    // Chaco: un solo cultivo por año en secano → el secano del proyecto es el mejor cultivo solo, en toda la superficie
    r.region = o.region || null; r.unCultivoSecano = r.region === 'occidental' && ok.length > 1;
    var mejorS = null;
    if (r.unCultivoSecano) {
      mejorS = ok.reduce(function (a, f) { return f.margenS > a.margenS ? f : a; });
      r.secanoCultivo = mejorS.cultivo; r.margenS = mejorS.margenS; r.agrega = r.margenR - r.margenS;
      r.agregaSeco = mejorS.margenSseco != null ? r.margenR - mejorS.margenSseco : r.agregaSeco;
    }
    r.pagaCon = nuevo ? r.margenR : r.agrega;   // lo que paga la inversión cada año, por ha
    r.inversionPartes = o.inversionPartes || null; r.inversionRefHa = o.inversionRefHa || null; r.energiaModo = o.energiaModo || (eMm != null ? 'mm' : 'base');
    // por ha (ponderado por la parte del área de cada cultivo): ingreso, costos sin energía, energía
    var pond = function (fn) { return ok.reduce(function (a, f) { return a + fn(f) * f.parte; }, 0); };
    r.porHa = {
      ingR: pond(function (f) { return f.ingR; }), ingS: pond(function (f) { return f.ingS; }),
      energiaR: pond(function (f) { return f.cR.energia || 0; }),
      costoR: pond(function (f) { return f.totalR - (f.cR.energia || 0); }),
      costoS: pond(function (f) { return f.totalS * (f.fracSembro != null && f.fracSembro < 1 ? f.fracSembro : 1); })
    };
    if (mejorS) { r.porHa.ingS = mejorS.ingS; r.porHa.costoS = mejorS.totalS * (mejorS.fracSembro != null && mejorS.fracSembro < 1 ? mejorS.fracSembro : 1); }
    if (ha > 0) r.proyecto = { ingR: r.porHa.ingR * ha, ingS: r.porHa.ingS * ha, energiaR: r.porHa.energiaR * ha, costoR: r.porHa.costoR * ha, costoS: r.porHa.costoS * ha, margenR: r.margenR * ha, margenS: r.margenS * ha };
    if (ha > 0) { r.anualR = r.margenR * ha; r.anualS = r.margenS * ha; r.anualAgrega = r.agrega * ha; r.anualPaga = r.pagaCon * ha; }
    if (inv > 0 && ha > 0) {
      r.inversionHa = inv / ha;
      r.recupero = r.anualPaga > 0 ? inv / r.anualPaga : null;
      var n = vida > 0 ? Math.round(vida) : 10; r.horizonte = n;
      var flujos = [-inv]; for (var t = 1; t <= n; t++) flujos.push(r.anualPaga);
      r.tir = r.anualPaga > 0 ? tir(flujos) : null;
      r.acumulado = r.anualPaga * n - inv;
      if (vida > 0) { r.amortizacion = inv / vida; r.resultadoNeto = r.anualPaga - r.amortizacion; }
    }
    r.tasaInteres = num(o.tasaInteres); r.plazoAnios = num(o.plazoAnios);
    if (inv > 0 && ha > 0) r.financiado = financiacion(inv, r.anualPaga, r.tasaInteres != null ? r.tasaInteres : 0);
    if (inv > 0 && ha > 0 && r.plazoAnios > 0) r.credito = credito(inv, r.tasaInteres != null ? r.tasaInteres : 0, r.plazoAnios, r.anualPaga);
    r.propio = ok.some(function (f) { return f.propio; });
    return r;
  }

  /* Cuánto tarda en pagarse la inversión si se financia al interés del banco (pedido de Osmar, 9-oct-2026):
     cada año lo que gana el riego paga primero el interés del saldo y el resto baja la deuda (cuota = lo que agrega el riego).
     Ejemplo: US$ 500.000 al 7 % con US$ 165.000 por año → 3,5 años (sin interés serían 3,0). Si la ganancia no cubre
     ni el interés, la deuda nunca baja. */
  function financiacion(inv, anual, tasa) {
    if (!(inv > 0) || !(anual > 0)) return null;
    var i = tasa != null && !isNaN(tasa) ? Math.max(0, tasa) / 100 : 0, cuadro = [], saldo = inv, interesTotal = 0, anios = 0;
    if (i > 0 && anual <= inv * i) return { tasa: i * 100, inv: inv, anual: anual, imposible: true, interesAnual: inv * i, sinInteres: inv / anual, cuadro: [] };
    while (saldo > 0.5 && anios < 60) {
      var interes = saldo * i, pago = Math.min(anual, saldo + interes), fin = saldo + interes - pago;
      cuadro.push({ anio: anios + 1, saldoIni: saldo, interes: interes, pago: pago, saldoFin: Math.max(0, fin) });
      interesTotal += interes; saldo = fin; anios++;
    }
    var ult = cuadro[cuadro.length - 1], fraccion = ult && ult.pago < anual ? ult.pago / anual : 1;   // el último año se paga en parte
    var exacto = i > 0 ? -Math.log(1 - i * inv / anual) / Math.log(1 + i) : inv / anual;
    return { tasa: i * 100, inv: inv, anual: anual, anios: exacto, aniosEnteros: anios, cuadro: cuadro, interesTotal: interesTotal, sinInteres: inv / anual, fraccionUltimo: fraccion };
  }
  // Crédito a plazo fijo (cuota constante, como la calculadora de Irrigar): ¿lo que gana el riego cubre la cuota?
  function credito(inv, tasa, plazo, anual) {
    if (!(inv > 0) || !(plazo > 0)) return null;
    var i = tasa > 0 ? tasa / 100 : 0, n = Math.round(plazo);
    var cuota = i > 0 ? inv * i / (1 - Math.pow(1 + i, -n)) : inv / n;
    return { tasa: i * 100, plazo: n, cuota: cuota, total: cuota * n, interesTotal: cuota * n - inv, anual: anual, cubre: anual != null ? anual >= cuota : null, sobra: anual != null ? anual - cuota : null };
  }
  function cuadroFinanciacionHTML(f) {
    if (!f || !f.cuadro || !f.cuadro.length) return '';
    var U = function (v) { return 'US$ ' + fmt(v, 0); };
    return '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Año</th><th class="r">Deuda al empezar</th><th class="r">Interés (' + fmt(f.tasa, 1) + ' %)</th><th class="r">Paga el riego</th><th class="r">Deuda al terminar</th></tr></thead><tbody>' +
      f.cuadro.map(function (c) { return '<tr><td>' + c.anio + '</td><td class="r">' + U(c.saldoIni) + '</td><td class="r">' + U(c.interes) + '</td><td class="r">' + U(c.pago) + '</td><td class="r"><b>' + (c.saldoFin > 0.5 ? U(c.saldoFin) : 'pagada') + '</b></td></tr>'; }).join('') +
      '</tbody></table></div></div><div class="muted" style="font-size:11px;margin-top:4px;">Interés total pagado: ' + U(f.interesTotal) + '. Cada año, lo que gana el riego paga primero el interés y el resto baja la deuda.</div>';
  }

  function usd(v) { return v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + 'US$ ' + fmt(Math.abs(v), 0); }
  function difCelda(a, b) { if (a == null || b == null) return '—'; var d = a - b; if (Math.abs(d) < 0.5) return '<span class="muted">igual</span>'; return '<b>' + (d > 0 ? '+' : '−') + fmt(Math.abs(d), 0) + '</b>'; }
  function cultivoHTML(f) {
    var fila = function (n, a, b, dif, sub) { return '<tr><td style="white-space:normal;min-width:180px;">' + n + (sub ? '<div class="sub" style="white-space:normal;">' + sub + '</div>' : '') + '</td><td class="r">' + a + '</td><td class="r">' + b + '</td><td class="r">' + dif + '</td></tr>'; };
    var h = '<div style="min-width:0;"><div style="font-weight:700;margin:4px 0 6px;">' + esc(f.cultivo) + (f.epoca ? ' <span class="muted" style="font-weight:500;">· ' + esc(f.epoca) + '</span>' : '') + '</div>' +
      '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Por hectárea</th><th class="r">Con riego</th><th class="r">Secano</th><th class="r">Diferencia</th></tr></thead><tbody>';
    h += fila('<b>Rinde</b>', '<b>' + fmt(f.kgR, 0) + '</b> kg', '<b>' + fmt(f.kgS, 0) + '</b> kg', difCelda(f.kgR, f.kgS) + ' kg', f.secanoDe);
    h += fila('Ingreso', usd(f.ingR), usd(f.ingS), difCelda(f.ingR, f.ingS), 'a US$ ' + fmt(f.precio, 0) + ' por tonelada');
    CONCEPTOS.forEach(function (k) {
      var a = f.cR[k[0]] || 0, b = f.cS[k[0]] || 0; if (!a && !b) return;
      var sub = k[0] === 'energia' && f.energiaDe ? f.energiaDe : (k[0] === 'reposicion' ? f.reposicionDe : '');
      h += fila(k[1], usd(-a), usd(-b), difCelda(-a, -b), sub);
    });
    h += fila('<b>Costo total</b>', '<b>' + usd(-f.totalR) + '</b>', '<b>' + usd(-f.totalS) + '</b>', difCelda(-f.totalR, -f.totalS), f.costosSecanoDe !== 'zona en secano' ? 'secano: ' + f.costosSecanoDe : '');
    if (f.fracSembro != null && f.fracSembro < 1) h += fila('Costo en secano promediado', '', usd(-f.totalS * f.fracSembro), '', 'solo se gasta en los años que se siembra (' + fmt(f.fracSembro * 100, 0) + ' % de los años)');
    h += '<tr style="background:#F4FAF5;"><td><b>Margen</b></td><td class="r"><b style="color:' + (f.margenR >= 0 ? '#178029' : '#B3261E') + ';">' + usd(f.margenR) + '</b></td><td class="r"><b>' + usd(f.margenS) + '</b></td><td class="r"><b style="color:' + (f.agrega >= 0 ? '#178029' : '#B3261E') + ';">' + (f.agrega >= 0 ? '+' : '−') + 'US$ ' + fmt(Math.abs(f.agrega), 0) + '</b></td></tr>';
    if (f.margenSseco != null) h += '<tr><td>Margen en un año seco<div class="sub">la peor zafra de 10 en este campo</div></td><td class="r">' + usd(f.margenR) + '</td><td class="r">' + usd(f.margenSseco) + '<div class="sub">' + (f.secoNoSembro ? 'ese año no se siembra' : fmt(f.kgSseco, 0) + ' kg') + '</div></td><td class="r"><b>' + (f.agregaSeco >= 0 ? '+' : '−') + 'US$ ' + fmt(Math.abs(f.agregaSeco), 0) + '</b></td></tr>';
    return h + '</tbody></table></div></div></div>';
  }

  function html(r) {
    if (!r) return '';
    var h = '';
    if (r.ok.length) h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:14px;">' + r.ok.map(cultivoHTML).join('') + '</div>';
    var err = r.filas.filter(function (f) { return f.error; });
    if (err.length) h += '<div class="note" style="margin-top:8px;">' + err.map(function (f) { return '<b>' + esc(f.cultivo) + ':</b> ' + esc(f.error) + '.'; }).join('<br>') + '</div>';
    if (!r.ok.length) return h || '<div class="note">Sin cultivos de grano con referencia para calcular la economía.</div>';
    var varios = r.ok.length === 1 ? esc(r.ok[0].cultivo) : (r.nEpocas > 1 ? 'rotación en el año' : 'promedio de los cultivos');
    if (r.compartidas.length) h += '<div class="note" style="margin-top:10px;">' + r.compartidas.map(function (g) { return g.map(function (f) { return esc(f.cultivo); }).join(' y ') + ' van en la misma época (' + esc(g[0].epoca || 'sin época') + '): no pueden ir juntos en la misma tierra el mismo año, así que la cuenta del proyecto supone ' + (g.length === 2 ? 'la mitad' : 'una parte igual') + ' del área para cada uno'; }).join('<br>') + (r.nEpocas > 1 ? '. Los cultivos de épocas distintas se suman, porque van uno detrás del otro en la misma superficie.' : '.') + '</div>';
    if (r.unCultivoSecano) h += '<div class="note" style="margin-top:10px;">En el Chaco, sin riego se hace <b>un solo cultivo por año</b> (no hay doble zafra como en la Oriental). Por eso el secano del proyecto es el mejor de estos cultivos hecho solo en el año: <b>' + esc(r.secanoCultivo) + '</b>. Con riego entran los ' + r.ok.length + ' cultivos del proyecto.</div>';
    h += '<div class="statbar" style="margin:14px 0 8px;">' +
      '<div class="stat"><div class="sl">Margen con riego</div><div class="sv green">' + usd(r.margenR) + '</div><div class="ss">por ha y año · ' + varios + '</div></div>' +
      '<div class="stat"><div class="sl">Margen en secano</div><div class="sv">' + usd(r.margenS) + '</div><div class="ss">por ha y año' + (r.unCultivoSecano ? ' · solo ' + esc(r.secanoCultivo).toLowerCase() : '') + '</div></div>' +
      '<div class="stat"><div class="sl">Lo que agrega el riego</div><div class="sv green">' + (r.agrega >= 0 ? '+' : '−') + 'US$ ' + fmt(Math.abs(r.agrega), 0) + '</div><div class="ss">por ha y año' + (r.agregaSeco != null ? ' · año seco +US$ ' + fmt(r.agregaSeco, 0) : '') + '</div></div>' +
      (r.proyecto ? '<div class="stat"><div class="sl">Energía del riego</div><div class="sv">' + usd(r.proyecto.energiaR) + '</div><div class="ss">por año · US$ ' + fmt(r.porHa.energiaR, 0) + ' por ha</div></div>' : '') +
      (r.inversionUSD ? '<div class="stat"><div class="sl">Inversión</div><div class="sv">US$ ' + fmt(r.inversionUSD, 0) + '</div><div class="ss">' + (r.inversionHa ? 'US$ ' + fmt(r.inversionHa, 0) + ' por ha' : '') + '</div></div>' : '') +
      (r.recupero != null ? '<div class="stat"><div class="sl">Se recupera en</div><div class="sv">' + fmt(r.recupero, 1) + ' años</div><div class="ss">' + (r.situacion === 'nuevo' ? 'con el margen completo con riego' : 'con lo que agrega el riego') + '</div></div>' : '') +
      (r.tir != null ? '<div class="stat"><div class="sl">Tasa interna de retorno</div><div class="sv">' + fmt(r.tir * 100, 1) + ' %</div><div class="ss">a ' + r.horizonte + ' años</div></div>' : '') +
      (r.financiado && r.financiado.tasa > 0 ? '<div class="stat"><div class="sl">Financiada al ' + fmt(r.financiado.tasa, 1) + ' %</div><div class="sv">' + (r.financiado.imposible ? 'no se paga' : fmt(r.financiado.anios, 1) + ' años') + '</div><div class="ss">' + (r.financiado.imposible ? 'lo que gana el riego no cubre ni el interés' : 'interés total US$ ' + fmt(r.financiado.interesTotal, 0)) + '</div></div>' : '') +
      (r.credito ? '<div class="stat"><div class="sl">Crédito a ' + r.credito.plazo + ' años</div><div class="sv">' + usd(r.credito.cuota) + '</div><div class="ss">cuota por año' + (r.credito.tasa > 0 ? ' al ' + fmt(r.credito.tasa, 1) + ' %' : '') + ' · ' + (r.credito.cubre ? 'el riego la cubre y sobran ' + usd(r.credito.sobra) : 'el riego no la cubre: faltan ' + usd(-r.credito.sobra)) + '</div></div>' : '') + '</div>';
    if (r.proyecto) {
      var P = r.proyecto, f2 = function (n, a, b, sub, neg) { var d = a != null && b != null ? a - b : null; return '<tr><td style="white-space:normal;">' + n + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</td><td class="r">' + usd(neg ? -a : a) + '</td><td class="r">' + (b == null ? '—' : usd(neg ? -b : b)) + '</td><td class="r">' + (d == null ? '—' : ((neg ? -d : d) >= 0 ? '+' : '−') + 'US$ ' + fmt(Math.abs(d), 0)) + '</td></tr>'; };
      h += '<div style="font-weight:700;margin:12px 0 6px;">Todo el proyecto por año · ' + fmt(r.superficieHa, 0) + ' ha</div><div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Por año</th><th class="r">Con riego</th><th class="r">Secano</th><th class="r">Diferencia</th></tr></thead><tbody>' +
        f2('Ingreso', P.ingR, P.ingS, '') +
        f2('Costos de producción', P.costoR, P.costoS, 'insumos, maquinaria, fletes, mantenimiento del riego y reposición de nutrientes; sin la energía', true) +
        f2('<b>Energía del riego</b>', P.energiaR, 0, r.energiaModo === 'calc' ? 'calculada con las bombas y la tarifa: US$ ' + fmt(r.energiaUSDmm, 2) + ' por mm por ha × los mm de cada cultivo' : (r.energiaModo === 'mm' ? 'US$ ' + fmt(r.energiaUSDmm, 2) + ' por mm por ha × los mm de cada cultivo en este campo' : 'la de la referencia de la zona (base de Irrigar)'), true) +
        '<tr style="background:#F4FAF5;"><td><b>Margen</b></td><td class="r"><b style="color:' + (P.margenR >= 0 ? '#178029' : '#B3261E') + ';">' + usd(P.margenR) + '</b></td><td class="r"><b>' + usd(P.margenS) + '</b></td><td class="r"><b>' + (P.margenR - P.margenS >= 0 ? '+' : '−') + 'US$ ' + fmt(Math.abs(P.margenR - P.margenS), 0) + '</b></td></tr>' +
        '</tbody></table></div></div>';
    }
    if (r.inversionPartes) {
      var tp = PARTES_INV.filter(function (p) { return r.inversionPartes[p[0]] > 0; });
      if (tp.length) h += '<div style="font-weight:700;margin:12px 0 6px;">Inversión por partes</div><div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Parte</th><th class="r">US$</th><th class="r">US$ por ha</th><th class="r">% del total</th></tr></thead><tbody>' +
        tp.map(function (p) { var v = r.inversionPartes[p[0]]; return '<tr><td>' + p[1] + '</td><td class="r">' + fmt(v, 0) + '</td><td class="r">' + (r.superficieHa > 0 ? fmt(v / r.superficieHa, 0) : '—') + '</td><td class="r">' + (r.inversionUSD > 0 ? fmt(v / r.inversionUSD * 100, 0) + ' %' : '—') + '</td></tr>'; }).join('') +
        '<tr style="background:#F4FAF5;"><td><b>Total</b></td><td class="r"><b>' + fmt(r.inversionUSD, 0) + '</b></td><td class="r"><b>' + (r.superficieHa > 0 ? fmt(r.inversionUSD / r.superficieHa, 0) : '—') + '</b></td><td class="r">100 %</td></tr></tbody></table></div></div>';
    }
    var rf = r.inversionRefHa;
    if (!r.inversionUSD && rf && r.superficieHa > 0 && r.anualPaga > 0) {
      var a1 = rf.min * r.superficieHa, a2 = rf.max * r.superficieHa;
      h += '<div class="note">Sin la inversión del proyecto cargada. Con la <b>referencia de Irrigar</b> (' + esc(rf.txt) + '), ' + fmt(r.superficieHa, 0) + ' ha costarían <b>US$ ' + fmt(a1, 0) + (a2 !== a1 ? ' a ' + fmt(a2, 0) : '') + '</b> y se recuperarían en <b>' + fmt(a1 / r.anualPaga, 1) + (a2 !== a1 ? ' a ' + fmt(a2 / r.anualPaga, 1) : '') + ' años</b>' + (r.situacion === 'nuevo' ? ' con el margen completo con riego' : ' con lo que agrega el riego') + '. Es orientativo: cargá la inversión real del proyecto (paso 5) para el cálculo firme y la tasa de retorno.</div>';
    }
    else if (!r.inversionUSD) h += '<div class="note">Cargá la <b>inversión del proyecto de riego</b> (paso 5) para ver en cuántos años se recupera y su tasa de retorno.</div>';
    else if (!(r.superficieHa > 0)) h += '<div class="note">Cargá la <b>superficie a regar</b> (paso 0) para pasar de US$ por ha a todo el proyecto.</div>';
    else h += '<div style="font-size:13px;line-height:1.55;">Con ' + fmt(r.superficieHa, 0) + ' ha: con riego el campo deja <b>' + usd(r.anualR) + ' por año</b>' + (r.situacion === 'nuevo' ? '' : ' contra ' + usd(r.anualS) + ' en secano; el riego agrega <b>' + usd(r.anualAgrega) + ' por año</b>') + '. ' +
      (r.recupero != null ? 'La inversión de <b>US$ ' + fmt(r.inversionUSD, 0) + '</b> se recupera en <b>' + fmt(r.recupero, 1) + ' años</b>' + (r.situacion === 'nuevo' ? ' (campo nuevo: se paga con el margen completo con riego)' : ' (se paga con lo que agrega el riego frente a seguir en secano)') + '; a ' + r.horizonte + ' años el resultado acumulado es <b>' + usd(r.acumulado) + '</b>' + (r.amortizacion ? ' y, amortizando la inversión en ' + fmt(r.vidaUtil, 0) + ' años, quedan ' + usd(r.resultadoNeto) + ' por año' : '') + '.' : 'Con estos números no alcanza para pagar la inversión: revisar precios, costos y rindes.') + '</div>';
    h += '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5;">Rindes y costos por ha de la referencia agrícola de la zona (base de Irrigar), misma finalidad y época. La base usa los mismos insumos con y sin riego: SAFIA suma la reposición de fósforo y potasio que se llevan los kilos extra (manual RS/SC 2016, Tabela 6.1.2) y el nitrógeno en gramíneas (15 kg por tonelada extra), con los precios de fertilizante vigentes. Año seco = la zafra más seca de los últimos 10 años en esta coordenada (FAO-33). Precios del grano y de los fertilizantes: Datos → Precios. No incluye impuestos ni el costo del capital. Orientativo: los precios y los rindes cambian año a año.</div>';
    return h;
  }

  /* Veredicto de la inversión (regla de Irrigar, 9-oct-2026): tasa interna de retorno de 15 % o más → vale la pena;
     entre 8 y 15 % → cierra ajustado; menos → no cierra con estos números. Sin inversión cargada se usa la referencia
     de Irrigar por ha (el tope del rango). El agua que no sirve para regar frena todo. Los umbrales se cambian acá. */
  var UMBRAL_TIR = { bien: 0.15, ajustado: 0.08 };
  function veredicto(E, o) {
    o = o || {};
    var U = function (v) { return 'US$ ' + fmt(v, 0); };
    if (o.aguaGrave) return { k: 'no', titulo: 'No, hasta resolver el agua', detalle: 'El agua analizada no sirve para regar tal como está: los rindes con riego no se alcanzan hasta cambiar la fuente, mezclar o tratar el agua.' };
    if (!E || !E.ok || !E.ok.length) return { k: 'falta', titulo: 'Falta información', detalle: 'Sin un cultivo de grano con referencia de la zona (rinde y costos con riego) y el clima del campo no se puede hacer la cuenta.' };
    if (!(E.superficieHa > 0)) return { k: 'falta', titulo: 'Falta la superficie', detalle: 'Cargá las hectáreas a regar para pasar de US$ por ha a todo el proyecto.' };
    var inv = E.inversionUSD, ref = false, rec = E.recupero, t = E.tir, n = E.horizonte || (E.vidaUtil > 0 ? Math.round(E.vidaUtil) : 10);
    if (!(inv > 0)) {
      var rf = E.inversionRefHa;
      if (!rf) return { k: 'falta', titulo: 'Falta la inversión', detalle: 'Cargá la inversión del proyecto de riego para saber en cuántos años se recupera.' };
      inv = rf.max * E.superficieHa; ref = true;
      if (E.anualPaga > 0) { rec = inv / E.anualPaga; var fl = [-inv]; for (var i = 1; i <= n; i++) fl.push(E.anualPaga); t = tir(fl); } else { rec = null; t = null; }
    }
    var base = { inversion: inv, inversionRef: ref, recupero: rec, tir: t, horizonte: n, anualPaga: E.anualPaga };
    var cuanto = 'Con ' + fmt(E.superficieHa, 0) + ' ha, ' + (E.situacion === 'nuevo' ? 'con riego el campo deja <b>' + U(E.anualR) + ' por año</b>' : 'el riego agrega <b>' + U(E.anualAgrega) + ' por año</b> frente a seguir en secano') +
      (E.agregaSeco != null && E.superficieHa > 0 && E.situacion !== 'nuevo' ? ' (en un año seco, ' + U(E.agregaSeco * E.superficieHa) + ')' : '') + '. ';
    var laInv = 'La inversión de <b>' + U(inv) + '</b>' + (ref ? ' (referencia de Irrigar: todavía no está cargada)' : '');
    if (!(E.anualPaga > 0)) return Object.assign(base, { k: 'no', titulo: 'No cierra con estos números', detalle: cuanto + 'El riego no deja margen para pagar la inversión: revisá los precios, los costos, la energía y los rindes de la zona.' });
    var fin = ref ? financiacion(inv, E.anualPaga, E.tasaInteres != null ? E.tasaInteres : 0) : E.financiado; base.financiado = fin;
    var cierre = laInv + ' se recupera en <b>' + fmt(rec, 1) + ' años</b>' + (t != null ? ', con una tasa de retorno de <b>' + fmt(t * 100, 1) + ' %</b> a ' + n + ' años' : '') + '.' +
      (fin && fin.tasa > 0 ? (fin.imposible ? ' Financiada al ' + fmt(fin.tasa, 1) + ' % anual no se paga: lo que gana el riego (' + U(fin.anual) + ') no cubre ni el interés (' + U(fin.interesAnual) + ' por año).' : ' Financiada al <b>' + fmt(fin.tasa, 1) + ' % anual</b>, con lo que gana el riego se paga en <b>' + fmt(fin.anios, 1) + ' años</b> (interés total ' + U(fin.interesTotal) + ').') : '') +
      (E.credito && !ref ? ' Con un crédito a ' + E.credito.plazo + ' años la cuota es <b>' + U(E.credito.cuota) + ' por año</b>' + (E.credito.cubre ? ' y el riego la cubre (sobran ' + U(E.credito.sobra) + ').' : ' y el riego no la cubre (faltan ' + U(-E.credito.sobra) + ' por año).') : '') +
      (E.propio ? ' Secano: los números del propio productor.' : '');
    if (t != null && t >= UMBRAL_TIR.bien) return Object.assign(base, { k: 'si', titulo: 'Vale la pena', detalle: cuanto + cierre });
    if (t != null && t >= UMBRAL_TIR.ajustado) return Object.assign(base, { k: 'ajustado', titulo: 'Cierra, pero ajustado', detalle: cuanto + cierre + ' El retorno es justo: conviene revisar la inversión, la energía y los precios antes de decidir.' });
    return Object.assign(base, { k: 'no', titulo: 'No cierra con estos números', detalle: cuanto + cierre + ' Con ese retorno no conviene invertir tal como está: hay que bajar la inversión o el costo de la energía, o subir el rinde esperado.' });
  }

  window.SafiaEconomiaRiego = { calcular: calcular, html: html, tir: tir, veredicto: veredicto, UMBRAL_TIR: UMBRAL_TIR, financiacion: financiacion, cuadroFinanciacionHTML: cuadroFinanciacionHTML, credito: credito };
})();
