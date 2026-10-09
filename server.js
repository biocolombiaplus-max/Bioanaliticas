require('dotenv').config({ quiet: true });
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { data, save, id } = require('./src/db');
const { parseContacts, EMAIL_RE } = require('./src/csv');
const mailer = require('./src/mailer');
const ig = require('./src/instagram');
const analysis = require('./src/analysis');
const { DEFAULTS, esc } = require('./src/emailTemplate');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ---------------- Sesión del administrador ----------------
const ADMIN_USER = process.env.ADMIN_USER || 'ligia';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esta-clave';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(ADMIN_PASSWORD + ADMIN_USER).digest('hex');
const sign = v => v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const verify = s => {
  if (!s) return null;
  const i = s.lastIndexOf('.');
  const v = s.slice(0, i);
  const good = sign(v);
  return good.length === s.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s)) ? v : null;
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(p => p[0]));

function auth(req, res, next) {
  const v = verify(cookies(req).sesion);
  if (v) {
    const [user, exp] = v.split('|');
    if (Number(exp) > Date.now()) { req.user = user; return next(); }
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesión vencida' });
  res.redirect('/login');
}

const attempts = new Map();
app.post('/login', (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (a.n >= 8 && Date.now() - a.t < 15 * 60 * 1000) return res.redirect('/login?e=bloqueo');
  const okUser = String(req.body.usuario || '').toLowerCase() === ADMIN_USER.toLowerCase();
  const okPass = crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(req.body.clave || '')).digest(),
    crypto.createHash('sha256').update(ADMIN_PASSWORD).digest());
  if (!okUser || !okPass) {
    attempts.set(ip, { n: a.n + 1, t: a.n ? a.t : Date.now() });
    return res.redirect('/login?e=1');
  }
  attempts.delete(ip);
  const exp = Date.now() + 12 * 3600 * 1000;
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sesion=${encodeURIComponent(sign(`${ADMIN_USER}|${exp}`))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
  res.redirect('/');
});
app.get('/logout', (req, res) => { res.setHeader('Set-Cookie', 'sesion=; Path=/; Max-Age=0'); res.redirect('/login'); });
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// ---------------- Seguimiento público (aperturas, clics, bajas) ----------------
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const findSend = token => data.sends.find(s => s.id === token);

app.get('/t/o/:token.gif', (req, res) => {
  const s = findSend(req.params.token);
  if (s) {
    s.aperturas = (s.aperturas || 0) + 1;
    s.abiertoEn = s.abiertoEn || new Date().toISOString();
    save();
  }
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' });
  res.end(GIF);
});

app.get('/t/c/:token', (req, res) => {
  const s = findSend(req.params.token);
  const camp = s && data.campaigns.find(c => c.id === s.campaignId);
  // Solo redirige al enlace guardado en la campaña (nunca a una dirección recibida por URL).
  const target = camp ? camp.botonUrl : (req.params.token.startsWith('prueba-') ? (data.campaigns.at(-1) || DEFAULTS).botonUrl : DEFAULTS.botonUrl);
  if (s) {
    const now = new Date().toISOString();
    s.clics = (s.clics || 0) + 1;
    s.clicEn = s.clicEn || now;
    s.abiertoEn = s.abiertoEn || now; // Si hizo clic, abrió el correo aunque la imagen no cargara.
    save();
  }
  res.redirect(302, target);
});

function unsubscribe(token) {
  const s = findSend(token);
  if (!s) return false;
  s.bajaEn = s.bajaEn || new Date().toISOString();
  const ct = data.contacts.find(c => c.id === s.contactId || c.email === s.email);
  if (ct) { ct.baja = true; ct.bajaEn = ct.bajaEn || s.bajaEn; }
  for (const p of data.sends) if (p.email === s.email && p.estado === 'pendiente') { p.estado = 'omitido'; p.error = 'Se dio de baja'; }
  save();
  return true;
}
const bajaPage = (title, msg, form = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f3f1fb;color:#2a2672;display:grid;place-items:center;min-height:100vh;padding:16px}
.c{background:#fff;max-width:440px;border-radius:18px;padding:32px;text-align:center;box-shadow:0 6px 24px rgba(42,38,114,.1)}img{width:150px}
button{background:#2a2672;color:#fff;border:0;border-radius:999px;padding:14px 26px;font-size:16px;font-weight:700;cursor:pointer}p{color:#55537a;line-height:1.5}</style></head>
<body><div class="c"><img src="/img/logo_sm.png" alt=""><h2>${title}</h2><p>${msg}</p>${form}</div></body></html>`;

app.get('/baja/:token', (req, res) => {
  if (!findSend(req.params.token)) return res.status(404).send(bajaPage('Enlace no válido', 'Este enlace de baja no es válido o ya expiró.'));
  res.send(bajaPage('¿Quieres dejar de recibir nuestros correos?', 'Confirma y no te volveremos a escribir sobre nuestros eventos.',
    `<form method="post"><button type="submit">Sí, darme de baja</button></form>`));
});
app.post('/baja/:token', (req, res) => {
  // También atiende la baja en un clic de Gmail/Outlook (List-Unsubscribe-Post).
  unsubscribe(req.params.token);
  res.send(bajaPage('Listo, te diste de baja', 'Ya no recibirás más correos nuestros. ¡Gracias por acompañarnos!'));
});

// ---------------- Archivos estáticos ----------------
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: '7d' }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.use(auth);
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

// ---------------- API: estado ----------------
app.get('/api/estado', (req, res) => {
  const c = mailer.cfg();
  res.json({
    usuario: req.user,
    smtp: mailer.smtpConfigured(),
    instagram: ig.configured(),
    baseUrl: c.baseUrl,
    baseUrlPublica: !/localhost|127\.0\.0\.1/.test(c.baseUrl),
    remitente: c.fromEmail,
    remitenteNombre: c.fromName,
    delay: c.delay,
    limiteDiario: c.dailyLimit,
    defaults: DEFAULTS,
  });
});

// ---------------- API: contactos ----------------
app.get('/api/contactos', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = data.contacts.filter(c => !q || c.email.includes(q) || (c.nombre || '').toLowerCase().includes(q));
  res.json({
    total: data.contacts.length,
    activos: data.contacts.filter(c => !c.baja && c.autorizado).length,
    bajas: data.contacts.filter(c => c.baja).length,
    listas: [...new Set(data.contacts.flatMap(c => c.listas || []))],
    items: list.slice(-500).reverse(),
  });
});

app.post('/api/contactos/importar', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube un archivo CSV.' });
  if (req.body.confirmo !== 'si') return res.status(400).json({ error: 'Debes confirmar que las personas autorizaron recibir correos.' });
  let parsed;
  try { parsed = parseContacts(req.file.buffer.toString('utf8')); } catch (e) { return res.status(400).json({ error: e.message }); }
  const lista = String(req.body.lista || '').trim() || req.file.originalname.replace(/\.[^.]+$/, '');
  const byEmail = new Map(data.contacts.map(c => [c.email, c]));
  let nuevos = 0, actualizados = 0, duplicadosArchivo = 0, conBaja = 0;
  const seen = new Set();
  for (const c of parsed.contacts) {
    if (seen.has(c.email)) { duplicadosArchivo++; continue; }
    seen.add(c.email);
    const ex = byEmail.get(c.email);
    if (ex) {
      if (ex.baja) conBaja++; // Respetamos la baja: no se reactiva por reimportar.
      ex.nombre = ex.nombre || c.nombre;
      ex.listas = [...new Set([...(ex.listas || []), lista])];
      actualizados++;
    } else {
      const nc = { id: id(8), ...c, autorizado: true, fuente: req.file.originalname, listas: [lista], creado: new Date().toISOString() };
      data.contacts.push(nc);
      byEmail.set(c.email, nc);
      nuevos++;
    }
  }
  save();
  res.json({ nuevos, actualizados, duplicadosArchivo, invalidos: parsed.invalid, sinAutorizacion: parsed.sinAutorizacion, conBaja, lista });
});

app.delete('/api/contactos/:id', (req, res) => {
  const i = data.contacts.findIndex(c => c.id === req.params.id);
  if (i >= 0) data.contacts.splice(i, 1);
  save();
  res.json({ ok: true });
});

// ---------------- API: campañas ----------------
const CAMPOS = ['nombre', 'asunto', 'preheader', 'titular', 'mensaje', 'botonTexto', 'botonUrl', 'cierre', 'remitenteNombre', 'segmento'];
const validUrl = u => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };

app.get('/api/campanas', (req, res) => {
  res.json(data.campaigns.map(c => ({ ...c, stats: mailer.campaignStats(c.id) })).reverse());
});

app.post('/api/campanas', (req, res) => {
  const c = { id: id(8), estado: 'borrador', creado: new Date().toISOString() };
  for (const k of CAMPOS) c[k] = String(req.body[k] ?? DEFAULTS[k] ?? '');
  if (!validUrl(c.botonUrl)) return res.status(400).json({ error: 'El enlace del botón no es válido.' });
  data.campaigns.push(c);
  save();
  res.json(c);
});

app.put('/api/campanas/:id', (req, res) => {
  const c = data.campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  if (c.estado !== 'borrador' && c.estado !== 'pausada') return res.status(400).json({ error: 'Solo se puede editar una campaña en borrador o pausada.' });
  const next = { ...c };
  for (const k of CAMPOS) if (req.body[k] !== undefined) next[k] = String(req.body[k]);
  if (!validUrl(next.botonUrl)) return res.status(400).json({ error: 'El enlace del botón no es válido.' });
  Object.assign(c, next);
  save();
  res.json(c);
});

app.delete('/api/campanas/:id', (req, res) => {
  const c = data.campaigns.find(x => x.id === req.params.id);
  if (c && c.estado === 'enviando') return res.status(400).json({ error: 'Pausa la campaña antes de eliminarla.' });
  data.campaigns = data.campaigns.filter(x => x.id !== req.params.id);
  data.sends = data.sends.filter(s => s.campaignId !== req.params.id);
  save();
  res.json({ ok: true });
});

app.get('/api/campanas/:id/vista', (req, res) => {
  const c = data.campaigns.find(x => x.id === req.params.id) || { ...DEFAULTS };
  const m = mailer.buildMessage(c, { email: 'ejemplo@correo.com', nombre: String(req.query.nombre || 'María'), token: 'vista-previa' });
  res.type('html').send(m.html.replace('<title>', `<!-- Asunto: ${esc(m.subject)} -->\n<title>`));
});
app.post('/api/vista-previa', (req, res) => {
  const c = { ...DEFAULTS, ...req.body };
  const m = mailer.buildMessage(c, { email: 'ejemplo@correo.com', nombre: String(req.body.nombreEjemplo || 'María'), token: 'vista-previa' });
  res.json({ asunto: m.subject, html: m.html, remitente: c.remitenteNombre || mailer.cfg().fromName });
});

app.post('/api/campanas/:id/prueba', async (req, res) => {
  const c = data.campaigns.find(x => x.id === req.params.id);
  const email = String(req.body.email || '').trim();
  if (!c || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  try { res.json(await mailer.sendTest(c, email, req.body.nombre)); } catch (e) { res.status(500).json({ error: 'No se pudo enviar: ' + e.message }); }
});

app.post('/api/campanas/:id/enviar', (req, res) => {
  const c = data.campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  if (data.campaigns.some(x => x.estado === 'enviando' && x.id !== c.id)) return res.status(400).json({ error: 'Ya hay otra campaña enviándose. Espera a que termine o páusala.' });
  const agregados = mailer.enqueue(c);
  c.estado = 'enviando';
  c.iniciada = c.iniciada || new Date().toISOString();
  save();
  mailer.schedule(200);
  res.json({ ok: true, agregados, stats: mailer.campaignStats(c.id) });
});

app.post('/api/campanas/:id/pausar', (req, res) => {
  const c = data.campaigns.find(x => x.id === req.params.id);
  if (c && c.estado === 'enviando') { c.estado = 'pausada'; save(); }
  res.json({ ok: true });
});

app.get('/api/campanas/:id/envios', (req, res) => {
  res.json(data.sends.filter(s => s.campaignId === req.params.id).slice(-1000).reverse());
});

app.get('/api/campanas/:id/actividad', (req, res) => {
  const sends = data.sends.filter(s => s.campaignId === req.params.id);
  const bucket = t => t && t.slice(0, 13) + ':00';
  const m = new Map();
  const add = (t, k) => { const b = bucket(t); if (!b) return; const r = m.get(b) || { hora: b, enviados: 0, aperturas: 0, clics: 0 }; r[k]++; m.set(b, r); };
  for (const s of sends) { add(s.enviadoEn, 'enviados'); add(s.abiertoEn, 'aperturas'); add(s.clicEn, 'clics'); }
  res.json([...m.values()].sort((a, b) => a.hora.localeCompare(b.hora)));
});

// ---------------- API: Instagram ----------------
app.get('/api/publicaciones', (req, res) => res.json(data.posts.slice().reverse()));

app.post('/api/publicaciones', async (req, res) => {
  try {
    const p = ig.addPost(String(req.body.url || '').trim(), String(req.body.etiqueta || ''));
    const r = await ig.analyzePost(p.url);
    Object.assign(p, { demo: r.demo, media: r.media, insights: r.insights, comments: r.comments, actualizado: new Date().toISOString(), error: null });
    p.historial.push({ t: p.actualizado, ...r.insights });
    save();
    res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/publicaciones/actualizar', async (req, res) => { await ig.refreshPosts(); res.json({ ok: true }); });

app.delete('/api/publicaciones/:id', (req, res) => {
  data.posts = data.posts.filter(p => p.id !== req.params.id);
  save();
  res.json({ ok: true });
});

let accountCache = { t: 0, v: null };
async function account(force) {
  if (!force && accountCache.v && Date.now() - accountCache.t < 10 * 60 * 1000) return accountCache.v;
  accountCache = { t: Date.now(), v: await ig.accountOverview() };
  return accountCache.v;
}

app.get('/api/cuenta', async (req, res) => {
  try {
    const ov = await account(req.query.force === '1');
    res.json({ ...ov, analisis: analysis.analyzeAccount(ov), snapshots: data.followerSnapshots.slice(-24 * 60) });
  } catch (e) { res.status(500).json({ error: 'Instagram respondió: ' + e.message }); }
});

// ---------------- API: informes ----------------
app.get('/api/informe', async (req, res) => {
  try {
    const out = { generado: new Date().toISOString() };
    let followers = 0;
    try { const ov = await account(false); out.cuenta = { ...ov, analisis: analysis.analyzeAccount(ov), snapshots: data.followerSnapshots.slice(-24 * 60) }; followers = ov.account.followers_count; }
    catch (e) { out.cuentaError = e.message; }
    if (req.query.post) {
      const p = data.posts.find(x => x.id === req.query.post);
      if (p) out.publicacion = { ...p, analisis: analysis.analyzePost(p, followers) };
    }
    if (req.query.campana) {
      const c = data.campaigns.find(x => x.id === req.query.campana);
      if (c) { const st = mailer.campaignStats(c.id); out.campana = { ...c, stats: st, analisis: analysis.analyzeEmail(st) }; }
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/resumen', (req, res) => {
  const totals = { enviados: 0, abiertos: 0, clics: 0, bajas: 0, pendientes: 0 };
  for (const c of data.campaigns) {
    const s = mailer.campaignStats(c.id);
    totals.enviados += s.enviados; totals.abiertos += s.abiertos; totals.clics += s.clics; totals.bajas += s.bajas; totals.pendientes += s.pendientes;
  }
  const enviando = data.campaigns.find(c => c.estado === 'enviando');
  res.json({
    correos: totals,
    contactos: { total: data.contacts.length, activos: data.contacts.filter(c => !c.baja && c.autorizado).length },
    enviando: enviando ? { id: enviando.id, nombre: enviando.nombre, nota: enviando.nota, stats: mailer.campaignStats(enviando.id) } : null,
    publicaciones: data.posts.map(p => ({ id: p.id, etiqueta: p.etiqueta, url: p.url, demo: p.demo, insights: p.insights, media: p.media && { caption: p.media.caption, timestamp: p.media.timestamp } })),
  });
});

// ---------------- Arranque ----------------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Bioanalíticas listo en ${mailer.cfg().baseUrl} (puerto ${PORT})`);
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠  Define ADMIN_PASSWORD en el archivo .env antes de publicar el panel.');
  if (!mailer.smtpConfigured()) console.warn('ℹ  SMTP sin configurar: los correos se guardarán en data/outbox (modo prueba).');
  if (!ig.configured()) console.warn('ℹ  Instagram sin conectar: se muestran datos de demostración.');
  mailer.start();
  ig.snapshotFollowers();
  setInterval(ig.snapshotFollowers, 60 * 60 * 1000);
  setInterval(() => ig.refreshPosts().catch(() => {}), 3 * 60 * 60 * 1000);
});
