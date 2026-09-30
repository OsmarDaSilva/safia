// Genera safia-materiales-datos.js a partir de las fichas recolectadas de obtentores y distribuidores (JSON).
// Uso: node scripts/gen-materiales.js <carpeta con materiales-*.json>
//   Cada JSON es un array de fichas { nombreSenave, nombre, obtentor, gm, habito, cicloDias, cicloTexto, cicloRegion, sanidad, densidad,
//   tecnologia, url, nivel, fecha, nota } (soja) o { ..., ciclo, gmEmpresa, gduBase, gduFlor, gduMad, grano } (maíz).
//   Los archivos se llaman materiales-soja-*.json y materiales-maiz-*.json (u otro cultivo: materiales-trigo-*.json).
// Reglas: se descartan las fichas sin URL o sin ningún dato útil; el GM tiene que estar entre 3 y 10; los GDU entre 500 y 2500;
//   el ciclo entre 60 y 220 días. Si dos fichas del mismo material difieren en el GM, se guarda la del obtentor y se anota la otra.
const fs = require('fs'), path = require('path');
const D = (process.argv[2] || './senave').replace(/[\\/]?$/, '/'), SALIDA = path.join(__dirname, '..', 'safia-materiales-datos.js');
const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clave = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const SUFIJOS = /(ipro|i2x|rsf|sts|rr|rg|ce|pro[234]|vyhr|vyh|yhr|vyr|pwu|vip3|vt3p|tre|hr|pw)$/;
const base = (s) => { let k = clave(s), prev; do { prev = k; k = k.replace(SUFIJOS, ''); } while (k !== prev && k.length > 3); return k; };
const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const limpiar = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

const porCultivo = {}, descartes = [];
fs.readdirSync(D).filter((f) => /^materiales-([a-z]+)-.*\.json$/i.test(f)).sort().forEach((f) => {
  const cu = f.match(/^materiales-([a-z]+)-/i)[1].toLowerCase();
  let lista; try { lista = JSON.parse(fs.readFileSync(D + f, 'utf8')); } catch (e) { console.error('JSON inválido:', f, e.message); return; }
  if (!Array.isArray(lista)) { console.error('no es un array:', f); return; }
  porCultivo[cu] = porCultivo[cu] || {};
  lista.forEach((x) => {
    if (!x || !x.nombre) return;
    const ficha = {
      nombre: limpiar(x.nombre), nombreSenave: limpiar(x.nombreSenave), obtentor: limpiar(x.obtentor),
      gm: num(x.gm), habito: norm(x.habito).replace(/^s\/d$/, ''), sanidad: limpiar(x.sanidad), densidad: limpiar(x.densidad), tecnologia: limpiar(x.tecnologia),
      cicloDias: num(x.cicloDias), cicloTexto: limpiar(x.cicloTexto), cicloRegion: limpiar(x.cicloRegion),
      diasFlor: num(x.diasFlor), ciclo: norm(x.ciclo), gmEmpresa: limpiar(x.gmEmpresa), gduBase: num(x.gduBase), gduFlor: num(x.gduFlor), gduMad: num(x.gduMad), grano: limpiar(x.grano),
      url: limpiar(x.url), nivel: /obtentor/i.test(x.nivel) ? 'obtentor' : (/prensa/i.test(x.nivel) ? 'prensa' : 'distribuidor'), fecha: limpiar(x.fecha), nota: limpiar(x.nota), archivo: f
    };
    // validaciones
    if (ficha.gm != null && (ficha.gm < 3 || ficha.gm > 10)) { descartes.push([f, ficha.nombre, 'GM fuera de rango ' + ficha.gm]); ficha.gm = null; }
    ['gduFlor', 'gduMad'].forEach((k) => { if (ficha[k] != null && (ficha[k] < 300 || ficha[k] > 2500)) { descartes.push([f, ficha.nombre, k + ' fuera de rango ' + ficha[k]]); ficha[k] = null; } });
    // 40–80 'días' en maíz son días a floración, no el ciclo: van a diasFlor
    if (ficha.cicloDias != null && ficha.cicloDias >= 40 && ficha.cicloDias < 80 && cu === 'maiz') { ficha.diasFlor = ficha.cicloDias; ficha.cicloDias = null; }
    if (ficha.cicloDias != null && (ficha.cicloDias < 60 || ficha.cicloDias > 220)) { descartes.push([f, ficha.nombre, 'ciclo fuera de rango ' + ficha.cicloDias]); ficha.cicloDias = null; }
    const util = ficha.gm != null || ficha.habito || ficha.cicloDias != null || ficha.diasFlor != null || ficha.gduFlor != null || ficha.gduMad != null || ficha.ciclo || ficha.sanidad || ficha.densidad;
    if (!ficha.url || !util) { descartes.push([f, ficha.nombre, !ficha.url ? 'sin URL' : 'sin datos útiles']); return; }
    // una ficha por material (por nombre base); se completa con lo que traiga cada fuente
    const k = base(ficha.nombre) || base(ficha.nombreSenave);
    const prev = porCultivo[cu][k];
    if (!prev) { porCultivo[cu][k] = ficha; return; }
    const ganaNueva = ficha.nivel === 'obtentor' && prev.nivel !== 'obtentor';
    const a = ganaNueva ? ficha : prev, b = ganaNueva ? prev : ficha;
    if (a.gm != null && b.gm != null && Math.abs(a.gm - b.gm) >= 0.05) a.nota = (a.nota ? a.nota + '; ' : '') + 'otra fuente (' + b.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] + ') dice GM ' + b.gm;
    Object.keys(b).forEach((c) => { if ((a[c] == null || a[c] === '') && b[c] != null && b[c] !== '') a[c] = b[c]; });
    if (!a.nombreSenave && b.nombreSenave) a.nombreSenave = b.nombreSenave;
    porCultivo[cu][k] = a;
  });
});
const salida = {};
Object.keys(porCultivo).forEach((cu) => {
  salida[cu] = Object.values(porCultivo[cu]).map((x) => { const o = {}; Object.keys(x).forEach((k) => { if (k !== 'archivo' && x[k] != null && x[k] !== '') o[k] = x[k]; }); return o; })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});
const cab = '/* SAFIA — fichas de materiales recolectadas de obtentores y distribuidores (ARCHIVO GENERADO por scripts/gen-materiales.js; no editar a mano)\n' +
  '   Cada ficha trae la URL exacta de donde salió el dato y la fecha en que se leyó. Se suman a safia-materiales.js sin pisar lo ya verificado a mano.\n' +
  '   Generado: ' + new Date().toISOString().slice(0, 10) + ' · ' + Object.keys(salida).map((cu) => cu + ' ' + salida[cu].length).join(' · ') + ' */\n';
fs.writeFileSync(SALIDA, cab + 'window.SAFIA_MATERIALES_EXTRA = ' + JSON.stringify(salida).replace(/\},\{/g, '},\n{') + ';\n');
Object.keys(salida).forEach((cu) => {
  const l = salida[cu];
  console.log(cu + ': ' + l.length + ' fichas · con GM ' + l.filter((x) => x.gm != null).length + ' · con ciclo en días ' + l.filter((x) => x.cicloDias != null).length + ' · con GDU madurez ' + l.filter((x) => x.gduMad != null).length + ' · con clase de ciclo ' + l.filter((x) => x.ciclo).length);
});
if (descartes.length) { console.log('descartadas ' + descartes.length + ':'); descartes.slice(0, 30).forEach((d) => console.log('  ' + d.join(' | '))); }
console.log('escrito', SALIDA, Math.round(fs.statSync(SALIDA).size / 1024) + ' KB');
