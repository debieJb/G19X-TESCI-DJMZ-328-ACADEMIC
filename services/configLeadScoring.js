'use strict';
// Reglas iniciales editables por mantenimiento; nunca se reciben desde el navegador.
module.exports = Object.freeze({
  puntos: Object.freeze({ clic_verificado: 5, formulario_enviado: 15, solicitud_contacto: 25, conversion_confirmada: 40 }),
  ventanaDias: 90,
  prioridadMedia: 30,
  prioridadAlta: 70,
  metodo: 'reglas_v1'
});
