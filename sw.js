/* SAFIA — service worker (app instalable + modo sin conexión)
   ---------------------------------------------------------------
   - Precarga las páginas y scripts propios (app shell).
   - Páginas y scripts propios: primero red, si no hay, caché
     (así cada Ctrl+F5 con internet trae la versión nueva).
   - Librerías externas (supabase-js, Leaflet, fuentes, mapas): caché
     primero y se renuevan en segundo plano.
   - Nunca cachea llamadas a Supabase, Open-Meteo ni a la IA: esas
     necesitan internet y el sync ya trabaja en modo local sin ella.
   Cambiar VERSION al publicar cambios grandes para limpiar cachés viejas. */
var VERSION = 'safia-v172';
var SHELL = [
  './', './index.html', './login.html', './mis-clientes.html', './mis-campos.html', './mis-equipos.html', './mis-cultivos.html',
  './mis-campanas.html', './ficha.html', './usuarios.html', './banco.html', './referencia.html', './referencia-forraje.html', './clima.html', './prediccion.html', './evaluar.html', './rankings.html', './asistente.html', './suscripciones.html', './conexiones.html',
  './operador.html', './eventos.html', './encargado.html', './propietario.html', './analisis.html', './voz.html', './backup.html', './informe.html',
  './safia-theme.css', './safia-sync.js', './safia-pwa.js', './safia-iconos.js', './safia-cultivos-fao.js', './safia-casos.js',
  './safia-insumos.js', './safia-catalogo.js', './safia-senave.js', './safia-materiales-datos.js', './safia-ciclo.js', './safia-fertilidad.js', './safia-agronomia.js', './safia-mapas.js', './safia-lotes.js', './safia-ndvi.js', './safia-uniformidad.js', './safia-rotacion.js', './safia-meta.js', './safia-informe.js', './safia-foliar.js', './safia-sensores.js', './safia-humedad.js', './safia-agua.js', './safia-energia.js', './safia-seguimiento.js',
  './safia-clima.js', './safia-balance.js', './safia-accesos.js', './safia-cuenta.js', './safia-pasturas.js', './safia-forraje.js', './safia-pulverizar.js', './safia-parte.js', './safia-asistencia.js', './safia-fertirriego.js', './safia-enfermedades.js', './safia-acierto.js', './safia-dron.js', './safia-aprende.js', './aprende.html', './safia-asistencias.js', './asistencias.html', './seguimiento.html', './safia-ficha.js', './safia-nutrientes.js', './safia-precios.js', './safia-asistente.js', './safia-manual-riego.js', './safia-manual.js', './safia-mantenimiento.js', './safia-calidad-agua.js', './safia-clima-proyecto.js', './safia-clima-py.js', './safia-economia-riego.js', './safia-fieldnet.js', './safia-igualar.js', './safia-informe-evaluacion.js', './safia-materiales.js', './informe-evaluacion.html', './safia-lluvia.js', './safia-ficha-agua.js', './precios.html', './manifest.webmanifest', './icons/safia-192.png', './icons/safia-512.png'
];
var NO_CACHEAR = /supabase\.co|open-meteo\.com|anthropic\.com|dataspace\.copernicus\.eu|arcgisonline\.com\/.*\/tile\/|tile\.openstreetmap\.org/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { /* una página que falte no frena la instalación */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  if (NO_CACHEAR.test(url)) return;                       // datos en vivo: siempre red
  var propio = url.indexOf(self.location.origin) === 0;
  if (propio) {
    // Red primero; sin red, la copia guardada
    e.respondWith(fetch(req).then(function (r) {
      if (r && r.ok) { var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    }));
  } else {
    // Librerías y fuentes externas: caché primero, renovación en segundo plano
    e.respondWith(caches.match(req).then(function (enCache) {
      var red = fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) { var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
        return r;
      }).catch(function () { return enCache; });
      return enCache || red;
    }));
  }
});

/* ---- avisos al celular: la notificación llega aunque SAFIA esté cerrada (la manda la edge safia-avisos) ---- */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: 'SAFIA', cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'SAFIA', {
    body: d.cuerpo || '', icon: 'icons/safia-192.png', badge: 'icons/safia-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' }
  }));
});
// Al tocar el aviso se abre SAFIA en la pantalla que corresponde (el pivot del aviso)
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var pedido = (e.notification.data && e.notification.data.url) || './';
  // los avisos del riego abren Operador o Encargado; con la marca, el dueño y el encargado siguen de ahí al parte de seguimiento
  if (/^(operador|encargado)\.html/.test(pedido)) pedido += (pedido.indexOf('?') >= 0 ? '&' : '?') + 'aviso=1';
  var destino = new URL(pedido, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if ('focus' in cs[i]) { if ('navigate' in cs[i]) { try { cs[i].navigate(destino); } catch (x) {} } return cs[i].focus(); }
    }
    return self.clients.openWindow(destino);
  }));
});
