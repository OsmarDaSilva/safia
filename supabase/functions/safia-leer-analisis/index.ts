// SAFIA · Edge Function: safia-leer-analisis (v5)
// Lee una foto o PDF de un análisis de suelo, de CUALQUIER laboratorio, y devuelve los valores
// normalizados (mismos nombres y unidades) en JSON, una entrada por muestra.
// v4: varias muestras + parseo robusto + registro de fallas. v5: sinónimos y unidades por laboratorio.

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
  "arena": "arena en % como número, o null",
  "limo": "limo en % como número, o null",
  "arcilla": "arcilla en % como número, o null",
  "aluminio": "aluminio intercambiable Al3+ en cmolc/dm³ como número, o null",
  "saturacion_aluminio": "saturación de aluminio m% como número, o null",
  "azufre": "azufre S-SO4 en mg/dm³ como número, o null",
  "boro": "boro en mg/dm³, o null",
  "zinc": "zinc en mg/dm³, o null",
  "observaciones": "otros datos útiles en texto corto: H+Al, S (suma de bases), Cu, Fe, Mn, relaciones Ca/Mg, pH CaCl2/SMP, unidades originales, avisos de conversión. o null"
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
- aluminio: "Al", "Al3+", "Al trocável", "Alumínio". saturacion_aluminio: "m", "m%", "Sat. Al", "Saturação por alumínio".
- azufre: "S", "S-SO4", "SO4", "Enxofre", "Azufre" en mg/dm³. boro: "B". zinc: "Zn". Cu, Fe, Mn van a observaciones.
- arcilla / limo / arena: "Argila", "Silte", "Areia"; en g/kg dividí por 10 para llevar a %.
- Ojo con las tablas desalineadas de PDF: cada valor pertenece a la fila de su elemento; verificá con S = Ca + Mg + K y CIC = S + (H+Al) cuando esos datos existan; si no cuadra, revisá la asignación.

REGLAS:
- Si el informe tiene una sola muestra, devolvé un array con un solo objeto.
- Los números pueden venir con coma decimal (ej "6,84"): devolvelos como número con punto (6.84).
- Si un valor dice "NS" (no solicitado), "ND" (no detectado), "N.I." o está vacío, poné null.
- No inventes valores que no estén en el informe: ante la duda, null. Anotá en observaciones cualquier conversión de unidades que hayas hecho.
- Si el archivo no es un análisis de suelo, devolvé un array vacío [].`;

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

    let cuerpo: { mime?: string; data_base64?: string };
    try { cuerpo = await req.json(); }
    catch (e) { console.error('leer-analisis: cuerpo inválido', String(e)); return json({ error: 'No se pudo recibir el archivo (¿demasiado grande?). Probá con un PDF más liviano o una foto.' }, 400); }

    const { mime, data_base64 } = cuerpo;
    if (!data_base64) return json({ error: 'No se recibió el archivo' }, 400);
    const mb = Math.round(data_base64.length * 0.75 / 1048576 * 10) / 10;
    if (data_base64.length > 28 * 1024 * 1024) return json({ error: 'El archivo es muy grande (' + mb + ' MB). Exportá el PDF más liviano o sacá una foto.' }, 413);

    const tipo = mime || 'image/jpeg';
    const esPdf = tipo === 'application/pdf';
    const bloque = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data_base64 } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: data_base64 } };

    console.log('leer-analisis: recibido', tipo, mb + ' MB');
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
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [bloque, { type: 'text', text: 'Extraé los valores de este análisis de suelo, normalizados al esquema. Devolvé un array JSON con un objeto por muestra.' }],
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
      return json({ error: 'La IA no encontró valores de análisis de suelo en el archivo' }, 422);
    }
    console.log('leer-analisis: ok', lista.length, 'muestra(s)');
    return json({ ok: true, datos: lista[0], muestras: lista, n: lista.length });

  } catch (e) {
    console.error('leer-analisis: error inesperado', String((e as Error)?.message || e));
    return json({ error: 'Error inesperado', detalle: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
