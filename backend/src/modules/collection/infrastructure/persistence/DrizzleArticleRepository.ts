import { and, desc, eq, gte, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/database/client.js';
import { newsArticles } from '../../../../infrastructure/database/schema.js';
import { Article } from '../../domain/entities/Article.js';
import type {
  ArticleListFilter,
  ArticleRepository,
  ArticleTitleRef,
  RecentSurfacedQuery,
  RecentUnsurfacedQuery,
} from '../../domain/repositories/ArticleRepository.js';
import { ArticleMapper } from '../mappers/ArticleMapper.js';

const SAO_PAULO = 'America/Sao_Paulo';

export class DrizzleArticleRepository implements ArticleRepository {
  constructor(private readonly db: Database) {}

  async saveNew(articles: Article[]): Promise<Article[]> {
    if (articles.length === 0) return [];

    // ON CONFLICT (content_hash) DO NOTHING — só insere o que ainda não existe.
    const rows = await this.db
      .insert(newsArticles)
      .values(articles.map(ArticleMapper.toInsert))
      .onConflictDoNothing({ target: newsArticles.contentHash })
      .returning();

    return rows.map(ArticleMapper.toDomain);
  }

  async findExistingHashes(hashes: string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const rows = await this.db
      .select({ contentHash: newsArticles.contentHash })
      .from(newsArticles)
      .where(inArray(newsArticles.contentHash, hashes));
    return new Set(rows.map((r) => r.contentHash));
  }

  async findById(id: string): Promise<Article | null> {
    const rows = await this.db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
    return rows[0] ? ArticleMapper.toDomain(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<Article[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(newsArticles).where(inArray(newsArticles.id, ids));
    return rows.map(ArticleMapper.toDomain);
  }

  async updateImage(id: string, imageUrl: string): Promise<void> {
    await this.db.update(newsArticles).set({ imageUrl }).where(eq(newsArticles.id, id));
  }

  async list(filter: ArticleListFilter): Promise<Article[]> {
    const conditions = [];
    if (filter.date) {
      // Compara a data de publicação no fuso de São Paulo com o dia pedido.
      conditions.push(
        sql`(${newsArticles.publishedAt} AT TIME ZONE ${SAO_PAULO})::date = ${filter.date}::date`,
      );
    }
    if (filter.category) {
      conditions.push(eq(newsArticles.rawCategory, filter.category));
    }

    const rows = await this.db
      .select()
      .from(newsArticles)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(newsArticles.publishedAt))
      .limit(filter.limit ?? 200);

    return rows.map(ArticleMapper.toDomain);
  }

  async markSurfaced(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // Só marca quem ainda não tinha surfaced_at → idempotente (preserva a data
    // da PRIMEIRA exposição, que é o que interessa ao dedup histórico).
    await this.db
      .update(newsArticles)
      .set({ surfacedAt: new Date() })
      .where(and(inArray(newsArticles.id, ids), isNull(newsArticles.surfacedAt)));
  }

  async findRecentSurfaced(query: RecentSurfacedQuery): Promise<ArticleTitleRef[]> {
    const cutoff = new Date(Date.now() - query.sinceDays * 24 * 60 * 60 * 1000);
    const conditions = [
      eq(newsArticles.track, query.track),
      gte(newsArticles.collectedAt, cutoff),
      // Só as que JÁ foram surfadas (expostas no portal/digest) na janela.
      isNotNull(newsArticles.surfacedAt),
      gte(newsArticles.surfacedAt, cutoff),
    ];
    if (query.excludeIds.length > 0) {
      conditions.push(notInArray(newsArticles.id, query.excludeIds));
    }

    const rows = await this.db
      .select({ id: newsArticles.id, title: newsArticles.title })
      .from(newsArticles)
      .where(and(...conditions))
      .orderBy(desc(newsArticles.collectedAt))
      .limit(query.limit);

    return rows;
  }

  async findRecentUnsurfacedByHost(query: RecentUnsurfacedQuery): Promise<Article[]> {
    const host = query.host.trim().toLowerCase().replace(/^\.+/, '');
    if (host.length === 0) return [];
    const cutoff = new Date(Date.now() - query.sinceDays * 24 * 60 * 60 * 1000);

    const rows = await this.db
      .select()
      .from(newsArticles)
      .where(
        and(
          eq(newsArticles.track, query.track),
          isNull(newsArticles.surfacedAt),
          isNotNull(newsArticles.publishedAt),
          gte(newsArticles.publishedAt, cutoff),
          // Host exato ou subdomínio — não casa 'outrofidcnews.com.br'.
          sql`(
            ${newsArticles.url} ILIKE ${`%://${host}/%`}
            OR ${newsArticles.url} ILIKE ${`%.${host}/%`}
          )`,
        ),
      )
      .orderBy(desc(newsArticles.publishedAt))
      .limit(query.limit);

    return rows.map(ArticleMapper.toDomain);
  }
}
