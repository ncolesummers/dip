/**
 * TypedCloudEvent implementation with Zod validation
 * Provides type-safe CloudEvents with automatic schema validation
 */

import { CloudEventV1 } from "cloudevents";
import { z } from "zod";
import { nanoid } from "nanoid";
import { EventTypes, EventSources, type EventType, type EventSource } from "./types.ts";
import { getEventSchema } from "./schemas.ts";

// ============================================================================
// CUSTOM ERROR TYPES
// ============================================================================

/**
 * Base class for all CloudEvent-related errors
 */
export class CloudEventError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CloudEventError";
  }
}

/**
 * Error thrown when CloudEvent validation fails
 */
export class CloudEventValidationError extends CloudEventError {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodIssue[],
    public readonly field?: string
  ) {
    super(message, "VALIDATION_ERROR", { validationErrors, field });
    this.name = "CloudEventValidationError";
  }

  /**
   * Get formatted validation error messages
   */
  getFormattedErrors(): string[] {
    return this.validationErrors.map(error => {
      const path = error.path.length > 0 ? error.path.join(".") : "root";
      return `${path}: ${error.message}`;
    });
  }
}

/**
 * Error thrown when CloudEvent serialization/deserialization fails
 */
export class CloudEventSerializationError extends CloudEventError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, "SERIALIZATION_ERROR", { originalError: originalError?.message });
    this.name = "CloudEventSerializationError";
  }
}

/**
 * Error thrown when required CloudEvent fields are missing
 */
export class CloudEventMissingFieldError extends CloudEventError {
  constructor(fieldName: string, eventType?: string) {
    super(
      `Required CloudEvent field '${fieldName}' is missing${eventType ? ` for event type '${eventType}'` : ""}`,
      "MISSING_FIELD_ERROR",
      { fieldName, eventType }
    );
    this.name = "CloudEventMissingFieldError";
  }
}

/**
 * Error thrown when CloudEvent type is not supported
 */
export class CloudEventUnsupportedTypeError extends CloudEventError {
  constructor(eventType: string, supportedTypes?: string[]) {
    super(
      `Unsupported CloudEvent type '${eventType}'${supportedTypes ? `. Supported types: ${supportedTypes.join(", ")}` : ""}`,
      "UNSUPPORTED_TYPE_ERROR",
      { eventType, supportedTypes }
    );
    this.name = "CloudEventUnsupportedTypeError";
  }
}

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Base CloudEvent attributes schema following CloudEvents v1.0 specification
 */
export const CloudEventAttributesSchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  datacontenttype: z.string().optional().default("application/json"),
  dataschema: z.string().url().optional(),
  subject: z.string().optional(),
  time: z.string().datetime().optional(),
  correlationid: z.string().optional(),
  causationid: z.string().optional(),
  traceparent: z.string().optional(),
  tracestate: z.string().optional(),
});

export type CloudEventAttributes = z.infer<typeof CloudEventAttributesSchema>;

/**
 * TypedCloudEvent class with generic data type
 */
export class TypedCloudEvent<T = unknown> {
  private event: CloudEventV1<T>;
  private schema?: z.ZodSchema<T>;

  constructor(event: CloudEventV1<T>, schema?: z.ZodSchema<T>) {
    this.event = event;
    this.schema = schema;

    if (schema && event.data !== undefined) {
      this.validateData(event.data);
    }
  }

  /**
   * Create a new TypedCloudEvent with validated data
   */
  static create<T>(
    attributes: Omit<CloudEventV1<T>, "id" | "time" | "specversion"> & {
      id?: string;
      time?: string;
    },
    schema?: z.ZodSchema<T>,
  ): TypedCloudEvent<T> {
    try {
      const id = attributes.id || nanoid();
      const time = attributes.time || new Date().toISOString();

      const event: CloudEventV1<T> = {
        ...attributes,
        specversion: "1.0",
        id,
        time,
      } as CloudEventV1<T>;

      // Validate CloudEvent attributes
      const attributesValidation = CloudEventAttributesSchema.safeParse(event);
      if (!attributesValidation.success) {
        throw new CloudEventValidationError(
          "CloudEvent attributes validation failed",
          attributesValidation.error.errors
        );
      }

      return new TypedCloudEvent(event, schema);
    } catch (error) {
      if (error instanceof CloudEventError) {
        throw error;
      }
      throw new CloudEventError(
        `Failed to create TypedCloudEvent: ${error instanceof Error ? error.message : "Unknown error"}`,
        "CREATION_ERROR",
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Create from a raw CloudEvent with validation
   */
  static fromCloudEvent<T>(
    event: CloudEventV1<unknown>,
    schema: z.ZodSchema<T>,
  ): TypedCloudEvent<T> {
    try {
      // Validate CloudEvent attributes
      const attributesValidation = CloudEventAttributesSchema.safeParse(event);
      if (!attributesValidation.success) {
        throw new CloudEventValidationError(
          "CloudEvent attributes validation failed",
          attributesValidation.error.errors
        );
      }

      // Validate data if present
      if (event.data !== undefined) {
        const dataValidation = schema.safeParse(event.data);
        if (!dataValidation.success) {
          throw new CloudEventValidationError(
            "CloudEvent data validation failed",
            dataValidation.error.errors,
            "data"
          );
        }
        
        const typedEvent: CloudEventV1<T> = {
          ...event,
          data: dataValidation.data,
        };
        
        return new TypedCloudEvent(typedEvent, schema);
      }

      const typedEvent: CloudEventV1<T> = { ...event } as CloudEventV1<T>;
      return new TypedCloudEvent(typedEvent, schema);
    } catch (error) {
      if (error instanceof CloudEventError) {
        throw error;
      }
      throw new CloudEventError(
        `Failed to create TypedCloudEvent from CloudEvent: ${error instanceof Error ? error.message : "Unknown error"}`,
        "FROM_CLOUDEVENT_ERROR",
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Validate data against schema
   */
  private validateData(data: T): void {
    if (this.schema) {
      const result = this.schema.safeParse(data);
      if (!result.success) {
        throw new CloudEventValidationError(
          "CloudEvent data validation failed",
          result.error.errors,
          "data"
        );
      }
    }
  }

  /**
   * Get validated data
   */
  getData(): T | undefined {
    return this.event.data;
  }

  /**
   * Get parsed and validated data (throws if invalid)
   */
  getParsedData(): T {
    if (this.schema && this.event.data !== undefined) {
      return this.schema.parse(this.event.data);
    }
    if (this.event.data === undefined) {
      throw new Error("Event has no data");
    }
    return this.event.data;
  }

  /**
   * Get event attributes
   */
  getAttributes(): CloudEventV1<T> {
    return this.event;
  }

  /**
   * Get specific attribute
   */
  getAttribute<K extends keyof CloudEventV1<T>>(key: K): CloudEventV1<T>[K] {
    return this.event[key];
  }

  /**
   * Set correlation ID for event chaining
   */
  setCorrelationId(correlationId: string): void {
    (this.event as Record<string, unknown>).correlationid = correlationId;
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(): string | undefined {
    return (this.event as Record<string, unknown>).correlationid as string | undefined;
  }

  /**
   * Set causation ID (ID of the event that caused this one)
   */
  setCausationId(causationId: string): void {
    (this.event as Record<string, unknown>).causationid = causationId;
  }

  /**
   * Get causation ID
   */
  getCausationId(): string | undefined {
    return (this.event as Record<string, unknown>).causationid as string | undefined;
  }

  /**
   * Create a response event with correlation
   */
  createResponse<R>(
    type: string,
    data: R,
    schema?: z.ZodSchema<R>,
  ): TypedCloudEvent<R> {
    const correlationId = this.getCorrelationId() || this.event.id;

    const responseEvent = TypedCloudEvent.create(
      {
        source: this.event.source,
        type,
        data,
        subject: this.event.subject,
        datacontenttype: "application/json",
      },
      schema,
    );

    responseEvent.setCorrelationId(correlationId);
    responseEvent.setCausationId(this.event.id);

    return responseEvent;
  }

  /**
   * Convert to plain CloudEvent
   */
  toCloudEvent(): CloudEventV1<T> {
    return this.event;
  }

  /**
   * Convert to JSON string
   */
  toJSON(): string {
    try {
      return JSON.stringify(this.event, null, 0);
    } catch (error) {
      throw new CloudEventSerializationError(
        `Failed to serialize CloudEvent to JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert to pretty-printed JSON string
   */
  toPrettyJSON(): string {
    try {
      return JSON.stringify(this.event, null, 2);
    } catch (error) {
      throw new CloudEventSerializationError(
        `Failed to serialize CloudEvent to pretty JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Parse from JSON string
   */
  static fromJSON<T>(json: string, schema?: z.ZodSchema<T>): TypedCloudEvent<T> {
    try {
      const event = JSON.parse(json) as CloudEventV1<T>;
      
      // Auto-detect schema if not provided and event type is known
      if (!schema && event.type) {
        const detectedSchema = getEventSchema(event.type);
        if (detectedSchema) {
          schema = detectedSchema as z.ZodSchema<T>;
        }
      }
      
      return TypedCloudEvent.fromCloudEvent(event, schema!);
    } catch (error) {
      if (error instanceof CloudEventError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new CloudEventSerializationError(
          "Invalid JSON format for CloudEvent",
          error
        );
      }
      throw new CloudEventSerializationError(
        `Failed to parse CloudEvent from JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate against CloudEvents spec
   */
  validate(): boolean {
    try {
      CloudEventAttributesSchema.parse(this.event);
      if (this.schema && this.event.data !== undefined) {
        this.schema.parse(this.event.data);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation errors
   */
  getValidationErrors(): CloudEventValidationError | null {
    const attributesResult = CloudEventAttributesSchema.safeParse(this.event);
    if (!attributesResult.success) {
      return new CloudEventValidationError(
        "CloudEvent attributes validation failed",
        attributesResult.error.errors
      );
    }

    if (this.schema && this.event.data !== undefined) {
      const dataResult = this.schema.safeParse(this.event.data);
      if (!dataResult.success) {
        return new CloudEventValidationError(
          "CloudEvent data validation failed",
          dataResult.error.errors,
          "data"
        );
      }
    }

    return null;
  }

  /**
   * Get detailed validation information
   */
  getValidationInfo(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check attributes
    const attributesResult = CloudEventAttributesSchema.safeParse(this.event);
    if (!attributesResult.success) {
      errors.push(...attributesResult.error.errors.map(e => 
        `Attribute ${e.path.join(".") || "root"}: ${e.message}`
      ));
    }

    // Check data if schema provided
    if (this.schema && this.event.data !== undefined) {
      const dataResult = this.schema.safeParse(this.event.data);
      if (!dataResult.success) {
        errors.push(...dataResult.error.errors.map(e => 
          `Data ${e.path.join(".") || "root"}: ${e.message}`
        ));
      }
    } else if (this.event.data !== undefined && !this.schema) {
      warnings.push("Event has data but no schema provided for validation");
    }

    // Check for recommended fields
    if (!this.event.subject) {
      warnings.push("Subject field is recommended but not provided");
    }
    if (!this.event.time) {
      warnings.push("Time field is recommended but not provided");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Clone the event with optional modifications
   */
  clone(modifications?: Partial<CloudEventV1<T>>): TypedCloudEvent<T> {
    const clonedEvent = {
      ...this.event,
      ...modifications,
      id: modifications?.id || nanoid(),
      time: modifications?.time || new Date().toISOString(),
    };

    return new TypedCloudEvent(clonedEvent, this.schema);
  }

  /**
   * Check if event matches a specific type
   */
  isType(type: string | EventType): boolean {
    return this.event.type === type;
  }

  /**
   * Check if event is from a specific source
   */
  isFromSource(source: string | EventSource): boolean {
    return this.event.source === source;
  }

  /**
   * Check if event matches any of the provided types
   */
  isOneOfTypes(types: (string | EventType)[]): boolean {
    return types.includes(this.event.type);
  }

  /**
   * Check if event is from any of the provided sources
   */
  isFromOneOfSources(sources: (string | EventSource)[]): boolean {
    return sources.includes(this.event.source);
  }

  /**
   * Get event age in milliseconds
   */
  getAgeMs(): number {
    if (!this.event.time) {
      throw new CloudEventMissingFieldError("time", this.event.type);
    }
    return Date.now() - new Date(this.event.time).getTime();
  }

  /**
   * Check if event is older than specified milliseconds
   */
  isOlderThan(maxAgeMs: number): boolean {
    try {
      return this.getAgeMs() > maxAgeMs;
    } catch {
      return false; // If no time field, consider it not old
    }
  }

  /**
   * Get event size in bytes (approximate)
   */
  getSizeBytes(): number {
    return new TextEncoder().encode(this.toJSON()).length;
  }

  /**
   * Check if event exceeds size limit
   */
  exceedsSizeLimit(maxSizeBytes: number): boolean {
    return this.getSizeBytes() > maxSizeBytes;
  }

  /**
   * Add trace context for distributed tracing
   */
  addTraceContext(traceParent: string, traceState?: string): void {
    if (!traceParent || typeof traceParent !== "string") {
      throw new CloudEventValidationError(
        "traceParent must be a non-empty string",
        [{ code: "invalid_type", expected: "string", received: typeof traceParent, path: ["traceparent"], message: "Expected string" }]
      );
    }
    
    (this.event as Record<string, unknown>).traceparent = traceParent;
    if (traceState) {
      if (typeof traceState !== "string") {
        throw new CloudEventValidationError(
          "traceState must be a string",
          [{ code: "invalid_type", expected: "string", received: typeof traceState, path: ["tracestate"], message: "Expected string" }]
        );
      }
      (this.event as Record<string, unknown>).tracestate = traceState;
    }
  }

  /**
   * Get trace context
   */
  getTraceContext(): { traceParent?: string; traceState?: string } {
    return {
      traceParent: (this.event as Record<string, unknown>).traceparent as string | undefined,
      traceState: (this.event as Record<string, unknown>).tracestate as string | undefined,
    };
  }

  /**
   * Remove trace context
   */
  removeTraceContext(): void {
    delete (this.event as Record<string, unknown>).traceparent;
    delete (this.event as Record<string, unknown>).tracestate;
  }
}

// ============================================================================
// FACTORY METHODS FOR SPECIFIC EVENT TYPES
// ============================================================================

/**
 * Factory class for creating typed CloudEvents for specific event types
 */
export class TypedCloudEventFactory {
  /**
   * Create a TicketReceived event
   */
  static createTicketReceived<T>(
    data: T,
    source: EventSource = EventSources.INGESTION_SERVICE,
    attributes?: Partial<CloudEventV1<T>>
  ): TypedCloudEvent<T> {
    const schema = getEventSchema(EventTypes.TICKET_RECEIVED);
    return TypedCloudEvent.create({
      source,
      type: EventTypes.TICKET_RECEIVED,
      datacontenttype: "application/json",
      data,
      ...attributes,
    }, schema as z.ZodSchema<T>);
  }

  /**
   * Create an IntentClassified event
   */
  static createIntentClassified<T>(
    data: T,
    source: EventSource = EventSources.CLASSIFIER_SERVICE,
    attributes?: Partial<CloudEventV1<T>>
  ): TypedCloudEvent<T> {
    const schema = getEventSchema(EventTypes.INTENT_CLASSIFIED);
    return TypedCloudEvent.create({
      source,
      type: EventTypes.INTENT_CLASSIFIED,
      datacontenttype: "application/json",
      data,
      ...attributes,
    }, schema as z.ZodSchema<T>);
  }

  /**
   * Create a TicketRouted event
   */
  static createTicketRouted<T>(
    data: T,
    source: EventSource = EventSources.ROUTING_SERVICE,
    attributes?: Partial<CloudEventV1<T>>
  ): TypedCloudEvent<T> {
    const schema = getEventSchema(EventTypes.TICKET_ROUTED);
    return TypedCloudEvent.create({
      source,
      type: EventTypes.TICKET_ROUTED,
      datacontenttype: "application/json",
      data,
      ...attributes,
    }, schema as z.ZodSchema<T>);
  }

  /**
   * Create a ResponseGenerated event
   */
  static createResponseGenerated<T>(
    data: T,
    source: EventSource = EventSources.RESPONSE_SERVICE,
    attributes?: Partial<CloudEventV1<T>>
  ): TypedCloudEvent<T> {
    const schema = getEventSchema(EventTypes.RESPONSE_GENERATED);
    return TypedCloudEvent.create({
      source,
      type: EventTypes.RESPONSE_GENERATED,
      datacontenttype: "application/json",
      data,
      ...attributes,
    }, schema as z.ZodSchema<T>);
  }

  /**
   * Create a generic event with auto-detected schema
   */
  static createTypedEvent<T>(
    eventType: EventType,
    data: T,
    source: EventSource,
    attributes?: Partial<CloudEventV1<T>>
  ): TypedCloudEvent<T> {
    const schema = getEventSchema(eventType);
    
    if (!schema) {
      throw new CloudEventUnsupportedTypeError(
        eventType,
        Object.values(EventTypes)
      );
    }

    return TypedCloudEvent.create({
      source,
      type: eventType,
      datacontenttype: "application/json",
      data,
      ...attributes,
    }, schema as z.ZodSchema<T>);
  }

  /**
   * Create an event from a template
   */
  static fromTemplate<T>(
    template: Partial<CloudEventV1<T>>,
    data: T,
    schema?: z.ZodSchema<T>
  ): TypedCloudEvent<T> {
    if (!template.type) {
      throw new CloudEventMissingFieldError("type");
    }
    if (!template.source) {
      throw new CloudEventMissingFieldError("source");
    }

    // Auto-detect schema if not provided
    if (!schema && template.type) {
      const detectedSchema = getEventSchema(template.type);
      if (detectedSchema) {
        schema = detectedSchema as z.ZodSchema<T>;
      }
    }

    return TypedCloudEvent.create({
      datacontenttype: "application/json",
      ...template,
      data,
    }, schema);
  }

  /**
   * Create a batch of events with the same template
   */
  static createBatch<T>(
    template: Partial<CloudEventV1<T>>,
    dataItems: T[],
    schema?: z.ZodSchema<T>
  ): TypedCloudEvent<T>[] {
    return dataItems.map(data => 
      TypedCloudEventFactory.fromTemplate(template, data, schema)
    );
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate a raw CloudEvent object
 */
export function validateCloudEvent(
  event: Record<string, unknown>
): {
  isValid: boolean;
  errors: string[];
  validatedEvent?: CloudEventV1<unknown>;
} {
  const result = CloudEventAttributesSchema.safeParse(event);
  
  if (result.success) {
    return {
      isValid: true,
      errors: [],
      validatedEvent: result.data as CloudEventV1<unknown>,
    };
  }
  
  return {
    isValid: false,
    errors: result.error.errors.map(e => 
      `${e.path.join(".") || "root"}: ${e.message}`
    ),
  };
}

/**
 * Check if an object looks like a CloudEvent
 */
export function isCloudEvent(obj: unknown): obj is CloudEventV1<unknown> {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  
  const event = obj as Record<string, unknown>;
  return (
    typeof event.specversion === "string" &&
    typeof event.type === "string" &&
    typeof event.source === "string" &&
    typeof event.id === "string"
  );
}

/**
 * Create a CloudEvent from minimal parameters
 */
export function createSimpleCloudEvent(
  type: EventType,
  source: EventSource,
  data?: unknown,
  subject?: string
): TypedCloudEvent<unknown> {
  return TypedCloudEvent.create({
    type,
    source,
    data,
    subject,
    datacontenttype: "application/json",
  });
}

/**
 * Clone a CloudEvent with modifications
 */
export function cloneCloudEvent<T>(
  original: TypedCloudEvent<T>,
  modifications: Partial<CloudEventV1<T>>
): TypedCloudEvent<T> {
  return original.clone(modifications);
}

/**
 * Create an error event from an exception
 */
export function createErrorEvent(
  originalEvent: TypedCloudEvent<unknown>,
  error: Error,
  source: EventSource = EventSources.API_GATEWAY
): TypedCloudEvent<unknown> {
  const errorData = {
    error: {
      code: error.name || "UNKNOWN_ERROR",
      message: error.message,
      stack_trace: error.stack,
      retry_count: 0,
      max_retries: 3,
    },
    service_name: source,
    error_category: "unknown" as const,
    severity: "medium" as const,
    occurred_at: new Date().toISOString(),
  };

  const errorEvent = TypedCloudEventFactory.createTypedEvent(
    EventTypes.SERVICE_ERROR,
    errorData,
    source
  );

  // Maintain correlation
  const correlationId = originalEvent.getCorrelationId() || originalEvent.getAttribute("id");
  errorEvent.setCorrelationId(correlationId);
  errorEvent.setCausationId(originalEvent.getAttribute("id"));

  return errorEvent;
}