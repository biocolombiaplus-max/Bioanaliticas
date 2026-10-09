// Revisión de entregabilidad: señala lo que suele mandar un correo a "spam" o a "promociones".
const PALABRAS = ['gratis', 'gana', 'ganador', 'premio', 'urgente', 'oferta', 'descuento', 'promoción', 'promocion', 'compra ya', 'haz clic aquí', 'clic aquí', 'click aquí', '100%', 'dinero', 'sin costo', 'última oportunidad', 'ultima oportunidad', 'felicidades', 'garantizado', 'increíble oferta', 'actúa ya', 'actua ya', '$$$'];

function revisar(c, remitente) {
  const checks = [];
  const add = (ok, texto, nivel = ok ? 'ok' : 'aviso') => checks.push({ ok, nivel, texto });
  const asunto = String(c.asunto || '').replace(/\{\{\s*nombre\s*\}\}/gi, 'María');
  const todo = [c.asunto, c.preheader, c.titular, c.mensaje, c.cierre, c.botonTexto].join(' ');
  const len = asunto.length;

  add(len >= 15 && len <= 60, len > 60 ? `El asunto es largo (${len} caracteres). En el celular se corta: deja lo importante en los primeros 40.` : len < 15 ? 'El asunto es muy corto: agrega de qué se trata.' : `Asunto de buen tamaño (${len} caracteres).`);
  add(/\{\{\s*nombre\s*\}\}/i.test(c.asunto || '') || /\{\{\s*nombre\s*\}\}/i.test(c.mensaje || ''), /\{\{\s*nombre\s*\}\}/i.test((c.asunto || '') + (c.mensaje || '')) ? 'Saludo personalizado con el nombre: mejora la apertura.' : 'Agrega {{nombre}} en el saludo: los correos personalizados se abren más.');
  const mayus = (asunto.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) || []).length;
  add(mayus === 0, mayus ? 'Evita palabras en MAYÚSCULAS en el asunto: los filtros lo ven como grito.' : 'Sin mayúsculas sostenidas en el asunto.');
  const excl = (todo.match(/!/g) || []).length;
  add(excl <= 3 && !/!!|\?\?/.test(todo), excl > 3 || /!!/.test(todo) ? `Hay ${excl} signos de exclamación: deja uno o dos.` : 'Uso moderado de signos de exclamación.');
  const encontrados = PALABRAS.filter(p => todo.toLowerCase().includes(p));
  add(!encontrados.length, encontrados.length ? `Palabras que activan filtros: "${encontrados.slice(0, 4).join('", "')}". Cámbialas por expresiones más naturales.` : 'Sin palabras típicas de spam.');
  const emojis = (asunto.match(/\p{Extended_Pictographic}/gu) || []).length;
  add(emojis <= 1, emojis > 1 ? 'Usa como máximo un emoji en el asunto.' : 'Emojis con moderación.');
  add(Boolean(c.preheader && c.preheader.length >= 20), c.preheader && c.preheader.length >= 20 ? 'Tiene texto de vista previa: se ve completo en la notificación.' : 'Escribe el texto de vista previa: si falta, el celular muestra texto aleatorio.');
  const palabras = String(c.mensaje || '').split(/\s+/).filter(Boolean).length;
  add(palabras >= 30 || !c.imagenUrl, palabras < 30 && c.imagenUrl ? 'El correo es casi solo imagen: agrega al menos 3 líneas de texto (los filtros desconfían de correos sin texto).' : 'Buena proporción entre texto e imagen.');
  add(palabras <= 350, palabras > 350 ? `El mensaje es largo (${palabras} palabras). Resume y deja el detalle en el enlace.` : 'Mensaje de lectura rápida.');
  const enlaces = [c.botonUrl, c.boton2Url].filter(Boolean);
  add(enlaces.every(u => /^https:\/\//i.test(u)), enlaces.some(u => !/^https:\/\//i.test(u)) ? 'Usa enlaces seguros (https://) en los botones.' : 'Enlaces seguros (https).');
  add(!enlaces.some(u => /bit\.ly|tinyurl|goo\.gl|t\.co\/|cutt\.ly/i.test(u)), enlaces.some(u => /bit\.ly|tinyurl|goo\.gl|cutt\.ly/i.test(u)) ? 'Evita acortadores de enlaces (bit.ly, etc.): los filtros los asocian con spam.' : 'Sin acortadores de enlaces.');
  if (remitente) {
    const dom = remitente.email.split('@')[1];
    if (/^(gmail|googlemail)\.com$/i.test(dom)) {
      add(true, `Envío desde Gmail: el panel no pasa de ${remitente.limiteDiario || 300} correos al día y espera ${process.env.SEND_DELAY_SECONDS || 10} segundos entre cada uno, dentro de las reglas de Google.`);
      add(!c.imagenUrl || String(c.mensaje || '').length > 200, 'Con Gmail, prefiere correos con buen texto y una sola imagen liviana.');
    } else
    add(!/^(hotmail|outlook|yahoo|live)\./i.test(dom), /^(hotmail|outlook|yahoo|live)\./i.test(dom) ? `Envías desde ${dom}: para envíos masivos usa un dominio propio con SPF, DKIM y DMARC.` : `Remitente con dominio propio (${dom}).`, /^(hotmail|outlook|yahoo|live)\./i.test(dom) ? 'aviso' : 'ok');
  } else add(false, 'No hay remitente configurado: el envío queda en modo prueba.', 'aviso');
  const pendientes = (todo.match(/\[[^\]]{2,60}\]/g) || []);
  add(!pendientes.length, pendientes.length ? `Faltan textos por completar: ${pendientes.slice(0, 3).join(', ')}. No envíes el correo así.` : 'Sin textos de plantilla pendientes.');
  add(true, 'Incluye enlace de baja visible y baja en un clic (requisito de Gmail y Yahoo).');

  const puntos = Math.round(100 * checks.filter(x => x.ok).length / checks.length);
  return { puntos, nivel: puntos >= 85 ? 'Excelente' : puntos >= 65 ? 'Bueno' : 'Mejorable', checks };
}

module.exports = { revisar };
