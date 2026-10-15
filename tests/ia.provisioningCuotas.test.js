'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  DB, BOOTSTRAP, RUNTIME, MAINTENANCE, MAINTENANCE_SHUTDOWN, FIXTURE_ID, FIXTURE_COMPANY,
  validatePassword, passwordValidationIssue, assertInventory, inspectInventory, runProvisioning
} = require('../scripts/ia/cuotasProvisioningCore');
const { leerSecretoOculto } = require('../scripts/ia/entradaSecreta');
const { targetByName } = require('../scripts/ia/quotaTarget');

class FakeObjectId {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}

function fixture() {
  return {
    _id: new FakeObjectId(FIXTURE_ID), empresa: new FakeObjectId(FIXTURE_COMPANY), ventana: 'prueba:1', cantidad: 1,
    expiraEn: new Date('2099-01-01T00:00:00.000Z'), _pruebaInfraestructura: true
  };
}

class FakeMongoClient {
  static state;
  constructor(uri, options = {}) { this.uri = uri; this.options = options; this.connected = false; FakeMongoClient.state.connectionUris.push(uri); }
  async connect() {
    const { state } = FakeMongoClient;
    if (this.options.auth) state.authConnections++;
    else state.unauthConnections++;
    if (this.options.auth) {
      const { username, password } = this.options.auth;
      const user = state.users.find(u => u.user === username && u.db === (this.options.authSource || 'admin'));
      if (!user || password !== state.passwords[username]) {
        throw Object.assign(new Error('SENSITIVE DRIVER MESSAGE MUST NOT BE LOGGED'), { code: 18, codeName: 'AuthenticationFailed' });
      }
    }
    this.connected = true;
    return this;
  }
  db(name) { return new FakeDb(FakeMongoClient.state, name); }
  async close() { this.connected = false; }
}

class FakeDb {
  constructor(state, name) { this.state = state; this.databaseName = name; }
  async command(command) {
    const s = this.state;
    s.inventoryCommands.push({ database: this.databaseName, command: structuredClone(command) });
    if (Object.hasOwn(command, 'forAllDBs')) {
      throw Object.assign(new Error('IDL unknown field'), { code: 40415, codeName: 'IDLUnknownField' });
    }
    if (command.getCmdLineOpts) return { parsed: {
      net: { port: s.target.port, bindIp: s.target.bindIp }, security: { authorization: 'enabled' },
      storage: { dbPath: `${s.target.root}\\data` }
    } };
    if (command.buildInfo) return { version: '8.2.6' };
    if (command.ping) return { ok: 1 };
    if (command.listDatabases) return { databases: ['admin', 'config', 'local', ...(s.collectionExists || s.roles.length || s.users.some(u => u.db === DB) ? [DB] : []), ...(s.extraDatabase ? [s.extraDatabase] : [])].map(name => ({ name })) };
    if (command.usersInfo?.forAllDBs === true) return { users: [...s.users] };
    if (command.rolesInfo === 1) return { roles: s.roles.filter(r => r.db === this.databaseName) };
    if (command.createUser) {
      s.createUserAttempts++;
      if (this.databaseName === 'admin' && s.users.length > 0 && !this.state.allowRootUpdate) {
        throw Object.assign(new Error('unauthorized private detail'), { code: 13, codeName: 'Unauthorized' });
      }
      s.users.push({ user: command.createUser, db: this.databaseName, roles: command.roles });
      s.passwords[command.createUser] = command.pwd;
      return { ok: 1 };
    }
    if (command.createRole) {
      s.roles.push({ role: command.createRole, db: this.databaseName, privileges: command.privileges, roles: command.roles });
      return { ok: 1 };
    }
    if (command.dropUser) {
      s.users = s.users.filter(u => !(u.user === command.dropUser && u.db === this.databaseName));
      delete s.passwords[command.dropUser];
      return { ok: 1 };
    }
    throw new Error('Unexpected fake command');
  }
  listCollections() {
    const s = this.state;
    return { toArray: async () => this.databaseName === DB && s.collectionExists
      ? [{ name: 'usoias' }, ...(s.unexpectedCollection ? [{ name: 'unexpected' }] : [])] : [] };
  }
  async createCollection(name) { assert.equal(name, 'usoias'); this.state.collectionExists = true; return { collectionName: name }; }
  collection(name) { assert.equal(name, 'usoias'); return new FakeCollection(this.state); }
}

class FakeCollection {
  constructor(state) { this.state = state; }
  async indexes() { return [{ name: '_id_', key: { _id: 1 }, unique: true }, ...this.state.indexes]; }
  find() { return { limit: () => ({ toArray: async () => [...this.state.documents] }) }; }
  async createIndex(key, options) { this.state.indexes.push({ name: options.name, key, ...options }); return options.name; }
  async insertOne(doc) { this.state.documents.push(doc); this.state.collectionExists = true; return { acknowledged: true }; }
}

function fakeState({ users = [], allowRoot = true, collectionExists = true, unexpectedCollection = false, unexpectedDocument = false, extraDatabase = null } = {}) {
  const state = { users: [...users], passwords: {}, roles: [], collectionExists, indexes: [], documents: [], allowRootUpdate: false, authConnections: 0, unauthConnections: 0, createUserAttempts: 0, target: targetByName('legacy'), connectionUris: [], inventoryCommands: [] };
  for (const user of users) state.passwords[user.user] = 'B'.repeat(28);
  if (unexpectedCollection) state.unexpectedCollection = true;
  if (unexpectedDocument) state.documents.push({ _id: new FakeObjectId('64b000000000000000000099'), PII: 'not emitted by tests' });
  if (extraDatabase) state.extraDatabase = extraDatabase;
  state.allowFirstUser = allowRoot;
  FakeMongoClient.state = state;
  return state;
}

function promptQueue(values) {
  let index = 0;
  return async () => values[index++];
}

test('prompt TTY captures pasted ASCII bytes without echo and restores normal mode', async () => {
  class Input extends EventEmitter {
    isTTY = true;
    isRaw = false;
    setRawMode(value) { this.isRaw = value; }
    resume() {}
    pause() {}
  }
  const input = new Input();
  let output = '';
  const promise = leerSecretoOculto('Hidden: ', { input, output: { write: text => { output += text; } } });
  input.emit('data', Buffer.from('Ax\bB'));
  input.emit('data', Buffer.from('\r'));
  assert.equal(await promise, 'AB');
  assert.equal(output, 'Hidden: \n');
  assert.equal(input.isRaw, false);
});

test('validates 24, 28 and 32 characters and classifies invalid input without exposing it', () => {
  for (const length of [24, 28, 32]) {
    assert.equal(validatePassword('A'.repeat(length)), true);
    assert.equal(passwordValidationIssue('A'.repeat(length)), null);
  }
  assert.equal(passwordValidationIssue(''), 'PASSWORD_POLICY_EMPTY');
  assert.equal(passwordValidationIssue('A'.repeat(23)), 'PASSWORD_POLICY_TOO_SHORT');
  assert.equal(passwordValidationIssue('A'.repeat(24) + '!'), 'PASSWORD_POLICY_CHARACTERS');
  assert.equal(passwordValidationIssue('A'.repeat(24) + '\n'), 'PASSWORD_POLICY_CHARACTERS');
  assert.equal(validatePassword('A'.repeat(24) + '!'), false);
});

test('fallo de política informa solo categoría y etapa, nunca los caracteres introducidos', async () => {
  for (const [value, code] of [
    ['', 'PASSWORD_POLICY_EMPTY'],
    ['S'.repeat(23), 'PASSWORD_POLICY_TOO_SHORT'],
    ['C'.repeat(24) + '!', 'PASSWORD_POLICY_CHARACTERS']
  ]) {
    const output = [];
    await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
      prompt: promptQueue([value]), log: message => output.push(message) }));
    assert.match(output[0], new RegExp(`stage=input-bootstrap code=${code}`));
    assert.doesNotMatch(output.join('\n'), /S{8}|C{8}|!/);
  }
});
test('inventario detiene antes de cambios ante usuario administrativo desconocido o datos extra', () => {
  const base = { users: [], databases: ['admin', 'local', DB], collections: [], indexes: [], documents: [], customRoles: [] };
  for (const [inventory, expectedCode] of [
    [{ ...base, users: [{ user: 'otherAdmin', db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] }, 'UNEXPECTED_USER_OR_ROLE'],
    [{ ...base, collections: ['usoias', 'clientes'] }, 'UNEXPECTED_COLLECTION'],
    [{ ...base, databases: ['admin', 'local', DB, 'marketing_automation'] }, 'UNEXPECTED_DATABASE'],
    [{ ...base, documents: [{ _id: 'unexpected' }] }, 'UNEXPECTED_DATA']
  ]) assert.throws(() => assertInventory(inventory), error => error.code === expectedCode);
});

test('inventario admite config interna de MongoDB pero conserva rechazo de cualquier base desconocida', () => {
  const base = { users: [], databases: ['admin', 'config', 'local', DB], collections: [], indexes: [], documents: [], customRoles: [] };
  assert.doesNotThrow(() => assertInventory(base));
  for (const unknown of ['marketing_automation', 'otra_base', 'test']) {
    assert.throws(() => assertInventory({ ...base, databases: [...base.databases, unknown] }),
      error => error.code === 'UNEXPECTED_DATABASE' && error.resource === unknown);
  }
});

test('fallo de autenticación y excepción localhost cerrada informan etapa/código sin mensaje sensible ni escrituras', async () => {
  const state = fakeState({ users: [{ user: 'otherAdmin', db: 'admin', roles: [{ role: 'root', db: 'admin' }] }], allowRoot: false });
  const output = [];
  await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['A'.repeat(28)]), mode: 'initial', log: message => output.push(message) }));
  assert.match(output[0], /stage=bootstrap-first-user code=Unauthorized mongoCode=13/);
  assert.doesNotMatch(output.join('\n'), /SENSITIVE DRIVER MESSAGE|A{8}/);
  assert.equal(state.users.length, 1);
  assert.equal(state.roles.length, 0);
});

test('inventario usa sintaxis admitida por MongoDB 8.2.6 y detecta regresión IDLUnknownField 40415', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] });
  const client = new FakeMongoClient('mongodb://127.0.0.1:27019/admin');
  const inventory = await inspectInventory(client, FakeObjectId);
  assert.equal(inventory.users.length, 1);
  const usersCommand = state.inventoryCommands.find(x => x.command.usersInfo);
  assert.deepEqual(usersCommand.command, { usersInfo: { forAllDBs: true }, showCredentials: false });
  assert.equal(Object.hasOwn(usersCommand.command, 'forAllDBs'), false);
  assert.deepEqual(state.inventoryCommands.filter(x => x.command.rolesInfo).map(x => x.database), ['admin', DB]);
  assert.ok(state.inventoryCommands.filter(x => x.command.rolesInfo).every(x => !Object.hasOwn(x.command, 'forAllDBs')));
  await assert.rejects(client.db('admin').command({ usersInfo: 1, forAllDBs: true }), error =>
    error.code === 40415 && error.codeName === 'IDLUnknownField');
  await assert.rejects(client.db('admin').command({ rolesInfo: 1, forAllDBs: true }), error =>
    error.code === 40415 && error.codeName === 'IDLUnknownField');
});

test('una contraseña incorrecta de bootstrap no crea, reemplaza ni borra cuentas existentes', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] });
  const original = { ...state.users[0] };
  const output = [];
  await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['Z'.repeat(28)]), mode: 'recovery', log: message => output.push(message) }));
  assert.deepEqual(state.users, [original]);
  assert.equal(state.roles.length, 0);
  assert.match(output[0], /stage=bootstrap-auth code=BOOTSTRAP_AUTHENTICATION_FAILED mongoCode=18/);
  assert.equal(state.authConnections, 1);
  assert.equal(state.unauthConnections, 0);
  assert.equal(state.createUserAttempts, 0);
  assert.doesNotMatch(output.join('\n'), /SENSITIVE DRIVER MESSAGE|Z{8}/);
});

test('recuperación del perfil Gemini autentica solo en 27020 y nunca crea bootstrap si falla', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] });
  state.target = targetByName('gemini');
  const output = [];
  await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['G'.repeat(28)]), mode: 'recovery', target: 'gemini', log: message => output.push(message) }));
  assert.equal(state.authConnections, 1);
  assert.equal(state.unauthConnections, 0);
  assert.equal(state.createUserAttempts, 0);
  assert.ok(state.connectionUris.every(uri => uri.startsWith('mongodb://127.0.0.1:27020/')));
  assert.match(output[0], /BOOTSTRAP_AUTHENTICATION_FAILED/);
});

test('recuperación completa un estado parcial esperado y elimina bootstrap solo después de verificarlo', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] });
  state.passwords[BOOTSTRAP] = 'A'.repeat(28);
  state.roles.push({ role: RUNTIME, db: DB,
    privileges: [{ resource: { db: DB, collection: 'usoias' }, actions: ['find', 'insert', 'listIndexes', 'update'] }], roles: [] });
  const output = [];
  const values = ['A'.repeat(28), 'B'.repeat(28), 'C'.repeat(28)];
  const result = await runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(values), mode: 'recovery', log: message => output.push(message) });
  assert.equal(result.completed, true);
  assert.equal(state.collectionExists, true);
  assert.equal(state.indexes.length, 2);
  assert.equal(state.documents.length, 1);
  assert.deepEqual(state.users.map(u => `${u.db}.${u.user}`).sort(), [`${DB}.${MAINTENANCE}`, `${DB}.${RUNTIME}`].sort());
  assert.deepEqual(state.roles.map(r => `${r.db}.${r.role}`).sort(), [
    `${DB}.${RUNTIME}`, `${DB}.${MAINTENANCE}`, `admin.${MAINTENANCE_SHUTDOWN}`
  ].sort());
  const maintenanceRole = state.roles.find(r => r.role === MAINTENANCE);
  assert.deepEqual(maintenanceRole.privileges, []);
  assert.deepEqual(maintenanceRole.roles, [{ role: 'dbOwner', db: DB }]);
  const shutdownRole = state.roles.find(r => r.role === MAINTENANCE_SHUTDOWN);
  assert.equal(shutdownRole.db, 'admin');
  assert.deepEqual(shutdownRole.privileges, [{ resource: { cluster: true }, actions: ['shutdown'] }]);
  assert.deepEqual(shutdownRole.roles, []);
  const maintenanceUser = state.users.find(u => u.user === MAINTENANCE);
  assert.deepEqual(maintenanceUser.roles, [
    { role: MAINTENANCE, db: DB }, { role: MAINTENANCE_SHUTDOWN, db: 'admin' }
  ]);
  assert.match(output.at(-1), /APROVISIONAMIENTO_OK stage=complete/);
  assert.ok(state.inventoryCommands.some(x => x.database === 'admin' && x.command.createRole === MAINTENANCE_SHUTDOWN));
  assert.ok(state.inventoryCommands.every(x => !(x.database !== 'admin' && x.command.createRole === MAINTENANCE_SHUTDOWN)));
});

test('shutdown cluster privilege se define solo en admin y sin herencia en el rol global', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] });
  state.passwords[BOOTSTRAP] = 'A'.repeat(28);
  await runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['A'.repeat(28), 'B'.repeat(28), 'C'.repeat(28)]), mode: 'recovery', log: () => {} });
  const createRoleCommands = state.inventoryCommands.filter(x => x.command.createRole);
  const invalidScopedRole = createRoleCommands.find(x => x.database === DB
    && (x.command.privileges || []).some(p => p.resource?.cluster === true));
  assert.equal(invalidScopedRole, undefined);
  const shutdownCommand = createRoleCommands.find(x => x.command.createRole === MAINTENANCE_SHUTDOWN);
  assert.equal(shutdownCommand.database, 'admin');
  assert.deepEqual(shutdownCommand.command, {
    createRole: MAINTENANCE_SHUTDOWN,
    privileges: [{ resource: { cluster: true }, actions: ['shutdown'] }],
    roles: []
  });
});

test('recuperacion rechaza definiciones antiguas o amplias antes de crear objetos', async () => {
  const bootstrap = { user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] };
  for (const invalidRole of [
    { role: MAINTENANCE, db: DB, privileges: [{ resource: { cluster: true }, actions: ['shutdown'] }], roles: [{ role: 'dbOwner', db: DB }] },
    { role: MAINTENANCE_SHUTDOWN, db: 'admin', privileges: [{ resource: { cluster: true }, actions: ['shutdown'] }], roles: [{ role: 'root', db: 'admin' }] }
  ]) {
    const state = fakeState({ users: [bootstrap], collectionExists: false });
    state.passwords[BOOTSTRAP] = 'A'.repeat(28);
    state.roles.push(invalidRole);
    const originalRoles = structuredClone(state.roles);
    await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
      prompt: promptQueue(['A'.repeat(28), 'B'.repeat(28), 'C'.repeat(28)]), mode: 'recovery', log: () => {} }),
    error => error.code === 'UNEXPECTED_CUSTOM_ROLE');
    assert.deepEqual(state.roles, originalRoles);
    assert.equal(state.collectionExists, false);
    assert.equal(state.createUserAttempts, 0);
  }
});

test('aprovisionamiento inicial usa localhost exception solo para crear el primer bootstrap', async () => {
  const state = fakeState({ users: [], collectionExists: false });
  const output = [];
  const result = await runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['A'.repeat(28), 'B'.repeat(28), 'C'.repeat(28)]), mode: 'initial', log: message => output.push(message) });
  assert.equal(result.completed, true);
  assert.deepEqual(state.users.map(u => `${u.db}.${u.user}`).sort(), [`${DB}.${MAINTENANCE}`, `${DB}.${RUNTIME}`].sort());
  assert.match(output.at(-1), /APROVISIONAMIENTO_OK stage=complete/);
});

test('el perfil Gemini solo dirige el aprovisionamiento nuevo a 127.0.0.1:27020 y su dbPath independiente', async () => {
  const state = fakeState({ users: [], collectionExists: false });
  state.target = targetByName('gemini');
  const result = await runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['D'.repeat(28), 'E'.repeat(28), 'F'.repeat(28)]), mode: 'initial', target: 'gemini', log: () => {} });
  assert.equal(result.completed, true);
  assert.ok(state.connectionUris.length > 0);
  assert.ok(state.connectionUris.every(uri => uri.startsWith('mongodb://127.0.0.1:27020/')));
  assert.equal(targetByName('gemini').root, 'C:\\Users\\jocam\\Documents\\marketing-automation-cuota-mongo-gemini');
  assert.throws(() => targetByName('27017'));
  assert.throws(() => targetByName('../legacy'));
});

test('autenticación válida pero inventario inesperado detiene la recuperación sin mutar ni borrar usuarios', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }], unexpectedDocument: true });
  state.passwords[BOOTSTRAP] = 'A'.repeat(28);
  const output = [];
  await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['A'.repeat(28)]), mode: 'recovery', log: message => output.push(message) }));
  assert.equal(state.users.length, 1);
  assert.equal(state.roles.length, 0);
  assert.deepEqual(state.documents[0]._id.toString(), '64b000000000000000000099');
  assert.match(output[0], /stage=inventory code=UNEXPECTED_DATA/);
});

test('base desconocida se reporta por nombre y detiene antes de cualquier escritura', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }], collectionExists: false, extraDatabase: 'unexpected_app_db' });
  state.target = targetByName('gemini');
  state.passwords[BOOTSTRAP] = 'A'.repeat(28);
  const output = [];
  await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['A'.repeat(28)]), mode: 'recovery', target: 'gemini', log: message => output.push(message) }));
  assert.equal(state.users.length, 1);
  assert.equal(state.roles.length, 0);
  assert.equal(state.collectionExists, false);
  assert.equal(state.createUserAttempts, 0);
  assert.match(output[0], /code=UNEXPECTED_DATABASE database=unexpected_app_db/);
});

test('initial setup rejects an existing bootstrap and directs to recovery without mutation', async () => {
  const state = fakeState({ users: [{ user: BOOTSTRAP, db: 'admin', roles: [{ role: 'root', db: 'admin' }] }] });
  state.passwords[BOOTSTRAP] = 'A'.repeat(28);
  const output = [];
  await assert.rejects(runProvisioning({ MongoClient: FakeMongoClient, ObjectId: FakeObjectId,
    prompt: promptQueue(['A'.repeat(28)]), mode: 'initial', log: message => output.push(message) }),
  error => error.code === 'INSTANCE_ALREADY_INITIALIZED_USE_RECOVERY');
  assert.equal(state.users.length, 1);
  assert.equal(state.roles.length, 0);
  assert.equal(state.collectionExists, true);
  assert.match(output[0], /stage=initial-preflight code=INSTANCE_ALREADY_INITIALIZED_USE_RECOVERY/);
});
