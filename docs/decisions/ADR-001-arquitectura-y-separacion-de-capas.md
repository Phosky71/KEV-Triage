# ADR-001: Arquitectura y separación de capas

- **Estado:** Aceptado
- **Fecha:** 2026-10-29
- **Autores:** Sistema (generado automáticamente)
- **Decisión:** Separar estrictamente contrato de protocolo, normalización/validación y lógica de negocio determinista

## Contexto

Se necesita una aplicación que consuma el protocolo `/v1/systemone` de Kev, normalice respuestas potencialmente variables y aplique reglas de negocio deterministas con umbrales estrictos. La respuesta del modelo puede venir en formatos ligeramente diferentes según la implementación del servicio.

## Problema

¿Cómo diseñar el sistema para ser robusto ante variaciones del contrato de respuesta, mantener las reglas de negocio puras y testeables, y evitar acoplamiento entre UI, protocolo y reglas?

## Opciones consideradas

1. **Todo en componentes React** - Llamar API directamente desde componentes, parsear inline, aplicar reglas ahí. Rápido pero difícil de testear y mantener.
2. **Capas separadas (cliente + adaptador + reglas)** - Separación clara de responsabilidades con validación estricta.
3. **SDK genérico** - Crear SDK reutilizable para Kev. Sobrecarga para este proyecto.

## Decisión

Adoptar **opción 2: capas separadas** con la siguiente estructura:
- `kev-client.ts`: Transporte HTTP, construcción de payload, timeouts, abort, errores tipados
- `kev-adapter.ts`: Extracción flexible + validación estricta + normalización
- `triage-rules.ts`: Reglas deterministas puras sin efectos secundarios
- `types.ts`: Contratos compartidos separando protocolo vs modelo interno

## Justificación

- **Testeabilidad:** Reglas puras se pueden testear sin UI/red. Adaptador testeable con fixtures.
- **Robustez:** Adaptador flexible ante formatos de respuesta variables.
- **Mantenibilidad:** Cambios en protocolo no afectan reglas, cambios en reglas no afectan transporte.
- **Seguridad:** Validación estricta previene interpretación errónea de respuestas.
- **Claridad:** Responsabilidades bien definidas.

## Consecuencias

**Positivas:**
- Código más testeable y mantenible
- Fácil añadir nuevos formatos de respuesta en adaptador
- Reglas deterministas claramente auditables
- Errores tipados y diagnósticos útiles

**Negativas:**
- Más archivos/capas que solución monolítica
- Ligero overhead de abstracción

**Riesgos mitigados:**
- Acoplamiento excesivo
- Dificultad para validar respuestas malformadas

## Relacionado

- ADR-002: Reglas deterministas con umbrales estrictos
- ADR-003: Proxy seguro para gestión de claves
