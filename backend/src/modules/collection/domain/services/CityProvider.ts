/** Uma praça (cidade + UF) onde a Audax tem Cedente/Sacado. */
export interface City {
  cidade: string;
  uf: string;
}

/**
 * Fonte da lista de cidades a monitorar para desastres climáticos. A
 * implementação lê de um banco EXTERNO (SQL Server) via query configurável.
 * O domínio depende só desta porta.
 */
export interface CityProvider {
  /** Cidades com exposição (já filtradas/ordenadas pela query). Vazio = desligado. */
  getCities(): Promise<City[]>;
}
