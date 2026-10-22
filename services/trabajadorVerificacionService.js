const { setTimeout: pausa } = require('node:timers/promises');
const autoservicio = require('./autoservicioEmpresarialService');

const validarActivacion = (env, args) => {
  if (
    args.length !== 1 ||
    args[0] !== '--autorizar-trabajador' ||
    env.NODE_ENV !== 'production' ||
    env.TRANSACTIONAL_EMAIL_ENABLED !== 'true' ||
    env.TRANSACTIONAL_WORKER_ENABLED !== 'true'
  ) {
    throw Error('ACTIVACION_TRANSACCIONAL_REQUERIDA');
  }

  require('./infraestructuraPilotoService').asegurarEnvioApagado();
};

const configuracion = (env = process.env) => {
  const numero = (nombre, defecto, maximo) => {
    const valor = env[nombre] === undefined
      ? defecto
      : Number(env[nombre]);

    if (!Number.isInteger(valor) || valor < 1 || valor > maximo) {
      throw Error('LIMITES_TRABAJADOR_INVALIDOS');
    }

    return valor;
  };

  return {
    intervaloMs: numero('TRANSACTIONAL_WORKER_POLL_MS', 2000, 60000),
    limitesEnvio: {
      minuto: numero('TRANSACTIONAL_SENDS_PER_MINUTE', 10, 100),
      dia: numero('TRANSACTIONAL_SENDS_PER_DAY', 100, 1000)
    }
  };
};

// Mantiene el trabajador residente existente.
// No se inicia automáticamente al registrar una empresa.
const ejecutar = async ({
  conexion,
  correo,
  signal,
  intervaloMs = 2000,
  limitesEnvio,
  informar = () => {},
  esperar = pausa
}) => {
  if (!correo?.disponible) {
    throw Error('TRANSPORTE_NO_CONFIGURADO');
  }

  let bloqueo;

  const servicio = autoservicio.crearServicio({
    conexion,
    correo,
    limitesEnvio,
    diagnostico: codigo => {
      bloqueo = codigo;
    }
  });

  while (!signal?.aborted) {
    const recuperada = await servicio.recuperarIncierta();

    if (signal?.aborted) break;

    if (recuperada.estado === 'incierta') {
      informar('ENTREGA_INCIERTA_RECUPERADA');
    }

    const resultado = await servicio.despachar();

    if (bloqueo === 'REAUTORIZAR_TRANSACCIONAL') {
      throw Error('REAUTORIZAR_TRANSACCIONAL');
    }

    informar(
      resultado.estado === 'enviada'
        ? 'CORREO_ACEPTADO_PROVEEDOR'
        : resultado.estado === 'incierta'
          ? 'ENTREGA_INCIERTA'
          : resultado.estado === 'fallida'
            ? 'ENTREGA_FALLIDA'
            : 'COLA_EN_ESPERA'
    );

    if (resultado.estado !== 'enviada') {
      try {
        await esperar(
          resultado.estado === 'fallida'
            ? Math.max(intervaloMs, 60000)
            : intervaloMs,
          undefined,
          { signal }
        );
      } catch (e) {
        if (!signal?.aborted) throw e;
      }
    }
  }

  return { estado: 'detenido' };
};

module.exports = {
  validarActivacion,
  configuracion,
  ejecutar
};
