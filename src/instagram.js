// Instagram vía API oficial de Meta (Graph API).
// - Publicaciones de la cuenta conectada: estadísticas completas (alcance, vistas, guardados...).
// - Publicaciones de otras cuentas Profesionales: datos públicos vía "Business Discovery"
//   (me gusta, comentarios, seguidores de la cuenta) y comparación con su propio promedio.
// Sin token, funciona en modo demostración con datos de ejemplo claramente marcados.
const { kv, col, id } = require('./store');

const posts = col('posts');
const HOST = () => process.env.IG_API_HOST || 'graph.facebook.com';
const VERSION = () => process.env.IG_API_VERSION || 'v23.0';
const configured = () => Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID);

async function api(pathname, params = {}, token = process.env.IG_ACCESS_TOKEN) {
  const url = new URL(`https://${HOST()}/${VERSION()}/${pathname.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const err = new Error(body.error ? body.error.message : `HTTP ${res.status}`);
    err.code = body.error && body.error.code;
    throw err;
  }
  return body;
}

function parseUrl(link) {
  const m = String(link).match(/instagram\.com\/(?:([\w.]+)\/)?(p|reel|reels|tv)\/([\w-]+)/i);
  if (!m) return null;
  const user = m[1] && !['p', 'reel', 'reels', 'tv', 'explore', 'stories'].includes(m[1].toLowerCase()) ? m[1] : null;
  return { shortcode: m[3], username: user, url: `https://www.instagram.com/${m[2] === 'reels' ? 'reel' : m[2]}/${m[3]}/` };
}

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,permalink,shortcode,timestamp,like_count,comments_count,thumbnail_url,media_url';
const PUBLIC_FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url';

async function getAccount() {
  return api(process.env.IG_USER_ID, { fields: 'id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url' });
}

async function listMedia(pages = 6) {
  const out = [];
  let after;
  for (let i = 0; i < pages; i++) {
    const r = await api(`${process.env.IG_USER_ID}/media`, { fields: MEDIA_FIELDS, limit: 50, ...(after ? { after } : {}) });
    out.push(...(r.data || []));
    after = r.paging && r.paging.next && r.paging.cursors ? r.paging.cursors.after : null;
    if (!after) break;
  }
  return out;
}

const POST_METRICS = ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'profile_visits', 'profile_activity', 'follows'];
const REEL_EXTRA = ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];

async function getMediaInsights(media) {
  const reel = media.media_product_type === 'REELS';
  const metrics = [...POST_METRICS.filter(m => !(reel && ['profile_visits', 'profile_activity', 'follows'].includes(m))), ...(reel ? REEL_EXTRA : [])];
  const out = {};
  const read = r => { for (const d of r.data || []) out[d.name] = d.values ? d.values[0].value : (d.total_value ? d.total_value.value : null); };
  try { read(await api(`${media.id}/insights`, { metric: metrics.join(',') })); }
  catch { for (const m of metrics) { try { read(await api(`${media.id}/insights`, { metric: m })); } catch { /* no aplica */ } } }
  return out;
}

async function getComments(mediaId) {
  try { return (await api(`${mediaId}/comments`, { fields: 'id,text,timestamp,like_count,username', limit: 100 })).data || []; }
  catch { return []; }
}

async function getAccountInsights(days = 28) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const out = { totales: {}, seguidoresDiarios: [] };
  const metrics = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps', 'follows_and_unfollows'];
  await Promise.all(metrics.map(async m => {
    try {
      const r = await api(`${process.env.IG_USER_ID}/insights`, { metric: m, period: 'day', metric_type: 'total_value', since, until, ...(m === 'follows_and_unfollows' ? { breakdown: 'follow_type' } : {}) });
      const d = (r.data || [])[0];
      if (!d) return;
      if (m === 'follows_and_unfollows') {
        const res = (d.total_value.breakdowns || [])[0];
        const vals = Object.fromEntries((res ? res.results : []).map(x => [x.dimension_values[0], x.value]));
        out.totales.nuevosSeguidores = vals.FOLLOWER || 0;
        out.totales.dejaronDeSeguir = vals.NON_FOLLOWER || 0;
      } else out.totales[m] = d.total_value ? d.total_value.value : null;
    } catch { /* métrica no disponible */ }
  }));
  try {
    const r = await api(`${process.env.IG_USER_ID}/insights`, { metric: 'follower_count', period: 'day', since: until - 29 * 86400, until });
    out.seguidoresDiarios = ((r.data || [])[0] || { values: [] }).values.map(v => ({ fecha: v.end_time.slice(0, 10), nuevos: v.value }));
  } catch { /* requiere 100+ seguidores */ }
  return out;
}

// Nombre de usuario del autor a partir del enlace (oEmbed oficial de Meta).
async function authorOf(link) {
  const token = process.env.IG_OEMBED_TOKEN || process.env.IG_ACCESS_TOKEN;
  try {
    const r = await api('instagram_oembed', { url: link, fields: 'author_name' }, token);
    return r.author_name || null;
  } catch { return null; }
}

// Datos públicos del perfil de una cuenta profesional (empresa o creador), sin publicaciones.
async function perfilProfesional(username) {
  const u = String(username || '').replace(/^@/, '').replace(/[^\w.]/g, '');
  if (!u) throw new Error('Usuario vacío');
  const r = await api(process.env.IG_USER_ID, { fields: `business_discovery.username(${u}){username,name,biography,website,followers_count,media_count,profile_picture_url}` });
  return r.business_discovery;
}

async function businessDiscovery(username) {
  const r = await api(process.env.IG_USER_ID, {
    fields: `business_discovery.username(${username}){username,name,biography,followers_count,media_count,profile_picture_url,media.limit(50){${PUBLIC_FIELDS}}}`,
  });
  return r.business_discovery;
}

// ---------- Modo demostración ----------
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16) >>> 0) / 4294967296);
}

function demoPost(code) {
  const r = rng(code);
  const reach = Math.round(6000 + r() * 14000);
  const likes = Math.round(reach * (0.05 + r() * 0.05));
  const comments = Math.round(likes * (0.04 + r() * 0.05));
  const shares = Math.round(likes * (0.12 + r() * 0.2));
  const saved = Math.round(likes * (0.08 + r() * 0.12));
  const media = {
    id: 'demo_' + code, shortcode: code, permalink: `https://www.instagram.com/p/${code}/`, media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED',
    caption: '🍇 ¡Llegó la programación oficial de las Ferias y Fiestas de la Uva 2026! (texto de ejemplo)',
    timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), like_count: likes, comments_count: comments,
  };
  const insights = {
    reach, views: Math.round(reach * (1.4 + r() * 0.6)), likes, comments, shares, saved,
    total_interactions: likes + comments + shares + saved, profile_visits: Math.round(reach * (0.02 + r() * 0.03)),
    follows: Math.round(reach * (0.002 + r() * 0.004)),
  };
  const textos = ['¡Allá nos vemos desde Cúcuta! 🍇', 'Qué buena programación 🔥', '¿El concierto del sábado es gratis?', 'Vamos en familia desde Los Patios 😍', '¿A qué hora empieza el desfile?', 'Orgullo rosariense 💜', 'Los esperamos con todo', 'Excelente iniciativa'];
  const commentsList = textos.map((t, i) => ({ id: 'c' + i, text: t, username: 'usuario_demo_' + (i + 1), timestamp: new Date(Date.now() - (i + 1) * 3600000).toISOString(), like_count: Math.round(r() * 12) }));
  return { media, insights, comments: commentsList };
}

function demoAccount() {
  const r = rng('cuenta');
  const seguidoresDiarios = Array.from({ length: 28 }, (_, i) => ({ fecha: new Date(Date.now() - (27 - i) * 86400000).toISOString().slice(0, 10), nuevos: Math.round(20 + r() * 60 + (i > 20 ? 90 : 0)) }));
  const nuevos = seguidoresDiarios.reduce((a, b) => a + b.nuevos, 0);
  return {
    account: { username: 'cuenta_demo', name: 'Cuenta de demostración', followers_count: 18450 + nuevos, follows_count: 312, media_count: 486, biography: 'Cuenta de ejemplo para el modo demostración.' },
    insights: {
      totales: { reach: 84210, views: 211400, accounts_engaged: 9120, total_interactions: 15890, likes: 12010, comments: 860, shares: 1630, saves: 1390, profile_links_taps: 742, nuevosSeguidores: nuevos, dejaronDeSeguir: Math.round(nuevos * 0.18) },
      seguidoresDiarios,
    },
    recientes: Array.from({ length: 12 }, (_, i) => {
      const p = demoPost('DEMO' + i);
      p.media.timestamp = new Date(Date.now() - i * 2.5 * 86400000).toISOString();
      p.media.caption = ['Programación oficial', 'Reina de la uva', 'Concierto central', 'Desfile de comparsas', 'Feria gastronómica', 'Cabalgata'][i % 6] + ' (ejemplo)';
      p.media.media_product_type = i % 3 === 0 ? 'REELS' : 'FEED';
      return { ...p.media, insights: p.insights };
    }),
  };
}

// ---------- Análisis de cualquier publicación ----------
async function analyzeUrl(link, usernameHint = '') {
  const u = parseUrl(link);
  if (!u) throw new Error('El enlace no parece de una publicación de Instagram (debe contener /p/ o /reel/).');
  if (!configured()) return { demo: true, fuente: 'demo', propia: true, url: u.url, shortcode: u.shortcode, ...demoPost(u.shortcode) };

  // 1) ¿Es de la cuenta conectada? -> estadísticas completas
  const mine = await listMedia();
  const m = mine.find(x => x.shortcode === u.shortcode || (x.permalink || '').includes('/' + u.shortcode));
  if (m) {
    const [insights, comments] = await Promise.all([getMediaInsights(m), getComments(m.id)]);
    const otras = mine.filter(x => x.id !== m.id).slice(0, 24);
    return {
      demo: false, fuente: 'propia', propia: true, url: u.url, shortcode: u.shortcode, media: m, insights, comments,
      referencia: { publicaciones: otras.length, promedioMeGusta: avg(otras, 'like_count'), promedioComentarios: avg(otras, 'comments_count') },
    };
  }

  // 2) Otra cuenta profesional -> datos públicos vía Business Discovery
  const username = String(usernameHint || u.username || (await authorOf(u.url)) || '').replace(/^@/, '').trim();
  if (!username) {
    const e = new Error('Esta publicación no es de la cuenta conectada. Escribe el @usuario de la cuenta que la publicó para analizarla con sus datos públicos.');
    e.needUsername = true;
    throw e;
  }
  let bd;
  try { bd = await businessDiscovery(username); }
  catch { throw new Error(`No pude consultar @${username}. Solo se pueden analizar cuentas Profesionales (Empresa o Creador) y públicas.`); }
  const media = ((bd.media && bd.media.data) || []);
  const pm = media.find(x => (x.permalink || '').includes('/' + u.shortcode));
  if (!pm) throw new Error(`La publicación no aparece entre las 50 más recientes de @${username}.`);
  const otras = media.filter(x => x.id !== pm.id);
  return {
    demo: false, fuente: 'publica', propia: false, url: u.url, shortcode: u.shortcode,
    cuenta: { username: bd.username, name: bd.name, followers_count: bd.followers_count, media_count: bd.media_count, profile_picture_url: bd.profile_picture_url },
    media: { ...pm, shortcode: u.shortcode },
    insights: { likes: pm.like_count, comments: pm.comments_count },
    comments: [],
    referencia: {
      publicaciones: otras.length, promedioMeGusta: avg(otras, 'like_count'), promedioComentarios: avg(otras, 'comments_count'),
      serie: media.slice(0, 20).reverse().map(x => ({ t: x.timestamp, likes: x.like_count || 0, comments: x.comments_count || 0, actual: x.id === pm.id })),
    },
  };
}

const avg = (arr, k) => (arr.length ? Math.round(arr.reduce((s, x) => s + (x[k] || 0), 0) / arr.length) : 0);

async function accountOverview(force = false) {
  if (!configured()) return { demo: true, ...demoAccount() };
  if (!force) {
    const c = await kv.get('cache:cuenta');
    if (c) return JSON.parse(c);
  }
  const [account, insights, media] = await Promise.all([getAccount(), getAccountInsights(), listMedia(1)]);
  const recientes = await Promise.all(media.slice(0, 12).map(async m => ({ ...m, insights: await getMediaInsights(m) })));
  const out = { demo: false, account, insights, recientes };
  await kv.set('cache:cuenta', JSON.stringify(out), { ex: 600 });
  await snapshotFollowers(account.followers_count);
  return out;
}

// Registra el número de seguidores (como máximo una vez por hora) para ver el crecimiento real.
async function snapshotFollowers(n) {
  if (!configured()) return;
  if (!(await kv.set('snap:lock', '1', { nx: true, ex: 3300 }))) return;
  const seguidores = n ?? (await getAccount()).followers_count;
  await kv.rpush('seguidores', JSON.stringify({ t: new Date().toISOString(), seguidores }));
  await kv.ltrim('seguidores', -24 * 400, -1);
}
async function followerHistory() { return (await kv.lrange('seguidores', -24 * 60, -1)).map(x => JSON.parse(x)); }

async function savePost(result, etiqueta) {
  const prev = await posts.get(result.shortcode);
  const p = {
    id: result.shortcode, shortcode: result.shortcode, url: result.url, etiqueta: etiqueta || (prev && prev.etiqueta) || '',
    creado: (prev && prev.creado) || new Date().toISOString(), actualizado: new Date().toISOString(),
    demo: result.demo, fuente: result.fuente, propia: result.propia, cuenta: result.cuenta || null,
    media: result.media, insights: result.insights, comments: result.comments, referencia: result.referencia || null,
    ia: prev && prev.ia, error: null,
  };
  await posts.put(p.id, p);
  await kv.rpush('hist:' + p.id, JSON.stringify({ t: p.actualizado, ...p.insights }));
  await kv.ltrim('hist:' + p.id, -500, -1);
  return p;
}
async function history(code) { return (await kv.lrange('hist:' + code, 0, -1)).map(x => JSON.parse(x)); }

async function refreshPosts() {
  for (const p of await posts.all()) {
    try { await savePost(await analyzeUrl(p.url, p.cuenta && p.cuenta.username), p.etiqueta); }
    catch (e) { p.error = e.message; await posts.put(p.id, p); }
  }
}

module.exports = { perfilProfesional, configured, analyzeUrl, accountOverview, snapshotFollowers, followerHistory, savePost, history, refreshPosts, posts, parseUrl, id };
