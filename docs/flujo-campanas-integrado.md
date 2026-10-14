# Flujo integrado de campañas · PluriOne

## Navegación disponible

1. Iniciar Express con `npm.cmd run dev`, entrar como admin_empresa u operador de su empresa y abrir `/campanas/nueva`.
2. Elegir creación manual, que conserva el formulario actual, o creación asistida, que abre `/empresa/ia`.
3. Introducir instrucciones libres en «¿Qué campaña quieres crear?», con preferencias opcionales, indicaciones adicionales y texto intocable. Confirmar la advertencia de privacidad antes de remitir el texto a Gemini. La imagen permanece local y también puede añadirse después de aprobar. Véase [flujo conversacional](ia-instrucciones-libres.md).
4. Con Gemini real habilitado, generar una propuesta editable. Si falta configuración se informa y no se sustituye por plantillas.
5. Generar otra propuesta consume nuevamente las cuotas persistentes. Se mantienen las selecciones y la imagen; solo se reemplaza el ticket tras una generación exitosa. Una propuesta anterior queda invalidada al regenerar con éxito.
6. Me gusta / Usar esta propuesta guarda un borrador propio con contenido editado, notas de segmentación e imagen local, sin destinatarios preseleccionados. No activa la campaña, no envía ni programa mensajes. Se abre `/campanas/:id/automatizacion`.
7. Revisar contenido y la comparación local entre correo previsto y Gmail autorizado; volver a editar el borrador si hace falta. Seleccionar contactos propios con consentimiento documentado y modalidad deseada inmediata o programada, con fecha UTC futura.
8. Guardar preparación mantiene estado borrador y guarda solo intención y selección. El botón de envío real y su confirmación están deshabilitados. Los POST directos de confirmación tampoco ejecutan nada: sin confirmación responden 422; con ella, 503 por integración pendiente.

El botón Configurar automatización también está en el detalle y en el panel empresarial para borradores manuales. La configuración exige empresa activa, usuario no pendiente/bloqueado y permisos de edición. El superadmin no utiliza este flujo empresarial; mantiene sus herramientas administrativas existentes.

## Seguridad y persistencia

- CSRF de campañas para las escrituras empresariales, además de los CSRF separados del superadmin y de IA. Todos los formularios afectados incluyen el token. Se protegen también variantes de mayúsculas admitidas por Express.
- Empresa y autor se fijan desde el servidor; los campos del cliente no pueden sustituirlos. Se consulta el estado persistido.
- Se preserva `asistenciaIA` con las selecciones originales y notas; los modelos/controladores existentes guardan el texto de la campaña. Las sugerencias no autorizan contactos.
- Un hash del ticket y un índice único parcial por empresa impiden dos borradores para la misma aprobación. No se guarda el ticket recuperable. La comprobación exige el índice antes de aprobar.
- La configuración de automatización usa una revisión y guardado condicionado por empresa/revisión; una actualización concurrente devuelve 409. No crea ejecuciones ni tareas de envío duplicadas.
- `consentimientoMarketing` es opcional en Contacto para compatibilidad. La pantalla solo admite registros activos, email habilitado y consentimiento otorgado con fecha válida no futura y fuente documentada. Ausencia o revocación excluyen el contacto. Se deduplica por correo normalizado y se comprueba de nuevo al guardar. No se asigna consentimiento a datos existentes ni se implementa aquí su captura en el CRUD de contactos.
- La nueva campaña lleva `versionFlujo: 2` y no puede usar el endpoint histórico como atajo de envío. El servicio email también lo rechaza. La edición ordinaria no permite borrar esta marca desde el body.

## Recursos opcionales

Solo un PNG local: máximo 48 KiB, dimensiones hasta 1024 × 1024, 8 bits, sin paleta, entrelazado, animación o metadatos arbitrarios. Se validan base64 canónico, firma, chunks/CRC y descompresión acotada. No se aceptan SVG, PDF, ejecutables ni rutas del cliente. Sin JavaScript la carga opcional queda deshabilitada.

El archivo se guarda como Buffer del borrador, oculto en consultas habituales. La lectura `/campanas/:id/imagen` exige la misma autorización empresarial, valida otra vez el PNG y usa Content-Type fijo, nosniff, no-store y CSP sandbox. La imagen no se envía a Gemini ni al webhook histórico y todavía no se incorpora a un correo.

## Gmail, n8n y límites reales

La pantalla muestra únicamente email/estado/scopes de la conexión propia y configuración disponible; no devuelve tokens, no los renueva contra Google ni asegura que sigan vigentes. No hay workflows exportados de n8n en el repositorio que acrediten el envío empresarial. El servicio existente publica un payload al webhook, pero no integra todavía los tokens OAuth por empresa.

Por ello el flujo nuevo bloquea siempre envío y programación efectiva, incluso si la cuenta aparece conectada. No existe una variable que habilite por sí sola un motor no implementado. Quedan pendientes el sender Gmail API, la autorización interna de ejecución, coordinación autenticada con n8n sin tokens, scheduler, reintentos y estados inciertos por destinatario, revisión final del consentimiento y cuotas del proveedor.

Las campañas históricas conservan consulta y edición sin migraciones, pero todas sus ejecuciones están bloqueadas en servidor, incluso con confirmación explícita, CSRF y permisos válidos. Ninguna campaña nueva o histórica puede realizar envíos mientras esté vigente el bloqueo universal. No se activó ni probó ningún workflow real.

## Validación e incidencia de infraestructura

- `npm.cmd test`: 463/463 aprobadas, incluidas las 435 anteriores y 28 nuevas; se adaptaron expectativas de creación y del contrato histórico para exigir confirmación y bloqueo de las campañas nuevas. Un recorrido HTTP unido verifica crear, regenerar, aprobar, abrir automatización y volver al editor sobre el mismo borrador.
- Se añadió `pruebas-integracion/campanasFlujo.js` para validar realmente unicidad de aprobación y persistencia de imagen; se intentó ejecutar junto con las 14 pruebas del registro.
- Las 16 pruebas reales quedaron bloqueadas en el hook previo por `ORIGINAL_CAMBIO_DETECTADO`, antes de crear bases o fixtures. No se presenta esa ejecución como aprobada.
- La revisión de solo lectura confirmó mismo PID, configuración y huella de datos del standalone; cambió la huella de índices. El índice nuevo de aprobación IA está presente allí, compatible con creación automática por una instancia de la aplicación conectada durante una recarga de Mongoose.
- Se deshabilitó autoIndex/autoCreate de Campana para impedir nuevas provisiones automáticas. No se eliminó ningún índice ni se sobrescribió `original-baseline.json`. Antes de repetir integración debe revisarse y autorizarse cómo reconciliar esa referencia histórica; no se debe desactivar la guardia para forzar pruebas verdes.
- El replica set de desarrollo sigue identificado como marketingDevRs PRIMARY en 27018. No se migraron registros, no se modificaron credenciales/.env, no se enviaron correos ni se activaron workflows. Sin commit ni push.

La habilitación posterior requiere provisionar índices únicamente en el destino aprobado y confirmar una clave/modelo Gemini gratuitos autorizados, tal como documenta `docs/asistente-ia.md`. La generación real continúa deshabilitada en la configuración revisada.
