import { describe, it, expect } from 'vitest';
import { adaptKevResponse, adaptKevResponsePartial, KevValidationError } from '../lib/kev-adapter';

const INVALID_SCHEMA_MSG = 'Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga.';

describe('KT-025 partials', () => {
  it('adaptKevResponsePartial: todo valido 3 ok', () => {
    const payload = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' }, is_security_leak: { affirmative_probability: 0.95 } } };
    const full = adaptKevResponse(payload, { clientRoundTripMs: 10 });
    const partial = adaptKevResponsePartial(payload, { clientRoundTripMs: 10 });
    expect(partial.department.ok).toBe(true);
    expect(partial.severity.ok).toBe(true);
    expect(partial.securityLeak.ok).toBe(true);
    if (partial.department.ok && partial.severity.ok && partial.securityLeak.ok) {
      expect(partial.department.value).toEqual(full.department);
      expect(partial.severity.value).toEqual(full.severity);
      expect(partial.securityLeak.value).toEqual(full.securityLeak);
    }
  });

  it('securityLeak valido + department invalido', () => {
    const payload = { answers: { department: { choice: 'marketing', confidence: 0.9 }, severity: { level: 'high' }, is_security_leak: { affirmative_probability: 0.95 } } };
    const partial = adaptKevResponsePartial(payload, { clientRoundTripMs: 10 });
    expect(partial.securityLeak.ok).toBe(true);
    expect(partial.department.ok).toBe(false);
    expect(() => adaptKevResponse(payload, { clientRoundTripMs: 10 })).toThrow(KevValidationError);
  });

  it('severity invalido + resto valido', () => {
    const payload = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'mega' }, is_security_leak: { affirmative_probability: 0.1 } } };
    const partial = adaptKevResponsePartial(payload, { clientRoundTripMs: 10 });
    expect(partial.severity.ok).toBe(false);
    expect(partial.securityLeak.ok).toBe(true);
    expect(() => adaptKevResponse(payload, { clientRoundTripMs: 10 })).toThrow(KevValidationError);
  });

  it('securityLeak invalido + resto valido mensaje KT-007', () => {
    const payload = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' }, is_security_leak: { affirmative_probability: 1.5 } } };
    const partial = adaptKevResponsePartial(payload, { clientRoundTripMs: 10 });
    expect(partial.securityLeak.ok).toBe(false);
    if (partial.securityLeak.ok === false) {
      expect(partial.securityLeak.error.message).toBe(INVALID_SCHEMA_MSG);
    }
    expect(() => adaptKevResponse(payload, { clientRoundTripMs: 10 })).toThrow(KevValidationError);
  });

  it('adaptKevResponse lanza en fallo individual', () => {
    expect(() => adaptKevResponse({ answers: { department: { choice: 'x' }, severity: { level: 'high' }, is_security_leak: { affirmative_probability: 0.1 } } }, { clientRoundTripMs: 1 })).toThrow(KevValidationError);
    expect(() => adaptKevResponse({ answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'bad' }, is_security_leak: { affirmative_probability: 0.1 } } }, { clientRoundTripMs: 1 })).toThrow(KevValidationError);
    expect(() => adaptKevResponse({ answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' }, is_security_leak: {} } }, { clientRoundTripMs: 1 })).toThrow(KevValidationError);
  });

  it('las tres invalidas', () => {
    const payload = { answers: { department: { choice: 'bad' }, severity: { level: 'bad' }, is_security_leak: { affirmative_probability: 2 } } };
    const p = adaptKevResponsePartial(payload, { clientRoundTripMs: 10 });
    expect(p.department.ok && p.severity.ok && p.securityLeak.ok).toBe(false);
    expect(() => adaptKevResponse(payload, { clientRoundTripMs: 10 })).toThrow(KevValidationError);
  });

  it('rawPayload no objeto', () => {
    expect(() => adaptKevResponsePartial(null, { clientRoundTripMs: 1 })).toThrow(KevValidationError);
    expect(() => adaptKevResponsePartial('bad', { clientRoundTripMs: 1 })).toThrow(KevValidationError);
  });
});
