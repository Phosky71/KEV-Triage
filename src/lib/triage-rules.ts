import type {
  DepartmentOption,
  DepartmentRoutingDecision,
  KevNormalizedResult,
  SecurityAlertDecision,
  TriageEvaluation,
} from '../types';

/**
 * Umbrales deterministas estrictos definidos en la especificación:
 * - Regla 1 (Seguridad): estrictamente > 0.70
 * - Regla 2 (Asignación automática): estrictamente > 0.85
 * - Regla 3 (Revisión humana): <= 0.85
 */
export const SECURITY_LEAK_THRESHOLD = 0.70;
export const AUTO_ASSIGN_CONFIDENCE_THRESHOLD = 0.85;

export const DEPARTMENT_LABELS: Record<DepartmentOption, string> = {
  frontend: 'Frontend & Experiencia de Usuario',
  backend: 'Backend & Servicios de API',
  billing: 'Facturación y Pagos (Billing)',
  devops: 'DevOps e Infraestructura',
};

/**
 * Evalúa la Regla 1: Alerta de seguridad.
 * Se activa exclusivamente si affirmativeProbability > 0.70.
 * Si es exactamente 0.70, NO se activa.
 */
export function evaluateSecurityRule(affirmativeProbability: number): SecurityAlertDecision {
  const triggered = affirmativeProbability > SECURITY_LEAK_THRESHOLD;

  if (triggered) {
    return {
      triggered: true,
      affirmativeProbability,
      threshold: SECURITY_LEAK_THRESHOLD,
      title: 'Alerta de Seguridad Prioritaria: Posible Exposición de Material Sensible',
      summary: `El modelo Kev estima una probabilidad afirmativa de ${(affirmativeProbability * 100).toFixed(1)}% (umbral estricto > 70.0%) de que la incidencia involucre credenciales, tokens, secretos o datos sensibles expuestos.`,
      recommendations: [
        'Iniciar revisión inmediata por parte del equipo de respuesta a incidentes o seguridad.',
        'Evaluar la revocación o rotación inmediata de tokens, claves o credenciales potencialmente afectadas.',
        'Evitar copiar o repetir secretos potencialmente sensibles en comentarios, canales públicos o registros.',
        'Conservar la evidencia técnica original (logs, trazas, marcas de tiempo) de forma segura y con acceso restringido.',
      ],
      disclaimer:
        'Aviso importante: Esta alerta se basa en una predicción probabilística del modelo Kev y no constituye una confirmación objetiva de que la filtración se haya producido.',
    };
  }

  return {
    triggered: false,
    affirmativeProbability,
    threshold: SECURITY_LEAK_THRESHOLD,
    title: 'Sin alerta prioritaria de filtración por umbral',
    summary: `La probabilidad estimada de filtración (${(affirmativeProbability * 100).toFixed(1)}%) no supera estrictamente el umbral de seguridad (> 70.0%).`,
    recommendations: [],
    disclaimer:
      'El resultado refleja una estimación del modelo; mantenga las prácticas habituales de higiene de credenciales.',
  };
}

/**
 * Evalúa las Reglas 2 y 3: Asignación automática vs Revisión humana.
 * - Si confidence > 0.85: propone asignación automática.
 * - Si confidence <= 0.85: exige revisión humana.
 */
export function evaluateDepartmentRoutingRule(
  department: DepartmentOption,
  confidence: number
): DepartmentRoutingDecision {
  const isAutoAssignable = confidence > AUTO_ASSIGN_CONFIDENCE_THRESHOLD;
  const deptName = DEPARTMENT_LABELS[department];

  if (isAutoAssignable) {
    return {
      mode: 'auto_assign',
      targetDepartment: department,
      confidence,
      threshold: AUTO_ASSIGN_CONFIDENCE_THRESHOLD,
      title: `Asignación Automática Propuesta: ${deptName}`,
      explanation: `La confianza de clasificación del departamento (${(confidence * 100).toFixed(1)}%) supera estrictamente el umbral requerido (> 85.0%). El sistema propone enrutar directamente la incidencia a ${deptName}.`,
    };
  }

  return {
    mode: 'human_review',
    targetDepartment: department,
    confidence,
    threshold: AUTO_ASSIGN_CONFIDENCE_THRESHOLD,
    title: 'Revisión Humana Requerida antes de Asignar',
    explanation: `La confianza de clasificación para ${deptName} es del ${(confidence * 100).toFixed(1)}%, valor inferior o igual al umbral de seguridad de enrutamiento (85.0%). Para evitar asignaciones erróneas en casos ambiguos, un operador humano debe validar el departamento destino.`,
  };
}

/**
 * Ejecuta todas las reglas deterministas de negocio de forma independiente.
 * La alerta de seguridad y la asignación de departamento son ortogonales:
 * nunca se oculta la alerta de seguridad aunque el departamento tenga alta confianza.
 */
export function evaluateTriageRules(result: KevNormalizedResult): TriageEvaluation {
  const securityAlert = evaluateSecurityRule(result.securityLeak.affirmativeProbability);
  const routing = evaluateDepartmentRoutingRule(
    result.department.selected,
    result.department.confidence
  );

  const triggeredRuleIds: string[] = [];

  if (securityAlert.triggered) {
    triggeredRuleIds.push('RULE_1_SECURITY_ALERT (> 0.70)');
  }

  if (routing.mode === 'auto_assign') {
    triggeredRuleIds.push('RULE_2_AUTO_ASSIGN (> 0.85)');
  } else {
    triggeredRuleIds.push('RULE_3_HUMAN_REVIEW (<= 0.85)');
  }

  return {
    securityAlert,
    routing,
    triggeredRuleIds,
  };
}