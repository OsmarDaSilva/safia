/* SAFIA — Piquetes del pivot: porciones de pizza, vigor satelital por porción y riego separado del pastoreo
   -------------------------------------------------------------------
   - Un pivot con pastura se divide en N piquetes en forma de porciones de pizza
     desde el centro (Manual de pastura irrigada, Irrigar 2025, 5.1). Con el
     polígono del pivot (Equipos y lotes), la cantidad de piquetes de la
     campaña y el ángulo del piquete 1 (Equipos y lotes → Datos técnicos, desde
     el norte, sentido horario; por defecto 0°) SAFIA los dibuja solos.
   - Vigor por piquete: una sola imagen Sentinel-2 del pivot (edge safia-ndvi,
     capa 'valores': NDVI codificado en el canal rojo) y SAFIA promedia los
     píxeles que caen en cada porción. Nubes excluidas (píxel transparente).
   - Calibración: cuando hay una lectura de altura con regla a ±3 días de una
     pasada, se guarda el par (NDVI, cm). Con 3 pares o más, estima la altura
     de los piquetes sin lectura por regresión lineal y avisa "a punto" por satélite.
   - Riego y pastoreo separados (Manual Irrigar 9.1): no regar el piquete
     ocupado ni los 3 siguientes; SAFIA da los grados a saltar en el pivot.
   Depende de window.SafiaPasturas (eventos, alturas) y window.safiaSupabase (edge). */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function leerObj(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function guardarObj(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = v == null || v === '' ? NaN : parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function sumarDias(f, n) { var d = new Date(String(f).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000); }
  function fmtF(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  var M_LAT = 111320;

  /* ---------- geometría: centro, radio y porciones ---------- */
  function centroRadio(equipo) {
    var pg = equipo && equipo.poligono; if (!pg || !pg.centro || !pg.partes) return null;
    var lat0 = num(pg.centro.lat), lon0 = num(pg.centro.lon); if (lat0 == null || lon0 == null) return null;
    var kLon = M_LAT * Math.cos(lat0 * Math.PI / 180), ds = [];
    pg.partes.forEach(function (anillos) { (anillos[0] || []).forEach(function (p) { var dy = (p[0] - lat0) * M_LAT, dx = (p[1] - lon0) * kLon; ds.push(Math.sqrt(dx * dx + dy * dy)); }); });
    if (!ds.length) return null;
    ds.sort(function (a, b) { return a - b; });
    var r = ds[Math.floor(ds.length * 0.9)];   // el radio del pivot: los vértices más lejanos (deja afuera esquinas de un polígono dibujado a mano)
    return { lat: lat0, lon: lon0, kLon: kLon, radio: r };
  }
  function parametros(equipo, cultivo) {
    var n = parseInt(cultivo && cultivo.piquetes, 10) || 0; if (n < 2) return null;
    var dt = (equipo && equipo.datosTecnicos) || {};
    var a0 = num(dt.piquete1Angulo) || 0, span = num(dt.angulo); if (!(span > 0 && span <= 360)) span = 360;
    return { n: n, anguloInicio: ((a0 % 360) + 360) % 360, span: span, paso: span / n };
  }
  // ángulo (grados desde el norte, horario) → [lat, lon] a distancia d del centro
  function punto(c, ang, d) { var t = ang * Math.PI / 180; return [c.lat + d * Math.cos(t) / M_LAT, c.lon + d * Math.sin(t) / c.kLon]; }
  function sectores(equipo, cultivo) {
    var c = centroRadio(equipo), p = parametros(equipo, cultivo); if (!c || !p) return null;
    var out = [];
    for (var i = 0; i < p.n; i++) {
      var a1 = p.anguloInicio + i * p.paso, a2 = a1 + p.paso, anillo = [[c.lat, c.lon]], pasos = Math.max(4, Math.ceil(p.paso / 6));
      for (var k = 0; k <= pasos; k++) anillo.push(punto(c, a1 + (a2 - a1) * k / pasos, c.radio));
      anillo.push([c.lat, c.lon]);
      out.push({ piquete: String(i + 1), a1: a1 % 360, a2: a2 % 360 || 360, partes: [[anillo]] });
    }
    return { centro: c, param: p, lista: out };
  }
  function indiceSector(c, p, lat, lon) {
    var dy = (lat - c.lat) * M_LAT, dx = (lon - c.lon) * c.kLon, d = Math.sqrt(dx * dx + dy * dy);
    if (d > c.radio * 1.02 || d < c.radio * 0.04) return -1;   // fuera del círculo o en el centro (torre, bebederos)
    var ang = Math.atan2(dx, dy) * 180 / Math.PI; ang = ((ang - p.anguloInicio) % 360 + 360) % 360;
    if (ang >= p.span) return -1;
    return Math.min(p.n - 1, Math.floor(ang / p.paso));
  }

  /* ---------- vigor por piquete (imagen de valores → promedio por porción) ---------- */
  function claveSerie(equipoId) { return 'ndvi_piq_' + String(equipoId); }
  function serieGuardada(equipoId) { return leerObj(claveSerie(equipoId)) || { pasadas: [] }; }
  // fechas con imagen: la serie del lote que guarda la pestaña Vigor satelital del Banco (ndvi_<id>) o, si no hay, la pide a la edge
  function fechasPasadas(equipo, campoId, dias) {
    var local = leerObj('ndvi_' + String(equipo.id));
    var lista = Array.isArray(local) ? local : (local && local.serie) || [];
    var desde = sumarDias(hoy(), -(dias || 45));
    var buenas = lista.filter(function (s) { return s.fecha >= desde && (s.nubes_pct == null || s.nubes_pct < 40) && s.ndvi != null; }).map(function (s) { return s.fecha; });
    if (buenas.length) return Promise.resolve(buenas);
    if (!window.safiaSupabase) return Promise.resolve([]);
    return window.safiaSupabase.functions.invoke('safia-ndvi', { body: { equipoId: String(equipo.id), campoId: campoId != null ? String(campoId) : null, partes: equipo.poligono.partes, desde: desde, hasta: hoy() } })
      .then(function (r) { var d = r && r.data; var serie = (d && (d.serie || d.datos || d.filas)) || []; return serie.filter(function (s) { return (s.nubes_pct == null || s.nubes_pct < 40) && (s.ndvi != null || s.ndvi_media != null); }).map(function (s) { return s.fecha; }); })
      .catch(function () { return []; });
  }
  function decodificarPng(b64) {
    return new Promise(function (ok, no) {
      var img = new Image();
      img.onload = function () { var cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); ok({ datos: cx.getImageData(0, 0, img.width, img.height).data, ancho: img.width, alto: img.height }); };
      img.onerror = function () { no(new Error('imagen ilegible')); };
      img.src = 'data:image/png;base64,' + b64;
    });
  }
  function vigorEnFecha(equipo, cultivo, fecha) {
    var g = sectores(equipo, cultivo); if (!g) return Promise.resolve(null);
    var guard = serieGuardada(equipo.id), ya = guard.pasadas.find(function (p) { return p.fecha === fecha && p.n === g.param.n && p.a0 === g.param.anguloInicio; });
    if (ya) return Promise.resolve(ya);
    if (!window.safiaSupabase) return Promise.resolve(null);
    return window.safiaSupabase.functions.invoke('safia-ndvi', { body: { tipo: 'imagen', capa: 'valores', equipoId: String(equipo.id), partes: equipo.poligono.partes, fecha: fecha, ancho: 500 } }).then(function (r) {
      var d = r && r.data; if (!d || !d.png) throw new Error((d && d.error) || 'sin imagen');
      return decodificarPng(d.png).then(function (im) {
        var b = d.bounds, latN = b[1][0], latS = b[0][0], lonO = b[0][1], lonE = b[1][1];
        var suma = [], cnt = [], nub = [], i;
        for (i = 0; i < g.param.n; i++) { suma.push(0); cnt.push(0); nub.push(0); }
        for (var y = 0; y < im.alto; y++) {
          var lat = latN - (y + 0.5) / im.alto * (latN - latS);
          for (var x = 0; x < im.ancho; x++) {
            var lon = lonO + (x + 0.5) / im.ancho * (lonE - lonO), k = indiceSector(g.centro, g.param, lat, lon); if (k < 0) continue;
            var o = (y * im.ancho + x) * 4, a = im.datos[o + 3];
            if (a === 0) continue;                     // fuera del polígono
            if (a < 255) { nub[k]++; continue; }        // nube
            suma[k] += im.datos[o] / 127.5 - 1; cnt[k]++;
          }
        }
        var por = {}; for (i = 0; i < g.param.n; i++) { var tot = cnt[i] + nub[i]; por[String(i + 1)] = cnt[i] >= 5 ? { ndvi: Math.round(suma[i] / cnt[i] * 1000) / 1000, pixeles: cnt[i], nubes_pct: tot ? Math.round(nub[i] / tot * 100) : 0 } : null; }
        var pasada = { fecha: fecha, n: g.param.n, a0: g.param.anguloInicio, por: por };
        guard.pasadas = guard.pasadas.filter(function (p) { return p.fecha !== fecha; }).concat([pasada]).sort(function (p, q) { return p.fecha.localeCompare(q.fecha); }).slice(-12);
        guardarObj(claveSerie(equipo.id), guard);
        return pasada;
      });
    });
  }
  // últimas pasadas (máx. 3 fechas nuevas por vez, para no demorar) → { pasadas, ultima }
  function actualizar(equipo, cultivo, campoId) {
    return fechasPasadas(equipo, campoId, 45).then(function (fechas) {
      var guard = serieGuardada(equipo.id), faltan = fechas.filter(function (f) { return !guard.pasadas.some(function (p) { return p.fecha === f; }); }).slice(-3);
      var cadena = Promise.resolve();
      faltan.forEach(function (f) { cadena = cadena.then(function () { return vigorEnFecha(equipo, cultivo, f).catch(function () { return null; }); }); });
      return cadena.then(function () { var s = serieGuardada(equipo.id); return { pasadas: s.pasadas, ultima: s.pasadas[s.pasadas.length - 1] || null, fechasDisponibles: fechas.length }; });
    });
  }

  /* ---------- calibración altura ↔ NDVI (aprende con las lecturas de regla) ---------- */
  function pares(equipo) {
    var s = serieGuardada(equipo.id), lect = window.SafiaPasturas ? SafiaPasturas.lecturasLote(equipo.id) : [], out = [];
    lect.forEach(function (l) {
      var mejor = null, dm = 99;
      s.pasadas.forEach(function (p) { var d = Math.abs(diasEntre(p.fecha, l.fecha)); var v = p.por[String(l.piquete)]; if (v && d <= 3 && d < dm) { dm = d; mejor = v; } });
      if (mejor) out.push({ ndvi: mejor.ndvi, cm: parseFloat(l.alturaCm), piquete: l.piquete, fecha: l.fecha });
    });
    return out;
  }
  function regresion(pp) {
    if (pp.length < 3) return null;
    var n = pp.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pp.forEach(function (p) { sx += p.ndvi; sy += p.cm; sxx += p.ndvi * p.ndvi; sxy += p.ndvi * p.cm; });
    var den = n * sxx - sx * sx; if (Math.abs(den) < 1e-9) return null;
    var b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
    if (b <= 0) return null;   // más vigor tiene que ser más altura; si no, los datos no sirven todavía
    var ss = 0, st = 0, my = sy / n; pp.forEach(function (p) { var e = p.cm - (a + b * p.ndvi); ss += e * e; st += (p.cm - my) * (p.cm - my); });
    return { a: a, b: b, n: n, r2: st > 0 ? Math.round((1 - ss / st) * 100) / 100 : null, estimar: function (ndvi) { return Math.round(a + b * ndvi); } };
  }

  /* ---------- riego separado del pastoreo ---------- */
  // piquete ocupado y los 'saltar' siguientes en el sentido de la rotación → grados que el pivot no riega hoy
  function sectoresSinRiego(equipo, cultivo, saltar) {
    var g = sectores(equipo, cultivo); if (!g || !window.SafiaPasturas) return null;
    var st = SafiaPasturas.estadoPiquetes(equipo.id, cultivo); if (!st.ocupado) return { ocupado: null, piquetes: [], grados: [] };
    var k = g.lista.findIndex(function (s) { return s.piquete === String(st.ocupado); }); if (k < 0) return { ocupado: st.ocupado, piquetes: [], grados: [] };
    var n = g.param.n, cuantos = Math.min(n - 1, (saltar || 3) + 1), piqs = [], sec = [];
    for (var i = 0; i < cuantos; i++) { var s = g.lista[(k + i) % n]; piqs.push(s.piquete); sec.push(s); }
    var a1 = sec[0].a1, a2 = a1 + cuantos * g.param.paso;   // arco continuo
    return { ocupado: st.ocupado, piquetes: piqs, grados: [Math.round(a1), Math.round(a2 % 360 === 0 && a2 > 0 ? 360 : a2 % 360)], a1: a1, a2: a2 };
  }

  /* ---------- dibujo: el pivot en porciones, coloreado por vigor o por estado ---------- */
  var RAMPA = [[-0.2, [120, 90, 60]], [0.15, [196, 168, 120]], [0.3, [232, 212, 92]], [0.45, [172, 202, 72]], [0.6, [92, 172, 62]], [0.75, [32, 132, 42]], [0.9, [0, 82, 22]]];
  function colorNdvi(v) {
    if (v == null) return '#E1E4E7';
    if (v <= RAMPA[0][0]) return rgb(RAMPA[0][1]);
    for (var i = 1; i < RAMPA.length; i++) if (v <= RAMPA[i][0]) { var a = RAMPA[i - 1], b = RAMPA[i], t = (v - a[0]) / (b[0] - a[0]); return rgb([a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t]); }
    return rgb(RAMPA[RAMPA.length - 1][1]);
  }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function svgPivot(g, colorDe, etiquetaDe, sinRiego) {
    var R = 96, cx = 100, cy = 100, h = '<svg viewBox="0 0 200 200" style="width:100%;max-width:260px;display:block;margin:0 auto;" role="img" aria-label="Pivot dividido en piquetes">';
    g.lista.forEach(function (s, i) {
      var a1 = (g.param.anguloInicio + i * g.param.paso), a2 = a1 + g.param.paso;
      var p1 = pt(cx, cy, R, a1), p2 = pt(cx, cy, R, a2), grande = g.param.paso > 180 ? 1 : 0;
      var d = g.param.paso >= 360 ? 'M' + cx + ' ' + (cy - R) + ' A' + R + ' ' + R + ' 0 1 1 ' + cx + ' ' + (cy + R) + ' A' + R + ' ' + R + ' 0 1 1 ' + cx + ' ' + (cy - R) + ' Z' : 'M' + cx + ' ' + cy + ' L' + p1[0] + ' ' + p1[1] + ' A' + R + ' ' + R + ' 0 ' + grande + ' 1 ' + p2[0] + ' ' + p2[1] + ' Z';
      var sr = sinRiego && sinRiego.piquetes.indexOf(s.piquete) !== -1;
      h += '<path d="' + d + '" fill="' + colorDe(s) + '" stroke="#fff" stroke-width="1.5"' + (sr ? ' stroke-dasharray="3 2" stroke="#2E72C8" stroke-width="2"' : '') + '><title>Piquete ' + esc(s.piquete) + (etiquetaDe ? ': ' + esc(etiquetaDe(s)) : '') + '</title></path>';
      var pm = pt(cx, cy, R * 0.68, (a1 + a2) / 2);
      if (g.param.n <= 40) h += '<text x="' + pm[0] + '" y="' + (pm[1] + 3.5) + '" font-size="' + (g.param.n > 24 ? 7 : 10) + '" text-anchor="middle" fill="#fff" font-weight="600" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px;">' + esc(s.piquete) + '</text>';
    });
    h += '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#2C2C2A"/><text x="' + cx + '" y="8" font-size="7" text-anchor="middle" fill="#8C9196">N</text></svg>';
    return h;
  }
  function pt(cx, cy, r, ang) { var t = ang * Math.PI / 180; return [Math.round((cx + r * Math.sin(t)) * 10) / 10, Math.round((cy - r * Math.cos(t)) * 10) / 10]; }

  /* ---------- panel para Operador / Encargado ---------- */
  // Devuelve HTML con: el pivot coloreado por NDVI (última pasada), tabla por piquete (NDVI, tendencia, altura estimada), riego sin pastoreo
  function htmlPanel(equipo, cultivo, datos) {
    var g = sectores(equipo, cultivo);
    if (!g) return '<div style="font-size:12px;color:#8C9196;">Para dividir el pivot en piquetes hacen falta el polígono del pivot (Equipos y lotes) y la cantidad de piquetes en la campaña.</div>';
    var ref = window.SafiaPasturas ? SafiaPasturas.alturasReferencia((cultivo.variedad || '') + ' ' + (cultivo.cultivo || '')) : null;
    var est = window.SafiaPasturas ? SafiaPasturas.estadoPiquetes(equipo.id, cultivo) : { piquetes: [], ocupado: null };
    var ult = datos && datos.ultima, prev = datos && datos.pasadas && datos.pasadas.length > 1 ? datos.pasadas[datos.pasadas.length - 2] : null;
    var reg = regresion(pares(equipo)), sinR = sectoresSinRiego(equipo, cultivo, 3);
    var colorDe = function (s) { var v = ult && ult.por[s.piquete]; return colorNdvi(v ? v.ndvi : null); };
    var etiq = function (s) { var v = ult && ult.por[s.piquete]; return v ? 'NDVI ' + v.ndvi.toFixed(2) : 'sin dato'; };
    var h = '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
    h += '<div style="flex:0 1 240px;min-width:180px;">' + svgPivot(g, colorDe, etiq, sinR) + '<div style="font-size:11px;color:#8C9196;text-align:center;margin-top:4px;">' + (ult ? 'Vigor Sentinel-2 del ' + fmtF(ult.fecha) + (prev ? ' (anterior ' + fmtF(prev.fecha) + ')' : '') : 'Sin imagen todavía') + ' · piquete 1 desde ' + g.param.anguloInicio + '° (norte, horario)' + (sinR && sinR.piquetes.length ? ' · <span style="color:#2E72C8;">punteado: no regar hoy</span>' : '') + '</div></div>';
    h += '<div style="flex:1 1 280px;min-width:0;">';
    if (sinR && sinR.ocupado) h += '<div style="font-size:12px;background:#E7F0FB;border-radius:8px;padding:6px 10px;margin-bottom:8px;color:#234e85;"><b>Riego separado del pastoreo:</b> hoy no regar los piquetes ' + esc(sinR.piquetes.join(', ')) + ' (el ocupado y los 3 siguientes): saltar del <b>' + sinR.grados[0] + '°</b> al <b>' + sinR.grados[1] + '°</b> desde el norte, sentido horario. Regar el resto según el balance.</div>';
    else if (sinR) h += '<div style="font-size:12px;color:#8C9196;margin-bottom:8px;">Cuando cargues la entrada de los animales a un piquete, acá aparecen los grados del pivot que no se riegan.</div>';
    if (reg) h += '<div style="font-size:11px;color:#8C9196;margin-bottom:6px;">Altura estimada por satélite con ' + reg.n + ' lecturas de regla (ajuste R² ' + (reg.r2 != null ? reg.r2 : '—') + '). Seguí midiendo: cada lectura afina el cálculo.</div>';
    else h += '<div style="font-size:11px;color:#8C9196;margin-bottom:6px;">Con 3 lecturas de regla hechas a ±3 días de una pasada del satélite, SAFIA empieza a estimar la altura de todos los piquetes desde el NDVI.</div>';
    var filas = g.lista.map(function (s) {
      var v = ult && ult.por[s.piquete], pv = prev && prev.por[s.piquete], e = est.piquetes.find(function (x) { return x.piquete === s.piquete; }) || {};
      var tend = v && pv && diasEntre(prev.fecha, ult.fecha) > 0 ? (v.ndvi - pv.ndvi) / diasEntre(prev.fecha, ult.fecha) : null;
      var altSat = reg && v ? reg.estimar(v.ndvi) : null;
      var listoSat = altSat != null && ref && altSat >= ref.entrada;
      return { s: s, v: v, tend: tend, altSat: altSat, listoSat: listoSat, e: e };
    });
    filas.sort(function (a, b) { var oa = a.e.estado === 'ocupado' ? 0 : (a.listoSat || a.e.estado === 'listo') ? 1 : 2, ob = b.e.estado === 'ocupado' ? 0 : (b.listoSat || b.e.estado === 'listo') ? 1 : 2; return oa - ob || (b.v ? b.v.ndvi : -1) - (a.v ? a.v.ndvi : -1); });
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;"><tr style="color:#8C9196;text-align:left;"><th style="padding:3px 0;width:16%;">Piq.</th><th style="width:16%;">NDVI</th><th style="width:20%;">Tendencia</th><th style="width:20%;">Regla</th><th>Estado</th></tr>';
    filas.forEach(function (f) {
      var estadoTxt = f.e.estado === 'ocupado' ? '<span style="color:#2E72C8;font-weight:600;">Animales adentro</span>' : (f.e.estado === 'listo' ? '<span style="color:#178029;font-weight:600;">A punto (regla)</span>' : (f.listoSat ? '<span style="color:#178029;font-weight:600;">A punto por satélite (~' + f.altSat + ' cm)</span>' : (f.altSat != null ? '~' + f.altSat + ' cm por satélite' : (f.e.texto ? esc(f.e.texto).slice(0, 60) : '—'))));
      h += '<tr style="border-top:1px solid #EEF0F2;"><td style="padding:4px 0;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + colorNdvi(f.v ? f.v.ndvi : null) + ';vertical-align:-1px;margin-right:4px;"></span><b>' + esc(f.s.piquete) + '</b></td><td>' + (f.v ? f.v.ndvi.toFixed(2) + (f.v.nubes_pct > 30 ? '<span style="color:#8C9196;" title="parte con nubes">*</span>' : '') : '—') + '</td><td style="color:' + (f.tend > 0 ? '#178029' : f.tend < 0 ? '#B5371C' : '#8C9196') + ';">' + (f.tend != null ? (f.tend > 0 ? '+' : '') + (f.tend * 100).toFixed(1) + '/100 por día' : '—') + '</td><td>' + (f.e.altura ? f.e.altura + ' cm <span style="color:#8C9196;">' + fmtF(f.e.fechaLectura) + '</span>' : '—') + '</td><td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + estadoTxt + '</td></tr>';
    });
    h += '</table></div></div>';
    return h;
  }

  window.SafiaPiquetes = { sectores: sectores, centroRadio: centroRadio, parametros: parametros, indiceSector: indiceSector, vigorEnFecha: vigorEnFecha, actualizar: actualizar, serieGuardada: serieGuardada, pares: pares, regresion: regresion, sectoresSinRiego: sectoresSinRiego, colorNdvi: colorNdvi, svgPivot: svgPivot, htmlPanel: htmlPanel };
})();
