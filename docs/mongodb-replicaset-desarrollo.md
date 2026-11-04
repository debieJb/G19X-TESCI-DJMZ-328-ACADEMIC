> Portabilidad (27 de octubre de 2026): configurar las rutas con las variables PLURIONE_MONGO_*_ROOT, PLURIONE_MONGOD_PATH y PLURIONE_MONGOSH_PATH descritas en [README](../README.md#rutas-locales-portables). Las rutas y cuentas mencionadas abajo documentan el entorno original; no son requisitos para otros equipos. Antes de seguir cualquier procedimiento, resolver la ruta vigente con `node scripts/rutasLocales.js devRoot` (o pilotRoot, quotaRoot, geminiRoot). Las referencias de seguridad del servicio original siguen siendo especificas de ese entorno; esta actualizacion no autoriza preparar, recuperar ni modificar datos.

# MongoDB replica set independiente de desarrollo

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Entorno exclusivo: `marketingDevRs`, puerto `27018`, bind `127.0.0.1`, miembro anunciado `localhost:27018`. Directorio independiente `C:\Users\jocam\Documents\marketing-automation-dev-mongo-rs`, con `data` y `logs`. Ejecutable MongoDB 8.2.6: `C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`.

No se registra un servicio Windows ni se modifica el standalone en 27017. No se carga .env, no se cambia la conexión de Express ni se importan datos reales. No se requieren credenciales: este nodo local solo admite datos ficticios. Cualquier proceso local puede acceder; nunca exponerlo a la red o usarlo para producción. Un solo miembro no ofrece alta disponibilidad.

## Preparación inicial

Desde la raíz del repositorio, en PowerShell con permisos suficientes para iniciar un proceso y escribir en el directorio independiente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/iniciarMongoDevRs.ps1 -Preparar
node scripts/verificarMongoDevRs.js --verificar
```

Bypass se limita al proceso que ejecuta este archivo; no modifica la política global. El inicio comprueba que no haya listener en 27018 y que el directorio nuevo no exista. Guarda una referencia privada de PID, configuración y huellas de datos/índices de `marketing_automation` del standalone. No exporta documentos, hashes de contraseñas ni credenciales. Los scripts Node comprueban la ruta real, rechazan directorios redirigidos y verifican opciones de arranque, replica set, miembro y estado PRIMARY antes de escribir.

La configuración se inicializa solo si `replSetGetConfig` responde `NotYetInitialized` (94). Una configuración existente distinta se rechaza; no se reconfigura automáticamente. La caché WiredTiger se limita a 0,25 GiB y el oplog a 128 MiB; el consumo total del proceso será mayor.

## Pruebas reales

```powershell
node scripts/probarTransaccionesMongoDevRs.js --crear
node scripts/apagarMongoDevRs.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/iniciarMongoDevRs.ps1
node scripts/probarTransaccionesMongoDevRs.js --persistencia-y-limpiar
node scripts/verificarMongoDevRs.js --verificar
```

Cada comando debe terminar con código 0 antes de ejecutar el siguiente. Las pruebas comprueban commit de dos documentos en colecciones diferentes, rollback explícito, rollback por índice único duplicado y ausencia de cambios no confirmados para otra sesión. Usan sesiones reales y escrituras majority. Tras el reinicio se comprueba persistencia, ausencia de escrituras abortadas y se elimina exclusivamente la base aleatoria `ma_tx_test_` creada por esa ejecución, previa comprobación de su marcador. No se permite indicar otra URI, base o puerto. Las pruebas no son parte del descubrimiento automático de `npm test` y no necesitan acceso a Google o n8n.

## Arranque habitual y verificación

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/iniciarMongoDevRs.ps1
node scripts/verificarMongoDevRs.js --verificar
```

Usar el mismo directorio y versión; no repetir `-Preparar`. La URI reservada para futuras pruebas es `mongodb://localhost:27018/ma_tx_test_<identificador>?replicaSet=marketingDevRs`. No copiarla al .env actual. Las comprobaciones del standalone son lecturas y pueden detectar actividad legítima concurrente de otras aplicaciones; si cambia su huella, el procedimiento se detiene para revisión, sin restaurar ni sobrescribir nada.

## Apagado y recuperación

```powershell
node scripts/apagarMongoDevRs.js
```

El apagado valida identidad y referencia del standalone antes de solicitar `shutdown` al puerto 27018. Comprueba después que el puerto queda libre. Nunca mata procesos por nombre ni detiene el servicio MongoDB del sistema. No se cierra Express o n8n.

Después de un cierre inesperado, iniciar con el comando habitual y permitir la recuperación normal de WiredTiger. Consultar privadamente `logs\mongod.log`. Si falla cualquier comprobación, detener el procedimiento; no borrar locks, datos ni archivos, no ejecutar `--repair`, no forzar reconfiguraciones y no reemplazar la referencia original. Un manifiesto pendiente `prueba-persistencia.json` debe revisarse; no se sobrescribe con una prueba nueva. Si una prueba falla antes de generar el manifiesto, su base ficticia queda disponible para diagnóstico, sin limpieza automática.

Para descartar completamente este entorno se necesita una autorización separada y verificar las rutas absolutas. Estos scripts no eliminan su directorio ni reinstalan MongoDB. Los binarios deben permanecer en la versión prevista; una actualización requiere revisión.

## Resultado actual tras la continuación autorizada

La preparación se completó correctamente después de corregir el validador para leer `parsed.replication.replSet`, que es la estructura real de MongoDB 8.2.6. Se conservaron los controles de puerto, bind, directorio real, nombre del replica set, miembro único y estado PRIMARY.

- Se verificó el proceso existente antes de continuar, sin arrancar otra instancia ni usar `-Preparar`.
- Se confirmó `NotYetInitialized` (94) y se inicializó una única vez `marketingDevRs`.
- Commit multidocumento: APROBADO.
- Rollback explícito: APROBADO.
- Rollback por duplicado de índice único: APROBADO; la empresa de esa transacción no persistió y el documento previo se conservó.
- Aislamiento entre sesiones: APROBADO; una sesión externa no observó la escritura pendiente y sí la observó después del commit.
- Reinicio: apagado ordenado del nodo identificado, puerto liberado y arranque habitual sin reinicializar ni sobrescribir datos.
- Persistencia tras reinicio: APROBADA; se conservaron los documentos confirmados y no aparecieron los abortados.
- Limpieza: se eliminó exclusivamente la base ficticia de esa ejecución después de validar prefijo y marcador. No quedó manifiesto de persistencia pendiente.
- Standalone original: mismo PID y mismas huellas de configuración, datos e índices en todas las comparaciones, incluida la final.
- Estado final: `marketingDevRs`, un miembro, `localhost:27018`, bind `127.0.0.1`, PRIMARY. El proceso queda iniciado para desarrollo.
- Ocho pruebas de regresión del validador cubren el formato real y el rechazo de puertos, bind, directorios y nombres de replica set ajenos.
- Suite completa `npm test`: 389 pruebas aprobadas, cero fallos (381 anteriores y 8 nuevas).

No se modificaron .env, credenciales o datos empresariales. No se detuvieron Express ni n8n, ni se hizo commit o push.

## Historial: primera ejecución detenida

Primera ejecución detenida por fallo de validación de identidad, conforme a la instrucción de no continuar ante comprobaciones fallidas.

- Se crearon el directorio independiente y la referencia del standalone.
- Se inició un proceso nuevo en 27018, bind 127.0.0.1 y el dbPath previsto.
- MongoDB 8.2.6 devuelve `parsed.replication.replSet`, pero el validador preparado esperaba `parsed.replication.replSetName`. Este error del script hizo rechazar la identidad antes de inicializar el replica set.
- La consulta posterior de solo lectura confirmó el nombre solicitado `marketingDevRs`, ausencia de configuración (`NotYetInitialized`, código 94) y nodo no primario.
- Commit, rollback, duplicados, aislamiento y persistencia: NO EJECUTADOS. No se crearon bases de prueba.
- Standalone original: mismo PID y mismas huellas de configuración, datos e índices después del fallo.
- En ese momento, el nuevo proceso quedó iniciado pero sin replica set inicializado. No se reinició ni se detuvo otro proceso; la continuación quedó pendiente de autorización, concedida posteriormente.
- No se modificó .env, no se importaron datos ni credenciales y no se hizo commit ni push.

La corrección afectaba al nombre de la opción devuelta por `getCmdLineOpts`. Se aplicó sin reparar datos, volver a crear directorios ni reconfigurar el standalone, y se retomó el proceso existente después de verificar su identidad.

## Referencia de indices v2 y bloqueo temporal de envios

La continuacion autorizada conserva la referencia original y utiliza una referencia v2 con la unica adicion aprobada. Ver [historial, definicion y controles](bloqueo-envios-y-referencia-indices.md). Cualquier otra diferencia sigue bloqueando las pruebas.
