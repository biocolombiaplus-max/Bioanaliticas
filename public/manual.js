/* Manual de uso personalizado: se arma con las funciones que tiene asignadas cada persona. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = new URLSearchParams(location.search);
const RANGO = { ver: 1, subir: 2, editar: 3, aprobar: 3 };
let NOMBRE = 'Manual-de-uso.pdf';

// Contenido por sección. Los pasos se muestran según el nivel: quien edita ve también los de "ver".
// En los textos, <kbd> marca el nombre exacto de un botón.
const GUIA = {
  piezas: {
    titulo: 'Piezas para revisar',
    que: 'Aquí viajan las piezas gráficas (imágenes, videos o PDF) antes de publicarse: diseño las sube, la jefatura las revisa con una lista de verificación y las aprueba o pide cambios. Nada se publica sin visto bueno.',
    ver: [
      ['Entra a la sección', 'En el menú toca <kbd>Piezas para revisar</kbd>. Arriba puedes filtrar por estado: <b>Por revisar</b>, <b>Con cambios pedidos</b>, <b>Aprobada</b> y <b>Publicada</b>.'],
      ['Abre una pieza', 'Toca la tarjeta para ver la imagen o el video, las versiones anteriores y la conversación con los comentarios.'],
    ],
    subir: [
      ['Sube una pieza nueva', 'Toca <kbd>+ Subir pieza</kbd>. Escribe un título claro (ej.: “Afiche Cabalgata – domingo”), elige el canal (Instagram, Facebook, TikTok, afiche…) y la fecha en que se publicará.'],
      ['Adjunta el archivo y el texto', 'Sube la imagen, el video o el PDF y pega el texto que acompañará la publicación en redes: también se revisa.'],
      ['Envíala a revisión', 'Toca <kbd>Enviar a revisión</kbd>. La pieza queda en <b>Por revisar</b> y la jefatura ve el aviso con un número naranja en el menú.'],
      ['Si te piden cambios', 'La pieza pasa a <b>Con cambios pedidos</b> y el número naranja de tu menú te avisa. Lee el comentario, corrige y toca <kbd>Subir nueva versión</kbd> dentro de la misma pieza. No crees una pieza nueva: así se conserva la historia.'],
      ['Cuando la aprueban', 'Queda en <b>Aprobada</b>. Si tiene fecha, aparece sola en el calendario editorial, lista para publicar.'],
    ],
    aprobar: [
      ['Revisa las pendientes', 'El número naranja junto a <kbd>Piezas para revisar</kbd> indica cuántas esperan tu revisión. Abre cada una.'],
      ['Usa la lista de verificación', 'Marca cada punto: ortografía y tildes, fechas y horas, nombres y cargos, logos y créditos. Si la inteligencia artificial está activa, también puedes pedir una revisión automática de ortografía.'],
      ['Decide', 'Toca <kbd>✓ Aprobar</kbd> o <kbd>Pedir cambios</kbd> escribiendo exactamente qué corregir. La persona de diseño ve tu comentario al instante.'],
    ],
    tips: { subir: 'Antes de subir, compara fechas, horas y nombres con la información oficial: es lo que más se corrige.', aprobar: 'Escribe los cambios en una lista corta y concreta (“cambiar 7:00 p. m. por 7:30 p. m.”): la nueva versión llega más rápido.' },
  },
  agenda: {
    titulo: 'Agenda de gestión e informe',
    que: 'La bitácora de la Oficina de Prensa: ruedas de prensa, entrevistas, cubrimientos, comunicados y reuniones, con su resultado, fotos y enlaces como soporte. Con esa información sale el informe de gestión en PDF, listo para el despacho.',
    ver: [
      ['Consulta la agenda', 'Toca <kbd>Agenda de gestión</kbd>. Verás las actividades por día con su estado (programada, realizada, reprogramada o cancelada), el equipo y las fotos.'],
      ['Abre el informe', 'En <kbd>Informe de gestión</kbd> elige la fecha inicial y final y toca <kbd>Ver</kbd>. Se abre el informe en hojas tamaño carta.'],
      ['Descarga el PDF', 'Toca <kbd>⬇ Descargar PDF</kbd>. En el iPhone aparece <kbd>Guardar o compartir</kbd> para guardarlo en Archivos o enviarlo por WhatsApp. No uses <kbd>Imprimir</kbd> desde el celular.'],
    ],
    editar: [
      ['Crea una actividad', 'Toca <kbd>+ Nueva actividad</kbd> (en el celular, el botón redondo <kbd>+</kbd>). Elige el tipo, escribe el título, la fecha, la hora y el lugar.'],
      ['Elige el equipo', 'Toca los nombres de quienes participan. Con <kbd>👥 Equipo</kbd> agregas colaboradores nuevos (periodistas, fotógrafos, camarógrafos…).'],
      ['Registra el resultado', 'Al terminar, márcala como <b>Realizada</b> y escribe el resultado, el número de asistentes, medios presentes y publicaciones generadas.'],
      ['Agrega soportes', 'Sube fotos desde la cámara o la galería y pega los enlaces de las notas publicadas. Las fotos salen grandes en el informe.'],
      ['Corrige o elimina', 'Toca la actividad para editarla. Para borrar una actividad o una foto usa 🗑: tienes unos segundos para tocar <kbd>Deshacer</kbd>.'],
      ['Ajusta el informe', 'En el informe, <kbd>✎ Editar textos</kbd> permite corregir el resumen, los logros y las recomendaciones (luego <kbd>✓ Guardar textos</kbd>). Con las casillas eliges si salen fotos, actividades canceladas y la firma; con <kbd>👥 Equipo</kbd>, quiénes aparecen.'],
    ],
    tips: { editar: 'Registra cada actividad el mismo día, con al menos una foto: el informe de fin de mes se arma solo y queda mucho más completo.' },
  },
  calendario: {
    titulo: 'Calendario editorial',
    que: 'Qué se publica, cuándo y por qué canal. Las piezas aprobadas con fecha aparecen solas en el calendario.',
    ver: [
      ['Consulta el mes', 'Toca <kbd>Calendario editorial</kbd>. Usa <kbd>‹</kbd> y <kbd>›</kbd> para cambiar de mes. A la derecha están las <b>Próximas publicaciones</b>.'],
      ['Lee los estados', 'Cada publicación tiene un estado: <b>Idea</b>, <b>En producción</b>, <b>Listo para publicar</b> o <b>Publicado</b>.'],
    ],
    editar: [
      ['Planea una publicación', 'Toca <kbd>+ Agregar</kbd> o directamente el día. Escribe el título, el canal, la hora, la persona responsable y el estado.'],
      ['Actualiza el avance', 'Abre la publicación y cambia el estado a medida que avanza, hasta <b>Publicado</b>.'],
    ],
  },
  correos: {
    titulo: 'Correos',
    que: 'Correos profesionales a las bases de contactos autorizadas: invitaciones, boletines y comunicados con botones a la programación o a una publicación. Se mide quién abre, quién hace clic y quién se da de baja.',
    ver: [
      ['Revisa los resultados', 'En <kbd>Correos</kbd> cada campaña muestra enviados, aperturas, clics en el botón y bajas. Abre su informe en PDF para presentarlo.'],
    ],
    editar: [
      ['Crea el correo', 'Toca <kbd>+ Nuevo correo</kbd>. Elige el tipo (invitación, boletín, comunicado…), escribe el asunto y el texto, y configura el botón (por ejemplo, el enlace de la publicación de Instagram).'],
      ['Elige a quién y desde dónde', 'Selecciona la lista de contactos y, en <kbd>Enviar desde</kbd>, la cuenta de correo que envía.'],
      ['Revisa antes de enviar', 'Mira la vista previa y el revisor de calidad. Si quedan textos entre corchetes como [nombre del evento], no deja enviar hasta completarlos.'],
      ['Haz una prueba', 'Toca <kbd>Enviar prueba</kbd> y revisa cómo llega a tu propio correo, en el celular y en el computador.'],
      ['Envía', 'Toca <kbd>Enviar</kbd>. Sale un correo cada 10 segundos y como máximo 300 al día por cuenta de Gmail; si se llega al límite, sigue al día siguiente. Puedes pausar y reanudar.'],
    ],
    tips: { editar: 'Solo se escribe a personas que autorizaron recibir información (Ley 1581 de 2012). Cada correo trae su enlace para darse de baja y a quien se da de baja no se le vuelve a escribir.' },
  },
  contactos: {
    titulo: 'Bases de datos',
    que: 'Las listas de contactos para los correos. Cualquier Excel o CSV se analiza, se limpia y se ordena antes de importarlo: corrige correos mal escritos, tildes en los nombres, municipios y teléfonos.',
    ver: [
      ['Consulta la base', 'En <kbd>Bases de datos</kbd> ves el total de contactos, los listos para recibir, las bajas y los municipios. Usa el buscador para encontrar a alguien.'],
    ],
    editar: [
      ['Analiza un archivo', 'En <kbd>1. Analizar una base</kbd> elige el Excel o CSV y toca <kbd>Analizar base</kbd>. No se importa nada todavía.'],
      ['Revisa el diagnóstico', 'Verás cuántos correos son válidos, cuántos se corrigieron, cuántos están repetidos y de qué municipios son.'],
      ['Descarga la base limpia (opcional)', 'Con <kbd>Descargar base limpia (Excel/CSV)</kbd> obtienes el archivo ordenado.'],
      ['Importa', 'Escribe el nombre de la lista, confirma que las personas autorizaron y toca <kbd>Importar</kbd>. Las bajas anteriores se respetan siempre.'],
    ],
  },
  directorio: {
    titulo: 'Directorio y red',
    que: 'Negocios, emprendedores y creadores de Villa del Rosario, Cúcuta, Los Patios y el área metropolitana, de fuentes oficiales (Google Maps, Instagram) y del formulario de inscripción con autorización de datos.',
    ver: [
      ['Busca y filtra', 'En <kbd>Directorio y red</kbd> filtra por municipio, fuente o estado y busca por nombre, categoría o barrio. <kbd>Descargar Excel</kbd> baja lo filtrado.'],
    ],
    editar: [
      ['Comparte el formulario', 'En <b>1. Formulario de inscripción</b> copia el enlace, descarga el código QR o toca <kbd>Compartir</kbd>. Quien se inscribe con correo entra solo a la lista de correos “Red Villa del Rosario”.'],
      ['Busca en Google Maps', 'Elige los municipios, escribe un tipo de negocio (restaurantes, droguerías…) y toca <kbd>Buscar</kbd>, o usa el <b>barrido completo</b> de todas las categorías.'],
      ['Consulta cuentas de Instagram', 'Escribe usuarios de cuentas profesionales que ya conoces y toca <kbd>Consultar perfiles</kbd>; guarda cada una con su municipio.'],
      ['Invita por WhatsApp', 'En cada negocio con celular toca <kbd>WhatsApp</kbd>: se abre el chat con la invitación lista y tú decides si la envías. El registro queda como <b>Contactado</b>.'],
      ['Organiza', 'Cambia el estado (Nuevo, Contactado, Aliado, No interesado), edita los datos o elimina con opción de deshacer.'],
    ],
    tips: { editar: 'Los negocios que vienen de Google Maps o Instagram no reciben correos masivos: se les llama o se les invita uno por uno a inscribirse.' },
  },
  estudio: {
    titulo: 'Estudio de contenidos',
    que: 'Sube una imagen (afiche, foto o pieza) y obtén propuestas de texto para cada red, una nota de prensa con SEO local y el correo listo. Funciona cuando la inteligencia artificial está activada.',
    editar: [
      ['Sube la imagen y da contexto', 'En <kbd>Estudio de contenidos</kbd> sube la imagen y completa el tema, la fecha, el lugar y el tono.'],
      ['Revisa y ajusta', 'Lee las propuestas, cópialas y ajústalas: siempre las revisa una persona antes de publicar.'],
    ],
  },
  analizar: {
    titulo: 'Analizar publicación',
    que: 'Mide el impacto de cualquier publicación de Instagram: alcance, interacción, compartidos, guardados y un puntaje de 0 a 100, con lectura y recomendaciones.',
    ver: [
      ['Consulta los análisis', 'En <kbd>Analizar publicación</kbd> está la lista de <b>Publicaciones analizadas</b> con su puntaje.'],
      ['Descarga el informe', 'En cada publicación toca <kbd>Descargar informe PDF</kbd>.'],
    ],
    editar: [
      ['Analiza un enlace', 'Pega el enlace de la publicación en <b>Análisis instantáneo</b> y toca <kbd>Analizar</kbd>.'],
      ['Actualiza las cifras', 'Con <kbd>Actualizar todas</kbd> se traen las cifras más recientes de las publicaciones guardadas.'],
    ],
  },
  tablero: {
    titulo: 'Tablero',
    que: 'Correo e Instagram en un solo lugar: envíos, aperturas, clics, seguidores y alcance.',
    ver: [['Consulta el tablero', 'Toca <kbd>Tablero</kbd> para ver las cifras del momento y las gráficas.']],
  },
  instagram: {
    titulo: 'Cuenta de Instagram',
    que: 'Seguidores reales, crecimiento de los últimos 28 días y desempeño de las publicaciones recientes de la cuenta oficial.',
    ver: [['Consulta la cuenta', 'Toca <kbd>Cuenta de Instagram</kbd>: seguidores nuevos por día, alcance y las publicaciones con mejor desempeño.']],
  },
  informes: {
    titulo: 'Informes',
    que: 'Informes ejecutivos listos para presentar: integral, por publicación y por campaña de correo, en hojas tamaño carta.',
    ver: [
      ['Genera el informe', 'En <kbd>Informes</kbd> toca <kbd>Generar informe integral</kbd> o el PDF de una publicación o campaña.'],
      ['Descárgalo', 'Toca <kbd>⬇ Descargar PDF</kbd>. En el iPhone, <kbd>Guardar o compartir</kbd>.'],
    ],
  },
};
const ADMIN = {
  titulo: 'Ajustes, usuarios y firma',
  que: 'Como administradora controlas quién entra al panel, qué puede hacer cada persona, las cuentas de correo para enviar y tu firma en los informes.',
  pasos: [
    ['Crea un usuario', 'En <kbd>Ajustes y usuarios</kbd> toca <kbd>+ Agregar usuario</kbd>. Escribe el nombre, el usuario para ingresar (sin espacios) y una clave de al menos 5 caracteres.'],
    ['Asígnale funciones', 'Elige un tipo listo (Diseño, Periodista o apoyo de prensa, Community manager, Consulta) y ajusta la tabla de funciones: en cada sección, <b>Sin acceso</b>, <b>Ver</b> o <b>Editar</b>. Si cambias algo, el tipo queda como “Personalizado”.'],
    ['Entrégale su acceso y su manual', 'Comparte el usuario y la clave por un medio privado. Con <kbd>📖 Manual</kbd> abres el manual de esa persona, hecho a la medida de sus funciones, y lo descargas en PDF para enviárselo.'],
    ['Cambia funciones o desactiva', 'Con <kbd>Editar</kbd> cambias funciones o clave, o desmarcas <b>Usuario activo</b> para cerrarle el acceso sin borrar su historia.'],
    ['Agrega un correo para enviar', 'Toca <kbd>+ Agregar correo</kbd>. Con Gmail usa una <b>contraseña de aplicación</b> (en la cuenta de Google: Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones). Cada cuenta envía máximo 300 correos al día. Toca <kbd>Probar</kbd> para verificar.'],
    ['Firma los informes', 'En <b>Mi firma</b> toca <kbd>✍ Firmar</kbd>: dibuja tu firma con el dedo o sube una imagen y escribe tu nombre y cargo. Puedes cambiarla o eliminarla cuando quieras.'],
  ],
  tip: 'Las conexiones (Instagram, almacenamiento de fotos, Google Maps e inteligencia artificial) se activan con claves en Vercel. Las claves nunca se escriben en el panel ni se comparten por chat.',
};

const sec = (n, t, p) => `<div class="sep"><div class="sec"><span class="n">${n}</span><div><h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div></div></div>`;
const paso = (i, [t, d]) => `<div class="paso"><span class="n">${i}</span><div><b>${t}.</b> ${d}</div></div>`;
const tip = t => `<div class="tip"><i>💡</i><div>${t}</div></div>`;

async function main() {
  const r = await fetch('/api/manual' + (q.get('usuario') ? '?usuario=' + encodeURIComponent(q.get('usuario')) : ''));
  if (r.status === 401) return (location.href = '/#ingresar');
  const M = await r.json();
  if (!r.ok) throw new Error(M.error || 'No se pudo cargar el manual');
  const admin = M.rol === 'admin', F = M.funciones || {};
  const nivelDe = k => admin ? (Object.keys(M.modulos[k].niveles).pop()) : F[k];
  NOMBRE = `Manual-de-uso-${M.nombre.replace(/\s+/g, '-')}.pdf`;
  const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const doc = document.getElementById('doc');
  const mods = Object.keys(GUIA).filter(k => nivelDe(k));

  doc.innerHTML = `<section class="page cover"><div class="bg"></div><div class="c1"></div><div class="c2"></div><div class="c3"></div>
    <div class="in"><img class="logo" src="/img/logo.png" alt="">
      <div class="kick">Sala de Prensa Digital · Manual de uso</div>
      <h1>Manual de ${esc(M.nombre)}</h1>
      <div class="per">${esc(M.rolNombre)}</div>
      <div class="hero"><div><b>${mods.length + (admin ? 1 : 0)}</b><span>secciones a tu cargo</span></div><div><b>${mods.filter(k => (RANGO[nivelDe(k)] || 0) > 1).length + (admin ? 1 : 0)}</b><span>donde puedes crear y editar</span></div><div><b>24/7</b><span>desde el celular o el computador</span></div></div>
      <div class="meta"><div>Entidad<b>${esc(M.organizacion)}</b></div><div>Usuario<b>${esc(M.usuario)}</b></div><div>Actualizado<b>${hoy}</b></div></div>
    </div><div class="bandas"></div></section>`;

  const B = [];
  let n = 0;
  const num = () => String(++n).padStart(2, '0');

  // Acceso
  const bienvenida = sec(num(), 'Bienvenida y acceso', 'Cómo entrar y tener el panel como una app') + `<div class="lead">Hola, <b>${esc(M.nombre)}</b>. Este manual está hecho a la medida de tus funciones en la Sala de Prensa Digital de la ${esc(M.organizacion)}: solo verás aquí las secciones que tienes asignadas.</div>
    <div class="credencial"><div><span>Dirección</span><b>${esc(M.baseUrl.replace(/^https?:\/\//, ''))}</b></div><div><span>Tu usuario</span><b>${esc(M.usuario)}</b></div><div><span>Tu clave</span><b>La que te entregó la jefatura</b></div></div>`;
  [
    ['Entra', `Abre <b>${esc(M.baseUrl.replace(/^https?:\/\//, ''))}</b> en el navegador, toca <kbd>Ingresar</kbd> y escribe tu usuario y tu clave.`],
    ['Instálala como app en el iPhone', 'En Safari toca el botón <b>Compartir</b> (cuadro con flecha) y luego <b>Agregar a inicio</b>. Queda un ícono como cualquier app.'],
    ['Instálala en Android', 'En Chrome toca el menú <b>⋮</b> y luego <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.'],
    ['Sal de forma segura', 'Al terminar en un equipo compartido toca <kbd>Salir</kbd> en el menú. La sesión se cierra sola después de 12 horas.'],
  ].forEach((p, i) => B.push((i ? '' : bienvenida + '<div class="sub">Paso a paso</div>') + paso(i + 1, p)));
  B.push(tip('No compartas tu clave con nadie. Si la olvidas, la jefatura te asigna una nueva en un minuto.'));

  // Funciones
  B.push(sec(num(), 'Tus funciones', 'Lo que puedes ver y hacer en cada sección') + `<table class="tabla"><thead><tr><th>Sección</th><th>Tu acceso</th></tr></thead><tbody>
    ${Object.entries(M.modulos).filter(([k]) => nivelDe(k)).map(([k, m]) => `<tr><td>${esc(m.nombre)}</td><td><span class="si">✓ ${esc(m.niveles[nivelDe(k)])}</span></td></tr>`).join('')}
    ${admin ? '<tr><td>Ajustes, usuarios y correos de envío</td><td><span class="si">✓ Administra</span></td></tr>' : '<tr><td>Las demás secciones</td><td><span class="no">Sin acceso</span></td></tr>'}
    </tbody></table>`);
  if (!admin) B.push(tip('Si necesitas una sección que no tienes, pídesela a la jefatura: te la asigna desde Ajustes y la verás la próxima vez que entres.'));

  // Inicio
  B.push(sec(num(), 'Inicio', 'Tu resumen del día') + '<div class="lead">Al entrar ves un saludo, las cifras del día, accesos rápidos a lo que más usas, las piezas recientes y lo programado para la semana. Desde ahí también abres este manual con <kbd>Mi manual de uso</kbd>.</div>');

  // Secciones
  for (const k of mods) {
    const g = GUIA[k], nivel = nivelDe(k), rango = RANGO[nivel] || 0;
    const etiqueta = M.modulos[k].niveles[nivel];
    const cabeza = sec(num(), esc(g.titulo) + `<span class="nivel ${rango === 1 ? 'ver' : ''}">${esc(etiqueta)}</span>`) + `<div class="lead">${g.que}</div>`;
    let pasos = [...(g.ver || [])];
    if (k === 'piezas') pasos.push(...(nivel === 'aprobar' ? g.aprobar : nivel === 'subir' ? g.subir : []));
    else if (rango >= 3) pasos.push(...(g.editar || []));
    // El título y la introducción van siempre en la misma hoja que el primer paso.
    pasos.forEach((p, i) => B.push((i ? '' : cabeza + '<div class="sub">Paso a paso</div>') + paso(i + 1, p)));
    const t = g.tips && (g.tips[nivel] || (rango >= 2 && (g.tips.subir || g.tips.editar)));
    if (t) B.push(tip(t));
  }

  if (admin) {
    const cabeza = sec(num(), ADMIN.titulo, 'Solo para administradores') + `<div class="lead">${ADMIN.que}</div>`;
    ADMIN.pasos.forEach((p, i) => B.push((i ? '' : cabeza + '<div class="sub">Paso a paso</div>') + paso(i + 1, p)));
    B.push(tip(ADMIN.tip));
  }

  // Preguntas frecuentes
  const faq = [
    ['No veo una sección o me sale “Tu usuario no tiene permiso”.', admin ? 'Eres administradora: tienes todo. Si un colaborador te lo dice, revisa sus funciones en Ajustes.' : 'Esa función no está asignada a tu usuario. Pídela a la jefatura.'],
    ['Olvidé mi clave.', admin ? 'Tu clave de administradora se cambia en Vercel (variable ADMIN_USERS); pídeselo a la agencia.' : 'La jefatura te asigna una nueva desde Ajustes.'],
    ['El PDF sale mal en el iPhone.', 'Usa siempre <kbd>⬇ Descargar PDF</kbd> y luego <kbd>Guardar o compartir</kbd>. <kbd>Imprimir</kbd> es solo para el computador.'],
    ['¿Se pierde algo si cierro la app?', 'No. Todo se guarda en la nube al instante; puedes seguir desde otro celular o computador.'],
    ['¿Puedo usarla sin internet?', 'Necesitas conexión para guardar y subir fotos. Si la señal es débil, espera a que termine de subir antes de cerrar.'],
  ];
  faq.forEach(([p, r], i) => B.push((i ? '' : sec(num(), 'Preguntas frecuentes')) + `<div class="faq"><b>${p}</b>${r}</div>`));

  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  HC.paginar(doc, B, { head: `<div class="ph"><img src="/img/logo_sm.png" alt=""><span>Manual de uso · ${esc(M.nombre)}</span></div>`, pie: `<span>Sala de Prensa Digital · ${esc(M.organizacion)}</span>` });
  HC.numerar(doc);
  HC.escalar(doc);
}

function avisar(t) { const a = document.getElementById('aviso'); a.style.display = t ? '' : 'none'; a.textContent = t || ''; }
document.getElementById('b-pdf').onclick = async () => {
  const b = document.getElementById('b-pdf'); b.disabled = true;
  try { await HC.descargarPDF(document.getElementById('doc'), NOMBRE); } catch (e) { avisar(e.message); }
  b.disabled = false;
};
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => HC.escalar(document.getElementById('doc')), 150); });
main().catch(e => { document.getElementById('doc').innerHTML = `<div class="loading">${esc(e.message)}</div>`; });
