# Matriz de trazabilidad de requisitos e implementación

**Proyecto:** PluriOne — Plataforma Inteligente de Marketing Automation<br>
**Autora:** Debanie Jocabed Montoya Zúñiga · TESCI<br>
**Base:** `78c7434` · Edición documental: 19 de octubre de 2026.

## Índice

1. Criterio de lectura
2. Requisitos funcionales
3. Requisitos no funcionales
4. Límites de aceptación

## 1. Criterio de lectura

RF/RNF se definen en el [PRD](../PRD-borrador-tecnico.md), sin atribuirlos a folios originales. **I:** código implementado; **S:** pruebas con proveedores simulados; **R-doc:** resultado real descrito en una fuente conservada; **R-resp:** confirmado por la responsable, sin evidencia exportable completa en Git. Ninguna categoría equivale a aceptación formal. Los archivos de pruebas referidos existen en la base revisada; no se declara cobertura porcentual.

## 2. Requisitos funcionales

| ID | Implementación exacta | Prueba o evidencia localizable | Estado |
|---|---|---|---|
| RF-01 | [registroPublicoController](../../controllers/registroPublicoController.js), [autoservicioEmpresarialService](../../services/autoservicioEmpresarialService.js), [SMTP](../../services/smtpTransaccionalService.js) | [autoservicio HTTP](../../tests/autoservicio.http.test.js), [integración de registro](../../pruebas-integracion/registroEmpresarial.js) | I/S; verificación real R-resp. |
| RF-02 | [authController](../../controllers/authController.js), [autenticacion](../../middlewares/autenticacion.js) | [auth HTTP](../../tests/auth.http.test.js), [sesiones/roles](../../tests/sesiones.roles.http.test.js) | I/S; uso funcional confirmado. |
| RF-03 | [permisos](../../services/permisos.js), [accesoEmpresaService](../../services/accesoEmpresaService.js) | [aislamiento de contactos](../../tests/contactos.aislamiento.test.js), [gestión de usuarios](../../tests/usuarios.gestion.http.test.js) | I/S; no auditoría externa. |
| RF-04 | [consentimientoContactoService](../../services/consentimientoContactoService.js), [elegibilidadEmailService](../../services/elegibilidadEmailService.js) | [contactos HTTP](../../tests/contactos.http.test.js), [integración Gmail](../../pruebas-integracion/enviosGmail.js) | I/S; autenticidad del consentimiento externo requiere gestión humana. |
| RF-05 | [campanaController](../../controllers/campanaController.js), [Campana](../../models/Campana.js) | [campañas HTTP](../../tests/campanas.http.test.js), [regresión](../../tests/campanas.regresion.test.js) | I/S. |
| RF-06 | [iaService](../../services/iaService.js), [Gemini](../../services/ia/geminiProveedor.js) | [IA HTTP](../../tests/ia.http.test.js), [diagnóstico auténtico documentado](../gemini-nickki-diagnostico-2026-10-18.md) | I/S/R-doc y confirmación de la responsable. |
| RF-07 | [gmailOAuthService](../../services/gmailOAuthService.js), [googleOAuthClienteService](../../services/googleOAuthClienteService.js) | [OAuth transporte](../../tests/gmail.oauth.transporte.test.js), [registro de evidencias](evidencias-validacion.md) | I/S; conexión/envío real confirmados. Renovación/revocación real no se presumen. |
| RF-08 | [revisión de envío](../../controllers/revisionEnvioCampanaController.js), [revisión de contactos](../../services/revisionEnvioCampanaService.js) | [selección contactos/todos/etiquetas](../../tests/campanas.revision.envio.test.js) | I/S; uso múltiple R-resp. |
| RF-09 | [motor](../../services/motorEnviosGmailService.js), [enviosGmailController](../../controllers/enviosGmailController.js) | [interfaz](../../tests/campana.envio.interfaz.test.js), [integración de huellas](../../pruebas-integracion/enviosGmail.js) | I/S. |
| RF-10 | [MIME](../../services/gmailMimeService.js), [transporte API](../../services/gmailApiTransporteService.js), [EnvioGmail](../../models/EnvioGmail.js) | [envío unitario](../../tests/gmail.envio.unit.test.js), [integración](../../pruebas-integracion/enviosGmail.js) | I/S; envío aceptado R-doc; envío múltiple real R-resp. |
| RF-11 | [EjecucionGmail](../../models/EjecucionGmail.js), [ControlEnvioGmail](../../models/ControlEnvioGmail.js), [motor](../../services/motorEnviosGmailService.js) | [concurrencia, cuotas e incertidumbre](../../pruebas-integracion/enviosGmail.js) | I/S; no prueba de todas las fallas en producción. |
| RF-12 | [vista de revisión/resultados](../../views/campanas/enviar.ejs), [JS supervisado](../../public/js/envioCampanaManual.js) | [ensayo Edge](../../tests/soporte/campanaEnvioNavegador.cjs), [capturas actuales](evidencias-validacion.md) | I/S, escritorio y móvil. |
| RF-13 | [modo supervisado](../../services/envioSupervisadoService.js), [trabajador automático](../../services/trabajadorCampanasService.js) | [guardias supervisadas](../../tests/gmail.supervisado.test.js), [trabajador](../../tests/gmail.trabajador.test.js) | I/S; automatización programada productiva no acreditada. |
| RF-14 | [adminService](../../services/adminService.js), [empresaService](../../services/empresaService.js) | [conteos administrativos](../../tests/admin.service.test.js), [empresa HTTP](../../tests/empresa.http.test.js) | I/S; aperturas/clics/rebotes pendientes como evolución. |

## 3. Requisitos no funcionales

| ID | Soporte | Alcance de evidencia |
|---|---|---|
| RNF-01 | [passwordService](../../services/passwordService.js), [cifrado](../../services/cifradoCredencialesService.js), [seguridad de sesiones](../sesiones-produccion.md) | Pruebas de protección; revisión previa de secretos. No certificación de seguridad. |
| RNF-02 | [CSRF](../../middlewares/csrf.js), [acceso](../../middlewares/accesoEmpresa.js), índices de modelos | Pruebas negativas HTTP e integraciones transaccionales. |
| RNF-03 | [política Gmail](../../config/enviosGmail.js), [límites IA](../../services/ia/limitesIA.js) | Cuotas y velocidad locales; las cuentas y proveedores añaden límites propios. |
| RNF-04 | [motor](../../services/motorEnviosGmailService.js), [API](../../services/gmailApiTransporteService.js) | Fallos de red/persistencia simulados y reservas; ningún ensayo garantiza entrega externa exactamente una vez. |
| RNF-05 | [vistas](../../views/campanas/enviar.ejs), [Edge](../../tests/soporte/campanaEnvioNavegador.cjs) | 1440 y 390 px en el recorrido de envío; otras vistas tienen evidencia histórica identificada. |
| RNF-06 | [package-lock](../../package-lock.json), [QA](reporte-qa.md), capas de código | Reproducibilidad del código; integración depende de infraestructura local explícita. |
| RNF-07 | [manual técnico](manual-tecnico.md), [mantenimiento](plan-mantenimiento.md) | Procedimientos documentados; producción, SLA y restauración integral no declarados validados. |

## 4. Límites de aceptación

El cumplimiento técnico se contrasta con pruebas y evidencia. La conformidad empresarial, la evaluación académica y la operación productiva requieren decisiones independientes. La [matriz de diez entregables](indice-entrega.md) organiza el expediente, sin presentar la capacitación preparada como impartida.
