/**
 * Script de teste de captura — roda as fontes de notícia de forma isolada,
 * SEM precisar de Postgres/Redis. Útil para validar credenciais e ver o que
 * cada fonte retorna já normalizado.
 *
 * Uso (a partir de backend/):
 *   node --env-file=../.env --import tsx src/scripts/test-capture.ts
 *   # equivalente via script: pnpm test:capture
 *
 * Flags:
 *   --limit=N     mostra no máx N itens por fonte (default 5)
 *   --classify    além de coletar, faz UMA chamada de classificação no LiteLLM
 *                 com os primeiros itens (testa conectividade + parsing)
 *   --json        imprime o array normalizado completo em JSON no final
 *
 * Lê as variáveis direto de process.env (não passa pela validação do env.ts),
 * então funciona mesmo sem DATABASE_URL/REDIS_URL configurados.
 */
import { GNewsClient } from '../modules/collection/infrastructure/sources/GNewsClient.js';
import { RssClient } from '../modules/collection/infrastructure/sources/RssClient.js';
import type { NewsSource } from '../modules/collection/infrastructure/sources/NewsSource.js';
import type { NormalizedArticleInput } from '../modules/collection/domain/entities/Article.js';
import { Article } from '../modules/collection/domain/entities/Article.js';
import { DeduplicationService } from '../modules/collection/domain/services/DeduplicationService.js';
import { LiteLLMClient } from '../modules/classification/infrastructure/llm/LiteLLMClient.js';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationUserPrompt,
} from '../modules/classification/infrastructure/llm/prompts/classificationPrompt.js';

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found?.split('=')[1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const LIMIT = Number(arg('limit') ?? 5);

function previewItem(a: NormalizedArticleInput) {
  return {
    título: a.title.slice(0, 100),
    fonte: a.source,
    categoria_bruta: a.rawCategory,
    publicado: a.publishedAt ? a.publishedAt.toISOString() : null,
    url: a.url,
  };
}

async function runSource(source: NewsSource): Promise<NormalizedArticleInput[]> {
  process.stdout.write(`\n🔎 Fonte: ${source.name} ... `);
  const started = Date.now();
  try {
    const items = await source.fetch();
    console.log(`${items.length} item(s) em ${Date.now() - started}ms`);
    if (items.length > 0) {
      console.table(items.slice(0, LIMIT).map(previewItem));
    }
    return items;
  } catch (err) {
    console.log(`ERRO: ${(err as Error).message}`);
    return [];
  }
}

async function maybeClassify(items: NormalizedArticleInput[]): Promise<void> {
  if (!flag('classify')) return;

  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_MODEL ?? 'claude-opus-4-8';
  if (!baseUrl || !apiKey) {
    console.log('\n⚠️  --classify pedido, mas LITELLM_BASE_URL/LITELLM_API_KEY não definidos. Pulando.');
    return;
  }

  console.log('\n🤖 Testando classificação no LiteLLM (1 chamada)...');
  const llm = new LiteLLMClient({ baseUrl, apiKey, model });

  // Atribui ids sintéticos só para o teste (no fluxo real vêm do banco).
  const sample = items.slice(0, Math.min(LIMIT, items.length)).map((a, i) => ({
    id: `test-${i + 1}`,
    title: a.title,
    summary: a.summary,
    source: a.source,
    rawCategory: a.rawCategory,
  }));

  try {
    const completion = await llm.complete({
      system: CLASSIFICATION_SYSTEM_PROMPT,
      user: buildClassificationUserPrompt(sample),
      jsonMode: true,
    });
    console.log(`   modelo=${completion.model} latência=${completion.latencyMs}ms tokens_in=${completion.tokensInput} tokens_out=${completion.tokensOutput}`);
    console.log('   resposta crua:');
    console.log(completion.text);
    try {
      const parsed = JSON.parse(completion.text);
      console.log('\n   ✅ JSON parseado com sucesso. Resultados:');
      console.table((parsed.resultados ?? parsed) as unknown[]);
    } catch {
      console.log('\n   ⚠️  Não foi possível fazer JSON.parse direto (o safeParse do pipeline ainda tentaria limpar cercas).');
    }
  } catch (err) {
    console.log(`   ❌ Falha na chamada ao LiteLLM: ${(err as Error).message}`);
  }
}

/**
 * Em ambientes que exigem proxy de saída (ex.: sandbox CI), roteia o `fetch`
 * global pelo HTTPS_PROXY. Em máquina local sem proxy, é um no-op — então não
 * afeta o uso normal.
 */
async function setupProxyIfNeeded(): Promise<void> {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy) return;
  try {
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log(`(usando proxy de saída: ${proxy})`);
  } catch {
    // undici é devDependency; se ausente, segue sem proxy.
  }
}

async function main(): Promise<void> {
  console.log('=== Teste de captura de dados (GNews + RSS) ===');
  await setupProxyIfNeeded();

  const sources: NewsSource[] = [
    new GNewsClient({
      apiKey: process.env.GNEWS_API_KEY ?? '',
      baseUrl: process.env.GNEWS_BASE_URL ?? 'https://gnews.io/api/v4',
      country: process.env.GNEWS_COUNTRY ?? 'br',
      lang: process.env.GNEWS_LANG ?? 'pt',
      queries: csv(process.env.GNEWS_QUERIES),
    }),
    new RssClient(csv(process.env.RSS_FEEDS)),
  ];

  const collected: NormalizedArticleInput[] = [];
  for (const source of sources) {
    collected.push(...(await runSource(source)));
  }

  // Dedup igual ao pipeline real (hash de título normalizado + url).
  const articles = collected
    .filter((n) => n.title && n.url)
    .map((n) => Article.fromNormalized(n));
  const unique = new DeduplicationService().dedupeWithinBatch(articles);

  console.log('\n=== Resumo ===');
  console.log(`Total coletado:        ${collected.length}`);
  console.log(`Válidos (título+url):  ${articles.length}`);
  console.log(`Únicos após dedup:     ${unique.length}`);
  console.log(`Duplicados removidos:  ${articles.length - unique.length}`);

  await maybeClassify(collected);

  if (flag('json')) {
    console.log('\n=== JSON normalizado completo ===');
    console.log(JSON.stringify(collected, null, 2));
  }

  if (collected.length === 0) {
    console.log(
      '\nℹ️  Nenhum item coletado. Verifique GNEWS_API_KEY / GNEWS_QUERIES e RSS_FEEDS no .env.',
    );
  }
}

main().catch((err) => {
  console.error('❌ Erro no teste de captura:', err);
  process.exit(1);
});
