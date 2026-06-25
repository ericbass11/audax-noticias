import type {
  WhatsAppGateway,
  WhatsAppSendResult,
} from '../../domain/WhatsAppGateway.js';

export interface EvolutionConfig {
  baseUrl: string;
  instance: string;
  apiKey: string;
  /** Quando false, não envia de verdade (só loga). Útil em dev. */
  enabled: boolean;
}

interface EvolutionSendResponse {
  key?: { id?: string };
}

/**
 * Cliente da Evolution API para envio de texto no WhatsApp.
 *
 * Endpoint: POST {baseUrl}/message/sendText/{instance}
 * Header de auth: `apikey: <API_KEY>`.
 * Body: { number, text } — `number` aceita JID de grupo (@g.us) ou contato.
 *
 * NOTA: a Evolution API tem variações de payload entre versões. Esta é a
 * forma mais comum (v2). Se sua instância usar `textMessage:{text}`, ajuste
 * `buildBody` — deixei isolado para facilitar.
 */
export class EvolutionApiClient implements WhatsAppGateway {
  constructor(private readonly config: EvolutionConfig) {}

  async sendText(recipient: string, text: string): Promise<WhatsAppSendResult> {
    if (!this.config.enabled) {
      console.log(`📵 [WHATSAPP_DISPATCH_ENABLED=false] envio simulado para ${recipient}`);
      return { providerMessageId: null };
    }
    if (!this.config.apiKey) {
      throw new Error('EVOLUTION_API_KEY ausente — não é possível enviar WhatsApp.');
    }

    const url = `${this.config.baseUrl}/message/sendText/${this.config.instance}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.apiKey,
      },
      body: JSON.stringify(this.buildBody(recipient, text)),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Evolution HTTP ${res.status}: ${errText.slice(0, 500)}`);
    }

    const data = (await res.json().catch(() => ({}))) as EvolutionSendResponse;
    return { providerMessageId: data.key?.id ?? null };
  }

  private buildBody(recipient: string, text: string): Record<string, unknown> {
    return { number: recipient, text };
  }
}
