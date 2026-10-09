// Aplicación Express. Se exporta para Vercel (api/index.js) y para el servidor local (local.js).
require('dotenv').config({ quiet: true });
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { kv, col } = require('./store');
const { readRows, parseContacts, perfil, parseManual, EMAIL_RE } = require('./csv');
const usuarios = require('./usuarios');
const remitentes = require('./remitentes');
const oficina = require('./oficina');
const agendaMod = require('./agenda');
const directorio = require('./directorio');
const QRCode = require('qrcode');
const equipoMod = require('./equipo');
const { revisar: revisarAntispam } = require('./antispam');
const mailer = require('./mailer');
const ig = require('./instagram');
const ia = require('./ia');
const analysis = require('./analysis');
const uploads = require('./uploads');
const { mensajePara } = require('./bienvenida');
const { DEFAULTS, TIPOS, PLANTILLAS, esc } = require('./emailTemplate');

const contenidos = col('contenidos');
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------- Usuarios y sesión ----------------
const SECRET = () => process.env.SESSION_SECRET || crypto.createHash('sha256').update('bio|' + [...usuarios.envUsers()].join('|')).digest('hex');
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
async function auth(req, res, next) {
  const u = sessionUser(req);
  const perfil = u ? await usuarios.perfilDe(u).catch(() => null) : null;
  if (perfil) { req.user = perfil.usuario; req.perfil = perfil; return next(); }
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Sesión vencida' });
  res.redirect('/');
}

// Permisos por rol: diseño solo trabaja con piezas y ve el calendario; consulta solo lee.
const PERMISOS_DISENO = [/^\/api\/(estado|sesion|hoy)$/, /^\/api\/piezas/, /^\/api\/archivos/, /^\/api\/calendario$/, /^\/api\/ia\/revisar-pieza$/];
function permisos(req, res, next) {
  const rol = req.perfil.rol;
  const ruta = req.originalUrl.split('?')[0];
  if (rol === 'admin') return next();
  if (rol === 'diseno') {
    if (!PERMISOS_DISENO.some(r => r.test(ruta))) return res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección.' });
    if (/^\/api\/calendario/.test(ruta) && req.method !== 'GET') return res.status(403).json({ error: 'Solo puedes consultar el calendario.' });
    if (/\/decision$/.test(ruta)) return res.status(403).json({ error: 'La aprobación la hace la jefatura de prensa.' });
    return next();
  }
  if (req.method === 'GET' || /^\/api\/(cola\/procesar)$/.test(ruta)) return next();
  return res.status(403).json({ error: 'Tu usuario es de solo consulta.' });
}

app.post('/login', wrap(async (req, res) => {
  const key = 'login:' + (req.ip || 'x');
  if (Number(await kv.get(key) || 0) >= 8) return res.redirect('/?e=bloqueo#ingresar');
  const perfil = await usuarios.autenticar(req.body.usuario, req.body.clave || '');
  if (!perfil) {
    await kv.incr(key, 900);
    return res.redirect('/?e=1#ingresar');
  }
  await kv.del(key);
  const exp = Date.now() + 12 * 3600 * 1000;
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sesion=${encodeURIComponent(sign(`${perfil.usuario}|${exp}`))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
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
  const url = await mailer.registrarClic(req.params.token, req.query.b === '2' ? 2 : 1).catch(() => null);
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

// ---------------- Inscripción pública a la red (con autorización de datos) ----------------
const urlRegistro = () => mailer.cfg().baseUrl + '/registro';
app.get('/registro', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'public', 'registro.html')));
app.get('/api/publico/registro', (req, res) => res.json({ municipios: Object.keys(directorio.MUNICIPIOS), tipos: directorio.TIPOS, autorizacion: directorio.TEXTO_AUTORIZACION, organizacion: process.env.ORG_NAME || 'Alcaldía de Villa del Rosario' }));
app.post('/api/publico/registro', wrap(async (req, res) => {
  const key = 'registro:' + (req.ip || 'x');
  if (Number(await kv.get(key) || 0) >= 15) return res.status(429).json({ error: 'Recibimos muchas inscripciones desde esta conexión. Intenta más tarde.' });
  await kv.incr(key, 3600);
  let reg;
  try { reg = await directorio.inscribir(req.body || {}, req.ip); } catch (e) { return res.status(400).json({ error: e.message }); }
  // Quien autoriza y deja correo pasa a la base de correos, en la lista de la red.
  if (reg.correo && reg.recibirInfo) {
    const ex = await mailer.contacts.get(reg.correo);
    if (!ex || !ex.baja) {
      await mailer.contacts.put(reg.correo, {
        ...(ex || {}), email: reg.correo, nombre: (ex && ex.nombre) || reg.contacto || reg.nombre, ciudad: reg.municipio, telefono: reg.telefono || (reg.whatsapp ? '+' + reg.whatsapp : ''),
        organizacion: reg.contacto ? reg.nombre : (ex && ex.organizacion) || '', autorizado: true, fuente: 'Formulario de inscripción',
        listas: [...new Set([...((ex && ex.listas) || []), 'Red Villa del Rosario'])], creado: (ex && ex.creado) || new Date().toISOString(),
      });
    }
  }
  res.json({ ok: true, nombre: reg.contacto || reg.nombre });
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
app.use('/api', auth, permisos);

app.get('/api/estado', wrap(async (req, res) => {
  const c = mailer.cfg();
  res.json({
    bienvenida: await mensajePara(req.user).catch(() => null),
    usuario: req.user,
    nombre: req.perfil.nombre,
    rol: req.perfil.rol,
    roles: usuarios.ROLES,
    remitentes: req.perfil.rol === 'admin' ? await remitentes.listar() : [],
    tipos: Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, v.nombre])),
    plantillas: PLANTILLAS,
    canales: oficina.CANALES,
    estadosPieza: oficina.ESTADOS_PIEZA,
    estadosCal: oficina.ESTADOS_CAL,
    checklist: oficina.CHECKLIST,
    agendaTipos: agendaMod.TIPOS,
    cargos: equipoMod.CARGOS,
    agendaEstados: agendaMod.ESTADOS,
    archivos: uploads.proveedor(),
    smtp: (await remitentes.listar()).length > 0,
    instagram: ig.configured(),
    ia: ia.configured(),
    imagenes: Boolean(uploads.proveedor()),
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

const uploadBase = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

app.post('/api/contactos/analizar', uploadBase.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube un archivo de Excel (.xlsx) o CSV.' });
  try {
    const rows = await readRows(req.file.buffer, req.file.originalname);
    const existentes = new Map((await mailer.contacts.all()).map(c => [c.email, c]));
    res.json({ archivo: req.file.originalname, ...(await perfil(rows, existentes)) });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

app.post('/api/contactos/importar', uploadBase.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube un archivo de Excel (.xlsx) o CSV.' });
  if (req.body.confirmo !== 'si') return res.status(400).json({ error: 'Debes confirmar que las personas autorizaron recibir correos.' });
  let parsed;
  try { parsed = await parseContacts(await readRows(req.file.buffer, req.file.originalname)); } catch (e) { return res.status(400).json({ error: e.message }); }
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
      write[c.email] = { ...ex, nombre: ex.nombre || c.nombre, ciudad: ex.ciudad || c.ciudad, organizacion: ex.organizacion || c.organizacion, cargo: ex.cargo || c.cargo, listas: [...new Set([...(ex.listas || []), lista])] };
      actualizados++;
    } else {
      write[c.email] = { ...c, autorizado: true, fuente: req.file.originalname, listas: [lista], creado: new Date().toISOString() };
      nuevos++;
    }
  }
  await mailer.contacts.putMany(write);
  res.json({ nuevos, actualizados, duplicadosArchivo, invalidos: parsed.invalid, descartados: parsed.descartados, sinAutorizacion: parsed.sinAutorizacion, conBaja, lista });
}));

// Descargas en CSV (abre bien en Excel): la base limpia de un archivo, o toda la base guardada.
const csvCelda = v => { const t = String(v ?? ''); return /[";\n,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function enviarCsv(res, nombre, filas) {
  const cols = ['email', 'nombre', 'ciudad', 'telefono', 'organizacion', 'cargo', 'listas', 'estado'];
  const cuerpo = [['Correo', 'Nombre', 'Municipio', 'Teléfono', 'Organización', 'Cargo', 'Listas', 'Estado'].join(';'), ...filas.map(f => cols.map(k => csvCelda(Array.isArray(f[k]) ? f[k].join(', ') : f[k])).join(';'))].join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` });
  res.send('\uFEFF' + cuerpo);
}
app.post('/api/contactos/limpia', uploadBase.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube el archivo.' });
  try {
    const r = await parseContacts(await readRows(req.file.buffer, req.file.originalname));
    const vistos = new Set();
    const filas = r.contacts.filter(c => !vistos.has(c.email) && vistos.add(c.email)).map(c => ({ ...c, estado: c.institucional ? 'Correo genérico' : 'Listo' }));
    enviarCsv(res, req.file.originalname.replace(/\.[^.]+$/, '') + '-limpia.csv', filas);
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.get('/api/contactos/exportar', wrap(async (req, res) => {
  const filas = (await mailer.contacts.all()).sort((a, b) => (a.ciudad || 'zz').localeCompare(b.ciudad || 'zz', 'es') || (a.nombre || '').localeCompare(b.nombre || '', 'es'))
    .map(c => ({ ...c, estado: c.baja ? 'Se dio de baja' : 'Activo' }));
  enviarCsv(res, `contactos-${new Date().toISOString().slice(0, 10)}.csv`, filas);
}));

app.delete('/api/contactos/:email', wrap(async (req, res) => { await mailer.contacts.del(req.params.email); res.json({ ok: true }); }));

// ---------------- Directorio (Google Maps, inscripciones, Instagram) ----------------
app.get('/api/directorio', wrap(async (req, res) => {
  const r = await directorio.listar(req.query);
  res.json({
    ...r, items: r.items.slice(0, 600),
    municipios: Object.keys(directorio.MUNICIPIOS), tipos: directorio.TIPOS, estados: directorio.ESTADOS, fuentes: directorio.FUENTES, categorias: directorio.CATEGORIAS,
    google: directorio.googleListo(), consultasMes: await directorio.consultasMes(), instagram: ig.configured(),
    registro: urlRegistro(), mensaje: await directorio.mensaje(),
  });
}));
app.post('/api/directorio', wrap(async (req, res) => {
  try { res.json(await directorio.guardar(req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/directorio/restaurar', wrap(async (req, res) => res.json(await directorio.restaurar(req.body))));
app.post('/api/directorio/mensaje', wrap(async (req, res) => res.json({ mensaje: await directorio.guardarMensaje(req.body.mensaje) })));
app.post('/api/directorio/google', wrap(async (req, res) => {
  try { res.json(await directorio.buscarGoogle(req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/directorio/instagram', wrap(async (req, res) => {
  if (!ig.configured()) return res.status(400).json({ error: 'Conecta la cuenta de Instagram (IG_ACCESS_TOKEN e IG_USER_ID) para consultar perfiles profesionales.' });
  const usuarios_ = [...new Set(String(req.body.usuarios || '').split(/[\s,;]+/).map(directorio.usuarioIg).filter(Boolean))].slice(0, 25);
  if (!usuarios_.length) return res.status(400).json({ error: 'Escribe uno o varios usuarios de Instagram (ej.: @negocio).' });
  const out = [];
  for (const u of usuarios_) {
    try {
      const p = await ig.perfilProfesional(u);
      const enlaces = [p.website, ...(String(p.biography || '').match(/https?:\/\/\S+|wa\.me\/\d+/gi) || [])].filter(Boolean);
      const wa = enlaces.map(e => (e.match(/wa\.me\/(\d{10,13})|api\.whatsapp\.com\/send\?phone=(\d{10,13})/i) || []).slice(1).find(Boolean)).find(Boolean) || '';
      out.push({ ok: true, usuario: p.username, nombre: p.name || p.username, biografia: p.biography || '', web: p.website || '', seguidores: p.followers_count || 0, publicaciones: p.media_count || 0, foto: p.profile_picture_url || '', whatsapp: wa, municipio: directorio.municipioDe(`${p.biography || ''} ${p.name || ''}`) });
    } catch (e) { out.push({ ok: false, usuario: u, error: /not found|Invalid user|cannot be found|does not exist/i.test(e.message) ? 'No es una cuenta profesional pública o no existe.' : e.message }); }
  }
  res.json(out);
}));
app.post('/api/directorio/instagram/guardar', wrap(async (req, res) => {
  const p = req.body || {};
  const todos = await directorio.dir.all();
  const prev = todos.find(x => x.instagram && x.instagram === directorio.usuarioIg(p.usuario));
  const x = directorio.normalizar({ tipo: p.tipo || 'creador', nombre: p.nombre, categoria: p.categoria, municipio: p.municipio, instagram: p.usuario, web: p.web, whatsapp: p.whatsapp, notas: p.biografia }, prev || {});
  Object.assign(x, { id: prev ? prev.id : 'i' + require('./store').id(8), fuente: prev ? prev.fuente : 'instagram', consentimiento: prev ? prev.consentimiento : false, seguidores: Number(p.seguidores) || 0, creado: prev ? prev.creado : new Date().toISOString(), actualizado: new Date().toISOString() });
  await directorio.dir.put(x.id, x);
  res.json(x);
}));
app.get('/api/directorio/exportar', wrap(async (req, res) => {
  const r = await directorio.listar(req.query);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="directorio-${(req.query.municipio || 'area-metropolitana').toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send(directorio.csv(r.items));
}));
app.get('/api/directorio/qr.png', wrap(async (req, res) => {
  res.set({ 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="qr-inscripcion.png"' });
  res.send(await QRCode.toBuffer(urlRegistro(), { width: 900, margin: 2, color: { dark: '#2a2672', light: '#ffffff' } }));
}));
app.post('/api/directorio/:id/estado', wrap(async (req, res) => {
  try { res.json(await directorio.marcar(req.params.id, req.body.estado)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/directorio/:id', wrap(async (req, res) => {
  try { res.json(await directorio.eliminar(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---- Campañas ----
const CAMPOS = ['nombre', 'asunto', 'preheader', 'titular', 'mensaje', 'botonTexto', 'botonUrl', 'boton2Texto', 'boton2Url', 'notaBoton', 'cierre', 'motivo', 'remitenteNombre', 'remitenteId', 'tipo', 'destino', 'segmento', 'imagenUrl', 'imagenAlt', 'logoUrl'];
// Aplica los campos recibidos a la campaña, incluida la lista de correos escritos a mano.
function aplicarCampos(c, body) {
  for (const k of CAMPOS) if (body[k] !== undefined) c[k] = String(body[k]).slice(0, 20000);
  if (body.manualTexto !== undefined) {
    const m = parseManual(body.manualTexto);
    c.manual = m.contactos.slice(0, 5000);
    c.manualInvalidos = m.invalidos.slice(0, 50);
  }
  if (!TIPOS[c.tipo]) c.tipo = 'invitacion';
  if (c.destino !== 'manual') c.destino = 'base';
  return c;
}
const validUrl = u => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const urlOpcional = u => !u || validUrl(u) || (u === 'ninguno');
const campanaValida = c => (!c.botonTexto || validUrl(c.botonUrl)) && urlOpcional(c.boton2Url) && urlOpcional(c.imagenUrl) && urlOpcional(c.logoUrl);

app.get('/api/campanas', wrap(async (req, res) => {
  const list = await mailer.campaigns.all();
  const out = await Promise.all(list.map(async c => ({ ...c, stats: await mailer.campaignStats(c.id) })));
  res.json(out.sort((a, b) => (b.creado || '').localeCompare(a.creado || '')));
}));

app.post('/api/campanas', wrap(async (req, res) => {
  const c = { id: ig.id(8).replace(/^[-_]/, 'c'), estado: 'borrador', creado: new Date().toISOString(), creadoPor: req.user };
  for (const k of CAMPOS) c[k] = String(DEFAULTS[k] ?? '');
  aplicarCampos(c, req.body);
  if (!campanaValida(c)) return res.status(400).json({ error: 'Revisa los enlaces: el del botón es obligatorio y todos deben empezar por https://' });
  res.json(await mailer.campaigns.put(c.id, c));
}));

app.put('/api/campanas/:id', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  if (!['borrador', 'pausada'].includes(c.estado)) return res.status(400).json({ error: 'Solo se puede editar una campaña en borrador o pausada.' });
  const next = aplicarCampos({ ...c }, req.body);
  if (!campanaValida(next)) return res.status(400).json({ error: 'Revisa los enlaces: el del botón es obligatorio y todos deben empezar por https://' });
  res.json(await mailer.campaigns.put(c.id, next));
}));

app.delete('/api/campanas/:id', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (c && c.estado === 'enviando') return res.status(400).json({ error: 'Pausa la campaña antes de eliminarla.' });
  await mailer.campaigns.del(req.params.id);
  for (const k of ['sends:', 'stats:', 'act:', 'queue:']) await kv.del(k + req.params.id);
  res.json({ ok: true });
}));

app.post('/api/vista-previa', wrap(async (req, res) => {
  const c = { ...DEFAULTS, ...req.body };
  const sender = await remitentes.obtener(c.remitenteId).catch(() => null);
  const m = mailer.buildMessage(c, { email: 'ejemplo@correo.com', nombre: String(req.body.nombreEjemplo || 'María'), token: 'vista-previa' }, sender);
  const manual = c.destino === 'manual' ? parseManual(c.manualTexto) : null;
  res.json({
    asunto: m.subject, html: m.html, remitente: m.from.name, remitenteEmail: sender ? sender.email : null,
    revision: revisarAntispam(c, sender),
    manual: manual && { validos: manual.contactos.length, invalidos: manual.invalidos },
  });
}));

app.post('/api/campanas/:id/prueba', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  const email = String(req.body.email || '').trim();
  if (!c || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  try { res.json(await mailer.sendTest(c, email, req.body.nombre)); } catch (e) { res.status(500).json({ error: 'No se pudo enviar: ' + e.message }); }
}));

app.post('/api/campanas/:id/enviar', wrap(async (req, res) => {
  const c = await mailer.campaigns.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  const pendientes = [c.asunto, c.preheader, c.titular, c.mensaje, c.cierre, c.botonTexto].join(' ').match(/\[[^\]]{2,60}\]/g);
  if (pendientes) return res.status(400).json({ error: `Completa los textos de la plantilla antes de enviar: ${pendientes.slice(0, 3).join(', ')}` });
  if (c.destino === 'manual' && !(c.manual || []).length) return res.status(400).json({ error: 'Escribe al menos un correo válido en destinatarios.' });
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

// ---- Usuarios ----
app.get('/api/usuarios', wrap(async (req, res) => res.json(await usuarios.listar())));
app.post('/api/usuarios', wrap(async (req, res) => {
  try { res.json(await usuarios.guardar(req.body, req.user)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/usuarios/:u', wrap(async (req, res) => {
  try { await usuarios.eliminar(req.params.u); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---- Remitentes ----
app.get('/api/remitentes', wrap(async (req, res) => res.json(await remitentes.listar())));
app.post('/api/remitentes', wrap(async (req, res) => {
  try { res.json(await remitentes.guardar(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/remitentes/:id/probar', wrap(async (req, res) => {
  try { await remitentes.probar(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: 'No se pudo conectar: ' + e.message }); }
}));
app.delete('/api/remitentes/:id', wrap(async (req, res) => { await remitentes.eliminar(req.params.id); res.json({ ok: true }); }));

// ---- Redacción con IA (opcional) ----
app.post('/api/ia/redactar-correo', wrap(async (req, res) => {
  try { res.json(await ia.redactarCorreo({ tipo: TIPOS[req.body.tipo] ? TIPOS[req.body.tipo].nombre : 'Invitación', idea: String(req.body.idea || '').slice(0, 3000), publico: String(req.body.publico || ''), enlace: String(req.body.enlace || '') })); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}));

// ---- Archivos (piezas gráficas, imágenes y videos) ----
const uploadLocal = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });
const TIPOS_ARCHIVO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'];
// En Vercel el navegador sube directo a Vercel Blob (sin límite de 4,5 MB); aquí se autoriza.
app.post('/api/archivos/token', wrap(async (req, res) => {
  if (!uploads.blobConfigured()) return res.status(400).json({ error: 'Conecta Vercel Blob para subir archivos.' });
  const { handleUpload } = require('@vercel/blob/client');
  const out = await handleUpload({
    body: req.body,
    request: req,
    onBeforeGenerateToken: async () => ({ allowedContentTypes: TIPOS_ARCHIVO, maximumSizeInBytes: 300 * 1024 * 1024, addRandomSuffix: true, tokenPayload: req.user }),
  });
  res.json(out);
}));
// Con Cloudinary el navegador sube directo con una firma temporal generada aquí.
app.post('/api/archivos/firma', wrap(async (req, res) => {
  try { res.json(uploads.firmaSubida(['imagenes', 'agenda'].includes(req.body.carpeta) ? req.body.carpeta : 'piezas')); } catch (e) { res.status(400).json({ error: e.message }); }
}));
// En local (sin Cloudinary ni Blob) se recibe el archivo directamente.
app.post('/api/archivos', uploadLocal.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Elige un archivo.' });
  if (!TIPOS_ARCHIVO.includes(req.file.mimetype)) return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, GIF, MP4, MOV, WEBM o PDF.' });
  if (!uploads.proveedor()) return res.status(400).json({ error: 'Conecta Cloudinary (CLOUDINARY_URL) para subir archivos.' });
  try { res.json({ url: await uploads.guardarArchivo(req.file.buffer, req.file.mimetype, req.file.originalname, mailer.cfg().baseUrl), tipo: req.file.mimetype, nombre: req.file.originalname }); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---- Piezas para revisión ----
app.get('/api/piezas', wrap(async (req, res) => res.json(await oficina.listarPiezas())));
app.post('/api/piezas', wrap(async (req, res) => {
  const p = await oficina.crearPieza(req.body, req.perfil);
  if (req.body.archivo) await oficina.agregarVersion(p.id, req.body.archivo, req.perfil);
  res.json(await oficina.obtenerPieza(p.id));
}));
app.put('/api/piezas/:id', wrap(async (req, res) => {
  try { res.json(await oficina.editarPieza(req.params.id, req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/piezas/:id/version', wrap(async (req, res) => {
  try {
    const p = await oficina.agregarVersion(req.params.id, req.body, req.perfil);
    if (req.body.nota) await oficina.comentar(p.id, 'Nueva versión: ' + req.body.nota, req.perfil);
    res.json(await oficina.obtenerPieza(p.id));
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/piezas/:id/comentario', wrap(async (req, res) => {
  try { res.json(await oficina.comentar(req.params.id, req.body.texto, req.perfil)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/piezas/:id/decision', wrap(async (req, res) => {
  try { res.json(await oficina.decidir(req.params.id, req.body, req.perfil)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/piezas/:id', wrap(async (req, res) => {
  if (req.perfil.rol !== 'admin') return res.status(403).json({ error: 'Solo la jefatura puede eliminar piezas.' });
  await oficina.eliminarPieza(req.params.id); res.json({ ok: true });
}));
app.post('/api/ia/revisar-pieza', wrap(async (req, res) => {
  const p = await oficina.obtenerPieza(String(req.body.pieza || ''));
  if (!p) return res.status(404).json({ error: 'La pieza no existe.' });
  const imagenes = (Array.isArray(req.body.imagenes) ? req.body.imagenes : []).filter(i => i && /^image\/(jpeg|png|webp)$/.test(i.media_type) && typeof i.data === 'string').slice(0, 6);
  if (!imagenes.length) return res.status(400).json({ error: 'No se pudo leer la imagen para revisarla.' });
  try {
    const v = p.versiones[p.versiones.length - 1];
    const r = await ia.revisarPieza({ imagenes, titulo: p.titulo, descripcion: p.descripcion, canal: p.canal, fecha: p.fechaPublicacion, esVideo: v && v.tipo === 'video' });
    res.json(await oficina.guardarRevisionIA(p.id, r, p.versiones.length));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}));

// ---- Calendario editorial ----
app.get('/api/calendario', wrap(async (req, res) => res.json(await oficina.listarEventos(req.query.desde, req.query.hasta))));
app.post('/api/calendario', wrap(async (req, res) => {
  try { res.json(await oficina.guardarEvento(req.body, req.perfil)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/calendario/:id', wrap(async (req, res) => { await oficina.eliminarEvento(req.params.id); res.json({ ok: true }); }));

// ---- Equipo de trabajo y firma ----
app.get('/api/equipo', wrap(async (req, res) => res.json(await equipoMod.listar())));
app.post('/api/equipo', wrap(async (req, res) => {
  try { res.json(await equipoMod.guardar(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/equipo/:id', wrap(async (req, res) => { await equipoMod.eliminar(req.params.id); res.json({ ok: true }); }));
app.get('/api/perfil', wrap(async (req, res) => res.json({ usuario: req.user, nombre: req.perfil.nombre, ...(await equipoMod.perfil(req.user)) })));
app.post('/api/perfil', wrap(async (req, res) => {
  try { res.json(await equipoMod.guardarPerfil(req.user, req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---- Agenda de gestión ----
app.get('/api/agenda', wrap(async (req, res) => res.json(await agendaMod.listar(req.query.desde, req.query.hasta))));
app.post('/api/agenda', wrap(async (req, res) => {
  try { res.json(await agendaMod.guardar(req.body, req.perfil)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/agenda/:id/fotos', wrap(async (req, res) => {
  try { res.json(await agendaMod.agregarFotos(req.params.id, Array.isArray(req.body.fotos) ? req.body.fotos : [])); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/agenda/:id/estado', wrap(async (req, res) => {
  try { res.json(await agendaMod.cambiarEstado(req.params.id, req.body.estado, req.body.resultados)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/agenda/:id', wrap(async (req, res) => {
  const previa = await agendaMod.obtener(req.params.id);
  await agendaMod.eliminar(req.params.id);
  res.json({ ok: true, previa });
}));
app.post('/api/agenda/restaurar', wrap(async (req, res) => {
  try { res.json(await agendaMod.restaurar(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/agenda/:id/fotos/quitar', wrap(async (req, res) => {
  try { res.json(await agendaMod.quitarFoto(req.params.id, String(req.body.url || ''))); } catch (e) { res.status(400).json({ error: e.message }); }
}));

// Datos del informe de gestión: agenda + publicaciones del calendario + piezas aprobadas + correos del periodo.
async function datosInformeAgenda(desde, hasta) {
  const items = await agendaMod.listar(desde, hasta);
  const cifras = agendaMod.resumen(items);
  const editorial = await oficina.listarEventos(desde, hasta);
  const piezas = (await oficina.listarPiezas()).filter(p => ['aprobada', 'publicada'].includes(p.estado) && (p.revisadoEn || '').slice(0, 10) >= desde && (p.revisadoEn || '').slice(0, 10) <= hasta);
  const camps = [];
  for (const c of await mailer.campaigns.all()) {
    const d = (c.iniciada || '').slice(0, 10);
    if (d && d >= desde && d <= hasta) { const st = await mailer.campaignStats(c.id); camps.push({ nombre: c.nombre, enviados: st.enviados, abiertos: st.abiertos, clics: st.clics }); }
  }
  // Participación del equipo en el periodo.
  const miembros = await equipoMod.listar();
  const part = {};
  for (const a of items) if (a.estado !== 'cancelada') for (const m of a.equipo || []) part[m] = (part[m] || 0) + 1;
  const equipo = miembros.map(m => ({ ...m, actividades: part[m.id] || 0 }));
  return { items, cifras, editorial, piezas: piezas.map(p => ({ titulo: p.titulo, canal: p.canal, estado: p.estado })), correos: camps, equipo };
}
app.get('/api/agenda/informe', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) return res.status(400).json({ error: 'Elige las fechas del informe.' });
  const d = await datosInformeAgenda(desde, hasta);
  const guardado = await kv.get(`informe-agenda:${desde}:${hasta}`);
  const seleccion = await kv.get(`informe-agenda-equipo:${desde}:${hasta}`);
  const firma = await equipoMod.perfil(req.user);
  res.json({
    desde, hasta, organizacion: process.env.ORG_NAME || 'Alcaldía de Villa del Rosario', generadoPor: req.perfil.nombre,
    tipos: agendaMod.TIPOS, estados: agendaMod.ESTADOS, ia: ia.configured(),
    ...d, texto: guardado ? JSON.parse(guardado) : agendaMod.narrativa(d.items, d.cifras, desde, hasta), textoIA: Boolean(guardado),
    equipoSeleccion: seleccion ? JSON.parse(seleccion) : null, firma,
  });
}));
app.post('/api/agenda/informe/ia', wrap(async (req, res) => {
  const { desde, hasta, enfoque } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) return res.status(400).json({ error: 'Fechas no válidas.' });
  const d = await datosInformeAgenda(desde, hasta);
  if (!d.items.length) return res.status(400).json({ error: 'No hay actividades en ese periodo.' });
  try {
    const texto = await ia.informeAgenda({
      desde, hasta, enfoque: String(enfoque || '').slice(0, 500),
      cifras: { ...d.cifras, publicacionesCalendario: d.editorial.length, piezasAprobadas: d.piezas.length, correos: d.correos },
      equipo: d.equipo.filter(m => m.actividades).map(m => ({ nombre: m.nombre, cargo: m.cargo, actividades: m.actividades })),
      actividades: d.items.map(a => ({ fecha: a.fecha, titulo: a.titulo, tipo: agendaMod.TIPOS[a.tipo], estado: a.estado, lugar: a.lugar, participantes: a.participantes, equipo: (a.equipo || []).map(x => (d.equipo.find(m => m.id === x) || {}).nombre).filter(Boolean), descripcion: a.descripcion.slice(0, 400), resultados: a.resultados.slice(0, 400), asistentes: a.asistentes, medios: a.medios, publicaciones: a.publicaciones, fotos: (a.fotos || []).length })).slice(0, 150),
    });
    await kv.set(`informe-agenda:${desde}:${hasta}`, JSON.stringify(texto), { ex: 90 * 86400 });
    res.json(texto);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}));
// Colaboradores elegidos para aparecer en el informe de ese periodo.
app.post('/api/agenda/informe/equipo', wrap(async (req, res) => {
  const { desde, hasta, ids } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '') || !Array.isArray(ids)) return res.status(400).json({ error: 'Datos no válidos.' });
  await kv.set(`informe-agenda-equipo:${desde}:${hasta}`, JSON.stringify(ids.map(String).slice(0, 60)), { ex: 365 * 86400 });
  res.json({ ok: true });
}));
// Texto editado a mano por la jefa de prensa (se guarda para ese periodo).
app.post('/api/agenda/informe/texto', wrap(async (req, res) => {
  const { desde, hasta, texto } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '') || !texto) return res.status(400).json({ error: 'Datos no válidos.' });
  const t = { titulo: String(texto.titulo || '').slice(0, 200), resumen_ejecutivo: String(texto.resumen_ejecutivo || '').slice(0, 5000), logros: (texto.logros || []).map(x => String(x).slice(0, 600)).slice(0, 12), recomendaciones: (texto.recomendaciones || []).map(x => String(x).slice(0, 600)).slice(0, 10), cierre: String(texto.cierre || '').slice(0, 800) };
  await kv.set(`informe-agenda:${desde}:${hasta}`, JSON.stringify(t), { ex: 90 * 86400 });
  res.json({ ok: true });
}));

// ---- Inicio: lo que necesita atención hoy ----
app.get('/api/hoy', wrap(async (req, res) => {
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const en7 = new Date(Date.now() - 5 * 3600e3 + 7 * 86400e3).toISOString().slice(0, 10);
  const [piezas, eventos] = await Promise.all([oficina.listarPiezas(), oficina.listarEventos(hoy, en7)]);
  const out = {
    hoy,
    piezas: {
      revision: piezas.filter(p => p.estado === 'revision').length,
      cambios: piezas.filter(p => p.estado === 'cambios').length,
      aprobadas: piezas.filter(p => p.estado === 'aprobada').length,
      recientes: piezas.slice(0, 6).map(p => ({ id: p.id, titulo: p.titulo, estado: p.estado, autorNombre: p.autorNombre, actualizado: p.actualizado, canal: p.canal, miniatura: p.versiones.length ? p.versiones[p.versiones.length - 1] : null })),
    },
    agenda: eventos.slice(0, 12),
  };
  if (req.perfil.rol !== 'diseno') {
    const camps = await mailer.campaigns.all();
    const env = camps.find(c => c.estado === 'enviando');
    out.correo = env ? { nombre: env.nombre, stats: await mailer.campaignStats(env.id) } : null;
    out.contactos = await mailer.contacts.count();
    out.publicaciones = (await ig.posts.all()).length;
    out.miAgenda = (await agendaMod.listar(hoy, en7)).filter(x => x.estado !== 'cancelada').slice(0, 10);
  }
  res.json(out);
}));

// Errores
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es demasiado grande (máximo 4 MB).' : 'Ocurrió un error inesperado. Intenta de nuevo.' });
});

module.exports = app;
