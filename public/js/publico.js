/* Mejoras progresivas: los formularios y enlaces funcionan también sin JavaScript. */
(() => {
  'use strict';
  const menu = document.querySelector('[data-menu-toggle]');
  if (menu) {
    const nav = document.getElementById(menu.getAttribute('aria-controls'));
    const media = window.matchMedia('(max-width: 760px)');
    const cerrar = () => { menu.setAttribute('aria-expanded', 'false'); nav.hidden = media.matches; };
    const adaptar = () => { menu.hidden = !media.matches; cerrar(); };
    menu.addEventListener('click', () => {
      const abierto = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(abierto)); nav.hidden = !abierto;
    });
    nav.addEventListener('click', event => { if (event.target.closest('a') && media.matches) cerrar(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && media.matches && menu.getAttribute('aria-expanded') === 'true') { cerrar(); menu.focus(); }
    });
    media.addEventListener('change', adaptar); adaptar();
  }
  for (const button of document.querySelectorAll('[data-toggle-password]')) {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    if (!input) continue;
    button.hidden = false;
    const label = input.labels?.[0]?.textContent || 'contraseña';
    const actualizar = visible => {
      input.type = visible ? 'text' : 'password'; button.setAttribute('aria-pressed', String(visible));
      button.textContent = visible ? 'Ocultar' : 'Mostrar'; button.setAttribute('aria-label', `${visible ? 'Ocultar' : 'Mostrar'}: ${label}`);
    };
    button.addEventListener('click', () => actualizar(input.type === 'password'));
    // No conservar contraseñas reveladas al volver desde la caché del navegador.
    window.addEventListener('pageshow', () => actualizar(false)); actualizar(false);
  }
  for (const form of document.querySelectorAll('[data-public-form]')) {
    const fields = [...form.querySelectorAll('input:not([type=hidden])')];
    const summary = form.querySelector('[data-form-errors]');
    const status = form.querySelector('[data-submit-status]');
    const submit = form.querySelector('button[type=submit]');
    if (!summary || !status || !submit) continue;
    const originalLabel = submit.textContent;
    form.noValidate = true;
    const limpiar = field => {
      field.setCustomValidity(''); field.removeAttribute('aria-invalid');
      const error = document.getElementById(`${field.id}-error`); if (error) error.textContent = '';
    };
    for (const field of fields) field.addEventListener('input', () => limpiar(field));
    const mensaje = field => {
      const value = field.value;
      if (field.required && !value.trim()) return 'Completa este campo.';
      if (field.type === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || field.validity.typeMismatch)) return 'Escribe un correo electrónico válido.';
      if (field.dataset.maxBytes && new TextEncoder().encode(value).length > Number(field.dataset.maxBytes)) return 'La contraseña supera el máximo de 72 bytes. Usa menos caracteres.';
      if (field.hasAttribute('data-password-new') && ([...value].length < 16 || new Set(value).size < 4)) return 'Usa al menos 16 caracteres y cuatro caracteres diferentes.';
      if (field.name === 'confirmacionPassword' && value !== form.elements.password.value) return 'Las contraseñas no coinciden.';
      if (!field.validity.valid) return field.validationMessage;
      return '';
    };
    form.addEventListener('submit', event => {
      if (form.dataset.submitting === 'true') { event.preventDefault(); return; }
      summary.replaceChildren(); summary.hidden = true;
      const errores = [];
      for (const field of fields) {
        limpiar(field); const texto = mensaje(field);
        if (!texto) continue;
        field.setCustomValidity(texto); field.setAttribute('aria-invalid', 'true');
        let error = document.getElementById(`${field.id}-error`);
        if (!error) {
          error = document.createElement('p'); error.id = `${field.id}-error`; error.className = 'error-campo';
          (field.closest('.campo') || field.parentElement).append(error);
          field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
        }
        error.textContent = texto; errores.push(field);
      }
      if (errores.length) {
        event.preventDefault(); summary.textContent = 'Revisa los campos señalados para continuar.';
        const list = document.createElement('ul');
        for (const field of errores) {
          const item = document.createElement('li'), link = document.createElement('a');
          link.href = `#${field.id}`; link.textContent = field.labels?.[0]?.textContent || 'Campo requerido';
          link.addEventListener('click', e => { e.preventDefault(); field.focus(); }); item.append(link); list.append(item);
        }
        summary.append(list); summary.hidden = false; summary.focus(); return;
      }
      form.dataset.submitting = 'true'; form.setAttribute('aria-busy', 'true');
      submit.disabled = true; submit.textContent = form.dataset.loadingLabel || 'Procesando…';
      status.textContent = 'Procesando tu solicitud. Espera un momento.';
    });
    window.addEventListener('pageshow', () => {
      delete form.dataset.submitting; form.removeAttribute('aria-busy'); submit.disabled = false;
      submit.textContent = originalLabel; status.textContent = '';
    });
  }
})();
