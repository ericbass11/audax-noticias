import { ContentHash } from '../value-objects/ContentHash.js';
import type { SourceType } from '../value-objects/ArticleSource.js';

/** Dados normalizados que toda fonte deve produzir (schema único). */
export interface NormalizedArticleInput {
  title: string;
  summary: string | null;
  url: string;
  source: string; // nome legível da fonte, ex.: "Valor Econômico"
  sourceType: SourceType;
  rawCategory: string | null; // categoria_bruta da fonte
  publishedAt: Date | null; // data_publicacao
  imageUrl: string | null; // imagem/thumbnail da notícia (quando a fonte fornece)
}

/** Trilha de coleta: fluxo normal ou vigilância regulatória. */
export type ArticleTrack = 'news' | 'watchlist';

export interface ArticleProps extends NormalizedArticleInput {
  id?: string;
  contentHash: string;
  track?: ArticleTrack;
  collectedAt?: Date;
  runId?: string | null;
}

/**
 * Article — notícia bruta normalizada. Entidade imutável após coleta:
 * o resultado da classificação vive em outra agregação (Classification),
 * permitindo reprocessar o scoring sem tocar na notícia original.
 */
export class Article {
  readonly id?: string;
  readonly title: string;
  readonly summary: string | null;
  readonly url: string;
  readonly source: string;
  readonly sourceType: SourceType;
  readonly rawCategory: string | null;
  readonly publishedAt: Date | null;
  readonly imageUrl: string | null;
  readonly track: ArticleTrack;
  readonly contentHash: string;
  readonly collectedAt?: Date;
  readonly runId?: string | null;

  private constructor(props: ArticleProps) {
    this.id = props.id;
    this.title = props.title;
    this.summary = props.summary;
    this.url = props.url;
    this.source = props.source;
    this.sourceType = props.sourceType;
    this.rawCategory = props.rawCategory;
    this.publishedAt = props.publishedAt;
    this.imageUrl = props.imageUrl;
    this.track = props.track ?? 'news';
    this.contentHash = props.contentHash;
    this.collectedAt = props.collectedAt;
    this.runId = props.runId ?? null;
  }

  /** Cria a partir de dados normalizados, derivando o hash de deduplicação. */
  static fromNormalized(
    input: NormalizedArticleInput,
    runId?: string | null,
    track: ArticleTrack = 'news',
  ): Article {
    const hash = ContentHash.fromTitleAndUrl(input.title, input.url);
    return new Article({ ...input, contentHash: hash.value, runId, track });
  }

  /** Reidrata uma entidade já persistida (usado pelo repositório). */
  static rehydrate(props: ArticleProps): Article {
    return new Article(props);
  }
}
