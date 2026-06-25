import { env } from './config/env.js';
import { db } from './database/client.js';

// Collection
import { DrizzleArticleRepository } from '../modules/collection/infrastructure/persistence/DrizzleArticleRepository.js';
import { GNewsClient } from '../modules/collection/infrastructure/sources/GNewsClient.js';
import { RssClient } from '../modules/collection/infrastructure/sources/RssClient.js';
import type { NewsSource } from '../modules/collection/infrastructure/sources/NewsSource.js';
import { CollectNewsUseCase } from '../modules/collection/application/use-cases/CollectNewsUseCase.js';

// Classification
import { DrizzleClassificationRepository } from '../modules/classification/infrastructure/persistence/DrizzleClassificationRepository.js';
import { DrizzleAuditRepository } from '../modules/classification/infrastructure/persistence/DrizzleAuditRepository.js';
import { AuditLogger } from '../modules/classification/infrastructure/audit/AuditLogger.js';
import { LiteLLMClient } from '../modules/classification/infrastructure/llm/LiteLLMClient.js';
import { ClassifyArticlesUseCase } from '../modules/classification/application/use-cases/ClassifyArticlesUseCase.js';
import { GenerateSummaryUseCase } from '../modules/classification/application/use-cases/GenerateSummaryUseCase.js';

// Notification
import { DrizzleSummaryRepository } from '../modules/notification/infrastructure/persistence/DrizzleSummaryRepository.js';
import { DrizzleDispatchRepository } from '../modules/notification/infrastructure/persistence/DrizzleDispatchRepository.js';
import { EvolutionApiClient } from '../modules/notification/infrastructure/whatsapp/EvolutionApiClient.js';
import { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';
import { ResendSummaryUseCase } from '../modules/notification/application/use-cases/ResendSummaryUseCase.js';

// Shared + orchestration
import { DrizzleProcessingRunRepository } from '../modules/shared/infrastructure/DrizzleProcessingRunRepository.js';
import { RunNewsCycleUseCase } from '../application/RunNewsCycleUseCase.js';
import { NewsFeedQuery } from '../application/queries/NewsFeedQuery.js';

/**
 * Composition root: instancia e injeta todas as dependências (DDD wiring).
 * É o único lugar que conhece classes concretas de infraestrutura; o resto
 * do código depende apenas de interfaces de domínio.
 */
export function buildContainer() {
  // --- Repositórios ---
  const articleRepository = new DrizzleArticleRepository(db);
  const classificationRepository = new DrizzleClassificationRepository(db);
  const auditRepository = new DrizzleAuditRepository(db);
  const summaryRepository = new DrizzleSummaryRepository(db);
  const dispatchRepository = new DrizzleDispatchRepository(db);
  const runRepository = new DrizzleProcessingRunRepository(db);

  // --- Fontes de notícia (isoladas atrás de NewsSource) ---
  const sources: NewsSource[] = [
    new GNewsClient({
      apiKey: env.GNEWS_API_KEY,
      baseUrl: env.GNEWS_BASE_URL,
      country: env.GNEWS_COUNTRY,
      lang: env.GNEWS_LANG,
      queries: env.gnewsQueries,
    }),
    new RssClient(env.rssFeeds),
  ];

  // --- LLM + auditoria ---
  const llm = new LiteLLMClient({
    baseUrl: env.LITELLM_BASE_URL,
    apiKey: env.LITELLM_API_KEY,
    model: env.LITELLM_MODEL,
  });
  const auditLogger = new AuditLogger(auditRepository, {
    enabled: env.LANGFUSE_ENABLED,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
  });

  // --- WhatsApp ---
  const whatsapp = new EvolutionApiClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    instance: env.EVOLUTION_INSTANCE,
    apiKey: env.EVOLUTION_API_KEY,
    enabled: env.WHATSAPP_DISPATCH_ENABLED,
  });

  // --- Use cases ---
  const collectNews = new CollectNewsUseCase(sources, articleRepository);
  const classifyArticles = new ClassifyArticlesUseCase(
    articleRepository,
    classificationRepository,
    llm,
    auditLogger,
    env.LLM_BATCH_SIZE,
  );
  const generateSummary = new GenerateSummaryUseCase(
    articleRepository,
    classificationRepository,
    llm,
    auditLogger,
    env.WEB_APP_URL,
  );
  const dispatchSummary = new DispatchSummaryUseCase(
    summaryRepository,
    dispatchRepository,
    whatsapp,
    env.evolutionRecipients,
  );
  const resendSummary = new ResendSummaryUseCase(summaryRepository, dispatchSummary);

  const runNewsCycle = new RunNewsCycleUseCase(
    runRepository,
    collectNews,
    classifyArticles,
    generateSummary,
    summaryRepository,
    dispatchSummary,
  );

  const newsFeedQuery = new NewsFeedQuery(db);

  return {
    repositories: {
      articleRepository,
      classificationRepository,
      summaryRepository,
      dispatchRepository,
      runRepository,
    },
    queries: { newsFeedQuery },
    useCases: { runNewsCycle, resendSummary, dispatchSummary },
  };
}

export type Container = ReturnType<typeof buildContainer>;
