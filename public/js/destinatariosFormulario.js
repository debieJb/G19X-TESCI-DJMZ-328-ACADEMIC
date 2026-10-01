(() => {
  const tipo = document.getElementById('destinatarios-tipo');
  const canal = document.getElementById('canal');
  const contactos = document.getElementById('destinatarios-contactos');
  const etiquetas = document.getElementById('destinatarios-etiquetas');
  const estimacion = document.getElementById('destinatarios-estimacion');
  if (!tipo || !canal || !contactos || !etiquetas || !estimacion) return;
  const empresa = document.getElementById('empresa');
  const empresaCargada = empresa?.value;
  const actualizar = () => {
    contactos.hidden = tipo.value !== 'contactos';
    etiquetas.hidden = tipo.value !== 'etiquetas';
    if (empresa && empresa.value !== empresaCargada) {
      estimacion.textContent = 'Carga los contactos de la empresa seleccionada para actualizar las opciones.';
      return;
    }
    if (!tipo.value) { estimacion.textContent = 'Sin configurar: se conserva el flujo anterior.'; return; }
    const elegidas = new Set([...etiquetas.querySelectorAll('input:checked')].map(input => input.value));
    const unicos = new Set();
    for (const contacto of contactos.querySelectorAll('input')) {
      const apto = canal.value === 'email' ? contacto.dataset.emailValido === 'true'
        : ['whatsapp', 'sms'].includes(canal.value) ? contacto.dataset.telefono === 'true' : true;
      const coincide = tipo.value === 'todos' || (tipo.value === 'contactos' && contacto.checked)
        || (tipo.value === 'etiquetas' && JSON.parse(contacto.dataset.etiquetas).some(etiqueta => elegidas.has(etiqueta)));
      if (apto && coincide) unicos.add(contacto.value);
    }
    estimacion.textContent = `Cantidad estimada de destinatarios: ${unicos.size}. Se recalcula al ejecutar.`;
  };
  for (const elemento of [tipo, canal, contactos, etiquetas, empresa].filter(Boolean)) elemento.addEventListener('change', actualizar);
  window.addEventListener('pageshow', actualizar);
  actualizar();
})();
