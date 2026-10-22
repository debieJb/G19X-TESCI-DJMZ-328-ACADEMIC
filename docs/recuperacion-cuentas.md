# Recuperación de acceso de PluriOne

## Implementación y reutilización

El registro empresarial vigente utiliza `smtpTransaccionalService.crearCorreo()`;
la recuperación usa esa misma fábrica, el remitente y las credenciales ya
configuradas. `correoTransaccionalService` agrega la plantilla «Recupera tu
contraseña de PluriOne» sin cambiar la plantilla de verificación. No se requiere
otra cuenta Gmail, autorización OAuth, contraseña de aplicación ni secreto nuevo.
El adaptador compartido también sigue siendo compatible con Gmail API.

Rutas públicas:

- `GET /login`, `POST /login`: acceso existente con CSRF y límites de intentos.
- `GET /recuperar`, `POST /recuperar`: solicitar instrucciones.
- `GET /recuperar/restablecer`, `POST /recuperar/restablecer`: elegir contraseña.

La respuesta de solicitud siempre indica «Si existe una cuenta asociada a este
correo, recibirás instrucciones para recuperar el acceso». Cuentas ausentes,
bloqueadas, pendientes de verificación o limitadas por cuenta reciben la misma
respuesta pública. Los errores de formato, límites de IP y fallos generales de
infraestructura no dependen de si la cuenta existe. No hay consulta pública de
correos registrados. El registro conserva la normalización y sus índices únicos
para usuarios y solicitudes; las pantallas ofrecen inicio de sesión, reenvío de
verificación y recuperación sin revelar vinculaciones.

El envío de verificación y recuperación se despacha después de responder. Así,
la latencia y los errores del proveedor no distinguen cuentas nuevas/existentes.
La respuesta tiene un mínimo de 350 ms en recuperación; esto reduce diferencias
ordinarias de consulta y no garantiza tiempos idénticos ante una base lenta.

## Persistencia, cola y seguridad

La tarea de recuperación es un subdocumento `Usuario.recuperacion`, excluido de
consultas normales y de `toJSON`/`toObject`. No se crean nuevas colecciones ni
índices. El índice TTL y los contadores de `LimiteRegistro` existentes se reutilizan.
No hace falta ejecutar una migración ni modificar los registros existentes para
activar el código. No se ejecutó DDL ni se conectó una base real durante estas pruebas.

La solicitud se reclama atómicamente antes del envío. El token contiene el ID de
usuario (localización por el índice `_id`) y 32 bytes aleatorios canónicos; solo
su SHA-256 se persiste. Los tokens originales se conservan únicamente en memoria
y en el correo recibido. El enlace usa el origen autorizado existente
`TRANSACTIONAL_PUBLIC_ORIGIN`; nunca `Host`, `X-Forwarded-Host` o un parámetro HTTP.
El secreto va en `#token=...`: el navegador no lo transmite en la petición GET.
Un script externo lo retira del historial y lo coloca en el formulario POST. Sin
JavaScript, se puede pegar el código incluido en el correo.

Si hay un error de validación de contraseña, la sesión conserva exclusivamente
el hash y el ID del usuario para corregirla sin volver a exponer el token. Los
formularios llevan CSRF; las respuestas llevan `no-store`, `no-referrer`, CSP y
protección contra iframes. Las contraseñas nunca se rellenan desde el servidor.

La vigencia es de 15 minutos desde el reclamo del envío. Abrir un enlace no lo
consume. Solicitudes pendientes de más de 15 minutos no se despachan. La misma
tarea no puede enviarse dos veces; una entrega incierta no se reintenta.
El trabajador transaccional existente puede atender tareas pendientes y
clasificar reservas interrumpidas. No se inicia ningún trabajador nuevo desde
las rutas de recuperación ni se modifica el motor de campañas.

Se comparten las claves de cuota de verificación (`gmail-transaccional`): por
defecto 10 correos/minuto y 100/día, con los límites existentes del trabajador.
Se conserva la activación `TRANSACTIONAL_EMAIL_ENABLED` y la validación de origen.
Solicitar instrucciones no habilita un transporte desactivado.

Límites públicos persistentes:

- Solicitud: 30 peticiones/IP por 15 minutos y 3/correo por hora.
- Repeticiones de una cuenta no sustituyen su tarea durante el primer minuto ni
  una entrega en curso. Limitar una cuenta no cambia la respuesta genérica.
- Restablecimiento: 30 intentos/IP y 10/ID de cuenta por 15 minutos. Cambiar la
  parte secreta del token no reinicia el contador de cuenta.
- Las claves se guardan como hashes; la ventana limita incluso si TTL aún no borró
  documentos. Sin el índice TTL requerido, el acceso falla cerrado.

El cambio usa `Usuario.save()` y su middleware bcrypt de coste 12. El filtro de
escritura exige el mismo token, correo, versión y acceso habilitado, además de
fecha vigente; MongoDB verifica también la fecha con `$$NOW`. En una única
escritura se actualiza el hash de contraseña, consume el token e incrementa
`versionSesion`. Dos solicitudes concurrentes no pueden consumir el mismo token.
Las sesiones anteriores se rechazan en su siguiente petición; no se inicia una
sesión automáticamente. Empresa, rol, correo y privilegios no se modifican.
Cuentas históricas sin estado o versión conservan el tratamiento vigente.

Referencia de diseño: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Una única recuperación real autorizada

Esta operación manual enviará un correo. No se realizó durante el desarrollo.

1. Desplegar el código en la instancia autorizada con su procedimiento habitual.
   Conservar las credenciales y el transporte transaccional que ya verifica
   registros. Su activación existente debe estar habilitada y el origen público
   autorizado debe ser accesible. No ejecutar scripts de autorización, migraciones,
   despachadores de campañas ni iniciar el trabajador residente para esta prueba;
   la ruta despacha únicamente la tarea nueva de esa solicitud.
2. Elegir una cuenta de prueba existente, activa y de buzón controlado, con permiso
   de su responsable. Mantener una sesión abierta en el navegador A para comprobar
   después su revocación. No usar cuentas de terceros.
3. En otro navegador/perfil B, abrir `/login`, pulsar «¿Olvidaste tu contraseña?»,
   escribir el correo de prueba y pulsar **Enviar instrucciones una sola vez**.
   Debe aparecer el mensaje genérico. Revisar entrada y spam; no repetir la solicitud
   para forzar otro envío si no llega.
4. Abrir únicamente el mensaje con asunto **Recupera tu contraseña de PluriOne**.
   Comprobar que el dominio corresponde al origen autorizado de la plataforma y
   abrir el enlace dentro de 15 minutos. No compartirlo, capturarlo ni pegarlo en logs.
5. Escribir y confirmar una contraseña de prueba nueva: mínimo 16 caracteres,
   cuatro caracteres diferentes y máximo 72 bytes UTF-8. Pulsar **Guardar nueva
   contraseña** una vez. Debe mostrarse la confirmación de actualización.
6. En A, intentar abrir una página protegida: debe perder acceso y volver al login.
   En B, comprobar una vez que la contraseña anterior falla con **Correo o contraseña
   incorrectos**, y después entrar con la nueva. No se envían más correos por estas
   comprobaciones.
7. Opcionalmente comprobar desde una sesión nueva que el mismo enlace ya no permite
   otro cambio. Esto no solicita otro correo. No volver a pulsar Enviar instrucciones.

Si falta el correo, no asumir entrega por el HTTP 202. Revisar solo estados de
la tarea (`pendiente`, `procesando`, `enviada`, `fallida`, `incierta`), configuración
vigente y códigos de diagnóstico saneados mediante las herramientas administrativas
existentes, sin imprimir `recuperacion`, contraseñas, hashes privados ni mensajes
completos. Un resultado incierto se concilia antes de solicitar otro enlace.

## Pruebas automatizadas

`node --test` ejecuta la suite general. Las pruebas nuevas usan sesiones reales,
Mongoose/bcrypt reales y persistencia/transporte simulados; bloquean conexiones
MongoDB, SMTP y llamadas externas reales. Se comprueban solicitud pública,
confirmación, caducidad, consumo concurrente, revocación de sesiones, CSRF,
aislamiento, límites, normalización, duplicados y reutilización del correo vigente.
La entrega real, el proxy/origen del despliegue y transacciones contra MongoDB real
se reservan para validación operativa autorizada; no se certifican con un almacén
simulado.

## Archivos de esta entrega

- Integración: `appFactory.js`, `routes/recuperacionPasswordRoutes.js`.
- Controladores: `controllers/authController.js`,
  `controllers/registroPublicoController.js`,
  `controllers/recuperacionPasswordController.js`.
- Persistencia: `models/Usuario.js`.
- Servicios: `services/recuperacionPasswordService.js`,
  `services/limitesRecuperacionService.js`, `services/correoTransaccionalService.js`,
  `services/trabajadorVerificacionService.js`.
- Interfaz: `views/login.ejs`, `views/registro.ejs`, `views/recuperacion.ejs`,
  `public/js/recuperacion.js`, `public/css/publico.css`.
- Pruebas nuevas: `tests/recuperacion.service.test.js`,
  `tests/recuperacion.http.test.js`, `tests/recuperacion.limites.test.js`,
  `tests/recuperacion.interfaz.test.js`, `tests/soporte/recuperacionFixture.cjs`.
- Pruebas/fixtures actualizados: `tests/autoservicio.http.test.js`,
  `tests/autoservicio.unit.test.js`, `tests/smtp.transaccional.test.js`,
  `tests/verificacion.residente.test.js`, `tests/soporte/publicoFixtures.cjs`,
  `tests/soporte/internoFixtures.cjs`.

Resultado final de `node --test`: **904 aprobadas, 0 fallos, 0 omitidas**.
Se incluyen las regresiones de campañas, Gmail, Gemini, usuarios, sesiones y registro.
Los cambios de campañas presentes previamente en el workspace se conservaron.
