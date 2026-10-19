# Activación segura de Gemini: revisión pública del 14 de octubre de 2026

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Actualización 2026-10-18: se identificó el bloqueo de cuotas y se comprobó una generación auténtica con la clave y el modelo configurados. Consultar el [diagnóstico vigente y la prueba desde el navegador](gemini-nickki-diagnostico-2026-10-18.md). El texto inferior conserva la evidencia histórica de la revisión anterior.

No se utilizaron credenciales en consultas externas, no se generó contenido real y
no se modificaron .env, facturación, bases de datos ni índices. Los cambios previos
y el bloqueo universal de envíos se conservan.

## Clave

El validador anterior solo admitía letras, números, guiones y guiones bajos.
Google documenta claves estándar y claves de autorización; las nuevas claves de
AI Studio son de autorización desde el 28 de mayo de 2026. Google no establece en
la guía una expresión regular universal ni garantiza un prefijo único.

Se permite ahora el punto como separador de segmentos no vacíos, conservando el
límite local de 20..200 caracteres y rechazando espacios, controles, comillas, URL,
Unicode y segmentos vacíos. No se recorta ni transforma el secreto. Este límite
es política de la aplicación, no una especificación oficial de longitud de Google.
La comprobación privada detectó una clave compatible con esta estructura y sin
espacios ni controles: el rechazo anterior se debía a la validación local demasiado
restrictiva. No se comprobó autenticidad, revocación, restricciones ni integridad
de la copia en Google, por lo que no se garantiza que esa clave funcione.

## Modelo y configuración propuesta

Modelo recomendado para la primera prueba: `gemini-3.5-flash-lite`.
Alternativa pública: `gemini-3.8-flash`. Ambos aparecen con salida estructurada y
entrada/salida gratuitas en Standard; la disponibilidad y cuota particulares de
la cuenta y región requieren revisión manual en AI Studio. No hay fallback.
Los modelos 2.5 continúan publicados pero Google restringe su acceso a usuarios
que ya los utilizaban. No recomendamos 2.5 para este proyecto nuevo.
El identificador anteriormente seleccionado, gemini-3.7-flash, no figura en las
tablas consultadas; no se sustituyó automáticamente.

Configuración objetivo, solo después de completar las comprobaciones manuales:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-3.5-flash-lite
AI_FREE_TIER_CONFIRMED=true
AI_ENABLED=true
```

Conservar la clave privada existente si corresponde a la del proyecto autorizado.
No pegar credenciales en chats, comandos, ejemplos o pruebas. Mantener ambas
banderas desactivadas mientras los requisitos siguientes sigan pendientes.

## Comprobaciones antes de habilitar

1. En AI Studio revisar que la clave esté activa, corresponda al proyecto elegido
   y tenga acceso a Generative Language API. Google rechaza claves estándar sin
   restricciones. No habilitar facturación para esta prueba.
2. Confirmar que el proyecto está en nivel gratuito y tiene cuota disponible para
   el modelo recomendado. La presencia del modelo en documentación pública no
   garantiza acceso individual. Revisar condiciones de tratamiento de datos: el
   contenido del nivel gratuito puede usarse para mejorar productos. El nuevo flujo
   remite instrucciones libres y propuesta editada solo tras confirmación explícita;
   no incorpora contactos ni datos empresariales automáticamente. Véase
   [privacidad del flujo de instrucciones](ia-instrucciones-libres.md).
3. Autorizar por separado el entorno persistente de cuotas reales. La fase de
   desarrollo ya eliminó UsoIA.init(), deshabilitó DDL automático y separó la conexión,
   pero admite exclusivamente fixtures. No es almacenamiento de empresas reales y
   no habilita su generación. Véase [cuotas aisladas y backend real pendiente](cuotas-ia-desarrollo.md).
4. Elegir manualmente el modelo, confirmar el nivel gratuito, habilitar IA y
   reiniciar Express solamente cuando se autorice la primera generación real.
5. Usar Crear campaña → Asistida por IA con datos ficticios o genéricos. Revisar
   una sola propuesta; regenerar consume otra solicitud. Guardar crea un borrador,
   nunca autoriza envíos. Los envíos de campañas permanecen bloqueados.

## Controles revisados

La fábrica real exige proveedor conocido, ambas banderas exactamente `true`, clave
estructuralmente válida y modelo seguro para la ruta. No hay valores por defecto.
`disponible()` no autentica ni consulta Google: solo verifica estructura local.
El nombre del modelo validado no acredita su existencia ni gratuidad; la confirmación
del nivel gratuito es administrativa, no una consulta de facturación.

Antes de generar, el servicio revalida usuario/rol/empresa persistidos, estado de
acceso y activación, entrada de catálogo, concurrencia y cuota persistente. Las rutas
mantienen CSRF. El transporte usa HTTPS fijo, secreto exclusivamente en cabecera,
sin redirecciones ni reintentos. La respuesta exige JSON estructurado, STOP y texto,
con límites y errores seguros. El esquema responseSchema utilizado sigue documentado
en GenerateContent, aunque Google lo marca obsoleto y recomienda responseFormat para
futuras migraciones. No fue necesario cambiar el contrato de transporte en esta fase.

Resultado local: 482/482 pruebas aprobadas (474 anteriores más 8 regresiones de
configuración), cero fallos y cero omisiones. Las llamadas de transporte IA en
pruebas están interceptadas; no se utilizó la clave real. Las 16 integraciones
de MongoDB de la fase anterior no se repitieron para esta corrección local y conservan
su último resultado aprobado; no se ejecutaron operaciones contra MongoDB.

## Fuentes oficiales

- [Claves y transición a authorization keys](https://ai.google.dev/gemini-api/docs/api-key).
- [Modelo 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
- [Modelos con salida estructurada en GenerateContent](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
- [Precios y nivel gratuito](https://ai.google.dev/gemini-api/docs/pricing).
- [Referencia REST y GenerationConfig](https://ai.google.dev/api/generate-content?hl=en).
- [Restricciones de acceso a 2.5](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite).
