import React from 'react';
import {
  Send,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  FlaskConical,
  Server,
} from 'lucide-react';
import type { IncidentTemplate } from '../types';
import { IncidentTemplates } from './IncidentTemplates';
import { DEMO_SCENARIOS, type DemoScenarioId } from '../lib/demo-fixtures';

export const MAX_INCIDENT_LENGTH = 2000;
export const MIN_INCIDENT_LENGTH = 15;

interface IncidentInputProps {
  incidentText: string;
  selectedTemplateId: string | null;
  templates: readonly IncidentTemplate[];
  isLoading: boolean;
  isDemoMode: boolean;
  selectedDemoScenario: DemoScenarioId;
  isServiceConfigured: boolean;
  onTextChange: (value: string) => void;
  onSelectTemplate: (template: IncidentTemplate) => void;
  onClear: () => void;
  onSubmit: () => void;
  onToggleDemoMode: (enabled: boolean) => void;
  onChangeDemoScenario: (scenarioId: DemoScenarioId) => void;
}

export const IncidentInput: React.FC<IncidentInputProps> = ({
  incidentText,
  selectedTemplateId,
  templates,
  isLoading,
  isDemoMode,
  selectedDemoScenario,
  isServiceConfigured,
  onTextChange,
  onSelectTemplate,
  onClear,
  onSubmit,
  onToggleDemoMode,
  onChangeDemoScenario,
}) => {
  const trimmedLength = incidentText.trim().length;
  const rawLength = incidentText.length;
  const isEmpty = trimmedLength === 0;
  const isTooShort = !isEmpty && trimmedLength < MIN_INCIDENT_LENGTH;
  const isOverLimit = rawLength > MAX_INCIDENT_LENGTH;
  const isValidToSubmit = !isEmpty && !isTooShort && !isOverLimit;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading && isValidToSubmit) {
      onSubmit();
    }
  };

  return (
    <section
      aria-labelledby="incident-input-heading"
      className="flex flex-col rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-5 sm:p-6 space-y-6"
    >
      {/* Selector explícito de Modo Operativo (Integración Real vs Modo Demostración) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isDemoMode ? (
              <FlaskConical className="h-4 w-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Server className="h-4 w-4 text-indigo-400" aria-hidden="true" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              Modo de Operación
            </span>
          </div>

          <div
            role="group"
            aria-label="Seleccionar modo de operación"
            className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5"
          >
            <button
              type="button"
              onClick={() => onToggleDemoMode(false)}
              aria-pressed={!isDemoMode}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                !isDemoMode
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              API Kev Real
            </button>
            <button
              type="button"
              onClick={() => onToggleDemoMode(true)}
              aria-pressed={isDemoMode}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                isDemoMode
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Modo Demostración
            </button>
          </div>
        </div>

        {!isDemoMode && !isServiceConfigured && (
          <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-950/20 p-2.5 text-xs text-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Endpoint Kev no configurado:</strong>{' '}
              Configure <code className="font-mono text-amber-300">VITE_MODAL_API_URL</code> en su
              archivo <code className="font-mono text-amber-300">.env</code> para conectar con un
              servidor real, o active explícitamente el <strong>Modo Demostración</strong> arriba
              para inspeccionar las reglas de negocio con fixtures conocidos.
            </div>
          </div>
        )}

        {isDemoMode && (
          <div className="space-y-2 border-t border-zinc-800/80 pt-3">
            <label
              htmlFor="demo-scenario-select"
              className="block text-xs font-medium text-amber-300"
            >
              Fixture de respuesta simulada para probar reglas deterministas:
            </label>
            <select
              id="demo-scenario-select"
              value={selectedDemoScenario}
              onChange={(e) => onChangeDemoScenario(e.target.value as DemoScenarioId)}
              disabled={isLoading}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {DEMO_SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400">
              {DEMO_SCENARIOS.find((s) => s.id === selectedDemoScenario)?.description}
            </p>
          </div>
        )}
      </div>

      {/* Plantillas predefinidas */}
      <IncidentTemplates
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        disabled={isLoading}
        onSelectTemplate={onSelectTemplate}
      />

      {/* Formulario de entrada de incidencia */}
      <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="incident-description"
              id="incident-input-heading"
              className="block text-sm font-medium text-zinc-200"
            >
              Descripción técnica de la incidencia
            </label>
            {incidentText.length > 0 && (
              <button
                type="button"
                disabled={isLoading}
                onClick={onClear}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1.5 py-0.5 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Limpiar texto
              </button>
            )}
          </div>

          <textarea
            id="incident-description"
            rows={6}
            value={incidentText}
            disabled={isLoading}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Describa los síntomas técnicos, códigos de error HTTP, componentes afectados y cualquier observación de diagnóstico..."
            aria-describedby="incident-validation-msg incident-char-counter"
            aria-invalid={isTooShort || isOverLimit}
            className={`w-full rounded-lg border bg-zinc-950 p-3.5 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 disabled:opacity-60 ${
              isOverLimit
                ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/30'
                : isTooShort
                  ? 'border-amber-500/70 focus:border-amber-500 focus:ring-amber-500/30'
                  : 'border-zinc-800 focus:border-indigo-500 focus:ring-indigo-500/30'
            }`}
          />

          {/* Barra de validación y contador de caracteres */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div id="incident-validation-msg" aria-live="polite" className="flex items-center gap-1.5">
              {isEmpty && (
                <span className="text-zinc-500">
                  Introduzca una descripción o seleccione una plantilla para comenzar.
                </span>
              )}
              {isTooShort && (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  La descripción es demasiado breve (mínimo {MIN_INCIDENT_LENGTH} caracteres útiles).
                </span>
              )}
              {isOverLimit && (
                <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Se ha superado el límite máximo de {MAX_INCIDENT_LENGTH} caracteres. Reduzca el
                  texto sin perder su contenido actual.
                </span>
              )}
              {isValidToSubmit && (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Incidencia lista para analizar
                  {selectedTemplateId ? ' (plantilla cargada)' : ''}.
                </span>
              )}
            </div>

            <span
              id="incident-char-counter"
              className={`font-mono text-xs ${
                isOverLimit
                  ? 'text-red-400 font-semibold'
                  : rawLength > MAX_INCIDENT_LENGTH * 0.9
                    ? 'text-amber-400'
                    : 'text-zinc-400'
              }`}
            >
              {rawLength} / {MAX_INCIDENT_LENGTH} caracteres
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !isValidToSubmit}
          className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed ${
            isDemoMode
              ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400 focus-visible:ring-amber-400'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500'
          }`}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {isLoading
            ? 'Analizando incidencia...'
            : isDemoMode
              ? 'Evaluar con Datos de Demostración'
              : 'Analizar Incidencia con Kev (/v1/systemone)'}
        </button>
      </form>
    </section>
  );
};