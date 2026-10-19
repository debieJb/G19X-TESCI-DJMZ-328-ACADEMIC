# Gmail empresarial y campañas automáticas — 18 de octubre de 2026

## Alcance implementado

Gmail API directo es el único motor del MVP. Se amplió `motorEnviosGmailService`, sin delegar envíos a n8n. El transporte histórico hacia webhooks continúa bloqueado.

El administrador introduce el correo y abre la autorización oficial de Google. State de un solo uso, sesión, empresa, nonce y PKCE vinculan la respuesta. El correo elegido se compara con el ID token verificado; un correo distinto no se guarda. La identidad empresarial verificada durante el registro se conserva y puede ser distinta al Gmail autorizado. Solo se admite la cuenta principal verificada; no se habilitaron alias arbitrarios.

Las credenciales continúan cifradas por empresa con el servicio existente. Se conservan renovación con exclusión, desconexión inmediata local, revocación remota y reconexión. Los permisos solicitados siguen siendo `openid`, `email` y `gmail.send`.

La preparación guarda contenido, selección de contactos y modalidad. La confirmación independiente exige CSRF, revisión SHA-256 del borrador y clave de idempotencia. Se vuelven a consultar el actor, empresa, campaña, cuenta y contactos en MongoDB. El navegador no decide el remitente, empresa ni rol.

Los trabajos y fechas UTC quedan en `EjecucionGmail` y `EnvioGmail`. La confirmación no hace POST a Gmail; el trabajador iniciado por el servidor consume los trabajos vencidos. Sus reservas y cuotas transaccionales coordinan procesos concurrentes. Un reinicio encuentra la cola persistida. No existe un segundo motor.

## Configuración de despliegue

La configuración real no se cambió ni se activaron envíos. `.env.example` documenta:

```
GMAIL_CAMPAIGNS_MODE=automatico
GMAIL_CAMPAIGNS_ENABLED=false
GMAIL_CAMPAIGNS_PILOT_COMPANIES=<IDs de empresas autorizadas separados por coma>
```

El nombre histórico de la lista se conserva para compatibilidad. La lista permite incorporar empresas progresivamente; no contiene credenciales. `GMAIL_CAMPAIGNS_ENABLED=true` inicia el trabajador con `node server.js`, exclusivamente después de validar transacciones e índices. No debe habilitarse hasta autorizar el envío controlado. La modalidad `piloto` conserva el protocolo supervisado anterior; una ejecución persistida de una modalidad no puede pasar a la otra.

Se exige MongoDB replica set o clúster con transacciones; no se degrada a escrituras sin transacción. El servidor no crea ni repara índices de la cola. El plan existente `node scripts/migrarIndicesPiloto.js --plan` incorpora el nuevo índice `{empresa, modoMotor, estado, disponibleEn}`. La migración dedicada existente exige manifiesto aprobado y confirmación de base; no se ejecutó contra datos reales. No se debe convertir la base real ni copiar sus datos automáticamente.

Diagnóstico de solo lectura: `node scripts/diagnosticarGmailCampanas.js --mongo`. No imprime variables, URI, tokens ni direcciones. El diagnóstico local encontró OAuth configurado, envíos apagados, cero empresas habilitadas y `TRANSACCIONES_REQUERIDAS` en la base configurada. Esta es una dependencia real de infraestructura, no un fallo que pueda resolver una prueba simulada.

## Límites, consentimiento y resultados

- Máximo 50 destinatarios por campaña, 30 intentos/hora y 100/día por empresa; 500/día globales. Son límites propios conservadores, no una promesa de cuota Google.
- Intervalos mínimos: 2 segundos por empresa y 1 segundo global. Una sola reserva global en vuelo.
- Se excluyen inactivos, bajas, consentimiento ausente/inválido y correos repetidos. Una selección explícita con IDs ajenos o inexistentes se rechaza completa.
- El consentimiento, pertenencia e identidad se vuelven a comprobar inmediatamente antes del envío, también después de renovar tokens.
- Desconexión o autorización caducada pausa trabajos pendientes. Reconectar la misma identidad permite continuar. Un remitente cambiado, contenido modificado, actor bloqueado o consentimiento retirado impiden el envío.
- Rechazo inequívoco de cuota: hasta tres intentos totales, espera exponencial desde 15 minutos y jitter. Un fallo de identidad requiere reconexión.
- Timeout, error de red o respuesta ambigua después de iniciar POST: `incierto`, sin reintento automático. Gmail no ofrece aquí una garantía de exactly-once. El Message-ID determinista no sustituye esa garantía.
- Una reserva vencida antes de entrar a red puede volver a pendiente en modalidad automática; una reserva vencida en `enviando` queda incierta. No se reenvía un trabajo aceptado.
- El historial conserva estados, fechas, códigos e identificadores Gmail sin guardar MIME ni tokens. La interfaz permite consultarlo sin acceder a n8n. `aceptado` significa aceptación por API y no acredita llegada al buzón.
- Imágenes locales y adjuntos todavía no están admitidos: la confirmación los rechaza en vez de omitirlos silenciosamente. El envío implementado es texto UTF-8.
- Las solicitudes de baja deben registrarse mediante el CRUD de consentimiento existente; no se añadió un endpoint público de baja con enlace firmado.

## Permisos efectivos

| Rol | Conectar/revocar Gmail | Preparar y confirmar campañas | Historial |
| --- | --- | --- | --- |
| superadmin | No utiliza credenciales empresariales | Administración global existente; este motor no lo admite como remitente empresarial | No suplanta una empresa en este motor |
| admin_empresa | Solo su empresa | Solo su empresa verificada, activa y habilitada | Solo su empresa |
| operador | No | Solo su empresa y acciones ya autorizadas por `permisos.js` | Solo su empresa |

El motor revalida el actor en base de datos; no depende de ocultar opciones. Se conservan las restricciones de usuarios y sesiones del trabajo anterior.

## Prueba real controlada pendiente de autorización

No se ejecutó OAuth real ni POST a Gmail en esta revisión. No se declara validada la integración real ni la recepción. Las pruebas de MongoDB usan bases temporales identificadas y Gmail simulado.

Antes de un envío real:

1. Preparar una base dedicada con replica set e índices, sin alterar la base actual. Configurar el destino mediante el proceso de despliegue existente.
2. En Google Cloud, comprobar que Gmail API está habilitada, el cliente OAuth es de aplicación web y el redirect autorizado coincide exactamente con `GOOGLE_OAUTH_REDIRECT_URI` (`/empresa/gmail/callback`). Configurar la pantalla de consentimiento y, si está en Testing, añadir la cuenta remitente como usuario de prueba. No es posible comprobar el estado de ese proyecto sin acceso a su consola.
3. Registrar y verificar una empresa exclusivamente de prueba mediante el flujo existente. No activar cuentas o consentimiento artificialmente en la base.
4. Como administrador, conectar desde Gmail empresarial la cuenta de prueba. La aprobación oficial de Google requiere intervención de su propietario; no requiere entregar una contraseña a PluriOne.
5. Registrar un único destinatario de prueba con evidencia y fecha de consentimiento. Preparar una campaña inmediata de texto y revisar destinatario, remitente, asunto y cuerpo íntegro. Mantener los envíos apagados.
6. Confirmación humana pendiente: **remitente exacto, destinatario exacto, asunto y cuerpo exactos**. No hay todavía valores autorizados. No crearlos ni inferirlos.
7. Verificar que esa empresa no tenga otros trabajos pendientes, habilitar exclusivamente su ID y activar modalidad automática. Confirmar la campaña desde la interfaz. Esa confirmación crea el trabajo; el trabajador realiza el POST sin comandos adicionales por campaña.
8. Comprobar persistencia de `ACEPTADO_API`, Gmail ID y un solo intento. Comprobar recepción en el buzón controlado cuando su propietario pueda confirmarla. No marcar recepción basándose solo en HTTP 200. Deshabilitar la prueba al terminar y conservar el resultado.

Google puede invalidar refresh tokens. En aplicaciones externas en Testing con scope Gmail, Google documenta una caducidad de siete días; la aplicación solicita reconexión cuando recibe `invalid_grant`.

Fuentes oficiales consultadas:

- [Envío de mensajes Gmail](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Errores y cuotas Gmail](https://developers.google.com/workspace/gmail/api/guides/handle-errors)
- [Cuotas de Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota)
- [OAuth y expiración de refresh tokens](https://developers.google.com/identity/protocols/oauth2/)

## Archivos de esta ampliación

Configuración: `.env.example`, `config/enviosGmail.js`, `server.js`.

OAuth: `models/EstadoOAuth.js`, `services/gmailOAuthService.js`, `controllers/gmailController.js`, `views/empresa/gmail.ejs`.

Motor: `models/EjecucionGmail.js`, `models/EnvioGmail.js`, `services/motorEnviosGmailService.js`, `services/trabajadorCampanasService.js`, `controllers/enviosGmailController.js`.

Interfaz y preparación: `controllers/automatizacionCampanaController.js`, `services/preparacionAutomatizacionService.js`, `views/campanas/automatizacion.ejs`, `views/partials/_envioAutomaticoGmail.ejs`, `public/js/campanaGmail.js`.

Diagnóstico y pruebas: `scripts/diagnosticarGmailCampanas.js`, `tests/gmail.oauth.service.test.js`, `tests/gmail.envio.http.test.js`, `tests/gmail.trabajador.test.js`, `tests/gmail.modelos.compatibilidad.test.js`, `pruebas-integracion/enviosGmail.js`, `tests/soporte/internoNavegador.cjs`.

Este inventario corresponde a la ampliación Gmail. El árbol de trabajo conserva también los cambios previos de diseño, roles y sesiones, sin commit ni push.

## Validación final

| Ejecución | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| `npm.cmd test` | 768 | 0 | 0 |
| `node --test --test-concurrency=1 pruebas-integracion/*.js` | 118 | 0 | 0 |
| Edge real: `tests/soporte/internoNavegador.cjs` | 1 | 0 | 0 |
| Total | 887 | 0 | 0 |

La integración usa transacciones MongoDB reales en bases temporales propias del replica set de pruebas, con Gmail simulado y red externa bloqueada. Incluye trabajador residente, programación, reinicio de motor, consumidores concurrentes, límite de destinatarios, exclusión de contactos, selección ajena, cuotas, fallos parciales, expiración OAuth, revocación y compatibilidad de documentos históricos. La referencia de procesos, datos e índices de MongoDB original se mantuvo sin cambios.

Edge verificó 26 vistas internas y 15 estados públicos a 1440, 768, 390 y 320 píxeles, además del nuevo formulario Gmail y confirmación/historial a 1440, 768 y 390. Resultado: 1423 comprobaciones, 182 capturas, cero errores JavaScript. Se inspeccionaron también capturas de escritorio y móvil. La prueba nueva utiliza respuestas HTTP sintéticas: no acredita aceptación por Google. Las seis capturas de Gmail y el reporte se conservaron en `docs/evidencias/gmail-automatico/`.

Las suites adicionales de integración requieren ejecución secuencial porque comparan inventarios de bases temporales; lanzarlas en paralelo produce interferencias entre sus verificaciones. Se corrigieron las regresiones detectadas y se repitió la ejecución completa secuencial. `git diff --check` terminó sin errores. Rama y respaldo conservados: `respaldo-avances-18-oct`, HEAD `1df937e`. Archivo accidental intacto y sin seguimiento.
