# ADR-005: Integración con FreeLLM API (/v1/decisions)

- **Fecha:** 2026-11-02
- **Estado:** Aceptado
- **Contexto:** Integrar el gateway FreeLLM para usar modelos gratuitos en modo real, manteniendo el contrato de Kev.

## Decisión

- **Endpoint:** Usar `POST /v1/decisions` (plano nativo de decisiones). Una sola llamada con las 3 preguntas (`department`, `severity`, `is_security_leak`). Sin fan-out.
- **Traducción solo en servidor:** El proxy traduce payload Kev (array `questions` → objeto indexado por id, `question` → `instructions`, `criteria` por opciones) a `/v1/decisions`. Respuesta traducida a forma compatible con `kev-adapter`. `adaptKevResponse`/`adaptKevResponsePartial` y `triage-rules.ts` sin modificaciones.
- **Autenticación:** `FREELLM_BASE_URL`, `FREELLM_API_KEY`, `FREELLM_MODEL` solo en servidor. Nunca `VITE_FREELLM_*` ni secretos en cliente.
- **Conmutable:** `UPSTREAM_TYPE=kev|freellm` (default `kev`). Config inválida → modo demo.
- **Modelo:** Configurado por `FREELLM_MODEL` en proxy (default `'auto'`). **Selector aplazado a FREELLM-002.** Experimentos pendientes: parámetro `model` con valor inválido y con modelo del plano de chat.
- **Privacidad:** Los datos van a proveedores del gateway FreeLLM. El usuario acepta este riesgo explícitamente. Se mantiene aviso informativo en modo real (sin bloquear). Sin whitelist de modelos.
- **Confianzas moderadas:** Las confianzas reales observadas son moderadas (0.33–0.87). Esto es comportamiento esperado, no un bug.
- **Metadata:** `usage.total_tokens = input_tokens + output_tokens`. Se conserva `model`/`provider` cuando es tolerado por el adapter.
- **Robustez:** Timeouts/AbortSignal, mapeo 401/403/429/5xx a error global cuando procede. Sin reintentos (no documentados/aprobados). Mensajes de error sin detalles del upstream.

## Consecuencias

- Compatible con KT-025 (parciales). Una respuesta malformada se maneja con `adaptKevResponsePartial`.
- `is_security_leak` sigue siendo evaluado correctamente; regla 1 dispara con `p_yes > 0.70`.
- `kev-client.ts` y `App.tsx` sin cambios funcionales.
- Caché/determinismo observado en el gateway (respuestas idénticas repetidas) — no asumido en tests.
- Archivo en UTF-8 sin BOM.
