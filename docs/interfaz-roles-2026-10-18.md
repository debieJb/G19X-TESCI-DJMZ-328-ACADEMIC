# Interfaz interna y administración por roles

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Informe de la etapa inicial. La auditoría visual y los resultados finales se documentan en [auditoria-visual-integral-2026-10-18.md](auditoria-visual-integral-2026-10-18.md).

Trabajo sobre `respaldo-avances-18-oct`, respaldo `1df937e`. Sin commit, push, migraciones, conexiones a MongoDB real, trabajadores ni envíos externos.

## Auditoría y decisiones

- Se revisaron Usuario y Empresa, login y recarga de sesión, middleware de roles/CSRF, permisos y filtros multiempresa, rutas y controladores administrativos, campañas, contactos, Gmail e IA, vistas EJS, CSS interno y pruebas existentes.
- Se conservaron Node.js, Express, EJS, MongoDB y Gmail API. Los permisos de campañas/contactos existentes se reutilizan. Gmail conserva su restricción a `admin_empresa`; IA mantiene su autorización empresarial y cuotas existentes.
- El login ya rechaza pendientes y bloqueados. La recarga del usuario en cada solicitud ya revoca el acceso de sesiones anteriores al bloqueo. Las cuentas históricas sin estado mantienen compatibilidad.
- Las altas de operadores quedan siempre explícitamente en `pendiente_verificacion`, tanto desde el administrador empresarial como desde el superadmin. Crear y activar son dos acciones distintas. Se ignora cualquier estado, rol o empresa manipulados en el alta empresarial.
- Para activar o reactivar un operador en una empresa de registro público (`versionAlta: 1`) se exige estado operativo habilitado y activación verificada persistidos. Una empresa interna/histórica sin esa versión conserva su flujo administrativo existente. No se inventan verificaciones para empresas antiguas; la delegación explícita por un administrador autorizado permite su acceso. Los estados/versiones empresariales desconocidos deniegan activación. Las altas de administradores conservan el flujo previo.
- Un operador pendiente puede activarse explícitamente desde su tabla, después de habilitar/verificar la empresa. Los administradores pendientes no pueden activarse ni pasar por bloqueo para eludir su verificación de correo. Ningún pendiente inicia sesión antes de su transición autorizada a activo.
- La edición no permite cambiar rol, empresa, estado ni identificadores desde el cuerpo. Las consultas de administrador empresarial restringen empresa y rol operador; el filtro de escritura conserva empresa, rol y estado previo para evitar sobrescribir una transición concurrente. Un recurso ajeno responde 404.
- Se impide sustituir desde el editor el correo de un administrador con correo verificado. No se cambia la integración de verificación ni se fabrican fechas de verificación.
- Las nuevas contraseñas de altas internas y cambios tienen mínimo 12 caracteres, al menos 4 diferentes y máximo 72 bytes UTF-8. Se conserva bcrypt con coste 12, el login histórico y la política más estricta del registro público. Los campos de contraseña no vuelven a renderizarse con valores.

## Funcionalidades e interfaz

- Superadmin: panel global y agrupaciones existentes; tablas con acceso y acciones; edición de nombre/estado operativo empresarial; edición y bloqueo/reactivación de administradores y operadores empresariales.
- Admin empresa: listado sin tabla duplicada, creación pendiente, consulta individual, edición, cambio opcional de contraseña, activación explícita, bloqueo (también de pendientes) y reactivación de operadores propios.
- Se conservan los paneles del operador, campañas, contactos y asistente autorizado, sin ampliar permisos.
- Tablas con nombre, correo, rol, empresa, estado de acceso y acciones según rol/empresa. Estados legibles, formularios con etiquetas y ayuda de contraseña, acciones identificadas por usuario, confirmaciones con `role="status"`, errores accesibles, tablas desplazables y menú móvil existente reutilizado.
- Las modificaciones de usuarios y empresas requieren los tokens CSRF existentes, tanto por formulario como por las cabeceras admitidas.

## Permisos efectivos

| Área | superadmin | admin_empresa | operador |
| --- | --- | --- | --- |
| Panel | Global | Empresa propia | Empresa propia |
| Empresas | Crear, consultar, editar nombre/estado | Denegado | Denegado |
| Usuarios | Crear admin/operador; editar y gestionar acceso empresarial | Crear y gestionar solo operadores propios | Denegado |
| Campañas | Acceso global existente | Crear, consultar, editar, ejecutar, eliminar propias | Crear, consultar, editar, ejecutar propias; eliminar denegado |
| Contactos | Acceso global existente | CRUD propio | CRUD propio |
| Gmail/OAuth | Denegado por router | Empresa propia | Denegado |
| Asistente IA | Denegado | Según autorización empresarial/cuotas existentes | Según autorización empresarial/cuotas existentes |
| Automatizaciones globales | Permitido | Denegado | Denegado |

Las operaciones de ejecución conservan sus comprobaciones adicionales, consentimiento, estado empresarial y bloqueos de envío existentes. No se activaron proveedores ni servicios.

## Archivos modificados o nuevos

- Aplicación: `appFactory.js`.
- Controladores: `controllers/adminController.js`, `controllers/empresaController.js`, `controllers/usuariosGestionController.js` (nuevo).
- Rutas: `routes/adminRoutes.js`, `routes/empresaRoutes.js`.
- Servicios: `services/adminService.js`, `services/empresaService.js`, `services/passwordService.js` (nuevo), `services/usuariosGestionService.js` (nuevo).
- Diseño: `public/css/interno.css`.
- Vistas: `views/admin/_usuarios.ejs`, `views/admin/dashboard.ejs`, `views/admin/empresaDetalle.ejs`, `views/admin/empresaEditar.ejs` (nueva), `views/admin/usuarioNuevo.ejs`, `views/empresa/panelAdmin.ejs`, `views/empresa/usuarioNuevo.ejs`, `views/empresa/usuarioEditar.ejs` (nueva), `views/empresa/usuarioDetalle.ejs` (nueva), `views/partials/_navegacionInterna.ejs`.
- Pruebas: `tests/admin.http.test.js`, `tests/admin.service.test.js`, `tests/empresa.http.test.js`, `tests/soporte/internoFixtures.cjs`, `tests/soporte/sesion.js`, `tests/interno.vistas.test.js` (nueva), `tests/password.service.test.js` (nueva), `tests/usuarios.gestion.http.test.js` (nueva), `tests/operadores.ciclo.http.test.js` (nueva).
- Informe: este archivo.

## Validación y límites

- Base inicial: 669 pruebas aprobadas.
- `npm.cmd test`: 718 pruebas aprobadas, cero fallos. Incluye roles, aislamiento, listas blancas, bloqueo/reactivación, estados pendientes, verificación empresarial, CSRF, contraseñas, navegación y renderizado de las 26 vistas internas.
- `tests/operadores.ciclo.http.test.js` integra HTTP, controladores, modelos Mongoose, bcrypt, login, cookies y sesiones reales con persistencia simulada en las colecciones. Comprueba creación pendiente incluso con entrada manipulada, activación, rechazo del login pendiente/bloqueado, revocación de sesiones, reactivación sin resucitar sesiones destruidas, edición sin escalamiento, verificación empresarial, CSRF ausente/de otra sesión y aislamiento tras autenticar administradores de empresas diferentes.
- `git diff --check`: sin errores.
- Prueba visual explícita: `NODE_ENV=test node --test tests/soporte/internoNavegador.cjs`. Edge no respondió a `Page.enable` en CDP (`CDP_TIMEOUT_Page.enable`), antes de inspeccionar vistas. La revisión visual real de escritorio/móvil queda pendiente; el renderizado EJS y las pruebas HTTP sí pasan. No se afirma validación visual ni accesibilidad integral.
- No se probaron integraciones contra MongoDB/Gmail reales ni se enviaron mensajes, conforme al alcance autorizado.
- No se migraron ni activaron automáticamente cuentas pendientes antiguas. Los operadores se activan de forma explícita y los administradores continúan su verificación existente.
- La edición de cuentas superadmin, eliminación de usuarios y reasignación de empresa/rol no se exponen en estas rutas.
- El archivo accidental `witch -c respaldo-avances-18-oct` permanece sin seguimiento y sin cambios.
