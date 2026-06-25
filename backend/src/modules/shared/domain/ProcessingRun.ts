export type RunStatus = 'running' | 'completed' | 'failed';
export type TriggerType = 'scheduled' | 'manual';

export interface RunCounts {
  collected?: number;
  deduped?: number;
  classified?: number;
}

export interface ProcessingRunProps {
  id?: string;
  periodKey: string;
  triggerType: TriggerType;
  status?: RunStatus;
  counts?: RunCounts;
  error?: string | null;
  startedAt?: Date;
  finishedAt?: Date | null;
}

/**
 * ProcessingRun — agregado que representa um turno de processamento (cron ou
 * manual). É a âncora de idempotência (`periodKey`) e da trilha de execução:
 * quantas notícias foram coletadas/dedupadas/classificadas, status e erro.
 */
export class ProcessingRun {
  id?: string;
  readonly periodKey: string;
  readonly triggerType: TriggerType;
  status: RunStatus;
  counts: RunCounts;
  error: string | null;
  readonly startedAt?: Date;
  finishedAt: Date | null;

  constructor(props: ProcessingRunProps) {
    this.id = props.id;
    this.periodKey = props.periodKey;
    this.triggerType = props.triggerType;
    this.status = props.status ?? 'running';
    this.counts = props.counts ?? {};
    this.error = props.error ?? null;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt ?? null;
  }

  complete(counts: RunCounts): void {
    this.status = 'completed';
    this.counts = { ...this.counts, ...counts };
  }

  fail(error: string): void {
    this.status = 'failed';
    this.error = error;
  }
}
