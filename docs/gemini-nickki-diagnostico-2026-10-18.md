# Gemini: diagnóstico y desbloqueo de Nickki Velas

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Seguimiento posterior: el navegador seguía atendido por un proceso anterior sin la variable de backend. Se identificó y sustituyó ese proceso y se verificó generación/aprobación/edición mediante HTTP con MongoDB real y Gemini simulado. El [cierre HTTP y estado efectivo de la web](ia-http-cuotas-2026-10-18.md) contiene el diagnóstico vigente y la verificación desde el navegador.

## Causa reproducida

El error genérico de proveedor se producía **antes de realizar la petición a Gemini**:

```text
[IA_DIAGNOSTICO] {"etapa":"CUOTA","codigo":"PROVEEDOR"}
```

`NODE_ENV=development`, sin `AI_QUOTA_BACKEND` ni URI protegida, seleccionaba el backend `dev_fixture`. Este backend admite exclusivamente empresas ficticias con prefijo `f17e1a`; rechaza correctamente el ID real de Nickki. La reproducción con el servicio completo y la red sustituida confirmó cero llamadas a Gemini. No había registros históricos del incidente disponibles en los logs del repositorio; esta conclusión corresponde al fallo reproducido con la configuración actual.

También se comprobó que no existe archivo DPAPI de cuotas disponible en las rutas de los lanzadores existentes y que 27020 no escucha. No se recuperaron servidores, crearon usuarios ni cambiaron contraseñas para resolverlo.

## Configuración comprobada sin imprimir secretos

| Variable | Valor/estado observado |
| --- | --- |
| AI_PROVIDER | gemini |
| AI_MODEL | gemini-3.5-flash-lite |
| AI_ENABLED | true |
| AI_FREE_TIER_CONFIRMED | true |
| GEMINI_API_KEY | Presente; no se imprimió ni modificó |
| AI_QUOTA_BACKEND | Ausente en `.env`; requiere `piloto_local` en el proceso local |

No es necesario cambiar las cuatro variables de Gemini ni su clave. La declaración local de nivel gratuito no constituye una consulta de facturación al proyecto; no se modificó facturación.

## Comprobaciones auténticas contra Gemini

- Consulta `models.get` con la clave actual: **HTTP 200**, nombre exacto coincidente y `generateContent` entre los métodos soportados. Se comprobó mediante el [endpoint oficial de modelos](https://ai.google.dev/api/models), sin asumir que el nombre publicado implicaba acceso con esta clave.
- **Una única generación auténtica**, mediante `iaService.generar` con el administrador activo de Nickki, validación de acceso y cuotas persistentes. Se usaron instrucciones comerciales generales sobre Nickki Velas, sin consultar contactos ni transmitir IDs empresariales, emails, tokens o secretos. El flujo validó asunto, mensaje, llamada a la acción y **3 sugerencias de segmentación**.
- El proveedor real fue Gemini; no hubo fallback, transporte simulado ni reintento en esa comprobación.
- No se guardó una campaña real: la aprobación humana sigue siendo obligatoria. No se enviaron mensajes de correo.

La llamada real se ejecutó con `AI_QUOTA_BACKEND=piloto_local` inyectado solo en su proceso. Consumió una unidad de cuota diaria; la persistencia se comprobó desde otro proceso. No se conservaron instrucciones o respuesta completa en los logs de diagnóstico.

## Corrección implementada

1. Opción explícita de cuotas `piloto_local` para **development**, exclusivamente Nickki (`6ad574f460d35245e124c9ee`). No es un fallback y producción sigue exigiendo el backend protegido.
2. Base separada **plurione_ai_quota_piloto_local**, en el replica set local existente de 27018. Conexión separada de la empresarial; no se inició otro servidor ni se cambiaron su configuración o credenciales. Validación de base, host/puerto, replica set, PRIMARY, opciones efectivas del proceso y marcador propio.
3. Preparación aditiva explícita ya realizada: marcador, colección `usoias`, índice único `(empresa, ventana)` e índice TTL `expiraEn`. Se volvieron a consultar los índices y se repitió la preparación para comprobar idempotencia. No se borraron datos. El runtime comprueba los índices sin crear ni sincronizar esquemas.
4. Los límites existentes permanecen: **3 intentos por minuto, 20 por día**, una generación concurrente por empresa y dos globales. Las escrituras del backend local usan majority. Otra empresa, producción, marcador ajeno o índices incompatibles fallan cerrado.
5. La interfaz diferencia ahora un control de cuotas no disponible de un fallo remoto de Gemini. Los diagnósticos conservan vocabulario cerrado, sin serializar errores, claves ni cuerpos.
6. Comando de diagnóstico con salida segura y consulta de modelo independiente de la generación. No existe generación al importar el comando.

Este backend es una opción del piloto local, sin las credenciales y privilegios mínimos del backend protegido de producción. No sustituye ese diseño ni lo habilita para producción.

## Una prueba real desde el navegador

Ya se realizó una comprobación técnica real; los pasos siguientes hacen **otra generación**, esta vez desde la interfaz. No pulsar regenerar si se desea limitar el ensayo a una sola solicitud.

1. Detener de forma controlada el proceso web que escucha en 3000. No iniciar una segunda instancia. En PowerShell, desde el repositorio:

   ```powershell
   $env:AI_QUOTA_BACKEND = 'piloto_local'
   npm start
   ```

   La configuración existente usa `NODE_ENV=development`. No cambiarla a producción para este backend. No editar ni volver a pegar la clave Gemini. No cambiar ninguna bandera Gmail ni iniciar workers.

2. Abrir **http://localhost:3000/empresa/ia** como administrador de Nickki velas. También se accede desde **Asistente IA**.
3. En nombre de campaña escribir **Nickki Velas | Propuesta IA** y, en descripción:

   > Crea una campaña de presentación para Nickki Velas, una marca de velas. Usa un tono cálido y elegante. Invita a conocer la colección. No inventes precios, descuentos, certificaciones ni características del producto. Sugiere audiencias generales con consentimiento, sin identificar personas.

4. Dejar vacíos imagen y texto intocable para este ensayo. Marcar **He revisado el texto y confirmo su envío a Gemini**. Pulsar **Generar propuesta con IA** una sola vez y esperar la respuesta. Revisar asunto, mensaje, llamada a la acción y segmentación.
5. Si se desea conservar la propuesta, editar sus campos y pulsar **Me gusta / Continuar**. Esto crea únicamente un **borrador editable**, sin destinatarios preseleccionados ni envío. No activar ni enviar esa campaña para comprobar IA. La campaña previamente enviada no se modifica.

Cada regeneración o petición de cambios consume otra solicitud. Un rechazo de cuota debe respetarse: no reiniciar contadores ni cambiar de empresa para sortearlo.

## Pruebas y límites de la evidencia

**833 pruebas generales aprobadas, 0 fallidas y 0 omitidas**, incluidas autorización, CSRF, separación entre empresas, cuotas, validación de respuesta, privacidad, texto protegido y aprobación humana. Nuevas pruebas cubren el opt-in local, rechazo de producción/otra empresa, conexión separada, ausencia de DDL en runtime, índices inválidos, límites, consulta de modelo y explicación del error de cuotas.

La conversión de propuesta a borrador editable se comprobó en HTTP con **Gemini y persistencia simulados**, usando datos de Nickki y un único paso de generación/aprobación: sin guardado antes de aprobar, sin destinatarios asignados y sin llamadas de correo. La prueba auténtica comprobó la generación y el contrato de salida; no aprobó ni guardó una campaña en nombre del usuario.

Evidencia: `gemini-correccion-pruebas.log` y `gemini-regresion-suite.log`. La campaña de envío conserva una ejecución y un envío. No se modificaron Gmail OAuth, el motor ni su interfaz. No se iniciaron workers, enviaron correos ni realizaron commit/push. `.env` y secretos no se editaron.

Comandos de diagnóstico seguros:

```powershell
node scripts/ia/diagnosticarGemini.js --configuracion
node scripts/ia/diagnosticarGemini.js --modelo
```

El segundo consulta realmente Google. `--generar-una-propuesta` también existe como acción explícita, consume cuota y realiza una generación real; **no volver a ejecutarlo** para el ensayo descrito arriba.
