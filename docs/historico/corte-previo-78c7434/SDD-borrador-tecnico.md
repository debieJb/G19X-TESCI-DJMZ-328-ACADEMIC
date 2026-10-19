> **Antecedente histórico.** Texto del corte funcional `78c7434`, conservado para trazabilidad. Sus afirmaciones de estado y pendientes no describen la entrega documental actual. Consulte el [índice vigente](../../entrega/indice-entrega.md). Las rutas de enlaces se adaptaron a esta ubicación.

# SDD - BORRADOR TÉCNICO SIN APROBACIÓN

No se encontró un SDD oficial identificable en el repositorio. Diseño descriptivo del código actual, sujeto a revisión; no reemplaza documentos oficiales desconocidos ni acredita aprobación formal de PluriOne. Usar con el [PRD de borrador](../../PRD-borrador-tecnico.md) y el [alcance vigente](../../alcance-mvp-actual.md).

## Componentes observados

| Componente | Código de referencia | Responsabilidad y límite |
|---|---|---|
| Web | appFactory.js, routes, controllers y views | Express/EJS, autenticación y CSRF. app.js conserva compatibilidad de desarrollo. |
| Multiempresa | services/permisos.js y servicios de acceso; Empresa/Usuario/Contacto/Campana | Identidad persistida, filtros de empresa y relaciones protegidas. |
| Autoservicio | autoservicioEmpresarialService.js, registroPublicoRoutes.js | Reserva/verificación/configuración transaccional; tokens de un uso mediante hash. |
| Correo transaccional | correoTransaccionalService.js | Proveedor independiente del Gmail de cada empresa, deshabilitado sin configuración/autorización. |
| OAuth | gmailOAuthService.js, googleOAuthClienteService.js, ConexionGmail/EstadoOAuth | Identidad, cifrado y renovación controlada. Sin autorización real acreditada. |
| Motor directo | motorEnviosGmailService.js, gmailMimeService.js, gmailApiTransporteService.js | MIME/base64url y Gmail API; no usa n8n como transporte. |
| Ejecución | AutorizacionPilotoGmail, EjecucionGmail, EnvioGmail y ControlEnvioGmail | Permiso de diez minutos, único destinatario/intento, idempotencia y reservas transaccionales. |
| Consentimiento | consentimientoContactoService.js y elegibilidadEmailService.js | Evidencia, autor, historial y revocación; el historial embebido no es un archivo externo inmutable. |
| Sesiones e infraestructura | mongoSessionStore.js, aplicacionPilotoService.js y scripts del piloto | Almacén cifrado, manifiesto, destino e índices; DDL separado y explícito. |
| IA | services/ia, iaController.js y vistas de IA | Generación asistida, privacidad y revisión humana; Gemini real pendiente. |
| Métricas | adminService.js, empresaService.js y estados EnvioGmail | Conteos y resultados técnicos; no acredita aperturas/clics/rebotes. |
| Histórico n8n/social | emailService.js, redesSocialesService.js, whatsappService.js | Contratos y datos conservados con bloqueos. No constituyen canales del MVP ni transportes activos. |

## Flujo y decisiones observadas

La web de piloto valida destino e índices y usa sesiones persistentes con transporte apagado. La lista empresarial por despliegue permite preparación; administrador persistido autoriza campaña/contacto/contenido/consentimiento. Encolado HTTP exige CSRF, confirmación e idempotencia. El trabajador exige habilitación adicional, consume permiso con la reserva y revalida antes de la llamada Gmail. La llamada externa queda fuera de la transacción: un resultado ambiguo no se reintenta. Gmail aceptado no equivale a recibido.

Modelos y enums históricos se conservan. Solo email está disponible para campañas actuales; las llamadas directas o HTTP de canales excluidos permanecen bloqueadas. Los códigos históricos de error no se reinterpretan como obligaciones de implementar integraciones.

## Despliegue y validación pendientes

La jornada anterior acreditó marketingPilotLocalRs en 27019 como PRIMARY, un miembro local y solo bases de sistema. No se aplicó migración ni se autorizaron correos. El replica set de fixtures 27018 no es producción. Sesiones persistentes se probaron en fixtures; TLS/proxy se simularon. No hay validación real de Gmail/Gemini ni instrumentación acreditada de aperturas/clics/rebotes.

Por revisar: modelo de amenazas y auditoría integral, TLS y proxy real, permisos de MongoDB, rotación y retención, respaldo/restauración, cuotas y supervisión, catálogo de eventos/métricas, scheduler si se exige y criterios de aceptación oficiales. Diagramas de despliegue, decisiones formalmente aprobadas y firmas se dejan pendientes; no se inventan.
