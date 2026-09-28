/* SAFIA — Economía del riego (Evaluar proyecto)
   -------------------------------------------------------------------
   Responde lo que pregunta un inversor: cuánto más produce el riego, cuánto cuesta producir con riego, cuánto deja
   por hectárea y por año, y en cuántos años se recupera la inversión. Con datos propios de SAFIA:
   - Kilos con riego y en secano: referencia agrícola de la zona (base de Irrigar), misma finalidad y época.
     Si la zona no tiene secano, el secano se estima con la simulación del clima del campo (FAO-33: rinde relativo
     por falta de agua). El año seco usa la peor zafra de los últimos 10 años en esa coordenada.
   - Costo extra de producir con riego: costo final por ha con riego menos sin riego de la misma base (incluye la
     energía y el mantenimiento del riego). Si se carga un costo de energía por mm, la energía se calcula con los mm
     que pide el cultivo en ese campo (simulación) en lugar de la de la base.
   - Precio del grano: precios vigentes de SAFIA (Datos → Precios).
   - Inversión: la carga cada proyecto (decisión de Osmar, 28-sep-2026).
   Solo grano: para ensilaje, fardos y pastoreo SAFIA no tiene precio de venta; se dice.
   Uso: SafiaEconomiaRiego.calcular(o) → resultado · SafiaEconomiaRiego.html(resultado) */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d }); }
  function num(v) { if (v == null || v === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

  // Tasa interna de retorno de un flujo [-inversión, f1, f2, …] (bisección); null si no hay cambio de signo
  function tir(flujos) {
    var vpn = function (r) { return flujos.reduce(function (a, f, t) { return a + f / Math.pow(1 + r, t); }, 0); };
    var lo = -0.99, hi = 5; if (vpn(lo) * vpn(hi) > 0) return null;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (vpn(lo) * vpn(m) <= 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }

  function calcular(o) {
    o = o || {};
    var pr = o.precios || (window.SafiaMeta ? SafiaMeta.precios() : { granoUSDt: {} });
    var clave = function (c) { return window.SafiaMeta && SafiaMeta.claveCultivo ? SafiaMeta.claveCultivo(c) : norm(c); };
    var ha = num(o.superficieHa), inv = num(o.inversionUSD), vida = num(o.vidaUtil), eMm = num(o.energiaUSDmm);
    var filas = (o.cultivos || []).map(function (c) {
      var u = window.SafiaCasos ? SafiaCasos.unidadDe(c.cultivo, c.finalidad) : { k: 'grano' };
      var f = { cultivo: c.cultivo, finalidad: c.finalidad, epoca: c.epoca || (c.ref && c.ref.epoca) || null };
      if (u.k !== 'grano') { f.error = 'sin precio de venta en SAFIA para ' + (window.SafiaCasos ? SafiaCasos.finalidadTexto(c.finalidad).toLowerCase() : 'esta finalidad') + ': no entra en la cuenta'; return f; }
      var ref = c.ref || {}, sim = c.riego && !c.riego.error ? c.riego : null;
      if (!ref.riego) { f.error = 'la referencia de la zona no tiene ' + c.cultivo.toLowerCase() + ' con riego para esta finalidad'; return f; }
      f.kgRiego = ref.riego;
      if (ref.secano) { f.kgSecano = ref.secano; f.secanoDe = 'zona en secano'; }
      else if (sim) { f.kgSecano = Math.round(ref.riego * sim.rindeRelSecano); f.secanoDe = 'estimado por el clima del campo (FAO-33)'; }
      else { f.error = 'sin dato de secano en la zona ni simulación del clima'; return f; }
      f.kgSecanoSeco = sim ? Math.round(ref.riego * sim.rindeRelSecanoMin) : null;
      f.precio = pr.granoUSDt[clave(c.cultivo)] || pr.granoUSDt.otro || null;
      if (!f.precio) { f.error = 'sin precio vigente del grano'; return f; }
      // costo extra de producir con riego (por ha y por ciclo)
      var energiaBase = ref.energiaRiego || 0, mant = ref.mantRiego || 0;
      if (eMm != null && sim) {
        f.energia = sim.riegoBruto * eMm; f.energiaDe = fmt(sim.riegoBruto, 0) + ' mm × US$ ' + fmt(eMm, 2) + ' por mm';
        var otros = (ref.costoRiego != null && ref.costoSecano != null) ? Math.max(0, ref.costoRiego - energiaBase - mant - ref.costoSecano) : 0;
        f.costoExtra = f.energia + mant + otros; f.costoDe = 'energía por los mm del campo + mantenimiento y diferencia de insumos de la base';
      } else if (ref.costoRiego != null && ref.costoSecano != null) {
        f.costoExtra = ref.costoRiego - ref.costoSecano; f.energia = energiaBase; f.costoDe = 'costo final con riego menos sin riego (base de Irrigar)';
      } else if (ref.costoRiego != null) {
        f.costoExtra = energiaBase + mant; f.energia = energiaBase; f.costoDe = 'energía y mantenimiento del riego (base de Irrigar)';
      } else if (sim && pr.riegoUSDmm) {
        f.energia = sim.riegoBruto * pr.riegoUSDmm; f.costoExtra = f.energia; f.costoDe = 'mm del campo × costo por mm de Datos → Precios';
      } else { f.error = 'sin costos de producción con riego en la base'; return f; }
      f.kgExtra = f.kgRiego - f.kgSecano;
      f.ingresoExtra = f.kgExtra / 1000 * f.precio;
      f.margen = f.ingresoExtra - f.costoExtra;
      if (f.kgSecanoSeco != null) { f.kgExtraSeco = f.kgRiego - f.kgSecanoSeco; f.margenSeco = f.kgExtraSeco / 1000 * f.precio - f.costoExtra; }
      f.costoRiego = ref.costoRiego; f.costoSecano = ref.costoSecano;
      return f;
    });
    var ok = filas.filter(function (f) { return !f.error; });
    var margenHa = ok.reduce(function (a, f) { return a + f.margen; }, 0), margenHaSeco = ok.some(function (f) { return f.margenSeco != null; }) ? ok.reduce(function (a, f) { return a + (f.margenSeco != null ? f.margenSeco : f.margen); }, 0) : null;
    var r = { filas: filas, ok: ok, superficieHa: ha, inversionUSD: inv, vidaUtil: vida, energiaUSDmm: eMm, margenHa: margenHa, margenHaSeco: margenHaSeco };
    if (ha > 0) { r.margenAnual = margenHa * ha; if (margenHaSeco != null) r.margenAnualSeco = margenHaSeco * ha; }
    if (inv > 0 && ha > 0) {
      r.inversionHa = inv / ha;
      r.recupero = r.margenAnual > 0 ? inv / r.margenAnual : null;
      var n = vida > 0 ? Math.round(vida) : 10;
      r.horizonte = n;
      var flujos = [-inv]; for (var t = 1; t <= n; t++) flujos.push(r.margenAnual);
      r.tir = r.margenAnual > 0 ? tir(flujos) : null;
      r.acumulado = r.margenAnual * n - inv;
      if (vida > 0) { r.amortizacion = inv / vida; r.resultadoNeto = r.margenAnual - r.amortizacion; }
    }
    return r;
  }

  function html(r) {
    if (!r) return '';
    var h = '';
    if (r.ok.length) {
      h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Cultivo</th><th class="r">Con riego</th><th class="r">Secano</th><th class="r">Lo que suma el riego</th><th class="r">Precio</th><th class="r">Ingreso extra</th><th class="r">Costo extra de producir con riego</th><th class="r">Deja por ha y ciclo</th></tr></thead><tbody>' +
        r.ok.map(function (f) {
          return '<tr><td><b>' + esc(f.cultivo) + '</b>' + (f.epoca ? '<div class="sub">' + esc(f.epoca) + '</div>' : '') + '</td><td class="r">' + fmt(f.kgRiego, 0) + ' kg</td><td class="r">' + fmt(f.kgSecano, 0) + ' kg<div class="sub" style="white-space:normal;max-width:150px;">' + esc(f.secanoDe) + '</div></td>' +
            '<td class="r"><b>+' + fmt(f.kgExtra, 0) + ' kg</b>' + (f.kgExtraSeco != null ? '<div class="sub">año seco: +' + fmt(f.kgExtraSeco, 0) + '</div>' : '') + '</td><td class="r">US$ ' + fmt(f.precio, 0) + '/t</td>' +
            '<td class="r">US$ ' + fmt(f.ingresoExtra, 0) + '</td><td class="r">US$ ' + fmt(f.costoExtra, 0) + '<div class="sub" style="white-space:normal;max-width:170px;">' + esc(f.costoDe) + (f.energiaDe ? ' (' + esc(f.energiaDe) + ')' : '') + '</div></td>' +
            '<td class="r"><b style="color:' + (f.margen >= 0 ? '#178029' : '#B3261E') + ';">US$ ' + fmt(f.margen, 0) + '</b>' + (f.margenSeco != null ? '<div class="sub">año seco: US$ ' + fmt(f.margenSeco, 0) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    var err = r.filas.filter(function (f) { return f.error; });
    if (err.length) h += '<div class="note" style="margin-top:8px;">' + err.map(function (f) { return '<b>' + esc(f.cultivo) + ':</b> ' + esc(f.error) + '.'; }).join('<br>') + '</div>';
    if (!r.ok.length) return h || '<div class="note">Sin cultivos de grano con referencia para calcular la economía.</div>';
    // proyecto
    h += '<div class="statbar" style="margin:12px 0 8px;">' +
      '<div class="stat"><div class="sl">El riego deja por ha y por año</div><div class="sv green">US$ ' + fmt(r.margenHa, 0) + '</div><div class="ss">' + (r.ok.length > 1 ? 'los ' + r.ok.length + ' cultivos en la misma superficie' : esc(r.ok[0].cultivo)) + (r.margenHaSeco != null ? ' · año seco US$ ' + fmt(r.margenHaSeco, 0) : '') + '</div></div>' +
      (r.margenAnual != null ? '<div class="stat"><div class="sl">Por año, ' + fmt(r.superficieHa, 0) + ' ha</div><div class="sv green">US$ ' + fmt(r.margenAnual, 0) + '</div><div class="ss">' + (r.margenAnualSeco != null ? 'en un año seco US$ ' + fmt(r.margenAnualSeco, 0) : '') + '</div></div>' : '') +
      (r.inversionUSD ? '<div class="stat"><div class="sl">Inversión</div><div class="sv">US$ ' + fmt(r.inversionUSD, 0) + '</div><div class="ss">' + (r.inversionHa ? 'US$ ' + fmt(r.inversionHa, 0) + ' por ha' : '') + '</div></div>' : '') +
      (r.recupero != null ? '<div class="stat"><div class="sl">Se recupera en</div><div class="sv">' + fmt(r.recupero, 1) + ' años</div><div class="ss">con un año normal</div></div>' : '') +
      (r.tir != null ? '<div class="stat"><div class="sl">Tasa interna de retorno</div><div class="sv">' + fmt(r.tir * 100, 1) + ' %</div><div class="ss">a ' + r.horizonte + ' años</div></div>' : '') + '</div>';
    if (!r.inversionUSD) h += '<div class="note">Cargá la <b>inversión del proyecto de riego</b> (paso 5) para ver en cuántos años se recupera y su tasa de retorno.</div>';
    else if (!(r.superficieHa > 0)) h += '<div class="note">Cargá la <b>superficie a regar</b> (paso 0) para pasar de US$ por ha a todo el proyecto.</div>';
    else h += '<div style="font-size:13px;line-height:1.55;">' + (r.recupero != null ? 'Con ' + fmt(r.superficieHa, 0) + ' ha y los cultivos del proyecto, el riego deja <b>US$ ' + fmt(r.margenAnual, 0) + ' por año</b> y la inversión de <b>US$ ' + fmt(r.inversionUSD, 0) + '</b> se recupera en <b>' + fmt(r.recupero, 1) + ' años</b>. A ' + r.horizonte + ' años el resultado acumulado es <b>US$ ' + fmt(r.acumulado, 0) + '</b>' + (r.amortizacion ? ' (amortizando la inversión en ' + fmt(r.vidaUtil, 0) + ' años quedan US$ ' + fmt(r.resultadoNeto, 0) + ' por año)' : '') + '.' : 'Con estos números el riego no deja margen positivo: revisar precios, costos y el rinde con riego.') + '</div>';
    h += '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5;">Kilos y costos por ha de la referencia agrícola de la zona (base de Irrigar), misma finalidad y época; "lo que suma el riego" = con riego menos secano. Año seco = la zafra más seca de los últimos 10 años en esta coordenada (FAO-33). Precios: Datos → Precios. El resultado es el margen extra que agrega el riego frente a producir en secano (no incluye alquiler de la tierra ni impuestos). Orientativo: los precios y los rindes cambian año a año.</div>';
    return h;
  }

  window.SafiaEconomiaRiego = { calcular: calcular, html: html, tir: tir };
})();
