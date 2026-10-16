> Actualizacion: el piloto exige autorizacion temporal de un intento y seleccion unitaria. Ver [procedimiento actual](piloto-gmail-un-correo.md). Los resultados al final de este documento corresponden a la fase anterior.

# Motor Gmail por empresa, cerrado por defecto

Implementa el transporte real `users/me/messages/send`, el encolado y el procesamiento
persistente por destinatario. No se habilitó ninguna empresa, no se cambió .env, no
se hizo un envío real y no se activaron workflows. Las pruebas usan Gmail simulado.
La aceptación de Gmail NO acredita entrega, recepción, lectura ni ausencia de rebote.

## Cierres de seguridad

`config/enviosGmail.js` lee configuración del proceso, sin cargar archivos privados:

- `GMAIL_CAMPAIGNS_ENABLED` debe ser exactamente `true`; ausente equivale a apagado.
- `GMAIL_CAMPAIGNS_PILOT_COMPANIES` debe contener una lista no vacía de ObjectIds
  autorizados por el despliegue, separados por coma. Una lista inválida bloquea.

No se acepta esta configuración desde HTTP. Motor y transporte comprueban el cierre;
el motor lo vuelve a comprobar antes del POST. No se ha activado esta configuración.
La inyección de transporte simulado se limita al ejecutor de pruebas Node.

Los endpoints históricos y su servicio n8n siguen bloqueados. La pantalla de
preparación mantiene su botón deshabilitado: no se convirtió una autorización OAuth
en permiso implícito de envío. El camino de piloto independiente es:

- POST `/campanas/:id/gmail/confirmar`: sesión autenticada, CSRF de campañas,
  confirmación `ENVIAR` e `idempotencia` aleatoria de 16–128 caracteres URL-safe.
  Solo admite esos campos y `_csrf`; devuelve 202 con ID de ejecución y cantidad.
  NO procesa destinatarios ni llama Gmail dentro de la solicitud HTTP.
- GET `/campanas/:id/gmail/ejecucion`: estado propio sin tokens, MIME ni respuestas
  del proveedor. Sigue disponible con la bandera apagada o cuenta revocada, si el
  usuario persistido conserva autorización para consultar la campaña.
- `node scripts/procesarEnvioGmail.js ID_ENVIO`: unidad supervisada que procesa como
  máximo un destinatario, solo después de autorizar un piloto. No se ejecutó este
  script. No carga .env; requiere configuración privada del proceso. No hay un
  bucle ni scheduler que se inicie automáticamente con Express.

## Identidad, permisos y consentimiento

La ruta solo aporta campaña e ID del usuario autenticado. El motor carga el usuario
persistido y deriva de ahí la empresa; no confía en rol, empresa o remitente de la
sesión/cuerpo. Exige admin_empresa u operador con `campanas.ejecutar`, estado activo
y fecha de correo verificado no futura. Superadmin no usa el motor para enviar por
otra empresa. Exige empresa activa, verificada y email administrativamente habilitado.

Solo admite campañas versionFlujo 2, borrador, preparadas, inmediatas, de texto,
con asunto/cuerpo válidos. Programación e imagen local se rechazan explícitamente.
No cambia el estado administrativo de la campaña para eludir sus transiciones.

La identidad Gmail proviene de ConexionGmail de ESA empresa: conectada, googleSub
presente, scope gmail.send y cliente OAuth actual. El correo autorizado debe coincidir
exactamente con correoAutomatizaciones normalizado. Se fija googleSub/remitente en
la ejecución y se rechaza si cambia. No se permiten alias ni From del cliente. Para
cambiar remitente se requiere un procedimiento autorizado separado que revise la
empresa, desconecte/reautorice y cancele ejecuciones incompatibles; no se implementó
una actualización silenciosa ni se modificaron cuentas existentes.

`elegibilidadEmailService` unifica preparación, resolvedor histórico y motor: contacto
activo y propio, email válido, canales.email exactamente true, consentimiento otorgado
con fecha válida no futura y fuente documentada. Ausencia no equivale a consentimiento.
Se deduplica por email normalizado, sin equiparar alias de Google. No se concede
consentimiento a datos existentes. La captura y evidencia reales deben existir mediante
un proceso autorizado; el CRUD incorpora otorgamiento y revocacion con referencia de evidencia, autor persistido, fecha de registro, vinculo al email e historial. Para autorizar el piloto se exige ese registro verificable.

Se vuelve a cargar campaña, actor, empresa, cuenta y contacto después de renovar OAuth
y justo antes de enviar. Se comprueban selección actual, email, consentimiento y
huella del contenido/revisión. Un cambio cancela el trabajo. No se envía a una dirección
nueva que un contacto haya adquirido después de preparar la ejecución.

## Renovación y transporte

Se reutiliza obtenerAccessToken con modelos ligados a la conexión explícita y una
comprobación interna de acceso. El uso anterior desde la pantalla OAuth conserva su
comportamiento. La renovación conserva bloqueo/versionado y cifrado existentes; nunca
traslada tokens entre empresas. invalid_grant requiere reconexión. Se revalida después
de esperar a Google, porque el consentimiento o la empresa pudieron cambiar.
El token se vincula también a googleSub, correo y versión de conexión: la comprobación
final exige la misma versión que lo emitió. Un 401 atrasado no deshabilita una
autorización más reciente.

El transporte usa fetch al endpoint fijo HTTPS, Authorization solo en cabecera,
redirect manual, timeout de diez segundos y sin reintentos. No usa OAuth2Client.request
para enviar: esa biblioteca puede renovar y repetir solicitudes tras un 401. Un 401 de
envío se registra como rechazo y requiere reconexión, sin repetir el POST. El adaptador
no guarda ni imprime errores/cuerpos de Google. Acota la respuesta y conserva solo
IDs validados de mensaje/hilo. MIME lleva un único To, From persistido, asunto UTF-8
codificado y plegado, cuerpo base64 y envoltura base64url. Rechaza inyección de cabeceras.
No incluye HTML, Bcc, adjuntos ni imagen local en esta fase.

## Persistencia e idempotencia

- EjecucionGmail: empresa/campaña/actor, huellas, identidad fijada y total. Índices
  únicos empresa+campaña y empresa+claveHash. MVP: una ejecución por campaña.
- EnvioGmail: empresa/ejecución/contacto, hash de dirección, Message-ID determinista,
  estado, código fijo, intento e IDs Gmail. No almacena MIME ni tokens. Índice único
  empresa+ejecución+emailHash y unicidad de Gmail ID por empresa cuando existe.
- ControlEnvioGmail: presupuestos y exclusión compartida global/empresa, en la misma
  base de aplicación. No usar almacenes separados que dividan artificialmente las cuotas.

El encolado se confirma en una transacción snapshot/majority. Misma clave, actor y
contenido recuperan la ejecución; cambios o una clave distinta para la misma campaña
producen conflicto, no otro lote. Para repetir deliberadamente se requiere otra campaña
y otra aprobación. No hay un endpoint de reset/reenvío de trabajos terminales.

Estados por destinatario:

`pendiente → reservado → enviando → aceptado | rechazado | incierto`

Las revalidaciones fallidas producen cancelado. `aceptado` significa únicamente
aceptación de API con IDs, nunca entregado. Un mensaje tiene como máximo un intento
de POST; el Message-ID NO es una garantía de deduplicación de Gmail.

El trabajo se reserva antes de pedir tokens; pasa a enviando mediante comparación
atómica de estado, propietario y plazo. Dos consumidores no pueden enviar ese mismo
trabajo. La llamada externa ocurre fuera de la transacción MongoDB para que los
reintentos del driver no dupliquen efectos externos.

## Velocidad, cuotas e incertidumbre

Presupuestos locales conservadores: 1 destinatarios/campaña, 100 reservas/día por
empresa, 30/hora por empresa, 500/día global; mínimo dos segundos entre reservas de
una empresa y un segundo global. Días/horas se cuentan en UTC. Incluyen reservas
canceladas o rechazadas y no se reembolsan automáticamente. El resolvedor limita a
un candidato para piloto; se rechazan todos, etiquetas y listas distintas de un contacto, sin truncarlas.

Solo hay una reserva activa global y una por empresa. Ni siquiera una reserva vencida
se toma automáticamente: primero debe clasificarse con recuperarInciertos(). Un crash
deja la reserva durante dos minutos. La recuperación marca incierto y libera exclusión,
sin enviar; puede ejecutarse con la bandera apagada y la lista autorizada conservada.
Reintentar procesar un trabajo aceptado, rechazado, cancelado o incierto no hace POST.

429/403 aplican enfriamiento de quince minutos. Los motivos de cuota de un 403 se
clasifican como cuota; 401 y 403 por permiso impiden seguir usando esa versión de la
conexión hasta reautorizar. Son límites locales, no una lectura del presupuesto real
de Google ni de otros clientes que usen la cuenta/proyecto. Deben verificarse las
cuotas, límites de buzón y políticas del proveedor antes del piloto.

Timeout, desconexión, HTTP 408, 5xx, redirección o respuesta ilegible quedan inciertos. No se
reintentan automáticamente ni se presentan como rechazo confirmado. Si Gmail acepta
pero MongoDB falla al persistir, el estado queda enviando/reservado hasta clasificarlo
incierto. El sistema no afirma exactamente una entrega. Resolver esos casos exige
revisión autorizada; gmail.send no concede lectura de buzón para reconciliar.

La comprobación final y el POST no son atómicos: una desactivación o revocación
concurrente puede ocurrir después de comprobar. No se promete cancelar solicitudes
ya aceptadas o en vuelo. Suspensiones extremas de proceso, fallos del proveedor y
fallos de persistencia requieren revisión; no se debe reiniciar un incierto como pendiente.

## Requisitos antes de autorizar un piloto real

1. Aprobar empresa, remitente, destinatarios controlados y evidencia de consentimiento.
   Revisar también bajas, supresión y obligaciones de marketing del despliegue.
2. Validar Google Cloud, Gmail API, consentimiento/scopes, cuenta real, callback y
   renovación/revocación. No basta con que el estado local diga conectada.
3. Aprobar una base transaccional de aplicación y provisionar todos los índices de
   Empresa, Usuario, Contacto, Campana, ConexionGmail y los tres modelos nuevos.
   El motor falla cerrado si faltan; nunca migra ni crea índices en peticiones.
   No usar el standalone principal ni el replica set de pruebas como atajo.
4. Validar sesiones persistentes, HTTPS/proxy, gestión de secretos y redacción de
   logs/APM. Mantener credenciales fuera de repositorio y conversaciones.
5. Autorizar explícitamente bandera/lista de empresas y trabajador supervisado,
   observabilidad, cuotas, parada y revisión de resultados inciertos. Comenzar con
   un destinatario controlado; confirmar recepción por un canal independiente.

Las pruebas no sustituyen estos pasos. No se configuró ningún piloto ni proveedor,
no se modificó n8n y no se levantó el bloqueo histórico.

Referencias oficiales:
https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
https://developers.google.com/workspace/gmail/api/guides/handle-errors
https://developers.google.com/workspace/gmail/api/reference/quota

## Archivos de esta fase

Nuevos:

- config/enviosGmail.js
- controllers/enviosGmailController.js
- models/EjecucionGmail.js
- models/EnvioGmail.js
- models/ControlEnvioGmail.js
- services/elegibilidadEmailService.js
- services/gmailMimeService.js
- services/gmailApiTransporteService.js
- services/motorEnviosGmailService.js
- scripts/procesarEnvioGmail.js
- tests/gmail.envio.unit.test.js
- tests/gmail.envio.http.test.js
- tests/soporte/consentimiento.js
- pruebas-integracion/enviosGmail.js
- docs/envios-gmail-mvp.md

Modificados:

- routes/campanaRoutes.js
- services/gmailOAuthService.js
- services/destinatariosService.js
- services/preparacionAutomatizacionService.js
- tests/automatizacion.service.test.js
- tests/configuracionAutomatizaciones.service.test.js
- tests/destinatarios.aislamiento.test.js
- tests/destinatarios.http.test.js
- tests/destinatarios.service.test.js
- tests/envios.bloqueo.test.js
- tests/seguridadMultiempresa.service.test.js

Las fixtures elegibles antiguas ahora incluyen evidencia sintética explícita; los casos
con email ausente/deshabilitado siguen excluidos. No se alteraron datos históricos
para obtener consentimiento ni se eliminaron las comprobaciones de bloqueo.

## Resultados comprobados

- Suite habitual: 575 aprobadas, 0 fallidas, 0 omitidas.
- Integraciones: 59 aprobadas, 0 fallidas, 0 omitidas: 25 Gmail, 18 autoservicio,
  14 registro anterior y 2 flujo de campañas.
- Gmail siempre simulado; ningún envío externo. La suite habitual no escribe en
  MongoDB real; integración usa únicamente bases temporales con identidad/marca.
- Posteriormente: principal coincidente con referencia autorizada en proceso,
  configuración, datos e índices; marketingDevRs PRIMARY; cero bases temporales restantes.
- Configuración observada del proceso: envío real apagado, cero empresas de piloto.
- Comprobaciones de sintaxis y whitespace sin errores. Sin cambios a .env, n8n,
  cuentas reales, historial Git, commit o push. Cambios previos del workspace preservados.
