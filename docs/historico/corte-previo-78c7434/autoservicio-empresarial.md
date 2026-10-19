> **Antecedente histórico.** Texto del corte funcional `78c7434`, conservado para trazabilidad. Sus afirmaciones de estado y pendientes no describen la entrega documental actual. Consulte el [índice vigente](../../entrega/indice-entrega.md). Las rutas de enlaces se adaptaron a esta ubicación.

# Autoservicio empresarial: primera fase

> Actualización: existe un adaptador Gmail transaccional independiente y un trabajador
> supervisado explícito, ambos deshabilitados hasta autorización. Ver
> [configuración y prueba real pendiente](../../gmail-transaccional.md). Las menciones
> inferiores a ausencia de adaptador describen la fase original; el proveedor
> predeterminado de las rutas sigue apagado y nunca envía desde HTTP.

Implementación pública en `/registro`. El envío real permanece deshabilitado por
defecto: no existe un proveedor configurado, un adaptador real ni un proceso de
correo activado. No se leen secretos desde este módulo, no se usa Gmail empresarial
y no se cambia el bloqueo de campañas. Tener páginas accesibles no acredita que un
usuario real pueda recibir un enlace.

## Estados e invariantes

| Estado de SolicitudRegistro | Efecto permitido |
| --- | --- |
| pendiente_correo | Reservar solicitud y preparar correo; no existe empresa ni usuario nuevo. |
| correo_verificado | Configurar administrador desde la sesión que consumió el enlace, durante 20 minutos. |
| completada | Empresa verificada y usuario activo creados en una misma transacción, con bcrypt y fecha de verificación. |

El enlace tiene 32 bytes aleatorios, dura 30 minutos y solo se persiste su SHA-256.
Su generación ocurre al tomar un trabajo, no al solicitar el registro. La bandeja
es parte de SolicitudRegistro: no contiene contraseña, token recuperable o enlace.
No utiliza el modelo legado TareaCorreo, que exige usuario/actor antes de verificar.

GET del enlace guarda solo su hash en la sesión y redirige a una URL limpia; no
consume ni confirma. POST con CSRF consume el hash atómicamente, lo elimina del
documento y vincula la configuración al hash de una sesión regenerada. La sesión
solo conserva el ID de la solicitud. No se acepta empresa, usuario, correo de acceso,
estado ni rol desde el formulario final: correo y pertenencia se fijan en servidor.
El usuario puede confirmar/corregir el nombre de su empresa después de verificar.

La creación final marca la solicitud y crea Empresa/Usuario en la misma transacción.
Un fallo revierte todo, incluida la auditoría. La contraseña se valida con la política
existente y se cifra mediante el middleware bcrypt de Usuario. Repeticiones idénticas
de configuración en la misma sesión y dentro del plazo son idempotentes; cambios
producen conflicto. El controlador regenera la sesión al terminar y NO inicia sesión
automáticamente. El login existente exige estado activo y compara bcrypt.

Un reenvío no cambia cuentas existentes. Si la configuración caduca, puede volver a
solicitarse verificación; se elimina el vínculo de la sesión anterior. Los enlaces
anteriores se invalidan al aceptar un reenvío. No hay recuperación de contraseña ni
migración de cuentas históricas en esta fase. Si se pierde la sesión de configuración,
hay que esperar a que caduque ese permiso y pedir un enlace nuevo.

## Compatibilidad y transacciones

`registroEmpresarialService.registrar` conserva su contrato de superadministrador:
crea usuario pendiente y tarea sin enviarla. No se expone como ruta pública ni se
emplea para simular una contraseña previa a la verificación. Ambos contratos
comparten validación de topología, política de contraseña, opciones de transacción
y creación de empresa/administrador. El autoservicio llama esa creación únicamente
después de acreditar correo. No se ha ampliado la autorización del servicio legado.

Toda operación utiliza modelos ligados a una conexión explícita. Las transacciones
exigen PRIMARY, sesiones y replica set/mongos compatibles, con snapshot/majority.
Un standalone falla antes de escribir. El controlador utiliza la conexión de la
aplicación; no cambia su destino ni conecta automáticamente al replica set de pruebas.

## HTTP, privacidad y límites

- GET/POST `/registro`: solicitar sin contraseña; clave de idempotencia aleatoria de
  sesión, huella del ámbito y del contenido. El índice de correo evita reservas duplicadas.
- GET/POST `/registro/reenviar`: misma respuesta pública exista o no una solicitud.
- GET/POST `/registro/verificar`: limpiar URL y confirmar explícitamente con CSRF.
- GET/POST `/registro/administrador`: configurar desde la sesión verificada.

Todos los POST requieren CSRF sincronizado, incluidos reenvío y consumo. Las páginas
usan EJS escapado, etiquetas, navegación por teclado, idioma y avisos accesibles,
no-store, no-referrer y CSP sin scripts. Los errores no devuelven valores de contraseña
ni correos. La respuesta 202 es igual para cuentas existentes, solicitudes nuevas,
duplicados y conflictos idempotentes. No garantiza entrega; indica que, si procede,
se enviará cuando haya servicio. No hay envío síncrono que revele existencia por
latencia del proveedor. Solicitud y reenvío tienen un mínimo de 250 ms de respuesta;
no se afirma tiempo constante ante fallos o saturación de infraestructura.

Límites compartidos persistentes: 10 solicitudes o reenvíos por IP/15 min (por acción),
30 verificaciones/IP/15 min, 10 configuraciones/IP/15 min y 5 solicitudes/reenvíos por
correo/hora. Los identificadores de los contadores se guardan como hashes; no IPs
ni correos en claro. La ventana forma parte de la clave: TTL solo limpia, no decide
vigencia. La bandeja admite como máximo 5 solicitudes de envío/24 h y una por minuto.
No hay bypass por sesiones nuevas. Trust proxy debe corresponder a la infraestructura;
por defecto Express no confía en cabeceras remitidas por clientes.

AuditoriaRegistro admite únicamente referencia de solicitud, evento enumerado y fecha.
No recibe cuerpos libres, direcciones, contraseñas, tokens, enlaces o errores externos.
Eventos: solicitud, reenvío, aceptación de correo, fallo, entrega incierta, verificación
y finalización. No hay logs de payloads. El proxy/APM también debe omitir o redactar
la query inicial de verificación; las cabeceras de respuesta no controlan esos logs.

## Correo transaccional y recuperación

`crearCorreoTransaccional()` devuelve `disponible: false`. No existe variable de
entorno que active el envío. Un futuro despliegue debe seleccionar y autorizar un
proveedor, inyectar su adaptador `enviar(mensaje, { signal })`, remitente aprobado
y origen público HTTPS fijo; nunca derivar enlaces de Host o datos del cliente.
El adaptador real NO está implementado en esta fase. La opción `simulado` se acepta
solo en un proceso del ejecutor de pruebas Node y no se utiliza por las rutas.

`crearServicio({ conexion, correo }).despachar()` procesa como máximo una solicitud
pendiente. No es una ruta HTTP. Es la unidad que un futuro trabajador supervisado
deberá llamar: ningún trabajador se inicia al importar módulos o arrancar Express.
Puede recoger pendientes de configuración después de autorizar un proveedor.
Antes de la entrega reclama atómicamente el trabajo y guarda hash, vencimiento y
versión. La llamada externa ocurre FUERA de la transacción para evitar duplicarla
cuando MongoDB reintenta callbacks. Dos consumidores no toman la misma versión.

Estados de correo: pendiente_configuracion → pendiente/procesando → enviada,
fallida o incierta; completada cancela la bandeja. `enviada` solo significa que el
adaptador aceptó la petición, no entrega al buzón. El timeout de 10 s (configurable
hasta 30 s) aborta y clasifica como incierta. El adaptador debe respetar AbortSignal.
Si ignora la cancelación, puede completar tarde: no hay garantía de exactamente una
entrega. No se reintentan automáticamente estados fallida/incierta/procesando.
Un rechazo explícitamente definitivo invalida el token; una entrega incierta conserva
el enlace por si fue recibido. El interesado puede pedir reenvío con los límites.

Si el proceso cae, un trabajo procesando queda reservado dos minutos. Un reenvío
explícito posterior puede recuperarlo; nunca se asume que no se entregó. La siguiente
versión invalida el enlace previo. Un error al guardar la respuesta después de enviar
también queda sujeto a esta recuperación. No reparar ni marcar como enviado a ciegas.

## Provisionamiento pendiente

No se crean colecciones o índices en peticiones. Los modelos nuevos tienen
autoCreate/autoIndex deshabilitados; el servicio verifica sus definiciones antes de
escribir. Requiere, además de Empresa/Usuario y el índice único Usuario.email:

- SolicitudRegistro: únicos correo e idempotenciaHash; tokenHash único parcial para
  strings; índice de correoEstado/createdAt.
- LimiteRegistro: `_id` único y TTL expiraEn con expireAfterSeconds 0.
- AuditoriaRegistro: solicitud/fecha.

La prueba aprovisiona esos índices solo en bases temporales propias. No se ejecutó
ninguna migración en 27017 ni se modificó .env. Antes de usar el flujo real hay que
aprobar destino transaccional, permisos, provisionamiento, sesiones persistentes,
HTTPS y política de retención de solicitudes/auditoría. No se programa borrado de
datos existentes. No apuntar la aplicación al almacén de pruebas como solución.

## Comprobación

```powershell
node --test tests/autoservicio.unit.test.js tests/autoservicio.http.test.js
node --test pruebas-integracion/autoservicioEmpresarial.js pruebas-integracion/registroEmpresarial.js
npm.cmd test
```

La integración requiere marketingDevRs PRIMARY en 127.0.0.1:27018, directorio y miembro
esperados y principal coincidente con la referencia autorizada. Solo crea bases
ma_tx_test_<UUID>; antes de eliminarlas verifica identidad, nombre y marca de propiedad.
Compara el principal antes/después. El transporte simulado conserva mensajes solo en
memoria. Las pruebas cubren caducidad, reutilización, concurrencia, aislamiento,
idempotencia, rollback, límites, recuperación y recorrido HTTP hasta login.

Para un piloto real faltan proveedor/remitente/origen autorizados, adaptador y trabajador
supervisado, infraestructura transaccional provisionada y validación de entregabilidad.
Autorizar aparte un envío a buzón controlado. Nunca levantar bloqueos de campañas
para probar verificación. Esta implementación no acredita entrega real.

Referencias: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
y https://mongoosejs.com/docs/transactions.html.

## Evidencia de esta implementación

- Suite habitual: 558 aprobadas, 0 fallidas, 0 omitidas.
- Integración explícita: 18 de autoservicio y 14 del contrato anterior aprobadas;
  0 fallidas y 0 omitidas. Incluye HTTP hasta login con MongoDB temporal y correo simulado.
- Después: principal coincidente con la referencia autorizada en proceso,
  configuración, datos e índices; marketingDevRs PRIMARY y ninguna base temporal restante.
- Sintaxis y comprobación de whitespace sin errores. Sin envío real, migraciones
  sobre datos existentes, configuración de proveedor ni cambios a .env o Git.
