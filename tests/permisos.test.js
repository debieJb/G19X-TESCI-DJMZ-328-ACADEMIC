const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { ROLES, puede } = require('../services/permisos');
const empresa = new mongoose.Types.ObjectId();
const otraEmpresa = new mongoose.Types.ObjectId();
const campanas = ['campanas.crear', 'campanas.consultar', 'campanas.editar', 'campanas.ejecutar'];
const acciones = [...campanas, 'campanas.eliminar', 'usuarios.administrar', 'empresas.administrar'];

test('permisos: roles exactos y superadmin con acceso global sin empresa', () => {
  assert.deepEqual(ROLES, ['superadmin', 'admin_empresa', 'operador']);
  for (const accion of acciones) {
    for (const destino of [empresa, otraEmpresa, undefined]) assert.equal(puede({ rol: 'superadmin' }, accion, destino), true);
  }
});

test('permisos: matriz por rol y aislamiento entre empresas', () => {
  for (const rol of ['admin_empresa', 'operador']) {
    for (const accion of acciones) {
      const esperado = campanas.includes(accion) || (rol === 'admin_empresa' && ['campanas.eliminar', 'usuarios.administrar'].includes(accion));
      assert.equal(puede({ rol, empresa }, accion, empresa), esperado, `${rol}: ${accion}`);
      assert.equal(puede({ rol, empresa }, accion, otraEmpresa), false);
      assert.equal(puede({ rol, empresa }, accion), false);
      assert.equal(puede({ rol }, accion), false);
    }
  }
});

test('permisos: referencias como ObjectId, texto y documento poblado', () => {
  for (const origen of [empresa, empresa.toHexString().toUpperCase(), { _id: empresa }]) {
    for (const destino of [empresa, empresa.toHexString(), { _id: empresa }]) {
      assert.equal(puede({ rol: 'operador', empresa: origen }, 'campanas.editar', destino), true);
    }
  }
});

test('permisos: deniega usuarios, acciones y empresas inválidos', () => {
  for (const usuario of [undefined, null, {}, { rol: 'admin', empresa }]) {
    assert.equal(puede(usuario, 'campanas.consultar', empresa), false);
  }
  for (const accion of [undefined, 'desconocida', 'toString']) assert.equal(puede({ rol: 'superadmin' }, accion, empresa), false);
  for (const valor of [undefined, null, '', 'inválida', {}]) {
    assert.equal(puede({ rol: 'operador', empresa: valor }, 'campanas.consultar', valor), false);
  }
});
