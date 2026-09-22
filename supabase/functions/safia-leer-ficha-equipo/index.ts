// SAFIA · Edge Function: leer-ficha-equipo
// Lee una foto o PDF de la ficha técnica de un equipo de riego (pivote,
// goteo, cañón) y devuelve los datos técnicos en JSON para autocompletar
// el formulario de Equipos.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ESQUEMA = `{
  "marca": "marca del equipo (Valley, Lindsay/Zimmatic, Reinke, Bauer, Irrigar, Fockink, Krebs, Otro) o null",
  "modelo": "modelo tal cual figura (ej '8500', 'DLS') o null",
  "anio": "año de fabricación como número entero o null",
  "superficie_ha": "área irrigada en hectáreas como número o null",
  "caudal_m3h": "caudal en m³/h como número; si viene en L/s multiplicá por 3.6; o null",
  "presion_bar": "presión de trabajo en bar; si viene en mca/m dividí por 10.2; si viene en psi dividí por 14.5; o null",
  "lamina_100_mm": "lámina de agua aplicada al 100% de velocidad, en mm, o null",
  "vuelta_100_h": "tiempo de una vuelta completa al 100% de velocidad, en horas, o null",
  "capacidad_mm_dia": "capacidad máxima diaria en mm/24h, o null",
  "largo_m": "largo/radio del pivote en metros, o null",
  "torres": "cantidad de torres como número entero, o null",
  "angulo": "ángulo de giro en grados (360 si es círculo completo), o null",
  "corner": "'Sí' si tiene corner extensible, 'No' si no, o null",
  "aspersores": "tipo de aspersores: Impacto, Rotator, Spray, LDN o Mixto; o null",
  "altura_aspersores": "'Sobre dosel' o 'Bajo dosel (paddle)', o null",
  "controlador": "controlador inteligente: FieldNET (Lindsay), AgSense (Valley), ICON (Valley), RPM Connect (Reinke), SmartTouch (Bauer), Otro, o 'No' si no tiene; o null",
  "vri": "'Sí' o 'No' si tiene riego de tasa variable (VRI), o null",
  "fertirrigacion": "'Sí' o 'No' si tiene fertirrigación/inyección, o null",
  "telemetria": "'Sí' o 'No' si tiene telemetría o GPS, o null",
  "bomba_marca": "marca de la bomba o null",
  "bomba_potencia_hp": "potencia del motor en HP como número; si viene en kW multiplicá por 1.341; o null",
  "bomba_tipo": "Centrífuga, Sumergible o Turbina vertical; o null",
  "eficiencia_pct": "eficiencia de aplicación en %, o null",
  "observaciones": "otros datos técnicos útiles en texto corto (nº de serie, tramos, diámetro de tubería, tensión, caudal por torre, etc.) o null"
}`;

const SYSTEM = `Sos un técnico en riego que lee fichas técnicas, planillas de dimensionamiento y hojas de datos de equipos de riego (pivotes centrales, goteo, cañones), a veces en español, portugués o inglés.

Devolvé SOLO un objeto JSON con EXACTAMENTE este esquema, sin texto alrededor, sin explicaciones, sin markdown:
${ESQUEMA}

Reglas:
- Los números pueden venir con coma decimal (ej "3,5"): devolvelos con punto (3.5).
- CONVERTÍ unidades a las pedidas: caudal a m³/h (L/s × 3.6), presión a bar (mca ÷ 10.2, psi ÷ 14.5), potencia a HP (kW × 1.341).
- Si un dato no está en la ficha, poné null. NUNCA inventes ni estimes valores.
- Para los campos de Sí/No devolvé exactamente "Sí" o "No".
- Para marca, modelo y controlador usá exactamente una de las opciones listadas cuando coincida; si es otra marca, poné "Otro".
- Si el documento no es una ficha de equipo de riego, devolvé todos los campos en null.`;

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
      return new Response(JSON.stringify({ error: 'El archivo es muy grande (más de ~20 MB).' }),
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
        max_tokens: 1500,
        thinking: { type: 'disabled' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [bloque, { type: 'text', text: 'Extraé los datos técnicos de este equipo de riego en el JSON pedido.' }],
        }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: 'La IA no pudo leer el archivo', detalle: t.slice(0, 300) }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const j = await r.json();
    const out = (j.content || []).map((c) => c.text || '').join('\n').trim();
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) {
      return new Response(JSON.stringify({ error: 'No se pudo interpretar la ficha' }),
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
