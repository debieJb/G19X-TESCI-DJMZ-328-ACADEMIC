# Plataforma Inteligente de Marketing Automation

[Renovación del frontend público, acceso y registro](docs/frontend-publico.md):
pantallas, controles, revisión visual en navegador y resultados de validación local.

Configuración nueva, aún sin envío externo validado:
[Gmail transaccional de plataforma](docs/gmail-transaccional.md). Incluye autorización
OAuth independiente, credencial cifrada, trabajador supervisado de una solicitud y
guía para una prueba real posterior. Login incorpora CSRF y límites persistentes;
index, acceso y registro comparten una interfaz adaptable. El transporte permanece apagado.

MVP con Node.js 24, Express, EJS y MongoDB/Mongoose para automatización de campañas **exclusivamente por correo electrónico**. Incluye empresas, contactos, consentimiento, seguridad, autoservicio, Gmail OAuth, asistencia con IA y métricas. **No está declarado listo ni apto para publicación: falta completar la auditoría de seguridad y las validaciones reales.**

Facebook, WhatsApp y LinkedIn quedan fuera de esta versión por decisión de alcance. No son errores de implementación ni pendientes para aprobar este MVP. Los requisitos multicanal originales de PluriOne se conservan como antecedentes; **su modificación formal no tiene aprobación confirmada**. Los campos, contratos y pruebas negativas heredados no habilitan esos canales.

La fuente documental vigente es [Alcance actual del MVP](docs/alcance-mvp-actual.md), con matriz de implementación, pruebas, validación real y pendientes. No se encontraron PRD ni SDD oficiales identificables en el repositorio; [PRD técnico](docs/PRD-borrador-tecnico.md) y [SDD técnico](docs/SDD-borrador-tecnico.md) son borradores sin aprobación, no sustitutos de documentos oficiales desconocidos.

## Qué está implementado y qué se ha validado

| Área | Implementación | Validación y límite actual |
|---|---|---|
| Campañas email | CRUD, borradores manuales/asistidos y preparación empresarial. | Pruebas de permisos, estados, CSRF y aislamiento. Registrar fechas no acredita un scheduler operativo. |
| Gmail empresarial | OAuth con state de un uso, PKCE, nonce, identidad verificada, cifrado y renovación controlada. | Pruebas con Google simulado; autorización, renovación y revocación reales pendientes. |
| Motor Gmail API | MIME/base64url y POST directo a users/me/messages/send, persistencia por destinatario, idempotencia, cuotas, reservas y estados inciertos. | Gmail **no tiene envíos reales ni recepción validados**. Envío deshabilitado por defecto y piloto no autorizado. |
| Autoservicio | Solicitud, enlace de verificación y solo después configuración del administrador y contraseña; login posterior. | Pruebas unitarias/HTTP y evidencia previa de integración aislada. Proveedor transaccional real pendiente de configurar y autorizar; independiente del Gmail empresarial. |
| Contactos y consentimiento | CRUD propio, registro/revocación con evidencia, autor, fecha e historial; revocación al cambiar email. | Pruebas de concurrencia y aislamiento; no acredita autenticidad de evidencias externas. El historial se pierde si se elimina el contacto. |
| IA | Asistente y adaptador Gemini, privacidad, cuotas, aprobación humana y guardado de borrador. | **Gemini carece de validación real**. Pruebas simuladas no acreditan proveedor, cuotas o calidad real. |
| Métricas | Conteos administrativos de empresas/usuarios/campañas y estados técnicos de envío por destinatario. | **Aperturas, clics y rebotes no están acreditados**. Las métricas siguen vigentes; faltan definición de aceptación e instrumentación/validación correspondiente. |
| Seguridad y sesiones | Roles, aislamiento, CSRF, bcrypt, cifrado y almacén MongoDB persistente para arranque validado. | Pruebas locales; TLS/proxy real, auditoría, rotación, retención y operación aún pendientes. |

## Envío Gmail: camino actual y bloqueos

El motor utiliza **Gmail API directamente**, con la cuenta autorizada de la empresa persistida. No depende de n8n ni delega a un workflow el uso de sus tokens. El remitente debe coincidir con el correo autorizado; no se acepta un From arbitrario del cliente.

La web de preparación exige transporte apagado. Una lista empresarial autorizada por despliegue permite preparar; un administrador activo y verificado debe autorizar explícitamente una campaña y un contacto, con caducidad de diez minutos. Solo se admite selección explícita de **exactamente un contacto**: no todos, etiquetas ni listas múltiples. La autorización se consume atómicamente al reservar y no se repone después de un fallo.

El encolado exige sesión, CSRF, confirmación e idempotencia y no envía correo. Un trabajador separado requiere además habilitación explícita del transporte, destino dedicado e índices válidos. El supervisor recibe **ID_ENVIO**, identificador de EnvioGmail de un destinatario, no de EjecucionGmail. No reinicia ni reintenta automáticamente. Un resultado incierto requiere conciliación. Un Gmail ID o estado aceptado solo acredita aceptación API, no recepción.

El piloto actual admite texto y envío inmediato; programaciones e imágenes no se envían por este motor. La preparación puede guardar esas intenciones o recursos, sin demostrar su ejecución. No se da por aprobado el alcance final de programación por esta limitación del piloto.

Procedimiento y condiciones: [piloto de un correo](docs/piloto-gmail-un-correo.md), [motor Gmail](docs/envios-gmail-mvp.md), [OAuth](docs/gmail-oauth.md) y [sesiones](docs/sesiones-produccion.md). No se proporciona aquí un procedimiento de activación real.

## n8n y compatibilidad histórica

El repositorio conserva configuración de webhooks y el payload histórico de email en services/emailService.js. Ese servicio lanza ENVIOS_BLOQUEADOS antes del fetch: el transporte heredado no está activo. Los endpoints históricos no son una vía alternativa de envío. El motor directo no consume esos webhooks y no requiere un n8n activo.

No se encontraron exports de workflows que acrediten envío empresarial; no se inspeccionó una instancia n8n ni se presume que use OAuth por empresa. Véanse [contrato histórico de redes](docs/redes-sociales.md) y [flujo e historia](docs/flujo-campanas-integrado.md). Los contratos y bloqueos se conservan sin presentar las exclusiones como deuda del MVP.

## Contactos, empresas y permisos

Los contactos requieren nombre y al menos email o teléfono; un teléfono no habilita canales excluidos. Los índices únicos por empresa/email y empresa/teléfono y los filtros empresariales se conservan. Para email se exige contacto activo, canal email explícitamente habilitado, dirección válida y consentimiento documentado no revocado ni futuro. Un campo ausente no concede elegibilidad. El piloto exige además registro verificable de consentimiento ligado al email actual y al autor del registro.

El operador administra recursos permitidos de su empresa y prepara campañas. El administrador gestiona su empresa y su conexión Gmail y es quien autoriza el piloto; el superadmin conserva funciones administrativas globales y no suplanta ese flujo empresarial. Empresa, autor, rol y remitente no se obtienen del cuerpo HTTP. No se transfieren relaciones ni se migran automáticamente registros históricos.

Referencias: [autoservicio](docs/autoservicio-empresarial.md), [seguridad multiempresa](docs/seguridad-multiempresa-etapa1.md) y [asistencia IA](docs/asistente-ia.md). Las referencias de etapas anteriores deben interpretarse con la matriz vigente.

## Arquitectura y ejecución de desarrollo

- appFactory.js construye Express con dependencias de sesión; app.js conserva la entrada compatible de desarrollo.
- server.js es el arranque de desarrollo; configura conexión y escucha. No representa un despliegue aprobado.
- services/motorEnviosGmailService.js coordina la autorización y persistencia; gmailApiTransporteService.js realiza el POST directo.
- services/autoservicioEmpresarialService.js y correoTransaccionalService.js separan registro y correo transaccional del Gmail de campañas.
- services/adminService.js y empresaService.js suministran los conteos de los paneles.
- scripts/iniciarWebPiloto.js valida manifiesto, destino, índices y sesiones persistentes antes de admitir preparación de piloto.

Instalar dependencias mediante npm ci y configurar privadamente las dependencias de desarrollo antes de npm run dev. No versionar credenciales, no sobrescribir archivos privados ni utilizar MongoDB principal para pruebas con escritura. Este documento no autoriza crear usuarios, ejecutar migraciones, conectar cuentas o habilitar proveedores.

MemoryStore sirve solo para desarrollo. El arranque seguro requiere almacén persistente y cookies Secure, HttpOnly y SameSite=Lax; trust proxy solo para IP/CIDR de infraestructura comprobada. No cambiar el entorno para eludir controles.

## Pruebas y evidencia

La suite habitual se ejecuta con npm test o npm.cmd test y usa node:test/Supertest, HTTP local y dobles de persistencia/proveedores. Las integraciones de pruebas-integracion son ejecuciones explícitas separadas: crean fixtures propias en 27018 y requieren sus guardias y autorización correspondiente. No ejecutarlas contra 27017 ni contra el piloto dedicado.

El cierre anterior registró 593 pruebas habituales aprobadas y evidencia previa de 80 integraciones aprobadas; esos números son históricos, no una ejecución nueva de esta revisión. [Resultados de cierre](docs/cierre-tecnico-2026-10-15.md). La persistencia aislada no prueba TLS ni entrega de correo. Los cinco hallazgos históricos clasificados como fixtures no equivalen a una limpieza del historial ni sustituyen una auditoría de seguridad.

27019 quedó inicializado como marketingPilotLocalRs, con PRIMARY y solo bases de sistema confirmados en la jornada anterior. No se aplicaron índices de aplicación. Esto autoriza infraestructura local, no correo real ni producción. No se vuelve a comprobar ni modifica ningún servidor en esta actualización documental.

El [README anterior](docs/historico/readme-anterior-alcance-email.md) se conserva como antecedente íntegro. [Estado vigente e historia](docs/estado-proyecto.md).
