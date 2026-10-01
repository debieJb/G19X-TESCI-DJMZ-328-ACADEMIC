// Auditoría y creación aditiva: nunca usa syncIndexes, dropIndex ni elimina datos.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Contacto = require('../models/Contacto');

const main = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI no está configurada.');
    const destino = new URL(uri);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname)) {
      throw new Error('La auditoría solo permite MongoDB local.');
    }
    if (destino.pathname !== '/marketing_automation') {
      throw new Error('La auditoría requiere la base marketing_automation.');
    }
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
    const coleccion = Contacto.collection.name;
    const existentes = await mongoose.connection.db.listCollections({ name: coleccion }).toArray();
    const antes = existentes.length ? await Contacto.collection.listIndexes().toArray() : [];
    console.log(JSON.stringify({ base: mongoose.connection.name, coleccion, declarados: Contacto.schema.indexes(), antes }, null, 2));
    // createIndexes solo añade los índices declarados. Ante conflictos o duplicados,
    // MongoDB rechaza la operación; no se reemplazan índices ni se corrigen datos.
    await Contacto.createIndexes();
    const despues = await Contacto.collection.listIndexes().toArray();
    console.log(JSON.stringify({ despues, creados: despues.filter(indice => !antes.some(anterior => anterior.name === indice.name)) }, null, 2));
    const datos = { total: await Contacto.collection.countDocuments() };
    for (const campo of ['email', 'telefono']) {
      datos[campo] = {
        incluidos: await Contacto.collection.countDocuments({ [campo]: { $type: 'string' } }),
        ausentes: await Contacto.collection.countDocuments({ [campo]: { $exists: false } }),
        nulos: await Contacto.collection.countDocuments({ [campo]: { $type: 'null' } }),
        cadenasVacias: await Contacto.collection.countDocuments({ [campo]: '' })
      };
      const indice = despues.find(valor => valor.key.empresa === 1 && valor.key[campo] === 1 && Object.keys(valor.key).length === 2);
      if (!indice?.unique || indice.sparse || JSON.stringify(indice.partialFilterExpression) !== JSON.stringify({ [campo]: { $type: 'string' } })) {
        throw new Error(`El índice de ${campo} no coincide con el esquema esperado.`);
      }
    }
    console.log(JSON.stringify({ verificacion: 'correcta', datos }, null, 2));
  } catch (error) {
    // No imprimir URI, credenciales ni valores de contactos en errores de MongoDB.
    console.error(JSON.stringify({ error: error.name, codigo: error.code ?? null,
      mensaje: error.name === 'Error' ? error.message : 'Falló la auditoría de índices. No se eliminaron datos ni índices.' }));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};
main();
