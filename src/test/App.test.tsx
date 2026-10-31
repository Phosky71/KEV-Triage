import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('muestra aviso de revisión manual para INVALID_SCHEMA de is_security_leak y nunca "sin alerta"', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'kev-test',
          answers: {
            department: { choice: 'backend', confidence: 0.9 },
            severity: { level: 'high' },
            is_security_leak: { affirmative_probability: NaN },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.stubEnv('VITE_MODAL_API_URL', 'https://real-instance--kev-api.modal.run');

    render(<App />);

    fireEvent.change(screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i }), {
      target: { value: 'Test incidencia' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Analizar Incidencia con Kev/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Esquema de respuesta de Kev inválido. Se requiere revisión manual de la posible fuga./i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/sin alerta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin alerta/i)).not.toBeInTheDocument();

    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('KT-005: UI ambigüedad departamento', () => {
    it('KT-005: muestra "Ambiguo, revisión humana" y modo human_review', async () => {
      const user = userEvent.setup();
      const response = {
        answers: {
          department: { probabilities: { backend: 0.5, frontend: 0.5 } },
          severity: { level: 'high' },
          is_security_leak: { affirmative_probability: 0.1 },
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => response,
      } as Response);

      vi.stubEnv('VITE_MODAL_API_URL', 'https://real-instance--kev-api.modal.run');

      render(<App />);
      const textarea = screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i });
      await user.clear(textarea);
      fireEvent.change(textarea, { target: { value: JSON.stringify(response) } });
      await user.click(screen.getByRole('button', { name: /Analizar Incidencia con Kev/i }));

      expect(await screen.findByText(/Ambiguo, revisión humana/i)).toBeInTheDocument();
      expect(await screen.findAllByText(/Revisión Humana Requerida/i)).toHaveLength(2);
      expect(screen.queryByText(/Backend & Servicios de API/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Frontend & Experiencia de Usuario/i)).not.toBeInTheDocument();

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('KT-005: empate + is_security_leak > 0.70 muestra alerta de seguridad y estado ambiguo', async () => {
      const user = userEvent.setup();
      const response = {
        answers: {
          department: { probabilities: { backend: 0.5, frontend: 0.5 } },
          severity: { level: 'high' },
          is_security_leak: { affirmative_probability: 0.95 },
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => response,
      } as Response);

      vi.stubEnv('VITE_MODAL_API_URL', 'https://real-instance--kev-api.modal.run');

      render(<App />);
      const textarea = screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i });
      await user.clear(textarea);
      fireEvent.change(textarea, { target: { value: JSON.stringify(response) } });
      await user.click(screen.getByRole('button', { name: /Analizar Incidencia con Kev/i }));

      expect(await screen.findByText(/Ambiguo, revisión humana/i)).toBeInTheDocument();
      expect(await screen.findByText(/Alerta de Seguridad Prioritaria/i)).toBeInTheDocument();
      expect(screen.queryByText(/Backend & Servicios de API/i)).not.toBeInTheDocument();

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });
  });

  describe('KT-012: desmontar durante petición', () => {
    it('KT-012: al desmontar con petición en curso no provoca setState tras desmontar', async () => {
      vi.useFakeTimers();
      const response = {
        answers: {
          department: { choice: 'backend', confidence: 0.9 },
          severity: { level: 'high' },
          is_security_leak: { affirmative_probability: 0.1 },
        },
      };
      let resolveFetch: ((value: Response) => void) | undefined = undefined;
      vi.stubEnv('VITE_MODAL_API_URL', 'https://real-instance--kev-api.modal.run');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      );

      const { unmount } = render(<App />);
      fireEvent.change(screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i }), {
        target: { value: 'test' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Analizar Incidencia con Kev/i }));
      unmount();
      if (typeof resolveFetch === 'function') {
        (resolveFetch as (value: Response) => void)(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      await vi.runAllTimersAsync();
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });
  });

  describe('KT-013: cambio a demo durante petición', () => {
    it('KT-013: activar modo demo con petición en curso cancela y limpia estados', async () => {
      vi.useFakeTimers();
      vi.stubEnv('VITE_MODAL_API_URL', 'https://real-instance--kev-api.modal.run');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        () => new Promise<Response>(() => {})
      );

      render(<App />);
      fireEvent.change(screen.getByRole('textbox', { name: /Descripción técnica de la incidencia/i }), {
        target: { value: 'test' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Analizar Incidencia con Kev/i }));
      fireEvent.click(screen.getByRole('button', { name: /Modo Demostración/i }));
      expect(screen.queryByText(/Analizando incidencia/i)).not.toBeInTheDocument();
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });
  });
});