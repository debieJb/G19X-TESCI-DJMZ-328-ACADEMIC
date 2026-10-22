> **Antecedente histórico.** Texto del corte funcional `78c7434`, conservado para trazabilidad. Sus afirmaciones de estado y pendientes no describen la entrega documental actual. Consulte el [índice vigente](../../entrega/indice-entrega.md). Las rutas de enlaces se adaptaron a esta ubicación.

# Estado vigente del proyecto y antecedentes

Referencia vigente: [alcance del MVP](../../alcance-mvp-actual.md). Esta actualizacion describe el codigo y las pruebas existentes, sin modificar ni revalidar configuracion privada o datos. No declara listo el MVP ni apto para publicacion: auditoria de seguridad y validaciones reales pendientes.

## Estado vigente de alcance e implementacion

- MVP exclusivamente de campanas email. Facebook, WhatsApp y LinkedIn quedan fuera por decision de alcance, no por error ni deuda de aceptacion. Aprobacion formal de modificar requisitos multicanal originales de PluriOne: no confirmada.
- IA, metricas, seguridad, contactos, empresas y Gmail permanecen vigentes. No se encontraron PRD/SDD oficiales identificables; los nuevos borradores tecnicos no sustituyen documentos desconocidos.
- Gmail API directo ya tiene motor por destinatario, idempotencia, cuotas, autorizacion temporal de un intento y estados inciertos. No necesita n8n y no hay envios reales ni recepcion validados.
- OAuth empresarial esta implementado y probado con Google simulado; autorizacion/renovacion/revocacion reales no acreditadas. No se inspeccionaron credenciales en esta actualizacion.
- Autoservicio y CRUD de consentimiento estan implementados. Proveedor transaccional real, autenticidad de evidencia y retencion pendientes. El correo de registro es independiente del Gmail empresarial.
- Gemini carece de validacion real. Contadores administrativos y estados de envio existen; aperturas, clics y rebotes no acreditados. Metricas siguen siendo requisito vigente.
- Sesiones persistentes implementadas y probadas en fixtures; HTTPS/proxy real y auditoria pendientes. La evidencia anterior de 27019 PRIMARY acredita solo infraestructura inicial, no indices, OAuth ni permiso de envio.

## Validacion y siguientes verificaciones

El cierre anterior registro 593 pruebas habituales aprobadas; las 80 integraciones previas son evidencia separada. No se suman otra vez ni prueban proveedores reales. Esta revision solo cambia documentacion, mensajes y expectativas de texto; su resultado se informa en [revision de alcance](../../revision-alcance-mvp.md).

Pendientes: auditoria de seguridad; documentos oficiales y aprobacion formal; criterios de IA/metricas/programacion; despliegue dedicado e indices; HTTPS/sesiones; proveedores autorizados y pruebas reales independientes. Redes excluidas no forman parte de esta lista.

---

## Registro historico conservado literalmente: cierre del 14 de octubre

Las afirmaciones y pasos siguientes pertenecen a su fase original. No son instrucciones vigentes para conectar servicios, publicar o repetir rotaciones. Los pendientes de motor, consentimiento y sesiones fueron parcialmente implementados despues; sus validaciones reales siguen separadas.

# Estado del proyecto al cierre de sesión

Fecha: 14 de octubre de 2026.

## Funcionalidades implementadas

- Aislamiento empresarial de contactos, campañas y destinatarios, con comprobación de pertenencia y estado activo para las ejecuciones empresariales.
- Compatibilidad con campañas históricas sin empresa; las nuevas ejecuciones empresariales requieren una empresa válida.
- Validación de webhooks y política explícita de canales.email: el indicador no acredita consentimiento de marketing.
- Configuración Gmail por empresa en el panel EJS: conexión OAuth, consulta, renovación y desconexión, con controles de permisos y aislamiento.
- OAuth con estado de un solo uso, PKCE, validación de identidad y tokens cifrados mediante AES-256-GCM. Control de concurrencia para renovación y desconexión.
- Herramientas locales de rotación con entrada de contraseña oculta, comprobaciones previas, escrituras condicionadas y recuperación cifrada fuera de Git.

## Validación

363 pruebas automatizadas aprobadas, sin fallos. Cubren aislamiento, empresas inactivas, webhooks, OAuth, cifrado, transporte, firmas y rotación de credenciales. Las pruebas no acreditan una autorización real de Google ni un envío real.

## Google OAuth y seguridad

Configuración local OAuth: CONFIGURADO. Primera autorización real por empresa: PENDIENTE.

SESSION_SECRET, SUPERADMIN_PASSWORD y GMAIL_TOKEN_ENCRYPTION_KEY: CONFIGURADO tras la rotación autorizada. La contraseña persistida se sincronizó con la configuración local. Antes de rotar se comprobaron cero tokens cifrados y cero autorizaciones OAuth vigentes pendientes. Se reinició Express para invalidar las sesiones anteriores de desarrollo.

.env está excluido de Git y no se incluye en el commit. No se documentan valores privados, tokens ni hashes. No hubo envíos reales ni modificaciones de workflows n8n. No se realiza push al cerrar esta sesión.

## Trabajo pendiente y continuación

1. Iniciar Express con `npm run dev`, iniciar sesión nuevamente y realizar la primera autorización real de Gmail desde el administrador de una empresa de prueba. Verificar identidad, estado, renovación y desconexión.
2. Diseñar y completar la integración del envío con las conexiones empresariales. El servicio actual de campañas coordina el webhook; la conexión OAuth implementada todavía no demuestra que n8n use los tokens de cada empresa.
3. Preparar pruebas controladas de múltiples destinatarios con autorización explícita para los envíos, comprobar límites, errores parciales, reintentos e idempotencia.
4. Implementar o completar el historial de automatizaciones y resultados por destinatario. La programación y el envío Gmail real siguen pendientes.
5. Revisar las dependencias con una auditoría actualizada antes de desplegar y definir almacenamiento persistente seguro de sesiones para producción.
6. Revisar el commit local y sincronizar con GitHub mañana, únicamente con autorización. No importar ni modificar workflows activos sin revisar previamente la integración.

## Cierre operativo

Los archivos del proyecto se guardan en disco. Solo se detienen procesos atribuibles al proyecto; MongoDB y cualquier proceso n8n cuya pertenencia no pueda demostrarse permanecen intactos. No se eliminan bases, workflows, sesiones n8n ni archivos. El resultado preciso del commit y de los procesos se informa al finalizar el cierre.
