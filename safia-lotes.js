/* SAFIA — Lotes georreferenciados
   -------------------------------------------------------------------
   Lee polígonos de Google Earth (KML / KMZ), GeoJSON o shapefile (ZIP),
   calcula hectáreas y centro de cada lote, y dibuja todos los lotes de
   un campo sobre la imagen satelital (Leaflet) para navegar con un clic.
   Cada equipo/lote guarda su contorno en `equipo.poligono`:
     { partes: [ [ exterior, hueco, ... ], ... ],   // puntos [lat, lon], formato que entiende Leaflet
       ha: 48.7, centro: { lat, lon }, origen: 'nombre.kml', nombreOriginal: 'Area Nova' }
   Lo usan mis-equipos.html (importar + mapa) y safia-mapas.js (fondo del
   mapa de rinde/fertilidad del Banco). */
(function () {
  'use strict';

  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var SHP_JS = 'https://unpkg.com/shpjs@6.1.0/dist/shp.js';
  var JSZIP_JS = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  var COLOR_TIPO = { pivote: '#2E7D32', goteo: '#1565C0', microaspersion: '#1565C0', aspersion: '#0288D1', canon: '#00838F', superficie: '#6A1B9A', secano: '#C77800', otro: '#546E7A' };
  var NOMBRE_TIPO = { pivote: 'Pivote', canon: 'Cañón', goteo: 'Goteo', microaspersion: 'Microaspersión', aspersion: 'Aspersión', superficie: 'Superficie', secano: 'Secano (sin riego)', otro: 'Otro' };

  function cargarScript(url) {
    return new Promise(function (res, rej) {
      var ya = document.querySelector('script[src="' + url + '"]');
      if (ya && ya.dataset.listo) { res(); return; }
      if (ya) { ya.addEventListener('load', function () { res(); }); ya.addEventListener('error', function () { rej(new Error('No se pudo cargar ' + url)); }); return; }
      var s = document.createElement('script'); s.src = url;
      s.onload = function () { s.dataset.listo = '1'; res(); };
      s.onerror = function () { rej(new Error('No se pudo cargar ' + url + ' (¿sin internet?)')); };
      document.head.appendChild(s);
    });
  }
  function cargarCSS(url) { if (document.querySelector('link[href="' + url + '"]')) return; var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; document.head.appendChild(l); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtHa(v) { return v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ha'; }

  /* ---------- geometría ---------- */
  var R = 6378137;
  // Proyección local (metros) alrededor de la latitud media: suficiente para lotes (error < 0,1 %)
  function proyectar(anillo) {
    var lat0 = 0; anillo.forEach(function (p) { lat0 += p[0]; }); lat0 = lat0 / anillo.length * Math.PI / 180;
    var k = Math.cos(lat0);
    return anillo.map(function (p) { return [p[1] * Math.PI / 180 * R * k, p[0] * Math.PI / 180 * R]; });
  }
  function areaM2(anillo) {
    if (!anillo || anillo.length < 3) return 0;
    var xy = proyectar(anillo), s = 0;
    for (var i = 0, n = xy.length; i < n; i++) { var a = xy[i], b = xy[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s) / 2;
  }
  // partes = [ [exterior, hueco...], ... ] → hectáreas netas
  function hectareas(partes) {
    var m2 = 0;
    (partes || []).forEach(function (anillos) {
      anillos.forEach(function (an, i) { m2 += (i === 0 ? 1 : -1) * areaM2(an); });
    });
    return Math.round(m2 / 10000 * 100) / 100;
  }
  function centro(partes) {
    var sx = 0, sy = 0, n = 0;
    (partes || []).forEach(function (anillos) { (anillos[0] || []).forEach(function (p) { sx += p[0]; sy += p[1]; n++; }); });
    return n ? { lat: Math.round(sx / n * 1e6) / 1e6, lon: Math.round(sy / n * 1e6) / 1e6 } : null;
  }
  function limites(partes) {
    var b = null;
    (partes || []).forEach(function (anillos) { (anillos[0] || []).forEach(function (p) {
      if (!b) b = [[p[0], p[1]], [p[0], p[1]]];
      b[0][0] = Math.min(b[0][0], p[0]); b[0][1] = Math.min(b[0][1], p[1]); b[1][0] = Math.max(b[1][0], p[0]); b[1][1] = Math.max(b[1][1], p[1]);
    }); });
    return b;
  }
  function armarItem(nombre, partes, origen, extra) {
    partes = partes.filter(function (an) { return an && an[0] && an[0].length >= 3; });
    if (!partes.length) return null;
    var it = { nombre: String(nombre || '').trim(), partes: partes, ha: hectareas(partes), centro: centro(partes), origen: origen || '' };
    if (extra) it.descripcion = extra;
    return it;
  }

  /* ---------- lectura de archivos ---------- */
  // "lon,lat,alt lon,lat,alt ..." (KML) → [[lat, lon], ...]
  function anilloKML(texto) {
    var pts = [];
    String(texto || '').trim().split(/\s+/).forEach(function (t) {
      var c = t.split(','); var lon = parseFloat(c[0]), lat = parseFloat(c[1]);
      if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
    });
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts;
  }
  function textoDe(el, tag) { var t = el.getElementsByTagName(tag)[0]; return t ? t.textContent.trim() : ''; }
  function leerKML(texto) {
    var doc = new DOMParser().parseFromString(texto, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo KML no se pudo interpretar');
    var pms = Array.prototype.slice.call(doc.getElementsByTagName('Placemark'));
    var items = [], sinNombre = 0;
    pms.forEach(function (pm) {
      var polis = Array.prototype.slice.call(pm.getElementsByTagName('Polygon'));
      if (!polis.length) {
        // Un trazado cerrado (LineString) también sirve como contorno
        var ls = pm.getElementsByTagName('LineString')[0];
        if (!ls) return;
        var an = anilloKML(textoDe(ls, 'coordinates'));
        if (an.length < 3) return;
        var itL = armarItem(textoDe(pm, 'name') || ('Trazado ' + (++sinNombre)), [[an]], '', textoDe(pm, 'description'));
        if (itL) items.push(itL);
        return;
      }
      var partes = polis.map(function (po) {
        var ext = po.getElementsByTagName('outerBoundaryIs')[0];
        var exterior = anilloKML(ext ? textoDe(ext, 'coordinates') : textoDe(po, 'coordinates'));
        var huecos = Array.prototype.slice.call(po.getElementsByTagName('innerBoundaryIs')).map(function (h) { return anilloKML(textoDe(h, 'coordinates')); }).filter(function (h) { return h.length >= 3; });
        return [exterior].concat(huecos);
      });
      var it = armarItem(textoDe(pm, 'name') || ('Polígono ' + (++sinNombre)), partes, '', textoDe(pm, 'description'));
      if (it) items.push(it);
    });
    return items;
  }
  function nombreDeProps(props, i) {
    var claves = ['name', 'Name', 'NAME', 'nombre', 'NOMBRE', 'Nombre', 'nome', 'NOME', 'lote', 'LOTE', 'Lote', 'talhao', 'TALHAO', 'field', 'FIELD', 'id', 'ID'];
    for (var k = 0; k < claves.length; k++) if (props[claves[k]] != null && String(props[claves[k]]).trim()) return String(props[claves[k]]).trim();
    var primera = Object.keys(props).filter(function (k) { return typeof props[k] === 'string' && props[k].trim(); })[0];
    return primera ? props[primera].trim() : ('Polígono ' + (i + 1));
  }
  function leerGeoJSON(obj) {
    var feats = obj.type === 'FeatureCollection' ? obj.features : (Array.isArray(obj) ? obj.reduce(function (a, o) { return a.concat(o.features || []); }, []) : (obj.features || (obj.type === 'Feature' ? [obj] : [])));
    var items = [];
    function inv(an) { var pts = an.map(function (c) { return [c[1], c[0]]; }); if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop(); return pts; }
    feats.forEach(function (f, i) {
      if (!f || !f.geometry) return;
      var g = f.geometry, partes = null;
      if (g.type === 'Polygon') partes = [g.coordinates.map(inv)];
      else if (g.type === 'MultiPolygon') partes = g.coordinates.map(function (po) { return po.map(inv); });
      if (!partes) return;
      var it = armarItem(nombreDeProps(f.properties || {}, i), partes, '');
      if (it) items.push(it);
    });
    return items;
  }
  function leerArchivo(archivo) {
    var nombre = archivo.name.toLowerCase();
    var p;
    if (/\.kmz$/.test(nombre)) {
      p = cargarScript(JSZIP_JS).then(function () { return archivo.arrayBuffer(); }).then(function (buf) { return window.JSZip.loadAsync(buf); }).then(function (zip) {
        var kml = Object.keys(zip.files).filter(function (f) { return /\.kml$/i.test(f); })[0];
        if (!kml) throw new Error('El KMZ no trae ningún archivo KML adentro');
        return zip.files[kml].async('string');
      }).then(leerKML);
    } else if (/\.zip$/.test(nombre)) {
      p = cargarScript(SHP_JS).then(function () { return archivo.arrayBuffer(); }).then(function (buf) { return window.shp(buf); }).then(leerGeoJSON);
    } else {
      p = archivo.text().then(function (t) {
        if (/\.(geojson|json)$/.test(nombre)) return leerGeoJSON(JSON.parse(t));
        if (/\.kml$/.test(nombre) || /<kml/i.test(t.slice(0, 500))) return leerKML(t);
        throw new Error('Formato no reconocido: usá KML o KMZ de Google Earth, GeoJSON o un ZIP de shapefile');
      });
    }
    return p.then(function (items) { items.forEach(function (it) { it.origen = archivo.name; }); return items; });
  }

  /* ---------- mapa de lotes (Leaflet) ---------- */
  function crearMapa(idContenedor, opciones) {
    opciones = opciones || {};
    cargarCSS(LEAFLET_CSS);
    return cargarScript(LEAFLET_JS).then(function () {
      var L = window.L;
      var cont = document.getElementById(idContenedor);
      if (!cont) throw new Error('No existe el contenedor ' + idContenedor);
      var mapa = L.map(idContenedor, { preferCanvas: false, zoomControl: true }).setView([-24.2, -54.5], 12);
      var satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagen: Esri, Maxar, Earthstar Geographics' });
      var calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      (opciones.base === 'calles' ? calles : satelite).addTo(mapa);
      L.control.layers({ 'Satélite': satelite, 'Mapa': calles }, null, { position: 'topright', collapsed: true }).addTo(mapa);
      L.control.scale({ metric: true, imperial: false }).addTo(mapa);

      var grupo = L.layerGroup().addTo(mapa), previa = L.layerGroup().addTo(mapa);
      var capasPorId = {}, seleccionadoId = null;

      function estilo(lote, sel) {
        var c = COLOR_TIPO[lote.tipo] || COLOR_TIPO.otro;
        return { color: sel ? '#FFD54F' : c, weight: sel ? 4 : 2.5, fillColor: c, fillOpacity: sel ? 0.45 : 0.25 };
      }
      function seleccionar(id) {
        Object.keys(capasPorId).forEach(function (k) { var c = capasPorId[k]; if (c.poligono) c.poligono.setStyle(estilo(c.lote, String(k) === String(id))); });
        seleccionadoId = id;
      }
      var api = {
        mapa: mapa,
        // lotes: [{ id, nombre, tipo, superficie, poligono, gps }]; campo: { latitud, longitud, nombre }
        mostrar: function (lotes, campo) {
          grupo.clearLayers(); capasPorId = {};
          var bounds = [];
          (lotes || []).forEach(function (lote) {
            var entrada = { lote: lote };
            if (lote.poligono && lote.poligono.partes && lote.poligono.partes.length) {
              var poli = L.polygon(lote.poligono.partes, estilo(lote, false)).addTo(grupo);
              poli.bindTooltip('<b>' + esc(lote.nombre) + '</b><br>' + esc(NOMBRE_TIPO[lote.tipo] || lote.tipo || '') + ' · ' + fmtHa(lote.poligono.ha), { permanent: true, direction: 'center', className: 'safia-etq-lote' });
              poli.on('click', function () { seleccionar(lote.id); if (opciones.alClick) opciones.alClick(lote); });
              entrada.poligono = poli;
              var b = limites(lote.poligono.partes); if (b) { bounds.push(b[0]); bounds.push(b[1]); }
            } else {
              var xy = gpsDe(lote.gps);
              if (xy) {
                var m = L.circleMarker([xy.lat, xy.lon], { radius: 8, color: COLOR_TIPO[lote.tipo] || COLOR_TIPO.otro, fillOpacity: 0.8, weight: 2 }).addTo(grupo);
                m.bindTooltip('<b>' + esc(lote.nombre) + '</b><br>' + esc(NOMBRE_TIPO[lote.tipo] || '') + (lote.superficie ? ' · ' + fmtHa(+lote.superficie) : '') + '<br><i>sin polígono</i>', { direction: 'top' });
                m.on('click', function () { seleccionar(lote.id); if (opciones.alClick) opciones.alClick(lote); });
                entrada.marcador = m; bounds.push([xy.lat, xy.lon]);
              }
            }
            capasPorId[lote.id] = entrada;
          });
          if (campo) {
            var cl = parseFloat(String(campo.latitud).replace(',', '.')), co = parseFloat(String(campo.longitud).replace(',', '.'));
            if (!isNaN(cl) && !isNaN(co)) {
              L.marker([cl, co], { opacity: 0.9 }).bindTooltip(esc(campo.nombre || 'Campo'), { direction: 'top' }).addTo(grupo);
              if (!bounds.length) bounds.push([cl, co]);
            }
          }
          if (bounds.length > 1) mapa.fitBounds(bounds, { padding: [24, 24] });
          else if (bounds.length === 1) mapa.setView(bounds[0], 14);
          setTimeout(function () { mapa.invalidateSize(); }, 50);
          return bounds.length;
        },
        // Dibuja polígonos leídos de un archivo pero todavía no guardados (punteados)
        previsualizar: function (items) {
          previa.clearLayers();
          var bounds = [];
          (items || []).forEach(function (it) {
            L.polygon(it.partes, { color: '#FFB300', weight: 2, dashArray: '6 4', fillColor: '#FFB300', fillOpacity: 0.15 }).bindTooltip('<b>' + esc(it.nombre) + '</b><br>' + fmtHa(it.ha) + ' · sin guardar', { permanent: true, direction: 'center', className: 'safia-etq-lote' }).addTo(previa);
            var b = limites(it.partes); if (b) { bounds.push(b[0]); bounds.push(b[1]); }
          });
          if (bounds.length) mapa.fitBounds(bounds, { padding: [24, 24] });
          setTimeout(function () { mapa.invalidateSize(); }, 50);
        },
        limpiarPrevia: function () { previa.clearLayers(); },
        enfocar: function (id) {
          var c = capasPorId[id]; if (!c) return false;
          seleccionar(id);
          if (c.poligono) mapa.fitBounds(c.poligono.getBounds(), { padding: [40, 40] });
          else if (c.marcador) mapa.setView(c.marcador.getLatLng(), 15);
          if (c.poligono) c.poligono.openTooltip();
          return true;
        },
        seleccionar: seleccionar,
        seleccionado: function () { return seleccionadoId; },
        redimensionar: function () { mapa.invalidateSize(); }
      };
      return api;
    });
  }
  function gpsDe(texto) {
    if (!texto) return null;
    var m = String(texto).replace(/\s+/g, '').match(/^(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)$/);
    if (!m) return null;
    var lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
    return (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) ? null : { lat: lat, lon: lon };
  }

  // Estilo de las etiquetas sobre los lotes
  var css = document.createElement('style');
  css.textContent = '.safia-etq-lote{background:rgba(255,255,255,.88);border:0;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.35);font:600 11px/1.3 system-ui,sans-serif;color:#1B1F23;padding:3px 6px;text-align:center;} .safia-etq-lote::before{display:none;} .leaflet-container{font-family:inherit;}';
  document.head.appendChild(css);

  window.SafiaLotes = {
    leerArchivo: leerArchivo, leerKML: leerKML, leerGeoJSON: leerGeoJSON,
    hectareas: hectareas, centro: centro, limites: limites, gpsDe: gpsDe, fmtHa: fmtHa,
    crearMapa: crearMapa, COLOR_TIPO: COLOR_TIPO, NOMBRE_TIPO: NOMBRE_TIPO
  };
})();
