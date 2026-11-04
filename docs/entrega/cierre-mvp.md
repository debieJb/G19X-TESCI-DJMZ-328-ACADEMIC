# Cierre técnico del MVP de PluriOne Marketing Automation

**Proyecto:** Plataforma Inteligente de Marketing Automation.<br>
**Fecha de revisión:** 27 de octubre de 2026.<br>
**Rama:** `respaldo-avances-18-oct`.<br>
**Referencia auditada antes de este cierre documental:** `238e5761bb09ca0a090c639ae0982bded47e5b5c`.<br>
**Estado:** **cerrado con observaciones**.

Se cierra el desarrollo del MVP en el alcance documentado para su entrega y revisión
de residencias profesionales. No se declara recepción o aceptación firmada por la
empresa o TESCI, dictamen académico, auditoría externa ni certificación de producción.
Este informe actualiza los resultados del cierre; conserva las cifras y evidencias
anteriores como antecedentes, sin sumarlas a la ejecución actual.

## Auditoría y conservación del proyecto

El repositorio inició la revisión en la rama indicada y con el árbol limpio. No se
incorporaron implementaciones nuevas. Los módulos de autenticación, sesiones,
permisos, empresas, operadores, contactos, campañas, Gemini y Gmail API permanecen
intactos. Se comprobó que rutas, controladores, servicios, modelos, middleware,
configuración, JavaScript, scripts, arranque y dependencias no difieren de `002e9e5`
en la referencia auditada. Las entregas posteriores de botones, presentación pública
y manual no modificaron esos componentes.

Este cierre solo modifica README, el índice de entrega y este informe. No se editan
credenciales, archivos `.env`, servicios o configuraciones locales. No se inician,
detienen o modifican instancias de MongoDB; no se ejecutan migraciones, restauraciones,
envíos reales, llamadas a Gemini ni pruebas de integración que escriban en bases reales.
Los registros y vistas previas de verificación permanecen fuera del repositorio.

## Arquitectura vigente

- Backend modular en **Node.js y Express**: rutas, middleware, controladores y servicios.
- Interfaz renderizada en servidor mediante **EJS**, con CSS y JavaScript del cliente.
- Persistencia mediante **MongoDB y Mongoose**, con aislamiento por empresa y controles de consistencia.
- **Gemini API** para proponer contenido editable, sujeto a revisión humana, configuración del proveedor y cuotas.
- **Gmail API y OAuth 2.0** para la identidad empresarial y el transporte directo de campañas autorizadas.
- **Nodemailer/SMTP** para correo transaccional de plataforma, separado del Gmail OAuth/API de campañas.

**n8n no es el motor activo de envío.** Sus componentes históricos bloqueados se
conservan para trazabilidad. La arquitectura y los modos se detallan en el
[SDD](../SDD-borrador-tecnico.md) y el [manual técnico](manual-tecnico.md).

## Resultados de las pruebas

Corrida de cierre con Node.js, `NODE_ENV=test` y los **100 archivos `tests/*.test.js`**,
seleccionados explícitamente con PowerShell para excluir las suites con bases reales
y los recorridos de navegador de ejecución separada:

```powershell
$env:NODE_ENV='test'
$unitFiles = Get-ChildItem -LiteralPath tests -Filter '*.test.js' -File | Sort-Object Name | ForEach-Object { $_.FullName }
node --test --test-reporter=tap @unitFiles
```

| Resultado de esta corrida | Cantidad |
|---|---:|
| Pruebas ejecutadas | 972 |
| Aprobadas | 972 |
| Fallidas | 0 |
| Canceladas | 0 |
| Omitidas | 0 |

Código de salida: **0**. Duración comunicada por el runner: **44,306.5993 ms**.
Las pruebas utilizan dobles, fixtures y comprobaciones locales: no acreditan por sí
solas entrega de correos, disponibilidad del proveedor o persistencia contra una base
real en esta sesión. No se repitieron los ensayos de `pruebas-integracion/`.

Áreas verificadas mediante código y pruebas generales:

| Funcionalidad | Alcance comprobado y límite |
|---|---|
| Autenticación, registro y sesiones | Validaciones, CSRF, límites, roles, recuperación e invalidación de sesiones; transporte transaccional simulado. |
| Empresas y operadores | Administración, permisos, estados de acceso y aislamiento por empresa con dobles de persistencia. |
| Contactos y consentimiento | Validación, selección, filtros, documentación y revocación; sin modificar contactos reales. |
| Campañas | Creación, edición, borradores, destinatarios y preparación/revisión antes del envío; persistencia simulada. |
| Gemini | Contratos, configuración, privacidad, cuotas, revisión y manejo de errores; sin consumir el proveedor real. |
| Gmail API | OAuth, identidad, MIME, autorización, idempotencia, cuotas, historial y modos de envío con proveedor simulado. |
| Interfaz y documentación | Renderizado EJS, presentación pública actualizada y manual enlazado; evidencia visual previa separada de esta corrida. |
| MongoDB e infraestructura local | Controles de identidad y reconciliación mediante fixtures, sin intervenir instancias ni referencias históricas. |

Las comprobaciones reales anteriores de Gemini y Gmail descritas en el
[registro de evidencias](evidencias-validacion.md) y las confirmaciones de la
responsable se conservan como evidencia del entorno documentado. No se presentan
como nuevas operaciones reales de esta revisión.

## Fallo simulado y limitaciones pendientes

1. **Recorrido separado de Gmail:** `tests/soporte/publicoNavegador.cjs` mantiene
   un fixture con envío deshabilitado, campaña en borrador, contactos vacíos y sin
   identidad/permisos válidos. La aplicación produce bloqueos y conserva deshabilitado
   el botón; el test espera un encolado que no solicita. Se reprodujo antes y después
   del cambio visual: no hubo petición a `/gmail/confirmar`. Es una expectativa
   incompatible con el fixture, no evidencia de fallo del transporte real. Permanece
   sin corregir y no se reejecutó en este cierre. Véase el
   [diagnóstico completo](../revision-botones.md). No forma parte de las 972 pruebas.
2. **Correo transaccional:** se conserva el rechazo SMTP `535 / 5.7.8` documentado
   para recuperación/verificación en la configuración diagnosticada. No se reintentó
   autenticación ni envío y no se afirma resuelto. Gmail API de campañas es independiente.
   Véase el [diagnóstico SMTP](../diagnostico-recuperacion-smtp.md).
3. **Operación externa:** una aceptación Gmail API no garantiza recepción, apertura,
   clics o conversiones. Proveedor, cuotas, permisos y habilitación dependen del entorno.
   El consumidor programado tiene implementación y pruebas simuladas; su operación
   productiva no está acreditada. No se ejecutó una instalación o restauración integral nueva.
4. **Alcance y aceptación:** métricas comerciales, canales adicionales, carga productiva,
   auditoría externa, certificación de accesibilidad, capacitación formal impartida y
   aceptación empresarial/académica permanecen sujetos a evidencia y revisión independientes.

Estas observaciones no se ocultan mediante cambios funcionales o debilitamiento de
controles. El cierre es técnico y documental del MVP, con reservas explícitas.

## Manual final y respaldo

El [Manual de Usuario y Validación Funcional](Manual_Usuario_Validacion_Funcional.pdf)
está enlazado desde README. El PDF del repositorio es idéntico, byte por byte, a
`Manual_PluriOne_Corregido.pdf` proporcionado por la responsable: **2,229,013 bytes**.
Se abrió con el lector PDF de Windows, sin contraseña, y se renderizaron sus **59 páginas**
sin errores. Las capturas ya revisadas permanecen en el mismo archivo, que no se reescribe.

SHA-256 del PDF:

```text
e9c4a90f6f0a158e73592396140dbbdc884e8bde8d97d00aea3ef83fb3562978
```

La publicación se realiza mediante commit documental y push normal a la rama
indicada, sin merge a `main`, cambio de rama ni reescritura de historial. El hash
definitivo es el commit que incorpora este informe y se comprueba contra GitHub
después del push; no se incluye aquí un hash futuro inventado.
