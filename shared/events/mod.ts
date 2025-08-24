/**
 * Events module exports
 * Central export point for all event-related functionality
 */

export { CloudEventAttributesSchema, TypedCloudEvent } from "./base.ts";
export type { CloudEventAttributes } from "./base.ts";

export {
  EventPriority,
  EventRegistry,
  EventSources,
  EventStatus,
  EventTypes,
  getEventDefinition,
  getEventsBySource,
  getEventSubscribers,
  isValidEventSource,
  isValidEventType,
} from "./types.ts";

export type {
  EventDefinition,
  EventMetadata,
  EventSource,
  EventSubscription,
  EventType,
} from "./types.ts";

export { BatchCloudEventConsumer, CloudEventConsumer, createConsumer } from "./consumer.ts";

export type { ConsumerOptions, EventHandler } from "./consumer.ts";

export { CloudEventPublisher, createPublisher, ResilientCloudEventPublisher } from "./publisher.ts";

export type { PublisherOptions, PublishOptions } from "./publisher.ts";

// Schema exports
export {
  EventBuilders,
  EventSchemaRegistry,
  getEventSchema,
  safeParseEvent,
  validateEventData,
  VersionedEventSchemas,
  versionedSchemas,
} from "./schemas.ts";

export type {
  Agent,
  // Audit types
  AuditAction,
  AuditLogCreatedEvent,
  ClassificationFailedEvent,
  Customer,
  ErrorInfo,
  // Base types
  EventMetadata as EventMetadataV2,
  // Schema version types
  EventSchemaVersion,
  // Classification domain types
  IntentClassification,
  IntentClassifiedEvent,
  KBSearchCompletedEvent,
  KnowledgeArticle,
  // Metrics types
  MetricDataPoint,
  MetricsCollectedEvent,
  ProcessingContext,
  // Routing domain types
  Queue,
  // Response domain types
  ResponseContent,
  ResponseFailedEvent,
  ResponseGeneratedEvent,
  ResponseQuality,
  ResponseSentEvent,
  RoutingDecision,
  RoutingFailedEvent,
  // Knowledge base types
  SearchQuery,
  SearchResult,
  // System types
  ServiceHealth,
  ServiceHealthCheckEvent,
  SystemErrorEvent,
  // Ticket domain types
  Ticket,
  TicketReceivedEvent,
  TicketRoutedEvent,
  TicketUpdatedEvent,
  TicketValidationResult,
} from "./schemas.ts";

// All schemas for direct access
export {
  AgentSchema,
  AuditActionSchema,
  AuditLogCreatedEventSchema,
  ClassificationFailedEventSchema,
  CustomerSchema,
  ErrorInfoSchema,
  EventMetadataSchema,
  IntentClassificationSchema,
  IntentClassifiedEventSchema,
  KBSearchCompletedEventSchema,
  KnowledgeArticleSchema,
  MetricDataPointSchema,
  MetricsCollectedEventSchema,
  ProcessingContextSchema,
  QueueSchema,
  ResponseContentSchema,
  ResponseFailedEventSchema,
  ResponseGeneratedEventSchema,
  ResponseQualitySchema,
  ResponseSentEventSchema,
  RoutingDecisionSchema,
  RoutingFailedEventSchema,
  SearchQuerySchema,
  SearchResultSchema,
  ServiceHealthCheckEventSchema,
  ServiceHealthSchema,
  SystemErrorEventSchema,
  TicketReceivedEventSchema,
  TicketRoutedEventSchema,
  TicketSchema,
  TicketUpdatedEventSchema,
  TicketValidationResultSchema,
} from "./schemas.ts";
