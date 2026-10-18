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

Para autorizar OAuth, el origen público puede quedar sin definir: el autorizador
usa `configuracionOAuth`, que conserva las comprobaciones de identidad, cliente,
callback y cifrado. El transporte sigue exigiendo el origen HTTPS mediante
`configuracion`; no se admiten dominios ficticios para simular disponibilidad.

## Entrada privada en Windows (procedimiento preferido)

Se añadió `scripts/gmailTransaccionalPrivado.ps1` para evitar introducir secretos
en comandos, chat o archivos de texto plano. Ejecutarlo desde una consola local
normal del propietario de la cuenta, sin compartir ni grabar la pantalla.
No introducir contraseñas de Gmail, access tokens ni refresh tokens.

```powershell
.\scripts\gmailTransaccionalPrivado.ps1 -Accion Configurar
```

Introduce en los prompts ocultos: client ID del cliente exclusivo transaccional,
client secret y correo exacto del remitente. El origen HTTPS es opcional para esta
autorización: pulsa Enter si aún no está definido; no inventar uno. El callback es
fijo y no se solicita. La clave AES independiente de 32 bytes se genera en memoria,
no se muestra y no reemplaza claves existentes.

El asistente crea una carpeta privada nueva:
`%LOCALAPPDATA%\PluriOne\marketing-automation\gmail-transaccional`.
Restringe su ACL al usuario actual y SYSTEM, rechaza rutas redirigidas y verifica
que el destino no esté dentro de ningún repositorio Git. La configuración completa
se guarda con DPAPI del usuario actual en `config.dpapi`. No modifica `.env` ni las
variables/conexiones empresariales. No sobrescribe archivos existentes. Si una
configuración inválida dejó una carpeta vacía, permite repetir la entrada sin
eliminar archivos ni reemplazar credenciales.

Después, desde la misma cuenta de Windows y equipo:

```powershell
.\scripts\gmailTransaccionalPrivado.ps1 -Accion Autorizar
```

El asistente descifra la configuración solo en memoria, comprueba separación
respecto de las credenciales empresariales privadas de `.env`, fuerza apagadas las
banderas de transporte en el proceso hijo y ejecuta el autorizador existente.
Abre el navegador local sin imprimir la URL de consentimiento. Elige la cuenta
remitente prevista y concede permisos. No copies la URL del callback ni sus códigos.
El archivo `credencial.cipher` contiene únicamente el sobre AES-GCM con la identidad
y el refresh token, nunca JSON en claro. Su ACL se vuelve a revisar al finalizar.

El éxito se comunica como `CREDENCIAL_CIFRADA_VERIFICADA`. El verificador local
`scripts/comprobarGmailTransaccional.js` valida formato, autenticidad del cifrado,
cliente e identidad en memoria, sin renovar tokens ni consultar Gmail/MongoDB.
Solo devuelve indicadores booleanos, no contenido de la credencial. Puedes repetir
esa comprobación sin reautorizar ni realizar llamadas externas:

```powershell
.\scripts\gmailTransaccionalPrivado.ps1 -Accion Comprobar
```

### Corrección del bloqueo al repetir Autorizar

El mensaje antiguo `COMPROBACION_TRANSACCIONAL_RECHAZADA` ocultaba la razón. En la
reproducción real del 18 de octubre se encontró una credencial cifrada **ya existente
y válida localmente**. El asistente ejecutaba siempre `--configuracion`, que rechaza
archivos existentes para protegerlos de sobrescritura. No era un fallo de DPAPI,
tipos JSON ni de los permisos de Google: el flujo no distinguía esa situación.

Ahora `-Accion Autorizar`, si ya existe el archivo, ejecuta la validación completa
`--credencial`: comprueba ACL, ruta, sobre AES-GCM y vínculo cliente/remitente.
Si pasa, muestra `CREDENCIAL_EXISTENTE_VALIDADA` y no abre otro OAuth ni modifica
credenciales. Si falla, se detiene con un código seguro y conserva el archivo.
El autorizador directo mantiene `wx` y la prohibición de sobrescritura.
La validación local no prueba renovación actual del refresh token frente a Google.

`-Accion Validar` permite comprobar configuración y, si existe, credencial sin
iniciar OAuth. Los errores incluyen un código cerrado y una etapa; nunca imprimen
mensajes arbitrarios, valores, cuerpos de Google ni excepciones originales.

| Código | Acción segura |
| --- | --- |
| `TX_CREDENCIAL_YA_EXISTE` | No eliminarla: usar Comprobar o el Autorizar corregido. |
| `TX_CREDENCIAL_INVALIDA`, `TX_SOBRE_CIFRADO_INVALIDO` | Conservar archivos y revisar cliente/clave/identidad privadamente; no resetear. |
| `TX_DPAPI_NO_DESCIFRABLE` | Usar la misma cuenta y equipo Windows; no regenerar la clave. |
| `TX_DPAPI_NO_LEIBLE`, `TX_ACL_O_RUTA_INVALIDA`, `TX_ACCESO_DENEGADO` | Revisar existencia y permisos locales sin volcar archivos. |
| `TX_CLIENT_ID_INVALIDO`, `TX_CLIENT_SECRET_INVALIDO`, `TX_REMITENTE_INVALIDO` | Revisar exclusivamente el campo indicado en el entorno privado. |
| `TX_CLIENTE_EMPRESARIAL_COMPARTIDO`, `TX_CLAVE_EMPRESARIAL_COMPARTIDA` | Mantener la separación; no reutilizar datos empresariales para sortearlo. |
| `TX_CALLBACK_INVALIDO` | Mantener la URI loopback exacta de este documento. |
| `TX_CLAVE_CIFRADO_INVALIDA`, `TX_RUTA_CREDENCIAL_INVALIDA`, `TX_CREDENCIAL_DENTRO_REPOSITORIO` | Revisar formato/ruta en privado; no cambiar la clave de una credencial existente. |
| `TX_GIT_NO_DISPONIBLE`, `TX_DIRECTORIO_GIT_NO_PERMITIDO` | Corregir disponibilidad de Git o ubicación; no saltar la comprobación. |
| `TX_ORIGEN_HTTPS_INVALIDO` | Configurar el origen HTTPS real; no inventar un dominio ni habilitar HTTP. |
| `TX_CALLBACK_OCUPADO`, `TX_OAUTH_CADUCADO` | No duplicar procesos; comprobar estado y repetir solo cuando el anterior haya terminado. |

En esta revisión la credencial existente pasó, pero `origenEnviosConfigurado` era
`false`. Cuando el responsable disponga del origen HTTPS real, introducirlo en el
prompt oculto de:

```powershell
.\scripts\gmailTransaccionalPrivado.ps1 -Accion ConfigurarOrigen
```

Esta acción modifica únicamente ese campo de configuración DPAPI, tras validar el
HTTPS, y conserva cliente, secreto, clave AES y token. No realiza solicitudes a
Google, no habilita transporte y no comprueba que el dominio sea accesible. El
HTTPS, sesiones y trabajador deben validarse antes de una prueba real autorizada.

Regresión local sobre la credencial existente: Autorizar terminó con código 0,
red y creación de un servidor OAuth bloqueadas, y hashes de `config.dpapi`,
`credencial.cipher` y `.env` idénticos antes/después. No hubo renovación, otro
consentimiento ni envío. Las pruebas también cubren códigos específicos, datos
OAuth con tipos inválidos, cifrado alterado y ausencia de valores privados en stderr.

Los tres comandos contienen exclusivamente acciones públicas; los datos privados
no se pasan por argumentos ni quedan en el historial. Las variables del proceso
se restauran al terminar. Los errores se presentan sin excepciones, URL ni cuerpos
del proveedor. No usar `Get-Content`, volcados de entorno o trazas para depurarlos.
Mantener tanto la configuración DPAPI como el archivo cifrado fuera de copias
versionadas; el código del asistente puede versionarse, sus datos privados no.

La autorización solicita a Google un código/token y verifica identidad; no acredita
envío, recepción, estabilidad de refresh futuro ni una integración productiva completa.
El transporte permanece `false`; la configuración DPAPI no se carga automáticamente
en Express o trabajadores. Habilitar un envío exige una tarea expresamente autorizada.

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
