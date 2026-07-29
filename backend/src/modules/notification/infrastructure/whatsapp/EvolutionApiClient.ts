import type {
  WhatsAppGateway,
  WhatsAppMedia,
  WhatsAppSendResult,
} from '../../domain/WhatsAppGateway.js';

/**
 * Sabor da API Evolution:
 * - `go`: Evolution GO (whatsmeow) — a que roda na VPS hoje.
 * - `v2`: Evolution API v2 (Baileys, `atendai/evolution-api`) — o container do
 *   docker-compose local.
 */
export type EvolutionFlavor = 'go' | 'v2';

export interface EvolutionConfig {
  baseUrl: string;
  /** Só usado no sabor `v2` (vai no path). No `go` a instância vem do token. */
  instance: string;
  apiKey: string;
  flavor: EvolutionFlavor;
  /** Quando false, não envia de verdade (só loga). Útil em dev. */
  enabled: boolean;
}

/** Resposta do sabor `go`: { data: { Info: { ID } }, message: "success" }. */
interface EvolutionGoResponse {
  data?: { Info?: { ID?: string } };
}

/** Resposta do sabor `v2`: { key: { id } }. */
interface EvolutionV2Response {
  key?: { id?: string };
}

/**
 * Cliente da Evolution API para envio no WhatsApp.
 *
 * Auth em ambos os sabores: header `apikey: <API_KEY>`.
 *
 * Endpoints por sabor (é aqui que as versões divergem):
 *
 * | ação  | `go`          | `v2`                             |
 * |-------|---------------|----------------------------------|
 * | texto | `/send/text`  | `/message/sendText/{instance}`   |
 * | mídia | `/send/media` | `/message/sendMedia/{instance}`  |
 *
 * No `go` a instância NÃO vai na URL: o token da instância já a identifica
 * (um token por instância), então `EVOLUTION_INSTANCE` é ignorado.
 *
 * `number` aceita número puro (`5538...`), JID de contato (`@s.whatsapp.net`)
 * ou de grupo (`@g.us`).
 */
export class EvolutionApiClient implements WhatsAppGateway {
  constructor(private readonly config: EvolutionConfig) {}

  async sendText(recipient: string, text: string): Promise<WhatsAppSendResult> {
    if (!this.ensureEnabled(recipient)) return { providerMessageId: null };

    const isGo = this.config.flavor === 'go';
    return this.post(
      isGo ? '/send/text' : `/message/sendText/${this.config.instance}`,
      { number: recipient, text },
    );
  }

  async sendMedia(recipient: string, media: WhatsAppMedia): Promise<WhatsAppSendResult> {
    if (!this.ensureEnabled(recipient)) return { providerMessageId: null };

    if (this.config.flavor === 'go') {
      return this.post('/send/media', {
        number: recipient,
        url: media.url,
        type: media.type,
        ...(media.caption ? { caption: media.caption } : {}),
        ...(media.filename ? { filename: media.filename } : {}),
      });
    }

    // v2 usa outros nomes de campo para a mesma coisa.
    return this.post(`/message/sendMedia/${this.config.instance}`, {
      number: recipient,
      mediatype: media.type,
      media: media.url,
      ...(media.caption ? { caption: media.caption } : {}),
      ...(media.filename ? { fileName: media.filename } : {}),
    });
  }

  /** false = envio desligado por flag (já logou); true = pode seguir. */
  private ensureEnabled(recipient: string): boolean {
    if (!this.config.enabled) {
      console.log(`📵 [WHATSAPP_DISPATCH_ENABLED=false] envio simulado para ${recipient}`);
      return false;
    }
    if (!this.config.apiKey) {
      throw new Error('EVOLUTION_API_KEY ausente — não é possível enviar WhatsApp.');
    }
    return true;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    // Tolera EVOLUTION_BASE_URL com barra no fim (ex.: http://host:3300/).
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Evolution HTTP ${res.status} em ${path}: ${errText.slice(0, 500)}`);
    }

    const data = (await res.json().catch(() => ({}))) as EvolutionGoResponse & EvolutionV2Response;
    const providerMessageId =
      this.config.flavor === 'go' ? data.data?.Info?.ID : data.key?.id;
    return { providerMessageId: providerMessageId ?? null };
  }
}
