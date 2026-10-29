# Desarrollo

## Requisitos

- Node.js >= v20.11.0 (compatible con 18.18+ o 22 LTS)
- npm >= v9/v10

## Instalación

```bash
npm install
```

## Configuración de entorno

Copiar `.env.example` a `.env` y configurar:

```env
# URL base del servicio Kev o proxy local
# Ejemplos:
# - Servicio directo: https://TU_USUARIO--kev-api.modal.run
# - Proxy local: http://localhost:8787/api/kev
VITE_MODAL_API_URL=http://localhost:8787/api/kev

# Modelo opcional
VITE_KEV_MODEL=kev-default
```

**Nota:** Si `VITE_MODAL_API_URL` contiene el placeholder `TU_USUARIO--kev-api.modal.run` o está vacío, la app marcará el servicio como no configurado y requerirá modo demo o configuración válida.

Para usar el proxy local, configurar también variables del proxy (ver `server/proxy.mjs`):
```env
PORT=8787
KEV_UPSTREAM_URL=https://...  # URL completa o base del upstream Kev
KEV_API_KEY=...               # Opcional, se añade como Bearer si existe
ALLOWED_ORIGIN=http://localhost:5173
```

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo Vite (puerto por defecto 5173) |
| `npm run proxy` | Inicia proxy seguro en Node (`server/proxy.mjs`) |
| `npm run build` | Type-check + build de producción (`tsc -b && vite build`) |
| `npm run typecheck` | Solo verificación de tipos |
| `npm run lint` | ESLint |
| `npm run test` | Ejecuta tests con Vitest (una vez) |
| `npm run test:watch` | Tests en modo watch |
| `npm run preview` | Preview del build de producción |

## Flujo de desarrollo típico

1. Configurar `.env` con endpoint válido o usar modo demo.
2. En una terminal: `npm run proxy` (si se usa proxy local).
3. En otra terminal: `npm run dev`.
4. Abrir `http://localhost:5173`.

## Estructura de código relevante

- **Tipos:** `src/types.ts` - contratos centralizados
- **Lógica de negocio:** `src/lib/triage-rules.ts` - reglas puras, fácilmente testeables
- **Integración:** `src/lib/kev-client.ts` + `src/lib/kev-adapter.ts`
- **UI:** Componentes en `src/components/`, estilos con Tailwind
- **Tests:** `src/test/` con Vitest + Testing Library

## Testing

Los tests cubren:
- **`triage-rules.test.ts`**: Reglas deterministas (umbrales estrictos)
- **`kev-adapter.test.ts`**: Parsing y validación del adaptador
- **`App.test.tsx`**: Integración de la app

Ejecutar: `npm test`

## Convenciones

- TypeScript estricto
- Componentes funcionales React
- Reglas de negocio en funciones puras (`triage-rules.ts`)
- Validación estricta en adaptador (lanza `KevValidationError`)
- Errores HTTP/cliente tipados como `KevClientException` con `TriageError`
- Comentarios en español donde aportan contexto; nombres de código en inglés/identificadores técnicos preservados
- Gestión cuidadosa de concurrencia (race conditions) en UI
- Sin logs sensibles

## Debugging

- Modo demo permite probar UI sin backend: activar desde la interfaz.
- Errores muestran código, título, mensaje y diagnóstico opcional.
- Latencia mostrada separando tiempo declarado por modelo vs RTT cliente.
