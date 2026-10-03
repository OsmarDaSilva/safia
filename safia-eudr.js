/* SAFIA — Lote sin deforestación (Reglamento (UE) 2023/1115, "EUDR")
   -------------------------------------------------------------------
   Revisa cada lote (su polígono) contra dos mapas públicos y arma una constancia para que el productor se la
   entregue a quien le compra el grano:
   1. ¿Había bosque el 31-dic-2020?  JRC Global Forest Cover 2020, versión 4 (Comisión Europea, 10 m): el mapa de
      referencia de la propia UE para el reglamento. La Comisión aclara que no es obligatorio, ni exclusivo, ni
      jurídicamente vinculante. WMS https://ies-ows.jrc.ec.europa.eu/iforce/gfc2020/wms.py (capa gfc2020_v4):
      píxel verde = bosque, transparente = no bosque.
   2. ¿Se perdió cobertura de árboles después?  Hansen / Universidad de Maryland, "Tree cover loss" (30 m, anual),
      servido por Global Forest Watch: teselas https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/tcd_30/
      {z}/{x}/{y}.png (512 px; canal azul = año de la pérdida desde 2000; densidad de copa ≥ 30 %). GFW avisa que
      "pérdida" no es lo mismo que deforestación (incluye cosecha de plantaciones, fuego, tormentas).
   Los dos se consultan desde el navegador (dan permiso CORS), sin cuentas ni claves; se cuentan los píxeles que caen
   adentro del polígono. Verificado en vivo el 3-oct-2026.

   Reglamento: fecha de corte 31-dic-2020; bosque = más de 0,5 ha, árboles de más de 5 m y copa de más del 10 %,
   sin contar el uso agrícola (art. 2); parcelas de más de 4 ha se declaran con el polígono, coordenadas con 6
   decimales (art. 2(28)); rige el 30-dic-2026 para operadores grandes y medianos y el 30-jun-2027 para micro y
   pequeños (Reglamento (UE) 2025/2650). Paraguay: riesgo estándar (Reglamento de Ejecución (UE) 2025/1093).
   Archivo para el sistema europeo: GeoJSON, WGS84 (EPSG:4326), orden longitud, latitud, polígonos cerrados y sin
   huecos (documentación de TRACES; los nombres de las propiedades opcionales no se pudieron verificar en la página
   oficial el 3-oct-2026).
   Legalidad en Paraguay: Ley 422/73 Forestal, art. 42 (propiedades rurales de más de 20 ha en zonas forestales:
   mantener el 25 % de su área de bosques naturales); Ley 6676/2020 (prohíbe transformar superficies con bosque en la
   Región Oriental, prórroga de la Ley 2524/04 hasta 2030); licencia ambiental (Ley 294/93, MADES).
   SISE-UE (CAPECO, UGP, CAPPRO, FECOPROD): pide polígono, parcela habilitada antes del 31-dic-2020 y declaración de
   cumplimiento firmada; no tiene formato público todavía.

   SAFIA no certifica: muestra lo que dicen los mapas. La conclusión de "riesgo nulo o despreciable" y la
   responsabilidad legal son del operador que pone el producto en el mercado europeo (arts. 10 y 11). */
(function () {
  'use strict';
  var B = function () { return window.SafiaBanco; };
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
  function hoyISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function leer(k) { if (B() && B().leer) return B().leer(k); try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }

  var JRC_WMS = 'https://ies-ows.jrc.ec.europa.eu/iforce/gfc2020/wms.py', JRC_CAPA = 'gfc2020_v4', JRC_NOMBRE = 'JRC Global Forest Cover 2020, versión 4 (Comisión Europea), 10 m';
  var GFW_TESELAS = 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/tcd_30/', Z = 12, TAM = 512;
  var CORTE = '2020-12-31', ANIO_CORTE = 20, MIN_BOSQUE_HA = 0.5, RUIDO_HA = 0.1, M_GRADO = 111320;

  /* ---------- geometría ---------- */
  function anillos(lote) { var p = lote && lote.poligono && lote.poligono.partes; if (!p || !p.length) return []; return p.map(function (parte) { return parte[0]; }).filter(function (a) { return a && a.length >= 3; }); }   // solo el contorno exterior ([lat, lon])
  function tienePoligono(lote) { return anillos(lote).length > 0; }
  function limites(an) { var b = { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 }; an.forEach(function (a) { a.forEach(function (p) { if (p[0] < b.minLat) b.minLat = p[0]; if (p[0] > b.maxLat) b.maxLat = p[0]; if (p[1] < b.minLon) b.minLon = p[1]; if (p[1] > b.maxLon) b.maxLon = p[1]; }); }); return b; }
  function enAnillo(lat, lon, a) { var dentro = false; for (var i = 0, j = a.length - 1; i < a.length; j = i++) { var yi = a[i][0], xi = a[i][1], yj = a[j][0], xj = a[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) dentro = !dentro; } return dentro; }
  function dentro(lat, lon, an) { for (var i = 0; i < an.length; i++) if (enAnillo(lat, lon, an[i])) return true; return false; }
  function haAnillos(an) {   // área plana local (suficiente para lotes de pocos km)
    var s = 0; an.forEach(function (a) { var lat0 = a[0][0], k = Math.cos(lat0 * Math.PI / 180), t = 0; for (var i = 0, j = a.length - 1; i < a.length; j = i++) t += (a[j][1] * k * M_GRADO) * (a[i][0] * M_GRADO) - (a[i][1] * k * M_GRADO) * (a[j][0] * M_GRADO); s += Math.abs(t) / 2; });
    return s / 10000;
  }
  function haDe(lote) { var p = lote.poligono; return (p && +p.ha > 0) ? +p.ha : haAnillos(anillos(lote)); }
  function huella(an) { var s = 0; an.forEach(function (a) { a.forEach(function (p) { s = (s * 31 + Math.round(p[0] * 1e6) + Math.round(p[1] * 1e6) * 7) % 2147483647; }); }); return String(s); }

  /* ---------- lectura de imágenes ---------- */
  function pixeles(url) {
    return fetch(url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('el mapa no respondió (' + r.status + ')'); var final = r.url; return r.blob().then(function (b) { return createImageBitmap(b); }).then(function (bm) {
      var c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; var x = c.getContext('2d'); x.drawImage(bm, 0, 0);
      return { w: bm.width, h: bm.height, d: x.getImageData(0, 0, bm.width, bm.height).data, url: final };
    }); });
  }
  function conTiempo(p, ms, msg) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(msg)); }, ms); })]); }

  /* ---------- 1. bosque al 31-dic-2020 (JRC) ---------- */
  function bosque2020(an) {
    var b = limites(an), latM = (b.minLat + b.maxLat) / 2, k = Math.cos(latM * Math.PI / 180);
    var dLat = 0.00009, dLon = 0.00009 / k, m = 6;
    var w = Math.ceil((b.maxLon - b.minLon) / dLon) + 2 * m, h = Math.ceil((b.maxLat - b.minLat) / dLat) + 2 * m;
    var f = Math.max(1, Math.max(w, h) / 2000); if (f > 1) { dLat *= f; dLon *= f; w = Math.ceil((b.maxLon - b.minLon) / dLon) + 2 * m; h = Math.ceil((b.maxLat - b.minLat) / dLat) + 2 * m; }
    var lon0 = b.minLon - m * dLon, lat1 = b.maxLat + m * dLat, lon1 = lon0 + w * dLon, lat0 = lat1 - h * dLat;
    var url = JRC_WMS + '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=' + JRC_CAPA + '&STYLES=&SRS=EPSG:4326&BBOX=' + [lon0, lat0, lon1, lat1].join(',') + '&WIDTH=' + w + '&HEIGHT=' + h + '&FORMAT=image/png&TRANSPARENT=TRUE';
    return pixeles(url).then(function (im) {
      var areaPx = (dLat * M_GRADO) * (dLon * M_GRADO * k) / 10000, n = 0, total = 0, mascara = new Uint8Array(w * h);
      for (var y = 0; y < h; y++) { var lat = lat1 - (y + 0.5) * dLat; for (var x = 0; x < w; x++) { var es = im.d[(y * w + x) * 4 + 3] > 128; if (es) mascara[y * w + x] = 1; if (!dentro(lat, lon0 + (x + 0.5) * dLon, an)) continue; total++; if (es) n++; } }
      return { ha: n * areaPx, haPoligono: total * areaPx, w: w, h: h, lon0: lon0, lat1: lat1, dLon: dLon, dLat: dLat, mascara: mascara,
        esBosque: function (lat, lon) { var x = Math.floor((lon - lon0) / dLon), y = Math.floor((lat1 - lat) / dLat); return x >= 0 && y >= 0 && x < w && y < h && mascara[y * w + x] === 1; } };
    });
  }

  /* ---------- 2. pérdida de cobertura de árboles por año (Hansen / GFW) ---------- */
  function teselaX(lon) { return Math.floor((lon + 180) / 360 * Math.pow(2, Z)); }
  function teselaY(lat) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, Z)); }
  function perdida(an, jrc) {
    var b = limites(an), n = Math.pow(2, Z), x0 = teselaX(b.minLon), x1 = teselaX(b.maxLon), y0 = teselaY(b.maxLat), y1 = teselaY(b.minLat), pedidos = [];
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 16) return Promise.reject(new Error('el lote es demasiado grande para revisarlo de una vez'));
    for (var tx = x0; tx <= x1; tx++) for (var ty = y0; ty <= y1; ty++) (function (tx, ty) { pedidos.push(pixeles(GFW_TESELAS + Z + '/' + tx + '/' + ty + '.png').then(function (im) { return { tx: tx, ty: ty, im: im }; })); })(tx, ty);
    return Promise.all(pedidos).then(function (ts) {
      var porAnio = {}, sobreBosque = 0, puntos = [], version = null;
      ts.forEach(function (t) {
        var v = /\/(v\d+(?:\.\d+)*)\//.exec(t.im.url || ''); if (v) version = v[1];
        for (var py = 0; py < TAM; py++) {
          var my = (t.ty + (py + 0.5) / TAM) / n, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI;
          if (lat < b.minLat || lat > b.maxLat) continue;
          var lado = 40075016.686 * Math.cos(lat * Math.PI / 180) / n / TAM, areaPx = lado * lado / 10000;
          for (var px = 0; px < TAM; px++) {
            var i = (py * TAM + px) * 4, anio = t.im.d[i + 2]; if (!anio || t.im.d[i + 3] < 128) continue;
            var lon = (t.tx + (px + 0.5) / TAM) / n * 360 - 180; if (lon < b.minLon || lon > b.maxLon || !dentro(lat, lon, an)) continue;
            porAnio[anio] = (porAnio[anio] || 0) + areaPx;
            var eraBosque = jrc ? jrc.esBosque(lat, lon) : false;
            if (anio > ANIO_CORTE && eraBosque) sobreBosque += areaPx;
            puntos.push({ lat: lat, lon: lon, anio: anio });
          }
        }
      });
      var post = 0, pre = 0, detalle = [], ultimo = 0;
      Object.keys(porAnio).forEach(function (a) { a = +a; if (a > ANIO_CORTE) { post += porAnio[a]; detalle.push({ anio: 2000 + a, ha: porAnio[a] }); } else pre += porAnio[a]; if (a > ultimo) ultimo = a; });
      detalle.sort(function (p, q) { return p.anio - q.anio; });
      return { post: post, pre: pre, sobreBosque: sobreBosque, porAnio: detalle, puntos: puntos, version: version };
    });
  }

  /* ---------- 3. veredicto ---------- */
  function veredicto(r) {
    var b = r.bosque2020Ha, p = r.perdidaPostHa, sb = r.perdidaSobreBosqueHa;
    var notaBosque = b >= MIN_BOSQUE_HA ? ' Dentro del polígono hay ' + fmt(b, 1) + ' ha que el mapa de la UE marca como bosque en 2020: no se pueden desmontar.' : '';
    // Rojo: pérdida de árboles posterior a 2020 SOBRE lo que el mapa de la UE marca como bosque en 2020 (lo que el reglamento llama deforestación).
    if (sb >= MIN_BOSQUE_HA) return { nivel: 'revisar', color: '#B5371C', titulo: 'Revisar: pérdida de bosque después de 2020',
      texto: 'Los mapas marcan ' + fmt(sb, 1) + ' ha que eran bosque al 31/12/2020 según el mapa de la UE y que perdieron los árboles después' + (p > sb + 0.05 ? ' (' + fmt(p, 1) + ' ha de pérdida de árboles en total)' : '') + '. Puede ser desmonte, pero también fuego, cosecha de una plantación o un error del mapa: hay que mirarlo con las imágenes y con los papeles del lote antes de ofrecer ese grano para Europa.' + notaBosque };
    // Amarillo: hubo pérdida de árboles, pero donde el mapa de la UE no marcaba bosque en 2020, o es menos del mínimo que el reglamento considera bosque.
    if (p >= RUIDO_HA) return { nivel: 'atencion', color: '#B8731A', titulo: sb > 0 ? 'Mirar: pérdida chica de árboles después de 2020' : 'Mirar: pérdida de árboles después de 2020, fuera del bosque que marca la UE',
      texto: 'Los mapas marcan ' + fmt(p, 2) + ' ha con pérdida de cobertura de árboles desde 2021 dentro del polígono' + (sb > 0 ? ', de las cuales ' + fmt(sb, 2) + ' ha eran bosque en 2020 según el mapa de la UE (menos de ' + String(MIN_BOSQUE_HA).replace('.', ',') + ' ha, el mínimo que el reglamento considera bosque)' : ', en un lugar donde el mapa de la UE no marcaba bosque al 31/12/2020') + '. Suele ser un resto de monte ya abierto, una cortina, árboles aislados o el borde del lote. El mapa de la UE no es vinculante: conviene guardar una imagen del lote de fines de 2020 por si el comprador pregunta.' + notaBosque };
    return { nivel: 'ok', color: '#178029', titulo: 'Sin indicios de deforestación después del 31/12/2020',
      texto: (b < MIN_BOSQUE_HA ? 'El mapa de la UE no marca bosque dentro del polígono al 31/12/2020' : 'El bosque que había al 31/12/2020 sigue en pie') + ' y no hay pérdida de cobertura de árboles registrada desde 2021.' + notaBosque };
  }

  /* ---------- 4. dibujo del lote: bosque 2020 en verde, pérdida posterior en rojo ---------- */
  function dibujo(an, jrc, per) {
    var esc2 = Math.max(1, Math.floor(260 / Math.max(jrc.w, jrc.h))) || 1, c = document.createElement('canvas'); c.width = jrc.w * esc2; c.height = jrc.h * esc2;
    var x = c.getContext('2d'); x.fillStyle = '#F4F1E8'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#4D9221'; for (var yy = 0; yy < jrc.h; yy++) for (var xx = 0; xx < jrc.w; xx++) if (jrc.mascara[yy * jrc.w + xx]) x.fillRect(xx * esc2, yy * esc2, esc2, esc2);
    var lado = Math.max(2, Math.round(2 * esc2));
    per.puntos.forEach(function (p) { x.fillStyle = p.anio > ANIO_CORTE ? '#D62F1F' : '#9AA0A6'; x.fillRect(Math.floor((p.lon - jrc.lon0) / jrc.dLon) * esc2 - lado / 2 + esc2 / 2, Math.floor((jrc.lat1 - p.lat) / jrc.dLat) * esc2 - lado / 2 + esc2 / 2, lado, lado); });
    x.strokeStyle = '#1E2225'; x.lineWidth = Math.max(1.5, esc2 * 0.8);
    an.forEach(function (a) { x.beginPath(); a.forEach(function (p, i) { var px = (p[1] - jrc.lon0) / jrc.dLon * esc2, py = (jrc.lat1 - p[0]) / jrc.dLat * esc2; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath(); x.stroke(); });
    try { return c.toDataURL('image/png'); } catch (e) { return null; }
  }

  /* ---------- 5. revisión de un lote (con memoria local de 30 días) ---------- */
  var MEM = 'safia_eudr1:';
  function recordado(lote) { try { var r = JSON.parse(localStorage.getItem(MEM + lote.id) || 'null'); if (r && r.huella === huella(anillos(lote)) && (Date.now() - new Date(r.fecha + 'T12:00:00').getTime()) < 30 * 86400000) return r; } catch (e) {} return null; }
  function revisar(lote, forzar) {
    var an = anillos(lote); if (!an.length) return Promise.reject(new Error('el lote no tiene polígono'));
    if (!forzar) { var m = recordado(lote); if (m) return Promise.resolve(m); }
    return conTiempo(bosque2020(an), 45000, 'el mapa de bosque 2020 de la UE tardó demasiado').then(function (jrc) {
      return conTiempo(perdida(an, jrc), 45000, 'el mapa de pérdida de bosque tardó demasiado').then(function (per) {
        var r = { loteId: lote.id, fecha: hoyISO(), huella: huella(an), ha: Math.round(haDe(lote) * 100) / 100, bosque2020Ha: Math.round(jrc.ha * 100) / 100,
          perdidaPostHa: Math.round(per.post * 100) / 100, perdidaSobreBosqueHa: Math.round(per.sobreBosque * 100) / 100, perdidaAntesHa: Math.round(per.pre * 100) / 100,
          porAnio: per.porAnio.map(function (p) { return { anio: p.anio, ha: Math.round(p.ha * 100) / 100 }; }), fuenteBosque: JRC_NOMBRE, fuentePerdida: 'Hansen/UMD Tree Cover Loss ' + (per.version || '') + ' (Global Forest Watch), 30 m, copa ≥ 30 %' };
        r.imagen = dibujo(an, jrc, per); r.veredicto = veredicto(r);
        try { localStorage.setItem(MEM + lote.id, JSON.stringify(r)); } catch (e) { try { var s = Object.assign({}, r); delete s.imagen; localStorage.setItem(MEM + lote.id, JSON.stringify(s)); } catch (e2) {} }
        return r;
      });
    });
  }

  /* ---------- 6. archivo para el sistema europeo ---------- */
  function geojson(campo, lotes, cliente) {
    var r6 = function (v) { return Math.round(v * 1e6) / 1e6; };
    return { type: 'FeatureCollection', features: lotes.filter(tienePoligono).map(function (l) {
      var an = anillos(l).map(function (a) { var c = a.map(function (p) { return [r6(p[1]), r6(p[0])]; }); var u = c[c.length - 1]; if (u[0] !== c[0][0] || u[1] !== c[0][1]) c.push([c[0][0], c[0][1]]); return c; });
      return { type: 'Feature', properties: { ProducerName: cliente ? (cliente.nombre || cliente.razonSocial || '') : '', ProducerCountry: 'PY', ProductionPlace: (campo.nombre || '') + ' - ' + (l.nombre || ''), Area: Math.round(haDe(l) * 100) / 100 },
        geometry: an.length === 1 ? { type: 'Polygon', coordinates: [an[0]] } : { type: 'MultiPolygon', coordinates: an.map(function (c) { return [c]; }) } };
    }) };
  }
  function descargar(nombre, texto, tipo) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  /* ---------- 7. pantalla (Banco → Sin deforestación) ---------- */
  var iniciado = false, resultados = {};
  function lotesDelCampo(campo) { return leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id) && !e.zona; }); }
  function clienteDe(campo) { return leer('clientes').find(function (c) { return String(c.id) === String(campo.clienteId); }) || null; }
  function insignia(v) { return '<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;background:' + v.color + ';">' + (v.nivel === 'ok' ? 'Sin indicios' : v.nivel === 'atencion' ? 'Mirar' : 'Revisar') + '</span>'; }
  function tarjeta(l, r) {
    if (!tienePoligono(l)) return '<div class="card" style="margin-bottom:10px;"><b>' + esc(l.nombre) + '</b> <span class="muted">· ' + (l.tipo === 'secano' ? 'lote de secano' : 'pivot') + '</span><div class="muted" style="font-size:13px;margin-top:4px;">Falta el polígono del lote. Sin el contorno no se puede revisar ni declarar para Europa: lo carga Irrigar en Equipos y lotes (archivo de Google Earth o dibujándolo en el mapa).</div></div>';
    if (!r) return '<div class="card" style="margin-bottom:10px;"><b>' + esc(l.nombre) + '</b> <span class="muted">· ' + fmt(haDe(l), 1) + ' ha</span><div class="muted" style="font-size:13px;margin-top:4px;" id="eu_est_' + esc(l.id) + '">Todavía sin revisar.</div></div>';
    if (r.error) return '<div class="card" style="margin-bottom:10px;"><b>' + esc(l.nombre) + '</b><div style="font-size:13px;margin-top:4px;color:#B5371C;">No se pudo revisar: ' + esc(r.error) + '. Probá de nuevo en un rato.</div></div>';
    var v = r.veredicto, anios = r.porAnio.length ? r.porAnio.map(function (p) { return p.anio + ': ' + fmt(p.ha, 2) + ' ha'; }).join(' · ') : 'ninguna';
    return '<div class="card" style="margin-bottom:10px;border-left:5px solid ' + v.color + ';"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;">' +
      (r.imagen ? '<img src="' + r.imagen + '" alt="Mapa del lote" style="width:170px;height:auto;border:1px solid #E1E4E7;border-radius:8px;image-rendering:pixelated;">' : '') +
      '<div style="flex:1 1 280px;min-width:240px;"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><b style="font-size:15px;">' + esc(l.nombre) + '</b><span class="muted">' + fmt(r.ha, 1) + ' ha</span>' + insignia(v) + '</div>' +
      '<div style="font-weight:700;color:' + v.color + ';margin-top:6px;">' + v.titulo + '</div><div style="font-size:13px;line-height:1.45;margin-top:2px;">' + v.texto + '</div>' +
      '<div style="font-size:12px;color:#3A3E41;margin-top:8px;line-height:1.5;">Bosque al 31/12/2020 (mapa de la UE): <b>' + fmt(r.bosque2020Ha, 2) + ' ha</b> · Pérdida de árboles desde 2021: <b>' + fmt(r.perdidaPostHa, 2) + ' ha</b> (' + anios + ')' + (r.perdidaSobreBosqueHa > 0 ? ' · sobre bosque 2020: <b>' + fmt(r.perdidaSobreBosqueHa, 2) + ' ha</b>' : '') + ' · Pérdida anterior, 2001 a 2020: ' + fmt(r.perdidaAntesHa, 1) + ' ha (anterior a la fecha de corte: no cuenta para el reglamento)</div>' +
      '<div class="muted" style="font-size:11px;margin-top:4px;">Verde: bosque 2020 · rojo: pérdida desde 2021 · gris: pérdida hasta 2020 · línea: el lote. Revisado el ' + fmtF(r.fecha) + '.</div></div></div></div>';
  }
  function pintar() {
    var cont = $('eudrCont'), campo = B().campoActual(); if (!cont) return;
    if (!campo) { cont.innerHTML = '<div class="muted">Elegí un campo.</div>'; return; }
    var lotes = lotesDelCampo(campo); lotes.forEach(function (l) { if (!resultados[l.id]) { var m = tienePoligono(l) ? recordado(l) : null; if (m) resultados[l.id] = m; } });
    var conPol = lotes.filter(tienePoligono), listos = conPol.filter(function (l) { return resultados[l.id] && !resultados[l.id].error; });
    cont.innerHTML = '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;line-height:1.5;">Desde el <b>30 de diciembre de 2026</b> Europa solo compra soja de lotes <b>sin deforestación posterior al 31 de diciembre de 2020</b>, y pide el contorno de cada lote. SAFIA revisa tus lotes contra el mapa de bosque 2020 de la Unión Europea y contra el registro de pérdida de árboles año por año, y arma la constancia para entregarle a quien te compra el grano.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="btn green" id="euRevisar">' + (listos.length ? 'Revisar de nuevo' : 'Revisar los lotes') + '</button><button class="btn" id="euConstancia"' + (listos.length ? '' : ' disabled') + '>Constancia para imprimir</button><button class="btn" id="euGeo"' + (conPol.length ? '' : ' disabled') + '>Descargar los polígonos (GeoJSON)</button></div>' +
      '<div class="muted" id="euEstado" style="font-size:12px;margin-top:6px;"></div></div>' +
      (lotes.length ? lotes.map(function (l) { return tarjeta(l, resultados[l.id]); }).join('') : '<div class="card"><div class="muted">Este campo no tiene lotes cargados.</div></div>') +
      '<div class="muted" style="font-size:11px;line-height:1.5;margin-top:8px;">Fuentes: ' + JRC_NOMBRE + ' (mapa de referencia de la UE: la Comisión aclara que no es obligatorio, exclusivo ni jurídicamente vinculante) y Hansen / Universidad de Maryland, Tree Cover Loss, servido por Global Forest Watch (30 m; "pérdida" no siempre es deforestación: incluye cosecha de plantaciones, fuego y tormentas). Con píxeles de 10 y 30 m, los bordes del lote, las cortinas y los árboles aislados pueden dar diferencias chicas. SAFIA muestra lo que dicen los mapas: no es una certificación. La evaluación de riesgo y la responsabilidad ante la Unión Europea son del exportador.</div>';
    $('euRevisar').addEventListener('click', function () { revisarTodos(true); });
    $('euConstancia').addEventListener('click', constancia);
    $('euGeo').addEventListener('click', function () { var c = B().campoActual(); descargar('lotes_' + String(c.nombre || 'campo').replace(/[^A-Za-z0-9]+/g, '_') + '.geojson', JSON.stringify(geojson(c, lotesDelCampo(c), clienteDe(c)), null, 1), 'application/geo+json'); B().toast('Archivo de polígonos descargado'); });
  }
  function revisarTodos(forzar) {
    var campo = B().campoActual(), lotes = lotesDelCampo(campo).filter(tienePoligono), est = $('euEstado'), i = 0;
    if (!lotes.length) { B().toast('Ningún lote de este campo tiene polígono', true); return; }
    $('euRevisar').disabled = true;
    (function sig() {
      if (i >= lotes.length) { pintar(); B().toast('Revisión terminada'); return; }
      var l = lotes[i++]; if (est) est.textContent = 'Revisando ' + l.nombre + ' (' + i + ' de ' + lotes.length + ')…';
      revisar(l, forzar).then(function (r) { resultados[l.id] = r; }).catch(function (e) { console.error(e); resultados[l.id] = { error: (e && e.message) || 'sin conexión' }; }).then(sig);
    })();
  }

  /* ---------- 8. constancia para imprimir ---------- */
  function constancia() {
    var campo = B().campoActual(), cli = clienteDe(campo), lotes = lotesDelCampo(campo), conR = lotes.filter(function (l) { return resultados[l.id] && !resultados[l.id].error; });
    if (!conR.length) { B().toast('Primero revisá los lotes', true); return; }
    var sinPol = lotes.filter(function (l) { return !tienePoligono(l); }), tot = 0; conR.forEach(function (l) { tot += resultados[l.id].ha; });
    var centro = function (l) { var b = limites(anillos(l)); return ((b.minLat + b.maxLat) / 2).toFixed(6) + ', ' + ((b.minLon + b.maxLon) / 2).toFixed(6); };
    var filas = conR.map(function (l) { var r = resultados[l.id], v = r.veredicto;
      return '<div class="lote"><div class="fila">' + (r.imagen ? '<img src="' + r.imagen + '">' : '') + '<div><h3>' + esc(l.nombre) + ' <span class="ins" style="background:' + v.color + ';">' + (v.nivel === 'ok' ? 'Sin indicios' : v.nivel === 'atencion' ? 'Mirar' : 'Revisar') + '</span></h3>' +
        '<table><tr><td>Superficie del polígono</td><td><b>' + fmt(r.ha, 2) + ' ha</b></td></tr><tr><td>Centro del lote (latitud, longitud)</td><td>' + centro(l) + '</td></tr><tr><td>Bosque al 31/12/2020 según el mapa de la UE</td><td><b>' + fmt(r.bosque2020Ha, 2) + ' ha</b></td></tr>' +
        '<tr><td>Pérdida de cobertura de árboles desde 2021</td><td><b>' + fmt(r.perdidaPostHa, 2) + ' ha</b>' + (r.porAnio.length ? ' (' + r.porAnio.map(function (p) { return p.anio + ': ' + fmt(p.ha, 2); }).join('; ') + ')' : '') + '</td></tr>' +
        '<tr><td>De esa pérdida, sobre bosque 2020</td><td>' + fmt(r.perdidaSobreBosqueHa, 2) + ' ha</td></tr><tr><td>Pérdida anterior (2001 a 2020, no cuenta)</td><td>' + fmt(r.perdidaAntesHa, 1) + ' ha</td></tr></table>' +
        '<p><b style="color:' + v.color + ';">' + v.titulo + '.</b> ' + v.texto + '</p></div></div></div>'; }).join('');
    var w = window.open('', '_blank'); if (!w) { B().toast('El navegador bloqueó la ventana de impresión', true); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Constancia de revisión de deforestación · ' + esc(campo.nombre) + '</title><style>' +
      'body{font-family:"Plus Jakarta Sans",Arial,sans-serif;color:#2E3236;margin:26px;font-size:12.5px;line-height:1.45;} h1{font-size:19px;margin:6px 0 2px;} h2{font-size:14px;margin:16px 0 6px;border-bottom:2px solid #22A93A;padding-bottom:3px;} h3{font-size:14px;margin:0 0 4px;} .m{color:#6B7075;} .lote{border:1px solid #D5D9DD;border-radius:8px;padding:10px;margin:8px 0;page-break-inside:avoid;} .fila{display:flex;gap:12px;} .fila img{width:150px;height:150px;object-fit:contain;border:1px solid #E1E4E7;border-radius:6px;image-rendering:pixelated;} table{border-collapse:collapse;width:100%;} td{padding:2px 6px 2px 0;vertical-align:top;} td:first-child{color:#6B7075;width:46%;} .ins{color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;} .caja{border:1px solid #D5D9DD;border-radius:8px;padding:10px;margin-top:8px;} .linea{border-bottom:1px solid #9AA0A6;display:inline-block;min-width:230px;height:16px;} li{margin:3px 0;} @media print{body{margin:14mm;}}</style></head><body>' +
      '<div style="font-size:11px;color:#178029;font-weight:700;letter-spacing:.06em;">SAFIA · IRRIGAR S.A.</div><h1>Constancia de revisión de deforestación por lote</h1><div class="m">Reglamento (UE) 2023/1115 sobre productos libres de deforestación · fecha de corte 31 de diciembre de 2020</div>' +
      '<table style="margin-top:10px;"><tr><td>Productor</td><td><b>' + esc(cli ? (cli.nombre || cli.razonSocial || '') : '') + '</b>' + (cli && cli.documento ? ' · RUC / documento ' + esc(cli.documento) : '') + '</td></tr><tr><td>Establecimiento</td><td><b>' + esc(campo.nombre) + '</b> · ' + esc([campo.localidad, campo.departamento, campo.pais || 'Paraguay'].filter(Boolean).join(', ')) + '</td></tr><tr><td>Lotes revisados</td><td>' + conR.length + ' · ' + fmt(tot, 1) + ' ha en total</td></tr><tr><td>Fecha de la revisión</td><td>' + fmtF(hoyISO()) + '</td></tr></table>' +
      '<h2>Resultado por lote</h2>' + filas + (sinPol.length ? '<p class="m">Lotes del establecimiento sin polígono cargado (no se revisaron): ' + esc(sinPol.map(function (l) { return l.nombre; }).join(', ')) + '.</p>' : '') +
      '<p class="m">En los dibujos: verde = bosque en 2020; rojo = pérdida de árboles desde 2021; gris = pérdida hasta 2020; línea = contorno del lote. Los polígonos se entregan aparte en un archivo GeoJSON (WGS84, longitud y latitud con 6 decimales).</p>' +
      '<h2>Cómo se hizo la revisión</h2><ul><li><b>Bosque al 31/12/2020:</b> ' + JRC_NOMBRE + '. Es el mapa de referencia de la propia Unión Europea; la Comisión aclara que no es obligatorio, exclusivo ni jurídicamente vinculante.</li><li><b>Pérdida posterior:</b> ' + esc(conR.length ? resultados[conR[0].id].fuentePerdida : '') + '. "Pérdida de cobertura de árboles" no siempre es deforestación: incluye cosecha de plantaciones, fuego y tormentas.</li><li>Se cuentan los píxeles de cada mapa que caen dentro del contorno del lote. Con píxeles de 10 y 30 m, los bordes, las cortinas forestales y los árboles aislados pueden dar diferencias chicas. El reglamento considera bosque a más de 0,5 ha con árboles de más de 5 m y copa de más del 10 %.</li></ul>' +
      '<h2>Declaración del productor sobre el cumplimiento de las leyes del país</h2><div class="caja">Declaro que la producción de estos lotes se hizo cumpliendo las leyes del Paraguay y adjunto, según corresponda:<ul><li>Título de propiedad o contrato de arrendamiento del establecimiento.</li><li>Licencia ambiental vigente (Ley 294/93 de Evaluación de Impacto Ambiental, MADES).</li><li>Constancia de la reserva de bosques naturales del establecimiento (Ley 422/73 Forestal, artículo 42).</li><li>En la Región Oriental: que no se transformaron superficies con cobertura de bosque (Ley 2524/04 y su prórroga, Ley 6676/2020).</li><li>Que los lotes estaban habilitados para la agricultura antes del 31 de diciembre de 2020.</li></ul><p style="margin-top:14px;">Firma: <span class="linea"></span> &nbsp; Aclaración: <span class="linea"></span> &nbsp; Fecha: <span class="linea" style="min-width:110px;"></span></p></div>' +
      '<h2>Alcance de esta constancia</h2><p>Este documento es una <b>revisión con mapas satelitales públicos</b> hecha con SAFIA: sirve de respaldo para la debida diligencia que exige el reglamento, <b>no es una certificación</b> ni reemplaza la verificación del comprador. La evaluación de riesgo, la declaración de debida diligencia y la responsabilidad ante la Unión Europea corresponden al operador que pone el producto en el mercado europeo (artículos 10 y 11). Paraguay está clasificado como país de riesgo estándar (Reglamento de Ejecución (UE) 2025/1093).</p>' +
      '<p class="m" style="margin-top:14px;">Generado con SAFIA (Irrigar S.A.) el ' + fmtF(hoyISO()) + '.</p></body></html>');
    w.document.close(); setTimeout(function () { w.print(); }, 500);
  }
  function activar() { iniciado = true; pintar(); }
  function alCambiarCampo() { if (iniciado && $('panel-eudr') && $('panel-eudr').classList.contains('on')) pintar(); }

  window.SafiaEudr = { activar: activar, alCambiarCampo: alCambiarCampo, revisar: revisar, geojson: geojson, veredicto: veredicto, tienePoligono: tienePoligono, recordado: recordado };
})();
