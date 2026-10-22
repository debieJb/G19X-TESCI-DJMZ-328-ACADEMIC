# Informe final de residencias - Plataforma Inteligente de Marketing Automation

**Institución:** Tecnológico de Estudios Superiores de Cuautitlán Izcalli (TESCI)<br>
**Programa:** Ingeniería en Sistemas Computacionales<br>
**Empresa receptora:** PluriOne S.A. de C.V.<br>
**Nombre comercial:** Develop Talent & Technology<br>
**Autora y responsable académica:** Debanie Jocabed Montoya Zúñiga<br>
**Edición documental:** 19 de octubre de 2026<br>
**Referencia funcional:** `78c743424b84cf7ea6d7fc63d2cbf58205727c88`, rama `respaldo-avances-18-oct`.

Documento técnico-académico preparado para revisión. No acredita dictamen, acta de aceptación, firmas o despliegue productivo. El periodo oficial de residencia, asesores y datos de control escolar no fueron proporcionados en el repositorio ni se inventan; deben obtenerse del expediente institucional para la versión administrativa que TESCI requiera.

## Índice

1. Resumen
2. Contexto y problema
3. Objetivos y alcance
4. Metodología y desarrollo
5. Resultados
6. Entregables
7. Competencias y colaboración con IA
8. Limitaciones y continuidad
9. Conclusiones
10. Referencias y anexos

## 1. Resumen

Se desarrolló un MVP web para administrar campañas email de distintas empresas, con registro verificado, roles, contactos y consentimiento, creación manual o asistida por Gemini y envío mediante Gmail OAuth/API. El flujo supervisado revisa contenido y audiencia, envía mensajes individuales y conserva resultados con cuotas, reservas y protección de duplicados.

La base funcional se contrastó con registros de 851 pruebas generales y 65 integraciones aprobadas, además de recorridos de interfaz en escritorio y móvil. Se reconocen validaciones reales de Gmail y Gemini y la confirmación de la responsable sobre registro/verificación y envío múltiple real. Los niveles de evidencia se documentan sin transformar pruebas simuladas en resultados externos ni funcionamiento en aceptación formal.

## 2. Contexto y problema

PluriOne requiere organizar tareas de marketing y facilitar contenido y campañas para empresas con identidades separadas. La administración dispersa de contactos, autorización, redacción y resultados puede causar exposición de destinatarios, mensajes sin consentimiento o repetición tras una respuesta ambigua.

El proyecto aborda ese problema con una plataforma común y controles por empresa. La empresa autorizó selección tecnológica libre según la información de la responsable; la lista inicial fue orientativa. No se incorporan herramientas como utilizadas por aparecer únicamente en una propuesta previa.

## 3. Objetivos y alcance

El objetivo general fue implementar una plataforma funcional de marketing email con asistencia IA y revisión humana. Los objetivos específicos abarcaron alta y acceso verificados; aislamiento empresarial; consentimiento; administración de campañas; OAuth y Gmail API; envío múltiple supervisado; historial y pruebas.

El MVP entregado se limita a email de texto. Canales sociales, adjuntos, indicadores comerciales instrumentados y operación programada productiva no se presentan como terminados. La funcionalidad de programación existe con pruebas simuladas y mantiene su separación del envío inmediato. El [PRD](../PRD-borrador-tecnico.md) define requisitos y criterios concretos.

## 4. Metodología y desarrollo

Se observa un desarrollo incremental con control de versiones, separación de capas, pruebas unitarias/HTTP e integraciones aisladas. El historial permite reconstruir integración de registro, cuotas IA, Gmail y experiencia de usuario; no se atribuye una certificación metodológica ni ceremonias ágiles sin evidencia.

La arquitectura modular Express/EJS y MongoDB/Mongoose centraliza controles de acceso. El motor Gmail directo separa proveedor, reserva y persistencia. La generación Gemini entrega una propuesta editable; el humano aprueba su contenido y confirma el envío. El SMTP de registro utiliza credenciales de plataforma independientes del OAuth empresarial.

La recuperación tras un apagado se efectuó mediante inspección y respaldo privado, sin eliminación del trabajo. La simplificación posterior preservó el piloto histórico e incorporó modo supervisado múltiple. Las incidencias de cuotas, concurrencia, incertidumbre y navegador se contrastaron mediante regresiones. Véanse [memoria técnica](memoria-tecnica.md), [arquitectura](../SDD-borrador-tecnico.md) y [plan reconstruido](plan-proyecto.md).

## 5. Resultados

| Objetivo | Resultado sustentado | Límite de interpretación |
|---|---|---|
| Acceso empresarial | Registro verificado, administrador posterior y autenticación implementados/probados; uso real confirmado. | La constancia saneada del ensayo real de extremo a extremo no está adjunta. |
| Aislamiento y consentimiento | Filtros, roles, documentación de consentimiento y pruebas de rechazo. | No certifica autenticidad de pruebas externas de consentimiento ni auditoría independiente. |
| Campañas e IA | CRUD y recorrido Gemini con revisión humana; generación auténtica documentada. | No se afirma evaluación estadística de calidad del modelo ni facturación cero. |
| Gmail y envío múltiple | OAuth/API, mensajes individuales, historial y modo supervisado implementados; envío real confirmado. | Aceptación API no acredita recepción, apertura o conversión. Evidencia real múltiple exportable pendiente. |
| Consistencia | Reservas, cuotas, huellas e índices únicos con pruebas de concurrencia y fallos. | No garantiza entrega externa exactamente una vez ante toda falla. |
| QA | 851/851 generales y 65/65 integraciones; 58 comprobaciones de navegador en dos ensayos. | Registros previos verificados; no son ejecución nueva de esta revisión documental ni cobertura 100 %. |

La [matriz de trazabilidad](matriz-trazabilidad.md) y el [registro de evidencias](evidencias-validacion.md) permiten auditar cada afirmación sin revelar credenciales o datos empresariales.

## 6. Entregables

Los diez rubros de la propuesta descrita por la responsable se cubren mediante PRD, propuesta técnica, SDD, plan, sistema funcional, QA, manuales, mantenimiento, material de capacitación e informe final. Las rutas exactas y el estado están en la [matriz de entrega](indice-entrega.md). La capacitación tiene material concreto; no se presenta como impartida. Los documentos preparados no equivalen a recibidos o aprobados por la empresa.

## 7. Competencias y colaboración con IA

El trabajo integra análisis de requisitos, modelado de datos, desarrollo web, autenticación, integración de APIs, pruebas, control de versiones y comunicación técnica. No se asignan calificaciones ni validaciones académicas a estas competencias.

La autora y responsable académica es Debanie Jocabed Montoya Zúñiga. Se reconoce asistencia de OpenAI Codex en programación, depuración, implementación, pruebas y análisis; ChatGPT en planificación, revisión técnica, problemas y documentación; y Gemini como servicio funcional de generación de campañas. No se inventan coautores humanos ni firmas de herramientas. La responsabilidad de revisión y defensa permanece en la estudiante: [declaración completa](autoria-ia.md).

## 8. Limitaciones y continuidad

El cierre del MVP académico es compatible con pendientes de aceptación empresarial, dictamen TESCI, producción, auditoría externa, evidencia exportable de ciertas pruebas reales y capacitación formal. Las siguientes versiones pueden instrumentar métricas comerciales, validar programación en operación productiva y ampliar recursos o canales mediante requisitos y autorización propios.

El [plan de mantenimiento](plan-mantenimiento.md) propone monitoreo, revisión de acceso, respuesta conservadora a incertidumbre y restauración aislada. No se inventan SLA, RPO/RTO, retorno financiero, incremento de ventas o niveles de disponibilidad.

## 9. Conclusiones

Se logró un MVP implementado que articula contactos, consentimiento, creación asistida y envío empresarial controlado. La arquitectura y las regresiones sostienen el recorrido funcional; las validaciones reales reconocidas permiten describirlo como sistema operativo en el entorno comprobado, sin reducirlo a una idea o simulación total.

El aporte técnico consiste en integrar revisión humana, identidad de empresa y procesamiento individual con trazabilidad. La conclusión se limita a ese alcance: no sustituye la aceptación formal ni demuestra por sí sola despliegue productivo, impacto comercial o cumplimiento de todos los objetivos de largo plazo.

## 10. Referencias y anexos

[Referencias técnicas](referencias.md), [PRD](../PRD-borrador-tecnico.md), [SDD](../SDD-borrador-tecnico.md), [QA](reporte-qa.md), [manual de usuario](manual-usuario.md), [manual técnico](manual-tecnico.md), [evidencias y capturas](evidencias-validacion.md), [capacitación](capacitacion.md) y [entregables](indice-entrega.md).
