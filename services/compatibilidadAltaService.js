// Ausencia de metadatos identifica documentos históricos, nunca prueba titularidad.
const estadoEmpresa = empresa => empresa?.estadoActivacion ?? (empresa?.versionAlta === undefined ? 'historico_no_verificado' : 'pendiente_verificacion');
const estadoUsuario = usuario => usuario?.estadoAcceso ?? 'historico_no_verificado';
const correoVerificado = usuario => usuario?.estadoAcceso === 'activo'
  && usuario.emailVerificadoEn instanceof Date && Number.isFinite(usuario.emailVerificadoEn.getTime());
module.exports = { estadoEmpresa, estadoUsuario, correoVerificado };
