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
  // Nombre corto: la categoría "Pastura tropical (Brachiaria, Mombaça, Tifton)" es genérica; lo que identifica al pasto es la variedad.
  // "Pastura tropical (...)" + "BRS Zuri" → "Pastura BRS Zuri". Otros cultivos: "Soja · DM 66i68".
  function nombreCorto(cultivo, variedad) {
    var c = String(cultivo || ''), v = String(variedad || '').trim();
    if (!esPastura(c)) return c + (v ? ' · ' + v : '');
    return v ? 'Pastura ' + v : c.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  }
  // Nombre de la campaña sin la categoría larga (también los nombres armados antes del 6-oct-2026)
  function nombreCampana(c) {
    var n = String((c && c.nombre) || '');
    ((c && c.cultivos) || []).forEach(function (cu) { if (cu && cu.cultivo && /\(/.test(cu.cultivo) && esPastura(cu.cultivo)) { var pos = n.indexOf(cu.cultivo) === 0 ? 0 : (n.indexOf(' + ' + cu.cultivo) >= 0 ? n.indexOf(' + ' + cu.cultivo) + 3 : -1); if (pos >= 0) n = n.slice(0, pos) + nombreCorto(cu.cultivo, cu.variedad) + n.slice(pos + cu.cultivo.length); } });   // solo el nombre que armó SAFIA (la categoría al inicio o después de ' + '); uno escrito a mano no se toca
    return n;
  }
  // Los nombres viejos se corrigen una vez en los datos (solo propietario o admin, que pueden guardar cualquier campaña); la nube los sube sola.
  function arreglarNombres() {
    try {
      var u = window.SafiaSync && SafiaSync.usuario ? SafiaSync.usuario() : null;
      if (!u || ['propietario', 'admin'].indexOf(u.rol) < 0) return;
      var l = JSON.parse(localStorage.getItem('campanas') || '[]'), cambio = false;
      l.forEach(function (c) { if (!c || !c.nombre) return; var n = nombreCampana(c); if (n !== c.nombre) { c.nombre = n; cambio = true; } });
      if (cambio) localStorage.setItem('campanas', JSON.stringify(l));
    } catch (e) { /* sin datos todavía */ }
  }
  // Solo después de bajar de la nube ('safia:datos'): si corriera al entrar, con datos viejos en este navegador, el registro local
  // marcado como cambiado ganaría sobre lo que otro navegador cargó después (fusionar: "cambio local sin subir: gana lo local").
  window.addEventListener('safia:datos', arreglarNombres);
  var SISTEMAS = [
    { k: 'rotativo_intensivo', n: 'Pastoreo rotativo intensivo (piquetes bajo el pivote)' },
    { k: 'rotativo', n: 'Pastoreo rotativo' },
    { k: 'continuo', n: 'Pastoreo continuo' },
    { k: 'corte', n: 'Corte (heno, verde picado, ensilaje)' }
  ];
  function nombreSistema(k) { var s = SISTEMAS.find(function (x) { return x.k === k; }); return s ? s.n : (k || 'sin definir'); }
  var CHACO = ['boqueron', 'alto paraguay', 'presidente hayes'];
  function regionDe(campo) { var d = norm(campo && campo.departamento); return CHACO.some(function (c) { return d.indexOf(c) !== -1; }) ? 'Occidental/Chaco' : 'Oriental/Centro'; }

  /* ---------- alturas de manejo (entrada y salida de los animales) ----------
     Fuente [4]: Embrapa Gado de Corte, "Régua de Manejo de Pastagens", edição revisada (Comunicado Técnico), Tabela 2
     (panicuns bajo pastoreo rotacionado, entrada/salida): Mombaça 85/45, Zuri 80/40, Tanzânia 70/35, Quênia 65/35, Massai 55/30,
     Tamani 50/25 cm; Tabela 1 (braquiárias bajo pastoreo continuo, altura máxima/mínima): Xaraés 40/20, Piatã 40/20, Marandu 35/20,
     Paiaguás 35/20, Ipyporã 35/20, decumbens 30/15, humidícola (Tupi) 20/10 cm.
     https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1077406/1/Reguademanejodepastagens.pdf
     Fuente [5]: Embrapa Rondônia, folder "Pastejo rotativo" (Quadro 3): Mombaça 90/40, BRS Zuri 70/35, Xaraés 45/20, Marandu/Piatã 35/20
     (valores algo más bajos para Zuri y Mombaça; se muestra la Régua por ser la edición revisada del obtentor).
     Decisión de Osmar 30-sep-2026: SAFIA usa las medidas de Embrapa (no la tabla del manual de Irrigar). */
  var FUENTE_REGUA = 'Embrapa Gado de Corte, Régua de Manejo de Pastagens (ed. revisada)';
  var ALTURAS = [
    { re: /mombaca|momba/, nombre: 'Mombaça', entrada: 85, salida: 45, tipo: 'rotacionado', fuente: FUENTE_REGUA + ', Tabela 2' },
    { re: /zuri/, nombre: 'BRS Zuri', entrada: 80, salida: 40, tipo: 'rotacionado', fuente: FUENTE_REGUA + ', Tabela 2 (Embrapa Rondônia: 70/35)' },
    { re: /tanzania|tanzan/, nombre: 'Tanzânia', entrada: 70, salida: 35, tipo: 'rotacionado', fuente: FUENTE_REGUA + ', Tabela 2' },
    { re: /quenia|kenia/, nombre: 'BRS Quênia', entrada: 65, salida: 35, tipo: 'rotacionado', fuente: FUENTE_REGUA + ', Tabela 2' },
    { re: /massai/, nombre: 'Massai', entrada: 55, salida: 30, tipo: 'rotacionado', fuente: FUENTE_REGUA + ', Tabela 2' },
    { re: /tamani/, nombre: 'BRS Tamani', entrada: 50, salida: 25, tipo: 'rotacionado', fuente: FUENTE_REGUA + ', Tabela 2' },
    { re: /xaraes|mg-?5|xara/, nombre: 'Xaraés (MG-5)', entrada: 40, salida: 20, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1 (altura máxima/mínima)' },
    { re: /piata/, nombre: 'BRS Piatã', entrada: 40, salida: 20, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1' },
    { re: /paiaguas/, nombre: 'BRS Paiaguás', entrada: 35, salida: 20, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1' },
    { re: /ipypora/, nombre: 'BRS Ipyporã', entrada: 35, salida: 20, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1' },
    { re: /marandu|brizantha|brizanta/, nombre: 'Marandu', entrada: 35, salida: 20, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1' },
    { re: /decumbens|basilisk/, nombre: 'Brachiaria decumbens', entrada: 30, salida: 15, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1' },
    { re: /humidicola|tupi/, nombre: 'Humidícola (Tupi)', entrada: 20, salida: 10, tipo: 'continuo', fuente: FUENTE_REGUA + ', Tabela 1' }
  ];
  function alturasReferencia(texto) {
    var n = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // gana la especie que aparece antes en el texto (la variedad va primero: 'BRS Zuri Pastura tropical (Brachiaria, Mombaça, Tifton)' → Zuri)
    var mejor = null, pos = Infinity;
    for (var i = 0; i < ALTURAS.length; i++) { var m = n.match(ALTURAS[i].re); if (m && m.index < pos) { pos = m.index; mejor = ALTURAS[i]; } }
    return mejor;
  }
  // Color de una altura frente a la meta: verde = a punto para entrar, amarillo = creciendo, rojo = en la altura de salida o menos
  function clasificarAltura(ref, alt) {
    if (!ref || !(alt > 0)) return { clase: 'sin', color: '#8C9196', texto: '' };
    if (alt >= ref.entrada) return { clase: 'listo', color: '#178029', texto: 'a punto para entrar' };
    if (alt <= ref.salida) return { clase: 'bajo', color: '#B5371C', texto: 'en la altura de salida o menos' };
    if (alt >= ref.entrada * 0.85) return { clase: 'casi', color: '#4E9A2E', texto: 'casi en la meta' };
    return { clase: 'creciendo', color: '#B8731A', texto: 'creciendo' };
  }
  // Texto para el formulario de pastoreo: la meta de la especie y, si ya se escribió la altura, cómo viene
  function textoAltura(ref, accion, alt) {
    if (!ref) return 'Altura del pasto medida con regla (promedio de varios puntos). Si cargás la variedad en la campaña (Zuri, Mombaça, Tanzania, Marandu, Xaraés…), SAFIA te muestra la meta de Embrapa.';
    var meta = ref.nombre + ': entrada a ' + ref.entrada + ' cm, salida a ' + ref.salida + ' cm (' + ref.fuente + ').';
    if (!(alt > 0)) return meta;
    if (accion === 'entrada') {
      if (alt < ref.salida) return meta + ' <b style="color:#B5371C;">' + alt + ' cm es menos que la altura de salida: el piquete todavía no se recuperó.</b>';
      if (alt < ref.entrada * 0.85) return meta + ' <b style="color:#8a5713;">' + alt + ' cm: entran temprano, el pasto todavía no llegó a la meta.</b>';
      if (alt > ref.entrada * 1.25) return meta + ' <b style="color:#8a5713;">' + alt + ' cm: pasto pasado, pierde calidad y se acama; adelantá la entrada o hacé un corte (rozado a la altura de salida).</b>';
      return meta + ' <b style="color:#178029;">' + alt + ' cm: en la meta.</b>';
    }
    if (accion === 'salida' || accion === 'corte') {
      if (alt < ref.salida * 0.75) return meta + ' <b style="color:#B5371C;">' + alt + ' cm: sobrepastoreo, salieron muy bajo; el rebrote va a ser lento y el piquete necesita más descanso.</b>';
      if (alt > ref.salida * 1.4) return meta + ' <b style="color:#8a5713;">' + alt + ' cm: salieron alto, quedó pasto sin comer.</b>';
      return meta + ' <b style="color:#178029;">' + alt + ' cm: en la meta.</b>';
    }
    return meta;
  }

  /* ---------- lectura diaria de altura (la planilla de Irrigar, en el celular) ----------
     evento { tipo: 'lectura', equipoId, fecha, piquete, medidas: [cm...], alturaCm: promedio }. Se toman varias medidas
     recorriendo el piquete (la planilla de Irrigar usa 10, una cada 1/10 del largo) y se guarda el promedio. */
  function lecturasLote(equipoId) {
    return leer('eventos').filter(function (e) { return e.tipo === 'lectura' && String(e.equipoId) === String(equipoId) && e.fecha && e.alturaCm > 0; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)) || (a.id || 0) - (b.id || 0); });
  }
  function promedio(lista) { var v = (lista || []).map(parseFloat).filter(function (x) { return x > 0; }); return v.length ? Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length * 10) / 10 : null; }
  // Estado de cada piquete: último movimiento, última lectura de altura y qué hacer
  function estadoPiquetes(equipoId, cultivo) {
    var c = cultivo || {}, n = parseInt(c.piquetes, 10) || 0, ref = alturasReferencia((c.variedad || '') + ' ' + (c.cultivo || ''));
    // el alambrado real (modelo de piquetes del equipo) manda sobre el número cargado en la campaña
    if (window.SafiaPiquetes && SafiaPiquetes.total) { var eqM = leer('equipos').find(function (e) { return String(e.id) === String(equipoId); }), nM = eqM ? SafiaPiquetes.total(eqM, c) : null; if (nM) n = nM; }
    var desc = parseFloat(c.diasDescanso) || null, h = hoy();
    var movs = eventosLote(equipoId), lects = lecturasLote(equipoId);
    var nombres = {}; for (var i = 1; i <= n; i++) nombres[String(i)] = 1;
    movs.concat(lects).forEach(function (e) { if (e.piquete) nombres[String(e.piquete)] = 1; });
    var ocupado = null; var ultMov = movs[movs.length - 1]; if (ultMov && ultMov.accion === 'entrada') ocupado = String(ultMov.piquete);
    var out = Object.keys(nombres).sort(function (a, b) { var na = parseInt(a, 10), nb = parseInt(b, 10); return (isNaN(na) || isNaN(nb)) ? a.localeCompare(b) : na - nb; }).map(function (p) {
      var mp = movs.filter(function (e) { return String(e.piquete) === p; }), lp = lects.filter(function (e) { return String(e.piquete) === p; });
      var um = mp[mp.length - 1] || null, ul = lp[lp.length - 1] || null, pl = lp.length > 1 ? lp[lp.length - 2] : null;
      var salida = null; for (var k = mp.length - 1; k >= 0; k--) if (mp[k].accion === 'salida' || mp[k].accion === 'corte') { salida = mp[k]; break; }
      var diasDesc = salida ? diasEntre(salida.fecha, h) : null;
      var alt = ul ? parseFloat(ul.alturaCm) : null, cls = clasificarAltura(ref, alt);
      var crec = (ul && pl && diasEntre(pl.fecha, ul.fecha) > 0) ? Math.round((parseFloat(ul.alturaCm) - parseFloat(pl.alturaCm)) / diasEntre(pl.fecha, ul.fecha) * 10) / 10 : null;   // cm/día entre las dos últimas lecturas
      var estado, color, texto;
      if (ocupado === p) { estado = 'ocupado'; color = '#2E72C8'; texto = 'Animales adentro desde el ' + fmtFecha(um.fecha) + (alt ? ' · ' + alt + ' cm' + (ref && alt <= ref.salida ? ': ya están en la altura de salida, sacarlos' : '') : ''); }
      else if (alt && ref && alt >= ref.entrada) { estado = 'listo'; color = '#178029'; texto = 'A punto: ' + alt + ' cm el ' + fmtFecha(ul.fecha) + ' (meta ' + ref.entrada + ')'; }
      else if (alt && ref && alt >= ref.entrada * 0.85 && crec > 0) { var faltan = Math.ceil((ref.entrada - alt) / crec); estado = 'casi'; color = '#4E9A2E'; texto = alt + ' cm, crece ' + crec + ' cm/día: a punto en ' + faltan + ' día' + (faltan === 1 ? '' : 's'); }
      else if (alt && ref) { estado = cls.clase; color = cls.color; texto = alt + ' cm el ' + fmtFecha(ul.fecha) + ' · ' + cls.texto + (crec != null ? ' · ' + (crec > 0 ? '+' : '') + crec + ' cm/día' : '') + (diasDesc != null && crec != null && crec <= 0 && diasDesc > 7 ? ' · no crece: revisar riego y fertilización' : ''); }
      else if (!alt && diasDesc != null && desc && diasDesc >= desc) { estado = 'descanso_ok'; color = '#178029'; texto = 'Cumplió ' + diasDesc + ' días de descanso (meta ' + desc + '): medir la altura, debería estar a punto'; }
      else if (diasDesc != null) { estado = 'descanso'; color = '#8C9196'; texto = 'Descansa hace ' + diasDesc + ' día' + (diasDesc === 1 ? '' : 's') + (desc ? ' de ' + desc : '') + (alt ? ' · ' + alt + ' cm' : ' · sin lectura de altura'); }
      else { estado = 'sin_datos'; color = '#8C9196'; texto = alt ? alt + ' cm el ' + fmtFecha(ul.fecha) : 'Sin movimientos ni lecturas'; }
      return { piquete: p, estado: estado, color: color, texto: texto, altura: alt, fechaLectura: ul ? ul.fecha : null, crecimiento: crec, diasDescanso: diasDesc };
    });
    return { piquetes: out, ref: ref, ocupado: ocupado, listos: out.filter(function (x) { return x.estado === 'listo' || x.estado === 'descanso_ok'; }).map(function (x) { return x.piquete; }) };
  }
  function fmtFecha(f) { var p = String(f || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(f || ''); }
  // Tablero de piquetes para el Operador y el Encargado
  function htmlPiquetes(equipoId, cultivo) {
    var st = estadoPiquetes(equipoId, cultivo);
    if (!st.piquetes.length) return '<div style="font-size:12px;color:#8C9196;">Cargá la cantidad de piquetes en la campaña y las lecturas de altura con el botón Altura del pasto.</div>';
    var orden = { ocupado: 0, listo: 1, descanso_ok: 2, casi: 3, creciendo: 4, bajo: 5, descanso: 6, sin_datos: 7, sin: 7 };
    var filas = st.piquetes.slice().sort(function (a, b) { return (orden[a.estado] != null ? orden[a.estado] : 9) - (orden[b.estado] != null ? orden[b.estado] : 9); });
    var h = '<div style="font-size:12px;color:#3A3E41;margin-bottom:4px;">' + (st.listos.length ? '<b style="color:#178029;">Piquete' + (st.listos.length > 1 ? 's' : '') + ' a punto: ' + st.listos.join(', ') + '</b>' : 'Ningún piquete a punto todavía.') +
      (st.ref ? ' <span style="color:#8C9196;">Meta ' + esc(st.ref.nombre) + ': entrar a ' + st.ref.entrada + ' cm, sacar a ' + st.ref.salida + ' cm.</span>' : ' <span style="color:#8C9196;">Cargá la variedad de la pastura en la campaña para tener la meta de altura.</span>') + '</div>';
    // tarjetas solo para los piquetes que tienen algo que decir; los demás, en una línea (con 30 piquetes la pantalla no se alarga)
    var conDatos = filas.filter(function (x) { return x.estado !== 'sin_datos' && x.estado !== 'sin'; }), sinDatos = filas.filter(function (x) { return x.estado === 'sin_datos' || x.estado === 'sin'; });
    if (conDatos.length) h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;">' + conDatos.map(function (x) {
      return '<div style="border:1px solid #E1E4E7;border-left:4px solid ' + x.color + ';border-radius:8px;padding:6px 8px;font-size:12px;background:#fff;"><b>Piquete ' + esc(x.piquete) + '</b>' + (x.altura ? ' · <b style="color:' + x.color + ';">' + x.altura + ' cm</b>' : '') + '<div style="color:#3A3E41;line-height:1.35;margin-top:2px;">' + esc(x.texto) + '</div></div>';
    }).join('') + '</div>';
    if (sinDatos.length) h += '<div style="font-size:11px;color:#8C9196;margin-top:' + (conDatos.length ? 6 : 0) + 'px;">' + (conDatos.length ? 'Sin movimientos ni lecturas: ' : 'Todavía sin movimientos ni lecturas en los ' + sinDatos.length + ' piquetes: ') + (sinDatos.length > 12 ? 'piquetes ' + sinDatos[0].piquete + ' a ' + sinDatos[sinDatos.length - 1].piquete + ' (' + sinDatos.length + ')' : 'piquetes ' + sinDatos.map(function (x) { return x.piquete; }).join(', ')) + '. Cargá la entrada de los animales y las lecturas de regla con los botones de arriba.</div>';
    return h;
  }
  // Guía rápida del manejo (resumen del Manual de pastura irrigada de Irrigar 2025 con las alturas de Embrapa)
  function htmlGuia(ref) {
    var alt = ref ? ref.nombre + ': entrar a <b>' + ref.entrada + ' cm</b>, sacar a <b>' + ref.salida + ' cm</b>' : 'entrar a la altura óptima de la especie y sacar a la mínima';
    var tarjetas = [
      ['Las dos decisiones de cada día', 'Mover los animales AL piquete que llegó a la altura de entrada (' + alt + '). Sacarlos DEL piquete cuando comieron hasta la altura de salida: ese resto de hojas es lo que hace rebrotar rápido. Ni afeitar ni dejar pasar el pasto.'],
      ['Medir con regla, todos los días', 'Recorrer el piquete y medir en varios puntos (la planilla usa 10, uno cada décimo del largo); SAFIA promedia y pinta el color. Con esas lecturas el satélite aprende cuándo un piquete está a punto.'],
      ['Pasto en kilos y pesadas', 'SAFIA pasa la altura a kilos de pasto seco por hectárea y calcula cuántos animales aguanta el pivot. Para que el número sea de este campo, hacé un corte de muestra por estación (Calibrar). Pesá el lote al entrar y cada 30 a 60 días (botón Pesada): con dos pesadas salen la ganancia diaria y los kilos de carne por hectárea.'],
      ['Riego y pastoreo separados', 'No regar el piquete ocupado ni los 3 a 5 siguientes: los animales pisan siempre suelo seco (cero compactación, cero barro en las pezuñas). Regar el resto según el balance de agua.'],
      ['Un lote parejo, carga ajustable', 'Un solo lote por pivot, animales parejos (5 a 10 % de diferencia de peso). Si falta pasto (invierno, media de temperatura bajo 15 °C), sacar animales; nunca sobrecargar los piquetes.'],
      ['Primer pastoreo y corrección', 'Primer ingreso a los 50 a 75 días de la germinación, con animales livianos, cuando el pasto llega al 75 % de su altura de manejo. Si un piquete se pasó, rozarlo a la altura de salida: es una corrección, no una rutina.']
    ];
    return '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#2E3236;">Guía rápida de manejo (Irrigar · alturas Embrapa)</summary><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;margin-top:6px;">' +
      tarjetas.map(function (t) { return '<div style="border:1px solid #E1E4E7;border-radius:8px;padding:7px 9px;font-size:12px;background:#fff;"><b>' + t[0] + '</b><div style="color:#3A3E41;line-height:1.4;margin-top:2px;">' + t[1] + '</div></div>'; }).join('') +
      '</div><div style="font-size:11px;color:#8C9196;margin-top:4px;">Alturas: ' + (ref ? esc(ref.fuente) : FUENTE_REGUA) + '. Manejo: Manual de pastura irrigada, Irrigar S.A. 2025.</div></details>';
  }

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
    var stE = estadoPiquetes(equipoId, cultivo), resumenE = (stE.listos.length ? 'a punto: ' + stE.listos.join(', ') : 'ninguno a punto') + (stE.ocupado ? ' · ocupado: ' + stE.ocupado : '');
    var cuerpoE = '<div style="margin-top:6px;">' + htmlPiquetes(equipoId, cultivo) + '</div>';
    if (window.SafiaPiquetes) { var eqP = leer('equipos').find(function (e) { return String(e.id) === String(equipoId); }); if (eqP && SafiaPiquetes.sectores(eqP, cultivo)) { var gp = SafiaPiquetes.serieGuardada(equipoId); cuerpoE += '<div style="margin-top:8px;">' + SafiaPiquetes.htmlPanel(eqP, cultivo, { pasadas: gp.pasadas, ultima: gp.pasadas[gp.pasadas.length - 1] || null }) + '</div>'; } }
    if (window.SafiaForraje) { var eqF = leer('equipos').find(function (e) { return String(e.id) === String(equipoId); }), cpF = eqF ? leer('campos').find(function (c) { return String(c.id) === String(eqF.campoId); }) : null, pF = eqF ? SafiaForraje.htmlPanel(eqF, cultivo, { campo: cpF, compacto: true }) : ''; if (pF) h += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#2E3236;">Pasto en kilos y carne</summary><div style="margin-top:6px;">' + pF + '</div></details>'; }
    h += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#2E3236;">Piquetes y satélite <span style="font-weight:500;color:#8C9196;">· ' + esc(resumenE) + '</span></summary>' + cuerpoE + '</details>';
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
        (window.SafiaForraje ? '<div style="margin-bottom:12px;">' + SafiaForraje.htmlPanel(x.equipo, x.cultivo, { campo: campo, filasRef: filasRef, abierto: true }) + '</div>' : '') +
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

  window.SafiaPasturas = { nombreCorto: nombreCorto, nombreCampana: nombreCampana, arreglarNombres: arreglarNombres, alturasReferencia: alturasReferencia, textoAltura: textoAltura, ALTURAS: ALTURAS, clasificarAltura: clasificarAltura, lecturasLote: lecturasLote, promedio: promedio, estadoPiquetes: estadoPiquetes, htmlPiquetes: htmlPiquetes, htmlGuia: htmlGuia, esPastura: esPastura, SISTEMAS: SISTEMAS, nombreSistema: nombreSistema, regionDe: regionDe, eventosLote: eventosLote, resumenLote: resumenLote, produccionMensual: produccionMensual, cargarReferencia: cargarReferencia, referenciaPara: referenciaPara, htmlTemperatura: htmlTemperatura, htmlEncargado: htmlEncargado, htmlOperador: htmlOperador, htmlBanco: htmlBanco, alCambiarCampo: alCambiarCampo, campanasPastura: campanasPastura };
})();
