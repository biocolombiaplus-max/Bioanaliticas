// Agenda de gestión de la jefatura de prensa: actividades programadas y realizadas, con soportes
// (fotos y enlaces) y resumen por rango de fechas para el informe de gestión.
const { col, id } = require('./store');

const agenda = col('agenda');

const TIPOS = {
  rueda: 'Rueda de prensa',
  entrevista: 'Entrevista / vocería',
  cubrimiento: 'Cubrimiento de evento',
  comunicado: 'Comunicado o boletín',
  publicacion: 'Publicación en redes',
  medios: 'Gestión con medios',
  reunion: 'Reunión',
  produccion: 'Producción audiovisual',
  campana: 'Campaña',
  crisis: 'Atención de crisis',
  otro: 'Otra actividad',
};
const ESTADOS = { programada: 'Programada', realizada: 'Realizada', reprogramada: 'Reprogramada', cancelada: 'Cancelada' };
const PRIORIDADES = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

const limpio = (v, n = 500) => String(v ?? '').trim().slice(0, n);
const fecha = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
const hora = v => (/^\d{2}:\d{2}$/.test(v || '') ? v : '');
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
const urlOk = u => /^https?:\/\/\S+$/i.test(u);

async function listar(desde, hasta) {
  return (await agenda.all())
    .filter(a => (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta))
    .sort((a, b) => (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99')));
}

async function guardar(d, user) {
  const prev = d.id ? await agenda.get(d.id) : null;
  const a = {
    id: prev ? prev.id : 'a' + id(7),
    fecha: fecha(d.fecha),
    hora: hora(d.hora),
    horaFin: hora(d.horaFin),
    titulo: limpio(d.titulo, 160),
    tipo: TIPOS[d.tipo] ? d.tipo : 'otro',
    estado: ESTADOS[d.estado] ? d.estado : 'programada',
    prioridad: PRIORIDADES[d.prioridad] ? d.prioridad : 'normal',
    lugar: limpio(d.lugar, 160),
    participantes: limpio(d.participantes, 400),
    descripcion: limpio(d.descripcion, 3000),
    resultados: limpio(d.resultados, 3000),
    asistentes: num(d.asistentes),
    medios: num(d.medios),
    publicaciones: num(d.publicaciones),
    enlaces: String(d.enlaces || '').split(/[\s,]+/).filter(urlOk).slice(0, 15),
    fotos: Array.isArray(d.fotos) ? d.fotos.filter(f => f && urlOk(f.url)).slice(0, 30).map(f => ({ url: f.url, nota: limpio(f.nota, 200) })) : (prev ? prev.fotos : []),
    creadoPor: prev ? prev.creadoPor : user.usuario,
    creado: prev ? prev.creado : new Date().toISOString(),
    actualizado: new Date().toISOString(),
  };
  if (!a.fecha) throw new Error('Elige la fecha.');
  if (!a.titulo) throw new Error('Escribe qué actividad es.');
  if (a.estado === 'realizada' && !prev?.realizadaEn) a.realizadaEn = new Date().toISOString();
  else if (prev && prev.realizadaEn) a.realizadaEn = prev.realizadaEn;
  await agenda.put(a.id, a);
  return a;
}

async function agregarFotos(aid, fotos) {
  const a = await agenda.get(aid);
  if (!a) throw new Error('La actividad no existe.');
  a.fotos = [...(a.fotos || []), ...fotos.filter(f => f && urlOk(f.url)).map(f => ({ url: f.url, nota: limpio(f.nota, 200) }))].slice(0, 30);
  a.actualizado = new Date().toISOString();
  await agenda.put(a.id, a);
  return a;
}

async function cambiarEstado(aid, estado, resultados) {
  const a = await agenda.get(aid);
  if (!a) throw new Error('La actividad no existe.');
  if (!ESTADOS[estado]) throw new Error('Estado no válido.');
  a.estado = estado;
  if (resultados) a.resultados = limpio(resultados, 3000);
  if (estado === 'realizada' && !a.realizadaEn) a.realizadaEn = new Date().toISOString();
  a.actualizado = new Date().toISOString();
  await agenda.put(a.id, a);
  return a;
}

// Cifras del periodo para el informe de gestión.
function resumen(items) {
  const r = {
    total: items.length,
    porEstado: Object.fromEntries(Object.keys(ESTADOS).map(k => [k, 0])),
    porTipo: {},
    porSemana: {},
    asistentes: 0, medios: 0, publicaciones: 0, fotos: 0, enlaces: 0, conSoportes: 0,
  };
  for (const a of items) {
    r.porEstado[a.estado] = (r.porEstado[a.estado] || 0) + 1;
    r.porTipo[a.tipo] = (r.porTipo[a.tipo] || 0) + 1;
    const d = new Date(a.fecha + 'T12:00:00');
    const lunes = new Date(d); lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = lunes.toISOString().slice(0, 10);
    r.porSemana[k] = r.porSemana[k] || { programadas: 0, realizadas: 0 };
    if (a.estado === 'realizada') r.porSemana[k].realizadas++; else if (a.estado !== 'cancelada') r.porSemana[k].programadas++;
    r.asistentes += a.asistentes || 0;
    r.medios += a.medios || 0;
    r.publicaciones += a.publicaciones || 0;
    r.fotos += (a.fotos || []).length;
    r.enlaces += (a.enlaces || []).length;
    if ((a.fotos || []).length || (a.enlaces || []).length) r.conSoportes++;
  }
  const efectivas = r.total - r.porEstado.cancelada;
  r.cumplimiento = efectivas ? Math.round(100 * r.porEstado.realizada / efectivas) : 0;
  return r;
}

// Texto ejecutivo básico (sin IA): se usa cuando no hay clave de IA o como punto de partida.
const n = v => Number(v || 0).toLocaleString('es-CO');
const pl = (v, uno, varios) => `${n(v)} ${v === 1 ? uno : varios}`;

function narrativa(items, r, desde, hasta) {
  const f = s => new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const tipos = Object.entries(r.porTipo).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${TIPOS[k].toLowerCase()} (${v})`);
  const realizadas = items.filter(a => a.estado === 'realizada');
  const destacadas = [...realizadas].sort((a, b) => ((b.asistentes || 0) + 20 * (b.medios || 0) + 5 * (b.fotos || []).length) - ((a.asistentes || 0) + 20 * (a.medios || 0) + 5 * (a.fotos || []).length)).slice(0, 5);
  return {
    titulo: 'Informe de gestión de la Oficina de Prensa',
    resumen_ejecutivo: `Entre el ${f(desde)} y el ${f(hasta)} la Oficina de Prensa gestionó ${pl(r.total, 'actividad', 'actividades')}, de las cuales ${pl(r.porEstado.realizada, 'se realizó', 'se realizaron')} (${r.cumplimiento}% de cumplimiento sobre lo programado). ${tipos.length ? `Predominaron: ${tipos.join(', ')}.` : ''} ${r.medios ? `Se contó con la presencia de ${pl(r.medios, 'medio', 'medios')} de comunicación` : ''}${r.medios && r.asistentes ? ` y ${n(r.asistentes)} asistentes en total.` : r.asistentes ? `Las actividades reunieron ${n(r.asistentes)} asistentes.` : r.medios ? '.' : ''} ${r.conSoportes ? `${pl(r.conSoportes, 'actividad cuenta', 'actividades cuentan')} con soportes (fotografías o enlaces).` : ''}`.replace(/\s+/g, ' ').trim(),
    logros: destacadas.map(a => `${a.titulo}${a.resultados ? ': ' + a.resultados.split(/\n/)[0] : ''}`),
    recomendaciones: [
      r.porEstado.programada ? `Hacer seguimiento a las ${r.porEstado.programada} actividades que siguen programadas y registrar sus resultados.` : 'Mantener el registro diario de resultados y soportes.',
      r.total && r.conSoportes < r.porEstado.realizada ? 'Adjuntar fotografías o enlaces a todas las actividades realizadas para fortalecer los soportes de gestión.' : 'Continuar documentando cada actividad con fotografías y enlaces.',
      'Consolidar las publicaciones generadas y su alcance en el informe de redes del mismo periodo.',
    ],
    cierre: 'La Oficina de Prensa continúa fortaleciendo la comunicación pública de la administración con información oportuna, cercana y verificable para la comunidad.',
  };
}

module.exports = { TIPOS, ESTADOS, PRIORIDADES, listar, guardar, agregarFotos, cambiarEstado, resumen, narrativa, obtener: aid => agenda.get(aid), eliminar: aid => agenda.del(aid) };
