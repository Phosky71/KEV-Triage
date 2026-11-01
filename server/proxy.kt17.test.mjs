import { describe, it, expect } from 'vitest';
import { createProxyServer } from './proxy.mjs';
import http from 'node:http';

describe('KT-017: cuerpo > límite y streaming', () => {
  it('KT-017: envío de >32KB causa 413 y no cuelga (cliente no lee respuesta)', async () => {
    const server = createProxyServer({ port: 0, kevUpstreamUrl: 'http://127.0.0.1:1' });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const big = Buffer.alloc(33 * 1024, 'a').toString();
    const body = JSON.stringify({ data: big });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/kev/v1/systemone',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      },
      (res) => {
        expect(res.statusCode).toBe(413);
      }
    );

    req.write(body);
    req.end();

    await new Promise((resolve) => setTimeout(resolve, 500));
    server.close();
  });
});
