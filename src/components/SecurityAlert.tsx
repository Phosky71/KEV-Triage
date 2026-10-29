import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { SecurityAlertDecision } from '../types';

interface SecurityAlertProps {
  decision: SecurityAlertDecision;
}

export const SecurityAlert: React.FC<SecurityAlertProps> = ({ decision }) => {
  const percentage = (decision.affirmativeProbability * 100).toFixed(1);

  if (decision.triggered) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-xl border-2 border-red-500/80 bg-red-950/35 p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-red-500/20 p-2 border border-red-500/40 shrink-0">
              <ShieldAlert className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded bg-red-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-zinc-950">
                  Prioridad Crítica — Regla 1 Activa
                </span>
                <span className="font-mono text-xs text-red-300">
                  is_security_leak (noul): {percentage}% &gt; 70.0%
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-red-100">
                {decision.title}
              </h3>
            </div>
          </div>
        </div>

        <p className="text-sm text-red-200/90 leading-relaxed">{decision.summary}</p>

        <div className="rounded-lg border border-red-500/30 bg-zinc-950/60 p-3.5 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-red-300">
            Protocolo de actuación recomendado:
          </h4>
          <ul className="space-y-1.5 text-xs text-zinc-200 list-disc list-inside">
            {decision.recommendations.map((rec, index) => (
              <li key={index} className="leading-relaxed">
                {rec}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2 pt-1 text-xs text-red-300/90">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{decision.disclaimer}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xs font-medium text-zinc-200">{decision.title}</p>
          <p className="text-[11px] text-zinc-400">{decision.summary}</p>
        </div>
      </div>
      <span className="font-mono text-xs text-zinc-300 shrink-0 rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
        noul: {percentage}% (≤ 70.0%)
      </span>
    </div>
  );
};