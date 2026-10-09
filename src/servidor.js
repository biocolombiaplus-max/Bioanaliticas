// Aplicación Express. Se exporta para Vercel (api/index.js) y para el servidor local (local.js).
require('dotenv').config({ quiet: true });
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { kv, col } = require('./store');
const { parseContacts, EMAIL_RE } = require('./csv');
const mailer = require('./mailer');
const ig = require('./instagram');
const ia = require('./ia');
const analysis = require('./analysis');
const uploads = require('./uploads');
const { mensajePara } = require('./bienvenida');
const { DEFAULTS, esc } = require('./emailTemplate');

const contenidos = col('contenidos');
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------- Usuarios y sesión ----------------
function users() {
  const map = new Map();
  for (const pair of String(process.env.ADMIN_USERS || '').split(/[,;]/)) {
    const i = pair.indexOf(':');
    if (i > 0) map.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim());
  }
  if (process.env.ADMIN_PASSWORD || !map.size) map.set((process.env.ADMIN_USER || 'ligia').toLowerCase(), process.env.ADMIN_PASSWORD || 'cambia-esta-clave');
  return map;
}
const SECRET = () => process.env.SESSION_SECRET || crypto.createHash('sha256').update('bio|' + [...users()].join('|')).digest('hex');
const sign = v => v + '.' + crypto.createHmac('sha256', SECRET()).update(v).digest('base64url');
const verify = s => {
  if (!s) return null;
  const v = s.slice(0, s.lastIndexOf('.'));
  const good = sign(v);
  return good.length === s.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s)) ? v : null;
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => { const i = c.indexOf('='); return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))]; }).filter(p => p[0]));
const hash = s => crypto.createHash('sha256').update(String(s)).digest();

function sessionUser(req) {
  const v = verify(cookies(req).sesion);
  if (!v) return null;
  const [user, exp] = v.split('|');
  return Number(exp) > Date.now() ? user : null;
}
function cronOk(req) {
  const s = process.env.CRON_SECRET;
  if (!s) return false;
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.clave || '';
  return crypto.timingSafeEqual(hash(given), hash(s));
}
function auth(req, res, next) {
  const u = sessionUser(req);
  if (u) { req.user = u; return next(); }
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Sesión vencida' });
  res.redirect('/');
}

app.post('/login', wrap(async (req, res) => {
  const key = 'login:' + (req.ip || 'x');
  if (Number(await kv.get(key) || 0) >= 8) return res.redirect('/?e=bloqueo#ingresar');
  const user = String(req.body.usuario || '').trim().toLowerCase();
  const pass = users().get(user);
  if (!pass || !crypto.timingSafeEqual(hash(req.body.clave || ''), hash(pass))) {
    await kv.incr(key, 900);
    return res.redirect('/?e=1#ingresar');
  }
  await kv.del(key);
  const exp = Date.now() + 12 * 3600 * 1000;
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sesion=${encodeURIComponent(sign(`${user}|${exp}`))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
  res.redirect('/app.html');
}));
app.get('/logout', (req, res) => { res.setHeader('Set-Cookie', 'sesion=; Path=/; Max-Age=0'); res.redirect('/'); });
app.get('/api/sesion', (req, res) => res.json({ usuario: sessionUser(req) }));

// ---------------- Seguimiento público (aperturas, clics, bajas) ----------------
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/t/o/:file', wrap(async (req, res) => {
  await mailer.registrarApertura(req.params.file.replace(/\.gif$/, '')).catch(() => {});
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' });
  res.end(GIF);
}));
app.get('/t/c/:token', wrap(async (req, res) => {
  // Solo redirige al enlace guardado en la campaña (nunca a una dirección recibida por URL).
  const url = await mailer.registrarClic(req.params.token).catch(() => null);
  res.redirect(302, url || DEFAULTS.botonUrl);
}));

const bajaPage = (title, msg, form = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f3f1fb;color:#2a2672;display:grid;place-items:center;min-height:100vh;padding:16px}
.c{background:#fff;max-width:440px;border-radius:18px;padding:32px;text-align:center;box-shadow:0 6px 24px rgba(42,38,114,.1)}img{width:150px}
button{background:#2a2672;color:#fff;border:0;border-radius:999px;padding:14px 26px;font-size:16px;font-weight:700;cursor:pointer}p{color:#55537a;line-height:1.5}</style></head>
<body><div class="c"><img src="/img/logo_sm.png" alt=""><h2>${title}</h2><p>${msg}</p>${form}</div></body></html>`;
app.get('/baja/:token', wrap(async (req, res) => {
  if (!(await mailer.findSend(req.params.token))) return res.status(404).send(bajaPage('Enlace no válido', 'Este enlace de baja no es válido o ya expiró.'));
  res.send(bajaPage('¿Quieres dejar de recibir nuestros correos?', 'Confirma y no te volveremos a escribir sobre nuestros eventos.', '<form method="post"><button type="submit">Sí, darme de baja</button></form>'));
}));
app.post('/baja/:token', wrap(async (req, res) => {
  // También atiende la baja en un clic de Gmail/Outlook (List-Unsubscribe-Post).
  await mailer.darDeBaja(req.params.token);
  res.send(bajaPage('Listo, te diste de baja', 'Ya no recibirás más correos nuestros. ¡Gracias por acompañarnos!'));
}));

// ---------------- Tareas programadas (Vercel Cron o servicio externo) ----------------
app.all('/api/cron/cola', wrap(async (req, res) => {
  if (!cronOk(req)) return res.status(401).json({ error: 'No autorizado' });
  res.json(await mailer.procesarCola({ budgetMs: Number(process.env.QUEUE_BUDGET_MS || 50000) }));
}));
app.all('/api/cron/diario', wrap(async (req, res) => {
  if (!cronOk(req)) return res.status(401).json({ error: 'No autorizado' });
  await ig.snapshotFollowers().catch(() => {});
  await ig.refreshPosts();
  res.json({ ok: true });
}));

// Archivos locales (solo en desarrollo; en Vercel los sirve la CDN desde /public).
app.use('/uploads', express.static(uploads.LOCAL_DIR, { maxAge: '30d' }));
app.get('/health', (req, res) => res.json({ ok: true, almacenamiento: kv.kind }));

// ---------------- API protegida ----------------
app.use('/api', auth);

app.get('/api/estado', wrap(async (req, res) => {
  const c = mailer.cfg();
  res.json({
    bienvenida: await mensajePara(req.user).catch(() => null),
    usuario: req.user,
    smtp: mailer.smtpConfigured(),
    instagram: ig.configured(),
    ia: ia.configured(),
    imagenes: uploads.blobConfigured() || !process.env.VERCEL,
    almacenamiento: kv.kind,
    vercel: Boolean(process.env.VERCEL),
    cron: Boolean(process.env.CRON_SECRET),
    baseUrl: c.baseUrl,
    baseUrlPublica: !/localhost|127\.0\.0\.1/.test(c.baseUrl),
    remitente: c.fromEmail,
    remitenteNombre: c.fromName,
    delay: c.delay,
    limiteDiario: c.dailyLimit,
    organizacion: process.env.ORG_NAME || 'Alcaldía de Villa del Rosario',
    defaults: DEFAULTS,
  });
}));

// ---- Contactos ----
app.get('/api/contactos', wrap(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const all = await mailer.contacts.all();
  const list = all.filter(c => !q || c.email.includes(q) || (c.nombre || '').toLowerCase().includes(q) || (c.ciudad || '').toLowerCase().includes(q));
  const ciudades = {};
  for (const c of all) if (c.ciudad) ciudades[c.ciudad] = (ciudades[c.ciudad] || 0) + 1;
  res.json({
    total: all.length,
    activos: all.filter(c => !c.baja && c.autorizado).length,
    bajas: all.filter(c => c.baja).length,
    listas: [...new Set(all.flatMap(c => c.listas || []))],
    ciudades: Object.entries(ciudades).sort((a, b) => b[1] - a[1]).slice(0, 8),
    items: list.sort((a, b) => (b.creado || '').localeCompare(a.creado || '')).slice(0, 500),
  });
}));

app.post('/api/contactos/importar', upload.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube un archivo CSV.' });
  if (req.body.confirmo !== 'si') return res.status(400).json({ error: 'Debes confirmar que las personas autorizaron recibir correos.' });
  let parsed;
  try { parsed = parseContacts(req.file.buffer.toString('utf8')); } catch (e) { return res.status(400).json({ error: e.message }); }
  const lista = String(req.body.lista || '').trim() || req.file.originalname.replace(/\.[^.]+$/, '');
  const existing = new Map((await mailer.contacts.all()).map(c => [c.email, c]));
  let nuevos = 0, actualizados = 0, duplicadosArchivo = 0, conBaja = 0;
  const seen = new Set();
  const write = {};
  for (const c of parsed.contacts) {
    if (seen.has(c.email)) { duplicadosArchivo++; continue; }
    seen.add(c.email);
    const ex = existing.get(c.email);
    if (ex) {
      if (ex.baja) conBaja++; // la baja se respeta: no se reactiva por volver a importar
      write[c.email] = { ...ex, nombre: ex.nombre || c.nombre, ciudad: ex.ciudad || c.ciudad, listas: [...new Set([...(ex.listas || []), lista])] };
      actualizados++;
    } else {
      write[c.email] = { ...c, autorizado: true, fuente: req.file.originalname, listas: [lista], creado: new Date().toISOString() };
      nuevos++;
    }
  }
  await mailer.contacts.putMany(write);
  res.json({ nuevos, actualizados, duplicadosArchivo, invalidos: parsed.invalid, sinAutorizacion: parsed.sinAutorizacion, conBaja, lista });
}));

app.delete('/api/contactos/:email', wrap(async (req, res) => { await mailer.contacts.del(req.params.email); res.json({ ok: true }); }));

// ---- Campañas ----
const CAMPOS = ['nombre', 'asunto', 'preheader', 'titular', 'mensaje', 'botonTexto', 'botonUrl', 'cierre', 'remitenteNombre', 'segmento', 'imagenUrl', 'imagenAlt'];
const validUrl = u => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const campanaValida = c => validUrl(c.botonUrl) && (!c.imagenUrl || validUrl(c.imagenUrl));

app.get('/api/campanas', wrap(async (req, res) => {
  const list = await mailer.campaigns.all();
  const out = await Promise.all(list.map(async c => ({ ...c, stats: await mailer.campaignStats(c.id) })));
  res.json(out.sort((a, b) => (b.creado || '').localeCompare(a.creado || '')));
}));

app.post('/api/campanas', wrap(async (req, res) => {
  const c = { id: ig.id(8).replace(/^[-_]/, 'c'), estado: 'borrador', creado: new Date().toISOString() };
  for (const k of CAMPOS) c[k] = String(req.body[k] ?? DEFAULTS[k] ?? '');
  if (!campanaValida(c)) return res.status(400).json({ error: 'El enlace del botón o de la imagen no es válido.' });
  res.json(await mailer.campaigns.put(c.id, c));
}));

app.put('/api/campanas/:id', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  if (!['borrador', 'pausada'].includes(c.estado)) return res.status(400).json({ error: 'Solo se puede editar una campaña en borrador o pausada.' });
  const next = { ...c };
  for (const k of CAMPOS) if (req.body[k] !== undefined) next[k] = String(req.body[k]);
  if (!campanaValida(next)) return res.status(400).json({ error: 'El enlace del botón o de la imagen no es válido.' });
  res.json(await mailer.campaigns.put(c.id, next));
}));

app.delete('/api/campanas/:id', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (c && c.estado === 'enviando') return res.status(400).json({ error: 'Pausa la campaña antes de eliminarla.' });
  await mailer.campaigns.del(req.params.id);
  for (const k of ['sends:', 'stats:', 'act:', 'queue:']) await kv.del(k + req.params.id);
  res.json({ ok: true });
}));

app.post('/api/vista-previa', (req, res) => {
  const c = { ...DEFAULTS, ...req.body };
  const m = mailer.buildMessage(c, { email: 'ejemplo@correo.com', nombre: String(req.body.nombreEjemplo || 'María'), token: 'vista-previa' });
  res.json({ asunto: m.subject, html: m.html, remitente: c.remitenteNombre || mailer.cfg().fromName });
});

app.post('/api/campanas/:id/prueba', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  const email = String(req.body.email || '').trim();
  if (!c || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  try { res.json(await mailer.sendTest(c, email, req.body.nombre)); } catch (e) { res.status(500).json({ error: 'No se pudo enviar: ' + e.message }); }
}));

app.post('/api/campanas/:id/enviar', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  const activa = await kv.get('activa');
  if (activa && activa !== c.id) {
    const other = await mailer.campaigns.get(activa);
    if (other && other.estado === 'enviando') return res.status(400).json({ error: `Ya se está enviando "${other.nombre}". Espera a que termine o páusala.` });
  }
  const agregados = await mailer.enqueue(c);
  c.estado = 'enviando';
  c.iniciada = c.iniciada || new Date().toISOString();
  await mailer.campaigns.put(c.id, c);
  await kv.set('activa', c.id);
  res.json({ ok: true, agregados, stats: await mailer.campaignStats(c.id) });
}));

app.post('/api/campanas/:id/pausar', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (c && c.estado === 'enviando') { c.estado = 'pausada'; await mailer.campaigns.put(c.id, c); await kv.del('activa'); }
  res.json({ ok: true });
}));

app.get('/api/campanas/:id/envios', wrap(async (req, res) => {
  const list = await mailer.sendsOf(req.params.id).all();
  res.json(list.sort((a, b) => (b.enviadoEn || '').localeCompare(a.enviadoEn || '')).slice(0, 500));
}));
app.get('/api/campanas/:id/actividad', wrap(async (req, res) => res.json(await mailer.activity(req.params.id))));

// El panel llama a este endpoint mientras hay una campaña enviándose (motor de envío).
app.post('/api/cola/procesar', wrap(async (req, res) => {
  res.json(await mailer.procesarCola({ budgetMs: Number(process.env.QUEUE_BUDGET_MS || 50000) }));
}));

// ---- Instagram ----
// Seguidores de la cuenta conectada (para que el puntaje sea el mismo en todas las vistas).
async function seguidoresCuenta() {
  try { return (await ig.accountOverview()).account.followers_count || 0; } catch { return 0; }
}
const analizarPost = (p, f) => analysis.analyzePost(p, p.propia ? f : 0);

app.post('/api/analizar', wrap(async (req, res) => {
  try {
    const r = await ig.analyzeUrl(String(req.body.url || '').trim(), String(req.body.usuario || ''));
    const p = await ig.savePost(r, String(req.body.etiqueta || ''));
    res.json({ ...p, analisis: analizarPost(p, await seguidoresCuenta()), historial: await ig.history(p.id) });
  } catch (e) { res.status(400).json({ error: e.message, necesitaUsuario: Boolean(e.needUsername) }); }
}));

app.get('/api/publicaciones', wrap(async (req, res) => {
  const [list, f] = await Promise.all([ig.posts.all(), seguidoresCuenta()]);
  res.json(list.sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')).map(p => ({ ...p, analisis: analizarPost(p, f) })));
}));
app.post('/api/publicaciones/actualizar', wrap(async (req, res) => { await ig.refreshPosts(); res.json({ ok: true }); }));
app.delete('/api/publicaciones/:id', wrap(async (req, res) => { await ig.posts.del(req.params.id); await kv.del('hist:' + req.params.id); res.json({ ok: true }); }));

async function iaParaPost(p) {
  const acc = p.propia ? await ig.accountOverview().catch(() => null) : null;
  const a = analysis.analyzePost(p, acc ? acc.account.followers_count : 0);
  return ia.analizarMetricas({
    publicacion: { texto: (p.media && p.media.caption || '').slice(0, 600), fecha: p.media && p.media.timestamp, tipo: p.media && p.media.media_product_type, enlace: p.url, cuenta: p.cuenta ? '@' + p.cuenta.username : 'cuenta oficial conectada', datos: p.fuente === 'publica' ? 'públicos (sin alcance ni guardados)' : 'completos' },
    indicadores: a.kpis, puntajeImpacto: a.score, comentarios: (p.comments || []).slice(0, 40).map(c => c.text), sentimiento: a.sentimiento && { positivos: a.sentimiento.positivos, negativos: a.sentimiento.negativos, preguntas: a.sentimiento.preguntas },
    seguidoresCuenta: acc ? acc.account.followers_count : (p.cuenta && p.cuenta.followers_count) || null,
  });
}
app.post('/api/publicaciones/:id/ia', wrap(async (req, res) => {
  const p = await ig.posts.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  try {
    p.ia = { ...(await iaParaPost(p)), generado: new Date().toISOString() };
    await ig.posts.put(p.id, p);
    res.json(p.ia);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}));

app.get('/api/cuenta', wrap(async (req, res) => {
  try {
    const ov = await ig.accountOverview(req.query.force === '1');
    res.json({ ...ov, analisis: analysis.analyzeAccount(ov), snapshots: await ig.followerHistory() });
  } catch (e) { res.status(500).json({ error: 'Instagram respondió: ' + e.message }); }
}));

// ---- Informes ----
app.get('/api/informe', wrap(async (req, res) => {
  const out = { generado: new Date().toISOString(), organizacion: process.env.ORG_NAME || 'Alcaldía de Villa del Rosario' };
  let followers = 0;
  try {
    const ov = await ig.accountOverview();
    out.cuenta = { ...ov, analisis: analysis.analyzeAccount(ov), snapshots: await ig.followerHistory() };
    followers = ov.account.followers_count;
  } catch (e) { out.cuentaError = e.message; }
  if (req.query.post) {
    const p = await ig.posts.get(req.query.post);
    if (p) out.publicacion = { ...p, analisis: analysis.analyzePost(p, p.propia ? followers : 0), historial: await ig.history(p.id) };
  }
  if (req.query.campana) {
    const c = await mailer.campaigns.get(req.query.campana);
    if (c) {
      const st = await mailer.campaignStats(c.id);
      out.campana = { ...c, stats: st, analisis: analysis.analyzeEmail(st), actividad: await mailer.activity(c.id) };
    }
  }
  res.json(out);
}));

app.get('/api/resumen', wrap(async (req, res) => {
  const totals = { enviados: 0, abiertos: 0, clics: 0, bajas: 0, pendientes: 0 };
  const camps = await mailer.campaigns.all();
  let enviando = null;
  for (const c of camps) {
    const s = await mailer.campaignStats(c.id);
    for (const k of Object.keys(totals)) totals[k] += s[k] || 0;
    if (c.estado === 'enviando') enviando = { id: c.id, nombre: c.nombre, nota: c.nota, stats: s };
  }
  const contacts = await mailer.contacts.all();
  const posts = await ig.posts.all();
  const f = await seguidoresCuenta();
  res.json({
    correos: totals,
    contactos: { total: contacts.length, activos: contacts.filter(c => !c.baja && c.autorizado).length },
    enviando,
    publicaciones: posts.sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')).map(p => ({ id: p.id, etiqueta: p.etiqueta, url: p.url, demo: p.demo, fuente: p.fuente, cuenta: p.cuenta, insights: p.insights, media: p.media && { caption: p.media.caption, timestamp: p.media.timestamp }, score: analizarPost(p, f).score })),
  });
}));

// ---- Estudio de contenidos (IA) ----
app.post('/api/imagenes', upload.single('imagen'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube una imagen.' });
  try { res.json({ url: await uploads.guardarImagen(req.file.buffer, req.file.mimetype, mailer.cfg().baseUrl) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

app.post('/api/ia/contenido', wrap(async (req, res) => {
  const imagenes = (Array.isArray(req.body.imagenes) ? req.body.imagenes : [])
    .filter(i => i && /^image\/(jpeg|png|webp|gif)$/.test(i.media_type) && typeof i.data === 'string').slice(0, 4);
  const brief = Object.fromEntries(['tema', 'objetivo', 'publico', 'fecha', 'lugar', 'enlace', 'tono', 'palabras', 'notas'].map(k => [k, String(req.body[k] || '').slice(0, 2000)]));
  if (!imagenes.length && !brief.tema) return res.status(400).json({ error: 'Sube una imagen o escribe el tema.' });
  try {
    const resultado = await ia.generarContenido({ imagenes, brief });
    const item = { id: ig.id(8), creado: new Date().toISOString(), autor: req.user, brief, imagenUrl: String(req.body.imagenUrl || ''), miniatura: String(req.body.miniatura || '').slice(0, 60000), resultado };
    await contenidos.put(item.id, item);
    res.json(item);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}));
app.get('/api/contenidos', wrap(async (req, res) => {
  res.json((await contenidos.all()).sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, 60));
}));
app.delete('/api/contenidos/:id', wrap(async (req, res) => { await contenidos.del(req.params.id); res.json({ ok: true }); }));

// Errores
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es demasiado grande (máximo 4 MB).' : 'Ocurrió un error inesperado. Intenta de nuevo.' });
});

module.exports = app;
