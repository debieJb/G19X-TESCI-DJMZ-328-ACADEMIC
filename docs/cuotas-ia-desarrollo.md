# Cuotas IA persistentes: almacén de desarrollo aislado

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


## Alcance

UsoIA no se registra en mongoose.connection ni utiliza MONGODB_URI. Su fábrica
solo compila modelos sobre conexiones independientes con base ma_ia_test_<32 hex>.
El adaptador únicamente acepta NODE_ENV=development o test. Sin configuración
explícita falla cerrado; producción no tiene un backend autorizado en esta fase.

El destino se construye en código: 127.0.0.1:27018, marketingDevRs, conexión directa.
Se comprueban host y puerto reales del cliente, getCmdLineOpts, bind loopback, dbPath
autorizado, miembro único y PRIMARY usando el validador existente. No se admite una
URI proporcionada por el cliente ni fallback a la conexión principal de Express.

Este almacén NO permite cuotas de empresas reales. Solo admite los dos IDs generados
por el aprovisionador, con prefijo reservado f17e1a y declarados en el marcador de
fixtures. No se copian empresas ni usuarios; los IDs de fixtures no representan
documentos empresariales existentes. Un administrador real de Express seguirá
recibiendo un error seguro al intentar consumir cuotas con su empresa actual.
Esto todavía NO habilita la primera generación real empresarial desde el navegador.

## Aprovisionamiento explícito

```powershell
$env:NODE_ENV='development'
node scripts/prepararCuotasIADev.js --crear-fixture
```

No lee .env. Genera una base nueva y rechaza colisiones, verifica la integridad del
standalone y la identidad del replica set antes de escribir. Crea control con un
marcador de propiedad aleatorio, versión, propósito, base e IDs exclusivamente
ficticios. Relee el marcador antes de crear explícitamente usoias y sus índices:

- `_id_`, generado al crear la colección.
- `empresa_1_ventana_1`, único, sin sparse ni filtro parcial.
- `expiraEn_1`, TTL expireAfterSeconds=0, sin filtro parcial ni sparse.

autoCreate, autoIndex y bufferCommands están deshabilitados en esquema y conexión.
El consumo ya no llama a UsoIA.init(). Verifica identidad, marcador, pertenencia
del ID ficticio e índices en cada operación. Si falta colección o índice, o hay uno
inesperado, rechaza sin reparar. No existe una ruta HTTP de aprovisionamiento.

El comando emite solo metadatos de fixtures, no credenciales. El marcador identifica
propiedad y evita accidentes; NO es un mecanismo de autenticación ni un secreto.
La instancia local de desarrollo no sustituye controles de acceso de producción.

## Fixture conservada y persistencia

`docs/cuotas-ia-dev-fixture.json` identifica la base creada en esta fase. Contiene
solo metadatos ficticios, sin contraseñas, tokens, claves API ni empresas reales.
Configurar esas variables exclusivamente en un proceso de pruebas:

```powershell
$cuotasFixture = Get-Content -Raw docs/cuotas-ia-dev-fixture.json | ConvertFrom-Json
$env:NODE_ENV='development'
$env:AI_QUOTA_DEV_DB=$cuotasFixture.base
$env:AI_QUOTA_DEV_MARKER=$cuotasFixture.marca
node scripts/verificarPersistenciaCuotasIADev.js --verificar $cuotasFixture.empresas[0]
```

No modifica .env. La fixture conservada tiene un contador ficticio saturado de tres
intentos en una ventana fija de enero de 2030 para probar reinicios sin depender del
reloj o del monitor TTL. No es una cuota activa de un cliente real. `--llenar` se usa
una sola vez sobre una fixture vacía; `--verificar` es repetible y comprueba el rechazo
por límite. Para otra prueba independiente crear una nueva fixture explícitamente.

Se probó cierre/reapertura de conexión, nuevo proceso Node y apagado ordenado seguido
de arranque del replica set con los scripts existentes. Se verificaron identidad antes
y después, estado PRIMARY y conservación del contador y del rechazo por cuota. El
primer arranque no permaneció activo dentro del sandbox; repetir el arranque fuera
del sandbox permitió escribir en el directorio autorizado independiente. No se
repararon datos, no se reinicializó el replica set ni se detuvo Express, n8n o MongoDB
standalone. No ejecutar -Preparar sobre el directorio ya existente.

## Pruebas

```powershell
npm.cmd test
node --test pruebas-integracion/registroEmpresarial.js pruebas-integracion/campanasFlujo.js pruebas-integracion/cuotasIADev.js
```

Las integraciones crean bases distintas, con marcador propio, y solo las eliminan
tras verificar identidad, nombre y marcador. Los casos de índices/colección ausentes
eliminan estructuras únicamente en sus bases ficticias recién creadas, para demostrar
que el consumidor no las reconstruye. Las 16 integraciones anteriores siguen usando
ma_tx_test_* y su limpieza existente. Nunca se modifican índices del standalone.

Resultado de esta fase: 501/501 pruebas habituales y 24/24 integraciones reales
(16 anteriores más 8 de cuotas), sin fallos ni omisiones. Se verificó además la
persistencia tras el reinicio real y ordenado del replica set. El monitor TTL no
se esperó para observar borrados: se verificaron su definición exacta y la fecha
de expiración escrita; la fixture de persistencia usa fechas futuras deliberadamente.
La comparación final del standalone conservó PID, configuración, datos e índices.

## Almacén futuro para empresas reales: autorización independiente pendiente

1. Definir una base de cuotas permanente, protegida y separada, con autenticación,
   TLS, controles de red, respaldo/restauración y supervisión. No reutilizar esta
   base ni sus marcadores/IDs ficticios. No migrar los contadores de las pruebas.
2. Implementar un adaptador real separado, seleccionado explícitamente. Debe conservar
   la autorización empresarial persistida y admitir IDs reales únicamente en ese
   adaptador. No convertir la ausencia del almacén real en fallback a desarrollo.
3. Separar la cuenta de aprovisionamiento con permisos DDL de la cuenta de ejecución
   limitada a lecturas e incrementos/upserts en la colección. Mantener autoCreate y
   autoIndex deshabilitados y revisar índices con una operación administrativa aprobada.
4. Definir retención TTL, ventanas UTC, cuotas por empresa y política de cambios de
   límites. Los intentos fallidos pueden consumir cuota; una denegación diaria puede
   incrementar la ventana por minuto previamente, sin permitir superar el máximo.
5. Probar concurrencia entre instancias, cortes de red, restauración, cambio de día
   y recuperación. Las cuotas persistentes se comparten; el límite de simultaneidad
   actual de una llamada/empresa y dos/global es por proceso y requiere un semáforo
   distribuido para varias instancias de la aplicación.
6. Autorizar configuración y credenciales nuevas por un mecanismo seguro, sin
   publicarlas. Verificar integridad del standalone, activar el backend real y solo
   entonces plantear una generación Gemini real. AI_ENABLED no habilita ese backend
   ni elimina el bloqueo universal de envíos de campañas.
