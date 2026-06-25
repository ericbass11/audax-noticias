import type { Classification } from '../entities/Classification.js';

export interface ClassificationRepository {
  /**
   * Persiste um lote de classificações. Antes de inserir, marca como
   * `is_current = false` as classificações anteriores dos mesmos artigos,
   * de modo que a recém-inserida vire a vigente (trilha de versões mantida).
   */
  saveBatch(classifications: Classification[]): Promise<Classification[]>;

  findCurrentByArticleIds(articleIds: string[]): Promise<Map<string, Classification>>;
}
