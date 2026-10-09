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
  // Puede modificar (administrador); los de consulta solo ven.
  puede: () => App.estado && App.estado.rol === 'admin',
  permitido(v) { const b = document.querySelector(`.nav button[data-v="${v}"]`); return b && b.dataset.roles.split(',').includes(App.estado.rol); },
  go(v) {
    if (!document.getElementById('v-' + v) || !App.permitido(v)) v = 'inicio';
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    history.replaceState(null, '', '#' + v);
    ({ inicio: Inicio.load, piezas: Piezas.load, calendario: Cal.load, analizar: Analizar.load, resumen: App.refresh, estudio: Studio.load, correos: Mail.load, contactos: Contacts.load, instagram: IG.account, informes: Reports.load, ajustes: Ajustes.load })[v]?.();
    if (window.innerWidth < 860) document.querySelector('.view.on')?.scrollIntoView();
    window.scrollTo(0, 0);
  },
  async init() {
    App.estado = await api('/api/estado');
    $('#who').textContent = App.estado.nombre;
    document.querySelectorAll('[data-roles]').forEach(el => { el.style.display = el.dataset.roles.split(',').includes(App.estado.rol) ? '' : 'none'; });
    $('#delay-lbl').textContent = App.estado.delay;
    $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) App.go(b.dataset.v); });
    addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && !$('#v-' + v)?.classList.contains('on')) App.go(v); });
    App.go(location.hash.slice(1) || 'inicio');
    if (App.estado.bienvenida) App.bienvenida(App.estado.bienvenida);
    App.badge();
    if (App.estado.rol !== 'diseno') { App.watchQueue(); setInterval(App.watchQueue, 20000); }
    setInterval(App.badge, 60000);
  },
  async badge() {
    const ps = await api('/api/piezas').catch(() => null);
    if (!ps) return;
    const n = ps.filter(p => App.estado.rol === 'diseno' ? p.estado === 'cambios' : p.estado === 'revision').length;
    $('#badge-piezas').textContent = n || '';
  },
  bienvenida({ firma, mensaje }) {
    const el = document.createElement('div');
    el.className = 'welcome';
    el.innerHTML = `<div class="welcome-card" role="dialog" aria-modal="true" aria-label="Mensaje de bienvenida">
      <div class="welcome-heart">♥</div>
      <div class="welcome-from">${esc(firma)} te dice:</div>
      <p class="welcome-msg">${esc(mensaje)}</p>
      <button class="btn hot" type="button">Gracias ♥</button></div>`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('button')) close(); });
    addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', k); } });
    document.body.append(el);
    el.querySelector('button').focus();
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
  inited: false,
  async load() {
    const e = App.estado;
    if (!Mail.inited) {
      Mail.inited = true;
      $('#ed-tipo').innerHTML = Object.entries(e.tipos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
      $('#ed').addEventListener('change', ev => { if (ev.target.name === 'destino') Mail.destino(); });
      $('#btn-ia-correo').style.display = e.ia ? '' : 'none';
    }
    const rems = e.remitentes || [];
    $('#ed-rem').innerHTML = rems.length ? rems.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)} · ${esc(r.email)}</option>`).join('') : '<option value="">Sin correo configurado (modo prueba)</option>';
    $('#smtp-warn').innerHTML = (!rems.length ? '<div class="demo-banner"><b>Modo prueba:</b> aún no hay correos para enviar. Agrégalos en <a href="#ajustes">Ajustes y usuarios</a>; mientras tanto, los correos se generan pero no salen.</div>' : '') +
      (!e.baseUrlPublica ? '<div class="demo-banner">La dirección del panel es local (<code>' + esc(e.baseUrl) + '</code>). Define <code>BASE_URL</code> con la dirección pública.</div>' : '');
    const ct = await api('/api/contactos');
    $('#seg').innerHTML = `<option value="">Todos los contactos autorizados (${nf(ct.activos)})</option>` + ct.listas.map(l => `<option value="${esc(l)}">Lista: ${esc(l)}</option>`).join('');
    await Mail.list();
    if (!Mail.current) Mail.nueva();
  },
  destino() {
    const manual = $('#ed').querySelector('[name=destino]:checked').value === 'manual';
    $('#dest-base').style.display = manual ? 'none' : '';
    $('#dest-manual').style.display = manual ? '' : 'none';
    Mail.preview();
  },
  async list() {
    Mail.campaigns = await api('/api/campanas');
    const st = { borrador: ['Borrador', ''], enviando: ['Enviando', 'live'], pausada: ['Pausada', 'warn'], completada: ['Completado', 'ok'] };
    const tipos = App.estado.tipos;
    $('#camp-list').innerHTML = Mail.campaigns.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Correo</th><th>Estado</th><th style="min-width:130px">Progreso</th><th class="n">Enviados</th><th class="n">Apertura</th><th class="n">Clics</th><th class="n">Bajas</th><th></th></tr></thead><tbody>${Mail.campaigns.map(c => {
      const s = c.stats, [lbl, cls] = st[c.estado] || [c.estado, ''];
      const prog = s.total ? Math.round(100 * (s.total - s.pendientes) / s.total) : 0;
      return `<tr><td><b>${esc(c.nombre)}</b><div class="small muted">${esc(tipos[c.tipo] || 'Invitación')} · ${c.destino === 'manual' ? `${nf((c.manual || []).length)} correos escritos` : 'base de datos'}</div></td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td><div class="bar"><i style="width:${prog}%"></i></div><div class="small muted">${prog}%${s.pendientes ? ` · ~${s.etaMinutos} min` : ''}</div></td>
      <td class="n">${nf(s.enviados)}</td><td class="n">${s.tasaApertura}%</td><td class="n"><b>${nf(s.clics)}</b> <span class="muted">(${s.tasaClic}%)</span></td><td class="n">${nf(s.bajas)}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
        ${['borrador', 'pausada'].includes(c.estado) && App.puede() ? `<button class="btn sm alt" onclick="Mail.editar('${c.id}')">Editar</button>` : ''}
        ${App.puede() ? `<button class="btn sm alt" onclick="Mail.duplicar('${c.id}')" title="Crear uno nuevo a partir de este">Duplicar</button>` : ''}
        ${c.estado === 'enviando' && App.puede() ? `<button class="btn sm alt" onclick="Mail.pausar('${c.id}')">Pausar</button>` : ''}
        ${c.estado === 'pausada' && App.puede() ? `<button class="btn sm hot" onclick="Mail.reanudar('${c.id}')">Reanudar</button>` : ''}
        <button class="btn sm alt" onclick="Mail.detalle('${c.id}')">Ver</button>
        <a class="btn sm alt" target="_blank" href="/informe.html?tipo=correo&campana=${c.id}&imprimir=1">PDF</a>
        ${c.estado !== 'enviando' && App.puede() ? `<button class="btn sm danger" onclick="Mail.borrar('${c.id}')" title="Eliminar">✕</button>` : ''}
      </div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay correos. Crea el primero con el formulario de arriba.</div>';
  },
  CAMPOS: ['tipo', 'remitenteId', 'nombre', 'remitenteNombre', 'segmento', 'asunto', 'preheader', 'imagenUrl', 'imagenAlt', 'titular', 'mensaje', 'botonTexto', 'botonUrl', 'boton2Texto', 'boton2Url', 'notaBoton', 'cierre', 'logoUrl', 'motivo'],
  fill(c) {
    const f = $('#ed');
    for (const k of Mail.CAMPOS) if (f[k] && c[k] !== undefined) f[k].value = c[k] ?? '';
    if (c.remitenteId === undefined && f.remitenteId.options.length) f.remitenteId.selectedIndex = 0;
    f.querySelector(`[name=destino][value="${c.destino === 'manual' ? 'manual' : 'base'}"]`).checked = true;
    f.manualTexto.value = (c.manual || []).map(x => (x.nombre ? `${x.nombre} <${x.email}>` : x.email)).join('\n');
    Mail.destino();
  },
  nueva() {
    Mail.current = null;
    $('#ed-title').textContent = 'Nuevo correo';
    $('#ed-state').innerHTML = '';
    $('#ed').reset();
    Mail.fill({ ...App.estado.defaults, remitenteNombre: '', segmento: '', boton2Texto: '', boton2Url: '', logoUrl: '', motivo: '' });
  },
  usarPlantilla() {
    const tipo = $('#ed-tipo').value;
    const p = App.estado.plantillas[tipo];
    if (!p) return;
    if ($('#ed').mensaje.value && !confirm('Se reemplazará el texto actual por la plantilla. ¿Continuar?')) return;
    const f = $('#ed');
    for (const k of ['asunto', 'preheader', 'titular', 'mensaje', 'botonTexto', 'cierre', 'notaBoton', 'motivo']) if (f[k]) f[k].value = p[k] || '';
    Mail.preview();
    toast('Plantilla lista: completa los textos entre [corchetes].');
  },
  async redactarIA() {
    const idea = prompt('Cuéntame en una o dos frases qué quieres comunicar (evento, fecha, lugar, a quién va dirigido):');
    if (!idea) return;
    const b = $('#btn-ia-correo'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Redactando';
    try {
      const f = $('#ed');
      const r = await api('/api/ia/redactar-correo', { method: 'POST', body: { tipo: f.tipo.value, idea, enlace: f.botonUrl.value } });
      f.asunto.value = r.asunto; f.preheader.value = r.preheader; f.titular.value = r.titular; f.mensaje.value = r.mensaje; f.botonTexto.value = r.boton_texto; f.cierre.value = r.cierre;
      Mail.preview(); toast('Borrador listo. Revísalo antes de enviar.');
    } catch (e) { toast(e.message); }
    b.disabled = false; b.textContent = '✦ Redactar con IA';
  },
  async editar(id) {
    if (!Mail.campaigns.find(x => x.id === id)) await Mail.list();
    const c = Mail.campaigns.find(x => x.id === id);
    if (!c) return;
    Mail.current = c;
    $('#ed-title').textContent = 'Editar correo';
    $('#ed-state').innerHTML = `<span class="badge">${esc(c.estado)}</span>`;
    Mail.fill(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  async duplicar(id) {
    const c = Mail.campaigns.find(x => x.id === id);
    const copia = { ...c, nombre: c.nombre + ' (copia)' };
    copia.manualTexto = (c.manual || []).map(x => x.email).join('\n');
    for (const k of ['id', 'estado', 'stats', 'creado', 'iniciada', 'finalizada', 'nota', 'manual']) delete copia[k];
    try { const n = await api('/api/campanas', { method: 'POST', body: copia }); await Mail.list(); Mail.editar(n.id); toast('Copia creada'); } catch (e) { toast(e.message); }
  },
  values() { return Object.fromEntries(new FormData($('#ed'))); },
  preview() {
    clearTimeout(Mail.pt);
    Mail.pt = setTimeout(async () => {
      const v = Mail.values();
      const r = await api('/api/vista-previa', { method: 'POST', body: v }).catch(() => null);
      if (!r) return;
      $('#n-from').textContent = r.remitente;
      $('#n-email').textContent = r.remitenteEmail ? 'Desde ' + r.remitenteEmail : 'Modo prueba';
      $('#n-sub').textContent = r.asunto;
      $('#n-pre').textContent = (v.preheader || '').replace(/\{\{\s*nombre\s*\}\}/gi, 'María');
      const n = $('#notif'); n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
      const fr = $('#frame');
      fr.onload = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch { /* sin acceso */ } };
      fr.srcdoc = r.html;
      $('#as-score').textContent = `${r.revision.puntos}/100 · ${r.revision.nivel}`;
      $('#as-score').style.background = r.revision.puntos >= 85 ? '#e6f4ea' : r.revision.puntos >= 65 ? '#fdf3e1' : '#fdecea';
      $('#as-list').innerHTML = r.revision.checks.sort((a, b) => a.ok - b.ok).map(c => `<li class="${c.ok ? '' : 'aviso'}">${esc(c.texto)}</li>`).join('');
      if (r.manual) $('#manual-info').innerHTML = `<b>${nf(r.manual.validos)}</b> correos válidos${r.manual.invalidos.length ? ` · <span style="color:var(--bad)">revisa: ${esc(r.manual.invalidos.slice(0, 5).join(', '))}</span>` : ''}`;
    }, 300);
  },
  async subirImagen(input, campo) {
    const f = input.files[0]; if (!f) return;
    try {
      const { blob } = await compress(f, 1200, 0.88);
      const fd = new FormData(); fd.append('imagen', blob, 'imagen.jpg');
      const r = await api('/api/imagenes', { method: 'POST', body: fd });
      $('#ed')[campo].value = r.url; Mail.preview(); toast('Imagen cargada');
    } catch (e) { toast(e.message); }
    input.value = '';
  },
  async guardar(silent) {
    const v = Mail.values();
    Mail.current = Mail.current ? await api('/api/campanas/' + Mail.current.id, { method: 'PUT', body: v }) : await api('/api/campanas', { method: 'POST', body: v });
    $('#ed-title').textContent = 'Editar correo';
    if (!silent) toast('Correo guardado');
    await Mail.list();
    return Mail.current;
  },
  async prueba() {
    const email = prompt('¿A qué correo enviamos la prueba?');
    if (!email) return;
    try {
      const c = await Mail.guardar(true);
      const r = await api(`/api/campanas/${c.id}/prueba`, { method: 'POST', body: { email, nombre: 'María' } });
      toast(r.simulado ? 'Prueba generada en modo prueba. Agrega un correo para enviar en Ajustes.' : `Prueba enviada a ${email} desde ${r.remitente}`);
    } catch (e) { toast(e.message); }
  },
  async enviar() {
    try {
      const c = await Mail.guardar(true);
      const v = Mail.values();
      const dest = v.destino === 'manual' ? `${nf((c.manual || []).length)} correos escritos a mano` : $('#seg').selectedOptions[0].textContent;
      const rem = $('#ed-rem').selectedOptions[0] ? $('#ed-rem').selectedOptions[0].textContent : 'modo prueba';
      if (!confirm(`¿Enviar "${c.nombre}"?\n\nDesde: ${rem}\nPara: ${dest}\nRitmo: 1 correo cada ${App.estado.delay} segundos.${App.estado.smtp ? '' : '\n\n(Modo prueba: no saldrán correos reales.)'}`)) return;
      const r = await api(`/api/campanas/${c.id}/enviar`, { method: 'POST' });
      toast(`Envío iniciado: ${nf(r.stats.pendientes)} correos en cola (~${r.stats.etaMinutos} min).`);
      Mail.current = null; Mail.nueva(); Mail.list(); App.watchQueue();
    } catch (e) { toast(e.message); }
  },
  async pausar(id) { await api(`/api/campanas/${id}/pausar`, { method: 'POST' }); toast('Envío pausado'); Mail.list(); App.watchQueue(); },
  async reanudar(id) { try { await api(`/api/campanas/${id}/enviar`, { method: 'POST' }); toast('Envío reanudado'); Mail.list(); App.watchQueue(); } catch (e) { toast(e.message); } },
  async borrar(id) { if (!confirm('¿Eliminar este correo y sus estadísticas?')) return; try { await api('/api/campanas/' + id, { method: 'DELETE' }); Mail.list(); } catch (e) { toast(e.message); } },
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
    $('#ct-cities').innerHTML = r.ciudades.length ? `<div class="funnel">${r.ciudades.map(([n, v]) => `<div class="f"><span>${esc(n)}</span><div class="track"><i style="width:${100 * v / maxC}%;--c:${C.violet}"></i></div><b>${nf(v)}</b></div>`).join('')}</div>` : '<p class="muted">Cuando la base tenga la columna municipio o ciudad, aquí verás de dónde son tus contactos.</p>';
    $('#ct-table').innerHTML = r.items.length ? `<table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Municipio</th><th>Organización</th><th>Listas</th><th>Estado</th><th></th></tr></thead><tbody>${r.items.map(c => `<tr><td>${esc(c.nombre || '—')}${c.cargo ? `<div class="small muted">${esc(c.cargo)}</div>` : ''}</td><td>${esc(c.email)}</td><td>${esc(c.ciudad || '')}</td><td>${esc(c.organizacion || '')}</td><td class="small">${esc((c.listas || []).join(', '))}</td><td>${c.baja ? '<span class="badge bad">Baja</span>' : '<span class="badge ok">Activo</span>'}</td><td>${App.puede() ? `<button class="btn sm danger" onclick="Contacts.del('${esc(c.email)}')">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>${r.total > 500 ? '<p class="small muted">Mostrando los 500 más recientes.</p>' : ''}` : '<div class="empty">Sube tu primera base para empezar.</div>';
  },
  async analizar(ev) {
    ev.preventDefault();
    const file = ev.target.archivo.files[0]; if (!file) return false;
    Contacts.file = file;
    const box = $('#ct-analisis'); box.style.display = ''; box.innerHTML = '<div class="empty"><span class="spin"></span> Analizando la base…</div>';
    try {
      const fd = new FormData(); fd.append('archivo', file, file.name);
      const p = await api('/api/contactos/analizar', { method: 'POST', body: fd });
      const barras = (arr, color) => { const mx = Math.max(1, ...arr.map(x => x[1])); return `<div class="bars2">${arr.map(([n, v]) => `<div class="f"><span>${esc(n)}</span><div class="track" style="height:14px;background:var(--soft);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${100 * v / mx}%;background:${color}"></i></div><b class="n">${nf(v)}</b></div>`).join('')}</div>`; };
      box.innerHTML = `<div class="card-h"><h2>Diagnóstico de "${esc(p.archivo)}"</h2><span class="score-pill">Calidad ${p.calidad}%</span></div>
        <div class="grid g4">${[
          kpi('Filas en el archivo', nf(p.filas), `${p.columnas.length} columnas`, C.violet),
          kpi('Correos válidos', nf(p.validos), `${nf(p.invalidos)} con errores · ${nf(p.duplicados)} repetidos`, C.green),
          kpi('Listos para enviar', nf(Math.max(0, p.listosParaEnviar)), `${nf(p.yaExisten)} ya estaban en la base`, C.orange),
          kpi('Con nombre', nf(p.conNombre), `${nf(p.conCiudad)} con municipio · ${nf(p.conTelefono)} con teléfono`, C.blue),
        ].join('')}</div>
        ${p.alertas.length ? `<div class="demo-banner" style="margin-top:14px"><b>Para tener en cuenta:</b><ul class="f" style="margin-top:6px">${p.alertas.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
        <div class="grid g3" style="margin-top:14px">
          <div><h3>Columnas reconocidas</h3><ul class="checks">${p.columnas.map(c => `<li class="${c.campo ? '' : 'aviso'}">${esc(c.nombre)} → ${c.campo ? `<b>${esc(c.campo)}</b>` : 'no se usará'}</li>`).join('')}</ul></div>
          <div><h3>Municipios</h3>${p.ciudades.length ? barras(p.ciudades, C.violet) : '<p class="muted small">Sin columna de municipio.</p>'}</div>
          <div><h3>Proveedores de correo</h3>${barras(p.dominios, C.blue)}${p.organizaciones.length ? `<h3>Organizaciones</h3>${barras(p.organizaciones, C.grape)}` : ''}</div>
        </div>
        ${p.ejemplosInvalidos.length ? `<p class="small muted">Ejemplos de correos con error: ${esc(p.ejemplosInvalidos.join(', '))}</p>` : ''}
        ${App.puede() ? `<form onsubmit="return Contacts.importar(event)" style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px">
          <h2>2. Importar</h2>
          <label>Nombre de la lista</label><input type="text" name="lista" value="${esc(p.archivo.replace(/\.[^.]+$/, ''))}">
          <label class="check"><input type="checkbox" name="confirmo" value="si" required> Confirmo que estas personas autorizaron recibir comunicaciones (Ley 1581 de 2012, Habeas Data) o que se trata de contactos institucionales o de prensa.</label>
          <div class="row" style="margin-top:14px"><button class="btn hot" type="submit">Importar ${nf(Math.max(0, p.listosParaEnviar))} contactos</button><button class="btn alt" type="button" onclick="$('#ct-analisis').style.display='none'">Cancelar</button></div>
        </form>` : ''}`;
      box.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    return false;
  },
  async importar(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target); fd.append('archivo', Contacts.file, Contacts.file.name);
    try {
      const r = await api('/api/contactos/importar', { method: 'POST', body: fd });
      $('#ct-analisis').innerHTML = `<h2>Importación lista · ${esc(r.lista)}</h2><ul class="checks"><li><b>${nf(r.nuevos)}</b>&nbsp;contactos nuevos</li><li>${nf(r.actualizados)} ya existían y se actualizaron</li>${r.invalidos ? `<li class="aviso">${nf(r.invalidos)} correos con errores descartados</li>` : ''}${r.sinAutorizacion ? `<li class="aviso">${nf(r.sinAutorizacion)} sin autorización (no se importaron)</li>` : ''}${r.conBaja ? `<li class="aviso">${nf(r.conBaja)} se habían dado de baja y siguen excluidos</li>` : ''}</ul><div class="row" style="margin-top:12px"><button class="btn hot" onclick="App.go('correos');Mail.nueva()">Crear un correo para esta base</button></div>`;
      $('#up').reset(); $('#up .drop span').innerHTML = '<b>Elige o arrastra el archivo</b>';
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

/* ---------------- Ventana emergente ---------------- */
const Modal = {
  open(html, cls = '') {
    const m = $('#modal'), c = $('#modal-card');
    c.className = 'modal-card ' + cls;
    c.innerHTML = html;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    m.onclick = e => { if (e.target === m) Modal.close(); };
    Modal.esc = e => { if (e.key === 'Escape') Modal.close(); };
    addEventListener('keydown', Modal.esc);
  },
  close() { $('#modal').hidden = true; document.body.style.overflow = ''; removeEventListener('keydown', Modal.esc); },
  head: t => `<div class="modal-h"><h2>${t}</h2><button class="x" type="button" onclick="Modal.close()" aria-label="Cerrar">×</button></div>`,
};

/* ---------------- Subida de archivos (imágenes, videos, PDF) ---------------- */
const Archivo = {
  async subir(file, onProgress) {
    if (App.estado.blob) {
      // Sube directo a Vercel Blob (sirve para videos pesados).
      const { upload } = await import('/vendor/blob-client.js');
      const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
      const r = await upload('piezas/' + limpio, file, { access: 'public', handleUploadUrl: '/api/archivos/token', multipart: file.size > 8 * 1024 * 1024, onUploadProgress: p => onProgress && onProgress(p.percentage) });
      return { url: r.url, tipo: file.type, nombre: file.name };
    }
    const fd = new FormData(); fd.append('archivo', file, file.name);
    return api('/api/archivos', { method: 'POST', body: fd });
  },
  // Convierte una imagen o fotogramas de video en JPG para la revisión con IA.
  async fotogramas(url, tipo) {
    const toJpg = (src, w, h) => { const cv = document.createElement('canvas'); const s = Math.min(1, 1568 / Math.max(w, h)); cv.width = Math.round(w * s); cv.height = Math.round(h * s); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); return { media_type: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.85).split(',')[1] }; };
    if (tipo === 'video') {
      const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.src = url;
      await new Promise((ok, bad) => { v.onloadedmetadata = ok; v.onerror = () => bad(new Error('No se pudo leer el video.')); });
      const out = [];
      for (const f of [0.05, 0.25, 0.45, 0.65, 0.85, 0.98]) {
        v.currentTime = Math.max(0, v.duration * f);
        await new Promise(ok => { v.onseeked = ok; });
        out.push(toJpg(v, v.videoWidth, v.videoHeight));
      }
      return out;
    }
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('No se pudo leer la imagen.')); });
    return [toJpg(img, img.naturalWidth, img.naturalHeight)];
  },
};

/* ---------------- Inicio ---------------- */
const Inicio = {
  async load() {
    const e = App.estado, h = await api('/api/hoy');
    const hora = new Date().getHours();
    $('#hola').textContent = `${hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${e.nombre}`;
    $('#hoy-fecha').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
    const diseno = e.rol === 'diseno';
    $('#hoy-kpis').innerHTML = [
      kpi(diseno ? 'Mis piezas en revisión' : 'Piezas por revisar', nf(h.piezas.revision), h.piezas.revision ? 'Esperan visto bueno' : 'Todo al día', C.orange),
      kpi('Con cambios pedidos', nf(h.piezas.cambios), diseno ? 'Revisa los comentarios' : 'Esperando nueva versión', '#c0392b'),
      kpi('Publicaciones esta semana', nf(h.agenda.length), 'En el calendario', C.violet),
      diseno ? kpi('Aprobadas', nf(h.piezas.aprobadas), 'Listas para publicar', C.green) : kpi('Contactos en la base', nf(h.contactos), h.correo ? 'Enviando: ' + esc(h.correo.nombre) : 'Sin envíos en curso', C.blue),
    ].join('');
    const acciones = diseno
      ? [['Subir una pieza', 'piezas', '+', C.orange, 'Piezas.nueva()'], ['Ver calendario', 'calendario', '▦', C.violet]]
      : [['Revisar piezas', 'piezas', '✓', C.orange], ['Nuevo correo', 'correos', '✉', C.blue, "App.go('correos');Mail.nueva()"], ['Analizar un enlace', 'analizar', '↗', C.violet], ['Subir una base', 'contactos', '⇪', C.green], ['Planear publicación', 'calendario', '▦', C.grape]];
    $('#hoy-acciones').innerHTML = acciones.map(([t, v, i, c, fn]) => `<button type="button" onclick="${fn || `App.go('${v}')`}"><i style="background:${c}">${i}</i>${t}</button>`).join('');
    const est = App.estado.estadosPieza;
    $('#hoy-piezas').innerHTML = h.piezas.recientes.length ? h.piezas.recientes.map(p => `<div class="pcard" onclick="Piezas.abrir('${p.id}')"><div class="th">${p.miniatura && p.miniatura.tipo === 'imagen' ? `<img src="${esc(p.miniatura.url)}" alt="" loading="lazy">` : p.miniatura && p.miniatura.tipo === 'video' ? '▶' : '▢'}</div><div style="min-width:0"><b>${esc(p.titulo)}</b><div class="small muted">${esc(p.autorNombre || '')} · ${esc(p.canal)} · ${fdate(p.actualizado)}</div></div><span class="badge st-${p.estado}">${esc(est[p.estado])}</span></div>`).join('') : '<div class="empty">Aún no hay piezas.</div>';
    $('#hoy-agenda').innerHTML = Cal.listaHtml(h.agenda) || '<div class="empty">Nada programado esta semana. ¡Planea las publicaciones en el calendario!</div>';
    $('#hoy-tips').innerHTML = diseno
      ? '<h2>Para que las piezas salgan a la primera</h2><ul class="f r"><li>Revisa fechas, horas y nombres contra la información oficial antes de subir.</li><li>Sube la pieza con el texto que la acompañará en redes: también se revisa.</li><li>Cuando te pidan cambios, sube la nueva versión en la misma pieza (no crees otra).</li></ul>'
      : '<h2>Rutina de una oficina de prensa de alto nivel</h2><ul class="f r"><li><b>Mañana:</b> revisa piezas pendientes y la agenda del día.</li><li><b>Antes de publicar:</b> toda pieza pasa por la lista de verificación (ortografía, datos, logos).</li><li><b>Después de publicar:</b> analiza el enlace a las 24 horas y responde preguntas en comentarios.</li><li><b>Cada semana:</b> envía el boletín a la base y comparte el informe ejecutivo con el despacho.</li></ul>';
  },
};

/* ---------------- Piezas para revisión ---------------- */
const Piezas = {
  filtro: 'revision',
  items: [],
  async load() {
    Piezas.items = await api('/api/piezas');
    const est = App.estado.estadosPieza;
    const n = k => Piezas.items.filter(p => p.estado === k).length;
    $('#pz-tabs').innerHTML = [...Object.entries(est), ['todas', 'Todas']].map(([k, v]) => `<button class="${Piezas.filtro === k ? 'on' : ''}" onclick="Piezas.filtro='${k}';Piezas.load()">${v}${k !== 'todas' ? ` (${n(k)})` : ''}</button>`).join('');
    const lista = Piezas.items.filter(p => Piezas.filtro === 'todas' || p.estado === Piezas.filtro);
    $('#pz-grid').innerHTML = lista.length ? lista.map(p => {
      const v = p.versiones[p.versiones.length - 1];
      const media = !v ? '▢' : v.tipo === 'imagen' ? `<img src="${esc(v.url)}" alt="" loading="lazy">` : v.tipo === 'video' ? `<video src="${esc(v.url)}#t=0.5" muted preload="metadata"></video><span class="vt">▶ video</span>` : '<span>PDF</span>';
      return `<div class="pz" onclick="Piezas.abrir('${p.id}')"><div class="im">${media}</div><div class="tx"><b>${esc(p.titulo)}</b><div class="small muted">${esc(p.canal)}${p.fechaPublicacion ? ' · ' + esc(p.fechaPublicacion) : ''}</div><div class="row" style="justify-content:space-between;margin-top:8px"><span class="badge st-${p.estado}">${esc(est[p.estado])}</span><span class="small muted">v${p.versiones.length} · ${esc(p.autorNombre || p.autor)}</span></div></div></div>`;
    }).join('') : `<div class="card empty" style="grid-column:1/-1">No hay piezas en este estado.${App.estado.rol !== 'consulta' ? ' <a href="#" onclick="Piezas.nueva();return false">Sube una pieza</a>.' : ''}</div>`;
    App.badge();
  },
  nueva() {
    if (App.estado.rol === 'consulta') return toast('Tu usuario es de solo consulta.');
    if (!$('#v-piezas').classList.contains('on')) App.go('piezas');
    const canales = App.estado.canales.map(c => `<option>${esc(c)}</option>`).join('');
    Modal.open(`${Modal.head('Subir pieza para revisión')}
      <form id="pz-form" onsubmit="return Piezas.crear(event)">
        <label class="drop"><input type="file" name="archivo" accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf" required hidden onchange="Piezas.previa(this)"><span id="pz-prev"><b>Elige la imagen, video o PDF</b><br><span class="muted small">Afiches, publicaciones, historias, reels…</span></span></label>
        <label>Título</label><input type="text" name="titulo" required placeholder="Ej.: Afiche concierto central">
        <div class="grid g2"><div><label>Canal</label><select name="canal">${canales}</select></div><div><label>Fecha de publicación (opcional)</label><input type="date" name="fechaPublicacion"></div></div>
        <label>Texto que acompaña la publicación</label><textarea name="descripcion" style="min-height:100px" placeholder="El copy que irá en redes; también se revisa."></textarea>
        <div class="bar" id="pz-bar" style="display:none;margin-top:12px"><i style="width:0%"></i></div>
        <div class="row" style="margin-top:16px"><button class="btn hot" type="submit" id="pz-btn">Enviar a revisión</button><button class="btn alt" type="button" onclick="Modal.close()">Cancelar</button></div>
      </form>`, 'sm');
  },
  previa(input) {
    const f = input.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    $('#pz-prev').innerHTML = f.type.startsWith('image/') ? `<img src="${url}" alt="" style="max-height:200px;max-width:100%;border-radius:10px">` : f.type.startsWith('video/') ? `<video src="${url}" style="max-height:200px;max-width:100%;border-radius:10px" muted controls></video>` : `<b>${esc(f.name)}</b>`;
    const t = $('#pz-form').titulo; if (!t.value) t.value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  },
  async crear(ev) {
    ev.preventDefault();
    const f = ev.target, b = $('#pz-btn');
    const file = f.archivo.files[0];
    if (!file) return false;
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Subiendo';
    $('#pz-bar').style.display = '';
    try {
      const archivo = await Archivo.subir(file, p => { $('#pz-bar i').style.width = p + '%'; });
      const body = Object.fromEntries(new FormData(f)); delete body.archivo;
      const p = await api('/api/piezas', { method: 'POST', body: { ...body, archivo } });
      Modal.close(); toast('Pieza enviada a revisión'); Piezas.filtro = 'revision'; await Piezas.load(); Piezas.abrir(p.id);
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Enviar a revisión'; }
    return false;
  },
  async abrir(id, verN) {
    if (!Piezas.items.find(x => x.id === id)) Piezas.items = await api('/api/piezas');
    const p = Piezas.items.find(x => x.id === id); if (!p) return;
    const e = App.estado, admin = e.rol === 'admin', puedeSubir = e.rol !== 'consulta';
    const v = p.versiones[(verN || p.versiones.length) - 1];
    const media = !v ? '<div class="empty" style="color:#fff">Sin archivo</div>' : v.tipo === 'imagen' ? `<a href="${esc(v.url)}" target="_blank" rel="noopener"><img src="${esc(v.url)}" alt="${esc(p.titulo)}"></a>` : v.tipo === 'video' ? `<video src="${esc(v.url)}" controls playsinline></video>` : `<a class="btn alt" href="${esc(v.url)}" target="_blank" rel="noopener">Abrir PDF</a>`;
    const r = p.revisionIA && p.revisionIA.resultado;
    const iaHtml = r ? `<div class="ai-box" style="margin-top:12px"><h3 style="margin:0 0 6px">✦ Revisión con IA (versión ${p.revisionIA.version}) · ${esc(r.veredicto)}</h3><p class="small" style="margin:0 0 8px">${esc(r.resumen)}</p>
        ${r.ortografia.length ? `<b class="small">Ortografía</b><ul class="err-list">${r.ortografia.map(o => `<li><s>${esc(o.dice)}</s> → <b>${esc(o.debe_decir)}</b> <span class="muted">· ${esc(o.motivo)}</span></li>`).join('')}</ul>` : '<p class="small">✓ Sin errores de ortografía detectados.</p>'}
        ${r.datos.length ? `<b class="small">Datos por verificar</b>${list(r.datos)}` : ''}${r.diseno.length ? `<b class="small">Diseño</b>${list(r.diseno)}` : ''}${r.sugerencias.length ? `<b class="small">Sugerencias</b>${list(r.sugerencias, 'r')}` : ''}</div>` : '';
    const chk = e.checklist.map(([k, t]) => `<label><input type="checkbox" name="${k}" ${p.checklist && p.checklist[k] ? 'checked' : ''} ${admin ? '' : 'disabled'}> ${esc(t)}</label>`).join('');
    Modal.open(`${Modal.head(esc(p.titulo))}
      <div class="pzd">
        <div>
          <div class="view-media">${media}</div>
          <div class="vers">${p.versiones.map(x => `<button class="${x === v ? 'on' : ''}" onclick="Piezas.abrir('${p.id}', ${x.n})">Versión ${x.n} · ${new Date(x.subido).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</button>`).join('')}</div>
          ${p.descripcion ? `<h3>Texto que acompaña</h3><div class="copybox">${esc(p.descripcion)}</div>` : ''}
          ${puedeSubir ? `<label class="btn alt" style="margin-top:6px">Subir nueva versión<input type="file" hidden accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf" onchange="Piezas.version('${p.id}', this)"></label>` : ''}
          ${iaHtml}
        </div>
        <div>
          <div class="row" style="justify-content:space-between"><span class="badge st-${p.estado}">${esc(e.estadosPieza[p.estado])}</span><span class="small muted">${esc(p.canal)}${p.fechaPublicacion ? ' · ' + esc(p.fechaPublicacion) : ''} · por ${esc(p.autorNombre || p.autor)}</span></div>
          ${puedeSubir ? `<button class="btn sm alt" style="margin-top:10px" id="ia-pz" onclick="Piezas.revisarIA('${p.id}')">✦ Revisar ortografía y datos con IA</button>` : ''}
          <h3>Lista de verificación</h3><form class="chk" id="pz-chk">${chk}</form>
          <h3>Comentarios</h3>
          <div class="thread">${p.comentarios.length ? p.comentarios.map(c => `<div class="msg ${c.rol === 'diseno' ? 'diseno' : ''}"><b>${esc(c.autorNombre || c.autor)}</b>${c.decision ? ` · <span class="badge st-${c.decision}">${esc(e.estadosPieza[c.decision])}</span>` : ''}<div>${esc(c.texto)}</div><div class="meta">${fdate(c.fecha)} · versión ${c.version}</div></div>`).join('') : '<p class="muted small">Sin comentarios todavía.</p>'}</div>
          ${puedeSubir ? `<textarea id="pz-com" style="min-height:70px" placeholder="${admin ? 'Escribe qué hay que corregir (ej.: falta la tilde en Música, cambiar hora a 7:00 p. m.)' : 'Escribe un comentario para la jefatura'}"></textarea>` : ''}
          <div class="row" style="margin-top:10px">
            ${admin ? `<button class="btn" style="background:var(--good)" onclick="Piezas.decidir('${p.id}','aprobada')">✓ Aprobar</button><button class="btn danger" onclick="Piezas.decidir('${p.id}','cambios')">Pedir cambios</button><button class="btn alt" onclick="Piezas.decidir('${p.id}','publicada')">Marcar publicada</button>` : ''}
            ${puedeSubir ? `<button class="btn alt" onclick="Piezas.comentar('${p.id}')">Comentar</button>` : ''}
            ${admin ? `<button class="btn sm danger" onclick="Piezas.borrar('${p.id}')" title="Eliminar pieza">Eliminar</button>` : ''}
          </div>
        </div>
      </div>`);
  },
  async refrescar(id) { Piezas.items = await api('/api/piezas'); Piezas.abrir(id); Piezas.load(); },
  async version(id, input) {
    const f = input.files[0]; if (!f) return;
    toast('Subiendo nueva versión…');
    try { const a = await Archivo.subir(f); const nota = prompt('¿Qué cambiaste en esta versión? (opcional)') || ''; await api(`/api/piezas/${id}/version`, { method: 'POST', body: { ...a, nota } }); toast('Nueva versión enviada a revisión'); Piezas.refrescar(id); }
    catch (e) { toast(e.message); }
  },
  async comentar(id) {
    const t = $('#pz-com').value.trim(); if (!t) return toast('Escribe el comentario.');
    try { await api(`/api/piezas/${id}/comentario`, { method: 'POST', body: { texto: t } }); Piezas.refrescar(id); } catch (e) { toast(e.message); }
  },
  async decidir(id, estado) {
    const comentario = $('#pz-com').value.trim();
    if (estado === 'cambios' && !comentario) return toast('Escribe qué debe corregirse antes de pedir cambios.');
    const checklist = Object.fromEntries([...$('#pz-chk').querySelectorAll('input')].map(i => [i.name, i.checked]));
    if (estado === 'aprobada' && Object.values(checklist).some(x => !x) && !confirm('Hay puntos de la lista de verificación sin marcar. ¿Aprobar de todas formas?')) return;
    try { await api(`/api/piezas/${id}/decision`, { method: 'POST', body: { estado, comentario, checklist } }); toast(estado === 'aprobada' ? 'Pieza aprobada ✓' : estado === 'cambios' ? 'Cambios solicitados' : 'Marcada como publicada'); Piezas.refrescar(id); }
    catch (e) { toast(e.message); }
  },
  async revisarIA(id) {
    if (!App.estado.ia) return toast('La revisión con IA se activa al agregar ANTHROPIC_API_KEY en Vercel.');
    const p = Piezas.items.find(x => x.id === id); const v = p.versiones[p.versiones.length - 1];
    if (!v || v.tipo === 'pdf') return toast('La revisión con IA funciona con imágenes y videos.');
    const b = $('#ia-pz'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Revisando';
    try { const imagenes = await Archivo.fotogramas(v.url, v.tipo); await api('/api/ia/revisar-pieza', { method: 'POST', body: { pieza: id, imagenes } }); Piezas.refrescar(id); }
    catch (e) { toast(e.message); b.disabled = false; b.textContent = '✦ Revisar ortografía y datos con IA'; }
  },
  async borrar(id) { if (!confirm('¿Eliminar esta pieza y sus versiones?')) return; await api('/api/piezas/' + id, { method: 'DELETE' }); Modal.close(); Piezas.load(); },
};

/* ---------------- Calendario editorial ---------------- */
const Cal = {
  mes: null,
  eventos: [],
  iso: d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  async load() {
    if (!Cal.mes) { const d = new Date(); Cal.mes = new Date(d.getFullYear(), d.getMonth(), 1); }
    const y = Cal.mes.getFullYear(), m = Cal.mes.getMonth();
    const ini = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
    const fin = new Date(ini); fin.setDate(ini.getDate() + 41);
    Cal.eventos = await api(`/api/calendario?desde=${Cal.iso(ini)}&hasta=${Cal.iso(fin)}`);
    $('#cal-mes').textContent = Cal.mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
    $('#cal-nuevo').style.display = App.estado.rol === 'admin' ? '' : 'none';
    const hoy = Cal.iso(new Date());
    let html = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<div class="h">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(ini); d.setDate(ini.getDate() + i);
      const k = Cal.iso(d);
      const evs = Cal.eventos.filter(e => e.fecha === k);
      html += `<div class="day ${d.getMonth() !== m ? 'out' : ''} ${k === hoy ? 'today' : ''}" onclick="Cal.editar(null,'${k}')"><span class="n">${d.getDate()}</span>${evs.map(e => `<button class="ev ${e.estado}" onclick="event.stopPropagation();Cal.editar('${e.id}')" title="${esc(e.titulo)}">${e.hora ? e.hora + ' ' : ''}${esc(e.titulo)}</button>`).join('')}</div>`;
    }
    $('#cal').innerHTML = html;
    $('#cal-lista').innerHTML = Cal.listaHtml(Cal.eventos.filter(e => e.fecha >= hoy).slice(0, 15)) || '<div class="empty">No hay publicaciones programadas.</div>';
  },
  listaHtml(evs) {
    const est = App.estado.estadosCal;
    return evs.map(e => { const d = new Date(e.fecha + 'T12:00:00'); return `<div class="ag"><div class="d">${d.toLocaleDateString('es-CO', { weekday: 'short' })}<b>${d.getDate()}</b></div><div style="min-width:0"><b>${esc(e.titulo)}</b><div class="small muted">${e.hora ? e.hora + ' · ' : ''}${esc(e.canal || '')}${e.responsable ? ' · ' + esc(e.responsable) : ''}</div></div><span class="badge">${esc(est[e.estado])}</span></div>`; }).join('');
  },
  mover(n) { Cal.mes = new Date(Cal.mes.getFullYear(), Cal.mes.getMonth() + n, 1); Cal.load(); },
  editar(id, fecha) {
    const admin = App.estado.rol === 'admin';
    const e = id ? Cal.eventos.find(x => x.id === id) : { fecha: fecha || Cal.iso(new Date()), estado: 'idea' };
    if (!id && !admin) return;
    const ro = admin ? '' : 'disabled';
    Modal.open(`${Modal.head(id ? 'Publicación programada' : 'Programar publicación')}
      <form id="ev-form" onsubmit="return Cal.guardar(event)">
        <input type="hidden" name="id" value="${esc(e.id || '')}">
        <label>Título</label><input type="text" name="titulo" required value="${esc(e.titulo || '')}" ${ro} placeholder="Ej.: Reel de la cabalgata">
        <div class="grid g2"><div><label>Fecha</label><input type="date" name="fecha" required value="${esc(e.fecha)}" ${ro}></div><div><label>Hora</label><input type="time" name="hora" value="${esc(e.hora || '')}" ${ro}></div></div>
        <div class="grid g2"><div><label>Canal</label><select name="canal" ${ro}>${App.estado.canales.map(c => `<option ${c === e.canal ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div><label>Estado</label><select name="estado" ${ro}>${Object.entries(App.estado.estadosCal).map(([k, v]) => `<option value="${k}" ${k === e.estado ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
        <label>Responsable</label><input type="text" name="responsable" value="${esc(e.responsable || '')}" ${ro}>
        <label>Notas</label><textarea name="notas" style="min-height:80px" ${ro}>${esc(e.notas || '')}</textarea>
        ${e.piezaId ? `<p><a href="#" onclick="Modal.close();App.go('piezas');Piezas.abrir('${e.piezaId}');return false">Ver la pieza aprobada →</a></p>` : ''}
        ${admin ? `<div class="row" style="margin-top:16px"><button class="btn hot" type="submit">Guardar</button>${id ? `<button class="btn danger" type="button" onclick="Cal.borrar('${id}')">Eliminar</button>` : ''}</div>` : ''}
      </form>`, 'sm');
  },
  async guardar(ev) {
    ev.preventDefault();
    try { await api('/api/calendario', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); Modal.close(); toast('Guardado en el calendario'); Cal.load(); }
    catch (e) { toast(e.message); }
    return false;
  },
  async borrar(id) { if (!confirm('¿Eliminar del calendario?')) return; await api('/api/calendario/' + id, { method: 'DELETE' }); Modal.close(); Cal.load(); },
};

/* ---------------- Ajustes: usuarios, remitentes y conexiones ---------------- */
const Ajustes = {
  async load() {
    App.ajustes();
    const [us, rs] = await Promise.all([api('/api/usuarios'), api('/api/remitentes')]);
    App.estado.remitentes = rs;
    Ajustes.us = us; Ajustes.rs = rs;
    const roles = App.estado.roles;
    $('#usr-list').innerHTML = `<table class="t"><thead><tr><th>Usuario</th><th>Rol</th><th></th></tr></thead><tbody>${us.map(u => `<tr><td><b>${esc(u.nombre)}</b><div class="small muted">@${esc(u.usuario)}${u.activo === false ? ' · desactivado' : ''}</div></td><td>${esc((roles[u.rol] || u.rol).split(' (')[0])}${u.principal ? ' <span class="badge">principal</span>' : ''}</td><td>${u.principal ? '' : `<div class="row" style="justify-content:flex-end"><button class="btn sm alt" onclick="Ajustes.usuario('${esc(u.usuario)}')">Editar</button><button class="btn sm danger" onclick="Ajustes.borrarUsuario('${esc(u.usuario)}')">✕</button></div>`}</td></tr>`).join('')}</tbody></table>`;
    $('#rem-list').innerHTML = rs.length ? `<table class="t"><tbody>${rs.map(r => `<tr><td><b>${esc(r.nombre)}</b><div class="small muted">${esc(r.email)} · ${esc(r.host)}</div></td><td><div class="row" style="justify-content:flex-end"><button class="btn sm alt" onclick="Ajustes.probar('${r.id}', this)">Probar</button>${r.principal ? '<span class="badge">variables</span>' : `<button class="btn sm alt" onclick="Ajustes.remitente('${r.id}')">Editar</button><button class="btn sm danger" onclick="Ajustes.borrarRem('${r.id}')">✕</button>`}</div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aún no hay correos para enviar.</div>';
  },
  usuario(u) {
    const x = u ? Ajustes.us.find(y => y.usuario === u) : { rol: 'diseno', activo: true };
    Modal.open(`${Modal.head(u ? 'Editar usuario' : 'Nuevo usuario')}
      <form onsubmit="return Ajustes.guardarUsuario(event)">
        <label>Nombre de la persona</label><input type="text" name="nombre" required value="${esc(x.nombre || '')}" placeholder="Ej.: Carolina (diseño)">
        <label>Usuario para ingresar</label><input type="text" name="usuario" required value="${esc(x.usuario || '')}" ${u ? 'readonly' : ''} placeholder="sin espacios, ej.: carolina.diseno" autocomplete="off">
        <label>${u ? 'Nueva clave (déjala vacía para no cambiarla)' : 'Clave'}</label><input type="text" name="clave" ${u ? '' : 'required'} minlength="5" autocomplete="new-password" placeholder="Mínimo 5 caracteres">
        <label>Rol</label><select name="rol">${Object.entries(App.estado.roles).map(([k, v]) => `<option value="${k}" ${k === x.rol ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" name="activo" value="true" ${x.activo !== false ? 'checked' : ''}> Usuario activo</label>
        <div class="row" style="margin-top:16px"><button class="btn hot" type="submit">Guardar</button></div>
      </form>`, 'sm');
  },
  async guardarUsuario(ev) {
    ev.preventDefault();
    const b = Object.fromEntries(new FormData(ev.target)); b.activo = Boolean(b.activo);
    try { await api('/api/usuarios', { method: 'POST', body: b }); Modal.close(); toast(`Usuario guardado. Comparte el usuario "${b.usuario}" y la clave con la persona.`); Ajustes.load(); } catch (e) { toast(e.message); }
    return false;
  },
  async borrarUsuario(u) { if (!confirm(`¿Eliminar el usuario ${u}?`)) return; try { await api('/api/usuarios/' + encodeURIComponent(u), { method: 'DELETE' }); Ajustes.load(); } catch (e) { toast(e.message); } },
  remitente(id) {
    const r = id ? Ajustes.rs.find(x => x.id === id) : { port: 587 };
    Modal.open(`${Modal.head(id ? 'Editar correo de envío' : 'Agregar correo de envío')}
      <form onsubmit="return Ajustes.guardarRem(event)">
        <input type="hidden" name="id" value="${esc(r.id || '')}">
        <div class="grid g2"><div><label>Nombre que verán</label><input type="text" name="nombre" required value="${esc(r.nombre || '')}" placeholder="Alcaldía de Villa del Rosario"></div><div><label>Correo</label><input type="email" name="email" required value="${esc(r.email || '')}" placeholder="prensa@villadelrosario.gov.co"></div></div>
        <label>Responder a (opcional)</label><input type="email" name="replyTo" value="${esc(r.replyTo || '')}">
        <div class="grid g2"><div><label>Servidor SMTP</label><input type="text" name="host" required value="${esc(r.host || '')}" placeholder="smtp-relay.brevo.com"></div><div><label>Puerto</label><input type="text" name="port" value="${esc(r.port || 587)}"></div></div>
        <div class="grid g2"><div><label>Usuario SMTP</label><input type="text" name="user" required value="${esc(r.user || '')}" autocomplete="off"></div><div><label>Clave SMTP ${id ? '(vacía = no cambiar)' : ''}</label><input type="password" name="pass" ${id ? '' : 'required'} autocomplete="new-password"></div></div>
        <label>Máximo de correos por día (0 = sin límite)</label><input type="text" name="limiteDiario" value="${esc(r.limiteDiario || 0)}">
        <p class="small muted">Google Workspace: smtp.gmail.com, puerto 465, con una "contraseña de aplicación". Microsoft 365: smtp.office365.com, puerto 587. Brevo: smtp-relay.brevo.com, puerto 587.</p>
        <div class="row" style="margin-top:12px"><button class="btn hot" type="submit">Guardar</button></div>
      </form>`, 'sm');
  },
  async guardarRem(ev) {
    ev.preventDefault();
    try { await api('/api/remitentes', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); Modal.close(); toast('Correo guardado. Pulsa "Probar" para verificar la conexión.'); Ajustes.load(); } catch (e) { toast(e.message); }
    return false;
  },
  async probar(id, b) { b.disabled = true; b.textContent = 'Probando…'; try { await api(`/api/remitentes/${id}/probar`, { method: 'POST' }); toast('Conexión correcta ✓'); } catch (e) { toast(e.message); } b.disabled = false; b.textContent = 'Probar'; },
  async borrarRem(id) { if (!confirm('¿Eliminar este correo de envío?')) return; await api('/api/remitentes/' + id, { method: 'DELETE' }); Ajustes.load(); },
};

App.init().catch(e => toast(e.message));
