import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppointmentsModule } from './appointments/appointments.module';
import { RolesGuard } from './auth/rbac';
import { BillingModule } from './billing/billing.module';
import { SubscriptionGuard } from './billing/subscription.guard';
import { ApiExceptionFilter } from './common/http';
import { ConversationsModule } from './conversations/conversations.module';
import { IdentityModule } from './identity/identity.module';
import { OpsModule } from './ops/ops.module';
import { PatientsModule } from './patients/patients.module';
import { tenantContextMiddleware } from './tenancy/tenant-context.middleware';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    IdentityModule,
    PatientsModule,
    WhatsAppModule,
    ConversationsModule,
    AppointmentsModule,
    BillingModule,
    OpsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    // Registration order is execution order: identity/role first, then « does
    // this clinic still pay? » (docs/api/billing.md §Feature gating).
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    // Every error leaves as the French envelope (docs/03-api-conventions.md).
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(tenantContextMiddleware).forRoutes('{*splat}');
  }
}
