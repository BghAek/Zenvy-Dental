import { z } from 'zod';
import {
  conversationStatusSchema,
  messageAuthorSchema,
  messageDeliveryStatusSchema,
  messageDirectionSchema,
} from './enums';
import { patientSummarySchema } from './patients';
import {
  blankToUndefined,
  isoDateTimeSchema,
  paginated,
  paginationQuerySchema,
  phoneE164Schema,
  requiredText,
} from './primitives';

// Contracts for docs/api/conversations.md (S2-1). clinicId never crosses the
// boundary — tenancy is derived from the session (docs/03-api-conventions.md).

// WhatsApp caps a text message at 4096 characters.
const messageBodySchema = requiredText(4096, 'Message vide.');

// Thread-list row. `lastMessagePreview` is the last message's body truncated to
// 140 chars server-side — the list never ships full bodies.
export const conversationSummarySchema = z.object({
  id: z.string(),
  patient: patientSummarySchema.nullable(),
  waContactPhone: phoneE164Schema,
  status: conversationStatusSchema,
  urgentFlag: z.boolean(),
  lastMessageAt: isoDateTimeSchema.nullable(),
  lastMessagePreview: z.string().nullable(),
  lastMessageAuthor: messageAuthorSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

// Conversation detail. `windowExpiresAt` = last inbound message + 24h (null when
// no inbound message yet or the window has never opened); free-form sends are
// refused past it (docs/05-ai-policy.md §24h rule).
export const conversationSchema = conversationSummarySchema.extend({
  windowExpiresAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type Conversation = z.infer<typeof conversationSchema>;

// waMessageId stays server-side — the UI has no use for Meta's id.
export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: messageDirectionSchema,
  author: messageAuthorSchema,
  body: z.string(),
  templateName: z.string().nullable(),
  deliveryStatus: messageDeliveryStatusSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Message = z.infer<typeof messageSchema>;

// GET /conversations — sorted lastMessageAt desc (nulls last, then createdAt
// desc). Without `status`, CLOSED threads are excluded.
export const listConversationsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(blankToUndefined, conversationStatusSchema.optional()),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const conversationListResponseSchema = paginated(conversationSummarySchema);

// GET /conversations/:id/messages — sorted createdAt desc (newest first).
export const listMessagesQuerySchema = paginationQuerySchema;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const messageListResponseSchema = paginated(messageSchema);

// POST /conversations/:id/messages — staff reply; requires status HUMAN.
export const sendMessageRequestSchema = z.object({
  body: messageBodySchema,
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
