/* Sala de Prensa Digital · panel */
const $ = (s, el = document) => el.querySelector(s);
const nf = n => Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fdate = t => t ? new Date(t).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const C = { violet: '#4a43b0', orange: '#e0661f', blue: '#2a8fb3', green: '#5a9e32', grape: '#9a5bd0', grid: '#eceaf6', ink2: '#55537a', muted: '#cfcde0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const o = { ...opts, headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : {} };
  if (o.body && !isForm) o.body = JSON.stringify(o.body);
  const r = await fetch(url, o);
  if (r.status === 401) { location.href = '/#ingresar'; throw new Error('Sesión vencida'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Error ' + r.status); Object.assign(e, j); throw e; }
  return j;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4500);
}
async function copiar(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = 'Copiado ✓'; setTimeout(() => (btn.textContent = o), 1500); }
}

if (window.Chart) {
  Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = C.ink2;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1f1d3d';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
}
const charts = {};
function chart(id, cfg) {
  if (!window.Chart || !document.getElementById(id)) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}
const axes = () => ({
  x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
  y: { grid: { color: C.grid }, border: { display: false }, beginAtZero: true, ticks: { callback: v => nf(v) } },
});
const kpi = (l, v, s, color) => `<div class="kpi" style="--accent:${color}"><div class="l"><span class="dot"></span>${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
const list = (items, cls = '') => `<ul class="f ${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
const demoBanner = d => d ? '<div class="demo-banner"><b>Modo demostración:</b> Instagram aún no está conectado. Las cifras son de ejemplo. Conéctalo en <a href="#ajustes">Ajustes</a>.</div>' : '';
function gauge(id, score) {
  setTimeout(() => chart(id, { type: 'doughnut', data: { datasets: [{ data: [score, 100 - score], backgroundColor: [score >= 70 ? C.green : score >= 45 ? C.orange : '#c0392b', '#ece9f8'], borderWidth: 0 }] }, options: { cutout: '78%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 700 } } }));
  return `<div class="gauge"><canvas id="${id}"></canvas><div class="t"><div><b>${score}</b><span>puntaje de<br>impacto</span></div></div></div>`;
}
const verdict = s => s >= 75 ? 'Impacto sobresaliente: el contenido está movilizando a la comunidad.' : s >= 55 ? 'Buen impacto: el mensaje conecta y hay margen claro para crecer.' : s >= 35 ? 'Impacto moderado: se ve, pero aún no genera suficiente conversación.' : 'Impacto bajo: conviene ajustar formato, mensaje y horario.';

/* ---------------- Aplicación ---------------- */
const App = {
  estado: null,
  go(v) {
    if (!document.getElementById('v-' + v)) v = 'analizar';
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    history.replaceState(null, '', '#' + v);
    ({ analizar: Analizar.load, resumen: App.refresh, estudio: Studio.load, correos: Mail.load, contactos: Contacts.load, instagram: IG.account, informes: Reports.load, ajustes: App.ajustes })[v]?.();
    window.scrollTo(0, 0);
  },
  async init() {
    App.estado = await api('/api/estado');
    $('#who').textContent = App.estado.usuario;
    $('#delay-lbl').textContent = App.estado.delay;
    $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) App.go(b.dataset.v); });
    addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && !$('#v-' + v)?.classList.contains('on')) App.go(v); });
    App.go(location.hash.slice(1) || 'analizar');
    App.watchQueue();
    setInterval(App.watchQueue, 20000);
  },
  // Motor de envío: mientras haya una campaña "enviando", el panel mantiene la cola en marcha.
  async watchQueue() {
    const r = await api('/api/resumen').catch(() => null);
    App.renderSending(r && r.enviando);
    if (!r || !r.enviando || App.driving) return;
    App.driving = true;
    try {
      for (;;) {
        const out = await api('/api/cola/procesar', { method: 'POST' }).catch(() => ({ error: true }));
        const s = await api('/api/resumen').catch(() => null);
        App.renderSending(s && s.enviando);
        if ($('#v-correos').classList.contains('on')) Mail.list();
        if (!s || !s.enviando || out.completada || out.sinCampana || out.limiteDiario) break;
        if (out.ocupado || out.error) await sleep(10000);
      }
    } finally { App.driving = false; }
  },
  renderSending(e) {
    $('#sending').innerHTML = e ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><div class="row"><span class="badge live">Enviando</span><b>${esc(e.nombre)}</b></div><span class="muted small">${nf(e.stats.enviados)} de ${nf(e.stats.total)} · faltan ~${e.stats.etaMinutos} min</span></div><div class="bar"><i style="width:${e.stats.total ? 100 * (e.stats.total - e.stats.pendientes) / e.stats.total : 0}%"></i></div>
      <p class="small muted" style="margin:8px 0 0">${e.nota === 'limite' ? 'Se alcanzó el límite diario; el envío continúa mañana.' : e.nota === 'ritmo' ? 'El proveedor pidió bajar el ritmo; se reanuda en unos minutos.' : App.estado && App.estado.cron ? 'El envío continúa aunque cierres esta pestaña.' : 'Mantén esta pestaña abierta mientras se envía (o configura el envío automático en Ajustes).'}</p></div>` : '';
  },
  async refresh() {
    const r = await api('/api/resumen');
    const c = r.correos;
    let acc = null;
    try { acc = await api('/api/cuenta'); } catch { /* sin datos */ }
    const t = acc ? acc.insights.totales : {};
    $('#demo-res').innerHTML = demoBanner(acc && acc.demo);
    $('#kpis').innerHTML = [
      kpi('Correos enviados', nf(c.enviados), c.pendientes ? `${nf(c.pendientes)} en cola` : `${nf(r.contactos.activos)} contactos activos`, C.violet),
      kpi('Abrieron el correo', nf(c.abiertos), c.enviados ? `${(100 * c.abiertos / c.enviados).toFixed(1)}% de apertura` : '', C.blue),
      kpi('Clics en el botón', nf(c.clics), c.enviados ? `${(100 * c.clics / c.enviados).toFixed(1)}% de los enviados` : '', C.orange),
      kpi('Seguidores', acc ? nf(acc.account.followers_count) : '—', acc && t.nuevosSeguidores !== undefined ? `+${nf(t.nuevosSeguidores)} nuevos en 28 días` : '', C.grape),
      kpi('Alcance 28 días', acc ? nf(t.reach) : '—', acc ? `${nf(t.accounts_engaged)} cuentas interactuaron` : '', C.green),
      kpi('Interacciones 28 días', acc ? nf(t.total_interactions) : '—', acc ? `${nf(t.likes)} me gusta · ${nf(t.comments)} comentarios` : '', C.violet),
    ].join('');
    const max = Math.max(c.enviados, 1);
    $('#funnel').innerHTML = [['Enviados', c.enviados, C.violet], ['Abrieron', c.abiertos, C.blue], ['Clic en el botón', c.clics, C.orange]]
      .map(([l, v, col]) => `<div class="f"><span>${l}</span><div class="track"><i style="width:${100 * v / max}%;--c:${col}"></i></div><b>${nf(v)}</b></div>`).join('') + (c.bajas ? `<p class="small muted">${nf(c.bajas)} personas se dieron de baja.</p>` : '');
    if (acc) {
      const d = acc.insights.seguidoresDiarios || [];
      chart('ch-followers', { type: 'bar', data: { labels: d.map(x => x.fecha.slice(5)), datasets: [{ label: 'Seguidores nuevos', data: d.map(x => x.nuevos), backgroundColor: C.grape, borderRadius: 4, maxBarThickness: 18 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() } });
    }
    $('#res-posts').innerHTML = Analizar.listHtml(r.publicaciones);
  },
  ajustes() {
    const e = App.estado;
    const line = (t, ok, okTxt, noTxt) => `<div class="status-line"><div><b>${t}</b><div class="small muted">${ok ? okTxt : noTxt}</div></div><span class="badge ${ok ? 'ok' : 'warn'}">${ok ? 'Conectado' : 'Pendiente'}</span></div>`;
    $('#status').innerHTML =
      line('Base de datos', e.almacenamiento === 'redis' || !e.vercel, e.almacenamiento === 'redis' ? 'Upstash Redis conectado.' : 'Archivo local (modo desarrollo).', 'Conecta Upstash Redis desde Vercel → Storage para guardar la información.') +
      line('Inteligencia artificial (Claude)', e.ia, 'Estudio de contenidos y lectura ejecutiva activos.', 'Agrega ANTHROPIC_API_KEY para activar el estudio de contenidos.') +
      line('Imágenes', e.imagenes, 'Las imágenes subidas quedan con dirección pública para los correos.', 'Conecta Vercel Blob desde Vercel → Storage.') +
      line('Envío de correos (SMTP)', e.smtp, `Remitente: ${esc(e.remitenteNombre)} &lt;${esc(e.remitente)}&gt;`, 'Modo prueba: los correos se generan pero no salen. Configura SMTP_HOST, SMTP_USER, SMTP_PASS y FROM_EMAIL.') +
      line('Instagram', e.instagram, 'API oficial de Instagram conectada.', 'Mostrando datos de demostración. Configura IG_ACCESS_TOKEN e IG_USER_ID.') +
      line('Envío automático', e.cron, 'Un servicio programado mantiene el envío aunque el panel esté cerrado.', 'Opcional: define CRON_SECRET y programa una llamada cada minuto a /api/cron/cola (ver README).') +
      line('Dirección pública', e.baseUrlPublica, esc(e.baseUrl), `Ahora es ${esc(e.baseUrl)}. Define BASE_URL con el dominio del panel.`) +
      `<div class="status-line"><div><b>Ritmo de envío</b><div class="small muted">Un correo cada ${e.delay} segundos (${Math.round(3600 / e.delay)} por hora)${e.limiteDiario ? ` · máximo ${nf(e.limiteDiario)} al día` : ''}</div></div><span class="badge">Activo</span></div>`;
  },
};

/* ---------------- Analizar publicación ---------------- */
const Analizar = {
  async load() {
    try { const u = sessionStorage.getItem('analizar'); if (u) { sessionStorage.removeItem('analizar'); $('#an-url').value = u; Analizar.go(); } } catch { /* sin almacenamiento */ }
    const posts = await api('/api/publicaciones');
    $('#an-list').innerHTML = Analizar.listHtml(posts);
  },
  listHtml(posts) {
    if (!posts.length) return '<div class="empty">Aún no hay publicaciones analizadas. Pega un enlace arriba.</div>';
    return posts.map(p => {
      const i = p.insights || {}, m = p.media || {};
      const sc = p.score ?? (p.analisis && p.analisis.score) ?? 0;
      const src = m.thumbnail_url || (m.media_type === 'IMAGE' && m.media_url);
      return `<div class="pcard" onclick="Analizar.show('${esc(p.id)}')"><div class="th">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '🍇'}</div>
        <div style="min-width:0"><b>${esc(p.etiqueta || (m.caption || '').slice(0, 70) || p.url)}</b> ${p.demo ? '<span class="badge warn">demo</span>' : ''}${p.fuente === 'publica' ? ` <span class="badge">@${esc(p.cuenta && p.cuenta.username)}</span>` : ''}
        <div class="small muted">${p.fuente === 'publica' ? `${nf(i.likes)} me gusta · ${nf(i.comments)} comentarios` : `${nf(i.reach)} alcance · ${nf(i.likes)} me gusta · ${nf(i.comments)} comentarios · ${nf(i.shares)} compartidos`}</div></div>
        <span class="score-pill">${sc}/100</span></div>`;
    }).join('');
  },
  async go(ev) {
    if (ev) ev.preventDefault();
    const body = { url: $('#an-url').value, usuario: $('#an-user').value, etiqueta: document.querySelector('[name=etiqueta][form=an-form]').value };
    const b = $('#an-btn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Analizando';
    try {
      const p = await api('/api/analizar', { method: 'POST', body });
      Analizar.render(p);
      $('#an-list').innerHTML = Analizar.listHtml(await api('/api/publicaciones'));
    } catch (e) {
      toast(e.message);
      if (e.necesitaUsuario) $('#an-user').focus();
    }
    b.disabled = false; b.textContent = 'Analizar';
    return false;
  },
  async show(id) {
    const posts = await api('/api/publicaciones');
    const p = posts.find(x => x.id === id);
    if (!p) return;
    if (!$('#v-analizar').classList.contains('on')) App.go('analizar');
    Analizar.render(p);
  },
  render(p) {
    const a = p.analisis, k = a.kpis, m = p.media || {};
    const pub = p.fuente === 'publica';
    const tiles = pub ? [
      kpi('Me gusta', nf(k.meGusta), k.vsPromedioMeGusta ? `${k.vsPromedioMeGusta}× el promedio de la cuenta` : '', C.grape),
      kpi('Comentarios', nf(k.comentarios), k.vsPromedioComentarios ? `${k.vsPromedioComentarios}× el promedio` : '', C.violet),
      kpi('Interacción', k.engagementSeguidores + '%', 'Sobre los seguidores', C.orange),
      kpi('Seguidores de la cuenta', nf(k.seguidores), '@' + esc(p.cuenta && p.cuenta.username), C.blue),
    ] : [
      kpi('Alcance', nf(k.alcance), 'Cuentas únicas', C.violet), kpi('Vistas', nf(k.vistas), `${k.frecuencia} por persona`, C.blue),
      kpi('Me gusta', nf(k.meGusta), k.vsPromedioMeGusta ? `${k.vsPromedioMeGusta}× el promedio` : '', C.grape), kpi('Comentarios', nf(k.comentarios), '', C.violet),
      kpi('Compartidos', nf(k.compartidos), `${k.tasaCompartido}% del alcance`, C.orange), kpi('Guardados', nf(k.guardados), `${k.tasaGuardado}% del alcance`, C.green),
      kpi('Tasa de interacción', k.engagementAlcance + '%', 'Nivel ' + a.nivel, C.orange), kpi('Nuevos seguidores', nf(k.nuevosSeguidores), `${nf(k.visitasPerfil)} visitas al perfil`, C.grape),
    ];
    const ia = p.ia ? Analizar.iaHtml(p.ia) : `<div class="row" style="justify-content:space-between"><div><h3 style="margin:0">Lectura ejecutiva con IA</h3><p class="muted small" style="margin:4px 0 0">Un análisis en lenguaje sencillo con acciones para las próximas 72 horas.</p></div><button class="btn" id="ia-btn" onclick="Analizar.ia('${esc(p.id)}')">Generar con IA</button></div>`;
    const s = a.sentimiento || {};
    $('#an-res').innerHTML = `
      ${demoBanner(p.demo)}
      <div class="card"><div class="res-head">${gauge('g-an', a.score)}
        <div style="min-width:0"><span class="badge">${pub ? 'Datos públicos · @' + esc(p.cuenta && p.cuenta.username) : p.demo ? 'Datos de ejemplo' : 'Estadísticas completas · cuenta conectada'}</span>
          <p class="verdict">${verdict(a.score)}</p>
          <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.caption || '').slice(0, 160))}</div>
          <div class="small muted">${m.timestamp ? 'Publicada el ' + fdate(m.timestamp) + ' · ' : ''}Actualizado ${fdate(p.actualizado)}</div></div>
        <div class="row" style="flex-direction:column;align-items:stretch"><a class="btn hot" target="_blank" href="/informe.html?tipo=post&post=${encodeURIComponent(p.id)}&imprimir=1">Descargar informe PDF</a><a class="btn alt" target="_blank" rel="noopener" href="${esc(p.url)}">Ver en Instagram</a></div></div></div>
      <div class="grid g4" style="margin-top:16px">${tiles.join('')}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-h"><h2>${pub ? 'Frente a sus publicaciones recientes' : '¿Cómo interactuó la gente?'}</h2>${pub ? '<span class="muted small"><span class="dot" style="--accent:#e0661f"></span> esta publicación</span>' : ''}</div><div class="chart-box"><canvas id="ch-an1"></canvas></div></div>
        <div class="card"><h2>Lectura del analista</h2>${list(a.hallazgos)}</div>
      </div>
      <div class="card ai-box" id="ia-box">${ia}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Recomendaciones</h2>${list(a.recomendaciones, 'r')}</div>
        <div class="card"><h2>Comentarios</h2>${s.total ? `<p class="muted small">${s.positivos} positivos · ${s.neutros} neutros · ${s.negativos} negativos · ${s.preguntas} preguntas</p>${s.destacados.map(c => `<div class="copybox" style="padding:10px 12px"><b>@${esc(c.username || 'usuario')}</b> · ${esc(c.text)}</div>`).join('')}` : `<div class="empty">${pub ? 'Instagram solo entrega los comentarios a la cuenta dueña de la publicación.' : 'Sin comentarios para analizar.'}</div>`}</div>
      </div>`;
    if (pub && p.referencia && p.referencia.serie) {
      const sr = p.referencia.serie;
      chart('ch-an1', { type: 'bar', data: { labels: sr.map(x => new Date(x.t).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })), datasets: [{ label: 'Me gusta', data: sr.map(x => x.likes), backgroundColor: sr.map(x => x.actual ? C.orange : C.muted), borderRadius: 4, maxBarThickness: 22 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => sr[c.dataIndex].actual ? 'Esta publicación' : '' } } }, scales: axes() } });
    } else {
      chart('ch-an1', { type: 'bar', data: { labels: ['Me gusta', 'Comentarios', 'Compartidos', 'Guardados'], datasets: [{ data: [k.meGusta, k.comentarios, k.compartidos, k.guardados], backgroundColor: [C.grape, C.violet, C.orange, C.green], borderRadius: 4, maxBarThickness: 26 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: C.grid }, border: { display: false } }, y: { grid: { display: false } } } } });
    }
    $('#an-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  iaHtml(r) {
    return `<h3 style="margin:0 0 4px">✦ ${esc(r.titular)}</h3><p style="margin:0 0 10px;color:var(--ink-2)">${esc(r.resumen_ejecutivo)}</p>
      <div class="grid g2"><div><h3>Hallazgos</h3>${list(r.hallazgos)}</div><div><h3>Acciones para las próximas 72 horas</h3>${list(r.recomendaciones, 'r')}${r.alertas && r.alertas.length ? `<h3>Alertas</h3>${list(r.alertas, 'a')}` : ''}</div></div>
      <p class="small muted" style="margin:10px 0 0">Generado con IA el ${fdate(r.generado)}. Revísalo antes de compartirlo.</p>`;
  },
  async ia(id) {
    const b = $('#ia-btn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Analizando con IA';
    try { const r = await api(`/api/publicaciones/${encodeURIComponent(id)}/ia`, { method: 'POST' }); $('#ia-box').innerHTML = Analizar.iaHtml(r); }
    catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Generar con IA'; }
  },
  async refreshAll() { toast('Actualizando publicaciones…'); await api('/api/publicaciones/actualizar', { method: 'POST' }); Analizar.load(); toast('Publicaciones actualizadas'); },
};

/* ---------------- Estudio de contenidos (IA) ---------------- */
// Reduce la imagen en el navegador (máx. 1568 px, JPEG) para enviarla rápido y dentro del límite.
function compress(file, max = 1568, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => { URL.revokeObjectURL(img.src); resolve({ blob: b, dataUrl: cv.toDataURL('image/jpeg', quality) }); }, 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

const Studio = {
  files: [],
  current: null,
  inited: false,
  load() {
    $('#ia-warn').innerHTML = App.estado.ia ? '' : '<div class="demo-banner"><b>IA sin activar:</b> agrega <code>ANTHROPIC_API_KEY</code> en las variables de entorno para generar contenidos.</div>';
    if (!Studio.inited) {
      Studio.inited = true;
      const drop = $('#drop'), input = $('#st-files');
      input.addEventListener('change', () => { Studio.add(input.files); input.value = ''; });
      ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => Studio.add(e.dataTransfer.files));
    }
    Studio.lib();
  },
  async add(fileList) {
    for (const f of [...fileList].filter(f => f.type.startsWith('image/'))) {
      if (Studio.files.length >= 4) break;
      try { Studio.files.push({ file: f, ...(await compress(f)) }); } catch (e) { toast(e.message); }
    }
    Studio.thumbs();
  },
  remove(i) { Studio.files.splice(i, 1); Studio.thumbs(); },
  thumbs() {
    $('#thumbs').innerHTML = Studio.files.map((x, i) => `<img src="${x.dataUrl}" alt="Imagen ${i + 1}" title="Quitar imagen" onclick="event.preventDefault();event.stopPropagation();Studio.remove(${i})">`).join('');
    $('#drop-txt').style.display = Studio.files.length ? 'none' : '';
  },
  async generar(ev) {
    ev.preventDefault();
    const b = $('#st-btn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Creando contenidos';
    $('#st-out').innerHTML = '<h2>2. Resultados</h2><div class="empty"><span class="spin"></span><br><br>Leyendo la imagen y escribiendo los textos…</div>';
    try {
      const body = Object.fromEntries(new FormData(ev.target));
      body.imagenes = Studio.files.map(x => ({ media_type: 'image/jpeg', data: x.dataUrl.split(',')[1] }));
      if (Studio.files[0]) {
        body.miniatura = (await compress(Studio.files[0].file, 360, 0.7)).dataUrl;
        if (App.estado.imagenes) {
          try { const fd = new FormData(); fd.append('imagen', Studio.files[0].blob, 'imagen.jpg'); body.imagenUrl = (await api('/api/imagenes', { method: 'POST', body: fd })).url; } catch { /* la imagen pública es opcional */ }
        }
      }
      const item = await api('/api/ia/contenido', { method: 'POST', body });
      Studio.show(item);
      Studio.lib();
    } catch (e) { toast(e.message); $('#st-out').innerHTML = `<h2>2. Resultados</h2><div class="empty">${esc(e.message)}</div>`; }
    b.disabled = false; b.textContent = 'Generar contenidos';
    return false;
  },
  show(item) {
    Studio.current = item;
    const r = item.resultado;
    const tag = h => (h.startsWith('#') ? h : '#' + h);
    Studio.tabs = {
      Instagram: [['Primera línea (gancho)', r.instagram.primera_linea], ['Texto completo', r.instagram.texto + '\n\n' + r.instagram.hashtags.map(tag).join(' ')]],
      Facebook: [['Publicación', r.facebook]],
      'X (Twitter)': [['Publicación', r.x]],
      WhatsApp: [['Mensaje', r.whatsapp]],
      'Nota de prensa': [['Título', r.nota_prensa.titulo], ['Entradilla', r.nota_prensa.entradilla], ['Cuerpo', r.nota_prensa.cuerpo], ['Cita', r.nota_prensa.cita]],
      SEO: [[`Título SEO (${r.seo.titulo.length} caracteres)`, r.seo.titulo], [`Meta descripción (${r.seo.meta_descripcion.length} caracteres)`, r.seo.meta_descripcion], ['Slug', r.seo.slug], ['Palabras clave', r.seo.palabras_clave.join(', ')], ['Texto alternativo de la imagen', r.texto_alternativo]],
      Correo: [['Asunto', r.correo.asunto], ['Vista previa', r.correo.preheader], ['Titular', r.correo.titular], ['Mensaje', r.correo.mensaje], ['Botón', r.correo.boton_texto], ['Cierre', r.correo.cierre]],
      Consejos: [['Recomendaciones de publicación', r.recomendaciones.map(x => '• ' + x).join('\n')], ['Lo que se ve en la imagen', r.descripcion_imagen]],
    };
    $('#st-out').innerHTML = `<div class="card-h"><h2>2. Resultados</h2><button class="btn sm hot" onclick="Studio.toEmail()">Crear correo con esto</button></div>
      <div class="tabs" id="st-tabs">${Object.keys(Studio.tabs).map((t, i) => `<button class="${i ? '' : 'on'}" data-t="${t}">${t}</button>`).join('')}</div><div id="st-tab"></div>`;
    $('#st-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) Studio.tab(b.dataset.t); });
    Studio.tab('Instagram');
  },
  tab(name) {
    document.querySelectorAll('#st-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === name));
    $('#st-tab').innerHTML = Studio.tabs[name].map(([t, x]) => `<div class="copybox" data-t="${esc(x)}"><h4>${esc(t)}</h4><button class="btn sm alt cp" onclick="copiar(this.parentElement.dataset.t, this)">Copiar</button><div>${esc(x)}</div></div>`).join('');
  },
  async toEmail() {
    const it = Studio.current; if (!it) return;
    const r = it.resultado.correo;
    try {
      const c = await api('/api/campanas', { method: 'POST', body: {
        nombre: (it.brief.tema || 'Campaña') + ' · ' + new Date().toLocaleDateString('es-CO'), asunto: r.asunto, preheader: r.preheader, titular: r.titular, mensaje: r.mensaje,
        botonTexto: r.boton_texto, botonUrl: it.brief.enlace || App.estado.defaults.botonUrl, cierre: r.cierre, imagenUrl: it.imagenUrl || '', imagenAlt: it.resultado.texto_alternativo, remitenteNombre: App.estado.remitenteNombre,
      } });
      toast('Campaña creada. Revísala y envía una prueba.');
      App.go('correos');
      setTimeout(() => Mail.editar(c.id), 600);
    } catch (e) { toast(e.message); }
  },
  async lib() {
    const items = await api('/api/contenidos').catch(() => []);
    Studio.items = items;
    $('#st-lib').innerHTML = items.length ? items.map(it => `<div class="it" onclick="Studio.open('${it.id}')"><div class="im">${it.miniatura ? `<img src="${esc(it.miniatura)}" alt="">` : '✦'}</div><div class="tx"><b>${esc(it.resultado.seo.titulo)}</b><div class="muted small">${fdate(it.creado)} · ${esc(it.autor || '')}</div></div></div>`).join('') : '<div class="empty">Aún no hay contenidos generados.</div>';
  },
  open(id) { const it = (Studio.items || []).find(x => x.id === id); if (it) { Studio.show(it); $('#st-out').scrollIntoView({ behavior: 'smooth' }); } },
};

/* ---------------- Correos ---------------- */
const Mail = {
  current: null,
  campaigns: [],
  async load() {
    const e = App.estado;
    $('#smtp-warn').innerHTML = (!e.smtp ? '<div class="demo-banner"><b>Modo prueba:</b> el envío real está desactivado hasta configurar el SMTP. Los correos se generan pero no salen.</div>' : '') +
      (!e.baseUrlPublica ? '<div class="demo-banner">La dirección del servidor es local (<code>' + esc(e.baseUrl) + '</code>). Define <code>BASE_URL</code> con la dirección pública.</div>' : '');
    const ct = await api('/api/contactos');
    $('#seg').innerHTML = `<option value="">Todos los contactos autorizados (${nf(ct.activos)})</option>` + ct.listas.map(l => `<option value="${esc(l)}">Lista: ${esc(l)}</option>`).join('');
    await Mail.list();
    if (!Mail.current) Mail.nueva();
  },
  async list() {
    Mail.campaigns = await api('/api/campanas');
    const st = { borrador: ['Borrador', ''], enviando: ['Enviando', 'live'], pausada: ['Pausada', 'warn'], completada: ['Completada', 'ok'] };
    $('#camp-list').innerHTML = Mail.campaigns.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Campaña</th><th>Estado</th><th style="min-width:140px">Progreso</th><th class="n">Enviados</th><th class="n">Apertura</th><th class="n">Clics</th><th class="n">Bajas</th><th></th></tr></thead><tbody>${Mail.campaigns.map(c => {
      const s = c.stats, [lbl, cls] = st[c.estado] || [c.estado, ''];
      const prog = s.total ? Math.round(100 * (s.total - s.pendientes) / s.total) : 0;
      return `<tr><td><b>${esc(c.nombre)}</b><div class="small muted">${esc(c.asunto)}</div></td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td><div class="bar"><i style="width:${prog}%"></i></div><div class="small muted">${prog}%${s.pendientes ? ` · ~${s.etaMinutos} min` : ''}</div></td>
      <td class="n">${nf(s.enviados)}</td><td class="n">${s.tasaApertura}%</td><td class="n"><b>${nf(s.clics)}</b> <span class="muted">(${s.tasaClic}%)</span></td><td class="n">${nf(s.bajas)}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
        ${['borrador', 'pausada'].includes(c.estado) ? `<button class="btn sm alt" onclick="Mail.editar('${c.id}')">Editar</button>` : ''}
        ${c.estado === 'enviando' ? `<button class="btn sm alt" onclick="Mail.pausar('${c.id}')">Pausar</button>` : ''}
        ${c.estado === 'pausada' ? `<button class="btn sm hot" onclick="Mail.reanudar('${c.id}')">Reanudar</button>` : ''}
        <button class="btn sm alt" onclick="Mail.detalle('${c.id}')">Ver</button>
        <a class="btn sm alt" target="_blank" href="/informe.html?tipo=correo&campana=${c.id}&imprimir=1">PDF</a>
        ${c.estado !== 'enviando' ? `<button class="btn sm danger" onclick="Mail.borrar('${c.id}')" title="Eliminar">✕</button>` : ''}
      </div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay campañas. Crea la primera con el formulario de arriba.</div>';
  },
  fill(c) {
    const f = $('#ed');
    for (const k of ['nombre', 'remitenteNombre', 'asunto', 'preheader', 'titular', 'mensaje', 'botonTexto', 'botonUrl', 'cierre', 'segmento', 'imagenUrl', 'imagenAlt']) if (f[k]) f[k].value = c[k] ?? '';
    Mail.preview();
  },
  nueva() {
    Mail.current = null;
    $('#ed-title').textContent = 'Nueva campaña';
    $('#ed-state').innerHTML = '';
    Mail.fill({ ...App.estado.defaults, remitenteNombre: App.estado.remitenteNombre, segmento: '' });
  },
  async editar(id) {
    if (!Mail.campaigns.find(x => x.id === id)) await Mail.list();
    const c = Mail.campaigns.find(x => x.id === id);
    if (!c) return;
    Mail.current = c;
    $('#ed-title').textContent = 'Editar campaña';
    $('#ed-state').innerHTML = `<span class="badge">${esc(c.estado)}</span>`;
    Mail.fill(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  values() { return Object.fromEntries(new FormData($('#ed'))); },
  preview() {
    clearTimeout(Mail.pt);
    Mail.pt = setTimeout(async () => {
      const v = Mail.values();
      const r = await api('/api/vista-previa', { method: 'POST', body: v });
      $('#n-from').textContent = r.remitente;
      $('#n-sub').textContent = r.asunto;
      $('#n-pre').textContent = v.preheader.replace(/\{\{\s*nombre\s*\}\}/gi, 'María');
      const n = $('#notif'); n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
      const fr = $('#frame');
      fr.onload = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch { /* sin acceso */ } };
      fr.srcdoc = r.html;
    }, 250);
  },
  async subirImagen(input) {
    const f = input.files[0]; if (!f) return;
    try {
      const { blob } = await compress(f, 1200, 0.85);
      const fd = new FormData(); fd.append('imagen', blob, 'imagen.jpg');
      const r = await api('/api/imagenes', { method: 'POST', body: fd });
      $('#ed').imagenUrl.value = r.url; Mail.preview(); toast('Imagen cargada');
    } catch (e) { toast(e.message); }
    input.value = '';
  },
  async guardar(silent) {
    const v = Mail.values();
    Mail.current = Mail.current ? await api('/api/campanas/' + Mail.current.id, { method: 'PUT', body: v }) : await api('/api/campanas', { method: 'POST', body: v });
    $('#ed-title').textContent = 'Editar campaña';
    if (!silent) toast('Campaña guardada');
    await Mail.list();
    return Mail.current;
  },
  async prueba() {
    const email = prompt('¿A qué correo enviamos la prueba?');
    if (!email) return;
    try {
      const c = await Mail.guardar(true);
      const r = await api(`/api/campanas/${c.id}/prueba`, { method: 'POST', body: { email, nombre: 'María' } });
      toast(r.simulado ? 'Prueba generada en modo prueba. Configura el SMTP para recibirla.' : 'Prueba enviada a ' + email);
    } catch (e) { toast(e.message); }
  },
  async enviar() {
    try {
      const c = await Mail.guardar(true);
      const seg = $('#seg').selectedOptions[0].textContent;
      if (!confirm(`¿Iniciar el envío de "${c.nombre}"?\n\nDestinatarios: ${seg}\nRitmo: 1 correo cada ${App.estado.delay} segundos.${App.estado.smtp ? '' : '\n\n(Modo prueba: no se enviarán correos reales.)'}`)) return;
      const r = await api(`/api/campanas/${c.id}/enviar`, { method: 'POST' });
      toast(`Envío iniciado: ${nf(r.stats.pendientes)} correos en cola (~${r.stats.etaMinutos} min).`);
      Mail.current = null; Mail.nueva(); Mail.list(); App.watchQueue();
    } catch (e) { toast(e.message); }
  },
  async pausar(id) { await api(`/api/campanas/${id}/pausar`, { method: 'POST' }); toast('Campaña pausada'); Mail.list(); App.watchQueue(); },
  async reanudar(id) { try { await api(`/api/campanas/${id}/enviar`, { method: 'POST' }); toast('Envío reanudado'); Mail.list(); App.watchQueue(); } catch (e) { toast(e.message); } },
  async borrar(id) { if (!confirm('¿Eliminar esta campaña y sus estadísticas?')) return; try { await api('/api/campanas/' + id, { method: 'DELETE' }); Mail.list(); } catch (e) { toast(e.message); } },
  async detalle(id) {
    const c = Mail.campaigns.find(x => x.id === id);
    $('#camp-detail').style.display = '';
    $('#cd-title').textContent = 'Actividad · ' + c.nombre;
    const [act, sends] = await Promise.all([api(`/api/campanas/${id}/actividad`), api(`/api/campanas/${id}/envios`)]);
    chart('ch-activity', { type: 'line', data: { labels: act.map(a => a.hora.slice(5, 13).replace('T', ' ') + 'h'), datasets: [
      { label: 'Enviados', data: act.map(a => a.enviados), borderColor: C.violet, backgroundColor: C.violet, borderWidth: 2, pointRadius: 3, tension: .3 },
      { label: 'Aperturas', data: act.map(a => a.aperturas), borderColor: C.blue, backgroundColor: C.blue, borderWidth: 2, pointRadius: 3, tension: .3 },
      { label: 'Clics', data: act.map(a => a.clics), borderColor: C.orange, backgroundColor: C.orange, borderWidth: 2, pointRadius: 3, tension: .3 },
    ] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: axes() } });
    const lbl = { pendiente: '', enviado: 'ok', error: 'bad', rebotado: 'bad', omitido: 'warn' };
    $('#cd-table').innerHTML = `<table class="t"><thead><tr><th>Persona</th><th>Estado</th><th>Enviado</th><th>Abrió</th><th>Clic</th></tr></thead><tbody>${sends.slice(0, 300).map(s => `<tr><td><b>${esc(s.nombre || '—')}</b><div class="small muted">${esc(s.email)}</div></td><td><span class="badge ${lbl[s.estado]}">${esc(s.estado)}${s.simulado ? ' (prueba)' : ''}</span>${s.bajaEn ? ' <span class="badge bad">baja</span>' : ''}${s.error && s.estado !== 'enviado' ? `<div class="small muted">${esc(s.error)}</div>` : ''}</td><td>${fdate(s.enviadoEn)}</td><td>${s.abiertoEn ? '✓ ' + fdate(s.abiertoEn) : '—'}</td><td>${s.clicEn ? '<b style="color:var(--orange)">✓</b> ' + fdate(s.clicEn) : '—'}</td></tr>`).join('')}</tbody></table>`;
    $('#camp-detail').scrollIntoView({ behavior: 'smooth' });
  },
};
document.addEventListener('input', e => { if (e.target.closest('#ed')) Mail.preview(); });

/* ---------------- Contactos ---------------- */
const Contacts = {
  async load() {
    const r = await api('/api/contactos?q=' + encodeURIComponent($('#ct-q').value || ''));
    $('#ct-kpis').innerHTML = [
      kpi('Contactos en la base', nf(r.total), '', C.violet),
      kpi('Listos para recibir', nf(r.activos), 'Autorizados y sin baja', C.green),
      kpi('Se dieron de baja', nf(r.bajas), 'Nunca se les vuelve a escribir', C.orange),
      kpi('Listas', nf(r.listas.length), esc(r.listas.slice(0, 3).join(' · ')), C.blue),
    ].join('');
    const maxC = Math.max(1, ...r.ciudades.map(c => c[1]));
    $('#ct-cities').innerHTML = r.ciudades.length ? `<div class="funnel">${r.ciudades.map(([n, v]) => `<div class="f"><span>${esc(n)}</span><div class="track"><i style="width:${100 * v / maxC}%;--c:${C.violet}"></i></div><b>${nf(v)}</b></div>`).join('')}</div>` : '<p class="muted">Agrega la columna <code>ciudad</code> en tu archivo para ver de qué municipios son tus contactos.</p>';
    $('#ct-table').innerHTML = r.items.length ? `<table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Ciudad</th><th>Listas</th><th>Estado</th><th></th></tr></thead><tbody>${r.items.map(c => `<tr><td>${esc(c.nombre || '—')}</td><td>${esc(c.email)}</td><td>${esc(c.ciudad || '')}</td><td class="small">${esc((c.listas || []).join(', '))}</td><td>${c.baja ? '<span class="badge bad">Baja</span>' : '<span class="badge ok">Activo</span>'}</td><td><button class="btn sm danger" onclick="Contacts.del('${esc(c.email)}')">✕</button></td></tr>`).join('')}</tbody></table>${r.total > 500 ? '<p class="small muted">Mostrando los 500 más recientes.</p>' : ''}` : '<div class="empty">Sube tu base de datos para empezar.</div>';
  },
  async subir(ev) {
    ev.preventDefault();
    try {
      const r = await api('/api/contactos/importar', { method: 'POST', body: new FormData(ev.target) });
      $('#up-res').innerHTML = `<div class="card" style="background:var(--soft);box-shadow:none"><b>Importación lista · ${esc(r.lista)}</b><ul class="list-steps"><li><b>${nf(r.nuevos)}</b> contactos nuevos</li><li>${nf(r.actualizados)} ya existían</li><li>${nf(r.duplicadosArchivo)} duplicados en el archivo</li><li>${nf(r.invalidos)} correos inválidos descartados</li>${r.sinAutorizacion ? `<li>${nf(r.sinAutorizacion)} sin autorización (no se importaron)</li>` : ''}${r.conBaja ? `<li>${nf(r.conBaja)} se habían dado de baja y siguen excluidos</li>` : ''}</ul></div>`;
      ev.target.reset();
      Contacts.load();
    } catch (e) { toast(e.message); }
    return false;
  },
  async del(email) { if (confirm('¿Eliminar este contacto?')) { await api('/api/contactos/' + encodeURIComponent(email), { method: 'DELETE' }); Contacts.load(); } },
};

/* ---------------- Cuenta de Instagram ---------------- */
const IG = {
  async account(force) {
    let r;
    try { r = await api('/api/cuenta' + (force === true ? '?force=1' : '')); } catch (e) { $('#acc-kpis').innerHTML = `<div class="card" style="grid-column:1/-1">${esc(e.message)}</div>`; return; }
    if (force === true) toast('Datos actualizados');
    const t = r.insights.totales, a = r.analisis;
    $('#demo-ig').innerHTML = demoBanner(r.demo);
    $('#acc-kpis').innerHTML = [
      kpi('Seguidores', nf(r.account.followers_count), '@' + esc(r.account.username), C.grape),
      kpi('Crecimiento neto 28 d', (a.netos >= 0 ? '+' : '') + nf(a.netos), `${nf(t.nuevosSeguidores)} nuevos · ${nf(t.dejaronDeSeguir)} se fueron`, C.green),
      kpi('Alcance 28 d', nf(t.reach), `${nf(t.views)} vistas`, C.blue),
      kpi('Interacciones 28 d', nf(t.total_interactions), `${nf(t.accounts_engaged)} cuentas`, C.violet),
      kpi('Compartidos / guardados', `${nf(t.shares)} / ${nf(t.saves)}`, 'Señales de intención', C.orange),
      kpi('Interacción promedio', a.promedioEngagement + '%', 'Sobre el alcance', C.violet),
    ].join('');
    const d = r.insights.seguidoresDiarios || [];
    chart('ch-acc-growth', { type: 'bar', data: { labels: d.map(x => x.fecha.slice(5)), datasets: [{ label: 'Seguidores nuevos', data: d.map(x => x.nuevos), backgroundColor: C.grape, borderRadius: 4, maxBarThickness: 18 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() } });
    const ps = [...a.posts].reverse();
    chart('ch-acc-posts', { type: 'bar', data: { labels: ps.map(p => new Date(p.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })), datasets: [{ label: 'Alcance', data: ps.map(p => p.analisis.kpis.alcance), backgroundColor: ps.map(p => p.media_product_type === 'REELS' ? C.orange : C.violet), borderRadius: 4, maxBarThickness: 26 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => (ps[c.dataIndex].media_product_type === 'REELS' ? 'Reel' : 'Publicación') + ' · ' + (ps[c.dataIndex].caption || '').slice(0, 40) } } }, scales: axes() } });
    $('#acc-table').innerHTML = `<table class="t"><thead><tr><th>Publicación</th><th>Tipo</th><th class="n">Alcance</th><th class="n">Interacciones</th><th class="n">Tasa</th><th class="n">Compartidos</th><th class="n">Puntaje</th><th></th></tr></thead><tbody>${[...a.posts].sort((x, y) => y.analisis.score - x.analisis.score).map(p => `<tr><td><b>${esc((p.caption || '').slice(0, 60) || '—')}</b><div class="small muted">${fdate(p.timestamp)}</div></td><td>${p.media_product_type === 'REELS' ? 'Reel' : 'Publicación'}</td><td class="n">${nf(p.analisis.kpis.alcance)}</td><td class="n">${nf(p.analisis.kpis.interacciones)}</td><td class="n">${p.analisis.kpis.engagementAlcance}%</td><td class="n">${nf(p.analisis.kpis.compartidos)}</td><td class="n"><b>${p.analisis.score}</b>/100</td><td><button class="btn sm alt" data-u="${esc(p.permalink)}" onclick="IG.analizar(this.dataset.u)">Analizar</button></td></tr>`).join('')}</tbody></table>`;
  },
  analizar(url) { App.go('analizar'); $('#an-url').value = url; Analizar.go(); },
};

/* ---------------- Informes ---------------- */
const Reports = {
  posts: [], camps: [],
  async load() {
    const [posts, camps] = await Promise.all([api('/api/publicaciones'), api('/api/campanas')]);
    Reports.posts = posts; Reports.camps = camps;
    const po = posts.map(p => `<option value="${esc(p.id)}">${esc(p.etiqueta || (p.media && p.media.caption || '').slice(0, 50) || p.url)}</option>`).join('');
    const co = camps.map(c => `<option value="${c.id}">${esc(c.nombre)} (${nf(c.stats.enviados)} enviados)</option>`).join('');
    $('#r-post').innerHTML = po || '<option value="">— Analiza primero una publicación —</option>';
    $('#r-camp').innerHTML = '<option value="">No incluir</option>' + co;
    $('#r-camp2').innerHTML = co || '<option value="">— Aún no hay campañas —</option>';
  },
  async open(tipo) {
    if (!Reports.posts.length && !Reports.camps.length) await Reports.load().catch(() => {});
    const q = new URLSearchParams({ tipo, imprimir: '1' });
    if (tipo === 'post') { if (!$('#r-post').value) return toast('Primero analiza una publicación'); q.set('post', $('#r-post').value); if ($('#r-camp').value) q.set('campana', $('#r-camp').value); }
    if (tipo === 'correo') { if (!$('#r-camp2').value) return toast('Primero crea una campaña'); q.set('campana', $('#r-camp2').value); }
    if (tipo === 'integral') { if (Reports.posts[0]) q.set('post', Reports.posts[0].id); if (Reports.camps[0]) q.set('campana', Reports.camps[0].id); }
    window.open('/informe.html?' + q, '_blank');
  },
};

App.init().catch(e => toast(e.message));
