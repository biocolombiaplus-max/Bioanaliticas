// Flujo de trabajo de la oficina de prensa: revisión de piezas gráficas y calendario editorial.
const { col, id } = require('./store');

const piezas = col('piezas');
const calendario = col('calendario');

const CANALES = ['Instagram (publicación)', 'Instagram (historia)', 'Instagram (reel)', 'Facebook', 'TikTok', 'X (Twitter)', 'WhatsApp', 'Afiche / impreso', 'Valla / pendón', 'Página web', 'Correo', 'Video', 'Otro'];
const ESTADOS_PIEZA = { revision: 'Por revisar', cambios: 'Con cambios pedidos', aprobada: 'Aprobada', publicada: 'Publicada' };
const ESTADOS_CAL = { idea: 'Idea', produccion: 'En producción', listo: 'Listo para publicar', publicado: 'Publicado' };

// Lista de verificación que la jefa de prensa revisa antes de aprobar.
const CHECKLIST = [
  ['ortografia', 'Ortografía, tildes y puntuación'],
  ['datos', 'Fechas, horas, lugares y cifras correctos'],
  ['nombres', 'Nombres y cargos bien escritos'],
  ['logos', 'Logos oficiales vigentes y bien ubicados'],
  ['legible', 'Texto legible en celular (tamaño y contraste)'],
  ['formato', 'Medidas correctas para el canal'],
  ['tono', 'Mensaje claro, institucional y sin promoción personal'],
  ['contacto', 'Enlace, teléfono o llamado a la acción correcto'],
];

const ahora = () => new Date().toISOString();
const limpio = (v, n = 500) => String(v || '').trim().slice(0, n);

async function listarPiezas() {
  return (await piezas.all()).sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
}

async function crearPieza(datos, user) {
  const p = {
    id: 'p' + id(7),
    titulo: limpio(datos.titulo, 140) || 'Pieza sin título',
    descripcion: limpio(datos.descripcion, 4000),
    canal: CANALES.includes(datos.canal) ? datos.canal : 'Otro',
    fechaPublicacion: /^\d{4}-\d{2}-\d{2}$/.test(datos.fechaPublicacion || '') ? datos.fechaPublicacion : '',
    autor: user.usuario,
    autorNombre: user.nombre,
    creado: ahora(), actualizado: ahora(),
    estado: 'revision',
    versiones: [], comentarios: [], checklist: {},
  };
  await piezas.put(p.id, p);
  return p;
}

async function agregarVersion(pid, archivo, user) {
  const p = await piezas.get(pid);
  if (!p) throw new Error('La pieza no existe.');
  if (!/^https?:\/\//.test(archivo.url || '')) throw new Error('Archivo no válido.');
  const tipo = /^video\//.test(archivo.tipo) ? 'video' : /pdf/.test(archivo.tipo) ? 'pdf' : 'imagen';
  p.versiones.push({ n: p.versiones.length + 1, url: archivo.url, tipo, nombreArchivo: limpio(archivo.nombre, 160), subido: ahora(), autor: user.usuario, nota: limpio(archivo.nota, 1000) });
  p.estado = 'revision';
  p.checklist = {};
  p.actualizado = ahora();
  await piezas.put(p.id, p);
  return p;
}

async function comentar(pid, texto, user) {
  const p = await piezas.get(pid);
  if (!p) throw new Error('La pieza no existe.');
  const t = limpio(texto, 3000);
  if (!t) throw new Error('Escribe el comentario.');
  p.comentarios.push({ id: id(5), autor: user.usuario, autorNombre: user.nombre, rol: user.rol, texto: t, fecha: ahora(), version: p.versiones.length });
  p.actualizado = ahora();
  await piezas.put(p.id, p);
  return p;
}

async function decidir(pid, { estado, comentario, checklist }, user) {
  const p = await piezas.get(pid);
  if (!p) throw new Error('La pieza no existe.');
  if (!ESTADOS_PIEZA[estado]) throw new Error('Estado no válido.');
  if (checklist && typeof checklist === 'object') p.checklist = Object.fromEntries(CHECKLIST.map(([k]) => [k, Boolean(checklist[k])]));
  p.estado = estado;
  p.revisadoPor = user.usuario;
  p.revisadoEn = ahora();
  if (comentario) p.comentarios.push({ id: id(5), autor: user.usuario, autorNombre: user.nombre, rol: user.rol, texto: limpio(comentario, 3000), fecha: ahora(), version: p.versiones.length, decision: estado });
  p.actualizado = ahora();
  await piezas.put(p.id, p);
  // Si tiene fecha, queda en el calendario editorial.
  if (p.fechaPublicacion && (estado === 'aprobada' || estado === 'publicada')) {
    const ev = (await calendario.all()).find(e => e.piezaId === p.id);
    await guardarEvento({ ...(ev || {}), fecha: p.fechaPublicacion, titulo: p.titulo, canal: p.canal, responsable: p.autorNombre, estado: estado === 'publicada' ? 'publicado' : 'listo', piezaId: p.id }, user);
  }
  return p;
}

async function guardarRevisionIA(pid, resultado, version) {
  const p = await piezas.get(pid);
  if (!p) throw new Error('La pieza no existe.');
  p.revisionIA = { version, resultado, fecha: ahora() };
  await piezas.put(p.id, p);
  return p;
}

async function editarPieza(pid, datos) {
  const p = await piezas.get(pid);
  if (!p) throw new Error('La pieza no existe.');
  if (datos.titulo !== undefined) p.titulo = limpio(datos.titulo, 140);
  if (datos.descripcion !== undefined) p.descripcion = limpio(datos.descripcion, 4000);
  if (datos.canal !== undefined && CANALES.includes(datos.canal)) p.canal = datos.canal;
  if (datos.fechaPublicacion !== undefined) p.fechaPublicacion = /^\d{4}-\d{2}-\d{2}$/.test(datos.fechaPublicacion) ? datos.fechaPublicacion : '';
  p.actualizado = ahora();
  await piezas.put(p.id, p);
  return p;
}

// ---------- Calendario editorial ----------
async function listarEventos(desde, hasta) {
  return (await calendario.all())
    .filter(e => (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta))
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
}

async function guardarEvento(d, user) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) throw new Error('Elige la fecha.');
  const prev = d.id ? await calendario.get(d.id) : null;
  const e = {
    id: prev ? prev.id : 'e' + id(7),
    fecha: d.fecha,
    hora: /^\d{2}:\d{2}$/.test(d.hora || '') ? d.hora : '',
    titulo: limpio(d.titulo, 160) || 'Sin título',
    canal: limpio(d.canal, 60),
    responsable: limpio(d.responsable, 80),
    estado: ESTADOS_CAL[d.estado] ? d.estado : 'idea',
    notas: limpio(d.notas, 2000),
    piezaId: d.piezaId || (prev && prev.piezaId) || null,
    creadoPor: prev ? prev.creadoPor : user.usuario,
    actualizado: ahora(),
  };
  await calendario.put(e.id, e);
  return e;
}

module.exports = {
  CANALES, ESTADOS_PIEZA, ESTADOS_CAL, CHECKLIST,
  listarPiezas, crearPieza, agregarVersion, comentar, decidir, guardarRevisionIA, editarPieza,
  obtenerPieza: pid => piezas.get(pid), eliminarPieza: pid => piezas.del(pid),
  listarEventos, guardarEvento, eliminarEvento: eid => calendario.del(eid),
};
