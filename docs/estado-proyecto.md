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
