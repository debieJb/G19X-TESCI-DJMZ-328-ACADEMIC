# Arranque local integral de PluriOne

Entorno autorizado: rama `feat/lead-scoring-base`, MongoDB 8.2 existente en `marketing-automation-dev-mongo-rs`, replica set `marketingDevRs`, miembro `localhost:27018`, bind `127.0.0.1`, aplicación en `http://localhost:3000`. No es un instalador para una base nueva.

Desde la raíz del proyecto:

```powershell
npm.cmd run dev
```

Carga `.env` desde el proyecto, valida el destino `marketing_automation`, coordina arranques simultáneos y reutiliza únicamente MongoDB con identidad y PRIMARY correctos. Si está apagado, ejecuta `iniciarMongoDevRsExistente.ps1`: conserva la comparación de identidad/configuración/datos/índices de 27017, comprueba directorios y ancestros sin redirecciones, datos WiredTiger existentes, referencia original, binario y SHA-256 autorizado, ausencia de otros mongod y puerto libre. Usa los argumentos originales; no inicializa, reconfigura, repara ni restaura datos.

El binario instalado se resuelve sin depender del PATH; un override sigue sujeto a la comprobación de identidad antes de un arranque en frío. MongoDB conserva su lock nativo: nunca se elimina ni se fuerza acceso concurrente. Un mutex de Windows serializa el script de arranque y un pipe del SO coordina el lanzador. No quedan archivos de bloqueo obsoletos del lanzador tras salir.

Windows oculta la línea de comandos del servicio 27017 al usuario sin elevación. Solo si falla esa comprobación de permisos, el lanzador solicita UAC para ese arranque. Aceptar UAC es necesario en este equipo después de apagar MongoDB. No se eleva Express ni se envían claves a la ventana elevada. PowerShell utiliza `RemoteSigned` exclusivamente para su proceso; no cambia la política global ni utiliza Bypass. Una política corporativa que prohíba scripts o una cancelación de UAC detienen el procedimiento. El servicio original debe seguir ejecutándose y coincidir con sus referencias privadas existentes.

Si 3000 está ocupado, se exige respuesta HTTP local firmada con SESSION_SECRET, reto aleatorio, PID, raíz canónica y huella de configuración. No basta una página 200, un título o el nombre node.exe. Solo la misma aplicación configurada se reutiliza. Un proceso ajeno, una versión antigua sin identidad o una configuración diferente producen error, sin matar procesos ni cambiar puertos. El endpoint de control solo existe en desarrollo y acepta conexiones locales. La parada exige además firma de acción, PID y tiempo; un POST sin firma es rechazado.

## Cerrar y reiniciar

Conservar abierta la primera terminal de desarrollo. Desde otra terminal:

```powershell
npm.cmd run dev:stop
npm.cmd run dev
```

La parada cierra HTTP, trabajadores propios y conexiones antes de terminar el servidor y su supervisor nodemon. MongoDB permanece activo; no se detiene 27017. Repetir `dev:stop` con 3000 libre informa que ya está detenida. Repetir `dev` con PluriOne verificado informa su PID y URL, sin lanzar otro servidor. Ctrl+C solicita también el cierre del servidor iniciado por ese lanzador.

En desarrollo, Mongoose no crea automáticamente índices/colecciones y autoservicio valida los índices existentes. No se ejecuta `prepararIndicesLeadScoring.js` durante el arranque. Si falta infraestructura, se informa el bloqueo: no se migra automáticamente. No se cambiaron credenciales, sesiones, OAuth, consentimientos ni controles multiempresa.

## Gemini

Cada invocación consulta una sola vez los metadatos del modelo configurado mediante GET, sin `generateContent`, sin reintentos y sin consumir cuota de generación. `METADATOS_OK` significa modelo accesible con método de generación anunciado; **no comprueba una generación, cuota disponible ni aprobación del contenido**. El backend local de cuotas se valida por lectura durante el arranque web.

Los errores de generación conservan códigos públicos compatibles y añaden mensajes seguros para clave rechazada, HTTP 403, modelo no disponible, cuota agotada identificada mediante QuotaFailure, HTTP 429 sin causa específica, timeout, conexión y proveedor. No se publica el cuerpo remoto, la clave ni el prompt. Un 429 sin evidencia suficiente se describe como cuota o tasa limitada. Los fallos de cuotas locales se distinguen sin llamar al proveedor. Se mantienen el formulario inicial y, ante fallo de regeneración/revisión, las ediciones acotadas del borrador, escapadas al renderizar; no se guardan como campaña automáticamente.

No se determinó la causa histórica exacta de un fallo de generación: el mensaje genérico anterior no conservaba esa distinción para la persona usuaria y no se hizo una generación real durante esta intervención. El diagnóstico nuevo permite distinguirla en la siguiente solicitud autorizada.

## Evidencia de esta intervención — 13 de noviembre de 2026

- Causa del apagado previo: `CTRL_SHUTDOWN_EVENT` de Windows; cierre WiredTiger completado. 27018 no es un servicio de inicio automático.
- Prueba real: apagado ordenado de 27018 con `apagarMongoDevRs.js`, comprobación de 27017 sin cambios, ejecución de `npm.cmd run dev`, elevación de la lectura protegida, arranque del nodo existente, PRIMARY e identidad aprobados, Express y HTTP verificados, Gemini `METADATOS_OK`.
- Se corrigió la espera de Windows: `Start-Process -Wait` espera también a mongod; ahora se espera solo al PowerShell padre con `WaitForExit()`.
- Arranque repetido real reutilizó el PID existente. Parada autenticada real liberó 3000 y terminó el supervisor, dejando MongoDB activo. La recarga real de nodemon cambió el PID de su hijo sin cerrar el supervisor y el siguiente arranque reutilizó ese PID.
- Suite completa: 1063 pruebas descubiertas, 1060 aprobadas, cero fallidas, tres omitidas. Logs privados en TEMP, fuera de Git.
- Las pruebas incluyen Mongo apagado/activo/ajeno/sin PRIMARY, fallos de permisos, puerto web libre/ocupado, serialización, identidad/firma/replay, parada autenticada, errores Gemini y conservación del borrador, además de las regresiones existentes de login, empresas, usuarios, contactos, campañas, Gmail y Lead Scoring.
- No se reinició Windows físicamente; el arranque en frío se comprobó apagando realmente MongoDB. No se consumió generación Gemini, no se enviaron correos ni se insertaron fixtures en la base existente. Las pruebas de funcionalidades usan fixtures aisladas; no sustituyen una revisión visual con sesión real.
- Sin commit, push, merge ni modificación de main. Se conservaron los cambios de Lead Scoring anteriores y `criptscomprobarSmtpTransaccional.js`.

## Archivos de esta intervención

- Arranque: `scripts/iniciarDevLocal.js`, `scripts/coordinarDevLocal.js`, `scripts/iniciarMongoDevRsExistente.ps1`, `scripts/rutasLocales.js`, `scripts/supervisarDevLocal.js`, `scripts/detenerDevLocal.js`.
- Servidor y control local: `server.js`, `config/database.js`, `services/estadoDevLocal.js`.
- Gemini y cuotas: `services/ia/geminiProveedor.js`, `services/ia/estadoGemini.js`, `services/ia/ErrorIA.js`, `services/ia/limitesIA.js`.
- Conservación del formulario: `controllers/iaController.js`, `views/empresa/resultadoIA.ejs`.
- Comandos y documentación: `package.json`, `README.md`, `docs/arranque-local-un-comando.md`.
- Pruebas: `tests/dev.integral.test.js`, `tests/ia.http.test.js`.

Total: 20 archivos, incluyendo siete nuevos. El resto del estado Git corresponde a cambios anteriores conservados.
