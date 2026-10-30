import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import { adaptKevResponse, KevValidationError } from '../lib/kev-adapter';
import { buildSystemOnePayload, resolveSystemOneEndpoint, isServiceUrlConfigured, analyzeIncidentWithKev, KevClientException } from '../lib/kev-client';
import { createProxyServer } from '../../server/proxy.mjs';

const INVALID_SCHEMA_MSG = 'Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga.';

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

  it('KT-008: credenciales, fragmento, query -> UNCONFIGURED_SERVICE', () => {
    expect(isServiceUrlConfigured('http://user:pass@host.com/api')).toBe(false);
    expect(isServiceUrlConfigured('http://localhost:8787/api#frag')).toBe(false);
    expect(isServiceUrlConfigured('http://localhost:8787/api?x=1')).toBe(false);
  });

  it('KT-008: esquemas no http/https rechazados', () => {
    expect(isServiceUrlConfigured('ftp://example.com/api')).toBe(false);
    expect(isServiceUrlConfigured('javascript:alert(1)')).toBe(false);
  });

  it('KT-008: ruta relativa /api/kev válida', () => {
    expect(isServiceUrlConfigured('/api/kev')).toBe(true);
  });

  it('KT-008: barras duplicadas y finales; sufijo ya presente sin duplicar', () => {
    expect(resolveSystemOneEndpoint('http://localhost:8787/api/kev//')).toBe('http://localhost:8787/api/kev/v1/systemone');
    expect(resolveSystemOneEndpoint('http://localhost:8787/api/kev/')).toBe('http://localhost:8787/api/kev/v1/systemone');
    expect(resolveSystemOneEndpoint('http://localhost:8787/api/kev/v1/systemone')).toBe('http://localhost:8787/api/kev/v1/systemone');
  });

  it('KT-008: http://127.0.0.1:31415/v1 NO produce /v1/v1/...', () => {
    const res = resolveSystemOneEndpoint('http://127.0.0.1:31415/v1');
    expect(res).toBe('http://127.0.0.1:31415/v1/systemone');
    expect(res.includes('/v1/v1/')).toBe(false);
  });

  it('KT-008: placeholder no configurado', () => {
    expect(isServiceUrlConfigured('https://TU_USUARIO--kev-api.modal.run')).toBe(false);
  });

  it('KT-008: contrato cliente real contra createProxyServer con base http://localhost:<puerto>/api/kev', async () => {
    const upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          expect(parsed.questions).toBeDefined();
          expect(Array.isArray(parsed.questions)).toBe(true);
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          model: 'kev-test',
          answers: {
            department: { choice: 'backend', confidence: 0.9 },
            severity: { level: 'high' },
            is_security_leak: { affirmative_probability: 0.1 },
          },
        }));
      });
    });
    await new Promise((r: any) => (upstream as any).listen(0, '127.0.0.1', r));
    const upPort = (upstream.address() as any).port;
    // @ts-ignore
    const proxy = createProxyServer({ port: 0, kevUpstreamUrl: `http://127.0.0.1:${upPort}`, allowedOrigin: 'http://localhost:5173' });
    await new Promise((r: any) => (proxy as any).listen(0, '127.0.0.1', r));
    const pPort = (proxy.address() as any).port;
    const res = await analyzeIncidentWithKev({ incidentText: 'test', baseUrl: `http://localhost:${pPort}/api/kev`, timeoutMs: 5000 });
    expect(res.department.selected).toBe('backend');
    await new Promise((r: any) => (proxy as any).close(() => r()));
    await new Promise((r: any) => (upstream as any).close(() => r()));
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

  // KT-007: fuentes explícitas y reglas no bloqueadas por decisión pendiente del genérico
  it('KT-007: fuentes explícitas válidas 0, 1, 0.70', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    const r0 = adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 0 } } }, { clientRoundTripMs: 10 });
    expect(r0.securityLeak.affirmativeProbability).toBe(0);
    const r1 = adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 1 } } }, { clientRoundTripMs: 10 });
    expect(r1.securityLeak.affirmativeProbability).toBe(1);
    const r70 = adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: 0.70 } } }, { clientRoundTripMs: 10 });
    expect(r70.securityLeak.affirmativeProbability).toBe(0.70);
  });

  it('KT-007: no numéricos en fuente explícita', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: NaN } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: "0.9" as any } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: null as any } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: mensaje exacto de INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    try {
      adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { affirmative_probability: NaN } } }, { clientRoundTripMs: 10 });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevValidationError);
      expect(e.message).toBe(INVALID_SCHEMA_MSG);
    }
  });

  it('KT-007: fuentes explícitas discrepantes', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { p_yes: 0.9, probabilities: { yes: 0.2 } } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: explícita + genérico discrepantes -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { p_yes: 0.9, probability: 0.1 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: answer:false + p_yes:0.9 -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: false, p_yes: 0.9 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: answer:true + p_yes:0.4 -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: true, p_yes: 0.4 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });

  it('KT-007: answer no reconocido -> INVALID_SCHEMA', () => {
    const base = { answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' } } };
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: 'maybe', p_yes: 0.9 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
    expect(() => adaptKevResponse({ ...base, answers: { ...base.answers, is_security_leak: { answer: '', p_yes: 0.9 } } }, { clientRoundTripMs: 10 })).toThrowError(KevValidationError);
  });
});