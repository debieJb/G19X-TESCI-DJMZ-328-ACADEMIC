// Ejecución explícita: NODE_ENV=test node --test tests/soporte/publicoNavegador.cjs
// Solo servidor efímero loopback con dobles; nunca carga .env ni conecta MongoDB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const pause = ms => new Promise(r => setTimeout(r, ms));
const localJson = (url, method = 'GET') => new Promise((resolve, reject) => {
  const u = new URL(url); if (u.hostname !== '127.0.0.1') return reject(Error('SOLO_LOOPBACK'));
  const req = http.request(u, { method }, res => { let s = ''; res.on('data', b => { s += b; });
    res.on('end', () => { try { resolve(JSON.parse(s)); } catch { reject(Error('JSON_LOCAL_INVALIDO')); } }); });
  req.on('error', reject); req.end();
});
const puertoLibre = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
test('navegador real: frontend público y recorrido aislado sin proveedores', { timeout: 120000 }, async t => {
  assert.equal(process.env.NODE_ENV, 'test', 'Solo ejecutar con NODE_ENV=test');
  const browser = process.env.PUBLIC_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert.ok(fs.existsSync(browser), 'Navegador local no disponible; no sustituir por HTTP');
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-publico-browser-'));
  const mongoose = require('mongoose'), bcrypt = require('bcryptjs'), session = require('express-session');
  for (const key of ['connect', 'createConnection']) t.mock.method(mongoose, key, () => { throw Error('DB_REAL_PROHIBIDA'); });
  t.mock.method(global, 'fetch', () => { throw Error('PROVEEDOR_REAL_PROHIBIDO'); });
  const Usuario = require('../../models/Usuario'), service = require('../../services/autoservicioEmpresarialService');
  const token = randomBytes(32).toString('base64url'), expired = randomBytes(32).toString('base64url');
  let requested = false, used = false, grantExpired = false, grant, account = null, requests = 0;
  const id = new mongoose.Types.ObjectId(), empresaId = new mongoose.Types.ObjectId();
  const doble = {
    limitar: async () => {}, solicitar: async () => { requests++; await pause(400); requested = true; }, reenviar: async () => {},
    consultarEnlace: async ({ hashEnlace }) => hashEnlace === service.tokenHash(expired) ? 'caducado'
      : requested && !used && hashEnlace === service.tokenHash(token) ? 'vigente' : 'invalido',
    verificar: async ({ hashEnlace, sesion }) => {
      if (await doble.consultarEnlace({ hashEnlace }) !== 'vigente') throw { codigo: 'ENLACE_INVALIDO' };
      used = true; grant = sesion; return { solicitud: String(id) };
    },
    consultarConfiguracion: async ({ sesion }) => sesion === grant ? grantExpired ? 'caducada' : account ? 'completada' : 'vigente' : 'invalida',
    configurar: async ({ sesion, datos }) => {
      if (!used || grant !== sesion) throw { codigo: 'ENLACE_INVALIDO' };
      require('../../services/registroEmpresarialService').validarPassword(datos.password);
      if (datos.password !== datos.confirmacionPassword) throw { codigo: 'PASSWORD_INSEGURA' };
      account = Usuario.hydrate({ _id: id, nombre: datos.nombreAdministrador, email: 'administrador@example.test',
        rol: 'admin_empresa', empresa: empresaId, estadoAcceso: 'activo', password: await bcrypt.hash(datos.password, 4) });
    }
  };
  t.mock.method(service, 'crearServicio', () => doble);
  t.mock.method(require('../../services/loginLimitesService'), 'consumir', async () => {});
  t.mock.method(Usuario, 'findOne', filtro => ({ select: async () => account?.email === filtro.email ? account : null }));
  t.mock.method(Usuario, 'findById', () => ({ select: () => ({ populate: () => ({ lean: async () => account ? {
    ...account.toObject(), empresa: { _id: empresaId, nombre: 'Empresa de prueba aislada' }
  } : null }) }) }));
  t.mock.method(require('../../services/empresaService'), 'obtenerPanel', async () => ({ empresa: { _id: empresaId, nombre: 'Empresa de prueba aislada' },
    campanas: [], usuarios: account ? [{ _id: id, nombre: account.nombre, email: account.email, rol: account.rol }] : [], operadores: [], totalUsuarios: 1, totalCampanas: 0 }));
  const store = new session.MemoryStore(), app = require('../../appFactory').crearApp({ secret: randomBytes(32).toString('hex'), store });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`, debugPort = await puertoLibre();
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
    '--disable-sync', '--disable-component-update', '--no-first-run', '--no-default-browser-check',
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(artifacts, 'profile')}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
  let ws, seq = 0, cargas = 0; const pending = new Map(), errors = [], checks = [], screenshots = [], links = new Set();
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP_TIMEOUT_${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error('ERROR_JS_EN_EVALUACION'); return r.result?.value;
  };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { try { if (await evaluate(expression)) return; } catch {} await pause(60); } throw Error('ESTADO_NAVEGADOR_NO_ALCANZADO'); };
  const go = async route => {
    const antes = cargas; await send('Page.navigate', { url: origin + route });
    for (let i = 0; i < 150 && cargas === antes; i++) await pause(50);
    assert.ok(cargas > antes, 'La navegación debe finalizar antes de inspeccionar');
    await waitFor(`location.pathname===${JSON.stringify(route.split('?')[0])} && document.readyState==='complete'`);
  };
  const heading = text => waitFor(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(text)}) && document.readyState==='complete'`);
  const fill = async (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const viewport = (width, height = 1000) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const capture = async name => {
    check(`sin desbordamiento en ${name}`, await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    for (const href of await evaluate("[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))")) links.add(href);
    await pause(100); const metrics = await send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
    const file = path.join(artifacts, name + '.png'); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); screenshots.push(file);
  };
  try {
    let target;
    for (let i = 0; i < 120; i++) { try { target = await localJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, 'PUT'); break; } catch {} await pause(100); }
    assert.ok(target?.webSocketDebuggerUrl, 'Edge no inició CDP');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.id) { const p = pending.get(m.id); if (!p) return; clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') errors.push('runtime');
      if (m.method === 'Page.loadEventFired') cargas++;
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console');
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.text)) errors.push('console');
    });
    await send('Page.enable'); await send('Runtime.enable');
    // Prohibir cualquier solicitud de la página fuera del servidor de pruebas.
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params;
      const allowed = request.url.startsWith(origin + '/') || request.url === 'about:blank';
      if (!allowed) errors.push('external_request_blocked');
      send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    for (const width of [1440, 768, 390, 320]) {
      await viewport(width);
      for (const [route, name] of [['/', 'inicio'], ['/login', 'login'], ['/registro', 'registro'], ['/registro/reenviar', 'reenvio']]) {
        await go(route);
        check(`sin desbordamiento ${name} ${width}px`, await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        check(`estructura y etiquetas ${name} ${width}px`, await evaluate("document.querySelectorAll('h1').length===1 && [...document.querySelectorAll('input:not([type=hidden])')].every(e=>e.labels.length>0)"));
        check(`sistema claro ${name} ${width}px`, await evaluate("getComputedStyle(document.documentElement).colorScheme==='light' && getComputedStyle(document.querySelector('header')).backgroundColor==='rgb(255, 255, 255)'"));
        if (name === 'registro') check(`registro central ${width}px`, await evaluate("getComputedStyle(document.querySelector('main')).backgroundColor==='rgb(255, 255, 255)'"));
        if ([1440, 390].includes(width)) await capture(`${name}-${width}`);
      }
    }
    await viewport(390); await go('/');
    check('anclas públicas con destino existente', await evaluate("[...document.querySelectorAll('a[href^=\"/#\"]')].every(a=>document.getElementById(a.hash.slice(1)))"));
    check('menú móvil inicia cerrado', await evaluate("document.querySelector('#navegacion-publica').hidden"));
    await click('[data-menu-toggle]'); check('menú móvil abre con estado accesible', await evaluate("!document.querySelector('#navegacion-publica').hidden && document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')==='true'"));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
    check('Escape cierra menú y devuelve foco', await evaluate("document.querySelector('#navegacion-publica').hidden && document.activeElement.matches('[data-menu-toggle]')"));
    await viewport(1440); await go('/login');
    check('login dividido con panel gráfico y formulario blanco', await evaluate("getComputedStyle(document.querySelector('main')).gridTemplateColumns.split(' ').length===2 && getComputedStyle(document.querySelector('.acceso-contexto')).backgroundImage.includes('gradient') && getComputedStyle(document.querySelector('.tarjeta-acceso')).backgroundColor==='rgb(255, 255, 255)'"));
    check('contraste de texto y controles del login', await evaluate(`(()=>{
      const luminancia=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
      const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number), contraste=(a,b)=>{const l=[luminancia(rgb(a)),luminancia(rgb(b))].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05)};
      const boton=getComputedStyle(document.querySelector('button[type=submit]')),input=getComputedStyle(document.querySelector('#email')),label=getComputedStyle(document.querySelector('label[for=email]'));
      return contraste(boton.color,boton.backgroundColor)>=4.5 && contraste(label.color,'rgb(255,255,255)')>=4.5 && contraste(getComputedStyle(document.querySelector('.entrada-con-icono')).borderTopColor,'rgb(255,255,255)')>=3;
    })()`));
    await click('[data-toggle-password]'); check('mostrar contraseña', await evaluate("document.querySelector('#password').type==='text'"));
    await click('[data-toggle-password]'); check('ocultar contraseña', await evaluate("document.querySelector('#password').type==='password'"));
    await click('button[type=submit]'); check('campos obligatorios y foco de errores', await evaluate("document.querySelectorAll('[aria-invalid=true]').length===2 && document.activeElement.matches('[data-form-errors]')"));
    await fill('#email', 'invalido'); await fill('#password', 'ejemplo'); await click('button[type=submit]');
    check('validación frontend de formato', await evaluate("document.querySelector('#email').getAttribute('aria-invalid')==='true'"));
    await fill('#email', 'administrador@example.test'); await fill('#password', 'contraseña-invalida-fixture'); await click('button[type=submit]');
    await waitFor("!!document.querySelector('.aviso-error') && document.readyState==='complete'");
    check('login incorrecto seguro', await evaluate("document.querySelector('.aviso-error').textContent.includes('Correo o contraseña incorrectos') && document.querySelector('#password').value===''"));
    await capture('login-error');
    await go('/registro/administrador'); await heading('Enlace no disponible'); check('acceso directo no muestra contraseña', await evaluate("!document.querySelector('input[type=password]')"));
    await go('/registro'); await fill('#empresa', 'Empresa de prueba aislada'); await fill('#correo', 'administrador@example.test');
    check('carga y bloqueo de doble envío', await evaluate("(()=>{const f=document.querySelector('form[data-public-form]');f.querySelector('button[type=submit]').click();return f.getAttribute('aria-busy')==='true' && f.querySelector('button[type=submit]').disabled && !f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()"));
    await heading('Solicitud recibida'); check('una solicitud HTTP', requests === 1); await capture('solicitud-recibida');
    await go('/registro/estado'); await heading('Verificación pendiente'); await capture('verificacion-pendiente');
    await send('Page.navigate', { url: origin + '/registro/verificar?token=' + expired }); await heading('Enlace caducado'); await capture('enlace-caducado');
    await send('Page.navigate', { url: origin + '/registro/verificar?token=' + randomBytes(32).toString('base64url') }); await heading('Enlace no disponible'); await capture('enlace-invalido');
    await send('Page.navigate', { url: origin + '/registro/verificar?token=' + token }); await heading('Confirma tu correo');
    check('URL limpia y GET sin consumo', await evaluate("location.search==='' && !!document.querySelector('form[action=\"/registro/verificar\"]')") && !used);
    await capture('confirmar-verificacion');
    await click('button[type=submit]'); await heading('Configura tu administrador'); await capture('administrador-1440');
    await viewport(390); await capture('administrador-390');
    await send('Page.navigate', { url: origin + '/registro/verificar?token=' + token }); await heading('Enlace ya utilizado'); await capture('enlace-usado');
    await go('/registro/administrador');
    grantExpired = true; await go('/registro/administrador'); await heading('Sesión de configuración caducada');
    check('permiso caducado no muestra configuración', await evaluate("!document.querySelector('input[type=password]')"));
    await capture('configuracion-caducada'); grantExpired = false; await go('/registro/administrador');
    const password = require('./registroFixture').passwordSintetica();
    await fill('#empresa', 'Empresa de prueba aislada'); await fill('#nombre', 'Administración de prueba');
    await fill('#password', password); await fill('#confirmacion', password + 'x'); await click('button[type=submit]');
    check('confirmación de contraseña', await evaluate("document.querySelector('#confirmacion').getAttribute('aria-invalid')==='true'"));
    await fill('#confirmacion', password); await click('button[type=submit]'); await heading('Registro completado'); await capture('registro-completado');
    await go('/login'); await fill('#email', 'administrador@example.test'); await fill('#password', password); await click('button[type=submit]');
    await waitFor("location.pathname==='/panel' && document.readyState==='complete'"); check('login y panel empresarial', await evaluate("document.querySelector('h1').textContent.includes('Empresa de prueba aislada')"));
    await viewport(1440); await capture('panel-empresa-1440');
    await viewport(390);
    check('tabla empresarial móvil legible y desplazable con foco', await evaluate("(()=>{const e=document.querySelector('.tabla-admin');return e.tabIndex===0 && e.getAttribute('role')==='region' && e.scrollWidth>e.clientWidth;})()"));
    await capture('panel-empresa-390');
    account.rol = 'operador'; await go('/panel');
    check('panel operador mantiene límites de rol y tema claro', await evaluate("document.body.classList.contains('pagina-empresa') && !document.querySelector('a[href=\"/empresa/usuarios/nuevo\"]')"));
    await capture('panel-operador-390');
    await click('form[action="/logout"] button'); await waitFor("location.pathname==='/' && document.readyState==='complete'");
    await send('Page.navigate', { url: origin + '/panel' }); await heading('Iniciar sesión'); check('logout revoca panel', await evaluate("location.pathname==='/login'"));
    await fill('#email', 'administrador@example.test'); await fill('#password', password); await click('button[type=submit]'); await waitFor("location.pathname==='/panel'");
    await new Promise(resolve => store.clear(resolve)); await send('Page.navigate', { url: origin + '/panel' }); await heading('Iniciar sesión'); check('sesión perdida requiere nuevo login', true);
    await send('Emulation.setScriptExecutionDisabled', { value: true }); await go('/login');
    check('sin JavaScript conserva formulario, CSRF y botón real', await evaluate("!!document.querySelector('form[action=\"/login\"] input[name=_csrf]') && !document.querySelector('form').noValidate && document.querySelector('[data-toggle-password]').hidden"));
    check('sin errores JavaScript ni solicitudes externas', errors.length === 0);
    for (const href of links) {
      if (href === '#contenido') continue;
      check(`destino interno ${href}`, href.startsWith('/') && !href.startsWith('//'));
      const status = await new Promise((resolve, reject) => http.get(origin + href.split('#')[0], res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
      check(`enlace sin 404 ${href}`, status !== 404 && status < 500);
    }
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ checks, screenshots, errors, isolatedDoubles: true, mongoUsed: false, externalProvidersUsed: false }, null, 2));
    console.log(JSON.stringify({ browser: 'Edge headless', checks: checks.length, screenshots: screenshots.length, artifacts, errors: errors.length }));
  } catch (e) {
    fs.writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ checks, screenshots, errors, failure: e.message }, null, 2));
    console.log('EVIDENCIA_PARCIAL', artifacts); throw e;
  } finally {
    if (ws?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); ws.close(); }
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('BROWSER_CLOSED')); }
    if (child.exitCode === null) child.kill();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.clear();
  }
});
