# Referencias técnicas y documentales

**Proyecto:** PluriOne · **Autora:** Debanie Jocabed Montoya Zúñiga · TESCI<br>
**Consulta documental:** 19 de octubre de 2026 · Base implementada `78c7434`.

## Índice

1. Fuentes primarias del proyecto
2. Referencias técnicas oficiales
3. Alcance de las fuentes

## 1. Fuentes primarias del proyecto

- Repositorio: [debieJb/G19X-TESCI-DJMZ-328-ACADEMIC](https://github.com/debieJb/G19X-TESCI-DJMZ-328-ACADEMIC).
- Base funcional: [commit 78c743424b84cf7ea6d7fc63d2cbf58205727c88](https://github.com/debieJb/G19X-TESCI-DJMZ-328-ACADEMIC/commit/78c743424b84cf7ea6d7fc63d2cbf58205727c88).
- Manifiesto y versiones resueltas: [package.json](../../package.json), [package-lock.json](../../package-lock.json).
- [Registro de evidencia](evidencias-validacion.md), [QA](reporte-qa.md) y [trazabilidad](matriz-trazabilidad.md).
- Confirmaciones de la responsable proporcionadas en la solicitud de esta actualización: identidad académica, empresa, institución, libertad tecnológica y validaciones reales. No se presentan como acta firmada ni se reproduce la conversación privada.

## 2. Referencias técnicas oficiales

| Autor institucional | Recurso | Uso en el expediente |
|---|---|---|
| Node.js | [Test runner, rama 24](https://nodejs.org/docs/latest-v24.x/api/test.html) | Ejecución de pruebas y dobles. El código se contrasta con Node 24; la web oficial puede mostrar otras versiones. |
| Express | [Documentación del framework](https://expressjs.com/) | Rutas y middleware de aplicación web. |
| MongoDB | [Transactions](https://www.mongodb.com/docs/manual/core/transactions/) | Consistencia transaccional; no implica topología local correcta por sí sola. |
| Mongoose | [Documentación](https://mongoosejs.com/docs/) | Modelos, validación e índices en el ODM. |
| EJS | [Documentación](https://ejs.co/) | Vistas y renderizado del lado servidor. |
| Google | [OAuth 2.0 para aplicaciones de servidor](https://developers.google.com/identity/protocols/oauth2/web-server) | Autorización de cuenta empresarial. |
| Google | [Gmail users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) | Método de envío MIME del motor directo. |
| Google | [Cuotas Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota) | Límites externos, distintos de las cuotas locales del software. |
| Google | [Gemini: generación de texto](https://ai.google.dev/gemini-api/docs/text-generation) | Integración REST de propuestas; no acredita calidad ni cuota de una cuenta particular. |
| Nodemailer | [Documentación SMTP](https://nodemailer.com/smtp) | Adaptador del correo transaccional de plataforma. |
| Git | [Documentación](https://git-scm.com/docs) | Historial, revisión y control de cambios. |
| GitHub | [Documentación](https://docs.github.com/) | Hospedaje y revisión del repositorio; no es acta empresarial. |
| n8n | [Documentación](https://docs.n8n.io/) | Referencia de la herramienta histórica; no evidencia de uso operativo en este MVP. |
| Mermaid | [Diagramas entidad-relación](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) | Notación de los diagramas documentales; no es dependencia de ejecución de la aplicación. |

## 3. Alcance de las fuentes

Las fuentes oficiales describen tecnologías y contratos, no certifican la configuración de PluriOne. Las versiones del software se toman del repositorio y su lockfile, no de la última versión publicada en internet. El código y los ensayos sustentan la implementación; las actas empresariales/académicas requieren evidencia independiente. No se utiliza una página de proveedor como prueba de envío, recepción, facturación o aceptación del proyecto.
