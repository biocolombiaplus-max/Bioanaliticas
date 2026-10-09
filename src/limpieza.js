// Limpieza y normalización de contactos antes de enviar: corrige correos mal escritos,
// ordena nombres y municipios, da formato a teléfonos y descarta direcciones riesgosas.
const dns = require('dns').promises;

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;
const sinTildes = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

// Errores frecuentes al escribir el dominio.
const DOMINIOS = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.comm': 'gmail.com', 'gimail.com': 'gmail.com', 'g.mail.com': 'gmail.com', 'gmail.es': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotamil.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmil.com': 'hotmail.com', 'homail.com': 'hotmail.com', 'hotmail.comm': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com', 'otlook.com': 'outlook.com',
  'live.con': 'live.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com',
};
const DESECHABLES = /(mailinator|yopmail|guerrillamail|10minutemail|tempmail|temp-mail|trashmail|sharklasers|getnada|dispostable|maildrop|fakeinbox|throwawaymail)\./i;
const PRUEBA = /@(example\.(com|org|net)|test\.com|prueba\.com|correo\.com|email\.com|dominio\.com|ejemplo\.com|asdf\.com|xxx\.com)$/i;
const ROL = /^(info|informacion|contacto|contact|ventas|sales|admin|administracion|soporte|support|noreply|no-reply|no_reply|webmaster|postmaster|hostmaster|abuse|recepcion|gerencia|facturacion|rrhh|marketing)@/i;

function limpiarEmail(raw) {
  const original = String(raw || '');
  let e = original.trim().toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/[<>"'()\[\]]/g, '')
    .replace(/\s+/g, '')
    .replace(/[.,;:]+$/, '')
    .replace(/\.{2,}/g, '.')
    .replace(/,(?=[a-z]{2,4}$)/, '.')
    .replace(/@{2,}/g, '@');
  let [usuario, dominio] = e.split('@');
  if (dominio) {
    dominio = dominio.replace(/^\.+/, '');
    if (DOMINIOS[dominio]) dominio = DOMINIOS[dominio];
    else dominio = dominio.replace(/\.(con|cpm|cmo|vom|xom|comm|coom)$/, '.com').replace(/\.co\.$/, '.co');
    e = `${usuario}@${dominio}`;
  }
  return { email: e, corregido: e !== original.trim().toLowerCase() && EMAIL_RE.test(e), original: original.trim() };
}

function tipoCorreo(email) {
  if (!EMAIL_RE.test(email)) return 'invalido';
  if (DESECHABLES.test(email)) return 'desechable';
  if (PRUEBA.test(email)) return 'prueba';
  if (ROL.test(email)) return 'institucional';
  return 'personal';
}

// Tildes de nombres y apellidos frecuentes (solo cuando vienen sin tilde).
const TILDES = Object.fromEntries(('María José Jesús Andrés Julián Sebastián Martín Agustín Simón Ramón Germán Rubén Raúl Iván Óscar Héctor Nicolás Tomás Lucía Mónica Verónica Ángela Ángel Inés Adrián Fabián Damián Joaquín Cristián Benjamín Álvaro Sofía Valentín Andrés Belén Ximena Dayána Yésica Jhonatán Rocío Natalia Camilo ' +
  'Gómez Pérez Rodríguez Martínez García Hernández López González Sánchez Ramírez Díaz Álvarez Jiménez Suárez Núñez Méndez Vásquez Vázquez Fernández Gutiérrez Ríos Muñoz Ordóñez Ibáñez Castañeda Montaña Beltrán Rincón Durán Galván Chacón Ramón Báez Peláez Valdés Cárdenas Gálvez Velásquez Márquez Domínguez Benítez Rengifo Monsalve Quintero Ortíz Sepúlveda Contreras Ruíz Zúñiga Acuña Ochoa Bermúdez Jaimes Alcaldía Gobernación Policía Educación Comunicación Comunicaciones Secretaría Dirección Información Administración Gestión Producción Televisión Radio Periódico Fundación Asociación Corporación Cámara Comisión Oficina Jefe Técnico Periodista Médico')
  .split(/\s+/).filter(w => /[áéíóúñÁÉÍÓÚÑ]/.test(w)).map(w => [sinTildes(w).toLowerCase(), w]));
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'van', 'von']);

function ordenarNombre(raw) {
  const s = String(raw || '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.split(' ').map((w, i) => {
    const low = w.toLowerCase();
    if (i > 0 && MENORES.has(low)) return low;
    if (TILDES[low] && sinTildes(w) === w) return TILDES[low];
    return low.charAt(0).toUpperCase() + low.slice(1);
  }).join(' ');
}

// Municipios del área metropolitana y otros frecuentes, escritos correctamente.
const MUNICIPIOS = {
  cucuta: 'Cúcuta', 'san jose de cucuta': 'Cúcuta', 'villa del rosario': 'Villa del Rosario', 'villa rosario': 'Villa del Rosario', 'v del rosario': 'Villa del Rosario', 'villadelrosario': 'Villa del Rosario', rosario: 'Villa del Rosario',
  'los patios': 'Los Patios', patios: 'Los Patios', 'el zulia': 'El Zulia', zulia: 'El Zulia', 'san cayetano': 'San Cayetano', 'puerto santander': 'Puerto Santander',
  ocana: 'Ocaña', pamplona: 'Pamplona', chinacota: 'Chinácota', tibu: 'Tibú', sardinata: 'Sardinata', abrego: 'Ábrego', bochalema: 'Bochalema', durania: 'Durania', 'el tarra': 'El Tarra', toledo: 'Toledo', convencion: 'Convención', salazar: 'Salazar',
  bogota: 'Bogotá', 'bogota dc': 'Bogotá', medellin: 'Medellín', bucaramanga: 'Bucaramanga', cali: 'Cali', barranquilla: 'Barranquilla', cartagena: 'Cartagena', 'san antonio del tachira': 'San Antonio del Táchira', 'san antonio': 'San Antonio del Táchira', urena: 'Ureña', 'san cristobal': 'San Cristóbal',
};
function ordenarCiudad(raw) {
  const k = sinTildes(String(raw || '')).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\b(municipio|mpio|norte de santander|n de s|nds|colombia)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!k) return '';
  return MUNICIPIOS[k] || ordenarNombre(raw);
}

function ordenarTelefono(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  const n = d.startsWith('57') && d.length === 12 ? d.slice(2) : d;
  if (/^3\d{9}$/.test(n)) return `+57 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  if (/^60\d{8}$/.test(n)) return `+57 ${n.slice(0, 3)} ${n.slice(3)}`;
  return String(raw).trim();
}

const ordenarTexto = s => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t && t === t.toUpperCase() && /[A-Z]{4,}/.test(sinTildes(t)) ? ordenarNombre(t) : t;
};

// Limpia un contacto y cuenta qué se corrigió.
function limpiarContacto(c) {
  const e = limpiarEmail(c.email);
  const out = {
    ...c,
    email: e.email,
    nombre: ordenarNombre(c.nombre),
    ciudad: ordenarCiudad(c.ciudad),
    telefono: ordenarTelefono(c.telefono),
    organizacion: ordenarTexto(c.organizacion),
    cargo: ordenarTexto(c.cargo),
  };
  const cambios = {
    email: e.corregido ? { antes: e.original, despues: e.email } : null,
    nombre: c.nombre && out.nombre !== String(c.nombre).trim(),
    ciudad: c.ciudad && out.ciudad !== String(c.ciudad).trim(),
    telefono: c.telefono && out.telefono !== String(c.telefono).trim(),
  };
  return { contacto: out, tipo: tipoCorreo(out.email), cambios };
}

// Verifica que los dominios existan y reciban correo (registros MX). Los grandes proveedores no se consultan.
const CONOCIDOS = /^(gmail|hotmail|outlook|live|yahoo|icloud|msn|me|aol|protonmail|proton)\.(com|es|co|me)$/;
async function dominiosSinCorreo(dominios, { limite = 400, tiempo = 3000 } = {}) {
  const malos = new Set();
  const lista = [...new Set(dominios)].filter(d => !CONOCIDOS.test(d)).slice(0, limite);
  const conTiempo = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('tiempo'), { code: 'TIMEOUT' })), tiempo))]);
  const revisar = async d => {
    try { const mx = await conTiempo(dns.resolveMx(d)); if (!mx.length) throw Object.assign(new Error(), { code: 'ENODATA' }); }
    catch (e) {
      if (e.code === 'ENOTFOUND') return malos.add(d);
      if (e.code === 'ENODATA') {
        try { await conTiempo(dns.resolve4(d)); } catch (e2) { if (e2.code === 'ENOTFOUND' || e2.code === 'ENODATA') malos.add(d); }
      }
      // Errores de red o tiempo agotado: no se descarta (se prefiere no perder contactos).
    }
  };
  for (let i = 0; i < lista.length; i += 25) await Promise.all(lista.slice(i, i + 25).map(revisar));
  return malos;
}

module.exports = { limpiarEmail, limpiarContacto, tipoCorreo, ordenarNombre, ordenarCiudad, ordenarTelefono, dominiosSinCorreo, EMAIL_RE };
