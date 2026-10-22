# Gmail OAuth independiente por empresa (etapa 2)

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


## Funcionalidad

El administrador empresarial encuentra **Configurar Gmail** en `/panel` y en la navegación. La pantalla está en `/empresa/gmail` y permite conectar, consultar el estado, comprobar/renovar autorización y desconectar. No envía correo, no cambia los workflows de n8n y todavía no incorpora estos tokens al envío de campañas.

No se crea una conexión ficticia cuando falta configuración. La aplicación solo marca una conexión como `conectada` después de canjear un código de Google, verificar la firma y los claims de su ID token y persistir tokens cifrados. Los dobles de Google y las claves efímeras de las pruebas son exclusivamente locales.

## Configuración manual en Google Cloud

1. Crea o selecciona un proyecto dedicado a Marketing Automation. Es recomendable separar los proyectos de desarrollo y producción para que las autorizaciones y revocaciones no se afecten entre entornos.
2. En **APIs y servicios → Biblioteca**, habilita **Gmail API**.
3. En **Google Auth Platform**, configura **Branding**, el nombre de la aplicación, los correos de soporte/contacto y los dominios y URLs de privacidad que correspondan al despliegue.
4. En **Audience**, selecciona **External** si participarán empresas y cuentas ajenas a tu organización de Google Workspace. **Internal** solo sirve para usuarios de tu organización compatible. Mientras esté en Testing, agrega las cuentas reales que probarán OAuth como usuarios de prueba.
5. En **Data Access**, configura los scopes solicitados por esta implementación:
   - `openid`
   - `email` (Google puede mostrar su equivalente `https://www.googleapis.com/auth/userinfo.email`)
   - `https://www.googleapis.com/auth/gmail.send`
6. En **Clients**, crea un cliente OAuth de tipo **Web application**. Registra una URI de redirección autorizada que coincida exactamente con la variable de entorno indicada abajo.
   - Desarrollo local: `http://localhost:3000/empresa/gmail/callback` si tu servidor usa el puerto 3000.
   - Despliegue: `https://TU_DOMINIO/empresa/gmail/callback`, sustituyendo el dominio por el real.
   - No necesitas JavaScript origins para este flujo de servidor. Nunca uses el callback de n8n: la aplicación intercambia y custodia las credenciales.
7. Guarda el **Client ID** y **Client secret** en la configuración privada del servidor. Google puede mostrar el secreto solo al crear el cliente; no lo copies a documentación, frontend, mensajes o repositorios.

Un solo cliente OAuth identifica a la plataforma, pero cada empresa tiene tokens propios. No se pide a cada empresa compartir la contraseña de Gmail ni las credenciales OAuth del cliente de la plataforma.

La documentación oficial detalla la [pantalla de consentimiento](https://developers.google.com/workspace/guides/configure-oauth-consent) y el [flujo de servidor](https://developers.google.com/identity/protocols/oauth2/web-server). `gmail.send` es un scope sensible: para distribuir públicamente a usuarios externos debes evaluar y completar la verificación de Google. [Clasificación de scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Variables privadas del servidor

| Variable | Valor requerido |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID real del cliente Web application creado en Google Cloud. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret real del mismo cliente. |
| `GOOGLE_OAUTH_REDIRECT_URI` | URI exacta registrada en Google Cloud, con ruta `/empresa/gmail/callback`, sin query, fragmento ni credenciales embebidas. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Clave aleatoria de 32 bytes codificada en base64; distinta de `SESSION_SECRET` y guardada fuera de MongoDB. |

Configúralas mediante el mecanismo privado de despliegue que ya uses. La implementación no genera ni imprime valores por defecto y no necesita leer `.env` durante las pruebas. La clave de cifrado no viene de Google Cloud.

Para generar la clave tú mismo, en un entorno privado:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Guarda el resultado directamente en tu gestor de secretos; no lo pegues en la conversación. Conserva una copia protegida: perder o cambiar esa clave impide descifrar conexiones existentes. Esta etapa no incluye rotación automática de claves. No sustituyas una clave en uso sin un procedimiento separado de recifrado o revocación/reconexión.

El callback admite HTTP únicamente para loopback en desarrollo y exige HTTPS en producción. El host y la redirección no se derivan de `Host`, query o cuerpo HTTP. Todas las instancias que atiendan una misma aplicación deben compartir configuración y claves coherentes.

## Probar manualmente sin enviar correo

1. Configura las variables reales, MongoDB de desarrollo y la sesión de la aplicación. Inicia el servidor con el procedimiento habitual.
2. Inicia sesión como `admin_empresa`, entra a **Configurar Gmail** y pulsa **Conectar Gmail**.
3. Selecciona la cuenta real de esa empresa y autoriza identificación y envío. Conectar no ejecuta campañas ni envía mensajes.
4. Google regresa al callback. La aplicación muestra la cuenta verificada y el estado `Conectada`.
5. **Comprobar y renovar autorización** reutiliza el access token vigente o lo renueva si está próximo a caducar. No realiza una llamada Gmail para comprobar el buzón, ni detecta inmediatamente todas las revocaciones externas mientras un token siga vigente localmente.
6. Para cambiar de cuenta, desconecta la anterior. **Desconectar Gmail** invalida autorizaciones pendientes, elimina los tokens de uso y solicita revocación en Google.
7. Si Google no confirma, el estado es **Deshabilitada; revocación pendiente**. No se utilizan esos tokens; se conserva cifrado únicamente el token necesario para reintentar la revocación. La misma cuenta sigue reservada hasta completar la limpieza.

Con aplicaciones externas en Testing, un refresh token que incluya scopes como Gmail puede expirar a los siete días. No significa que haya fallado el cifrado o la programación: debes volver a autorizar o completar el paso de publicación/verificación que corresponda. También puede invalidarse por revocación, cambios de seguridad o límites de Google. [Condiciones de OAuth](https://developers.google.com/identity/protocols/oauth2).

## Seguridad e aislamiento

- Solo `admin_empresa` administra su propia conexión; operador y superadmin no utilizan estas rutas. La empresa y el usuario se obtienen de la sesión cargada desde la base; no se aceptan IDs empresariales del formulario.
- Conectar y renovar requieren empresa existente y activa. Una empresa inactiva puede consultar y desconectar.
- Los POST llevan CSRF de sesión. El callback usa `state` aleatorio, almacenado como hash, ligado a usuario, empresa, sesión, cliente OAuth, versión de conexión y caducidad de diez minutos. Se consume mediante eliminación atómica con comprobación de fecha; no depende de que MongoDB haya procesado TTL.
- PKCE S256 protege el intercambio del código. Un nonce vincula el ID token a la autorización iniciada. La biblioteca oficial `google-auth-library` verifica firma, audiencia, emisor y vigencia; además se exige email verificado y los permisos solicitados.
- AES-256-GCM usa IV aleatorio y contexto autenticado de empresa y propósito. No puede trasladarse un token cifrado de A a B ni sustituirse un refresh token por un access token.
- Los campos cifrados están excluidos de consultas habituales y serialización. El servicio público de estado utiliza una lista blanca independiente de la proyección. Los tokens no se guardan en la sesión, HTML, logs de la aplicación ni payloads de n8n.
- Las renovaciones usan un bloqueo temporal persistido de 45 segundos y actualizaciones por versión. Los callbacks y renovaciones atrasados no reactivan una conexión que cambió o se desconectó. Las solicitudes a Google tienen timeout de diez segundos, sin redirecciones ni reintentos automáticos.
- Una identidad Google no se asocia simultáneamente a dos empresas. Google revoca permisos de la cuenta a nivel de proyecto, por lo que compartir esa identidad podría afectar a otra empresa incluso con registros de tokens separados. [Revocación de Google](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).
- Los errores de Google se convierten en mensajes fijos. Éxitos y fallos del callback terminan en URLs locales sin código OAuth. Se utiliza `no-store` y `Referrer-Policy: no-referrer`. Configura también proxies/APM para no registrar queries del callback ni tráfico que contenga tokens.

La aplicación solicita permiso de envío pero no llama `users.messages.send` en esta etapa. La conexión OAuth tampoco registra consentimiento de marketing de los contactos.

## Persistencia y límites de despliegue

`ConexionGmail` declara índices únicos de empresa e identidad Google. `EstadoOAuth` declara unicidad del hash y TTL de caducidad. No se ha conectado a la base de producción ni ejecutado una migración. El despliegue debe asegurar que estos índices estén creados; si deshabilitas `autoIndex`, debes incluirlos en tu procedimiento de despliegue antes de habilitar OAuth multiempresa.

Las pruebas mantienen Mongoose y sesiones reales con persistencia simulada; las pruebas de firma usan claves efímeras y la verificación criptográfica real de la biblioteca, sin contactar Google. No sustituyen una verificación de índices y concurrencia en MongoDB desechable ni una conexión manual con credenciales reales.

El bloqueo existente de `config/session.js` en producción se conserva. Antes de desplegar públicamente siguen pendientes el almacén persistente de sesiones y las cookies HTTPS del plan de producción; no se habilita MemoryStore en producción para facilitar OAuth.

## Archivos y rutas

- Modelos: `models/ConexionGmail.js`, `models/EstadoOAuth.js`.
- Servicios: `services/gmailOAuthService.js`, `services/googleOAuthClienteService.js`, `services/cifradoCredencialesService.js`, `services/ErrorGmail.js`.
- HTTP: `controllers/gmailController.js`, `routes/gmailRoutes.js`, `middlewares/csrfGmail.js`.
- Interfaz: `views/empresa/gmail.ejs`, enlace del panel empresarial y navegación.
- Rutas: GET `/empresa/gmail`, POST `/empresa/gmail/conectar`, GET `/empresa/gmail/callback`, GET `/empresa/gmail/resultado`, POST `/empresa/gmail/renovar`, POST `/empresa/gmail/desconectar`.

Ejecuta `npm.cmd test` para conservar la cobertura anterior y ejecutar las pruebas nuevas de OAuth, firmas, cifrado, permisos y aislamiento. No necesitas credenciales reales para ejecutar la suite.
