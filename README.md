# Kev Triage

Aplicación fullstack de clasificación técnica y triaje determinista de incidencias impulsada por el protocolo System 1 de **Kev** (`POST /v1/systemone`).

Kev Triage toma la descripción en texto libre de una incidencia técnica, la envía al modelo Kev mediante el protocolo `/v1/systemone` con tres preguntas estructuradas (departamento responsable, severidad operativa y posible filtración de material sensible), normaliza la respuesta con validación estricta y aplica reglas deterministas de negocio para generar decisiones de enrutamiento y alertas de seguridad.

## Características

- **Clasificación estructurada**: Tres preguntas según protocolo Kev (department, severity, is_security_leak)
- **Validación estricta**: Adaptador robusto con soporte flexible de formatos de respuesta
- **Reglas deterministas**: Umbrales exactos (>0.70 para alertas de seguridad, >0.85 para auto-asignación)
- **Modo demostración**: Pruebas sin configuración de backend
- **Proxy seguro**: Gestión de claves/API keys sin exponerlas en el cliente
- **Gestión de concurrencia**: Prevención de condiciones de carrera y cancelación de peticiones
- **Métricas de latencia**: Separación entre tiempo declarado por modelo y RTT cliente

## Documentación

La documentación técnica completa está en [`docs/`](docs/):
- [Estado del proyecto](docs/project-state.md)
- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [API y Protocolo](docs/api.md)
- [Seguridad](docs/security.md)
- [Datos y Modelos](docs/data.md)
- [Operaciones](docs/operations.md)
- [Decisiones arquitectónicas (ADRs)](docs/decisions/)

## 1. Requisitos previos e instalación de Node.js

- **Node.js**: Versión mínima recomendada **v20.11.0+** (compatible con Node 18.18+ o Node 22 LTS).
- **npm**: v9+ o v10+ (incluido con Node.js).

Verifique su versión instalada:

```bash
node --version
npm --version