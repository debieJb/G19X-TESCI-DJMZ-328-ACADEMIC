const session = require('express-session');
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const COLECCION = 'sesionesMvp';
const MAX_TTL_MS = 8 * 60 * 60 * 1000;
// Colección e índice se provisionan separadamente; jamás DDL desde una petición.
class MongoSessionStore extends session.Store {
  constructor({ coleccion, clave, ambito, reloj = () => new Date() }) {
    super();
    if (!coleccion || !Buffer.isBuffer(clave) || clave.length !== 32 || typeof ambito !== 'string' || !ambito) throw Error('ALMACEN_SESION_INVALIDO');
    this.coleccion = coleccion; this.clave = Buffer.from(clave); this.ambito = ambito; this.reloj = reloj;
  }
  async comprobar() {
    const indices = await this.coleccion.listIndexes().toArray();
    if (!indices.some(i => i.key.expiraEn === 1 && Object.keys(i.key).length === 1 && i.expireAfterSeconds === 0 && !i.partialFilterExpression && !i.sparse)) throw Error('INDICE_SESION_REQUERIDO');
  }
  identificador(sid) {
    if (typeof sid !== 'string' || !sid || sid.length > 256) throw Error('SESION_INVALIDA');
    return createHash('sha256').update(`${this.ambito}:${sid}`).digest('hex');
  }
  vencimiento(datos) {
    const ahora = +this.reloj();
    const recibido = datos?.cookie?.expires ? +new Date(datos.cookie.expires) : ahora + MAX_TTL_MS;
    if (!Number.isFinite(recibido)) throw Error('SESION_INVALIDA');
    return new Date(Math.min(recibido, ahora + MAX_TTL_MS));
  }
  cifrar(datos, identificador) {
    const texto = JSON.stringify(datos);
    if (Buffer.byteLength(texto) > 65536) throw Error('SESION_EXCESIVA');
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.clave, iv);
    cipher.setAAD(Buffer.from(`${this.ambito}:${identificador}`));
    const payload = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), payload: payload.toString('base64') };
  }
  descifrar(datos, identificador) {
    const decipher = createDecipheriv('aes-256-gcm', this.clave, Buffer.from(datos.iv, 'base64'));
    decipher.setAAD(Buffer.from(`${this.ambito}:${identificador}`)); decipher.setAuthTag(Buffer.from(datos.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(datos.payload, 'base64')), decipher.final()]).toString('utf8'));
  }
  terminar(promesa, callback) {
    promesa.then(valor => callback(null, valor)).catch(() => callback(new Error('ALMACEN_SESION_NO_DISPONIBLE')));
  }
  get(sid, callback) {
    this.terminar((async () => {
      const _id = this.identificador(sid);
      const doc = await this.coleccion.findOne({ _id, revocada: false, expiraEn: { $gt: this.reloj() } });
      return doc ? this.descifrar(doc.datos, _id) : null;
    })(), callback);
  }
  set(sid, datos, callback = () => {}) {
    this.terminar((async () => {
      const _id = this.identificador(sid), ahora = this.reloj(), expiraEn = this.vencimiento(datos);
      if (+expiraEn <= +ahora) throw Error('SESION_CADUCADA');
      // Una sesión revocada/caducada no puede resucitar por una escritura atrasada.
      // El índice _id provoca conflicto en lugar de reemplazar su tombstone.
      await this.coleccion.updateOne({ _id, revocada: false, expiraEn: { $gt: ahora } },
        { $set: { datos: this.cifrar(datos, _id), expiraEn, revocada: false } }, { upsert: true, writeConcern: { w: 'majority' } });
    })(), callback);
  }
  touch(sid, datos, callback = () => {}) {
    this.terminar((async () => {
      await this.coleccion.updateOne({ _id: this.identificador(sid), revocada: false, expiraEn: { $gt: this.reloj() } },
        { $set: { expiraEn: this.vencimiento(datos) } }, { writeConcern: { w: 'majority' } });
    })(), callback);
  }
  destroy(sid, callback = () => {}) {
    this.terminar((async () => {
      await this.coleccion.updateOne({ _id: this.identificador(sid) }, { $set: { revocada: true,
        expiraEn: new Date(+this.reloj() + MAX_TTL_MS + 60000) }, $unset: { datos: 1 } }, { upsert: true, writeConcern: { w: 'majority' } });
    })(), callback);
  }
}
module.exports = { MongoSessionStore, COLECCION, MAX_TTL_MS };
