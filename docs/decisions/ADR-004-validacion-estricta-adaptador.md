# ADR-004: Validación estricta del adaptador Kev

- Estado: Propuesto
- Fecha: 2026-10-30
- Autores: Auditoría Kev Triage
- Relacionado con: ADR-001 (arquitectura por capas), ADR-002 (reglas deterministas con umbrales >0.70/>0.85)

## Contexto

El adaptador (`src/lib/kev-adapter.ts`) debe mantener la semántica determinista de triaje (umbrales >0.70/>0.85 definidos en `src/lib/triage-rules.ts`) sin modificar `src/lib/triage-rules.ts`. Se identifican ambigüedades que deben resolverse con reglas estrictas.

## Contrato de tipos

- `KevNormalizedResult` (ver `src/types.ts`): `department` es `DepartmentClassification`, `securityLeak` es `SecurityLeakAssessment`, `severity` es `SeverityAssessment`.
- `DepartmentClassification.selected` es `DepartmentOption` (`'frontend' | 'backend' | 'billing' | 'devops'`). **No** se permite `null` en el tipo actual. Cualquier cambio a este contrato requiere modificar `src/types.ts` y actualizar la UI; no se hará en esta fase sin confirmación explícita.
- Las reglas (`evaluateDepartmentRoutingRule`) fuerzan `human_review` cuando `confidence <= AUTO_ASSIGN_CONFIDENCE_THRESHOLD` (>0.85 requerido para auto-asignación). El modo `human_review` se determina en `src/lib/triage-rules.ts`, no en el adaptador.

## Decisiones

### 1) Empate en `department`
- **Criterio de empate:** Se considera empate cuando la diferencia entre las dos probabilidades más altas es <= **ε = 1e-9** (comparación con tolerancia). También se considera empate si hay múltiples opciones con la misma probabilidad máxima indistinguible.
- **Sin elección por orden:** **Nunca** se elige una opción por orden de aparición/array.
- **Salida:** Si hay empate inequívoco entre opciones de `department`, el adaptador **no puede producir una clasificación válida**. Se debe devolver **`TriageErrorCode = 'INVALID_SCHEMA'`** (salida única).
- **Contrato de salida esperado:** `department` **no se asigna** (error de esquema). `confidence` no se infiere. `routing.mode` será `human_review` únicamente cuando exista un `department` válido con `confidence`; en caso de empate el flujo debe terminar con `INVALID_SCHEMA`. **No** se fuerza `human_review` inventando un departamento: se rechaza con `INVALID_SCHEMA`.
- **Nota de implementación:** Si esto exige cambiar `DepartmentClassification.selected` a nullable o cambiar la UI, se indicará explícitamente; por ahora se opta por **rechazar con `INVALID_SCHEMA`**.

### 2) Suma de probabilidades
- **Constante:** `const SUM_TOLERANCE = 0.02` (límite **inclusivo**: se acepta si `|sum - 1.0| <= SUM_TOLERANCE`).
- **Cuándo aplica:** Solo para distribuciones con **múltiples opciones** (más de una opción con probabilidad relevante).
- **Cuándo NO aplica:** Si **solo hay una probabilidad ganadora/afirmativa relevante** (distribución unaria), **no** se valida la suma.
- **Fuera de rango:** Si la suma está fuera de `|sum-1.0| <= 0.02` → **`INVALID_SCHEMA`**. **No normalizar en silencio**.
- **Rango individual:** Las probabilidades deben estar en `[0, 1]`. Valores fuera de `[0,1]` → **`INVALID_SCHEMA`**.

### 3) Campos contradictorios
- **Consistencia `answer` vs `probability` (noul `is_security_leak`):**
  - Si `answer === true` (afirmativo) y `probability < 0.5` → **contradicción** → **`INVALID_SCHEMA`**
  - Si `answer === false` (negativo) y `probability > 0.5` → **contradicción** → **`INVALID_SCHEMA`**
  - Si `probability === 0.5` → **no** es contradicción por sí solo (caso ambiguo pero no contradictorio). Se aplica regla de seguridad (sección 4).
- **Consistencia `level` / `index` / `score` (severidad):**
  - Índice ordinal esperado: `0→low`, `1→moderate`, `2→high`, `3→critical`, `4→emergency` (mapeo directo a `SeverityLevel`).
  - Score numérico esperado: `1→low`, `2→moderate`, `3→high`, `4→critical`, `5→emergency`.
  - Si los campos presentes se contradicen entre sí (distinto nivel resultante) → **`INVALID_SCHEMA`**.
  - **Prioridad:** Solo se aplica prioridad entre campos si **hay un único campo presente**. Si **hay múltiples campos presentes y son contradictorios**, **no se aplica prioridad para resolver la contradicción** → **`INVALID_SCHEMA`**.
- **Unicidad:** Si hay ambigüedad no resoluble por las reglas anteriores → **`INVALID_SCHEMA`**.

### 4) Seguridad
- **Salida única:** Todos los casos de esquema inválido, ambigüedad irremediable, empate sin ganador, suma fuera de tolerancia o contradicción → **`TriageErrorCode = 'INVALID_SCHEMA'`** con **mensaje fijo**.
- **Sin falsos "sin alerta":** Si **no se puede determinar la probabilidad afirmativa de forma inequívoca**, se devuelve **error visible** (`INVALID_SCHEMA`). **Nunca** se devuelve un resultado como "sin alerta" por omisión o ambigüedad.
- **Nota UI:** La UI debe indicar **revisión manual de la posible fuga**, **nunca** mostrar "sin alerta" cuando el esquema es inválido o ambiguo.

## Tabla de casos límite (entrada → salida esperada)

| Caso | Entrada (ejemplo) | Salida esperada |
|---|---|---|
| Empate en department | `department` con dos opciones `p_a = 0.5, p_b = 0.5` (diff <= 1e-9) | `INVALID_SCHEMA` (sin asignar departamento, sin inventar confianza) |
| Suma dentro de tolerancia | Distribución múltiple con suma `1.00` o `0.99` o `1.01` (|Δ|<=0.02) | Válido si resto OK |
| Suma fuera de tolerancia | Distribución múltiple con suma `0.98` | `INVALID_SCHEMA` (no normalizar) |
| Suma fuera de tolerancia | Distribución múltiple con suma `0.97` | `INVALID_SCHEMA` |
| Suma fuera de tolerancia | Distribución múltiple con suma `1.03` | `INVALID_SCHEMA` |
| answer/probability contradictorios | `answer: true` con `probability: 0.4` (<0.5) | `INVALID_SCHEMA` |
| answer/probability contradictorios | `answer: false` con `probability: 0.6` (>0.5) | `INVALID_SCHEMA` |
| p=0.5 no contradictorio | `answer: true` con `probability: 0.5` o `answer: false` con `probability: 0.5` | No es contradicción por sí solo; aplicar regla de seguridad (si no hay prob afirmativa inequívoca → `INVALID_SCHEMA`) |
| Probabilidad ausente | Sin probabilidad en opción ganadora/contexto noul sin dato usable | `INVALID_SCHEMA` (nunca inferir "sin alerta") |
| Probabilidad fuera de [0,1] | `probability: 1.5` o `-0.1` | `INVALID_SCHEMA` |
| Severidad contradictoria (múltiples campos) | `level: high`, `index: 0` (contradicción) | `INVALID_SCHEMA` (sin aplicar prioridad) |

## Consecuencias

- Más estricto: algunos casos que antes podían "pasar" ahora fallarán con `INVALID_SCHEMA`. Esto es intencional.
- Requiere tests adicionales para empates, suma fuera de tolerancia, contradicciones y casos límite.
- Compatible con ADR-001 (arquitectura por capas) y ADR-002 (umbrales >0.70/>0.85 se aplican cuando hay una probabilidad afirmativa válida).
- No modifica `src/lib/triage-rules.ts`.
- Cambios en `src/types.ts` o UI solo si se decide permitir `department` nullable; por ahora se rechaza con `INVALID_SCHEMA`.
