# Segunda revisión: sesiones, navegación y permisos

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Rama `respaldo-avances-18-oct`, HEAD `1df937e`. Se conservaron los cambios de la auditoría anterior. Sin commit/push, credenciales, conexiones reales, campañas, trabajadores o envíos productivos.

## 1. Causa del comportamiento observado

La redirección al volver a `/login` no era un nuevo inicio de sesión: la ruta detectaba la cookie de una sesión válida, cargaba al usuario persistido y redirigía a `/panel`. El controlador de panel selecciona su vista desde el rol de ese usuario, no desde el navegador.

Los EJS existentes ya ocultaban login y registro en una respuesta recién generada para una sesión válida. No se reprodujo un enlace de login en ese HTML autenticado. Una página abierta antes del login, otra pestaña o una restauración de historial podían conservar navegación anónima, pues no había sincronización/revalidación del documento. Esto explica el caso compatible con el código; no se atribuye una causa específica al servidor o navegador del usuario sin observar ese entorno.

Se encontró además que solo GET tenía el guard de sesión abierta: un POST de un formulario antiguo podía entrar de nuevo al flujo de autenticación o devolver otro formulario de login. Ahora GET/HEAD redirigen al panel y POST responde 303 al mismo panel sin comparar otras credenciales, cambiar identidad ni regenerar una sesión ya autenticada. El login anónimo conserva CSRF y regeneración del SID.

## 2. Cambios de navegación y cierre de sesión

- `_cerrarSesion.ejs` centraliza el único formulario de salida de cada página, `POST /logout`, token CSRF y texto visible **Cerrar sesión**. Se reutiliza en los encabezados público autenticado e interno. Se eliminó el duplicado del panel compatible.
- `_identidadUsuario.ejs` presenta nombre, rol y empresa. En móvil aparece dentro del menú; en escritorio/tablet, en la cabecera. Se conserva la identidad visual clara y la navegación por permisos.
- Sin sesión, el encabezado ofrece login y registro. Con sesión, los sustituye por panel y salida; también se revisaron landing, acciones finales y footer.
- El controlador de logout sigue esperando la destrucción de la sesión en servidor, borra la cookie con su nombre/path/atributos configurados y redirige 303 a `/`. GET `/logout` no cierra sesión.
- `cacheDinamica.js`, situado después de los recursos estáticos y antes de parsear cuerpos y cargar sesiones, aplica `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` y `Vary: Cookie` a las respuestas dinámicas, incluyendo errores, JSON y redirecciones. No depende de que una ruta alcance su middleware de autenticación.
- `sesion.js` actualiza otras pestañas cuando cambia la presencia de sesión y revalida documentos restaurados desde BFCache. Solo guarda `autenticada`/`anonima` en almacenamiento local, nunca cookies, tokens, IDs, roles o contraseñas. En `pagehide` oculta documentos privados; en una restauración `pageshow.persisted` recarga desde servidor antes de volver a mostrarlos. Si el almacenamiento web no está disponible, la autorización y logout del servidor siguen funcionando.

## 3. Páginas con botón verificado

Se comprobó por renderizado la presencia de exactamente un logout POST con CSRF y situado antes/fuera del formulario principal en las 26 vistas internas:

- Superadmin: dashboard, alta/detalle/edición de empresa, alta de usuario y automatizaciones globales.
- Empresa: ambos paneles, alta/edición/detalle de usuario, Gmail, asistente y resultado de IA.
- Campañas: listado, alta, edición, detalle, eliminación y preparación de automatización/piloto/resultados.
- Contactos: listado, alta, edición y detalle.
- Comunes: errores autenticados y panel compatible.

También se verificó el encabezado público con sesión. Las pruebas HTTP recorren panel, campañas, formularios, detalles, contactos, IA autorizada y errores. La prueba funcional de navegador usa los tres roles en escritorio/tablet/móvil y efectúa logout desde formularios y errores internos. El renderizado no se presenta como prueba de un POST real desde cada una de las 26 páginas.

## 4. Matriz de permisos comprobada

| Función | superadmin | admin_empresa | operador |
| --- | --- | --- | --- |
| Panel | Global | Empresa propia | Empresa propia |
| Empresas | Administración global autorizada | Denegado | Denegado |
| Usuarios | Gestión de admin/operador empresariales | Consulta de usuarios propios; gestión solo de operadores propios | Denegado |
| Campañas | CRUD global existente | CRUD propio | Crear/consultar/editar propias; eliminar denegado |
| Contactos | CRUD global | CRUD propio | CRUD propio |
| Gmail y credenciales | Denegado por router empresarial | Empresa propia | Denegado |
| IA/preparación empresarial | Denegado por rutas empresariales | Según usuario/empresa/cuotas persistidos | Según usuario/empresa/cuotas persistidos |
| Automatizaciones globales | Permitido | Denegado | Denegado |
| Ejecución de campañas | Sujeta al flujo concreto y sus controles adicionales | Sujeta a consentimiento, empresa, configuración y flujo seguro | Permiso operativo existente, sin administración de credenciales/piloto |

No se amplió la matriz existente. Las pruebas comprueban rol persistido en cada petición, cambios de rol en la base sintética, parámetros/cookies/cuerpos manipulados, bloqueo, recursos ajenos y rutas administrativas denegadas. Ocultar botones no es la barrera de autorización.

## 5. Revocación robusta y compatibilidad

La recarga del usuario por solicitud ya rechazaba pendientes y bloqueados. Se cerró un caso adicional: bloquear y reactivar antes de que el usuario hiciera otra petición podía dejar utilizable una sesión anterior.

Ahora `Usuario.versionSesion` se incrementa al bloquear mediante la gestión autorizada. El login guarda ID y versión; cada petición compara esa versión con la persistida. Una cookie anterior se rechaza incluso si el usuario ya fue reactivado. Las escrituras de gestión conservan también la versión anterior en su filtro frente a cambios concurrentes.

Ausencia de versión en documentos y sesiones históricos equivale a cero. No se migraron datos ni se alteraron contraseñas/hashes. Los roles siguen consultándose en servidor; no se guardan como autoridad en la cookie ni se aceptan del cliente. Las pruebas incluyen dos sesiones simultáneas, bloqueo/reactivación sin solicitudes intermedias y acceso posterior solo con login nuevo.

## 6. Resultados y evidencias

| Ejecución final | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Suite completa Node | 759 | 0 | 0 |
| Navegador de sesiones y roles | 1 | 0 | 0 |
| Navegador de todas las vistas | 1 | 0 | 0 |
| Navegador del recorrido público | 1 | 0 | 0 |
| Total | 762 | 0 | 0 |

La suite incorpora 17 pruebas nuevas de sesiones/roles sobre las 742 anteriores. Los tests de navegador completaron 222, 1.407 y 149 comprobaciones (1.778), con 18, 176 y 25 capturas (219), sin errores JavaScript. El test de sesiones recorre los tres roles a 1440/768/390 píxeles; la regresión visual incluye también 320 píxeles. `git diff --check` pasó.

Se observaron **18 restauraciones privadas reales desde BFCache**: nueve con sesión válida y nueve con la cuenta bloqueada. Todas estaban ocultas en la restauración hasta revalidarse; las bloqueadas terminaron en login. En las nueve vueltas posteriores al logout, Edge declaró `CacheControlNoStoreHTTPOnlyCookieModified` y no restauró el documento privado.

Se conservaron seis capturas representativas y tres JSON en [evidencias/sesiones-2026-10-18/](evidencias/sesiones-2026-10-18/): [sesiones-report.json](evidencias/sesiones-2026-10-18/sesiones-report.json), [menú móvil del operador](evidencias/sesiones-2026-10-18/operador-390-privada.png), [Atrás tras logout](evidencias/sesiones-2026-10-18/operador-390-atras.png), [administrador en tablet](evidencias/sesiones-2026-10-18/admin_empresa-768-privada.png) y [superadmin en escritorio](evidencias/sesiones-2026-10-18/superadmin-1440-privada.png).

Las ejecuciones usan servidor loopback, cuentas sintéticas, MemoryStore y dobles de las colecciones. Las rutas, controladores, modelos Mongoose, bcrypt y cookies/sesiones HTTP son reales. Los proveedores se bloquean o simulan y no se carga `.env`.

Comandos:

- `npm.cmd test`.
- `NODE_ENV=test node --test tests/soporte/sesionesNavegador.cjs`.
- `NODE_ENV=test node --test tests/soporte/internoNavegador.cjs`.
- `NODE_ENV=test node --test tests/soporte/publicoNavegador.cjs`.

Se probó login/regeneración de SID, navegación, logout con CSRF, cookie eliminada, Atrás, URLs protegidas directas, reproducción de cookies antiguas, nuevo login, expiración, revocación externa, pendientes/bloqueados y aislamiento entre dos empresas. Las peticiones HTTP sin ejecución de JavaScript también rechazan el acceso tras revocación.

En Edge se usaron `history.back()` y eventos reales `pageshow.persisted`; no se dispararon eventos simulados para afirmar restauraciones. Con cookie intacta se observaron restauraciones privadas reales desde BFCache, ocultas hasta recarga y autorización. También se probó bloquear una cuenta mientras su página permanecía en el historial y regresar con Atrás. Tras logout, Edge rechazó restauraciones por `CacheControlNoStoreHTTPOnlyCookieModified` y volvió al login mediante HTTP. El informe JSON conserva eventos, motivos, cabeceras de caché y resultados, sin valores de cookies.

## 7. Archivos de esta revisión

Modificados sobre el trabajo previo:

- `appFactory.js`, `controllers/authController.js`, `routes/authRoutes.js`.
- `middlewares/autenticacion.js`, `models/Usuario.js`, `controllers/usuariosGestionController.js`.
- `public/css/publico.css`, `public/css/interno.css`.
- `views/partials/_encabezadoPublico.ejs`, `views/partials/_navegacionInterna.ejs`, `views/partials/_headPublico.ejs`, `views/panel.ejs`.
- `tests/auth.http.test.js`.

Creados:

- `middlewares/cacheDinamica.js`, `public/js/sesion.js`.
- `views/partials/_cerrarSesion.ejs`, `views/partials/_identidadUsuario.ejs`.
- `tests/sesiones.roles.http.test.js`, `tests/soporte/sesionesFixture.cjs`, `tests/soporte/sesionesNavegador.cjs`.
- Este informe y las evidencias de sesiones.

Los archivos de etapas anteriores siguen presentes sin commit. El inventario acumulado de esas etapas está en `auditoria-visual-integral-2026-10-18.md`.

## 8. Límites

- Los resultados de navegador corresponden a Edge headless local. Se probó Atrás y restauración BFCache real en ese navegador; no se garantiza el comportamiento de todos los navegadores, extensiones, lectores o dispositivos.
- Una revocación impide peticiones futuras, pero no puede retirar datos ya descargados, copiados o capturados por el usuario. La mejora de historial complementa la autorización del servidor.
- No se certifica infraestructura productiva ni conexión real MongoDB/Gmail/Gemini. No se habilitaron proveedores, campañas ni trabajadores.
- No se inspeccionó el navegador/servidor concreto donde se observó el enlace de login; sí se verificó el comportamiento del código actual y su sincronización entre pestañas.

## 9. Git

Rama `respaldo-avances-18-oct`, respaldo/HEAD `1df937e` intacto. Cambios sin commit ni push, sin cambios en `main`. El archivo accidental `witch -c respaldo-avances-18-oct` continúa sin seguimiento, sin incluirse ni eliminarse.
