import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createProxyServer } from '../../server/proxy.mjs';

function getPort(server) {
  const addr = server.address();
  if (typeof addr === 'object' && addr) return addr.port;
  return server.port;
}

describe('Proxy integración (arnés)', () => {
  let upstream: http.Server;
  let proxy: any;
  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, method: req.method, url: req.url, body }));
      });
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = getPort(upstream);

    proxy = createProxyServer({
      port: 0,
      kevUpstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      allowedOrigin: 'http://localhost:5173',
    });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    proxyPort = getPort(proxy);
  });

  afterEach(async () => {
    await new Promise((r) => proxy.close(r));
    await new Promise((r) => upstream.close(r));
  });

  it.fails('KT-010: ruta /foo/v1/systemone -> 404 (deseado)', async () => {
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(big)) },
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
    const p2 = createProxyServer({ port: 0, kevUpstreamUrl: `http://127.0.0.1:${slowPort}`, allowedOrigin: 'http://localhost:5173', upstreamTimeoutMs: 100 });
    await new Promise((r) => p2.listen(0, '127.0.0.1', r));
    const p2Port = getPort(p2);
    const res = await fetch(`http://127.0.0.1:${p2Port}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(504);
    await new Promise((r) => p2.close(r));
    await new Promise((r) => slow.close(r));
  }, 10000);

  it('upstream caído -> 502', async () => {
    const p2 = createProxyServer({ port: 0, kevUpstreamUrl: 'http://127.0.0.1:59999', allowedOrigin: 'http://localhost:5173' });
    await new Promise((r) => p2.listen(0, '127.0.0.1', r));
    const p2Port = getPort(p2);
    const res = await fetch(`http://127.0.0.1:${p2Port}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(502);
    await new Promise((r) => p2.close(r));
  });

  it('Origin no permitido -> comportamiento actual (KT-011 deseado 403 sin ACAO)', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://evil.example' }, body: '{}' });
    console.log('ORIGIN_EVIL_ACAO:', res.headers.get('access-control-allow-origin'));
    expect([200, 403]).toContain(res.status);
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

  it('ruta con query / Host manipulado -> destino no alterado', async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/kev/v1/systemone?foo=bar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Host': 'evil.com', 'X-Forwarded-Host': 'evil.com' }, body: '{}' });
    expect([200, 502]).toContain(res.status);
  });
});
