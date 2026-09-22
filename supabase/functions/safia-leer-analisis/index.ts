// SAFIA · Edge Function: leer-analisis-suelo
// Lee una foto o PDF de un análisis de suelo y devuelve los valores en JSON.
// Reutiliza el mismo proveedor (Anthropic/Claude) y secret (ANTHROPIC_API_KEY)
// que ya usa SIGA en la base compartida.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ESQUEMA = `{
  "fecha": "fecha del análisis en formato AAAA-MM-DD, o null",
  "profundidad": "profundidad del muestreo tal cual (ej '0-20 cm'), o null",
  "ph": "pH en agua (H2O) como número; si solo hay pH CaCl2 usalo; o null",
  "materia_organica": "materia orgánica en % (M.O.) como número, o null",
  "fosforo": "fósforo P disponible (Mehlich/Bray, mg/dm³ o ppm) como número; NO el P de resina; o null",
  "potasio": "potasio K en cmolc/dm³ como número, o null",
  "calcio": "calcio Ca en cmolc/dm³ como número, o null",
  "magnesio": "magnesio Mg en cmolc/dm³ como número, o null",
  "cic": "CIC (capacidad de intercambio catiónico) en cmolc/dm³ como número, o null",
  "saturacion_bases": "saturación de bases V% como número, o null",
  "arena": "arena en % como número, o null",
  "limo": "limo en % como número, o null",
  "arcilla": "arcilla en % como número, o null",
  "observaciones": "otros datos útiles en texto corto: Al, H+Al, S(suma bases), azufre, boro, micronutrientes, relaciones Ca/Mg, laboratorio, pH CaCl2/SMP. o null"
}`;

const SYSTEM = `Sos un asistente agronómico que lee informes de análisis de suelo (de laboratorios como BIOSOLLO, Embrapa, etc., a veces en portugués o español) y extrae los valores.

Devolvé SOLO un objeto JSON con EXACTAMENTE este esquema, sin texto alrededor, sin explicaciones, sin markdown:
${ESQUEMA}

Reglas:
- Los números pueden venir con coma decimal (ej "6,84"): devolvelos como número con punto (6.84).
- Si un valor dice "NS" (no solicitado), "ND" (no detectado) o está vacío, poné null.
- pH: preferí el pH en H2O (en agua). Si no está, usá el pH en CaCl2. Nunca inventes.
- Fósforo: usá el P disponible por extractor (Mehlich, Bray, "P" en mg/dm³). NO uses el "Fósforo" de resina de intercambio iónico si hay ambos.
- CIC: es la capacidad de intercambio catiónico total (a veces "CTC" o "T" a pH 7,0).
- Saturación de bases: el V% (no la saturación de aluminio m%).
- No inventes valores que no estén en el informe: ante la duda, null.
- Si la imagen no es un análisis de suelo, devolvé todos los campos en null.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { mime, data_base64 } = await req.json();
    if (!data_base64) {
      return new Response(JSON.stringify({ error: 'No se recibió el archivo' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (data_base64.length > 28 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'El archivo es muy grande (más de ~20 MB). Sacá una foto más liviana o subí el PDF.' }),
        { status: 413, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const tipo = mime || 'image/jpeg';
    const esPdf = tipo === 'application/pdf';
    const bloque = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data_base64 } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: data_base64 } };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        thinking: { type: 'disabled' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [bloque, { type: 'text', text: 'Extraé los valores de este análisis de suelo en el JSON pedido.' }],
        }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: 'La IA no pudo leer el archivo', detalle: t.slice(0, 300) }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const j = await r.json();
    const out = (j.content || []).map((c: any) => c.text || '').join('\n').trim();
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) {
      return new Response(JSON.stringify({ error: 'No se pudo interpretar el análisis' }),
        { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const datos = JSON.parse(m[0]);

    return new Response(JSON.stringify({ ok: true, datos }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(e && e.message || e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
