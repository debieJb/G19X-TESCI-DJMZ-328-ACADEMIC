require('dotenv').config();

const conectarDatabase = require('./config/database');
const PORT = process.env.PORT || 3000;
const cerrarCuotasIA = async () => {
  await require('./services/ia/almacenCuotasPilotoLocal').cerrar();
  await require('./services/ia/almacenCuotasProtegido').cerrar();
  await require('./services/ia/almacenCuotasDev').cerrar();
};

const iniciarServidor = async () => {
  try {
    require('./services/origenTransaccionalService').validarServidorLocal();
    const app = require('./app');
    await conectarDatabase();
    await require('./services/ia/arranqueIA').preparar(app);
    await require('./services/autoservicioEmpresarialService').inicializar(require('mongoose').connection);
    // Validar el origen/credenciales sin conectar SMTP ni despachar la cola.
    require('./services/smtpTransaccionalService').crearCorreo();
    await require('./services/pilotoManualGmailService').prepararArranque({ app, conexion: require('mongoose').connection });
    await require('./services/envioSupervisadoService').prepararArranque({ app, conexion: require('mongoose').connection });
    const trabajador = await require('./services/trabajadorCampanasService').prepararArranque({
      app, conexion: require('mongoose').connection,
      informar: codigo => console.error('Trabajador Gmail:', /^[A-Z_]+$/.test(codigo) ? codigo : 'ERROR') });
    const servidor = app.listen(PORT, () => {
      console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
      console.log('IA_WEB:', JSON.stringify(app.locals.iaArranque));
    });
    servidor.on('error', async error => {
      if (error.code === 'EADDRINUSE') console.error('PUERTO_OCUPADO: el proceso anterior sigue atendiendo la web. Este arranque no ha sustituido al servidor existente.');
      else console.error('No se pudo abrir el puerto del servidor.');
      await trabajador?.detener(); await cerrarCuotasIA(); await require('mongoose').disconnect(); process.exitCode = 1;
    });
    const detener = async () => {
      const cerrado = new Promise(resolve => servidor.close(resolve));
      await trabajador?.detener(); await cerrado; await cerrarCuotasIA(); await require('mongoose').disconnect();
    };
    process.once('SIGTERM', detener); process.once('SIGINT', detener);
  } catch (e) {
    if (e.codigo === 'CUOTAS_NO_DISPONIBLES') console.error('IA_CUOTAS_NO_DISPONIBLES: revisa IA_DIAGNOSTICO; no se inició el nuevo servidor ni se llamó a Gemini.');
    if (e.message === 'ORIGEN_NO_COINCIDE_CON_SERVIDOR_LOCAL') console.error('TRANSACTIONAL_PUBLIC_ORIGIN debe coincidir con el origen HTTP local y PORT; revisa la configuración antes de enviar enlaces.');
    console.error('No se pudo iniciar. Revisa SESSION_SECRET, MONGODB_URI y MongoDB. MemoryStore solo está disponible en desarrollo.');
    process.exit(1);
  }
};

iniciarServidor();
