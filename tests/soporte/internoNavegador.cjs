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
test('navegador interno: 23 vistas completas con fixtures sinteticas, sin Mongo ni proveedores', {timeout:120000}, async t => {
  assert.equal(process.env.NODE_ENV,'test');
  const browser=process.env.PUBLIC_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert.ok(fs.existsSync(browser),'Navegador no disponible');
  const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'ma-interno-browser-'));
  const {fixture,vistas}=require('./internoFixtures.cjs');
  const express=require('express'),app=express();
  app.set('view engine','ejs');app.set('views',path.resolve(__dirname,'../../views'));
  app.use(express.static(path.resolve(__dirname,'../../public')));
  app.get(['/visual/:grupo/:vista','/visual/:vista'],(req,res)=>{
    const vista=[req.params.grupo,req.params.vista].filter(Boolean).join('/');
    if(!vistas.includes(vista))return res.sendStatus(404);
    res.render(vista,fixture(vista,req.query.vacio==='1'));
  });
  app.use((req,res)=>res.sendStatus(404));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
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
    for(const width of [1440,390]){
      await viewport(width);
      for(const vista of vistas){
        await go('/visual/'+vista);
        check('h1 unico '+vista+' '+width,await evaluate("document.querySelectorAll('h1').length===1"));
        check('tema claro '+vista+' '+width,await evaluate("getComputedStyle(document.documentElement).colorScheme==='light' && document.querySelector('link[href=\"/css/interno.css\"]')"));
        check('campos accesibles '+vista+' '+width,await evaluate("[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].every(e=>e.labels.length>0)"));
        await capture(vista.replaceAll('/','-')+'-'+width);
        if(width===390){await click('[data-menu-toggle]');check('menu accesible '+vista,await evaluate("document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')==='true'"));await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});}
      }
      for(const vista of ['admin/dashboard','campanas/index','contactos/index']){await go('/visual/'+vista+'?vacio=1');await capture(vista.replaceAll('/','-')+'-vacio-'+width);}
    }
    check('sin errores JavaScript ni solicitudes externas',errors.length===0);
    fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({checks,screenshots,errors,visualFixtures:true,mongoUsed:false,externalProvidersUsed:false},null,2));
    console.log(JSON.stringify({browser:'Edge headless',vistas:vistas.length,checks:checks.length,screenshots:screenshots.length,artifacts,errors:errors.length}));
  } catch (e) {
    fs.writeFileSync(path.join(artifacts, 'failure.json'), JSON.stringify({ checks, screenshots, errors, failure: e.message }, null, 2));
    console.log('EVIDENCIA_PARCIAL', artifacts); throw e;
  } finally {
    if (ws?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); ws.close(); }
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('BROWSER_CLOSED')); }
    if (child.exitCode === null) child.kill();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
