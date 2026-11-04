const { test } = require('node:test');
const assert = require('node:assert/strict');
test('supervisado: opt-in separado, límite estricto y piloto manual permanece unitario', t => {
  const keys = ['GMAIL_CAMPAIGNS_MODE', 'GMAIL_CAMPAIGNS_MAX_RECIPIENTS'];
  const prev = keys.map(k => process.env[k]);
  t.after(() => keys.forEach((k, i) => { if (prev[i] === undefined) delete process.env[k]; else process.env[k] = prev[i]; }));
  const politica = require('../config/enviosGmail').obtenerPolitica;
  process.env.GMAIL_CAMPAIGNS_MODE = 'manual'; process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS = '50';
  assert.equal(politica().maxDestinatarios, 1);
  process.env.GMAIL_CAMPAIGNS_MODE = 'supervisado'; process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS = '2';
  assert.equal(politica().maxDestinatarios, 2); assert.equal(politica().automatico, false);
  process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS = '51'; assert.equal(politica().maxDestinatarios, 0);
});
test('supervisado: arranque valida índices sin iniciar consumidor ni migrar colecciones', async t => {
  const app = { locals: {} };
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => ({ habilitado: true, automatico: false, supervisado: true }));
  t.mock.method(require('../services/googleOAuthClienteService'), 'configuracion', () => ({}));
  let validations = 0;
  t.mock.method(require('../services/motorEnviosGmailService'), 'preparar', async (...args) => { assert.equal(args.length, 1); validations++; });
  t.mock.method(require('../services/motorEnviosGmailService'), 'crearMotor', () => { throw Error('NO_CONSUMIR'); });
  assert.equal(await require('../services/envioSupervisadoService').prepararArranque({ app, conexion: {} }), true);
  assert.equal(app.locals.gmailSupervisadoValidado, true); assert.equal(validations, 1);
  assert.equal(await require('../services/trabajadorCampanasService').prepararArranque({ app }), null);
  assert.equal(require('../services/pilotoManualGmailService').permitido(), false);
});

test('supervisado: 50 por defecto, configuración explícita prevalece y inválidos cierran el envío', t => {
  const keys = ['GMAIL_CAMPAIGNS_MODE', 'GMAIL_CAMPAIGNS_MAX_RECIPIENTS'];
  const antes = keys.map(k => process.env[k]);
  t.after(() => keys.forEach((k, i) => { if (antes[i] === undefined) delete process.env[k]; else process.env[k] = antes[i]; }));
  process.env.GMAIL_CAMPAIGNS_MODE = 'supervisado';
  delete process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS;
  const politica = require('../config/enviosGmail').obtenerPolitica;
  assert.equal(politica().maxDestinatarios, 50);
  process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS = '2'; assert.equal(politica().maxDestinatarios, 2);
  process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS = '50'; assert.equal(politica().maxDestinatarios, 50);
  for (const valor of ['', '51', '1000', '-2', 'dos']) {
    process.env.GMAIL_CAMPAIGNS_MAX_RECIPIENTS = valor; assert.equal(politica().maxDestinatarios, 0);
  }
});
