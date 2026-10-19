# Registro empresarial integrado: fase 1

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Servicio transaccional implementado y probado, sin rutas, formularios, cambios de conexión de Express, generación de enlaces o envíos. No hay proveedor de correo ni trabajador habilitado. `.env` no se utiliza en las pruebas reales.

## Contrato y seguridad

`registroEmpresarialService.registrar({ conexion, actorId, datos, claveIdempotencia })` exige una conexión Mongoose explícita a una topología que admita transacciones. No utiliza la conexión global ni abre conexiones por su cuenta. Antes de escribir comprueba PRIMARY, sesiones, topología/versiones compatibles y los índices únicos de usuario y tarea. La creación de colecciones e índices debe provisionarse separadamente; el servicio no hace `init`, `syncIndexes` ni migraciones.

Datos admitidos: `nombreEmpresa`, `correoAutomatizaciones`, `nombreAdministrador`, `correoAdministrador`, `password`. Se rechazan campos adicionales, incluidos rol, empresa y estados. Los correos se normalizan con trim/lowercase sin equiparar alias, puntos o sufijos +. El correo de acceso es globalmente único por el índice existente de Usuario; puede coincidir con el de automatizaciones. Esta fase no impone unicidad del correo previsto de automatizaciones entre empresas: la exclusividad real de identidad Google se mantiene en ConexionGmail y se comprobará al integrar OAuth.

La contraseña exige al menos 16 caracteres Unicode, máximo 72 bytes UTF-8 y al menos cuatro caracteres diferentes; no se recorta ni se transforma. Es una política mínima, no una comprobación contra bases de contraseñas comprometidas. Se guarda mediante `Usuario.save`, conservando bcrypt de coste 12. No se guarda un fingerprint de contraseña para idempotencia; un reintento compara privadamente con el hash bcrypt existente.

El actor se carga desde la base de la conexión explícita y debe ser superadmin no pendiente ni bloqueado. `actorId` es contexto del servidor: el futuro controlador debe tomarlo del usuario autenticado, nunca del body. Debe conservar requerirAutenticacion, requiereRol y el CSRF del superadministrador. El servicio no recibe solicitudes HTTP ni sustituye CSRF por un booleano confiado al cliente.

## Transacción e idempotencia

Una misma sesión crea Empresa (`versionAlta: 1`, `estadoActivacion: pendiente_verificacion`), Usuario (`rol: admin_empresa`, empresa fijada, `estadoAcceso: pendiente_verificacion`, sin emailVerificadoEn) y TareaCorreo (`tipo: verificar_acceso`, `estado: pendiente_configuracion`). El estado administrativo activa/inactiva permanece separado; activa no significa verificada ni autorizada para enviar.

Las operaciones son secuenciales con readConcern snapshot y writeConcern majority. Cualquier fallo revierte todas las escrituras. Los callbacks no realizan efectos externos. Los reintentos de la transacción generan documentos nuevos en cada intento, evitando reutilizar un password ya hasheado como texto de entrada.

La clave de idempotencia admite 16–128 caracteres ASCII URL-safe y debe generarse aleatoriamente en la futura interfaz, independientemente del token CSRF. Se almacena su SHA-256, acotado al actor por un índice único. La tarea guarda además una huella de los datos normalizados sin contraseña. Una repetición equivalente devuelve los mismos IDs; un cambio en datos o contraseña produce conflicto. El índice único de email resuelve carreras entre claves diferentes. No se deduplican solicitudes de actores diferentes con una misma clave.

## Compatibilidad histórica

Los documentos existentes sin metadatos mantienen dichos campos ausentes al hidratarlos y no se actualizan. `compatibilidadAltaService` los clasifica explícitamente como `historico_no_verificado`; nunca infiere titularidad a partir de existencia, estado activa o rol. Los nuevos documentos construidos mediante los modelos nacen pendientes. El alta integrada siempre añade versionAlta 1 y exige correoAutomatizaciones válido. Las altas separadas existentes conservan su contrato de campos y no reciben versionAlta 1 automáticamente.

La compatibilidad de lectura no equivale a verificación: solo estadoAcceso activo con emailVerificadoEn válido acredita verificación en el helper. La autenticación y permisos operativos de Express todavía conservan su comportamiento anterior. Antes de exponer este servicio deben implementarse los bloqueos de pendientes en login, middleware y ejecución, y evitar que las altas separadas eludan el flujo nuevo. No habilitar esta fase por sí sola como registro público o administrativo definitivo.

## Modelos de correo

VerificacionCorreo admite exclusivamente hash SHA-256 del token, empresa, usuario, destino, propósito, versión, expiración y estado pendiente/consumida/invalidada. El hash está oculto en consultas habituales y serialización. Tiene unicidad de hash, exclusión de verificaciones pendientes del mismo usuario/propósito y TTL. El futuro consumidor deberá comprobar expiración y consumir atómicamente; TTL no valida enlaces.

TareaCorreo contiene referencias y metadatos mínimos, sin payload libre, contraseña, enlace, token ni credenciales. Ambos modelos rechazan campos desconocidos. El alta no crea VerificacionCorreo: el futuro trabajador autorizado generará el token en memoria, guardará su hash antes del envío y aplicará límites/reintentos. No existen tokens recuperables en la bandeja de tareas.

## Pruebas

```powershell
npm.cmd test
node --test pruebas-integracion/registroEmpresarial.js
```

La suite habitual no conecta MongoDB y mantiene las pruebas previas. Las pruebas de integración requieren el replica set ya iniciado: verifican su identidad con los scripts existentes, usan conexiones Mongoose separadas y bases aleatorias `ma_tx_test_` en 27018, con autoIndex/autoCreate deshabilitados. Provisionan colecciones e índices exclusivamente dentro de cada fixture. Solo eliminan su propia base tras verificar identidad y marcador. Comparan el standalone antes y después mediante lecturas.

Cobertura real: commit, bcrypt, relaciones, tareas sin tokens, fallos al guardar usuario y tarea con rollback, email duplicado, reenvíos secuenciales/concurrentes, claves diferentes concurrentes, conflictos de payload/password, índices ausentes, aislamiento previo al commit, permisos persistidos, correo igual/diferente e históricos intactos. La falta de soporte transaccional se prueba con una conexión simulada para no escribir ni abrir conexiones al standalone real.

## Pendiente antes de habilitar

Controlador/interfaz con CSRF e idempotencia, bloqueo operativo de pendientes, consumo de enlaces y límites de reenvío, proveedor transaccional autorizado, trabajador con recuperación e idempotencia de entrega, comparación del correo previsto en OAuth y requisito Gmail en campañas. Todo ello necesita una fase posterior. La conexión actual de Express sigue sin admitir esta alta transaccional; no se cambió ni se migraron datos.

## Resultados de validación

- `npm.cmd test`: 402/402 aprobadas, conservando las 389 anteriores y añadiendo 13 pruebas de modelos, compatibilidad, validación y rechazo de standalone sin escrituras.
- `node --test pruebas-integracion/registroEmpresarial.js`: 14/14 aprobadas contra MongoDB real, exclusivamente en bases ficticias de marketingDevRs:27018. Cada fixture se eliminó tras validar su marcador.
- Total ejecutado: 416 pruebas aprobadas, cero fallos y cero omitidas.
- Verificación final: replica set PRIMARY; standalone con el mismo PID y huellas de configuración, datos e índices.
- No hay importaciones del servicio desde app.js, rutas o controladores. No se modificaron formularios, .env, credenciales ni la conexión de Express. No hubo envíos, commit ni push.
