import { describe, it, expect } from 'vitest';
import {
  evaluateSecurityRule,
  evaluateDepartmentRoutingRule,
  evaluateTriageRules,
} from '../lib/triage-rules';
import type { KevNormalizedResult } from '../types';

describe('Reglas deterministas de negocio (triage-rules)', () => {
  describe('Regla 1: Alerta de seguridad (umbral estricto > 0.70)', () => {
    it.each([
      { prob: 0.69, expectedTriggered: false },
      { prob: 0.70, expectedTriggered: false },
      { prob: 0.71, expectedTriggered: true },
      { prob: 0.90, expectedTriggered: true },
    ])(
      'probabilidad afirmativa $prob -> alerta activada: $expectedTriggered',
      ({ prob, expectedTriggered }) => {
        const decision = evaluateSecurityRule(prob);
        expect(decision.triggered).toBe(expectedTriggered);
        expect(decision.affirmativeProbability).toBe(prob);
      }
    );
  });

  describe('Reglas 2 y 3: Asignación automática vs Revisión humana (umbral estricto > 0.85)', () => {
    it.each([
      { confidence: 0.84, expectedMode: 'human_review' },
      { confidence: 0.85, expectedMode: 'human_review' },
      { confidence: 0.86, expectedMode: 'auto_assign' },
      { confidence: 0.95, expectedMode: 'auto_assign' },
    ] as const)(
      'confianza $confidence -> modo esperado: $expectedMode',
      ({ confidence, expectedMode }) => {
        const decision = evaluateDepartmentRoutingRule('backend', confidence);
        expect(decision.mode).toBe(expectedMode);
        expect(decision.confidence).toBe(confidence);
      }
    );
  });

  describe('Independencia entre reglas', () => {
    it('muestra alerta de seguridad incluso cuando el departamento tiene confianza elevada (> 0.85)', () => {
      const mockResult: KevNormalizedResult = {
        model: 'kev-test',
        isDemo: false,
        department: {
          selected: 'backend',
          confidence: 0.95,
          confidenceSource: 'explicit_protocol',
        },
        severity: {
          level: 'critical',
          ordinal: 4,
          rawScore: 4,
          legend: 'Servicio esencial interrumpido',
        },
        securityLeak: {
          affirmativeProbability: 0.88,
        },
        latency: {
          modelDeclaredMs: 42,
          clientRoundTripMs: 110,
        },
      };

      const evaluation = evaluateTriageRules(mockResult);
      expect(evaluation.securityAlert.triggered).toBe(true);
      expect(evaluation.routing.mode).toBe('auto_assign');
      expect(evaluation.triggeredRuleIds).toContain('RULE_1_SECURITY_ALERT (> 0.70)');
      expect(evaluation.triggeredRuleIds).toContain('RULE_2_AUTO_ASSIGN (> 0.85)');
    });

    it('envía a revisión humana una clasificación de baja confianza aunque no haya alerta de seguridad', () => {
      const mockResult: KevNormalizedResult = {
        model: 'kev-test',
        isDemo: false,
        department: {
          selected: 'billing',
          confidence: 0.85,
          confidenceSource: 'explicit_protocol',
        },
        severity: {
          level: 'moderate',
          ordinal: 2,
          rawScore: 2,
          legend: 'Degradación limitada',
        },
        securityLeak: {
          affirmativeProbability: 0.10,
        },
        latency: {
          modelDeclaredMs: 35,
          clientRoundTripMs: 95,
        },
      };

      const evaluation = evaluateTriageRules(mockResult);
      expect(evaluation.securityAlert.triggered).toBe(false);
      expect(evaluation.routing.mode).toBe('human_review');
    });
  });
});