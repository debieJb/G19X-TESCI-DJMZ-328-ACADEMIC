(() => {
  const canal = document.getElementById('canal');
  const contenidoEmail = document.getElementById('contenido-email');
  const contenidoRedes = document.getElementById('contenido-redes');
  if (!canal || !contenidoEmail) return;

  // Ocultar no borra ni deshabilita los campos: sus valores se conservan al guardar.
  const actualizarVisibilidad = () => {
    contenidoEmail.hidden = canal.value !== 'email';
    if (contenidoRedes) contenidoRedes.hidden = canal.value !== 'redes_sociales';
  };
  canal.addEventListener('change', actualizarVisibilidad);
  window.addEventListener('pageshow', actualizarVisibilidad);
  actualizarVisibilidad();
})();
