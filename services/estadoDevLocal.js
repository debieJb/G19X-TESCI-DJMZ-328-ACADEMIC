'use strict';
const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ruta = '/__plurione_dev/estado';
const raiz = () => fs.realpathSync(path.resolve(__dirname, '..')).toLowerCase();
const huellaEntorno = env => createHmac('sha256', env.SESSION_SECRET || '').update(JSON.stringify(
  Object.keys(env).filter(k => /^(AI_|GEMINI_|MONGODB_URI$|PLURIONE_|GMAIL_|TRANSACTIONAL_|PORT$|NODE_ENV$)/.test(k))
    .sort().map(k => [k, env[k]])
)).digest('hex');
const firmar = (datos, secreto) => createHmac('sha256', secreto).update(JSON.stringify(datos)).digest('hex');
const middleware = (app, siguiente, env = process.env, detener = async () => {}) => (req, res) => {
  if (env.NODE_ENV !== 'development' || !req.url.startsWith(ruta)) return siguiente(req, res);
  const ip = req.socket.remoteAddress;
  const url = new URL(req.url, 'http://localhost');
  const reto = url.searchParams.get('reto');
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) || !['GET', 'POST'].includes(req.method)
      || url.pathname !== ruta || !/^[a-f0-9]{64}$/.test(reto || '') || !env.SESSION_SECRET) {
    res.writeHead(404); return res.end();
  }
  if (req.method === 'POST') {
    const tiempo = Number(req.headers['x-plurione-dev-tiempo']);
    const firma = req.headers['x-plurione-dev-firma'];
    const accion = { accion: 'detener', pid: process.pid, reto, tiempo };
    if (!Number.isSafeInteger(tiempo) || Math.abs(Date.now() - tiempo) > 5000 || typeof firma !== 'string'
        || !/^[a-f0-9]{64}$/.test(firma) || !timingSafeEqual(Buffer.from(firma), Buffer.from(firmar(accion, env.SESSION_SECRET)))) {
      res.writeHead(403); return res.end();
    }
    res.writeHead(202, { 'Cache-Control': 'no-store' }); res.end();
    detener().catch(() => console.error('PLURIONE_PARADA_INCOMPLETA'));
    return;
  }
  const datos = { aplicacion: 'plurione-dev-v1', raiz: raiz(), pid: process.pid, reto,
    entorno: huellaEntorno(env), cuotasVerificadas: app.locals.iaArranque?.cuotasVerificadas === true };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ datos, firma: firmar(datos, env.SESSION_SECRET) }));
};
const consultar = async (env, fetcher = fetch) => {
  if (!env.SESSION_SECRET) throw Error('SESSION_SECRET_REQUERIDO');
  const reto = randomBytes(32).toString('hex');
  const res = await fetcher(`http://127.0.0.1:3000${ruta}?reto=${reto}`, {
    redirect: 'manual', signal: AbortSignal.timeout(2500)
  });
  if (res.status !== 200 || Number(res.headers.get('content-length')) > 4096) throw Error('PUERTO_3000_IDENTIDAD_NO_CONFIRMADA');
  const reader = res.body.getReader(); let texto = '';
  try { for (;;) { const r = await reader.read(); if (r.done) break; texto += Buffer.from(r.value).toString(); if (texto.length > 4096) throw Error('PUERTO_3000_IDENTIDAD_NO_CONFIRMADA'); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const { datos, firma } = JSON.parse(texto);
  if (!datos || typeof firma !== 'string' || !/^[a-f0-9]{64}$/.test(firma)
      || datos.aplicacion !== 'plurione-dev-v1' || datos.raiz !== raiz() || datos.reto !== reto
      || datos.entorno !== huellaEntorno(env) || !Number.isSafeInteger(datos.pid) || datos.pid < 1
      || !datos.cuotasVerificadas || !timingSafeEqual(Buffer.from(firma), Buffer.from(firmar(datos, env.SESSION_SECRET)))) {
    throw Error('PUERTO_3000_IDENTIDAD_NO_CONFIRMADA');
  }
  return datos;
};
const solicitarParada = async (env, fetcher = fetch) => {
  const actual = await consultar(env, fetcher);
  const reto = randomBytes(32).toString('hex'); const tiempo = Date.now();
  const firma = firmar({ accion: 'detener', pid: actual.pid, reto, tiempo }, env.SESSION_SECRET);
  const res = await fetcher(`http://127.0.0.1:3000${ruta}?reto=${reto}`, { method: 'POST', redirect: 'manual',
    signal: AbortSignal.timeout(2500), headers: { 'x-plurione-dev-tiempo': String(tiempo), 'x-plurione-dev-firma': firma } });
  await res.body?.cancel();
  if (res.status !== 202) throw Error('PLURIONE_PARADA_NO_AUTORIZADA');
  return actual.pid;
};
module.exports = { middleware, consultar, solicitarParada, firmar, huellaEntorno, raiz, ruta };
