import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { RolesGuard } from './auth/rbac';
import { tenantContextMiddleware } from './tenancy/tenant-context.middleware';

@Module({
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(tenantContextMiddleware).forRoutes('{*splat}');
  }
}
