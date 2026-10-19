# PluriOne: envío múltiple supervisado

## Diagnóstico recuperado

La configuración local estaba en `GMAIL_CAMPAIGNS_MODE=manual`, con
`GMAIL_CAMPAIGNS_MAX_RECIPIENTS=1`. El modo manual fuerza un destinatario incluso
si se cambia únicamente esa variable. Además, el control histórico del piloto
de un único envío por empresa ya estaba consumido. Había una campaña pendiente
con dos contactos. La empresa estaba activa y verificada, con email habilitado,
Gmail conectado y permiso de envío. Las campañas pendientes estaban activas,
preparadas, con asunto y texto, sin imagen. El envío anterior permanecía aceptado.

No se borró ni renovó el control del piloto y no se modificó `.env`.

## Funcionamiento

El modo nuevo es `supervisado`, separado de `manual` y `automatico`.
Solo admite envío inmediato de texto, por un administrador de la propia empresa.
El arranque valida transacciones e índices existentes; no inicia un consumidor,
no crea índices ni colecciones y no consume trabajos antiguos.

Crear manualmente o con Gemini conduce a la misma pantalla. Se eligen contactos
específicos, todos los válidos o etiquetas. Al pulsar «Activar y preparar» se
fijan hasta 50 contactos válidos como una selección explícita. Nuevos contactos
o cambios de etiquetas no amplían esa selección. Se excluyen inactivos, contactos
sin consentimiento documentado y correos duplicados; no se admiten IDs ajenos.
La revisión muestra cantidad, destinatarios, exclusiones, remitente y contenido.

La confirmación valida la versión del contenido y una huella de los destinatarios
y sus evidencias de consentimiento. Una transacción crea una ejecución única
por campaña y un trabajo por correo. Cada paso HTTP procesa **como máximo un
destinatario**, reutilizando reservas, cuotas, control de velocidad y MIME del
motor existente. Cada mensaje tiene un único `To`, sin `Cc` ni `Bcc`.

La página procesa hasta 50 pasos, separados por 2.2 segundos, únicamente después
de confirmar. Detiene el recorrido ante errores, rechazo o incertidumbre. Los
límites reales del motor siguen siendo autoritativos aunque se manipule el navegador.
Cerrar o recargar la página no reanuda nada. Los pendientes se pueden continuar
con un botón explícito; los aceptados nunca se repiten. Si existe incertidumbre,
se bloquea continuar hasta una conciliación fuera de este flujo. No hay reintento
automático de cuota o incertidumbre en modo supervisado.

Los trabajos `supervisado` tienen modo propio: ni el consumidor automático ni el
piloto manual los procesan. El paso supervisado exige campaña, ejecución y actor
original; no permite procesar ejecuciones de modos anteriores. La programación
permanece separada y no se convierte en envío inmediato desde esta pantalla.

## Límites

Por campaña: valor explícito de 1 a 50. Localmente: 30 mensajes/hora y 100/día por
empresa; 500/día globales; separación mínima de 2 segundos por empresa y 1 global.
Las reservas duran dos minutos. Los límites locales no garantizan disponibilidad
de la cuenta Google: también aplican sus cuotas, restricciones de cuenta y API.
Un rechazo de cuota deja una pausa persistente de al menos 15 minutos y resultados
individuales; los pendientes permanecen guardados.

Referencias: [cuotas Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota)
y [gestión de errores](https://developers.google.com/workspace/gmail/api/guides/handle-errors).

## Prueba real controlada, pendiente de autorización

1. Confirmar autorización del remitente, dos buzones propios y contenido exacto.
   Revisar que no existan resultados inciertos ni reservas anteriores sin conciliar.
2. Registrar ambos contactos en la misma empresa con email activo y consentimiento
   documentado para cada dirección. Verificar Gmail OAuth y permiso de envío.
3. En el proceso que se usará para la prueba, conservar la empresa autorizada y
   establecer solo estas opciones no secretas (no modificar credenciales):

   ```powershell
   $env:GMAIL_CAMPAIGNS_MODE = 'supervisado'
   $env:GMAIL_CAMPAIGNS_MAX_RECIPIENTS = '2'
   $env:GMAIL_CAMPAIGNS_ENABLED = 'true'
   ```

   Reiniciar únicamente el servidor web acordado para que valide este modo.
   No usar `automatico`, no iniciar scripts de trabajadores y no migrar historial.
   Estas opciones todavía **no se aplicaron** al entorno real.
4. Crear una campaña nueva de texto. Elegir los dos contactos; pulsar «Activar y
   preparar». Revisar que aparezcan exactamente dos destinatarios y cero bloqueos.
5. Con la autorización real ya obtenida, confirmar una sola vez. Mantener abierta
   la página hasta ver dos resultados individuales. Ante un fallo, detenerse y
   revisar el historial; ante incertidumbre, no volver a enviar.
6. Comprobar dos aceptaciones y dos referencias diferentes, y confirmar recepción
   en ambos buzones por separado. Recargar debe conservar resultados sin envíos.
   El envío histórico anterior debe seguir intacto y fuera de esta ejecución.
7. Apagar la bandera en el proceso de prueba al finalizar. No ampliar el límite
   hasta revisar resultados y obtener autorización para el siguiente alcance.

## Validación simulada

Los ensayos nuevos cubren selección por contactos/todos/etiquetas, exclusiones,
huella de destinatarios, consentimiento cambiado, cuotas, límites, MIME individual,
concurrencia, confirmación repetida, resultados parciales e inciertos y separación
de modos. El recorrido HTTP completo prueba campañas manuales y de Gemini con
dos destinatarios. Edge prueba escritorio (1440 px) y móvil (390 px), cancelación,
confirmación e historial, usando dobles sin proveedores externos.

Las integraciones utilizan bases temporales propias y la referencia de seguridad
de la sesión de recuperación; la referencia histórica del proyecto no se modifica.
La única diferencia esperada del MongoDB principal tras el apagón es su PID.

Resultado final sobre el código guardado: **851/851 pruebas generales**, **65/65
integraciones**, y **58 comprobaciones en Edge** (29 del modo múltiple y 29 del
piloto original), con escritorio y móvil, 12 capturas y cero errores JavaScript.
Registros locales ignorados por Git: `multi-suite.log`, `multi-integracion.log`,
`multi-navegador.log` y `multi-navegador-piloto.log`.

La consulta final del entorno real encontró un envío aceptado, con referencia y
ejecución conservadas, y cero ejecuciones supervisadas. La configuración sigue
en modo manual con límite efectivo uno. No se enviaron correos reales, no se
iniciaron trabajadores y no se ejecutaron commit ni push.
