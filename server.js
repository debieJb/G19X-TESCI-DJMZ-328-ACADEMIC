require('dotenv').config();

const app = require('./app');
const conectarDatabase = require('./config/database');
const PORT = process.env.PORT || 3000;

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
