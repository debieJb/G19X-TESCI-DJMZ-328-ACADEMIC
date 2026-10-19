> **Antecedente histórico.** Texto del corte funcional `78c7434`, conservado para trazabilidad. Sus afirmaciones de estado y pendientes no describen la entrega documental actual. Consulte el [índice vigente](../../entrega/indice-entrega.md). Las rutas de enlaces se adaptaron a esta ubicación.

# Alcance actual del MVP de Marketing Automation

Estado: referencia técnica vigente según la instrucción de alcance y el repositorio revisado. No es un acta de aprobación formal de PluriOne ni declara el MVP listo para publicación.

## Decisión de alcance y trazabilidad

El MVP se centra exclusivamente en automatización de campañas por correo electrónico. Facebook, WhatsApp y LinkedIn quedan fuera de esta versión por decisión de alcance. No son defectos ni requisitos pendientes para aprobar este MVP. Su ausencia no debe incrementar una lista de incidencias funcionales del MVP.

Los requisitos multicanal originales de PluriOne son un antecedente distinto. No se encontró evidencia local de aprobación formal de su modificación; ese estado es **no confirmado**. No se inventan responsables, fechas de aprobación, identificadores originales ni condiciones contractuales. La instrucción de alcance de esta revisión se aplica al MVP, sin atribuirle aprobación de un documento oficial desconocido.

Se revisaron nombres de archivos versionados y documentación del repositorio: no se encontraron PRD ni SDD oficiales identificables ni una especificación oficial independiente del MVP. [PRD](../../PRD-borrador-tecnico.md) y [SDD](../../SDD-borrador-tecnico.md) son estructuras técnicas propuestas sin aprobación. No se puede confirmar si existen documentos oficiales fuera del repositorio.

## Matriz vigente

Implementado significa que existe código; probado indica el tipo de evidencia, no disponibilidad real. Los resultados anteriores no se presentan como pruebas ejecutadas en esta actualización.

| Requisito vigente | Estado de implementación | Evidencia de pruebas existente | Validación real | Pendiente verificable |
|---|---|---|---|---|
| Empresas, roles y aislamiento | Modelos, paneles, controles de acceso y filtros persistidos. | tests/admin.http.test.js, admin.service.test.js, empresa.http.test.js, seguridadMultiempresa.* | Pruebas de integración previas con datos sintéticos propios; no auditoría productiva. | Auditoría de seguridad, revisión de permisos y despliegue aislado. |
| Autoservicio empresarial | Reserva, verificación de correo y solo después creación/configuración del administrador; transacciones e idempotencia. | tests/autoservicio.* y pruebas-integracion/autoservicioEmpresarial.js. | MongoDB aislado probado previamente; correo transaccional simulado. | Proveedor transaccional explícitamente autorizado y prueba real de solicitud/verificación/login. |
| Contactos y consentimiento | CRUD, historial, autor y fecha, revocación y vinculación al email; CSRF y control de concurrencia. | tests/contactos.http.test.js, contactos.aislamiento.test.js; integración previa del CRUD. | Persistencia aislada previa; evidencia externa no autenticada por el software. | Revisar consentimiento real, retención y archivo: borrar el contacto elimina su historial. |
| Creación y preparación de campañas email | Borradores manuales/IA, selección, revisiones y preparación sin envío. | tests/campanas.http.test.js, automatizacion.preparacion.http.test.js y campanas.regresion.test.js. | Recorrido HTTP probado; no demuestra envío programado ni imagen enviada. | Definir aceptación de programación/recursos; no anunciar ejecución por guardar fechas. |
| OAuth Gmail por empresa | State de un uso, PKCE/nonce, scopes, identidad, cifrado y renovación controlada. | tests/gmail.oauth.* y gmail.flujo.test.js con Google simulado. | Autorización, renovación y revocación reales no validadas. | Cliente y cuentas de prueba autorizados, callback HTTPS y prueba controlada independiente. |
| Envío Gmail API directo | Motor persistente por destinatario, MIME, idempotencia, cuotas, exclusión y estados inciertos; autorización temporal de un intento. | tests/gmail.envio.*, pilotoGmail.unit.test.js y pruebas-integracion/enviosGmail.js con Gmail simulado. | **No hay envíos reales ni recepción validados**. | Destino/índices/sesiones/HTTPS, permisos y consentimiento; autorización explícita del único mensaje y verificación de recepción. |
| IA vigente | Asistente, Gemini REST, privacidad, cuotas, revisión humana y borrador. | tests/ia.* y pruebas de flujo; proveedor interceptado/simulado. | **Gemini carece de validación real**. | Revisar seguridad, backend de cuotas y autorización; prueba real no sensible y evaluación de calidad. |
| Métricas vigentes | Conteos administrativos y estados técnicos de envío por destinatario. | tests/admin.service.test.js, admin.http.test.js, empresa.http.test.js y gmail.envio.* | **Aperturas, clics y rebotes no acreditados**; tampoco tasas de entrega. | Definir catálogo/denominadores/eventos, atribución, privacidad y criterios de aceptación; verificar instrumentación y datos reales autorizados. |
| Seguridad y sesiones | CSRF, roles, aislamiento, bcrypt, cifrado, almacén MongoDB y proxy explícito. | tests/session.config.test.js, infraGmail.test.js; persistencia previa en pruebas-integracion/infraGmail.js. | Sesiones reales en fixtures; HTTPS simulado. Auditoría integral pendiente. | Auditar seguridad antes de declarar listo o publicar; TLS real, rotación, retención y operación. |
| Infraestructura del piloto local | 27019 inicializado como marketingPilotLocalRs; entradas separadas de web, supervisor y migración explícita. | Pruebas de infraestructura, DDL simulado y comprobaciones anteriores documentadas. | PRIMARY real y bases admin/config/local confirmados en la jornada anterior; no comprobados otra vez en esta edición. | Migración dedicada no aplicada; no usar marketingDevRs como producción ni inferir autorización de envío. |

Los archivos de pruebas concretos se pueden localizar en el repositorio; si cambia su nombre, actualizar la referencia sin atribuir resultados nuevos. La matriz no modifica las autorizaciones de ejecución.

## Exclusiones y compatibilidad

| Elemento | Clasificación | Tratamiento |
|---|---|---|
| Facebook, WhatsApp y LinkedIn | Fuera del MVP actual. | No exigir integraciones ni credenciales de estos servicios para aceptarlo. |
| Enums, campos y campañas de otros canales | Compatibilidad histórica, no habilitación. | Conservar consulta, datos, modelos, contratos y bloqueos; no migrarlos ni eliminarlos. |
| Pruebas negativas de canales | Protección de alcance y seguridad. | Conservar rechazo por HTTP y llamadas directas, ausencia de peticiones y ausencia de redirección a email. |
| n8n | Contrato histórico conservado; no transporte obligatorio actual. | emailService.js bloquea antes del fetch; el motor Gmail API no depende de ese servicio. No acreditar workflows no disponibles ni activar una instancia. |

La programación efectiva no está habilitada en el piloto de un correo; esto es una limitación implementada, no una decisión adicional de excluirla de todo requisito de producto sin revisión. La autorización actual solo admite texto e inmediato, exactamente un contacto explícito y diez minutos de vigencia.

## Criterios de cierre aún no acreditados

- [ ] Completar auditoría de seguridad y resolver sus resultados antes de declarar listo o publicar.
- [ ] Incorporar PRD/SDD oficiales si existen y confirmar formalmente los cambios sobre la base multicanal original de PluriOne.
- [ ] Acordar criterios de aceptación medibles para IA, métricas y programación; no retirar esos requisitos por falta de validación.
- [ ] Validar proveedor transaccional, Gmail OAuth, envío/recepción y Gemini mediante tareas y autorizaciones separadas.
- [ ] Distinguir Gmail aceptado de recepción, rebote o lectura; no inferir estos eventos de un ID.
- [ ] Verificar HTTPS, sesiones, índices, retención, backups y operación de infraestructura dedicada.

## Fuentes y antecedentes

[README](../../../README.md), [motor Gmail](../../envios-gmail-mvp.md), [piloto](../../piloto-gmail-un-correo.md), [autoservicio](../../autoservicio-empresarial.md), [IA](../../asistente-ia.md), [sesiones](../../sesiones-produccion.md), [cierre anterior](../../cierre-tecnico-2026-10-15.md). Los informes de etapas anteriores y el [contrato social histórico](../../redes-sociales.md) se conservan; sus planes no se convierten automáticamente en pendientes vigentes.
