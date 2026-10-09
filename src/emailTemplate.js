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
};

function render(campaign, { nombre = '', openUrl, clickUrl, unsubUrl, baseUrl, org }) {
  const asunto = personalize(campaign.asunto, nombre);
  const titular = personalize(campaign.titular, nombre);
  const mensaje = personalize(campaign.mensaje, nombre);
  const cierre = personalize(campaign.cierre || '', nombre);
  const parrafos = mensaje.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const logo = `${baseUrl}/img/logo.png`;

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
  a.cta:hover{background:#ff7a2e!important}
</style>
</head>
<body style="margin:0;padding:0;background:#f3f1fb;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(personalize(campaign.preheader, nombre))}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f1fb;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(42,38,114,.10);">
    <tr><td style="height:8px;line-height:8px;font-size:0;background:#2a2672;background-image:linear-gradient(90deg,#5cc6e2,#6ab43e,#f26b21,#ffd400);">&nbsp;</td></tr>
    <tr><td align="center" style="padding:30px 24px 6px;">
      <img src="${logo}" width="230" alt="Ferias y Fiestas de la Uva · Villa del Rosario 2026" style="display:block;width:230px;max-width:70%;height:auto;border:0;">
    </td></tr>
    ${campaign.imagenUrl ? `<tr><td style="padding:14px 24px 0;"><img src="${esc(campaign.imagenUrl)}" width="552" alt="${esc(campaign.imagenAlt || titular)}" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:14px;"></td></tr>` : ''}
    <tr><td class="px" style="padding:10px 48px 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
      <h1 class="h1" style="margin:12px 0 18px;font-size:30px;line-height:36px;color:#2a2672;font-weight:800;text-align:center;letter-spacing:-.3px;">${esc(titular)}</h1>
      ${parrafos.map(p => `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#3b3a4f;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n      ')}
    </td></tr>
    <tr><td align="center" style="padding:14px 24px 8px;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${clickUrl}" style="height:58px;v-text-anchor:middle;width:330px;" arcsize="50%" stroke="f" fillcolor="#f26b21"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">${esc(campaign.botonTexto)}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a class="cta" href="${clickUrl}" target="_blank" style="display:inline-block;background:#f26b21;background-image:linear-gradient(135deg,#f26b21,#ff9a1f);color:#ffffff;text-decoration:none;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;line-height:58px;padding:0 42px;border-radius:999px;box-shadow:0 8px 20px rgba(242,107,33,.35);letter-spacing:.2px;">${esc(campaign.botonTexto)} &rarr;</a>
      <!--<![endif]-->
    </td></tr>
    <tr><td align="center" class="px" style="padding:6px 48px 4px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#8a88a3;">Toca el botón y mira horarios, artistas y lugares.</td></tr>
    ${cierre ? `<tr><td class="px" style="padding:22px 48px 6px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
      <p style="margin:0;font-size:16px;line-height:26px;color:#2a2672;font-weight:700;text-align:center;">${esc(cierre)}</p>
    </td></tr>` : ''}
    <tr><td style="padding:26px 48px 0;"><table role="presentation" width="100%"><tr>
      <td style="height:4px;background:#5cc6e2;border-radius:4px 0 0 4px;font-size:0;">&nbsp;</td><td style="height:4px;background:#6ab43e;font-size:0;">&nbsp;</td><td style="height:4px;background:#f26b21;font-size:0;">&nbsp;</td><td style="height:4px;background:#ffd400;border-radius:0 4px 4px 0;font-size:0;">&nbsp;</td>
    </tr></table></td></tr>
    <tr><td class="px" style="padding:18px 48px 30px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#8a88a3;text-align:center;">
      ${esc(org.nombre)}${org.direccion ? ` · ${esc(org.direccion)}` : ''}<br>
      Recibes este correo porque te registraste y autorizaste recibir información sobre nuestros eventos.<br>
      Si ya no quieres recibir estos mensajes, <a href="${unsubUrl}" style="color:#2a2672;text-decoration:underline;">date de baja aquí</a>.
    </td></tr>
  </table>
</td></tr>
</table>
<img src="${openUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">
</body>
</html>`;

  const text = [
    titular, '',
    ...parrafos.flatMap(p => [p, '']),
    `${campaign.botonTexto.replace(/[^\p{L}\p{N}\s]/gu, '').trim()}: ${clickUrl}`, '',
    cierre, '',
    '—',
    org.nombre + (org.direccion ? ` · ${org.direccion}` : ''),
    'Recibes este correo porque te registraste y autorizaste recibir información sobre nuestros eventos.',
    `Para darte de baja: ${unsubUrl}`,
  ].join('\n');

  return { subject: asunto, html, text };
}

module.exports = { render, DEFAULTS, personalize, firstName, esc };
