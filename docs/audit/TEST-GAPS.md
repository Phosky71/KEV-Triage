# Gaps de Tests (TEST-GAPS)

Casos de prueba faltantes con ejemplos de entrada/salida esperada.

## 1. Reglas de Negocio (`triage-rules.ts`) - Frontera de Umbrales

**Estado actual:** `src/test/triage-rules.test.ts` existe. Verificar cobertura completa.

| Caso | Entrada | Salida Esperada | Prioridad |
|------|---------|-----------------|-----------|
| **Seguridad - Umbral exacto** | `affirmativeProbability = 0.70` | `securityAlert.triggered = false` | Crítica |
| **Seguridad - Justo por encima** | `affirmativeProbability = 0.7000001` | `securityAlert.triggered = true` | Crítica |
| **Seguridad - 0** | `affirmativeProbability = 0` | `triggered = false` | Alta |
| **Seguridad - 1.0** | `affirmativeProbability = 1.0` | `triggered = true` | Alta |
| **Seguridad - NaN** | `affirmativeProbability = NaN` | Comportamiento definido (¿throw o false?) | Alta |
| **Seguridad - Fuera de rango** | `-0.1` o `1.1` | Validar comportamiento | Alta |
| **Auto-asignación - Umbral exacto** | `confidence = 0.85` | `routing.mode = 'human_review'` | Crítica |
| **Auto-asignación - Justo por encima** | `confidence = 0.8500001` | `routing.mode = 'auto_assign'` | Crítica |
| **Ortogonalidad** | Alta confianza + alta prob seguridad | Ambas reglas activas independientemente | Crítica |
| **Float precision** | `0.1 + 0.2` style | Manejo correcto con > estricto | Media |

## 2. Adaptador (`kev-adapter.ts`) - Formatos de Respuesta

**Estado actual:** `src/test/kev-adapter.test.ts` existe.

| Caso | Entrada | Salida Esperada | Prioridad |
|------|---------|-----------------|-----------|
| **Formato answers** | `{ answers: { department: {...}, severity: {...}, is_security_leak: {...} } }` | Normalización correcta | Alta |
| **Formato questions (array)** | `{ questions: [{id:'department',...}, ...] }` | Correcto | Alta |
| **Formato results** | `{ results: {...} }` | Correcto | Alta |
| **Formato outputs** | `{ outputs: {...} }` | Correcto | Alta |
| **Raíz indexado** | `{ department: {...}, severity: {...}, is_security_leak: {...} }` | Correcto | Alta |
| **Raíz array** | `[{id:'department',...}, ...]` | Correcto | Alta |
| **Múltiples contenedores** | Mismo ID en answers y questions | Comportamiento definido (¿error o prioridad?) | Alta |
| **Department - confidence explícita** | Con `confidence: 0.92` | `confidenceSource: 'explicit_protocol'` | Alta |
| **Department - solo probabilidades** | Sin confidence, con probs ganadora | `confidenceSource: 'winning_option_probability'` | Alta |
| **Department - empate** | Dos opciones con misma prob máxima | Comportamiento definido | Alta |
| **Department - sin confianza** | Sin confidence ni prob ganadora válida | `KevValidationError` | Alta |
| **Severity - index 0-4** | `{ index: 0 }` → `low` | Correcto | Alta |
| **Severity - score 1-5** | `{ score: 5 }` → `emergency` | Correcto | Alta |
| **Severity - score 0** | `{ score: 0 }` → `low` | Correcto | Alta |
| **Severity - level semántico** | `{ level: 'critical' }` | Correcto | Alta |
| **Security leak - yes_probability** | `{ yes_probability: 0.85 }` | `affirmativeProbability: 0.85` | Alta |
| **Security leak - p_yes** | `{ p_yes: 0.75 }` | Correcto | Alta |
| **Security leak - answer true + prob** | `{ answer: true, probability: 0.9 }` | `0.9` | Alta |
| **Security leak - answer false + prob** | `{ answer: false, probability: 0.9 }` | `0.1` | Alta |
| **Security leak - fuera rango** | `1.5` o `-0.1` | `KevValidationError` | Crítica |
| **Latencia - segundos** | `{ latency: 0.5 }` | `modelDeclaredMs: 500` | Media |
| **Latencia - ms** | `{ latency_ms: 150 }` | `150` | Media |
| **Latencia - grande (>10)** | `{ latency: 5000 }` asume ms | `5000` | Media |
| **Metadatos** | `id`, `usage.total_tokens` | Extraídos correctamente | Media |

## 3. Cliente HTTP (`kev-client.ts`) - Abort/Timeout/Errores

**Estado actual:** Sin tests dedicados visibles.

| Caso | Entrada | Salida Esperada | Prioridad |
|------|---------|-----------------|-----------|
| **URL no configurada** | Sin VITE_MODAL_API_URL | `KevClientException` código `UNCONFIGURED_SERVICE` | Crítica |
| **Placeholder detectado** | URL con `TU_USUARIO--kev-api.modal.run` | `UNCONFIGURED_SERVICE` | Crítica |
| **resolveSystemOneEndpoint - base sin sufijo** | `http://x.com/api` | `http://x.com/api/v1/systemone` | Alta |
| **resolveSystemOneEndpoint - ya tiene /v1/systemone** | `http://x.com/v1/systemone` | Sin duplicar | Alta |
| **resolveSystemOneEndpoint - termina en /v1** | `http://x.com/v1` | `http://x.com/v1/systemone` | Alta |
| **resolveSystemOneEndpoint - query string** | `http://x.com/api?key=x` | Comportamiento definido | Media |
| **Timeout** | Servidor no responde | `TIMEOUT_ERROR` tras 15000ms | Crítica |
| **Abort externo antes de fetch** | `signal.aborted = true` | `AbortError` (DOMException) | Alta |
| **Abort externo durante fetch** | Abort después de iniciar | `AbortError` | Alta |
| **Abort por timeout vs externo** | Ambos posibles | Diferenciación correcta | Alta |
| **HTTP 404** | Respuesta 404 | `HTTP_ERROR` con status 404 | Alta |
| **HTTP 500** | Respuesta 500 | `HTTP_ERROR` | Alta |
| **JSON inválido** | Body no JSON válido | `INVALID_JSON` | Alta |
| **Esquema inválido** | JSON válido pero no pasa adaptador | `INVALID_SCHEMA` | Alta |
| **Network error** | fetch rechaza | `NETWORK_ERROR` | Alta |
| **Error body en HTTP error** | 400 con JSON error | Incluir info si es posible (KT-016) | Media |

## 4. Proxy (`server/proxy.mjs`) - Rutas/CORS/Límites

**Estado actual:** Sin tests. Requiere tests de integración/manuales.

| Caso | Entrada | Salida Esperada | Prioridad |
|------|---------|-----------------|-----------|
| **OPTIONS preflight** | `OPTIONS /api/kev/v1/systemone` | 204 con headers CORS | Crítica |
| **Método incorrecto** | `GET /api/kev/v1/systemone` | 404 | Alta |
| **Ruta incorrecta** | `POST /other/path` | 404 con mensaje sugerido | Alta |
| **Ruta termina en /v1/systemone** | `POST /v1/systemone` | Aceptado (si método correcto) | Alta |
| **Sin KEV_UPSTREAM_URL** | Env no configurada | 503 | Alta |
| **Body > 32KB** | Body 33KB | 413 | Crítica |
| **Body justo 32KB** | Body 32KB exacto | Procesado (o rechazado según lógica) | Media |
| **CORS origen válido** | Origin en allowlist | Header con origen | Alta |
| **CORS origen inválido** | Origen no permitido | Comportamiento definido (KT-011) | Alta |
| **Sin Authorization** | Sin KEV_API_KEY | Petición sin header Auth | Media |
| **Con Authorization** | Con KEV_API_KEY | Header `Authorization: Bearer ...` | Media |
| **Upstream error** | fetch lanza error | 502 genérico sin exponer clave | Crítica |
| **Upstream timeout** | Upstream colgado | Timeout con error apropiado (KT-018) | Alta |
| **Stream no drenado** | Body grande rechazado | Conexión cerrada correctamente (KT-017) | Media |

## 5. UI y Concurrencia (`App.tsx`) - Race Conditions

**Estado actual:** `src/test/App.test.tsx` tiene fallos (KT-003). Faltan tests de concurrencia.

| Caso | Entrada | Salida Esperada | Prioridad |
|------|---------|-----------------|-----------|
| **Respuesta obsoleta ignorada** | Request 1 iniciado, luego Request 2, Request 1 responde después | Solo Request 2 se muestra | Crítica |
| **Cambio a modo demo aborta petición** | Petición en curso, toggle demo | Petición abortada, sin setState | Alta |
| **Desmontar componente durante petición** | Unmount mientras loading | Sin warnings React | Alta |
| **Doble click submit** | Click rápido dos veces | Solo una petición | Alta |
| **Entrada vacía** | Submit sin texto | Comportamiento definido (¿deshabilitado?) | Media |
| **Texto muy largo** | Texto > límite razonable | Funciona o validado | Media |
| **Modo demo funciona sin config** | Sin VITE_MODAL_API_URL, modo demo ON | Muestra resultados fixtures | Alta |
| **Error handling** | KevClientException | Muestra TriageError correctamente | Alta |

## 6. E2E / Integración

**Estado actual:** No hay tests E2E. **NO VERIFICADO.**

| Caso | Descripción | Prioridad |
|------|-------------|-----------|
| **Flujo completo demo** | Seleccionar plantilla → Modo demo → Analizar → Ver resultados | Alta |
| **Flujo con proxy local** | Requiere proxy corriendo (NO VERIFICADO en CI) | Media |
| **Todos los escenarios demo** | security_high_conf, frontend_auto_assign, billing_human_review | Alta |

## Recomendaciones

1. **Priorizar tests de frontera** (umbrales exactos) - críticos para reglas deterministas
2. **Añadir tests de adaptador para formatos múltiples** - alta variabilidad esperada
3. **Tests de concurrencia** - bugs sutiles difíciles de detectar manualmente
4. **Tests de proxy** - mejor con supertest o tests manuales documentados
5. **Usar property-based testing** para validaciones de rango/probabilidades (opcional)

## Comando para Ejecutar

```bash
npm test -- --coverage
```
*(Cobertura actual NO VERIFICADA)*
