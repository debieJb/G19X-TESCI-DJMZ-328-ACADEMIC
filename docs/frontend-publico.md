# Frontend público, acceso y registro empresarial

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Renovación implementada y validada localmente. No acredita entrega real de correo,
Gmail, Gemini, HTTPS productivo ni el cierre global del MVP. No se modificaron
credenciales, `.env`, datos preexistentes o configuración del replica set.

## Experiencia y recursos compartidos

Identidad PluriOne con tipografía del sistema, fondos blancos/grises muy claros,
azul marino, acentos morados y degradados azul-violeta. Tarjetas blancas, bordes
sutiles, sombras suaves, radios y espaciado compartidos. Inicio presenta propuesta de valor, funciones
disponibles/pendientes, recorrido de alta y acciones reales. La ilustración de
producto está marcada como tal y no contiene métricas, testimonios ni datos reales.

Encabezado con menú móvil, navegación por teclado/Escape, enlace de salto y footer
compartidos. `_headPublico.ejs` centraliza metadatos y recursos de origen propio.
`publico.css` queda limitado al frontend público, con estados hover/focus/active,
controles de tamaño táctil, diseño adaptable y respeto de movimiento reducido.
No se añadieron dependencias, fuentes, imágenes o scripts de terceros. La familia
de iconos SVG de `_icono.ejs` se utiliza en funciones, inputs, estados y gráficos.
La vista ilustrativa del dashboard no contiene métricas ni actividad inventadas.

Login usa una composición dividida: panel de identidad con degradado y elementos
tecnológicos ligeros a la izquierda; formulario blanco a la derecha. Se convierte
a una columna en móvil. El onboarding usa una sola tarjeta central con indicador
de los tres pasos del backend, sin añadir etapas funcionales ficticias. Los estados
comparten iconos, acciones y el mismo sistema de diseño. Los paneles de administrador
empresarial y operador reutilizan cabecera, recursos y colores claros, conservando
datos y permisos existentes. Las tablas móviles tienen desplazamiento contenido,
región etiquetada y foco por teclado para evitar cortar nombres en columnas estrechas.

Esta dirección se implementó a partir de la descripción recibida. Las cuatro imágenes
elegidas en ChatGPT no están adjuntas al hilo y no se afirma comparación píxel a píxel.

`publico.js` es una mejora progresiva: sin JavaScript siguen funcionando los enlaces,
formularios POST, validación nativa y CSRF. Los botones mostrar/ocultar y el menú
colapsado aparecen solo cuando se instala su comportamiento. Con JavaScript se
validan campos obligatorios, correo, bytes/complejidad de contraseña y confirmación;
errores identifican campos, resumen accesible y foco. Durante el POST se muestra
carga y se bloquea el envío repetido. `pageshow` restablece el formulario y oculta
contraseñas al volver desde el historial. Nunca se guardan en almacenamiento web.

## Rutas y estados

| Ruta | Comportamiento |
|---|---|
| `GET /` | Inicio, producto, cómo funciona, acceso/registro y footer. |
| `GET/POST /login` | Formulario, errores genéricos, CSRF, límites persistentes, regeneración y redirección fija a `/panel`. |
| `POST /logout` | Destruye sesión con CSRF; GET no cierra sesión. |
| `GET/POST /registro` | Empresa y correo sin contraseña inicial; respuesta 202 genérica y solicitud recibida. |
| `GET /registro/estado` | Verificación pendiente solo después de una solicitud en esa sesión; no confirma cuentas, envío ni recepción. |
| `GET/POST /registro/reenviar` | Solicitud de reenvío, respuesta genérica, CSRF y límites existentes. |
| `GET /registro/verificar?token=…` | Guarda solo hash en sesión y redirige a URL limpia; no consume. |
| `GET /registro/verificar` | Consulta estado persistido antes de mostrar confirmación. Caducado/inválido no ofrecen formulario de consumo. |
| `POST /registro/verificar` | Revalida vigencia y consume atómicamente con CSRF; regenera sesión y vincula configuración. |
| `GET /registro/administrador` | Verificación exitosa y formulario solo si el permiso persistido pertenece a esa sesión y sigue vigente. |
| `POST /registro/administrador` | Creación transaccional, contraseña validada/bcrypt, registro completado; no inicia sesión automáticamente. |
| `GET /panel` | Requiere usuario activo; el backend resuelve el panel por rol y empresa persistidos. |

Las pantallas cubren solicitud, recibida, pendiente, confirmación, verificación
exitosa/configuración, completada, enlace inválido, caducado, usado y sesión de
configuración caducada. No se elige el estado mediante parámetros de URL.

Un enlace usado se identifica como tal solamente cuando ese navegador conserva
evidencia de consumo. El hash del token se elimina de la solicitud al verificar;
en otro navegador o sin evidencia se muestra **enlace no disponible**, explicando
que puede ser inválido, caducado o utilizado. No se inventa una causa específica ni
se crea un registro recuperable de tokens. La sesión de configuración vuelve a
validarse en GET y POST; abrir su URL no concede permisos.

La respuesta de solicitud/reenvío no revela si existe una cuenta. La pantalla
pendiente no consulta ni publica estado de un correo concreto. Se conserva el
mensaje de transporte deshabilitado, sin afirmar entrega. No se puede generar o
consumir un token normal a través de un bypass de desarrollo.

## Defectos corregidos

- El formato del token bastaba para mostrar una confirmación: ahora se consulta
  vigencia real sin consumir y se revalida antes del POST atómico.
- La vista de administrador solo exigía ID de sesión: ahora comprueba vínculo,
  estado y caducidad persistidos antes de presentar el formulario.
- Logout empresarial no exigía CSRF: se reutiliza `campanaCsrf` y se incorpora a sus
  formularios. Superadministrador conserva su protección independiente.
- Mensajes de datos iniciales mencionaban contraseñas que no pertenecían al paso:
  se separó su explicación de la configuración de administrador.
- La interfaz no distinguía solicitud recibida de entrega: ahora declara sus
  límites y el estado pendiente sin revelar cuentas.
- Añadidos carga, bloqueo de dobles envíos, mostrar/ocultar, validación de bytes y
  coincidencia, restablecimiento al volver y estados responsivos.
- Corregida la disposición de la marca y compactado el recorrido de alta en móvil
  después de inspeccionar capturas reales.

No hay recuperación de contraseña implementada. No se muestra un enlace a una
ruta inexistente; no se agregó un mecanismo alternativo de acceso inseguro.

## Archivos de esta renovación

- Vistas: `views/index.ejs`, `login.ejs`, `registro.ejs`, `panel.ejs` y formularios de
  logout en `views/empresa/panelAdmin.ejs` y `panelOperador.ejs`.
- Componentes: `_headPublico`, `_encabezadoPublico`, `_encabezadoEmpresa`, `_piePublico`,
  `_icono`, `_erroresFormulario`, `_passwordPublico` y `_csrfLogout` en `views/partials`.
- Paneles: `views/empresa/_campanas.ejs` y región accesible de tabla compartida
  `views/admin/_usuarios.ejs`.
- Recursos: `public/css/publico.css` y `public/js/publico.js`.
- Backend: `controllers/registroPublicoController.js`,
  `services/autoservicioEmpresarialService.js`, `routes/registroPublicoRoutes.js` y
  `routes/authRoutes.js`.
- Pruebas: `tests/publicas.http.test.js`, `auth.http.test.js`,
  `autoservicio.http.test.js`, `tests/soporte/publicoNavegador.cjs` e integración
  `pruebas-integracion/autoservicioEmpresarial.js`.
- Documentación: este informe y enlace desde README. Se conservan los cambios
  anteriores de Gmail transaccional y `.env.example`.

## Resultados ejecutados

| Suite | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| General `node --test` | 627 | 0 | 0 |
| Autoservicio MongoDB | 21 | 0 | 0 |
| Registro empresarial MongoDB | 14 | 0 | 0 |
| Campañas MongoDB | 2 | 0 | 0 |
| Cuotas MongoDB | 8 | 0 | 0 |
| Motor Gmail con persistencia real y transporte simulado | 34 | 0 | 0 |
| Infraestructura/sesiones MongoDB | 12 | 0 | 0 |
| Navegador explícito (fuera del descubrimiento general) | 1 | 0 | 0 |

Integraciones: **91/91**. Se crearon y eliminaron exactamente 91 bases temporales
nuevas de esta ejecución, bajo guardia de inventario, destino, propiedad y marcador.
Las dos fixtures preexistentes se conservaron intactas. Huellas de datos/índices de
estas bases, referencia del principal 27017 y configuración/opciones de 27018
coinciden antes/después. No se ejecutaron migraciones ni reconfiguraciones.

Edge headless: **130 comprobaciones**, **22 capturas completas**, sin errores JS
detectados ni solicitudes de página externas. Anchos: 1440, 768, 390 y 320 píxeles.
Se comprobaron estructura/etiquetas, ausencia de desbordamiento, menú/Escape/foco,
mostrar/ocultar, validación, doble envío, enlaces y anclas, estados de verificación,
contraseñas diferentes, registro, login incorrecto/correcto, panel, logout y sesión
perdida. También se comprobó el formulario con ejecución JavaScript deshabilitada.

El navegador usa **dobles aislados**, `NODE_ENV=test`, contexto de Node test, servidor
loopback efímero y perfil temporal. No carga `.env`, prohíbe conexiones MongoDB y
proveedores y bloquea solicitudes de página fuera del servidor. Las pruebas MongoDB
reales son una ejecución independiente. No se atribuye persistencia real a la prueba
de navegador ni se atribuye servicio Google real a ninguna de las dos.

También se comprobaron tema claro, composición dividida, tarjeta central, contraste
del texto/botón/borde de input de login y paneles de ambos roles. Se revisaron
visualmente capturas de inicio escritorio, login escritorio/móvil, registro móvil,
verificación pendiente y panel empresarial escritorio/móvil. Son comprobaciones locales de accesibilidad básica; no se
presentan como certificación o auditoría WCAG integral ni prueba de todos los dispositivos.

## Revisión local segura

1. Desde la raíz, ejecutar `npm.cmd test` para la suite general, sin proveedores.
2. Para revisar manualmente, usar `npm.cmd run dev` con el entorno privado existente
   y transporte transaccional, campañas y Gemini apagados. No arrancar otra instancia
   en un puerto ocupado; conservar el proceso existente o usar un puerto libre
   mediante la variable `PORT`. No cambiar secretos para esta revisión.
3. Abrir `/`, `/login`, `/registro` y `/registro/reenviar`. El registro completo normal
   exige MongoDB transaccional, índices y sesiones provisionados. El standalone
   principal no es un sustituto y los fallos de infraestructura deben seguir cerrados.
4. Sin correo autorizado, solo es posible solicitar y consultar estado pendiente en
   la plataforma normal. No fabricar tokens ni apuntar la aplicación a las fixtures.
5. Para repetir la inspección de navegador en Windows con Edge instalado:

   ```powershell
   $env:NODE_ENV = 'test'
   node --test --test-reporter=tap tests/soporte/publicoNavegador.cjs
   ```

   Usa un proceso de terminal dedicado a pruebas; el script imprime la ruta temporal
   de capturas y `report.json` y cierra sus propios procesos. Si Edge está en otra
   ruta, definir `PUBLIC_BROWSER_EXECUTABLE`. No se añade un servidor de prueba al
   arranque normal de la plataforma.
6. Las integraciones explícitas solo se repiten bajo la autorización de fixtures
   nuevas y verificadas; no usar un comando de limpieza basado únicamente en prefijos.

Pendiente externo: autorizar Gmail, habilitar un envío concreto y comprobar recepción
y recorrido real en infraestructura dedicada. Consultar [Gmail transaccional](gmail-transaccional.md).
No se detectaron defectos críticos/altos pendientes de esta renovación en la validación
local ejecutada. No se declara terminado el MVP ni validado el correo productivo.
