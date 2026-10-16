// No hay proveedor real predeterminado ni activación mediante variables de entorno.
const crearCorreoTransaccional = ({ transporte, autorizado = false, simulado = false, remitente, origenPublico, timeoutMs = 10000 } = {}) => {
  if (!transporte || autorizado !== true) return Object.freeze({ disponible: false });
  if (simulado && !process.env.NODE_TEST_CONTEXT) throw new Error('TRANSPORTE_SIMULADO_SOLO_PRUEBAS');
  const origen = new URL(origenPublico);
  const local = ['127.0.0.1', 'localhost'].includes(origen.hostname);
  if ((origen.protocol !== 'https:' && !(simulado && local && origen.protocol === 'http:'))
    || origen.username || origen.password || origen.search || origen.hash || origen.pathname !== '/') throw new Error('ORIGEN_PUBLICO_INVALIDO');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
    || typeof transporte.enviar !== 'function' || typeof remitente !== 'string'
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(remitente)) throw new Error('PROVEEDOR_INVALIDO');
  return Object.freeze({ disponible: true, async enviarVerificacion({ correo, token }) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)
      || typeof correo !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(correo)) throw new Error('MENSAJE_INVALIDO');
    const enlace = new URL('/registro/verificar', origen);
    enlace.searchParams.set('token', token);
    // El adaptador recibe datos solo en memoria; no registrar petición ni respuesta.
    const abort = new AbortController(); let timer;
    try {
      await Promise.race([
        transporte.enviar({ remitente, destino: correo, asunto: 'Verifica el correo de tu empresa',
          texto: `Confirma tu solicitud en ${enlace.href}\nEl enlace caduca en 30 minutos. Si no lo solicitaste, ignóralo.` }, { signal: abort.signal }),
        new Promise((resolve, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('ENTREGA_INCIERTA')); }, timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  } });
};
module.exports = { crearCorreoTransaccional, predeterminado: crearCorreoTransaccional() };
