# Infraestructura recuperada para ensayos externos — 18 de octubre de 2026

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


> Fase posterior autorizada: ya se creó la base nueva del piloto y se aplicaron sus
> índices. Véase [preparación de la base](preparacion-base-piloto-2026-10-18.md).
> Los inventarios y pendientes siguientes corresponden a antes de esa migración.

Esta revisión recupera servicios existentes; no habilita Gmail/Gemini ni autoriza
aprovisionamiento. No se cambió el diseño ni el código funcional.

## Servicios y directorios verificados

| Puerto | Estado final | Identidad | Directorio de datos |
| --- | --- | --- | --- |
| 27017 | Conservado; referencia comprobada | Standalone original | `C:\Program Files\MongoDB\Server\8.2\data` |
| 27018 | Ya estaba activo, PRIMARY, PID 11812 | `marketingDevRs`, miembro `localhost:27018` | `C:\Users\jocam\Documents\marketing-automation-dev-mongo-rs\data` |
| 27019 | Recuperado, PRIMARY, PID 33480 | `marketingPilotLocalRs`, miembro `127.0.0.1:27019`, configuración versión 1 | `C:\Users\jocam\Documents\marketing-automation-pilot-mongo-rs\data` |
| 27020 | Recuperado, PID 30508, autenticación obligatoria | Standalone del perfil Gemini; `hello` no anuncia replica set | `C:\Users\jocam\Documents\marketing-automation-cuota-mongo-gemini\data` |

Los PID son evidencia de esta ejecución, no identificadores permanentes.
MongoDB instalado y los últimos arranques registrados corresponden a 8.2.6. Los
logs registraban apagado limpio y los archivos `mongod.lock` estaban vacíos.
Se verificaron directorios existentes, ausencia de redirecciones, puertos libres
y ausencia de otro proceso usando cada dbPath antes del arranque.

Se usó el mismo ejecutable y las opciones anteriores: bind loopback, dbPath y
logappend; el piloto conserva réplica, caché 0.25 GiB y oplog 128 MiB; Gemini
conserva `--auth`. No se ejecutaron reparación, inicialización, reconfiguración,
migraciones, cambios de usuarios ni scripts de aprovisionamiento.

**Excepción temporal de ejecución:** ambos procesos recuperados arrancaron con
`--setParameter ttlMonitorEnabled=false` para impedir eliminaciones TTL durante
la inspección. No se cambió ningún índice ni archivo de configuración persistente.
La caducidad lógica de tokens/sesiones sigue siendo obligatoria en la aplicación.
El monitor queda pausado: debe revisarse explícitamente antes del ensayo; no
presentar esta configuración de auditoría como un despliegue productivo terminado.
No se modificó el TTL de 27017/27018.

Se actualizó únicamente el metadato existente `mongod.pid` del perfil Gemini,
de 12716 a 30508, tras validar ejecutable, dbPath, puerto y `--auth`. No contiene
credenciales. No se crearon archivos PID nuevos ni se modificó el perfil histórico.

**Colisión histórica:** `marketing-automation-cuota-mongo` también utiliza 27019.
Ese perfil queda detenido e intacto. No ejecutar los scripts de cuotas históricos
contra el puerto del piloto; para Gemini el perfil es explícitamente 27020.

## Bases, índices, sesiones y cuotas

- 27018: conserva las bases de sistema y las dos fixtures previas
  `ma_ia_test_d9078f61288c4b228743669559fc0f71` y
  `ma_tx_test_3d885d533f5d45598bd67db14f56f041`. No se escribieron ni eliminaron.
- 27019: inventario real `admin`, `config`, `local`; cero bases de aplicación y
  cero usuarios configurados. No hay índices de aplicación ni `sesionesMvp` del
  piloto. Solo loopback; no es una infraestructura productiva autenticada.
- 27020: `hello` responde, pero `listDatabases`, `getCmdLineOpts` y lectura de
  parámetros sin autenticación devuelven código 13. La identidad de proceso se
  comprobó en Windows. **No se conocen todavía las colecciones, índices, roles o
  datos de ese almacén**: no se infieren de documentación histórica ni de archivos WT.
- No existen los archivos DPAPI esperados `quota-uri.dpapi` y
  `quota-uri-gemini.dpapi` en `LOCALAPPDATA/PluriOne/marketing-automation/secrets`.
  No se descifraron archivos ni se generaron/reemplazaron secretos.
- No existe `infra/piloto.aprobado.json`; la plantilla mantiene `aprobado:false`.
  No se creó un manifiesto aprobado por inferencia.
- `node scripts/migrarIndicesPiloto.js --plan` terminó correctamente: inspección
  del esquema sin conectar ni hacer DDL. La migración **no fue aplicada**.
- Express 3000 y n8n 5678 ya estaban escuchando; no se reiniciaron ni sustituyeron.
  La existencia de un listener no acredita sesiones persistentes ni HTTPS.
  La web de piloto no se arrancó: faltan destino aprobado, índices y clave del store.

## Variables: presencia comprobada sin mostrar valores

Presentes: `MONGODB_URI`, `SESSION_SECRET`, las tres variables empresariales
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`,
`GMAIL_TOKEN_ENCRYPTION_KEY`, `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY`.
Presencia no acredita vigencia, permisos ni autorización del proveedor.

Faltantes para piloto/sesiones/cuotas:

- `SESSION_STORE_KEY`.
- `GMAIL_CAMPAIGNS_PILOT_COMPANIES`.
- `AI_QUOTA_BACKEND`, `AI_QUOTA_MONGODB_URI`.
- `MONGODB_URI` está presente para el entorno habitual; no se sustituyó por la
  URI del futuro piloto ni se aprobó otro destino por esa presencia.

Faltantes para remitente transaccional:

- `TRANSACTIONAL_GOOGLE_CLIENT_ID`, `TRANSACTIONAL_GOOGLE_CLIENT_SECRET`.
- `TRANSACTIONAL_GOOGLE_REDIRECT_URI`, `TRANSACTIONAL_GMAIL_SENDER`.
- `TRANSACTIONAL_GMAIL_ENCRYPTION_KEY`, `TRANSACTIONAL_GMAIL_CREDENTIALS_FILE`.
- `TRANSACTIONAL_PUBLIC_ORIGIN`.

`AI_ENABLED` y `AI_FREE_TIER_CONFIRMED` están presentes y apagadas.
`TRANSACTIONAL_EMAIL_ENABLED` y `GMAIL_CAMPAIGNS_ENABLED` están ausentes: equivalen
a apagado. No se activó ninguna bandera ni se modificó `.env`.

## Próximas acciones: alcance preciso

### Locales, pendientes de aprobación o material privado existente

1. Aprobar una base **nueva**, por ejemplo `marketing_piloto_mvp` en
   `marketingPilotLocalRs:27019`; ese nombre no figura en el inventario actual.
   Aprobar además el manifiesto y el plan DDL antes de escribir. El plan crea las
   15 colecciones de modelos, `sesionesMvp`, sus índices y el registro
   `_migracionesPiloto/indices-piloto-v1`, exclusivamente en esa base nueva. No
   copiar datos desde 27017/27018 ni reconstruir la réplica.
2. Aportar/injectar las claves existentes aprobadas para sesiones y cifrado por un
   canal privado. Si no existen, su generación requiere autorización separada;
   no reutilizar claves de pruebas ni intercambiar la clave empresarial y transaccional.
3. Definir origen HTTPS y proxy confiable explícito antes de arrancar la web del
   piloto; comprobar sesiones, CSRF y OAuth sobre ese origen. No reemplazar el
   servidor 3000 existente sin autorización.
4. Usar las credenciales **existentes** de 27020 por canal privado para una
   validación autenticada de solo lectura. El backend requiere la base fija
   `plurione_ai_quota`, el rol mínimo `plurione_ia_quota_runtime`, índice único
   `empresa_1_ventana_1` y TTL `expiraEn_1`. No imprimir la URI ni la contraseña.
   `scripts/ia/validarAlmacenCuotas.js` inspecciona identidad/privilegios/índices;
   no genera contenido ni consume contadores. El launcher DPAPI no funciona hasta
   disponer de ese artefacto privado; no se creó en esta revisión.
5. Si esa inspección demuestra aprovisionamiento incompleto, revisar el inventario
   y pedir autorización exacta antes de cambiar roles, usuarios, colección o índices.
   **No ejecutar ahora `recuperarAlmacenCuotas.ps1 -AlmacenGemini`: su implementación
   puede crear roles/usuarios/índices y termina eliminando el bootstrap temporal.**
6. Revisar los TTL de los destinos recuperados antes de reactivar el monitor.
   Esa reactivación puede eliminar registros ya caducados y requiere aprobación.

### Intervención humana en Google Cloud / AI Studio

1. Para el remitente de plataforma: configurar un cliente OAuth independiente,
   Gmail API y consentimiento/usuario de prueba. Callback exacto del autorizador:
   `http://127.0.0.1:3001/oauth/callback`. Inyectar los datos privados y autorizar
   la cuenta sin enviar todavía mensajes.
2. Para campañas: revisar el cliente empresarial existente y registrar el callback
   del origen HTTPS aprobado terminado en `/empresa/gmail/callback`; conectar la
   cuenta de la empresa con identidad coincidente. No usar las credenciales de
   plataforma ni convertir OAuth en autorización implícita de envío.
3. Para Gemini: confirmar proyecto, clave, acceso al modelo seleccionado y cuota
   gratuita. No habilitar facturación ni generar contenido durante la configuración.

Después hacen falta autorizaciones independientes para un correo transaccional,
una generación Gemini y un correo de campaña, con sus cuentas/destinatarios,
contenido y ventana. Véase el [recorrido completo](cierre-funcional-integraciones.md).

## Verificación final y límites de evidencia

`node scripts/verificarMongoDevRs.js --verificar` terminó correctamente después
de la recuperación: referencia de 27017 sin cambios de proceso/configuración/datos/
índices y 27018 PRIMARY. Las pruebas 629/91 son las de la fase anterior; no se
repitieron ni se eliminaron fixtures en esta inspección de infraestructura.

No se ejecutaron escrituras de aplicación, eliminación de datos, creación de bases,
DDL o administración de usuarios. El arranque normal escribe metadatos internos y
logs de MongoDB. No se afirma comparación de datos autenticados de 27020: aún no
ha sido posible leerlos. No hubo solicitudes externas, cambios de diseño, commit
ni push. Los servicios recuperados quedan activos para la siguiente revisión.
