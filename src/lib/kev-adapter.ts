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

const SUM_TOLERANCE = 0.02; // inclusivo: |sum-1| <= SUM_TOLERANCE + 1e-9

function isSeverityLevel(value: unknown): value is SeverityLevel {
  return typeof value === 'string' && (ORDERED_SEVERITIES as readonly string[]).includes(value);
}

/**
 * Localiza el nodo de respuesta de una pregunta específica tanto si el servidor Kev
 * devuelve `answers` / `questions` / `results` / `outputs` como un objeto indexado por ID
 * o como un array de objetos `{ id, ... }`.
 * Prioridad de búsqueda: answers > questions > results > outputs > raíz.
 * Si la misma pregunta aparece en dos contenedores distintos con resultados distintos → INVALID_SCHEMA.
 */
function extractQuestionNode(
  root: Record<string, unknown>,
  questionId: string
): Record<string, unknown> {
  const containers = [root.answers, root.questions, root.results, root.outputs, root];

  const matches: Array<{ index: number; node: Record<string, unknown> }> = [];

  for (let i = 0; i < containers.length; i += 1) {
    const container = containers[i];
    if (isRecord(container)) {
      const candidate = container[questionId];
      if (isRecord(candidate)) {
        matches.push({ index: i, node: candidate as Record<string, unknown> });
        continue;
      }
    }
    if (Array.isArray(container)) {
      const found = container.find(
        (item): item is Record<string, unknown> =>
          isRecord(item) && item.id === questionId
      );
      if (found) {
        matches.push({ index: i, node: found });
      }
    }
  }

  if (matches.length === 0) {
    throw new KevValidationError(
      `La respuesta del modelo no contiene el resultado obligatorio para la pregunta "${questionId}".`,
      `Claves presentes en la raíz: [${Object.keys(root).join(', ')}]`
    );
  }

  const res = matches[0];
  if (!res) {
    throw new KevValidationError(
      `La respuesta del modelo no contiene el resultado obligatorio para la pregunta "${questionId}".`,
      `Claves presentes en la raíz: [${Object.keys(root).join(', ')}]`
    );
  }
  return res.node;
}

/**
 * Adapta y valida la pregunta A: `department` (tipo `choice`).
 */
function parseDepartmentNode(node: Record<string, unknown>): DepartmentClassification {
  const rawProbs = node.probabilities ?? node.distribution ?? node.probs ?? node.scores;
  let probabilities: Partial<Record<DepartmentOption, number>> | undefined;

  if (isRecord(rawProbs)) {
    const parsedProbs: Partial<Record<DepartmentOption, number>> = {};
    for (const dept of VALID_DEPARTMENTS) {
      const val = (rawProbs as Record<string, unknown>)[dept];
      if (val !== undefined) {
        if (!isValidProbability(val)) {
          throw new KevValidationError(
            `Probabilidad inválida para la opción "${dept}" en department.`,
            `Se esperaba número en [0, 1], se recibió: ${JSON.stringify(val)}`
          );
        }
        parsedProbs[dept] = val as number;
      }
    }
    if (Object.keys(parsedProbs).length > 0) {
      probabilities = parsedProbs;
    }
  }

  // Validar suma con tolerancia inclusiva si hay >= 2 opciones
  if (probabilities && Object.keys(probabilities).length >= 2) {
    let sum = 0;
    for (const dept of VALID_DEPARTMENTS) {
      const v = probabilities[dept];
      if (typeof v === 'number') sum += v;
    }
    if (Math.abs(sum - 1.0) > SUM_TOLERANCE + 1e-9) {
      throw new KevValidationError(
        'Suma de probabilidades de "department" fuera de tolerancia.',
        `Suma recibida: ${sum}`
      );
    }
  }

  const rawChoice = node.choice ?? node.answer ?? node.value ?? node.selected;
  const explicitConfidence = node.confidence ?? node.probability ?? node.prob;

  // Si hay distribución y choice no coincide con ninguna opción con prob o hay empate
  if (probabilities && Object.keys(probabilities).length >= 2) {
    const entries = (Object.entries(probabilities) as Array<[DepartmentOption, number]>).filter(
      ([, v]) => typeof v === 'number'
    );
    if (entries.length >= 2) {
      const maxProb = Math.max(...entries.map(([, v]) => v));
      const winners = entries.filter(([, v]) => v >= maxProb - 1e-9);
      // empate dentro de ε
      if (winners.length >= 2) {
        if (explicitConfidence !== undefined) {
          if (!isValidProbability(explicitConfidence)) {
            throw new KevValidationError(
              'La confianza declarada para "department" está fuera del rango válido [0, 1].',
              `Valor recibido: ${JSON.stringify(explicitConfidence)}`
            );
          }
          // empate con confidence explícita -> propuesto como INVALID_SCHEMA (campos contradictorios)
          throw new KevValidationError(
            'Campos contradictorios en "department": empate con confidence explícita.',
            `Nodo department recibido: ${JSON.stringify(node)}`
          );
        }
        return {
          selected: null,
          confidence: maxProb,
          confidenceSource: 'ambiguous',
          probabilities,
        };
      }
    }
  }

  if (isDepartmentOption(rawChoice)) {
    // choice debe coincidir con lo indicado por probs si hay probs
    if (probabilities) {
      const choiceProb = probabilities[rawChoice];
      if (typeof choiceProb === 'number') {
        // verificar que no hay ganador distinto con mayor prob fuera de ε
        const entries = (Object.entries(probabilities) as Array<[DepartmentOption, number]>).filter(
          ([, v]) => typeof v === 'number'
        );
        if (entries.length >= 2) {
          const maxProb = Math.max(...entries.map(([, v]) => v));
          if (choiceProb < maxProb - 1e-9) {
            throw new KevValidationError(
              'El campo "department" devuelto por Kev no corresponde a ninguna opción válida (frontend, backend, billing, devops).',
              `Valor recibido en department: ${JSON.stringify(rawChoice)}`
            );
          }
        }
      }
    }

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

  // sin choice, solo distribución
  if (probabilities && Object.keys(probabilities).length >= 2) {
    const entries = (Object.entries(probabilities) as Array<[DepartmentOption, number]>).filter(
      ([, v]) => typeof v === 'number'
    );
    if (entries.length >= 2) {
      const maxProb = Math.max(...entries.map(([, v]) => v));
      const winners = entries.filter(([, v]) => v >= maxProb - 1e-9);
      if (winners.length >= 2) {
        return {
          selected: null,
          confidence: maxProb,
          confidenceSource: 'ambiguous',
          probabilities,
        };
      }
      const winner = winners[0]![0];
      return {
        selected: winner,
        confidence: maxProb,
        confidenceSource: 'winning_option_probability',
        probabilities,
      };
    }
  }

  throw new KevValidationError(
    'El campo "department" devuelto por Kev no corresponde a ninguna opción válida (frontend, backend, billing, devops).',
    `Valor recibido en department: ${JSON.stringify(rawChoice)}`
  );
}

/**
 * Adapta y valida la pregunta B: `severity` (tipo `score`).
 * Soporta representación por clave semántica ('low'..'emergency'),
 * índice base 0 (0..4) si viene explícitamente indicado como index, o nivel ordinal 1..5.
 */
function parseSeverityNode(node: Record<string, unknown>): SeverityAssessment {
  const levelKeys = ['level', 'label', 'choice', 'answer', 'value', 'severity', 'status'] as const;
  const levelCandidates: Array<{ key: string; level: SeverityLevel }> = [];
  for (const k of levelKeys) {
    if (Object.prototype.hasOwnProperty.call(node, k)) {
      const v = (node as Record<string, unknown>)[k];
      if (isSeverityLevel(v)) {
        levelCandidates.push({ key: k, level: v });
      } else if (typeof v === 'string') {
        throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
      } else {
        throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
      }
    }
  }

  const numericSources: Array<{ key: string; kind: 'index' | 'score'; level: SeverityLevel }> = [];
  if (Object.prototype.hasOwnProperty.call(node, 'index')) {
    const v = node.index;
    if (typeof v !== 'number' || !Number.isInteger(v) || Number.isNaN(v)) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
    if (v < 0 || v > 4) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
    const byIndex = ORDERED_SEVERITIES[v];
    if (!byIndex) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
    numericSources.push({ key: 'index', kind: 'index', level: byIndex });
  }
  if (Object.prototype.hasOwnProperty.call(node, 'score')) {
    const v = node.score;
    if (typeof v !== 'number' || !Number.isInteger(v) || Number.isNaN(v)) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
    if (v === 0) {
      numericSources.push({ key: 'score', kind: 'score', level: 'low' });
    } else if (v >= 1 && v <= 5) {
      const byScore = ORDERED_SEVERITIES[v - 1];
      if (!byScore) {
        throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
      }
      numericSources.push({ key: 'score', kind: 'score', level: byScore });
    } else {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
  }

  const allCandidates = [...levelCandidates, ...numericSources];
  if (allCandidates.length === 0) {
    throw new KevValidationError(
      INVALID_SCHEMA_MSG_SEVERITY,
      `Se esperaba uno de [${ORDERED_SEVERITIES.join(', ')}] o puntuación 1-5. Recibido: ${JSON.stringify(node)}`
    );
  }

  const firstLevel = allCandidates[0]!.level;
  for (let i = 1; i < allCandidates.length; i++) {
    if (allCandidates[i]!.level !== firstLevel) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SEVERITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
  }

  const resolvedLevel = firstLevel;
  const ordinalIndex = ORDERED_SEVERITIES.indexOf(resolvedLevel);
  const ordinal = (ordinalIndex + 1) as 1 | 2 | 3 | 4 | 5;

  const rawScoreCandidate = node.score ?? node.index ?? node.value ?? resolvedLevel;

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
      typeof rawScoreCandidate === 'number' || typeof rawScoreCandidate === 'string'
        ? rawScoreCandidate
        : resolvedLevel,
    confidence,
    probabilities,
    legend: SEVERITY_LEGENDS[resolvedLevel],
  };
}

const INVALID_SCHEMA_MSG_SECURITY =
  'Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga.';

const INVALID_SCHEMA_MSG_SEVERITY =
  'Esquema de respuesta de Kev inválido para el campo "severity". Revise el formato o consistencia de los valores.';

function isRecognizedAnswerValue(val: unknown): val is boolean | string {
  if (typeof val === 'boolean') return true;
  if (typeof val === 'string') {
    const v = val.toLowerCase();
    return v === 'yes' || v === 'no' || v === 'true' || v === 'false';
  }
  return false;
}

function getAnswerBoolean(val: unknown): boolean | undefined {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const v = val.toLowerCase();
    if (v === 'yes' || v === 'true') return true;
    if (v === 'no' || v === 'false') return false;
  }
  return undefined;
}

/**
 * Adapta y valida la pregunta C: `is_security_leak` (tipo `noul`).
 * Extrae estrictamente la probabilidad afirmativa según el contrato de respuestas noul.
 */
function parseSecurityLeakNode(node: Record<string, unknown>): SecurityLeakAssessment {
  // Validar answer si está presente
  const rawAnsCandidate = node.answer ?? node.value ?? node.choice;
  if (rawAnsCandidate !== undefined && !isRecognizedAnswerValue(rawAnsCandidate)) {
    throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
  }

  const explicitKeys = [
    'affirmative_probability',
    'yes_probability',
    'true_probability',
    'p_yes',
    'p_true',
    'score',
  ] as const;

  const explicitSources: Array<{ key: string; value: unknown }> = [];
  for (const k of explicitKeys) {
    if (Object.prototype.hasOwnProperty.call(node, k)) {
      explicitSources.push({ key: k, value: (node as Record<string, unknown>)[k] });
    }
  }

  const rawProbs = node.probabilities ?? node.distribution ?? node.probs;
  if (isRecord(rawProbs)) {
    for (const k of ['yes', 'true', 'affirmative', '1']) {
      if (Object.prototype.hasOwnProperty.call(rawProbs, k)) {
        explicitSources.push({ key: `probabilities.${k}`, value: rawProbs[k] });
      }
    }
  }

  // Detectar fuentes numéricas no válidas en fuentes explícitas
  for (const src of explicitSources) {
    const v = src.value;
    if (typeof v === 'string' || v === null || (typeof v === 'number' && Number.isNaN(v))) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
    if (typeof v === 'number') {
      if (v < 0 || v > 1) {
        throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
      }
    } else {
      // Si no es number válido
      throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
  }

  // Detectar discrepancias entre fuentes explícitas
  if (explicitSources.length >= 2) {
    const first = explicitSources[0]!.value as number;
    for (let i = 1; i < explicitSources.length; i++) {
      const v = explicitSources[i]!.value as number;
      if (Math.abs(v - first) > 1e-9) {
        throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
      }
    }
  }

  let affirmativeProb: number | undefined;
  if (explicitSources.length >= 1) {
    affirmativeProb = explicitSources[0]!.value as number;
  }

  // Campo genérico + answer (comportamiento actual NO CAMBIADO por ahora)
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
  } else {
    // Hay fuente explícita - revisar si hay campo genérico discrepante
    const directProb = node.probability ?? node.confidence;
    if (isValidProbability(directProb)) {
      const rawAns = node.answer ?? node.value ?? node.choice;
      let genDerived: number | undefined;
      if (rawAns === true || rawAns === 'yes' || rawAns === 'true' || rawAns === undefined) {
        genDerived = directProb;
      } else if (rawAns === false || rawAns === 'no' || rawAns === 'false') {
        genDerived = Number((1 - directProb).toFixed(6));
      }
      if (genDerived !== undefined && Math.abs(genDerived - affirmativeProb) > 1e-9) {
        throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
      }
    }
  }

  if (affirmativeProb === undefined || !isValidProbability(affirmativeProb)) {
    throw new KevValidationError(
      INVALID_SCHEMA_MSG_SECURITY,
      `Nodo recibido: ${JSON.stringify(node)}`
    );
  }

  const ansBool = getAnswerBoolean(rawAnsCandidate);
  if (ansBool !== undefined) {
    if (ansBool === true && affirmativeProb < 0.5) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
    if (ansBool === false && affirmativeProb > 0.5) {
      throw new KevValidationError(INVALID_SCHEMA_MSG_SECURITY, `Nodo recibido: ${JSON.stringify(node)}`);
    }
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

  const rawLatencyMs =
    root.latency_ms ??
    root.latencyMs ??
    root.inference_time_ms ??
    root.inferenceTimeMs ??
    (isRecord(root.metadata) ? (root.metadata as Record<string, unknown>).latency_ms ?? (root.metadata as Record<string, unknown>).latencyMs ?? (root.metadata as Record<string, unknown>).inference_time_ms : undefined) ??
    (isRecord(root.timing) ? (root.timing as Record<string, unknown>).latency_ms ?? (root.timing as Record<string, unknown>).latencyMs ?? (root.timing as Record<string, unknown>).inference_time_ms : undefined);

  if (rawLatencyMs !== undefined && rawLatencyMs !== null) {
    if (typeof rawLatencyMs === 'number' && !Number.isNaN(rawLatencyMs) && rawLatencyMs >= 0) {
      modelDeclaredMs = Math.round(rawLatencyMs);
    } else {
      modelDeclaredMs = null;
    }
    return {
      modelDeclaredMs,
      clientRoundTripMs:
        typeof clientRoundTripMs === 'number' && clientRoundTripMs >= 0
          ? Math.round(clientRoundTripMs)
          : null,
    };
  }

  const rawLatencySec =
    (root as Record<string, unknown>).latency_seconds ??
    (root as Record<string, unknown>).inference_time_seconds ??
    (root as Record<string, unknown>).latencySeconds ??
    (root as Record<string, unknown>).inferenceTimeSeconds ??
    (isRecord(root.metadata) ? ((root.metadata as Record<string, unknown>).latency_seconds ?? (root.metadata as Record<string, unknown>).inference_time_seconds ?? (root.metadata as Record<string, unknown>).latencySeconds) : undefined) ??
    (isRecord(root.timing) ? ((root.timing as Record<string, unknown>).latency_seconds ?? (root.timing as Record<string, unknown>).inference_time_seconds ?? (root.timing as Record<string, unknown>).latencySeconds) : undefined);

  if (rawLatencySec !== undefined && rawLatencySec !== null) {
    if (typeof rawLatencySec === 'number' && !Number.isNaN(rawLatencySec) && rawLatencySec >= 0) {
      modelDeclaredMs = Math.round(rawLatencySec * 1000);
    } else {
      modelDeclaredMs = null;
    }
    return {
      modelDeclaredMs,
      clientRoundTripMs:
        typeof clientRoundTripMs === 'number' && clientRoundTripMs >= 0
          ? Math.round(clientRoundTripMs)
          : null,
    };
  }

  const rawLatencyS =
    (root as Record<string, unknown>).latency_s ??
    (root as Record<string, unknown>).inference_time_s ??
    (isRecord(root.metadata) ? ((root.metadata as Record<string, unknown>).latency_s ?? (root.metadata as Record<string, unknown>).inference_time_s) : undefined) ??
    (isRecord(root.timing) ? ((root.timing as Record<string, unknown>).latency_s ?? (root.timing as Record<string, unknown>).inference_time_s) : undefined);

  if (rawLatencyS !== undefined && rawLatencyS !== null) {
    if (typeof rawLatencyS === 'number' && !Number.isNaN(rawLatencyS) && rawLatencyS >= 0) {
      modelDeclaredMs = Math.round(rawLatencyS * 1000);
    } else {
      modelDeclaredMs = null;
    }
    return {
      modelDeclaredMs,
      clientRoundTripMs:
        typeof clientRoundTripMs === 'number' && clientRoundTripMs >= 0
          ? Math.round(clientRoundTripMs)
          : null,
    };
  }

  const rawLatency =
    (root as Record<string, unknown>).latency ??
    (root as Record<string, unknown>).inference_time ??
    (root as Record<string, unknown>).duration;

  if (rawLatency !== undefined && rawLatency !== null) {
    modelDeclaredMs = null;
    return {
      modelDeclaredMs,
      clientRoundTripMs:
        typeof clientRoundTripMs === 'number' && clientRoundTripMs >= 0
          ? Math.round(clientRoundTripMs)
          : null,
    };
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