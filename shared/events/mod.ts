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
  validateEventData,
  safeParseEvent,
  VersionedEventSchemas,
  versionedSchemas,
} from "./schemas.ts";

export type {
  // Base types
  EventMetadata as EventMetadataV2,
  ErrorInfo,
  ProcessingContext,
  
  // Ticket domain types
  Ticket,
  Customer,
  TicketReceivedEvent,
  TicketValidationResult,
  TicketUpdatedEvent,
  
  // Classification domain types
  IntentClassification,
  IntentClassifiedEvent,
  ClassificationFailedEvent,
  
  // Routing domain types
  Queue,
  Agent,
  RoutingDecision,
  TicketRoutedEvent,
  RoutingFailedEvent,
  
  // Response domain types
  ResponseContent,
  ResponseQuality,
  ResponseGeneratedEvent,
  ResponseSentEvent,
  ResponseFailedEvent,
  
  // Knowledge base types
  SearchQuery,
  KnowledgeArticle,
  SearchResult,
  KBSearchCompletedEvent,
  
  // System types
  ServiceHealth,
  ServiceHealthCheckEvent,
  SystemErrorEvent,
  
  // Metrics types
  MetricDataPoint,
  MetricsCollectedEvent,
  
  // Audit types
  AuditAction,
  AuditLogCreatedEvent,
  
  // Schema version types
  EventSchemaVersion,
} from "./schemas.ts";

// All schemas for direct access
export {
  EventMetadataSchema,
  ErrorInfoSchema,
  ProcessingContextSchema,
  TicketSchema,
  CustomerSchema,
  TicketReceivedEventSchema,
  TicketValidationResultSchema,
  TicketUpdatedEventSchema,
  IntentClassificationSchema,
  IntentClassifiedEventSchema,
  ClassificationFailedEventSchema,
  QueueSchema,
  AgentSchema,
  RoutingDecisionSchema,
  TicketRoutedEventSchema,
  RoutingFailedEventSchema,
  ResponseContentSchema,
  ResponseQualitySchema,
  ResponseGeneratedEventSchema,
  ResponseSentEventSchema,
  ResponseFailedEventSchema,
  SearchQuerySchema,
  KnowledgeArticleSchema,
  SearchResultSchema,
  KBSearchCompletedEventSchema,
  ServiceHealthSchema,
  ServiceHealthCheckEventSchema,
  SystemErrorEventSchema,
  MetricDataPointSchema,
  MetricsCollectedEventSchema,
  AuditActionSchema,
  AuditLogCreatedEventSchema,
} from "./schemas.ts";
