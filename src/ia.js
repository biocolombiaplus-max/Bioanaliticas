// Asistente de prensa con Claude (Anthropic): textos para redes, notas de prensa con SEO,
// correos a partir de una imagen, y lectura ejecutiva de las métricas.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const configured = () => Boolean(process.env.ANTHROPIC_API_KEY);
let client = null;
const getClient = () => (client ||= new Anthropic());

const ORG = () => process.env.ORG_NAME || 'Alcaldía de Villa del Rosario';

const SISTEMA = () => `Eres el equipo de comunicaciones digitales de ${ORG()} (Villa del Rosario, Norte de Santander, Colombia), al servicio de la jefatura de prensa.
Escribes en español de Colombia: cercano, claro, cálido y profesional; institucional sin ser acartonado.

Contexto territorial: Villa del Rosario hace parte del Área Metropolitana de Cúcuta, junto con Cúcuta, Los Patios, El Zulia, San Cayetano y Puerto Santander. Es cuna de la Gran Colombia (Constitución de 1821, Templo Histórico, Casa de Santander) y municipio de frontera con Venezuela (Puente Internacional Simón Bolívar). Cuando el tema lo permita, invita a todo el área metropolitana, no solo a los rosarienses.

Reglas:
- No inventes datos: fechas, horas, lugares, artistas, cifras o precios que no estén en el brief o en la imagen. Si faltan, usa un marcador visible como [fecha por confirmar].
- Comunicación pública: sin promoción personal de funcionarios, sin mensajes partidistas, lenguaje incluyente y respetuoso.
- SEO local: usa de forma natural términos como "Villa del Rosario", "Norte de Santander", "área metropolitana de Cúcuta" y el nombre del evento. Títulos SEO de máximo 60 caracteres y meta descripción de máximo 155.
- Hashtags: pocos y útiles (entre 5 y 10), mezclando marca del evento y ubicación.
- Texto alternativo de la imagen: describe lo que se ve, útil para personas con discapacidad visual y para buscadores.
- Escribe para que la gente quiera asistir, compartir y dar clic; evita mayúsculas sostenidas y exceso de signos de exclamación.`;

const COPY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['descripcion_imagen', 'texto_alternativo', 'seo', 'instagram', 'facebook', 'x', 'whatsapp', 'nota_prensa', 'correo', 'recomendaciones'],
  properties: {
    descripcion_imagen: { type: 'string' },
    texto_alternativo: { type: 'string' },
    seo: {
      type: 'object', additionalProperties: false, required: ['titulo', 'meta_descripcion', 'slug', 'palabras_clave'],
      properties: { titulo: { type: 'string' }, meta_descripcion: { type: 'string' }, slug: { type: 'string' }, palabras_clave: { type: 'array', items: { type: 'string' } } },
    },
    instagram: {
      type: 'object', additionalProperties: false, required: ['texto', 'hashtags', 'primera_linea'],
      properties: { primera_linea: { type: 'string' }, texto: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } },
    },
    facebook: { type: 'string' },
    x: { type: 'string' },
    whatsapp: { type: 'string' },
    nota_prensa: {
      type: 'object', additionalProperties: false, required: ['titulo', 'entradilla', 'cuerpo', 'cita'],
      properties: { titulo: { type: 'string' }, entradilla: { type: 'string' }, cuerpo: { type: 'string' }, cita: { type: 'string' } },
    },
    correo: {
      type: 'object', additionalProperties: false, required: ['asunto', 'preheader', 'titular', 'mensaje', 'boton_texto', 'cierre'],
      properties: { asunto: { type: 'string' }, preheader: { type: 'string' }, titular: { type: 'string' }, mensaje: { type: 'string' }, boton_texto: { type: 'string' }, cierre: { type: 'string' } },
    },
    recomendaciones: { type: 'array', items: { type: 'string' } },
  },
};

const ANALISIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titular', 'resumen_ejecutivo', 'hallazgos', 'recomendaciones', 'alertas'],
  properties: {
    titular: { type: 'string' },
    resumen_ejecutivo: { type: 'string' },
    hallazgos: { type: 'array', items: { type: 'string' } },
    recomendaciones: { type: 'array', items: { type: 'string' } },
    alertas: { type: 'array', items: { type: 'string' } },
  },
};

async function ask({ content, schema, effort = 'medium', maxTokens = 16000 }) {
  if (!configured()) {
    const e = new Error('La IA no está activada: agrega ANTHROPIC_API_KEY en las variables de entorno.');
    e.status = 400;
    throw e;
  }
  let response;
  try {
    response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SISTEMA(), cache_control: { type: 'ephemeral' } }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    const e = new Error(
      err instanceof Anthropic.AuthenticationError ? 'La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY.'
        : err instanceof Anthropic.RateLimitError ? 'La IA está recibiendo muchas solicitudes. Intenta de nuevo en un minuto.'
          : err instanceof Anthropic.BadRequestError ? 'La IA no pudo procesar la solicitud: ' + err.message
            : 'No fue posible conectar con la IA. Intenta de nuevo.');
    e.status = err instanceof Anthropic.APIError && err.status ? err.status : 502;
    throw e;
  }
  if (response.stop_reason === 'refusal') {
    const e = new Error('La IA no generó contenido para esta solicitud. Ajusta el texto o la imagen e intenta de nuevo.');
    e.status = 422;
    throw e;
  }
  if (response.stop_reason === 'max_tokens') {
    const e = new Error('La respuesta quedó incompleta. Intenta con un brief más corto.');
    e.status = 502;
    throw e;
  }
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

// imagenes: [{ media_type, data(base64) }]
async function generarContenido({ imagenes = [], brief = {} }) {
  const lines = [
    'Crea el paquete completo de contenidos para esta pieza.',
    brief.tema && `Tema o evento: ${brief.tema}`,
    brief.objetivo && `Objetivo: ${brief.objetivo}`,
    brief.publico && `Público: ${brief.publico}`,
    brief.fecha && `Fecha y hora: ${brief.fecha}`,
    brief.lugar && `Lugar: ${brief.lugar}`,
    brief.enlace && `Enlace al que debe llevar la acción: ${brief.enlace}`,
    brief.tono && `Tono deseado: ${brief.tono}`,
    brief.palabras && `Palabras clave a incluir: ${brief.palabras}`,
    brief.notas && `Datos adicionales: ${brief.notas}`,
    imagenes.length ? 'Usa la(s) imagen(es) adjunta(s) como fuente principal: lee el texto que contengan (fechas, nombres, lugares) y describe la escena.' : 'No hay imagen; trabaja solo con el brief.',
    'En el correo, usa {{nombre}} para saludar a cada persona. Separa los párrafos del mensaje del correo y de la nota de prensa con una línea en blanco.',
    'En la nota de prensa escribe al menos 4 párrafos con estructura de pirámide invertida. La cita debe ir atribuida a "[nombre y cargo del vocero]" para que prensa la complete.',
    'En recomendaciones da 3 a 5 consejos concretos de publicación: horario, formato, a quién etiquetar y cómo reutilizar la pieza.',
  ].filter(Boolean).join('\n');
  const content = [
    ...imagenes.slice(0, 4).map(img => ({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } })),
    { type: 'text', text: lines },
  ];
  return ask({ content, schema: COPY_SCHEMA, effort: 'medium' });
}

async function analizarMetricas(datos) {
  const content = [{
    type: 'text',
    text: `Actúa como analista senior de redes sociales y prepara la lectura ejecutiva para la jefatura de prensa.
Usa solo estas cifras (no inventes otras). Explica qué significan en lenguaje sencillo, compara con referencias del sector cuando aplique y propone acciones concretas para las próximas 72 horas.
En "alertas" señala riesgos o datos que requieren atención (comentarios negativos, baja interacción, preguntas sin responder); deja la lista vacía si no hay.

Datos:
${JSON.stringify(datos, null, 1)}`,
  }];
  return ask({ content, schema: ANALISIS_SCHEMA, effort: 'medium', maxTokens: 8000 });
}

module.exports = { configured, generarContenido, analizarMetricas, MODEL };
