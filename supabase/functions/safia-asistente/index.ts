// SAFIA · Edge Function: safia-asistente (v5: todo lo del productor —lote, mantenimiento, riegos, suelo— y el líder de la zona sin nombres)
// El agrónomo inteligente de SAFIA: responde preguntas con los datos reales del banco.
// Arquitectura: esta función solo habla con Claude (la llave vive acá, como secreto). Las HERRAMIENTAS se ejecutan en el
// navegador del usuario (safia-asistente.js), sobre los datos que ese usuario ya puede ver con su rol: un cliente ve lo
// suyo y los lotes de la zona sin nombres. El navegador manda la conversación; si Claude pide herramientas, el navegador
// las ejecuta y vuelve a llamar con los resultados, hasta la respuesta final.
// Regla de oro heredada de Don Lindomar (SIGA): todo número sale de los datos, nunca se inventa.
// Llamada HTTP directa a la API de Anthropic, igual que las demás funciones de SAFIA (la librería npm no se empaqueta
// en el despliegue de Supabase).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODELO = 'claude-opus-5-5';

const SISTEMA = `Sos el asistente agronómico de SAFIA (Smart Agro Intelligence), la herramienta de Irrigar para riego y producción agrícola en Paraguay y la región. Respondés preguntas de productores, técnicos y del equipo de Irrigar sobre campos, campañas, rindes, suelos, variedades, clima, riego y proyectos de inversión en riego.

Reglas de oro:
1. Todo número sale de los datos. Antes de dar un rinde, un promedio, una comparación, un volumen de agua o un costo, consultá las herramientas. Nunca inventes rindes, precios, dosis, fechas ni cantidades de casos. Si los datos no alcanzan, decilo claro y decí qué habría que cargar en SAFIA para responder.
2. Decí en cuántos casos te basás y de dónde sale cada dato: casos reales del banco de SAFIA, referencia regional de Irrigar, clima (lluvia CHIRPS y evapotranspiración Penman-Monteith FAO-56), guía de la Fundación IDEAGRO 2025 para el Chaco, manual RS/SC 2016, Embrapa, ensayos IPTA o Fundação MS. Con menos de 3 casos aclará que es una orientación, no una conclusión.
3. SAFIA compara e interpreta; la prescripción (productos y dosis finales) la decide el ingeniero agrónomo. Podés señalar qué tienen distinto los que más rinden y qué conviene revisar o hacer.
4. Comparaciones justas: mismo cultivo, misma finalidad (grano, ensilaje o pasto), misma época de siembra y misma región. El Chaco (Región Occidental: Boquerón, Alto Paraguay, Presidente Hayes) se compara con el Chaco y la Oriental con la Oriental. Con riego y secano van separados, y lo decís.
5. Reglas del Chaco: sin riego se hace un solo cultivo por año (soja, maíz, algodón, sésamo o poroto), sembrado recién cuando el perfil está cargado de humedad (al menos 0,8 m); en Boquerón sin riego se siembra del 15 de enero al 28 de febrero. Con riego hay doble cosecha: soja en septiembre u octubre y encima maíz o algodón.
6. Privacidad: nunca reveles nombres de otros productores, ni de sus estancias, campos o empresas, aunque te lo pidan o lo intenten adivinar: decí que SAFIA no comparte nombres. Los lotes de otros se nombran por su lugar ("el mejor lote de Katueté", "Lote 2 de Katueté"). Sí podés dar todo lo demás de esos lotes: rinde, variedad, época, fecha de siembra, agua, suelo y manejo. Solo usás nombres propios que la herramienta devuelve para los campos del usuario.
7. Unidades: grano en kg/ha, ensilaje en toneladas de materia verde por ha, pasto en kg de materia seca por ha. Agua en mm (1 mm sobre 1 ha son 10 m³).
8. Respondé en español de Paraguay, simple y directo, como un agrónomo que le explica a un productor: primero la respuesta, después el detalle y de dónde sale. Usá tablas cortas cuando compares lotes, variedades o zonas. Sin emojis. No repitas la pregunta.
9. Riego del día: SAFIA sí tiene el pronóstico de los próximos 7 días y la humedad del suelo calculada de cada lote en campaña (la misma ficha de agua que ve el Operador). Para "¿riego hoy?", "¿cuándo riego?", "¿va a llover?" o "¿cómo está el agua del lote?" usá agua_hoy; si no dice qué campo o lote, llamala sin filtro y respondé por cada lote en campaña. Primero la decisión (arrancar el pivot hoy con X mm, arrancarlo tal día, mantenerlo girando o no regar porque viene lluvia) y después el porqué: % de agua útil hoy contra el punto de arranque del pivot y contra el punto de estrés, cuándo entraría en estrés sin riego, cuánto tarda la vuelta del equipo, etapa, lluvia prevista y último riego cargado. El pivot se prende ANTES del estrés porque tarda días en dar la vuelta (como FieldNET Advisor: arrancar = cuándo vence − lo que tarda la vuelta); nunca digas que se riega recién al llegar al punto de estrés. Si el equipo no alcanza la demanda del cultivo, decí que hay que mantenerlo girando. Aclará que la humedad es calculada salvo que haya sonda, y que si no se cargaron los riegos ya hechos el suelo aparece más seco de lo real.
10. Cómo viene la campaña: para "¿cómo viene mi cosecha?", "¿cómo va mi soja?", "¿voy a llegar a la meta?" o "¿qué tengo que hacer esta semana?" usá como_va_campana (sin filtro responde por cada lote en campaña) y, si hace falta decidir el riego, también agua_hoy. El productor no tiene que buscar nada: vos juntás todo. Respondé en este orden: (a) la perspectiva en una línea, solo con los números que devuelve la herramienta (potencial del plan de la meta y/o historia del lote con el descuento de agua), y si el cultivo está al principio del ciclo decí que es el punto de partida y no una estimación de cosecha; (b) cómo viene cada frente con su estado: agua (rinde perdido por falta de agua hasta hoy, días de estrés), planta (NDVI contra las campañas anteriores del mismo lote a los mismos días desde la siembra), nutrición y fertilización (lo cargado contra lo que se lleva la meta, hoja o sensor) y el plan de la meta (hecho, perdido, pendiente); (c) contra las campañas anteriores del lote (variedad, rinde, agua) y contra el mejor lote de la zona, sin nombres; (d) qué hacer ahora, solo lo que todavía se puede hacer en esta etapa; (e) qué falta cargar para que SAFIA oriente mejor. Nunca inventes un rinde esperado.
11. Lo del productor, todo: sobre su pivot, su siembra, sus rindes, sus metas, sus nutrientes, su mantenimiento, sus riegos y lluvias o su suelo, el productor tiene que recibir una respuesta completa sin buscar nada. Elegí la herramienta: el equipo, la historia del lote, rindes, metas y nutrientes de cada campaña → mi_lote; mantenimiento y horímetros → mantenimiento; cuánto se regó o llovió, aplicaciones y registros por fecha o por mes → riegos_y_lluvias; análisis de suelo y cómo cambió → historial_suelo; qué hacer con el suelo → interpretar_suelo; el cultivo que está hoy en el campo, NDVI y la meta → como_va_campana; riego de hoy → agua_hoy. Si la pregunta es amplia ("contame de mi pivot"), combiná varias. Nombrá el pivot o lote como lo tiene cargado.
12. Comparaciones con los demás, sin nombres: "¿qué variedades rindieron más este año?", "en promedio", "¿qué época o mes de siembra?", "¿dónde se rinde más?" → resumen_casos (con anio para "este año", agrupando por variedad, epoca, mes_siembra, localidad o departamento; siempre el mismo cultivo, finalidad y régimen de agua). "¿Cómo está mi suelo contra el mejor?", "¿qué tiene el líder de la región, del departamento o del país que yo no tengo?" → comparar_con_lider, y respondé: (a) quién es el líder en cada ámbito (sin nombre) y su rinde contra el del usuario, (b) el suelo parámetro por parámetro en una tabla (el del usuario, el del líder y el del cuarto de arriba) diciendo qué diferencias pesan para el cultivo según la lectura, (c) qué otra cosa hace distinto (variedad, fecha de siembra, densidad, cultivo anterior, agua, fertilización) y (d) qué conviene revisar. Si el líder es el propio usuario, decíselo y compará con el mejor lote de otro productor. Con pocos casos, decilo: es una orientación. Al líder del país de la otra región se lo compara con cuidado (otro clima y otro suelo).
13. Si la pregunta no es de agronomía, riego, clima, suelos o del negocio del campo, decí amablemente que no es tu tema.`;

// Las herramientas se describen acá (fijas, no las cambia el navegador) y se ejecutan en el navegador.
const FILTROS = {
  cultivo: { type: 'string', description: 'Cultivo, por ejemplo "Soja", "Maíz", "Trigo", "Pastura".' },
  finalidad: { type: 'string', enum: ['grano', 'ensilaje', 'pasto'], description: 'Grano comercial, ensilaje o pasto.' },
  epoca: { type: 'string', enum: ['Primavera/Verano', 'Verano/Otoño', 'Otoño/Invierno'], description: 'Época de siembra (zafra, zafriña o invierno).' },
  riego: { type: 'string', enum: ['con_riego', 'secano', 'todos'], description: 'Solo lotes con riego, solo de secano, o todos. Por defecto todos.' },
  region: { type: 'string', enum: ['occidental', 'oriental'], description: 'Región de Paraguay: occidental (Chaco) u oriental.' },
  departamento: { type: 'string', description: 'Departamento, por ejemplo "Canindeyú" o "Boquerón".' },
  localidad: { type: 'string', description: 'Localidad o distrito, por ejemplo "Katueté".' },
  variedad: { type: 'string', description: 'Variedad o híbrido (búsqueda parcial).' },
  desde_anio: { type: 'integer', description: 'Solo campañas cosechadas desde este año.' },
  hasta_anio: { type: 'integer', description: 'Solo campañas cosechadas hasta este año.' },
  anio: { type: 'integer', description: 'Solo campañas cosechadas ese año ("este año" = el año de la fecha del contexto).' },
  solo_mios: { type: 'boolean', description: 'true = solo los campos del usuario (o del cliente que está mirando).' },
};

const HERRAMIENTAS = [
  {
    name: 'buscar_casos',
    description: 'Busca campañas cosechadas del banco de SAFIA (casos reales) con filtros y devuelve cada caso con rinde, variedad, época, fechas, agua (lluvia y riego), suelo, clima del ciclo y manejo. Usala para ver los lotes concretos, el mejor lote de una zona o el detalle de un caso.',
    input_schema: { type: 'object', properties: { ...FILTROS, orden: { type: 'string', enum: ['mayor_rinde', 'menor_rinde', 'mas_reciente'], description: 'Orden de la lista. Por defecto mayor rinde.' }, limite: { type: 'integer', description: 'Cuántos casos devolver (1 a 25, por defecto 10).' } } },
  },
  {
    name: 'resumen_casos',
    description: 'Agrupa los casos del banco de SAFIA y devuelve, por grupo, cuántos casos hay, rinde promedio, máximo y mínimo, y agua promedio. Usala para rankings y comparaciones: qué variedad rindió más, qué localidad, qué época, riego contra secano, por año.',
    input_schema: { type: 'object', properties: { ...FILTROS, agrupar_por: { type: 'string', enum: ['variedad', 'localidad', 'departamento', 'region', 'epoca', 'mes_siembra', 'riego', 'anio', 'cultivo', 'campo'], description: 'Cómo agrupar. mes_siembra = mes en que se sembró (para "¿cuándo conviene sembrar?").' } }, required: ['agrupar_por'] },
  },
  {
    name: 'referencia_zona',
    description: 'Referencia agrícola regional de Irrigar (base de producción por localidad o departamento): rinde con riego y en secano y costos de producción por ha, para un cultivo, finalidad y época.',
    input_schema: { type: 'object', properties: { cultivo: FILTROS.cultivo, finalidad: FILTROS.finalidad, epoca: FILTROS.epoca, departamento: FILTROS.departamento, localidad: FILTROS.localidad }, required: ['cultivo'] },
  },
  {
    name: 'info_material',
    description: 'Ficha de una variedad o híbrido del catálogo verificado de SAFIA (grupo de madurez, ciclo, hábito, sanidad, fuente) y sus resultados en ensayos públicos (IPTA, Fundação MS) si los hay.',
    input_schema: { type: 'object', properties: { cultivo: FILTROS.cultivo, variedad: { type: 'string', description: 'Nombre de la variedad o híbrido.' } }, required: ['cultivo', 'variedad'] },
  },
  {
    name: 'clima_y_riego',
    description: 'Clima de los últimos 10 años en un lugar (lluvia CHIRPS, evapotranspiración Penman-Monteith) y cuánto riego lleva un cultivo ahí, simulado día por día: riego neto y bruto por ciclo, 8 de cada 10 años, año más seco, pico de consumo, y cuánto rendiría en secano y cuándo se siembra sin riego. Tarda unos segundos. Indicá un campo del usuario por su nombre o una coordenada.',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (usa su coordenada y su análisis de suelo).' }, lat: { type: 'number' }, lon: { type: 'number' }, cultivo: FILTROS.cultivo, siembra: { type: 'string', description: 'Fecha de siembra día/mes, por ejemplo "20/09". Opcional.' }, departamento: FILTROS.departamento }, required: ['cultivo'] },
  },
  {
    name: 'interpretar_suelo',
    description: 'Interpreta un análisis de suelo para un cultivo con el manual RS/SC 2016 y Embrapa: qué está bien, qué limita y qué conviene hacer (encalado, fósforo, potasio). Indicá un campo del usuario (usa su análisis más nuevo) o los valores.',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario.' }, cultivo: FILTROS.cultivo, valores: { type: 'object', description: 'Valores del análisis si no es de un campo: ph, mo (%), p (mg/dm3), k, ca, mg, cic (cmolc/dm3), satBases (%), arcilla (%).', properties: { ph: { type: 'number' }, mo: { type: 'number' }, p: { type: 'number' }, k: { type: 'number' }, ca: { type: 'number' }, mg: { type: 'number' }, cic: { type: 'number' }, satBases: { type: 'number' }, arcilla: { type: 'number' } } }, rinde_objetivo: { type: 'number', description: 'Rinde objetivo en kg/ha, opcional.' } }, required: ['cultivo'] },
  },
  {
    name: 'agua_hoy',
    description: 'Estado del agua HOY en los lotes en campaña del usuario y qué hacer: % de agua útil en la raíz, si hay que regar hoy y cuántos mm, o cuándo toca el próximo riego, o si no conviene regar porque viene lluvia; más el pronóstico de 7 días (lluvia, probabilidad, temperaturas), la etapa del cultivo, el último riego y la última lluvia cargados. Es el mismo cálculo de la ficha de agua del Operador (balance FAO-56 desde la siembra). Sin campo ni lote devuelve todos los lotes con campaña activa (hasta 8).',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional).' }, lote: { type: 'string', description: 'Nombre del pivot o lote, búsqueda parcial (opcional).' } } },
  },
  {
    name: 'como_va_campana',
    description: 'Cómo viene cada campaña en curso del usuario, todo junto, con los mismos motores del Banco: meta y plan de la meta (meta viva: potencial de hoy, lo hecho, lo que se perdió por ventana pasada, lo que toca ahora), agua por etapa (rinde perdido por falta de agua hasta hoy según FAO-33, días de estrés, próximos 7 días), vigor satelital (NDVI de hoy contra las campañas cosechadas del mismo lote a los mismos días desde la siembra), insumos y fertilización cargados contra lo que se lleva la meta, análisis foliar o sensor, campañas anteriores del lote (variedad, rinde, agua), el mejor lote de la zona (sin nombre) y qué falta cargar. Tarda unos segundos. Sin campo ni lote devuelve todas las campañas activas (hasta 4).',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional).' }, lote: { type: 'string', description: 'Nombre del pivot o lote, búsqueda parcial (opcional).' } } },
  },
  {
    name: 'mi_lote',
    description: 'Ficha completa de los pivots o lotes del usuario: el equipo (marca, modelo, largo, torres, caudal, presión, lámina y horas por vuelta al 100 %, capacidad en mm/día, bomba, corner, telemetría), horas del pivot y resumen del mantenimiento, la campaña activa (cultivo, variedad, siembra, densidad, meta y plan de la meta) y TODAS las campañas anteriores del lote con su rinde, meta cumplida, lluvia y riego, días de ciclo, insumos cargados, balance de nutrientes (lo que se llevó la cosecha contra lo aplicado) y la curva del satélite (NDVI máximo, día del máximo, días con canopia plena), más el rinde promedio, mejor y peor por cultivo. Usala para preguntas sobre mi pivot, mi siembra, mis rindes, mis metas, mis nutrientes o la historia del lote.',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional).' }, lote: { type: 'string', description: 'Nombre del pivot o lote, búsqueda parcial (opcional).' } } },
  },
  {
    name: 'mantenimiento',
    description: 'Estado del mantenimiento de los equipos del usuario: horímetros del pivot, la bomba y el cañón final (con la fecha de la última lectura), tareas vencidas y próximas del plan del fabricante (con cuánto falta y cuándo se hizo la última vez), las que están al día y los últimos registros del operador.',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional).' }, lote: { type: 'string', description: 'Nombre del pivot o lote, búsqueda parcial (opcional).' } } },
  },
  {
    name: 'riegos_y_lluvias',
    description: 'Lo que se CARGÓ en el campo en un período: riegos y lluvias del pluviómetro (con total en mm y por mes), aplicaciones, pastoreos, horímetros y tareas de mantenimiento, con fecha y quién lo cargó. Por defecto desde la siembra de la campaña activa (o los últimos 90 días). Para la humedad del suelo y el pronóstico usá agua_hoy.',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional).' }, lote: { type: 'string', description: 'Pivot o lote (opcional).' }, tipo: { type: 'string', enum: ['todos', 'riego', 'lluvia', 'aplicacion', 'pastoreo', 'horimetro', 'mantenimiento'], description: 'Tipo de registro. Por defecto todos.' }, desde: { type: 'string', description: 'Fecha AAAA-MM-DD (opcional).' }, hasta: { type: 'string', description: 'Fecha AAAA-MM-DD (opcional, por defecto hoy).' }, limite: { type: 'integer', description: 'Cuántos registros listar (5 a 60, por defecto 30).' } } },
  },
  {
    name: 'historial_suelo',
    description: 'Todos los análisis de suelo de los campos del usuario, por fecha (el promedio del lote si hay varias muestras), con la lectura de cada parámetro para el cultivo, cuánto varían las muestras dentro del lote (zonas que piden manejo distinto) y cómo cambió el suelo entre el primer y el último análisis.',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional).' }, cultivo: FILTROS.cultivo } },
  },
  {
    name: 'comparar_con_lider',
    description: 'Compara el campo del usuario con el LÍDER (el lote que más rindió) en su localidad, departamento, región y el país, para un cultivo y con el mismo régimen de agua: rinde, variedad, época y fecha de siembra, densidad, cultivo anterior, agua, fertilización cargada y el SUELO parámetro por parámetro (el del usuario contra el del líder), más el promedio del cuarto de arriba (suelo promedio y variedades) y el promedio del ámbito. Si el líder es el propio usuario, trae además el mejor lote de otro productor. Los lotes de otros productores vienen siempre sin nombre (el mejor lote de <localidad>).',
    input_schema: { type: 'object', properties: { campo: { type: 'string', description: 'Nombre de un campo del usuario (opcional; por defecto el primero).' }, cultivo: FILTROS.cultivo, finalidad: FILTROS.finalidad, epoca: FILTROS.epoca, riego: FILTROS.riego, ambito: { type: 'string', enum: ['todos', 'localidad', 'departamento', 'region', 'pais'], description: 'Dónde buscar al líder. Por defecto todos los ámbitos.' }, anio: FILTROS.anio, desde_anio: FILTROS.desde_anio }, required: ['cultivo'] },
  },
  {
    name: 'mis_campos',
    description: 'Lista los campos que el usuario puede ver en SAFIA: nombre, cliente, localidad, departamento, región, superficie, coordenada, si tiene análisis de suelo, cuántas campañas cosechadas tiene y sus lotes o pivots con la campaña activa de cada uno.',
    input_schema: { type: 'object', properties: {} },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }, 500);
    let cuerpo: { messages?: unknown[] };
    try { cuerpo = await req.json(); } catch (_e) { return json({ error: 'Pedido inválido' }, 400); }
    const messages = Array.isArray(cuerpo.messages) ? cuerpo.messages : null;
    if (!messages || !messages.length) return json({ error: 'Falta la conversación' }, 400);
    if (messages.length > 60) return json({ error: 'La conversación es muy larga: empezá una nueva.' }, 413);
    if (JSON.stringify(messages).length > 900000) return json({ error: 'La conversación es muy larga: empezá una nueva.' }, 413);

    // Fallback del lado del servidor ("default"): si el filtro de seguridad rechaza por error una consulta agronómica,
    // la API la reintenta con el modelo recomendado en lugar de devolver un rechazo.
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 16000,
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        tools: HERRAMIENTAS,
        messages,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('asistente: Anthropic', resp.status, t.slice(0, 400));
      throw Object.assign(new Error(t.slice(0, 200)), { status: resp.status });
    }
    // deno-lint-ignore no-explicit-any
    const r: any = await resp.json();

    // Si hubo un cambio de modelo a mitad de la respuesta, lo anterior al último bloque "fallback" que no es texto no se
    // devuelve a la conversación (regla de la API para seguir la charla).
    // deno-lint-ignore no-explicit-any
    let content: any[] = r.content || [];
    const ultimoFallback = content.map((b) => b.type).lastIndexOf('fallback');
    if (ultimoFallback > 0) content = content.filter((b, i) => i >= ultimoFallback || b.type === 'text');
    console.log('asistente:', r.stop_reason, 'entrada', r.usage?.input_tokens, 'cache', r.usage?.cache_read_input_tokens, 'salida', r.usage?.output_tokens);
    return json({ content, stop_reason: r.stop_reason, stop_details: r.stop_details || null, model: r.model, usage: r.usage || null });
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const err: any = e;
    const status = err?.status || 500;
    console.error('asistente: error', status, String(err?.message || e).slice(0, 300));
    const msg = status === 429 ? 'Hay muchas consultas en este momento: probá de nuevo en un minuto.' : (status === 529 || status >= 500 ? 'El servicio de IA está ocupado: probá de nuevo en un momento.' : 'No se pudo responder');
    return json({ error: msg, detalle: String(err?.message || e).slice(0, 200) }, status >= 400 && status < 600 ? status : 500);
  }
});
