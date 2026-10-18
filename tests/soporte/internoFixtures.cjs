// Datos sinteticos de renderizado. No son rutas ni accesos del sistema operativo.
const id = '507f1f77bcf86cd799439011';
const empresa = { _id: id, nombre: 'Estudio Horizonte · Empresa de prueba', estado: 'activa', fechaRegistro: new Date(), automatizaciones: {}, totalUsuarios: 2, totalCampanas: 1, usuarios: [] };
const contacto = { _id: id, nombre: 'Contacto de prueba', email: 'contacto@example.test', telefono: '', etiquetas: ['Clientes'], activo: true, canales: { email: true }, empresa: id, consentimientoMarketing: { estado: 'otorgado' }, historialConsentimiento: [] };
const campana = { _id: id, nombre: 'Novedades de temporada', objetivo: 'Presentar las novedades a un contacto con consentimiento.', canal: 'email', estado: 'borrador', asunto: 'Una nueva temporada para tus ideas', cuerpoTexto: 'Hola, descubre nuestra nueva propuesta. Un mensaje claro, revisado y preparado para tu audiencia.', empresa: id, createdAt: new Date(), updatedAt: new Date(), destinatarios: { tipo: 'contactos', contactos: [id] }, automatizacion: { modo: 'inmediato', revision: 1 } };
const fixture = (vista, vacia = false) => {
  const rol = vista.startsWith('admin/') ? 'superadmin' : vista === 'empresa/panelOperador' ? 'operador' : 'admin_empresa';
  const usuarioActual = { _id: id, nombre: 'Administración de prueba', email: 'admin@example.test', rol, empresa: rol === 'superadmin' ? null : empresa };
  return { titulo: 'Espacio de trabajo · PluriOne', anio: 2026, usuarioActual,
    adminCsrf: 'a'.repeat(43), campanaCsrf: 'b'.repeat(43), contactoCsrf: 'c'.repeat(43), gmailCsrf: 'd'.repeat(43), iaCsrf: 'e'.repeat(43),
    empresa, empresas: vacia ? [] : [empresa], usuarios: vacia ? [] : [usuarioActual], operadores: [], totalUsuarios: 2, totalCampanas: 1,
    totales: { empresas: 1, usuarios: 2, campanas: 1 }, usuariosSinEmpresa: [], usuariosEmpresaInexistente: [], campanasSinEmpresa: [],
    campana, campanas: vacia ? [] : [campana], contacto, contactos: vacia ? [] : [contacto],
    canales: ['email'], estados: { borrador: 'Borrador', activa: 'Activa', pausada: 'Pausada', programada: 'Programada', finalizada: 'Finalizada' },
    formatearFecha: d => d ? new Date(d).toLocaleDateString('es-MX') : 'Sin definir', puedeCampana: () => rol !== 'operador',
    mensaje: '', mensajeCanal: '', error: '', errores: [], errorAutomatizacion: false, disponible: false, tieneImagen: false, ticket: 'f'.repeat(43),
    datos: { ...campana, ...contacto, nombre: 'Campaña de prueba', estado: 'borrador', rol: 'operador', empresa: id, fechaInicio: '', fechaFin: '', producto: 'Servicio', audiencia: 'Clientes', tono: 'Profesional', instrucciones: 'Una propuesta clara y elegante.', textoProtegido: '', destinatarios: campana.destinatarios },
    accion: vista === 'campanas/editar' ? `/campanas/${id}/editar` : vista.startsWith('contactos/') ? '/contactos' : '/campanas', cancelar: '/panel', estadoActual: 'borrador', estadosPermitidos: ['borrador', 'programada', 'activa'],
    empresasDisponibles: [empresa], opciones: vista.startsWith('campanas/') ? { contactos: [contacto], etiquetas: ['Clientes'] } : require('../../services/ia/contratoIA').opciones,
    resumenDestinatarios: { tipo: 'contactos', cantidad: 1, contactos: [contacto.nombre], etiquetas: [] },
    guardado: false, pilotoDisponible: true, estado: { motivo: 'Revisa la preparación antes de autorizar un único intento. No se envían mensajes al abrir esta página.', canalValido: true, estadoGmail: 'desconectada', gmailConfigurado: false, identidadCoincide: false, permisoEnvio: false },
    configurado: false, esError: false, conexion: { estado: 'desconectada' },
    resultado: { nombre: campana.nombre, objetivo: campana.objetivo, asunto: campana.asunto, mensaje: campana.cuerpoTexto, llamadaAccion: 'Conoce más', segmentacion: ['Clientes con consentimiento'], proveedor: 'Fixture visual, sin llamada externa' }
  };
};
const vistas = ['admin/dashboard','admin/empresaDetalle','admin/empresaNueva','admin/usuarioNuevo','admin/automatizacionesEditar',
  'empresa/panelAdmin','empresa/panelOperador','empresa/usuarioNuevo','empresa/gmail','empresa/asistenteIA','empresa/resultadoIA',
  'campanas/index','campanas/nueva','campanas/editar','campanas/detalle','campanas/eliminar','campanas/automatizacion',
  'contactos/index','contactos/nuevo','contactos/editar','contactos/detalle','error','panel'];
module.exports = { fixture, vistas };
