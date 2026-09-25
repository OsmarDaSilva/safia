/* ============================================================
   SAFIA · safia-ficha-agua.js
   Ficha de agua de un lote: cómo se mueve el agua en el suelo.
   Todo sale del motor único FAO-56 (safia-balance.js → simular()):
   acá no se calcula nada nuevo, solo se muestra.
     - Medidor: barra de colores (estrés / regar / atención / óptimo /
       lleno) con la aguja en el % de agua útil de HOY.
     - Titular: "Regar hoy: X mm" / "Próximo riego: X mm el <día>" /
       "No regar: viene lluvia" / "Sin riego previsto", y cuántas
       vueltas del pivot son (si el lote tiene lámina por vuelta cargada).
     - Gráfico: % de agua útil día por día (últimos 30 días + los que
       vienen, punteados), con las líneas de regar y de estrés, y las
       barras de lluvia y riego.
     - Resumen del período mostrado: lluvia, riego, ETc, días con estrés.
   Diseño de las líneas: el que Osmar ya tenía en AquaBalance y en su
   Excel (CC, umbral, urgente), sobre el motor de SAFIA.
   Uso: SafiaFichaAgua.html(r, { equipo, compacta })   r = SafiaBalance.simular(...)
   ============================================================ */
(function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 }); }
  function fmtF(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function diaTexto(f, hoyK) {
    if (f === hoyK) return 'hoy';
    var d = new Date(String(f).slice(0, 10) + 'T12:00:00'), h = new Date(hoyK + 'T12:00:00');
    var n = Math.round((d - h) / 86400000);
    if (n === 1) return 'mañana';
    return DIAS[d.getDay()] + ' ' + fmtF(f);
  }
  var COL = { estres: '#C0392B', regar: '#E67E22', atencion: '#D4A24C', optimo: '#178029', lleno: '#2E72C8', gris: '#8C9196' };

  // Umbrales del cultivo (el motor los trae; si falta alguno, los generales)
  function umbrales(r) {
    var U = r.umbrales || (window.SafiaBalance && SafiaBalance.UMBRALES) || {};
    var critico = num(U.CRITICO) != null ? U.CRITICO : 50, urgente = num(U.URGENTE) != null ? U.URGENTE : Math.max(0, critico - 15), atencion = num(U.ATENCION) != null ? U.ATENCION : Math.min(100, critico + 20);
    return { URGENTE: urgente, CRITICO: critico, ATENCION: atencion };
  }
  function bandaDe(pct, U) { return pct < U.URGENTE ? 'estres' : pct < U.CRITICO ? 'regar' : pct < U.ATENCION ? 'atencion' : pct < 95 ? 'optimo' : 'lleno'; }
  var NOMBRE_BANDA = { estres: 'estrés', regar: 'hay que regar', atencion: 'atención', optimo: 'óptimo', lleno: 'lleno' };

  /* ---------- 1. medidor con aguja ---------- */
  function medidor(r) {
    var U = umbrales(r), pct = Math.max(0, Math.min(100, num(r.porcentajeHoy) || 0));
    var bandas = [['estres', 0, U.URGENTE], ['regar', U.URGENTE, U.CRITICO], ['atencion', U.CRITICO, U.ATENCION], ['optimo', U.ATENCION, 95], ['lleno', 95, 100]];
    var h = '<div class="fa-medidor">' +
      '<div class="fa-aguja" style="left:' + pct.toFixed(1) + '%;"><div class="fa-aguja-valor">' + fmt(pct, 0) + ' %</div><div class="fa-aguja-punta"></div></div>' +
      '<div class="fa-bandas">' + bandas.map(function (b) { var w = Math.max(0, b[2] - b[1]); return '<div class="fa-banda" style="width:' + w + '%;background:' + COL[b[0]] + ';" title="' + NOMBRE_BANDA[b[0]] + ' (' + b[1] + '–' + b[2] + ' %)"></div>'; }).join('') + '</div>' +
      '<div class="fa-marcas"><span style="left:0">0</span><span style="left:' + U.URGENTE + '%">' + U.URGENTE + '</span><span style="left:' + U.CRITICO + '%">' + U.CRITICO + '</span><span style="left:' + U.ATENCION + '%">' + U.ATENCION + '</span><span style="left:100%">100 %</span></div>' +
      '</div>';
    var banda = bandaDe(pct, U);
    h += '<div class="fa-medidor-texto">Agua útil hoy: <b style="color:' + COL[banda] + ';">' + fmt(pct, 0) + ' %</b> (' + NOMBRE_BANDA[banda] + ') · ' + fmt(r.aguaDisponibleHoy, 0) + ' de ' + fmt(r.tawHoy, 0) + ' mm en la raíz' + (r.etapaHoy && r.etapaHoy.zr ? ' (' + fmt(r.etapaHoy.zr * 100, 0) + ' cm)' : '') + '. Regar al ' + U.CRITICO + ' %, estrés bajo ' + U.URGENTE + ' %.</div>';
    return h;
  }

  /* ---------- 2. próximo riego ---------- */
  function vueltas(mm, equipo) {
    var dt = (equipo && equipo.datosTecnicos) || {};
    var lam = num(dt.lamina100), horas = num(dt.vuelta100), cap = num(dt.capacidad);
    if (lam && lam > 0) { var n = Math.ceil(mm / lam); return { n: n, lam: lam, horas: horas ? n * horas : null, texto: n + ' vuelta' + (n > 1 ? 's' : '') + ' de ' + fmt(lam, 1) + ' mm al 100 %' + (horas ? ' ≈ ' + fmt(n * horas, 0) + ' h' : '') }; }
    if (cap && cap > 0) { var d = mm / cap; return { dias: d, texto: 'el equipo aplica ' + fmt(cap, 1) + ' mm por día: ' + (d <= 1 ? 'menos de 1 día' : fmt(d, 1) + ' días') + ' de riego' }; }
    return null;
  }
  function proximoRiego(r, equipo) {
    var U = umbrales(r), hoyK = (r.dias || []).filter(function (d) { return d.esHoy; })[0], rec = r.recomendacion || {};
    var lluviaProx = (r.dias || []).reduce(function (s, d) { return s + (d.esFuturo ? (d.lluviaBruta || 0) : 0); }, 0);
    var out = { tipo: 'ok', titulo: '', detalle: '' };
    if (window.SafiaBalance && SafiaBalance.esSecano && equipo && SafiaBalance.esSecano(equipo)) { out.tipo = 'secano'; out.titulo = 'Lote de secano'; out.detalle = 'No se riega: el agua es la que llueve.'; return out; }
    if (lluviaProx >= 15) { out.tipo = 'lluvia'; out.titulo = 'No regar: viene lluvia'; out.detalle = 'Se esperan ' + fmt(lluviaProx, 0) + ' mm en los próximos días. Volver a mirar después de la lluvia.'; return out; }
    if (rec.regar) {
      var mm = rec.mm || 0, v = vueltas(mm, equipo);
      out.tipo = r.porcentajeHoy < U.URGENTE ? 'urgente' : 'regar';
      out.titulo = (out.tipo === 'urgente' ? 'Regar hoy (urgente): ' : 'Regar hoy: ') + fmt(mm, 0) + ' mm';
      out.detalle = (rec.mmTotal > mm ? 'Faltan ' + fmt(rec.mmTotal, 0) + ' mm para llenar la raíz; se reparte en más de una pasada. ' : '') + (v ? v.texto + '.' : '');
      return out;
    }
    var prox = (r.dias || []).filter(function (d) { return d.esFuturo && d.estado === 'regar'; })[0];
    if (prox) {
      var v2 = vueltas(prox.mmRegar || 0, equipo);
      out.tipo = 'proximo'; out.titulo = 'Próximo riego: ' + fmt(prox.mmRegar, 0) + ' mm el ' + diaTexto(prox.fecha, hoyK ? hoyK.fecha : '');
      out.detalle = 'Ese día la humedad llega al ' + fmt(prox.porcentajeAAU, 0) + ' % si no llueve (' + fmt(prox.lluviaBruta, 0) + ' mm previstos).' + (v2 ? ' ' + v2.texto + '.' : '');
      return out;
    }
    var n = (r.dias || []).filter(function (d) { return d.esFuturo; }).length, ult = (r.dias || [])[(r.dias || []).length - 1];
    out.titulo = 'Sin riego previsto en los próximos ' + n + ' días';
    out.detalle = ult ? 'La humedad queda en ' + fmt(ult.porcentajeAAU, 0) + ' % el ' + fmtF(ult.fecha) + '.' : '';
    return out;
  }
  var COL_TIPO = { urgente: COL.estres, regar: COL.regar, proximo: COL.atencion, ok: COL.optimo, lluvia: COL.lleno, secano: COL.gris };
  function titular(r, equipo) {
    var p = proximoRiego(r, equipo);
    return '<div class="fa-titular" style="border-left-color:' + COL_TIPO[p.tipo] + ';"><div class="fa-titular-txt" style="color:' + COL_TIPO[p.tipo] + ';">' + esc(p.titulo) + '</div>' + (p.detalle ? '<div class="fa-titular-det">' + esc(p.detalle) + '</div>' : '') + '</div>';
  }

  /* ---------- 3. gráfico (SVG a mano, sin librerías) ---------- */
  function serie(r, diasAtras) {
    var pas = (r.pasado || []).slice(-(diasAtras || 30)).map(function (d) { return { fecha: d.fecha, pct: d.porcentajeAAU != null ? d.porcentajeAAU : (d.taw ? Math.max(0, (d.taw - d.dr) / d.taw * 100) : null), lluvia: d.lluviaBruta || 0, riego: d.riegoBruto || 0, futuro: false, hoy: false, estres: d.ks < 1 }; });
    var fut = (r.dias || []).map(function (d) { return { fecha: d.fecha, pct: d.porcentajeAAU, lluvia: d.lluviaBruta || 0, riego: d.riegoBruto || 0, futuro: !!d.esFuturo, hoy: !!d.esHoy, estres: !!d.estres }; });
    return pas.concat(fut).filter(function (p) { return p.pct != null; });
  }
  function grafico(r, opciones) {
    var pts = serie(r, opciones.diasAtras), U = umbrales(r);
    if (pts.length < 2) return '<div class="fa-vacio">Todavía no hay días simulados para graficar.</div>';
    var W = 720, H = 210, ml = 34, mr = 10, mt = 14, mb = 46, gw = W - ml - mr, gh = H - mt - mb, hb = 30;   // hb: alto de las barras de lluvia/riego
    var n = pts.length, x = function (i) { return ml + (n === 1 ? 0 : i / (n - 1) * gw); }, y = function (p) { return mt + (1 - Math.max(0, Math.min(100, p)) / 100) * gh; };
    var maxMM = Math.max(10, Math.max.apply(null, pts.map(function (p) { return Math.max(p.lluvia, p.riego); })));
    var s = '<svg class="fa-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Agua útil día por día">';
    // bandas de fondo
    var bandas = [['estres', 0, U.URGENTE], ['regar', U.URGENTE, U.CRITICO], ['atencion', U.CRITICO, U.ATENCION], ['optimo', U.ATENCION, 100]];
    bandas.forEach(function (b) { s += '<rect x="' + ml + '" y="' + y(b[2]) + '" width="' + gw + '" height="' + (y(b[1]) - y(b[2])) + '" fill="' + COL[b[0]] + '" opacity="0.07"/>'; });
    // líneas de referencia
    [[100, 'capacidad de campo', COL.lleno, '4 3'], [U.CRITICO, 'regar', COL.regar, '5 4'], [U.URGENTE, 'estrés', COL.estres, '2 4']].forEach(function (l) {
      s += '<line x1="' + ml + '" x2="' + (ml + gw) + '" y1="' + y(l[0]) + '" y2="' + y(l[0]) + '" stroke="' + l[2] + '" stroke-width="1" stroke-dasharray="' + l[3] + '"/>';
      s += '<text x="' + (ml + gw - 2) + '" y="' + (y(l[0]) - 3) + '" font-size="9" text-anchor="end" fill="' + l[2] + '">' + l[1] + ' ' + l[0] + ' %</text>';
    });
    // eje y
    [0, 25, 50, 75, 100].forEach(function (v) { s += '<text x="' + (ml - 4) + '" y="' + (y(v) + 3) + '" font-size="9" text-anchor="end" fill="#8C9196">' + v + '</text>'; });
    // barras lluvia (azul) y riego (verde) abajo
    var bw = Math.max(2, gw / n * 0.6);
    pts.forEach(function (p, i) {
      var cx = x(i), base = H - mb + hb;
      if (p.lluvia > 0) s += '<rect x="' + (cx - bw / 2) + '" y="' + (base - p.lluvia / maxMM * hb) + '" width="' + bw + '" height="' + (p.lluvia / maxMM * hb) + '" fill="' + COL.lleno + '" opacity="' + (p.futuro ? 0.45 : 0.85) + '"><title>' + fmtF(p.fecha) + ': lluvia ' + fmt(p.lluvia, 1) + ' mm' + (p.futuro ? ' (pronóstico)' : '') + '</title></rect>';
      if (p.riego > 0) s += '<rect x="' + (cx - bw / 2) + '" y="' + (base - p.riego / maxMM * hb) + '" width="' + bw + '" height="' + (p.riego / maxMM * hb) + '" fill="' + COL.optimo + '" opacity="0.9"><title>' + fmtF(p.fecha) + ': riego ' + fmt(p.riego, 1) + ' mm</title></rect>';
    });
    s += '<text x="' + (ml - 4) + '" y="' + (H - mb + hb - 1) + '" font-size="9" text-anchor="end" fill="#8C9196">mm</text>';
    s += '<text x="' + (ml - 4) + '" y="' + (H - mb + 8) + '" font-size="9" text-anchor="end" fill="#8C9196">' + fmt(maxMM, 0) + '</text>';
    // curva: pasado sólido, futuro punteado; hoy marcado
    var iHoy = pts.findIndex(function (p) { return p.hoy; }); if (iHoy < 0) iHoy = pts.findIndex(function (p) { return p.futuro; }) - 1;
    var dPas = '', dFut = '';
    pts.forEach(function (p, i) { var c = (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.pct).toFixed(1); if (!p.futuro) dPas += c + ' '; if (i >= iHoy && iHoy >= 0) dFut += (i === iHoy ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.pct).toFixed(1) + ' '; });
    if (dPas) s += '<path d="' + dPas + 'L' + x(Math.max(0, iHoy < 0 ? n - 1 : iHoy)).toFixed(1) + ' ' + (mt + gh) + ' L' + ml + ' ' + (mt + gh) + ' Z" fill="' + COL.lleno + '" opacity="0.10"/><path d="' + dPas + '" fill="none" stroke="' + COL.lleno + '" stroke-width="2.2"/>';
    if (dFut) s += '<path d="' + dFut + '" fill="none" stroke="' + COL.lleno + '" stroke-width="2" stroke-dasharray="5 4"/>';
    pts.forEach(function (p, i) { if (p.estres && !p.futuro) s += '<circle cx="' + x(i) + '" cy="' + y(p.pct) + '" r="2.6" fill="' + COL.estres + '"><title>' + fmtF(p.fecha) + ': estrés hídrico</title></circle>'; });
    if (iHoy >= 0) { s += '<line x1="' + x(iHoy) + '" x2="' + x(iHoy) + '" y1="' + mt + '" y2="' + (mt + gh) + '" stroke="#2E3236" stroke-width="1" stroke-dasharray="2 3"/><circle cx="' + x(iHoy) + '" cy="' + y(pts[iHoy].pct) + '" r="4" fill="#fff" stroke="#2E3236" stroke-width="2"/><text x="' + x(iHoy) + '" y="' + (mt - 3) + '" font-size="9" text-anchor="middle" fill="#2E3236" font-weight="700">hoy</text>'; }
    // fechas
    var paso = Math.max(1, Math.round(n / 7));
    pts.forEach(function (p, i) { if (i % paso === 0 || i === n - 1) s += '<text x="' + x(i) + '" y="' + (H - 3) + '" font-size="9" text-anchor="middle" fill="#8C9196">' + fmtF(p.fecha) + '</text>'; });
    s += '</svg>';
    var tp = r.totalesPasado || {}, nPas = pts.filter(function (p) { return !p.futuro; }).length;
    var leyenda = '<div class="fa-leyenda"><span><i style="background:' + COL.lleno + '"></i>agua útil (%)</span><span><i style="background:' + COL.lleno + ';opacity:.6"></i>lluvia</span><span><i style="background:' + COL.optimo + '"></i>riego</span><span><i style="background:' + COL.estres + ';border-radius:50%"></i>día con estrés</span><span>punteado = pronóstico</span></div>';
    var resumen = '<div class="fa-resumen">Desde ' + (r.desdeSiembra ? 'la siembra' : 'hace ' + (r.diasSimulados || nPas) + ' días') + ': lluvia <b>' + fmt(tp.lluviaBruta, 0) + ' mm</b> · riego <b>' + fmt(tp.riegoBruto, 0) + ' mm</b> · consumo del cultivo (ETc) <b>' + fmt(tp.etc, 0) + ' mm</b> · días con estrés <b style="color:' + (tp.diasEstres ? COL.estres : COL.optimo) + ';">' + fmt(tp.diasEstres, 0) + '</b>' + (tp.drenaje > 1 ? ' · drenaje ' + fmt(tp.drenaje, 0) + ' mm' : '') + '.</div>';
    return s + leyenda + resumen;
  }

  /* ---------- 0. mini: barra con aguja para listas (Dashboard) ---------- */
  function mini(r) {
    if (!r || r.porcentajeHoy == null) return '';
    estilos();
    var U = umbrales(r), pct = Math.max(0, Math.min(100, num(r.porcentajeHoy) || 0)), banda = bandaDe(pct, U);
    var hoy = (r.dias || []).filter(function (d) { return d.esHoy; })[0] || (r.dias || [])[0] || {}, ayer = (r.pasado || [])[(r.pasado || []).length - 1] || null;
    var bandas = [['estres', 0, U.URGENTE], ['regar', U.URGENTE, U.CRITICO], ['atencion', U.CRITICO, U.ATENCION], ['optimo', U.ATENCION, 95], ['lleno', 95, 100]];
    return '<div class="fa-mini">' +
      '<div class="fa-mini-txt"><span style="color:' + COL[banda] + ';font-weight:800;">' + fmt(pct, 0) + ' %</span> agua útil' + (hoy.etcDia != null ? ' · ETc hoy ' + fmt(hoy.etcDia, 1) + ' mm' : '') + (ayer ? ' · lluvia ayer ' + fmt(ayer.lluviaBruta, 0) + ' mm' : '') + '</div>' +
      '<div class="fa-mini-barra">' + bandas.map(function (b) { return '<i style="width:' + Math.max(0, b[2] - b[1]) + '%;background:' + COL[b[0]] + '"></i>'; }).join('') +
      '<b class="fa-mini-aguja" style="left:' + pct.toFixed(1) + '%"></b></div></div>';
  }

  /* ---------- armado ---------- */
  var CSS = '.fa{font-family:inherit;color:#2E3236}.fa-medidor{position:relative;padding:26px 0 16px}.fa-bandas{display:flex;height:14px;border-radius:7px;overflow:hidden}.fa-banda{height:100%}' +
    '.fa-aguja{position:absolute;top:0;transform:translateX(-50%);text-align:center;pointer-events:none}.fa-aguja-valor{font-size:12px;font-weight:800;background:#2E3236;color:#fff;padding:2px 7px;border-radius:6px;white-space:nowrap}.fa-aguja-punta{width:0;height:0;margin:1px auto 0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #2E3236}' +
    '.fa-marcas{position:relative;height:14px;font-size:9.5px;color:#8C9196}.fa-marcas span{position:absolute;transform:translateX(-50%);top:3px;white-space:nowrap}.fa-marcas span:first-child{transform:none}.fa-marcas span:last-child{transform:translateX(-100%)}' +
    '.fa-medidor-texto{font-size:12px;color:#5B6167;line-height:1.45}' +
    '.fa-titular{border-left:4px solid #178029;background:#F7F8F9;border-radius:10px;padding:10px 14px;margin:10px 0}.fa-titular-txt{font-size:17px;font-weight:800;line-height:1.2}.fa-titular-det{font-size:12.5px;color:#5B6167;margin-top:3px;line-height:1.45}' +
    '.fa-svg{width:100%;height:210px;display:block;margin-top:6px}.fa-leyenda{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:#5B6167;margin-top:4px}.fa-leyenda i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}' +
    '.fa-mini{display:block;margin-top:4px}.fa-mini-barra{position:relative;width:100%;height:9px;border-radius:5px;overflow:visible;display:flex;margin-top:9px}.fa-mini-barra i{display:block;height:100%}.fa-mini-barra i:first-child{border-radius:4px 0 0 4px}.fa-mini-barra i:last-child{border-radius:0 4px 4px 0}.fa-mini-aguja{position:absolute;top:-8px;width:0;height:0;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid #2E3236}.fa-mini-txt{font-size:11px;color:#5B6167;line-height:1.3}' +
    '.fa-resumen{font-size:12px;color:#5B6167;margin-top:6px;line-height:1.5}@media(max-width:600px){.fa-svg{height:170px}.fa-titular-txt{font-size:15px}.fa-mini-txt{white-space:normal}}.fa-vacio{font-size:12px;color:#8C9196;padding:8px 0}.fa-titulo{font-size:11.5px;font-weight:700;color:#178029;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}';
  function estilos() { if (document.getElementById('safiaFichaAguaCss')) return; var st = document.createElement('style'); st.id = 'safiaFichaAguaCss'; st.textContent = CSS; document.head.appendChild(st); }
  function html(r, opciones) {
    opciones = opciones || {}; estilos();
    if (!r || r.porcentajeHoy == null) return '';
    var h = '<div class="fa">';
    if (opciones.titulo !== false) h += '<div class="fa-titulo">' + esc(opciones.titulo || 'Agua en el suelo') + '</div>';
    h += medidor(r) + titular(r, opciones.equipo);
    if (!opciones.compacta) h += grafico(r, { diasAtras: opciones.diasAtras || 30 });
    return h + '</div>';
  }
  window.SafiaFichaAgua = { html: html, mini: mini, medidor: medidor, titular: titular, grafico: grafico, proximoRiego: proximoRiego, vueltas: vueltas };
})();
