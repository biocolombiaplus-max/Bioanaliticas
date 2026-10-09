// Imágenes y archivos (piezas, imágenes de correos).
// Prioridad: Cloudinary (CLOUDINARY_URL) → Vercel Blob (BLOB_READ_WRITE_TOKEN) → carpeta local (solo desarrollo).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { id } = require('./store');

const LOCAL_DIR = path.join(process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/bioanaliticas' : path.join(__dirname, '..', 'data')), 'uploads');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
const CARPETA = () => process.env.CLOUDINARY_FOLDER || 'sala-de-prensa';

// CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME (se copia tal cual desde el panel de Cloudinary)
function cloudinary() {
  const m = String(process.env.CLOUDINARY_URL || '').trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  return m ? { apiKey: m[1], apiSecret: m[2], cloud: m[3].replace(/\/.*$/, '') } : null;
}
const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const proveedor = () => (cloudinary() ? 'cloudinary' : blobConfigured() ? 'blob' : process.env.VERCEL ? null : 'local');
const API = () => process.env.CLOUDINARY_API_BASE || 'https://api.cloudinary.com';

// Firma de Cloudinary: parámetros ordenados "a=1&b=2" + secreto, en SHA-1.
function firmar(params, secret) {
  const base = Object.keys(params).sort().filter(k => params[k] !== '' && params[k] != null).map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex');
}

// Datos para que el navegador suba directo a Cloudinary (sin pasar por el límite de 4,5 MB de Vercel).
function firmaSubida(subcarpeta = 'piezas') {
  const c = cloudinary();
  if (!c) throw new Error('Cloudinary no está configurado.');
  const params = { folder: `${CARPETA()}/${subcarpeta}`, timestamp: Math.floor(Date.now() / 1000) };
  return { url: `${API()}/v1_1/${c.cloud}/auto/upload`, apiKey: c.apiKey, ...params, signature: firmar(params, c.apiSecret) };
}

async function subirCloudinary(buffer, contentType, subcarpeta) {
  const c = cloudinary();
  const params = { folder: `${CARPETA()}/${subcarpeta}`, timestamp: Math.floor(Date.now() / 1000) };
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: contentType }), 'archivo.' + (EXT[contentType] || 'bin'));
  for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
  fd.append('api_key', c.apiKey);
  fd.append('signature', firmar(params, c.apiSecret));
  const res = await fetch(`${API()}/v1_1/${c.cloud}/auto/upload`, { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.secure_url) throw new Error('Cloudinary no recibió el archivo: ' + ((j.error && j.error.message) || res.status));
  return j.secure_url;
}

async function guardar(buffer, contentType, subcarpeta, baseUrl) {
  const ext = EXT[contentType];
  if (!ext) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP, GIF, MP4, MOV, WEBM o PDF.');
  const p = proveedor();
  if (p === 'cloudinary') return subirCloudinary(buffer, contentType, subcarpeta);
  const name = `${new Date().toISOString().slice(0, 10)}-${id(8)}.${ext}`;
  if (p === 'blob') {
    const { put } = require('@vercel/blob');
    return (await put(`${subcarpeta}/${name}`, buffer, { access: 'public', contentType })).url;
  }
  if (!p) throw new Error('Para guardar imágenes conecta Cloudinary (variable CLOUDINARY_URL en Vercel).');
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, name), buffer);
  return `${baseUrl}/uploads/${name}`;
}

const guardarImagen = (buffer, contentType, baseUrl) => {
  if (!/^image\//.test(contentType)) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.');
  return guardar(buffer, contentType, 'imagenes', baseUrl);
};
const guardarArchivo = (buffer, contentType, nombre, baseUrl) => guardar(buffer, contentType, 'piezas', baseUrl);

module.exports = { guardarImagen, guardarArchivo, firmaSubida, firmar, proveedor, cloudinary, blobConfigured, LOCAL_DIR };
