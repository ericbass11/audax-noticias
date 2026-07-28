import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchCostReport } from '@/lib/api';
import type { CostReport } from '@/lib/types';

export const dynamic = 'force-dynamic';

const usdFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat('pt-BR');

function usd(v: number): string {
  return usdFmt.format(v);
}
function num(v: number): string {
  return intFmt.format(Math.round(v));
}

/** Data/hora curta em BRT (ex.: 28/07 06:12). */
function dateTimeBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default async function CustosPage() {
  let report: CostReport | null = null;
  let error: string | null = null;
  try {
    report = await fetchCostReport();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Início
      </Link>

      <h1 className="mb-2 mt-4 font-serif text-3xl font-bold tracking-tight">
        Custos & Tokens do LLM
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Consumo de tokens e custo estimado das chamadas ao modelo, por ciclo de processamento e por
        dia. Os valores em <strong>US$ são estimativa</strong> (tabela de preços aproximada; o preço
        introdutório do Sonnet 5 é menor até 31/08/2026).
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — verifique se o backend está no ar.
        </div>
      )}

      {report && (
        <>
          {/* --- Cards de TOTAIS --- */}
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Custo total (est.)" value={usd(report.totals.usd)} highlight />
            <StatCard label="Chamadas" value={num(report.totals.calls)} />
            <StatCard label="Tokens entrada" value={num(report.totals.tokensInput)} />
            <StatCard label="Tokens saída" value={num(report.totals.tokensOutput)} />
            <StatCard label="Cache leitura" value={num(report.totals.tokensCacheRead)} />
            <StatCard label="Cache escrita" value={num(report.totals.tokensCacheWrite)} />
          </section>

          {/* --- Tabela por CICLO --- */}
          <section className="mb-10">
            <h2 className="mb-3 font-serif text-xl font-bold tracking-tight">Por ciclo</h2>
            {report.cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum ciclo no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Período</th>
                      <th className="px-3 py-2">Início</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Chamadas</th>
                      <th className="px-3 py-2 text-right">Entrada</th>
                      <th className="px-3 py-2 text-right">Saída</th>
                      <th className="px-3 py-2 text-right">Cache R/W</th>
                      <th className="px-3 py-2 text-right">Custo (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cycles.map((c) => (
                      <tr key={c.periodKey} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium">{c.periodKey}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {dateTimeBR(c.startedAt)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(c.calls)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(c.tokensInput)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(c.tokensOutput)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {num(c.tokensCacheRead)} / {num(c.tokensCacheWrite)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {usd(c.usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Mini-detalhe por modelo (por ciclo) */}
            {report.cycles.some((c) => Object.keys(c.byModel).length > 0) && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {report.cycles
                  .filter((c) => Object.keys(c.byModel).length > 0)
                  .map((c) => (
                    <p key={c.periodKey}>
                      <span className="font-medium text-foreground">{c.periodKey}</span>:{' '}
                      {Object.entries(c.byModel)
                        .map(
                          ([model, m]) =>
                            `${model} (${num(m.calls)} ch · ${usd(m.usd)})`,
                        )
                        .join(' · ')}
                    </p>
                  ))}
              </div>
            )}
          </section>

          {/* --- Tabela DIÁRIA --- */}
          <section>
            <h2 className="mb-3 font-serif text-xl font-bold tracking-tight">Por dia</h2>
            {report.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Dia</th>
                      <th className="px-3 py-2 text-right">Chamadas</th>
                      <th className="px-3 py-2 text-right">Entrada</th>
                      <th className="px-3 py-2 text-right">Saída</th>
                      <th className="px-3 py-2 text-right">Custo (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.daily.map((d) => (
                      <tr key={d.day} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium tabular-nums">{d.day}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(d.calls)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(d.tokensInput)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(d.tokensOutput)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {usd(d.usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-bold tabular-nums ${highlight ? 'text-2xl text-primary' : 'text-lg'}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-50 text-green-700 border-green-200',
    running: 'bg-amber-50 text-amber-700 border-amber-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
  };
  const cls = map[status] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
