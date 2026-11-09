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
