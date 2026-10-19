# Migración controlada del correo de verificación a Gmail SMTP

## Auditoría y decisión

El correo de verificación se construye en `correoTransaccionalService` mediante el contrato `transporte.enviar(mensaje, {signal})`. `autoservicioEmpresarialService` conserva solicitud idempotente, token aleatorio de 256 bits, caducidad, reclamación transaccional, límites persistentes, auditoría, verificación y creación del primer administrador. El registro HTTP no envía correo síncronamente: crea una solicitud pendiente.

Los puntos de despacho reales eran `scripts/despacharVerificacion.js` y `scripts/trabajadorVerificacionResidente.js`. Ambos construían el proveedor Gmail API transaccional. Además, `verificacionLocalPrivada.ps1` exigía descifrar una credencial OAuth antes de lanzar esos despachadores. Se sustituyeron esos tres puntos, manteniendo sus puertas de autorización.

Nodemailer ya estaba instalado y declarado por el usuario. No se reinstaló ni se cambiaron `package.json` o el lockfile durante esta migración. Sus modificaciones preexistentes se conservaron.

## Transporte nuevo

`smtpTransaccionalService` utiliza exclusivamente `smtp.gmail.com:465`, TLS con verificación de certificado y mínimo TLS 1.2. Autentica con `EMAIL_USER` y `EMAIL_PASS` —contraseña de aplicación—, sin leer contraseñas desde HTTP ni pedir la contraseña habitual de Google.

El remitente y el envelope SMTP quedan fijados a `EMAIL_USER`. Cada mensaje lleva un único destinatario. Se bloquean cabeceras inyectadas, acceso a archivos y URL como contenido/adjuntos, debug y logger SMTP. No se imprimen errores originales ni respuestas del proveedor. El identificador de aceptación se guarda como hash compatible con el campo de auditoría existente, sin cambiar modelos.

El socket TLS se conserva para poder destruirlo al abortar incluso durante TLS/AUTH; no se permite continuar hacia un envío tardío después del timeout. No se utiliza pool ni reintento interno de SMTP. Cada operación cierra su conexión.

## Configuración y activación

Variables activas del correo de plataforma:

```
EMAIL_USER=<cuenta de plataforma, solo en configuración privada>
EMAIL_PASS=<contraseña de aplicación, solo en configuración privada>
TRANSACTIONAL_PUBLIC_ORIGIN=https://localhost:3100
TRANSACTIONAL_EMAIL_ENABLED=false
TRANSACTIONAL_WORKER_ENABLED=false
```

El origen debe ser HTTPS y sin ruta, consulta ni credenciales. El lanzador local lo suministra al proceso. Los límites existentes `TRANSACTIONAL_SENDS_PER_MINUTE`, `TRANSACTIONAL_SENDS_PER_DAY` y el intervalo del trabajador se conservan.

`.env` no fue editado, mostrado ni copiado a logs. `.env.example` ahora distingue SMTP transaccional de `GOOGLE_OAUTH_*` y `GMAIL_TOKEN_ENCRYPTION_KEY`, que siguen siendo necesarios para **Gmail OAuth empresarial y sus campañas**.

Nada inicia un trabajador por instalar o configurar SMTP. `TRANSACTIONAL_EMAIL_ENABLED` sigue siendo necesario, y el trabajador residente exige también su bandera, entorno y autorización explícita. El despacho unitario mantiene ID de solicitud, destinatario esperado y autorización de un solo primer intento. No se ejecutaron ninguno de esos caminos de envío.

## Cola, errores y duplicados

No se reescribió la cola ni se modificaron controladores, rutas, modelos o permisos.

- Se mantiene la reclamación atómica y reserva de cuotas antes de contactar al proveedor.
- Aceptación inequívoca de un único destinatario guarda `enviada`, identificador saneado y auditoría. No acredita recepción en el buzón.
- Credenciales rechazadas producen `REAUTORIZAR_TRANSACCIONAL`: se conserva este código para que el trabajador se pause. Ahora significa corregir la autenticación SMTP, no obtener OAuth transaccional.
- Un rechazo SMTP inequívoco se registra como fallo. No se reintenta automáticamente esa solicitud: un reenvío explícito puede autorizar un nuevo intento según los controles existentes.
- Red, timeout o respuesta ambigua se registran como entrega incierta. No se reclaman de nuevo tras reiniciar.
- Si el proceso muere después de contactar SMTP, la reserva vencida se conserva como incierta. SMTP no proporciona exactly-once: no se promete ausencia absoluta de duplicados bajo cualquier circunstancia. El control adoptado evita reenviar automáticamente una entrega cuyo resultado se desconoce.
- Se conserva el nombre interno histórico de las ventanas de cuota para no reiniciar contadores existentes al cambiar de proveedor.

## Comprobación real sin envío

Desde el repositorio:

```powershell
node --env-file=.env scripts/comprobarSmtpTransaccional.js
```

El comando exige transportes apagados. Ejecuta `verify()` de Nodemailer, que comprueba conexión, TLS y autenticación sin enviar un mensaje; no consulta MongoDB, no reclama solicitudes y no inicia trabajadores. No necesita el origen público para esta comprobación.

**Resultado real obtenido: conexión TLS correcta, autenticación SMTP correcta, cero correos enviados.** No se probó recepción ni se despachó ninguna solicitud pendiente. Una verificación SMTP no garantiza que Gmail acepte un futuro destinatario o que llegue a su buzón. [Documentación de Nodemailer](https://nodemailer.com/smtp) y [Gmail con contraseña de aplicación](https://nodemailer.com/guides/using-gmail).

## OAuth transaccional legado

Quedan obsoletos para el despacho activo `services/gmailTransaccionalService.js`, `scripts/autorizarGmailTransaccional.js`, `scripts/comprobarGmailTransaccional.js` y `scripts/gmailTransaccionalPrivado.ps1`, junto con sus variables `TRANSACTIONAL_GOOGLE_*` y `TRANSACTIONAL_GMAIL_*`.

No se eliminaron: conservan dependencias entre herramientas de inspección/autorización histórica y pruebas dedicadas. No son una ruta alternativa seleccionable por el nuevo despacho. Los dos despachadores activos importan SMTP y el lanzador privado ya no carga la credencial OAuth transaccional. Los archivos privados DPAPI y credenciales antiguas permanecen intactos; no se revocaron autorizaciones de Google ni se borraron secretos.

No se eliminó ni modificó Gmail API/OAuth empresarial. No hay fallback automático que pueda enviar el mismo correo por Gmail API y por SMTP.

## Archivos de esta migración

Agregados:

- `services/smtpTransaccionalService.js`.
- `scripts/comprobarSmtpTransaccional.js`.
- `tests/smtp.transaccional.test.js`.
- Este informe.

Modificados:

- `scripts/despacharVerificacion.js`.
- `scripts/trabajadorVerificacionResidente.js`.
- `scripts/verificacionLocalPrivada.ps1`.
- `.env.example`.
- `pruebas-integracion/verificacionAutomatica.js`.

Eliminados: ninguno.

## Pendiente de autorización

La prueba real posterior debe seleccionar una única solicitud y un único buzón controlado, autorizar expresamente el correo de verificación, registrar aceptación SMTP y comprobar recepción. Solo después se sigue el enlace, se configura el administrador y se prueba login real. No se debe activar el trabajador residente para validar esa prueba unitaria.

El sistema está preparado para ese ensayo; esta migración no declara comprobada la recepción real ni el registro completo mediante un correo real.

## Validación final y Git

| Ejecución | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| `npm.cmd test` | 783 | 0 | 0 |
| `node --test --test-concurrency=1 pruebas-integracion/*.js` | 122 | 0 | 0 |

Las once pruebas nuevas generales cubren configuración ausente, TLS/autenticación, destinatario/remitente fijo, errores saneados, cancelación, respuesta ambigua y selección SMTP en el despacho real. Las cuatro integraciones nuevas usan MongoDB transaccional real y SMTP simulado: registro completo hasta administrador con contraseña válida, reenvío explícito tras credenciales rechazadas, consumidores concurrentes y timeout sin reintento tras reconstruir el servicio.

No hubo regresiones finales. Continúan avisos preexistentes de Mongoose sobre la opción `new`; no afectan el resultado. El MongoDB temporal 27018 se recuperó para estas pruebas y se apagó ordenadamente al terminar; las comparaciones del MongoDB original permanecieron iguales. No se despacharon solicitudes de bases empresariales ni del piloto real.

`git diff --check` terminó correctamente. Rama `respaldo-avances-18-oct`, HEAD `1df937e` conservados; cambios sin commit ni push. Archivo accidental intacto y sin seguimiento. Los cambios previos del repositorio, incluidos los archivos de dependencias ya modificados al comenzar, se conservaron.
