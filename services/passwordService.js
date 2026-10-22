// Solo para altas y cambios; el login conserva las contraseñas históricas.
const passwordValida = valor => typeof valor === 'string' && [...valor].length >= 12
  && Buffer.byteLength(valor, 'utf8') <= 72 && new Set(valor).size >= 4;
const mensajePassword = 'Usa al menos 12 caracteres y un máximo de 72 bytes (al menos 4 caracteres diferentes).';
module.exports = { passwordValida, mensajePassword };
