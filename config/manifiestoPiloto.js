const fs = require('node:fs');
const path = require('node:path');
// Ruta fija: no aceptar archivos arbitrarios, archivos de entorno o credenciales como manifiesto.
const cargarManifiesto = () => {
  const archivo = path.join(__dirname, process.env.PILOT_PREPARATION_PROFILE === 'gmail'
    ? '../infra/gmail-preparacion.local.json' : '../infra/piloto.aprobado.json');
  const stat = fs.lstatSync(archivo);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw Error('MANIFIESTO_INVALIDO');
  return require('../services/infraestructuraPilotoService').validarManifiesto(JSON.parse(fs.readFileSync(archivo, 'utf8')));
};
module.exports = { cargarManifiesto };
