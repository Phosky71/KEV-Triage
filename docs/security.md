# Seguridad

## Rate limiting
En esta implementación, **rate limiting NO existe**. El proxy solo aplica límite de tamaño (32 KB), validación CORS, timeouts y validación de esquema http/https para KEV_UPSTREAM_URL.
