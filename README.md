# Plataforma Inteligente de Marketing Automation - PluriOne

MVP desarrollado y funcional para campañas **email** con registro empresarial
verificado, roles, aislamiento multiempresa, contactos y consentimiento, creación
manual o Gemini, Gmail OAuth/API y envío múltiple supervisado con resultados por
destinatario.

**Empresa:** PluriOne S.A. de C.V. — Develop Talent & Technology<br>
**Institución:** Tecnológico de Estudios Superiores de Cuautitlán Izcalli (TESCI)<br>
**Autora y responsable académica:** Debanie Jocabed Montoya Zúñiga<br>
**Base funcional:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`<br>
**Rama:** `respaldo-avances-18-oct` · **Edición documental:** 19 de octubre de 2026.

## Índice

1. Entrega y documentación
2. Funcionamiento
3. Validación y aceptación
4. Tecnologías
5. Instalación y pruebas
6. Seguridad, límites y antecedentes

## 1. Entrega y documentación

El [expediente de entrega](docs/entrega/indice-entrega.md) identifica los diez
entregables empresariales y sus rutas concretas. Incluye:

- [PRD del MVP implementado](docs/PRD-borrador-tecnico.md) y [trazabilidad](docs/entrega/matriz-trazabilidad.md).
- [Arquitectura SDD](docs/SDD-borrador-tecnico.md), [propuesta técnica](docs/entrega/propuesta-tecnica.md) y [memoria técnica](docs/entrega/memoria-tecnica.md).
- [Manual de usuario](docs/entrega/manual-usuario.md) y [manual técnico e instalación](docs/entrega/manual-tecnico.md).
- [QA](docs/entrega/reporte-qa.md), [evidencias de Gmail/Gemini](docs/entrega/evidencias-validacion.md) y [alcance vigente](docs/alcance-mvp-actual.md).
- [Plan del proyecto](docs/entrega/plan-proyecto.md), [mantenimiento](docs/entrega/plan-mantenimiento.md), [capacitación](docs/entrega/capacitacion.md) e [informe final](docs/entrega/informe-final-residencias.md).
- [Declaración de autoría y uso responsable de IA](docs/entrega/autoria-ia.md).

Los nombres históricos de archivo del PRD/SDD se conservan para compatibilidad;
sus títulos y contenido corresponden al MVP implementado.

## 2. Funcionamiento

**Crear campaña → seleccionar destinatarios → activar y preparar → revisar →
confirmar envío → consultar resultados.**

Manual y Gemini comparten el recorrido posterior al borrador. La IA propone
contenido y requiere revisión humana; no selecciona contactos ni envía campañas.
El registro utiliza correo transaccional SMTP de plataforma, separado de la
cuenta Gmail OAuth de cada empresa.

El modo supervisado permite específicos, todos los válidos o etiquetas, con
selección fijada antes de confirmar. Cada mensaje tiene un único destinatario;
el motor aplica cuotas, reservas, idempotencia y revalidación de consentimiento.
Recargar no envía ni reanuda; un resultado incierto no se reintenta automáticamente.
El piloto manual histórico permanece unitario. La programación automática está
implementada y probada con simulación; su operación productiva no está acreditada.

## 3. Validación y aceptación

Los registros conservados verifican **851/851 pruebas generales** y **65/65
integraciones** aprobadas. Dos ensayos Edge aportan 58 comprobaciones en total,
con datos sintéticos, en escritorio y móvil. No son ejecuciones nuevas de esta
edición documental ni evidencia de 100 % de cobertura de código.

Hay una generación auténtica Gemini documentada y un envío Gmail aceptado
registrado en el cierre anterior. La responsable confirma además registro y
verificación reales y envío múltiple supervisado real. El [registro de
evidencias](docs/entrega/evidencias-validacion.md) distingue documentación
conservada, confirmación de la responsable y pruebas simuladas, e indica qué
constancias saneadas aún faltan incorporar. Gmail aceptado no equivale a
recepción, lectura o resultado comercial.

El MVP puede presentarse como desarrollado y probado sin que ello implique
aceptación empresarial formal, dictamen académico emitido, despliegue productivo
o auditoría externa. La capacitación dispone de material; no se acredita una
sesión formal impartida.

## 4. Tecnologías

Stack observado: Node.js 24, Express, JavaScript, EJS, MongoDB/Mongoose, Gmail API,
OAuth 2.0, Gemini API REST, Nodemailer/SMTP, bcryptjs, express-session, Git/GitHub,
node:test y Supertest. La empresa autorizó selección tecnológica libre según la
responsable; la lista inicial fue orientativa.

n8n conserva contratos históricos bloqueados; no transporta el Gmail del MVP ni
se acredita un workflow desplegado. No se presentan FastAPI, React, PostgreSQL,
Azure, Redis o Power BI como herramientas implementadas.

## 5. Instalación y pruebas

Consultar el [manual técnico](docs/entrega/manual-tecnico.md) antes de cualquier
arranque. En una instalación nueva, `npm ci` resuelve las dependencias del
lockfile y `.env.example` sirve como plantilla privada, sin credenciales.
Se requieren MongoDB, topología/índices y servicios propios configurados.
No sobrescribir un `.env` existente.

La suite general se ejecuta con `npm test`; las integraciones necesitan su
entorno aislado y guardias específicas. No usar la base de una empresa para
pruebas con escritura. Un reinicio de desarrollo no acredita operación
productiva. No iniciar trabajadores o habilitar transporte como diagnóstico.

## 6. Seguridad, límites y antecedentes

Email de texto es el alcance operativo actual. Canales sociales, adjuntos y
métricas acreditadas de aperturas/clics/rebotes no forman parte de lo demostrado.
Los estados técnicos y conteos administrativos sí están implementados.

Contraseñas, credenciales OAuth, tokens, bases, logs y respaldos quedan fuera de
Git. La fuente pública no incluye autorización para enviar ni datos de cuentas.
Los [documentos históricos](docs/historico/corte-previo-78c7434/README.md) se
conservan con notas de vigencia; sus pendientes de aquella jornada no sustituyen
el estado final de este expediente.
