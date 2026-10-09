// Directorio de negocios, creadores y organizaciones de Villa del Rosario y el área metropolitana.
// Fuentes permitidas:
// - Google Maps, con la API oficial de Google Places (datos públicos de negocios: dirección, teléfono, web).
// - Formulario público de inscripción, donde cada persona deja sus datos y autoriza su tratamiento (Ley 1581).
// - Cuentas profesionales de Instagram, con la API oficial (Business Discovery): solo datos públicos del perfil.
// - Registros manuales.
// Solo las personas inscritas con autorización pasan a la base de correos.
const crypto = require('crypto');
const { kv, col, id } = require('./store');
const { ordenarNombre, ordenarCiudad, ordenarTelefono, limpiarEmail } = require('./limpieza');

const dir = col('directorio');
const limpio = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const MUNICIPIOS = {
  'Villa del Rosario': { lat: 7.8336, lng: -72.4746, r: 5000 },
  'Cúcuta': { lat: 7.8939, lng: -72.5078, r: 9000 },
  'Los Patios': { lat: 7.8371, lng: -72.5039, r: 4500 },
  'El Zulia': { lat: 7.9336, lng: -72.6047, r: 6000 },
  'San Cayetano': { lat: 7.8778, lng: -72.6250, r: 5000 },
  'Puerto Santander': { lat: 8.3622, lng: -72.4067, r: 5000 },
};
const TIPOS = { negocio: 'Negocio o empresa', creador: 'Creador de contenido', emprendedor: 'Emprendedor(a)', profesional: 'Profesional independiente', medio: 'Medio de comunicación', organizacion: 'Organización o fundación', otro: 'Otro' };
const ESTADOS = { nuevo: 'Nuevo', contactado: 'Contactado', aliado: 'Aliado', no_interesado: 'No interesado' };
const FUENTES = { google: 'Google Maps', formulario: 'Inscripción', instagram: 'Instagram', manual: 'Manual' };
// Categorías para el barrido completo en Google Maps.
const CATEGORIAS = [
  'restaurantes', 'cafeterías', 'panaderías', 'comidas rápidas', 'bares y discotecas', 'hoteles', 'eventos y banquetes', 'viñedos y productores de uva',
  'supermercados', 'tiendas de ropa', 'zapaterías', 'almacenes de electrodomésticos', 'celulares y tecnología', 'ferreterías', 'papelerías', 'floristerías', 'artesanías',
  'droguerías', 'clínicas', 'consultorios médicos', 'laboratorios clínicos', 'odontólogos', 'ópticas', 'veterinarias', 'gimnasios', 'salones de belleza', 'barberías', 'spa',
  'talleres de motos', 'talleres de carros', 'concesionarios', 'estaciones de servicio', 'inmobiliarias', 'constructoras', 'abogados', 'contadores', 'agencias de viajes',
  'agencias de publicidad', 'fotógrafos', 'emisoras de radio', 'medios de comunicación', 'colegios', 'universidades e institutos', 'iglesias', 'fundaciones',
];

// ---------------- Utilidades ----------------
const soloDigitos = t => String(t || '').replace(/\D/g, '');
function celular(t) {
  const d = soloDigitos(t);
  const n = d.startsWith('57') && d.length === 12 ? d.slice(2) : d;
  return /^3\d{9}$/.test(n) ? '57' + n : '';
}
function usuarioIg(v) {
  const t = String(v || '').trim();
  const m = t.match(/instagram\.com\/([\w.]+)/i);
  return (m ? m[1] : t.replace(/^@/, '')).replace(/[^\w.]/g, '').slice(0, 30).toLowerCase();
}
function web(v) {
  const t = limpio(v, 300);
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : 'https://' + t;
}
// Ubica el municipio del área a partir de un texto (dirección, biografía, etc.).
function municipioDe(texto) {
  const t = sinTildes(texto).toLowerCase();
  if (/villa del rosario|villa rosario/.test(t)) return 'Villa del Rosario';
  if (/los patios/.test(t)) return 'Los Patios';
  if (/el zulia/.test(t)) return 'El Zulia';
  if (/san cayetano/.test(t)) return 'San Cayetano';
  if (/puerto santander/.test(t)) return 'Puerto Santander';
  if (/cucuta/.test(t)) return 'Cúcuta';
  return '';
}

function normalizar(d, prev = {}) {
  const tel = ordenarTelefono(d.telefono || '') || prev.telefono || '';
  const wa = celular(d.whatsapp) || celular(d.telefono) || prev.whatsapp || '';
  const correo = d.correo ? limpiarEmail(d.correo).email || '' : prev.correo || '';
  const muni = ordenarCiudad(d.municipio || '') || prev.municipio || '';
  return {
    ...prev,
    tipo: TIPOS[d.tipo] ? d.tipo : prev.tipo || 'negocio',
    nombre: limpio(d.nombre, 120) || prev.nombre || '',
    contacto: limpio(d.contacto, 80) ? ordenarNombre(limpio(d.contacto, 80)) : prev.contacto || '',
    categoria: limpio(d.categoria, 80) || prev.categoria || '',
    municipio: muni,
    direccion: limpio(d.direccion, 200) || prev.direccion || '',
    barrio: limpio(d.barrio, 80) || prev.barrio || '',
    telefono: tel,
    whatsapp: wa,
    correo,
    instagram: d.instagram !== undefined ? usuarioIg(d.instagram) : prev.instagram || '',
    facebook: limpio(d.facebook, 200) || prev.facebook || '',
    tiktok: limpio(d.tiktok, 80) || prev.tiktok || '',
    web: d.web !== undefined ? web(d.web) : prev.web || '',
    notas: d.notas !== undefined ? limpio(d.notas, 1000) : prev.notas || '',
    estado: ESTADOS[d.estado] ? d.estado : prev.estado || 'nuevo',
  };
}

// ---------------- Consultas ----------------
async function listar(f = {}) {
  const q = sinTildes(f.q || '').toLowerCase();
  let items = await dir.all();
  const total = items.length;
  const resumen = {
    total,
    autorizados: items.filter(x => x.consentimiento).length,
    conWhatsapp: items.filter(x => x.whatsapp).length,
    conCorreo: items.filter(x => x.correo).length,
    conTelefono: items.filter(x => x.telefono).length,
    porMunicipio: {}, porFuente: {}, porCategoria: {},
  };
  for (const x of items) {
    const m = x.municipio || 'Sin municipio';
    resumen.porMunicipio[m] = (resumen.porMunicipio[m] || 0) + 1;
    resumen.porFuente[x.fuente] = (resumen.porFuente[x.fuente] || 0) + 1;
    if (x.categoria) resumen.porCategoria[x.categoria] = (resumen.porCategoria[x.categoria] || 0) + 1;
  }
  if (f.municipio) items = items.filter(x => (x.municipio || 'Sin municipio') === f.municipio);
  if (f.fuente) items = items.filter(x => x.fuente === f.fuente);
  if (f.tipo) items = items.filter(x => x.tipo === f.tipo);
  if (f.estado) items = items.filter(x => x.estado === f.estado);
  if (f.categoria) items = items.filter(x => x.categoria === f.categoria);
  if (f.con === 'whatsapp') items = items.filter(x => x.whatsapp);
  if (f.con === 'correo') items = items.filter(x => x.correo);
  if (f.con === 'autorizados') items = items.filter(x => x.consentimiento);
  if (q) items = items.filter(x => sinTildes([x.nombre, x.categoria, x.direccion, x.barrio, x.contacto, x.instagram, x.correo, x.telefono].join(' ')).toLowerCase().includes(q));
  items.sort((a, b) => (a.municipio || 'zz').localeCompare(b.municipio || 'zz', 'es') || (a.categoria || 'zz').localeCompare(b.categoria || 'zz', 'es') || (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  return { resumen, filtrados: items.length, items };
}

async function guardar(d) {
  const prev = d.id ? await dir.get(d.id) : null;
  if (d.id && !prev) throw new Error('El registro ya no existe.');
  const x = normalizar(d, prev || {});
  if (!x.nombre) throw new Error('Escribe el nombre del negocio o la persona.');
  if (!prev) Object.assign(x, { id: 'd' + id(8), fuente: 'manual', consentimiento: false, creado: new Date().toISOString() });
  x.actualizado = new Date().toISOString();
  await dir.put(x.id, x);
  return x;
}
async function eliminar(idReg) {
  const x = await dir.get(idReg);
  if (!x) throw new Error('El registro ya no existe.');
  await dir.del(idReg);
  return x;
}
async function restaurar(x) { if (x && x.id) await dir.put(x.id, x); return x; }
async function marcar(idReg, estado) {
  const x = await dir.get(idReg);
  if (!x) throw new Error('El registro ya no existe.');
  if (!ESTADOS[estado]) throw new Error('Estado no válido.');
  x.estado = estado;
  if (estado === 'contactado') x.contactadoEn = new Date().toISOString();
  x.actualizado = new Date().toISOString();
  await dir.put(x.id, x);
  return x;
}

// ---------------- Google Maps (API oficial de Google Places) ----------------
const googleListo = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);
const CAMPOS = ['id', 'displayName', 'formattedAddress', 'addressComponents', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri', 'googleMapsUri', 'primaryTypeDisplayName', 'location', 'rating', 'userRatingCount', 'businessStatus'];

async function placesBuscar(texto, centro, pageToken) {
  const host = process.env.GOOGLE_PLACES_HOST || 'https://places.googleapis.com';
  const r = await fetch(`${host}/v1/places:searchText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': CAMPOS.map(c => 'places.' + c).join(',') + ',nextPageToken' },
    body: JSON.stringify({ textQuery: texto, languageCode: 'es', regionCode: 'CO', pageSize: 20, locationBias: { circle: { center: { latitude: centro.lat, longitude: centro.lng }, radius: centro.r } }, ...(pageToken ? { pageToken } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error && j.error.message || 'HTTP ' + r.status;
    if (/API key not valid|API_KEY_INVALID/i.test(m)) throw new Error('La clave de Google Maps no es válida. Revísala en Vercel (GOOGLE_MAPS_API_KEY).');
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(m)) throw new Error('Activa "Places API (New)" en Google Cloud para esta clave.');
    if (/billing/i.test(m)) throw new Error('Google pide activar la facturación del proyecto para usar Places API.');
    throw new Error('Google Maps: ' + m);
  }
  return j;
}

function municipioDeLugar(p) {
  const comps = p.addressComponents || [];
  for (const tipo of ['locality', 'administrative_area_level_2']) {
    const c = comps.find(x => (x.types || []).includes(tipo));
    const m = c && municipioDe(c.longText || c.shortText);
    if (m) return m;
  }
  return municipioDe(p.formattedAddress || '');
}

// Busca una categoría en un municipio (hasta 3 páginas de 20 resultados) y guarda lo nuevo.
async function buscarGoogle({ categoria, municipio, paginas = 3 }) {
  if (!googleListo()) throw new Error('Falta conectar Google Maps: agrega GOOGLE_MAPS_API_KEY en Vercel.');
  const centro = MUNICIPIOS[municipio];
  if (!centro) throw new Error('Elige un municipio del área metropolitana.');
  const cat = limpio(categoria, 80);
  if (!cat) throw new Error('Escribe qué tipo de negocio buscar.');
  const texto = `${cat} en ${municipio}, Norte de Santander, Colombia`;
  const out = { categoria: cat, municipio, encontrados: 0, nuevos: 0, actualizados: 0, otraZona: 0, cerrados: 0, consultas: 0 };
  let token;
  const escribir = {};
  for (let i = 0; i < Math.min(3, Math.max(1, paginas)); i++) {
    const r = await placesBuscar(texto, centro, token);
    out.consultas++;
    for (const p of r.places || []) {
      out.encontrados++;
      if (p.businessStatus === 'CLOSED_PERMANENTLY') { out.cerrados++; continue; }
      const muni = municipioDeLugar(p);
      if (!muni) { out.otraZona++; continue; }
      const key = 'g_' + p.id;
      const prev = escribir[key] || await dir.get(key);
      const base = {
        tipo: 'negocio', nombre: p.displayName && p.displayName.text, categoria: prev && prev.categoria || cat,
        municipio: muni, direccion: (p.formattedAddress || '').replace(/, (Norte de Santander|Colombia)/g, ''), telefono: p.nationalPhoneNumber || p.internationalPhoneNumber || '', web: p.websiteUri || '',
      };
      const x = normalizar(base, prev || {});
      Object.assign(x, {
        id: key, placeId: p.id, fuente: prev ? prev.fuente : 'google', consentimiento: prev ? prev.consentimiento : false,
        tipoGoogle: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text || '', mapsUrl: p.googleMapsUri || '',
        rating: p.rating || null, resenas: p.userRatingCount || 0, lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
        creado: prev ? prev.creado : new Date().toISOString(), actualizado: new Date().toISOString(),
      });
      escribir[key] = x;
      prev ? out.actualizados++ : out.nuevos++;
    }
    token = r.nextPageToken;
    if (!token) break;
  }
  if (Object.keys(escribir).length) await dir.putMany(escribir);
  const mes = 'directorio:consultas:' + new Date().toISOString().slice(0, 7);
  for (let i = 0; i < out.consultas; i++) await kv.incr(mes, 40 * 24 * 3600);
  return out;
}
async function consultasMes() { return Number(await kv.get('directorio:consultas:' + new Date().toISOString().slice(0, 7)) || 0); }

// ---------------- Formulario público de inscripción ----------------
const hashIp = ip => crypto.createHash('sha256').update('dir|' + ip).digest('hex').slice(0, 16);
async function inscribir(d, ip) {
  if (d.sitio) throw new Error('No se pudo enviar.'); // campo trampa para robots
  if (d.autorizo !== 'si' && d.autorizo !== true) throw new Error('Para inscribirte debes autorizar el tratamiento de tus datos.');
  const x = normalizar(d);
  if (!x.nombre) throw new Error('Escribe tu nombre o el de tu negocio.');
  if (!x.municipio) throw new Error('Elige tu municipio.');
  if (!x.whatsapp && !x.correo) throw new Error('Déjanos al menos un WhatsApp (celular) o un correo válido.');
  const todos = await dir.all();
  const prev = todos.find(y => (x.correo && y.correo === x.correo) || (x.whatsapp && y.whatsapp === x.whatsapp));
  const ahora = new Date().toISOString();
  const reg = {
    ...(prev || {}), ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== '' && v !== undefined)),
    id: prev ? prev.id : 'f' + id(8), fuente: prev ? prev.fuente : 'formulario', estado: prev && prev.estado !== 'nuevo' ? prev.estado : 'aliado',
    consentimiento: true, consentimientoEn: ahora, consentimientoTexto: TEXTO_AUTORIZACION, recibirInfo: d.recibir === 'si' || d.recibir === true,
    inscritoEn: ahora, ipHash: hashIp(ip || ''), creado: prev ? prev.creado : ahora, actualizado: ahora,
  };
  await dir.put(reg.id, reg);
  return reg;
}
const TEXTO_AUTORIZACION = 'Autorizo a la Alcaldía de Villa del Rosario (Oficina de Prensa) a tratar mis datos personales, conforme a la Ley 1581 de 2012, para contactarme e informarme sobre eventos, ferias, convocatorias y actividades del municipio. Puedo consultar, actualizar o pedir la eliminación de mis datos en cualquier momento.';

// ---------------- Mensaje de invitación por WhatsApp ----------------
const MENSAJE_DEFECTO = 'Hola {nombre} 👋 Te saluda la Oficina de Prensa de la Alcaldía de Villa del Rosario. Estamos creando la Red de negocios y creadores de Villa del Rosario y el área metropolitana para invitarte a la Feria de la Uva y a otros eventos y oportunidades. Si quieres hacer parte, inscríbete aquí: {enlace}';
async function mensaje() { return (await kv.get('directorio:mensaje')) || MENSAJE_DEFECTO; }
async function guardarMensaje(t) { const m = limpio(t, 900); await kv.set('directorio:mensaje', m || MENSAJE_DEFECTO); return m || MENSAJE_DEFECTO; }

// ---------------- Exportar ----------------
const csvCelda = v => { const t = String(v ?? ''); return /[";\n,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function csv(items) {
  const cols = [['nombre', 'Nombre'], ['tipo', 'Tipo'], ['categoria', 'Categoría'], ['municipio', 'Municipio'], ['direccion', 'Dirección'], ['barrio', 'Barrio'], ['telefono', 'Teléfono'], ['whatsapp', 'WhatsApp'], ['correo', 'Correo'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['web', 'Sitio web'], ['mapsUrl', 'Google Maps'], ['rating', 'Calificación'], ['fuente', 'Fuente'], ['consentimiento', 'Autorizó datos'], ['estado', 'Estado'], ['notas', 'Notas']];
  const val = (x, k) => k === 'tipo' ? TIPOS[x.tipo] : k === 'fuente' ? FUENTES[x.fuente] : k === 'estado' ? ESTADOS[x.estado] : k === 'consentimiento' ? (x.consentimiento ? 'Sí' : 'No') : k === 'whatsapp' ? (x.whatsapp ? '+' + x.whatsapp : '') : k === 'instagram' ? (x.instagram ? '@' + x.instagram : '') : x[k];
  return '﻿' + [cols.map(c => c[1]).join(';'), ...items.map(x => cols.map(([k]) => csvCelda(val(x, k))).join(';'))].join('\r\n');
}

module.exports = {
  MUNICIPIOS, TIPOS, ESTADOS, FUENTES, CATEGORIAS, TEXTO_AUTORIZACION,
  listar, guardar, eliminar, restaurar, marcar, buscarGoogle, googleListo, consultasMes, inscribir, mensaje, guardarMensaje, csv, municipioDe, usuarioIg, normalizar, dir,
};
