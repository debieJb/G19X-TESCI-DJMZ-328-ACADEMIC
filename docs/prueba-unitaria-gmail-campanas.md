# Prueba controlada de campañas Gmail

El transporte oficial es Gmail API con el OAuth cifrado de la empresa. SMTP
continúa reservado al correo transaccional. No se necesita n8n.

## Antes de habilitar

Obtener autorización expresa del remitente, un destinatario de prueba con
consentimiento y el asunto y mensaje exactos. Revisar que no haya trabajos
pendientes anteriores para las empresas que se habilitarán: el trabajador
automático consume trabajos confirmados pendientes al arrancar.
Las confirmaciones antiguas sobre borradores ya no habilitan el envío: ahora
se exige campaña activa y la revisión también incluye su estado. No recrear
trabajos ni campañas para resolver un resultado anterior sin investigarlo.

Diagnóstico sin envío ni escrituras:

```powershell
node scripts/diagnosticarGmailCampanas.js --mongo
```

La política predeterminada permanece cerrada. Después de autorizar la prueba,
configurar en el proceso del servidor (no son credenciales):

- `GMAIL_CAMPAIGNS_ENABLED=true`
- `GMAIL_CAMPAIGNS_MODE=automatico`
- `GMAIL_CAMPAIGNS_PILOT_COMPANIES=<ID de la única empresa autorizada>`
- `GMAIL_CAMPAIGNS_MAX_RECIPIENTS=1`

Reiniciar con `npm.cmd start`. No ejecutar otro servidor en el mismo puerto.
El arranque valida OAuth, exige un replica set y crea aditivamente las
colecciones e índices declarados del motor. Un índice incompatible detiene
el arranque; no se borran índices ni datos para corregirlo automáticamente.
El mismo proceso inicia el trabajador: no ejecutar un segundo motor n8n.

## Desde el navegador

1. Entrar a `http://localhost:3000/login` como administrador de esa empresa.
2. Revisar en `/empresa/gmail` la cuenta conectada y su permiso de envío.
3. Crear un borrador de texto, sin imagen, con asunto y mensaje autorizados.
4. En «Preparar o confirmar envío Gmail», seleccionar únicamente el contacto
   de prueba activo con consentimiento válido y guardar modalidad inmediata.
5. En «Editar», cambiar la campaña a activa y guardar. Activarla no envía.
6. Volver a la preparación y revisar remitente, destinatario y contenido.
   Confirmar la casilla y pulsar «Enviar ahora» una sola vez.
7. Consultar el historial persistente. `aceptado` con ID Gmail significa
   aceptación por API; solo la recepción confirmada valida la entrega real.

No volver a confirmar ni crear otra campaña si el resultado es `incierto`.
Los timeouts, cortes de conexión y resultados ambiguos no se reenvían
automáticamente. Los rechazos inequívocos de cuota admiten espera y reintentos
limitados; la revocación OAuth suspende el procesamiento hasta reconectar.

Para cerrar la prueba, apagar `GMAIL_CAMPAIGNS_ENABLED` en el proceso y
reiniciar. No elevar el límite de un destinatario sin otra autorización.
