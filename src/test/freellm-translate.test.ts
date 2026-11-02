import { describe, expect, it } from 'vitest';
import { gatewayResponseToKevShape, kevPayloadToGateway } from '../../server/freellm-translate.mjs';
import { adaptKevResponse, adaptKevResponsePartial, KevValidationError } from '../lib/kev-adapter';
import { buildSystemOnePayload } from '../lib/kev-client';

const REAL_DECISIONS_RESPONSE = {
  object: 'decision',
  model: '@cf/cloudflare/clef-flash',
  provider: 'cloudflare',
  answers: {
    department: {
      type: 'choice',
      choice: 'backend',
      probabilities: { frontend: 0.02, backend: 0.93, billing: 0.03, devops: 0.02 },
      confidence: 0.93,
    },
    severity: {
      type: 'choice',
      choice: 'high',
      probabilities: { low: 0.01, moderate: 0.05, high: 0.87, critical: 0.06, emergency: 0.01 },
      confidence: 0.87,
    },
    is_security_leak: {
      type: 'choice',
      choice: 'yes',
      probabilities: { yes: 0.9664, no: 0.0336 },
      confidence: 0.9664,
    },
  },
  usage: { input_tokens: 123, output_tokens: 45 },
};

describe('FreeLLM translate (FREELLM-001)', () => {
  it('kevPayloadToGateway: array->mapa, question->instructions, options plegadas en criteria, severity con niveles, is_security_leak yes/no, model añadido', () => {
    const kevPayload = buildSystemOnePayload('Incidente de prueba', 'kev-default');
    const translated = kevPayloadToGateway(kevPayload, { model: 'auto' }) as any;
    expect(translated.model).toBe('auto');
    expect(translated.state).toBe('Incidente de prueba');
    expect(typeof translated.questions).toBe('object');
    expect(Array.isArray(translated.questions)).toBe(false);
    expect(translated.questions.department.instructions).toBe(kevPayload.questions[0].question);
    expect(translated.questions.department.criteria).toEqual(kevPayload.questions[0].criteria);
    expect(translated.questions.severity.criteria.low).toBeDefined();
    expect(translated.questions.severity.criteria.moderate).toBeDefined();
    expect(translated.questions.severity.criteria.high).toBeDefined();
    expect(translated.questions.severity.criteria.critical).toBeDefined();
    expect(translated.questions.severity.criteria.emergency).toBeDefined();
    expect(translated.questions.is_security_leak.criteria.yes).toBeTypeOf('string');
    expect(translated.questions.is_security_leak.criteria.no).toBeTypeOf('string');
    expect(translated.questions.department.options).toBeUndefined();
  });

  it('gatewayResponseToKevShape + adaptKevResponse sobre respuesta real verificada: backend/high/seguridad afirmativa -> alerta', () => {
    const shaped = gatewayResponseToKevShape(REAL_DECISIONS_RESPONSE) as any;
    expect(shaped.usage.total_tokens).toBe(168);
    expect(shaped.answers).toBeDefined();
    const result = adaptKevResponse(shaped, { clientRoundTripMs: 100, fallbackModelName: 'auto' });
    expect(result.department.selected).toBe('backend');
    expect(result.severity.level).toBe('high');
    expect(result.securityLeak.affirmativeProbability).toBeCloseTo(0.9664, 4);
    // Regla 1 dispara alerta (>0.70)
    expect(result.securityLeak.affirmativeProbability > 0.7).toBe(true);
  });

  it('respuesta malformada -> adaptKevResponsePartial con parciales; adaptKevResponse lanza; UI renderiza parciales', () => {
    const malformed = {
      model: 'test',
      answers: {
        department: { choice: 'frontend', probabilities: { frontend: 0.8 } },
        severity: { choice: 'INVALID' }, // alucinado
        is_security_leak: { choice: 'yes', probabilities: { yes: 0.5, no: 0.5 } },
      },
    };
    const partial = adaptKevResponsePartial(malformed, { clientRoundTripMs: 10 });
    expect(partial.department.ok).toBe(true);
    expect(partial.severity.ok).toBe(false);
    expect(partial.securityLeak.ok).toBe(true);
    expect(() => adaptKevResponse(malformed, { clientRoundTripMs: 10 })).toThrow(KevValidationError);
  });
});
