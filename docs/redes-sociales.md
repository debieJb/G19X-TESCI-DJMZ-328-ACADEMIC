# Antecedente historico: contrato de redes fuera del MVP

Facebook, WhatsApp y LinkedIn quedan fuera de la version actual por decision de alcance. No son errores ni pendientes para aprobar el MVP email. Los requisitos multicanal originales de PluriOne son antecedentes separados y su modificacion formal no tiene aprobacion confirmada.

Se conserva este contrato para trazabilidad y compatibilidad, sin comprometer nuevos adaptadores dentro del MVP. El codigo mantiene sus errores y resultados historicos y no hace peticiones. Los mensajes actuales indican que el canal esta fuera del alcance, sin pedir conectar cuentas. [Alcance vigente](alcance-mvp-actual.md).

---

## Contrato original conservado literalmente

Las menciones siguientes a futuros adaptadores o al mensaje de conectar cuentas son historicas, no instrucciones ni promesas vigentes. Cualquier futura incorporacion requeriria otra decision explicita de alcance y sus autorizaciones.

# Contrato de publicación en redes sociales

`redesSocialesService.prepararPublicacion(campana)` toma los datos guardados y
devuelve `{ campanaId, texto, destinos: [{ red, cuentaId }] }`. Los destinos son
`facebook` y `linkedin`, y ambos usan exactamente el mismo `texto`, incluidos sus
saltos de línea. No usa el asunto ni el cuerpo de email.

Cada resultado tiene `{ campanaId, red, cuentaId, estado, publicacionId, codigo }`.
Los futuros adaptadores deben producir un resultado por red: un fallo de Facebook
no debe reemplazar el resultado de LinkedIn. Estados previstos: `bloqueada`,
`publicada` y `fallida`. `publicada` requerirá confirmación real del proveedor y
su identificador; un timeout no confirma éxito.

Actualmente no hay cuentas conectadas ni adaptadores externos. El manejador
rechaza con `CUENTAS_REDES_NO_CONECTADAS` y adjunta dos resultados `bloqueada` en
`error.resultados`, con `cuentaId` y `publicacionId` nulos. No hace peticiones.
La interfaz y la ruta HTTP bloquean previamente la ejecución y muestran
«Conecta Facebook y LinkedIn para publicar».

Este contrato prepara el registro por red; todavía no persiste historial de
ejecuciones. Al implementar cuentas y publicación, añadir un identificador de
ejecución y persistir cada resultado por `(ejecucionId, red)`, con su fecha y el
texto enviado. Resolver las cuentas desde el servidor, nunca desde el formulario.
