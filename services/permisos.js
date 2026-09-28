const ROLES = Object.freeze(['superadmin', 'admin_empresa', 'operador']);
const accionesCampana = ['campanas.crear', 'campanas.consultar', 'campanas.editar', 'campanas.ejecutar'];
const accionesAdmin = [...accionesCampana, 'campanas.eliminar', 'usuarios.administrar'];
const acciones = new Set([...accionesAdmin, 'empresas.administrar', 'automatizaciones.editar']);

const idEmpresa = empresa => {
  const id = empresa?._id ?? empresa;
  const texto = typeof id === 'string' ? id : id?.toHexString?.();
  return typeof texto === 'string' && /^[a-f\d]{24}$/i.test(texto) ? texto.toLowerCase() : null;
};

// Recibe un usuario y la empresa del recurso obtenidos por el servidor, nunca req.body.
// Los recursos antiguos sin empresa son globales
// únicamente para superadmin; no se concede acceso por dos empresas ausentes.
const puede = (usuario, accion, empresaRecurso) => {
  if (!usuario || !ROLES.includes(usuario.rol) || !acciones.has(accion)) return false;
  if (usuario.rol === 'superadmin') return true;
  const empresa = idEmpresa(usuario.empresa);
  if (!empresa || empresa !== idEmpresa(empresaRecurso)) return false;
  return (usuario.rol === 'admin_empresa' ? accionesAdmin : accionesCampana).includes(accion);
};

module.exports = { ROLES, puede };
