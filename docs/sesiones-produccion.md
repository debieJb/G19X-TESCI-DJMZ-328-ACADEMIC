# Sesiones: implementacion y limites actuales

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


El desarrollo local conserva HTTP. Produccion exige un almacen explicito distinto de MemoryStore y un secreto de al menos 32 bytes suministrado por el despliegue. La longitud no acredita entropia; nunca reutilizar fixtures.

Las cookies de produccion usan Secure, HttpOnly y SameSite=Lax. Sobre HTTP no se emite la cookie segura. OAuth y CSRF se mantienen independientes. El proxy solo admite listas explicitas de IP/CIDR; no confianza global ni por numero de saltos. Verificar saneamiento de cabeceras y bloqueo del acceso directo antes de configurarlo.

La fabrica esta separada en appFactory.js. El arranque iniciarWebPiloto.js valida destino dedicado e indices e inyecta MongoSessionStore antes de crear la aplicacion. Este almacen cifra sesiones con AES-GCM, almacena un hash del SID, usa expiracion logica y TTL, touch y revocacion con proteccion frente a escrituras atrasadas. No hace DDL por peticion. Solo el arranque validado permite autorizar y encolar el piloto, manteniendo apagado el transporte web.

Se probo persistencia real en bases temporales de 27018 entre aplicaciones y procesos nuevos, expiracion, logout, alteracion de cifrado y fallos de almacenamiento. HTTPS se simulo mediante cabecera local; esas pruebas no acreditan TLS, disponibilidad ni persistencia del despliegue futuro de piloto.

El almacen nuevo requiere auditoria, claves independientes y estables, rotacion, permisos minimos y politica de retencion. Las tombstones tienen retencion limitada: acotar duracion de peticiones. Falta comprobar login, logout, expiracion, OAuth y CSRF sobre el proxy HTTPS real. MongoDB 27019 esta inicializado, pero no se migraron indices ni se arranco la web del piloto. No se declara produccion lista.

Ver [piloto de un correo](piloto-gmail-un-correo.md) y [cierre tecnico](cierre-tecnico-2026-10-15.md).

Referencias: https://expressjs.com/en/resources/middleware/session/ y https://expressjs.com/en/guide/behind-proxies/.
