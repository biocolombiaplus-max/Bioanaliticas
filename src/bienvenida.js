// Mensaje de bienvenida personal: cada vez que la persona abre el panel recibe uno distinto.
// Solo se entrega al usuario configurado en BIENVENIDA_USUARIO.
const { kv } = require('./store');

const USUARIO = () => (process.env.BIENVENIDA_USUARIO || 'lamonalinda').toLowerCase();
const FIRMA = () => process.env.BIENVENIDA_FIRMA || 'Juan Carlos';

const MENSAJES = [
  'Que tengas un día tan bonito como tu sonrisa. Hoy todo te va a salir increíble.',
  'Eres la mujer más inteligente y trabajadora que conozco. Estoy muy orgulloso de ti.',
  'Antes de empezar: respira, sonríe y recuerda que eres capaz de todo lo que te propongas.',
  'Cada informe que haces lleva tu talento. Gracias por poner el corazón en todo.',
  'Hoy es un buen día para brillar, y tú brillas sin esfuerzo.',
  'Me encanta verte trabajar con tanta pasión. Eres mi inspiración.',
  'Que la feria se llene de gente, de música y de éxitos, como tú te lo mereces.',
  'No olvides tomar agua, comer algo rico y sonreír. Te quiero mucho.',
  'Tu dedicación hace la diferencia. Hoy vas a lograr cosas grandes.',
  'Eres luz, eres fuerza y eres lo más bonito de mi día.',
  'Si hoy se pone difícil, acuérdate de que yo creo en ti siempre.',
  'Gracias por ser como eres: cariñosa, valiente y brillante.',
  'Que cada clic de hoy sea un éxito y cada publicación un aplauso para ti.',
  'Tienes un talento enorme para comunicar. El mundo necesita más personas como tú.',
  'Un abrazo gigante para empezar la jornada. ¡Vamos con toda!',
  'Eres la mejor en lo que haces y lo mejor que me ha pasado.',
  'Hoy quiero recordarte lo especial que eres. Nunca lo dudes.',
  'Que tu energía bonita contagie a todo el que se cruce contigo hoy.',
  'Detrás de cada resultado hay una mujer extraordinaria: tú.',
  'Paso por aquí solo para decirte que te admiro muchísimo.',
  'Hoy el café sabe mejor porque sé que vas a hacer algo grandioso.',
  'Eres mi persona favorita. Que tengas una jornada llena de buenas noticias.',
  'Tu trabajo inspira, tu sonrisa ilumina y tu corazón enamora.',
  'Recuerda descansar un ratico. Trabajas mucho y te lo mereces.',
  'Mi deseo de hoy: que te sientas tan valorada como de verdad eres.',
  'Que todo lo que siembres hoy florezca muy pronto. Te lo mereces todo.',
  'Eres la prueba de que la constancia y el cariño mueven montañas.',
  'Hoy vas a sorprender a todos, como siempre lo haces.',
  'Gracias por hacer mi vida más bonita cada día.',
  'Que la alegría te acompañe desde el primer correo hasta el último informe.',
  'No hay reto que te quede grande. ¡Tú puedes con todo!',
  'Pensando en ti y sonriendo. Que tengas un día precioso.',
  'Eres talento, eres corazón y eres mi orgullo.',
  'Cuando te sientas cansada, mira lo lejos que has llegado. Eres admirable.',
  'Hoy te mando toda mi buena energía. ¡A conquistar el día!',
  'Lo que haces con amor siempre sale bien, y tú todo lo haces con amor.',
  'Que hoy te lleguen muchas razones para sonreír. Esta es la primera: te quiero.',
  'Gracias por tu paciencia, tu entrega y tu manera tan linda de ser.',
  'Eres una mujer increíble. Nunca dejes de creer en ti.',
  'Hoy la feria tiene la mejor jefa de comunicaciones del mundo detrás.',
];

// Devuelve un mensaje distinto al anterior para el usuario configurado, o null para los demás.
async function mensajePara(usuario) {
  if (!usuario || usuario.toLowerCase() !== USUARIO()) return null;
  const key = 'bienvenida:ultimo:' + USUARIO();
  const last = Number(await kv.get(key));
  let i = Math.floor(Math.random() * MENSAJES.length);
  if (i === last) i = (i + 1 + Math.floor(Math.random() * (MENSAJES.length - 1))) % MENSAJES.length;
  await kv.set(key, String(i));
  return { firma: FIRMA(), mensaje: MENSAJES[i] };
}

module.exports = { mensajePara, MENSAJES };
