const mongoose = require('mongoose');

const conectarDatabase = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('La variable MONGODB_URI es obligatoria.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
};

module.exports = conectarDatabase;
