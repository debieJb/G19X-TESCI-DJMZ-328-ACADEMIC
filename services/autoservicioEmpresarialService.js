const { createHash, randomBytes } = require('node:crypto');
const registro = require('./registroEmpresarialService');
const correoPredeterminado = require('./correoTransaccionalService').predeterminado;

const hash = valor => createHash('sha256').update(valor).digest('hex');
const aleatorio = () => randomBytes(32).toString('base64url');

const DURACION_ENLACE = 30 * 60 * 1000;
const DURACION_CONFIGURACION = 20 * 60 * 1000;
const DIA = 24 * 60 * 60 * 1000;

const nombres = [
  'Empresa',
  'Usuario',
  'SolicitudRegistro',
  'LimiteRegistro',
  'AuditoriaRegistro'
];

const fallo = codigo => {
  throw new registro.ErrorRegistro(codigo);
};

const exigir = (ok, codigo) => {
  if (!ok) fallo(codigo);
};

const email = valor => {
  exigir(typeof valor === 'string', 'DATOS_INVALIDOS');
  const limpio = valor.trim().toLowerCase();
  exigir(
    limpio.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio),
    'DATOS_INVALIDOS'
  );
  return limpio;
};

const texto = valor =>
  typeof valor === 'string' ? valor.trim() : '';

const validarSolicitud = datos => {
  exigir(
    datos &&
    Object.keys(datos).every(k =>
      ['nombreEmpresa', 'correo'].includes(k)
    ),
    'DATOS_INVALIDOS'
  );

  const nombreEmpresa = texto(datos.nombreEmpresa);

  exigir(
    nombreEmpresa.length > 0 &&
    nombreEmpresa.length <= 200,
    'DATOS_INVALIDOS'
  );

  return {
    nombreEmpresa,
    correo: email(datos.correo)
  };
};

const tokenHash = token => {
  exigir(
    typeof token === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, 'base64url').toString('base64url') === token,
    'ENLACE_INVALIDO'
  );

  return hash(token);
};

const modelosRegistro = conexion => Object.fromEntries(nombres.map(nombre => {
    const original =
      conexion.models[nombre] || require(`../models/${nombre}`);

    return [
      nombre,
      conexion.models[nombre] ||
      conexion.model(
        nombre,
        original.schema.clone()
          .set('autoIndex', false)
          .set('autoCreate', false)
      )
    ];
  }));

// DDL aditivo exclusivamente durante arranque, antes de aceptar peticiones.
const inicializar = async conexion => {
  await registro.validarTopologia(conexion);
  const m = modelosRegistro(conexion);
  const existentes = await conexion.db.listCollections({}, { nameOnly: true }).toArray();
  for (const modelo of Object.values(m)) {
    const existe = existentes.some(c => c.name === modelo.collection.name);
    const actuales = existe ? await modelo.collection.listIndexes().toArray() : [];
    for (const [key, opts] of modelo.schema.indexes()) {
      const actual = actuales.find(i => JSON.stringify(i.key) === JSON.stringify(key));
      exigir(!actual || (!!actual.unique === !!opts.unique && !actual.sparse
        && JSON.stringify(actual.partialFilterExpression) === JSON.stringify(opts.partialFilterExpression)
        && actual.expireAfterSeconds === opts.expireAfterSeconds), 'INDICES_INCOMPATIBLES');
    }
  }
  for (const modelo of Object.values(m)) {
    try { await modelo.createCollection(); } catch (e) { if (e.code !== 48) throw e; }
    await modelo.createIndexes();
  }
  await preparar(conexion);
};

const preparar = async conexion => {
  await registro.validarTopologia(conexion);
  const m = modelosRegistro(conexion);

  // No crear colecciones ni indices desde una peticion publica.
  for (const nombre of nombres) {
    const indices =
      await m[nombre].collection.listIndexes().toArray();

    for (const [key, options] of m[nombre].schema.indexes()) {
      exigir(
        indices.some(i =>
          JSON.stringify(i.key) === JSON.stringify(key) &&
          !!i.unique === !!options.unique &&
          !i.sparse &&
          JSON.stringify(i.partialFilterExpression) ===
            JSON.stringify(options.partialFilterExpression) &&
          i.expireAfterSeconds === options.expireAfterSeconds
        ),
        'INDICES_REQUERIDOS'
      );
    }
  }

  return m;
};

const evento = (m, solicitud, nombre, session) =>
  new m.AuditoriaRegistro({
    solicitud,
    evento: nombre
  }).save({ session });

const crearServicio = ({
  conexion,
  correo = correoPredeterminado,
  reloj = () => new Date(),
  limitesEnvio = { minuto: 10, dia: 100 },
  diagnostico = () => {}
}) => {
  exigir(
    Number.isInteger(limitesEnvio.minuto) &&
    limitesEnvio.minuto >= 1 &&
    limitesEnvio.minuto <= 100 &&
    Number.isInteger(limitesEnvio.dia) &&
    limitesEnvio.dia >= 1 &&
    limitesEnvio.dia <= 1000,
    'LIMITES_ENVIO_INVALIDOS'
  );

  const transaccion = fn =>
    conexion.transaction(fn, registro.opcionesTransaccion);

  const solicitar = async ({
    datos,
    claveIdempotencia,
    ambito
  }) => {
    const limpio = validarSolicitud(datos);

    exigir(
      typeof claveIdempotencia === 'string' &&
      /^[A-Za-z0-9_-]{16,128}$/.test(claveIdempotencia) &&
      typeof ambito === 'string' &&
      ambito.length > 0,
      'IDEMPOTENCIA_INVALIDA'
    );

    const m = await preparar(conexion);
    const ahora = reloj();

    const idempotenciaHash =
      hash(`${hash(ambito)}:${claveIdempotencia}`);

    const solicitudHash = hash(JSON.stringify(limpio));

    try {
      return await transaccion(async session => {
        const previa = await m.SolicitudRegistro
          .findOne({ idempotenciaHash })
          .select('+solicitudHash')
          .session(session);

        if (previa) {
          exigir(
            previa.solicitudHash === solicitudHash,
            'IDEMPOTENCIA_CONFLICTO'
          );
          return null;
        }

        // No revelar si ya existe una empresa o un usuario.
        if (
          await m.Usuario.exists({
            email: limpio.correo
          }).session(session) ||
          await m.SolicitudRegistro.exists({
            correo: limpio.correo
          }).session(session)
        ) {
          return null;
        }

        const doc = new m.SolicitudRegistro({
          ...limpio,
          estado: 'pendiente_correo',
          idempotenciaHash,
          solicitudHash,
          correoEstado: correo.disponible
            ? 'pendiente'
            : 'pendiente_configuracion',
          ventanaEnvioEn: ahora,
          proximoEnvioEn: new Date(+ahora + 60000)
        });

        await doc.save({ session });
        await evento(m, doc._id, 'solicitada', session);

        // Solo devolver el ID de una solicitud NUEVA.
        return String(doc._id);
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      return null;
    }
  };

  const reenviar = async valor => {
    const destino = email(valor);
    const m = await preparar(conexion);
    const ahora = reloj();

    return await transaccion(async session => {
      const doc = await m.SolicitudRegistro
        .findOne({ correo: destino })
        .select('+tokenHash +enlacesAnteriores')
        .session(session);

      if (
        !doc ||
        ['incierta', 'procesando'].includes(doc.correoEstado) ||
        doc.estado === 'completada' ||
        doc.proximoEnvioEn > ahora ||
        (
          doc.estado === 'correo_verificado' &&
          doc.configuracionExpiraEn > ahora
        ) ||
        (
          doc.correoEstado === 'procesando' &&
          doc.entregaHasta > ahora
        )
      ) {
        return;
      }

      const ventanaNueva =
        +ahora - +doc.ventanaEnvioEn >= DIA;

      if (!ventanaNueva && doc.solicitudesEnvio >= 5) {
        return;
      }

      doc.solicitudesEnvio =
        ventanaNueva ? 1 : doc.solicitudesEnvio + 1;

      if (ventanaNueva) {
        doc.ventanaEnvioEn = ahora;
      }

      doc.proximoEnvioEn = new Date(+ahora + 60000);
      doc.estado = 'pendiente_correo';

      doc.configuracionSesionHash = undefined;
      doc.configuracionExpiraEn = undefined;
      if (doc.tokenHash) doc.enlacesAnteriores = [...(doc.enlacesAnteriores || []), { hash: doc.tokenHash, estado: 'sustituido', fecha: ahora }].slice(-5);
      doc.tokenHash = undefined;
      doc.expiraEn = undefined;
      doc.verificadoEn = undefined;
      doc.entregaHash = undefined;
      doc.entregaHasta = undefined;

      doc.correoEstado = correo.disponible
        ? 'pendiente'
        : 'pendiente_configuracion';

      await doc.save({ session });
      await evento(m, doc._id, 'reenvio', session);
      return String(doc._id);
    });
  };

  // La solicitud es una tarea persistente de la cola.
  const recuperarIncierta = async () => {
    const m = await preparar(conexion);
    const ahora = reloj();

    return transaccion(async session => {
      const doc = await m.SolicitudRegistro.findOneAndUpdate(
        {
          estado: 'pendiente_correo',
          correoEstado: 'procesando',
          entregaHasta: { $lte: ahora }
        },
        {
          $set: {
            correoEstado: 'incierta',
            correoError: 'TRABAJADOR_INTERRUMPIDO'
          },
          $unset: {
            entregaHash: 1,
            entregaHasta: 1
          }
        },
        { new: true, session }
      );

      if (doc) {
        await evento(m, doc._id, 'correo_incierto', session);
      }

      return {
        estado: doc ? 'incierta' : 'sin_trabajo'
      };
    });
  };

  // Reclamar la solicitud antes de enviar el correo.
  const despachar = async ({
    solicitudId,
    primerIntento = false,
    destinatarioEsperado
  } = {}) => {
    if (solicitudId !== undefined) {
      exigir(
        typeof solicitudId === 'string' &&
        /^[a-f0-9]{24}$/.test(solicitudId),
        'DATOS_INVALIDOS'
      );
    }

    if (primerIntento) {
      exigir(
        solicitudId &&
        email(destinatarioEsperado) === destinatarioEsperado,
        'BUZON_CONTROLADO_REQUERIDO'
      );
    }

    if (!correo.disponible) {
      return { estado: 'deshabilitado' };
    }

    const m = await preparar(conexion);
    const ahora = reloj();
    const token = aleatorio();
    const entrega = hash(aleatorio());

    let doc;

    try {
      doc = await transaccion(async session => {
        const tomado =
          await m.SolicitudRegistro.findOneAndUpdate(
            {
              ...(solicitudId ? { _id: solicitudId } : {}),
              ...(primerIntento
                ? {
                    versionEnvio: 0,
                    correo: destinatarioEsperado
                  }
                : {}),
              estado: 'pendiente_correo',
              correoEstado: {
                $in: ['pendiente', 'pendiente_configuracion']
              }
            },
            {
              $set: {
                correoEstado: 'procesando',
                tokenHash: hash(token),
                expiraEn: new Date(
                  +ahora + DURACION_ENLACE
                ),
                entregaHash: entrega,
                entregaHasta: new Date(
                  +ahora + 120000
                )
              },
              $unset: {
                correoError: 1,
                proveedorMensajeId: 1
              },
              $inc: {
                versionEnvio: 1
              }
            },
            {
              new: true,
              session,
              sort: { createdAt: 1 }
            }
          );

        if (tomado) {
          for (const [periodo, maximo] of [
            [60000, limitesEnvio.minuto],
            [DIA, limitesEnvio.dia]
          ]) {
            const ventana = Math.floor(+ahora / periodo);

            const _id = hash(
              `gmail-transaccional:${periodo}:${ventana}`
            );

            const limite =
              await m.LimiteRegistro.findOneAndUpdate(
                { _id },
                {
                  $inc: { cantidad: 1 },
                  $setOnInsert: {
                    expiraEn: new Date(
                      (ventana + 1) * periodo
                    )
                  }
                },
                {
                  upsert: true,
                  new: true,
                  session
                }
              );

            exigir(
              limite.cantidad <= maximo,
              'CUOTA_ENVIO_AGOTADA'
            );
          }
        }

        return tomado;
      });
    } catch (e) {
      if (
        e.codigo === 'CUOTA_ENVIO_AGOTADA' ||
        e.code === 11000
      ) {
        return { estado: 'limitada' };
      }
      throw e;
    }

    if (!doc) {
      return { estado: 'sin_trabajo' };
    }

    let estado = 'enviada';
    let codigo;
    let aceptacion;

    try {
      aceptacion = await correo.enviarVerificacion({
        correo: doc.correo,
        token
      });
    } catch (e) {
      estado = e?.definitivo === true
        ? 'fallida'
        : 'incierta';

      codigo = e?.requiereAutorizacion === true
        ? 'REAUTORIZAR_TRANSACCIONAL'
        : [
            'REAUTORIZAR_TRANSACCIONAL',
            'GMAIL_TRANSACCIONAL_RECHAZADO',
            'ENTREGA_CANCELADA'
          ].includes(e?.codigo)
          ? e.codigo
          : estado === 'incierta'
            ? 'ENTREGA_INCIERTA'
            : 'PROVEEDOR_RECHAZADO';
    }

    await transaccion(async session => {
      const resultado =
        await m.SolicitudRegistro.updateOne(
          {
            _id: doc._id,
            entregaHash: entrega,
            correoEstado: 'procesando'
          },
          {
            $set: {
              correoEstado: estado,
              ...(codigo ? { correoError: codigo } : {}),
              ...(
                /^[a-zA-Z0-9_-]{1,128}$/.test(
                  aceptacion?.mensajeId || ''
                )
                  ? {
                      proveedorMensajeId:
                        aceptacion.mensajeId
                    }
                  : {}
              )
            },
            $unset: {
              entregaHash: 1,
              entregaHasta: 1,
              ...(estado === 'fallida'
                ? {
                    tokenHash: 1,
                    expiraEn: 1
                  }
                : {})
            }
          },
          { session }
        );

      if (resultado.matchedCount) {
        await evento(
          m,
          doc._id,
          estado === 'enviada'
            ? 'correo_emitido'
            : estado === 'fallida'
              ? 'correo_fallido'
              : 'correo_incierto',
          session
        );
      }
    });

    if (codigo) {
      diagnostico(codigo);
    }

    return { estado };
  };

  const verificar = async ({ hashEnlace, sesion }) => {
    exigir(
      typeof hashEnlace === 'string' &&
      /^[a-f0-9]{64}$/.test(hashEnlace) &&
      typeof sesion === 'string' &&
      sesion.length > 0,
      'ENLACE_INVALIDO'
    );

    const m = await preparar(conexion);
    const ahora = reloj();

    return transaccion(async session => {
      const doc =
        await m.SolicitudRegistro.findOneAndUpdate(
          {
            tokenHash: hashEnlace,
            estado: 'pendiente_correo',
            expiraEn: { $gt: ahora }
          },
          {
            $set: {
              estado: 'correo_verificado',
              verificadoEn: ahora,
              configuracionSesionHash: hash(sesion),
              configuracionExpiraEn: new Date(
                +ahora + DURACION_CONFIGURACION
              )
            },
            $unset: {
              tokenHash: 1,
              expiraEn: 1
            },
            $push: { enlacesAnteriores: { $each: [{ hash: hashEnlace, estado: 'usado', fecha: ahora }], $slice: -5 } }
          },
          { new: true, session }
        );

      exigir(doc, 'ENLACE_INVALIDO');

      await evento(m, doc._id, 'verificada', session);

      return {
        solicitud: String(doc._id)
      };
    });
  };

  const consultarEnlace = async ({ hashEnlace }) => {
    exigir(
      typeof hashEnlace === 'string' &&
      /^[a-f0-9]{64}$/.test(hashEnlace),
      'ENLACE_INVALIDO'
    );

    const m = await preparar(conexion);

    const doc = await m.SolicitudRegistro
      .findOne({ tokenHash: hashEnlace })
      .select('estado expiraEn')
      .lean();

    if (!doc) {
      const anterior = await m.SolicitudRegistro.findOne({ 'enlacesAnteriores.hash': hashEnlace }).select('+enlacesAnteriores').lean();
      return anterior?.enlacesAnteriores?.find(e => e.hash === hashEnlace)?.estado || 'invalido';
    }
    if (doc.estado !== 'pendiente_correo') {
      return 'usado';
    }

    return doc.expiraEn instanceof Date &&
      +doc.expiraEn > +reloj()
      ? 'vigente'
      : 'caducado';
  };

  const consultarConfiguracion = async ({
    solicitud,
    sesion
  }) => {
    if (
      typeof solicitud !== 'string' ||
      !/^[a-f0-9]{24}$/.test(solicitud) ||
      typeof sesion !== 'string' ||
      !sesion
    ) {
      return 'invalida';
    }

    const m = await preparar(conexion);

    const doc = await m.SolicitudRegistro
      .findOne({
        _id: solicitud,
        configuracionSesionHash: hash(sesion)
      })
      .select('estado configuracionExpiraEn')
      .lean();

    if (!doc) {
      return 'invalida';
    }

    if (
      !(doc.configuracionExpiraEn instanceof Date) ||
      +doc.configuracionExpiraEn <= +reloj()
    ) {
      return 'caducada';
    }

    return doc.estado === 'correo_verificado'
      ? 'vigente'
      : doc.estado === 'completada'
        ? 'completada'
        : 'invalida';
  };

  const configurar = async ({
    solicitud,
    sesion,
    datos
  }) => {
    exigir(
      typeof solicitud === 'string' &&
      /^[a-f0-9]{24}$/.test(solicitud) &&
      typeof sesion === 'string' &&
      !!sesion,
      'ENLACE_INVALIDO'
    );

    exigir(
      datos &&
      Object.keys(datos).every(k =>
        [
          'nombreEmpresa',
          'nombreAdministrador',
          'password',
          'confirmacionPassword'
        ].includes(k)
      ),
      'DATOS_INVALIDOS'
    );

    const nombreEmpresa = texto(datos.nombreEmpresa);
    const nombreAdministrador =
      texto(datos.nombreAdministrador);

    exigir(
      nombreEmpresa &&
      nombreEmpresa.length <= 200 &&
      nombreAdministrador &&
      nombreAdministrador.length <= 200,
      'DATOS_INVALIDOS'
    );

    registro.validarPassword(datos.password);

    exigir(
      datos.password === datos.confirmacionPassword,
      'PASSWORD_INSEGURA'
    );

    const m = await preparar(conexion);
    const ahora = reloj();

    return transaccion(async session => {
      const filtro = {
        _id: solicitud,
        configuracionSesionHash: hash(sesion)
      };

      const previa = await m.SolicitudRegistro
        .findOne({
          ...filtro,
          estado: 'completada',
          configuracionExpiraEn: { $gt: ahora }
        })
        .session(session);

      if (previa) {
        const usuario = await m.Usuario
          .findOne({
            _id: previa.usuario,
            empresa: previa.empresa,
            email: previa.correo,
            estadoAcceso: 'activo'
          })
          .select('+password')
          .session(session);

        exigir(
          usuario &&
          usuario.nombre === nombreAdministrador &&
          previa.nombreEmpresa === nombreEmpresa &&
          await usuario.compararPassword(datos.password),
          'IDEMPOTENCIA_CONFLICTO'
        );

        return;
      }

      const doc =
        await m.SolicitudRegistro.findOneAndUpdate(
          {
            ...filtro,
            estado: 'correo_verificado',
            configuracionExpiraEn: { $gt: ahora }
          },
          {
            $set: {
              estado: 'completada'
            }
          },
          { new: true, session }
        );

      exigir(doc, 'ENLACE_INVALIDO');

      const entrada = registro.validar(
        {
          nombreEmpresa,
          nombreAdministrador,
          correoAutomatizaciones: doc.correo,
          correoAdministrador: doc.correo,
          password: datos.password
        },
        'autoservicio-interno-validacion'
      );

      const { empresa, usuario } =
        await registro.crearEmpresaAdministrador(
          m,
          entrada,
          session,
          doc.verificadoEn
        );

      doc.empresa = empresa._id;
      doc.usuario = usuario._id;
      doc.nombreEmpresa = nombreEmpresa;
      doc.correoEstado = 'cancelada';

      await doc.save({ session });
      await evento(m, doc._id, 'completada', session);
    });
  };

  const limitar = async ({
    accion,
    identificador,
    maximo,
    ventanaMs = 15 * 60000
  }) => {
    exigir(
      [
        'solicitud',
        'reenvio',
        'verificacion',
        'configuracion',
        'correo'
      ].includes(accion) &&
      typeof identificador === 'string' &&
      identificador.length > 0,
      'DATOS_INVALIDOS'
    );

    const m = await preparar(conexion);
    const ahora = reloj();
    const ventana = Math.floor(+ahora / ventanaMs);
    const _id = hash(
      `${accion}:${identificador}:${ventana}`
    );

    let limite;

    try {
      limite = await m.LimiteRegistro.findOneAndUpdate(
        { _id },
        {
          $inc: {
            cantidad: 1
          },
          $setOnInsert: {
            expiraEn: new Date(
              (ventana + 1) * ventanaMs
            )
          }
        },
        {
          upsert: true,
          new: true
        }
      );
    } catch (e) {
      if (e.code !== 11000) throw e;

      limite = await m.LimiteRegistro.findOneAndUpdate(
        { _id },
        {
          $inc: {
            cantidad: 1
          }
        },
        {
          new: true
        }
      );
    }

    exigir(
      limite && limite.cantidad <= maximo,
      'LIMITE_SOLICITUDES'
    );
  };

  return {
    solicitar,
    reenviar,
    despachar,
    recuperarIncierta,
    verificar,
    consultarEnlace,
    consultarConfiguracion,
    configurar,
    limitar
  };
};

module.exports = {
  crearServicio,
  inicializar,
  preparar,
  validarSolicitud,
  tokenHash,
  hash,
  DURACION_ENLACE,
  DURACION_CONFIGURACION
};
