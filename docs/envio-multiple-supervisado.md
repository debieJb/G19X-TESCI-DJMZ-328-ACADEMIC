# Envío múltiple supervisado - PluriOne implementado

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Autora:** Debanie Jocabed Montoya Zúñiga · TESCI<br>
**Edición documental:** 19 de octubre de 2026 · **Base funcional:** `78c7434`.

## Índice

1. Resultado actual y origen del cambio
2. Flujo implementado
3. Límites y protección
4. Automatización separada
5. Evidencia y comprobaciones futuras

## 1. Resultado actual y origen del cambio

El envío múltiple supervisado está implementado y probado. La responsable
confirma además validación con servicios reales. La constancia exportable de esa
prueba real se registra como pendiente de incorporación, sin presentar la
función como pendiente de desarrollo o como nunca utilizada.

El diagnóstico anterior encontró modo manual con un destinatario efectivo y un
control de piloto ya consumido por empresa. Ese hallazgo explica el cambio de
diseño; no se utiliza como lectura actual de la configuración privada, que no se
inspecciona ni modifica en esta edición. El control histórico no se borró para
habilitar envíos repetidos.

## 2. Flujo implementado

Crear campaña manual o Gemini → seleccionar destinatarios → activar y preparar
→ revisar → confirmar envío → consultar resultados.

En modo `supervisado`, un administrador empresarial elige contactos específicos
mediante casillas, todos los válidos o etiquetas. La preparación fija la selección
como IDs explícitos de su empresa, excluye inactivos y contactos sin evidencia de
consentimiento y elimina direcciones duplicadas. No añade contactos posteriores
sin nueva revisión.

Las huellas de contenido y audiencia ligan la confirmación a lo revisado. Una
transacción crea una ejecución única por campaña y trabajos por correo. Cada
paso HTTP procesa como máximo un destinatario con reservas y cuotas del motor
existente; no se realiza un bucle masivo de envío dentro de una solicitud.
Cada mensaje tiene un único `To`, sin `Cc/Bcc` colectivo.

## 3. Límites y protección

- Máximo configurable de 1 a 50 correos únicos por campaña; el piloto
  `manual`/`piloto` sigue forzando 1, aunque se cambie solo la variable de máximo.
- Cuotas locales: 30/hora y 100/día por empresa, 500/día globales; separación de
  2 s por empresa y 1 s global; reserva de 120 s.
- La página procesa pasos acotados con espera de 2.2 s y se detiene ante fallos;
  el servidor conserva autoridad sobre cuotas y velocidad.
- Una aceptación no se repite; un resultado incierto exige conciliación y no se
  reintenta automáticamente. En modo supervisado tampoco se reintenta por sí solo
  un rechazo de cuota. La pausa de cuota del proveedor queda persistida.
- Recargar no envía ni reanuda; continuar pendientes requiere una acción
  explícita permitida sobre la ejecución confirmada.
- El remitente proviene del OAuth de la empresa y se revalida junto con actor,
  campaña y consentimiento. No se permite suplantarlo desde HTTP.

El límite local no garantiza cuota disponible en Google. Aceptado por Gmail no
significa recibido, leído o convertido.

## 4. Automatización separada

El modo `supervisado` no inicia un consumidor y sus trabajos tienen un modo
propio. El trabajador automático solo se prepara bajo su política explícita;
puede consumir pendientes al arrancar, por lo que no debe habilitarse para
resolver bloqueos. El modo programado está implementado y probado con simulación;
no existe evidencia de operación programada productiva. n8n no es transporte del
motor actual.

## 5. Evidencia y comprobaciones futuras

Se verificaron registros de 851 generales, 65 integraciones y dos ensayos Edge
con 29 comprobaciones cada uno. El recorrido múltiple integra campañas manuales
y Gemini, concurrencia, fallos parciales, consentimiento, cuotas e inciertos.
La generación auténtica Gemini, el envío Gmail aceptado documentado y las
confirmaciones reales de la responsable se separan en el
[registro de evidencia](entrega/evidencias-validacion.md).

Para una prueba real nueva deben autorizarse previamente remitente, contenido y
buzones propios; empezar con dos contactos documentados, revisar el límite,
confirmar una vez y verificar resultados y recepción por separado. No repetir
un ensayo ya aceptado solo para generar documentación. Esta edición no ejecuta
campañas ni modifica variables privadas.

[Manual de usuario](entrega/manual-usuario.md), [manual técnico](entrega/manual-tecnico.md),
[QA](entrega/reporte-qa.md), [arquitectura](SDD-borrador-tecnico.md) y
[diagnóstico y procedimiento anterior](historico/corte-previo-78c7434/envio-multiple-supervisado.md).
