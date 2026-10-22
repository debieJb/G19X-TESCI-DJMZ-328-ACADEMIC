# Plan del proyecto y cierre documental

**Proyecto:** PluriOne — Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. · **Institución:** TESCI<br>
**Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 19 de octubre de 2026 · Base `78c7434`.

## Índice

1. Naturaleza del plan
2. Paquetes de trabajo y evidencia temporal
3. Dependencias y riesgos
4. Cierre pendiente y criterios
5. Control de cambios

## 1. Naturaleza del plan

El desarrollo del MVP está concluido. Este plan reconstruye hitos verificables del historial Git y organiza su cierre documental. No inventa duración de la residencia, horas trabajadas, presupuesto, calendario contractual ni fechas de aceptación. Las fechas de commit son evidencia de integración del código, no necesariamente de inicio o terminación de cada actividad.

## 2. Paquetes de trabajo y evidencia temporal

| Paquete | Resultado integrado | Evidencia Git | Fecha del commit |
|---|---|---|---|
| PT-01 Acceso y aislamiento | CSRF administrativo, estados de acceso, separación empresarial. | `d66b7bc`, `db8caba` | 14/10/2026 |
| PT-02 Registro | Registro empresarial transaccional y verificación previa al administrador. | `729e624` | 14/10/2026 |
| PT-03 Asistencia IA | Asistente y preparación segura de campañas; cuotas aisladas. | `6d791ea`, `4d375a5`, `f69cab3` | 14–15/10/2026 |
| PT-04 Gmail y consistencia | Autoservicio, motor Gmail API y documentación de seguridad. | `2b12d0d`, `9ec9f70` | 15/10/2026 |
| PT-05 Experiencia y roles | Interfaz pública, autenticación empresarial y respaldo de avances. | `5cca19d`, `1df937e` | 18/10/2026 |
| PT-06 Cierre funcional | Gemini, Gmail, selección múltiple supervisada y regresiones. | `78c7434` | 19/10/2026 |
| PT-07 Expediente | PRD/SDD, manuales, QA, mantenimiento, capacitación e informe. | Cambios documentales de esta edición, sin commit todavía. | Edición 19/10/2026 |

Las validaciones reales se documentan según su fuente, sin asignarles fechas deducidas del commit. Un respaldo privado fue confirmado en la sesión de recuperación; no se publica su contenido ni se utiliza como sustituto de pruebas de restauración.

## 3. Dependencias y riesgos

| Riesgo | Efecto | Tratamiento y responsable funcional |
|---|---|---|
| Falta de evidencia exportable de validaciones reales | Dictamen no puede reproducir todo desde Git. | Autora integra constancias saneadas con autorización; mantener separación R-doc/R-resp. |
| Uso de modo automático por error | Consumo no deseado de pendientes. | Administrador de operación revisa banderas, colas y alcance antes de cualquier arranque. |
| Interrupción o timeout | Resultado externo ambiguo. | Conservar estado incierto, conciliar; nunca reiniciar campañas como solución. |
| Diferencias de infraestructura | Fallo de índices, cuotas o sesiones. | Instalación y diagnóstico de solo lectura; cambios de infraestructura autorizados por separado. |
| Aceptación formal ausente | Confusión entre funcionamiento y aprobación. | Solicitar revisión empresarial/académica independiente. |

Los roles operativos son responsabilidades propuestas; no asignan contratos o personas no acreditadas.

## 4. Cierre pendiente y criterios

| Actividad | Criterio de cierre | Estado |
|---|---|---|
| Revisión de expediente por la autora | Coherencia, enlaces y evidencia revisados. | Paquete preparado para revisión. |
| Dictamen académico | Resultado emitido por la autoridad académica competente. | No acreditado; no se inventa fecha. |
| Aceptación empresarial | Constancia auténtica de PluriOne con alcance y reservas. | Pendiente de evidencia. |
| Capacitación | Sesión realizada y evidencia auténtica de asistencia/evaluación. | Material preparado; impartición no acreditada. |
| Producción, si se solicita | Infraestructura, seguridad, restauración y operación aceptadas. | Fuera del cierre técnico local acreditado. |

## 5. Control de cambios

El commit funcional se conserva. Esta edición cambia únicamente documentación y copia capturas existentes auténticas. No autoriza campañas, trabajadores, migraciones, commit, push o merge. La aprobación del paquete documental deberá anteceder a su publicación posterior.

Referencias: [entregables](indice-entrega.md), [mantenimiento](plan-mantenimiento.md), [QA](reporte-qa.md), [autoría](autoria-ia.md).
