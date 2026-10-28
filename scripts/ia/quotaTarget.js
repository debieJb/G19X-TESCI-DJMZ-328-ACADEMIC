'use strict';

const { paths } = require('../rutasLocales');

// Allowlisted local deployments. The historical target remains the default so
// existing recovery/maintenance scripts cannot silently move to another DB.
const TARGETS = Object.freeze({
  legacy: Object.freeze({
    port: 27019,
    bindIp: '127.0.0.1',
    root: paths.quotaRoot,
    database: 'plurione_ai_quota'
  }),
  gemini: Object.freeze({
    port: 27020,
    bindIp: '127.0.0.1',
    root: paths.geminiRoot,
    database: 'plurione_ai_quota'
  })
});

function targetByName(name = 'legacy') {
  if (!Object.hasOwn(TARGETS, name)) throw new Error('CUOTAS_TARGET_NO_AUTORIZADO');
  return TARGETS[name];
}

module.exports = { TARGETS, targetByName };
