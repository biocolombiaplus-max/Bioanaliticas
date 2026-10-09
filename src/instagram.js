// Conexión con la API oficial de Instagram (Graph API). Requiere una cuenta Profesional
// (Empresa o Creador) y un token de acceso. Sin token, funciona en modo demostración.
const { data, save, id } = require('./db');

const HOST = () => process.env.IG_API_HOST || 'graph.facebook.com';
const VERSION = () => process.env.IG_API_VERSION || 'v23.0';
const configured = () => Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID);

async function api(pathname, params = {}) {
  const url = new URL(`https://${HOST()}/${VERSION()}/${pathname.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', process.env.IG_ACCESS_TOKEN);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error ? body.error.message : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = body.error && body.error.code;
    throw err;
  }
  return body;
}

function shortcodeFromUrl(link) {
  const m = String(link).match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i);
  return m ? m[1] : null;
}

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,permalink,shortcode,timestamp,like_count,comments_count,thumbnail_url,media_url';

async function getAccount() {
  return api(process.env.IG_USER_ID, { fields: 'id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url' });
}

async function listMedia(limitPages = 8) {
  const out = [];
  let after;
  for (let i = 0; i < limitPages; i++) {
    const params = { fields: MEDIA_FIELDS, limit: 50 };
    if (after) params.after = after;
    const r = await api(`${process.env.IG_USER_ID}/media`, params);
    out.push(...(r.data || []));
    after = r.paging && r.paging.cursors && r.paging.next ? r.paging.cursors.after : null;
    if (!after) break;
  }
  return out;
}

async function findMedia(link) {
  const code = shortcodeFromUrl(link);
  if (!code) throw new Error('El enlace no parece de una publicación de Instagram (debe contener /p/ o /reel/).');
  const media = await listMedia();
  const m = media.find(x => x.shortcode === code || (x.permalink || '').includes(`/${code}`));
  if (!m) throw new Error('No encontré esa publicación en la cuenta conectada. La API solo entrega estadísticas de publicaciones de tu propia cuenta.');
  return m;
}

const POST_METRICS = ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'profile_visits', 'profile_activity', 'follows'];
const REEL_EXTRA = ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];

async function getMediaInsights(media) {
  const metrics = [...POST_METRICS, ...(media.media_product_type === 'REELS' ? REEL_EXTRA : [])]
    .filter(m => !(media.media_product_type === 'REELS' && ['profile_visits', 'profile_activity', 'follows'].includes(m)));
  const out = {};
  const read = r => { for (const d of r.data || []) out[d.name] = d.values ? d.values[0].value : (d.total_value ? d.total_value.value : null); };
  try {
    read(await api(`${media.id}/insights`, { metric: metrics.join(',') }));
  } catch {
    // Algunas métricas no aplican a todos los tipos de publicación: se piden una por una.
    for (const m of metrics) { try { read(await api(`${media.id}/insights`, { metric: m })); } catch { /* no disponible */ } }
  }
  return out;
}

async function getComments(mediaId) {
  try {
    const r = await api(`${mediaId}/comments`, { fields: 'id,text,timestamp,like_count,username', limit: 100 });
    return r.data || [];
  } catch { return []; }
}

async function getAccountInsights(days = 28) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const out = { totales: {}, seguidoresDiarios: [] };
  const metrics = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps', 'follows_and_unfollows'];
  for (const m of metrics) {
    try {
      const r = await api(`${process.env.IG_USER_ID}/insights`, { metric: m, period: 'day', metric_type: 'total_value', since, until, ...(m === 'follows_and_unfollows' ? { breakdown: 'follow_type' } : {}) });
      const d = (r.data || [])[0];
      if (!d) continue;
      if (m === 'follows_and_unfollows') {
        const res = (d.total_value.breakdowns || [])[0];
        const vals = Object.fromEntries((res ? res.results : []).map(x => [x.dimension_values[0], x.value]));
        out.totales.nuevosSeguidores = vals.FOLLOWER || 0;
        out.totales.dejaronDeSeguir = vals.NON_FOLLOWER || 0;
      } else out.totales[m] = d.total_value ? d.total_value.value : null;
    } catch { /* métrica no disponible para esta cuenta */ }
  }
  try {
    const r = await api(`${process.env.IG_USER_ID}/insights`, { metric: 'follower_count', period: 'day', since: until - 29 * 86400, until });
    out.seguidoresDiarios = ((r.data || [])[0] || { values: [] }).values.map(v => ({ fecha: v.end_time.slice(0, 10), nuevos: v.value }));
  } catch { /* requiere 100+ seguidores */ }
  return out;
}

// ---------- Modo demostración (datos de ejemplo, claramente marcados) ----------
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16) >>> 0) / 4294967296);
}

function demoPost(link) {
  const code = shortcodeFromUrl(link) || 'demo';
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
  const textos = ['¡Allá nos vemos! 🍇', 'Qué buena programación 🔥', '¿El concierto del sábado es gratis?', 'Vamos en familia 😍', '¿A qué hora empieza el desfile?', 'Orgullo rosariense 💜', 'Los esperamos con todo', 'Excelente iniciativa'];
  const commentsList = textos.map((t, i) => ({ id: 'c' + i, text: t, username: 'usuario_demo_' + (i + 1), timestamp: new Date(Date.now() - (i + 1) * 3600000).toISOString(), like_count: Math.round(r() * 12) }));
  return { media, insights, comments: commentsList };
}

function demoAccount() {
  const r = rng('cuenta');
  const base = 18450;
  const seguidoresDiarios = Array.from({ length: 28 }, (_, i) => ({ fecha: new Date(Date.now() - (27 - i) * 86400000).toISOString().slice(0, 10), nuevos: Math.round(20 + r() * 60 + (i > 20 ? 90 : 0)) }));
  const nuevos = seguidoresDiarios.reduce((a, b) => a + b.nuevos, 0);
  return {
    account: { username: 'feriasdelauva_demo', name: 'Ferias y Fiestas de la Uva (DEMO)', followers_count: base + nuevos, follows_count: 312, media_count: 486, biography: 'Cuenta de ejemplo para el modo demostración.' },
    insights: {
      totales: { reach: 84210, views: 211400, accounts_engaged: 9120, total_interactions: 15890, likes: 12010, comments: 860, shares: 1630, saves: 1390, profile_links_taps: 742, nuevosSeguidores: nuevos, dejaronDeSeguir: Math.round(nuevos * 0.18) },
      seguidoresDiarios,
    },
    recientes: Array.from({ length: 12 }, (_, i) => {
      const p = demoPost('https://www.instagram.com/p/DEMO' + i + '/');
      p.media.timestamp = new Date(Date.now() - i * 2.5 * 86400000).toISOString();
      p.media.caption = ['Programación oficial', 'Reina de la uva', 'Concierto central', 'Desfile de comparsas', 'Feria gastronómica', 'Cabalgata'][i % 6] + ' (ejemplo)';
      p.media.media_product_type = i % 3 === 0 ? 'REELS' : 'FEED';
      return { ...p.media, insights: p.insights };
    }),
  };
}

// ---------- Funciones principales usadas por el servidor ----------
async function analyzePost(link) {
  if (!configured()) return { demo: true, ...demoPost(link) };
  const media = await findMedia(link);
  const [insights, comments] = await Promise.all([getMediaInsights(media), getComments(media.id)]);
  return { demo: false, media, insights, comments };
}

async function accountOverview() {
  if (!configured()) return { demo: true, ...demoAccount() };
  const [account, insights, media] = await Promise.all([getAccount(), getAccountInsights(), listMedia(1)]);
  const recientes = [];
  for (const m of media.slice(0, 12)) recientes.push({ ...m, insights: await getMediaInsights(m) });
  return { demo: false, account, insights, recientes };
}

// Guarda el número de seguidores cada hora para medir el crecimiento real en el tiempo.
async function snapshotFollowers() {
  if (!configured()) return;
  try {
    const a = await getAccount();
    data.followerSnapshots.push({ t: new Date().toISOString(), seguidores: a.followers_count });
    if (data.followerSnapshots.length > 24 * 400) data.followerSnapshots.splice(0, data.followerSnapshots.length - 24 * 400);
    save();
  } catch (e) { console.error('[instagram] No se pudo registrar seguidores:', e.message); }
}

// Actualiza las métricas de las publicaciones registradas (guarda su evolución).
async function refreshPosts() {
  for (const p of data.posts) {
    try {
      const r = await analyzePost(p.url);
      Object.assign(p, { demo: r.demo, media: r.media, insights: r.insights, comments: r.comments, actualizado: new Date().toISOString(), error: null });
      p.historial = p.historial || [];
      p.historial.push({ t: p.actualizado, ...r.insights });
      if (p.historial.length > 2000) p.historial.splice(0, p.historial.length - 2000);
    } catch (e) { p.error = e.message; }
  }
  save();
}

function addPost(url, etiqueta = '') {
  const code = shortcodeFromUrl(url);
  if (!code) throw new Error('El enlace no parece de una publicación de Instagram (debe contener /p/ o /reel/).');
  let p = data.posts.find(x => x.shortcode === code);
  if (!p) {
    p = { id: id(8), shortcode: code, url: url.split('?')[0], etiqueta, creado: new Date().toISOString(), historial: [] };
    data.posts.push(p);
    save();
  }
  return p;
}

module.exports = { configured, analyzePost, accountOverview, snapshotFollowers, refreshPosts, addPost, shortcodeFromUrl };
