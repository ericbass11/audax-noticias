export interface WhatsAppSendResult {
  providerMessageId: string | null;
}

/** Mídia por URL pública (imagem/vídeo/áudio/documento). */
export interface WhatsAppMedia {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  /** Nome do arquivo mostrado no WhatsApp (relevante em `document`). */
  filename?: string;
}

/**
 * Porta de envio de mensagens WhatsApp. A implementação concreta é a
 * Evolution API; manter a interface permite trocar de provedor ou mockar
 * em testes sem tocar nos use cases.
 */
export interface WhatsAppGateway {
  sendText(recipient: string, text: string): Promise<WhatsAppSendResult>;
  sendMedia(recipient: string, media: WhatsAppMedia): Promise<WhatsAppSendResult>;
}
