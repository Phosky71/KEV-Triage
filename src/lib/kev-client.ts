import type { KevNormalizedResult, KevSystemOneRequest, TriageError } from '../types';
import { adaptKevResponse, KevValidationError } from './kev-adapter';

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Construye el payload oficial para `POST /v1/systemone` con las tres preguntas
 * conceptuales requeridas: `department` (choice), `severity` (score) e `is_security_leak` (noul).
 */
export function buildSystemOnePayload(
  incidentState: string,
  modelName = 'kev-default'
): KevSystemOneRequest {
  return {
    state: incidentState.trim(),
    model: modelName,
    questions: [
      {
        id: 'department',
        type: 'choice',
        question:
          '¿Qué departamento técnico es el principal responsable de diagnosticar y resolver esta incidencia?',
        options: ['frontend', 'backend', 'billing', 'devops'],
        criteria: {
          frontend: 'Problemas de interfaz, estilos, navegador y experiencia de usuario.',
          backend: 'Errores de lógica de negocio, API y servicios.',
          billing: 'Pagos, facturación, cobros y transacciones.',
          devops: 'Infraestructura, despliegues, redes, disponibilidad y operaciones.',
        },
      },
      {
        id: 'severity',
        type: 'score',
        question: '¿Cuál es el nivel de severidad operativa de la incidencia descrita?',
        levels: ['low', 'moderate', 'high', 'critical', 'emergency'],
        criteria: {
          low: 'Impacto menor, sin interrupción significativa.',
          moderate: 'Degradación limitada con alternativa disponible.',
          high: 'Funcionalidad importante afectada.',
          critical: 'Servicio esencial interrumpido o impacto importante sobre usuarios.',
          emergency: 'Incidente extremo que exige atención inmediata.',
        },
      },
      {
        id: 'is_security_leak',
        type: 'noul',
        question:
          '¿La descripción presenta indicios de filtración de credenciales, tokens, secretos, datos personales expuestos u otros materiales sensibles?',
        criteria:
          'Evaluar afirmativamente si se mencionan tokens de acceso en logs, claves expuestas, credenciales filtradas o exposición no autorizada de datos sensibles.',
      },
    ],
  };
}

/**
 * Normaliza la URL base configurada y garantiza que apunte a `/v1/systemone`
 * sin duplicar barras ni segmentos `/v1/systemone`.
 */
export function resolveSystemOneEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (trimmed.endsWith('/v1/systemone')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/systemone`;
  }
  return `${trimmed}/v1/systemone`;
}

/**
 * Comprueba si la URL configurada es una URL real utilizable o si sigue teniendo el placeholder de ejemplo.
 */
export function isServiceUrlConfigured(rawEnvUrl?: string): boolean {
  const url = (rawEnvUrl ?? import.meta.env.VITE_MODAL_API_URL ?? '').trim();
  if (!url) {
    return false;
  }
  if (url.includes('TU_USUARIO--kev-api.modal.run')) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export class KevClientException extends Error {
  public readonly triageError: TriageError;

  constructor(triageError: TriageError) {
    super(triageError.message);
    this.name = 'KevClientException';
    this.triageError = triageError;
  }
}

export interface AnalyzeIncidentOptions {
  incidentText: string;
  baseUrl?: string;
  modelName?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Realiza la petición HTTP `POST /v1/systemone` a la instancia de Kev o proxy configurado,
 * mide el tiempo de ida y vuelta del cliente y valida la respuesta con `adaptKevResponse`.
 */
export async function analyzeIncidentWithKev(
  options: AnalyzeIncidentOptions
): Promise<KevNormalizedResult> {
  const configuredBaseUrl = (
    options.baseUrl ??
    import.meta.env.VITE_MODAL_API_URL ??
    ''
  ).trim();

  if (!isServiceUrlConfigured(configuredBaseUrl)) {
    throw new KevClientException({
      code: 'UNCONFIGURED_SERVICE',
      title: 'Servicio Kev no configurado',
      message:
        'No se ha detectado una URL válida en VITE_MODAL_API_URL (o mantiene el valor de plantilla TU_USUARIO--kev-api.modal.run). Configure una instancia real de Kev en su archivo .env o active explícitamente el Modo de Demostración.',
      diagnostics: 'Endpoint pendiente de configuración en variables de entorno.',
    });
  }

  const endpoint = resolveSystemOneEndpoint(configuredBaseUrl);
  const modelName =
    (options.modelName ?? import.meta.env.VITE_KEV_MODEL ?? 'kev-default').trim() ||
    'kev-default';

  const payload = buildSystemOnePayload(options.incidentText, modelName);

  const timeoutController = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, timeoutMs);

  const onExternalAbort = () => timeoutController.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Petición cancelada por el usuario.', 'AbortError');
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const startTime = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: timeoutController.signal,
    });

    const clientRoundTripMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      throw new KevClientException({
        code: 'HTTP_ERROR',
        title: `Error del servidor HTTP ${response.status}`,
        message: `El servicio en ${endpoint} respondió con el código de estado ${response.status} (${response.statusText || 'Error HTTP'}).`,
        httpStatus: response.status,
        diagnostics: `POST ${endpoint} -> HTTP ${response.status}`,
      });
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch {
      throw new KevClientException({
        code: 'INVALID_JSON',
        title: 'Respuesta JSON inválida',
        message:
          'El servidor devolvió un cuerpo de respuesta que no pudo analizarse como JSON válido.',
        diagnostics: `POST ${endpoint} -> Error de parseo JSON (HTTP ${response.status})`,
      });
    }

    try {
      return adaptKevResponse(rawJson, {
        clientRoundTripMs,
        isDemo: false,
        fallbackModelName: modelName,
      });
    } catch (validationErr) {
      if (validationErr instanceof KevValidationError) {
        throw new KevClientException({
          code: 'INVALID_SCHEMA',
          title: 'Respuesta incompatible con el contrato de Kev',
          message: validationErr.message,
          diagnostics: validationErr.diagnostics,
        });
      }
      throw validationErr;
    }
  } catch (err) {
    if (err instanceof KevClientException) {
      throw err;
    }

    if (options.signal?.aborted && !didTimeout) {
      throw new DOMException('Petición cancelada', 'AbortError');
    }

    if (didTimeout) {
      throw new KevClientException({
        code: 'TIMEOUT_ERROR',
        title: 'Tiempo de espera agotado',
        message: `El servicio de Kev no respondió dentro del límite de ${(timeoutMs / 1000).toFixed(0)} segundos.Si utiliza un despliegue serverless en frío (cold start en GPU), vuelva a intentarlo.`,
        diagnostics: `Timeout de ${timeoutMs}ms excedido en POST ${endpoint}`,
      });
    }

    throw new KevClientException({
      code: 'NETWORK_ERROR',
      title: 'Error de conexión de red',
      message:
        'No fue posible establecer conexión con el endpoint de Kev. Verifique que la instancia esté activa, la red sea accesible y las políticas CORS (o el proxy local) estén habilitadas.',
      diagnostics: err instanceof Error ? err.message : 'Fallo en fetch()',
    });
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}