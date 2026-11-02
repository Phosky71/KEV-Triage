# Estado del proyecto (Project State)

## Identidad

- **Nombre:** Kev Triage
- **Descripción:** Aplicación fullstack de clasificación técnica y triaje determinista de incidencias impulsada por el protocolo System 1 de Kev (`POST /v1/systemone`).
- **Versión:** 1.0.0
- **Tipo:** Aplicación web SPA (React + TypeScript + Vite) con proxy Node.js para comunicación segura con el servicio upstream de Kev.
- **Estado actual:** Implementación funcional con reglas deterministas, validación estricta de esquema y modo demostración. Integración FreeLLM `/v1/decisions` implementada (FREELLM-001), traducción solo en servidor, sin cambios en cliente/adaptador.

## Propósito

Kev Triage toma la descripción en texto libre de una incidencia técnica y la envía al modelo Kev mediante el protocolo `/v1/systemone` con tres preguntas estructuradas:
1. **Departamento responsable** (`department`, tipo `choice`) - frontend, backend, billing, devops
2. **Severidad operativa** (`severity`, tipo `score`) - low, moderate, high, critical, emergency  
3. **Posible filtración de material sensible** (`is_security_leak`, tipo `noul`)

Tras normalizar la respuesta con un adaptador estricto, aplica reglas deterministas de negocio para generar decisiones de enrutamiento y alertas de seguridad.

## Arquitectura resumida

- **Frontend:** React 18 + TypeScript + Vite 6 + Tailwind CSS 3. Aplicación SPA con componentes modulares.
- **Cliente HTTP:** `src/lib/kev-client.ts` construye el payload, gestiona timeouts/abort, resuelve endpoints y delega en el adaptador.
- **Adaptador/validador:** `src/lib/kev-adapter.ts` normaliza y valida estrictamente la respuesta de Kev, con soporte flexible para distintos formatos de respuesta.
- **Motor de reglas:** `src/lib/triage-rules.ts` aplica reglas deterministas puras (sin IA) sobre el resultado normalizado.
- **Proxy seguro:** `server/proxy.mjs` (Node HTTP nativo) actúa como intermediario para evitar exponer claves/API keys en el cliente y gestionar CORS.
- **Modo demostración:** `src/lib/demo-fixtures.ts` proporciona fixtures deterministas para probar sin servicio configurado.

## Cambios recientes

- Proyecto inicial sin historial Git (repositorio sin `.git`).
- Implementación completa con validación estricta de esquema, reglas deterministas con umbrales exactos (>0.70 para seguridad, >0.85 para auto-asignación), gestión de concurrencia/abort y modo demo.

## Trabajo en curso / Pendiente

- Sin tareas pendientes identificadas en el código actual.
- El proyecto está listo para uso en desarrollo con configuración de `VITE_MODAL_API_URL` o mediante proxy local.

## Problemas conocidos / Deuda técnica

- Sin tests E2E (solo tests unitarios con Vitest).
- La configuración del endpoint depende de variables de entorno; en ausencia de configuración válida se requiere modo demo.
- Sin CI/CD configurado.

## Decisiones importantes recientes

Ver `docs/decisions/` para ADRs.

## Próximos pasos sugeridos

- Configurar `.env` con la URL real del servicio Kev para pruebas con datos reales.
- Ejecutar tests (`npm test`) para validar funcionamiento.
- Considerar añadir más fixtures/demo o ampliar reglas si los requisitos evolucionan.

## OpenCode Sessions

### 2026-10-29 — Auditoría integral Kev Triage (QA/Seguridad/Arquitectura)
`opencode -s audit-kev-triage-2026-10-29`

**Resumen:** Auditoría completa del repositorio sin modificar código fuente. Verificación de build (`npm ci`, `npm run build`, `npx tsc --noEmit`, `npm test`, `npm audit`). Análisis por áreas (reglas, adaptador, cliente, UI/concurrencia, proxy, seguridad, docs). Investigación FreeLLM API `/v1/decisions`. Generación de artefactos en `docs/audit/`.

**Hallazgos:** 24 total (Crítica: 4 | Alta: 6 | Media: 8 | Baja: 4 | Info: 2)  
**Reporte:** [docs/audit/AUDIT-REPORT.md](audit/AUDIT-REPORT.md)  
**Estado build/tests:** Build FALLA (errores tipos Vite/env), Typecheck PASA, Tests FALLA (3 tests en App.test.tsx), 6 vulnerabilidades npm audit.

### 2026-10-30 — Correcciones hallazgos audit (KT-001–KT-011, KT-006, KT-005)
`opencode -s fix-audit-2026-10-29`

**Resumen:** Corrección incremental de hallazgos Alta. KT-001–KT-004 resueltos; build reproducible. KT-006 implementado con validación estricta de severidad y mensaje propio. KT-005 implementado con empate ε=1e-9, tolerancia suma |sum-1| ≤ 0.02+1e-9, choice-vs-probs mismatch → INVALID_SCHEMA, confidence explícita + empate → INVALID_SCHEMA, `department === null` → `human_review` siempre con `targetDepartment: null` (sin destino por defecto). ADR-004 y ADR-005 aceptados. Alertas de seguridad ortogonales (evalúan aunque departamento ambiguo). Cobertura ramas `kev-adapter.ts` actual: 75.33%.

**Commits:** `bb6bdd1`, `1f26971` (KT-006), `34d2dec` (KT-005, ADR-005), `29fac42`, `bb33261`.  
**Estado:** `npm run build` OK, `npx tsc --noEmit` OK, `npm test` **103 passed** (5 files). Reproducibilidad verificada.  
**Rama:** `fix/audit-2026-10-29` listo para merge a `main`.

### 2026-11-01 — Cierre KT-025 y documentación final
`opencode -s close-kt025-2026-11-01`

**Resumen:** KT-025 cerrado con parseo por pregunta e invariante de seguridad garantizada por diseño. `adaptKevResponse` mantiene contrato exacto (lanza si CUALQUIER pregunta falla). `adaptKevResponsePartial` nunca lanza por fallo de pregunta salvo payload no objeto. Ruta parcial solo vía `App.tsx`. `src/lib/triage-rules.ts` sin cambios. Alerta de seguridad evaluada siempre que sea válida; fallo de `is_security_leak` muestra bloque destacado con mensaje fijo KT-007. `rawPayload` nunca renderizado. KT-017 marcado no reproducible, KT-023 ya cubierto, KT-026 corregido con validación http/https al arrancar.

**Commits:** `4ba0e64` fix(KT-025): parseo por pregunta e invariante de seguridad; `002a87a` test(KT-025): tests parciales y regresión adaptKevResponse.  
**Tests:** **128 passed** (8 files). `npx tsc --noEmit` OK, `npm run build` OK. Cobertura ramas `kev-adapter.ts`: 74.56%.  
**Docs:** ADR-004 actualizado (invariante garantizado por diseño), FINDINGS.json KT-025 corregido.
