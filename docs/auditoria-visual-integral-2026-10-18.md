# Auditoría integral de interfaz y roles — PluriOne

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


## Referencia conservada

Se conserva la identidad clara disponible en el respaldo `1df937e` y en la renovación pública `5cca19d`: fondo `#f7f9fc`, tarjetas blancas, texto `#142744`, azul `#142c54`, violeta `#6240b6` / `#6740b6`, tipografía del sistema, bordes suaves y degradados azul-violeta. No se incorporaron fuentes, imágenes, librerías ni servicios de terceros.

El historial disponible fecha la renovación pública el 18 de octubre a las 00:14, aunque la referencia indicada por el usuario es el 17. No hay una captura oficial del 17 adjunta al repositorio para comparar píxeles. Se reutilizan los activos respaldados y documentados en `docs/frontend-publico.md`; no se propone otra identidad visual.

## Cobertura de páginas y componentes

Se inventariaron las 29 páginas EJS completas y todos los parciales. La prueba de inventario falla si aparece una página sin fixture. Se revisaron los tres CSS y los cinco JavaScript públicos.

| Grupo | Páginas / estados revisados |
| --- | --- |
| Públicas | `index`, `login` normal y con error; `registro` en solicitud, aceptada, pendiente, reenvío, confirmación de verificación, configuración del administrador, completada, inválida, caducada, usada y configuración caducada; error anónimo. |
| Superadmin | Dashboard, detalle/alta/edición de empresa, alta de usuario y edición de automatizaciones. |
| Empresa | Panel administrador, panel operador, alta/edición/detalle de usuario, Gmail, asistente IA y revisión de resultado IA. |
| Campañas | Listado, creación, edición, detalle, eliminación y preparación de automatización/piloto/resultados. |
| Contactos | Listado, creación, edición y detalle con consentimiento. |
| Comunes | Panel compatible, errores autenticados, cabeceras, navegación, pie, tokens CSRF, formularios, destinatarios, mensajes y componentes de contraseña. |

Las 26 vistas internas y los 15 casos públicos cubren 41 combinaciones de página/estado. Los estados públicos reutilizan `registro.ejs`; no son pantallas nuevas ni atajos de autorización. Los fixtures solo están disponibles en el servidor de pruebas, nunca en las rutas de producción.

## Correcciones visuales

- Se sustituyó la paleta oscura residual en `styles.css` por los tokens claros existentes. `publico.css` consume los tokens compartidos; se eliminó únicamente su declaración duplicada. Se conservaron las reglas estructurales que utilizan las vistas y los componentes.
- Se mantuvieron la landing, el login dividido, el onboarding de tres pasos y sus textos de disponibilidad/seguridad. Todas las vistas cargan el sistema claro mediante los heads compartidos.
- Se corrigieron el contexto visual del error público y el panel compatible, evitando que dependan de estilos de otro tipo de página.
- Se centralizaron los campos de usuario y la presentación de errores del servidor en parciales EJS; se conserva CSRF y nunca se rellenan contraseñas.
- Las tablas administrativas tienen regiones etiquetadas y enfocables; los encabezados de campañas tienen `scope`. La tabla de usuarios conserva columnas legibles y desplazamiento contenido en tablet/móvil, con indicación de uso. El contenedor posiciona las etiquetas accesibles para evitar que expandan el ancho del documento.
- Los menús marcan Empresas, Usuarios u Operadores como sección actual. La navegación móvil conserva mejora progresiva, Escape y devolución de foco.
- Se revisaron contraste de controles/estados, etiquetas, IDs únicos, UTF-8, desbordamiento, imágenes, botones, detalles de formulario y estados deshabilitados. Las medidas de contraste esperan a que terminen las transiciones CSS de los controles habilitados por JavaScript.
- Se corrigieron acentos ausentes en las etiquetas de consentimiento y el recorrido de automatización, sin cambiar los nombres de campos ni los mensajes de seguridad.

## Roles, autorización y activación

Se auditaron modelo, autenticación, middleware, rutas, controladores, filtros MongoDB, permisos y servicios de campañas, contactos, IA y Gmail. Se conservaron las restricciones existentes; no se otorgaron permisos nuevos al operador ni al administrador empresarial.

| Función | superadmin | admin_empresa | operador |
| --- | --- | --- | --- |
| Panel | Global | Empresa propia | Empresa propia |
| Empresas | Alta, consulta, nombre y estado operativo | Denegado | Denegado |
| Usuarios | Alta de admin/operador y gestión empresarial | Consulta de usuarios propios; alta/consulta/edición/activación/bloqueo/reactivación de operadores propios | Denegado |
| Campañas | CRUD global existente | CRUD propio | Crear, consultar y editar propias; eliminación denegada |
| Ejecución | Permiso general existente, sujeto al flujo concreto | Sujeta a consentimiento, configuración y flujo seguro | Permiso operativo existente, sujeto al flujo concreto; no administra piloto ni credenciales |
| Contactos | CRUD global existente | CRUD propio | CRUD propio |
| Gmail/OAuth | Denegado por el router de conexión | Empresa propia | Denegado |
| Gemini / preparación empresarial | Denegado por rutas empresariales | Autorización persistida, empresa y cuotas | Autorización persistida, empresa y cuotas |
| Automatizaciones globales | Permitido | Denegado | Denegado |

El permiso genérico de `services/permisos.js` no sustituye los controles adicionales: Gmail exige `admin_empresa`; el piloto tiene sus controles propios y la IA exige usuario/empresa autorizados. La configuración empresarial de preparación de campañas está separada de la configuración global, restringida al superadmin. No se amplían estos permisos para hacer coincidir un menú.

**Operadores:** ambas altas internas asignan explícitamente `pendiente_verificacion`, ignorando cualquier estado enviado por el cliente. Un administrador autorizado debe elegir **Activar operador**; la petición exige CSRF y consulta el estado empresarial persistido. Empresas de registro público deben estar activas y verificadas. Las empresas internas/históricas conservan su compatibilidad administrativa, con delegación explícita y sin fabricar verificaciones. Estados/versiones desconocidos deniegan activación.

Los pendientes y bloqueados no inician sesión. El bloqueo revoca el acceso de sesiones existentes en la siguiente petición; reactivar no resucita una sesión destruida. Se puede bloquear también un operador pendiente. Los administradores pendientes conservan su verificación de correo y no pueden pasar por bloqueo/reactivación para eludirla. No se migraron ni activaron cuentas automáticamente.

Las consultas y escrituras de operadores quedan limitadas por empresa/rol, y la escritura conserva el estado previo frente a cambios concurrentes. No se aceptan cambios de empresa, rol, identificador o estado a través del editor. Las cuentas verificadas de administrador no pueden sustituir su correo desde esta edición.

Contraseñas internas nuevas/cambiadas: mínimo 12 caracteres, cuatro diferentes y máximo 72 bytes UTF-8; bcrypt coste 12. El registro público mantiene su mínimo de 16. El login y los hashes existentes conservan compatibilidad.

## Archivos modificados y creados respecto a `1df937e`

Modificados:

- `appFactory.js`.
- `controllers/adminController.js`, `controllers/empresaController.js`.
- `routes/adminRoutes.js`, `routes/empresaRoutes.js`.
- `services/adminService.js`, `services/empresaService.js`.
- `public/css/styles.css`, `public/css/publico.css`, `public/css/interno.css`.
- `views/admin/_usuarios.ejs`, `views/admin/dashboard.ejs`, `views/admin/empresaDetalle.ejs`, `views/admin/empresaNueva.ejs`, `views/admin/usuarioNuevo.ejs`, `views/admin/automatizacionesEditar.ejs`.
- `views/empresa/_campanas.ejs`, `views/empresa/panelAdmin.ejs`, `views/empresa/usuarioNuevo.ejs`, `views/error.ejs`, `views/panel.ejs`.
- `views/contactos/_formulario.ejs`, `views/campanas/automatizacion.ejs`.
- `views/partials/_encabezadoAdmin.ejs`, `views/partials/_navegacionInterna.ejs`.
- `tests/admin.http.test.js`, `tests/admin.service.test.js`, `tests/empresa.http.test.js`, `tests/soporte/internoFixtures.cjs`, `tests/soporte/internoNavegador.cjs`, `tests/soporte/sesion.js`.

Creados:

- `controllers/usuariosGestionController.js`.
- `services/passwordService.js`, `services/usuariosGestionService.js`.
- `views/admin/empresaEditar.ejs`, `views/empresa/usuarioEditar.ejs`, `views/empresa/usuarioDetalle.ejs`.
- `views/partials/_camposUsuario.ejs`, `views/partials/_validacionServidor.ejs`.
- `tests/interno.vistas.test.js`, `tests/usuarios.gestion.http.test.js`, `tests/operadores.ciclo.http.test.js`, `tests/password.service.test.js`, `tests/plataforma.vistas.test.js`, `tests/soporte/publicoFixtures.cjs`.
- `docs/interfaz-roles-2026-10-18.md` y este informe.
- `docs/evidencias/interfaz-2026-10-18/`: nueve capturas representativas y dos informes JSON de las comprobaciones visuales, todos con datos sintéticos. Los informes identifican por nombre las 201 capturas generadas; se conserva una muestra de nueve imágenes en el repositorio.

Los JavaScript, modelos y componentes de campañas/contactos que ya eran correctos se conservaron tras inspección y pruebas; una página no necesita cambios de archivo si ya utiliza los componentes compartidos correctos.

## Pruebas, evidencias y límites

| Ejecución final | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Suite Node (`npm.cmd test`) | 742 | 0 | 0 |
| Navegador, fixtures completos | 1 | 0 | 0 |
| Navegador, recorrido público | 1 | 0 | 0 |
| Total de pruebas ejecutadas | 744 | 0 | 0 |

Los dos tests de navegador contienen 1.407 y 149 comprobaciones respectivamente (1.556 en total), con 176 y 25 capturas (201 en total), sin errores JavaScript. `git diff --check` termina sin errores.

Evidencias conservadas: [landing](evidencias/interfaz-2026-10-18/publico-inicio-1440.png), [login móvil](evidencias/interfaz-2026-10-18/publico-login-390.png), [administrador a 320 px](evidencias/interfaz-2026-10-18/publico-administrador-320.png), [empresa en tablet](evidencias/interfaz-2026-10-18/admin-empresaDetalle-768.png), [panel operador móvil](evidencias/interfaz-2026-10-18/empresa-panelOperador-320.png), [alta de operador](evidencias/interfaz-2026-10-18/empresa-usuarioNuevo-1440.png), [automatización móvil](evidencias/interfaz-2026-10-18/campanas-automatizacion-390.png), [contacto](evidencias/interfaz-2026-10-18/contactos-editar-1440.png) y [error público](evidencias/interfaz-2026-10-18/publico-error-390.png).

- Suite completa: `npm.cmd test`. Pruebas de roles, navegación, aislamiento, CSRF, validaciones, login, ciclo de operador, contraseñas, consentimiento, integraciones simuladas y renderizado.
- Navegador completo: `NODE_ENV=test node --test tests/soporte/internoNavegador.cjs`. Edge headless con servidor loopback, 41 casos a 1440/768/390/320 píxeles, capturas y comprobaciones de estructura, accesibilidad básica, contraste, menús y desbordamiento.
- Recorrido público: `NODE_ENV=test node --test tests/soporte/publicoNavegador.cjs`. Login, validación, registro, verificación/configuración, estados, navegación y piloto con servicios simulados, incluyendo doble envío/idempotencia. No ejecuta envíos reales.
- Se inspeccionaron capturas reales de landing, login móvil, configuración del administrador a 320 píxeles, dashboards, empresa en tablet, alta de operador y preparación de automatización. No se presenta el renderizado EJS como sustituto de una prueba visual.
- La comparación con imágenes oficiales externas del 17 no es posible porque no están en el repositorio. No se afirma identidad píxel a píxel.
- Las pruebas usan datos sintéticos: no certifican integración productiva con MongoDB/Gmail/Gemini ni auditoría WCAG completa o compatibilidad con todos los navegadores/lectores de pantalla.
- El aislamiento del entorno impidió inicialmente CDP; la ejecución autorizada fuera del aislamiento permitió completar la prueba local. No se habilitaron servicios externos para resolverlo.
- Se conserva la rama `respaldo-avances-18-oct`, HEAD `1df937e`. Sin commit/push, sin cambios en `main`, sin alteraciones de credenciales o MongoDB. El archivo accidental sigue sin seguimiento, intacto y excluido de los cambios del proyecto.
