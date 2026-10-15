# Almacén protegido de cuotas de IA

## Nuevo almacén local independiente para el piloto Gemini

La instancia previa `marketing-automation-cuota-mongo`/27019 se conserva sin cambios y no se usa para recuperar acceso. El perfil nuevo de MongoDB Community 8.2.6 en `127.0.0.1:27020` ya tuvo un intento inicial y su directorio `C:\Users\jocam\Documents\marketing-automation-cuota-mongo-gemini\data` existe. **No ejecutes de nuevo el script de preparación inicial.** Continúa únicamente con el procedimiento de recuperación del perfil Gemini descrito abajo, conservando procesos, archivos y credenciales actuales.

`quotaTarget.js` mantiene un allowlist de destinos: el histórico sigue siendo el default y el perfil `gemini` es explícito. El aprovisionador verifica `getCmdLineOpts`, versión, puerto, bind y dbPath. Las cuentas y roles conservan el mismo alcance mínimo: `plurione_ia_quota_runtime` solo puede `find`, `insert`, `update` y `listIndexes` en `plurione_ai_quota.usoias`; el usuario de mantenimiento está restringido a esta base más `shutdown`. Se crean exclusivamente la colección `usoias`, índices `_id_`, único empresa/ventana y TTL, y un documento fixture identificable. No hay conexión a MongoDB de empresas ni se aceptan IDs empresariales en la configuración del perfil nuevo.

La nueva URI se cifra con DPAPI en un archivo distinto, `quota-uri-gemini.dpapi`; el archivo histórico `quota-uri.dpapi` no se sobrescribe. El launcher `-AlmacenGemini` descifra solo en memoria, no inicia Express si 3000 está ocupado y permite `-ValidarAlmacen`. La bandera no activa Gemini; `AI_ENABLED` y `AI_FREE_TIER_CONFIRMED` permanecen bajo configuración externa independiente.

### Estado y recuperación del intento existente en 27020

El primer intento terminó en `stage=inventory`, código `IDLUnknownField`/40415. El flujo alcanzó `inventory` después de autenticar o crear el usuario bootstrap root. `listDatabases` es de lectura y la siguiente consulta era la de usuarios. Por el orden del código, el script aún no había llegado a crear roles runtime/mantenimiento, colección, índices ni fixture. El directorio contiene metadatos persistidos del arranque; la recuperación vuelve a inventariar y no asume que esté vacío.

`UNEXPECTED_DATABASE` se producía porque la allowlist solo admitía `admin`, `local` y `plurione_ai_quota`; excluía `config`. MongoDB utiliza legítimamente `config.system.sessions` para sesiones causales incluso en deployments standalone. Ahora `config` se admite como base interna, pero cualquier otra base fuera de la allowlist sigue bloqueando la recuperación. La documentación de MongoDB describe este uso interno de `config` [aquí](https://www.mongodb.com/docs/manual/reference/config-database/). El error ahora identifica el nombre seguro de cualquier base aún desconocida (`database=<nombre>`) sin revelar credenciales.

La comprobación de solo lectura de esta sesión no pudo listar las bases del proceso: el entorno de herramientas no mostró listeners locales y Windows denegó la enumeración de los hijos del directorio. Por eso no hay evidencia independiente de que `config` fuera la única base presente; la corrección cubre el caso legítimo conocido y deja bloqueado cualquier otro nombre.

**No ejecutes `prepararNuevoAlmacenCuotas.ps1`**: el directorio ya existe. Una consulta de solo lectura desde el entorno Codex no pudo enumerar los hijos de ese directorio por denegación de acceso ni observó listeners locales; por tanto, no se da por confirmada aquí la identidad actual del proceso. Ejecuta el procedimiento siguiente desde el PowerShell normal que creó la instancia, sin elevar permisos:

1. En PowerShell normal, ejecuta `node .\scripts\verificarMongoDevRs.js --verificar` y confirma las identidades de 27017/27018. Verifica que 27019, Express 3000 y n8n 5678 sigan en sus procesos esperados y que 27020 corresponda a MongoDB 8.2.6, `--auth`, `127.0.0.1` y el `dbPath` `C:\Users\jocam\Documents\marketing-automation-cuota-mongo-gemini\data`. Si PID, ejecutable, argumentos, listener, versión o ruta no coinciden, detente. El wrapper vuelve a comprobar identidad de 27020 antes de conectarse.

2. Una vez verificada esa identidad, ejecuta el wrapper de recuperación, no el inicial:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\recuperarAlmacenCuotas.ps1 -AlmacenGemini
   ```

   El wrapper repite la validación de PID, ejecutable, `dbPath`, `--auth`, puerto, bind loopback y versión antes de iniciar Node. Introduce únicamente la contraseña bootstrap actual en el prompt oculto. Si no autentica, el proceso termina con error seguro: el modo recuperación no intenta la excepción localhost, no crea/reemplaza usuarios y no hace escrituras. No pruebes otras claves ni pases una clave por argumento.

3. Con autenticación correcta, Node lee el inventario y comprueba usuarios, roles, bases, colecciones, índices y documentos antes de escribir. Si aparece cualquier usuario, rol, base, colección, índice o documento inesperado, se detiene sin modificarlo. Si hay cuentas runtime/mantenimiento parciales, introduce sus contraseñas actuales cuando las solicite; no serán reemplazadas. Solo tras pasar ese inventario puede completar los objetos permitidos, validar ambos accesos, confirmar el fixture y eliminar el bootstrap temporal.

4. Tras `APROVISIONAMIENTO_OK`, vuelve a ejecutar `node .\scripts\verificarMongoDevRs.js --verificar`, verifica que 27017/27018/27019 y Express/n8n sigan en sus identidades previas, y luego continúa con guardado DPAPI y validación de almacén indicados abajo. Si falla una comprobación, conserva los archivos y el proceso para revisión; no repitas la recuperación hasta conocer el estado.

### Puesta en marcha controlada (manual, desde PowerShell normal)

No ejecutes esta secuencia hasta revisar cada gate. No se ha iniciado ninguna instancia con estos cambios.

1. Desde la raíz del proyecto, confirma que el puerto 27020 está libre, que no existe el nuevo directorio y que MongoDB 8.2.6 está instalado. No inspecciones ni reutilices el directorio 27019. Ejecuta `node .\scripts\verificarMongoDevRs.js --verificar`; debe validar marketingDevRs:27018 y el standalone 27017. El script de inicio también vuelve a comprobar la identidad de esas instancias y captura la identidad de 27017, 27018 y 27019 antes/después.

   ```powershell
   if (Get-NetTCPConnection -State Listen -LocalPort 27020 -ErrorAction SilentlyContinue) { throw '27020 ocupado' }
   if (Test-Path -LiteralPath 'C:\Users\jocam\Documents\marketing-automation-cuota-mongo-gemini') { throw 'El dbPath nuevo ya existe; detenerse' }
   node .\scripts\verificarMongoDevRs.js --verificar
   ```

2. Solo si las tres verificaciones pasan y 27017/27018/27019 siguen en sus procesos esperados, inicia una única vez el perfil nuevo. La opción explícita evita confundirlo con el script histórico.

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\prepararNuevoAlmacenCuotas.ps1 -ConfirmarEjecucion
   ```

   Introduce tres contraseñas distintas en los prompts ocultos: bootstrap, runtime y mantenimiento. Usa al menos 24 caracteres ASCII URI-seguros (`A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `-`). Conserva runtime y mantenimiento en un gestor seguro; bootstrap es temporal y el aprovisionador lo elimina al completar. No pongas contraseñas en comandos, portapapeles compartidos, archivos o historial. Si el script falla, conserva proceso/directorio/log para diagnóstico; no repitas el primer arranque ni borres el directorio.

3. Guarda la contraseña runtime en DPAPI con el nombre separado. La entrada es oculta y la URI no aparece en pantalla ni se escribe en `.env`.

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\guardarUriCuotasDpapi.ps1 -AlmacenGemini
   ```

4. Valida conexión, autenticación, rol, privilegios e índices sin iniciar otra instancia de Express ni llamar a Gemini:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\iniciarExpressConCuotas.ps1 -ValidarAlmacen -AlmacenGemini
   ```

   Si el resultado no es `ALMACEN_PROTEGIDO_OK`, mantén Gemini desactivado y conserva los artefactos para revisión.

5. La prueba de respaldo/restauración existente trabaja únicamente con el fixture ficticio del almacén recién aprovisionado y restaura a una colección aleatoria que verifica como inexistente. No la ejecutes si la colección contiene algo distinto del fixture. Para la primera comprobación:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\probarRespaldoCuotas.ps1 -AlmacenGemini
   ```

   Para un respaldo operativo posterior, crea primero un destino único con ACL restringida y cifrado de volumen confirmado; si no puedes acreditar ambos, detente. Ejecuta `mongodump` de la instalación Database Tools ya verificada, sin pasar `--password` (solicita contraseña interactivamente), conserva el archivo fuera de Git y valida tamaño y SHA-256:

   ```powershell
   $tools = Join-Path $env:LOCALAPPDATA 'PluriOne\MongoDBDatabaseTools\100.19.1'
   $dump = Get-ChildItem -LiteralPath $tools -Filter mongodump.exe -Recurse -File | Select-Object -First 1
   $archive = 'RUTA_DE_RESPALDO_CIFRADA\plurione_ai_quota-AAAA-MM-DD-HHMMSS.archive.gz'
   if (!$dump -or (Test-Path -LiteralPath $archive)) { throw 'Herramienta ausente o archivo existente; detenerse' }
   & $dump.FullName --host 127.0.0.1 --port 27020 --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --db plurione_ai_quota --gzip --archive=$archive
   if ($LASTEXITCODE -ne 0) { throw 'mongodump falló; conservar el estado para revisión' }
   if ((Get-Item -LiteralPath $archive).Length -le 0) { throw 'Archivo vacío' }
   Get-FileHash -LiteralPath $archive -Algorithm SHA256
   ```

   La restauración operacional se ensaya solo contra una instancia temporal independiente, autenticada y vacía, cuya identidad se verifique antes de escribir. Nunca se restaura sobre `27017`, `27018`, `27019`, `27020` ni una colección ya existente. `mongorestore` permite remapear namespaces; no uses `--drop` [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/), [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/).

6. Para cerrar solo la instancia nueva, valida primero que Express no la está usando y solicita el apagado autenticado/ordenado:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\detenerAlmacenCuotas.ps1 -AlmacenGemini
   ```

   Si el usuario de mantenimiento no autentica, detente; no fuerces el PID. El directorio y el fixture se conservan. No uses esta variante del apagado sobre el almacén histórico por confusión de parámetros.

El aprovisionador falla antes de escribir si el puerto no está libre, el dbPath ya existe, la identidad no coincide o las instancias anteriores cambian. Las pruebas automatizadas usan dobles MongoDB y fixtures; no conectan ni escriben en infraestructura. Este documento no autoriza ejecutar la secuencia.

El almacén ficticio de desarrollo permanece limitado a `marketingDevRs` y a dos identificadores de prueba. Para empresas reales, `limitesIA` selecciona `almacenCuotasProtegido`; en `production` no permite seleccionar el almacén ficticio. En desarrollo, la selección protegida requiere `AI_QUOTA_BACKEND=protected`.

El backend exige una conexión independiente mediante `AI_QUOTA_MONGODB_URI` a la base fija `plurione_ai_quota`. Rechaza la base `marketing_automation`, el replica set de desarrollo, conexiones remotas sin TLS, usuarios anónimos, roles amplios y privilegios que no coincidan exactamente con la colección `usoias`. También exige que los índices únicos y TTL estén presentes y sean exactos. `autoCreate` y `autoIndex` permanecen desactivados. Cualquier error produce una respuesta segura de servicio no disponible y no recurre a otra conexión.

## Infraestructura pendiente

No se encontró una instancia protegida utilizable: la conexión actual de Express llega a un MongoDB standalone `marketing_automation` sin usuarios autenticados y con autorización desactivada. No se reutiliza esa instancia ni se modifica su configuración.

Antes de habilitar el backend, un administrador debe aprovisionar una base protegida, con autenticación y respaldos, y crear la colección e índices con una cuenta de administración temporal. La cuenta de ejecución debe tener únicamente el rol personalizado `plurione_ia_quota_runtime` en `plurione_ai_quota`, con permisos `find`, `insert`, `update` y `listIndexes` sobre `usoias`. No debe heredar roles adicionales. La aplicación verifica la identidad y los privilegios reportados por MongoDB en cada uso.

En una sesión administrativa dirigida explícitamente a `plurione_ai_quota`, el aprovisionamiento de esquema es:

```javascript
db.createCollection('usoias');
db.usoias.createIndex({ empresa: 1, ventana: 1 }, {
  unique: true,
  name: 'empresa_1_ventana_1'
});
db.usoias.createIndex({ expiraEn: 1 }, {
  expireAfterSeconds: 0,
  name: 'expiraEn_1'
});
db.createRole({
  role: 'plurione_ia_quota_runtime',
  privileges: [{
    resource: { db: 'plurione_ai_quota', collection: 'usoias' },
    actions: ['find', 'insert', 'update', 'listIndexes']
  }],
  roles: []
});
```

El administrador debe crear un usuario para la aplicación que reciba solo ese rol, validar los privilegios efectivos y configurar copias cifradas con retención y una prueba de restauración en una base no productiva. Esas operaciones no las ejecutan la aplicación ni sus pruebas.

Después de aprobar la infraestructura, se inyectará `AI_QUOTA_BACKEND=protected` y `AI_QUOTA_MONGODB_URI` al proceso local de Express mediante un canal seguro. La URI no debe guardarse en Git ni en este documento. No se cambia `MONGODB_URI`. Antes de la primera generación se valida identidad, autenticación, privilegios, colección e índices con un usuario de prueba real ya autorizado. Hasta entonces las cuotas empresariales reales fallan cerradas y la generación no puede activarse con seguridad.

Las actualizaciones de cuota son atómicas por empresa y ventana. El índice único impide contadores duplicados y el índice TTL limpia ventanas vencidas. No se copian contactos, usuarios ni otros datos empresariales a esta base.

## Entorno local protegido de cuotas

El aprovisionamiento local autorizado usa la instalación ya disponible de MongoDB Community Server 8.2.6, en `127.0.0.1:27019`, con `--auth` y los directorios `C:\Users\jocam\Documents\marketing-automation-cuota-mongo\data` y `logs`. Solo exige que 27019 esté libre; las instancias 27017 y 27018 deben permanecer activas y superar `scripts/verificarMongoDevRs.js --verificar` antes y después. Se niega a reutilizar un directorio existente. Las ACL NTFS quedan limitadas al usuario actual y a SYSTEM. No crea servicio de Windows.

La aplicación crea solo la base de datos de cuotas y su colección `usoias`, con los índices `empresa_1_ventana_1` (único sobre `{empresa:1,ventana:1}`) y `expiraEn_1` (TTL sobre `{expiraEn:1}`, `expireAfterSeconds:0`); MongoDB genera también el índice obligatorio `_id_`. `admin` y `local` son bases internas del servidor: MongoDB necesita metadatos de autenticación en `admin` para habilitar el primer usuario y usa `local` para metadatos internos. No se crean colecciones empresariales. La cuenta temporal `plurione_quota_bootstrap` se elimina al finalizar el aprovisionamiento.

La cuenta plurione_ia_quota_runtime tiene exactamente find, insert, update y listIndexes sobre plurione_ai_quota.usoias, sin roles heredados. La cuenta separada plurione_ia_quota_maintenance hereda dbOwner solo en plurione_ai_quota y recibe el rol admin.plurione_ia_quota_shutdown; este ultimo concede unicamente shutdown sobre el recurso cluster y no hereda otros roles. La aplicacion usa unicamente la cuenta runtime.

### Aprovisionamiento y comprobación

1. Desde PowerShell normal del usuario `JOCABED\jocam`, ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\instalarMongoDatabaseTools.ps1`. Aunque conserva el nombre histórico, ahora solo comprueba versión, archivos y ACL del paquete ya extraído. No descarga, reinstala ni modifica permisos.
2. Verificar que Express/n8n siguen en sus puertos previstos y ejecutar `node .\scripts\verificarMongoDevRs.js --verificar`. Debe confirmar `marketingDevRs` PRIMARY y standalone original sin cambios. Confirmar que 27019 está libre; no es necesario liberar 27017 ni 27018.
3. Para una base de datos nueva, ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\prepararAlmacenCuotas.ps1`. Este script es solo para el primer arranque y rechaza un directorio existente. Invoca el aprovisionador Node con prompt TTY sin eco; no pasar contrasenas como argumentos. Si 27019 ya esta iniciado o el directorio existe, detenerse y usar el procedimiento de recuperacion separado, nunca repetir este paso.
4. Ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\probarRespaldoCuotas.ps1`. Antes de escribir, confirma que `usoias` contiene exactamente un documento ficticio no vencido y que el nombre aleatorio del destino temporal no existe. Hace dump/restauración a `usoias_restore_<id>` en la misma base, valida documento e índices y elimina únicamente ese destino y el fixture exacto. Usa contraseñas interactivas sin `--password`; no restaura sobre colecciones existentes ni usa `--drop`. Si falla una validación, se detiene y conserva el archivo temporal para análisis.
5. Ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\guardarUriCuotasDpapi.ps1` e introducir la contraseña runtime en el prompt oculto. El URI se cifra con DPAPI del usuario Windows y se guarda con ACL para ese usuario y SYSTEM en `%LOCALAPPDATA%\PluriOne\marketing-automation\secrets\quota-uri.dpapi`; no se escribe en `.env` ni Git.
6. Para validar desde Node sin llamada a Gemini y sin iniciar otra instancia de Express, ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\iniciarExpressConCuotas.ps1 -ValidarAlmacen`. Ese modo solo abre el validador Node con URI en memoria. El modo normal del lanzador se niega a iniciar si el puerto 3000 ya está ocupado; para usarlo posteriormente hay que detener/reiniciar el servidor existente de forma controlada y confirmar que 3000 quedó libre. `AI_ENABLED` y `AI_FREE_TIER_CONFIRMED` permanecen sin cambios.

El apagado, cuando se autorice, se hace con `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\detenerAlmacenCuotas.ps1`. El script valida PID, ejecutable, argumentos, loopback y propietario del listener 27019 antes de solicitar `shutdown`; no fuerza el proceso. El arranque posterior debe usar el mismo directorio y `--auth`, sin borrar datos. Antes de cada operación se vuelven a verificar las identidades de 27017 y 27018.

MongoDB exige que el primer usuario de autenticación se cree en `admin` cuando se activa control de acceso sin usuarios previos ([excepción localhost de MongoDB](https://www.mongodb.com/docs/v8.0/core/localhost-exception/)). MongoDB firma los MSI de Database Tools; el instalador valida con `Get-AuthenticodeSignature` antes de extraerlos ([verificación Windows](https://www.mongodb.com/docs/database-tools/verify/windows/)). La versión 100.19.1 soporta MongoDB Server 8.2 ([compatibilidad](https://www.mongodb.com/docs/database-tools/)).

### Recuperacion ante error de aprovisionamiento

El aprovisionador Node usa entrada TTY sin eco y no guarda ni pasa contrasenas en argumentos. El respaldo solicita sus contrasenas interactivamente sin `--password`.

Ante un error, el script informa etapa/codigo no sensible y conserva el estado para inspeccion. No borra datos ni usuarios inesperados. Usa el wrapper de recuperacion descrito abajo; no repitas el primer arranque.

El archivo de respaldo usa un nombre aleatorio y el script rechaza una colision antes de escribir. La restauracion se mapea a una coleccion aleatoria comprobada como inexistente, nunca usa `--drop`, y solo elimina el destino si su documento coincide exactamente con el fixture.

El verificador de Database Tools conserva el nombre historico `instalarMongoDatabaseTools.ps1`, pero solo comprueba version y ACL. No descarga, instala, escribe ni cambia permisos. Ejecutalo desde PowerShell normal de `JOCABED\jocam`; no cambies ACL para resolver una denegacion del entorno aislado.

El lanzador normal de Express se niega a iniciar si el puerto 3000 ya tiene listener. `-ValidarAlmacen` valida el backend protegido sin lanzar una segunda instancia.

### Recuperacion del proceso ya iniciado en 27019

La recuperacion no usa el script de primer arranque ni mongosh. Desde PowerShell normal, en el proyecto, ejecutar primero `node .\scripts\verificarMongoDevRs.js --verificar` y comprobar el PID/listener de 27019. Luego ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia\recuperarAlmacenCuotas.ps1`. El wrapper exige que el PID del archivo corresponda a mongod.exe 8.2.6, `--auth`, `--port 27019`, `--bind_ip 127.0.0.1` y al `dbPath` aprobado; exige un unico listener loopback. Node vuelve a comprobar identidad, usuarios, roles, bases, colecciones, indices y documentos antes de completar estado parcial.

El aprovisionador conserva `aprovisionarCuotas.mongo.js` por compatibilidad de nombre, pero ahora se ejecuta con Node y usa un prompt TTY sin eco. Introduce bootstrap (la clave previa si ya existe; si no, una nueva), runtime y mantenimiento; conserva runtime/mantenimiento en un gestor seguro. Nunca pegues contrasenas en comandos ni las compartas. Si ya existe un runtime o mantenimiento, la clave introducida debe autenticar esa cuenta existente; el script no la reemplaza. Solo reconoce bootstrap root y los dos usuarios/roles de cuotas esperados, y solo `usoias` con indices esperados y fixture exacto. Usuarios, roles, bases, colecciones, indices o datos ajenos hacen que se detenga antes de cambios posteriores y no los elimina.

MongoDB no permite enumerar usuarios sin privilegios. El primer arranque, separado, puede usar la excepcion localhost para crear el primer usuario unicamente si no existe ningun usuario o rol y el bypass esta habilitado. En modo recuperacion nunca se intenta crear el primer usuario: la cuenta bootstrap existente debe autenticar primero, o la ejecucion termina sin escrituras. Despues de autenticar, el inventario completo de usuarios, roles, bases, colecciones, indices y documentos se valida antes de cualquier cambio. Ante credenciales incorrectas u objetos inesperados, detenerse; nunca borrar ni reiniciar la instancia. Los errores muestran etapa y codigo no sensible, sin mensajes del driver ni contrasenas.

### Entrada de contrasenas en PowerShell

El prompt Node lee el TTY en modo raw, sin eco, byte por byte; esto tambien conserva una entrada pegada en un solo bloque y aplica retroceso. Escribe o pega la contrasena en el prompt oculto y pulsa Enter. Usa al menos 24 caracteres ASCII, distinguiendo mayusculas y minusculas, exclusivamente letras `A-Z`/`a-z`, numeros `0-9` y los simbolos `.`, `_`, `~`, `-`. No escribas comillas, espacios ni incluyas el texto del prompt. El error de politica informa solo `PASSWORD_POLICY_EMPTY`, `PASSWORD_POLICY_TOO_SHORT` o `PASSWORD_POLICY_CHARACTERS`; nunca incluye la entrada.


### Correccion del error role-maintenance en el perfil Gemini

La operacion fallida fue createRole en plurione_ai_quota con privileges [{ resource: { cluster: true }, actions: [shutdown] }] y roles [{ role: dbOwner, db: plurione_ai_quota }]. MongoDB devuelve InvalidRoleModification (49) porque un rol definido fuera de admin no puede conceder privilegios de cluster. La limitacion es el ambito del rol; MongoDB si permite que un rol definido en admin abarque el recurso cluster y herede roles de otras bases. Ver https://www.mongodb.com/docs/v8.2/reference/command/createRole/ y https://www.mongodb.com/docs/v8.2/reference/resource-document/.

El aprovisionador corregido crea plurione_ia_quota_maintenance en plurione_ai_quota con privilegios directos vacios y herencia exclusiva de dbOwner en esa base. Crea por separado admin.plurione_ia_quota_shutdown, con solo shutdown en { cluster: true } y sin herencia. El usuario de mantenimiento recibe ambos roles. No se concede root ni se amplia el usuario runtime.

La recuperacion vuelve a consultar y validar el inventario completo antes de escribir. Si el error anterior ocurrio en el orden actual, el rol runtime pudo haberse creado antes del fallo; createRole fallido no crea parcialmente el rol de mantenimiento, y las etapas de coleccion, indices, usuarios y fixture vienen despues. La recuperacion preserva y valida el rol runtime si esta presente, crea unicamente los roles ausentes con sus definiciones exactas y continua despues. Cualquier cuenta, rol, base, coleccion, indice o documento fuera de la allowlist detiene el proceso antes de cambios. El estado real de 27020 debe confirmarse durante esa ejecucion controlada; no fue consultado ni modificado en esta revision.