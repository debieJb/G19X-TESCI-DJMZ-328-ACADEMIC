const { randomBytes, timingSafeEqual } = require('node:crypto');
const ErrorGmail = require('../services/ErrorGmail');
const csrfGmail = (req, res, next) => {
  if (!req.session.gmailCsrf) req.session.gmailCsrf = randomBytes(32).toString('base64url');
  res.locals.gmailCsrf = req.session.gmailCsrf;
  if (req.method === 'POST') {
    const recibido = req.body?._csrf;
    const esperado = req.session.gmailCsrf;
    if (typeof recibido !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(recibido) || recibido.length !== esperado.length
      || !timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))) {
      const error = new ErrorGmail('CSRF');
      return res.status(error.status).render('error', { titulo: 'Formulario inválido', mensaje: error.message });
    }
  }
  next();
};
module.exports = csrfGmail;
