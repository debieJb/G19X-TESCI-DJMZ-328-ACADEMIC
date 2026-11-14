'use strict';
// Ejecución explícita contra un mongod NUEVO y temporal. Nunca carga .env ni conecta 27017/27018.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const mongoose = require('mongoose');
const esperar = ms => new Promise(r => setTimeout(r,ms));
async function ejecutar(binario) {
  if (!binario || !path.isAbsolute(binario)) throw Error('INDICA_RUTA_ABSOLUTA_A_MONGOD');
  const tmpRoot = await fs.realpath(os.tmpdir());
  const carpeta = await fs.mkdtemp(path.join(tmpRoot,'plurione-scoring-'));
  const probe = net.createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const puerto = probe.address().port; await new Promise(r => probe.close(r));
  assert.ok(![27017,27018].includes(puerto));
  const proceso = spawn(binario, ['--dbpath',carpeta,'--port',String(puerto),'--bind_ip','127.0.0.1',
    '--logpath',path.join(carpeta,'mongo.log'),'--wiredTigerCacheSizeGB','0.25'], { windowsHide:true, stdio:'ignore' });
  let falloProceso;
  proceso.on('error', e => { falloProceso=e; });
  let client;
  try {
    for (let i=0;i<100;i++) {
      if (falloProceso) throw falloProceso;
      if (proceso.exitCode !== null) throw Error('MONGOD_TEMPORAL_NO_INICIO');
      client = new mongoose.mongo.MongoClient(`mongodb://127.0.0.1:${puerto}/admin?directConnection=true`, { serverSelectionTimeoutMS:200 });
      try { await client.connect(); break; } catch { await client.close(); client=null; await esperar(100); }
    }
    assert.ok(client,'MongoDB temporal disponible');
    const admin = client.db('admin');
    const { parsed } = await admin.command({ getCmdLineOpts:1 });
    const status = await admin.command({ serverStatus:1 });
    assert.equal(path.resolve(parsed.storage.dbPath),path.resolve(carpeta));
    assert.equal(parsed.net.port,puerto); assert.equal(status.pid,proceso.pid);
    await client.close(); client=null;
    // Única conexión de aplicación: base aleatoria en el proceso que acabamos de identificar.
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/scoring_fixture?directConnection=true`, { autoIndex:false,autoCreate:false });
    const Contacto = require('../models/Contacto');
    const Evento = require('../models/EventoMarketing');
    const scoring = require('../services/leadScoringService');
    await Contacto.createCollection();
    await require('../scripts/prepararIndicesLeadScoring').prepararIndices(mongoose.connection);
    await require('../scripts/prepararIndicesLeadScoring').prepararIndices(mongoose.connection);
    const a=new mongoose.Types.ObjectId(), b=new mongoose.Types.ObjectId(), actor=new mongoose.Types.ObjectId();
    const [c1,c2,c3] = await Contacto.create([
      { nombre:'A',email:'a@example.test',empresa:a,etiquetas:['vip'] },
      { nombre:'B',email:'b@example.test',empresa:b },
      { nombre:'Sin historia',email:'c@example.test',empresa:a }
    ]);
    const usuario={ _id:actor,rol:'admin_empresa',empresa:a };
    const datos=(tipo,referenciaExterna)=>({ tipo,referenciaExterna,evidencia:'Folio comprobado de prueba',confirmar:'true',ocurridoEn:new Date(Date.now()-60000).toISOString() });
    const registro=datos('conversion_confirmada','venta-1');
    const resultados = await Promise.all([1,2,3,4].map(()=>scoring.registrarEvento({usuario,contactoId:String(c1._id),entrada:registro})));
    assert.equal(resultados.filter(r=>!r.duplicado).length,1);
    assert.equal(await Evento.countDocuments({}),1);
    await scoring.registrarEvento({usuario,contactoId:String(c1._id),entrada:datos('conversion_confirmada','venta-2')});
    const lista = await scoring.listar(usuario,{prioridad:'alto',activo:'true',etiqueta:'vip',min:'75',max:'90'});
    assert.equal(lista.contactos.length,1); assert.equal(lista.contactos[0].puntos,80);
    assert.equal(lista.contactos[0].nivel,'alto');
    assert.equal((await scoring.listar(usuario,{prioridad:'bajo'})).contactos[0].nombre,c3.nombre);
    await assert.rejects(scoring.registrarEvento({usuario,contactoId:String(c2._id),entrada:registro}),{status:404});
    // Inválidos, no verificados y ajenos inyectados en la fixture no afectan la puntuación.
    await Evento.collection.insertMany([
      { empresa:a,contacto:c1._id,tipo:'conversion_confirmada',origen:'integracion_verificada',referenciaExterna:'sinverificar',ocurridoEn:new Date(),verificado:false,evidencia:'Folio de prueba',registradoPor:actor },
      { empresa:b,contacto:c1._id,tipo:'conversion_confirmada',origen:'integracion_verificada',referenciaExterna:'ajeno',ocurridoEn:new Date(),verificado:true,evidencia:'Folio de prueba',registradoPor:actor },
      { empresa:a,contacto:c1._id,tipo:'conversion_confirmada',origen:'integracion_verificada',referenciaExterna:'viejo',ocurridoEn:new Date(Date.now()-91*86400000),verificado:true,evidencia:'Folio de prueba',registradoPor:actor },
      { empresa:a,contacto:c1._id,tipo:'conversion_confirmada',origen:'integracion_verificada',referenciaExterna:'sin-evidencia',ocurridoEn:new Date(),verificado:true,registradoPor:actor }
    ]);
    for (const [campo, valor] of [['verificado',[true]],['registradoPor',[actor]],['evidencia',['Folio de prueba']],['referenciaExterna',['ref']],['tipo',['conversion_confirmada']]]) {
      await Evento.collection.insertOne({ empresa:a,contacto:c1._id,tipo:'conversion_confirmada',origen:'integracion_verificada',referenciaExterna:'invalido-'+campo,
        ocurridoEn:new Date(),verificado:true,evidencia:'Folio de prueba',registradoPor:actor,[campo]:valor });
    }
    assert.equal((await scoring.listar(usuario,{})).contactos.find(c=>String(c._id)===String(c1._id)).puntos,80);
    const historial=await scoring.historial(c1);
    assert.equal(historial.puntos,80);assert.equal(historial.eventos.length,3);
    assert.ok(+historial.eventos[0].ocurridoEn >= +historial.eventos[1].ocurridoEn);
    await scoring.registrarEvento({usuario,contactoId:String(c1._id),entrada:datos('solicitud_contacto','solicitud')});
    assert.equal((await scoring.listar(usuario,{})).contactos.find(c=>String(c._id)===String(c1._id)).puntos,100);
    assert.equal((await scoring.obtenerPuntuacion({empresaId:String(a),contactoId:String(c1._id)})).puntos,100);
    await Contacto.insertMany(Array.from({length:31},(_,i)=>({empresa:a,nombre:'Pagina '+i,email:'pagina'+i+'@example.test'})));
    const primera=await scoring.listar(usuario,{prioridad:'bajo'}), segunda=await scoring.listar(usuario,{prioridad:'bajo',pagina:'2'});
    assert.equal(primera.contactos.length,30); assert.equal(primera.hayMas,true);
    assert.equal(segunda.contactos.length,2); assert.equal(segunda.hayMas,false);
    const paginaIds=new Set(primera.contactos.map(c=>String(c._id)));
    assert.ok(segunda.contactos.every(c=>!paginaIds.has(String(c._id))));
    console.log('MONGO_REAL_OK: idempotencia concurrente, indices, calculo, limite, filtros, historial y aislamiento; proceso temporal independiente.');
  } finally {
    await client?.close(); await mongoose.disconnect();
    if (proceso.pid && proceso.exitCode === null) {
      const cerrado=once(proceso,'exit'); proceso.kill(); await cerrado;
    }
    // Se elimina exclusivamente el directorio temporal recién creado, tras detener nuestro proceso.
    const real=await fs.realpath(carpeta);
    assert.equal(path.dirname(real),tmpRoot); assert.ok(path.basename(real).startsWith('plurione-scoring-'));
    await fs.rm(real,{ recursive:true,force:true });
  }
}
if (require.main===module) ejecutar(process.argv[2]).catch(e=>{ console.error(e);process.exitCode=1; });
module.exports={ ejecutar };
