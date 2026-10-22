# Asistente de campañas Gemini - Estado implementado

**Proyecto:** PluriOne · **Autora:** Debanie Jocabed Montoya Zúñiga · TESCI<br>
**Edición:** 19 de octubre de 2026 · **Base:** `78c7434`.

## Índice

1. Función y validación
2. Uso y protección de información
3. Implementación y cuotas
4. Configuración y evidencias

## 1. Función y validación

El asistente está implementado en `/empresa/ia`. La generación auténtica Gemini
está documentada en el [diagnóstico conservado](gemini-nickki-diagnostico-2026-10-18.md)
y confirmada por la responsable. No se describe como integración jamás probada.
Ese diagnóstico registró consulta de modelo y una generación; no acredita por sí
solo que aquella respuesta se guardara como campaña ni una evaluación estadística
de calidad.

## 2. Uso y protección de información

Administrador u operador autorizado redacta instrucciones, confirma privacidad,
genera, revisa/edita y aprueba el guardado como borrador. Las sugerencias de
segmentación no seleccionan contactos automáticamente. El borrador continúa al
mismo flujo de revisión que uno manual. La persona decide contenido, destinatarios
y confirmación final.

No introducir contraseñas, tokens, direcciones de contactos o información privada
en instrucciones. El flujo no consulta contactos para remitirlos al proveedor.
Las respuestas son texto validado y escapado; no ejecutan herramientas, n8n ni
correo. Una imagen almacenada localmente no se convierte en adjunto Gmail.

## 3. Implementación y cuotas

`services/iaService.js` coordina autorización, propuestas y aprobación;
`services/ia/geminiProveedor.js` integra REST; `services/ia/limitesIA.js` aplica
ventanas locales de 3 llamadas/minuto y 20/día por empresa y limita ocupación en
el proceso a dos empresas y una operación por empresa. Esos controles no
representan la cuota remota de Google ni una garantía global entre todos los
procesos.

Los backends son `dev_fixture`, `piloto_local` en desarrollo y `protected`, exigido
por el selector en producción. El almacén local de piloto no es la configuración
universal de otras empresas ni un reemplazo productivo. Los fallos se muestran
sin inventar una respuesta exitosa de proveedor.

## 4. Configuración y evidencias

La cuenta requiere clave privada, modelo accesible, proveedor y banderas
apropiadas, más backend de cuotas autorizado. `AI_FREE_TIER_CONFIRMED` es una
confirmación local, no un comprobante de facturación. No se publica una clave o
modelo privado en este manual.

[Manual técnico](entrega/manual-tecnico.md), [evidencias](entrega/evidencias-validacion.md),
[QA](entrega/reporte-qa.md), [autoría](entrega/autoria-ia.md). La
[versión histórica](historico/corte-previo-78c7434/asistente-ia.md) conserva los
bloqueos y pendientes de la implementación inicial.
