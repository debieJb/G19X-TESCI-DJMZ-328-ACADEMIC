'use strict';
(() => {
  const panel = document.querySelector('[data-piloto-gmail]');
  if (!panel) return;
  const estado = panel.querySelector('[data-piloto-estado]');
  const resultado = panel.querySelector('[data-piloto-resultado]');
  const formularios = [...panel.querySelectorAll('form')];
  const botones = [...panel.querySelectorAll('button')];
  let ocupado = false, claveDisponible = false;
  try {
    const campo = panel.querySelector('[name="idempotencia"]');
    const nombre = `piloto-gmail:${panel.dataset.campana}`;
    let clave = sessionStorage.getItem(nombre);
    if (!/^[a-f0-9]{48}$/.test(clave || '')) {
      clave = [...crypto.getRandomValues(new Uint8Array(24))].map(n => n.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(nombre, clave);
    }
    campo.value = clave; claveDisponible = true;
    panel.querySelector('[name="idempotencia"] ~ button').disabled = panel.dataset.bloqueado === 'true';
  } catch { estado.textContent = 'No se puede conservar la clave de idempotencia. El encolado permanece bloqueado.'; }
  const ejecutar = async (url, datos, accion) => {
    if (ocupado) return;
    ocupado = true; botones.forEach(b => { b.disabled = true; });
    estado.textContent = 'Procesando. No cierres esta página.';
    try {
      const res = await fetch(url, { method: datos ? 'POST' : 'GET', credentials: 'same-origin',
        redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' }, body: datos });
      if (!res.ok) {
        estado.textContent = res.status === 403 ? 'Sesión, CSRF o permisos no válidos. Inicia sesión y revisa el estado.'
          : res.status === 409 ? 'Autorización o ejecución en conflicto. Consulta el resultado; no generes otro intento.'
            : res.status === 422 ? 'Revisa preparación, consentimiento y confirmación.'
              : 'Servicio no disponible. Consulta el estado antes de continuar.';
        return;
      }
      const data = await res.json();
      if (accion === 'consultar' || accion === 'despachar') {
        const filas = Array.isArray(data.envios) ? data.envios : [];
        resultado.textContent = filas.length ? filas.map(e => `Envío: ${e._id}\nEstado: ${e.estado}\nCódigo: ${e.codigo || '—'}\nIntentos: ${e.intentos || 0}\nGmail ID: ${e.gmailId || '—'}`).join('\n\n') : 'Sin ejecución registrada.';
      }
      estado.textContent = accion === 'autorizar' ? 'Autorización registrada. Aún no se ha enviado correo.'
        : accion === 'encolar' ? 'Ejecución encolada. El trabajador supervisado debe procesarla; aún no acredita envío.'
          : accion === 'despachar' ? 'Revisa el estado persistido y confirma recepción en el buzón; no repitas el envío.'
          : accion === 'revocar' ? 'Revocación registrada. No retira mensajes ya enviados o en vuelo.'
            : 'Estado consultado. Aceptado significa aceptación API; confirma recepción en el buzón controlado.';
    } catch { estado.textContent = 'Resultado de la petición desconocido. Consulta el estado antes de actuar. No se reintenta automáticamente.'; }
    finally {
      ocupado = false; botones.forEach(b => { b.disabled = false; });
      if (!claveDisponible || panel.dataset.bloqueado === 'true') panel.querySelector('[name="idempotencia"] ~ button').disabled = true;
    }
  };
  formularios.forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity() || (['encolar', 'despachar'].includes(form.dataset.pilotoAccion) && !claveDisponible)) return;
    ejecutar(form.action, new URLSearchParams(new FormData(form)), form.dataset.pilotoAccion);
  }));
  panel.querySelector('[data-piloto-consultar]').addEventListener('click', () => ejecutar(`/campanas/${panel.dataset.campana}/gmail/ejecucion`, null, 'consultar'));
})();
