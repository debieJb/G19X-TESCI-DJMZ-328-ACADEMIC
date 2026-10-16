const { randomBytes } = require('node:crypto');

// Solo datos efímeros de prueba; cumple complejidad y queda bajo 72 bytes bcrypt.
const passwordSintetica = () => ['Aa', randomBytes(24).toString('hex'), '1!'].join('');

module.exports = { passwordSintetica };
