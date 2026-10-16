# Revisión documental y de mensajes del alcance MVP

La revisión aplica el alcance email solicitado usando código, pruebas y documentos existentes. No concede aprobación formal de PluriOne, no declara el MVP listo ni apto para publicación y no sustituye auditoría de seguridad. No se leyó ni modificó ningún archivo de entorno; el cambio local preexistente de .env.example se conservó sin tocar.

## Cambios y conservación

- README vigente: motor Gmail API directo, OAuth por empresa, autoservicio, consentimiento, IA, métricas y validación real diferenciados.
- Referencia central: alcance-mvp-actual.md con matriz requisito/implementación/pruebas/validación real/pendiente. IA y métricas no se excluyen por carecer de validación.
- PRD-borrador-tecnico.md y SDD-borrador-tecnico.md: estructuras nuevas explícitamente sin aprobación. No se encontraron PRD/SDD oficiales identificables en el repositorio previo; su existencia fuera del repositorio no está confirmada.
- estado-proyecto.md, flujo-campanas-integrado.md y redes-sociales.md conservan íntegros sus textos anteriores bajo avisos históricos y explicaciones del estado vigente.
- historico/readme-anterior-alcance-email.md conserva íntegro el README anterior, sin convertir sus instrucciones o planes superados en compromisos actuales.
- Mensajes de canales excluidos ahora indican fuera del MVP actual, sin prometer conexión futura. La portada, formulario y errores no presentan n8n como transporte necesario de Gmail.
- n8n queda documentado como contrato heredado bloqueado antes de fetch. Se conservan servicios, modelos, enums, errores históricos, contratos y pruebas negativas. Solo se ajustan expectativas de texto afectadas; no se habilitan rutas ni transportes.

## Validación de esta actualización

Resultado de pruebas y git diff --check pendiente de completar al finalizar la revisión. Las pruebas ejecutadas son de la suite habitual con proveedores/persistencia simulados y HTTP local, sin operaciones contra datos empresariales. No se ejecutan integraciones MongoDB, migraciones, inicializaciones, envíos ni Gemini reales.

Las pruebas negativas siguen acreditando rechazo de canales excluidos, ausencia de peticiones externas y de fallback a email. El cambio de vocabulario no elimina esos controles ni altera los códigos de contrato históricos.

## Contradicciones históricas y pendientes verificables

- Las frases antiguas de n8n como transporte, sender no implementado, consentimiento sin captura y sesiones solo en memoria se conservan como antecedentes identificados; los encabezados actuales y la matriz prevalecen para interpretar el código vigente.
- Facebook, WhatsApp y LinkedIn están fuera del MVP por decisión de alcance. La modificación formal de la base multicanal original de PluriOne sigue sin aprobación confirmada; solicitar documentación oficial y evidencia formal antes de atribuirla.
- Gmail no tiene envíos reales ni recepción validados; OAuth real y proveedor transaccional requieren autorización y comprobación separadas.
- Gemini carece de validación real. Definir y comprobar calidad, privacidad, cuotas y criterio de aceptación sin inferirlos de respuestas simuladas.
- Aperturas, clics y rebotes no acreditados. Definir eventos, atribución, denominadores, privacidad e instrumentación; no confundir conteos o aceptado API con resultados de marketing.
- La interfaz puede registrar fechas/imagen, pero el piloto directo solo admite texto e inmediato. Falta acordar aceptación de programación y recursos; esta revisión no los elimina unilateralmente del producto.
- Completar auditoría de seguridad y revisión de sesiones, consentimiento/retención, TLS/proxy, índices y operación antes de declarar listo/publicar.
- 27019 tiene evidencia anterior de PRIMARY e inventario solo de sistema, sin índices de aplicación ni autorización de correo. No se consultó ni alteró MongoDB en esta actualización.

## Archivos de esta revisión

Inventario de 26 archivos de esta revision (se excluye .env.example, cambio local anterior que no se toco):

- README.md
- controllers/automatizacionCampanaController.js
- controllers/campanaController.js
- docs/PRD-borrador-tecnico.md
- docs/SDD-borrador-tecnico.md
- docs/alcance-mvp-actual.md
- docs/estado-proyecto.md
- docs/flujo-campanas-integrado.md
- docs/historico/readme-anterior-alcance-email.md
- docs/redes-sociales.md
- docs/revision-alcance-mvp.md
- services/automatizacionService.js
- services/preparacionAutomatizacionService.js
- services/redesSocialesService.js
- services/whatsappService.js
- tests/automatizacion.preparacion.http.test.js
- tests/campanas.http.test.js
- tests/gmail.interfaz.test.js
- views/admin/automatizacionesEditar.ejs
- views/admin/dashboard.ejs
- views/admin/empresaDetalle.ejs
- views/campanas/_formulario.ejs
- views/campanas/detalle.ejs
- views/campanas/index.ejs
- views/empresa/_campanas.ejs
- views/index.ejs

 No se realiza commit, push ni modificación del historial. Ninguna aprobación de infraestructura se interpreta como aprobación del piloto o de publicación.
