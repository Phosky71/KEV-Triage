# Arquitectura

## Visión general

Kev Triage sigue un diseño en capas con separación estricta entre contrato de protocolo, normalización/validación y lógica de negocio determinista:

```
[Usuario/UI (React)] 
  → [kev-client] (construye payload, fetch, timeouts, abort)
    → [Servicio Kev / Proxy local] (POST /v1/systemone)
      → [kev-adapter] (extracción flexible + validación estricta + normalización)
        → [triage-rules] (reglas deterministas puras)
          → [UI de resultados]
```

## Componentes principales

### Frontend (src/)

- **`App.tsx`**: Orquestador principal. Gestiona estado de formulario, modo demo, concurrencia (requestId + AbortController), llamadas al cliente y evaluación de reglas.
- **`components/`**: Componentes presentacionales (`IncidentInput`, `AnalysisResults`, `IncidentTemplates`, `SecurityAlert`, `ConfidenceIndicator`, `LoadingState`).
- **`types.ts`**: Contratos compartidos. Separa estrictamente el contrato del protocolo Kev del modelo interno normalizado.
- **`lib/kev-client.ts`**: Cliente HTTP. Construye payload con las 3 preguntas obligatorias, resuelve endpoint, gestiona timeout (15s por defecto), abort/cancelación, errores tipados (`KevClientException` con `TriageError`).
- **`lib/kev-adapter.ts`**: Adaptador estricto. Localiza nodos de respuesta flexiblemente (`answers/questions/results/outputs` o indexado por ID), parsea cada pregunta con validación rigurosa, calcula confianza/orientalidad, normaliza latencia.
- **`lib/triage-rules.ts`**: Reglas deterministas puras. Umbrales exactos: seguridad > 0.70, auto-asignación > 0.85, revisión humana <= 0.85. Reglas ortogonales.
- **`lib/demo-fixtures.ts`**: Fixtures deterministas para modo demo.

### Backend/Proxy (server/)

- **`server/proxy.mjs`**: Servidor HTTP nativo Node.js. Escucha en `PORT` (por defecto 8787), reenvía `POST /api/kev/v1/systemone` al upstream `KEV_UPSTREAM_URL` con headers `Content-Type/Accept` y opcional `Authorization: Bearer`. CORS configurable, límite de body 32KB, no loggea claves, gestión de errores.

## Contrato de protocolo Kev (`/v1/systemone`)

Payload construido por `buildSystemOnePayload`:
```json
{
  "state": "<texto de incidencia>",
  "model": "<nombre modelo>",
  "questions": [
    { "id": "department", "type": "choice", "question": "...", "options": ["frontend","backend","billing","devops"], "criteria": {...} },
    { "id": "severity", "type": "score", "question": "...", "levels": ["low","moderate","high","critical","emergency"], "criteria": {...} },
    { "id": "is_security_leak", "type": "noul", "question": "...", "criteria": "..." }
  ]
}
```

Respuesta adaptada con flexibilidad: puede venir en `answers`, `questions`, `results`, `outputs` o como objeto indexado. El adaptador extrae cada pregunta por ID.

## Validación y normalización

- **Department:** Requiere `choice` válido. Confianza: si viene explícita (`confidence/probability/prob`) en [0,1] → `explicit_protocol`; si solo viene distribución y probabilidad de opción ganadora es válida → `winning_option_probability`. Requiere al menos una fuente de confianza válida.
- **Severity:** Acepta nivel semántico, índice base-0, o puntuación 1-5 (0 → low). Genera `ordinal` 1-5, `legend` desde mapeo fijo.
- **Security leak:** Extrae probabilidad afirmativa desde múltiples variantes (`affirmative_probability`, `yes_probability`, etc.) o infiere desde `answer` + probabilidad. Debe estar en [0,1].
- **Latencia:** Separa `modelDeclaredMs` (declarada por servidor) de `clientRoundTripMs` (medida por cliente con `performance.now()`).

## Reglas deterministas

Definidas en `triage-rules.ts`:
- **Regla 1 - Alerta de seguridad:** `affirmativeProbability > 0.70` → alerta prioritaria con recomendaciones. Estricto (0.70 exacto NO activa).
- **Regla 2 - Asignación automática:** `confidence > 0.85` → modo `auto_assign`.
- **Regla 3 - Revisión humana:** `confidence <= 0.85` → modo `human_review`.
- Las reglas son ortogonales: alerta de seguridad nunca se oculta.

## Gestión de estado y concurrencia

En `App.tsx`: `activeRequestIdRef` para ignorar respuestas de peticiones obsoletas, `abortControllerRef` para cancelar peticiones en curso al cambiar modo/demo, manejo de `AbortError`, estados separados para loading/result/evaluation/error.

## Seguridad

- Claves nunca se loggean (proxy las añade solo si existen).
- Límite de body 32KB en proxy.
- CORS configurable por `ALLOWED_ORIGIN`.
- Errores genéricos al fallar conexión upstream (sin exponer detalles sensibles).
- Validación estricta de esquema previene inyección/interpretación errónea.
- Umbrales deterministas evitan decisiones ambiguas.
