# ADR-004: Validación estricta del adaptador Kev

- Estado: Aceptado (decisión 2 pendiente de implementación)
- Fecha: 2026-10-30
- Autores: Auditoría Kev Triage
- Relacionado con: ADR-001 (arquitectura por capas), ADR-002 (reglas deterministas con umbrales >0.70/>0.85)

## Contexto

El adaptador (`src/lib/kev-adapter.ts`) debe mantener la semántica determinista de triaje (umbrales >0.70/>0.85 definidos en `src/lib/triage-rules.ts`) sin modificar `src/lib/triage-rules.ts`. Se identifican ambigüedades que deben resolverse con reglas estrictas.

## Contrato de tipos

- `KevNormalizedResult` (ver `src/types.ts`): `department` es `DepartmentClassification`, `securityLeak` es `SecurityLeakAssessment`, `severity` es `SeverityAssessment`.
- `DepartmentClassification.selected` es `DepartmentOption` (`'frontend' | 'backend' | 'billing' | 'devops'`). **Cambio requerido:** Se deberá permitir ambigüedad en departamento. Opciones:
  1. Cambiar `selected` a `DepartmentOption | null` y añadir `ambiguous?: boolean` / `confidenceSource` coherente.
  2. Añadir `departmentAmbiguous: boolean` al resultado manteniendo `selected` pero marcando ambigüedad.
- **Impacto UI:** `src/components/AnalysisResults.tsx` debe manejar el caso sin departamento válido (mostrar "Sin asignación / Revisión humana" y no forzar un equipo). Requiere cambios en `types.ts` y UI.
- Las reglas (`evaluateDepartmentRoutingRule`) fuerzan `human_review` cuando `confidence <= AUTO_ASSIGN_CONFIDENCE_THRESHOLD` (>0.85 requerido para auto-asignación). Con departamento ambiguo, **se debe caer en `human_review`** sin modificar `src/lib/triage-rules.ts`.

## Invariante

**Si `is_security_leak` es válida, su alerta se evalúa y se muestra aunque otra pregunta falle o sea ambigua.**

- Razón: ADR-002 exige que la alerta de seguridad nunca se oculte.
- Comprobación en estado actual: El adaptador construye `KevNormalizedResult` completo; un fallo en parsing de `department` puede impedir construir el resultado completo. Esto **requiere cambio estructural** en el adaptador para evaluar preguntas por separado (parsear `securityLeak` independientemente) y devolver alerta aunque `department`/`severity` sean ambiguos o inválidos. **Decisión pendiente**: no implementar en KT-005; documentar y tratar en fase posterior.

## Cláusula: Origen de P(sí) para `is_security_leak`

**Regla de precedencia:**

1. **Fuentes explícitas de P(sí)** (únicamente estas claves se tratan como `P(sí)` directa, **sin invertir**):
   - `affirmative_probability`
   - `yes_probability`
   - `true_probability`
   - `p_yes`
   - `p_true`
   - `score` (**solo para `is_security_leak`**; se mantiene como fuente explícita de P(sí), debe estar en el rango `[0,1]`)
   - dentro de `probabilities`/`distribution`/`probs`: `yes`, `true`, `affirmative`, `'1'` (cuando provengan de esas claves explícitas)

2. **Detección de fuentes múltiples**: Si se encuentran **dos o más fuentes explícitas distintas** que apunten a `P(sí)` con **valores numéricos diferentes** (comparación con tolerancia `1e-9`) → **`INVALID_SCHEMA`** (fuentes discrepantes). Si apuntan al **mismo valor** (dentro de ε) → se acepta ese valor. **Si hay combinación de fuente explícita + campo genérico con valores discrepantes, la fuente explícita tiene precedencia pero la discrepancia entre fuentes explícitas debe detectarse; si una fuente es genérica y otra explícita y dan valores que no son equivalentes según la regla aplicable, se considera discrepancia entre fuentes → `INVALID_SCHEMA`.**

3. **Campo genérico + `answer` (EN ESPERA - no cambiar comportamiento actual aún):** Actualmente el adaptador interpreta `probability`/`confidence` genérico junto a `answer` como **confianza en la respuesta** (`answer true` → `P(sí)=p`, `answer false` → `P(sí)=1-p`). **Decisión pendiente** sobre si es P(sí) o confianza. **No se modifica en KT-007.** Se documentará con evidencia del repo cuando se decida.

4. **Valores de `answer`**: Solo se aceptan `true`, `false`, `'yes'`, `'no'`, `'true'`, `'false'` (case-insensitive cuando aplica). Valores no reconocidos como `"maybe"`, `""`, `"Yes"` (con mayúsculas inesperadas) → **`INVALID_SCHEMA`**.

5. **Consistencia `answer` vs `P(sí)`** (evaluada sobre **P(sí) canónica resultante**):
   - Si `answer === true` y `P(sí) < 0.5` → contradicción → `INVALID_SCHEMA`
   - Si `answer === false` y `P(sí) > 0.5` → contradicción → `INVALID_SCHEMA`
   - Si `P(sí) === 0.5` → **no** es contradictorio por sí solo

**Mensaje de error fijo:** `"Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga."`

## Decisiones

### 1) Empate en `department`
- **Criterio de empate:** Se considera empate cuando la diferencia entre las dos probabilidades más altas es <= **ε = 1e-9**. También empate si múltiples opciones comparten la probabilidad máxima indistinguible.
- **Sin elección por orden:** **Nunca** se elige una opción por orden de aparición/array.
- **Salida (válida, ambigua):** **NO** es `INVALID_SCHEMA`. Es un resultado válido con ambigüedad:
  - `department.selected` → `null` (si se cambia tipo) o mantener estructura con flag `departmentAmbiguous: true`
  - `department.confidence` → probabilidad máxima empatada
  - `department.probabilities` → conservar distribución completa
  - Enrutamiento → **`human_review`** (sin modificar `triage-rules.ts`; `evaluateDepartmentRoutingRule` recibirá departamento pero con baja/confianza ambigua o se llamará con lógica que fuerce revisión)
- **UI:** Debe mostrar "Revisión humana / Sin asignación de departamento" cuando ambiguo.

### 2) Suma de probabilidades
- **Constante:** `const SUM_TOLERANCE = 0.02` (límite **inclusivo**: se acepta si `|sum - 1.0| <= SUM_TOLERANCE`).
- **Cuándo aplica:** Solo para distribuciones con **múltiples opciones** (más de una opción con probabilidad relevante).
- **Cuándo NO aplica:** Si **solo hay una probabilidad ganadora/afirmativa relevante** (distribución unaria), **no** se valida la suma.
- **Fuera de rango:** Si la suma está fuera de `|sum-1.0| <= 0.02` → **`INVALID_SCHEMA`**. **No normalizar en silencio**.
- **Rango individual:** Las probabilidades deben estar en `[0, 1]`. Valores fuera de `[0,1]` → **`INVALID_SCHEMA`**.

### 3) Campos contradictorios
- **Consistencia `answer` vs `P(sí)` (noul `is_security_leak`):**
  - Si `answer === true` (afirmativo) y `P(sí) < 0.5` → **contradicción** → **`INVALID_SCHEMA`**
  - Si `answer === false` (negativo) y `P(sí) > 0.5` → **contradicción** → **`INVALID_SCHEMA`**
  - Si `P(sí) === 0.5` → **no** es contradictorio por sí solo (caso ambiguo pero no contradictorio). Se aplica regla de seguridad (sección 4).
  - Evaluación siempre sobre **P(sí) canónica resultante** (tras aplicar precedencia y reglas).
- **Consistencia `level` / `index` / `score` (severidad):**
  - Índice ordinal esperado: `0→low`, `1→moderate`, `2→high`, `3→critical`, `4→emergency`
  - Score numérico esperado: `1→low`, `2→moderate`, `3→high`, `4→critical`, `5→emergency`
  - **`index=0` + `score=1`** → **consistente** (ambos low)
  - **`index=0` + `score=3`** → **contradicción** (low vs high) → **`INVALID_SCHEMA`**
  - Si los campos presentes se contradicen entre sí (distinto nivel resultante) → **`INVALID_SCHEMA`**.
  - **Prioridad:** Solo se aplica prioridad entre campos si **hay un único campo presente**. Si **hay múltiples campos presentes y son contradictorios**, **no se aplica prioridad para resolver la contradicción** → **`INVALID_SCHEMA`**.
- **Unicidad:** Si hay ambigüedad no resoluble por las reglas anteriores → **`INVALID_SCHEMA`**.

### 4) Seguridad
- **Salida única:** Todos los casos de esquema inválido, ambigüedad irremediable (distinta a empate de department), suma fuera de tolerancia o contradicción → **`TriageErrorCode = 'INVALID_SCHEMA'`** con **mensaje fijo**: `"Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga."`
- **Sin falsos "sin alerta":** Si **no se puede determinar la probabilidad afirmativa de forma inequívoca**, se devuelve **error visible** (`INVALID_SCHEMA`). **Nunca** se devuelve un resultado como "sin alerta" por omisión o ambigüedad.
- **Nota UI:** La UI debe indicar **revisión manual de la posible fuga**, **nunca** mostrar "sin alerta" cuando el esquema es inválido o ambiguo.
- **Invariante:** Evaluar `is_security_leak` independientemente si es posible (decisión pendiente de cambio estructural).

## Tabla de casos límite (entrada → salida esperada)

| Caso | Entrada (ejemplo) | Salida esperada |
|---|---|---|
| Empate en department | `department` con `p_a = 0.5, p_b = 0.5` (diff <= 1e-9) | **Válido con ambigüedad**: `department` ambiguo/null, `confidence = 0.5`, `routing.mode = human_review`. **No** `INVALID_SCHEMA`. |
| Suma dentro de tolerancia | Distribución múltiple con suma `1.00`/`0.99`/`1.01` (|Δ|<=0.02) | Válido si resto OK |
| Suma fuera de tolerancia | Distribución múltiple con suma `0.98` | `INVALID_SCHEMA` (no normalizar) |
| Suma fuera de tolerancia | Distribución múltiple con suma `0.97` | `INVALID_SCHEMA` |
| Suma fuera de tolerancia | Distribución múltiple con suma `1.03` | `INVALID_SCHEMA` |
| answer/probability contradictorios (genérico, EN ESPERA) | `answer: true` con `probability: 0.4` | **`INVALID_SCHEMA`** (confianza < 0.5 incoherente con `answer: true`) |
| answer/probability contradictorios (genérico, EN ESPERA) | `answer: false` con `probability: 0.4` | **`INVALID_SCHEMA`** |
| answer/probability válidos (genérico, EN ESPERA) | `answer: false` con `probability: 0.6` | **Válido**, `P(sí)=0.4` (sin alerta) |
| answer/probability contradictorios (genérico, EN ESPERA) | `answer: false` con `probability: 0.4` | **`INVALID_SCHEMA`** |
| p=0.5 válido (genérico, EN ESPERA) | `answer: true` con `probability: 0.5` o `answer: false` con `probability: 0.5` | **Válido**, `P(sí)=0.5` (no contradictorio) |
| Fuentes explícitas + genérico discrepantes | `p_yes: 0.9`, `probability: 0.1` (con o sin answer) | **`INVALID_SCHEMA`** (fuentes discrepantes; precedencia explícita pero discrepancia detectada) |
| Fuentes explícitas discrepantes | `p_yes: 0.9`, `probabilities.yes: 0.2` | **`INVALID_SCHEMA`** |
| Explícita contradice answer | `answer: false`, `p_yes: 0.9` | **`INVALID_SCHEMA`** (P(sí)=0.9 > 0.5 con answer false) |
| Explícita contradice answer | `answer: true`, `p_yes: 0.4` | **`INVALID_SCHEMA`** (P(sí)=0.4 < 0.5 con answer true) |
| Límites válidos | `affirmative_probability: 0`, `1`, `0.70` exacto | Válidos. `0.70` exacto → **sin alerta** (> 0.70) |
| Valores no numéricos | `NaN`, `"0.9"`, `null` | **`INVALID_SCHEMA`** |
| answer no reconocido | `answer: "maybe"`, `""`, `"Yes"` (no reconocido) | **`INVALID_SCHEMA`** |
| Probabilidad ausente | Sin probabilidad usable | `INVALID_SCHEMA` (nunca inferir "sin alerta") |
| Probabilidad fuera de [0,1] | `probability: 1.5` o `-0.1` | `INVALID_SCHEMA` |
| Severidad consistente | `index: 0` + `score: 1` | Válido (low) |
| Severidad contradictoria (múltiples campos) | `index: 0` + `score: 3` | `INVALID_SCHEMA` (sin prioridad) |
| Severidad contradictoria | `level: high`, `index: 0` | `INVALID_SCHEMA` (sin prioridad) |

## Consecuencias

- Empate de department ya **no** bloquea la alerta de seguridad (alineado con ADR-002).
- Requiere cambios en `src/types.ts` (nullable/flag) y `src/components/AnalysisResults.tsx`. **Pendiente de implementación**.
- Mantener invariante de seguridad requiere parseo por pregunta (cambio estructural) - **pendiente**.
- Requiere tests adicionales para empates, suma fuera de tolerancia, contradicciones y casos límite.
- Compatible con ADR-001 y ADR-002 (umbrales >0.70/>0.85 se aplican cuando hay probabilidad afirmativa válida).
- No modifica `src/lib/triage-rules.ts`.
- Archivo en **UTF-8 sin BOM**.
