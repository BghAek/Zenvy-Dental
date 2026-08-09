import { z } from 'zod';

// Mirrors of the Prisma enums (apps/api/prisma/schema.prisma is the source of truth).
// Keep in sync when the schema changes — the API validates against these at the boundary.

export const ROLES = ['SUPER_ADMIN', 'CLINIC_OWNER', 'CLINIC_STAFF'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const CLINIC_ONBOARDING_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export const clinicOnboardingStatusSchema = z.enum(CLINIC_ONBOARDING_STATUSES);
export type ClinicOnboardingStatus = z.infer<typeof clinicOnboardingStatusSchema>;

export const CLINIC_ONBOARDING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
};

export const PATIENT_SOURCES = ['MANUAL', 'WHATSAPP_INBOUND'] as const;
export const patientSourceSchema = z.enum(PATIENT_SOURCES);

export const PATIENT_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Saisie manuelle',
  WHATSAPP_INBOUND: 'WhatsApp',
};
export type PatientSource = z.infer<typeof patientSourceSchema>;

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'CANCELLED',
  'NO_SHOW',
  'DONE',
] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Planifié',
  CONFIRMED: 'Confirmé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Non présenté',
  DONE: 'Terminé',
};
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const CONVERSATION_STATUSES = ['AI', 'HUMAN', 'CLOSED'] as const;
export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const MESSAGE_DIRECTIONS = ['IN', 'OUT'] as const;
export const messageDirectionSchema = z.enum(MESSAGE_DIRECTIONS);
export type MessageDirection = z.infer<typeof messageDirectionSchema>;

export const MESSAGE_AUTHORS = ['PATIENT', 'AI', 'STAFF', 'SYSTEM'] as const;
export const messageAuthorSchema = z.enum(MESSAGE_AUTHORS);
export type MessageAuthor = z.infer<typeof messageAuthorSchema>;

export const MESSAGE_DELIVERY_STATUSES = [
  'PENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
] as const;
export const messageDeliveryStatusSchema = z.enum(MESSAGE_DELIVERY_STATUSES);
export type MessageDeliveryStatus = z.infer<typeof messageDeliveryStatusSchema>;

export const PLANS = ['PREMIUM'] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

export const PLAN_LABELS: Record<string, string> = {
  PREMIUM: 'Premium',
};

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Essai',
  ACTIVE: 'Actif',
  PAST_DUE: 'Paiement en retard',
  CANCELED: 'Annulé',
};

export const SCHEDULED_MESSAGE_KINDS = [
  'REMINDER_24H',
  'REMINDER_2H',
  'FOLLOWUP',
  'CUSTOM',
] as const;
export const scheduledMessageKindSchema = z.enum(SCHEDULED_MESSAGE_KINDS);
export type ScheduledMessageKind = z.infer<typeof scheduledMessageKindSchema>;

export const SCHEDULED_MESSAGE_STATUSES = ['PENDING', 'SENT', 'CANCELLED', 'FAILED'] as const;
export const scheduledMessageStatusSchema = z.enum(SCHEDULED_MESSAGE_STATUSES);
export type ScheduledMessageStatus = z.infer<typeof scheduledMessageStatusSchema>;

export const ONBOARDING_REQUEST_STATUSES = [
  'PENDING',
  'CALL_SCHEDULED',
  'DONE',
  'CANCELLED',
] as const;
export const onboardingRequestStatusSchema = z.enum(ONBOARDING_REQUEST_STATUSES);
export type OnboardingRequestStatus = z.infer<typeof onboardingRequestStatusSchema>;

export const ONBOARDING_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CALL_SCHEDULED: 'Appel programmé',
  DONE: 'Terminé',
  CANCELLED: 'Annulé',
};

export const SUPPORT_THREAD_STATUSES = ['OPEN', 'CLOSED'] as const;
export const supportThreadStatusSchema = z.enum(SUPPORT_THREAD_STATUSES);
export type SupportThreadStatus = z.infer<typeof supportThreadStatusSchema>;

export const SUPPORT_THREAD_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  CLOSED: 'Fermé',
};

export const ERROR_SEVERITIES = ['INFO', 'WARN', 'ERROR', 'FATAL'] as const;
export const errorSeveritySchema = z.enum(ERROR_SEVERITIES);
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>;

export const ERROR_SEVERITY_LABELS: Record<string, string> = {
  INFO: 'Info',
  WARN: 'Avertissement',
  ERROR: 'Erreur',
  FATAL: 'Critique',
};
