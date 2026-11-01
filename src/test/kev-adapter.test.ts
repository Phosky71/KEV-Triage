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

  describe('KT-014: contenedores y prioridad', () => {
    it('KT-014: pregunta solo en un contenedor es válida por prioridad', () => {
      const payload = {
        questions: {
          department: { choice: 'backend', confidence: 0.8 },
        },
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.1 },
      };
      const res = adaptKevResponse(payload, { clientRoundTripMs: null });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-014: misma pregunta en dos contenedores con el mismo valor es válida', () => {
      const node = { choice: 'backend', confidence: 0.8 };
      const payload = {
        answers: { department: node },
        questions: { department: JSON.parse(JSON.stringify(node)) },
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.1 },
      };
      const res = adaptKevResponse(payload, { clientRoundTripMs: null });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-014: misma pregunta en dos contenedores con valores distintos → prioridad answers gana', () => {
      const payload = {
        answers: { department: { choice: 'backend', confidence: 0.8 } },
        questions: { department: { choice: 'frontend', confidence: 0.8 } },
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.1 },
      };
      const res = adaptKevResponse(payload, { clientRoundTripMs: null });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-014: pregunta en answers y questions con valores distintos → gana answers', () => {
      const payload = {
        answers: { department: { choice: 'backend', confidence: 0.9 } },
        questions: { department: { choice: 'frontend', confidence: 0.9 } },
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.1 },
      };
      const res = adaptKevResponse(payload, { clientRoundTripMs: null });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-014: pregunta en results y outputs → gana results', () => {
      const payload = {
        results: { department: { choice: 'devops', confidence: 0.8 } },
        outputs: { department: { choice: 'frontend', confidence: 0.8 } },
        severity: { level: 'high' },
        is_security_leak: { affirmative_probability: 0.1 },
      };
      const res = adaptKevResponse(payload, { clientRoundTripMs: null });
      expect(res.department.selected).toBe('devops');
    });
  });

  describe('KT-015: latencia unidad explícita', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' }, is_security_leak: { affirmative_probability: 0.1 } } };

    it('KT-015: latency_ms explícito (válido)', () => {
      const res = adaptKevResponse({ ...base, latency_ms: 150 }, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBe(150);
    });

    it('KT-015: latency_seconds explícito (convierte)', () => {
      const res = adaptKevResponse({ ...base, latency_seconds: 0.5 }, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBe(500);
    });

    it('KT-015: latency sin sufijo ambiguo → null', () => {
      const res = adaptKevResponse({ ...base, latency: 0.5 }, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBeNull();
    });

    it('KT-015: ausente → null', () => {
      const res = adaptKevResponse(base, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBeNull();
    });

    it('KT-015: latency_ms con valor no numérico → null', () => {
      const res = adaptKevResponse({ ...base, latency_ms: '150' as any }, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBeNull();
    });

    it('KT-015: latency_ms en metadata → válido', () => {
      const res = adaptKevResponse({ ...base, metadata: { latency_ms: 200 } }, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBe(200);
    });

    it('KT-015: latency_ms en timing → válido', () => {
      const res = adaptKevResponse({ ...base, timing: { latency_ms: 250 } }, { clientRoundTripMs: 10 });
      expect(res.latency.modelDeclaredMs).toBe(250);
    });
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

    it("KT-006: index '2.0' como cadena -> INVALID_SCHEMA", () => {
      try {
        adaptKevResponse({ answers: { ...baseDept, severity: { index: '2.0' as any }, ...baseSec } }, { clientRoundTripMs: 10 });
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

    it('KT-006: alias label -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { label: 'high' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('high');
    });

    it('KT-006: alias choice -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { choice: 'critical' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('critical');
    });

    it('KT-006: alias answer -> válido', () => {
      const res = adaptKevResponse({ answers: { ...baseDept, severity: { answer: 'emergency' }, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.severity.level).toBe('emergency');
    });
  });

  describe('KT-005: empate y suma', () => {
    const baseSec = { is_security_leak: { affirmative_probability: 0.1 } };
    const baseSev = { severity: { level: 'high' } };

    it('KT-005: empate exacto 0.5/0.5 -> ambiguo, human_review', () => {
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.5, frontend: 0.5 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBeNull();
      expect(res.department.confidence).toBe(0.5);
      expect(res.department.confidenceSource).toBe('ambiguous');
    });

    it('KT-005: empate 0.5 y 0.5+5e-10 -> ambiguo, human_review', () => {
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.5, frontend: 0.5 + 5e-10 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBeNull();
      expect(res.department.confidenceSource).toBe('ambiguous');
    });

    it('KT-005: no empate 0.5 y 0.5+2e-9 -> ganador', () => {
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.5, frontend: 0.5 + 2e-9 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('frontend');
      expect(res.department.confidence).toBeCloseTo(0.5 + 2e-9);
    });

    it('KT-005: diferencia > ε 0.5001/0.4999 -> selected "backend", confidence 0.5001', () => {
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.5001, frontend: 0.4999 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
      expect(res.department.confidence).toBeCloseTo(0.5001);
    });

    it('KT-005: 0.90/0.10 -> auto_assign', async () => {
      const { evaluateTriageRules } = await import('../lib/triage-rules');
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.90, frontend: 0.10 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
      expect(res.department.confidence).toBeCloseTo(0.90);
      const evalRes = evaluateTriageRules(res);
      expect(evalRes.routing.mode).toBe('auto_assign');
    });

    it('KT-005: suma 0.98 -> válido (<= 0.02 + 1e-9)', () => {
      const res = adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.38 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-005: suma 1.02 -> válido', () => {
      const res = adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.42 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-005: suma 0.9801 -> válido', () => {
      const res = adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.3801 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-005: suma 1.0199 -> válido', () => {
      const res = adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.4199 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-005: suma 0.97 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.37 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
      }
    });

    it('KT-005: suma 0.9699 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.3699 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
      }
    });

    it('KT-005: suma 1.03 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.43 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
      }
    });

    it('KT-005: suma 1.0301 -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.6, frontend: 0.4301 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
      }
    });

    it('KT-005: distribución solo con la ganadora -> sin validar suma', () => {
      const res = adaptKevResponse({ answers: { department: { choice: 'backend', probabilities: { backend: 0.9 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBe('backend');
    });

    it('KT-005: empate con confidence explícita 0.95 -> comportamiento propuesto', () => {
      try {
        adaptKevResponse({ answers: { department: { choice: 'backend', confidence: 0.95, probabilities: { backend: 0.5, frontend: 0.5 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
      }
    });

    it('KT-005: choice "frontend" con backend:0.9 en probs -> INVALID_SCHEMA', () => {
      try {
        adaptKevResponse({ answers: { department: { choice: 'frontend', probabilities: { backend: 0.9, frontend: 0.1 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
        throw new Error('should fail');
      } catch (e: any) {
        expect(e).toBeInstanceOf(KevValidationError);
      }
    });

    it('KT-005: empate sin choice, solo distribución -> ambiguo', () => {
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.5, frontend: 0.5 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      expect(res.department.selected).toBeNull();
    });

    it('KT-005: diferencia > ε 0.5001/0.4999 -> modo human_review', async () => {
      const { evaluateTriageRules } = await import('../lib/triage-rules');
      const res = adaptKevResponse({ answers: { department: { probabilities: { backend: 0.5001, frontend: 0.4999 } }, ...baseSev, ...baseSec } }, { clientRoundTripMs: 10 });
      const evalRes = evaluateTriageRules(res);
      expect(evalRes.routing.mode).toBe('human_review');
    });
  });
});
