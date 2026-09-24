(() => {
  const canal = document.getElementById('canal');
  const contenidoEmail = document.getElementById('contenido-email');
  if (!canal || !contenidoEmail) return;

  // Ocultar no borra ni deshabilita los campos: sus valores se conservan al guardar.
  const actualizarVisibilidad = () => {
    contenidoEmail.hidden = canal.value !== 'email';
  };
  canal.addEventListener('change', actualizarVisibilidad);
  window.addEventListener('pageshow', actualizarVisibilidad);
  actualizarVisibilidad();
})();
