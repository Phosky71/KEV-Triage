/**
 * Tipos compartidos y contratos de datos para Kev Triage.
 * Separa estrictamente el contrato de protocolo (/v1/systemone) del modelo interno de dominio.
 */

export type DepartmentOption = 'frontend' | 'backend' | 'billing' | 'devops';

export type SeverityLevel = 'low' | 'moderate' | 'high' | 'critical' | 'emergency';

export interface IncidentTemplate {
  id: 'template-a' | 'template-b' | 'template-c';
  title: string;
  badge: string;
  description: string;
  content: string;
}

/**
 * Definición de preguntas según el protocolo /v1/systemone de Kev.
 */
export interface KevChoiceQuestion {
  id: 'department';
  type: 'choice';
  question: string;
  options: DepartmentOption[];
  criteria: Record<DepartmentOption, string>;
}

export interface KevScoreQuestion {
  id: 'severity';
  type: 'score';
  question: string;
  levels: SeverityLevel[];
  criteria: Record<SeverityLevel, string>;
}

export interface KevNoulQuestion {
  id: 'is_security_leak';
  type: 'noul';
  question: string;
  criteria: string;
}

export type KevQuestion = KevChoiceQuestion | KevScoreQuestion | KevNoulQuestion;

export interface KevSystemOneRequest {
  state: string;
  model: string;
  questions: KevQuestion[];
}

/**
 * Modelo interno normalizado y validado tras pasar por kev-adapter.ts
 */
export interface DepartmentClassification {
  selected: DepartmentOption;
  /**
   * Confianza de la clasificación en rango [0, 1].
   * Documentación de origen en `confidenceSource`.
   */
  confidence: number;
  confidenceSource: 'explicit_protocol' | 'winning_option_probability';
  probabilities?: Partial<Record<DepartmentOption, number>>;
}

export interface SeverityAssessment {
  level: SeverityLevel;
  /**
   * Rango ordinal normalizado de 1 (low) a 5 (emergency) para representación consistente.
   */
  ordinal: 1 | 2 | 3 | 4 | 5;
  /**
   * Valor crudo devuelto por el protocolo (índice, score numérico o clave).
   */
  rawScore: number | string;
  confidence?: number;
  probabilities?: Partial<Record<SeverityLevel, number>>;
  legend: string;
}

export interface SecurityLeakAssessment {
  /**
   * Probabilidad correspondiente a la respuesta afirmativa en rango [0, 1].
   */
  affirmativeProbability: number;
  rawAnswer?: string | boolean;
}

export interface LatencyMetrics {
  /** Latencia declarada por el servidor/modelo en milisegundos, si existe en la respuesta */
  modelDeclaredMs: number | null;
  /** Tiempo total de ida y vuelta (RTT) medido por el cliente HTTP en milisegundos */
  clientRoundTripMs: number | null;
}

export interface KevNormalizedResult {
  model: string;
  isDemo: boolean;
  demoFixtureName?: string;
  department: DepartmentClassification;
  severity: SeverityAssessment;
  securityLeak: SecurityLeakAssessment;
  latency: LatencyMetrics;
  metadata?: {
    requestId?: string;
    usageTokens?: number;
  };
}

/**
 * Reglas deterministas de negocio evaluadas sobre KevNormalizedResult.
 */
export type RoutingMode = 'auto_assign' | 'human_review';

export interface SecurityAlertDecision {
  triggered: boolean;
  affirmativeProbability: number;
  threshold: number;
  title: string;
  summary: string;
  recommendations: string[];
  disclaimer: string;
}

export interface DepartmentRoutingDecision {
  mode: RoutingMode;
  targetDepartment: DepartmentOption;
  confidence: number;
  threshold: number;
  title: string;
  explanation: string;
}

export interface TriageEvaluation {
  securityAlert: SecurityAlertDecision;
  routing: DepartmentRoutingDecision;
  triggeredRuleIds: string[];
}

/**
 * Estados de error controlados
 */
export type TriageErrorCode =
  | 'UNCONFIGURED_SERVICE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'HTTP_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_SCHEMA';

export interface TriageError {
  code: TriageErrorCode;
  title: string;
  message: string;
  httpStatus?: number;
  diagnostics?: string;
}