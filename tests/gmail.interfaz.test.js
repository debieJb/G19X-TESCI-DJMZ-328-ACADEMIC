const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'interfaz-gmail-solo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const historicaId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
const campanas = [
  { _id: id, empresa: id, nombre: 'Correo vigente', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Mensaje' },
  { _id: historicaId, empresa: id, nombre: 'Registro anterior', objetivo: 'Objetivo', estado: 'activa', canal: 'whatsapp' }
];
const contacto = { _id: id, empresa: id, nombre: 'Contacto', email: 'prueba@example.test', etiquetas: [], activo: true, canales: { email: true, whatsapp: true, sms: true } };

for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
  test(`interfaz Gmail: ${rol} no ve canales retirados ni botones para históricas`, async t => {
    const empresa = { _id: id, nombre: 'Empresa', estado: 'activa', automatizaciones: { email: { habilitada: true }, whatsapp: { habilitada: true }, facebook: { habilitada: true } } };
    const { cliente } = crearContexto(t, { _id: id, nombre: 'Persona', email: 'persona@example.test', rol, empresa: { _id: id, nombre: 'Empresa' } });
    t.mock.method(Campana.collection, 'find', () => ({ toArray: async () => campanas }));
    t.mock.method(Campana.collection, 'findOne', async filtro => campanas.find(doc => doc._id.equals(filtro._id)));
    t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [contacto] }));
    t.mock.method(Contacto.collection, 'findOne', async () => contacto);
    t.mock.method(Empresa.collection, 'find', () => ({ toArray: async () => [empresa] }));
    t.mock.method(Empresa.collection, 'findOne', async () => empresa);
    t.mock.method(require('../services/empresaService'), 'obtenerPanel', async () => ({ empresa, campanas, usuarios: [], operadores: [], totalUsuarios: 0, totalCampanas: 2 }));
    t.mock.method(require('../services/adminService'), 'obtenerDashboard', async () => ({ totales: { empresas: 1, usuarios: 1, campanas: 2 }, empresas: [], usuariosSinEmpresa: [], usuariosEmpresaInexistente: [], campanasSinEmpresa: campanas }));
    t.mock.method(require('../services/adminService'), 'obtenerDetalleEmpresa', async () => ({ empresa, campanas, usuarios: [] }));
    const rutas = ['/', '/panel', '/campanas', '/campanas/nueva', `/campanas/${id}`, `/campanas/${id}/editar`, `/campanas/${historicaId}`, `/campanas/${historicaId}/editar`, '/contactos', '/contactos/nuevo', `/contactos/${id}`, `/contactos/${id}/editar`];
    if (rol === 'superadmin') rutas.push(`/admin/empresas/${id}`, `/admin/empresas/${id}/automatizaciones`);
    for (const ruta of rutas) {
      const respuesta = await cliente.get(ruta).expect(200);
      assert.doesNotMatch(respuesta.text, /whatsapp|facebook|linkedin|\bsms\b|redes_sociales|redes sociales|otros canales|value="otro"/i, ruta);
      assert.ok(!respuesta.text.includes('<select id="canal"'), ruta);
      assert.ok(!respuesta.text.includes(`action="/campanas/${historicaId}/ejecutar"`), ruta);
      if (ruta.includes(String(historicaId)) || ruta === '/campanas' || ruta === '/panel') assert.match(respuesta.text, /Canal descontinuado/);
    }
  });
}
