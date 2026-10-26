const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const autoservicio = require('../services/autoservicioEmpresarialService');

// Servicio empresarial conectado con Gmail SMTP mediante Nodemailer.
const servicio = (conCorreo = false) => autoservicio.crearServicio({
  conexion: mongoose.connection,
  ...(conCorreo ? { correo: require('../services/smtpTransaccionalService').crearCorreo() } : {})
});

const guardarSesion = req => new Promise((resolve, reject) =>
  req.session.save(e => e ? reject(e) : resolve())
);

const regenerar = req => new Promise((resolve, reject) =>
  req.session.regenerate(e => e ? reject(e) : resolve())
);

const mensajeGenerico = 'Solicitud recibida. Si el registro puede continuar, se procesará la verificación cuando el servicio de correo esté disponible. Esta respuesta no confirma el envío ni la entrega de un mensaje.';
const mensajeCuentaExistente = 'Este correo electrónico ya está vinculado a una cuenta existente en nuestra plataforma';
const despuesDeResponder = (res, despachar) => res.once('finish', () => setImmediate(() => {
  Promise.resolve().then(despachar).catch(() => console.error('VERIFICACION_DESPACHO_NO_DISPONIBLE'));
}));

const pagina = (res, paso, status = 200, mensaje = '') =>
  res.status(status).render('registro', { paso, mensaje });


const error = (res, e, paso) => {
  // No registrar mensajes originales de MongoDB/SMTP: pueden contener datos privados.

  if (e.codigo === 'LIMITE_SOLICITUDES') {
    res.set('Retry-After', '900');
    return pagina(
      res,
      paso,
      429,
      'Demasiadas solicitudes. Espera antes de intentarlo de nuevo.'
    );
  }

  if (['DATOS_INVALIDOS', 'PASSWORD_INSEGURA'].includes(e.codigo)) {
    return pagina(
      res,
      paso,
      422,
      paso === 'administrador'
        ? 'Revisa los datos y confirma la contraseña: al menos 16 caracteres, cuatro diferentes y hasta 72 bytes.'
        : 'Revisa el nombre de la empresa y escribe un correo electrónico válido.'
    );
  }



  if (['ENLACE_INVALIDO', 'IDEMPOTENCIA_CONFLICTO'].includes(e.codigo)) {
    return pagina(res, 'invalido', 422,
      'El enlace o la sesión no es válido, ya se utilizó o ha caducado. Solicita otro enlace.');
  }

  // No registrar correos, contraseñas, tokens ni datos privados.
  return pagina(res, paso, 503,
    'El registro no está disponible temporalmente. Inténtalo más tarde.');
};

const limitar = (req, accion, maximo) =>
  servicio().limitar({
    accion,
    identificador: req.ip || 'sin-ip',
    maximo
  });

const mostrar = (req, res) => {
  if (!req.session.registroIdempotencia) {
    req.session.registroIdempotencia = randomBytes(24).toString('base64url');
  }

  res.locals.idempotencia = req.session.registroIdempotencia;
  return pagina(res, 'solicitud');
};

const solicitud = async (req, res) => {
  const inicio = Date.now();

  try {
    await limitar(req, 'solicitud', 10);

    if (Object.keys(req.body || {}).some(k =>
      !['_csrf', 'idempotencia', 'nombreEmpresa', 'correo'].includes(k)
    )) {
      throw { codigo: 'DATOS_INVALIDOS' };
    }

    const datos = autoservicio.validarSolicitud({
      nombreEmpresa: req.body.nombreEmpresa,
      correo: req.body.correo
    });

    if (
      !req.session.registroIdempotencia ||
      req.body.idempotencia !== req.session.registroIdempotencia
    ) {
      throw { codigo: 'DATOS_INVALIDOS' };
    }

    await servicio().limitar({
      accion: 'correo',
      identificador: datos.correo,
      maximo: 5,
      ventanaMs: 3600000
    });

    try {
      const servicioRegistro = servicio(true);
      const solicitudId = await servicioRegistro.solicitar({
        datos,
        claveIdempotencia: req.session.registroIdempotencia,
        ambito: req.sessionID
      });
      // Solo la solicitud nueva confirmada, nunca un barrido de pendientes.
      if (typeof solicitudId === 'string' && /^[a-f0-9]{24}$/.test(solicitudId)
        && process.env.TRANSACTIONAL_EMAIL_ENABLED === 'true') {
        despuesDeResponder(res, () => servicioRegistro.despachar({ solicitudId, primerIntento: true, destinatarioEsperado: datos.correo }));
      }
    } catch (e) {
      if (e.codigo !== 'IDEMPOTENCIA_CONFLICTO') throw e;
    }

    // La solicitud queda registrada para su despacho por el sistema SMTP.
    // No enviar aquí un segundo correo ni saltarse la cola.
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, 250 - (Date.now() - inicio)))
    );

    req.session.registroRecibido = true;

    return pagina(res, 'aceptada', 202, mensajeGenerico);
  } catch (e) {
    return error(res, e, 'solicitud');
  }
};

const mostrarReenvio = (req, res) =>
  pagina(res, 'reenvio');

const estadoEnlace = (res, estado) => {
  if (['caducado', 'usado', 'sustituido'].includes(estado)) return pagina(res, estado, 422);
  return pagina(res, 'invalido', 422, 'No se encontró un enlace vigente. No se puede atribuir la causa a caducidad sin un registro válido.');
};

const reenviar = async (req, res) => {
  const inicio = Date.now();

  try {
    await limitar(req, 'reenvio', 10);

    if (Object.keys(req.body || {}).some(k =>
      !['_csrf', 'correo'].includes(k)
    )) {
      throw { codigo: 'DATOS_INVALIDOS' };
    }

    const destino = autoservicio.validarSolicitud({
      nombreEmpresa: 'Solicitud',
      correo: req.body.correo
    }).correo;

    await servicio().limitar({
      accion: 'correo',
      identificador: destino,
      maximo: 5,
      ventanaMs: 3600000
    });
    const servicioRegistro = servicio(true);
    const solicitudId = await servicioRegistro.reenviar(destino);
    if (typeof solicitudId === 'string' && /^[a-f0-9]{24}$/.test(solicitudId)
      && process.env.TRANSACTIONAL_EMAIL_ENABLED === 'true') {
      despuesDeResponder(res, () => servicioRegistro.despachar({ solicitudId }));
    }
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, 250 - (Date.now() - inicio)))
    );

    req.session.registroRecibido = true;

    return pagina(res, 'aceptada', 202, mensajeGenerico);
  } catch (e) {
    return error(res, e, 'reenvio');
  }
};

const enlace = async (req, res) => {
  try {
    if (Object.hasOwn(req.query, 'token')) {
      // No consumir tokens en GET.
      delete req.session.registroEnlaceHash;

      req.session.registroEnlaceHash =
        autoservicio.tokenHash(req.query.token);

      await guardarSesion(req);

      return res.redirect(303, '/registro/verificar');
    }

    if (
      req.session.registroEnlaceUsadoHash &&
      req.session.registroEnlaceHash === req.session.registroEnlaceUsadoHash
    ) {
      return pagina(res, 'usado', 422);
    }

    if (!req.session.registroEnlaceHash) {
      return pagina(res, 'sesion_invalida', 422);
    }

    await limitar(req, 'verificacion', 30);

    const estado = await servicio().consultarEnlace({
      hashEnlace: req.session.registroEnlaceHash
    });

    if (estado !== 'vigente') {
      return estadoEnlace(res, estado);
    }

    return pagina(res, 'verificacion');
  } catch (e) {
    return error(res, e, 'invalido');
  }
};

const verificar = async (req, res) => {
  try {
    await limitar(req, 'verificacion', 30);

    const hashEnlace = req.session.registroEnlaceHash;

    if (
      req.session.registroEnlaceUsadoHash &&
      (!hashEnlace || hashEnlace === req.session.registroEnlaceUsadoHash)
    ) {
      return pagina(res, 'usado', 422);
    }

    if (!hashEnlace) return pagina(res, 'sesion_invalida', 422);
    const estado = await servicio().consultarEnlace({ hashEnlace });

    if (estado !== 'vigente') {
      return estadoEnlace(res, estado);
    }

    await regenerar(req);

    const resultado = await servicio().verificar({
      hashEnlace,
      sesion: req.sessionID
    });

    req.session.registroSolicitud = resultado.solicitud;
    req.session.registroEnlaceUsadoHash = hashEnlace;

    await guardarSesion(req);

    return res.redirect(303, '/registro/administrador');
  } catch (e) {
    return error(res, e, 'invalido');
  }
};

const mostrarAdministrador = async (req, res) => {
  try {
    if (!req.session.registroSolicitud) {
      return pagina(res, 'invalido', 422,
        'Verifica primero tu correo mediante el enlace recibido.');
    }

    const estado = await servicio().consultarConfiguracion({
      solicitud: req.session.registroSolicitud,
      sesion: req.sessionID
    });

    if (estado === 'caducada') {
      return pagina(res, 'configuracion_caducada', 422);
    }

    if (['completada', 'cuenta_existente'].includes(estado)) {
      // consultarConfiguracion comprueba el permiso de esta sesión, obtenido
      // al verificar el correo. Nunca mostrar esta vinculación en la solicitud pública.
      return pagina(res, 'cuenta_existente', 200, mensajeCuentaExistente);
    }

    if (estado !== 'vigente') {
      return pagina(res, 'invalido', 422,
        'La sesión de configuración no es válida. Solicita un nuevo enlace.');
    }

    return pagina(res, 'administrador');
  } catch (e) {
    return error(res, e, 'invalido');
  }
};

const pendiente = (req, res) =>
  req.session.registroRecibido
    ? pagina(res, 'pendiente')
    : res.redirect(303, '/registro');

const configurar = async (req, res) => {
  try {
    await limitar(req, 'configuracion', 10);

    const datos = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => k !== '_csrf')
    );

    await servicio().configurar({
      solicitud: req.session.registroSolicitud,
      sesion: req.sessionID,
      datos
    });

    await regenerar(req);

    return pagina(res, 'completada', 200,
      'Registro completado. Ya puedes iniciar sesión con el correo verificado.');
  } catch (e) {
    if (e.codigo === 'CUENTA_EXISTENTE') {
      return pagina(res, 'cuenta_existente', 200, mensajeCuentaExistente);
    }
    return error(res, e, 'administrador');
  }
};

module.exports = {
  mostrar,
  solicitud,
  mostrarReenvio,
  reenviar,
  enlace,
  verificar,
  mostrarAdministrador,
  configurar,
  pendiente
};
