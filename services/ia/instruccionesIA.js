const ErrorIA = require('./ErrorIA');
// Defensa de minimización, no un detector exhaustivo de información sensible.
const seguro = (valor, maximo, obligatorio = false) => {
  if (valor === undefined && !obligatorio) return '';
  if (typeof valor !== 'string' || valor.length > maximo || (obligatorio && !valor.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(valor)) throw new ErrorIA('ENTRADA');
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:\+?\d[\d ()-]{8,}\d)|AIza[A-Za-z0-9_-]{20,}|GOCSPX-|-----BEGIN|\b(?:api[_ -]?key|password|contrase[ñn]a|refresh[_ -]?token)\s*[:=]/i.test(valor)) throw new ErrorIA('PRIVACIDAD');
  return valor.replace(/\r\n/g, '\n');
};
const validar = (entrada, opciones) => {
  if (entrada.confirmacionPrivacidad !== 'CONFIRMO') throw new ErrorIA('PRIVACIDAD');
  const datos = { instrucciones: seguro(entrada.instrucciones, 4000, true),
    indicacionesAdicionales: seguro(entrada.indicacionesAdicionales, 1500),
    textoProtegido: seguro(entrada.textoProtegido, 1500), confirmacionPrivacidad: 'CONFIRMO',
    producto: entrada.producto ? seguro(entrada.producto, 100) : '' };
  for (const [campo, valores] of Object.entries(opciones)) {
    const valor = entrada[campo];
    if (valor !== undefined && valor !== '' && (typeof valor !== 'string' || !Object.hasOwn(valores, valor))) throw new ErrorIA('ENTRADA');
    datos[campo] = valor || (campo === 'canal' ? 'email' : '');
  }
  return datos;
};
const conservar = (salida, protegido) => {
  if (protegido && !salida.mensaje.includes(protegido)) throw new ErrorIA('TEXTO_PROTEGIDO');
  return salida;
};
const contexto = (datos, opciones) => ({ modo: 'crear', instrucciones: datos.instrucciones,
  indicacionesAdicionales: datos.indicacionesAdicionales, textoProtegido: datos.textoProtegido,
  complementos: Object.fromEntries(Object.entries(opciones).filter(([k]) => datos[k]).map(([k, v]) => [k, v[datos[k]]])) });
const validarContexto = (datos, opciones) => {
  if (!datos || !['crear', 'revision', 'variante'].includes(datos.modo)
    || Object.keys(datos).some(k => !['modo', 'instrucciones', 'indicacionesAdicionales', 'textoProtegido', 'complementos', 'propuestaActual', 'cambios'].includes(k))) throw new ErrorIA('ENTRADA');
  seguro(datos.instrucciones, 4000, true); seguro(datos.indicacionesAdicionales, 1500); seguro(datos.textoProtegido, 1500);
  if (!datos.complementos || typeof datos.complementos !== 'object' || Array.isArray(datos.complementos)
    || !Object.entries(datos.complementos).every(([k, v]) => opciones[k] && Object.values(opciones[k]).includes(v))) throw new ErrorIA('ENTRADA');
  if (datos.modo !== 'crear') {
    seguro(datos.cambios, 1500, datos.modo === 'revision');
    const actual = datos.propuestaActual;
    if (!actual || Object.keys(actual).length !== 4 || !Array.isArray(actual.segmentacion) || actual.segmentacion.length > 5) throw new ErrorIA('ENTRADA');
    for (const [k, max] of [['asunto', 220], ['mensaje', 5000], ['llamadaAccion', 300]]) seguro(actual[k], max, true);
    for (const s of actual.segmentacion) seguro(s, 300, true);
  } else if (datos.propuestaActual !== undefined || datos.cambios !== undefined) throw new ErrorIA('ENTRADA');
  return datos;
};
module.exports = { seguro, validar, conservar, contexto, validarContexto };
