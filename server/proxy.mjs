import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const KEV_UPSTREAM_URL = (process.env.KEV_UPSTREAM_URL ?? '').trim().replace(/\/+$/, '');
const KEV_API_KEY = (process.env.KEV_API_KEY ?? '').trim();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';
const MAX_BODY_BYTES = 32 * 1024; // 32 KB máximo para evitar abuso

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || !req.url?.endsWith('/v1/systemone')) {
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

  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_BODY_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload demasiado grande.' }));
      return;
    }
    body += chunk.toString('utf8');
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

  try {
    const upstreamResponse = await fetch(upstreamEndpoint, {
      method: 'POST',
      headers,
      body,
    });

    const responseText = await upstreamResponse.text();
    res.writeHead(upstreamResponse.status, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(responseText);
  } catch {
    // Nunca registramos ni devolvemos KEV_API_KEY ni el contenido sensible de la incidencia
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'No fue posible conectar con el servicio upstream de Kev.',
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`Proxy seguro Kev Triage escuchando en http://localhost:${PORT}/api/kev/v1/systemone`);
});