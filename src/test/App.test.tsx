import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../App';

describe('Integración de interfaz Kev Triage (App.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza las tres plantillas obligatorias y carga su texto al seleccionarlas', () => {
    render(<App />);

    const tplA = screen.getByRole('button', {
      name: /Plantilla A: Fallo 500 con Token Expuesto/i,
    });
    const tplB = screen.getByRole('button', { name: /Plantilla B: CSS Roto en Mobile/i });
    const tplC = screen.getByRole('button', {
      name: /Plantilla C: Error de Cobro Duplicado/i,
    });

    expect(tplA).toBeInTheDocument();
    expect(tplB).toBeInTheDocument();
    expect(tplC).toBeInTheDocument();

    fireEvent.click(tplA);

    const textarea = screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i });
    expect(textarea).toHaveValue(
      'El endpoint de autenticación devuelve errores HTTP 500 desde el último despliegue. Durante el diagnóstico se detectó que un token de acceso podría haber aparecido en un registro compartido. El servicio afecta a varios usuarios y es necesario investigar la causa del error y el posible alcance de la exposición.'
    );
  });

  it('identifica claramente los resultados simulados como «Datos de demostración» y muestra alerta de seguridad', () => {
    render(<App />);

    // Activar modo demostración explícitamente
    const demoButton = screen.getByRole('button', { name: /Modo Demostración/i });
    fireEvent.click(demoButton);

    // Cargar Plantilla A
    fireEvent.click(
      screen.getByRole('button', { name: /Plantilla A: Fallo 500 con Token Expuesto/i })
    );

    // Enviar
    const submitBtn = screen.getByRole('button', {
      name: /Evaluar con Datos de Demostración/i,
    });
    fireEvent.click(submitBtn);

    expect(screen.getAllByText(/Datos de demostraci/i).length > 0).toBe(true);
    expect(
      screen.getAllByText(
        /Alerta de Seguridad Prioritaria: Posible Exposición de Material Sensible/i
      ).length > 0
    ).toBe(true);
    expect(screen.getAllByText(/Asignación Automática Propuesta/i).length > 0).toBe(true);
  });

  it('conserva el texto introducido si ocurre un fallo de red y evita envíos duplicados en curso', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    // Configurar URL válida temporalmente para probar la llamada HTTP real
    vi.stubEnv('VITE_MODAL_API_URL', 'https://real-instance--kev-api.modal.run');

    render(<App />);

    const textarea = screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i }) as HTMLTextAreaElement;
    const sampleText =
      'Error crítico en el clúster de base de datos principal tras aplicar migración.';
    fireEvent.change(textarea, { target: { value: sampleText } });

    const submitBtn = screen.getByRole('button', {
      name: /Analizar Incidencia con Kev/i,
    });
    fireEvent.click(submitBtn);

    // Mientras está en curso, el botón está deshabilitado impidiendo envíos duplicados
    expect(submitBtn).toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Simular respuesta HTTP 502 Bad Gateway
    resolveFetch!(
      new Response(JSON.stringify({ error: 'Upstream failure' }), {
        status: 502,
        statusText: 'Bad Gateway',
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Error del servidor HTTP 502/i)).toBeInTheDocument();
    });

    // El texto del usuario NO se pierde tras el error
    expect(screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i })).toHaveValue(sampleText);

    vi.unstubAllEnvs();
  });
});