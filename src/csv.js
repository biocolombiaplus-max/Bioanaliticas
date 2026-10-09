// Lectura de bases de datos en CSV (separadas por coma, punto y coma o tabulador).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function detectDelimiter(line) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseRows(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const d = detectDelimiter(firstLine);
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
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const FIELDS = {
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email1', 'emailaddress'],
  nombre: ['nombre', 'nombres', 'name', 'firstname', 'nombrecompleto', 'primernombre'],
  apellido: ['apellido', 'apellidos', 'lastname'],
  ciudad: ['ciudad', 'municipio', 'city'],
  telefono: ['telefono', 'celular', 'whatsapp', 'phone', 'movil'],
  autorizacion: ['autorizacion', 'autoriza', 'consentimiento', 'acepta', 'aceptatratamiento', 'habeasdata', 'optin', 'consent'],
};
const NO = new Set(['no', 'n', 'false', 'falso', '0', 'rechaza', 'noautoriza']);

function parseContacts(text) {
  const rows = parseRows(text);
  if (!rows.length) return { contacts: [], invalid: 0, sinAutorizacion: 0, hasConsentColumn: false };
  const header = rows[0].map(norm);
  const idx = {};
  for (const [k, aliases] of Object.entries(FIELDS)) {
    const i = header.findIndex(h => aliases.includes(h));
    if (i >= 0) idx[k] = i;
  }
  let body = rows.slice(1);
  // Sin encabezado reconocible: buscar la columna que contiene correos.
  if (idx.email === undefined) {
    const col = rows[0].findIndex(c => EMAIL_RE.test(c.trim()));
    if (col < 0) throw new Error('No encontré una columna de correo. Usa un encabezado como "email" o "correo".');
    idx.email = col;
    body = rows;
  }
  const out = [];
  let invalid = 0, sinAutorizacion = 0;
  for (const r of body) {
    const email = (r[idx.email] || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    if (idx.autorizacion !== undefined && NO.has(norm(r[idx.autorizacion] || 'si'))) { sinAutorizacion++; continue; }
    const nombre = [r[idx.nombre], r[idx.apellido]].filter(Boolean).join(' ').trim();
    out.push({
      email,
      nombre: nombre.replace(/\s+/g, ' '),
      ciudad: idx.ciudad !== undefined ? (r[idx.ciudad] || '').trim() : '',
      telefono: idx.telefono !== undefined ? (r[idx.telefono] || '').trim() : '',
    });
  }
  return { contacts: out, invalid, sinAutorizacion, hasConsentColumn: idx.autorizacion !== undefined };
}

module.exports = { parseContacts, EMAIL_RE };
