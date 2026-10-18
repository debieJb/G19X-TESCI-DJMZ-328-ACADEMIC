# Base de piloto preparada — 18 de octubre de 2026

Se aplicó la autorización del usuario para crear exclusivamente una base nueva de
aplicación. No es aprobación formal externa de PluriOne, autorización de producción,
aprobación de envíos ni permiso de consumo de Gemini.

## Preflight y alcance ejecutado

- Destino real verificado: 127.0.0.1:27019, marketingPilotLocalRs, PRIMARY, miembro
  único 127.0.0.1:27019, configuración de réplica versión 1, PID 33480.
- Directorio verificado: C:\Users\jocam\Documents\marketing-automation-pilot-mongo-rs\data.
- marketing_piloto_mvp no existía antes de la migración. Las bases de sistema eran
  admin, config y local. Se capturaron referencias antes de cualquier DDL.
- Se revisaron scripts/migrarIndicesPiloto.js y sus servicios: crean colecciones,
  índices faltantes y un marcador con majority. No hacen drop, syncIndexes,
  reparación, creación de usuarios/roles ni reconfiguración de réplica.
- Se ejecutó el script existente con --aplicar --confirmar-base marketing_piloto_mvp.
  La URI se suministró exclusivamente al proceso hijo, sin leer .env ni heredar
  credenciales. Todas las banderas externas quedaron false en ese proceso.
- Una guardia operativa en TEMP validó destino, PRIMARY, opciones y configuración
  antes de cada escritura, rechazó bases preexistentes y limitó las operaciones
  al plan revisado en la base creada por esta ejecución. Bloqueó operaciones
  destructivas, comandos administrativos ajenos y solicitudes HTTP/HTTPS externas.
  No se activó ningún bloqueo de seguridad durante la migración.

## Resultado real de MongoDB

Base: marketing_piloto_mvp. Migración completada, versión 1.

**17 colecciones y 44 índices:** 15 colecciones de modelos, sesionesMvp y
_migracionesPiloto; 27 índices declarados y 17 índices _id_ implícitos únicos.
No hay colecciones ni índices adicionales. Se verificaron claves, unicidad,
filtros parciales y expireAfterSeconds contra el esquema, además del conteo exacto.

Todas las colecciones de aplicación/sesiones tienen cero documentos. La única
escritura documental es _migracionesPiloto/indices-piloto-v1, con versión, base,
réplica y fecha. No se crearon empresas, usuarios, contactos, tareas ni sesiones.

Cada colección incluye _id_; la tabla enumera los otros índices:

| Colección | Documentos | índices adicionales verificados |
| --- | ---: | --- |
| `_migracionesPiloto` | 1 |  |
| `auditoriaregistros` | 0 | `solicitud_1_fecha_1` |
| `autorizacionpilotogmails` | 0 | `empresa_1_campana_1` (único) |
| `campanas` | 0 | `empresa_1_asistenciaIA.aprobacionHash_1` (único) (parcial) |
| `conexiongmails` | 0 | `empresa_1` (único), `googleSub_1` (único) (parcial) |
| `contactos` | 0 | `empresa_1_email_1` (único) (parcial), `empresa_1_telefono_1` (único) (parcial) |
| `controlenviogmails` | 0 |  |
| `ejecuciongmails` | 0 | `empresa_1_campana_1` (único), `empresa_1_claveHash_1` (único) |
| `empresas` | 0 |  |
| `enviogmails` | 0 | `empresa_1_ejecucion_1_emailHash_1` (único), `estado_1_createdAt_1`, `empresa_1_gmailId_1` (único) (parcial) |
| `estadooauths` | 0 | `hash_1` (único), `expiraEn_1` (TTL 0) |
| `limiteregistros` | 0 | `expiraEn_1` (TTL 0) |
| `sesionesMvp` | 0 | `expiraEn_1` (TTL 0) |
| `solicitudregistros` | 0 | `correo_1` (único), `idempotenciaHash_1` (único), `tokenHash_1` (único) (parcial), `correoEstado_1_createdAt_1` |
| `tareacorreos` | 0 | `creadoPor_1_idempotenciaHash_1` (único), `empresa_1_tipo_1_versionAlta_1` (único), `estado_1_createdAt_1` |
| `usuarios` | 0 | `email_1` (único) |
| `verificacioncorreos` | 0 | `tokenHash_1` (único), `usuario_1_proposito_1` (único) (parcial), `expiraEn_1` (TTL 0) |

## Manifiesto y autoridad

Se creó infra/piloto.aprobado.json con la base autorizada, réplica y miembro reales,
escucha web prevista 127.0.0.1:3100 y trustProxy vacío. El cargador y el validador
existentes lo aceptan. No contiene secretos y no se alteró la plantilla de ejemplo.

El código exige aprobado:true como confirmación del destino por el operador, no
una firma, certificado ni aprobación externa de PluriOne. Se utilizó la autorización
expresa recibida en esta tarea para preparar ese destino; no se inventó una
aprobación institucional. La documentación histórica solicita revisión del destino;
esta autorización prevalece para el alcance local limitado. El archivo no acredita
TLS, autenticación productiva de MongoDB, disponibilidad, backup, OAuth o recepción.

trustProxy:[] significa no confiar en cabeceras reenviadas. No se sustituyó por una
confianza genérica para hacer funcionar cookies Secure. El puerto es configuración
prevista: no se arrancó la web del piloto ni se modificó Express 3000.

## Conservación de recursos previos

Comparación antes/después de 27017, 27018 y 27019:

- Mismos PID, opciones de arranque, configuración de réplica, usuarios y roles.
- Mismos hashes de datos e índices de todas las bases de aplicación preexistentes.
- El único nombre de base añadido fue marketing_piloto_mvp, en 27019.
- Referencia independiente de 27017 comprobada y 27018 PRIMARY.
- .env permanece idéntico. Sin cambios de credenciales o banderas.

La creación del esquema genera metadatos internos y entradas normales del oplog de
MongoDB; no se ejecutaron escrituras de aplicación en otras bases ni se comparó el
contenido mutable de bases internas como si fuera información empresarial.

No se reiniciaron ni modificaron servicios. El monitor TTL de 27019 permanece
pausado como en la fase anterior: se crearon los índices TTL, pero no se habilitó
su ejecución. La aplicación debe seguir comprobando la caducidad lógica.
No se reactivó tampoco el monitor de 27020 ni se accedió a ese servicio.

## Sesiones y HTTPS: lo validado y lo pendiente

sesionesMvp existe y su índice TTL expiraEn_1 con expireAfterSeconds=0 fue verificado
por MongoSessionStore.comprobar, sin crear sesiones ni generar claves.

Pendientes: SESSION_STORE_KEY privado independiente, idoneidad de SESSION_SECRET,
inyección de la URI del piloto al proceso correcto, origen/certificado HTTPS y
proxy/IP explícitos. Las cookies de producción son Secure/HttpOnly/SameSite=Lax:
HTTP con un trustProxy abierto no es una solución autorizada.

No se ejecutaron login, persistencia entre reinicios ni OAuth en esta base nueva.
El almacén está preparado a nivel de esquema, no validado en una web desplegada.

## Gemini 27020: revisión documental únicamente

No se conectó a 27020 durante esta tarea ni se ejecutaron scripts de recuperación,
creación de cuentas, cambios de roles o eliminación de bootstrap.

El backend existente requiere conexión independiente a plurione_ai_quota,
AI_QUOTA_BACKEND=protected y AI_QUOTA_MONGODB_URI privada; exige el rol runtime
plurione_ia_quota_runtime con find/insert/update/listIndexes únicamente sobre usoias,
y los índices _id_, empresa_1_ventana_1 único y expiraEn_1 TTL 0.
No sustituir ese almacén por marketing_piloto_mvp ni por fixtures de 27018.

Procedimiento preparado para una autorización posterior de solo lectura:

1. El responsable verifica la identidad del perfil Gemini existente en 27020.
2. Inyecta una URI de credenciales existentes desde el gestor/canal privado al
   entorno del proceso; nunca como argumento, mensaje, log ni documento versionado.
3. Con AI_ENABLED=false y AI_FREE_TIER_CONFIRMED=false, configura el backend protected
   y ejecuta node scripts/ia/validarAlmacenCuotas.js. Este comando comprueba
   identidad, autenticación, privilegios e índices sin consumir contadores ni Google.
4. Si ya dispone del archivo DPAPI autorizado, puede utilizar el launcher existente
   iniciarExpressConCuotas.ps1 -ValidarAlmacen -AlmacenGemini; la fase anterior no
   encontró ese archivo. No crear/reemplazar secretos para sortear su ausencia.
5. Ante rechazo o inventario incompleto, detenerse. No ejecutar el aprovisionador:
   puede escribir roles, usuarios e índices y eliminar bootstrap; requiere una
   autorización adicional basada en el inventario real.

## Próximos pasos para pruebas externas

1. Completar la inyección privada de sesiones y definir HTTPS/proxy; comprobar
   arranque de la web sobre esta base sin activar transportes.
2. Configurar cliente OAuth transaccional independiente, Gmail API y consentimiento;
   callback exacto http://127.0.0.1:3001/oauth/callback. Autorizar la cuenta por el
   flujo existente sin enviar correo. Configurar sus variables privadas pendientes.
3. Autorizar por separado un correo de verificación a buzón controlado y completar
   registro, verificación, administrador y login desde el enlace recibido.
4. Validar documentalmente/por procedimiento privado el almacén de cuotas, proyecto,
   clave, modelo y nivel gratuito de Gemini antes de autorizar una generación real.
5. Registrar el callback empresarial del origen HTTPS terminado en
   /empresa/gmail/callback; conectar Gmail de la empresa, preparar un contacto con
   consentimiento y contenido revisado. Autorizar por separado un único envío.

Las banderas de campañas, transaccional y Gemini siguen apagadas. El piloto de
campañas mantiene su límite de un destinatario, texto inmediato y un intento.
No se declara verificado ningún proveedor externo por haber creado este esquema.

## Evidencia y pruebas

- Migración real: completos:true, versión 1, salida 0.
- Postflight real: 17 colecciones, 44 índices, cero documentos de aplicación,
  un marcador, sesiones verificadas; todas las comparaciones conservadas.
- Pruebas locales de infraestructura, sesiones y piloto: 15 aprobadas, 0 fallidas,
  omitidas o canceladas. Sin MongoDB externo ni Google en esas pruebas.
- Las 629 generales y 91 integraciones de la fase anterior no se repitieron.
- Evidencia operacional completa en TEMP/ma-piloto-preparacion-QuHKSq:
  before.json, after.json, plan.json, mutations.json, migration.stdout/stderr.
  No contiene valores de secretos ni contenido documental empresarial; solo
  metadatos, hashes de comparación e inventario del esquema nuevo.
- Sin cambios funcionales/estéticos, eliminación de datos, commit ni push.
