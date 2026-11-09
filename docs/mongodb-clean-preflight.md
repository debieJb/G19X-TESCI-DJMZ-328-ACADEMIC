# MongoDB limpio: contrato y preflight (fase 1)

Esta fase no aprovisiona MongoDB ni acredita una instalacion limpia exitosa.
El contrato es `infra/mongodb-clean.profile.json`: perfil `plurione-clean-v1`,
27030, loopback 127.0.0.1, replica set `pluriOneCleanRs`, miembro
`localhost:27030` y base `plurione_clean`. No contiene secretos.

## Requisitos y uso futuro del preflight

Windows y PowerShell 5.1 o superior. Configurar explicitamente
`PLURIONE_MONGOD_PATH` y `PLURIONE_MONGOSH_PATH` con archivos llamados
`mongod.exe` y `mongosh.exe`. El preflight solo comprueba existencia, cadena de
rutas y lectura: no ejecuta binarios, verifica versiones ni certifica su origen.
La fijacion de versiones e integridad sigue pendiente.

`PLURIONE_MONGO_CLEAN_ROOT` permite sustituir `../plurione-clean-mongo`.
Todas las rutas relativas se resuelven desde el repositorio, no desde el cwd.
La raiz destino debe ser nueva; no se crean sus subdirectorios en esta fase.
No se carga `.env`. Invocacion manual futura: `powershell.exe -NoProfile -File
scripts/mongoClean/preflight.ps1`, con una politica de ejecucion autorizada.
No se cambia la politica persistente.

Se rechazan UNC, dispositivos, ADS, nombres reservados, rutas ambiguas,
reparse points/junctions en cualquier ancestro y solapamientos bidireccionales
con el repositorio, sistema, `C:\data\db` y raices historicas (defaults y overrides).
Se inventarian procesos mongod y servicios Mongo por CIM, sin conectar a DB.
Solo se admite descubrir sus datos mediante `--dbpath` absoluto explicito:
una invocacion con archivo de configuracion, comando oculto o permisos
insuficientes bloquea el preflight. No se leen datos ni directorios historicos.
Procesos detenidos no registrados y directorios antiguos desconocidos no pueden
descubrirse exhaustivamente; el inventario conocido requiere revision humana
antes de autorizar una fase posterior. No se modifica una proteccion para superar
un rechazo.

Se recorre la cadena del destino y binarios. La ACL del padre existente mas
cercano debe otorgar Modify al usuario/grupos actuales sin reglas Deny aplicables.
Es una comprobacion conservadora, no una prueba de escritura: no demuestra cuota,
espacio disponible, permisos efectivos futuros, politicas corporativas ni ACL
heredada resultante. Ningun archivo temporal se crea para probar permisos.

Se enumeran listeners TCP locales, incluidos IPv6 y wildcard. Puerto libre
**no equivale a identidad validada** y puede ocuparse despues (TOCTOU).
El resultado exitoso indica expresamente `identityValidated:false` e
`installationValidated:false`. Fallos generan codigo de salida 1 y JSON saneado:
`PREFLIGHT_REJECTED` con codigo de validacion permitido, o
`PREFLIGHT_EXECUTION_ERROR` con `INTERNAL_EXECUTION_ERROR` para excepciones
inesperadas. Nunca se serializan excepciones, comandos privados ni credenciales.

El capturador externo `scripts/mongoClean/diagnostico.js` permite, en una futura
ejecucion autorizada, distinguir tambien `PREFLIGHT_POLICY_BLOCKED`. Es necesario
porque un bloqueo de autorizacion sucede antes del manejador del archivo ps1.
Importar el modulo no ejecuta nada; su CLI si invoca el preflight real y no se
ejecuta durante estas pruebas. Captura stdout/stderr por separado, sin shell,
sin modificar politicas y sin publicar salida cruda. Reconoce indicadores
explicitos de autorizacion en stderr o en stdout no estructurado de un hijo
fallido; mensajes desconocidos se clasifican como error de ejecucion. Ni
AccessDenied, UnauthorizedAccess, PSSecurityException aislada ni una politica
Restricted bastan para afirmar bloqueo. Se exige un mensaje explicito de scripts
deshabilitados/firma o PSSecurityException acompanada de evidencia de autorizacion.
La captura conserva bytes y reconoce UTF-8, BOM, UTF-16 LE/BE y variantes ANSI
Windows-1252/OEM CP850. Sin BOM solo se interpreta UTF-16 con patron fuerte de
NUL alternos; la codificacion por si sola nunca demuestra autorizacion.
La clasificacion es conservadora y no identifica todas las variantes de politica.
Salida vacia produce EMPTY_OUTPUT; texto sin JSON ni evidencia de autorizacion
conserva UNSTRUCTURED_OUTPUT como error desconocido. Nada de ese texto se publica.
Timeout, fallo de lanzamiento, JSON invalido y codigos
inconsistentes son errores de ejecucion. El capturador no es un mecanismo para
superar una politica ni vuelve a intentar la ejecucion.

El intento real anterior devolvio UNSTRUCTURED_OUTPUT. Su stdout/stderr original
no se conservo; no es posible atribuirle una causa demostrada. Las regresiones
sinteticas reproducen dos defectos anteriores: no reconocer la frase espanola
"se ha deshabilitado la ejecucion de scripts" y decodificar UTF-16 como UTF-8.
Son causas posibles, no evidencia del intento anterior. Esta revision no repite
el diagnostico ni el preflight reales y no acredita sus validaciones.

## Validacion aislada

`node --test tests/mongoClean.preflight.test.js` ejecuta exclusivamente el contrato
y un fixture PowerShell sintetico. Se ejecuta exclusivamente el fixture en memoria
mediante `-EncodedCommand`, sin politica alternativa; importa declaraciones de
funcion desde el AST del preflight sin ejecutar main. No se evalua el preflight
completo en memoria ni se intenta superar la autorizacion de su archivo.
Todos los adaptadores OS se sustituyen: plataforma, filesystem, permisos, binarios,
inventario y listeners. El fixture inspecciona ademas el AST contra una lista de
comandos de lectura. En otros sistemas la prueba PowerShell queda omitida y no
constituye validacion Windows. Las pruebas del capturador usan exclusivamente un
doble de spawnSync y capturas sinteticas; no lanzan el preflight real.

El codigo de produccion solo lee perfil, metadatos, ACL, archivos binarios en modo
Open/Read, inventario CIM y listeners. No contiene operaciones de creacion,
escritura, cambio de ACL, arranque/apagado, llamadas a shell externa o drivers DB.
Las lecturas pueden producir auditoria del sistema o cambios de tiempos de acceso;
no se promete ausencia de efectos internos del sistema operativo.

Pendientes: integridad/versiones, inventario ampliado y pruebas de permisos reales,
espacio, proteccion contra carreras, bootstrap autenticado, identidad de proceso y
marcador persistente. No existe `preparar.ps1`; ninguna salida del preflight autoriza
escrituras, indices o creacion de usuarios.

## Fase 2: evidencia local saneada (ejecucion real pendiente)

`diagnostico.js` conserva su CLI y resultado anteriores. `ejecutarDetallado`
devuelve una proyeccion saneada de la captura; `ejecutar` sigue devolviendo solo
el diagnostico. `registro.js` agrega una entrada optativa para escribir esa
proyeccion. Importar ambos modulos no ejecuta procesos ni escribe archivos.
No se ha ejecutado el preflight real para validar esta fase.

El registro JSON version 1 contiene exclusivamente:

- `diagnostic`: resultado, etapa y codigo permitidos, o los dos indicadores false
  del exito. No conserva campos adicionales recibidos del hijo.
- `process.exit`: ZERO, ONE, OTHER o UNAVAILABLE; `error`: NONE, ENOENT, EACCES,
  EPERM, ETIMEDOUT, ENOBUFS u OTHER; `signaled`: booleano, sin nombre de senal.
- Para stdout y stderr por separado: intervalo de tamano EMPTY (0 bytes), SMALL
  (1-1024), MEDIUM (1025-65536), LARGE (mas de 65536); BOM NONE/UTF8/UTF16LE/UTF16BE;
  UTF-8 valido, patron NUL alterno, candidatos legacy, contenido blanco,
  JSON parseable y presencia de evidencia explicita de autorizacion.

No hay texto libre, muestras, bytes, base64, hashes de salida, rutas, usuario,
hostname, PID, variables de entorno, comandos, mensajes de excepcion ni stacks.
Los bytes originales solo se procesan en memoria dentro de los limites del
capturador (30 segundos, maxBuffer de 1 MiB); no se escriben en disco.
Esto no garantiza borrado seguro de memoria ni impide auditoria, paginacion,
crash dumps o transcripciones impuestas por el sistema operativo.

El destino requiere configuracion explicita: la CLI lee
`MONGO_PREFLIGHT_LOG_DIRECTORY` (ruta absoluta local ya preparada). Las API son
`guardarCaptura(capture, nombre, { directory }, write?)` y
`ejecutarConRegistro(nombre, { directory }, run?, environment?, write?)`.
La configuracion pertenece al operador confiable; no debe derivarse de entradas
no confiables ni del nombre. No existe un directorio predeterminado.
Solo se aceptan nombres simples ASCII con extension exacta `.log`; se rechazan
rutas absolutas, separadores de ambas plataformas, unidades, streams Windows,
nombres de dispositivos, componentes `..` y otras extensiones. No se admiten
subdirectorios ni se crean padres. El destino resuelto debe ser hijo directo
del directorio autorizado.

Antes de cada escritura se inspeccionan los componentes con lstat y se compara
realpath. En Windows se revisan ademas atributos ReparsePoint de todos los
ancestros mediante PowerShell, sin alterar politicas. Solo se aceptan volumenes
locales fijos NTFS/ReFS. El directorio debe pertenecer al SID actual, tener
herencia ACL deshabilitada y no conceder acceso Allow a identidades distintas
del usuario actual, SYSTEM y Administradores. Se exige una regla Allow de
control total para el usuario actual heredable por archivos, sin restricciones
de propagacion. Si no se puede consultar o
verificar esta configuracion, se rechaza. No se modifican ACL en produccion.
En POSIX se exige propietario actual y ausencia de permisos de grupo/otros.
El operador debe preparar previamente el directorio privado y proteger tambien
sus ancestros contra sustitucion por usuarios no confiables.

El escritor usa creacion exclusiva `wx` y modo `0600`: no sobrescribe archivos
ni sigue un enlace final preexistente. En Windows el modo no sustituye la ACL;
el archivo hereda la ACL del directorio preparado. Los errores devuelven solo
WRITE_FAILED y conservan el diagnostico original, sin excepciones, rutas ni
salidas crudas. No cambia el esquema saneado version 1. Un fallo puede dejar
JSON parcial; no se promete atomicidad ni durabilidad. No hay reintentos.

**Limite TOCTOU:** lstat, realpath y Get-Acl son comprobaciones previas, no una
garantia contra sustitucion concurrente. Las API usadas de Node.js/Windows no
anclan la creacion a handles de todos los padres ni impiden su reemplazo entre
validacion y apertura. No se demuestra proteccion absoluta frente a un actor
que pueda sustituir ancestros, cambiar ACL o actuar como el mismo usuario o
administrador. Se requiere esa confianza externa; la comprobacion de la ACL
del directorio no acredita las ACL de todos sus ancestros. Si esa condicion
operativa no puede establecerse, no debe habilitarse el registro. Las pruebas
estaticas y sinteticas no demuestran ausencia de carreras.

### Procedimiento futuro, solo con autorizacion para ejecutar el preflight real

1. Revisar el codigo y conservar su revision (`git rev-parse HEAD` y la revision
   de cualquier cambio local). Anotar aparte versiones de Node y Windows
   PowerShell, sin copiar rutas, variables ni inventarios privados al informe.
   El registro no captura automaticamente estos datos ni prueba autenticidad.
2. Confirmar Windows PowerShell 5.1+, politica ya autorizada, binarios explicitos
   y raiz nueva segun el contrato. Revisar el inventario historico conocido.
   No cambiar politicas ni protecciones para obtener un resultado favorable.
3. Preparar un directorio privado existente con las condiciones anteriores,
   configurar `MONGO_PREFLIGHT_LOG_DIRECTORY` y elegir un nombre `.log` nuevo. Desde el
   repositorio, la invocacion futura es
   `node scripts/mongoClean/registro.js <archivo-local-nuevo.log>`.
   Este comando SI ejecuta el preflight real una vez; no usarlo como prueba
   sintetica. No redirigir el PowerShell original ni usar transcript para guardar
   su salida. No cargar `.env` para esta operacion.
4. Leer el JSON saneado y comprobar `record:SAVED` en la respuesta de la CLI.
   Codigo de salida de la CLI: 0 para preflight OK y registro guardado; 1 para
   diagnostico fallido y registro guardado; 2 para argumento invalido o fallo
   del registro. WRITE_FAILED no cambia ni acredita el diagnostico del hijo.
   Con nombre o configuracion invalidos la CLI no ejecuta el preflight;
   la validacion de ACL si puede invocar PowerShell de solo lectura.

### Interpretacion y limites

| Resultado/codigo | Interpretacion y siguiente revision |
| --- | --- |
| EMPTY_OUTPUT | Ambos flujos estan vacios o blancos tras decodificar; revisar estado del proceso. |
| UNSTRUCTURED_OUTPUT | No se obtuvo JSON completo ni bloqueo demostrado; comparar flujos, BOM, NUL y candidatos legacy. No determina causa exacta. |
| INVALID_DIAGNOSTIC | Hay JSON pero contrato o codigo de salida incoherente; JSON parseable no equivale a diagnostico valido. |
| UNEXPECTED_STDERR | Hubo JSON y stderr no blanco sin bloqueo demostrado. No se conserva el mensaje. |
| PROCESS_FAILED | Fallo al lanzar, timeout, limite de buffer, senal o estado ausente. El codigo permitido del proceso ayuda a distinguirlos; OTHER sigue siendo desconocido. |
| PREFLIGHT_POLICY_BLOCKED | Hijo fallido y evidencia explicita reconocida. No cambiar politica ni reintentar automaticamente. |
| PREFLIGHT_REJECTED | Guarda conservadora; revisar el codigo permitido sin relajar protecciones. |
| PREFLIGHT_READ_ONLY_OK | Lecturas completadas; identidad e instalacion siguen sin validar. |

Los indicadores de autorizacion se registran incluso cuando un fallo de proceso
tiene prioridad; no son por si solos una conclusion de bloqueo. UTF-8 valido no
identifica la codificacion real (ASCII y UTF-16 con NUL pueden ser UTF-8 validos).
`legacyCandidates` significa que se consideraron Windows-1252 y CP850 sin poder
elegir entre ellos. El patron NUL es heuristico; otras paginas de codigo,
UTF-32, archivos truncados y mensajes de autorizacion no reconocidos pueden
seguir siendo desconocidos. No se intenta reparar salida ni interpretar CLIXML
como XML ejecutable. Perder el texto es intencional: si la evidencia no alcanza,
se requiere una nueva prueba sintetica y revision del capturador, sin activar
almacenamiento crudo. No puede recuperarse la causa del intento historico.

Validacion conjunta aislada:
`node --test tests/mongoClean.preflight.test.js tests/mongoClean.registro.test.js`.
Las pruebas usan capturas y spawn sinteticos. Los archivos, ACL y enlaces
de prueba se crean exclusivamente en directorios temporales eliminados al
finalizar; los errores EACCES/EPERM/ENOSPC/EIO se inyectan en el escritor.
Los symlinks de archivo se omiten si Windows no concede privilegios; las
junctions se prueban por separado. Ninguna prueba ejecuta la CLI de registro con argumentos reales.

## Fase 3: clasificacion conservadora del inventario historico

Esta ampliacion se valida solo con CIM y filesystem sinteticos: no acredita
el inventario del equipo ni reejecuta el preflight real. No lee configuraciones
MongoDB, datos historicos ni archivos YAML; no ejecuta mongod/mongosh.

El adaptador conserva la procedencia PROCESS (`CommandLine` de Win32_Process,
filtrado por mongod.exe) y SERVICE (`PathName` de Win32_Service, filtrado por
nombre Mongo o comando mongod). Incluye servicios detenidos registrados; un
proceso y su servicio pueden aparecer por separado. No se deduplican ni se
correlacionan como identidad probada. Un servicio con nombre Mongo puede ser
un falso positivo: sigue requiriendo revision, no se ignora automaticamente.

| Clasificacion interna | Evidencia y limites | Resultado publico |
| --- | --- | --- |
| IDENTIFIED | Un unico `--dbpath` absoluto, sintacticamente valido y normalizado, declarado sin `--config`/`-f`. Se agrega a rutas protegidas. No demuestra identidad del binario, ruta fisica canonica ni configuracion efectiva del servidor. | Continua las demas guardas; no implica exito global. |
| INFORMATION_INCOMPLETE | Comando oculto/vacio, ejecutable no reconocido, dbPath ausente/relativo/invalido, argumentos incompletos, duplicados o comillas ambiguas; tambien fallo de consulta CIM. | PREFLIGHT_REJECTED / INVENTARIO_INFORMACION_INCOMPLETA |
| CONFIGURATION_UNVERIFIABLE | `--config` o `-f` con valor: su ubicacion puede ser absoluta, relativa, invalida o duplicada. Ni una ruta absoluta ni un dbPath adicional acreditan el contenido. | PREFLIGHT_REJECTED / INVENTARIO_CONFIGURACION_NO_VERIFICABLE |
| CONFLICT_CONFIRMED | Solapamiento bidireccional entre destino limpio y dbPath declarado, absoluto y normalizado, sin configuracion adicional. Confirma el conflicto entre rutas declaradas, no identidad ni acceso real a datos. | PREFLIGHT_REJECTED / INVENTARIO_CONFLICTO_CONFIRMADO |

La gramatica admite valores separados o con `=`, rutas con espacios entre
comillas dobles y opciones completas entre comillas. Es deliberadamente limitada:
no pretende implementar todas las reglas de argv de Windows, escapes, wrappers o
expansion de shell. Ademas de dbpath/config/-f reconoce argumentos con valor
`--port`, `--bind_ip`, `--replSet`, `--logpath` y flags `--service`, `--auth`,
`--noauth`, `--bind_ip_all`, `--logappend`, `--quiet`, con su escritura exacta.
Argumentos adicionales desconocidos o valores ausentes tambien rechazan; no se
pretende validar toda la semantica de esos argumentos ni certificar su efecto. Formas ambiguas (incluido `-farchivo`) se rechazan como
informacion incompleta. Nunca se resuelve una ruta relativa historica usando el
cwd del inspector: el directorio de trabajo del servicio/proceso es desconocido.

Las razones internas son enumeraciones fijas (por ejemplo COMMAND_UNAVAILABLE,
DBPATH_UNRESOLVED, CONFIG_PATH_UNRESOLVED y CONFIG_CONTENT_NOT_VERIFIED).
Las entradas internas contienen rutas privadas solo en memoria: no deben
serializarse ni incorporarse al registro. La salida publica conserva unicamente
los codigos permitidos; no agrega comandos, rutas, nombres de servicio, PID,
contenido de configuracion ni excepciones. El esquema saneado version 1 permanece
igual y WRITE_FAILED conserva el diagnostico principal. El codigo anterior
DIRECTORIO_HISTORICO_NO_DEMOSTRADO sigue admitido por compatibilidad.

Si existen varias entradas, un conflicto declarado confirmado tiene prioridad,
seguido de configuracion no verificable e informacion incompleta. No se omiten
entradas desconocidas para obtener exito. Un fallo CIM impide afirmar que la
consulta fue completa, incluso si antes se obtuvo una parte del inventario.
Las clasificaciones no representan un inventario exhaustivo por instancia en la
salida publica. Un archivo de configuracion conocido requerira una auditoria
separada de contenido, precedencias, integridad, permisos y cadena de rutas;
configuracion ausente, ilegible, YAML complejo, expansion externa o reparse
points no se presumen seguros ni se certifican en esta fase.

Persisten TOCTOU, alias de rutas fisicas, comandos ocultos, restricciones de
permisos y entornos detenidos no registrados. Las nuevas pruebas usan solo
rutas ficticias y dobles CIM, con trampas para impedir lecturas de filesystem/ACL
desde el clasificador y adaptador de inventario. No crean directorios ni cambian
ACL. Para validar esta ampliacion sin ejecutar las pruebas de registro que
preparan ACL temporales, usar:
`node --test tests/mongoClean.preflight.test.js`.
