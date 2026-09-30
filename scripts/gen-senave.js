// Genera safia-senave.js a partir del Boletín de cultivares de SENAVE (Excel) y de las descripciones varietales (soja, trigo).
// Uso: node scripts/gen-senave.js <carpeta con los archivos bajados>
//   Bajar antes (con curl o el navegador) a esa carpeta, con estos nombres:
//   boletin-ago-2026.xls  = https://www.senave.gov.py/docs/semillas/boletines/Boletin-Agosto-2026.xls (el boletín del mes que corresponda)
//   desc-SOJA.xlsx        = https://www.senave.gov.py/docs/semillas/descriptores-varietales/DESCRIPCION%20VARIETAL%20-%20SOJA.xlsx
//   desc-TRIGO.xlsx       = https://www.senave.gov.py/docs/semillas/descriptores-varietales/DESCRIPCION%20VARIETAL%20-%20TRIGO.xlsx
//   Necesita el paquete npm 'xlsx' (npm i xlsx en la carpeta donde se corra). Salida: safia-senave.js en la raíz del repo.
const fs = require('fs'), XLSX = require('xlsx');
const D = (process.argv[2] || './senave').replace(/[\/]?$/, '/'), SALIDA = require('path').join(__dirname, '..', 'safia-senave.js');
const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clave = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const SUFIJOS = /(ipro|i2x|rsf|sts|rr|rg|ce|pro[234]|vyhr|vyh|yhr|vyr|pwu|vip3|vt3p|tre|hr|pw)$/;
const base = (s) => { let k = clave(s), prev; do { prev = k; k = k.replace(SUFIJOS, ''); } while (k !== prev && k.length > 3); return k; };
const limpiar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const anioDe = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? d.y : null; } const m = String(v).match(/(19|20)\d\d/); return m ? +m[0] : null; };

// ---- boletín ----
const wb = XLSX.readFile(D + 'boletin-ago-2026.xls');
const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).slice(1);

// nombre de especie unificado (mayúsculas, sinónimos, autores botánicos)
function especieDe(raw) {
  const n = norm(raw);
  if (!n || /^\d+$/.test(n) || n === 'sin especie') return null;
  if (/^soja/.test(n)) return 'Soja';
  if (/^ma[ií]z|^teosinto/.test(n)) return n.startsWith('teosinto') ? 'Teosinto' : 'Maíz';
  if (/^trigo sarracen|alforf/.test(n)) return 'Trigo sarraceno';
  if (/^trigo/.test(n)) return 'Trigo';
  if (/^tritic|^tritico secale/.test(n)) return 'Triticale';
  if (/^sorgo|^sorghum/.test(n)) return 'Sorgo';
  if (/^girasol/.test(n)) return 'Girasol';
  if (/^arroz/.test(n)) return 'Arroz';
  if (/^algod/.test(n)) return 'Algodón';
  if (/^canola/.test(n)) return 'Canola';
  if (/^sesamo/.test(n)) return 'Sésamo';
  if (/^poroto|^vigna|^habilla|^frijol/.test(n)) return n.startsWith('habilla') ? 'Habilla' : 'Poroto';
  if (/^avena/.test(n)) return 'Avena';
  if (/^mani\b|^mani$/.test(n)) return 'Maní';
  if (/^cana de az|^cana$/.test(n)) return 'Caña de azúcar';
  if (/^chia|^salvia hispanica/.test(n)) return 'Chía';
  if (/^ka'?a he'?e|^kaa hee/.test(n)) return "Ka'a he'ê";
  if (/^centeno|^secale/.test(n)) return 'Centeno';
  if (/^nabo forrajero|^rhapanus|^raphanus/.test(n)) return 'Nabo forrajero';
  if (/^medicago/.test(n)) return 'Alfalfa';
  if (/^urochloa|^brachiaria|^b\. ruz|^humidicola|^ruziziensis/.test(n)) return 'Urochloa (brachiaria)';
  if (/^megathyrsus|^panicum/.test(n)) return 'Megathyrsus (panicum)';
  if (/^cynodon/.test(n)) return 'Cynodon (tifton, bermuda)';
  if (/^pennisetum glaucum/.test(n)) return 'Mijo perla';
  if (/^pennisetum purpureum/.test(n)) return 'Pasto elefante';
  if (/^pennisetum clandestinum/.test(n)) return 'Kikuyo';
  if (/^cenchrus|^pasto buffel/.test(n)) return 'Pasto buffel (Cenchrus)';
  if (/^stylosanthes/.test(n)) return 'Stylosanthes';
  if (/^paspalum/.test(n)) return 'Paspalum';
  if (/^eucalipto|^eucalyptus/.test(n)) return 'Eucalipto';
  if (/^cannabis|^canamo/.test(n)) return 'Cáñamo / cannabis';
  if (/^naranj/.test(n)) return 'Naranja';
  if (/^mandarina/.test(n)) return 'Mandarina';
  if (/^limon|^lima\b|^citrus limonia|^citrus aurantifolia/.test(n)) return 'Limón / lima';
  if (/^pomelo|^toronja/.test(n)) return 'Pomelo';
  if (/^tartago/.test(n)) return 'Tártago';
  if (/^jatropha|^pinon manso/.test(n)) return 'Jatropha';
  if (/^mucuna|^stizolobium/.test(n)) return 'Mucuna';
  if (/^crotalaria/.test(n)) return 'Crotalaria';
  if (/^canavalia/.test(n)) return 'Canavalia';
  if (/^clitoria/.test(n)) return 'Clitoria';
  if (/^desmanthus/.test(n)) return 'Desmanthus';
  // resto: primera letra en mayúscula, sin el autor botánico entre paréntesis
  const t = limpiar(String(raw)).replace(/\s*\(.*$/, '').replace(/\s+(L\.|Lam|Jacq|Stapf|Kuntze|Rendle|Swartz).*$/i, '');
  return /^[A-ZÁÉÍÓÚÑ' .]+$/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}
function estado(s) { s = norm(s); if (!s || /^\d+$/.test(s) || s === '-') return ''; if (/al dia/.test(s)) return 'D'; if (/vencido/.test(s)) return 'V'; if (/cancelado/.test(s)) return 'C'; if (/pendiente/.test(s)) return 'P'; return ''; }
function tecnologia(esp, evento, cultivar) {
  const e = norm(evento).replace(/[\s-]/g, '');
  if (esp === 'Soja') {
    if (/87751/.test(e)) return 'I2X (Intacta 2 Xtend)';
    if (/87708/.test(e)) return 'RR2 Xtend';
    if (/87701|8771\b|87001/.test(e)) return 'IPRO (Intacta RR2 PRO)';
    if (/4032|40302|cp4|rr1|epsps/.test(e)) return 'RR';
    if (/sulfun|sts/.test(e)) return 'STS';
    if (/ind0041|ind00410|hb4/.test(e)) return 'HB4';
  }
  if (e) return limpiar(evento).replace(/\s*\(.*\)\s*$/, '').slice(0, 60);
  return norm(cultivar) === 'normal' ? 'convencional' : '';
}
function hibrido(s) { s = norm(s); if (!s || s === '-' || s === 's/d') return ''; if (/simple mod/.test(s)) return 'simple modificado'; if (/triple mod/.test(s)) return 'triple modificado'; if (/simple/.test(s)) return 'simple'; if (/triple/.test(s)) return 'triple'; if (/doble/.test(s)) return 'doble'; return s; }

// ---- descripciones varietales (soja y trigo): hábito y ciclo ----
function hoja(archivo, nombre) { const w = XLSX.readFile(D + archivo); return XLSX.utils.sheet_to_json(w.Sheets[nombre || w.SheetNames[0]], { header: 1, defval: '' }); }
const descSoja = {}, descTrigo = {};
hoja('desc-SOJA.xlsx', 'RNCC').slice(5).forEach((r) => {
  const n = limpiar(r[4]); if (!n) return;
  const hab = norm(r[7]).replace(/inderterminad|indeterminada/, 'indeterminado').replace(/^s\/d$/, '');
  const ciclo = norm(r[21]).replace(/^semi ?precoz$/, 'semiprecoz').replace(/^semi ?tardio$/, 'semitardío').replace(/^super ?precoz$/, 'superprecoz').replace(/^s\/d$/, '');
  const alt = limpiar(r[10]); const v = { hab: hab === 'semi determinado' ? 'semideterminado' : hab, ciclo: ciclo, altura: /s\/d/i.test(alt) ? '' : alt.toLowerCase() };
  descSoja[clave(n)] = v; descSoja[base(n)] = descSoja[base(n)] || v;
});
hoja('desc-TRIGO.xlsx').slice(5).forEach((r) => {
  const n = limpiar(r[4]); if (!n) return;
  const v = { hab: norm(r[6]).replace(/^s\/d$/, ''), ciclo: norm(r[27]).replace(/^s\/d$/, ''), altura: /s\/d/i.test(String(r[28])) ? '' : limpiar(r[28]).toLowerCase() };
  descTrigo[clave(n)] = v;
});

// ---- armado ----
const especies = {}, omitidas = {};
let total = 0;
filas.forEach((r) => {
  const esp = especieDe(r[1]); if (!esp) { omitidas[r[1]] = (omitidas[r[1]] || 0) + 1; return; }
  const n = limpiar(r[5]); if (!n) return;
  const clasif = limpiar(r[23]);
  const anio = anioDe(r[33]) || anioDe(r[27]) || anioDe(r[16]) || anioDe(r[17]) || null;
  let d = null;
  if (esp === 'Soja') d = descSoja[clave(n)] || descSoja[base(n)] || null;
  if (esp === 'Trigo') d = descTrigo[clave(n)] || null;
  const fila = [n, limpiar(r[8]), estado(r[11]), estado(r[10]), tecnologia(esp, r[14], r[24]), esp === 'Maíz' || esp === 'Sorgo' || esp === 'Girasol' ? hibrido(r[13]) : '', limpiar(r[15]), anio, d ? d.hab : '', d ? d.ciclo : '', d ? d.altura : ''];
  if (!especies[esp]) especies[esp] = { clasif: clasif, filas: [] };
  if (!especies[esp].clasif && clasif) especies[esp].clasif = clasif;
  especies[esp].filas.push(fila); total++;
});
// sin duplicados exactos (mismo nombre y obtentor) y orden: RNCC al día primero, después por nombre
Object.keys(especies).forEach((e) => {
  const vistos = {}; const orden = { D: 0, P: 1, V: 2, '': 3, C: 4 };
  especies[e].filas = especies[e].filas.filter((f) => { const k = clave(f[0]) + '|' + clave(f[1]); if (vistos[k]) return false; vistos[k] = 1; return true; })
    .sort((a, b) => (orden[a[2]] - orden[b[2]]) || a[0].localeCompare(b[0], 'es'));
});
const resumen = Object.keys(especies).sort((a, b) => especies[b].filas.length - especies[a].filas.length).map((e) => e + '=' + especies[e].filas.length + ' (al día ' + especies[e].filas.filter((f) => f[2] === 'D').length + ')');
console.log('total', total, '· especies', Object.keys(especies).length); console.log(resumen.join(', ')); console.log('omitidas:', JSON.stringify(omitidas));
const conDescSoja = especies.Soja.filas.filter((f) => f[8] || f[9]).length; console.log('soja con hábito/ciclo del descriptor:', conDescSoja, 'de', especies.Soja.filas.length);
console.log('trigo con descriptor:', especies.Trigo.filas.filter((f) => f[8] || f[9] || f[10]).length, 'de', especies.Trigo.filas.length);

const cab = `/* SAFIA — Registro Nacional de Cultivares de SENAVE (Paraguay)
   -------------------------------------------------------------------
   ARCHIVO GENERADO por scripts/gen-senave.js a partir de:
   - SENAVE, Boletín de cultivares · agosto 2026 (Excel, Departamento de Protección y Uso de Variedades, DPUV):
     https://www.senave.gov.py/docs/semillas/boletines/Boletin-Agosto-2026.xls   (guardado el 3-ago-2026 por SENAVE)
   - SENAVE, Descripción varietal de SOJA (hábito de crecimiento, ciclo y altura) y de TRIGO (hábito, temporada, altura):
     https://www.senave.gov.py/docs/semillas/descriptores-varietales/DESCRIPCION%20VARIETAL%20-%20SOJA.xlsx
     https://www.senave.gov.py/docs/semillas/descriptores-varietales/DESCRIPCION%20VARIETAL%20-%20TRIGO.xlsx
   Qué hay: todas las variedades e híbridos inscriptos en el RNCC (Registro Nacional de Cultivares Comerciales) y/o en el
   RNCP (Cultivares Protegidos), con obtentor, estado de cada registro, tecnología (evento), tipo de híbrido, origen y año.
   SENAVE NO publica el grupo de madurez de la soja ni los grados-día del maíz: eso sigue en safia-materiales.js con su fuente.
   Formato de cada fila: [nombre, obtentor, RNCC, RNCP, tecnología, tipo de híbrido, origen, año, hábito, ciclo, altura]
   Estados: D = mantenimiento al día · V = mantenimiento vencido · C = cancelado · P = pendiente · '' = sin ese registro.
   No editar a mano: volver a correr scripts/gen-senave.js con el boletín nuevo. */
`;
const cuerpo = 'window.SAFIA_SENAVE = ' + JSON.stringify({
  fuente: 'SENAVE, Registro Nacional de Cultivares (Boletín agosto 2026, DPUV)',
  url: 'https://www.senave.gov.py/docs/semillas/boletines/Boletin-Agosto-2026.xls',
  fecha: '2026-08-03',
  campos: ['nombre', 'obtentor', 'rncc', 'rncp', 'tecnologia', 'hibrido', 'origen', 'anio', 'habito', 'ciclo', 'altura'],
  estados: { D: 'RNCC al día', V: 'mantenimiento vencido', C: 'cancelado', P: 'pendiente' },
  especies: especies
}).replace(/\],\[/g, '],\n[') + ';\n';
fs.writeFileSync(SALIDA, cab + cuerpo);
console.log('escrito', SALIDA, Math.round((cab + cuerpo).length / 1024) + ' KB');
