// Solo lectura de identidad y baseline; no consulta sesiones, conexiones OAuth ni empresas.
const rs = require('./mongoDevRsComun');
const { asegurarEnvioApagado } = require('../services/infraestructuraPilotoService');
rs.ejecutar(async () => {
  asegurarEnvioApagado();
  const c = await rs.conectar();
  try {
    await rs.verificar(c); await rs.compararOriginal();
    const temporales = (await c.db('admin').admin().listDatabases({ nameOnly: true })).databases.filter(d => /^ma_tx_test_[a-f0-9]{32}$/.test(d.name)).length;
    console.log(JSON.stringify({ entorno: 'pruebas_no_produccion', replicaSet: rs.SET, primary: true,
      baselinePrincipal: 'coincide', envioRealHabilitado: false, basesTemporales: temporales }));
  } finally { await c.close(); }
});
