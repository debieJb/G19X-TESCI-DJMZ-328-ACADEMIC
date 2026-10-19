# Reporte de aseguramiento de calidad - MVP PluriOne

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. · **Institución:** TESCI<br>
**Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición documental:** 19 de octubre de 2026 · **Base funcional:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`.

## Índice

1. Objetivo y fuentes
2. Resultados comprobados
3. Cobertura funcional
4. Proveedores reales y simulados
5. Incidencias y limitaciones
6. Criterio de cierre

## 1. Objetivo y fuentes

Evaluar la evidencia de acceso, aislamiento, consentimiento, campañas, integraciones y procesamiento controlado de la base entregada. Esta revisión **no ejecuta campañas ni vuelve a ejecutar proveedores**. Se contrastaron código, tests y resúmenes de registros locales conservados. Las cifras no son pruebas corridas durante esta edición documental ni resultado de contar declaraciones `test()` estáticamente.

Los logs ignorados por Git `entrega-final-suite.log`, `entrega-final-integracion.log`, `multi-navegador.log` y `multi-navegador-piloto.log` existen en el entorno revisado. Sus resúmenes y SHA-256 se incorporan sin contenido privado en [resumen-validacion.json](../evidencias/cierre-78c7434/resumen-validacion.json). El resumen documental es derivado: no equivale a una ejecución de CI firmada ni sustituye los logs privados para una auditoría.

## 2. Resultados comprobados

| Conjunto | Ejecutadas | Aprobadas | Fallidas | Omitidas | Entorno y proveedor |
|---|---:|---:|---:|---:|---|
| Suite general `node --test` | 851 | 851 | 0 | 0 | Node.js 24; pruebas unitarias/HTTP y dobles. |
| Integración de campañas y Gmail | 65 | 65 | 0 | 0 | MongoDB de desarrollo con fixtures propias; Gmail y OAuth simulados. |
| Edge, flujo supervisado múltiple | 1 ensayo | 1 | 0 | 0 | 29 comprobaciones, 6 capturas, 1440 y 390 px; sin Mongo/proveedores externos. |
| Edge, piloto original | 1 ensayo | 1 | 0 | 0 | 29 comprobaciones, 6 capturas; fixture local. |

Las 58 comprobaciones de navegador son aserciones dentro de dos ensayos, no 58 tests adicionales de `node:test`. No se suman resultados históricos de 593, 816 o 844 a la cifra final. No se dispone de un porcentaje de cobertura instrumentada que permita declarar 100 % de cobertura de código.

La ejecución de integración conservada utilizó una adaptación temporal de verificación de referencia tras el apagón: comparó configuración, datos e índices históricos y estabilidad del nuevo PID durante la sesión, sin alterar referencias versionadas. Esa adaptación no se presenta como parte del comando portable del proyecto. Ver [manual técnico](manual-tecnico.md).

## 3. Cobertura funcional

| Área | Casos relevantes y evidencia |
|---|---|
| Registro/acceso | Enlaces de un uso, estados, reenvío limitado, administrador posterior a verificación, contraseña y login. `tests/autoservicio.http.test.js`, `tests/auth.http.test.js`. |
| Empresa/roles | Rechazo de recursos cruzados, permisos administrativos y revocación de acceso. `tests/sesiones.roles.http.test.js`, `tests/usuarios.gestion.http.test.js`. |
| Consentimiento | Inactivos, revocados, documentación ausente, email cambiado y concurrencia. `tests/contactos.http.test.js`, `pruebas-integracion/enviosGmail.js`. |
| Manual y Gemini | Crear, revisar y guardar un borrador, activar/preparar sin enviar y compartir el flujo posterior. `tests/ia.http.test.js`, integración de recorrido completo. |
| Selección múltiple | Específicos/todos/etiquetas, exclusión de ajenos, deduplicación y cantidad. `tests/campanas.revision.envio.test.js`. |
| Envío individual | MIME con único `To`, identidad remitente y ausencia de `Cc/Bcc`. Integraciones supervisadas. |
| Concurrencia | Confirmaciones iguales, claves diferentes y competidores no duplican ejecución ni aceptación. Integraciones del motor. |
| Fallos | Aceptación parcial, rechazo, timeout, reserva vencida, pérdida de persistencia y bloqueo de inciertos. Integraciones del motor. |
| Cuotas y modos | Límites locales, pausas de proveedor, modo supervisado separado y rechazo de programación/actor ajenos. `tests/gmail.supervisado.test.js`, integración. |
| Navegación | Cancelar no envía; confirmar, recargar e historial no duplican; control de desbordamiento y ausencia de errores JS. Ensayo Edge conservado. |

La [trazabilidad](matriz-trazabilidad.md) vincula cada requisito con rutas concretas.

## 4. Proveedores reales y simulados

Las regresiones utilizan simulación de proveedor; las integraciones de base pueden utilizar MongoDB real aislado sin implicar Gmail real. La generación auténtica Gemini documentada y el envío Gmail aceptado constituyen evidencia distinta. Registro/verificación real y envío múltiple real están confirmados por la responsable; sus constancias exportables no se inventan. Consultar [evidencias](evidencias-validacion.md).

## 5. Incidencias y limitaciones

- El timeout histórico `CDP_TIMEOUT_Page.enable` no se reprodujo en los ensayos finales; no se demostró causa raíz del fallo original.
- El piloto manual unitario consumido bloqueaba campañas posteriores; se resolvió el alcance mediante un modo supervisado separado, conservando historial y controles.
- Una fixture nueva de aislamiento necesitó su contraseña sintética; el resultado final de integración es el de 65 aprobadas, posterior a corregir esa fixture.
- No se acredita carga productiva, disponibilidad, pentest externo, auditoría legal, restauración integral, recepción de todos los mensajes, accesibilidad certificada ni operación productiva del scheduler.
- La revisión de secretos previa al commit funcional no detectó credenciales reales; Gitleaks señaló valores ficticios de pruebas que se revisaron. Ese análisis no equivale a ausencia garantizada de vulnerabilidades.

## 6. Criterio de cierre

Los registros acreditan regresión técnica aprobada de los conjuntos indicados y la implementación cumple el recorrido del MVP. Los resultados reales confirmados fortalecen la validación funcional sin certificar producción. La aceptación empresarial, el dictamen académico y la recepción formal de entregables son decisiones independientes aún no acreditadas por actas.

Referencias: [PRD](../PRD-borrador-tecnico.md), [evidencias](evidencias-validacion.md), [fuentes técnicas](referencias.md), [autoría](autoria-ia.md).
