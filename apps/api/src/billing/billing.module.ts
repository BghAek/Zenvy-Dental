import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  controllers: [BillingController, StripeWebhookController],
})
export class BillingModule {}
