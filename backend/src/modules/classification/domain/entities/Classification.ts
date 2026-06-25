import type { Impact } from '../value-objects/Impact.js';

export interface ClassificationProps {
  id?: string;
  articleId: string;
  impact: Impact;
  relevance: number; // 0..100
  category: string;
  justification: string; // por que afeta uma FIDC de recebíveis agro
  model: string;
  promptVersion: string;
  isCurrent?: boolean;
  createdAt?: Date;
}

/**
 * Classification — resultado do scoring por LLM de uma notícia.
 *
 * Vive separada de Article: uma notícia pode ter várias classificações ao
 * longo do tempo (reprocesso com prompt/modelo novos). `isCurrent` marca a
 * vigente para leitura rápida na interface.
 */
export class Classification {
  readonly id?: string;
  readonly articleId: string;
  readonly impact: Impact;
  readonly relevance: number;
  readonly category: string;
  readonly justification: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly isCurrent: boolean;
  readonly createdAt?: Date;

  constructor(props: ClassificationProps) {
    this.id = props.id;
    this.articleId = props.articleId;
    this.impact = props.impact;
    this.relevance = props.relevance;
    this.category = props.category;
    this.justification = props.justification;
    this.model = props.model;
    this.promptVersion = props.promptVersion;
    this.isCurrent = props.isCurrent ?? true;
    this.createdAt = props.createdAt;
  }
}
