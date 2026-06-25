import Anthropic from '@anthropic-ai/sdk';
import type { CompletionRequest, CompletionResult, LlmClient } from './LlmClient.js';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

/**
 * Cliente que chama o Claude (Anthropic) DIRETO, via SDK oficial.
 *
 * Alternativa ao gateway LiteLLM, selecionável por LLM_PROVIDER=anthropic.
 * Notas de compatibilidade com a família Opus 4.x:
 * - NÃO enviamos `temperature` (Opus 4.8/4.7 rejeitam com 400).
 * - JSON é garantido pelo prompt (que exige "somente JSON") + parse defensivo
 *   no use case; não usamos structured outputs aqui para manter simples.
 */
export class AnthropicClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  get model(): string {
    return this.config.model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.config.apiKey) {
      throw new Error('ANTHROPIC_API_KEY ausente — não é possível classificar.');
    }

    const startedAt = performance.now();
    const message = await this.client.messages.create({
      model: this.config.model,
      max_tokens: req.maxTokens ?? 8192,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    // Concatena os blocos de texto da resposta.
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      model: message.model,
      latencyMs,
      tokensInput: message.usage?.input_tokens ?? null,
      tokensOutput: message.usage?.output_tokens ?? null,
      raw: message,
    };
  }
}
