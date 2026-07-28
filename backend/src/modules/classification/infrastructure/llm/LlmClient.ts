/**
 * Porta de LLM (interface comum). Permite trocar o provedor — gateway LiteLLM
 * ou Anthropic direto — sem mexer nos use cases de classificação/resumo.
 */
export interface CompletionRequest {
  system: string;
  user: string;
  /** Pede resposta em JSON puro (quando o provedor suporta). */
  jsonMode?: boolean;
  temperature?: number;
  /** Teto de tokens de saída. */
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  latencyMs: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  /** Tokens de cache de prompt (quando o provedor reporta). */
  tokensCacheRead?: number | null;
  tokensCacheWrite?: number | null;
  raw: unknown;
}

export interface LlmClient {
  /** Nome/alias do modelo (para auditoria). */
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Cliente de chat com streaming (token a token), para o chat do portal. */
export interface ChatLlmClient {
  readonly model: string;
  streamChat(
    system: string,
    messages: ChatMessage[],
    onToken: (text: string) => void,
  ): Promise<void>;
}
