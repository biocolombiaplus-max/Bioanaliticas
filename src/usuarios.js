// Usuarios y roles.
// - Los usuarios de la variable ADMIN_USERS son administradores principales (no se pueden borrar desde el panel).
// - Desde el panel, un administrador crea más usuarios: administrador, diseño (solo sube y corrige piezas) o consulta.
const crypto = require('crypto');
const { col } = require('./store');

const usuarios = col('usuarios');
const ROLES = {
  admin: 'Administrador',
  diseno: 'Diseño (sube piezas para revisión)',
  consulta: 'Consulta (solo ve tableros e informes)',
};

function envUsers() {
  const map = new Map();
  for (const pair of String(process.env.ADMIN_USERS || '').split(/[,;]/)) {
    const i = pair.indexOf(':');
    if (i > 0) map.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim());
  }
  if (process.env.ADMIN_PASSWORD || !map.size) map.set((process.env.ADMIN_USER || 'ligia').toLowerCase(), process.env.ADMIN_PASSWORD || 'cambia-esta-clave');
  return map;
}

const hashOf = (clave, salt) => crypto.scryptSync(String(clave), salt, 32).toString('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

// Nombre para mostrar de los administradores principales: ADMIN_NOMBRES=lamonalinda:Ligia,otro:Nombre
function nombreDe(u) {
  for (const pair of String(process.env.ADMIN_NOMBRES || 'lamonalinda:Ligia').split(/[,;]/)) {
    const [k, v] = pair.split(':');
    if (k && v && k.trim().toLowerCase() === u) return v.trim();
  }
  return u;
}

// Devuelve { usuario, nombre, rol } si las credenciales son correctas.
async function autenticar(usuario, clave) {
  const u = String(usuario || '').trim().toLowerCase();
  const env = envUsers().get(u);
  if (env !== undefined) return same(sha(clave), sha(env)) ? { usuario: u, nombre: nombreDe(u), rol: 'admin', principal: true } : null;
  const rec = await usuarios.get(u);
  if (!rec || rec.activo === false) return null;
  return same(hashOf(clave, rec.salt), rec.hash) ? { usuario: u, nombre: rec.nombre || u, rol: rec.rol } : null;
}

async function perfilDe(usuario) {
  const u = String(usuario || '').toLowerCase();
  if (envUsers().has(u)) return { usuario: u, nombre: nombreDe(u), rol: 'admin', principal: true };
  const rec = await usuarios.get(u);
  if (!rec || rec.activo === false) return null;
  return { usuario: u, nombre: rec.nombre || u, rol: rec.rol };
}

async function listar() {
  const env = [...envUsers().keys()].map(u => ({ usuario: u, nombre: nombreDe(u), rol: 'admin', principal: true, activo: true }));
  const otros = (await usuarios.all()).map(({ hash, salt, ...r }) => r);
  return [...env, ...otros.sort((a, b) => a.usuario.localeCompare(b.usuario))];
}

async function guardar({ usuario, nombre, rol, clave, activo = true }, autor) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error('El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios.');
  if (envUsers().has(u)) throw new Error('Ese usuario es un administrador principal; se cambia en Vercel (ADMIN_USERS).');
  if (!ROLES[rol]) throw new Error('Rol no válido.');
  const prev = await usuarios.get(u);
  if (!prev && !clave) throw new Error('Escribe una clave para el usuario nuevo.');
  if (clave && String(clave).length < 5) throw new Error('La clave debe tener al menos 5 caracteres.');
  const rec = { ...(prev || { creado: new Date().toISOString(), creadoPor: autor }), usuario: u, nombre: String(nombre || u).slice(0, 80), rol, activo: Boolean(activo) };
  if (clave) { rec.salt = crypto.randomBytes(16).toString('hex'); rec.hash = hashOf(clave, rec.salt); }
  await usuarios.put(u, rec);
  return { usuario: u, nombre: rec.nombre, rol, activo: rec.activo };
}

async function eliminar(usuario) {
  if (envUsers().has(String(usuario).toLowerCase())) throw new Error('No se puede eliminar un administrador principal.');
  await usuarios.del(String(usuario).toLowerCase());
}

module.exports = { autenticar, perfilDe, listar, guardar, eliminar, ROLES, envUsers };
