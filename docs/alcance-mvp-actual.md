# Alcance vigente del MVP implementado de PluriOne

**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** TESCI · **Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** consolidación del 22 de octubre de 2026 · **Referencia histórica:** `78c7434` · **Rama:** `respaldo-avances-18-oct`.

**Bloqueo operativo actual:** la recuperación de contraseñas está implementada,
pero su envío real sigue pendiente por rechazo de autenticación de Google SMTP
`535 / 5.7.8`. Se comprobó TLS/AUTH sin enviar mensajes. No se presenta como
recuperación real validada. El transporte es el mismo de verificación empresarial;
el Gmail OAuth/API de campañas está separado y no se modifica para resolverlo.
Véase [diagnóstico reproducible y prueba única](diagnostico-recuperacion-smtp.md).

**Validación de este corte:** suite completa `node --test`, 917 aprobadas,
0 fallidas y 0 omitidas; sin correos ni campañas reales. Los resultados de
ejecuciones anteriores se conservan como evidencia histórica y no se suman a esta corrida.

## Índice

1. Producto desarrollado
2. Matriz de alcance
3. Validación y aprobación
4. Antecedentes
5. Recorrido y usuarios
6. Decisiones y exclusiones del MVP
7. Capacidades parciales, bloqueos y pendientes
8. Correspondencia con el planteamiento original

## 1. Producto desarrollado

El producto centraliza contactos, consentimiento, redacción y resultados para reducir la dispersión del trabajo de campañas y controlar la separación de información empresarial. Su objetivo es permitir preparar, revisar y ejecutar campañas email con identidad empresarial y decisión humana. No se atribuyen mejoras de ventas, ahorro o retorno que no se hayan medido.

El MVP cuenta con implementación y evidencia del entorno documentado. Atiende campañas de
correo por empresa con registro verificado, autenticación, contactos y evidencia
de consentimiento, borradores manuales/Gemini, revisión humana, Gmail OAuth/API,
envío múltiple supervisado, resultados individuales y controles de consistencia.

La selección tecnológica fue libre y autorizada por la empresa según la
responsable. No se interpreta la lista orientativa inicial como obligación de
usar herramientas ausentes. Los requisitos verificables se definen en el [PRD](PRD-borrador-tecnico.md)
y se vinculan al código en la [trazabilidad](entrega/matriz-trazabilidad.md).

## 2. Matriz de alcance

| Área | Estado actual | Tipo de evidencia y límite |
|---|---|---|
| Registro y verificación | Implementado; normalización y detección existente de cuentas/solicitudes previenen duplicados. Mensaje específico solo con titularidad verificada; aviso público neutral. | Pruebas automatizadas y evidencia histórica de registro; SMTP actualmente rechaza AUTH `535 / 5.7.8` en el entorno diagnosticado. |
| Acceso y recuperación | Login responsivo, CSRF, límites, errores genéricos; token de recuperación con hash, un uso, 15 minutos, bcrypt e invalidación de sesiones. | Flujo probado con transporte y persistencia simulados. Envío y recuperación reales pendientes por rechazo SMTP `535 / 5.7.8`; no se generaron credenciales nuevas. |
| Roles y multiempresa | Implementado con permisos y filtros por recurso/empresa. | Pruebas negativas y concurrencia; no auditoría externa. |
| Contactos y consentimiento | CRUD y evidencia ligada al email, autor, fecha e historial. | Pruebas automatizadas; autenticidad de consentimiento externo y retención son responsabilidades de operación. |
| Manual y Gemini | Generación, revisión, aprobación y guardado de borrador con recorrido común. | Generación auténtica documentada y pruebas simuladas de fallos/flujo. |
| Gmail OAuth/API | Cuenta empresarial, credenciales protegidas, envío directo y resultado persistido. | Envío real aceptado documentado; no se infiere recepción o lectura universal. |
| Envío múltiple supervisado | Seleccionar todos/desmarcar/individual en automatización y revisión real; contador, advertencias y límites en cliente/servidor. Específicos/todos/etiquetas fijados al preparar, mensajes individuales. | Pruebas de varios contactos, deduplicación y máximo 50; configuración explícita de 2 conserva 2. Uso real anterior confirmado por la responsable; no se enviaron campañas en esta consolidación. |
| Cuotas e idempotencia | Límites, reservas, unicidad y manejo de inciertos. | Pruebas de concurrencia y fallos; no garantía de entrega externa exactamente una vez. |
| Programación automática | Código y consumidor implementados, separados del modo supervisado. | Pruebas simuladas; producción programada no acreditada. |
| Métricas | Conteos administrativos, estimación e historial; detalle de campaña con intentados, aceptados, rechazados, cancelados e inciertos. | Métricas técnicas incorporadas y probadas; aceptación por Gmail no acredita recepción, aperturas/clics, conversiones ni ROI. |
| Sesiones y seguridad | Controles implementados y revisión técnica previa. | TLS, operación, restauración y auditoría externa requieren aceptación por instalación. |
| n8n | Referencia y contratos históricos conservados. | No requerido por Gmail directo; sin exportación ni despliegue operativo acreditado. |

Los detalles de evidencia, incluidas 851 pruebas generales y 65 integraciones,
están en [QA](entrega/reporte-qa.md) y [evidencias](entrega/evidencias-validacion.md).

## 3. Validación y aprobación

Implementación disponible para revisión académica no equivale a aceptación formal de PluriOne, dictamen
TESCI, producción, auditoría externa ni culminación de toda la visión de largo
plazo. No se encontró acta firmada de aceptación. Se entregan documentos para
revisión y material de capacitación sin afirmar impartición formal.

No se presentan como defectos actuales la ausencia de canales excluidos del MVP;
una ampliación comercial o contractual requiere requisitos y aprobación propios.
La aceptación del alcance y sus posibles diferencias respecto de propuestas
originales debe documentarse formalmente, sin inventar actas.

## 4. Antecedentes

La [versión anterior de alcance](historico/corte-previo-78c7434/alcance-mvp-actual.md)
se conserva como antecedente. Sus afirmaciones de proveedores pendientes
pertenecen al estado de aquella revisión. El [índice de entrega](entrega/indice-entrega.md)
es la entrada vigente para dictamen.

## 5. Recorrido y usuarios

1. **Registro y autenticación.** El solicitante verifica su correo mediante un enlace temporal y de un uso antes de completar la configuración empresarial y del administrador. El transporte SMTP pertenece a la plataforma, no a la conexión Gmail de campañas. Su operación real requiere configuración y autorización propias. El login rechaza cuentas nuevas pendientes o bloqueadas; sesiones y permisos se comprueban en servidor. MongoDB debe admitir las transacciones y los índices requeridos.
2. **Administración por rol.** El superadministrador gestiona plataforma, empresas y usuarios con acceso global deliberado. El administrador empresarial gestiona su ámbito, operadores, Gmail y confirmación de envíos. El operador trabaja con contactos y campañas y puede usar IA según permisos; no administra Gmail/usuarios ni elimina campañas. Los controles específicos de envío exigen administrador empresarial y no se sustituyen por el permiso genérico de ejecutar.
3. **Contactos y consentimiento.** El CRUD mantiene nombre, email/teléfono, etiquetas, actividad y canales. Otorgar o revocar consentimiento requiere evidencia y confirmación; el sistema conserva fecha, autor, historial y huella del email. Habilitar un canal no concede consentimiento. Un cambio de email sin nuevo otorgamiento revoca el previo. La autenticidad de evidencia externa y su retención son responsabilidades humanas.
4. **Campaña manual o asistida.** Se crea un borrador con objetivo, asunto y texto, o se revisa y aprueba una propuesta Gemini. El asistente propone contenido y sugerencias; no elige contactos ni envía. Validaciones, cuotas y revisión humana limitan su uso; no hay garantía de calidad comercial, veracidad o gratuidad ni permiso para introducir datos privados.
5. **Audiencia y activación.** Se eligen contactos específicos, todos los elegibles o etiquetas. En supervisado, preparar fija los IDs propios elegibles y deduplica emails; no incorpora altas posteriores sin revisión. Activar y preparar guarda el estado, pero no envía. El piloto manual solo admite un contacto explícito.
6. **Gmail empresarial.** Un administrador conecta la cuenta en `/empresa/gmail` mediante OAuth con validación de sesión, PKCE, nonce, identidad y scope. Los tokens se cifran; la conexión puede requerir renovación o reconexión. No se admite un remitente arbitrario desde la campaña.
7. **Confirmación y resultado.** La revisión muestra contenido, remitente, audiencia y bloqueos. En supervisado se registra la ejecución y la página procesa un destinatario por paso, con límites y confirmación explícita. En manual se obtiene el permiso temporal y se despacha el único mensaje. El historial distingue aceptado, rechazado, cancelado, incierto y estados de preparación. La aceptación API se diferencia de recepción y lectura; recargar no envía ni reanuda.

La implementación se contrasta en `services/permisos.js`, `services/autoservicioEmpresarialService.js`, `services/consentimientoContactoService.js`, `controllers/revisionEnvioCampanaController.js`, `services/gmailOAuthService.js`, `services/iaService.js` y `services/motorEnviosGmailService.js`. Los filtros de pertenencia mantienen la separación de recursos; el acceso global autorizado del superadministrador es una excepción explícita de rol, no un fallo de aislamiento.

## 6. Decisiones y exclusiones del MVP

El enfoque en email delimita una integración con identidad verificable, autorización de contactos, contenido revisado y resultados persistidos. Permite evaluar un recorrido completo sin atribuir capacidades a conectores no operativos. Es una justificación técnica del producto construido; no acredita una modificación contractual aceptada por PluriOne.

Facebook y LinkedIn carecen de conexión/publicación operativa acreditada; WhatsApp está bloqueado por el servicio. Los canales históricos y sus datos se conservan para compatibilidad, sin redirigirlos silenciosamente a email. No son funciones de esta entrega ni integraciones que baste habilitar con credenciales. Su incorporación exige requisitos de proveedor, permisos, diseño y validación propios.

n8n conserva contratos históricos con transporte bloqueado antes de la petición externa. El motor Gmail directo no lo necesita. No se afirma que exista un workflow desplegado ni una automatización activa por la mera presencia de variables o documentación.

El alcance inmediato es correo de texto, sin adjuntos ni imágenes enviadas. La selección supervisada está limitada a 1–50 direcciones según política y cuotas; no equivale a envío masivo productivo ilimitado. El código de programación no demuestra que un calendario se ejecute en producción.

## 7. Capacidades parciales, bloqueos y pendientes

| Estado | Qué incluye | Qué falta o qué impide su uso |
|---|---|---|
| Implementado | Registro, verificación, autenticación, roles, aislamiento, CRUD de contactos y campañas, selección, OAuth, IA y resultados individuales. | Infraestructura, cuentas y autorizaciones propias; la existencia de código no acredita habilitación en toda instalación. |
| Implementado con evidencia limitada | Envío múltiple supervisado e integración Gemini. | El registro de evidencia distingue generación auténtica, simulaciones y uso real confirmado por la responsable; faltan constancias exportables completas del recorrido múltiple. |
| Parcialmente validado | Programación y trabajador automático. | Pruebas con proveedor simulado; faltan criterios y comprobaciones de operación real programada. El trabajador puede consumir pendientes al arrancar si está habilitado: no debe iniciarse para resolver bloqueos. |
| Parcialmente cubierto | Métricas y recursos de campaña. | Hay resumen de resultados técnicos en el detalle; falta analítica comercial instrumentada. Imagen y fechas almacenadas no acreditan entrega de recursos o ejecución del calendario. |
| Implementado con bloqueo externo | Recuperación de contraseñas mediante el SMTP de verificación existente. | Rechazo AUTH `535 / 5.7.8`; pendiente validación real tras resolver autenticación de la cuenta actual. No reenviar tareas fallidas/inciertas automáticamente ni sustituir credenciales sin autorización. |
| Bloqueado por control existente | Piloto único consumido sin política de campañas sucesivas, empresa fuera de lista, consentimiento inválido, cuotas, autorización vencida o resultado incierto. | Resolver la causa mediante un procedimiento autorizado; no borrar registros ni eludir controles. |
| Bloqueado por alcance | Otros canales y transporte histórico n8n. | Requisitos y autorización de ampliación; no habilitación incidental. |
| Corrección implementada | Alta auxiliar del superadministrador. | `scripts/crearSuperadmin.js` crea el acceso activo, con bcrypt y sin sobrescribir cuentas. Probado con simulaciones; primera instalación real en base limpia pendiente. |
| Pendiente de validación o aceptación | Producción, auditoría externa, retención, restauración, capacitación impartida y aprobación académica/empresarial. | Evidencia y decisiones auténticas de las instancias correspondientes. |

Los requisitos funcionales RF-01 a RF-14 y no funcionales RNF-01 a RNF-07 conservan su correspondencia en el [PRD](PRD-borrador-tecnico.md) y la [matriz](entrega/matriz-trazabilidad.md). Cubren acceso, aislamiento, contenido, envío, consistencia, seguridad, usabilidad, mantenimiento y operación. No se declaran disponibilidad garantizada, entrega exactamente una vez ni cumplimiento legal certificado a partir de pruebas locales.

Para métricas, `services/adminService.js` y `services/empresaService.js` proporcionan conteos por rol. `models/EnvioGmail.js` conserva los resultados por destinatario. `controllers/campanaController.js` entrega al detalle la estimación y un resumen de resultados de la ejecución, deduplicados por destinatario. Aperturas, clics, rebotes, conversiones y ROI requieren eventos, fuentes y denominadores todavía no acreditados; no deben presentarse como ceros ni inferirse del estado administrativo de campaña.

## 8. Correspondencia con el planteamiento original

No se localizó una copia firmada del documento original de PluriOne. Esta relación procede de los antecedentes conservados, sin atribuir folios, texto contractual, personas aprobadoras o fechas no verificadas. La ausencia de un canal en el MVP no elimina su posible requisito en el documento original.

| Tema a contrastar con el original | Cobertura actual | Pendiente de decisión o evidencia |
|---|---|---|
| Visión multicanal | Email funcional; redes y WhatsApp fuera de la entrega. | Obtener el original y documentar aceptación de la reducción o compromiso de evolución. |
| Automatización y programación | Modos separados; consumidor implementado y probado con simulación. | Criterios de horarios, disparadores, recuperación y operación real. |
| Contenido IA | Propuestas revisables y generación auténtica documentada. | Calidad, privacidad, costos y criterios medibles de aceptación. |
| Analítica de marketing | Conteos y resultados técnicos. | Confirmar indicadores exigidos e instrumentar/validar los aprobados. |
| Imágenes y recursos | Soporte parcial de almacenamiento; Gmail inmediato de texto. | Acordar alcance y criterios de entrega de recursos. |
| Selección tecnológica | Stack observado; libertad tecnológica informada por la responsable. | Contrastar restricciones del original y conservar soporte de esa autorización sin inventar actas. |
| Entrega y despliegue | Expediente, manuales y material de capacitación. | Recepción formal, capacitación efectiva, dictamen y aceptación de condiciones productivas. |

La trazabilidad detallada y los estados de implementación se amplían en las secciones 12–14 del [PRD](PRD-borrador-tecnico.md). Los antecedentes se preservan: no se reescriben ni se sustituyen sus requisitos por una afirmación de aprobación del alcance actual.
