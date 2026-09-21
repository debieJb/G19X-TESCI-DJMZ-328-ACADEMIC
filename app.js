require('dotenv').config();

const express = require('express');
const path = require('path');
const conectarDatabase = require('./config/database');

const indexRoutes = require('./routes/indexRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRoutes);

const iniciarServidor = async () => {
  try {
    await conectarDatabase();
    app.listen(PORT, () => {
      console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    });
  } catch {
    console.error('No se pudo conectar a MongoDB. Revisa MONGODB_URI y la disponibilidad de la base de datos.');
    process.exit(1);
  }
};

iniciarServidor();
