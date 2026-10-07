/* SAFIA — Energía y agua (Banco Agronómico → pestaña "Energía y agua")
   -------------------------------------------------------------------
   1. Facturas de energía: el cliente sube cada mes la factura de la ANDE (foto o PDF), la IA la lee
      (edge safia-leer-factura) y SAFIA la guarda (colección `facturas_energia`, tabla safia_facturas_energia).
   2. Reparto: el total de cada factura se reparte entre los pivots que alimenta ese medidor, en proporción
      al agua que regó cada uno en el período de la factura (mm regados × hectáreas). Sin riegos cargados en el
      período no hay con qué repartir: se avisa.
   3. Lectura de la factura: Gs por kWh real (total ÷ kWh), exceso de potencia reservada, energía reactiva y
      factor de potencia (cos φ = kWh ÷ √(kWh² + kVArh²)), kWh en punta contra fuera de punta. SAFIA muestra
      lo que dice la factura; qué contratar lo define el cliente con la ANDE y su electricista.
   4. Informe de agua de la campaña (al cierre): mm aplicados contra los necesarios, lluvia, consumo, días de
      estrés, drenaje, kWh y gasto de energía por hectárea, por mm y por tonelada.
      "Necesario" = riego bruto que hacía falta para que el cultivo no pasara sed en esa campaña, con la lluvia
      real: el mismo balance FAO-56 de SAFIA (SafiaAgua.balance) corrido sin los riegos y regando cada vez que
      el suelo llega al punto de estrés. Aprovechamiento = necesario ÷ aplicado (tope 100 %).
   Depende de window.SafiaBanco y de SafiaAgua (safia-agua.js). */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  var iniciado = false, editandoId = null, leida = null;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function fmt(n, d) { return n == null || isNaN(n) || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function dia(f) { return String(f || '').slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }
  /* Monedas: cada factura guarda su moneda (PYG, BRL o USD) y el cambio de su período (unidades de esa moneda por US$),
     congelado. La pantalla se ve en US$, Gs. o R$ (localStorage safia_moneda_vista; por defecto US$, la moneda de los
     demás costos de SAFIA). Si a una factura le falta el cambio, se muestra en su moneda original y se avisa. */
  var MON = { USD: { s: 'US$', n: 'dólares', k: null }, PYG: { s: 'Gs.', n: 'guaraníes', k: 'pygPorUSD' }, BRL: { s: 'R$', n: 'reales', k: 'brlPorUSD' } };
  function vista() { try { var v = localStorage.getItem('safia_moneda_vista'); return MON[v] ? v : 'USD'; } catch (e) { return 'USD'; } }
  function monedaDe(f) { return f && MON[f.moneda] ? f.moneda : 'PYG'; }
  function cambioDePrecios(moneda, fecha) { if (moneda === 'USD') return 1; var p = window.SafiaPrecios ? SafiaPrecios.en(dia(fecha)) : {}; return num(p[MON[moneda].k]); }
  function tasas(f) { var t = { USD: 1, PYG: cambioDePrecios('PYG', f.hasta), BRL: cambioDePrecios('BRL', f.hasta) }; if (num(f.cambioUSD) > 0 && monedaDe(f) !== 'USD') t[monedaDe(f)] = num(f.cambioUSD); return t; }
  function conv(f, v, dest) { if (v == null) return null; var o = monedaDe(f); if (o === dest) return v; var t = tasas(f); if (!(t[o] > 0) || !(t[dest] > 0)) return null; return v / t[o] * t[dest]; }
  function plata(v, m) { if (v == null || isNaN(v) || !isFinite(v)) return '—'; var a = Math.abs(v), d = m === 'PYG' ? 0 : (a >= 1000 ? 0 : a >= 10 ? 2 : 3); return MON[m].s + ' ' + fmt(v, d); }
  function M(f, v) { var d = vista(), c = conv(f, v, d); return c != null ? plata(c, d) : plata(v, monedaDe(f)); }
  function sinCambio(f) { return conv(f, 1, vista()) == null; }
  function limpiarNombre(n) { return String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80); }

  /* ---------- datos ---------- */
  function leer(k) { if (B() && B().leer) return B().leer(k); try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function facturasDe(campoId) { return leer('facturas_energia').filter(function (f) { return String(f.campoId) === String(campoId); }).sort(function (a, b) { return dia(b.hasta).localeCompare(dia(a.hasta)); }); }
  function pivotsDe(campoId) { return leer('equipos').filter(function (e) { return String(e.campoId) === String(campoId) && e.tipo !== 'secano' && !e.zona; }); }
  function haDe(eq) { return num(eq && eq.superficie) || (eq && eq.poligono && num(eq.poligono.ha)) || 0; }
  function riegoMM(equipoId, desde, hasta) {
    var s = 0; leer('eventos').forEach(function (e) { if (e.tipo === 'riego' && String(e.equipoId) === String(equipoId) && dia(e.fecha) >= desde && dia(e.fecha) <= hasta) s += num(e.cantidad) || 0; });
    return s;
  }
  function equiposDeFactura(f) {
    var todos = pivotsDe(f.campoId);
    if (!f.equipos || !f.equipos.length) return todos;
    return todos.filter(function (e) { return f.equipos.map(String).indexOf(String(e.id)) !== -1; });
  }
  function kwhDe(f) { var a = (num(f.kwhPunta) || 0) + (num(f.kwhFueraPunta) || 0); return a > 0 ? a : (num(f.kwhTotal) || 0); }

  /* ---------- 2. reparto de una factura entre los pivots ---------- */
  // kWh de las luces de un pivot en un período: potencia (kW) × horas por noche × noches, según las tandas cargadas en la campaña
  function kwhLuz(eq, desde, hasta) {
    var dt = (eq && eq.datosTecnicos) || {}, kw = num(dt.luzKw); if (dt.luz !== 'Sí' || !(kw > 0)) return { kwh: 0, noches: 0, sinPotencia: dt.luz === 'Sí' && !(kw > 0) };
    var k = 0, n = 0;
    leer('campanas').forEach(function (c) { if (String(c.equipoId) !== String(eq.id)) return; (c.insumos || []).forEach(function (i) {
      if (i.categoria !== 'luz' || !i.fecha) return;
      var a = dia(i.fecha) > desde ? dia(i.fecha) : desde, b = i.fechaHasta && dia(i.fechaHasta) < hasta ? dia(i.fechaHasta) : hasta; if (a > b) return;
      var noches = Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1, h = num(i.dosis) || 0;
      k += kw * h * noches; n += noches;
    }); });
    return { kwh: k, noches: n };
  }
  function repartir(f) {
    var eqs = equiposDeFactura(f), kwh = kwhDe(f), total = num(f.total) || 0, vol = 0, gsKwh = kwh > 0 ? total / kwh : 0;
    var filas = eqs.map(function (e) { var mm = riegoMM(e.id, dia(f.desde), dia(f.hasta)), ha = haDe(e), L = kwhLuz(e, dia(f.desde), dia(f.hasta)); vol += mm * ha; return { equipo: e, mm: mm, ha: ha, vol: mm * ha, luzKwh: L.kwh, luzNoches: L.noches, luzSinPotencia: L.sinPotencia }; });
    // la energía de las luces se le carga a su pivot y sale del total antes de repartir el riego por mm × ha
    var kwhL = 0; filas.forEach(function (x) { kwhL += x.luzKwh; });
    if (kwhL > kwh) { var f0 = kwh / kwhL; filas.forEach(function (x) { x.luzKwh *= f0; }); kwhL = kwh; }
    var kwhR = kwh - kwhL, totalR = total - kwhL * gsKwh;
    filas.forEach(function (x) { x.luzGs = x.luzKwh * gsKwh; x.pct = vol > 0 ? x.vol / vol : null; x.gsRiego = x.pct != null ? totalR * x.pct : 0; x.kwhRiego = x.pct != null ? kwhR * x.pct : 0;
      x.gs = x.pct != null || x.luzGs ? x.gsRiego + x.luzGs : null; x.kwh = x.pct != null || x.luzKwh ? x.kwhRiego + x.luzKwh : null; x.gsHa = x.gs != null && x.ha ? x.gs / x.ha : null; });
    return { filas: filas, volumen: vol, total: total, kwh: kwh, luzKwh: kwhL, luzGs: kwhL * gsKwh, gsPorMmHa: vol > 0 ? totalR / vol : null, kwhPorMmHa: vol > 0 ? kwhR / vol : null, sinRiego: !(vol > 0) && !(kwhL > 0), sinHa: filas.some(function (x) { return !x.ha; }) };
  }

  /* ---------- 3. qué dice la factura ---------- */
  function leerFactura(f) {
    var kwh = kwhDe(f), total = num(f.total) || 0, kvar = num(f.kvarh), o = { kwh: kwh, gsKwh: kwh > 0 ? total / kwh : null, avisos: [] };
    var iE = (num(f.importeEnergiaPunta) || 0) + (num(f.importeEnergiaFueraPunta) || 0) || num(f.importeEnergia) || 0;
    o.importeEnergia = iE; o.pctEnergia = total > 0 && iE ? iE / total : null;
    o.fp = kwh > 0 && kvar != null ? kwh / Math.sqrt(kwh * kwh + kvar * kvar) : null;
    var exc = num(f.importeExcesoPotencia), pc = num(f.potenciaContratadaKw), pr = Math.max(num(f.potenciaRegistradaKw) || 0, num(f.potenciaRegistradaPuntaKw) || 0) || null;
    if (exc > 0) o.avisos.push({ nivel: 'rojo', titulo: 'Exceso de potencia reservada: ' + M(f, exc) + ' (' + fmt(exc / total * 100) + ' % de la factura)',
      texto: (pc && pr ? 'La factura dice ' + fmt(pc) + ' kW contratados y el medidor registró ' + fmt(pr) + ' kW. ' : '') + 'Es un recargo por pasarse de la potencia contratada, no es energía consumida. Llevar esta factura a la ANDE y revisar con el electricista qué potencia conviene reservar: mientras no se corrija, se paga todos los meses.' });
    else if (pc && pr && pr > pc * 1.1) o.avisos.push({ nivel: 'ambar', titulo: 'La potencia registrada (' + fmt(pr) + ' kW) pasó la contratada (' + fmt(pc) + ' kW)', texto: 'Revisar con la ANDE si corresponde ajustar la potencia reservada.' });
    var rea = num(f.importeReactiva);
    if (rea > 0) o.avisos.push({ nivel: 'ambar', titulo: 'Energía reactiva: ' + M(f, rea) + (o.fp != null ? ' · factor de potencia ' + fmt(o.fp, 2) : ''),
      texto: (kvar != null ? 'El medidor registró ' + fmt(kvar) + ' kVArh de reactiva contra ' + fmt(kwh) + ' kWh de activa. ' : '') + 'La reactiva no riega: la generan los motores. Un banco de capacitores bien calculado la baja; consultarlo con el electricista.' });
    var kp = num(f.kwhPunta), kf = num(f.kwhFueraPunta), ip = num(f.importeEnergiaPunta), ifp = num(f.importeEnergiaFueraPunta);
    if (kp > 0 && kf > 0 && ip > 0 && ifp > 0) {
      var pp = ip / kp, pf = ifp / kf; o.precioPunta = pp; o.precioFuera = pf;
      if (pp > pf * 1.3) o.avisos.push({ nivel: 'info', titulo: 'En horario de punta el kWh costó ' + M(f, pp) + ' contra ' + M(f, pf) + ' fuera de punta', texto: fmt(kp / (kp + kf) * 100) + ' % de la energía se consumió en punta. Regar fuera del horario de punta baja ese renglón de ' + M(f, ip) + ' a unos ' + M(f, kp * pf) + '.' });
    }
    return o;
  }

  /* ---------- 4. informe de agua de la campaña ---------- */
  function energiaDeCampana(campo, lote, desde, hasta) {
    var gsT = 0, kwhT = 0, mmCub = 0, usadas = 0, ha = haDe(lote), mon = vista(), partes = [];
    facturasDe(campo.id).forEach(function (f) {
      if (equiposDeFactura(f).every(function (e) { return String(e.id) !== String(lote.id); })) return;
      var d0 = dia(f.desde) > desde ? dia(f.desde) : desde, d1 = dia(f.hasta) < hasta ? dia(f.hasta) : hasta; if (d0 > d1) return;
      var r = repartir(f); if (r.gsPorMmHa == null) return;   // la luz ya salió del costo del mm (ver repartir)
      var mm = riegoMM(lote.id, d0, d1); if (!(mm > 0)) return;
      partes.push({ f: f, v: mm * ha * r.gsPorMmHa }); kwhT += mm * ha * r.kwhPorMmHa; mmCub += mm; usadas++;
    });
    var faltaCambio = partes.some(function (p) { return conv(p.f, p.v, mon) == null; }), mezcla = false;
    if (faltaCambio && partes.length) { mon = monedaDe(partes[0].f); mezcla = partes.some(function (p) { return monedaDe(p.f) !== mon; }); }
    partes.forEach(function (p) { gsT += conv(p.f, p.v, mon) || 0; });
    var mmTot = riegoMM(lote.id, desde, hasta);
    return { moneda: mon, faltaCambio: faltaCambio, gs: usadas && !mezcla ? gsT : null, kwh: usadas ? kwhT : null, facturas: usadas, mmCubiertos: mmCub, mmRiego: mmTot, cobertura: mmTot > 0 ? mmCub / mmTot : null };
  }
  function informeCampana(campo, lote, camp) {
    // La lluvia del satélite (CHIRPS y NASA POWER) se baja ANTES de calcular: si no, la primera vez el balance sale con la lluvia
    // estimada por el modelo y la segunda con la del satélite, y el informe de cierre daría dos resultados distintos.
    var pre = Promise.resolve();
    try {
      var co = window.SafiaBalance && SafiaBalance.coordenadasLote ? SafiaBalance.coordenadasLote(lote, campo) : null, finS = camp.cosecha || camp.cosechaEstimada || new Date().toISOString().slice(0, 10);
      if (co && window.SafiaLluvia && SafiaLluvia.completar) pre = Promise.race([Promise.resolve(SafiaLluvia.completar(co.lat, co.lon, camp.siembra, finS)).then(function () { return SafiaLluvia.completarPower ? SafiaLluvia.completarPower(co.lat, co.lon, camp.siembra, finS) : null; }).catch(function () {}), new Promise(function (r) { setTimeout(r, 30000); })]);
    } catch (e) {}
    return pre.then(function () { return SafiaAgua.calcular(campo, lote, camp); }).then(function (res) {
      var reales = res.dias.filter(function (x) { return !x.pronostico; });
      var filas0 = reales.map(function (x) { return { fecha: x.fecha, et0: x.et0, lluvia: x.lluvia || 0, riego: 0 }; });
      var nec = SafiaAgua.balance(filas0, camp.cultivo, res.suelo, { riegoDeclarado: 99999, eficiencia: res.eficiencia, lamina: 10 });
      var sum = function (k) { return reales.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
      var aplicado = Math.round(sum('riego')), necesario = nec.riegoRepartido, lluvia = Math.round(sum('lluvia')), etc = Math.round(sum('etc')), eta = Math.round(sum('eta'));
      var estres = reales.filter(function (x) { return x.ks < 1; }).length, ha = haDe(lote), desde = reales.length ? reales[0].fecha : camp.siembra, hasta = reales.length ? reales[reales.length - 1].fecha : camp.siembra;
      var en = energiaDeCampana(campo, lote, desde, hasta), rinde = num(camp.rinde);
      return { campo: campo, lote: lote, camp: camp, res: res, desde: desde, hasta: hasta, dias: reales.length, ha: ha, aplicado: aplicado, necesario: necesario, diferencia: aplicado - necesario,
        aprovechamiento: aplicado > 0 ? Math.min(1, necesario / aplicado) : null, lluvia: lluvia, etc: etc, eta: eta, diasEstres: estres, perdidaPct: res.perdidaPct, drenaje: res.totales ? res.totales.percolado : null,
        eficienciaEquipo: res.eficiencia, lluviaSatelite: res.fuentes ? res.fuentes.lluviaChirps || 0 : 0, lluviaCargada: !!res.lluviaDeEventos, lluviaEstacion: res.fuentes ? res.fuentes.estacion || 0 : 0, riegoDeEventos: reales.some(function (x) { return x.riego > 0 && !x.riegoRepartido; }), rinde: rinde,
        kgPorMm: rinde && (lluvia + aplicado) > 0 ? rinde / (lluvia + aplicado) : null, energia: en,
        gsHa: en.gs != null && ha ? en.gs / ha : null, gsMm: en.gs != null && en.mmCubiertos > 0 && ha ? en.gs / ha / en.mmCubiertos : null, kwhMmHa: en.kwh != null && en.mmCubiertos > 0 && ha ? en.kwh / ha / en.mmCubiertos : null,
        gsTon: en.gs != null && rinde && ha ? en.gs / (rinde * ha / 1000) : null };
    });
  }
  function dato(t, v, sub, color) { return '<div style="flex:1 1 150px;min-width:140px;border:1px solid #E1E4E7;border-left:4px solid ' + (color || '#2E72C8') + ';border-radius:8px;padding:8px 10px;background:#fff;"><div style="font-size:11px;color:#8C9196;text-transform:uppercase;letter-spacing:.04em;">' + t + '</div><div style="font-size:16px;font-weight:700;color:#2E3236;margin-top:2px;">' + v + '</div><div style="font-size:11px;color:#3A3E41;margin-top:2px;line-height:1.35;">' + (sub || '') + '</div></div>'; }
  function htmlInforme(I) {
    var dif = I.diferencia, colD = Math.abs(dif) <= Math.max(15, I.necesario * 0.15) ? '#178029' : (dif > 0 ? '#B8731A' : '#B5371C');
    var juicio = I.aplicado === 0 && I.necesario === 0 ? 'No hizo falta regar: la lluvia cubrió el consumo.' : Math.abs(dif) <= Math.max(15, I.necesario * 0.15) ? 'Se regó lo que hacía falta.' : dif > 0 ? 'Se regaron <b>' + fmt(dif) + ' mm de más</b>: agua y energía que no hacían falta.' : 'Faltaron <b>' + fmt(-dif) + ' mm</b> de riego.';
    if (I.diasEstres > 5 && dif >= -15 && I.aplicado > 0) juicio += ' Pero hubo <b>' + I.diasEstres + ' días de estrés</b>: el agua alcanzó en cantidad y llegó tarde. Arrancar el pivot cuando SAFIA lo avisa.';
    var en = I.energia, gs = function (v) { return plata(v, en.moneda || vista()); }, h = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Informe de agua · ' + esc(I.lote.nombre) + ' · ' + esc(I.camp.cultivo) + '</h3><span class="muted">' + esc(I.camp.nombre || '') + ' · ' + fmtF(I.desde) + ' al ' + fmtF(I.hasta) + ' (' + I.dias + ' días)' + (I.camp.cosecha ? '' : ' · campaña sin cerrar') + '</span></div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      dato('Riego aplicado', fmt(I.aplicado) + ' mm', I.ha ? fmt(I.aplicado * I.ha * 10) + ' m³ en ' + fmt(I.ha, 1) + ' ha' + (I.riegoDeEventos ? '' : ' · declarado en la cosecha, no cargado día por día') : 'falta la superficie del lote') +
      dato('Riego necesario', fmt(I.necesario) + ' mm', 'para que el cultivo no pasara sed con la lluvia que hubo (balance FAO-56)') +
      dato('Diferencia', (dif > 0 ? '+' : '') + fmt(dif) + ' mm', juicio, colD) +
      dato('Aprovechamiento', I.aprovechamiento != null ? fmt(I.aprovechamiento * 100) + ' %' : '—', 'del riego aplicado que hacía falta · eficiencia del equipo ' + fmt((I.eficienciaEquipo || 0) * 100) + ' %', I.aprovechamiento != null && I.aprovechamiento < 0.8 ? '#B8731A' : '#178029') + '</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">' +
      dato('Lluvia', fmt(I.lluvia) + ' mm', 'del ciclo · ' + (I.lluviaEstacion ? 'estación del campo' : I.lluviaSatelite >= I.dias * 0.9 ? 'satélite' : I.lluviaSatelite ? 'satélite en ' + I.lluviaSatelite + ' de ' + I.dias + ' días, el resto estimada' : 'estimada por el modelo (sin satélite)') + (I.lluviaCargada ? ' + pluviómetro cargado' : ''), I.lluviaSatelite || I.lluviaEstacion || I.lluviaCargada ? '#8C9196' : '#B8731A') +
      dato('Consumo del cultivo', fmt(I.eta) + ' mm', 'de ' + fmt(I.etc) + ' mm que pedía (ETc)', '#8C9196') +
      dato('Días con estrés', String(I.diasEstres), I.perdidaPct > 0 ? 'pérdida de rinde estimada por agua: ' + fmt(I.perdidaPct, 1) + ' %' : 'sin pérdida de rinde por agua', I.diasEstres > 5 ? '#B5371C' : '#178029') +
      dato('Kilos por mm', I.kgPorMm != null ? fmt(I.kgPorMm, 1) + ' kg/ha' : '—', I.rinde ? 'rinde ' + fmt(I.rinde) + ' kg/ha ÷ (lluvia + riego)' : 'falta el rinde de la cosecha', '#8C9196') + '</div>';
    h += '<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#178029;margin:12px 0 6px;">Energía de la campaña</div>';
    if (en.gs == null) h += '<div class="muted" style="font-size:13px;">' + (I.aplicado > 0 ? 'Todavía no hay facturas cargadas que cubran los riegos de esta campaña. Subí las facturas de la ANDE de ' + fmtF(I.desde) + ' a ' + fmtF(I.hasta) + '.' : 'Sin riegos cargados en la campaña: no hay energía de riego para repartir.') + '</div>';
    else h += '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      dato('Gasto de energía', gs(en.gs), en.facturas + ' factura' + (en.facturas > 1 ? 's' : '') + (en.cobertura != null && en.cobertura < 0.98 ? ' · <b style="color:#8a5713;">cubren ' + fmt(en.cobertura * 100) + ' % del riego: faltan facturas</b>' : ' · cubren todo el riego'), '#178029') +
      dato('Por hectárea', gs(I.gsHa), fmt(en.kwh / (I.ha || 1)) + ' kWh/ha', '#178029') +
      dato('Por mm regado', gs(I.gsMm) + '/ha', fmt(I.kwhMmHa, 1) + ' kWh por mm y por ha', '#178029') +
      dato('Por tonelada', I.gsTon != null ? gs(I.gsTon) : '—', I.rinde ? 'de ' + esc(I.camp.cultivo) + ' cosechada' : 'falta el rinde de la cosecha', '#178029') + '</div>' +
      (en.faltaCambio ? '<div class="muted" style="font-size:12px;margin-top:6px;color:#8a5713;">Se muestra en ' + MON[en.moneda].n + ' porque a alguna factura le falta el tipo de cambio: cargalo en la factura (Editar) o en Datos → Precios.</div>' : '');
    h += '<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.45;">Necesario = riego bruto que hacía falta para no entrar en estrés, con la lluvia real y el mismo balance diario FAO-56 de SAFIA (suelo: ' + esc((I.res.suelo && I.res.suelo.origen) || 'franco por defecto') + '). Energía = cada factura repartida entre los pivots de su medidor según mm regados × hectáreas. Es un cálculo: el riego que no se cargó no existe para SAFIA.</div></div>';
    return h;
  }

  /* ---------- pantalla ---------- */
  var CAMPOS = [['enNis', 'nis'], ['enNumero', 'numeroFactura'], ['enDesde', 'desde'], ['enHasta', 'hasta'], ['enVence', 'vencimiento'], ['enTotal', 'total'], ['enKwhP', 'kwhPunta'], ['enImpP', 'importeEnergiaPunta'], ['enKwhF', 'kwhFueraPunta'], ['enImpF', 'importeEnergiaFueraPunta'],
    ['enKvar', 'kvarh'], ['enImpR', 'importeReactiva'], ['enPotC', 'potenciaContratadaKw'], ['enPotR', 'potenciaRegistradaKw'], ['enImpPot', 'importePotencia'], ['enImpExc', 'importeExcesoPotencia']];
  var TEXTO = { nis: 1, numeroFactura: 1, desde: 1, hasta: 1, vencimiento: 1 };
  function campoF(id, etiqueta, tipo, ayuda) { return '<div style="flex:1 1 160px;min-width:150px;"><label style="display:block;font-size:12px;font-weight:600;color:#3A3E41;margin-bottom:3px;">' + etiqueta + '</label><input id="' + id + '" type="' + (tipo || 'number') + '"' + (tipo ? '' : ' step="any" min="0"') + ' style="width:100%;padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;">' + (ayuda ? '<div class="muted" style="font-size:11px;margin-top:2px;">' + ayuda + '</div>' : '') + '</div>'; }
  function htmlForm(campo) {
    var piv = pivotsDe(campo.id);
    return '<div class="card" id="enForm" style="display:none;margin-bottom:14px;"><div class="card-h"><h3 id="enTitulo">Nueva factura de energía</h3></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;"><input type="file" id="enArchivo" accept="image/*,application/pdf"><button type="button" class="btn green" id="enLeer">Leer la factura con IA y completar solo</button></div>' +
      '<div class="muted" id="enHint" style="font-size:12px;margin-bottom:10px;">Sacale una foto a la factura de la ANDE o subí el PDF. SAFIA completa los datos; revisalos antes de guardar.</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' + campoF('enDesde', 'Consumo desde', 'date') + campoF('enHasta', 'Consumo hasta', 'date') + campoF('enTotal', 'Total a pagar', null, 'sin la comisión de la boca de cobranza') + '<div style="flex:1 1 160px;min-width:150px;"><label style="display:block;font-size:12px;font-weight:600;color:#3A3E41;margin-bottom:3px;">Moneda de la factura</label><select id="enMoneda" style="width:100%;padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;"><option value="PYG">Guaraníes (Gs.)</option><option value="BRL">Reales (R$)</option><option value="USD">Dólares (US$)</option></select></div>' + '<div id="enCambioCaja" style="flex:1 1 160px;min-width:150px;"><label id="enCambioLbl" style="display:block;font-size:12px;font-weight:600;color:#3A3E41;margin-bottom:3px;">Cambio del período</label><input id="enCambio" type="number" step="any" min="0" style="width:100%;padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;"><div class="muted" id="enCambioAyuda" style="font-size:11px;margin-top:2px;"></div></div>' + campoF('enNis', 'NIS (suministro)', 'text') + '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">' + campoF('enKwhF', 'kWh fuera de punta') + campoF('enImpF', 'Importe fuera de punta') + campoF('enKwhP', 'kWh en punta') + campoF('enImpP', 'Importe en punta') + '</div>' +
      '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:#2E3236;">Potencia, reactiva y otros datos de la factura</summary><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">' +
      campoF('enPotC', 'Potencia contratada (kW)') + campoF('enPotR', 'Potencia registrada (kW)') + campoF('enImpPot', 'Importe potencia reservada') + campoF('enImpExc', 'Importe exceso de potencia') + campoF('enKvar', 'Reactiva (kVArh)') + campoF('enImpR', 'Importe reactiva') + campoF('enNumero', 'N.º de factura', 'text') + campoF('enVence', 'Vencimiento', 'date') + '</div></details>' +
      '<div style="margin-top:12px;"><div style="font-size:12px;font-weight:600;color:#3A3E41;margin-bottom:4px;">Pivots que alimenta este medidor</div><div id="enEquipos" style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px;">' +
      (piv.length ? piv.map(function (e) { return '<label style="display:flex;gap:5px;align-items:center;"><input type="checkbox" value="' + esc(e.id) + '" checked> ' + esc(e.nombre) + (haDe(e) ? ' <span class="muted">(' + fmt(haDe(e), 1) + ' ha)</span>' : ' <span style="color:#B5371C;">(sin hectáreas)</span>') + '</label>'; }).join('') : '<span class="muted">Este campo no tiene pivots cargados.</span>') +
      '</div><div class="muted" style="font-size:11px;margin-top:3px;">El total se reparte entre estos pivots según los mm que regó cada uno en el período, por sus hectáreas.</div></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;"><button type="button" class="btn green" id="enGuardar">Guardar factura</button><button type="button" class="btn" id="enCancelar">Cancelar</button></div></div>';
  }
  function htmlFactura(f) {
    var L = leerFactura(f), r = repartir(f), col = { rojo: '#B5371C', ambar: '#B8731A', info: '#2E72C8' };
    var gs = function (v) { return M(f, v); }, orig = monedaDe(f) !== vista() && !sinCambio(f) ? ' <span class="muted" style="font-size:12px;font-weight:500;">(' + plata(num(f.total), monedaDe(f)) + ' al cambio ' + fmt(tasas(f)[monedaDe(f)], monedaDe(f) === 'PYG' ? 0 : 4) + ')</span>' : '';
    var h = '<div class="card" style="margin-bottom:12px;"><div class="card-h"><h3>' + fmtF(f.desde) + ' al ' + fmtF(f.hasta) + ' · ' + gs(f.total) + orig + '</h3><span class="muted">' + (f.nis ? 'NIS ' + esc(f.nis) + ' · ' : '') + fmt(L.kwh) + ' kWh · <b>' + (L.gsKwh != null ? gs(L.gsKwh) + ' por kWh real' : '') + '</b>' + (L.pctEnergia != null ? ' · la energía es el ' + fmt(L.pctEnergia * 100) + ' % de la factura' : '') + '</span></div>';
    if (sinCambio(f)) h += '<div style="border-left:4px solid #B8731A;background:#FAFBFC;border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:13px;color:#8a5713;">Falta el tipo de cambio de este período: se muestra en ' + MON[monedaDe(f)].n + '. Cargalo con Editar, o en Datos → Precios.</div>';
    L.avisos.forEach(function (a) { h += '<div style="border-left:4px solid ' + col[a.nivel] + ';background:#FAFBFC;border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:13px;"><b style="color:' + col[a.nivel] + ';">' + a.titulo + '</b><div style="color:#3A3E41;line-height:1.4;margin-top:2px;">' + a.texto + '</div></div>'; });
    if (r.sinRiego) h += '<div class="muted" style="font-size:13px;margin:6px 0;">No hay riegos cargados entre el ' + fmtF(f.desde) + ' y el ' + fmtF(f.hasta) + ' en los pivots de este medidor: no hay con qué repartir. Si se regó, cargá los riegos (Operador) y el reparto aparece solo.</div>';
    else h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Pivot</th><th class="r">Regó (mm)</th><th class="r">Hectáreas</th><th class="r">Parte</th><th class="r">Gasto</th><th class="r">kWh</th><th class="r">Por ha</th></tr></thead><tbody>' +
      r.filas.map(function (x) { return '<tr><td>' + esc(x.equipo.nombre) + '</td><td class="r">' + fmt(x.mm) + '</td><td class="r">' + (x.ha ? fmt(x.ha, 1) : '<span style="color:#B5371C;">falta</span>') + '</td><td class="r">' + (x.pct != null ? fmt(x.pct * 100) + ' %' : '—') + '</td><td class="r"><b>' + gs(x.gs) + '</b>' + (x.luzGs > 0 ? '<div style="font-size:11px;color:#8A5A00;">luz: ' + gs(x.luzGs) + '</div>' : '') + (x.luzSinPotencia ? '<div style="font-size:11px;color:#B5371C;" title="Cargá la potencia de las luces en Equipos y lotes">luz sin potencia</div>' : '') + '</td><td class="r">' + fmt(x.kwh) + '</td><td class="r">' + (x.gsHa != null ? gs(x.gsHa) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div><div class="muted" style="font-size:12px;margin-top:6px;">Cada mm regado en una hectárea costó <b>' + gs(r.gsPorMmHa) + '</b> y ' + fmt(r.kwhPorMmHa, 1) + ' kWh en este período.' + (r.luzKwh > 0 ? ' Las luces del pivot gastaron ' + fmt(r.luzKwh) + ' kWh (' + gs(r.luzGs) + '): se les cargan a su pivot y no entran en el costo del mm regado.' : '') + (r.sinHa ? ' Falta la superficie de algún pivot (Equipos y lotes): sin hectáreas no entra en el reparto.' : '') + '</div>';
    h += '<div style="display:flex;gap:8px;margin-top:8px;">' + (f.archivoRuta ? '<button class="btn mini" data-ver="' + esc(f.id) + '">Ver la factura</button>' : '') + '<button class="btn mini" data-editar="' + esc(f.id) + '">Editar</button><button class="btn mini" data-borrar="' + esc(f.id) + '">Borrar</button></div></div>';
    return h;
  }
  function resumenAnual(campo) {
    var fs = facturasDe(campo.id); if (fs.length < 2) return '';
    var mon = vista(); if (fs.some(sinCambio)) { mon = monedaDe(fs[0]); if (fs.some(function (f) { return monedaDe(f) !== mon; })) return ''; }
    var gs = function (v) { return plata(v, mon); }, tot = 0, kwh = 0, exc = 0, rea = 0; fs.forEach(function (f) { tot += conv(f, num(f.total) || 0, mon) || 0; kwh += kwhDe(f); exc += conv(f, num(f.importeExcesoPotencia) || 0, mon) || 0; rea += conv(f, num(f.importeReactiva) || 0, mon) || 0; });
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' + dato('Facturas cargadas', String(fs.length), fmtF(fs[fs.length - 1].desde) + ' al ' + fmtF(fs[0].hasta), '#8C9196') + dato('Total pagado', gs(tot), fmt(kwh) + ' kWh · ' + (kwh ? gs(tot / kwh) + ' por kWh real' : ''), '#178029') +
      dato('Exceso de potencia', gs(exc), tot ? fmt(exc / tot * 100) + ' % de lo pagado' : '', exc > 0 ? '#B5371C' : '#178029') + dato('Reactiva', gs(rea), tot ? fmt(rea / tot * 100) + ' % de lo pagado' : '', rea > 0 ? '#B8731A' : '#178029') + '</div>';
  }
  function pintar() {
    var cont = $('energiaCont'), campo = B().campoActual(); if (!cont) return;
    if (!campo) { cont.innerHTML = '<div class="muted">Elegí un campo.</div>'; return; }
    var fs = facturasDe(campo.id), piv = pivotsDe(campo.id);
    cont.innerHTML = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn green" id="enNueva">+ Subir factura de energía</button><span class="muted" style="font-size:12px;">Subí la factura de la ANDE de cada mes: SAFIA la lee, reparte el gasto entre los pivots según lo que regó cada uno y arma el costo real de energía de cada campaña.</span><span style="margin-left:auto;font-size:12px;color:#3A3E41;display:flex;gap:6px;align-items:center;">Ver en <select id="enVista" style="padding:6px 8px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;"><option value="USD">US$ dólares</option><option value="PYG">Gs. guaraníes</option><option value="BRL">R$ reales</option></select></span></div>' +
      htmlForm(campo) + resumenAnual(campo) +
      (fs.length ? fs.map(htmlFactura).join('') : '<div class="card"><div class="muted">Todavía no hay facturas cargadas en este campo.</div></div>') +
      '<div class="card" style="margin-top:16px;"><div class="card-h"><h3>Informe de agua de la campaña</h3><span class="muted">mm aplicados contra los necesarios, aprovechamiento, kWh y gasto de energía</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><select id="enLote" style="padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;">' + piv.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join('') + '</select><select id="enCamp" style="padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;max-width:100%;"></select><button class="btn green" id="enVerInforme">Ver informe</button><button class="btn" id="enImprimir" style="display:none;">Imprimir</button></div><div id="enInforme"></div></div>';
    $('enVista').value = vista(); $('enVista').addEventListener('change', function () { try { localStorage.setItem('safia_moneda_vista', $('enVista').value); } catch (e) {} pintar(); });
    ['enMoneda', 'enHasta'].forEach(function (id) { $(id).addEventListener('change', function () { ajustarCambio(true); }); });
    $('enNueva').addEventListener('click', function () { abrirForm(null); });
    $('enCancelar').addEventListener('click', cerrarForm); $('enGuardar').addEventListener('click', guardar); $('enLeer').addEventListener('click', leerConIA);
    cont.querySelectorAll('[data-editar]').forEach(function (b) { b.addEventListener('click', function () { abrirForm(b.getAttribute('data-editar')); }); });
    cont.querySelectorAll('[data-borrar]').forEach(function (b) { b.addEventListener('click', function () { borrar(b.getAttribute('data-borrar'), b); }); });
    cont.querySelectorAll('[data-ver]').forEach(function (b) { b.addEventListener('click', function () { ver(b.getAttribute('data-ver')); }); });
    if ($('enLote')) { $('enLote').addEventListener('change', llenarCampanas); llenarCampanas(); }
    $('enVerInforme').addEventListener('click', verInforme);
    $('enImprimir').addEventListener('click', imprimir);
  }
  var campsLote = [];
  function llenarCampanas() {
    var sel = $('enCamp'), id = $('enLote') && $('enLote').value; if (!sel) return;
    campsLote = id && window.SafiaAgua ? SafiaAgua.campanasDelLote(id) : [];
    sel.innerHTML = campsLote.length ? campsLote.map(function (c, i) { return '<option value="' + i + '">' + esc(c.cultivo) + ' · siembra ' + fmtF(c.siembra) + (c.cosecha ? ' · cosechada' : ' · en curso') + '</option>'; }).join('') : '<option value="">Sin campañas en este lote</option>';
  }
  function verInforme() {
    var campo = B().campoActual(), lote = pivotsDe(campo.id).find(function (e) { return String(e.id) === String($('enLote').value); }), camp = campsLote[+$('enCamp').value], out = $('enInforme');
    if (!lote || !camp) { B().toast('Elegí el lote y la campaña', true); return; }
    out.innerHTML = '<div class="muted" style="margin-top:10px;">Calculando el balance de agua de la campaña…</div>';
    informeCampana(campo, lote, camp).then(function (I) { out.innerHTML = htmlInforme(I); $('enImprimir').style.display = ''; })
      .catch(function (e) { console.error(e); out.innerHTML = '<div class="muted" style="margin-top:10px;">No se pudo calcular el informe (' + esc((e && e.message) || 'sin clima') + '). Revisá que el campo tenga coordenadas y que haya internet.</div>'; });
  }
  function imprimir() {
    var c = B().campoActual(), w = window.open('', '_blank'); if (!w) { B().toast('El navegador bloqueó la ventana de impresión', true); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de agua · ' + esc(c.nombre) + '</title><style>body{font-family:"Plus Jakarta Sans",Arial,sans-serif;color:#2E3236;margin:24px;} h3{margin:0 0 4px;} .muted{color:#8C9196;} .card-h{margin-bottom:10px;}</style></head><body><div style="font-size:12px;color:#178029;font-weight:700;letter-spacing:.06em;">SAFIA · IRRIGAR S.A.</div><div class="muted" style="font-size:12px;margin-bottom:8px;">' + esc(c.nombre) + '</div>' + $('enInforme').innerHTML + '</body></html>');
    w.document.close(); setTimeout(function () { w.print(); }, 300);
  }
  // el cambio del período: se propone el de Datos → Precios vigente a la fecha de la factura; lo que se escribe manda y queda guardado
  function ajustarCambio(proponer) {
    var m = $('enMoneda').value, caja = $('enCambioCaja'); caja.style.display = m === 'USD' ? 'none' : '';
    if (m === 'USD') return;
    $('enCambioLbl').textContent = 'Cambio del período (' + MON[m].s + ' por US$)';
    var sug = cambioDePrecios(m, $('enHasta').value || new Date().toISOString().slice(0, 10));
    if (proponer && !$('enCambio').value && sug > 0) $('enCambio').value = sug;
    $('enCambioAyuda').textContent = sug > 0 ? 'En Datos → Precios figura ' + fmt(sug, m === 'PYG' ? 0 : 4) + ' para esa fecha. Queda guardado con la factura.' : 'Cuántos ' + MON[m].n + ' valía un dólar en ese período. Queda guardado con la factura.';
  }
  function abrirForm(id) {
    var f = id ? leer('facturas_energia').find(function (x) { return String(x.id) === String(id); }) : null;
    editandoId = f ? f.id : null; leida = null;
    $('enForm').style.display = ''; $('enTitulo').textContent = f ? 'Editar factura del ' + fmtF(f.desde) + ' al ' + fmtF(f.hasta) : 'Nueva factura de energía';
    CAMPOS.forEach(function (c) { $(c[0]).value = f && f[c[1]] != null ? f[c[1]] : ''; });
    $('enArchivo').value = '';
    $('enMoneda').value = f ? monedaDe(f) : 'PYG'; $('enCambio').value = f && f.cambioUSD != null ? f.cambioUSD : ''; ajustarCambio(true);
    if (f && f.equipos && f.equipos.length) $('enEquipos').querySelectorAll('input').forEach(function (i) { i.checked = f.equipos.map(String).indexOf(String(i.value)) !== -1; });
    $('enForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cerrarForm() { if ($('enForm')) $('enForm').style.display = 'none'; editandoId = null; leida = null; }
  function volcar(d) { if (MON[d.moneda]) { $('enMoneda').value = d.moneda; } setTimeout(function () { ajustarCambio(true); }, 0); CAMPOS.forEach(function (c) { var v = d[c[1]]; if (c[1] === 'kwhFueraPunta' && v == null && d.kwhTotal != null) v = d.kwhTotal; if (c[1] === 'importeEnergiaFueraPunta' && v == null && d.importeEnergia != null) v = d.importeEnergia; if (v != null && v !== '') $(c[0]).value = v; }); }
  function archivoABase64(a) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(a); }); }
  function comprimir(archivo) {
    return new Promise(function (res, rej) { var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () { var e = Math.min(1, 2000 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.85).split(',')[1]); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('imagen')); }; img.src = url; });
  }
  function leerConIA() {
    var archivo = $('enArchivo').files && $('enArchivo').files[0], hint = $('enHint'), boton = $('enLeer');
    if (!archivo) { B().toast('Primero elegí la foto o el PDF de la factura', true); return; }
    if (!window.safiaSupabase) { B().toast('Sin conexión a internet', true); return; }
    var esPdf = /pdf$/i.test(archivo.type) || /\.pdf$/i.test(archivo.name);
    boton.disabled = true; boton.textContent = 'Leyendo…'; hint.textContent = 'Leyendo la factura con IA, tarda unos segundos…';
    (esPdf ? archivoABase64(archivo) : comprimir(archivo)).then(function (b64) {
      return window.safiaSupabase.functions.invoke('safia-leer-factura', { body: { mime: esPdf ? 'application/pdf' : 'image/jpeg', data_base64: b64 } });
    }).then(function (r) {
      if (r.error) throw r.error;
      var d = r.data && r.data.factura; if (!d) throw new Error('La IA no encontró los datos de la factura');
      leida = d; volcar(d);
      hint.innerHTML = 'Factura leída' + (d.titular ? ' (' + esc(d.titular) + ')' : '') + '. <b>Revisá los números contra el papel antes de guardar.</b>' + (d.observaciones ? ' Nota de lectura: ' + esc(d.observaciones) : '');
      B().toast('Factura leída: revisá los valores');
    }).catch(function (e) {
      console.error(e);
      var explicar = function (msg) { hint.textContent = 'No se pudo leer automáticamente' + (msg ? ': ' + msg : '') + '. Cargá los datos a mano (el archivo igual se guarda).'; B().toast('No se pudo leer con IA', true); };
      if (e && e.context && typeof e.context.json === 'function') e.context.json().then(function (j) { explicar((j && j.error) || e.message); }).catch(function () { explicar(e.message); });
      else explicar((e && e.message) || '');
    }).finally(function () { boton.disabled = false; boton.textContent = 'Leer la factura con IA y completar solo'; });
  }
  function guardar() {
    var c = B().campoActual(); if (!c) return;
    var previo = editandoId ? leer('facturas_energia').find(function (x) { return String(x.id) === String(editandoId); }) : null, item = Object.assign({}, previo || {});
    CAMPOS.forEach(function (k) { var v = $(k[0]).value; item[k[1]] = TEXTO[k[1]] ? (v || null) : num(v); });
    if (!item.desde || !item.hasta) { B().toast('Falta el período de consumo (desde y hasta)', true); return; }
    if (item.desde > item.hasta) { B().toast('El período está al revés: "desde" es posterior a "hasta"', true); return; }
    if (diasEntre(item.desde, item.hasta) > 70) { B().toast('El período tiene más de 70 días: revisá las fechas', true); return; }
    if (!(item.total > 0)) { B().toast('Falta el total a pagar', true); return; }
    if (!((item.kwhPunta || 0) + (item.kwhFueraPunta || 0) > 0)) { B().toast('Faltan los kWh consumidos', true); return; }
    var repetida = leer('facturas_energia').find(function (x) { return String(x.id) !== String(editandoId) && String(x.campoId) === String(c.id) && dia(x.desde) === item.desde && dia(x.hasta) === item.hasta && String(x.nis || '') === String(item.nis || ''); });
    if (repetida) { B().toast('Esa factura ya está cargada (mismo período y NIS)', true); return; }
    item.moneda = $('enMoneda').value; item.cambioUSD = item.moneda === 'USD' ? null : num($('enCambio').value);
    if (item.moneda !== 'USD' && item.cambioUSD != null && (item.moneda === 'PYG' ? (item.cambioUSD < 1000 || item.cambioUSD > 20000) : (item.cambioUSD < 1 || item.cambioUSD > 20))) { B().toast('Revisá el cambio: ' + item.cambioUSD + ' ' + MON[item.moneda].s + ' por dólar no parece correcto', true); return; }
    item.equipos = Array.prototype.slice.call($('enEquipos').querySelectorAll('input:checked')).map(function (i) { return i.value; });
    if (leida) ['distribuidora', 'medidor', 'titular', 'categoria', 'tension', 'ciclo', 'emision', 'potenciaRegistradaPuntaKw', 'importeAlumbrado', 'iva', 'conceptos'].forEach(function (k) { if (leida[k] != null) item[k] = leida[k]; });
    Object.assign(item, { id: previo ? previo.id : Date.now(), campoId: c.id, fechaCreacion: previo ? previo.fechaCreacion : new Date().toISOString() });
    var archivo = $('enArchivo').files && $('enArchivo').files[0];
    var pre = archivo && window.safiaSupabase ? window.safiaSupabase.storage.from('safia').upload('campo_' + c.id + '/energia/' + Date.now() + '_' + limpiarNombre(archivo.name), archivo, { upsert: false }).then(function (r) { if (r.error) throw r.error; item.archivoRuta = r.data && r.data.path ? r.data.path : null; item.archivoNombre = archivo.name; }).catch(function (e) { console.error(e); B().toast('El archivo no se pudo subir; los datos se guardan igual', true); }) : Promise.resolve();
    pre.then(function () {
      var todos = leer('facturas_energia').filter(function (x) { return String(x.id) !== String(item.id); }); todos.push(item); B().guardar('facturas_energia', todos);
      B().toast('Factura guardada'); cerrarForm(); pintar();
    });
  }
  function borrar(id, boton) {
    if (boton.dataset.seguro !== '1') { boton.dataset.seguro = '1'; boton.textContent = 'Tocá de nuevo para borrar'; setTimeout(function () { boton.dataset.seguro = ''; boton.textContent = 'Borrar'; }, 4000); return; }
    B().guardar('facturas_energia', leer('facturas_energia').filter(function (x) { return String(x.id) !== String(id); })); B().toast('Factura borrada'); pintar();
  }
  function ver(id) {
    var f = leer('facturas_energia').find(function (x) { return String(x.id) === String(id); }); if (!f || !f.archivoRuta || !window.safiaSupabase) return;
    window.safiaSupabase.storage.from('safia').createSignedUrl(f.archivoRuta, 3600).then(function (r) { if (r.data && r.data.signedUrl) window.open(r.data.signedUrl, '_blank'); else B().toast('No se pudo abrir el archivo', true); });
  }
  /* ---------- fuera del Banco: cierre de cosecha, informe PDF y Asistente ---------- */
  function asegurarPuente() { if (!window.SafiaBanco) window.SafiaBanco = { _energia: true, campoActual: function () { return null; }, leer: function (k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }, guardar: function () {}, toast: function () {}, refrescar: function () {} }; }
  function imprimirHtml(titulo, sub, cuerpo) {
    var w = window.open('', '_blank'); if (!w) return false;
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(titulo) + '</title><style>body{font-family:"Plus Jakarta Sans",Arial,sans-serif;color:#2E3236;margin:24px;} h3{margin:0 0 4px;} .muted{color:#8C9196;} .card-h{margin-bottom:10px;}</style></head><body><div style="font-size:12px;color:#178029;font-weight:700;letter-spacing:.06em;">SAFIA · IRRIGAR S.A.</div><div class="muted" style="font-size:12px;margin-bottom:8px;">' + esc(sub || '') + '</div>' + cuerpo + '</body></html>');
    w.document.close(); setTimeout(function () { w.print(); }, 300); return true;
  }
  // La campaña que conviene informar de un lote: la pedida, o la última cosechada, o la que está en curso
  function campanaParaInforme(loteId, idPedido) {
    var camps = window.SafiaAgua ? SafiaAgua.campanasDelLote(loteId) : [];
    return (idPedido && camps.find(function (x) { return x.id === idPedido; })) || camps.find(function (x) { return x.cosecha; }) || camps[0] || null;
  }
  // Al cerrar la cosecha en Campañas: el informe de agua de esa campaña, en una ventana encima de la pantalla
  function mostrarAlCierre(campanaId, indiceCultivo) {
    asegurarPuente();
    if (!window.SafiaAgua) return false;
    var c = leer('campanas').find(function (x) { return String(x.id) === String(campanaId); }); if (!c) return false;
    var lote = leer('equipos').find(function (e) { return String(e.id) === String(c.equipoId); }); if (!lote || lote.tipo === 'secano') return false;
    var campo = leer('campos').find(function (x) { return String(x.id) === String(lote.campoId); }); if (!campo) return false;
    var camp = campanaParaInforme(lote.id, c.id + '_' + (indiceCultivo || 0)); if (!camp) return false;
    var v = document.getElementById('enCierre'); if (v) v.remove();
    v = document.createElement('div'); v.id = 'enCierre';
    v.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(30,34,37,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:18px 10px;';
    v.innerHTML = '<style>#enCierre .muted{color:#8C9196;} #enCierre .card-h h3{margin:0 0 2px;font-size:17px;} #enCierre .card-h{margin-bottom:10px;} #enCierre .enBtn{padding:9px 14px;border-radius:8px;border:1px solid #D5D9DD;background:#fff;font:inherit;font-weight:600;cursor:pointer;} #enCierre .enBtn.v{background:#22A93A;border-color:#22A93A;color:#fff;}</style>' +
      '<div style="background:#fff;border-radius:14px;max-width:920px;width:100%;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.25);"><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#178029;">Cosecha cerrada · informe de agua de la campaña</div>' +
      '<div id="enCierreCuerpo"><div class="muted" style="margin:14px 0;">Calculando el balance de agua de la campaña…</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="enBtn v" id="enCierreImp" style="display:none;">Imprimir</button><button class="enBtn" id="enCierreFact">Subir facturas de energía</button><button class="enBtn" id="enCierreX" style="margin-left:auto;">Cerrar</button></div></div>';
    document.body.appendChild(v);
    document.getElementById('enCierreX').addEventListener('click', function () { v.remove(); });
    document.getElementById('enCierreFact').addEventListener('click', function () { try { sessionStorage.setItem('banco_campo', String(campo.id)); sessionStorage.setItem('banco_tab', 'energia'); } catch (e) {} location.href = 'banco.html'; });
    informeCampana(campo, lote, camp).then(function (I) {
      var cu = document.getElementById('enCierreCuerpo'); if (!cu) return;
      cu.innerHTML = htmlInforme(I);
      var bi = document.getElementById('enCierreImp'); bi.style.display = '';
      bi.addEventListener('click', function () { imprimirHtml('Informe de agua · ' + campo.nombre, campo.nombre, cu.innerHTML); });
    }).catch(function (e) { console.error(e); var cu = document.getElementById('enCierreCuerpo'); if (cu) cu.innerHTML = '<div class="muted" style="margin:14px 0;">No se pudo calcular el informe de agua ahora (' + esc((e && e.message) || 'sin clima') + '). Queda disponible en Banco → Energía y agua.</div>'; });
    return true;
  }
  // Para el informe PDF del cliente: tabla de facturas del campo y avisos de la última
  function htmlPdf(campo, equipoId) {
    var fs = facturasDe(campo.id); if (!fs.length) return '<div class="muted">Sin facturas de energía cargadas en este campo (Banco → Energía y agua).</div>';
    var th = function (t, r) { return '<th style="text-align:' + (r ? 'right' : 'left') + ';padding:5px 7px;border-bottom:1px solid #D5D9DD;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#8C9196;">' + t + '</th>'; };
    var td = function (t, r) { return '<td style="text-align:' + (r ? 'right' : 'left') + ';padding:5px 7px;border-bottom:1px solid #EEF0F2;font-size:12px;">' + t + '</td>'; };
    // Un solo pivot: la parte que le toca de cada factura del campo (reparto por mm × ha regados, más sus luces)
    if (equipoId) {
      var tot = 0, tkwh = 0, dv = vista(), hayTot = false, sinCambio = false, filasP = fs.map(function (f) { var r = repartir(f), x = r.filas.find(function (y) { return String(y.equipo.id) === String(equipoId); }); if (x && x.gs != null) { var cv = conv(f, x.gs, dv); if (cv != null) { tot += cv; hayTot = true; } else sinCambio = true; tkwh += x.kwh || 0; }
        return '<tr>' + td(fmtF(f.desde) + ' al ' + fmtF(f.hasta)) + td(M(f, num(f.total)) + '<div style="font-size:10.5px;color:#8C9196;">' + fmt(kwhDe(f)) + ' kWh</div>', 1) + td(x && x.mm != null ? fmt(x.mm) + ' mm' : '—', 1) + td(x && x.pct != null ? fmt(x.pct * 100) + ' %' : '—', 1) + td(x && x.kwh != null ? fmt(x.kwh) : '—', 1) + td(x && x.gs != null ? '<b>' + M(f, x.gs) + '</b>' : (x ? 'sin riegos cargados' : 'factura sin este pivot'), 1) + td(x && x.gsHa != null ? M(f, x.gsHa) : '—', 1) + '</tr>'; }).join('');
      return '<div style="font-size:12px;color:#5C6166;margin-bottom:6px;">Las facturas son del campo entero; a este pivot le toca la parte de su riego (mm × ha frente a los otros pivots de la misma factura) más sus luces.' + (hayTot ? ' En total: <b>' + plata(tot, dv) + '</b> y ' + fmt(tkwh) + ' kWh' + (sinCambio ? ' (alguna factura sin tipo de cambio quedó afuera del total)' : '') + '.' : '') + '</div>' +
        '<table style="width:100%;border-collapse:collapse;margin:6px 0;"><thead><tr>' + th('Período') + th('Factura del campo', 1) + th('Riego del pivot', 1) + th('Parte', 1) + th('kWh del pivot', 1) + th('Costo del pivot', 1) + th('Por ha', 1) + '</tr></thead><tbody>' + filasP + '</tbody></table>';
    }
    var h = resumenAnual(campo) + '<table style="width:100%;border-collapse:collapse;margin:6px 0;"><thead><tr>' + th('Período') + th('kWh', 1) + th('Total', 1) + th('Por kWh real', 1) + th('Exceso de potencia', 1) + th('Reactiva', 1) + th('Factor de potencia', 1) + th('Por mm y ha', 1) + '</tr></thead><tbody>' +
      fs.map(function (f) { var L = leerFactura(f), r = repartir(f); return '<tr>' + td(fmtF(f.desde) + ' al ' + fmtF(f.hasta)) + td(fmt(L.kwh), 1) + td('<b>' + M(f, num(f.total)) + '</b>', 1) + td(L.gsKwh != null ? M(f, L.gsKwh) : '—', 1) + td(num(f.importeExcesoPotencia) > 0 ? M(f, num(f.importeExcesoPotencia)) : '—', 1) + td(num(f.importeReactiva) > 0 ? M(f, num(f.importeReactiva)) : '—', 1) + td(L.fp != null ? fmt(L.fp, 2) : '—', 1) + td(r.gsPorMmHa != null ? M(f, r.gsPorMmHa) : 'sin riegos cargados', 1) + '</tr>'; }).join('') + '</tbody></table>';
    var L0 = leerFactura(fs[0]);
    if (L0.avisos.length) h += '<div class="note warn"><b>Lo que dice la última factura (' + fmtF(fs[0].desde) + ' al ' + fmtF(fs[0].hasta) + '):</b><ul>' + L0.avisos.map(function (a) { return '<li><b>' + a.titulo + '.</b> ' + a.texto + '</li>'; }).join('') + '</ul></div>';
    return h;
  }
  // Para el Asistente: facturas, reparto e informe de agua de la última campaña de cada pivot, en datos simples
  function paraAsistente(campo, nombreLote) {
    asegurarPuente();
    var fs = facturasDe(campo.id), r0 = function (v) { return v == null ? null : Math.round(v); }, txt = function (s) { return String(s).replace(/<[^>]+>/g, ''); };
    var out = { campo: campo.nombre, moneda_en_que_se_muestra: MON[vista()].n, facturas_cargadas: fs.length,
      facturas: fs.slice(0, 6).map(function (f) { var L = leerFactura(f), r = repartir(f);
        return { periodo: dia(f.desde) + ' a ' + dia(f.hasta), nis: f.nis || null, moneda_de_la_factura: MON[monedaDe(f)].n, total: M(f, num(f.total)), kwh: r0(L.kwh), costo_real_por_kwh: L.gsKwh != null ? M(f, L.gsKwh) : null,
          la_energia_es_pct_de_la_factura: L.pctEnergia != null ? r0(L.pctEnergia * 100) : null, potencia_contratada_kw: num(f.potenciaContratadaKw), potencia_registrada_kw: num(f.potenciaRegistradaKw),
          exceso_de_potencia: num(f.importeExcesoPotencia) > 0 ? M(f, num(f.importeExcesoPotencia)) : 'no', reactiva: num(f.importeReactiva) > 0 ? M(f, num(f.importeReactiva)) : 'no', factor_de_potencia: L.fp != null ? Math.round(L.fp * 100) / 100 : null,
          desglose_de_la_factura: (function () { var tot = num(f.total) || 0, pc = function (v) { return tot > 0 && v > 0 ? ' (' + r0(v / tot * 100) + ' %)' : ''; }, d = {}, ie = L.importeEnergia, suma = 0;
            var poner = function (k, v) { v = num(v); if (v > 0) { d[k] = M(f, v) + pc(v); suma += v; } };
            poner('energia_consumida', ie); poner('potencia_reservada', f.importePotencia); poner('exceso_de_potencia_reservada', f.importeExcesoPotencia); poner('energia_reactiva', f.importeReactiva); poner('alumbrado_publico', f.importeAlumbrado); poner('iva', f.iva);
            if (tot - suma > tot * 0.01) d.sin_detallar = M(f, tot - suma) + pc(tot - suma) + ' (conceptos que no se cargaron al guardar la factura)';
            return d; })(),
          avisos: L.avisos.map(function (a) { return txt(a.titulo + '. ' + a.texto); }),
          reparto_por_pivot: r.sinRiego ? 'sin riegos cargados en ese período: no se puede repartir' : r.filas.map(function (x) { return { pivot: x.equipo.nombre, rego_mm: r0(x.mm), hectareas: x.ha, parte_pct: x.pct != null ? r0(x.pct * 100) : null, gasto: M(f, x.gs), kwh: r0(x.kwh) }; }),
          costo_por_mm_y_hectarea: r.gsPorMmHa != null ? M(f, r.gsPorMmHa) : null }; }),
      informes_de_agua: [] };
    if (!fs.length) out.nota = 'Sin facturas de energía cargadas. Las sube el dueño o el gerente en Banco → Energía y agua (foto o PDF de la factura; SAFIA la lee).';
    if (!window.SafiaAgua) return Promise.resolve(out);
    var lotes = pivotsDe(campo.id).filter(function (e) { return !nombreLote || String(e.nombre).toLowerCase().indexOf(String(nombreLote).toLowerCase()) !== -1; }).slice(0, 4), p = Promise.resolve();
    lotes.forEach(function (l) {
      var camp = campanaParaInforme(l.id); if (!camp) return;
      p = p.then(function () { return informeCampana(campo, l, camp); }).then(function (I) {
        var en = I.energia, pl = function (v) { return v == null ? null : plata(v, en.moneda || vista()); };
        out.informes_de_agua.push({ lote: l.nombre, cultivo: camp.cultivo, campana: camp.nombre || null, desde: I.desde, hasta: I.hasta, cerrada: !!camp.cosecha,
          riego_aplicado_mm: I.aplicado, riego_necesario_mm: I.necesario, diferencia_mm: I.diferencia, aprovechamiento_pct: I.aprovechamiento != null ? r0(I.aprovechamiento * 100) : null,
          lluvia_mm: I.lluvia, consumo_del_cultivo_mm: I.eta, consumo_que_pedia_mm: I.etc, dias_con_estres: I.diasEstres, perdida_de_rinde_por_agua_pct: I.perdidaPct, rinde_kg_ha: I.rinde, kg_por_mm: I.kgPorMm != null ? Math.round(I.kgPorMm * 10) / 10 : null,
          energia: en.gs == null ? 'sin facturas que cubran los riegos de esta campaña' : { gasto: pl(en.gs), por_hectarea: pl(I.gsHa), por_mm_y_hectarea: pl(I.gsMm), por_tonelada: pl(I.gsTon), kwh: r0(en.kwh), facturas: en.facturas, las_facturas_cubren_pct_del_riego: en.cobertura != null ? r0(en.cobertura * 100) : null } });
      }).catch(function () {});
    });
    return p.then(function () { return out; });
  }
  function activar() { iniciado = true; pintar(); }
  function alCambiarCampo() { if (iniciado && $('panel-energia') && $('panel-energia').classList.contains('on')) pintar(); }

  window.SafiaEnergia = { mostrarAlCierre: mostrarAlCierre, htmlPdf: htmlPdf, paraAsistente: paraAsistente, campanaParaInforme: campanaParaInforme, conv: conv, vista: vista, plata: plata, activar: activar, alCambiarCampo: alCambiarCampo, facturasDe: facturasDe, repartir: repartir, leerFactura: leerFactura, informeCampana: informeCampana, htmlInforme: htmlInforme, energiaDeCampana: energiaDeCampana, kwhDe: kwhDe };
})();
