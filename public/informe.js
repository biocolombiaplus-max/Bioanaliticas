/* Informe ejecutivo imprimible (A4) */
const nf = n => Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { violet: '#4a43b0', orange: '#e0661f', blue: '#2a8fb3', green: '#5a9e32', grape: '#9a5bd0', grid: '#eceaf6', soft: '#f3f1fb' };
const q = new URLSearchParams(location.search);
const tipo = q.get('tipo') || 'integral';
const hoy = new Date();
const fechaLarga = hoy.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

if (window.Chart) {
  Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
  Chart.defaults.font.size = 10;
  Chart.defaults.color = '#55537a';
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.devicePixelRatio = 2;
}
const axes = () => ({ x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: C.grid }, border: { display: false }, ticks: { callback: v => nf(v) } } });
const k = (l, v, s, a) => `<div class="k" style="--a:${a}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
const list = (items, cls = '') => `<ul class="f ${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
const tagNivel = n => `<span class="tag ${n === 'excelente' || n === 'bueno' ? 'ok' : n === 'bajo' ? 'bad' : 'warn'}">${esc(n)}</span>`;

let pageNo = 0;
let ORG = 'Alcaldía de Villa del Rosario';
const later = [];
function page(title, num, lead, body) {
  pageNo++;
  return `<section class="page"><div class="ph"><img src="/img/logo_sm.png" alt=""><span>Informe ejecutivo · ${esc(ORG)}</span></div>
  <h2><span class="n">${num}</span>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ''}${body}
  <div class="pf"><span>Generado el ${fechaLarga} · Sala de Prensa Digital</span><span>Página ${pageNo + 1}</span></div></section>`;
}

function gauge(id, score) {
  later.push(() => new Chart(document.getElementById(id), { type: 'doughnut', data: { datasets: [{ data: [score, 100 - score], backgroundColor: [score >= 70 ? C.green : score >= 45 ? C.orange : '#c0392b', '#e7e5f3'], borderWidth: 0 }] }, options: { cutout: '78%', rotation: -90, circumference: 360, plugins: { legend: { display: false }, tooltip: { enabled: false } } } }));
  return `<div class="gauge"><canvas id="${id}"></canvas><div class="t"><div><b>${score}</b><span>de 100<br>puntaje de impacto</span></div></div></div>`;
}

function verdict(score) {
  if (score >= 75) return 'Impacto sobresaliente: el contenido está movilizando a la comunidad.';
  if (score >= 55) return 'Buen impacto: el mensaje conecta y hay margen claro para crecer.';
  if (score >= 35) return 'Impacto moderado: el contenido se ve, pero aún no genera suficiente conversación.';
  return 'Impacto bajo: conviene ajustar formato, mensaje y horario de publicación.';
}

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
  const demoNote = demo ? '<div class="demo">Este informe contiene <b>datos de demostración</b> porque Instagram aún no está conectado. Las cifras de Instagram son de ejemplo.</div>' : '';

  const titulos = { post: 'Impacto de la publicación', cuenta: 'Desempeño de la cuenta de Instagram', correo: 'Resultados de la campaña de correo', integral: 'Informe integral de impacto digital' };
  const subt = showPost ? esc(pub.etiqueta || (pub.media && pub.media.caption || '').slice(0, 90)) : showMail ? esc(camp.nombre) : cta ? '@' + esc(cta.account.username) : '';
  let html = `<section class="page cover"><div class="in"><img src="/img/logo.png" alt="Ferias y Fiestas de la Uva 2026">
    <div class="kicker">Informe ejecutivo</div><h1>${titulos[tipo] || titulos.integral}</h1><div class="sub">${subt}</div>
    <div class="meta"><div>Fecha<b>${fechaLarga}</b></div><div>Entidad<b>${esc(ORG)}</b></div><div>Preparado por<b>Oficina de prensa · Sala de Prensa Digital</b></div></div></div><div class="bandas"></div></section>`;

  // ---------- 1. Resumen ejecutivo ----------
  const score = showPost ? pub.analisis.score : showAcc && cta.analisis.top.length ? Math.round(cta.analisis.posts.reduce((s, x) => s + x.analisis.score, 0) / cta.analisis.posts.length) : null;
  const kp = [];
  if (showPost && pub.fuente === 'publica') { const x = pub.analisis.kpis; kp.push(k('Me gusta', nf(x.meGusta), x.vsPromedioMeGusta ? `${x.vsPromedioMeGusta}× el promedio de la cuenta` : '', C.violet), k('Interacción', x.engagementSeguidores + '%', 'Sobre los seguidores de @' + esc(pub.cuenta.username), C.orange)); }
  else if (showPost) { const x = pub.analisis.kpis; kp.push(k('Alcance de la publicación', nf(x.alcance), 'Cuentas únicas', C.violet), k('Interacciones', nf(x.interacciones), `${x.engagementAlcance}% del alcance`, C.orange)); }
  if (showMail) { const s = camp.stats; kp.push(k('Correos enviados', nf(s.enviados), `${s.tasaEntrega}% entregados`, C.blue), k('Clics al botón', nf(s.clics), `${s.tasaClic}% de los enviados`, C.orange)); }
  if (cta && (showAcc || (showPost && pub.fuente !== 'publica'))) { const t = cta.insights.totales; kp.push(k('Seguidores', nf(cta.account.followers_count), `${cta.analisis.netos >= 0 ? '+' : ''}${nf(cta.analisis.netos)} netos en 28 días`, C.grape), k('Alcance de la cuenta', nf(t.reach), 'Últimos 28 días', C.green)); }
  const destacados = [
    ...(showPost ? pub.analisis.hallazgos.slice(0, 3) : []),
    ...(showMail ? camp.analisis.hallazgos.slice(1, 3) : []),
    ...(showAcc ? cta.analisis.hallazgos.slice(0, 3) : []),
  ].slice(0, 6);
  html += page('Resumen ejecutivo', '01', 'Lo más importante en una página.', `${demoNote}
    ${score !== null ? `<div class="hero">${gauge('g1', score)}<div><p class="verdict">${verdict(score)}</p><p style="margin:0;color:var(--ink2)">El puntaje combina la tasa de interacción, la capacidad de ser compartido y guardado, el alcance frente a la comunidad y el tono de los comentarios.</p></div></div>` : ''}
    <div class="grid g4">${kp.slice(0, 8).join('')}</div>
    <h3>Hallazgos clave</h3>${list(destacados)}`);

  // ---------- 2. Publicación ----------
  let n = 1;
  if (showPost && pub.fuente === 'publica') {
    const a = pub.analisis, x = a.kpis, m = pub.media || {};
    const serie = (pub.referencia && pub.referencia.serie) || [];
    html += page('Análisis de la publicación', String(++n).padStart(2, '0'), `@${esc(pub.cuenta.username)} · ${esc((m.caption || '').slice(0, 130))}<br><span style="font-size:11px">Publicada el ${m.timestamp ? new Date(m.timestamp).toLocaleDateString('es-CO', { dateStyle: 'long' }) : '—'} · <a href="${esc(pub.url)}">${esc(pub.url)}</a></span>`, `
      <div class="grid g4">
        ${k('Me gusta', nf(x.meGusta), x.vsPromedioMeGusta ? `${x.vsPromedioMeGusta}× el promedio` : '', C.grape)}${k('Comentarios', nf(x.comentarios), x.vsPromedioComentarios ? `${x.vsPromedioComentarios}× el promedio` : '', C.violet)}
        ${k('Tasa de interacción', x.engagementSeguidores + '%', 'Sobre los seguidores', C.orange)}${k('Seguidores de la cuenta', nf(x.seguidores), '@' + esc(pub.cuenta.username), C.blue)}
      </div>
      <div class="box" style="margin-top:12px"><h3 style="margin-top:0">Me gusta frente a sus publicaciones recientes <span style="font-weight:400;color:var(--muted)">(<span style="color:${C.orange}">■</span> esta publicación)</span></h3><div class="chart sm"><canvas id="c-pub"></canvas></div></div>
      <h3>Lectura del analista</h3>${list(a.hallazgos)}`);
    later.push(() => new Chart(document.getElementById('c-pub'), { type: 'bar', data: { labels: serie.map(e => new Date(e.t).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })), datasets: [{ data: serie.map(e => e.likes), backgroundColor: serie.map(e => e.actual ? C.orange : '#cfcde0'), borderRadius: 3, maxBarThickness: 18 }] }, options: { plugins: { legend: { display: false } }, scales: axes() } }));
  } else if (showPost) {
    const a = pub.analisis, x = a.kpis, m = pub.media || {}, s = a.sentimiento;
    html += page('Análisis de la publicación', String(++n).padStart(2, '0'), `${esc((m.caption || '').slice(0, 140))}<br><span style="font-size:11px">Publicada el ${m.timestamp ? new Date(m.timestamp).toLocaleDateString('es-CO', { dateStyle: 'long' }) : '—'} · <a href="${esc(pub.url)}">${esc(pub.url)}</a></span>`, `
      <div class="grid g4">
        ${k('Alcance', nf(x.alcance), 'Cuentas únicas', C.violet)}${k('Vistas', nf(x.vistas), `${x.frecuencia} vistas por persona`, C.blue)}
        ${k('Me gusta', nf(x.meGusta), '', C.grape)}${k('Comentarios', nf(x.comentarios), '', C.violet)}
        ${k('Compartidos', nf(x.compartidos), `${x.tasaCompartido}% del alcance`, C.orange)}${k('Guardados', nf(x.guardados), `${x.tasaGuardado}% del alcance`, C.green)}
        ${k('Tasa de interacción', x.engagementAlcance + '%', 'Nivel ' + a.nivel, C.orange)}${k('Nuevos seguidores', nf(x.nuevosSeguidores), `${nf(x.visitasPerfil)} visitas al perfil`, C.grape)}
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="box"><h3 style="margin-top:0">¿Cómo interactuó la gente?</h3><div class="chart sm"><canvas id="c-int"></canvas></div></div>
        <div class="box"><h3 style="margin-top:0">${(pub.historial || []).length > 1 ? 'Evolución del alcance' : 'Tono de los comentarios'}</h3><div class="chart sm"><canvas id="c-evo"></canvas></div></div>
      </div>
      <h3>Lectura del analista</h3>${list(a.hallazgos.slice(0, 5))}
      ${s.destacados.length ? `<h3>Comentarios destacados</h3><div class="grid g2">${s.destacados.slice(0, 2).map(c => `<div class="quote"><b>@${esc(c.username || 'usuario')}</b> · ${esc(c.text)}</div>`).join('')}</div>` : ''}`);
    later.push(() => {
      const vals = [x.meGusta, x.comentarios, x.compartidos, x.guardados];
      new Chart(document.getElementById('c-int'), { type: 'bar', data: { labels: ['Me gusta', 'Comentarios', 'Compartidos', 'Guardados'], datasets: [{ data: vals, backgroundColor: [C.grape, C.violet, C.orange, C.green], borderRadius: 4, maxBarThickness: 22 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: C.grid }, border: { display: false } }, y: { grid: { display: false } } } } });
      const h = pub.historial || [];
      if (h.length > 1) new Chart(document.getElementById('c-evo'), { type: 'line', data: { labels: h.map(e => new Date(e.t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit' })), datasets: [{ label: 'Alcance', data: h.map(e => e.reach), borderColor: C.violet, backgroundColor: C.violet, borderWidth: 2, pointRadius: 2, tension: .3 }] }, options: { plugins: { legend: { display: false } }, scales: axes() } });
      else new Chart(document.getElementById('c-evo'), { type: 'doughnut', data: { labels: ['Positivos', 'Neutros', 'Negativos'], datasets: [{ data: [s.positivos, s.neutros, s.negativos], backgroundColor: [C.green, '#b9b7cf', '#c0392b'], borderColor: '#fff', borderWidth: 2 }] }, options: { cutout: '62%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } } } } });
    });
  }

  // ---------- Lectura con IA ----------
  if (showPost && pub.ia) {
    const r = pub.ia;
    html += page('Lectura ejecutiva', String(++n).padStart(2, '0'), 'Análisis elaborado con inteligencia artificial a partir de las cifras de este informe y revisado por la oficina de prensa.', `
      <div class="hero" style="grid-template-columns:1fr"><div><p class="verdict">${esc(r.titular)}</p><p style="margin:0;color:var(--ink2)">${esc(r.resumen_ejecutivo)}</p></div></div>
      <h3>Hallazgos</h3>${list(r.hallazgos)}
      <h3>Acciones para las próximas 72 horas</h3>${list(r.recomendaciones, 'r')}
      ${r.alertas && r.alertas.length ? `<h3>Alertas</h3>${list(r.alertas)}` : ''}`);
  }

  // ---------- 3. Correo ----------
  if (showMail) {
    const s = camp.stats, a = camp.analisis;
    const max = Math.max(s.enviados, 1);
    const act = camp.actividad || [];
    html += page('Campaña de correo', String(++n).padStart(2, '0'), `“${esc(camp.asunto.replace(/\{\{\s*nombre\s*\}\}/gi, '[nombre]'))}” · Botón hacia la programación oficial.`, `
      <div class="grid g4">
        ${k('Enviados', nf(s.enviados), `${s.tasaEntrega}% entregados`, C.violet)}${k('Abrieron', nf(s.abiertos), `${s.tasaApertura}% · nivel ${a.nivelApertura || '—'}`, C.blue)}
        ${k('Clic en el botón', nf(s.clics), `${s.tasaClic}% · nivel ${a.nivelClic || '—'}`, C.orange)}${k('Clic de quienes abrieron', s.ctor + '%', `${nf(s.bajas)} bajas (${s.tasaBaja}%)`, C.green)}
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="box"><h3 style="margin-top:0">Embudo de conversión</h3><div class="bars">
          ${[['Enviados', s.enviados, C.violet], ['Abrieron', s.abiertos, C.blue], ['Clic en el botón', s.clics, C.orange]].map(([l, v, c]) => `<div class="b"><span>${l}</span><div class="tr"><i style="width:${100 * v / max}%;--c:${c}"></i></div><b>${nf(v)}</b></div>`).join('')}
        </div></div>
        <div class="box"><h3 style="margin-top:0">Actividad por hora</h3><div class="chart sm"><canvas id="c-act"></canvas></div></div>
      </div>
      <h3>Lectura del analista</h3>${list(a.hallazgos)}
      ${a.nota ? `<p style="font-size:10.5px;color:var(--muted)">${esc(a.nota)}</p>` : ''}`);
    later.push(() => new Chart(document.getElementById('c-act'), { type: 'line', data: { labels: act.map(e => e.hora.slice(5, 13).replace('T', ' ') + 'h'), datasets: [
      { label: 'Aperturas', data: act.map(e => e.aperturas), borderColor: C.blue, backgroundColor: C.blue, borderWidth: 2, pointRadius: 2, tension: .3 },
      { label: 'Clics', data: act.map(e => e.clics), borderColor: C.orange, backgroundColor: C.orange, borderWidth: 2, pointRadius: 2, tension: .3 },
    ] }, options: { plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: axes() } }));
  }

  // ---------- 4. Cuenta ----------
  if (showAcc) {
    const a = cta.analisis, t = cta.insights.totales;
    html += page('Desempeño de la cuenta', String(++n).padStart(2, '0'), `@${esc(cta.account.username)} · últimos 28 días.`, `
      <div class="grid g4">
        ${k('Seguidores', nf(cta.account.followers_count), `${nf(cta.account.media_count)} publicaciones`, C.grape)}${k('Crecimiento neto', (a.netos >= 0 ? '+' : '') + nf(a.netos), `${nf(t.nuevosSeguidores)} nuevos · ${nf(t.dejaronDeSeguir)} se fueron`, C.green)}
        ${k('Alcance', nf(t.reach), `${nf(t.views)} vistas`, C.blue)}${k('Interacciones', nf(t.total_interactions), `${nf(t.accounts_engaged)} cuentas`, C.orange)}
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="box"><h3 style="margin-top:0">Seguidores nuevos por día</h3><div class="chart sm"><canvas id="c-fol"></canvas></div></div>
        <div class="box"><h3 style="margin-top:0">Alcance por publicación <span style="font-weight:400;color:var(--muted)">(<span style="color:${C.violet}">■</span> publicación · <span style="color:${C.orange}">■</span> reel)</span></h3><div class="chart sm"><canvas id="c-posts"></canvas></div></div>
      </div>
      <h3>Publicaciones con mejor desempeño</h3>
      <table><thead><tr><th>Publicación</th><th>Tipo</th><th class="num">Alcance</th><th class="num">Interacciones</th><th class="num">Tasa</th><th class="num">Puntaje</th></tr></thead><tbody>
      ${a.top.map(p => `<tr><td>${esc((p.caption || '').slice(0, 55))}</td><td>${p.media_product_type === 'REELS' ? 'Reel' : 'Publicación'}</td><td class="num">${nf(p.analisis.kpis.alcance)}</td><td class="num">${nf(p.analisis.kpis.interacciones)}</td><td class="num">${p.analisis.kpis.engagementAlcance}%</td><td class="num"><b>${p.analisis.score}</b></td></tr>`).join('')}
      </tbody></table>
      <h3>Lectura del analista</h3>${list(a.hallazgos.slice(0, 4))}`);
    later.push(() => {
      const dd = cta.insights.seguidoresDiarios || [];
      new Chart(document.getElementById('c-fol'), { type: 'bar', data: { labels: dd.map(e => e.fecha.slice(5)), datasets: [{ data: dd.map(e => e.nuevos), backgroundColor: C.grape, borderRadius: 3, maxBarThickness: 12 }] }, options: { plugins: { legend: { display: false } }, scales: axes() } });
      const ps = [...a.posts].reverse();
      new Chart(document.getElementById('c-posts'), { type: 'bar', data: { labels: ps.map(e => new Date(e.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })), datasets: [{ data: ps.map(e => e.analisis.kpis.alcance), backgroundColor: ps.map(e => e.media_product_type === 'REELS' ? C.orange : C.violet), borderRadius: 3, maxBarThickness: 16 }] }, options: { plugins: { legend: { display: false } }, scales: axes() } });
    });
  }

  // ---------- 5. Recomendaciones ----------
  const recs = [...new Set([
    ...(showPost ? pub.analisis.recomendaciones : []),
    ...(showMail ? camp.analisis.recomendaciones : []),
    ...(showAcc ? cta.analisis.recomendaciones : []),
  ])].slice(0, 9);
  html += page('Recomendaciones y próximos pasos', String(++n).padStart(2, '0'), 'Acciones concretas, ordenadas por impacto esperado.', `
    ${list(recs, 'r')}
    <h3>Cómo leer este informe</h3>
    <dl class="gloss">
      <dt>Alcance</dt><dd>Número de cuentas únicas que vieron el contenido al menos una vez.</dd>
      <dt>Vistas</dt><dd>Veces que se mostró el contenido; una misma persona puede verlo varias veces.</dd>
      <dt>Tasa de interacción</dt><dd>Me gusta, comentarios, compartidos y guardados divididos entre el alcance. Referencia del sector: 2% a 5% es bueno; más de 9% es excelente.</dd>
      <dt>Compartidos y guardados</dt><dd>Las señales más fuertes de interés real: quien comparte recomienda el evento; quien guarda planea volver a consultarlo.</dd>
      <dt>Clic en el botón</dt><dd>Personas que abrieron la programación desde el correo. Es la medida más confiable del interés generado por la campaña.</dd>
      <dt>Puntaje de impacto</dt><dd>Indicador de 0 a 100 que combina interacción (35%), compartidos (20%), guardados (15%), alcance frente a seguidores (20%) y tono de comentarios (10%).</dd>
    </dl>
    <p style="font-size:10px;color:var(--muted);margin-top:14px">Fuentes: API oficial de Instagram (Meta) y registro de envíos de la Sala de Prensa Digital. Las cifras corresponden al momento de generación del informe.</p>`);

  document.getElementById('doc').innerHTML = html;
  if (window.Chart) later.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  if (q.get('imprimir') === '1') setTimeout(() => window.print(), 600);
}

main().catch(e => { document.getElementById('doc').innerHTML = `<div class="loading">No se pudo generar el informe: ${esc(e.message)}</div>`; });
