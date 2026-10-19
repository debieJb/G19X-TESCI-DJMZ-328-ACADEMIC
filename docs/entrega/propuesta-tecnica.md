# Propuesta técnica de la solución implementada

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Organización:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** TESCI · Ingeniería en Sistemas Computacionales<br>
**Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 1.0 documental, 19 de octubre de 2026 · Base `78c7434`.

## Índice

1. Necesidad y solución
2. Libertad tecnológica
3. Stack y justificación
4. Recursos y dependencias
5. Beneficios, costos y restricciones
6. Validación y conclusión

## 1. Necesidad y solución

La solución concentra contactos, consentimiento, contenido y resultados de campañas por empresa. Una aplicación web permite crear mensajes manualmente o con Gemini y enviarlos con el Gmail OAuth de la empresa, previa revisión humana. El diseño evita exponer todos los destinatarios en un mismo mensaje y conserva estados individuales.

Es la propuesta técnica de la solución ya ejecutada, no una promesa de desarrollo futuro ni una reproducción de la propuesta empresarial original, cuya copia firmada no está en el repositorio.

## 2. Libertad tecnológica

La responsable informa que PluriOne autorizó utilizar las tecnologías que se consideraran apropiadas y que la lista inicial era orientativa. Por ello, la evaluación del stack se hace por su correspondencia con el MVP y el código, no por coincidencia nominal con herramientas sugeridas inicialmente. No se atribuyen fecha, firmante o acta a esa autorización cuando no existe soporte documental.

## 3. Stack y justificación

Versiones declaradas en [package.json](../../package.json); [package-lock.json](../../package-lock.json) fija la resolución reproducible.

| Tecnología/componente | Uso comprobado | Justificación frente a requisitos |
|---|---|---|
| Node.js 24 y JavaScript/CommonJS | Servidor, scripts, pruebas y cliente web. | Un lenguaje común facilita integración HTTP, tareas asíncronas y mantenimiento (RNF-06). |
| Express `^5.2.1` | Rutas, middleware, sesiones y controladores. | Centraliza autorización, formularios y CSRF (RF-02/03, RNF-02). |
| EJS `^6.0.1`, HTML y CSS | Renderizado en servidor y vistas adaptables. | Formularios y revisión humana sin separar otro frontend/despliegue (RF-05/12). |
| MongoDB y Mongoose `^9.10.0` | Documentos empresariales, estados, índices y transacciones. | Consistencia de solicitudes, ejecuciones y reservas (RF-01/11). La versión binaria de MongoDB depende del entorno; no se confunde con la versión del ODM. |
| Gmail API y OAuth 2.0 | Identidad empresarial y envío directo. | Remitente conectado por empresa y resultados individuales (RF-07/10). |
| `google-auth-library` `^11.3.0` y criptografía de Node | OAuth y protección de credenciales. | Autorización y renovación controladas, sin introducir tokens en formularios. |
| Gemini API vía REST | Generación de campañas asistidas. | Redacción con privacidad, cuotas y aprobación humana (RF-06). No se impone un modelo que el proyecto no tenga autorizado. |
| Nodemailer `^10.1.7`, SMTP/TLS | Correo transaccional de registro. | Verificación de plataforma separada del Gmail OAuth de cada empresa (RF-01). |
| bcryptjs `^3.0.3`, express-session `^1.19.0`, dotenv `^17.4.2` | Contraseñas, sesión y configuración privada. | Controles de acceso y separación de secretos (RNF-01). |
| `node:test`, Supertest `^7.2.2`, Edge/CDP | Suite general, HTTP y recorridos visuales. | Evidencia reproducible sin mensajes reales en regresiones (RNF-05/06). |
| Git y GitHub | Historial y publicación del código base. | Trazabilidad de cambios y revisión de entrega. |
| n8n | Contratos heredados en servicios y referencias históricas. | No integra el camino operativo actual de Gmail. No hay exportación de workflow ni evidencia de despliegue activo. No se atribuye automatización productiva a su mera mención. |

FastAPI, React, PostgreSQL, Azure, Redis y Power BI no están acreditados como componentes implementados. No se presentan como herramientas utilizadas ni como dependencias de instalación.

## 4. Recursos y dependencias

Se requieren entorno Node compatible, MongoDB con topología e índices apropiados, cuenta/configuración Google autorizada y backend de cuotas IA adecuado. El código no incorpora credenciales ni bases de datos de la empresa. Los manifiestos locales no son infraestructura productiva transferible sin revisión.

Los modos de envío se separan deliberadamente: piloto histórico unitario, supervisado inmediato y automático con consumidor. Activar el modo automático al arrancar puede consumir pendientes; no es un requisito para usar el modo supervisado.

## 5. Beneficios, costos y restricciones

Se obtiene trazabilidad técnica de campañas y un recorrido común manual/IA. No se cuantifican ahorros, conversiones, disponibilidad o retorno económico sin medición. Los costos reales dependen de cuentas, modelos, infraestructura y condiciones del proveedor; una bandera local de nivel gratuito no demuestra facturación cero.

El MVP se concentra en email de texto. No acredita campañas sociales, envío de imágenes, métricas comerciales instrumentadas ni programación en producción. Estas limitaciones no invalidan la funcionalidad implementada del alcance académico.

## 6. Validación y conclusión

La solución tiene soporte de código, 851 pruebas generales y 65 integraciones en registros conservados, más recorridos de navegador. La responsable confirma validaciones reales; su detalle y calidad de evidencia se clasifican en [evidencias](evidencias-validacion.md). La selección tecnológica responde al flujo y a sus controles. La aceptación de PluriOne permanece como proceso formal independiente.

Referencias: [PRD](../PRD-borrador-tecnico.md), [SDD](../SDD-borrador-tecnico.md), [fuentes técnicas](referencias.md), [autoría](autoria-ia.md).
