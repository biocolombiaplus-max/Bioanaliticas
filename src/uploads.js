// Imágenes: Vercel Blob en producción (URL pública, apta para correos); carpeta local en desarrollo.
const fs = require('fs');
const path = require('path');
const { id } = require('./store');

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const LOCAL_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'uploads');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

async function guardarImagen(buffer, contentType, baseUrl) {
  const ext = EXT[contentType];
  if (!ext) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.');
  const name = `${new Date().toISOString().slice(0, 10)}-${id(8)}.${ext}`;
  if (blobConfigured()) {
    const { put } = require('@vercel/blob');
    const r = await put('imagenes/' + name, buffer, { access: 'public', contentType });
    return r.url;
  }
  if (process.env.VERCEL) throw new Error('Para guardar imágenes en Vercel conecta un almacenamiento Blob al proyecto.');
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, name), buffer);
  return `${baseUrl}/uploads/${name}`;
}

module.exports = { guardarImagen, blobConfigured, LOCAL_DIR };
