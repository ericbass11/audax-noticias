import { desc, gte, sql } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/client.js';
import { llmAuditLogs, processingRuns } from '../../../infrastructure/database/schema.js';
import type {
  CostReport,
  CostReportOptions,
  CycleCost,
  DailyCost,
  MetricsRepository,
  ModelCost,
} from '../domain/MetricsRepository.js';

const SAO_PAULO = 'America/Sao_Paulo';

// ---------------------------------------------------------------------------
// PREÇO — ESTIMATIVA. Taxas por 1M de tokens (USD). Fácil de editar aqui.
// Atenção: claude-sonnet-5 tem preço introdutório MENOR até 2026-08-31; os
// valores abaixo são a tabela cheia e servem como estimativa conservadora.
// Match por PREFIXO do model id resolvido (ex.: "claude-sonnet-5-...").
// ---------------------------------------------------------------------------
interface Rate {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const SONNET_5: Rate = { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };
const HAIKU_4_5: Rate = { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 };

/** Taxa por modelo (prefixo); fallback = sonnet-5. */
function rateFor(model: string): Rate {
  if (model.startsWith('claude-haiku-4-5')) return HAIKU_4_5;
  if (model.startsWith('claude-sonnet-5')) return SONNET_5;
  return SONNET_5;
}

function usdFor(
  model: string,
  tokensInput: number,
  tokensOutput: number,
  tokensCacheRead: number,
  tokensCacheWrite: number,
): number {
  const r = rateFor(model);
  return (
    (tokensInput / 1e6) * r.input +
    (tokensOutput / 1e6) * r.output +
    (tokensCacheRead / 1e6) * r.cacheRead +
    (tokensCacheWrite / 1e6) * r.cacheWrite
  );
}

/** Dia YYYY-MM-DD no fuso de São Paulo (mesma convenção do resto do portal). */
function dayInSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

interface AuditRow {
  model: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensCacheRead: number | null;
  tokensCacheWrite: number | null;
  createdAt: Date;
}

interface RunRow {
  periodKey: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
}

/**
 * Projeção de leitura (CQRS) do dashboard de custos. Volume baixo
 * (dezenas/centenas de linhas por dia): busca as linhas da janela e agrega
 * em JS — mais simples e fácil de auditar que SQL agregado.
 */
export class DrizzleMetricsRepository implements MetricsRepository {
  constructor(private readonly db: Database) {}

  async getCostReport(opts?: CostReportOptions): Promise<CostReport> {
    const days = opts?.days ?? 30;
    const cyclesLimit = opts?.cycles ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const auditRows = (await this.db
      .select({
        model: llmAuditLogs.model,
        tokensInput: llmAuditLogs.tokensInput,
        tokensOutput: llmAuditLogs.tokensOutput,
        tokensCacheRead: llmAuditLogs.tokensCacheRead,
        tokensCacheWrite: llmAuditLogs.tokensCacheWrite,
        createdAt: llmAuditLogs.createdAt,
      })
      .from(llmAuditLogs)
      .where(gte(llmAuditLogs.createdAt, since))) as AuditRow[];

    const runRows = (await this.db
      .select({
        periodKey: processingRuns.periodKey,
        status: processingRuns.status,
        startedAt: processingRuns.startedAt,
        finishedAt: processingRuns.finishedAt,
      })
      .from(processingRuns)
      .orderBy(desc(processingRuns.startedAt))
      .limit(cyclesLimit)) as RunRow[];

    return this.aggregate(auditRows, runRows);
  }

  private aggregate(auditRows: AuditRow[], runRows: RunRow[]): CostReport {
    const now = Date.now();

    // --- Totais ---
    const totals = {
      calls: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      usd: 0,
    };

    // --- Diário (por dia BRT) ---
    const dailyMap = new Map<string, DailyCost>();

    // --- Ciclos: acumuladores por run (mesma ordem de runRows) ---
    const cycleAcc: CycleCost[] = runRows.map((r) => ({
      periodKey: r.periodKey,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      status: r.status,
      calls: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      usd: 0,
      byModel: {},
    }));

    for (const row of auditRows) {
      const ti = row.tokensInput ?? 0;
      const to = row.tokensOutput ?? 0;
      const cr = row.tokensCacheRead ?? 0;
      const cw = row.tokensCacheWrite ?? 0;
      const usd = usdFor(row.model, ti, to, cr, cw);

      // Totais
      totals.calls += 1;
      totals.tokensInput += ti;
      totals.tokensOutput += to;
      totals.tokensCacheRead += cr;
      totals.tokensCacheWrite += cw;
      totals.usd += usd;

      // Diário
      const day = dayInSaoPaulo(row.createdAt);
      const d = dailyMap.get(day) ?? {
        day,
        calls: 0,
        tokensInput: 0,
        tokensOutput: 0,
        usd: 0,
      };
      d.calls += 1;
      d.tokensInput += ti;
      d.tokensOutput += to;
      d.usd += usd;
      dailyMap.set(day, d);

      // Ciclo: atribui pela janela de tempo do run (não sobrepõem).
      const created = row.createdAt.getTime();
      const idx = runRows.findIndex((r) => {
        const start = r.startedAt.getTime();
        const end = r.finishedAt ? r.finishedAt.getTime() : now;
        return created >= start && created <= end;
      });
      const c = idx >= 0 ? cycleAcc[idx] : undefined;
      if (c) {
        c.calls += 1;
        c.tokensInput += ti;
        c.tokensOutput += to;
        c.tokensCacheRead += cr;
        c.tokensCacheWrite += cw;
        c.usd += usd;
        const m: ModelCost = c.byModel[row.model] ?? {
          calls: 0,
          tokensInput: 0,
          tokensOutput: 0,
          usd: 0,
        };
        m.calls += 1;
        m.tokensInput += ti;
        m.tokensOutput += to;
        m.usd += usd;
        c.byModel[row.model] = m;
      }
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => b.day.localeCompare(a.day));

    return { totals, daily, cycles: cycleAcc };
  }
}
