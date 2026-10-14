const crearCsrf = require('./csrf');
const ErrorGmail = require('../services/ErrorGmail');
module.exports = crearCsrf({ campo: 'gmailCsrf', rechazar: (req, res) => {
  const error = new ErrorGmail('CSRF');
  return res.status(error.status).render('error', { titulo: 'Formulario inválido', mensaje: error.message });
} });
