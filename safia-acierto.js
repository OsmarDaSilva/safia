/* SAFIA · Acierto: SAFIA anota lo que dice y después se compara con lo que pasó (window.SafiaAcierto)
   -------------------------------------------------------------------------------------------------
   1) BITÁCORA. Mientras la campaña está en curso, cada vez que se arma el parte de seguimiento SAFIA guarda, como mucho
      una vez por semana, lo que está diciendo ese día: cuánto de la meta sigue alcanzable (mínimo y máximo), cuánto rinde
      da por perdido por falta de agua y qué fecha de fin de ciclo estima. Queda en la campaña
      (cultivos[i].bitacora) y sube a la nube con ella. Nadie tiene que cargar nada.
   2) COMPARACIÓN. Al cerrar la cosecha, cada anotación se compara con el rinde real y la fecha real: ¿el rinde cayó
      dentro del rango que SAFIA decía?, ¿cuántos días erró el fin de ciclo? Las campañas cerradas antes de que existiera
      la bitácora (4-oct-2026) solo se pueden comparar contra la meta.
   No calcula nada agronómico: solo compara lo dicho con lo ocurrido. No hay números de afuera. */
(function () {
  'use strict';
  var CADA_DIAS = 7, MAX = 40, MARGEN = 0.05;   // una anotación por semana; "acertó" = el rinde real cae en el rango, con 5 % de margen
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lista(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function fmt(n, d) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function dia(f) { return String(f || '').slice(0, 10); }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dias(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }
  function fd(f) { return f ? dia(f).slice(8, 10) + '/' + dia(f).slice(5, 7) + '/' + dia(f).slice(2, 4) : ''; }

  /* ---------- 1. bitácora ---------- */
  // D = lo que arma el parte de seguimiento para un pivot (SafiaParte.armar)
  function anotar(D) {
    try {
      var x = D && D.x; if (!x || !x.cam || !x.cu || D.sinCampana || D.pastura || !x.cu.fechaSiembra) return false;
      if (x.cu.rendimientoReal) return false;                                  // ya cosechado
      var mv = D.mv, a = D.agua, h = hoy();
      if (!mv && !a) return false;                                             // sin meta y sin balance no hay nada que anotar
      var l = lista('campanas'), i = -1; l.forEach(function (c, k) { if (String(c.id) === String(x.cam.id)) i = k; });
      if (i < 0 || !l[i].cultivos || !l[i].cultivos[0]) return false;
      var cu = l[i].cultivos[0], b = cu.bitacora || [], ult = b[b.length - 1];
      if (ult && dias(ult.f, h) < CADA_DIAS) return false;
      var reg = { f: h, dds: D.dds };
      if (mv) { reg.meta = mv.meta; reg.min = Math.round(mv.min); reg.max = Math.round(mv.max); reg.k = mv.k; reg.sabe = !!mv.sabemos; }
      else if (num(x.cu.rendimientoObj)) reg.meta = num(x.cu.rendimientoObj);
      if (a) { reg.agua = Math.round((a.perdidaPct || 0) * 10) / 10; reg.estres = a.diasEstres; }
      if (cu.fechaCosecha && !cu.rendimientoReal) reg.fin = dia(cu.fechaCosecha);   // fin de ciclo que SAFIA estima hoy
      b.push(reg); if (b.length > MAX) b = b.slice(b.length - MAX);
      cu.bitacora = b; localStorage.setItem('campanas', JSON.stringify(l));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 2. comparación ---------- */
  function evaluar(camp, idx) {
    var cu = camp && camp.cultivos && camp.cultivos[idx || 0]; if (!cu) return null;
    var real = num(cu.rendimientoReal), cos = (camp.cosechas && camp.cosechas[idx || 0]) || (!idx && camp.cosecha) || null, b = cu.bitacora || [];
    var meta = num(cu.planMeta && cu.planMeta.kgHa) || num(cu.rendimientoObj);
    var E = { cultivo: cu.cultivo, variedad: cu.variedad || '', siembra: dia(cu.fechaSiembra), cerrada: !!real, real: real, meta: meta, cumplido: real && meta ? real / meta : null, anotaciones: b.length };
    if (!real) return E;
    E.cosecha = cos && cos.fecha ? dia(cos.fecha) : dia(cu.fechaCosecha);
    // rango alcanzable que decía SAFIA en cada anotación, contra el rinde real
    var conRango = b.filter(function (r) { return r.min != null && r.max != null; });
    E.rangos = conRango.map(function (r) {
      var dentro = real >= r.min * (1 - MARGEN) && real <= r.max * (1 + MARGEN);
      return { fecha: r.f, dds: r.dds, min: r.min, max: r.max, dentro: dentro, error: dentro ? 0 : (real < r.min ? (real - r.min) / r.min : (real - r.max) / r.max), sabe: r.sabe !== false };
    });
    E.aciertos = E.rangos.filter(function (r) { return r.dentro; }).length;
    // fin de ciclo: la primera fecha que SAFIA estimó, contra la cosecha real
    var conFin = b.filter(function (r) { return r.fin; });
    if (conFin.length && E.cosecha) { E.finEstimado = conFin[0].fin; E.finError = dias(conFin[0].fin, E.cosecha); E.finUltimoError = dias(conFin[conFin.length - 1].fin, E.cosecha); }
    // agua: la última pérdida que SAFIA estimó, contra lo que faltó para la meta
    var conAgua = b.filter(function (r) { return r.agua != null; });
    if (conAgua.length) E.aguaEstimada = conAgua[conAgua.length - 1].agua;
    if (meta && real) E.brechaPct = Math.max(0, (meta - real) / meta * 100);
    return E;
  }
  // Todas las campañas del cliente (o de un pivot), con su comparación
  function campanasDe(clienteId, equipoId) {
    var campos = lista('campos').filter(function (c) { return clienteId == null || String(c.clienteId) === String(clienteId); });
    var eqs = lista('equipos').filter(function (e) { return (equipoId == null || String(e.id) === String(equipoId)) && campos.some(function (c) { return String(c.id) === String(e.campoId); }); });
    var out = [];
    lista('campanas').forEach(function (camp) {
      var eq = eqs.filter(function (e) { return String(e.id) === String(camp.equipoId); })[0]; if (!eq) return;
      (camp.cultivos || []).forEach(function (cu, i) { var E = evaluar(camp, i); if (!E || !E.siembra) return; E.lote = eq.nombre; E.campo = (campos.filter(function (c) { return String(c.id) === String(eq.campoId); })[0] || {}).nombre || ''; out.push(E); });
    });
    return out.sort(function (a, b) { return String(b.siembra).localeCompare(String(a.siembra)); });
  }
  function resumenDe(l) {
    var cer = l.filter(function (e) { return e.cerrada; }), conMeta = cer.filter(function (e) { return e.cumplido != null; }), conRangos = cer.filter(function (e) { return e.rangos && e.rangos.length; });
    var totR = 0, okR = 0; conRangos.forEach(function (e) { totR += e.rangos.length; okR += e.aciertos; });
    var conFin = cer.filter(function (e) { return e.finError != null; });
    return { cerradas: cer.length, conMeta: conMeta.length, cumplidoMedio: conMeta.length ? conMeta.reduce(function (s, e) { return s + e.cumplido; }, 0) / conMeta.length : null,
      alcanzaron: conMeta.filter(function (e) { return e.cumplido >= 0.95; }).length, conBitacora: conRangos.length, anotaciones: totR, aciertos: okR,
      finCampanas: conFin.length, finErrorMedio: conFin.length ? conFin.reduce(function (s, e) { return s + Math.abs(e.finError); }, 0) / conFin.length : null,
      enCurso: l.filter(function (e) { return !e.cerrada; }).length, anotacionesEnCurso: l.filter(function (e) { return !e.cerrada; }).reduce(function (s, e) { return s + e.anotaciones; }, 0) };
  }

  /* ---------- pantalla (debajo del parte de seguimiento) ---------- */
  function html(clienteId) {
    var l = campanasDe(clienteId), R = resumenDe(l), cer = l.filter(function (e) { return e.cerrada; });
    if (!l.length) return '';
    var kpi = function (v, t) { return '<div style="flex:1;min-width:150px;background:#F7F8F9;border-radius:10px;padding:10px 12px;"><div style="font-size:20px;font-weight:800;color:#2E3236;">' + v + '</div><div style="font-size:12px;color:#6B7075;line-height:1.35;">' + t + '</div></div>'; };
    var h = '<div class="card" style="margin-top:14px;"><div style="font-size:17px;font-weight:800;color:#2E3236;">Acierto de SAFIA</div>' +
      '<div style="font-size:13px;color:#6B7075;line-height:1.45;margin:2px 0 10px;">Lo que SAFIA dijo durante cada campaña, comparado con lo que se cosechó. Sirve para saber cuánto confiar en sus números.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
        kpi(R.conMeta ? fmt(R.cumplidoMedio * 100, 0) + ' %' : '—', R.conMeta ? 'de la meta se cosechó en promedio (' + R.conMeta + (R.conMeta === 1 ? ' campaña' : ' campañas') + '; ' + R.alcanzaron + ' la alcanzaron)' : 'sin campañas cerradas con meta') +
        kpi(R.anotaciones ? R.aciertos + ' de ' + R.anotaciones : '—', R.anotaciones ? 'veces el rinde real cayó dentro del rango que SAFIA decía' : 'todavía no hay campañas cerradas con pronósticos guardados') +
        kpi(R.finCampanas ? fmt(R.finErrorMedio, 0) + ' días' : '—', R.finCampanas ? 'de error medio en la fecha de fin de ciclo' : 'sin fin de ciclo estimado para comparar') + '</div>';
    if (R.enCurso) h += '<div style="font-size:13px;color:#178029;font-weight:600;margin-bottom:10px;">Campañas en curso: ' + R.enCurso + '. SAFIA lleva ' + R.anotacionesEnCurso + (R.anotacionesEnCurso === 1 ? ' anotación' : ' anotaciones') + ' de lo que va diciendo (una por semana); al cosechar se comparan.</div>';
    if (cer.length) {
      h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#6B7075;font-size:11px;text-transform:uppercase;letter-spacing:.04em;"><th style="padding:6px 8px 6px 0;">Lote y campaña</th><th style="padding:6px 8px;text-align:right;">Meta</th><th style="padding:6px 8px;text-align:right;">Cosechado</th><th style="padding:6px 8px;text-align:right;">% de la meta</th><th style="padding:6px 0 6px 8px;">Lo que SAFIA decía</th></tr></thead><tbody>' +
        cer.slice(0, 30).map(function (e) {
          var dijo = e.rangos && e.rangos.length ? e.aciertos + ' de ' + e.rangos.length + ' anotaciones dentro del rango' + '<div style="font-size:12px;color:#8C9196;">' + e.rangos.slice(0, 4).map(function (r) { return 'día ' + r.dds + ': ' + fmt(r.min) + '–' + fmt(r.max) + (r.dentro ? ' (dentro)' : ' (' + (r.error > 0 ? '+' : '') + fmt(r.error * 100, 0) + ' %)') + (r.sabe ? '' : ' sin insumos cargados'); }).join(' · ') + '</div>'
            : '<span style="color:#8C9196;">sin pronósticos guardados (campaña anterior a la bitácora)</span>';
          if (e.finError != null) dijo += '<div style="font-size:12px;color:#8C9196;">Fin de ciclo: estimó el ' + fd(e.finEstimado) + ', se cosechó el ' + fd(e.cosecha) + ' (' + (e.finError === 0 ? 'el mismo día' : Math.abs(e.finError) + ' días ' + (e.finError > 0 ? 'después' : 'antes')) + ')</div>';
          if (e.aguaEstimada != null && e.brechaPct != null) dijo += '<div style="font-size:12px;color:#8C9196;">Agua: SAFIA daba ' + fmt(e.aguaEstimada, 0) + ' % de rinde perdido; faltó ' + fmt(e.brechaPct, 0) + ' % para la meta</div>';
          var col = e.cumplido == null ? '#6B7075' : e.cumplido >= 0.95 ? '#178029' : e.cumplido >= 0.8 ? '#8A5A00' : '#B5371C';
          return '<tr><td style="padding:7px 8px 7px 0;border-top:1px solid #F0F2F4;"><b>' + esc(e.lote) + '</b><div style="font-size:12px;color:#8C9196;">' + esc(e.cultivo) + (e.variedad ? ' ' + esc(e.variedad) : '') + ' · siembra ' + fd(e.siembra) + '</div></td>' +
            '<td style="padding:7px 8px;border-top:1px solid #F0F2F4;text-align:right;">' + (e.meta ? fmt(e.meta) : '—') + '</td><td style="padding:7px 8px;border-top:1px solid #F0F2F4;text-align:right;"><b>' + fmt(e.real) + '</b></td>' +
            '<td style="padding:7px 8px;border-top:1px solid #F0F2F4;text-align:right;font-weight:700;color:' + col + ';">' + (e.cumplido != null ? fmt(e.cumplido * 100, 0) + ' %' : '—') + '</td><td style="padding:7px 0 7px 8px;border-top:1px solid #F0F2F4;">' + dijo + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return h + '<div style="font-size:11.5px;color:#8C9196;margin-top:10px;line-height:1.45;">Rindes en kg/ha. SAFIA guarda sus pronósticos una vez por semana desde el 4 de octubre de 2026: las campañas anteriores solo se pueden comparar contra la meta. "Dentro del rango" admite un 5 % de margen. Cumplir la meta no depende solo de SAFIA: también del clima y de lo que se hizo en el lote.</div></div>';
  }
  function montar(caja, clienteDe) {
    if (!caja) return;
    var pintar = function () { try { caja.innerHTML = html(clienteDe ? clienteDe() : null); } catch (e) { caja.innerHTML = ''; } };
    pintar(); return pintar;
  }
  // para el Asistente: las últimas campañas cerradas de un pivot
  function resumenLote(equipoId) {
    var l = campanasDe(null, equipoId), R = resumenDe(l); if (!l.length) return null;
    return { campanas_cerradas: R.cerradas, de_la_meta_se_cosecho_en_promedio_pct: R.cumplidoMedio != null ? Math.round(R.cumplidoMedio * 100) : 'sin campañas con meta', pronosticos_guardados: R.anotaciones ? R.aciertos + ' de ' + R.anotaciones + ' cayeron dentro del rango' : 'ninguno todavía (se guardan desde el 4-oct-2026)',
      error_medio_fin_de_ciclo_dias: R.finErrorMedio != null ? Math.round(R.finErrorMedio) : undefined, en_curso: R.enCurso ? R.anotacionesEnCurso + ' anotaciones guardadas de la campaña actual' : undefined,
      detalle: l.filter(function (e) { return e.cerrada; }).slice(0, 5).map(function (e) { return e.cultivo + ' siembra ' + e.siembra + ': meta ' + (e.meta || 'sin meta') + ', cosechado ' + Math.round(e.real) + ' kg/ha' + (e.cumplido != null ? ' (' + Math.round(e.cumplido * 100) + ' % de la meta)' : '') + (e.rangos && e.rangos.length ? '; ' + e.aciertos + ' de ' + e.rangos.length + ' pronósticos dentro del rango' : ''); }) };
  }
  window.SafiaAcierto = { anotar: anotar, evaluar: evaluar, campanasDe: campanasDe, resumenDe: resumenDe, html: html, montar: montar, resumenLote: resumenLote };
})();
