# Campañas con instrucciones libres y revisión iterativa

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


## Navegación

1. `/campanas/nueva` mantiene Manual y Asistida por IA; esta última abre `/empresa/ia`.
2. El formulario muestra «¿Qué campaña quieres crear?» obligatorio (4000 caracteres),
   indicaciones adicionales opcionales (1500), texto original intocable opcional
   (1500) y preferencias de catálogo opcionales. Email sigue siendo el único canal.
3. Antes de generar hay que revisar la advertencia y confirmar el envío de texto a
   Gemini. Sin confirmación el servidor rechaza la petición antes de consumir cuota.
4. La propuesta tiene asunto, mensaje, CTA y segmentación orientativa editables.
   «Editar» lleva al mensaje. «Pedir cambios» envía la propuesta actualmente editada
   y nuevas instrucciones obligatorias. «Generar otra propuesta» solicita una variante.
   Ambas acciones requieren una nueva confirmación de privacidad y consumen las mismas
   cuotas persistentes. Solo una respuesta válida reemplaza el ticket de propuesta.
5. «Me gusta / Continuar» guarda exclusivamente un borrador por los controladores
   existentes. Redirige a `/campanas/:id/automatizacion` para elegir destinatarios
   autorizados, añadir o sustituir un PNG local, revisar Gmail y guardar la intención
   inmediata o programada. No se programa ningún trabajo ni se envía ningún mensaje.

## Rutas

- GET `/empresa/ia`: formulario.
- POST `/empresa/ia/generar`: generación inicial.
- POST `/empresa/ia/revisar`: revisión de propuesta actual y cambios nuevos.
- POST `/empresa/ia/regenerar`: variante, conservando requisitos originales.
- POST `/empresa/ia/borrador`: aprobación humana y guardado como borrador.
- POST `/campanas/:id/automatizacion/imagen`: PNG local en borrador propio, con CSRF
  y control de concurrencia por updatedAt. No depende de disponer ya de destinatarios.

## Contrato y protección

Las instrucciones libres llegan realmente a GenerateContent mediante el adaptador
Gemini existente. No se sustituyen por plantillas ni se fabrican resultados si el
proveedor está deshabilitado. Las pruebas usan dobles explícitos; no llamaron a Google.

El mensaje de sistema es fijo. Las instrucciones, propuesta y cambios se serializan
como datos de usuario no confiables, sin herramientas ni capacidad de ejecutar acciones.
La salida requiere JSON, texto plano, límites y validación local. Prompt injection no
se considera resuelto por un filtro de palabras: la defensa es separar instrucciones
de sistema/datos, restringir el contrato y mantener sin capacidades operativas al modelo.
El bloqueo universal de envíos sigue activo en controlador y servicio de email.

El texto intocable es un bloque literal dentro del mensaje. Se comprueba tras cada
generación y otra vez antes de guardar, incluidas ediciones humanas. Si cambia una cifra,
signo, espacio interior o salto de línea, se rechaza la propuesta; no se parchea el
resultado del modelo simulando que lo respetó. Los finales de línea de formularios
se normalizan de CRLF a LF. Los errores mantienen el ticket previo para poder revisar.

Las cuotas siguen siendo 3 solicitudes/minuto y 20/día UTC por empresa; los intentos
que alcanzan el proveedor consumen cuota incluso si la respuesta no conserva el texto.
CSRF, roles admin_empresa/operador, acceso y activación persistidos, empresa y ticket
de sesión con caducidad de 30 minutos se revalidan. No hay historial conversacional
ilimitado: solo se remiten requisitos originales y la última propuesta editada.

## Privacidad y persistencia

Ya no es cierto que ningún texto libre salga del servidor: esto ocurre únicamente
tras confirmación explícita. Se advierte del uso externo y del tratamiento del nivel
gratuito. Se bloquean emails, posibles teléfonos, URLs, patrones de secretos y controles
antes de consumir cuota, también dentro de propuestas editadas en revisiones.
Este filtro no puede detectar todos los nombres, direcciones o información empresarial
sensible; la persona debe revisar y excluirlos. No se incorporan datos empresariales,
contactos, IDs ni secretos automáticamente. No se registran prompts ni respuestas en logs.

Las instrucciones, confirmación y bloque intocable viven en la propuesta de sesión;
no se agregan a los metadatos de Campana. El borrador guarda el contenido aprobado,
CTA, sugerencias y preferencias existentes. La garantía de texto intocable se aplica
al generar/aprobar; la edición manual posterior del borrador conserva su comportamiento
anterior. La imagen nunca llega a Gemini; reutiliza el validador PNG nativo existente.

Se mantienen las precondiciones de activación de Gemini, la revisión administrativa
del nivel gratuito y la autorización del entorno de cuotas. No se cambiaron .env,
credenciales, índices, bases existentes ni workflows. Los 16 casos MongoDB previos
no se repiten en esta tarea para no realizar operaciones de base de datos.

## Resultado de pruebas

`npm.cmd test`: 496/496 aprobadas, cero fallos y cero omisiones. Se conservan los
482 casos previos y se añaden 14: interfaz libre, confirmación, revisión/variantes,
texto intocable, detección básica de datos sensibles, cuotas, permisos, transporte,
recorrido completo y carga de PNG posterior a aprobación. No se hicieron llamadas
reales a Gemini ni envíos de correo. La activación real del proveedor sigue pendiente
de sus requisitos externos; las pruebas no presentan resultados simulados en producción.
