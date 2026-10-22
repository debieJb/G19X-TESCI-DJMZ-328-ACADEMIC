'use strict';
const https = require('node:https');
const consultar = ({ cert, ruta, metodo = 'GET', cookie }) => new Promise((resolve, reject) => {
  const req = https.request({ hostname: '127.0.0.1', port: 3100, servername: 'localhost', path: ruta,
    method: metodo, ca: cert, rejectUnauthorized: true, timeout: 4000,
    headers: { Host: 'localhost:3100', ...(cookie ? { Cookie: cookie } : {}), ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } }, res => {
    let cuerpo = '', bytes = 0;
    res.on('data', b => { bytes += b.length; if (bytes > 1048576) req.destroy(Error('RESPUESTA_LOCAL_EXCESIVA')); else cuerpo += b.toString('utf8'); });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, cuerpo }));
  });
  req.on('timeout', () => req.destroy(Error('HTTPS_LOCAL_NO_DISPONIBLE'))); req.on('error', reject); req.end();
});
const principal = async config => {
  const exigir = (ok, codigo) => { if (!ok) throw Error(codigo); };
  const inicio = await consultar({ cert: config.cert, ruta: '/' });
  exigir(inicio.status === 200 && inicio.headers['x-plurione-local-pilot'] === '1', 'ORIGEN_NO_ES_PILOTO');
  const login = await consultar({ cert: config.cert, ruta: '/login' });
  exigir(login.status === 200 && login.headers['cache-control']?.includes('no-store'), 'LOGIN_LOCAL_NO_DISPONIBLE');
  const cookies = login.headers['set-cookie'] || [];
  exigir(cookies.some(c => c.startsWith('marketing.piloto.sid=') && /; Secure/i.test(c) && /; HttpOnly/i.test(c) && /; SameSite=Lax/i.test(c)), 'COOKIE_LOCAL_INSEGURA');
  const cookie = cookies.map(c => c.split(';')[0]).join('; ');
  const protecciones = [];
  for (const ruta of ['/panel', '/empresa/gmail', '/campanas', '/contactos']) {
    const r = await consultar({ cert: config.cert, ruta, cookie });
    exigir([302, 303].includes(r.status) && r.headers.location === '/login', 'RECURSO_SIN_AUTENTICACION');
    protecciones.push({ ruta, estado: r.status, destino: '/login' });
  }
  for (const ruta of ['/login', '/registro']) {
    const r = await consultar({ cert: config.cert, ruta, cookie, metodo: 'POST' });
    exigir(r.status === 403, 'CSRF_NO_RECHAZADO'); protecciones.push({ ruta, metodo: 'POST sin CSRF', estado: r.status });
  }
  const enviar = await consultar({ cert: config.cert, ruta: '/campanas/507f1f77bcf86cd799439011/gmail/confirmar', cookie, metodo: 'POST' });
  exigir([302, 303, 403].includes(enviar.status), 'CONFIRMACION_NO_PROTEGIDA');
  return { tlsVerificado: true, origen: 'https://localhost:3100', cookieSegura: true, protecciones,
    confirmacionSinSesionDenegada: true, autorizacionGoogleRealizada: false, enviosRealizados: 0 };
};
module.exports = { principal };
