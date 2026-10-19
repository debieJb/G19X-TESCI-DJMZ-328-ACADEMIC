const express = require('express');
const path = require('path');

const indexRoutes = require('./routes/indexRoutes');
const campanaRoutes = require('./routes/campanaRoutes');

const crearSesion = require('./config/session');
const { cargarUsuario } = require('./middlewares/autenticacion');
const crearApp = (opcionesSesion) => {
const app = express();
app.locals.nombreCookieSesion = opcionesSesion?.nombreCookie || 'marketing.sid';
app.locals.cookieSesionSegura = (opcionesSesion?.entorno ?? process.env.NODE_ENV) === 'production';
crearSesion.configurarProxy(app, opcionesSesion);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(require('./middlewares/cacheDinamica'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(crearSesion(opcionesSesion));
app.use(cargarUsuario);
app.use((req, res, next) => {
  res.locals.avisoOperacion = '';
  if (req.method === 'GET' && res.locals.usuarioActual && req.session.avisoOperacion) {
    res.locals.avisoOperacion = req.session.avisoOperacion;
    delete req.session.avisoOperacion;
  }
  next();
});
app.use('/registro', require('./routes/registroPublicoRoutes'));
app.use(require('./middlewares/csrfSuperadmin'));
app.use(require('./middlewares/csrfCampanas'));
app.use(require('./middlewares/csrfContactos'));

app.use('/', indexRoutes);
app.use('/', require('./routes/authRoutes'));
app.use('/panel', require('./routes/panelRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/empresa/gmail', require('./routes/gmailRoutes'));
app.use('/empresa/ia', require('./routes/iaRoutes'));
app.use('/empresa', require('./routes/empresaRoutes'));
app.use('/campanas', campanaRoutes);
app.use('/contactos', require('./routes/contactoRoutes'));

app.use((req, res) => {
  res.status(404).render('error', { titulo: 'Página no encontrada', mensaje: 'La página solicitada no existe.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = [400, 403, 404, 413, 503].includes(error.status) ? error.status : 500;
  if (status >= 500) console.error('Error al procesar la solicitud.');
  const mensajes = {
    403: 'No tienes permiso para esta acción o no tienes una empresa válida.',
    400: 'La solicitud no tiene un formato válido.',
    404: 'El recurso no existe o no está disponible para tu empresa.',
    413: 'La solicitud supera el tamaño permitido.',
    503: 'La base de datos no está disponible. Intenta de nuevo más tarde.',
    500: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.'
  };
  res.status(status).render('error', { titulo: `Error ${status}`, mensaje: mensajes[status] });
});

return app;
};

module.exports = { crearApp };
