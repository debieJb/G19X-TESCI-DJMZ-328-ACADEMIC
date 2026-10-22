# Consolidación del aislamiento empresarial

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


## Ejecución

La resolución del webhook comprueba permisos antes de consultar la empresa. Para campañas con empresa utiliza el identificador persistido y consulta su estado actual junto con la configuración de email. Una empresa inactiva produce `EMPRESA_INACTIVA` y HTTP 422, incluido superadmin, sin solicitar el webhook. Referencias malformadas, empresas inexistentes y estados inválidos producen un error de configuración sin fallback. No se usa el estado de la sesión o del formulario.

Las empresas antiguas sin estado conservan el valor histórico predeterminado `activa`. La desactivación impide nuevas solicitudes; no cancela solicitudes ya aceptadas por n8n. Una desactivación concurrente después de la consulta de autorización requiere controles de ejecución persistente en una etapa posterior.

Se mantienen los permisos de consulta y mantenimiento de datos de empresas inactivas. No se agrega bloqueo general de sesión o CRUD.

## Pertenencia e históricos

Los filtros existentes de empresa y los filtros BSON de guardado se conservan. La normalización de referencias admite ObjectId, texto hexadecimal y documentos poblados; no convierte objetos arbitrarios u operadores MongoDB en identificadores.

Empresa y autor de una campaña son inmutables una vez asignados en las operaciones habituales de Mongoose. Las relaciones siguen siendo opcionales para validar y guardar documentos históricos. Un documento histórico sin relación puede completarla explícitamente desde código autorizado una sola vez; las rutas HTTP no aceptan esa asignación al editar. No se realiza ninguna asignación ni migración automática. La creación HTTP sigue exigiendo empresa; no se endurece el esquema de borradores históricos como si fueran nuevas ejecuciones.

La resolución global de webhook sigue disponible únicamente para superadmin en documentos sin empresa, por compatibilidad del servicio. Eso no habilita el envío: la ejecución de email exige una selección de destinatarios de una empresa válida. No se modifica el payload ni se agrega empresa, credenciales o configuración al mismo.

La protección del modelo no sustituye los filtros de acceso; el acceso directo a `collection`, reemplazos, pipelines u opciones de Mongoose que omiten inmutabilidad deben quedar fuera de los flujos empresariales. Las rutas actuales no utilizan esas vías para transferir pertenencia.

## Política de canales.email

- `true`: habilitación técnica para participar en una selección empresarial, siempre con contacto activo y dirección válida.
- `false`: excluir del envío y de su estimación, aunque el contacto esté seleccionado explícitamente.
- Campo ausente: conservar elegibilidad histórica, sin rellenar el campo ni migrar datos. La resolución y las opciones usan `lean()` para no introducir el default del modelo.
- Valor presente distinto de un booleano: excluir por seguridad.

Los contactos nuevos conservan su default `false`; deben habilitarse expresamente para participar en envíos. Editar un contacto antiguo con la casilla desmarcada persiste `false` y lo excluye en adelante. La política no registra ni demuestra consentimiento de marketing. Cualquier política futura de consentimiento exige un diseño separado y una decisión explícita de producto.

## Webhooks

El esquema y los servicios comparten validación de formato: URL HTTP/HTTPS absoluta, hostname presente, sin credenciales embebidas, fragmentos, espacios, controles o barras invertidas. La cadena vacía empresarial conserva el fallback global. Una URL empresarial inválida nunca recurre al global. Se conserva `redirect: manual`, timeout y ausencia de reintentos.

En desarrollo se mantiene HTTP y URLs locales para n8n y pruebas. En producción se exige HTTPS y un origen autorizado:

- Si está definida `N8N_WEBHOOK_ORIGENES_PERMITIDOS`, se aplica exclusivamente esa lista de orígenes separados por comas. Ejemplo sin secretos: `https://n8n.example.test,https://n8n-empresa.example.test:8443`.
- Si la variable está ausente, solo se autoriza el origen de la URL global administrada `N8N_WEBHOOK_URL`.
- La lista admite solo orígenes, sin rutas, consultas, credenciales o comodines. El protocolo, hostname y puerto deben coincidir exactamente. Una lista vacía o malformada bloquea la operación.
- Puede activarse la lista también en desarrollo. No se modifica `.env` ni la configuración desplegada.

La validación del modelo es de formato y no depende del entorno: editar otros campos no invalida automáticamente documentos históricos por una lista de despliegue nueva. El editor de automatizaciones y la ejecución sí aplican la política del entorno.

Esta lista delimita destinos de confianza; no valida la resolución DNS ni fija direcciones IP. Los orígenes autorizados deben ser controlados por el administrador y protegidos mediante restricciones de salida de red. No se agrega autenticación al workflow activo: su coordinación autenticada se aborda en una etapa posterior.

Antes de desplegar deben confirmarse los orígenes autorizados y si n8n dispone de HTTPS. No se ha inspeccionado la instancia desplegada. La configuración de sesiones existente sigue bloqueando el arranque en producción hasta implementar un almacén persistente en su etapa correspondiente.

## Validación

Las pruebas existentes se conservan. Las pruebas nuevas cubren bloqueo por estado persistido para los tres roles, compatibilidad histórica, referencias malformadas, permisos, inmutabilidad de relaciones con save y consultas, habilitación de email, estimación, editor de webhooks y listas de orígenes. No cargan `.env`, no conectan MongoDB real y no envían correo ni modifican n8n.
