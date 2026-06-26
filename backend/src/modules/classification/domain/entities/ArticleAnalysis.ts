/** Impacto da notícia por área de negócio da Audax Capital. */
export interface ArticleAnalysisAreas {
  comercial?: string;
  cobranca?: string;
  operacoes?: string;
  risco?: string;
  compliance?: string;
}

export interface ArticleAnalysisProps {
  id?: string;
  articleId: string;
  /** true se a análise leu o corpo do artigo; false = só título/resumo. */
  sourceRead: boolean;
  sourceChars?: number | null;
  /** Corpo extraído do artigo (para embasar o chat); null se não lido. */
  sourceText?: string | null;
  executiveSummary: string;
  areas: ArticleAnalysisAreas;
  actions: string[];
  model: string;
  promptVersion: string;
  isCurrent?: boolean;
  createdAt?: Date;
}

/**
 * ArticleAnalysis — análise profunda de UMA notícia para o portal: resumo
 * executivo, impacto por área (comercial, cobrança, operações, risco,
 * compliance) e ações sugeridas. Versionável (is_current) como a classificação.
 */
export class ArticleAnalysis {
  id?: string;
  readonly articleId: string;
  readonly sourceRead: boolean;
  readonly sourceChars: number | null;
  readonly sourceText: string | null;
  readonly executiveSummary: string;
  readonly areas: ArticleAnalysisAreas;
  readonly actions: string[];
  readonly model: string;
  readonly promptVersion: string;
  readonly isCurrent: boolean;
  readonly createdAt?: Date;

  constructor(props: ArticleAnalysisProps) {
    this.id = props.id;
    this.articleId = props.articleId;
    this.sourceRead = props.sourceRead;
    this.sourceChars = props.sourceChars ?? null;
    this.sourceText = props.sourceText ?? null;
    this.executiveSummary = props.executiveSummary;
    this.areas = props.areas;
    this.actions = props.actions;
    this.model = props.model;
    this.promptVersion = props.promptVersion;
    this.isCurrent = props.isCurrent ?? true;
    this.createdAt = props.createdAt;
  }
}
