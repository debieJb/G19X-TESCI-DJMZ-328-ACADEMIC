# Piloto Gmail: un correo autorizado

El procedimiento vigente para el despacho manual de Nickki Velas en el entorno local existente está en [despacho manual supervisado](gmail-manual-nickki-2026-10-18.md). Las restricciones de infraestructura dedicada descritas abajo siguen aplicando al supervisor y al perfil de piloto anterior; ese supervisor no es necesario para el nuevo despacho desde el navegador.

Actualizacion de infraestructura al cierre: ya existe una instancia nueva y exclusiva en 127.0.0.1:27019, directorio C:\Users\jocam\Documents\marketing-automation-pilot-mongo-rs\data, replica set marketingPilotLocalRs con unico miembro 127.0.0.1:27019, PRIMARY confirmado y solo bases de sistema. Se autorizo su creacion e inicializacion, no el envio de un correo. No volver a crear el directorio ni ejecutar replSetInitiate. Migracion, HTTPS, OAuth y piloto real siguen pendientes de autorizacion y validacion.

Estado: implementado y probado con datos sinteticos; envio real bloqueado por defecto. Ninguna autorizacion real se creo en esta tarea. No se modificaron archivos de entorno, cuentas, tokens, datos existentes ni configuracion MongoDB.

## Preparacion y envio son fases distintas

La web `iniciarWebPiloto.js` conserva `asegurarEnvioApagado()`. Una lista valida y no vacia de `GMAIL_CAMPAIGNS_PILOT_COMPANIES` permite solamente preparar el piloto; no habilita transporte. Sin lista, todo se deniega. No hay bandera alternativa que permita enviar saltandose `GMAIL_CAMPAIGNS_ENABLED`.

Con destino dedicado, indices y sesiones persistentes verificados, un administrador empresarial activo y con email verificado puede:

1. Registrar consentimiento verificable del contacto mediante el CRUD.
2. Preparar una campana inmediata de texto con exactamente un contacto seleccionado. Se rechazan `todos`, `etiquetas`, listas vacias, multiples contactos, duplicados y etiquetas residuales.
3. POST `/campanas/:id/gmail/piloto/autorizar` con CSRF y `confirmacion=AUTORIZAR_UN_ENVIO`. No acepta empresa, actor, correo, duracion ni configuracion desde el cuerpo.
4. POST `/campanas/:id/gmail/confirmar` con CSRF, `confirmacion=ENVIAR` y una clave de idempotencia de 16-128 caracteres URL-safe. Encola exclusivamente un destinatario y no llama Gmail.

Autorizar y encolar exigen ademas la marca interna de arranque que solo establece `crearAplicacionPiloto` despues de verificar destino, indices y almacen persistente. El arranque habitual de desarrollo con MemoryStore no puede realizar esas operaciones. Esa marca no es una opcion HTTP ni de entorno.

La autorizacion persiste empresa, campana, contacto, administrador, huellas de contenido/email/consentimiento, caducidad fija de diez minutos y fechas de consumo/revocacion. No contiene credenciales ni es un token portador. Una autorizacion por empresa/campana impide renovarla o emitir otra tras consumirla, revocarla o caducar. Repetir una solicitud valida devuelve la misma sin extender el plazo. Una carrera de solicitudes iniciales puede devolver conflicto; no genera dos permisos.

Transiciones: `autorizada -> consumida` o `autorizada/consumida -> revocada`. Caducidad se aplica por fecha incluso sin limpieza TTL. Los registros se conservan para auditoria. Al reservar el envio se consume el permiso en la misma transaccion que las cuotas y la reserva. Fallos posteriores, incluido OAuth, cancelacion o resultado incierto, no lo restituyen. Una reserva que no llega a confirmarse por cuota, velocidad o conflicto transaccional no consume el permiso.

La identidad empresarial, estado y permisos se resuelven desde documentos persistidos. El operador no puede emitir ni utilizar la autorizacion de un administrador: el piloto requiere administrador empresarial en la revalidacion. La autorizacion fija el contenido y el consentimiento; un cambio invalida el envio. Se revalida antes y despues de renovar OAuth, incluyendo permiso consumido para ese envio y caducidad.

POST `/campanas/:id/gmail/piloto/revocar` exige sesion, permisos propios y CSRF, incluso con bandera apagada. Puede revocar mientras se prepara OAuth. No puede retirar un correo que ya fue presentado a Google. Existe una ventana inevitable entre la ultima comprobacion y el POST externo; no se mantiene una transaccion MongoDB durante la red.

## Consentimiento en contactos

Los formularios nuevo/editar ofrecen conservar, otorgar o revocar. Otorgar requiere email valido, fecha ISO con zona horaria no futura, referencia de evidencia y confirmacion expresa. Revocar requiere motivo/referencia y confirmacion; la fecha de revocacion se fija en el servidor. El usuario/fecha de registro y la huella de email se fijan en el servidor, nunca desde el cuerpo HTTP. El registro y su historial se guardan junto al contacto con control optimista de version; una escritura atrasada no puede sobrescribir una revocacion confirmada.

Todas las escrituras de contactos empresariales tienen CSRF; superadmin conserva su proteccion CSRF existente sin duplicar tokens de formulario. Los filtros de empresa, permisos y `$where` se mantienen. Cambiar email sin registrar nuevo consentimiento revoca el previo automaticamente. El piloto exige evidencia con autor, fecha de registro y huella del email actual: no basta habilitar el canal ni un registro historico incompleto.

La referencia permite auditar el registro, pero el software no demuestra que un acta externa sea autentica: debe revisarla un responsable autorizado. No pegar enlaces privados, tokens ni credenciales. El historial esta embebido en el contacto; eliminarlo elimina tambien su historial. Antes de produccion hace falta definir conservacion/archivo y permisos de auditoria; no hay registro externo inmutable en esta fase.

## Migracion de indices de destino nuevo

`scripts/migrarIndicesPiloto.js --plan` genera el plan sin conectar ni hacer DDL:

```powershell
node scripts/migrarIndicesPiloto.js --plan
```

La aplicacion futura exige `--aplicar --confirmar-base NOMBRE_APROBADO`, manifiesto fijo `infra/piloto.aprobado.json` aprobado e inyeccion privada de URI en el proceso. No se ejecuto en esta tarea. No cargar archivos de entorno ni proporcionar URI/credenciales como argumentos.

El script rechaza semillas sin puerto explicito, SRV, puertos 27017/27018 y semillas distintas de los miembros del manifiesto, antes de conectar. El servicio vuelve a comprobar base, replica set dedicado, PRIMARY, miembro actual y puerto efectivo de `getCmdLineOpts`. Rechaza `marketingDevRs`, bases temporales, colecciones desconocidas, datos de aplicacion existentes e indices incompatibles. Requiere privilegios para consultar opciones del proceso; sin ellos falla cerrado.

Antes del primer DDL inspecciona todo el plan. Solo crea colecciones/indices faltantes compatibles y registra `indices-piloto-v1` con majority. No borra indices, no usa `syncIndexes`, no copia datos ni inicializa/reconfigura servidores. Es idempotente mientras la base permanezca vacia de datos de aplicacion; despues de cargar el piloto se usa `revisarIndices`, no esta migracion inicial. Un fallo DDL parcial no es transaccional: detenerse, inspeccionar y volver a ejecutar solo sobre la misma base nueva aprobada.

La idempotencia y los conflictos del algoritmo se probaron con Mongo simulado. En Mongo real de 27018 solo se probo su rechazo antes de DDL. Los indices reales de pruebas se crean por el provisionador de fixtures existente; eso no acredita haber ejecutado la migracion sobre un destino dedicado.

## Trabajador y autorizaciones pendientes

`crearSupervisor().ejecutar({ comprobar:false, envioId: ID_ENVIO })` y `supervisarEnvioGmail.js ID_ENVIO` reciben el `_id` de **EnvioGmail**, no el `_id` de EjecucionGmail. El GET `/campanas/:id/gmail/ejecucion` permite identificar el unico documento propio. El trabajador solo procesa ese destinatario, nunca un lote.

La comprobacion segura sigue siendo:

```powershell
node scripts/supervisarEnvioGmail.js --comprobar
node scripts/verificarInfraGmailPruebas.js
```

El modo real requiere una tarea posterior que autorice expresamente: instancia/base/directorio dedicados nuevos; migracion; secretos de sesion/cifrado inyectados fuera del repositorio; HTTPS/proxy; cuentas de prueba y OAuth valido; empresa/consentimiento; contenido, destinatario y ventana del unico envio. No usar 27017 ni reutilizar `marketingDevRs` como produccion. Un replica set local independiente de un miembro puede servir para un ensayo atendido, sin alta disponibilidad; no sustituye infraestructura productiva.

Solo despues de esas aprobaciones se habilitaria temporalmente el proceso trabajador para esa empresa. La web permanece apagada y la configuracion predeterminada no cambia. No se proveen comandos de activacion en este documento. Cerrar la ventana terminando el trabajador habilitado y comprobando la politica; cambiar el entorno de otro proceso no deshabilita retroactivamente uno ya iniciado.

Antes de arrancar verificar `total=1`, un unico envio pendiente y el permiso vigente. Supervisor: un proceso, plazo, cero reinicios. Timeout/fallo/estado `incierto` exige conciliacion; no reintentar automaticamente, regenerar permiso, resetear estados ni crear otra campana para sortear el resultado.

`aceptado` y Gmail ID significan aceptacion API. La recepcion la confirma el propietario de la cuenta destinataria revisando entrada/spam y el identificador del ensayo. No ampliar scopes para leer el buzon si basta confirmacion manual. Registrar aceptacion y recepcion por separado y comprobar al terminar que el principal conserva su baseline.

Produccion requiere ademas backup/restauracion y disponibilidad, TLS/autenticacion de MongoDB segun red, auditoria/retencion, revision del almacen de sesiones y rotacion de claves, servicio residente supervisado, monitorizacion sin secretos y cumplimiento OAuth aplicable. Ninguno se declara resuelto por las pruebas simuladas del piloto.
