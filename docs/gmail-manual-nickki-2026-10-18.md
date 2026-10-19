# Despacho manual de Nickki Velas

Implementación para el ensayo atendido de la empresa `6ad574f460d35245e124c9ee`.
El usuario confirmó el primer envío real: `ACEPTADO_API` persistido y mensaje recibido correctamente en Gmail. Durante la mejora de interfaz no se volvió a enviar, no se modificó el registro exitoso y no se activó ningún trabajador.

## Interfaz simplificada vigente

Abrir `/campanas/6ad59db1979914f0361d12cf/automatizacion` después de recargar el proceso web con el código actualizado. La pantalla carga el historial automáticamente. Para esta campaña ya enviada debe mostrar **Aceptado por Gmail**, conservar la referencia del envío y ocultar la acción de enviar. No repetir el ensayo.

Para una campaña que reúna los requisitos existentes, el recorrido es: crear/editar, guardar destinatarios autorizados, revisar remitente/asunto/mensaje/cantidad, pulsar **Enviar campaña** y confirmar una sola vez en el diálogo. **Volver a revisar** o Escape cierran el diálogo sin autorizar ni enviar. La autorización de diez minutos y el despacho siguen siendo dos solicitudes internas secuenciales con CSRF, las mismas confirmaciones del servidor y la misma clave de idempotencia. No cambian reglas, cuotas ni límites del motor; simplificar la pantalla no habilita campañas adicionales después de consumir el piloto.

El botón permanece bloqueado hasta consultar el historial. Cualquier ejecución existente impide volver a enviar desde la interfaz, además de las barreras del servidor. Ante pérdida de respuesta se conserva una marca en la sesión del navegador y solo se ofrece actualizar el historial, sin reintento automático. Rechazos, incertidumbre y envíos en curso muestran mensajes comprensibles. **Actualizar historial** solo consulta; la referencia de Gmail queda dentro de un detalle desplegable.

Se retiraron del flujo manual los controles visibles de autorizar, revocar y consultar resultados técnicos. Sus endpoints y los controles del servidor se conservan. La conexión avanzada se presenta en un apartado plegable y la navegación entre detalle, edición y preparación permanece disponible.

Validación de esta mejora: **824 pruebas generales aprobadas**, incluidas pruebas de interacción del diálogo, doble confirmación, CSRF, orden autorización/despacho, campaña aceptada, recarga, cancelación y pérdida de respuesta; proveedores simulados. Evidencia en `campanas-ux-regresion.log`. El envío y la recepción reales iniciales fueron confirmados por el usuario, no repetidos por estas pruebas.

Revisión adicional en Edge real con servidor efímero y transportes simulados: **19 comprobaciones y 4 capturas, cero errores JavaScript**, escritorio de 1440 px y móvil de 390 px. Comprueba el diálogo, cancelación sin solicitudes de envío, dos pasos internos con una sola confirmación, conservación de CSRF e idempotencia, bloqueo de la campaña aceptada y recarga sin reenvío. La prueba se ejecuta explícitamente con `NODE_ENV=test node --test tests/soporte/campanaEnvioNavegador.cjs`; no carga `.env`, no conecta MongoDB y bloquea las solicitudes fuera del servidor local. Evidencia en `campanas-ux-navegador.log`. Tras los últimos ajustes de presentación también pasaron las 48 pruebas focalizadas de interfaz y regresión.

La comparación SHA-256 de los documentos completos de la ejecución y su envío real coincide antes y después de esta tarea: una ejecución, un envío, `aceptado` / `ACEPTADO_API`, un intento. No se escribieron esos documentos. No se cambiaron OAuth, secretos, infraestructura, motor ni sus reglas; no hubo commit o push.

## Destino y migración aplicada

El destino actual comprobado es `marketing_automation`, replica set `marketingDevRs`, único miembro `localhost:27018`. Es el entorno local existente con los datos de Nickki, no el perfil vacío de HTTPS en 3100 ni un despliegue productivo. El nuevo camino manual valida esa identidad y la existencia de la empresa; conserva los controles del piloto dedicado anterior para los otros caminos.

Se ejecutó explícitamente:

```powershell
node scripts/migrarPilotoManualGmail.js --plan
node scripts/migrarPilotoManualGmail.js --aplicar
node scripts/migrarPilotoManualGmail.js --plan
```

Resultado real: cuatro colecciones creadas y ocho índices creados. La consulta posterior devuelve `faltantes: []`. El migrador comprueba todos los conflictos y duplicados antes del primer DDL y vuelve a consultar `listIndexes` después. Es aditivo e idempotente: no borra documentos, colecciones o índices, no usa `syncIndexes`, no reconfigura MongoDB y no cambia credenciales. Un error DDL puede dejar un avance parcial: inspeccionar el plan antes de repetir, sin eliminar datos para resolver conflictos.

Colecciones nuevas: `ejecuciongmails`, `enviogmails`, `controlenviogmails`, `autorizacionpilotogmails`.

Índices añadidos:

| Colección | Claves | Restricción |
| --- | --- | --- |
| campanas | empresa, asistenciaIA.aprobacionHash | único, parcial string |
| ejecuciongmails | empresa, campana | único |
| ejecuciongmails | empresa, claveHash | único |
| enviogmails | empresa, ejecucion, emailHash | único |
| enviogmails | estado, createdAt | normal |
| enviogmails | empresa, modoMotor, estado, disponibleEn | normal |
| enviogmails | empresa, gmailId | único, parcial string |
| autorizacionpilotogmails | empresa, campana | único |

Los índices `_id` de las nuevas colecciones se crean implícitamente y no se cuentan entre los ocho índices del esquema. No se provisionaron las colecciones ajenas al motor que aparecen en la auditoría global del perfil dedicado.

## Controles del despacho

El arranque habitual valida el esquema sin DDL antes de establecer `gmailManualValidado`. Exige la bandera existente de campañas, modo manual y lista de exactamente la empresa piloto. La configuración actual ya satisface estas condiciones; no se editaron archivos de entorno. El preparador automático devuelve `null`: no se inicia un consumidor.

`POST /campanas/:id/gmail/piloto/despachar` exige sesión empresarial, CSRF, confirmación literal `ENVIAR_UN_CORREO_REAL` y clave de idempotencia persistida por el navegador. Rechaza campos extra, incluido cualquier destinatario, empresa, actor o ID de envío proporcionado por el cliente. El motor vuelve a resolver al administrador activo y verificado, sus permisos, empresa, campaña activa y preparada, cuenta OAuth y contacto propios. No basta la validación visual.

El permiso previo dura diez minutos y fija contenido, contacto, email, consentimiento y administrador. Cambiar esos datos invalida el permiso; se revalidan antes y después de renovar OAuth. Solo admite texto, modalidad inmediata y un único contacto explícito con consentimiento documentado. Utiliza el transporte Gmail API y los tokens cifrados empresariales existentes.

La misma transacción consume autorización, reserva cuotas y crea el control permanente `piloto-manual:6ad574f460d35245e124c9ee`. Este control impide otro intento desde otra campaña o administrador después de reservar el primero. No se libera al finalizar ni al recuperar una reserva vencida. Si falla antes de red después de reservar, el ensayo también queda consumido. Un conflicto de cuota o velocidad revierte la transacción sin consumir el permiso.

Aceptación inequívoca registra `aceptado`, `ACEPTADO_API`, IDs Gmail y fecha. Rechazo inequívoco registra `rechazado`. Timeout, respuesta ambigua y fallo al persistir después del POST requieren conciliación; no hay reintentos del piloto. Una reserva vencida se registra como `incierto` con historial al consultar desde la interfaz, incluso con el envío apagado. El navegador nunca reintenta automáticamente. Un fallo HTTP requiere consultar el historial, no crear otra campaña o clave para insistir.

## Procedimiento anterior (referencia técnica, sustituido por la interfaz simplificada)

Antes de abrir el ensayo, reiniciar el proceso habitual de PluriOne en 3000 para cargar el código nuevo (por ejemplo, detener su terminal y ejecutar `npm start` en el repositorio). No iniciar otro proceso si el puerto sigue ocupado. No cambiar las banderas ni arrancar workers. El código añadido no se inyecta en procesos Node que ya estaban ejecutándose.

1. Abrir `http://localhost:3000/login` e iniciar sesión como administrador de **Nickki velas**, con email verificado. No usar superadmin ni operador.
2. Abrir `http://localhost:3000/campanas/6ad59db1979914f0361d12cf/automatizacion`. La campaña es **Nickki Velas | Campaña de lanzamiento**. Revisar cuenta remitente, asunto, mensaje completo y el email del único contacto seleccionado. Ese buzón debe estar controlado y autorizado para esta prueba. La auditoría comprobó consentimiento documentado, no la autenticidad de evidencia externa.
3. Si hace falta cambiar contenido o destinatario, hacerlo ahora mientras sigue en borrador. Guardar exactamente un contacto y modalidad inmediata, sin imagen. No autorizar todavía.
4. Abrir `http://localhost:3000/campanas/6ad59db1979914f0361d12cf/editar`. En **Estado al guardar**, seleccionar **Activa** y guardar. Esta acción usa el flujo existente y por sí sola no envía correo.
5. Volver a `/campanas/6ad59db1979914f0361d12cf/automatizacion`. Comprobar que desaparezcan los requisitos pendientes. En **Piloto Gmail: un destinatario**, marcar la autorización y pulsar **Autorizar un intento**. No modificar la campaña después.
6. Dentro de los diez minutos, revisar nuevamente los cuatro valores (remitente, destinatario, asunto y cuerpo), marcar **Confirmo remitente, destinatario seleccionado y contenido. Enviar un único correo real ahora** y pulsar una sola vez **Enviar un correo real ahora**. Este es el paso que efectúa el POST real a Gmail.
7. Pulsar **Consultar resultado persistido**. Si aparece `reservado` o `enviando` tras perderse la respuesta, esperar a que venza la reserva (dos minutos desde su adquisición) y consultar otra vez; la consulta clasifica el resultado como incierto sin reenviar. Ante rechazo, incertidumbre o error, detenerse y conciliar.
8. Si aparece `aceptado`, registrar Gmail ID y pedir al propietario del buzón que confirme el mensaje en entrada o spam, comprobando remitente, asunto y contenido. Registrar la recepción por separado. Hasta entonces no afirmar que la entrega funciona.

En la auditoría posterior a la migración la campaña seguía en `borrador`, con preparación inmediata, un contacto, consentimiento válido y documentado, contenido presente y ninguna imagen. Empresa activa y verificada; canal email habilitado; cuenta conectada con scope de envío, cliente OAuth y remitente coincidentes. Estas son comprobaciones locales; no se renovó un token real ni se comprobó su vigencia remota.

## Validación

Las pruebas HTTP cubren CSRF, infraestructura no validada, confirmación incorrecta, campos extra y derivación del actor desde sesión. Las pruebas de migración cubren idempotencia, conflictos, destino incorrecto y un `createIndex` que no crea realmente el índice. Las pruebas de integración usan bases temporales propias, OAuth y Gmail simulados, y comprueban aceptación/rechazo/incertidumbre, concurrencia, bloqueo de otra empresa y de otra campaña, además de recuperación tras fallo al persistir.

Resultados finales: **816 pruebas generales y 53 de integración aprobadas, cero fallidas y cero omitidas**. Evidencia en `gmail-manual-suite.log` y `gmail-manual-integracion.log`. Las integraciones comprueban que el MongoDB principal original conserva proceso, configuración, datos e índices, y limpian sus propias bases temporales. Se corrigió una fixture que intentaba crear directamente una campaña activa antes de obtener la ejecución final completa.

Auditoría posterior: esquema manual sin faltantes, arranque manual validado en una conexión de comprobación, preparador del trabajador automático devuelve `null`; empresa y cuenta coincidentes; campaña real en borrador y cero ejecuciones/envíos. Los procesos web que ya estaban en marcha requieren reinicio para cargar esta implementación; no se reiniciaron ni se terminaron procesos ajenos durante esta tarea. La comprobación no llamó Google. El entorno comprobado sigue siendo local de desarrollo: no acredita sesiones persistentes, HTTPS o disponibilidad productivos en el puerto 3000.

Los transportes simulados no acreditan recepción real. No se iniciaron workers, activaron campañas, cambiaron secretos ni realizaron commit/push.
