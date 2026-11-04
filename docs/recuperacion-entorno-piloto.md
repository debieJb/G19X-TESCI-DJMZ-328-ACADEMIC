# Recuperación del entorno piloto existente

El iniciador `scripts/iniciarMongoDevRsExistente.ps1` arranca exclusivamente la
instancia existente `marketingDevRs`, en loopback y puerto 27018, con el directorio
autorizado que define `scripts/mongoDevRsComun.js`. No es un instalador universal.
Solo debe ejecutarse en el equipo previamente preparado y con datos existentes.

El diagnóstico del arranque original detectó un cambio de PID del servicio
standalone tras un reinicio. Las huellas de configuración, datos e índices
coincidían con la referencia autorizada. La recuperación añadió una reconciliación
de esa transición concreta, conservando la referencia histórica y la v2, sin
aceptar automáticamente futuros reinicios o diferencias de datos.

La referencia v3 incluye identidad del servicio, fecha de creación del proceso,
listener, rutas y huellas del ejecutable y configuración. Es un archivo privado
del equipo, excluido de Git junto al expediente de revisión. El validador fija su
SHA-256 y compara la identidad del servicio antes y después de leer las huellas.
Ausencia o cambio de esa referencia bloquea el procedimiento. No se debe generar
otra, cambiar su huella o editar PIDs para conseguir que pase una comprobación.

Un clon del repositorio no contiene ese expediente privado ni el baseline situado
fuera del proyecto; por tanto, estos scripts no habilitan automáticamente MongoDB
en otra máquina. El responsable debe custodiar el expediente por un canal privado
autorizado. No publicar archivos de datos, credenciales, logs o referencias locales.

En el equipo autorizado, con el nodo apagado y puerto libre:

```powershell
.\scripts\iniciarMongoDevRsExistente.ps1
node scripts/verificarMongoDevRs.js --verificar
npm run dev:piloto
```

El nuevo iniciador exige WiredTiger existente y utiliza solo `--verificar`, sin
preparación inicial ni inicialización del replica set. Mantiene controles de ruta,
puerto, bind, identidad, miembro único y PRIMARY. No reinstala, migra, borra locks
ni modifica `.env`. Si MongoDB ya está activo, verificarlo sin arrancar otro nodo.
Si falla una comprobación, detenerse y revisar; no usar el modo de inicialización,
reconfigurar el replica set ni suprimir controles. El arranque normal del motor
escribe sus logs y archivos operativos.

El lanzador de IA y su alcance empresarial se describen en el
[manual técnico](entrega/manual-tecnico.md#41-arranque-del-mvp-piloto-con-ia).

## Estado de recuperación de contraseñas

Las pruebas de regresión recorren la ruta HTTP, controlador, servicio y fábrica
SMTP, sustituyendo MongoDB y el transporte de red. Comprueban despacho directo con
el trabajador apagado, la plantilla correcta de recuperación, token temporal y
hash, respuesta pública genérica y persistencia sanitizada de un rechazo AUTH.
Estas pruebas no acreditan recepción real. El envío auténtico de recuperación
sigue pendiente de resolver; cualquier ensayo real requiere autorización separada.
