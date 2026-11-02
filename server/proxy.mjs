import http from 'node:http';
import { kevPayloadToGateway, gatewayResponseToKevShape } from './freellm-translate.mjs';

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
  const UPSTREAM_TYPE = (config.upstreamType ?? process.env.UPSTREAM_TYPE ?? 'kev')
    .toString()
    .trim()
    .toLowerCase();

  const KEV_UPSTREAM_URL = (config.kevUpstreamUrl ?? process.env.KEV_UPSTREAM_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (KEV_UPSTREAM_URL) {
    try {
      const parsed = new URL(KEV_UPSTREAM_URL);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('KEV_UPSTREAM_URL debe usar esquema http:// o https://');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('http')) {
        throw err;
      }
      throw new Error('KEV_UPSTREAM_URL debe usar esquema http:// o https://');
    }
  }

  const FREELLM_BASE_URL = (config.freellmBaseUrl ?? process.env.FREELLM_BASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (FREELLM_BASE_URL) {
    try {
      const parsed = new URL(FREELLM_BASE_URL);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('FREELLM_BASE_URL debe usar esquema http:// o https://');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('http')) {
        throw err;
      }
      throw new Error('FREELLM_BASE_URL debe usar esquema http:// o https://');
    }
  }

  const FREELLM_API_KEY = (config.freellmApiKey ?? process.env.FREELLM_API_KEY ?? '').trim();
  const FREELLM_MODEL = (config.freellmModel ?? process.env.FREELLM_MODEL ?? 'auto').trim() || 'auto';

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

    let upstreamEndpoint;
    let headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    let requestBody = body;

    if (UPSTREAM_TYPE === 'freellm') {
      if (!FREELLM_BASE_URL) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'FREELLM_BASE_URL no está configurada en el entorno del servidor proxy.' }));
        return;
      }
      if (!FREELLM_API_KEY) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'FREELLM_API_KEY no está configurada en el entorno del servidor proxy.' }));
        return;
      }
      // Config inválida en contexto freellm -> modo demo manejado por cliente, pero aquí validamos
      upstreamEndpoint = FREELLM_BASE_URL.endsWith('/v1/decisions')
        ? FREELLM_BASE_URL
        : FREELLM_BASE_URL.endsWith('/v1')
          ? `${FREELLM_BASE_URL}/decisions`
          : `${FREELLM_BASE_URL}/v1/decisions`;
      headers.Authorization = `Bearer ${FREELLM_API_KEY}`;
      try {
        const parsed = JSON.parse(body);
        const translated = kevPayloadToGateway(parsed, { model: FREELLM_MODEL });
        requestBody = JSON.stringify(translated);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Solicitud inválida.' }));
        return;
      }
    } else {
      if (!KEV_UPSTREAM_URL) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'KEV_UPSTREAM_URL no está configurada en el entorno del servidor proxy.',
          })
        );
        return;
      }
      upstreamEndpoint = KEV_UPSTREAM_URL.endsWith('/v1/systemone')
        ? KEV_UPSTREAM_URL
        : `${KEV_UPSTREAM_URL}/v1/systemone`;
      if (KEV_API_KEY) {
        headers.Authorization = `Bearer ${KEV_API_KEY}`;
      }
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
        body: requestBody,
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

      if (UPSTREAM_TYPE === 'freellm' && upstreamResponse.ok) {
        try {
          const parsedGw = JSON.parse(responseText);
          const translated = gatewayResponseToKevShape(parsedGw);
          res.writeHead(upstreamResponse.status, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify(translated));
          return;
        } catch {
          // Si no se puede parsear/transformar, pasar tal cual? pero payload no objeto debe lanzar KevValidationError - dejar pasar
        }
      }

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