/* Informe de gestión de la agenda (A4, imprimible y editable) */
const nf = n => Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { violet: '#4a43b0', orange: '#e0661f', blue: '#2a8fb3', green: '#5a9e32', grape: '#9a5bd0', grid: '#eceaf6', muted: '#cfcde0' };
const q = new URLSearchParams(location.search);
const fl = s => new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const mini = (url, w) => /res\.cloudinary\.com\/.+\/upload\//.test(url) ? url.replace('/upload/', `/upload/w_${w},c_fill,ar_4:3,q_auto,f_auto/`) : url;
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

function render() {
  const T = D.texto, cf = D.cifras, tipos = D.tipos, est = D.estados;
  const verFotos = document.getElementById('o-fotos').checked;
  const verCanc = document.getElementById('o-canceladas').checked;
  const items = D.items.filter(a => verCanc || a.estado !== 'cancelada');
  let pag = 1;
  const head = `<div class="ph"><img src="/img/logo_sm.png" alt=""><span>Informe de gestión · Oficina de Prensa · ${esc(D.organizacion)}</span></div>`;
  const foot = () => `<div class="pf"><span>Periodo: ${fl(D.desde)} – ${fl(D.hasta)}</span><span>Página ${++pag}</span></div>`;
  const ed = cls => `data-ed="${cls}"`;

  let html = `<section class="page cover"><div class="in"><img src="/img/logo.png" alt="">
    <div class="kick">Oficina de Prensa</div><h1 ${ed('titulo')}>${esc(T.titulo)}</h1>
    <div class="sub">${fl(D.desde)} – ${fl(D.hasta)}</div>
    <div class="meta"><div>Entidad<b>${esc(D.organizacion)}</b></div><div>Actividades<b>${nf(cf.total)} registradas · ${nf(cf.porEstado.realizada)} realizadas</b></div><div>Preparado por<b>${esc(D.generadoPor)} · Jefatura de Prensa</b></div></div></div><div class="bandas"></div></section>`;

  html += `<section class="page">${head}<h2><span class="n">01</span>Resumen ejecutivo</h2>
    <div class="grid g3">
      <div class="k" style="--a:${C.violet}"><div class="l">Actividades gestionadas</div><div class="v">${nf(cf.total)}</div><div class="s">${nf(cf.porEstado.programada + cf.porEstado.reprogramada)} pendientes</div></div>
      <div class="k" style="--a:${C.green}"><div class="l">Realizadas</div><div class="v">${nf(cf.porEstado.realizada)}</div><div class="s">${cf.cumplimiento}% de cumplimiento</div></div>
      <div class="k" style="--a:${C.orange}"><div class="l">Medios de comunicación</div><div class="v">${nf(cf.medios)}</div><div class="s">${nf(cf.asistentes)} asistentes en total</div></div>
      <div class="k" style="--a:${C.blue}"><div class="l">Publicaciones generadas</div><div class="v">${nf(cf.publicaciones + D.editorial.length)}</div><div class="s">${nf(D.editorial.length)} en el calendario editorial</div></div>
      <div class="k" style="--a:${C.grape}"><div class="l">Piezas gráficas aprobadas</div><div class="v">${nf(D.piezas.length)}</div><div class="s">Revisadas antes de publicar</div></div>
      <div class="k" style="--a:${C.violet}"><div class="l">Soportes</div><div class="v">${nf(cf.fotos)}</div><div class="s">fotos · ${nf(cf.enlaces)} enlaces</div></div>
    </div>
    <div class="lead" ${ed('resumen_ejecutivo')}>${esc(T.resumen_ejecutivo)}</div>
    <div class="grid g2">
      <div class="box"><h3 style="margin-top:0">Actividades por tipo</h3><div class="chart"><canvas id="c-tipo"></canvas></div></div>
      <div class="box"><h3 style="margin-top:0">Realizadas y pendientes por semana</h3><div class="chart"><canvas id="c-sem"></canvas></div></div>
    </div>${foot()}</section>`;

  html += `<section class="page">${head}<h2><span class="n">02</span>Logros del periodo</h2>
    <ul class="f" ${ed('logros')}>${T.logros.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${D.correos.length ? `<h3>Comunicación directa por correo</h3><ul class="f">${D.correos.map(c => `<li>${esc(c.nombre)}: ${nf(c.enviados)} correos enviados, ${nf(c.abiertos)} aperturas y ${nf(c.clics)} clics.</li>`).join('')}</ul>` : ''}
    ${D.editorial.length ? `<h3>Publicaciones del calendario editorial</h3><ul class="f">${D.editorial.slice(0, 12).map(e => `<li>${esc(new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))} · ${esc(e.titulo)}${e.canal ? ' (' + esc(e.canal) + ')' : ''}</li>`).join('')}</ul>` : ''}
    ${foot()}</section>`;

  const dias = {};
  for (const a of items) (dias[a.fecha] ||= []).push(a);
  html += `<section class="page">${head}<h2><span class="n">03</span>Bitácora de actividades</h2><p style="color:var(--ink2);margin-top:0">Detalle de cada actividad con sus resultados y soportes.</p>
    ${Object.entries(dias).map(([f, acts]) => `<div class="dia">${new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      ${acts.map(a => `<div class="act ${a.estado}"><div class="t"><b>${a.hora ? a.hora + (a.horaFin ? '–' + a.horaFin : '') + ' · ' : ''}${esc(a.titulo)}</b><span class="tag ${a.estado === 'realizada' ? 'ok' : ''}">${esc(est[a.estado])}</span></div>
        <div class="m">${esc(tipos[a.tipo])}${a.lugar ? ' · ' + esc(a.lugar) : ''}${a.participantes ? ' · ' + esc(a.participantes) : ''}</div>
        ${(a.equipo || []).length ? `<div class="m"><b>Equipo:</b> ${a.equipo.map(x => D.equipo.find(m => m.id === x)).filter(Boolean).map(m => `${esc(m.nombre)} (${esc(m.cargo.toLowerCase())})`).join(', ')}</div>` : ''}
        ${a.resultados ? `<div class="r"><b>Resultado:</b> ${esc(a.resultados)}</div>` : a.descripcion ? `<div class="r">${esc(a.descripcion)}</div>` : ''}
        ${a.asistentes || a.medios || a.publicaciones ? `<div class="m" style="margin-top:3px">${[a.asistentes ? nf(a.asistentes) + ' asistentes' : '', a.medios ? nf(a.medios) + ' medios' : '', a.publicaciones ? nf(a.publicaciones) + ' publicaciones' : ''].filter(Boolean).join(' · ')}</div>` : ''}
        ${verFotos && (a.fotos || []).length ? `<div class="ph4">${a.fotos.slice(0, 4).map(p => `<img src="${esc(mini(p.url, 500))}" alt="">`).join('')}</div>` : ''}
        ${(a.enlaces || []).length ? `<div style="margin-top:4px">${a.enlaces.map(u => `<a href="${esc(u)}">${esc(u)}</a>`).join('<br>')}</div>` : ''}
      </div>`).join('')}`).join('') || '<p>No hay actividades en el periodo.</p>'}
    ${foot()}</section>`;

  const eq = equipoInforme();
  html += `<section class="page">${head}${eq.length ? `<h2><span class="n">04</span>Equipo de trabajo</h2>
    <p style="color:var(--ink2);margin-top:0">Personas que hicieron posible la gestión del periodo.</p>
    <div class="eq-grid">${eq.map(m => `<div class="eqc"><span class="av" style="--c:${esc(m.color || C.violet)}">${esc(iniciales(m.nombre))}</span><div><b>${esc(m.nombre)}</b><div class="m">${esc(m.cargo)}</div><div class="m">${m.actividades ? `${nf(m.actividades)} ${m.actividades === 1 ? 'actividad' : 'actividades'}` : 'Apoyo transversal'}</div></div></div>`).join('')}</div>` : ''}
    <h2 style="margin-top:${eq.length ? '10mm' : '0'}"><span class="n">${eq.length ? '05' : '04'}</span>Recomendaciones y próximos pasos</h2>
    <ul class="f r" ${ed('recomendaciones')}>${T.recomendaciones.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="lead" ${ed('cierre')}>${esc(T.cierre)}</div>
    <div class="firma">
      <div><div class="firma-box">${D.firma && D.firma.firma ? `<img class="firma-img" src="${D.firma.firma}" alt="Firma">` : ''}</div><div class="linea"></div><b>${esc((D.firma && D.firma.nombreCompleto) || D.generadoPor)}</b><br>${esc((D.firma && D.firma.cargo) || 'Jefe(a) de Prensa')}<br>${esc(D.organizacion)}</div>
      <div><div class="firma-box"></div><div class="linea"></div><b>${esc((D.firma && D.firma.recibeNombre) || 'Recibido')}</b><br>${esc((D.firma && D.firma.recibeCargo) || 'Despacho')}<br>Fecha: ____ / ____ / ________</div>
    </div>
    <p style="font-size:9.5px;color:var(--muted);margin-top:16mm">Fuente: agenda de gestión de la Oficina de Prensa (Sala de Prensa Digital). Las fotografías y enlaces son soporte de las actividades reportadas.</p>
    ${foot()}</section>`;

  document.getElementById('doc').innerHTML = html;
  charts.splice(0).forEach(c => c.destroy());
  if (!window.Chart) return;
  const pt = Object.entries(cf.porTipo).sort((a, b) => b[1] - a[1]);
  charts.push(new Chart(document.getElementById('c-tipo'), { type: 'bar', data: { labels: pt.map(([k]) => tipos[k]), datasets: [{ data: pt.map(([, v]) => v), backgroundColor: C.violet, borderRadius: 4, maxBarThickness: 16 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: C.grid }, border: { display: false } }, y: { grid: { display: false } } } } }));
  const sem = Object.entries(cf.porSemana).sort();
  charts.push(new Chart(document.getElementById('c-sem'), { type: 'bar', data: { labels: sem.map(([k]) => 'Sem. ' + new Date(k + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })), datasets: [{ label: 'Realizadas', data: sem.map(([, v]) => v.realizadas), backgroundColor: C.green, borderRadius: 4, maxBarThickness: 18 }, { label: 'Pendientes', data: sem.map(([, v]) => v.programadas), backgroundColor: C.orange, borderRadius: 4, maxBarThickness: 18 }] }, options: { plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: C.grid }, border: { display: false } } } } }));
}

// Lee los textos editados en la página para guardarlos.
function leerTextos() {
  const g = k => document.querySelector(`[data-ed="${k}"]`);
  const lista = k => [...g(k).querySelectorAll('li')].map(li => li.innerText.trim()).filter(Boolean);
  return { titulo: g('titulo').innerText.trim(), resumen_ejecutivo: g('resumen_ejecutivo').innerText.trim(), logros: lista('logros'), recomendaciones: lista('recomendaciones'), cierre: g('cierre').innerText.trim() };
}

function avisar(t) { const a = document.getElementById('aviso'); a.style.display = t ? '' : 'none'; a.textContent = t || ''; }

async function main() {
  D = await api(`/api/agenda/informe?desde=${encodeURIComponent(q.get('desde') || '')}&hasta=${encodeURIComponent(q.get('hasta') || '')}`);
  render();
  if (D.ia) document.getElementById('b-ia').style.display = '';
  if (!(D.firma && D.firma.firma)) { const f = document.getElementById('b-firma'); f.style.display = ''; }
  document.getElementById('b-equipo').onclick = elegirEquipo;
  avisar(D.textoIA ? 'Este informe usa el texto guardado para este periodo. Puedes editarlo o volver a redactarlo.' : (D.ia ? 'Texto generado automáticamente con las cifras. Usa "Redactar con IA" para una versión más elaborada, o edítalo a mano.' : 'Texto generado automáticamente con las cifras. Puedes editarlo con "Editar textos" antes de descargar el PDF.'));
  ['o-fotos', 'o-canceladas'].forEach(i => document.getElementById(i).addEventListener('change', () => { if (editando) D.texto = leerTextos(); render(); if (editando) activarEdicion(true); }));
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
