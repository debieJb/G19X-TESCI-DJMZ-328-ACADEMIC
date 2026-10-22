(() => {
  const archivo = document.getElementById('imagenArchivo'), campo = document.getElementById('imagen'), estado = document.getElementById('imagenEstado');
  if (!archivo || !campo || !estado) return;
  const quitar = document.getElementById('quitarImagen');
  let version = 0, leyendo = false;
  if (quitar) {
    quitar.hidden = !archivo.files.length;
    quitar.addEventListener('click', () => {
      ++version; leyendo = false;
      archivo.value = ''; campo.value = ''; archivo.setCustomValidity('');
      estado.textContent = 'Sin imagen.'; quitar.hidden = true;
      archivo.focus();
    });
  }
  archivo.disabled = false;
  archivo.form.addEventListener('submit', event => { if (leyendo) { event.preventDefault(); estado.textContent = 'Espera a que termine la lectura de la imagen.'; } });
  archivo.addEventListener('change', () => {
    const actual = ++version, file = archivo.files[0]; leyendo = false; campo.value = ''; archivo.setCustomValidity('');
    if (quitar) quitar.hidden = !file;
    if (!file) { estado.textContent = 'Sin imagen.'; return; }
    if (file.type !== 'image/png' || file.size > 49152) {
      archivo.setCustomValidity('Selecciona un PNG de hasta 48 KiB.'); estado.textContent = archivo.validationMessage; return;
    }
    const reader = new FileReader(); leyendo = true;
    reader.onload = () => { if (actual !== version) return; leyendo = false; campo.value = reader.result; estado.textContent = 'Imagen preparada. El servidor validará formato, dimensiones y contenido PNG.'; };
    reader.onerror = () => { if (actual !== version) return; leyendo = false; campo.value = ''; archivo.setCustomValidity('No se pudo leer la imagen.'); estado.textContent = archivo.validationMessage; };
    reader.readAsDataURL(file);
  });
})();
