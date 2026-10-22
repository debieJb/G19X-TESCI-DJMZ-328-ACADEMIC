(() => {
  'use strict';
  const formulario = document.getElementById('formularioDestinatarios');
  const todos = document.getElementById('seleccionarTodosContactos');
  const contador = document.getElementById('contadorContactos');
  const aviso = document.getElementById('avisoLimiteContactos');
  const guardar = document.getElementById('guardarPreparacion');
  if (!formulario || !todos || !contador || !aviso || !guardar) return;
  const contactos = Array.from(formulario.querySelectorAll('input[type="checkbox"][name="contactos"]'));
  const limite = Number(formulario.dataset.maxDestinatarios);
  const tipo = document.getElementById('tipo-envio');
  const etiquetas = document.getElementById('etiquetas-envio');
  function actualizar() {
    const cantidad = contactos.filter(c => c.checked).length;
    const valido = Number.isSafeInteger(limite) && limite > 0;
    todos.checked = contactos.length > 0 && cantidad === contactos.length;
    todos.indeterminate = cantidad > 0 && cantidad < contactos.length;
    todos.disabled = contactos.length === 0;
    contador.textContent = `${cantidad} de ${contactos.length} contactos seleccionados`;
    aviso.textContent = !valido ? 'La configuración del límite de destinatarios no está disponible.'
      : cantidad > limite ? `Has superado el límite de destinatarios permitido para esta campaña. Máximo: ${limite}. Seleccionados: ${cantidad}` : '';
    aviso.hidden = !aviso.textContent;
    guardar.disabled = !valido || cantidad === 0 || cantidad > limite;
    return !guardar.disabled;
  }
  todos.addEventListener('change', () => {
    if (tipo) tipo.value = 'contactos';
    contactos.forEach(contacto => { contacto.checked = todos.checked; });
    actualizar();
  });
  contactos.forEach(contacto => contacto.addEventListener('change', () => {
    if (tipo) tipo.value = 'contactos';
    actualizar();
  }));
  function seleccionarSegmento() {
    if (tipo.value === 'contactos') return actualizar();
    const seleccion = Array.from(etiquetas?.selectedOptions || []).map(o => o.value);
    contactos.forEach(contacto => {
      const propias = JSON.parse(contacto.dataset.etiquetas || '[]');
      contacto.checked = tipo.value === 'todos' || propias.some(e => seleccion.includes(e));
    });
    actualizar();
  }
  tipo?.addEventListener('change', seleccionarSegmento);
  etiquetas?.addEventListener('change', seleccionarSegmento);
  formulario.addEventListener('submit', evento => { if (!actualizar()) evento.preventDefault(); });
  actualizar();
})();
