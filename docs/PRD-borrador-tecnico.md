# Documento de Requisitos del Producto (PRD) - MVP Implementado de PluriOne

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** Tecnológico de Estudios Superiores de Cuautitlán Izcalli (TESCI)<br>
**Autora y responsable académica:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 1.0 documental, 19 de octubre de 2026<br>
**Base de implementación:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`, rama `respaldo-avances-18-oct`.

**Estado:** MVP desarrollado, funcional y probado. La aceptación empresarial formal permanece pendiente de evidencia documental. El nombre histórico del archivo se conserva para no romper referencias; el título y contenido de esta edición sustituyen al borrador anterior.

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

## 4. Alcance y exclusiones

Incluye registro y verificación, autenticación, roles, aislamiento empresarial, contactos, consentimiento documentado, campañas email manuales y Gemini, revisión humana, Gmail OAuth, envío individual y múltiple supervisado, historial y resultados por destinatario. El registro usa correo transaccional de plataforma separado del Gmail OAuth de campañas.

El modo supervisado admite texto, envío inmediato y de 1 a 50 correos únicos según configuración; la selección por contactos, todos o etiquetas se fija al preparar. El piloto manual histórico conserva un destinatario y su política de consumo. El modo automático tiene procesamiento y fechas programadas implementados y probados con simulación; no se acredita operación programada productiva.

Quedan fuera de esta entrega funcional: canales sociales/WhatsApp/SMS, envío de adjuntos o imágenes por el motor Gmail actual, seguimiento acreditado de aperturas/clics/rebotes y garantías de producción. Los contratos heredados no habilitan esos canales. La selección tecnológica fue libre y autorizada por la empresa, conforme a la información proporcionada por la responsable; no equivale a un acta de aceptación del producto.

## 5. Requisitos funcionales

Los identificadores RF son de esta edición documental, derivados del código; no se presentan como folios de la propuesta original.

| ID | Requisito implementado | Prioridad | Criterio observable |
|---|---|---|---|
| RF-01 | Registrar empresa con verificación por correo y configuración posterior del administrador. | Esencial | Un enlace válido permite completar el alta; caducado/usado no se reutiliza. |
| RF-02 | Autenticar usuarios y aplicar estados de acceso. | Esencial | Cuentas pendientes o bloqueadas no acceden; cierre de sesión invalida el acceso correspondiente. |
| RF-03 | Separar datos y permisos por empresa y rol. | Esencial | Se rechazan lecturas/escrituras cruzadas y campos empresariales inyectados desde HTTP. |
| RF-04 | Gestionar contactos y consentimiento vinculado a email, autor y fecha. | Esencial | Contactos inactivos, revocados o sin evidencia no son elegibles; un cambio de dirección exige revisar consentimiento. |
| RF-05 | Crear, consultar y editar campañas email manuales. | Esencial | Guardar un borrador o activar/preparar no envía correo. |
| RF-06 | Generar y revisar propuestas con Gemini. | Esencial | La propuesta puede revisarse y aprobarse como borrador; la generación no selecciona ni envía a contactos. |
| RF-07 | Conectar la cuenta Gmail de la empresa por OAuth. | Esencial | State/PKCE/nonce e identidad se validan; credenciales no se aceptan desde el formulario de campaña. |
| RF-08 | Seleccionar contactos específicos, todos los válidos o etiquetas. | Esencial | Se muestra cantidad y direcciones elegibles; selección fijada, exclusiones y deduplicación antes de confirmar. |
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

El MVP está concluido para su presentación académica. Permanecen separados: revisión académica por TESCI, aceptación empresarial formal por PluriOne y habilitación productiva. No se encontraron actas firmadas que permitan declarar alguno de esos tres procesos concluido.

Cualquier ampliación de canales, adjuntos, cuotas, automatización productiva o indicadores comerciales debe convertirse en requisito nuevo con responsables, pruebas y autorización. No se inventa quién debe firmar en representación de PluriOne o TESCI.

## 11. Referencias y autoría

[Arquitectura](SDD-borrador-tecnico.md), [diez entregables](entrega/indice-entrega.md), [QA](entrega/reporte-qa.md), [referencias técnicas](entrega/referencias.md) y [declaración de autoría y uso de IA](entrega/autoria-ia.md).
