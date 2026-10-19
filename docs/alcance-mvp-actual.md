# Alcance vigente del MVP implementado de PluriOne

**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** TESCI · **Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 19 de octubre de 2026 · **Base:** `78c7434`.

## Índice

1. Producto desarrollado
2. Matriz de alcance
3. Validación y aprobación
4. Antecedentes

## 1. Producto desarrollado

El MVP está implementado y funciona en el entorno validado. Atiende campañas de
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
| Registro y verificación | Implementado, incluida configuración posterior del administrador y autenticación. | Pruebas automatizadas; recorrido real confirmado por la responsable. Constancia exportable completa no adjunta. |
| Roles y multiempresa | Implementado con permisos y filtros por recurso/empresa. | Pruebas negativas y concurrencia; no auditoría externa. |
| Contactos y consentimiento | CRUD y evidencia ligada al email, autor, fecha e historial. | Pruebas automatizadas; autenticidad de consentimiento externo y retención son responsabilidades de operación. |
| Manual y Gemini | Generación, revisión, aprobación y guardado de borrador con recorrido común. | Generación auténtica documentada y pruebas simuladas de fallos/flujo. |
| Gmail OAuth/API | Cuenta empresarial, credenciales protegidas, envío directo y resultado persistido. | Envío real aceptado documentado; no se infiere recepción o lectura universal. |
| Envío múltiple supervisado | Específicos/todos/etiquetas fijados al preparar, mensajes individuales y resultados por destinatario. | Pruebas de dos y varios contactos; uso real confirmado por la responsable; soporte saneado adicional por incorporar. |
| Cuotas e idempotencia | Límites, reservas, unicidad y manejo de inciertos. | Pruebas de concurrencia y fallos; no garantía de entrega externa exactamente una vez. |
| Programación automática | Código y consumidor implementados, separados del modo supervisado. | Pruebas simuladas; producción programada no acreditada. |
| Métricas | Conteos administrativos y resultados técnicos. | No se acreditan aperturas/clics/rebotes ni conversiones o ROI. |
| Sesiones y seguridad | Controles implementados y revisión técnica previa. | TLS, operación, restauración y auditoría externa requieren aceptación por instalación. |
| n8n | Referencia y contratos históricos conservados. | No requerido por Gmail directo; sin exportación ni despliegue operativo acreditado. |

Los detalles de evidencia, incluidas 851 pruebas generales y 65 integraciones,
están en [QA](entrega/reporte-qa.md) y [evidencias](entrega/evidencias-validacion.md).

## 3. Validación y aprobación

MVP académico concluido no equivale a aceptación formal de PluriOne, dictamen
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
