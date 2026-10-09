# Sala de Prensa Digital · Villa del Rosario

Herramienta de gestión para la oficina de prensa. Empieza con las **Ferias y Fiestas de la Uva 2026** y sirve para cualquier campaña posterior.

| Módulo | Qué hace |
|---|---|
| **Inicio** | Lo que necesita atención hoy: piezas por revisar, agenda de la semana y accesos rápidos. |
| **Piezas para revisar** | Diseño sube cada imagen, video o PDF con el texto que lo acompaña. La jefatura revisa: comenta, marca la lista de verificación (ortografía, datos, logos, legibilidad) y aprueba o pide cambios. Las nuevas versiones quedan en la misma pieza. Con IA activada, revisa la ortografía y los datos de la imagen o de los fotogramas del video. |
| **Agenda de gestión** | Agenda de la jefatura, pensada para el celular: actividades programadas y realizadas (ruedas de prensa, entrevistas, cubrimientos, reuniones…), con resultados, asistentes, medios, enlaces y fotos de soporte. Entre dos fechas genera un **informe de gestión** en PDF con cifras, gráficas, logros, bitácora con fotos y recomendaciones. Los textos se pueden editar, y con IA activada también redactar automáticamente. |
| **Calendario editorial** | Lo que se publica, cuándo y por qué canal. Las piezas aprobadas que tienen fecha aparecen solas. |
| **Correos** | Siete tipos (invitación, comunicado, boletín, aviso importante, convocatoria, agradecimiento y para medios), cada uno con plantilla. Se elige desde qué cuenta se envía y a quién: a la base de datos o a correos escritos a mano. Admite dos botones de llamado a la acción y trae una revisión antispam en vivo. Envía un correo cada 10 segundos y mide aperturas, clics y bajas. |
| **Bases de datos** | Sube cualquier Excel o CSV: primero ves el diagnóstico (correos válidos, repetidos, autorización, municipios, proveedores y organizaciones) y luego decides si la importas. |
| **Estudio de contenidos (IA)** | Imagen y tema → textos para cada red, nota de prensa, SEO local y correo. |
| **Analizar publicación** | Pega el enlace de cualquier publicación de Instagram: puntaje de impacto, indicadores, lectura del analista e informe PDF. |
| **Tablero, cuenta e informes** | Seguidores reales, crecimiento y los informes ejecutivos en PDF. |
| **Ajustes y usuarios** | Usuarios con roles: **Administrador**, **Diseño** (solo sube y corrige piezas y ve el calendario) y **Consulta** (solo lectura). Desde aquí también se agregan varios correos de envío, con sus datos SMTP y su límite diario. |
| **Mensaje de bienvenida** | Cada vez que Ligia (`BIENVENIDA_USUARIO`) abre el panel, aparece un mensaje distinto de Juan Carlos. |

---|---|
| **Analizar publicación** | Pegas el enlace de cualquier publicación o reel de Instagram y obtienes el análisis al instante. Si es de la cuenta conectada, trae todas las estadísticas: alcance, vistas, guardados, compartidos, seguidores nuevos y comentarios. Si es de otra cuenta profesional, trae sus datos públicos (me gusta y comentarios) y los compara con el promedio de esa cuenta. Incluye un puntaje de impacto, la lectura del analista y una lectura ejecutiva con IA. |
| **Informes PDF** | Hay cuatro tipos: publicación, cuenta, campaña de correo e informe integral. Se descargan con un clic. |
| **Estudio de contenidos (IA)** | Subes una imagen y escribes el tema. Recibes textos para Instagram, Facebook, X y WhatsApp, una nota de prensa, el SEO local (título, meta descripción, slug, palabras clave y texto alternativo) y el correo listo. Con el botón **Crear correo con esto** se arma la campaña. |
| **Campañas de correo** | Saludo con el nombre de cada persona, un correo cada 10 segundos, baja en un clic y medición de aperturas, clics y bajas. |
| **Base de datos** | Importación de CSV con validación de la autorización, sin duplicados, con distribución por municipio y respetando las bajas. |
| **Mensaje de bienvenida** | Cada vez que Ligia (`BIENVENIDA_USUARIO`) abre el panel, aparece un mensaje distinto de Juan Carlos. Los demás usuarios no lo ven. Los mensajes están en `src/bienvenida.js`. |
| **Cuenta de Instagram** | Seguidores reales, crecimiento neto, reels frente a publicaciones y ranking por puntaje de impacto. |

---

## Publicar en Vercel (paso a paso)

1. Crea una cuenta en [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. Ve a **Add New → Project** e importa el repositorio `Bioanaliticas`. Deja la configuración tal como la propone (el archivo `vercel.json` ya trae todo) y pulsa **Deploy**.
3. En el proyecto, entra a **Storage** y conecta:
   - **Redis** o **Upstash for Redis** (plan gratuito; en Upstash elige High Availability = None para ver el plan Free): es la base de datos. El panel reconoce `KV_REDIS_URL` (Redis Cloud) y `KV_REST_API_URL` (Upstash). Crea solas las variables de conexión.
4. Para imágenes y videos crea una cuenta gratis en [cloudinary.com](https://cloudinary.com). En **Settings → API Keys** copia el **API environment variable** (empieza por `cloudinary://`) y guárdalo en Vercel como `CLOUDINARY_URL`. Así no se consume el espacio de Vercel.
5. En **Settings → Environment Variables**, agrega como mínimo:
   - `ADMIN_USERS`, por ejemplo `ligia:UnaClaveSegura`
   - `SESSION_SECRET`: cualquier texto largo y aleatorio
   - `BASE_URL`: la dirección del proyecto, por ejemplo `https://sala-prensa.vercel.app`
   - `ANTHROPIC_API_KEY`: se crea en [console.anthropic.com](https://console.anthropic.com)
   - Los datos de SMTP e Instagram (ver más abajo)
6. Vuelve a desplegar el proyecto (**Deployments → Redeploy**) para que tome las variables.
7. Abre la dirección, ingresa con tu usuario y revisa **Ajustes**: ahí se ve qué está conectado y qué falta.

El listado completo de variables está en `.env.example`.

### Envío de correos en Vercel

Vercel no deja programas corriendo de forma permanente, así que la cola de envío avanza por tandas:

- **Con el panel abierto**, el propio panel mantiene el envío en marcha, a un correo cada 10 segundos.
- **Para que siga con el panel cerrado**, define `CRON_SECRET` y crea en [cron-job.org](https://cron-job.org) (gratis) una tarea que llame cada minuto a:
  `https://TU-DOMINIO/api/cron/cola?clave=TU_CRON_SECRET`

Una vez al día, Vercel actualiza solo los datos de Instagram (`/api/cron/diario`).

### Correo: llegar a la bandeja principal

1. Usa un proveedor profesional, por ejemplo **Brevo** (`smtp-relay.brevo.com:587`), Amazon SES o Mailgun.
2. Envía desde un **dominio propio** con **SPF, DKIM y DMARC** configurados.
3. Si el dominio es nuevo, usa `DAILY_LIMIT` para subir el volumen poco a poco.
4. Cada correo lleva versión de texto, remitente identificado, enlace de baja visible y baja en un clic (`List-Unsubscribe`).
5. Envía siempre una prueba antes de lanzar.

Solo se escribe a personas que autorizaron recibir comunicaciones (Ley 1581 de 2012).

### Conectar Instagram (API oficial)

1. La cuenta debe ser **Profesional** (Empresa o Creador) y estar vinculada a una página de Facebook.
2. Crea una app en [developers.facebook.com](https://developers.facebook.com/apps) con el producto Instagram.
3. Genera un token de larga duración con los permisos `instagram_basic`, `instagram_manage_insights`, `pages_show_list` y `pages_read_engagement`.
4. Guarda el token en `IG_ACCESS_TOKEN` y el ID de la cuenta de Instagram en `IG_USER_ID`.

Para analizar publicaciones de **otras cuentas** se usa la función oficial *Business Discovery*: la otra cuenta debe ser profesional y pública. Si el sistema no reconoce al autor, escribe su @usuario en el campo opcional. Instagram solo entrega alcance, guardados y comentarios a la cuenta dueña de la publicación.

Sin token, la herramienta funciona en **modo demostración**, con datos de ejemplo claramente marcados.

---

## Desarrollo local

```bash
npm install
cp .env.example .env
npm start        # http://localhost:3000
```

Sin Redis, los datos se guardan en `data/`. Sin SMTP, los correos se generan pero no salen.

## Estructura

```
api/index.js           Entrada en Vercel
local.js               Servidor local
src/servidor.js        Rutas y API
src/store.js           Base de datos (Upstash Redis o archivo local)
src/mailer.js          Cola de envío, ritmo, seguimiento y estadísticas
src/emailTemplate.js   Plantilla del correo
src/instagram.js       API de Instagram, Business Discovery y modo demostración
src/analysis.js        Indicadores, puntaje, hallazgos y recomendaciones
src/ia.js              Estudio de contenidos y lectura ejecutiva con Claude
src/uploads.js         Imágenes y videos (Cloudinary; alternativa Vercel Blob)
src/usuarios.js        Usuarios y roles
src/remitentes.js      Cuentas de correo para enviar (clave cifrada)
src/oficina.js         Piezas para revisión y calendario editorial
src/antispam.js        Revisión de entregabilidad del correo
public/vendor/         Cliente de Vercel Blob empaquetado (esbuild) para subir videos grandes
public/                Página de inicio, panel e informe imprimible
```
