export interface LiteLLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface CompletionRequest {
  system: string;
  user: string;
  /** Força `response_format: json_object` no gateway (sem markdown/preâmbulo). */
  jsonMode?: boolean;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  latencyMs: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  raw: unknown;
}

interface OpenAICompatibleResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Cliente do gateway LiteLLM (formato compatível OpenAI/Anthropic).
 *
 * IMPORTANTE: sempre passamos pelo gateway — nunca chamamos o provedor direto.
 * O modelo é definido por config (LITELLM_MODEL) e pode ser trocado sem mexer
 * no código. A medição de latência aqui alimenta a auditoria.
 */
export class LiteLLMClient {
  constructor(private readonly config: LiteLLMConfig) {}

  /** Nome do modelo configurado (para auditoria quando a chamada nem chega a responder). */
  get model(): string {
    return this.config.model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.config.apiKey) {
      throw new Error('LITELLM_API_KEY ausente — não é possível classificar.');
    }

    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      temperature: req.temperature ?? 0.2,
      ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    const startedAt = performance.now();
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`LiteLLM HTTP ${res.status}: ${errText.slice(0, 500)}`);
    }

    const data = (await res.json()) as OpenAICompatibleResponse;
    const text = data.choices?.[0]?.message?.content ?? '';

    return {
      text,
      model: data.model ?? this.config.model,
      latencyMs,
      tokensInput: data.usage?.prompt_tokens ?? null,
      tokensOutput: data.usage?.completion_tokens ?? null,
      raw: data,
    };
  }
}
