import sql from 'mssql';
import type { City, CityProvider } from '../../domain/services/CityProvider.js';

export interface SqlServerCityConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  /** Query que retorna colunas `cidade` e `uf` (ordenada por exposição desc). */
  query: string;
  /** Teto de cidades (as N primeiras da query). 0 = sem teto. */
  maxCities: number;
}

/**
 * Lê a lista de cidades (com Cedente/Sacado) de um SQL Server EXTERNO.
 *
 * Desligável e tolerante a falha: sem `server`/`query`, ou em qualquer erro de
 * conexão/consulta, retorna [] — a trilha de desastres simplesmente não roda e
 * o ciclo segue normal. A query é responsabilidade do usuário (conhece o
 * schema) e deve devolver as colunas `cidade` e `uf`; o filtro de exposição
 * (ex.: títulos > 10k) e a ordenação ficam na própria query.
 */
export class SqlServerCityProvider implements CityProvider {
  constructor(private readonly config: SqlServerCityConfig) {}

  async getCities(): Promise<City[]> {
    if (!this.config.server || !this.config.query) return []; // desligada

    let pool: sql.ConnectionPool | undefined;
    try {
      pool = await sql.connect({
        server: this.config.server,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        options: {
          encrypt: this.config.encrypt,
          trustServerCertificate: this.config.trustServerCertificate,
        },
        connectionTimeout: 15000,
        requestTimeout: 20000,
      });

      const result = await pool.request().query<{ cidade: string; uf: string }>(this.config.query);
      const cities = (result.recordset ?? [])
        .map((r) => ({
          cidade: String(r.cidade ?? '').trim(),
          uf: String(r.uf ?? '').trim(),
        }))
        .filter((c) => c.cidade.length > 0);

      const capped = this.config.maxCities > 0 ? cities.slice(0, this.config.maxCities) : cities;
      console.log(`🏙️  Cidades com Cedente/Sacado: ${capped.length}${cities.length > capped.length ? ` (de ${cities.length}, teto aplicado)` : ''}.`);
      return capped;
    } catch (err) {
      console.error('⚠️  Falha ao ler cidades do SQL Server (trilha de desastres pulada):', (err as Error).message);
      return [];
    } finally {
      await pool?.close().catch(() => undefined);
    }
  }
}
