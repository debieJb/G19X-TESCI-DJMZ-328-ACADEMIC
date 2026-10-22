# Una verificación empresarial real, solo en este equipo

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Este procedimiento no despliega la web públicamente. No se ha autorizado el envío
por preparar el origen. Gmail y Gemini permanecen apagados hasta el paso explícito
de un único correo. La cuenta transaccional no se mezcla con Gmail empresarial.

## Origen real y controles conservados

El enlace se construye en correoTransaccionalService con el origen configurado y
la ruta /registro/verificar, añadiendo el token aleatorio de una sola utilización.
El consumidor guarda únicamente su hash, exige transacciones y envía fuera de la
transacción. Abrir el enlace no consume el token: confirmar requiere POST y CSRF.
Se conservan 30 minutos de enlace, 20 minutos de configuración y sesión regenerada.

El transporte real conserva su requisito HTTPS; no hay excepción HTTP de desarrollo.
El origen propuesto es **https://localhost:3100**, respaldado por un certificado
real de desarrollo y un servidor HTTPS de Node, no una URL inventada.

El servidor escucha solo 127.0.0.1, exige Host localhost:3100 y usa el manifiesto
existente de marketing_piloto_mvp en marketingPilotLocalRs:27019. Se mantienen
sesiones Mongo cifradas, cookie Secure/HttpOnly/SameSite=Lax, entorno de producción
de la aplicación y trustProxy vacío. No se confía en cabeceras HTTPS simuladas.
La cookie local se llama marketing.piloto.sid para no interferir con marketing.sid
del servidor habitual: los navegadores no separan cookies por puerto.

No se abren puertos del router, túneles ni accesos desde otra computadora. El enlace
solo funciona al abrirlo en el navegador de esta misma computadora con la web activa.

## Preparación local: consentimiento de confianza Windows

El asistente scripts/verificacionLocalPrivada.ps1 crea, solo cuando se autoriza
expresamente, un certificado de servidor para **únicamente localhost**, sin permiso
de CA, válido 30 días. Se guarda en CurrentUser/My y su certificado público se
agrega a CurrentUser/Root para que Edge valide TLS sin advertencias ni excepciones.
No cambia LocalMachine ni la validación global de TLS. Esta modificación del almacén
de confianza del usuario requiere consentimiento explícito; no se realiza por un
simple arranque de la web.

```powershell
.\scripts\verificacionLocalPrivada.ps1 -Accion Preparar -ConfiarCertificadoLocal
```

La carpeta nueva LOCALAPPDATA/PluriOne/marketing-automation/verificacion-local
tiene ACL limitada al usuario y SYSTEM. Contiene PFX protegido, certificado público
y web.dpapi con la contraseña PFX y claves de sesión nuevas y exclusivas del piloto.
No modifica/regenera el cliente OAuth, su clave AES ni el token existente. No
sobrescribe archivos ni reconfigura MongoDB. Si queda una preparación parcial, se
conserva y se detiene; no borrar archivos ni repetir generación a ciegas.

Repetir Preparar con una configuración completa reutiliza el certificado y las
claves existentes. El código valida SAN, uso de servidor, ausencia de CA, firma,
vigencia, archivos fuera del repositorio y contexto TLS antes de aceptar el origen.

## Procedimiento mínimo

Para funcionamiento continuo sin despacho por registro, consultar
[verificacion automatica](verificacion-automatica.md). El procedimiento de un
solo correo siguiente se conserva para la primera prueba externa controlada;
no es el modo operativo definitivo del registro.

Corrección de arranque WEB_HTTPS (18 de octubre): la comprobación de índices
reutiliza los modelos que su propia carga registra en la conexión global;
anteriormente intentaba registrarlos otra vez y producía OverwriteModelError.
No requiere migración ni cambios de índices. El sondeo convierte el certificado
CER de Windows (DER) a PEM antes de pasarlo como CA a Node, conservando la
validación de firma y nombre. No se reemplaza el certificado existente.

El arranque informa `PILOTO_ARRANQUE_RECHAZADO etapa=... codigo=...` con una
lista cerrada de diagnósticos, sin publicar errores internos ni valores privados.
Se distinguen manifiesto, HTTPS, configuración de sesiones, conexión/destino
MongoDB, índices, almacén persistente, aplicación y puerto ocupado. No repetir
Preparar ni regenerar claves para resolver un error de arranque.

1. Arranca la web en una consola local que dejarás abierta:

   ```powershell
   .\scripts\verificacionLocalPrivada.ps1 -Accion Web
   ```

   Se valida destino e índices antes de escuchar. No se inicia ningún trabajador,
   no se cargan tokens transaccionales en la web y no se activan proveedores.

2. Desde otra consola, comprueba HTTPS autenticado:

   ```powershell
   .\scripts\verificacionLocalPrivada.ps1 -Accion Comprobar
   ```

   Debe informar tlsVerificado:true. El sondeo valida el certificado y localhost,
   requiere la respuesta de la web piloto y no consulta Google. Abre en Edge
   https://localhost:3100/registro. No continúes si hay una advertencia de certificado;
   no uses excepciones del navegador ni NODE_TLS_REJECT_UNAUTHORIZED=0.

3. Registra una empresa ficticia con un buzón que controlas. Puedes usar la misma
   cuenta personal remitente si deseas recibir en ella. Aún no hay contraseña ni
   administrador, y la respuesta no confirma envío. No introduzcas datos empresariales
   reales para este primer ensayo. No se copian datos desde 27017/27018.

4. Obtén únicamente el ID y estado de esa solicitud:

   ```powershell
   .\scripts\verificacionLocalPrivada.ps1 -Accion Estado
   ```

   Introduce el correo en el prompt oculto. El comando consulta solo la base piloto
   y muestra ID, estado y correoEstado, nunca el enlace ni su hash. Debe aparecer
   pendiente_correo / pendiente_configuracion antes del envío.

5. **DETENERSE hasta autorizar expresamente un único correo**, indicando ID, buzón
   controlado y ventana. El siguiente comando es exclusivamente para después de esa
   autorización; NO se ejecuta al preparar o comprobar el origen:

   ```powershell
   .\scripts\verificacionLocalPrivada.ps1 -Accion EnviarUnCorreo -Solicitud ID_SOLICITUD -AutorizarUnCorreo
   ```

   Antes de autorizar puede usarse `-Accion PrepararUnCorreo -Solicitud ID_SOLICITUD`:
   solicita el buzon en entrada oculta y verifica su coincidencia con ese ID,
   estado pendiente y versionEnvio=0, sin activar transporte ni escribir en MongoDB.
   La propiedad del buzon la debe confirmar el operador; una coincidencia con la
   base no prueba control de la cuenta.

   EnviarUnCorreo vuelve a solicitar el buzon oculto y exige la misma coincidencia.
   La reclamacion transaccional vuelve a exigir ID, destinatario y versionEnvio=0.
   No admite un segundo intento para ese ID, ni despues de un reenvio; no reinicia
   el trabajador ni inicia el residente. Un intento rechazado o incierto requiere
   detenerse y revisar, sin editar contadores ni repetir el comando.

   El asistente carga DPAPI solo en memoria, comprueba la credencial cifrada,
   suministra el origen local real solo al proceso de prueba, valida TLS activo,
   destino, índices y estado pendiente del ID. Solo ese trabajador recibe la bandera
   de envío. La web conserva proveedores apagados y los archivos privados originales
   no cambian. El supervisor procesa un ID con cero reinicios; la cola persiste en
   MongoDB. Un estado incierto/procesando/fallido exige revisión, nunca repetir a ciegas.

6. Consulta Estado nuevamente y confirma recepción manualmente en entrada/spam.
   El estado enviada no demuestra recepción. Abre el enlace recibido en Edge de
   esta misma computadora; conserva la web abierta. Confirma tu correo, configura
   administrador y contraseña y después inicia sesión. Reutilizar el enlace debe
   quedar rechazado. No pegues en chat ni captures la URL con token.

7. Conserva evidencia redactada de recepción, solicitud completada y login. Detén
   solo la web del ensayo con Ctrl+C en su consola cuando termines. No detener
   MongoDB ni borrar la empresa ficticia sin una autorización separada.

## Límites de validación

Un certificado local válido no demuestra entrega de Gmail ni vigencia futura del
refresh token. Preparación, TLS real, persistencia y envío externo se registran por
separado. Las cookies/sesiones y el flujo HTTP mantienen sus pruebas existentes;
la recepción real se valida únicamente después de autorizar y ejecutar el paso 5.

Fuentes: [certificados de prueba Windows](https://learn.microsoft.com/en-us/powershell/module/pki/new-selfsignedcertificate?view=windowsserver2025-ps),
[HTTPS nativo de Node](https://nodejs.org/api/https.html#httpscreateserveroptions-requestlistener).
