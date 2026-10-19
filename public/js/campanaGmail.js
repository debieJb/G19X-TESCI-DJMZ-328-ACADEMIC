'use strict';
(() => {
  const panel = document.querySelector('[data-campana-gmail]'); if (!panel) return;
  const form = panel.querySelector('form'), boton = form.querySelector('button');
  const estado = panel.querySelector('[data-estado-gmail]'), salida = panel.querySelector('[data-resultado-gmail]');
  try {
    const nombre = `campana-gmail:${panel.dataset.campanaGmail}`;
    let clave = sessionStorage.getItem(nombre);
    if (!/^[a-f0-9]{48}$/.test(clave || '')) {
      clave = [...crypto.getRandomValues(new Uint8Array(24))].map(v => v.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(nombre, clave);
    }
    form.elements.idempotencia.value = clave; boton.disabled = panel.dataset.envioBloqueado === 'true';
  } catch { estado.textContent = 'No se pudo conservar la clave de confirmación. Revisa el almacenamiento del navegador.'; }
  let ocupado = false;
  const solicitar = async datos => {
    if (ocupado) return; ocupado = true; boton.disabled = true;
    try {
      const respuesta = await fetch(datos ? form.action : `/campanas/${panel.dataset.campanaGmail}/gmail/ejecucion`, {
        method: datos ? 'POST' : 'GET', body: datos, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
      if (!respuesta.ok) throw new Error('Revisa sesión, preparación, permisos y disponibilidad. Consulta el historial antes de volver a confirmar.');
      const resultado = await respuesta.json();
      estado.textContent = datos ? 'Confirmación registrada. El trabajador procesará los envíos cuando corresponda.' : 'Historial actualizado. Aceptado por API no acredita recepción.';
      if (!datos) salida.textContent = (resultado.envios || []).map(e => `${e._id}: ${e.estado} | ${e.codigo || 'Pendiente'} | Intentos: ${e.intentos || 0} | Gmail: ${e.gmailId || '—'}\n${(e.historial || []).map(h => `${h.fecha}: ${h.estado} / ${h.codigo}`).join('\n')}`).join('\n\n') || 'Sin ejecución registrada.';
    } catch (e) { estado.textContent = e.message || 'Resultado desconocido. Consulta el historial.'; }
    finally { ocupado = false; boton.disabled = !form.elements.idempotencia.value || panel.dataset.envioBloqueado === 'true'; }
  };
  form.addEventListener('submit', e => { e.preventDefault(); if (panel.dataset.envioBloqueado !== 'true' && form.reportValidity()) solicitar(new URLSearchParams(new FormData(form))); });
  panel.querySelector('[data-historial-gmail]').addEventListener('click', () => solicitar());
})();
