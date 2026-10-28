# Identidad del servicio original y reinicios de Windows

## Arranque confirmado: 27 de octubre de 2026

Resultados reales confirmados por el responsable del entorno antes de esta publicación:

- MongoDB original validado con PID **6040** y mensaje `STANDALONE_ORIGINAL: PID_VERIFICADO_6040; CONFIGURACION_DATOS_E_INDICES_SIN_CAMBIOS`.
- MongoDB de desarrollo iniciado correctamente en el puerto **27018**; replica set `marketingDevRs` en estado **PRIMARY**, con un miembro.
- PluriOne iniciado mediante `npm run dev:piloto`, disponible en `http://localhost:3000`.
- Backend de cuotas IA `piloto_local`, con `cuotasVerificadas: true`.
- Última validación automatizada reportada: **195 pruebas distintas aprobadas**.

Estos resultados completan la validación y el arranque que el diagnóstico inicial dejaba pendientes. Para preparar esta publicación no se repiten arranques ni operaciones reales de escritura, ni se detienen o modifican instancias de MongoDB. Los resultados de las pruebas ejecutadas para publicar se registran al final de este documento.

## Diagnóstico inicial de solo lectura (anterior al arranque confirmado)

El fallo inicial del lanzador no se debía a PLURIONE_MONGOD_PATH ni al directorio portable de desarrollo. `iniciarMongoDevRsExistente.ps1` ejecuta `verificarMongoDevRs.js --comparar-original` antes de iniciar la réplica; el mensaje «La instancia original no coincide» resume cualquier fallo de esa comprobación. Durante el diagnóstico inicial no se ejecutó el lanzador.

En ese diagnóstico se confirmó que el servicio MongoDB seguía Running/Auto, su comando coincidía con v3 y su único listener 27017 era 127.0.0.1, propiedad del PID 6040. MongoDB reportaba ese mismo PID y seguía siendo standalone. En ese momento el puerto 27018 no tenía listener. La fecha de creación observada del proceso era `2026-10-26T08:25:29.6505860Z`.

| Comprobación anterior | Resultado del diagnóstico inicial |
| --- | --- |
| PowerShell exige Service.ProcessId = 6160 | Falla: 6040 |
| PowerShell consulta literalmente el proceso 6160 | Consulta obsoleta; el guard anterior aborta antes de llegar a ella. No identifica al servicio actual |
| Node compara la captura Mongo completa contra v3.actual | Falla exclusivamente por PID: 6040 frente a 6160 |
| Node compara las dos capturas del servicio con v3.servicio | No pueden coincidir: PID, ownerPid y processCreatedUtc son diferentes |
| Historia: baseline y v2 siguen describiendo PID 5648, y v3 documenta 5648 → 6160 | Correcto; son hechos históricos, no el PID que debe tener cada arranque |
| Configuración Mongo, huella de datos y huella de índices contra v3 | Coinciden en dos lecturas independientes |
| SHA-256 de ejecutable y archivo de configuración contra v3 | Coinciden |
| Rutas del binario, configuración y datos: canónicas y sin reparse points en sus ancestros | Verificadas por lectura del sistema de archivos |
| Directorios seguros de desarrollo y cadena de referencias | Verificados; no se alteraron |
| Ruta de imagen y comando reales del proceso 6040 | Pendientes: CIM devuelve campos vacíos por permisos. QueryFullProcessImageName con acceso limitado también fue denegado |

En la sesión diagnóstica había dos restricciones adicionales: el aislamiento impedía consultas CIM y PowerShell sin una política de proceso explícita bloqueaba `-File`. Se autorizaron consultas fuera del aislamiento. La ejecución diagnóstica del nuevo verificador utilizó Bypass exclusivamente en su proceso hijo, sin cambiar políticas persistentes: llegó a `IDENTIDAD_PROCESO_NO_LEGIBLE` y se detuvo. No se agregó Bypass a `leerServicio` ni se rebajaron controles para superar permisos.

Por tanto, ese diagnóstico verificó las huellas de los archivos esperados, pero no pudo probar que la imagen del proceso fuera ese archivo. La validación completa y el arranque de 27018 quedaron pendientes entonces; posteriormente se confirmaron con los resultados de la primera sección.

Para futuras comprobaciones de solo lectura, desde una sesión con esos permisos y una política de ejecución autorizada puede ejecutarse `node scripts/verificarMongoDevRs.js --comparar-original`. Ese modo solo comprueba el original: no inicia 27018. No debe sustituirse por el lanzador ni por los modos de captura o inicialización para diagnosticar el fallo.

## Separación entre historia y cada arranque

`mongoDevRsReconciliacion.js` conserva `validarReconciliacion` para reproducir la conciliación histórica única y añade `validarHistoria`, `validarArranqueOriginal` y su coordinador `comprobarArranqueOriginal`. El arranque usa estas últimas funciones, no la reproducción de un proceso histórico.

Antes de consultar MongoDB se comprueba:

1. Directorios seguros de desarrollo, sin enlaces o redirecciones, y referencia baseline existente.
2. Autorización v2: solamente el índice único parcial aprobado diferencia su inventario de la baseline.
3. Hash anclado de los bytes v3 y correspondencia de sus objetos con los bytes originales. v3 fija a su vez los hashes baseline/v2. Los PID históricos 5648 y 6160 se siguen validando dentro de esa historia.

En cada comprobación de arranque:

1. PowerShell toma el PID actual del servicio MongoDB. Exige Running, Auto, comando autorizado y un único listener loopback 27017 perteneciente a ese PID.
2. Consulta Win32_Process por ese PID actual. Exige nombre mongod.exe, fecha de creación legible, ruta de imagen y línea de comando reales. Si faltan permisos, falla; no sustituye la ruta del proceso por la del servicio.
3. Usa las rutas persistentes de la evidencia v3 autenticada, no las variables del lanzador de desarrollo. Comprueba rutas canónicas, tipos de archivo/directorio y ausencia de reparse points en cada ruta y sus padres. Comprueba los hashes del ejecutable y configuración contra v3.
4. Node lee del standalone `hello`, `getCmdLineOpts`, `serverStatus`, `dbHash`, `listCollections` y `listIndexes`. Mantiene el algoritmo de huellas anterior, sin recapturar ni actualizar una baseline.
5. Se repite la captura de servicio. Ambas capturas deben ser idénticas entre sí, incluida la fecha de creación, rutas, comandos, PID y hashes. El PID reportado por MongoDB debe coincidir con servicio y listener.
6. Todos los campos persistentes y las huellas de configuración, datos e índices deben coincidir con v3. Solo PID/ownerPid y fecha de creación pueden diferir de la evidencia histórica; no pueden cambiar durante la comprobación. El log de éxito muestra el PID verificado actual.

Un reinicio legítimo conserva la identidad persistente aunque cambien PID y fecha. Una actualización del ejecutable, cambio de configuración o datos diferentes sigue bloqueando el arranque: requiere una revisión independiente, nunca modificar las referencias para que el chequeo pase. No se admite un cambio de PID a mitad de la comprobación.

## Referencias conservadas

| Archivo | SHA-256 antes y después |
| --- | --- |
| original-baseline.json, fuera del repositorio en la raíz Mongo de desarrollo | 52d8e988aaaeecdc09973ab5ae347e77f275d616a2c204d444e5ce17eb6d5e1c |
| docs/mongodb-indices-autorizados-v2.json | fdb8ad3dd9754147cb47f38230a245a81c49f36c7a809d49f2beea7173e23e25 |
| docs/mongodb-reconciliacion-pid-v3.json | 9958ed6eeabf1cfd651aba11c108817b7d095510059a0da8dec7e4395b57353d |

No se reescribieron referencias JSON, informes ni copias históricas. Durante el diagnóstico inicial y la preparación de esta publicación tampoco se ejecutaron capturas de baseline, inicialización, migración, recuperación, restauración, arranque ni apagado. El arranque posterior confirmado por el responsable se documenta por separado en la primera sección.

## Pruebas y límites de verificación

Validación para esta publicación (27 de octubre de 2026): se volvió a ejecutar el comando de 16 archivos indicado abajo, con salida **195 pruebas, 195 aprobadas, 0 fallidas, 0 canceladas y 0 omitidas**, código de salida 0. Se usaron pruebas con dobles y comprobaciones locales, sin operaciones sobre instancias reales de MongoDB.

Se ejecutaron juntos 16 archivos con `node --test --test-reporter=tap`: **195 pruebas aprobadas, 195 nombres distintos, 0 fallidas, 0 canceladas y 0 omitidas por el runner**. Son las 154 pruebas de portabilidad anteriores y 41 nuevas de reconciliación; no se suman repeticiones.

```powershell
node --test --test-reporter=tap tests/rutasLocales.test.js tests/mongoDevRs.identidad.test.js tests/mongoDevRs.referencia.test.js tests/mongoDevRs.reconciliacion.test.js tests/ia.provisioningCuotas.test.js tests/ia.scriptsInfraestructura.test.js tests/infraGmail.test.js tests/pilotoGmail.unit.test.js tests/ia.almacenDev.test.js tests/ia.almacenProtegido.test.js tests/ia.pilotoLocal.test.js tests/ia.limites.test.js tests/gmail.preparacion.local.test.js tests/gmail.transaccional.test.js tests/gmail.oauth.service.test.js tests/gmail.envio.http.test.js
```

Las nuevas pruebas cubren PID legítimos 6040/6160/9900, cambio durante la comprobación, discrepancias de PID servicio/listener/Mongo, identidad o servicio sustituidos, huellas de configuración/datos/índices, comandos e imagen reales, permisos insuficientes, rutas canónicas y referencias alteradas. Un adaptador PowerShell simulado verifica siete escenarios sin consultar procesos ni bases reales. El coordinador se prueba con dobles para garantizar historia → servicio → huellas Mongo → servicio. El fixture conserva únicamente datos sintéticos y lecturas de las referencias del repositorio.

Las consultas del diagnóstico inicial fueron de solo lectura y se distinguen del arranque posterior confirmado por el responsable. Para esta publicación no se ejecutan las pruebas de integración con bases reales de `pruebas-integracion/`, las pruebas visuales ni las operaciones de preparación/restauración. No se detiene ni reinicia el proceso 6040 ni se modifican bases existentes.
