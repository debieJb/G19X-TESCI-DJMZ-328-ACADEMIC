const { inflateSync } = require('node:zlib');
const ErrorIA = require('./ia/ErrorIA');
const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const validar = valor => {
  if (valor === undefined || valor === '') return undefined;
  try {
    if (typeof valor !== 'string' || valor.length > 65558 || !valor.startsWith('data:image/png;base64,')) throw new Error();
    const base64 = valor.slice(22), datos = Buffer.from(base64, 'base64');
    if (datos.length > 49152 || datos.toString('base64') !== base64 || !datos.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error();
    let posicion = 8, ancho, alto, canales, final = false; const partes = [];
    while (posicion < datos.length) {
      if (posicion + 12 > datos.length) throw new Error();
      const longitud = datos.readUInt32BE(posicion), fin = posicion + 12 + longitud;
      if (fin > datos.length) throw new Error();
      const tipo = datos.toString('ascii', posicion + 4, posicion + 8), contenido = datos.subarray(posicion + 8, fin - 4);
      if (!['IHDR', 'IDAT', 'IEND', 'sRGB', 'pHYs', 'gAMA', 'cHRM'].includes(tipo)) throw new Error();
      if (crc32(datos.subarray(posicion + 4, fin - 4)) !== datos.readUInt32BE(fin - 4)) throw new Error();
      if (posicion === 8) {
        if (tipo !== 'IHDR' || longitud !== 13) throw new Error();
        ancho = contenido.readUInt32BE(0); alto = contenido.readUInt32BE(4);
        canales = { 0: 1, 2: 3, 4: 2, 6: 4 }[contenido[9]];
        if (!ancho || !alto || ancho > 1024 || alto > 1024 || contenido[8] !== 8 || !canales || contenido[10] || contenido[11] || contenido[12]) throw new Error();
      } else if (tipo === 'IHDR') throw new Error();
      if (tipo === 'IDAT') partes.push(contenido);
      if (tipo === 'IEND') { if (longitud || fin !== datos.length) throw new Error(); final = true; }
      posicion = fin;
    }
    if (!final || !partes.length) throw new Error();
    const pixels = inflateSync(Buffer.concat(partes), { maxOutputLength: 4195328 });
    const fila = ancho * canales + 1;
    if (pixels.length !== fila * alto) throw new Error();
    for (let y = 0; y < alto; y++) if (pixels[y * fila] > 4) throw new Error();
    return { mime: 'image/png', datos, ancho, alto };
  } catch { throw new ErrorIA('ENTRADA'); }
};
module.exports = { validar, crc32 };
