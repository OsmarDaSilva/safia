// SAFIA · Edge Function: leer-ficha-equipo
// Lee una foto o PDF de la ficha técnica / planilla de dimensionamiento de
// un equipo de riego y devuelve los datos técnicos en JSON para
// autocompletar el formulario de Equipos.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ESQUEMA = `{
  "marca": "marca del equipo. Usá EXACTAMENTE una de: 'Lindsay / Zimmatic', 'Valley', 'Reinke', 'Bauer', 'Irrigar', 'Fockink', 'Krebs', 'Otro'. o null",
  "modelo": "modelo o configuración del equipo tal cual figura, o null",
  "numero_serie": "número de serie, o si no hay, el número de propuesta/proposta (ej '2024-038 Pv2'), o null",
  "anio": "año de fabricación o instalación como entero; si solo hay un nº de propuesta que empieza con el año (ej 2024-038), usá ese año; o null",
  "superficie_ha": "área total irrigada en hectáreas ('área total irrigada', 'área circular irrigada'), o null",
  "caudal_m3h": "caudal/vazão en m³/h; si viene en L/s multiplicá por 3.6; o null",
  "presion_bar": "presión DE TRABAJO EN LA ENTRADA DEL PIVOTE ('Pressão na entrada do Pivô' / 'presión en el pivote'), en bar. Convertí: mca÷10.2, psi÷14.5. o null",
  "lamina_100_mm": "lámina bruta aplicada en una vuelta al 100% de velocidad, en mm, o null",
  "vuelta_100_h": "tiempo mínimo de una vuelta completa al 100% de velocidad, en horas, o null",
  "capacidad_mm_dia": "capacidad máxima diaria en mm/día (mm/24h), o null",
  "largo_m": "largo del EQUIPO: comprimento total do equipamento (CTE) o raio até a última torre (R.U.T.), en metros. NO incluyas el alcance del cañón final. o null",
  "radio_efectivo_m": "raio efetivo da área irrigada (incluye el alcance del cañón final), en metros, o null",
  "torres": "cantidad de TORRES de sustentación como entero, o null",
  "angulo": "ángulo de giro en grados (360 si es círculo completo), o null",
  "corner": "'Sí' si tiene corner extensible, 'No' si dice que no tiene, null si no se menciona",
  "aspersores": "tipo de emisores: Impacto, Rotator, Spray, LDN o Mixto. null si no se menciona explícitamente",
  "altura_aspersores": "'Sobre dosel' o 'Bajo dosel (paddle)'. null si no se menciona explícitamente",
  "controlador": "panel/controlador: 'FieldNET (Lindsay)', 'AgSense (Valley)', 'ICON (Valley)', 'RPM Connect (Reinke)', 'SmartTouch (Bauer)', 'Otro' si es otro panel (ej FieldVision, 712C), 'No' si dice que no tiene, null si no se menciona",
  "vri": "'Sí' o 'No' si tiene riego de tasa variable (VRI). null si no se menciona",
  "fertirrigacion": "'Sí' o 'No' si tiene fertirrigación/inyectora. null si no se menciona",
  "telemetria": "'Sí' o 'No' si tiene telemetría/GPS/monitoreo remoto. null si no se menciona",
  "bomba_marca": "marca de la bomba, o null",
  "bomba_modelo": "modelo de la bomba tal como figura (ej: BEW 150/3, Meganorm 125-400, HIGRA R2-250), o null",
  "bomba_potencia_hp": "potencia del MOTOR en HP/cv; si viene en kW multiplicá por 1.341; o null",
  "bomba_tipo": "Centrífuga, Sumergible o Turbina vertical; o null",
  "eficiencia_pct": "eficiencia de APLICACIÓN del sistema de riego en %. o null",
  "observaciones": "resumen corto con el resto de los datos técnicos útiles: altura manométrica total, rendimiento de la bomba, modelo de bomba, motor (marca/rpm/polos/tensión), tubería adutora, transformadores, panel, cantidad de outlets, desnivel, velocidad de la última torre, alcance del cañón, distribuidor, propiedad/cliente, etc. o null"
}`;

const SYSTEM = `Sos un ingeniero especialista en riego que lee fichas técnicas y planillas de dimensionamiento de equipos de riego (pivotes centrales, goteo, cañones). Muchas vienen en PORTUGUÉS (Brasil/Paraguay) o mezcla de portugués y español, con marcas Zimmatic, Valley, Reinke, Bauer, Fockink, Krebs, Irrigar.

Devolvé SOLO un objeto JSON con EXACTAMENTE este esquema, sin texto alrededor, sin explicaciones, sin markdown:
${ESQUEMA}

REGLAS CRÍTICAS (no te confundas con estos, son los errores más comunes):
1. PRESIÓN: "presion_bar" es la presión EN LA ENTRADA DEL PIVOTE ("Pressão na entrada do Pivô"). NUNCA uses la "Altura Manométrica Total" (HMT), ni la presión/altura de la bomba, ni las pérdidas de carga. La HMT va en observaciones.
2. EFICIENCIA: "eficiencia_pct" es la eficiencia de APLICACIÓN del sistema de riego. NUNCA uses el "rendimento"/eficiencia de la BOMBA ni del MOTOR (esos van en observaciones). Si la ficha no da la eficiencia de aplicación, poné null.
3. LARGO: "largo_m" es el largo del equipo (CTE / comprimento total do equipamento, o R.U.T. = raio até a última torre). El "raio efetivo da área irrigada", que incluye el alcance del canhão final, va en "radio_efectivo_m", NO en largo_m.
4. TORRES: usá el valor del campo "torres de sustentação" si figura. Si no, contá los tramos (vãos) que llegan hasta la última torre, SIN contar el balanço/voladizo: si la composición dice "1 vão inicial + 8 intermediários + 1 vão" son 10 torres. Verificá que torres × largo del tramo ≈ R.U.T. NO deduzcas la cantidad del número en el modelo (ej "PC 09"): no es confiable.
5. NO INVENTES: si un dato NO figura explícitamente en el documento, poné null. Esto vale especialmente para aspersores, altura de aspersores, VRI, fertirrigación, telemetría y corner: si la ficha no los menciona, poné null, NO pongas "No".

Otras reglas:
- Números con coma decimal ("3,46") van con punto (3.46). Ignorá el separador de miles.
- Convertí unidades: caudal a m³/h (L/s × 3.6), presión a bar (mca ÷ 10.2, psi ÷ 14.5), potencia a HP (kW × 1.341; cv ≈ HP, dejalo igual).
- Glosario PT→ES: vazão=caudal, pressão=presión, lâmina=lámina, raio=radio, vão=tramo, balanço=voladizo, torres de sustentação=torres, altura manométrica=altura manométrica, rendimento=rendimiento, adutora=tubería de conducción, canhão final=cañón final, área irrigada=área regada, painel=panel.
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
        max_tokens: 2000,
        thinking: { type: 'disabled' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [bloque, { type: 'text', text: 'Extraé los datos técnicos de este equipo de riego en el JSON pedido. Respetá las reglas críticas sobre presión, eficiencia, largo y torres.' }],
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
