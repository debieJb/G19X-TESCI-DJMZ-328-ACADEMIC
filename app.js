const express = require('express');
const path = require('path');

const indexRoutes = require('./routes/indexRoutes');
const campanaRoutes = require('./routes/campanaRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRoutes);
app.use('/campanas', campanaRoutes);

app.use((req, res) => {
  res.status(404).render('error', { titulo: 'Página no encontrada', mensaje: 'La página solicitada no existe.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = [400, 404, 413, 503].includes(error.status) ? error.status : 500;
  if (status >= 500) console.error('Error al procesar la solicitud.');
  const mensajes = {
    400: 'La solicitud no tiene un formato válido.',
    404: 'La campaña no existe o fue eliminada.',
    413: 'La solicitud supera el tamaño permitido.',
    503: 'La base de datos no está disponible. Intenta de nuevo más tarde.',
    500: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.'
  };
  res.status(status).render('error', { titulo: `Error ${status}`, mensaje: mensajes[status] });
});

module.exports = app;
