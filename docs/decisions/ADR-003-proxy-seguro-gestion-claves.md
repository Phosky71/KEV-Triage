# ADR-003: Proxy seguro para gestión de claves

- **Estado:** Aceptado
- **Fecha:** 2026-10-29
- **Autores:** Sistema (generado automáticamente)
- **Decisión:** Usar proxy Node.js intermedio para añadir credenciales y evitar exposición en cliente

## Contexto

El servicio Kev puede requerir autenticación (API key). En una SPA cliente-side, cualquier credencial incluida en el bundle JavaScript sería visible para cualquier usuario. También necesitamos gestionar CORS si el servicio upstream no lo permite desde el origen del frontend.

## Problema

¿Cómo comunicar con el servicio Kev autenticado sin exponer claves en el cliente, manteniendo flexibilidad para desarrollo y despliegue?

## Opciones consideradas

1. **Llamada directa desde cliente con key en env** - Vite expone `VITE_*` en bundle, clave sería visible
2. **Proxy servidor intermedio** - Añade credenciales servidor-side, gestiona CORS
3. **Backend propio completo** - Mayor complejidad, sobreingeniería para este caso

## Decisión

Adoptar **opción 2: proxy Node.js intermedio** (`server/proxy.mjs`) con las siguientes características:
- Añade `Authorization: Bearer` si `KEV_API_KEY` está configurada
- Gestiona CORS configurable
- Límite de body (32KB)
- No loggea credenciales
- Errores genéricos
- Soporta OPTIONS preflight

## Justificación

- **Seguridad:** Claves nunca expuestas al cliente
- **Flexibilidad:** Funciona con servicios que requieren auth o CORS restrictivo
- **Simplicidad:** Proxy ligero con Node HTTP nativo, sin frameworks pesados
- **Desarrollo local:** Fácil ejecutar en paralelo con Vite
- **Despliegue:** Puede desplegarse como servicio independiente

## Consecuencias

**Positivas:**
- Credenciales seguras en servidor
- Control sobre CORS
- Protección adicional (límite de body)
- Logging controlado

**Negativas:**
- Requiere ejecutar servicio adicional en desarrollo/despliegue
- Un hop extra en la red
- Más componentes que mantener

## Implementación

- `server/proxy.mjs`: Servidor HTTP nativo
- Configuración via variables de entorno
- Cliente usa `VITE_MODAL_API_URL` apuntando al proxy o directamente al servicio
- Detección automática de servicio no configurado

## Relacionado

- ADR-001: Arquitectura y separación de capas
- `docs/operations.md` - Despliegue
- `docs/security.md` - Consideraciones de seguridad
