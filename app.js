// Compatibilidad de desarrollo; el arranque de piloto usa la f?brica sin inicializaci?n inmediata.
const { crearApp } = require('./appFactory');
module.exports = crearApp();
module.exports.crearApp = crearApp;
