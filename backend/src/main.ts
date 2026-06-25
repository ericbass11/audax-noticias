import { env } from './infrastructure/config/env.js';

/**
 * Composition root / bootstrap.
 *
 * Parte 1 (fundação): apenas valida a configuração e sobe um processo vivo.
 * As Partes 2-5 ligam aqui: HTTP (Fastify), fila (BullMQ workers) e cron.
 */
async function bootstrap(): Promise<void> {
  console.log('🚀 Audax Notícias — backend iniciando');
  console.log(`   env: ${env.NODE_ENV} | porta: ${env.PORT} | tz: ${env.TZ}`);
  console.log(`   fontes RSS configuradas: ${env.rssFeeds.length}`);
  console.log(`   destinatários WhatsApp: ${env.evolutionRecipients.length}`);
  console.log('ℹ️  HTTP/fila/cron serão ligados nas próximas partes.');
}

bootstrap().catch((err) => {
  console.error('❌ Falha no bootstrap:', err);
  process.exit(1);
});
