/* SAFIA — Precios vigentes (granos e insumos) con historial
   -------------------------------------------------------------------
   Regla de Osmar (25-sep-2026): hay UN lugar para actualizar precios
   (Datos → Precios). Todo cálculo hacia adelante (plan de la meta,
   economía, proyección) usa los precios VIGENTES; una campaña cerrada
   guarda el precio de venta con la cosecha y ese queda congelado.
   Colección `precios` (localStorage, sincronizada a safia_precios): una
   fila por actualización { id, vigenteDesde, granoUSDt{}, calcareoUSDt,
   yesoUSDt, p2o5USDkg, k2oUSDkg, nUSDkg, sUSDkg, ..., nota }. Los
   precios vigentes son los de la fila más nueva con vigenteDesde ≤ hoy. */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function guardar(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function hoy() { return window.SafiaBalance && SafiaBalance.hoyLocal ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; }
  function base() { return window.SafiaMeta && SafiaMeta.PRECIOS_DEFAULT ? JSON.parse(JSON.stringify(SafiaMeta.PRECIOS_DEFAULT)) : { granoUSDt: {} }; }
  function ordenadas() { return leer('precios').filter(function (p) { return p && p.vigenteDesde; }).sort(function (a, b) { return String(a.vigenteDesde).localeCompare(String(b.vigenteDesde)) || (a.id > b.id ? 1 : -1); }); }
  function aplicar(p, fila) {
    if (!fila) return p;
    Object.keys(fila).forEach(function (k) {
      if (k === 'granoUSDt') Object.keys(fila.granoUSDt || {}).forEach(function (g) { var v = num(fila.granoUSDt[g]); if (v != null) p.granoUSDt[g] = v; });
      else if (/USD/.test(k)) { var v2 = num(fila[k]); if (v2 != null) p[k] = v2; }
    });
    return p;
  }
  // fila vigente a una fecha (la más nueva con vigenteDesde ≤ fecha)
  function filaEn(fecha) { var f = String(fecha || hoy()).slice(0, 10), lista = ordenadas().filter(function (p) { return String(p.vigenteDesde).slice(0, 10) <= f; }); return lista.length ? lista[lista.length - 1] : null; }
  function vigentes() { var fila = filaEn(hoy()); return { precios: aplicar(base(), fila), desde: fila ? fila.vigenteDesde : null, fila: fila }; }
  function en(fecha) { return aplicar(base(), filaEn(fecha)); }
  function precioGrano(cultivo, fecha) { var p = fecha ? en(fecha) : vigentes().precios, k = window.SafiaMeta ? SafiaMeta.claveCultivo(cultivo) : 'otro'; return p.granoUSDt[k] != null ? p.granoUSDt[k] : (p.granoUSDt.otro || null); }
  // guarda una actualización nueva (no pisa el historial)
  function actualizar(valores, vigenteDesde, nota) {
    var lista = leer('precios'), fila = { id: Date.now(), vigenteDesde: String(vigenteDesde || hoy()).slice(0, 10), granoUSDt: {}, nota: String(nota || '').trim(), fechaCreacion: new Date().toISOString() };
    Object.keys(valores.granoUSDt || {}).forEach(function (g) { var v = num(valores.granoUSDt[g]); if (v != null) fila.granoUSDt[g] = v; });
    Object.keys(valores).forEach(function (k) { if (k !== 'granoUSDt' && /USD/.test(k)) { var v = num(valores[k]); if (v != null) fila[k] = v; } });
    lista.push(fila); guardar('precios', lista); return fila;
  }
  function borrar(id) { guardar('precios', leer('precios').filter(function (p) { return String(p.id) !== String(id); })); }
  function historial() { return ordenadas().slice().reverse(); }
  window.SafiaPrecios = { vigentes: vigentes, en: en, precioGrano: precioGrano, actualizar: actualizar, borrar: borrar, historial: historial, filaEn: filaEn };
})();
