const { passwordValida, mensajePassword } = require('../services/passwordService');
const { estadoAlta } = require('../services/usuariosGestionService');
const Usuario = require('../models/Usuario');
const { idEmpresa } = require('../services/accesoCampanasService');
const formulario = (res, datos = { nombre: '', email: '' }, errores = [], status = 200) => res.status(status).render('empresa/usuarioNuevo', {
  titulo: 'Nuevo operador', datos, errores, anio: new Date().getFullYear()
});
const mostrarUsuarioNuevo = (req, res) => formulario(res);
const crearOperador = async (req, res, next) => {
  const datos = {
    nombre: typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '',
    email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  };
  const password = req.body?.password;
  const errores = [];
  if (!datos.nombre) errores.push('El nombre es obligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) errores.push('Introduce un email válido.');
  if (!passwordValida(password)) errores.push(mensajePassword);
  if (errores.length) return formulario(res, datos, errores, 422);
  try {
    const empresa = idEmpresa(res.locals.usuarioActual);
    await estadoAlta(empresa); // Comprobar que la empresa persiste; activar exige una acción separada.
    const estadoAcceso = 'pendiente_verificacion';
    await Usuario.create({ ...datos, password, rol: 'operador', empresa, estadoAcceso });
    req.session.avisoOperacion = 'Operador creado pendiente de activación. Actívalo desde la tabla cuando la empresa esté habilitada y verificada.';
    return res.redirect(303, '/panel');
  } catch (error) {
    if (error.code === 11000 || error.name === 'ValidationError') return formulario(res, datos, ['No se pudo crear el usuario. Revisa los datos y utiliza otro email.'], 422);
    next(error);
  }
};
module.exports = { mostrarUsuarioNuevo, crearOperador };
