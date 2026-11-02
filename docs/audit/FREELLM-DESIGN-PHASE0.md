# FREELLM-001 Fase 0 — Diseño (validación previa)

Fecha: 2026-11-01  
Estado: DISEÑO - NO IMPLEMENTADO  
Base: docs/audit/FREELLM-MIGRATION.md, docs/project-state.md  

## 1) Descubrimiento del gateway FreeLLM

### Estado actual
- Según FREELLM-MIGRATION.md: `POST http://127.0.0.1:31415/v1/decisions` responde con `{"error":{"message":"Invalid API key","type":"authentication_error"}}` (requiere auth). 
- No hay esquema completo documentado en repo.
- Se debe verificar qué endpoints expone el gateway real con clave válida (`/v1/models`).

### Opción elegida (propuesta, sujeto a confirmación)
**Opción B: Usar `/v1/decisions` — VERIFICADO y aprobado.** Es el plano nativo de decisiones y está separado del chat.  

**Estado tras verificación (2026-11-02):**
- `/v1/models` confirmado en formato OpenAI estándar (`object: 'list', data[]` con `id`, `name`, `available`, `execution_status`, `supported_parameters`, `context_window`) — ~85 modelos. **Sin campo que distinga modelos de decisión vs chat.**
- **POST `http://127.0.0.1:31415/v1/decisions` VERIFICADO:**
  - Petición: `{"state": "<texto>", "model": "<FREELLM_MODEL o 'auto'>", "questions": {"<id>": {"type": "choice", "instructions": "<enunciado>", "criteria": {"<opcion>": "<descripción>", ...}}}}`
  - Respuesta: `{"object": "decision", "model": "<modelo real>", "provider": "<proveedor>", "answers": {"<id>": {"type": "choice", "choice": "<opcion>", "probabilities": {"<opcion>": <p>, ...}, "confidence": <p>}}, "usage": {"input_tokens": <n>, "output_tokens": <n>}}`
- **Hechos verificados:** Una sola llamada con las 3 preguntas (sin fan-out). `answers[id]+choice+probabilities+confidence` directamente parseable por `kev-adapter`. `is_security_leak` con criteria yes/no funciona (p_yes 0.9664 > 0.70 activó alerta). Router eligió `@cf/cloudflare/clef-flash`. Respuestas repetidas idénticas (posible caché/determinismo). Confianzas reales moderadas (0.33–0.87).
- **Decisión:** Usar **B** (`/v1/decisions`). Traducción ocurre **únicamente en el servidor** (proxy). `adaptKevResponse`/`adaptKevResponsePartial` **no se modifican** NI `triage-rules.ts`.

**Nota:** La app NO debe cambiar; `kev-client.ts` seguirá llamando al endpoint configurado.

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
- **Ruta servidor:** `GET /api/kev/models` (únicamente cuando `UPSTREAM_TYPE=freellm`; en `kev` puede devolver 404 o lista vacía según despliegue) — **APLAZADO a FREELLM-002**.
- **Comportamiento:** consulta `/v1/models` del gateway con `FREELLM_API_KEY` (solo servidor). **Formato confirmado:** OpenAI estándar `object: 'list', data[]` con `id`, `name`, `available`, `execution_status`, `supported_parameters`, `context_window` (~85 modelos). **Sin campo que distinga modelos de decisión vs chat.**
- **Filtrado:** No se puede filtrar aún. **APLAZADO**.
- **Modelos virtuales/router:** `auto`, `fusion`, `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5` (router/slots). Pendiente decisión en FREELLM-002.
- **SELECTOR EN UI:** **APLAZADO a FREELLM-002.** No se implementa selector. El modelo se configura por **`FREELLM_MODEL`** en el proxy (default **`'auto'`**). Documentado en ADR-005.

### Firma de funciones propuestas (ESPECIFICACIÓN VERIFICADA)
```typescript
// server/freellm-translate.mjs
// questions ARRAY de Kev → objeto indexado por id; question → instructions
// descartar options (las claves de criteria SON las opciones)
// department: choice con criteria actual
// severity: choice con criteria indexado por los 5 niveles
// is_security_leak: choice con criteria construido como { yes: "<derivar del criteria string de Kev>", no: "..." }
// añade model: opts.model (FREELLM_MODEL, default 'auto')
export function kevPayloadToGateway(payload: unknown, opts: { model: string }): unknown

// passthrough de answers/model; usage.total_tokens = input_tokens + output_tokens (kev-adapter lo lee)
// conservar provider en metadata si el adapter lo tolera, sin romper su contrato
// si gw no es objeto → dejar que el flujo actual lance KevValidationError
export function gatewayResponseToKevShape(gw: unknown, meta: { model?: string }): unknown

// APLAZADO a FREELLM-002 - no implementar selector
export function gatewayModelsToList(gw: unknown): string[]  // parseo puro; selector aplazado
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
2. Proxy detecta `UPSTREAM_TYPE=freellm`: toma `FREELLM_MODEL` (default `'auto'`) del servidor, traduce payload Kev (array questions → objeto indexado por id, question→instructions, criteria por opciones) a petición para `POST /v1/decisions` con **UNA SOLA LLAMADA** con las 3 preguntas. Añade auth con `FREELLM_API_KEY`.
3. Gateway responde con `{object:'decision', answers:{...}, usage:{input_tokens,output_tokens}, model, provider}`. Proxy traduce a forma Kev compatible con `kev-adapter`: passthrough de `answers/model`, `usage.total_tokens = input_tokens + output_tokens`, conserva `provider` en metadata si es tolerado. **Sin fan-out.**
4. Cliente recibe respuesta en forma Kev → `adaptKevResponse`/`adaptKevResponsePartial` como hoy procesan con KT-025.
5. **Sin selector en UI** (aplazado a FREELLM-002). Modelo se configura vía `FREELLM_MODEL`.

### Aviso visible
Cuando modo real use FreeLLM, mostrar aviso informativo en UI (sin exponer clave/endpoint) indicando uso de proveedor gratuito con posible entrenamiento de datos. **No bloquea ni filtra modelos** (filtrado se aplicará solo cuando se identifiquen los modelos de decisión). 

### ADR-005 (privacidad) — decisión explícita
Se documentará en ADR-005 la decisión explícita del usuario de exponer modelos (inicialmente conforme a lo que se identifique como **modelos de decisión** de `/v1/decisions`), aceptando el riesgo de entrenamiento de datos en proveedores gratuitos. El aviso visible se mantiene pero no actúa como filtro.

## Fan-out por pregunta
**NO hay fan-out.** Contrato verificado: `/v1/decisions` acepta **UNA SOLA LLAMADA** con las 3 preguntas y devuelve las respuestas juntas. **Sin 3 llamadas.**

## Esquema real pendiente
Solo queda por resolver:
- **Formato de lista de modelos:** confirmar si hay forma de distinguir modelos de decisión vs chat (o si todos los devueltos por `/v1/models` son aplicables). Hoy: **sin distinción** en `/v1/models`.
- **Cómo se distinguen los de decisión:** pendiente (dashboard/config o pruebas).
- **Modelos virtuales/router:** decisión final sobre excluir `auto`, `fusion`, `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5` (aplazado a FREELLM-002).

## Conectividad WSL
Si se ejecuta en WSL, verificar conectividad al gateway (puede necesitar IP del host Windows, no `127.0.0.1`). Exportar `FREELLM_API_KEY` en el entorno de WSL. No loggear ni commitear la clave. `.env` fuera del repo.

## 3) Tests entrada→salida esperados (Fase 1) — con fixtures reales verificados
- **kevPayloadToGateway:** array→mapa, `question`→`instructions`, options plegadas en `criteria`, severity con 5 niveles, `is_security_leak` con yes/no (derivar textos exactos de criteria Kev), añade `model: opts.model` (FREELLM_MODEL/default 'auto').
- **gatewayResponseToKevShape + adaptKevResponse** sobre respuesta real verificada: `department='backend'`, `severity='high'`, `is_security_leak` afirmativa 0.9664 → regla 1 dispara alerta (>0.70). `usage.total_tokens = input_tokens + output_tokens` mapeado. `model`/`provider` preservados.
- **Respuesta malformada** (campo alucinado) → `adaptKevResponsePartial` con parciales; `adaptKevResponse` lanza; UI renderiza parciales (KT-025).
- **401/403/429/5xx** del gateway → error global mapeado, sin crasheo.
- **Timeout/abort** → cancelación limpia.
- **UPSTREAM_TYPE** conmuta upstream; sin `VITE_FREELLM_*` ni secretos en cliente (grep).
- **Config inválida** → modo demo.
- **Sin fan-out:** UNA sola llamada al gateway por análisis (assert).
- **Sin selector:** verificar que no hay selector implementado (aplazado a FREELLM-002).
**Hoy:** ejecutar para confirmar qué fallan (la funcionalidad FreeLLM no existe aún).

## 4) Verificación Fase 2
- `tsc --noEmit`, `build`, todos tests existentes (131 hoy; **SIN MODIFICAR**, solo adiciones).
- Cobertura ramas `kev-client.ts`, `server/proxy.mjs` y `server/freellm-translate.mjs` antes/después con números.
- Sanity checks con restauración:
  - (a) rompe el mapeo de `usage.total_tokens` → el test de metadata falla;
  - (b) invierte las claves `yes/no` en la traducción de `is_security_leak` → el test de alerta de seguridad falla (invariante);
  - (c) rompe un campo de la traducción → parcial KT-025 renderizado (no error global). Restaurar y pegar los tres resultados.

## 5) Cierre Fase 3
- ADR-005 (integración, privacidad: datos van a proveedores del gateway y el usuario lo acepta; aviso visible informativo en modo real; confianzas moderadas 0.33–0.87 documentadas; selector aplazado a FREELLM-002 con experimentos anotados: parámetro model con valor inválido y con modelo del plano de chat).
- FREELLM-MIGRATION.md → **implementado**.
- project-state.md actualizado.
- Commits atómicos `docs(FREELLM-001): ...`, `feat(FREELLM-001): ...`, `test(FREELLM-001): ...`
- Push a origin/main
- Tabla final: commits, tests totales (131 existentes + nuevos), cobertura antes/después, lista de modelos que expone el gateway.

**Reglas duras:** nunca loggear ni commitear `FREELLM_API_KEY`; `.env` fuera del repo (verificado en `.gitignore`); mensajes de error del proxy sin detalles del upstream. Sin reintentos salvo documentados y aprobados.