# Registro empresarial y verificación - Implementación vigente

**Proyecto:** PluriOne · **Autora:** Debanie Jocabed Montoya Zúñiga · TESCI<br>
**Edición:** 19 de octubre de 2026 · **Base:** `78c7434`.

## Índice

1. Recorrido funcional
2. Transporte y límites
3. Evidencia y formalidad

## 1. Recorrido funcional

El solicitante registra empresa y correo, verifica mediante enlace y configura
el primer administrador; después inicia sesión. `SolicitudRegistro` conserva
estados `pendiente_correo`, `correo_verificado` y `completada`. Los tokens se
almacenan como hashes, tienen caducidad y control de uso; los reenvíos y las
solicitudes tienen límites persistentes.

La solicitud HTTP no equivale a correo enviado ni crea por sí sola un acceso
administrativo válido. Las transacciones e índices controlan idempotencia y
concurrencia. Los usuarios pendientes o bloqueados no eluden verificación.

## 2. Transporte y límites

El camino vigente de correo de plataforma utiliza
`services/smtpTransaccionalService.js` y Nodemailer sobre SMTP/TLS. Está separado
del Gmail OAuth empresarial que se conecta para campañas. El adaptador Gmail
transaccional anterior se conserva en código e informes históricos; no se lo
presenta como el transporte vigente del registro.

`EMAIL_USER`, `EMAIL_PASS`, origen público y banderas se configuran privadamente.
Los scripts de despacho y el trabajador residente mantienen sus autorizaciones;
no se activan por leer este documento. Un fallo o respuesta incierta exige revisar
el estado de solicitud antes de un reenvío. No compartir enlaces completos o
credenciales con soporte.

## 3. Evidencia y formalidad

El flujo está implementado y probado; la responsable confirma verificación y
registro reales. La constancia saneada de extremo a extremo aún no está adjunta
en Git: se registra como validación confirmada, no como funcionalidad pendiente.
[QA](entrega/reporte-qa.md) y [evidencias](entrega/evidencias-validacion.md) separan
los resultados simulados y reales.

[Manual de usuario](entrega/manual-usuario.md), [manual técnico](entrega/manual-tecnico.md),
[migración SMTP histórica](migracion-smtp-transaccional-2026-10-18.md) y
[primera fase conservada](historico/corte-previo-78c7434/autoservicio-empresarial.md).
