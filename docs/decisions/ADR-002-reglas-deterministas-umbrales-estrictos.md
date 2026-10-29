# ADR-002: Reglas deterministas con umbrales estrictos

- **Estado:** Aceptado
- **Fecha:** 2026-10-29
- **Autores:** Sistema (generado automáticamente)
- **Decisión:** Usar umbrales estrictos (>0.70, >0.85) con reglas ortogonales, implementadas como funciones puras

## Contexto

El triaje requiere tomar decisiones operativas: alertar por posible filtración de material sensible y decidir si asignar automáticamente al departamento o requerir revisión humana. Estas decisiones deben ser predecibles, auditables y evitar falsos positivos/negativos ambiguos.

## Problema

¿Cómo implementar las reglas de negocio para garantizar consistencia, evitar decisiones ambiguas en valores límite, y mantenerlas independientes entre sí?

## Opciones consideradas

1. **Umbrales inclusivos (>=)** - Más permisivo, puede generar más alertas/asignaciones automáticas
2. **Umbrales estrictos (>)** - Más conservador, requiere superar claramente el umbral
3. **Puntuación ponderada compleja** - Mayor flexibilidad pero menos determinista y más difícil de auditar

## Decisión

Adoptar **opción 2: umbrales estrictos** con reglas ortogonales:
- **Regla 1 (Seguridad):** Alerta si `affirmativeProbability > 0.70`. Si == 0.70 → NO alerta.
- **Regla 2 (Auto-asignación):** Si `confidence > 0.85` → `auto_assign`
- **Regla 3 (Revisión humana):** Si `confidence <= 0.85` → `human_review`

Las reglas son ortogonales: la alerta de seguridad nunca se oculta aunque el departamento tenga alta confianza.

## Justificación

- **Determinismo:** Mismo input siempre produce mismo output
- **Conservadurismo:** En casos límite se prefiere precaución (revisión humana, sin alerta falsa por empate)
- **Auditabilidad:** Reglas simples, fácilmente verificables
- **Claridad:** Sin ambigüedad sobre qué regla aplica
- **Seguridad:** Mejor prevenir falsos negativos en seguridad con umbral claro

## Consecuencias

**Positivas:**
- Comportamiento completamente predecible
- Fácil de testear y documentar
- Auditable para cumplimiento
- Evita decisiones arbitrarias en empates

**Negativas:**
- Puede requerir revisión humana en casos con confianza justo en umbral
- Menos "inteligente" pero más seguro/conservador

## Implementación

Funciones puras en `src/lib/triage-rules.ts`:
- `evaluateSecurityRule()`
- `evaluateDepartmentRoutingRule()`
- `evaluateTriageRules()` - orquesta ambas reglas independientemente

## Relacionado

- ADR-001: Arquitectura y separación de capas
- Tests en `src/test/triage-rules.test.ts`
