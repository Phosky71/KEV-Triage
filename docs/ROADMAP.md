# Roadmap de mejoras futuras

## Priorización
- **Ahora mismo**: Mejoras críticas o necesarias para estabilizar
- **Corto plazo**: Mejoras importantes que aportan valor significativo  
- **Cuando toque**: Mejoras futuras, nice-to-have

## FREELLM-002: Selector de modelos en UI

**Nivel:** Corto plazo  
**Qué es:** Implementar selector de modelos en la interfaz de usuario para modo FreeLLM, junto con la ruta `GET /api/kev/models` en el proxy.  
**Valor real que aporta:** Permite al usuario elegir qué modelo usar del gateway FreeLLM, dando control sobre calidad/coste.  
**Esfuerzo estimado:** Medio  
**Dependencias:**
- Definir estrategia de filtrado (actualmente `/v1/models` no distingue entre modelos de decisión/chat)
- Investigar modelos compatibles con `/v1/decisions` vs plano de chat
- Experimentos pendientes:
  1. **Parámetro `model` con valor inválido** - Comprobar comportamiento del gateway cuando se pasa un modelo no existente
  2. **Parámetro `model` con modelo del plano de chat** - Ver si funciona con modelos típicamente usados para chat o si requiere modelos específicos para `/v1/decisions`
- Considerar que `GET /api/kev/models` fue aplazado intencionalmente (FREELLM-001). El gateway (~85 modelos) no tiene distinción decision/chat aún.

## Calidad

### Tests E2E (Playwright)
**Nivel:** Corto plazo  
**Qué es:** Añadir tests end-to-end con Playwright cubriendo flujos críticos.  
**Valor real que aporta:** Garantiza que la integración completa funciona correctamente, detectando regresiones en UI+proxy+adaptador.  
**Esfuerzo estimado:** Alto  
**Dependencias:** Configuración de Playwright, fixtures/mocks para proxy simulado  
**Casos a cubrir:**
- Flujo demo completo (los 3 escenarios: security_high_conf, frontend_auto_assign, billing_human_review)
- Flujo real con proxy simulado
- Alerta de seguridad visible y prioritaria
- Estados de carga, errores y cancelación

### CI/CD
**Nivel:** Corto plazo  
**Qué es:** Pipeline de integración continua compatible con GitHub Actions (portable a Gitea).  
**Valor real que aporta:** Automatiza verificaciones, previene merges con código roto, mantiene calidad.  
**Esfuerzo estimado:** Medio  
**Dependencias:** Ninguna  
**Pasos a incluir:**
- `npm ci`
- `npm run lint`
- `npm run typecheck` / `tsc --noEmit`
- `npx vitest run`
- `npm run build`

## Robustez operativa

### Rate limiting en el proxy
**Nivel:** Ahora mismo  
**Qué es:** Añadir rate limiting al proxy para prevenir abuso.  
**Valor real que aporta:** Protección básica contra abuso, especialmente importante si se expone el proxy.  
**Esfuerzo estimado:** Medio  
**Dependencias:** Ninguna (actualmente solo hay límite de body 32KB)  
**Consideraciones:** Configurable por IP, ventanas deslizantes, respuesta 429 con headers apropiados.

### Logging estructurado opcional
**Nivel:** Cuando toque  
**Qué es:** Sistema de logging estructurado (JSON) configurable via env var.  
**Valor real que aporta:** Mejor observabilidad en producción sin logs verbosos en desarrollo.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Ninguna

### Healthcheck del upstream
**Nivel:** Cuando toque  
**Qué es:** Endpoint de healthcheck para verificar conectividad con upstream (Kev o FreeLLM).  
**Valor real que aporta:** Diagnóstico más rápido de problemas de conectividad.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Ninguna

### Reintentos documentados para 429
**Nivel:** Corto plazo  
**Qué es:** Documentar estrategia de reintentos con backoff exponencial para respuestas 429 (rate limit).  
**Valor real que aporta:** Mejor resiliencia ante límites del gateway FreeLLM.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Ninguna (comportamiento actual pasa respuesta tal cual)

## Seguridad operativa

### Rotación de FREELLM_API_KEY documentada
**Nivel:** Ahora mismo  
**Qué es:** Procedimiento documentado para rotar claves API de FreeLLM.  
**Valor real que aporta:** Mejora operativa de seguridad, reduce ventana de exposición.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Ninguna  
**Pasos a documentar:** Generar nueva clave, actualizar .env, reiniciar proxy, revocar antigua.

### Migrar remote de HTTP a SSH
**Nivel:** Corto plazo  
**Qué es:** Cambiar remote git de HTTP a SSH (clave ya generable).  
**Valor real que aporta:** Mejor seguridad, evita credenciales en texto plano.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Clave SSH configurada

### Cifrar credenciales
**Nivel:** Cuando toque  
**Qué es:** Migrar de credential.helper store a sistema cifrado en reposo si se comparte máquina.  
**Valor real que aporta:** Protección adicional en entornos multiusuario.  
**Esfuerzo estimado:** Alto  
**Dependencias:** Evaluación de herramientas (git-credential-libsecret, etc.)

## Producto

### Más fixtures de demo
**Nivel:** Corto plazo  
**Qué es:** Añadir casos límite a fixtures de demostración.  
**Valor real que aporta:** Mejor cobertura para demos y testing manual.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Ninguna  
**Casos a añadir:**
- Fuga real con alta confianza
- Multi-síntomas complejos
- Textos ambiguos con confianzas bajas

### Exportación del resultado del triage
**Nivel:** Corto plazo  
**Qué es:** Permitir descargar resultado en JSON o Markdown.  
**Valor real que aporta:** Útil para documentación, reportes o compartir análisis.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** Ninguna

### Historial local de análisis
**Nivel:** Cuando toque  
**Qué es:** Guardar últimos análisis en localStorage (sin datos sensibles excesivos).  
**Valor real que aporta:** Mejora UX, permite revisar análisis anteriores.  
**Esfuerzo estimado:** Medio  
**Dependencias:** Consideraciones de privacidad (no guardar texto completo de incidencias)

### i18n si se prevé uso en inglés
**Nivel:** Cuando toque  
**Qué es:** Internacionalización para soportar inglés además de español.  
**Valor real que aporta:** Ampliación potencial de audiencia.  
**Esfuerzo estimado:** Alto  
**Dependencias:** Decisión de producto sobre mercado objetivo

## Datos/modelo

### Calibración de umbral con modelos del gateway
**Nivel:** Corto plazo  
**Qué es:** Estudiar si el umbral de revisión humana (<= 0.85) calibra bien con modelos del gateway FreeLLM.  
**Valor real que aporta:** Optimización de decisiones de enrutamiento basada en comportamiento real.  
**Esfuerzo estimado:** Medio  
**Dependencias:** Datos reales de uso con diferentes modelos  
**Contexto:** Las confianzas reales observadas están en rango moderado (0.33-0.87). ADR-005 documenta esto como esperado, no bug.

### Comparativa de modelos de decisión
**Nivel:** Cuando toque  
**Qué es:** Añadir comparativa de modelos de decisión en `FINDINGS.json` como experimento futuro.  
**Valor real que aporta:** Datos para tomar decisiones informadas sobre qué modelos usar.  
**Esfuerzo estimado:** Bajo  
**Dependencias:** FREELLM-002 completado, recolección de métricas

## Notas

- **FREELLM-001** está completado y cerrado. Los pendientes relacionados con FreeLLM son principalmente FREELLM-002 (selector UI).
- **Sin whitelist de modelos** - Decisión intencional documentada en ADR-005. El usuario acepta riesgos al usar proveedores del gateway.
- **Confianzas moderadas** - Comportamiento esperado con modelos del gateway, no indica bug en la implementación.
- **Modo demo** funciona sin configuración, ideal para pruebas y demos.