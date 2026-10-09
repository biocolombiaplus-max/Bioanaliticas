// Lectura y análisis de bases de datos: CSV (coma, punto y coma o tabulador) y Excel (.xlsx).
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

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

function parseContacts(rows) {
  const { idx, body } = mapHeader(rows);
  const out = [];
  let invalid = 0, sinAutorizacion = 0;
  for (const r of body) {
    const c = rowToContact(r, idx);
    if (!EMAIL_RE.test(c.email)) { invalid++; continue; }
    if (idx.autorizacion !== undefined && NO.has(norm(c.autorizacionTexto))) { sinAutorizacion++; continue; }
    delete c.autorizacionTexto;
    if (c.ciudad) c.ciudad = titulo(c.ciudad);
    out.push(c);
  }
  return { contacts: out, invalid, sinAutorizacion, hasConsentColumn: idx.autorizacion !== undefined };
}

const top = (map, n = 8) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
const titulo = s => s.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()).replace(/ (De|Del|La|Los|Las|Y) /g, m => m.toLowerCase());

// Diagnóstico de una base antes de importarla.
function perfil(rows, existentes = new Map()) {
  const { idx, body, header } = mapHeader(rows);
  const p = {
    filas: body.length,
    columnas: header.map((h, i) => ({ nombre: h || `Columna ${i + 1}`, campo: Object.keys(idx).find(k => idx[k] === i) || null })),
    validos: 0, invalidos: 0, duplicados: 0, yaExisten: 0, conBaja: 0,
    conNombre: 0, sinNombre: 0, conCiudad: 0, conTelefono: 0,
    autorizacion: { columna: idx.autorizacion !== undefined, si: 0, no: 0, sinDato: 0 },
    dominios: {}, ciudades: {}, organizaciones: {}, ejemplosInvalidos: [], muestra: [],
  };
  const seen = new Set();
  for (const r of body) {
    const c = rowToContact(r, idx);
    if (!EMAIL_RE.test(c.email)) { p.invalidos++; if (p.ejemplosInvalidos.length < 6) p.ejemplosInvalidos.push(c.email || '(vacío)'); continue; }
    if (seen.has(c.email)) { p.duplicados++; continue; }
    seen.add(c.email);
    p.validos++;
    const ex = existentes.get(c.email);
    if (ex) { p.yaExisten++; if (ex.baja) p.conBaja++; }
    c.nombre ? p.conNombre++ : p.sinNombre++;
    if (c.ciudad) { p.conCiudad++; inc(p.ciudades, titulo(c.ciudad)); }
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
  if (p.invalidos) p.alertas.push(`${p.invalidos} correos tienen errores de escritura y se descartarán.`);
  if (p.duplicados) p.alertas.push(`${p.duplicados} correos están repetidos en el archivo; se importará cada uno una sola vez.`);
  if (!p.autorizacion.columna) p.alertas.push('El archivo no tiene una columna de autorización: confirma que todas las personas aceptaron recibir información.');
  if (p.autorizacion.no) p.alertas.push(`${p.autorizacion.no} personas dijeron que NO autorizan: no se importarán.`);
  if (p.conBaja) p.alertas.push(`${p.conBaja} personas se habían dado de baja antes: seguirán excluidas.`);
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
    const email = (m ? m[2] : t).trim().toLowerCase();
    const nombre = m ? m[1].replace(/["']/g, '').trim() : '';
    if (!EMAIL_RE.test(email)) { invalidos.push(t); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, nombre });
  }
  return { contactos: out, invalidos };
}

module.exports = { readRows, parseContacts, perfil, parseManual, EMAIL_RE };
