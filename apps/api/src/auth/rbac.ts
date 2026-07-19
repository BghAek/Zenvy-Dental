import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../generated/prisma/enums';

const PUBLIC_KEY = 'zenvy:public';
const ROLES_KEY = 'zenvy:roles';

/** Route reachable without a session — health, webhooks, nothing else. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Roles allowed on a route. Without @Public or @Roles a route fails closed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const user = context.switchToHttp().getRequest<Request>().sessionUser;
    if (!user) throw new UnauthorizedException('Authentification requise.');

    // Deny by default: no explicit role metadata means no access (docs/04).
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles?.length || !roles.includes(user.role as Role)) {
      throw new ForbiddenException('Accès refusé.');
    }
    return true;
  }
}
