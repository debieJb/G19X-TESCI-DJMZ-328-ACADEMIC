# Preparacion verificable del piloto Gmail

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Actualizacion de cierre: la infraestructura local 127.0.0.1:27019 fue autorizada e inicializada con una unica llamada confirmada. marketingPilotLocalRs tiene un miembro 127.0.0.1:27019 y esta PRIMARY, PID observado 22560. Solo existen admin, config y local; no se aplicaron indices de aplicacion. Esto no autoriza el piloto de correo ni acredita produccion. Ver [cierre tecnico](cierre-tecnico-2026-10-15.md).

El piloto real NO esta autorizado ni listo. Esta fase prepara y prueba infraestructura con datos sinteticos. No modifica flags, cuentas, tokens, MongoDB principal ni datos empresariales existentes. `marketingDevRs` nunca es un destino de piloto.

Para el flujo directo se necesitan web con HTTPS, MongoDB transaccional dedicado, trabajador supervisado y conectividad TLS saliente a OAuth/Gmail API. n8n y el Gmail del correo transaccional de registro no sustituyen la autorizacion OAuth de cada empresa ni son requisitos del transporte directo de campanas. Las cuotas locales no certifican disponibilidad de cuota en Google.

## Evidencia y checklist

| Control | Evidencia disponible | Falta para piloto real |
|---|---|---|
| Envio bloqueado | Politica deshabilitada; supervisor y preparacion lo exigen. Pruebas nuevas no activan flags. | Autorizacion posterior y lista explicita de empresas, fuera de esta fase. |
| Supervisor | Proceso Node real con `--comprobar`, plazo, cancelacion, exclusividad por supervisor y cero reinicios. | Servicio del SO, cuenta restringida, vigilancia, arranque tras reinicio y parada durante una llamada real. |
| Persistencia transaccional | PRIMARY y rollback real en base temporal de 27018. | Replica set independiente, respaldo/restauracion, autenticacion, TLS, disponibilidad y permisos minimos. |
| Indices | Indices declarados de 15 modelos mas TTL de sesiones creados y verificados en fixture vacia. Arranques no hacen DDL. | Migracion explicita implementada y probada con DDL simulado; falta aplicarla y verificarla en destino dedicado aprobado. No usar `syncIndexes` ni eliminar indices a ciegas. |
| Sesiones persistentes | MongoSessionStore cifrado AES-GCM; SID mediante hash; lectura entre aplicaciones y tras dos procesos nuevos; expiracion y revocacion verificadas. | Provisionar claves independientes y estables mediante gestor de secretos, restringir acceso, revisar rotacion y auditar este almacen nuevo. |
| Cookies/proxy | Secure, HttpOnly y SameSite=Lax comprobados con HTTPS simulado; sin cookie segura por HTTP. Proxy requiere IP/CIDR explicitos. | HTTPS real de extremo a extremo, certificado, cabeceras saneadas por proxy, bloqueo de acceso directo y callback OAuth real. No confiar en cualquier proxy. |
| Destino | Manifiesto obligatorio, nombres/miembros aprobados, transacciones e indices; rechazo del replica set de desarrollo y destinos locales 27017/27018. | Manifiesto real aprobado y verificacion contra despliegue; no basta cambiar nombres para aprobar infraestructura. |
| OAuth empresarial | Regresiones simuladas del flujo OAuth, identidad, firma y transporte aprobadas; se conserva resolucion desde empresa persistida. | Cliente OAuth autorizado, redirect HTTPS exacto, consentimiento y scopes reales; identidad remitente/cuenta coincidente, renovacion y revocacion reales. No inspeccionados tokens ni credenciales. |
| Destinatarios y ejecuciones | Se preserva el motor existente: consentimiento documentado, aislamiento, permisos, revalidacion, cuotas y estados persistidos por destinatario. | Revisar evidencia de consentimiento del grupo piloto, limites autorizados, procedimiento ante resultados inciertos y acceso de operadores. No se consultaron empresas reales. |
| Aceptacion/entrega | Ninguna llamada Gmail en esta fase. | Prueba autorizada posterior con destinatarios consentidos. ID/aceptacion de Gmail API no prueba entrega al buzon. |

## Comprobaciones seguras realizadas

Desde la raiz, sin cargar archivos de entorno:

```powershell
node scripts/verificarInfraGmailPruebas.js
node scripts/supervisarEnvioGmail.js --comprobar
node --test tests/infraGmail.test.js pruebas-integracion/infraGmail.js tests/session.config.test.js tests/autoservicio.http.test.js
```

El verificador solo consulta identidad, baseline y numero de bases temporales; no consulta empresas, sesiones ni conexiones OAuth. Las pruebas crean exclusivamente `ma_tx_test_<32hex>` con marcador aleatorio propio en 27018. Antes de aprovisionar verifican proceso, directorio, replica set, PRIMARY, baseline y marcador; rechazan datos existentes o colecciones desconocidas. La limpieza exige otra comprobacion de identidad y marcador antes de eliminar exclusivamente su base temporal. Se vuelve a comprobar el principal al terminar.

`planIndices(conexion)` produce el plan de indices; `revisarIndices(conexion)` solo inspecciona metadatos. `provisionarPruebas` hace DDL exclusivamente en fixtures vacias protegidas; la migracion dedicada es explicita y nunca se ejecuta al arrancar la web. Consultar `piloto-gmail-un-correo.md`.

## Arranque futuro de web y trabajador

1. Aprobar infraestructura dedicada; no reutilizar 27017 ni `marketingDevRs`. Revisar seguridad y acceso del despliegue antes de conectarlo.
2. Crear, tras revision independiente, `infra/piloto.aprobado.json` siguiendo el esquema de `infra/piloto.example.json`. El ejemplo tiene `aprobado:false` y no arranca. El archivo contiene identidad de infraestructura, nunca credenciales. `trustProxy` debe ser una lista explicita; lista vacia implica no confiar en cabeceras reenviadas.
3. Provisionar indices mediante migracion aprobada. Mantener `autoCreate:false` y `autoIndex:false`. Configurar URI, SESSION_SECRET y SESSION_STORE_KEY mediante inyeccion del entorno de ejecucion, nunca argumentos, archivos versionados ni logs. La clave de almacen es independiente de la firma de cookies y de OAuth; 32 bytes aleatorios codificados en hexadecimal. No generar ni copiar claves en esta tarea.
4. El punto de entrada futuro es `node scripts/iniciarWebPiloto.js`. Solo arranca con envio apagado, destino e indices validados, almacen persistente y secreto de sesion adecuado. Usa conexion global validada porque los modelos actuales dependen de ella; no aceptar una conexion diferente que haga que las rutas consulten otro destino. Escucha solo loopback; necesita proxy HTTPS verificado. No se ejecuto este arranque contra un destino real.
5. `node scripts/supervisarEnvioGmail.js --comprobar` prueba arranque y terminacion sin DB ni Gmail. No es un servicio residente del SO ni prueba OAuth. El supervisor lanza una unidad y nunca la reinicia. Si muere o vence el plazo, conciliar estados persistidos antes de cualquier accion. La exclusividad entre procesos depende de reservas y controles transaccionales del motor, no del bloqueo en memoria del supervisor.
6. El modo de trabajo real requiere ademas bandera y empresas autorizadas del motor existente, ID_ENVIO (documento EnvioGmail de un destinatario, no EjecucionGmail), autorizacion temporal consumible, manifiesto y destino comprobados. Esta fase no habilita ese modo. Los cambios de flags y el piloto requieren una tarea y autorizacion posteriores. La web permanece con envio apagado: una lista empresarial valida habilita solo preparacion. El administrador autoriza un contacto y encola; un trabajador separado requiere ademas la bandera de envio. No es necesario habilitar envio en la web.

## Operacion pendiente

- [ ] Administrador de infraestructura aprueba destino dedicado, usuarios minimos, TLS, backup, restauracion y limites de conexiones.
- [ ] Aprobar migracion de indices y retencion de auditoria/ejecuciones/sesiones; TTL es limpieza eventual, la aplicacion comprueba expiracion antes de leer.
- [ ] Auditar el nuevo almacen, proteger y ensayar rotacion de claves. La perdida de clave invalida sesiones. Las tombstones evitan escrituras atrasadas durante su retencion; limitar duracion de peticiones por debajo de esa retencion.
- [ ] Configurar servicio supervisado del SO, cuenta restringida, monitorizacion sin secretos y procedimiento de conciliacion. Una terminacion forzada puede dejar resultado incierto; no reintentar automaticamente.
- [ ] Verificar HTTPS real, proxy, cookies y login tras reinicio; actualmente solo HTTP local con cabecera HTTPS simulada.
- [ ] Revisar cliente OAuth y cuentas autorizadas por empresa, scopes y remitente; no validado contra Google en esta fase.
- [ ] Aprobar cohorte pequena, consentimiento documentado, cuotas de Google y limites de aplicacion, alertas y parada de emergencia.
- [ ] Autorizar explicitamente una prueba real posterior; registrar aceptacion y resultado observable por separado.

Referencias: [Express session](https://expressjs.com/en/resources/middleware/session.html), [indices TTL de MongoDB](https://www.mongodb.com/docs/manual/core/index-ttl/).

La implementacion actual de autorizacion de diez minutos, consentimiento y migracion se detalla en [Piloto de un correo](piloto-gmail-un-correo.md).
