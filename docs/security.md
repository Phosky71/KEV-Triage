# Seguridad

## Principios

- **Sin exposición de secretos en cliente**: Las API keys se gestionan únicamente en el proxy (`server/proxy.mjs`), nunca en código cliente.
- **Validación estricta**: El adaptador valida todos los campos obligatorios y rangos ([0,1] para probabilidades/confianzas).
- **Reglas deterministas**: Umbrales exactos y ortogonales evitan decisiones ambiguas.
- **Manejo seguro de errores**: Mensajes genéricos en fallos de conexión, sin filtrar claves o contenido sensible.
- **Protección contra abuso**: Límite de tamaño de body (32KB) en proxy.

## Configuración segura

### Proxy
```javascript
// server/proxy.mjs
headers.Authorization = `Bearer ${KEV_API_KEY}`; // Solo si existe
```
- Nunca loggea `KEV_API_KEY`
- En catch genérico devuelve 502 sin detalles del upstream
- CORS restringido por `ALLOWED_ORIGIN` (lista separada por comas). `Access-Control-Allow-Origin` solo se refleja con origen permitido, `Vary: Origin` siempre que se evalúe el origen, `403` sin ACAO para origen no permitido en POST/OPTIONS, peticiones sin Origin permitidas.

### Cliente
- No almacena credenciales
- Usa `AbortController` para cancelar peticiones
- Timeout de 15s por defecto
- Detecta placeholder de URL y marca como no configurado

## Validación de datos

### Probabilidades
- Deben estar en rango [0, 1]
- Tipo numérico, no NaN
- Validación en `isValidProbability()`

### Esquema
- `KevValidationError` con mensaje descriptivo y diagnósticos
- Verifica existencia de nodos obligatorios para las 3 preguntas
- Valida opciones/valores contra enums definidos

### Tipos
TypeScript estricto para prevenir errores de tipo.

## Reglas de seguridad (Regla 1)

**Umbral estricto:** `affirmativeProbability > 0.70`  
**Exactamente 0.70 NO activa alerta.**

Cuando se activa:
- Título: "Alerta de Seguridad Prioritaria: Posible Exposición de Material Sensible"
- Recomendaciones incluyen: revisión inmediata, revocación/rotación, evitar repetir secretos, conservar evidencia
- Disclaimer: predicción probabilística, no confirmación objetiva

La alerta es **ortogonal** a la asignación de departamento (nunca se oculta).

## Riesgos mitigados

- **Exposición de claves:** Mediante proxy servidor-cliente
- **Respuestas malformadas:** Validación estricta con fallback a errores controlados
- **Condiciones de carrera:** `requestId` tracking + abort
- **Payloads excesivos:** Límite 32KB
- **CORS:** Configurable y aplicado
- **Decisiones erróneas por ambigüedad:** Umbrales estrictos con revisión humana cuando confianza <= 0.85

## Recomendaciones operativas

- Usar HTTPS en producción para cliente y proxy
- Configurar `ALLOWED_ORIGIN` restrictivamente
- Rotar `KEV_API_KEY` regularmente si se usa
- No commitear `.env` (está en `.gitignore`)
- Monitorear alertas de seguridad generadas por la app
- En modo demo, los datos son ficticios (marcados con `isDemo: true`)
