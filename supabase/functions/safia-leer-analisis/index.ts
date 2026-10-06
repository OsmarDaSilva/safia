// SAFIA · Edge Function: safia-leer-analisis (v11)
// v11 (agua, 5-oct-2026): carbonatos y bicarbonatos se deciden con números (alcalinidad P/T, CSR del laboratorio); el método
//      SM 2320 o "Cálculo" ya no alcanza para decir CaCO3 (INYMA informa los iones: caso Tres Tigre).
// Lee una foto o PDF de un análisis de SUELO, FOLIAR (tejido vegetal) o de AGUA de riego, de CUALQUIER
// laboratorio, y devuelve los valores normalizados (mismos nombres y unidades) en JSON, una entrada por muestra.
// v4: varias muestras + parseo robusto + registro de fallas. v5: sinónimos y unidades por laboratorio.
// v6: modo `tipo: 'foliar'` (hoja) y Cu/Mn como campos propios en el suelo.
// v7: H+Al, índice SMP y extractor de P como campos propios (manual RS/SC: SMP para el calcáreo, chequeo SB/CTC/V%).
// v8: modo `tipo: 'agua'` (análisis de agua para riego: iones en meq/L, CE en µS/cm, boro en mg/L).
// v9: carbonatos/bicarbonatos informados como CaCO3 (alcalinidad, SM 2320 / SM 4500-CO2 D, o suman la alcalinidad total) → ÷ 50.
// v10 (agua): la IA ya NO convierte: copia cada valor tal cual el informe con su unidad ({valor, unidad}); la conversión
//      la hace la app con una regla fija y visible (safia-calidad-agua.js → convertir).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ESQUEMA = `{
  "muestra": "identificación de la muestra tal cual figura (lote, parcela, número, cliente), o null",
  "laboratorio": "nombre del laboratorio si figura, o null",
  "fecha": "fecha del análisis (liberación / emisión / resultado) en formato AAAA-MM-DD, o null",
  "profundidad": "profundidad del muestreo tal cual (ej '0-20 cm'), o null",
  "ph": "pH en agua (H2O) como número; si solo hay pH CaCl2 o SMP, usá el CaCl2 y anotalo; o null",
  "materia_organica": "materia orgánica en % como número, o null",
  "fosforo": "fósforo P disponible por extractor Mehlich-1 o Bray, en mg/dm³ (= ppm = mg/kg) como número; NO el P de resina si hay ambos; o null",
  "potasio": "potasio K intercambiable en cmolc/dm³ como número, o null",
  "calcio": "calcio Ca intercambiable en cmolc/dm³ como número, o null",
  "magnesio": "magnesio Mg intercambiable en cmolc/dm³ como número, o null",
  "cic": "CIC a pH 7 (T, CTC total) en cmolc/dm³ como número, o null",
  "saturacion_bases": "saturación de bases V% como número, o null",
  "h_al": "acidez potencial H+Al en cmolc/dm³ como número, o null",
  "ph_smp": "índice SMP (pH SMP) como número, o null",
  "extractor_p": "método de extracción del fósforo tal cual figura (ej 'Mehlich-1', 'Bray-1', 'resina', 'Olsen'), o null",
  "arena": "arena en % como número, o null",
  "limo": "limo en % como número, o null",
  "arcilla": "arcilla en % como número, o null",
  "aluminio": "aluminio intercambiable Al3+ en cmolc/dm³ como número, o null",
  "saturacion_aluminio": "saturación de aluminio m% como número, o null",
  "azufre": "azufre S-SO4 en mg/dm³ como número, o null",
  "boro": "boro en mg/dm³, o null",
  "zinc": "zinc en mg/dm³, o null",
  "cobre": "cobre Cu en mg/dm³, o null",
  "manganeso": "manganeso Mn en mg/dm³, o null",
  "observaciones": "otros datos útiles en texto corto: H+Al, S (suma de bases), Fe, relaciones Ca/Mg, pH CaCl2/SMP, unidades originales, avisos de conversión. o null"
}`;

const SYSTEM = `Sos un asistente agronómico que lee informes de análisis de suelo de CUALQUIER laboratorio (Paraguay, Brasil, Argentina, Bolivia; en español o portugués; BIOSOLLO, Fertilab, Laborsolo, Solocria, LAGRO, INBIO, UNA, Agrolab, INTA, etc.) y devuelve los valores NORMALIZADOS al mismo esquema, sin importar el formato del informe.

Devolvé SOLO un ARRAY JSON (lista) con UN objeto por cada muestra que tenga el informe (cada lote, parcela, punto o profundidad es una muestra distinta; si el informe tiene varias páginas, una por página suele ser una muestra), sin texto alrededor, sin explicaciones, sin markdown. Cada objeto tiene EXACTAMENTE este esquema:
${ESQUEMA}

CÓMO RECONOCER CADA DATO (sinónimos habituales):
- pH: "pH H2O", "pH água", "pH en agua", "pH (1:1)", "pH (1:2,5)". Preferí el pH en agua. "pH CaCl2" y "pH SMP" / "índice SMP" son otros: si solo hay CaCl2, usalo como ph y anotá "pH CaCl2" en observaciones.
- materia_organica: "M.O.", "MO", "Matéria orgânica", "MOS", "Mat. org.". Si viene en g/dm³ o g/kg, dividí por 10 (25 g/dm³ = 2,5 %). Si solo hay "C orgánico" / "carbono orgânico" en %, multiplicá por 1,724.
- fosforo: "P", "P Mehlich", "P Mehlich-1", "P (Mehlich)", "Fósforo disponible", "P Bray", "P Olsen" (anotá el método). Si hay "P resina" o "resina de intercambio iónico" además del Mehlich, usá el Mehlich. Unidad mg/dm³ = ppm = mg/kg = mg/L.
- potasio: "K", "K+", "K trocável", "Potássio", "Potasio". Si viene en mg/dm³ o ppm, cmolc = mg / 391. Si viene en mmolc/dm³, cmolc = mmolc / 10.
- calcio: "Ca", "Ca2+", "Ca trocável", "Cálcio". Si viene en mg/dm³, cmolc = mg / 200. Si viene en mmolc/dm³, dividí por 10.
- magnesio: "Mg", "Mg2+", "Mg trocável", "Magnésio". Si viene en mg/dm³, cmolc = mg / 121,5. Si viene en mmolc/dm³, dividí por 10.
- cic: "CIC", "CTC", "CTC pH 7,0", "CTC (T)", "T", "Capacidad de intercambio catiónico", "CTC total". NO uses la "CTC efetiva" (t) si hay ambas; anotala en observaciones. En mmolc/dm³, dividí por 10.
- saturacion_bases: "V", "V%", "Sat. de bases", "Saturação por bases", "Sat. bases". Si no figura pero hay S (suma de bases) y CIC, calculala: V% = S / CIC × 100 y anotá "V% calculada".
- h_al: "H+Al", "H + Al", "Acidez potencial", "Hidrógeno + Aluminio", "Al + H" en cmolc/dm³ (mmolc: dividí por 10). ph_smp: "pH SMP", "índice SMP", "SMP". extractor_p: el método del fósforo que declare el informe (pie de página "Extractores: Mehlich 1: P..." o el encabezado de la columna).
- aluminio: "Al", "Al3+", "Al trocável", "Alumínio". saturacion_aluminio: "m", "m%", "Sat. Al", "Saturação por alumínio".
- azufre: "S", "S-SO4", "SO4", "Enxofre", "Azufre" en mg/dm³. boro: "B". zinc: "Zn". cobre: "Cu". manganeso: "Mn". Fe va a observaciones.
- arcilla / limo / arena: "Argila", "Silte", "Areia"; en g/kg dividí por 10 para llevar a %.
- Ojo con las tablas desalineadas de PDF: cada valor pertenece a la fila de su elemento; verificá con S = Ca + Mg + K y CIC = S + (H+Al) cuando esos datos existan; si no cuadra, revisá la asignación.

REGLAS:
- Si el informe tiene una sola muestra, devolvé un array con un solo objeto.
- Los números pueden venir con coma decimal (ej "6,84"): devolvelos como número con punto (6.84).
- Si un valor dice "NS" (no solicitado), "ND" (no detectado), "N.I." o está vacío, poné null.
- No inventes valores que no estén en el informe: ante la duda, null. Anotá en observaciones cualquier conversión de unidades que hayas hecho.
- Si el archivo no es un análisis de suelo, devolvé un array vacío [].`;

const ESQUEMA_FOLIAR = `{
  "muestra": "identificación de la muestra tal cual figura (lote, parcela, número, cliente), o null",
  "laboratorio": "nombre del laboratorio si figura, o null",
  "fecha": "fecha del muestreo o, si no figura, del informe, en formato AAAA-MM-DD, o null",
  "cultivo": "cultivo tal cual figura (Soja, Maíz, Trigo, Girasol, Sorgo…), o null",
  "estadio": "estadio fenológico si figura (ej 'R2', 'floración', 'V6', 'espigamiento'), o null",
  "hoja": "órgano muestreado si figura (ej '3er trifolio', 'hoja de la espiga', 'planta entera'), o null",
  "n": "nitrógeno N en g/kg como número, o null",
  "p": "fósforo P en g/kg como número, o null",
  "k": "potasio K en g/kg como número, o null",
  "ca": "calcio Ca en g/kg como número, o null",
  "mg": "magnesio Mg en g/kg como número, o null",
  "s": "azufre S en g/kg como número, o null",
  "b": "boro B en mg/kg como número, o null",
  "cu": "cobre Cu en mg/kg como número, o null",
  "fe": "hierro Fe en mg/kg como número, o null",
  "mn": "manganeso Mn en mg/kg como número, o null",
  "mo": "molibdeno Mo en mg/kg como número, o null",
  "zn": "zinc Zn en mg/kg como número, o null",
  "observaciones": "otros datos útiles en texto corto: Na, Cl, Si, Ni, relaciones, unidades originales, avisos de conversión. o null"
}`;

const SYSTEM_FOLIAR = `Sos un asistente agronómico que lee informes de ANÁLISIS FOLIAR / de tejido vegetal (hoja, planta entera) de CUALQUIER laboratorio (Paraguay, Brasil, Argentina; en español o portugués) y devuelve los valores NORMALIZADOS al mismo esquema, sin importar el formato.

Devolvé SOLO un ARRAY JSON (lista) con UN objeto por cada muestra del informe (cada lote, parcela, punto, cultivo o fecha es una muestra distinta), sin texto alrededor, sin explicaciones, sin markdown. Cada objeto tiene EXACTAMENTE este esquema:
${ESQUEMA_FOLIAR}

UNIDADES (muy importante):
- Macronutrientes (N, P, K, Ca, Mg, S) se devuelven en g/kg. Si el laboratorio informa en % o en dag/kg, multiplicá por 10 (4,8 % = 48 g/kg). Si informa en g/kg, dejalo. Si informa en mg/kg o ppm (raro para macros), dividí por 1000.
- Micronutrientes (B, Cu, Fe, Mn, Mo, Zn) se devuelven en mg/kg. ppm = mg/kg = mg/dm³ = µg/g. Si informa en %, multiplicá por 10000.
- Sinónimos: "N total" = n; "P total" = p; "K" / "Potássio" = k; "Ca" / "Cálcio" = ca; "Mg" / "Magnésio" = mg; "S" / "Enxofre" / "Azufre" = s; "B" / "Boro" = b; "Cu" / "Cobre" = cu; "Fe" / "Ferro" / "Hierro" = fe; "Mn" / "Manganês" = mn; "Mo" / "Molibdênio" = mo; "Zn" / "Zinco" = zn.
- Anotá en observaciones cualquier conversión que hayas hecho y las unidades originales.

REGLAS:
- Los números pueden venir con coma decimal: devolvelos con punto.
- "NS", "ND", "N.I.", "<LQ" o vacío → null. No inventes valores.
- Si el archivo es un análisis de SUELO y no de hoja, o no es un análisis, devolvé un array vacío [].`;

const ESQUEMA_AGUA = `{
  "muestra": "identificación de la muestra o de la fuente tal cual figura (ej 'Pozo 1', 'Pozo', 'La Patricia'), o null",
  "fuente": "tipo de fuente si figura: 'Pozo', 'Río', 'Arroyo', 'Tajamar', 'Represa', 'Laguna' u 'Otra'; o null",
  "laboratorio": "nombre del laboratorio si figura, o null",
  "informe": "número o código del informe del laboratorio (ej 'IE-EXT/2026/2548'), o null",
  "fecha": "fecha del muestreo o, si no figura, del informe, en formato AAAA-MM-DD, o null",
  "sodio": {"valor": número de sodio Na+ TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "potasio": {"valor": número de potasio K+ TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "calcio": {"valor": número de calcio Ca2+ TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "magnesio": {"valor": número de magnesio Mg2+ TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "amonio": {"valor": número de amonio NH4+ (o nitrógeno amoniacal) TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "cloruros": {"valor": número de cloruros Cl- TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "sulfatos": {"valor": número de sulfatos SO4 2- TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "carbonatos": {"valor": número de carbonatos CO3 2- (o alcalinidad de carbonatos) TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "bicarbonatos": {"valor": número de bicarbonatos HCO3- (o alcalinidad de bicarbonatos) TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "nitratos": {"valor": número de nitratos NO3- (o nitrógeno de nitratos) TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "fosfatos": {"valor": número de fosfatos / ortofosfato TAL CUAL figura en el informe (sin convertir), "unidad": una de "meq/L", "mg/L", "mmol/L", "mg/L CaCO3", "mg/L N", "mg/L S"} o null,
  "ph": "pH del agua como número, o null",
  "ce": {"valor": conductividad eléctrica TAL CUAL el informe, "unidad": "µS/cm" o "dS/m"} o null,
  "boro": {"valor": boro TAL CUAL el informe, "unidad": "mg/L" o "µg/L"} o null,
  "tds": "sólidos disueltos totales (TDS / residuo seco) en mg/L como número si el informe los da, o null",
  "temperatura": "temperatura del agua en °C si figura, o null",
  "observaciones": "otros datos útiles en texto corto: dureza, hierro, manganeso, RAS o clase informada por el laboratorio, unidades originales y conversiones hechas. o null"
}`;

const SYSTEM_AGUA = `Sos un asistente agronómico que lee informes de ANÁLISIS DE AGUA para riego de CUALQUIER laboratorio (Paraguay, Brasil, Argentina; en español o portugués) y devuelve los valores NORMALIZADOS al mismo esquema, sin importar el formato.

Devolvé SOLO un ARRAY JSON (lista) con UN objeto por cada muestra del informe (cada pozo, fuente o fecha es una muestra distinta), sin texto alrededor, sin explicaciones, sin markdown. Cada objeto tiene EXACTAMENTE este esquema:
${ESQUEMA_AGUA}

UNIDADES (muy importante): NO CONVIERTAS NADA. Copiá cada número exactamente como figura en el informe y decí en qué unidad está, eligiendo de la lista. La conversión la hace la app con una regla fija.
- "meq/L": también cuando el informe dice mmolc/L, me/L, meq/l.
- "mg/L": también ppm, mg/l, g/m³ (el ion como tal: Na, Ca, Cl, SO4, HCO3, NO3…).
- "mmol/L": milimoles por litro (no mmolc).
- "mg/L CaCO3": el valor está expresado como carbonato de calcio. Es el caso de la alcalinidad y, a menudo, de carbonatos y bicarbonatos aunque la unidad diga solo "mg/L". Para carbonatos y bicarbonatos DECIDÍ CON NÚMEROS, en este orden:
  1) Si el informe trae alcalinidad total (T) y alcalinidad P o a la fenolftaleína (P), ambas en mg/L CaCO3, calculá cómo serían los IONES: CO3 ion = 2 × P × 0,60 y HCO3 ion = (T − 2 × P) × 0,61. Si los valores informados coinciden (±3 %) con esos iones, están como ion: usá "mg/L" (ejemplo: T = 160, P = 27,2 → CO3 ion 32,6 y HCO3 ion 64,4; si el informe dice CO3 32,6 y HCO3 64,4, son iones aunque el método sea SM 2320 o diga "Cálculo"). Si en cambio coinciden con 2 × P y T − 2 × P (54,4 y 105,6 en el ejemplo), están como CaCO3.
  2) Si el informe trae el CSR / RSC (carbonato de sodio residual) en meq/L, probá las dos unidades: CSR = CO3 + HCO3 − Ca − Mg en meq/L (ion mg/L: CO3 ÷ 30, HCO3 ÷ 61; CaCO3: ambos ÷ 50; Ca mg/L ÷ 20, Mg mg/L ÷ 12,15). Quedate con la unidad que reproduce el CSR del laboratorio.
  3) Sin esos datos: usá "mg/L CaCO3" si el parámetro se llama "Alcalinidad de carbonatos" / "Alcalinidad de bicarbonatos", o si carbonato + bicarbonato TAL CUAL suman (±3 %) la alcalinidad total informada. Si no, "mg/L" (el ion). Que el método sea SM 2320 o "Cálculo" NO alcanza por sí solo para decir CaCO3.
  También "mg/L CaCO3" para calcio o magnesio informados como dureza en CaCO3.
- "mg/L N": cuando el parámetro se llama "Nitrógeno amoniacal", "N-NH4", "NH3-N", "Nitrógeno de nitratos", "N-NO3" o dice "como N", o el método es SM 4500-NH3 (esos métodos informan nitrógeno). Si dice solo "Amonio"/"NH4+" sin método de nitrógeno, o "Nitrato"/"NO3", usá "mg/L".
- "mg/L S": azufre de sulfatos (S-SO4).
- CE: "µS/cm" (también µmho/cm); "dS/m" (también mS/cm y mmho/cm). No la conviertas.
- Boro: "mg/L" (también ppm) o "µg/L" (también ppb).
- pH, TDS (mg/L) y temperatura (°C) van como número simple.
- Anotá en observaciones la alcalinidad total si figura y qué criterio usaste para carbonatos y bicarbonatos.

REGLAS:
- Los números pueden venir con coma decimal: devolvelos con punto.
- "NS", "ND", "N.I.", "<LQ", "< LD", "< X" (debajo del límite de detección) o vacío → null. No inventes valores.
- Si un valor viene como "> X" o "mayor que X" (por encima del rango del método), devolvé X como valor (es un mínimo: el valor real es mayor) y anotá en observaciones "<ion> mayor que X: se usó X como mínimo". Para el riego es importante no perderlo.
- Si el archivo es un análisis de SUELO o FOLIAR y no de agua, o no es un análisis, devolvé un array vacío [].`;

function extraerLista(texto: string): unknown[] {
  const t = texto.trim();
  const a = t.match(/\[[\s\S]*\]/);
  if (a) { try { const v = JSON.parse(a[0]); if (Array.isArray(v)) return v; } catch (_) { /* sigue */ } }
  const objetos: unknown[] = [];
  const re = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) { try { objetos.push(JSON.parse(m[0])); } catch (_) { /* ignorar */ } }
  return objetos;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }, 500);

    let cuerpo: { mime?: string; data_base64?: string; tipo?: string };
    try { cuerpo = await req.json(); }
    catch (e) { console.error('leer-analisis: cuerpo inválido', String(e)); return json({ error: 'No se pudo recibir el archivo (¿demasiado grande?). Probá con un PDF más liviano o una foto.' }, 400); }

    const { mime, data_base64 } = cuerpo;
    const foliar = cuerpo.tipo === 'foliar';
    const agua = cuerpo.tipo === 'agua';
    if (!data_base64) return json({ error: 'No se recibió el archivo' }, 400);
    const mb = Math.round(data_base64.length * 0.75 / 1048576 * 10) / 10;
    if (data_base64.length > 28 * 1024 * 1024) return json({ error: 'El archivo es muy grande (' + mb + ' MB). Exportá el PDF más liviano o sacá una foto.' }, 413);

    const tipo = mime || 'image/jpeg';
    const esPdf = tipo === 'application/pdf';
    const bloque = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data_base64 } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: data_base64 } };

    console.log('leer-analisis: recibido', agua ? 'AGUA' : (foliar ? 'FOLIAR' : 'SUELO'), tipo, mb + ' MB');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: agua ? SYSTEM_AGUA : (foliar ? SYSTEM_FOLIAR : SYSTEM),
        messages: [{
          role: 'user',
          content: [bloque, { type: 'text', text: agua
            ? 'Extraé los valores de este análisis de agua para riego tal cual figuran, cada uno con su unidad según el esquema (sin convertir). Devolvé un array JSON con un objeto por muestra.'
            : foliar
            ? 'Extraé los valores de este análisis foliar (tejido vegetal), normalizados al esquema (macros en g/kg, micros en mg/kg). Devolvé un array JSON con un objeto por muestra.'
            : 'Extraé los valores de este análisis de suelo, normalizados al esquema. Devolvé un array JSON con un objeto por muestra.' }],
        }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('leer-analisis: Anthropic', r.status, t.slice(0, 500));
      const corto = t.length > 220 ? t.slice(0, 220) + '…' : t;
      return json({ error: 'La IA no pudo leer el archivo (' + r.status + ')', detalle: corto }, 502);
    }

    const j = await r.json();
    const out = (j.content || []).map((c: { text?: string }) => c.text || '').join('\n').trim();
    const lista = extraerLista(out).filter((x) => x && typeof x === 'object');
    if (!lista.length) {
      console.error('leer-analisis: sin JSON interpretable', out.slice(0, 300));
      return json({ error: agua ? 'La IA no encontró valores de análisis de agua en el archivo' : (foliar ? 'La IA no encontró valores de análisis foliar en el archivo' : 'La IA no encontró valores de análisis de suelo en el archivo') }, 422);
    }
    console.log('leer-analisis: ok', lista.length, 'muestra(s)');
    return json({ ok: true, tipo: agua ? 'agua' : (foliar ? 'foliar' : 'suelo'), datos: lista[0], muestras: lista, n: lista.length });

  } catch (e) {
    console.error('leer-analisis: error inesperado', String((e as Error)?.message || e));
    return json({ error: 'Error inesperado', detalle: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
