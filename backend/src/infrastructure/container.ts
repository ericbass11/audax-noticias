import { env } from './config/env.js';
import { db } from './database/client.js';

// Collection
import { DrizzleArticleRepository } from '../modules/collection/infrastructure/persistence/DrizzleArticleRepository.js';
import { GNewsClient } from '../modules/collection/infrastructure/sources/GNewsClient.js';
import { RssClient } from '../modules/collection/infrastructure/sources/RssClient.js';
import { SerpApiClient } from '../modules/collection/infrastructure/sources/SerpApiClient.js';
import type { NewsSource } from '../modules/collection/infrastructure/sources/NewsSource.js';
import { CollectNewsUseCase } from '../modules/collection/application/use-cases/CollectNewsUseCase.js';
import { CollectDisasterUseCase } from '../modules/collection/application/use-cases/CollectDisasterUseCase.js';
import { SqlServerCityProvider } from '../modules/collection/infrastructure/db/SqlServerCityProvider.js';

// Classification
import { DrizzleClassificationRepository } from '../modules/classification/infrastructure/persistence/DrizzleClassificationRepository.js';
import { DrizzleArticleAnalysisRepository } from '../modules/classification/infrastructure/persistence/DrizzleArticleAnalysisRepository.js';
import { DrizzleAuditRepository } from '../modules/classification/infrastructure/persistence/DrizzleAuditRepository.js';
import { ArticleContentFetcher } from '../modules/classification/infrastructure/content/ArticleContentFetcher.js';
import { AuditLogger } from '../modules/classification/infrastructure/audit/AuditLogger.js';
import { LiteLLMClient } from '../modules/classification/infrastructure/llm/LiteLLMClient.js';
import { AnthropicClient } from '../modules/classification/infrastructure/llm/AnthropicClient.js';
import type { LlmClient } from '../modules/classification/infrastructure/llm/LlmClient.js';
import { TriageArticlesUseCase } from '../modules/classification/application/use-cases/TriageArticlesUseCase.js';
import { TRIAGE_FIDC_SYSTEM_PROMPT, TRIAGE_DISASTER_SYSTEM_PROMPT } from '../modules/classification/infrastructure/llm/prompts/triagePrompt.js';
import { ClassifyArticlesUseCase } from '../modules/classification/application/use-cases/ClassifyArticlesUseCase.js';
import { GenerateSummaryUseCase } from '../modules/classification/application/use-cases/GenerateSummaryUseCase.js';
import { GenerateArticleAnalysisUseCase } from '../modules/classification/application/use-cases/GenerateArticleAnalysisUseCase.js';
import { DedupeWatchlistUseCase, DEDUPE_NEWS_SYSTEM } from '../modules/classification/application/use-cases/DedupeWatchlistUseCase.js';
import { DedupeAgainstHistoryUseCase } from '../modules/classification/application/use-cases/DedupeAgainstHistoryUseCase.js';
import { AnswerNewsChatUseCase } from '../modules/classification/application/use-cases/AnswerNewsChatUseCase.js';

// Notification
import { DrizzleSummaryRepository } from '../modules/notification/infrastructure/persistence/DrizzleSummaryRepository.js';
import { DrizzleDispatchRepository } from '../modules/notification/infrastructure/persistence/DrizzleDispatchRepository.js';
import { EvolutionApiClient } from '../modules/notification/infrastructure/whatsapp/EvolutionApiClient.js';
import { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';
import { ResendSummaryUseCase } from '../modules/notification/application/use-cases/ResendSummaryUseCase.js';

// Shared + orchestration
import { DrizzleProcessingRunRepository } from '../modules/shared/infrastructure/DrizzleProcessingRunRepository.js';
import { RunNewsCycleUseCase } from '../application/RunNewsCycleUseCase.js';
import { DispatchTrackDigestUseCase } from '../application/DispatchTrackDigestUseCase.js';
import { DispatchCommodityQuotesUseCase } from '../application/DispatchCommodityQuotesUseCase.js';
import { CommodityQuotesFetcher } from '../modules/market/CommodityQuotesFetcher.js';
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
  const analysisRepository = new DrizzleArticleAnalysisRepository(db);
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
    new SerpApiClient({
      apiKey: env.SERPAPI_API_KEY,
      baseUrl: env.SERPAPI_BASE_URL,
      gl: env.SERPAPI_GL,
      hl: env.SERPAPI_HL,
      queries: env.serpapiQueries,
      delayMs: env.SERPAPI_DELAY_MS,
      maxRetries: env.SERPAPI_MAX_RETRIES,
    }),
    new RssClient(env.rssFeeds),
  ];

  // Rota de vigilância regulatória (ex.: ANVISA) — só SerpAPI, queries próprias.
  const watchlistSources: NewsSource[] = [
    new SerpApiClient({
      apiKey: env.SERPAPI_API_KEY,
      baseUrl: env.SERPAPI_BASE_URL,
      gl: env.SERPAPI_GL,
      hl: env.SERPAPI_HL,
      queries: env.watchlistQueries,
      delayMs: env.SERPAPI_DELAY_MS,
      maxRetries: env.SERPAPI_MAX_RETRIES,
    }),
  ];

  // Rota de mercado FIDC/factoring/securitização + regulação — só SerpAPI.
  const fidcSources: NewsSource[] = [
    new SerpApiClient({
      apiKey: env.SERPAPI_API_KEY,
      baseUrl: env.SERPAPI_BASE_URL,
      gl: env.SERPAPI_GL,
      hl: env.SERPAPI_HL,
      queries: env.fidcQueries,
      delayMs: env.SERPAPI_DELAY_MS,
      maxRetries: env.SERPAPI_MAX_RETRIES,
    }),
  ];

  // --- LLM + auditoria ---
  // Seleciona o provedor por env: Anthropic direto ou gateway LiteLLM.
  const llm: LlmClient =
    env.LLM_PROVIDER === 'anthropic'
      ? new AnthropicClient({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL })
      : new LiteLLMClient({
          baseUrl: env.LITELLM_BASE_URL,
          apiKey: env.LITELLM_API_KEY,
          model: env.LITELLM_MODEL,
        });
  console.log(
    `🧠 LLM provider: ${env.LLM_PROVIDER} (modelo: ${
      env.LLM_PROVIDER === 'anthropic' ? env.ANTHROPIC_MODEL : env.LITELLM_MODEL
    })`,
  );

  // Cliente de TRIAGEM (modelo leve/barato). Com Anthropic, usa TRIAGE_MODEL;
  // no gateway LiteLLM, reaproveita o mesmo cliente/modelo configurado.
  const triageLlm: LlmClient =
    env.LLM_PROVIDER === 'anthropic'
      ? new AnthropicClient({ apiKey: env.ANTHROPIC_API_KEY, model: env.TRIAGE_MODEL })
      : llm;
  if (env.LLM_PROVIDER === 'anthropic') {
    console.log(`🔎 Triagem (modelo leve): ${env.TRIAGE_MODEL}`);
  }
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
  const collectNews = new CollectNewsUseCase(
    sources,
    articleRepository,
    env.COLLECT_MAX_AGE_HOURS,
    [
      {
        track: 'watchlist',
        sources: watchlistSources,
        maxAgeHours: env.WATCHLIST_MAX_AGE_DAYS * 24,
        maxItems: env.WATCHLIST_MAX_ITEMS,
      },
      {
        track: 'fidc',
        sources: fidcSources,
        maxAgeHours: env.FIDC_MAX_AGE_DAYS * 24,
        maxItems: env.FIDC_MAX_ITEMS,
      },
    ],
  );
  const triageArticles = new TriageArticlesUseCase(
    articleRepository,
    triageLlm,
    auditLogger,
    env.LLM_BATCH_SIZE,
    env.TRIAGE_MIN_SCORE,
    env.TRIAGE_MAX_TO_CLASSIFY,
  );
  // Triagem de relevância da rota FIDC (tese ampliada: segmento + juros/BC/geo).
  const fidcTriage = new TriageArticlesUseCase(
    articleRepository,
    triageLlm,
    auditLogger,
    env.LLM_BATCH_SIZE,
    env.TRIAGE_MIN_SCORE,
    env.FIDC_MAX_ANALYZE,
    TRIAGE_FIDC_SYSTEM_PROMPT,
  );

  // Trilha de DESASTRES climáticos: cidades com Cedente/Sacado vêm de um SQL
  // Server EXTERNO (desligável — sem server/query, não roda). Busca por cidade
  // no SerpAPI (fonte construída em runtime com as queries dinâmicas).
  const cityProvider = new SqlServerCityProvider({
    server: env.DISASTER_DB_SERVER,
    port: env.DISASTER_DB_PORT,
    database: env.DISASTER_DB_DATABASE,
    user: env.DISASTER_DB_USER,
    password: env.DISASTER_DB_PASSWORD,
    encrypt: env.DISASTER_DB_ENCRYPT,
    trustServerCertificate: env.DISASTER_DB_TRUST_CERT,
    query: env.DISASTER_CITIES_QUERY,
    maxCities: env.DISASTER_MAX_CITIES,
  });
  const collectDisaster = new CollectDisasterUseCase(
    cityProvider,
    (queries) =>
      new SerpApiClient({
        apiKey: env.SERPAPI_API_KEY,
        baseUrl: env.SERPAPI_BASE_URL,
        gl: env.SERPAPI_GL,
        hl: env.SERPAPI_HL,
        queries,
        delayMs: env.SERPAPI_DELAY_MS,
        maxRetries: env.SERPAPI_MAX_RETRIES,
      }),
    articleRepository,
    { terms: env.disasterQueryTerms, maxAgeHours: env.DISASTER_MAX_AGE_HOURS },
  );
  // Triagem da rota de desastres (confirma desastre real/recente; teto próprio).
  const disasterTriage = new TriageArticlesUseCase(
    articleRepository,
    triageLlm,
    auditLogger,
    env.LLM_BATCH_SIZE,
    env.TRIAGE_MIN_SCORE,
    env.DISASTER_MAX_ANALYZE,
    TRIAGE_DISASTER_SYSTEM_PROMPT,
  );
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
    env.WEB_APP_URL,
    env.SUMMARY_MIN_RELEVANCE,
    env.SUMMARY_MAX_ITEMS,
  );
  // Análise profunda (portal): lê o corpo do artigo e gera impacto por área.
  const contentFetcher = new ArticleContentFetcher();
  const generateArticleAnalysis = new GenerateArticleAnalysisUseCase(
    articleRepository,
    classificationRepository,
    contentFetcher,
    analysisRepository,
    llm,
    auditLogger,
  );
  // Cura da watchlist (agrupa o mesmo evento) — usa o modelo leve da triagem.
  const dedupeWatchlist = new DedupeWatchlistUseCase(articleRepository, triageLlm, auditLogger);
  // Cura do fluxo 'news' (mesma história em vários veículos) — mesmo mecanismo,
  // prompt genérico de "mesmo acontecimento".
  const dedupeNews = new DedupeWatchlistUseCase(
    articleRepository,
    triageLlm,
    auditLogger,
    DEDUPE_NEWS_SYSTEM,
    'notícias',
  );
  // Dedup contra o histórico (não reenviar a mesma história em dias diferentes).
  const dedupeHistory = new DedupeAgainstHistoryUseCase(articleRepository, triageLlm, auditLogger);

  // Chat do portal (streaming) — sempre via Anthropic direto.
  const chatLlm = new AnthropicClient({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  const answerNewsChat = new AnswerNewsChatUseCase(
    articleRepository,
    classificationRepository,
    analysisRepository,
    chatLlm,
  );
  const dispatchSummary = new DispatchSummaryUseCase(
    summaryRepository,
    dispatchRepository,
    whatsapp,
    env.evolutionRecipients,
  );
  const resendSummary = new ResendSummaryUseCase(summaryRepository, dispatchSummary);

  // 2º fluxo (mercado FIDC): digest próprio + destinatário separado.
  const dispatchTrackDigest = new DispatchTrackDigestUseCase(
    articleRepository,
    summaryRepository,
    dispatchSummary,
  );
  const fidcRecipients = env.evolutionRecipientsFidc.length
    ? env.evolutionRecipientsFidc
    : env.evolutionRecipients;

  // 3º fluxo: boletim de cotações de commodities (SOJA/MILHO/CAFÉ/BOI GORDO).
  const dispatchCommodityQuotes = new DispatchCommodityQuotesUseCase(
    new CommodityQuotesFetcher(),
    whatsapp,
    env.evolutionRecipientsCommodities.length
      ? env.evolutionRecipientsCommodities
      : env.evolutionRecipients,
  );

  const runNewsCycle = new RunNewsCycleUseCase(
    runRepository,
    collectNews,
    triageArticles,
    fidcTriage,
    classifyArticles,
    generateSummary,
    generateArticleAnalysis,
    dedupeWatchlist,
    dedupeNews,
    dedupeHistory,
    summaryRepository,
    dispatchSummary,
    dispatchTrackDigest,
    dispatchCommodityQuotes,
    fidcRecipients,
    env.WHATSAPP_INCLUDE_WATCHLIST,
    collectDisaster,
    disasterTriage,
    env.INCLUDE_DISASTER_IN_SUMMARY,
    env.DISASTER_MAX_ITEMS,
  );

  const newsFeedQuery = new NewsFeedQuery(db);

  return {
    repositories: {
      articleRepository,
      classificationRepository,
      analysisRepository,
      summaryRepository,
      dispatchRepository,
      runRepository,
    },
    queries: { newsFeedQuery },
    useCases: { runNewsCycle, resendSummary, dispatchSummary, answerNewsChat },
  };
}

export type Container = ReturnType<typeof buildContainer>;
