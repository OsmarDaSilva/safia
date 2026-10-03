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
  function gs(n) { return n == null ? '—' : 'Gs. ' + fmt(n); }
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
  function repartir(f) {
    var eqs = equiposDeFactura(f), kwh = kwhDe(f), total = num(f.total) || 0, vol = 0;
    var filas = eqs.map(function (e) { var mm = riegoMM(e.id, dia(f.desde), dia(f.hasta)), ha = haDe(e); vol += mm * ha; return { equipo: e, mm: mm, ha: ha, vol: mm * ha }; });
    filas.forEach(function (x) { x.pct = vol > 0 ? x.vol / vol : null; x.gs = x.pct != null ? total * x.pct : null; x.kwh = x.pct != null ? kwh * x.pct : null; x.gsHa = x.gs != null && x.ha ? x.gs / x.ha : null; });
    return { filas: filas, volumen: vol, total: total, kwh: kwh, gsPorMmHa: vol > 0 ? total / vol : null, kwhPorMmHa: vol > 0 ? kwh / vol : null, sinRiego: !(vol > 0), sinHa: filas.some(function (x) { return !x.ha; }) };
  }

  /* ---------- 3. qué dice la factura ---------- */
  function leerFactura(f) {
    var kwh = kwhDe(f), total = num(f.total) || 0, kvar = num(f.kvarh), o = { kwh: kwh, gsKwh: kwh > 0 ? total / kwh : null, avisos: [] };
    var iE = (num(f.importeEnergiaPunta) || 0) + (num(f.importeEnergiaFueraPunta) || 0) || num(f.importeEnergia) || 0;
    o.importeEnergia = iE; o.pctEnergia = total > 0 && iE ? iE / total : null;
    o.fp = kwh > 0 && kvar != null ? kwh / Math.sqrt(kwh * kwh + kvar * kvar) : null;
    var exc = num(f.importeExcesoPotencia), pc = num(f.potenciaContratadaKw), pr = Math.max(num(f.potenciaRegistradaKw) || 0, num(f.potenciaRegistradaPuntaKw) || 0) || null;
    if (exc > 0) o.avisos.push({ nivel: 'rojo', titulo: 'Exceso de potencia reservada: ' + gs(exc) + ' (' + fmt(exc / total * 100) + ' % de la factura)',
      texto: (pc && pr ? 'La factura dice ' + fmt(pc) + ' kW contratados y el medidor registró ' + fmt(pr) + ' kW. ' : '') + 'Es un recargo por pasarse de la potencia contratada, no es energía consumida. Llevar esta factura a la ANDE y revisar con el electricista qué potencia conviene reservar: mientras no se corrija, se paga todos los meses.' });
    else if (pc && pr && pr > pc * 1.1) o.avisos.push({ nivel: 'ambar', titulo: 'La potencia registrada (' + fmt(pr) + ' kW) pasó la contratada (' + fmt(pc) + ' kW)', texto: 'Revisar con la ANDE si corresponde ajustar la potencia reservada.' });
    var rea = num(f.importeReactiva);
    if (rea > 0) o.avisos.push({ nivel: 'ambar', titulo: 'Energía reactiva: ' + gs(rea) + (o.fp != null ? ' · factor de potencia ' + fmt(o.fp, 2) : ''),
      texto: (kvar != null ? 'El medidor registró ' + fmt(kvar) + ' kVArh de reactiva contra ' + fmt(kwh) + ' kWh de activa. ' : '') + 'La reactiva no riega: la generan los motores. Un banco de capacitores bien calculado la baja; consultarlo con el electricista.' });
    var kp = num(f.kwhPunta), kf = num(f.kwhFueraPunta), ip = num(f.importeEnergiaPunta), ifp = num(f.importeEnergiaFueraPunta);
    if (kp > 0 && kf > 0 && ip > 0 && ifp > 0) {
      var pp = ip / kp, pf = ifp / kf; o.precioPunta = pp; o.precioFuera = pf;
      if (pp > pf * 1.3) o.avisos.push({ nivel: 'info', titulo: 'En horario de punta el kWh costó ' + fmt(pp) + ' contra ' + fmt(pf) + ' fuera de punta', texto: fmt(kp / (kp + kf) * 100) + ' % de la energía se consumió en punta. Regar fuera del horario de punta baja ese renglón de ' + gs(ip) + ' a unos ' + gs(kp * pf) + '.' });
    }
    return o;
  }

  /* ---------- 4. informe de agua de la campaña ---------- */
  function energiaDeCampana(campo, lote, desde, hasta) {
    var gsT = 0, kwhT = 0, mmCub = 0, usadas = 0, ha = haDe(lote);
    facturasDe(campo.id).forEach(function (f) {
      if (equiposDeFactura(f).every(function (e) { return String(e.id) !== String(lote.id); })) return;
      var d0 = dia(f.desde) > desde ? dia(f.desde) : desde, d1 = dia(f.hasta) < hasta ? dia(f.hasta) : hasta; if (d0 > d1) return;
      var r = repartir(f); if (r.gsPorMmHa == null) return;
      var mm = riegoMM(lote.id, d0, d1); if (!(mm > 0)) return;
      gsT += mm * ha * r.gsPorMmHa; kwhT += mm * ha * r.kwhPorMmHa; mmCub += mm; usadas++;
    });
    var mmTot = riegoMM(lote.id, desde, hasta);
    return { gs: usadas ? gsT : null, kwh: usadas ? kwhT : null, facturas: usadas, mmCubiertos: mmCub, mmRiego: mmTot, cobertura: mmTot > 0 ? mmCub / mmTot : null };
  }
  function informeCampana(campo, lote, camp) {
    return SafiaAgua.calcular(campo, lote, camp).then(function (res) {
      var reales = res.dias.filter(function (x) { return !x.pronostico; });
      var filas0 = reales.map(function (x) { return { fecha: x.fecha, et0: x.et0, lluvia: x.lluvia || 0, riego: 0 }; });
      var nec = SafiaAgua.balance(filas0, camp.cultivo, res.suelo, { riegoDeclarado: 99999, eficiencia: res.eficiencia, lamina: 10 });
      var sum = function (k) { return reales.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
      var aplicado = Math.round(sum('riego')), necesario = nec.riegoRepartido, lluvia = Math.round(sum('lluvia')), etc = Math.round(sum('etc')), eta = Math.round(sum('eta'));
      var estres = reales.filter(function (x) { return x.ks < 1; }).length, ha = haDe(lote), desde = reales.length ? reales[0].fecha : camp.siembra, hasta = reales.length ? reales[reales.length - 1].fecha : camp.siembra;
      var en = energiaDeCampana(campo, lote, desde, hasta), rinde = num(camp.rinde);
      return { campo: campo, lote: lote, camp: camp, res: res, desde: desde, hasta: hasta, dias: reales.length, ha: ha, aplicado: aplicado, necesario: necesario, diferencia: aplicado - necesario,
        aprovechamiento: aplicado > 0 ? Math.min(1, necesario / aplicado) : null, lluvia: lluvia, etc: etc, eta: eta, diasEstres: estres, perdidaPct: res.perdidaPct, drenaje: res.totales ? res.totales.percolado : null,
        eficienciaEquipo: res.eficiencia, riegoDeEventos: reales.some(function (x) { return x.riego > 0 && !x.riegoRepartido; }), rinde: rinde,
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
    var en = I.energia, h = '<div class="card" style="margin-top:12px;"><div class="card-h"><h3>Informe de agua · ' + esc(I.lote.nombre) + ' · ' + esc(I.camp.cultivo) + '</h3><span class="muted">' + esc(I.camp.nombre || '') + ' · ' + fmtF(I.desde) + ' al ' + fmtF(I.hasta) + ' (' + I.dias + ' días)' + (I.camp.cosecha ? '' : ' · campaña sin cerrar') + '</span></div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      dato('Riego aplicado', fmt(I.aplicado) + ' mm', I.ha ? fmt(I.aplicado * I.ha * 10) + ' m³ en ' + fmt(I.ha, 1) + ' ha' + (I.riegoDeEventos ? '' : ' · declarado en la cosecha, no cargado día por día') : 'falta la superficie del lote') +
      dato('Riego necesario', fmt(I.necesario) + ' mm', 'para que el cultivo no pasara sed con la lluvia que hubo (balance FAO-56)') +
      dato('Diferencia', (dif > 0 ? '+' : '') + fmt(dif) + ' mm', juicio, colD) +
      dato('Aprovechamiento', I.aprovechamiento != null ? fmt(I.aprovechamiento * 100) + ' %' : '—', 'del riego aplicado que hacía falta · eficiencia del equipo ' + fmt((I.eficienciaEquipo || 0) * 100) + ' %', I.aprovechamiento != null && I.aprovechamiento < 0.8 ? '#B8731A' : '#178029') + '</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">' +
      dato('Lluvia', fmt(I.lluvia) + ' mm', 'del ciclo', '#8C9196') +
      dato('Consumo del cultivo', fmt(I.eta) + ' mm', 'de ' + fmt(I.etc) + ' mm que pedía (ETc)', '#8C9196') +
      dato('Días con estrés', String(I.diasEstres), I.perdidaPct > 0 ? 'pérdida de rinde estimada por agua: ' + fmt(I.perdidaPct, 1) + ' %' : 'sin pérdida de rinde por agua', I.diasEstres > 5 ? '#B5371C' : '#178029') +
      dato('Kilos por mm', I.kgPorMm != null ? fmt(I.kgPorMm, 1) + ' kg/ha' : '—', I.rinde ? 'rinde ' + fmt(I.rinde) + ' kg/ha ÷ (lluvia + riego)' : 'falta el rinde de la cosecha', '#8C9196') + '</div>';
    h += '<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#178029;margin:12px 0 6px;">Energía de la campaña</div>';
    if (en.gs == null) h += '<div class="muted" style="font-size:13px;">' + (I.aplicado > 0 ? 'Todavía no hay facturas cargadas que cubran los riegos de esta campaña. Subí las facturas de la ANDE de ' + fmtF(I.desde) + ' a ' + fmtF(I.hasta) + '.' : 'Sin riegos cargados en la campaña: no hay energía de riego para repartir.') + '</div>';
    else h += '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      dato('Gasto de energía', gs(en.gs), en.facturas + ' factura' + (en.facturas > 1 ? 's' : '') + (en.cobertura != null && en.cobertura < 0.98 ? ' · <b style="color:#8a5713;">cubren ' + fmt(en.cobertura * 100) + ' % del riego: faltan facturas</b>' : ' · cubren todo el riego'), '#178029') +
      dato('Por hectárea', gs(I.gsHa), fmt(en.kwh / (I.ha || 1)) + ' kWh/ha', '#178029') +
      dato('Por mm regado', gs(I.gsMm) + '/ha', fmt(I.kwhMmHa, 1) + ' kWh por mm y por ha', '#178029') +
      dato('Por tonelada', I.gsTon != null ? gs(I.gsTon) : '—', I.rinde ? 'de ' + esc(I.camp.cultivo) + ' cosechada' : 'falta el rinde de la cosecha', '#178029') + '</div>';
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
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' + campoF('enDesde', 'Consumo desde', 'date') + campoF('enHasta', 'Consumo hasta', 'date') + campoF('enTotal', 'Total a pagar (Gs.)', null, 'sin la comisión de la boca de cobranza') + campoF('enNis', 'NIS (suministro)', 'text') + '</div>' +
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
    var h = '<div class="card" style="margin-bottom:12px;"><div class="card-h"><h3>' + fmtF(f.desde) + ' al ' + fmtF(f.hasta) + ' · ' + gs(f.total) + '</h3><span class="muted">' + (f.nis ? 'NIS ' + esc(f.nis) + ' · ' : '') + fmt(L.kwh) + ' kWh · <b>' + (L.gsKwh != null ? fmt(L.gsKwh) + ' Gs/kWh real' : '') + '</b>' + (L.pctEnergia != null ? ' · la energía es el ' + fmt(L.pctEnergia * 100) + ' % de la factura' : '') + '</span></div>';
    L.avisos.forEach(function (a) { h += '<div style="border-left:4px solid ' + col[a.nivel] + ';background:#FAFBFC;border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:13px;"><b style="color:' + col[a.nivel] + ';">' + a.titulo + '</b><div style="color:#3A3E41;line-height:1.4;margin-top:2px;">' + a.texto + '</div></div>'; });
    if (r.sinRiego) h += '<div class="muted" style="font-size:13px;margin:6px 0;">No hay riegos cargados entre el ' + fmtF(f.desde) + ' y el ' + fmtF(f.hasta) + ' en los pivots de este medidor: no hay con qué repartir. Si se regó, cargá los riegos (Operador) y el reparto aparece solo.</div>';
    else h += '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Pivot</th><th class="r">Regó (mm)</th><th class="r">Hectáreas</th><th class="r">Parte</th><th class="r">Gasto</th><th class="r">kWh</th><th class="r">Gs/ha</th></tr></thead><tbody>' +
      r.filas.map(function (x) { return '<tr><td>' + esc(x.equipo.nombre) + '</td><td class="r">' + fmt(x.mm) + '</td><td class="r">' + (x.ha ? fmt(x.ha, 1) : '<span style="color:#B5371C;">falta</span>') + '</td><td class="r">' + (x.pct != null ? fmt(x.pct * 100) + ' %' : '—') + '</td><td class="r"><b>' + gs(x.gs) + '</b></td><td class="r">' + fmt(x.kwh) + '</td><td class="r">' + (x.gsHa != null ? fmt(x.gsHa) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div><div class="muted" style="font-size:12px;margin-top:6px;">Cada mm regado en una hectárea costó <b>' + gs(r.gsPorMmHa) + '</b> y ' + fmt(r.kwhPorMmHa, 1) + ' kWh en este período.' + (r.sinHa ? ' Falta la superficie de algún pivot (Equipos y lotes): sin hectáreas no entra en el reparto.' : '') + '</div>';
    h += '<div style="display:flex;gap:8px;margin-top:8px;">' + (f.archivoRuta ? '<button class="btn mini" data-ver="' + esc(f.id) + '">Ver la factura</button>' : '') + '<button class="btn mini" data-editar="' + esc(f.id) + '">Editar</button><button class="btn mini" data-borrar="' + esc(f.id) + '">Borrar</button></div></div>';
    return h;
  }
  function resumenAnual(campo) {
    var fs = facturasDe(campo.id); if (fs.length < 2) return '';
    var tot = 0, kwh = 0, exc = 0, rea = 0; fs.forEach(function (f) { tot += num(f.total) || 0; kwh += kwhDe(f); exc += num(f.importeExcesoPotencia) || 0; rea += num(f.importeReactiva) || 0; });
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' + dato('Facturas cargadas', String(fs.length), fmtF(fs[fs.length - 1].desde) + ' al ' + fmtF(fs[0].hasta), '#8C9196') + dato('Total pagado', gs(tot), fmt(kwh) + ' kWh · ' + (kwh ? fmt(tot / kwh) + ' Gs/kWh real' : ''), '#178029') +
      dato('Exceso de potencia', gs(exc), tot ? fmt(exc / tot * 100) + ' % de lo pagado' : '', exc > 0 ? '#B5371C' : '#178029') + dato('Reactiva', gs(rea), tot ? fmt(rea / tot * 100) + ' % de lo pagado' : '', rea > 0 ? '#B8731A' : '#178029') + '</div>';
  }
  function pintar() {
    var cont = $('energiaCont'), campo = B().campoActual(); if (!cont) return;
    if (!campo) { cont.innerHTML = '<div class="muted">Elegí un campo.</div>'; return; }
    var fs = facturasDe(campo.id), piv = pivotsDe(campo.id);
    cont.innerHTML = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn green" id="enNueva">+ Subir factura de energía</button><span class="muted" style="font-size:12px;">Subí la factura de la ANDE de cada mes: SAFIA la lee, reparte el gasto entre los pivots según lo que regó cada uno y arma el costo real de energía de cada campaña.</span></div>' +
      htmlForm(campo) + resumenAnual(campo) +
      (fs.length ? fs.map(htmlFactura).join('') : '<div class="card"><div class="muted">Todavía no hay facturas cargadas en este campo.</div></div>') +
      '<div class="card" style="margin-top:16px;"><div class="card-h"><h3>Informe de agua de la campaña</h3><span class="muted">mm aplicados contra los necesarios, aprovechamiento, kWh y gasto de energía</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><select id="enLote" style="padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;">' + piv.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join('') + '</select><select id="enCamp" style="padding:8px 10px;border:1px solid #D5D9DD;border-radius:8px;font:inherit;max-width:100%;"></select><button class="btn green" id="enVerInforme">Ver informe</button><button class="btn" id="enImprimir" style="display:none;">Imprimir</button></div><div id="enInforme"></div></div>';
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
  function abrirForm(id) {
    var f = id ? leer('facturas_energia').find(function (x) { return String(x.id) === String(id); }) : null;
    editandoId = f ? f.id : null; leida = null;
    $('enForm').style.display = ''; $('enTitulo').textContent = f ? 'Editar factura del ' + fmtF(f.desde) + ' al ' + fmtF(f.hasta) : 'Nueva factura de energía';
    CAMPOS.forEach(function (c) { $(c[0]).value = f && f[c[1]] != null ? f[c[1]] : ''; });
    $('enArchivo').value = '';
    if (f && f.equipos && f.equipos.length) $('enEquipos').querySelectorAll('input').forEach(function (i) { i.checked = f.equipos.map(String).indexOf(String(i.value)) !== -1; });
    $('enForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cerrarForm() { if ($('enForm')) $('enForm').style.display = 'none'; editandoId = null; leida = null; }
  function volcar(d) { CAMPOS.forEach(function (c) { var v = d[c[1]]; if (c[1] === 'kwhFueraPunta' && v == null && d.kwhTotal != null) v = d.kwhTotal; if (c[1] === 'importeEnergiaFueraPunta' && v == null && d.importeEnergia != null) v = d.importeEnergia; if (v != null && v !== '') $(c[0]).value = v; }); }
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
    item.equipos = Array.prototype.slice.call($('enEquipos').querySelectorAll('input:checked')).map(function (i) { return i.value; });
    if (leida) ['distribuidora', 'medidor', 'titular', 'categoria', 'tension', 'ciclo', 'emision', 'moneda', 'potenciaRegistradaPuntaKw', 'importeAlumbrado', 'iva', 'conceptos'].forEach(function (k) { if (leida[k] != null) item[k] = leida[k]; });
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
  function activar() { iniciado = true; pintar(); }
  function alCambiarCampo() { if (iniciado && $('panel-energia') && $('panel-energia').classList.contains('on')) pintar(); }

  window.SafiaEnergia = { activar: activar, alCambiarCampo: alCambiarCampo, facturasDe: facturasDe, repartir: repartir, leerFactura: leerFactura, informeCampana: informeCampana, htmlInforme: htmlInforme, energiaDeCampana: energiaDeCampana, kwhDe: kwhDe };
})();
