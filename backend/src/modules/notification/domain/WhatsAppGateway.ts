export interface WhatsAppSendResult {
  providerMessageId: string | null;
}

/**
 * Porta de envio de mensagens WhatsApp. A implementação concreta é a
 * Evolution API; manter a interface permite trocar de provedor ou mockar
 * em testes sem tocar nos use cases.
 */
export interface WhatsAppGateway {
  sendText(recipient: string, text: string): Promise<WhatsAppSendResult>;
}
