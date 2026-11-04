# Documento de Requisitos del Producto (PRD) - MVP Implementado de PluriOne

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** Tecnológico de Estudios Superiores de Cuautitlán Izcalli (TESCI)<br>
**Autora y responsable académica:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** consolidación del 22 de octubre de 2026<br>
**Referencia histórica de implementación:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`, rama de trabajo `respaldo-avances-18-oct`.

**Estado de recuperación de cuentas:** frontend, rutas, servicio, persistencia,
token con hash, caducidad de 15 minutos, consumo atómico y revocación de sesiones
están implementados y probados con simulaciones. **El envío real sigue pendiente
por rechazo de autenticación de Google SMTP `535 / 5.7.8`.** Se reutiliza el SMTP
de verificación empresarial; no se creó otra cuenta ni nuevas credenciales. La
comprobación real solo ejecutó TLS/AUTH, sin mensajes. Las evidencias históricas
de registro no prueban que ese transporte esté operativo hoy. El Gmail API de
campañas y Gemini conservan sus integraciones independientes.

**Validación del corte:** 917 pruebas aprobadas, 0 fallidas y 0 omitidas en
`node --test`, antes del respaldo final; sin envíos reales. El diagnóstico SMTP
no permite afirmar que funcione la recepción ni la recuperación real.

**Estado:** descripción del producto implementado y de sus límites de validación. Existencia de código, habilitación de una instalación, evidencia de ejecución y aceptación formal son estados distintos. La aceptación empresarial permanece pendiente de evidencia documental. Se conserva el nombre histórico del archivo y la correspondencia RF/RNF de la matriz de trazabilidad.

## Índice

1. Propósito y problema
2. Objetivos
3. Actores y permisos
4. Alcance y exclusiones
5. Requisitos funcionales
6. Requisitos no funcionales
7. Criterios de aceptación técnica
8. Tecnologías y decisiones
9. Resultados y nivel de evidencia
10. Aceptación y control de cambios
11. Referencias y autoría
12. Funcionamiento del producto
13. Estado de capacidades y limitaciones
14. Trazabilidad del planteamiento original de PluriOne

## 1. Propósito y problema

Centralizar la preparación, revisión y envío de campañas de correo para distintas empresas, evitando mezcla de contactos, exposición de destinatarios, envíos sin consentimiento y confirmaciones duplicadas. El producto integra generación de contenido asistida por IA con decisión humana y trazabilidad del envío.

El problema atendido es la dispersión de contactos, cuentas de correo y tareas de redacción y envío. La solución implementada organiza estos elementos en un flujo empresarial común; no se atribuyen incrementos de ventas, ahorro porcentual ni retorno financiero que no hayan sido medidos.

## 2. Objetivos

**General:** disponer de una plataforma funcional de campañas email, multiempresa, con IA asistida y envío controlado mediante la cuenta Gmail de cada empresa.

**Específicos:** verificar el registro y acceso; separar permisos y recursos empresariales; documentar consentimiento; administrar campañas manuales y asistidas; conectar Gmail con OAuth; enviar mensajes individuales a selecciones revisadas; conservar resultados, cuotas y controles de duplicidad; y entregar documentación y pruebas reproducibles.

## 3. Actores y permisos

| Actor | Responsabilidad y restricciones observadas |
|---|---|
| Solicitante empresarial | Solicita registro, verifica correo y configura el primer administrador; no obtiene acceso por solicitarlo. |
| Administrador de empresa | Gestiona recursos de su empresa, Gmail y operadores. Confirma envíos supervisados y atiende resultados. No administra recursos de otra empresa. |
| Operador | Trabaja con contactos y campañas y puede utilizar el asistente según permisos. El envío supervisado exige administrador empresarial; el permiso genérico de ejecutar no elimina esa restricción del motor. |
| Superadministrador | Administra plataforma, empresas y usuarios. Su rol global no suple la autorización empresarial exigida al envío supervisado. |
| Destinatario | Contacto autorizado; recibe un mensaje individual y no se considera usuario administrativo por ser contacto. |
| Responsable académica | Integra, revisa y presenta el proyecto y sus evidencias. No se le atribuye aprobación institucional o empresarial por esa responsabilidad. |

La fuente ejecutable de permisos es `services/permisos.js`, complementada por los controles específicos de cada servicio.

El administrador empresarial administra usuarios de su ámbito, incluidos operadores; estos pueden gestionar contactos y crear, consultar y editar campañas, pero no eliminarlas ni administrar Gmail o usuarios. El superadministrador dispone de administración global deliberada; ese acceso no se confunde con una filtración entre empresas. Los servicios de envío y de IA añaden restricciones sobre el rol y el estado persistido del actor.

## 4. Alcance y exclusiones

Incluye registro y verificación, autenticación, roles, aislamiento empresarial, contactos, consentimiento documentado, campañas email manuales y Gemini, revisión humana, Gmail OAuth, envío individual y múltiple supervisado, historial y resultados por destinatario. El registro usa correo transaccional de plataforma separado del Gmail OAuth de campañas.

El modo supervisado admite texto, envío inmediato y de 1 a 50 correos únicos según configuración; la selección por contactos, todos o etiquetas se fija al preparar. Es una ejecución atendida con mensajes individuales y límites, no una garantía de envío masivo productivo ni una capacidad sin restricciones. El piloto manual histórico conserva un destinatario y su política de consumo. El modo automático tiene procesamiento y fechas programadas implementados y probados con simulación; no se acredita operación programada productiva.

Quedan fuera de esta entrega funcional: canales sociales/WhatsApp/SMS, envío de adjuntos o imágenes por el motor Gmail actual, seguimiento acreditado de aperturas/clics/rebotes y garantías de producción. Los contratos heredados no habilitan esos canales. La selección tecnológica fue libre y autorizada por la empresa, conforme a la información proporcionada por la responsable; no equivale a un acta de aceptación del producto.

## 5. Requisitos funcionales

Los identificadores RF son de esta edición documental, derivados del código; no se presentan como folios de la propuesta original.

| ID | Requisito del producto | Prioridad | Criterio observable |
|---|---|---|---|
| RF-01 | Registrar empresa con verificación por correo y configuración posterior del administrador. | Esencial | Un enlace válido permite completar el alta; caducado/usado no se reutiliza. |
| RF-02 | Autenticar usuarios, aplicar estados y recuperar acceso. | Esencial | Login responsivo con CSRF/límites y fallo genérico. Recuperación con respuesta neutral, hash de token de un uso/15 minutos, bcrypt e invalidación de sesiones; envío real pendiente por SMTP `535 / 5.7.8`. |
| RF-03 | Separar datos y permisos por empresa y rol. | Esencial | Se rechazan lecturas/escrituras cruzadas y campos empresariales inyectados desde HTTP. |
| RF-04 | Gestionar contactos y consentimiento vinculado a email, autor y fecha. | Esencial | Contactos inactivos, revocados o sin evidencia no son elegibles; un cambio de dirección exige revisar consentimiento. |
| RF-05 | Crear, consultar y editar campañas email manuales. | Esencial | Guardar un borrador o activar/preparar no envía correo. |
| RF-06 | Generar y revisar propuestas con Gemini. | Esencial | La propuesta puede revisarse y aprobarse como borrador; la generación no selecciona ni envía a contactos. |
| RF-07 | Conectar la cuenta Gmail de la empresa por OAuth. | Esencial | State/PKCE/nonce e identidad se validan; credenciales no se aceptan desde el formulario de campaña. |
| RF-08 | Seleccionar contactos específicos, todos los válidos o etiquetas. | Esencial | Seleccionar todos, desmarcar e individual en ambas pantallas; contador, advertencia y rechazo de excesos en cliente/servidor. Máximo configurable 1–50; un valor explícito de 2 sigue siendo 2. Selección fijada y deduplicada antes de confirmar. |
| RF-09 | Confirmar campaña supervisada con contenido y audiencia revisados. | Esencial | Cambios de contenido, destinatario o consentimiento invalidan la confirmación obsoleta. |
| RF-10 | Enviar mensajes individuales con resultados persistentes. | Esencial | Un solo destinatario por mensaje, sin lista visible; un paso procesa como máximo un trabajo. |
| RF-11 | Conservar idempotencia, reservas, cuotas y tratamiento de incertidumbre. | Esencial | Confirmaciones concurrentes no duplican; aceptados no se reenvían e inciertos no se reintentan automáticamente. |
| RF-12 | Mostrar historial y bloqueos comprensibles. | Esencial | Resultado por destinatario y acción para resolver falta de Gmail, selección, preparación, cuota o política. |
| RF-13 | Mantener modos manual, supervisado y automático separados. | Esencial | Recargar no envía; supervisado no consume colas antiguas ni transforma programación en envío inmediato. |
| RF-14 | Mostrar conteos administrativos y estados técnicos. | Complementaria | Conteos visibles sin atribuir aperturas, entrega final o conversiones inexistentes. |

La correspondencia exacta con archivos y pruebas está en la [matriz de trazabilidad](entrega/matriz-trazabilidad.md).

## 6. Requisitos no funcionales

| ID | Requisito y límite verificable |
|---|---|
| RNF-01 | Confidencialidad: contraseñas mediante bcrypt, tokens OAuth cifrados, secretos fuera de Git y ausencia de credenciales en mensajes de error. Esto no acredita auditoría externa. |
| RNF-02 | Integridad: CSRF, listas de campos permitidos, verificación de pertenencia, transacciones e índices únicos en ejecuciones. |
| RNF-03 | Control de procesamiento: límite de campaña 1–50; cuotas locales de 30/hora y 100/día por empresa, 500/día globales; intervalos de 2 s por empresa y 1 s global. El cliente espera 2.2 s entre pasos; el servidor conserva autoridad sobre los límites. |
| RNF-04 | Recuperación conservadora: reserva de 120 s; una operación ambigua no demuestra rechazo y no debe originar otro envío. No se promete entrega exactamente una vez ante fallas externas. |
| RNF-05 | Usabilidad: vistas EJS adaptables y recorrido coherente manual/IA, con revisiones de escritorio y móvil. No se declara certificación de accesibilidad. |
| RNF-06 | Mantenibilidad: CommonJS, capas de rutas/controladores/servicios/modelos, pruebas con `node:test`, dependencias fijadas por lockfile y control de versiones. |
| RNF-07 | Operación: infraestructura, HTTPS, sesiones persistentes, retención, restauración y monitoreo requieren configuración y aceptación específicas antes de producción. No existe SLA validado. |

## 7. Criterios de aceptación técnica

1. El administrador completa alta verificada e inicia sesión; un rol no autorizado no suplanta ese recorrido.
2. Ninguna selección empresarial admite contactos ajenos; inactivos y contactos sin consentimiento quedan excluidos.
3. Crear campaña manual o aprobar Gemini conduce al mismo recorrido: elegir → activar/preparar → revisar → confirmar → resultados.
4. La confirmación fija contenido y audiencia; cada correo tiene un único destinatario y remitente de la conexión empresarial validada.
5. Concurrencia, cuotas y fallos parciales conservan resultados y pendientes sin reenviar aceptados ni inciertos.
6. Los resultados técnicos se distinguen de recepción, lectura y resultados comerciales.
7. La evidencia de pruebas se identifica por base funcional, entorno y tipo de proveedor; las pruebas simuladas no se presentan como llamadas reales.

Los criterios 1–7 tienen soporte de implementación y pruebas; las validaciones reales disponibles se clasifican en el registro de evidencia. No constituyen por sí mismos un dictamen ni una firma de aceptación.

## 8. Tecnologías y decisiones

Node.js 24, Express 5, JavaScript, EJS, MongoDB/Mongoose, Gmail API, OAuth 2.0, Gemini API, Nodemailer/SMTP transaccional, sesiones, bcryptjs y Git/GitHub conforman el stack observado. n8n es un antecedente de integración con contratos conservados y bloqueados; no es dependencia operativa del motor Gmail ni existe exportación de workflow acreditada.

FastAPI, React, PostgreSQL, Azure, Redis y Power BI no se presentan como tecnologías implementadas. La [propuesta técnica](entrega/propuesta-tecnica.md) justifica las decisiones contra estos requisitos.

## 9. Resultados y nivel de evidencia

Se verificaron registros locales de 851/851 pruebas generales, 65/65 integraciones y dos recorridos Edge de 29 comprobaciones cada uno. Son resultados conservados de la base funcional, no una ejecución nueva de esta revisión documental.

El repositorio contiene un diagnóstico que registra una generación auténtica Gemini y documentación de la consulta de un envío aceptado por Gmail. La responsable confirma además registro/verificación real y envío múltiple supervisado con servicios reales. Para estas últimas comprobaciones no se inventan IDs, fechas, capturas ni actas que no estén disponibles. Véase [registro de evidencias](entrega/evidencias-validacion.md).

## 10. Aceptación y control de cambios

El MVP dispone de una implementación y un expediente para revisión académica. Permanecen separados: revisión académica por TESCI, aceptación empresarial formal por PluriOne y habilitación productiva. No se encontraron actas firmadas que permitan declarar alguno de esos tres procesos concluido. Los criterios anteriores describen lo que debe comprobarse; no sustituyen esa aceptación.

Cualquier ampliación de canales, adjuntos, cuotas, automatización productiva o indicadores comerciales debe convertirse en requisito nuevo con responsables, pruebas y autorización. No se inventa quién debe firmar en representación de PluriOne o TESCI.

## 11. Referencias y autoría

[Arquitectura](SDD-borrador-tecnico.md), [diez entregables](entrega/indice-entrega.md), [QA](entrega/reporte-qa.md), [referencias técnicas](entrega/referencias.md) y [declaración de autoría y uso de IA](entrega/autoria-ia.md).

## 12. Funcionamiento del producto

### Registro, acceso y separación empresarial

El solicitante inicia un registro público. El autoservicio registra la solicitud y utiliza un enlace de verificación temporal y de un uso; solo después de verificar permite completar la configuración del administrador y la empresa. El correo transaccional se entrega mediante SMTP de plataforma, separado de las autorizaciones Gmail de campañas. Una instalación sin ese transporte autorizado no completa por sí sola la verificación real. El arranque valida la topología transaccional de MongoDB y prepara los índices del autoservicio (`services/autoservicioEmpresarialService.js`, `controllers/registroPublicoController.js`).

El login comprueba contraseña y estado de acceso; una cuenta nueva pendiente o bloqueada no accede. Las sesiones y sus versiones permiten invalidar accesos. Los servicios resuelven empresa y permisos desde la identidad persistida, no desde una empresa declarada por el cliente. Los recursos empresariales se consultan mediante filtros de pertenencia; existen tratamientos explícitos para documentos históricos y administración global (`controllers/authController.js`, `middlewares/autenticacion.js`, `services/accesoCampanasService.js`).

El alta auxiliar por `scripts/crearSuperadmin.js` no equivale al autoservicio empresarial: crea el rol global con acceso activo y bcrypt, sin sobrescribir cuentas existentes. La corrección está probada con simulaciones; una primera instalación real en base limpia permanece pendiente. No se prescribe editar datos ni eludir autenticación.

### Contactos, consentimiento y segmentación

Cada empresa mantiene contactos con nombre, medios de contacto, etiquetas, canales habilitados y estado activo. El CRUD permite registrar otorgamiento o revocación con fecha, referencia, confirmación, autor e historial. La autorización se vincula a la dirección mediante una huella; cambiar el email sin registrar nuevo consentimiento revoca el anterior. El software valida el registro, pero no certifica la autenticidad de un documento externo. Eliminar un contacto elimina también su historial embebido; retención y archivo deben acordarse operacionalmente.

La segmentación disponible es explícita: contactos concretos, todos los elegibles de la empresa o coincidencia de etiquetas. No es segmentación predictiva. Antes del envío se excluyen contactos no elegibles y se deduplican direcciones. La revisión de envío exige evidencia de consentimiento vinculada al email actual. En modo supervisado, preparar convierte la selección en IDs concretos: altas posteriores no se incorporan silenciosamente (`services/destinatariosService.js`, `services/revisionEnvioCampanaService.js`, `controllers/revisionEnvioCampanaController.js`).

### Campañas, Gmail y ejecución

Una campaña contiene nombre, objetivo, canal, asunto, cuerpo, fechas y estado administrativo. Las nuevas campañas comienzan en borrador y siguen transiciones controladas. La creación manual y la aprobación de una propuesta IA convergen en el recorrido **crear → seleccionar → activar/preparar → revisar → confirmar → consultar resultados**. Activar o guardar una fecha no demuestra que se haya enviado el mensaje.

Un administrador empresarial conecta la cuenta desde `/empresa/gmail`; OAuth valida sesión, estado de un uso, PKCE, nonce, identidad y permiso de envío. La aplicación cifra los tokens y controla su renovación. No admite un remitente arbitrario desde el formulario de campaña. Una conexión registrada no garantiza que Google no la haya revocado posteriormente (`services/gmailOAuthService.js`, `services/googleOAuthClienteService.js`).

El motor registra una ejecución y trabajos por destinatario. En modo manual, la interfaz obtiene una autorización temporal y despacha un único mensaje; el piloto puede quedar consumido por empresa y la política de campañas sucesivas es independiente. En supervisado, la confirmación registra la ejecución y la página solicita pasos acotados, uno por destinatario. Recargar no reanuda ni envía. El modo automático tiene un consumidor que puede iniciarse con el servidor cuando su política está habilitada; su operación productiva no se presume a partir de pruebas simuladas (`controllers/enviosGmailController.js`, `services/motorEnviosGmailService.js`, `services/trabajadorCampanasService.js`).

Los resultados distinguen pendiente, reservado, enviando, aceptado, rechazado, cancelado e incierto. La aceptación API conserva referencia y fecha; la recepción requiere comprobación independiente. Un timeout o fallo de persistencia posterior al envío puede dejar incertidumbre: no debe interpretarse como permiso para repetir. La habilitación depende de política, empresa autorizada, índices, cuenta, consentimiento y cuotas; no se declara activa en todas las instalaciones.

### Asistente IA y medición

Gemini propone asunto, mensaje, llamada a la acción y sugerencias de segmentación; estas últimas no seleccionan contactos. El servicio valida entrada/salida, permisos y cuotas y admite revisión de propuestas. El contenido necesita revisión humana antes de guardarse y de enviarse. El asistente no garantiza veracidad, calidad comercial ni ausencia de facturación. No debe recibir secretos ni datos personales de contactos; los controles de privacidad no certifican anonimización absoluta de texto libre (`services/iaService.js`, `services/ia/contratoIA.js`).

Los paneles administrativos cuentan empresas, usuarios y campañas según el rol. El historial conserva resultados técnicos por destinatario. En `/campanas/:id`, `detalle.ejs` recibe la estimación actual y `resultadosEnvio`, con intentados, aceptados, rechazados, cancelados e inciertos de la ejecución, deduplicados por destinatario. No proporciona aperturas, clics, rebotes, conversiones, ROI ni una tasa de entrega final acreditada (`services/adminService.js`, `services/empresaService.js`, `controllers/campanaController.js`, `models/EnvioGmail.js`).

## 13. Estado de capacidades y limitaciones

| Clasificación | Capacidades y límite real |
|---|---|
| Implementadas | Registro/verificación y login, roles, aislamiento, contactos/consentimiento, etiquetas y selección, campañas manuales, OAuth Gmail, propuestas Gemini, historial e idempotencia. Su uso depende de infraestructura y autorizaciones propias. |
| Implementadas con validación limitada | Envío múltiple supervisado: pruebas simuladas y confirmación de uso real por la responsable; falta incorporar constancias exportables completas. No acredita escala masiva productiva. |
| Parcialmente validadas | Programación y consumidor automático: código y pruebas simuladas, sin ejecución programada productiva acreditada. IA: generación auténtica documentada, sin evaluación estadística de calidad. |
| Parcialmente cubiertas | Métricas: conteos administrativos, estimación y resumen técnico por campaña implementados; falta analítica comercial instrumentada. |
| Implementada con bloqueo externo | Recuperación de contraseña mediante SMTP existente, con pruebas simuladas de seguridad y concurrencia. Envío real pendiente por rechazo AUTH `535 / 5.7.8`; diagnóstico sin mensajes ni cambios a datos reales. |
| Bloqueadas por diseño o política | Transporte histórico n8n, canales ajenos a email, envío sin consentimiento/permiso, reenvío de inciertos y piloto consumido cuando no está autorizada otra política. No se resuelven suprimiendo controles. |
| Recursos parciales, sin entrega Gmail | El modelo admite imagen local y fechas, pero el recorrido inmediato de Gmail exige texto sin imagen. Guardar esos recursos no acredita envío de adjuntos ni programación efectiva. |
| Pendientes | Primera instalación real en base limpia del superadministrador, autenticación SMTP y recuperación real, criterios y pruebas productivas, métricas comerciales, auditoría externa, retención/restauración, aceptación empresarial y dictamen académico. |

Esta clasificación no cambia permisos, cuotas ni banderas. La evidencia real conservada y la confirmación de la responsable se distinguen en [evidencias de validación](entrega/evidencias-validacion.md); no se ejecutan proveedores en esta edición.

## 14. Trazabilidad del planteamiento original de PluriOne

El enfoque en correo permite delimitar un recorrido verificable con identidad remitente empresarial, consentimiento, revisión de contenido, mensajes individuales y resultado persistido. Reutiliza Gmail OAuth/API y concentra la evaluación del MVP en una integración controlada. Esta es una justificación técnica del alcance construido, no una prueba de que PluriOne haya aprobado formalmente reducir su visión original.

Facebook, LinkedIn y WhatsApp no forman parte del alcance funcional actual: no hay conexión operativa acreditada de sus cuentas ni publicación/mensajería habilitada. Los servicios conservan errores y bloqueos explícitos; los enums y registros históricos preservan compatibilidad. n8n conserva un contrato bloqueado antes del transporte y no sustituye a Gmail. Incorporar otros canales exige requisitos, permisos de proveedor y aceptación propios, no activar campos históricos (`services/redesSocialesService.js`, `services/whatsappService.js`, `services/automatizacionService.js`, `services/emailService.js`).

No se localizó una copia firmada de la propuesta original ni folios oficiales verificables. La tabla siguiente registra temas conservados en la documentación previa, no una transcripción exhaustiva ni requisitos inventados del original. Los IDs RF/RNF actuales se mantienen para no romper la [matriz existente](entrega/matriz-trazabilidad.md).

| Tema del antecedente | Correspondencia actual | Validación o aprobación que falta |
|---|---|---|
| Visión multicanal | RF-05/07/10, limitados funcionalmente a email. | Contrastar el documento original y formalizar la aceptación de la diferencia de alcance; no declarar cancelados requisitos originales. |
| Automatización y programación | RF-13, modos separados y consumidor implementado. | Acordar qué eventos, horarios, volumen y recuperación se aceptarán; aportar evidencia real de operación programada. |
| IA aplicada a campañas | RF-06, propuesta editable y aprobación humana. | Acordar calidad, privacidad, costos, modelo y criterios medibles; una generación no acredita todos esos objetivos. |
| Métricas de marketing | RF-14 cubre conteos técnicos/administrativos. | Confirmar indicadores exigidos, denominadores, fuentes, atribución y tratamiento de datos; instrumentar y validar lo aprobado. |
| Imágenes y recursos | Conservación parcial en modelo/interfaz; motor inmediato de texto. | Confirmar requisitos originales de recursos y alcance aceptado de adjuntos o imágenes. |
| Tecnologías sugeridas | Stack actual descrito en sección 8. | Conservar la autorización tecnológica informada por la responsable como tal, sin inventar acta; contrastar restricciones reales del original. |
| Entrega y operación | Expediente técnico y material de capacitación. | Recepción y aceptación de entregables, capacitación impartida, dictamen TESCI y condiciones de producción documentadas. |

La [versión anterior de alcance](historico/corte-previo-78c7434/alcance-mvp-actual.md) conserva los antecedentes y criterios aún por acordar. Su estado histórico de proveedores no sustituye las evidencias posteriores. Las exclusiones del MVP no borran compromisos originales ni los convierten automáticamente en funciones terminadas.
