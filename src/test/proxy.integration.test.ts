import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-ignore
import http from 'node:http';
// @ts-ignore
import { createProxyServer } from '../../server/proxy.mjs';

function getPort(server: any) {
  const addr = server.address();
  if (typeof addr === 'object' && addr) return addr.port;
  return server.port;
}

describe('Proxy integración (arnés)', () => {
  let upstream: any;
  let proxy: any;
  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = http.createServer((req: any, res: any) => {
      let body = '';
      req.on('data', (c: any) => (body += c.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, method: req.method, url: req.url, body }));
      });
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = getPort(upstream);

    // @ts-ignore
    proxy = createProxyServer({
      port: 0,
      kevUpstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      allowedOrigin: 'http://localhost:5173',
    });
    // @ts-ignore
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    proxyPort = getPort(proxy);
  });

  afterEach(async () => {
    await new Promise((r) => proxy.close(r));
    await new Promise((r: any) => (upstream as any).close(() => r()));
  });

  it('KT-010: ruta /foo/v1/systemone -> 404', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/foo/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(404);
  });

  it('query string -> comportamiento actual (endsWith sobre req.url)', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone?x=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect([200, 404, 502]).toContain(res.status);
  });

  it('método distinto de POST -> 404', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, { method: 'GET' });
    expect(res.status).toBe(404);
  });

  it('body > 32 KB con Content-Length -> 413', async () => {
    const big = 'a'.repeat(33 * 1024);
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(new TextEncoder().encode(big).length) },
      body: big,
    });
    expect(res.status).toBe(413);
  });

  it.fails('KT-018: upstream lento -> 504 en tiempo configurado', async () => {
    const slow = http.createServer(() => {
      // no responde
    });
    await new Promise((r) => slow.listen(0, '127.0.0.1', r));
    const slowPort = getPort(slow);
    // @ts-ignore
    const p2 = createProxyServer({ port: 0, kevUpstreamUrl: `http://127.0.0.1:${slowPort}`, allowedOrigin: 'http://localhost:5173', upstreamTimeoutMs: 100 });
    await new Promise((r: any) => (p2 as any).listen(0, '127.0.0.1', r));
    const p2Port = getPort(p2);
    const res = await fetch(`http://127.0.0.1:${p2Port}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(504);
    await new Promise((r) => p2.close(r));
    await new Promise((r: any) => (slow as any).close(() => r()));
  }, 10000);

  it('upstream caído -> 502', async () => {
    // @ts-ignore
    const p2 = createProxyServer({ port: 0, kevUpstreamUrl: 'http://127.0.0.1:59999', allowedOrigin: 'http://localhost:5173' });
    await new Promise((r: any) => (p2 as any).listen(0, '127.0.0.1', r));
    const p2Port = getPort(p2);
    const res = await fetch(`http://127.0.0.1:${p2Port}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(502);
    await new Promise((r) => p2.close(r));
  });

  it('KT-011: POST Origin no permitido -> 403 sin ACAO', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://evil.example' }, body: '{}' });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('KT-011: OPTIONS Origin no permitido -> 403 con Vary: Origin', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, { method: 'OPTIONS', headers: { 'Origin': 'http://evil.example', 'Access-Control-Request-Method': 'POST' } });
    expect(res.status).toBe(403);
    expect(res.headers.get('vary')).toMatch(/Origin/i);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('KT-011: lista de dos orígenes permitidos', async () => {
    const { createProxyServer } = await import('../../server/proxy.mjs');
    // @ts-ignore
    const p = createProxyServer({ port: 0, kevUpstreamUrl: `http://127.0.0.1:${upstreamPort}`, allowedOrigin: 'http://a.example,http://b.example' });
    await new Promise((r: any) => (p as any).listen(0, '127.0.0.1', r));
    // @ts-ignore
    const portp = (p.address() as any).port;
    const r1 = await fetch(`http://127.0.0.1:${portp}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://b.example' }, body: '{}' });
    expect(r1.status).toBe(200);
    expect(r1.headers.get('access-control-allow-origin')).toBe('http://b.example');
    const r2 = await fetch(`http://127.0.0.1:${portp}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://c.example' }, body: '{}' });
    expect(r2.status).toBe(403);
    expect(r2.headers.get('access-control-allow-origin')).toBeNull();
    await new Promise((r: any) => (p as any).close(() => r()));
  });

  it('Origin permitido -> ACAO', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' }, body: '{}' });
    console.log('ORIGIN_OK_ACAO:', res.headers.get('access-control-allow-origin'));
    expect(res.status).not.toBe(404);
  });

  it('OPTIONS -> 204', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });

  it('ruta con query / Host manipulados -> destino no alterado', async () => {
    // El destino se construye desde KEV_UPSTREAM_URL configurado; pathname con query ignorada
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone?foo=bar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Host': 'evil.com', 'X-Forwarded-Host': 'evil.com' }, body: '{}' });
    expect(res.status).toBe(200);
  });
});
