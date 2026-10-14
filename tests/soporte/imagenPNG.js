const { deflateSync } = require('node:zlib');
const { crc32 } = require('../../services/imagenCampanaService');
const chunk = (tipo, contenido) => {
  const datos = Buffer.concat([Buffer.from(tipo), contenido]);
  const longitud = Buffer.alloc(4); longitud.writeUInt32BE(contenido.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(datos));
  return Buffer.concat([longitud, datos, crc]);
};
const png = () => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
};
module.exports = { png, chunk, uri: () => 'data:image/png;base64,' + png().toString('base64') };
