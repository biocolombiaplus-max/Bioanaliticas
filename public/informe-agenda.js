/* Informe de gestión de la agenda (tamaño carta, estilo tablero, imprimible y editable) */
const nf = n => Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { violet: '#4a43b0', orange: '#e0661f', blue: '#2a8fb3', green: '#5a9e32', grape: '#9a5bd0', grid: '#eceaf6', muted: '#cfcde0' };
const q = new URLSearchParams(location.search);
const fl = s => new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const mini = (url, w) => /res\.cloudinary\.com\/.+\/upload\//.test(url) ? url.replace('/upload/', `/upload/w_${w},c_limit,q_auto,f_jpg/`) : url;
let D = null, editando = false;
const charts = [];
const iniciales = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
// Colaboradores que aparecen en el informe: los elegidos, o por defecto quienes participaron en el periodo.
const equipoInforme = () => (D.equipoSeleccion ? D.equipo.filter(m => D.equipoSeleccion.includes(m.id)) : D.equipo.filter(m => m.actividades > 0)).sort((a, b) => b.actividades - a.actividades);

if (window.Chart) { Chart.defaults.font.family = "'Poppins', system-ui, sans-serif"; Chart.defaults.font.size = 10; Chart.defaults.color = '#55537a'; Chart.defaults.animation = false; Chart.defaults.maintainAspectRatio = false; Chart.defaults.devicePixelRatio = 2; }

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { location.href = '/#ingresar'; throw new Error('Sesión vencida'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}

const ICON = {
  lista: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  medios: '<path d="M4 11a8 8 0 0 1 16 0v3a2 2 0 0 1-2 2h-1v-6h3M4 11v3a2 2 0 0 0 2 2h1v-6H4"/>',
  pub: '<path d="M4 4h16v12H5.2L4 17.2V4z"/><path d="M8 9h8M8 12h5"/>',
  pieza: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
};
const ico = (k, c) => `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const kpi = (k, c, bg, l, v, sub) => `<div class="k"><div class="ic" style="--bg:${bg}">${ico(k, c)}</div><div><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div></div>`;
const sec = (n, t, p) => `<div class="sec"><span class="n">${n}</span><div><h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div></div>`;

// Fotos grandes: el diseño cambia según cuántas tenga la actividad.
function fotosHtml(fotos) {
  const fs = fotos.slice(0, 4), n = fs.length;
  const w = n === 1 ? 1400 : 900;
  return `<div class="fotos f${n}">${fs.map(p => `<div class="ft" style="background-image:url('${esc(mini(p.url, w))}')">${p.nota ? `<em>${esc(p.nota)}</em>` : ''}</div>`).join('')}</div>`;
}

function actHtml(a) {
  const { tipos, estados: est } = D;
  const eq = (a.equipo || []).map(x => D.equipo.find(m => m.id === x)).filter(Boolean);
  const nums = [[a.asistentes, 'asistentes'], [a.medios, 'medios'], [a.publicaciones, 'publicaciones'], [(a.fotos || []).length, 'fotos']].filter(([v]) => v);
  const verFotos = document.getElementById('o-fotos').checked;
  return `<div class="act ${a.estado}"><div class="t"><div>${a.hora ? `<div class="hr">${a.hora}${a.horaFin ? ' – ' + a.horaFin : ''}</div>` : ''}<b>${esc(a.titulo)}</b></div><span class="tag ${a.estado === 'realizada' ? 'ok' : ''}">${esc(est[a.estado])}</span></div>
    <div class="chips"><span class="chip">${esc(tipos[a.tipo] || 'Actividad')}</span>${a.lugar ? `<span class="chip">📍 ${esc(a.lugar)}</span>` : ''}${a.participantes ? `<span class="chip">${esc(a.participantes)}</span>` : ''}</div>
    ${a.resultados ? `<div class="r"><b>Resultado:</b> ${esc(a.resultados)}</div>` : a.descripcion ? `<div class="r">${esc(a.descripcion)}</div>` : ''}
    ${eq.length ? `<div class="m"><b>Equipo:</b> ${eq.map(m => `${esc(m.nombre)} (${esc(m.cargo.toLowerCase())})`).join(', ')}</div>` : ''}
    ${nums.length ? `<div class="nums">${nums.map(([v, l]) => `<div><b>${nf(v)}</b>${l}</div>`).join('')}</div>` : ''}
    ${verFotos && (a.fotos || []).length ? fotosHtml(a.fotos) : ''}
    ${(a.enlaces || []).length ? `<div class="links">${a.enlaces.map(u => `<a href="${esc(u)}">${esc(u)}</a>`).join('<br>')}</div>` : ''}
  </div>`;
}

// Arma las hojas: cada bloque entra completo en una hoja; si no cabe, pasa a la siguiente.
function paginar(doc, secciones, head) {
  const nueva = () => {
    const s = document.createElement('section');
    s.className = 'page';
    s.innerHTML = `${head}<div class="pb"></div><div class="pf"><span>Periodo: ${fl(D.desde)} – ${fl(D.hasta)}</span><span class="pn"></span></div>`;
    doc.appendChild(s);
    return s.querySelector('.pb');
  };
  const poner = (pb, html) => { const d = document.createElement('div'); d.className = 'blk'; d.innerHTML = html; pb.appendChild(d); return d; };
  const desborda = pb => pb.scrollHeight > pb.clientHeight + 1;
  for (const s of secciones) {
    let pb = nueva();
    s.bloques.forEach((html, i) => {
      const el = poner(pb, i === 0 ? s.titulo + html : html);
      if (desborda(pb) && pb.children.length > 1) {
        el.remove();
        pb = nueva();
        poner(pb, `<div class="cont"><b>${s.n}</b> · ${s.nombre} (continuación)</div>` + html);
      }
    });
  }
}

// Reduce la letra de un recuadro de texto hasta que quepa en su espacio.
function encajar(el, min = 9) {
  if (!el) return;
  el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollHeight > el.clientHeight + 1 && fs > min) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
}

// En pantallas pequeñas la hoja carta se ve completa, a escala.
function escalar() {
  const doc = document.getElementById('doc');
  const z = Math.min(1, (window.innerWidth - 16) / 816);
  doc.style.zoom = z < 1 ? z.toFixed(3) : '';
}

function render() {
  const T = D.texto, cf = D.cifras, tipos = D.tipos;
  const verCanc = document.getElementById('o-canceladas').checked;
  const items = D.items.filter(a => verCanc || a.estado !== 'cancelada');
  const pend = (cf.porEstado.programada || 0) + (cf.porEstado.reprogramada || 0);
  const doc = document.getElementById('doc');
  doc.style.zoom = '';
  const head = `<div class="ph"><img src="/img/logo_sm.png" alt=""><span>Informe de gestión · Oficina de Prensa · ${esc(D.organizacion)}</span></div>`;
  const ed = cls => `data-ed="${cls}"`;
  const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  doc.innerHTML = `<section class="page cover"><div class="bg"></div><div class="c1"></div><div class="c2"></div><div class="c3"></div>
    <div class="in"><img class="logo" src="/img/logo.png" alt="">
      <div class="kick">Oficina de Prensa · Informe de gestión</div>
      <h1 ${ed('titulo')}>${esc(T.titulo)}</h1>
      <div class="per">${fl(D.desde)} – ${fl(D.hasta)}</div>
      <div class="hero"><div><b>${nf(cf.total)}</b><span>actividades gestionadas</span></div><div><b>${nf(cf.porEstado.realizada)}</b><span>actividades realizadas</span></div><div><b>${cf.cumplimiento}%</b><span>de cumplimiento</span></div></div>
      <div class="meta"><div>Entidad<b>${esc(D.organizacion)}</b></div><div>Preparado por<b>${esc((D.firma && D.firma.nombreCompleto) || D.generadoPor)}</b></div><div>Fecha de emisión<b>${hoy}</b></div></div>
    </div><div class="bandas"></div></section>
  <section class="page">${head}<div class="pb">
    ${sec('01', 'Resumen ejecutivo', 'Tablero de indicadores del periodo')}
    <div class="kpis">
      ${kpi('lista', C.violet, '#ecebfa', 'Actividades', nf(cf.total), `${nf(pend)} pendientes`)}
      ${kpi('check', C.green, '#e8f3e1', 'Realizadas', nf(cf.porEstado.realizada), `${cf.cumplimiento}% de cumplimiento`)}
      ${kpi('medios', C.orange, '#fdeee4', 'Medios', nf(cf.medios), `${nf(cf.asistentes)} asistentes`)}
      ${kpi('pub', C.blue, '#e3f2f7', 'Publicaciones', nf(cf.publicaciones + D.editorial.length), `${nf(D.editorial.length)} del calendario editorial`)}
      ${kpi('pieza', C.grape, '#f2eafa', 'Piezas aprobadas', nf(D.piezas.length), 'revisadas antes de publicar')}
      ${kpi('foto', C.violet, '#ecebfa', 'Soportes', nf(cf.fotos), `fotos · ${nf(cf.enlaces)} enlaces`)}
    </div>
    <div class="row2">
      <div class="box gauge"><h3>Cumplimiento</h3><div class="cv"><canvas id="c-dona"></canvas></div>
        <div class="ley"><span><i style="background:${C.green}"></i>${nf(cf.porEstado.realizada)} realizadas</span><span><i style="background:${C.orange}"></i>${nf(pend)} pend.</span><span><i style="background:${C.muted}"></i>${nf(cf.porEstado.cancelada)} canc.</span></div></div>
      <div class="lead" ${ed('resumen_ejecutivo')}>${esc(T.resumen_ejecutivo)}</div>
    </div>
    <div class="charts">
      <div class="box"><h3>Actividades por tipo</h3><div class="cv"><canvas id="c-tipo"></canvas></div></div>
      <div class="box"><h3>Avance por semana</h3><div class="cv"><canvas id="c-sem"></canvas></div></div>
    </div>
  </div><div class="pf"><span>Periodo: ${fl(D.desde)} – ${fl(D.hasta)}</span><span class="pn"></span></div></section>`;

  const secciones = [];
  const logros = T.logros.map(l => `<ul class="f" ${ed('logros')}><li>${esc(l)}</li></ul>`);
  if (D.correos.length) logros.push(`<h3 class="sub3">Comunicación directa por correo</h3>` + D.correos.map(c => `<ul class="f"><li>${esc(c.nombre)}: ${nf(c.enviados)} correos enviados, ${nf(c.abiertos)} aperturas y ${nf(c.clics)} clics.</li></ul>`).join(''));
  if (D.editorial.length) logros.push(`<h3 class="sub3">Publicaciones del calendario editorial</h3>` + D.editorial.slice(0, 12).map(e => `<ul class="f"><li>${esc(new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))} · ${esc(e.titulo)}${e.canal ? ' (' + esc(e.canal) + ')' : ''}</li></ul>`).join(''));
  secciones.push({ n: '02', nombre: 'Logros del periodo', titulo: sec('02', 'Logros del periodo', 'Principales resultados de la gestión'), bloques: logros.length ? logros : ['<p>Sin logros registrados.</p>'] });

  const dias = {};
  for (const a of items) (dias[a.fecha] ||= []).push(a);
  const bit = [];
  for (const [f, acts] of Object.entries(dias)) {
    const dia = `<div class="dia"><span>${new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>`;
    acts.forEach((a, i) => bit.push((i === 0 ? dia : '') + actHtml(a)));
  }
  secciones.push({ n: '03', nombre: 'Bitácora de actividades', titulo: sec('03', 'Bitácora de actividades', 'Detalle de cada actividad con sus resultados y soportes'), bloques: bit.length ? bit : ['<p>No hay actividades en el periodo.</p>'] });

  const eq = equipoInforme();
  const fin = [];
  let nRec = '04';
  if (eq.length) {
    for (let i = 0; i < eq.length; i += 3) fin.push((i === 0 ? sec('04', 'Equipo de trabajo', 'Personas que hicieron posible la gestión del periodo') : '') + `<div class="eq-grid">${eq.slice(i, i + 3).map(m => `<div class="eqc"><span class="av" style="--c:${esc(m.color || C.violet)}">${esc(iniciales(m.nombre))}</span><div><b>${esc(m.nombre)}</b><div class="m">${esc(m.cargo)}</div><div class="m">${m.actividades ? `${nf(m.actividades)} ${m.actividades === 1 ? 'actividad' : 'actividades'}` : 'Apoyo transversal'}</div></div></div>`).join('')}</div>`);
    nRec = '05';
  }
  T.recomendaciones.forEach((l, i) => fin.push((i === 0 ? `<div style="margin-top:${eq.length ? '8mm' : '0'}">${sec(nRec, 'Recomendaciones y próximos pasos')}</div>` : '') + `<ul class="f r" ${ed('recomendaciones')}><li>${esc(l)}</li></ul>`));
  fin.push(`<div class="lead cierre" ${ed('cierre')}>${esc(T.cierre)}</div>`);
  fin.push(`<div class="firma">
      <div><div class="firma-box">${D.firma && D.firma.firma && document.getElementById('o-firma').checked ? `<img class="firma-img" src="${D.firma.firma}" alt="Firma">` : ''}</div><div class="linea"></div><b>${esc((D.firma && D.firma.nombreCompleto) || D.generadoPor)}</b><br>${esc((D.firma && D.firma.cargo) || 'Jefe(a) de Prensa')}<br>${esc(D.organizacion)}</div>
      <div><div class="firma-box"></div><div class="linea"></div><b>${esc((D.firma && D.firma.recibeNombre) || 'Recibido')}</b><br>${esc((D.firma && D.firma.recibeCargo) || 'Despacho')}<br>Fecha: ____ / ____ / ________</div>
    </div><p class="fuente">Fuente: agenda de gestión de la Oficina de Prensa (Sala de Prensa Digital). Las fotografías y enlaces son soporte de las actividades reportadas.</p>`);
  const [a0, ...resto] = fin;
  secciones.push({ n: eq.length ? '04' : nRec, nombre: eq.length ? 'Equipo y cierre' : 'Recomendaciones y cierre', titulo: '', bloques: [a0, ...resto] });

  paginar(doc, secciones, head);
  encajar(doc.querySelector('.row2 .lead'));
  const pags = doc.querySelectorAll('.page:not(.cover) .pn');
  pags.forEach((el, i) => { el.textContent = `Página ${i + 1} de ${pags.length}`; });

  graficos(cf, tipos, pend);
  escalar();
}

// Gráficos con tamaño fijo (no dependen del ancho de la pantalla) para que el PDF salga igual en todos lados.
function graficos(cf, tipos, pend) {
  charts.splice(0).forEach(c => c.destroy());
  if (!window.Chart) return;
  const fijar = id => { const cv = document.getElementById(id), p = cv.parentElement; cv.width = p.clientWidth; cv.height = p.clientHeight; cv.style.width = p.clientWidth + 'px'; cv.style.height = p.clientHeight + 'px'; return cv; };
  const base = { responsive: false, devicePixelRatio: 3, layout: { padding: { right: 22, top: 4 } } };
  const valores = { id: 'valores', afterDatasetsDraw(ch) {
    const { ctx } = ch; ctx.save(); ctx.font = "600 10px Poppins, sans-serif"; ctx.fillStyle = '#1f1d3d';
    const horiz = ch.options.indexAxis === 'y';
    const tot = ch.data.labels.map((_, i) => ch.data.datasets.reduce((s, d, j) => s + (ch.isDatasetVisible(j) ? (d.data[i] || 0) : 0), 0));
    const last = ch.getDatasetMeta(ch.data.datasets.length - 1);
    last.data.forEach((bar, i) => { if (!tot[i]) return;
      const top = ch.data.datasets.reduce((y, d, j) => { const b = ch.getDatasetMeta(j).data[i]; return horiz ? Math.max(y, b.x) : Math.min(y, b.y); }, horiz ? 0 : Infinity);
      if (horiz) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tot[i], top + 5, bar.y); }
      else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(tot[i], bar.x, top - 3); } });
    ctx.restore(); } };
  const grad = (c1, c2, horiz) => ctx => { const { chart } = ctx, a = chart.chartArea; if (!a) return c1; const g = horiz ? chart.ctx.createLinearGradient(a.left, 0, a.right, 0) : chart.ctx.createLinearGradient(0, a.bottom, 0, a.top); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; };

  const real = cf.porEstado.realizada || 0, canc = cf.porEstado.cancelada || 0;
  const centro = { id: 'centro', afterDraw(ch) { const { ctx, chartArea: a } = ch; const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2; ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#2a2672'; ctx.font = "700 24px Poppins, sans-serif"; ctx.textBaseline = 'bottom'; ctx.fillText(cf.cumplimiento + '%', x, y + 6); ctx.fillStyle = '#8a88a3'; ctx.font = "500 9px Poppins, sans-serif"; ctx.textBaseline = 'top'; ctx.fillText('cumplido', x, y + 7); ctx.restore(); } };
  charts.push(new Chart(fijar('c-dona'), { type: 'doughnut', plugins: [centro], data: { labels: ['Realizadas', 'Pendientes', 'Canceladas'], datasets: [{ data: real + pend + canc ? [real, pend, canc] : [0, 1, 0], backgroundColor: [C.green, C.orange, C.muted], borderWidth: 0, borderRadius: 4, spacing: 2 }] }, options: { ...base, layout: {}, cutout: '74%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } }));

  const pt = Object.entries(cf.porTipo).sort((a, b) => b[1] - a[1]).slice(0, 9);
  charts.push(new Chart(fijar('c-tipo'), { type: 'bar', plugins: [valores], data: { labels: pt.map(([k]) => tipos[k]), datasets: [{ data: pt.map(([, v]) => v), backgroundColor: grad('#7b74e0', C.violet, true), borderRadius: 6, borderSkipped: false, barThickness: 13 }] }, options: { ...base, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0, display: false }, grid: { display: false }, border: { display: false } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9.5 } } } } } }));

  const sem = Object.entries(cf.porSemana).sort();
  charts.push(new Chart(fijar('c-sem'), { type: 'bar', plugins: [valores], data: { labels: sem.map(([k]) => new Date(k + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })), datasets: [{ label: 'Realizadas', data: sem.map(([, v]) => v.realizadas), backgroundColor: C.green, borderRadius: 5, borderSkipped: false, maxBarThickness: 26, stack: 's' }, { label: 'Pendientes', data: sem.map(([, v]) => v.programadas), backgroundColor: '#f2a066', borderRadius: 5, borderSkipped: false, maxBarThickness: 26, stack: 's' }] }, options: { ...base, layout: { padding: { top: 14 } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, font: { size: 9.5 } } } }, scales: { x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { font: { size: 9 } } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, font: { size: 9 } }, grid: { color: C.grid }, border: { display: false } } } } }));
}

// PDF real en tamaño carta, hoja por hoja (funciona igual en iPhone, Android y computador).
async function descargarPDF() {
  if (!window.html2canvas || !window.jspdf) { window.print(); return; }
  if (editando) { D.texto = leerTextos(); activarEdicion(false); render(); }
  const velo = document.getElementById('velo'), doc = document.getElementById('doc');
  const b = document.getElementById('b-pdf'); b.disabled = true;
  velo.hidden = false; velo.textContent = 'Preparando el PDF…';
  doc.style.zoom = '';
  try {
    await document.fonts.ready;
    const hojas = [...doc.querySelectorAll('.page')];
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'letter', compress: true });
    for (let i = 0; i < hojas.length; i++) {
      velo.textContent = `Generando PDF… hoja ${i + 1} de ${hojas.length}`;
      const cv = await html2canvas(hojas[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      if (i) pdf.addPage('letter');
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 215.9, 279.4, undefined, 'FAST');
    }
    const nombre = `Informe-de-gestion-${D.desde}-a-${D.hasta}.pdf`;
    const blob = pdf.output('blob');
    const file = new File([blob], nombre, { type: 'application/pdf' });
    if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
      velo.innerHTML = `<div>PDF listo ✓<br><button id="v-share" style="margin-top:14px;font:inherit;font-weight:600;border:0;border-radius:999px;padding:12px 22px;background:#e0661f;color:#fff">Guardar o compartir</button><br><button id="v-x" style="margin-top:10px;font:inherit;border:0;background:none;color:#fff;opacity:.8">Cerrar</button></div>`;
      await new Promise(res => {
        document.getElementById('v-share').onclick = async () => { try { await navigator.share({ files: [file], title: nombre }); } catch { /* cancelado */ } res(); };
        document.getElementById('v-x').onclick = res;
      });
    } else pdf.save(nombre);
  } catch (e) { avisar('No se pudo generar el PDF: ' + e.message + '. Usa "Imprimir" y elige "Guardar como PDF".'); }
  velo.hidden = true; b.disabled = false;
  escalar();
}

// Lee los textos editados en la página para guardarlos.
function leerTextos() {
  const g = k => document.querySelector(`[data-ed="${k}"]`);
  const lista = k => [...document.querySelectorAll(`[data-ed="${k}"] li`)].map(li => li.innerText.trim()).filter(Boolean);
  return { titulo: g('titulo').innerText.trim(), resumen_ejecutivo: g('resumen_ejecutivo').innerText.trim(), logros: lista('logros'), recomendaciones: lista('recomendaciones'), cierre: g('cierre').innerText.trim() };
}

function avisar(t) { const a = document.getElementById('aviso'); a.style.display = t ? '' : 'none'; a.textContent = t || ''; }

async function main() {
  D = await api(`/api/agenda/informe?desde=${encodeURIComponent(q.get('desde') || '')}&hasta=${encodeURIComponent(q.get('hasta') || '')}`);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  render();
  document.getElementById('b-pdf').onclick = descargarPDF;
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(escalar, 150); });
  if (D.ia) document.getElementById('b-ia').style.display = '';
  const bf = document.getElementById('b-firma');
  bf.href = '/app.html?volver=' + encodeURIComponent(location.pathname + location.search) + '#firma';
  bf.textContent = D.firma && D.firma.firma ? '✎ Cambiar firma' : '✍ Agregar firma';
  document.getElementById('b-equipo').onclick = elegirEquipo;
  avisar(D.textoIA ? 'Este informe usa el texto guardado para este periodo. Puedes editarlo o volver a redactarlo.' : (D.ia ? 'Texto generado automáticamente con las cifras. Usa "Redactar con IA" para una versión más elaborada, o edítalo a mano.' : 'Texto generado automáticamente con las cifras. Puedes editarlo con "Editar textos" antes de descargar el PDF.'));
  ['o-fotos', 'o-canceladas', 'o-firma'].forEach(i => document.getElementById(i).addEventListener('change', () => { if (editando) D.texto = leerTextos(); render(); if (editando) activarEdicion(true); }));
  document.getElementById('b-editar').onclick = async () => {
    if (!editando) { activarEdicion(true); avisar('Haz clic en los textos resaltados para corregirlos. En las listas, cada línea es un punto. Luego pulsa "Guardar textos".'); return; }
    D.texto = leerTextos();
    try { await api('/api/agenda/informe/texto', { method: 'POST', body: { desde: D.desde, hasta: D.hasta, texto: D.texto } }); avisar('Textos guardados ✓'); } catch (e) { avisar(e.message); }
    activarEdicion(false); render();
  };
  document.getElementById('b-ia').onclick = async () => {
    const enfoque = prompt('¿Algún enfoque para el informe? (opcional; ej.: resaltar la Feria de la Uva y la relación con medios)') ;
    if (enfoque === null) return;
    const b = document.getElementById('b-ia'); b.disabled = true; b.textContent = 'Redactando…';
    try { D.texto = await api('/api/agenda/informe/ia', { method: 'POST', body: { desde: D.desde, hasta: D.hasta, enfoque } }); render(); avisar('Texto redactado con IA y guardado. Revísalo antes de presentarlo.'); }
    catch (e) { avisar(e.message); }
    b.disabled = false; b.textContent = '✦ Redactar con IA';
  };
  if (q.get('imprimir') === '1') setTimeout(() => window.print(), 800);
}

// Selector de colaboradores que aparecen en el informe.
function elegirEquipo() {
  const sel = new Set(equipoInforme().map(m => m.id));
  const p = document.getElementById('panel');
  p.innerHTML = `<div class="panel-card"><div class="panel-h"><b>¿Quiénes aparecen en el informe?</b><button type="button" onclick="document.getElementById('panel').hidden=true">×</button></div>
    ${D.equipo.length ? D.equipo.map(m => `<label class="pick"><input type="checkbox" value="${m.id}" ${sel.has(m.id) ? 'checked' : ''}><span class="av" style="--c:${esc(m.color)}">${esc(iniciales(m.nombre))}</span><span><b>${esc(m.nombre)}</b><br><small>${esc(m.cargo)} · ${m.actividades} actividades en el periodo</small></span></label>`).join('') : '<p>Aún no hay colaboradores. Agrégalos en la agenda, botón "Equipo".</p>'}
    <div class="panel-acc"><button type="button" class="ok" id="eq-ok">Aplicar</button></div></div>`;
  p.hidden = false;
  document.getElementById('eq-ok').onclick = async () => {
    const ids = [...p.querySelectorAll('input:checked')].map(i => i.value);
    D.equipoSeleccion = ids; p.hidden = true;
    if (editando) D.texto = leerTextos();
    render(); if (editando) activarEdicion(true);
    try { await api('/api/agenda/informe/equipo', { method: 'POST', body: { desde: D.desde, hasta: D.hasta, ids } }); } catch { /* se aplica aunque no se guarde */ }
  };
}

function activarEdicion(on) {
  editando = on;
  document.querySelectorAll('[data-ed]').forEach(el => el.contentEditable = on ? 'true' : 'false');
  const b = document.getElementById('b-editar'); b.textContent = on ? '✓ Guardar textos' : '✎ Editar textos'; b.classList.toggle('on', on);
}

main().catch(e => { document.getElementById('doc').innerHTML = `<div class="loading">${esc(e.message)}</div>`; });
