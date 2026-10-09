/* Panel Bioanalíticas */
const $ = (s, el = document) => el.querySelector(s);
const nf = n => Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fdate = t => t ? new Date(t).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const C = { violet: '#4a43b0', orange: '#e0661f', blue: '#2a8fb3', green: '#5a9e32', grape: '#9a5bd0', grid: '#eceaf6', ink2: '#55537a' };

async function api(url, opts = {}) {
  const o = { ...opts, headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) } };
  if (o.body && !(o.body instanceof FormData)) o.body = JSON.stringify(o.body);
  const r = await fetch(url, o);
  if (r.status === 401) { location.href = '/login'; throw new Error('Sesión vencida'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4200);
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
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}
const axes = (stacked = false) => ({
  x: { grid: { display: false }, stacked, ticks: { maxRotation: 0, autoSkip: true } },
  y: { grid: { color: C.grid }, border: { display: false }, beginAtZero: true, stacked, ticks: { callback: v => nf(v) } },
});
const kpi = (l, v, s, color) => `<div class="kpi" style="--accent:${color}"><div class="l"><span class="dot"></span>${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
const demoBanner = d => d ? '<div class="demo-banner"><b>Modo demostración:</b> Instagram aún no está conectado. Las cifras son de ejemplo y no representan la cuenta real. Conéctalo en <a href="#" onclick="App.go(\'ajustes\');return false">Ajustes</a>.</div>' : '';

/* ---------------- Navegación ---------------- */
const App = {
  estado: null,
  go(v) {
    if (!document.getElementById('v-' + v)) v = 'resumen';
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    history.replaceState(null, '', '#' + v);
    ({ resumen: App.refresh, correos: Mail.load, contactos: Contacts.load, instagram: IG.load, informes: Reports.load, ajustes: App.ajustes })[v]?.();
    window.scrollTo(0, 0);
  },
  async init() {
    App.estado = await api('/api/estado');
    $('#who').textContent = App.estado.usuario;
    $('#delay-lbl').textContent = App.estado.delay;
    $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) App.go(b.dataset.v); });
    App.go(location.hash.slice(1) || 'resumen');
    addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && !$('#v-' + v)?.classList.contains('on')) App.go(v); });
    setInterval(() => { if ($('#v-resumen').classList.contains('on')) App.refresh(true); if ($('#v-correos').classList.contains('on')) Mail.list(); }, 15000);
  },
  async refresh(silent) {
    const r = await api('/api/resumen');
    const c = r.correos;
    let acc = App.acc;
    if (!acc || !silent) { try { acc = App.acc = await api('/api/cuenta'); } catch (e) { acc = null; } }
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
    $('#sending').innerHTML = r.enviando ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><div class="row"><span class="badge live">Enviando</span><b>${esc(r.enviando.nombre)}</b></div><span class="muted small">${nf(r.enviando.stats.enviados)} de ${nf(r.enviando.stats.total)} · faltan ~${r.enviando.stats.etaMinutos} min</span></div><div class="bar"><i style="width:${r.enviando.stats.total ? 100 * (r.enviando.stats.total - r.enviando.stats.pendientes) / r.enviando.stats.total : 0}%"></i></div>${r.enviando.nota ? `<p class="small muted">${esc(r.enviando.nota)}</p>` : ''}</div>` : '';
    const max = Math.max(c.enviados, 1);
    $('#funnel').innerHTML = [['Enviados', c.enviados, C.violet], ['Abrieron', c.abiertos, C.blue], ['Clic en el botón', c.clics, C.orange]]
      .map(([l, v, col]) => `<div class="f"><span>${l}</span><div class="track"><i style="width:${100 * v / max}%;--c:${col}"></i></div><b>${nf(v)}</b></div>`).join('') +
      (c.bajas ? `<p class="small muted">${nf(c.bajas)} personas se dieron de baja.</p>` : '');
    if (acc) {
      const d = acc.insights.seguidoresDiarios || [];
      chart('ch-followers', { type: 'bar', data: { labels: d.map(x => x.fecha.slice(5)), datasets: [{ label: 'Seguidores nuevos', data: d.map(x => x.nuevos), backgroundColor: C.grape, borderRadius: 4, maxBarThickness: 18 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() } });
    }
    $('#res-posts').innerHTML = r.publicaciones.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Publicación</th><th class="n">Alcance</th><th class="n">Me gusta</th><th class="n">Comentarios</th><th class="n">Compartidos</th><th class="n">Guardados</th><th></th></tr></thead><tbody>${r.publicaciones.map(p => { const i = p.insights || {}; return `<tr><td><b>${esc(p.etiqueta || (p.media && p.media.caption || '').slice(0, 50) || p.url)}</b>${p.demo ? ' <span class="badge warn">demo</span>' : ''}<div class="small muted">${esc(p.url)}</div></td><td class="n">${nf(i.reach)}</td><td class="n">${nf(i.likes)}</td><td class="n">${nf(i.comments)}</td><td class="n">${nf(i.shares)}</td><td class="n">${nf(i.saved)}</td><td><a class="btn sm alt" target="_blank" href="/informe.html?tipo=post&post=${p.id}">Informe</a></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay publicaciones. Pega un enlace en la sección Instagram.</div>';
  },
  ajustes() {
    const e = App.estado;
    const line = (t, ok, okTxt, noTxt) => `<div class="status-line"><div><b>${t}</b><div class="small muted">${ok ? okTxt : noTxt}</div></div><span class="badge ${ok ? 'ok' : 'warn'}">${ok ? 'Conectado' : 'Pendiente'}</span></div>`;
    $('#status').innerHTML =
      line('Envío de correos (SMTP)', e.smtp, `Remitente: ${esc(e.remitenteNombre)} &lt;${esc(e.remitente)}&gt;`, 'Modo prueba: los correos se guardan en data/outbox. Configura SMTP_HOST, SMTP_USER, SMTP_PASS y FROM_EMAIL.') +
      line('Instagram', e.instagram, 'API oficial de Instagram conectada.', 'Mostrando datos de demostración. Configura IG_ACCESS_TOKEN e IG_USER_ID.') +
      line('Dirección pública (seguimiento)', e.baseUrlPublica, esc(e.baseUrl), `Ahora es ${esc(e.baseUrl)}. Para medir aperturas y clics reales, BASE_URL debe ser la dirección pública del servidor.`) +
      `<div class="status-line"><div><b>Ritmo de envío</b><div class="small muted">Un correo cada ${e.delay} segundos (${Math.round(3600 / e.delay)} por hora)${e.limiteDiario ? ` · máximo ${nf(e.limiteDiario)} al día` : ''}</div></div><span class="badge">Activo</span></div>`;
  },
};

/* ---------------- Correos ---------------- */
const Mail = {
  current: null,
  campaigns: [],
  async load() {
    const e = App.estado;
    $('#smtp-warn').innerHTML = (!e.smtp ? '<div class="demo-banner"><b>Modo prueba:</b> el envío real está desactivado hasta configurar el SMTP. Los correos se generan y quedan guardados en <code>data/outbox</code> para revisión.</div>' : '') +
      (!e.baseUrlPublica ? '<div class="demo-banner">La dirección del servidor es local (<code>' + esc(e.baseUrl) + '</code>). Define <code>BASE_URL</code> con la dirección pública para que el logo, las aperturas y los clics funcionen en los correos reales.</div>' : '');
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
      return `<tr><td><b>${esc(c.nombre)}</b><div class="small muted">${esc(c.asunto)}</div>${c.nota ? `<div class="small" style="color:var(--warn)">${esc(c.nota)}</div>` : ''}</td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td><div class="bar"><i style="width:${prog}%"></i></div><div class="small muted">${prog}%${s.pendientes ? ` · ~${s.etaMinutos} min` : ''}</div></td>
      <td class="n">${nf(s.enviados)}</td><td class="n">${s.tasaApertura}%</td><td class="n"><b>${nf(s.clics)}</b> <span class="muted">(${s.tasaClic}%)</span></td><td class="n">${nf(s.bajas)}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
        ${['borrador', 'pausada'].includes(c.estado) ? `<button class="btn sm alt" onclick="Mail.editar('${c.id}')">Editar</button>` : ''}
        ${c.estado === 'enviando' ? `<button class="btn sm alt" onclick="Mail.pausar('${c.id}')">Pausar</button>` : ''}
        ${c.estado === 'pausada' ? `<button class="btn sm hot" onclick="Mail.reanudar('${c.id}')">Reanudar</button>` : ''}
        <button class="btn sm alt" onclick="Mail.detalle('${c.id}')">Ver</button>
        <a class="btn sm alt" target="_blank" href="/informe.html?tipo=correo&campana=${c.id}">Informe</a>
        ${c.estado !== 'enviando' ? `<button class="btn sm danger" onclick="Mail.borrar('${c.id}')" title="Eliminar">✕</button>` : ''}
      </div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay campañas. Crea la primera con el formulario de arriba.</div>';
  },
  fill(c) {
    const f = $('#ed');
    for (const k of ['nombre', 'remitenteNombre', 'asunto', 'preheader', 'titular', 'mensaje', 'botonTexto', 'botonUrl', 'cierre', 'segmento']) if (f[k]) f[k].value = c[k] ?? '';
    Mail.preview();
  },
  nueva() {
    Mail.current = null;
    $('#ed-title').textContent = 'Nueva campaña';
    $('#ed-state').innerHTML = '';
    Mail.fill({ ...App.estado.defaults, remitenteNombre: App.estado.remitenteNombre, segmento: '' });
  },
  editar(id) {
    const c = Mail.campaigns.find(x => x.id === id);
    Mail.current = c;
    $('#ed-title').textContent = 'Editar campaña';
    $('#ed-state').innerHTML = `<span class="badge">${esc(c.estado)}</span>`;
    Mail.fill(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  values() { return Object.fromEntries(new FormData($('#ed'))); },
  async preview() {
    clearTimeout(Mail.pt);
    Mail.pt = setTimeout(async () => {
      const v = Mail.values();
      const r = await api('/api/vista-previa', { method: 'POST', body: v });
      $('#n-from').textContent = r.remitente;
      $('#n-sub').textContent = r.asunto;
      $('#n-pre').textContent = v.preheader.replace(/\{\{\s*nombre\s*\}\}/gi, 'María');
      $('#notif').style.animation = 'none'; void $('#notif').offsetWidth; $('#notif').style.animation = '';
      const fr = $('#frame');
      fr.onload = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch { /* sin acceso */ } };
      fr.srcdoc = r.html;
    }, 250);
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
      toast(r.simulado ? 'Prueba generada en modo prueba (data/outbox). Configura el SMTP para recibirla.' : 'Prueba enviada a ' + email);
    } catch (e) { toast(e.message); }
  },
  async enviar() {
    try {
      const c = await Mail.guardar(true);
      const seg = $('#seg').selectedOptions[0].textContent;
      if (!confirm(`¿Iniciar el envío de "${c.nombre}"?\n\nDestinatarios: ${seg}\nRitmo: 1 correo cada ${App.estado.delay} segundos.${App.estado.smtp ? '' : '\n\n(Modo prueba: no se enviarán correos reales.)'}`)) return;
      const r = await api(`/api/campanas/${c.id}/enviar`, { method: 'POST' });
      toast(`Envío iniciado: ${nf(r.stats.pendientes)} correos en cola (~${r.stats.etaMinutos} min).`);
      Mail.current = null; Mail.nueva(); Mail.list();
    } catch (e) { toast(e.message); }
  },
  async pausar(id) { await api(`/api/campanas/${id}/pausar`, { method: 'POST' }); toast('Campaña pausada'); Mail.list(); },
  async reanudar(id) { try { await api(`/api/campanas/${id}/enviar`, { method: 'POST' }); toast('Envío reanudado'); Mail.list(); } catch (e) { toast(e.message); } },
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
      kpi('Listas', nf(r.listas.length), r.listas.slice(0, 3).join(' · '), C.blue),
    ].join('');
    $('#ct-table').innerHTML = r.items.length ? `<table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Ciudad</th><th>Listas</th><th>Estado</th><th></th></tr></thead><tbody>${r.items.map(c => `<tr><td>${esc(c.nombre || '—')}</td><td>${esc(c.email)}</td><td>${esc(c.ciudad || '')}</td><td class="small">${esc((c.listas || []).join(', '))}</td><td>${c.baja ? '<span class="badge bad">Baja</span>' : '<span class="badge ok">Activo</span>'}</td><td><button class="btn sm danger" onclick="Contacts.del('${c.id}')">✕</button></td></tr>`).join('')}</tbody></table>${r.total > 500 ? '<p class="small muted">Mostrando los 500 más recientes.</p>' : ''}` : '<div class="empty">Sube tu base de datos para empezar.</div>';
  },
  async subir(ev) {
    ev.preventDefault();
    try {
      const r = await api('/api/contactos/importar', { method: 'POST', body: new FormData(ev.target) });
      $('#up-res').innerHTML = `<div class="card" style="background:var(--soft);box-shadow:none"><b>Importación lista · ${esc(r.lista)}</b><ul class="list-steps"><li><b>${nf(r.nuevos)}</b> contactos nuevos</li><li>${nf(r.actualizados)} ya existían (se actualizaron)</li><li>${nf(r.duplicadosArchivo)} duplicados en el archivo</li><li>${nf(r.invalidos)} correos inválidos descartados</li>${r.sinAutorizacion ? `<li>${nf(r.sinAutorizacion)} sin autorización (no se importaron)</li>` : ''}${r.conBaja ? `<li>${nf(r.conBaja)} se habían dado de baja y se mantienen excluidos</li>` : ''}</ul></div>`;
      ev.target.reset();
      Contacts.load();
    } catch (e) { toast(e.message); }
    return false;
  },
  async del(id) { if (confirm('¿Eliminar este contacto?')) { await api('/api/contactos/' + id, { method: 'DELETE' }); Contacts.load(); } },
};

/* ---------------- Instagram ---------------- */
const IG = {
  async load() { await Promise.all([IG.posts(), IG.account()]); },
  async posts() {
    const posts = await api('/api/publicaciones');
    $('#posts').innerHTML = posts.length ? posts.map(p => {
      const i = p.insights || {}, m = p.media || {};
      const eng = i.reach ? (100 * (i.total_interactions || 0) / i.reach).toFixed(1) : '0';
      return `<div class="card"><div class="post"><div class="thumb">${m.thumbnail_url || (m.media_type === 'IMAGE' && m.media_url) ? `<img src="${esc(m.thumbnail_url || m.media_url)}" alt="">` : '🍇'}</div><div>
        <div class="row" style="justify-content:space-between"><h3>${esc(p.etiqueta || 'Publicación')}</h3>${p.demo ? '<span class="badge warn">demo</span>' : ''}</div>
        <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.caption || '').slice(0, 110))}</div>
        <div class="small muted">Actualizado ${fdate(p.actualizado)}${p.error ? ` · <span style="color:var(--bad)">${esc(p.error)}</span>` : ''}</div></div></div>
        <div class="minis">
          <div class="mini"><b>${nf(i.reach)}</b><span>Alcance</span></div><div class="mini"><b>${nf(i.likes)}</b><span>Me gusta</span></div>
          <div class="mini"><b>${nf(i.comments)}</b><span>Comentarios</span></div><div class="mini"><b>${nf(i.shares)}</b><span>Compartidos</span></div>
          <div class="mini"><b>${nf(i.saved)}</b><span>Guardados</span></div><div class="mini"><b>${nf(i.views)}</b><span>Vistas</span></div>
          <div class="mini"><b>${eng}%</b><span>Interacción</span></div><div class="mini"><b>${nf(i.follows)}</b><span>Nuevos seguidores</span></div>
        </div>
        <div class="row" style="margin-top:14px"><a class="btn sm hot" target="_blank" href="/informe.html?tipo=post&post=${p.id}">Informe ejecutivo PDF</a><a class="btn sm alt" target="_blank" rel="noopener" href="${esc(p.url)}">Ver en Instagram</a><button class="btn sm danger" onclick="IG.del('${p.id}')">Quitar</button></div></div>`;
    }).join('') : '<div class="card empty span2">Pega arriba el enlace de una publicación para analizarla.</div>';
  },
  async add(ev) {
    ev.preventDefault();
    const b = ev.target.querySelector('button'); b.disabled = true; b.textContent = 'Analizando…';
    try { await api('/api/publicaciones', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); ev.target.reset(); toast('Publicación analizada'); IG.posts(); }
    catch (e) { toast(e.message); }
    b.disabled = false; b.textContent = 'Analizar publicación';
    return false;
  },
  async del(id) { if (confirm('¿Dejar de monitorear esta publicación?')) { await api('/api/publicaciones/' + id, { method: 'DELETE' }); IG.posts(); } },
  async account(force) {
    let r;
    try { r = App.acc = await api('/api/cuenta' + (force ? '?force=1' : '')); } catch (e) { $('#acc-kpis').innerHTML = `<div class="card span2" style="grid-column:1/-1">${esc(e.message)}</div>`; return; }
    if (force) { await api('/api/publicaciones/actualizar', { method: 'POST' }); IG.posts(); toast('Datos actualizados'); }
    const t = r.insights.totales, a = r.analisis;
    $('#demo-ig').innerHTML = demoBanner(r.demo);
    $('#acc-kpis').innerHTML = [
      kpi('Seguidores', nf(r.account.followers_count), '@' + esc(r.account.username), C.grape),
      kpi('Crecimiento neto 28 d', (a.netos >= 0 ? '+' : '') + nf(a.netos), `${nf(t.nuevosSeguidores)} nuevos · ${nf(t.dejaronDeSeguir)} se fueron`, C.green),
      kpi('Alcance 28 d', nf(t.reach), `${nf(t.views)} vistas`, C.blue),
      kpi('Interacciones 28 d', nf(t.total_interactions), `${nf(t.accounts_engaged)} cuentas`, C.violet),
      kpi('Compartidos / guardados', `${nf(t.shares)} / ${nf(t.saves)}`, 'Señales de intención', C.orange),
      kpi('Interacción promedio', a.promedioEngagement + '%', 'Sobre el alcance, últimas publicaciones', C.violet),
    ].join('');
    const d = r.insights.seguidoresDiarios || [];
    chart('ch-acc-growth', { type: 'bar', data: { labels: d.map(x => x.fecha.slice(5)), datasets: [{ label: 'Seguidores nuevos', data: d.map(x => x.nuevos), backgroundColor: C.grape, borderRadius: 4, maxBarThickness: 18 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() } });
    const ps = [...a.posts].reverse();
    chart('ch-acc-posts', { type: 'bar', data: { labels: ps.map(p => new Date(p.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })), datasets: [{ label: 'Alcance', data: ps.map(p => p.analisis.kpis.alcance), backgroundColor: ps.map(p => p.media_product_type === 'REELS' ? C.orange : C.violet), borderRadius: 4, maxBarThickness: 26 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => (ps[c.dataIndex].media_product_type === 'REELS' ? 'Reel' : 'Publicación') + ' · ' + (ps[c.dataIndex].caption || '').slice(0, 40) } } }, scales: axes() } });
    $('#acc-table').innerHTML = `<p class="small muted"><span class="dot" style="--accent:${C.violet}"></span> Publicación &nbsp; <span class="dot" style="--accent:${C.orange}"></span> Reel</p><table class="t"><thead><tr><th>Publicación</th><th>Tipo</th><th class="n">Alcance</th><th class="n">Interacciones</th><th class="n">Tasa</th><th class="n">Compartidos</th><th class="n">Puntaje</th><th></th></tr></thead><tbody>${[...a.posts].sort((x, y) => y.analisis.score - x.analisis.score).map(p => `<tr><td><b>${esc((p.caption || '').slice(0, 60) || '—')}</b><div class="small muted">${fdate(p.timestamp)}</div></td><td>${p.media_product_type === 'REELS' ? 'Reel' : 'Publicación'}</td><td class="n">${nf(p.analisis.kpis.alcance)}</td><td class="n">${nf(p.analisis.kpis.interacciones)}</td><td class="n">${p.analisis.kpis.engagementAlcance}%</td><td class="n">${nf(p.analisis.kpis.compartidos)}</td><td class="n"><b>${p.analisis.score}</b>/100</td><td><button class="btn sm alt" onclick="IG.track('${esc(p.permalink)}')">Monitorear</button></td></tr>`).join('')}</tbody></table>`;
  },
  async track(url) {
    try { await api('/api/publicaciones', { method: 'POST', body: { url } }); toast('Publicación agregada al monitoreo'); IG.posts(); } catch (e) { toast(e.message); }
  },
};

/* ---------------- Informes ---------------- */
const Reports = {
  async load() {
    const [posts, camps] = await Promise.all([api('/api/publicaciones'), api('/api/campanas')]);
    Reports.posts = posts; Reports.camps = camps;
    const po = posts.map(p => `<option value="${p.id}">${esc(p.etiqueta || (p.media && p.media.caption || '').slice(0, 50) || p.url)}</option>`).join('');
    const co = camps.map(c => `<option value="${c.id}">${esc(c.nombre)} (${nf(c.stats.enviados)} enviados)</option>`).join('');
    $('#r-post').innerHTML = po || '<option value="">— Agrega una publicación en Instagram —</option>';
    $('#r-camp').innerHTML = '<option value="">No incluir</option>' + co;
    $('#r-camp2').innerHTML = co || '<option value="">— Aún no hay campañas —</option>';
  },
  open(tipo) {
    const q = new URLSearchParams({ tipo });
    if (tipo === 'post') { if (!$('#r-post').value) return toast('Primero agrega una publicación'); q.set('post', $('#r-post').value); if ($('#r-camp').value) q.set('campana', $('#r-camp').value); }
    if (tipo === 'correo') { if (!$('#r-camp2').value) return toast('Primero crea una campaña'); q.set('campana', $('#r-camp2').value); }
    if (tipo === 'integral') { if (Reports.posts[0]) q.set('post', Reports.posts[0].id); if (Reports.camps[0]) q.set('campana', Reports.camps[0].id); }
    window.open('/informe.html?' + q, '_blank');
  },
};

App.init().catch(e => toast(e.message));
