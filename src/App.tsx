import React, { useState, useRef, useCallback } from 'react';
import { TerminalSquare, Shield, Cpu } from 'lucide-react';
import type {
  IncidentTemplate,
  KevNormalizedResult,
  TriageError,
  TriageEvaluation,
} from './types';
import {
  INCIDENT_TEMPLATES,
  getDemoFixtureResult,
  type DemoScenarioId,
} from './lib/demo-fixtures';
import {
  analyzeIncidentWithKev,
  isServiceUrlConfigured,
  KevClientException,
} from './lib/kev-client';
import { evaluateTriageRules } from './lib/triage-rules';
import { IncidentInput } from './components/IncidentInput';
import { AnalysisResults } from './components/AnalysisResults';

export const App: React.FC = () => {
  const [incidentText, setIncidentText] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [selectedDemoScenario, setSelectedDemoScenario] =
    useState<DemoScenarioId>('security_high_conf');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<KevNormalizedResult | null>(null);
  const [evaluation, setEvaluation] = useState<TriageEvaluation | null>(null);
  const [error, setError] = useState<TriageError | null>(null);

  // Control de concurrencia y prevención de condiciones de carrera
  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const serviceConfigured = isServiceUrlConfigured();

  const handleTextChange = useCallback((newText: string) => {
    setIncidentText(newText);
    const matchingTemplate = INCIDENT_TEMPLATES.find((tpl) => tpl.content === newText);
    setSelectedTemplateId(matchingTemplate ? matchingTemplate.id : null);
  }, []);

  const handleSelectTemplate = useCallback((template: IncidentTemplate) => {
    setIncidentText(template.content);
    setSelectedTemplateId(template.id);
    setError(null);

    // En modo demo seleccionamos por comodidad el escenario afín sin forzar ni ocultar el selector
    if (template.id === 'template-a') {
      setSelectedDemoScenario('security_high_conf');
    } else if (template.id === 'template-b') {
      setSelectedDemoScenario('frontend_auto_assign');
    } else if (template.id === 'template-c') {
      setSelectedDemoScenario('billing_human_review');
    }
  }, []);

  const handleClear = useCallback(() => {
    setIncidentText('');
    setSelectedTemplateId(null);
    setError(null);
  }, []);

  const handleToggleDemoMode = useCallback((enabled: boolean) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsDemoMode(enabled);
    setError(null);
    setResult(null);
    setEvaluation(null);
  }, []);

  const executeAnalysis = useCallback(async () => {
    if (isLoading) {
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    setError(null);

    if (isDemoMode) {
      const demoResult = getDemoFixtureResult(selectedDemoScenario);
      const demoEvaluation = evaluateTriageRules(demoResult);
      setResult(demoResult);
      setEvaluation(demoEvaluation);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);

    try {
      const apiResult = await analyzeIncidentWithKev({
        incidentText,
        signal: controller.signal,
      });

      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      const rulesEvaluation = evaluateTriageRules(apiResult);
      setResult(apiResult);
      setEvaluation(rulesEvaluation);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof KevClientException) {
        setError(err.triageError);
      } else {
        setError({
          code: 'NETWORK_ERROR',
          title: 'Error inesperado al procesar la incidencia',
          message:
            err instanceof Error
              ? err.message
              : 'Se produjo un fallo desconocido durante el análisis.',
        });
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [incidentText, isDemoMode, isLoading, selectedDemoScenario]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Barra superior con identidad Kev Triage */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-400">
              <TerminalSquare className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base text-zinc-100">
                  Kev Triage
                </span>
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                  POST /v1/systemone
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Clasificación técnica System 1 y enrutamiento determinista de incidencias
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden md:inline-flex items-center gap-1.5 text-zinc-400">
              <Shield className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Reglas deterministas TypeScript
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-zinc-300">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
              Motor: Kev
            </span>
          </div>
        </div>
      </header>

      {/* Contenido principal en dos columnas en escritorio y una en móvil */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <IncidentInput
              incidentText={incidentText}
              selectedTemplateId={selectedTemplateId}
              templates={INCIDENT_TEMPLATES}
              isLoading={isLoading}
              isDemoMode={isDemoMode}
              selectedDemoScenario={selectedDemoScenario}
              isServiceConfigured={serviceConfigured}
              onTextChange={handleTextChange}
              onSelectTemplate={handleSelectTemplate}
              onClear={handleClear}
              onSubmit={executeAnalysis}
              onToggleDemoMode={handleToggleDemoMode}
              onChangeDemoScenario={setSelectedDemoScenario}
            />
          </div>

          <div className="lg:col-span-7">
            <AnalysisResults
              isLoading={isLoading}
              result={result}
              evaluation={evaluation}
              error={error}
              isDemoMode={isDemoMode}
              isServiceConfigured={serviceConfigured}
              onRetry={executeAnalysis}
              onEnableDemoMode={() => handleToggleDemoMode(true)}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;