# Flujo vigente de campañas email de PluriOne

**Base funcional:** `78c7434` · **Edición:** 19 de octubre de 2026<br>
**Autora:** Debanie Jocabed Montoya Zúñiga · TESCI · PluriOne S.A. de C.V.

## Índice

1. Recorrido común
2. Consentimiento y confirmación
3. Modos y resultados
4. Evidencia y antecedentes

## 1. Recorrido común

Crear campaña manual o aprobar una propuesta Gemini → seleccionar destinatarios
→ activar y preparar → revisar → confirmar envío → consultar resultados.
Guardar un borrador, generar texto o activar/preparar no envía correo.

En modo supervisado se eligen contactos con casillas, todos los válidos o
etiquetas. La preparación fija contactos explícitos; la revisión muestra
remitente, mensaje, direcciones, cantidad y exclusiones. Los bloqueos incluyen
acciones para conectar Gmail, corregir selección o completar preparación.

## 2. Consentimiento y confirmación

Solo se envía a contactos propios activos con canal habilitado, email válido y
consentimiento documentado. El motor deduplica direcciones y vincula confirmación
con contenido y audiencia revisados. Cambios posteriores obligan a revisar o
cancelan antes de enviar. Cada mensaje tiene un único destinatario.

## 3. Modos y resultados

| Modo | Comportamiento |
|---|---|
| Manual/piloto | Compatibilidad de un destinatario con autorización temporal y política histórica. |
| Supervisado | Confirmación única, trabajos persistidos y un destinatario por paso, sin consumidor de fondo. Recargar no reanuda. |
| Automático/programado | Consumidor y fechas implementados con pruebas simuladas. No se afirma programación productiva. |

Aceptado significa aceptado por Gmail. Rechazados, cancelados, pendientes e
inciertos tienen resultados individuales. Los aceptados no se repiten y los
inciertos requieren conciliación, no reintento automático. El motor aplica cuotas
locales, reservas y exclusión; n8n no transporta estos mensajes.

## 4. Evidencia y antecedentes

[Manual de usuario con capturas](entrega/manual-usuario.md), [motor](envios-gmail-mvp.md),
[envío supervisado](envio-multiple-supervisado.md) y [evidencias reales/simuladas](entrega/evidencias-validacion.md).
El [flujo anterior](historico/corte-previo-78c7434/flujo-campanas-integrado.md)
permanece como registro histórico, no como instrucciones del envío actual.
