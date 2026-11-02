# Kev Triage

[![Tests](https://img.shields.io/badge/tests-149%20passed-brightgreen)](./package.json)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Kev Triage es una aplicación fullstack para el **triage determinista de incidencias técnicas** impulsada por el protocolo System 1 de **Kev** (`POST /v1/systemone`). La app toma una descripción en texto libre, la envía con **tres preguntas estructuradas** (`department`, `severity`, `is_security_leak`), normaliza la respuesta con validación estricta y aplica **reglas deterministas** para generar decisiones de enrutamiento y alertas de seguridad.

## Características clave

- **Modo demo sin configuración**: Funciona inmediatamente con fixtures deterministas sin necesidad de backend.
- **Modo real con Kev**: Soporta el protocolo original `POST /v1/systemone` a través del proxy seguro.
- **Modo real con FreeLLM**: Soporta gateway FreeLLM mediante `UPSTREAM_TYPE=freellm` usando `POST /v1/decisions`. La traducción Kev ↔ `/v1/decisions` se realiza **únicamente en el servidor** (una sola llamada, sin fan-out).
- **Parseo parcial tolerante a fallos por pregunta (KT-025)**: El adaptador evalúa cada pregunta de forma independiente, garantizando que una alerta de seguridad no se oculte si otras preguntas fallan o son ambiguas.
- **Alerta de seguridad prioritaria con umbral estricto > 0.70**: Se activa solo cuando `affirmativeProbability > 0.70` (estricto). Es ortogonal al resto de reglas.
- **Reglas deterministas de triage**: Auto-asignación con `confidence > 0.85`, revisión humana con `confidence <= 0.85`. Umbrales exactos y predecibles.
- **Validación estricta**: Adaptador robusto con soporte flexible de formatos, validación rigurosa y mensajes de error tipados.
- **Proxy seguro**: Claves/API keys nunca se exponen en el cliente. Límite de body 32KB, CORS configurable, timeouts.

## Requisitos

- **Node.js**: >= v20.11.0 (compatible con 18.18+ o 22 LTS)
- **npm**: >= v9/v10

## Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Modo demo inmediato (sin configuración) - http://localhost:5173
npm run dev

# Build de producción
npm run build

# Tests (149 tests)
npm test
# o
npx vitest run
```

## Configuración por variables de entorno

### Cliente (Vite)
| Variable | Requerida | Por defecto | Descripción |
|----------|-----------|-------------|-------------|
| `VITE_MODAL_API_URL` | Sí (modo real) | - | URL base del servicio Kev o proxy. Si contiene placeholder o está vacío → servicio no configurado. |
| `VITE_KEV_MODEL` | No | `kev-default` | Nombre del modelo a enviar en el payload. |

### Proxy (Node.js - server/proxy.mjs)
| Variable | Requerida | Por defecto | Descripción |
|----------|-----------|-------------|-------------|
| `PORT` | No | `8787` | Puerto del proxy. |
| `UPSTREAM_TYPE` | No | `kev` | Tipo de upstream: `kev` o `freellm`. Config inválida → modo demo manejado por cliente. |
| `KEV_UPSTREAM_URL` | Sí (si UPSTREAM_TYPE=kev) | - | URL base o completa del upstream Kev. Debe usar http:// o https://. |
| `KEV_API_KEY` | No | - | API key para Kev, se añade como `Authorization: Bearer` si existe. |
| `FREELLM_BASE_URL` | Sí (si UPSTREAM_TYPE=freellm) | - | URL base del gateway FreeLLM (ej. `http://127.0.0.1:31415/v1`). Debe usar http:// o https://. |
| `FREELLM_API_KEY` | Sí (si UPSTREAM_TYPE=freellm) | - | API key para FreeLLM, solo en servidor. Nunca expuesta al cliente. |
| `FREELLM_MODEL` | No | `auto` | Modelo a usar en FreeLLM. Configurado en proxy; selector UI aplazado a FREELLM-002. |
| `ALLOWED_ORIGIN` | No | `http://localhost:5173` | Lista separada por comas de orígenes permitidos para CORS. Orígenes no permitidos reciben 403 sin ACAO. Peticiones sin Origin permitidas. |
| `UPSTREAM_TIMEOUT_MS` | No | `10000` | Timeout hacia upstream (debe ser menor que el timeout del cliente `DEFAULT_TIMEOUT_MS` 15000). Al vencer → 504. |
| `MAX_BODY_BYTES` | No | `32768` | Límite de tamaño del body (32 KB). |

> **Nota importante:** Las claves (`KEV_API_KEY`, `FREELLM_API_KEY`) **SOLO** deben estar en el servidor/proxy. Nunca usar variables `VITE_*` para secretos. El archivo `.env` está en `.gitignore` - **nunca commitear claves**.

## Modo demo vs modo real

- **Modo demo**: Activable desde la interfaz sin configuración. Usa fixtures deterministas (`security_high_conf`, `frontend_auto_assign`, `billing_human_review`). Ideal para pruebas y desarrollo.
- **Modo real (Kev)**: Configurar `VITE_MODAL_API_URL` apuntando al proxy (`http://localhost:8787/api/kev`) o directamente al servicio Kev. Configurar variables del proxy `KEV_UPSTREAM_URL`/`KEV_API_KEY`.
- **Modo real (FreeLLM)**: Configurar proxy con `UPSTREAM_TYPE=freellm`, `FREELLM_BASE_URL`, `FREELLM_API_KEY`, `FREELLM_MODEL`. El cliente apunta al proxy. **Confianzas moderadas** con modelos reales del gateway (rango observado 0.33-0.87) son **esperadas** y están documentadas en [ADR-005](./docs/decisions/ADR-005-integracion-freellm.md), no son bugs.

## Arquitectura

La app sigue un diseño en capas: **UI (React)** → **kev-client** → **Proxy/Servicio** → **kev-adapter** → **triage-rules** → **UI de resultados**.  
El adaptador realiza extracción flexible + validación estricta; las reglas son puras y deterministas. Para más detalles: [docs/architecture.md](./docs/architecture.md), [docs/api.md](./docs/api.md), [docs/security.md](./docs/security.md), [docs/operations.md](./docs/operations.md), [docs/development.md](./docs/development.md), [docs/data.md](./docs/data.md), [docs/ROADMAP.md](./docs/ROADMAP.md), [docs/decisions/](./docs/decisions/).

## Seguridad

- **Invariante de seguridad ortogonal**: La alerta de seguridad nunca se oculta por fallos en otras preguntas.
- **Umbral estricto**: Alerta solo con `affirmativeProbability > 0.70` (0.70 exacto NO activa).
- **Sin secretos en cliente**: Todas las claves se gestionan solo en el proxy.
- **Límite de body 32KB**: Prevención básica en el proxy.
- **Validación estricta**: Previene interpretación errónea del protocolo.

Ver [docs/security.md](./docs/security.md) para más detalles.

## Aviso de privacidad (modo FreeLLM)

En modo FreeLLM, los datos de la incidencia (texto y payload traducido) **van a proveedores del gateway FreeLLM**. El usuario acepta explícitamente este riesgo. Se mantiene un aviso informativo en modo real (sin bloquear). **Sin whitelist de modelos** - decisión documentada en [docs/decisions/ADR-005-integracion-freellm.md](./docs/decisions/ADR-005-integracion-freellm.md).

## Licencia

[MIT](./LICENSE) © 2026 Antonio Juan

## Estado del proyecto

**Terminado según su alcance documentado.** Las mejoras futuras se encuentran en [docs/ROADMAP.md](./docs/ROADMAP.md). FREELLM-001 completado y cerrado; FREELLM-002 (selector de modelos UI) aplazado intencionalmente.
