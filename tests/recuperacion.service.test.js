const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { fixture, copiar } = require('./soporte/recuperacionFixture.cjs');
const { crearServicio, analizarToken, DURACION_MS } = require('../services/recuperacionPasswordService');

test('recuperación: token seguro, hash exclusivo, origen fijo, plantilla y cola idempotente', async t => {
  const f = await fixture(t);
  const tarea = await f.servicio.solicitar(' PERSONA@EXAMPLE.TEST ');
  assert.equal(f.mensajes.length, 0);
  assert.equal(await f.servicio.solicitar('persona@example.test'), null);
  const entregas = await Promise.all([f.servicio.despachar(tarea), f.servicio.despachar(tarea)]);
  assert.equal(entregas.filter(r => r.estado === 'enviada').length, 1);
  assert.equal(f.mensajes.length, 1);
  const m = f.mensajes[0], enlace = new URL(m.texto.match(/https:\/\/\S+/)[0]);
  const token = new URLSearchParams(enlace.hash.slice(1)).get('token');
  assert.equal(enlace.origin, 'https://plurione.example.test');
  assert.equal(enlace.search, ''); assert.equal(m.asunto, 'Recupera tu contraseña de PluriOne');
  assert.equal(m.destino, 'persona@example.test'); assert.match(m.texto, /15 minutos/);
  assert.match(token, /^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(f.datos[0].recuperacion.tokenHash, analizarToken(token).tokenHash);
  assert.equal(+f.datos[0].recuperacion.expiraEn - +f.reloj(), DURACION_MS);
  assert.ok(!JSON.stringify(f.datos).includes(token));
  assert.equal(Object.keys(f.datos[0].recuperacion).includes('token'), false);
});

test('recuperación: cambio usa save/bcrypt, consume enlace y solo modifica contraseña/sesiones', async t => {
  const f = await fixture(t), token = await f.emitir();
  const identidad = { rol: f.datos[0].rol, empresa: f.datos[0].empresa, email: f.datos[0].email, estadoAcceso: f.datos[0].estadoAcceso };
  await f.servicio.restablecer({ token, password: f.NUEVA, confirmacionPassword: f.NUEVA });
  assert.equal(f.datos[0].versionSesion, 1); assert.equal(f.datos[0].recuperacion.estado, 'consumida');
  assert.equal(f.datos[0].recuperacion.tokenHash, undefined);
  assert.match(f.datos[0].password, /^\$2[ab]\$12\$/);
  assert.ok(await bcrypt.compare(f.NUEVA, f.datos[0].password));
  assert.equal(await bcrypt.compare(f.PASSWORD, f.datos[0].password), false);
  for (const [k, v] of Object.entries(identidad)) assert.equal(f.datos[0][k], v);
  assert.equal(f.escrituras.length, 1);
  assert.equal(f.escrituras[0].filtro['recuperacion.tokenHash'], analizarToken(token).tokenHash);
  await assert.rejects(f.servicio.restablecer({ token, password: f.NUEVA, confirmacionPassword: f.NUEVA }), { codigo: 'ENLACE_INVALIDO' });
});

test('recuperación: dos consumos concurrentes permiten exactamente un cambio', async t => {
  const f = await fixture(t), token = await f.emitir();
  const resultados = await Promise.allSettled([f.NUEVA, f.NUEVA + '!'].map(password => f.servicio.restablecer({ token, password, confirmacionPassword: password })));
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'ENLACE_INVALIDO');
  assert.equal(f.datos[0].versionSesion, 1);
  assert.equal(f.escrituras.length, 2);
});

test('recuperación: caducidad exacta, contraseña débil y confirmación incorrecta no consumen', async t => {
  const f = await fixture(t), token = await f.emitir();
  for (const [password, confirmacionPassword, codigo] of [['corta', 'corta', 'PASSWORD_INSEGURA'], [f.NUEVA, f.NUEVA + '!', 'PASSWORD_NO_COINCIDE'], ['á'.repeat(37), 'á'.repeat(37), 'PASSWORD_INSEGURA']]) {
    await assert.rejects(f.servicio.restablecer({ token, password, confirmacionPassword }), { codigo });
  }
  assert.equal(f.datos[0].recuperacion.estado, 'enviada');
  f.avanzar(DURACION_MS);
  await assert.rejects(f.servicio.restablecer({ token, password: f.NUEVA, confirmacionPassword: f.NUEVA }), { codigo: 'ENLACE_INVALIDO' });
  assert.equal(f.escrituras.length, 0);
});

test('recuperación: enlace nuevo sustituye al anterior; correo y versión quedan vinculados', async t => {
  const f = await fixture(t), viejo = await f.emitir(); f.avanzar(61000);
  const nuevo = await f.emitir();
  assert.notEqual(nuevo, viejo);
  await assert.rejects(f.servicio.restablecer({ token: viejo, password: f.NUEVA, confirmacionPassword: f.NUEVA }), { codigo: 'ENLACE_INVALIDO' });
  const antes = copiar(f.datos[0]);
  for (const cambio of [{ email: 'otro@example.test' }, { versionSesion: 1 }, { estadoAcceso: 'bloqueado' }]) {
    Object.assign(f.datos[0], cambio);
    await assert.rejects(f.servicio.restablecer({ token: nuevo, password: f.NUEVA, confirmacionPassword: f.NUEVA }), { codigo: 'ENLACE_INVALIDO' });
    f.datos[0] = copiar(antes);
  }
});

for (const estadoAcceso of ['bloqueado', 'pendiente_verificacion']) test(`recuperación: ${estadoAcceso} e inexistentes no crean tareas ni envían`, async t => {
  const f = await fixture(t); f.datos[0].estadoAcceso = estadoAcceso;
  assert.equal(await f.servicio.solicitar('persona@example.test'), null);
  assert.equal(await f.servicio.solicitar('ausente@example.test'), null);
  assert.equal(f.mensajes.length, 0); assert.equal(f.datos[0].recuperacion, undefined);
});

test('recuperación: cuentas históricas sin estado ni versión conservan compatibilidad', async t => {
  const f = await fixture(t); delete f.datos[0].estadoAcceso; delete f.datos[0].versionSesion;
  const token = await f.emitir();
  await f.servicio.restablecer({ token, password: f.NUEVA, confirmacionPassword: f.NUEVA });
  assert.equal(f.datos[0].versionSesion, 1); assert.equal(f.datos[0].estadoAcceso, undefined);
});

test('recuperación: entrega incierta no se reintenta y cuotas de registro son compartidas', async t => {
  const f = await fixture(t);
  let envios = 0;
  const s = crearServicio({ conexion: f.conexion, reloj: f.reloj, correo: { disponible: true, enviarRecuperacion: async () => { envios++; throw { definitivo: false }; } } });
  const tarea = await s.solicitar('persona@example.test');
  assert.equal((await s.despachar(tarea)).estado, 'incierta');
  assert.equal((await s.despachar(tarea)).estado, 'sin_trabajo');
  assert.equal(envios, 1);
  const { createHash } = require('node:crypto');
  const clave = createHash('sha256').update(`gmail-transaccional:60000:${Math.floor(+f.reloj() / 60000)}`).digest('hex');
  assert.ok(f.contadores.has(clave));
  f.avanzar(61000);
  const tarea2 = await s.solicitar('persona@example.test');
  const cuota = createHash('sha256').update(`gmail-transaccional:60000:${Math.floor(+f.reloj() / 60000)}`).digest('hex');
  f.contadores.set(cuota, { cantidad: 10 });
  assert.equal((await s.despachar(tarea2)).estado, 'limitada');
  assert.equal(f.datos[0].recuperacion.estado, 'pendiente');
  assert.equal(envios, 1);
});

test('recuperación: reserva interrumpida se clasifica incierta, sin reenvío ni texto privado', async t => {
  const f = await fixture(t), token = await f.emitir();
  f.datos[0].recuperacion.estado = 'procesando'; f.datos[0].recuperacion.entregaHasta = new Date(+f.reloj() - 1);
  await f.servicio.recuperarInciertas();
  assert.equal(f.datos[0].recuperacion.estado, 'incierta');
  assert.equal((await f.servicio.despachar()).estado, 'sin_trabajo');
  assert.equal(f.mensajes.length, 1);
  assert.ok(!JSON.stringify(require('../models/Usuario').hydrate(f.datos[0])).includes(token));
  assert.equal(require('../models/Usuario').hydrate(f.datos[0]).toJSON().recuperacion, undefined);
});

test('recuperación: una tarea pendiente vieja no envía enlaces inesperados', async t => {
  const f = await fixture(t);
  const tarea = await f.servicio.solicitar('persona@example.test');
  f.avanzar(DURACION_MS);
  assert.equal((await f.servicio.despachar(tarea)).estado, 'sin_trabajo');
  assert.equal(f.mensajes.length, 0);
});

test('recuperación: rechazo AUTH queda trazado sin secretos y no se reenvía desde ningún trabajador', async t => {
  const f = await fixture(t); let intentos = 0, bloqueo;
  const servicio = crearServicio({ conexion: f.conexion, reloj: f.reloj,
    correo: { disponible: true, enviarRecuperacion: async () => { intentos++; throw Object.assign(Error('NO_PUBLICAR_PASSWORD_TOKEN'), {
      codigo: 'REAUTORIZAR_TRANSACCIONAL', definitivo: true, requiereAutorizacion: true, faseSmtp: 'AUTH', respuestaSmtp: 535, estadoSmtp: '5.7.8',
      response: 'NO_PUBLICAR_RESPUESTA_PRIVADA' }); } }, diagnostico: codigo => { bloqueo = codigo; } });
  const tarea = await servicio.solicitar('persona@example.test');
  const resultado = await servicio.despachar(tarea);
  assert.equal(resultado.estado, 'fallida'); assert.equal(resultado.codigo, 'REAUTORIZAR_TRANSACCIONAL');
  assert.equal(bloqueo, 'REAUTORIZAR_TRANSACCIONAL');
  assert.equal(f.datos[0].recuperacion.correoError, 'REAUTORIZAR_TRANSACCIONAL');
  assert.equal(f.datos[0].recuperacion.faseSmtp, 'AUTH');
  assert.equal(f.datos[0].recuperacion.respuestaSmtp, 535);
  assert.equal(f.datos[0].recuperacion.estadoSmtp, '5.7.8');
  assert.ok(!JSON.stringify(f.datos).includes('NO_PUBLICAR'));
  assert.equal((await servicio.despachar(tarea)).estado, 'sin_trabajo');
  assert.equal((await servicio.despachar()).estado, 'sin_trabajo');
  await servicio.recuperarInciertas();
  assert.equal(f.datos[0].recuperacion.estado, 'fallida'); assert.equal(intentos, 1);
});

test('recuperación: transporte desactivado conserva el pendiente con diagnóstico, sin borrar ni enviar', async t => {
  const f = await fixture(t), tarea = await f.servicio.solicitar('persona@example.test');
  const servicio = crearServicio({ conexion: f.conexion, reloj: f.reloj });
  assert.equal((await servicio.despachar(tarea)).estado, 'deshabilitado');
  assert.equal(f.datos[0].recuperacion.estado, 'pendiente');
  assert.equal(f.datos[0].recuperacion.correoError, 'CORREO_DESHABILITADO');
  assert.equal(f.mensajes.length, 0);
  await servicio.registrarBloqueo(tarea, { codigo: 'CONFIGURACION_SMTP', message: 'NO_PUBLICAR_SECRETO' });
  assert.equal(f.datos[0].recuperacion.correoError, 'CONFIGURACION_SMTP');
  assert.ok(!JSON.stringify(f.datos).includes('NO_PUBLICAR'));
});

test('recuperación: diagnóstico de una solicitud vieja no sobrescribe una nueva ni reinicia entregas', async t => {
  const f = await fixture(t), vieja = await f.servicio.solicitar('persona@example.test');
  f.avanzar(61000);
  const nueva = await f.servicio.solicitar('persona@example.test');
  await f.servicio.registrarBloqueo(vieja, { codigo: 'REAUTORIZAR_TRANSACCIONAL' });
  assert.equal(f.datos[0].recuperacion.correoError, undefined);
  await f.servicio.registrarBloqueo(nueva, { codigo: 'DESCONOCIDO', message: 'SECRETO_NO_PUBLICAR' });
  assert.equal(f.datos[0].recuperacion.correoError, 'DESPACHO_NO_DISPONIBLE');
  await assert.rejects(f.servicio.registrarBloqueo({}, {}), { codigo: 'DATOS_INVALIDOS' });
  assert.equal(f.mensajes.length, 0);
});
