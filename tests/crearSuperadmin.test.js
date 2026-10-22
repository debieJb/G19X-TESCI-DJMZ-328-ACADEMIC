
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Usuario = require('../models/Usuario');
const { crearSuperadmin } = require('../scripts/crearSuperadmin');

// Datos exclusivos para pruebas simuladas.
const env = {
  SUPERADMIN_NOMBRE: ' Persona ',
  SUPERADMIN_EMAIL: ' PERSONA@EXAMPLE.TEST ',
  SUPERADMIN_PASSWORD: 'contraseña-de-prueba'
};

let desconectar;
let conectar;
let insertado;
let existe;

// Preparación independiente para cada prueba.
beforeEach((t) => {
  process.env.MONGODB_URI =
    'mongodb://localhost/base-exclusiva-pruebas-sin-conexion';

  conectar = t.mock.method(
    mongoose,
    'connect',
    async () => {}
  );

  desconectar = t.mock.method(
    mongoose,
    'disconnect',
    async () => {}
  );

  t.mock.method(
    Usuario,
    'init',
    async () => {}
  );

  existe = t.mock.method(
    Usuario,
    'exists',
    async (filtro) => {
      assert.deepEqual(filtro, {
        email: 'persona@example.test'
      });

      return null;
    }
  );

  insertado = null;

  t.mock.method(
    Usuario.collection,
    'insertOne',
    async (datos) => {
      insertado = { ...datos };

      return {
        insertedId: datos._id
      };
    }
  );
});

// PRUEBA 1: creación correcta del superadministrador.
test(
  'superadmin: crea usuario activo, con hash, rol fijo y sin empresa',
  async () => {
    const resultado = await crearSuperadmin(env);

    assert.deepEqual(resultado, {
      creado: true
    });

    assert.ok(insertado);

    assert.equal(
      insertado.nombre,
      'Persona'
    );

    assert.equal(
      insertado.email,
      'persona@example.test'
    );

    assert.equal(
      insertado.rol,
      'superadmin'
    );

    // El superadministrador inicial debe quedar activo.
    assert.equal(
      insertado.estadoAcceso,
      'activo'
    );

    // El superadministrador no pertenece a una empresa.
    assert.equal(
      insertado.empresa,
      undefined
    );

    // La contraseña nunca debe almacenarse en texto plano.
    assert.notEqual(
      insertado.password,
      env.SUPERADMIN_PASSWORD
    );

    // Comprobar que bcrypt reconoce la contraseña original.
    assert.equal(
      await bcrypt.compare(
        env.SUPERADMIN_PASSWORD,
        insertado.password
      ),
      true
    );

    assert.equal(
      desconectar.mock.callCount(),
      1
    );
  }
);

// PRUEBA 2: impedir sobrescritura de usuarios existentes.
test(
  'superadmin: no sobrescribe usuario existente',
  async () => {
    existe.mock.mockImplementation(
      async () => ({
        _id: 'existente'
      })
    );

    const resultado = await crearSuperadmin(env);

    assert.deepEqual(resultado, {
      creado: false
    });

    assert.equal(insertado, null);

    assert.equal(
      desconectar.mock.callCount(),
      1
    );
  }
);

// PRUEBA 3: validar variables obligatorias.
test(
  'superadmin: exige las tres variables antes de conectar',
  async () => {
    for (const campo of Object.keys(env)) {
      await assert.rejects(
        crearSuperadmin({
          ...env,
          [campo]: ''
        }),
        new RegExp(campo)
      );
    }

    assert.equal(
      conectar.mock.callCount(),
      0
    );

    assert.equal(
      desconectar.mock.callCount(),
      3
    );
  }
);

// PRUEBA 4: manejo de errores de conexión.
test(
  'superadmin: cierra conexión ante fallo de MongoDB',
  async () => {
    conectar.mock.mockImplementation(
      async () => {
        throw new Error('No disponible');
      }
    );

    await assert.rejects(
      crearSuperadmin(env),
      /No disponible/
    );

    assert.equal(
      desconectar.mock.callCount(),
      1
    );
  }
);

// PRUEBA 5: evitar duplicados concurrentes.
test(
  'superadmin: duplicado concurrente no sobrescribe y desconecta',
  async (t) => {
    t.mock.method(
      Usuario,
      'create',
      async () => {
        throw Object.assign(
          new Error('Duplicado'),
          { code: 11000 }
        );
      }
    );

    const resultado = await crearSuperadmin(env);

    assert.deepEqual(resultado, {
      creado: false
    });

    assert.equal(
      desconectar.mock.callCount(),
      1
    );
  }
);
