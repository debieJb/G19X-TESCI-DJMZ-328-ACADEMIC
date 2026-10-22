# Registro de evidencias de implementación y validación

**Proyecto:** PluriOne — Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. · **Institución:** TESCI<br>
**Autora y responsable:** Debanie Jocabed Montoya Zúñiga<br>
**Corte documental:** 19 de octubre de 2026 · **Código contrastado:** `78c7434`.

## Índice

1. Clasificación y procedencia
2. Registro verificable
3. Capturas auténticas
4. Evidencias pendientes de incorporación
5. Aceptación formal

## 1. Clasificación y procedencia

Se separan: **I** implementación inspeccionada; **S** proveedor simulado; **R-doc** comprobación real descrita en fuente conservada; **R-resp** validación real confirmada por la responsable sin expediente exportable completo; **F** aceptación formal acreditada. Una captura de la app con datos sintéticos es auténtica como ejecución de interfaz y sigue siendo S respecto al proveedor.

La solicitud de esta edición confirma que el MVP funciona, con registro/verificación, Gmail real, generación real Gemini y envío múltiple supervisado. Esa confirmación se reconoce; no se transforma en una supuesta captura, acta, fecha de prueba o firma inexistente. No se accedió a cuentas, bandejas de entrada ni bases empresariales durante esta revisión.

## 2. Registro verificable

| ID | Resultado | Fuente concreta | Clasificación y límite |
|---|---|---|---|
| EV-01 | Base funcional desarrollada y conservada. | Commit `78c743424b84cf7ea6d7fc63d2cbf58205727c88`, rutas/modelos/servicios de la [matriz](matriz-trazabilidad.md). | I; no acta de aceptación. |
| EV-02 | 851 generales y 65 integraciones aprobadas. | [Resumen saneado](../evidencias/cierre-78c7434/resumen-validacion.json), resúmenes de logs locales comprobados. | S para proveedores; MongoDB aislado en integración. No nueva ejecución documental. |
| EV-03 | Dos recorridos Edge, 29 comprobaciones cada uno, sin errores JS. | [Reporte supervisado saneado](../evidencias/flujo-supervisado-2026-10-19/reporte-procedencia.json), `tests/soporte/campanaEnvioNavegador.cjs`. | S; interfaz auténtica de escritorio y móvil, no correos reales. |
| EV-04 | Generación auténtica Gemini; consulta de modelo y validación de estructura. | [Diagnóstico Gemini conservado](../gemini-nickki-diagnostico-2026-10-18.md), sección de comprobaciones auténticas. | R-doc; el diagnóstico registra `models.get` HTTP 200 y una generación real. No conserva prompt/respuesta completos ni acredita guardado en aquella llamada. |
| EV-05 | Recorrido IA HTTP con persistencia y borrador editable. | [IA HTTP y cuotas](../ia-http-cuotas-2026-10-18.md). | Persistencia local real y Gemini simulado en esa prueba: no duplicar como segunda generación real. |
| EV-06 | Un envío Gmail aceptado, con referencia y ejecución conservadas en la consulta de cierre anterior. | [Informe supervisado previo](../historico/corte-previo-78c7434/envio-multiple-supervisado.md), párrafo final. | R-doc de comprobación registrada; no es exportación de la base ni captura de recepción. Se omiten dirección e identificador reales. |
| EV-07 | Registro empresarial con verificación real y posterior autenticación. | Confirmación expresa de la responsable para esta edición; código de registro y SMTP. | R-resp; falta constancia saneada de extremo a extremo adjunta al expediente. No se describe como funcionalidad pendiente de desarrollo. |
| EV-08 | Envío múltiple supervisado real y resultados individuales. | Confirmación de la responsable; código y pruebas múltiples contrastados. | R-resp e I/S. Faltan exportación saneada o capturas autorizadas de esa ejecución real; no se afirma cantidad/fecha específica no proporcionada. |
| EV-09 | Aislamiento, consentimiento, cuotas, reservas y protección de duplicados. | Pruebas referidas en [QA](reporte-qa.md) y [trazabilidad](matriz-trazabilidad.md). | I/S; no demuestra todas las condiciones de fallo en producción. |
| EV-10 | Programación/consumidor automático. | `services/trabajadorCampanasService.js`, `tests/gmail.trabajador.test.js`, integración Gmail. | I/S; sin operación programada productiva acreditada. |
| EV-11 | Capacitación y aceptación. | [Material de capacitación](capacitacion.md), [matriz de entrega](indice-entrega.md). | Material disponible; impartición y F no acreditadas. |

## 3. Capturas auténticas

Las cuatro imágenes seleccionadas se copiaron, sin edición de píxeles, del ensayo supervisado existente de la base funcional. La procedencia registra SHA-256 de origen y destino, anchos probados y ausencia de proveedores externos. Los correos y nombres mostrados son sintéticos. No se usó generación de imágenes.

| Archivo | Qué demuestra |
|---|---|
| [flujo-revision-1440.png](../evidencias/flujo-supervisado-2026-10-19/flujo-revision-1440.png) | Selección y revisión actual de dos contactos en escritorio. |
| [flujo-revision-390.png](../evidencias/flujo-supervisado-2026-10-19/flujo-revision-390.png) | Mismo flujo en móvil. |
| [confirmacion-1440.png](../evidencias/flujo-supervisado-2026-10-19/confirmacion-1440.png) | Diálogo y revisión previa a confirmar, con fixture. |
| [historial-390.png](../evidencias/flujo-supervisado-2026-10-19/historial-390.png) | Resultados individuales simulados sin ofrecer repetir aceptados. |

Las capturas de `docs/evidencias/interfaz-2026-10-18/`, `sesiones-2026-10-18/` y `gmail-automatico/` se conservan como evidencia de sus etapas. Las pantallas antiguas de automatización no sustituyen la interfaz simplificada vigente. No hay captura real de Gemini incorporada que permita atribuirle visualmente una respuesta nueva.

## 4. Evidencias pendientes de incorporación

Para robustecer el dictamen, la autora puede incorporar con autorización: constancia saneada de registro/verificación/login, generación Gemini revisada y guardada, y resultados/recepción individual del ensayo múltiple real. Debe consignar entorno, fecha auténtica, pasos y resultado observado; ocultar emails personales, tokens, enlaces, credenciales, IDs sensibles y contenido privado. Los originales se conservan privadamente.

Estos son pendientes de **soporte documental**, no afirmaciones de que el sistema no funciona. No se solicita repetir envíos ni llamadas Gemini durante esta actualización.

## 5. Aceptación formal

No se encontró acta empresarial, dictamen TESCI, registro firmado de capacitación ni autorización productiva. No se fabrican. La validación técnica demostrada y las comprobaciones reales confirmadas son diferentes de esos actos.

[QA](reporte-qa.md), [informe final](informe-final-residencias.md), [autoría y uso de IA](autoria-ia.md).
