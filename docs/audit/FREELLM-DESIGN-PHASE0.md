# FREELLM-001 Fase 0 — Diseño (validación previa)

Fecha: 2026-11-01  
Estado: DISEÑO - NO IMPLEMENTADO  
Base: docs/audit/FREELLM-MIGRATION.md, docs/project-state.md  

## 1) Descubrimiento del gateway FreeLLM

### Estado actual
- Según FREELLM-MIGRATION.md: `POST http://127.0.0.1:31415/v1/decisions` responde con `{"error":{"message":"Invalid API key","type":"authentication_error"}}` (requiere auth). 
- No hay esquema completo documentado en repo.
- Se debe verificar qué endpoints expone el gateway real con clave válida (`/v1/models`).

### Opción elegida (propuesta, sujeto a confirmación tras curl con clave)
**Opción A: Usar `/v1/chat/completions` (compatible OpenAI)** si el gateway expone ese endpoint y permite forzar salida JSON estructurada con system/user prompts.  
**Opción B: Usar `/v1/decisions`** si es el contrato nativo del gateway.

**Criterios de elección:**
- Si `/v1/models` existe y lista modelos bajo `/v1/chat/completions` estándar OpenAI → preferir **A** (más predecible, fácil de traducir con system prompt forzando JSON).
- Si el gateway documenta/expone únicamente `/v1/decisions` con esquema propio → usar **B** pero requerirá `adaptFreeLLMResponse` nuevo con validación estricta.
- En ambos casos, la traducción ocurre **únicamente en el servidor** (proxy) y la respuesta se re-empaqueta a la **misma forma** que Kev (`answers`/contenedores + campos esperados por `kev-adapter.ts`).

**Nota:** La app NO debe cambiar; `kev-client.ts` seguirá llamando al endpoint configurado. `adaptKevResponse`/`adaptKevResponsePartial` **no se modifican** salvo justificación explícita y aprobada.

## 2) Arquitectura propuesta (al estilo KT-025)

### Principios
- Clave NUNCA al cliente. Solo en servidor: `FREELLM_BASE_URL`, `FREELLM_API_KEY`, `FREELLM_MODEL` (env servidor). Sin `VITE_*` con secretos.
- Proxy conmutable: `UPSTREAM_TYPE=kev|freellm` (o rutas distintas). Por defecto `kev`.
- Traducción en proxy: recibe payload Kev (`buildSystemOnePayload`) → convierte a petición gateway (system prompt que exige JSON con `department`, `severity`, `is_security_leak` en forma compatible con Kev) → devuelve respuesta en forma Kev.
- Base KT-025: usar `adaptKevResponsePartial` para parciales (modelos gratuitos malforman con frecuencia). 
- Modelo/proveedor real expuesto en metadata/modelo (con fallback). RTT medido como hoy.
- Config inválida → modo demo.
- Privacidad: **SIN whitelist de modelos.** Se muestran y pueden usarse **todos y cada uno** de los modelos disponibles en el gateway. Decisión explícita del usuario aceptando el riesgo de entrenamiento de datos en proveedores gratuitos. El aviso visible en modo real se **mantiene** (informativo), pero **no bloquea ni filtra**.
- Robustez: timeouts/AbortSignal, mapeo 401/403/429/5xx. Payload no-objeto → `KevValidationError` (igual que hoy). Sin reintentos o reintentos mínimos documentados.

### Componentes
- `server/proxy.mjs` (modificado): selección upstream por `UPSTREAM_TYPE`, validación esquema URL, traducción Kev↔gateway, re-empaquetado a forma Kev, timeouts/abort, headers sin filtrar secretos, ruta **GET /api/kev/models** para listar modelos del gateway (solo servidor, con `FREELLM_API_KEY`).
- `server/freellm-translate.mjs` (nuevo): funciones puras de traducción/testables (`kevPayloadToGateway`, `gatewayResponseToKevShape`, **`gatewayModelsToList(gw): string[]`**).
- `src/lib/kev-client.ts`: sin cambios funcionales; sigue llamando endpoint configurado. Sin `VITE_*` secretos.
- `src/App.tsx`: en modo real con `UPSTREAM_TYPE=freellm`, muestra **selector con TODOS** los modelos disponibles cargados desde `GET /api/kev/models`. Por defecto: `FREELLM_MODEL`; si no está, el primero de la lista. El modelo seleccionado viaja en el payload como hoy (`buildSystemOnePayload` ya acepta `modelName`). Ningún modelo se filtra ni excluye. Usa parseo parcial como hoy.
- `src/lib/triage-rules.ts`: **intacto**.
- `src/lib/kev-adapter.ts`: **sin modificaciones** salvo justificación aprobada.

### Descubrimiento de modelos (NUEVO)
- **Ruta servidor:** `GET /api/kev/models` (únicamente cuando `UPSTREAM_TYPE=freellm`; en `kev` puede devolver 404 o lista vacía según despliegue).
- **Comportamiento:** consulta `/v1/models` del gateway con `FREELLM_API_KEY` (solo servidor), devuelve **lista COMPLETA de IDs** sin secretos ni URLs con credenciales. Caché con TTL corto opcional (documentado si se añade).
- **Cliente:** carga lista al inicializar/activar modo real con FreeLLM, popula selector con **todos** los modelos sin filtrado.

### Firma de funciones propuestas
```typescript
// server/freellm-translate.mjs
export function kevPayloadToGateway(input: unknown, opts: { model: string, systemPrompt?: string }): unknown
export function gatewayResponseToKevShape(gw: unknown, meta: { model?: string }): unknown  // devuelve forma compatible con kev-adapter
export function gatewayModelsToList(gw: unknown): string[]  // parseo puro de lista de modelos del gateway
```

### Tipos (conceptuales)
```typescript
type UpstreamType = 'kev' | 'freellm';
interface ProxyConfig {
  upstreamType: UpstreamType;
  kevUpstreamUrl?: string;
  freellmBaseUrl?: string;      // servidor
  freellmApiKey?: string;       // servidor
  freellmModel?: string;        // servidor
}
```

### Variables de entorno
**Servidor (proxy):**
- `UPSTREAM_TYPE=kev|freellm` (default `kev`)
- `KEV_UPSTREAM_URL`, `KEV_API_KEY` (existentes)
- `FREELLM_BASE_URL` (ej. `http://127.0.0.1:31415/v1` o según elección `/v1/chat/completions` o `/v1/decisions`)
- `FREELLM_API_KEY` (obligatoria si `freellm`)
- `FREELLM_MODEL` (recomendado)

**Cliente (Vite):** **Sin secretos**. Solo `VITE_MODAL_API_URL` (endpoint del proxy o directo según despliegue), `VITE_KEV_MODEL` opcional. **Nunca** `VITE_FREELLM_*`.

### Flujo
1. Cliente envía payload Kev a `POST /api/kev/v1/systemone` (ruta actual) vía proxy o directo.
2. Proxy detecta `UPSTREAM_TYPE=freellm`: traduce payload Kev → gateway request con system prompt forzando JSON con claves `department`, `severity`, `is_security_leak` (estructura que `kev-adapter` entienda). Añade auth con `FREELLM_API_KEY`.
3. Gateway responde (puede ser malformado). Proxy traduce respuesta → forma Kev (`answers`/contenedores o estructura esperada).
4. Cliente recibe respuesta en forma Kev → `adaptKevResponsePartial`/flujo actual procesa con KT-025.
5. UI (modo real + freellm) permite seleccionar **cualquier modelo** de la lista devuelta por `GET /api/kev/models`; modelo seleccionado viaja como `modelName` en payload.

### Aviso visible
Cuando modo real use FreeLLM, mostrar aviso informativo en UI (sin exponer clave/endpoint) indicando uso de proveedor gratuito con posible entrenamiento de datos. **No bloquea ni filtra modelos.** 

### ADR-005 (privacidad) — decisión explícita
Se documentará en ADR-005 la decisión explícita del usuario de **exponer todos los modelos** disponibles en el gateway, aceptando el riesgo de entrenamiento de datos en proveedores gratuitos. El aviso visible se mantiene pero no actúa como filtro.

## 3) Tests entrada→salida esperados (Fase 1)
- Payload válido gateway → `adaptKevResponse` OK con model correcto.
- Respuesta malformada (JSON alucinado) → `adaptKevResponsePartial` con parciales; `adaptKevResponse` lanza; UI renderiza parciales.
- 401/403 gateway → error global, sin crasheo.
- Timeout/abort → cancelación limpia.
- Ninguna var `VITE_*` ni código cliente contiene clave/endpoint con credenciales.
- Proxy: tests traducción ambos sentidos (Kev→gateway, gateway→forma Kev).
- Ruta de modelos del proxy devuelve todos los IDs del gateway (mock de `/v1/models`).
- El selector renderiza todos los modelos recibidos, sin filtrado.
- El modelo seleccionado por el usuario llega en la petición al gateway (assert en traducción `kevPayloadToGateway`).
- Modelo inexistente o retirado (gateway responde error de modelo) → error global mapeado, sin crasheo.
- Ninguna respuesta del proxy al cliente contiene la clave ni endpoint con credenciales.
**Hoy:** ejecutar para confirmar qué fallan (ninguno relacionado con FreeLLM debe fallar aún). 

## 4) Verificación Fase 2
- `tsc --noEmit`, `build`, todos tests existentes (131 hoy; solo adiciones).
- Cobertura ramas `kev-client.ts` y módulo proxy antes/después.
- Sanity checks con restauración:
  - (a) simula un gateway que devuelve N modelos y verifica que el selector muestra los N;
  - (b) rompe la traducción de un campo y verifica que el parcial KT-025 se renderiza. Restaura y pega ambos resultados.

## 5) Cierre Fase 3
- ADR-005 (integración y privacidad), actualizar FREELLM-MIGRATION.md (implementado/superado), actualizar project-state.md (ya no "investigación").
- Commits atómicos `feat(FREELLM-001): ...`, `test(FREELLM-001): ...`
- Push a origin/main
- Tabla final con commits/tests/cobertura/whitelist final

**Acción requerida:** Aprueba diseño y whitelist propuesta, o indica cambios. No se implementa hasta aprobación. Para confirmar endpoint real: tras aprobación ejecutar `curl -H "Authorization: Bearer $FREELLM_API_KEY" http://127.0.0.1:31415/v1/models` y compartir resultado.