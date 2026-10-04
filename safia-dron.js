/* SAFIA · Imagen de dron con cámara multiespectral (window.SafiaDron)
   -------------------------------------------------------------------------------------------------
   Banco → Vigor satelital → "Imagen de dron". Se sube el mapa NDVI que exporta el programa del dron (DJI Terra, Pix4D,
   Metashape, WebODM…): un GeoTIFF de UN canal con el NDVI en cada punto. También se acepta el mapa de reflectancia con
   varias bandas: se eligen la banda roja y la infrarroja y SAFIA calcula NDVI = (IRC − Rojo) / (IRC + Rojo).
   Sistemas de coordenadas que lee: WGS 84 en grados (EPSG 4326), UTM WGS 84 norte o sur (326xx / 327xx), SIRGAS 2000 UTM
   (31978–31985) y Web Mercator (3857). El mapa coloreado (3 bandas de 0 a 255) no sirve: no trae los valores.
   El archivo original NO se sube (puede pesar cientos de MB): se guarda lo procesado, la imagen recortada al pivot y los
   números, en el depósito de archivos del campo (carpeta dron) y en la lista de Archivos del Banco.
   Uniformidad: con el detalle del dron el perfil por distancia al centro se arma cada metro (el satélite, cada 5 m).
   Se marcan los anillos con vigor 6 % o más por debajo de su entorno (±20 m), de 2 m de ancho o más. Es un criterio de
   SAFIA para orientar la recorrida, no una medición del riego: hay que ir a mirar los picos de ese tramo. */
(function () {
  'use strict';
  var GEOTIFF_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js';
  var MAX_LADO = 1400, CAIDA = 0.06, VENT = 20, PROPIO = 3, ANCHO_MIN = 2, R_DESDE = 25;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n, d) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function fmtF(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function mediana(l) { if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function cuantil(s, q) { return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : null; }

  /* ---------- librería GeoTIFF: se carga solo cuando se usa ---------- */
  var cargando = null;
  function libreria() {
    if (window.GeoTIFF) return Promise.resolve(window.GeoTIFF);
    if (cargando) return cargando;
    cargando = new Promise(function (ok, mal) { var s = document.createElement('script'); s.src = GEOTIFF_URL; s.onload = function () { window.GeoTIFF ? ok(window.GeoTIFF) : mal(new Error('no se pudo cargar el lector de GeoTIFF')); }; s.onerror = function () { cargando = null; mal(new Error('sin conexión para cargar el lector de GeoTIFF')); }; document.head.appendChild(s); });
    return cargando;
  }

  /* ---------- proyecciones: de grados a las coordenadas del archivo ---------- */
  // UTM directa (Snyder, elipsoide WGS 84; SIRGAS 2000 difiere en centímetros)
  function utm(lat, lon, zona, sur) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), rad = Math.PI / 180;
    var la = lat * rad, lo0 = ((zona - 1) * 6 - 180 + 3) * rad, N = a / Math.sqrt(1 - e2 * Math.sin(la) * Math.sin(la));
    var T = Math.tan(la) * Math.tan(la), C = ep2 * Math.cos(la) * Math.cos(la), A = Math.cos(la) * (lon * rad - lo0);
    var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * la - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * la) + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * la) - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * la));
    var x = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
    var y = k0 * (M + N * Math.tan(la) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
    return [x, sur ? y + 10000000 : y];
  }
  function proyeccion(claves) {
    var p = claves.ProjectedCSTypeGeoKey, g = claves.GeographicTypeGeoKey, mod = claves.GTModelTypeGeoKey;
    if (p >= 32601 && p <= 32660) return { nombre: 'WGS 84 / UTM ' + (p - 32600) + 'N', metros: true, a: function (la, lo) { return utm(la, lo, p - 32600, false); } };
    if (p >= 32701 && p <= 32760) return { nombre: 'WGS 84 / UTM ' + (p - 32700) + 'S', metros: true, a: function (la, lo) { return utm(la, lo, p - 32700, true); } };
    if (p >= 31978 && p <= 31985) return { nombre: 'SIRGAS 2000 / UTM ' + (p - 31960) + 'S', metros: true, a: function (la, lo) { return utm(la, lo, p - 31960, true); } };
    if (p === 3857 || p === 900913) return { nombre: 'Web Mercator', metros: true, a: function (la, lo) { var R = 6378137; return [lo * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)) * R]; }, merc: true };
    if ((!p || p === 32767) && (mod === 2 || g === 4326 || g === 4674 || !mod)) return { nombre: g === 4674 ? 'SIRGAS 2000 (grados)' : 'WGS 84 (grados)', metros: false, a: function (la, lo) { return [lo, la]; } };
    return null;
  }

  /* ---------- geometría del pivot (la misma de la uniformidad) ---------- */
  function geo(equipo) { return window.SafiaUniformidad ? SafiaUniformidad.geometria(equipo) : null; }
  function dentro(px, py, anillo) { var c = false; for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) { var xi = anillo[i][0], yi = anillo[i][1], xj = anillo[j][0], yj = anillo[j][1]; if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c; } return c; }

  /* ---------- leer el archivo ---------- */
  // Devuelve { bandas, tipo, ancho, alto, crs } para que la pantalla pregunte las bandas si hace falta
  function inspeccionar(archivo) {
    return libreria().then(function (G) { return G.fromBlob(archivo); }).then(function (tiff) { return tiff.getImage().then(function (img) {
      var fd = img.fileDirectory || {}, bps = (fd.BitsPerSample || [8])[0], fmtM = (fd.SampleFormat || [1])[0], claves = img.getGeoKeys() || {}, P = proyeccion(claves);
      return { tiff: tiff, img: img, bandas: img.getSamplesPerPixel(), bits: bps, flotante: fmtM === 3, ancho: img.getWidth(), alto: img.getHeight(), crs: P, claves: claves, nodata: img.getGDALNoData() };
    }); });
  }
  // op = { rojo, irc } (índices de banda desde 1) cuando el archivo trae reflectancia en varias bandas
  function procesar(info, equipo, op) {
    op = op || {};
    var G = geo(equipo); if (!G) return Promise.reject(new Error('el pivot no tiene polígono cargado (Equipos y lotes)'));
    if (!info.crs) return Promise.reject(new Error('no reconozco el sistema de coordenadas del archivo (código ' + (info.claves.ProjectedCSTypeGeoKey || info.claves.GeographicTypeGeoKey || 'desconocido') + '). Exportalo en WGS 84 o en UTM'));
    if (info.bandas >= 3 && info.bits === 8 && !info.flotante && !op.rojo) return Promise.reject(new Error('el archivo es la imagen coloreada (3 bandas de 0 a 255): no trae los valores. Exportá el NDVI como GeoTIFF de un solo canal (valores de −1 a 1)'));
    if (info.bandas > 1 && !(op.rojo && op.irc)) return Promise.reject(new Error('el archivo tiene ' + info.bandas + ' bandas: elegí cuál es la roja y cuál la infrarroja'));
    if (info.bandas > 1 && op.rojo === op.irc) return Promise.reject(new Error('la banda roja y la infrarroja tienen que ser distintas'));
    var img = info.img, o = img.getOrigin(), res = img.getResolution(), anillo = equipo.poligono.partes[0][0].map(function (q) { return info.crs.a(q[0], q[1]); });
    var xs = anillo.map(function (p) { return p[0]; }), ys = anillo.map(function (p) { return p[1]; });
    var x0 = Math.floor((Math.min.apply(null, xs) - o[0]) / res[0]), x1 = Math.ceil((Math.max.apply(null, xs) - o[0]) / res[0]);
    var yA = Math.floor((Math.max.apply(null, ys) - o[1]) / res[1]), yB = Math.ceil((Math.min.apply(null, ys) - o[1]) / res[1]);   // res[1] es negativa
    var w0 = Math.max(0, Math.min(x0, x1)), w1 = Math.min(info.ancho, Math.max(x0, x1)), h0 = Math.max(0, Math.min(yA, yB)), h1 = Math.min(info.alto, Math.max(yA, yB));
    if (w1 - w0 < 4 || h1 - h0 < 4) return Promise.reject(new Error('la imagen no cubre este pivot: revisá que sea del lote elegido'));
    var esc0 = Math.max(1, Math.max(w1 - w0, h1 - h0) / MAX_LADO), W = Math.round((w1 - w0) / esc0), H = Math.round((h1 - h0) / esc0);
    var muestras = info.bandas > 1 ? [op.rojo - 1, op.irc - 1] : [0];
    return img.readRasters({ window: [w0, h0, w1, h1], width: W, height: H, samples: muestras, resampleMethod: 'nearest' }).then(function (r) {
      var v = new Float32Array(W * H), nd = info.nodata, rojo = r[0], irc = r[1];
      for (var i = 0; i < W * H; i++) {
        var x;
        if (irc) { var a = +rojo[i], b = +irc[i]; x = a + b > 0 ? (b - a) / (b + a) : NaN; if (nd != null && (a === nd || b === nd)) x = NaN; }
        else { x = +rojo[i]; if (nd != null && x === nd) x = NaN; }
        v[i] = isFinite(x) && x >= -1 && x <= 1 ? x : NaN;
      }
      // tamaño real del píxel analizado, en metros
      var pxX = Math.abs(res[0]) * esc0, pxY = Math.abs(res[1]) * esc0, mX = info.crs.metros ? pxX : pxX * 111320 * G.k, mY = info.crs.metros ? pxY : pxY * 111320;
      if (info.crs.merc) { mX *= G.k; mY *= G.k; }
      var cen = info.crs.a(G.centro.lat, G.centro.lon), oX = o[0] + w0 * res[0], oY = o[1] + h0 * res[1], factX = info.crs.metros ? (info.crs.merc ? G.k : 1) : 111320 * G.k, factY = info.crs.metros ? (info.crs.merc ? G.k : 1) : 111320;
      var paso = Math.max(1, Math.round(Math.max(mX, mY) * 2)), nb = Math.ceil(G.radio / paso) + 2, suma = new Float64Array(nb), cnt = new Uint32Array(nb), todos = [], enLote = 0, conDato = 0, mascara = new Uint8Array(W * H);
      for (var y = 0; y < H; y++) for (var xx = 0; xx < W; xx++) {
        var k = y * W + xx, X = oX + (xx + 0.5) * pxX * (res[0] > 0 ? 1 : -1), Y = oY + (y + 0.5) * pxY * (res[1] > 0 ? 1 : -1);
        if (!dentro(X, Y, anillo)) continue;
        enLote++; mascara[k] = 1; if (isNaN(v[k])) continue;
        conDato++; todos.push(v[k]);
        var d = Math.sqrt(Math.pow((X - cen[0]) * factX, 2) + Math.pow((Y - cen[1]) * factY, 2)), bi = Math.floor(d / paso);
        if (bi < nb) { suma[bi] += v[k]; cnt[bi]++; }
      }
      if (conDato < 50) throw new Error('la imagen casi no tiene datos dentro del pivot');
      todos.sort(function (a, b) { return a - b; });
      var perfil = []; for (var i2 = 0; i2 < nb; i2++) perfil.push(cnt[i2] >= 8 ? Math.round(suma[i2] / cnt[i2] * 1000) / 1000 : null);
      var est = { media: todos.reduce(function (s, x) { return s + x; }, 0) / todos.length, p10: cuantil(todos, 0.1), p50: cuantil(todos, 0.5), p90: cuantil(todos, 0.9), p5: cuantil(todos, 0.05), p95: cuantil(todos, 0.95), cobertura: Math.round(conDato / enLote * 100) };
      est.bajoPct = Math.round(todos.filter(function (x) { return x < est.p50 - 0.1; }).length / todos.length * 100);
      return { ancho: W, alto: H, v: v, mascara: mascara, pixelCm: Math.round(Math.max(mX, mY) * 100), pixelOrigCm: Math.round((info.crs.metros ? Math.abs(res[0]) * (info.crs.merc ? G.k : 1) : Math.abs(res[0]) * 111320 * G.k) * 100), paso: paso, perfil: perfil, est: est, radio: G.radio, crs: info.crs.nombre, anillos: anillos(perfil, paso, G.radio), torres: window.SafiaUniformidad ? SafiaUniformidad.torres(equipo, G.radio) : [] };
    });
  }
  // Anillos con vigor 6 % o más por debajo de su entorno: criterio de SAFIA para orientar la recorrida
  function anillos(p, paso, R) {
    var bajo = p.map(function (x, i) {
      var r = (i + 0.5) * paso; if (x == null || r < R_DESDE || r > R - 10) return null;
      var vec = []; for (var j = 0; j < p.length; j++) { var d = Math.abs(j - i) * paso; if (p[j] != null && d > PROPIO && d <= VENT) vec.push(p[j]); }
      var m = mediana(vec); return m && m > 0.2 ? { r: r, x: x, m: m, rel: (x - m) / m } : null;
    });
    var out = [], act = null;
    bajo.forEach(function (b, i) {
      if (b && b.rel <= -CAIDA) { if (!act) act = { r0: b.r - paso / 2, peor: b.rel, n: 0, s: 0 }; act.r1 = b.r + paso / 2; act.peor = Math.min(act.peor, b.rel); act.n++; act.s += b.rel; }
      else if (act) { if (act.r1 - act.r0 >= ANCHO_MIN) out.push(act); act = null; }
    });
    if (act && act.r1 - act.r0 >= ANCHO_MIN) out.push(act);
    return out.map(function (a) { return { desde: Math.round(a.r0), hasta: Math.round(a.r1), caidaPct: Math.round(-a.s / a.n * 100), peorPct: Math.round(-a.peor * 100) }; }).sort(function (a, b) { return b.caidaPct - a.caidaPct; }).slice(0, 8);
  }

  /* ---------- dibujo ---------- */
  var RAMPA = [[0, [140, 90, 43]], [0.25, [196, 160, 80]], [0.45, [230, 220, 110]], [0.6, [150, 200, 90]], [0.75, [60, 160, 60]], [0.9, [20, 100, 40]]];
  function color(x) { for (var i = 1; i < RAMPA.length; i++) if (x <= RAMPA[i][0]) { var a = RAMPA[i - 1], b = RAMPA[i], t = (x - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * Math.max(0, t)); }); } return RAMPA[RAMPA.length - 1][1]; }
  function lienzo(R, contraste) {
    var c = document.createElement('canvas'); c.width = R.ancho; c.height = R.alto; var cx = c.getContext('2d'), im = cx.createImageData(R.ancho, R.alto), lo = R.est.p5, hi = R.est.p95;
    for (var i = 0; i < R.ancho * R.alto; i++) {
      var o = i * 4; if (!R.mascara[i] || isNaN(R.v[i])) { im.data[o + 3] = 0; continue; }
      var x = contraste ? 0.15 + 0.75 * Math.max(0, Math.min(1, (R.v[i] - lo) / Math.max(0.02, hi - lo))) : R.v[i], col = color(x);
      im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255;
    }
    cx.putImageData(im, 0, 0); return c;
  }
  function svgPerfil(R) {
    var W = 720, H = 220, x0 = 44, x1 = W - 10, y0 = 12, y1 = H - 34, vals = R.perfil.filter(function (x) { return x != null; }), lo = Math.max(0, Math.min.apply(null, vals) - 0.03), hi = Math.min(1, Math.max.apply(null, vals) + 0.03);
    var X = function (r) { return x0 + r / R.radio * (x1 - x0); }, Y = function (v) { return y1 - (v - lo) / Math.max(0.05, hi - lo) * (y1 - y0); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;" role="img" aria-label="Vigor por distancia al centro">';
    R.anillos.forEach(function (a) { s += '<rect x="' + X(a.desde).toFixed(1) + '" y="' + y0 + '" width="' + Math.max(2, X(a.hasta) - X(a.desde)).toFixed(1) + '" height="' + (y1 - y0) + '" fill="#FBECEA"/>'; });
    R.torres.forEach(function (t, i) { s += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + y0 + '" y2="' + y1 + '" stroke="#D5D9DD" stroke-dasharray="3 3"/><text x="' + X(t) + '" y="' + (y1 + 12) + '" font-size="9" fill="#8C9196" text-anchor="middle">T' + (i + 1) + '</text>'; });
    var d = '', ab = false; R.perfil.forEach(function (x, i) { var r = (i + 0.5) * R.paso; if (x == null || r > R.radio) { ab = false; return; } d += (ab ? 'L' : 'M') + X(r).toFixed(1) + ' ' + Y(x).toFixed(1); ab = true; });
    s += '<path d="' + d + '" fill="none" stroke="#178029" stroke-width="1.6"/>';
    [lo, (lo + hi) / 2, hi].forEach(function (v) { s += '<text x="' + (x0 - 6) + '" y="' + (Y(v) + 3) + '" font-size="10" fill="#8C9196" text-anchor="end">' + fmt(v, 2) + '</text>'; });
    s += '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 4) + '" font-size="10.5" fill="#6B7075" text-anchor="middle">distancia al centro del pivot (m) · 0 a ' + fmt(R.radio) + ' m</text></svg>';
    return s;
  }
  function tramo(r, ts) { if (!ts.length) return ''; var t = 1; ts.forEach(function (x) { if (r > x) t++; }); return t > ts.length ? 'voladizo final' : 'tramo ' + t + ' (entre la torre ' + (t - 1 || 'central') + ' y la ' + t + ')'; }
  function htmlResultado(R, meta) {
    var e = R.est, k = function (v, t) { return '<div style="flex:1;min-width:120px;background:#F7F8F9;border-radius:10px;padding:9px 11px;"><div style="font-size:18px;font-weight:800;color:#2E3236;">' + v + '</div><div style="font-size:11.5px;color:#6B7075;">' + t + '</div></div>'; };
    var h = '<div style="font-weight:800;margin-top:10px;">' + esc(meta.pivot) + ' · vuelo del ' + fmtF(meta.fecha) + '</div>' +
      '<div class="muted" style="font-size:12px;margin:2px 0 8px;">Detalle del archivo: ' + fmt(R.pixelOrigCm) + ' cm por punto (analizado a ' + fmt(R.pixelCm) + ' cm) · ' + esc(R.crs) + ' · cubre el ' + e.cobertura + ' % del pivot</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + k(fmt(e.media, 2), 'NDVI promedio') + k(fmt(e.p10, 2) + ' – ' + fmt(e.p90, 2), 'del 10 % más bajo al 10 % más alto') + k(e.bajoPct + ' %', 'del pivot con vigor 0,10 o más por debajo de lo normal del lote') + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12.5px;"><label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" id="dronContraste" checked> Resaltar diferencias</label><span class="muted">verde oscuro = más vigor · marrón = menos</span></div>' +
      '<div id="dronImagen" style="margin-top:6px;background:#F1F3F4;border-radius:8px;padding:6px;text-align:center;"></div>' +
      '<div style="font-weight:700;margin-top:12px;">Vigor por distancia al centro (cada ' + R.paso + ' m)</div>' + svgPerfil(R);
    if (R.anillos.length) h += '<div style="margin-top:8px;font-weight:700;color:#B5371C;">Anillos con menos vigor que su entorno</div>' + R.anillos.map(function (a) { return '<div style="font-size:13.5px;padding:5px 0;border-top:1px solid #F0F2F4;"><b>De ' + a.desde + ' a ' + a.hasta + ' m del centro</b>' + (R.torres.length ? ' · ' + tramo((a.desde + a.hasta) / 2, R.torres) : '') + ': ' + a.caidaPct + ' % menos vigor (hasta ' + a.peorPct + ' %). Revisar los picos y reguladores de ese tramo.</div>'; }).join('');
    else h += '<div style="margin-top:8px;font-size:13.5px;color:#178029;font-weight:600;">No aparecen anillos marcados: el vigor es parejo a lo largo del pivot.</div>';
    return h + '<div class="muted" style="font-size:11.5px;margin-top:8px;line-height:1.45;">El anillo es un tramo de 2 m o más con 6 % o menos vigor que lo que lo rodea (±20 m). Es un criterio de SAFIA para saber dónde ir a mirar, no una medición del riego: una mancha de suelo, una huella de máquina o una falla de siembra también bajan el vigor. Se ve mejor con el cultivo cerrado y al empezar a madurar.</div>';
  }

  /* ---------- guardar y volver a ver ---------- */
  function guardar(equipo, campoId, meta, R, canvas) {
    var sb = window.safiaSupabase; if (!sb) return Promise.reject(new Error('sin conexión'));
    var base = 'campo_' + campoId + '/dron/eq' + equipo.id + '_' + meta.fecha + '_' + Date.now(), datos = { equipoId: equipo.id, pivot: meta.pivot, fecha: meta.fecha, archivo: meta.archivo, est: R.est, perfil: R.perfil, paso: R.paso, radio: R.radio, anillos: R.anillos, torres: R.torres, pixelCm: R.pixelCm, pixelOrigCm: R.pixelOrigCm, crs: R.crs };
    return new Promise(function (ok) { canvas.toBlob(ok, 'image/png'); }).then(function (png) {
      return sb.storage.from('safia').upload(base + '.png', png, { contentType: 'image/png' }).then(function (r) { if (r.error) throw r.error; return sb.storage.from('safia').upload(base + '.json', new Blob([JSON.stringify(datos)], { type: 'application/json' }), { contentType: 'application/json' }); })
        .then(function (r) { if (r.error) throw r.error; return sb.from('safia_archivos').insert([{ campo_id: String(campoId), tipo: 'dron', nombre: 'Dron NDVI · ' + meta.pivot + ' · ' + fmtF(meta.fecha), ruta: base + '.json', tamano: JSON.stringify(datos).length }, { campo_id: String(campoId), tipo: 'dron', nombre: 'Dron NDVI (imagen) · ' + meta.pivot + ' · ' + fmtF(meta.fecha), ruta: base + '.png', tamano: png.size }]); })
        .then(function (r) { if (r.error) throw r.error; return true; });
    });
  }
  function vuelos(equipo, campoId) {
    var sb = window.safiaSupabase; if (!sb) return Promise.resolve([]);
    return sb.from('safia_archivos').select('id,nombre,ruta,subido_en').eq('campo_id', String(campoId)).eq('tipo', 'dron').like('ruta', '%/dron/eq' + equipo.id + '_%.json').order('ruta', { ascending: false }).then(function (r) { return r.error ? [] : (r.data || []); });
  }
  function abrirVuelo(ruta) {
    var sb = window.safiaSupabase;
    return Promise.all([sb.storage.from('safia').createSignedUrl(ruta, 3600), sb.storage.from('safia').createSignedUrl(ruta.replace(/\.json$/, '.png'), 3600)]).then(function (u) {
      if (!u[0].data) throw new Error('no se pudo abrir');
      return fetch(u[0].data.signedUrl).then(function (r) { return r.json(); }).then(function (d) { d.png = u[1].data ? u[1].data.signedUrl : null; return d; });
    });
  }

  /* ---------- tarjeta en Banco → Vigor satelital ---------- */
  function montar(op) {
    var ancla = document.getElementById('uniCard') || (document.getElementById('ndviCampanas') && document.getElementById('ndviCampanas').closest('.card'));
    if (!ancla || document.getElementById('dronCard')) return;
    var card = document.createElement('div'); card.className = 'card'; card.id = 'dronCard'; card.style.marginTop = '14px';
    card.innerHTML = '<div class="card-h"><h3>Imagen de dron</h3><span class="muted">NDVI con detalle de centímetros, de un dron con cámara multiespectral</span></div>' +
      '<div class="muted" style="font-size:12.5px;line-height:1.45;margin-bottom:8px;">Subí el mapa <b>NDVI</b> que exporta el programa del dron, como <b>GeoTIFF</b> (archivo .tif). Si exportaste la reflectancia con varias bandas, SAFIA te pregunta cuál es la roja y cuál la infrarroja. El mapa coloreado no sirve: no trae los valores.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;"><div class="field"><label>Fecha del vuelo</label><input type="date" id="dronFecha" value="' + hoy() + '" max="' + hoy() + '"></div>' +
      '<div class="field" style="flex:1;min-width:200px;"><label>Archivo GeoTIFF</label><input type="file" id="dronArchivo" accept=".tif,.tiff,image/tiff"></div>' +
      '<div class="field"><button class="btn green" id="dronProcesar">Procesar</button></div></div>' +
      '<div id="dronBandas" style="display:none;margin-top:8px;"></div><div id="dronEstado" class="muted" style="font-size:12.5px;margin-top:6px;"></div><div id="dronResultado"></div>' +
      '<div id="dronVuelos" style="margin-top:12px;"></div>';
    ancla.parentNode.insertBefore(card, ancla.nextSibling);
    var $ = function (id) { return document.getElementById(id); }, info = null, actual = null;
    var est = function (t, mal) { $('dronEstado').innerHTML = t ? '<span style="color:' + (mal ? '#B5371C' : '#6B7075') + ';">' + esc(t) + '</span>' : ''; };
    function loteYcampo() { var l = op.lote(); return l ? { lote: l, campoId: l.campoId } : null; }
    function pintarImagen() { if (!actual) return; var cont = $('dronImagen'); if (!cont) return; var c = lienzo(actual.R, $('dronContraste').checked); c.style.cssText = 'max-width:100%;height:auto;image-rendering:pixelated;'; cont.innerHTML = ''; cont.appendChild(c); actual.canvas = c; }
    function listarVuelos() {
      var lc = loteYcampo(), caja = $('dronVuelos'); if (!caja) return; if (!lc) { caja.innerHTML = ''; return; }
      vuelos(lc.lote, lc.campoId).then(function (l) {
        caja.innerHTML = l.length ? '<div style="font-weight:700;font-size:13px;">Vuelos guardados de este pivot</div>' + l.map(function (v) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid #F0F2F4;font-size:13px;"><span>' + esc(v.nombre) + '</span><button class="btn" data-dron-ver="' + esc(v.ruta) + '" style="padding:4px 10px;font-size:12px;">Ver</button></div>'; }).join('') : '';
      });
    }
    $('dronArchivo').addEventListener('change', function () { info = null; $('dronBandas').style.display = 'none'; est(''); });
    $('dronProcesar').addEventListener('click', function () {
      var lc = loteYcampo(), f = ($('dronArchivo').files || [])[0], b = this;
      if (!lc) return est('Elegí el lote arriba.', true);
      if (!f) return est('Elegí el archivo GeoTIFF del vuelo.', true);
      b.disabled = true; est('Leyendo el archivo (' + fmt(f.size / 1048576, 1) + ' MB)…'); $('dronResultado').innerHTML = '';
      var bandas = info && info.bandas > 1 ? { rojo: +$('dronRojo').value, irc: +$('dronIrc').value } : null;
      (info ? Promise.resolve(info) : inspeccionar(f)).then(function (i) {
        info = i;
        if (i.bandas > 1 && !(i.bandas >= 3 && i.bits === 8 && !i.flotante) && !bandas) {
          var opts = ''; for (var n = 1; n <= i.bandas; n++) opts += '<option value="' + n + '">Banda ' + n + '</option>';
          $('dronBandas').innerHTML = '<div class="muted" style="font-size:12.5px;margin-bottom:4px;">El archivo trae ' + i.bandas + ' bandas. Elegí cuál es cada una (la roja suele ser la 3 y la infrarroja la última) y tocá Procesar otra vez.</div><div style="display:flex;gap:8px;flex-wrap:wrap;"><div class="field"><label>Banda roja</label><select id="dronRojo">' + opts + '</select></div><div class="field"><label>Banda infrarroja</label><select id="dronIrc">' + opts + '</select></div></div>';
          $('dronRojo').value = String(i.bandas >= 3 ? 3 : 1); $('dronIrc').value = String(i.bandas); $('dronBandas').style.display = 'block';
          est('Elegí las bandas y tocá Procesar.'); return null;
        }
        est('Recortando el pivot y armando el perfil…');
        return procesar(i, lc.lote, bandas || {}).then(function (R) {
          actual = { R: R, meta: { pivot: lc.lote.nombre, fecha: $('dronFecha').value || hoy(), archivo: f.name }, lote: lc.lote, campoId: lc.campoId };
          $('dronResultado').innerHTML = htmlResultado(R, actual.meta) + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;"><button class="btn green" id="dronGuardar">Guardar este vuelo</button><span class="muted" style="font-size:12px;">Se guarda lo procesado (no el archivo original)</span></div>';
          pintarImagen(); $('dronContraste').addEventListener('change', pintarImagen);
          $('dronGuardar').addEventListener('click', function () { var g = this; g.disabled = true; g.textContent = 'Guardando…'; guardar(actual.lote, actual.campoId, actual.meta, actual.R, actual.canvas).then(function () { g.textContent = 'Guardado'; listarVuelos(); }, function (e) { g.disabled = false; g.textContent = 'Guardar este vuelo'; est('No se pudo guardar: ' + (/row-level|policy|Unauthorized/i.test(e.message || '') ? 'tu usuario no puede subir archivos a este campo' : (e.message || 'sin conexión')), true); }); });
          est('');
        });
      }).catch(function (e) { est('No se pudo procesar: ' + ((e && e.message) || 'archivo no válido') + '.', true); }).then(function () { b.disabled = false; });
    });
    card.addEventListener('click', function (ev) {
      var r = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-dron-ver'); if (!r) return;
      est('Abriendo el vuelo guardado…');
      abrirVuelo(r).then(function (d) {
        var R = { est: d.est, perfil: d.perfil, paso: d.paso, radio: d.radio, anillos: d.anillos || [], torres: d.torres || [], pixelCm: d.pixelCm, pixelOrigCm: d.pixelOrigCm, crs: d.crs };
        $('dronResultado').innerHTML = htmlResultado(R, { pivot: d.pivot, fecha: d.fecha }).replace(/<div style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12.5px;">[\s\S]*?<\/div>/, '');
        $('dronImagen').innerHTML = d.png ? '<img src="' + esc(d.png) + '" alt="NDVI del dron" style="max-width:100%;height:auto;image-rendering:pixelated;">' : '';
        est('');
      }, function () { est('No se pudo abrir ese vuelo.', true); });
    });
    var sel = document.getElementById('ndviLote'); if (sel) sel.addEventListener('change', function () { $('dronResultado').innerHTML = ''; est(''); info = null; listarVuelos(); });
    listarVuelos();
  }
  window.SafiaDron = { montar: montar, inspeccionar: inspeccionar, procesar: procesar, anillos: anillos, utm: utm, proyeccion: proyeccion, libreria: libreria };
})();
