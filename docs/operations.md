# Operaciones

## Entornos

### Desarrollo
```bash
# Terminal 1: Proxy
npm run proxy

# Terminal 2: Dev server
npm run dev
```
URLs: Proxy `http://localhost:8787`, Vite `http://localhost:5173`

### Producción
```bash
npm run build
npm run preview  # Para pruebas locales del build
```
Los archivos estáticos se generan en `dist/`. El proxy (`server/proxy.mjs`) debe ejecutarse como servicio separado en el entorno de despliegue si se usa como intermediario.

## Variables de entorno

### Cliente (Vite)
| Variable | Requerida | Por defecto | Descripción |
|----------|-----------|-------------|-------------|
| `VITE_MODAL_API_URL` | Sí (para modo real) | - | URL base del servicio Kev o proxy. Si contiene placeholder o vacío → servicio no configurado |
| `VITE_KEV_MODEL` | No | `kev-default` | Nombre del modelo a enviar en payload |

### Proxy (Node)
| Variable | Requerida | Por defecto | Descripción |
|----------|-----------|-------------|-------------|
| `PORT` | No | `8787` | Puerto del proxy |
| `KEV_UPSTREAM_URL` | Sí | - | URL base o completa del upstream Kev |
| `KEV_API_KEY` | No | - | API key, se añade como `Bearer` si existe |
| `ALLOWED_ORIGIN` | No | `http://localhost:5173` | Lista separada por comas de orígenes permitidos para CORS. Orígenes no permitidos reciben 403 sin ACAO. Peticiones sin Origin permitidas. |
| `UPSTREAM_TIMEOUT_MS` | No | `10000` | Timeout hacia upstream (debe ser menor que el timeout del cliente `DEFAULT_TIMEOUT_MS` 15000). Al vencer → 504 y se cancela la petición al upstream. |

## Despliegue

### Opción 1: Frontend estático + Proxy separado
1. Build frontend: `npm run build` → servir `dist/`
2. Desplegar `server/proxy.mjs` como servicio Node (PM2, systemd, container)
3. Configurar `VITE_MODAL_API_URL` apuntando al proxy desplegado
4. Configurar CORS en proxy con origen del frontend

### Opción 2: Frontend directo al servicio Kev
Si el servicio Kev permite CORS desde el origen del frontend, se puede configurar `VITE_MODAL_API_URL` directamente. Asegurar que no se expongan claves en cliente.

## Monitoreo y diagnóstico

### Errores comunes
| Código | Causa | Solución |
|--------|-------|----------|
| `UNCONFIGURED_SERVICE` | URL no configurada o placeholder | Configurar `.env` o usar modo demo |
| `TIMEOUT_ERROR` | Cold start serverless / red lenta | Reintentar (mensaje sugiere cold start GPU) |
| `HTTP_ERROR` | Respuesta no 2xx del upstream | Verificar estado del servicio Kev |
| `INVALID_JSON` | Respuesta no JSON | Verificar contrato del servicio |
| `INVALID_SCHEMA` | Respuesta no coincide con contrato esperado | Revisar adaptador / logs de diagnóstico |
| `NETWORK_ERROR` | Sin conexión | Verificar red, CORS, proxy activo |

### Información de latencia
La UI muestra:
- **Modelo declarado:** `modelDeclaredMs` (si viene en respuesta)
- **RTT cliente:** `clientRoundTripMs` (medido con `performance.now()`)

### Logs
- Proxy solo loggea arranque: `Proxy seguro Kev Triage escuchando en...`
- Cliente no loggea datos sensibles
- Errores muestran diagnósticos en UI cuando disponibles

## Mantenimiento

### Actualización de dependencias
```bash
npm outdated
npm update
```
Revisar breaking changes en Vite/React/TypeScript.

### Limpieza
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Verificación pre-despliegue
```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Seguridad operativa

- Mantener `.env` fuera de control de versiones
- Usar HTTPS en producción
- Configurar `ALLOWED_ORIGIN` restrictivamente
- Rotar claves si es necesario
- Revisar logs sin datos sensibles
- En caso de alerta de seguridad activada, seguir recomendaciones de `SecurityAlert`
