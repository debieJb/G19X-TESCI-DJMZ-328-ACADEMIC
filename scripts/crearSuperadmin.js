const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const conectarDatabase = require('../config/database');

const crearSuperadmin = async (env = process.env) => {
  try {
    for (const campo of ['SUPERADMIN_NOMBRE', 'SUPERADMIN_EMAIL', 'SUPERADMIN_PASSWORD']) {
      if (typeof env[campo] !== 'string' || !env[campo].trim()) throw new Error(`Falta configurar ${campo}.`);
    }
    const email = env.SUPERADMIN_EMAIL.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('SUPERADMIN_EMAIL no es válido.');
    if (Buffer.byteLength(env.SUPERADMIN_PASSWORD, 'utf8') > 72) throw new Error('SUPERADMIN_PASSWORD supera 72 bytes.');
    await conectarDatabase();
    await Usuario.init(); // Esperar el índice único también evita duplicados concurrentes.
    if (await Usuario.exists({ email })) return { creado: false };
    try {
      await Usuario.create({ nombre: env.SUPERADMIN_NOMBRE.trim(), email, password: env.SUPERADMIN_PASSWORD, rol: 'superadmin' });
      return { creado: true };
    } catch (error) {
      if (error.code === 11000) return { creado: false };
      throw error;
    }
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  crearSuperadmin().then(({ creado }) => {
    console.log(creado ? 'Superadmin creado.' : 'El email ya existe. No se modificó el usuario.');
  }).catch(() => {
    console.error('No se pudo crear el superadmin. Revisa las variables SUPERADMIN_NOMBRE, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD y la conexión MONGODB_URI.');
    process.exitCode = 1;
  });
}

module.exports = { crearSuperadmin };
