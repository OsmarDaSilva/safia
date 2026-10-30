/* SAFIA — Rotación leída desde el satélite (pedido de Osmar, 30-oct-2026)
   -------------------------------------------------------------------
   Aunque el operador no cargue la entrada de los animales, el satélite deja la huella: el piquete que se comió cae
   de golpe en NDVI (por ejemplo de 0,90 a 0,55) mientras los vecinos siguen altos. Este módulo:
   - detecta esos "consumos" entre dos pasadas limpias consecutivas (caída ≥ UMBRAL_CAIDA partiendo de ≥ MIN_ANTES);
     si cae más de la mitad del pivot a la vez no es pastoreo sino un evento general (helada, seca, corte total);
   - ordena los consumos de una misma ventana siguiendo el alambrado (el orden de los piquetes) desde la última
     posición conocida, y reparte las fechas estimadas dentro de la ventana;
   - cruza con lo que cargó el operador: si él anotó la entrada, su dato manda y el satélite solo confirma; lo que el
     operador marcó como "no fue así" se descarta; lo demás queda como "según satélite" (pendiente) y se puede confirmar
     con un toque (crea los eventos de pastoreo reales, cargadoPor 'satelite');
   - estima dónde están los animales hoy (operador > satélite > proyección por días de ocupación) y los kilos comidos
     cuando hay calibración regla ↔ NDVI (SafiaPiquetes.regresion) y el factor kg/cm de SafiaForraje.
   Límites: Sentinel-2 pasa cada 5 días y las nubes alargan la ventana; entre pasadas no se sabe el día exacto ni las
   cabezas. Sobre 0,85 el NDVI se satura: la caída se ve, el engorde no. Depende de SafiaPiquetes, SafiaPasturas y,
   para los kilos, SafiaForraje. */
(function () {
  'use strict';
  var UMBRAL_CAIDA = 0.10, MIN_ANTES = 0.45, NUBES_MAX = 40, DIAS_RECIENTE = 6;
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function leerObj(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function dia(f) { return String(f || '').slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(dia(b) + 'T12:00:00') - new Date(dia(a) + 'T12:00:00')) / 86400000); }
  function sumarDias(f, n) { var d = new Date(dia(f) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtF(f) { var p = dia(f).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  function fmtN(n) { return n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('es-PY'); }
  function claveDescartes(equipoId) { return 'rotacion_descartes_' + String(equipoId); }
  function descartes(equipoId) { return leerObj(claveDescartes(equipoId)) || []; }
  function esDescartado(equipoId, piquete, hasta) { return descartes(equipoId).some(function (d) { return String(d.piquete) === String(piquete) && d.hasta === hasta; }); }

  /* ---------- el análisis: consumos, eventos generales, posición de hoy ---------- */
  function analizar(equipo, cultivo, pasadasOpc) {
    if (!equipo || !window.SafiaPiquetes || !window.SafiaPasturas) return null;
    var g = SafiaPiquetes.sectores(equipo, cultivo); if (!g) return null;
    var pasadas = (pasadasOpc || SafiaPiquetes.pasadasValidas(equipo, cultivo)).slice().sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    var orden = g.lista.map(function (s) { return String(s.piquete); }), N = orden.length;
    var movs = SafiaPasturas.eventosLote(equipo.id), st = SafiaPasturas.estadoPiquetes(equipo.id, cultivo);
    var reg = SafiaPiquetes.regresion(SafiaPiquetes.pares(equipo, pasadas));
    var factor = null; try { factor = window.SafiaForraje && SafiaForraje.factorDe ? SafiaForraje.factorDe(equipo.id, cultivo) : null; } catch (e) { factor = null; }
    var kgCm = factor && factor.kgCm ? factor.kgCm : null;
    var consumos = [], generales = [], i, ultimoPos = null;   // último piquete donde se vio (o anotó) a los animales
    var entradaAntes = function (fecha) { var e = null; movs.forEach(function (m) { if (m.accion === 'entrada' && dia(m.fecha) <= fecha) e = m; }); return e ? String(e.piquete) : null; };
    for (i = 1; i < pasadas.length; i++) {
      var A = pasadas[i - 1], B = pasadas[i], dias = diasEntre(A.fecha, B.fecha); if (dias <= 0) continue;
      var caidas = [], conDato = 0;
      orden.forEach(function (p) {
        var a = A.por[p], b = B.por[p]; if (!a || !b) return; conDato++;
        var nub = (a.nubes_pct > NUBES_MAX) || (b.nubes_pct > NUBES_MAX);
        if (a.ndvi >= MIN_ANTES && (a.ndvi - b.ndvi) >= UMBRAL_CAIDA) caidas.push({ piquete: p, antes: a.ndvi, despues: b.ndvi, caida: a.ndvi - b.ndvi, nubes: nub });
      });
      if (!conDato) continue;
      if (caidas.length > conDato / 2) { generales.push({ desde: A.fecha, hasta: B.fecha, n: caidas.length, caidaMedia: caidas.reduce(function (s, c) { return s + c.caida; }, 0) / caidas.length }); continue; }
      if (!caidas.length) continue;
      // orden por el alambrado desde la última posición conocida (lo anotado por el operador antes de la ventana manda)
      var ref = entradaAntes(A.fecha) || ultimoPos, k0 = ref ? orden.indexOf(ref) : -1;
      caidas.sort(function (x, y) { var ix = (orden.indexOf(x.piquete) - k0 - 1 + N * 2) % N, iy = (orden.indexOf(y.piquete) - k0 - 1 + N * 2) % N; return ix - iy; });
      var m = caidas.length;
      caidas.forEach(function (c, j) {
        var fe = sumarDias(A.fecha, Math.max(1, Math.round((j + 1) * dias / (m + 1))));
        var conf = (c.caida >= 0.2 && dias <= 10 && !c.nubes) ? 'alta' : (c.nubes || dias > 20 ? 'baja' : 'media');
        var altA = reg ? reg.estimar(c.antes) : null, altB = reg ? reg.estimar(c.despues) : null;
        var kg = altA != null && altB != null && kgCm ? Math.max(0, altA - altB) * kgCm : null;
        var anotado = movs.filter(function (mv) { return mv.accion === 'entrada' && String(mv.piquete) === c.piquete && dia(mv.fecha) >= sumarDias(A.fecha, -2) && dia(mv.fecha) <= sumarDias(B.fecha, 2); })[0] || null;
        var estado = anotado ? (anotado.cargadoPor === 'satelite' ? 'confirmado' : 'anotado') : (esDescartado(equipo.id, c.piquete, B.fecha) ? 'descartado' : 'pendiente');
        consumos.push({ piquete: c.piquete, desde: A.fecha, hasta: B.fecha, dias: dias, fechaEstimada: fe, orden: j + 1, de: m, ndviAntes: c.antes, ndviDespues: c.despues, caida: c.caida, altAntes: altA, altDespues: altB, kgHaComidos: kg, confianza: conf, estado: estado, anotado: anotado });
        ultimoPos = c.piquete;
      });
    }
    var validos = consumos.filter(function (c) { return c.estado !== 'descartado'; });
    // días de ocupación observados: la ventana repartida entre los piquetes que cayeron en ella
    var ventanas = {}; validos.forEach(function (c) { var k = c.desde + '|' + c.hasta; ventanas[k] = ventanas[k] || { dias: c.dias, n: 0 }; ventanas[k].n++; });
    var vs = Object.keys(ventanas).map(function (k) { return ventanas[k]; }).filter(function (v) { return v.n > 0 && v.dias <= 20; });
    var ocupObs = vs.length ? Math.round(vs.reduce(function (s, v) { return s + v.dias / v.n; }, 0) / vs.length * 10) / 10 : null;
    var ocupPlan = parseFloat(cultivo && cultivo.diasOcupacion) || null, ocup = ocupPlan || ocupObs || null;
    // los piquetes con más pasto hoy (adonde el productor manda los animales): NDVI más alto en la última pasada, salvo los comidos en los últimos 10 días
    var h = hoy(), ultPas = pasadas[pasadas.length - 1] || null, comidosRecien = {};
    validos.forEach(function (c) { if (diasEntre(c.hasta, h) <= 10) comidosRecien[c.piquete] = 1; });
    var masPasto = ultPas ? orden.filter(function (p) { return ultPas.por[p] && !comidosRecien[p]; }).map(function (p) { var e = st.piquetes.filter(function (x) { return String(x.piquete) === p; })[0]; return { piquete: p, ndvi: ultPas.por[p].ndvi, fecha: ultPas.fecha, altura: e && e.altura ? e.altura : null, alt: reg ? reg.estimar(ultPas.por[p].ndvi) : null }; }).sort(function (a, b) { return b.ndvi - a.ndvi || (b.altura || 0) - (a.altura || 0); }) : [];
    // dónde están hoy: operador > satélite reciente > probable (los de más pasto)
    var posicionHoy = null;
    // la entrada cargada manda mientras sea creíble: si pasaron más de 3 ocupaciones (o 6 días sin dato de ocupación) sin salida, ya quedó vieja y vale lo que ve el satélite
    var ueOp = st.ocupado ? movs.filter(function (mv) { return mv.accion === 'entrada'; }).slice(-1)[0] : null, diasOp = ueOp ? diasEntre(ueOp.fecha, h) : null, entradaVieja = ueOp && diasOp > Math.max(ocup ? ocup * 3 : 0, DIAS_RECIENTE);
    if (st.ocupado && !entradaVieja) posicionHoy = { piquete: String(st.ocupado), fuente: 'operador', desde: ueOp ? ueOp.fecha : null, confianza: 'alta', texto: 'cargado por el operador' };
    else {
      var ult = validos.slice().sort(function (a, b) { return a.hasta.localeCompare(b.hasta) || a.orden - b.orden; }).pop();
      // "reciente" depende de cuánto duran en cada piquete: con 1 día de ocupación, a los 2 días ya se fueron
      var reciente = ocup ? Math.max(1, Math.round(ocup * 1.5)) : DIAS_RECIENTE;
      if (ult) {
        var dd = diasEntre(ult.hasta, h);
        if (dd <= reciente) posicionHoy = { piquete: ult.piquete, fuente: 'satelite', desde: ult.desde, hasta: ult.hasta, confianza: ult.confianza, texto: 'según satélite, consumo visto entre el ' + fmtF(ult.desde) + ' y el ' + fmtF(ult.hasta) };
      }
      if (!posicionHoy && masPasto.length) posicionHoy = { piquete: masPasto[0].piquete, piquetes: masPasto.slice(0, 2).map(function (x) { return x.piquete; }), fuente: 'probable', desde: null, confianza: 'baja', texto: 'probablemente en el ' + masPasto.slice(0, 2).map(function (x) { return x.piquete; }).join(' o el ') + ': son los de más pasto (NDVI ' + masPasto[0].ndvi.toFixed(2) + ' el ' + fmtF(masPasto[0].fecha) + ') y los animales van al piquete con más masa' + (ult ? '; el último consumo visto fue en el ' + ult.piquete + ' el ' + fmtF(ult.hasta) : '') };
      if (posicionHoy && entradaVieja) posicionHoy.entradaVieja = { piquete: String(st.ocupado), fecha: ueOp.fecha, dias: diasOp };
    }
    return { masPasto: masPasto.slice(0, 4), entradaVieja: entradaVieja ? { piquete: String(st.ocupado), fecha: ueOp.fecha, dias: diasOp } : null, consumos: consumos, generales: generales, posicionHoy: posicionHoy, ocupacionDias: ocup, ocupacionObservada: ocupObs, ultimaPasada: pasadas[pasadas.length - 1] || null, pasadas: pasadas, regresion: reg, kgCm: kgCm, orden: orden };
  }
  function consumosDe(an, piquete) { return an ? an.consumos.filter(function (c) { return String(c.piquete) === String(piquete); }).sort(function (a, b) { return b.hasta.localeCompare(a.hasta); }) : []; }
  function ultimoPendiente(an, piquete) { return consumosDe(an, piquete).filter(function (c) { return c.estado === 'pendiente'; })[0] || null; }

  /* ---------- lo que decide el operador ---------- */
  function descartar(equipoId, piquete, hasta) { var d = descartes(equipoId); if (!esDescartado(equipoId, piquete, hasta)) { d.push({ piquete: String(piquete), hasta: hasta, fecha: hoy() }); try { localStorage.setItem(claveDescartes(equipoId), JSON.stringify(d)); } catch (e) {} } }
  function confirmar(equipoId, campanaId, consumo) {
    if (!consumo) return null;
    var eventos = leer('eventos'), base = Date.now(), nota = 'Según satélite: NDVI ' + consumo.ndviAntes.toFixed(2) + ' → ' + consumo.ndviDespues.toFixed(2) + ' entre el ' + fmtF(consumo.desde) + ' y el ' + fmtF(consumo.hasta) + '; confirmado por el operador';
    var entrada = { id: base, fecha: consumo.fechaEstimada, equipoId: equipoId, campanaId: campanaId || null, tipo: 'pastoreo', accion: 'entrada', piquete: String(consumo.piquete), observaciones: nota, cargadoPor: 'satelite', fechaCreacion: new Date().toISOString() };
    if (consumo.kgHaComidos != null && consumo.altAntes != null) { entrada.alturaCm = consumo.altAntes; }
    eventos.push(entrada);
    // si la ventana ya cerró y no es la posición actual, también la salida (al final de la ventana)
    if (consumo.hasta && diasEntre(consumo.hasta, hoy()) > DIAS_RECIENTE && consumo.hasta > consumo.fechaEstimada) eventos.push({ id: base + 1, fecha: consumo.hasta, equipoId: equipoId, campanaId: campanaId || null, tipo: 'pastoreo', accion: 'salida', piquete: String(consumo.piquete), observaciones: 'Salida estimada por satélite', cargadoPor: 'satelite', fechaCreacion: new Date().toISOString() });
    try { localStorage.setItem('eventos', JSON.stringify(eventos)); } catch (e) {}
    return entrada;
  }

  /* ---------- HTML ---------- */
  var COLOR_CONF = { alta: '#178029', media: '#B8731A', baja: '#8C9196' };
  function htmlFicha(equipo, cultivo, piquete, an) {
    an = an || analizar(equipo, cultivo); if (!an) return '';
    var lista = consumosDe(an, piquete), h = '';
    if (lista.length) {
      h += '<div style="margin-top:10px;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:#8C9196;">Lo que vio el satélite</div>';
      lista.slice(0, 3).forEach(function (c) {
        var tag = c.estado === 'anotado' ? '<span style="color:#2E72C8;font-weight:600;">coincide con lo cargado</span>' : c.estado === 'confirmado' ? '<span style="color:#178029;font-weight:600;">confirmado</span>' : c.estado === 'descartado' ? '<span style="color:#8C9196;">descartado</span>' : '<span style="color:' + COLOR_CONF[c.confianza] + ';font-weight:600;">según satélite · confianza ' + c.confianza + '</span>';
        h += '<div style="font-size:12px;color:#2E3236;margin-top:4px;line-height:1.4;">Consumo entre el <b>' + fmtF(c.desde) + '</b> y el <b>' + fmtF(c.hasta) + '</b>' + (c.de > 1 ? ' (' + c.orden + '° de ' + c.de + ' piquetes en esa ventana, ~' + fmtF(c.fechaEstimada) + ')' : '') + ': NDVI ' + c.ndviAntes.toFixed(2) + ' → ' + c.ndviDespues.toFixed(2) +
          (c.altAntes != null ? ' · ~' + c.altAntes + ' → ' + c.altDespues + ' cm' : '') + (c.kgHaComidos != null ? ' · <b>~' + fmtN(c.kgHaComidos) + ' kg MS/ha comidos</b>' : '') + ' · ' + tag + '</div>';
        if (c.estado === 'pendiente' && window.SafiaPiqueteAccion) h += '<div style="display:flex;gap:6px;margin-top:4px;"><button type="button" data-piq-accion="confirmar-sat" data-piquete="' + esc(piquete) + '" data-desde="' + c.desde + '" data-hasta="' + c.hasta + '" style="font:inherit;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:7px;border:1px solid #178029;background:#fff;color:#178029;cursor:pointer;">Sí, pasaron por acá</button><button type="button" data-piq-accion="descartar-sat" data-piquete="' + esc(piquete) + '" data-hasta="' + c.hasta + '" style="font:inherit;font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:7px;border:1px solid #E1E4E7;background:#fff;color:#5B6167;cursor:pointer;">No fue así</button></div>';
      });
    }
    // historial satelital del piquete: cada pasada con NDVI y, si hay calibración, altura y kilos
    var serie = an.pasadas.map(function (p) { var v = p.por[String(piquete)]; return v ? { fecha: p.fecha, ndvi: v.ndvi, alt: an.regresion ? an.regresion.estimar(v.ndvi) : null } : null; }).filter(Boolean).slice(-6).reverse();
    if (serie.length > 1) {
      h += '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:11px;color:#1565C0;font-weight:600;">Historial satelital del piquete (' + serie.length + ' pasadas)</summary><table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;"><tr style="color:#8C9196;text-align:left;"><th style="font-weight:600;">Fecha</th><th style="font-weight:600;">NDVI</th>' + (an.regresion ? '<th style="font-weight:600;">~cm</th>' + (an.kgCm ? '<th style="font-weight:600;">~kg MS/ha</th>' : '') : '') + '</tr>' +
        serie.map(function (s) { return '<tr style="border-top:1px solid #EEF0F2;"><td style="padding:2px 0;">' + fmtF(s.fecha) + '</td><td>' + s.ndvi.toFixed(2) + '</td>' + (an.regresion ? '<td>' + s.alt + '</td>' + (an.kgCm ? '<td>' + fmtN(s.alt * an.kgCm) + '</td>' : '') : '') + '</tr>'; }).join('') + '</table>' + (an.regresion ? '' : '<div style="font-size:11px;color:#8C9196;margin-top:3px;">Con 3 lecturas de regla a ±3 días de una pasada, acá aparecen también la altura y los kilos estimados.</div>') + '</details>';
    }
    return h;
  }
  // texto corto para la tarjeta "Animales hoy" cuando el operador no cargó la entrada
  function textoHoy(an) {
    if (!an || !an.posicionHoy || an.posicionHoy.fuente === 'operador') return null;
    var p = an.posicionHoy;
    return { piquete: p.piquete, titulo: (p.fuente === 'probable' ? 'Piquete ' + (p.piquetes || [p.piquete]).join(' o ') : 'Piquete ' + p.piquete) + ' <span style="font-size:11px;font-weight:600;color:' + COLOR_CONF[p.confianza] + ';">' + (p.fuente === 'satelite' ? 'según satélite' : 'probable') + '</span>', sub: (p.entradaVieja ? 'La entrada cargada al ' + p.entradaVieja.piquete + ' el ' + fmtF(p.entradaVieja.fecha) + ' ya quedó vieja (' + p.entradaVieja.dias + ' días sin salida). ' : '') + p.texto + (an.ocupacionObservada ? ' · ocupación observada ~' + an.ocupacionObservada + ' días por piquete' : '') + '. Cargá la entrada con las cabezas para que SAFIA cuente la carga animal.', fuente: p.fuente, confianza: p.confianza };
  }
  // etiqueta corta para la tabla de piquetes
  function etiquetaTabla(an, piquete) {
    var c = consumosDe(an, piquete)[0]; if (!c || c.estado === 'descartado') return null;
    var hace = diasEntre(c.hasta, hoy()), ahora = an.ultimaPasada && an.ultimaPasada.por[String(piquete)] ? an.ultimaPasada.por[String(piquete)].ndvi : null;
    var recuperado = ahora != null && ahora >= Math.min(c.ndviAntes - 0.05, 0.8);
    if (recuperado || hace > 20) return 'Comido ~' + fmtF(c.fechaEstimada) + (c.estado === 'anotado' ? '' : ' (satélite)') + (recuperado ? ' · recuperado' : '') + (an.ocupacionDias ? ' · descansa ' + hace + ' d' : '');
    return (c.estado === 'anotado' ? 'Comido ' : 'Comido según satélite ') + (hace <= 0 ? 'hoy' : 'hace ' + hace + ' día' + (hace === 1 ? '' : 's')) + (c.kgHaComidos != null ? ' · ~' + fmtN(c.kgHaComidos) + ' kg/ha' : '');
  }

  window.SafiaRotacion = { analizar: analizar, consumosDe: consumosDe, ultimoPendiente: ultimoPendiente, confirmar: confirmar, descartar: descartar, htmlFicha: htmlFicha, textoHoy: textoHoy, etiquetaTabla: etiquetaTabla, UMBRAL_CAIDA: UMBRAL_CAIDA, MIN_ANTES: MIN_ANTES };
})();
