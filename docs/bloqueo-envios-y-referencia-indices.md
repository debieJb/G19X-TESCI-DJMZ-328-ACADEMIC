# Bloqueo de campañas y referencia de índices autorizados

> **Contexto histórico — edición final 19/10/2026.** El contenido original siguiente se conserva como informe o referencia de su etapa. Las cifras, configuraciones y afirmaciones de proveedores «pendientes» describen aquella jornada, no el estado final del MVP. Gmail y Gemini fueron comprobados con servicios reales; registro/verificación y envío múltiple reales están confirmados por la responsable. El [expediente vigente](entrega/indice-entrega.md) y el [registro de evidencia](entrega/evidencias-validacion.md) distinguen pruebas simuladas, comprobaciones reales y aceptación formal. Los controles técnicos siguen sujetos al código; los procedimientos históricos no autorizan ejecutar servicios ni campañas.


Todos los envíos de campañas están bloqueados hasta integrar Gmail empresarial,
consentimiento e historial con prevención de duplicados. No hay variable de entorno
ni parámetro HTTP para levantar este bloqueo. El controlador histórico conserva
autenticación, autorización, CSRF y validaciones, pero no delega ninguna ejecución.
Las solicitudes válidas reciben 503; las inválidas pueden conservar sus errores
anteriores. El servicio email también rechaza antes del transporte, tanto en llamadas
directas como mediante el selector. El endpoint nuevo de confirmación sigue bloqueado.
Se mantienen consulta, edición, selección de destinatarios y preparación.

Los casos que antes esperaban envíos HTTP locales se adaptaron para comprobar cero
solicitudes y conservar las verificaciones de aislamiento, edición y sesión.

## Historial de referencias

La referencia original externa `marketing-automation-dev-mongo-rs/original-baseline.json`
permanece intacta. La nueva referencia es `mongodb-indices-autorizados-v2.json`,
con copia de la referencia anterior, nuevas huellas e inventario completo de índices.
No contiene datos de documentos ni credenciales.

Única diferencia autorizada en el standalone 127.0.0.1:27017, base marketing_automation:

```javascript
// Colección campanas
{
  v: 2,
  key: { empresa: 1, 'asistenciaIA.aprobacionHash': 1 },
  name: 'empresa_1_asistenciaIA.aprobacionHash_1',
  unique: true,
  partialFilterExpression: { 'asistenciaIA.aprobacionHash': { $type: 'string' } }
}
```

Se verificaron identidad y PRIMARY de marketingDevRs, identidad standalone, PID,
configuración y datos originales. Al excluir únicamente ese índice en memoria se
reprodujo exactamente la huella original. No había documentos sujetos al índice.
No se ejecutó DDL ni se modificaron documentos empresariales. El índice coincide
con la declaración del modelo Campana; pudo crearlo Mongoose antes de deshabilitar
autoIndex/autoCreate. No puede atribuirse con certeza a un proceso concreto.

El validador exige que el padre coincida con la referencia original y que no cambien
PID, configuración ni datos. Valida la definición exacta del índice, la huella del
inventario completo y la coincidencia con el inventario original al excluir solo
ese índice. Después compara todas las huellas actuales con v2. Cualquier diferencia
adicional o referencia ausente/alterada detiene el procedimiento. No hay aceptación
automática de nuevas diferencias ni actualización automática de referencias.

## Pruebas

```powershell
npm.cmd test
node --test pruebas-integracion/registroEmpresarial.js pruebas-integracion/campanasFlujo.js
```

Las integraciones verifican las identidades antes y después y usan exclusivamente
bases ficticias ma_tx_test_* de marketingDevRs:27018. Antes de limpiarlas verifican
prefijo y marcador de propiedad. No cargan la conexión de Express ni migran datos.

Resultado de esta fase: 474/474 pruebas habituales (463 casos conservados y
adaptados al bloqueo, más 11 nuevos), y 16/16 integraciones reales. Sin fallos ni
omisiones. La comprobación final confirmó identidad/PRIMARY del replica set y
coincidencia del standalone con la referencia autorizada v2; la original sigue intacta.
