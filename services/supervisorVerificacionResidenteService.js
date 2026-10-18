const { fork } = require('node:child_process');
const { setTimeout: pausa } = require('node:timers/promises');
const path = require('node:path');
const ejecutar = async ({ signal, crearHijo = fork, esperar = pausa, informar = () => {} } = {}) => {
  let reinicios = 0;
  while (!signal?.aborted) {
    const inicio = Date.now();
    const codigo = await new Promise(resolve => {
      const hijo = crearHijo(path.join(__dirname, '../scripts/trabajadorVerificacionResidente.js'), ['--autorizar-trabajador'],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
      let plazo;
      const parar = () => {
        if (hijo.connected) hijo.send('detener', () => {});
        // Ultimo recurso ante un proceso colgado: la reclamacion persistida nunca
        // se vuelve a enviar; al caducar se clasifica como incierta.
        plazo ||= setTimeout(() => { hijo.kill('SIGTERM'); }, 20000);
        plazo.unref();
      };
      const limpiar = () => { clearTimeout(plazo);signal?.removeEventListener('abort', parar); };
      signal?.addEventListener('abort', parar, { once: true });
      if (signal?.aborted) parar();
      hijo.once('error', () => { limpiar();resolve(1); });
      hijo.once('exit', code => { limpiar();resolve(code); });
    });
    if (signal?.aborted) return { estado: 'detenido', reinicios };
    if (codigo === 78) return { estado: 'bloqueado_configuracion_o_autorizacion', reinicios, codigo: 78 };
    if (Date.now() - inicio > 300000) reinicios = 0;
    if (++reinicios > 5) return { estado: 'reinicios_agotados', reinicios: 5, codigo: 1 };
    informar('REINICIO_TRABAJADOR_ESTADO_PERSISTIDO');
    try { await esperar(Math.min(30000, 1000 * 2 ** (reinicios - 1)), undefined, { signal }); }
    catch (e) { if (!signal?.aborted) throw e; }
  }
  return { estado: 'detenido', reinicios };
};
module.exports = { ejecutar };
