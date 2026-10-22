/* Mejora de navegación; la autorización y revocación se comprueban en servidor. */
(() => {
  'use strict';
  const autenticada = !!document.querySelector('[data-sesion-autenticada]');
  const clave = 'plurione:estado-acceso';
  // Solo presencia de sesión, nunca IDs, roles, cookies, tokens o contraseñas.
  try {
    const estado = autenticada ? 'autenticada' : 'anonima';
    if (localStorage.getItem(clave) !== estado) localStorage.setItem(clave, estado);
  } catch { /* El cierre funciona también sin almacenamiento web. */ }
  window.addEventListener('storage', event => {
    if (event.key === clave && event.newValue !== (autenticada ? 'autenticada' : 'anonima')) location.reload();
  });
  window.addEventListener('pagehide', () => {
    if (autenticada) document.documentElement.classList.add('sesion-en-transicion');
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { location.reload(); return; }
    document.documentElement.classList.remove('sesion-en-transicion');
  });
})();
