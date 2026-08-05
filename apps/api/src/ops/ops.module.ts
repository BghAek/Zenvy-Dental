import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { SupportController } from './support.controller';

// S4-1: the founder's owner-portal surface (/ops/*, SUPER_ADMIN) and the
// clinic's half of support chat (/support-threads) — docs/api/ops.md.
@Module({ controllers: [OpsController, SupportController] })
export class OpsModule {}
