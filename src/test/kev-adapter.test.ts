import { describe, it, expect } from 'vitest';
import { adaptKevResponse, KevValidationError } from '../lib/kev-adapter';

const INVALID_SCHEMA_MSG = 'Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga.';

describe('Cliente y Adaptador del protocolo Kev (/v1/systemone)', () => {
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
        department: { choice: 'backend', confidence: 1.45 },
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.2 },
      },
    };

    expect(() => adaptKevResponse(invalidProb, { clientRoundTripMs: 50 })).toThrowError(
      KevValidationError
    );
  });

  it('KT-007: fuentes explícitas válidas 0, 1, 0.70', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    const r0 = adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 0 } } }, { clientRoundTripMs: 10 });
    expect(r0.securityLeak.affirmativeProbability).toBe(0);
    const r1 = adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 1 } } }, { clientRoundTripMs: 10 });
    expect(r1.securityLeak.affirmativeProbability).toBe(1);
    const r07 = adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { p_yes: 0.70 } } }, { clientRoundTripMs: 10 });
    expect(r07.securityLeak.affirmativeProbability).toBe(0.7);
  });

  it('KT-007: discrepancia entre fuentes explícitas -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 0.2, p_yes: 0.8 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: fuente explícita vs genérica discrepante -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 0.2, probability: 0.8 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: answer true con p<0.5 o false con p>0.5 -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: 'true', p_yes: 0.3 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: 'false', p_yes: 0.8 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: answer vs prob no numérico o rangos inválidos -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: 'true', p_yes: 'x' } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: -0.1 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 1.1 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: mensaje exacto INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    try {
      adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 0.2, p_yes: 0.8 } } }, { clientRoundTripMs: 10 });
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevValidationError);
      expect(e.message).toBe(INVALID_SCHEMA_MSG);
    }
  });

  it('KT-007: answer no reconocido -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: 'maybe', p_yes: 0.9 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: '', p_yes: 0.9 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });
});
