import {
  APPOINTMENT_STATUSES,
  CLINIC_ONBOARDING_STATUSES,
  CONVERSATION_STATUSES,
  ERROR_SEVERITIES,
  MESSAGE_AUTHORS,
  MESSAGE_DELIVERY_STATUSES,
  MESSAGE_DIRECTIONS,
  ONBOARDING_REQUEST_STATUSES,
  PATIENT_SOURCES,
  PLANS,
  ROLES,
  SCHEDULED_MESSAGE_KINDS,
  SCHEDULED_MESSAGE_STATUSES,
  SUBSCRIPTION_STATUSES,
  SUPPORT_THREAD_STATUSES,
} from '@zenvy/shared';
import { describe, expect, it } from 'vitest';
import * as generated from '../src/generated/prisma/enums';

// @zenvy/shared hand-mirrors the Prisma enums so the frontends can use them.
// This is the drift guard: any enum change in schema.prisma fails here until
// the mirror in packages/shared/src/enums.ts is updated too.
const MIRRORS: Record<string, readonly string[]> = {
  Role: ROLES,
  ClinicOnboardingStatus: CLINIC_ONBOARDING_STATUSES,
  PatientSource: PATIENT_SOURCES,
  AppointmentStatus: APPOINTMENT_STATUSES,
  ConversationStatus: CONVERSATION_STATUSES,
  MessageDirection: MESSAGE_DIRECTIONS,
  MessageAuthor: MESSAGE_AUTHORS,
  MessageDeliveryStatus: MESSAGE_DELIVERY_STATUSES,
  Plan: PLANS,
  SubscriptionStatus: SUBSCRIPTION_STATUSES,
  ScheduledMessageKind: SCHEDULED_MESSAGE_KINDS,
  ScheduledMessageStatus: SCHEDULED_MESSAGE_STATUSES,
  OnboardingRequestStatus: ONBOARDING_REQUEST_STATUSES,
  SupportThreadStatus: SUPPORT_THREAD_STATUSES,
  ErrorSeverity: ERROR_SEVERITIES,
};

describe('shared enum mirrors stay in sync with the Prisma schema', () => {
  const generatedEnums = Object.fromEntries(
    Object.entries(generated as Record<string, unknown>).filter(
      ([, value]) => typeof value === 'object' && value !== null,
    ),
  ) as Record<string, Record<string, string>>;

  it('every Prisma enum has a shared mirror (and no stale extras)', () => {
    expect(Object.keys(generatedEnums).sort()).toEqual(Object.keys(MIRRORS).sort());
  });

  for (const [name, mirror] of Object.entries(MIRRORS)) {
    it(`${name} values match`, () => {
      expect([...mirror].sort()).toEqual(Object.values(generatedEnums[name] ?? {}).sort());
    });
  }
});
