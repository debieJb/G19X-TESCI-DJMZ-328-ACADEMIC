# Control de la revisión documental final

**Proyecto:** PluriOne · **Empresa:** PluriOne S.A. de C.V.<br>
**Institución:** TESCI · **Autora:** Debanie Jocabed Montoya Zúñiga<br>
**Edición:** 19 de octubre de 2026 · **Base funcional conservada:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`.

## Índice

1. Alcance de revisión
2. Criterios editoriales
3. Comprobaciones
4. Inventario de cambios

## 1. Alcance de revisión

Se revisaron los documentos Markdown existentes, sus afirmaciones de estado,
las rutas de implementación y pruebas referidas, los logs locales conservados y
capturas del ensayo supervisado final. No se inspeccionaron nuevamente bandejas,
proveedores reales o bases empresariales. No se modificó código funcional,
configuración privada, MongoDB, Gmail, Gemini ni n8n.

## 2. Criterios editoriales

- PRD, SDD, alcance, README y manuales describen el MVP implementado.
- Los ensayos simulados, comprobaciones reales documentadas y confirmaciones de
  la responsable tienen categorías distintas y no equivalen a aceptación formal.
- Los documentos de etapa conservan su contenido con una nota de contexto. Once
  versiones previas se preservan; únicamente se adaptan enlaces a su ubicación.
- Las capturas nuevas del expediente son copias de archivos existentes, sin
  alteración de píxeles, con datos sintéticos y hashes de procedencia.
- Los diez entregables tienen rutas concretas. Capacitación dispone de material,
  sin acta, asistencia o firma inventadas.
- Se reconoce autoría de Debanie Jocabed Montoya Zúñiga y colaboración de Codex,
  ChatGPT y Gemini; no se crean coautores humanos ni cuentas de herramientas.

## 3. Comprobaciones

| Comprobación | Resultado observado |
|---|---|
| Base y rama | HEAD conservado en `78c743424b84cf7ea6d7fc63d2cbf58205727c88`; `respaldo-avances-18-oct`. |
| Alcance | 47 archivos modificados y 32 nuevos; todos en README o docs. |
| Rutas y enlaces | 73 Markdown revisados; 519 enlaces locales comprobados, incluidos los del inventario, sin destinos rotos. Referencias de código presentes y bloques de código delimitados. |
| Codificación | Markdown y JSON nuevos/modificados válidos en UTF-8. |
| Espacios | `git diff --check` aprobado tras corregir espacios finales de formato; no se modifica código para hacerlo pasar. |
| Secretos | Gitleaks 8.30.1 sobre docs: cero hallazgos. Coincidencia exacta con valores sensibles actuales: cero en archivos cambiados. No se muestran ni publican esos valores. |
| Capturas | Cuatro copias auténticas; hashes SHA-256 iguales a los originales del ensayo, sin generación de imágenes ni edición de píxeles. |
| QA conservado | Resúmenes verificados: 851/851 generales, 65/65 integraciones y 29 + 29 comprobaciones de navegador. No se ejecutaron de nuevo en esta edición. |
| Datos personales | Autoría publicada por instrucción expresa; capturas de fixtures con datos sintéticos. No se agregan cuentas reales, bandejas, tokens o identificadores privados. |
| Servicios y Git | Sin campañas, correos, llamadas Gemini, trabajadores, migraciones, commit o push. |

El análisis documental no es una auditoría externa de seguridad ni acredita
aceptación empresarial. Las referencias técnicas oficiales se consultaron sin
utilizarlas como prueba de acceso a cuentas o envío real.

## 4. Inventario de cambios

79 archivos de documentación/evidencia: 47 modificados y 32 nuevos.
Los nuevos incluyen 15 documentos de entrega, 11 antecedentes conservados,
cuatro capturas y dos registros JSON de procedencia/resultados.

| Operación | Ruta exacta | Tratamiento |
|---|---|---|
| Modificado | [README.md](../../README.md) | Estado vigente corregido |
| Modificado | [docs/PRD-borrador-tecnico.md](../PRD-borrador-tecnico.md) | Estado vigente corregido |
| Modificado | [docs/SDD-borrador-tecnico.md](../SDD-borrador-tecnico.md) | Estado vigente corregido |
| Modificado | [docs/alcance-mvp-actual.md](../alcance-mvp-actual.md) | Estado vigente corregido |
| Modificado | [docs/asistente-ia.md](../asistente-ia.md) | Estado vigente corregido |
| Modificado | [docs/auditoria-multiempresa.md](../auditoria-multiempresa.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/auditoria-visual-integral-2026-10-18.md](../auditoria-visual-integral-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/autoservicio-empresarial.md](../autoservicio-empresarial.md) | Estado vigente corregido |
| Modificado | [docs/bloqueo-envios-y-referencia-indices.md](../bloqueo-envios-y-referencia-indices.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/cierre-funcional-integraciones.md](../cierre-funcional-integraciones.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/cierre-tecnico-2026-10-15.md](../cierre-tecnico-2026-10-15.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/csrf-superadmin.md](../csrf-superadmin.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/cuotas-ia-desarrollo.md](../cuotas-ia-desarrollo.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/cuotas-ia-produccion.md](../cuotas-ia-produccion.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/entorno-real-gmail-preparado-2026-10-18.md](../entorno-real-gmail-preparado-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/envio-multiple-supervisado.md](../envio-multiple-supervisado.md) | Estado vigente corregido |
| Modificado | [docs/envios-gmail-mvp.md](../envios-gmail-mvp.md) | Estado vigente corregido |
| Modificado | [docs/estado-proyecto.md](../estado-proyecto.md) | Estado vigente corregido |
| Modificado | [docs/flujo-campanas-integrado.md](../flujo-campanas-integrado.md) | Estado vigente corregido |
| Modificado | [docs/frontend-publico.md](../frontend-publico.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/gemini-activacion-segura.md](../gemini-activacion-segura.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/gemini-nickki-diagnostico-2026-10-18.md](../gemini-nickki-diagnostico-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/gmail-automatico-2026-10-18.md](../gmail-automatico-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/gmail-manual-nickki-2026-10-18.md](../gmail-manual-nickki-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/gmail-oauth.md](../gmail-oauth.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/gmail-transaccional.md](../gmail-transaccional.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/historico/readme-anterior-alcance-email.md](../historico/readme-anterior-alcance-email.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/ia-http-cuotas-2026-10-18.md](../ia-http-cuotas-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/ia-instrucciones-libres.md](../ia-instrucciones-libres.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/infraestructura-recuperada-2026-10-18.md](../infraestructura-recuperada-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/interfaz-roles-2026-10-18.md](../interfaz-roles-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/migracion-smtp-transaccional-2026-10-18.md](../migracion-smtp-transaccional-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/mongodb-replicaset-desarrollo.md](../mongodb-replicaset-desarrollo.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/piloto-gmail-checklist.md](../piloto-gmail-checklist.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/piloto-gmail-resultados.md](../piloto-gmail-resultados.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/piloto-gmail-un-correo.md](../piloto-gmail-un-correo.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/preparacion-base-piloto-2026-10-18.md](../preparacion-base-piloto-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/prueba-unitaria-gmail-campanas.md](../prueba-unitaria-gmail-campanas.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/redes-sociales.md](../redes-sociales.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/registro-empresarial-fase1.md](../registro-empresarial-fase1.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/revision-alcance-mvp.md](../revision-alcance-mvp.md) | Estado vigente corregido |
| Modificado | [docs/rotacion-credenciales.md](../rotacion-credenciales.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/seguridad-multiempresa-etapa1.md](../seguridad-multiempresa-etapa1.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/sesiones-navegacion-permisos-2026-10-18.md](../sesiones-navegacion-permisos-2026-10-18.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/sesiones-produccion.md](../sesiones-produccion.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/verificacion-automatica.md](../verificacion-automatica.md) | Contenido de etapa conservado y contextualizado |
| Modificado | [docs/verificacion-empresarial-local.md](../verificacion-empresarial-local.md) | Contenido de etapa conservado y contextualizado |
| Nuevo | [docs/entrega/autoria-ia.md](autoria-ia.md) | Documento de entrega |
| Nuevo | [docs/entrega/capacitacion.md](capacitacion.md) | Documento de entrega |
| Nuevo | [docs/entrega/control-documental.md](control-documental.md) | Documento de entrega |
| Nuevo | [docs/entrega/evidencias-validacion.md](evidencias-validacion.md) | Documento de entrega |
| Nuevo | [docs/entrega/indice-entrega.md](indice-entrega.md) | Documento de entrega |
| Nuevo | [docs/entrega/informe-final-residencias.md](informe-final-residencias.md) | Documento de entrega |
| Nuevo | [docs/entrega/manual-tecnico.md](manual-tecnico.md) | Documento de entrega |
| Nuevo | [docs/entrega/manual-usuario.md](manual-usuario.md) | Documento de entrega |
| Nuevo | [docs/entrega/matriz-trazabilidad.md](matriz-trazabilidad.md) | Documento de entrega |
| Nuevo | [docs/entrega/memoria-tecnica.md](memoria-tecnica.md) | Documento de entrega |
| Nuevo | [docs/entrega/plan-mantenimiento.md](plan-mantenimiento.md) | Documento de entrega |
| Nuevo | [docs/entrega/plan-proyecto.md](plan-proyecto.md) | Documento de entrega |
| Nuevo | [docs/entrega/propuesta-tecnica.md](propuesta-tecnica.md) | Documento de entrega |
| Nuevo | [docs/entrega/referencias.md](referencias.md) | Documento de entrega |
| Nuevo | [docs/entrega/reporte-qa.md](reporte-qa.md) | Documento de entrega |
| Nuevo | [docs/evidencias/cierre-78c7434/resumen-validacion.json](../evidencias/cierre-78c7434/resumen-validacion.json) | Resumen/procedencia saneados |
| Nuevo | [docs/evidencias/flujo-supervisado-2026-10-19/confirmacion-1440.png](../evidencias/flujo-supervisado-2026-10-19/confirmacion-1440.png) | Captura auténtica sin edición |
| Nuevo | [docs/evidencias/flujo-supervisado-2026-10-19/flujo-revision-1440.png](../evidencias/flujo-supervisado-2026-10-19/flujo-revision-1440.png) | Captura auténtica sin edición |
| Nuevo | [docs/evidencias/flujo-supervisado-2026-10-19/flujo-revision-390.png](../evidencias/flujo-supervisado-2026-10-19/flujo-revision-390.png) | Captura auténtica sin edición |
| Nuevo | [docs/evidencias/flujo-supervisado-2026-10-19/historial-390.png](../evidencias/flujo-supervisado-2026-10-19/historial-390.png) | Captura auténtica sin edición |
| Nuevo | [docs/evidencias/flujo-supervisado-2026-10-19/reporte-procedencia.json](../evidencias/flujo-supervisado-2026-10-19/reporte-procedencia.json) | Resumen/procedencia saneados |
| Nuevo | [docs/historico/corte-previo-78c7434/PRD-borrador-tecnico.md](../historico/corte-previo-78c7434/PRD-borrador-tecnico.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/README.md](../historico/corte-previo-78c7434/README.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/SDD-borrador-tecnico.md](../historico/corte-previo-78c7434/SDD-borrador-tecnico.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/alcance-mvp-actual.md](../historico/corte-previo-78c7434/alcance-mvp-actual.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/asistente-ia.md](../historico/corte-previo-78c7434/asistente-ia.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/autoservicio-empresarial.md](../historico/corte-previo-78c7434/autoservicio-empresarial.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/envio-multiple-supervisado.md](../historico/corte-previo-78c7434/envio-multiple-supervisado.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/envios-gmail-mvp.md](../historico/corte-previo-78c7434/envios-gmail-mvp.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/estado-proyecto.md](../historico/corte-previo-78c7434/estado-proyecto.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/flujo-campanas-integrado.md](../historico/corte-previo-78c7434/flujo-campanas-integrado.md) | Versión previa conservada |
| Nuevo | [docs/historico/corte-previo-78c7434/revision-alcance-mvp.md](../historico/corte-previo-78c7434/revision-alcance-mvp.md) | Versión previa conservada |

El paquete permanece sin commit ni push para revisión de la autora. La edición
no inventa aprobación, firmas ni resultados externos nuevos.
