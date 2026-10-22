# Diagnóstico de recuperación SMTP — 22 de octubre de 2026

## Resultado real y límite de esta corrección

El bloqueo reproducido con las credenciales actuales es **AUTH SMTP 535 / 5.7.8**.
La conexión llega a Gmail y su autenticación es rechazada. La comprobación se hizo
con `verify()`: **cero mensajes enviados**, sin reclamar ni reenviar solicitudes.
No se puede afirmar que la contraseña esté revocada, pertenezca a otra cuenta o
que exista una restricción de Google sin que el responsable revise su cuenta.
El rechazo es verificable; su motivo administrativo concreto no es observable
con las credenciales actuales. No se generaron ni cambiaron credenciales.

La configuración guardada utiliza una contraseña de aplicación con cuatro grupos
separados por espacios. El transporte ahora elimina únicamente esos separadores
al autenticar. El secreto original, `.env` y sus valores permanecen intactos.
La misma comprobación volvió a recibir **535 / 5.7.8** tras normalizar: este ajuste
no resuelve por sí solo el bloqueo de autenticación y no se presenta como envío
real arreglado. Se necesita que Google acepte la autenticación original antes
de intentar una recuperación real.

## Trazado del flujo observado (solo lectura)

1. El formulario POST tiene CSRF, normaliza el correo y usa la ruta de recuperación.
2. Se encontró una tarea persistida en `Usuario.recuperacion`, estado `fallida`,
   con hash de token y sin identificador de aceptación del proveedor. La outbox
   de recuperación está vinculada al usuario; no se inserta como registro de
   verificación en `SolicitudRegistro`.
3. Esto demuestra que se completó el reclamo transaccional y se generó el hash;
   las cuotas locales no bloquearon ese reclamo. La tarea antigua no guardó un
   código de error, por lo que no se le atribuye retrospectivamente un código
   que no existe. El rechazo AUTH actual se reprodujo con una comprobación nueva
   sin envío.
4. No hay trabajador residente de verificación ejecutándose; su bandera actual
   está deshabilitada. El proceso web sí está en ejecución. El despacho directo
   después de responder se intentó, como acredita el estado `fallida`; no depende
   de que el residente esté activo.
5. La configuración SMTP, límites y origen pasan sus validaciones locales. Las
   credenciales cargadas corresponden al archivo vigente, sin sobreescritura de
   variables heredadas en el proceso de diagnóstico.
6. La lectura MongoDB confirmó soporte de transacciones y el índice TTL existente.
   No se hicieron escrituras, DDL, eliminaciones ni cambios de estado reales.
7. `verify()` reprodujo el rechazo en AUTH antes de enviar al destinatario. La
   configuración actual tampoco acredita una verificación empresarial funcional:
   ambos recorridos usan la misma fábrica SMTP. Una prueba exitosa anterior no
   equivale a autenticación válida en este momento.

Referencias: [Gmail con Nodemailer](https://nodemailer.com/guides/using-gmail)
y [solución de acceso al cliente Gmail](https://support.google.com/mail/answer/7126229?hl=es).

## Cambios realizados

- `services/smtpTransaccionalService.js`: normalización limitada al formato visual
  de contraseña de aplicación; clasificación saneada de AUTH, cuota y rechazo,
  conservando solo fase y códigos SMTP. No imprime respuestas del proveedor.
- `models/Usuario.js`: campos opcionales para código y fase del fallo. Sin índices,
  migraciones ni cambios a datos existentes.
- `services/recuperacionPasswordService.js`: persiste el diagnóstico de futuros
  fallos con reclamos condicionados a la tarea correspondiente. Una tarea fallida
  o incierta no se vuelve a reclamar; las pendientes no se eliminan.
- `controllers/recuperacionPasswordController.js`: registra de forma segura los
  bloqueos de configuración/activación y comunica únicamente códigos saneados en
  el log administrativo. La respuesta pública continúa siendo genérica.
- `scripts/diagnosticarRecuperacion.js`: modos separados de lectura agregada y
  comprobación SMTP; sin envío, actualizaciones ni consumo de tokens.
- Pruebas SMTP, recuperación y diagnóstico actualizadas; escenarios simulados
  para AUTH 535, contraseña agrupada, cuotas y prevención de reintentos.

No se reinició el servidor ni se arrancó un trabajador, para evitar ejecutar
colas de campañas o procesar pendientes sin autorización. Los cambios de código
requieren el despliegue habitual para aplicarse al proceso web ya abierto.

## Comprobaciones seguras

Desde la carpeta del proyecto, sin imprimir secretos:

```powershell
node --env-file=.env scripts/diagnosticarRecuperacion.js --solo-lectura
node --env-file=.env scripts/diagnosticarRecuperacion.js --comprobar-smtp
```

El primer modo solo usa agregaciones de lectura en la base configurada, sin
inicializar modelos/índices. El segundo no accede a MongoDB ni a las colas: ejecuta
exclusivamente TLS y AUTH mediante `verify()`. Puede ejecutarse con la bandera de
correo vigente porque no ofrece ningún método de envío. Muestra solo códigos y
no expone el remitente, contraseñas, tokens ni la URI de conexión.

## Una única recuperación real

1. El responsable debe confirmar que la misma cuenta y credencial original que
   usa la verificación empresarial son las vigentes, y revisar posibles bloqueos
   de acceso de Google. Si una prueba anterior fue en otro entorno, usar el
   mecanismo privado habitual de ese entorno; no copiar valores a código, logs
   o Git. No generar credenciales nuevas como parte de este procedimiento.
2. Repetir **solo** `--comprobar-smtp`. No solicitar recuperaciones mientras siga
   devolviendo `AUTH 535 / 5.7.8`. Continuar únicamente si informa autenticación
   correcta y cero mensajes enviados.
3. Aplicar el código en la instancia autorizada mediante el despliegue habitual,
   conservando `.env` y credenciales. No iniciar trabajadores o barridos para
   forzar el envío, ni modificar la tarea fallida existente.
4. Con una cuenta de prueba autorizada y su buzón controlado, respetando el límite
   de 3 solicitudes por cuenta/hora, abrir «¿Olvidaste tu contraseña?» y pulsar
   **Enviar instrucciones una sola vez**. Es una solicitud nueva, no una
   reactivación manual de la anterior.
5. Consultar `--solo-lectura` para comprobar si aparece aceptación o un código
   saneado. Revisar el buzón/spam. Si el resultado es incierto, conciliarlo antes
   de cualquier nuevo intento; el HTTP 202 no acredita entrega.
6. Abrir el enlace recibido en el origen autorizado antes de 15 minutos, elegir
   y confirmar una contraseña segura y verificar que las sesiones anteriores
   pierden acceso. No volver a solicitar otro correo para probar reutilización.

La prueba de recepción y recuperación real **queda pendiente**. Este trabajo
no envió correos, no cambió secretos, no escribió datos reales ni hizo commit/push.

## Resultado de pruebas

Suite final `node --test`: **915 aprobadas, 0 fallos, 0 omitidas**.
Incluye AUTH saneado, formato agrupado de contraseña, cuotas SMTP/locales,
no reenvío de fallidas/inciertas, diagnóstico sin escrituras, CSRF, caducidad,
sesiones y regresiones de verificación, campañas y Gmail.

La comprobación real de autenticación terminó con:
`REAUTORIZAR_TRANSACCIONAL / AUTH / 535 / 5.7.8 / correosEnviados: 0`.
No hay validación de recepción real aprobada; sigue pendiente resolver ese rechazo.
