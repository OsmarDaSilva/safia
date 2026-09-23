/* SAFIA — app instalable y aviso de conexión
   ---------------------------------------------------------------
   Incluir en todas las páginas después de safia-sync.js.
   - Registra el service worker (solo funciona publicado en https o en
     localhost; abriendo el archivo directo desde la PC no aplica).
   - Muestra "Instalar SAFIA" en el menú cuando el navegador lo permite
     (Chrome/Edge en PC y Android). En iPhone se instala desde
     Compartir → "Agregar a inicio": se explica en el botón.
   - Muestra una franja "Sin conexión" cuando no hay internet: SAFIA
     sigue funcionando con los datos del navegador y sincroniza al volver. */
(function () {
  'use strict';
  var esWeb = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  /* ---- service worker ---- */
  if (esWeb && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SAFIA: no se pudo registrar el service worker', e); });
    });
  }

  /* ---- botón Instalar ---- */
  var eventoInstalar = null;
  var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var yaInstalada = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function botonInstalar() {
    if (document.getElementById('safiaInstalar')) return document.getElementById('safiaInstalar');
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return null;
    var b = document.createElement('button');
    b.id = 'safiaInstalar'; b.type = 'button';
    b.style.cssText = 'display:none;width:calc(100% - 16px);margin:14px 8px 4px;padding:9px 12px;border-radius:8px;border:1px solid rgba(212,162,76,.55);background:rgba(212,162,76,.16);color:#FAF6EC;font:600 12px/1.3 inherit;cursor:pointer;text-align:left;';
    b.innerHTML = '<span style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>Instalar SAFIA en este dispositivo</span>';
    sidebar.appendChild(b);
    return b;
  }
  function mostrarBoton(texto, accion) {
    var b = botonInstalar(); if (!b) return;
    if (texto) b.querySelector('span').lastChild.textContent = texto;
    b.style.display = 'block';
    b.onclick = accion;
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); eventoInstalar = e;
    if (yaInstalada) return;
    mostrarBoton('Instalar SAFIA en este dispositivo', function () {
      if (!eventoInstalar) return;
      eventoInstalar.prompt();
      eventoInstalar.userChoice.then(function (r) { if (r.outcome === 'accepted') { document.getElementById('safiaInstalar').style.display = 'none'; } eventoInstalar = null; });
    });
  });
  window.addEventListener('appinstalled', function () { var b = document.getElementById('safiaInstalar'); if (b) b.style.display = 'none'; });
  if (esWeb && esIOS && !yaInstalada) {
    document.addEventListener('DOMContentLoaded', function () {
      mostrarBoton('Instalar en iPhone: Compartir → "Agregar a inicio"', function () { alert('En Safari: tocá el botón Compartir (el cuadrado con la flecha) y elegí "Agregar a pantalla de inicio". SAFIA queda como una app.'); });
    });
  }

  /* ---- franja sin conexión ---- */
  function franja() {
    var f = document.getElementById('safiaOffline');
    if (f) return f;
    f = document.createElement('div'); f.id = 'safiaOffline';
    f.style.cssText = 'display:none;position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#B5371C;color:#fff;font:600 12px/1.4 system-ui,sans-serif;padding:7px 14px;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.25);';
    f.textContent = 'Sin conexión: SAFIA sigue funcionando con los datos guardados en este dispositivo. Los cambios se sincronizan cuando vuelva internet.';
    document.body.appendChild(f);
    return f;
  }
  function actualizarConexion() {
    var f = franja();
    f.style.display = navigator.onLine ? 'none' : 'block';
  }
  window.addEventListener('online', actualizarConexion);
  window.addEventListener('offline', actualizarConexion);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', actualizarConexion); else actualizarConexion();
})();
