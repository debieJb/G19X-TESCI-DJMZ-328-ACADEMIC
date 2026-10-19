// Doble cierre: bandera explícita y empresas de piloto autorizadas por despliegue.
// No se carga .env aquí. Ninguna opción se acepta desde HTTP.
const obtenerPolitica = () => {
  const lista = (process.env.GMAIL_CAMPAIGNS_PILOT_COMPANIES || '').split(',').map(s => s.trim()).filter(Boolean);
  const preparacionPiloto = lista.length > 0 && lista.every(id => /^[a-f0-9]{24}$/.test(id));
  const automatico = process.env.GMAIL_CAMPAIGNS_MODE === 'automatico';
  const supervisado = process.env.GMAIL_CAMPAIGNS_MODE === 'supervisado';
  const limite = process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS || '1';
  const limiteValido = /^(?:[1-9]|[1-4][0-9]|50)$/.test(limite);
  return Object.freeze({ habilitado: process.env.GMAIL_CAMPAIGNS_ENABLED === 'true' && preparacionPiloto,
  automatico, supervisado, campanasSucesivas: process.env.GMAIL_CAMPAIGNS_MANUAL_POLICY === 'por_campana', preparacionPiloto, empresas: lista, maxDestinatarios: automatico || supervisado ? (limiteValido ? Number(limite) : 0) : 1, cuotaDiaEmpresa: 100, cuotaHoraEmpresa: 30,
  cuotaDiaGlobal: 500, intervaloEmpresaMs: 2000, intervaloGlobalMs: 1000, reservaMs: 120000 });
};
module.exports = { obtenerPolitica };
