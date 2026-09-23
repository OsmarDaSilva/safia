// SAFIA · Edge Function: safia-leer-analisis (v4)
// Lee una foto o PDF de un análisis de suelo y devuelve los valores en JSON.
// v4: soporta informes con VARIAS muestras (lotes / profundidades) → devuelve una lista;
//     parseo robusto (arrays, varios objetos, texto alrededor); registra el motivo de cada falla.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ESQUEMA = `{
  "muestra": "identificación de la muestra tal cual figura (lote, parcela, número, cliente), o null",
  "fecha": "fecha del análisis en formato AAAA-MM-DD, o null",
  "profundidad": "profundidad del muestreo tal cual (ej '0-20 cm'), o null",
  "ph": "pH en agua (H2O) como número; si solo hay pH CaCl2 usalo; o null",
  "materia_organica": "materia orgánica en % (M.O.) como número, o null",
  "fosforo": "fósforo P disponible (Mehlich/Bray, mg/dm³ o ppm) como número; NO el P de resina; o null",
  "potasio": "potasio K en cmolc/dm³ como número (si viene en mg/dm³ dividí por 391), o null",
  "calcio": "calcio Ca en cmolc/dm³ como número, o null",
  "magnesio": "magnesio Mg en cmolc/dm³ como número, o null",
  "cic": "CIC (capacidad de intercambio catiónico a pH 7) en cmolc/dm³ como número, o null",
  "saturacion_bases": "saturación de bases V% como número, o null",
  "arena": "arena en % como número, o null",
  "limo": "limo en % como número, o null",
  "arcilla": "arcilla en % como número, o null",
  "observaciones": "otros datos útiles en texto corto: Al, H+Al, S (suma de bases), azufre, boro, zinc, otros micronutrientes, relaciones Ca/Mg, laboratorio, pH CaCl2/SMP. o null"
}`;

const SYSTEM = `Sos un asistente agronómico que lee informes de análisis de suelo (de laboratorios de Paraguay, Brasil o Argentina, a veces en portugués o español) y extrae los valores.

Devolvé SOLO un ARRAY JSON (lista) con UN objeto por cada muestra que tenga el informe (cada lote, parcela o profundidad es una muestra distinta), sin texto alrededor, sin explicaciones, sin markdown. Cada objeto tiene EXACTAMENTE este esquema:
${ESQUEMA}

Reglas:
- Si el informe tiene una sola muestra, devolvé un array con un solo objeto.
- Los números pueden venir con coma decimal (ej "6,84"): devolvelos como número con punto (6.84).
- Si un valor dice "NS" (no solicitado), "ND" (no detectado) o está vacío, poné null.
- pH: preferí el pH en H2O (en agua). Si no está, usá el pH en CaCl2 y anotalo en observaciones.
- Fósforo: usá el P disponible por extractor (Mehlich, Bray, "P" en mg/dm³ o ppm). NO uses el "Fósforo" de resina de intercambio iónico si hay ambos.
- Potasio, calcio, magnesio y CIC en cmolc/dm³ (= meq/100 g). Si el potasio viene en mg/dm³ o ppm, convertí: cmolc = mg/391.
- CIC: la capacidad de intercambio catiónico total (a veces "CTC", "T" o "CTC a pH 7,0").
- Saturación de bases: el V% (no la saturación de aluminio m%).
- No inventes valores que no estén en el informe: ante la duda, null.
- Si el archivo no es un análisis de suelo, devolvé un array vacío [].`;

function extraerLista(texto: string): unknown[] {
  const t = texto.trim();
  // 1) array completo
  const a = t.match(/\[[\s\S]*\]/);
  if (a) { try { const v = JSON.parse(a[0]); if (Array.isArray(v)) return v; } catch (_) { /* sigue */ } }
  // 2) uno o varios objetos sueltos
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
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [bloque, { type: 'text', text: 'Extraé los valores de este análisis de suelo. Devolvé un array JSON con un objeto por muestra.' }],
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
    // Compatibilidad: "datos" = primera muestra; "muestras" = todas
    return json({ ok: true, datos: lista[0], muestras: lista, n: lista.length });

  } catch (e) {
    console.error('leer-analisis: error inesperado', String((e as Error)?.message || e));
    return json({ error: 'Error inesperado', detalle: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
