# Resultados de preparacion — 2026-10-15

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


> Actualizacion posterior a las fases descritas: MongoDB de piloto 27019 fue creado e inicializado con autorizacion expresa. marketingPilotLocalRs, miembro 127.0.0.1:27019 y PRIMARY se confirmaron por consultas reales. Solo hay admin/config/local. No hubo migraciones, usuarios ni datos empresariales. Las afirmaciones inferiores sobre instancia inexistente describen el momento de aquellas fases; el estado vigente esta en [cierre tecnico](cierre-tecnico-2026-10-15.md). El piloto de envio sigue sin autorizar.

> El bloque siguiente conserva la evidencia de la fase de infraestructura. La fase actual de autorizacion de un correo y sus resultados finales se documenta al final; los 117 casos de la fase anterior no se suman otra vez.

Estado: infraestructura de desarrollo validada de forma aislada; piloto real bloqueado. No se leyo ningun archivo de entorno, token ni credencial real. No se enviaron correos, activaron flags, autorizaron cuentas, modificaron datos empresariales existentes ni realizaron operaciones de Git que escriban historial.

## Pruebas de esta fase

| Ejecucion | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Infraestructura nueva, integracion aislada, sesiones y HTTP autoservicio | 28 | 0 | 0 |
| Regresiones HTTP autenticacion/publicas y Gmail OAuth/interfaz/flujo | 89 | 0 | 0 |
| Total de pruebas distintas | 117 | 0 | 0 |

Primera ejecucion incluye `tests/infraGmail.test.js`, `pruebas-integracion/infraGmail.js`, `tests/session.config.test.js`, `tests/autoservicio.http.test.js`. Segunda incluye `auth.http`, `publicas.http`, `gmail.oauth.transporte`, `gmail.oauth.service`, `gmail.oauth.http`, `gmail.oauth.firma`, `gmail.interfaz`, `gmail.flujo`, `gmail.envio.http` de `tests/*.test.js`.

Se uso un lanzador con bloqueo de lectura de archivos de entorno y salida limitada a contadores TAP. No se ejecuto la suite completa: esta validacion selecciona infraestructura y regresiones relacionadas sin activar la bandera de envio usada por otras pruebas antiguas.

## Comprobaciones reales locales

- Supervisor ejecuto `procesarEnvioGmail.js --comprobar` como proceso real, PID observado 31900, salida correcta, codigo 0, cero reinicios; proceso terminado. No quedo trabajador residente.
- MongoDB 27018: identidad `marketingDevRs`, miembro esperado `localhost:27018` y PRIMARY verificados por helper existente, con directorio y opciones del proceso comprobados.
- Indices de 14 modelos y TTL de sesiones en fixtures propias vacias; comprobacion idempotente. Rechazo antes de DDL por marcador ajeno, datos existentes y falta de TTL al arrancar almacen.
- Transaccion abortada sin escritura residual. Sesiones cifradas persistentes entre aplicaciones y dos procesos nuevos; caducidad logica, revocacion frente a escritura atrasada, alteracion de cifrado y error de almacenamiento tratados con fallo cerrado.
- Baseline de MongoDB principal coincide antes y despues; proceso, configuracion, datos e indices comprobados mediante helper de baseline autorizado. Cero bases temporales restantes al verificar.
- Comprobacion final informa envio deshabilitado. No se modifico configuracion de ningun servidor MongoDB.

## Simulado o no confirmado

- HTTPS/proxy: cabecera simulada en HTTP local; no certificado ni canal TLS real.
- Regresiones OAuth/Gmail: transportes y proveedores simulados; ninguna cuenta autorizada, renovacion real, cuota real o entrega comprobada.
- Almacen nuevo: persistencia real local y pruebas funcionales; falta auditoria y despliegue endurecido, prueba de backup/failover y rotacion.
- Infraestructura de piloto dedicada, proveedor OAuth, cuentas empresariales, consentimiento productivo y servicio residente del SO: no confirmados/configurados por esta tarea.
- Hallazgos historicos de secretos no revisados ni resueltos por esta fase.

## Archivos de esta fase

Modificados: `app.js` (compatibilidad de desarrollo mediante fabrica), `scripts/procesarEnvioGmail.js` (comprobacion sin envio y preflight de destino/indices).

Nuevos: `appFactory.js`, `config/manifiestoPiloto.js`, `infra/piloto.example.json`, `services/mongoSessionStore.js`, `services/infraestructuraPilotoService.js`, `services/supervisorTrabajadorGmailService.js`, `services/aplicacionPilotoService.js`, `scripts/iniciarWebPiloto.js`, `scripts/supervisarEnvioGmail.js`, `scripts/verificarInfraGmailPruebas.js`, `tests/infraGmail.test.js`, `tests/soporte/sesionPersistente.child.cjs`, `pruebas-integracion/infraGmail.js`, y los dos documentos de piloto.

Los demas cambios que ya existian en el workspace se conservaron. No se tocaron `.env`, `.env.example`, `.gitignore`, credenciales ni baseline en esta fase.

La [checklist](piloto-gmail-checklist.md) especifica controles, comandos seguros y condiciones pendientes antes de autorizar un piloto.

## Fase actual: correcciones para un unico correo autorizado

Implementada autorizacion persistida de diez minutos, un solo intento, vinculada a administrador/empresa/campana/contacto y huellas de contenido, consentimiento y email. Preparacion y encolado admitidos con web apagada solo para empresas permitidas por despliegue. El trabajador conserva bandera obligatoria, destino dedicado validado, cuotas e identidad OAuth. Consumo atomico junto a reserva, sin reposicion despues de fallos ni resultados inciertos. Exactamente un contacto explicito; todos/etiquetas/multiples contactos quedan rechazados.

El CRUD incorpora consentimiento/revocacion con fuente, fecha, confirmacion, actor/fecha del servidor, huella del email e historial. Cambiar email revoca el consentimiento previo. Se mantiene aislamiento y se agrega CSRF empresarial sin duplicar el CSRF del superadmin. Control optimista evita sobrescribir una revocacion concurrente; si el contacto deja de pertenecer a la empresa se conserva la respuesta 404.

Supervisor usa `envioId` / ID_ENVIO de EnvioGmail. La migracion inicial explicita comprueba identidad dedicada y base vacia, rechaza 27017/27018 y marketingDevRs, crea solo indices faltantes compatibles y no elimina ni sincroniza indices automaticamente.

| Ejecucion final | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Suite habitual completa: todos los archivos tests/**/*.test.js | 593 | 0 | 0 |
| Integracion: enviosGmail, infraGmail, autoservicioEmpresarial, registroEmpresarial, campanasFlujo | 80 | 0 | 0 |
| Total de casos distintos en esta fase | 673 | 0 | 0 |

Las ejecuciones intermedias detectaron cuatro expectativas de cancelacion antes de reserva y dos regresiones HTTP al cambiar concurrentemente la empresa. Se corrigieron sus causas; los contadores finales corresponden a las ejecuciones posteriores, sin sumar repeticiones. `cuotasIADev.js` no forma parte de esta seleccion de integracion porque no esta relacionado con Gmail/contactos.

Todas las escrituras de integracion se limitaron a fixtures propias `ma_tx_test_<32hex>` en 27018, con comprobaciones antes/despues y limpieza por marcador. Gmail y OAuth permanecieron simulados en pruebas; los flags usados por pruebas de transporte antiguas solo existen en el proceso de prueba con transporte sustituido, nunca en un proceso real habilitado para enviar. El lanzador bloqueo archivos de entorno y mostro solo resumen TAP.

Comprobacion final: principal coincide con baseline de proceso/configuracion/datos/indices; marketingDevRs PRIMARY; cero bases temporales restantes. Supervisor de comprobacion real PID 14368, codigo 0, cero reinicios, terminado. Politica del proceso: envio deshabilitado, preparacion deshabilitada, cero empresas autorizadas.

`migrarIndicesPiloto.js --plan` genero 16 colecciones y 27 indices sin conectar. Idempotencia y preflight de conflictos de migracion se probaron con adaptador Mongo simulado; el rechazo de 27018 se comprobo realmente sin DDL. No se ejecuto `--aplicar`, no se creo una nueva instancia y no se considera validada una migracion dedicada real.

### Archivos modificados en esta fase

- Flujo Gmail: `config/enviosGmail.js`, `services/motorEnviosGmailService.js`, `controllers/enviosGmailController.js`, `routes/campanaRoutes.js`, `services/infraestructuraPilotoService.js`, `services/aplicacionPilotoService.js`, `services/supervisorTrabajadorGmailService.js`, `scripts/supervisarEnvioGmail.js`.
- Contactos: `models/Contacto.js`, `controllers/contactoController.js`, `services/elegibilidadEmailService.js`, `appFactory.js`, `views/contactos/_formulario.ejs`, `views/contactos/detalle.ejs`.
- Pruebas: `pruebas-integracion/enviosGmail.js`, `pruebas-integracion/infraGmail.js`, `tests/contactos.http.test.js`, `tests/gmail.envio.http.test.js`, `tests/infraGmail.test.js`, `tests/soporte/sesion.js`.
- Documentacion: `docs/envios-gmail-mvp.md`, `docs/piloto-gmail-checklist.md`, este reporte.

### Archivos nuevos en esta fase

`models/AutorizacionPilotoGmail.js`, `services/autorizacionPilotoGmailService.js`, `services/consentimientoContactoService.js`, `middlewares/csrfContactos.js`, `views/partials/_csrfContactos.ejs`, `services/migracionIndicesPilotoService.js`, `scripts/migrarIndicesPiloto.js`, `tests/pilotoGmail.unit.test.js`, `docs/piloto-gmail-un-correo.md`.

### Riesgos y autorizaciones pendientes

No hay instancia dedicada, HTTPS real ni cuenta OAuth real verificados. Falta autorizar provisionamiento/migracion, secretos por operador, evidencia real de consentimiento y el mensaje/ventana concretos. Se mantiene envio apagado por defecto. El permiso no acredita autenticidad de evidencia externa; el historial de consentimiento esta embebido y se pierde al eliminar el contacto, por lo que produccion requiere politica de archivo/retencion y auditoria. Revocar no retira un POST ya iniciado y una operacion externa no es atomica con MongoDB: resultado incierto siempre exige conciliacion sin reenvio automatico. Las pruebas no acreditan recepcion de correo.

No se tocaron archivos de entorno ni credenciales, no se conectaron cuentas, no hubo correos reales ni cambios en datos empresariales existentes o historial Git. Los cambios previos ajenos a esta fase se conservaron. [Procedimiento y condiciones de autorizacion](piloto-gmail-un-correo.md).
