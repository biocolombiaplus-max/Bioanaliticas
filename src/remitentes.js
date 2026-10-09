// Remitentes: varias cuentas de correo desde las que se puede enviar.
// La clave SMTP se guarda cifrada (AES-256-GCM) con SESSION_SECRET.
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { col, id } = require('./store');
const { EMAIL_RE } = require('./csv');

const remitentes = col('remitentes');

const key = () => crypto.createHash('sha256').update('remitentes|' + (process.env.SESSION_SECRET || process.env.ADMIN_USERS || process.env.ADMIN_PASSWORD || 'local')).digest();
function cifrar(txt) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
function descifrar(s) {
  const [iv, tag, enc] = String(s).split('.').map(b => Buffer.from(b, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// Remitente definido en las variables de entorno (SMTP_*), si existe.
function remitenteEnv() {
  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL)) return null;
  return {
    id: 'principal', nombre: process.env.FROM_NAME || 'Remitente principal', email: process.env.FROM_EMAIL, replyTo: process.env.REPLY_TO || '',
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), user: process.env.SMTP_USER,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT || 587) === 465,
    principal: true, pass: process.env.SMTP_PASS,
  };
}

const publico = ({ passEnc, pass, ...r }) => r;

async function listar() {
  const env = remitenteEnv();
  const otros = (await remitentes.all()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return [...(env ? [env] : []), ...otros].map(publico);
}

async function obtener(rid) {
  const env = remitenteEnv();
  if (env && (!rid || rid === 'principal')) return env;
  const r = rid ? await remitentes.get(rid) : (await remitentes.all())[0];
  if (!r) return env;
  return { ...r, pass: descifrar(r.passEnc) };
}

async function guardar(datos) {
  const prev = datos.id ? await remitentes.get(datos.id) : null;
  const r = {
    id: prev ? prev.id : 'r' + id(6),
    nombre: String(datos.nombre || '').trim().slice(0, 80),
    email: String(datos.email || '').trim().toLowerCase(),
    replyTo: String(datos.replyTo || '').trim().toLowerCase(),
    host: String(datos.host || '').trim(),
    port: Number(datos.port || 587),
    secure: datos.secure === true || datos.secure === 'true' || Number(datos.port) === 465,
    user: String(datos.user || '').trim(),
    limiteDiario: Number(datos.limiteDiario || 0),
    creado: prev ? prev.creado : new Date().toISOString(),
  };
  if (!r.nombre) throw new Error('Escribe el nombre que verán las personas (ej.: Alcaldía de Villa del Rosario).');
  if (!EMAIL_RE.test(r.email)) throw new Error('El correo del remitente no es válido.');
  if (r.replyTo && !EMAIL_RE.test(r.replyTo)) throw new Error('El correo de respuesta no es válido.');
  if (!r.host || !r.user) throw new Error('Faltan los datos del servidor de correo (SMTP).');
  r.passEnc = datos.pass ? cifrar(datos.pass) : prev && prev.passEnc;
  if (!r.passEnc) throw new Error('Escribe la clave SMTP.');
  await remitentes.put(r.id, r);
  return publico(r);
}

async function probar(rid) {
  const r = await obtener(rid);
  if (!r) throw new Error('No existe ese remitente.');
  const t = nodemailer.createTransport({ host: r.host, port: r.port, secure: r.secure, auth: { user: r.user, pass: r.pass }, connectionTimeout: 10000 });
  await t.verify();
  return true;
}

module.exports = { listar, obtener, guardar, probar, eliminar: rid => remitentes.del(rid), remitenteEnv };
