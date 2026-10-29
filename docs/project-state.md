# Estado del proyecto (Project State)

## Identidad

- **Nombre:** Kev Triage
- **Descripción:** Aplicación fullstack de clasificación técnica y triaje determinista de incidencias impulsada por el protocolo System 1 de Kev (`POST /v1/systemone`).
- **Versión:** 1.0.0
- **Tipo:** Aplicación web SPA (React + TypeScript + Vite) con proxy Node.js para comunicación segura con el servicio upstream de Kev.
- **Estado actual:** Implementación funcional con reglas deterministas, validación estricta de esquema y modo demostración.

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
