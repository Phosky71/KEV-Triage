# API y Protocolo

## Protocolo Kev System 1

### Endpoint
`POST /v1/systemone` (según contrato de Kev)

### Payload de solicitud

Construido por `buildSystemOnePayload(incidentState, modelName)`:

```typescript
{
  state: string,        // Texto de la incidencia (trim)
  model: string,        // Nombre del modelo (por defecto 'kev-default')
  questions: [
    {
      id: 'department',
      type: 'choice',
      question: string,
      options: ['frontend', 'backend', 'billing', 'devops'],
      criteria: Record<DepartmentOption, string>
    },
    {
      id: 'severity',
      type: 'score',
      question: string,
      levels: ['low', 'moderate', 'high', 'critical', 'emergency'],
      criteria: Record<SeverityLevel, string>
    },
    {
      id: 'is_security_leak',
      type: 'noul',
      question: string,
      criteria: string
    }
  ]
}
```

### Respuesta esperada (flexible)

El adaptador acepta múltiples formatos de respuesta. Debe contener información para las 3 preguntas.

Formatos soportados para ubicación de respuestas:
- `answers[questionId]`
- `questions[questionId]` o array de objetos con `id`
- `results[questionId]` o array con `id`
- `outputs[questionId]` o array con `id`
- Objeto raíz indexado por ID
- Array en raíz con objetos `{ id, ... }`

#### Department (choice)
Campos buscados: `choice`, `answer`, `value`, `selected`  
Probabilidades: `probabilities`, `distribution`, `probs`, `scores` (por opción)  
Confianza: `confidence`, `probability`, `prob` (explícita)

#### Severity (score)
Campos buscados: `level`, `label`, `choice`, `answer`, `value`  
Soporta: nivel semántico, `index` (0-4), `score` numérico (1-5, 0→low)  
Probabilidades opcionales por nivel, confianza opcional

#### Security leak (noul)
Probabilidad afirmativa desde: `affirmative_probability`, `yes_probability`, `true_probability`, `p_yes`, `p_true`, `score`  
O desde `probabilities` con claves `yes/true/affirmative/1`  
O inferido desde `answer` (true/false/yes/no) + `probability/confidence`

#### Metadatos
- `model`: nombre del modelo
- `id` o `requestId`: ID de solicitud
- `usage.total_tokens`: tokens usados
- `latency_ms`, `latencyMs`, `inference_time_ms`, o en `metadata`/`timing`

## Cliente HTTP (kev-client)

### Configuración
- Base URL desde `options.baseUrl` o `import.meta.env.VITE_MODAL_API_URL`
- Modelo desde `options.modelName` o `import.meta.env.VITE_KEV_MODEL` o `'kev-default'`
- Timeout: 15000ms por defecto (`DEFAULT_TIMEOUT_MS`)
- AbortController para cancelación externa

### Validación previa
`isServiceUrlConfigured()` rechaza URLs vacías o que contengan `TU_USUARIO--kev-api.modal.run` (placeholder).

### Resolución de endpoint
`resolveSystemOneEndpoint()` normaliza y garantiza sufijo `/v1/systemone` sin duplicados.

### Gestión de errores
Tipos de error (`TriageErrorCode`): `UNCONFIGURED_SERVICE`, `NETWORK_ERROR`, `TIMEOUT_ERROR`, `HTTP_ERROR`, `INVALID_JSON`, `INVALID_SCHEMA`

Todos los errores se envuelven en `KevClientException`.

## Proxy local (server/proxy.mjs)

### Configuración
- `PORT`: 8787 por defecto
- `KEV_UPSTREAM_URL`: URL del upstream (requerida)
- `KEV_API_KEY`: opcional, añadido como `Authorization: Bearer`
- `ALLOWED_ORIGIN`: `http://localhost:5173` por defecto
- `MAX_BODY_BYTES`: 32768

### Comportamiento
- CORS headers en todas las respuestas
- `OPTIONS` → 204
- Solo acepta `POST` a ruta exacta `/api/kev/v1/systemone` (query ignorada, sin barra final). Otras rutas → 404. `/foo/v1/systemone` → 404.
- Si `KEV_UPSTREAM_URL` no configurada → 503
- Límite de body → 413 si excede
- Reenvía request tal cual al upstream, devuelve respuesta con status original
- En error de conexión → 502 con mensaje genérico (sin exponer clave)
- Logs solo en arranque

**Nota:** El proxy devuelve error 404 con mensaje que sugiere usar `POST /api/kev/v1/systemone` (convención de ruta en uso).

## Modo demostración

Cuando `isDemoMode` está activo, `App.tsx` usa `getDemoFixtureResult()` y evalúa reglas localmente sin llamar al servicio.
