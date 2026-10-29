# AUDIT REPORT - Kev Triage

**Fecha:** 2026-10-29  
**Auditor:** QA/Seguridad/Arquitectura (Senior)  
**Repositorio:** `C:\Trabajo\Proyectos\zSinRevisar\kev-triage`  
**Stack:** React 18 + TypeScript + Vite 6 + Tailwind 3 + Vitest + Node.js proxy nativo

## 1. Resumen Ejecutivo (máx. 10 líneas)

- **Estado general:** Proyecto funcional con arquitectura en capas bien definida, pero con fallos críticos de build/test que impiden validación completa.
- **Hallazgos totales:** 24 (Crítica: 4 | Alta: 6 | Media: 8 | Baja: 4 | Info: 2)
- **Build:** **FALLA** - Errores TypeScript en `kev-client.ts` (acceso a `import.meta.env` sin tipos) y `vite.config.ts` (incompatibilidad de tipos entre Vite/Vitest).
- **Typecheck:** **PASA** - `npx tsc --noEmit` sin errores.
- **Tests:** **FALLA** - 3 tests fallidos en `App.test.tsx` (18 tests totales: 15 pasados, 3 fallidos). 2 suites pasadas, 1 fallida.
- **npm audit:** **6 vulnerabilidades** (2 críticas, 1 alta, 3 moderadas) - todas en cadena de dependencias de Vitest/Vite/esbuild/tinypool.
- **Git:** **NO ES REPOSITORIO GIT** - No se puede verificar historial.
- **Principal riesgo:** Inconsistencia entre `tsc` standalone y `tsc -b` (project references) + configuración Vite/Vitest incompatible.

## 2. Resultado de build, tests, typecheck y npm audit

### Comandos ejecutados

| Comando | Resultado | Evidencia |
|---------|-----------|-----------|
| `node --version` | **OK** | `v24.21.0` |
| `npm ci` | **OK** | 351 paquetes instalados, 6 vulnerabilidades reportadas |
| `npm run build` | **FALLA** | `tsc -b && vite build` falla con errores TS2339 y TS2769 |
| `npx tsc --noEmit` | **PASA** | Sin salida (exit code 0) |
| `npm test` | **FALLA** | 1 test file fallido (`App.test.tsx`), 3 tests fallidos, 15 pasados |
| `npm run lint` | **NO EJECUTADO** | No solicitado explícitamente pero disponible en package.json |
| `npm audit` | **FALLA (vulnerabilidades)** | 6 vulnerabilidades (2 críticas, 1 alta, 3 moderadas) |

### Salidas relevantes

#### Build errors
```text
src/lib/kev-client.ts(78,41): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/lib/kev-client.ts(120,17): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/lib/kev-client.ts(136,39): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
vite.config.ts(5,13): error TS2769: No overload matches this call. (incompatibilidad tipos Vite/Vitest)
```
**Evidencia:** `npm run build` ejecutado en `C:\Trabajo\Proyectos\zSinRevisar\kev-triage`

#### Test failures
```text
Test Files  1 failed | 2 passed (3)
     Tests  3 failed | 15 passed (18)
FAIL  src/test/App.test.tsx
```
**Evidencia:** `npm test` ejecutado

#### npm audit
```text
6 vulnerabilities (3 moderate, 1 high, 2 critical)
- @vitest/mocker <=4.1.11 (moderate)
- esbuild <=0.24.2 (moderate) 
- tinypool <=2.1.1 (critical x2)
- vite/esbuild chain (moderate/high)
```
**Evidencia:** `npm audit` ejecutado

## 3. Tabla de Hallazgos

| ID | Severidad | Área | Archivo:línea | Descripción | Evidencia | Impacto | Corrección recomendada | Esfuerzo (S/M/L) |
|---|---|---|---|---|---|---|---|---|
| KT-001 | **Crítica** | Build/Config | `src/lib/kev-client.ts:78,120,136` | Acceso a `import.meta.env` sin tipos de Vite. `tsconfig.app.json` no incluye tipos de Vite (`"types": ["vite/client"]`) o falta configuración. | `npm run build` falla con TS2339. `npx tsc --noEmit` pasa (diferente config). | Build de producción falla. No se puede desplegar. | Añadir `"types": ["vite/client"]` a `tsconfig.app.json` o declarar `interface ImportMeta { env: ImportMetaEnv }`. Verificar `vite.config.ts` types. | S |
| KT-002 | **Crítica** | Build/Config | `vite.config.ts:1-20` | Incompatibilidad de tipos entre `vite` y `vitest/node_modules/vite`. Causado por versiones anidadas o resolución de tipos. | `npm run build` falla con TS2769 en defineConfig. | Build falla. | Alinear versiones o usar `as const` / importar desde paquete correcto. Considerar `/// <reference types="vitest" />` o restructuring. | M |
| KT-003 | **Crítica** | Tests | `src/test/App.test.tsx:74` | Test falla: `getByLabelText(/Descripción técnica de la incidencia/i)` encuentra múltiples elementos o ninguno correctamente. | `npm test` muestra error "Found multiple elements" o similar. | Suite de tests roja. CI fallaría. | Revisar `IncidentInput.tsx` - verificar labels únicos, usar `getAllByLabelText` o `getByRole` con más específico. | S |
| KT-004 | **Crítica** | Seguridad/Deps | `package-lock.json` | 6 vulnerabilidades (2 críticas: tinypool prototype pollution RCE, 1 alta, 3 moderadas). | `npm audit` output. | Riesgo de RCE en entorno de desarrollo/build si se explota. | Ejecutar `npm audit fix` con cuidado. Si requiere breaking change a vitest@5, evaluar. Considerar actualizar dependencias. | M |
| KT-005 | **Alta** | Adaptador | `src/lib/kev-adapter.ts:96-160` | `parseDepartmentNode`: Si hay distribución pero opción ganadora sin probabilidad válida y sin `confidence` explícita, lanza error. Pero no valida que probabilidades sumen ~1.0. Empates no manejados explícitamente. | Código revisado líneas 96-160. Tests `kev-adapter.test.ts` existen. | Respuestas con empates o distribuciones mal calibradas pueden fallar inesperadamente. | Añadir validación de suma de probabilidades (tolerancia), manejo explícito de empates, logging/diagnóstico mejorado. | M |
| KT-006 | **Alta** | Adaptador | `src/lib/kev-adapter.ts:167-235` | `parseSeverityNode`: Acepta `index` 0-4, score 1-5, score 0→low. Pero si `rawScore` es string numérico o formatos raros no se manejan. También `node.index` tiene prioridad implícita. | Código líneas 167-235. | Interpretación ambigua de severidad. | Documentar prioridad, añadir tests para casos límite, validar rangos estrictamente. | S |
| KT-007 | **Alta** | Adaptador | `src/lib/kev-adapter.ts:241-289` | `parseSecurityLeakNode`: Lógica compleja con múltiples fallbacks. Si `answer` es true pero probabilidad viene como 1-confidence sin razón clara, o viceversa. Riesgo de inversión. | Líneas 241-289. | Falso positivo/negativo en detección de filtración de secretos. | Simplificar lógica, añadir tests para inversión, validar consistencia answer+prob. | M |
| KT-008 | **Alta** | Cliente | `src/lib/kev-client.ts:60-91` | `resolveSystemOneEndpoint`: No maneja query strings, fragmentos, URLs con usuario:pass, o protocolos no http(s). `isServiceUrlConfigured` solo comprueba placeholder y protocolo. | Código revisado. | URLs malformadas pueden generar peticiones inesperadas. | Normalizar más agresivamente (remover query/hash), validar host, rechazar credenciales en URL. | S |
| KT-009 | **Alta** | Cliente | `src/lib/kev-client.ts:141-158,219-244` | Gestión de timeout/abort: `timeoutController` aborta por timeout, `options.signal` externo también. Si ambos abultan, lógica de `didTimeout` puede confundir. `onExternalAbort` se añade con `{once:true}` pero `clearTimeout` solo en algunos paths. Posible fuga si excepciones. | Líneas 141-158, 219-244. | Comportamiento confuso en cancelación, posible leak de listeners/timers. | Refactorizar con `AbortSignal.any` o lógica más clara, asegurar cleanup en todos los paths. | M |
| KT-010 | **Alta** | Proxy | `server/proxy.mjs:24-28` | Condición `req.method !== 'POST' || !req.url?.endsWith('/v1/systemone')` rechaza todo lo que no termine en `/v1/systemone`. Pero doc dice "ruta que termine en `/v1/systemone`" y también menciona `POST /api/kev/v1/systemone`. El mensaje de error dice "Use POST /api/kev/v1/systemone" pero la ruta real aceptada es cualquier path que termine en `/v1/systemone`. | Código línea 24-28, docs/api.md:105,112. | Confusión en enrutamiento. Si cliente envía a `/v1/systemone` directo al proxy (sin prefijo `/api/kev`), podría funcionar o no según cómo se despliegue. Inconsistencia doc vs código. | Aclarar comportamiento, soportar ambas rutas explícitamente, o actualizar docs. Añadir logging de ruta recibida. | S |
| KT-011 | **Alta** | Proxy | `server/proxy.mjs:15-23,30-38,75-87` | CORS se aplica a TODAS las respuestas (incluidas 404/503/413/502). `Access-Control-Allow-Origin` usa `ALLOWED_ORIGIN` directamente sin validación/reflexión, sin `Vary: Origin`. Si origen no coincide, sigue enviando header con valor fijo (puede ser problemático). No maneja `Access-Control-Allow-Credentials`. | Líneas 15-23. | Configuración CORS potencialmente incorrecta en despliegue multi-origen. | Validar origen contra allowlist, reflejar si válido, añadir `Vary: Origin`, considerar credentials. | M |
| KT-012 | **Media** | UI/Concurrencia | `src/App.tsx:35-38,85-141` | `activeRequestIdRef` previene race conditions correctamente. Pero si componente se desmonta durante petición, `setState` en `finally` solo comprueba `requestId` pero podría haber fugas. También `abortControllerRef.current` no se limpia siempre. | Código revisado. | Posibles warnings React "setState on unmounted component" en casos raros. | Añadir flag `mounted` o usar cleanup effect. Limpiar abortController en unmount. | S |
| KT-013 | **Media** | UI/Concurrencia | `src/App.tsx:68-78,94-101` | Al cambiar a modo demo se aborta petición en curso. Pero `executeAnalysis` comprueba `isLoading` al inicio y retorna si true. Transiciones entre modos pueden dejar estados inconsistentes. | Líneas 68-78, 94-101. | UX confusa, estados inconsistentes. | Revisar lógica de estados, añadir tests. | S |
| KT-014 | **Media** | Adaptador | `src/lib/kev-adapter.ts:44-54,60-90` | `extractQuestionNode` busca en múltiples contenedores con orden fijo `[root.answers, root.questions, root.results, root.outputs, root]`. Si misma pregunta aparece en varios con datos diferentes, toma el primero encontrado. Sin warning/log. | Líneas 60-90. | Ambigüedad silenciosa. | Añadir detección de colisiones, preferir formato más explícito, documentar prioridad. | S |
| KT-015 | **Media** | Adaptador | `src/lib/kev-adapter.ts:308-327` | Normalización latencia: Si `root.latency` < 10 asume segundos y multiplica por 1000, sino milisegundos. Heurística frágil. | Líneas 308-327. | Conversión incorrecta de latencia en casos borde. | Ser más explícito con unidades, o requerir campo con unidad. | S |
| KT-016 | **Media** | Cliente | `src/lib/kev-client.ts:174-195` | Si `response.ok` es false, se lanza `HTTP_ERROR` sin leer cuerpo de respuesta (puede tener detalles útiles). Solo usa status/statusText. | Líneas 174-195. | Diagnóstico pobre para errores HTTP. | Intentar leer cuerpo (json/text) con límite para obtener detalles. | S |
| KT-017 | **Media** | Proxy | `server/proxy.mjs:40-51` | Límite de 32KB: se acumula en `body` string concatenando chunks. Se comprueba `receivedBytes > MAX_BODY_BYTES` y responde 413, pero **NO se destruye el stream/request** (solo se retorna). El cliente puede seguir enviando datos. También se usa string concatenation (eficiente para 32KB pero no óptimo). | Líneas 40-51. | Proxy puede quedar colgado esperando resto de datos, consumo de recursos. | Llamar `req.destroy()` o `req.resume()` para drenar, cerrar conexión. | M |
| KT-018 | **Media** | Proxy | `server/proxy.mjs:62-86` | No hay timeout hacia upstream (`fetch` sin timeout). Cold starts pueden colgar indefinidamente. Tampoco se maneja `AbortController` para upstream. | Líneas 66-78. | Proxy puede colgar, conexiones agotadas. | Añadir timeout con AbortController al fetch upstream. | M |
| KT-019 | **Media** | Seguridad | `docs/security.md` vs código | Doc afirma "Nunca loggea KEV_API_KEY" y "Errores genéricos al fallar conexión upstream". En código: no hay `console.log` de clave, pero tampoco hay protección explícita. En `catch` línea 78-86 solo loggea nada, devuelve genérico. Correcto. Pero falta `Vary: Origin` para CORS, falta rate limiting. | Revisado. | Documentación parcialmente correcta. | Actualizar docs con limitaciones reales. | S |
| KT-020 | **Media** | Docs | `docs/architecture.md:24` | Dice "Adaptador estricto" pero código es flexible (acepta múltiples formatos). Contradicción menor. | Línea 24. | Confusión terminológica. | Decir "Adaptador robusto y flexible con validación estricta". | S |
| KT-021 | **Media** | Docs | `docs/api.md:105,112` vs `server/proxy.mjs:24-28` | Inconsistencia: doc dice "Solo acepta `POST` a ruta que termine en `/v1/systemone` → 404 si no coincide" (correcto) y también mensaje sugiere `POST /api/kev/v1/systemone`. Pero no aclara que acepta CUALQUIER path que termine en `/v1/systemone`. | Ambos archivos. | Confusión para integradores. | Clarificar comportamiento exacto. | S |
| KT-022 | **Baja** | Config | `package.json` | Sin campo `engines` (Node/npm). README dice "Node.js >= v20.11.0" pero no hay enforcement. | package.json completo. | Usuarios con Node antiguo pueden tener errores crípticos. | Añadir `"engines": {"node": ">=18.18.0 || >=20.11.0 || >=22.0.0"}`. | S |
| KT-023 | **Baja** | Config | `.gitignore` | Revisar si existe y cubre `.env`, `node_modules`, `dist`. README dice "No commitear .env (está en `.gitignore`)". | `.gitignore` existe (leído en árbol). | OK si correcto. | Verificar contenido. | S |
| KT-024 | **Info** | Docs | `docs/decisions/ADR-001-003.md` | Todos dicen "Autores: Sistema (generado automáticamente)". ADR-001 pregunta si está respaldado por código - **SÍ respaldado** (separación cliente/adaptador/reglas/triage-rules existe). ADR-002 respaldado por umbrales. ADR-003 respaldado por proxy. | Revisado. | Info, no problema. | OK como está. | S |

## 4. Discrepancias doc vs código

| Documento | Afirmación | Realidad | Severidad |
|-----------|------------|----------|-----------|
| `docs/architecture.md:24` | "Adaptador estricto" | `kev-adapter.ts` es **flexible** (busca en múltiples contenedores, acepta múltiples formatos). Validación sí es estricta. | Media |
| `docs/api.md:105` | "Solo acepta `POST` a ruta que termine en `/v1/systemone`" | Correcto, pero no especifica que **cualquier** path sirve. Mensaje de error sugiere ruta específica `/api/kev/v1/systemone`. | Baja |
| `docs/development.md:22-23` | Ejemplo `VITE_MODAL_API_URL=http://localhost:8787/api/kev` | Proxy acepta cualquier ruta que termine en `/v1/systemone` (ver línea 24 proxy). Funciona, pero convención no obligatoria. | Info |
| `docs/project-state.md:31` | "Proyecto inicial sin historial Git" | Correcto - `.git` no existe. | OK |
| `docs/project-state.md:41` | "Sin tests E2E (solo tests unitarios con Vitest)" | Correcto. | OK |
| `README.md` | Afirma funcionalidades | Mayoría correctas. Build/tests tienen fallos actuales. | Info |

## 5. No verificado / limitaciones

| Item | Razón | Acción requerida |
|------|-------|-----------------|
| **Historial Git** | No existe `.git`. No se puede revisar commits, diffs históricos, ni `git blame`. | Crear repo si se necesita trazabilidad. |
| **Cobertura de tests** | Vitest corriendo pero no se solicitó `--coverage`. No verificado. | Ejecutar `npm test -- --coverage` si se requiere métrica. |
| **Lint** | `npm run lint` no ejecutado. `eslint.config.js` existe. | Ejecutar para detectar problemas de estilo. |
| **FreeLLM API `/v1/decisions`** | No se encontró especificación en repo. Servicio en `127.0.0.1:31415` **NO VERIFICADO** (no se intentó conexión). | Seguir Fase 3 según instrucciones. |
| **Comportamiento en producción** | No hay Dockerfile, CI/CD, healthchecks. Solo análisis estático. | NO VERIFICADO. |
| **Seguridad runtime** | SSRF en proxy depende de `KEV_UPSTREAM_URL` (configurable por env). Sin validación de URL upstream. | Requiere revisión en despliegue. |
| **Rate limiting** | No implementado en proxy ni cliente. | NO VERIFICADO impacto. |
| **Graceful shutdown** | Proxy no maneja `SIGINT/SIGTERM`. | NO VERIFICADO. |

## 6. Conclusión

**Calificación:** **ACEPTABLE CON CORRECCIONES CRÍTICAS**

El proyecto tiene una arquitectura sólida y bien documentada. Los fallos críticos son principalmente de **configuración de build** (tipos Vite/env y configuración Vite/Vitest) y **vulnerabilidades de dependencias**. Los tests unitarios de reglas y adaptador pasan mayoritariamente, pero hay 3 fallos en tests de UI que deben corregirse.

**Recomendación:** Corregir KT-001, KT-002, KT-003, KT-004 antes de cualquier despliegue. Los hallazgos de seguridad en proxy (KT-010, KT-011, KT-017, KT-018) son importantes para producción.
