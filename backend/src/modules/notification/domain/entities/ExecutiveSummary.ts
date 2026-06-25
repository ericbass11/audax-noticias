export interface SummaryArticleRef {
  articleId: string;
  rank: number;
}

export interface ExecutiveSummaryProps {
  id?: string;
  runId: string;
  periodKey: string;
  content: string;
  articleRefs: SummaryArticleRef[];
  createdAt?: Date;
}

/**
 * ExecutiveSummary — o resumo consolidado do turno, já pronto para disparo.
 * É persistido ANTES de qualquer envio: se o WhatsApp falhar, o dado já está
 * salvo e a interface já mostra. `periodKey` único garante idempotência.
 */
export class ExecutiveSummary {
  readonly id?: string;
  readonly runId: string;
  readonly periodKey: string;
  readonly content: string;
  readonly articleRefs: SummaryArticleRef[];
  readonly createdAt?: Date;

  constructor(props: ExecutiveSummaryProps) {
    this.id = props.id;
    this.runId = props.runId;
    this.periodKey = props.periodKey;
    this.content = props.content;
    this.articleRefs = props.articleRefs;
    this.createdAt = props.createdAt;
  }
}
