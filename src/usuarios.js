// Usuarios y roles.
// - Los usuarios de la variable ADMIN_USERS son administradores principales (no se pueden borrar desde el panel).
// - Desde el panel, un administrador crea más usuarios y les asigna funciones por sección
//   (sin acceso, ver, editar...). Hay plantillas listas: diseño, consulta, periodista, community manager.
const crypto = require('crypto');
const { col } = require('./store');

const usuarios = col('usuarios');
const ROLES = {
  admin: 'Administrador (todo, incluidos usuarios y ajustes)',
  diseno: 'Diseño (sube piezas para revisión)',
  apoyo: 'Periodista o apoyo de prensa',
  community: 'Community manager',
  consulta: 'Consulta (solo ve tableros e informes)',
  personalizado: 'Personalizado',
};
// Secciones del panel y lo que se puede hacer en cada una.
const MODULOS = {
  piezas: { nombre: 'Piezas para revisar', niveles: { ver: 'Ver', subir: 'Subir y corregir', aprobar: 'Revisar y aprobar' } },
  agenda: { nombre: 'Agenda de gestión e informe', niveles: { ver: 'Ver', editar: 'Registrar y editar' } },
  calendario: { nombre: 'Calendario editorial', niveles: { ver: 'Ver', editar: 'Planear y editar' } },
  correos: { nombre: 'Correos', niveles: { ver: 'Ver resultados', editar: 'Crear y enviar' } },
  contactos: { nombre: 'Bases de datos', niveles: { ver: 'Ver', editar: 'Importar y limpiar' } },
  directorio: { nombre: 'Directorio y red', niveles: { ver: 'Ver', editar: 'Buscar, invitar y editar' } },
  estudio: { nombre: 'Estudio de contenidos', niveles: { editar: 'Usar' } },
  analizar: { nombre: 'Analizar publicación', niveles: { ver: 'Ver análisis', editar: 'Analizar enlaces' } },
  tablero: { nombre: 'Tablero', niveles: { ver: 'Ver' } },
  instagram: { nombre: 'Cuenta de Instagram', niveles: { ver: 'Ver' } },
  informes: { nombre: 'Informes', niveles: { ver: 'Ver y descargar' } },
};
const PLANTILLAS = {
  diseno: { piezas: 'subir', calendario: 'ver' },
  apoyo: { piezas: 'ver', agenda: 'editar', calendario: 'editar', directorio: 'editar', analizar: 'editar', tablero: 'ver', instagram: 'ver', informes: 'ver' },
  community: { piezas: 'subir', calendario: 'editar', estudio: 'editar', analizar: 'editar', tablero: 'ver', instagram: 'ver', informes: 'ver' },
  consulta: { piezas: 'ver', agenda: 'ver', calendario: 'ver', correos: 'ver', contactos: 'ver', directorio: 'ver', analizar: 'ver', tablero: 'ver', instagram: 'ver', informes: 'ver' },
};
const RANGO = { ver: 1, subir: 2, editar: 3, aprobar: 3 };
const TODO = Object.fromEntries(Object.entries(MODULOS).map(([k, m]) => [k, Object.keys(m.niveles).pop()]));
function limpiarFunciones(f) {
  const out = {};
  for (const [k, v] of Object.entries(f || {})) if (MODULOS[k] && MODULOS[k].niveles[v]) out[k] = v;
  return out;
}
// Funciones efectivas de un usuario: el administrador tiene todo; los demás, las asignadas o las de su plantilla.
function funcionesDe(rec) {
  if (rec.rol === 'admin') return { ...TODO };
  return rec.funciones ? limpiarFunciones(rec.funciones) : { ...(PLANTILLAS[rec.rol] || {}) };
}
// ¿El perfil tiene al menos ese nivel en la sección?
const tiene = (perfil, modulo, nivel = 'ver') => perfil.rol === 'admin' || (RANGO[(perfil.funciones || {})[modulo]] || 0) >= RANGO[nivel];

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
  if (env !== undefined) return same(sha(clave), sha(env)) ? { usuario: u, nombre: nombreDe(u), rol: 'admin', principal: true, funciones: { ...TODO } } : null;
  const rec = await usuarios.get(u);
  if (!rec || rec.activo === false) return null;
  return same(hashOf(clave, rec.salt), rec.hash) ? { usuario: u, nombre: rec.nombre || u, rol: rec.rol, funciones: funcionesDe(rec) } : null;
}

async function perfilDe(usuario) {
  const u = String(usuario || '').toLowerCase();
  if (envUsers().has(u)) return { usuario: u, nombre: nombreDe(u), rol: 'admin', principal: true, funciones: { ...TODO } };
  const rec = await usuarios.get(u);
  if (!rec || rec.activo === false) return null;
  return { usuario: u, nombre: rec.nombre || u, rol: rec.rol, funciones: funcionesDe(rec) };
}

async function listar() {
  const env = [...envUsers().keys()].map(u => ({ usuario: u, nombre: nombreDe(u), rol: 'admin', principal: true, activo: true, funciones: { ...TODO } }));
  const otros = (await usuarios.all()).map(({ hash, salt, ...r }) => ({ ...r, funciones: funcionesDe(r) }));
  return [...env, ...otros.sort((a, b) => a.usuario.localeCompare(b.usuario))];
}

async function guardar({ usuario, nombre, rol, clave, activo = true, funciones }, autor) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error('El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios.');
  if (envUsers().has(u)) throw new Error('Ese usuario es un administrador principal; se cambia en Vercel (ADMIN_USERS).');
  if (!ROLES[rol]) throw new Error('Rol no válido.');
  const prev = await usuarios.get(u);
  if (!prev && !clave) throw new Error('Escribe una clave para el usuario nuevo.');
  if (clave && String(clave).length < 5) throw new Error('La clave debe tener al menos 5 caracteres.');
  const f = rol === 'admin' ? null : limpiarFunciones(funciones || PLANTILLAS[rol]);
  if (f && !Object.keys(f).length) throw new Error('Asigna al menos una función al usuario.');
  const rec = { ...(prev || { creado: new Date().toISOString(), creadoPor: autor }), usuario: u, nombre: String(nombre || u).slice(0, 80), rol, activo: Boolean(activo), funciones: f };
  if (clave) { rec.salt = crypto.randomBytes(16).toString('hex'); rec.hash = hashOf(clave, rec.salt); }
  await usuarios.put(u, rec);
  return { usuario: u, nombre: rec.nombre, rol, activo: rec.activo, funciones: funcionesDe(rec) };
}

async function eliminar(usuario) {
  if (envUsers().has(String(usuario).toLowerCase())) throw new Error('No se puede eliminar un administrador principal.');
  await usuarios.del(String(usuario).toLowerCase());
}

module.exports = { autenticar, perfilDe, listar, guardar, eliminar, ROLES, MODULOS, PLANTILLAS, tiene, envUsers };
