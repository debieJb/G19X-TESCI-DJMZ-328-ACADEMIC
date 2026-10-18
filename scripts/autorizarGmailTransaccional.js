// Herramienta administrativa local. No conecta MongoDB y no envía mensajes.
const http = require('node:http');
const fs = require('node:fs');
const gmail = require('../services/gmailTransaccionalService');
const principal = async (args = process.argv.slice(2)) => {
  if (args.length !== 1 || args[0] !== '--autorizar') throw Error('CONFIRMACION_REQUERIDA');
  const config = gmail.configuracionOAuth();
  if (fs.existsSync(config.archivo)) throw Error('CREDENCIAL_EXISTENTE_NO_SE_SOBRESCRIBE');
  const oauth = gmail.iniciarOAuth(config);
  await new Promise((resolve, reject) => {
    let procesando = false;
    const server = http.createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      const url = new URL(req.url, 'http://127.0.0.1:3001');
      if (req.method !== 'GET' || req.headers.host !== '127.0.0.1:3001' || url.origin !== 'http://127.0.0.1:3001'
        || url.pathname !== '/oauth/callback' || procesando) { res.writeHead(404).end(); return; }
      procesando = true;
      try {
        const cifrada = await oauth.completar(url.searchParams);
        fs.writeFileSync(config.archivo, cifrada, { flag: 'wx', mode: 0o600 });
        res.end('Cuenta autorizada. Puedes cerrar esta ventana. No se ha enviado correo.');
        clearTimeout(timer); server.close(() => resolve());
      } catch (e) {
        res.writeHead(400).end('No se pudo autorizar la cuenta. Cierra esta ventana.');
        clearTimeout(timer); server.close(() => reject(e));
      }
    });
    const timer = setTimeout(() => { server.closeAllConnections(); server.close(() => reject(Error('OAUTH_CADUCADO'))); }, 5 * 60000);
    server.once('error', () => { clearTimeout(timer); reject(Error('ESCUCHA_NO_DISPONIBLE')); });
    server.listen(3001, '127.0.0.1', () => {
      // URL de consentimiento, sin code, client_secret ni tokens. No abre navegador.
      console.log('Abre esta URL en un navegador local y selecciona la cuenta remitente autorizada:');
      console.log(oauth.url);
    });
  });
  console.log('Credencial transaccional cifrada guardada. Envio no activado.');
};
if (require.main === module) principal().catch(e => {
  console.error(`AUTORIZACION_TRANSACCIONAL_RECHAZADA codigo=${require('./comprobarGmailTransaccional').codigoSeguro(e)}`);
  process.exitCode = 1;
});
module.exports = { principal };
