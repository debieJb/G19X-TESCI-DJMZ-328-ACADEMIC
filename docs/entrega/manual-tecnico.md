# Manual técnico e instalación - PluriOne

**Proyecto:** Plataforma Inteligente de Marketing Automation<br>
**Empresa:** PluriOne S.A. de C.V. · **Institución:** TESCI<br>
**Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 1.0 documental, 19 de octubre de 2026 · Base `78c7434`.

## Índice

1. Requisitos
2. Instalación del código
3. Configuración privada
4. Persistencia, índices y arranque
5. Integraciones y modos
6. Pruebas y diagnóstico
7. Respaldo, recuperación y entrega

## 1. Requisitos

Node.js 24 (registros revisados con `v24.14.0`), npm, Git y MongoDB apropiado para la topología transaccional requerida. Las dependencias JavaScript se resuelven con el lockfile. Las funciones de envío y registro necesitan transacciones/índices y no se acreditan en una base standalone por el mero arranque de Express.

Google Cloud/OAuth, cuenta Gmail empresarial, SMTP de plataforma y Gemini se configuran con cuentas y permisos propios. No existen credenciales públicas de demostración. n8n no es requisito para ejecutar el motor directo. Los scripts Windows locales pueden contener rutas de la máquina de desarrollo: revisarlas antes de utilizarlos en otro equipo; no se anuncian como aprovisionamiento universal.

## 2. Instalación del código

En una copia nueva autorizada del repositorio:

```powershell
git clone --branch respaldo-avances-18-oct https://github.com/debieJb/G19X-TESCI-DJMZ-328-ACADEMIC.git
Set-Location G19X-TESCI-DJMZ-328-ACADEMIC
npm ci
```

Comprobar que `78c743424b84cf7ea6d7fc63d2cbf58205727c88` está en el historial. La rama puede recibir documentación posterior sin que cambie esa referencia funcional. Copiar `.env.example` a `.env` solo en una instalación nueva donde no exista ese archivo; conservar cualquier configuración privada existente. No compartir `.env` ni pegarlo en un reporte.

## 3. Configuración privada

| Grupo | Variables principales | Condición |
|---|---|---|
| Aplicación | `NODE_ENV`, `PORT`, `SESSION_SECRET`, `MONGODB_URI` | URI propia y secreto aleatorio; no reutilizar fixtures de prueba como credenciales reales. |
| Alta administrativa | `SUPERADMIN_NOMBRE`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | Alta explícita con el script autorizado; no existe cuenta semilla universal. |
| Registro SMTP | `EMAIL_USER`, `EMAIL_PASS`, `TRANSACTIONAL_PUBLIC_ORIGIN`, `TRANSACTIONAL_EMAIL_ENABLED` | Cuenta de plataforma y contraseña de aplicación, distintas del OAuth empresarial. Origen exacto; HTTP loopback solo bajo las reglas de desarrollo. |
| Trabajador de registro | `TRANSACTIONAL_WORKER_ENABLED`, límites y periodo transaccionales | Apagado salvo autorización explícita; no necesario para una revisión documental o de pruebas simuladas. |
| Gmail empresarial | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY` | Callback registrado y clave de cifrado compatible; credenciales de cada instalación. |
| Política de campañas | `GMAIL_CAMPAIGNS_ENABLED`, `GMAIL_CAMPAIGNS_MODE`, `GMAIL_CAMPAIGNS_MAX_RECIPIENTS`, `GMAIL_CAMPAIGNS_PILOT_COMPANIES` | Mantener envíos apagados durante preparación. `supervisado` es distinto de `automatico`. |
| IA | `AI_ENABLED`, `AI_PROVIDER`, `GEMINI_API_KEY`, `AI_MODEL`, `AI_FREE_TIER_CONFIRMED`, `AI_QUOTA_BACKEND` | Modelo accesible por la cuenta y backend autorizado; ninguna variable demuestra gratuidad o cuota remota. |

La plantilla omite algunas opciones avanzadas; verificar los servicios y [cuotas protegidas](../cuotas-ia-produccion.md) antes de habilitar IA. En producción, el selector exige backend `protected`; el backend `piloto_local` se limita al entorno de desarrollo y al destino validado.

## 4. Persistencia, índices y arranque

1. Preparar una instancia propia de MongoDB con transacciones y controlar acceso a la red. No reutilizar bases empresariales para fixtures.
2. Revisar modelos e índices declarados y los scripts de migración específicos. El modo supervisado valida índices existentes y no crea colecciones/índices por sí mismo; no usar `syncIndexes`, borrar colecciones o modificar referencias para saltar un fallo.
3. Revisar requisitos de registro, cuotas y sesiones con los servicios correspondientes. Los guardias de los pilotos tienen identidad, puertos y manifiestos fijos; no se deben alterar sin un plan autorizado.
4. Mantener `GMAIL_CAMPAIGNS_ENABLED=false`, `TRANSACTIONAL_EMAIL_ENABLED=false`, `TRANSACTIONAL_WORKER_ENABLED=false` y `AI_ENABLED=false` durante la preparación sin servicios externos. No elegir modo `automatico` como valor de arranque de una revisión.
5. Tras satisfacer dependencias, `npm start` ejecuta `server.js`; `npm run dev` utiliza nodemon. Un fallo de arranque requiere diagnóstico, no desactivar controles.

El modo automático habilitado puede iniciar el consumidor desde `server.js` y crear índices mediante su preparación. Por ello, estos comandos no son instrucciones para reiniciar una instalación real sin revisar sus opciones y pendientes. Este manual no declara un despliegue productivo listo ni ejecuta su instalación.

Para uso productivo: sesiones persistentes, HTTPS/cookies, proxy validado, privilegios mínimos, rotación, monitoreo y restauración deben verificarse por instalación. MemoryStore no acredita sesiones productivas. Véase [sesiones e infraestructura](../sesiones-produccion.md).

### 4.1 Arranque del MVP piloto con IA

Para evaluar el piloto existente, MongoDB `marketingDevRs` debe estar activo en
`27018`; la empresa autorizada, su cuenta y el almacén separado de cuotas deben
existir. Revisar además la configuración privada autorizada de Gemini y de correo.
No ejecutar aprovisionamiento ni migraciones como parte de este arranque.

Desde la raíz del repositorio, en PowerShell:

```powershell
npm run dev:piloto
```

Alternativa manual equivalente:

```powershell
$env:AI_QUOTA_BACKEND = 'piloto_local'
npm run dev
```

Detener antes cualquier servidor anterior con Ctrl+C en su terminal. `dev:piloto`
ejecuta nodemon con `server.js` y una copia del entorno, cargando `.env` en memoria
y seleccionando `piloto_local` solo para el proceso hijo. Si `NODE_ENV` está ausente,
usa `development`; rechaza `production`, `test` o un backend explícito diferente.
No modifica archivos privados ni habilita servicios externos. `npm run dev` conserva
exactamente su comportamiento y no selecciona el piloto automáticamente. Los
efectos normales de `server.js`, incluida preparación de índices y políticas de
trabajadores ya configuradas, siguen vigentes.

Sin `AI_QUOTA_BACKEND`, desarrollo selecciona `dev_fixture`, reservado a dos
empresas ficticias autorizadas con IDs `f17e1a…`, base y marcador de pruebas.
Una empresa real se rechaza antes del proveedor con `CUOTAS_NO_DISPONIBLES`.
`piloto_local` admite únicamente la empresa piloto definida por ID fijo en
`services/ia/almacenCuotasPilotoLocal.js`, en desarrollo y con la topología local
validada. Conserva marcador, índices, separación de base, cuotas y aislamiento;
no es una opción universal para otras empresas ni para producción. En producción
se exige el backend `protected` con su infraestructura autorizada.

Con `AI_ENABLED=true`, el arranque correcto muestra `IA_WEB` con
`backend: "piloto_local"`, `entorno: "development"` y `cuotasVerificadas: true`.
Con IA apagada, `cuotasVerificadas` permanece en false y el script no la activa.
Abrir `http://localhost:3000/login`; tras iniciar sesión como administrador del
piloto, consultar `/empresa/ia/diagnostico` sin generar contenido ni consumir cuota.
La generación auténtica requiere clave/modelo/banderas autorizados y consume las
cuotas locales y remotas correspondientes. No enviar campañas para comprobar IA.

Si el comando rechaza configuración o cuotas, revisar el diagnóstico sin editar
marcadores, índices o empresas permitidas para forzar la ejecución. Para otra
computadora o empresa hace falta preparar infraestructura propia autorizada.

## 5. Integraciones y modos

**SMTP:** `services/smtpTransaccionalService.js` utiliza Nodemailer, `smtp.gmail.com:465` y TLS. Los scripts de despacho/verificación conservan puertas de autorización; no deben ejecutarse para comprobar documentación. El adaptador Gmail transaccional anterior se conserva como antecedente, no como camino vigente de registro.

**Gmail OAuth/API:** el usuario conecta desde Gmail empresarial; el motor no admite remitente arbitrario del formulario. Supervisado confirma y procesa un trabajo por paso. El límite configurable es 1–50; cuotas locales y restricciones del proveedor siguen aplicándose. El piloto manual permanece unitario.

**Gemini:** el adaptador REST valida configuración, privacidad y contrato de salida; la propuesta necesita revisión y aprobación humana. El modelo se configura privadamente: no se fija en el manual uno no comprobado para otra cuenta.

**Programación/n8n:** modo automático y fechas existen y tienen pruebas simuladas. No hay evidencia de producción ni workflow n8n exportado. No iniciar consumidores ni trabajos antiguos como parte de la instalación de lectura.

## 6. Pruebas y diagnóstico

Suite general sin proveedor real:

```powershell
$env:NODE_ENV = 'test'
npm test
```

Las integraciones `pruebas-integracion/campanasFlujo.js` y `pruebas-integracion/enviosGmail.js` usan bases temporales propias en el replica set de desarrollo y guardias de `scripts/mongoDevRsComun.js`. La verificación histórica incluye identidad del proceso: tras un reinicio legítimo puede cambiar PID aunque datos/índices no cambien. No editar la referencia histórica para hacer pasar pruebas; la ejecución de recuperación utilizó una comprobación temporal de sesión descrita en [QA](reporte-qa.md).

No se incluye esa adaptación temporal como instalador universal. Para una reproducción en otra máquina, preparar una referencia y entorno propios autorizados. Una ejecución bloqueada por identidad no demuestra defecto de campaña ni autoriza conectar producción.

El ensayo `tests/soporte/campanaEnvioNavegador.cjs` requiere Edge en la ruta Windows indicada por el código; `MULTI_BROWSER_TEST=true` selecciona el modo múltiple de la fixture. Solo usa servidor local y proveedores simulados.

Ante errores de Gmail/IA, registrar código sanitizado, versión, modo y etapa. No registrar tokens, contraseñas, enlaces de verificación, cuerpo de correo ni respuesta completa del modelo. El código existente de diagnóstico debe leerse antes de ejecutar cualquier opción que abra conexiones.

## 7. Respaldo, recuperación y entrega

Versionar fuente, documentación, pruebas y ejemplos. Mantener aparte y con acceso restringido secretos, bases, logs y respaldos. El respaldo completo privado de recuperación no es un artefacto distribuible ni prueba de restauración productiva. No restablecer Git, borrar campañas o eliminar índices para recuperar un envío incierto.

El [plan de mantenimiento](plan-mantenimiento.md) define respuesta conservadora y verificación de restauración propuesta. [Arquitectura](../SDD-borrador-tecnico.md), [QA](reporte-qa.md), [referencias](referencias.md) y [autoría](autoria-ia.md) complementan este manual.
