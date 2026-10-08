const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const Campana = require('../models/Campana');
const adminService = require('../services/adminService');
const id = new mongoose.Types.ObjectId();
const vacia = new mongoose.Types.ObjectId();
const autor = new mongoose.Types.ObjectId();

const consulta = (filas, seleccionEsperada) => ({ select: seleccion => {
  assert.equal(seleccion, seleccionEsperada);
  return { sort: () => ({ lean: async () => filas }) };
} });

test('adminService: conteos por empresa, agrupaciones, ceros y recursos sin empresa sin escrituras', async t => {
  const empresas = [{ _id: id, nombre: 'Con recursos' }, { _id: vacia, nombre: 'Vacía' }];
  const usuarios = [
    { nombre: 'Asignado', empresa: id, rol: 'operador' },
    { nombre: 'Superadmin', rol: 'superadmin' },
    { nombre: 'Sin empresa', empresa: null, rol: 'operador' },
    { nombre: 'Referencia huérfana', empresa: new mongoose.Types.ObjectId() }
  ];
  const antiguas = [{ nombre: 'Antigua sin campo' }, { nombre: 'Antigua null', empresa: null }];
  const copia = JSON.stringify({ usuarios, antiguas });
  t.mock.method(Empresa, 'find', () => consulta(empresas, 'nombre estado'));
  t.mock.method(Usuario, 'find', () => consulta(usuarios, 'nombre email rol empresa'));
  t.mock.method(Campana, 'find', filtro => { assert.deepEqual(filtro, { empresa: null }); return consulta(antiguas, 'nombre canal estado'); });
  for (const [modelo, cantidad] of [[Empresa, 2], [Usuario, 4], [Campana, 5]]) t.mock.method(modelo, 'countDocuments', async () => cantidad);
  for (const [modelo, cantidad] of [[Usuario, 1], [Campana, 3]]) t.mock.method(modelo, 'aggregate', async pipeline => {
    assert.deepEqual(pipeline, [{ $group: { _id: '$empresa', total: { $sum: 1 } } }]);
    return [{ _id: id, total: cantidad }, { _id: null, total: 2 }];
  });
  for (const modelo of [Empresa, Usuario, Campana]) for (const metodo of ['create', 'updateMany', 'updateOne']) {
    t.mock.method(modelo, metodo, () => { throw new Error('Una consulta administrativa no debe escribir'); });
  }
  const datos = await adminService.obtenerDashboard();
  assert.deepEqual(datos.totales, { empresas: 2, usuarios: 4, campanas: 5 });
  assert.equal(datos.empresas[0].totalUsuarios, 1); assert.equal(datos.empresas[0].totalCampanas, 3);
  assert.equal(datos.empresas[1].totalUsuarios, 0); assert.equal(datos.empresas[1].totalCampanas, 0);
  assert.deepEqual(datos.empresas[0].usuarios, [usuarios[0]]);
  assert.deepEqual(datos.empresas[1].usuarios, []);
  assert.deepEqual(datos.usuariosSinEmpresa, usuarios.slice(1, 3));
  assert.deepEqual(datos.usuariosEmpresaInexistente, [usuarios[3]]);
  assert.deepEqual(datos.campanasSinEmpresa, antiguas);
  assert.equal(JSON.stringify({ usuarios, antiguas }), copia);
});

test('adminService: empresa inexistente no consulta usuarios ni campañas', async t => {
  t.mock.method(Empresa, 'findById', () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(Usuario, 'find', () => { throw new Error('Consulta inesperada'); });
  t.mock.method(Campana, 'find', () => { throw new Error('Consulta inesperada'); });
  assert.equal(await adminService.obtenerDetalleEmpresa(String(id)), null);
});

test('adminService: detalle usa filtros, proyecciones y populate real tolerante a autores eliminados', async t => {
  t.mock.method(Empresa.collection, 'findOne', async (filtro, opciones) => {
    assert.ok(filtro._id.equals(id));
    assert.deepEqual(opciones.projection, { nombre: 1, estado: 1, fechaRegistro: 1, 'automatizaciones.email.habilitada': 1 });
    return { _id: id, nombre: 'Empresa', estado: 'activa' };
  });
  t.mock.method(Campana.collection, 'find', (filtro, opciones) => {
    assert.ok(filtro.empresa.equals(id));
    assert.deepEqual(opciones.projection, { nombre: 1, canal: 1, estado: 1, creadoPor: 1 });
    return { toArray: async () => [
      { _id: new mongoose.Types.ObjectId(), nombre: 'Con autor', creadoPor: autor },
      { _id: new mongoose.Types.ObjectId(), nombre: 'Eliminado', creadoPor: new mongoose.Types.ObjectId() },
      { _id: new mongoose.Types.ObjectId(), nombre: 'Ausente' },
      { _id: new mongoose.Types.ObjectId(), nombre: 'Null', creadoPor: null }
    ] };
  });
  t.mock.method(Usuario.collection, 'find', (filtro, opciones) => {
    if (filtro.empresa) {
      assert.ok(filtro.empresa.equals(id));
      assert.deepEqual(opciones.projection, { nombre: 1, email: 1, rol: 1 });
      return { toArray: async () => [{ _id: autor, nombre: 'Autor', rol: 'operador' }] };
    }
    assert.deepEqual(opciones.projection, { nombre: 1 });
    return { toArray: async () => [{ _id: autor, nombre: 'Autor' }] };
  });
  const datos = await adminService.obtenerDetalleEmpresa(String(id));
  assert.equal(datos.usuarios[0].nombre, 'Autor');
  assert.equal(datos.campanas[0].creadoPor.nombre, 'Autor');
  assert.equal(datos.campanas[1].creadoPor, null);
  assert.equal(datos.campanas[2].creadoPor, undefined);
  assert.equal(datos.campanas[3].creadoPor, null);
});
