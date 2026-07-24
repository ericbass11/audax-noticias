import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatLlmClient,
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  LlmClient,
} from './LlmClient.js';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

/**
 * Cliente que chama o Claude (Anthropic) DIRETO, via SDK oficial.
 *
 * Alternativa ao gateway LiteLLM, selecionável por LLM_PROVIDER=anthropic.
 * Notas de compatibilidade:
 * - NÃO enviamos `temperature` (Opus 4.8/4.7 e Sonnet 5 rejeitam com 400).
 * - Sonnet 5 / Opus 4.x ligam ADAPTIVE THINKING por padrão quando `thinking`
 *   é omitido; mantemos DESLIGADO para preservar custo/latência e não truncar
 *   respostas curtas (ex.: chat) — o pipeline quer JSON determinístico, não
 *   raciocínio caro. Haiku/older ignoram (omitir já é sem thinking); Fable
 *   rejeitaria `disabled`, por isso só enviamos aos modelos que o aceitam.
 * - JSON é garantido pelo prompt (que exige "somente JSON") + parse defensivo
 *   no use case; não usamos structured outputs aqui para manter simples.
 */
export class AnthropicClient implements LlmClient, ChatLlmClient {
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  get model(): string {
    return this.config.model;
  }

  /** Desliga o thinking nos modelos que o ligam por padrão (Sonnet 5 / Opus 4.x). */
  private thinkingOff(): { thinking: { type: 'disabled' } } | Record<string, never> {
    return /^claude-(sonnet-5|opus-4-)/.test(this.config.model)
      ? { thinking: { type: 'disabled' } }
      : {};
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.config.apiKey) {
      throw new Error('ANTHROPIC_API_KEY ausente — não é possível classificar.');
    }

    const startedAt = performance.now();
    const message = await this.client.messages.create({
      model: this.config.model,
      max_tokens: req.maxTokens ?? 8192,
      ...this.thinkingOff(),
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

  /** Chat com streaming: emite cada trecho de texto via onToken. */
  async streamChat(
    system: string,
    messages: ChatMessage[],
    onToken: (text: string) => void,
  ): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('ANTHROPIC_API_KEY ausente — não é possível conversar.');
    }
    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: 1024,
      ...this.thinkingOff(),
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    stream.on('text', (text) => onToken(text));
    await stream.finalMessage();
  }
}
