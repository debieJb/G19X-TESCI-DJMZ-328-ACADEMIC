# Rotación preparada: sesiones, superadmin y cifrado Gmail

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Este documento prepara un procedimiento para aprobación. La revisión no cambió `.env`, contraseñas persistidas, tokens, índices, sesiones ni autorizaciones de Google. No ejecutó envíos ni revocaciones.

## Evidencia de la revisión

La configuración OAuth actual fue reconocida por `googleOAuthClienteService.configuracion()` sin mostrar sus valores. El callback, el puerto local y la clave base64 de 32 bytes tienen formato válido. `.env` está ignorado y no está versionado.

En la lectura de MongoDB local se encontraron cero conexiones con campos de tokens cifrados y cero autorizaciones OAuth pendientes vigentes. Los índices únicos de empresa e identidad Google estaban presentes. El superadministrador existe y el password actual de `.env` coincide con su hash de MongoDB. Estos resultados son una fotografía: deben comprobarse nuevamente antes de aplicar cualquier rotación.

## SESSION_SECRET

Generar un secreto nuevo con al menos 32 bytes aleatorios, guardarlo privadamente y reemplazar solo esa variable después de la aprobación. Detener y reiniciar todas las instancias Express. No conservar el secreto expuesto como clave alternativa de verificación: las cookies antiguas deben dejar de ser válidas.

La aplicación usa MemoryStore en desarrollo; reiniciar el proceso elimina sus sesiones. La rotación cierra sesiones de todos los usuarios e invalida el contexto de autorizaciones OAuth iniciadas con esas sesiones. No es una actualización transparente. Si en el futuro hay un store persistente, deberá incluirse su invalidación en el procedimiento.

## SUPERADMIN_PASSWORD

Modificar la variable de arranque no modifica el usuario ya existente. `scripts/crearSuperadmin.js` consulta si el email existe y retorna sin escribir; `server.js` tampoco sincroniza ese password.

Se preparó `scripts/actualizarPasswordSuperadmin.js` para actualizar únicamente el superadministrador identificado por `SUPERADMIN_EMAIL`. Por defecto consulta y no escribe. En modo aplicar exige una confirmación explícita, una nueva contraseña distinta de la actual (16–72 bytes UTF-8) y el destino local `marketing_automation`.

El guardado utiliza `documento.save()`, que calcula bcrypt con coste 12. El filtro compara rol y hash anterior para impedir que una operación concurrente se sobrescriba. No cambia email, rol, empresa ni crea usuarios. No imprime contraseña ni hash y no ejecuta inicialización de colecciones o índices.

Después de la aprobación, la nueva contraseña se proporcionará privadamente mediante `SUPERADMIN_PASSWORD_NUEVA`, nunca como argumento de terminal o mensaje. La herramienta lee esa variable al ejecutar. Si se usa `.env`, esta entrada temporal debe retirarse al terminar y `SUPERADMIN_PASSWORD` debe sincronizarse con la nueva contraseña solo después de confirmar el guardado en MongoDB. Un fallo no debe presentarse como éxito; un timeout puede requerir comparar privadamente contra MongoDB antes de repetir.

Comprobación predeterminada, sin escritura:

```powershell
node scripts/actualizarPasswordSuperadmin.js --verificar
```

Comando que modifica MongoDB, preparado exclusivamente para después de la aprobación:

```powershell
node scripts/actualizarPasswordSuperadmin.js --aplicar --confirmar=CAMBIAR_PASSWORD_SUPERADMIN
```

Cambiar el password por sí solo no revoca sesiones existentes. Debe coordinarse con la rotación de `SESSION_SECRET` y el reinicio. No se debe reemplazar un hash mediante `save()` como si fuera una contraseña: se volvería a hashear.

## GMAIL_TOKEN_ENCRYPTION_KEY

No se cambió la clave actual. AES-256-GCM vincula cada ciphertext a empresa y propósito. La clave es de 32 bytes, codificada en base64 canónico, y no tiene fallback.

Si, inmediatamente antes de aplicar y con todas las instancias detenidas, siguen sin existir tokens cifrados, puede generarse una nueva clave de 32 bytes y sustituirse la variable. Antes deben invalidarse o dejar caducar los estados OAuth pendientes ligados a la clave anterior. No basta contar solo conexiones en estado `conectada`.

Si aparece cualquier ciphertext, bloquear esa sustitución y preparar una migración separada. Los campos a revisar son:

| Colección/modelo | Campo | Contexto de cifrado |
| --- | --- | --- |
| ConexionGmail | accessTokenCifrado | empresa + access |
| ConexionGmail | refreshTokenCifrado | empresa + refresh |
| ConexionGmail | revocacionTokenCifrado | empresa + revocar |
| EstadoOAuth | verifierCifrado | empresa + pkce:hash del estado |

Una migración aprobada debe detener todos los escritores, proteger una copia de recuperación fuera de Git, comprobar que la clave antigua descifra todos los valores, recifrarlos en memoria con una nueva clave manteniendo esos contextos, verificar cada resultado y aplicar escrituras condicionadas por ID/empresa/ciphertext anterior/versionConexion. No deben exportarse tokens en texto plano ni registrarse valores.

El cambio de ciphertexts y del archivo de entorno requiere un procedimiento de recuperación coordinado; MongoDB local puede no admitir transacciones. No ejecutar una migración parcial ni reiniciar con una mezcla de claves sin soporte de versiones. Los estados OAuth temporales pueden invalidarse explícitamente en lugar de recifrarse, con aprobación. Esta revisión no implementa ni ejecuta esa migración porque no encontró ciphertexts que migrar.

La rotación de cifrado no revoca permisos de Google. Si una clave expuesta permitió también obtener copias de los ciphertexts, debe evaluarse la revocación y reconexión de las cuentas afectadas como acción adicional explícita.

## Orden propuesto para aprobación

1. Detener Express y cualquier otra instancia que escriba en esta base. Mantener la clave antigua disponible en almacenamiento privado para recuperación hasta comprobar los datos.
2. Repetir la lectura de tokens y estados OAuth. Si hay tokens, detener el procedimiento y preparar la migración antes de sustituir la clave.
3. Proporcionar y aplicar la nueva contraseña del superadmin con la herramienta preparada; confirmar su hash sin imprimirlo.
4. Actualizar solo `SUPERADMIN_PASSWORD`, `SESSION_SECRET` y, si es seguro por ausencia de ciphertexts, `GMAIL_TOKEN_ENCRYPTION_KEY`. Conservar las credenciales Google, MongoDB, n8n y todas las demás variables. Retirar la entrada temporal de password.
5. Reiniciar Express, confirmar que las sesiones antiguas no sirven, iniciar sesión con el nuevo password y comprobar OAuth. No ejecutar campañas como prueba de conexión.

No se ha autorizado ninguna de esas escrituras. La confirmación solicitada es para este procedimiento local, sujeto a repetir las comprobaciones. No cubre migraciones adicionales, revocaciones de Google, producción remota ni cambios de n8n.
