# IA: corrección del proceso web y prueba HTTP completa

## Causa comprobada en el proceso que atendía 3000

Se inspeccionó en solo lectura el proceso Node que tenía el puerto, verificando primero que correspondía a `server.js` en este repositorio. Se devolvieron únicamente valores cerrados de backend y entorno, PID y antigüedad del código; no se imprimieron secretos ni el entorno completo.

Resultado antes de corregir: **PID 5636**, backend heredado **ausente**, entorno `development`, arranque **anterior al último cambio de iaService**. El proceso que atendía el navegador seguía siendo el anterior, aunque se había intentado arrancar otro con `piloto_local`.

Sin esa variable, `limitesIA.seleccionarAlmacen()` selecciona `dev_fixture`. `almacenCuotasDev.obtener()` rechaza el ID real de Nickki porque no es una empresa ficticia `f17e1a…`; la excepción original es **CUOTAS_DEV_NO_AUTORIZADAS**. `limitesIA` la convertía en `PROVEEDOR`, y el servicio anterior la presentaba como fallo genérico de Gemini.

Se reprodujo ese recorrido mediante POST HTTP con la empresa y administrador reales, sesión propia de una aplicación efímera y Gemini simulado. El diagnóstico nuevo identifica:

```text
[IA_DIAGNOSTICO] {"etapa":"CUOTA_ALMACEN","codigo":"FIXTURE_NO_AUTORIZADA"}
[IA_DIAGNOSTICO] {"etapa":"CUOTA","codigo":"PROVEEDOR"}
```

En ese caso se comprobaron **cero llamadas al adaptador Gemini**. No se modificaron las validaciones para admitir empresas reales en el almacén de fixtures.

## Correcciones

- `server.js` valida el almacén del piloto explícito antes de escuchar. La comprobación es de lectura: no crea índices, consume cuota ni consulta Gemini. Un error impide anunciar ese nuevo servidor como listo.
- Al empezar a escuchar imprime `IA_WEB` con PID, backend efectivo, entorno y `cuotasVerificadas`. Un puerto ocupado muestra claramente que el proceso anterior sigue atendiendo: el intento nuevo no lo sustituyó.
- El cierre del servidor cierra también las conexiones de cuotas. No se inició ningún trabajador.
- Los fallos del almacén y de escritura conservan diagnósticos separados con vocabulario cerrado: fixture rechazada, autenticación/permisos MongoDB, colección ausente, índice incompatible, red o validación. Nunca se serializan errores originales ni sus mensajes arbitrarios.
- `GET /empresa/ia/diagnostico`, exclusivamente administrador autorizado, permite comprobar **el proceso que atiende esa petición**. Mantiene autenticación, aislamiento, `no-store` y revalidación empresarial; no genera ni consume cuota y no devuelve URI, credenciales o datos de contactos.

## MongoDB verificado

El backend `piloto_local` conserva todas sus barreras: entorno development, empresa fija Nickki, URI local autorizada, conexión separada a `plurione_ai_quota_piloto_local`, replica set `marketingDevRs`, PRIMARY, miembro `localhost:27018`, puerto/bind/dbPath efectivos, marcador propio, índice único `(empresa, ventana)` y TTL `expiraEn`.

No fue necesario cambiar índices, datos de cuotas, configuración MongoDB ni secretos. Permanecen 3 intentos por minuto, 20 por día y los límites de concurrencia. Las solicitudes de integración válidas consumen cuotas reales; no se reinician ni restituyen sus contadores para facilitar la prueba.

## Resultado de la prueba HTTP

`pruebas-integracion/iaPilotoHttp.js` usa el factory de la aplicación, rutas, controlador, servicios, validaciones y almacén de cuotas reales. La sesión firmada pertenece solo a la aplicación efímera de la prueba; el administrador y su empresa se recargan de MongoDB. No se leen ni cambian contraseñas. Solo se simula `fetch` de Gemini, usando el adaptador REST real y su validación de respuesta; cualquier otra URL externa se rechaza.

Se comprobaron:

1. CSRF ausente devuelve 403 sin generar.
2. Backend ausente reproduce el error de fixtures con la empresa real y devuelve 503 sin generar.
3. Backend `piloto_local` devuelve diagnóstico correcto y cuotas verificadas sin consumo adicional.
4. POST de generación devuelve asunto, mensaje, llamada a la acción y segmentación editables, con Gemini simulado y cuota persistente real.
5. Antes de aprobar no existe una campaña con el hash del ticket.
6. Aprobar crea un documento real en estado borrador, empresa/autor correctos, sin destinatarios preseleccionados. Preparación y edición responden 200 y muestran el asunto revisado.
7. Repetir la aprobación devuelve 409 y no duplica.
8. Los documentos de Gmail conservan su hash antes/después.

La limpieza elimina únicamente el borrador de prueba recién creado, filtrando ID, empresa, nombre, estado borrador y hash de aprobación. Quedan cero borradores de esa prueba. La campaña de lanzamiento y su envío no se tocan.

Resultado: **838 pruebas generales y 1 integración HTTP aprobadas**, cero fallidas. Evidencia: `ia-http-regresion-suite.log`, `ia-http-real-diagnostico.log`. **No se realizó otra llamada auténtica a Gemini** durante esta corrección. La comprobación remota de contenido desde el navegador corresponde al ensayo manual siguiente.

Ejecución explícita de la integración, si vuelve a ser necesaria:

```powershell
$env:AI_QUOTA_BACKEND = 'piloto_local'
$env:IA_HTTP_REAL_COMPANY_TEST = 'true'
node --test pruebas-integracion/iaPilotoHttp.js
```

No se incluye como prueba automática sin esa autorización explícita de uso de la empresa real.

## Estado del servidor y una verificación en el navegador

Se sustituyó exclusivamente el proceso antiguo identificado de 3000. El nuevo **PID 21136** quedó escuchando con:

```text
IA_WEB: {"pid":21136,"backend":"piloto_local","entorno":"development","cuotasVerificadas":true}
```

Una segunda inspección confirmó el backend heredado y código actualizado. El GET de diagnóstico sin sesión redirige a login. No hace falta iniciar otra instancia; el reinicio perdió las sesiones de MemoryStore anteriores, por lo que puede ser necesario iniciar sesión de nuevo.

1. Entrar como administrador de Nickki en `http://localhost:3000/login`.
2. Abrir `http://localhost:3000/empresa/ia/diagnostico`. Debe indicar `backend: piloto_local`, `entorno: development` y `cuotasVerificadas: true`. El PID puede cambiar en futuros reinicios. Esta consulta no llama a Gemini.
3. Abrir **Asistente IA** en `http://localhost:3000/empresa/ia`.
4. Escribir nombre **Nickki Velas | Propuesta IA** y descripción: «Crea una campaña de presentación de Nickki Velas, una marca de velas, con tono cálido y elegante. Invita a conocer la colección sin inventar precios ni descuentos». Confirmar privacidad y pulsar **Generar propuesta con IA** una sola vez.
5. Revisar y editar el resultado. Pulsar **Me gusta / Continuar** si se desea guardar el borrador. No activar ni enviar una campaña para comprobar IA.

Para reinicios futuros desde la terminal del servidor, detener primero la instancia anterior y conservar `AI_QUOTA_BACKEND=piloto_local` en el mismo proceso que ejecuta `npm start`. No editar ni volver a pegar claves.

Comprobación final de Gmail: una campaña empresarial existente, una ejecución y un envío; hash SHA-256 del registro exitoso igual al anterior, cero borradores de integración restantes. Gmail OAuth, motor e interfaz de envío, secretos y contraseñas no se modificaron. Sin correos, trabajadores automáticos, commit o push.
