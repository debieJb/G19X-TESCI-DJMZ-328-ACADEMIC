# Lead Scoring y comportamiento de prospectos

Implementación local en `feat/lead-scoring-base`, 13 de noviembre de 2026. Sin commit, push ni integración en main.

## Auditoría y decisiones

Antes de editar se comprobó la rama y el estado del repositorio. Existían únicamente cuatro archivos sin seguimiento: `criptscomprobarSmtpTransaccional.js`, `models/EventoMarketing.js`, `services/leadScoringService.js` y `tests/leadScoring.service.test.js`. El archivo SMTP no se modificó. Se reutilizaron y ampliaron los otros tres; no se eliminaron archivos.

Se revisaron Contacto, Campana, controladores y rutas de contactos, servicios de acceso y permisos, consentimiento, middleware de sesión y CSRF, vistas y patrones de pruebas. Contacto no necesita campos nuevos: la puntuación se deriva de eventos persistidos y es compatible con documentos anteriores. Campana y los procesos de envío permanecen sin cambios.

La prueba `tests/ia.devPiloto.test.js` esperaba `nodemon server.js`, mientras `package.json` declara `node scripts/iniciarDevLocal.js`. Se corrigió esa expectativa; el lanzador sigue verificando la instancia local y ejecutando nodemon como proceso hijo. No se modificó el lanzador ni package.json.

No existía una carpeta `lead-scoring-base/tests` en el árbol auditado y ese fallo de descubrimiento duplicado no se reprodujo. No se borraron pruebas ni se estrechó el descubrimiento de `node --test` para ocultarlo.

## Reglas iniciales configurables

`services/configLeadScoring.js` centraliza pesos, ventana, umbrales y versión. Cambiarlos requiere mantenimiento del código y revisión de las pruebas. El navegador nunca configura puntos. No existe un modelo predictivo entrenado.

| Evento | Puntos |
| --- | ---: |
| Clic verificado | 5 |
| Formulario enviado | 15 |
| Solicitud de contacto | 25 |
| Conversión confirmada | 40 |

Prioridades: baja de 0 a 29, media de 30 a 69 y alta de 70 a 100. La suma se limita a 100. Se conserva la ventana de **90 días** del motor preexistente, inclusiva en ambos extremos respecto al instante de consulta. Los eventos anteriores siguen en el historial, pero no suman. Sin eventos válidos: 0 y prioridad baja. Gmail aceptado, aperturas inferidas y tipos desconocidos no otorgan puntos.

Solo cuentan eventos con tipo y origen admitidos, `verificado: true`, evidencia de 8–500 caracteres, referencia no vacía, actor válido y fecha no futura dentro de la ventana. Los eventos previos sin evidencia o marca de verificación no se promueven automáticamente. El cálculo puro ordena los eventos y elimina referencias duplicadas; las lecturas de base siempre limitan empresa y contacto.

## Arquitectura y consistencia

- `EventoMarketing`: empresa y contacto inmutables; tipo, origen, referencia, fecha real, evidencia, verificación, actor y timestamps. No hay rutas para modificar o borrar eventos.
- `leadScoringService`: valida entradas, registra eventos, calcula puntuación, desglose e historial y construye la consulta del listado.
- El controlador reutiliza `buscarContacto`, que valida ObjectId, aplica aislamiento y comprueba permiso de consulta. La autorización adicional del registro permite únicamente `admin_empresa` y `superadmin`. El operador consulta y segmenta, pero no certifica eventos.
- El listado usa **una agregación MongoDB** con `$lookup` acotado por empresa/contacto, validación de eventos, deduplicación, suma, filtros y paginación de 30 resultados. Solicita 31 para determinar si existe la siguiente página. No realiza consultas N+1 ni carga todos los contactos en Node.
- El detalle consulta el contacto y su historial por empresa; muestra puntos, prioridad, desglose previo al límite, última interacción verificada e historial descendente por fecha e identificador. Incluye registro manual con CSRF y confirmación de evidencia.
- No se guarda un contador de puntos en Contacto. Se recalcula tras la escritura y en cada lectura: no hay incrementos perdidos por concurrencia ni puntuación obsoleta al vencer la ventana. No se necesita un cron para envejecer eventos. Una consulta concurrente puede preceder a otro registro todavía no confirmado; la siguiente lectura refleja los registros confirmados.
- La referencia es única por **empresa y origen**, incluso entre contactos de esa empresa. El `_id` administrativo es determinista (primeros 24 hexadecimales SHA-256 de empresa, origen y referencia); el índice único nativo de `_id` protege reintentos incluso antes de preparar los índices adicionales. La referencia debe identificar una interacción real, no cada intento HTTP. Una repetición idéntica devuelve el detalle sin volver a sumar; cambios de contenido bajo la misma referencia devuelven 409.
- No se borra historial de comportamiento al eliminar un contacto mediante el flujo ya existente. Ese historial queda para auditoría y no se reasigna a otros contactos. La eliminación preexistente del contacto y de su consentimiento conserva su comportamiento.

La puntuación es información para segmentación. No se amplió la selección de destinatarios de campañas. Se conservan las validaciones de consentimiento vigente, canal autorizado y contacto activo del servidor. Una prioridad alta nunca habilita un envío por sí misma.

## Seguridad y endpoints

Todos los endpoints utilizan la autenticación y el acceso empresarial existentes. El middleware CSRF de contactos protege roles empresariales y el middleware CSRF superadmin protege a ese rol. Las vistas usan salida escapada EJS para nombres, etiquetas, evidencia y referencias; no convierten evidencia en enlaces ejecutables.

| Método y ruta | Comportamiento |
| --- | --- |
| `GET /contactos` | Ruta existente ampliada: puntuación y filtros `prioridad=alto|medio|bajo`, `min`, `max`, `etiqueta` exacta, `activo=true|false`, `pagina` desde 1. |
| `GET /contactos/:id` | Ruta existente ampliada: análisis, historial y formulario según rol. |
| `POST /contactos/:id/eventos` | **Endpoint nuevo**: registro administrativo autenticado, autorizado y protegido por CSRF. Redirección 303 al detalle. |

El POST solo admite `tipo`, `referenciaExterna`, `ocurridoEn`, `evidencia`, `confirmar` y `_csrf`. La confirmación debe ser el texto `true`; la fecha debe ser ISO con segundos y zona (`2026-11-13T10:00:00-06:00`), real y no futura. Se rechazan campos extra, puntos, empresa, actor, origen y marcas de verificación enviados por el cliente. Empresa, actor y origen `registro_administrativo` los fija el servidor. El administrador certifica manualmente haber comprobado la evidencia: no se afirma una verificación automática de documentos ni de ventas.

Errores: 400 validación; 403 permisos/CSRF; 404 contacto inexistente o ajeno; 409 referencia conflictiva; 503 indisponibilidad de MongoDB. Los fallos internos no exponen detalles ni secretos. Si un fallo de lectura sucede después de insertar, el evento puede estar persistido: repetir con la misma referencia y contenido es seguro.

## Preparar los índices locales

El módulo funciona con el índice `_id` nativo. Para evitar escaneos de actividad al crecer el volumen, preparar los índices declarados:

- Único `{ empresa: 1, origen: 1, referenciaExterna: 1 }`.
- Consulta `{ empresa: 1, contacto: 1, ocurridoEn: -1 }`.

Con el entorno de desarrollo existente correctamente configurado y la réplica local iniciada:

```powershell
node scripts/prepararIndicesLeadScoring.js
```

El comando reutiliza las comprobaciones de `iniciarDevLocal`: exige localhost, puerto 27018, `marketingDevRs` y configuración de desarrollo. No inicia ni reconfigura MongoDB, no usa `syncIndexes`, no elimina índices, no reescribe registros y no llama Gmail, SMTP ni Gemini. Si encuentra duplicados incompatibles, falla para que se revisen; no los borra. No se ejecutó contra bases existentes durante esta entrega. La preparación se comprobó dos veces sobre la base temporal de integración para verificar que es repetible.

## Pruebas y evidencia

Pruebas específicas con `node:test` y Supertest; sesión, permisos, middleware, controladores, Mongoose y EJS reales con persistencia sustituida de forma explícita. Cubren reglas individuales, límite 100, duplicados/concurrencia, datos inválidos/manipulados, fechas, ausencia de historial, recálculo, orden, aislamiento y rechazo de ajenos, roles, CSRF empresarial y superadmin, vistas y formularios, filtros, paginación y errores de base de datos. Se actualizaron los fixtures de las suites previas para las consultas y datos nuevos.

```powershell
node --test tests/leadScoring.service.test.js tests/leadScoring.http.test.js
npm.cmd test
```

En esta máquina `npm test` resuelve a `npm.ps1`, bloqueado por la política vigente de PowerShell. `npm.cmd test` ejecuta exactamente el script npm `node --test` sin alterar esa política.

También se ejecutó una comprobación con **MongoDB 8.2 real**, no solo mocks:

```powershell
node pruebas-integracion/leadScoringMongo.js 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
```

Este programa inicia su propio mongod oculto en un puerto efímero distinto de 27017/27018, verifica PID, puerto y directorio antes de escribir, usa un directorio temporal y nunca carga `.env`. Comprueba índices repetibles, cuatro registros concurrentes con una sola inserción, recálculo, límite, filtros reales mediante agregación, contacto sin historial, orden, aislamiento y exclusión de eventos antiguos, no verificados, ajenos, sin evidencia y con tipos BSON manipulados. Al finalizar cierra su conexión, detiene exclusivamente su proceso y elimina su directorio temporal verificado. No toca bases existentes ni proveedores externos. Resultado: `MONGO_REAL_OK`.

Durante esta comprobación se detectó y corrigió un error de agregación ante evidencia ausente: MongoDB puede reorganizar los filtros y evaluar expresiones antes de excluir el documento. Las expresiones de longitud ahora protegen su entrada con comprobaciones de tipo.

Los resultados finales y las omisiones preexistentes por restricciones de Windows se registran en [validación de la entrega](evidencias/lead-scoring-validacion-2026-11-13.md).

## Probar desde el navegador

1. Iniciar la instancia local y la plataforma con el procedimiento existente (`npm.cmd run dev`). No se necesitan envíos reales para usar scoring. Los requisitos generales del lanzador existente permanecen vigentes.
2. Entrar como administrador empresarial y abrir `/contactos`. Contactos sin eventos verificados muestran 0, prioridad baja.
3. Abrir el detalle de un contacto propio. En “Registrar interacción con evidencia”, elegir el tipo, fecha real ISO con zona, referencia única y evidencia comprobable. Confirmar y registrar.
4. Comprobar aviso, historial, actor, fecha, desglose y nueva puntuación. Una solicitud de contacto válida suma 25; una conversión confirmada adicional suma 40: total 65, prioridad media, siempre que ambas estén dentro de 90 días.
5. Volver al listado y filtrar prioridad, rango, etiqueta o estado. Ejemplo: `/contactos?prioridad=alto&min=70&activo=true`.
6. Un operador puede consultar y filtrar; no tiene formulario de registro ni permiso para usar el endpoint. Superadmin puede registrar para la empresa del contacto seleccionado, aunque no tenga empresa en su sesión.

Usar evidencia real para el uso ordinario. Los datos sintéticos están limitados a las pruebas y no se precargan en la plataforma.

## Pendientes y límites explícitos

No se implementaron webhooks públicos, píxeles de apertura, seguimiento de enlaces, integraciones automáticas con formularios/sitios, verificación automática de compras, recomendaciones predictivas ni selección de audiencias de campaña por puntuación. Esas integraciones requieren fuentes autenticadas y comprobación de evidencia antes de reutilizar el motor. No se simula su existencia.

La preparación de índices en la instancia existente queda como paso de operación local; no se migraron datos ni se ejecutaron registros de prueba en bases existentes. El historial del detalle se carga completo para un contacto; para contactos con volúmenes excepcionales de eventos será necesario paginarlo. La paginación del listado y la eliminación de N+1 sí están implementadas. No se realizó una sesión visual interactiva sobre la base existente; las páginas y formularios se verificaron mediante renderizado EJS y recorridos HTTP automatizados.
