/**
 * Traducción pura entre Kev (/v1/systemone) y FreeLLM Gateway (/v1/decisions)
 * Sin dependencias, testable. No modifica adaptKevResponse/adaptKevResponsePartial.
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(v) {
  return typeof v === 'string';
}

/**
 * Convierte el payload Kev (questions array) al formato /v1/decisions
 * - questions ARRAY → objeto indexado por id
 * - question → instructions
 * - descartar options (las claves de criteria SON las opciones)
 * - department/severity: choice con criteria
 * - is_security_leak: choice con criteria { yes: ..., no: ... } derivados del criteria string de Kev
 * - añade model: opts.model (default 'auto')
 */
export function kevPayloadToGateway(payload, opts = {}) {
  if (!isRecord(payload)) {
    throw new Error('Payload Kev inválido');
  }

  const model = isString(opts.model) && opts.model.trim().length > 0 ? opts.model.trim() : 'auto';
  const state = isString(payload.state) ? payload.state : '';

  const questionsArray = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = {};

  for (let i = 0; i < questionsArray.length; i += 1) {
    const q = questionsArray[i];
    if (!isRecord(q)) continue;
    const id = isString(q.id) ? q.id : '';
    if (!id) continue;

    const type = isString(q.type) ? q.type : 'choice';
    const instructions = isString(q.question) ? q.question : (isString(q.instructions) ? q.instructions : '');

    if (id === 'is_security_leak') {
      // criteria construido como { yes: "...", no: "..." } derivados del criteria string de Kev
      const criteriaStr = isString(q.criteria) ? q.criteria : '';
      questions[id] = {
        type: 'choice',
        instructions,
        criteria: {
          yes: criteriaStr || 'Se presentan indicios de filtración de credenciales, tokens, secretos o datos sensibles.',
          no: 'No se presentan indicios claros de filtración de credenciales, tokens, secretos o datos sensibles.',
        },
      };
      continue;
    }

    // Para department y severity, las claves de criteria SON las opciones
    if (isRecord(q.criteria)) {
      questions[id] = {
        type,
        instructions,
        criteria: q.criteria,
      };
      continue;
    }

    // Fallback: si no hay criteria como objeto, intentar construir desde options/levels
    if (Array.isArray(q.options)) {
      const criteria = {};
      for (let j = 0; j < q.options.length; j += 1) {
        const opt = q.options[j];
        if (isString(opt)) {
          criteria[opt] = isString(q.criteria) ? q.criteria : opt;
        }
      }
      questions[id] = {
        type,
        instructions,
        criteria,
      };
      continue;
    }

    if (Array.isArray(q.levels)) {
      const criteria = {};
      for (let j = 0; j < q.levels.length; j += 1) {
        const lvl = q.levels[j];
        if (isString(lvl)) {
          criteria[lvl] = isString(q.criteria) ? q.criteria : lvl;
        }
      }
      questions[id] = {
        type,
        instructions,
        criteria,
      };
      continue;
    }

    questions[id] = {
      type,
      instructions,
      criteria: q.criteria || {},
    };
  }

  return {
    state,
    model,
    questions,
  };
}

/**
 * Traduce respuesta de /v1/decisions a forma compatible con kev-adapter
 * - passthrough de answers/model
 * - usage.total_tokens = input_tokens + output_tokens
 * - conservar provider en metadata si es tolerado
 * - si gw no es objeto → dejar que el flujo actual lance KevValidationError
 */
export function gatewayResponseToKevShape(gw, meta = {}) {
  if (!isRecord(gw)) {
    // Dejar que el flujo actual maneje - retornar tal como está para que kev-adapter lo valide
    return gw;
  }

  const out = { ...gw };

  // Asegurar usage.total_tokens
  if (isRecord(out.usage)) {
    const usage = { ...out.usage };
    if (typeof usage.total_tokens !== 'number') {
      const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
      const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
      usage.total_tokens = input + output;
    }
    out.usage = usage;
  } else if (typeof gw.usage === 'undefined') {
    // No forzar si no existe
  }

  // Preservar provider en metadata si existe y adapter lo tolera
  if (isString(gw.provider) && !out.metadata) {
    out.metadata = { provider: gw.provider };
  } else if (isString(gw.provider) && isRecord(out.metadata)) {
    out.metadata.provider = gw.provider;
  }

  // Passthrough de answers/model ya están presentes
  return out;
}

/**
 * Parseo de lista de modelos del gateway (/v1/models) - OpenAI estándar
 * Formato: { object: 'list', data: [{ id, name, ... }] }
 * APLAZADO a FREELLM-002 - sin filtro específico aún
 */
export function gatewayModelsToList(gw) {
  if (!isRecord(gw)) return [];
  const data = gw.data;
  if (!Array.isArray(data)) return [];
  const result = [];
  for (let i = 0; i < data.length; i += 1) {
    const item = data[i];
    if (isRecord(item) && isString(item.id)) {
      result.push(item.id);
    }
  }
  return result;
}
