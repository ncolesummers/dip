/**
 * Event type constants and registry
 * Central location for all event types in the system
 */

/**
 * Event type naming convention:
 * {domain}.{entity}.{action}
 * Example: ticket.received, intent.classified
 */

export const EventTypes = {
  // Ticket events
  TICKET_RECEIVED: "com.dip.ticket.received",
  TICKET_VALIDATED: "com.dip.ticket.validated",
  TICKET_INVALID: "com.dip.ticket.invalid",
  TICKET_UPDATED: "com.dip.ticket.updated",
  TICKET_CLOSED: "com.dip.ticket.closed",
  TICKET_REOPENED: "com.dip.ticket.reopened",
  TICKET_ESCALATED: "com.dip.ticket.escalated",

  // Classification events
  INTENT_CLASSIFIED: "com.dip.intent.classified",
  INTENT_CLASSIFICATION_FAILED: "com.dip.intent.classification.failed",
  INTENT_UPDATED: "com.dip.intent.updated",

  // Routing events
  TICKET_ROUTED: "com.dip.routing.routed",
  ROUTING_FAILED: "com.dip.routing.failed",
  QUEUE_ASSIGNED: "com.dip.routing.queue.assigned",
  AGENT_ASSIGNED: "com.dip.routing.agent.assigned",

  // Response events
  RESPONSE_GENERATED: "com.dip.response.generated",
  RESPONSE_SENT: "com.dip.response.sent",
  RESPONSE_FAILED: "com.dip.response.failed",
  AUTO_RESPONSE_TRIGGERED: "com.dip.response.auto.triggered",

  // Knowledge base events
  KB_SEARCH_REQUESTED: "com.dip.kb.search.requested",
  KB_SEARCH_COMPLETED: "com.dip.kb.search.completed",
  KB_ARTICLE_SUGGESTED: "com.dip.kb.article.suggested",
  KB_ARTICLE_VIEWED: "com.dip.kb.article.viewed",

  // System events
  SERVICE_STARTED: "com.dip.system.service.started",
  SERVICE_STOPPED: "com.dip.system.service.stopped",
  SERVICE_HEALTH_CHECK: "com.dip.system.health.check",
  SERVICE_ERROR: "com.dip.system.error",

  // Metrics events
  METRICS_COLLECTED: "com.dip.metrics.collected",
  METRICS_REPORTED: "com.dip.metrics.reported",

  // Audit events
  AUDIT_LOG_CREATED: "com.dip.audit.log.created",
  AUDIT_ACTION_PERFORMED: "com.dip.audit.action.performed",
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

/**
 * Event sources (services that produce events)
 */
export const EventSources = {
  INGESTION_SERVICE: "com.dip.services.ingestion",
  CLASSIFIER_SERVICE: "com.dip.services.classifier",
  ROUTING_SERVICE: "com.dip.services.routing",
  RESPONSE_SERVICE: "com.dip.services.response",
  KB_SERVICE: "com.dip.services.kb",
  AUDIT_SERVICE: "com.dip.services.audit",
  METRICS_SERVICE: "com.dip.services.metrics",
  API_GATEWAY: "com.dip.gateway.api",
  SCHEDULER: "com.dip.scheduler",
  WORKFLOW_ENGINE: "com.dip.workflow",
} as const;

export type EventSource = typeof EventSources[keyof typeof EventSources];

/**
 * Event priority levels
 */
export enum EventPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Event status codes
 */
export enum EventStatus {
  SUCCESS = "success",
  FAILURE = "failure",
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  RETRY = "retry",
  TIMEOUT = "timeout",
  CANCELLED = "cancelled",
}

/**
 * Common event metadata interface
 */
export interface EventMetadata {
  version?: string;
  environment?: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  clientIp?: string;
  userAgent?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription {
  eventType: EventType | EventType[];
  handler: string;
  filter?: Record<string, unknown>;
  retry?: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
  deadLetter?: boolean;
  priority?: EventPriority;
}

/**
 * Event registry for documentation and validation
 */
export interface EventDefinition {
  type: EventType;
  source: EventSource;
  description: string;
  dataSchema?: string;
  examples?: unknown[];
  subscribers?: string[];
  producers?: string[];
}

/**
 * Event registry - documents all events in the system
 */
export const EventRegistry: Record<EventType, EventDefinition> = {
  [EventTypes.TICKET_RECEIVED]: {
    type: EventTypes.TICKET_RECEIVED,
    source: EventSources.INGESTION_SERVICE,
    description: "A new ticket has been received through the API",
    subscribers: [
      EventSources.CLASSIFIER_SERVICE,
      EventSources.AUDIT_SERVICE,
      EventSources.METRICS_SERVICE,
    ],
    producers: [EventSources.INGESTION_SERVICE],
  },

  [EventTypes.INTENT_CLASSIFIED]: {
    type: EventTypes.INTENT_CLASSIFIED,
    source: EventSources.CLASSIFIER_SERVICE,
    description: "Ticket intent has been classified by ML model",
    subscribers: [
      EventSources.ROUTING_SERVICE,
      EventSources.KB_SERVICE,
      EventSources.METRICS_SERVICE,
    ],
    producers: [EventSources.CLASSIFIER_SERVICE],
  },

  [EventTypes.TICKET_ROUTED]: {
    type: EventTypes.TICKET_ROUTED,
    source: EventSources.ROUTING_SERVICE,
    description: "Ticket has been routed to appropriate queue",
    subscribers: [
      EventSources.RESPONSE_SERVICE,
      EventSources.AUDIT_SERVICE,
    ],
    producers: [EventSources.ROUTING_SERVICE],
  },

  [EventTypes.RESPONSE_GENERATED]: {
    type: EventTypes.RESPONSE_GENERATED,
    source: EventSources.RESPONSE_SERVICE,
    description: "Response has been generated for the ticket",
    subscribers: [
      EventSources.AUDIT_SERVICE,
      EventSources.METRICS_SERVICE,
    ],
    producers: [EventSources.RESPONSE_SERVICE],
  },
  // Add more event definitions as needed
} as const;

/**
 * Helper to get event definition
 */
export function getEventDefinition(type: EventType): EventDefinition | undefined {
  return EventRegistry[type];
}

/**
 * Helper to get all events for a source
 */
export function getEventsBySource(source: EventSource): EventDefinition[] {
  return Object.values(EventRegistry).filter((def) => def.source === source);
}

/**
 * Helper to get all subscribers for an event
 */
export function getEventSubscribers(type: EventType): string[] {
  const definition = EventRegistry[type];
  return definition?.subscribers || [];
}

/**
 * Helper to validate event type
 */
export function isValidEventType(type: string): type is EventType {
  return Object.values(EventTypes).includes(type as EventType);
}

/**
 * Helper to validate event source
 */
export function isValidEventSource(source: string): source is EventSource {
  return Object.values(EventSources).includes(source as EventSource);
}
