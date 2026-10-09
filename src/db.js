// Almacenamiento simple en un archivo JSON (suficiente para decenas de miles de contactos).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  contacts: [],
  campaigns: [],
  sends: [],
  posts: [],
  followerSnapshots: [],
  settings: {},
};

fs.mkdirSync(DATA_DIR, { recursive: true });

let data;
try {
  data = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
} catch {
  data = structuredClone(EMPTY);
}

let timer = null;
function save() {
  if (timer) return;
  timer = setTimeout(flush, 300);
}
function flush() {
  clearTimeout(timer);
  timer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, DB_FILE);
}
process.on('exit', () => { if (timer) flush(); });

const id = (n = 12) => crypto.randomBytes(n).toString('base64url');

module.exports = { data, save, flush, id, DATA_DIR };
