const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const { estadoAlta } = require('../services/usuariosGestionService');
const { passwordValida, mensajePassword } = require('../services/passwordService');
const global = res => res.locals.usuarioActual.rol === 'superadmin';
const base = res => global(res) ? '/admin/usuarios' : '/empresa/usuarios';
const cargar = async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw Object.assign(new Error('ID inválido'), { status: 400 });
  const filtro = { _id: req.params.id, rol: global(res) ? { $in: ['admin_empresa', 'operador'] } : 'operador' };
  if (!global(res)) filtro.empresa = res.locals.usuarioActual.empresa._id;
  const usuario = await Usuario.findOne(filtro);
  if (!usuario) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  // Mantener el alcance también en el filtro de escritura del documento.
  usuario.$where = { empresa: usuario.empresa, rol: usuario.rol, estadoAcceso: usuario.estadoAcceso ?? { $exists: false },
    versionSesion: usuario.versionSesion === undefined ? { $exists: false } : usuario.versionSesion };
  return usuario;
};
const vista = (res, datos, errores = [], status = 200) => res.status(status).render('empresa/usuarioEditar', {
  titulo: 'Editar usuario', datos, errores, base: base(res), anio: new Date().getFullYear()
});
const editar = async (req, res, next) => {
  try { vista(res, await cargar(req, res)); } catch (e) { next(e); }
};
const guardar = async (req, res, next) => {
  try {
    const usuario = await cargar(req, res);
    const nombre = typeof req.body?.nombre === 'string' ? req.body?.nombre.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body?.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    const errores = [];
    if (!nombre) errores.push('El nombre es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push('Introduce un email válido.');
    if (usuario.rol === 'admin_empresa' && usuario.emailVerificadoEn && email !== usuario.email) errores.push('El correo del administrador verificado requiere un proceso de verificación. Conserva el correo actual.');
    if (password !== undefined && password !== '' && !passwordValida(password)) errores.push(mensajePassword);
    if (errores.length) return vista(res, { _id: usuario._id, nombre, email }, errores, 422);
    usuario.nombre = nombre; usuario.email = email;
    if (password) usuario.password = password;
    try { await usuario.save(); }
    catch (e) {
      if (e.code === 11000 || e.name === 'ValidationError') return vista(res, { _id: usuario._id, nombre, email }, ['Revisa los datos y utiliza otro email.'], 422);
      throw e;
    }
    req.session.avisoOperacion = 'Los datos del usuario se guardaron correctamente.';
    res.redirect(303, '/panel');
  } catch (e) { next(e); }
};
const estado = async (req, res, next) => {
  try {
    const usuario = await cargar(req, res);
    const estabaPendiente = usuario.estadoAcceso === 'pendiente_verificacion';
    if (!['bloqueado', 'activo'].includes(req.body?.estadoAcceso)) throw Object.assign(new Error('Estado inválido'), { status: 400 });
    if (usuario.estadoAcceso === 'pendiente_verificacion' && usuario.rol !== 'operador') throw Object.assign(new Error('Verificación pendiente'), { status: 403 });
    if (req.body?.estadoAcceso === 'activo') {
      // Delegar un operador exige una empresa habilitada; los administradores
      // pendientes conservan su verificación independiente de correo.
      if (await estadoAlta(usuario.empresa) !== 'activo') {
        return res.status(403).render('error', { titulo: 'Activación no disponible', mensaje: 'La empresa debe estar habilitada y completar su verificación antes de activar o reactivar usuarios.' });
      }
    }
    if (req.body?.estadoAcceso === 'bloqueado') usuario.versionSesion = (usuario.versionSesion ?? 0) + 1;
    usuario.estadoAcceso = req.body?.estadoAcceso;
    await usuario.save();
    req.session.avisoOperacion = usuario.estadoAcceso === 'bloqueado' ? 'Usuario bloqueado. Sus sesiones dejarán de tener acceso.' : estabaPendiente ? 'Operador activado correctamente.' : 'Usuario reactivado correctamente.';
    res.redirect(303, '/panel');
  } catch (e) { next(e); }
};
const consultar = async (req, res, next) => {
  try {
    const usuario = await cargar(req, res);
    const empresa = usuario.empresa ? await Empresa.findById(usuario.empresa).select('nombre').lean() : null;
    res.render('empresa/usuarioDetalle', { titulo: 'Detalle de usuario', datos: usuario, empresa, base: base(res), anio: new Date().getFullYear() });
  } catch (e) { next(e); }
};
module.exports = { consultar, editar, guardar, estado };
