# Verificacion empresarial automatica

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


La web valida el formulario, CSRF y los limites persistentes de IP/correo. En una
transaccion MongoDB crea SolicitudRegistro y su auditoria. La tarea de correo es
la parte persistente de esa misma solicitud (correoEstado, versionEnvio y lease);
no se duplica en TareaCorreo, usada por el alta administrativa con empresa creada.
La web nunca llama a Gmail ni necesita cargar sus credenciales.

El trabajador residente consulta automaticamente la cola, sin recibir IDs. Reclama
una tarea elegible y reserva las cuotas globales por minuto y dia en una sola
transaccion. Solo despues del commit llama al adaptador Gmail transaccional.
Todas las instancias comparten cuotas en LimiteRegistro; los contadores funcionan
sin depender de que TTL haya eliminado documentos. Valores predeterminados:
10 intentos/minuto y 100/dia, incluidos los intentos fallidos o inciertos.
Los limites existentes de solicitud, reenvio y configuracion siguen aplicando.

Estados: pendiente/pendiente_configuracion -> procesando -> enviada, fallida o
incierta. Solo las pendientes con estado pendiente_correo son elegibles. Cada
reclamacion tiene version y lease de 120 segundos. Al reiniciar, las procesando
caducadas pasan transaccionalmente a incierta con auditoria; nunca se reenvian.
Una entrega incierta conserva su token hasta caducidad: pudo llegar al buzon.
Un error posterior a la llamada o a su persistencia tampoco permite duplicar.
Se guarda el identificador de mensaje aceptado por Gmail y un codigo cerrado de
error; nunca MIME, tokens, URL de verificacion ni mensajes originales del proveedor.
Enviada acredita aceptacion del proveedor, no entrega al buzon.

Los errores definitivos quedan fallidos, sin reintento automatico. La denegacion
OAuth pausa el trabajador (salida 78) y conserva el resto pendiente. Configuracion
o credencial ausente/invalida tambien detienen sin despachar. La recuperacion exige
corregir/autorizar privadamente y reiniciar el servicio; una tarea fallida necesita
reenvio explicito por el flujo existente con sus limites. No editar estados en DB.

## Activacion local futura, requiere autorizacion de envios automaticos

### Estado comprobado del primer recorrido real (18 de octubre de 2026)

El operador confirmo recepcion del primer correo enviado con Gmail API. Las
consultas de solo lectura del piloto confirmaron un intento, identificador de
mensaje de proveedor, eventos correo_emitido/verificada/completada, empresa
verificada, administrador activo y una sesion cifrada autenticada vigente.
correoEstado=cancelada al completar el alta impide despachar otra verificacion;
no significa que el envio previo haya fallado. No quedaron tareas elegibles ni
resultados inciertos en esa consulta. El envio residente automatico sigue
pendiente de su primera prueba externa autorizada.

### Procedimiento para un nuevo registro controlado

1. Mantener la web HTTPS abierta. Si aun no esta iniciada:
   `.\scripts\verificacionLocalPrivada.ps1 -Accion Web`.
2. En otra consola ejecutar
   `.\scripts\verificacionLocalPrivada.ps1 -Accion Cola`.
   Esta accion consulta solo el piloto e imprime IDs, estados, intentos y conteos;
   no carga Gmail, no muestra buzones/tokens ni escribe datos. Debe indicar cero
   elegibles para empezar con una cola vacia. Si aparecen IDs desconocidos,
   detenerse: el residente no tiene una lista de destinatarios autorizados.
3. Autorizar expresamente la ventana de automatizacion, el nuevo buzon propio y
   las cuotas. La autorizacion del primer correo dirigido no habilita este modo.
4. Solo despues, arrancar Trabajador con AutorizarEnviosAutomaticos como se indica
   debajo. Mantener abiertas ambas consolas. No ejecutar EnviarUnCorreo.
5. Registrar una unica empresa ficticia nueva desde https://localhost:3100/registro
   usando otro buzon o alias propio que aun no este registrado. La respuesta 202
   no afirma entrega. El trabajador debe recoger su solicitud automaticamente.
6. Consultar Cola/Estado, comprobar un intento y estado enviada, y confirmar
   recepcion manual en entrada/spam. Completar enlace, administrador y login en
   esta misma computadora. No compartir la URL con token ni la contrasena.
7. Para limitar la ventana, detener el trabajador con Ctrl+C al terminar. Comprobar
   con Cola que no queda procesando; una interrupcion forzada puede necesitar
   esperar 120 segundos y recuperacion a incierta, nunca reenvio automatico.
   Si hay errores o incertidumbre, detener y revisar antes de cualquier reenvio.

El residente no impone un maximo total de un correo: durante la ventana procesa
todas las elegibles de este piloto y sus nuevas solicitudes. Para una prueba
autorizada exclusivamente por ID debe usarse el modo dirigido, no este modo.

### Arranque junto con la aplicacion

Los dos comandos (Web y Trabajador) son los puntos de entrada del mismo piloto,
con procesos y credenciales separados. Web debe estar lista antes de Trabajador:
este valida HTTPS autentico antes de reclamar tareas. Nunca activar mediante
`npm start`/`npm run dev` ni configurar el correo en el servidor habitual de 3000.
El arranque conjunto autorizado debe declarar ambos procesos en el gestor de
servicios, con dependencia de trabajador respecto a web y MongoDB; conservar
control de parada por separado y sin reiniciar errores de autorizacion.
No se ha instalado un servicio, tarea programada o arranque automatico en Windows.
Las dos consolas bastan para la prueba local; el registro no necesita comandos
por empresa. La prueba real de arranque bajo un gestor queda pendiente de su
configuracion autorizada, sin confundirla con las pruebas del supervisor.

No se ha activado. Primero aprobar buzon(es), alcance y limites: este modo procesa
**todas** las solicitudes elegibles del piloto y no limita el ensayo a un correo.
Mantener la web HTTPS local funcionando y ejecutar una sola vez por arranque:

```powershell
.\scripts\verificacionLocalPrivada.ps1 -Accion Trabajador -AutorizarEnviosAutomaticos
```

El asistente verifica ACL, DPAPI, token cifrado, certificado, origen real, manifiesto,
destino e indices. Lee secretos existentes solo en memoria, no cambia archivos ni
credenciales. Fija origen https://localhost:3100 y activa transporte/trabajador solo
en su proceso y descendientes. No activa Gmail empresarial ni Gemini. Nuevos
registros y reenvios elegibles se atienden automaticamente, sin EnviarUnCorreo.
El enlace local se debe abrir en el mismo equipo, con HTTPS activo.

Ctrl+C solicita parada ordenada por IPC. El hijo deja de reclamar, completa la
unidad en curso y cierra MongoDB. Tras 20 segundos, un proceso colgado puede ser
terminado; su lease impide reenviar la entrega incierta. Si muere el supervisor,
la desconexion IPC tambien solicita detener el hijo. Los fallos inesperados se
reinician hasta cinco veces con esperas 1, 2, 4, 8 y 16 segundos; una ejecucion
estable de cinco minutos reinicia el presupuesto. Los errores de configuracion o
autorizacion no se reinician automaticamente. No ejecutar ademas el consumidor
manual: conservarlo solo para diagnosticos/pruebas expresamente autorizadas.

## Despliegue autorizado

El proceso persistente de la web y el del supervisor son servicios separados.
El supervisor operativo se inicia con:

```text
node scripts/supervisarVerificacion.js --residente --autorizar-trabajador
```

Recibe un entorno protegido del gestor de servicios: NODE_ENV=production,
TRANSACTIONAL_EMAIL_ENABLED=true y TRANSACTIONAL_WORKER_ENABLED=true, ademas de
MONGODB_URI, configuracion OAuth/AES/archivo cifrado independientes de empresas y
TRANSACTIONAL_PUBLIC_ORIGIN HTTPS correspondiente al despliegue autorizado.
No pasar secretos como argumentos ni colocarlos en la definicion publica del
servicio. PILOT_LOCAL_HTTPS pertenece exclusivamente al ensayo local; no usar su
certificado ni localhost como configuracion de una web productiva.

El arranque falla cerrado si el destino/replica set no coincide con el manifiesto
aprobado o faltan indices. No hace DDL ni migra datos existentes. No hay nuevos
indices requeridos por esta mejora. Provisionar previamente sesiones persistentes,
TLS, manifiesto y permisos operativos; no sustituirlos por nodemon/MemoryStore.

Para sobrevivir al reinicio del equipo, registrar el supervisor en el gestor de
servicios del despliegue, con cuenta de privilegios minimos y su almacen privado.
En el piloto Windows puede usarse una tarea del Programador al iniciar sesion,
ejecutada como el mismo usuario propietario de DPAPI, con directorio del proyecto,
PowerShell RemoteSigned y el comando privado anterior. Configurar una sola instancia
y sin reinicio indiscriminado tras salida por autorizacion. No se ha instalado ni
activado ninguna tarea/servicio en esta implementacion. Reiniciar el supervisor
retoma las pendientes de MongoDB; no recrear la base.

Variables opcionales: TRANSACTIONAL_WORKER_POLL_MS (1..60000; defecto 2000),
TRANSACTIONAL_SENDS_PER_MINUTE (1..100; defecto 10), TRANSACTIONAL_SENDS_PER_DAY
(1..1000; defecto 100). Mantener los mismos limites en todas las instancias.
Los maximos son topes de seguridad del MVP, no cuotas garantizadas de Google.

## Validacion local

```text
node --test
node --test pruebas-integracion/verificacionAutomatica.js
node --test pruebas-integracion/autoservicioEmpresarial.js
```

Pruebas con proveedor simulado y persistencia real solo en fixtures nuevas
ma_tx_test_* de marketingDevRs:27018. Se verifica ausencia previa, marcador de
propiedad e identidad antes de eliminarlas. No se cargan credenciales Google.
Incluyen rollback, concurrencia, cuotas, reinicio de proceso hijo real, errores,
token de un uso, administrador, login HTTP y separacion entre empresas. No prueban
entrega externa. El primer envio dirigido ya fue recibido y completo el alta;
el envio automatico residente con proveedor real aun no se ha activado.
