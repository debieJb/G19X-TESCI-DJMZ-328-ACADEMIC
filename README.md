# Plataforma Inteligente de Marketing Automation - PluriOne

## Instalación

Estos pasos describen una instalación local de desarrollo desde la raíz del
repositorio. Los comandos de sistema usan PowerShell. No sustituyen la
preparación de infraestructura propia; las limitaciones verificadas se indican
en los pasos correspondientes.

1. **Preparar los requisitos.** Instalar Node.js **24**, npm y MongoDB. Los
   scripts locales existentes buscan MongoDB **8.2** en Windows. Comprobar las
   herramientas con `node --version` y `npm --version`.
   El servidor valida la topología transaccional durante el arranque del
   autoservicio empresarial, incluso con los envíos deshabilitados: se requiere
   un replica set con PRIMARY y sesiones, o una topología sharded compatible.
   Una instancia standalone no satisface ese requisito. Para desarrollo puede
   utilizarse un replica set de un miembro.

2. **Instalar las dependencias fijadas en el repositorio.** Desde la carpeta
   que contiene `package.json` y `package-lock.json`, ejecutar:

   ```powershell
   npm ci
   ```

3. **Crear la configuración privada sin sobrescribirla.** Solo si `.env` no
   existe, copiar la plantilla pública:

   ```powershell
   if (!(Test-Path -LiteralPath .env)) {
       Copy-Item -LiteralPath .env.example -Destination .env
   }
   ```

   Editar `.env` localmente. No versionarlo ni compartir sus valores.

4. **Completar las variables de la aplicación.** La plantilla no contiene
   credenciales utilizables; configurar valores propios:

   | Variables | Uso y requisito |
   |---|---|
   | `NODE_ENV`, `PORT` | Usar `development` y `3000` para el recorrido local descrito. |
   | `MONGODB_URI` | URI de la base propia en la topología transaccional preparada; incluir el nombre de base y el replica set correspondiente. La URI standalone de la plantilla debe sustituirse para este arranque. |
   | `SESSION_SECRET` | Secreto aleatorio privado y estable, necesario para iniciar sesiones; no dejar vacío. |
   | `SUPERADMIN_NOMBRE`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | Datos propios utilizados únicamente al ejecutar el alta administrativa; email válido y contraseña de hasta 72 bytes UTF-8. |

   Para preparar la aplicación sin proveedores externos, conservar
   `GMAIL_CAMPAIGNS_ENABLED=false`, `AI_ENABLED=false`,
   `TRANSACTIONAL_EMAIL_ENABLED=false` y `TRANSACTIONAL_WORKER_ENABLED=false`.
   No seleccionar el modo Gmail `automatico` para este recorrido.

5. **Preparar MongoDB con los scripts existentes, según el entorno.**
   `scripts/iniciarMongoDevRs.ps1` inicia el replica set `marketingDevRs` en
   el puerto 27018 y llama a `scripts/verificarMongoDevRs.js --inicializar`.
   En el entorno original ya preparado, con el proceso de 27018 detenido:

   ```powershell
   .\scripts\iniciarMongoDevRs.ps1
   ```

   **Este script no es un instalador portable:** exige el ejecutable en
   `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`, directorios y
   referencias históricas locales, y la instancia standalone original en
   27017 sin cambios. Su opción `-Preparar` crea directorios y captura una
   referencia inicial, pero sigue dependiendo de esas comprobaciones; no debe
   presentarse como solución automática para otra máquina. En otro equipo,
   un administrador debe aprovisionar primero un replica set propio y ajustar
   `MONGODB_URI` a ese destino, sin alterar los guardias de los scripts.

   `scripts/iniciarMongoPilotoLocal.ps1` sirve para arrancar el piloto existente
   en 27019: exige sus datos previos y no inicializa una instalación nueva.
   Al ejecutar `npm run dev`, el servidor inicializa las colecciones e índices
   del autoservicio mediante el servicio existente; por ello el usuario de
   MongoDB necesita los permisos correspondientes. Los índices de los modos
   Gmail tienen preparación adicional: consultar el
   [manual técnico](docs/entrega/manual-tecnico.md) antes de habilitarlos.
   Los scripts específicos de migración no son un paso general de instalación.

6. **Revisar la creación del superadministrador antes de utilizarla.** Existe
   el comando:

   ```powershell
   npm run crear-superadmin
   ```

   Ejecuta `scripts/crearSuperadmin.js`, carga `.env`, crea el usuario con
   contraseña almacenada como hash bcrypt y no modifica un email existente.
   **Limitación verificada:** el script no establece `estadoAcceso`, cuyo
   valor predeterminado en el modelo es `pendiente_verificacion`; el login
   rechaza estados distintos de `activo`. Por tanto, en una base nueva este
   comando no garantiza una cuenta con acceso. No hay en este recorrido un
   paso validado de activación inicial: resolver ese requisito con el
   responsable antes de utilizar el alta. No modificar directamente la base
   ni omitir controles para completar la instalación.

7. **Iniciar la aplicación de desarrollo.** Con MongoDB preparado y las
   variables completadas:

   ```powershell
   npm run dev
   ```

   El comando ejecuta `nodemon server.js`. Esperar el mensaje de arranque;
   si falla la validación de topología o índices, revisar el diagnóstico y
   el manual técnico antes de continuar.

8. **Abrir la aplicación.** Acceder a <http://localhost:3000> si se mantiene
   `PORT=3000`, valor de la plantilla y predeterminado del servidor. Si se
   configura otro puerto, utilizar ese puerto. La disponibilidad de la web
   no acredita acceso administrativo ni activación de proveedores externos.

9. **Configurar las integraciones solo cuando se necesiten.** No son
   necesarias para iniciar la web con los proveedores deshabilitados:

   | Integración | Configuración y alcance |
   |---|---|
   | SMTP de plataforma | Necesario para completar el registro con verificación por correo real. Utiliza `EMAIL_USER`, `EMAIL_PASS` (contraseña de aplicación), `TRANSACTIONAL_PUBLIC_ORIGIN` y `TRANSACTIONAL_EMAIL_ENABLED`; el trabajador tiene habilitación independiente. En desarrollo local, el origen debe coincidir con `http://localhost:3000` si ese es el puerto elegido. Es independiente del Gmail empresarial. |
   | Gmail OAuth/API | Necesario para conectar la cuenta empresarial y enviar campañas reales. Requiere `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` registrado y `GMAIL_TOKEN_ENCRYPTION_KEY` de 32 bytes codificados en base64, además de OAuth por empresa e índices y políticas del modo elegido. `GMAIL_CAMPAIGNS_ENABLED`, `GMAIL_CAMPAIGNS_MODE`, límites y empresas permitidas controlan el envío. |
   | IA con Gemini | Opcional para crear contenido asistido; la creación manual no la necesita. Revisar `AI_ENABLED`, `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY`, `AI_FREE_TIER_CONFIRMED` y el backend de cuotas indicado en el manual técnico. Tener una clave no acredita gratuidad ni disponibilidad del modelo. |
   | n8n | No es requisito del motor Gmail directo. `N8N_WEBHOOK_URL` y `N8N_WEBHOOK_TIMEOUT_MS` pertenecen a contratos históricos bloqueados; rellenarlas no activa un flujo ni habilita transporte. |

   Mantener los envíos y trabajadores apagados hasta contar con autorización
   expresa y preparación del entorno. Estas instrucciones no afirman que
   Gmail, SMTP, Gemini o n8n estén activos en una instalación nueva.

10. **Reconocer el uso de asistentes de IA.** Durante el desarrollo se utilizó
    OpenAI Codex como apoyo en programación, depuración, implementación,
    pruebas y revisión documental, y ChatGPT en planificación, revisión
    técnica y documentación. La autora conserva la responsabilidad de
    revisar, comprender y validar el trabajo. Gemini es además una integración
    del producto para proponer contenido sujeto a revisión humana. Consultar
    la [declaración de autoría y uso de IA](docs/entrega/autoria-ia.md).

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
