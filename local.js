// Servidor local para desarrollo: `npm start`. En Vercel se usa api/index.js.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const app = require('./src/servidor');
const { procesarCola, cfg } = require('./src/mailer');

const server = express();
server.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
server.use(app);

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => {
  console.log(`Sala de prensa lista en ${cfg().baseUrl} (puerto ${PORT})`);
  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_USERS) console.warn('⚠  Define ADMIN_PASSWORD antes de publicar el panel.');
});

// En local, el motor de envío corre siempre en segundo plano.
(async function loop() {
  for (;;) {
    try { await procesarCola({ budgetMs: 30000 }); } catch (e) { console.error('[cola]', e.message); }
    await new Promise(r => setTimeout(r, 2000));
  }
})();
