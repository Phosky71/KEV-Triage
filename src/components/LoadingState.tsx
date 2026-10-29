import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingState: React.FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-10 text-center space-y-4 min-h-[380px]"
    >
      <div className="rounded-full bg-indigo-500/10 p-3.5 border border-indigo-500/30">
        <Loader2
          className="h-7 w-7 text-indigo-400 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-sm font-semibold text-zinc-100">
          Ejecutando inferencia System 1 en Kev...
        </h3>
        <p className="text-xs text-zinc-400">
          Evaluando simultáneamente departamento (`choice`), severidad (`score`) e indicios de
          filtración de seguridad (`noul`) mediante `/v1/systemone`.
        </p>
      </div>
    </div>
  );
};