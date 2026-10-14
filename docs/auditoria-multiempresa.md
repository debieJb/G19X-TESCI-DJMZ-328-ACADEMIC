# Auditoría de contactos y destinatarios

La revisión abarca modelos, índices declarados, controladores, rutas, permisos y servicios. No utiliza credenciales ni conecta a MongoDB o n8n desplegados.

## Hallazgos y correcciones

- Contactos asignaba una empresa string a `$where`. Mongoose aplica ese filtro sin convertirlo al BSON ObjectId, lo que impedía guardar documentos existentes. Ahora usa el ObjectId persistido sin retirar el filtro de empresa. Las pruebas llaman al save real de Mongoose con una colección simulada que distingue tipos BSON.
- Email permitía ejecutar campañas sin selección de destinatarios y enviaba el payload anterior sin lista autorizada. Se bloquea con 422 incluso para superadmin; los documentos permanecen sin migración ni borrado. Configurar destinatarios de una empresa válida permite ejecutar.
- Los conflictos de versión al guardar contactos muestran 409 y un mensaje genérico.

No se reprodujo acceso a contactos ajenos mediante IDs, empresa/rol manipulados, queries o cuerpos HTTP. Las rutas requieren autenticación y empresa válida, fijan empresa/autor al crear y consultan por ID más empresa al editar/eliminar. Superadmin conserva su excepción global; al resolver destinatarios se utiliza siempre la empresa persistida de la campaña.

Los índices únicos parciales `{ empresa: 1, email: 1 }` y `{ empresa: 1, telefono: 1 }` separan la unicidad por empresa. Email se normaliza con trim y lowercase. Su existencia efectiva y posibles índices globales heredados deben comprobarse en el despliegue mediante una lectura de índices; no se modificaron índices o datos reales. Las pruebas de duplicados simulan la restricción, por lo que no sustituyen esa comprobación.

## Contrato con Gmail/n8n

El backend envía un POST JSON con el contenido persistido y `destinatarios`, `totalDestinatarios`, `tipoDestinatarios`. La lista se recalcula con empresa, selección y estado activo. Las pruebas con un servidor HTTP local cubren los tres modos y los tres roles, incluyendo el mismo email en dos empresas, IDs ajenos almacenados, etiquetas compartidas y contactos inactivados. El cuerpo HTTP no puede sustituir la selección.

Para respetar la selección, el workflow debe tomar la lista recibida `body.destinatarios`, procesar cada entrada y alimentar el destinatario de Gmail con su `email`. Un campo Para fijo, una lista externa o una consulta global no cumple este contrato. También deben revisarse CC y CCO y conservar la relación del contenido de la campaña con cada entrada. Un HTTP 2xx solo confirma recepción, no entrega.

No existe una exportación del workflow en el directorio `workflows/` y no hay una conexión de herramientas a n8n disponible. Por ello no se pudo confirmar si el workflow publicado ya utiliza destinatarios dinámicos. Se necesita su exportación sin secretos o una revisión de solo lectura para resolverlo; no se alteró el workflow ni se enviaron correos reales.

## Pruebas

Ejecutar `npm.cmd test`. Las pruebas mantienen autenticación real de sesión y la validación/save de Mongoose, con persistencia simulada y webhooks locales. No realizan conexiones externas, no cargan .env y no hacen commit.
