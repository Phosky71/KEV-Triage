# Plan de Corrección (FIX-PLAN)

Priorizado por severidad y dependencias. Un PR por grupo coherente.

## Prioridad 0 - Críticos (Bloqueantes para build/deploy)

### PR-1: Fix Build TypeScript (KT-001, KT-002)
**Severidad:** Crítica | **Esfuerzo:** M | **Dependencias:** Ninguna

#### Problema
- `src/lib/kev-client.ts` usa `import.meta.env` sin tipos Vite
- `vite.config.ts` tiene incompatibilidad de tipos con Vitest

#### Pasos
1. **KT-001:** Añadir tipos Vite a `tsconfig.app.json`
   ```json
   {
     "compilerOptions": {
       "types": ["vite/client", "@testing-library/jest-dom"]
     }
   }
   ```
2. **KT-002:** Revisar `vite.config.ts` - usar `mergeConfig` o importar tipos correctamente. Considerar:
   ```typescript
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   // ...
   export default defineConfig(({ mode }) => ({ ... }))
   ```
   O usar `satisfies UserConfig` si hay conflicto con Vitest.

#### Tests
- `npm run build` debe pasar
- `npx tsc --noEmit` debe seguir pasando

---

### PR-2: Fix Tests UI (KT-003)
**Severidad:** Crítica | **Esfuerzo:** S | **Dependencias:** Ninguna

#### Problema
`src/test/App.test.tsx:74` falla por múltiples elementos con `getByLabelText`

#### Pasos
1. Revisar `src/components/IncidentInput.tsx` - buscar labels duplicados
2. En test usar selector más específico: `getByRole('textbox', { name: /descripción técnica/i })` o `getAllByLabelText`
3. Verificar que solo hay un textarea con ese label

#### Tests
- `npm test` debe pasar todos los tests

---

### PR-3: Actualizar Dependencias Vulnerables (KT-004)
**Severidad:** Crítica | **Esfuerzo:** M | **Dependencias:** Puede requerir PR-1/PR-2

#### Problema
6 vulnerabilidades críticas/altas/moderadas en cadena Vitest/Vite

#### Pasos
1. **Opción A (conservadora):** Intentar `npm audit fix` sin force primero
2. **Opción B:** Si requiere breaking change, evaluar actualización a Vitest 5.x
   - Revisar breaking changes
   - Actualizar config si necesario
   - Ejecutar tests completos
3. Verificar que build/tests siguen funcionando

#### Tests
- `npm audit` sin vulnerabilidades críticas/altas o justificadas
- Todos los tests pasan

---

## Prioridad 1 - Altos

### PR-4: Mejoras Adaptador (KT-005, KT-006, KT-007, KT-014, KT-015)
**Severidad:** Alta/Media | **Esfuerzo:** M | **Dependencias:** Ninguna

#### Cambios
- **KT-005:** Validar suma de probabilidades (tolerancia 0.01), detectar empates explícitamente
- **KT-006:** Documentar prioridad de parsing severity, añadir validación
- **KT-007:** Refactorizar `parseSecurityLeakNode` con lógica más clara, validar consistencia
- **KT-014:** Detectar si pregunta aparece en múltiples contenedores, lanzar warning o error con diagnóstico
- **KT-015:** Mejorar heurística latencia (buscar campo con unidad explícita)

#### Tests
Añadir tests en `src/test/kev-adapter.test.ts` para:
- Empates en probabilidades
- Múltiples contenedores
- Casos límite severity
- Inversión answer/prob en noul
- Latencia en segundos/ms

---

### PR-5: Mejoras Cliente HTTP (KT-008, KT-009, KT-016)
**Severidad:** Alta/Media | **Esfuerzo:** M | **Dependencias:** Ninguna

#### Cambios
- **KT-008:** Normalizar URL (remover query/hash), validar host, rechazar user:pass
- **KT-009:** Refactorizar gestión abort/timeout con cleanup garantizado
- **KT-016:** Leer cuerpo de error HTTP (con límite) para mejor diagnóstico

#### Tests
Añadir tests para:
- URLs con query strings
- Timeout vs abort externo
- Errores HTTP con cuerpo JSON

---

### PR-6: Hardening Proxy (KT-010, KT-011, KT-017, KT-018)
**Severidad:** Alta/Media | **Esfuerzo:** M | **Dependencias:** Ninguna

#### Cambios
- **KT-010:** Clarificar rutas aceptadas, actualizar mensaje de error
- **KT-011:** Validar origen contra allowlist, reflejar si válido, añadir `Vary: Origin`
- **KT-017:** Al exceder límite, llamar `req.destroy()` para drenar y cerrar
- **KT-018:** Añadir timeout con AbortController al fetch upstream

#### Tests
Tests manuales o unitarios para:
- CORS con origen válido/inválido
- Body > 32KB
- Timeout upstream
- Rutas

---

## Prioridad 2 - Medios/Bajos

### PR-7: Mejoras UI/Concurrencia (KT-012, KT-013)
**Severidad:** Media | **Esfuerzo:** S | **Dependencias:** Ninguna

#### Cambios
- Añadir cleanup en `App.tsx` (mounted flag o AbortController cleanup en unmount)
- Mejorar transiciones de modo

#### Tests
Tests existentes deben seguir pasando

---

### PR-8: Documentación (KT-019, KT-020, KT-021)
**Severidad:** Media/Baja | **Esfuerzo:** S | **Dependencias:** Ninguna

#### Cambios
- Corregir "Adaptador estricto" → "Adaptador robusto y flexible con validación estricta" en `docs/architecture.md`
- Clarificar comportamiento rutas en `docs/api.md`
- Actualizar `docs/security.md` con limitaciones reales

---

### PR-9: Config Menor (KT-022, KT-023)
**Severidad:** Baja | **Esfuerzo:** S | **Dependencias:** Ninguna

#### Cambios
- Añadir `engines` a `package.json`
- Verificar `.gitignore` cubre `.env`, `node_modules`, `dist`

---

## Orden Recomendado

1. **PR-1** (Build) - Bloqueante
2. **PR-2** (Tests UI) - Bloqueante  
3. **PR-3** (Deps) - Crítico seguridad
4. **PR-4, PR-5, PR-6** - Altos (pueden ir en paralelo o secuencial)
5. **PR-7, PR-8, PR-9** - Resto

## Tests a Añadir por Grupo

Ver `TEST-GAPS.md` para detalles completos.

## Notas
- Todos los cambios deben mantener compatibilidad con reglas deterministas (umbral > 0.70 y > 0.85)
- No modificar `triage-rules.ts` lógica de umbrales
- Seguir ADR-001 (separación de capas)
