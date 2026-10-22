(() => {
  'use strict';
  // El fragmento nunca se transmite en HTTP ni se guarda en la sesión del servidor.
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  const campo = document.getElementById('token');
  if (campo && typeof token === 'string' && /^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    campo.value = token; campo.type = 'hidden';
    document.getElementById('campo-codigo-recuperacion').hidden = true;
  }
})();
