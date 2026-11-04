# Auditoría de portabilidad — 27 de octubre de 2026

Rama revisada: `respaldo-avances-18-oct`. Cambios pendientes de revisión, sin commit ni push.

## Hallazgos y decisiones

- Las rutas personales operativas estaban en mongoDevRsComun.js, iniciarMongoDevRs.ps1, iniciarMongoPilotoLocal.ps1, quotaTarget.js, prepararEntornoGmailLocal.js y cinco wrappers PowerShell de cuotas (preparación legacy y Gemini, recuperación, apagado y respaldo). Se sustituyeron por un único resolvedor Node y un adaptador PowerShell.
- iniciarMongoDevRsExistente.ps1 ya consultaba ROOT desde Node; ahora también resuelve el ejecutable compartido.
- mongod estaba fijado a Program Files/MongoDB/Server/8.2/bin; los lanzadores y wrappers usan PLURIONE_MONGOD_PATH o PATH. mongosh usa PLURIONE_MONGOSH_PATH o PATH, sin suponer una instalación bajo LOCALAPPDATA/Programs. Una ruta explícita inexistente falla sin fallback. No se ejecutan los binarios al resolverlos.
- Los valores predeterminados son cuatro directorios hermanos del repositorio. Coinciden con las ubicaciones del entorno actual; otras ubicaciones requieren las variables PLURIONE_MONGO_DEV_ROOT, PLURIONE_MONGO_PILOT_ROOT, PLURIONE_MONGO_QUOTA_ROOT y PLURIONE_MONGO_GEMINI_ROOT. No se mueven datos. Las rutas relativas se anclan al repositorio. Los scripts no cargan .env; las variables deben heredarse de la sesión.
- DPAPI y Database Tools ya derivan sus ubicaciones de LOCALAPPDATA. Se conservaron versiones, ACL y controles. La prueba visual de campañas ahora admite PUBLIC_BROWSER_EXECUTABLE, como las otras pruebas visuales; Edge permanece como alternativa conocida.
- verificarServicioMongoOriginal.ps1 mantiene las rutas fijas del ejecutable, configuración y datos del servicio original. Son parte de una identidad histórica que también exige PID, comando y hashes; no se debilita esta autorización para aceptar cualquier instalación. Una referencia nueva requiere un procedimiento auditado independiente. Por ello la portabilidad del diagnóstico histórico del servicio original sigue limitada intencionalmente.
- tests/mongoDevRs.identidad.test.js conserva una ruta ajena sintética para probar rechazo; no es configuración operativa.

## Procedencia documental

Se mantuvieron íntegros los reportes JSON, las referencias MongoDB y las copias bajo docs/historico y docs/revision-mongodb-6160. También se preservaron los textos históricos de cierre-tecnico-2026-10-15.md, entorno-real-gmail-preparado-2026-10-18.md, infraestructura-recuperada-2026-10-18.md y preparacion-base-piloto-2026-10-18.md.

Los documentos mongodb-replicaset-desarrollo.md, cuotas-ia-produccion.md y piloto-gmail-un-correo.md recibieron únicamente una nota inicial que distingue el entorno documentado de la configuración vigente. Su texto anterior se conserva completo debajo de la nota. README y .env.example describen las variables nuevas. No se transformaron evidencias históricas.

## Validación segura

154 pruebas distintas aprobadas, 0 fallidas al cierre, 0 saltadas por el runner:

```powershell
node --test tests/rutasLocales.test.js tests/mongoDevRs.identidad.test.js tests/mongoDevRs.referencia.test.js tests/ia.provisioningCuotas.test.js tests/ia.scriptsInfraestructura.test.js tests/infraGmail.test.js tests/pilotoGmail.unit.test.js
node --test tests/ia.almacenDev.test.js tests/ia.almacenProtegido.test.js tests/ia.pilotoLocal.test.js tests/ia.limites.test.js tests/gmail.preparacion.local.test.js tests/gmail.transaccional.test.js tests/gmail.oauth.service.test.js tests/gmail.envio.http.test.js
```

La primera selección dio 60 aprobadas; después se agregaron dos casos de rutas y se volvió a ejecutar rutasLocales.test.js (5/5). La segunda selección dio 92/92. La integración PowerShell/Node usa únicamente el resolvedor, ejecutables ficticios apuntando al propio Node, rutas sin escrituras y otro cwd. La política de ejecución Bypass se limita al proceso hijo de prueba; no cambia la del sistema. Se comprobaron rutas con espacios, overrides relativos y absolutos, valores predeterminados, errores sin fallback y selección de rutas por consumidores Node. Gmail valida identidad mediante un doble y rechaza un dbPath ajeno. Las pruebas HTTP usan servicios simulados.

Al inicio fallaron tres aserciones que buscaban la ruta literal anterior y la prueba PowerShell por la política de ejecución del proceso hijo; se corrigieron las aserciones y el lanzamiento de prueba y se verificaron de nuevo.

Análisis de sintaxis aprobado en los 17 archivos PowerShell de scripts. git diff --check aprobado. Búsqueda de jocam en scripts, tests, README.md y .env.example: sin coincidencias.

Omitidas deliberadamente: pruebas-integracion/infraGmail.js, cuotasIADev.js y demás integraciones contra instancias existentes, preparación, restauración, recuperación, arranque y apagado reales. Las integraciones Mongo actuales crean/eliminan fixtures en servidores existentes y no cumplen el aislamiento solicitado. No se ejecutó la suite global indiscriminadamente ni las pruebas visuales del navegador. La funcionalidad con procesos reales no se revalidó en esta intervención.

No se inició ni detuvo MongoDB, no se cambiaron puertos, no se conectó a bases reales y no se modificaron credenciales ni archivos .env. Se conservaron las comprobaciones existentes de identidad, directorios seguros, rutas canónicas y referencias de seguridad.

## Revisión final previa al commit

Por solicitud posterior de la responsable se autoriza el commit y el push a origin/respaldo-avances-18-oct con el mensaje `refactor: configurar rutas portables de MongoDB y cuotas IA`. La indicación inicial de cambios pendientes describe la primera entrega; este apartado registra la revisión posterior. La confirmación del hash local/remoto se comunica después de publicar, sin anticipar ese resultado en este archivo.

Se revisaron el diff completo y los cuatro archivos nuevos. Se compararon automáticamente los cuatro valores predeterminados con los literales del HEAD previo: coinciden en el equipo actual. Los valores son distintos entre sí y no cambian puertos, nombres de base ni perfiles. No hay selección automática de otro directorio por ausencia del configurado. Los overrides son configuración explícita: deben señalar al almacén previsto y no son una garantía contra un error de configuración del operador. No se han ejecutado los lanzadores contra datos reales. Las comprobaciones originales de identidad y seguridad permanecen presentes; los perfiles Gmail y cuotas legacy siguen siendo alternativos por compartir 27019.

Se volvieron a ejecutar juntos los 15 archivos de prueba enumerados arriba, con `node --test --test-reporter=tap`: **154 tests, 154 pass, 0 fail, 0 cancelled, 0 skipped**. El reporte TAP contiene 154 entradas Subtest con 154 nombres distintos; no se sumaron las repeticiones de ejecuciones anteriores. El análisis de sintaxis volvió a aprobar los 17 scripts PowerShell y git diff --check terminó sin errores.

Inventario completo de integraciones de pruebas-integracion/ que no se ejecutaron:

- autoservicioEmpresarial.js
- campanasFlujo.js
- cuotasIADev.js
- enviosGmail.js
- iaPilotoHttp.js
- infraGmail.js
- registroEmpresarial.js
- verificacionAutomatica.js

Tampoco se ejecutaron las pruebas visuales de tests/soporte/, ni scripts reales de preparación, migración, recuperación, respaldo/restauración, arranque o apagado de MongoDB. Son exclusiones de alcance, no tests saltados dentro del runner.

Se revisó la lista de archivos: solo se incluye .env.example como plantilla pública; ningún .env, archivo DPAPI, clave privada, credencial ni token. Las asignaciones nuevas contienen únicamente rutas genéricas y opciones vacías. No se agregan datos personales. Se verificó además que las tres notas de portabilidad preceden al texto histórico completo sin reemplazarlo. Las referencias JSON y copias históricas siguen fuera del conjunto de cambios.
