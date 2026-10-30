# ADR-004: Validación estricta del adaptador Kev

- Estado: Propuesto
- Fecha: 2026-10-30
- Autores: Auditoría Kev Triage
- Relacionado con: ADR-001 (umbral 0.70/0.85), ADR-002 (modo demo/fallbacks)

## Contexto

El adaptador (`src/lib/kev-adapter.ts`) debe mantener la semántica determinista de triaje (umbrales >0.70/>0.85) sin modificar `src/lib/triage-rules.ts`. Se identifican ambigüedades que deben resolverse con reglas estrictas.

## Decisiones

### 1) Empate en `department`
- Si hay empate entre dos o más departamentos con la misma puntuación/probabilidad y no hay un ganador inequívoco, **no se elige una opción por orden**.
- El resultado debe forzar `human_review` (revisión humana). No se asigna departamento por defecto.
- No se genera confianza válida en caso de empate.

### 2) Suma de probabilidades
- Para distribuciones con varias probabilidades (múltiples opciones), se valida la suma con tolerancia **±0.01–0.02**.
- Si la suma está fuera de ese rango → **`INVALID_SCHEMA`**. **No normalizar en silencio**.
- Si **solo hay una probabilidad ganadora** (distribución unaria / única probabilidad afirmativa relevante), **no se valida la suma**.
- Cualquier normalización debe ser explícita y documentada; por defecto se rechaza cuando es ambigua.

### 3) Campos contradictorios
- Si hay campos contradictorios entre sí (p. ej. `answer` vs `probability`; o `level`/`index`/`score` que se contradicen), se devuelve **`INVALID_SCHEMA`**.
- La **prioridad de campos solo aplica si hay un único campo presente**. Si hay múltiples campos presentes y son contradictorios, no se aplica prioridad para "resolver" la contradicción: se rechaza.
- La conversión de unidades (ej. segundos vs ms) debe ser explícita cuando sea ambiguo; si no es determinable, se rechaza.

### 4) Seguridad
- Si **no se puede determinar la probabilidad afirmativa** de forma inequívoca, se debe devolver un **error visible** (`INVALID_SCHEMA` o error explícito). 
- **Nunca** se debe devolver un resultado como "sin alerta" por omisión/ambigüedad.
- En caso de duda que afecte a la decisión, se prefiere `INVALID_SCHEMA` con mensaje claro sobre inventar valores.

## Consecuencias

- Más estricto: algunos casos que antes podrían "pasar" ahora fallarán con `INVALID_SCHEMA`. Esto es intencional para evitar falsos negativos/positivos.
- Requiere tests adicionales para empates, suma fuera de tolerancia, y campos contradictorios.
- Compatible con ADR-001 (umbrales >0.70/>0.85 siguen aplicándose cuando hay una probabilidad afirmativa válida).
- No modifica `src/lib/triage-rules.ts`.
