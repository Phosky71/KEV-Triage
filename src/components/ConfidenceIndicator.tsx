import React from 'react';
import type { DepartmentOption } from '../types';
import { DEPARTMENT_LABELS, AUTO_ASSIGN_CONFIDENCE_THRESHOLD } from '../lib/triage-rules';

interface ConfidenceIndicatorProps {
  confidence: number;
  confidenceSource: 'explicit_protocol' | 'winning_option_probability';
  probabilities?: Partial<Record<DepartmentOption, number>>;
  selectedDepartment: DepartmentOption;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({
  confidence,
  confidenceSource,
  probabilities,
  selectedDepartment,
}) => {
  const pct = Math.round(confidence * 1000) / 10;
  const exceedsAutoThreshold = confidence > AUTO_ASSIGN_CONFIDENCE_THRESHOLD;

  const sortedProbabilities = probabilities
    ? (Object.entries(probabilities) as [DepartmentOption, number][]).sort(
        (a, b) => b[1] - a[1]
      )
    : null;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-zinc-300 font-medium">
            Confianza de clasificación ({exceedsAutoThreshold ? 'Alta > 85%' : 'Requiere revisión ≤ 85%'})
          </span>
          <span className="font-mono font-semibold text-zinc-100">{pct.toFixed(1)}%</span>
        </div>

        {/* Barra de progreso accesible con marcador de umbral 85% */}
        <div
          role="progressbar"
          aria-label="Confianza de clasificación de departamento"
          aria-valuenow={ Number(pct.toFixed(1)) }
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-800"
        >
          <div
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            className={`h-full transition-all duration-200 ${
              exceedsAutoThreshold ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          {/* Línea vertical indicadora del umbral determinista de 85% */}
          <div
            style={{ left: '85%' }}
            title="Umbral de asignación automática (85%)"
            className="absolute top-0 bottom-0 w-0.5 bg-zinc-100/80"
          />
        </div>

        <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            Fuente:{' '}
            {confidenceSource === 'explicit_protocol'
              ? 'Confianza explícita del protocolo Kev'
              : 'Probabilidad de la opción seleccionada'}
          </span>
          <span className="font-mono">Umbral automático: &gt; 85.0%</span>
        </div>
      </div>

      {/* Distribución de probabilidades por opción (si el protocolo la incluye) */}
      {sortedProbabilities && sortedProbabilities.length > 0 && (
        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Distribución de probabilidades (`choice`)
          </span>
          <div className="space-y-1.5">
            {sortedProbabilities.map(([dept, prob]) => {
              const deptPct = (prob * 100).toFixed(1);
              const isWinner = dept === selectedDepartment;
              return (
                <div key={dept} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={
                        isWinner ? 'font-semibold text-zinc-100' : 'text-zinc-400'
                      }
                    >
                      {DEPARTMENT_LABELS[dept]} ({dept})
                    </span>
                    <span className="font-mono text-zinc-300">{deptPct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800/90 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(0, prob * 100))}%` }}
                      className={`h-full ${
                        isWinner ? 'bg-indigo-500' : 'bg-zinc-600'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};