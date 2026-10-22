'use strict';
(() => {
  const enlaces = [...document.querySelectorAll('[data-revisar-envio]')];
  for (const id of new Set(enlaces.map(e => e.dataset.revisarEnvio))) {
    if (!/^[a-f0-9]{24}$/.test(id)) continue;
    fetch(`/campanas/${id}/gmail/ejecucion`, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' })
      .then(r => { if (!r.ok) throw Error('HISTORIAL_NO_DISPONIBLE'); return r.json(); })
      .then(datos => {
        if (!datos.ejecucion && !(datos.envios || []).length) return;
        for (const enlace of enlaces.filter(e => e.dataset.revisarEnvio === id)) {
          enlace.textContent = 'Ver resultado'; enlace.href = `/campanas/${id}/historial#historial`;
        }
        const envios = datos.envios || [];
        const estado = envios.some(e => e.estado === 'incierto') ? 'Resultado incierto'
          : envios.some(e => ['reservado', 'enviando', 'pendiente'].includes(e.estado)) ? 'Enviando'
            : envios.length && envios.every(e => e.estado === 'aceptado') ? 'Enviada a Gmail' : 'Error';
        for (const etiqueta of document.querySelectorAll('[data-estado-envio]')) if (etiqueta.dataset.estadoEnvio === id) etiqueta.textContent = estado;
      }).catch(() => {}); // La revisión del servidor sigue disponible; nunca reenviar ni reintentar.
  }
})();
