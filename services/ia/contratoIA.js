const ErrorIA = require('./ErrorIA');
const libre = require('./instruccionesIA');
const opciones = Object.freeze({
  categoria: { software: 'Software de gestión', consultoria: 'Consultoría profesional', formacion: 'Formación', comercio: 'Productos de comercio', servicio: 'Servicios generales' },
  objetivo: { presentar: 'Presentar un producto o servicio', interes: 'Despertar interés', demostracion: 'Invitar a una demostración', fidelizar: 'Fidelizar clientes' },
  audiencia: { profesionales: 'Profesionales', empresas: 'Pequeñas empresas', interesados: 'Personas interesadas en la categoría', clientes: 'Clientes existentes con autorización de contacto' },
  tono: { profesional: 'Profesional', cercano: 'Cercano', informativo: 'Informativo', entusiasta: 'Entusiasta' },
  canal: { email: 'Correo electrónico' }
});
const texto = (valor, maximo, codigo = 'ENTRADA') => {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > maximo || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(valor)) throw new ErrorIA(codigo);
  return valor.trim();
};
const validarEntrada = entrada => {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
    || Object.keys(entrada).some(k => !['producto', 'instrucciones', 'indicacionesAdicionales', 'textoProtegido', 'confirmacionPrivacidad', ...Object.keys(opciones)].includes(k))) throw new ErrorIA('ENTRADA');
  if (Object.hasOwn(entrada, 'instrucciones')) return libre.validar(entrada, opciones);
  if (['indicacionesAdicionales', 'textoProtegido', 'confirmacionPrivacidad'].some(k => Object.hasOwn(entrada, k))) throw new ErrorIA('ENTRADA');
  const datos = { producto: texto(entrada.producto, 100) };
  if (/[\r\n]/.test(datos.producto)) throw new ErrorIA('ENTRADA');
  for (const [campo, valores] of Object.entries(opciones)) {
    if (typeof entrada[campo] !== 'string' || !Object.hasOwn(valores, entrada[campo])) throw new ErrorIA('ENTRADA');
    datos[campo] = entrada[campo];
  }
  return datos;
};
// No texto libre, IDs, nombres, empresa, contactos, historial ni datos de sesión.
const contextoPublico = datos => datos.instrucciones !== undefined ? libre.contexto(datos, opciones) : Object.fromEntries(Object.entries(opciones).map(([campo, valores]) => [campo, valores[datos[campo]]]));
const validarContextoPublico = contexto => {
  if (contexto?.modo) return libre.validarContexto(contexto, opciones);
  if (!contexto || typeof contexto !== 'object' || Array.isArray(contexto) || Object.keys(contexto).length !== Object.keys(opciones).length
    || !Object.entries(opciones).every(([campo, valores]) => Object.values(valores).includes(contexto[campo]))) throw new ErrorIA('ENTRADA');
  return Object.fromEntries(Object.keys(opciones).map(campo => [campo, contexto[campo]]));
};
const validarSalida = salida => {
  if (!salida || typeof salida !== 'object' || Array.isArray(salida)
    || Object.keys(salida).length !== 4 || !['asunto', 'mensaje', 'llamadaAccion', 'segmentacion'].every(k => Object.hasOwn(salida, k))) throw new ErrorIA('RESPUESTA');
  const limpio = { asunto: texto(salida.asunto, 120, 'RESPUESTA'), mensaje: texto(salida.mensaje, 3000, 'RESPUESTA'),
    llamadaAccion: texto(salida.llamadaAccion, 180, 'RESPUESTA') };
  if (!Array.isArray(salida.segmentacion) || !salida.segmentacion.length || salida.segmentacion.length > 5) throw new ErrorIA('RESPUESTA');
  limpio.segmentacion = salida.segmentacion.map(s => texto(s, 180, 'RESPUESTA'));
  for (const s of [limpio.asunto, limpio.mensaje, limpio.llamadaAccion, ...limpio.segmentacion]) {
    if (/[<>]|https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:javascript|data):/i.test(s)) throw new ErrorIA('RESPUESTA');
  }
  return limpio;
};
const personalizarLocal = (salida, producto) => {
  const sustituir = texto => texto.replaceAll('{{PRODUCTO}}', producto);
  const resultado = { asunto: sustituir(salida.asunto), mensaje: sustituir(salida.mensaje), llamadaAccion: sustituir(salida.llamadaAccion),
    segmentacion: salida.segmentacion.map(sustituir) };
  // El producto libre solo se incorpora localmente; nunca vuelve al proveedor.
  if (resultado.asunto.length > 220 || resultado.mensaje.length > 5000 || resultado.llamadaAccion.length > 300
    || resultado.segmentacion.some(s => s.length > 300)) throw new ErrorIA('RESPUESTA');
  return resultado;
};
module.exports = { opciones, texto, validarEntrada, contextoPublico, validarContextoPublico, validarSalida, personalizarLocal };
