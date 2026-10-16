const { spawn } = require('node:child_process');
const path = require('node:path');
// Una sola unidad, sin reinicios. Una terminacion forzada exige conciliar el estado persistido.
const crearSupervisor = () => {
  let activo = false;
  return { ejecutar: async ({ comprobar = true, envioId, timeoutMs = 45000, signal } = {}) => {
    if (activo) throw Error('TRABAJADOR_YA_ACTIVO');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw Error('PLAZO_INVALIDO');
    if (comprobar) require('./infraestructuraPilotoService').asegurarEnvioApagado();
    else if (!require('../config/enviosGmail').obtenerPolitica().habilitado || !/^[a-f0-9]{24}$/.test(envioId || '')) throw Error('EJECUCION_BLOQUEADA');
    if (signal?.aborted) return { estado: 'cancelado_antes_del_arranque', pid: null };
    activo = true;
    try {
      return await new Promise(resolve => {
        const hijo = spawn(process.execPath, [path.join(__dirname, '../scripts/procesarEnvioGmail.js'), comprobar ? '--comprobar' : envioId],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        let salida = '', motivo;
        const parar = razon => { motivo ||= razon; hijo.kill(); };
        const cancelar = () => parar('interrumpido_resultado_por_conciliar');
        const timer = setTimeout(() => parar('plazo_agotado_resultado_por_conciliar'), timeoutMs);
        signal?.addEventListener('abort', cancelar, { once: true });
        hijo.stdout.on('data', parte => { if (salida.length < 512) salida += parte.toString().slice(0, 512 - salida.length); });
        const limpiar = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancelar); };
        hijo.once('error', () => { limpiar(); resolve({ estado: 'arranque_fallido', pid: hijo.pid || null }); });
        hijo.once('close', codigo => {
          limpiar();
          let estado = motivo || (codigo === 0 ? 'finalizado_revisar_persistencia' : 'fallo_resultado_por_conciliar');
          if (comprobar && codigo === 0 && salida.trim() === '{"estado":"comprobacion_sin_envios"}') estado = 'comprobacion_sin_envios';
          resolve({ estado, pid: hijo.pid || null, codigo, reinicios: 0 });
        });
      });
    } finally { activo = false; }
  } };
};
module.exports = { crearSupervisor };
