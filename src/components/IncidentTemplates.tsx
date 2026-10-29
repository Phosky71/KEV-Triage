import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import type { IncidentTemplate } from '../types';

interface IncidentTemplatesProps {
  templates: readonly IncidentTemplate[];
  selectedTemplateId: string | null;
  disabled: boolean;
  onSelectTemplate: (template: IncidentTemplate) => void;
}

export const IncidentTemplates: React.FC<IncidentTemplatesProps> = ({
  templates,
  selectedTemplateId,
  disabled,
  onSelectTemplate,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Plantillas de prueba verificadas
        </span>
        <span className="text-xs text-zinc-500">
          Entradas de ejemplo (no fuerzan respuestas)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {templates.map((tpl) => {
          const isSelected = selectedTemplateId === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTemplate(tpl)}
              aria-pressed={isSelected}
              className={`group text-left rounded-lg border p-3 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-indigo-500/60 bg-indigo-950/30 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-medium text-sm text-zinc-100">
                  {isSelected ? (
                    <CheckCircle2
                      className="h-4 w-4 text-indigo-400 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText
                      className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span>{tpl.title}</span>
                </div>
                <span className="inline-flex items-center rounded border border-zinc-700/80 bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300 shrink-0">
                  {tpl.badge}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400 pl-6">{tpl.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};