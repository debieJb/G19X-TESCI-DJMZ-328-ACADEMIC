# CSRF del superadministrador

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Las sesiones cuyo usuario persistido tiene rol `superadmin` requieren un token CSRF para todas las solicitudes de escritura de la aplicación. Se protegen las altas de empresas y usuarios, la edición de automatizaciones, las altas/ediciones/eliminaciones de campañas y contactos, la ejecución de campañas y el cierre de sesión. PUT, PATCH y DELETE también requieren token aunque actualmente no existan rutas administrativas con esos métodos.

La comprobación se ejecuta después de cargar el usuario desde la base y antes de los controladores. No sustituye los controles de rol ni de pertenencia empresarial. Las empresas y usuarios actualmente no tienen rutas de edición o eliminación; cualquier futura escritura del superadministrador pasa por el mismo control global. Los GET existentes solo muestran formularios o consultan datos.

Se reutiliza el generador y comparador del módulo Gmail mediante `middlewares/csrf.js`. Los tokens de Gmail y superadmin tienen campos de sesión diferentes. Se generan con 32 bytes aleatorios, se validan como ASCII de longitud fija y se comparan en tiempo constante. Los formularios envían `_csrf`; los clientes del superadministrador pueden usar `X-CSRF-Token`. No se aceptan tokens en la URL y un campo `_csrf` inválido no se compensa con una cabecera válida. Las respuestas del superadministrador usan `no-store`.

El token se conserva durante la sesión y cambia al regenerarla con el login. Un formulario abierto antes de cerrar sesión o reiniciar Express debe recargarse. El login conserva su comportamiento existente y queda fuera de esta protección del panel. Los demás roles mantienen su comportamiento anterior; Gmail conserva su CSRF propio.

Las pruebas usan sesiones reales en memoria y persistencia simulada. No conectan MongoDB ni necesitan leer .env o contactar a Google.
