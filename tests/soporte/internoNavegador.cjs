// Ejecución explícita: NODE_ENV=test node --test tests/soporte/internoNavegador.cjs
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
test('navegador: todas las vistas y estados con fixtures, escritorio/tablet/móvil sin proveedores', {timeout:240000}, async t => {
  assert.equal(process.env.NODE_ENV,'test');
  const browser=process.env.PUBLIC_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert.ok(fs.existsSync(browser),'Navegador no disponible');
  const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'ma-interno-browser-'));
  const {fixture,vistas}=require('./internoFixtures.cjs');
  const { casos, fixturePublico } = require('./publicoFixtures.cjs');
  const paginas = [...vistas, ...casos.map(caso => 'publico/' + caso)];
  const express=require('express'),app=express();
  app.set('view engine','ejs');app.set('views',path.resolve(__dirname,'../../views'));
  app.use(express.static(path.resolve(__dirname,'../../public')));
  app.use(express.urlencoded({ extended: false }));
  const confirmacionesGmail = [];
  app.post('/campanas/:id/gmail/confirmar', (req, res) => {
    confirmacionesGmail.push(req.body);
    res.status(202).json({ total: 1, ejecucion: 'fixture-sin-envio' });
  });
  app.get('/campanas/:id/gmail/ejecucion', (req, res) => res.json({ envios: [{ _id: 'fixture', estado: 'aceptado', codigo: 'ACEPTADO_API', intentos: 1, gmailId: 'id-simulado' }] }));
  app.get(['/visual/:grupo/:vista','/visual/:vista'],(req,res)=>{
    const vista=[req.params.grupo,req.params.vista].filter(Boolean).join('/');
    if (req.params.grupo === 'publico' && casos.includes(req.params.vista)) {
      const publico = fixturePublico(req.params.vista); return res.render(publico.vista, publico.datos);
    }
    if(!vistas.includes(vista))return res.sendStatus(404);
    const datos = fixture(vista,req.query.vacio==='1');
    if (req.query.automatico === '1') Object.assign(datos, { envioAutomatico: true, revisionEnvio: 'a'.repeat(64), configurado: true });
    res.render(vista, datos);
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
    // Esperar las transiciones de mejora progresiva (p. ej. botones habilitados
    // por JS) antes de medir sus colores y capturar el resultado estable.
    await pause(220);
  };
  const heading = text => waitFor(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(text)}) && document.readyState==='complete'`);
  const fill = async (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const viewport = (width, height = 1000) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const capture = async name => {
    const desborde = await evaluate(`({ancho:innerWidth,total:document.documentElement.scrollWidth,elementos:[...document.querySelectorAll('main,header,nav,section,article,.tabla-admin')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,clase:e.className,ancho:e.getBoundingClientRect().width})).slice(0,8)})`);
    check(`sin desbordamiento en ${name} ${JSON.stringify(desborde)}`, desborde.total <= desborde.ancho + 1);
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
    for(const width of [1440,768,390,320]){
      await viewport(width);
      for(const vista of paginas){
        await go('/visual/'+vista);
        check('h1 unico '+vista+' '+width,await evaluate("document.querySelectorAll('h1').length===1"));
        check('tema claro '+vista+' '+width,await evaluate("getComputedStyle(document.documentElement).colorScheme==='light' && document.querySelector('link[href=\"/css/publico.css\"]')"));
        check('UTF-8 correcto '+vista+' '+width,await evaluate("!/[\\uFFFD]|\\u00c3[\\u0080-\\u00bf]|\\u00c2[\\u0080-\\u00bf]/.test(document.body.textContent)"));
        check('campos accesibles '+vista+' '+width,await evaluate("[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].every(e=>e.labels.length>0)"));
        check('IDs unicos '+vista+' '+width,await evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size})()"));
        const contraste = await evaluate('(' + function () {
          const rgb = s => s.match(/[\d.]+/g).map(Number);
          const luminancia = c => c.slice(0, 3).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; })
            .reduce((a, x, i) => a + x * [.2126, .7152, .0722][i], 0);
          const fondo = el => {
            for (; el; el = el.parentElement) {
              const estilo = getComputedStyle(el), c = rgb(estilo.backgroundColor);
              if (estilo.backgroundImage !== 'none') return null;
              if (c.length === 3 || c[3] === 1) return c;
            }
            return [255, 255, 255];
          };
          return [...document.querySelectorAll('main label,main button:not(:disabled),main .insignia,main .aviso-error')].map(el => {
            if (!el.getClientRects().length) return null;
            const bg = fondo(el); if (!bg) return null;
            const valores = [luminancia(rgb(getComputedStyle(el).color)), luminancia(bg)].sort((a, b) => b - a);
            const ratio = (valores[0] + .05) / (valores[1] + .05);
            return ratio >= 4.5 ? null : { texto: el.textContent.trim().slice(0, 60), color: getComputedStyle(el).color, bg, ratio };
          }).filter(Boolean);
        }.toString() + ')()');
        check('contraste de controles y estados '+vista+' '+width+' '+JSON.stringify(contraste), contraste.length === 0);
        await capture(vista.replaceAll('/','-')+'-'+width);
        if(width<760){
          await click('[data-menu-toggle]');
          check('menu accesible '+vista,await evaluate("document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')==='true'"));
          check('menu sin desbordamiento '+vista,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
          await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});
          check('Escape y foco '+vista,await evaluate("document.querySelector('#navegacion-publica').hidden && document.activeElement.matches('[data-menu-toggle]')"));
        }
      }
      for(const vista of ['admin/dashboard','campanas/index','contactos/index']){await go('/visual/'+vista+'?vacio=1');await capture(vista.replaceAll('/','-')+'-vacio-'+width);}
    }
    for (const width of [1440, 768, 390]) {
      await viewport(width); await go('/visual/empresa/gmail?automatico=1');
      check('Gmail solicita email y nunca contraseña Google ' + width, await evaluate("document.querySelector('#emailGmail').required && !document.querySelector('input[type=password]')"));
      await capture('gmail-conectar-' + width);
      await go('/visual/campanas/automatizacion?automatico=1');
      await waitFor("!document.querySelector('[data-confirmar-gmail] button').disabled");
      check('confirmación explícita requerida ' + width, await evaluate("document.querySelector('[data-confirmar-gmail] input[type=checkbox]').required"));
      await click('[data-confirmar-gmail] input[type=checkbox]'); await click('[data-confirmar-gmail] button');
      await waitFor("document.querySelector('[data-estado-gmail]').textContent.includes('Confirmación registrada')");
      await click('[data-historial-gmail]'); await waitFor("document.querySelector('[data-resultado-gmail]').textContent.includes('ACEPTADO_API')");
      check('sin formularios anidados ' + width, await evaluate("!document.querySelector('form form')"));
      await capture('gmail-confirmacion-historial-' + width);
    }
    check('POST navegador transmite CSRF, confirmación, revisión e idempotencia', confirmacionesGmail.length === 3 && confirmacionesGmail.every(d => d._csrf && d.confirmacion === 'ENVIAR' && d.revision === 'a'.repeat(64) && /^[a-f0-9]{48}$/.test(d.idempotencia)));
    check('sin errores JavaScript ni solicitudes externas',errors.length===0);
    fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({checks,screenshots,errors,visualFixtures:true,mongoUsed:false,externalProvidersUsed:false},null,2));
    console.log(JSON.stringify({browser:'Edge headless',vistasInternas:vistas.length,estadosPublicos:casos.length,anchos:[1440,768,390,320],checks:checks.length,screenshots:screenshots.length,artifacts,errors:errors.length}));
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
