/**
 * Comprehensive Zod schemas for event-driven microservices platform
 * Provides type-safe validation for all domain events in the DIP system
 */

import { z } from "zod";
import { EventTypes, EventPriority, EventStatus } from "./types.ts";

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Common metadata schema used across all events
 */
export const EventMetadataSchema = z.object({
  version: z.string().default("1.0"),
  environment: z.enum(["development", "staging", "production", "test"]).optional(),
  tenantId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().uuid().optional(),
  clientIp: z.string().ip().optional(),
  userAgent: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  priority: z.nativeEnum(EventPriority).default(EventPriority.MEDIUM),
  tags: z.array(z.string()).optional(),
  source_ip: z.string().ip().optional(),
  correlation_data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Error information schema for failed events
 */
export const ErrorInfoSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  stack_trace: z.string().optional(),
  retry_count: z.number().int().min(0).default(0),
  max_retries: z.number().int().min(0).default(3),
  next_retry_at: z.string().datetime().optional(),
});

/**
 * Processing context schema
 */
export const ProcessingContextSchema = z.object({
  processing_started_at: z.string().datetime(),
  processing_duration_ms: z.number().positive().optional(),
  processed_by: z.string(),
  processing_status: z.nativeEnum(EventStatus),
  retry_attempt: z.number().int().min(0).default(0),
});

// ============================================================================
// TICKET DOMAIN SCHEMAS
// ============================================================================

/**
 * Ticket priority levels
 */
export const TicketPrioritySchema = z.enum(["low", "medium", "high", "urgent", "critical"]);

/**
 * Ticket status values
 */
export const TicketStatusSchema = z.enum([
  "new",
  "open",
  "pending",
  "resolved",
  "closed",
  "cancelled",
  "escalated",
  "on_hold",
]);

/**
 * Ticket channel types
 */
export const TicketChannelSchema = z.enum([
  "email",
  "chat",
  "phone",
  "api",
  "web_form",
  "social_media",
  "sms",
]);

/**
 * Customer information schema
 */
export const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  company: z.string().optional(),
  tier: z.enum(["free", "basic", "premium", "enterprise"]).default("free"),
  language: z.string().length(2).default("en"),
  timezone: z.string().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Base ticket schema
 */
export const TicketSchema = z.object({
  id: z.string().uuid(),
  external_id: z.string().optional(),
  subject: z.string().min(1).max(200),
  description: z.string().min(1),
  status: TicketStatusSchema,
  priority: TicketPrioritySchema,
  channel: TicketChannelSchema,
  customer: CustomerSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
  due_date: z.string().datetime().optional(),
  resolved_at: z.string().datetime().optional(),
  assignee_id: z.string().uuid().optional(),
  queue_id: z.string().uuid().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).default([]),
  attachments: z.array(z.object({
    id: z.string().uuid(),
    filename: z.string(),
    content_type: z.string(),
    size_bytes: z.number().positive(),
    url: z.string().url(),
  })).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
  sla_breach_at: z.string().datetime().optional(),
});

/**
 * Ticket received event data schema
 */
export const TicketReceivedEventSchema = z.object({
  ticket: TicketSchema,
  source_system: z.string(),
  received_at: z.string().datetime(),
  raw_content: z.string().optional(),
  metadata: EventMetadataSchema.optional(),
});

/**
 * Ticket validation result schema
 */
export const TicketValidationResultSchema = z.object({
  ticket_id: z.string().uuid(),
  is_valid: z.boolean(),
  validation_errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string(),
  })).optional(),
  validated_at: z.string().datetime(),
  metadata: EventMetadataSchema.optional(),
});

/**
 * Ticket update event schema
 */
export const TicketUpdatedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  previous_state: TicketSchema.partial(),
  current_state: TicketSchema,
  changed_fields: z.array(z.string()),
  updated_by: z.string().uuid().optional(),
  update_reason: z.string().optional(),
  updated_at: z.string().datetime(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// CLASSIFICATION DOMAIN SCHEMAS
// ============================================================================

/**
 * Intent classification confidence levels
 */
export const ConfidenceLevelSchema = z.enum(["low", "medium", "high", "very_high"]);

/**
 * Intent classification result schema
 */
export const IntentClassificationSchema = z.object({
  intent: z.string(),
  confidence_score: z.number().min(0).max(1),
  confidence_level: ConfidenceLevelSchema,
  sub_intents: z.array(z.object({
    intent: z.string(),
    confidence_score: z.number().min(0).max(1),
  })).optional(),
  entities: z.array(z.object({
    entity: z.string(),
    value: z.string(),
    confidence_score: z.number().min(0).max(1),
    start_position: z.number().int().min(0).optional(),
    end_position: z.number().int().min(0).optional(),
  })).optional(),
  sentiment: z.object({
    polarity: z.enum(["positive", "negative", "neutral"]),
    score: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
  }).optional(),
  language_detected: z.string().length(2).optional(),
  topics: z.array(z.string()).optional(),
});

/**
 * Intent classified event schema
 */
export const IntentClassifiedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  classification_result: IntentClassificationSchema,
  model_version: z.string(),
  processing_time_ms: z.number().positive(),
  classified_at: z.string().datetime(),
  classifier_id: z.string(),
  training_data_version: z.string().optional(),
  fallback_used: z.boolean().default(false),
  metadata: EventMetadataSchema.optional(),
});

/**
 * Classification failure event schema
 */
export const ClassificationFailedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  error: ErrorInfoSchema,
  attempted_at: z.string().datetime(),
  input_text: z.string().optional(),
  classifier_id: z.string(),
  model_version: z.string().optional(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// ROUTING DOMAIN SCHEMAS
// ============================================================================

/**
 * Queue information schema
 */
export const QueueSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  capacity: z.number().int().positive(),
  current_load: z.number().int().min(0),
  priority_weight: z.number().min(0).max(100),
  skills_required: z.array(z.string()).optional(),
  availability: z.object({
    timezone: z.string(),
    business_hours: z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }),
    days_of_week: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
  }).optional(),
  sla_targets: z.object({
    first_response_minutes: z.number().positive(),
    resolution_minutes: z.number().positive(),
  }).optional(),
});

/**
 * Agent information schema
 */
export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  skills: z.array(z.string()),
  capacity: z.number().int().positive(),
  current_load: z.number().int().min(0),
  availability_status: z.enum(["available", "busy", "away", "offline"]),
  language_codes: z.array(z.string().length(2)),
  performance_rating: z.number().min(0).max(5).optional(),
  specializations: z.array(z.string()).optional(),
});

/**
 * Routing decision schema
 */
export const RoutingDecisionSchema = z.object({
  strategy: z.enum(["round_robin", "priority", "skill_based", "load_balanced", "manual"]),
  reason: z.string(),
  confidence_score: z.number().min(0).max(1),
  alternative_options: z.array(z.object({
    queue_id: z.string().uuid().optional(),
    agent_id: z.string().uuid().optional(),
    score: z.number().min(0).max(1),
    reason: z.string(),
  })).optional(),
  factors_considered: z.array(z.string()),
  processing_time_ms: z.number().positive(),
});

/**
 * Ticket routed event schema
 */
export const TicketRoutedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  queue: QueueSchema.optional(),
  agent: AgentSchema.optional(),
  routing_decision: RoutingDecisionSchema,
  routed_at: z.string().datetime(),
  estimated_wait_time_minutes: z.number().int().min(0).optional(),
  sla_deadline: z.string().datetime().optional(),
  escalation_path: z.array(z.object({
    level: z.number().int().positive(),
    queue_id: z.string().uuid(),
    trigger_after_minutes: z.number().int().positive(),
  })).optional(),
  metadata: EventMetadataSchema.optional(),
});

/**
 * Routing failure event schema
 */
export const RoutingFailedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  error: ErrorInfoSchema,
  attempted_strategies: z.array(z.string()),
  available_queues: z.array(QueueSchema),
  attempted_at: z.string().datetime(),
  fallback_queue_id: z.string().uuid().optional(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// RESPONSE DOMAIN SCHEMAS
// ============================================================================

/**
 * Response types
 */
export const ResponseTypeSchema = z.enum([
  "auto_generated",
  "template_based",
  "human_generated",
  "hybrid",
  "knowledge_base",
]);

/**
 * Response channel schema
 */
export const ResponseChannelSchema = z.enum([
  "email",
  "chat",
  "sms",
  "phone",
  "web_portal",
  "api",
  "push_notification",
]);

/**
 * Response content schema
 */
export const ResponseContentSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
  format: z.enum(["plain_text", "html", "markdown"]).default("plain_text"),
  attachments: z.array(z.object({
    id: z.string().uuid(),
    filename: z.string(),
    content_type: z.string(),
    size_bytes: z.number().positive(),
    url: z.string().url(),
  })).optional(),
  templates_used: z.array(z.string()).optional(),
  personalization_data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Response quality metrics schema
 */
export const ResponseQualitySchema = z.object({
  relevance_score: z.number().min(0).max(1).optional(),
  sentiment_appropriateness: z.number().min(0).max(1).optional(),
  language_quality: z.number().min(0).max(1).optional(),
  completeness_score: z.number().min(0).max(1).optional(),
  estimated_customer_satisfaction: z.number().min(0).max(5).optional(),
  response_length_words: z.number().int().positive().optional(),
  reading_level: z.string().optional(),
});

/**
 * Response generated event schema
 */
export const ResponseGeneratedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  response_id: z.string().uuid(),
  response_type: ResponseTypeSchema,
  content: ResponseContentSchema,
  channel: ResponseChannelSchema,
  generated_by: z.string(), // AI model name or agent ID
  generation_method: z.string(),
  processing_time_ms: z.number().positive(),
  quality_metrics: ResponseQualitySchema.optional(),
  knowledge_sources: z.array(z.object({
    source_id: z.string(),
    source_type: z.enum(["knowledge_base", "faq", "previous_tickets", "documentation"]),
    relevance_score: z.number().min(0).max(1),
    content_snippet: z.string().optional(),
  })).optional(),
  generated_at: z.string().datetime(),
  requires_approval: z.boolean().default(false),
  approved_by: z.string().uuid().optional(),
  approved_at: z.string().datetime().optional(),
  metadata: EventMetadataSchema.optional(),
});

/**
 * Response sent event schema
 */
export const ResponseSentEventSchema = z.object({
  ticket_id: z.string().uuid(),
  response_id: z.string().uuid(),
  channel: ResponseChannelSchema,
  recipient: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    user_id: z.string().uuid().optional(),
    external_id: z.string().optional(),
  }),
  delivery_status: z.enum(["sent", "delivered", "failed", "bounced", "pending"]),
  delivery_attempts: z.number().int().min(0).default(1),
  sent_at: z.string().datetime(),
  delivered_at: z.string().datetime().optional(),
  tracking_id: z.string().optional(),
  delivery_error: ErrorInfoSchema.optional(),
  metadata: EventMetadataSchema.optional(),
});

/**
 * Response failure event schema
 */
export const ResponseFailedEventSchema = z.object({
  ticket_id: z.string().uuid(),
  response_id: z.string().uuid().optional(),
  error: ErrorInfoSchema,
  failure_stage: z.enum(["generation", "approval", "sending", "delivery"]),
  attempted_at: z.string().datetime(),
  input_context: z.record(z.string(), z.unknown()).optional(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// KNOWLEDGE BASE DOMAIN SCHEMAS
// ============================================================================

/**
 * Search query schema
 */
export const SearchQuerySchema = z.object({
  query_text: z.string().min(1),
  query_type: z.enum(["semantic", "keyword", "hybrid", "fuzzy"]),
  filters: z.object({
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    language: z.string().length(2).optional(),
    content_type: z.array(z.string()).optional(),
    last_updated_after: z.string().datetime().optional(),
  }).optional(),
  search_options: z.object({
    max_results: z.number().int().positive().default(10),
    include_snippets: z.boolean().default(true),
    boost_recent: z.boolean().default(false),
    minimum_score: z.number().min(0).max(1).optional(),
  }).optional(),
});

/**
 * Knowledge base article schema
 */
export const KnowledgeArticleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  category: z.string(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()),
  language: z.string().length(2),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  author_id: z.string().uuid(),
  status: z.enum(["draft", "published", "archived", "under_review"]),
  view_count: z.number().int().min(0).default(0),
  helpful_votes: z.number().int().min(0).default(0),
  rating: z.number().min(0).max(5).optional(),
  related_articles: z.array(z.string().uuid()).optional(),
});

/**
 * Search result schema
 */
export const SearchResultSchema = z.object({
  article: KnowledgeArticleSchema,
  relevance_score: z.number().min(0).max(1),
  snippet: z.string().optional(),
  matched_sections: z.array(z.object({
    section_title: z.string(),
    content_snippet: z.string(),
    score: z.number().min(0).max(1),
  })).optional(),
  explanation: z.string().optional(),
});

/**
 * Knowledge base search completed event schema
 */
export const KBSearchCompletedEventSchema = z.object({
  search_id: z.string().uuid(),
  ticket_id: z.string().uuid().optional(),
  query: SearchQuerySchema,
  results: z.array(SearchResultSchema),
  total_results: z.number().int().min(0),
  search_time_ms: z.number().positive(),
  search_engine: z.string(),
  searched_at: z.string().datetime(),
  search_quality: z.object({
    result_diversity: z.number().min(0).max(1).optional(),
    average_relevance: z.number().min(0).max(1).optional(),
    coverage_score: z.number().min(0).max(1).optional(),
  }).optional(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// SYSTEM DOMAIN SCHEMAS
// ============================================================================

/**
 * Service health status schema
 */
export const ServiceHealthSchema = z.object({
  service_name: z.string(),
  status: z.enum(["healthy", "degraded", "unhealthy", "unknown"]),
  version: z.string(),
  uptime_seconds: z.number().int().min(0),
  cpu_usage_percent: z.number().min(0).max(100).optional(),
  memory_usage_percent: z.number().min(0).max(100).optional(),
  disk_usage_percent: z.number().min(0).max(100).optional(),
  response_time_ms: z.number().positive().optional(),
  error_rate_percent: z.number().min(0).max(100).optional(),
  active_connections: z.number().int().min(0).optional(),
  queue_depth: z.number().int().min(0).optional(),
  last_health_check: z.string().datetime(),
  dependencies: z.array(z.object({
    name: z.string(),
    status: z.enum(["healthy", "degraded", "unhealthy", "unknown"]),
    response_time_ms: z.number().positive().optional(),
  })).optional(),
});

/**
 * Service health check event schema
 */
export const ServiceHealthCheckEventSchema = z.object({
  health: ServiceHealthSchema,
  check_type: z.enum(["scheduled", "manual", "startup", "shutdown"]),
  previous_status: z.enum(["healthy", "degraded", "unhealthy", "unknown"]).optional(),
  status_changed: z.boolean(),
  alerts_triggered: z.array(z.string()).optional(),
  checked_at: z.string().datetime(),
  metadata: EventMetadataSchema.optional(),
});

/**
 * System error event schema
 */
export const SystemErrorEventSchema = z.object({
  error: ErrorInfoSchema,
  service_name: z.string(),
  error_category: z.enum([
    "database",
    "network",
    "memory",
    "disk",
    "configuration",
    "dependency",
    "timeout",
    "validation",
    "authentication",
    "authorization",
    "rate_limit",
    "unknown",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  affected_operations: z.array(z.string()).optional(),
  recovery_action: z.string().optional(),
  occurred_at: z.string().datetime(),
  resolved_at: z.string().datetime().optional(),
  user_impact: z.enum(["none", "minimal", "moderate", "significant", "severe"]).optional(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// METRICS DOMAIN SCHEMAS
// ============================================================================

/**
 * Metric data point schema
 */
export const MetricDataPointSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  timestamp: z.string().datetime(),
  dimensions: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Metrics collected event schema
 */
export const MetricsCollectedEventSchema = z.object({
  collection_id: z.string().uuid(),
  source_service: z.string(),
  metrics: z.array(MetricDataPointSchema).min(1),
  collection_period: z.object({
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
  }),
  collection_method: z.enum(["push", "pull", "scheduled", "event_driven"]),
  collected_at: z.string().datetime(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// AUDIT DOMAIN SCHEMAS
// ============================================================================

/**
 * Audit action schema
 */
export const AuditActionSchema = z.object({
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string(),
  actor_id: z.string().uuid(),
  actor_type: z.enum(["user", "system", "api_key", "service"]),
  timestamp: z.string().datetime(),
  ip_address: z.string().ip().optional(),
  user_agent: z.string().optional(),
  before_state: z.record(z.string(), z.unknown()).optional(),
  after_state: z.record(z.string(), z.unknown()).optional(),
  changes: z.array(z.object({
    field: z.string(),
    old_value: z.unknown(),
    new_value: z.unknown(),
  })).optional(),
  reason: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
});

/**
 * Audit log created event schema
 */
export const AuditLogCreatedEventSchema = z.object({
  audit_id: z.string().uuid(),
  action: AuditActionSchema,
  compliance_tags: z.array(z.string()).optional(),
  retention_period_days: z.number().int().positive().optional(),
  encryption_level: z.enum(["none", "standard", "high", "maximum"]).default("standard"),
  logged_at: z.string().datetime(),
  metadata: EventMetadataSchema.optional(),
});

// ============================================================================
// EVENT BUILDER FUNCTIONS
// ============================================================================

/**
 * Type-safe event builder functions
 */
export class EventBuilders {
  /**
   * Create a ticket received event
   */
  static ticketReceived(data: z.infer<typeof TicketReceivedEventSchema>) {
    return {
      type: EventTypes.TICKET_RECEIVED,
      data: TicketReceivedEventSchema.parse(data),
      schema: TicketReceivedEventSchema,
    };
  }

  /**
   * Create a ticket validated event
   */
  static ticketValidated(data: z.infer<typeof TicketValidationResultSchema>) {
    return {
      type: EventTypes.TICKET_VALIDATED,
      data: TicketValidationResultSchema.parse(data),
      schema: TicketValidationResultSchema,
    };
  }

  /**
   * Create an intent classified event
   */
  static intentClassified(data: z.infer<typeof IntentClassifiedEventSchema>) {
    return {
      type: EventTypes.INTENT_CLASSIFIED,
      data: IntentClassifiedEventSchema.parse(data),
      schema: IntentClassifiedEventSchema,
    };
  }

  /**
   * Create a ticket routed event
   */
  static ticketRouted(data: z.infer<typeof TicketRoutedEventSchema>) {
    return {
      type: EventTypes.TICKET_ROUTED,
      data: TicketRoutedEventSchema.parse(data),
      schema: TicketRoutedEventSchema,
    };
  }

  /**
   * Create a response generated event
   */
  static responseGenerated(data: z.infer<typeof ResponseGeneratedEventSchema>) {
    return {
      type: EventTypes.RESPONSE_GENERATED,
      data: ResponseGeneratedEventSchema.parse(data),
      schema: ResponseGeneratedEventSchema,
    };
  }

  /**
   * Create a KB search completed event
   */
  static kbSearchCompleted(data: z.infer<typeof KBSearchCompletedEventSchema>) {
    return {
      type: EventTypes.KB_SEARCH_COMPLETED,
      data: KBSearchCompletedEventSchema.parse(data),
      schema: KBSearchCompletedEventSchema,
    };
  }

  /**
   * Create a service health check event
   */
  static serviceHealthCheck(data: z.infer<typeof ServiceHealthCheckEventSchema>) {
    return {
      type: EventTypes.SERVICE_HEALTH_CHECK,
      data: ServiceHealthCheckEventSchema.parse(data),
      schema: ServiceHealthCheckEventSchema,
    };
  }

  /**
   * Create a system error event
   */
  static systemError(data: z.infer<typeof SystemErrorEventSchema>) {
    return {
      type: EventTypes.SERVICE_ERROR,
      data: SystemErrorEventSchema.parse(data),
      schema: SystemErrorEventSchema,
    };
  }

  /**
   * Create metrics collected event
   */
  static metricsCollected(data: z.infer<typeof MetricsCollectedEventSchema>) {
    return {
      type: EventTypes.METRICS_COLLECTED,
      data: MetricsCollectedEventSchema.parse(data),
      schema: MetricsCollectedEventSchema,
    };
  }

  /**
   * Create audit log created event
   */
  static auditLogCreated(data: z.infer<typeof AuditLogCreatedEventSchema>) {
    return {
      type: EventTypes.AUDIT_LOG_CREATED,
      data: AuditLogCreatedEventSchema.parse(data),
      schema: AuditLogCreatedEventSchema,
    };
  }
}

// ============================================================================
// EVENT VALIDATION HELPERS
// ============================================================================

/**
 * Map of event types to their corresponding schemas
 */
export const EventSchemaRegistry = {
  [EventTypes.TICKET_RECEIVED]: TicketReceivedEventSchema,
  [EventTypes.TICKET_VALIDATED]: TicketValidationResultSchema,
  [EventTypes.TICKET_INVALID]: TicketValidationResultSchema,
  [EventTypes.TICKET_UPDATED]: TicketUpdatedEventSchema,
  [EventTypes.INTENT_CLASSIFIED]: IntentClassifiedEventSchema,
  [EventTypes.INTENT_CLASSIFICATION_FAILED]: ClassificationFailedEventSchema,
  [EventTypes.TICKET_ROUTED]: TicketRoutedEventSchema,
  [EventTypes.ROUTING_FAILED]: RoutingFailedEventSchema,
  [EventTypes.RESPONSE_GENERATED]: ResponseGeneratedEventSchema,
  [EventTypes.RESPONSE_SENT]: ResponseSentEventSchema,
  [EventTypes.RESPONSE_FAILED]: ResponseFailedEventSchema,
  [EventTypes.KB_SEARCH_COMPLETED]: KBSearchCompletedEventSchema,
  [EventTypes.SERVICE_HEALTH_CHECK]: ServiceHealthCheckEventSchema,
  [EventTypes.SERVICE_ERROR]: SystemErrorEventSchema,
  [EventTypes.METRICS_COLLECTED]: MetricsCollectedEventSchema,
  [EventTypes.AUDIT_LOG_CREATED]: AuditLogCreatedEventSchema,
} as const;

/**
 * Get schema for a specific event type
 */
export function getEventSchema(eventType: string): z.ZodSchema | undefined {
  return EventSchemaRegistry[eventType as keyof typeof EventSchemaRegistry];
}

/**
 * Validate event data against its schema
 */
export function validateEventData(eventType: string, data: unknown): {
  isValid: boolean;
  errors?: z.ZodError;
  validatedData?: unknown;
} {
  const schema = getEventSchema(eventType);
  
  if (!schema) {
    return {
      isValid: false,
      errors: new z.ZodError([{
        code: "custom",
        message: `No schema found for event type: ${eventType}`,
        path: [],
      }]),
    };
  }

  try {
    const validatedData = schema.parse(data);
    return { isValid: true, validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, errors: error };
    }
    throw error;
  }
}

/**
 * Safe parsing with detailed error information
 */
export function safeParseEvent<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  return result;
}

// ============================================================================
// EVENT VERSIONING SUPPORT
// ============================================================================

/**
 * Event schema version information
 */
export interface EventSchemaVersion {
  version: string;
  schema: z.ZodSchema;
  deprecated?: boolean;
  migration?: (oldData: unknown) => unknown;
}

/**
 * Versioned event schema registry
 */
export class VersionedEventSchemas {
  private versions = new Map<string, Map<string, EventSchemaVersion>>();

  /**
   * Register a schema version
   */
  registerVersion(
    eventType: string,
    version: string,
    schemaInfo: EventSchemaVersion
  ): void {
    if (!this.versions.has(eventType)) {
      this.versions.set(eventType, new Map());
    }
    this.versions.get(eventType)!.set(version, schemaInfo);
  }

  /**
   * Get schema for specific version
   */
  getSchema(eventType: string, version: string): z.ZodSchema | undefined {
    return this.versions.get(eventType)?.get(version)?.schema;
  }

  /**
   * Get latest schema version
   */
  getLatestSchema(eventType: string): EventSchemaVersion | undefined {
    const versions = this.versions.get(eventType);
    if (!versions) return undefined;

    // Sort by version and return the latest
    const sortedVersions = Array.from(versions.entries())
      .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
    
    return sortedVersions[0]?.[1];
  }

  /**
   * Migrate event data to latest version
   */
  migrateToLatest(eventType: string, data: unknown, fromVersion: string): unknown {
    const versions = this.versions.get(eventType);
    if (!versions) return data;

    const fromVersionInfo = versions.get(fromVersion);
    const latestVersionInfo = this.getLatestSchema(eventType);

    if (!fromVersionInfo || !latestVersionInfo) return data;
    if (fromVersion === latestVersionInfo.version) return data;

    // Apply migration if available
    if (fromVersionInfo.migration) {
      return fromVersionInfo.migration(data);
    }

    return data;
  }
}

// Default versioned schemas instance
export const versionedSchemas = new VersionedEventSchemas();

// Register current schemas as version 1.0
Object.entries(EventSchemaRegistry).forEach(([eventType, schema]) => {
  versionedSchemas.registerVersion(eventType, "1.0", {
    version: "1.0",
    schema,
  });
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Export all inferred types for use throughout the application
export type EventMetadata = z.infer<typeof EventMetadataSchema>;
export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;
export type ProcessingContext = z.infer<typeof ProcessingContextSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type TicketReceivedEvent = z.infer<typeof TicketReceivedEventSchema>;
export type TicketValidationResult = z.infer<typeof TicketValidationResultSchema>;
export type TicketUpdatedEvent = z.infer<typeof TicketUpdatedEventSchema>;
export type IntentClassification = z.infer<typeof IntentClassificationSchema>;
export type IntentClassifiedEvent = z.infer<typeof IntentClassifiedEventSchema>;
export type ClassificationFailedEvent = z.infer<typeof ClassificationFailedEventSchema>;
export type Queue = z.infer<typeof QueueSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type TicketRoutedEvent = z.infer<typeof TicketRoutedEventSchema>;
export type RoutingFailedEvent = z.infer<typeof RoutingFailedEventSchema>;
export type ResponseContent = z.infer<typeof ResponseContentSchema>;
export type ResponseQuality = z.infer<typeof ResponseQualitySchema>;
export type ResponseGeneratedEvent = z.infer<typeof ResponseGeneratedEventSchema>;
export type ResponseSentEvent = z.infer<typeof ResponseSentEventSchema>;
export type ResponseFailedEvent = z.infer<typeof ResponseFailedEventSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type KnowledgeArticle = z.infer<typeof KnowledgeArticleSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type KBSearchCompletedEvent = z.infer<typeof KBSearchCompletedEventSchema>;
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;
export type ServiceHealthCheckEvent = z.infer<typeof ServiceHealthCheckEventSchema>;
export type SystemErrorEvent = z.infer<typeof SystemErrorEventSchema>;
export type MetricDataPoint = z.infer<typeof MetricDataPointSchema>;
export type MetricsCollectedEvent = z.infer<typeof MetricsCollectedEventSchema>;
export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditLogCreatedEvent = z.infer<typeof AuditLogCreatedEventSchema>;