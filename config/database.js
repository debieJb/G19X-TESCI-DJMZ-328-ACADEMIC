const mongoose = require('mongoose');

const conectarDatabase = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('La variable MONGODB_URI es obligatoria.');
  }

  // El entorno existente se valida; el arranque dev no aprovisiona indices ni colecciones.
  await mongoose.connect(process.env.MONGODB_URI, process.env.NODE_ENV === 'development'
    ? { autoIndex: false, autoCreate: false } : {});
};

module.exports = conectarDatabase;
