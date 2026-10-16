// Evidencia sintética explícita; no migra ni atribuye consentimiento a datos reales.
const consentimientoPrueba = () => ({ canales: { email: true },
  consentimientoMarketing: { estado: 'otorgado', fecha: new Date(0), fuente: 'Formulario sintético de pruebas' } });
module.exports = { consentimientoPrueba };
