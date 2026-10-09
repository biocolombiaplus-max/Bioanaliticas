/* Informe ejecutivo (publicación, cuenta de Instagram, campaña de correo): hojas carta estilo tablero. */
const nf = n => Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { violet: '#4a43b0', orange: '#e0661f', blue: '#2a8fb3', green: '#5a9e32', grape: '#9a5bd0', grid: '#eceaf6', soft: '#f3f1fb', muted: '#cfcde0' };
const q = new URLSearchParams(location.search);
const tipo = q.get('tipo') || 'integral';
const fechaLarga = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

if (window.Chart) {
  Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
  Chart.defaults.font.size = 9.5;
  Chart.defaults.color = '#55537a';
  Chart.defaults.animation = false;
  Chart.defaults.responsive = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.devicePixelRatio = 3;
}
const axes = () => ({ x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: C.grid }, border: { display: false }, ticks: { callback: v => nf(v), maxTicksLimit: 6 } } });
const k = (l, v, s, a) => `<div class="k" style="--a:${a}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
// Cada punto de una lista es un bloque: si la lista es larga, continúa en la hoja siguiente sin partir un punto.
const puntos = (items, cls = '') => items.map(i => `<ul class="f ${cls}"><li>${esc(i)}</li></ul>`);
const sec = (n, t, p) => `<div class="sep"><div class="sec"><span class="n">${n}</span><div><h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div></div></div>`;
const caja = (id, titulo, extra = '') => `<div class="box ch"><h3>${titulo}${extra ? ` <small>${extra}</small>` : ''}</h3><div class="cv"><canvas id="${id}"></canvas></div></div>`;

let ORG = 'Alcaldía de Villa del Rosario';
const later = [];
const grafico = (id, cfg) => later.push(() => new Chart(HC.lienzo(id), cfg));
// Escribe el número al final de cada barra.
const valores = { id: 'valores', afterDatasetsDraw(ch) {
  const { ctx } = ch, horiz = ch.options.indexAxis === 'y';
  ctx.save(); ctx.font = "600 9.5px Poppins, sans-serif"; ctx.fillStyle = '#1f1d3d';
  ch.getDatasetMeta(0).data.forEach((bar, i) => {
    const v = ch.data.datasets[0].data[i]; if (!v) return;
    if (horiz) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nf(v), bar.x + 5, bar.y); }
    else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(nf(v), bar.x, bar.y - 3); }
  });
  ctx.restore(); } };

function gauge(id, score) {
  grafico(id, { type: 'doughnut', data: { datasets: [{ data: [score, 100 - score], backgroundColor: [score >= 70 ? C.green : score >= 45 ? C.orange : '#c0392b', '#e7e5f3'], borderWidth: 0, borderRadius: 6 }] }, options: { cutout: '80%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
  return `<div class="gauge"><canvas id="${id}"></canvas><div class="t"><div><b>${score}</b><span>de 100<br>puntaje de impacto</span></div></div></div>`;
}
function verdict(score) {
  if (score >= 75) return 'Impacto sobresaliente: el contenido está movilizando a la comunidad.';
  if (score >= 55) return 'Buen impacto: el mensaje conecta y hay margen claro para crecer.';
  if (score >= 35) return 'Impacto moderado: el contenido se ve, pero aún no genera suficiente conversación.';
  return 'Impacto bajo: conviene ajustar formato, mensaje y horario de publicación.';
}

let NOMBRE = 'Informe.pdf';
async function main() {
  const p = new URLSearchParams();
  if (q.get('post')) p.set('post', q.get('post'));
  if (q.get('campana')) p.set('campana', q.get('campana'));
  const r = await fetch('/api/informe?' + p);
  if (r.status === 401) return (location.href = '/#ingresar');
  const d = await r.json();
  ORG = d.organizacion || ORG;
  const pub = d.publicacion, camp = d.campana, cta = d.cuenta;
  const showPost = pub && ['post', 'integral'].includes(tipo);
  const showMail = camp && ['correo', 'integral', 'post'].includes(tipo);
  const showAcc = cta && ['cuenta', 'integral'].includes(tipo);
  const demo = (showPost && pub.demo) || (showAcc && cta.demo);

  const titulos = { post: 'Impacto de la publicación', cuenta: 'Desempeño de la cuenta de Instagram', correo: 'Resultados de la campaña de correo', integral: 'Informe integral de impacto digital' };
  const subt = showPost ? esc(pub.etiqueta || (pub.media && pub.media.caption || '').slice(0, 90)) : showMail ? esc(camp.nombre) : cta ? '@' + esc(cta.account.username) : '';
  NOMBRE = `${(titulos[tipo] || titulos.integral).replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;

  // Cifras de portada y del tablero.
  const score = showPost ? pub.analisis.score : showAcc && cta.analisis.posts.length ? Math.round(cta.analisis.posts.reduce((s, x) => s + x.analisis.score, 0) / cta.analisis.posts.length) : null;
  const portada = [];
  if (score !== null) portada.push([score, 'puntaje de impacto (de 100)']);
  if (showPost && pub.fuente === 'publica') portada.push([nf(pub.analisis.kpis.meGusta), 'me gusta'], [pub.analisis.kpis.engagementSeguidores + '%', 'de interacción']);
  else if (showPost) portada.push([nf(pub.analisis.kpis.alcance), 'cuentas alcanzadas'], [nf(pub.analisis.kpis.interacciones), 'interacciones']);
  if (showAcc) portada.push([nf(cta.account.followers_count), 'seguidores'], [nf(cta.insights.totales.reach), 'cuentas alcanzadas en 28 días']);
  if (showMail) portada.push([nf(camp.stats.enviados), 'correos enviados'], [nf(camp.stats.clics), 'clics al botón']);

  const doc = document.getElementById('doc');
  doc.innerHTML = `<section class="page cover"><div class="bg"></div><div class="c1"></div><div class="c2"></div><div class="c3"></div>
    <div class="in"><img class="logo" src="/img/logo.png" alt="Ferias y Fiestas de la Uva 2026">
      <div class="kick">Oficina de Prensa · Informe ejecutivo</div>
      <h1>${titulos[tipo] || titulos.integral}</h1>
      ${subt ? `<div class="per">${subt}</div>` : ''}
      <div class="hero">${portada.slice(0, 3).map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <div class="meta"><div>Fecha<b>${fechaLarga}</b></div><div>Entidad<b>${esc(ORG)}</b></div><div>Preparado por<b>Oficina de Prensa</b></div></div>
    </div><div class="bandas"></div></section>`;

  const B = [];
  let n = 0;
  const num = () => String(++n).padStart(2, '0');

  // ---------- Resumen ejecutivo ----------
  const kp = [];
  if (showPost && pub.fuente === 'publica') { const x = pub.analisis.kpis; kp.push(k('Me gusta', nf(x.meGusta), x.vsPromedioMeGusta ? `${x.vsPromedioMeGusta}× el promedio de la cuenta` : '', C.violet), k('Interacción', x.engagementSeguidores + '%', 'Sobre los seguidores de @' + esc(pub.cuenta.username), C.orange)); }
  else if (showPost) { const x = pub.analisis.kpis; kp.push(k('Alcance', nf(x.alcance), 'Cuentas únicas', C.violet), k('Interacciones', nf(x.interacciones), `${x.engagementAlcance}% del alcance`, C.orange)); }
  if (showMail) { const s = camp.stats; kp.push(k('Correos enviados', nf(s.enviados), `${s.tasaEntrega}% entregados`, C.blue), k('Clics al botón', nf(s.clics), `${s.tasaClic}% de los enviados`, C.orange)); }
  if (cta && (showAcc || (showPost && pub.fuente !== 'publica'))) { const t = cta.insights.totales; kp.push(k('Seguidores', nf(cta.account.followers_count), `${cta.analisis.netos >= 0 ? '+' : ''}${nf(cta.analisis.netos)} netos en 28 días`, C.grape), k('Alcance de la cuenta', nf(t.reach), 'Últimos 28 días', C.green)); }
  const destacados = [...(showPost ? pub.analisis.hallazgos.slice(0, 3) : []), ...(showMail ? camp.analisis.hallazgos.slice(1, 3) : []), ...(showAcc ? cta.analisis.hallazgos.slice(0, 3) : [])].slice(0, 6);
  B.push(sec(num(), 'Resumen ejecutivo', 'Lo más importante en una página') + (demo ? '<div class="demo" style="margin-bottom:4mm">Este informe contiene <b>datos de demostración</b> porque Instagram aún no está conectado. Las cifras de Instagram son de ejemplo.</div>' : '')
    + (score !== null ? `<div class="hero">${gauge('g1', score)}<div><p class="verdict">${verdict(score)}</p><p style="margin:0;color:var(--ink2)">El puntaje combina la tasa de interacción, la capacidad de ser compartido y guardado, el alcance frente a la comunidad y el tono de los comentarios.</p></div></div>` : ''));
  if (kp.length) B.push(`<div class="grid g${Math.min(4, kp.length)}" style="margin-top:4mm">${kp.slice(0, 8).join('')}</div>`);
  puntos(destacados).forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Hallazgos clave</h3>' + h));

  // ---------- Publicación ----------
  if (showPost && pub.fuente === 'publica') {
    const a = pub.analisis, x = a.kpis, m = pub.media || {};
    const serie = (pub.referencia && pub.referencia.serie) || [];
    B.push(sec(num(), 'Análisis de la publicación') + `<p class="lead2">@${esc(pub.cuenta.username)} · ${esc((m.caption || '').slice(0, 130))}<br>Publicada el ${m.timestamp ? new Date(m.timestamp).toLocaleDateString('es-CO', { dateStyle: 'long' }) : '—'} · <a href="${esc(pub.url)}">${esc(pub.url)}</a></p>
      <div class="grid g4">${k('Me gusta', nf(x.meGusta), x.vsPromedioMeGusta ? `${x.vsPromedioMeGusta}× el promedio` : '', C.grape)}${k('Comentarios', nf(x.comentarios), x.vsPromedioComentarios ? `${x.vsPromedioComentarios}× el promedio` : '', C.violet)}${k('Tasa de interacción', x.engagementSeguidores + '%', 'Sobre los seguidores', C.orange)}${k('Seguidores', nf(x.seguidores), '@' + esc(pub.cuenta.username), C.blue)}</div>`);
    B.push(`<div style="margin-top:4mm">${caja('c-pub', 'Me gusta frente a sus publicaciones recientes', `<span style="color:${C.orange}">■</span> esta publicación`)}</div>`);
    grafico('c-pub', { type: 'bar', plugins: [valores], data: { labels: serie.map(e => new Date(e.t).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })), datasets: [{ data: serie.map(e => e.likes), backgroundColor: serie.map(e => e.actual ? C.orange : '#bdb9e6'), borderRadius: 5, borderSkipped: false, maxBarThickness: 22 }] }, options: { layout: { padding: { top: 14 } }, plugins: { legend: { display: false } }, scales: axes() } });
    puntos(a.hallazgos).forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Lectura del analista</h3>' + h));
  } else if (showPost) {
    const a = pub.analisis, x = a.kpis, m = pub.media || {}, s = a.sentimiento;
    B.push(sec(num(), 'Análisis de la publicación') + `<p class="lead2">${esc((m.caption || '').slice(0, 140))}<br>Publicada el ${m.timestamp ? new Date(m.timestamp).toLocaleDateString('es-CO', { dateStyle: 'long' }) : '—'} · <a href="${esc(pub.url)}">${esc(pub.url)}</a></p>
      <div class="grid g4">${k('Alcance', nf(x.alcance), 'Cuentas únicas', C.violet)}${k('Vistas', nf(x.vistas), `${x.frecuencia} vistas por persona`, C.blue)}${k('Me gusta', nf(x.meGusta), '', C.grape)}${k('Comentarios', nf(x.comentarios), '', C.violet)}
        ${k('Compartidos', nf(x.compartidos), `${x.tasaCompartido}% del alcance`, C.orange)}${k('Guardados', nf(x.guardados), `${x.tasaGuardado}% del alcance`, C.green)}${k('Tasa de interacción', x.engagementAlcance + '%', 'Nivel ' + a.nivel, C.orange)}${k('Nuevos seguidores', nf(x.nuevosSeguidores), `${nf(x.visitasPerfil)} visitas al perfil`, C.grape)}</div>`);
    const h = pub.historial || [];
    B.push(`<div class="grid g2" style="margin-top:4mm">${caja('c-int', '¿Cómo interactuó la gente?')}${caja('c-evo', h.length > 1 ? 'Evolución del alcance' : 'Tono de los comentarios')}</div>`);
    grafico('c-int', { type: 'bar', plugins: [valores], data: { labels: ['Me gusta', 'Comentarios', 'Compartidos', 'Guardados'], datasets: [{ data: [x.meGusta, x.comentarios, x.compartidos, x.guardados], backgroundColor: [C.grape, C.violet, C.orange, C.green], borderRadius: 6, borderSkipped: false, barThickness: 16 }] }, options: { indexAxis: 'y', layout: { padding: { right: 34 } }, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, display: false }, y: { grid: { display: false }, border: { display: false } } } } });
    if (h.length > 1) grafico('c-evo', { type: 'line', data: { labels: h.map(e => new Date(e.t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit' })), datasets: [{ label: 'Alcance', data: h.map(e => e.reach), borderColor: C.violet, backgroundColor: 'rgba(74,67,176,.12)', fill: true, borderWidth: 2, pointRadius: 2, tension: .35 }] }, options: { plugins: { legend: { display: false } }, scales: axes() } });
    else grafico('c-evo', { type: 'doughnut', data: { labels: ['Positivos', 'Neutros', 'Negativos'], datasets: [{ data: [s.positivos, s.neutros, s.negativos], backgroundColor: [C.green, '#b9b7cf', '#c0392b'], borderColor: '#fff', borderWidth: 2 }] }, options: { cutout: '64%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } } } } });
    puntos(a.hallazgos.slice(0, 5)).forEach((hh, i) => B.push(i ? hh : '<h3 style="margin-top:6mm">Lectura del analista</h3>' + hh));
    if (s.destacados.length) B.push(`<h3 style="margin-top:6mm">Comentarios destacados</h3><div class="grid g2">${s.destacados.slice(0, 2).map(c => `<div class="quote"><b>@${esc(c.username || 'usuario')}</b> · ${esc(c.text)}</div>`).join('')}</div>`);
  }

  // ---------- Lectura con IA ----------
  if (showPost && pub.ia) {
    const ia = pub.ia;
    B.push(sec(num(), 'Lectura ejecutiva', 'Análisis elaborado con inteligencia artificial a partir de las cifras, revisado por la oficina de prensa') + `<div class="hero" style="grid-template-columns:1fr"><div><p class="verdict">${esc(ia.titular)}</p><p style="margin:0;color:var(--ink2)">${esc(ia.resumen_ejecutivo)}</p></div></div>`);
    puntos(ia.hallazgos).forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Hallazgos</h3>' + h));
    puntos(ia.recomendaciones, 'r').forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Acciones para las próximas 72 horas</h3>' + h));
    if (ia.alertas && ia.alertas.length) puntos(ia.alertas).forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Alertas</h3>' + h));
  }

  // ---------- Correo ----------
  if (showMail) {
    const s = camp.stats, a = camp.analisis, max = Math.max(s.enviados, 1), act = camp.actividad || [];
    B.push(sec(num(), 'Campaña de correo') + `<p class="lead2">“${esc(camp.asunto.replace(/\{\{\s*nombre\s*\}\}/gi, '[nombre]'))}”</p>
      <div class="grid g4">${k('Enviados', nf(s.enviados), `${s.tasaEntrega}% entregados`, C.violet)}${k('Abrieron', nf(s.abiertos), `${s.tasaApertura}% · nivel ${a.nivelApertura || '—'}`, C.blue)}${k('Clic en el botón', nf(s.clics), `${s.tasaClic}% · nivel ${a.nivelClic || '—'}`, C.orange)}${k('Clic de quienes abrieron', s.ctor + '%', `${nf(s.bajas)} bajas (${s.tasaBaja}%)`, C.green)}</div>`);
    B.push(`<div class="grid g2" style="margin-top:4mm"><div class="box ch"><h3>Embudo de conversión</h3><div class="bars" style="margin-top:auto;margin-bottom:auto">
        ${[['Enviados', s.enviados, C.violet], ['Abrieron', s.abiertos, C.blue], ['Clic en el botón', s.clics, C.orange]].map(([l, v, c]) => `<div class="b"><span>${l}</span><div class="tr"><i style="width:${Math.max(2, 100 * v / max)}%;--c:${c}"></i></div><b>${nf(v)}</b></div>`).join('')}
      </div></div>${caja('c-act', 'Actividad por hora')}</div>`);
    grafico('c-act', { type: 'line', data: { labels: act.map(e => e.hora.slice(5, 13).replace('T', ' ') + 'h'), datasets: [
      { label: 'Aperturas', data: act.map(e => e.aperturas), borderColor: C.blue, backgroundColor: C.blue, borderWidth: 2, pointRadius: 2, tension: .3 },
      { label: 'Clics', data: act.map(e => e.clics), borderColor: C.orange, backgroundColor: C.orange, borderWidth: 2, pointRadius: 2, tension: .3 },
    ] }, options: { plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7 } } }, scales: axes() } });
    puntos(a.hallazgos).forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Lectura del analista</h3>' + h));
    if (a.nota) B.push(`<p class="fuente">${esc(a.nota)}</p>`);
  }

  // ---------- Cuenta ----------
  if (showAcc) {
    const a = cta.analisis, t = cta.insights.totales;
    B.push(sec(num(), 'Desempeño de la cuenta', `@${esc(cta.account.username)} · últimos 28 días`) + `<div class="grid g4">
        ${k('Seguidores', nf(cta.account.followers_count), `${nf(cta.account.media_count)} publicaciones`, C.grape)}${k('Crecimiento neto', (a.netos >= 0 ? '+' : '') + nf(a.netos), `${nf(t.nuevosSeguidores)} nuevos · ${nf(t.dejaronDeSeguir)} se fueron`, C.green)}
        ${k('Alcance', nf(t.reach), `${nf(t.views)} vistas`, C.blue)}${k('Interacciones', nf(t.total_interactions), `${nf(t.accounts_engaged)} cuentas`, C.orange)}</div>`);
    B.push(`<div class="grid g2" style="margin-top:4mm">${caja('c-fol', 'Seguidores nuevos por día')}${caja('c-posts', 'Alcance por publicación', `<span style="color:${C.violet}">■</span> publicación · <span style="color:${C.orange}">■</span> reel`)}</div>`);
    const dd = cta.insights.seguidoresDiarios || [];
    grafico('c-fol', { type: 'bar', data: { labels: dd.map(e => new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })), datasets: [{ data: dd.map(e => e.nuevos), backgroundColor: C.grape, borderRadius: 3, maxBarThickness: 10 }] }, options: { plugins: { legend: { display: false } }, scales: { ...axes(), x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } } } } });
    const ps = [...a.posts].reverse();
    grafico('c-posts', { type: 'bar', data: { labels: ps.map(e => new Date(e.timestamp).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })), datasets: [{ data: ps.map(e => e.analisis.kpis.alcance), backgroundColor: ps.map(e => e.media_product_type === 'REELS' ? C.orange : C.violet), borderRadius: 4, maxBarThickness: 16 }] }, options: { plugins: { legend: { display: false } }, scales: { ...axes(), x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } } } } });
    const color = s => s >= 70 ? C.green : s >= 45 ? C.orange : '#c0392b';
    B.push(`<h3 style="margin-top:6mm">Publicaciones con mejor desempeño</h3><table><thead><tr><th>Publicación</th><th>Tipo</th><th class="num">Alcance</th><th class="num">Interacciones</th><th class="num">Tasa</th><th class="num">Puntaje</th></tr></thead><tbody>
      ${a.top.map(x => `<tr><td>${esc((x.caption || '').slice(0, 48))}</td><td>${x.media_product_type === 'REELS' ? 'Reel' : 'Publicación'}</td><td class="num">${nf(x.analisis.kpis.alcance)}</td><td class="num">${nf(x.analisis.kpis.interacciones)}</td><td class="num">${String(x.analisis.kpis.engagementAlcance).replace('.', ',')}%</td><td class="num"><span class="pill" style="--c:${color(x.analisis.score)}">${x.analisis.score}</span></td></tr>`).join('')}
      </tbody></table>`);
    puntos(a.hallazgos.slice(0, 4)).forEach((h, i) => B.push(i ? h : '<h3 style="margin-top:6mm">Lectura del analista</h3>' + h));
  }

  // ---------- Recomendaciones ----------
  const recs = [...new Set([...(showPost ? pub.analisis.recomendaciones : []), ...(showMail ? camp.analisis.recomendaciones : []), ...(showAcc ? cta.analisis.recomendaciones : [])])].slice(0, 9);
  puntos(recs, 'r').forEach((h, i) => B.push(i ? h : sec(num(), 'Recomendaciones y próximos pasos', 'Acciones concretas, ordenadas por impacto esperado') + h));
  B.push(`<h3 style="margin-top:6mm">Cómo leer este informe</h3><dl class="gloss">
    <div><dt>Alcance</dt><dd>Cuentas únicas que vieron el contenido al menos una vez.</dd></div>
    <div><dt>Vistas</dt><dd>Veces que se mostró el contenido; una persona puede verlo varias veces.</dd></div>
    <div><dt>Tasa de interacción</dt><dd>Me gusta, comentarios, compartidos y guardados sobre el alcance. 2% a 5% es bueno; más de 9% es excelente.</dd></div>
    <div><dt>Compartidos y guardados</dt><dd>Las señales más fuertes de interés: quien comparte recomienda; quien guarda planea volver.</dd></div>
    <div><dt>Clic en el botón</dt><dd>Personas que abrieron la programación desde el correo: la medida más confiable del interés.</dd></div>
    <div><dt>Puntaje de impacto</dt><dd>De 0 a 100: interacción 35%, compartidos 20%, guardados 15%, alcance frente a seguidores 20% y tono 10%.</dd></div>
  </dl><p class="fuente">Fuentes: API oficial de Instagram (Meta) y registro de envíos de la Sala de Prensa Digital. Cifras al momento de generar el informe.</p>`);

  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  HC.paginar(doc, B, { head: `<div class="ph"><img src="/img/logo_sm.png" alt=""><span>Informe ejecutivo · ${esc(ORG)}</span></div>`, pie: `<span>Generado el ${fechaLarga} · Sala de Prensa Digital</span>` });
  HC.numerar(doc);
  if (window.Chart) later.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  HC.escalar(doc);
  if (q.get('imprimir') === '1') setTimeout(descargar, 700);
}

function avisar(t) { const a = document.getElementById('aviso'); a.style.display = t ? '' : 'none'; a.textContent = t || ''; }
async function descargar() {
  const b = document.getElementById('b-pdf'); b.disabled = true;
  try { await HC.descargarPDF(document.getElementById('doc'), NOMBRE); } catch (e) { avisar(e.message); }
  b.disabled = false;
}
document.getElementById('b-pdf').onclick = descargar;
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => HC.escalar(document.getElementById('doc')), 150); });

main().catch(e => { document.getElementById('doc').innerHTML = `<div class="loading">No se pudo generar el informe: ${esc(e.message)}</div>`; });
