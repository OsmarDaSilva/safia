/* SAFIA — Análisis de suelo desde planilla (Excel / CSV del laboratorio o del servicio de agricultura de precisión)
   -------------------------------------------------------------------
   Los servicios de muestreo en grilla (PDIG, Agro Pluma, laboratorios de Brasil y Paraguay) entregan una planilla con
   una fila por muestra y una columna por determinación, con los nombres del laboratorio (pH CaCl2, P, K, Ca, Mg, Al,
   H+Al, SB, t, T, V, M.O., Areia, Silte, Argila…). Este módulo la lee en el navegador (sin IA, sin costo) y devuelve
   las muestras en el MISMO formato que la lectura con IA (safia-leer-analisis), así el Banco y Evaluar proyecto las
   guardan con el flujo que ya existe (varias muestras → análisis separados + promedio de la parcela).
   Unidades esperadas (las de los laboratorios de la región): P, S y micros en mg/dm³ (= ppm); K, Ca, Mg, Al, H+Al, SB,
   CTC en cmolc/dm³; V, m, M.O. y textura en %. Si K viene en mg/dm³ (valores > 3) se convierte ÷ 391 y se anota.
   Necesita SheetJS (window.XLSX) para .xlsx/.xls; el CSV se lee sin librería. */
(function () {
  'use strict';
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function num(v) { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; var t = String(v).trim().replace(/\s/g, ''); if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(',', '.'); var n = parseFloat(t.replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }

  // Cada determinación: sinónimos (normalizados) y, cuando hace falta distinguir mayúsculas (t/T, m/M.O.), la forma exacta
  var COLUMNAS = [
    { k: 'muestra', re: /^(descricao|descripcion|identificacao|identificacion|amostra|muestra|ponto|punto|id|codigo|cod\.? ?lab\.?|cod|nome|nombre|lote|talhao|gleba|parcela|sample|label)$/, prioridad: function (h) { return /^(cod|id)/.test(h) ? 1 : 2; } },
    { k: 'codigo_lab', re: /^cod\.? ?lab\.?$|^codigo ?lab|^n[º°]? ?lab/, prioridad: function () { return 3; } },
    { k: 'profundidad', re: /^(profundidade|profundidad|prof\.?|camada|depth)$/ },
    { k: 'ph', re: /^ph ?\(?cacl2\)?$|^ph$|^ph ?\(?agua|^ph ?\(?h2o|^ph ?em ?agua/, prioridad: function (h) { return /cacl/.test(h) ? 2 : 1; } },
    { k: 'ph_smp', re: /^ph ?smp$|^smp$|^indice smp$/ },
    { k: 'materia_organica', re: /^m\.? ?o\.?$|^mo$|^materia ?organica|^m\.?o\.? ?\(|^mos$|^carbono/, exactoNo: /^m$/ },
    { k: 'fosforo', re: /^p$|^p ?\(|^p ?mehlich|^p ?resina|^fosforo|^p ?disponible|^p ?disp/ },
    { k: 'potasio', re: /^k$|^k ?\(|^potasio|^potassio/ },
    { k: 'calcio', re: /^ca$|^ca ?\(|^calcio/ },
    { k: 'magnesio', re: /^mg$|^mg ?\(|^magnesio/ },
    { k: 'aluminio', re: /^al$|^al ?\(|^aluminio|^al ?troc/ },
    { k: 'h_al', re: /^h ?\+ ?al|^h\+al|^acidez ?potencial/ },
    { k: 'sb', re: /^sb$|^soma ?de ?bases|^suma ?de ?bases|^s\.?b\.?$/ },
    { k: 'cic', re: /^ctc$|^cic$|^ctc ?\(?ph ?7|^ctc ?total|^t ?\(?ph|^cic ?total|^capacidad/, exacto: { 'T': true, 'T (pH 7)': true } },
    { k: 'ctc_efetiva', exacto: { 't': true }, re: /^ctc ?efetiva|^cic ?efectiva|^t ?efetiva/ },
    { k: 'saturacion_bases', re: /^v$|^v ?%|^v ?\(%\)|^sat\.? ?bases|^saturacion ?(de )?bases|^saturacao ?(de |por )?bases/ },
    { k: 'saturacion_aluminio', exacto: { 'm': true, 'm%': true, 'm (%)': true }, re: /^m ?%$|^m ?\(%\)$|^sat\.? ?al|^saturacion ?(de |por )?aluminio|^saturacao ?(de |por )?aluminio/ },
    { k: 'azufre', exacto: { 'S': true, 'S (mg/dm3)': true }, re: /^s ?\(|^azufre|^enxofre|^s ?- ?so4|^s-so4/ },
    { k: 'boro', re: /^b$|^b ?\(|^boro/ },
    { k: 'cobre', re: /^cu$|^cu ?\(|^cobre/ },
    { k: 'hierro', re: /^fe$|^fe ?\(|^hierro|^ferro/ },
    { k: 'manganeso', re: /^mn$|^mn ?\(|^manganeso|^manganes/ },
    { k: 'zinc', re: /^zn$|^zn ?\(|^zinc|^zinco/ },
    { k: 'sodio', re: /^na$|^na ?\(|^na\+|^sodio/ },
    { k: 'psi', re: /^pst|^psi$|^psi ?\(|^isna|^sat\.? ?(de |por )?(na|sodio)/ },
    { k: 'ce_extracto', re: /^cee|^ce ?(do |del )?extra|^ce ?\(?pasta|^ce ?es$/ },
    { k: 'arena', re: /^areia|^arena|^sand/ },
    { k: 'limo', re: /^silte|^limo|^silt/ },
    { k: 'arcilla', re: /^argila|^arcilla|^clay/ },
    { k: 'laboratorio', re: /^lab(oratorio)?$/ },
    { k: 'localidad', re: /^cidade|^ciudad|^localidad|^municipio/ },
    { k: 'propietario', re: /^proprietario|^propietario|^produtor|^productor|^cliente/ },
    { k: 'campo', re: /^fazenda|^estancia|^campo|^propriedade|^finca/ },
    { k: 'fecha', re: /^data|^fecha|^date/ },
    { k: 'lat', re: /^lat|^latitud|^latitude|^y$/ },
    { k: 'lon', re: /^lon|^long|^longitud|^longitude|^x$/ }
  ];
  function claveDeEncabezado(h) {
    var crudo = String(h == null ? '' : h).trim(), n = norm(crudo);
    if (!n) return null;
    var mejor = null, prio = 0;
    COLUMNAS.forEach(function (c) {
      var ok = false, p = 1;
      if (c.exacto && c.exacto[crudo]) { ok = true; p = 3; }
      else if (c.re && c.re.test(n) && !(c.exactoNo && c.exactoNo.test(n))) { ok = true; p = c.prioridad ? c.prioridad(n) : 1; }
      // 't' minúscula sola es CTC efetiva, 'T' mayúscula es CTC a pH 7 (norma de los laboratorios de Brasil)
      if (ok && c.k === 'cic' && crudo === 't') ok = false;
      if (ok && c.k === 'saturacion_aluminio' && crudo === 'M') ok = false;
      if (ok && p > prio) { mejor = c.k; prio = p; }
    });
    return mejor;
  }
  // fila de encabezados = la primera con 5 o más columnas reconocidas (las planillas suelen traer títulos arriba)
  function encontrarEncabezado(filas) {
    for (var i = 0; i < Math.min(filas.length, 30); i++) {
      var f = filas[i] || [], n = 0, vistos = {};
      f.forEach(function (c) { var k = claveDeEncabezado(c); if (k && !vistos[k]) { vistos[k] = 1; n++; } });
      if (n >= 5) return i;
    }
    return -1;
  }
  function interpretar(filas) {
    var iH = encontrarEncabezado(filas);
    if (iH < 0) return { error: 'No encontré la fila de encabezados (pH, P, K, Ca, Mg…). ¿Es la planilla de resultados del laboratorio?' };
    var enc = filas[iH], mapa = {}, usados = {}, prioUsada = {};
    // si dos encabezados dan la misma determinación, gana el de mayor prioridad (pH CaCl2 sobre pH agua; Descrição sobre Cod. Lab.)
    var prioDe = function (k, h) { var c = COLUMNAS.find(function (x) { return x.k === k; }); return c && c.prioridad ? c.prioridad(norm(h)) : 1; };
    enc.forEach(function (h, j) { var k = claveDeEncabezado(h); if (!k) return; var p = prioDe(k, h); if (!usados[k] || p > prioUsada[k]) { Object.keys(mapa).forEach(function (jj) { if (mapa[jj] === k) delete mapa[jj]; }); mapa[j] = k; usados[k] = String(h); prioUsada[k] = p; } });
    var muestras = [], avisos = [], kEnMg = 0, moEnG = 0, naEnMg = 0, ceEnUs = 0;
    for (var i = iH + 1; i < filas.length; i++) {
      var f = filas[i] || []; if (!f.some(function (c) { return c !== '' && c != null; })) continue;
      var m = {}, valores = 0;
      Object.keys(mapa).forEach(function (j) {
        var k = mapa[j], v = f[j];
        if (['muestra', 'codigo_lab', 'profundidad', 'laboratorio', 'localidad', 'propietario', 'campo', 'fecha'].indexOf(k) >= 0) { if (v !== '' && v != null) m[k] = String(v).trim(); return; }
        var x = num(v); if (x == null) return; m[k] = x; valores++;
      });
      if (!valores) continue;
      if (m.potasio != null && m.potasio > 3) { m.potasio = Math.round(m.potasio / 391 * 1000) / 1000; kEnMg++; }   // mg/dm³ → cmolc/dm³
      if (m.materia_organica != null && m.materia_organica > 12) { m.materia_organica = Math.round(m.materia_organica / 10 * 100) / 100; moEnG++; }   // g/dm³ (laboratorios de Brasil) → %
      if (m.profundidad) m.profundidad = m.profundidad.replace(/\s*cm$/i, ' cm');
      if (m.fecha && /^\d+(\.\d+)?$/.test(m.fecha)) { var d = new Date(Math.round((parseFloat(m.fecha) - 25569) * 86400000)); m.fecha = d.toISOString().slice(0, 10); }
      muestras.push(m);
    }
    if (!muestras.length) return { error: 'La planilla tiene encabezados pero ninguna fila con valores.' };
    // Sodio y CEe: la unidad se decide por columna. Primero el encabezado ("Na (mg/dm³)", "CEe (µS/cm)"); si no la dice, por el rango de
    // toda la columna: un Na intercambiable en cmolc/dm³ casi nunca pasa de 3 (los laboratorios de Brasil lo dan en mg/dm³: 2–50), y una
    // CEe en dS/m no pasa de 50. Así un Na de 7 mg/dm³ no se toma como 7 cmolc (sería "suelo sódico" falso) ni un sódico real se achica.
    var maxDe = function (k) { var vs = muestras.map(function (m) { return m[k]; }).filter(function (v) { return v != null; }); return vs.length ? Math.max.apply(null, vs) : null; };
    var hNa = norm(usados.sodio || ''), uNa = /mg|ppm/.test(hNa) ? 'mg' : (/mmol/.test(hNa) ? 'mmol' : (/cmol/.test(hNa) ? 'cmol' : null));
    if (!uNa && maxDe('sodio') != null) uNa = maxDe('sodio') > 3 ? 'mg' : 'cmol';
    if (uNa === 'mg' || uNa === 'mmol') muestras.forEach(function (m) { if (m.sodio != null) { m.sodio = Math.round(m.sodio / (uNa === 'mg' ? 230 : 10) * 1000) / 1000; naEnMg++; } });
    var hCe = norm(usados.ce_extracto || ''), uCe = /ds|ms\/cm|mmho/.test(hCe) ? 'ds' : (/us|µs|umho|micro/.test(hCe) ? 'us' : null);
    if (!uCe && maxDe('ce_extracto') != null) uCe = maxDe('ce_extracto') > 50 ? 'us' : 'ds';
    if (uCe === 'us') muestras.forEach(function (m) { if (m.ce_extracto != null) { m.ce_extracto = Math.round(m.ce_extracto) / 1000; ceEnUs++; } });
    if (kEnMg) avisos.push('K venía en mg/dm³ en ' + kEnMg + ' muestra(s): se convirtió a cmolc/dm³ (÷ 391).');
    if (naEnMg) avisos.push('Na venía en ' + (uNa === 'mmol' ? 'mmolc/dm³' : 'mg/dm³') + ' en ' + naEnMg + ' muestra(s): se convirtió a cmolc/dm³ (' + (uNa === 'mmol' ? '÷ 10' : '÷ 230') + ').');
    if (ceEnUs) avisos.push('CEe venía en µS/cm en ' + ceEnUs + ' muestra(s): se pasó a dS/m (÷ 1000).');
    if (moEnG) avisos.push('Materia orgánica en g/dm³ en ' + moEnG + ' muestra(s): se pasó a % (÷ 10).');
    var faltan = ['ph', 'fosforo', 'potasio', 'calcio', 'magnesio', 'cic', 'saturacion_bases', 'materia_organica'].filter(function (k) { return !usados[k]; });
    if (faltan.length) avisos.push('Sin columna para: ' + faltan.join(', ') + '.');
    var sinTextura = muestras.filter(function (m) { return m.arcilla == null; }).length;
    if (usados.arcilla && sinTextura) avisos.push(sinTextura + ' muestra(s) sin textura (la planilla la trae solo en algunas).');
    var conGps = muestras.filter(function (m) { return m.lat != null && m.lon != null; }).length;
    return { muestras: muestras, columnas: usados, avisos: avisos, conGps: conGps, laboratorio: (muestras.find(function (m) { return m.laboratorio; }) || {}).laboratorio || null };
  }

  /* ---------- lectura de archivos ---------- */
  function esPlanilla(archivo) { return /\.(xlsx|xlsm|xls|csv|txt)$/i.test(archivo && archivo.name || ''); }
  var cargando = null;
  function conSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (cargando) return cargando;
    cargando = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = function () { ok(window.XLSX); }; s.onerror = function () { cargando = null; no(new Error('No se pudo cargar el lector de Excel (sin internet).')); }; document.head.appendChild(s); });
    return cargando;
  }
  function csvAFilas(texto) {
    var sep = (texto.split('\n')[0].split(';').length > texto.split('\n')[0].split(',').length) ? ';' : ',';
    return texto.split(/\r?\n/).map(function (l) { var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var c = l[i]; if (c === '"') { q = !q; continue; } if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(function (x) { return x.trim(); }); });
  }
  function leerArchivo(archivo) {
    if (/\.(csv|txt)$/i.test(archivo.name)) return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(csvAFilas(String(fr.result))); }; fr.onerror = no; fr.readAsText(archivo, 'utf-8'); });
    return conSheetJS().then(function (X) {
      return new Promise(function (ok, no) {
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var wb = X.read(new Uint8Array(fr.result), { type: 'array', cellDates: false });
            var mejor = null, mejorN = -1;
            wb.SheetNames.forEach(function (n) { var filas = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }); var iH = encontrarEncabezado(filas); if (iH >= 0 && filas.length > mejorN) { mejor = filas; mejorN = filas.length; } });
            ok(mejor || X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true }));
          } catch (e) { no(e); }
        };
        fr.onerror = no; fr.readAsArrayBuffer(archivo);
      });
    });
  }
  // archivo → { muestras, avisos, columnas, conGps } en el formato de la IA
  function leerPlanilla(archivo) { return leerArchivo(archivo).then(interpretar); }

  // promedio de varias muestras (para Evaluar proyecto: el suelo del proyecto es el promedio de la grilla)
  var NUM = ['ph', 'ph_smp', 'materia_organica', 'fosforo', 'potasio', 'calcio', 'magnesio', 'aluminio', 'h_al', 'sb', 'cic', 'saturacion_bases', 'saturacion_aluminio', 'azufre', 'boro', 'cobre', 'hierro', 'manganeso', 'zinc', 'arena', 'limo', 'arcilla', 'sodio', 'psi', 'ce_extracto'];
  function promedio(muestras) {
    var o = { muestra: 'Promedio de ' + muestras.length + ' muestras', n: muestras.length };
    NUM.forEach(function (k) { var v = muestras.map(function (m) { return m[k]; }).filter(function (x) { return x != null; }); if (v.length) o[k] = Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length * 100) / 100; });
    var prof = muestras.map(function (m) { return m.profundidad; }).filter(Boolean); if (prof.length) o.profundidad = prof[0];
    return o;
  }
  function resumenHTML(r) {
    if (r.error) return '<span style="color:#B5371C;">' + r.error + '</span>';
    var cols = Object.keys(r.columnas).filter(function (k) { return NUM.indexOf(k) >= 0; });
    return r.muestras.length + ' muestra' + (r.muestras.length === 1 ? '' : 's') + ' · ' + cols.length + ' determinaciones (' + cols.join(', ') + ')' + (r.conGps ? ' · ' + r.conGps + ' con coordenadas' : ' · sin coordenadas en la planilla') + (r.avisos.length ? ' · ' + r.avisos.join(' ') : '');
  }

  window.SafiaPlanillaSuelo = { esPlanilla: esPlanilla, leerPlanilla: leerPlanilla, interpretar: interpretar, promedio: promedio, resumenHTML: resumenHTML, claveDeEncabezado: claveDeEncabezado };
})();
