/**
 * PeriodKey — value object que identifica um turno de processamento.
 *
 * Formato: `YYYY-MM-DD:morning|evening` no fuso America/Sao_Paulo.
 * É a chave de idempotência: rodar duas vezes no mesmo turno reaproveita
 * o mesmo run/resumo em vez de duplicar coleta, classificação e disparo.
 */
export type DayPeriod = 'morning' | 'evening';

export class PeriodKey {
  private constructor(
    public readonly date: string, // YYYY-MM-DD
    public readonly period: DayPeriod,
  ) {}

  static create(date: string, period: DayPeriod): PeriodKey {
    return new PeriodKey(date, period);
  }

  /**
   * Deriva o turno a partir de um instante. Antes do meio-dia (BRT) = morning,
   * caso contrário evening. Usa o fuso fixo de São Paulo independente do host.
   */
  static fromDate(when: Date, timeZone = 'America/Sao_Paulo'): PeriodKey {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(when);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = Number(get('hour'));
    const period: DayPeriod = hour < 12 ? 'morning' : 'evening';
    return new PeriodKey(date, period);
  }

  toString(): string {
    return `${this.date}:${this.period}`;
  }
}
