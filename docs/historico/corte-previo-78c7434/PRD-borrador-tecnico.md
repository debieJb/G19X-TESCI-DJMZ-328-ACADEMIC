> **Antecedente histórico.** Texto del corte funcional `78c7434`, conservado para trazabilidad. Sus afirmaciones de estado y pendientes no describen la entrega documental actual. Consulte el [índice vigente](../../entrega/indice-entrega.md). Las rutas de enlaces se adaptaron a esta ubicación.

# PRD - BORRADOR TÉCNICO SIN APROBACIÓN

No se encontró un PRD oficial identificable en el repositorio revisado. Este esquema deriva del código, pruebas e instrucción de alcance actual; no reproduce ni sustituye requisitos oficiales desconocidos de PluriOne. Responsable, versión oficial, firmas, aprobación y correspondencia con requisitos originales: **pendientes de confirmar**.

## Objetivo propuesto

Preparar y automatizar campañas de correo electrónico por empresa, con consentimiento, seguridad, asistencia IA, Gmail y métricas. El MVP no está listo ni autorizado para publicación hasta completar auditoría de seguridad y validaciones de aceptación.

## Actores y recorrido

Empresa solicita registro, verifica correo y configura administrador/contraseña; después inicia sesión. Administrador y operador actúan dentro de su empresa. El administrador gestiona Gmail y autoriza el piloto; superadmin administra la plataforma sin suplantar el envío empresarial. Código de permisos y restricciones del motor prevalecen sobre descripciones históricas amplias.

## Requisitos técnicos propuestos, no identificadores oficiales

| ID de borrador | Requisito | Verificación y aceptación |
|---|---|---|
| BT-01 | Empresas, acceso, roles y aislamiento. | Probar acceso propio y rechazo cruzado; auditoría pendiente. |
| BT-02 | Registro con verificación antes de configurar administrador. | Pruebas actuales; flujo real de correo transaccional pendiente. |
| BT-03 | Contactos con consentimiento registrable/revocable y evidencia. | Fecha/autor/email, concurrencia y exclusión de revocados; retención por definir. |
| BT-04 | Borradores y preparación de campañas exclusivamente email. | Guardar no envía ni acredita programación efectiva. |
| BT-05 | OAuth y Gmail API por empresa, sin n8n obligatorio. | Permisos, identidad, cuotas y un intento autorizado; prueba real pendiente. |
| BT-06 | IA asistida con privacidad, cuotas y revisión humana. | Gemini simulado en pruebas; validación real y calidad por acordar. |
| BT-07 | Métricas administrativas y resultados de campaña. | Conteos/estados existentes; aperturas, clics y rebotes no acreditados. Definir eventos, denominadores y criterios. |
| BT-08 | Seguridad, sesiones persistentes y operación controlada. | Auditoría, HTTPS y validación de despliegue antes de aceptación/publicación. |

Facebook, WhatsApp y LinkedIn: exclusiones del MVP, no defectos ni pendientes de aceptación. Modificación formal de los requisitos multicanal originales: no confirmada. No se presupone exclusión de IA ni métricas.

## Campos por completar con documentos oficiales

- Propietario del producto y autoridad de aprobación formal.
- Versión/base de requisitos originales, identificadores y acta del cambio de alcance.
- Criterios medibles de IA, métricas, programación y operación; prioridad y límites de esta versión.
- Evidencias de aceptación reales, fecha, responsables y riesgos aceptados expresamente.

La [matriz vigente](../../alcance-mvp-actual.md) separa implementación, evidencia de pruebas y validación real. Este borrador no autoriza proveedores, datos, migraciones ni envíos.
