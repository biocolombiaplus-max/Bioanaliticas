// Envío de campañas: un correo cada N segundos (por defecto 10), con baja en un clic,
// seguimiento de aperturas y clics, y respeto a las bajas y al límite diario.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { data, save, id, DATA_DIR } = require('./db');
const { render } = require('./emailTemplate');

const cfg = () => ({
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  fromEmail: process.env.FROM_EMAIL || '',
  fromName: process.env.FROM_NAME || 'Ferias y Fiestas de la Uva',
  replyTo: process.env.REPLY_TO || process.env.FROM_EMAIL || '',
  delay: Math.max(1, Number(process.env.SEND_DELAY_SECONDS || 10)),
  dailyLimit: Number(process.env.DAILY_LIMIT || 0),
  org: { nombre: process.env.ORG_NAME || 'Ferias y Fiestas de la Uva · Villa del Rosario', direccion: process.env.ORG_ADDRESS || '' },
});

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL);

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (smtpConfigured()) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 1,
    });
  } else {
    // Modo prueba: los correos se guardan en data/outbox como archivos .eml para revisarlos.
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  }
  return transport;
}

function buildMessage(campaign, { email, nombre, token }) {
  const c = cfg();
  const r = render(campaign, {
    nombre,
    baseUrl: c.baseUrl,
    org: c.org,
    openUrl: `${c.baseUrl}/t/o/${token}.gif`,
    clickUrl: `${c.baseUrl}/t/c/${token}`,
    unsubUrl: `${c.baseUrl}/baja/${token}`,
  });
  return {
    from: { name: campaign.remitenteNombre || c.fromName, address: c.fromEmail || 'pruebas@localhost' },
    to: nombre ? { name: nombre, address: email } : email,
    replyTo: c.replyTo || undefined,
    subject: r.subject,
    html: r.html,
    text: r.text,
    list: {
      unsubscribe: [{ url: `${c.baseUrl}/baja/${token}`, comment: 'Darse de baja' }, ...(c.fromEmail ? [`mailto:${c.fromEmail}?subject=baja`] : [])],
    },
    headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

async function deliver(msg, token) {
  const info = await getTransport().sendMail(msg);
  if (!smtpConfigured() && info.message) {
    const dir = path.join(DATA_DIR, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${token}.eml`), info.message);
  }
  return info;
}

async function sendTest(campaign, email, nombre = '') {
  const token = 'prueba-' + id(6);
  const msg = buildMessage(campaign, { email, nombre, token });
  msg.subject = '[PRUEBA] ' + msg.subject;
  await deliver(msg, token);
  return { simulado: !smtpConfigured() };
}

// Arma la lista de destinatarios: contactos autorizados y sin baja, sin repetir correos.
function enqueue(campaign) {
  const already = new Set(data.sends.filter(s => s.campaignId === campaign.id).map(s => s.email));
  let n = 0;
  for (const ct of data.contacts) {
    if (ct.baja || !ct.autorizado || already.has(ct.email)) continue;
    if (campaign.segmento && !(ct.listas || []).includes(campaign.segmento)) continue;
    data.sends.push({ id: id(), campaignId: campaign.id, contactId: ct.id, email: ct.email, nombre: ct.nombre, estado: 'pendiente', aperturas: 0, clics: 0 });
    n++;
  }
  save();
  return n;
}

const sentToday = () => {
  const today = new Date().toISOString().slice(0, 10);
  return data.sends.filter(s => s.enviadoEn && s.enviadoEn.startsWith(today) && s.estado === 'enviado').length;
};

let running = false;
let lastSendAt = 0;
let nextTimer = null;

function schedule(ms) {
  clearTimeout(nextTimer);
  nextTimer = setTimeout(tick, ms);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const c = cfg();
    const campaign = data.campaigns.find(x => x.estado === 'enviando');
    if (!campaign) return;
    if (c.dailyLimit && sentToday() >= c.dailyLimit) {
      campaign.nota = `Límite diario de ${c.dailyLimit} correos alcanzado. Se reanuda automáticamente mañana.`;
      save();
      return schedule(10 * 60 * 1000);
    }
    const s = data.sends.find(x => x.campaignId === campaign.id && x.estado === 'pendiente');
    if (!s) {
      campaign.estado = 'completada';
      campaign.finalizada = new Date().toISOString();
      campaign.nota = '';
      save();
      return schedule(1000);
    }
    const ct = data.contacts.find(x => x.id === s.contactId);
    if (ct && ct.baja) { s.estado = 'omitido'; s.error = 'Se dio de baja'; save(); return schedule(200); }
    const wait = c.delay * 1000 - (Date.now() - lastSendAt);
    if (wait > 0) return schedule(wait);
    lastSendAt = Date.now();
    try {
      const info = await deliver(buildMessage(campaign, { email: s.email, nombre: s.nombre, token: s.id }), s.id);
      s.estado = 'enviado';
      s.simulado = !smtpConfigured();
      s.messageId = info.messageId;
      s.enviadoEn = new Date().toISOString();
      campaign.nota = '';
    } catch (e) {
      s.intentos = (s.intentos || 0) + 1;
      s.error = e.message;
      if (e.responseCode && e.responseCode >= 500 && e.responseCode < 600) s.estado = 'rebotado';
      else if (s.intentos >= 3) s.estado = 'error';
      if (/rate|too many|limit|421|454/i.test(e.message)) {
        campaign.nota = 'El proveedor pidió bajar el ritmo; esperando 5 minutos antes de seguir.';
        save();
        return schedule(5 * 60 * 1000);
      }
    }
    save();
    schedule(c.delay * 1000);
  } finally {
    running = false;
  }
}

function start() { schedule(500); }

function campaignStats(campaignId) {
  const list = data.sends.filter(s => s.campaignId === campaignId);
  const st = { total: list.length, pendientes: 0, enviados: 0, errores: 0, rebotes: 0, omitidos: 0, abiertos: 0, clics: 0, clicsTotales: 0, aperturasTotales: 0, bajas: 0 };
  for (const s of list) {
    if (s.estado === 'pendiente') st.pendientes++;
    else if (s.estado === 'enviado') st.enviados++;
    else if (s.estado === 'error') st.errores++;
    else if (s.estado === 'rebotado') st.rebotes++;
    else if (s.estado === 'omitido') st.omitidos++;
    if (s.abiertoEn || s.clicEn) st.abiertos++;
    if (s.clicEn) st.clics++;
    st.clicsTotales += s.clics || 0;
    st.aperturasTotales += s.aperturas || 0;
    if (s.bajaEn) st.bajas++;
  }
  const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : 0);
  st.tasaApertura = pct(st.abiertos, st.enviados);
  st.tasaClic = pct(st.clics, st.enviados);
  st.ctor = pct(st.clics, st.abiertos);
  st.tasaBaja = pct(st.bajas, st.enviados);
  st.tasaEntrega = pct(st.enviados, st.enviados + st.rebotes + st.errores);
  st.etaMinutos = Math.ceil(st.pendientes * cfg().delay / 60);
  return st;
}

module.exports = { start, schedule, enqueue, sendTest, buildMessage, campaignStats, smtpConfigured, cfg };
