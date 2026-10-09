// Almacenamiento: Upstash Redis en producción (Vercel) y archivo JSON local en desarrollo.
// Todas las funciones son asíncronas y guardan los objetos como texto JSON.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const id = (n = 12) => crypto.randomBytes(n).toString('base64url');
const parse = v => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);

// Busca las credenciales de Upstash con cualquier prefijo (KV_, STORAGE_, UPSTASH_REDIS_...).
function credencialesRedis() {
  const e = process.env;
  if (e.KV_REST_API_URL && e.KV_REST_API_TOKEN) return [e.KV_REST_API_URL, e.KV_REST_API_TOKEN];
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(e)) {
    const m = k.match(/^(.*)_REST_API_URL$/) || k.match(/^(.*)_REDIS_REST_URL$/);
    if (!m) continue;
    const token = e[m[1] + '_REST_API_TOKEN'] || e[m[1] + '_REDIS_REST_TOKEN'];
    if (token && /^https:\/\//.test(e[k])) return [e[k], token];
  }
  return [null, null];
}
const [REDIS_URL, REDIS_TOKEN] = credencialesRedis();

// Redis clásico (redis:// o rediss://), como el que crea Vercel con "Redis" (Redis Cloud): KV_REDIS_URL, REDIS_URL...
function urlRedisTcp() {
  const e = process.env;
  if (e.KV_REDIS_URL) return e.KV_REDIS_URL;
  if (e.REDIS_URL) return e.REDIS_URL;
  const k = Object.keys(e).find(n => /REDIS_URL$/.test(n) && /^rediss?:\/\//.test(e[n]));
  return k ? e[k] : null;
}

function redisTcpBackend(url) {
  const Redis = require('ioredis');
  const r = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 8000, enableReadyCheck: false });
  r.on('error', e => console.error('[redis]', e.message));
  const P = process.env.REDIS_PREFIX || 'bio:';
  return {
    kind: 'redis',
    async hget(k, f) { return r.hget(P + k, f); },
    async hgetall(k) { return (await r.hgetall(P + k)) || {}; },
    async hset(k, obj) { if (Object.keys(obj).length) await r.hset(P + k, obj); },
    async hdel(k, f) { await r.hdel(P + k, f); },
    async hincrby(k, f, n) { return r.hincrby(P + k, f, n); },
    async hlen(k) { return r.hlen(P + k); },
    async get(k) { return r.get(P + k); },
    async set(k, v, opts = {}) {
      const args = [P + k, v];
      if (opts.ex) args.push('EX', opts.ex);
      if (opts.nx) args.push('NX');
      return (await r.set(...args)) === 'OK';
    },
    async del(k) { await r.del(P + k); },
    async incr(k, ex) { const n = await r.incr(P + k); if (ex && n === 1) await r.expire(P + k, ex); return n; },
    async rpush(k, ...vals) { if (vals.length) await r.rpush(P + k, ...vals); },
    async lpop(k) { return r.lpop(P + k); },
    async llen(k) { return r.llen(P + k); },
    async lrange(k, a, b) { return r.lrange(P + k, a, b); },
    async ltrim(k, a, b) { await r.ltrim(P + k, a, b); },
  };
}

function redisBackend() {
  const { Redis } = require('@upstash/redis');
  const r = new Redis({ url: REDIS_URL, token: REDIS_TOKEN, automaticDeserialization: false });
  const P = process.env.REDIS_PREFIX || 'bio:';
  return {
    kind: 'redis',
    async hget(k, f) { return r.hget(P + k, f); },
    async hgetall(k) { return (await r.hgetall(P + k)) || {}; },
    async hset(k, obj) { if (Object.keys(obj).length) await r.hset(P + k, obj); },
    async hdel(k, f) { await r.hdel(P + k, f); },
    async hincrby(k, f, n) { return r.hincrby(P + k, f, n); },
    async hlen(k) { return r.hlen(P + k); },
    async get(k) { return r.get(P + k); },
    async set(k, v, opts = {}) {
      const o = {};
      if (opts.ex) o.ex = opts.ex;
      if (opts.nx) o.nx = true;
      return (await r.set(P + k, v, o)) === 'OK';
    },
    async del(k) { await r.del(P + k); },
    async incr(k, ex) { const n = await r.incr(P + k); if (ex && n === 1) await r.expire(P + k, ex); return n; },
    async rpush(k, ...vals) { if (vals.length) await r.rpush(P + k, ...vals); },
    async lpop(k) { return r.lpop(P + k); },
    async llen(k) { return r.llen(P + k); },
    async lrange(k, a, b) { return r.lrange(P + k, a, b); },
    async ltrim(k, a, b) { await r.ltrim(P + k, a, b); },
  };
}

function fileBackend() {
  // En Vercel solo se puede escribir en /tmp (temporal): sirve para arrancar, pero conviene conectar Redis.
  const dir = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/bioanaliticas' : path.join(__dirname, '..', 'data'));
  const file = path.join(dir, 'store.json');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { console.error('[store] sin carpeta de datos:', e.message); }
  let db = { h: {}, s: {}, l: {}, exp: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* base nueva */ }
  let t = null;
  const flush = () => {
    t = null;
    try { fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); }
    catch (e) { console.error('[store] no se pudo guardar:', e.message); }
  };
  const save = () => { if (!t) t = setTimeout(flush, 200); };
  const alive = k => { if (db.exp[k] && db.exp[k] < Date.now()) { delete db.s[k]; delete db.exp[k]; } return k in db.s; };
  const H = k => (db.h[k] ||= {});
  const L = k => (db.l[k] ||= []);
  return {
    kind: 'archivo',
    async hget(k, f) { return H(k)[f] ?? null; },
    async hgetall(k) { return { ...H(k) }; },
    async hset(k, obj) { Object.assign(H(k), Object.fromEntries(Object.entries(obj).map(([a, b]) => [a, String(b)]))); save(); },
    async hdel(k, f) { delete H(k)[f]; save(); },
    async hincrby(k, f, n) { const v = Number(H(k)[f] || 0) + n; H(k)[f] = String(v); save(); return v; },
    async hlen(k) { return Object.keys(H(k)).length; },
    async get(k) { return alive(k) ? db.s[k] : null; },
    async set(k, v, opts = {}) {
      if (opts.nx && alive(k)) return false;
      db.s[k] = String(v);
      if (opts.ex) db.exp[k] = Date.now() + opts.ex * 1000; else delete db.exp[k];
      save();
      return true;
    },
    async del(k) { delete db.s[k]; delete db.h[k]; delete db.l[k]; save(); },
    async incr(k, ex) { const n = Number(alive(k) ? db.s[k] : 0) + 1; db.s[k] = String(n); if (ex && n === 1) db.exp[k] = Date.now() + ex * 1000; save(); return n; },
    async rpush(k, ...vals) { L(k).push(...vals.map(String)); save(); },
    async lpop(k) { const v = L(k).shift(); save(); return v ?? null; },
    async llen(k) { return L(k).length; },
    async lrange(k, a, b) { const l = L(k); return l.slice(a < 0 ? Math.max(0, l.length + a) : a, b < 0 ? l.length + b + 1 : b + 1); },
    async ltrim(k, a, b) { db.l[k] = await this.lrange(k, a, b); save(); },
  };
}

const TCP_URL = urlRedisTcp();
const kv = REDIS_URL && REDIS_TOKEN ? redisBackend() : TCP_URL ? redisTcpBackend(TCP_URL) : fileBackend();

// Colecciones de objetos (hash de id -> JSON).
const col = name => ({
  async all() { return Object.values(await kv.hgetall(name)).map(parse); },
  async get(key) { return parse(await kv.hget(name, key)); },
  async put(key, obj) { await kv.hset(name, { [key]: JSON.stringify(obj) }); return obj; },
  async putMany(map) {
    const entries = Object.entries(map);
    for (let i = 0; i < entries.length; i += 400) {
      await kv.hset(name, Object.fromEntries(entries.slice(i, i + 400).map(([k, v]) => [k, JSON.stringify(v)])));
    }
  },
  async del(key) { await kv.hdel(name, key); },
  async count() { return kv.hlen(name); },
});

module.exports = { kv, col, id, parse };
