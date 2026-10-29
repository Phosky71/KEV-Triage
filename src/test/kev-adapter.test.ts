import { describe, it, expect } from 'vitest';
import { adaptKevResponse, KevValidationError } from '../lib/kev-adapter';
import { buildSystemOnePayload, resolveSystemOneEndpoint } from '../lib/kev-client';

describe('Cliente y Adaptador del protocolo Kev (/v1/systemone)', () => {
  it('construye la petición POST /v1/systemone con tipos choice, score y noul (sin boolean)', () => {
    const payload = buildSystemOnePayload('Incidencia de prueba en pasarela de pagos', 'kev-v1');
    expect(payload.state).toBe('Incidencia de prueba en pasarela de pagos');
    expect(payload.model).toBe('kev-v1');
    expect(payload.questions).toHaveLength(3);

    const [deptQ, sevQ, secQ] = payload.questions;
    expect(deptQ?.id).toBe('department');
    expect(deptQ?.type).toBe('choice');
    expect(sevQ?.id).toBe('severity');
    expect(sevQ?.type).toBe('score');
    expect(secQ?.id).toBe('is_security_leak');
    expect(secQ?.type).toBe('noul');
  });

  it('normaliza correctamente la URL del endpoint sin duplicar segmentos', () => {
    expect(resolveSystemOneEndpoint('https://user--kev-api.modal.run')).toBe(
      'https://user--kev-api.modal.run/v1/systemone'
    );
    expect(resolveSystemOneEndpoint('https://user--kev-api.modal.run/v1/')).toBe(
      'https://user--kev-api.modal.run/v1/systemone'
    );
    expect(resolveSystemOneEndpoint('https://user--kev-api.modal.run/v1/systemone')).toBe(
      'https://user--kev-api.modal.run/v1/systemone'
    );
  });

  it('interpreta una respuesta válida de Kev y separa latencia del modelo y del cliente', () => {
    const rawResponse = {
      model: 'kev-systemone-small',
      latency_ms: 38.4,
      answers: {
        department: {
          choice: 'devops',
          confidence: 0.89,
          probabilities: { devops: 0.89, backend: 0.08, frontend: 0.02, billing: 0.01 },
        },
        severity: {
          level: 'emergency',
          score: 5,
        },
        is_security_leak: {
          affirmative_probability: 0.74,
        },
      },
    };

    const result = adaptKevResponse(rawResponse, { clientRoundTripMs: 145 });
    expect(result.model).toBe('kev-systemone-small');
    expect(result.department.selected).toBe('devops');
    expect(result.department.confidence).toBe(0.89);
    expect(result.severity.level).toBe('emergency');
    expect(result.severity.ordinal).toBe(5);
    expect(result.securityLeak.affirmativeProbability).toBe(0.74);
    expect(result.latency.modelDeclaredMs).toBe(38);
    expect(result.latency.clientRoundTripMs).toBe(145);
  });

  it('interpreta niveles de score cuando se devuelven por índice base 0', () => {
    const rawResponse = {
      answers: {
        department: { choice: 'frontend', confidence: 0.92 },
        severity: { index: 1 }, // índice 1 -> 'moderate' (ordinal 2)
        is_security_leak: { affirmative_probability: 0.05 },
      },
    };

    const result = adaptKevResponse(rawResponse, { clientRoundTripMs: 80 });
    expect(result.severity.level).toBe('moderate');
    expect(result.severity.ordinal).toBe(2);
  });

  it('lanza KevValidationError controlado si falta un campo obligatorio o la probabilidad es inválida', () => {
    const missingSecurity = {
      answers: {
        department: { choice: 'backend', confidence: 0.9 },
        severity: { level: 'high' },
      },
    };

    expect(() => adaptKevResponse(missingSecurity, { clientRoundTripMs: 50 })).toThrowError(
      KevValidationError
    );

    const invalidProb = {
      answers: {
        department: { choice: 'backend', confidence: 1.45 }, // > 1
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.2 },
      },
    };

    expect(() => adaptKevResponse(invalidProb, { clientRoundTripMs: 50 })).toThrowError(
      KevValidationError
    );
  });
});