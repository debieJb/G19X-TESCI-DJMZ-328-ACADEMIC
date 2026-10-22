# Plan de mantenimiento y soporte - PluriOne

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. · **Institución:** TESCI<br>
**Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 19 de octubre de 2026 · Base `78c7434`.

## Índice

1. Objetivo y responsabilidades
2. Mantenimiento preventivo
3. Incidentes y recuperación
4. Respaldos y restauración
5. Evolución y aceptación

## 1. Objetivo y responsabilidades

Preservar confidencialidad, acceso empresarial, consentimiento e historial de campañas sin introducir reenvíos. Este plan propone responsabilidades funcionales y frecuencias para una futura operación acordada; no acredita un contrato de soporte ni disponibilidad 24/7.

El administrador empresarial mantiene contactos y revisa resultados. El responsable técnico autorizado controla configuración, infraestructura, respaldos y cambios. La persona facultada de PluriOne aprueba el alcance operativo cuando se designe formalmente. No se inventan nombres, turnos o tiempos contratados.

## 2. Mantenimiento preventivo

| Frecuencia propuesta | Actividad | Evidencia y precaución |
|---|---|---|
| Antes de habilitar envíos | Revisar modo, empresa permitida, límites, OAuth y pendientes/inciertos. | Lista de control sanitizada; no consumir trabajos como diagnóstico. |
| Durante cada campaña supervisada | Revisar resultados individuales y bloqueos. | Historial persistente; aceptado no significa recibido. |
| Semanal en operación | Revisar errores sanitizados, espacio, acceso de operadores y cuotas. | No exportar cuerpos, tokens o datos de contactos al reporte. |
| Mensual o ante aviso relevante | Revisar dependencias y vulnerabilidades; probar cambios aislados. | Lockfile, revisión de diff y regresión sin proveedores reales. No actualizar automáticamente producción. |
| Conforme a política acordada | Revisar privilegios, consentimiento, retención y credenciales. | Rotación autorizada y documentada, sin incluir valores en Git. No asumir periodicidad legal universal. |
| Antes de una liberación | Revisar secretos, requisitos, regresión, respaldo y plan de reversión compatible con datos. | Aprobación del alcance de despliegue, no solo del código. |

## 3. Incidentes y recuperación

| Incidente | Respuesta conservadora |
|---|---|
| Resultado incierto o conexión interrumpida | Pausar la continuación. Consultar historial y conciliar con información del proveedor por una persona autorizada. No crear otra campaña para repetir. |
| Aceptación seguida de fallo al persistir | Conservar reserva/estado y evidencia; no reenviar. El resultado puede requerir conciliación externa. |
| Cuota/velocidad | Respetar la pausa y los contadores; conservar pendientes. No subir límites o duplicar campañas para eludirlos. |
| OAuth revocado o expiración problemática | Reconectar la cuenta correcta según permisos. No reemplazar tokens mediante HTTP ni cambiar remitente arbitrariamente. |
| Verificación de registro no llega | Revisar transporte SMTP y estado de solicitud sin exponer enlaces. Un reenvío se hace por el flujo limitado, no reutilizando tokens. |
| Fallo de índices/topología/cuotas IA | Detener habilitación; diagnóstico de solo lectura y plan técnico autorizado. No borrar índices o modificar referencias para sortear guardias. |
| Sospecha de secreto expuesto | Detener publicación/operación afectada, informar sin reproducir el valor y seguir rotación autorizada. Borrar una línea en Git no elimina exposición histórica. |
| Apagado inesperado | Proteger archivos y datos; comparar Git y respaldos; revisar reservas e inciertos antes de cualquier arranque de trabajador. |

La prioridad de atención se determina por impacto: exposición o mezcla empresarial exige contención inmediata; incertidumbre de envío exige detener reintentos; defectos de presentación se priorizan tras proteger los datos. No se prometen tiempos de respuesta no contratados.

## 4. Respaldos y restauración

Mantener separados código versionado, configuración secreta y base de datos. Los respaldos deben permanecer cifrados o con acceso restringido, con integridad verificada y política de retención acordada. El respaldo privado de recuperación existente no se distribuye como evidencia pública.

Una prueba de restauración propuesta debe ejecutarse en destino aislado, con transportes y trabajadores apagados: comprobar integridad, relaciones, índices, contadores e historial de ejecuciones; identificar aceptados e inciertos antes de cualquier habilitación. La restauración no debe resucitar colas ni autorizar envíos. RPO, RTO, frecuencia y retención requieren acuerdo empresarial; no se presentan valores inventados ni una restauración integral como ya realizada.

## 5. Evolución y aceptación

Programación productiva, canales adicionales, adjuntos, métricas comerciales y escalamiento requieren requisitos, pruebas y autorización propios. Toda liberación debe conservar compatibilidad del historial y tener procedimiento de recuperación sin `reset`, borrado de campañas o reenvío automático como remedio.

[Manual técnico](manual-tecnico.md), [arquitectura](../SDD-borrador-tecnico.md), [QA](reporte-qa.md), [autoría](autoria-ia.md).
