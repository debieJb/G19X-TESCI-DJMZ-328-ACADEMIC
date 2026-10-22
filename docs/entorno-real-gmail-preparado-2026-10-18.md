# Entorno local aislado preparado, sin envíos

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


## Estado real comprobado

- Rama `respaldo-avances-18-oct`, respaldo HEAD `1df937e` conservado. Sin commit ni push.
- Se recuperó la instancia persistente existente `marketingPilotLocalRs`, primaria en `127.0.0.1:27019`, con los datos existentes y sin reinicializar ni reconfigurar el replica set.
- Los directorios existentes son `C:\Users\jocam\Documents\marketing-automation-pilot-mongo-rs\data` y `logs`. El arranque verifica rutas y posteriormente opciones efectivas del servidor. Se conservó pausado el monitor TTL como estaba configurado; la aplicación comprueba caducidad lógica.
- No se cambió la instancia habitual de 27017, la web existente en 3000 ni n8n en 5678. No se inició la instancia de pruebas automatizadas en 27018.
- Para no añadir índices ni modificar datos de la base de piloto anterior, se creó una base nueva: **`marketing_gmail_preparacion_local`**. La base `marketing_piloto_mvp` permanece conservada.
- La comparación de hashes de documentos e índices de las bases de aplicación preexistentes en 27019 fue idéntica antes y después. Se excluyen las bases internas de MongoDB, cuyos metadatos y oplog cambian normalmente al arrancar y escribir una base nueva.
- En la base nueva se crearon las colecciones e índices mediante el migrador existente. Todos los índices requeridos, únicos, parciales y TTL fueron comprobados; no se ejecutaron `drop`, `syncIndexes` ni reparación.
- Se comprobaron commit transaccional, rollback y persistencia del marcador al reconectar desde procesos independientes. El documento del rollback no existe. No se reinició nuevamente MongoDB para simular una caída después de preparar la base.
- Se reutilizaron certificado HTTPS, confianza local y claves de sesión DPAPI ya existentes. No se generaron ni reemplazaron secretos. `.env` permanece sin editar.
- La web aislada está iniciada en **https://localhost:3100**, con `NODE_ENV=production`, `trustProxy=[]` y sesiones persistentes cifradas en la base nueva.
- Los tokens/cookies no se imprimieron. Se verificaron `Secure`, `HttpOnly`, `SameSite=Lax` y `Cache-Control: no-store` en login.
- El perfil fija el callback empresarial **https://localhost:3100/empresa/gmail/callback** solo en el proceso. La configuración OAuth y la clave de cifrado pasan la validación local, sin llamar Google.
- Modo del motor: `automatico`; bandera de envío: `false`; lista de empresas habilitadas: vacía. Trabajadores de campañas y transaccionales: no iniciados. Gemini apagado. No se autorizaron cuentas Google ni se hicieron envíos.
- La base nueva tiene cero empresas, usuarios, conexiones Gmail, ejecuciones y envíos. Las consultas HTTPS de login y registro crean únicamente sesiones de preparación en esta base nueva.

## Comandos exactos

Ejecutar desde PowerShell en el repositorio:

```powershell
Set-Location 'C:\Users\jocam\Documents\marketing-automation'
```

**MongoDB aislado** — ya está iniciado. Este comando recupera el nodo existente cuando está apagado, o verifica el que ya está activo; nunca inicializa otro replica set:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/iniciarMongoPilotoLocal.ps1
```

**Preparación de base** — ya realizada. Repetir solo verifica el marcador propio y el esquema; si encuentra una base ajena o incompleta, se detiene sin repararla:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verificacionLocalPrivada.ps1 -Accion PrepararGmail
```

**Web HTTPS del perfil Gmail** — ya iniciada en segundo plano durante esta tarea. Para iniciarla en futuros reinicios, abrir una terminal y dejarla abierta. No iniciar otra mientras 3100 esté ocupado:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verificacionLocalPrivada.ps1 -Accion WebGmail
```

**Diagnóstico de extremo a extremo sin envíos**, en otra terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verificacionLocalPrivada.ps1 -Accion DiagnosticoGmail
```

**Consulta de la cola de registro de esta base**, también sin envíos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verificacionLocalPrivada.ps1 -Accion Cola -PerfilGmail
```

No usar `npm start` para este ensayo: corresponde al arranque habitual y puede usar la URI antigua de `.env`. No iniciar trabajadores, supervisores de envío ni cambiar banderas a `true` en esta fase. No hace falta iniciar ni configurar n8n.

## URLs

| Uso | Dirección |
| --- | --- |
| Página pública del ensayo | https://localhost:3100/ |
| Registro empresarial | https://localhost:3100/registro |
| Login | https://localhost:3100/login |
| Panel, tras login | https://localhost:3100/panel |
| Gmail empresarial, solo administrador de empresa | https://localhost:3100/empresa/gmail |
| Campañas | https://localhost:3100/campanas |
| Callback OAuth empresarial, registrar en Google Cloud | https://localhost:3100/empresa/gmail/callback |

No abrir el callback manualmente: solo recibe la respuesta oficial de Google con state y código vinculados a la sesión.

## Punto de intervención manual y dependencias pendientes

La infraestructura ya no está bloqueada por transacciones. **Todavía no se ha probado una conexión real a Google ni una entrega real.** Tener variables de OAuth válidas no demuestra que Gmail API esté habilitada, que la pantalla de consentimiento admita la cuenta o que un token continúe vigente.

### Empresa verificada antes del Gmail empresarial

La base nueva está vacía. Para conservar las reglas existentes, no se copió ningún usuario, se activó un administrador artificialmente ni se extrajo un enlace de verificación de MongoDB.

1. Registrar una empresa exclusivamente de prueba en `/registro` con un buzón controlado. La solicitud puede guardarse con transportes apagados; no llegará un correo todavía.
2. La credencial transaccional privada existente pasó validación **local** de cifrado, identidad y cliente; no se renovó ni consultó Google. Su configuración DPAPI no tiene un origen público persistido. El lanzador de envío unitario ya fija `https://localhost:3100` en el proceso, sin cambiar esas credenciales. Debe usarse `-PerfilGmail` para que selección, comprobación y despacho apunten a la base nueva.
3. Completar la verificación empresarial requiere autorizar por separado **un correo de verificación** al buzón propio. No se autorizó ni envió en esta tarea. Después se sigue el enlace y se configura el primer administrador mediante el flujo existente. No se necesita un trabajador residente para ese correo unitario.
4. Si Google rechaza la credencial transaccional al intentar esa futura operación autorizada, su propietario deberá reconectarla por el flujo interactivo existente. No se declara que su vigencia remota esté comprobada.

### Google Cloud y autorización interactiva del Gmail empresarial

En el proyecto del cliente OAuth empresarial existente:

1. Confirmar que **Gmail API** esté habilitada.
2. Confirmar un cliente OAuth de tipo **aplicación web**. Añadir exactamente `https://localhost:3100/empresa/gmail/callback` a sus URI de redirección autorizadas. No eliminar callbacks previos ni compartir secretos.
3. Configurar la pantalla de consentimiento. Si está en Testing, añadir la cuenta remitente a usuarios de prueba; en Workspace comprobar también que la organización permita la aplicación.
4. Tras tener el administrador empresarial verificado, iniciar sesión en la web de 3100 y abrir `/empresa/gmail`. Escribir el Gmail exacto y pulsar **Conectar con Google**. Completar personalmente la pantalla oficial en Google. No enviar la contraseña, tokens, códigos ni URL de autorización por chat.
5. La aplicación exige correo verificado, firma del ID token, nonce, state de un solo uso, PKCE y correspondencia entre el correo escrito y la identidad recibida. Solo entonces guarda tokens cifrados de esa empresa. No admite direcciones arbitrarias ni alias no verificados. La comprobación de la identidad real queda pendiente hasta ese paso.

La autorización OAuth habilita acceso a una cuenta; **no autoriza por sí sola una campaña**. Google documenta el flujo de servidor y la coincidencia del callback en [OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server) y [Gmail OAuth](https://developers.google.com/workspace/gmail/api/auth/web-server).

### Prueba real futura: un destinatario

Después de registrar y verificar la empresa y conectar Google:

- Registrar un único contacto propio con consentimiento explícito, fuente y fecha; excluir inactivos o bajas.
- Preparar una campaña de texto inmediata y revisar remitente, destinatario, asunto y cuerpo completos.
- Confirmar expresamente esos cuatro valores antes de autorizar ningún envío. Mantener la bandera apagada hasta entonces.
- Verificar que no haya otros trabajos pendientes de la empresa. La activación futura debe apuntar a esta misma base y clave de cifrado, usando un único motor Gmail API. La web actual de preparación deliberadamente no arranca trabajadores ni habilita la confirmación de envío.
- Tras la autorización, registrar aceptación de Gmail e identificadores persistentes y comprobar recepción en el buzón cuando sea posible. No considerar una prueba simulada ni un HTTP 200 como confirmación de recepción.

## Diagnóstico y pruebas

Diagnóstico HTTPS real sin Google: `/panel`, `/empresa/gmail`, `/campanas` y `/contactos` redirigen a `/login`; POST a login y registro sin CSRF devuelve 403; POST a confirmación de campaña sin sesión se rechaza. El preparador del trabajador devuelve `null` con las banderas apagadas: no inicia un consumidor.

Los cambios de esta tarea están limitados al perfil local, recuperación, diagnóstico y documentación. Se reutilizó la infraestructura existente; no se cambió el diseño ni el motor de campañas. Las pruebas generales se ejecutaron nuevamente; los resultados finales se indican al cierre de este informe. No se repitieron las 118 integraciones de la fase anterior ni se afirman como nuevas pruebas reales de Google.

Resultado final: **772 pruebas generales aprobadas, 0 fallidas, 0 omitidas**. Incluye cuatro pruebas nuevas del perfil, aislamiento de configuración, bloqueo previo a conectar y selección de la base correcta. El diagnóstico HTTPS real también terminó correctamente. `git diff --check` pasó. MongoDB 27019 y la web de preparación 3100 se dejaron iniciados; ningún trabajador productivo fue iniciado. La autorización interactiva y cualquier correo real quedan pendientes de intervención y autorización expresas.

Archivos de esta fase: `scripts/iniciarMongoPilotoLocal.ps1`, `scripts/prepararEntornoGmailLocal.js`, `infra/gmail-preparacion.local.json`, `services/diagnosticoWebGmailLocalService.js`, `tests/gmail.preparacion.local.test.js`, `config/manifiestoPiloto.js`, `services/httpsPilotoLocalService.js`, `scripts/verificacionLocalPrivada.ps1`, `scripts/verificacionLocal.js` y este documento. Se conservan los cambios previos y el archivo accidental sin seguimiento.
