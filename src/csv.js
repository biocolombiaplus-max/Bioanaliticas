// Lectura y análisis de bases de datos: CSV (coma, punto y coma o tabulador) y Excel (.xlsx).
const { limpiarContacto, limpiarEmail, ordenarNombre, dominiosSinCorreo, EMAIL_RE } = require('./limpieza');

function detectDelimiter(line) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const d = detectDelimiter(text.split(/\r?\n/, 1)[0] || '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Devuelve las filas como matriz de textos, sea CSV o Excel.
async function readRows(buffer, filename = '') {
  let rows;
  if (/\.xlsx$/i.test(filename) || (buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    const { readSheet } = require('read-excel-file/node');
    rows = await readSheet(buffer);
  } else if (/\.xls$/i.test(filename)) {
    throw new Error('El formato .xls antiguo no es compatible. En Excel usa "Guardar como" → Libro de Excel (.xlsx) o CSV.');
  } else {
    rows = parseCsv(buffer.toString('utf8'));
  }
  return rows
    .map(r => r.map(c => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)).trim()))
    .filter(r => r.some(c => c !== ''));
}

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const FIELDS = {
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email', 'emailaddress', 'correoe', 'direcciondecorreo', 'eMail'.toLowerCase()],
  nombre: ['nombre', 'nombres', 'name', 'firstname', 'nombrecompleto', 'primernombre', 'nombreyapellido', 'nombresyapellidos'],
  apellido: ['apellido', 'apellidos', 'lastname'],
  ciudad: ['ciudad', 'municipio', 'city', 'lugar', 'residencia', 'municipioderesidencia'],
  telefono: ['telefono', 'celular', 'whatsapp', 'phone', 'movil', 'numerodecelular'],
  organizacion: ['organizacion', 'empresa', 'medio', 'entidad', 'institucion', 'company'],
  cargo: ['cargo', 'rol', 'ocupacion', 'puesto'],
  autorizacion: ['autorizacion', 'autoriza', 'consentimiento', 'acepta', 'aceptatratamiento', 'habeasdata', 'optin', 'consent', 'aceptaterminos', 'tratamientodedatos'],
};
const NO = new Set(['no', 'n', 'false', 'falso', '0', 'rechaza', 'noautoriza', 'noacepta']);
const SI = new Set(['si', 's', 'yes', 'true', 'verdadero', '1', 'acepto', 'autorizo', 'x']);

function mapHeader(rows) {
  const header = (rows[0] || []).map(norm);
  const idx = {};
  for (const [k, aliases] of Object.entries(FIELDS)) {
    const parcial = { email: /correo|email|mail/, autorizacion: /autoriz|acepta|consent|habeas|tratamiento|optin/, ciudad: /municipio|ciudad/, telefono: /telefono|celular|whatsapp/ }[k];
    let i = header.findIndex((h, j) => aliases.includes(h) && !Object.values(idx).includes(j));
    if (i < 0 && parcial) i = header.findIndex((h, j) => parcial.test(h) && !Object.values(idx).includes(j));
    if (i >= 0 && !Object.values(idx).includes(i)) idx[k] = i;
  }
  let body = rows.slice(1);
  if (idx.email === undefined) {
    // Sin encabezado reconocible: se busca la columna que tiene correos.
    const sample = rows.slice(0, 20);
    let best = -1, bestN = 0;
    for (let c = 0; c < Math.max(...sample.map(r => r.length)); c++) {
      const n = sample.filter(r => EMAIL_RE.test(r[c] || '')).length;
      if (n > bestN) { best = c; bestN = n; }
    }
    if (best < 0) throw new Error('No encontré una columna con correos electrónicos. Revisa que el archivo tenga una columna "correo" o "email".');
    idx.email = best;
    if (EMAIL_RE.test(rows[0][best] || '')) body = rows;
  }
  return { idx, body, header: rows[0] || [] };
}

function rowToContact(r, idx) {
  const g = k => (idx[k] !== undefined ? String(r[idx[k]] || '').trim() : '');
  return {
    email: g('email').toLowerCase().replace(/^mailto:/, ''),
    nombre: [g('nombre'), g('apellido')].filter(Boolean).join(' ').replace(/\s+/g, ' '),
    ciudad: g('ciudad'),
    telefono: g('telefono'),
    organizacion: g('organizacion'),
    cargo: g('cargo'),
    autorizacionTexto: g('autorizacion'),
  };
}

// Contactos listos para importar: limpios, sin repetidos, sin correos riesgosos ni dominios inexistentes.
async function parseContacts(rows, { verificarDominios = true } = {}) {
  const { idx, body } = mapHeader(rows);
  const limpios = body.map(r => limpiarContacto(rowToContact(r, idx)));
  const malos = verificarDominios ? await dominiosSinCorreo(limpios.filter(x => x.tipo !== 'invalido').map(x => x.contacto.email.split('@')[1])) : new Set();
  const out = [];
  let invalid = 0, sinAutorizacion = 0, descartados = 0;
  for (const { contacto: c, tipo } of limpios) {
    if (tipo === 'invalido') { invalid++; continue; }
    if (tipo === 'desechable' || tipo === 'prueba' || malos.has(c.email.split('@')[1])) { descartados++; continue; }
    if (idx.autorizacion !== undefined && NO.has(norm(c.autorizacionTexto))) { sinAutorizacion++; continue; }
    delete c.autorizacionTexto;
    if (tipo === 'institucional') c.institucional = true;
    out.push(c);
  }
  out.sort((x, y) => (x.ciudad || 'zz').localeCompare(y.ciudad || 'zz', 'es') || (x.nombre || 'zz').localeCompare(y.nombre || 'zz', 'es'));
  return { contacts: out, invalid: invalid + descartados, descartados, sinAutorizacion, hasConsentColumn: idx.autorizacion !== undefined };
}

const top = (map, n = 8) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };

// Diagnóstico de una base antes de importarla.
async function perfil(rows, existentes = new Map()) {
  const { idx, body, header } = mapHeader(rows);
  const p = {
    filas: body.length,
    columnas: header.map((h, i) => ({ nombre: h || `Columna ${i + 1}`, campo: Object.keys(idx).find(k => idx[k] === i) || null })),
    validos: 0, invalidos: 0, duplicados: 0, yaExisten: 0, conBaja: 0,
    conNombre: 0, sinNombre: 0, conCiudad: 0, conTelefono: 0,
    autorizacion: { columna: idx.autorizacion !== undefined, si: 0, no: 0, sinDato: 0 },
    limpieza: { correosCorregidos: 0, nombresOrdenados: 0, ciudadesUnificadas: 0, telefonosFormateados: 0, institucionales: 0, desechables: 0, prueba: 0, sinBuzon: 0, ejemplos: [], ejemplosSinBuzon: [] },
    dominios: {}, ciudades: {}, organizaciones: {}, ejemplosInvalidos: [], muestra: [],
  };
  const limpios = body.map(r => limpiarContacto(rowToContact(r, idx)));
  const malos = await dominiosSinCorreo(limpios.filter(x => x.tipo !== 'invalido').map(x => x.contacto.email.split('@')[1]));
  const L = p.limpieza;
  const seen = new Set();
  for (const { contacto: c, tipo, cambios } of limpios) {
    if (tipo === 'invalido') { p.invalidos++; if (p.ejemplosInvalidos.length < 6) p.ejemplosInvalidos.push(c.email || '(vacío)'); continue; }
    if (cambios.email) { L.correosCorregidos++; if (L.ejemplos.length < 6) L.ejemplos.push(cambios.email); }
    if (tipo === 'desechable') { L.desechables++; continue; }
    if (tipo === 'prueba') { L.prueba++; continue; }
    if (malos.has(c.email.split('@')[1])) { L.sinBuzon++; if (L.ejemplosSinBuzon.length < 5) L.ejemplosSinBuzon.push(c.email); continue; }
    if (seen.has(c.email)) { p.duplicados++; continue; }
    seen.add(c.email);
    p.validos++;
    if (tipo === 'institucional') L.institucionales++;
    if (cambios.nombre) L.nombresOrdenados++;
    if (cambios.ciudad) L.ciudadesUnificadas++;
    if (cambios.telefono) L.telefonosFormateados++;
    const ex = existentes.get(c.email);
    if (ex) { p.yaExisten++; if (ex.baja) p.conBaja++; }
    c.nombre ? p.conNombre++ : p.sinNombre++;
    if (c.ciudad) { p.conCiudad++; inc(p.ciudades, c.ciudad); }
    if (c.telefono) p.conTelefono++;
    if (c.organizacion) inc(p.organizaciones, c.organizacion);
    inc(p.dominios, c.email.split('@')[1]);
    if (idx.autorizacion !== undefined) {
      const a = norm(c.autorizacionTexto);
      if (NO.has(a)) p.autorizacion.no++; else if (SI.has(a)) p.autorizacion.si++; else p.autorizacion.sinDato++;
    }
    if (p.muestra.length < 5) p.muestra.push({ email: c.email, nombre: c.nombre, ciudad: c.ciudad });
  }
  p.dominios = top(p.dominios);
  p.ciudades = top(p.ciudades, 10);
  p.organizaciones = top(p.organizaciones, 8);
  p.listosParaEnviar = p.validos - p.autorizacion.no - p.conBaja;
  p.calidad = p.filas ? Math.round(100 * p.validos / p.filas) : 0;
  p.alertas = [];
  if (p.invalidos) p.alertas.push(`${p.invalidos} correos están incompletos o mal escritos y se descartarán.`);
  if (L.sinBuzon) p.alertas.push(`${L.sinBuzon} correos son de dominios que no existen o no reciben correo: se descartarán para proteger la reputación del remitente.`);
  if (L.desechables + L.prueba) p.alertas.push(`${L.desechables + L.prueba} correos son temporales o de prueba y se descartarán.`);
  if (p.duplicados) p.alertas.push(`${p.duplicados} correos están repetidos; se importará cada uno una sola vez.`);
  if (!p.autorizacion.columna) p.alertas.push('El archivo no tiene columna de autorización: confirma que todas las personas aceptaron recibir información.');
  if (p.autorizacion.no) p.alertas.push(`${p.autorizacion.no} personas dijeron que NO autorizan: no se importarán.`);
  if (p.conBaja) p.alertas.push(`${p.conBaja} personas se habían dado de baja antes: seguirán excluidas.`);
  if (L.institucionales) p.alertas.push(`${L.institucionales} son correos genéricos (info@, contacto@…): se importan, pero suelen abrir menos.`);
  if (p.sinNombre > p.validos / 2) p.alertas.push('Más de la mitad no tiene nombre: el saludo será general ("Hola,").');
  return p;
}

// Lista de correos escrita o pegada a mano ("Ana <ana@x.com>, beto@y.com; ...").
function parseManual(text) {
  const out = [];
  const seen = new Set();
  const invalidos = [];
  for (const part of String(text || '').split(/[\n,;]+/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(.*?)<\s*([^>]+)\s*>$/);
    const email = limpiarEmail(m ? m[2] : t).email;
    const nombre = m ? ordenarNombre(m[1].replace(/["']/g, '')) : '';
    if (!EMAIL_RE.test(email)) { invalidos.push(t); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, nombre });
  }
  return { contactos: out, invalidos };
}

module.exports = { readRows, mapHeader, rowToContact, parseContacts, perfil, parseManual, EMAIL_RE };
