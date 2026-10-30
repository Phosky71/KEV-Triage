import React from 'react';
import {
  CheckCircle2,
  UserCheck,
  Clock,
  Layers,
  Gauge,
  FlaskConical,
  AlertOctagon,
  RefreshCw,
  Terminal,
  Sparkles,
} from 'lucide-react';
import type {
  KevNormalizedResult,
  SeverityLevel,
  TriageError,
  TriageEvaluation,
} from '../types';
import { DEPARTMENT_LABELS } from '../lib/triage-rules';
import { SecurityAlert } from './SecurityAlert';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { LoadingState } from './LoadingState';

interface AnalysisResultsProps {
  isLoading: boolean;
  result: KevNormalizedResult | null;
  evaluation: TriageEvaluation | null;
  error: TriageError | null;
  isDemoMode: boolean;
  isServiceConfigured: boolean;
  onRetry: () => void;
  onEnableDemoMode: () => void;
}

const SEVERITY_BADGE_STYLES: Record<
  SeverityLevel,
  { label: string; classes: string; stepsActiveClass: string }
> = {
  low: {
    label: '1 / 5 — Low (Baja)',
    classes: 'border-zinc-700 bg-zinc-800 text-zinc-200',
    stepsActiveClass: 'bg-zinc-400',
  },
  moderate: {
    label: '2 / 5 — Moderate (Moderada)',
    classes: 'border-sky-500/40 bg-sky-950/40 text-sky-300',
    stepsActiveClass: 'bg-sky-400',
  },
  high: {
    label: '3 / 5 — High (Alta)',
    classes: 'border-amber-500/40 bg-amber-950/40 text-amber-300',
    stepsActiveClass: 'bg-amber-400',
  },
  critical: {
    label: '4 / 5 — Critical (Crítica)',
    classes: 'border-orange-500/50 bg-orange-950/40 text-orange-300',
    stepsActiveClass: 'bg-orange-500',
  },
  emergency: {
    label: '5 / 5 — Emergency (Emergencia)',
    classes: 'border-red-500/60 bg-red-950/50 text-red-200',
    stepsActiveClass: 'bg-red-500',
  },
};

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  isLoading,
  result,
  evaluation,
  error,
  isDemoMode,
  isServiceConfigured,
  onRetry,
  onEnableDemoMode,
}) => {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <section
        role="alert"
        aria-labelledby="error-state-heading"
        className="rounded-xl border border-red-500/50 bg-zinc-900/60 p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-red-500/15 p-2.5 border border-red-500/30 shrink-0">
            <AlertOctagon className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <span className="inline-block font-mono text-[11px] uppercase tracking-wider text-red-400">
              Código: {error.code}
              {error.httpStatus ? ` (HTTP ${error.httpStatus})` : ''}
            </span>
            <h2 id="error-state-heading" className="text-base font-semibold text-zinc-100">
              {error.title}
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">{error.message}</p>
          </div>
        </div>

        {error.diagnostics && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-400 flex items-start gap-2">
            <Terminal className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="break-all">
              <span className="text-zinc-500">Diagnóstico técnico: </span>
              {error.diagnostics}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3.5 py-2 text-xs font-semibold text-zinc-900 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reintentar análisis
          </button>

          {!isDemoMode && (
            <button
              type="button"
              onClick={onEnableDemoMode}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Cambiar a Modo Demostración
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!result || !evaluation) {
    return (
      <section
        aria-label="Estado inicial de resultados"
        className="flex flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/25 p-8 text-center min-h-[380px] space-y-4"
      >
        <div className="rounded-full border border-zinc-800 bg-zinc-900 p-3.5">
          <Sparkles className="h-6 w-6 text-zinc-400" aria-hidden="true" />
        </div>
        <div className="max-w-md space-y-1.5">
          <h2 className="text-sm font-semibold text-zinc-200">
            Esperando descripción de incidencia
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Seleccione una de las tres plantillas de prueba en el panel izquierdo o redacte una
            incidencia técnica para consultar la clasificación estructurada y las reglas
            deterministas de enrutamiento.
          </p>
        </div>

        {!isDemoMode && !isServiceConfigured && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3.5 max-w-md text-left text-xs text-zinc-400 space-y-1.5">
            <p className="font-medium text-zinc-300">
              Estado de conexión: Servicio externo pendiente de configurar
            </p>
            <p>
              Para conectar una instancia desplegada de Kev, defina{' '}
              <code className="font-mono text-indigo-300">VITE_MODAL_API_URL</code> en un archivo{' '}
              <code className="font-mono text-indigo-300">.env</code>, o active el{' '}
              <strong>Modo Demostración</strong> para probar la interfaz inmediatamente.
            </p>
          </div>
        )}
      </section>
    );
  }

  const severityMeta = SEVERITY_BADGE_STYLES[result.severity.level];

  return (
    <section
      aria-labelledby="results-heading"
      className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-5 sm:p-6 space-y-6"
    >
      {/* Cabecera de estado y métricas de latencia diferenciadas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="results-heading" className="text-sm font-semibold text-zinc-100">
            Resultado del Triaje
          </h2>

          {result.isDemo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Datos de demostración
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Respuesta verificada de Kev
            </span>
          )}

          <span className="font-mono text-xs text-zinc-400">
            Modelo: <strong className="text-zinc-200">{result.model}</strong>
          </span>
        </div>

        {/* Latencia real vs declarada (nunca inventada en modo demo) */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {result.isDemo ? (
            <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-400">
              <Clock className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              Latencia: N/A (Fixture estático sin servidor)
            </span>
          ) : (
            <>
              {result.latency.modelDeclaredMs !== null && (
                <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-300">
                  <Clock className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
                  Latencia modelo: {result.latency.modelDeclaredMs} ms
                </span>
              )}
              {result.latency.clientRoundTripMs !== null && (
                <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-300">
                  <Clock className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  Ida y vuelta cliente (RTT): {result.latency.clientRoundTripMs} ms
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* PRIORIDAD VISUAL 1: Alerta de Seguridad (Regla 1: > 0.70) */}
      <SecurityAlert decision={evaluation.securityAlert} />

      {/* PRIORIDAD VISUAL 2: Recomendación Determinista de Enrutamiento (Reglas 2 y 3) */}
      <div
        className={`rounded-xl border p-4 sm:p-5 space-y-3 ${
          evaluation.routing.mode === 'auto_assign'
            ? 'border-emerald-500/40 bg-emerald-950/15'
            : 'border-amber-500/50 bg-amber-950/20'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {evaluation.routing.mode === 'auto_assign' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <UserCheck className="h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
            )}
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                {evaluation.routing.mode === 'auto_assign'
                  ? 'Decisión determinista: Regla 2 (> 0.85)'
                  : 'Decisión determinista: Regla 3 (≤ 0.85)'}
              </span>
              <h3 className="text-sm font-semibold text-zinc-100">
                {evaluation.routing.title}
              </h3>
            </div>
          </div>

          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
              evaluation.routing.mode === 'auto_assign'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {evaluation.routing.mode === 'auto_assign'
              ? 'Asignación Automática Propuesta'
              : 'Revisión Humana Requerida'}
          </span>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          {evaluation.routing.explanation}
        </p>
      </div>

      {/* Tarjetas de detalle del protocolo: Departamento y Severidad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* A. Departamento responsable */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Layers className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              Departamento Predicho (`choice`)
            </span>
            <span className="font-mono text-xs rounded bg-zinc-800 px-2 py-0.5 text-zinc-200">
              {result.department.selected ?? '—'}
            </span>
          </div>

          <div className="text-base font-semibold text-zinc-100">
            {result.department.selected ? DEPARTMENT_LABELS[result.department.selected] : 'Ambiguo, revisión humana'}
          </div>

          <ConfidenceIndicator
            confidence={result.department.confidence}
            confidenceSource={result.department.confidenceSource}
            probabilities={result.department.probabilities}
            selectedDepartment={result.department.selected}
          />
        </div>

        {/* B. Severidad estimada */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <Gauge className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                Severidad Estimada (`score`)
              </span>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${severityMeta.classes}`}
              >
                {severityMeta.label}
              </span>
            </div>

            {/* Indicador visual de 5 segmentos accesible */}
            <div
              role="img"
              aria-label={`Nivel de severidad ${result.severity.ordinal} de 5: ${result.severity.level}`}
              className="grid grid-cols-5 gap-1.5 pt-1"
            >
              {[1, 2, 3, 4, 5].map((step) => {
                const active = step <= result.severity.ordinal;
                return (
                  <div
                    key={step}
                    className={`h-2 rounded-sm ${
                      active ? severityMeta.stepsActiveClass : 'bg-zinc-800'
                    }`}
                  />
                );
              })}
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {result.severity.legend}
            </p>
          </div>

          <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>Nivel normalizado: {result.severity.level}</span>
            <span>Valor protocolo: {String(result.severity.rawScore)}</span>
          </div>
        </div>
      </div>

      {/* Resumen de auditoría de reglas ejecutadas */}
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-zinc-400 font-medium">
          Reglas deterministas activadas en cliente:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {evaluation.triggeredRuleIds.map((ruleId) => (
            <span
              key={ruleId}
              className="font-mono text-[11px] rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300"
            >
              {ruleId}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};