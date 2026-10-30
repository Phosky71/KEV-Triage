import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import { buildSystemOnePayload, resolveSystemOneEndpoint, isServiceUrlConfigured, analyzeIncidentWithKev, KevClientException } from '../lib/kev-client';
import { createProxyServer } from '../../server/proxy.mjs';

describe('Cliente Kev (KT-008 / KT-009)', () => {
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
    const upstream = http.createServer((req: any, res: any) => {
      let body = '';
      req.on('data', (c: any) => (body += c));
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

  it('KT-009: timeout -> TIMEOUT_ERROR', async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockImplementation((_input: any, init: any = {}) => {
      const signal = init?.signal;
      return new Promise((_, reject) => {
        if (signal) {
          const onAbort = () => { reject(new DOMException('Aborted', 'AbortError')); };
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }) as any;
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api', timeoutMs: 100 });
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(150);
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevClientException);
      expect(e.triageError.code).toBe('TIMEOUT_ERROR');
    }
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: abort manual -> AbortError sin envolver (no TIMEOUT_ERROR)', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockImplementation(() => new Promise((_, rej) => {
      controller.signal.addEventListener('abort', () => rej(new DOMException('Petición cancelada', 'AbortError')), { once: true });
    }) as any);
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api', signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DOMException);
      expect(e.name).toBe('AbortError');
    }
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: signal ya abortada al empezar -> AbortError y sin fetch', async () => {
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch');
    const controller = new AbortController();
    controller.abort();
    try {
      await analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api', signal: controller.signal });
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DOMException);
      expect(e.name).toBe('AbortError');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('KT-009: éxito sin timers pendientes y listeners eliminados', async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      answers: { department: { choice: 'backend', confidence: 0.9 }, severity: { level: 'high' }, is_security_leak: { affirmative_probability: 0.1 } }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }) as any);
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api' });
    const res = await p;
    expect(res.department.selected).toBe('backend');
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: HTTP 500 → HTTP_ERROR sin timers pendientes', async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockResolvedValue(new Response('err', { status: 500 }) as any);
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api' });
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevClientException);
      expect(e.triageError.code).toBe('HTTP_ERROR');
    }
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: HTTP 504 → HTTP_ERROR sin timers pendientes', async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockResolvedValue(new Response('err', { status: 504 }) as any);
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api' });
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevClientException);
      expect(e.triageError.code).toBe('HTTP_ERROR');
    }
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: JSON inválido → INVALID_JSON sin timers pendientes', async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockResolvedValue(new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }) as any);
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api' });
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevClientException);
      expect(e.triageError.code).toBe('INVALID_JSON');
    }
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: red caída → NETWORK_ERROR sin timers pendientes', async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockRejectedValue(new Error('network down'));
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api' });
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e).toBeInstanceOf(KevClientException);
      expect(e.triageError.code).toBe('NETWORK_ERROR');
    }
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('KT-009: camino fallback sin AbortSignal.any', async () => {
    vi.useFakeTimers();
    const hadAny = typeof (AbortSignal as any).any;
    // @ts-ignore
    (AbortSignal as any).any = undefined;
    const controller = new AbortController();
    const g = globalThis as any;
    const fetchSpy = vi.spyOn(g, 'fetch').mockImplementation(() => new Promise((_, rej) => {
      controller.signal.addEventListener('abort', () => rej(new DOMException('Petición cancelada', 'AbortError')), { once: true });
    }) as any);
    const p = analyzeIncidentWithKev({ incidentText: 'x', baseUrl: 'http://example.com/api', signal: controller.signal });
    await vi.advanceTimersByTimeAsync(5);
    controller.abort();
    try {
      await p;
      throw new Error('should fail');
    } catch (e: any) {
      expect(e.name).toBe('AbortError');
    }
    expect(vi.getTimerCount()).toBe(0);
    fetchSpy.mockRestore();
    // @ts-ignore
    (AbortSignal as any).any = hadAny;
    vi.useRealTimers();
  });
});
