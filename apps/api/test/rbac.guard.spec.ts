import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Public, Roles, RolesGuard } from '../src/auth/rbac';
import { Role } from '../src/generated/prisma/enums';

class Fixture {
  @Public()
  publicRoute() {}

  @Roles(Role.SUPER_ADMIN)
  adminRoute() {}

  @Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
  clinicRoute() {}

  // No metadata at all — must fail closed.
  bareRoute() {}
}

const guard = new RolesGuard(new Reflector());

function ctx(handlerName: keyof Fixture, user?: { role: string }): ExecutionContext {
  return {
    getHandler: () => Fixture.prototype[handlerName],
    getClass: () => Fixture,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser: user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows @Public routes without a session', () => {
    expect(guard.canActivate(ctx('publicRoute'))).toBe(true);
  });

  it('rejects unauthenticated requests with 401', () => {
    expect(() => guard.canActivate(ctx('clinicRoute'))).toThrow(UnauthorizedException);
  });

  it('fails closed on a route without role metadata', () => {
    expect(() => guard.canActivate(ctx('bareRoute', { role: Role.SUPER_ADMIN }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a role not in the allow-list with 403', () => {
    expect(() => guard.canActivate(ctx('adminRoute', { role: Role.CLINIC_STAFF }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a matching role', () => {
    expect(guard.canActivate(ctx('clinicRoute', { role: Role.CLINIC_STAFF }))).toBe(true);
    expect(guard.canActivate(ctx('adminRoute', { role: Role.SUPER_ADMIN }))).toBe(true);
  });
});
