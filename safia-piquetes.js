/* SAFIA — Piquetes del pivot: modelo de división, vigor satelital por piquete y riego separado del pastoreo
   -------------------------------------------------------------------
   - Un pivot con pastura se divide en piquetes según el alambrado real del cliente. Modelos:
       · pizza    porciones desde el centro (Manual de pastura irrigada, Irrigar 2025, 5.1)
       · anillos  sectores cruzados con uno o más alambrados internos (2 o 3 anillos). Ejemplo: el modelo
                  de Irrigar de 32 potreros = 16 sectores adentro (1–16) + 16 afuera (17–32), con el
                  alambrado interno recto cada dos potreros (octógono, bebederos en los vértices).
     La configuración vive en el equipo (Equipos y lotes → Datos técnicos, la carga Irrigar):
       piqModelo ('pizza' | 'anillos'), piqSectores ("16, 16" de adentro hacia afuera), piqRadios ("67" = el
       alambrado interno al 67 % del radio; vacío = todos los piquetes con la misma superficie), piqBorde
       ('circulo' | 'recto' = recto entre divisorias | 'recto2' = recto cada dos potreros), piqNumeracion
       ('adentro' | 'afuera'), piqSentido ('horario' | 'antihorario') y piquete1Angulo (grados desde el norte).
     Sin configuración: pizza con la cantidad de piquetes de la campaña.
   - Vigor por piquete: una sola imagen Sentinel-2 del pivot (edge safia-ndvi, capa 'valores': NDVI en el canal
     rojo) y SAFIA promedia los píxeles que caen en cada piquete. Nubes excluidas (píxel transparente).
   - Calibración: lectura de altura con regla a ±3 días de una pasada = par (NDVI, cm). Con 3 pares o más,
     estima la altura de los piquetes sin lectura por regresión lineal y avisa "a punto" por satélite.
   - Riego y pastoreo separados (Manual Irrigar 9.1): no regar el piquete ocupado ni los 3 siguientes; SAFIA
     da los grados a saltar en el pivot (con anillos, ese tramo deja sin riego a todo el radio).
   Depende de window.SafiaPasturas (eventos, alturas) y window.safiaSupabase (edge). */
(function () {
  'use strict';
  function leerObj(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function guardarObj(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = v == null || v === '' ? NaN : parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function sumarDias(f, n) { var d = new Date(String(f).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000); }
  function fmtF(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  function mod(a, m) { return ((a % m) + m) % m; }
  function listaNum(t) { return String(t == null ? '' : t).split(/[;,\/\s]+/).map(function (x) { return parseFloat(String(x).replace(',', '.')); }).filter(function (x) { return !isNaN(x); }); }
  var M_LAT = 111320, RAD = Math.PI / 180;

  /* ---------- geometría: centro y radio del pivot ---------- */
  function centroRadio(equipo) {
    var pg = equipo && equipo.poligono; if (!pg || !pg.centro || !pg.partes) return null;
    var lat0 = num(pg.centro.lat), lon0 = num(pg.centro.lon); if (lat0 == null || lon0 == null) return null;
    var kLon = M_LAT * Math.cos(lat0 * RAD), ds = [];
    pg.partes.forEach(function (anillos) { (anillos[0] || []).forEach(function (p) { var dy = (p[0] - lat0) * M_LAT, dx = (p[1] - lon0) * kLon; ds.push(Math.sqrt(dx * dx + dy * dy)); }); });
    if (!ds.length) return null;
    ds.sort(function (a, b) { return a - b; });
    var r = ds[Math.floor(ds.length * 0.9)];   // el radio del pivot: los vértices más lejanos (deja afuera esquinas de un polígono dibujado a mano)
    return { lat: lat0, lon: lon0, kLon: kLon, radio: r };
  }

  /* ---------- modelo de piquetes del equipo ---------- */
  // Devuelve { modelo, n (total), anguloInicio, span, sentido (+1 horario, -1 antihorario), borde, numeracion,
  //            anillos: [{ n, paso, f0, f1 }] de adentro hacia afuera (f = fracción del radio en el vértice del alambrado), firma }
  function parametros(equipo, cultivo) {
    var dt = (equipo && equipo.datosTecnicos) || {};
    var a0 = mod(num(dt.piquete1Angulo) || 0, 360), span = num(dt.angulo); if (!(span > 0 && span <= 360)) span = 360;
    var sect = listaNum(dt.piqSectores).map(function (x) { return Math.round(x); }).filter(function (x) { return x >= 1 && x <= 120; });
    var modelo = dt.piqModelo === 'anillos' && sect.length >= 2 ? 'anillos' : 'pizza';
    if (modelo === 'pizza') { var n1 = sect.length === 1 ? sect[0] : (parseInt(cultivo && cultivo.piquetes, 10) || 0); if (n1 < 2) return null; sect = [n1]; }
    else sect = sect.slice(0, 4);
    var total = sect.reduce(function (s, x) { return s + x; }, 0);
    // radios de los alambrados internos: los cargados (% del radio, de adentro hacia afuera y crecientes) o, sin dato, los que dejan todos los piquetes con la misma superficie
    var rad = listaNum(dt.piqRadios).map(function (x) { return x > 1.5 ? x / 100 : x; }).filter(function (x) { return x > 0.05 && x < 0.98; });
    var cargados = rad.length === sect.length - 1 && rad.every(function (x, i) { return i === 0 || x > rad[i - 1]; });
    var borde = modelo === 'anillos' && (dt.piqBorde === 'recto' || dt.piqBorde === 'recto2') ? dt.piqBorde : 'circulo';
    var f = [], acum = 0;
    for (var j = 0; j < sect.length - 1; j++) {
      acum += sect[j];
      // misma superficie: con alambrado recto el vértice va un poco más afuera que el círculo equivalente (área del polígono = área del círculo)
      var lado = (borde === 'recto2' ? 2 : 1) * (span / sect[j]) * RAD, corr = borde !== 'circulo' && lado < 2.09 ? Math.sqrt(lado / Math.sin(lado)) : 1;
      f.push(cargados ? rad[j] : Math.min(0.97, Math.sqrt(acum / total) * corr));
    }
    var anillos = sect.map(function (n, i) { return { n: n, paso: span / n, f0: i === 0 ? 0 : f[i - 1], f1: i === sect.length - 1 ? 1 : f[i] }; });
    var p = { modelo: modelo, n: total, anguloInicio: a0, span: span, sentido: dt.piqSentido === 'antihorario' ? -1 : 1, borde: borde,
      numeracion: modelo === 'anillos' && dt.piqNumeracion === 'afuera' ? 'afuera' : 'adentro', anillos: anillos, paso: span / sect[0] };
    p.firma = [p.modelo, sect.join('+'), f.map(function (x) { return Math.round(x * 1000); }).join('+'), p.borde, p.numeracion, p.sentido, a0, span].join('|');
    return p;
  }
  function total(equipo, cultivo) { var p = parametros(equipo, cultivo); return p ? p.n : null; }
  // Radio (fracción del radio del pivot) del alambrado EXTERIOR del anillo j, en el ángulo relativo fi (grados desde el inicio, en el sentido de la numeración)
  function radioBorde(p, j, fi) {
    var an = p.anillos[j]; if (j >= p.anillos.length - 1) return 1;
    if (p.borde === 'circulo') return an.f1;
    var paso = p.borde === 'recto2' ? an.paso * 2 : an.paso, v0 = p.borde === 'recto2' ? an.paso : 0;   // recto2: vértices en la divisoria entre el 1 y el 2, el 3 y el 4…
    if (paso >= 120) return an.f1;   // con menos de 4 lados no hay polígono que valga
    var d = mod(fi - v0, paso) - paso / 2;
    return an.f1 * Math.cos(paso / 2 * RAD) / Math.cos(d * RAD);
  }
  function radioInterior(p, j, fi) { return j === 0 ? 0 : radioBorde(p, j - 1, fi); }
  // número de orden (0-based) del piquete que está en el anillo j, sector i
  function ordenDe(p, j, i) {
    var base = 0, k;
    if (p.numeracion === 'afuera') { for (k = p.anillos.length - 1; k > j; k--) base += p.anillos[k].n; }
    else { for (k = 0; k < j; k++) base += p.anillos[k].n; }
    return base + i;
  }
  function areaHa(p, j, f1, f2, radioM) {
    var pasos = 24, s = 0, d = (f2 - f1) / pasos;
    for (var k = 0; k < pasos; k++) { var fi = f1 + (k + 0.5) * d, ro = radioBorde(p, j, fi), ri = radioInterior(p, j, fi); s += 0.5 * (ro * ro - ri * ri) * d * RAD; }
    return s * radioM * radioM / 10000;
  }
  // ángulo de brújula (grados desde el norte, horario) → [lat, lon] a distancia d del centro
  function punto(c, ang, d) { var t = ang * RAD; return [c.lat + d * Math.cos(t) / M_LAT, c.lon + d * Math.sin(t) / c.kLon]; }
  function brujula(p, fi) { return p.anguloInicio + p.sentido * fi; }
  // Lista de piquetes ordenada por número. Cada uno: { piquete, anillo, i, f1, f2 (relativos), a1, a2 (brújula, en sentido horario), ha, partes }
  function sectores(equipo, cultivo, centroOpcional) {
    var c = centroOpcional || centroRadio(equipo), p = parametros(equipo, cultivo); if (!c || !p) return null;
    var lista = [];
    p.anillos.forEach(function (an, j) {
      for (var i = 0; i < an.n; i++) {
        var f1 = i * an.paso, f2 = f1 + an.paso, b1 = brujula(p, f1), b2 = brujula(p, f2);
        var a1 = mod(p.sentido > 0 ? b1 : b2, 360), a2 = mod(p.sentido > 0 ? b2 : b1, 360) || 360;
        var anillo = [], pasos = Math.max(4, Math.ceil(an.paso / 3)), k, fi;
        for (k = 0; k <= pasos; k++) { fi = f1 + (f2 - f1) * k / pasos; anillo.push(punto(c, brujula(p, fi), c.radio * radioBorde(p, j, fi))); }
        if (j === 0) anillo.push([c.lat, c.lon]);
        else for (k = pasos; k >= 0; k--) { fi = f1 + (f2 - f1) * k / pasos; anillo.push(punto(c, brujula(p, fi), c.radio * radioInterior(p, j, fi))); }
        anillo.push(anillo[0]);
        lista.push({ orden: ordenDe(p, j, i), anillo: j, i: i, f1: f1, f2: f2, a1: a1, a2: a2, ha: Math.round(areaHa(p, j, f1, f2, c.radio) * 100) / 100, partes: [[anillo]] });
      }
    });
    lista.sort(function (x, y) { return x.orden - y.orden; });
    lista.forEach(function (s) { s.piquete = String(s.orden + 1); });
    return { centro: c, param: p, lista: lista };
  }
  // En qué piquete cae un punto: índice en la lista ordenada por número, o -1
  function indicePiquete(c, p, lat, lon) {
    var dy = (lat - c.lat) * M_LAT, dx = (lon - c.lon) * c.kLon, d = Math.sqrt(dx * dx + dy * dy) / c.radio;
    if (d > 1.02 || d < 0.04) return -1;   // fuera del círculo o en el centro (torre, bebederos)
    var ang = Math.atan2(dx, dy) / RAD, fi = mod(p.sentido * (ang - p.anguloInicio), 360);
    if (fi >= p.span) return -1;
    for (var j = 0; j < p.anillos.length; j++) {
      if (d <= radioBorde(p, j, fi) * (j === p.anillos.length - 1 ? 1.02 : 1)) { var an = p.anillos[j]; return ordenDe(p, j, Math.min(an.n - 1, Math.floor(fi / an.paso))); }
    }
    return -1;
  }
  function indiceSector(c, p, lat, lon) { return indicePiquete(c, p, lat, lon); }   // nombre anterior

  /* ---------- vigor por piquete (imagen de valores → promedio por piquete) ---------- */
  function claveSerie(equipoId) { return 'ndvi_piq_' + String(equipoId); }
  function serieGuardada(equipoId) { return leerObj(claveSerie(equipoId)) || { pasadas: [] }; }
  // una pasada guardada sirve si se calculó con el mismo modelo de piquetes (las viejas, sin firma, eran pizza horaria)
  function vale(pas, p) { return !!pas && (pas.firma ? pas.firma === p.firma : (p.modelo === 'pizza' && p.sentido === 1 && pas.n === p.n && pas.a0 === p.anguloInicio)); }
  function pasadasValidas(equipo, cultivo) { var p = parametros(equipo, cultivo); return p ? serieGuardada(equipo.id).pasadas.filter(function (x) { return vale(x, p); }) : []; }
  // fechas con imagen: la serie del lote que guarda la pestaña Vigor satelital del Banco (ndvi_<id>) o, si no hay, la pide a la edge
  function fechasPasadas(equipo, campoId, dias) {
    var local = leerObj('ndvi_' + String(equipo.id));
    var lista = Array.isArray(local) ? local : (local && local.serie) || [];
    var desde = sumarDias(hoy(), -(dias || 45));
    var buenas = lista.filter(function (s) { return s.fecha >= desde && (s.nubes_pct == null || s.nubes_pct < 40) && s.ndvi != null; }).map(function (s) { return s.fecha; });
    if (buenas.length) return Promise.resolve(buenas);
    if (!window.safiaSupabase) return Promise.resolve([]);
    // las pasadas ya calculadas por la pestaña Vigor satelital están en la tabla safia_ndvi: se usan sin volver a pedirlas a Copernicus
    var deTabla = window.safiaSupabase.from ? window.safiaSupabase.from('safia_ndvi').select('fecha,ndvi_media,nubes_pct').eq('equipo_id', String(equipo.id)).gte('fecha', desde).order('fecha').then(function (r) { return (r.data || []).filter(function (s) { return (s.nubes_pct == null || s.nubes_pct < 40) && s.ndvi_media != null; }).map(function (s) { return s.fecha; }); }).catch(function () { return []; }) : Promise.resolve([]);
    return deTabla.then(function (ft) { if (ft.length) return ft; return window.safiaSupabase.functions.invoke('safia-ndvi', { body: { equipoId: String(equipo.id), campoId: campoId != null ? String(campoId) : null, partes: equipo.poligono.partes, desde: desde, hasta: hoy() } })
      .then(function (r) { var d = r && r.data; var serie = (d && (d.serie || d.datos || d.filas)) || []; return serie.filter(function (s) { return (s.nubes_pct == null || s.nubes_pct < 40) && (s.ndvi != null || s.ndvi_media != null); }).map(function (s) { return s.fecha; }); })
      .catch(function () { return []; }); });
  }
  function decodificarPng(b64) {
    return new Promise(function (ok, no) {
      var img = new Image();
      img.onload = function () { var cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); ok({ datos: cx.getImageData(0, 0, img.width, img.height).data, ancho: img.width, alto: img.height }); };
      img.onerror = function () { no(new Error('imagen ilegible')); };
      img.src = 'data:image/png;base64,' + b64;
    });
  }
  // Promedia una imagen de valores por piquete (separado para poder probarlo sin el satélite)
  function promediarImagen(g, im, bounds) {
    var latN = bounds[1][0], latS = bounds[0][0], lonO = bounds[0][1], lonE = bounds[1][1], N = g.param.n;
    var suma = [], cnt = [], nub = [], i;
    for (i = 0; i < N; i++) { suma.push(0); cnt.push(0); nub.push(0); }
    for (var y = 0; y < im.alto; y++) {
      var lat = latN - (y + 0.5) / im.alto * (latN - latS);
      for (var x = 0; x < im.ancho; x++) {
        var lon = lonO + (x + 0.5) / im.ancho * (lonE - lonO), k = indicePiquete(g.centro, g.param, lat, lon); if (k < 0) continue;
        var o = (y * im.ancho + x) * 4, a = im.datos[o + 3];
        if (a === 0) continue;                     // fuera del polígono
        if (a < 255) { nub[k]++; continue; }        // nube
        suma[k] += im.datos[o] / 127.5 - 1; cnt[k]++;
      }
    }
    var por = {};
    for (i = 0; i < N; i++) { var tot = cnt[i] + nub[i]; por[String(i + 1)] = cnt[i] >= 5 ? { ndvi: Math.round(suma[i] / cnt[i] * 1000) / 1000, pixeles: cnt[i], nubes_pct: tot ? Math.round(nub[i] / tot * 100) : 0 } : null; }
    return por;
  }
  function vigorEnFecha(equipo, cultivo, fecha) {
    var g = sectores(equipo, cultivo); if (!g) return Promise.resolve(null);
    var guard = serieGuardada(equipo.id), ya = guard.pasadas.find(function (p) { return p.fecha === fecha && vale(p, g.param); });
    if (ya) return Promise.resolve(ya);
    if (!window.safiaSupabase) return Promise.resolve(null);
    return window.safiaSupabase.functions.invoke('safia-ndvi', { body: { tipo: 'imagen', capa: 'valores', equipoId: String(equipo.id), partes: equipo.poligono.partes, fecha: fecha, ancho: 500 } }).then(function (r) {
      var d = r && r.data; if (!d || !d.png) throw new Error((d && d.error) || 'sin imagen');
      return decodificarPng(d.png).then(function (im) {
        var pasada = { fecha: fecha, n: g.param.n, a0: g.param.anguloInicio, firma: g.param.firma, por: promediarImagen(g, im, d.bounds) };
        var actual = serieGuardada(equipo.id);
        // al cambiar el modelo de piquetes, las pasadas calculadas con el anterior se descartan
        actual.pasadas = actual.pasadas.filter(function (p) { return p.fecha !== fecha && vale(p, g.param); }).concat([pasada]).sort(function (p, q) { return p.fecha.localeCompare(q.fecha); }).slice(-12);
        guardarObj(claveSerie(equipo.id), actual);
        return pasada;
      });
    });
  }
  // últimas pasadas (máx. 3 fechas nuevas por vez, para no demorar) → { pasadas, ultima }
  function actualizar(equipo, cultivo, campoId) {
    return fechasPasadas(equipo, campoId, 45).then(function (fechas) {
      var validas = pasadasValidas(equipo, cultivo), faltan = fechas.filter(function (f) { return !validas.some(function (p) { return p.fecha === f; }); }).slice(-3);
      var cadena = Promise.resolve();
      faltan.forEach(function (f) { cadena = cadena.then(function () { return vigorEnFecha(equipo, cultivo, f).catch(function () { return null; }); }); });
      return cadena.then(function () { var s = pasadasValidas(equipo, cultivo); return { pasadas: s, ultima: s[s.length - 1] || null, fechasDisponibles: fechas.length }; });
    });
  }

  /* ---------- calibración altura ↔ NDVI (aprende con las lecturas de regla) ---------- */
  function pares(equipo, pasadas) {
    var lista = pasadas || serieGuardada(equipo.id).pasadas, lect = window.SafiaPasturas ? SafiaPasturas.lecturasLote(equipo.id) : [], out = [];
    lect.forEach(function (l) {
      var mejor = null, dm = 99;
      lista.forEach(function (p) { var d = Math.abs(diasEntre(p.fecha, l.fecha)); var v = p.por[String(l.piquete)]; if (v && d <= 3 && d < dm) { dm = d; mejor = v; } });
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
  // Piquete ocupado y los 'saltar' siguientes por número → tramos de brújula que el pivot no riega hoy.
  // Con anillos, el pivot riega todo el radio: en esos tramos tampoco se riegan los piquetes del otro anillo ('comparten').
  function sectoresSinRiego(equipo, cultivo, saltar) {
    var g = sectores(equipo, cultivo); if (!g || !window.SafiaPasturas) return null;
    var st = SafiaPasturas.estadoPiquetes(equipo.id, cultivo); if (!st.ocupado) return { ocupado: null, piquetes: [], grados: [], arcos: [], comparten: [], texto: '' };
    var k = g.lista.findIndex(function (s) { return s.piquete === String(st.ocupado); }); if (k < 0) return { ocupado: st.ocupado, piquetes: [], grados: [], arcos: [], comparten: [], texto: '' };
    var N = g.param.n, cuantos = Math.min(N - 1, (saltar || 3) + 1), piqs = [], BIN = 720, tapa = [], i, b;
    for (b = 0; b < BIN; b++) tapa.push(false);
    var marcar = function (s, hacer) { var desde = Math.round(s.a1 * 2), largo = Math.round(mod(s.a2 - s.a1, 360) * 2) || BIN; for (var q = 0; q < largo; q++) hacer(mod(desde + q, BIN)); };
    for (i = 0; i < cuantos; i++) { var s = g.lista[(k + i) % N]; piqs.push(s.piquete); marcar(s, function (x) { tapa[x] = true; }); }
    // tramos continuos (el círculo se recorre desde un punto libre para no partir un tramo que cruza el norte)
    var arcos = [], libre = tapa.indexOf(false);
    if (libre < 0) arcos.push({ de: 0, a: 360 });
    else for (var paso = 0, ini = null; paso <= BIN; paso++) {
      var x = (libre + paso) % BIN, on = paso < BIN && tapa[x];
      if (on && ini == null) ini = x; else if (!on && ini != null) { arcos.push({ de: ini / 2, a: (x / 2) || 360 }); ini = null; }
    }
    var comparten = g.lista.filter(function (s2) { if (piqs.indexOf(s2.piquete) !== -1) return false; var toca = false; marcar(s2, function (x2) { if (tapa[x2]) toca = true; }); return toca; }).map(function (s2) { return s2.piquete; });
    var gr = function (v) { return Math.round(v * 10) / 10; };
    var texto = arcos.map(function (a) { return 'del ' + gr(a.de) + '° al ' + gr(a.a) + '°'; }).join(' y ');
    return { ocupado: st.ocupado, piquetes: piqs, grados: arcos.length ? [gr(arcos[0].de), gr(arcos[0].a)] : [], arcos: arcos, comparten: comparten, texto: texto };
  }

  /* ---------- dibujo: el pivot en piquetes, coloreado por vigor o por estado ---------- */
  var RAMPA = [[-0.2, [120, 90, 60]], [0.15, [196, 168, 120]], [0.3, [232, 212, 92]], [0.45, [172, 202, 72]], [0.6, [92, 172, 62]], [0.75, [32, 132, 42]], [0.9, [0, 82, 22]]];
  function colorNdvi(v) {
    if (v == null) return '#E1E4E7';
    if (v <= RAMPA[0][0]) return rgb(RAMPA[0][1]);
    for (var i = 1; i < RAMPA.length; i++) if (v <= RAMPA[i][0]) { var a = RAMPA[i - 1], b = RAMPA[i], t = (v - a[0]) / (b[0] - a[0]); return rgb([a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t]); }
    return rgb(RAMPA[RAMPA.length - 1][1]);
  }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function pt(cx, cy, r, ang) { var t = ang * RAD; return (Math.round((cx + r * Math.sin(t)) * 10) / 10) + ' ' + (Math.round((cy - r * Math.cos(t)) * 10) / 10); }
  function svgPivot(g, colorDe, etiquetaDe, sinRiego) {
    var R = 96, cx = 100, cy = 100, p = g.param, h = '<svg viewBox="0 0 200 200" style="width:100%;max-width:260px;display:block;margin:0 auto;" role="img" aria-label="Pivot dividido en piquetes">';
    var fuente = p.n > 40 ? 5.5 : p.n > 24 ? 7 : 10, textos = '';
    g.lista.forEach(function (s) {
      var an = p.anillos[s.anillo], pasos = Math.max(3, Math.ceil(an.paso / 2.5)), pts = [], k, fi;
      for (k = 0; k <= pasos; k++) { fi = s.f1 + (s.f2 - s.f1) * k / pasos; pts.push(pt(cx, cy, R * radioBorde(p, s.anillo, fi), brujula(p, fi))); }
      if (s.anillo === 0) pts.push(cx + ' ' + cy);
      else for (k = pasos; k >= 0; k--) { fi = s.f1 + (s.f2 - s.f1) * k / pasos; pts.push(pt(cx, cy, R * radioInterior(p, s.anillo, fi), brujula(p, fi))); }
      var sr = sinRiego && sinRiego.piquetes && sinRiego.piquetes.indexOf(s.piquete) !== -1;
      h += '<path d="M' + pts.join(' L') + ' Z" fill="' + colorDe(s) + '" stroke="#fff" stroke-width="1.2"' + (sr ? ' stroke-dasharray="3 2" stroke="#2E72C8" stroke-width="2"' : '') + '><title>Piquete ' + esc(s.piquete) + (s.ha ? ' · ' + String(s.ha).replace('.', ',') + ' ha' : '') + (etiquetaDe ? ': ' + esc(etiquetaDe(s)) : '') + '</title></path>';
      var fm = (s.f1 + s.f2) / 2, ro = radioBorde(p, s.anillo, fm), ri = radioInterior(p, s.anillo, fm), rm = s.anillo === 0 ? ro * (p.anillos.length > 1 ? 0.66 : 0.68) : (ro + ri) / 2;
      var pm = pt(cx, cy, R * rm, brujula(p, fm)).split(' ');
      if (p.n <= 64) textos += '<text x="' + pm[0] + '" y="' + (parseFloat(pm[1]) + fuente * 0.35) + '" font-size="' + fuente + '" text-anchor="middle" fill="#fff" font-weight="600" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px;">' + esc(s.piquete) + '</text>';
    });
    h += textos + '<circle cx="' + cx + '" cy="' + cy + '" r="3.5" fill="#2C2C2A"/><text x="' + cx + '" y="8" font-size="7" text-anchor="middle" fill="#8C9196">N</text></svg>';
    return h;
  }
  // Texto corto del modelo: "32 piquetes · 16 adentro (1,5 ha c/u) + 16 afuera (2,1 ha c/u) · alambrado interno recto cada dos potreros"
  function describir(g) {
    var p = g.param, ha = function (j) { var s = g.lista.find(function (x) { return x.anillo === j; }); return s && s.ha ? ' (' + String(s.ha).replace('.', ',') + ' ha c/u)' : ''; };
    if (p.modelo === 'pizza') return p.n + ' piquetes en porciones desde el centro' + ha(0);
    var nombres = p.anillos.length === 2 ? ['adentro', 'afuera'] : p.anillos.length === 3 ? ['adentro', 'en el medio', 'afuera'] : p.anillos.map(function (_, i) { return 'anillo ' + (i + 1); });
    return p.n + ' piquetes · ' + p.anillos.map(function (an, j) { return an.n + ' ' + nombres[j] + ha(j); }).join(' + ') + ' · alambrado interno ' + (p.borde === 'circulo' ? 'circular' : p.borde === 'recto2' ? 'recto cada dos potreros' : 'recto entre divisorias');
  }

  /* ---------- panel para Operador / Encargado ---------- */
  // Devuelve HTML con: el pivot coloreado por NDVI (última pasada), tabla por piquete (NDVI, tendencia, altura estimada), riego sin pastoreo
  function htmlPanel(equipo, cultivo, datos) {
    var g = sectores(equipo, cultivo);
    if (!g) return '<div style="font-size:12px;color:#8C9196;">Para dividir el pivot en piquetes hacen falta el polígono del pivot (Equipos y lotes) y la cantidad de piquetes en la campaña.</div>';
    var ref = window.SafiaPasturas ? SafiaPasturas.alturasReferencia((cultivo.variedad || '') + ' ' + (cultivo.cultivo || '')) : null;
    var est = window.SafiaPasturas ? SafiaPasturas.estadoPiquetes(equipo.id, cultivo) : { piquetes: [], ocupado: null };
    var pasadas = ((datos && datos.pasadas) || []).filter(function (x) { return vale(x, g.param); });
    var ult = pasadas[pasadas.length - 1] || null, prev = pasadas.length > 1 ? pasadas[pasadas.length - 2] : null;
    var reg = regresion(pares(equipo, pasadas)), sinR = sectoresSinRiego(equipo, cultivo, 3);
    var colorDe = function (s) { var v = ult && ult.por[s.piquete]; return colorNdvi(v ? v.ndvi : null); };
    var etiq = function (s) { var v = ult && ult.por[s.piquete]; return v ? 'NDVI ' + v.ndvi.toFixed(2) : 'sin dato'; };
    var h = '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;">';
    h += '<div style="flex:0 1 240px;min-width:180px;">' + svgPivot(g, colorDe, etiq, sinR) + '<div style="font-size:11px;color:#8C9196;text-align:center;margin-top:4px;">' + (ult ? 'Vigor Sentinel-2 del ' + fmtF(ult.fecha) + (prev ? ' (anterior ' + fmtF(prev.fecha) + ')' : '') : 'Sin imagen todavía') + ' · ' + esc(describir(g)) + ' · piquete 1 desde ' + g.param.anguloInicio + '° (norte, ' + (g.param.sentido > 0 ? 'horario' : 'antihorario') + ')' + (sinR && sinR.piquetes.length ? ' · <span style="color:#2E72C8;">punteado: no regar hoy</span>' : '') + '</div></div>';
    h += '<div style="flex:1 1 280px;min-width:0;">';
    if (sinR && sinR.ocupado) h += '<div style="font-size:12px;background:#E7F0FB;border-radius:8px;padding:6px 10px;margin-bottom:8px;color:#234e85;"><b>Riego separado del pastoreo:</b> hoy no regar los piquetes ' + esc(sinR.piquetes.join(', ')) + ' (el ocupado y los 3 siguientes): saltar <b>' + esc(sinR.texto) + '</b> desde el norte, sentido horario.' + (sinR.comparten.length ? ' En ese tramo el pivot tampoco riega los piquetes ' + esc(sinR.comparten.join(', ')) + ', que comparten el ángulo.' : '') + ' Regar el resto según el balance.</div>';
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
    var LIM = 8, cab = '<tr style="color:#8C9196;text-align:left;"><th style="padding:3px 0;width:16%;">Piq.</th><th style="width:16%;">NDVI</th><th style="width:20%;">Tendencia</th><th style="width:20%;">Regla</th><th>Estado</th></tr>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">' + cab;
    var resto = filas.slice(LIM); filas = filas.slice(0, LIM);
    var filaHtml = function (f) {
      var estadoTxt = f.e.estado === 'ocupado' ? '<span style="color:#2E72C8;font-weight:600;">Animales adentro</span>' : (f.e.estado === 'listo' ? '<span style="color:#178029;font-weight:600;">A punto (regla)</span>' : (f.listoSat ? '<span style="color:#178029;font-weight:600;">A punto por satélite (~' + f.altSat + ' cm)</span>' : (f.altSat != null ? '~' + f.altSat + ' cm por satélite' : (f.e.texto ? esc(f.e.texto).slice(0, 60) : '—'))));
      return '<tr style="border-top:1px solid #EEF0F2;"><td style="padding:4px 0;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + colorNdvi(f.v ? f.v.ndvi : null) + ';vertical-align:-1px;margin-right:4px;"></span><b>' + esc(f.s.piquete) + '</b></td><td>' + (f.v ? f.v.ndvi.toFixed(2) + (f.v.nubes_pct > 30 ? '<span style="color:#8C9196;" title="parte con nubes">*</span>' : '') : '—') + '</td><td style="color:' + (f.tend > 0 ? '#178029' : f.tend < 0 ? '#B5371C' : '#8C9196') + ';">' + (f.tend != null ? (f.tend > 0 ? '+' : '') + (f.tend * 100).toFixed(1) + '/100 por día' : '—') + '</td><td>' + (f.e.altura ? f.e.altura + ' cm <span style="color:#8C9196;">' + fmtF(f.e.fechaLectura) + '</span>' : '—') + '</td><td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + estadoTxt + '</td></tr>';
    };
    h += filas.map(filaHtml).join('') + '</table>';
    if (resto.length) h += '<details style="margin-top:4px;"><summary style="cursor:pointer;font-size:11px;color:#1565C0;font-weight:600;">Ver los otros ' + resto.length + ' piquetes</summary><table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">' + cab + resto.map(filaHtml).join('') + '</table></details>';
    h += '</div></div>';
    return h;
  }

  window.SafiaPiquetes = { sectores: sectores, centroRadio: centroRadio, parametros: parametros, total: total, indiceSector: indiceSector, indicePiquete: indicePiquete, promediarImagen: promediarImagen, vigorEnFecha: vigorEnFecha, actualizar: actualizar, serieGuardada: serieGuardada, pasadasValidas: pasadasValidas, pares: pares, regresion: regresion, sectoresSinRiego: sectoresSinRiego, colorNdvi: colorNdvi, svgPivot: svgPivot, describir: describir, htmlPanel: htmlPanel };
})();
