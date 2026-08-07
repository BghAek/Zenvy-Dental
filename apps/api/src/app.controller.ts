import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles } from './auth/rbac';
import { Role } from './generated/prisma/enums';
import { healthReport, type HealthReport } from './health';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health(): Promise<HealthReport> {
    return healthReport();
  }

  // The S0-5 deliverable: proves session resolution + RBAC end to end.
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_OWNER, Role.CLINIC_STAFF)
  @Get('hello')
  hello(@Req() req: Request): { message: string; role: string; clinicId: string | null } {
    const user = req.sessionUser!;
    return {
      message: `Bonjour ${user.name} !`,
      role: user.role as string,
      clinicId: user.clinicId ?? null,
    };
  }
}
