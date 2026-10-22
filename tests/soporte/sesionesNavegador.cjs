// NODE_ENV=test node --test tests/soporte/sesionesNavegador.cjs
// Navegador real, HTTP y sesiones reales; solo datos/almacén sintéticos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { crearFixture } = require('./sesionesFixture.cjs');
const pausa = ms => new Promise(r => setTimeout(r, ms));
const jsonLocal = (url, method = 'GET') => new Promise((resolve, reject) => {
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const req = http.request(url, { method }, res => { let s = ''; res.on('data', b => { s += b; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } }); });
  req.on('error', reject); req.end();
});
const puertoLibre = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const conectar = async url => {
  const ws = new WebSocket(url); let id = 0; const pendientes = new Map();
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data), p = pendientes.get(m.id); if (!p) return;
    pendientes.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pendientes.delete(n); reject(Error('CDP_TIMEOUT_' + method)); }, 15000);
    pendientes.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluar = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error('Evaluación de navegador fallida: ' + r.exceptionDetails.text);
    return r.result?.value;
  };
  const cerrar = () => { ws.close(); for (const p of pendientes.values()) { clearTimeout(p.timer); p.reject(Error('NAVEGADOR_CERRADO')); } pendientes.clear(); };
  return { ws, send, evaluar, cerrar };
};
test('sesiones reales en Edge: tres roles, logout, Atrás/BFCache, cookies, bloqueo y empresas', { timeout: 240000 }, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const browser = process.env.PUBLIC_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert.ok(fs.existsSync(browser));
  const c = await crearFixture(t);
  const server = c.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`, puerto = await puertoLibre();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-sesiones-browser-'));
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run', '--no-default-browser-check',
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', `--remote-debugging-port=${puerto}`, `--user-data-dir=${path.join(artifacts, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const checks = [], screenshots = [], history = [], bfcacheNotUsed = [], responses = [], errors = [];
  let cd, secundaria, targetSecundaria, cargas = 0;
  const check = (nombre, valor) => { assert.ok(valor, nombre); checks.push(nombre); };
  const esperar = async (fn, nombre) => { for (let i = 0; i < 160; i++) { if (await fn()) return; await pausa(40); } throw Error('No se alcanzó: ' + nombre); };
  try {
    let target;
    for (let i = 0; i < 120; i++) { try { target = await jsonLocal(`http://127.0.0.1:${puerto}/json/new?about:blank`, 'PUT'); break; } catch {} await pausa(100); }
    assert.ok(target?.webSocketDebuggerUrl); cd = await conectar(target.webSocketDebuggerUrl);
    const { send, evaluar } = cd;
    cd.ws.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.method === 'Page.loadEventFired') cargas++;
      if (m.method === 'Runtime.exceptionThrown') errors.push('JavaScript');
      if (m.method === 'Runtime.bindingCalled' && m.params.name === 'historiaSesion') history.push(JSON.parse(m.params.payload));
      if (m.method === 'Page.backForwardCacheNotUsed') bfcacheNotUsed.push(m.params.notRestoredExplanations);
      if (m.method === 'Network.responseReceived' && m.params.type === 'Document') {
        const r = m.params.response;
        responses.push({ path: new URL(r.url).pathname, status: r.status, headers: r.headers, fromDiskCache: r.fromDiskCache });
      }
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    // Sin deshabilitar caché ni interceptar Fetch: se observa BFCache real.
    await send('Network.setBlockedURLs', { urls: ['https://*'] });
    await send('Runtime.addBinding', { name: 'historiaSesion' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('pageshow',e=>historiaSesion(JSON.stringify({path:location.pathname,persisted:e.persisted,autenticada:!!document.querySelector('[data-sesion-autenticada]'),oculta:document.documentElement.classList.contains('sesion-en-transicion')})))` });
    const go = async (ruta, esperado = ruta.split('?')[0]) => {
      const antes = cargas; await send('Page.navigate', { url: origin + ruta });
      await esperar(() => Promise.resolve(cargas > antes), 'carga ' + ruta);
      await esperar(() => evaluar(`location.pathname===${JSON.stringify(esperado)} && document.readyState==='complete'`), esperado);
    };
    const llenar = (selector, valor) => evaluar(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(valor)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const click = selector => evaluar(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const cookie = async () => (await send('Network.getCookies', { urls: [origin] })).cookies.find(v => v.name === 'marketing.sid')?.value;
    const ponerCookie = value => send('Network.setCookie', { name: 'marketing.sid', value, url: origin, httpOnly: true, sameSite: 'Lax', path: '/' });
    const login = async correo => {
      await go('/login'); const previa = await cookie();
      await llenar('#email', correo + '@example.test'); await llenar('#password', c.password); await click('button[type=submit]');
      await esperar(() => evaluar("location.pathname==='/panel' && document.readyState==='complete' && !!document.querySelector('[data-sesion-autenticada]')"), 'login ' + correo);
      check('login regenera identificador ' + correo, previa !== await cookie());
    };
    const abrirMenu = async () => {
      if (await evaluar("!document.querySelector('[data-menu-toggle]').hidden && document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')!=='true'")) await click('[data-menu-toggle]');
    };
    const salir = async () => {
      await abrirMenu(); await click('[data-cerrar-sesion] button');
      await esperar(() => evaluar("location.pathname==='/' && document.readyState==='complete' && !document.querySelector('[data-sesion-autenticada]')"), 'logout');
    };
    const capture = async nombre => {
      await pausa(220);
      check('sin desbordamiento ' + nombre, await evaluar('document.documentElement.scrollWidth<=innerWidth+1'));
      const metrics = await send('Page.getLayoutMetrics'), size = metrics.cssContentSize;
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
      fs.writeFileSync(path.join(artifacts, nombre + '.png'), Buffer.from(r.data, 'base64')); screenshots.push(nombre + '.png');
    };
    for (const width of [1440, 768, 390]) for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
      const etiqueta = rol + '-' + width, usuario = c.usuarios.find(u => u.rol === rol);
      await send('Network.clearBrowserCookies'); usuario.estadoAcceso = 'activo';
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      await go('/');
      check('anónimo ofrece acceso y registro ' + etiqueta, await evaluar("!!document.querySelector('a[href=\"/login\"]') && !!document.querySelector('a[href=\"/registro\"]')"));
      if (width === 1440 && rol === 'superadmin') {
        const segunda = await jsonLocal(`http://127.0.0.1:${puerto}/json/new?${encodeURIComponent(origin + '/')}`, 'PUT');
        targetSecundaria = segunda.id;
        secundaria = await conectar(segunda.webSocketDebuggerUrl); await secundaria.send('Runtime.enable');
        await esperar(() => secundaria.evaluar("document.readyState==='complete' && !!document.querySelector('a[href=\"/login\"]')"), 'segunda pestaña anónima');
      }
      await login(rol); const autentica = await cookie();
      check('panel e identidad por rol ' + etiqueta, await evaluar(`document.body.textContent.includes(${JSON.stringify(usuario.nombre)}) && document.body.textContent.includes(${JSON.stringify(rol === 'superadmin' ? 'Panel superadmin' : 'Empresa 1')})`));
      if (secundaria) {
        await esperar(() => secundaria.evaluar("!!document.querySelector('[data-sesion-autenticada]') && !document.querySelector('a[href=\"/login\"]')"), 'actualización de segunda pestaña');
        check('pestaña antigua actualiza acceso tras login', true); secundaria.cerrar(); secundaria = null;
        await send('Target.closeTarget', { targetId: targetSecundaria }); targetSecundaria = null;
      }
      await go('/login', '/panel'); check('GET login no cambia sesión ' + etiqueta, autentica === await cookie());
      await evaluar(`fetch('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'email=superadmin%40example.test&password=ignorada&rol=superadmin'}).then(r=>r.text()).then(()=>true)`);
      check('POST login antiguo conserva sesión ' + etiqueta, autentica === await cookie());
      await go('/campanas'); await go('/contactos/nuevo');
      // Atrás real con cookie intacta: permite observar restauraciones BFCache
      // cuando el navegador considere elegible una respuesta no-store.
      await evaluar('history.back()');
      await esperar(() => evaluar("location.pathname==='/campanas' && document.readyState==='complete' && !document.documentElement.classList.contains('sesion-en-transicion')"), 'Atrás entre módulos');
      check('Atrás autenticado revalida el módulo ' + etiqueta, true);
      await go('/contactos/nuevo');
      check('un solo logout POST fuera del formulario ' + etiqueta, await evaluar("document.querySelectorAll('[data-cerrar-sesion]').length===1 && document.querySelector('[data-cerrar-sesion]').method==='post' && !document.querySelector('main [data-cerrar-sesion]')"));
      await abrirMenu();
      check('logout visible y accesible ' + etiqueta, await evaluar("(()=>{const b=document.querySelector('[data-cerrar-sesion] button');return b.textContent.trim()==='Cerrar sesión' && b.getClientRects().length>0 && b.offsetHeight>=44})()"));
      if (width < 600) check('identidad en menú móvil ' + etiqueta, await evaluar("document.querySelector('.identidad-menu').getClientRects().length>0 && document.querySelector('.identidad-menu').textContent.includes('Empresa')" ) || rol === 'superadmin');
      await capture(etiqueta + '-privada');
      await salir();
      check('cookie eliminada ' + etiqueta, !await cookie());
      await evaluar('history.back()');
      await esperar(() => evaluar("location.pathname==='/login' && document.readyState==='complete' && !document.querySelector('[data-sesion-autenticada]')"), 'Atrás después del logout');
      check('Atrás exige login ' + etiqueta, true); await capture(etiqueta + '-atras');
      await ponerCookie(autentica); await go('/contactos', '/login'); check('cookie anterior rechazada ' + etiqueta, true);
      await login(rol); await c.expirar(usuario); await go('/panel', '/login'); check('sesión caducada rechazada ' + etiqueta, true);
      await login(rol); const bloqueada = await cookie();
      await go('/campanas'); await go('/contactos/nuevo'); usuario.estadoAcceso = 'bloqueado';
      await evaluar('history.back()');
      await esperar(() => evaluar("location.pathname==='/login' && document.readyState==='complete' && !document.querySelector('[data-sesion-autenticada]')"), 'Atrás con usuario bloqueado');
      check('Atrás con cuenta bloqueada revalida y deniega acceso ' + etiqueta, true);
      usuario.estadoAcceso = 'activo';
      await ponerCookie(bloqueada); await go('/panel', '/login'); check('bloqueo destruye sesión, reactivar no la resucita ' + etiqueta, true);
      await login(rol);
      if (width === 1440) {
        const registro = Object.entries(await c.sesiones()).find(([,s]) => s.usuarioId === String(usuario._id));
        assert.ok(registro);
        await new Promise((resolve, reject) => c.store.destroy(registro[0], e => e ? reject(e) : resolve()));
        await go('/panel', '/login'); check('revocación externa aplicada ' + etiqueta, true);
        await login(rol);
      }
      const previaBloqueo = await cookie();
      // Simular el mismo cambio persistido del controlador de bloqueo sin una
      // petición del usuario entre bloqueo y reactivación.
      usuario.estadoAcceso = 'bloqueado'; usuario.versionSesion = (usuario.versionSesion ?? 0) + 1; usuario.estadoAcceso = 'activo';
      await go('/panel', '/login');
      await ponerCookie(previaBloqueo); await go('/panel', '/login');
      check('bloqueo y reactivación sin petición intermedia revocan cookie ' + etiqueta, true);
      await login(rol);
      await evaluar("document.cookie='rol=superadmin; path=/'");
      if (rol !== 'superadmin') { await go('/admin/empresas/nueva?rol=superadmin'); check('rol manipulado denegado ' + etiqueta, await evaluar("document.querySelector('h1').textContent.includes('Acceso')")); }
      if (rol !== 'admin_empresa') { await go('/empresa/gmail'); check('Gmail restringido ' + etiqueta, await evaluar("document.querySelector('h1').textContent.includes('Acceso')")); }
      await salir();
    }
    for (const [correo, otra] of [['admin_empresa', 1], ['admin2', 0]]) {
      await login(correo);
      for (const ruta of [`/campanas/${c.campanas[otra]._id}`, `/contactos/${c.contactos[otra]._id}`, `/empresa/usuarios/${c.usuarios[otra === 1 ? 4 : 2]._id}`]) {
        await go(ruta); check('empresa ajena no accesible ' + correo + ' ' + ruta, responses.at(-1).status === 404);
      }
      await salir();
    }
    const privadas = responses.filter(r => !['/', '/login'].includes(r.path));
    check('no-store en respuestas privadas, errores y redirecciones', privadas.every(r => Object.entries(r.headers).some(([k,v]) => k.toLowerCase() === 'cache-control' && v.includes('no-store'))));
    check('restauraciones privadas desde BFCache permanecen ocultas hasta revalidar', history.filter(e => e.persisted && e.autenticada).every(e => e.oculta));
    check('sin errores JavaScript', errors.length === 0);
    const report = { checks, screenshots, history, bfcacheNotUsed, responses: responses.map(({headers,...r}) => ({...r,cacheControl:headers['Cache-Control'] || headers['cache-control']})), errors,
      roles: ['superadmin','admin_empresa','operador'], widths:[1440,768,390], mongoReal:false, proveedoresReales:false };
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ artifacts, checks:checks.length, screenshots:screenshots.length, restauracionesBFCache:history.filter(e=>e.persisted).length, restauracionesPrivadasBFCache:history.filter(e=>e.persisted&&e.autenticada).length, errors:errors.length }));
  } catch (e) {
    fs.writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ checks,history,bfcacheNotUsed,errors,failure:e.message }, null, 2));
    console.log('EVIDENCIA_PARCIAL', artifacts); throw e;
  } finally {
    secundaria?.cerrar();
    if (cd) { await cd.send('Browser.close').catch(() => {}); cd.cerrar(); }
    if (child.exitCode === null) child.kill();
    server.closeAllConnections(); await new Promise(r => server.close(r));
  }
});
