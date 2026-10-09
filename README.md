# Bioanalíticas · Panel de campañas e Instagram

Panel de control para la **Feria de la Uva · Villa del Rosario 2026**:

- **Campañas de correo** personalizadas con el nombre de cada persona, enviadas **una cada 10 segundos** y con botón directo a la programación.
- **Seguimiento**: correos enviados, aperturas, **clics en el botón**, rebotes y bajas, en tiempo real.
- **Base de datos**: importación de CSV con limpieza automática (duplicados, correos inválidos, sin autorización) y respeto permanente de las bajas.
- **Instagram**: Ligia pega el enlace de cualquier publicación y obtiene alcance, vistas, me gusta, comentarios, compartidos, guardados, seguidores nuevos y el tono de los comentarios.
- **Cuenta completa**: seguidores reales, crecimiento neto (nuevos menos los que dejaron de seguir), reels frente a publicaciones y ranking por puntaje de impacto.
- **Informes ejecutivos en PDF**: por publicación, por cuenta, por campaña o un informe integral, con lectura del analista y recomendaciones.

## Puesta en marcha

```bash
npm install
cp .env.example .env     # completa los datos
npm start                # http://localhost:3000
```

Ingresa con `ADMIN_USER` / `ADMIN_PASSWORD` (por defecto el usuario es `ligia`; **cambia la clave**).

Sin SMTP configurado, el sistema funciona en **modo prueba**: genera los correos y los guarda en `data/outbox/*.eml`.
Sin Instagram conectado, muestra **datos de demostración** claramente marcados.

## Publicarlo en internet

Para que el logo, las aperturas y los clics funcionen en los correos reales, el panel debe estar en una dirección pública
(Render, Railway, un VPS, etc.) y `BASE_URL` debe ser esa dirección (por ejemplo `https://panel.tudominio.com`).
La carpeta `data/` guarda la información: usa un disco persistente.

## Correo: llegar a la bandeja principal

1. Usa un proveedor profesional (recomendado: **Brevo**, `smtp-relay.brevo.com:587`; también Amazon SES, Mailgun o SendGrid).
   Gmail personal solo permite unos 500 correos al día y no es apto para campañas.
2. Envía desde un **dominio propio** y configura **SPF, DKIM y DMARC** con las instrucciones de tu proveedor.
3. Si el dominio es nuevo, usa `DAILY_LIMIT` (por ejemplo 200 el primer día y luego más) para calentar la reputación.
4. Cada correo incluye versión de texto, remitente identificado, enlace de baja visible y baja en un clic
   (`List-Unsubscribe`), como exigen Gmail y Yahoo desde 2024.
5. Envía siempre una **prueba** a Gmail y Outlook antes de lanzar.

Todas las personas de la base deben haber autorizado recibir comunicaciones (Ley 1581 de 2012). Si el CSV tiene una columna
`autorizacion`, las filas con "No" se descartan automáticamente.

## Conectar Instagram (API oficial)

1. La cuenta debe ser **Profesional** (Empresa o Creador) y estar vinculada a una página de Facebook.
2. En [developers.facebook.com](https://developers.facebook.com/apps) crea una app y agrega el producto Instagram.
3. Genera un token de larga duración con `instagram_basic`, `instagram_manage_insights`, `pages_show_list` y `pages_read_engagement`.
4. Coloca el token en `IG_ACCESS_TOKEN` y el ID de la cuenta de Instagram en `IG_USER_ID`. Reinicia.

Si usas el inicio de sesión con Instagram (sin página de Facebook), define `IG_API_HOST=graph.instagram.com`.

El panel registra los seguidores cada hora y actualiza las publicaciones monitoreadas cada 3 horas, así se ve la evolución real.
La API solo entrega estadísticas de publicaciones de la cuenta conectada.

## Estructura

```
server.js              Servidor y API
src/mailer.js          Cola de envío, ritmo, límites y estadísticas
src/emailTemplate.js   Plantilla del correo (HTML + texto)
src/instagram.js       API de Instagram y modo demostración
src/analysis.js        Indicadores, hallazgos y recomendaciones
src/csv.js             Lectura de bases de datos
public/                Panel, inicio de sesión e informe imprimible
```
