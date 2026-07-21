import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { RolesGuard } from './auth/rbac';
import { ApiExceptionFilter } from './common/http';
import { IdentityModule } from './identity/identity.module';
import { PatientsModule } from './patients/patients.module';
import { tenantContextMiddleware } from './tenancy/tenant-context.middleware';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [IdentityModule, PatientsModule, WhatsAppModule],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    // Every error leaves as the French envelope (docs/03-api-conventions.md).
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(tenantContextMiddleware).forRoutes('{*splat}');
  }
}
