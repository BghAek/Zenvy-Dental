import { Module } from '@nestjs/common';
import { InboundQueue } from './inbound.queue';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [InboundQueue],
})
export class WhatsAppModule {}
