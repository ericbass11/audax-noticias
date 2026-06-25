export type DispatchStatus = 'pending' | 'sent' | 'failed';

export interface DispatchProps {
  id?: string;
  summaryId: string;
  recipient: string;
  status?: DispatchStatus;
  providerMessageId?: string | null;
  attempts?: number;
  errorMessage?: string | null;
  sentAt?: Date | null;
}

/**
 * Dispatch — uma tentativa de envio do resumo a um destinatário do WhatsApp.
 * Modela o resultado para idempotência (não reenvia ao mesmo destinatário)
 * e para o endpoint de reenvio manual.
 */
export class Dispatch {
  id?: string;
  readonly summaryId: string;
  readonly recipient: string;
  status: DispatchStatus;
  providerMessageId: string | null;
  attempts: number;
  errorMessage: string | null;
  sentAt: Date | null;

  constructor(props: DispatchProps) {
    this.id = props.id;
    this.summaryId = props.summaryId;
    this.recipient = props.recipient;
    this.status = props.status ?? 'pending';
    this.providerMessageId = props.providerMessageId ?? null;
    this.attempts = props.attempts ?? 0;
    this.errorMessage = props.errorMessage ?? null;
    this.sentAt = props.sentAt ?? null;
  }

  markSent(providerMessageId: string | null, sentAt: Date): void {
    this.status = 'sent';
    this.providerMessageId = providerMessageId;
    this.errorMessage = null;
    this.attempts += 1;
    this.sentAt = sentAt;
  }

  markFailed(error: string): void {
    this.status = 'failed';
    this.errorMessage = error;
    this.attempts += 1;
  }
}
