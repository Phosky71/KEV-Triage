export function kevPayloadToGateway(
  payload: unknown,
  opts?: { model?: string; systemPrompt?: string }
): {
  state: string;
  model: string;
  questions: Record<
    string,
    {
      type: string;
      instructions: string;
      criteria: Record<string, string>;
    }
  >;
};

export function gatewayResponseToKevShape(gw: unknown, meta?: { model?: string }): unknown;

export function gatewayModelsToList(gw: unknown): string[];
