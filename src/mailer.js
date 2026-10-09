// Envío de campañas pensado para funciones serverless (Vercel): cada invocación de
// `procesarCola` envía correos durante un tiempo limitado, uno cada N segundos (10 por defecto).
// La cola vive en Redis, así que el ritmo se mantiene entre invocaciones.
const nodemailer = require('nodemailer');
const { kv, col, id } = require('./store');
const { render } = require('./emailTemplate');

const campaigns = col('campaigns');
const contacts = col('contacts');
const sendsOf = cid => col('sends:' + cid);

const cfg = () => ({
  baseUrl: (process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : `http://localhost:${process.env.PORT || 3000}`)).replace(/\/$/, ''),
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
    });
  } else {
    // Modo prueba: el correo se arma completo pero no sale; se guarda una copia para revisarlo.
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
    await kv.set('outbox:' + token, info.message.toString('utf8').slice(0, 200000), { ex: 3 * 86400 });
  }
  return info;
}

async function sendTest(campaign, email, nombre = '') {
  const token = 'prueba-' + id(6);
  const msg = buildMessage(campaign, { email, nombre, token });
  msg.subject = '[PRUEBA] ' + msg.subject;
  await kv.hset('sendidx', { [token]: campaign.id });
  await deliver(msg, token);
  return { simulado: !smtpConfigured() };
}

// ---------- Estadísticas (contadores en Redis: rápidos aunque haya miles de envíos) ----------
const hourKey = t => t.slice(0, 13);
async function bump(cid, field, n = 1, when) {
  await kv.hincrby('stats:' + cid, field, n);
  if (when) await kv.hincrby('act:' + cid, hourKey(when) + '|' + field, n);
}

async function campaignStats(cid) {
  const s = Object.fromEntries(Object.entries(await kv.hgetall('stats:' + cid)).map(([k, v]) => [k, Number(v)]));
  const st = { total: 0, enviados: 0, errores: 0, rebotes: 0, omitidos: 0, abiertos: 0, clics: 0, clicsTotales: 0, aperturasTotales: 0, bajas: 0, ...s };
  st.pendientes = await kv.llen('queue:' + cid);
  const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : 0);
  st.tasaApertura = pct(st.abiertos, st.enviados);
  st.tasaClic = pct(st.clics, st.enviados);
  st.ctor = pct(st.clics, st.abiertos);
  st.tasaBaja = pct(st.bajas, st.enviados);
  st.tasaEntrega = pct(st.enviados, st.enviados + st.rebotes + st.errores);
  st.etaMinutos = Math.ceil(st.pendientes * cfg().delay / 60);
  return st;
}

async function activity(cid) {
  const m = new Map();
  for (const [k, v] of Object.entries(await kv.hgetall('act:' + cid))) {
    const [h, f] = k.split('|');
    const r = m.get(h) || { hora: h + ':00', enviados: 0, aperturas: 0, clics: 0 };
    if (f === 'enviados') r.enviados = Number(v);
    if (f === 'abiertos') r.aperturas = Number(v);
    if (f === 'clics') r.clics = Number(v);
    m.set(h, r);
  }
  return [...m.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}

// ---------- Cola ----------
// Arma la lista de destinatarios: contactos autorizados y sin baja, sin repetir correos.
async function enqueue(campaign) {
  const existing = await sendsOf(campaign.id).all();
  const already = new Set(existing.map(s => s.email));
  const nuevos = {};
  const idx = {};
  for (const ct of await contacts.all()) {
    if (ct.baja || !ct.autorizado || already.has(ct.email)) continue;
    if (campaign.segmento && !(ct.listas || []).includes(campaign.segmento)) continue;
    const token = id();
    nuevos[token] = { id: token, campaignId: campaign.id, email: ct.email, nombre: ct.nombre, estado: 'pendiente', aperturas: 0, clics: 0 };
    idx[token] = campaign.id;
  }
  const tokens = Object.keys(nuevos);
  await sendsOf(campaign.id).putMany(nuevos);
  for (let i = 0; i < tokens.length; i += 400) {
    await kv.hset('sendidx', Object.fromEntries(tokens.slice(i, i + 400).map(t => [t, campaign.id])));
    await kv.rpush('queue:' + campaign.id, ...tokens.slice(i, i + 400));
  }
  if (tokens.length) await kv.hincrby('stats:' + campaign.id, 'total', tokens.length);
  return tokens.length;
}

const today = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora de Colombia
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Envía correos durante `budgetMs` milisegundos respetando el ritmo configurado.
async function procesarCola({ budgetMs = 50000 } = {}) {
  const started = Date.now();
  const c = cfg();
  if (!(await kv.set('lock:cola', '1', { nx: true, ex: Math.ceil(budgetMs / 1000) + 15 }))) return { ocupado: true, enviados: 0 };
  let enviados = 0;
  try {
    while (Date.now() - started < budgetMs) {
      const cid = await kv.get('activa');
      if (!cid) return { enviados, sinCampana: true };
      const campaign = await campaigns.get(cid);
      if (!campaign || campaign.estado !== 'enviando') { await kv.del('activa'); return { enviados }; }
      if (c.dailyLimit && Number(await kv.get('dia:' + today()) || 0) >= c.dailyLimit) {
        if (campaign.nota !== 'limite') { campaign.nota = 'limite'; await campaigns.put(cid, campaign); }
        return { enviados, limiteDiario: true };
      }
      const wait = c.delay * 1000 - (Date.now() - Number(await kv.get('ultimoEnvio') || 0));
      if (wait > 0) {
        if (Date.now() - started + wait > budgetMs) break;
        await sleep(wait);
      }
      const token = await kv.lpop('queue:' + cid);
      if (!token) {
        campaign.estado = 'completada';
        campaign.finalizada = new Date().toISOString();
        campaign.nota = '';
        await campaigns.put(cid, campaign);
        await kv.del('activa');
        return { enviados, completada: true };
      }
      const s = await sendsOf(cid).get(token);
      if (!s) continue;
      const ct = await contacts.get(s.email);
      if (ct && ct.baja) { s.estado = 'omitido'; s.error = 'Se dio de baja'; await sendsOf(cid).put(token, s); await bump(cid, 'omitidos'); continue; }
      await kv.set('ultimoEnvio', String(Date.now()));
      try {
        const info = await deliver(buildMessage(campaign, { email: s.email, nombre: s.nombre, token }), token);
        s.estado = 'enviado';
        s.simulado = !smtpConfigured();
        s.messageId = info.messageId;
        s.enviadoEn = new Date().toISOString();
        await bump(cid, 'enviados', 1, s.enviadoEn);
        await kv.incr('dia:' + today(), 3 * 86400);
        enviados++;
        if (campaign.nota) { campaign.nota = ''; await campaigns.put(cid, campaign); }
      } catch (e) {
        s.intentos = (s.intentos || 0) + 1;
        s.error = e.message;
        if (e.responseCode >= 500 && e.responseCode < 600) { s.estado = 'rebotado'; await bump(cid, 'rebotes'); }
        else if (s.intentos >= 3) { s.estado = 'error'; await bump(cid, 'errores'); }
        else await kv.rpush('queue:' + cid, token);
        if (e.responseCode === 421 || e.responseCode === 454 || /rate|too many/i.test(e.message)) {
          campaign.nota = 'ritmo';
          await campaigns.put(cid, campaign);
          await kv.set('ultimoEnvio', String(Date.now() + 5 * 60 * 1000));
        }
      }
      await sendsOf(cid).put(token, s);
    }
  } finally {
    await kv.del('lock:cola');
  }
  return { enviados };
}

// ---------- Seguimiento ----------
async function findSend(token) {
  const cid = await kv.hget('sendidx', token);
  if (!cid) return null;
  return { cid, s: await sendsOf(cid).get(token) };
}

async function registrarApertura(token) {
  const f = await findSend(token);
  if (!f || !f.s) return;
  const now = new Date().toISOString();
  f.s.aperturas = (f.s.aperturas || 0) + 1;
  await bump(f.cid, 'aperturasTotales');
  if (!f.s.abiertoEn) { f.s.abiertoEn = now; await bump(f.cid, 'abiertos', 1, now); }
  await sendsOf(f.cid).put(token, f.s);
}

async function registrarClic(token) {
  const cid = await kv.hget('sendidx', token);
  const camp = cid ? await campaigns.get(cid) : null;
  const f = cid ? await findSend(token) : null;
  if (f && f.s) {
    const now = new Date().toISOString();
    f.s.clics = (f.s.clics || 0) + 1;
    await bump(cid, 'clicsTotales');
    if (!f.s.clicEn) { f.s.clicEn = now; await bump(cid, 'clics', 1, now); }
    if (!f.s.abiertoEn) { f.s.abiertoEn = now; await bump(cid, 'abiertos', 1, now); } // si hizo clic, lo abrió
    await sendsOf(cid).put(token, f.s);
  }
  return camp ? camp.botonUrl : null;
}

async function darDeBaja(token) {
  const f = await findSend(token);
  if (!f) return false;
  if (f.s && !f.s.bajaEn) {
    f.s.bajaEn = new Date().toISOString();
    await sendsOf(f.cid).put(token, f.s);
    await bump(f.cid, 'bajas');
  }
  const email = f.s && f.s.email;
  const ct = email && await contacts.get(email);
  if (ct && !ct.baja) { ct.baja = true; ct.bajaEn = new Date().toISOString(); await contacts.put(email, ct); }
  return true;
}

module.exports = {
  cfg, smtpConfigured, buildMessage, sendTest, enqueue, procesarCola, campaignStats, activity,
  registrarApertura, registrarClic, darDeBaja, findSend, campaigns, contacts, sendsOf,
};
