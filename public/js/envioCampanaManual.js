'use strict';
(() => {
  const panel = document.querySelector('[data-envio-campana]');
  if (!panel) return;
  const abrir = panel.querySelector('[data-abrir-envio]');
  const dialogo = panel.querySelector('[data-confirmacion-envio]');
  const form = panel.querySelector('[data-enviar-campana]');
  const cancelar = panel.querySelector('[data-cancelar-envio]');
  const actualizar = panel.querySelector('[data-actualizar-historial]');
  const estado = panel.querySelector('[data-estado-campana]');
  const historial = panel.querySelector('[data-historial-campana]');
  const base = `/campanas/${panel.dataset.envioCampana}/gmail`;
  const nombre = `piloto-gmail:${panel.dataset.envioCampana}`;
  const supervisado = panel.dataset.supervisado === 'true';
  const continuar = panel.querySelector('[data-continuar-envio]');
  let ultimo = null;
  let ocupado = false, registrado = true, intentado = false, clave;
  try {
    clave = sessionStorage.getItem(nombre);
    if (!/^[a-f0-9]{48}$/.test(clave || '')) {
      clave = [...crypto.getRandomValues(new Uint8Array(24))].map(n => n.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(nombre, clave);
    }
    intentado = sessionStorage.getItem(`${nombre}:intentado`) === 'true';
  } catch { clave = null; }
  const controles = () => {
    abrir.disabled = ocupado || registrado || intentado || !clave || panel.dataset.bloqueado === 'true';
    abrir.hidden = registrado;
    if (continuar) { continuar.hidden = !supervisado || ultimo?.modoMotor !== 'supervisado' || !ultimo?.envios?.some(e => e.estado === 'pendiente') || ultimo.envios.some(e => e.estado === 'incierto'); continuar.disabled = ocupado; }
    actualizar.disabled = ocupado;
    form.querySelector('button[type="submit"]').disabled = ocupado;
  };
  const solicitar = async (ruta, datos) => {
    const res = await fetch(ruta, { method: datos ? 'POST' : 'GET', body: datos,
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const codigos = { DESTINATARIOS_CAMBIARON: 'Los destinatarios o su consentimiento cambiaron. Recarga la revisión antes de confirmar.', ENVIOS_BLOQUEADOS: 'El modo de envío no está habilitado o validado para esta empresa. Consulta Gmail y la configuración del servidor.', CONFIGURACION: 'El límite de destinatarios o los intervalos del servidor no son válidos.', EMPRESA_NO_HABILITADA: 'La empresa debe estar activa, verificada y con el canal email habilitado.', REAUTORIZAR: 'Conecta nuevamente el Gmail de esta empresa.', CUOTA_LOCAL: 'Cuota local agotada. Los pendientes se conservan; espera al siguiente período y continúa desde el historial.', VELOCIDAD: 'Límite de velocidad o pausa del proveedor. Espera antes de continuar pendientes.', OCUPADO: 'Hay un envío en curso. Actualiza el historial antes de continuar.', CONSENTIMIENTO_NO_DOCUMENTADO: 'El consentimiento documentado cambió o falta. Revisa los contactos antes de confirmar.', DESTINATARIOS_INVALIDOS: 'La selección está vacía o supera el límite configurado. Selecciona contactos y prepara otra vez.', CAMPANA_NO_PREPARADA: 'Activa y prepara la campaña antes de confirmar.', REMITENTE_NO_COINCIDE: 'Conecta el Gmail autorizado para esta empresa.', PILOTO_AGOTADO: 'El piloto de un único envío por empresa ya está consumido. Solicita habilitar la política de campañas sucesivas.',
        RESULTADO_PREVIO_PENDIENTE: 'Hay un envío anterior en curso o incierto. Debe conciliarse antes de enviar otra campaña.',
        AUTORIZACION_PILOTO_INVALIDA: 'La autorización ya no es válida. Revisa el historial; no repitas el envío.',
        IDEMPOTENCIA_CONFLICTO: 'Esta campaña ya tiene una ejecución diferente. Consulta su historial.',
        REVISA_PREPARACION: 'Revisa el contenido, la preparación y el consentimiento del único destinatario.' };
      let datos; try { datos = await res.json(); } catch {}
      const publico = codigos[datos?.error];
      throw Object.assign(Error('SOLICITUD_NO_CONFIRMADA'), { publico, codigo: datos?.error });
    }
    return res.json();
  };
  const etiquetas = { aceptado: 'Enviada a Gmail · Aceptado por Gmail', rechazado: 'Error: Gmail rechazó la solicitud',
    incierto: 'Resultado incierto. No vuelvas a enviar', cancelado: 'Error: envío detenido',
    pendiente: 'Pendiente de envío', reservado: 'Envío en preparación', enviando: 'Envío en curso' };
  const motivos = { REVALIDACION: 'La campaña, el destinatario o su autorización cambiaron antes del envío.', REAUTORIZAR: 'Es necesario volver a conectar el Gmail de la empresa.',
    CUOTA_PROVEEDOR: 'Gmail rechazó la solicitud por cuota. No se reintenta automáticamente.', PERMISO_PROVEEDOR: 'Google rechazó el permiso de envío.',
    RECHAZO_PROVEEDOR: 'Gmail rechazó la solicitud.', TIMEOUT: 'No se recibió confirmación de Gmail. Requiere conciliación.',
    CONEXION: 'La conexión se interrumpió. Comprueba el resultado antes de actuar.', RESPUESTA_INVALIDA: 'La respuesta de Gmail no permitió confirmar el resultado.',
    RESERVA_VENCIDA: 'El proceso no terminó de confirmar el resultado. Requiere conciliación.' };
  const fecha = valor => {
    const d = new Date(valor);
    return valor && Number.isFinite(+d) ? d.toLocaleString('es-MX') : '';
  };
  const mostrar = datos => {
    ultimo = datos;
    registrado = !!datos.ejecucion || (datos.envios || []).length > 0;
    historial.replaceChildren();
    for (const envio of datos.envios || []) {
      const fila = document.createElement('article'); fila.className = 'resultado-campana';
      const contacto = document.createElement('p'); contacto.textContent = envio.destinatario || envio.contacto || 'Destinatario'; fila.append(contacto);
      const titulo = document.createElement('p'); titulo.textContent = etiquetas[envio.estado] || 'Estado por verificar'; fila.append(titulo);
      if (motivos[envio.codigo]) { const motivo = document.createElement('p'); motivo.textContent = motivos[envio.codigo]; fila.append(motivo); }
      if (envio.aceptadoEn) { const f = document.createElement('p'); f.textContent = fecha(envio.aceptadoEn); fila.append(f); }
      if (envio.estado === 'aceptado') {
        const aviso = document.createElement('p'); aviso.textContent = 'Gmail aceptó el mensaje. La recepción se comprueba en el buzón del destinatario.'; fila.append(aviso);
      }
      for (const evento of envio.historial || []) {
        const linea = document.createElement('p'); linea.textContent = `${fecha(evento.fecha)} · ${etiquetas[evento.estado] || 'Estado actualizado'}`; fila.append(linea);
      }
      if (envio.gmailId) {
        const detalle = document.createElement('details'), resumen = document.createElement('summary'), referencia = document.createElement('p');
        resumen.textContent = 'Referencia del envío'; referencia.textContent = envio.gmailId; detalle.append(resumen, referencia); fila.append(detalle);
      }
      historial.append(fila);
    }
    estado.textContent = supervisado && registrado ? ((datos.envios || []).filter(e => e.estado === 'aceptado').length + ' aceptados por Gmail; ' + (datos.envios || []).filter(e => e.estado === 'pendiente').length + ' pendientes. ' + ((datos.envios || []).some(e => e.estado === 'incierto') ? 'Envío detenido: concilia el resultado incierto antes de continuar.' : 'Consulta el resultado individual. Continuar pendientes requiere una acción explícita.')) : registrado ? 'Esta campaña ya tiene un envío registrado y no se puede volver a enviar.'
      : intentado ? 'Estamos verificando el resultado. Actualiza el historial; no vuelvas a enviar.'
        : !clave ? 'No se pudo preparar la confirmación. Revisa el almacenamiento del navegador.'
          : panel.dataset.bloqueado === 'true' ? 'Consulta «Qué falta para enviar»: cada requisito y su solución aparecen junto al botón.' : 'Todo listo para revisar y confirmar el envío.';
  };
  const consultar = async () => {
    if (ocupado) return;
    ocupado = true; controles();
    try { mostrar(await solicitar(`${base}/ejecucion`)); }
    catch { registrado = true; estado.textContent = 'No pudimos cargar el historial. Actualízalo antes de continuar; el envío permanece bloqueado.'; }
    finally { ocupado = false; controles(); }
  };
  const procesarLote = async () => {
    // Bounded, foreground processing. GET/reload never sends or resumes a batch.
    for (let paso = 0; paso < 50; paso++) {
      if (ultimo?.modoMotor !== 'supervisado' || !ultimo.envios.some(e => e.estado === 'pendiente') || ultimo.envios.some(e => ['incierto', 'reservado', 'enviando'].includes(e.estado))) break;
      const d = new URLSearchParams(new FormData(form)); d.set('confirmacion', 'PROCESAR_CAMPANA_CONFIRMADA'); d.set('ejecucion', ultimo.ejecucion);
      mostrar(await solicitar(base + '/supervisado/paso', d));
      if (ultimo.envios.some(e => ['rechazado','cancelado','incierto'].includes(e.estado))) break;
      if (ultimo.envios.some(e => e.estado === 'pendiente')) await new Promise(r => setTimeout(r, 2200));
    }
  };
  continuar?.addEventListener('click', async () => {
    if (ocupado || continuar.disabled) return;
    ocupado = true; controles();
    try { await procesarLote(); } catch (e) { estado.textContent = e.publico || 'Se interrumpió la confirmación. Actualiza el historial antes de continuar; ningún resultado incierto se reenvía.'; }
    finally { ocupado = false; controles(); }
  });
  abrir.addEventListener('click', () => { if (!abrir.disabled && !ocupado) dialogo.showModal(); });
  cancelar.addEventListener('click', () => dialogo.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (ocupado || abrir.disabled || !dialogo.open) return;
    ocupado = true; controles(); dialogo.close();
    estado.textContent = 'Enviando campaña. No cierres esta página.';
    const datos = confirmacion => { const d = new URLSearchParams(new FormData(form)); d.set('confirmacion', confirmacion); return d; };
    try {
      if (!supervisado) await solicitar(`${base}/piloto/autorizar`, datos('AUTORIZAR_UN_ENVIO'));
      // Mantener la marca incluso ante pérdida de respuesta; nunca reintentar el POST.
      sessionStorage.setItem(`${nombre}:intentado`, 'true'); intentado = true;
      const envio = datos(supervisado ? 'ENVIAR' : 'ENVIAR_UN_CORREO_REAL'); envio.set('idempotencia', clave);
      if (supervisado) { envio.set('revision', panel.dataset.revision); envio.set('revisionDestinatarios', panel.dataset.destinatarios); await solicitar(base + '/confirmar', envio); mostrar(await solicitar(base + '/ejecucion')); await procesarLote(); }
      else mostrar(await solicitar(`${base}/piloto/despachar`, envio));
    } catch (error) {
      registrado = true;
      if (supervisado && !ultimo?.ejecucion && ['DESTINATARIOS_CAMBIARON','CONSENTIMIENTO_NO_DOCUMENTADO','DESTINATARIOS_INVALIDOS','CAMPANA_NO_PREPARADA'].includes(error.codigo)) { sessionStorage.setItem(`${nombre}:intentado`, 'false'); intentado = false; registrado = false; }
      estado.textContent = error.publico || 'No pudimos confirmar el resultado. Actualiza el historial antes de actuar. No se repetirá el envío automáticamente.';
    } finally { ocupado = false; controles(); }
  });
  actualizar.addEventListener('click', consultar);
  controles(); consultar();
})();
