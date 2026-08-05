import { createHash, randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  type CreateClinicRequest,
  type CreateClinicResponse,
  type CreateStaffInviteRequest,
  type MeResponse,
  type StaffInvite as StaffInviteDto,
  createClinicRequestSchema,
  createStaffInviteRequestSchema,
  acceptStaffInviteRequestSchema,
  type AcceptStaffInviteRequest,
} from '@zenvy/shared';
import type { Request } from 'express';
import { Roles } from '../auth/rbac';
import { NoSubscription } from '../billing/subscription.guard';
import { ApiException, ZodValidationPipe } from '../common/http';
import type { Clinic, StaffInvite, Subscription } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { sendMail } from '../mail/mailer';
import { basePrisma, prisma } from '../prisma/client';

// S1-2 identity endpoints (docs/api/auth.md): /me, clinic creation + trial
// start, staff invites. Better Auth owns /auth/*; these are the custom routes.

const TRIAL_DAYS = 14;
const INVITE_TTL_DAYS = 7;

// Invite links land on the web app (contract: /register?invite=<token>).
const webAppUrl = (): string => process.env.APP_WEB_URL ?? 'https://app.zenvydental.fr';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'cabinet';
}

// ponytail: check-then-create — a concurrent same-name signup can still hit
// the unique constraint (500). Retry-on-P2002 when real traffic exists.
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await basePrisma.clinic.findUnique({ where: { slug }, select: { id: true } }); n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
}

// Response mappers: the contract shapes (ISO strings, no aiConfig).
const toClinicDto = (clinic: Clinic) => ({
  id: clinic.id,
  name: clinic.name,
  slug: clinic.slug,
  phone: clinic.phone,
  address: clinic.address,
  timezone: clinic.timezone,
  locale: clinic.locale,
  onboardingStatus: clinic.onboardingStatus,
  createdAt: clinic.createdAt.toISOString(),
  updatedAt: clinic.updatedAt.toISOString(),
});

const toSubscriptionDto = (sub: Subscription) => ({
  id: sub.id,
  plan: sub.plan,
  status: sub.status,
  trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
});

const toInviteDto = (invite: StaffInvite): StaffInviteDto => ({
  id: invite.id,
  email: invite.email,
  expiresAt: invite.expiresAt.toISOString(),
  createdAt: invite.createdAt.toISOString(),
});

type SessionUser = NonNullable<Request['sessionUser']>;

const requireVerified = (user: SessionUser): void => {
  if (!user.emailVerified) {
    throw new ApiException('EMAIL_NOT_VERIFIED', 'Veuillez d’abord vérifier votre adresse e-mail.');
  }
};

const requireNoClinic = (user: SessionUser): void => {
  if (user.clinicId) {
    throw new ApiException('USER_ALREADY_IN_CLINIC', 'Vous appartenez déjà à un cabinet.');
  }
};

@Controller()
export class IdentityController {
  // Exempt from gating: the dashboard reads /me to learn it is locked out.
  @NoSubscription()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_OWNER, Role.CLINIC_STAFF)
  @Get('me')
  async me(@Req() req: Request): Promise<MeResponse> {
    const user = req.sessionUser!;
    // Clinic-scoped reads run inside the request's tenant context.
    const clinic = user.clinicId
      ? await prisma.clinic.findUnique({ where: { id: user.clinicId } })
      : null;
    const subscription = clinic
      ? await prisma.subscription.findUnique({ where: { clinicId: clinic.id } })
      : null;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        role: user.role as Role,
        clinicId: user.clinicId ?? null,
      },
      clinic: clinic && toClinicDto(clinic),
      subscription: subscription && toSubscriptionDto(subscription),
    };
  }

  // SUPER_ADMIN deliberately excluded: the founder never owns a clinic.
  // Exempt from gating: this route is what creates the trial in the first place.
  @NoSubscription()
  @Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
  @Post('clinics')
  async createClinic(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createClinicRequestSchema)) body: CreateClinicRequest,
  ): Promise<CreateClinicResponse> {
    const user = req.sessionUser!;
    requireVerified(user);
    requireNoClinic(user);

    const slug = await uniqueSlug(body.name);
    // basePrisma: the caller has no tenant yet — this transaction CREATES the
    // tenant (clinic + trial subscription) and claims the user atomically.
    const result = await basePrisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: body.name,
          slug,
          phone: body.phone ?? null,
          address: body.address ?? null,
          timezone: body.timezone,
        },
      });
      const subscription = await tx.subscription.create({
        // 14-day no-card trial starts here (docs/api/auth.md).
        data: { clinicId: clinic.id, trialEndsAt: days(TRIAL_DAYS) },
      });
      // Conditional claim beats a pre-check: a concurrent second POST /clinics
      // matches zero rows here and the whole transaction rolls back.
      const claimed = await tx.user.updateMany({
        where: { id: user.id, clinicId: null },
        data: { role: Role.CLINIC_OWNER, clinicId: clinic.id },
      });
      if (claimed.count === 0) {
        throw new ApiException('USER_ALREADY_IN_CLINIC', 'Vous appartenez déjà à un cabinet.');
      }
      // v1 connects every clinic's WhatsApp number by hand ("nous le connectons
      // pour vous"), so a signup IS a queue item for the founder — this is the
      // only producer of the onboarding queue (docs/api/ops.md).
      await tx.onboardingRequest.create({ data: { clinicId: clinic.id } });
      await tx.auditLog.create({
        data: {
          clinicId: clinic.id,
          actorUserId: user.id,
          action: 'clinic.created',
          entity: 'Clinic',
          entityId: clinic.id,
        },
      });
      return { clinic, subscription };
    });

    return { clinic: toClinicDto(result.clinic), subscription: toSubscriptionDto(result.subscription) };
  }

  @Roles(Role.CLINIC_OWNER)
  @Post('staff-invites')
  async createStaffInvite(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createStaffInviteRequestSchema)) body: CreateStaffInviteRequest,
  ): Promise<StaffInviteDto> {
    const email = body.email.toLowerCase();
    // Deliberate cross-tenant read (basePrisma): "already a member of any
    // clinic" is a global check, and only existence/membership is used.
    const existing = await basePrisma.user.findUnique({
      where: { email },
      select: { clinicId: true },
    });
    if (existing?.clinicId) {
      throw new ApiException('USER_ALREADY_IN_CLINIC', 'Cette adresse appartient déjà à un cabinet.');
    }

    const token = randomBytes(32).toString('base64url');
    const clinicId = req.sessionUser!.clinicId!;
    const tokenHash = hashToken(token);
    const expiresAt = days(INVITE_TTL_DAYS);
    // Upsert on the (clinicId, email) unique: re-inviting replaces the pending
    // invite atomically — one statement, no delete-then-create window — and
    // resets token, expiry, and accepted state. Tenant-scoped client re-stamps
    // clinicId; the explicit value only satisfies the types.
    // ponytail: a truly concurrent double-invite can still trip the unique
    // constraint (→500); acceptable, same class as uniqueSlug's race above.
    const invite = await prisma.staffInvite.upsert({
      where: { clinicId_email: { clinicId, email } },
      create: { clinicId, email, tokenHash, expiresAt },
      update: { tokenHash, expiresAt, acceptedAt: null },
    });

    await sendMail({
      to: email,
      subject: 'Invitation à rejoindre votre cabinet sur ZenvyDental',
      text: `Bonjour,\n\n${req.sessionUser!.name} vous invite à rejoindre son cabinet sur ZenvyDental.\n\nPour accepter l'invitation (valable ${INVITE_TTL_DAYS} jours), créez votre compte via ce lien : ${webAppUrl()}/register?invite=${token}`,
    });

    return toInviteDto(invite);
  }

  // Exempt from gating: the caller has no clinic yet, so no subscription.
  @NoSubscription()
  @Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
  @Post('staff-invites/accept')
  @HttpCode(200)
  async acceptStaffInvite(
    @Req() req: Request,
    @Body(new ZodValidationPipe(acceptStaffInviteRequestSchema)) body: AcceptStaffInviteRequest,
  ): Promise<MeResponse> {
    const user = req.sessionUser!;
    requireVerified(user);
    requireNoClinic(user);

    // basePrisma throughout: the caller is clinic-less, so no tenant context
    // exists yet — the invite token itself is the authorization to cross in.
    const invite = await basePrisma.staffInvite.findUnique({
      where: { tokenHash: hashToken(body.token) },
    });
    const valid =
      invite &&
      !invite.acceptedAt &&
      invite.expiresAt > new Date() &&
      // The invite is bound to the address it was sent to — a forwarded link
      // must not attach an arbitrary account (single code: no token probing).
      invite.email === user.email.toLowerCase();
    if (!valid) {
      throw new ApiException('INVITE_INVALID', 'Invitation invalide ou expirée.');
    }

    await basePrisma.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: user.id, clinicId: null },
        data: { role: Role.CLINIC_STAFF, clinicId: invite.clinicId },
      });
      if (claimed.count === 0) {
        throw new ApiException('USER_ALREADY_IN_CLINIC', 'Vous appartenez déjà à un cabinet.');
      }
      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          clinicId: invite.clinicId,
          actorUserId: user.id,
          action: 'staff_invite.accepted',
          entity: 'StaffInvite',
          entityId: invite.id,
        },
      });
    });

    // Fresh reads via basePrisma: the request's tenant context still predates
    // the join (clinicId null), so the scoped client would refuse these.
    const [clinic, subscription] = await Promise.all([
      basePrisma.clinic.findUnique({ where: { id: invite.clinicId } }),
      basePrisma.subscription.findUnique({ where: { clinicId: invite.clinicId } }),
    ]);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        role: Role.CLINIC_STAFF,
        clinicId: invite.clinicId,
      },
      clinic: clinic && toClinicDto(clinic),
      subscription: subscription && toSubscriptionDto(subscription),
    };
  }
}
