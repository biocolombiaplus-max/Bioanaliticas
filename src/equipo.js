// Equipo de trabajo de la Oficina de Prensa (colaboradores que participan en las actividades)
// y perfil de firma de cada usuario para los informes.
const { kv, col, id } = require('./store');

const equipo = col('equipo');
const CARGOS = ['Periodista', 'Fotógrafo(a)', 'Camarógrafo(a)', 'Diseñador(a) gráfico(a)', 'Community manager', 'Editor(a) audiovisual', 'Presentador(a)', 'Productor(a)', 'Conductor(a)', 'Apoyo logístico', 'Practicante', 'Otro'];
const COLORES = ['#4a43b0', '#e0661f', '#2a8fb3', '#5a9e32', '#9a5bd0', '#c0392b', '#1f7a6b', '#b7791f'];
const limpio = (v, n = 160) => String(v ?? '').trim().slice(0, n);

async function listar() {
  return (await equipo.all()).sort((a, b) => (b.activo !== false) - (a.activo !== false) || a.nombre.localeCompare(b.nombre, 'es'));
}

async function guardar(d) {
  const prev = d.id ? await equipo.get(d.id) : null;
  const todos = prev ? null : await equipo.all();
  const m = {
    id: prev ? prev.id : 'm' + id(6),
    nombre: limpio(d.nombre, 80),
    cargo: limpio(d.cargo, 60) || 'Otro',
    correo: limpio(d.correo, 120),
    telefono: limpio(d.telefono, 40),
    color: prev ? prev.color : COLORES[(todos ? todos.length : 0) % COLORES.length],
    activo: d.activo === undefined ? true : d.activo === true || d.activo === 'true',
    creado: prev ? prev.creado : new Date().toISOString(),
  };
  if (!m.nombre) throw new Error('Escribe el nombre del colaborador.');
  await equipo.put(m.id, m);
  return m;
}

// ---------- Firma y datos para los informes ----------
async function perfil(usuario) {
  const p = await kv.get('perfil:' + usuario);
  return p ? JSON.parse(p) : {};
}

async function guardarPerfil(usuario, d) {
  const prev = await perfil(usuario);
  const firma = d.firma === '' ? '' : (d.firma || prev.firma || '');
  if (firma && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(firma) || firma.length > 400000)) throw new Error('La firma no es una imagen válida.');
  const p = {
    nombreCompleto: limpio(d.nombreCompleto ?? prev.nombreCompleto, 100),
    cargo: limpio(d.cargo ?? prev.cargo, 100),
    recibeNombre: limpio(d.recibeNombre ?? prev.recibeNombre, 100),
    recibeCargo: limpio(d.recibeCargo ?? prev.recibeCargo, 100),
    firma,
    actualizado: new Date().toISOString(),
  };
  await kv.set('perfil:' + usuario, JSON.stringify(p));
  return p;
}

module.exports = { CARGOS, listar, guardar, obtener: mid => equipo.get(mid), eliminar: mid => equipo.del(mid), perfil, guardarPerfil };
