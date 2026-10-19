'use strict';
const limites = require('./limitesIA');
const diagnostico = require('./diagnosticoIA');
const ErrorIA = require('./ErrorIA');
const estado = () => ({ pid: process.pid,
  backend: ['piloto_local', 'protected', 'dev_fixture'].includes(process.env.AI_QUOTA_BACKEND) ? process.env.AI_QUOTA_BACKEND
    : process.env.AI_QUOTA_BACKEND === undefined ? process.env.NODE_ENV === 'production' ? 'protected' : 'dev_fixture' : 'invalido',
  entorno: ['development', 'production', 'test'].includes(process.env.NODE_ENV) ? process.env.NODE_ENV : 'no_configurado' });
const comprobar = async empresa => {
  const actual = estado();
  try {
    await limites.seleccionarAlmacen().obtener(empresa);
    return { ...actual, cuotasVerificadas: true };
  } catch (error) {
    diagnostico('CUOTA_ALMACEN', diagnostico.codigoCuota(error));
    throw new ErrorIA('CUOTAS_NO_DISPONIBLES');
  }
};
const preparar = async app => {
  const actual = estado();
  diagnostico('CONFIGURACION', `BACKEND_${actual.backend.toUpperCase()}`);
  if (process.env.AI_ENABLED === 'true' && actual.backend === 'piloto_local') {
    // Solo lectura: sin consumo de cuota, DDL ni llamada al proveedor.
    app.locals.iaArranque = await comprobar(require('./almacenCuotasPilotoLocal').EMPRESA);
  } else app.locals.iaArranque = { ...actual, cuotasVerificadas: false };
  return app.locals.iaArranque;
};
module.exports = { estado, comprobar, preparar };
