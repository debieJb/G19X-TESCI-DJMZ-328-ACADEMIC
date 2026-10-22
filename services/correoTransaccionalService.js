// No hay proveedor real predeterminado ni activación mediante variables de entorno.
const crearCorreoTransaccional = ({ transporte, autorizado = false, simulado = false, remitente, origenPublico, timeoutMs = 10000, entorno = process.env.NODE_ENV } = {}) => {
  if (!transporte || autorizado !== true) return Object.freeze({ disponible: false });
  if (simulado && !process.env.NODE_TEST_CONTEXT) throw new Error('TRANSPORTE_SIMULADO_SOLO_PRUEBAS');
  const origen = require('./origenTransaccionalService').validarOrigen(origenPublico, { entorno, simulado });
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
    || typeof transporte.enviar !== 'function' || typeof remitente !== 'string'
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(remitente)) throw new Error('PROVEEDOR_INVALIDO');
  const enviar = async ({ correo, token, recuperacion = false }) => {
    if (typeof token !== 'string' || !(recuperacion ? /^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/ : /^[A-Za-z0-9_-]{43}$/).test(token)
      || typeof correo !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(correo)) throw new Error('MENSAJE_INVALIDO');
    const enlace = new URL(recuperacion ? '/recuperar/restablecer' : '/registro/verificar', origen);
    if (recuperacion) enlace.hash = new URLSearchParams({ token }).toString();
    else enlace.searchParams.set('token', token);
    // El adaptador recibe datos solo en memoria; no registrar petición ni respuesta.
    const abort = new AbortController(); let timer;
    try {
      return await Promise.race([
        transporte.enviar({ remitente, destino: correo, asunto: recuperacion ? 'Recupera tu contraseña de PluriOne' : 'Verifica el correo de tu empresa',
          texto: recuperacion
            ? `Recibimos una solicitud para recuperar tu acceso a PluriOne.\nAbre ${enlace.href}\nEl enlace caduca en 15 minutos y solo puede utilizarse una vez.\nSi tu navegador no completa el código, pega este código en la pantalla de recuperación:\n${token}\nSi no lo solicitaste, ignora este mensaje. Tu contraseña no cambia hasta que confirmes una nueva.`
            : `Confirma tu solicitud en ${enlace.href}\nEl enlace caduca en 30 minutos. Si no lo solicitaste, ignóralo.` }, { signal: abort.signal }),
        new Promise((resolve, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('ENTREGA_INCIERTA')); }, timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  };
  return Object.freeze({ disponible: true,
    enviarVerificacion: datos => enviar(datos),
    enviarRecuperacion: datos => enviar({ ...datos, recuperacion: true }) });
};
module.exports = { crearCorreoTransaccional, predeterminado: crearCorreoTransaccional() };
