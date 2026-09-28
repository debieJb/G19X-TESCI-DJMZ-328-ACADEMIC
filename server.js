require('dotenv').config();

const conectarDatabase = require('./config/database');
const PORT = process.env.PORT || 3000;

const iniciarServidor = async () => {
  try {
    const app = require('./app');
    await conectarDatabase();
    app.listen(PORT, () => {
      console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    });
  } catch {
    console.error('No se pudo iniciar. Revisa SESSION_SECRET, MONGODB_URI y MongoDB. MemoryStore solo está disponible en desarrollo.');
    process.exit(1);
  }
};

iniciarServidor();
