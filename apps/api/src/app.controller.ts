import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles } from './auth/rbac';
import { Role } from './generated/prisma/enums';

@Controller()
export class AppController {
  // ponytail: static ok; DB/Redis pings + queue depth land with BullMQ (06-observability)
  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
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
