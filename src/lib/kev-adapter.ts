import type {
  DepartmentClassification,
  DepartmentOption,
  KevNormalizedResult,
  LatencyMetrics,
  SecurityLeakAssessment,
  SeverityAssessment,
  SeverityLevel,
} from '../types';

const VALID_DEPARTMENTS: readonly DepartmentOption[] = [
  'frontend',
  'backend',
  'billing',
  'devops',
];

const ORDERED_SEVERITIES: readonly SeverityLevel[] = [
  'low',
  'moderate',
  'high',
  'critical',
  'emergency',
];

export const SEVERITY_LEGENDS: Record<SeverityLevel, string> = {
  low: 'Impacto menor, sin interrupción significativa.',
  moderate: 'Degradación limitada con alternativa disponible.',
  high: 'Funcionalidad importante afectada.',
  critical: 'Servicio esencial interrumpido o impacto importante sobre usuarios.',
  emergency: 'Incidente extremo que exige atención inmediata.',
};

export class KevValidationError extends Error {
  public readonly diagnostics: string;

  constructor(message: string, diagnostics: string) {
    super(message);
    this.name = 'KevValidationError';
    this.diagnostics = diagnostics;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidProbability(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 1;
}

function isDepartmentOption(value: unknown): value is DepartmentOption {
  return typeof value === 'string' && (VALID_DEPARTMENTS as readonly string[]).includes(value);
}

function isSeverityLevel(value: unknown): value is SeverityLevel {
  return typeof value === 'string' && (ORDERED_SEVERITIES as readonly string[]).includes(value);
}

/**
 * Localiza el nodo de respuesta de una pregunta específica tanto si el servidor Kev
 * devuelve `answers` / `questions` / `results` como un objeto indexado por ID
 * o como un array de objetos `{ id, ... }`.
 */
function extractQuestionNode(
  root: Record<string, unknown>,
  questionId: string
): Record<string, unknown> {
  const containers = [root.answers, root.questions, root.results, root.outputs, root];

  for (const container of containers) {
    if (isRecord(container) && isRecord(container[questionId])) {
      return container[questionId] as Record<string, unknown>;
    }
    if (Array.isArray(container)) {
      const found = container.find(
        (item): item is Record<string, unknown> =>
          isRecord(item) && item.id === questionId
      );
      if (found) {
        return found;
      }
    }
  }

  throw new KevValidationError(
    `La respuesta del modelo no contiene el resultado obligatorio para la pregunta "${questionId}".`,
    `Claves presentes en la raíz: [${Object.keys(root).join(', ')}]`
  );
}

/**
 * Adapta y valida la pregunta A: `department` (tipo `choice`).
 */
function parseDepartmentNode(node: Record<string, unknown>): DepartmentClassification {
  const rawChoice = node.choice ?? node.answer ?? node.value ?? node.selected;

  if (!isDepartmentOption(rawChoice)) {
    throw new KevValidationError(
      'El campo "department" devuelto por Kev no corresponde a ninguna opción válida (frontend, backend, billing, devops).',
      `Valor recibido en department: ${JSON.stringify(rawChoice)}`
    );
  }

  const rawProbs = node.probabilities ?? node.distribution ?? node.probs ?? node.scores;
  let probabilities: Partial<Record<DepartmentOption, number>> | undefined;

  if (isRecord(rawProbs)) {
    const parsedProbs: Partial<Record<DepartmentOption, number>> = {};
    for (const dept of VALID_DEPARTMENTS) {
      const val = rawProbs[dept];
      if (val !== undefined) {
        if (!isValidProbability(val)) {
          throw new KevValidationError(
            `Probabilidad inválida para la opción "${dept}" en department.`,
            `Se esperaba número en [0, 1], se recibió: ${JSON.stringify(val)}`
          );
        }
        parsedProbs[dept] = val;
      }
    }
    if (Object.keys(parsedProbs).length > 0) {
      probabilities = parsedProbs;
    }
  }

  const explicitConfidence = node.confidence ?? node.probability ?? node.prob;

  if (explicitConfidence !== undefined) {
    if (!isValidProbability(explicitConfidence)) {
      throw new KevValidationError(
        'La confianza declarada para "department" está fuera del rango válido [0, 1].',
        `Valor recibido: ${JSON.stringify(explicitConfidence)}`
      );
    }
    return {
      selected: rawChoice,
      confidence: explicitConfidence,
      confidenceSource: 'explicit_protocol',
      probabilities,
    };
  }

  // Si no viene un campo `confidence` separado pero sí la distribución de probabilidades de las opciones,
  // la probabilidad asignada a la opción seleccionada está matemáticamente justificada.
  const selectedProb = probabilities?.[rawChoice];
  if (isValidProbability(selectedProb)) {
    return {
      selected: rawChoice,
      confidence: selectedProb,
      confidenceSource: 'winning_option_probability',
      probabilities,
    };
  }

  throw new KevValidationError(
    'No se pudo determinar la confianza de "department": el protocolo no devolvió ni confianza explícita ni probabilidad para la opción seleccionada.',
    `Nodo department recibido: ${JSON.stringify(node)}`
  );
}

/**
 * Adapta y valida la pregunta B: `severity` (tipo `score`).
 * Soporta representación por clave semántica ('low'..'emergency'),
 * índice base 0 (0..4) si viene explícitamente indicado como index, o nivel ordinal 1..5.
 */
function parseSeverityNode(node: Record<string, unknown>): SeverityAssessment {
  const rawLevel = node.level ?? node.label ?? node.choice ?? node.answer ?? node.value;
  const rawScore = node.score ?? node.index ?? node.value ?? rawLevel;

  let resolvedLevel: SeverityLevel | null = null;

  if (isSeverityLevel(rawLevel)) {
    resolvedLevel = rawLevel;
  } else if (typeof node.index === 'number' && Number.isInteger(node.index)) {
    // Índice base 0: 0 -> low, 4 -> emergency
    const byIndex = ORDERED_SEVERITIES[node.index];
    if (byIndex) {
      resolvedLevel = byIndex;
    }
  } else if (typeof rawScore === 'number' && Number.isInteger(rawScore)) {
    // Escala 1..5
    if (rawScore >= 1 && rawScore <= 5) {
      resolvedLevel = ORDERED_SEVERITIES[rawScore - 1] ?? null;
    } else if (rawScore === 0) {
      resolvedLevel = 'low';
    }
  }

  if (!resolvedLevel) {
    throw new KevValidationError(
      'No fue posible interpretar el nivel de "severity" devuelto por Kev.',
      `Se esperaba uno de [${ORDERED_SEVERITIES.join(', ')}] o puntuación 1-5. Recibido: ${JSON.stringify(node)}`
    );
  }

  const ordinalIndex = ORDERED_SEVERITIES.indexOf(resolvedLevel);
  const ordinal = (ordinalIndex + 1) as 1 | 2 | 3 | 4 | 5;

  const rawProbs = node.probabilities ?? node.distribution ?? node.probs;
  let probabilities: Partial<Record<SeverityLevel, number>> | undefined;
  if (isRecord(rawProbs)) {
    const parsed: Partial<Record<SeverityLevel, number>> = {};
    for (const lvl of ORDERED_SEVERITIES) {
      const val = rawProbs[lvl];
      if (val !== undefined) {
        if (!isValidProbability(val)) {
          throw new KevValidationError(
            `Probabilidad inválida en distribución de severidad para "${lvl}".`,
            `Valor recibido: ${JSON.stringify(val)}`
          );
        }
        parsed[lvl] = val;
      }
    }
    if (Object.keys(parsed).length > 0) {
      probabilities = parsed;
    }
  }

  const rawConf = node.confidence ?? node.probability;
  const confidence = isValidProbability(rawConf) ? rawConf : undefined;

  return {
    level: resolvedLevel,
    ordinal,
    rawScore:
      typeof rawScore === 'number' || typeof rawScore === 'string'
        ? rawScore
        : resolvedLevel,
    confidence,
    probabilities,
    legend: SEVERITY_LEGENDS[resolvedLevel],
  };
}

/**
 * Adapta y valida la pregunta C: `is_security_leak` (tipo `noul`).
 * Extrae estrictamente la probabilidad afirmativa según el contrato de respuestas noul.
 */
function parseSecurityLeakNode(node: Record<string, unknown>): SecurityLeakAssessment {
  let affirmativeProb: unknown =
    node.affirmative_probability ??
    node.yes_probability ??
    node.true_probability ??
    node.p_yes ??
    node.p_true ??
    node.score;

  const rawProbs = node.probabilities ?? node.distribution ?? node.probs;
  if (affirmativeProb === undefined && isRecord(rawProbs)) {
    affirmativeProb =
      rawProbs.yes ??
      rawProbs.true ??
      rawProbs.affirmative ??
      rawProbs['1'];
  }

  // Si el nodo devuelve `answer: true/false` o `"yes"/"no"` junto con `confidence`/`probability`:
  if (affirmativeProb === undefined) {
    const directProb = node.probability ?? node.confidence;
    const rawAns = node.answer ?? node.value ?? node.choice;

    if (isValidProbability(directProb)) {
      if (rawAns === true || rawAns === 'yes' || rawAns === 'true' || rawAns === undefined) {
        affirmativeProb = directProb;
      } else if (rawAns === false || rawAns === 'no' || rawAns === 'false') {
        affirmativeProb = Number((1 - directProb).toFixed(6));
      }
    }
  }

  if (!isValidProbability(affirmativeProb)) {
    throw new KevValidationError(
      'El campo "is_security_leak" (tipo noul) no contiene una probabilidad afirmativa válida en el rango [0, 1].',
      `Nodo recibido: ${JSON.stringify(node)}`
    );
  }

  const rawAnswer =
    typeof node.answer === 'boolean' || typeof node.answer === 'string'
      ? node.answer
      : undefined;

  return {
    affirmativeProbability: affirmativeProb,
    rawAnswer,
  };
}

/**
 * Extrae la latencia declarada por el modelo si viene informada en la respuesta,
 * manteniéndola diferenciada del RTT medido por el cliente.
 */
function parseLatencyMetrics(
  root: Record<string, unknown>,
  clientRoundTripMs: number | null
): LatencyMetrics {
  let modelDeclaredMs: number | null = null;

  const rawLatency =
    root.latency_ms ??
    root.latencyMs ??
    root.inference_time_ms ??
    (isRecord(root.metadata) ? root.metadata.latency_ms : undefined) ??
    (isRecord(root.timing) ? root.timing.latency_ms : undefined);

  if (typeof rawLatency === 'number' && !Number.isNaN(rawLatency) && rawLatency >= 0) {
    modelDeclaredMs = Math.round(rawLatency);
  } else if (
    typeof root.latency === 'number' &&
    !Number.isNaN(root.latency) &&
    root.latency >= 0
  ) {
    // Si viene en segundos (ej. 0.042) frente a milisegundos
    modelDeclaredMs =
      root.latency < 10 ? Math.round(root.latency * 1000) : Math.round(root.latency);
  }

  return {
    modelDeclaredMs,
    clientRoundTripMs:
      typeof clientRoundTripMs === 'number' && clientRoundTripMs >= 0
        ? Math.round(clientRoundTripMs)
        : null,
  };
}

/**
 * Transforma y valida un payload crudo de `/v1/systemone` en `KevNormalizedResult`.
 */
export function adaptKevResponse(
  rawPayload: unknown,
  options: {
    clientRoundTripMs: number | null;
    isDemo?: boolean;
    demoFixtureName?: string;
    fallbackModelName?: string;
  }
): KevNormalizedResult {
  if (!isRecord(rawPayload)) {
    throw new KevValidationError(
      'La respuesta del servidor no es un objeto JSON válido.',
      `Tipo recibido: ${typeof rawPayload}`
    );
  }

  const deptNode = extractQuestionNode(rawPayload, 'department');
  const sevNode = extractQuestionNode(rawPayload, 'severity');
  const secNode = extractQuestionNode(rawPayload, 'is_security_leak');

  const department = parseDepartmentNode(deptNode);
  const severity = parseSeverityNode(sevNode);
  const securityLeak = parseSecurityLeakNode(secNode);
  const latency = parseLatencyMetrics(rawPayload, options.clientRoundTripMs);

  const model =
    typeof rawPayload.model === 'string' && rawPayload.model.trim().length > 0
      ? rawPayload.model.trim()
      : options.fallbackModelName ?? 'kev-systemone';

  const metadata: KevNormalizedResult['metadata'] = {};
  if (typeof rawPayload.id === 'string') {
    metadata.requestId = rawPayload.id;
  }
  if (isRecord(rawPayload.usage) && typeof rawPayload.usage.total_tokens === 'number') {
    metadata.usageTokens = rawPayload.usage.total_tokens;
  }

  return {
    model,
    isDemo: Boolean(options.isDemo),
    demoFixtureName: options.demoFixtureName,
    department,
    severity,
    securityLeak,
    latency,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}