import { describe, it, expect } from 'vitest';
import { adaptKevResponse, KevValidationError } from '../lib/kev-adapter';

const INVALID_SCHEMA_MSG = 'Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga.';
const INVALID_SCHEMA_MSG_SEVERITY =
  'Esquema de respuesta de Kev inválido para el campo "severity". Revise el formato o consistencia de los valores.';

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

  describe('KT-006: severidad', () => {
    const baseDept = { department: { choice: 'backend', confidence: 0.9 } };
    const baseSec = { is_security_leak: { affirmative_probability: 0.1 } };

    it('KT-006: solo level "high" -> high/ordinal 3', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { level: 'high' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('high');
      expect(res.severity.ordinal).toBe(3);
    });

    it('KT-006: solo index 0 -> low/ordinal 1', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { index: 0 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('low');
      expect(res.severity.ordinal).toBe(1);
    });

    it('KT-006: solo index 4 -> emergency/ordinal 5', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { index: 4 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('emergency');
      expect(res.severity.ordinal).toBe(5);
    });

    it('KT-006: solo score 1 -> low/ordinal 1', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { score: 1 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('low');
      expect(res.severity.ordinal).toBe(1);
    });

    it('KT-006: solo score 0 -> low/ordinal 1', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { score: 0 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('low');
      expect(res.severity.ordinal).toBe(1);
    });

    it('KT-006: solo score 5 -> emergency/ordinal 5', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { score: 5 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('emergency');
      expect(res.severity.ordinal).toBe(5);
    });

    it('KT-006: index 0 + score 1 consistentes -> low', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { index: 0, score: 1 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('low');
      expect(res.severity.ordinal).toBe(1);
    });

    it('KT-006: level "high" + index 2 + score 3 consistentes -> high', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { level: 'high', index: 2, score: 3 }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('high');
      expect(res.severity.ordinal).toBe(3);
    });

    it('KT-006: index 0 + score 3 contradictorios -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { index: 0, score: 3 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
        expect(e.diagnostics).toBeTruthy();
      }
    });

    it('KT-006: level "high" + index 0 contradictorios -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { level: 'high', index: 0 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: level "high" + label "low" contradictorios -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { level: 'high', label: 'low' }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: score 0 + index 1 contradictorios -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { score: 0, index: 1 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: varios campos contradictorios -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { level: 'critical', score: 1 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: score fuera de rango 6 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { score: 6 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: score fuera de rango -1 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { score: -1 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: index fuera de rango 5 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { index: 5 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: index fuera de rango -1 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { index: -1 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: score 2.5 no entero -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { score: 2.5 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: index 1.5 no entero -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { index: 1.5 }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: score "2" como cadena -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { score: '2' }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: level "severe" inválido -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { level: 'severe' }, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
        expect(e.message).toBe(INVALID_SCHEMA_MSG_SEVERITY);
      }
    });

    it('KT-006: alias label -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { label: 'moderate' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('moderate');
      expect(res.severity.ordinal).toBe(2);
    });

    it('KT-006: alias choice -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { choice: 'critical' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('critical');
      expect(res.severity.ordinal).toBe(4);
    });

    it('KT-006: alias answer -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { answer: 'emergency' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('emergency');
      expect(res.severity.ordinal).toBe(5);
    });

    it('KT-006: alias value -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { value: 'low' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('low');
      expect(res.severity.ordinal).toBe(1);
    });
  });
});
