> **Antecedente histórico conservado.** Sus pendientes y decisiones pertenecen a una etapa anterior; consulte el [expediente final](../entrega/indice-entrega.md) para el MVP implementado y sus evidencias.

# Antecedente historico del README

Contenido conservado literalmente antes de la revision de alcance email. No es el estado vigente ni una guia actual de ejecucion: contiene etapas, contratos y restricciones superados. Las referencias a conectar otros canales no son compromisos del MVP actual. La modificacion formal de los requisitos originales de PluriOne no esta confirmada. Consultar [alcance vigente](../alcance-mvp-actual.md) y [README actual](../../README.md).

---

# Gestión de campañas

## Conexión Gmail por empresa: etapa 2

El administrador empresarial puede entrar a `/empresa/gmail` desde su panel para conectar, consultar, renovar o desconectar una cuenta real de Google mediante OAuth. Los tokens se guardan cifrados y separados por empresa, con protección CSRF, state de un solo uso, PKCE y verificación de identidad. Si falta configuración, la pantalla lo informa sin simular una conexión. La conexión todavía no realiza envíos ni cambia n8n.

Consulta [gmail-oauth.md](../gmail-oauth.md) para configurar Google Cloud, las variables privadas, las pruebas manuales y los límites de despliegue. Esta etapa conserva las campañas, contactos y controles de aislamiento anteriores.

## Seguridad multiempresa: etapa 1

Las ejecuciones consultan el estado persistido de la empresa y bloquean empresas inactivas, incluso para superadmin. Las relaciones de campaña no se transfieren una vez asignadas; las campañas históricas conservan sus datos. Email excluye contactos con `canales.email === false`; los documentos sin el campo conservan su elegibilidad histórica. Esta habilitación técnica no acredita consentimiento de marketing.

En producción los webhooks requieren HTTPS y un origen autorizado: el origen global administrado si no hay lista, o exclusivamente los orígenes de `N8N_WEBHOOK_ORIGENES_PERMITIDOS` cuando se define. Desarrollo conserva HTTP local. La política, compatibilidad y límites se detallan en [seguridad-multiempresa-etapa1.md](../seguridad-multiempresa-etapa1.md).

## Contactos por empresa

### Destinatarios de campañas

Las campañas nuevas configuran `destinatarios: { tipo: 'todos' | 'contactos' | 'etiquetas', contactos: [ObjectId], etiquetas: [String] }`. Por defecto seleccionan todos los contactos activos de su empresa. El formulario permite elegir contactos concretos o etiquetas existentes; las etiquetas coinciden con cualquiera de las seleccionadas. El superadmin carga las opciones de la empresa seleccionada al crear y utiliza la empresa persistida al editar. Las selecciones ajenas o inexistentes devuelven 422 sin guardar.

`services/destinatariosService.js` resuelve la selección mediante consultas limitadas a la empresa de la campaña, excluye inactivos y elimina duplicados por contacto. Gmail es el único canal operativo y exige una dirección válida. El formulario estima la cantidad y el detalle muestra la selección y el número actual de coincidencias. Al ejecutar se recalcula; si no hay destinatarios válidos, email devuelve 422 y no llama al webhook.

Email mantiene una sola solicitud a n8n y los campos de contenido. Incluye siempre `destinatarios: [{ id, nombre, email, telefono }]`, `totalDestinatarios` y `tipoDestinatarios`. No envía una solicitud por contacto ni modifica el workflow: n8n debe consumir exclusivamente esa lista para realizar los envíos. Las integraciones de los demás canales están deshabilitadas.

Las campañas existentes sin `destinatarios` conservan sus datos, pero su ejecución devuelve 422 sin enviar el webhook. Deben configurarse destinatarios de una empresa válida antes de enviar, también para superadmin. Omitir el campo desde un formulario antiguo no borra una selección configurada ni migra automáticamente campañas anteriores.

Las pruebas de destinatarios cubren esquema, resolución, aislamiento, formularios, estimaciones, errores y compatibilidad. La prueba de webhook utiliza un servidor HTTP local temporal; las consultas MongoDB se simulan como en el resto de la suite.

El módulo `/contactos` permite listar, crear (`/contactos/nuevo` y POST `/contactos`), consultar (`/contactos/:id`), editar (GET/POST `/contactos/:id/editar`) y eliminar (POST `/contactos/:id/eliminar`). Ambos roles empresariales pueden administrar únicamente contactos de su empresa; el superadmin conserva acceso global y selecciona una empresa existente al crear. La empresa y el autor no cambian al editar. Los paneles empresariales y la navegación incluyen Contactos.

El nombre y la empresa son obligatorios y se requiere al menos email o teléfono. El email se normaliza con trim y lowercase; el teléfono con trim. Las etiquetas admiten un arreglo de textos o una lista separada por comas en el formulario. La interfaz permite configurar únicamente email y conserva los campos históricos. Los contactos comienzan activos. Su inclusión en el envío depende de la selección persistida de la campaña y de tener un email válido.

`models/Contacto.js` declara índices únicos compuestos `{ empresa, email }` y `{ empresa, telefono }`, parciales para valores de texto, permitiendo múltiples contactos sin uno de esos campos y los mismos valores en empresas distintas. MongoDB debe crear estos índices para proteger también escrituras concurrentes; si se deshabilita `autoIndex`, hay que crearlos mediante el procedimiento de despliegue. Los duplicados devuelven 422 sin exponer detalles de MongoDB. Las demás respuestas siguen los criterios HTTP del CRUD existente.

`tests/contacto.model.test.js` comprueba el esquema y los índices declarados. `tests/contactos.http.test.js` utiliza Express, EJS, sesiones reales y persistencia simulada para cubrir CRUD, duplicados, normalización, permisos, acceso global y aislamiento entre empresas. Como el resto de la suite, no verifica índices ni persistencia contra MongoDB real.

MVP con Node.js, Express, EJS y MongoDB/Mongoose. Permite listar, crear, consultar, editar y eliminar campañas con confirmación explícita. Funciona sin JavaScript en el navegador.

## Instalación y ejecución

Utiliza Node.js 24 y npm. Instala las dependencias con `npm ci`. Crea un archivo `.env` local a partir de `.env.example` y configura MongoDB antes de iniciar la aplicación. No publiques `.env` ni credenciales.

| Variable | Uso |
| --- | --- |
| `MONGODB_URI` | URI obligatoria de la base de datos MongoDB. |
| `PORT` | Puerto HTTP; por defecto, 3000. |
| `SESSION_SECRET` | Secreto aleatorio obligatorio para firmar la cookie de sesión. Sin valor predeterminado. |

Ejecuta `npm run dev` para desarrollo con nodemon o `npm start` para iniciar con Node. El servidor comienza a escuchar después de conectar a MongoDB. En PowerShell puedes usar `npm.cmd` si la política de ejecución bloquea `npm.ps1`.

## Arquitectura

- `app.js`: configura y exporta Express, las vistas, archivos estáticos, rutas y errores. Importarlo no carga `.env`, conecta MongoDB ni inicia el servidor.
- `server.js`: carga dotenv, conecta MongoDB mediante `config/database.js` e inicia HTTP.
- `models/Campana.js`: esquema y validaciones de campañas.
- `routes/campanaRoutes.js` y `controllers/campanaController.js`: rutas y lógica del CRUD.
- `views/campanas/`: listado, detalle, confirmación y formularios EJS; creación y edición comparten `_formulario.ejs`.
- `public/css/styles.css`: estilos de la interfaz.

## Pruebas automatizadas

Ejecuta `npm test` (o `npm.cmd test` en PowerShell). Para repetir las pruebas al cambiar archivos, utiliza `npm run test:watch`. Para ejecutar solo las pruebas HTTP: `node --test tests/campanas.http.test.js`.

La suite utiliza `node:test`, `node:assert/strict` y Supertest como dependencia de desarrollo:

- `tests/campana.model.test.js`: validación real de documentos en memoria: obligatorios, trim, enums, estado inicial y fechas.
- `tests/campanas.http.test.js`: Express y EJS reales con consultas y escrituras simuladas; comprueba el CRUD, confirmación, identificadores, errores, escape HTML, campos permitidos y fechas UTC.

No hace falta ejecutar MongoDB ni configurar `.env` para las pruebas. Estas no importan `server.js`, no leen `.env` y no abren conexiones a MongoDB. Supertest usa un servidor HTTP temporal local, sin iniciar el servidor de desarrollo ni ocupar su puerto. Los mocks se restauran después de cada prueba; los casos que comparten métodos no se ejecutan concurrentemente. No se insertan, actualizan ni eliminan datos reales.

La suite no verifica persistencia real, actualización de timestamps en MongoDB ni apariencia visual en un navegador. La comprobación manual del arranque con MongoDB se realiza por separado mediante `npm run dev`.

## Alcance del CRUD

| Método | Ruta | Acción |
| --- | --- | --- |
| GET | `/campanas` | Listado |
| GET / POST | `/campanas/nueva` / `/campanas` | Formulario y creación |
| GET | `/campanas/:id` | Detalle |
| GET / POST | `/campanas/:id/editar` | Formulario y actualización |
| GET / POST | `/campanas/:id/eliminar` | Confirmación y eliminación |

Solo se aceptan nombre, objetivo, canal, estado y fechas de inicio/fin. Nombre y objetivo son obligatorios; canal y fechas son opcionales. El estado inicial es borrador y al editar se exige un estado válido. Las fechas se guardan y presentan en UTC; la fecha final no puede ser anterior a la inicial.

Las escrituras exitosas redirigen con 303. Se usan 400 para identificadores inválidos, 404 para campañas inexistentes o ajenas, 403 para acciones no permitidas sobre recursos propios, 422 para validaciones, 503 para indisponibilidad de MongoDB o configuración de automatización y 500 para fallos inesperados. La eliminación requiere confirmación por POST; GET nunca borra. Todas las rutas de campañas y el panel requieren autenticación; las rutas `/admin` requieren superadmin.

## Administración de superadmin

`GET /panel` muestra el dashboard global cuando el rol cargado desde MongoDB es `superadmin`. Los otros roles acceden a paneles limitados a su empresa. El dashboard global incluye totales, empresas con conteos, usuarios agrupados por empresa y secciones separadas de usuarios y campañas sin empresa. Los superadministradores sin empresa se identifican explícitamente; los usuarios que referencian una empresa eliminada aparecen en una sección adicional.

| Método | Ruta | Acción |
| --- | --- | --- |
| GET | `/admin/empresas/nueva` | Formulario de empresa |
| POST | `/admin/empresas` | Crear empresa |
| GET | `/admin/empresas/:id` | Información, usuarios y campañas de una empresa |
| GET | `/admin/usuarios/nuevo` | Formulario de usuario |
| POST | `/admin/usuarios` | Crear admin_empresa u operador |

Todas las rutas `/admin` usan `requerirAutenticacion` y `requiereRol('superadmin')`. Sin sesión redirigen a `/login`; con sesión de otro rol responden **403**, sin ejecutar consultas o escrituras administrativas. Los permisos se deciden mediante `res.locals.usuarioActual`, nunca desde el formulario. Un identificador de empresa inválido devuelve 400; uno válido pero inexistente devuelve 404. Las validaciones de formularios y emails duplicados devuelven 422. La creación exitosa redirige con 303 al detalle de empresa.

Los totales usan `countDocuments()` y los conteos por empresa agregaciones `$group`; no se realiza una consulta por cada empresa. Las empresas sin recursos muestran cero. Se consultan campos explícitos de los usuarios y se excluye password. El detalle carga el nombre del autor con `populate`; si falta o el usuario ya no existe, muestra “Sin autor disponible”.

Las campañas con `empresa` ausente o `null` aparecen en “Campañas sin empresa” y siguen incluidas en el total global. Estas consultas no modifican documentos ni asignan empresas o autores. Solo superadmin puede acceder a esas campañas históricas. “Ver campañas” abre el CRUD con el filtro correspondiente al usuario autenticado.

Los formularios construyen objetos mediante listas blancas. Para crear usuarios solo se aceptan `admin_empresa` y `operador`, con una empresa válida y existente (activa o inactiva). El formulario no crea superadmin. `Usuario.create()` conserva el hash existente; la contraseña no se repuebla al mostrar errores ni se incluye en logs o respuestas. El alta de empresa conserva la fecha automática del modelo.

`tests/admin.http.test.js` comprueba acceso, vistas, formularios, errores, listas blancas y hash real con escrituras simuladas. `tests/admin.service.test.js` comprueba las consultas, agrupaciones, ceros y `populate` con autores inexistentes. No requieren ni modifican MongoDB real. La interfaz usa CSS propio y tablas con desplazamiento horizontal en pantallas pequeñas.

## Aislamiento multiempresa y automatizaciones

Las nueve rutas de campañas (listado, formulario de creación, creación, detalle, formulario y POST de edición, confirmación y POST de eliminación, POST de ejecución) ahora requieren sesión. Sin sesión redirigen a `/login`. Para admin_empresa y operador las consultas incluyen siempre su empresa, obtenida de `res.locals.usuarioActual` y cargada desde MongoDB. Usuarios sin empresa válida no reciben acceso global. Superadmin conserva acceso global.

Una campaña ajena o inexistente devuelve **404**, incluso al intentar eliminarla como operador. Una acción prohibida sobre una campaña propia devuelve **403**. El operador crea, consulta, edita y ejecuta campañas de su empresa, pero no elimina ni administra usuarios, empresas o automatizaciones. El admin_empresa también puede eliminar campañas propias. Se reutiliza `services/permisos.js`; el filtro de empresa acompaña la lectura, el guardado y la eliminación. La edición normal no permite cambiar empresa ni autor.

Al crear, el servidor fija `creadoPor` al usuario autenticado. Para usuarios empresariales también fija `empresa`, ignorando ambos campos enviados por el navegador. Superadmin selecciona empresa en el formulario y el servidor comprueba que exista. El modelo Campana conserva referencias opcionales para documentos históricos, pero el flujo de creación siempre asigna ambas. No hay migración ni asignación automática de campañas antiguas.

El panel de admin_empresa incluye su empresa, usuarios, operadores, campañas y conteos propios. El de operador incluye solo su empresa y campañas con acciones permitidas. La propiedad de una campaña corresponde a la empresa, no exclusivamente a su autor.

| Método | Ruta nueva | Acceso |
| --- | --- | --- |
| GET | `/empresa/usuarios/nuevo` | admin_empresa: formulario de operador |
| POST | `/empresa/usuarios` | admin_empresa: crear operador de su empresa |
| GET | `/admin/empresas/:id/automatizaciones` | superadmin: editor de configuración |
| POST | `/admin/empresas/:id/automatizaciones` | superadmin: guardar configuración |

El alta empresarial de usuarios fija `rol = operador` y la empresa del usuario autenticado, aunque el cliente envíe otros valores. Usa `Usuario.create()` para conservar el hash y no devuelve password en errores.

La configuración reside en subdocumentos de Empresa: `automatizaciones.email`, `.whatsapp` y `.facebook`, cada uno con `habilitada` y `webhookUrl`. Email está habilitado por defecto; WhatsApp y Facebook, deshabilitados. Las URLs se excluyen de consultas habituales mediante `select: false`; solo el editor de superadmin y el servicio de ejecución las solicitan explícitamente. El detalle normal muestra estados, no URLs. No se agregan secretos al payload de n8n ni a los logs.

Resolución del webhook de email, usando la campaña persistida:

1. Solo superadmin puede resolver la URL global de una campaña sin empresa, pero su ejecución está bloqueada por no poder autorizar destinatarios empresariales.
2. Una campaña con empresa cuya referencia ya no existe produce error de configuración sin fallback.
3. `habilitada === false` bloquea la ejecución, incluso si hay URL global.
4. Si está habilitada y tiene URL empresarial, usa esa URL. Si es inválida, falla sin fallback.
5. Si está habilitada y su URL está vacía, usa `N8N_WEBHOOK_URL` temporalmente.
6. Si tampoco hay URL global válida, devuelve error de configuración.

Las empresas antiguas sin configuración conservan el comportamiento de email habilitado con fallback global. Las URLs admiten HTTP/HTTPS sin credenciales embebidas. El timeout, payload de email, ausencia de reintentos y bloqueo de redirecciones conservan el comportamiento anterior de Gmail/n8n. No se retira ninguna variable global.

WhatsApp y Facebook tienen configuración preparada pero **no se ejecutan**. `redes_sociales` mantiene el bloqueo de Facebook/LinkedIn hasta conectar integraciones reales; no se redirige al webhook de email. El estado `inactiva` de una empresa no incorpora una política adicional de suspensión en esta fase; el control de ejecución es `habilitada` por canal. Los listados todavía no tienen paginación.

Las pruebas de aislamiento usan consultas y documentos Mongoose reales con persistencia simulada, y las de email conservan las peticiones HTTP a servidores locales de prueba. No se envían campañas reales ni se modifican datos existentes al ejecutar la suite.

## Autenticación y superadmin inicial

La página `/` y `GET /login` son públicas. El login usa bcryptjs y sesiones del servidor. Los tres roles se redirigen a `/panel`, que muestra los datos actuales del usuario y, si corresponde, el nombre de su empresa. Un usuario autenticado que visita `/login` vuelve a `/panel`. `POST /logout` destruye la sesión y elimina la cookie; no existe `GET /logout`.

Configura tu archivo `.env` local, conservando las variables de MongoDB y automatizaciones. Si aún no existe, copia `.env.example` a `.env`. No sobrescribas un `.env` existente.

```dotenv
SESSION_SECRET=
SUPERADMIN_NOMBRE=
SUPERADMIN_EMAIL=
SUPERADMIN_PASSWORD=
```

Los valores anteriores son intencionalmente vacíos. Debes completar:

- `SESSION_SECRET`: un secreto aleatorio propio. Puedes generar uno localmente con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y copiarlo a `.env`. No lo publiques ni reutilices como contraseña.
- `SUPERADMIN_NOMBRE`: el nombre que quieras mostrar.
- `SUPERADMIN_EMAIL`: el correo con el que iniciarás sesión.
- `SUPERADMIN_PASSWORD`: una contraseña propia y robusta; máximo 72 bytes UTF-8 por el límite de bcrypt. No se recortan espacios de la contraseña. Usa comillas en `.env` si contiene `#` o espacios significativos.
- `MONGODB_URI`: la conexión a tu MongoDB. `PORT` es opcional, con valor predeterminado 3000.

Con MongoDB disponible, ejecuta desde la raíz del proyecto:

```powershell
npm.cmd run crear-superadmin
npm.cmd start
```

Para reinicio automático durante desarrollo usa `npm.cmd run dev` en lugar de `npm.cmd start`. Abre `http://localhost:3000/login` (o el puerto configurado) y utiliza exactamente el correo y contraseña que configuraste. El script crea `superadmin` sin empresa, normaliza el email, espera el índice único, no sobrescribe cuentas existentes y cierra la conexión tanto en éxito como en error. No imprime la contraseña. Después de crear el usuario puedes quitar las tres variables `SUPERADMIN_*` del entorno; el login consulta MongoDB. `.env` está excluido de Git.

### Sesiones: solo desarrollo

**MemoryStore no debe usarse en producción.** Las sesiones viven en memoria del proceso, se pierden al reiniciar y no se comparten entre instancias. Esta fase bloquea el arranque con `NODE_ENV=production`; antes de desplegar hay que integrar un almacén persistente y configurar HTTPS y cookies `secure: true` según la infraestructura. No cambies `NODE_ENV` para eludir ese bloqueo.

En desarrollo la cookie `marketing.sid` usa `httpOnly: true`, `sameSite: 'lax'`, `secure: false` y una duración de ocho horas. La sesión guarda solo `usuarioId` como dato de aplicación, además de los metadatos de cookie internos de express-session. Se regenera al iniciar sesión. El middleware carga los datos desde MongoDB en cada solicitud autenticada y los expone en `res.locals.usuarioActual`, sin password. Si la cuenta fue eliminada, destruye la sesión; `/panel` redirige a `/login`.

### Contraseñas y pruebas

`Usuario.create()` y `documento.save()` calculan el hash al crear o cambiar la contraseña. Guardar otros campos conserva el hash existente. Las escrituras masivas, reemplazos y actualizaciones directas de password están bloqueadas para evitar omitir este proceso; no uses acceso directo a la colección para guardar usuarios. `password` tiene `select: false` y se elimina de `toJSON()` y `toObject()`. El login lo solicita explícitamente con `.select('+password')`; `compararPassword()` también puede recuperarlo explícitamente en documentos persistidos que no lo incluyan. Las contraseñas heredadas en texto plano no permiten iniciar sesión y no se migran automáticamente.

Ejecuta `npm.cmd test`. Las pruebas de autenticación usan bcrypt y sesiones reales en memoria, Supertest y persistencia simulada. Comprueban login, regeneración, cierre, usuario eliminado, cookies, datos mínimos de sesión, hash, comparación y creación segura del superadmin sin tocar MongoDB real. Las pruebas HTTP usan secretos exclusivos de prueba; no necesitan tu `.env`. Al importar `app.js` fuera de las pruebas, `SESSION_SECRET` ya debe estar disponible en el entorno.
