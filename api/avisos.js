/* =====================================================================
   SAFIA · Cálculo de los avisos del día (función serverless de Vercel)
   ---------------------------------------------------------------------
   Por qué: el balance de agua, los piquetes y el mantenimiento se
   calculan en el navegador, cuando alguien abre SAFIA. Para avisar al
   celular hace falta el mismo cálculo sin que nadie abra la app.

   Esta función NO guarda nada ni tiene llaves: recibe los datos de un
   cliente (los manda la edge function safia-avisos de Supabase, que es
   la que lee la base y envía las notificaciones), corre el MISMO motor
   que las pantallas (safia-balance.js, safia-pasturas.js, etc., tal
   como están publicados) y devuelve qué avisar por cada pivot.
   Un solo motor: lo que dice el aviso es lo que muestra el Operador.

   Entrada (POST, JSON):
     { datos: { campos, equipos, campanas, eventos, analisis_suelo,
                clima_estacion, cultivos_custom, ndvi: { <equipoId>: [..] } },
       equipos: [ids a evaluar] }
   Salida: { ok, hoy, resultados: [{ equipoId, nombre, campoId, avisos: [{ tipo, nivel, titulo, cuerpo }], estado }] }
     tipo 'riego' = el parte de cada mañana (nivel info / arrancar / estres), 'rotar', 'mantenimiento'
   ===================================================================== */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

export const config = { maxDuration: 60 };

process.env.TZ = 'America/Asuncion';   // "hoy" es el día de Paraguay, no el del servidor

// Los mismos scripts que carga operador.html, en el mismo orden
const ARCHIVOS = ['safia-cultivos-fao.js', 'safia-balance.js', 'safia-sensores.js', 'safia-pasturas.js', 'safia-piquetes.js', 'safia-lluvia.js', 'safia-clima.js', 'safia-mantenimiento.js'];
let fuentes = null;

async function cargarFuentes(origen) {
  if (fuentes) return fuentes;
  const dir = process.env.SAFIA_DIR;   // pruebas locales: leer del disco
  const textos = await Promise.all(ARCHIVOS.map(async (a) => {
    if (dir) return fs.readFileSync(path.join(dir, a), 'utf8');
    const r = await fetch(origen + '/' + a, { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer ' + a + ' (' + r.status + ')');
    return r.text();
  }));
  fuentes = ARCHIVOS.map((a, i) => ({ nombre: a, codigo: textos[i] }));
  return fuentes;
}

// Lo que corre DENTRO del contexto del motor (mismo "navegador" simulado): replica mostrarRecomendacionClima de operador.html
const CONDUCTOR = `
(function () {
  var fetchReal = fetch;
  // las respuestas se leen con el JSON del contexto, para que los arrays sean del mismo "mundo" que el motor
  fetch = function (u, o) { return fetchReal(u, o).then(function (r) { return { ok: r.ok, status: r.status, statusText: r.statusText, headers: r.headers, text: function () { return r.text(); }, json: function () { return r.text().then(function (t) { return JSON.parse(t); }); } }; }); };
  function L(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function corta(f) { return f ? String(f).slice(8, 10) + '/' + String(f).slice(5, 7) : ''; }
  globalThis.__evaluar = async function (equipoId) {
    var equipo = L('equipos').find(function (e) { return String(e.id) === String(equipoId); });
    if (!equipo) return { equipoId: String(equipoId), error: 'El equipo no está en los datos' };
    var campo = L('campos').find(function (c) { return String(c.id) === String(equipo.campoId); }) || null;
    var out = { equipoId: String(equipo.id), nombre: equipo.nombre || 'Pivot', campoId: campo ? String(campo.id) : null, campo: campo ? campo.nombre : null, avisos: [], estado: {} };
    var hoy = SafiaBalance.hoyLocal();

    // --- mantenimiento vencido (no depende de la campaña) ---
    try {
      if (window.SafiaMant && !SafiaBalance.esSecano(equipo)) {
        var m = SafiaMant.estado(equipo);
        if (m && !m.sinPlan && m.vencidas && m.vencidas.length) {
          var nombres = m.vencidas.slice(0, 2).map(function (t) { return t.tarea; }).join('; ');
          out.avisos.push({ tipo: 'mantenimiento', titulo: out.nombre + ': ' + m.vencidas.length + (m.vencidas.length === 1 ? ' tarea de mantenimiento vencida' : ' tareas de mantenimiento vencidas'), cuerpo: nombres + (m.vencidas.length > 2 ? ' y ' + (m.vencidas.length - 2) + ' más' : '') + '.' });
        }
      }
    } catch (e) { out.estado.errorMantenimiento = String(e && e.message || e); }

    var campana = L('campanas').find(function (c) { return String(c.equipoId) === String(equipo.id) && c.estado === 'Activa'; });
    var cultivo = campana && campana.cultivos && campana.cultivos[0] ? campana.cultivos[0] : null;
    if (!cultivo) { out.estado.sinCampana = true; return out; }
    out.estado.cultivo = cultivo.cultivo;

    // --- pastura: rotación de piquetes ---
    var esPast = !!(window.SafiaPasturas && SafiaPasturas.esPastura(cultivo.cultivo)), sinRiegoTxt = '';
    if (esPast) {
      try {
        var st = SafiaPasturas.estadoPiquetes(equipo.id, cultivo), ocup = st.piquetes.find(function (p) { return p.estado === 'ocupado'; });
        var movs = SafiaPasturas.eventosLote(equipo.id), ent = movs.filter(function (x) { return x.accion === 'entrada'; }).slice(-1)[0];
        var diasOcup = parseFloat(cultivo.diasOcupacion) || null, adentro = ent ? SafiaBalance.diasEntre(ent.fecha, hoy) : null;
        var proximo = st.listos.filter(function (p) { return p !== st.ocupado; })[0] || null;
        var bajo = ocup && ocup.altura && st.ref && ocup.altura <= st.ref.salida;
        if (ocup && ((diasOcup && adentro != null && adentro >= diasOcup) || bajo)) {
          out.avisos.push({ tipo: 'rotar', titulo: out.nombre + ': hoy toca rotar los animales',
            cuerpo: 'Están en el piquete ' + ocup.piquete + ' hace ' + adentro + (adentro === 1 ? ' día' : ' días') + (diasOcup ? ' (ocupación ' + diasOcup + ')' : '') + '.' + (bajo ? ' El pasto ya está en la altura de salida (' + ocup.altura + ' cm).' : '') + (proximo ? ' Piquete a punto: ' + proximo + '.' : ' Medí la altura del piquete que sigue antes de entrar.') });
        }
        var sr = window.SafiaPiquetes ? SafiaPiquetes.sectoresSinRiego(equipo, cultivo, 3) : null;
        if (sr && sr.ocupado && sr.piquetes.length) sinRiegoTxt = ' No regar ' + (sr.texto || ('del ' + sr.grados[0] + '° al ' + sr.grados[1] + '°')) + ' (piquetes ' + sr.piquetes.join(', ') + ').';
        out.estado.piquete = st.ocupado || null;
      } catch (e) { out.estado.errorPastura = String(e && e.message || e); }
    }

    // --- riego: el mismo camino que la tarjeta del Operador ---
    if (SafiaBalance.esSecano(equipo)) { out.estado.secano = true; return out; }
    var coords = SafiaBalance.coordenadasLote(equipo, campo);
    if (!coords) { out.estado.sinCoordenadas = true; return out; }
    var rClima = await SafiaClima.obtenerClima({ lat: coords.lat, lon: coords.lon, daily: 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min',
      pastDays: campo ? SafiaBalance.pastDaysDesde(campo.id, equipo.id) : 92, forecastDays: 16, cacheKey: coords.cacheKey || (coords.lat + ',' + coords.lon) });
    if (!rClima || !rClima.datos) { out.estado.sinClima = (rClima && rClima.error && rClima.error.tipo) || true; return out; }
    if (rClima.desactualizado) { out.estado.sinClima = 'desactualizado'; return out; }   // nunca se avisa con clima viejo
    var custom = L('cultivos_custom');
    var kcDef = SafiaBalance.obtenerCultivoKc(cultivo.cultivo) || custom.find(function (c) { return c.nombre === cultivo.cultivo; }) || null;
    var r = SafiaBalance.simular({ campo: campo, daily: rClima.datos.daily, eventos: L('eventos'), equipoId: equipo.id, equipo: equipo, kcDef: kcDef,
      fechaSiembra: cultivo.fechaSiembra || null, fechaCosecha: cultivo.fechaCosecha || null, diasFuturo: 5, asumirRiegoRecomendado: false });
    var U = r.umbrales || SafiaBalance.UMBRALES, pct = r.porcentajeHoy;
    var lluviaProxima = r.dias.reduce(function (s, d) { return s + d.lluviaBruta; }, 0);
    var mmRegar = r.recomendacion.mm || Math.min(25, Math.max(10, Math.round(r.deficitHastaCC)));
    var pv = r.recomendacion.pivot;
    out.estado.pct = Math.round(pct); out.estado.lluviaProxima = Math.round(lluviaProxima); out.estado.arrancarEl = pv && pv.arrancarEl || null; out.estado.venceEl = pv && pv.venceEl || null;
    out.estado.etapa = r.etapaHoy ? r.etapaHoy.nombre : null; out.estado.umbrales = { estres: U.URGENTE, arranque: U.CRITICO };
    // Parte de cada mañana: SIEMPRE dice cómo está el agua, si viene lluvia y qué hacer (mismas ramas que la tarjeta del Operador)
    var vuelta = pv && pv.vueltaDias ? ' La vuelta tarda ' + pv.vueltaDias.toLocaleString('es-PY') + ' días.' : '';
    var hasta = r.dias.length ? corta(r.dias[r.dias.length - 1].fecha) : '';
    var lluviaTxt = lluviaProxima >= 1 ? ' Lluvia prevista: ' + Math.round(lluviaProxima) + ' mm hasta el ' + hasta + '.' : ' Sin lluvia prevista hasta el ' + hasta + '.';
    var vence = pv && pv.venceEl ? ' Sin riego entra en estrés ' + (pv.diasHastaEstres === 0 ? 'hoy' : 'el ' + corta(pv.venceEl)) + '.' : '';
    var P = out.nombre + ': ' + Math.round(pct) + ' % de agua útil';
    var nivel, titulo, cuerpo;
    if (lluviaProxima >= 15 && !r.recomendacion.enEstres) {
      nivel = 'info'; out.estado.recomendacion = 'No regar: viene lluvia (' + Math.round(lluviaProxima) + ' mm)';
      titulo = P + ' · no regar, viene lluvia';
      cuerpo = 'Se esperan ' + Math.round(lluviaProxima) + ' mm entre hoy y el ' + hasta + '.' + vence;
    } else if (r.recomendacion.enEstres || pct < (U.URGENTE || 50)) {
      nivel = 'estres'; out.estado.recomendacion = 'Regar ya: en estrés';
      titulo = P + ' · regar ya, cultivo en estrés';
      cuerpo = 'Está debajo del punto de estrés (' + U.URGENTE + ' %). Regar ' + Math.round(mmRegar) + ' mm hoy.' + (pv && pv.noAlcanza ? ' El equipo no alcanza la demanda: mantenerlo girando.' : '') + lluviaTxt + sinRiegoTxt;
    } else if (pct < U.CRITICO) {
      var girando = pv && pv.noAlcanza;
      nivel = 'arrancar'; out.estado.recomendacion = girando ? 'Mantener el pivot girando' : 'Arrancar el pivot hoy';
      titulo = P + (girando ? ' · mantener el pivot girando' : ' · arrancar el pivot hoy');
      cuerpo = 'Llegó al punto de arranque (' + U.CRITICO + ' %). Regar ' + Math.round(mmRegar) + ' mm.' + vuelta + vence + lluviaTxt + sinRiegoTxt;
    } else if (pct >= U.ATENCION) {
      nivel = 'info'; out.estado.recomendacion = 'Sin necesidad de riego';
      titulo = P + ' · no hace falta regar';
      cuerpo = 'Suelo bien abastecido.' + (pv && pv.arrancarEl ? ' Arrancar el pivot el ' + corta(pv.arrancarEl) + '.' : '') + lluviaTxt;
    } else {
      nivel = 'info'; out.estado.recomendacion = pv && pv.arrancarEl ? 'Arrancar el pivot el ' + corta(pv.arrancarEl) : 'Monitorear';
      titulo = P + (pv && pv.arrancarEl ? ' · arrancar el pivot el ' + corta(pv.arrancarEl) : ' · hoy no regar');
      cuerpo = 'Cerca del punto de arranque (' + U.CRITICO + ' %).' + vence + vuelta + lluviaTxt;
    }
    out.avisos.push({ tipo: 'riego', nivel: nivel, titulo: titulo, cuerpo: cuerpo });
    return out;
  };
})();
`;

function crearContexto(datos, origen) {
  const almacen = {};
  const tienda = (obj) => ({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : null),
    setItem: (k, v) => { obj[k] = String(v); },
    removeItem: (k) => { delete obj[k]; },
    key: (i) => Object.keys(obj)[i] || null,
    get length() { return Object.keys(obj).length; },
  });
  ['campos', 'equipos', 'campanas', 'eventos', 'analisis_suelo', 'clima_estacion', 'cultivos_custom', 'clientes'].forEach((k) => { almacen[k] = JSON.stringify(Array.isArray(datos[k]) ? datos[k] : []); });
  Object.keys(datos.ndvi || {}).forEach((id) => { almacen['ndvi_' + id] = JSON.stringify(datos.ndvi[id] || []); });
  const nodo = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const caja = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, fetch, AbortController, URL, URLSearchParams, TextEncoder, TextDecoder,
    localStorage: tienda(almacen), sessionStorage: tienda({}),
    navigator: { onLine: true, userAgent: 'SAFIA-servidor', language: 'es-PY' },
    location: { protocol: 'https:', hostname: 'safia-beige.vercel.app', host: 'safia-beige.vercel.app', pathname: '/operador.html', search: '', hash: '', origin: origen, href: origen + '/operador.html' },
    document: { readyState: 'complete', body: null, head: nodo(), documentElement: nodo(), getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return nodo(); }, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; },
  };
  caja.window = caja; caja.self = caja;
  return vm.createContext(caja);
}

async function calcular(datos, equipos, origen) {
  const fs_ = await cargarFuentes(origen);
  const ctx = crearContexto(datos || {}, origen);
  fs_.forEach((f) => { vm.runInContext(f.codigo, ctx, { filename: f.nombre }); });
  vm.runInContext(CONDUCTOR, ctx, { filename: 'conductor-avisos.js' });
  const ids = (equipos && equipos.length ? equipos : (datos.equipos || []).map((e) => e.id)).map(String);
  const resultados = [];
  // de a 4 por vez: cada pivot pide su clima
  for (let i = 0; i < ids.length; i += 4) {
    const tanda = await Promise.all(ids.slice(i, i + 4).map((id) => ctx.__evaluar(id).catch((e) => ({ equipoId: id, error: String((e && e.message) || e), avisos: [] }))));
    tanda.forEach((r) => resultados.push(JSON.parse(JSON.stringify(r))));
  }
  return { ok: true, hoy: vm.runInContext('SafiaBalance.hoyLocal()', ctx), resultados };
}

export { calcular };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(200).json({ ok: true, servicio: 'SAFIA · cálculo de avisos', uso: 'POST { datos, equipos }' }); return; }
  try {
    const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!cuerpo.datos || !Array.isArray(cuerpo.datos.equipos)) { res.status(400).json({ error: 'Faltan los datos (datos.equipos)' }); return; }
    if (cuerpo.datos.equipos.length > 200) { res.status(400).json({ error: 'Demasiados equipos en un pedido (máximo 200)' }); return; }
    const origen = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'safia-beige.vercel.app');
    res.status(200).json(await calcular(cuerpo.datos, cuerpo.equipos, origen));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
