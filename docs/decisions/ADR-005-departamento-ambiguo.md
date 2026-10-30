# ADR-005: Departamento ambiguo (empate) → revisión humana

- Estado: Aceptado
- Fecha: 2026-10-30
- Relacionado: ADR-004 (validación estricta adaptador), KT-005

## Contexto
Con la introducción de ambigüedad por empate en `department` (decisión 2 de ADR-004), `DepartmentOption | null` obliga a adaptar el enrutamiento. `triage-rules.ts` usa `DEPARTMENT_LABELS[department]` y espera `DepartmentOption` no nulo.

## Decisión
- Umbrales sin cambios: `SECURITY_LEAK_THRESHOLD = 0.70`, `AUTO_ASSIGN_CONFIDENCE_THRESHOLD = 0.85`.
- Única modificación permitida en `triage-rules.ts`: si `department === null` (ambiguo/empate), **modo `human_review` siempre**, independiente de la confianza. No se aplica auto-asignación. En este caso `targetDepartment` es **`null`** (sin destino por defecto). ADR-004 prohíbe departamento por defecto.
- La regla de seguridad es ortogonal y **no cambia** (se evalúa sobre `securityLeak.affirmativeProbability` independientemente del departamento).
- No se duplica lógica fuera de `triage-rules.ts`; el cambio se centraliza ahí para mantener un único punto de evaluación de reglas de negocio.

## Justificación
Centralizar en `triage-rules.ts` evita dispersar reglas y mantiene consistencia con el principio "la alerta de seguridad nunca se oculta aunque el departamento tenga alta confianza".

## Consecuencias
- Cambio mínimo en `triage-rules.ts` (tipado + rama `null` → `human_review`).
- `types.ts`: `DepartmentClassification.selected` pasa a `DepartmentOption | null`.
- `kev-adapter.ts`: detecta empate (ε) y ausencia de `choice` con distribución empatada → `selected: null`.
- `AnalysisResults.tsx`: debe mostrar "ambiguo, revisión humana" sin crash.
- `triage-rules.ts` tests existentes deben seguir pasando.
