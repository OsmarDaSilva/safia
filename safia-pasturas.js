/* SAFIA — Pasturas bajo riego (pastoreo rotativo intensivo, corte)
   -------------------------------------------------------------------
   Una pastura no se siembra y se cosecha: se implanta una vez y se
   maneja todo el año en piquetes (pastoreo rotativo intensivo) o por
   cortes. Este módulo agrega lo que las pantallas de cultivos anuales
   no tienen:
   - qué cultivos son pastura y su manejo (sistema, piquetes, días de
     ocupación y de descanso) guardado en el cultivo de la campaña;
   - eventos de tipo 'pastoreo' (entrada / salida de animales por
     piquete, o corte) con cabezas y kg MS/ha ofrecidos;
   - estado del pastoreo del lote (en qué piquete están, hace cuántos
     días, si ya cumplió la ocupación o el descanso);
   - producción de forraje registrada por mes comparada con la
     referencia forrajera de la región (Referencia forrajera);
   - aviso de temperatura: las gramíneas tropicales casi no crecen con
     temperatura media por debajo de la base (~15 °C): el riego en pleno
     invierno mantiene, no produce.

   Fuentes (ver FUNDAMENTOS_PASTURAS.md):
   [1] FAO-56 (Allen et al. 1998) Tabla 12: pastura bajo pastoreo rotado
       Kc ini 0,40 · med 0,85–1,05 · fin 0,85; alfalfa para heno (efecto
       de cortes promediado) 0,40 · 0,95 · 0,90. Tabla 22: raíz 0,5–1,5 m
       y agotamiento permitido p = 0,60 (pastura); alfalfa 1,0–2,0 m, 0,55.
   [2] Embrapa Gado de Corte / Embrapa Pecuária Sudeste: temperatura base
       de las gramíneas forrajeras tropicales ≈ 15 °C; por debajo el
       crecimiento es mínimo aunque haya agua (estacionalidad de invierno);
       pastoreo rotacionado irrigado con descansos de 21–35 días en verano.
   [3] Base de forraje de Irrigar (SIGA): kg MS/ha por mes, secano vs
       regada, Oriental/Centro y Occidental/Chaco. */
(function () {
  'use strict';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-PY', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function hoy() { return window.SafiaBalance ? SafiaBalance.hoyLocal() : new Date().toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000); }
  function fmtF(f) { if (!f) return '—'; var p = String(f).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : f; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  var RE_PASTURA = /pastura|pasto\b|brachiaria|braquiaria|mombaca|tifton|alfalfa|panicum|cynodon|zuri|gatton|forraj|marandu|piata|xaraes|tanzania/;
  function esPastura(x) {
    if (!x) return false;
    if (typeof x === 'object') return !!x.pastura || RE_PASTURA.test(norm(x.nombre || x.cultivo));
    return RE_PASTURA.test(norm(x));
  }
  var SISTEMAS = [
    { k: 'rotativo_intensivo', n: 'Pastoreo rotativo intensivo (piquetes bajo el pivote)' },
    { k: 'rotativo', n: 'Pastoreo rotativo' },
    { k: 'continuo', n: 'Pastoreo continuo' },
    { k: 'corte', n: 'Corte (heno, verde picado, ensilaje)' }
  ];
  function nombreSistema(k) { var s = SISTEMAS.find(function (x) { return x.k === k; }); return s ? s.n : (k || 'sin definir'); }
  var CHACO = ['boqueron', 'alto paraguay', 'presidente hayes'];
  function regionDe(campo) { var d = norm(campo && campo.departamento); return CHACO.some(function (c) { return d.indexOf(c) !== -1; }) ? 'Occidental/Chaco' : 'Oriental/Centro'; }

  /* ---------- eventos de pastoreo ---------- */
  function eventosLote(equipoId) {
    return leer('eventos').filter(function (e) { return e.tipo === 'pastoreo' && String(e.equipoId) === String(equipoId) && e.fecha; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)) || (a.id || 0) - (b.id || 0); });
  }
  // Estado actual del lote según el último movimiento
  function resumenLote(equipoId, cultivo) {
    var evs = eventosLote(equipoId), c = cultivo || {};
    if (!evs.length) return { estado: 'sin_datos', texto: 'Todavía no hay pastoreos ni cortes cargados. Cargalos desde el Operador (botón Pastoreo).' };
    var ult = evs[evs.length - 1], dias = diasEntre(ult.fecha, hoy());
    var ocup = parseFloat(c.diasOcupacion) || null, desc = parseFloat(c.diasDescanso) || null;
    if (ult.accion === 'entrada') {
      var r = { estado: 'ocupado', piquete: ult.piquete, dias: dias, cabezas: ult.cabezas, texto: 'Animales en el piquete ' + esc(ult.piquete || '?') + ' desde hace ' + dias + ' día' + (dias === 1 ? '' : 's') + (ult.cabezas ? ' (' + fmt(ult.cabezas) + ' cabezas)' : '') + '.' };
      if (ocup && dias >= ocup) { r.alerta = true; r.texto += ' Ya cumplió los ' + ocup + ' días de ocupación: hay que rotar al siguiente piquete.'; }
      return r;
    }
    // salida o corte: el piquete descansa
    var r2 = { estado: 'descanso', piquete: ult.piquete, dias: dias, texto: (ult.accion === 'corte' ? 'Último corte' : 'Salida') + ' del piquete ' + esc(ult.piquete || '?') + ' hace ' + dias + ' día' + (dias === 1 ? '' : 's') + '.' };
    if (desc) { if (dias >= desc) { r2.alerta = true; r2.texto += ' Ese piquete ya cumplió los ' + desc + ' días de descanso: está listo para volver a entrar.'; } else r2.texto += ' Le faltan ' + (desc - dias) + ' días de descanso.'; }
    return r2;
  }
  // kg MS/ha ofrecidos por mes (suma de entradas y cortes con kg MS/ha cargados) de un año
  function produccionMensual(equipoId, anio) {
    var out = {}; for (var m = 1; m <= 12; m++) out[m] = null;
    eventosLote(equipoId).forEach(function (e) {
      if (String(e.fecha).slice(0, 4) !== String(anio)) return;
      var kg = parseFloat(e.kgMsHa); if (!(kg > 0)) return;
      var m = parseInt(String(e.fecha).slice(5, 7), 10); out[m] = (out[m] || 0) + kg;
    });
    return out;
  }

  /* ---------- referencia forrajera (tabla safia_ref_forraje_mensual, caché local) ---------- */
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var NOMBRE_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function cargarReferencia() {
    var cache = null; try { cache = JSON.parse(localStorage.getItem('ref_forraje') || 'null'); } catch (e) {}
    if (cache && cache.filas && cache.filas.length && (Date.now() - (cache.ts || 0)) < 7 * 86400000) return Promise.resolve(cache.filas);
    if (!window.safiaSupabase) return Promise.resolve(cache && cache.filas || []);
    return window.safiaSupabase.from('safia_ref_forraje_mensual').select('region,tipo_pastura,forma_producida,anio,ene,feb,mar,abr,may,jun,jul,ago,sep,oct,nov,dic').then(function (r) {
      var filas = (r.data || []).map(function (f) { var o = { region: f.region, tipo_pastura: f.tipo_pastura, forma: /rega|riego/i.test(f.forma_producida || '') ? 'regada' : 'secano' }; MESES.forEach(function (m) { o[m] = f[m] == null ? null : Number(f[m]) / 100; }); return o; });
      try { localStorage.setItem('ref_forraje', JSON.stringify({ ts: Date.now(), filas: filas })); } catch (e) {}
      return filas;
    }).catch(function () { return cache && cache.filas || []; });
  }
  function referenciaPara(filas, region, cultivo, forma) {
    var nombre = norm((cultivo && (cultivo.variedad + ' ' + cultivo.cultivo)) || '');
    var deRegion = filas.filter(function (f) { return f.region === region && f.forma === forma; });
    var exacta = deRegion.find(function (f) { return nombre.indexOf(norm(f.tipo_pastura)) !== -1; });
    return exacta || deRegion.find(function (f) { return /varias/i.test(f.tipo_pastura); }) || deRegion[0] || null;
  }

  /* ---------- textos para las pantallas ---------- */
  function htmlTemperatura(p) {
    if (!p || p.tempMedia7 == null) return '';
    var frio = p.tempMedia7 < p.tempBase;
    return '<div style="margin-top:6px;font-size:12px;color:' + (frio ? '#8a5713' : '#178029') + ';line-height:1.35;">Temperatura media de la última semana <b>' + fmt(p.tempMedia7, 1) + ' °C</b>' +
      (frio ? ': por debajo de ' + p.tempBase + ' °C la pastura tropical casi no crece aunque tenga agua (Embrapa). El riego en esta época <b>mantiene</b> la pastura, no la hace producir: regar solo lo que marque el balance, sin forzar.' : ': la pastura está en época de crecimiento; el riego rinde forraje.') + '</div>';
  }
  function htmlEncargado(equipoId, cultivo, balance) {
    var r = resumenLote(equipoId, cultivo), h = '<div style="margin-top:6px;font-size:12px;' + (r.alerta ? 'color:#8a5713;font-weight:600;' : 'color:#3A3E41;') + '">' + r.texto + '</div>';
    if (cultivo && cultivo.sistemaPastoreo) h += '<div style="font-size:11px;color:#8C9196;">' + esc(nombreSistema(cultivo.sistemaPastoreo)) + (cultivo.piquetes ? ' · ' + esc(cultivo.piquetes) + ' piquetes' : '') + (cultivo.diasOcupacion ? ' · ' + esc(cultivo.diasOcupacion) + ' d ocupación' : '') + (cultivo.diasDescanso ? ' · ' + esc(cultivo.diasDescanso) + ' d descanso' : '') + '</div>';
    if (balance && balance.pastura) h += htmlTemperatura(balance.pastura);
    return h;
  }
  function htmlOperador(equipoId, cultivo) {
    var r = resumenLote(equipoId, cultivo);
    return '<div>' + (r.alerta ? '<b style="color:#8a5713;">' + r.texto + '</b>' : r.texto) + '</div>' + (cultivo && cultivo.sistemaPastoreo ? '<div>' + esc(nombreSistema(cultivo.sistemaPastoreo)) + (cultivo.piquetes ? ' · ' + esc(cultivo.piquetes) + ' piquetes' : '') + (cultivo.diasDescanso ? ' · descanso ' + esc(cultivo.diasDescanso) + ' d' : '') + '</div>' : '');
  }

  /* ---------- Banco: producción de forraje vs referencia ---------- */
  function campanasPastura(campo) {
    var equipos = leer('equipos').filter(function (e) { return String(e.campoId) === String(campo.id); }), out = [];
    leer('campanas').forEach(function (c) {
      var eq = equipos.find(function (e) { return String(e.id) === String(c.equipoId) }); if (!eq || !c.cultivos) return;
      c.cultivos.forEach(function (cu) { if (cu && esPastura(cu.cultivo)) out.push({ campana: c, cultivo: cu, equipo: eq }); });
    });
    return out;
  }
  function htmlBanco(campo, filasRef) {
    var lista = campanasPastura(campo); if (!lista.length) return '';
    var anio = new Date().getFullYear(), region = regionDe(campo);
    return lista.map(function (x) {
      var reg = produccionMensual(x.equipo.id, anio), refR = referenciaPara(filasRef || [], region, x.cultivo, 'regada'), refS = referenciaPara(filasRef || [], region, x.cultivo, 'secano');
      var totReg = 0, totRef = 0, r = resumenLote(x.equipo.id, x.cultivo);
      var filas = MESES.map(function (m, i) {
        var v = reg[i + 1], rr = refR ? refR[m] : null, rs = refS ? refS[m] : null; if (v) totReg += v; if (rr) totRef += rr;
        var pct = (v != null && rr) ? Math.round(v / rr * 100) : null;
        return '<tr><td>' + NOMBRE_MES[i] + '</td><td class="r">' + (v == null ? '<span class="muted">—</span>' : '<b>' + fmt(v) + '</b>') + '</td><td class="r">' + (rr == null ? '—' : fmt(rr)) + '</td><td class="r">' + (rs == null ? '—' : fmt(rs)) + '</td><td class="r">' + (pct == null ? '<span class="muted">—</span>' : '<span class="badge ' + (pct >= 90 ? 'green' : (pct >= 60 ? 'amber' : 'red')) + '">' + pct + ' %</span>') + '</td></tr>';
      }).join('');
      return '<div class="card" style="margin-bottom:14px;"><div class="card-h"><h3>Pastura · ' + esc(x.equipo.nombre) + ' · ' + esc(x.cultivo.cultivo) + (x.cultivo.variedad ? ' ' + esc(x.cultivo.variedad) : '') + '</h3><span class="muted">' + esc(x.campana.nombre || '') + ' · ' + anio + '</span></div>' +
        '<div style="font-size:13px;margin-bottom:8px;">' + (r.alerta ? '<b style="color:#8a5713;">' + r.texto + '</b>' : r.texto) + '</div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:8px;">' + esc(nombreSistema(x.cultivo.sistemaPastoreo)) + (x.cultivo.piquetes ? ' · ' + esc(x.cultivo.piquetes) + ' piquetes' : '') + (x.cultivo.diasOcupacion ? ' · ' + esc(x.cultivo.diasOcupacion) + ' d de ocupación' : '') + (x.cultivo.diasDescanso ? ' · ' + esc(x.cultivo.diasDescanso) + ' d de descanso' : '') + (x.cultivo.rendimientoObj ? ' · meta ' + fmt(x.cultivo.rendimientoObj) + ' kg MS/ha/año' : '') + '</div>' +
        '<div class="tablewrap"><div class="tablescroll"><table class="tbl"><thead><tr><th>Mes</th><th class="r">Registrado kg MS/ha</th><th class="r">Referencia regada</th><th class="r">Referencia secano</th><th class="r">vs regada</th></tr></thead><tbody>' + filas +
        '<tr><td><b>Total ' + anio + '</b></td><td class="r"><b>' + fmt(totReg) + '</b></td><td class="r"><b>' + fmt(totRef) + '</b></td><td class="r"></td><td class="r"></td></tr></tbody></table></div></div>' +
        '<div class="muted" style="font-size:11px;margin-top:6px;">Registrado = kg MS/ha cargados en cada entrada de animales o corte (Operador → Pastoreo). Referencia = base de forraje de Irrigar para ' + esc(region) + (refR ? ' (' + esc(refR.tipo_pastura) + ')' : '') + '. Sin kg MS/ha cargados no hay comparación: medí la oferta antes de entrar (regla o plato) aunque sea estimada.</div></div>';
    }).join('');
  }
  var cont = null;
  function alCambiarCampo() {
    var c = window.SafiaBanco && SafiaBanco.campoActual ? SafiaBanco.campoActual() : null, el = document.getElementById('pasturasResumen');
    if (!el) return;
    if (!c || !campanasPastura(c).length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="muted" style="margin-bottom:10px;">Cargando referencia forrajera…</div>';
    cargarReferencia().then(function (filas) { el.innerHTML = htmlBanco(c, filas); });
  }

  window.SafiaPasturas = { esPastura: esPastura, SISTEMAS: SISTEMAS, nombreSistema: nombreSistema, regionDe: regionDe, eventosLote: eventosLote, resumenLote: resumenLote, produccionMensual: produccionMensual, cargarReferencia: cargarReferencia, referenciaPara: referenciaPara, htmlTemperatura: htmlTemperatura, htmlEncargado: htmlEncargado, htmlOperador: htmlOperador, htmlBanco: htmlBanco, alCambiarCampo: alCambiarCampo, campanasPastura: campanasPastura };
})();
