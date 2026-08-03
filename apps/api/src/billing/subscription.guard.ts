import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PUBLIC_KEY } from '../auth/rbac';
import { ApiException } from '../common/http';
import type { Subscription } from '../generated/prisma/client';
import { Role, SubscriptionStatus } from '../generated/prisma/enums';
import { basePrisma } from '../prisma/client';

// Feature gating (S3-3, docs/api/billing.md §Feature gating). Deny by default
// like RolesGuard: a module added in a future sprint is gated unless it opts
// out, so forgetting the decorator can only be too strict, never too loose.

const NO_SUBSCRIPTION_KEY = 'zenvy:no-subscription';

/** Route stays reachable without a usable subscription — only for what a
 *  locked-out or clinic-less user must still be able to do (/me, clinic
 *  creation, invite acceptance, billing itself). */
export const NoSubscription = () => SetMetadata(NO_SUBSCRIPTION_KEY, true);

/** Trial expiry needs no scheduled job: an exhausted trial is computed here,
 *  from the same row the status lives on. */
export const isSubscriptionUsable = (subscription: Subscription | null): boolean => {
  if (!subscription) return false;
  if (subscription.status === SubscriptionStatus.ACTIVE) return true;
  return (
    subscription.status === SubscriptionStatus.TRIALING &&
    (subscription.trialEndsAt === null || subscription.trialEndsAt > new Date())
  );
};

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(NO_SUBSCRIPTION_KEY, targets)
    ) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request>().sessionUser;
    // RolesGuard runs first and already rejected the anonymous case. A
    // SUPER_ADMIN owns no clinic, and a clinic-less user is stopped by tenancy.
    if (!user || user.role === Role.SUPER_ADMIN || !user.clinicId) return true;

    // ponytail: one indexed read per gated request; cache it if it ever shows
    // up in latency. basePrisma — the guard runs to decide access, and reads
    // exactly the caller's own clinic row.
    const subscription = await basePrisma.subscription.findUnique({
      where: { clinicId: user.clinicId },
    });
    if (!isSubscriptionUsable(subscription)) {
      throw new ApiException(
        'SUBSCRIPTION_INACTIVE',
        'Votre abonnement n’est plus actif. Réactivez-le pour continuer à utiliser ZenvyDental.',
      );
    }
    return true;
  }
}
