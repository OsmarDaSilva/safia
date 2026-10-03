/* SAFIA — Uniformidad del pivot vista desde el satélite (Banco → Vigor satelital)
   -------------------------------------------------------------------
   Un grupo de picos que tira de más o de menos, un regulador fallado o un tramo con problema riega siempre el mismo
   círculo: deja una FRANJA CIRCULAR alrededor del centro. Se busca en las imágenes de vigor (NDVI) que SAFIA ya baja:
   1. Para cada pasada limpia del satélite se promedia el NDVI por distancia al centro del pivot (anillos de 5 m).
   2. Cada anillo se compara con sus vecinos de más adentro y más afuera (mediana a ±50 m, sin contar los ±12 m propios).
   3. Franja sospechosa = 15 m o más con el vigor al menos 5 % (y 0,03 de NDVI) distinto al de sus vecinas.
   4. Solo se informa lo que se repite en 2 o más pasadas. Las franjas finas sobre una torre son la huella de las ruedas.
   Lo que se ve y lo que no (datos de Osmar, 3-oct-2026): los pivots de Irrigar usan en su mayoría Senninger i-Wob UP3,
   con 16 a 18 m de diámetro mojado y los picos a 2,28 m en los tramos de afuera (unos 15 picos en los 2 o 3 primeros
   tramos y 24 a 26 en los demás). Cada punto del suelo recibe agua de varios picos: UN pico tapado le quita a su franja
   alrededor de un 15 % del agua: con el cultivo verde cuesta verlo (píxel de 10 m); varios picos seguidos, un regulador,
   un tramo o el cañón final se ven antes. PERO la diferencia de agua se acumula todo el ciclo y se nota AL MADURAR (Osmar,
   3-oct-2026): la franja con boquilla más grande tiene más hoja y sigue verde cuando el resto madura; la del pico tapado se
   seca antes. Por eso se revisan sobre todo las pasadas de maduración (vigor ya bajando), más una o dos de canopia plena.
   Y solo cuando el cultivo depende del riego: con lluvia de sobra, todo el círculo se ve igual.
   Es una alarma para ir a mirar; la confirmación es la prueba de vasos (coeficiente de uniformidad) en el campo.
   Depende de SafiaNDVI (serie de pasadas) y de la edge safia-ndvi (capa 'valores': NDVI en el canal rojo, 0..255 = −1..1). */
(function () {
  'use strict';
  var PASO = 5, VENTANA = 50, PROPIO = 12, MIN_REL = 0.05, MIN_ABS = 0.03, MIN_ANCHO = 15, R_MIN = 40, BORDE = 15, MAX_MADUREZ = 4, MAX_PLENA = 2, NDVI_MIN = 0.4, NDVI_PISO = 0.3, NUBES_MARGEN = 3;
  var M_GRADO = 111320;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function fmtF(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function mediana(l) { if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  /* ---------- geometría del pivot ---------- */
  function geometria(equipo) {
    var p = equipo && equipo.poligono, partes = p && p.partes; if (!partes || !partes.length || !partes[0][0]) return null;
    var an = partes[0][0], c = p.centro && p.centro.lat != null ? { lat: +p.centro.lat, lon: +p.centro.lon } : null;
    if (!c) { var sl = 0, so = 0; an.forEach(function (q) { sl += q[0]; so += q[1]; }); c = { lat: sl / an.length, lon: so / an.length }; }
    var k = Math.cos(c.lat * Math.PI / 180), ds = an.map(function (q) { return Math.sqrt(Math.pow((q[0] - c.lat) * M_GRADO, 2) + Math.pow((q[1] - c.lon) * M_GRADO * k, 2)); });
    var R = mediana(ds), circular = (Math.max.apply(null, ds) - Math.min.apply(null, ds)) / R < 0.12;   // corner o lote irregular: no es un círculo
    return { centro: c, k: k, radio: R, circular: circular };
  }
  // Distancia de cada torre al centro (aproximada: tramos iguales). largo = largo total del pivot si está cargado; si no, el radio.
  function torres(equipo, R) {
    var dt = (equipo && equipo.datosTecnicos) || {}, n = Math.round(num(dt.torres) || 0), largo = num(dt.largo) || num(dt.largoLinea) || R;
    if (!(n > 0)) return [];
    var hasta = Math.min(largo, R), tramo = hasta / (n + 0.35), out = [];   // el voladizo final suele ser un tercio de tramo
    for (var i = 1; i <= n; i++) out.push(Math.round(tramo * i));
    return out;
  }
  function tramoDe(r, ts) { var t = 1; ts.forEach(function (x) { if (r > x) t++; }); return ts.length ? (t > ts.length ? 'voladizo final' : 'tramo ' + t) : null; }

  /* ---------- 1. perfil de vigor por distancia al centro ---------- */
  function perfil(im, bounds, geo) {
    var latS = bounds[0][0], lonO = bounds[0][1], latN = bounds[1][0], lonE = bounds[1][1], nb = Math.ceil(geo.radio / PASO) + 2, suma = new Float64Array(nb), cnt = new Uint32Array(nb), nub = 0, tot = 0;
    for (var y = 0; y < im.alto; y++) {
      var dy = (latN - (y + 0.5) / im.alto * (latN - latS) - geo.centro.lat) * M_GRADO;
      for (var x = 0; x < im.ancho; x++) {
        var o = (y * im.ancho + x) * 4, a = im.datos[o + 3]; if (a === 0) continue;
        tot++; if (a < 255) { nub++; continue; }
        var dx = (lonO + (x + 0.5) / im.ancho * (lonE - lonO) - geo.centro.lon) * M_GRADO * geo.k, b = Math.floor(Math.sqrt(dx * dx + dy * dy) / PASO);
        if (b < nb) { suma[b] += im.datos[o] / 127.5 - 1; cnt[b]++; }
      }
    }
    var v = []; for (var i = 0; i < nb; i++) v.push(cnt[i] >= 12 ? suma[i] / cnt[i] : null);
    return { v: v, nubesPct: tot ? Math.round(nub / tot * 100) : 0 };
  }

  /* ---------- 2. franjas de una pasada ---------- */
  function franjas(v, R) {
    var n = v.length, desv = [], base = [];
    for (var i = 0; i < n; i++) {
      var r = (i + 0.5) * PASO, vec = [];
      if (v[i] == null || r < R_MIN || r > R - BORDE) { desv.push(null); base.push(null); continue; }
      for (var j = 0; j < n; j++) { var d = Math.abs(j - i) * PASO; if (v[j] != null && d > PROPIO && d <= VENTANA && (j + 0.5) * PASO >= R_MIN - 15 && (j + 0.5) * PASO <= R - BORDE + 5) vec.push(v[j]); }
      var m = vec.length >= 6 ? mediana(vec) : null; base.push(m); desv.push(m != null ? v[i] - m : null);
    }
    var out = [], ini = null, signo = 0;
    var cierra = function (fin) {
      if (ini == null) return;
      var s = 0, sb = 0, c = 0; for (var q = ini; q < fin; q++) { s += desv[q]; sb += base[q]; c++; }
      if (c * PASO >= MIN_ANCHO) out.push({ r0: ini * PASO, r1: fin * PASO, dif: s / c, rel: (s / c) / (sb / c) });
      ini = null; signo = 0;
    };
    for (var t = 0; t < n; t++) {
      var d2 = desv[t], fuerte = d2 != null && Math.abs(d2) >= Math.max(MIN_ABS, MIN_REL * Math.abs(base[t])), sg = fuerte ? (d2 > 0 ? 1 : -1) : 0;
      if (sg !== signo) cierra(t);
      if (sg !== 0 && ini == null) { ini = t; signo = sg; }
    }
    cierra(n);
    return out;
  }

  /* ---------- 3. lo que se repite entre pasadas ---------- */
  function analizar(pasadas, R, ts) {
    pasadas.forEach(function (p) { p.franjas = franjas(p.v, R); });
    var grupos = [];
    pasadas.forEach(function (p, pi) { p.franjas.forEach(function (f) {
      var g = grupos.find(function (x) { return (x.signo > 0) === (f.dif > 0) && f.r0 < x.r1 + 10 && f.r1 > x.r0 - 10; });
      if (!g) { g = { r0: f.r0, r1: f.r1, signo: f.dif > 0 ? 1 : -1, en: [], rel: [] }; grupos.push(g); }
      if (g.en.indexOf(pi) < 0) { g.en.push(pi); g.rel.push(f.rel); g.r0 = Math.min(g.r0, f.r0); g.r1 = Math.max(g.r1, f.r1); }
    }); });
    var hallazgos = grupos.map(function (g) {
      var centro = (g.r0 + g.r1) / 2, ancho = g.r1 - g.r0, torre = null; ts.forEach(function (x, i) { if (Math.abs(x - centro) <= 8) torre = i + 1; });
      var relM = g.rel.reduce(function (a, b) { return a + b; }, 0) / g.rel.length;
      return { r0: g.r0, r1: g.r1, ancho: ancho, signo: g.signo, pasadas: g.en.length, enMadurez: g.en.filter(function (q) { return pasadas[q].etapa === 'madurez'; }).length, relPct: Math.round(relM * 1000) / 10, tramo: tramoDe(centro, ts), huella: torre && g.signo < 0 && ancho <= 20 ? torre : null, confirmada: g.en.length >= 2 };
    }).sort(function (a, b) { return a.r0 - b.r0; });
    // caída hacia la punta: el último quinto contra el tramo medio, en cada pasada
    var caidas = pasadas.map(function (p) {
      var med = [], pun = []; p.v.forEach(function (x, i) { var r = (i + 0.5) * PASO; if (x == null) return; if (r >= R * 0.4 && r <= R * 0.7) med.push(x); if (r >= R * 0.82 && r <= R - BORDE) pun.push(x); });
      return med.length >= 5 && pun.length >= 3 ? (mediana(pun) - mediana(med)) / mediana(med) : null;
    }).filter(function (x) { return x != null; });
    var caida = caidas.length >= 2 && caidas.filter(function (x) { return x <= -0.08; }).length >= 2 ? Math.round(mediana(caidas) * 1000) / 10 : null;
    return { hallazgos: hallazgos, caidaPuntaPct: caida };
  }

  /* ---------- 4. traer las pasadas ---------- */
  function decodificar(b64) {
    return new Promise(function (ok, no) { var img = new Image(); img.onload = function () { var cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); ok({ datos: cx.getImageData(0, 0, img.width, img.height).data, ancho: img.width, alto: img.height }); }; img.onerror = function () { no(new Error('imagen ilegible')); }; img.src = 'data:image/png;base64,' + b64; });
  }
  // Qué pasadas mirar: las de MADURACIÓN del último ciclo (después del máximo, con el vigor bajando y antes de la cosecha), que es
  // donde la diferencia de agua acumulada se nota, más una o dos de canopia plena. Si el cultivo todavía no empezó a madurar
  // (o es una pastura), las últimas con el suelo cubierto.
  function elegirPasadas(serie) {
    var piso = Math.min.apply(null, serie.filter(function (p) { return p.nubes_pct != null; }).map(function (p) { return +p.nubes_pct; }).concat([100]));
    // El % de nubes guardado cuenta también el borde del recuadro que queda fuera del lote (en un círculo, ~21 %): una pasada
    // limpia es la que tiene el mínimo del lote, no "menos de 10 %". Después cada imagen se vuelve a revisar píxel por píxel.
    var l = serie.filter(function (p) { return p.fecha && p.ndvi != null && !(+p.nubes_pct > piso + NUBES_MARGEN); }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    if (!l.length) return [];
    var ult = l[l.length - 1].fecha, desde = new Date(new Date(ult + 'T12:00:00').getTime() - 200 * 86400000).toISOString().slice(0, 10);
    l = l.filter(function (p) { return p.fecha >= desde; });
    var pico = Math.max.apply(null, l.map(function (p) { return +p.ndvi; })); if (pico < 0.6) return [];
    var ip = -1; l.forEach(function (p, k) { if (p.ndvi >= 0.95 * pico) ip = k; });
    var madurez = []; for (var k = ip + 1; k < l.length; k++) { if (l[k].ndvi < NDVI_PISO) break; if (l[k].ndvi <= 0.92 * pico) madurez.push(l[k]); }
    if (madurez.length > MAX_MADUREZ) { var m = madurez, n = m.length; madurez = [m[0], m[Math.round((n - 1) / 3)], m[Math.round(2 * (n - 1) / 3)], m[n - 1]].filter(function (x, q, a) { return a.indexOf(x) === q; }); }
    var out = [];
    if (madurez.length) { for (var q = ip; q >= 0 && out.length < MAX_PLENA; q -= 3) out.unshift({ fecha: l[q].fecha, etapa: 'plena' }); madurez.forEach(function (p) { out.push({ fecha: p.fecha, etapa: 'madurez' }); }); }
    else l.filter(function (p) { return p.ndvi >= NDVI_MIN; }).slice(-4).forEach(function (p) { out.push({ fecha: p.fecha, etapa: 'plena' }); });
    return out;
  }
  function fechasUtiles(equipo) { return elegirPasadas((window.SafiaNDVI && SafiaNDVI.serieDe ? SafiaNDVI.serieDe(equipo.id) : []) || []); }
  function revisar(equipo, avisar) {
    var geo = geometria(equipo); if (!geo) return Promise.reject(new Error('el pivot no tiene polígono'));
    if (!window.safiaSupabase) return Promise.reject(new Error('sin conexión'));
    var fechas = fechasUtiles(equipo); if (fechas.length < 2) return Promise.reject(new Error('hacen falta al menos 2 pasadas del satélite sin nubes y con el cultivo cubriendo el suelo; primero actualizá el vigor de este lote'));
    var pasadas = [], cadena = Promise.resolve();
    fechas.forEach(function (fe, i) { var f = fe.fecha; cadena = cadena.then(function () {
      if (avisar) avisar('Bajando la pasada del ' + fmtF(f) + ' (' + (i + 1) + ' de ' + fechas.length + ')…');
      return window.safiaSupabase.functions.invoke('safia-ndvi', { body: { tipo: 'imagen', capa: 'valores', equipoId: String(equipo.id), partes: equipo.poligono.partes, fecha: f, ancho: 600 } }).then(function (r) {
        var d = r && r.data; if (!d || !d.png) return;
        return decodificar(d.png).then(function (im) { var p = perfil(im, d.bounds, geo); if (p.nubesPct <= 15) pasadas.push({ fecha: f, etapa: fe.etapa, v: p.v }); });
      }).catch(function () {});
    }); });
    return cadena.then(function () {
      if (pasadas.length < 2) throw new Error('no se pudieron bajar dos pasadas limpias');
      var ts = torres(equipo, geo.radio), A = analizar(pasadas, geo.radio, ts);
      return { equipo: equipo, geo: geo, torres: ts, pasadas: pasadas, hallazgos: A.hallazgos, caidaPuntaPct: A.caidaPuntaPct };
    });
  }

  /* ---------- 5. dibujo y texto ---------- */
  var COLS = ['#9DB8D9', '#6C97C9', '#3F74B5', '#1F4E8C'];
  function svg(Rs) {
    var W = 720, H = 250, x0 = 46, x1 = W - 12, y0 = 14, y1 = H - 40, R = Rs.geo.radio, todos = [];
    Rs.pasadas.forEach(function (p) { p.v.forEach(function (x, i) { if (x != null && (i + 0.5) * PASO >= 20) todos.push(x); }); });
    var mn = Math.max(0, Math.min.apply(null, todos) - 0.03), mx = Math.min(1, Math.max.apply(null, todos) + 0.03);
    var X = function (r) { return x0 + r / R * (x1 - x0); }, Y = function (v) { return y1 - (v - mn) / (mx - mn) * (y1 - y0); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;font-family:inherit;" role="img" aria-label="Vigor según la distancia al centro del pivot">';
    Rs.hallazgos.filter(function (h) { return h.confirmada && !h.huella; }).forEach(function (h) { s += '<rect x="' + X(h.r0).toFixed(1) + '" y="' + y0 + '" width="' + (X(h.r1) - X(h.r0)).toFixed(1) + '" height="' + (y1 - y0) + '" fill="' + (h.signo < 0 ? '#D5432F' : '#2E72C8') + '" opacity="0.16"/>'; });
    [0, 0.5, 1].forEach(function (t) { var v = mn + (mx - mn) * t; s += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#EEF0F2"/><text x="' + (x0 - 5) + '" y="' + (Y(v) + 3) + '" font-size="10" fill="#8C9196" text-anchor="end">' + fmt(v, 2) + '</text>'; });
    Rs.torres.forEach(function (t, i) { if (t < R) s += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + y0 + '" y2="' + y1 + '" stroke="#B9BEC3" stroke-dasharray="3 4"/><text x="' + X(t) + '" y="' + (y1 + 12) + '" font-size="9" fill="#8C9196" text-anchor="middle">T' + (i + 1) + '</text>'; });
    Rs.pasadas.forEach(function (p, pi) {
      var d = '', abierto = false; p.v.forEach(function (x, i) { var r = (i + 0.5) * PASO; if (x == null || r < 20 || r > R) { abierto = false; return; } d += (abierto ? 'L' : 'M') + X(r).toFixed(1) + ' ' + Y(x).toFixed(1) + ' '; abierto = true; });
      s += '<path d="' + d + '" fill="none" stroke="' + COLS[Math.max(0, COLS.length - Rs.pasadas.length + pi)] + '" stroke-width="' + (pi === Rs.pasadas.length - 1 ? 2.2 : 1.3) + '"/>';
    });
    for (var m = 0; m <= R; m += 100) s += '<text x="' + X(m) + '" y="' + (H - 12) + '" font-size="10" fill="#3A3E41" text-anchor="middle">' + m + ' m</text>';
    return s + '<text x="' + x0 + '" y="' + (H - 1) + '" font-size="9" fill="#8C9196">Distancia al centro del pivot · línea más oscura = pasada más nueva · T = torres (posición aproximada)</text></svg>';
  }
  function html(Rs) {
    var conf = Rs.hallazgos.filter(function (h) { return h.confirmada && !h.huella; }), huellas = Rs.hallazgos.filter(function (h) { return h.huella && h.confirmada; }), sueltas = Rs.hallazgos.filter(function (h) { return !h.confirmada && !h.huella; });
    var h = '<div style="font-size:12px;color:#3A3E41;margin:6px 0;">Pasadas revisadas: ' + Rs.pasadas.map(function (p) { return fmtF(p.fecha) + (p.etapa === 'madurez' ? ' (madurando)' : ''); }).join(' · ') + ' · radio ' + fmt(Rs.geo.radio) + ' m' + (Rs.geo.circular ? '' : ' · <b style="color:#8a5713;">el lote no es un círculo completo (corner o sector): el resultado vale menos hacia afuera</b>') + '</div>' + svg(Rs);
    if (conf.length) h += '<div style="margin-top:8px;">' + conf.map(function (f) {
      var baja = f.signo < 0;
      return '<div style="border-left:4px solid ' + (baja ? '#D5432F' : '#2E72C8') + ';background:#FAFBFC;border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:13px;line-height:1.45;"><b style="color:' + (baja ? '#B5371C' : '#1F4E8C') + ';">Franja de ' + fmt(f.r0) + ' a ' + fmt(f.r1) + ' m del centro' + (f.tramo ? ' (' + f.tramo + ')' : '') + ': vigor ' + fmt(Math.abs(f.relPct), 1) + ' % más ' + (baja ? 'bajo' : 'alto') + ' que sus vecinas</b><div>Se repite en ' + f.pasadas + ' de ' + Rs.pasadas.length + ' pasadas. ' +
        (f.enMadurez ? (baja ? 'Con el cultivo madurando, esa franja <b>se secó antes</b> que el resto: recibió menos agua durante el ciclo. Puede ser un pico tapado, una boquilla más chica o un regulador de presión. ' : 'Con el cultivo madurando, esa franja <b>sigue más verde</b> que el resto: recibió más agua durante el ciclo. Puede ser una boquilla más grande o mal cambiada, o una pérdida en ese punto. ')
          : (baja ? 'Puede ser un grupo de picos tapados o gastados, un regulador de presión o una fuga antes de ese punto. ' : 'Puede ser un grupo de picos que tira de más (boquilla gastada o equivocada) o una pérdida en ese punto. ')) + 'Ir a mirar los picos y reguladores a esa distancia del centro, con la carta de aspersión en la mano.</div></div>';
    }).join('') + '</div>';
    else h += '<div style="border-left:4px solid #22A93A;background:#FAFBFC;border-radius:6px;padding:7px 10px;margin-top:8px;font-size:13px;"><b style="color:#178029;">Sin franjas circulares que se repitan.</b> En estas pasadas el vigor es parejo según la distancia al centro.</div>';
    if (Rs.caidaPuntaPct != null) h += '<div style="border-left:4px solid #B8731A;background:#FAFBFC;border-radius:6px;padding:7px 10px;margin-top:6px;font-size:13px;line-height:1.45;"><b style="color:#8a5713;">El vigor cae hacia la punta: ' + fmt(Math.abs(Rs.caidaPuntaPct), 1) + ' % menos en el último quinto que en el medio.</b><div>Conviene medir la presión en la última torre y revisar el cañón final.</div></div>';
    if (huellas.length) h += '<div class="muted" style="font-size:12px;margin-top:6px;">Franjas finas sobre las torres ' + huellas.map(function (x) { return 'T' + x.huella; }).join(', ') + ': es la huella de las ruedas, no una falla de riego.</div>';
    if (sueltas.length) h += '<div class="muted" style="font-size:12px;margin-top:4px;">Vistas en una sola pasada (no se toman como falla): ' + sueltas.map(function (x) { return fmt(x.r0) + '–' + fmt(x.r1) + ' m'; }).join(', ') + '.</div>';
    h += '<div class="muted" style="font-size:11px;line-height:1.45;margin-top:8px;">Cómo leerlo: cada línea es el vigor promedio de todos los puntos que están a la misma distancia del centro; si el pivot riega parejo, la línea no tiene escalones. Con picos a 2,28 m y 16 a 18 m de mojado, cada punto recibe agua de varios picos: con el cultivo verde, un pico solo casi no se nota. <b>Donde se ve es al madurar</b>: la diferencia de agua de todo el ciclo deja una franja que sigue verde (boquilla más grande) o que se seca antes (pico tapado). Por eso SAFIA revisa sobre todo las pasadas de maduración. Solo aparece cuando el cultivo depende del riego (con lluvia de sobra todo se ve igual), y una loma, un bajo o un cambio de suelo también pueden marcar. Es una alarma para ir a mirar: la confirmación es la prueba de vasos en el campo.</div>';
    return h;
  }

  /* ---------- 6. tarjeta en Banco → Vigor satelital ---------- */
  function loteElegido() {
    var sel = document.getElementById('ndviLote'), B = window.SafiaBanco; if (!sel || !B) return null;
    return B.leer('equipos').find(function (e) { return String(e.id) === String(sel.value); }) || null;
  }
  function montar() {
    var ancla = document.getElementById('ndviCampanas'); if (!ancla || document.getElementById('uniCard')) return;
    var card = document.createElement('div'); card.className = 'card'; card.id = 'uniCard'; card.style.marginTop = '14px';
    card.innerHTML = '<div class="card-h"><h3>Uniformidad del pivot</h3><span class="muted">franjas circulares en el vigor: picos, reguladores o tramos que riegan distinto</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn green" id="uniRevisar">Revisar la uniformidad de este pivot</button><span class="muted" id="uniEstado" style="font-size:12px;"></span></div><div id="uniResultado"></div>';
    var padre = ancla.closest ? ancla.closest('.card') : ancla.parentNode;
    padre.parentNode.insertBefore(card, padre);
    document.getElementById('uniRevisar').addEventListener('click', function () {
      var lote = loteElegido(), est = document.getElementById('uniEstado'), out = document.getElementById('uniResultado'), b = document.getElementById('uniRevisar');
      if (!lote) { est.textContent = 'Elegí un lote arriba.'; return; }
      if (lote.tipo === 'secano') { est.textContent = 'Es un lote de secano: no hay pivot que revisar.'; out.innerHTML = ''; return; }
      b.disabled = true; out.innerHTML = '';
      revisar(lote, function (t) { est.textContent = t; }).then(function (Rs) { est.textContent = ''; out.innerHTML = '<div style="font-weight:700;margin-top:8px;">' + esc(lote.nombre) + '</div>' + html(Rs); })
        .catch(function (e) { est.textContent = 'No se pudo revisar: ' + ((e && e.message) || 'sin conexión') + '.'; })
        .then(function () { b.disabled = false; });
    });
    var sel = document.getElementById('ndviLote'); if (sel) sel.addEventListener('change', function () { document.getElementById('uniResultado').innerHTML = ''; document.getElementById('uniEstado').textContent = ''; });
  }
  window.SafiaUniformidad = { montar: montar, revisar: revisar, elegirPasadas: elegirPasadas, perfil: perfil, franjas: franjas, analizar: analizar, geometria: geometria, torres: torres, html: html, PASO: PASO };
})();
