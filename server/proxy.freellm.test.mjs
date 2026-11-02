import { describe, expect, it } from 'vitest';
import http from 'node:http';

describe('Proxy FreeLLM (FREELLM-001)', () => {
  it('sin VITE_FREELLM_* en cliente (grep)', async () => {
    // Verificación estática - no hay referencias en src
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/lib/kev-client.ts', 'utf8');
    expect(src.includes('VITE_FREELLM')).toBe(false);
    expect(src.includes('FREELLM_API_KEY')).toBe(false);
  });

  it('config inválida -> modo demo (comportamiento cliente)', async () => {
    // El cliente usa isServiceUrlConfigured; sin URL válida -> UNCONFIGURED_SERVICE (modo demo)
    const { isServiceUrlConfigured } = await import('../src/lib/kev-client.ts');
    expect(isServiceUrlConfigured('')).toBe(false);
  });
});
