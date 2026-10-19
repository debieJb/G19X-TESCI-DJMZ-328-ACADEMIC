# Motor Gmail API - MVP implementado de PluriOne

**Base funcional:** `78c7434` · **Edición:** 19 de octubre de 2026<br>
**Autora:** Debanie Jocabed Montoya Zúñiga · TESCI · PluriOne S.A. de C.V.

## Índice

1. Funcionamiento
2. Consistencia y cuotas
3. Modos y automatización
4. Evidencia y límites

## 1. Funcionamiento

El motor envía directamente por Gmail API con el OAuth de la empresa. No utiliza
SMTP transaccional ni necesita n8n para campañas. La empresa, actor e identidad
se obtienen y validan en servidor. El contenido de texto se convierte en MIME;
cada mensaje contiene un solo destinatario, sin `Cc/Bcc` colectivo.

La revisión humana precede a la confirmación. En modo supervisado la selección
se fija antes de enviar y se vincula mediante huellas al contenido y al
consentimiento. Los cambios posteriores no autorizan una audiencia nueva.

## 2. Consistencia y cuotas

Una transacción crea la ejecución y trabajos individuales. Índices únicos,
reservas y cuotas coordinan concurrencia. Los estados individuales incluyen
pendiente, reservado, enviando, aceptado, rechazado, cancelado e incierto.
Un resultado aceptado no se reenvía; uno incierto no se reintenta automáticamente.
No se promete entrega externa exactamente una vez ante cualquier fallo.

La política local admite hasta 50 correos por campaña en modo múltiple, 30/hora y
100/día por empresa y 500/día globales, con 2 s por empresa, 1 s global y reserva
de 120 s. Las restricciones del proveedor también aplican; no se garantiza que
una cuenta tenga disponible toda la cuota local.

## 3. Modos y automatización

- Manual/piloto: un destinatario y autorización histórica. El límite efectivo
  permanece uno y el control puede estar consumido; no se elimina para reenviar.
- Supervisado: una confirmación y como máximo un destinatario por paso HTTP;
  texto e inmediato, sin trabajador de fondo. El cliente procesa pasos acotados y
  se detiene ante errores. Recargar no consume ni reanuda pendientes.
- Automático: consumidor y fecha programada implementados y probados con
  proveedor simulado. El arranque habilitado puede consumir pendientes y preparar
  índices; no es una opción inocua de diagnóstico. No se acredita producción.

La selección de `modoMotor` separa trabajos supervisados de consumidores de
otros modos. No se convierte una campaña programada en inmediata desde revisión.
El motor actual no envía la imagen que pudiera existir en un borrador.

## 4. Evidencia y límites

Gmail real se probó y existe referencia documental de un envío aceptado. La
responsable confirma envío múltiple supervisado real. Las integraciones
regresivas siguen simulando Google y prueban persistencia aislada, fallos,
concurrencia y cuotas. No se debe denominar a todo el sistema «solo simulación».

[Supervisado](envio-multiple-supervisado.md), [arquitectura](SDD-borrador-tecnico.md),
[manual](entrega/manual-usuario.md), [QA](entrega/reporte-qa.md) y
[evidencias](entrega/evidencias-validacion.md). La
[documentación del motor inicial](historico/corte-previo-78c7434/envios-gmail-mvp.md)
permanece como antecedente con sus controles de etapa.
