> **Antecedente histórico.** Texto del corte funcional `78c7434`, conservado para trazabilidad. Sus afirmaciones de estado y pendientes no describen la entrega documental actual. Consulte el [índice vigente](../../entrega/indice-entrega.md). Las rutas de enlaces se adaptaron a esta ubicación.

# Asistente de campañas IA · PluriOne

## Estado y uso

Implementado en `/empresa/ia`, accesible desde «Crear campaña con IA» del panel de administrador empresarial y operador. Solo email forma parte del MVP. No hay proveedor configurado en el entorno revisado: la generación real permanece deshabilitada, el botón se desactiva y los POST directos fallan sin respuesta ficticia. No se compraron servicios, se crearon claves ni se activó facturación.

El formulario ofrece instrucciones libres, indicaciones adicionales y un bloque original intocable. Las preferencias estructuradas son opcionales. Antes de remitir texto a Gemini exige confirmación de privacidad. Producto y nombre de campaña se mantienen locales salvo que la persona los escriba dentro de sus instrucciones. No se consultan ni remiten contactos. Imágenes PNG se conservan localmente, también pueden añadirse desde el borrador. El flujo estructurado anterior sigue compatible para solicitudes históricas. Véase [flujo conversacional, límites y privacidad](../../ia-instrucciones-libres.md).

La propuesta incluye asunto, mensaje, llamada a la acción y sugerencias de segmentación. Es texto no ejecutable y se muestra escapado en EJS. No se permiten herramientas ni acciones del modelo. La persona revisa y edita el resultado antes de pulsar «Guardar como borrador».

El guardado reutiliza `campanaController.crearCampana`, sus relaciones empresariales, listas blancas y el modelo Campana. Fuerza email/borrador, une mensaje y llamada a la acción y consume la propuesta de sesión con caducidad de 30 minutos. Guarda las selecciones y sugerencias como notas de asistencia, sin aplicarlas a contactos. El borrador asistido no preselecciona destinatarios. La aprobación usa hash e índice único por empresa para impedir duplicados concurrentes y redirige a Configurar automatización. Generar o aprobar nunca ejecuta campañas, llama n8n ni envía correo. Si falla el guardado, el controlador existente muestra su formulario de recuperación manual.

«Generar otra propuesta» usa de nuevo el servicio real y las cuotas persistentes, conserva el contexto local y reemplaza el ticket de aprobación solo cuando tiene éxito. Si falla o está deshabilitado mantiene la propuesta anterior y muestra el error, sin fabricar otra respuesta.

## Arquitectura

- `services/iaService.js`: autorización persistida, generación y personalización local, independiente del transporte.
- `services/ia/proveedores.js`: registro explícito de adaptadores reales; añadir proveedores aquí sin cambiar el flujo de negocio. Nunca selecciona un proveedor simulado mediante configuración.
- `services/ia/geminiProveedor.js`: adaptador REST real de Gemini GenerateContent, sin dependencias nuevas, host fijo y modelo configurado.
- `services/ia/contratoIA.js`: catálogo, contrato de entrada/salida y frontera de privacidad; también se valida el contexto en el transporte.
- `services/ia/limitesIA.js` y `models/UsoIA.js`: cuotas locales persistentes sin prompts, contactos o resultados.
- `controllers/iaController.js`, `routes/iaRoutes.js` y vistas empresariales: CSRF de sesión separado, revisión y guardado.

Las rutas consultan rol, asociación, estado de acceso y empresa desde la base. Admin_empresa y operador solo actúan en su propia empresa activa. Pendientes y bloqueados no pueden usar el asistente; documentos históricos sin metadatos mantienen compatibilidad sin presentarlos como verificados. Superadmin no utiliza esta función empresarial. Los estados del registro pendiente se respetan sin modificar la fase de registro ni sus archivos.

## Configuración para activar un proveedor real

Los nombres siguientes están documentados en `.env.example`. El `.env` real no fue modificado.

```dotenv
AI_ENABLED=false
AI_PROVIDER=gemini
AI_FREE_TIER_CONFIRMED=false
AI_MODEL=
GEMINI_API_KEY=
```

Para activar después de autorización:

1. Disponer de una clave real de Gemini Developer API de un proyecto autorizado **sin facturación activada**, con acceso a un modelo que tenga nivel gratuito en la cuenta/región. Gmail OAuth y una sesión de ChatGPT o Gemini no proporcionan esta clave.
2. Consultar la disponibilidad y cuota reales en Google AI Studio. Configurar `GEMINI_API_KEY` privadamente y `AI_MODEL` con el identificador exacto del modelo compatible con salida JSON estructurada. No hay modelo por defecto ni fallback automático a modelos pagados.
3. Revisar las condiciones del nivel gratuito. Google indica que ciertos usos gratuitos pueden utilizar contenido para mejorar sus productos. El texto libre exige advertencia y confirmación explícita; no debe contener datos personales, secretos ni información empresarial sensible. El filtro local no es exhaustivo.
4. Confirmar manualmente que la cuenta/proyecto sigue en nivel gratuito y establecer `AI_FREE_TIER_CONFIRMED=true`. Esta variable es una confirmación administrativa, **no una verificación del estado de facturación en Google**. El código no activa facturación ni puede garantizar el plan de una clave suministrada por el operador.
5. Revisar el almacén de cuotas autorizado. UsoIA ahora usa exclusivamente una conexión independiente de desarrollo, con autoIndex/autoCreate deshabilitados, marcador y IDs ficticios; nunca crea estructuras en el standalone. No admite cuotas de empresas reales. Para la primera generación empresarial se requiere un backend permanente protegido y autorizado por separado. Véase [almacén de cuotas y futura producción](../../cuotas-ia-desarrollo.md). Campana también deshabilita autoIndex/autoCreate y falla cerrado si falta su índice de aprobación.
6. Establecer `AI_ENABLED=true` y reiniciar Express. Probar explícitamente una generación real sin datos sensibles, revisar la respuesta y guardar un borrador. Esa llamada aún no se realizó.

Documentación oficial: [GenerateContent](https://ai.google.dev/api/generate-content), [salidas estructuradas](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [claves](https://ai.google.dev/gemini-api/docs/api-key), [precios y condiciones del nivel gratuito](https://ai.google.dev/gemini-api/docs/pricing).

## Límites y errores

Tres intentos por minuto y veinte por día UTC por empresa, compartidos entre usuarios y sesiones. Las reservas cuentan aunque el proveedor falle; no se reintenta automáticamente. Las ventanas usan incrementos atómicos e índice único; TTL solo limpia ventanas antiguas. Además se admite una generación simultánea por empresa y dos globales por proceso. Para varias instancias se necesita un semáforo distribuido; las cuotas persistentes sí se comparten.

Transporte: timeout de 15 segundos, salida máxima 1400 tokens, respuesta HTTP máxima 32 KiB, redirecciones deshabilitadas, clave en cabecera y endpoint fijo. Salida local limitada, como máximo cinco sugerencias, sin HTML, enlaces ni tool calls. Errores, rechazos y cuotas se convierten en mensajes fijos; no se registran prompts, respuestas completas, excepciones del proveedor ni claves. Los contenidos siguen requiriendo revisión humana: un JSON válido no garantiza exactitud comercial.

## Pruebas

```powershell
npm.cmd test
node --test pruebas-integracion/registroEmpresarial.js
```

Las pruebas IA usan un proveedor simulado claramente etiquetado y transporte interceptado; no usan claves reales ni conectan proveedores. Cubren privacidad del payload, autorización, aislamiento, CSRF, estados pendientes, cuotas, contrato, límites de tamaño, errores, escape HTML, propuesta caducada y guardado mediante el controlador actual. No se modifica MongoDB original para probar IA. Las pruebas de integración del registro siguen utilizando exclusivamente bases ficticias del replica set existente.

Resultado de esta implementación: 435/435 pruebas de la suite habitual (402 previas y 33 nuevas de IA), más 14/14 pruebas reales del registro empresarial en bases ficticias: 449 aprobadas, cero fallos y cero omitidas. La comparación del standalone confirmó mismas huellas de datos, índices, configuración y proceso. No se realizó una generación real: proveedor pendiente de configuración/autorización. Los cambios sin commit del registro empresarial se conservaron.

La ampliación posterior del flujo está documentada en `docs/flujo-campanas-integrado.md`, que contiene los resultados y la incidencia de infraestructura más recientes; los números anteriores corresponden a la primera implementación del asistente.
