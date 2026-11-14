# Validación de Lead Scoring — 2026-11-13

Rama de trabajo: `feat/lead-scoring-base`. Trabajo sin commit/push/merge.

## Resultados ejecutados

| Validación | Resultado real |
| --- | --- |
| `node --test tests/leadScoring.service.test.js tests/leadScoring.http.test.js` | 23 aprobadas, 0 fallidas, 0 omitidas. |
| Pruebas dirigidas de contactos, scoring, interfaz Gmail, vistas internas y sesiones (antes de la última prueba adicional de reproducibilidad) | 93 aprobadas, 0 fallidas. |
| `node pruebas-integracion/leadScoringMongo.js 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'` | `MONGO_REAL_OK`. MongoDB real temporal, índices preparados dos veces, cuatro solicitudes concurrentes generan un único evento; consultas de puntuación, filtros, paginación, historial y aislamiento comprobadas. |
| `npm.cmd test` (script npm: `node --test`) | 1045 pruebas descubiertas: **1042 aprobadas, 0 fallidas, 3 omitidas, 0 canceladas, 0 pendientes**; duración 46066.7928 ms; salida de proceso 0. |
| `git diff --check` | Salida 0, sin errores de espacios. Git avisa únicamente de la normalización LF/CRLF configurada en el repositorio. |
| Rama activa final | `feat/lead-scoring-base`. |
| Referencia main antes y después | `86a369d5c6e0e792cec5c8cb3249be499f3a2fc9`, sin cambios. |

La primera suite completa encontró fallos de fixtures al cambiar la consulta del listado y los datos del detalle. Se actualizaron los dobles de agregación y las fixtures EJS; los fallos quedaron corregidos. La prueba antigua del lanzador se corrigió sin alterar el arranque local. No se excluyeron archivos del descubrimiento de pruebas.

`npm test` mediante npm.ps1 fue bloqueado por la política de PowerShell antes de ejecutar las pruebas. Se utilizó `npm.cmd test` sin modificar políticas. El log completo de la última ejecución permanece en `%TEMP%\plurione-lead-scoring-tests.log`.

Las tres omisiones ya pertenecían a pruebas existentes y se conservan con sus razones originales:

- “enlace final no sobrescribe el archivo original”: crear symlink de archivo requiere privilegios; la prueba de junction se ejecuta por separado.
- “PowerShell/Node: colector simulado toma PID del servicio y conserva controles, sin Mongo real”: política vigente, sin Bypass.
- “PowerShell: clasifica TCP con dobles sin sockets reales”: política vigente, sin Bypass.

No se enviaron correos, no se llamó a Gemini, no se modificaron datos productivos ni instancias MongoDB existentes. La comprobación de integración identificó y utilizó exclusivamente su mongod temporal, que quedó detenido y cuyo directorio temporal fue eliminado. La creación de índices sobre la instancia local existente no se ejecutó; se entrega el comando seguro documentado.

## Inventario completo de archivos intervenidos

Archivos preexistentes sin seguimiento, ampliados y reutilizados:

- `models/EventoMarketing.js`: evidencia, verificación y actor obligatorio, conservando índices y estructura original.
- `services/leadScoringService.js`: motor, registro, historial, validación, deduplicación y consultas paginadas.
- `tests/leadScoring.service.test.js`: reglas, aislamiento, validación, modelo, historial y reproducibilidad.

Archivos creados:

- `services/configLeadScoring.js`: configuración de pesos, umbrales, ventana y versión.
- `tests/leadScoring.http.test.js`: recorridos HTTP, seguridad, interfaz y errores.
- `scripts/prepararIndicesLeadScoring.js`: preparación aditiva de índices en desarrollo local verificado.
- `pruebas-integracion/leadScoringMongo.js`: comprobación explícita sobre MongoDB temporal real.
- `docs/lead-scoring.md`: arquitectura, contratos, operación, pruebas y pendientes.
- `docs/evidencias/lead-scoring-validacion-2026-11-13.md`: este informe.

Archivos versionados modificados:

- `controllers/contactoController.js`: listado, detalle y registro integrado; error 409 controlado y avisos.
- `routes/contactoRoutes.js`: nuevo POST protegido por los controles existentes.
- `views/contactos/index.ejs`: puntuación, prioridades, segmentación y paginación responsiva.
- `views/contactos/detalle.ejs`: análisis, historial y formulario administrativo con evidencia.
- `public/css/interno.css`: insignias de prioridad y medidor accesible.
- `tests/contactos.http.test.js`: dobles del nuevo acceso a datos sin perder pruebas de regresión.
- `tests/contactos.aislamiento.test.js`: comprobación del filtro BSON empresarial en agregación.
- `tests/gmail.interfaz.test.js`: fixtures de contacto y eventos para conservar las regresiones de canales.
- `tests/ia.devPiloto.test.js`: expectativa actualizada del comando dev real.
- `tests/soporte/internoFixtures.cjs`: datos de renderizado para el nuevo contrato de vistas.
- `tests/soporte/sesionesFixture.cjs`: doble de agregación para navegación y sesiones.
- `README.md`: enlace al módulo y su documentación; preserva referencias históricas.

Total: **21 archivos intervenidos**, de los cuales 3 eran archivos previos sin seguimiento y 6 son nuevos. No se eliminó ningún archivo.

Se mantuvo intacto `criptscomprobarSmtpTransaccional.js` (sin seguimiento desde la auditoría inicial). SHA-256 final: `2FB3D002167675D78798E69D0373CAC9BA71A1E8A41D13A1A5A68E4F19F4BB18`. No se editaron Gmail/OAuth, cuotas Gemini, n8n, políticas de envío, package.json, Contacto ni Campana.

## Alcance verificable y pendientes

El flujo web funciona con los registros persistidos: listado y detalle, registro manual con evidencia certificada por administrador, puntuación, desglose, historial y filtros. Los operadores no registran eventos. La puntuación no sustituye consentimiento.

No están implementados conectores automáticos de clics, formularios o conversiones, seguimiento de aperturas, modelos predictivos ni audiencias de campañas por scoring. El historial completo de un contacto aún no se pagina; el listado sí. No se realizó inspección visual interactiva sobre datos existentes. La preparación de índices en la instancia de desarrollo existente es un paso operativo documentado; la idempotencia administrativa funciona con el índice único nativo de `_id`.

[Arquitectura y procedimiento de prueba desde navegador](../lead-scoring.md).
