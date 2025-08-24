/**
 * Ticket-related Zod schemas
 * Central location for all ticket data validation
 */

import { z } from "zod";

/**
 * Ticket priority levels
 */
export const TicketPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;

/**
 * Ticket status
 */
export const TicketStatusSchema = z.enum([
  "new",
  "open",
  "in_progress",
  "waiting_customer",
  "waiting_internal",
  "resolved",
  "closed",
  "cancelled",
]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

/**
 * Ticket source channels
 */
export const TicketSourceSchema = z.enum([
  "api",
  "email",
  "web",
  "mobile",
  "phone",
  "chat",
  "social",
  "internal",
]);
export type TicketSource = z.infer<typeof TicketSourceSchema>;

/**
 * Customer information
 */
export const CustomerSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  company: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Customer = z.infer<typeof CustomerSchema>;

/**
 * Base ticket schema
 */
export const TicketSchema = z.object({
  id: z.string().regex(/^TKT-\d{6}$/).optional(),
  text: z.string().min(1).max(5000),
  subject: z.string().min(1).max(200).optional(),
  priority: TicketPrioritySchema.default("medium"),
  status: TicketStatusSchema.default("new"),
  source: TicketSourceSchema.default("api"),
  customer: CustomerSchema.optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/**
 * Ticket creation request
 */
export const CreateTicketRequestSchema = TicketSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>;

/**
 * Ticket update request
 */
export const UpdateTicketRequestSchema = TicketSchema.partial().omit({
  id: true,
  createdAt: true,
});
export type UpdateTicketRequest = z.infer<typeof UpdateTicketRequestSchema>;

/**
 * Ticket received event data
 */
export const TicketReceivedEventSchema = z.object({
  ticket: TicketSchema,
  correlationId: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type TicketReceivedEvent = z.infer<typeof TicketReceivedEventSchema>;

/**
 * Intent classification
 */
export const IntentSchema = z.object({
  intent: z.string().min(1),
  confidence: z.number().min(0).max(1),
  subIntents: z.array(z.string()).optional(),
  entities: z.record(z.unknown()).optional(),
});
export type Intent = z.infer<typeof IntentSchema>;

/**
 * Intent classified event data
 */
export const IntentClassifiedEventSchema = z.object({
  ticketId: z.string(),
  intent: IntentSchema,
  modelVersion: z.string().optional(),
  processingTimeMs: z.number().optional(),
  timestamp: z.string().datetime(),
});
export type IntentClassifiedEvent = z.infer<typeof IntentClassifiedEventSchema>;

/**
 * Routing decision
 */
export const RoutingDecisionSchema = z.object({
  queue: z.string().min(1),
  skill: z.string().optional(),
  agentId: z.string().optional(),
  priority: z.number().int().min(1).max(10),
  estimatedWaitTime: z.number().optional(),
  reason: z.string().optional(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

/**
 * Ticket routed event data
 */
export const TicketRoutedEventSchema = z.object({
  ticketId: z.string(),
  routing: RoutingDecisionSchema,
  previousQueue: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type TicketRoutedEvent = z.infer<typeof TicketRoutedEventSchema>;

/**
 * Response data
 */
export const ResponseSchema = z.object({
  id: z.string().optional(),
  ticketId: z.string(),
  text: z.string().min(1).max(10000),
  type: z.enum(["auto", "manual", "suggested"]),
  confidence: z.number().min(0).max(1).optional(),
  sources: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Response = z.infer<typeof ResponseSchema>;

/**
 * Response generated event data
 */
export const ResponseGeneratedEventSchema = z.object({
  ticketId: z.string(),
  response: ResponseSchema,
  generationTimeMs: z.number().optional(),
  modelUsed: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type ResponseGeneratedEvent = z.infer<typeof ResponseGeneratedEventSchema>;

/**
 * Knowledge base article
 */
export const KBArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  relevanceScore: z.number().min(0).max(1).optional(),
  url: z.string().url().optional(),
});
export type KBArticle = z.infer<typeof KBArticleSchema>;

/**
 * KB search result event
 */
export const KBSearchResultEventSchema = z.object({
  ticketId: z.string(),
  query: z.string(),
  articles: z.array(KBArticleSchema),
  searchTimeMs: z.number().optional(),
  timestamp: z.string().datetime(),
});
export type KBSearchResultEvent = z.infer<typeof KBSearchResultEventSchema>;
