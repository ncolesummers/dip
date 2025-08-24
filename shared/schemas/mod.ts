/**
 * Schemas module exports
 * Central export point for all validation schemas
 */

// Export all ticket-related schemas
export {
  CreateTicketRequestSchema,
  CustomerSchema,
  IntentClassifiedEventSchema,
  IntentSchema,
  KBArticleSchema,
  KBSearchResultEventSchema,
  ResponseGeneratedEventSchema,
  ResponseSchema,
  RoutingDecisionSchema,
  TicketPrioritySchema,
  TicketReceivedEventSchema,
  TicketRoutedEventSchema,
  TicketSchema,
  TicketSourceSchema,
  TicketStatusSchema,
  UpdateTicketRequestSchema,
} from "./ticket.ts";

export type {
  CreateTicketRequest,
  Customer,
  Intent,
  IntentClassifiedEvent,
  KBArticle,
  KBSearchResultEvent,
  Response,
  ResponseGeneratedEvent,
  RoutingDecision,
  Ticket,
  TicketPriority,
  TicketReceivedEvent,
  TicketRoutedEvent,
  TicketSource,
  TicketStatus,
  UpdateTicketRequest,
} from "./ticket.ts";

// Export all common schemas
export {
  AddressSchema,
  ApiResponseSchema,
  AuditLogSchema,
  CoordinateSchema,
  DateTimeSchema,
  EmailSchema,
  EnvSchema,
  ErrorResponseSchema,
  FileUploadSchema,
  HealthStatusSchema,
  HexColorSchema,
  MetadataSchema,
  PaginatedResponseSchema,
  PaginationSchema,
  PhoneNumberSchema,
  RateLimitSchema,
  ServiceInfoSchema,
  SuccessResponseSchema,
  TimeRangeSchema,
  URLSchema,
  UUIDSchema,
  validateEnv,
} from "./common.ts";

export type {
  Address,
  AuditLog,
  Coordinate,
  DateTime,
  Email,
  Env,
  ErrorResponse,
  FileUpload,
  HealthStatus,
  HexColor,
  Metadata,
  Pagination,
  PhoneNumber,
  RateLimit,
  ServiceInfo,
  TimeRange,
  URL,
  UUID,
} from "./common.ts";
