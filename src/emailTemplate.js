// Plantilla de correo de la Feria de la Uva: HTML compatible con Gmail, Outlook y Apple Mail
// (tablas y estilos en línea) más su versión en texto plano.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function firstName(nombre) {
  const n = (String(nombre || '').trim().split(/[\s,;.]+/)[0] || '').replace(/[^\p{L}'-]/gu, '');
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : '';
}

// Reemplaza {{nombre}}. Si no hay nombre, limpia la frase para que no quede "Hola ,".
function personalize(text, nombre) {
  const n = firstName(nombre);
  if (n) return String(text).replace(/\{\{\s*nombre\s*\}\}/gi, n);
  let t = String(text)
    .replace(/^[ \t]*\{\{\s*nombre\s*\}\}[ \t]*,[ \t]*/gim, '')
    .replace(/\s*\{\{\s*nombre\s*\}\}/gi, '');
  return t.replace(/(^|\n)\s*([a-záéíóúñ¡¿])/g, (m, p, c) => p + c.toUpperCase());
}

const DEFAULTS = {
  nombre: 'Feria de la Uva 2026 · Invitación',
  asunto: '{{nombre}}, este fin de semana te esperamos en la Feria de la Uva 🍇',
  preheader: 'Villa del Rosario abre sus puertas a todo el área metropolitana. Mira aquí la programación completa.',
  titular: '¡Este fin de semana, todo el área metropolitana se encuentra en Villa del Rosario!',
  mensaje:
`Hola {{nombre}},

Llegaron las Ferias y Fiestas de la Uva 2026 y la invitación es para todos: vecinos de Villa del Rosario, Cúcuta, Los Patios, El Zulia, San Cayetano, Puerto Santander y todos los municipios del área metropolitana.

Música, sabores de nuestra tierra, planes para toda la familia y ese ambiente bonito que solo se vive en la feria. Estamos a un paso de ti: este fin de semana el plan es uno solo, venir, encontrarnos y celebrar juntos.

Ya publicamos la programación completa con horarios, artistas y lugares. Dale un vistazo, arma tu plan y no te pierdas nada.`,
  botonTexto: 'Ver la programación 🍇',
  botonUrl: 'https://www.instagram.com/p/DePMxe_J8L0/',
  cierre: '¡Trae a tu familia y a tus amigos! Villa del Rosario te espera con los brazos abiertos.',
  notaBoton: 'Toca el botón y mira horarios, artistas y lugares.',
  tipo: 'invitacion',
};

// Tipos de correo: color del botón y etiqueta superior.
const TIPOS = {
  invitacion: { nombre: 'Invitación a evento', etiqueta: 'Invitación', color: '#e0661f', color2: '#ff9a1f' },
  comunicado: { nombre: 'Comunicado oficial', etiqueta: 'Comunicado oficial', color: '#2a2672', color2: '#4a43b0' },
  boletin: { nombre: 'Boletín informativo', etiqueta: 'Boletín', color: '#1f7fa6', color2: '#2a9ec2' },
  alerta: { nombre: 'Aviso importante', etiqueta: 'Aviso importante', color: '#b3261e', color2: '#d9442f' },
  convocatoria: { nombre: 'Convocatoria o inscripción', etiqueta: 'Convocatoria', color: '#3f8a1f', color2: '#5a9e32' },
  agradecimiento: { nombre: 'Agradecimiento', etiqueta: 'Gracias', color: '#7a3fb0', color2: '#9a5bd0' },
  prensa: { nombre: 'Para periodistas y medios', etiqueta: 'Información para medios', color: '#2a2672', color2: '#3b3592' },
};

const MOTIVO = 'Recibes este correo porque te registraste y autorizaste recibir información sobre nuestros eventos.';

function boton(url, texto, t, outline) {
  const bg = outline ? '#ffffff' : t.color;
  const fg = outline ? t.color : '#ffffff';
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:${outline ? 48 : 56}px;v-text-anchor:middle;width:${outline ? 280 : 320}px;" arcsize="50%" ${outline ? `strokecolor="${t.color}" fillcolor="#ffffff"` : `stroke="f" fillcolor="${t.color}"`}><center style="color:${fg};font-family:Arial,sans-serif;font-size:${outline ? 15 : 17}px;font-weight:bold;">${esc(texto)}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="${url}" target="_blank" style="display:inline-block;background:${bg};${outline ? `border:2px solid ${t.color};` : `background-image:linear-gradient(135deg,${t.color},${t.color2});box-shadow:0 8px 20px rgba(0,0,0,.18);`}color:${fg};text-decoration:none;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:${outline ? 15 : 17}px;font-weight:800;line-height:${outline ? 44 : 56}px;padding:0 ${outline ? 30 : 40}px;border-radius:999px;letter-spacing:.2px;">${esc(texto)}${outline ? '' : ' &rarr;'}</a><!--<![endif]-->`;
}

function render(campaign, { nombre = '', openUrl, clickUrl, click2Url, unsubUrl, baseUrl, org }) {
  const t = TIPOS[campaign.tipo] || TIPOS.invitacion;
  const asunto = personalize(campaign.asunto, nombre);
  const titular = personalize(campaign.titular, nombre);
  const mensaje = personalize(campaign.mensaje, nombre);
  const cierre = personalize(campaign.cierre || '', nombre);
  const parrafos = mensaje.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const logo = campaign.logoUrl === 'ninguno' ? '' : (campaign.logoUrl || `${baseUrl}/img/logo.png`);
  const nota = campaign.notaBoton === undefined ? DEFAULTS.notaBoton : campaign.notaBoton;
  const segundo = campaign.boton2Texto && campaign.boton2Url;
  const motivo = campaign.motivo || MOTIVO;

  const html = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(asunto)}</title>
<style>
  @media (max-width:620px){ .container{width:100%!important} .px{padding-left:22px!important;padding-right:22px!important} .h1{font-size:26px!important;line-height:32px!important} }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f1fb;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(personalize(campaign.preheader || '', nombre))}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f1fb;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(42,38,114,.10);">
    <tr><td style="height:8px;line-height:8px;font-size:0;background:#2a2672;background-image:linear-gradient(90deg,#5cc6e2,#6ab43e,#f26b21,#ffd400);">&nbsp;</td></tr>
    ${logo ? `<tr><td align="center" style="padding:30px 24px 6px;">
      <img src="${esc(logo)}" width="220" alt="${esc(org.nombre)}" style="display:block;width:220px;max-width:70%;height:auto;border:0;">
    </td></tr>` : ''}
    ${campaign.imagenUrl ? `<tr><td style="padding:14px 24px 0;"><img src="${esc(campaign.imagenUrl)}" width="552" alt="${esc(campaign.imagenAlt || titular)}" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:14px;"></td></tr>` : ''}
    <tr><td class="px" style="padding:${logo || campaign.imagenUrl ? 14 : 34}px 48px 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;text-align:center;">
      <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${t.color};background:${t.color}14;border-radius:999px;padding:5px 12px;">${esc(t.etiqueta)}</span>
    </td></tr>
    <tr><td class="px" style="padding:6px 48px 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
      <h1 class="h1" style="margin:10px 0 18px;font-size:30px;line-height:36px;color:#2a2672;font-weight:800;text-align:center;letter-spacing:-.3px;">${esc(titular)}</h1>
      ${parrafos.map(p => `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#3b3a4f;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n      ')}
    </td></tr>
    ${campaign.botonTexto && campaign.botonUrl ? `<tr><td align="center" style="padding:14px 24px 8px;">
      ${boton(clickUrl, campaign.botonTexto, t, false)}
    </td></tr>` : ''}
    ${segundo ? `<tr><td align="center" style="padding:6px 24px 4px;">
      ${boton(click2Url, campaign.boton2Texto, t, true)}
    </td></tr>` : ''}
    ${nota && campaign.botonTexto ? `<tr><td align="center" class="px" style="padding:6px 48px 4px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#8a88a3;">${esc(nota)}</td></tr>` : ''}
    ${cierre ? `<tr><td class="px" style="padding:22px 48px 6px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
      <p style="margin:0;font-size:16px;line-height:26px;color:#2a2672;font-weight:700;text-align:center;">${esc(cierre)}</p>
    </td></tr>` : ''}
    <tr><td style="padding:26px 48px 0;"><table role="presentation" width="100%"><tr>
      <td style="height:4px;background:#5cc6e2;border-radius:4px 0 0 4px;font-size:0;">&nbsp;</td><td style="height:4px;background:#6ab43e;font-size:0;">&nbsp;</td><td style="height:4px;background:#f26b21;font-size:0;">&nbsp;</td><td style="height:4px;background:#ffd400;border-radius:0 4px 4px 0;font-size:0;">&nbsp;</td>
    </tr></table></td></tr>
    <tr><td class="px" style="padding:18px 48px 30px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#8a88a3;text-align:center;">
      ${esc(org.nombre)}${org.direccion ? ` · ${esc(org.direccion)}` : ''}<br>
      ${esc(motivo)}<br>
      Si ya no quieres recibir estos mensajes, <a href="${unsubUrl}" style="color:#2a2672;text-decoration:underline;">date de baja aquí</a>.
    </td></tr>
  </table>
</td></tr>
</table>
<img src="${openUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">
</body>
</html>`;

  const limpio = x => x.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const text = [
    titular, '',
    ...parrafos.flatMap(p => [p, '']),
    ...(campaign.botonTexto && campaign.botonUrl ? [`${limpio(campaign.botonTexto)}: ${clickUrl}`] : []),
    ...(segundo ? [`${limpio(campaign.boton2Texto)}: ${click2Url}`] : []), '',
    cierre, '',
    '—',
    org.nombre + (org.direccion ? ` · ${org.direccion}` : ''),
    motivo,
    `Para darte de baja: ${unsubUrl}`,
  ].join('\n');

  return { subject: asunto, html, text };
}

// Plantillas de redacción por tipo (lenguaje institucional y cercano; los [corchetes] se completan).
const PLANTILLAS = {
  invitacion: {
    asunto: '{{nombre}}, te esperamos en [nombre del evento]',
    preheader: '[Fecha] en [lugar]. Mira aquí toda la información.',
    titular: '¡Te invitamos a [nombre del evento]!',
    mensaje: 'Hola {{nombre}},\n\nQueremos que nos acompañes en [nombre del evento], un espacio pensado para [propósito del evento], abierto a toda la comunidad de Villa del Rosario y del área metropolitana.\n\nFecha: [día y hora]\nLugar: [lugar]\n\nConsulta la programación completa y comparte esta invitación con tu familia y amigos.',
    botonTexto: 'Ver la programación', cierre: '¡Te esperamos!', notaBoton: 'Toca el botón para ver horarios y lugares.',
  },
  comunicado: {
    asunto: 'Comunicado: [tema principal]',
    preheader: 'Información oficial de la administración municipal.',
    titular: '[Titular claro del comunicado]',
    mensaje: 'Hola {{nombre}},\n\nLa administración municipal informa a la comunidad que [hecho principal: qué, quién, cuándo y dónde].\n\n[Contexto o detalle importante en un párrafo corto.]\n\n[Qué debe hacer la ciudadanía o dónde ampliar la información.]',
    botonTexto: 'Leer el comunicado completo', cierre: 'Gracias por mantenerte informado.', notaBoton: '',
  },
  boletin: {
    asunto: 'Lo más importante de la semana en Villa del Rosario',
    preheader: 'Obras, eventos y servicios para ti, en un solo correo.',
    titular: 'Boletín informativo · [mes y semana]',
    mensaje: 'Hola {{nombre}},\n\nEstas son las noticias más importantes de la semana:\n\n• [Noticia 1 en una línea]\n• [Noticia 2 en una línea]\n• [Noticia 3 en una línea]\n\nEncuentra todos los detalles en nuestro portal.',
    botonTexto: 'Leer todas las noticias', cierre: '¡Hasta la próxima semana!', notaBoton: '',
  },
  alerta: {
    asunto: 'Aviso importante: [tema]',
    preheader: 'Información que debes conocer hoy.',
    titular: 'Aviso importante para la comunidad',
    mensaje: 'Hola {{nombre}},\n\nTe informamos que [situación: cierre de vía, corte de servicio, cambio de horario, medida preventiva].\n\nZona o población afectada: [detalle]\nVigencia: [desde / hasta]\n\nRecomendaciones: [qué hacer].',
    botonTexto: 'Ver más información', cierre: 'Cuidarnos es tarea de todos.', notaBoton: '',
  },
  convocatoria: {
    asunto: '{{nombre}}, inscríbete en [nombre de la convocatoria]',
    preheader: 'Inscripciones abiertas hasta el [fecha].',
    titular: 'Inscripciones abiertas: [nombre de la convocatoria]',
    mensaje: 'Hola {{nombre}},\n\nAbrimos la convocatoria [nombre] dirigida a [público]. Es una oportunidad para [beneficio principal].\n\nRequisitos: [requisitos principales]\nFecha límite: [fecha]\n\nLa inscripción es gratuita y se hace en línea.',
    botonTexto: 'Inscribirme ahora', cierre: '¡Te esperamos!', notaBoton: 'Cupos limitados.',
  },
  agradecimiento: {
    asunto: 'Gracias por ser parte de [evento o iniciativa], {{nombre}}',
    preheader: 'Lo logramos juntos. Mira los mejores momentos.',
    titular: '¡Gracias por acompañarnos!',
    mensaje: 'Hola {{nombre}},\n\n[Evento o iniciativa] fue un éxito gracias a ti. [Dato de impacto: asistentes, beneficiados, logros].\n\nTe compartimos las mejores fotos y lo que viene.',
    botonTexto: 'Ver las fotos', cierre: 'Seguimos construyendo juntos.', notaBoton: '',
  },
  prensa: {
    asunto: 'Información para medios: [tema]',
    preheader: 'Comunicado, material gráfico y contacto de prensa.',
    titular: '[Titular para medios]',
    mensaje: 'Hola {{nombre}},\n\nCompartimos con usted la información oficial sobre [tema], para su publicación o cubrimiento.\n\n[Resumen de la noticia en 3 o 4 líneas: qué, quién, cuándo, dónde y por qué.]\n\nPara entrevistas o ampliación, puede contactar a la Oficina de Prensa: [nombre, teléfono y correo].',
    botonTexto: 'Descargar comunicado y fotos', cierre: 'Agradecemos su difusión.', notaBoton: '',
    motivo: 'Recibe este correo por su labor periodística y su relación con la Oficina de Prensa.',
  },
};

module.exports = { render, DEFAULTS, TIPOS, PLANTILLAS, personalize, firstName, esc };
