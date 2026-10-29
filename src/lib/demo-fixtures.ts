import type { IncidentTemplate, KevNormalizedResult } from '../types';
import { adaptKevResponse } from './kev-adapter';

/**
 * Las tres plantillas oficiales exigidas en la Sección 7 de la especificación.
 */
export const INCIDENT_TEMPLATES: readonly IncidentTemplate[] = [
  {
    id: 'template-a',
    title: 'Plantilla A: Fallo 500 con Token Expuesto',
    badge: 'Backend / Seguridad',
    description: 'Prueba tanto la clasificación técnica como la regla de alerta de seguridad.',
    content:
      'El endpoint de autenticación devuelve errores HTTP 500 desde el último despliegue. Durante el diagnóstico se detectó que un token de acceso podría haber aparecido en un registro compartido. El servicio afecta a varios usuarios y es necesario investigar la causa del error y el posible alcance de la exposición.',
  },
  {
    id: 'template-b',
    title: 'Plantilla B: CSS Roto en Mobile',
    badge: 'Frontend / UI',
    description: 'Comprueba la identificación de un problema de presentación en pantallas pequeñas.',
    content:
      'Después de la última actualización, el menú de navegación se sale de la pantalla en dispositivos móviles. Los botones quedan parcialmente ocultos, pero la API y las operaciones principales siguen funcionando. El problema afecta principalmente a la presentación en pantallas pequeñas.',
  },
  {
    id: 'template-c',
    title: 'Plantilla C: Error de Cobro Duplicado',
    badge: 'Billing / Pagos',
    description: 'Comprueba la clasificación relacionada con facturación y evaluación de severidad.',
    content:
      'Varios usuarios han informado de que una misma compra aparece cobrada dos veces. Los registros muestran dos transacciones para algunos pedidos. Es necesario investigar el procesamiento de pagos, comprobar el alcance del problema y determinar cómo corregir los cargos duplicados.',
  },
];

export type DemoScenarioId =
  | 'security_high_conf'
  | 'frontend_auto_assign'
  | 'billing_human_review'
  | 'boundary_exact_thresholds';

export interface DemoScenarioFixture {
  id: DemoScenarioId;
  label: string;
  description: string;
  rawProtocolPayload: Record<string, unknown>;
}

/**
 * Fixtures estáticos para el Modo de Demostración (Sección 9).
 * IMPORTANTE:
 * - No incluyen latencias falsas (`latency_ms: null` y `clientRoundTripMs: null`).
 * - Se identifican siempre con `isDemo: true` y etiqueta explícita «Datos de demostración».
 * - Permiten verificar todas las combinaciones de reglas deterministas sin servidor externo.
 */
export const DEMO_SCENARIOS: readonly DemoScenarioFixture[] = [
  {
    id: 'security_high_conf',
    label: 'Escenario 1: Alerta de Seguridad (> 0.70) + Alta Confianza (> 0.85)',
    description:
      'Simula una respuesta para un fallo de backend con alta probabilidad de filtración (0.92) y confianza de departamento elevada (0.91). Demuestra que la alerta de seguridad prevalece visualmente y ambas reglas actúan de forma independiente.',
    rawProtocolPayload: {
      model: 'kev-demo-fixture',
      answers: {
        department: {
          choice: 'backend',
          confidence: 0.91,
          probabilities: {
            backend: 0.91,
            devops: 0.06,
            frontend: 0.02,
            billing: 0.01,
          },
        },
        severity: {
          level: 'critical',
          score: 4,
          probabilities: {
            low: 0.01,
            moderate: 0.04,
            high: 0.20,
            critical: 0.62,
            emergency: 0.13,
          },
        },
        is_security_leak: {
          affirmative_probability: 0.92,
          answer: 'yes',
        },
      },
    },
  },
  {
    id: 'frontend_auto_assign',
    label: 'Escenario 2: Frontend Confianza Alta (0.94) + Sin Filtración (0.04)',
    description:
      'Simula un problema visual en móvil con severidad moderada, confianza de departamento del 94% (asignación automática propuesta) y riesgo de filtración nulo.',
    rawProtocolPayload: {
      model: 'kev-demo-fixture',
      answers: {
        department: {
          choice: 'frontend',
          confidence: 0.94,
          probabilities: {
            frontend: 0.94,
            backend: 0.03,
            devops: 0.02,
            billing: 0.01,
          },
        },
        severity: {
          level: 'moderate',
          score: 2,
          probabilities: {
            low: 0.22,
            moderate: 0.68,
            high: 0.08,
            critical: 0.02,
            emergency: 0.0,
          },
        },
        is_security_leak: {
          affirmative_probability: 0.04,
          answer: 'no',
        },
      },
    },
  },
  {
    id: 'billing_human_review',
    label: 'Escenario 3: Facturación con Confianza Moderada (0.78 <= 0.85) -> Revisión Humana',
    description:
      'Simula un incidente de cobros donde la confianza entre billing (78%) y backend (19%) no supera el 85%, activando la Regla 3 de Revisión Humana obligatoria.',
    rawProtocolPayload: {
      model: 'kev-demo-fixture',
      answers: {
        department: {
          choice: 'billing',
          confidence: 0.78,
          probabilities: {
            billing: 0.78,
            backend: 0.19,
            devops: 0.02,
            frontend: 0.01,
          },
        },
        severity: {
          level: 'high',
          score: 3,
          probabilities: {
            low: 0.02,
            moderate: 0.12,
            high: 0.56,
            critical: 0.26,
            emergency: 0.04,
          },
        },
        is_security_leak: {
          affirmative_probability: 0.12,
          answer: 'no',
        },
      },
    },
  },
  {
    id: 'boundary_exact_thresholds',
    label: 'Escenario 4: Valores Límite Exactos (Seguridad = 0.70, Confianza = 0.85)',
    description:
      'Verifica los bordes matemáticos estrictos: con 0.70 exacto NO se activa la alerta de seguridad y con 0.85 exacto NO se asigna automáticamente (solicita revisión humana).',
    rawProtocolPayload: {
      model: 'kev-demo-fixture',
      answers: {
        department: {
          choice: 'devops',
          confidence: 0.85,
          probabilities: {
            devops: 0.85,
            backend: 0.10,
            frontend: 0.03,
            billing: 0.02,
          },
        },
        severity: {
          level: 'high',
          score: 3,
        },
        is_security_leak: {
          affirmative_probability: 0.70,
          answer: 'no',
        },
      },
    },
  },
];

/**
 * Devuelve un resultado normalizado procedente de un fixture estático de demostración.
 * Nunca inventa tiempos de latencia de servidor (`clientRoundTripMs: null`).
 */
export function getDemoFixtureResult(scenarioId: DemoScenarioId): KevNormalizedResult {
  const scenario =
    DEMO_SCENARIOS.find((item) => item.id === scenarioId) ?? DEMO_SCENARIOS[0]!;

  return adaptKevResponse(scenario.rawProtocolPayload, {
    clientRoundTripMs: null,
    isDemo: true,
    demoFixtureName: scenario.label,
  });
}