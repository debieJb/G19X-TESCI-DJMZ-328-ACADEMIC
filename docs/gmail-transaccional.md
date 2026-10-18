# Gmail transaccional de la plataforma

Implementado, pendiente de autorizar una cuenta y verificar recepción real. No se ha
enviado correo ni consumido Google con este adaptador. Las pruebas interceptan OAuth
y Gmail. El transporte sigue apagado por defecto. No usar sus pruebas como evidencia
de entrega, validez de credenciales o cuota de Google.

## Arquitectura y separación

`gmailTransaccionalService` reutiliza `googleOAuthClienteService.crearCliente`, su
política de timeout/sin retry/sin redirecciones, el constructor MIME y el cifrado AES-GCM.
No utiliza `ConexionGmail`, `EstadoOAuth`, usuarios empresariales ni sus tokens.
Cliente OAuth, client secret, cuenta y clave de cifrado son exclusivos de plataforma;
la configuración rechaza reutilizar cliente, secreto o clave empresarial cuando
esas variables están presentes. Usa otro cliente OAuth, preferiblemente otro proyecto.

El permiso Gmail solicitado es únicamente `https://www.googleapis.com/auth/gmail.send`.
`openid` y `email` sirven para verificar mediante ID token firmado que se autorizó
exactamente la cuenta remitente esperada; no se solicita lectura de buzón, contactos
ni acceso completo a Gmail. No se usan contraseñas de Gmail ni app passwords.

El autorizador local usa state de un uso, nonce y PKCE S256; caduca a los cinco
minutos. Verifica audiencia/firma con la biblioteca Google, correo verificado,
nonce, identidad remitente y scope concedido. Guarda solamente un sobre cifrado con
refresh token e identidad vinculados al cliente. El access token vive en memoria y
se renueva antes de cada unidad, sin reintentos automáticos. Nunca se registra.

## Configuración exacta en Google Cloud

1. Seleccionar o crear el proyecto exclusivo del remitente de plataforma y habilitar
   **Gmail API**. No cambiar el cliente OAuth de campañas empresariales.
2. Configurar Google Auth Platform: nombre de la aplicación, contacto/soporte y audiencia.
   Para Gmail personal, audiencia **External**. Durante pruebas mantener **Testing**
   y agregar esa cuenta como usuario de prueba.
3. En acceso a datos declarar `openid`, `email` y el scope `gmail.send` indicado arriba.
   No agregar scopes de lectura, modificación o borrado del buzón.
4. Crear un cliente OAuth de tipo **Web application**. Registrar exactamente esta URI
   de redirección autorizada (sin barra final):

   ```text
   http://127.0.0.1:3001/oauth/callback
   ```

   No sustituir `127.0.0.1` por `localhost`, no usar `/empresa/gmail/callback` ni el
   puerto de Express. El callback administrativo no se publica en Express y no
   necesita JavaScript origins. Abrir el navegador en la misma máquina del autorizador.
5. Registrar privadamente client ID y client secret en el entorno protegido. No
   pegarlos en chats, argumentos de comandos, capturas, logs o archivos rastreados.

Google documenta que los refresh tokens de aplicaciones External en Testing caducan
a los siete días cuando incluyen scopes Gmail. Antes de operación estable revisar
publicación, verificación que corresponda, límites y políticas de la cuenta. No se
garantiza una cuota o entregabilidad concreta por disponer de un token.

Fuentes oficiales:
[OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server),
[caducidad de tokens](https://developers.google.com/identity/protocols/oauth2/),
[messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).

## Variables de entorno

No hay valores de credenciales en este documento. `.env.example` contiene únicamente
campos vacíos y las opciones públicas siguientes. `.env` permanece privado e ignorado.

| Variable | Requisito |
|---|---|
| `TRANSACTIONAL_EMAIL_ENABLED` | `false` hasta autorizar un envío concreto. No activa campañas. |
| `TRANSACTIONAL_GOOGLE_CLIENT_ID` | Cliente Web exclusivo de plataforma. |
| `TRANSACTIONAL_GOOGLE_CLIENT_SECRET` | Secreto exclusivo, inyectado privadamente. |
| `TRANSACTIONAL_GOOGLE_REDIRECT_URI` | URI exacta indicada arriba. |
| `TRANSACTIONAL_GMAIL_SENDER` | Dirección real de la cuenta Gmail que se autorizará; sin aliases arbitrarios. |
| `TRANSACTIONAL_GMAIL_ENCRYPTION_KEY` | 32 bytes aleatorios en base64 canónico, generados mediante gestor seguro; diferente de la clave empresarial. No imprimirla. |
| `TRANSACTIONAL_GMAIL_CREDENTIALS_FILE` | Ruta absoluta a un archivo nuevo fuera del repositorio, en un directorio privado existente. |
| `TRANSACTIONAL_PUBLIC_ORIGIN` | Origen HTTPS público de la web de registro; sin ruta, credenciales, query o fragmento. |

El archivo cifrado no reemplaza permisos del sistema: restringir ACL de Windows al
operador/cuenta de servicio que lo necesita, proteger también sus directorios y la
clave independiente. `mode:0600` no garantiza ACL en Windows. No usar carpetas públicas
o sincronizadas. El autorizador crea el archivo con `wx`; nunca sobrescribe una
credencial existente. Guardar copia cifrada y clave por separado según política.

Los comandos siguientes no cargan `.env` implícitamente. Si se usa un archivo privado
en desarrollo, Node 24 permite anteponer `--env-file=.env`; en despliegue preferir
inyección de secretos. No agregar credenciales como argumentos de consola.

## Autorizar la cuenta (sin enviar correo)

1. Completar Google Cloud, variables y permisos anteriores; mantener envío en `false`.
2. Verificar que 3001 esté libre. No detener procesos ajenos para liberarlo.
3. Ejecutar localmente, solo cuando se vaya a autorizar la cuenta:

   ```powershell
   node --env-file=.env scripts/autorizarGmailTransaccional.js --autorizar
   ```

4. Abrir la URL de consentimiento mostrada en el navegador local. Contiene parámetros
   OAuth públicos/state, nunca client secret o tokens. No compartirla. Seleccionar
   exactamente la cuenta configurada y conceder permisos. El callback no registra
   su URL, código ni tokens y muestra solo un resultado genérico.
5. Confirmar el mensaje de credencial cifrada guardada y mantener el transporte
   deshabilitado. Un fallo no reemplaza la credencial anterior. El script termina
   al completar/cancelar/caducar y no envía mensajes ni conecta MongoDB.

Revocación: quitar acceso de la aplicación desde la seguridad de la cuenta Google,
apagar el transporte y autorizar de nuevo hacia un archivo nuevo. No borrar ni
sobrescribir automáticamente los anteriores. `invalid_grant` obliga a revisar
revocación/caducidad; nunca intentar tokens empresariales como alternativa.

## Trabajador y persistencia

`SolicitudRegistro` sigue siendo la bandeja persistente; no hay nueva cola en memoria
ni envío desde HTTP. El consumidor existente reclama una versión en transacción,
guarda hash del enlace y caducidad y envía fuera de la transacción. El trabajador
inyecta el correo real y filtra por **un ID de solicitud explícito**. Puede recoger
`pendiente_configuracion`; no es necesario activar el proveedor en Express.

`supervisarVerificacion.js` reutiliza el supervisor existente, arranca una sola unidad,
limita su duración a 45 segundos y tiene **cero reinicios/reintentos automáticos**.
La bandeja sobrevive al proceso. No es un daemon ni un envío masivo automático.
El destino debe coincidir con `infra/piloto.aprobado.json`, tener replica set dedicado
e índices ya provisionados. No se provisiona al arrancar ni en una petición. Rechaza
el standalone 27017 y `marketingDevRs`: las fixtures nunca se usan para correo real.

El timeout total del adaptador es 10 segundos. Tras cancelación durante OAuth no se
inicia un POST tardío. Rechazos HTTP confirmados quedan `fallida`; desconexiones,
5xx, redirects, respuesta ilegible o timeout quedan `incierta`. No se repite un POST
automáticamente, tampoco ante 401/429. `enviada` significa aceptación API, no recepción.
Si falla guardar el resultado o se mata el proceso, la reserva permanece `procesando`;
revisar/conciliar antes de actuar. No existe garantía de exactamente una entrega externa.

Un reenvío explícito usa los límites existentes (una solicitud por minuto, cinco por
día en bandeja y límites persistentes HTTP/IP/correo), invalida el enlace anterior y
genera otra versión. No reparar estados ni reenviar a ciegas. El enlace dura 30 min,
la configuración 20 min; confirmar requiere POST+CSRF. El GET no consume el enlace.

## Una prueba real posterior: requiere autorización expresa

1. Verificar web HTTPS accesible, proxy confiable explícito, cookies Secure/HttpOnly/
   SameSite, sesiones persistentes y destino dedicado con índices. El estado actual
   de infraestructura no queda acreditado por esta implementación.
2. Acordar cuenta remitente, buzón controlado, ID de solicitud y ventana de prueba.
   Crear una única solicitud desde `/registro`; no crear empresa/usuario antes de verificar.
3. Autorizar explícitamente **un correo de verificación**. Solo entonces habilitar
   `TRANSACTIONAL_EMAIL_ENABLED=true` en el entorno del trabajador. Mantener campañas
   y Gemini apagados. El ID es de `SolicitudRegistro`, no un correo, empresa o EnvioGmail.
4. Ejecutar una vez:

   ```powershell
   node --env-file=.env scripts/supervisarVerificacion.js --solicitud ID_SOLICITUD --autorizar-envio
   ```

5. Apagar otra vez la bandera. Consultar el estado/auditoría sin mostrar enlace ni tokens.
   Si queda incierta/procesando/fallida, detener y revisar, sin repetir el comando.
6. Comprobar recepción (incluido spam), fecha, remitente y destinatario. Abrir el enlace
   en el navegador propio, confirmar, configurar administrador e iniciar sesión.
   Verificar que login previo a configuración fracase, y reutilizar el enlace no funcione.
7. Conservar evidencia redactada de aceptación, recepción, solicitud completada y login.
   Solo entonces declarar validado este recorrido real. No acredita envío de campañas.

## Login y seguridad pública

Login incorpora token CSRF de sesión obligatorio: GET crea la sesión anónima y POST
requiere `_csrf`. Es un cambio de seguridad necesario del formulario, no una API de
login sin sesión. Los contadores comparten `LimiteRegistro`: diez intentos por correo
y cuarenta por IP cada quince minutos, claves hash, TTL solo para limpieza. Si falta
el almacén/índice, falla cerrado con 503; si se excede, 429 con Retry-After.
Provisionar esos índices fuera de HTTP antes del despliegue; no se hace DDL automático.
La protección distribuida de proxy/edge y la disponibilidad requieren validación operacional.
Los usuarios nuevos pendientes/bloqueados no autentican; el administrador se crea activo
solo después de verificar correo y completar configuración. Se conserva compatibilidad
de usuarios históricos sin estado, sin migrarlos en esta tarea.

## Evidencia local de esta implementación

- Suite habitual `node --test`: **616 aprobadas**, cero fallidas, canceladas u omitidas.
- Integraciones reales de MongoDB: autoservicio **19**, registro **14**, campañas **2**,
  cuotas **8**, motor Gmail simulado **34**, infraestructura/sesiones **12**: **89/89**.
- El caso adicional verifica despacho por ID: otra solicitud permanece pendiente y
  repetir el ID ya procesado no vuelve a llamar al transporte.
- Las seis suites se ejecutaron con guardia externa al repositorio: inventario inicial,
  rechazo de escrituras sobre bases preexistentes y propiedad/marcador/identidad antes
  de eliminación. Se crearon y eliminaron 89 fixtures nuevas en marketingDevRs:27018;
  no quedaron bases nuevas. Datos/índices de las dos fixtures preexistentes, referencia
  de 27017 y configuración/opciones del replica set coinciden antes y después.
- Los transportes OAuth/Gmail permanecieron simulados. Se ejecutó el supervisor
  transaccional como proceso real solo en `--comprobar`, sin conexión ni envío.
- Las vistas EJS y formularios fueron comprobados por HTTP/Supertest; no se realizó
  una inspección visual en navegador o dispositivo móvil real.
- No se ejecutó el autorizador de cuenta, no se crearon credenciales reales, no se
  cambió `.env`, no hubo envíos, commits ni push.

Los resultados anteriores de 593/88 son la base histórica; estos contadores son una
ejecución nueva y no se suman a las repeticiones. Ningún resultado acredita Google real.
