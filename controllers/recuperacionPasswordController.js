'use strict';
const recuperacion = require('../services/recuperacionPasswordService');
const limites = require('../services/limitesRecuperacionService');
const MENSAJE = 'Si existe una cuenta asociada a este correo, recibirás instrucciones para recuperar el acceso';
const servicio = (conCorreo = false) => recuperacion.crearServicio({
  ...(conCorreo ? { correo: require('../services/smtpTransaccionalService').crearCorreo(),
    limitesEnvio: require('../services/trabajadorVerificacionService').configuracion().limitesEnvio } : {})
});
const pagina = (res, paso, status = 200, mensaje = '', codigoGuardado = false) => res.status(status).render('recuperacion', { paso, mensaje, codigoGuardado });
const mostrar = (req, res) => pagina(res, 'solicitud');
const mostrarRestablecer = (req, res) => pagina(res, 'restablecer', 200, '', !!req.session.recuperacionCredencial);
const esperar = inicio => new Promise(resolve => setTimeout(resolve, Math.max(0, 350 - (Date.now() - inicio))));
const solicitar = async (req, res) => {
  const inicio = Date.now(); let tarea;
  try {
    if (Object.keys(req.body || {}).some(k => !['_csrf', 'email'].includes(k))) throw { codigo: 'DATOS_INVALIDOS' };
    const correo = recuperacion.normalizarCorreo(req.body?.email);
    await limites.consumir({ ip: req.ip || 'sin-ip', identificador: correo });
    tarea = await servicio().solicitar(correo);
  } catch (e) {
    if (e.codigo !== 'CUENTA_LIMITADA') {
      await esperar(inicio);
      if (e.codigo === 'DATOS_INVALIDOS') return pagina(res, 'solicitud', 422, 'Escribe un correo electrónico válido.');
      if (e.codigo === 'LIMITE_RECUPERACION') {
        res.set('Retry-After', '900');
        return pagina(res, 'solicitud', 429, 'Demasiadas solicitudes. Espera 15 minutos antes de intentarlo de nuevo.');
      }
      return pagina(res, 'solicitud', 503, 'La recuperación no está disponible temporalmente. Inténtalo más tarde.');
    }
  }
  // El tiempo del proveedor y sus errores no cambian la respuesta pública.
  // La tarea persistente permite continuar desde el trabajador si este proceso se interrumpe.
  if (tarea) res.once('finish', () => setImmediate(() => {
    Promise.resolve().then(() => servicio(true).despachar(tarea)).then(resultado => {
      if (resultado.codigo) console.error('RECUPERACION_CORREO', resultado.codigo);
    }).catch(async error => {
      try { await servicio().registrarBloqueo(tarea, error); } catch { /* No registrar errores originales. */ }
      console.error('RECUPERACION_DESPACHO_NO_DISPONIBLE');
    });
  }));
  await esperar(inicio);
  return pagina(res, 'aceptada', 202, MENSAJE);
};
const restablecer = async (req, res) => {
  try {
    if (Object.keys(req.body || {}).some(k => !['_csrf', 'token', 'password', 'confirmacionPassword'].includes(k))) throw { codigo: 'ENLACE_INVALIDO' };
    const token = req.body?.token;
    const identificador = typeof token === 'string' && /^[a-f0-9]{24}\./.test(token)
      ? token.slice(0, 24) : req.session.recuperacionCredencial?.usuario || 'invalido';
    await limites.consumir({ ip: req.ip || 'sin-ip', identificador, accion: 'restablecer' });
    if (token) req.session.recuperacionCredencial = recuperacion.analizarToken(token);
    if (!req.session.recuperacionCredencial) throw { codigo: 'ENLACE_INVALIDO' };
    await servicio().restablecer({ credencial: req.session.recuperacionCredencial,
      password: req.body?.password, confirmacionPassword: req.body?.confirmacionPassword });
    // No iniciar sesión automáticamente; eliminar también esta sesión de recuperación.
    await require('../middlewares/autenticacion').destruirSesion(req);
    require('../middlewares/autenticacion').limpiarCookie(res);
    return pagina(res, 'completada', 200, 'Contraseña actualizada. Tus sesiones anteriores se cerraron. Inicia sesión con tu nueva contraseña.');
  } catch (e) {
    if (['LIMITE_RECUPERACION', 'CUENTA_LIMITADA'].includes(e.codigo)) {
      res.set('Retry-After', '900');
      return pagina(res, 'restablecer', 429, 'Demasiados intentos. Espera 15 minutos o solicita otro enlace.');
    }
    if (['PASSWORD_INSEGURA', 'PASSWORD_NO_COINCIDE'].includes(e.codigo)) return pagina(res, 'restablecer', 422,
      'Confirma la misma contraseña: al menos 16 caracteres, cuatro diferentes y hasta 72 bytes.', !!req.session.recuperacionCredencial);
    if (e.codigo === 'ENLACE_INVALIDO') return pagina(res, 'invalida', 422, 'El enlace no es válido, ya fue utilizado o ha caducado. Solicita uno nuevo.');
    return pagina(res, 'restablecer', 503, 'No se pudo completar la operación. Intenta iniciar sesión; si no puedes acceder, solicita otro enlace.');
  }
};
module.exports = { mostrar, mostrarRestablecer, solicitar, restablecer, MENSAJE };
