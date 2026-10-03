// SAFIA · Lee una factura de energía eléctrica (ANDE u otra distribuidora) con IA y devuelve sus datos
// para repartir el gasto de energía entre los pivots según los mm regados.
//   POST { mime: 'application/pdf' | 'image/jpeg', data_base64 }  →  { ok, factura: {...} }
// Usa ANTHROPIC_API_KEY (secret del proyecto), igual que safia-leer-analisis.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `Sos un asistente que extrae datos de facturas de energía eléctrica para riego (en Paraguay, la ANDE; también distribuidoras de Brasil y Argentina).
Devolvé SOLO un objeto JSON, sin texto antes ni después, con estas claves (null si el dato no figura; nunca inventes):
{
  "distribuidora": texto (ej. "ANDE"),
  "nis": texto (número de suministro / NIS / unidad consumidora),
  "medidor": texto,
  "titular": texto,
  "numeroFactura": texto,
  "categoria": texto (ej. "412 - OTROS 412"),
  "tension": texto (ej. "MEDIA TENSION"),
  "ciclo": texto (ej. "2025/07"),
  "desde": "AAAA-MM-DD" (inicio del período de consumo),
  "hasta": "AAAA-MM-DD" (fin del período de consumo),
  "emision": "AAAA-MM-DD",
  "vencimiento": "AAAA-MM-DD",
  "moneda": "PYG" | "BRL" | "ARS" | "USD",
  "potenciaContratadaKw": número (potencia reservada o contratada; en la ANDE figura como POT.FUE.PTA.kW o potencia reservada),
  "potenciaRegistradaKw": número (demanda máxima medida fuera de punta; en la ANDE, la fila "Potencia", columna consumo resultante),
  "potenciaRegistradaPuntaKw": número (demanda máxima medida en punta; fila "Potencia PC"),
  "kwhPunta": número (energía activa en horario de punta; en la ANDE "Energia Activa PC", consumo),
  "kwhFueraPunta": número (energía activa fuera de punta; "Energia Activa FPC"),
  "kwhTotal": número (si la factura no separa punta y fuera de punta, el total de energía activa),
  "kvarh": número (energía reactiva),
  "importeEnergiaPunta": número,
  "importeEnergiaFueraPunta": número,
  "importeEnergia": número (si no separa punta y fuera de punta),
  "importePotencia": número (potencia reservada o demanda contratada),
  "importeExcesoPotencia": número (exceso de potencia reservada / ultrapasaje de demanda),
  "importeReactiva": número,
  "importeAlumbrado": número,
  "iva": número,
  "total": número (total a pagar sin comisión de la boca de cobranza),
  "conceptos": [ { "concepto": texto, "importe": número } ] (todas las líneas del detalle de facturación, tal cual),
  "observaciones": texto corto con cualquier duda de lectura
}
REGLAS:
- Los importes en guaraníes vienen con coma como separador de miles ("48,926,704" = 48926704): devolvé números sin separadores. En otras monedas respetá los decimales.
- Las fechas vienen como DD/MM/AAAA: devolvelas como AAAA-MM-DD.
- Los consumos son la columna "consumo resultante" (lectura actual − anterior, por la constante), no las lecturas.
- Si el archivo no es una factura de energía eléctrica, devolvé {"error": "no es una factura de energía"}.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }, 500);
    let cuerpo: { mime?: string; data_base64?: string };
    try { cuerpo = await req.json(); } catch (_) { return json({ error: 'No se pudo recibir el archivo (¿demasiado grande?). Probá con una foto o un PDF más liviano.' }, 400); }
    const { mime, data_base64 } = cuerpo;
    if (!data_base64) return json({ error: 'No se recibió el archivo' }, 400);
    if (data_base64.length > 28 * 1024 * 1024) return json({ error: 'El archivo es muy grande. Sacá una foto o exportá el PDF más liviano.' }, 413);
    const tipo = mime || 'image/jpeg';
    const bloque = tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data_base64 } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: data_base64 } };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 3000, system: SYSTEM,
        messages: [{ role: 'user', content: [bloque, { type: 'text', text: 'Extraé los datos de esta factura de energía eléctrica según el esquema. Devolvé solo el objeto JSON.' }] }],
      }),
    });
    if (!r.ok) { const t = await r.text(); console.error('leer-factura: Anthropic', r.status, t.slice(0, 400)); return json({ error: 'La IA no pudo leer el archivo (' + r.status + ')', detalle: t.slice(0, 200) }, 502); }
    const j = await r.json();
    const out = (j.content || []).map((c: { text?: string }) => c.text || '').join('\n').trim();
    const m = out.match(/\{[\s\S]*\}/);
    let f: Record<string, unknown> | null = null;
    if (m) { try { f = JSON.parse(m[0]); } catch (_) { f = null; } }
    if (!f) { console.error('leer-factura: sin JSON', out.slice(0, 300)); return json({ error: 'La IA no encontró los datos de la factura en el archivo' }, 422); }
    if (f.error) return json({ error: String(f.error) }, 422);
    return json({ ok: true, factura: f });
  } catch (e) {
    console.error('leer-factura: error inesperado', String((e as Error)?.message || e));
    return json({ error: 'Error inesperado', detalle: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
