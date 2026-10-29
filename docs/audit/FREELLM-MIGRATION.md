# Propuesta de Migración a FreeLLM API (`/v1/decisions`)

**Fecha:** 2026-10-29  
**Estado:** SOLO PROPUESTA - NO IMPLEMENTADA  
**Endpoint objetivo:** `POST http://127.0.0.1:31415/v1/decisions`  
**Base URL:** `http://127.0.0.1:31415/v1`

## 1. Investigación del Contrato

### Búsqueda en repo
- **Resultado:** NO se encontró especificación de `/v1/decisions` en ningún archivo del repositorio.
- **Archivos revisados:** `README.md`, toda `docs/`, código fuente completo.

### Prueba controlada
Se intentó petición POST a `http://127.0.0.1:31415/v1/decisions`:
```json
{"test":true}
```
**Respuesta:** `{"error":{"message":"Invalid API key","type":"authentication_error"}}`

**Conclusión:** El servicio **SÍ está accesible** (responde), requiere autenticación. **NO VERIFICADO** el esquema completo de request/response sin API key válida.

## 2. Comparación de Contratos

### Contrato actual: Kev `/v1/systemone`
```typescript
{
  state: string,
  model: string,
  questions: [
    { id: 'department', type: 'choice', options: [...], criteria: {...} },
    { id: 'severity', type: 'score', levels: [...], criteria: {...} },
    { id: 'is_security_leak', type: 'noul', criteria: string }
  ]
}
```
Respuesta flexible, normalizada por `kev-adapter.ts` para obtener:
- `department`: `{ selected, confidence, confidenceSource, probabilities? }`
- `severity`: `{ level, ordinal, rawScore, confidence?, probabilities?, legend }`
- `securityLeak`: `{ affirmativeProbability, rawAnswer? }`

### Contrato propuesto: FreeLLM `/v1/decisions`
**ESQUEMA DESCONOCIDO** - Requiere descubrimiento con API key válida o documentación.

**Campos críticos para mantener lógica actual:**
| Campo | Requerido por | Estado | Notas |
|-------|---------------|--------|-------|
| **Probabilidad afirmativa filtración** | Regla 1 (> 0.70) | **DESCONOCIDO** | Crítico |
| **Confianza departamento** | Reglas 2/3 (> 0.85 / <=0.85) | **DESCONOCIDO** | Crítico |
| **Probabilidades por opción** | `confidenceSource: 'winning_option_probability'` | **DESCONOCIDO** | Importante |
| **Distribución severidad** | Opcional pero usado | **DESCONOCIDO** | Menor |
| **ID/metadata** | Tracking | **DESCONOCIDO** | Menor |

**Riesgo:** Si `/v1/decisions` no devuelve **probabilidades calibradas** o **confianza** en formato usable, las reglas deterministas con umbrales fijos pierden validez.

## 3. Diseño de Integración (Respetando ADR-001)

### Principio: Patrón Provider sin tocar `triage-rules.ts`

Seguir separación de capas:
```
UI → Provider Interface → [KevProvider | FreeLLMProvider] → Adapter → triage-rules (SIN CAMBIOS)
```

### Interfaz TypeScript propuesta

```typescript
// src/providers/types.ts
export interface TriageProvider {
  name: 'kev' | 'freellm';
  buildPayload(incidentText: string, modelName?: string): unknown;
  callEndpoint(payload: unknown, options: CallOptions): Promise<unknown>;
  getDefaultEndpoint(): string;
}

// src/providers/kev-provider.ts
export class KevProvider implements TriageProvider {
  name = 'kev' as const;
  buildPayload(...) { return buildSystemOnePayload(...); }
  callEndpoint(...) { /* usa lógica actual kev-client */ }
  getDefaultEndpoint() { return '/v1/systemone'; }
}

// src/providers/freellm-provider.ts
export class FreeLLMProvider implements TriageProvider {
  name = 'freellm' as const;
  buildPayload(...) { /* transformar a formato /v1/decisions */ }
  callEndpoint(...) { /* llamar a 127.0.0.1:31415 */ }
  getDefaultEndpoint() { return '/v1/decisions'; }
}

// src/lib/provider-adapter.ts - NUEVO ADAPTADOR
export function adaptFreeLLMResponse(raw: unknown): KevNormalizedResult {
  // Mapear respuesta FreeLLM al formato KevNormalizedResult
  // Debe producir department.confidence, severity, securityLeak.affirmativeProbability
}
```

### Cambios en Cliente (`kev-client.ts`)

Refactorizar para usar provider:
```typescript
// Selección por variable de entorno
const provider = import.meta.env.VITE_TRIAGE_PROVIDER === 'freellm' 
  ? new FreeLLMProvider() 
  : new KevProvider();
```

### Cambios en Proxy (`server/proxy.mjs`)

Soportar ambos upstreams:
```javascript
const PROVIDER = process.env.TRIAGE_PROVIDER || 'kev';
const UPSTREAM_URL = PROVIDER === 'freellm' 
  ? process.env.FREELLM_UPSTREAM_URL  // http://127.0.0.1:31415/v1
  : process.env.KEV_UPSTREAM_URL;
const ROUTE = PROVIDER === 'freellm' ? '/v1/decisions' : '/v1/systemone';
// Añadir auth si necesario
if (FREELLM_API_KEY) headers['Authorization'] = `Bearer ${FREELLM_API_KEY}`;
```

### Variables de Entorno Nuevas

**Cliente (Vite):**
```env
VITE_TRIAGE_PROVIDER=freellm  # o 'kev' (default)
VITE_FREELLM_API_URL=http://127.0.0.1:31415/v1  # opcional si usa proxy
```

**Proxy (Node):**
```env
TRIAGE_PROVIDER=freellm
FREELLM_UPSTREAM_URL=http://127.0.0.1:31415/v1
FREELLM_API_KEY=sk-****  # REQUERIDO según respuesta de auth
```

## 4. Riesgos y Relación con ADR-002

### Riesgo Crítico: Probabilidades no calibradas

**Problema:** Los umbrales 0.70 (>0.70 para alerta seguridad) y 0.85 (>0.85 auto-asignación) fueron diseñados asumiendo **probabilidades bien calibradas** del modelo Kev.

Si FreeLLM:
- Devuelve scores 0-100 sin normalizar a [0,1]
- Devuelve logits sin softmax
- Devuelve confidence de forma diferente (no probabilidades)
- No calibra probabilidades

**Impacto en ADR-002:** El fundamento "umbral estricto para evitar decisiones ambiguas" sigue válido **SOLO SI** las probabilidades son comparables. Si no lo son, los umbrales son arbitrarios e incorrectos.

### Alternativas Propuestas

1. **Pedir probabilidades explícitas** - Modificar payload para solicitar distribución probabilística
2. **Recalibrar umbrales** - Recopilar datos, analizar distribución, ajustar umbrales con validación
3. **Usar ranking relativo** - En lugar de umbrales absolutos, usar percentiles o top-k
4. **Añadir capa de calibración** - Platt scaling o isotonic regression (complejo, requiere datos)
5. **Hacer umbrales configurables** - Permitir ajuste via env vars mientras se calibra

**Recomendación:** **NO migrar hasta tener**:
- Esquema completo de `/v1/decisions` (request + response)
- Confirmación de que devuelve probabilidades en [0,1] o forma convertible
- Validación de calibración con casos de prueba reales

## 5. Impacto en Despliegue

### Local (127.0.0.1)
- **OK** para desarrollo
- Requiere FreeLLM API corriendo localmente

### Docker
- **PROBLEMA:** `127.0.0.1` dentro del contenedor apunta al **propio contenedor**, no al host
- **Solución:** Usar `host.docker.internal` (Docker Desktop) o `172.17.0.1` (Linux) o red host
- **Configuración:** `FREELLM_UPSTREAM_URL=http://host.docker.internal:31415/v1`

### Producción
- **CRÍTICO:** `127.0.0.1` **NO funciona** fuera de la máquina local
- **Requiere:** Desplegar FreeLLM API accesible remotamente con HTTPS
- **Red:** Firewall, VPN, o servicio en cloud
- **Autenticación:** Obligatoria (se detectó error 401)
- **Latencia:** Mayor si remoto vs local

### Consideraciones de Red
- Si proxy y FreeLLM en mismo host: OK con 127.0.0.1
- Si en contenedores separados: usar red Docker compartida
- Si frontend directo (sin proxy): CORS crítico

## 6. Estrategia de Pruebas

### Fixtures
Crear fixtures para respuesta FreeLLM:
```typescript
// src/lib/freellm-fixtures.ts
export const FREELLM_FIXTURES = { ... }
```

### Contract Tests
Validar que `adaptFreeLLMResponse` produce `KevNormalizedResult` válido:
- Todas las propiedades requeridas presentes
- Probabilidades en [0,1]
- Confianza válida
- Umbrales aplicables

### Pruebas de Integración
1. Modo mock con fixtures
2. Conexión real a FreeLLM local (con API key)
3. Comparar decisiones con Kev para mismos inputs

### Rollback Plan
Mantener provider Kev como default, feature flag via `VITE_TRIAGE_PROVIDER`

## 7. Recomendación Final

**NO MIGRAR AHORA.** Se requiere:
1. Obtener esquema completo de `/v1/decisions` (con autenticación válida)
2. Verificar formato de probabilidades/confianza
3. Validar calibración vs umbrales actuales
4. Implementar patrón provider (no invasivo)
5. Pruebas con datos reales
6. Actualizar ADR-002 si umbrales cambian

**Siguiente paso:** Solicitar documentación de FreeLLM API o probar con API key válida para descubrir esquema.
