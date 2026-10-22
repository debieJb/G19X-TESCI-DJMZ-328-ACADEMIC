# Plataforma Inteligente de Marketing Automation - PluriOne

Plataforma de gestión de campañas de marketing por correo electrónico con administración multiempresa, contactos, consentimiento, roles, preparación de campañas asistida por IA e integración con Gmail. El proyecto distingue entre las funciones implementadas, las verificadas con pruebas simuladas y las integraciones externas acreditadas.

**Empresa:** PluriOne S.A. de C.V. (Develop Talent & Technology)
**Institución:** Tecnológico de Estudios Superiores de Cuautitlán Izcalli (TESCI)
**Autora y responsable académica:** Debanie Jocabed Montoya Zúñiga
**Base funcional documentada:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`
**Rama de trabajo al efectuar esta revisión:** `respaldo-avances-18-oct`

## Índice

1. [Manual de instalación y puesta en marcha local](#1-manual-de-instalación-y-puesta-en-marcha-local)
2. [Funcionamiento del MVP](#2-funcionamiento-del-mvp)
3. [Pruebas, evidencias y aceptación](#3-pruebas-evidencias-y-aceptación)
4. [Tecnologías](#4-tecnologías)
5. [Documentación y entregables](#5-documentación-y-entregables)
6. [Seguridad, limitaciones y antecedentes](#6-seguridad-limitaciones-y-antecedentes)
7. [Uso de asistentes de IA](#7-uso-de-asistentes-de-ia)

## 1. Manual de instalación y puesta en marcha local

Este procedimiento está dirigido al evaluador técnico y al responsable de despliegue para **Windows 10/11 y PowerShell**. Explica cómo obtener el código, preparar dependencias, verificar MongoDB, configurar el entorno, iniciar la aplicación y comprobar el acceso. El procedimiento es **de desarrollo**, no una guía de despliegue productivo. No habilita envíos reales ni modifica por sí solo las cuentas empresariales.

> **Estado de verificación (21 de octubre de 2026):** en el equipo de desarrollo existente se comprobó Node.js `v24.14.0`, npm `11.9.0`, MongoDB Server `8.2.6`, `mongosh` `2.8.2`, un replica set `marketingDevRs` con `PRIMARY` en `127.0.0.1:27018`, la carga de `.env`, la apertura de `http://localhost:3000` y el inicio de sesión con una cuenta ya existente. La suite habitual terminó con **860/860 pruebas aprobadas** y las pruebas específicas del script inicial con **5/5 aprobadas**. Una instalación en computadora limpia, la creación inicial real del superadministrador y los servicios externos **no** han sido validados de extremo a extremo en este recorrido.

### 1.1 Requisitos y comprobaciones previas

| Componente | Requisito o función | Comprobación |
|---|---|---|
| Windows y PowerShell | Entorno documentado para los comandos locales | `Get-Host` |
| Git | Clonar y revisar la versión del repositorio | `git --version` |
| Node.js | Rama principal **24** | `node --version` |
| npm | Administrador de paquetes incluido con Node.js | `npm --version` |
| MongoDB Server | Servidor 8.2 probado localmente; topología que admita transacciones | Ver pasos 1.5 y 1.6 |
| MongoDB Shell (`mongosh`) | Utilidad de diagnóstico, instalada por separado si es necesario | `mongosh --version` |
| Editor de código | VS Code es opcional y se usó en el desarrollo | `code .` si está disponible |

Desde PowerShell:

```powershell
node --version
npm --version
git --version
mongosh --version
```

**Importante:** `mongod --version` puede indicar «comando no reconocido» aunque MongoDB Server esté instalado. En el equipo de desarrollo el ejecutable se encuentra en `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`; en caso necesario, verificar sin modificar el `PATH`:

```powershell
Test-Path "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
& "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --version
```

Si `Test-Path` devuelve `False`, localizar la instalación correspondiente antes de ejecutar el segundo comando. MongoDB Shell puede estar instalado en una carpeta diferente; en el equipo verificado se invoca directamente con `mongosh`.

### 1.2 Obtener la versión correcta del proyecto

**Instalación en una carpeta nueva:**

```powershell
git clone https://github.com/debieJb/G19X-TESCI-DJMZ-328-ACADEMIC.git
cd G19X-TESCI-DJMZ-328-ACADEMIC
git branch --show-current
git log -1 --oneline
```

**Entorno de desarrollo existente:**

```powershell
cd C:\Users\jocam\Documents\marketing-automation
git branch --show-current
git status --short
git log -1 --oneline
```

El repositorio utiliza `main` como rama pública predeterminada, pero los cambios recientes de instalación, métricas y pruebas se elaboraron en `respaldo-avances-18-oct`. **Hasta que se integren y publiquen**, una descarga de `main` puede no contener esta documentación ni la corrección del alta inicial. Para inspeccionar la rama de respaldo en un clon nuevo, sin cambios locales:

```powershell
git fetch origin
git switch --track origin/respaldo-avances-18-oct
```

No cambiar de rama en un directorio con trabajo sin guardar. Registrar en la evidencia de entrega el nombre de rama y el hash que realmente se evaluó; evita comparar resultados de versiones diferentes.

### 1.3 Instalar dependencias de Node.js

Ubicarse en la carpeta que contiene `package.json` y `package-lock.json`, y ejecutar:

```powershell
npm ci
npm pkg get scripts
```

`npm ci` instala conforme al archivo de bloqueo. No sustituir automáticamente por `npm install` ni regenerar el lockfile para «resolver» errores sin investigar la causa. Los scripts comprobados son:

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo mediante `nodemon server.js` |
| `npm start` | Arranque mediante `node server.js` |
| `npm test` | Suite habitual de `node:test` |
| `npm run test:watch` | Pruebas en modo observación |
| `npm run crear-superadmin` | **Crea un usuario real** en la base configurada si el correo no existe |

No ejecutar `crear-superadmin` para comprobar únicamente la instalación de dependencias.

### 1.4 Preparar `.env` sin revelar credenciales

El archivo `.env.example` define la plantilla pública. Si el archivo privado todavía no existe:

```powershell
if (!(Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

Editar `.env` localmente. **No pegar secretos en tickets, capturas, chats, commits o documentación.** Para una ejecución local básica, revisar estas variables:

| Variable | Configuración esperada para la guía |
|---|---|
| `NODE_ENV` | `development` |
| `PORT` | `3000` (o un puerto libre decidido por quien instala) |
| `MONGODB_URI` | URI de **una base propia** en un replica set compatible, con nombre de base y `replicaSet` correcto |
| `SESSION_SECRET` | Valor propio, secreto, aleatorio y persistente entre reinicios |
| `SUPERADMIN_NOMBRE` | Nombre del administrador inicial, si se va a crear |
| `SUPERADMIN_EMAIL` | Correo único y válido del administrador inicial |
| `SUPERADMIN_PASSWORD` | Contraseña privada; como máximo 72 bytes en UTF-8 |

Ejemplo **de estructura, sin credenciales y sin indicar una base existente que debas reutilizar**:

```dotenv
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27018/NOMBRE_BASE_PROPIA?replicaSet=marketingDevRs
SESSION_SECRET=REEMPLAZAR_POR_SECRETO_PRIVADO
```

No copiar el ejemplo literalmente: `NOMBRE_BASE_PROPIA` y `SESSION_SECRET` requieren valores específicos del entorno. En otra computadora, el nombre del replica set y el puerto podrían ser diferentes.

Para iniciar **sin integraciones externas** se documentó mantener:

```dotenv
GMAIL_CAMPAIGNS_ENABLED=false
AI_ENABLED=false
TRANSACTIONAL_EMAIL_ENABLED=false
TRANSACTIONAL_WORKER_ENABLED=false
```

Estas banderas son controles de alcance del arranque local; no constituyen una receta para activar servicios. No seleccionar el modo Gmail `automatico` solo para conseguir que el servidor abra.

Comprobación **sin imprimir la URI ni valores secretos** (se ejecuta desde la raíz del proyecto):

```powershell
node -e "require('dotenv').config({quiet:true}); const fs=require('fs'); const u=process.env.MONGODB_URI; try { const p=new URL(u); console.log(JSON.stringify({envExiste:fs.existsSync('.env'),mongoHost:p.hostname,mongoPort:p.port||'27017',replicaSet:p.searchParams.get('replicaSet')||'no especificado'},null,2)); } catch { console.log('MONGODB_URI ausente o inválida'); process.exitCode=1; }"
```

La comprobación anterior no demuestra que exista una conexión real ni valida la seguridad de todas las variables: solo inspecciona la configuración sin imprimir credenciales.

### 1.5 Preparar MongoDB con soporte de transacciones

El autoservicio empresarial requiere una topología que permita transacciones MongoDB. Para desarrollo sirve un **replica set con nodo PRIMARY**, o una topología sharded compatible. Una instancia standalone no cumple ese requisito.

El repositorio incluye `scripts/iniciarMongoDevRs.ps1` y `scripts/verificarMongoDevRs.js`. Estos utilitarios dependen del entorno Windows original, de directorios, rutas y condiciones previamente preparadas; **no son un instalador universal**. El script `scripts/iniciarMongoPilotoLocal.ps1` corresponde a otro entorno local en el puerto `27019`, no a una instalación nueva.

En el **equipo que ya tiene MongoDB funcionando**, diagnosticar primero, sin arrancar ni reinicializar servicios:

```powershell
Test-NetConnection 127.0.0.1 -Port 27018
mongosh --host 127.0.0.1 --port 27018 --quiet --eval "JSON.stringify({replicaSet:db.hello().setName,primary:db.hello().isWritablePrimary})"
```

El resultado **observado en el equipo de desarrollo** fue:

```json
{"replicaSet":"marketingDevRs","primary":true}
```

Si el resultado indica `primary: true` y el nombre corresponde con `.env`, **no vuelvas a inicializar el replica set**. Si el puerto está cerrado, hay que diagnosticar el servicio antes de ejecutar cualquier script. Si `mongosh` no se reconoce, ubicar MongoDB Shell o instalarlo por separado según las políticas del equipo; no reinstalar MongoDB Server a ciegas.

**En una computadora nueva**, la preparación de una instancia MongoDB propia, su directorio de datos, controles de acceso, replica set y permisos debe hacerse según las políticas del responsable técnico. El procedimiento genérico de aprovisionamiento no está validado por el material disponible; no se declara aquí que el script local pueda hacerlo automáticamente en equipos ajenos. Tras aprovisionarlo, configurar `MONGODB_URI` para esa instancia y comprobar su condición PRIMARY. Evitar utilizar el MongoDB de una empresa o un respaldo real como banco de pruebas.

### 1.6 Verificar conectividad y permisos antes del arranque

La verificación del puerto y el estado PRIMARY **no** comprueban por sí solos que la aplicación tenga permisos de lectura/escritura, creación de índices y sesiones. El arranque del proyecto prepara colecciones e índices del autoservicio, por lo que la cuenta MongoDB configurada debe disponer de los permisos correspondientes.

Antes de modificar índices, ejecutar migraciones o habilitar modos Gmail, consultar el [manual técnico](docs/entrega/manual-tecnico.md) y la documentación de despliegue correspondiente. **No** ejecutar scripts de inicialización o migración sobre las bases de desarrollo o producción sin revisar sus efectos.

### 1.7 Crear el superadministrador inicial (solo en una base autorizada)

El script `scripts/crearSuperadmin.js` toma `SUPERADMIN_NOMBRE`, `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` de `.env`:

```powershell
npm run crear-superadmin
```

En la **corrección local realizada y cubierta por pruebas**, el registro inicial se crea con rol `superadmin`, `estadoAcceso: 'activo'` y contraseña transformada mediante hash bcrypt. Si ya existe una cuenta con el correo indicado, no la sobrescribe. Se verificaron cinco pruebas simuladas (5/5), incluyendo el estado activo, el hash y el tratamiento de duplicados.

**Precauciones:** este comando **sí puede crear registros reales** en la base indicada por `MONGODB_URI`; ejecutarlo únicamente cuando se haya confirmado que se trata de una base nueva o autorizada, que las credenciales son propias y que se desea ese alta. La ejecución real en una base completamente limpia, seguida del primer login, **sigue pendiente de demostración**. No activar un usuario manualmente en la base ni desactivar comprobaciones de acceso para ocultar problemas de instalación.

### 1.8 Arrancar el servidor de desarrollo

Con las dependencias instaladas, `.env` configurado y MongoDB accesible:

```powershell
npm run dev
```

Esto invoca `nodemon server.js`. Dejar la terminal abierta mientras se usa el sistema. Como alternativa de ejecución sin recarga automática:

```powershell
npm start
```

Si el servidor informa errores de conexión, topología, índices, puerto ocupado o sesiones, **leer el mensaje antes de cambiar configuración**. No modificar contraseñas ni desactivar controles de seguridad por ensayo y error.

### 1.9 Verificar el acceso por navegador

Abrir <http://localhost:3000> si se utiliza `PORT=3000`. Comprobar:

1. Carga de la página pública y sus recursos visuales.
2. Apertura del formulario de inicio de sesión.
3. Acceso con **una cuenta existente y autorizada** del entorno que se está probando.
4. Visualización del panel correspondiente al rol, sin errores visibles.
5. Ausencia de errores graves en la consola donde se ejecuta Node.js.

Estos puntos fueron observados en el equipo de desarrollo con una cuenta ya existente. **No** confundir un login exitoso en una base antigua con la prueba de primer acceso del administrador creado desde cero.

### 1.10 Integraciones externas: configuraciones separadas

Para revisar la interfaz, CRUD y pruebas de la aplicación no es imprescindible habilitar proveedores externos. Cada integración tiene su propio procedimiento, seguridad y evidencia:

| Integración | Para qué se usa | Variables/documentos que se deben revisar | Límite de validación |
|---|---|---|---|
| SMTP transaccional | Correos de verificación de registro | `EMAIL_USER`, `EMAIL_PASS`, `TRANSACTIONAL_PUBLIC_ORIGIN`, `TRANSACTIONAL_EMAIL_ENABLED`; trabajador independiente | La configuración no demuestra recepción real |
| Gmail empresarial OAuth/API | Conexión por empresa y envío de campañas | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `GMAIL_CAMPAIGNS_ENABLED`, `GMAIL_CAMPAIGNS_MODE`; manual y controles de envío | Envío aceptado por API no demuestra entrega, apertura ni clic |
| Gemini | Redacción asistida sujeta a revisión humana | `AI_ENABLED`, `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY`, `AI_FREE_TIER_CONFIRMED`; documentación de cuotas | Clave configurada no garantiza modelo disponible ni gratuidad |
| n8n | Compatibilidad histórica de webhooks | `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TIMEOUT_MS` | No es el transporte activo del motor Gmail directo |

**No habilitar trabajadores, envíos automáticos, OAuth externo ni la IA solo para «ver si funciona»**. Su activación precisa consentimiento, configuración y autorización técnica separadas, además de cuentas y destinatarios de prueba apropiados.

### 1.11 Ejecutar y registrar las pruebas automatizadas

Desde la raíz del proyecto:

```powershell
node --test .\tests\crearSuperadmin.test.js
npm test
```

**Resultados comunicados de la ejecución local del 21 de octubre de 2026:**

| Ejecución | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Pruebas de `crearSuperadmin` | 5 | 0 | 0 |
| Suite habitual con `npm test` | 860 | 0 | 0 |

Duración comunicada de la suite habitual: aproximadamente **42,6 segundos**. Los resultados son del entorno indicado y **no** prueban entregas externas ni cobertura de código del 100 %. Las suites separadas de integración real requieren bases de datos aisladas y condiciones de ejecución especiales: no se lanzan como paso obligatorio de instalación general ni se deben dirigir a una base que contenga datos valiosos.

Para revisión local de cambios antes de un commit:

```powershell
git diff --check
git status --short
git diff --stat
```

En Windows pueden aparecer avisos `LF will be replaced by CRLF`: no son por sí solos errores de sintaxis ni fallos de las pruebas. Revisar el diff y la configuración de saltos de línea antes de intentar una conversión masiva.

### 1.12 Diagnóstico de problemas comunes

| Síntoma | Causa probable o comprobación | Acción segura |
|---|---|---|
| `node` o `npm` no se reconocen | Instalación o `PATH` de Node.js | Verificar instalación y reiniciar la terminal; no cambiar archivos del proyecto |
| `mongod` no se reconoce | MongoDB Server no figura en `PATH` | Comprobar ruta real del ejecutable; no asumir ausencia del servidor |
| `mongosh` no se reconoce | MongoDB Shell es una instalación separada | Localizar `mongosh` o instalar la shell siguiendo las políticas del equipo |
| Puerto `27018` inaccesible | Servicio no iniciado o puerto diferente | Comprobar `Test-NetConnection`, proceso/servicio y configuración, sin reinicializar datos |
| `primary: false` o sin `setName` | Replica set no disponible o conectado a otra instancia | Consultar al responsable del entorno; no ejecutar `rs.initiate()` sobre una base existente sin revisión |
| URI no válida | Variables de `.env` incompletas | Revisar solamente host, puerto, nombre de base y replica set; nunca publicar la URI completa |
| Error de índices/transacciones | Topología, permisos o estructura no preparados | Consultar logs y manual técnico, sin quitar validaciones |
| `EADDRINUSE` en puerto `3000` | Otro proceso usa el puerto | Identificar el proceso o elegir un puerto permitido y ajustar URL/orígenes asociados |
| Superadmin nuevo no puede entrar | Versión anterior del script, estado de acceso o configuración | Confirmar commit, revisar logs y pruebas; no editar estados directamente en MongoDB |
| Registro no envía correo | Servicio SMTP o trabajador deshabilitado/no configurado | Distinguir un arranque local sin proveedores de una validación real de correo |
| Gmail/Gemini no responde | Proveedor deshabilitado, permisos o credenciales | Seguir guías específicas, sin habilitar servicios en masa |

### 1.13 Lista de aceptación de la instalación

Para entregar evidencia al responsable del proyecto, registrar sin exponer datos privados:

- [ ] Rama y hash del commit efectivamente instalado.
- [ ] Versiones de Node.js, npm y MongoDB verificadas.
- [ ] Dependencias instaladas mediante `npm ci`.
- [ ] Existencia de `.env` y variables mínimas revisadas sin publicar secretos.
- [ ] MongoDB accesible, nombre del replica set y condición PRIMARY documentados.
- [ ] Servidor iniciado sin errores impeditivos.
- [ ] Página pública abierta en la URL configurada.
- [ ] Login y panel verificados con cuenta autorizada.
- [ ] Pruebas ejecutadas y resultado total registrado.
- [ ] Primera creación real de superadministrador en **base limpia** validada o marcada como **pendiente**.
- [ ] Integraciones externas distinguidas como **no activadas**, **simuladas** o **validadas con evidencia**.

**Criterio de cierre:** el arranque y login en el equipo original están comprobados; la instalación completamente reproducible en una máquina limpia **no se debe declarar aprobada** hasta realizar y registrar esa prueba separada. Para arquitectura, permisos, índices avanzados y operación controlada, continuar con el [manual técnico](docs/entrega/manual-tecnico.md).

## 2. Funcionamiento del MVP

Flujo principal documentado: **crear campaña → seleccionar destinatarios → activar/preparar → revisar → confirmar envío → consultar resultados**.

La aplicación incluye administración empresarial por roles, aislamiento de datos, contactos y consentimiento, campañas manuales y preparación asistida con IA. Gemini propone contenido sujeto a aprobación humana: no selecciona contactos ni envía mensajes por sí mismo.

El registro de empresas emplea correo transaccional separado del Gmail OAuth empresarial. El envío supervisado contempla selección específica, todos los contactos válidos o etiquetas, con destinatarios fijados antes de confirmar. El motor registra estados por destinatario, controla reservas, cuotas e idempotencia, y revalida el consentimiento. Un estado incierto no se reintenta automáticamente. El piloto manual histórico permanece limitado a un contacto.

La programación automática aparece como implementada y probada con simulaciones en la documentación aportada; **su operación productiva no está acreditada**. No confundir la preparación o aceptación por una API con la recepción efectiva del correo.

## 3. Pruebas, evidencias y aceptación

**Ejecución reciente comunicada en esta revisión:** 860/860 pruebas generales aprobadas, sin fallos ni omisiones. Incluye la prueba actualizada de creación del superadministrador activo.

**Evidencia histórica consignada en la documentación:** 851/851 pruebas generales, 65/65 pruebas de integración y dos ensayos Edge con 58 comprobaciones en total, utilizando datos sintéticos. Son cifras de ejecuciones anteriores y no deben sumarse a las 860 como si fueran pruebas independientes de una misma corrida.

La documentación compartida refiere una generación real con Gemini, un envío Gmail aceptado y confirmaciones de la responsable sobre registro/verificación y envío múltiple supervisado. El [registro de evidencias](docs/entrega/evidencias-validacion.md) distingue constancias documentales, confirmaciones y simulaciones. **No se ha auditado aquí la evidencia externa ni se demuestra con estas pruebas una entrega efectiva en bandeja de entrada.** Un envío aceptado por Gmail tampoco prueba lectura, aperturas, clics o conversiones.

El proyecto puede presentarse como desarrollado y probado en los alcances acreditados, sin atribuirle aceptación empresarial formal, auditoría externa, despliegue productivo ni dictamen académico emitido. La documentación de capacitación no prueba que se haya impartido una sesión formal.

## 4. Tecnologías

- **Backend:** JavaScript, Node.js 24 y Express.
- **Vistas:** EJS, CSS y JavaScript del cliente.
- **Persistencia:** MongoDB y Mongoose.
- **Correo y autenticación externa:** Gmail API, OAuth 2.0 y Nodemailer/SMTP.
- **Asistencia de IA:** integración con Gemini API REST.
- **Seguridad y sesiones:** bcryptjs y express-session, entre otros controles descritos en la documentación.
- **Pruebas y control de versiones:** `node:test`, Supertest, Git y GitHub.

n8n conserva componentes históricos bloqueados, pero no es el transporte del motor Gmail directo del MVP. No se presentan FastAPI, React, PostgreSQL, Azure, Redis ni Power BI como tecnologías implementadas.

## 5. Documentación y entregables

El [índice de entrega](docs/entrega/indice-entrega.md) enlaza los documentos empresariales y las evidencias disponibles:

- [PRD del MVP](docs/PRD-borrador-tecnico.md) y [matriz de trazabilidad](docs/entrega/matriz-trazabilidad.md).
- [Arquitectura / SDD](docs/SDD-borrador-tecnico.md), [propuesta técnica](docs/entrega/propuesta-tecnica.md) y [memoria técnica](docs/entrega/memoria-tecnica.md).
- [Manual de usuario](docs/entrega/manual-usuario.md) y [manual técnico](docs/entrega/manual-tecnico.md).
- [Reporte de QA](docs/entrega/reporte-qa.md), [evidencias de validación](docs/entrega/evidencias-validacion.md) y [alcance actual](docs/alcance-mvp-actual.md).
- [Plan de proyecto](docs/entrega/plan-proyecto.md), [mantenimiento](docs/entrega/plan-mantenimiento.md), [capacitación](docs/entrega/capacitacion.md) e [informe final de residencias](docs/entrega/informe-final-residencias.md).
- [Autoría y uso de IA](docs/entrega/autoria-ia.md).

Los nombres de archivo `PRD-borrador-tecnico.md` y `SDD-borrador-tecnico.md` se mantienen por compatibilidad. Su existencia no equivale a una aprobación formal por PluriOne; debe consultarse su contenido y estado documental.

## 6. Seguridad, limitaciones y antecedentes

El alcance operativo descrito se centra en **correo electrónico de texto**. Redes sociales, adjuntos, métricas verificadas de aperturas, clics y rebotes, y algunos escenarios productivos no forman parte de lo acreditado. Sí existen estados técnicos por destinatario y conteos administrativos, además de métricas por campaña incorporadas al código de la rama de trabajo.

No versionar `.env`, contraseñas, tokens OAuth, claves, logs con datos sensibles, respaldos o bases reales. Las pruebas que empleen persistencia deben usar bases aisladas. Los transportes y trabajadores se habilitan únicamente mediante controles y autorizaciones explícitas.

Se conservan [documentos históricos](docs/historico/corte-previo-78c7434/README.md) con notas de vigencia; no sustituyen el estado documentado del MVP actual.

## 7. Uso de asistentes de IA

Durante el desarrollo se utilizaron **OpenAI Codex** para apoyo en programación, depuración, implementación, pruebas y revisión documental, y **ChatGPT** en planificación, revisión técnica y documentación. La autora mantiene la responsabilidad de revisar, comprender y validar lo producido. **Gemini** forma parte del producto como integración para sugerir contenido sujeto a aprobación humana.

Consultar la [declaración de autoría y uso responsable de IA](docs/entrega/autoria-ia.md).
