# Memoria técnica del MVP implementado

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** TESCI · **Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 19 de octubre de 2026 · Base `78c7434`.

## Índice

1. Problema y estrategia
2. Evolución de la solución
3. Integraciones y flujo final
4. Incidencias y decisiones
5. Resultados y aprendizaje
6. Límites y referencias

## 1. Problema y estrategia

El proyecto organiza campañas de varias empresas con identidad de remitente, consentimiento y revisión humana. Se implementó un monolito modular con Express/EJS y persistencia MongoDB/Mongoose. La separación de servicios permite probar proveedor, autorización y almacenamiento sin enviar mensajes reales en cada regresión.

## 2. Evolución de la solución

El historial registra integración de controles multiempresa, verificación empresarial, cuotas IA y asistente; después motor Gmail directo e interfaz empresarial; finalmente simplificación del recorrido y envío múltiple supervisado. Las referencias temporales verificables están en el [plan reconstruido](plan-proyecto.md). No se presupone que esos commits representen toda la duración de la residencia.

Los contratos n8n y canales anteriores se conservaron para compatibilidad, con bloqueo de ejecución. La solución final de campañas utiliza Gmail API directamente; el correo transaccional de plataforma usa el adaptador SMTP y un flujo de despacho distinto.

## 3. Integraciones y flujo final

La solicitud empresarial se verifica antes de configurar el administrador. Los recursos se filtran por empresa. La campaña nace manualmente o de una propuesta Gemini revisada; ninguna generación selecciona contactos ni envía por sí sola.

La revisión fija contactos elegibles, elimina direcciones repetidas y documenta exclusiones. La confirmación vincula contenido y audiencia. Una ejecución agrupa trabajos individuales y el motor revalida identidad, consentimiento, cuota y reserva antes de cada llamada. Los resultados persistidos soportan historial y recuperación conservadora.

## 4. Incidencias y decisiones

| Hallazgo documentado | Decisión aplicada y evidencia |
|---|---|
| El piloto manual forzaba un destinatario y podía quedar consumido por empresa. | Crear modo supervisado separado, sin borrar el control histórico: [flujo y diagnóstico](../envio-multiple-supervisado.md). |
| Una confirmación o respuesta perdida podía confundirse con permiso de reenviar. | Idempotencia, índices, reservas y estado incierto; pruebas de concurrencia y fallos de persistencia. |
| Un proceso web podía tener distinta configuración de cuotas IA a la esperada. | Diagnóstico y validación de backend al arrancar: [informe de la etapa](../ia-http-cuotas-2026-10-18.md). |
| La inicialización de Edge falló con un timeout CDP. | La repetición del ensayo pasó sin cambio del motor Gmail o Gemini. No se declara causa raíz demostrada del timeout original. |
| Un apagado interrumpió el trabajo local. | Inspección de Git y archivos, respaldo privado y revalidación; no se utilizó reset/clean ni se reconstruyó historial como recuperación. |

## 5. Resultados y aprendizaje

La base funcional cuenta con 851 pruebas generales y 65 integraciones aprobadas en registros conservados. Existen ensayos reales de la interfaz con datos sintéticos y confirmaciones de servicios reales clasificadas en [evidencias](evidencias-validacion.md).

La experiencia muestra que autorización empresarial, consentimiento, preparación y confirmación son decisiones diferentes; también que una respuesta aceptada por API no demuestra recepción o impacto comercial. La revisión de código y las pruebas negativas resultan necesarias junto con el recorrido positivo.

## 6. Límites y referencias

No se cuantifica ahorro ni aumento de ventas; no se presenta programación productiva, monitoreo 24/7, auditoría externa o aceptación firmada sin evidencia. El alcance académico concluido es el MVP descrito en el [PRD](../PRD-borrador-tecnico.md). La [arquitectura](../SDD-borrador-tecnico.md), [QA](reporte-qa.md) y [declaración de autoría/IA](autoria-ia.md) permiten contrastar esta memoria.
