import http from 'node:http';

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 32 * 1024; // 32 KB máximo para evitar abuso
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10000; // menor que DEFAULT_TIMEOUT_MS del cliente (15000)

function normalizeAllowedOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true; // petición sin Origin permitida
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

export function createProxyServer(config = {}) {
  const PORT = Number(config.port ?? process.env.PORT ?? DEFAULT_PORT);
  const KEV_UPSTREAM_URL = (config.kevUpstreamUrl ?? process.env.KEV_UPSTREAM_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const KEV_API_KEY = (config.kevApiKey ?? process.env.KEV_API_KEY ?? '').trim();
  const ALLOWED_ORIGIN = config.allowedOrigin ?? process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';
  const allowedOrigins = normalizeAllowedOrigins(ALLOWED_ORIGIN);
  const MAX_BODY_BYTES = Number(config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  const UPSTREAM_TIMEOUT_MS = Number(config.upstreamTimeoutMs ?? process.env.UPSTREAM_TIMEOUT_MS ?? DEFAULT_UPSTREAM_TIMEOUT_MS);

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      if (origin && allowedOrigins.length > 0 && !isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader('Vary', 'Origin');
        res.writeHead(403);
        res.end();
        return;
      }
      if (origin && allowedOrigins.length > 0 && isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      } else if (origin && allowedOrigins.length === 0 && origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else if (origin && allowedOrigins.length === 0) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      if (origin) {
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.writeHead(204);
      res.end();
      return;
    }

    // CORS para peticiones normales
    if (origin && allowedOrigins.length > 0 && !isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader('Vary', 'Origin');
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origen no permitido.' }));
      return;
    }
    if (origin && allowedOrigins.length > 0 && isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (origin && allowedOrigins.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    if (origin && allowedOrigins.length > 0) {
      res.setHeader('Vary', 'Origin');
    } else if (origin) {
      res.setHeader('Vary', 'Origin');
    }

    const url = req.url || '';
    const pathname = url.split('?')[0];
    if (pathname !== '/api/kev/v1/systemone') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ruta no encontrada. Use POST /api/kev/v1/systemone' }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ruta no encontrada. Use POST /api/kev/v1/systemone' }));
      return;
    }

    if (!KEV_UPSTREAM_URL) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'KEV_UPSTREAM_URL no está configurada en el entorno del servidor proxy.',
        })
      );
      return;
    }

    let body = '';
    let receivedBytes = 0;

    try {
      for await (const chunk of req) {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_BODY_BYTES) {
          if (!res.headersSent) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: 'Payload demasiado grande.' }));
          return;
        }
        body += chunk.toString('utf8');
      }
    } catch {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Solicitud inválida.' }));
      return;
    }

    const upstreamEndpoint = KEV_UPSTREAM_URL.endsWith('/v1/systemone')
      ? KEV_UPSTREAM_URL
      : `${KEV_UPSTREAM_URL}/v1/systemone`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (KEV_API_KEY) {
      headers.Authorization = `Bearer ${KEV_API_KEY}`;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort(new Error('UPSTREAM_TIMEOUT'));
      } catch {}
    }, UPSTREAM_TIMEOUT_MS);
    const onClose = () => {
      if (!res.writableEnded) {
        try {
          controller.abort(new Error('CLIENT_ABORT'));
        } catch {}
      }
    };
    req.on('close', onClose);

    try {
      const upstreamResponse = await fetch(upstreamEndpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      req.off('close', onClose);
      const responseText = await upstreamResponse.text();
      if (origin && allowedOrigins.length > 0 && isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      } else if (origin && allowedOrigins.length === 0) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      if (origin) {
        res.setHeader('Vary', 'Origin');
      }
      if (res.writableEnded) return;
      res.writeHead(upstreamResponse.status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(responseText);
    } catch (err) {
      clearTimeout(timeout);
      req.off('close', onClose);
      if (res.writableEnded) return;
      // Nunca registramos ni devolvemos KEV_API_KEY ni el contenido sensible de la incidencia
      if (origin && allowedOrigins.length > 0 && isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      } else if (origin && allowedOrigins.length === 0) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      if (origin) {
        res.setHeader('Vary', 'Origin');
      }
      if (err && err.name === 'AbortError') {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tiempo de espera agotado con el servicio upstream.' }));
        return;
      }
      if (timedOut) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tiempo de espera agotado con el servicio upstream.' }));
        return;
      }
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'No fue posible conectar con el servicio upstream de Kev.',
        })
      );
    }
  });

  server.port = PORT;
  return server;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('proxy.mjs')) {
  const server = createProxyServer();
  server.listen(server.port || DEFAULT_PORT, () => {
    console.log(`Proxy seguro Kev Triage escuchando en http://localhost:${server.port || DEFAULT_PORT}/api/kev/v1/systemone`);
  });
}