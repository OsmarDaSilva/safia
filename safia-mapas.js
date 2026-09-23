/* SAFIA — Mapas georreferenciados (Banco Agronómico → pestaña Mapas)
   -------------------------------------------------------------------
   Importa mapas de rinde de la cosechadora, grillas de fertilidad y
   otros puntos georreferenciados (CSV/TXT, GeoJSON, KML, ZIP shapefile),
   los muestra en un mapa, calcula estadísticas y zonas, los guarda en
   Supabase (safia_geo_capas + safia_geo_puntos) y cruza rinde × suelo
   para decir qué parámetro explica más el rinde dentro del lote.
   Depende de window.SafiaBanco (campoActual, leer, guardar, toast,
   refrescar) que expone banco.html, y de SafiaAgro para los umbrales. */
(function () {
  'use strict';

  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var SHP_JS = 'https://unpkg.com/shpjs@6.1.0/dist/shp.js';
  var MAX_PUNTOS_MAPA = 6000;     // más que esto se muestrea para dibujar (las estadísticas usan todos)
  var MAX_PUNTOS_GUARDAR = 80000;
  var COLORES = ['#B3261E', '#E8A33D', '#F2D16B', '#7CC47F', '#178029'];

  var PARAMS_SUELO = [
    { k: 'ph', n: 'pH', re: /^ph($|[^a-z])/i },
    { k: 'mo', n: 'Materia orgánica %', re: /(^mo$|^m\.?o\.?|mat.*org|^om$|carbono|c_org|^co$)/i },
    { k: 'p', n: 'Fósforo P (mg/dm³)', re: /(^p$|^p_|^p\s|fosf|phos|^p_meh|^p_ppm|^p_mg)/i },
    { k: 'k', n: 'Potasio K (cmolc/dm³)', re: /(^k$|^k_|^k\s|potas)/i },
    { k: 'ca', n: 'Calcio Ca (cmolc/dm³)', re: /(^ca$|^ca_|^ca\s|calc)/i },
    { k: 'mg', n: 'Magnesio Mg (cmolc/dm³)', re: /(^mg$|^mg_|^mg\s|magn)/i },
    { k: 'cic', n: 'CIC (cmolc/dm³)', re: /(cic|ctc|cec)/i },
    { k: 'satBases', n: 'Sat. de bases %', re: /(^v$|^v%|^v_|sat.*bas|base.*sat)/i },
    { k: 'arcilla', n: 'Arcilla %', re: /(arcil|clay|argila)/i }
  ];
  var RE_LAT = /^(lat|latitude|latitud|y|ycoord|y_coord|north|norte)/i;
  var RE_LON = /^(lon|lng|long|longitude|longitud|x|xcoord|x_coord|east|este)/i;
  var RE_RINDE = /(rinde|rend|yield|yld|prod|kg_ha|kgha|ton_ha|t_ha|dry|seco)/i;

  var B = function () { return window.SafiaBanco; };
  var capas = {};          // id -> { meta, puntos:[{lat,lon,v:{}}] }
  var nueva = null;        // mapa recién leído (sin guardar)
  var mapa = null, capaDibujo = null, leyenda = null;

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-PY', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function numero(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim(); if (!s) return null;
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    var n = parseFloat(s); return isNaN(n) ? null : n;
  }
  function cargarScript(url) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + url + '"]')) { res(); return; }
      var s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = function () { rej(new Error('No se pudo cargar ' + url)); };
      document.head.appendChild(s);
    });
  }
  function cargarCSS(url) { if (document.querySelector('link[href="' + url + '"]')) return; var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; document.head.appendChild(l); }
  function percentil(arr, p) { if (!arr.length) return null; var a = arr.slice().sort(function (x, y) { return x - y; }); var i = (a.length - 1) * p; var lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }
  function stats(vals) {
    var v = vals.filter(function (x) { return x != null && isFinite(x); });
    if (!v.length) return null;
    var s = v.reduce(function (a, b) { return a + b; }, 0), m = s / v.length;
    var sd = Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / v.length);
    return { n: v.length, media: m, mediana: percentil(v, 0.5), min: Math.min.apply(null, v), max: Math.max.apply(null, v), p10: percentil(v, 0.1), p90: percentil(v, 0.9), sd: sd, cv: m ? sd / m * 100 : null, t33: percentil(v, 1 / 3), t66: percentil(v, 2 / 3) };
  }
  function pearson(xs, ys) {
    var n = xs.length; if (n < 3) return null;
    var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n, my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
    var sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { var dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : null;
  }

  /* ---------- lectura de archivos → { columnas, filas:[{...}], geo:[{lat,lon}] | null } ---------- */
  function leerCSV(texto) {
    var lineas = texto.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    if (lineas.length < 2) throw new Error('El archivo no tiene datos.');
    var cab = lineas[0];
    var delim = [';', '\t', ','].map(function (d) { return { d: d, n: cab.split(d).length }; }).sort(function (a, b) { return b.n - a.n; })[0].d;
    function partir(l) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < l.length; i++) {
        var c = l[i];
        if (c === '"') { q = !q; continue; }
        if (c === delim && !q) { out.push(cur); cur = ''; continue; }
        cur += c;
      }
      out.push(cur); return out.map(function (x) { return x.trim(); });
    }
    var columnas = partir(cab).map(function (c, i) { return c || ('col' + (i + 1)); });
    var filas = [];
    for (var i = 1; i < lineas.length; i++) {
      var p = partir(lineas[i]); if (p.length < 2) continue;
      var f = {}; columnas.forEach(function (c, j) { f[c] = p[j]; }); filas.push(f);
    }
    return { columnas: columnas, filas: filas, geo: null };
  }
  function centroide(coords) { // anillo [[lon,lat],...]
    var sx = 0, sy = 0, n = 0; coords.forEach(function (c) { sx += c[0]; sy += c[1]; n++; }); return n ? { lon: sx / n, lat: sy / n } : null;
  }
  function leerGeoJSON(obj) {
    var feats = obj.type === 'FeatureCollection' ? obj.features : (Array.isArray(obj) ? obj.reduce(function (a, o) { return a.concat(o.features || []); }, []) : (obj.features || []));
    var filas = [], geo = [], cols = {};
    feats.forEach(function (f) {
      if (!f || !f.geometry) return;
      var g = f.geometry, pt = null;
      if (g.type === 'Point') pt = { lon: g.coordinates[0], lat: g.coordinates[1] };
      else if (g.type === 'Polygon') pt = centroide(g.coordinates[0]);
      else if (g.type === 'MultiPolygon') pt = centroide(g.coordinates[0][0]);
      else if (g.type === 'MultiPoint') pt = { lon: g.coordinates[0][0], lat: g.coordinates[0][1] };
      if (!pt) return;
      var props = f.properties || {}; Object.keys(props).forEach(function (k) { cols[k] = 1; });
      filas.push(props); geo.push(pt);
    });
    return { columnas: Object.keys(cols), filas: filas, geo: geo };
  }
  function leerKML(texto) {
    var doc = new DOMParser().parseFromString(texto, 'text/xml');
    var pms = Array.prototype.slice.call(doc.getElementsByTagName('Placemark'));
    var filas = [], geo = [], cols = {};
    pms.forEach(function (pm) {
      var c = pm.getElementsByTagName('coordinates')[0]; if (!c) return;
      var xyz = c.textContent.trim().split(/\s+/)[0].split(',');
      var pt = { lon: parseFloat(xyz[0]), lat: parseFloat(xyz[1]) }; if (isNaN(pt.lat) || isNaN(pt.lon)) return;
      var props = {};
      Array.prototype.forEach.call(pm.getElementsByTagName('Data'), function (d) { var v = d.getElementsByTagName('value')[0]; props[d.getAttribute('name')] = v ? v.textContent : ''; });
      Array.prototype.forEach.call(pm.getElementsByTagName('SimpleData'), function (d) { props[d.getAttribute('name')] = d.textContent; });
      var nm = pm.getElementsByTagName('name')[0]; if (nm) props.name = nm.textContent;
      Object.keys(props).forEach(function (k) { cols[k] = 1; });
      filas.push(props); geo.push(pt);
    });
    return { columnas: Object.keys(cols), filas: filas, geo: geo };
  }
  function leerArchivo(archivo) {
    var nombre = archivo.name.toLowerCase();
    if (/\.zip$/.test(nombre)) {
      return cargarScript(SHP_JS).then(function () { return archivo.arrayBuffer(); }).then(function (buf) { return window.shp(buf); }).then(leerGeoJSON);
    }
    return archivo.text().then(function (t) {
      if (/\.(geojson|json)$/.test(nombre)) return leerGeoJSON(JSON.parse(t));
      if (/\.kml$/.test(nombre)) return leerKML(t);
      return leerCSV(t);
    });
  }

  /* ---------- detección de columnas ---------- */
  function detectar(columnas, tipo) {
    var d = { lat: null, lon: null, principal: null, mapeo: {} };
    columnas.forEach(function (c) { if (!d.lat && RE_LAT.test(c)) d.lat = c; if (!d.lon && RE_LON.test(c)) d.lon = c; });
    if (tipo === 'rinde') { columnas.forEach(function (c) { if (!d.principal && RE_RINDE.test(c) && c !== d.lat && c !== d.lon) d.principal = c; }); }
    PARAMS_SUELO.forEach(function (p) { columnas.forEach(function (c) { if (!d.mapeo[p.k] && p.re.test(c) && c !== d.lat && c !== d.lon) d.mapeo[p.k] = c; }); });
    if (!d.principal) d.principal = d.mapeo.p || d.mapeo.ph || columnas.filter(function (c) { return c !== d.lat && c !== d.lon; })[0] || null;
    return d;
  }

  /* ---------- armar puntos a partir de la lectura ---------- */
  function armarPuntos(lect, latCol, lonCol, columnasValor) {
    var puntos = [], proyectadas = 0, sinCoord = 0;
    lect.filas.forEach(function (f, i) {
      var lat, lon;
      if (lect.geo) { lat = lect.geo[i].lat; lon = lect.geo[i].lon; }
      else { lat = numero(f[latCol]); lon = numero(f[lonCol]); }
      if (lat == null || lon == null) { sinCoord++; return; }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { proyectadas++; return; }
      var v = {};
      columnasValor.forEach(function (c) { var n = numero(f[c]); if (n != null) v[c] = n; });
      puntos.push({ lat: lat, lon: lon, v: v });
    });
    return { puntos: puntos, proyectadas: proyectadas, sinCoord: sinCoord };
  }

  /* ---------- mapa (Leaflet) ---------- */
  function asegurarMapa() {
    cargarCSS(LEAFLET_CSS);
    return cargarScript(LEAFLET_JS).then(function () {
      if (mapa) return mapa;
      mapa = window.L.map('mapaGeo', { preferCanvas: true }).setView([-24.2, -54.5], 12);
      var calles = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      var satelite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagen: Esri, Maxar, Earthstar Geographics' }).addTo(mapa);
      window.L.control.layers({ 'Satélite': satelite, 'Mapa': calles }, null, { position: 'topright', collapsed: true }).addTo(mapa);
      dibujarLotes();
      return mapa;
    });
  }
  // Contornos de los lotes del campo (polígonos cargados en Equipos y lotes) como referencia debajo de los puntos
  var capaLotes = null;
  function dibujarLotes() {
    if (!mapa || !window.SafiaLotes) return;
    var L = window.L;
    if (capaLotes) { mapa.removeLayer(capaLotes); capaLotes = null; }
    var campo = B() && B().campoActual(); if (!campo) return;
    var lotes = B().leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id) && e.poligono && e.poligono.partes; });
    if (!lotes.length) return;
    capaLotes = L.layerGroup().addTo(mapa);
    var bounds = [];
    lotes.forEach(function (lote) {
      var c = SafiaLotes.COLOR_TIPO[lote.tipo] || '#546E7A';
      L.polygon(lote.poligono.partes, { color: '#FFFFFF', weight: 2, fillColor: c, fillOpacity: 0.08, interactive: false }).addTo(capaLotes);
      L.polygon(lote.poligono.partes, { color: c, weight: 1.5, fill: false, interactive: false }).bindTooltip(esc(lote.nombre) + ' · ' + SafiaLotes.fmtHa(lote.poligono.ha), { permanent: true, direction: 'center', className: 'safia-etq-lote' }).addTo(capaLotes);
      var b = SafiaLotes.limites(lote.poligono.partes); if (b) { bounds.push(b[0]); bounds.push(b[1]); }
    });
    if (!capaDibujo && bounds.length) mapa.fitBounds(bounds, { padding: [20, 20] });
  }
  function dibujar(capa, columna) {
    var L = window.L;
    if (capaDibujo) { mapa.removeLayer(capaDibujo); capaDibujo = null; }
    if (leyenda) { mapa.removeControl(leyenda); leyenda = null; }
    var vals = capa.puntos.map(function (p) { return p.v[columna]; }).filter(function (x) { return x != null; });
    var st = stats(vals);
    var cortes = st ? [0.2, 0.4, 0.6, 0.8].map(function (q) { return percentil(vals, q); }) : [];
    function color(v) { if (v == null) return '#9AA0A6'; for (var i = 0; i < cortes.length; i++) if (v <= cortes[i]) return COLORES[i]; return COLORES[4]; }
    var paso = Math.max(1, Math.ceil(capa.puntos.length / MAX_PUNTOS_MAPA));
    var grupo = L.layerGroup();
    var b = [];
    capa.puntos.forEach(function (p, i) {
      if (i % paso) return;
      b.push([p.lat, p.lon]);
      var v = p.v[columna];
      L.circleMarker([p.lat, p.lon], { radius: 4, color: color(v), fillColor: color(v), fillOpacity: 0.85, weight: 0.5 })
        .bindTooltip(columna + ': ' + fmt(v, 2) + Object.keys(p.v).filter(function (k) { return k !== columna; }).slice(0, 6).map(function (k) { return '<br>' + esc(k) + ': ' + fmt(p.v[k], 2); }).join(''))
        .addTo(grupo);
    });
    grupo.addTo(mapa); capaDibujo = grupo;
    if (b.length) mapa.fitBounds(b, { padding: [20, 20] });
    if (st) {
      leyenda = L.control({ position: 'bottomright' });
      leyenda.onAdd = function () {
        var d = L.DomUtil.create('div'); d.style.cssText = 'background:#fff;padding:8px 10px;border-radius:8px;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,.2);';
        var lims = [st.min].concat(cortes).concat([st.max]);
        d.innerHTML = '<b>' + esc(columna) + '</b><br>' + COLORES.map(function (c, i) { return '<span style="display:inline-block;width:12px;height:12px;background:' + c + ';border-radius:2px;vertical-align:-2px;margin-right:4px;"></span>' + fmt(lims[i], 1) + ' – ' + fmt(lims[i + 1], 1); }).join('<br>');
        return d;
      };
      leyenda.addTo(mapa);
    }
    $('geoTituloMapa').textContent = (capa.meta.nombre || 'Mapa') + ' · ' + capa.puntos.length + ' puntos' + (paso > 1 ? ' (se dibuja 1 de cada ' + paso + ')' : '');
    pintarStats(capa, columna, st);
    setTimeout(function () { mapa.invalidateSize(); }, 50);
  }
  function pintarStats(capa, columna, st) {
    var c = $('geoStats');
    if (!st) { c.innerHTML = '<div class="muted">La columna elegida no tiene valores numéricos.</div>'; return; }
    var vals = capa.puntos.map(function (p) { return p.v[columna]; });
    var bajo = vals.filter(function (v) { return v != null && v <= st.t33; }), alto = vals.filter(function (v) { return v != null && v > st.t66; });
    var medio = st.n - bajo.length - alto.length;
    function prom(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
    c.innerHTML = '<div class="statbar" style="margin:0 0 8px;">' +
      [['Promedio', fmt(st.media, 1)], ['Mediana', fmt(st.mediana, 1)], ['Mínimo', fmt(st.min, 1)], ['Máximo', fmt(st.max, 1)], ['P10 – P90', fmt(st.p10, 1) + ' – ' + fmt(st.p90, 1)], ['Variación (CV)', fmt(st.cv, 0) + ' %'], ['Puntos', fmt(st.n, 0)]]
        .map(function (x) { return '<div class="stat"><div class="sl">' + x[0] + '</div><div class="sv">' + x[1] + '</div></div>'; }).join('') + '</div>' +
      '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Zona (tercios del lote)</th><th class="r">% de puntos</th><th class="r">Promedio</th><th class="r">Rango</th></tr></thead><tbody>' +
      '<tr><td><span class="badge red">Baja</span></td><td class="r">' + fmt(bajo.length / st.n * 100, 0) + ' %</td><td class="r"><span class="num">' + fmt(prom(bajo), 1) + '</span></td><td class="r">≤ ' + fmt(st.t33, 1) + '</td></tr>' +
      '<tr><td><span class="badge amber">Media</span></td><td class="r">' + fmt(medio / st.n * 100, 0) + ' %</td><td class="r"><span class="num">' + fmt(prom(vals.filter(function (v) { return v != null && v > st.t33 && v <= st.t66; })), 1) + '</span></td><td class="r">' + fmt(st.t33, 1) + ' – ' + fmt(st.t66, 1) + '</td></tr>' +
      '<tr><td><span class="badge green">Alta</span></td><td class="r">' + fmt(alto.length / st.n * 100, 0) + ' %</td><td class="r"><span class="num">' + fmt(prom(alto), 1) + '</span></td><td class="r">> ' + fmt(st.t66, 1) + '</td></tr>' +
      '</tbody></table></div></div>' +
      (st.cv != null ? '<div class="note" style="margin-top:8px;">' + (st.cv > 25 ? 'El lote es <b>muy desparejo</b> (CV ' + fmt(st.cv, 0) + ' %): conviene manejar por zonas (fertilización variable, corregir la zona baja).' : (st.cv > 12 ? 'Variación <b>moderada</b> (CV ' + fmt(st.cv, 0) + ' %): hay zonas bajas identificables.' : 'Lote <b>parejo</b> (CV ' + fmt(st.cv, 0) + ' %).')) + '</div>' : '');
  }

  /* ---------- UI: leer ---------- */
  var lecturaActual = null;
  function alLeer() {
    var input = $('geoArchivo'); var archivo = input.files && input.files[0];
    if (!archivo) { B().toast('Elegí un archivo primero', true); return; }
    var tipo = $('geoTipo').value; var boton = $('btnGeoLeer'); boton.disabled = true; boton.textContent = 'Leyendo…';
    leerArchivo(archivo).then(function (lect) {
      lecturaActual = lect;
      var d = detectar(lect.columnas, tipo);
      var opc = function (sel, vacio) { return (vacio ? '<option value="">—</option>' : '') + lect.columnas.map(function (c) { return '<option value="' + esc(c) + '"' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join(''); };
      $('geoLat').innerHTML = lect.geo ? '<option value="">(del archivo)</option>' : opc(d.lat, true);
      $('geoLon').innerHTML = lect.geo ? '<option value="">(del archivo)</option>' : opc(d.lon, true);
      $('geoLat').disabled = $('geoLon').disabled = !!lect.geo;
      $('geoValor').innerHTML = opc(d.principal, false);
      $('geoNombre').value = archivo.name.replace(/\.[^.]+$/, '');
      var mapeoHTML = '';
      if (tipo === 'suelo') {
        mapeoHTML = '<div style="font-weight:700;margin-bottom:4px;">Qué columna es cada parámetro del suelo (revisá lo detectado):</div><div class="form-grid">' + PARAMS_SUELO.map(function (p) {
          return '<div class="field"><label>' + esc(p.n) + '</label><select data-param="' + p.k + '">' + opc(d.mapeo[p.k] || '', true) + '</select></div>';
        }).join('') + '</div>';
      }
      $('geoMapeo').innerHTML = mapeoHTML;
      $('geoResumenLectura').textContent = lect.filas.length + ' filas · ' + lect.columnas.length + ' columnas' + (lect.geo ? ' · coordenadas del archivo' : '');
      $('geoPreview').style.display = '';
      B().toast('Archivo leído: ' + lect.filas.length + ' filas');
    }).catch(function (e) { console.error(e); B().toast('No se pudo leer el archivo: ' + e.message, true); })
      .then(function () { boton.disabled = false; boton.textContent = 'Leer archivo'; });
  }
  function armarNueva() {
    if (!lecturaActual) { B().toast('Primero leé un archivo', true); return null; }
    var tipo = $('geoTipo').value, latCol = $('geoLat').value, lonCol = $('geoLon').value, principal = $('geoValor').value;
    if (!lecturaActual.geo && (!latCol || !lonCol)) { B().toast('Elegí las columnas de latitud y longitud', true); return null; }
    var mapeo = {};
    Array.prototype.forEach.call($('geoMapeo').querySelectorAll('select[data-param]'), function (s) { if (s.value) mapeo[s.dataset.param] = s.value; });
    var columnasValor = lecturaActual.columnas.filter(function (c) { return c !== latCol && c !== lonCol; });
    var r = armarPuntos(lecturaActual, latCol, lonCol, columnasValor);
    if (!r.puntos.length) { B().toast(r.proyectadas ? 'Las coordenadas no están en grados (parecen UTM). Exportá el mapa en latitud/longitud WGS84.' : 'No se encontraron puntos con coordenadas válidas', true); return null; }
    if (r.proyectadas) B().toast(r.proyectadas + ' puntos con coordenadas fuera de rango se ignoraron', true);
    var campo = B().campoActual();
    var meta = { tipo: tipo, nombre: $('geoNombre').value.trim() || 'Mapa', campana: $('geoCampana').value.trim(), cultivo: $('geoCultivo').value.trim(), fecha: $('geoFecha').value || null,
      equipoId: $('geoEquipo').value || null, campoId: campo ? campo.id : null, principal: principal, mapeo: mapeo };
    nueva = { id: 'nueva', meta: meta, puntos: r.puntos };
    capas.nueva = nueva;
    return nueva;
  }
  function alDibujar() { var c = armarNueva(); if (!c) return; asegurarMapa().then(function () { dibujar(c, c.meta.principal); }).catch(function (e) { B().toast(e.message, true); }); }

  /* ---------- guardar en Supabase ---------- */
  function resumenDe(capa) {
    var res = {}; var cols = {};
    capa.puntos.forEach(function (p) { Object.keys(p.v).forEach(function (k) { cols[k] = 1; }); });
    Object.keys(cols).forEach(function (k) { var s = stats(capa.puntos.map(function (p) { return p.v[k]; })); if (s) res[k] = { n: s.n, media: +s.media.toFixed(3), min: s.min, max: s.max, cv: s.cv == null ? null : +s.cv.toFixed(1) }; });
    return res;
  }
  function alGuardar() {
    var c = armarNueva(); if (!c) return;
    var sb = window.safiaSupabase; if (!sb) { B().toast('Sin conexión a internet: no se puede guardar en la nube', true); return; }
    if (c.puntos.length > MAX_PUNTOS_GUARDAR) { B().toast('El mapa tiene ' + c.puntos.length + ' puntos; el máximo es ' + MAX_PUNTOS_GUARDAR + '. Exportalo con menos densidad.', true); return; }
    var boton = $('btnGeoGuardar'); boton.disabled = true;
    var m = c.meta, resumen = resumenDe(c);
    sb.from('safia_geo_capas').insert({
      campo_id: String(m.campoId), equipo_id: m.equipoId ? String(m.equipoId) : null, tipo: m.tipo, nombre: m.nombre, campana: m.campana || null, cultivo: m.cultivo || null, fecha: m.fecha,
      columnas: { principal: m.principal, mapeo: m.mapeo }, n_puntos: c.puntos.length, resumen: resumen
    }).select('id').single().then(function (r) {
      if (r.error) throw r.error;
      var id = r.data.id, filas = c.puntos.map(function (p) { return { capa_id: id, lat: p.lat, lon: p.lon, valores: p.v }; });
      var cadena = Promise.resolve(), hechos = 0, TAM = 1000;
      for (var i = 0; i < filas.length; i += TAM) {
        (function (lote) {
          cadena = cadena.then(function () {
            boton.textContent = 'Guardando… ' + Math.round(hechos / filas.length * 100) + ' %';
            return sb.from('safia_geo_puntos').insert(lote).then(function (r2) { if (r2.error) throw r2.error; hechos += lote.length; });
          });
        })(filas.slice(i, i + TAM));
      }
      return cadena.then(function () { return id; });
    }).then(function (id) {
      capas[id] = { id: id, meta: c.meta, puntos: c.puntos }; delete capas.nueva; nueva = null;
      B().toast('Mapa guardado en la nube: ' + c.puntos.length + ' puntos');
      $('geoPreview').style.display = 'none'; $('geoArchivo').value = ''; lecturaActual = null;
      pintarCapas();
    }).catch(function (e) {
      console.error(e);
      B().toast(/relation .* does not exist|schema cache/i.test(String(e.message)) ? 'Faltan las tablas de mapas en Supabase: corré el bloque SQL de mapas.' : 'No se pudo guardar: ' + e.message, true);
    }).then(function () { boton.disabled = false; boton.textContent = 'Guardar en la nube'; });
  }

  /* ---------- listado y carga de mapas guardados ---------- */
  var ETIQUETA = { rinde: ['Rinde', 'green'], suelo: ['Fertilidad', 'amber'], ndvi: ['Satelital', 'blue'], otro: ['Otro', ''] };
  var metasGuardadas = [];
  function pintarCapas() {
    var cuerpo = $('cuerpoGeoCapas'), vacio = $('geoCapasVacio'); if (!cuerpo) return;
    var sb = window.safiaSupabase, campo = B().campoActual();
    if (!sb || !campo) { cuerpo.innerHTML = ''; vacio.style.display = ''; vacio.textContent = sb ? 'Elegí un campo.' : 'Sin conexión a internet.'; llenarCruce(); return; }
    sb.from('safia_geo_capas').select('id,tipo,nombre,campana,cultivo,fecha,equipo_id,columnas,n_puntos,resumen,creado_en').eq('campo_id', String(campo.id)).order('creado_en', { ascending: false }).then(function (r) {
      if (r.error) { cuerpo.innerHTML = ''; vacio.style.display = ''; vacio.textContent = /does not exist|schema cache/i.test(r.error.message) ? 'Faltan las tablas de mapas en Supabase (corré el bloque SQL).' : 'No se pudieron cargar los mapas.'; return; }
      metasGuardadas = r.data || [];
      vacio.style.display = metasGuardadas.length ? 'none' : ''; vacio.textContent = 'Todavía no hay mapas guardados en este campo.';
      cuerpo.innerHTML = metasGuardadas.map(function (m) {
        var et = ETIQUETA[m.tipo] || ETIQUETA.otro, pr = m.columnas && m.columnas.principal, res = m.resumen && pr && m.resumen[pr];
        return '<tr data-id="' + esc(m.id) + '"><td><span class="fecha">' + esc(m.nombre) + '</span>' + (m.cultivo ? '<div class="sub">' + esc(m.cultivo) + '</div>' : '') + '</td>' +
          '<td><span class="badge ' + et[1] + '">' + et[0] + '</span></td><td>' + esc(m.campana || '—') + '</td><td>' + (m.fecha ? esc(String(m.fecha).slice(0, 10).split('-').reverse().join('/')) : '—') + '</td>' +
          '<td class="r">' + fmt(m.n_puntos, 0) + '</td><td class="r">' + (res ? '<span class="num">' + fmt(res.media, 1) + '</span><div class="sub">' + esc(pr) + '</div>' : '—') + '</td>' +
          '<td><span class="rowact"><button class="ver" title="Ver en el mapa">Ver</button>' + (m.tipo === 'suelo' ? '<button class="usar" title="Guardar el promedio como análisis de suelo del lote">Usar como análisis</button>' : '') + '<button class="del" title="Eliminar">Eliminar</button></span></td></tr>';
      }).join('');
      cuerpo.querySelectorAll('button.ver').forEach(function (b) { b.addEventListener('click', function () { var id = b.closest('tr').dataset.id; cargarCapa(id).then(function (c) { return asegurarMapa().then(function () { dibujar(c, c.meta.principal); $('mapaGeo').scrollIntoView({ behavior: 'smooth' }); }); }).catch(function (e) { B().toast(e.message, true); }); }); });
      cuerpo.querySelectorAll('button.usar').forEach(function (b) { b.addEventListener('click', function () { usarComoAnalisis(b.closest('tr').dataset.id); }); });
      cuerpo.querySelectorAll('button.del').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.closest('tr').dataset.id;
          if (b.dataset.confirmando === '1') {
            sb.from('safia_geo_capas').delete().eq('id', id).then(function (r2) { if (r2.error) throw r2.error; delete capas[id]; B().toast('Mapa eliminado'); pintarCapas(); }).catch(function () { B().toast('No se pudo eliminar', true); });
            return;
          }
          b.dataset.confirmando = '1'; b.textContent = '¿Seguro?'; b.style.color = 'var(--red)';
          setTimeout(function () { b.dataset.confirmando = ''; b.textContent = 'Eliminar'; b.style.color = ''; }, 3000);
        });
      });
      llenarCruce();
    });
  }
  function cargarCapa(id) {
    if (capas[id]) return Promise.resolve(capas[id]);
    var sb = window.safiaSupabase, m = metasGuardadas.find(function (x) { return x.id === id; });
    if (!sb || !m) return Promise.reject(new Error('Mapa no disponible'));
    B().toast('Cargando ' + fmt(m.n_puntos, 0) + ' puntos…');
    var puntos = [], TAM = 1000;
    function pagina(desde) {
      return sb.from('safia_geo_puntos').select('lat,lon,valores').eq('capa_id', id).order('id').range(desde, desde + TAM - 1).then(function (r) {
        if (r.error) throw r.error;
        (r.data || []).forEach(function (p) { puntos.push({ lat: p.lat, lon: p.lon, v: p.valores || {} }); });
        return (r.data && r.data.length === TAM) ? pagina(desde + TAM) : null;
      });
    }
    return pagina(0).then(function () {
      capas[id] = { id: id, meta: { tipo: m.tipo, nombre: m.nombre, campana: m.campana, cultivo: m.cultivo, fecha: m.fecha, equipoId: m.equipo_id, principal: m.columnas && m.columnas.principal, mapeo: (m.columnas && m.columnas.mapeo) || {} }, puntos: puntos };
      return capas[id];
    });
  }

  /* ---------- promedio del mapa → análisis de suelo del lote ---------- */
  function usarComoAnalisis(id) {
    cargarCapa(id).then(function (c) {
      var item = { id: Date.now(), campoId: B().campoActual().id, equipoId: c.meta.equipoId || null, fecha: c.meta.fecha || new Date().toISOString().slice(0, 10), profundidad: '0-20 cm (promedio del mapa)', origen: 'mapa', mapaId: id,
        observaciones: 'Promedio de ' + c.puntos.length + ' puntos del mapa "' + c.meta.nombre + '"' + (c.meta.campana ? ' · ' + c.meta.campana : ''), fechaCreacion: new Date().toISOString() };
      var alguno = false;
      PARAMS_SUELO.forEach(function (p) {
        var col = c.meta.mapeo[p.k]; if (!col) return;
        var s = stats(c.puntos.map(function (x) { return x.v[col]; })); if (!s) return;
        item[p.k] = +s.media.toFixed(p.k === 'ph' ? 2 : 3); alguno = true;
      });
      if (!alguno) { B().toast('Este mapa no tiene columnas de suelo asignadas (pH, P, K…)', true); return; }
      var lista = B().leer('analisis_suelo'); lista.push(item); B().guardar('analisis_suelo', lista);
      B().toast('Análisis de suelo creado con el promedio del mapa'); B().refrescar();
    }).catch(function (e) { B().toast(e.message, true); });
  }

  /* ---------- cruce rinde × suelo ---------- */
  function llenarCruce() {
    var sr = $('cruceRinde'), ss = $('cruceSuelo'); if (!sr) return;
    var lista = metasGuardadas.map(function (m) { return { id: m.id, tipo: m.tipo, nombre: m.nombre + (m.campana ? ' · ' + m.campana : '') }; });
    if (nueva) lista.unshift({ id: 'nueva', tipo: nueva.meta.tipo, nombre: '(sin guardar) ' + nueva.meta.nombre });
    sr.innerHTML = lista.filter(function (x) { return x.tipo === 'rinde' || x.tipo === 'ndvi'; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nombre) + '</option>'; }).join('') || '<option value="">(no hay mapas de rinde)</option>';
    ss.innerHTML = lista.filter(function (x) { return x.tipo === 'suelo'; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nombre) + '</option>'; }).join('') || '<option value="">(no hay grillas de fertilidad)</option>';
  }
  function metros(a, b) { var dy = (a.lat - b.lat) * 111320, dx = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180); return Math.sqrt(dx * dx + dy * dy); }
  function unirRindeASuelo(rinde, suelo, colRinde) {
    var TAM = 0.0009; // ~100 m
    var cubetas = {};
    suelo.puntos.forEach(function (p, i) { var k = Math.round(p.lat / TAM) + '_' + Math.round(p.lon / TAM); (cubetas[k] = cubetas[k] || []).push(i); });
    var acum = suelo.puntos.map(function () { return { s: 0, n: 0 }; });
    var RADIO = 150;
    rinde.puntos.forEach(function (p) {
      var v = p.v[colRinde]; if (v == null) return;
      var cy = Math.round(p.lat / TAM), cx = Math.round(p.lon / TAM), mejor = -1, dmin = Infinity;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var l = cubetas[(cy + dy) + '_' + (cx + dx)]; if (!l) continue;
        l.forEach(function (i) { var d = metros(p, suelo.puntos[i]); if (d < dmin) { dmin = d; mejor = i; } });
      }
      if (mejor >= 0 && dmin <= RADIO) { acum[mejor].s += v; acum[mejor].n++; }
    });
    return suelo.puntos.map(function (p, i) { return acum[i].n ? { lat: p.lat, lon: p.lon, suelo: p.v, rinde: acum[i].s / acum[i].n, n: acum[i].n } : null; }).filter(Boolean);
  }
  function umbral(k, arcilla) {
    var T = window.SafiaAgro && SafiaAgro.TABLAS;
    if (k === 'p') return { v: (arcilla != null && arcilla <= 40) ? 15 : 12, t: 'nivel crítico' };
    if (k === 'k') return { v: 0.19, t: 'nivel crítico (75 mg/dm³)' };
    if (k === 'ph') return { v: 5.5, t: 'mínimo' };
    if (k === 'satBases') return { v: 65, t: 'objetivo soja' };
    if (k === 'mo') return { v: 2, t: 'límite bajo' };
    if (k === 'ca') return { v: 2, t: 'límite bajo' };
    if (k === 'mg') return { v: 0.5, t: 'límite bajo' };
    return null;
  }
  function alCruzar() {
    var idR = $('cruceRinde').value, idS = $('cruceSuelo').value, out = $('cruceResultado');
    if (!idR || !idS) { B().toast('Hacen falta un mapa de rinde y una grilla de fertilidad del mismo campo', true); return; }
    out.innerHTML = '<div class="muted">Cruzando…</div>';
    Promise.all([cargarCapa(idR), cargarCapa(idS)]).then(function (cs) {
      var rinde = cs[0], suelo = cs[1], colR = rinde.meta.principal;
      var unidos = unirRindeASuelo(rinde, suelo, colR);
      if (unidos.length < 5) { out.innerHTML = '<div class="note warn">Solo ' + unidos.length + ' puntos de la grilla tienen rinde a menos de 150 m. ¿Son del mismo lote y en grados (WGS84)?</div>'; return; }
      var mapeo = suelo.meta.mapeo || {}, arcCol = mapeo.arcilla, arcProm = arcCol ? (stats(suelo.puntos.map(function (p) { return p.v[arcCol]; })) || {}).media : null;
      var filas = [];
      PARAMS_SUELO.forEach(function (p) {
        var col = mapeo[p.k]; if (!col) return;
        var pares = unidos.filter(function (u) { return u.suelo[col] != null; });
        if (pares.length < 5) return;
        var xs = pares.map(function (u) { return u.suelo[col]; }), ys = pares.map(function (u) { return u.rinde; });
        var r = pearson(xs, ys), st = stats(xs);
        var bajo = pares.filter(function (u) { return u.suelo[col] <= st.t33; }), alto = pares.filter(function (u) { return u.suelo[col] > st.t66; });
        var mB = bajo.length ? bajo.reduce(function (a, u) { return a + u.rinde; }, 0) / bajo.length : null, mA = alto.length ? alto.reduce(function (a, u) { return a + u.rinde; }, 0) / alto.length : null;
        var um = umbral(p.k, arcProm), debajo = null, encima = null;
        if (um) { var d = pares.filter(function (u) { return u.suelo[col] < um.v; }), e = pares.filter(function (u) { return u.suelo[col] >= um.v; }); if (d.length >= 3 && e.length >= 3) { debajo = { n: d.length, m: d.reduce(function (a, u) { return a + u.rinde; }, 0) / d.length }; encima = { n: e.length, m: e.reduce(function (a, u) { return a + u.rinde; }, 0) / e.length }; } }
        filas.push({ k: p.k, n: p.n, col: col, r: r, nPares: pares.length, t33: st.t33, t66: st.t66, mB: mB, mA: mA, dif: (mA != null && mB != null) ? mA - mB : null, um: um, debajo: debajo, encima: encima });
      });
      if (!filas.length) { out.innerHTML = '<div class="note warn">La grilla no tiene columnas de suelo asignadas (pH, P, K…). Volvé a leerla y asigná las columnas.</div>'; return; }
      filas.sort(function (a, b) { return Math.abs(b.r || 0) - Math.abs(a.r || 0); });
      function fuerza(r) { var a = Math.abs(r || 0); return a >= 0.5 ? '<span class="badge green">fuerte</span>' : (a >= 0.3 ? '<span class="badge amber">moderada</span>' : '<span class="badge">débil</span>'); }
      var top = filas[0];
      out.innerHTML = '<div class="note ok">Se unieron <b>' + unidos.length + '</b> puntos de la grilla con el rinde promedio de la cosechadora a su alrededor (radio 150 m). ' +
        (top.r != null && Math.abs(top.r) >= 0.3 ? 'Dentro de este lote, el parámetro que <b>más explica el rinde</b> es <b>' + esc(top.n) + '</b> (correlación ' + fmt(top.r, 2) + '): ' + (top.dif != null ? 'entre el tercio del lote con menos y el tercio con más, el rinde cambia <b>' + (top.dif >= 0 ? '+' : '') + fmt(top.dif, 0) + '</b>.' : '') : 'Ningún parámetro del suelo tiene correlación clara con el rinde en este lote: la variación viene de otra cosa (agua, compactación, plagas, sombra) o el lote es parejo.') + '</div>' +
        '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Parámetro</th><th class="r">Correlación</th><th>Fuerza</th><th class="r">Rinde tercio bajo</th><th class="r">Rinde tercio alto</th><th class="r">Diferencia</th><th>Contra el umbral agronómico</th></tr></thead><tbody>' +
        filas.map(function (f) {
          return '<tr><td><b>' + esc(f.n) + '</b><div class="sub">' + esc(f.col) + ' · ' + f.nPares + ' puntos</div></td><td class="r"><span class="num">' + fmt(f.r, 2) + '</span></td><td>' + fuerza(f.r) + '</td>' +
            '<td class="r">' + fmt(f.mB, 0) + '<div class="sub">≤ ' + fmt(f.t33, 2) + '</div></td><td class="r">' + fmt(f.mA, 0) + '<div class="sub">> ' + fmt(f.t66, 2) + '</div></td>' +
            '<td class="r">' + (f.dif == null ? '—' : '<span class="badge ' + (f.dif >= 0 ? 'green' : 'red') + '">' + (f.dif >= 0 ? '+' : '') + fmt(f.dif, 0) + '</span>') + '</td>' +
            '<td style="font-size:12px;">' + (f.debajo ? 'Por debajo de ' + fmt(f.um.v, 2) + ' (' + f.um.t + '): <b>' + fmt(f.debajo.m, 0) + '</b> en ' + f.debajo.n + ' puntos · por encima: <b>' + fmt(f.encima.m, 0) + '</b> en ' + f.encima.n + ' → ' + (f.encima.m - f.debajo.m >= 0 ? '+' : '') + fmt(f.encima.m - f.debajo.m, 0) : (f.um ? 'Todo el lote está del mismo lado del umbral ' + fmt(f.um.v, 2) : '—')) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<div class="muted" style="font-size:11px;margin-top:8px;">Correlación de Pearson entre el valor del suelo en cada punto de la grilla y el rinde promedio de la cosechadora a menos de 150 m. Umbrales: CAPECO/IPTA 2012 (P, K), Manual RS/SC (pH, V%), Embrapa (Ca, Mg). Una correlación fuerte señala dónde mirar; la causa la confirma el agrónomo en el lote.</div>';
    }).catch(function (e) { console.error(e); out.innerHTML = '<div class="note warn">' + esc(e.message) + '</div>'; });
  }

  /* ---------- activación ---------- */
  function llenarSelectores() {
    var campo = B().campoActual(); if (!campo) return;
    var eq = B().leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); });
    $('geoEquipo').innerHTML = '<option value="">Todo el campo</option>' + eq.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + (e.tipo === 'secano' ? ' (secano)' : '') + '</option>'; }).join('');
    var ids = eq.map(function (e) { return String(e.id); }), nombres = {};
    B().leer('campanas').forEach(function (c) { if (ids.indexOf(String(c.equipoId)) !== -1 && c.nombre) nombres[c.nombre] = 1; });
    $('geoListaCampanas').innerHTML = Object.keys(nombres).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }
  var iniciado = false;
  function activar() {
    if (!iniciado) {
      iniciado = true;
      $('btnGeoLeer').addEventListener('click', alLeer);
      $('btnGeoDibujar').addEventListener('click', alDibujar);
      $('btnGeoGuardar').addEventListener('click', alGuardar);
      $('btnCruzar').addEventListener('click', alCruzar);
      $('geoTipo').addEventListener('change', function () { if (lecturaActual) alLeer(); });
    }
    llenarSelectores();
    pintarCapas();
    // Si el campo ya tiene lotes con polígono, el mapa se muestra de entrada (aunque todavía no haya capas de puntos)
    if (!mapa && window.SafiaLotes && B() && B().campoActual() && B().leer('equipos').some(function (e) { return String(e.campoId) === String(B().campoActual().id) && e.poligono; })) asegurarMapa().catch(function () {});
    if (mapa) setTimeout(function () { mapa.invalidateSize(); }, 50);
  }
  function alCambiarCampo() { capas = {}; nueva = null; lecturaActual = null; metasGuardadas = []; if ($('geoPreview')) $('geoPreview').style.display = 'none'; if (capaDibujo && mapa) { mapa.removeLayer(capaDibujo); capaDibujo = null; } dibujarLotes(); if (iniciado) activar(); }

  window.SafiaMapas = { activar: activar, alCambiarCampo: alCambiarCampo, leerCSV: leerCSV, leerGeoJSON: leerGeoJSON, leerKML: leerKML, detectar: detectar, armarPuntos: armarPuntos, stats: stats, unirRindeASuelo: unirRindeASuelo, pearson: pearson, _capas: function () { return capas; }, _setNueva: function (c) { nueva = c; capas.nueva = c; llenarCruce(); } };
})();
