// Motor de análisis: convierte métricas en indicadores, hallazgos y recomendaciones
// en lenguaje ejecutivo (claro, sin tecnicismos).

const pct = (a, b) => (b ? +(100 * a / b).toFixed(2) : 0);
const fmt = n => Number(n || 0).toLocaleString('es-CO');

// Rangos de referencia de la industria (orientativos) para cuentas de eventos y entretenimiento.
const REF = {
  engagementAlcance: { bajo: 2, bueno: 5, excelente: 9 },   // interacciones / alcance
  guardados: { bueno: 0.8, excelente: 2 },                    // guardados / alcance
  compartidos: { bueno: 1, excelente: 2.5 },                  // compartidos / alcance
  apertura: { bajo: 15, bueno: 25, excelente: 40 },
  clic: { bajo: 1, bueno: 2.5, excelente: 5 },
};

const nivel = (v, r) => (v >= r.excelente ? 'excelente' : v >= r.bueno ? 'bueno' : r.bajo !== undefined && v < r.bajo ? 'bajo' : 'medio');

const POS = /(gracias|excelente|buen[oa]?|genial|hermos|bell|lind|orgullo|vamos|nos vemos|espera|feliz|amo|encanta|felicit|bravo|top|incre[ií]ble|😍|🔥|💜|❤|👏|🙌|🍇|😊|🥰)/i;
const NEG = /(mal[oa]?|p[eé]sim|horrible|caro|estafa|desorganiz|tarde|aburr|feo|no sirve|queja|robo|insegur|👎|😡|😠)/i;
const PREG = /\?|cu[aá]ndo|d[oó]nde|a qu[eé] hora|cu[aá]nto|precio|gratis|entrada/i;

function sentiment(comments = []) {
  const r = { positivos: 0, neutros: 0, negativos: 0, preguntas: 0, total: comments.length, destacados: [] };
  for (const c of comments) {
    const t = c.text || '';
    if (NEG.test(t)) r.negativos++;
    else if (POS.test(t)) r.positivos++;
    else r.neutros++;
    if (PREG.test(t)) r.preguntas++;
  }
  r.destacados = [...comments].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 5);
  r.indice = r.total ? Math.round(100 * (r.positivos - r.negativos) / r.total) : 0;
  return r;
}

function analyzePost(post, followers = 0) {
  const i = post.insights || {};
  const m = post.media || {};
  const likes = i.likes ?? m.like_count ?? 0;
  const comments = i.comments ?? m.comments_count ?? 0;
  const inter = i.total_interactions ?? (likes + comments + (i.shares || 0) + (i.saved || 0));
  const reach = i.reach || 0;
  const k = {
    alcance: reach,
    vistas: i.views || 0,
    meGusta: likes,
    comentarios: comments,
    compartidos: i.shares || 0,
    guardados: i.saved || 0,
    interacciones: inter,
    visitasPerfil: i.profile_visits || 0,
    nuevosSeguidores: i.follows || 0,
    engagementAlcance: pct(inter, reach),
    engagementSeguidores: pct(inter, followers),
    tasaGuardado: pct(i.saved || 0, reach),
    tasaCompartido: pct(i.shares || 0, reach),
    frecuencia: reach ? +((i.views || 0) / reach).toFixed(2) : 0,
    alcanceVsSeguidores: pct(reach, followers),
    conversionSeguidores: pct(i.follows || 0, reach),
  };
  const s = sentiment(post.comments);

  // Puntaje de impacto 0-100 ponderado.
  const cap = (v, max) => Math.min(1, v / max);
  const score = Math.round(100 * (
    0.35 * cap(k.engagementAlcance, 10) +
    0.20 * cap(k.tasaCompartido, 3) +
    0.15 * cap(k.tasaGuardado, 2.5) +
    0.20 * cap(k.alcanceVsSeguidores || 50, 120) +
    0.10 * ((s.indice + 100) / 200)
  ));

  const hallazgos = [];
  const recomendaciones = [];
  const nEng = nivel(k.engagementAlcance, REF.engagementAlcance);
  hallazgos.push(`La publicación llegó a ${fmt(reach)} cuentas y generó ${fmt(inter)} interacciones. Eso es una tasa de interacción del ${k.engagementAlcance}%, un resultado ${nEng} frente a la referencia del sector (2% a 5%).`);
  if (followers && reach) {
    hallazgos.push(k.alcanceVsSeguidores >= 100
      ? `El contenido superó la propia comunidad: llegó a ${k.alcanceVsSeguidores}% del tamaño de la base de seguidores, señal de que se está moviendo fuera de la cuenta.`
      : `El alcance equivale al ${k.alcanceVsSeguidores}% de los seguidores; aún hay espacio para llegar a más personas de la comunidad.`);
  }
  if (k.compartidos) hallazgos.push(`${fmt(k.compartidos)} personas la compartieron (${k.tasaCompartido}% del alcance). Compartir es la señal más fuerte de intención de asistir y de recomendación.`);
  if (k.guardados) hallazgos.push(`${fmt(k.guardados)} personas la guardaron para consultarla después: la programación se está usando como agenda de referencia.`);
  if (k.nuevosSeguidores) hallazgos.push(`La publicación trajo ${fmt(k.nuevosSeguidores)} seguidores nuevos y ${fmt(k.visitasPerfil)} visitas al perfil.`);
  if (s.total) hallazgos.push(`De ${s.total} comentarios analizados, ${s.positivos} son positivos, ${s.negativos} negativos y ${s.preguntas} son preguntas del público (índice de sentimiento ${s.indice > 0 ? '+' : ''}${s.indice}).`);

  if (nEng === 'bajo' || nEng === 'medio') recomendaciones.push('Reforzar el mensaje con video corto (reel) de 15 a 30 segundos mostrando el ambiente de la feria; los reels suelen duplicar el alcance de una imagen fija.');
  if (k.tasaCompartido < REF.compartidos.bueno) recomendaciones.push('Invitar de forma explícita a compartir: "Etiqueta a con quién vas a la feria". Esto multiplica el alcance orgánico.');
  if (k.tasaGuardado < REF.guardados.bueno) recomendaciones.push('Agregar al pie de foto un llamado a guardar ("Guárdala para no perderte ningún evento").');
  if (s.preguntas) recomendaciones.push(`Responder las ${s.preguntas} preguntas pendientes en comentarios en menos de 2 horas: mejora la visibilidad de la publicación y la percepción de la organización.`);
  if (s.negativos) recomendaciones.push('Atender los comentarios negativos de forma pública y cordial, y llevar el detalle a mensaje directo.');
  recomendaciones.push('Publicar historias diarias con cuenta regresiva y enlace a esta publicación durante los días de la feria.');
  recomendaciones.push('Repetir el contenido de mejor rendimiento en horario de mayor actividad (entre 6:00 p. m. y 9:00 p. m.).');

  return { kpis: k, sentimiento: s, score, nivel: nEng, hallazgos, recomendaciones };
}

function analyzeEmail(st) {
  const hallazgos = [];
  const recomendaciones = [];
  if (!st || !st.enviados) return { hallazgos: ['Aún no hay correos enviados para analizar.'], recomendaciones: [] };
  const nAp = nivel(st.tasaApertura, REF.apertura);
  const nCl = nivel(st.tasaClic, REF.clic);
  hallazgos.push(`Se enviaron ${fmt(st.enviados)} correos con una tasa de entrega del ${st.tasaEntrega}%.`);
  hallazgos.push(`${fmt(st.abiertos)} personas abrieron el correo (${st.tasaApertura}%, nivel ${nAp}) y ${fmt(st.clics)} tocaron el botón para ver la programación (${st.tasaClic}%, nivel ${nCl}).`);
  if (st.abiertos) hallazgos.push(`De quienes abrieron, el ${st.ctor}% hizo clic: mide qué tan convincente fue el mensaje y el botón.`);
  if (st.bajas) hallazgos.push(`${fmt(st.bajas)} personas pidieron no recibir más correos (${st.tasaBaja}%).`);
  if (nAp !== 'excelente') recomendaciones.push('Probar asuntos más cortos, con el nombre de la persona y un beneficio concreto (ej.: "Juan, mira quién canta el sábado").');
  if (nCl !== 'excelente') recomendaciones.push('Mostrar en el correo un dato atractivo de la programación (artista principal o evento gratuito) para motivar el clic.');
  if (st.rebotes) recomendaciones.push(`Limpiar los ${st.rebotes} correos que rebotaron para proteger la reputación del remitente.`);
  recomendaciones.push('Enviar un recordatorio solo a quienes no abrieron, 48 horas después, con un asunto distinto.');
  return { hallazgos, recomendaciones, nivelApertura: nAp, nivelClic: nCl, nota: 'La tasa de apertura es aproximada: algunos lectores de correo (como Apple Mail) cargan imágenes automáticamente o las bloquean. El clic es la métrica más confiable.' };
}

function analyzeAccount(ov) {
  const a = ov.account || {};
  const t = (ov.insights && ov.insights.totales) || {};
  const rec = ov.recientes || [];
  const followers = a.followers_count || 0;
  const posts = rec.map(p => ({ ...p, analisis: analyzePost({ media: p, insights: p.insights }, followers) }));
  const top = [...posts].sort((x, y) => y.analisis.score - x.analisis.score);
  const avg = k => (posts.length ? +(posts.reduce((s, p) => s + (p.analisis.kpis[k] || 0), 0) / posts.length).toFixed(2) : 0);
  const reels = posts.filter(p => p.media_product_type === 'REELS');
  const feed = posts.filter(p => p.media_product_type !== 'REELS');
  const avgOf = (arr, k) => (arr.length ? Math.round(arr.reduce((s, p) => s + (p.analisis.kpis[k] || 0), 0) / arr.length) : 0);
  const netos = (t.nuevosSeguidores || 0) - (t.dejaronDeSeguir || 0);

  const hallazgos = [];
  hallazgos.push(`La cuenta tiene ${fmt(followers)} seguidores. En los últimos 28 días llegó a ${fmt(t.reach)} cuentas y sumó ${fmt(t.total_interactions)} interacciones.`);
  if (t.nuevosSeguidores !== undefined) hallazgos.push(`Crecimiento real: ${fmt(t.nuevosSeguidores)} seguidores nuevos y ${fmt(t.dejaronDeSeguir)} que dejaron de seguir, para un crecimiento neto de ${netos >= 0 ? '+' : ''}${fmt(netos)}.`);
  if (posts.length) hallazgos.push(`En las últimas ${posts.length} publicaciones, la tasa de interacción promedio es ${avg('engagementAlcance')}% sobre el alcance.`);
  if (reels.length && feed.length) {
    const rr = avgOf(reels, 'alcance'), fr = avgOf(feed, 'alcance');
    hallazgos.push(`Los reels alcanzan en promedio ${fmt(rr)} cuentas frente a ${fmt(fr)} de las publicaciones de imagen o carrusel (${fr ? (rr / fr).toFixed(1) : '-'} veces).`);
  }
  if (top[0]) hallazgos.push(`La publicación con mejor desempeño fue "${(top[0].caption || '').slice(0, 70)}" con un puntaje de impacto de ${top[0].analisis.score}/100.`);
  const recomendaciones = [
    reels.length && feed.length && avgOf(reels, 'alcance') > avgOf(feed, 'alcance') ? 'Darle prioridad a los reels durante la feria: son el formato que más personas nuevas trae.' : 'Probar más reels cortos para ampliar el alcance hacia personas que aún no siguen la cuenta.',
    'Publicar al menos una pieza diaria durante la feria y reforzar con historias en tiempo real.',
    'Fijar en el perfil la publicación de la programación para que todo visitante la encuentre primero.',
    'Responder comentarios y mensajes rápido: la conversación sostiene el alcance de las publicaciones.',
  ];
  return { followers, totales: t, netos, posts, top: top.slice(0, 5), promedioEngagement: avg('engagementAlcance'), hallazgos, recomendaciones };
}

module.exports = { analyzePost, analyzeEmail, analyzeAccount, sentiment, REF };
