# Gestión de campañas

MVP con Node.js, Express, EJS y MongoDB/Mongoose. Permite listar, crear, consultar, editar y eliminar campañas con confirmación explícita. Funciona sin JavaScript en el navegador.

## Instalación y ejecución

Utiliza Node.js 24 y npm. Instala las dependencias con `npm ci`. Crea un archivo `.env` local a partir de `.env.example` y configura MongoDB antes de iniciar la aplicación. No publiques `.env` ni credenciales.

| Variable | Uso |
| --- | --- |
| `MONGODB_URI` | URI obligatoria de la base de datos MongoDB. |
| `PORT` | Puerto HTTP; por defecto, 3000. |

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

Las escrituras exitosas redirigen con 303. Se usan 400 para identificadores inválidos, 404 para campañas inexistentes, 422 para validaciones, 503 para indisponibilidad de MongoDB y 500 para fallos inesperados. La eliminación requiere confirmación por POST; GET nunca borra. No incluye autenticación, envíos, IA ni automatizaciones.
