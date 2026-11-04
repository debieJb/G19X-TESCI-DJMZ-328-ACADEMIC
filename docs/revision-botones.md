# Revisión final de botones de PluriOne

Rama: `respaldo-avances-18-oct`. Referencia anterior a la mejora visual: `002e9e5711abda018ae85862a2e5b849f90c1c23`.

## Alcance

La implementación añade `public/css/botones.css`, clases de presentación en 19 plantillas y la carga ordenada de estilos en `_headPublico.ejs` y `_headInterno.ejs`. Este documento registra la revisión. No se modifican JavaScript, rutas, controladores, modelos, autenticación, permisos ni dependencias.

Los botones conservan textos, nombres, identificadores, valores, tipos, destinos, atributos `data-*`, confirmaciones, atributos ARIA y condiciones EJS. Las clases existentes se conservan y se añaden variantes visuales. La hoja compartida se carga después de `styles.css`, `publico.css` y, en páginas internas, `interno.css`.

Archivos visuales incluidos (además de este documento):

```text
public/css/botones.css
views/admin/_usuarios.ejs
views/admin/automatizacionesEditar.ejs
views/admin/empresaDetalle.ejs
views/admin/empresaEditar.ejs
views/admin/empresaNueva.ejs
views/admin/usuarioNuevo.ejs
views/campanas/_destinatarios.ejs
views/campanas/_formulario.ejs
views/campanas/eliminar.ejs
views/contactos/_formulario.ejs
views/empresa/asistenteIA.ejs
views/empresa/gmail.ejs
views/empresa/resultadoIA.ejs
views/empresa/usuarioDetalle.ejs
views/empresa/usuarioEditar.ejs
views/empresa/usuarioNuevo.ejs
views/partials/_envioAutomaticoGmail.ejs
views/partials/_envioCampanaManual.ejs
views/partials/_headInterno.ejs
views/partials/_headPublico.ejs
views/partials/_pilotoGmail.ejs
```

## Fallo preexistente del recorrido simulado de Gmail

`tests/soporte/publicoNavegador.cjs` termina con `ESTADO_NAVEGADOR_NO_ALCANZADO` al esperar «Ejecución encolada», después de autorizar el intento. El fallo se reprodujo tanto con las plantillas modificadas como cargando las plantillas originales de la referencia anterior mediante `ejs.fileLoader` y `git show`, sin alterar archivos locales. Las plantillas originales no incluyen `botones.css`.

La causa está en la preparación del fixture y su expectativa de encolado:

- `obtenerPolitica` se simula con `habilitado: false`, sin modo automático ni límite de destinatarios.
- La campaña sintética tiene estado `borrador` y una selección de contactos vacía; `preparacion.opciones` devuelve `[]`.
- `preparacion.evaluar` no proporciona `permisoEnvio` ni `identidadCoincide`; tampoco se simulan las validaciones de arranque automático o manual que exige la vista.
- Solo se marca `pilotoInfraValidada`. Esto muestra el panel del piloto, pero no elimina los bloqueos que calcula `automatizacionCampanaController.mostrar`.

Esos bloqueos producen `data-bloqueado="true"` en `_pilotoGmail.ejs`. `public/js/pilotoGmail.js` mantiene deshabilitado el botón de encolado, también tras finalizar la autorización. La llamada `.click()` del test sobre ese botón deshabilitado no envía una petición. El diagnóstico en ambos controles observó: casilla marcada, botón deshabilitado, estado «Autorización registrada. Aún no se ha enviado correo.» y **cero peticiones a `/gmail/confirmar`**. No se trata de una respuesta HTTP fallida ni de un fallo causado por CSS.

Se deja sin resolver dentro de esta mejora visual. Corresponde revisar por separado el fixture y el recorrido de piloto que pretende probar, conservando los controles de envío de producción.

## Validación

- Suite pertinente de 12 archivos: **127 pruebas aprobadas**, 0 fallidas, canceladas u omitidas.
- Comparación contra las plantillas originales: los 47 estados renderizados mantienen el mismo DOM fuera de `<head>` al excluir únicamente clases CSS. En todos los casos, `botones.css` aparece una sola vez y como última hoja de estilos. Los 19 archivos EJS de contenido solo difieren en clases CSS.
- Revisión final en Edge headless con fixtures locales: 27 vistas internas y 20 estados públicos a 1440, 768, 390 y 320 px; **1,815 comprobaciones aprobadas**, 206 capturas, sin desbordamientos ni errores JavaScript. Incluye 188 comprobaciones adicionales de carga efectiva de `botones.css`: una sola hoja, con reglas CSS legibles y en último lugar en cada estado y ancho.
- Validación adicional anterior: 41 comprobaciones de teclado, objetivos táctiles, hover, carga, deshabilitados, movimiento reducido y colores forzados; todas aprobadas.
- Recorrido de campaña con transporte simulado: 29 comprobaciones aprobadas; cancelar no envía y consultar el historial no repite el envío simulado.
- `git diff --check` y revisión del contenido preparado: sin errores de espacios, archivos temporales, capturas ni patrones de credenciales detectados.

Las capturas y los perfiles del navegador se guardan fuera del repositorio, en directorios temporales, con datos sintéticos. No forman parte de la publicación. No se cargan credenciales ni se ejecutan operaciones sobre MongoDB, Gmail o Gemini reales para esta revisión.
