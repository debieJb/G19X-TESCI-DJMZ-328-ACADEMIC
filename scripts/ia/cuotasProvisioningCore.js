'use strict';

const DB = 'plurione_ai_quota';
const BOOTSTRAP = 'plurione_quota_bootstrap';
const RUNTIME = 'plurione_ia_quota_runtime';
const MAINTENANCE = 'plurione_ia_quota_maintenance';
const MAINTENANCE_SHUTDOWN = 'plurione_ia_quota_shutdown';
const FIXTURE_ID = '64b000000000000000000002';
const FIXTURE_COMPANY = '64b000000000000000000001';
const FIXTURE_EXPIRY = '2099-01-01T00:00:00.000Z';
const DISALLOWED_PASSWORD_CHAR = /[^A-Za-z0-9._~-]/;
const { targetByName } = require('./quotaTarget');

class ProvisioningFailure extends Error {
  constructor(stage, code, mongoCode = null, resource = null) {
    super('PROVISIONING_FAILURE');
    this.stage = stage;
    this.code = code;
    this.mongoCode = Number.isInteger(mongoCode) ? mongoCode : null;
    this.resource = typeof resource === 'string' && /^[A-Za-z0-9_-]{1,63}$/.test(resource) ? resource : null;
  }
}

function passwordValidationIssue(password) {
  if (typeof password !== 'string' || password.length === 0) return 'PASSWORD_POLICY_EMPTY';
  if (password.length < 24) return 'PASSWORD_POLICY_TOO_SHORT';
  if (DISALLOWED_PASSWORD_CHAR.test(password)) return 'PASSWORD_POLICY_CHARACTERS';
  return null;
}

function validatePassword(password) {
  return passwordValidationIssue(password) === null;
}

function codeName(error) {
  const name = typeof error?.codeName === 'string' ? error.codeName : '';
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : null;
}

function knownUserKey(user) {
  return `${user.db}.${user.user}`;
}

function sameRoleSet(actual, expected) {
  const normalize = roles => (roles || []).map(r => `${r.role}@${r.db}`).sort();
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
}

function assertInventory(inventory) {
  const allowedUsers = new Map([
    [`admin.${BOOTSTRAP}`, [{ role: 'root', db: 'admin' }]],
    [`${DB}.${RUNTIME}`, [{ role: RUNTIME, db: DB }]],
    [`${DB}.${MAINTENANCE}`, [{ role: MAINTENANCE, db: DB }, { role: MAINTENANCE_SHUTDOWN, db: 'admin' }]]
  ]);
  for (const user of inventory.users || []) {
    const key = knownUserKey(user);
    const expected = allowedUsers.get(key);
    if (!expected || !sameRoleSet(user.roles, expected)) {
      throw new ProvisioningFailure('inventory', 'UNEXPECTED_USER_OR_ROLE');
    }
  }
  // MongoDB may create config.system.sessions for session support even on a standalone.
  // Keep the remaining application database allowlist exact; unknown names still fail closed.
  const allowedDatabases = new Set(['admin', 'config', 'local', DB]);
  const unexpectedDatabase = (inventory.databases || []).find(name => !allowedDatabases.has(name));
  if (unexpectedDatabase) {
    throw new ProvisioningFailure('inventory', 'UNEXPECTED_DATABASE', null, unexpectedDatabase);
  }
  if ((inventory.collections || []).some(name => name !== 'usoias')) {
    throw new ProvisioningFailure('inventory', 'UNEXPECTED_COLLECTION');
  }
  const expectedIndexes = {
    _id_: { key: { _id: 1 } },
    empresa_1_ventana_1: { key: { empresa: 1, ventana: 1 }, unique: true },
    expiraEn_1: { key: { expiraEn: 1 }, expireAfterSeconds: 0 }
  };
  for (const index of inventory.indexes || []) {
    const expected = expectedIndexes[index.name];
    if (!expected || JSON.stringify(index.key) !== JSON.stringify(expected.key)
      || (expected.unique && index.unique !== true)
      || (expected.expireAfterSeconds !== undefined && index.expireAfterSeconds !== 0)) {
      throw new ProvisioningFailure('inventory', 'UNEXPECTED_INDEX');
    }
  }
  if ((inventory.documents || []).length > 1) {
    throw new ProvisioningFailure('inventory', 'UNEXPECTED_DATA');
  }
  if (inventory.documents?.length === 1) {
    const d = inventory.documents[0];
    if (String(d._id) !== FIXTURE_ID || String(d.empresa) !== FIXTURE_COMPANY
      || d.ventana !== 'prueba:1' || d.cantidad !== 1 || d._pruebaInfraestructura !== true
      || new Date(d.expiraEn).toISOString() !== FIXTURE_EXPIRY) {
      throw new ProvisioningFailure('inventory', 'UNEXPECTED_DATA');
    }
  }
  const expectedCustomRoles = new Set([`${DB}.${RUNTIME}`, `${DB}.${MAINTENANCE}`, `admin.${MAINTENANCE_SHUTDOWN}`]);
  if ((inventory.customRoles || []).some(r => !expectedCustomRoles.has(`${r.db}.${r.role}`))) {
    throw new ProvisioningFailure('inventory', 'UNEXPECTED_CUSTOM_ROLE');
  }
  return true;
}

function classifyMongoFailure(stage, error) {
  if (error instanceof ProvisioningFailure) return error;
  const code = Number.isInteger(error?.code) ? error.code : null;
  const name = codeName(error);
  const category = name || (code === 18 ? 'AuthenticationFailed' : 'MongoOperationFailed');
  return new ProvisioningFailure(stage, category, code);
}

async function withStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    throw classifyMongoFailure(stage, error);
  }
}

async function connectClient(MongoClient, password = null, target = targetByName()) {
  const options = {
    directConnection: true,
    serverSelectionTimeoutMS: 4000,
    connectTimeoutMS: 3000,
    appName: 'plurione-quota-provisioning'
  };
  if (password !== null) {
    options.auth = { username: BOOTSTRAP, password };
    options.authSource = 'admin';
  }
  const client = new MongoClient(`mongodb://${target.bindIp}:${target.port}/admin`, options);
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

async function establishBootstrap({ MongoClient, bootstrapPassword, onStage, mode, target }) {
  onStage('bootstrap-auth');
  try {
    const client = await connectClient(MongoClient, bootstrapPassword, target);
    return { client, created: false };
  } catch (error) {
    if (error?.code !== 18 && error?.codeName !== 'AuthenticationFailed') {
      throw classifyMongoFailure('bootstrap-auth', error);
    }
    if (mode === 'recovery') {
      throw new ProvisioningFailure('bootstrap-auth', 'BOOTSTRAP_AUTHENTICATION_FAILED', 18);
    }
  }

  onStage('bootstrap-first-user');
  let unauthenticated;
  try {
    unauthenticated = await connectClient(MongoClient, null, target);
    await unauthenticated.db('admin').command({
      createUser: BOOTSTRAP,
      pwd: bootstrapPassword,
      roles: [{ role: 'root', db: 'admin' }]
    });
  } catch (error) {
    throw classifyMongoFailure('bootstrap-first-user', error);
  } finally {
    await unauthenticated?.close().catch(() => {});
  }
  const client = await withStage('bootstrap-verify', () => connectClient(MongoClient, bootstrapPassword, target));
  return { client, created: true };
}

async function inspectInventory(client, ObjectId) {
  const admin = client.db('admin');
  const names = await admin.command({ listDatabases: 1, nameOnly: true });
  const usersResult = await admin.command({ usersInfo: { forAllDBs: true }, showCredentials: false });
  const db = client.db(DB);
  const collectionsResult = await db.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = collectionsResult.map(x => x.name).filter(n => !n.startsWith('system.'));
  let indexes = [];
  let documents = [];
  if (collectionNames.includes('usoias')) {
    indexes = await db.collection('usoias').indexes();
    documents = await db.collection('usoias').find({}, {
      projection: { _id: 1, empresa: 1, ventana: 1, cantidad: 1, expiraEn: 1, _pruebaInfraestructura: 1 }
    }).limit(2).toArray();
  }
  const adminRoles = await admin.command({ rolesInfo: 1, showBuiltinRoles: false, showPrivileges: true });
  const quotaRoles = await db.command({ rolesInfo: 1, showBuiltinRoles: false, showPrivileges: true });
  return {
    databases: (names.databases || []).map(d => d.name),
    users: usersResult.users || [],
    collections: collectionNames,
    indexes,
    documents,
    customRoles: [...(adminRoles.roles || []), ...(quotaRoles.roles || [])]
  };
}

function assertServerOptions(options, target = targetByName()) {
  const parsed = options?.parsed;
  const dbPath = String(parsed?.storage?.dbPath || '').replaceAll('/', '\\').toLowerCase();
  const expected = `${target.root}\\data`.toLowerCase();
  if (parsed?.net?.port !== target.port || parsed?.net?.bindIp !== target.bindIp
    || parsed?.security?.authorization !== 'enabled' || dbPath !== expected
    || options?.version !== '8.2.6') {
    throw new ProvisioningFailure('identity', 'SERVER_IDENTITY_MISMATCH');
  }
}

function assertRoleDefinition(role, expected) {
  if (!role) return false;
  const normalized = (role.privileges || []).map(p => ({
    resource: p.resource,
    actions: [...p.actions].sort()
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const normalizedExpected = expected.map(p => ({ resource: p.resource, actions: [...p.actions].sort() }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (JSON.stringify(normalized) !== JSON.stringify(normalizedExpected)) {
    throw new ProvisioningFailure('inventory', 'UNEXPECTED_CUSTOM_ROLE');
  }
  return true;
}

async function provisionExisting({ client, MongoClient, ObjectId, passwords, stage, target }) {
  const admin = client.db('admin');
  const db = client.db(DB);
  const identity = await withStage('identity', () => admin.command({ getCmdLineOpts: 1 }));
  const build = await withStage('identity', () => admin.command({ buildInfo: 1 }));
  assertServerOptions({ parsed: identity.parsed, version: build.version }, target);

  const before = await withStage('inventory', () => inspectInventory(client, ObjectId));
  assertInventory(before);
  const existingUsers = new Set((before.users || []).map(knownUserKey));
  const roles = new Map((before.customRoles || []).map(r => [r.role, r]));
  const runtimePrivileges = [{ resource: { db: DB, collection: 'usoias' }, actions: ['find', 'insert', 'listIndexes', 'update'] }];
  const shutdownPrivileges = [{ resource: { cluster: true }, actions: ['shutdown'] }];

  for (const user of [RUNTIME, MAINTENANCE]) {
    if (existingUsers.has(`${DB}.${user}`)) {
      await withStage(`verify-${user}-auth`, () => authenticateScoped(MongoClient, user, passwords[user], target));
    }
  }

  const runtimeRole = roles.get(RUNTIME);
  if (runtimeRole) {
    assertRoleDefinition(runtimeRole, runtimePrivileges);
    if ((runtimeRole.roles || []).length !== 0) throw new ProvisioningFailure('inventory', 'UNEXPECTED_CUSTOM_ROLE');
  }
  const maintenanceRole = roles.get(MAINTENANCE);
  if (maintenanceRole) {
    assertRoleDefinition(maintenanceRole, []);
    const inherited = (maintenanceRole.roles || []).map(r => `${r.role}@${r.db}`).sort();
    if (JSON.stringify(inherited) !== JSON.stringify([`dbOwner@${DB}`])) {
      throw new ProvisioningFailure('inventory', 'UNEXPECTED_CUSTOM_ROLE');
    }
  }
  const shutdownRole = roles.get(MAINTENANCE_SHUTDOWN);
  if (shutdownRole) {
    assertRoleDefinition(shutdownRole, shutdownPrivileges);
    if ((shutdownRole.roles || []).length !== 0) throw new ProvisioningFailure('inventory', 'UNEXPECTED_CUSTOM_ROLE');
  }

  await withStage('role-runtime', async () => {
    const existing = roles.get(RUNTIME);
    if (existing) { /* La definicion ya fue validada antes de cualquier escritura. */ }
    else await db.command({ createRole: RUNTIME, privileges: runtimePrivileges, roles: [] });
  });
  await withStage('role-maintenance', async () => {
    const existing = roles.get(MAINTENANCE);
    if (!existing) await db.command({ createRole: MAINTENANCE, privileges: [], roles: [{ role: 'dbOwner', db: DB }] });
  });
  await withStage('role-maintenance-shutdown', async () => {
    const existing = roles.get(MAINTENANCE_SHUTDOWN);
    if (!existing) await admin.command({ createRole: MAINTENANCE_SHUTDOWN, privileges: shutdownPrivileges, roles: [] });
  });

  if (!before.collections.includes('usoias')) await withStage('collection', () => db.createCollection('usoias'));
  const collection = db.collection('usoias');
  const wantedIndexes = [
    [{ empresa: 1, ventana: 1 }, { unique: true, name: 'empresa_1_ventana_1' }],
    [{ expiraEn: 1 }, { expireAfterSeconds: 0, name: 'expiraEn_1' }]
  ];
  const presentIndexNames = new Set((before.indexes || []).map(i => i.name));
  for (const [key, options] of wantedIndexes) {
    if (!presentIndexNames.has(options.name)) await withStage('indexes', () => collection.createIndex(key, options));
  }

  for (const [user, userRoles] of [[RUNTIME, [{ role: RUNTIME, db: DB }]], [MAINTENANCE, [
    { role: MAINTENANCE, db: DB }, { role: MAINTENANCE_SHUTDOWN, db: 'admin' }
  ]]]) {
    const key = `${DB}.${user}`;
    if (!existingUsers.has(key)) {
      await withStage(`user-${user}`, () => db.command({ createUser: user, pwd: passwords[user], roles: userRoles }));
    }
  }
  if (before.documents.length === 0) {
    await withStage('fixture', () => collection.insertOne({
      _id: new ObjectId(FIXTURE_ID), empresa: new ObjectId(FIXTURE_COMPANY), ventana: 'prueba:1', cantidad: 1,
      expiraEn: new Date(FIXTURE_EXPIRY), _pruebaInfraestructura: true
    }));
  }

  const after = await withStage('verify', () => inspectInventory(client, ObjectId));
  assertInventory(after);
  const indexes = new Set(after.indexes.map(i => i.name));
  for (const required of ['_id_', 'empresa_1_ventana_1', 'expiraEn_1']) {
    if (!indexes.has(required)) throw new ProvisioningFailure('verify', 'REQUIRED_INDEX_MISSING');
  }
  if (!existingUsers.has(`${DB}.${RUNTIME}`)) await withStage('verify-runtime-auth', () => authenticateScoped(MongoClient, RUNTIME, passwords[RUNTIME], target));
  if (!existingUsers.has(`${DB}.${MAINTENANCE}`)) await withStage('verify-maintenance-auth', () => authenticateScoped(MongoClient, MAINTENANCE, passwords[MAINTENANCE], target));
  await withStage('remove-bootstrap', () => admin.command({ dropUser: BOOTSTRAP }));
  return { stage, completed: true };
}

async function authenticateScoped(MongoClient, username, password, target = targetByName()) {
  const client = new MongoClient(`mongodb://${target.bindIp}:${target.port}/${DB}`, {
    directConnection: true,
    serverSelectionTimeoutMS: 3000,
    auth: { username, password },
    authSource: DB,
    appName: 'plurione-quota-auth-check'
  });
  try { await client.connect(); await client.db(DB).command({ ping: 1 }); }
  finally { await client.close(); }
}

async function runProvisioning({ MongoClient, ObjectId, prompt, mode = 'new', log = console.log, target: targetName = 'legacy' }) {
  const target = targetByName(targetName);
  let stage = 'input-bootstrap';
  let bootstrapPassword;
  let runtimePassword;
  let maintenancePassword;
  let client;
  try {
    bootstrapPassword = await prompt('Contraseña bootstrap (oculta): ');
    const bootstrapIssue = passwordValidationIssue(bootstrapPassword);
    if (bootstrapIssue) throw new ProvisioningFailure(stage, bootstrapIssue);
    const connection = await withStage('bootstrap', () => establishBootstrap({
      MongoClient, bootstrapPassword, mode, target,
      onStage: value => { stage = value; }
    }));
    client = connection.client;
    if (mode === 'initial' && !connection.created) {
      throw new ProvisioningFailure('initial-preflight', 'INSTANCE_ALREADY_INITIALIZED_USE_RECOVERY');
    }
    stage = 'inventory';
    const inventory = await withStage(stage, () => inspectInventory(client, ObjectId));
    assertInventory(inventory);
    runtimePassword = await prompt('Contraseña runtime (oculta; consérvala en gestor seguro): ');
    maintenancePassword = await prompt('Contraseña mantenimiento (oculta; consérvala en gestor seguro): ');
    const runtimeIssue = passwordValidationIssue(runtimePassword);
    if (runtimeIssue) throw new ProvisioningFailure('input-service-accounts', runtimeIssue);
    const maintenanceIssue = passwordValidationIssue(maintenancePassword);
    if (maintenanceIssue) throw new ProvisioningFailure('input-service-accounts', maintenanceIssue);
    if (new Set([bootstrapPassword, runtimePassword, maintenancePassword]).size !== 3) {
      throw new ProvisioningFailure('input-service-accounts', 'PASSWORDS_MUST_DIFFER');
    }
    const passwords = { [RUNTIME]: runtimePassword, [MAINTENANCE]: maintenancePassword };
    const result = await provisionExisting({ client, MongoClient, ObjectId, passwords, stage: mode, target });
    log('APROVISIONAMIENTO_OK stage=complete; bootstrap temporal eliminado');
    return result;
  } catch (error) {
    const failure = classifyMongoFailure(stage, error);
    log(`APROVISIONAMIENTO_FALLIDO stage=${failure.stage} code=${failure.code}${failure.mongoCode === null ? '' : ` mongoCode=${failure.mongoCode}`}${failure.resource ? ` database=${failure.resource}` : ''}`);
    log('No se imprimieron mensajes del driver ni datos de entrada. Conserva el estado; no repitas preparacion ni borres archivos.');
    throw failure;
  } finally {
    await client?.close().catch(() => {});
    bootstrapPassword = null;
    runtimePassword = null;
    maintenancePassword = null;
  }
}

module.exports = {
  DB, BOOTSTRAP, RUNTIME, MAINTENANCE, MAINTENANCE_SHUTDOWN, FIXTURE_ID, FIXTURE_COMPANY, FIXTURE_EXPIRY,
  ProvisioningFailure, validatePassword, passwordValidationIssue, assertInventory, assertServerOptions, classifyMongoFailure, inspectInventory,
  runProvisioning
};
