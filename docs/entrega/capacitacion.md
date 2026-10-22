# Material de capacitación - Operación del MVP PluriOne

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** TESCI · **Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 19 de octubre de 2026 · Base `78c7434`.

**Estado:** material preparado. No existe evidencia de una capacitación formal impartida ni se genera acta, asistencia, firma o evaluación ficticia.

## Índice

1. Objetivos y audiencia
2. Guion de sesión
3. Práctica guiada
4. Evaluación propuesta
5. Evidencia de una futura impartición

## 1. Objetivos y audiencia

Al terminar una sesión, el administrador debe poder preparar una campaña manual o IA, identificar destinatarios elegibles, revisar remitente y contenido, interpretar bloqueos y consultar resultados sin duplicar. El operador debe reconocer su alcance de preparación y la necesidad de intervención del administrador para confirmar envío supervisado.

Material de apoyo: [manual de usuario](manual-usuario.md), [capturas auténticas de fixtures](evidencias-validacion.md), [resolución técnica](manual-tecnico.md) y [mantenimiento](plan-mantenimiento.md).

## 2. Guion de sesión

Duración propuesta: 60 minutos; no es duración ejecutada.

| Bloque | Minutos propuestos | Contenido y demostración |
|---|---:|---|
| Alcance y acceso | 10 | Roles, empresa activa, verificación y cierre de sesión. |
| Contactos | 10 | Canal vs consentimiento; inactivos, etiquetas y duplicados. |
| Creación manual e IA | 10 | Instrucciones sin datos personales, revisión humana y borrador. |
| Selección y preparación | 10 | Casillas, todos o etiquetas; cantidad, direcciones y acción sin envío. |
| Confirmación y resultados | 10 | Mensajes individuales, cuotas, pendientes y estado incierto. |
| Evaluación y preguntas | 10 | Casos de bloqueo y explicación de acciones seguras. |

## 3. Práctica guiada

Usar un entorno aislado con datos sintéticos y transporte simulado, o recorrer las capturas existentes. Esta guía no habilita proveedores reales. No emplear cuentas empresariales ni consentimiento inventado para una demostración.

1. Identificar el rol y empresa del panel.
2. Clasificar tres ejemplos: contacto autorizado, inactivo y sin evidencia. Explicar por qué solo el primero puede recibir marketing.
3. Crear un borrador de texto. Si no hay Gemini simulado disponible, revisar una propuesta de fixture, sin inventar que fue respuesta real.
4. Elegir dos contactos sintéticos autorizados, activar/preparar y comprobar que aún no hay envío.
5. Revisar contenido, remitente, destinatarios y cantidad. Mostrar cancelar y confirmar solo con proveedor simulado.
6. Interpretar resultados y recargar: no debe repetirse un aceptado.
7. Analizar un caso incierto: detener y pedir conciliación; nunca presentar un nuevo clic como remedio universal.

Para una demostración real futura se requiere autorización específica del remitente, contenido y buzones propios con consentimiento documentado. No es necesaria para presentar esta capacitación documental.

## 4. Evaluación propuesta

| Pregunta/tarea | Respuesta o criterio esperado |
|---|---|
| ¿Activar/preparar envía? | No; guarda estado y selección antes de la confirmación. |
| ¿El canal email acredita consentimiento? | No; se exige evidencia vigente ligada al correo. |
| ¿Por qué aparece un solo remitente? | Proviene del Gmail OAuth de esa empresa, no de texto libre. |
| ¿Qué significa aceptado? | Aceptado por Gmail, no recepción ni apertura acreditadas. |
| ¿Qué hacer ante incierto? | Detener y conciliar; no reenviar automáticamente. |
| ¿Recargar reanuda? | No; los pendientes requieren una acción explícita permitida. |
| ¿La programación está validada en producción? | No se acredita; está implementada y probada con simulación. |

Criterio propuesto: resolver correctamente los casos críticos de consentimiento, remitente e incertidumbre, y completar el recorrido simulado sin repetir. No se consigna ninguna calificación obtenida.

## 5. Evidencia de una futura impartición

Si se realiza la sesión, registrar fecha real, entorno, temas efectivamente cubiertos, observaciones y evaluación auténtica. La asistencia y publicación de datos personales requieren autorización apropiada; conservar originales privadamente y un resumen saneado para el expediente. No se incluyen campos de firma vacíos presentados como acta completa.

[Índice de entregables](indice-entrega.md), [declaración de autoría](autoria-ia.md).
