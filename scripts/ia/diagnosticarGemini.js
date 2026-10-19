'use strict';
const principal = async args => {
  if (args.length !== 1 || !['--configuracion', '--modelo', '--generar-una-propuesta'].includes(args[0])) throw Error('ARGUMENTOS_INVALIDOS');
  require('dotenv').config({ quiet: true });
  const gemini = require('../../services/ia/geminiProveedor');
  if (args[0] === '--configuracion') {
    const e = process.env;
    return { proveedor: e.AI_PROVIDER, modelo: e.AI_MODEL, habilitada: e.AI_ENABLED === 'true',
      nivelGratuitoConfirmado: e.AI_FREE_TIER_CONFIRMED === 'true', credencialPresente: !!e.GEMINI_API_KEY,
      configuracionValida: (() => { try { gemini.configuracion(); return true; } catch { return false; } })(),
      cuotas: e.AI_QUOTA_BACKEND || 'dev_fixture', uriProtegidaPresente: !!e.AI_QUOTA_MONGODB_URI };
  }
  if (args[0] === '--modelo') return gemini.verificarModelo();
  // Esta acción consume UNA solicitud real y las cuotas persistentes habituales.
  // Nunca usa dobles, nunca guarda campañas ni llama módulos de correo.
  const mongoose = require('mongoose');
  try {
    await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false });
    const empresa = require('../../services/ia/almacenCuotasPilotoLocal').EMPRESA;
    const usuario = await require('../../models/Usuario').findOne({ empresa, rol: 'admin_empresa', estadoAcceso: 'activo' }).lean();
    if (!usuario) throw Error('ADMINISTRADOR_NO_DISPONIBLE');
    const propuesta = await require('../../services/iaService').generar(usuario, {
      producto: 'Nickki Velas', instrucciones: 'Crea una campaña de presentación para Nickki Velas, una marca de velas. Usa un tono cálido y elegante. Invita a conocer la colección. No inventes precios, descuentos, certificaciones ni características del producto. Sugiere audiencias generales con consentimiento, sin identificar personas.',
      confirmacionPrivacidad: 'CONFIRMO'
    });
    return { solicitudReal: true, proveedor: propuesta.proveedor, asuntoGenerado: !!propuesta.asunto,
      mensajeGenerado: !!propuesta.mensaje, llamadaAccionGenerada: !!propuesta.llamadaAccion,
      sugerenciasSegmentacion: propuesta.segmentacion.length, borradorGuardado: false, correosEnviados: 0 };
  } finally {
    await require('../../services/ia/almacenCuotasPilotoLocal').cerrar();
    await require('../../services/ia/almacenCuotasProtegido').cerrar();
    await require('../../services/ia/almacenCuotasDev').cerrar();
    await mongoose.disconnect();
  }
};
if (require.main === module) principal(process.argv.slice(2)).then(r => console.log(JSON.stringify(r)))
  .catch(e => { console.error('DIAGNOSTICO_GEMINI_NO_COMPLETADO', /^[A-Z_]+$/.test(e.codigo || '') ? e.codigo : 'REVISA_DIAGNOSTICO'); process.exitCode = 1; });
module.exports = { principal };
