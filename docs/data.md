# Datos y Modelos

## Modelo de datos interno

### KevNormalizedResult
Resultado normalizado y validado tras `adaptKevResponse()`:

```typescript
{
  model: string,
  isDemo: boolean,
  demoFixtureName?: string,
  department: DepartmentClassification,
  severity: SeverityAssessment,
  securityLeak: SecurityLeakAssessment,
  latency: LatencyMetrics,
  metadata?: { requestId?: string, usageTokens?: number }
}
```

### DepartmentClassification
```typescript
{
  selected: 'frontend' | 'backend' | 'billing' | 'devops',
  confidence: number,        // [0,1]
  confidenceSource: 'explicit_protocol' | 'winning_option_probability',
  probabilities?: Partial<Record<DepartmentOption, number>>
}
```

### SeverityAssessment
```typescript
{
  level: 'low' | 'moderate' | 'high' | 'critical' | 'emergency',
  ordinal: 1 | 2 | 3 | 4 | 5,  // 1=low, 5=emergency
  rawScore: number | string,
  confidence?: number,
  probabilities?: Partial<Record<SeverityLevel, number>>,
  legend: string
}
```

### SecurityLeakAssessment
```typescript
{
  affirmativeProbability: number,  // [0,1]
  rawAnswer?: string | boolean
}
```

### LatencyMetrics
```typescript
{
  modelDeclaredMs: number | null,      // Declarada por servidor/modelo
  clientRoundTripMs: number | null     // Medida por cliente con performance.now()
}
```

## TriageEvaluation (resultado de reglas)

```typescript
{
  securityAlert: SecurityAlertDecision,
  routing: DepartmentRoutingDecision,
  triggeredRuleIds: string[]
}
```

### SecurityAlertDecision
```typescript
{
  triggered: boolean,
  affirmativeProbability: number,
  threshold: 0.70,
  title: string,
  summary: string,
  recommendations: string[],
  disclaimer: string
}
```

### DepartmentRoutingDecision
```typescript
{
  mode: 'auto_assign' | 'human_review',
  targetDepartment: DepartmentOption,
  confidence: number,
  threshold: 0.85,
  title: string,
  explanation: string
}
```

## Plantillas de incidencias

Definidas en `src/lib/demo-fixtures.ts`:
- `template-a`: Incidencia de seguridad (datos sensibles) - sugerido escenario `security_high_conf`
- `template-b`: Incidencia frontend/UI - sugerido `frontend_auto_assign`
- `template-c`: Incidencia billing - sugerido `billing_human_review`

## Fixtures de demostración

Tres escenarios deterministas:
- `security_high_conf`: Alerta de seguridad activada (prob > 0.70), alta confianza departamento
- `frontend_auto_assign`: Sin alerta, auto-asignación (> 0.85)
- `billing_human_review`: Sin alerta, revisión humana (<= 0.85)

Los fixtures pasan por `adaptKevResponse()` con `isDemo: true`.

## Mapeos y constantes

- **Departamentos:** `VALID_DEPARTMENTS = ['frontend','backend','billing','devops']`
- **Severidades ordenadas:** `ORDERED_SEVERITIES = ['low','moderate','high','critical','emergency']`
- **Leyendas de severidad:** Definidas en `SEVERITY_LEGENDS`
- **Etiquetas de departamento:** `DEPARTMENT_LABELS` en `triage-rules.ts`
- **Umbrales:** `SECURITY_LEAK_THRESHOLD = 0.70`, `AUTO_ASSIGN_CONFIDENCE_THRESHOLD = 0.85`

## Flujo de transformación de datos

1. **Input:** Texto de incidencia del usuario
2. **Payload:** `buildSystemOnePayload()` → estructura Kev
3. **Transporte:** `analyzeIncidentWithKev()` → fetch con timeout/abort
4. **Validación:** `adaptKevResponse()` → extracción flexible + validación estricta
5. **Normalización:** Conversión a tipos internos con metadatos
6. **Evaluación:** `evaluateTriageRules()` → reglas deterministas puras
7. **Presentación:** UI muestra resultado + evaluación + latencia

## Consideraciones

- Sin base de datos (aplicación stateless)
- Sin persistencia de incidencias
- Datos solo en memoria durante la sesión
- Modo demo usa fixtures hardcodeados
- Todas las transformaciones son deterministas o validadas estrictamente
