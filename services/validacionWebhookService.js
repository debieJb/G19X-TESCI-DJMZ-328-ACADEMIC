const ErrorAutomatizacion = require('./ErrorAutomatizacion');

// Validación compartida por el esquema y la ejecución; no consulta DNS ni la red.
const validarFormatoUrl = valor => {
  try {
    if (typeof valor !== 'string' || !/^https?:\/\//i.test(valor)
      || /[\s\\\u0000-\u001f\u007f]/.test(valor)) throw new Error();
    const url = new URL(valor);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname
      || url.username || url.password || url.hash || valor.includes('#')) throw new Error();
    return url;
  } catch { throw new ErrorAutomatizacion('CONFIGURACION'); }
};

const validarUrl = valor => {
  const url = validarFormatoUrl(valor);
  const lista = process.env.N8N_WEBHOOK_ORIGENES_PERMITIDOS;
  const produccion = process.env.NODE_ENV === 'production';
  // Desarrollo conserva webhooks HTTP locales. Producción requiere HTTPS y
  // restringe el origen al global administrado o a los declarados explícitamente.
  if (produccion && url.protocol !== 'https:') throw new ErrorAutomatizacion('CONFIGURACION');
  if (produccion || lista !== undefined) {
    const permitidos = new Set();
    if (lista !== undefined) {
      for (const entrada of lista.split(',')) {
        const origen = validarFormatoUrl(entrada.trim());
        if (origen.pathname !== '/' || origen.search || (produccion && origen.protocol !== 'https:')) {
          throw new ErrorAutomatizacion('CONFIGURACION');
        }
        permitidos.add(origen.origin);
      }
    } else if (process.env.N8N_WEBHOOK_URL) {
      permitidos.add(validarFormatoUrl(process.env.N8N_WEBHOOK_URL).origin);
    }
    if (!permitidos.has(url.origin)) throw new ErrorAutomatizacion('CONFIGURACION');
  }
  return url;
};

module.exports = { validarFormatoUrl, validarUrl };
