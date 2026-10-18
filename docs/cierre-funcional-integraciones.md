# Preparación de las tres pruebas reales — 18 de octubre de 2026

> Actualización posterior de infraestructura: se recuperaron los servicios existentes
> de 27019 y 27020. Sus bloqueos y las verificaciones actuales están en
> [infraestructura recuperada](infraestructura-recuperada-2026-10-18.md).
> Los inventarios de servicios inferiores describen el diagnóstico previo al arranque.

Estado: **pendiente de proveedores reales**. Este documento no autoriza envíos,
consumo de Gemini, cambios de secretos ni aprovisionamiento de infraestructura.
El diseño aprobado se conserva. No se hicieron commits ni push en esta revisión.

## Diagnóstico observado, sin revelar credenciales

| Integración | Implementación | Verificación local | Bloqueo externo/operacional |
| --- | --- | --- | --- |
| Gmail empresarial | OAuth, identidad firmada, tokens cifrados, cola transaccional, autorización, cuotas, trabajador supervisado, Gmail IDs y estados inciertos | Transporte simulado y persistencia MongoDB real | Credenciales presentes y estructura válida, autenticidad no probada; piloto apagado, sin empresas autorizadas, manifiesto aprobado ni clave de sesiones persistentes |
| Verificación empresarial | SolicitudRegistro persistente, despacho dirigido, OAuth independiente, cifrado, enlaces de un uso, CSRF y configuración del administrador | HTTP, transporte simulado y transacciones MongoDB reales | Faltan las ocho variables transaccionales, autorización de cuenta y credencial cifrada; transporte apagado |
| Gemini | REST auténtico, JSON estructurado, revisión humana, guardado de borrador, cuotas por empresa y control de acceso | Transporte simulado, HTTP y cuotas de desarrollo con MongoDB real | Clave/modelo presentes y estructura válida, autenticidad no probada; banderas apagadas y almacén protegido sin conexión configurada |

Instancias observadas por comprobación TCP: 27017, 27018 y Express 3000 responden;
27019, 27020 y el callback administrativo 3001 no responden. La ausencia de listener
no demuestra que no existan directorios o configuraciones persistentes. No recrearlos.
`marketingDevRs:27018` está PRIMARY. La referencia de proceso/configuración/datos/
índices de 27017 coincide. No se ha acreditado infraestructura productiva.
Un inventario de solo lectura de `marketing_automation:27017` encontró dos empresas,
dos usuarios, ninguna conexión Gmail empresarial ni solicitudes de autoservicio.
No se trasladaron ni modificaron esos datos para preparar el ensayo.

No existe `infra/piloto.aprobado.json`. Los archivos DPAPI de cuotas de los perfiles
histórico y Gemini tampoco están disponibles en las ubicaciones esperadas. La
recuperación de 27019/27020 requiere revisar la identidad y configuración existentes;
no ejecutar preparación inicial sobre directorios existentes. Véanse
[infraestructura Gmail](piloto-gmail-un-correo.md) y
[almacén protegido](cuotas-ia-produccion.md).

## Correcciones locales imprescindibles

- La pantalla existente `/campanas/:id/automatizacion` conecta ahora con las rutas
  ya existentes de autorizar, encolar, revocar y consultar. Utiliza los componentes
  y estilos actuales. El panel aparece solo para un administrador de empresa incluida
  en el piloto y una aplicación arrancada con infraestructura validada. No convierte
  el arranque normal ni MemoryStore en un piloto autorizado.
- Formularios con CSRF, confirmaciones independientes, bloqueo de doble envío,
  clave de idempotencia conservada por campaña en la pestaña y consulta explícita
  del ID/estado/intentos/Gmail ID. Sin llamadas automáticas al proveedor ni reintentos
  ante respuestas desconocidas. Si no puede conservar la clave, no habilita encolar.
  El backend sigue revalidando todos los permisos, identidad, índices y consentimiento.
- El cierre del almacén protegido de cuotas intentaba cerrar el contenedor devuelto
  por la promesa, en lugar de su conexión: podía dejar conexiones abiertas al cerrar
  o recuperar un error. Corregido y cubierto con apertura/cierre/reapertura simulados.

**Límite funcional de entrega:** el motor actual permite exactamente un destinatario,
un intento y una ejecución por campaña. Acepta texto inmediato; rechaza imágenes y
programación. No hay scheduler residente ni automatización masiva habilitada. El
trabajador es una unidad explícita supervisada, no un servicio que Express arranque.
Esto permite preparar una demostración atendida de un correo, pero no afirmar que
la automatización general/programada esté terminada. No se han retirado estos gates
para cumplir una fecha ni ampliado canales fuera de email.

## Paso compartido: destino y aplicación del ensayo

1. Aprobar la recuperación no destructiva de la instancia dedicada existente del
   piloto; verificar PID, ejecutable, puerto, directorio, réplica y miembros. No usar
   `marketing_automation:27017` ni `marketingDevRs:27018` como destino empresarial real.
2. Acordar una base nueva y manifiesto, y autorizar expresamente su creación y la
   migración de índices. `node scripts/migrarIndicesPiloto.js --plan` permite revisar
   el plan sin conectar. No ejecutar `--aplicar` sin esa aprobación.
3. Inyectar secretos de sesión/cifrado y `SESSION_STORE_KEY` por canal privado.
   Arrancar con `scripts/iniciarWebPiloto.js`, sesiones persistentes y HTTPS/proxy
   validado. La URI principal del ensayo debe coincidir con el manifiesto aprobado.
   No sustituir el servidor 3000 existente ni mover datos empresariales sin aprobación.
4. Mantener las banderas de proveedores apagadas en la web de preparación; el
   trabajador Gmail empresarial se habilita por separado, solo durante su ensayo.

## Prueba real 1: registro y correo transaccional

### Intervención humana en Google Cloud

Crear un cliente OAuth de aplicación web independiente del cliente de campañas,
habilitar Gmail API, configurar consentimiento y agregar la cuenta Gmail personal
como usuario de prueba si corresponde. El callback administrativo **exacto** es:

`http://127.0.0.1:3001/oauth/callback`

El permiso de Gmail solicitado es `https://www.googleapis.com/auth/gmail.send`;
`openid` y `email` permiten validar la identidad firmada. No se pide lectura del buzón.
Registrar el callback exactamente; no intercambiar `localhost` y `127.0.0.1`.

Configurar privadamente estas variables, sin pegarlas en documentación, argumentos,
conversaciones ni Git:

- `TRANSACTIONAL_GOOGLE_CLIENT_ID`, `TRANSACTIONAL_GOOGLE_CLIENT_SECRET`.
- `TRANSACTIONAL_GOOGLE_REDIRECT_URI`, `TRANSACTIONAL_GMAIL_SENDER`.
- `TRANSACTIONAL_GMAIL_ENCRYPTION_KEY` distinta de la empresarial.
- `TRANSACTIONAL_GMAIL_CREDENTIALS_FILE`: ruta absoluta fuera del repositorio a un
  archivo nuevo; la autorización no sobrescribe una credencial existente.
- `TRANSACTIONAL_PUBLIC_ORIGIN`: origen HTTPS real de la aplicación, sin ruta/query.
- `TRANSACTIONAL_EMAIL_ENABLED=false` hasta la autorización de **un único envío**.

### Secuencia posterior autorizada

1. Autorizar el intercambio OAuth, sin enviar correo, y ejecutar en un proceso con
   configuración privada `node scripts/autorizarGmailTransaccional.js --autorizar`.
   El propietario selecciona su cuenta en Google; comprobar identidad y almacenamiento
   cifrado sin imprimir tokens. El script no carga `.env` automáticamente.
2. Crear una solicitud nueva en `/registro` con un buzón controlado. Verificar su
   ID en `SolicitudRegistro`, estado pendiente y auditoría; todavía no existe el
   administrador. No mostrar el token ni editar los estados para saltarse el correo.
3. Autorizar un correo, destinatario y ventana. Solo en el trabajador habilitar
   `TRANSACTIONAL_EMAIL_ENABLED=true`, con campañas apagadas, y ejecutar una vez:
   `node scripts/supervisarVerificacion.js --solicitud ID_SOLICITUD --autorizar-envio`.
4. Verificar estado/auditoría persistidos. Si hay incertidumbre, no repetir el despacho.
   Terminar el trabajador habilitado. Confirmar recepción manualmente, incluidos spam,
   remitente y fecha. `enviada` registra aceptación del transporte, no recepción probada.
5. Abrir el enlace recibido, POST de confirmación, configurar administrador e iniciar
   sesión. Comprobar rechazo antes de completar, caducidad y reutilización del enlace.
   Conservar capturas redactadas de recepción y recorrido, sin URLs con tokens.

## Prueba real 2: Gemini y borrador revisado

1. Recuperar/verificar el almacén protegido existente sin recrearlo. Completar su
   configuración y autenticación mínima con autorización separada; no reutilizar una
   fixture de cuotas para IDs empresariales reales. Inyectar `AI_QUOTA_BACKEND=protected`
   y `AI_QUOTA_MONGODB_URI` mediante el procedimiento privado/DPAPI documentado.
2. En AI Studio, el propietario confirma proyecto, clave activa, modelo disponible,
   cuota y nivel gratuito, sin habilitar facturación. El modelo configurado localmente
   es `gemini-3.5-flash-lite`; su estructura válida no demuestra acceso de esta cuenta.
3. Autorizar una única generación con datos ficticios. Solo entonces habilitar
   `AI_ENABLED=true` y `AI_FREE_TIER_CONFIRMED=true` en el proceso adecuado, conservando
   `AI_PROVIDER=gemini`, `AI_MODEL` aprobado y `GEMINI_API_KEY` privada.
4. `/empresa/ia`: generar una propuesta, comprobar respuesta válida y contador de
   cuotas por empresa; revisar/editar y guardar el borrador. No regenerar: sería otra
   solicitud. El guardado no envía ni concede consentimiento. Apagar nuevamente IA.
5. Evidencia: hora/modelo/propuesta redactada, borrador persistido, contador propio
   y ausencia de acceso desde otra empresa. No guardar la clave ni cabeceras HTTP.

## Prueba real 3: campaña Gmail empresarial

1. Revisar el cliente OAuth empresarial y la configuración del callback
   `GOOGLE_OAUTH_REDIRECT_URI`: debe ser el origen HTTPS aprobado seguido exactamente
   de `/empresa/gmail/callback` para el piloto de producción. El callback local actual
   no queda validado para un despliegue HTTPS. No reutilizar el cliente transaccional.
2. Autorizar el OAuth de la empresa y conectar desde `/empresa/gmail`. La identidad
   debe coincidir con `correoAutomatizaciones`; comprobar estado/scope/cifrado sin
   imprimir tokens. La autorización OAuth no autoriza un envío de campaña.
3. Crear un contacto controlado con consentimiento verificable. Usar el borrador de
   Gemini revisado o contenido manual. Guardar preparación inmediata, solo texto,
   exactamente un contacto. Mantener estado borrador y versión de flujo 2.
4. Aprobar la empresa en `GMAIL_CAMPAIGNS_PILOT_COMPANIES` del entorno del ensayo.
   Desde la pantalla de automatización revisar contenido/remitente/destinatario y
   pulsar primero **Autorizar un intento**, después **Encolar ejecución autorizada**.
   La autorización dura diez minutos; no alargarla ni resetearla tras un fallo.
5. Consultar el resultado persistido para obtener `_id` de **EnvioGmail**, no de
   EjecucionGmail. Acordar expresamente un envío, dirección y ventana. Solo en el
   proceso trabajador habilitar `GMAIL_CAMPAIGNS_ENABLED=true` y ejecutar una vez:
   `node scripts/supervisarEnvioGmail.js ID_ENVIO` con el mismo destino aprobado.
6. Consultar estado, intentos, Gmail ID y errores seguros. `aceptado` no acredita
   entrega: el destinatario debe confirmar recepción manualmente. Ante `incierto`,
   timeout o caída, detener y conciliar; no repetir/resetear ni crear otra campaña
   para sortearlo. Cerrar el trabajador habilitado y comprobar banderas apagadas.

## Pruebas y evidencia de esta revisión

- Suite general: 629 aprobadas, 0 fallidas, omitidas o canceladas.
- MongoDB real: autoservicio 21, registro 14, campañas 2, cuotas 8, motor Gmail 34,
  infraestructura 12: **91 aprobadas, 0 fallidas, omitidas o canceladas**.
- Guardia externa al repositorio: inventario inicial, rechazo de escrituras sobre
  bases preexistentes y marcador de propiedad verificado antes de eliminaciones.
  Se crearon/eliminaron 91 fixtures nuevas en 27018; ninguna quedó. Solo se retiraron
  los índices y colección expresamente autorizados dentro de fixtures nuevas.
- Referencia de 27017, datos/índices de bases preexistentes y configuración/opciones
  del replica set de desarrollo iguales antes/después. Los transportes externos
  permanecieron simulados/bloqueados. Esto no verifica Google real ni el almacén
  protegido de cuotas con autenticación real.
- Evidencias de esta ejecución en TEMP: `ma-cierre-tests-nHRWHc/general.log` y
  `ma-cierre-integracion-9ql5tu/{results,postflight}.json`.
- Edge headless: un recorrido aprobado, 143 comprobaciones, 23 capturas y cero
  errores JavaScript/solicitudes externas. Incluye registro/login/logout y piloto:
  autorización, doble envío bloqueado, encolado, idempotencia tras recarga, consulta
  de ID/estado y revocación. Servidor real loopback con dobles de persistencia y
  motor, sin MongoDB ni proveedor externo. Evidencia en TEMP:
  `ma-publico-browser-bNe8ap/report.json` y `piloto-gmail-390.png` (repetición final).
  El primer intento dentro del sandbox falló por timeout del canal CDP antes de
  cargar páginas; la ejecución fuera del sandbox pasó. Se inspeccionó la captura
  móvil del panel funcional; no se modificaron CSS ni la identidad visual aprobada.
- Ambos supervisores ejecutados en `--comprobar`: código 0, sin envíos ni reinicios.

## Referencias oficiales consultadas

- [OAuth de servidor y callback exacto](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Gmail messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).
- [Modelos Gemini](https://ai.google.dev/gemini-api/docs/models).
- [Precios Gemini](https://ai.google.dev/gemini-api/docs/pricing).

La documentación pública no acredita configuración, permisos, gratuidad o cuotas
de este proyecto particular. La aceptación final requiere evidencia externa de
los dos correos recibidos y de una respuesta real de Gemini guardada como borrador.
