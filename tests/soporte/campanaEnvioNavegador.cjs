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
test('navegador: envio manual simple, historial y confirmacion con transporte simulado', {timeout:120000}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const browser = process.env.PUBLIC_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert.ok(fs.existsSync(browser));
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-campana-ux-'));
  const express = require('express'), app = express();
  app.set('view engine','ejs'); app.set('views',path.resolve(__dirname,'../../views'));
  app.use(express.static(path.resolve(__dirname,'../../public'))); app.use(express.urlencoded({extended:false}));
  const lote = process.env.MULTI_BROWSER_TEST === 'true';
  const posts = []; let aceptado = true, confirmado = false, aceptados = 2;
  const estado = () => lote ? { ejecucion: aceptado || confirmado ? '507f1f77bcf86cd799439017' : null, modoMotor: 'supervisado', envios: aceptado || confirmado ? [1,2].map(i => ({ contacto: String(i), destinatario: 'Contacto ' + i, estado: i <= aceptados ? 'aceptado' : 'pendiente', ...(i <= aceptados ? {gmailId:'referencia-simulada-' + i} : {}) })) : [] } : aceptado ? { ejecucion: 'fixture', envios: [{ estado: 'aceptado', gmailId: 'referencia-simulada', aceptadoEn: new Date().toISOString(), historial: [{ estado: 'aceptado', fecha: new Date().toISOString() }] }] } : { ejecucion: null, envios: [] };
  app.get('/campanas/:id/gmail/ejecucion', (req,res) => res.json(estado()));
  app.post('/campanas/:id/gmail/piloto/autorizar', (req,res) => { posts.push({ruta:'autorizar', body:req.body}); res.json({autorizacion:'fixture'}); });
  app.post('/campanas/:id/gmail/piloto/despachar', (req,res) => { posts.push({ruta:'despachar', body:req.body}); aceptado = true; res.json(estado()); });
  app.post('/campanas/:id/gmail/confirmar',(req,res)=>{posts.push({ruta:'confirmar',body:req.body});confirmado=true;aceptados=0;res.status(202).json({ejecucion:'507f1f77bcf86cd799439017',total:2});});
  app.post('/campanas/:id/gmail/supervisado/paso',(req,res)=>{posts.push({ruta:'paso',body:req.body});aceptados=Math.min(2,aceptados+1);aceptado=aceptados===2;res.json(estado());});
  let estadoCampana = 'activa'; const preparaciones = [];
  const datosVista = vista => {
    const datos = require('./internoFixtures.cjs').fixture(vista);
    Object.assign(datos, { manualSupervisado:true, pilotoDisponible:true, bloqueos:[], bloqueosEnvio:[], maxDestinatarios:1,
      puedePreparar:!aceptado, programada:false, autorizacion:null, ejecucion:aceptado ? {_id:'fixture'} : null, envios:estado().envios,
      estadoVisible:aceptado ? 'Enviada a Gmail' : estadoCampana === 'borrador' ? 'Borrador' : 'Lista para enviar' });
    if(lote) { const c={...datos.contactos[0],_id:'507f1f77bcf86cd799439018',nombre:'Contacto 2',email:'segundo@example.test'};datos.contactos.push(c);datos.campana.destinatarios.contactos.push(c._id);datos.supervisado=true;datos.maxDestinatarios=2;datos.revisionEnvio='a'.repeat(64);datos.revisionDestinatarios='b'.repeat(64); }
    datos.campana = {...datos.campana, estado:estadoCampana}; datos.campanas = [datos.campana];
    datos.evaluacion = {opciones:datos.contactos, validos:datos.contactos, excluidos:[]};
    datos.cancelar = '/campanas/'+datos.campana._id;
    datos.estado = {...datos.estado, correoAutorizado:'empresa@example.test', correoPrevisto:'empresa@example.test', estadoGmail:'conectada', identidadCoincide:true, permisoEnvio:true};
    if (vista === 'campanas/editar') { datos.titulo='Editar campana'; datos.datos.estado=estadoCampana; }
    return datos;
  };
  const cambiar = req => {
    if(req.query.nuevo==='1') {aceptado=false; confirmado=false;aceptados=0; estadoCampana='activa';}
    if(req.query.borrador==='1') {aceptado=false;confirmado=false;aceptados=0;estadoCampana='borrador';}
  };
  app.get(['/visual','/campanas/:id/enviar','/campanas/:id/historial'],(req,res)=>{cambiar(req);res.render('campanas/enviar',datosVista('campanas/enviar'));});
  app.get('/campanas',(req,res)=>{cambiar(req);res.render('campanas/index',datosVista('campanas/index'));});
  app.get('/campanas/:id/editar',(req,res)=>res.render('campanas/editar',datosVista('campanas/editar')));
  app.get('/campanas/:id',(req,res)=>res.render('campanas/detalle',datosVista('campanas/detalle')));
  app.post('/campanas/:id/editar',(req,res)=>res.redirect(303,'/campanas/'+req.params.id+'/enviar'));
  app.post('/campanas/:id/activar-preparar',(req,res)=>{preparaciones.push(req.body);estadoCampana='activa';res.redirect(303,'/campanas/'+req.params.id+'/enviar');});
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
    for (const width of [1440, 390]) {
      await viewport(width); await go('/visual');
      await waitFor("document.querySelector('[data-historial-campana]').textContent.includes('" + (lote ? 'referencia-simulada-2' : 'referencia-simulada') + "')");
      check('campana aceptada no ofrece repetir '+width, await evaluate("document.querySelector('[data-abrir-envio]').hidden && document.querySelector('[data-abrir-envio]').disabled"));
      check('sin controles internos '+width, await evaluate("!document.body.textContent.includes('Autorizar un intento') && !document.body.textContent.includes('Consultar resultado persistido')"));
      await capture('historial-'+width);
      const antes = posts.length;
      await evaluate('sessionStorage.clear()'); await go('/visual?nuevo=1');
      await waitFor("!document.querySelector('[data-abrir-envio]').disabled");
      await click('[data-abrir-envio]');
      check('dialogo de revision visible '+width, await evaluate("document.querySelector('dialog').open && document.querySelector('dialog').textContent.includes('empresa@example.test') && document.querySelector('dialog').textContent.includes('contacto@example.test')"));
      await capture('confirmacion-'+width);
      await click('[data-cancelar-envio]'); check('cancelar no envia '+width,posts.length===antes);
      await click('[data-abrir-envio]'); await click('[data-enviar-campana] button[type=submit]');
      await waitFor("document.querySelector('[data-historial-campana]').textContent.includes('" + (lote ? 'referencia-simulada-2' : 'referencia-simulada') + "')");
      check('una confirmacion realiza dos pasos internos '+width,posts.length===antes+(lote?3:2));
      check('seguridad de peticiones '+width,lote ? posts[antes].body.confirmacion==='ENVIAR' && posts[antes].body.revision && posts[antes].body.revisionDestinatarios==='b'.repeat(64) && posts[antes+1].body.confirmacion==='PROCESAR_CAMPANA_CONFIRMADA' && posts[antes+2].body._csrf : posts[antes].body.confirmacion==='AUTORIZAR_UN_ENVIO' && posts[antes+1].body.confirmacion==='ENVIAR_UN_CORREO_REAL' && posts[antes+1].body._csrf && /^[a-f0-9]{48}$/.test(posts[antes+1].body.idempotencia));
      await go('/visual');
      await waitFor("document.querySelector('[data-historial-campana]').textContent.includes('" + (lote ? 'referencia-simulada-2' : 'referencia-simulada') + "')");
      check('recarga no envia '+width,posts.length===antes+(lote?3:2));
    }
    for(const width of [1440,390]) {
      await viewport(width); await evaluate('sessionStorage.clear()'); await go('/campanas?borrador=1');
      await click('a[href="/campanas/507f1f77bcf86cd799439011/editar"]');
      await waitFor("location.pathname.endsWith('/editar') && document.readyState==='complete'");
      await click('button[name=continuar]');
      await waitFor("location.pathname.endsWith('/enviar') && !!document.querySelector('#contacto-envio')");
      const antes = posts.length;
      await click('form[action$="/activar-preparar"] button');
      await waitFor("document.body.textContent.includes('Lista para enviar') && document.readyState==='complete'");
      check('activar prepara sin enviar '+width,posts.length===antes);
      check('activacion transmite CSRF y contacto unico '+width,preparaciones.at(-1)._csrf && (lote ? preparaciones.at(-1).contactos.length===2 : preparaciones.at(-1).contactos==='507f1f77bcf86cd799439011'));
      await waitFor("!document.querySelector('[data-abrir-envio]').disabled");
      await capture('flujo-revision-'+width);
      await click('[data-abrir-envio]');await click('[data-enviar-campana] button[type=submit]');
      await waitFor("document.querySelector('[data-historial-campana]').textContent.includes('" + (lote ? 'referencia-simulada-2' : 'referencia-simulada') + "')");
      check('confirmacion unica desde recorrido completo '+width,posts.length===antes+(lote?3:2));
      await go('/campanas/507f1f77bcf86cd799439011');
      await waitFor("document.querySelector('[data-revisar-envio]').textContent.includes('Ver resultado')");
      await click('[data-revisar-envio]');
      await waitFor("location.pathname.endsWith('/historial') && document.querySelector('[data-historial-campana]').textContent.includes('referencia-simulada')");
      check('historial no repite envio '+width,posts.length===antes+(lote?3:2));
    }
    check('sin errores JS ni proveedores externos', errors.length === 0);
    fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify({checks,screenshots,errors,mongoUsed:false,externalProvidersUsed:false},null,2));
    console.log(JSON.stringify({checks:checks.length,screenshots:screenshots.length,artifacts,errors:errors.length}));
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
