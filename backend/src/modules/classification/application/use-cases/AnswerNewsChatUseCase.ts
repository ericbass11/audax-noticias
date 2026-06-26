import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import type { ArticleAnalysisRepository } from '../../domain/repositories/ArticleAnalysisRepository.js';
import type { ChatLlmClient, ChatMessage } from '../../infrastructure/llm/LlmClient.js';
import { buildChatSystemPrompt } from '../../infrastructure/llm/prompts/chatPrompt.js';

export class ArticleNotFoundError extends Error {}

/**
 * AnswerNewsChatUseCase — responde, em streaming, perguntas sobre UMA notícia,
 * com a IA ancorada no corpo do artigo + na análise por área já gerada.
 */
export class AnswerNewsChatUseCase {
  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly classificationRepository: ClassificationRepository,
    private readonly analysisRepository: ArticleAnalysisRepository,
    private readonly chat: ChatLlmClient,
  ) {}

  async execute(
    articleId: string,
    messages: ChatMessage[],
    onToken: (text: string) => void,
  ): Promise<void> {
    const article = await this.articleRepository.findById(articleId);
    if (!article) throw new ArticleNotFoundError(`Notícia ${articleId} não encontrada.`);

    const analysis = await this.analysisRepository.findCurrentByArticleId(articleId);
    const classifications = await this.classificationRepository.findCurrentByArticleIds([articleId]);
    const cls = classifications.get(articleId);

    const system = buildChatSystemPrompt({
      title: article.title,
      source: article.source,
      category: cls?.category ?? article.rawCategory ?? null,
      impact: cls?.impact ?? null,
      executiveSummary: analysis?.executiveSummary ?? '',
      areas: (analysis?.areas ?? {}) as Record<string, string>,
      actions: analysis?.actions ?? [],
      body: analysis?.sourceText ?? article.summary ?? null,
    });

    // Mantém só os últimos turnos para limitar tokens; sanitiza papéis.
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .slice(-12);

    await this.chat.streamChat(system, history, onToken);
  }
}
